// lib/ai-context.ts — ساخت زمینه مشترک برای اندپوینت‌های هوش مصنوعی
// هوش — Shared AI user-context builder
// ----------------------------------------------------------------------------
// این ماژول buildUserContext + formatContextForPrompt را فراهم می‌کند تا
// /api/ai/chat و /api/ai/agent-chat هر دو از یک منبع مشترک استفاده کنند
// و drift بین دو اندپوینت رخ ندهد.
// ============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toJalali, JALALI_MONTHS, getCurrentJalaliYear, getCurrentJalaliMonth, jalaliToGregorian } from "@/lib/persian";
import { PLANS } from "@/lib/plans";

export interface UserContext {
  tenantName: string;
  plan: string;
  planFa?: string;
  status: string;
  planLimits?: {
    maxUsers: number;
    maxInvoices: number;
    maxWarehouses: number;
  };
  warehouse?: {
    productCount: number;
    lowStockCount: number;
    totalStockValueToman?: number;
    warehouseCount: number;
  };
  market?: {
    usdToman?: number;
    eurToman?: number;
    goldGeram18Toman?: number;
    goldSekeToman?: number;
    fetchedAt?: string;
  };
  fiscal?: {
    name: string;
    startDate: string;
    endDate: string;
  };
  invoiceMix?: {
    reserved: number;
    credit: number;
    creditUnpaidToman: number;
  };
  kpis?: {
    revenue: number;
    expenses: number;
    profit: number;
    cash: number;
    receivable: number;
    payable: number;
  };
  counts?: {
    invoices: number;
    parties: number;
    products: number;
    checks: number;
    employees: number;
  };
  recentInvoices?: Array<{
    number: string;
    type: string;
    partyName: string;
    total: number;
    status: string;
    date: string;
  }>;
  jalaliDate: string;
}

/** نمایش تاریخ شمسی امروز برای درج در پرامپت */
export function currentJalaliDisplay(): string {
  const now = new Date();
  const jy = getCurrentJalaliYear(now);
  const jm = getCurrentJalaliMonth(now);
  const jd = Number(toJalali(now).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).split("/")[2]);
  const monthName = JALALI_MONTHS[jm - 1] || "";
  return `${toJalali(now)} (${jd} ${monthName} ${jy})`;
}

/**
 * ساخت زمینه کاربر (KPI ماه جاری، تعداد رکوردها، فاکتورهای اخیر).
 * در صورت خطا فقط tenant name+plan+date برمی‌گرداند (best-effort).
 */
export async function buildUserContext(
  _req: NextRequest,
  tenantId: string
): Promise<UserContext | null> {
  void _req; // برای سازگاری امضای قبلی — درخواست استفاده نمی‌شود
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        plan: true,
        status: true,
      },
    });
    if (!tenant) return null;

    const ctx: UserContext = {
      tenantName: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      jalaliDate: currentJalaliDisplay(),
    };

    // Task 21-D: نام + سقف‌های کلیدی پلن (از PLANS استاتیک — کش‌نشده و ارزان)
    try {
      const planDef = PLANS.find(
        (p) =>
          p.id === tenant.plan ||
          p.name === tenant.plan ||
          p.nameEn.toLowerCase() === tenant.plan.toLowerCase()
      );
      if (planDef) {
        ctx.planFa = planDef.name;
        ctx.planLimits = {
          maxUsers: planDef.maxUsers,
          maxInvoices: planDef.maxInvoices,
          maxWarehouses: planDef.maxWarehouses,
        };
      }
    } catch {
      // best-effort
    }

    // دریافت موازی KPI + تعدادها + فاکتورهای اخیر
    const now = new Date();
    // FIX(v11): «ماه جاری» شمسی است نه میلادی — هماهنگ با query_kpis ایجنت
    // (قبلاً حدود ۱۰ روز از هر ماه شمسی، اعداد زمینه با نتیجه ابزار فرق می‌کرد)
    const jy = getCurrentJalaliYear(now);
    const jm = getCurrentJalaliMonth(now);
    const [mGy, mGm, mGd] = jalaliToGregorian(jy, jm, 1);
    const monthStart = new Date(mGy, mGm - 1, mGd);

    try {
      const [
        salesSum,
        purchaseSum,
        cashSum,
        receivableSum,
        payableSum,
        counts,
        recentInvoices,
        // Task 21-D: زمینه غنی‌تر — انبار/بازار/دوره مالی/ترکیب فاکتور (همه در همان Promise.all)
        warehouseSummary,
        marketRates,
        fiscalYear,
        invoiceMix,
      ] = await Promise.all([
        // درآمد (فاکتورهای فروش این ماه)
        db.invoice
          .aggregate({
            where: { tenantId, type: "SALE", deletedAt: null, date: { gte: monthStart } },
            _sum: { total: true },
          })
          .catch(() => ({ _sum: { total: null as bigint | null } })),
        // هزینه (فاکتورهای خرید این ماه)
        db.invoice
          .aggregate({
            where: { tenantId, type: "PURCHASE", deletedAt: null, date: { gte: monthStart } },
            _sum: { total: true },
          })
          .catch(() => ({ _sum: { total: null as bigint | null } })),
        // نقدی (موجودی حساب‌های بانکی فعال — BankAccount فیلد isActive ندارد، از deletedAt استفاده می‌شود)
        db.bankAccount
          .aggregate({
            where: { tenantId, deletedAt: null },
            _sum: { balance: true },
          })
          .catch(() => ({ _sum: { balance: null as bigint | null } })),
        // مطالبات (فروش تسویه‌نشده)
        db.invoice
          .aggregate({
            where: { tenantId, type: "SALE", deletedAt: null, status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
            _sum: { total: true, paidAmount: true },
          })
          .catch(() => ({ _sum: { total: null as bigint | null, paidAmount: null as bigint | null } })),
        // بدهی (خرید تسویه‌نشده)
        db.invoice
          .aggregate({
            where: { tenantId, type: "PURCHASE", deletedAt: null, status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
            _sum: { total: true, paidAmount: true },
          })
          .catch(() => ({ _sum: { total: null as bigint | null, paidAmount: null as bigint | null } })),
        // تعدادها
        Promise.all([
          db.invoice.count({ where: { tenantId, deletedAt: null } }),
          db.party.count({ where: { tenantId, deletedAt: null } }),
          db.product.count({ where: { tenantId, deletedAt: null } }),
          db.check.count({ where: { tenantId, deletedAt: null } }),
          db.employee.count({ where: { tenantId, deletedAt: null } }),
        ])
          .then(([invoices, parties, products, checks, employees]) => ({
            invoices,
            parties,
            products,
            checks,
            employees,
          }))
          .catch(() => null),
        // فاکتورهای اخیر
        db.invoice
          .findMany({
            where: { tenantId, deletedAt: null },
            orderBy: { date: "desc" },
            take: 5,
            include: { party: { select: { name: true } } },
          })
          .catch(() => []),
        // Task 21-D: خلاصه انبار — تعداد کالا + شمار کم‌موجود + تعداد انبار
        // (کالاهای بدون حرکت انبار با موجودی ۰ در شمار کم‌موجود فقط اگر minStock>0)
        (async () => {
          const [productCount, warehouseCount, products] = await Promise.all([
            db.product.count({ where: { tenantId, deletedAt: null } }),
            db.warehouse.count({ where: { tenantId, deletedAt: null } }),
            db.product.findMany({
              where: { tenantId, deletedAt: null, minStock: { gt: 0 } },
              select: { id: true, minStock: true },
              take: 500,
            }),
          ]);
          if (products.length === 0) {
            return { productCount, warehouseCount, lowStockCount: 0 };
          }
          const stockAgg = await db.stockItem.groupBy({
            by: ["productId"],
            where: { tenantId, productId: { in: products.map((p) => p.id) } },
            _sum: { quantity: true },
          });
          const stockMap = new Map(stockAgg.map((s) => [s.productId, s._sum.quantity ?? 0]));
          const lowStockCount = products.filter(
            (p) => (stockMap.get(p.id) ?? 0) <= p.minStock
          ).length;
          return { productCount, warehouseCount, lowStockCount };
        })().catch(() => null),
        // Task 21-D: نرخ‌های بازار — دلار/یورو/طلا/سکه (ExchangeRate — واحد ریال)
        (async () => {
          const wanted = ["USD", "EUR", "GOLD_GERAM18", "GOLD_SEKEE"];
          const rates = await db.exchangeRate
            .findMany({
              where: { toCurrency: "IRR", fromCurrency: { in: wanted } },
              orderBy: { fetchedAt: "desc" },
              take: 12,
            })
            .catch(() => []);
          const latest = new Map<string, { rate: number; fetchedAt: Date }>();
          for (const r of rates) {
            if (!latest.has(r.fromCurrency)) {
              latest.set(r.fromCurrency, { rate: r.rate, fetchedAt: r.fetchedAt });
            }
          }
          return {
            usd: latest.get("USD") ?? null,
            eur: latest.get("EUR") ?? null,
            geram18: latest.get("GOLD_GERAM18") ?? null,
            seke: latest.get("GOLD_SEKEE") ?? null,
          };
        })().catch(() => null),
        // Task 21-D: دوره مالی جاری
        db.fiscalYear
          .findFirst({
            where: { tenantId, isCurrent: true },
            select: { name: true, startDate: true, endDate: true },
          })
          .catch(() => null),
        // Task 21-D: ترکیب فاکتور — رزروها + قرضی‌های تسویه‌نشده
        (async () => {
          const [reserved, credit, creditAgg] = await Promise.all([
            db.invoice.count({
              where: { tenantId, deletedAt: null, status: "RESERVED" },
            }),
            db.invoice.count({
              where: { tenantId, deletedAt: null, paymentType: "CREDIT" },
            }),
            db.invoice.aggregate({
              where: {
                tenantId,
                deletedAt: null,
                type: "SALE",
                paymentType: "CREDIT",
                status: { in: ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] },
              },
              _sum: { total: true, paidAmount: true },
            }),
          ]);
          const total = creditAgg._sum.total ?? 0n;
          const paid = creditAgg._sum.paidAmount ?? 0n;
          return {
            reserved,
            credit,
            creditUnpaidRial: total > paid ? total - paid : 0n,
          };
        })().catch(() => null),
      ]);

      const toNum = (v: bigint | null): number => (v ? Number(v) : 0);
      const revenue = toNum(salesSum._sum?.total ?? null);
      const expenses = toNum(purchaseSum._sum?.total ?? null);
      const cash = toNum(cashSum._sum?.balance ?? null);
      const recTotal = toNum(receivableSum._sum?.total ?? null);
      const recPaid = toNum(receivableSum._sum?.paidAmount ?? null);
      const payTotal = toNum(payableSum._sum?.total ?? null);
      const payPaid = toNum(payableSum._sum?.paidAmount ?? null);

      // مبالغ در دیتابیس به ریال هستند — تبدیل به تومان
      ctx.kpis = {
        revenue: Math.floor(revenue / 10),
        expenses: Math.floor(expenses / 10),
        profit: Math.floor((revenue - expenses) / 10),
        cash: Math.floor(cash / 10),
        receivable: Math.floor(Math.max(0, recTotal - recPaid) / 10),
        payable: Math.floor(Math.max(0, payTotal - payPaid) / 10),
      };

      if (counts) ctx.counts = counts;

      if (recentInvoices && recentInvoices.length > 0) {
        ctx.recentInvoices = recentInvoices.map((inv) => ({
          number: inv.number,
          type: inv.type,
          partyName: inv.party?.name || "—",
          total: Math.floor(Number(inv.total) / 10),
          status: inv.status,
          date: toJalali(inv.date),
        }));
      }

      // Task 21-D: انبار/بازار/دوره مالی/ترکیب فاکتور
      if (warehouseSummary) {
        ctx.warehouse = {
          productCount: warehouseSummary.productCount,
          lowStockCount: warehouseSummary.lowStockCount,
          warehouseCount: warehouseSummary.warehouseCount,
        };
      }
      if (marketRates) {
        ctx.market = {};
        if (marketRates.usd) ctx.market.usdToman = Math.floor(marketRates.usd.rate / 10);
        if (marketRates.eur) ctx.market.eurToman = Math.floor(marketRates.eur.rate / 10);
        if (marketRates.geram18)
          ctx.market.goldGeram18Toman = Math.floor(marketRates.geram18.rate / 10);
        if (marketRates.seke) ctx.market.goldSekeToman = Math.floor(marketRates.seke.rate / 10);
        const freshest =
          marketRates.usd?.fetchedAt ??
          marketRates.geram18?.fetchedAt ??
          marketRates.seke?.fetchedAt ??
          null;
        if (freshest) ctx.market.fetchedAt = toJalali(freshest);
      }
      if (fiscalYear) {
        ctx.fiscal = {
          name: fiscalYear.name,
          startDate: toJalali(fiscalYear.startDate),
          endDate: toJalali(fiscalYear.endDate),
        };
      }
      if (invoiceMix) {
        ctx.invoiceMix = {
          reserved: invoiceMix.reserved,
          credit: invoiceMix.credit,
          creditUnpaidToman: Math.floor(Number(invoiceMix.creditUnpaidRial) / 10),
        };
      }
    } catch (err) {
      // اگر DB در دسترس نبود، حداقل tenant name+plan+date را برگردان
      console.error("AI context build error:", err);
    }

    return ctx;
  } catch (err) {
    console.error("AI context tenant fetch error:", err);
    return null;
  }
}

/**
 * قالب‌بندی زمینه کاربر به متن فارسی برای درج در system prompt.
 */
export function formatContextForPrompt(ctx: UserContext): string {
  const lines: string[] = [];
  lines.push(`=== متن زمینه کاربر ===`);
  lines.push(`نام شرکت/tenant: ${ctx.tenantName}`);
  lines.push(`پلان: ${ctx.planFa ? `${ctx.planFa} (${ctx.plan})` : ctx.plan}`);
  lines.push(`وضعیت: ${ctx.status}`);
  lines.push(`تاریخ امروز (شمسی): ${ctx.jalaliDate}`);

  if (ctx.planLimits) {
    const l = ctx.planLimits;
    lines.push(
      `سقف‌های پلن: کاربر ${l.maxUsers === -1 ? "نامحدود" : l.maxUsers} | فاکتور/سال ${
        l.maxInvoices === -1 ? "نامحدود" : l.maxInvoices
      } | انبار ${l.maxWarehouses === -1 ? "نامحدود" : l.maxWarehouses}`
    );
  }
  if (ctx.fiscal) {
    lines.push(
      `دوره مالی جاری: ${ctx.fiscal.name} (${ctx.fiscal.startDate} تا ${ctx.fiscal.endDate})`
    );
  }

  if (ctx.warehouse) {
    const w = ctx.warehouse;
    lines.push(
      `\n--- انبار ---\nکالا: ${w.productCount} | انبار: ${w.warehouseCount} | کالای رو‌به‌اتمام (موجودی ≤ حداقل): ${w.lowStockCount}`
    );
  }

  if (ctx.market) {
    const m = ctx.market;
    const parts: string[] = [];
    if (m.usdToman !== undefined) parts.push(`دلار ${m.usdToman.toLocaleString("en-US")}`);
    if (m.eurToman !== undefined) parts.push(`یورو ${m.eurToman.toLocaleString("en-US")}`);
    if (m.goldGeram18Toman !== undefined)
      parts.push(`گرم طلای ۱۸ عیار ${m.goldGeram18Toman.toLocaleString("en-US")}`);
    if (m.goldSekeToman !== undefined)
      parts.push(`سکه امامی ${m.goldSekeToman.toLocaleString("en-US")}`);
    if (parts.length > 0) {
      lines.push(
        `\n--- نرخ‌های ثبت‌شده بازار (تومان${
          m.fetchedAt ? ` — آخرین به‌روزرسانی ${m.fetchedAt}` : ""
        }) ---\n${parts.join(" | ")}`
      );
    }
  }

  if (ctx.invoiceMix && (ctx.invoiceMix.reserved > 0 || ctx.invoiceMix.credit > 0)) {
    const im = ctx.invoiceMix;
    lines.push(
      `\n--- فاکتورهای خاص ---\nرزرو (ثبت‌نشده نهایی): ${im.reserved} | قرضی/نسیه: ${im.credit} | مانده تسویه قرضی‌ها: ${im.creditUnpaidToman.toLocaleString("en-US")} تومان`
    );
  }

  if (ctx.kpis) {
    const k = ctx.kpis;
    lines.push(`\n--- شاخص‌های مالی ماه جاری (به تومان) ---`);
    lines.push(`درآمد (فروش): ${k.revenue.toLocaleString("en-US")}`);
    lines.push(`هزینه (خرید): ${k.expenses.toLocaleString("en-US")}`);
    lines.push(`سود/زیان: ${k.profit.toLocaleString("en-US")}`);
    lines.push(`موجودی نقدی: ${k.cash.toLocaleString("en-US")}`);
    lines.push(`مطالبات معوق: ${k.receivable.toLocaleString("en-US")}`);
    lines.push(`بدهی به تأمین‌کنندگان: ${k.payable.toLocaleString("en-US")}`);
  }

  if (ctx.counts) {
    const c = ctx.counts;
    lines.push(`\n--- تعداد رکوردها ---`);
    lines.push(
      `فاکتور: ${c.invoices} | طرف‌حساب: ${c.parties} | محصول: ${c.products} | چک: ${c.checks} | کارمند: ${c.employees}`
    );
  }

  if (ctx.recentInvoices && ctx.recentInvoices.length > 0) {
    lines.push(`\n--- ۵ فاکتور اخیر ---`);
    lines.push("| شماره | نوع | طرف‌حساب | مبلغ(تومان) | وضعیت | تاریخ |");
    lines.push("|-------|-----|----------|-------------|--------|-------|");
    for (const inv of ctx.recentInvoices) {
      const typeFa =
        inv.type === "SALE"
          ? "فروش"
          : inv.type === "PURCHASE"
            ? "خرید"
            : inv.type === "RETURN"
              ? "برگشتی"
              : inv.type === "PRE_INVOICE"
                ? "پیش‌فاکتور"
                : inv.type;
      lines.push(
        `| ${inv.number} | ${typeFa} | ${inv.partyName} | ${inv.total.toLocaleString("en-US")} | ${inv.status} | ${inv.date} |`
      );
    }
  }

  lines.push(`=== پایان متن زمینه ===`);
  lines.push(``);
  lines.push(
    `از این داده‌ها برای پاسخ به سوالات کاربر (مثل «چقدر فروش داشتم؟»، «وضعیت مالی‌ام چطوره؟»، «چقدر بدهی دارم؟») استفاده کن. اگر داده‌ای صفر است، صادقانه بگو داده‌ای ثبت نشده.`
  );

  return lines.join("\n");
}
