import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upsertRate, getRateHistory } from "@/lib/currency";
import { cacheGetOrSet, cacheDeleteByPrefix, CACHE_TTL } from "@/lib/cache";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// نگاشت کدهای طلا در ExchangeRate به فرمت قابل نمایش
const GOLD_ITEMS = [
 { code: "GOLD_GERAM18", name: "طلای ۱۸ عیار", symbol: "گرم", isGold: true },
 { code: "GOLD_SEKEE", name: "سکه امامی", symbol: "عدد", isGold: true },
 { code: "GOLD_ONSE", name: "انس طلا", symbol: "اونس", isGold: true },
 { code: "GOLD_MESGHAL", name: "مثقال طلا", symbol: "مثقال", isGold: true },
] as const;

const CACHE_KEY = "currency:list";

// GET /api/currency — فهرست ارزهای فعال + آخرین نرخ‌ها (شامل طلا و سکه)
// GET /api/currency?history=USD — تاریخچه نرخ یک ارز
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const historyCode = searchParams.get("history");
 if (historyCode) {
 // تاریخچه ۳۰ روزه — TTL کوتاه چون هر ساعت ردیف جدید ممکن است اضافه شود
 const history = await cacheGetOrSet(
 `currency:history:${historyCode.toUpperCase()}`,
 () => getRateHistory(historyCode.toUpperCase(), "IRR", 30),
 CACHE_TTL.STANDARD
 );
 return NextResponse.json({
 success: true,
 history: history.map((h) => ({
 rate: h.rate,
 date: h.date.toISOString(),
 })),
 });
 }
 // داده‌های نرخ ارز به‌ندرت تغییر می‌کنند (cron روزانه)؛ کش ۵ دقیقه‌ای
 // فشار دیتابیس را روی ۱۰۰+ کاربر همزمان به‌شدت کاهش می‌دهد.
 const result = await cacheGetOrSet(
 CACHE_KEY,
 async () => buildCurrencyList(),
 CACHE_TTL.MEDIUM
 );

 return NextResponse.json(
 { success: true, data: result },
 { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" } }
 );
 } catch (error) {
 console.error("Currency list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت ارزها" },
 { status: 500 }
 );
 }
}

// ساخت لیست ارزها + طلا از روی دیتابیس (در کش ذخیره می‌شود)
async function buildCurrencyList() {
 const [currencies, rates] = await Promise.all([
 db.currency.findMany({ orderBy: { code: "asc" } }),
 db.exchangeRate.findMany({ orderBy: { fetchedAt: "desc" } }),
 ]);

 // نگاشت آخرین نرخ هر جفت ارز
 const rateMap = new Map<
 string,
 { rate: number; fetchedAt: Date; source: string }
 >();
 for (const r of rates) {
 const key = `${r.fromCurrency}->${r.toCurrency}`;
 if (!rateMap.has(key)) {
 rateMap.set(key, {
 rate: r.rate,
 fetchedAt: r.fetchedAt,
 source: r.source,
 });
 }
 }

 const currencyRows = currencies.map((c) => ({
 id: c.id,
 code: c.code,
 name: c.name,
 symbol: c.symbol,
 isActive: c.isActive,
 isGold: false,
 rateToIrr: rateMap.get(`${c.code}->IRR`)?.rate?? null,
 fetchedAt: rateMap.get(`${c.code}->IRR`)?.fetchedAt?? null,
 source: rateMap.get(`${c.code}->IRR`)?.source?? null,
 }));

 const goldRows = GOLD_ITEMS.map((g) => ({
 id: `gold-${g.code}`,
 code: g.code,
 name: g.name,
 symbol: g.symbol,
 isActive: true,
 isGold: true,
 rateToIrr: rateMap.get(`${g.code}->IRR`)?.rate?? null,
 fetchedAt: rateMap.get(`${g.code}->IRR`)?.fetchedAt?? null,
 source: rateMap.get(`${g.code}->IRR`)?.source?? null,
 }));

 return [...goldRows,...currencyRows];
}

// POST /api/currency — افزودن ارز جدید (نیازمند احراز هویت)
export async function POST(req: NextRequest) {
 try {
 // FIX امنیتی: دستکاری نرخ ارز روی محاسبه مالی همه فاکتورها اثر دارد — فقط کاربر احراز هویت‌شده
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const body = await req.json();
 const { code, name, symbol } = body as {
 code: string;
 name: string;
 symbol: string;
 };
 if (!code ||!name ||!symbol) {
 return NextResponse.json(
 { success: false, error: "کد، نام و نماد ارز الزامی است" },
 { status: 400 }
 );
 }
 const currency = await db.currency.create({
 data: {
 code: String(code).toUpperCase(),
 name: String(name),
 symbol: String(symbol),
 },
 });
 cacheDeleteByPrefix("currency:");
 return NextResponse.json({ success: true, data: currency });
 } catch (error) {
 console.error("Currency create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد ارز" },
 { status: 500 }
 );
 }
}

// PATCH /api/currency — به‌روزرسانی نرخ یا وضعیت ارز (نیازمند احراز هویت)
export async function PATCH(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const body = await req.json();
 const { code, rate, isActive } = body as {
 code: string;
 rate?: number;
 isActive?: boolean;
 };

 if (!code) {
 return NextResponse.json(
 { success: false, error: "کد ارز الزامی است" },
 { status: 400 }
 );
 }

 if (typeof rate === "number" && rate > 0) {
 await upsertRate(String(code).toUpperCase(), "IRR", rate, "manual");
 }

 if (typeof isActive === "boolean") {
 await db.currency.updateMany({
 where: { code: String(code).toUpperCase() },
 data: { isActive },
 });
 }

 // کش را باطل کن تا نرخ جدید فوراً دیده شود
 cacheDeleteByPrefix("currency:");
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Currency update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}
