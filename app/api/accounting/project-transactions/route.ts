import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/accounting/project-transactions
 *?projectId=<id> (الزامی برای GET)
 *
 * پاسخ: لیست تراکنش‌های پروژه (COST | REVENUE) با مبلغ به Number.
 */
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tid = ctx.tenantId;
 const url = new URL(req.url);
 const projectId = url.searchParams.get("projectId");

 const transactions = await db.projectTransaction.findMany({
 where: { tenantId: tid,...(projectId? { projectId }: {}) },
 orderBy: { date: "desc" },
 take: 500,
 include: { project: { select: { name: true, code: true } } },
 });

 return NextResponse.json({
 success: true,
 data: transactions.map((t) => ({
 id: t.id,
 projectId: t.projectId,
 projectName: t.project?.name?? "—",
 projectCode: t.project?.code?? "",
 type: t.type,
 amount: Number(t.amount),
 date: t.date,
 category: t.category,
 description: t.description,
 })),
 });
 } catch (err) {
 console.error("[project-transactions GET] error:", err);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تراکنش‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/accounting/project-transactions
 * body: { projectId, type: COST|REVENUE, amount, date?, category?, description? }
 */
export async function POST(req: NextRequest) {
 try {
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
 projectId,
 type,
 amount,
 date,
 category,
 description,
 } = body as {
 projectId?: string;
 type?: string;
 amount?: number;
 date?: string;
 category?: string;
 description?: string;
 };

 if (!projectId ||!type ||!amount) {
 return NextResponse.json(
 {
 success: false,
 error: "پروژه، نوع تراکنش و مبلغ الزامی است",
 },
 { status: 400 }
 );
 }

 if (!["COST", "REVENUE"].includes(type)) {
 return NextResponse.json(
 { success: false, error: "نوع باید COST یا REVENUE باشد" },
 { status: 400 }
 );
 }

 // FIX(3b-بیگ۹) MEDIUM — IDOR: قبلاً projectId بدون هیچ چک تعلق به tenant
 // مستقیم create می‌شد — کاربر tenant خودش می‌توانست تراکنش به پروژهٔ tenant
 // دیگر بچسباند (ممیشه ۱.۱۱). حالا مالکیت پروژه قبل از ثبت بررسی می‌شود.
 const ownedProject = await db.project.findFirst({
 where: { id: projectId, tenantId: tid, deletedAt: null },
 select: { id: true },
 });
 if (!ownedProject) {
 return NextResponse.json(
 { success: false, error: "پروژه مورد نظر یافت نشد" },
 { status: 404 }
 );
 }

 // FIX(3b — ممیزی ۱.۱۱): مبلغ منفی سود پروژه را خراب می‌کرد — الزامی مثبت
 const amountNum = Number(amount);
 if (!Number.isFinite(amountNum) || amountNum <= 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ تراکنش باید عددی مثبت باشد" },
 { status: 400 }
 );
 }

 const validCats = ["LABOR", "MATERIAL", "EQUIPMENT", "SUBCONTRACT", "OVERHEAD", "OTHER", ""];
 const finalCat = validCats.includes(category?? "")? category: null;

 const tx = await db.projectTransaction.create({
 data: {
 tenantId: tid,
 projectId,
 type,
 amount: BigInt(Math.round(amountNum)),
 date: date? new Date(date): new Date(),
 category: finalCat,
 description: description?? null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: tx.id,
 projectId: tx.projectId,
 type: tx.type,
 amount: Number(tx.amount),
 date: tx.date,
 category: tx.category,
 description: tx.description,
 },
 });
 } catch (err) {
 console.error("[project-transactions POST] error:", err);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت تراکنش" },
 { status: 500 }
 );
 }
}
