// ============ Email Sequences (Drip Campaigns) ============
// دنباله‌های ایمیل بازاریابی — مجموعه‌ای از ایمیل‌ها با تأخیر مشخص
// که پس از یک trigger (SIGNUP, TRIAL_START, TRIAL_ENDING, INACTIVE_7D, MANUAL)
// برای کاربر ارسال می‌شوند.
//
// این فایل سرور-تنها است (import از db) — در API routes استفاده می‌شود.

import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email-sender";

// ============ types ============
export interface SequenceStep {
 delayHours: number;
 templateId: string;
 subject: string;
 body: string;
}

export interface SequenceDefinition {
 name: string;
 trigger: string;
 steps: SequenceStep[];
}

// ============ Default Sequences ============
// این دنباله‌ها به‌عنوان نقطه‌ی شروع در دیتابیس seed می‌شوند
// (اگر قبلاً ایجاد نشده باشند).
export const DEFAULT_SEQUENCES: SequenceDefinition[] = [
 {
 name: "خوش‌آمدگویی",
 trigger: "SIGNUP",
 steps: [
 {
 delayHours: 0,
 templateId: "welcome",
 subject: "به هوش خوش آمدید",
 body: "سلام و خوش آمدید به هوش — پلتفرم هوشمند حسابداری.\n\nبرای شروع، از منوی اصلی به بخش «داشبورد» بروید.",
 },
 {
 delayHours: 48,
 templateId: "tutorial_1",
 subject: "ثبت اولین فاکتور",
 body: "آموزش ثبت اولین فاکتور فروش در هوش.\n\n۱. به بخش «خرید و فروش» بروید\n۲. روی «فاکتور جدید» کلیک کنید\n۳. اطلاعات طرف‌حساب و اقلام را وارد کنید",
 },
 {
 delayHours: 120,
 templateId: "tutorial_2",
 subject: "اتصال به سامانه مودیان",
 body: "راهنمای اتصال هوش به سامانه مودیان مالیاتی برای ارسال خودکار صورتحساب.",
 },
 {
 delayHours: 240,
 templateId: "tutorial_3",
 subject: "گزارش‌های مالی",
 body: "آشنایی با گزارش‌های مالی هوش: سود و زیان، ترازنامه، جریان نقدی.",
 },
 ],
 },
 {
 name: "پایان تریال",
 trigger: "TRIAL_ENDING",
 steps: [
 {
 delayHours: 0,
 templateId: "trial_ending_3d",
 subject: "۳ روز تا پایان تریال",
 body: "دوره آزمایشی شما در هوش ۳ روز دیگر به پایان می‌رسد.\n\nبرای تمدید و دسترسی دائمی، یکی از پلن‌های پولی را انتخاب کنید.",
 },
 {
 delayHours: 72,
 templateId: "trial_ended",
 subject: "تریال شما به پایان رسید",
 body: "دوره آزمایشی به پایان رسید.\n\nبرای ادامه استفاده از هوش، پلن مناسب خود را انتخاب کنید.",
 },
 ],
 },
 {
 name: "فعال‌سازی مجدد",
 trigger: "INACTIVE_7D",
 steps: [
 {
 delayHours: 0,
 templateId: "reengage",
 subject: "به هوش برگردید",
 body: "مدتی است به هوش سر نزده‌اید.\n\nآیا نیاز به کمک دارید؟ تیم پشتیبانی آماده پاسخگویی است.",
 },
 ],
 },
];

// ============ Seed defaults ============
/**
 * ایجاد دنباله‌های پیش‌فرض در دیتابیس اگر هنوز وجود ندارند.
 * این تابع idempotent است و در هر فراخوانی فقط دنباله‌های مفقود را ایجاد می‌کند.
 */
export async function seedDefaultSequences(): Promise<{ created: number; existing: number }> {
 let created = 0;
 let existing = 0;

 for (const def of DEFAULT_SEQUENCES) {
 // بررسی اینکه دنباله‌ای با همین trigger و name وجود دارد یا نه
 const found = await db.emailSequence.findFirst({
 where: { trigger: def.trigger, name: def.name },
 });
 if (found) {
 existing++;
 continue;
 }
 await db.emailSequence.create({
 data: {
 name: def.name,
 trigger: def.trigger,
 steps: JSON.stringify(def.steps),
 isActive: true,
 },
 });
 created++;
 }

 return { created, existing };
}

// ============ Enrollment ============
/**
 * ثبت‌نام یک کاربر در یک دنباله ایمیل.
 * - اگر کاربر قبلاً در همان دنباله ثبت‌نام کرده (فعال)، چیزی تغییر نمی‌کند.
 * - در غیر این‌صورت، یک Enrollment جدید با currentStep=0 و nextSendAt=now+delay[0] ایجاد می‌کند.
 *
 * @param userId شناسه کاربر
 * @param sequenceId شناسه دنباله
 * @param tenantId شناسه tenant (اختیاری — اگر ارائه نشود از user استخراج می‌شود)
 * @param userEmail ایمیل کاربر (اختیاری)
 */
export async function enrollUserInSequence(
 userId: string,
 sequenceId: string,
 tenantId?: string,
 userEmail?: string
): Promise<{ enrolled: boolean; enrollmentId: string | null; message: string }> {
 // یافتن sequence
 const sequence = await db.emailSequence.findUnique({
 where: { id: sequenceId },
 });
 if (!sequence) {
 return { enrolled: false, enrollmentId: null, message: "دنباله یافت نشد" };
 }
 if (!sequence.isActive) {
 return { enrolled: false, enrollmentId: null, message: "دنباله غیرفعال است" };
 }

 // یافتن user
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true, email: true },
 });
 if (!user) {
 return { enrolled: false, enrollmentId: null, message: "کاربر یافت نشد" };
 }

 const finalTenantId = tenantId || user.tenantId;
 const finalEmail = userEmail || user.email;

 // بررسی enrollment فعال موجود
 const existing = await db.emailSequenceEnrollment.findFirst({
 where: {
 sequenceId,
 userId,
 status: "ACTIVE",
 },
 });
 if (existing) {
 return {
 enrolled: false,
 enrollmentId: existing.id,
 message: "کاربر قبلاً در این دنباله ثبت‌نام کرده است",
 };
 }

 // محاسبه‌ی nextSendAt بر اساس delay مرحله‌ی اول
 const steps = parseSteps(sequence.steps);
 const firstStep = steps[0];
 const nextSendAt = firstStep
? new Date(Date.now() + firstStep.delayHours * 3600 * 1000)
: new Date();

 const enrollment = await db.emailSequenceEnrollment.create({
 data: {
 sequenceId,
 tenantId: finalTenantId,
 userId,
 userEmail: finalEmail,
 status: "ACTIVE",
 currentStep: 0,
 nextSendAt,
 startedAt: new Date(),
 },
 });

 return {
 enrolled: true,
 enrollmentId: enrollment.id,
 message: `کاربر در دنباله «${sequence.name}» ثبت‌نام شد`,
 };
}

// ============ Process pending sequence emails ============
/**
 * پردازش ایمیل‌های در انتظار ارسال از همه‌ی Enrollment های فعال.
 *
 * برای هر enrollment:
 * 1. اگر nextSendAt <= now ارسال ایمیل مرحله‌ی فعلی
 * 2. افزایش currentStep
 * 3. اگر مرحله‌ی بعدی وجود دارد محاسبه‌ی nextSendAt جدید
 * 4. در غیر این‌صورت علامت‌گذاری به‌عنوان COMPLETED
 *
 * این تابع می‌تواند توسط cron یا endpoint دستی فراخوانی شود.
 *
 * @param batchSize حداکثر تعداد enrollment های پردازش‌شده در هر بار (default: 50)
 */
export async function processPendingSequenceEmails(
 batchSize: number = 50
): Promise<{
 processed: number;
 sent: number;
 completed: number;
 failed: number;
 details: Array<{ enrollmentId: string; step: number; sent: boolean; error?: string }>;
}> {
 const now = new Date();

 // یافتن enrollment های فعال که nextSendAt گذشته است
 const pending = await db.emailSequenceEnrollment.findMany({
 where: {
 status: "ACTIVE",
 nextSendAt: { lte: now },
 },
 include: { sequence: true },
 take: batchSize,
 orderBy: { nextSendAt: "asc" },
 });

 const details: Array<{ enrollmentId: string; step: number; sent: boolean; error?: string }> = [];
 let sent = 0;
 let completed = 0;
 let failed = 0;

 for (const enrollment of pending) {
 const steps = parseSteps(enrollment.sequence.steps);
 if (steps.length === 0) {
 // دنباله بدون مرحله علامت‌گذاری COMPLETED
 await db.emailSequenceEnrollment.update({
 where: { id: enrollment.id },
 data: { status: "COMPLETED", completedAt: new Date(), nextSendAt: null },
 });
 completed++;
 details.push({ enrollmentId: enrollment.id, step: enrollment.currentStep, sent: false });
 continue;
 }

 const currentStepIdx = enrollment.currentStep;
 const step = steps[currentStepIdx];
 if (!step) {
 // خارج از محدوده تکمیل
 await db.emailSequenceEnrollment.update({
 where: { id: enrollment.id },
 data: { status: "COMPLETED", completedAt: new Date(), nextSendAt: null },
 });
 completed++;
 details.push({ enrollmentId: enrollment.id, step: currentStepIdx, sent: false });
 continue;
 }

 // ارسال ایمیل مرحله‌ی فعلی
 try {
 await sendEmail({
 to: enrollment.userEmail,
 subject: step.subject,
 html: `<div dir="rtl" style="font-family: Tahoma, sans-serif; line-height: 1.7; padding: 20px;">
<h2>${step.subject}</h2>
<p style="white-space: pre-line;">${step.body}</p>
<hr />
<p style="color: #888; font-size: 12px;">این ایمیل از طرف هوش ارسال شده است.</p>
</div>`,
 });
 sent++;
 details.push({ enrollmentId: enrollment.id, step: currentStepIdx, sent: true });

 // به‌روزرسانی enrollment
 const nextStepIdx = currentStepIdx + 1;
 if (nextStepIdx >= steps.length) {
 // تکمیل
 await db.emailSequenceEnrollment.update({
 where: { id: enrollment.id },
 data: {
 currentStep: nextStepIdx,
 status: "COMPLETED",
 completedAt: new Date(),
 nextSendAt: null,
 },
 });
 completed++;
 } else {
 // محاسبه‌ی nextSendAt بر اساس delay مرحله‌ی بعدی
 const nextStep = steps[nextStepIdx];
 const nextSendAt = new Date(
 now.getTime() +
 (nextStep.delayHours - step.delayHours) * 3600 * 1000
 );
 await db.emailSequenceEnrollment.update({
 where: { id: enrollment.id },
 data: { currentStep: nextStepIdx, nextSendAt },
 });
 }
 } catch (err) {
 failed++;
 const errMsg = err instanceof Error? err.message: "unknown";
 details.push({
 enrollmentId: enrollment.id,
 step: currentStepIdx,
 sent: false,
 error: errMsg,
 });
 // به‌روزرسانی nextSendAt برای retry (15 دقیقه بعد)
 const retryAt = new Date(now.getTime() + 15 * 60 * 1000);
 await db.emailSequenceEnrollment.update({
 where: { id: enrollment.id },
 data: { nextSendAt: retryAt },
 });
 }
 }

 return {
 processed: pending.length,
 sent,
 completed,
 failed,
 details,
 };
}

// ============ helpers ============
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
