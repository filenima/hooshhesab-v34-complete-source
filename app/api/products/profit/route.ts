import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ هوش — گزارش سود ناخالص کالاها (v13.3) ============
// GET /api/products/profit?days=30&limit=100
// برای هر کالا: تعداد فروخته‌شده، درآمد (قبل از مالیات)، بهای تمام‌شدهٔ تقریبی،
// سود ناخالص و حاشیهٔ سود ٪ — از InvoiceItemهای فاکتورهای فروش (منهای برگشتی‌ها).
//
// فرمول‌ها (هم‌ساختار invoice-form.tsx):
//   lineSubtotal = quantity × unitPrice × (1 − discount/100)   ← درآمد پیش از مالیات
//   cost         = quantity × purchasePrice (بهای تمام‌شدهٔ فعلی کالا)
//   برگشت از فروش (type=RETURN) از فروش کسر می‌شود (منفی حساب می‌شود)
//
// نکته: بهای تمام‌شدهٔ «تاریخیِ لحظهٔ فروش» نگه‌داری نمی‌شود؛ از
// purchasePrice فعلی کالا به‌عنوان تقریب استفاده می‌شود (میانگین متحرک
// بازمحاسبه‌شده در ورودهای انبار). پاسخ فیلد estimate=true دارد.

interface ProfitRow {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  unitsSold: number;
  unitsReturned: number;
  revenue: number; // ریال — خالص پس از کسر برگشتی
  cost: number; // ریال
  profit: number; // ریال — revenue − cost
  margin: number; // درصد
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;

    // پارامترها: بازه (پیش‌فرض ۳۰ روز اخیر) و سقف ردیف‌ها
    const url = new URL(req.url);
    const daysRaw = parseInt(url.searchParams.get("days") || "30", 10);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 3650) : 30;
    const limitRaw = parseInt(url.searchParams.get("limit") || "100", 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;

    // v13.4 — today=1: از نیمه‌شب تهران (UTC+3:30 — بدون ساعت تابستانی از ۱۴۰۱)
    // محاسبه می‌شود؛ برای ویجت «قهرمان سود امروز» و چیپ «امروز» دیالوگ گزارش.
    // منطق: زمان فعلی تهران را به روزِ تقویمی گرد می‌کنیم و ۳:۳۰ ساعت عقب می‌دهیم
    // تا همان نیمه‌شب در UTC به دست آید (تقویمِ کاربر ایرانی ملاک است).
    const isToday = url.searchParams.get("today") === "1";
    const from = isToday
      ? new Date(Math.floor((Date.now() + 3.5 * 3600 * 1000) / 86400000) * 86400000 - 3.5 * 3600 * 1000)
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // وضعیت‌هایی که فروش «واقعی» حساب می‌شوند (پیش‌نویس/لغو خیر)
    const validStatuses = ["PAID", "PARTIALLY_PAID", "SENT", "CONFIRMED"];

    // ۱) آیتم‌های فروش + برگشتی در بازه — فقط فیلدهای لازم
    const items = await db.invoiceItem.findMany({
      where: {
        productId: { not: null },
        invoice: {
          tenantId,
          deletedAt: null,
          date: { gte: from },
          OR: [
            { type: "SALE", status: { in: validStatuses } },
            { type: "RETURN" },
          ],
        },
      },
      select: {
        productId: true,
        quantity: true,
        unitPrice: true,
        discount: true,
        invoice: { select: { type: true } },
      },
      take: 20000, // سقف ایمن برای جلوگیری از حافظهٔ بی‌انتها
    });

    // ۲) کالاهای مرتبط (نام + بهای تمام‌شده)
    const productIds = Array.from(new Set(items.map((i) => i.productId as string)));
    const products = await db.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        purchasePrice: true,
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // ۳) تجمیع
    const agg = new Map<string, ProfitRow>();
    for (const it of items) {
      const pid = it.productId as string;
      const p = productMap.get(pid);
      if (!p) continue;
      const isReturn = it.invoice.type === "RETURN";
      const qty = isReturn ? -it.quantity : it.quantity;
      const lineRevenue =
        Number(it.quantity) * Number(it.unitPrice) * (1 - (it.discount || 0) / 100);
      const revenue = isReturn ? -lineRevenue : lineRevenue;
      const cost = qty * Number(p.purchasePrice);

      let row = agg.get(pid);
      if (!row) {
        row = {
          productId: pid,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          unitsSold: 0,
          unitsReturned: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          margin: 0,
        };
        agg.set(pid, row);
      }
      if (isReturn) row.unitsReturned += it.quantity;
      else row.unitsSold += it.quantity;
      row.revenue += revenue;
      row.cost += cost;
    }

    // ۴) سود و حاشیه + مرتب‌سازی بر اساس سود (نزولی)
    const rows = Array.from(agg.values())
      .map((r) => {
        r.profit = r.revenue - r.cost;
        r.margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
        // گرد کردن به ریال صحیح برای JSON سبک‌تر
        return {
          ...r,
          unitsSold: Math.round(r.unitsSold * 1000) / 1000,
          unitsReturned: Math.round(r.unitsReturned * 1000) / 1000,
          revenue: Math.round(r.revenue),
          cost: Math.round(r.cost),
          profit: Math.round(r.profit),
          margin: Math.round(r.margin * 10) / 10,
        };
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, limit);

    // ۵) جمع کل برای نوار خلاصه
    const totals = rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        cost: acc.cost + r.cost,
        profit: acc.profit + r.profit,
      }),
      { revenue: 0, cost: 0, profit: 0 }
    );

    return NextResponse.json({
      success: true,
      estimate: true,
      days,
      today: isToday,
      count: rows.length,
      totals: {
        ...totals,
        margin: totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 1000) / 10 : 0,
      },
      data: rows,
    });
  } catch (error) {
    console.error("[products/profit] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در تولید گزارش سود ناخالص" },
      { status: 500 }
    );
  }
}
