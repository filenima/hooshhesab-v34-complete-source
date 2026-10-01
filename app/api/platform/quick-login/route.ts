import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, generatePassword, generateUsername } from "@/lib/platform-auth";
import { hashLicenseKey } from "@/lib/license-security";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// session-lite برای عملکرد بهتر در serverless cold-start
import { normalizePlanName, getEffectiveLicenseDefaults } from "@/lib/plans";

export const runtime = "nodejs";

// POST /api/platform/quick-login — ورود فوری به حساب یک tenant
// اگر tenant دارد: یوزر جدید با رمز تصادفی می‌سازد و توکن می‌دهد
// اگر tenant ندارد: tenant + user جدید می‌سازد
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const { tenantId, plan = "pro", companyName, name } = body;

 // نرمال‌سازی نام پلن (یکپارچه‌سازی با lib/plans.ts)
 const normalizedPlan = normalizePlanName(plan);

 let tenant;
 let isNewTenant = false;

 if (tenantId) {
 // ورود به tenant موجود
 tenant = await db.tenant.findUnique({ where: { id: tenantId } });
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 404 }
 );
 }
 // FIX(A3-1): ورود فوری به tenant تعلیق‌شده ممنوع — قبلاً quick-login
 // تعلیق را دور می‌زد و کاربر فعال در tenant معلق می‌ساخت
 if (tenant.status === "suspended" || tenant.status === "cancelled") {
 return NextResponse.json(
 { success: false, error: `این سازمان ${tenant.status === "suspended" ? "تعلیق" : "لغو"} شده است — ابتدا وضعیت را از پنل سوپرادمین فعال کنید` },
 { status: 403 }
 );
 }
 } else {
 // ساخت tenant جدید
 isNewTenant = true;
 const { getCurrentJalaliYear, getJalaliYearRange, toPersianDigits } =
 await import("@/lib/persian");
 const currentYear = getCurrentJalaliYear();
 tenant = await db.tenant.create({
 data: {
 name: companyName || `سازمان هوش (${toPersianDigits(String(currentYear))})`,
 plan: normalizedPlan,
 status: "active",
 },
 });

 // سال مالی پیش‌فرض — داینامیک بر اساس سال شمسی جاری
 const yr = getJalaliYearRange(currentYear);
 await db.fiscalYear.create({
 data: {
 tenantId: tenant.id,
 name: `سال مالی ${toPersianDigits(currentYear)}`,
 startDate: yr.start,
 endDate: yr.end,
 status: "OPEN",
 isCurrent: true,
 },
 });

 // FIX(v18-لایسنس): منبع واحد — قبلاً ۵۰ کاربر/۱۰۰۰۰۰ فاکتور برای سازمانی هاردکد بود
 // که با پلن فروش‌شده تناقض داشت. سوپرادمین در پنل می‌تواند لایسنس دقیق صادر کند.
 const defaults = await getEffectiveLicenseDefaults(normalizedPlan) || await getEffectiveLicenseDefaults("pro");
 const { generateLicenseKey } = await import("@/lib/platform-auth");
 const licenseKey = generateLicenseKey();
 await db.license.create({
 data: {
 key: licenseKey,
 keyHash: hashLicenseKey(licenseKey),
 tenantId: tenant.id,
 plan: normalizedPlan,
 maxUsers: defaults.maxUsers,
 maxInvoices: defaults.maxInvoices,
 maxWarehouses: defaults.maxWarehouses,
 features: JSON.stringify(defaults.features),
 status: "ACTIVE",
 issuedBy: auth.admin.id,
 activatedAt: new Date(),
 },
 });
 }

 // تولید یوزرنیم و رمز تصادفی
 // FIX(B4): رمز عبور یک‌بار در پاسخ بازگردانده می‌شود (مثل کلید لایسنس)
 // تا سوپرادمین بتواند اعتبارنامه را به مشتری تحویل دهد — بدون این، حساب
 // ساخته می‌شد ولی هیچ‌کس رمز آن را نمی‌دانست. این یک نمایش one-time است
 // و در هیچ پاسخ دیگری (لیست کاربران و...) برنمی‌گردد.
 const username = generateUsername("user");
 const password = (body?.password as string | undefined)?.trim() || generatePassword(12);
 if (password.length < 8) {
 return NextResponse.json(
 { success: false, error: "رمز عبور باید حداقل ۸ کاراکتر باشد" },
 { status: 400 }
 );
 }
 const hashedPassword = await hashPassword(password);

 // ساخت کاربر ادمین برای tenant
 // SA-HIGH-5: username تولیدشده در رکورد User ذخیره می‌شود تا کاربر بتواند
 // با همان نام کاربری (که در پاسخ نمایش داده می‌شود) وارد شود.
 const user = await db.user.create({
 data: {
 tenantId: tenant.id,
 email: `${username}@hoosh.nobatime.ir`,
 username,
 name: name || (isNewTenant? "مدیر سیستم": "کاربر فوری"),
 password: hashedPassword,
 role: "ADMIN",
 isActive: true,
 },
 });

 await db.auditLog.create({
 data: {
 tenantId: tenant.id,
 userId: user.id,
 action: "QUICK_LOGIN_CREATE",
 entity: "User",
 entityId: user.id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "QUICK_LOGIN",
 entity: "Tenant",
 entityId: tenant.id,
 details: JSON.stringify({
 tenantName: tenant.name,
 username,
 userId: user.id,
 isNewTenant,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // ساخت نشست (با اطلاعات درخواست سوپرادمین؛ کاربر با این توکن وارد می‌شود)
 const { createUserSessionLite } = await import("@/lib/session-lite");
 const { token, sessionId } = await createUserSessionLite(
 req,
 db,
 user.id,
 tenant.id,
 user.role
 );

 return NextResponse.json({
 success: true,
 token,
 sessionId,
 tenant: {
 id: tenant.id,
 name: tenant.name,
 plan: tenant.plan,
 },
 user: {
 id: user.id,
 name: user.name,
 email: user.email,
 username,
 // FIX(B4): نمایش یک‌بارمصرف رمز — فقط در همین پاسخ ساخت (مثل کلید لایسنس).
 // در لاگ ممیزی فقط hash ثبت شده و plaintext هرگز ذخیره نمی‌شود.
 password,
 role: user.role,
 },
 isNewTenant,
 message: isNewTenant
? "سازمان جدید ایجاد شد و حساب کاربری آماده است"
: "ورود فوری انجام شد",
 });
 } catch (error) {
 console.error("Quick login error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ورود فوری" },
 { status: 500 }
 );
 }
}
