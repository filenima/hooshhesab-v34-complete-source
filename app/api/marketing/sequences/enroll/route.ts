import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { enrollUserInSequence, seedDefaultSequences } from "@/lib/email-sequences";

export const runtime = "nodejs";

/**
 * POST /api/marketing/sequences/enroll
 * body: { userId, sequenceId? | trigger? }
 *
 * ثبت‌نام یک کاربر در یک دنباله ایمیل.
 * - اگر sequenceId مشخص ثبت‌نام در همان دنباله
 * - اگر trigger مشخص یافتن اولین دنباله فعال با آن trigger و ثبت‌نام در آن
 * - اگر هیچ‌کدام خطا
 *
 * همچنین دنباله‌های پیش‌فرض را seed می‌کند (idempotent).
 *
 * فقط ADMIN یا خود کاربر می‌تواند خودش را ثبت‌نام کند.
 * برای ثبت‌نام کاربر دیگر توسط ADMIN، userId باید ارسال شود.
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

 const sender = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true, role: true },
 });
 if (!sender) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 let userId = String(body?.userId || "").trim();
 const sequenceId = String(body?.sequenceId || "").trim() || null;
 const trigger = String(body?.trigger || "").trim().toUpperCase() || null;

 // اگر userId ارائه نشده، کاربر فعلی را ثبت‌نام می‌کنیم
 if (!userId) {
 userId = sender.id;
 } else if (userId!== sender.id && sender.role!== "ADMIN") {
 // ADMIN می‌تواند دیگران را ثبت‌نام کند
 return NextResponse.json(
 { success: false, error: "فقط مدیر می‌تواند کاربران دیگر را ثبت‌نام کند" },
 { status: 403 }
 );
 }

 // Seed دنباله‌های پیش‌فرض (idempotent)
 await seedDefaultSequences();

 // یافتن sequence
 let finalSequenceId = sequenceId;
 if (!finalSequenceId && trigger) {
 const seq = await db.emailSequence.findFirst({
 where: { trigger, isActive: true },
 orderBy: { createdAt: "asc" },
 });
 if (!seq) {
 return NextResponse.json(
 { success: false, error: `دنباله‌ای با trigger «${trigger}» یافت نشد` },
 { status: 404 }
 );
 }
 finalSequenceId = seq.id;
 }

 if (!finalSequenceId) {
 return NextResponse.json(
 { success: false, error: "sequenceId یا trigger الزامی است" },
 { status: 400 }
 );
 }

 const result = await enrollUserInSequence(userId, finalSequenceId, sender.tenantId);

 // ثبت audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId: sender.tenantId,
 userId: sender.id,
 action: "ENROLL_SEQUENCE",
 entity: "EmailSequenceEnrollment",
 entityId: result.enrollmentId || undefined,
 changes: JSON.stringify({
 targetUserId: userId,
 sequenceId: finalSequenceId,
 enrolled: result.enrolled,
 }),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: {
 enrolled: result.enrolled,
 enrollmentId: result.enrollmentId,
 message: result.message,
 },
 });
 } catch (error) {
 console.error("Enroll sequence error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت‌نام دنباله" },
 { status: 500 }
 );
 }
}
