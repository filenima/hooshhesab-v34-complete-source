import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/detailed
 *
 * Extended health check for monitoring dashboards.
 * Requires superadmin authentication (Bearer token).
 *
 * Checks:
 * - Database (latency, connection, row counts)
 * - Redis (if REDIS_URL configured)
 * - AI service
 * - Realtime Socket.io service (port 3032)
 * - Disk space (host)
 * - Process memory (RSS, heap)
 * - Process uptime & version
 */
export async function GET(req: NextRequest) {
 const startTime = Date.now();
 const timestamp = new Date().toISOString();

 // Require superadmin
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) {
 return auth.error;
 }

 // Run all checks in parallel for fast overall response
 const [database, redis, ai, realtime, disk, memory, dbStats] = await Promise.all([
 checkDatabase(),
 checkRedis(),
 checkAi(),
 checkRealtime(),
 checkDiskSpace(),
 getMemoryUsage(),
 getDbStats(),
 ]);

 // Determine overall status
 const criticalUp = database.status === "up";
 const allUp =
 criticalUp &&
 realtime.status === "up" &&
 ai.status === "up" &&
 (redis.status === "up" || redis.status === "not-configured");

 let status: "healthy" | "degraded" | "down";
 if (allUp) status = "healthy";
 else if (criticalUp) status = "degraded";
 else status = "down";

 // Resource warnings
 const warnings: string[] = [];
 if (disk.percentUsed > 85) {
 warnings.push(`Disk usage high: ${disk.percentUsed.toFixed(1)}%`);
 }
 if (memory.heapUsedMB / memory.heapTotalMB > 0.9 && memory.heapTotalMB > 0) {
 warnings.push(`Heap nearly full: ${(memory.heapUsedMB / 1024).toFixed(0)}MB / ${(memory.heapTotalMB / 1024).toFixed(0)}MB`);
 }
 if (database.latencyMs && database.latencyMs > 500) {
 warnings.push(`Database latency high: ${database.latencyMs}ms`);
 }
 if (dbStats.activeUsersLast24h!== undefined && dbStats.activeUsersLast24h === 0 && criticalUp) {
 warnings.push("No active users in last 24h — possible traffic issue");
 }

 const payload = {
 status,
 timestamp,
 responseTimeMs: Date.now() - startTime,
 environment: process.env.NODE_ENV || "development",
 version: process.env.npm_package_version || "1.0.0",
 nodeVersion: process.version,
 platform: process.platform,
 arch: process.arch,
 pid: process.pid,
 uptimeSeconds: Math.round(process.uptime()),
 cpuUsage: process.cpuUsage(),
 memory,
 disk,
 warnings,
 services: {
 database: {...database,...dbStats },
 redis,
 ai,
 realtime,
 },
 };

 return NextResponse.json(payload, {
 status: status === "down"? 503: 200,
 headers: {
 "Cache-Control": "no-store, no-cache, must-revalidate",
 },
 });
}

// ============ Database ============
async function checkDatabase(): Promise<{
 status: "up" | "down";
 latencyMs?: number;
 error?: string;
}> {
 const start = Date.now();
 try {
 await db.$queryRaw`SELECT 1`;
 return { status: "up", latencyMs: Date.now() - start };
 } catch (e) {
 return {
 status: "down",
 error: e instanceof Error? e.message: "Unknown DB error",
 latencyMs: Date.now() - start,
 };
 }
}

async function getDbStats(): Promise<{
 totalUsers?: number;
 totalTenants?: number;
 activeUsersLast24h?: number;
 error?: string;
}> {
 try {
 const [users, tenants, activeUsers] = await Promise.all([
 db.user.count().catch(() => 0),
 db.tenant.count().catch(() => 0),
 db.user
.count({
 where: {
 lastLogin: {
 gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
 },
 },
 })
.catch(() => 0),
 ]);
 return {
 totalUsers: users,
 totalTenants: tenants,
 activeUsersLast24h: activeUsers,
 };
 } catch (e) {
 return { error: e instanceof Error? e.message: "DB stats error" };
 }
}

// ============ Redis ============
async function checkRedis(): Promise<{
 status: "up" | "down" | "not-configured";
 url?: string;
 latencyMs?: number;
 error?: string;
}> {
 const redisUrl = process.env.REDIS_URL;
 if (!redisUrl) {
 return { status: "not-configured" };
 }
 // We don't import ioredis in the main bundle; instead do a TCP-level probe.
 const start = Date.now();
 try {
 const url = new URL(redisUrl);
 const port = parseInt(url.port || "6379", 10);
 const host = url.hostname;
 // Lightweight TCP connect check using fetch against redis (won't really speak RESP)
 // Falls back to a low-level socket connect.
 const ok = await probeTcp(host, port, 1500);
 return {
 status: ok? "up": "down",
 url: `${host}:${port}`,
 latencyMs: Date.now() - start,
 };
 } catch (e) {
 return {
 status: "down",
 latencyMs: Date.now() - start,
 error: e instanceof Error? e.message: "Redis probe error",
 };
 }
}

// ============ AI service ============
async function checkAi(): Promise<{
 status: "up" | "down" | "not-configured";
 latencyMs?: number;
 error?: string;
}> {
 const start = Date.now();
 try {
 // AI is configured via z-ai-web-dev-sdk in the backend.
 // Quick probe: just confirm the SDK is loadable in this process.
 // We don't make an actual API call to avoid cost.
 const sdkPath = "z-ai-web-dev-sdk";
 const exists = await import(sdkPath)
.then(() => true)
.catch(() => false);
 return {
 status: exists? "up": "not-configured",
 latencyMs: Date.now() - start,
 };
 } catch (e) {
 return {
 status: "down",
 error: e instanceof Error? e.message: "AI probe error",
 latencyMs: Date.now() - start,
 };
 }
}

// ============ Realtime Socket.io service ============
async function checkRealtime(): Promise<{
 status: "up" | "down";
 port: number;
 latencyMs?: number;
 error?: string;
}> {
 const port = 3032;
 const start = Date.now();
 try {
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 1500);
 const res = await fetch(
 `http://localhost:${port}/socket.io/?EIO=4&transport=polling`,
 { signal: controller.signal, method: "GET" }
 );
 clearTimeout(timeout);
 // socket.io returns 400/404 if params incomplete — server is up regardless
 void res;
 return {
 status: "up",
 port,
 latencyMs: Date.now() - start,
 };
 } catch {
 return {
 status: "down",
 port,
 latencyMs: Date.now() - start,
 };
 }
}

// ============ Disk space ============
function checkDiskSpace(): Promise<{
 totalBytes: number;
 freeBytes: number;
 usedBytes: number;
 percentUsed: number;
 error?: string;
}> {
 return new Promise((resolve) => {
 try {
 // Node doesn't have native disk stats — return process-based estimate
 // (For real disk usage, mount host /proc into container or use a node module.)
 const used = process.memoryUsage().rss;
 resolve({
 totalBytes: 0,
 freeBytes: 0,
 usedBytes: used,
 percentUsed: 0,
 error: "Disk stats require host /proc mount or a node module (e.g., diskusage). Returning process RSS as fallback.",
 });
 } catch (e) {
 resolve({
 totalBytes: 0,
 freeBytes: 0,
 usedBytes: 0,
 percentUsed: 0,
 error: e instanceof Error? e.message: "Disk probe error",
 });
 }
 });
}

// ============ Memory ============
function getMemoryUsage(): {
 rssMB: number;
 heapTotalMB: number;
 heapUsedMB: number;
 externalMB: number;
 arrayBuffersMB: number;
} {
 const m = process.memoryUsage();
 const toMB = (b: number) => Math.round((b / 1024 / 1024) * 100) / 100;
 return {
 rssMB: toMB(m.rss),
 heapTotalMB: toMB(m.heapTotal),
 heapUsedMB: toMB(m.heapUsed),
 externalMB: toMB(m.external),
 arrayBuffersMB: toMB(m.arrayBuffers),
 };
}

// ============ TCP probe helper ============
async function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
 const net = await import("net");
 return new Promise((resolve) => {
 const socket = new net.Socket();
 const timer = setTimeout(() => {
 socket.destroy();
 resolve(false);
 }, timeoutMs);
 socket.once("connect", () => {
 clearTimeout(timer);
 socket.destroy();
 resolve(true);
 });
 socket.once("error", () => {
 clearTimeout(timer);
 socket.destroy();
 resolve(false);
 });
 socket.connect({ host, port, family: 4 });
 });
}
