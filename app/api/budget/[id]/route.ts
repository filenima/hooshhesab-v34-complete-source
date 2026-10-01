import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { toEnglishDigits } from "@/lib/persian";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

/**
 * پارس امن مبلغ بودجه (تومان) برای BigInt.
 * FIX: قبلاً `BigInt(totalAmount)` با ورودی اعشاری (100.5) یا NaN
 * (`Number("1,000,000")`) کرش می‌کرد و چون حذف آیتم‌ها قبل از update بود،
 * بودجه «بدون آیتم» می‌ماند (از دست رفتن داده).
 * اکنون: ارقام فارسی پذیرفته، جداکننده‌ی ٬/،/, حذف و NaN/اعشار/منفی با
 * پیام فارسی 400 رد می‌شود.
 */
function parseBudgetAmount(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  const raw =
    typeof value === "number"
      ? String(value)
      : toEnglishDigits(String(value)).replace(/[\u066C\u060C,\s]/g, "");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

// GET /api/budget/[id] — جزئیات بودجه
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
export async function GET(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const budget = await db.budget.findFirst({
 where: { id, tenantId: auth.tenantId },
 include: { items: true },
 });
 if (!budget) {
 return NextResponse.json(
 { success: false, error: "بودجه یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({
 success: true,
 data: {
...budget,
 totalAmount: Number(budget.totalAmount),
 categories: budget.categories,
 items: budget.items.map((it) => ({
...it,
 budgetAmount: Number(it.budgetAmount),
 actualAmount: Number(it.actualAmount),
 variance: Number(it.variance),
 })),
 },
 });
 } catch (error) {
 console.error("Budget get error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت بودجه" },
 { status: 500 }
 );
 }
}

// PATCH /api/budget/[id] — ویرایش کامل بودجه
// SECURITY (C1): احراز هویت اجباری + مالکیت tenant
export async function PATCH(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;

 // SECURITY: فقط بودجه متعلق به tenant کاربر قابل ویرایش است
 const existing = await db.budget.findFirst({
 where: { id, tenantId: auth.tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "بودجه یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json();
 const {
 title,
 fiscalYear,
 period,
 totalAmount,
 categories,
 items,
 status,
 } = body as {
 title?: string;
 fiscalYear?: string;
 period?: string;
 totalAmount?: number;
 categories?: { category: string; amount: number }[];
 items?: { id?: string; category: string; period: string; budgetAmount: number; actualAmount?: number }[];
 status?: string;
 };

 // اعتبارسنجی مبالغ «قبل از» هرگونه نوشتن — رد NaN/اعشار/منفی با پیام فارسی
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
 const parsedBudget = parseBudgetAmount(it.budgetAmount);
 const parsedActual = parseBudgetAmount(it.actualAmount?? 0);
 if (parsedBudget === null || parsedActual === null) {
 return NextResponse.json(
 {
 success: false,
 error: `مبلغ آیتم ${idx + 1} نامعتبر است — عدد صحیح مثبت (تومان) وارد کنید`,
 },
 { status: 400 }
 );
 }
 if (!it.category ||!it.category.trim()) {
 return NextResponse.json(
 { success: false, error: `دسته‌بندی آیتم ${idx + 1} الزامی است` },
 { status: 400 }
 );
 }
 }
 }

 // FIX (HIGH): حذف+ایجاد آیتم‌ها و update بودجه در «یک تراکنش» اتمی —
 // قبلاً deleteMany قبل از update اجرا می‌شد و هر خطای میانی (مثل
 // BigInt(NaN)) بودجه را برای همیشه «بدون آیتم» می‌گذاشت.
 const updated = await db.$transaction(async (tx) => {
 if (items) {
 await tx.budgetItem.deleteMany({ where: { budgetId: id } });
 }

 return tx.budget.update({
 where: { id },
 data: {
...(title!== undefined? { title }: {}),
...(fiscalYear!== undefined? { fiscalYear: String(fiscalYear) }: {}),
...(period!== undefined? { period }: {}),
...(totalAmount!== undefined
? { totalAmount: BigInt(parseBudgetAmount(totalAmount)?? 0) }
: {}),
...(categories!== undefined? { categories: JSON.stringify(categories) }: {}),
...(status!== undefined? { status }: {}),
...(items?.length
? {
 items: {
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
 },
 }
: {}),
 },
 include: { items: true },
 });
 });

 return NextResponse.json({
 success: true,
 data: {
...updated,
 totalAmount: Number(updated.totalAmount),
 items: updated.items.map((it) => ({
...it,
 budgetAmount: Number(it.budgetAmount),
 actualAmount: Number(it.actualAmount),
 variance: Number(it.variance),
 })),
 },
 });
 } catch (error) {
 console.error("Budget update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ویرایش بودجه" },
 { status: 500 }
 );
 }
}

// DELETE /api/budget/[id]
// SECURITY (C1): احراز هویت اجباری + مالکیت tenant
export async function DELETE(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 // SECURITY: حذف فقط اگر متعلق به tenant کاربر باشد
 const result = await db.budget.deleteMany({
 where: { id, tenantId: auth.tenantId },
 });
 if (result.count === 0) {
 return NextResponse.json(
 { success: false, error: "بودجه یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Budget delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف بودجه" },
 { status: 500 }
 );
 }
}
