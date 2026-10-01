import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { sendSMS, isValidPhone, type SendSMSResult } from "@/lib/sms-sender";
import { getCurrentJalaliYear, toPersianDigits } from "@/lib/persian";

export const runtime = "nodejs";

// FIX (FIX-HIGH-ISSUES): سال شمسی جاری به‌جای ۱۴۰۳ ثابت — از stale شدن
// داده‌ی نمونه در سال جدید جلوگیری می‌کند.
const CURRENT_YEAR = toPersianDigits(getCurrentJalaliYear());

const SAMPLE_DATA: Record<string, string> = {
 customerName: "مشتری نمونه",
 invoiceNumber: `${CURRENT_YEAR}-۱۰۲۴`,
 amount: "۲٬۵۰۰٬۰۰۰",
 dueDate: `${CURRENT_YEAR}/۰۸/۱۵`,
 checkNumber: "۱۲۳۴۵۶۷",
 partyName: "شرکت نمونه",
 discountCode: "HEESH20",
 percent: "۲۰",
 expiryDate: `${CURRENT_YEAR}/۰۹/۰۱`,
 code: "۱۲۳۴۵",
};

/**
 * POST /api/sms-templates/preview — پیش‌نمایش قالب با داده نمونه یا تست ارسال
 * body: { templateId?, body?, to?, send?: boolean }
 * - اگر send=true و to تنظیم شده باشد، یک پیامک واقعی (یا mock) ارسال می‌کند.
 * - در غیر این صورت فقط با SAMPLE_DATA رندر می‌کند.
 */
export async function POST(req: NextRequest) {
 try {
 // FIX(SECURITY-M3): requireUser با اعتبارسنجی UserSession دیتابیسی —
 // قبلاً verifyToken خام بود و توکن‌های ابطال‌شده هم پاس می‌شدند
 const auth = await requireUser(req);
 if ("error" in auth) {
 return auth.error;
 }
 const { tenantId: userTenantId } = auth.user;

 const body = await req.json().catch(() => ({}));
 const templateId = String(body?.templateId || "");
 const rawBody = String(body?.body || "");
 const to = String(body?.to || "");
 const shouldSend = Boolean(body?.send);

 let templateBody = rawBody;
 if (templateId) {
 // FIX(SECURITY-M3): قالب فقط از tenant همان کاربر (یا قالب سراسری)
 const tpl = await db.smsTemplate.findFirst({
 where: { id: templateId, OR: [{ tenantId: userTenantId }, { tenantId: null }] },
 });
 if (!tpl) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }
 templateBody = tpl.body;
 }

 if (!templateBody) {
 return NextResponse.json(
 { success: false, error: "متن قالب الزامی است" },
 { status: 400 }
 );
 }

 // رندر با SAMPLE_DATA
 let rendered = templateBody;
 for (const [key, value] of Object.entries(SAMPLE_DATA)) {
 const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
 rendered = rendered.replace(re, value);
 }
 // پاک کردن متغیرهای استفاده‌نشده با placeholder
 rendered = rendered.replace(/\{\{[^}]+\}\}/g, "—");

 // محاسبه تعداد کاراکتر و segment
 const charCount = rendered.length;
 // SMS segment: 70 کاراکتر برای فارسی، 160 برای انگلیسی
 // اگر همه کاراکترها در محدوده GSM 7-bit باشند، 160، در غیر این صورت 70
 const isPersian = /[\u0600-\u06FF]/.test(rendered);
 const segmentSize = isPersian? 70: 160;
 const segments = Math.max(1, Math.ceil(charCount / segmentSize));

 // اگر send=true، ارسال واقعی (یا mock)
 let sendResult: SendSMSResult | null = null;
 if (shouldSend && to) {
 // FIX(SECURITY-M2): محدودیت نرخ ارسال تستی — ۳ پیامک در ۱۰ دقیقه
 const { rateLimitCheck, buildRateLimitResponse, getClientIp } =
 await import("@/lib/rate-limit");
 const rl = rateLimitCheck(`sms-preview:${auth.user.userId}:${getClientIp(req)}`, 3, 10 * 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(rl, "تعداد ارسال‌های تستی بیش از حد مجاز است.");
 }
 if (!isValidPhone(to)) {
 return NextResponse.json(
 { success: false, error: "شماره موبایل نامعتبر است" },
 { status: 400 }
 );
 }
 sendResult = await sendSMS({ to, message: rendered });
 }

 return NextResponse.json({
 success: true,
 data: {
 rendered,
 charCount,
 segments,
 segmentSize,
 isPersian,
 sampleData: SAMPLE_DATA,
 sendResult,
 },
 });
 } catch (error) {
 console.error("SMS preview error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌نمایش قالب" },
 { status: 500 }
 );
 }
}
