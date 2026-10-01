import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/anti-fraud — مدیریت سد ضدتقلب ثبت‌نام (سوپرادمین)
// query: ?type=device|phone|email|ip — فیلتر نوع کلید
//        ?q=< substring جستجو
//        ?limit=50
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50);

    const where: Record<string, unknown> = {};
    if (type && ["device", "phone", "email", "ip"].includes(type)) {
      where.guardType = type;
    }
    if (q) {
      where.guardKey = { contains: q };
    }

    const [guards, stats] = await Promise.all([
      db.registrationGuard.findMany({
        where,
        orderBy: [{ lastSeen: "desc" }],
        take: limit,
      }),
      db.registrationGuard.groupBy({
        by: ["guardType"],
        _count: { _all: true },
        _sum: { count: true },
      }),
    ]);

    const total = stats.reduce((acc, s) => acc + s._count._all, 0);
    const blockedCount = await db.registrationGuard.count({ where: { blocked: true } });

    return NextResponse.json({
      success: true,
      data: {
        guards,
        stats: {
          total,
          blocked: blockedCount,
          byType: stats.map((s) => ({
            type: s.guardType,
            keys: s._count._all,
            registrations: s._sum.count ?? 0,
          })),
        },
        limits: {
          device: 2,
          phone: 2,
          email: 2,
          ip: 6,
        },
      },
    });
  } catch (error) {
    console.error("Anti-fraud list error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت فهرست ضدتقلب" },
      { status: 500 }
    );
  }
}
