import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { toLocalISODate } from "@/lib/persian";
import {
 forecast,
 detectAnomalies,
 generateSampleData,
 type ForecastResult,
} from "@/lib/forecasting";

export const runtime = "nodejs";

// POST /api/forecast — پیش‌بینی سری زمانی
// body: { source?: "revenue"|"expenses"|"cashflow", method?: string, periods?: number }
// اگر historicalData ارسال نشود، داده واقعی از فاکتورها استخراج می‌شود
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const body = await req.json();
 const {
 historicalData,
 source = "revenue",
 method = "ensemble",
 periods = 30,
 } = body as {
 historicalData?: number[];
 source?: "revenue" | "expenses" | "cashflow";
 method?: string;
 periods?: number;
 };

 let data = historicalData ?? [];

 // اگر داده ارسال نشده، از دیتابیس بخوان
 if (data.length === 0) {
 const since = new Date();
 since.setDate(since.getDate() - 90);
 // FIX (F23): فیلتر deletedAt + پارامتر source واقعاً اعمال می‌شود
 // (قبلاً همیشه سری مخلوط فروش-خرید ساخته می‌شد)؛ کلید روز با
 // toLocalISODate (بدون شیفت UTC برای ایران +03:30) ساخته می‌شود.
 const whereBase = {
 tenantId,
 date: { gte: since },
 status: { notIn: ["DRAFT", "CANCELLED"] },
 deletedAt: null as null,
 };
 const invoices = await db.invoice.findMany({
 where: {
 ...whereBase,
 type:
 source === "revenue"
 ? "SALE"
 : source === "expenses"
 ? "PURCHASE"
 : { in: ["SALE", "PURCHASE", "RETURN"] },
 },
 select: { type: true, total: true, date: true },
 });
 // گروه‌بندی روزانه
 const byDay = new Map<string, number>();
 for (const inv of invoices) {
 const key = toLocalISODate(inv.date);
 const value = Number(inv.total) / 10; // ریال به تومان
 let sign = 0;
 if (source === "revenue") {
 sign = 1; // فقط فروش (برگشتی‌ها در source=revenue لحاظ نمی‌شوند)
 } else if (source === "expenses") {
 sign = -1; // فقط خرید
 } else {
 // جریان نقدی: فروش مثبت، خرید منفی، برگشت از فروش تعدیل منفی
 sign = inv.type === "SALE" ? 1 : inv.type === "PURCHASE" ? -1 : 0;
 if (inv.type === "RETURN") {
 // برگشت از فروش — از ورودی دوره کسر می‌شود
 byDay.set(key, (byDay.get(key) ?? 0) - value);
 continue;
 }
 }
 byDay.set(key, (byDay.get(key) ?? 0) + sign * value);
 }
 const sorted = Array.from(byDay.entries()).sort((a, b) =>
 a[0].localeCompare(b[0])
 );
 data = sorted.map(([, v]) => v);
 }

 // اگر داده کافی نیست، پیش‌بینی بی‌معنی است — صریحاً اعلام کن
 // (نسخه‌ی قبلی داده‌ی نمونه‌ی تصادفی جایگزین می‌کرد که گمراه‌کننده بود)
 if (data.length < 7) {
 return NextResponse.json({
 success: false,
 error: "داده کافی برای پیش‌بینی وجود ندارد",
 code: "INSUFFICIENT_DATA",
 message:
 "برای پیش‌بینی معتبر حداقل ۷ روز داده‌ی تراکنش لازم است. لطفاً پس از ثبت چند فاکتور و هزینه دوباره تلاش کنید.",
 dataPoints: data.length,
 minimumRequired: 7,
 }, { status: 422 });
 }

 const forecastResult: ForecastResult = forecast(data, periods, method);
 const anomalies = detectAnomalies(data);

 // تولید بینش متنی
 const insight = generateInsight(forecastResult, source, data, anomalies);

 return NextResponse.json({
 success: true,
 data: {
 historical: data,
 forecast: forecastResult.predicted,
 upper: forecastResult.upper,
 lower: forecastResult.lower,
 confidence: forecastResult.confidence,
 method: forecastResult.method,
 trend: forecastResult.trend,
 seasonality: forecastResult.seasonality,
 anomalies,
 insight,
 },
 });
 } catch (error) {
 console.error("Forecast error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی" },
 { status: 500 }
 );
 }
}

function generateInsight(
 result: ForecastResult,
 source: string,
 data: number[],
 anomalies: { index: number; value: number; zScore: number }[]
): string {
 const sourceFa =
 source === "revenue"
? "درآمد"
: source === "expenses"
? "هزینه"
: "جریان نقدی";
 const trendFa =
 result.trend === "up"
? "صعودی"
: result.trend === "down"
? "نزولی"
: "پایدار";
 const confidencePct = Math.round(result.confidence * 100);
 const lastActual = data[data.length - 1]?? 0;
 const lastForecast = result.predicted[result.predicted.length - 1]?? 0;
 const changePct =
 lastActual > 0
? ((lastForecast - lastActual) / lastActual) * 100
: 0;
 const direction = changePct > 0? "افزایش": "کاهش";

 let insight = `بر اساس تحلیل ${result.method}، روند ${sourceFa} در ${result.predicted.length} روز آینده ${trendFa} ارزیابی می‌شود. `;
 insight += `سطح اطمینان پیش‌بینی ${toPersianDigits(confidencePct)}٪ است. `;
 if (Math.abs(changePct) > 5) {
 insight += `انتظار می‌رود ${sourceFa} حدود ${toPersianDigits(
 Math.abs(changePct).toFixed(1)
 )}٪ ${direction} یابد. `;
 }
 if (result.seasonality && result.seasonality.strength > 0.4) {
 insight += `الگوی فصلی با دوره ${toPersianDigits(
 result.seasonality.period
 )} روزه و شدت ${toPersianDigits(
 (result.seasonality.strength * 100).toFixed(0)
 )}٪ شناسایی شد. `;
 }
 if (anomalies.length > 0) {
 insight += `${toPersianDigits(
 anomalies.length
 )} نقطه‌ی ناهنجاری شناسایی شد که نیاز به بررسی دارند.`;
 }
 return insight;
}

function toPersianDigits(input: string | number): string {
 return String(input).replace(/[0-9]/g, (d) =>
 "۰۱۲۳۴۵۶۷۸۹"[Number(d)]
 );
}
