import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/expenses
 *?type=MILEAGE|EXPENSE
 *?status=PENDING|APPROVED|REJECTED
 *?category=...
 *?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(req: NextRequest) {
 try {
 // SECURITY (C1): احراز هویت اجباری + فیلتر tenant
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tid = ctx.tenantId;
 const url = new URL(req.url);
 const type = url.searchParams.get("type");
 const status = url.searchParams.get("status");
 const category = url.searchParams.get("category");
 const from = url.searchParams.get("from");
 const to = url.searchParams.get("to");
 const skip = Math.max(0, Number(url.searchParams.get("skip") || "0"));
 // FIX (HIGH): پارامتر limit پذیرفته می‌شود — UI با ?limit=200 صدا می‌زند ولی
 // API فقط take می‌شناخت و بی‌صدا ۵۰ ردیف برمی‌گرداند
 const limitParam =
 url.searchParams.get("limit")?? url.searchParams.get("take")?? "50";
 const take = Math.min(500, Math.max(1, Number(limitParam) || 50));

 const where: Record<string, unknown> = { tenantId: tid };
 if (type) where.type = type;
 if (status) where.status = status;
 if (category) where.category = category;
 if (from || to) {
 where.date = {};
 if (from) (where.date as Record<string, unknown>).gte = new Date(from);
 if (to) (where.date as Record<string, unknown>).lte = new Date(to + "T23:59:59");
 }

 const [items, total] = await Promise.all([
 db.expenseEntry.findMany({
 where,
 orderBy: { date: "desc" },
 skip,
 take,
 }),
 db.expenseEntry.count({ where }),
 ]);

 return NextResponse.json({
 success: true,
 data: items.map((e) => ({
 id: e.id,
 type: e.type,
 amount: Number(e.amount),
 distanceKm: e.distanceKm,
 ratePerKm: e.ratePerKm,
 date: e.date,
 category: e.category,
 vendor: e.vendor,
 description: e.description,
 receiptUrl: e.receiptUrl,
 status: e.status,
 approvedAt: e.approvedAt,
 projectId: e.projectId,
 createdAt: e.createdAt,
 })),
 total,
 skip,
 take,
 limit: take,
 });
 } catch (err) {
 console.error("[expenses GET] error:", err);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت هزینه‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/expenses
 * body: { type, amount?, distanceKm?, ratePerKm?, date?, category, vendor?, description?, receiptUrl?, projectId? }
 * اگر type=MILEAGE و amount نداد، amount = distanceKm * ratePerKm محاسبه می‌شود.
 */
export async function POST(req: NextRequest) {
 try {
 // SECURITY (C1/C2): احراز هویت اجباری + فیلتر tenant
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tid = ctx.tenantId;
 const body = await req.json();
 const {
 type,
 amount,
 distanceKm,
 ratePerKm,
 date,
 category,
 vendor,
 description,
 receiptUrl,
 projectId,
 } = body as {
 type?: string;
 amount?: number;
 distanceKm?: number;
 ratePerKm?: number;
 date?: string;
 category?: string;
 vendor?: string;
 description?: string;
 receiptUrl?: string;
 projectId?: string;
 };

 if (!type ||!["MILEAGE", "EXPENSE"].includes(type)) {
 return NextResponse.json(
 { success: false, error: "نوع باید MILEAGE یا EXPENSE باشد" },
 { status: 400 }
 );
 }
 if (!category) {
 return NextResponse.json(
 { success: false, error: "دسته‌بندی الزامی است" },
 { status: 400 }
 );
 }

 let finalAmount = Number(amount) || 0;
 let finalDist: number | null = null;
 let finalRate: number | null = null;
 if (type === "MILEAGE") {
 finalDist = Number(distanceKm) > 0? Number(distanceKm): null;
 finalRate = Number(ratePerKm) >= 0? Number(ratePerKm): null;
 if (finalDist && finalRate) {
 finalAmount = Math.round(finalDist * finalRate);
 }
 if (finalAmount <= 0) {
 return NextResponse.json(
 {
 success: false,
 error: "برای مسافت، حداقل distanceKm و ratePerKm را وارد کنید",
 },
 { status: 400 }
 );
 }
 } else {
 if (finalAmount <= 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ باید بزرگ‌تر از صفر باشد" },
 { status: 400 }
 );
 }
 }

 // FIX (MEDIUM): اعتبارسنجی سخت‌گیرانه‌ی تاریخ — رشته‌ی جلالی مثل «1404/05/12»
 // توسط new Date() به «۱۲ مه ۱۴۰۴ میلادی» تبدیل می‌شد و بی‌صدا ۵۰۰ سال
 // اشتباه ذخیره می‌شد. فقط YYYY-MM-DD با بازه‌ی منطقی (۲۰۰۰–۲۱۲۵) پذیرفته است.
 let entryDate = new Date();
 if (date!== undefined && date!== null && String(date).trim()!== "") {
 const dateStr = String(date).trim();
 const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
 const year = m? Number(m[1]): NaN;
 if (!m || year < 2000 || year > 2125) {
 return NextResponse.json(
 {
 success: false,
 error:
 "تاریخ نامعتبر است — قالب میلادی YYYY-MM-DD الزامی است (مثلاً 2026-09-06)",
 },
 { status: 400 }
 );
 }
 entryDate = new Date(dateStr);
 if (Number.isNaN(entryDate.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ نامعتبر است" },
 { status: 400 }
 );
 }
 }

 const entry = await db.expenseEntry.create({
 data: {
 tenantId: tid,
 userId: ctx.userId, // FIX: کاربر ثبت‌کننده ثبت شود
 type,
 amount: BigInt(Math.round(finalAmount)),
 distanceKm: finalDist,
 ratePerKm: finalRate,
 date: entryDate,
 category,
 vendor: vendor?? null,
 description: description?? null,
 receiptUrl: receiptUrl?? null,
 projectId: projectId || null,
 status: "PENDING",
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: entry.id,
 type: entry.type,
 amount: Number(entry.amount),
 distanceKm: entry.distanceKm,
 ratePerKm: entry.ratePerKm,
 date: entry.date,
 category: entry.category,
 vendor: entry.vendor,
 description: entry.description,
 receiptUrl: entry.receiptUrl,
 status: entry.status,
 },
 });
 } catch (err) {
 console.error("[expenses POST] error:", err);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت هزینه" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/expenses?id=xxx — حذف هزینه (فقط متعلق به tenant فعلی)
 */
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tid = ctx.tenantId;
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه هزینه الزامی است" },
 { status: 400 }
 );
 }
 const existing = await db.expenseEntry.findFirst({
 where: { id, tenantId: tid },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "هزینه یافت نشد" },
 { status: 404 }
 );
 }
 await db.expenseEntry.delete({ where: { id } });
 return NextResponse.json({ success: true, message: "هزینه حذف شد" });
 } catch (err) {
 console.error("[expenses DELETE] error:", err);
 return NextResponse.json(
 { success: false, error: "خطا در حذف هزینه" },
 { status: 500 }
 );
 }
}
