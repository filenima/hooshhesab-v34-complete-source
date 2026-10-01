// ============ Modian Config API — هوش ============
// پیکربندی اتصال به سامانه مودیان — سه روش اتصال + ویژگی‌های نسخه ۲
// GET: دریافت پیکربندی فعلی (کلیدها ماسک‌شده) — پرکردن فرم سمت کلاینت
// POST: ذخیره پیکربندی (سه روش: direct, tsp, middleware) — اعتبارسنجی اختصاصی هر روش
// DELETE: قطع اتصال

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";
import { logger, setLogContext } from "@/lib/logger";
import {
  isValidCertificatePem,
  isValidPrivateKeyPem,
  validateKeyPair,
  parseCertificate,
} from "@/lib/modian-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ----- رابط‌های پیکربندی اختصاصی هر روش -----
interface DirectConfig {
 username?: string;
 passwordEnc?: string;
 apiToken?: string;
 serverUrl?: string;
 /** شناسه یکتای حافظه مالیاتی (۶ کاراکتر) — اتصال رسمی نسخه ۲ */
 memoryId?: string;
 /** گواهی X.509 PEM — رمزنگاری‌شده AES-256-GCM */
 certificatePemEnc?: string;
 /** کلید خصوصی PKCS#8 PEM — رمزنگاری‌شده AES-256-GCM */
 privateKeyPemEnc?: string;
 /** اطلاعات گواهی برای نمایش (بدون محتوای حساس) */
 certInfo?: {
   serialNumber?: string;
   subject?: string;
   validTo?: string;
 };
}

interface TspConfig {
 provider?: string;
 apiKeyEnc?: string;
 callbackUrl?: string;
}

interface MiddlewareConfig {
 middlewareType?: string;
 connectionStringEnc?: string;
 apiEndpoint?: string;
}

// ----- رابط پیکربندی کلی -----
interface StoredConfig {
 method?: string; // direct | tsp | middleware
 bookletId?: string;
 /** شناسه ملی فروشنده (شرکت) — برای فیلد taxid صورتحساب مودیان */
 sellerTaxId?: string;

 // محیط ارسال: TEST (آزمایشی — بدون اثر حقوقی) یا LIVE (واقعی)
 env?: "TEST" | "LIVE";
 // آدرس API محیط آزمایشی (فقط در env=TEST استفاده می‌شود)
 testUrl?: string;

 // روش مستقیم
 direct?: DirectConfig;

 // شرکت معتمد
 tsp?: TspConfig;

 // نرم‌افزار واسط
 middleware?: MiddlewareConfig;

 // رمزنگاری‌شده قدیمی (backward compat)
 apiKeyEnc?: string;
 storeUrl?: string;

 // ویژگی‌های نسخه ۲
 oauth?: {
 clientId?: string;
 clientSecret?: string;
 redirectUri?: string;
 tokenEndpoint?: string;
 };
 batch?: {
 enabled?: boolean;
 size?: number;
 schedule?: string;
 };
 webhook?: {
 enabled?: boolean;
 url?: string;
 events?: string[];
 };
}

// ماسک کردن رشته: نمایش فقط ۴ کاراکتر آخر
function maskSecret(val?: string): string {
 if (!val) return "";
 if (val.length <= 4) return "****";
 return "****" + val.slice(-4);
}

// آیا کاربر رمز/کلید جدیدی در این درخواست وارد کرده است؟ (برای audit)
function providedSecret(
 method: string,
 body: { direct?: { password?: string }; tsp?: { apiKey?: string }; middleware?: { connectionString?: string } }
): boolean {
 if (method === "direct") return Boolean(body.direct?.password?.trim());
 if (method === "tsp") return Boolean(body.tsp?.apiKey?.trim());
 if (method === "middleware") return Boolean(body.middleware?.connectionString?.trim());
 return false;
}

// ============ GET ============
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type: "MODIAN" },
 });

 if (!integration) {
 return NextResponse.json({
 success: true,
 config: {
 hasApiKey: false,
 method: "direct",
 bookletId: "",
 sellerTaxId: "",
 env: "LIVE",
 testUrl: "",
 direct: {
 username: "",
 memoryId: "",
 hasCertificate: false,
 hasPrivateKey: false,
 certInfo: null,
 hasPassword: false,
 apiToken: "",
 serverUrl: "",
 },
 tsp: { provider: "malitor", hasApiKey: false, callbackUrl: "" },
 middleware: { middlewareType: "dotnet", hasConnectionString: false, apiEndpoint: "" },
 oauth: null,
 batch: null,
 webhook: null,
 },
 });
 }

 let stored: StoredConfig = {};
 try {
 stored = JSON.parse(integration.config || "{}") as StoredConfig;
 } catch {
 stored = {};
 }

 // مهاجرت از ساختار قدیمی apiKeyEnc به ساختار جدید
 if (stored.apiKeyEnc &&!stored.direct &&!stored.tsp &&!stored.middleware) {
 try {
 const legacyCreds = JSON.parse(decrypt(stored.apiKeyEnc)) as Record<string, string>;
 if (stored.method === "direct" ||!stored.method) {
 stored.direct = {
 username: legacyCreds.username?? "",
 passwordEnc: legacyCreds.password? encrypt(legacyCreds.password): undefined,
 apiToken: legacyCreds.apiToken?? "",
 serverUrl: stored.storeUrl?? legacyCreds.serverUrl?? "",
 };
 } else if (stored.method === "tsp") {
 stored.tsp = {
 provider: legacyCreds.provider?? "malitor",
 apiKeyEnc: legacyCreds.apiKey? encrypt(legacyCreds.apiKey): undefined,
 callbackUrl: stored.storeUrl?? "",
 };
 } else if (stored.method === "middleware") {
 stored.middleware = {
 middlewareType: legacyCreds.type?? "dotnet",
 connectionStringEnc: legacyCreds.connectionString? encrypt(legacyCreds.connectionString): undefined,
 apiEndpoint: legacyCreds.apiEndpoint?? "",
 };
 }
 } catch {
 // رمزگشایی ناموفق — نادیده گرفتن
 }
 }

 return NextResponse.json({
 success: true,
 config: {
 hasApiKey: Boolean(stored.apiKeyEnc) || Boolean(stored.direct?.passwordEnc) || Boolean(stored.tsp?.apiKeyEnc) || Boolean(stored.middleware?.connectionStringEnc) || Boolean(stored.direct?.certificatePemEnc && stored.direct?.privateKeyPemEnc),
 method: stored.method?? "direct",
 bookletId: stored.bookletId?? "",
 sellerTaxId: stored.sellerTaxId?? "",

 // محیط ارسال (TEST/LIVE) + آدرس محیط آزمایشی
 env: stored.env === "TEST"? "TEST": "LIVE",
 testUrl: stored.testUrl?? "",

 // روش مستقیم — مقادیر ماسک‌شده
 direct: {
 username: stored.direct?.username?? "",
 // v2: شناسه حافظه + گواهی + کلید
 memoryId: stored.direct?.memoryId?? "",
 hasCertificate: Boolean(stored.direct?.certificatePemEnc),
 hasPrivateKey: Boolean(stored.direct?.privateKeyPemEnc),
 certInfo: stored.direct?.certInfo?? null,
 hasPassword: Boolean(stored.direct?.passwordEnc),
 apiToken: maskSecret(stored.direct?.apiToken),
 serverUrl: stored.direct?.serverUrl?? stored.storeUrl?? "",
 },

 // شرکت معتمد — مقادیر ماسک‌شده
 tsp: {
 provider: stored.tsp?.provider?? "malitor",
 hasApiKey: Boolean(stored.tsp?.apiKeyEnc),
 callbackUrl: stored.tsp?.callbackUrl?? "",
 },

 // نرم‌افزار واسط — مقادیر ماسک‌شده
 middleware: {
 middlewareType: stored.middleware?.middlewareType?? "dotnet",
 hasConnectionString: Boolean(stored.middleware?.connectionStringEnc),
 apiEndpoint: stored.middleware?.apiEndpoint?? "",
 },

 // ویژگی‌های نسخه ۲
 oauth: stored.oauth
? {
 clientId: stored.oauth.clientId?? "",
 redirectUri: stored.oauth.redirectUri?? "",
 tokenEndpoint: stored.oauth.tokenEndpoint?? "",
 hasClientSecret: Boolean(stored.oauth.clientSecret),
 }
: null,
 batch: stored.batch?? null,
 webhook: stored.webhook
? {
 enabled: stored.webhook.enabled?? false,
 url: stored.webhook.url?? "",
 events: stored.webhook.events?? [],
 }
: null,

 status: integration.status,
 lastSync: integration.lastSync?.toISOString()?? null,
 },
 });
 } catch (error) {
 console.error("Modian config GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پیکربندی مودیان" },
 { status: 500 }
 );
 }
}

// ============ POST ============
export async function POST(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const body = (await req.json().catch(() => ({}))) as {
 method?: string;
 bookletId?: string;
 /** شناسه ملی فروشنده (شرکت) — برای فیلد taxid صورتحساب مودیان */
 sellerTaxId?: string;

 // محیط ارسال — TEST (آزمایشی) یا LIVE (واقعی)
 env?: "TEST" | "LIVE";
 // آدرس API محیط آزمایشی (اختیاری — فقط در TEST)
 testUrl?: string;

 // روش مستقیم
 direct?: {
 username?: string;
 password?: string;
 apiToken?: string;
 serverUrl?: string;
 /** v2: شناسه یکتای حافظه مالیاتی (۶ کاراکتر) */
 memoryId?: string;
 /** v2: گواهی X.509 (PEM — محتوای فایل) */
 certificatePem?: string;
 /** v2: کلید خصوصی PKCS#8 (PEM — محتوای فایل) */
 privateKeyPem?: string;
 };

 // شرکت معتمد
 tsp?: {
 provider?: string;
 apiKey?: string;
 callbackUrl?: string;
 };

 // نرم‌افزار واسط
 middleware?: {
 middlewareType?: string;
 connectionString?: string;
 apiEndpoint?: string;
 };

 // پشتیبانی از ساختار قدیمی
 apiKey?: string;
 storeUrl?: string;

 // ویژگی‌های نسخه ۲
 oauth?: StoredConfig["oauth"];
 batch?: StoredConfig["batch"];
 webhook?: StoredConfig["webhook"];
 };

 const method = (body.method?? "direct") as string;
 const bookletId = (body.bookletId?? "").trim();
 const sellerTaxId = (body.sellerTaxId?? "").trim() || null; // شناسه ملی فروشنده
 const env = body.env === "TEST"? "TEST": "LIVE";
 const testUrl = (body.testUrl?? "").trim();

 // اعتبارسنجی آدرس محیط آزمایشی (اگر ارسال شده)
 if (env === "TEST" && testUrl) {
 try {
 new URL(testUrl);
 } catch {
 return NextResponse.json(
 { success: false, error: "آدرس محیط آزمایشی نامعتبر است" },
 { status: 400 }
 );
 }
 }

 // ----- اعتبارسنجی اختصاصی هر روش -----
 const validMethods = ["direct", "tsp", "middleware"];
 if (!validMethods.includes(method)) {
 return NextResponse.json(
 { success: false, error: "روش اتصال نامعتبر است" },
 { status: 400 }
 );
 }

 // FIX: پیکربندی قبلی برای «ذخیره مجدد بدون وارد کردن دوباره رمز» — کاربری که
 // فقط می‌خواهد محیط TEST/LIVE را عوض کند یا تنظیمات Batch/Webhook را تغییر دهد،
 // نباید مجبور شود رمز عبور/کلید را دوباره تایپ کند (قبلاً ۴۰۰ می‌گرفت).
 const existingIntegration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type: "MODIAN" },
 });
 let prevConfig: StoredConfig = {};
 if (existingIntegration) {
 try {
 prevConfig = JSON.parse(existingIntegration.config || "{}") as StoredConfig;
 } catch {
 prevConfig = {};
 }
 }

 // ساخت پیکربندی اختصاصی هر روش
 let newDirect: DirectConfig | undefined;
 let newTsp: TspConfig | undefined;
 let newMiddleware: MiddlewareConfig | undefined;
 let legacyApiKeyEnc: string | undefined;
 // وضعیت اتصال: فقط با اتصال کامل نسخه ۲ (حافظه+گواهی+کلید) CONNECTED
 let computedStatus = "PENDING";

 if (method === "direct") {
 const d = body.direct;

 // ===== مسیر رسمی نسخه ۲: شناسه حافظه + گواهی + کلید =====
 const providedMemoryId = d?.memoryId?.trim() ?? "";
 const memoryId = (providedMemoryId || prevConfig.direct?.memoryId || "").toUpperCase();
 const providedCert = (d?.certificatePem ?? "").trim();
 const providedKey = (d?.privateKeyPem ?? "").trim();

 // اعتبارسنجی شناسه حافظه (اگر ارسال شده)
 if (providedMemoryId && !/^[A-Za-z0-9]{6}$/.test(memoryId)) {
 return NextResponse.json(
 { success: false, error: "شناسه حافظه مالیاتی نامعتبر است — دقیقاً ۶ کاراکتر حرف/رقم (مثلاً A278W6)" },
 { status: 400 }
 );
 }

 // اعتبارسنجی گواهی (اگر ارسال شده)
 if (providedCert) {
 const certCheck = isValidCertificatePem(providedCert);
 if (!certCheck.ok) {
 return NextResponse.json(
 { success: false, error: `گواهی دیجیتال نامعتبر است: ${certCheck.error}` },
 { status: 400 }
 );
 }
 }

 // اعتبارسنجی کلید خصوصی (اگر ارسال شده)
 if (providedKey) {
 const keyCheck = isValidPrivateKeyPem(providedKey);
 if (!keyCheck.ok) {
 return NextResponse.json(
 { success: false, error: `کلید خصوصی نامعتبر است: ${keyCheck.error}` },
 { status: 400 }
 );
 }
 }

 // اعتبارسنجی جفت کلید+گواهی (هر دو ارسال شده‌اند)
 if (providedCert && providedKey) {
 try {
 validateKeyPair(providedKey, providedCert);
 } catch (err) {
 return NextResponse.json(
 { success: false, error: err instanceof Error ? err.message : "جفت کلید/گواهی نامعتبر است" },
 { status: 400 }
 );
 }
 }

 // رمزنگاری و ذخیره — اگر ارسال نشده باشند از قبلی حفظ می‌شود
 const reuseCertEnc = !providedCert ? prevConfig.direct?.certificatePemEnc : undefined;
 const finalCertPem = providedCert || (reuseCertEnc ? decrypt(reuseCertEnc) : "");

 // برای «اتصال کامل نسخه ۲» هر سه فیلد لازم است — اما ذخیره بدون کامل بودن هم
 // مجاز است (کاربر می‌خواهد مرحله‌ای پر کند) → فقط «علامت اتصال» بعداً چک می‌شود

 // اطلاعات گواهی برای نمایش (بدون محتوای حساس)
 let certInfo: DirectConfig["certInfo"];
 if (finalCertPem) {
 try {
 const parsed = parseCertificate(finalCertPem);
 certInfo = {
 serialNumber: parsed.serialNumber,
 subject: parsed.subject.slice(0, 200),
 validTo: parsed.validTo.toISOString(),
 };
 } catch {
 certInfo = undefined;
 }
 }

 newDirect = {
 ...(prevConfig.direct ?? {}),
 username: d?.username?.trim() || prevConfig.direct?.username || "",
 memoryId: memoryId || undefined,
 certificatePemEnc: providedCert ? encrypt(providedCert) : (prevConfig.direct?.certificatePemEnc),
 privateKeyPemEnc: providedKey ? encrypt(providedKey) : (prevConfig.direct?.privateKeyPemEnc),
 certInfo: certInfo ?? prevConfig.direct?.certInfo,
 passwordEnc: prevConfig.direct?.passwordEnc, // legacy — نگه داشته می‌شود
 apiToken: d?.apiToken?.trim() || prevConfig.direct?.apiToken || "",
 // FIX(v4-مودیان/M): اگر فیلد serverUrl «ارسال نشده» باشد مقدار قبلی حفظ می‌شود
// (قبلاً با هر ذخیره‌ی جزئی پاک می‌شد)؛ ارسال رشته خالی = پاک‌کردن عمدی
 serverUrl: d?.serverUrl === undefined ? (prevConfig.direct?.serverUrl || "") : d.serverUrl.trim(),
 };

 // حذف فیلدهای خالی/تهی تا JSON تمیز بماند
 if (!newDirect.memoryId) delete newDirect.memoryId;
 if (!newDirect.certificatePemEnc) delete newDirect.certificatePemEnc;
 if (!newDirect.privateKeyPemEnc) delete newDirect.privateKeyPemEnc;
 if (!newDirect.passwordEnc) delete newDirect.passwordEnc;
 if (!newDirect.certInfo) delete newDirect.certInfo;

 // سازگاری قدیمی: اگر هیچ روش جدیدی تنظیم نشده، username/password قدیمی لازم است
 const hasV2Config = Boolean(newDirect.memoryId && newDirect.certificatePemEnc && newDirect.privateKeyPemEnc);
 const hasLegacyPassword = Boolean(newDirect.passwordEnc);
 if (!hasV2Config && !hasLegacyPassword) {
 // نه v2 و نه legacy — قبول فقط اگر کاربر لاگین نداشته باشد؟ → خطا روشن:
 if (providedMemoryId || providedCert || providedKey) {
 // کاربر شروع کرده ولی کامل نیست — ذخیره مرحله‌ای مجاز
 } else {
 return NextResponse.json(
 { success: false, error: "برای اتصال مودیان: شناسه حافظه + گواهی + کلید خصوصی (نسخه ۲) لازم است" },
 { status: 400 }
 );
 }
 }

 // اعتبارسنجی آدرس سرور
 if (d?.serverUrl?.trim()) {
 try {
 new URL(d.serverUrl.trim());
 } catch {
 return NextResponse.json(
 { success: false, error: "آدرس سرور نامعتبر است" },
 { status: 400 }
 );
 }
 }

 // وضعیت اتصال: فقط وقتی همه‌چیز نسخه ۲ کامل است CONNECTED — وگرنه PENDING
 computedStatus = Boolean(newDirect.memoryId && newDirect.certificatePemEnc && newDirect.privateKeyPemEnc) ? "CONNECTED" : "PENDING";
 legacyApiKeyEnc = prevConfig.apiKeyEnc;
 } else if (method === "tsp") {
 const t = body.tsp;
 const providedApiKey = t?.apiKey?.trim() ?? "";
 const reuseApiKeyEnc = !providedApiKey ? prevConfig.tsp?.apiKeyEnc : undefined;
 if (!providedApiKey && !reuseApiKeyEnc) {
 return NextResponse.json(
 { success: false, error: "کلید API شرکت معتمد الزامی است" },
 { status: 400 }
 );
 }
 // اعتبارسنجی آدرس Callback
 if (t?.callbackUrl?.trim()) {
 try {
 new URL(t.callbackUrl.trim());
 } catch {
 return NextResponse.json(
 { success: false, error: "آدرس Callback نامعتبر است" },
 { status: 400 }
 );
 }
 }
 newTsp = {
 provider: t?.provider || prevConfig.tsp?.provider || "malitor",
 apiKeyEnc: providedApiKey ? encrypt(providedApiKey) : reuseApiKeyEnc,
 callbackUrl: t?.callbackUrl?.trim() || "",
 };
 // backward compat
 legacyApiKeyEnc = providedApiKey
 ? encrypt(JSON.stringify({
 provider: newTsp.provider,
 apiKey: providedApiKey,
 }))
 : prevConfig.apiKeyEnc;
 } else if (method === "middleware") {
 const m = body.middleware;
 const providedConnStr = m?.connectionString?.trim() ?? "";
 const reuseConnStrEnc = !providedConnStr ? prevConfig.middleware?.connectionStringEnc : undefined;
 if (!providedConnStr && !reuseConnStrEnc) {
 return NextResponse.json(
 { success: false, error: "رشته اتصال الزامی است" },
 { status: 400 }
 );
 }
 if (m?.apiEndpoint?.trim()) {
 try {
 new URL(m.apiEndpoint.trim());
 } catch {
 return NextResponse.json(
 { success: false, error: "نقطه پایانی API نامعتبر است" },
 { status: 400 }
 );
 }
 }
 newMiddleware = {
 middlewareType: m?.middlewareType || prevConfig.middleware?.middlewareType || "dotnet",
 connectionStringEnc: providedConnStr ? encrypt(providedConnStr) : reuseConnStrEnc,
 apiEndpoint: m?.apiEndpoint?.trim() || "",
 };
 // backward compat
 legacyApiKeyEnc = providedConnStr
 ? encrypt(JSON.stringify({
 type: newMiddleware.middlewareType,
 connectionString: providedConnStr,
 apiEndpoint: newMiddleware.apiEndpoint,
 }))
 : prevConfig.apiKeyEnc;
 }

 // روش‌های tsp/middleware هنوز اتصال real-time ندارند → PENDING تا اتصال واقعی
 if (method !== "direct") computedStatus = "PENDING";

 // یافتن integration موجود
 const integration = existingIntegration;

 // ساخت پیکربندی کامل
 const newConfig: StoredConfig = {
 method,
 bookletId,
 sellerTaxId: sellerTaxId?? undefined,
 env,
 testUrl: testUrl || undefined,
 direct: newDirect,
 tsp: newTsp,
 middleware: newMiddleware,
 apiKeyEnc: legacyApiKeyEnc,
 storeUrl: method === "direct"? newDirect?.serverUrl: method === "tsp"? newTsp?.callbackUrl: undefined,
 oauth: body.oauth,
 batch: body.batch,
 webhook: body.webhook,
 };

 if (integration) {
 let prev: StoredConfig = {};
 try {
 prev = JSON.parse(integration.config || "{}") as StoredConfig;
 } catch {
 prev = {};
 }
 const merged: StoredConfig = {
...prev,
 method: newConfig.method,
 bookletId: newConfig.bookletId,
 sellerTaxId: newConfig.sellerTaxId?? prev.sellerTaxId,
 env: newConfig.env,
 testUrl: newConfig.testUrl?? prev.testUrl,
 apiKeyEnc: newConfig.apiKeyEnc?? prev.apiKeyEnc,
 storeUrl: newConfig.storeUrl?? prev.storeUrl,
 direct: newConfig.direct?? prev.direct,
 tsp: newConfig.tsp?? prev.tsp,
 middleware: newConfig.middleware?? prev.middleware,
 oauth: newConfig.oauth?? prev.oauth,
 batch: newConfig.batch?? prev.batch,
 webhook: newConfig.webhook?? prev.webhook,
 };

 await db.integration.update({
 where: { id: integration.id },
 data: {
 config: JSON.stringify(merged),
 status: computedStatus,
 lastSync: new Date(),
 },
 });

 // به‌روزرسانی تنانت
 await db.tenant.update({
 where: { id: tenant.id },
 data: {
 modianEnabled: true,
 modianLastSync: new Date(),
 },
 });

 await auditLog({
 tenantId: tenant.id,
 action: "MODIAN_CONFIG_UPDATE",
 entity: "Integration",
 entityId: integration.id,
 changes: {
 method,
 bookletId,
 env,
 configUpdated: true,
 secretsReused: !providedSecret(method, body),
 },
 req,
 });

 setLogContext({ tenantId: tenant.id });
 logger.info("MODIAN", "پیکربندی مودیان به‌روز شد", { method, bookletId });
 setLogContext({});

 return NextResponse.json({
 success: true,
 message: env === "TEST"
 ? "پیکربندی مودیان ذخیره شد — ارسال‌ها به محیط آزمایشی می‌روند (بدون اثر حقوقی)"
 : "پیکربندی مودیان با موفقیت ذخیره شد",
 config: {
 hasApiKey: true,
 method: merged.method,
 bookletId: merged.bookletId,
 env: merged.env?? "LIVE",
 },
 });
 }

 // ساخت رکورد جدید
 const created = await db.integration.create({
 data: {
 tenantId: tenant.id,
 type: "MODIAN",
 name: "modian",
 status: computedStatus,
 config: JSON.stringify(newConfig),
 lastSync: new Date(),
 },
 });

 await db.tenant.update({
 where: { id: tenant.id },
 data: {
 modianEnabled: true,
 modianLastSync: new Date(),
 },
 });

 await auditLog({
 tenantId: tenant.id,
 action: "MODIAN_CONFIG_CREATE",
 entity: "Integration",
 entityId: created.id,
 changes: { method, bookletId, configCreated: true },
 req,
 });

 setLogContext({ tenantId: tenant.id });
 logger.info("MODIAN", "پیکربندی مودیان ایجاد شد", { method, bookletId });
 setLogContext({});

 return NextResponse.json({
 success: true,
 message: env === "TEST"
 ? "پیکربندی مودیان ذخیره شد — ارسال‌ها به محیط آزمایشی می‌روند (بدون اثر حقوقی)"
 : "پیکربندی مودیان با موفقیت ذخیره شد",
 config: {
 hasApiKey: true,
 method: newConfig.method,
 bookletId: newConfig.bookletId,
 env: newConfig.env?? "LIVE",
 },
 });
 } catch (error) {
 console.error("Modian config POST error:", error);
 logger.error("MODIAN", "خطا در ذخیره‌ی پیکربندی مودیان", { error: error instanceof Error? error.message: String(error) });
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره‌ی پیکربندی مودیان" },
 { status: 500 }
 );
 }
}

// ============ DELETE ============
export async function DELETE(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type: "MODIAN" },
 });

 if (!integration) {
 return NextResponse.json({
 success: true,
 message: "اتصال مودیان قبلاً قطع شده است",
 });
 }

 // پاک‌سازی پیکربندی ولی حفظ رکورد برای تاریخچه
 await db.integration.update({
 where: { id: integration.id },
 data: {
 status: "DISCONNECTED",
 config: JSON.stringify({
 method: "direct",
 env: "LIVE",
 direct: undefined,
 tsp: undefined,
 middleware: undefined,
 oauth: null,
 batch: null,
 webhook: null,
 }),
 },
 });

 await db.tenant.update({
 where: { id: tenant.id },
 data: {
 modianEnabled: false,
 modianUsername: null,
 modianPassword: null,
 },
 });

 await auditLog({
 tenantId: tenant.id,
 action: "MODIAN_DISCONNECT",
 entity: "Integration",
 entityId: integration.id,
 changes: { disconnected: true },
 req,
 });

 setLogContext({ tenantId: tenant.id });
 logger.info("MODIAN", "اتصال مودیان قطع شد");
 setLogContext({});

 return NextResponse.json({
 success: true,
 message: "اتصال به سامانه مودیان قطع شد",
 });
 } catch (error) {
 console.error("Modian config DELETE error:", error);
 logger.error("MODIAN", "خطا در قطع اتصال مودیان", { error: error instanceof Error? error.message: String(error) });
 return NextResponse.json(
 { success: false, error: "خطا در قطع اتصال مودیان" },
 { status: 500 }
 );
 }
}
