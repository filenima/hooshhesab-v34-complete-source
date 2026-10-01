// دسته‌بندی هوشمند هزینه‌ها — هوش
// نگاشت شرح هزینه به کدینگ استاندارد حسابداری ایران با LLM + کش + fallback

import ZAI from "z-ai-web-dev-sdk";

export interface ExpenseCategory {
 category: string;
 accountCode: string;
 confidence: number;
 rationale?: string;
}

// کش درون‌حافظه‌ای — کلید: هش شرح + مبلغ + تأمین‌کننده
const cache = new Map<string, ExpenseCategory[]>();

function hashKey(text: string): string {
 let h = 5381;
 for (let i = 0; i < text.length; i++) {
 h = ((h << 5) + h + text.charCodeAt(i)) | 0;
 }
 return `exp_${(h >>> 0).toString(16)}`;
}

const SYSTEM_PROMPT = `تو یک حسابدار ارشد ایرانی هستی و باید شرح هزینه‌ها را به چارت حساب‌های استاندارد ایران نگاشت کنی.

ساختار کدینگ (دسته‌بندی هزینه‌ها — گروه ۵xx):
- ۵۰۱ بهای تمام شده کالای فروش رفته
- ۵۰۲ هزینه حقوق و دستمزد
- ۵۰۳ هزینه اجاره
- ۵۰۴ هزینه تبلیغات و بازاریابی
- ۵۰۵ هزینه حمل و نقل
- ۵۰۶ هزینه استهلاک
- ۵۰۷ هزینه آب، برق، گاز
- ۵۰۸ هزینه تلفن و اینترنت
- ۵۰۹ هزینه عمومی و اداری
- ۵۱۰ هزینه تعمیر و نگهداری
- ۵۱۱ هزینه بیمه
- ۵۱۲ هزینه مالی و بانکی
- ۵۱۳ هزینه مالیات
- ۵۱۴ هزینه پیمانکاری
- ۵۱۵ هزینه تحقیق و توسعه
- ۵۱۶ هزینه آموزش
- ۵۱۷ هزینه سفر و مأموریت
- ۵۱۸ هزینه پذیرایی
- ۵۱۹ هزینه متفرقه

قواعد:
- فقط JSON خروجی بده، بدون markdown
- اعداد کد حساب به انگلیسی
- ۳ گزینه پیشنهاد بده (مرتب بر اساس احتمال) تا کاربر انتخاب کند
- اگر شرح مبهم بود confidence را پایین بیاور

خروجی:
{"results":[{"category":"","accountCode":"","confidence":0.0,"rationale":""},...]}`;

const KEYWORD_FALLBACK: { keywords: string[]; category: string; code: string }[] = [
 { keywords: ["اجاره"], category: "هزینه اجاره", code: "503" },
 { keywords: ["حقوق", "دستمزد", "حق‌الکار", "پاداش", "اضافه‌کار", "بن کارگری"], category: "هزینه حقوق و دستمزد", code: "502" },
 { keywords: ["برق"], category: "هزینه آب، برق، گاز", code: "507" },
 { keywords: ["آب"], category: "هزینه آب، برق، گاز", code: "507" },
 { keywords: ["گاز"], category: "هزینه آب، برق، گاز", code: "507" },
 { keywords: ["تلفن", "همراه", "ایرانسل", "همراه‌اول", "موبایل"], category: "هزینه تلفن و اینترنت", code: "508" },
 { keywords: ["اینترنت", "ADSL", "fiber", "فیبر", "پهنای باند", "هاست", "دامنه"], category: "هزینه تلفن و اینترنت", code: "508" },
 { keywords: ["تبلیغ", "آگهی", "مارکتینگ", "بازاریابی", "اینستاگرام", "گوگل ادز"], category: "هزینه تبلیغات و بازاریابی", code: "504" },
 { keywords: ["حمل", "ارسال", "پست", "باربری", "تریلر", "خودرو", "کرایه"], category: "هزینه حمل و نقل", code: "505" },
 { keywords: ["استهلاک", "تقلیل ارزش"], category: "هزینه استهلاک", code: "506" },
 { keywords: ["تعمیر", "نگهداری", "سرویس", "تعمیرکار"], category: "هزینه تعمیر و نگهداری", code: "510" },
 { keywords: ["بیمه", "سرمایه‌گذاری بیمه"], category: "هزینه بیمه", code: "511" },
 { keywords: ["بانک", "کمیسیون", "کارمزد بانک", "سود بانکی", "ضمانت‌نامه"], category: "هزینه مالی و بانکی", code: "512" },
 { keywords: ["مالیات"], category: "هزینه مالیات", code: "513" },
 { keywords: ["پیمان", "پیمانکار", "کرایه ساخت"], category: "هزینه پیمانکاری", code: "514" },
 { keywords: ["آزمایشگاه", "تحقیق", "R&D", "توسعه محصول"], category: "هزینه تحقیق و توسعه", code: "515" },
 { keywords: ["آموزش", "دوره", "کارگاه", "سمینار"], category: "هزینه آموزش", code: "516" },
 { keywords: ["سفر", "مأموریت", "هتل", "بلیط", "کرایه رفت‌وآمد"], category: "هزینه سفر و مأموریت", code: "517" },
 { keywords: ["پذیرایی", "ضیافت", "میوه", "چای", "قهوه", "ناهار کاری"], category: "هزینه پذیرایی", code: "518" },
 { keywords: ["لوازم التحریر", "کاغذ", "جوهر", "پرینتر", "تونر"], category: "هزینه عمومی و اداری", code: "509" },
 { keywords: ["خرید کالا", "تأمین کالا", "بهای تمام شده"], category: "بهای تمام شده کالای فروش رفته", code: "501" },
];

function fallbackCategorize(description: string): ExpenseCategory[] {
 const d = description.toLowerCase();
 const results: ExpenseCategory[] = [];
 for (const rule of KEYWORD_FALLBACK) {
 if (rule.keywords.some((kw) => d.includes(kw.toLowerCase()))) {
 results.push({
 category: rule.category,
 accountCode: rule.code,
 confidence: 0.75,
 rationale: `تشخیص کلمه‌ی کلیدی: ${rule.keywords.find((k) => d.includes(k.toLowerCase()))}`,
 });
 }
 }
 if (results.length === 0) {
 results.push({
 category: "هزینه عمومی و اداری",
 accountCode: "509",
 confidence: 0.4,
 rationale: "عدم تشخیص الگوی مشخص — پیشنهاد عمومی",
 });
 }
 // افزودن گزینه دوم متفرقه
 if (results.length < 3) {
 results.push({
 category: "هزینه متفرقه",
 accountCode: "519",
 confidence: 0.2,
 rationale: "گزینه پیش‌فرض برای هزینه‌های طبقه‌بندی‌نشده",
 });
 }
 return results.slice(0, 3);
}

/**
 * دسته‌بندی هوشمند یک هزینه بر اساس شرح، مبلغ و تأمین‌کننده.
 * خروجی: آرایه‌ای از ۳ پیشنهاد مرتب بر اساس اطمینان.
 * نتایج کش می‌شوند تا درخواست‌های تکراری سریع باشند.
 */
export async function categorizeExpense(
 description: string,
 amount: number,
 vendor?: string
): Promise<ExpenseCategory[]> {
 if (!description?.trim()) {
 return [
 {
 category: "هزینه متفرقه",
 accountCode: "519",
 confidence: 0.1,
 rationale: "شرح خالی",
 },
 ];
 }

 const cacheKey = hashKey(`${description}|${amount}|${vendor || ""}`);
 const cached = cache.get(cacheKey);
 if (cached) return cached;

 let results: ExpenseCategory[] = [];

 try {
 const zai = await ZAI.create();
 const prompt = `شرح هزینه: "${description}"
مبلغ: ${amount.toLocaleString("en-US")} ریال${vendor? `\nتأمین‌کننده: ${vendor}`: ""}

سه پیشنهاد دسته‌بندی برای این هزینه ارائه بده.`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: SYSTEM_PROMPT },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });

 const raw: string = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
 const s = cleaned.indexOf("{");
 const e = cleaned.lastIndexOf("}");
 if (s!== -1 && e!== -1) {
 const parsed = JSON.parse(cleaned.slice(s, e + 1));
 const arr: unknown[] = Array.isArray(parsed?.results)? parsed.results: [];
 for (const it of arr.slice(0, 3)) {
 const r = it as Record<string, unknown>;
 results.push({
 category: String(r?.category?? "هزینه متفرقه").trim() || "هزینه متفرقه",
 accountCode: String(r?.accountCode?? "519").trim() || "519",
 confidence: Math.max(0, Math.min(1, Number(r?.confidence?? 0.3) || 0.3)),
 rationale: String(r?.rationale?? "").trim(),
 });
 }
 }
 } catch (err) {
 console.error("categorizeExpense LLM error:", err);
 }

 if (results.length === 0) {
 results = fallbackCategorize(description);
 }

 // مرتب‌سازی بر اساس اطمینان نزولی
 results.sort((a, b) => b.confidence - a.confidence);

 cache.set(cacheKey, results);
 return results;
}

/** پاک کردن کش دسته‌بند (برای بازنشانی) */
export function clearExpenseCategorizerCache(): void {
 cache.clear();
}
