import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BATCH = 10;
const PARALLEL_LIMIT = 3;

interface OCRItem {
 description: string;
 qty: number;
 unitPrice: number;
 lineTotal: number;
}

interface OCRResult {
 sellerName: string;
 buyerName: string;
 invoiceNumber: string;
 date: string;
 totalAmount: number;
 vat: number;
 items: OCRItem[];
}

const OCR_PROMPT = `تو یک موتور OCR فارسی برای نرم‌افزار حسابداری «هوش» هستی.
تصویر فاکتور/رسید زیر را با دقت بررسی کن و اطلاعات را به‌صورت JSON خالص (بدون markdown) برگردان.

ساختار خروجی:
{
 "sellerName": "نام فروشنده",
 "buyerName": "نام خریدار (در صورت وجود)",
 "invoiceNumber": "شماره فاکتور",
 "date": "تاریخ شمسی YYYY/MM/DD",
 "totalAmount": عدد صحیح مبلغ کل به تومان,
 "vat": عدد صحیح ارزش افزوده به تومان,
 "items": [{ "description": "", "qty": 0, "unitPrice": 0, "lineTotal": 0 }]
}

قواعد:
- فقط JSON معتبر برگردان
- اعداد به انگلیسی
- اگر فیلدی موجود نبود، رشته‌ی خالی یا ۰ بگذار
- مبالغ ریال را به تومان تبدیل کن (تقسیم بر ۱۰)`;

interface BatchResult {
 index: number;
 success: boolean;
 data?: OCRResult;
 error?: string;
}

/** پردازش یک تصویر با VLM */
async function processOneImage(
 zai: Awaited<ReturnType<typeof ZAI.create>>,
 image: string
): Promise<OCRResult> {
 const completion = await zai.chat.completions.createVision({
 model: "glm-4.6v",
 messages: [
 { role: "assistant", content: [{ type: "text", text: OCR_PROMPT }] },
 {
 role: "user",
 content: [
 { type: "text", text: "اطلاعات این فاکتور را استخراج کن." },
 { type: "image_url", image_url: { url: image } },
 ],
 },
 ],
 thinking: { type: "disabled" },
 });

 const raw: string = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw
.replace(/```json\s*/gi, "")
.replace(/```\s*$/g, "")
.trim();
 const start = cleaned.indexOf("{");
 const end = cleaned.lastIndexOf("}");
 if (start === -1 || end === -1) {
 throw new Error("JSON یافت نشد در خروجی مدل");
 }
 const parsed = JSON.parse(cleaned.slice(start, end + 1));
 return {
 sellerName: String(parsed.sellerName?? "").trim(),
 buyerName: String(parsed.buyerName?? "").trim(),
 invoiceNumber: String(parsed.invoiceNumber?? "").trim(),
 date: String(parsed.date?? "").trim(),
 totalAmount: Number(parsed.totalAmount) || 0,
 vat: Number(parsed.vat) || 0,
 items: Array.isArray(parsed.items)
? parsed.items.map((it: Record<string, unknown>) => ({
 description: String(it?.description?? "").trim(),
 qty: Number(it?.qty) || 0,
 unitPrice: Number(it?.unitPrice) || 0,
 lineTotal:
 Number(it?.lineTotal) ||
 Number(it?.qty) * Number(it?.unitPrice) ||
 0,
 }))
: [],
 };
}

/** اجرای n تسک با حداکثر limit همزمان */
async function runPool<T, R>(
 items: T[],
 limit: number,
 worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
 const results: R[] = new Array(items.length);
 let cursor = 0;
 const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
 while (cursor < items.length) {
 const idx = cursor++;
 results[idx] = await worker(items[idx], idx);
 }
 });
 await Promise.all(runners);
 return results;
}

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`ocr-batch:${ip}`, 5, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف مجاز OCR دسته‌ای پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { images, stream: wantStream } = body as {
 images?: string[];
 stream?: boolean;
 };

 if (!Array.isArray(images) || images.length === 0) {
 return NextResponse.json(
 { success: false, error: "آرایه‌ی images الزامی است" },
 { status: 400 }
 );
 }

 if (images.length > MAX_BATCH) {
 return NextResponse.json(
 {
 success: false,
 error: `حداکثر ${MAX_BATCH} تصویر در هر درخواست مجاز است`,
 },
 { status: 400 }
 );
 }

 // اعتبارسنجی تصاویر
 for (let i = 0; i < images.length; i++) {
 const img = images[i];
 if (typeof img!== "string" ||!img.startsWith("data:image/")) {
 return NextResponse.json(
 { success: false, error: `تصویر ${i + 1} باید data URL معتبر باشد` },
 { status: 400 }
 );
 }
 const base64Part = img.split(",")[1]?? "";
 const approxBytes = Math.ceil((base64Part.length * 3) / 4);
 if (approxBytes > MAX_IMAGE_BYTES) {
 return NextResponse.json(
 {
 success: false,
 error: `تصویر ${i + 1} بیش از حد مجاز (۵ مگابایت) است`,
 },
 { status: 413 }
 );
 }
 }

 const tenant = await getTenant(req);
 const zai = await ZAI.create();

 // ===== حالت استریم SSE — ارسال نتیجه‌ی هر تصویر به‌محض آماده شدن =====
 if (wantStream === true) {
 const encoder = new TextEncoder();
 const stream = new ReadableStream({
 async start(controller) {
 const send = (obj: unknown) => {
 controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
 };

 send({ type: "start", total: images.length });

 await runPool(images, PARALLEL_LIMIT, async (image, idx) => {
 try {
 const data = await processOneImage(zai, image);
 send({ type: "progress", index: idx, success: true, data });
 } catch (err) {
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 send({
 type: "progress",
 index: idx,
 success: false,
 error: msg,
 });
 }
 });

 send({ type: "done" });
 controller.enqueue(encoder.encode("data: [DONE]\n\n"));
 controller.close();

 void auditLog({
 tenantId: tenant?.id?? "anonymous",
 action: "AI_OCR_BATCH_STREAM",
 entity: "ai.ocr-batch",
 changes: { count: images.length },
 req,
 });
 },
 });

 return new Response(stream, {
 headers: {
 "Content-Type": "text/event-stream; charset=utf-8",
 "Cache-Control": "no-cache, no-transform",
 Connection: "keep-alive",
 "X-Accel-Buffering": "no",
 },
 });
 }

 // ===== حالت عادی — پردازش موازی و بازگشت آرایه =====
 const results: BatchResult[] = await runPool(
 images,
 PARALLEL_LIMIT,
 async (image, idx) => {
 try {
 const data = await processOneImage(zai, image);
 return { index: idx, success: true, data };
 } catch (err) {
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 return { index: idx, success: false, error: msg };
 }
 }
 );

 await auditLog({
 tenantId: tenant?.id?? "anonymous",
 action: "AI_OCR_BATCH",
 entity: "ai.ocr-batch",
 changes: {
 total: images.length,
 success: results.filter((r) => r.success).length,
 failed: results.filter((r) =>!r.success).length,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 results: results.sort((a, b) => a.index - b.index),
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("OCR batch error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش دسته‌ای OCR" },
 { status: 500 }
 );
 }
}
