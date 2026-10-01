import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import crypto from "crypto";

export const runtime = "nodejs";

const NOBATIME_AUTH_URL = "https://nobatime.ir/oauth/authorize";
const NOBATIME_TOKEN_URL = "https://nobatime.ir/oauth/token";
const NOBATIME_USER_URL = "https://nobatime.ir/api/user";
const NOBATIME_BASE_URL = "https://nobatime.ir";

interface OAuthState {
 userId: string;
 tenantId: string;
 nonce: string;
 createdAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 دقیقه

function getJwtSecret(): string {
 const secret = process.env.JWT_SECRET;
 if (!secret) {
 throw new Error("JWT_SECRET env variable is required");
 }
 return secret;
}

/**
 * تولید state رمزنگاری‌شده برای OAuth (CSRF protection).
 * با AES-256-GCM و کلید JWT_SECRET.
 */
function encodeState(state: OAuthState): string {
 const secret = getJwtSecret();
 const key = crypto.createHash("sha256").update(secret).digest();
 const iv = crypto.randomBytes(12);
 const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
 const json = JSON.stringify(state);
 const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
 const tag = cipher.getAuthTag();
 return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decodeState(raw: string): OAuthState | null {
 try {
 const secret = getJwtSecret();
 const key = crypto.createHash("sha256").update(secret).digest();
 const buf = Buffer.from(raw, "base64url");
 if (buf.length < 12 + 16) return null;
 const iv = buf.subarray(0, 12);
 const tag = buf.subarray(12, 28);
 const encrypted = buf.subarray(28);
 const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
 decipher.setAuthTag(tag);
 const decrypted = Buffer.concat([
 decipher.update(encrypted),
 decipher.final(),
 ]).toString("utf8");
 const state = JSON.parse(decrypted) as OAuthState;
 if (Date.now() - state.createdAt > STATE_TTL_MS) return null;
 return state;
 } catch {
 return null;
 }
}

/**
 * GET /api/ecosystem/oauth/nobatime
 * - اگر NOBATIME_CLIENT_ID تنظیم شده: 302 redirect به authorization URL
 * - در غیر این صورت: fallback به mock SSO (توسعه/دمو)
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 const token =
 authHeader?.startsWith("Bearer ")
? authHeader.substring(7)
: new URL(req.url).searchParams.get("token") || "";
 const payload = token? verifyToken(token): null;
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const clientId = process.env.NOBATIME_CLIENT_ID;
 const redirectUri =
 process.env.NOBATIME_REDIRECT_URI ||
 `${new URL(req.url).origin}/api/ecosystem/oauth/callback`;
 const scope = "bookings:read bookings:write profile:read";

 // ---- حالت واقعی: OAuth 2.0 ----
 if (clientId) {
 const state = encodeState({
 userId: user.id,
 tenantId: user.tenantId,
 nonce: crypto.randomBytes(8).toString("hex"),
 createdAt: Date.now(),
 });

 const authUrl = new URL(NOBATIME_AUTH_URL);
 authUrl.searchParams.set("response_type", "code");
 authUrl.searchParams.set("client_id", clientId);
 authUrl.searchParams.set("redirect_uri", redirectUri);
 authUrl.searchParams.set("scope", scope);
 authUrl.searchParams.set("state", state);

 // اگر درخواست از نوع API است (Accept: application/json)، URL را برگردان
 const accept = req.headers.get("accept") || "";
 if (accept.includes("application/json")) {
 return NextResponse.json({
 success: true,
 data: {
 mode: "live",
 authorizationUrl: authUrl.toString(),
 },
 });
 }
 // در غیر این صورت، مستقیماً redirect کن
 return NextResponse.redirect(authUrl);
 }

 // ---- حالت fallback: mock SSO ----
 const ssoToken = crypto.randomBytes(32).toString("hex");
 const externalId = `nobatime_mock_${Date.now()}`;
 await db.ecosystemConnection.upsert({
 where: {
 tenantId_service: {
 tenantId: user.tenantId,
 service: "NOBATIME",
 },
 },
 update: {
 status: "CONNECTED",
 ssoToken,
 externalId,
 connectedAt: new Date(),
 config: JSON.stringify({
 mode: "mock",
 mockUser: {
 id: externalId,
 name: "کاربر نوباتایم (دمو)",
 email: "demo@nobatime.ir",
 },
 connectedAt: new Date().toISOString(),
 }),
 },
 create: {
 tenantId: user.tenantId,
 service: "NOBATIME",
 status: "CONNECTED",
 ssoToken,
 externalId,
 connectedAt: new Date(),
 config: JSON.stringify({
 mode: "mock",
 mockUser: {
 id: externalId,
 name: "کاربر نوباتایم (دمو)",
 email: "demo@nobatime.ir",
 },
 connectedAt: new Date().toISOString(),
 }),
 },
 });

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "OAUTH_NOBATIME_MOCK",
 entity: "EcosystemConnection",
 entityId: externalId,
 changes: JSON.stringify({ service: "NOBATIME", mode: "mock" }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 const loginUrl = `${NOBATIME_BASE_URL}/sso?token=${ssoToken}&mock=1`;

 return NextResponse.json({
 success: true,
 data: {
 mode: "mock",
 loginUrl,
 message:
 "اتصال به نوباتایم در حالت دمو (OAuth پیکربندی نشده — NOBATIME_CLIENT_ID تنظیم کنید)",
 },
 });
 } catch (error) {
 console.error("Nobatime OAuth initiate error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در شروع OAuth" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/ecosystem/oauth/nobatime
 * body: { code, state }
 * - تعویض authorization code با access token
 * - ذخیره توکن در EcosystemConnection
 * - فقط در حالت OAuth واقعی کار می‌کند
 */
export async function POST(req: NextRequest) {
 try {
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

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const code = String(body?.code || "");
 const stateRaw = String(body?.state || "");

 if (!code ||!stateRaw) {
 return NextResponse.json(
 { success: false, error: "code و state الزامی است" },
 { status: 400 }
 );
 }

 const state = decodeState(stateRaw);
 if (!state || state.userId!== user.id || state.tenantId!== user.tenantId) {
 return NextResponse.json(
 { success: false, error: "state نامعتبر یا منقضی" },
 { status: 400 }
 );
 }

 const clientId = process.env.NOBATIME_CLIENT_ID;
 const clientSecret = process.env.NOBATIME_CLIENT_SECRET;
 const redirectUri =
 process.env.NOBATIME_REDIRECT_URI ||
 `${new URL(req.url).origin}/api/ecosystem/oauth/callback`;

 if (!clientId ||!clientSecret) {
 return NextResponse.json(
 {
 success: false,
 error: "OAuth نوباتایم پیکربندی نشده است",
 },
 { status: 503 }
 );
 }

 // تعویض code با access_token
 const tokenRes = await fetch(NOBATIME_TOKEN_URL, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams({
 grant_type: "authorization_code",
 code,
 client_id: clientId,
 client_secret: clientSecret,
 redirect_uri: redirectUri,
 }),
 });

 if (!tokenRes.ok) {
 const errText = await tokenRes.text().catch(() => "");
 console.error("Nobatime token exchange failed:", tokenRes.status, errText);
 return NextResponse.json(
 { success: false, error: "تعویض کد ناموفق بود" },
 { status: 502 }
 );
 }

 const tokenJson = (await tokenRes.json()) as {
 access_token?: string;
 refresh_token?: string;
 expires_in?: number;
 token_type?: string;
 scope?: string;
 };

 const accessToken = tokenJson.access_token;
 if (!accessToken) {
 return NextResponse.json(
 { success: false, error: "توکن دسترسی دریافت نشد" },
 { status: 502 }
 );
 }

 // دریافت اطلاعات کاربر از Nobatime
 let externalUserInfo: { id?: string; name?: string; email?: string } = {};
 try {
 const userRes = await fetch(NOBATIME_USER_URL, {
 headers: { Authorization: `Bearer ${accessToken}` },
 });
 if (userRes.ok) {
 externalUserInfo = (await userRes.json()) as {
 id?: string;
 name?: string;
 email?: string;
 };
 }
 } catch {
 /* ignore — حتی بدون اطلاعات کاربر، اتصال را ثبت می‌کنیم */
 }

 // ذخیره اتصال
 const connection = await db.ecosystemConnection.upsert({
 where: {
 tenantId_service: {
 tenantId: user.tenantId,
 service: "NOBATIME",
 },
 },
 update: {
 status: "CONNECTED",
 ssoToken: accessToken,
 externalId: externalUserInfo.id || `nobatime_${Date.now()}`,
 connectedAt: new Date(),
 config: JSON.stringify({
 mode: "live",
 accessToken,
 refreshToken: tokenJson.refresh_token || null,
 expiresIn: tokenJson.expires_in || null,
 tokenType: tokenJson.token_type || "Bearer",
 scope: tokenJson.scope || "",
 externalUser: externalUserInfo,
 connectedAt: new Date().toISOString(),
 }),
 },
 create: {
 tenantId: user.tenantId,
 service: "NOBATIME",
 status: "CONNECTED",
 ssoToken: accessToken,
 externalId: externalUserInfo.id || `nobatime_${Date.now()}`,
 connectedAt: new Date(),
 config: JSON.stringify({
 mode: "live",
 accessToken,
 refreshToken: tokenJson.refresh_token || null,
 expiresIn: tokenJson.expires_in || null,
 tokenType: tokenJson.token_type || "Bearer",
 scope: tokenJson.scope || "",
 externalUser: externalUserInfo,
 connectedAt: new Date().toISOString(),
 }),
 },
 });

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "OAUTH_NOBATIME_CONNECTED",
 entity: "EcosystemConnection",
 entityId: connection.id,
 changes: JSON.stringify({
 service: "NOBATIME",
 mode: "live",
 externalUser: externalUserInfo,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 connectionId: connection.id,
 externalUser: externalUserInfo,
 loginUrl: `${NOBATIME_BASE_URL}/sso?token=${accessToken}`,
 },
 message: "اتصال به نوباتایم با موفقیت برقرار شد",
 });
 } catch (error) {
 console.error("Nobatime OAuth callback (POST) error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش callback" },
 { status: 500 }
 );
 }
}
