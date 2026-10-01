import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, rateLimit, auditLog } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { hasModuleAccess } from "@/lib/plan-features";

export const runtime = "nodejs";

/**
 * ============ /api/insurance — ماژول بیمه (سپید/سپاه) ============
 *
 * مدیریت پرونده‌های بیمه تأمین اجتماعی (بیمه سپید/سپاه/سایر) برای هر tenant.
 *
 * - GET    → لیست همه پرونده‌های tenant (مرتب بر اساس سررسید بعدی)
 * - POST   → ایجاد پرونده جدید (اعتبارسنجی + خطای تکراری فارسی)
 * - PUT    → ویرایش پرونده (?id= یا body.id)
 * - DELETE → حذف پرونده (?id=) — مدل soft-delete ندارد؛ حذف قطعی است
 *
 * نکته واحد پول: مبالغ در دیتابیس به‌صورت BigInt «ریال» ذخیره می‌شوند
 * (همان قرارداد سایر ماژول‌ها). سمت UI تومان وارد می‌شود و ×۱۰ به ریال
 * تبدیل و ارسال می‌گردد. در پاسخ، فیلدهای *Toman هم برای راحتی ارسال می‌شود.
 *
 * GATING: بیمه (سپید/سپاه) ویژگی پلن «حرفه‌ای» است — tenant های پایه/رایگان
 * پاسخ 403 با upgrade:true می‌گیرند (همان الگوی market-sync / scheduled-reports).
 */

/** گیت پلن — اگر tenant مجاز نباشد، پاسخ 403 فارسی + upgrade:true برمی‌گرداند. */
async function ensureInsurancePlanAllowed(tenantId: string): Promise<NextResponse | null> {
 const tenant = await db.tenant.findUnique({
 where: { id: tenantId },
 select: { plan: true },
 });
 if (!hasModuleAccess(tenant?.plan ?? undefined, "insurance")) {
 return NextResponse.json(
 {
 success: false,
 error: "ماژول بیمه (سپید/سپاه) در پلن حرفه‌ای فعال است. برای استفاده، پلن خود را ارتقا دهید.",
 upgrade: true,
 },
 { status: 403 }
 );
 }
 return null;
}

const VALID_PROVIDERS = ["SEPID", "SEPAH", "OTHER"] as const;
const VALID_STATUSES = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;

const isDev = process.env.NODE_ENV !== "production";

/** عدد به رشته فارسی برای پیام‌ها */
function toPersianCount(n: number): string {
 return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** اعتبارسنجی مبلغ ریالی — باید عدد ≥ ۰ باشد. */
function parseRialAmount(
 value: unknown,
 fieldName: string
): { ok: true; amount: bigint } | { ok: false; error: string } {
 if (value === undefined || value === null || value === "") {
 return { ok: true, amount: BigInt(0) };
 }
 const n = typeof value === "number" ? value : Number(value);
 if (!Number.isFinite(n)) {
 return { ok: false, error: `مقدار «${fieldName}» باید عدد باشد` };
 }
 if (n < 0) {
 return { ok: false, error: `«${fieldName}» نمی‌تواند منفی باشد` };
 }
 if (n > Number.MAX_SAFE_INTEGER) {
 return { ok: false, error: `«${fieldName}» از سقف مجاز بیشتر است` };
 }
 return { ok: true, amount: BigInt(Math.trunc(n)) };
}

/** تبدیل تاریخ ISO (YYYY-MM-DD) به Date محلی — بدون شیفت UTC. */
function parseLocalDate(value: unknown): Date | null | { invalid: true } {
 if (value === undefined || value === null || value === "") return null;
 if (typeof value !== "string") return { invalid: true };
 const d = new Date(`${value}T00:00:00`);
 if (Number.isNaN(d.getTime())) return { invalid: true };
 return d;
}

/** تبدیل یک پرونده Prisma به شکل قابل JSON با فیلدهای تومانی. */
function serializePolicy(p: {
 id: string;
 provider: string;
 fileNumber: string;
 branchCode: string | null;
 personCount: number;
 monthlyAmount: bigint;
 debtAmount: bigint;
 status: string;
 lastPaymentDate: Date | null;
 nextDueDate: Date | null;
 notes: string | null;
 createdAt: Date;
 updatedAt: Date;
 [key: string]: unknown;
}) {
 const monthlyAmount = Number(p.monthlyAmount);
 const debtAmount = Number(p.debtAmount);
 return {
 ...p,
 monthlyAmount,
 debtAmount,
 // مبالغ در دیتابیس به‌صورت ریال ذخیره می‌شوند؛ تومان = ریال / ۱۰
 monthlyAmountToman: Math.trunc(monthlyAmount / 10),
 debtAmountToman: Math.trunc(debtAmount / 10),
 lastPaymentDate: p.lastPaymentDate ? p.lastPaymentDate.toISOString() : null,
 nextDueDate: p.nextDueDate ? p.nextDueDate.toISOString() : null,
 createdAt: p.createdAt.toISOString(),
 updatedAt: p.updatedAt.toISOString(),
 };
}

/** پیام خطای فارسی برای خطاهای رایج Prisma */
function prismaErrorMessage(code: string | undefined, fallback: string): string {
 if (code === "P2002") {
 return "این شماره پرونده قبلاً ثبت شده است";
 }
 if (code === "P2025") {
 return "پرونده بیمه یافت نشد";
 }
 return fallback;
}

// GET /api/insurance — لیست پرونده‌های بیمه tenant (مرتب بر اساس سررسید بعدی)
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const provider = searchParams.get("provider");
 const status = searchParams.get("status");

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const where: Record<string, unknown> = { tenantId: ctx.tenantId };
 // گیت پلن — فقط پلن حرفه‌ای و بالاتر
 const forbiddenList = await ensureInsurancePlanAllowed(ctx.tenantId);
 if (forbiddenList) return forbiddenList;
 if (provider && (VALID_PROVIDERS as readonly string[]).includes(provider)) {
 where.provider = provider;
 }
 if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
 where.status = status;
 }

 const policies = await db.insurancePolicy.findMany({
 where,
 orderBy: { nextDueDate: "asc" },
 });

 // سررسیدهای بدون تاریخ به انتهای لیست می‌روند (nulls-last دستی)
 const withDue = policies.filter((p) => p.nextDueDate !== null);
 const withoutDue = policies.filter((p) => p.nextDueDate === null);
 const sorted = [...withDue, ...withoutDue];

 return NextResponse.json({
 success: true,
 data: sorted.map(serializePolicy),
 total: sorted.length,
 });
 } catch (error) {
 console.error("Insurance list error:", error);
 return NextResponse.json(
 {
 success: false,
 error: "خطا در دریافت پرونده‌های بیمه",
 ...(isDev && {
 devMessage: error instanceof Error ? error.message : String(error),
 }),
 },
 { status: 500 }
 );
 }
}

// POST /api/insurance — ایجاد پرونده بیمه جدید
export async function POST(req: NextRequest) {
 try {
 // Rate limiting — هر دو سیستم (مطابق الگوی products)
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`insurance-create:${ip}`, 30, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }
 if (!rateLimit(`insurance-create:${ip}`, 30, 60000)) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const b = body as Record<string, unknown>;

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 // ===== گیت پلن + اعتبارسنجی =====
 const forbiddenCreate = await ensureInsurancePlanAllowed(ctx.tenantId);
 if (forbiddenCreate) return forbiddenCreate;

 const provider = String(b.provider ?? "").toUpperCase();
 if (!(VALID_PROVIDERS as readonly string[]).includes(provider)) {
 return NextResponse.json(
 { success: false, error: "بیمه‌گر نامعتبر است (سپید، سپاه یا سایر)" },
 { status: 400 }
 );
 }

 const fileNumber = String(b.fileNumber ?? "").trim();
 if (!fileNumber) {
 return NextResponse.json(
 { success: false, error: "شماره پرونده الزامی است" },
 { status: 400 }
 );
 }
 if (fileNumber.length > 60) {
 return NextResponse.json(
 { success: false, error: "شماره پرونده حداکثر ۶۰ کاراکتر است" },
 { status: 400 }
 );
 }

 const monthly = parseRialAmount(b.monthlyAmount, "حق بیمه ماهانه");
 if (!monthly.ok) {
 return NextResponse.json(
 { success: false, error: monthly.error },
 { status: 400 }
 );
 }
 if (monthly.amount < BigInt(0)) {
 return NextResponse.json(
 { success: false, error: "حق بیمه ماهانه نمی‌تواند منفی باشد" },
 { status: 400 }
 );
 }

 const debt = parseRialAmount(b.debtAmount, "بدهی معوقه");
 if (!debt.ok) {
 return NextResponse.json({ success: false, error: debt.error }, { status: 400 });
 }

 let personCount = 1;
 if (b.personCount !== undefined && b.personCount !== null && b.personCount !== "") {
 const pc = Number(b.personCount);
 if (!Number.isFinite(pc) || !Number.isInteger(pc) || pc < 1 || pc > 100000) {
 return NextResponse.json(
 { success: false, error: "تعداد بیمه‌شده باید عدد صحیح بزرگ‌تر از صفر باشد" },
 { status: 400 }
 );
 }
 personCount = pc;
 }

 const nextDue = parseLocalDate(b.nextDueDate);
 if (nextDue && "invalid" in nextDue) {
 return NextResponse.json(
 { success: false, error: "تاریخ سررسید بعدی نامعتبر است" },
 { status: 400 }
 );
 }

 // جلوگیری از تکراری بودن (tenantId, provider, fileNumber) — قبل از خطای Prisma
 const existing = await db.insurancePolicy.findFirst({
 where: { tenantId: ctx.tenantId, provider, fileNumber },
 select: { id: true },
 });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "این شماره پرونده قبلاً ثبت شده است" },
 { status: 409 }
 );
 }

 const policy = await db.insurancePolicy.create({
 data: {
 tenantId: ctx.tenantId,
 provider,
 fileNumber,
 branchCode: b.branchCode ? String(b.branchCode).trim().slice(0, 40) : null,
 personCount,
 monthlyAmount: monthly.amount,
 debtAmount: debt.amount,
 status: "ACTIVE",
 nextDueDate: nextDue,
 notes: b.notes ? String(b.notes).trim().slice(0, 500) : null,
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "CREATE",
 entity: "InsurancePolicy",
 entityId: policy.id,
 changes: {
 provider,
 fileNumber,
 personCount,
 monthlyAmount: Number(monthly.amount),
 debtAmount: Number(debt.amount),
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: serializePolicy(policy),
 message: "پرونده بیمه با موفقیت ایجاد شد",
 });
 } catch (error) {
 console.error("Create insurance policy error:", error);
 let prismaCode: string | undefined;
 if (error && typeof error === "object" && "code" in error) {
 prismaCode = String((error as { code: unknown }).code);
 }
 return NextResponse.json(
 {
 success: false,
 error: prismaErrorMessage(prismaCode, "خطا در ایجاد پرونده بیمه"),
 ...(isDev && {
 devMessage: error instanceof Error ? error.message : String(error),
 prismaCode,
 }),
 },
 { status: prismaCode === "P2002" ? 409 : 500 }
 );
 }
}

// PUT /api/insurance?id=xxx — ویرایش پرونده بیمه (id از کوئری یا body)
export async function PUT(req: NextRequest) {
 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`insurance-update:${ip}`, 30, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const b = body as Record<string, unknown>;
 const id = new URL(req.url).searchParams.get("id") || (typeof b.id === "string" ? b.id : "");

 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه پرونده الزامی است" },
 { status: 400 }
 );
 }

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 // گیت پلن — فقط پلن حرفه‌ای و بالاتر
 const forbiddenUpdate = await ensureInsurancePlanAllowed(ctx.tenantId);
 if (forbiddenUpdate) return forbiddenUpdate;

 // مطمئن می‌شویم پرونده متعلق به tenant فعلی است
 const existing = await db.insurancePolicy.findFirst({
 where: { id, tenantId: ctx.tenantId },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "پرونده بیمه یافت نشد" },
 { status: 404 }
 );
 }

 // ===== ساخت شیء به‌روزرسانی ایمن — فقط فیلدهای ارسال‌شده =====
 const updateData: Record<string, unknown> = {};

 if (b.provider !== undefined) {
 const provider = String(b.provider).toUpperCase();
 if (!(VALID_PROVIDERS as readonly string[]).includes(provider)) {
 return NextResponse.json(
 { success: false, error: "بیمه‌گر نامعتبر است (سپید، سپاه یا سایر)" },
 { status: 400 }
 );
 }
 updateData.provider = provider;
 }

 if (b.fileNumber !== undefined) {
 const fileNumber = String(b.fileNumber).trim();
 if (!fileNumber) {
 return NextResponse.json(
 { success: false, error: "شماره پرونده الزامی است" },
 { status: 400 }
 );
 }
 if (fileNumber.length > 60) {
 return NextResponse.json(
 { success: false, error: "شماره پرونده حداکثر ۶۰ کاراکتر است" },
 { status: 400 }
 );
 }
 updateData.fileNumber = fileNumber;
 }

 if (b.monthlyAmount !== undefined) {
 const monthly = parseRialAmount(b.monthlyAmount, "حق بیمه ماهانه");
 if (!monthly.ok) {
 return NextResponse.json({ success: false, error: monthly.error }, { status: 400 });
 }
 updateData.monthlyAmount = monthly.amount;
 }

 if (b.debtAmount !== undefined) {
 const debt = parseRialAmount(b.debtAmount, "بدهی معوقه");
 if (!debt.ok) {
 return NextResponse.json({ success: false, error: debt.error }, { status: 400 });
 }
 updateData.debtAmount = debt.amount;
 }

 if (b.personCount !== undefined) {
 const pc = Number(b.personCount);
 if (!Number.isFinite(pc) || !Number.isInteger(pc) || pc < 1 || pc > 100000) {
 return NextResponse.json(
 { success: false, error: "تعداد بیمه‌شده باید عدد صحیح بزرگ‌تر از صفر باشد" },
 { status: 400 }
 );
 }
 updateData.personCount = pc;
 }

 if (b.branchCode !== undefined) {
 const branch = String(b.branchCode ?? "").trim().slice(0, 40);
 updateData.branchCode = branch || null;
 }

 if (b.status !== undefined) {
 const status = String(b.status).toUpperCase();
 if (!(VALID_STATUSES as readonly string[]).includes(status)) {
 return NextResponse.json(
 { success: false, error: "وضعیت پرونده نامعتبر است" },
 { status: 400 }
 );
 }
 updateData.status = status;
 }

 if (b.nextDueDate !== undefined) {
 const nextDue = parseLocalDate(b.nextDueDate);
 if (nextDue && "invalid" in nextDue) {
 return NextResponse.json(
 { success: false, error: "تاریخ سررسید بعدی نامعتبر است" },
 { status: 400 }
 );
 }
 updateData.nextDueDate = nextDue;
 }

 if (b.lastPaymentDate !== undefined) {
 const lastPay = parseLocalDate(b.lastPaymentDate);
 if (lastPay && "invalid" in lastPay) {
 return NextResponse.json(
 { success: false, error: "تاریخ آخرین پرداخت نامعتبر است" },
 { status: 400 }
 );
 }
 updateData.lastPaymentDate = lastPay;
 }

 if (b.notes !== undefined) {
 const notes = String(b.notes ?? "").trim().slice(0, 500);
 updateData.notes = notes || null;
 }

 if (Object.keys(updateData).length === 0) {
 return NextResponse.json(
 { success: false, error: "داده‌ای برای به‌روزرسانی ارائه نشده" },
 { status: 400 }
 );
 }

 // تکراری بودن ترکیب (provider, fileNumber) در صورت تغییر
 const newProvider = (updateData.provider as string) ?? existing.provider;
 const newFileNumber = (updateData.fileNumber as string) ?? existing.fileNumber;
 if (newProvider !== existing.provider || newFileNumber !== existing.fileNumber) {
 const duplicate = await db.insurancePolicy.findFirst({
 where: {
 tenantId: ctx.tenantId,
 provider: newProvider,
 fileNumber: newFileNumber,
 id: { not: existing.id },
 },
 select: { id: true },
 });
 if (duplicate) {
 return NextResponse.json(
 { success: false, error: "این شماره پرونده قبلاً ثبت شده است" },
 { status: 409 }
 );
 }
 }

 const updated = await db.insurancePolicy.update({
 where: { id: existing.id },
 data: updateData,
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "UPDATE",
 entity: "InsurancePolicy",
 entityId: updated.id,
 changes: {
 ...updateData,
 monthlyAmount:
 updateData.monthlyAmount !== undefined
 ? Number(updateData.monthlyAmount)
 : undefined,
 debtAmount:
 updateData.debtAmount !== undefined
 ? Number(updateData.debtAmount)
 : undefined,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: serializePolicy(updated),
 message: "پرونده بیمه به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Update insurance policy error:", error);
 let prismaCode: string | undefined;
 if (error && typeof error === "object" && "code" in error) {
 prismaCode = String((error as { code: unknown }).code);
 }
 return NextResponse.json(
 {
 success: false,
 error: prismaErrorMessage(prismaCode, "خطا در به‌روزرسانی پرونده بیمه"),
 ...(isDev && {
 devMessage: error instanceof Error ? error.message : String(error),
 prismaCode,
 }),
 },
 { status: prismaCode === "P2002" ? 409 : 500 }
 );
 }
}

// DELETE /api/insurance?id=xxx — حذف پرونده بیمه
// مدل InsurancePolicy فیلد deletedAt ندارد (soft-delete ندارد) → حذف قطعی
export async function DELETE(req: NextRequest) {
 try {
 const id = new URL(req.url).searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه پرونده الزامی است" },
 { status: 400 }
 );
 }

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 // گیت پلن — فقط پلن حرفه‌ای و بالاتر
 const forbiddenDelete = await ensureInsurancePlanAllowed(ctx.tenantId);
 if (forbiddenDelete) return forbiddenDelete;

 // مطمئن می‌شویم پرونده متعلق به tenant فعلی است
 const policy = await db.insurancePolicy.findFirst({
 where: { id, tenantId: ctx.tenantId },
 select: { id: true, fileNumber: true, provider: true },
 });
 if (!policy) {
 return NextResponse.json(
 { success: false, error: "پرونده بیمه یافت نشد" },
 { status: 404 }
 );
 }

 await db.insurancePolicy.delete({
 where: { id: policy.id },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "DELETE",
 entity: "InsurancePolicy",
 entityId: policy.id,
 changes: { fileNumber: policy.fileNumber, provider: policy.provider },
 req,
 });

 return NextResponse.json({
 success: true,
 message: "پرونده بیمه با موفقیت حذف شد",
 });
 } catch (error) {
 console.error("Delete insurance policy error:", error);
 return NextResponse.json(
 {
 success: false,
 error: "خطا در حذف پرونده بیمه",
 ...(isDev && {
 devMessage: error instanceof Error ? error.message : String(error),
 }),
 },
 { status: 500 }
 );
 }
}
