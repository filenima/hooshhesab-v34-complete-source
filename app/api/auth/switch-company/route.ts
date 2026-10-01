import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { createUserSession, revokeSessionByToken } from "@/lib/session";
import { invalidateSessionCache } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/auth/switch-company — سوییچ به شرکت دیگر (Tenant)
// بدنه: { tenantId }
// خروجی: { success, token, tenant: { id, name, plan, status } }
// جریان: requireUser (توکن + نشست فعال) → بررسی دسترسی (TenantMember یا tenant اصلی)
// → صدور توکن جدید با tenantId جدید و نقش membership
export async function POST(req: NextRequest) {
 try {
 // FIX(H3): قبلاً فقط verifyToken (HMAC) چک می‌شد بدون رکورد userSession — یعنی
 // توکنِ باطل‌شده (خروج‌شده) اینجا تا ۹۰ روز معتبر می‌ماند و دور FIX(B1) می‌زد.
 // حالا requireUser هم نشست DB و هم isActive/deletedAt کاربر را چک می‌کند.
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const userId = auth.user.userId;
 const oldToken = auth.token;

 const body = await req.json().catch(() => ({}));
 const tenantId = (body?.tenantId as string | undefined)?.trim();

 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "شناسه شرکت (tenantId) الزامی است" },
 { status: 400 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: userId },
 include: { tenant: true },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // بررسی دسترسی: یا tenant اصلی کاربر است یا عضو TenantMember
 const isPrimary = user.tenantId === tenantId;
 let membership: { id: string; role: string; tenantId: string; createdAt: Date; userId: string; tenant?: { id: string; name: string; subdomain: string | null; plan: string; status: string } } | null = null;
 if (!isPrimary) {
 membership = await db.tenantMember.findUnique({
 where: { userId_tenantId: { userId: user.id, tenantId } },
 include: { tenant: true },
 }) as any;
 }

 if (!isPrimary &&!membership) {
 return NextResponse.json(
 { success: false, error: "شما به این شرکت دسترسی ندارید" },
 { status: 403 }
 );
 }

 // Tenant هدف را بارگذاری می‌کنیم
 const targetTenant = isPrimary
? user.tenant
: membership?.tenant?? (await db.tenant.findUnique({ where: { id: tenantId } }));

 if (!targetTenant) {
 return NextResponse.json(
 { success: false, error: "شرکت مورد نظر یافت نشد" },
 { status: 404 }
 );
 }

 if (targetTenant.status!== "active") {
 return NextResponse.json(
 { success: false, error: "این شرکت غیرفعال یا معلق است" },
 { status: 403 }
 );
 }

 // ابطال نشست قدیمی (با tenant قبلی) و ساخت نشست جدید با tenant جدید
 // FIX(H3): کش نشست lib/auth هم باطل می‌شود تا توکن قدیمی بلافاصله مرده باشد
 await revokeSessionByToken(oldToken);
 invalidateSessionCache(oldToken);

 // FIX(H2): نقش توکن جدید باید نقش membership در tenant هدف باشد، نه نقش tenant
 // اصلی — قبلاً user.role صادر می‌شد و ADMIN شرکت A بعد از سوییچ در شرکت B هم
 // ADMIN می‌شد (privilege escalation بین شرکت‌ها).
 const newRole = isPrimary? user.role: membership?.role?? user.role;

 const { token: newToken, sessionId } = await createUserSession(
 req,
 user.id,
 targetTenant.id,
 newRole
 );

 // ثبت رویداد در Audit Log (با tenant اصلی کاربر)
 await db.auditLog
.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "SWITCH_COMPANY",
 entity: "Tenant",
 entityId: targetTenant.id,
 changes: JSON.stringify({ from: user.tenantId, to: targetTenant.id }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 })
.catch(() => {
 // در صورت خطای ثبت audit، فرایند سوییچ متوقف نمی‌شود
 });

 return NextResponse.json({
 success: true,
 token: newToken,
 sessionId,
 tenant: {
 id: targetTenant.id,
 name: targetTenant.name,
 plan: targetTenant.plan,
 status: targetTenant.status,
 },
 message: `به شرکت «${targetTenant.name}» سوییچ شدید`,
 });
 } catch (error) {
 console.error("Switch company error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در سوییچ شرکت" },
 { status: 500 }
 );
 }
}
