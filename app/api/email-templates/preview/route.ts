import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentJalaliYear, toPersianDigits } from "@/lib/persian";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// FIX (FIX-HIGH-ISSUES): سال شمسی جاری به‌جای ۱۴۰۳ ثابت — از stale شدن
// داده‌ی نمونه در سال جدید جلوگیری می‌کند.
const CURRENT_YEAR = toPersianDigits(getCurrentJalaliYear());

// داده‌های نمونه برای پیش‌نمایش
const SAMPLE_DATA: Record<string, string> = {
 customerName: "آقای محمد رضایی",
 invoiceNumber: `${CURRENT_YEAR}-۰۰۱۲۴۱`,
 amount: "۲٬۴۵۰٬۰۰۰ تومان",
 dueDate: `${CURRENT_YEAR}/۰۸/۱۵`,
 checkNumber: "۱۲۳۴۵۶۷",
 companyName: "شرکت نمونه هوش",
 daysLeft: "۳",
};

// POST /api/email-templates/preview — رندر قالب با داده نمونه (نیازمند احراز هویت)
// FIX امنیتی: قالب‌های ایمیل tenant-scoped هستند — بدون auth قابل خواندن از تنانت‌های دیگر بود
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const body = await req.json();
 const { id, subject, body: tplBody, variables } = body as {
 id?: string;
 subject?: string;
 body?: string;
 variables?: string[];
 };

 let templateSubject = subject?? "";
 let templateBody = tplBody?? "";
 let templateVariables: string[] = variables?? [];

 if (id) {
 const tpl = await db.emailTemplate.findFirst({
 where: { id, tenantId: ctx.tenantId },
 });
 if (!tpl) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }
 templateSubject = tpl.subject;
 templateBody = tpl.body;
 try {
 templateVariables = JSON.parse(tpl.variables);
 } catch {
 templateVariables = [];
 }
 }

 // رندر با داده نمونه
 const render = (text: string) =>
 text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
 const val = SAMPLE_DATA[key];
 if (val!= null) return val;
 // اگر متغیر تعریف نشده، یک placeholder نمایش بده
 return `<span style="color: #ef4444; background: #fee2e2; padding: 0 4px; border-radius: 3px;">${key}?</span>`;
 });

 return NextResponse.json({
 success: true,
 data: {
 subject: render(templateSubject),
 body: render(templateBody),
 variables: templateVariables,
 sampleData: SAMPLE_DATA,
 },
 });
 } catch (error) {
 console.error("Email template preview error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌نمایش قالب" },
 { status: 500 }
 );
 }
}
