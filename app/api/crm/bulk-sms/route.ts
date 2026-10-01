import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit } from "@/lib/auth";
import { sendSMS, isSmsConfigured, isValidPhone } from "@/lib/sms-sender";

export const runtime = "nodejs";

/**
 * POST /api/crm/bulk-sms — ارسال پیامک گروهی به مشتریان
 * بدنه: { partyIds?: string[], segment?: "all"|"customers"|"suppliers", message, templateId? }
 *
 * این مسیر واقعاً از lib/sms-sender (Kavenegar / Faraz / mock) استفاده می‌کند.
 * اگر سرویس پیامک پیکربندی نشده باشد، با خطای 503 برمی‌گردد تا کاربر فریب نخورد.
 */
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (!rateLimit(`bulk-sms:${ctx.tenantId}`, 5, 5 * 60_000)) {
 return NextResponse.json(
 { success: false, error: "ارسال پیامک گروهی هر ۵ دقیقه یک‌بار مجاز است" },
 { status: 429 }
 );
 }

 // اگر سرویس پیامک پیکربندی نشده است، تظاهر به ارسال نکنیم
 if (!isSmsConfigured()) {
 return NextResponse.json(
 {
 success: false,
 error:
 "سرویس پیامک پیکربندی نشده است. لطفاً متغیرهای محیطی SMS_PROVIDER، SMS_API_KEY و SMS_SENDER را تنظیم کنید.",
 },
 { status: 503 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const message = String(body.message || "").trim();
 const partyIds = Array.isArray(body.partyIds)? body.partyIds: [];
 const segment = String(body.segment || "customers").trim();
 const templateId = String(body.templateId || "").trim() || null;

 if (!message) {
 return NextResponse.json(
 { success: false, error: "متن پیامک الزامی است" },
 { status: 400 }
 );
 }
 if (message.length > 480) {
 return NextResponse.json(
 { success: false, error: "متن پیامک نمی‌تواند بیش از ۴۸۰ کاراکتر باشد" },
 { status: 400 }
 );
 }

 // تعیین recipient ها
 let recipients: Array<{ id: string; name: string; mobile: string | null }> = [];
 if (partyIds.length > 0) {
 recipients = await db.party.findMany({
 where: {
 tenantId: ctx.tenantId,
 id: { in: partyIds },
 deletedAt: null,
 },
 select: { id: true, name: true, mobile: true },
 });
 } else {
 // segment-based
 const where = {
 tenantId: ctx.tenantId,
 deletedAt: null,
...(segment === "customers"
? { type: "CUSTOMER" }
: segment === "suppliers"
? { type: "SUPPLIER" }
: {}),
 };
 recipients = await db.party.findMany({
 where,
 select: { id: true, name: true, mobile: true },
 take: 1000, // حداکثر ۱۰۰۰ گیرنده در هر ارسال
 });
 }

 if (recipients.length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ گیرنده‌ای یافت نشد" },
 { status: 400 }
 );
 }

 // فقط گیرنده‌هایی که موبایل معتبر دارند
 const validRecipients = recipients.filter(
 (r) => r.mobile && r.mobile.trim() && isValidPhone(r.mobile.trim())
 );
 const skippedCount = recipients.length - validRecipients.length;

 if (validRecipients.length === 0) {
 return NextResponse.json(
 {
 success: false,
 error: "هیچ یک از گیرنده‌ها شماره موبایل معتبر ندارند",
 },
 { status: 400 }
 );
 }

 // ===== ارسال واقعی پیامک به هر گیرنده =====
 let sent = 0;
 let failed = 0;
 const errors: Array<{ id: string; name: string; mobile: string; error: string }> = [];

 for (const r of validRecipients) {
 const mobile = (r.mobile || "").trim();
 try {
 const result = await sendSMS({
 to: mobile,
 message,
 templateId: templateId || undefined,
 });
 if (result.success) {
 sent += 1;
 } else {
 failed += 1;
 errors.push({
 id: r.id,
 name: r.name,
 mobile,
 error: result.error || "خطای ناشناخته در ارسال",
 });
 }
 } catch (err) {
 failed += 1;
 errors.push({
 id: r.id,
 name: r.name,
 mobile,
 error: err instanceof Error? err.message: "خطای غیرمنتظره",
 });
 }
 }

 // ثبت در audit log با نتایج واقعی ارسال
 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "BULK_SMS_SENT",
 entity: "Party",
 changes: {
 recipientCount: validRecipients.length,
 sent,
 failed,
 skippedCount,
 messagePreview: message.substring(0, 100),
 segment,
 templateId,
 // فقط ۲۰ خطای اول را ذخیره می‌کنیم تا AuditLog سنگین نشود
 errors: errors.slice(0, 20),
 },
 req,
 });

 // اگر همه ناموفق بودند 500؛ اگر برخی موفق بودند 200 با جزئیات
 const allFailed = sent === 0 && failed > 0;

 return NextResponse.json(
 {
 success:!allFailed,
 data: {
 recipientCount: validRecipients.length,
 sent,
 failed,
 skippedCount,
 errors: errors.slice(0, 50), // محدود کردن برای پاسخ HTTP
 messageLength: message.length,
 sentAt: new Date().toISOString(),
 },
 message: allFailed
? "ارسال پیامک به همه گیرنده‌ها ناموفق بود"
: sent > 0 && failed > 0
? `پیامک به ${sent} گیرنده ارسال شد، اما ${failed} گیرنده ناموفق بود`
: `پیامک به ${sent} گیرنده ارسال شد`,
 },
 { status: allFailed? 500: 200 }
 );
 } catch (error) {
 console.error("Bulk SMS error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ارسال پیامک گروهی" },
 { status: 500 }
 );
 }
}
