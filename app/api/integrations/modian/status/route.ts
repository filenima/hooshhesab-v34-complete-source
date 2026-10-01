// ============ Modian Status API — هوش ============
// داشبورد وضعیت اتصال به سامانه مودیان — نسخه ۳
// GET: وضعیت اتصال، آخرین همگام‌سازی، آمار ارسال، نرخ موفقیت، محیط TEST/LIVE
//
// نسخه ۳: همه‌ی آمار از دیتابیس واقعی (groupBy روی modianStatus) +
// شمارش فاکتورهای واجد شرایط (totalEligible) و ارسال‌های آزمایشی (testSent).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/auth";
import { getCurrentJalaliYear } from "@/lib/persian";
import { getModianEnv, countModianPending } from "@/lib/modian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/integrations/modian/status
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "تنانت یافت نشد" },
        { status: 401 }
      );
    }

    // بررسی وضعیت اتصال
    const integration = await db.integration.findFirst({
      where: { tenantId: tenant.id, type: "MODIAN" },
    });

    let connectionStatus: "connected" | "disconnected" | "error" = "disconnected";
    let lastSyncTime: string | null = null;
    let connectionMethod: string = "direct";

    if (integration) {
      if (integration.status === "CONNECTED") {
        connectionStatus = "connected";
      } else if (integration.status === "ERROR") {
        connectionStatus = "error";
      } else {
        connectionStatus = "disconnected";
      }
      lastSyncTime = integration.lastSync?.toISOString() ?? tenant.modianLastSync?.toISOString() ?? null;

      // خواندن روش اتصال از پیکربندی
      try {
        const config = JSON.parse(integration.config || "{}") as { method?: string };
        connectionMethod = config.method ?? "direct";
      } catch {
        // استفاده از پیش‌فرض
      }
    } else if (tenant.modianEnabled) {
      // تنانت فعال ولی بدون رکورد Integration
      connectionStatus = "connected";
      lastSyncTime = tenant.modianLastSync?.toISOString() ?? null;
    }

    // محیط ارسال (TEST/LIVE)
    const envCfg = await getModianEnv(tenant.id);

    // ===== آمار واقعی: گروه‌بندی همه فاکتورهای فروش بر اساس modianStatus =====
    const statusGroups = await db.invoice.groupBy({
      by: ["modianStatus"],
      where: { tenantId: tenant.id, deletedAt: null, type: "SALE" },
      _count: { _all: true },
    });
    const countByStatus = new Map<string, number>();
    for (const g of statusGroups) {
      const key = g.modianStatus ?? "__null";
      countByStatus.set(key, g._count._all);
    }
    const sentCount = countByStatus.get("SENT") ?? 0;
    const acceptedCount = countByStatus.get("ACCEPTED") ?? 0;
    const rejectedCount = countByStatus.get("REJECTED") ?? 0;
    const queuedCount = countByStatus.get("PENDING") ?? 0;

    // ارسال‌های آزمایشی (محیط تست) — متمایز از واقعی
    const testSentCount = await db.invoice.count({
      where: { tenantId: tenant.id, modianTest: true, deletedAt: null },
    });

    // فاکتورهای واجد شرایطِ در صف ارسال (null + PENDING + REJECTED)
    // PERF FIX: شمارش با count — قبلاً ۵۰۰ رکورد کامل (با party) فقط برای count لود می‌شد
    const pendingCount = await countModianPending(tenant.id);

    // کل فاکتورهای واجد شرایط ارسال (هر فاکتور فروش نهایی که باید روزی ارسال شود)
    // NOTE: partyId در مدل Invoice اجباری است — فیلتر null لازم نیست.
    const totalEligible = await db.invoice.count({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        type: "SALE",
        status: { in: ["SENT", "PARTIAL", "PAID", "OVERDUE"] },
        total: { gt: 0n },
      },
    });

    // محاسبه آمار ارسال امروز
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const invoicesSentToday = await db.invoice.count({
      where: {
        tenantId: tenant.id,
        modianStatus: { in: ["SENT", "ACCEPTED"] },
        updatedAt: { gte: todayStart },
      },
    });

    // آمار ارسال این ماه
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const invoicesSentMonth = await db.invoice.count({
      where: {
        tenantId: tenant.id,
        modianStatus: { in: ["SENT", "ACCEPTED"] },
        updatedAt: { gte: monthStart },
      },
    });

    // نرخ موفقیت (ارسال‌های موفق / کل ارسالی‌ها)
    const totalSent = sentCount + acceptedCount + rejectedCount;
    const totalSuccess = sentCount + acceptedCount;
    const successRate = totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0;

    // آمار ۷ روز اخیر
    const sendsLast7Days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const count = await db.invoice.count({
        where: {
          tenantId: tenant.id,
          modianStatus: { in: ["SENT", "ACCEPTED"] },
          updatedAt: { gte: dayStart, lt: dayEnd },
        },
      });
      sendsLast7Days.push(count);
    }

    // کل فاکتورهای فروش
    const totalSaleInvoices = await db.invoice.count({
      where: { tenantId: tenant.id, type: "SALE", deletedAt: null },
    });

    // آخرین فاکتور ارسال‌شده
    const lastSentInvoice = await db.invoice.findFirst({
      where: {
        tenantId: tenant.id,
        modianStatus: { in: ["SENT", "ACCEPTED"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        number: true,
        modianUid: true,
        modianStatus: true,
        modianTest: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        connectionStatus,
        lastSyncTime,
        connectionMethod,
        env: envCfg.env,
        testUrl: envCfg.env === "TEST" ? envCfg.testUrl : null,
        invoicesSentToday,
        invoicesSentMonth,
        successRate,
        failedCount: rejectedCount,
        sendsLast7Days,
        pendingCount,
        totalSaleInvoices,
        fiscalYear: String(getCurrentJalaliYear()),
        // خلاصه جامع برای داشبورد UI (همه از DB واقعی)
        summary: {
          totalEligible,
          pending: pendingCount,
          queued: queuedCount,
          sent: sentCount,
          accepted: acceptedCount,
          rejected: rejectedCount,
          testSent: testSentCount,
          todayCount: invoicesSentToday,
          monthCount: invoicesSentMonth,
        },
        lastSentInvoice: lastSentInvoice
          ? {
              number: lastSentInvoice.number,
              uid: lastSentInvoice.modianUid,
              status: lastSentInvoice.modianStatus,
              test: lastSentInvoice.modianTest,
              updatedAt: lastSentInvoice.updatedAt?.toISOString() ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Modian status GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت وضعیت مودیان" },
      { status: 500 }
    );
  }
}
