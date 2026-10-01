import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import crypto from "crypto";

export const runtime = "nodejs";

// ============ types ============
interface ReferralDTO {
 id: string;
 referrerId: string;
 refereeEmail: string;
 code: string;
 status: "PENDING" | "SIGNED_UP" | "REWARDED";
 reward: number;
 refereeUserId?: string | null;
 createdAt: string;
 updatedAt: string;
}

const STATUS_VALUES = ["PENDING", "SIGNED_UP", "REWARDED"] as const;
const DEFAULT_REWARD_TOMAN = 1_000_000; // Task 24 — پاداش نقدی دعوت (تومان) — پس از خرید اشتراک دوست

function toDTO(r: {
 id: string;
 referrerId: string;
 refereeEmail: string;
 code: string;
 status: string;
 reward: number;
 refereeUserId: string | null;
 createdAt: Date;
 updatedAt: Date;
}): ReferralDTO {
 return {
 id: r.id,
 referrerId: r.referrerId,
 refereeEmail: r.refereeEmail,
 code: r.code,
 status: (STATUS_VALUES.includes(r.status as (typeof STATUS_VALUES)[number])
? r.status
: "PENDING") as ReferralDTO["status"],
 reward: r.reward,
 refereeUserId: r.refereeUserId,
 createdAt: r.createdAt.toISOString(),
 updatedAt: r.updatedAt.toISOString(),
 };
}

function generateReferralCode(userId: string): string {
 // کد منحصر به فرد: ۸ کاراکتر از hash userId + timestamp
 const seed = `${userId}:${Date.now()}:${Math.random()}`;
 const hash = crypto.createHash("sha256").update(seed).digest("hex");
 return `HH-${hash.slice(0, 8).toUpperCase()}`;
}

/**
 * GET /api/marketing/referral
 *?status=PENDING|SIGNED_UP|REWARDED (optional filter)
 *
 * فهرست معرفی‌های کاربر فعلی.
 */
export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId } = auth.user;

 try {
 const { searchParams } = new URL(req.url);
 const statusFilter = searchParams.get("status");

 const referrals = await db.referral.findMany({
 where: {
 referrerId: userId,
...(statusFilter && STATUS_VALUES.includes(statusFilter as (typeof STATUS_VALUES)[number])
? { status: statusFilter }
: {}),
 },
 orderBy: { createdAt: "desc" },
 });

 // محاسبه آمار کلی
 const all = await db.referral.findMany({ where: { referrerId: userId } });
 const totalReward = all
.filter((r) => r.status === "REWARDED")
.reduce((sum, r) => sum + r.reward, 0);

 return NextResponse.json({
 success: true,
 data: referrals.map(toDTO),
 stats: {
 total: all.length,
 pending: all.filter((r) => r.status === "PENDING").length,
 signedUp: all.filter((r) => r.status === "SIGNED_UP").length,
 rewarded: all.filter((r) => r.status === "REWARDED").length,
 totalReward,
 },
 });
 } catch (error) {
 console.error("List referrals error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت معرفی‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/marketing/referral
 * body: { refereeEmail: string }
 *
 * ایجاد یک کد معرفی جدید برای دعوت یک دوست.
 * اگر قبلاً برای این ایمیل دعوت ارسال شده، همان کد برگردانده می‌شود.
 */
export async function POST(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, tenantId } = auth.user;

 try {
 const body = await req.json().catch(() => ({}));
 const refereeEmail = String(body?.refereeEmail || "").trim().toLowerCase();

 if (!refereeEmail ||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(refereeEmail)) {
 return NextResponse.json(
 { success: false, error: "ایمیل معتبر الزامی است" },
 { status: 400 }
 );
 }

 // جلوگیری از دعوت خود
 const referrer = await db.user.findUnique({
 where: { id: userId },
 select: { email: true },
 });
 if (referrer?.email.toLowerCase() === refereeEmail) {
 return NextResponse.json(
 { success: false, error: "نمی‌توانید خودتان را دعوت کنید" },
 { status: 400 }
 );
 }

 // اگر قبلاً برای این ایمیل کد ساخته شده، همان را برگردان
 const existing = await db.referral.findFirst({
 where: { referrerId: userId, refereeEmail },
 });
 if (existing) {
 return NextResponse.json({
 success: true,
 data: toDTO(existing),
 message: "کد دعوت قبلی برای این ایمیل بازیابی شد",
 });
 }

 // بررسی اینکه آیا این ایمیل قبلاً در سیستم ثبت‌نام کرده
 const alreadyUser = await db.user.findUnique({
 where: { email: refereeEmail },
 select: { id: true },
 });
 if (alreadyUser) {
 return NextResponse.json(
 { success: false, error: "این کاربر قبلاً در هوش ثبت‌نام کرده است" },
 { status: 400 }
 );
 }

 // ساخت کد منحصر به فرد (با retry در صورت تداخل)
 // FIX(v12.1.2 — رفرال): کد «شخصی» است — اگر کاربر قبلاً کدی دارد، همان را
 // استفاده می‌کنیم (یک کد → چند دعوت). کد فقط نباید به کاربر «دیگری» تعلق
 // داشته باشد؛ رکوردهای جدید با کد شخصی خود کاربر کاملاً مجاز است.
 const myExisting = await db.referral.findFirst({
 where: { referrerId: userId },
 orderBy: { createdAt: "asc" },
 });
 let code = myExisting?.code || generateReferralCode(userId);
 let attempts = 0;
 while (attempts < 5) {
 const dup = await db.referral.findFirst({
 where: { code, referrerId: { not: userId } },
 });
 if (!dup) break;
 code = generateReferralCode(userId);
 attempts++;
 }

 const referral = await db.referral.create({
 data: {
 referrerId: userId,
 refereeEmail,
 code,
 status: "PENDING",
 reward: DEFAULT_REWARD_TOMAN,
 },
 });

 // ثبت audit
 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "CREATE",
 entity: "Referral",
 entityId: referral.id,
 changes: JSON.stringify({ refereeEmail, code }),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: toDTO(referral),
 message: `کد دعوت ${code} برای ${refereeEmail} ایجاد شد`,
 });
 } catch (error) {
 console.error("Create referral error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد کد دعوت" },
 { status: 500 }
 );
 }
}

/**
 * PATCH /api/marketing/referral
 * body: { id, status?, reward? }
 *
 * به‌روزرسانی وضعیت معرفی (مثلاً علامت‌گذاری به‌عنوان REWARDED).
 * فقط ادمین یا خود کاربر (برای لغو) می‌تواند.
 */
export async function PATCH(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, role, tenantId } = auth.user;

 try {
 const body = await req.json().catch(() => ({}));
 const id = String(body?.id || "").trim();
 if (!id) {
 return NextResponse.json(
 { success: false, error: "id الزامی است" },
 { status: 400 }
 );
 }

 const existing = await db.referral.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "معرفی یافت نشد" },
 { status: 404 }
 );
 }

 // فقط owner یا ADMIN می‌تواند
 if (existing.referrerId!== userId && role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز" },
 { status: 403 }
 );
 }

 const data: Record<string, unknown> = {};
 if (typeof body.status === "string" && STATUS_VALUES.includes(body.status as (typeof STATUS_VALUES)[number])) {
 // FIX(SECURITY-H6 — state machine یک‌طرفه):
 // ۱) REWARDED فقط توسط ADMIN (نه خودِ دعوت‌کننده — قابل جعل آمار بود)
 // ۲) انتقال رو به عقب ممنوع (REWARDED → PENDING و...)
 const target = body.status as (typeof STATUS_VALUES)[number];
 const RANK: Record<string, number> = { PENDING: 0, SIGNED_UP: 1, REWARDED: 2 };
 const backward = RANK[target] <= RANK[existing.status];
 const toRewardedByOwner = target === "REWARDED" && existing.referrerId === userId && role !== "ADMIN";
 if (backward && target !== existing.status) {
 return NextResponse.json(
 { success: false, error: "انتقال وضعیت به عقب مجاز نیست" },
 { status: 400 }
 );
 }
 if (toRewardedByOwner) {
 return NextResponse.json(
 { success: false, error: "علامت‌گذاری «پاداش داده شد» فقط توسط مدیر پلتفرم انجام می‌شود" },
 { status: 403 }
 );
 }
 if (target !== existing.status) {
 data.status = target;
 }
 }
 if (typeof body.reward === "number" && body.reward >= 0) {
 // فقط ADMIN می‌تواند پاداش را تغییر دهد
 if (role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "تغییر پاداش فقط توسط مدیر ممکن است" },
 { status: 403 }
 );
 }
 data.reward = body.reward;
 }

 if (Object.keys(data).length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ فیلدی برای به‌روزرسانی ارائه نشد" },
 { status: 400 }
 );
 }

 const updated = await db.referral.update({
 where: { id },
 data,
 });

 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "UPDATE",
 entity: "Referral",
 entityId: id,
 changes: JSON.stringify(data),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: toDTO(updated),
 });
 } catch (error) {
 console.error("Update referral error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی معرفی" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/marketing/referral?id=...
 * فقط معرفی‌های PENDING قابل حذف هستند.
 */
export async function DELETE(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId, role, tenantId } = auth.user;

 try {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id") || "";
 if (!id) {
 return NextResponse.json(
 { success: false, error: "id الزامی است" },
 { status: 400 }
 );
 }

 const existing = await db.referral.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "معرفی یافت نشد" },
 { status: 404 }
 );
 }
 if (existing.referrerId!== userId && role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز" },
 { status: 403 }
 );
 }
 if (existing.status!== "PENDING") {
 return NextResponse.json(
 {
 success: false,
 error: "فقط معرفی‌های در انتظار قابل حذف هستند",
 },
 { status: 400 }
 );
 }

 await db.referral.delete({ where: { id } });

 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "DELETE",
 entity: "Referral",
 entityId: id,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 message: "کد دعوت حذف شد",
 });
 } catch (error) {
 console.error("Delete referral error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف معرفی" },
 { status: 500 }
 );
 }
}
