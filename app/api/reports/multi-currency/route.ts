import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getReadDb } from "@/lib/db-replica";
import { convertFromIrr } from "@/lib/currency";
import { toLocalISODate } from "@/lib/persian";

export const runtime = "nodejs";

// GET /api/reports/multi-currency?currency=USD&period=monthly
// period: monthly (۳۰ روز) | quarterly (۹۰ روز) | yearly (۳۶۵ روز)
// خروجی: درآمد، هزینه، سود، محصولات برتر و مشتریان برتر — همه به ارز انتخاب‌شده تبدیل می‌شوند
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
//
// FIX (F22): نرخ تبدیل «به ازای ریال» قبلاً روی مبالغ «تومانی» ضرب می‌شد و همه‌ی
//   اعداد ارزی ۱۰ برابر کوچک‌تر از واقعیت بودند. اکنون نرخ به ازای «تومان»
//   (= convertFromIrr(10) چون ۱ تومان = ۱۰ ریال) محاسبه و اعمال می‌شود.
//   نام فیلدهای *Irr به دلیل مصرف فرانت‌اند حفظ شده ولی مقدار آن‌ها «تومان» است —
//   فیلد unit و نام‌های صادقانه‌ی *Toman (alias) هم اضافه شد.
// FIX: کلید روز با toLocalISODate (بدون شیفت UTC برای ایران +03:30).
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
    const { searchParams } = new URL(req.url);
    const currency = (searchParams.get("currency") ?? "USD").toUpperCase();
    const period = searchParams.get("period") ?? "monthly";

    // تعیین بازه زمانی
    const days = period === "yearly" ? 365 : period === "quarterly" ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // واکشی فاکتورها در بازه (فقط انواع مؤثر در گزارش)
    const db = getReadDb();
    const invoices = await db.invoice.findMany({
      where: {
        tenantId,
        type: { in: ["SALE", "PURCHASE", "RETURN"] },
        date: { gte: since },
        status: { notIn: ["DRAFT", "CANCELLED"] },
        deletedAt: null,
      },
      include: { party: true, items: true },
    });

    // محاسبه‌ی مبالغ به تومان (ریال ÷ ۱۰)
    let revenueIrr = 0; // نام قدیمی — مقدار به «تومان»
    let expensesIrr = 0;
    const productAgg = new Map<
      string,
      { name: string; qty: number; revenueIrr: number }
    >();
    const customerAgg = new Map<
      string,
      { name: string; revenueIrr: number; count: number }
    >();

    for (const inv of invoices) {
      const totalIrr = Number(inv.total) / 10; // ریال به تومان
      if (inv.type === "SALE") {
        revenueIrr += totalIrr;
        // مشتری
        const cKey = inv.partyId;
        const c = customerAgg.get(cKey);
        if (c) {
          c.revenueIrr += totalIrr;
          c.count += 1;
        } else {
          customerAgg.set(cKey, {
            name: inv.party?.name ?? "—",
            revenueIrr: totalIrr,
            count: 1,
          });
        }
        // محصول
        for (const it of inv.items) {
          const pKey = it.productId ?? it.description;
          const p = productAgg.get(pKey);
          const lineTotalIrr = Number(it.total) / 10;
          if (p) {
            p.qty += it.quantity;
            p.revenueIrr += lineTotalIrr;
          } else {
            productAgg.set(pKey, {
              name: it.description,
              qty: it.quantity,
              revenueIrr: lineTotalIrr,
            });
          }
        }
      } else if (inv.type === "PURCHASE") {
        expensesIrr += totalIrr;
      } else if (inv.type === "RETURN") {
        // بازگشت فروش کسر از درآمد (و از فروش مشتری — برای هم‌راستایی با خلاصه)
        revenueIrr -= totalIrr;
        const c = customerAgg.get(inv.partyId);
        if (c) {
          c.revenueIrr -= totalIrr;
          c.count = Math.max(0, c.count - 1);
        }
      }
    }

    const profitIrr = revenueIrr - expensesIrr;

    // FIX (F22): نرخ به ازای «تومان» — convertFromIrr(10, X) = ارزش ۱۰ ریال = ۱ تومان به ارز X
    const ratePerToman = await convertFromIrr(10, currency);
    const toCurrency = (toman: number) => toman * ratePerToman;

    const topProducts = Array.from(productAgg.values())
      .sort((a, b) => b.revenueIrr - a.revenueIrr)
      .slice(0, 10)
      .map((p, idx) => ({
        rank: idx + 1,
        name: p.name,
        qty: p.qty,
        revenueIrr: p.revenueIrr,
        revenueToman: p.revenueIrr,
        revenueCurrency: toCurrency(p.revenueIrr),
      }));

    const topCustomers = Array.from(customerAgg.values())
      .sort((a, b) => b.revenueIrr - a.revenueIrr)
      .slice(0, 10)
      .map((c, idx) => ({
        rank: idx + 1,
        name: c.name,
        invoiceCount: c.count,
        revenueIrr: c.revenueIrr,
        revenueToman: c.revenueIrr,
        revenueCurrency: toCurrency(c.revenueIrr),
      }));

    // سری مقایسه‌ای روزانه: درآمد/هزینه به ارز انتخاب‌شده در هر روز
    const dailyMap = new Map<string, { revenueIrr: number; expensesIrr: number }>();
    for (const inv of invoices) {
      const key = toLocalISODate(inv.date); // FIX: کلید روزِ محلی (نه UTC)
      const totalIrr = Number(inv.total) / 10;
      const cur = dailyMap.get(key) ?? { revenueIrr: 0, expensesIrr: 0 };
      if (inv.type === "SALE") cur.revenueIrr += totalIrr;
      else if (inv.type === "PURCHASE") cur.expensesIrr += totalIrr;
      else if (inv.type === "RETURN") cur.revenueIrr -= totalIrr;
      dailyMap.set(key, cur);
    }
    const daily = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        revenueIrr: v.revenueIrr,
        revenueToman: v.revenueIrr,
        expensesIrr: v.expensesIrr,
        expensesToman: v.expensesIrr,
        revenueCurrency: toCurrency(v.revenueIrr),
        expensesCurrency: toCurrency(v.expensesIrr),
      }));

    return NextResponse.json({
      success: true,
      data: {
        currency,
        period,
        days,
        rate: ratePerToman,
        rateUnit: `ارزش ۱ تومان به ${currency} (نرخ ارزی به ازای تومان)`,
        amountUnit: "TOMAN", // فیلدهای *Irr برای سازگاری نام‌گذاری قدیمی دارند؛ مقدار تومان است
        summary: {
          revenueIrr,
          revenueToman: revenueIrr,
          expensesIrr,
          expensesToman: expensesIrr,
          profitIrr,
          profitToman: profitIrr,
          revenueCurrency: toCurrency(revenueIrr),
          expensesCurrency: toCurrency(expensesIrr),
          profitCurrency: toCurrency(profitIrr),
          invoiceCount: invoices.length,
        },
        topProducts,
        topCustomers,
        daily,
      },
    });
  } catch (error) {
    console.error("Multi-currency report error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ساخت گزارش چندارزی" },
      { status: 500 }
    );
  }
}
