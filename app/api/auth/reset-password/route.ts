import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/platform-auth";
import { getPasswordPolicy } from "@/lib/system-settings";
import { validatePassword } from "@/lib/password-policy";
import {
 rateLimitCheck,
 buildRateLimitResponse,
 getClientIp as getRateLimitIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/reset-password
// Body: { token: string, newPassword: string }
//
// اعتبارسنجی توکن بازیابی رمز عبور و تنظیم رمز جدید.
// توکن در AuditLog با action=PASSWORD_RESET_REQUEST و entityId=tokenHash ذخیره شده.
// برای جلوگیری از نشت اطلاعات، در صورت نامعتبر بودن توکن، پیام کلی برمی‌گردد.
//
// SECURITY:
// - توکن به‌صورت SHA-256 هش و مقایسه می‌شود (یک‌طرفه)
// - توکن پس از استفاده invalid می‌شود (changes.used=true)
// - انقضای توکن ۲۴ ساعت است
// - سیاست رمز عبور پیش از اعمال بررسی می‌شود
// - rate limit برای جلوگیری از brute-force
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // ۲۴ ساعت — باید با forgot-password یکسان باشد

interface StoredResetMeta {
 email?: string;
 requestedAt?: string;
 expiresAt?: string;
 used?: boolean;
}

export async function POST(req: NextRequest) {
 try {
 // ===== Rate limit: ۱۰ تلاش در دقیقه برای هر IP =====
 const ip = getRateLimitIp(req);
 const rl = rateLimitCheck(`auth:reset:${ip}`, 10, 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "تلاش‌های بازیابی بیش از حد. لطفاً یک دقیقه بعد دوباره تلاش کنید."
 );
 }

 const body = await req.json().catch(() => ({}));
 const { token, newPassword } = body as {
 token?: string;
 newPassword?: string;
 };

 if (!token || typeof token!== "string" || token.length < 16) {
 return NextResponse.json(
 { success: false, error: "توکن بازیابی نامعتبر است" },
 { status: 400 }
 );
 }
 if (!newPassword || typeof newPassword!== "string") {
 return NextResponse.json(
 { success: false, error: "رمز عبور جدید الزامی است" },
 { status: 400 }
 );
 }

 // هش توکن برای جستجو در AuditLog
 const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

 // یافتن رکورد PASSWORD_RESET_REQUEST با این tokenHash
 const resetRecord = await db.auditLog.findFirst({
 where: {
 action: "PASSWORD_RESET_REQUEST",
 entity: "User",
 entityId: tokenHash,
 },
 orderBy: { createdAt: "desc" },
 include: {
 user: { select: { id: true, email: true, tenantId: true, isActive: true, tenant: { select: { status: true } } } },
 },
 });

 if (!resetRecord ||!resetRecord.user) {
 return NextResponse.json(
 {
 success: false,
 error:
 "توکن بازیابی نامعتبر یا منقضی است. لطفاً دوباره درخواست بازیابی بدهید.",
 },
 { status: 404 }
 );
 }

 // بررسی metadata
 let meta: StoredResetMeta = {};
 try {
 meta = resetRecord.changes
? (JSON.parse(resetRecord.changes) as StoredResetMeta)
: {};
 } catch {
 meta = {};
 }

 // بررسی استفاده‌شده بودن توکن
 if (meta.used === true) {
 return NextResponse.json(
 {
 success: false,
 error:
 "این توکن قبلاً استفاده شده است. لطفاً درخواست بازیابی جدیدی ثبت کنید.",
 },
 { status: 410 }
 );
 }

 // بررسی انقضا
 const expiresAtIso = meta.expiresAt;
 if (!expiresAtIso) {
 // اگر expiresAt ثبت نشده، از createdAt + TTL استفاده می‌کنیم
 const fallbackExpiry = new Date(
 resetRecord.createdAt.getTime() + TOKEN_TTL_MS
 );
 if (fallbackExpiry < new Date()) {
 return NextResponse.json(
 {
 success: false,
 error:
 "توکن بازیابی منقضی شده است. لطفاً درخواست بازیابی جدیدی ثبت کنید.",
 },
 { status: 410 }
 );
 }
 } else {
 const expiresAt = new Date(expiresAtIso);
 if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
 return NextResponse.json(
 {
 success: false,
 error:
 "توکن بازیابی منقضی شده است. لطفاً درخواست بازیابی جدیدی ثبت کنید.",
 },
 { status: 410 }
 );
 }
 }

 // کاربر باید فعال باشد — FIX(v11): استثنای «تنانت در انتظار پرداخت» —
 // کاربر فلوی خرید ناتمام با اثبات مالکیت ایمیل (کلیک روی لینک ریست)
 // فعال می‌شود تا ایمیلش برای همیشه قفل نماند
 const pendingPaymentUser =
 !resetRecord.user.isActive &&
 resetRecord.user.tenant?.status === "pending_payment";
 if (!resetRecord.user.isActive && !pendingPaymentUser) {
 return NextResponse.json(
 {
 success: false,
 error: "حساب کاربری غیرفعال است. با مدیر سامانه تماس بگیرید.",
 },
 { status: 403 }
 );
 }

 // اعتبارسنجی رمز عبور جدید با سیاست سامانه
 const policy = await getPasswordPolicy();
 const validation = validatePassword(newPassword, policy);
 if (!validation.valid) {
 return NextResponse.json(
 {
 success: false,
 error: "رمز عبور جدید با سیاست امنیتی مطابقت ندارد",
 details: validation.errors,
 },
 { status: 400 }
 );
 }

 // هش کردن و به‌روزرسانی رمز کاربر
 const passwordHash = await hashPassword(newPassword);
 // FIX(22-B): نسخه رمزنگاری‌شده جدید برای قابلیت «نمایش رمز»
 let passwordEncNew: string | null = null;
 try {
 const { encrypt } = await import("@/lib/crypto");
 passwordEncNew = encrypt(newPassword);
 } catch {
 /* ENCRYPTION_KEY غایب — نمایش غیرفعال */
 }

 // FIX(M1): نشست‌های فعلی کاربر باطل می‌شوند — قبلاً فقط رمز آپدیت می‌شد و
 // نشست‌های موجود (از جمله دستگاه مهاجمی که توکن را درآورده) تا ۷/۳۰ روز
 // معتبر می‌ماندند. (هم‌الگوی applyNewCredentials در forgot-password)
 await db.userSession.updateMany({
 where: { userId: resetRecord.user.id, isActive: true },
 data: { isActive: false },
 });
 // کش اعتبارسنجی نشست در lib/auth را هم باطل کن (پنجره ۳۰ ثانیه‌ای بسته شود)
 try {
 const { invalidateSessionCache } = await import("@/lib/auth");
 invalidateSessionCache();
 } catch {
 // فقط لاگ — فرایند ریست نباید متوقف شود
 console.warn("[reset-password] invalidateSessionCache failed");
 }

 await db.user.update({
 where: { id: resetRecord.user.id },
 data: {
 password: passwordHash,
 ...(passwordEncNew? { passwordEnc: passwordEncNew }: {}),
 // FIX(v11): کاربر خرید ناتمام با ریست رمز فعال می‌شود (ایمیل اثبات شد)
 ...(pendingPaymentUser? { isActive: true }: {}),
 },
 });
 if (pendingPaymentUser) {
 // تنانت هم از حالت «در انتظار پرداخت» به تریال آزاد می‌شود —
 // کاربر می‌تواند وارد شود و در صورت تمایل پلن بخرد
 try {
 await db.tenant.update({
 where: { id: resetRecord.user.tenantId },
 data: { status: "TRIAL" },
 });
 } catch {
 /* مهم نیست — کاربر فعال شد */
 }
 }

 // FIX(M1): علامت‌گذاری atomic توکن به‌عنوان استفاده‌شده — قبلاً چک meta.used
 // و سپس update در دو کوئری جدا بود (TOCTOU: دو درخواست همزمان هر دو موفق می‌شدند).
 // حالا compare-and-set روی فیلد changes: فقط یکی برنده می‌شود.
 const updatedMeta: StoredResetMeta = {...meta, used: true };
 const marked = await db.auditLog.updateMany({
 where: { id: resetRecord.id, changes: resetRecord.changes },
 data: { changes: JSON.stringify(updatedMeta) },
 });
 if (marked.count === 0) {
 return NextResponse.json(
 {
 success: false,
 error: "این توکن قبلاً استفاده شده است. لطفاً درخواست بازیابی جدیدی ثبت کنید.",
 },
 { status: 410 }
 );
 }

 // ثبت رویداد موفقیت‌آمیز بازیابی در audit log
 await db.auditLog.create({
 data: {
 tenantId: resetRecord.user.tenantId,
 userId: resetRecord.user.id,
 action: "PASSWORD_RESET_SUCCESS",
 entity: "User",
 entityId: resetRecord.user.id,
 changes: JSON.stringify({
 email: resetRecord.user.email,
 resetAt: new Date().toISOString(),
 }),
 ipAddress: ip,
 },
 });

 return NextResponse.json({
 success: true,
 message: "رمز عبور با موفقیت تغییر کرد. اکنون می‌توانید با رمز جدید وارد شوید.",
 });
 } catch (error) {
 console.error("Reset password error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش درخواست" },
 { status: 500 }
 );
 }
}
