import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// حداکثر اندازه محتوای فایل متنی که به AI ارسال می‌شود (کاراکتر)
const MAX_TEXT_LENGTH = 20_000;
// حد آپلود فایل (bytes) — ۲ مگابایت
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const FILE_PROMPT = `تو تحلیلگر داده‌ی نرم‌افزار حسابداری «هوش» هستی.
محتوای فایل ارسال‌شده توسط کاربر (CSV/TSV/Excel-exported/JSON) را تحلیل کن و:

۱. ساختار داده را شناسایی کن (ستون‌ها، تعداد ردیف، نوع داده‌ها).
۲. اگر داده‌ی مالی/حسابداری است (فاکتور، تراکنش، مشتری، محصول)، خلاصه‌ای از آن ارائه بده:
 - جمع مبالغ، میانگین، حداقل، حداکثر
 - تعداد رکوردها
 - توزیع بر اساس دسته/نوع/تاریخ
۳. اگر ناقص یا خطا دارد، مشخص کن.
۴. پیشنهاداتی برای بهبود داده یا وارد کردن آن به هوش ارائه بده.
۵. در صورت امکان، داده را به‌صورت جدول مارک‌داون خلاصه کن.

قواعد:
- به فارسی پاسخ بده
- اعداد را به فارسی بنویس
- مبالغ اگر به ریال است به تومان تبدیل کن
- از مارک‌داون (**) و (-) و | table | استفاده کن`;

interface FileAnalyzeRequest {
 content?: string;
 fileName?: string;
 prompt?: string;
}

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`file-analyze:${ip}`, 6, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست تحلیل فایل پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { content, fileName, prompt } = body as FileAnalyzeRequest;

 if (!content || typeof content!== "string" || content.trim().length === 0) {
 return NextResponse.json(
 { success: false, error: "محتوای فایل ارسال نشده است" },
 { status: 400 }
 );
 }

 if (content.length > MAX_TEXT_LENGTH) {
 // برش محتوا برای جلوگیری از prompt طولانی
 const truncated = content.slice(0, MAX_TEXT_LENGTH);
 const body_content = `نام فایل: ${fileName || "نامشخص"}\n\n` +
 `(نکته: محتوای فایل از ${MAX_TEXT_LENGTH} کاراکتر بیشتر بود — فقط ${MAX_TEXT_LENGTH} کاراکتر اول ارسال شد)\n\n` +
 `--- محتوای فایل ---\n${truncated}\n--- پایان محتوا ---\n\n` +
 `سوال کاربر: ${prompt?.trim() || "این داده را تحلیل کن و خلاصه ارائه بده."}`;

 return await runAnalysis(body_content, req, fileName, true);
 }

 const body_content = `نام فایل: ${fileName || "نامشخص"}\n\n` +
 `--- محتوای فایل ---\n${content}\n--- پایان محتوا ---\n\n` +
 `سوال کاربر: ${prompt?.trim() || "این داده را تحلیل کن و خلاصه ارائه بده."}`;

 return await runAnalysis(body_content, req, fileName, false);
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("AI File Analyze error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در تحلیل فایل. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}

async function runAnalysis(
 body_content: string,
 req: NextRequest,
 fileName: string | undefined,
 truncated: boolean
) {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const zai = await ZAI.create();

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: FILE_PROMPT },
 { role: "user", content: body_content },
 ],
 thinking: { type: "disabled" },
 });

 const reply: string = completion?.choices?.[0]?.message?.content?? "";

 await auditLog({
 tenantId: tenant.id,
 action: "AI_FILE_ANALYZE",
 entity: "ai.file-analyze",
 changes: {
 fileName: (fileName || "").slice(0, 100),
 contentLength: body_content.length,
 truncated,
 replyLength: reply.length,
 },
 req,
 });

 return NextResponse.json({ success: true, reply, truncated });
}
