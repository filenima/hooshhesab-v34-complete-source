import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * ماژول پیمانکاری — پروژه‌ها (Projects / Contracting)
 *
 * GET /api/projects فهرست پروژه‌های tenant فعال
 * POST /api/projects ایجاد پروژه جدید
 * PATCH /api/projects به‌روزرسانی وضعیت یا پیشرفت پروژه
 *
 * مدل Project (Prisma):
 * id, tenantId, code, name, clientId?, startDate, endDate?,
 * contractValue (BigInt), status, progress (Float), createdAt, updatedAt, deletedAt
 *
 * تمام پاسخ‌ها فارسی است. مبالغ (contractValue) به‌صورت BigInt
 * در DB ذخیره می‌شوند و در پاسخ به Number تبدیل می‌شوند.
 */

// وضعیت‌های مجاز در schema: ACTIVE | COMPLETED | SUSPENDED
const ALLOWED_STATUSES = ["ACTIVE", "COMPLETED", "SUSPENDED"] as const;
type ProjectStatus = (typeof ALLOWED_STATUSES)[number];

interface SerializedProject {
 id: string;
 tenantId: string;
 code: string;
 name: string;
 clientId: string | null;
 startDate: string;
 endDate: string | null;
 contractValue: number;
 status: string;
 progress: number;
 createdAt: string;
 updatedAt: string;
}

/** سریالایز یک Project برای پاسخ JSON (تبدیل BigInt Number) */
function serialize(project: {
 id: string;
 tenantId: string;
 code: string;
 name: string;
 clientId: string | null;
 startDate: Date;
 endDate: Date | null;
 contractValue: bigint;
 status: string;
 progress: number;
 createdAt: Date;
 updatedAt: Date;
 deletedAt: Date | null;
}): SerializedProject {
 return {
 id: project.id,
 tenantId: project.tenantId,
 code: project.code,
 name: project.name,
 clientId: project.clientId,
 startDate: project.startDate.toISOString(),
 endDate: project.endDate? project.endDate.toISOString(): null,
 contractValue: Number(project.contractValue),
 status: project.status,
 progress: project.progress,
 createdAt: project.createdAt.toISOString(),
 updatedAt: project.updatedAt.toISOString(),
 };
}

// ============ GET: لیست پروژه‌ها ============
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

 const projects = await db.project.findMany({
 where: {
 tenantId,
 deletedAt: null,
 },
 orderBy: { createdAt: "desc" },
 });

 const serialized = projects.map(serialize);

 return NextResponse.json({ success: true, data: serialized });
 } catch (error) {
 console.error("Projects list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پروژه‌های پیمانکاری" },
 { status: 500 }
 );
 }
}

// ============ POST: ایجاد پروژه جدید ============
export async function POST(req: NextRequest) {
 try {
 const body = await req.json().catch(() => null);
 if (!body || typeof body!== "object") {
 return NextResponse.json(
 { success: false, error: "بدنه درخواست نامعتبر است" },
 { status: 400 }
 );
 }

 const {
 name,
 code,
 clientId,
 contractValue,
 startDate,
 endDate,
 status,
 progress,
 } = body as {
 name?: unknown;
 code?: unknown;
 clientId?: unknown;
 contractValue?: unknown;
 startDate?: unknown;
 endDate?: unknown;
 status?: unknown;
 progress?: unknown;
 };

 // اعتبارسنجی فیلدهای الزامی
 if (typeof name!== "string" ||!name.trim()) {
 return NextResponse.json(
 { success: false, error: "نام پروژه الزامی است" },
 { status: 400 }
 );
 }
 if (typeof code!== "string" ||!code.trim()) {
 return NextResponse.json(
 { success: false, error: "کد پروژه الزامی است" },
 { status: 400 }
 );
 }

 // تاریخ شروع
 if (typeof startDate!== "string" ||!startDate.trim()) {
 return NextResponse.json(
 { success: false, error: "تاریخ شروع پروژه الزامی است" },
 { status: 400 }
 );
 }
 const start = new Date(startDate);
 if (Number.isNaN(start.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ شروع نامعتبر است" },
 { status: 400 }
 );
 }

 // تاریخ پایان (اختیاری)
 let end: Date | null = null;
 if (typeof endDate === "string" && endDate.trim()) {
 end = new Date(endDate);
 if (Number.isNaN(end.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ پایان نامعتبر است" },
 { status: 400 }
 );
 }
 }

 // مبلغ قرارداد (BigInt در DB، Int/عدد در ورودی)
 let value = 0;
 if (contractValue!== undefined && contractValue!== null) {
 value = Number(contractValue);
 if (!Number.isFinite(value) || value < 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ قرارداد باید عددی غیرمنفی باشد" },
 { status: 400 }
 );
 }
 }

 // وضعیت
 let finalStatus: ProjectStatus = "ACTIVE";
 if (typeof status === "string" && status.trim()) {
 if (!ALLOWED_STATUSES.includes(status as ProjectStatus)) {
 return NextResponse.json(
 {
 success: false,
 error: `وضعیت باید یکی از ${ALLOWED_STATUSES.join("، ")} باشد`,
 },
 { status: 400 }
 );
 }
 finalStatus = status as ProjectStatus;
 }

 // پیشرفت
 let progressValue = 0;
 if (progress!== undefined && progress!== null) {
 progressValue = Number(progress);
 if (!Number.isFinite(progressValue) || progressValue < 0 || progressValue > 100) {
 return NextResponse.json(
 { success: false, error: "میزان پیشرفت باید عددی بین ۰ تا ۱۰۰ باشد" },
 { status: 400 }
 );
 }
 }

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 // بررسی یکتا بودن کد در tenant
 const existing = await db.project.findFirst({
 where: { tenantId: tenantId, code: code.trim() },
 });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "پروژه‌ای با این کد قبلاً ثبت شده است" },
 { status: 409 }
 );
 }

 const created = await db.project.create({
 data: {
 tenantId: tenantId,
 code: code.trim(),
 name: name.trim(),
 clientId:
 typeof clientId === "string" && clientId.trim()? clientId.trim(): null,
 startDate: start,
 endDate: end,
 contractValue: BigInt(Math.round(value)),
 status: finalStatus,
 progress: progressValue,
 },
 });

 return NextResponse.json(
 {
 success: true,
 data: serialize(created),
 message: "پروژه پیمانکاری با موفقیت ایجاد شد",
 },
 { status: 201 }
 );
 } catch (error) {
 console.error("Project create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد پروژه پیمانکاری" },
 { status: 500 }
 );
 }
}

// ============ PATCH: به‌روزرسانی وضعیت یا پیشرفت ============
export async function PATCH(req: NextRequest) {
 try {
 const body = await req.json().catch(() => null);
 if (!body || typeof body!== "object") {
 return NextResponse.json(
 { success: false, error: "بدنه درخواست نامعتبر است" },
 { status: 400 }
 );
 }

 const { id, status, progress } = body as {
 id?: unknown;
 status?: unknown;
 progress?: unknown;
 };

 if (typeof id!== "string" ||!id.trim()) {
 return NextResponse.json(
 { success: false, error: "شناسه پروژه الزامی است" },
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
 const tenantId = ctx.tenantId;
 // اطمینان از تعلق پروژه به tenant فعال
 const existing = await db.project.findFirst({
 where: { id: id.trim(), tenantId: tenantId, deletedAt: null },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "پروژه مورد نظر یافت نشد" },
 { status: 404 }
 );
 }

 // ساخت آبجکت به‌روزرسانی فقط با فیلدهای ارسالی
 const updateData: { status?: string; progress?: number } = {};

 if (status!== undefined && status!== null) {
 if (
 typeof status!== "string" ||
!ALLOWED_STATUSES.includes(status as ProjectStatus)
 ) {
 return NextResponse.json(
 {
 success: false,
 error: `وضعیت باید یکی از ${ALLOWED_STATUSES.join("، ")} باشد`,
 },
 { status: 400 }
 );
 }
 updateData.status = status as ProjectStatus;
 }

 if (progress!== undefined && progress!== null) {
 const p = Number(progress);
 if (!Number.isFinite(p) || p < 0 || p > 100) {
 return NextResponse.json(
 { success: false, error: "میزان پیشرفت باید عددی بین ۰ تا ۱۰۰ باشد" },
 { status: 400 }
 );
 }
 updateData.progress = p;
 }

 if (Object.keys(updateData).length === 0) {
 return NextResponse.json(
 {
 success: false,
 error: "هیچ فیلدی برای به‌روزرسانی ارسال نشده است",
 },
 { status: 400 }
 );
 }

 const updated = await db.project.update({
 where: { id: existing.id },
 data: updateData,
 });

 return NextResponse.json({
 success: true,
 data: serialize(updated),
 message: "پروژه با موفقیت به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Project update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی پروژه" },
 { status: 500 }
 );
 }
}
