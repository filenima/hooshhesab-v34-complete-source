import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const VISION_PROMPT = `تو دستیار هوشمند نرم‌افزار حسابداری «هوش» هستی که می‌توانی تصاویر را تحلیل کنی.
تصویر ارسال‌شده توسط کاربر را بررسی کن و:

۱. اگر تصویر فاکتور/رسید/فاکتور خرید است، اطلاعات کلیدی (فروشنده، خریدار، شماره، تاریخ، مبلغ کل، اقلام) را به فارسی خلاصه کن.
۲. اگر تصویر کارت ویزیت است، اطلاعات تماس را استخراج کن.
۳. اگر تصویر چک است، مبلغ، تاریخ، شماره چک و بانک را بخوان.
۴. اگر تصویر گزارش/نمودار است، آن را توصیف کن.
۵. اگر تصویر هر چیز دیگری بود، آن را به اختصار توصیف کن.

قواعد:
- به فارسی پاسخ بده
- اعداد را به فارسی بنویس
- مبالغ را به تومان تبدیل کن (اگر ریال بود)
- از مارک‌داون (**) برای تاکید و (-) برای لیست استفاده کن
- اگر چیزی قابل تشخیص نبود، صادقانه بگو`;

interface VisionRequest {
 image?: string;
 prompt?: string;
}

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`vision:${ip}`, 8, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست تحلیل تصویر پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { image, prompt } = body as VisionRequest;

 if (!image || typeof image!== "string") {
 return NextResponse.json(
 { success: false, error: "تصویر (base64 data URL) ارسال نشده است" },
 { status: 400 }
 );
 }

 if (!image.startsWith("data:image/")) {
 return NextResponse.json(
 { success: false, error: "تصویر باید به‌صورت data URL با پیشوند data:image/ ارسال شود" },
 { status: 400 }
 );
 }

 const base64Part = image.split(",")[1]?? "";
 const approxBytes = Math.ceil((base64Part.length * 3) / 4);
 if (approxBytes > MAX_IMAGE_BYTES) {
 return NextResponse.json(
 { success: false, error: "اندازه تصویر بیش از حد مجاز (۵ مگابایت) است" },
 { status: 413 }
 );
 }

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const zai = await ZAI.create();

 const userText =
 prompt?.trim() ||
 "این تصویر را تحلیل کن و اطلاعات مهم آن را به فارسی خلاصه کن.";

 const completion = await zai.chat.completions.createVision({
 model: "glm-4.6v",
 messages: [
 { role: "assistant", content: [{ type: "text", text: VISION_PROMPT }] },
 {
 role: "user",
 content: [
 { type: "text", text: userText },
 { type: "image_url", image_url: { url: image } },
 ],
 },
 ],
 thinking: { type: "disabled" },
 });

 const reply: string = completion?.choices?.[0]?.message?.content?? "";

 await auditLog({
 tenantId: tenant.id,
 action: "AI_VISION_ANALYZE",
 entity: "ai.vision",
 changes: {
 prompt: userText.slice(0, 200),
 replyLength: reply.length,
 imageSize: approxBytes,
 },
 req,
 });

 return NextResponse.json({ success: true, reply });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("AI Vision error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در تحلیل تصویر. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}
