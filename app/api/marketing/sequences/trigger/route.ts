import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

interface SequenceStep {
 delayHours: number;
 subject: string;
 body: string;
}

/**
 * POST /api/marketing/sequences/trigger
 *
 * Trigger a sequence for a specific user — enrolls them and schedules all
 * steps with the appropriate delays. Each step's email is "queued" by
 * writing an EmailSequenceEnrollment with nextSendAt set to now + delayHours.
 *
 * body: {
 * sequenceId?: string, // اگر نباشد، از trigger استفاده می‌شود
 * trigger?: string, // SIGNUP | TRIAL_START | TRIAL_ENDING | INACTIVE_7D | MANUAL
 * userId: string,
 * userEmail: string,
 * }
 *
 * پاسخ: { enrolled: true, sequenceId, steps: N, nextSendAt: ISO }
 */
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const sequenceId = String(body?.sequenceId || "").trim();
 const trigger = String(body?.trigger || "").trim().toUpperCase();
 const userId = String(body?.userId || "").trim();
 const userEmail = String(body?.userEmail || "").trim().toLowerCase();

 if (!userId ||!userEmail) {
 return NextResponse.json(
 { success: false, error: "userId و userEmail الزامی هستند" },
 { status: 400 }
 );
 }
 if (!sequenceId &&!trigger) {
 return NextResponse.json(
 { success: false, error: "یا sequenceId یا trigger الزامی است" },
 { status: 400 }
 );
 }

 // یافتن کاربر
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true, email: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // یافتن دنباله
 const where = sequenceId
? { id: sequenceId, isActive: true }
: { trigger, isActive: true };
 const sequences = await db.emailSequence.findMany({
 where,
 orderBy: { createdAt: "desc" },
 });
 if (sequences.length === 0) {
 return NextResponse.json(
 { success: false, error: "دنباله‌ی فعالی با این مشخصات یافت نشد" },
 { status: 404 }
 );
 }
 const sequence = sequences[0];

 // بررسی enrollment قبلی فعال برای همین کاربر و دنباله
 const existing = await db.emailSequenceEnrollment.findFirst({
 where: {
 sequenceId: sequence.id,
 userId: user.id,
 status: "ACTIVE",
 },
 });
 if (existing) {
 return NextResponse.json({
 success: true,
 data: {
 enrolled: false,
 message: "کاربر از قبل در این دنباله ثبت‌نام کرده است.",
 enrollmentId: existing.id,
 },
 });
 }

 // پارس steps
 let steps: SequenceStep[] = [];
 try {
 const parsed = JSON.parse(sequence.steps);
 if (Array.isArray(parsed)) {
 steps = parsed.filter(
 (s): s is SequenceStep =>
 typeof s === "object" &&
 s!== null &&
 typeof s.delayHours === "number" &&
 typeof s.subject === "string" &&
 typeof s.body === "string"
 );
 }
 } catch {
 steps = [];
 }
 if (steps.length === 0) {
 return NextResponse.json(
 { success: false, error: "دنباله هیچ مرحله‌ای ندارد" },
 { status: 400 }
 );
 }

 // محاسبه nextSendAt برای اولین مرحله
 const firstStep = steps[0];
 const nextSendAt = new Date(Date.now() + firstStep.delayHours * 3600 * 1000);

 // ایجاد enrollment
 const enrollment = await db.emailSequenceEnrollment.create({
 data: {
 sequenceId: sequence.id,
 tenantId: user.tenantId,
 userId: user.id,
 userEmail: userEmail || user.email,
 status: "ACTIVE",
 currentStep: 0,
 nextSendAt,
 startedAt: new Date(),
 },
 });

 // ثبت audit
 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: auth.admin.id,
 action: "TRIGGER",
 entity: "EmailSequence",
 entityId: sequence.id,
 changes: JSON.stringify({
 enrollmentId: enrollment.id,
 targetUserId: user.id,
 trigger: sequence.trigger,
 steps: steps.length,
 nextSendAt: nextSendAt.toISOString(),
 }),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: {
 enrolled: true,
 enrollmentId: enrollment.id,
 sequenceId: sequence.id,
 sequenceName: sequence.name,
 steps: steps.length,
 nextSendAt: nextSendAt.toISOString(),
 message: `کاربر در دنباله «${sequence.name}» با ${steps.length} مرحله ثبت‌نام شد. اولین ایمیل در ${firstStep.delayHours} ساعت آینده ارسال می‌شود.`,
 },
 });
 } catch (error) {
 console.error("Trigger sequence error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای دنباله" },
 { status: 500 }
 );
 }
}
