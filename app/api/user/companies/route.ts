import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { createUserSession } from "@/lib/session";

export const runtime = "nodejs";

// سقف خوداظهاری ساخت شرکت توسط هر کاربر (FIX H3)
const MAX_SELF_SERVE_TENANTS = 3;

// GET /api/user/companies — فهرست شرکت‌هایی که کاربر به آن‌ها دسترسی دارد
// شامل tenant اصلی (user.tenantId) و tenant‌هایی که از طریق TenantMember به آن‌ها دسترسی دارد.
export async function GET(req: NextRequest) {
 try {
  // FIX(H3): قبلاً فقط verifyToken چک می‌شد — توکن باطل‌شده (خروج‌شده) تا ۹۰ روز
  // اینجا معتبر بود و دور FIX(B1) می‌زد. حالا requireUser نشست DB + وضعیت کاربر را چک می‌کند.
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const userId = auth.user.userId;
  const currentTenantId = auth.user.tenantId;

  // ۱) tenant اصلی کاربر
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

  // ۲) tenant‌های اضافی از طریق TenantMember
  const memberships = await db.tenantMember.findMany({
    where: { userId },
    include: { tenant: true },
  });

  // ترکیب و حذف تکراری‌ها
  const tenantMap = new Map<
    string,
    { id: string; name: string; plan: string; status: string; role: string }
  >();

  if (user.tenant) {
    tenantMap.set(user.tenant.id, {
      id: user.tenant.id,
      name: user.tenant.name,
      plan: user.tenant.plan,
      status: user.tenant.status,
      role: user.role,
    });
  }
  for (const m of memberships) {
    if (!tenantMap.has(m.tenantId) && m.tenant) {
      tenantMap.set(m.tenant.id, {
        id: m.tenant.id,
        name: m.tenant.name,
        plan: m.tenant.plan,
        status: m.tenant.status,
        role: m.role,
      });
    }
  }

  const data = Array.from(tenantMap.values());

  return NextResponse.json({
    success: true,
    currentTenantId,
    data,
  });
 } catch (error) {
  console.error("List companies error:", error);
  return NextResponse.json(
    { success: false, error: "خطا در دریافت فهرست شرکت‌ها" },
    { status: 500 }
  );
 }
}

// POST /api/user/companies — ساخت شرکت (Tenant) جدید و لینک کردن به کاربر فعلی
// بدنه: { name }
// خروجی: { success, data: { id, name, plan, status, role }, token }
export async function POST(req: NextRequest) {
 try {
  // FIX(H3): requireUser به‌جای verifyToken — اعتبارسنجی نشست + وضعیت کاربر
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const userId = auth.user.userId;

  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string | undefined)?.trim();
  const plan = (body?.plan as string | undefined) || "starter";

  if (!name || name.length < 2) {
    return NextResponse.json(
      { success: false, error: "نام شرکت الزامی است (حداقل ۲ کاراکتر)" },
      { status: 400 }
    );
  }

  // FIX(H3 — ارتقای پلن رایگان): ساخت خوداظهاران فقط با پلن «starter» مجاز است.
  // قبلاً allowedPlans شامل business/enterprise/accountant بود و هر کاربر احراز‌هویت‌شده
  // می‌توانست بدون پرداخت/لایسنس پلن بالا انتخاب کند. مقادیر دیگر رد می‌شوند
  // (ارتقای پلن فقط از مسیر پرداخت/سوپرادمین ممکن است).
  if (plan!== "starter") {
    return NextResponse.json(
    {
      success: false,
      error:
        "در ساخت خوداظهاران شرکت فقط پلن «starter» مجاز است. برای پلن‌های بالاتر از مسیر پرداخت اقدام کنید.",
    },
    { status: 403 }
    );
  }
  const safePlan = "starter";

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

  // FIX(H3 — سقف ساخت tenant): هر کاربر حداکثر ۳ شرکت خوداظهاناً می‌تواند بسازد
  // (شمارش عضویت‌های TenantMember او). بدون این سقف ساخت بی‌نهایت tenant ممکن بود.
  const membershipCount = await db.tenantMember.count({
    where: { userId },
  });
  if (membershipCount >= MAX_SELF_SERVE_TENANTS) {
    return NextResponse.json(
      {
        success: false,
        error: `شما حداکثر ${MAX_SELF_SERVE_TENANTS} شرکت می‌توانید بسازید. برای شرکت بیشتر با پشتیبانی تماس بگیرید.`,
      },
      { status: 429 }
    );
  }

  // ۱) ساخت Tenant جدید
  const tenant = await db.tenant.create({
    data: {
      name,
      plan: safePlan,
      status: "active",
    },
  });

  // ۲) ساخت سال مالی پیش‌فرض برای Tenant جدید (در صورت خطای تکراری نادیده گرفته می‌شود)
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 2, 21); // ~ ۱ فروردین
  const yearEnd = new Date(now.getFullYear() + 1, 2, 20);
  await db.fiscalYear
.create({
      data: {
        tenantId: tenant.id,
        name: `سال مالی ${now.getFullYear() + 1}`,
        startDate: yearStart,
        endDate: yearEnd,
        status: "OPEN",
        isCurrent: true,
      },
    })
.catch(() => {
      // در صورت وجود سال مالی تکراری، نادیده می‌گیریم
    });

  // ۳) ساخت TenantMember — کاربر فعلی به‌عنوان ADMIN شرکت جدید
  await db.tenantMember.create({
    data: {
      userId: user.id,
      tenantId: tenant.id,
      role: "ADMIN",
    },
  });

  // ۴) صدور توکن جدید برای شرکت جدید (همان userId، tenantId جدید)
  // FIX(H2/H3): توکن جدید باید UserSession داشته باشد تا در اعتبارسنجی نشست
  // (lib/auth.ts) پذیرفته شود — fallback «توکن بدون رکورد نشست» حذف شد چون
  // خلاف FIX(B1) بود و در همه‌ی routeهای getAuthContext-based کار نمی‌کرد.
  // FIX(H2): نقش توکن = نقش membership در شرکت جدید (ADMIN)، نه user.role
  // (کاربرِ USER در tenant اصلی، در شرکت جدیدی که خودش ساخته ADMIN است و بالعکس).
  const { token: newToken, sessionId } = await createUserSession(
    req,
    user.id,
    tenant.id,
    "ADMIN"
  );

  return NextResponse.json({
    success: true,
    data: {
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      role: "ADMIN",
    },
    token: newToken,
    sessionId,
    message: `شرکت «${name}» با موفقیت ایجاد شد`,
  });
 } catch (error) {
  console.error("Create company error:", error);
  return NextResponse.json(
    { success: false, error: "خطا در ایجاد شرکت جدید" },
    { status: 500 }
  );
 }
}
