import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 getPaymentSettings,
 savePaymentGatewaySettings,
 savePaymentCallbackBaseUrl,
 maskMerchantId,
} from "@/lib/system-settings";

export const runtime = "nodejs";

// GET /api/platform/settings/payment — دریافت تنظیمات درگاه‌های پرداخت
// کدهای پذیرنده به‌صورت ماسک‌شده برمی‌گردند (مگر اینکه درخواست‌دهنده سوپرادمین باشد)
export async function GET(req: NextRequest) {
 try {
 const settings = await getPaymentSettings();

 // تشخیص سوپرادمین (اختیاری) — اگر توکن معتبر باشد کد پذیرنده کامل برمی‌گردد
 let isSuperadmin = false;
 const authHeader = req.headers.get("authorization");
 if (authHeader?.startsWith("Bearer ")) {
 const auth = await requireSuperAdmin(req);
 if (!("error" in auth)) {
 isSuperadmin = true;
 }
 }

 const mask = (raw: string) =>
 isSuperadmin? raw: maskMerchantId(raw);

 return NextResponse.json({
 success: true,
 data: {
 isSuperadmin,
 zarinpal: {
 merchantId: mask(settings.zarinpal.merchantId),
 merchantMasked: maskMerchantId(settings.zarinpal.merchantId),
 enabled: settings.zarinpal.enabled,
 configured: settings.zarinpal.configured,
 sandbox: settings.zarinpal.sandbox === true,
 },
 idpay: {
 merchantId: mask(settings.idpay.merchantId),
 merchantMasked: maskMerchantId(settings.idpay.merchantId),
 enabled: settings.idpay.enabled,
 configured: settings.idpay.configured,
 },
 // FIX(PAY-2): آدرس پایه‌ی کال‌بک + آدرس کال‌بک مؤثر برای نمایش در پنل
 callbackBaseUrl: settings.callbackBaseUrl || "",
 effectiveCallbackPath: "/api/payments/callback",
 effectiveCallbackUrl: `${settings.callbackBaseUrl || "(تشخیص خودکار)"}/api/payments/callback`,
 },
 });
 } catch (error) {
 console.error("Payment settings GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تنظیمات درگاه پرداخت" },
 { status: 500 }
 );
 }
}

// POST /api/platform/settings/payment — به‌روزرسانی کد پذیرنده و فعال‌سازی درگاه‌ها
// body: { zarinpal?: { merchantId?: string, enabled?: boolean }, idpay?: {... } }
// فقط سوپرادمین
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const body = await req.json().catch(() => ({}));
 const { zarinpal, idpay, callbackBaseUrl } = body as {
 zarinpal?: { merchantId?: string; enabled?: boolean; sandbox?: boolean };
 idpay?: { merchantId?: string; enabled?: boolean };
 callbackBaseUrl?: string | null;
 };

 const updates: Array<{ gateway: "zarinpal" | "idpay"; data: { merchantId?: string; enabled?: boolean; sandbox?: boolean } }> = [];

 if (zarinpal && typeof zarinpal === "object") {
 updates.push({
 gateway: "zarinpal",
 data: {
 merchantId: typeof zarinpal.merchantId === "string"? zarinpal.merchantId: undefined,
 enabled: typeof zarinpal.enabled === "boolean"? zarinpal.enabled: undefined,
 sandbox: typeof zarinpal.sandbox === "boolean"? zarinpal.sandbox: undefined,
 },
 });
 }
 if (idpay && typeof idpay === "object") {
 updates.push({
 gateway: "idpay",
 data: {
 merchantId: typeof idpay.merchantId === "string"? idpay.merchantId: undefined,
 enabled: typeof idpay.enabled === "boolean"? idpay.enabled: undefined,
 },
 });
 }

 // FIX(PAY-2): آدرس پایه‌ی کال‌بک (رشته خالی = حذف تنظیم → تشخیص خودکار)
 let callbackSaved = false;
 if (callbackBaseUrl !== undefined) {
 try {
 await savePaymentCallbackBaseUrl(
 typeof callbackBaseUrl === "string"? callbackBaseUrl: null
 );
 callbackSaved = true;
 } catch (e) {
 return NextResponse.json(
 { success: false, error: e instanceof Error? e.message: "آدرس کال‌بک معتبر نیست" },
 { status: 400 }
 );
 }
 }

 if (updates.length === 0 && !callbackSaved) {
 return NextResponse.json(
 { success: false, error: "تغییری برای اعمال نیست" },
 { status: 400 }
 );
 }

 // اعتبارسنجی فرمت کد پذیرنده (حداقل ۶ کاراکتر) اگر ارائه شده
 for (const u of updates) {
 if (u.data.merchantId!== undefined && u.data.merchantId!== "") {
 const trimmed = u.data.merchantId.trim();
 if (trimmed.length < 6) {
 return NextResponse.json(
 { success: false, error: `کد پذیرنده ${u.gateway} بسیار کوتاه است` },
 { status: 400 }
 );
 }
 }
 }

 await Promise.all(
 updates.map((u) => savePaymentGatewaySettings(u.gateway, u.data))
 );

 // لاگ در پلتفرم
 try {
 const { db } = await import("@/lib/db");
 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "UPDATE_PAYMENT_SETTINGS",
 entity: "SystemSettings",
 details: JSON.stringify(
 updates.map((u) => ({
 gateway: u.gateway,
 merchantUpdated: u.data.merchantId!== undefined,
 enabled: u.data.enabled,
 }))
 ),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 // ignore audit log failure
 }

 return NextResponse.json({
 success: true,
 message: "تنظیمات درگاه پرداخت با موفقیت ذخیره شد",
 });
 } catch (error) {
 console.error("Payment settings POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره تنظیمات درگاه پرداخت" },
 { status: 500 }
 );
 }
}
