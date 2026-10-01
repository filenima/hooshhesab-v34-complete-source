// دسته‌بندی هوشمند آیتم‌های فاکتور با LLM — هوش
// پیشنهاد کد حساب معین طبق چارت حساب‌های استاندارد ایران

import ZAI from "z-ai-web-dev-sdk";

/** ورودی آیتم فاکتور */
export interface CategorizeItemInput {
 description: string;
 amount: number;
}

/** خروجی پیشنهاد دسته‌بندی */
export interface CategorizeResult {
 category: string;
 accountCode: string;
 confidence: number;
 rationale?: string;
}

// کش درون‌حافظه‌ای بر اساس هش شرح
const cache = new Map<string, CategorizeResult>();

function hashKey(text: string): string {
 // هش ساده‌ی رشته‌ای برای کلید کش
 let h = 5381;
 for (let i = 0; i < text.length; i++) {
 h = ((h << 5) + h + text.charCodeAt(i)) | 0;
 }
 return `cat_${(h >>> 0).toString(16)}`;
}

const SYSTEM_PROMPT = `تو یک حسابدار حرفه‌ای ایرانی هستی و می‌خواهی شرح آیتم‌های فاکتور را به کدینگ استاندارد حسابداری ایران (چارت حساب‌های عمومی) نگاشت کنی.

ساختار پیش‌فرض کدینگ (سه سطح: گروه-کل-معین):
- دارایی‌ها (۱۰۰): ۱۰۱ موجودی نقد و بانک، ۱۰۲ حساب‌های دریافتنی، ۱۱۸ موجودی کالا، ۱۲۰ زمین و ساختمان
- بدهی‌ها (۲۰۰): ۲۰۱ حساب‌های پرداختنی، ۲۰۵ اسناد پرداختنی، ۲۱۰ مالیات پرداختنی
- سرمایه (۳۰۰): ۳۰۱ سرمایه مالک، ۳۰۵ سود انباشته
- درآمد (۴۰۰): ۴۰۱ فروش کالا، ۴۰۲ فروش خدمات، ۴۰۳ درآمد سایر
- هزینه‌ها (۵۰۰): ۵۰۱ بهای تمام شده کالای فروش رفته، ۵۰۲ هزینه حقوق و دستمزد، ۵۰۳ هزینه اجاره، ۵۰۴ هزینه تبلیغات، ۵۰۵ هزینه حمل، ۵۰۶ هزینه استهلاک، ۵۰۹ هزینه عمومی و اداری

قواعد:
- فقط JSON خروجی بده — بدون markdown و بدون توضیح اضافه
- اعداد کد حساب به انگلیسی
- اگر شرح مبهم بود، بهترین حدس را بزن و confidence را پایین بیاور (حداکثر ۰.۵)
- اگر فروش کالا یا خدمت است، از ۴xx استفاده کن
- اگر خرید کالا برای فروش است، از ۱۱۸ یا ۵۰۱ استفاده کن
- اگر هزینه عملیاتی است، از ۵xx استفاده کن

خروجی مورد نظر:
{"category": "نام دسته به فارسی", "accountCode": "کد سه‌رقمی", "confidence": 0.0 تا 1.0, "rationale": "توضیح کوتاه یک‌جمله‌ای"}`;

/**
 * دسته‌بندی یک یا چند آیتم فاکتور با استفاده از LLM.
 * نتایج بر اساس شرح کش می‌شوند تا درخواست‌های تکراری سریع‌تر باشند.
 */
export async function categorizeInvoice(
 items: CategorizeItemInput[]
): Promise<CategorizeResult[]> {
 const results: CategorizeResult[] = [];
 const pending: { idx: number; item: CategorizeItemInput }[] = [];

 // بررسی کش
 for (let i = 0; i < items.length; i++) {
 const it = items[i];
 if (!it?.description) {
 results[i] = {
 category: "متفرقه",
 accountCode: "403",
 confidence: 0.2,
 rationale: "شرح خالی",
 };
 continue;
 }
 const key = hashKey(it.description.trim().toLowerCase());
 const cached = cache.get(key);
 if (cached) {
 results[i] = cached;
 } else {
 pending.push({ idx: i, item: it });
 }
 }

 if (pending.length === 0) return results;

 // آماده‌سازی prompt با لیست آیتم‌ها
 const list = pending.map(
 (p, i) =>
 `${i + 1}. شرح: "${p.item.description}" — مبلغ: ${p.item.amount.toLocaleString("en-US")} ریال`
 ).join("\n");

 try {
 const zai = await ZAI.create();
 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: SYSTEM_PROMPT },
 {
 role: "user",
 content: `آیتم‌های زیر را دسته‌بندی کن و به‌صورت آرایه JSON برگردان (ترتیب حفظ شود):\n\n${list}\n\nخروجی فقط به این شکل:\n{"results": [{"category":"","accountCode":"","confidence":0,"rationale":""},...]}`,
 },
 ],
 thinking: { type: "disabled" },
 });

 const raw: string = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
 const start = cleaned.indexOf("{");
 const end = cleaned.lastIndexOf("}");
 if (start!== -1 && end!== -1) {
 const parsed = JSON.parse(cleaned.slice(start, end + 1));
 const arr: unknown[] = Array.isArray(parsed?.results)? parsed.results: [];
 for (let i = 0; i < pending.length; i++) {
 const p = pending[i];
 const r = arr[i] as Record<string, unknown> | undefined;
 const result: CategorizeResult = {
 category: String(r?.category?? "متفرقه").trim() || "متفرقه",
 accountCode: String(r?.accountCode?? "403").trim() || "403",
 confidence: Math.max(0, Math.min(1, Number(r?.confidence?? 0.3) || 0.3)),
 rationale: String(r?.rationale?? "").trim(),
 };
 results[p.idx] = result;
 cache.set(hashKey(p.item.description.trim().toLowerCase()), result);
 }
 } else {
 throw new Error("JSON یافت نشد");
 }
 } catch (err) {
 console.error("categorizeInvoice error:", err);
 // fallback — قواعد اکتشافی ساده
 for (const p of pending) {
 const fallback = heuristicCategorize(p.item.description);
 results[p.idx] = fallback;
 cache.set(hashKey(p.item.description.trim().toLowerCase()), fallback);
 }
 }

 return results;
}

/** قواعد اکتشافی فارسی برای fallback هنگام شکست LLM */
function heuristicCategorize(desc: string): CategorizeResult {
 const d = desc.toLowerCase();
 if (/حقوق|دستمزد|پرسنل|حق‌الکار/.test(d)) {
 return { category: "هزینه حقوق و دستمزد", accountCode: "502", confidence: 0.7, rationale: "تشخیص کلمه‌ی حقوق" };
 }
 if (/اجاره/.test(d)) {
 return { category: "هزینه اجاره", accountCode: "503", confidence: 0.7, rationale: "تشخیص کلمه‌ی اجاره" };
 }
 if (/تبلیغات|آگهی|مارکتینگ/.test(d)) {
 return { category: "هزینه تبلیغات", accountCode: "504", confidence: 0.7, rationale: "تشخیص کلمه‌ی تبلیغات" };
 }
 if (/حمل|ارسال|پست|باربری/.test(d)) {
 return { category: "هزینه حمل", accountCode: "505", confidence: 0.7, rationale: "تشخیص کلمه‌ی حمل" };
 }
 if (/فروش کالا|کالا|محصول/.test(d)) {
 return { category: "فروش کالا", accountCode: "401", confidence: 0.6, rationale: "تشخیص کلمه‌ی کالا" };
 }
 if (/خدمت|خدمات|مشاوره/.test(d)) {
 return { category: "فروش خدمات", accountCode: "402", confidence: 0.6, rationale: "تشخیص کلمه‌ی خدمت" };
 }
 return { category: "درآمد متفرقه", accountCode: "403", confidence: 0.3, rationale: "عدم تشخیص الگو" };
}

/** پاک کردن کش (برای تست یا بازنشانی) */
export function clearCategorizerCache(): void {
 cache.clear();
}
