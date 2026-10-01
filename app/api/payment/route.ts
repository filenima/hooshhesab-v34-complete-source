// /api/payment — درگاه پرداخت چندگانه با Failover
// هوش — Multi-Gateway Payment
// ----------------------------------------------------------------------------
// این اندپوینت درخواست پرداخت را با پشتیبانی از چندین درگاه (زرین‌پال، آیدی‌پی،
// نکست‌پی) ایجاد می‌کند. اگر درگاه اول شکست بخورد، درگاه بعدی را امتحان می‌کند.
// همچنین وضعیت سلامت هر درگاه را گزارش می‌دهد.
//
// پیکربندی درگاه‌ها در SystemSettings نگهداری می‌شود (هر درگاه دارای merchantId
// و enabled است).
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";
import {
 getPaymentSettings,
 savePaymentGatewaySettings,
 type PaymentSettings,
} from "@/lib/system-settings";
import { getEffectivePlan, type PlanId } from "@/lib/plans";
// FIX(PAY-7): مسیر legacy هم سندباکس/کال‌بک مرکزی را رعایت می‌کند
import { zarinpalUrls, enforcePaymentCallbackOrigin } from "@/lib/zarinpal";
import { auditLog, getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

// ============ Gateway definitions ============
interface GatewayDefinition {
 id: "zarinpal" | "idpay" | "nextpay";
 label: string;
 createUrl: string;
 startPayUrl: (authority: string) => string;
 // پارامتر ساخت درخواست
 buildBody: (params: {
 merchantId: string;
 amountRial: number;
 description: string;
 callbackUrl: string;
 mobile?: string;
 email?: string;
 }) => Record<string, unknown>;
 // استخراج authority از پاسخ
 extractAuthority: (data: unknown) => string | null;
 // استخراج خطا از پاسخ
 extractError: (data: unknown, status: number) => string;
}

const GATEWAYS: GatewayDefinition[] = [
 {
 id: "zarinpal",
 label: "زرین‌پال",
 createUrl: "https://api.zarinpal.com/pg/v4/payment/request.json",
 startPayUrl: (auth) => `https://www.zarinpal.com/pg/StartPay/${auth}`,
 buildBody: ({ merchantId, amountRial, description, callbackUrl, mobile, email }) => ({
 merchant_id: merchantId,
 amount: amountRial,
 description,
 callback_url: callbackUrl,
...(mobile? { mobile }: {}),
...(email? { email }: {}),
 }),
 extractAuthority: (data: unknown) => {
 const d = (data || {}) as {
 data?: { authority?: string; code?: number };
 errors?: { message?: string } | null;
 };
 return d?.data?.authority?? null;
 },
 extractError: (data: unknown, status: number) => {
 const d = (data || {}) as { errors?: { message?: string } | null; data?: { message?: string } };
 return d?.errors?.message || d?.data?.message || `HTTP ${status}`;
 },
 },
 {
 id: "idpay",
 label: "آیدی‌پی",
 createUrl: "https://api.idpay.ir/v1.1/payment",
 startPayUrl: (auth) => `https://idpay.ir/pws/${auth}`,
 buildBody: ({ merchantId, amountRial, description, callbackUrl, mobile, email }) => ({
 api_key: merchantId,
 amount: amountRial, // آیدی‌پی مبلغ را به ریال می‌گیرد
 description,
 callback: callbackUrl,
...(mobile? { phone: mobile }: {}),
...(email? { mail: email }: {}),
 }),
 extractAuthority: (data: unknown) => {
 const d = (data || {}) as { id?: string; link?: string; error_code?: number };
 if (d?.id) return d.id;
 if (d?.link) {
 const match = String(d.link).match(/\/pws\/([^/?#]+)/);
 if (match) return match[1];
 }
 return null;
 },
 extractError: (data: unknown, status: number) => {
 const d = (data || {}) as { error_message?: string; error_code?: number };
 return d?.error_message || `HTTP ${status}`;
 },
 },
 {
 id: "nextpay",
 label: "نکست‌پی",
 createUrl: "https://nextpay.org/nx/gateway/token",
 startPayUrl: (auth) => `https://nextpay.org/nx/gateway/payment/${auth}`,
 buildBody: ({ merchantId, amountRial, description, callbackUrl, mobile, email }) => ({
 api_key: merchantId,
 amount: amountRial,
 order_id: `HH-${Date.now().toString(36).toUpperCase()}`,
 callback_uri: callbackUrl,
...(description? { custom: { description } }: {}),
...(mobile? { customer_phone: mobile }: {}),
...(email? { email }: {}),
 }),
 extractAuthority: (data: unknown) => {
 const d = (data || {}) as { trans_id?: string; code?: number };
 return d?.trans_id?? null;
 },
 extractError: (data: unknown, status: number) => {
 const d = (data || {}) as { message?: string };
 return d?.message || `HTTP ${status}`;
 },
 },
];

// ============ Helpers ============
function getEnabledGateways(settings: PaymentSettings): Array<GatewayDefinition & { merchantId: string }> {
 const result: Array<GatewayDefinition & { merchantId: string }> = [];
 // FIX(PAY-7): اگر سندباکس فعال باشد، URLهای زرین‌پال از تنظیم مرکزی ساخته می‌شود
 const zpUrls = zarinpalUrls(settings.zarinpal.sandbox === true);
 for (const g of GATEWAYS) {
 if (g.id === "zarinpal" && settings.zarinpal.enabled && settings.zarinpal.configured) {
 result.push({
 ...g,
 merchantId: settings.zarinpal.merchantId,
 createUrl: zpUrls.request,
 startPayUrl: (auth) => `${zpUrls.startPay}${auth}`,
 });
 } else if (g.id === "idpay" && settings.idpay.enabled && settings.idpay.configured) {
 result.push({...g, merchantId: settings.idpay.merchantId });
 } else if (g.id === "nextpay") {
 // نکست‌پی از SystemSettings خوانده می‌شود (در صورت موجود بودن)
 // در اینجا قبلاً نبود، اما می‌توان آن را اضافه کرد
 // برای fallback، اگر کلید SystemSettings موجود بود فعال می‌شود
 // (در نسخه فعلی پشتیبانی نمی‌شود تا کلید آن به schema اضافه شود)
 }
 }
 return result;
}

async function tryGateway(
 gateway: GatewayDefinition & { merchantId: string },
 params: {
 amountRial: number;
 description: string;
 callbackUrl: string;
 mobile?: string;
 email?: string;
 }
): Promise<{ success: true; authority: string; gatewayUrl: string } | { success: false; error: string; status: number }> {
 const body = gateway.buildBody({
 merchantId: gateway.merchantId,
 amountRial: params.amountRial,
 description: params.description,
 callbackUrl: params.callbackUrl,
 mobile: params.mobile,
 email: params.email,
 });

 try {
 const res = await fetch(gateway.createUrl, {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Accept: "application/json",
 // آیدی‌پی نیاز به X-Sandbox هدر ندارد، اما برای تست می‌توان اضافه کرد
...(gateway.id === "idpay"? { "X-SANDBOX": "0" }: {}),
 },
 body: JSON.stringify(body),
 // تایم‌اوت ۸ ثانیه
 signal: AbortSignal.timeout(8000),
 });

 const data = await res.json().catch(() => null);
 if (!res.ok) {
 const err = gateway.extractError(data, res.status);
 return { success: false, error: err, status: res.status };
 }

 const authority = gateway.extractAuthority(data);
 if (!authority) {
 const err = gateway.extractError(data, res.status);
 return { success: false, error: err || "Authority در پاسخ موجود نبود", status: res.status };
 }

 return {
 success: true,
 authority,
 gatewayUrl: gateway.startPayUrl(authority),
 };
 } catch (e) {
 const msg = e instanceof Error? e.message: "خطای شبکه";
 return { success: false, error: msg, status: 0 };
 }
}

// ============ POST endpoint ============
interface PaymentRequestBody {
 planId?: string;
 amountRial?: number;
 amountToman?: number;
 description?: string;
 callbackUrl?: string;
 mobile?: string;
 email?: string;
 preferredGateway?: "zarinpal" | "idpay" | "nextpay";
}

export async function POST(req: NextRequest) {
 try {
 const body = (await req.json().catch(() => ({}))) as PaymentRequestBody;
 const {
 planId,
 amountRial,
 amountToman,
 description: desc,
 callbackUrl,
 mobile,
 email,
 preferredGateway,
 } = body;

 // اعتبارسنجی
 if (!callbackUrl ||!/^https?:\/\//.test(callbackUrl)) {
 return NextResponse.json(
 { success: false, error: "callbackUrl معتبر الزامی است" },
 { status: 400 }
 );
 }

 // محاسبه مبلغ به ریال
 let finalAmountRial: number;
 let planName = "پلن سفارشی";
 if (planId && planId!== "free") {
 // FIX(9-a): قیمت مؤثر — ویرایش سوپرادمین در همه درگاه‌ها اعمال می‌شود
 const plan = await getEffectivePlan(planId as PlanId);
 if (!plan) {
 return NextResponse.json(
 { success: false, error: "پلن نامعتبر" },
 { status: 400 }
 );
 }
 finalAmountRial = plan.priceRial;
 planName = plan.name;
 } else if (amountRial && amountRial > 0) {
 finalAmountRial = Math.round(amountRial);
 } else if (amountToman && amountToman > 0) {
 finalAmountRial = Math.round(amountToman * 10);
 } else {
 return NextResponse.json(
 { success: false, error: "یا planId یا amountRial یا amountToman الزامی است" },
 { status: 400 }
 );
 }

 const description = desc || `پرداخت ${planName} — هوش`;

 // خواندن تنظیمات درگاه‌ها
 const settings = await getPaymentSettings();
 const enabledGateways = getEnabledGateways(settings);

 if (enabledGateways.length === 0) {
 return NextResponse.json(
 {
 success: false,
 error:
 "هیچ درگاه پرداختی فعال و پیکربندی‌شده‌ای موجود نیست. لطفاً با مدیر پلتفرم تماس بگیرید.",
 errorCode: "NO_GATEWAY_CONFIGURED",
 },
 { status: 503 }
 );
 }

 // اولویت‌بندی درگاه‌ها: اگر preferredGateway داده شد، اول آن، سپس بقیه به ترتیب
 const sortedGateways = preferredGateway
? [...enabledGateways].sort((a, b) => {
 if (a.id === preferredGateway) return -1;
 if (b.id === preferredGateway) return 1;
 return 0;
 })
: enabledGateways;

 // FIX(PAY-7): اگر سوپرادمین آدرس کال‌بک مرکزی تنظیم کرده باشد، origin کلاینت نادیده گرفته می‌شود
 const effectiveCallbackUrl = await enforcePaymentCallbackOrigin(callbackUrl);

 // ============ Failover: امتحان تک‌تک درگاه‌ها ============
 const attempts: Array<{ gateway: string; success: boolean; error?: string }> = [];
 let successResult: { gateway: string; authority: string; gatewayUrl: string } | null = null;

 for (const gw of sortedGateways) {
 const result = await tryGateway(gw, {
 amountRial: finalAmountRial,
 description,
 callbackUrl: effectiveCallbackUrl,
 mobile,
 email,
 });
 if (result.success) {
 successResult = {
 gateway: gw.id,
 authority: result.authority,
 gatewayUrl: result.gatewayUrl,
 };
 attempts.push({ gateway: gw.id, success: true });
 break;
 } else {
 attempts.push({ gateway: gw.id, success: false, error: result.error });
 console.warn(`[payment] gateway ${gw.id} failed:`, result.error);
 // ادامه به درگاه بعدی (failover)
 }
 }

 if (!successResult) {
 // همه درگاه‌ها شکست خوردند
 return NextResponse.json(
 {
 success: false,
 error: "تمام درگاه‌های پرداخت در دسترس نیستند. لطفاً بعداً تلاش کنید.",
 errorCode: "ALL_GATEWAYS_FAILED",
 attempts,
 },
 { status: 502 }
 );
 }

 // ============ ذخیره رکورد پرداخت ============
 const paymentId = `PAY-${Date.now().toString(36).toUpperCase()}`;
 const authCtx = await getAuthContext(req);

 try {
 // FIX(v11): کاربر مهمان → رکورد DB ذخیره نمی‌شود — قبلاً tenantId="anonymous"
 // // FK را نقض می‌کرد و create خطا می‌داد و پرداخت بدون رکورد می‌ماند
 // // (تأیید بعدی پیدایش نمی‌کرد). برای مهمان فقط paymentId برمی‌گردد.
 if (authCtx?.tenantId) {
 await db.integration.create({
 data: {
 tenantId: authCtx.tenantId,
 type: "PAYMENT",
 name: `Multi-Gateway - ${successResult.gateway} - ${paymentId}`,
 status: "PENDING",
 config: JSON.stringify({
 paymentId,
 gateway: successResult.gateway,
 authority: successResult.authority,
 amountRial: finalAmountRial,
 amountToman: finalAmountRial / 10,
 description,
 planId: planId || null,
 callbackUrl,
 attempts,
 createdAt: new Date().toISOString(),
 flow: "multi-gateway",
 userId: authCtx?.userId || null,
 }),
 },
 });
 }
 } catch (e) {
 console.error("Failed to persist payment integration record:", e);
 }

 // ============ Audit log ============
 try {
 const tenantId = authCtx?.tenantId;
 if (tenantId) {
 await auditLog({
 tenantId,
 userId: authCtx?.userId,
 action: "PAYMENT_MULTI_GATEWAY_CREATE",
 entity: "Payment",
 entityId: paymentId,
 changes: {
 gateway: successResult.gateway,
 authority: successResult.authority,
 amountRial: finalAmountRial,
 planId: planId || null,
 attempts,
 },
 req,
 });
 }
 } catch {
 // ignore
 }

 return NextResponse.json({
 success: true,
 paymentId,
 gateway: successResult.gateway,
 authority: successResult.authority,
 gatewayUrl: successResult.gatewayUrl,
 amount: finalAmountRial / 10, // toman
 amountRial: finalAmountRial,
 planId: planId || null,
 attempts,
 message: `درخواست پرداخت در درگاه «${successResult.gateway}» ایجاد شد.`,
 });
 } catch (error) {
 console.error("Multi-gateway payment error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد درخواست پرداخت" },
 { status: 500 }
 );
 }
}

// ============ GET: gateway health check ============
export async function GET() {
 try {
 const settings = await getPaymentSettings();
 const gateways = [
 {
 id: "zarinpal" as const,
 label: "زرین‌پال",
 enabled: settings.zarinpal.enabled,
 configured: settings.zarinpal.configured,
 maskedMerchant: settings.zarinpal.merchantId
? settings.zarinpal.merchantId.slice(0, 4) + "••••"
: null,
 },
 {
 id: "idpay" as const,
 label: "آیدی‌پی",
 enabled: settings.idpay.enabled,
 configured: settings.idpay.configured,
 maskedMerchant: settings.idpay.merchantId
? settings.idpay.merchantId.slice(0, 4) + "••••"
: null,
 },
 {
 id: "nextpay" as const,
 label: "نکست‌پی",
 enabled: false, // در نسخه فعلی پشتیبانی نمی‌شود (نیاز به افزودن کلید به schema)
 configured: false,
 maskedMerchant: null,
 },
 ];

 // بررسی سلامت هر درگاه با یک HEAD/GET ساده
 const healthChecks = await Promise.all(
 gateways.map(async (g) => {
 if (!g.enabled ||!g.configured) {
 return {...g, healthy: false, latencyMs: null, lastChecked: new Date().toISOString() };
 }
 const start = Date.now();
 try {
 // یک درخواست ساده به API زده می‌شود با مبلغ نامعتبر برای تست پاسخ
 const url =
 g.id === "zarinpal"
? "https://api.zarinpal.com/pg/v4/payment/request.json"
: g.id === "idpay"
? "https://api.idpay.ir/v1.1/payment"
: "https://nextpay.org/nx/gateway/token";
 const res = await fetch(url, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({}), // body خالی باید پاسخ خطا بدهد
 signal: AbortSignal.timeout(5000),
 });
 const latencyMs = Date.now() - start;
 // اگر پاسخ گرفتیم (حتی خطا)، یعنی سرویس بالا است
 return {
...g,
 healthy: res.status < 500,
 latencyMs,
 lastChecked: new Date().toISOString(),
 };
 } catch {
 return {
...g,
 healthy: false,
 latencyMs: null,
 lastChecked: new Date().toISOString(),
 };
 }
 })
 );

 return NextResponse.json({
 success: true,
 gateways: healthChecks,
 totalGateways: gateways.length,
 activeGateways: healthChecks.filter((g) => g.enabled && g.configured).length,
 healthyGateways: healthChecks.filter((g) => g.healthy).length,
 primaryGateway: gateways.find((g) => g.enabled && g.configured)?.id || null,
 });
 } catch (error) {
 console.error("Gateway health check error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بررسی سلامت درگاه‌ها" },
 { status: 500 }
 );
 }
}

// ============ PUT: پیکربندی درگاه‌ها (superadmin) ============
export async function PUT(req: NextRequest) {
 try {
 // FIX(v11-امنیتی): این مسیر بدون احراز هویت بود — هر کسی می‌توانست
 // merchantId را به حساب خودش تغییر دهد و پرداخت‌های مشتریان را رباید!
 const admin = await requireSuperAdmin(req);
 if (!admin) {
 return NextResponse.json(
 { success: false, error: "دسترسی فقط برای سوپرادمین پلتفرم" },
 { status: 403 }
 );
 }
 const body = (await req.json().catch(() => ({}))) as {
 gateway?: "zarinpal" | "idpay";
 merchantId?: string;
 enabled?: boolean;
 };
 const { gateway, merchantId, enabled } = body;

 if (!gateway || (gateway!== "zarinpal" && gateway!== "idpay")) {
 return NextResponse.json(
 { success: false, error: "gateway باید zarinpal یا idpay باشد" },
 { status: 400 }
 );
 }

 if (merchantId!== undefined && typeof merchantId!== "string") {
 return NextResponse.json(
 { success: false, error: "merchantId باید string باشد" },
 { status: 400 }
 );
 }

 if (enabled!== undefined && typeof enabled!== "boolean") {
 return NextResponse.json(
 { success: false, error: "enabled باید boolean باشد" },
 { status: 400 }
 );
 }

 await savePaymentGatewaySettings(gateway, { merchantId, enabled });

 return NextResponse.json({
 success: true,
 message: `تنظیمات درگاه ${gateway} با موفقیت ذخیره شد`,
 });
 } catch (error) {
 console.error("Update gateway settings error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره تنظیمات درگاه" },
 { status: 500 }
 );
 }
}
