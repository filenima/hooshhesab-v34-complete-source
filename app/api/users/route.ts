import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { generatePassword } from "@/lib/platform-auth";

export const runtime = "nodejs";

// نقش‌های DB را به نقش‌های UI نگاشت می‌کند
// (ADMIN/MANAGER manager, ACCOUNTANT accountant، سایر user)
function normalizeRole(role: string): "manager" | "accountant" | "user" {
 const r = (role || "").toUpperCase();
 if (r === "ADMIN" || r === "MANAGER") return "manager";
 if (r === "ACCOUNTANT") return "accountant";
 return "user";
}

function formatLastLogin(date: Date | null): string {
 if (!date) return "—";
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "short",
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 }).format(date);
 } catch {
 return date.toISOString().slice(0, 16).replace("T", " ");
 }
}

interface ApiUser {
 id: string;
 name: string;
 email: string;
 role: "manager" | "accountant" | "user";
 active: boolean;
 lastLogin: string;
 twofa: boolean;
}

function toApiUser(u: {
 id: string;
 name: string;
 email: string;
 role: string;
 isActive: boolean;
 lastLogin: Date | null;
 twoFactorEnabled: boolean;
 deletedAt: Date | null;
}): ApiUser {
 return {
 id: u.id,
 name: u.name,
 email: u.email,
 role: normalizeRole(u.role),
 active: u.isActive,
 lastLogin: formatLastLogin(u.lastLogin),
 twofa: u.twoFactorEnabled,
 };
}

// GET /api/users — فهرست کاربران tenant احراز هویت شده
// SECURITY (C1/C2): احراز هویت اجباری؛ فقط کاربران همان tenant برگردانده می‌شوند.
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const users = await db.user.findMany({
 where: {
 tenantId: ctx.tenantId,
 deletedAt: null,
 },
 orderBy: { createdAt: "desc" },
 select: {
 id: true,
 name: true,
 email: true,
 family: true,
 role: true,
 isActive: true,
 lastLogin: true,
 twoFactorEnabled: true,
 deletedAt: true,
 createdAt: true,
 },
 });

 const data: ApiUser[] = users.map(toApiUser);
 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("Users list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت فهرست کاربران" },
 { status: 500 }
 );
 }
}

// POST /api/users — ایجاد کاربر جدید برای tenant احراز هویت شده
// SECURITY (C2): احراز هویت اجباری + فقط ADMIN می‌تواند کاربر جدید بسازد.
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 // فقط ADMIN می‌تواند کاربر جدید بسازد
 if (ctx.role!== "ADMIN") {
 return NextResponse.json(
 {
 success: false,
 error: "فقط مدیر کل (ADMIN) می‌تواند کاربر جدید ایجاد کند",
 },
 { status: 403 }
 );
 }

 // FIX(v18-سهمیه): اعمال maxUsers پلن سمت سرور — قبلاً فقط نمایشی بود
 const { checkUserQuota, quotaResponse } = await import("@/lib/license-quota");
 const quota = await checkUserQuota(ctx.tenantId);
 if (!quota.ok) {
 return quotaResponse(quota);
 }

 const body = await req.json();
 const {
 name,
 email,
 password,
 role,
 family,
 isActive = true,
 } = body as {
 name?: string;
 email?: string;
 password?: string;
 role?: string;
 family?: string;
 isActive?: boolean;
 };

 if (!name || typeof name!== "string" ||!name.trim()) {
 return NextResponse.json(
 { success: false, error: "نام کاربر الزامی است" },
 { status: 400 }
 );
 }
 if (!email || typeof email!== "string" ||!email.trim()) {
 return NextResponse.json(
 { success: false, error: "ایمیل الزامی است" },
 { status: 400 }
 );
 }

 const normalizedEmail = email.toLowerCase().trim();

 // اعتبارسنجی فرمت ایمیل
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
 return NextResponse.json(
 { success: false, error: "ایمیل نامعتبر است" },
 { status: 400 }
 );
 }

 // بررسی تکراری نبودن ایمیل
 const existing = await db.user.findUnique({
 where: { email: normalizedEmail },
 });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "این ایمیل قبلاً ثبت شده است" },
 { status: 409 }
 );
 }

 // رمز عبور: حداقل ۸ کاراکتر؛ اگر ارسال نشد، رمز تصادفی تولید می‌کنیم
 // SECURITY (C6): از generatePassword (crypto-based) استفاده می‌شود.
 let plainPassword = password;
 if (!plainPassword || plainPassword.length < 8) {
 plainPassword = generatePassword(14);
 }

 const hashedPassword = await bcrypt.hash(plainPassword, 10);

 // نقش: اگر ارسال نشد، پیش‌فرض "VIEWER" (فقط مشاهده)
 const finalRole = (role && String(role).trim()) || "VIEWER";

 const created = await db.user.create({
 data: {
 tenantId: ctx.tenantId,
 email: normalizedEmail,
 name: name.trim(),
 family: family?.trim() || null,
 password: hashedPassword,
 role: finalRole,
 isActive: Boolean(isActive),
 },
 select: {
 id: true,
 name: true,
 email: true,
 family: true,
 role: true,
 isActive: true,
 lastLogin: true,
 twoFactorEnabled: true,
 deletedAt: true,
 createdAt: true,
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "USER_CREATE",
 entity: "User",
 entityId: created.id,
 changes: { email: normalizedEmail, role: finalRole },
 req,
 });

 return NextResponse.json({
 success: true,
 data: toApiUser(created),
 message: "کاربر با موفقیت ایجاد شد",
 });
 } catch (error) {
 console.error("User create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد کاربر" },
 { status: 500 }
 );
 }
}
