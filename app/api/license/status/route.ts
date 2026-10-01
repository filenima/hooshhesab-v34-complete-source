import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { isTrialLicense, trialDaysRemaining } from "@/lib/license-trial";
import { getFirstDayDiscount } from "@/lib/first-day-discount";

export const runtime = "nodejs";

// GET /api/license/status — وضعیت لایسنس کاربر فعلی
export async function GET(req: NextRequest) {
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

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // FIX(v19-flash): تخفیف ۵٪ خرید در ۲۴ ساعت اول — برای تایمر UI
 const firstDayDiscount = getFirstDayDiscount(user.createdAt);

 // کاربر دمو همیشه دسترسی دارد
 if (user.isDemo) {
 return NextResponse.json({
 success: true,
 data: {
			firstDayDiscount,
 isValid: true,
 isDemo: true,
 isTrial: false,
 plan: "enterprise",
 status: "ACTIVE",
 endDate: null,
 daysRemaining: null,
 },
 });
 }

 // FIX: اولویت لایسنس خریداری‌شده بر تریال — قبلاً اگر کاربر در دوره تریال
 // پرداخت می‌کرد، status هنوز «trial» برمی‌گرداند (باگ: خرید بدون اثر ظاهری).
 // اکنون: ۱) لایسنس فعال tenant ۲) تریال ۳) هیچ
 const activeLicense = await db.license.findFirst({
 where: { tenantId: user.tenantId, status: "ACTIVE" },
 orderBy: { createdAt: "desc" },
 });

 if (activeLicense) {
 const nowL = new Date();
 const isExpiredL =
 activeLicense.endDate && new Date(activeLicense.endDate) < nowL;

 if (!isExpiredL) {
 // FIX: لایسنس تریال (ساخته‌شده توسط trial/create) باید isTrial:true برگرداند
 // تا بنر شمارش معکوس ۱۴ روزه (components/trial-banner.tsx) نمایش داده شود.
 // تشخیص: ستون source="trial" یا (سازگاری قدیمی) endDate == user.trialEndsAt
 if (isTrialLicense(user, activeLicense)) {
 const trialDays = trialDaysRemaining(user);
 return NextResponse.json({
 success: true,
 data: {
			firstDayDiscount,
 isValid: true,
 isDemo: false,
 isTrial: true,
 plan: activeLicense.plan, // پلن pro برای دوره تریال (by design)
 status: "ACTIVE",
 endDate: user.trialEndsAt?? activeLicense.endDate,
 trialEndsAt: user.trialEndsAt,
 daysRemaining: trialDays?? 0,
 },
 });
 }
 const daysRemainingL = activeLicense.endDate
? Math.ceil(
 (new Date(activeLicense.endDate).getTime() - nowL.getTime()) /
 (24 * 60 * 60 * 1000)
 )
: null;
 return NextResponse.json({
 success: true,
 data: {
			firstDayDiscount,
 isValid: true,
 isDemo: false,
 isTrial: false,
 plan: activeLicense.plan,
 status: "ACTIVE",
 endDate: activeLicense.endDate,
 daysRemaining: daysRemainingL,
 },
 });
 }
 // FIX(v18-لایسنس): لایسنس ACTIVE که endDate آن گذشته، در DB هم EXPIRED شود —
 // قبلاً رکورد برای همیشه ACTIVE می‌ماند و مسیرهای requireAuth باز می‌ماندند.
 // FIX(4-a): این بلوک قبلاً بیرون از if(activeLicense) بود و به isExpiredL و
 // activeLicense خارج از scope ارجاع می‌داد → برای کاربر با لایسنس منقضی
 // ReferenceError و پاسخ ۵۰۰ (خطای tsc «Cannot find name isExpiredL»).
 // حالا داخل بلوک اجرا می‌شود و سپس اجرا به مسیر تریال/لایسنس پایین می‌رسد.
 if (isExpiredL) {
 await db.license.update({
 where: { id: activeLicense.id },
 data: { status: "EXPIRED" },
 }).catch(() => { /* best-effort */ });
 }
 }

 // بررسی تریال
 if (user.isTrial && user.trialEndsAt) {
 const now = new Date();
 const trialEnd = new Date(user.trialEndsAt);
 if (now > trialEnd) {
 return NextResponse.json({
 success: true,
 data: {
			firstDayDiscount,
 isValid: false,
 isDemo: false,
 isTrial: true,
 plan: "trial",
 status: "EXPIRED",
 endDate: user.trialEndsAt,
 daysRemaining: 0,
 },
 });
 }
 const daysRemaining = Math.ceil(
 (trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
 );
 return NextResponse.json({
 success: true,
 data: {
			firstDayDiscount,
 isValid: true,
 isDemo: false,
 isTrial: true,
 plan: "trial",
 status: "ACTIVE",
 endDate: user.trialEndsAt,
 daysRemaining,
 },
 });
 }

 // بررسی لایسنس tenant
 // FIX(v18-لایسنس): مرتب‌سازی قطعی — جدیدترین رکورد (نه رکورد تصادفی)
 const license = await db.license.findFirst({
 where: { tenantId: user.tenantId },
 orderBy: { createdAt: "desc" },
 });

 if (!license) {
 return NextResponse.json({
 success: true,
 data: {
			firstDayDiscount,
 isValid: false,
 isDemo: false,
 isTrial: false,
 plan: "none",
 status: "NO_LICENSE",
 endDate: null,
 daysRemaining: 0,
 },
 });
 }

 const now = new Date();
 const isExpired =
 license.endDate && new Date(license.endDate) < now;

 if (isExpired && license.status === "ACTIVE") {
 await db.license.update({
 where: { id: license.id },
 data: { status: "EXPIRED" },
 });
 license.status = "EXPIRED";
 }

 if (license.status!== "ACTIVE" || isExpired) {
 return NextResponse.json({
 success: true,
 data: {
			firstDayDiscount,
 isValid: false,
 isDemo: false,
 isTrial: false,
 plan: license.plan,
 status: license.status,
 endDate: license.endDate,
 daysRemaining: 0,
 },
 });
 }

 const daysRemaining = license.endDate
? Math.ceil((new Date(license.endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
: null;

 return NextResponse.json({
 success: true,
 data: {
			firstDayDiscount,
 isValid: true,
 isDemo: false,
 isTrial: false,
 plan: license.plan,
 status: license.status,
 endDate: license.endDate,
 daysRemaining,
 },
 });
 } catch (error) {
 console.error("License status error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بررسی لایسنس" },
 { status: 500 }
 );
 }
}
