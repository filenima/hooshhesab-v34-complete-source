import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// ============ types ============
interface SequenceStep {
 delayHours: number;
 subject: string;
 body: string;
}

interface EmailSequenceDTO {
 id: string;
 name: string;
 trigger: string;
 steps: SequenceStep[];
 isActive: boolean;
 enrollmentsCount: number;
 createdAt: string;
 updatedAt: string;
}

const TRIGGERS = ["SIGNUP", "TRIAL_START", "TRIAL_ENDING", "INACTIVE_7D", "MANUAL"];

function parseSteps(raw: string): SequenceStep[] {
 try {
 const arr = JSON.parse(raw);
 if (!Array.isArray(arr)) return [];
 return arr.filter(
 (s): s is SequenceStep =>
 typeof s === "object" &&
 s!== null &&
 typeof s.delayHours === "number" &&
 typeof s.subject === "string" &&
 typeof s.body === "string"
 );
 } catch {
 return [];
 }
}

function toDTO(s: {
 id: string;
 name: string;
 trigger: string;
 steps: string;
 isActive: boolean;
 createdAt: Date;
 updatedAt: Date;
 _count?: { enrollments: number };
}): EmailSequenceDTO {
 return {
 id: s.id,
 name: s.name,
 trigger: s.trigger,
 steps: parseSteps(s.steps),
 isActive: s.isActive,
 enrollmentsCount: s._count?.enrollments || 0,
 createdAt: s.createdAt.toISOString(),
 updatedAt: s.updatedAt.toISOString(),
 };
}

/**
 * GET /api/marketing/sequences — فهرست همه دنباله‌های ایمیل
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const triggerFilter = searchParams.get("trigger");
 const includeInactive = searchParams.get("all") === "1";

 const sequences = await db.emailSequence.findMany({
 where: {
...(triggerFilter && TRIGGERS.includes(triggerFilter)
? { trigger: triggerFilter }
: {}),
...(includeInactive? {}: { isActive: true }),
 },
 orderBy: { createdAt: "desc" },
 include: { _count: { select: { enrollments: true } } },
 });

 return NextResponse.json({
 success: true,
 data: sequences.map(toDTO),
 });
 } catch (error) {
 console.error("List sequences error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت دنباله‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/marketing/sequences — ایجاد دنباله جدید
 * body: { name, trigger, steps: [{delayHours, subject, body}], isActive? }
 */
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const name = String(body?.name || "").trim();
 const trigger = String(body?.trigger || "").trim().toUpperCase();
 const steps = Array.isArray(body?.steps)? body.steps: [];
 const isActive = body?.isActive!== false;

 // اعتبارسنجی
 if (!name || name.length < 2) {
 return NextResponse.json(
 { success: false, error: "نام دنباله الزامی است (حداقل ۲ کاراکتر)" },
 { status: 400 }
 );
 }
 if (!TRIGGERS.includes(trigger)) {
 return NextResponse.json(
 {
 success: false,
 error: `trigger باید یکی از ${TRIGGERS.join(", ")} باشد`,
 },
 { status: 400 }
 );
 }
 if (steps.length === 0) {
 return NextResponse.json(
 { success: false, error: "حداقل یک مرحله (step) الزامی است" },
 { status: 400 }
 );
 }

 // پاک‌سازی و اعتبارسنجی steps
 const cleanSteps: SequenceStep[] = steps
.map((s: unknown) => {
 if (typeof s!== "object" || s === null) return null;
 const step = s as Record<string, unknown>;
 const delayHours = Number(step.delayHours);
 const subject = String(step.subject || "").trim();
 const stepBody = String(step.body || "").trim();
 if (isNaN(delayHours) || delayHours < 0 ||!subject ||!stepBody) return null;
 return { delayHours, subject, body: stepBody };
 })
.filter((s): s is SequenceStep => s!== null);

 if (cleanSteps.length === 0) {
 return NextResponse.json(
 { success: false, error: "مراحل نامعتبر — هر مرحله نیاز به delayHours، subject و body دارد" },
 { status: 400 }
 );
 }

 const seq = await db.emailSequence.create({
 data: {
 name,
 trigger,
 steps: JSON.stringify(cleanSteps),
 isActive,
 },
 });

 // audit
 try {
 await db.auditLog.create({
 data: {
 tenantId: "system",
 userId: auth.admin.id,
 action: "CREATE",
 entity: "EmailSequence",
 entityId: seq.id,
 changes: JSON.stringify({ name, trigger, steps: cleanSteps.length }),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: toDTO({...seq, _count: { enrollments: 0 } }),
 message: `دنباله «${name}» با ${cleanSteps.length} مرحله ایجاد شد`,
 });
 } catch (error) {
 console.error("Create sequence error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد دنباله" },
 { status: 500 }
 );
 }
}

/**
 * PATCH /api/marketing/sequences — به‌روزرسانی دنباله موجود
 * body: { id, name?, trigger?, steps?, isActive? }
 */
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const id = String(body?.id || "").trim();
 if (!id) {
 return NextResponse.json(
 { success: false, error: "id الزامی است" },
 { status: 400 }
 );
 }

 const existing = await db.emailSequence.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "دنباله یافت نشد" },
 { status: 404 }
 );
 }

 const data: Record<string, unknown> = {};
 if (typeof body.name === "string" && body.name.trim().length >= 2) {
 data.name = body.name.trim();
 }
 if (typeof body.trigger === "string") {
 const t = body.trigger.trim().toUpperCase();
 if (TRIGGERS.includes(t)) data.trigger = t;
 }
 if (Array.isArray(body.steps)) {
 const cleanSteps: SequenceStep[] = body.steps
.map((s: unknown) => {
 if (typeof s!== "object" || s === null) return null;
 const step = s as Record<string, unknown>;
 const delayHours = Number(step.delayHours);
 const subject = String(step.subject || "").trim();
 const stepBody = String(step.body || "").trim();
 if (isNaN(delayHours) || delayHours < 0 ||!subject ||!stepBody) return null;
 return { delayHours, subject, body: stepBody };
 })
.filter((s): s is SequenceStep => s!== null);
 if (cleanSteps.length > 0) {
 data.steps = JSON.stringify(cleanSteps);
 }
 }
 if (typeof body.isActive === "boolean") {
 data.isActive = body.isActive;
 }

 const updated = await db.emailSequence.update({
 where: { id },
 data,
 include: { _count: { select: { enrollments: true } } },
 });

 return NextResponse.json({
 success: true,
 data: toDTO(updated),
 });
 } catch (error) {
 console.error("Update sequence error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی دنباله" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/marketing/sequences?id=... — حذف دنباله
 */
export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id") || "";
 if (!id) {
 return NextResponse.json(
 { success: false, error: "id الزامی است" },
 { status: 400 }
 );
 }

 // بررسی وجود enrollment های فعال — اگر هست، soft-delete (isActive=false)
 const activeEnrollments = await db.emailSequenceEnrollment.count({
 where: { sequenceId: id, status: "ACTIVE" },
 });

 if (activeEnrollments > 0) {
 await db.emailSequence.update({
 where: { id },
 data: { isActive: false },
 });
 return NextResponse.json({
 success: true,
 message: `دنباله غیرفعال شد (${activeEnrollments} ثبت‌نام فعال باقی ماند)`,
 });
 }

 await db.emailSequence.delete({ where: { id } });
 return NextResponse.json({
 success: true,
 message: "دنباله حذف شد",
 });
 } catch (error) {
 console.error("Delete sequence error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف دنباله" },
 { status: 500 }
 );
 }
}
