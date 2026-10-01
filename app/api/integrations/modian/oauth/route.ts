// ============ Modian OAuth 2.0 API — هوش ============
// جریان OAuth 2.0 برای اتصال به سامانه مودیان نسخه ۲
// GET: شروع جریان OAuth — هدایت به صفحه‌ی تأیید مودیان
// POST: پردازش callback — تبادل کد با توکن — سال مالیاتی ۱۴۰۵

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";
import { randomBytes, createHash } from "crypto";
import { getCurrentJalaliYear } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODIAN_AUTH_URL = process.env.MODIAN_AUTH_URL || "https://auth.tax.gov.ir";
const MODIAN_TOKEN_URL = process.env.MODIAN_TOKEN_URL || "https://api.tax.gov.ir/oauth2/token";

// سال مالیاتی جاری — محاسبه پویا
const FISCAL_YEAR = () => String(getCurrentJalaliYear());

interface StoredConfig {
 apiKeyEnc?: string;
 storeUrl?: string;
 method?: string;
 direct?: { username?: string; passwordEnc?: string; apiToken?: string; serverUrl?: string };
 oauth?: {
 clientId?: string;
 clientSecret?: string;
 redirectUri?: string;
 tokenEndpoint?: string;
 };
 [key: string]: unknown;
}

// GET /api/integrations/modian/oauth — شروع جریان OAuth
// هدایت کاربر به صفحه‌ی تأیید سامانه مودیان
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 // خواندن تنظیمات OAuth از Integration
 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type: "MODIAN" },
 });

 let clientId = process.env.MODIAN_CLIENT_ID?? "";
 let redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/integrations/modian/oauth`;
 let authUrl = MODIAN_AUTH_URL;
 let scope = "invoice:write invoice:read";

 if (integration) {
 try {
 const stored = JSON.parse(integration.config || "{}") as StoredConfig;
 if (stored.oauth?.clientId) clientId = stored.oauth.clientId;
 if (stored.oauth?.redirectUri) redirectUri = stored.oauth.redirectUri;
 } catch {
 // استفاده از پیش‌فرض
 }
 }

 if (!clientId) {
 return NextResponse.json(
 {
 success: false,
 error: "Client ID تنظیم نشده است. ابتدا تنظیمات OAuth را در بخش تنظیمات اتصال پیکربندی کنید.",
 errorCode: "OAUTH_NO_CLIENT_ID",
 },
 { status: 400 }
 );
 }

 // ساخت state برای جلوگیری از CSRF
 const state = Buffer.from(
 JSON.stringify({
 tenantId: tenant.id,
 ts: Date.now(),
 nonce: Math.random().toString(36).slice(2),
 fiscalYear: FISCAL_YEAR(),
 })
 ).toString("base64url");

 // ساخت PKCE challenge (SHA-256 از codeVerifier)
 const codeVerifier = randomBytes(32).toString('base64url');
 const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

 // ساخت URL تأیید
 const authorizeUrl = new URL(`${authUrl}/authorize`);
 authorizeUrl.searchParams.set("response_type", "code");
 authorizeUrl.searchParams.set("client_id", clientId);
 authorizeUrl.searchParams.set("redirect_uri", redirectUri);
 authorizeUrl.searchParams.set("scope", scope);
 authorizeUrl.searchParams.set("state", state);
 authorizeUrl.searchParams.set("code_challenge", codeChallenge);
 authorizeUrl.searchParams.set("code_challenge_method", "S256");

 // ذخیره codeVerifier برای استفاده در callback
 if (integration) {
 try {
 const stored = JSON.parse(integration.config || "{}") as StoredConfig;
 const updated = {
...stored,
 oauth: {
...stored.oauth,
 _codeVerifierEnc: encrypt(codeVerifier),
 },
 };
 await db.integration.update({
 where: { id: integration.id },
 data: { config: JSON.stringify(updated) },
 });
 } catch {
 // نادیده گرفتن خطا
 }
 }

 await auditLog({
 tenantId: tenant.id,
 action: "MODIAN_OAUTH_START",
 entity: "Integration",
 changes: { clientId, redirectUri, scope },
 req,
 });

 return NextResponse.json({
 success: true,
 authorizeUrl: authorizeUrl.toString(),
 state,
 fiscalYear: FISCAL_YEAR(),
 });
 } catch (error) {
 console.error("Modian OAuth GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در شروع جریان OAuth مودیان" },
 { status: 500 }
 );
 }
}

// POST /api/integrations/modian/oauth — پردازش callback
// تبادل کد تأیید با access_token و refresh_token
export async function POST(req: NextRequest) {
 try {
 const body = (await req.json().catch(() => ({}))) as {
 code?: string;
 state?: string;
 error?: string;
 error_description?: string;
 };

 // بررسی خطا از مودیان
 if (body.error) {
 const errorMessages: Record<string, string> = {
 access_denied: "دسترسی رد شد. شما اجازه‌ی اتصال به مودیان را ندادید.",
 invalid_scope: "محدوده‌ی درخواست‌شده نامعتبر است.",
 server_error: "خطا در سامانه مودیان. لطفاً بعداً تلاش کنید.",
 temporarily_unavailable: "سامانه مودیان موقتاً در دسترس نیست.",
 };
 const faMessage = errorMessages[body.error]?? `تأیید مودیان ناموفق بود: ${body.error}`;
 return NextResponse.json(
 {
 success: false,
 error: faMessage,
 description: body.error_description,
 errorCode: `OAUTH_${body.error.toUpperCase()}`,
 },
 { status: 400 }
 );
 }

 if (!body.code ||!body.state) {
 return NextResponse.json(
 { success: false, error: "کد تأیید یا state یافت نشد", errorCode: "OAUTH_MISSING_PARAMS" },
 { status: 400 }
 );
 }

 // رمزگشایی state
 let stateData: { tenantId?: string; ts?: number; nonce?: string; fiscalYear?: string };
 try {
 stateData = JSON.parse(
 Buffer.from(body.state, "base64url").toString("utf-8")
 ) as typeof stateData;
 } catch {
 return NextResponse.json(
 { success: false, error: "state نامعتبر است", errorCode: "OAUTH_INVALID_STATE" },
 { status: 400 }
 );
 }

 const tenantId = stateData.tenantId;
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "شناسه تنانت در state یافت نشد", errorCode: "OAUTH_NO_TENANT" },
 { status: 400 }
 );
 }

 // تأیید تنانت — SECURITY FIX: callback همیشه باید احراز هویت شده باشد
 // (قبلاً اگر getTenant خالی بود، جریان ادامه می‌یافت و توکن برای تنانت
 // ادعایی در state ذخیره می‌شد)
 const authTenant = await getTenant(req);
 if (!authTenant) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است — ابتدا وارد حساب خود شوید", errorCode: "OAUTH_UNAUTHORIZED" },
 { status: 401 }
 );
 }
 if (authTenant.id !== tenantId) {
 await auditLog({
 tenantId: authTenant.id,
 action: "MODIAN_OAUTH_TENANT_MISMATCH",
 entity: "Integration",
 changes: { claimedTenantId: tenantId, actualTenantId: authTenant.id },
 req,
 });
 return NextResponse.json(
 { success: false, error: "تنانت درخواست‌شده با تنانت احراز شده تطابق ندارد", errorCode: "OAUTH_TENANT_MISMATCH" },
 { status: 403 }
 );
 }

 // بررسی وجود تنانت
 const targetTenant = await db.tenant.findUnique({ where: { id: tenantId } });
 if (!targetTenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد", errorCode: "OAUTH_TENANT_NOT_FOUND" },
 { status: 404 }
 );
 }

 // بررسی freshness (5 دقیقه)
 if (stateData.ts && Date.now() - stateData.ts > 5 * 60 * 1000) {
 return NextResponse.json(
 { success: false, error: "جریان OAuth منقضی شده است. لطفاً دوباره تلاش کنید.", errorCode: "OAUTH_EXPIRED" },
 { status: 400 }
 );
 }

 // خواندن تنظیمات OAuth
 const integration = await db.integration.findFirst({
 where: { tenantId, type: "MODIAN" },
 });

 let clientId = process.env.MODIAN_CLIENT_ID?? "";
 let clientSecret = process.env.MODIAN_CLIENT_SECRET?? "";
 let redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/integrations/modian/oauth`;
 let tokenUrl = MODIAN_TOKEN_URL;
 let codeVerifier: string | undefined;

 if (integration) {
 try {
 const stored = JSON.parse(integration.config || "{}") as StoredConfig & {
 oauth?: Record<string, string>;
 };
 if (stored.oauth?.clientId) clientId = stored.oauth.clientId;
 if (stored.oauth?.clientSecret) clientSecret = stored.oauth.clientSecret;
 if (stored.oauth?.redirectUri) redirectUri = stored.oauth.redirectUri;
 if (stored.oauth?.tokenEndpoint) tokenUrl = stored.oauth.tokenEndpoint;
 if (stored.oauth?._codeVerifierEnc) codeVerifier = decrypt(stored.oauth._codeVerifierEnc);
 } catch {
 // استفاده از پیش‌فرض
 }
 }

 if (!clientId ||!clientSecret) {
 return NextResponse.json(
 { success: false, error: "Client ID یا Client Secret تنظیم نشده‌اند. ابتدا تنظیمات OAuth را پیکربندی کنید.", errorCode: "OAUTH_NO_CREDENTIALS" },
 { status: 400 }
 );
 }

 // تبادل کد با توکن
 const tokenParams: Record<string, string> = {
 grant_type: "authorization_code",
 code: body.code,
 client_id: clientId,
 client_secret: clientSecret,
 redirect_uri: redirectUri,
 };
 if (codeVerifier) {
 tokenParams.code_verifier = codeVerifier;
 }

 const tokenRes = await fetch(tokenUrl, {
 method: "POST",
 headers: {
 "Content-Type": "application/x-www-form-urlencoded",
 Accept: "application/json",
 },
 body: new URLSearchParams(tokenParams).toString(),
 signal: AbortSignal.timeout(30_000),
 });

 if (!tokenRes.ok) {
 const errText = await tokenRes.text().catch(() => "");
 console.error("Modian OAuth token exchange error:", tokenRes.status, errText.slice(0, 500));

 const statusMessages: Record<number, string> = {
 400: "پارامترهای درخواست نامعتبر است. لطفاً دوباره جریان OAuth را شروع کنید.",
 401: "Client ID یا Client Secret نامعتبر است.",
 403: "دسترسی به توکن مودیان رد شد.",
 };

 return NextResponse.json(
 {
 success: false,
 error: statusMessages[tokenRes.status]?? `تبادل توکن ناموفق بود (HTTP ${tokenRes.status})`,
 errorCode: "OAUTH_TOKEN_EXCHANGE_FAILED",
 },
 { status: 502 }
 );
 }

 const tokenData = (await tokenRes.json().catch(() => null)) as {
 access_token?: string;
 refresh_token?: string;
 token_type?: string;
 expires_in?: number;
 scope?: string;
 } | null;

 if (!tokenData?.access_token) {
 return NextResponse.json(
 { success: false, error: "توکن دسترسی از مودیان دریافت نشد", errorCode: "OAUTH_NO_ACCESS_TOKEN" },
 { status: 502 }
 );
 }

 // ذخیره توکن‌ها به‌صورت رمزنگاری‌شده
 const tokenPayload = JSON.stringify({
 accessToken: tokenData.access_token,
 refreshToken: tokenData.refresh_token?? "",
 tokenType: tokenData.token_type?? "Bearer",
 expiresIn: tokenData.expires_in?? 3600,
 scope: tokenData.scope?? "",
 obtainedAt: new Date().toISOString(),
 fiscalYear: FISCAL_YEAR(),
 });

 if (integration) {
 let prev: StoredConfig = {};
 try {
 prev = JSON.parse(integration.config || "{}") as StoredConfig;
 } catch {
 prev = {};
 }

 const merged: StoredConfig = {
...prev,
 apiKeyEnc: encrypt(tokenPayload),
 method: prev.method?? "direct",
 oauth: {
 clientId,
 clientSecret,
 redirectUri,
 tokenEndpoint: tokenUrl,
 },
 };

 // حذف _codeVerifierEnc موقت
 if (merged.oauth && "_codeVerifierEnc" in merged.oauth) {
 delete (merged.oauth as Record<string, unknown>)._codeVerifierEnc;
 }

 await db.integration.update({
 where: { id: integration.id },
 data: {
 config: JSON.stringify(merged),
 status: "CONNECTED",
 lastSync: new Date(),
 },
 });
 } else {
 await db.integration.create({
 data: {
 tenantId,
 type: "MODIAN",
 name: "modian",
 status: "CONNECTED",
 config: JSON.stringify({
 apiKeyEnc: encrypt(tokenPayload),
 method: "direct",
 oauth: { clientId, clientSecret, redirectUri, tokenEndpoint: tokenUrl },
 }),
 lastSync: new Date(),
 },
 });
 }

 // به‌روزرسانی تنانت
 await db.tenant.update({
 where: { id: tenantId },
 data: { modianEnabled: true, modianLastSync: new Date() },
 });

 await auditLog({
 tenantId,
 action: "MODIAN_OAUTH_SUCCESS",
 entity: "Integration",
 changes: {
 tokenObtained: true,
 expiresIn: tokenData.expires_in,
 scope: tokenData.scope,
 fiscalYear: FISCAL_YEAR(),
 },
 req,
 });

 return NextResponse.json({
 success: true,
 message: "اتصال OAuth به سامانه مودیان با موفقیت برقرار شد",
 expiresIn: tokenData.expires_in,
 fiscalYear: FISCAL_YEAR(),
 });
 } catch (error) {
 console.error("Modian OAuth POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش callback OAuth مودیان" },
 { status: 500 }
 );
 }
}
