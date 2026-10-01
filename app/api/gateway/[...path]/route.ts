import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/platform-auth";
import { db } from "@/lib/db";
import { getTracer } from "@/lib/tracing";
import { CircuitBreaker } from "@/lib/circuit-breaker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gateway/[...path]
 * POST /api/gateway/[...path]
 * PUT /api/gateway/[...path]
 * DELETE /api/gateway/[...path]
 *
 * Unified API Gateway برای همه‌ی سرویس‌های اکوسیستم.
 *
 * مسیرها:
 * /api/gateway/nobatime/* https://nobatime.ir/api/v1/*
 * /api/gateway/catalog/* https://catalog.nobatime.ir/api/v1/*
 * /api/gateway/hesabyar/* https://hesabyar.ir/api/v1/*
 *
 * امکانات:
 * - Authentication (Bearer token از هوش)
 * - Rate limiting (۱۰۰ درخواست/دقیقه برای هر tenant)
 * - Distributed tracing (trace ID در headers)
 * - Logging همه‌ی درخواست‌ها
 * - Circuit breaker برای هر سرویس
 * - Tenant-based SSO token injection
 */

// ============ Service Routing ============
const SERVICE_ROUTES: Record<string, { baseUrl: string; ecosystemService: string }> = {
 nobatime: { baseUrl: "https://nobatime.ir", ecosystemService: "NOBATIME" },
 catalog: { baseUrl: "https://catalog.nobatime.ir", ecosystemService: "CATALOG" },
 hesabyar: { baseUrl: "https://hesabyar.ir", ecosystemService: "HESABYAR" },
 // mini-services داخلی هوش
 grpc: { baseUrl: "http://localhost:3004", ecosystemService: "GRPC" },
 marketing: { baseUrl: "http://localhost:3005", ecosystemService: "MARKETING" },
 analytics: { baseUrl: "http://localhost:3006", ecosystemService: "ANALYTICS" },
};

// ============ Rate Limiting (in-memory) ============
interface RateLimitEntry {
 count: number;
 windowStart: number;
}
const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000; // ۱ دقیقه
const RATE_LIMIT_MAX = 100;

function checkRateLimit(tenantId: string): { allowed: boolean; remaining: number } {
 const key = `gw:${tenantId}`;
 const now = Date.now();
 const entry = rateLimitStore.get(key);
 if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
 rateLimitStore.set(key, { count: 1, windowStart: now });
 return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
 }
 if (entry.count >= RATE_LIMIT_MAX) {
 return { allowed: false, remaining: 0 };
 }
 entry.count++;
 return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

// ============ Circuit Breakers per service ============
const circuitBreakers = new Map<string, CircuitBreaker>();
function getBreaker(service: string): CircuitBreaker {
 let breaker = circuitBreakers.get(service);
 if (!breaker) {
 breaker = new CircuitBreaker({
 failureThreshold: 5,
 resetTimeout: 30_000,
 monitoringPeriod: 60_000,
 });
 circuitBreakers.set(service, breaker);
 }
 return breaker;
}

// ============ Main Handler ============
async function handleGateway(req: NextRequest, pathSegments: string[]) {
 const tracer = getTracer();
 const trace = tracer.startTrace(`gateway:${req.method}`);
 tracer.addSpan(trace, "parse-path", { path: pathSegments.join("/") });

 // parse path
 if (pathSegments.length === 0) {
 return NextResponse.json(
 { success: false, error: "مسیر سرویس مشخص نشده — مثال: /api/gateway/nobatime/appointments" },
 { status: 400 }
 );
 }

 const serviceName = pathSegments[0];
 const serviceRoute = SERVICE_ROUTES[serviceName];
 if (!serviceRoute) {
 return NextResponse.json(
 {
 success: false,
 error: `سرویس نامعتبر: ${serviceName}`,
 availableServices: Object.keys(SERVICE_ROUTES),
 },
 { status: 404 }
 );
 }

 // ============ Authentication ============
 tracer.addSpan(trace, "auth");
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // ============ Rate Limiting ============
 tracer.addSpan(trace, "rate-limit");
 const rateLimit = checkRateLimit(user.tenantId);
 if (!rateLimit.allowed) {
 return NextResponse.json(
 { success: false, error: "محدودیت نرخ درخواست — کمی صبر کنید" },
 {
 status: 429,
 headers: {
 "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
 "X-RateLimit-Remaining": "0",
 "Retry-After": "60",
 },
 }
 );
 }

 // ============ Get SSO token for service ============
 const connection = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: serviceRoute.ecosystemService },
 },
 });

 const ssoToken = connection?.ssoToken;
 const isConnected = connection?.status === "CONNECTED" &&!!ssoToken;

 // ============ Forward to upstream service ============
 const upstreamPath = pathSegments.slice(1).join("/");
 const url = new URL(req.url);
 const upstreamUrl = `${serviceRoute.baseUrl}/api/v1/${upstreamPath}${url.search}`;

 tracer.addSpan(trace, "forward-request", { upstreamUrl, method: req.method });

 const breaker = getBreaker(serviceName);
 let upstreamResponse: Response | null = null;
 let breakerError: string | null = null;

 try {
 upstreamResponse = await breaker.execute(async () => {
 const headers: Record<string, string> = {
 Accept: "application/json",
 "X-Gateway-Source": "hoshhesab",
 "X-Gateway-Tenant": user.tenantId,
 "X-Gateway-User": user.id,
 "X-Gateway-Trace-Id": trace.id,
 "User-Agent": "HooshGateway/1.0",
 };
 if (ssoToken) {
 headers["Authorization"] = `Bearer ${ssoToken}`;
 }
 if (req.method!== "GET" && req.method!== "HEAD") {
 headers["Content-Type"] = req.headers.get("content-type") || "application/json";
 }

 const fetchOptions: RequestInit = {
 method: req.method,
 headers,
 signal: AbortSignal.timeout(15000),
 };
 if (req.method!== "GET" && req.method!== "HEAD") {
 fetchOptions.body = await req.text();
 }

 const res = await fetch(upstreamUrl, fetchOptions);
 if (!res.ok && res.status >= 500) {
 throw new Error(`upstream returned ${res.status}`);
 }
 return res;
 });
 } catch (err) {
 breakerError = err instanceof Error? err.message: "upstream error";
 console.error(`[gateway] ${serviceName} failed:`, err);
 }

 const traceResult = tracer.endTrace(trace);

 // ============ Build response ============
 const responseHeaders = new Headers({
 "X-Gateway-Service": serviceName,
 "X-Gateway-Connected": String(isConnected),
 "X-Gateway-Trace-Id": trace.id,
 "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
 "X-RateLimit-Remaining": String(rateLimit.remaining),
 "X-Trace-Duration-Ms": String(traceResult.durationMs),
 "X-Circuit-Breaker-State": breaker.getState(),
 });

 if (breakerError) {
 return NextResponse.json(
 {
 success: false,
 error: `سرویس ${serviceName} در دسترس نیست`,
 detail: breakerError,
 circuitBreakerState: breaker.getState(),
 traceId: trace.id,
 },
 { status: 503, headers: responseHeaders }
 );
 }

 if (!upstreamResponse) {
 return NextResponse.json(
 {
 success: false,
 error: `پاسخی از ${serviceName} دریافت نشد`,
 traceId: trace.id,
 },
 { status: 502, headers: responseHeaders }
 );
 }

 // ============ Logging ============
 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: `GATEWAY_${req.method}_${serviceName.toUpperCase()}`,
 entity: "Gateway",
 changes: JSON.stringify({
 service: serviceName,
 path: upstreamPath,
 method: req.method,
 status: upstreamResponse.status,
 durationMs: traceResult.durationMs,
 traceId: trace.id,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore log failures */
 }

 // pass through response
 const body = await upstreamResponse.text();
 const contentType = upstreamResponse.headers.get("content-type") || "application/json";
 responseHeaders.set("Content-Type", contentType);

 return new NextResponse(body, {
 status: upstreamResponse.status,
 headers: responseHeaders,
 });
}

// ============ HTTP Methods ============

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 const { path } = await ctx.params;
 return handleGateway(req, path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 const { path } = await ctx.params;
 return handleGateway(req, path);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 const { path } = await ctx.params;
 return handleGateway(req, path);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 const { path } = await ctx.params;
 return handleGateway(req, path);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
 const { path } = await ctx.params;
 return handleGateway(req, path);
}
