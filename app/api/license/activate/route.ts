import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { hashLicenseKey } from "@/lib/license-security";

export const runtime = "nodejs";

// POST /api/license/activate — فعال‌سازی کد لایسنس برای کاربر تریال
export async function POST(req: NextRequest) {
 try {
 // FIX(v18-لایسنس): Rate-limit — ۱۰ تلاش فعال‌سازی در ۱۰ دقیقه برای هر IP
 const { rateLimitCheck, buildRateLimitResponse, getClientIp } =
 await import("@/lib/rate-limit");
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`license:activate:${ip}`, 10, 10 * 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(rl, "تلاش‌های فعال‌سازی بیش از حد. لطفاً بعداً دوباره تلاش کنید.");
 }

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

 const { licenseKey } = await req.json();
 if (!licenseKey) {
 return NextResponse.json(
 { success: false, error: "کد لایسنس الزامی است" },
 { status: 400 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 include: { tenant: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // FIX(v18-لایسنس): فقط ADMIN سازمان می‌تواند لایسنس فعال کند —
 // کاربر VIEWER/ACCOUNTANT نباید بتواند پلن سازمان را تغییر دهد.
 if (user.role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "فقط مدیر سازمان می‌تواند لایسنس را فعال کند. از مدیر خود بخواهید این کار را انجام دهد." },
 { status: 403 }
 );
 }

 // جستجوی لایسنس با key یا keyHash
 const normalizedKey = licenseKey.trim().toUpperCase();
 const keyHash = hashLicenseKey(normalizedKey);

 const license = await db.license.findFirst({
 where: {
 OR: [
 { key: normalizedKey },
 { keyHash },
 ],
 },
 });

 if (!license) {
 return NextResponse.json(
 { success: false, error: "کد لایسنس نامعتبر است" },
 { status: 404 }
 );
 }

 if (license.status === "REVOKED") {
 return NextResponse.json(
 { success: false, error: "این لایسنس ابطال شده است" },
 { status: 403 }
 );
 }

 // FIX(v18-لایسنس): لایسنس SUSPENDED (معلق توسط سوپرادمین) هم قابل فعال‌سازی نیست
 if (license.status === "SUSPENDED") {
 return NextResponse.json(
 { success: false, error: "این لایسنس توسط پشتیبانی موقتاً تعلیق شده است. لطفاً با پشتیبانی تماس بگیرید." },
 { status: 403 }
 );
 }

 if (license.status === "EXPIRED" || (license.endDate && license.endDate < new Date())) {
 return NextResponse.json(
 { success: false, error: "این لایسنس منقضی شده است" },
 { status: 403 }
 );
 }

 // اگر لایسنس به tenant دیگری متصل است
 if (license.tenantId && license.tenantId!== user.tenantId) {
 return NextResponse.json(
 { success: false, error: "این لایسنس قبلاً برای حساب دیگری فعال شده" },
 { status: 403 }
 );
 }

 // FIX(4-a): فعال‌سازی مجدد همان کلید برای همین حساب — رد صریح بدون تغییر داده.
 // قبلاً فعال‌سازی تکراری هم «موفق» برمی‌گشت و activatedAt / auditLog / پلن tenant
 // دوباره بازنویسی می‌شد (گمراه‌کننده و غیر idempotent).
 // اکنون با پیام فارسی و کد ۴۰۹ رد می‌شود — بدون هیچ write در دیتابیس.
 if (
 license.tenantId === user.tenantId &&
 license.status === "ACTIVE" &&
 license.activatedAt
 ) {
 return NextResponse.json(
 {
 success: false,
 error:
 "این لایسنس قبلاً برای همین حساب فعال شده است و نیازی به فعال‌سازی مجدد نیست.",
 data: {
 plan: license.plan,
 maxUsers: license.maxUsers,
 maxInvoices: license.maxInvoices,
 endDate: license.endDate,
 },
 },
 { status: 409 }
 );
 }

 // فعال‌سازی لایسنس برای tenant کاربر
 await db.license.update({
 where: { id: license.id },
 data: {
 tenantId: user.tenantId,
 status: "ACTIVE",
 activatedAt: new Date(),
 activationIp: req.headers.get("x-forwarded-for") || null,
 },
 });

 // تغییر وضعیت کاربر از تریال به Premium
 await db.user.update({
 where: { id: user.id },
 data: {
 isTrial: false,
 trialEndsAt: null,
 },
 });

 // به‌روزرسانی پلن tenant
 await db.tenant.update({
 where: { id: user.tenantId },
 data: { plan: license.plan },
 });

 // FIX(v18-لایسنس): پاک‌سازی امن‌تر — فقط لایسنس‌های تریال/دمو قدیمی حذف می‌شوند،
 // نه لایسنس خریداری‌شده با مدت کوتاه. اگر لایسنس دیگریِ فعال طولانی‌مدت وجود
 // دارد، معطل ماند؛ کاربر از پنل مدیریت لایسنس می‌تواند وضعیت را ببیند.
 await db.license.deleteMany({
 where: {
 tenantId: user.tenantId,
 id: { not: license.id },
 OR: [
 { source: "trial" },
 { endDate: { lt: new Date() } },
 ],
 },
 });

 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "LICENSE_ACTIVATED",
 entity: "License",
 entityId: license.id,
 changes: JSON.stringify({
 plan: license.plan,
 key: license.key,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 plan: license.plan,
 maxUsers: license.maxUsers,
 maxInvoices: license.maxInvoices,
 features: JSON.parse(license.features),
 endDate: license.endDate,
 },
 message: "لایسنس با موفقیت فعال شد. حساب شما به Premium ارتقا یافت.",
 });
 } catch (error) {
 console.error("License activate error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در فعال‌سازی لایسنس" },
 { status: 500 }
 );
 }
}
