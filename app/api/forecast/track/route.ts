import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/forecast/track — ثبت یک رکورد پیش‌بینی (به‌منظور ارزیابی دقت در آینده)
// body: { metric: string, forecastDate?: ISO, targetDate: ISO, forecastValue: number, method?: string }
// (اگر actualValue ارسال شود، accuracy محاسبه و ذخیره می‌شود)
//
// FIX (F26): فیلد `accuracy` در DB طبق اسکیمای موجود «درصد خطای مطلق (APE)» را ذخیره
// می‌کند (نه دقت) — در پاسخ، نام صادقانه‌ی `errorPct` هم برگردانده می‌شود تا با
// برچسب «دقت» اشتباه گرفته نشود. محدوده هم محدود به [0, 100] است. + rate-limit.
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

 if (!rateLimit(`forecast-track:${tenantId}`, 30, 60_000)) {
 return NextResponse.json(
 { success: false, error: "تعداد درخواست‌ها زیاد است" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const {
 metric,
 forecastDate,
 targetDate,
 forecastValue,
 actualValue,
 method = "ensemble",
 } = body as {
 metric: string;
 forecastDate?: string;
 targetDate: string;
 forecastValue: number;
 actualValue?: number;
 method?: string;
 };

 if (!metric ||!targetDate || typeof forecastValue!== "number") {
 return NextResponse.json(
 {
 success: false,
 error: "metric، targetDate و forecastValue الزامی است",
 },
 { status: 400 }
 );
 }

 // محاسبه‌ی خطای درصدی اگر actualValue فراهم باشد (FIX F26: نام صادقانه + محدود)
 let accuracy: number | null = null;
 if (typeof actualValue === "number" && actualValue!== 0) {
 accuracy = Math.min(
 100,
 Math.max(0, Math.abs((actualValue - forecastValue) / actualValue) * 100)
 );
 }

 const record = await db.forecastRecord.create({
 data: {
 tenantId,
 metric: String(metric),
 forecastDate: forecastDate? new Date(forecastDate): new Date(),
 targetDate: new Date(targetDate),
 forecastValue: Number(forecastValue),
 actualValue: typeof actualValue === "number"? Number(actualValue): null,
 accuracy,
 method: String(method),
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 ...record,
 // FIX (F26): نام صادقانه — مقدار ذخیره‌شده «درصد خطا» است، نه «دقت»
 errorPct: record.accuracy,
 },
 });
 } catch (error) {
 console.error("Forecast track error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت پیش‌بینی" },
 { status: 500 }
 );
 }
}

// GET /api/forecast/track?metric=revenue&limit=50 — فهرست رکوردهای پیش‌بینی
// اگر actualValue موجود باشد، accuracy هم بازمی‌گردد
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
 const metric = searchParams.get("metric");
 const limit = Number(searchParams.get("limit")?? "50");

 const records = await db.forecastRecord.findMany({
 where: {
 tenantId,
...(metric? { metric }: {}),
 },
 orderBy: { targetDate: "desc" },
 take: Number.isFinite(limit) && limit > 0? Math.min(limit, 500): 50,
 });

 return NextResponse.json({
 success: true,
 data: records.map((r) => ({
 id: r.id,
 metric: r.metric,
 forecastDate: r.forecastDate,
 targetDate: r.targetDate,
 forecastValue: r.forecastValue,
 actualValue: r.actualValue,
 accuracy: r.accuracy, // درصد خطای مطلق (APE) — نام DB
 errorPct: r.accuracy, // FIX (F26): نام صادقانه برای مصرف‌کننده
 method: r.method,
 createdAt: r.createdAt,
 })),
 });
 } catch (error) {
 console.error("Forecast track list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پیش‌بینی‌ها" },
 { status: 500 }
 );
 }
}
