import { NextRequest, NextResponse } from "next/server";
import { getReadDb } from "@/lib/db-replica";
import { getAuthContext } from "@/lib/auth";
import { cacheGetOrSet } from "@/lib/cache";

export const runtime = "nodejs";

/**
 * GET /api/value-meter — موتور ارزش‌افزوده و عادت‌سازی (روانشناسی محصول v30)
 * ============================================================================
 * درخواست مالک: «کاربر وارد ابزار بشود گیر بیفتد و بیشتر ارزش کار را بفهمد
 * و بیشتر بخواهد از ابزار استفاده کند.»
 *
 * این endpoint سبک است و فقط شمارش‌ها + روزهای فعال را برمی‌گرداند؛ محاسبهٔ
 * ارزش/زنجیره/نشان‌ها سمت کلاینت انجام می‌شود (components/dashboard/value-meter-card).
 *
 * روانشناسی: ارزش ادراک‌شده (صرفه‌جویی تومانی واقعی از داده‌های خود کاربر)
 * + زنجیرهٔ عادت (loss aversion) + نشان‌های دستاورد (endowed progress).
 */
const CACHE_TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  try {
    const db = getReadDb();
    const auth = await getAuthContext(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = auth.tenantId;

    const cacheKey = `value-meter:${tenantId}`;
    const data = await cacheGetOrSet(cacheKey, async () => compute(db, tenantId), CACHE_TTL_MS);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Value meter error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در محاسبهٔ ارزش‌افزوده" },
      { status: 500 }
    );
  }
}

async function compute(
  db: import("@prisma/client").PrismaClient,
  tenantId: string
) {
  const [invoices, checks, parties, products, moadianSent, activityRows] =
    await Promise.all([
      db.invoice.count({ where: { tenantId, deletedAt: null } }),
      db.check.count({ where: { tenantId, deletedAt: null } }),
      db.party.count({ where: { tenantId, deletedAt: null } }),
      db.product.count({ where: { tenantId, deletedAt: null } }),
      db.invoice.count({
        where: {
          tenantId,
          deletedAt: null,
          modianUid: { not: null },
        },
      }),
      // روزهای فعال (۹۰ روز اخیر) — از تاریخ ایجاد فاکتور و چک
      db.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 120 * 24 * 3600 * 1000) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
    ]);

  // روزهای یکتا (YYYY-MM-DD محلی)
  const daySet = new Set<string>(
    activityRows.map((r) => {
      const d = new Date(r.createdAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })
  );
  const activeDates = Array.from(daySet).sort().reverse().slice(0, 90);

  const firstInvoice = await db.invoice.findFirst({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  return {
    counts: { invoices, checks, parties, products, moadianSent },
    activeDates,
    firstActivityDate: firstInvoice?.createdAt ?? null,
  };
}
