import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, rateLimit } from "@/lib/auth";
import { upsertRate } from "@/lib/currency";

export const runtime = "nodejs";

// نرخ‌های پیش‌فرض (فقط برای پاسخ در حافظه و درج اولیه در DB خالی —
// هرگز نرخ زنده‌ی ذخیره‌شده را بازنویسی نمی‌کنند)
const FALLBACK_RATES_TO_USD: Record<string, number> = {
 EUR: 0.92,
 GBP: 0.79,
 AED: 3.67,
 TRY: 32.5,
 CNY: 7.25,
 SAR: 3.75,
 IRR: 63000,
};

const USD_TO_IRR_FALLBACK = 63000;
const TARGET_CURRENCIES = ["USD", "EUR", "GBP", "AED", "TRY", "CNY", "SAR"];

/**
 * درج نرخ «فقط در صورت نبود» — fallback هیچ‌وقت نرخ زنده‌ی موجود (api/tgju/manual)
 * را بازنویسی نمی‌کند (FIX HIGH: قبلاً با قطع upstream، ۶۳٬۰۰۰ روی نرخ واقعی
 * می‌نوشت و تبدیل ارز فاکتورها را خراب می‌کرد).
 */
async function insertRateIfMissing(
 from: string,
 to: string,
 rate: number,
 source: string
): Promise<boolean> {
 try {
 const existing = await db.exchangeRate.findUnique({
 where: { fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to } },
 select: { id: true, rate: true, source: true },
 });
 if (existing) return false; // نرخ موجود — بازنویسی ممنوع
 await db.exchangeRate.create({
 data: { fromCurrency: from, toCurrency: to, rate, source },
 });
 return true;
 } catch {
 return false;
 }
}

// POST /api/currency/fetch-rates — دریافت زنده نرخ‌ها از API رایگان یا fallback
// FIX (HIGH): احراز هویت اجباری + rate-limit (قبلاً بی‌نام بود و هر اسپمر
// می‌توانست با ۴۲۹ کردن upstream، نرخ fallback را روی همه tenants بنویسد)
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 if (!rateLimit(`fetch-rates:${ctx.tenantId}`, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "تعداد درخواست‌ها زیاد است — کمی بعد تلاش کنید" },
 { status: 429 }
 );
 }

 let usdToIrr = USD_TO_IRR_FALLBACK;
 let ratesToUsd: Record<string, number> = {...FALLBACK_RATES_TO_USD };
 let source = "fallback";

 try {
 const res = await fetch(
 "https://api.exchangerate-api.com/v4/latest/USD",
 {
 // دورزدن کش
 cache: "no-store",
 signal: AbortSignal.timeout(5000),
 }
 );
 if (res.ok) {
 const json = (await res.json()) as { rates?: Record<string, number> };
 if (json.rates && json.rates.IRR) {
 usdToIrr = json.rates.IRR;
 ratesToUsd = {...json.rates };
 source = "API";
 }
 }
 } catch {
 // API در دسترس نبود — fallback استفاده می‌شود
 source = "fallback";
 }

 // ثبت نرخ‌ها در دیتابیس
 const updatedRates: { code: string; rateToIrr: number; persisted: boolean }[] = [];

 const persist = (from: string, rateToIrr: number) => {
 if (source === "API") {
 // داده‌ی زنده — upsert کامل (به‌روزرسانی نرخ قبلی مجاز است)
 return upsertRate(from, "IRR", rateToIrr, "API").then(() => true);
 }
 // FIX: در حالت fallback فقط درج در صورت نبود — بازنویسی ممنوع
 return insertRateIfMissing(from, "IRR", rateToIrr, "fallback");
 };

 // نرخ USD -> IRR
 const usdPersisted = await persist("USD", usdToIrr);
 updatedRates.push({ code: "USD", rateToIrr: usdToIrr, persisted: usdPersisted });

 // نرخ سایر ارزها به IRR (via USD)
 for (const code of TARGET_CURRENCIES) {
 if (code === "USD") continue;
 const rateToUsd = ratesToUsd[code]?? FALLBACK_RATES_TO_USD[code];
 if (!rateToUsd) continue;
 if (code === "IRR") continue;
 const converted = usdToIrr / rateToUsd; // مقدار ۱ واحد از ارز = این مقدار IRR
 const persisted = await persist(code, converted);
 updatedRates.push({ code, rateToIrr: converted, persisted });
 }

 // اطمینان از وجود ارزها در جدول Currency (در صورت نبودن، ایجاد)
 const currencyDefs = [
 { code: "USD", name: "دلار آمریکا", symbol: "$" },
 { code: "EUR", name: "یورو", symbol: "€" },
 { code: "GBP", name: "پوند انگلیسی", symbol: "£" },
 { code: "AED", name: "درهم امارات", symbol: "د.إ" },
 { code: "TRY", name: "لیر ترکیه", symbol: "₺" },
 { code: "CNY", name: "یوآن چین", symbol: "¥" },
 { code: "SAR", name: "ریال عربستان", symbol: "ر.س" },
 ];
 for (const c of currencyDefs) {
 await db.currency.upsert({
 where: { code: c.code },
 update: {},
 create: c,
 });
 }

 return NextResponse.json({
 success: true,
 data: {
 source,
 fallbackOverwriteSkipped: source === "fallback",
 fetchedAt: new Date().toISOString(),
 rates: updatedRates,
 },
 });
 } catch (error) {
 console.error("Fetch rates error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نرخ‌ها" },
 { status: 500 }
 );
 }
}
