import { NextRequest, NextResponse } from "next/server";

// هوش — مسیر ورود به حالت دمو
// IMPORTANT: از session-lite استفاده می‌کند تا زنجیره‌ی import سنگین بارگذاری نشود.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/demo/access — ورود به حالت دمو با داده‌های از پیش پر شده
export async function POST(req: NextRequest) {
 try {
 // FIX(SECURITY-M8): قبلاً بی‌نهایت نشست دمو قابل ساخت بود (رشد DB + مصرف AI).
 // حالا: (۱) با DEMO_MODE=0 سوپرادمین می‌تواند کاملاً خاموشش کند،
 // (۲) محدودیت نرخ ۲۰ دمو در ساعت برای هر IP
 if (process.env.DEMO_MODE === "0") {
 return NextResponse.json(
 {
 success: false,
 error:
 "حالت دمو در حال حاضر غیرفعال است. برای فعال‌سازی با مدیر پلتفرم تماس بگیرید.",
 errorCode: "DEMO_DISABLED",
 },
 { status: 403 }
 );
 }
 {
 const { rateLimitCheck, buildRateLimitResponse, getClientIp } =
 await import("@/lib/rate-limit");
 const rl = rateLimitCheck(`demo-access:${getClientIp(req)}`, 20, 60 * 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(rl, "درخواست‌های دمو بیش از حد مجاز. لطفاً بعداً تلاش کنید.");
 }
 }

 const { db } = await import("@/lib/db");
 const { createUserSessionLite } = await import("@/lib/session-lite");

 // پیدا کردن یا ساخت tenant دمو — upsert برای جلوگیری از race condition
 // هنگام درخواست‌های همزمان (cold start موازی)
 let demoTenant = await db.tenant.upsert({
 where: { subdomain: "demo" },
 update: {},
 create: {
 name: "سازمان دمو هوش",
 subdomain: "demo",
 plan: "enterprise",
 status: "active",
 },
 });

 // اطمینان از وجود سال مالی جاری برای tenant دمو
 const { getCurrentJalaliYear, getJalaliYearRange, toPersianDigits } =
 await import("@/lib/persian");
 const demoFiscalYearNum = getCurrentJalaliYear();
 const existingFy = await db.fiscalYear.findFirst({
 where: { tenantId: demoTenant.id, isCurrent: true },
 });
 if (!existingFy) {
 const yr = getJalaliYearRange(demoFiscalYearNum);
 await db.fiscalYear.create({
 data: {
 tenantId: demoTenant.id,
 name: `سال مالی ${toPersianDigits(demoFiscalYearNum)}`,
 startDate: yr.start,
 endDate: yr.end,
 status: "OPEN",
 isCurrent: true,
 },
 });
 }

 // پیدا کردن یا ساخت کاربر دمو — upsert برای جلوگیری از race condition
 // هنگام درخواست‌های همزمان (cold start موازی) — email و username یکتا هستند
 const { hashPassword } = await import("@/lib/platform-auth");
 const demoPasswordHash = await hashPassword("demo12345");
 const demoUser = await db.user.upsert({
 where: { email: "demo@hoosh.nobatime.ir" },
 update: {
 // در صورت وجود، فقط آخرین ورود را بعداً به‌روز می‌کنیم
 },
 create: {
 tenantId: demoTenant.id,
 email: "demo@hoosh.nobatime.ir",
 username: "demo",
 name: "کاربر دمو",
 password: demoPasswordHash,
 role: "ADMIN",
 isActive: true,
 isDemo: true,
 company: "سازمان دمو",
 },
 });

 // به‌روزرسانی آخرین ورود
 await db.user.update({
 where: { id: demoUser.id },
 data: { lastLogin: new Date() },
 });

 // FIX(بازخورد کاربر): دادهٔ نمونهٔ غنی — بار اول که tenant دمو خالی است،
 // کالا/طرف‌حساب/فاکتور/سند/چک/بانک کاشته می‌شود تا کاربر محیط دمو را
 // «پر از دادهٔ واقعی‌نما» ببیند (داشبورد، نمودارها، انبار، خزانه).
 // idempotent — دفعات بعدی هیچ تغییری نمی‌دهد.
 try {
 const { seedDemoDataIfEmpty } = await import("@/lib/demo-seed");
 await seedDemoDataIfEmpty(demoTenant.id, demoUser.id);
 } catch (seedErr) {
 console.error("Demo seed error (non-fatal):", seedErr);
 }

 // ساخت نشست جدید — نسخه‌ی سبک
 const { token, sessionId } = await createUserSessionLite(
 req,
 db,
 demoUser.id,
 demoTenant.id,
 demoUser.role
 );

 return NextResponse.json({
 success: true,
 token,
 sessionId,
 tenant: { id: demoTenant.id, name: demoTenant.name },
 user: {
 id: demoUser.id,
 name: demoUser.name,
 email: demoUser.email,
 username: demoUser.username,
 isDemo: true,
 },
 message: "ورود به حالت دمو",
 });
 } catch (error) {
 console.error("Demo access error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ورود دمو" },
 { status: 500 }
 );
 }
}
