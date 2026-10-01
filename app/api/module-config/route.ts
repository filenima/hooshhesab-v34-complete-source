import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { getEffectiveNavForPlan } from "@/lib/module-manager";
import { NAV_ITEMS } from "@/lib/nav-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ منوی مؤثر پنل کاربر ============
// GET /api/module-config — سایدبار مؤثر این tenant:
// ترتیب/نام/بج/آیتم‌های دلخواه سراسری + overrideهای پلن فعال.
// app-shell در mount این را می‌گیرد و در صورت خطا به NAV_ITEMS پیش‌فرض
// برمی‌گردد (اپ هرگز نمی‌شکند). کش سرور ۳۰ ثانیه‌ای (lib/module-manager).

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { userId, tenantId } = auth.user;

    const rl = rateLimitCheck(
      `module-config:${userId}:${getClientIp(req)}`,
      60,
      60_000
    );
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    // پلن tenant از دیتابیس — مبنای overrideهای per-plan
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    let nav = await getEffectiveNavForPlan(tenant?.plan ?? "free");

    // TASK(6-a) — چیدمان سایدبار (ترتیب + نمایش/مخفی) که سوپرادمین از
    // پنل سوپرادمین (تب «چیدمان سایدبار کاربران» — drag & drop) تعیین
    // کرده است. این لایه پس از منوی مؤثر پلن اعمال می‌شود و خودترمیم است:
    // آیتم‌های جدیدی که هنوز در پیکربندی نیستند انتهای لیست و «مرئی»
    // می‌مانند؛ رکورد خراب/غایب یعنی همان منوی پیش‌فرض پلن.
    try {
      const sidebarCfg = await db.sidebarConfig.findUnique({
        where: { scope: "user-panel" },
      });
      if (sidebarCfg?.itemsJson) {
        const items = JSON.parse(sidebarCfg.itemsJson) as Array<{
          id?: unknown;
          visible?: unknown;
        }>;
        if (Array.isArray(items) && items.length > 0) {
          const orderMap = new Map<string, number>();
          const visibleMap = new Map<string, boolean>();
          items.forEach((it, i) => {
            if (it && typeof it.id === "string" && it.id) {
              orderMap.set(it.id, i);
              visibleMap.set(it.id, it.visible !== false);
            }
          });
          nav = nav
            .filter((n) => visibleMap.get(n.id) !== false)
            .sort((a, b) => {
              const ia = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
              const ib = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
              return ia - ib;
            });
        }
      }
    } catch {
      /* چیدمان ذخیره‌شده اعمال نشد — منوی مؤثر پلن می‌ماند */
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          plan: tenant?.plan ?? "free",
          nav,
          // تعداد کل برای دیباگ (آیتم‌های حذف‌شده سمت کلاینت هم اعمال می‌شوند)
          defaultCount: NAV_ITEMS.length,
        },
      },
      {
        headers: {
          // خصوصی (per-user) + کش کوتاه مرورگری برای رفت‌وبرگشت‌های سریع
          "Cache-Control": "private, max-age=30",
        },
      }
    );
  } catch (error) {
    console.error("Module config GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت پیکربندی منو" },
      { status: 500 }
    );
  }
}
