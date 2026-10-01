import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { getCurrentJalaliYear, getJalaliYearRange } from "@/lib/persian";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * سال مالی بودجه به عدد سال شمسی تبدیل می‌شود.
 * FIX (CRITICAL): قبلاً «شمسی − ۶۲۱» محاسبه می‌شد (سال ۰۷۸۲ میلادی!) و
 * `startsWith("13")` هیچ‌وقت سال‌های ۱۴xx را نمی‌شناخت → بازه‌ی تاریخ هیچ‌وقت
 * فاکتورها را نمی‌پوشاند و تحقق همیشه صفر بود.
 * درست:میلادی = شمسی + ۶۲۱ (۱۴۰۵ ۲۰۲۶) — از jalaliToGregorian داخل
 * lib/persian (getJalaliYearRange) استفاده می‌کنیم تا کبیسه/نوروز هم درست باشد.
 * پذیرش سال: رشته/عدد ۴ رقمی در بازه‌ی ۱۳۰۰..۱۵۰۰ (۱۳xx و ۱۴xx).
 */
function parseJalaliFiscalYear(fiscalYear: string | null | undefined): number {
  const s = String(fiscalYear ?? "").trim();
  const n = Number(s);
  if (/^\d{4}$/.test(s) && Number.isFinite(n) && n >= 1300 && n <= 1500) {
    return n;
  }
  // سال نامعتبر (میلادی/کوتاه) → سال شمسی جاری، نه سال ۷۸۲ میلادی
  return getCurrentJalaliYear();
}

// GET /api/budget/[id]/compare — مقایسه بودجه با تحقق
// همچنین جمع تحقق را از فاکتورها/اسناد واقعی سیستم به‌روز می‌کند (در صورت در دسترس بودن)
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const authCtx = await getAuthContext(req);
    if (!authCtx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const { id } = await ctx.params;
    const budget = await db.budget.findFirst({
      where: { id, tenantId: authCtx.tenantId },
      include: { items: true },
    });
    if (!budget) {
      return NextResponse.json(
        { success: false, error: "بودجه یافت نشد" },
        { status: 404 }
      );
    }

    // بازه‌ی سال مالی شمسی: ۱ فروردین تا ۱ فروردین سال بعد (میلادی معادل)
    const jalaliYear = parseJalaliFiscalYear(budget.fiscalYear);
    const { start: yearStart, end: yearEnd } = getJalaliYearRange(jalaliYear);

    const invoices = await db.invoice.findMany({
      where: {
        tenantId: budget.tenantId,
        date: { gte: yearStart, lt: yearEnd },
        status: { notIn: ["DRAFT", "CANCELLED"] },
        deletedAt: null,
      },
      select: { type: true, total: true },
    });

    // جمع فروش/خرید به دسته‌بندی "فروش" و "خرید"
    let totalSales = 0n;
    let totalPurchase = 0n;
    for (const inv of invoices) {
      if (inv.type === "SALE") totalSales += inv.total;
      else if (inv.type === "PURCHASE") totalPurchase += inv.total;
    }

    // FIX (واحد پول): فاکتورها «ریال» ذخیره می‌شوند اما Budget/BudgetItem به
    // «تومان» ذخیره می‌شود (فرم budget-planning مبالغ را تومان می‌فرستد).
    // برای مقایسه، تحقق ریالی ÷ ۱۰ → تومان (بودجه دست‌نخورده می‌ماند).
    const totalSalesToman = Number(totalSales) / 10;
    const totalPurchaseToman = Number(totalPurchase) / 10;

    // به‌روزرسانی actualAmount آیتم‌ها (در صورت مطابقت دسته)
    const updatedItems = budget.items.map((it) => {
      let actual = Number(it.actualAmount ?? 0);
      if (it.category === "فروش" || it.category === "SALE") {
        actual = totalSalesToman;
      } else if (it.category === "خرید" || it.category === "PURCHASE") {
        actual = totalPurchaseToman;
      }
      return {
        id: it.id,
        category: it.category,
        period: it.period,
        budgetAmount: Number(it.budgetAmount),
        actualAmount: actual,
        variance: actual - Number(it.budgetAmount),
      };
    });

    // FIX (MEDIUM): actualAmount محاسبه‌شده persist می‌شود (قبلاً فقط در حافظه
    // بود و check-alerts روی مقادیر قدیمی شلیک می‌کرد) — آپدیت تراکنشی
    await db.$transaction(
      updatedItems
        .filter(
          (it) =>
            it.id && !it.id.startsWith("cat_") &&
            Number.isFinite(it.actualAmount)
        )
        .map((it) =>
          db.budgetItem.update({
            where: { id: it.id },
            data: {
              actualAmount: BigInt(Math.round(it.actualAmount)),
              variance: BigInt(Math.round(it.variance)),
            },
          })
        )
    );

    // محاسبه‌ی کلی
    const totalBudget = updatedItems.reduce(
      (s, it) => s + it.budgetAmount,
      0
    );
    const totalActual = updatedItems.reduce((s, it) => s + it.actualAmount, 0);
    const totalVariance = totalActual - totalBudget;

    return NextResponse.json({
      success: true,
      data: {
        budgetId: budget.id,
        title: budget.title,
        fiscalYear: budget.fiscalYear,
        period: budget.period,
        totalBudget,
        totalActual,
        totalVariance,
        variancePercent:
          totalBudget > 0
            ? Number(((totalVariance / totalBudget) * 100).toFixed(2))
            : 0,
        items: updatedItems,
        // برای نمودار Pie دسته‌بندی
        byCategory: updatedItems.map((it) => ({
          category: it.category,
          budget: it.budgetAmount,
          actual: it.actualAmount,
          variance: it.variance,
        })),
      },
    });
  } catch (error) {
    console.error("Budget compare error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در مقایسه بودجه" },
      { status: 500 }
    );
  }
}
