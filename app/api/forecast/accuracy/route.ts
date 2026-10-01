import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/forecast/accuracy?days=30&metric=revenue
// محاسبه‌ی MAPE و جهت‌سنجی (Direction accuracy) برای پیش‌بینی‌هایی که actualValue دارند
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const { searchParams } = new URL(req.url);
 const days = Number(searchParams.get("days")?? "30");
 const metricFilter = searchParams.get("metric");

 const since = new Date();
 since.setDate(since.getDate() - (Number.isFinite(days)? days: 30));

 const records = await db.forecastRecord.findMany({
 where: {
 tenantId,
 targetDate: { gte: since },
 actualValue: { not: null },
...(metricFilter? { metric: metricFilter }: {}),
 },
 orderBy: { targetDate: "asc" },
 });

 if (records.length === 0) {
 return NextResponse.json({
 success: true,
 data: {
 metrics: [],
 overall: null,
 totalRecords: 0,
 evaluatedAt: new Date().toISOString(),
 },
 });
 }

 // گروه‌بندی بر اساس metric
 const byMetric = new Map<
 string,
 {
 records: Array<{
 targetDate: Date;
 forecast: number;
 actual: number;
 ape: number;
 }>;
 }
 >();
 for (const r of records) {
 if (r.actualValue == null) continue;
 const ape =
 r.actualValue!== 0
? Math.abs((r.actualValue - r.forecastValue) / r.actualValue) * 100
: Math.abs(r.forecastValue) > 0? 100: 0;
 const m = byMetric.get(r.metric)?? { records: [] };
 m.records.push({
 targetDate: r.targetDate,
 forecast: r.forecastValue,
 actual: r.actualValue,
 ape,
 });
 byMetric.set(r.metric, m);
 }

 const metrics = Array.from(byMetric.entries()).map(([metric, info]) => {
 const n = info.records.length;
 const mape = info.records.reduce((s, r) => s + r.ape, 0) / n;

 // جهت‌سنجی: آیا جهت پیش‌بینی (افزایش/کاهش نسبت به مقدار قبلی) با واقعی مطابقت داشت؟
 // مقایسه‌ی علامت (forecast - prevActual) با (actual - prevActual) برای رکوردهای متوالی
 let directionCorrect = 0;
 let directionTotal = 0;
 for (let i = 1; i < info.records.length; i++) {
 const prevActual = info.records[i - 1].actual;
 const cur = info.records[i];
 const forecastDir = Math.sign(cur.forecast - prevActual);
 const actualDir = Math.sign(cur.actual - prevActual);
 if (forecastDir!== 0 && actualDir!== 0) {
 directionTotal += 1;
 if (forecastDir === actualDir) directionCorrect += 1;
 }
 }
 const directionAccuracy =
 directionTotal > 0? (directionCorrect / directionTotal) * 100: null;

 // سری مقایسه‌ای برای نمودار
 const series = info.records.map((r) => ({
 targetDate: r.targetDate.toISOString(),
 forecast: r.forecast,
 actual: r.actual,
 }));

 return {
 metric,
 records: n,
 mape,
 directionAccuracy,
 // برچسب کیفی بر اساس MAPE
 quality:
 mape < 5
? "excellent"
: mape < 15
? "good"
: mape < 30
? "fair"
: "poor",
 series,
 };
 });

 // میانگین کلی
 const overallMape =
 metrics.length > 0
? metrics.reduce((s, m) => s + m.mape, 0) / metrics.length
: null;
 const dirMetrics = metrics.filter((m) => m.directionAccuracy!= null);
 const overallDirection =
 dirMetrics.length > 0
? dirMetrics.reduce((s, m) => s + (m.directionAccuracy?? 0), 0) /
 dirMetrics.length
: null;

 return NextResponse.json({
 success: true,
 data: {
 metrics,
 overall: {
 mape: overallMape,
 directionAccuracy: overallDirection,
 quality:
 overallMape == null
? "unknown"
: overallMape < 5
? "excellent"
: overallMape < 15
? "good"
: overallMape < 30
? "fair"
: "poor",
 },
 totalRecords: records.length,
 evaluatedAt: new Date().toISOString(),
 },
 });
 } catch (error) {
 console.error("Forecast accuracy error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه‌ی دقت" },
 { status: 500 }
 );
 }
}
