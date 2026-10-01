import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { processPendingSequenceEmails, seedDefaultSequences } from "@/lib/email-sequences";

export const runtime = "nodejs";

/**
 * POST /api/marketing/sequences/process
 * body: { batchSize?: number } (default 50)
 *
 * پردازش ایمیل‌های در انتظار ارسال از همه‌ی Enrollment های فعال.
 * این endpoint می‌تواند توسط cron یا فراخوانی دستی استفاده شود.
 *
 * فقط سوپرادمین مجاز است.
 */
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const batchSize = Math.min(Number(body?.batchSize) || 50, 500);

 // Seed دنباله‌های پیش‌فرض (idempotent) — برای اطمینان از وجود دنباله‌ها
 const seedResult = await seedDefaultSequences();

 // پردازش ایمیل‌های در انتظار
 const result = await processPendingSequenceEmails(batchSize);

 // ثبت audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId: "system",
 userId: auth.admin.id,
 action: "PROCESS_SEQUENCES",
 entity: "EmailSequenceEnrollment",
 changes: JSON.stringify({
 processed: result.processed,
 sent: result.sent,
 completed: result.completed,
 failed: result.failed,
 seeded: seedResult.created,
 }),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: {
...result,
 seeded: seedResult,
 },
 message: `${result.sent} ایمیل ارسال شد، ${result.completed} دنباله تکمیل شد${result.failed > 0? `، ${result.failed} ناموفق`: ""}`,
 });
 } catch (error) {
 console.error("Process sequences error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش دنباله‌ها" },
 { status: 500 }
 );
 }
}
