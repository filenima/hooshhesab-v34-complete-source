import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type TransactionType = "DEBIT" | "CREDIT";

interface CategorizeResult {
 group: string;
 account: string;
 accountCode: string;
 confidence: number;
 suggestedDescription: string;
}

const SYSTEM_PROMPT = `تو موتور دسته‌بندی تراکنش‌های بانکی نرم‌افزار حسابداری «هوش» هستی.
وظیفه تو این است که یک تراکنش بانکی را بر اساس شرح و مبلغ و نوع، در گروه و حساب مناسبِ «طرح حساب ملی ایران» قرار دهی.

گروه‌های اصلی حسابداری ایران:
۱. دارایی‌ها (کد ۱) — شامل موجودی نقد، بانک، اسناد دریافتنی، حساب‌های دریافتی، موجودی انبار، دارایی‌های ثابت
۲. بدهی‌ها (کد ۲) — شامل اسناد پرداختنی، حساب‌های پرداختنی، وام‌ها، پیش‌دریافت‌ها، ارزش افزوده پرداختنی
۳. سرمایه (کد ۳) — سرمایه صاحبان، سود انباشته
۴. درآمدها (کد ۴) — فروش کالا/خدمت، درآمد تسعیر ارز، سایر درآمدها
۵. هزینه‌ها (کد ۵) — خرید کالا، حقوق، اجاره، آب/برق/گاز، هزینه‌های اداری، تبلیغات، استهلاک
۶. حساب‌های تسویلی (کد ۶)

نکات:
- تراکنش DEBIT (برداشت) معمولاً نشانگر پرداخت/خرید/هزینه است
- تراکنش CREDIT (واریز) معمولاً نشانگر دریافت/فروش/درآمد است
- اگر شرح تراکنش به حقوق/دستمزد اشاره داشت حساب هزینه حقوق (کد ۵۱۰۱)
- اگر به اجاره اشاره داشت هزینه اجاره (کد ۵۱۰۲)
- اگر به فروش/واریز مشتری اشاره داشت درآمد فروش (کد ۴۱۰۱)
- اگر به خرید کالا اشاره داشت خرید کالا (کد ۵۱۰۳)
- اگر به انتقال بین حساب‌های خودی اشاره داشت دارایی‌ها/بانک (کد ۱۰۱)

خروجی را فقط به‌صورت JSON معتبر (بدون markdown، بدون توضیح) با این ساختار برگردان:
{
 "group": "نام گروه به فارسی (دارایی‌ها/بدهی‌ها/درآمد/هزینه/سرمایه/تسویلی)",
 "account": "نام حساب به فارسی",
 "accountCode": "کد ۴ رقمی حساب به‌صورت رشته",
 "confidence": عدد بین ۰ تا ۱,
 "suggestedDescription": "شرح پیشنهادی استاندارد و کوتاه فارسی برای سند"
}

اعداد را به انگلیسی در JSON بنویس.`;

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`categorize:${ip}`, 20, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست دسته‌بندی پر شده است" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { description, amount, type } = body as {
 description?: string;
 amount?: number;
 type?: TransactionType;
 };

 if (!description || typeof description!== "string" || description.trim().length === 0) {
 return NextResponse.json(
 { success: false, error: "شرح تراکنش الزامی است" },
 { status: 400 }
 );
 }
 if (description.length > 500) {
 return NextResponse.json(
 { success: false, error: "شرح تراکنش بیش از ۵۰۰ کاراکتر است" },
 { status: 400 }
 );
 }
 if (typeof amount!== "number" || isNaN(amount)) {
 return NextResponse.json(
 { success: false, error: "مبلغ باید عدد باشد" },
 { status: 400 }
 );
 }
 if (type!== "DEBIT" && type!== "CREDIT") {
 return NextResponse.json(
 { success: false, error: "نوع تراکنش باید DEBIT یا CREDIT باشد" },
 { status: 400 }
 );
 }

 const tenant = await getTenant(req);
 const zai = await ZAI.create();

 const userPrompt = `تراکنش زیر را دسته‌بندی کن:
- شرح: ${description}
- مبلغ: ${amount.toLocaleString("en-US")} تومان
- نوع: ${type === "DEBIT"? "برداشت از حساب (DEBIT)": "واریز به حساب (CREDIT)"}`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: SYSTEM_PROMPT },
 { role: "user", content: userPrompt },
 ],
 thinking: { type: "disabled" },
 });

 const raw: string = completion?.choices?.[0]?.message?.content?? "";

 let result: CategorizeResult;
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
 const parsed = JSON.parse(cleaned.slice(start, end + 1));
 result = {
 group: String(parsed.group?? "").trim(),
 account: String(parsed.account?? "").trim(),
 accountCode: String(parsed.accountCode?? "").trim(),
 confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
 suggestedDescription: String(parsed.suggestedDescription?? "").trim(),
 };
 } catch {
 await auditLog({
 tenantId: tenant?.id?? "anonymous",
 action: "CATEGORIZE_PARSE_FAIL",
 entity: "ai.categorize",
 changes: { raw: raw.slice(0, 500) },
 req,
 });
 return NextResponse.json(
 { success: false, error: "خروجی مدل قابل تجزیه نبود", raw: raw.slice(0, 1000) },
 { status: 502 }
 );
 }

 await auditLog({
 tenantId: tenant?.id?? "anonymous",
 action: "CATEGORIZE",
 entity: "ai.categorize",
 changes: {
 description: description.slice(0, 100),
 amount,
 type,
 account: result.account,
 accountCode: result.accountCode,
 confidence: result.confidence,
 },
 req,
 });

 return NextResponse.json({ success: true, data: result });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Categorize API error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در دسته‌بندی تراکنش" },
 { status: 500 }
 );
 }
}
