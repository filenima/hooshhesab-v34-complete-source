import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { encryptField, decryptField } from "@/lib/db-encryption";

export const runtime = "nodejs";

// GET /api/user/profile — دریافت پروفایل کاربر
export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 include: { tenant: true },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 return NextResponse.json({
 success: true,
 data: {
 id: user.id,
 // نام کاربری (بدون هش رمز عبور — امنیت)
 username: user.username,
 name: user.name,
 email: user.email,
 family: user.family || null,
 role: user.role,
 twoFactorEnabled: user.twoFactorEnabled,
 lastLogin: user.lastLogin,
 lastLoginIp: user.lastLoginIp,
 createdAt: user.createdAt,
 // نشان‌گذاری‌شده: آیا رمز عبور در سمت سرور تنظیم شده است (هش شده)
 hasPassword: Boolean(user.password),
 company: user.company || null,
 nationalId: decryptField(user.nationalId),
 address: user.address || null,
 phone: user.phone || null,
 logoUrl: user.logoUrl || null,
 isDemo: user.isDemo,
 isTrial: user.isTrial,
 trialEndsAt: user.trialEndsAt,
 tenant: {
 id: user.tenant.id,
 name: user.tenant.name,
 plan: user.tenant.plan,
 status: user.tenant.status,
 },
 },
 });
 } catch (error) {
 console.error("Profile error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پروفایل" },
 { status: 500 }
 );
 }
}

// PATCH /api/user/profile — به‌روزرسانی پروفایل
export async function PATCH(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const body = await req.json();
 const { name, email, phone, family, company, nationalId, address, logoUrl } = body;

 const updateData: Record<string, unknown> = {};
 if (typeof name === "string" && name) updateData.name = name;
 if (typeof family === "string" && family) updateData.family = family;
 if (typeof company === "string" && company) updateData.company = company;
 if (typeof nationalId === "string" && nationalId) updateData.nationalId = encryptField(nationalId);
 if (typeof address === "string" && address) updateData.address = address;
 if (typeof phone === "string" && phone) updateData.phone = phone;
 // پشتیبانی از به‌روزرسانی آواتار از طریق FileManager
 if (typeof logoUrl === "string") {
 // فقط مسیرهای امن (relativo به /uploads/) پذیرفته می‌شوند
 if (logoUrl === "" || logoUrl.startsWith("/uploads/")) {
 updateData.logoUrl = logoUrl || null;
 } else {
 return NextResponse.json(
 { success: false, error: "مسیر تصویر نامعتبر است" },
 { status: 400 }
 );
 }
 }
 if (email) {
 // FIX(2-a): اعتبارسنجی فرمت ایمیل — جریان بازیابی رمز به ایمیل معتبر وابسته است
 const emailValue = String(email).trim().toLowerCase();
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
 return NextResponse.json(
 { success: false, error: "ایمیل معتبر وارد کنید" },
 { status: 400 }
 );
 }
 // بررسی تکراری نبودن
 const existing = await db.user.findUnique({ where: { email: emailValue } });
 if (existing && existing.id!== authUser.userId) {
 return NextResponse.json(
 { success: false, error: "این ایمیل قبلاً استفاده شده" },
 { status: 409 }
 );
 }
 updateData.email = emailValue;
 }

 const updated = await db.user.update({
 where: { id: authUser.userId },
 data: updateData,
 });

 await db.auditLog.create({
 data: {
 tenantId: updated.tenantId,
 userId: updated.id,
 action: "UPDATE",
 entity: "User",
 entityId: updated.id,
 changes: JSON.stringify(updateData),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 name: updated.name,
 email: updated.email,
 role: updated.role,
 },
 message: "پروفایل به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Update profile error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}
