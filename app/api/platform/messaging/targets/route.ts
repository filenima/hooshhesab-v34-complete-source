import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مخاطبین پیام گروهی (Task 11-a) ============
// GET /api/platform/messaging/targets?plan=all|free|basic|pro|enterprise&activity=all|active_7d|inactive_30d
// فهرست کاربران هدف برای ارسال ایمیل/پیام گروهی — فقط سوپرادمین، حداکثر ۵۰۰۰.

const MAX_TARGETS = 5000;

// نگاشت پلن‌های UI به مقادیر واقعی Tenant.plan
// (starter = نام پیش‌فرض قدیمی برای پلن رایگان/ترایل)
const PLAN_MAP: Record<string, string[]> = {
  free: ["free", "starter"],
  basic: ["basic"],
  pro: ["pro"],
  enterprise: ["enterprise"],
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const plan = (searchParams.get("plan") || "all").toLowerCase();
    const activity = (searchParams.get("activity") || "all").toLowerCase();

    const where: Record<string, unknown> = {
      deletedAt: null,
      isDemo: false, // کاربران دمو مخاطب پیام بازاریابی نیستند
    };

    // فیلتر پلن (بر اساس Tenant.plan)
    if (plan !== "all" && PLAN_MAP[plan]) {
      where.tenant = { plan: { in: PLAN_MAP[plan] } };
    }

    // فیلتر فعالیت (بر اساس User.lastLogin)
    const now = Date.now();
    if (activity === "active_7d") {
      where.lastLogin = { gte: new Date(now - 7 * 24 * 3600 * 1000) };
    } else if (activity === "inactive_30d") {
      // هرگز وارد نشده (lastLogin=null) یا آخرین ورود بیش از ۳۰ روز قبل
      where.OR = [
        { lastLogin: null },
        { lastLogin: { lt: new Date(now - 30 * 24 * 3600 * 1000) } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_TARGETS,
        select: {
          id: true,
          email: true,
          name: true,
          tenantId: true,
          lastLogin: true,
          tenant: { select: { plan: true, name: true, status: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        truncated: total > users.length,
        limit: MAX_TARGETS,
        filters: { plan, activity },
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          tenantId: u.tenantId,
          tenantName: u.tenant?.name ?? null,
          tenantPlan: u.tenant?.plan ?? null,
          lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
        })),
      },
    });
  } catch (error) {
    console.error("Messaging targets error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت مخاطبین پیام گروهی" },
      { status: 500 }
    );
  }
}
