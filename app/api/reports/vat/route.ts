import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getReadDb } from "@/lib/db-replica";
import { getJalaliQuarterRange, JALALI_MONTHS, getCurrentJalaliYear } from "@/lib/persian";

export const runtime = "nodejs";

// GET /api/reports/vat — گزارش ارزش افزوده فصلی (از read replica اگر پیکربندی شده باشد)
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
// FIX (M3): فیلتر واقعی بر اساس فصل و سال شمسی — قبلاً همه‌ی فاکتورها را برمی‌گرداند
// FIX (M1): پیش‌فرض سال شمسی جاری، نه ۱۴۰۳ ثابت
//
// FIX (F1): «مالیات قابل پرداخت» از جمع واقعی invoice.tax محاسبه می‌شود
//   (payable = outputVAT − inputVAT) — فرمول ۹٪×جمع و fallback ساختگی حذف شد.
// FIX (F2): فاکتورهای برگشتی (RETURN) به‌عنوان تعدیل منفی — برگشت از فروش، مالیات
//   فروش را کم می‌کند؛ برگشت از خرید، مالیات خرید را. فاکتورهای معاف (بدون مالیات)
//   از پایه‌های مشمول جدا گزارش می‌شوند.
// واحد خروجی: ریال (مطابق DB و lib/tax-filing).
export async function GET(req: NextRequest) {
  try {
    const db = getReadDb();
    const { searchParams } = new URL(req.url);
    const quarter = Math.max(1, Math.min(4, Number(searchParams.get("quarter") || 1)));
    const year = Number(searchParams.get("year") || getCurrentJalaliYear());

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;

    // محاسبه‌ی بازه‌ی زمانی فصل شمسی (FIX M3) — [start, end) شامل تمام روزهای فصل
    const { start, end } = getJalaliQuarterRange(year, quarter);

    const periodFilter = {
      tenantId,
      deletedAt: null,
      // فقط فاکتورهای تأییدشده در گزارش مالیاتی لحاظ می‌شوند
      status: { notIn: ["DRAFT", "CANCELLED"] },
      date: { gte: start, lt: end },
    };

    // فاکتورهای فروش، خرید و برگشتیِ فصل — مالیات از invoice.tax واقعی جمع می‌شود
    const [salesInvoices, purchaseInvoices, returnInvoices] = await Promise.all([
      db.invoice.findMany({
        where: { ...periodFilter, type: "SALE" },
        select: { subtotal: true, tax: true, number: true, date: true, status: true },
      }),
      db.invoice.findMany({
        where: { ...periodFilter, type: "PURCHASE" },
        select: { subtotal: true, tax: true, number: true, date: true, status: true },
      }),
      db.invoice.findMany({
        where: { ...periodFilter, type: "RETURN" },
        select: { subtotal: true, tax: true, party: { select: { type: true } } },
      }),
    ]);

    // فاکتور «بدون مالیات» (معاف) در پایه مشمول لحاظ نمی‌شود (FIX F1/F2)
    const taxableSales = salesInvoices.filter((i) => Number(i.tax) !== 0);
    const taxablePurchases = purchaseInvoices.filter((i) => Number(i.tax) !== 0);
    const salesTotal = taxableSales.reduce((s, i) => s + Number(i.subtotal), 0);
    const purchasesTotal = taxablePurchases.reduce((s, i) => s + Number(i.subtotal), 0);
    const exemptSales = salesInvoices
      .filter((i) => Number(i.tax) === 0)
      .reduce((s, i) => s + Number(i.subtotal), 0);
    const exemptPurchases = purchaseInvoices
      .filter((i) => Number(i.tax) === 0)
      .reduce((s, i) => s + Number(i.subtotal), 0);

    // جمع واقعی مالیات (ریال) — از invoice.tax
    const salesVAT = salesInvoices.reduce((s, i) => s + Number(i.tax), 0);
    const purchaseVAT = purchaseInvoices.reduce((s, i) => s + Number(i.tax), 0);

    // برگشتی‌ها: جهت از نوع طرف‌حساب (FIX F2)
    const salesReturnTax = returnInvoices
      .filter((i) => i.party?.type !== "SUPPLIER") // برگشت از فروش → کاهش مالیات فروش
      .reduce((s, i) => s + Number(i.tax), 0);
    const purchaseReturnTax = returnInvoices
      .filter((i) => i.party?.type === "SUPPLIER") // برگشت از خرید → کاهش مالیات خرید
      .reduce((s, i) => s + Number(i.tax), 0);
    const salesReturnTotal = returnInvoices
      .filter((i) => i.party?.type !== "SUPPLIER")
      .reduce((s, i) => s + Number(i.subtotal), 0);
    const purchaseReturnTotal = returnInvoices
      .filter((i) => i.party?.type === "SUPPLIER")
      .reduce((s, i) => s + Number(i.subtotal), 0);

    // FIX (F1): payable = مالیات فروش واقعی − مالیات خرید واقعی (بدون فرمول ۹٪)
    const outputVAT = Math.round(salesVAT - salesReturnTax);
    const inputVAT = Math.round(purchaseVAT - purchaseReturnTax);
    const payable = Math.round(outputVAT - inputVAT);

    // برچسب فصل برای نمایش در UI
    const startMonth = (quarter - 1) * 3 + 1;
    const quarterLabel = `${JALALI_MONTHS[startMonth - 1]} – ${JALALI_MONTHS[startMonth + 1]} ${year}`;

    return NextResponse.json({
      success: true,
      data: {
        quarter,
        year,
        quarterLabel,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        // پایه‌های مشمول (بدون فاکتورهای معاف) — به ریال
        sales: salesTotal,
        purchases: purchasesTotal,
        exemptSales,
        exemptPurchases,
        // تعدیل برگشتی‌ها (FIX F2)
        salesReturns: { tax: salesReturnTax, base: salesReturnTotal },
        purchaseReturns: { tax: purchaseReturnTax, base: purchaseReturnTotal },
        // FIX (F1): بدون fallback ساختگی — اگر داده‌ای نبود، صفرِ صادقانه
        outputVAT,
        inputVAT,
        payable,
        invoiceCount: {
          sales: salesInvoices.length,
          purchases: purchaseInvoices.length,
          returns: returnInvoices.length,
        },
      },
    });
  } catch (error) {
    console.error("VAT report error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در گزارش ارزش افزوده" },
      { status: 500 }
    );
  }
}
