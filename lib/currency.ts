// مدیریت ارز و نرخ تبدیل - هوش
// مبالغ به‌صورت ریال (IRR) در دیتابیس ذخیره می‌شوند.
// تومان (TOMAN) واحد رایج نمایش است: ۱ تومان = ۱۰ ریال.
// تبدیل برای نمایش/ورودی انجام می‌شود.

import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";
import { applyMarketSyncForAnchor } from "@/lib/market-sync";

const IRR_CODE = "IRR";
const TOMAN_CODE = "TOMAN";
const TOMAN_TO_RIAL = 10; // ۱ تومان = ۱۰ ریال

// نرخ‌های پیش‌فرض (وقتی دیتابیس خالی است یا API در دسترس نیست)
const FALLBACK_RATES: Record<string, number> = {
 USD: 63000,
 EUR: 68500,
 AED: 17150,
 GBP: 80200,
 TRY: 1950,
 CNY: 8750,
 SAR: 16800,
};

/** آخرین نرخ ثبت‌شده برای جفت‌ارز (مثلاً USD -> IRR) */
export async function getLatestRate(
 from: string,
 to: string
): Promise<number | null> {
 try {
 const rate = await db.exchangeRate.findUnique({
 where: {
 fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to },
 },
 });
 if (rate) return rate.rate;
 // جستجوی معکوس
 const reverse = await db.exchangeRate.findUnique({
 where: {
 fromCurrency_toCurrency: { fromCurrency: to, toCurrency: from },
 },
 });
 if (reverse && reverse.rate > 0) return 1 / reverse.rate;
 return null;
 } catch {
 return null;
 }
}

/** تبدیل مبلغ به ریال (IRR) */
export async function convertToIrr(
 amount: number,
 fromCurrency: string
): Promise<number> {
 if (fromCurrency === IRR_CODE) return amount;
 // تومان = ریال ÷ ۱۰ برای تبدیل به ریال در ۱۰ ضرب می‌شود
 if (fromCurrency === TOMAN_CODE) return amount * TOMAN_TO_RIAL;
 const rate = (await getLatestRate(fromCurrency, IRR_CODE))??
 FALLBACK_RATES[fromCurrency]??
 1;
 return amount * rate;
}

/** تبدیل مبلغ ریالی به ارز مقصد */
export async function convertFromIrr(
 amountIrr: number,
 toCurrency: string
): Promise<number> {
 if (toCurrency === IRR_CODE) return amountIrr;
 // تومان = ریال ÷ ۱۰
 if (toCurrency === TOMAN_CODE) return amountIrr / TOMAN_TO_RIAL;
 const rate = (await getLatestRate(IRR_CODE, toCurrency))??
 (FALLBACK_RATES[toCurrency]? 1 / FALLBACK_RATES[toCurrency]: 1);
 return amountIrr * rate;
}

/** قالب‌بندی مبلغ با نماد ارز */
export function formatCurrency(amount: number, currency: string): string {
 const symbol =
 currency === IRR_CODE
? "ریال"
: currency === TOMAN_CODE
? "تومان"
: currency === "USD"
? "$"
: currency === "EUR"
? "€"
: currency === "GBP"
? "£"
: currency === "AED"
? "د.إ"
: currency === "TRY"
? "₺"
: currency === "CNY"
? "¥"
: currency === "SAR"
? "ر.س"
: currency;
 if (currency === IRR_CODE) {
 return `${toPersianDigits(
 new Intl.NumberFormat("en-US").format(Math.round(amount))
 )} ${symbol}`;
 }
 if (currency === TOMAN_CODE) {
 // تومان معمولاً اعشار ندارد — گرد کردن به نزدیک‌ترین عدد صحیح
 return `${toPersianDigits(
 new Intl.NumberFormat("en-US").format(Math.round(amount))
 )} ${symbol}`;
 }
 return `${symbol}${new Intl.NumberFormat("en-US", {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 }).format(amount)}`;
}

/** فهرست ارزهای فعال همراه با آخرین نرخ به‌روز */
export async function listActiveCurrenciesWithRates() {
 const currencies = await db.currency.findMany({
 where: { isActive: true },
 orderBy: { code: "asc" },
 });
 const rates = await db.exchangeRate.findMany({
 where: { toCurrency: IRR_CODE },
 orderBy: { fetchedAt: "desc" },
 });
 // آخرین نرخ هر ارز به IRR
 const rateMap = new Map<string, { rate: number; fetchedAt: Date; source: string }>();
 for (const r of rates) {
 if (!rateMap.has(r.fromCurrency)) {
 rateMap.set(r.fromCurrency, {
 rate: r.rate,
 fetchedAt: r.fetchedAt,
 source: r.source,
 });
 }
 }
 return currencies.map((c) => ({
...c,
 rateToIrr: rateMap.get(c.code)?.rate?? FALLBACK_RATES[c.code]?? null,
 fetchedAt: rateMap.get(c.code)?.fetchedAt?? null,
 source: rateMap.get(c.code)?.source?? "fallback",
 }));
}

/** تاریخچه نرخ‌ها برای نمودار مینی */
export async function getRateHistory(from: string, to = IRR_CODE, limit = 30) {
 // SQLite از distinct روی چند فیلد پشتیبانی محدود دارد؛ همه را می‌گیریم و درون حافظه آخرین هر روز را نگه می‌داریم
 const all = await db.exchangeRate.findMany({
 where: { fromCurrency: from, toCurrency: to },
 orderBy: { fetchedAt: "desc" },
 take: limit * 4,
 });
 const byDay = new Map<string, { rate: number; date: Date }>();
 for (const r of all) {
 const key = r.fetchedAt.toISOString().slice(0, 10);
 if (!byDay.has(key)) byDay.set(key, { rate: r.rate, date: r.fetchedAt });
 }
 return Array.from(byDay.values())
.sort((a, b) => a.date.getTime() - b.date.getTime())
.slice(-limit);
}

/**
 * ⑨ ثبت رکورد تاریخچه نرخ (ExchangeRateHistory) — به ازای «هر تغییر نرخ» یک ردیف.
 *
 * - changePercent = درصد تغییر نسبت به نرخ قبلی (گرد شده به ۲ رقم)؛ در اولین رکورد null.
 * - اگر نرخ تغییری نکرده باشد ردیف تکراری ساخته نمی‌شود (اسپم نرخ‌های ثابت تگ‌جو).
 * - کاملاً fault-tolerant: خطای تاریخچه هرگز نباید مسیر اصلی نوشتن نرخ را خراب کند.
 *
 * @param prevRate نرخ قبلی — اگر پاس نشود، از آخرین رکورد تاریخچه همان جفت‌ارز خوانده می‌شود.
 */
export async function recordRateHistory(
 from: string,
 to: string,
 rate: number,
 source: string,
 prevRate?: number | null
): Promise<void> {
 try {
 let prev = prevRate;
 if (prev === undefined) {
 const last = await db.exchangeRateHistory.findFirst({
 where: { fromCurrency: from, toCurrency: to },
 orderBy: { recordedAt: "desc" },
 select: { rate: true },
 });
 prev = last?.rate ?? null;
 }
 // نرخ ثابت — تاریخچه تکراری نساز
 if (prev!= null && prev === rate) return;
 const changePercent =
 prev!= null && prev > 0
? Math.round(((rate - prev) / prev) * 100 * 100) / 100
: null;
 await db.exchangeRateHistory.create({
 data: { fromCurrency: from, toCurrency: to, rate, changePercent, source },
 });
 } catch {
 // خطای ثبت تاریخچه نباید نوشتن نرخ را خراب کند
 }
}

/** ثبت/به‌روزرسانی نرخ */
export async function upsertRate(
 from: string,
 to: string,
 rate: number,
 source = "manual"
) {
 // ⑨ نرخ قبلی را قبل از upsert بخوان تا درصد تغییر تاریخچه دقیق باشد
 let prevRate: number | null = null;
 try {
 const existing = await db.exchangeRate.findUnique({
 where: {
 fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to },
 },
 select: { rate: true },
 });
 prevRate = existing?.rate ?? null;
 } catch {
 prevRate = null;
 }

 const saved = await db.exchangeRate.upsert({
 where: {
 fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to },
 },
 update: { rate, source, fetchedAt: new Date() },
 create: { fromCurrency: from, toCurrency: to, rate, source },
 });

 // ⑨ هوک تاریخچه نرخ: هر تغییر نرخ → یک ردیف ExchangeRateHistory
 // (منبع: manual برای ویرایش دستی، api/fallback برای fetch-rates)
 await recordRateHistory(from, to, rate, source, prevRate);
 // هوک همگام‌سازی بازار: هر نرخِ X→IRR که تغییر کند، قیمت کالاهای ردیابی‌شده
 // tenant هایی با لنگر X به‌روزرسانی می‌شود (فقط لنگرهای مطابق؛ failure-tolerant)
 try {
 if (to === IRR_CODE && rate > 0) {
 await applyMarketSyncForAnchor(from, rate);
 }
 } catch {
 // خطای هوک هرگز نباید نوشتن نرخ را خراب کند
 }
 return saved;
}
