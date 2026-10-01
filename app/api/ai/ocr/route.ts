import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// حد آپلود تصویر: ۵ مگابایت (پس از base64 ~ ۶.۷M کاراکتر)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
تصویر فاکتور/رسید زیر را با دقت بررسی کن و اطلاعات را به‌صورت JSON خالص (بدون markdown، بدون توضیح اضافه) برگردان.

ساختار خروجی مورد نظر:
{
 "sellerName": "نام فروشنده یا شرکت صادرکننده",
 "buyerName": "نام خریدار (در صورت وجود)",
 "invoiceNumber": "شماره فاکتور",
 "date": "تاریخ فاکتور به فرمت شمسی YYYY/MM/DD یا میلادی در صورت عدم وجود شمسی",
 "totalAmount": عدد صحیح مبلغ کل به تومان,
 "vat": عدد صحیح مبلغ ارزش افزوده به تومان (اگر مشخص نشده ۰),
 "items": [
 { "description": "شرح کالا/خدمت", "qty": عدد, "unitPrice": عدد, "lineTotal": عدد }
 ]
}

قواعد:
- فقط JSON معتبر برگردان، بدون هیچ پیشوند یا پسوندی
- اعداد را به انگلیسی در JSON بنویس
- اگر فیلدی در تصویر وجود نداشت، رشته خالی یا صفر بگذار
- مبالغ را به تومان تبدیل کن (اگر ریال بود، تقسیم بر ۱۰)
- اگر تصویر فاکتور نیست، فیلدها را خالی بگذار`;

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 // Rate limit: 5 requests/minute per IP
 if (!rateLimit(`ocr:${ip}`, 5, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف مجاز درخواست OCR پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { image } = body as { image?: string };

 if (!image || typeof image!== "string") {
 return NextResponse.json(
 { success: false, error: "تصویر (base64 data URL) ارسال نشده است" },
 { status: 400 }
 );
 }

 // اعتبارسنجی data URL
 if (!image.startsWith("data:image/")) {
 return NextResponse.json(
 { success: false, error: "تصویر باید به‌صورت data URL با پیشوند data:image/ ارسال شود" },
 { status: 400 }
 );
 }

 // بررسی اندازه تقریبی
 const base64Part = image.split(",")[1]?? "";
 const approxBytes = Math.ceil((base64Part.length * 3) / 4);
 if (approxBytes > MAX_IMAGE_BYTES) {
 return NextResponse.json(
 {
 success: false,
 error: "اندازه تصویر بیش از حد مجاز (۵ مگابایت) است",
 },
 { status: 413 }
 );
 }

 const tenant = await getTenant(req);
 const zai = await ZAI.create();

 const completion = await zai.chat.completions.createVision({
 model: "glm-4.6v",
 messages: [
 {
 role: "assistant",
 content: [{ type: "text", text: OCR_PROMPT }],
 },
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

 // استخراج JSON از داخل متن (ممکن است markdown fence داشته باشد)
 let data: OCRResult;
 try {
 const cleaned = raw
.replace(/```json\s*/gi, "")
.replace(/```\s*$/g, "")
.trim();
 const start = cleaned.indexOf("{");
 const end = cleaned.lastIndexOf("}");
 if (start === -1 || end === -1) {
 throw new Error("JSON یافت نشد");
 }
 data = JSON.parse(cleaned.slice(start, end + 1));
 } catch {
 // اگر مدل JSON معتبر برنگرداند
 await auditLog({
 tenantId: tenant?.id?? "anonymous",
 action: "OCR_PARSE_FAIL",
 entity: "ai.ocr",
 changes: { raw: raw.slice(0, 500) },
 req,
 });
 return NextResponse.json(
 {
 success: false,
 error: "خروجی هوش مصنوعی قابل تجزیه نبود",
 raw: raw.slice(0, 1000),
 },
 { status: 502 }
 );
 }

 // نرمال‌سازی داده‌ها
 const normalized: OCRResult = {
 sellerName: String(data.sellerName?? "").trim(),
 buyerName: String(data.buyerName?? "").trim(),
 invoiceNumber: String(data.invoiceNumber?? "").trim(),
 date: String(data.date?? "").trim(),
 totalAmount: Number(data.totalAmount) || 0,
 vat: Number(data.vat) || 0,
 items: Array.isArray(data.items)
? data.items.map((it) => ({
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

 await auditLog({
 tenantId: tenant?.id?? "anonymous",
 action: "OCR_EXTRACT",
 entity: "ai.ocr",
 changes: {
 invoiceNumber: normalized.invoiceNumber,
 totalAmount: normalized.totalAmount,
 itemCount: normalized.items.length,
 },
 req,
 });

 return NextResponse.json({ success: true, data: normalized });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("OCR API error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش تصویر. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}
