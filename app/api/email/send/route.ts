import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/user-auth";
import { sendEmail, renderTemplate, isValidEmail } from "@/lib/email-sender";

export const runtime = "nodejs";

// POST /api/email/send — ارسال ایمیل
// body: { to, subject, html, templateId?, variables?, from? }
// نیاز به احراز هویت کاربر دارد
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) {
 return auth.error;
 }

 // FIX(SECURITY-M2): محدودیت نرخ ارسال ایمیل — ۱۰ ایمیل در ۱۰ دقیقه برای هر کاربر
 const { rateLimitCheck, buildRateLimitResponse, getClientIp } =
 await import("@/lib/rate-limit");
 const rlIp = getClientIp(req);
 const rl = rateLimitCheck(`email-send:${auth.user.userId}:${rlIp}`, 10, 10 * 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(rl, "تعداد ایمیل‌های ارسالی بیش از حد مجاز است. لطفاً بعداً تلاش کنید.");
 }

 const body = await req.json();
 const {
 to,
 subject,
 html,
 templateId,
 variables = {},
 } = body as {
 to: string;
 subject?: string;
 html?: string;
 templateId?: string;
 variables?: Record<string, string | number>;
 };

 if (!to ||!isValidEmail(to)) {
 return NextResponse.json(
 { success: false, error: "آدرس ایمیل گیرنده نامعتبر است" },
 { status: 400 }
 );
 }

 let finalSubject = subject || "";
 let finalHtml = html || "";

 // اگر قالب مشخص شد، متغیرها را جایگزین کن
 if (templateId) {
 // FIX(SECURITY-M3): قالب فقط از tenant همان کاربر — جلوگیری از IDOR
 const rendered = await renderTemplate(templateId, variables, auth.user.tenantId);
 if (!rendered) {
 return NextResponse.json(
 { success: false, error: "قالب ایمیل یافت نشد" },
 { status: 404 }
 );
 }
 finalSubject = finalSubject || rendered.subject;
 finalHtml = finalHtml || rendered.html;
 }

 if (!finalSubject ||!finalHtml) {
 return NextResponse.json(
 { success: false, error: "موضوع و محتوای ایمیل الزامی است" },
 { status: 400 }
 );
 }

 // FIX(SECURITY-M2): فیلد from قابل جعل توسط کاربر نیست — همیشه از تنظیمات سیستم
 const result = await sendEmail({
 to,
 subject: finalSubject,
 html: finalHtml,
 });

 if (!result.success) {
 return NextResponse.json(
 { success: false, error: result.error?? "خطا در ارسال ایمیل" },
 { status: 502 }
 );
 }

 return NextResponse.json({
 success: true,
 data: {
 messageId: result.messageId,
 mock: result.mock?? false,
 to,
 subject: finalSubject,
 },
 message: result.mock
? "ایمیل در حالت آزمایشی (mock) ارسال شد — SMTP تنظیم نشده"
: "ایمیل با موفقیت ارسال شد",
 });
 } catch (error) {
 console.error("Email send route error:", error);
 return NextResponse.json(
 { success: false, error: "خطای سرور در ارسال ایمیل" },
 { status: 500 }
 );
 }
}
