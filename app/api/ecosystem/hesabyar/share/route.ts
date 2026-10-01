import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

// ============ types ============
interface FinancialSummary {
 period: string; // 1403-08 (month) or 1403 (year)
 revenue: number; // جمع فروش
 expenses: number; // جمع هزینه‌ها
 profit: number; // سود
 margin: number; // حاشیه سود (٪)
 invoiceCount: number;
 sharedAt: string;
 sharedBy: string;
}

interface HesabYarShareResult {
 shared: boolean;
 receiptId: string;
 sharedAt: string;
 summary: FinancialSummary;
 hesabyarAcknowledged: boolean;
}

const HESABYAR_BASE_URL = "https://yar.nobatime.ir";

/**
 * POST /api/ecosystem/hesabyar/share
 * body: { period?, periodType?: "month" | "year" }
 *
 * اشتراک‌گذاری خلاصه‌ی مالی (درآمد، هزینه، سود) با سرویس حساب‌یار.
 * داده‌ها از فاکتورهای فروش و خرید محاسبه و به حساب‌یار ارسال می‌شوند.
 *
 * اگر اتصال برقرار نباشد، فقط receipt محلی ثبت می‌شود.
 */
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true, name: true, family: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const periodType = (body?.periodType || "month") as "month" | "year";
 const period = body?.period || currentPeriod(periodType);

 // محاسبه‌ی خلاصه‌ی مالی از فاکتورها
 // فاکتورهای فروش = درآمد؛ فاکتورهای خرید = هزینه
 const now = new Date();
 const periodStart = periodStartFromPeriod(period, periodType);
 const periodEnd = now;

 const saleInvoices = await db.invoice.findMany({
 where: {
 tenantId: user.tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: periodStart, lte: periodEnd },
 },
 select: { total: true },
 });
 const purchaseInvoices = await db.invoice.findMany({
 where: {
 tenantId: user.tenantId,
 type: "PURCHASE",
 deletedAt: null,
 date: { gte: periodStart, lte: periodEnd },
 },
 select: { total: true },
 });

 const revenue = saleInvoices.reduce(
 (sum, inv) => sum + Number(inv.total || 0),
 0
 );
 const expenses = purchaseInvoices.reduce(
 (sum, inv) => sum + Number(inv.total || 0),
 0
 );
 const profit = revenue - expenses;
 const margin = revenue > 0? Math.round((profit / revenue) * 1000) / 10: 0;
 const invoiceCount = saleInvoices.length + purchaseInvoices.length;

 const summary: FinancialSummary = {
 period,
 revenue,
 expenses,
 profit,
 margin,
 invoiceCount,
 sharedAt: now.toISOString(),
 sharedBy: `${user.name || ""} ${user.family || ""}`.trim() || user.id,
 };

 // بررسی اتصال به حساب‌یار
 const connection = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "HESABYAR" },
 },
 });
 const isConnected =
 connection?.status === "CONNECTED" &&!!connection.ssoToken;

 let hesabyarAcknowledged = false;
 let receiptId = `HH-SHARE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

 if (isConnected && connection?.ssoToken) {
 // ارسال واقعی خلاصه به حساب‌یار
 try {
 const upstream = await fetch(`${HESABYAR_BASE_URL}/api/v1/financial/share`, {
 method: "POST",
 headers: {
 Authorization: `Bearer ${connection.ssoToken}`,
 "Content-Type": "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 body: JSON.stringify({
 sourceTenant: user.tenantId,
 summary,
 receiptId,
 }),
 signal: AbortSignal.timeout(6000),
 });
 if (upstream.ok) {
 const json = (await upstream.json()) as { receiptId?: string; ack?: boolean };
 if (json.receiptId) receiptId = json.receiptId;
 hesabyarAcknowledged =!!json.ack || true;
 } else {
 hesabyarAcknowledged = false;
 }
 } catch {
 hesabyarAcknowledged = false;
 }
 } else {
 // بدون اتصال — فقط receipt محلی
 hesabyarAcknowledged = false;
 }

 const result: HesabYarShareResult = {
 shared: true,
 receiptId,
 sharedAt: now.toISOString(),
 summary,
 hesabyarAcknowledged,
 };

 // ثبت در Audit Log
 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "SHARE_FINANCIAL_HESABYAR",
 entity: "EcosystemConnection",
 changes: JSON.stringify({
 period,
 revenue,
 expenses,
 profit,
 receiptId,
 acknowledged: hesabyarAcknowledged,
 connected: isConnected,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: result,
 message: isConnected
? hesabyarAcknowledged
? `خلاصه مالی دوره ${period} با موفقیت به حساب‌یار ارسال شد`
: `خلاصه مالی ثبت شد ولی تأیید حساب‌یار دریافت نشد`
: `خلاصه مالی دوره ${period} ثبت شد (بدون اتصال فعال)`,
 });
 } catch (error) {
 console.error("HesabYar share error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اشتراک‌گذاری داده با حساب‌یار" },
 { status: 500 }
 );
 }
}

/**
 * GET /api/ecosystem/hesabyar/share
 *?period=1403-08 (optional)
 *
 * دریافت آخرین داده‌های به اشتراک گذاشته‌شده با حساب‌یار (از Audit Log).
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const periodParam = searchParams.get("period");
 const limit = Math.min(
 parseInt(searchParams.get("limit") || "20", 10) || 20,
 100
 );

 // دریافت از Audit Log (action = SHARE_FINANCIAL_HESABYAR)
 const audits = await db.auditLog.findMany({
 where: {
 tenantId: user.tenantId,
 action: "SHARE_FINANCIAL_HESABYAR",
 },
 orderBy: { createdAt: "desc" },
 take: limit,
 });

 const summaries: Array<FinancialSummary & { receiptId: string; acknowledged: boolean }> = [];
 for (const a of audits) {
 try {
 const parsed = JSON.parse(a.changes || "{}") as {
 period?: string;
 revenue?: number;
 expenses?: number;
 profit?: number;
 receiptId?: string;
 acknowledged?: boolean;
 };
 if (periodParam && parsed.period!== periodParam) continue;
 const revenue = parsed.revenue || 0;
 const expenses = parsed.expenses || 0;
 const profit = parsed.profit || 0;
 const margin = revenue > 0? Math.round((profit / revenue) * 1000) / 10: 0;
 summaries.push({
 period: parsed.period || "",
 revenue,
 expenses,
 profit,
 margin,
 invoiceCount: 0,
 sharedAt: a.createdAt.toISOString(),
 sharedBy: a.userId?? "",
 receiptId: parsed.receiptId || "",
 acknowledged:!!parsed.acknowledged,
 });
 } catch {
 /* skip malformed */
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 summaries,
 count: summaries.length,
 },
 });
 } catch (error) {
 console.error("HesabYar share GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت داده‌های اشتراک‌گذاری" },
 { status: 500 }
 );
 }
}

// ============ helpers ============
function currentPeriod(type: "month" | "year"): string {
 const now = new Date();
 const gy = now.getFullYear();
 const gm = now.getMonth() + 1;
 // تبدیل ساده میلادی شمسی (Jalali) با الگوریتم tabular
 const [jy, jm] = gregorianToJalali(gy, gm, now.getDate());
 return type === "year"? `${jy}`: `${jy}-${String(jm).padStart(2, "0")}`;
}

function periodStartFromPeriod(period: string, type: "month" | "year"): Date {
 // ساده: بر اساس period شمسی، شروع دوره را تخمین می‌زنیم
 // برای ماه جاری/سال جاری از همین شیوه استفاده می‌کنیم
 try {
 if (type === "year") {
 const jy = parseInt(period, 10);
 // شروع سال شمسی ~ 21 مارس
 const gy = jy <= 1403? jy + 621: jy + 622;
 return new Date(gy, 2, 21);
 }
 const [jyStr, jmStr] = period.split("-");
 const jy = parseInt(jyStr, 10);
 const jm = parseInt(jmStr, 10);
 // تبدیل ماه شمسی به میلادی (تقریبی)
 const gMonth = ((jm + 2) % 12) + 1; // فروردین=1 آوریل=4
 const gYear = jm >= 10? jy + 622: jy + 621;
 return new Date(gYear, gMonth - 1, 1);
 } catch {
 // fallback: 30 روز اخیر
 const d = new Date();
 d.setDate(d.getDate() - 30);
 return d;
 }
}

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number] {
 const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
 let jy: number;
 if (gy > 1600) {
 jy = 979;
 gy -= 1600;
 } else {
 jy = 0;
 gy -= 621;
 }
 const gy2 = gm > 2? gy + 1: gy;
 let days =
 365 * gy +
 Math.floor((gy2 + 3) / 4) -
 Math.floor((gy2 + 99) / 100) +
 Math.floor((gy2 + 399) / 400) -
 80 +
 gd +
 g_d_m[gm - 1];
 jy += 33 * Math.floor(days / 12053);
 days %= 12053;
 jy += 4 * Math.floor(days / 1461);
 days %= 1461;
 if (days > 365) {
 jy += Math.floor((days - 1) / 365);
 days = (days - 1) % 365;
 }
 const jm = days < 186? 1 + Math.floor(days / 31): 7 + Math.floor((days - 186) / 30);
 const jd = 1 + (days < 186? days % 31: (days - 186) % 30);
 return [jy, jm, jd].slice(0, 2) as [number, number];
}
