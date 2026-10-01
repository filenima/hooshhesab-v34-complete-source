import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { computeRatioInputBuckets } from "@/lib/ratio-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/accounting/ratios — محاسبه واقعی نسبت‌های مالی از دیتابیس
// پشتیبانی از دوره: month / quarter / year
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant.
// FIXED (H1): قبلاً داده‌های نمونه ثابت برمی‌گرداند. اکنون از JournalLine+Account+AccountGroup
// محاسبه می‌شود. اگر داده‌ای نبود، صفرها با flag `hasData: false` برمی‌گردد.
//
// FIXED (F20): ضرایب ساختگی (COGS=٪۷۰ هزینه‌ها، دارایی جاری=٪۶۰ دارایی، نقد=٪۱۸ و...)
// حذف شدند. همه‌ی اجزا از دفتر کل (طبقه‌بندی استاندارد کدینگ) یا منابع عملیاتی واقعی
// (بانک/انبار/فاکتورهای باز) محاسبه می‌شوند — سطل خالی = نسبت null با یادداشت فارسی.
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

 const period = (req.nextUrl.searchParams.get("period") || "month") as
 | "month"
 | "quarter"
 | "year";

 // محاسبه بازه‌ی زمانی بر اساس دوره (روز آخر دوره کامل شامل می‌شود)
 const now = new Date();
 const startDate = new Date(now);
 if (period === "month") {
 startDate.setMonth(startDate.getMonth() - 1);
 } else if (period === "quarter") {
 startDate.setMonth(startDate.getMonth() - 3);
 } else {
 startDate.setFullYear(startDate.getFullYear() - 1);
 }

 // اجزای واقعی نسبت‌ها از دفتر کل + منابع عملیاتی (بدون ضریب ساختگی)
 const b = await computeRatioInputBuckets(tenantId, startDate, now);

 const hasData =
 b.hasLedgerData ||
 b.totalAssets > 0 ||
 b.totalLiabilities > 0 ||
 b.revenue > 0 ||
 b.receivables > 0 ||
 b.payables > 0 ||
 b.cash > 0;

 // اگر داده‌ای نبود، همه‌ی مقادیر صفر می‌شوند (به‌جای داده‌ی فیک)
 if (!hasData) {
 return NextResponse.json({
 success: true,
 data: {
 healthScore: 0,
 hasData: false,
 period,
 message:
 "هنوز سند دفتری یا فاکتور/بانکی در این دوره ثبت نشده است. پس از ثبت داده، نسبت‌های مالی محاسبه می‌شوند.",
 groups: [
 {
 key: "liquidity",
 title: "نسبت‌های نقدینگی",
 items: [],
 avgValue: 0,
 trend: "neutral",
 },
 {
 key: "profitability",
 title: "نسبت‌های سودآوری",
 items: [],
 avgValue: 0,
 trend: "neutral",
 },
 {
 key: "efficiency",
 title: "نسبت‌های کارایی",
 items: [],
 avgValue: 0,
 trend: "neutral",
 },
 {
 key: "leverage",
 title: "نسبت‌های اهرمی",
 items: [],
 avgValue: 0,
 trend: "neutral",
 },
 ],
 },
 });
 }

 const liquidityDataAvailable = b.currentAssets > 0 && b.currentLiabilities > 0;
 const ratios = computeRatios({
 currentAssets: b.currentAssets,
 inventory: b.inventory,
 cash: b.cash,
 currentLiabilities: b.currentLiabilities,
 revenue: b.revenue,
 cogs: b.cogs,
 netIncome: b.netIncome,
 totalAssets: b.totalAssets,
 avgAssets: b.avgAssets,
 equity: b.equity,
 avgEquity: b.avgEquity,
 totalDebt: b.totalLiabilities,
 receivables: b.receivables,
 avgReceivables: b.avgReceivables,
 liquidityDataAvailable,
 });

 return NextResponse.json({
 success: true,
 data: {
 ...ratios,
 hasData: true,
 period,
 // یادداشت‌های صادقانه درباره‌ی سطل‌های بدون داده (F20)
 notes: b.notes,
 },
 });
 } catch (error) {
 console.error("Financial ratios error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در محاسبه نسبت‌های مالی" },
 { status: 500 }
 );
 }
}

// ============ Ratio Computation (from real DB aggregates) ============

type RatioStatus = "good" | "warning" | "danger";

function status(value: number, goodMin: number, warnMin: number): RatioStatus {
 if (value >= goodMin) return "good";
 if (value >= warnMin) return "warning";
 return "danger";
}

function progress(value: number, max: number): number {
 return Math.min(100, Math.round((value / max) * 100));
}

interface RatioItem {
 key: string;
 name: string;
 value: number | null;
 formula: string;
 status: RatioStatus;
 progress: number;
 note?: string;
}

interface RatioGroup {
 key: string;
 title: string;
 items: RatioItem[];
 avgValue: number;
 trend: "up" | "down" | "neutral";
 note?: string;
}

interface RatiosData {
 healthScore: number;
 groups: RatioGroup[];
}

function safeDiv(a: number, b: number): number {
 if (!b || b === 0) return 0;
 return a / b;
}

function computeRatios(a: {
 currentAssets: number;
 inventory: number;
 cash: number;
 currentLiabilities: number;
 revenue: number;
 cogs: number;
 netIncome: number;
 totalAssets: number;
 avgAssets: number;
 equity: number;
 avgEquity: number;
 totalDebt: number;
 receivables: number;
 avgReceivables: number;
 liquidityDataAvailable: boolean;
}): RatiosData {
 // Liquidity — اگر تفکیک دارایی/بدهی جاری در دسترس نیست، نسبت null با توضیح صادقانه
 const noLiquidityNote =
 "تفکیک دارایی جاری/بدهی جاری در دسترس نیست (کدینگ ۱۱xx/۲۱xx و فاکتور باز یافت نشد) — نسبت محاسبه نشد.";
 const currentRatio = safeDiv(a.currentAssets, a.currentLiabilities);
 const quickRatio = safeDiv(a.currentAssets - a.inventory, a.currentLiabilities);
 const cashRatio = safeDiv(a.cash, a.currentLiabilities);
 const liquidityItems: RatioItem[] = a.liquidityDataAvailable
 ? [
 {
 key: "current",
 name: "نسبت جاری",
 value: currentRatio,
 formula: "دارایی جاری ÷ بدهی جاری",
 status: status(currentRatio, 1.5, 1.0),
 progress: progress(currentRatio, 2.5),
 },
 {
 key: "quick",
 name: "نسبت سریع",
 value: quickRatio,
 formula: "(دارایی جاری - موجودی) ÷ بدهی جاری",
 status: status(quickRatio, 1.0, 0.7),
 progress: progress(quickRatio, 2.0),
 },
 {
 key: "cash",
 name: "نسبت نقد",
 value: cashRatio,
 formula: "(نقد + اوراق بهادار) ÷ بدهی جاری",
 status: status(cashRatio, 0.5, 0.25),
 progress: progress(cashRatio, 1.0),
 },
 ]
 : [
 {
 key: "current",
 name: "نسبت جاری",
 value: null,
 formula: "دارایی جاری ÷ بدهی جاری",
 status: "warning",
 progress: 0,
 note: noLiquidityNote,
 },
 {
 key: "quick",
 name: "نسبت سریع",
 value: null,
 formula: "(دارایی جاری - موجودی) ÷ بدهی جاری",
 status: "warning",
 progress: 0,
 note: noLiquidityNote,
 },
 {
 key: "cash",
 name: "نسبت نقد",
 value: null,
 formula: "(نقد + اوراق بهادار) ÷ بدهی جاری",
 status: "warning",
 progress: 0,
 note: noLiquidityNote,
 },
 ];

 // Profitability
 const grossMargin = safeDiv(a.revenue - a.cogs, a.revenue) * 100;
 const netMargin = safeDiv(a.netIncome, a.revenue) * 100;
 const roa = safeDiv(a.netIncome, a.avgAssets) * 100;
 const roe = safeDiv(a.netIncome, a.avgEquity) * 100;

 const profitabilityItems: RatioItem[] = [
 {
 key: "gross-margin",
 name: "حاشیه سود ناخالص",
 value: a.revenue > 0 ? grossMargin : null,
 formula: "(درآمد فروش - بهای تمام شده) ÷ درآمد فروش",
 status: status(grossMargin, 30, 20),
 progress: progress(grossMargin, 50),
 note:
 a.cogs === 0
 ? "بهای تمام‌شده (حساب‌های ۵۱) در دفاتر گردش ندارد — این عدد «حاشیه بدون بهای تمام‌شده» است."
 : undefined,
 },
 {
 key: "net-margin",
 name: "حاشیه سود خالص",
 value: a.revenue > 0 ? netMargin : null,
 formula: "سود خالص ÷ درآمد فروش",
 status: status(netMargin, 10, 5),
 progress: progress(netMargin, 25),
 },
 {
 key: "roa",
 name: "بازده دارایی (ROA)",
 value: a.avgAssets > 0 ? roa : null,
 formula: "سود خالص ÷ میانگین دارایی‌ها",
 status: status(roa, 8, 4),
 progress: progress(roa, 20),
 },
 {
 key: "roe",
 name: "بازده حقوق صاحبان (ROE)",
 value: a.avgEquity > 0 ? roe : null,
 formula: "سود خالص ÷ میانگین حقوق صاحبان",
 status: status(roe, 15, 8),
 progress: progress(roe, 30),
 },
 ];

 // Efficiency
 const inventoryTurnover = safeDiv(a.cogs, a.inventory);
 const receivableTurnover = safeDiv(a.revenue, a.avgReceivables);
 const assetTurnover = safeDiv(a.revenue, a.avgAssets);

 const efficiencyItems: RatioItem[] = [
 {
 key: "inventory-turnover",
 name: "گردش موجودی",
 value: a.inventory > 0 ? inventoryTurnover : null,
 formula: "بهای فروش ÷ میانگین موجودی",
 status: status(inventoryTurnover, 5, 3),
 progress: progress(inventoryTurnover, 8),
 note: a.inventory === 0 ? "موجودی انبار/دفتری در دسترس نیست." : undefined,
 },
 {
 key: "receivable-turnover",
 name: "گردش مطالبات",
 value: a.avgReceivables > 0 ? receivableTurnover : null,
 formula: "درآمد فروش نسی ÷ میانگین مطالبات",
 status: status(receivableTurnover, 4, 2.5),
 progress: progress(receivableTurnover, 8),
 note: a.avgReceivables === 0 ? "مطالبات در دسترس نیست." : undefined,
 },
 {
 key: "asset-turnover",
 name: "گردش دارایی",
 value: a.avgAssets > 0 ? assetTurnover : null,
 formula: "درآمد فروش ÷ میانگین کل دارایی‌ها",
 status: status(assetTurnover, 1.5, 0.8),
 progress: progress(assetTurnover, 3),
 },
 ];

 // Leverage
 const debtRatio = safeDiv(a.totalDebt, a.totalAssets);
 const equityRatio = safeDiv(a.equity, a.totalAssets);
 const debtToEquity = safeDiv(a.totalDebt, a.equity);

 const leverageItems: RatioItem[] = [
 {
 key: "debt-ratio",
 name: "نسبت بدهی",
 value: a.totalAssets > 0 ? debtRatio : null,
 formula: "کل بدهی ÷ کل دارایی",
 status: debtRatio <= 0.5 ? "good" : debtRatio <= 0.65 ? "warning" : "danger",
 progress: progress(debtRatio, 1.0),
 },
 {
 key: "equity-ratio",
 name: "نسبت حقوق",
 value: a.totalAssets > 0 ? equityRatio : null,
 formula: "حقوق صاحبان ÷ کل دارایی",
 status: equityRatio >= 0.5 ? "good" : equityRatio >= 0.35 ? "warning" : "danger",
 progress: progress(equityRatio, 1.0),
 },
 {
 key: "debt-to-equity",
 name: "نسبت بدهی به حقوق",
 value: a.equity > 0 ? debtToEquity : null,
 formula: "کل بدهی ÷ حقوق صاحبان",
 status: debtToEquity <= 1.0 ? "good" : debtToEquity <= 1.5 ? "warning" : "danger",
 progress: progress(debtToEquity, 2.0),
 note: a.equity === 0 ? "حقوق صاحبان سرمایه در دفاتر ثبت نشده است." : undefined,
 },
 ];

 const avg = (items: RatioItem[]): number => {
 const valued = items.filter((i) => i.value != null);
 if (valued.length === 0) return 0;
 return valued.reduce((s, i) => s + (i.value ?? 0), 0) / valued.length;
 };

 const groups: RatioGroup[] = [
 {
 key: "liquidity",
 title: "نسبت‌های نقدینگی",
 items: liquidityItems,
 avgValue: avg(liquidityItems),
 trend: "neutral",
 note: a.liquidityDataAvailable ? undefined : noLiquidityNote,
 },
 {
 key: "profitability",
 title: "نسبت‌های سودآوری",
 items: profitabilityItems,
 avgValue: avg(profitabilityItems),
 trend: "neutral",
 },
 {
 key: "efficiency",
 title: "نسبت‌های کارایی",
 items: efficiencyItems,
 avgValue: avg(efficiencyItems),
 trend: "neutral",
 },
 {
 key: "leverage",
 title: "نسبت‌های اهرمی",
 items: leverageItems,
 avgValue: avg(leverageItems),
 trend: "neutral",
 },
 ];

 // Health Score: weighted average of good ratios (نسبت‌های null در امتیاز لحاظ نمی‌شوند)
 const totalRatios = groups.reduce(
 (s, g) => s + g.items.filter((i) => i.value != null).length,
 0
 );
 const goodRatios = groups.reduce(
 (s, g) => s + g.items.filter((i) => i.value != null && i.status === "good").length,
 0
 );
 const warnRatios = groups.reduce(
 (s, g) => s + g.items.filter((i) => i.value != null && i.status === "warning").length,
 0
 );
 const healthScore =
 totalRatios === 0
 ? 0
 : Math.round((goodRatios / totalRatios) * 100 + (warnRatios / totalRatios) * 50);

 return { healthScore: Math.min(100, healthScore), groups };
}
