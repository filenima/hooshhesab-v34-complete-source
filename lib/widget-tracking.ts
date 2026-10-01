// ============================================================
// widget-tracking — ثبت بازدید ویجت‌های قابل embed (v28)
// ============================================================
// حلقهٔ بازخورد کانال توزیع شرکا: هر بار ویجت (iframe) در سایت میزبان
// بارگذاری می‌شود، یک beacon سبک به /api/widgets/track زده می‌شود.
// سوپرادمین در تب «آمار ویجت‌ها» می‌بیند کدام ویجت‌ها روی کدام دامنه‌ها
// نصب شده‌اند و چه بازدیدی می‌آورند — دادهٔ خام برای برنامهٔ شراکت.
//
// نکتهٔ حریم خصوصی: فقط دامنهٔ میزبان و referrer ثبت می‌شود؛ IP خام
// هرگز ذخیره نمی‌شود (الگوی NewsletterSubscriber).

import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

/** ویجت‌های مجاز — هر چیزی خارج از این لیست رد می‌شود */
export const TRACKABLE_WIDGETS = new Set([
  "plan-quiz",
  "tax-calculator",
  "financial-health",
  "payroll-calculator",
  "profit-calculator",
  "depreciation-calculator",
  "invoice",
  "payment",
  "booking",
]);

export const WIDGET_LABELS: Record<string, string> = {
  "plan-quiz": "کوییز انتخاب پلن",
  "tax-calculator": "ماشین‌حساب مالیات ۱۴۰۴",
  "financial-health": "سنجش سریع سلامت مالی",
  "payroll-calculator": "ماشین‌حساب حقوق و دستمزد",
  "profit-calculator": "ماشین‌حساب سود و حاشیه سود",
  "depreciation-calculator": "ماشین‌حساب استهلاک",
  invoice: "فاکتور عمومی برنددار",
  payment: "دکمه پرداخت آنلاین",
  booking: "فرم رزرو نوبت",
};

/** استخراج دامنهٔ میزبان از referrer — بدون پروتکل و مسیر */
export function extractHost(referrer: string | null | undefined): string {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, "") || "direct";
  } catch {
    return "direct";
  }
}

/** ثبت یک بازدید — nullable تا caller بتواند fail-safe باشد */
export async function recordWidgetView(params: {
  widget: string;
  referrer?: string | null;
}): Promise<boolean> {
  const { widget, referrer } = params;
  if (!TRACKABLE_WIDGETS.has(widget)) return false;

  // referrer اگر خیلی بلند است کوتاه شود (ذخیرهٔ حداکثر ۳۰۰ کاراکتر)
  const safeReferrer = referrer ? referrer.slice(0, 300) : null;
  const host = extractHost(referrer);

  try {
    await db.widgetView.create({
      data: { widget, host, referrer: safeReferrer },
    });
    return true;
  } catch {
    // ثبت آمار هرگز نباید تجربهٔ کاربر ویجت را خراب کند
    return false;
  }
}

/** خلاصهٔ آمار برای پنل سوپرادمین */
export async function getWidgetViewStats() {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const [perWidget, perHost, total, last30, last7, today] = await Promise.all([
    db.widgetView.groupBy({
      by: ["widget"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    db.widgetView.groupBy({
      by: ["host"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 15,
    }),
    db.widgetView.count(),
    db.widgetView.count({ where: { createdAt: { gte: daysAgo(30) } } }),
    db.widgetView.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    db.widgetView.count({
      where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
    }),
  ]);

  // سری روزانهٔ ۳۰ روز اخیر برای نمودار مینی
  const dailyRaw = await db.widgetView.findMany({
    where: { createdAt: { gte: daysAgo(30) } },
    select: { createdAt: true },
  });
  const daily: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = daysAgo(i);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    daily.push({
      date: start.toISOString().slice(0, 10),
      count: dailyRaw.filter((v) => v.createdAt >= start && v.createdAt < end).length,
    });
  }

  return {
    total,
    last30,
    last7,
    today,
    perWidget: perWidget.map((w) => ({
      widget: w.widget,
      label: WIDGET_LABELS[w.widget] || w.widget,
      count: w._count.id,
    })),
    perHost: perHost.map((h) => ({ host: h.host, count: h._count.id })),
    daily,
  };
}

/** کمک‌نویس — از درون route handler */
export function trackingRequestFromNext(req: NextRequest) {
  return {
    widget: req.nextUrl.searchParams.get("widget") || "",
    referrer: req.headers.get("referer"),
  };
}
