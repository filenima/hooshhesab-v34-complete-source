import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { toEnglishDigits } from "@/lib/persian";

export const runtime = "nodejs";

/** پارس امن مبلغ بودجه (تومان) — ارقام فارسی/جداکننده پذیرفته؛ NaN/اعشار/منفی → null */
function parseBudgetAmount(value: unknown): number | null {
 if (value === undefined || value === null) return 0;
 const raw =
 typeof value === "number"
 ? String(value)
 : toEnglishDigits(String(value)).replace(/[\u066C\u060C,\s]/g, "");
 const n = Number(raw);
 if (!Number.isFinite(n) || n < 0 ||!Number.isInteger(n)) return null;
 return n;
}

// GET /api/budget — فهرست بودجه‌ها
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
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
 const budgets = await db.budget.findMany({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 include: { items: true },
 });
 return NextResponse.json({
 success: true,
 data: budgets.map((b) => ({
...b,
 totalAmount: Number(b.totalAmount),
 items: b.items.map((it) => ({
...it,
 budgetAmount: Number(it.budgetAmount),
 actualAmount: Number(it.actualAmount),
 variance: Number(it.variance),
 })),
 })),
 });
 } catch (error) {
 console.error("Budget list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت بودجه‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/budget — ایجاد بودجه جدید
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
 const { title, fiscalYear, period, totalAmount, categories, items } = body as {
 title: string;
 fiscalYear: string;
 period: string;
 totalAmount: number;
 categories?: { category: string; amount: number }[];
 items?: { category: string; period: string; budgetAmount: number; actualAmount?: number }[];
 };

 if (!title ||!fiscalYear ||!period) {
 return NextResponse.json(
 { success: false, error: "عنوان، سال مالی و دوره الزامی است" },
 { status: 400 }
 );
 }

 // FIX: قبلاً fiscalYear عددی (مثلاً 1403) مستقیم به Prisma (فیلد String)
 // می‌رفت و 500 می‌داد — حالا به رشته تبدیل و ۴ رقم اعتبارسنجی می‌شود.
 const fiscalYearStr = String(fiscalYear).trim();
 if (!/^\d{4}$/.test(fiscalYearStr)) {
 return NextResponse.json(
 { success: false, error: "سال مالی باید عدد ۴ رقمی باشد (مثلاً 1403)" },
 { status: 400 }
 );
 }

 // FIX: مبالغ قبل از BigInt اعتبارسنجی می‌شوند — NaN/اعشار/منفی → ۴۰۰ فارسی
 if (totalAmount!== undefined) {
 const parsedTotal = parseBudgetAmount(totalAmount);
 if (parsedTotal === null) {
 return NextResponse.json(
 {
 success: false,
 error:
 "مبلغ کل بودجه نامعتبر است — عدد صحیح مثبت (تومان) وارد کنید (ارقام فارسی و جداکننده هزارگان مجاز است)",
 },
 { status: 400 }
 );
 }
 }
 if (Array.isArray(items)) {
 for (const [idx, it] of items.entries()) {
 if (
 parseBudgetAmount(it.budgetAmount) === null ||
 parseBudgetAmount(it.actualAmount?? 0) === null
 ) {
 return NextResponse.json(
 {
 success: false,
 error: `مبلغ آیتم ${idx + 1} نامعتبر است — عدد صحیح مثبت (تومان) وارد کنید`,
 },
 { status: 400 }
 );
 }
 }
 }

 const budget = await db.budget.create({
 data: {
 tenantId,
 title,
 fiscalYear: fiscalYearStr,
 period,
 totalAmount: BigInt(parseBudgetAmount(totalAmount)?? 0),
 categories: JSON.stringify(categories?? []),
 items: items?.length
? {
 create: items.map((it) => ({
 category: it.category,
 period: it.period,
 budgetAmount: BigInt(parseBudgetAmount(it.budgetAmount)?? 0),
 actualAmount: BigInt(parseBudgetAmount(it.actualAmount)?? 0),
 variance: BigInt(
 (parseBudgetAmount(it.actualAmount)?? 0) -
 (parseBudgetAmount(it.budgetAmount)?? 0)
 ),
 })),
 }
: undefined,
 },
 include: { items: true },
 });

 return NextResponse.json({
 success: true,
 data: serializeBudget(budget),
 });
 } catch (error) {
 console.error("Budget create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد بودجه" },
 { status: 500 }
 );
 }
}

// PATCH /api/budget — به‌روزرسانی وضعیت بودجه (active/closed)
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
export async function PATCH(req: NextRequest) {
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
 const { id, status, title } = body as {
 id: string;
 status?: string;
 title?: string;
 };
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه بودجه الزامی است" },
 { status: 400 }
 );
 }
 // SECURITY: فقط بودجه متعلق به tenant کاربر قابل ویرایش است
 const existing = await db.budget.findFirst({
 where: { id, tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "بودجه یافت نشد" },
 { status: 404 }
 );
 }
 const updated = await db.budget.update({
 where: { id },
 data: {
...(status? { status }: {}),
...(title? { title }: {}),
 },
 });
 return NextResponse.json({ success: true, data: serializeBudget(updated) });
 } catch (error) {
 console.error("Budget update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی بودجه" },
 { status: 500 }
 );
 }
}

// سریالایز کردن BigInt برای JSON
function serializeBudget(b: {
 id: string;
 tenantId: string;
 title: string;
 fiscalYear: string;
 period: string;
 totalAmount: bigint;
 categories: string;
 status: string;
 createdAt: Date;
 updatedAt: Date;
 items?: Array<{
 id: string;
 budgetId: string;
 category: string;
 period: string;
 budgetAmount: bigint;
 actualAmount: bigint;
 variance: bigint;
 }>;
}) {
 return {
 id: b.id,
 tenantId: b.tenantId,
 title: b.title,
 fiscalYear: b.fiscalYear,
 period: b.period,
 totalAmount: Number(b.totalAmount),
 categories: b.categories,
 status: b.status,
 createdAt: b.createdAt,
 updatedAt: b.updatedAt,
 items: b.items?.map((it) => ({
 id: it.id,
 budgetId: it.budgetId,
 category: it.category,
 period: it.period,
 budgetAmount: Number(it.budgetAmount),
 actualAmount: Number(it.actualAmount),
 variance: Number(it.variance),
 })),
 };
}
