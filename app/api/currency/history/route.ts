import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// نگاشت item key (gold:GERAM18, currency:USD) به fromCurrency در ExchangeRate
function itemToCurrencyCode(item: string): string {
 const [kind, code] = item.split(":");
 if (!code) return item;
 if (kind === "gold") return `GOLD_${code.toUpperCase()}`;
 return code.toUpperCase();
}

// GET /api/currency/history?item=gold:GERAM18&hours=24
// GET /api/currency/history?item=currency:USD&hours=168 (7d) | 720 (30d)
// خروجی: آرایه‌ای از { timestamp, rate }
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const item = searchParams.get("item");
 const hoursParam = Number(searchParams.get("hours")?? "24");

 if (!item) {
 return NextResponse.json(
 { success: false, error: "پارامتر item الزامی است (مثلاً gold:GERAM18)" },
 { status: 400 }
 );
 }
 const hours = Number.isFinite(hoursParam) && hoursParam > 0? hoursParam: 24;
 const fromCurrency = itemToCurrencyCode(item);

 const since = new Date();
 since.setHours(since.getHours() - hours);

 // برای بازه‌های کوتاه (۲۴ ساعت) همه‌ی نقاط را برمی‌گردانیم؛
 // برای بازه‌های طولانی (۷ روز/۳۰ روز) آخرین نرخ هر روز/ساعت را نگه می‌داریم.
 const records = await db.exchangeRate.findMany({
 where: {
 fromCurrency,
 toCurrency: "IRR",
 fetchedAt: { gte: since },
 },
 orderBy: { fetchedAt: "asc" },
 });

 // تجمیع بر اساس بازه (ساعتانه برای ≤۴۸ ساعت، روزانه برای بیشتر)
 const bucketMs = hours <= 48? 60 * 60 * 1000: 24 * 60 * 60 * 1000;
 const buckets = new Map<number, { rate: number; timestamp: Date; count: number; sum: number }>();
 for (const r of records) {
 const t = r.fetchedAt.getTime();
 const key = Math.floor(t / bucketMs) * bucketMs;
 const cur = buckets.get(key);
 if (cur) {
 cur.sum += r.rate;
 cur.count += 1;
 cur.rate = cur.sum / cur.count; // میانگین نرخ در bucket
 if (r.fetchedAt.getTime() > cur.timestamp.getTime()) {
 cur.timestamp = r.fetchedAt;
 }
 } else {
 buckets.set(key, { rate: r.rate, timestamp: r.fetchedAt, count: 1, sum: r.rate });
 }
 }

 const series = Array.from(buckets.values())
.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
.map((b) => ({ timestamp: b.timestamp.toISOString(), rate: b.rate }));

 // محاسبه‌ی آمار
 const rates = series.map((s) => s.rate);
 const min = rates.length > 0? Math.min(...rates): null;
 const max = rates.length > 0? Math.max(...rates): null;
 const avg =
 rates.length > 0? rates.reduce((s, v) => s + v, 0) / rates.length: null;
 const first = rates.length > 0? rates[0]: null;
 const last = rates.length > 0? rates[rates.length - 1]: null;
 const changePct =
 first!= null && last!= null && first > 0
? ((last - first) / first) * 100
: null;

 return NextResponse.json({
 success: true,
 data: {
 item,
 fromCurrency,
 hours,
 points: series.length,
 series,
 stats: {
 min,
 max,
 avg,
 first,
 last,
 changePct,
 },
 },
 });
 } catch (error) {
 console.error("Currency history error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تاریخچه" },
 { status: 500 }
 );
 }
}
