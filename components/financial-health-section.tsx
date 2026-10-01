"use client";

/**
 * FinancialHealthSection — سنجش سلامت مالی کسب‌وکار (v23)
 * ----------------------------------------------------------------------------
 * ابزار تعاملی رایگان: کاربر به ۱۰ پرسش کلیدی پاسخ می‌دهد (بله/تا حدی/خیر)
 * و امتیاز ۰ تا ۱۰۰ + نمرهٔ وضعیت + توصیه‌های شخصی‌سازی‌شده می‌گیرد.
 *
 * هدف: لیدمگنت سئو («سلامت مالی کسب‌وکار»، «ارزیابی مالیاتی کسب‌وکار») +
 * نمایش تخصص محصول. هر توصیه به ماژول/مقالهٔ مرتبط لینک می‌شود (لینک‌سازی
 * داخلی) و CTA پایانی به pricing می‌رود.
 *
 * نکته فنی: هم در LandingView (سکشن SPA) استفاده می‌شود و هم در مسیر سئویی
 * /financial-health — props اختیاری است تا در هر دو کار کند.
 */

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileBarChart,
  FileDown,
  HandCoins,
  Landmark,
  PackageSearch,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toPersianDigits, toJalali } from "@/lib/persian";
import { useBranding } from "@/hooks/use-branding";

/* ================================================================
 * داده‌های سنجش — ۱۰ سنجهٔ استاندارد سلامت مالی کسب‌وکار
 * ================================================================ */

interface HealthQuestion {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  /** توصیه در صورت پاسخ ضعیف (خیر یا تا حدی) */
  rec: {
    title: string;
    text: string;
    href: string;
    linkLabel: string;
  };
}

const QUESTIONS: HealthQuestion[] = [
  {
    id: "separation",
    icon: Landmark,
    title: "حساب بانکی کسب‌وکار شما از حساب شخصی جدا است؟",
    hint: "تراکنش‌های شخصی و کاری از یک حساب عبور نمی‌کنند",
    rec: {
      title: "جداسازی حساب بانکی",
      text: "حساب مخلوط یعنی ردیابی سخت، خطای مالیاتی و دردسر در ممیزی. یک حساب مجزا باز کنید و تراکنش‌های شخصی را از دخل شرکت حذف کنید.",
      href: "/blog/cash-flow-management-small-business",
      linkLabel: "راهنمای مدیریت جریان نقدی",
    },
  },
  {
    id: "moadian",
    icon: ShieldCheck,
    title: "برای تمام فروش‌ها صورتحساب الکترونیکی مودیان صادر می‌کنید؟",
    hint: "الزام قانون پایانه‌های فروشگاهی و سامانه مودیان",
    rec: {
      title: "انطباق با سامانه مودیان",
      text: "عدم صدور صورتحساب الکترونیکی مشمول جرایم ماده ۱۶۹ می‌شود و اعتبار مالیاتی شما را از دست می‌دهد. ارسال خودکار این ریسک را صفر می‌کند.",
      href: "/moadian-invoice",
      linkLabel: "آزمایشگاه صورتحساب مودیان",
    },
  },
  {
    id: "recording",
    icon: BookOpenCheck,
    title: "تراکنش‌ها (فروش/خرید/هزینه) را روزانه یا هفتگی ثبت می‌کنید؟",
    hint: "نه پایان ماه/سال به‌صورت دسته‌ای",
    rec: {
      title: "ثبت به‌موقع اسناد",
      text: "ثبت دیرهنگام یعنی فراموشی، خطا و گزارش بی‌اعتبار. ثبت روزانه با اسکن فاکتور و OCR خودکار در هوش ۳۰ ثانیه طول می‌کشد.",
      href: "/blog/retail-store-accounting-guide",
      linkLabel: "راهنمای حسابداری فروشگاهی",
    },
  },
  {
    id: "cashflow",
    icon: Activity,
    title: "جریان نقدی ۳۰ روز آینده را پیش‌بینی و رصد می‌کنید؟",
    hint: "مطمئن هستید سر موعد چک/قسط، پول در حساب هست؟",
    rec: {
      title: "پیش‌بینی جریان نقدی",
      text: "بیشتر کسب‌وکارهای سالم ورشکست می‌شوند چون به‌موقع نقدینگی ندارند، نه چون ضرر می‌کنند. داشبورد نقدینگی با هشدار کسری، بیمهٔ ورشکستگی شماست.",
      href: "/blog/cash-flow-management-small-business",
      linkLabel: "مدیریت جریان نقدی",
    },
  },
  {
    id: "reconciliation",
    icon: ClipboardCheck,
    title: "مغایرت‌گیری بانکی (تطبیق صورت‌حساب بانک با دفاتر) دوره‌ای انجام می‌دهید؟",
    hint: "ماهانه یا حداقل فصلی",
    rec: {
      title: "مغایرت‌گیری بانکی",
      text: "بدون تطبیق بانک، کارمزد‌ها، واریزی‌های معلق و چک‌های برگشتی دفتر شما را از واقعیت جدا می‌کنند. مغایرت‌گیری خودکار بانکی هوش این فاصله را صفر می‌کند.",
      href: "/blog/bank-integration-reconciliation-guide",
      linkLabel: "راهنمای مغایرت‌گیری بانکی",
    },
  },
  {
    id: "inventory",
    icon: PackageSearch,
    title: "موجودی انبار/کالا را با شمارش دوره‌ای کنترل می‌کنید؟",
    hint: "می‌دانید دقیقاً الان چند عدد از هر کالا در دسترس دارید؟",
    rec: {
      title: "کنترل موجودی",
      text: "کالای گم‌شده و انقضا، ساکت‌ترین شکل نشتی پول است. شمارش چرخشی + هشدار نقطهٔ سفارش، سرمایهٔ راکد را آزاد می‌کند.",
      href: "/blog/smart-inventory-management-guide",
      linkLabel: "مدیریت هوشمند موجودی",
    },
  },
  {
    id: "tax",
    icon: CalendarCheck,
    title: "سررسیدهای مالیاتی (لیست حقوق، اظهارنامه، عملکرد) هیچ‌وقت از شما عقب نمی‌افتد؟",
    hint: "جریمهٔ تأخیر پرداخت ۲٫۵٪ به‌ازای هر ماه است",
    rec: {
      title: "انضباط مالیاتی",
    text: "هر ماه تأخیر یعنی ۲٫۵٪ جریمه + بلاک اعتماد. تقویم مالیاتی خودکار با یادآوری چند مرحله‌ای، سررسیدها را به فرصت تبدیل می‌کند.",
      href: "/calculators",
      linkLabel: "تقویم مالیاتی زنده",
    },
  },
  {
    id: "reporting",
    icon: FileBarChart,
    title: "گزارش سود و زیان (و ترازنامه) را ماهانه می‌بینید؟",
    hint: "نه فقط پایان سال برای اظهارنامه",
    rec: {
      title: "گزارش‌گیری ماهانه",
      text: "تصمیم ماه‌هاست که فرصت اصلاح می‌دهد؛ گزارش سالانه فقط کالبدشکافی است. صورت‌های مالی زنده در یک کلیک، چرخهٔ تصمیم را کوتاه می‌کند.",
      href: "/blog/management-dashboard-reports-guide",
      linkLabel: "داشبورد مدیریتی و گزارش‌ها",
    },
  },
  {
    id: "budget",
    icon: HandCoins,
    title: "برای سال/فصل بودجه می‌بندید و با واقعی مقایسه می‌کنید؟",
    hint: "برنامهٔ عددی هزینه‌ها و فروش، نه فقط حدس و ذهن",
    rec: {
      title: "بودجه‌بندی عملیاتی",
      text: "بدون بودجه، «هزینه‌کردم چون لازم بود» تبدیل به قانون می‌شود. بودجهٔ غلتکی مقایسه‌شده با واقعی، اولین ابزار کنترل هزینه است.",
      href: "/blog/business-budgeting-guide",
      linkLabel: "بودجه‌بندی کسب‌وکار",
    },
  },
  {
    id: "advisor",
    icon: UserCheck,
    title: "حسابدار یا مشاور مالی متخصص در کنار شماست؟",
    hint: "داخلی، برون‌سپاری یا حتی مشاور دوره‌ای",
    rec: {
      title: "پشتیبان متخصص",
      text: "مالیات و حسابداری ایران هر سال تغییر می‌کند. نداشتن متخصص یعنی یادگیری با جریمه. دستیار هوش مصنوعی + پشتیبانی متخصص، جای این خلا را پر می‌کند.",
      href: "/pricing",
      linkLabel: "پشتیبانی در پلن‌های هوش",
    },
  },
];

/* ================================================================
 * منطق امتیاز
 * ================================================================ */

// وزن پاسخ‌ها: بله = ۲، تا حدی = ۱، خیر = ۰ → جمع ۰..۲۰ → ×۵ = ۰..۱۰۰
const OPTION_SCORE = [0, 1, 2] as const;
const OPTIONS: { label: string; score: number; tone: string }[] = [
  { label: "خیر", score: 0, tone: "rose" },
  { label: "تا حدی", score: 1, tone: "amber" },
  { label: "بله", score: 2, tone: "emerald" },
];

interface Grade {
  key: string;
  label: string;
  color: string; // کلاس‌های رنگ متن
  bar: string; // رنگ نوار
  desc: string;
}

function gradeFor(score: number): Grade {
  if (score >= 80)
    return {
      key: "excellent",
      label: "عالی",
      color: "text-emerald-600 dark:text-emerald-400",
      bar: "#059669",
      desc: "کسب‌وکار شما از نظر مالی سازمان‌یافته است؛ حالا وقت رشد و بهینه‌سازی است، نه ترمیم.",
    };
  if (score >= 60)
    return {
      key: "good",
      label: "خوب",
      color: "text-teal-600 dark:text-teal-400",
      bar: "#0d9488",
      desc: "پایه‌های مالی شما محکم است اما چند حفرهٔ مشخص، ریسک و پول شما را قفل کرده است.",
    };
  if (score >= 40)
    return {
      key: "fair",
      label: "متوسط",
      color: "text-amber-600 dark:text-amber-400",
      bar: "#d97706",
      desc: "در حالت خطرناکی بین نظم و آشفتگی هستید؛ بدون سیستم‌سازی، با رشد، مشکلات هم رشد می‌کنند.",
    };
  return {
    key: "risk",
    label: "نیازمند اقدام فوری",
    color: "text-rose-600 dark:text-rose-400",
    bar: "#e11d48",
    desc: "ساختار مالی شما در معرض ریسک جدی است — از جرایم مالیاتی تا خفه‌شدن نقدینگی. اولویت اول: سیستم‌سازی.",
  };
}

/* ================================================================
 * گیج امتیاز — نیم‌دایرهٔ SVG با انیمیشن
 * ================================================================ */

function ScoreGauge({ score, color }: { score: number; color: string }) {
  const [animated, setAnimated] = React.useState(0);
  React.useEffect(() => {
    // انیمیشن شمارش با easing
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(Math.round(eased * score));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const R = 80;
  const CX = 110;
  const CY = 100;
  // نیم‌دایره از ۱۸۰° تا ۰° (سمت چپ به راست در RTL)
  const arcLen = Math.PI * R;
  const offset = arcLen * (1 - animated / 100);

  return (
    <div className="relative mx-auto w-[220px] select-none" dir="ltr">
      <svg viewBox="0 0 220 115" className="w-full overflow-visible">
        {/* ریل زمینه */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* نوار پیشرفت */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 120ms linear" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-4xl font-extrabold tabular-nums tracking-tight" dir="rtl">
          {toPersianDigits(String(animated))}
          <span className="text-lg text-muted-foreground">/۱۰۰</span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
 * دکمهٔ کپی نتیجه
 * ================================================================ */

function CopyResultButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = React.useCallback(async () => {
    const text = getText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [getText]);
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 ${
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
      aria-live="polite"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "کپی شد" : "کپی نتیجه"}
    </button>
  );
}

/* ================================================================
 * دکمهٔ گزارش PDF (چاپ) — v24
 * پنجرهٔ چاپ مستقل با استایل تمیز RTL؛ کاربر «ذخیره به‌صورت PDF»
 * را در دیالوگ چاپ مرورگر انتخاب می‌کند (بدون کتابخانهٔ سنگین).
 * ================================================================ */

function PrintReportButton({ buildReport }: { buildReport: () => string }) {
  const [failed, setFailed] = React.useState(false);
  const onPrint = React.useCallback(() => {
    const html = buildReport();
    const w = window.open("", "_blank", "width=920,height=720");
    if (!w) {
      // پاپ‌آپ مسدود شد — fallback: تختهٔ موقت + execCommand.print ممکن نیست؛ پیام
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2600);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    // کمی تأخیر برای رندر فونت/جدول‌ها سپس دیالوگ چاپ
    window.setTimeout(() => {
      try { w.print(); } catch { /* مرورگرهای خاص */ }
    }, 420);
  }, [buildReport]);

  return (
    <button
      type="button"
      onClick={onPrint}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 ${
        failed
          ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
      aria-label="دریافت گزارش PDF"
    >
      {failed ? <AlertTriangle className="h-3.5 w-3.5" /> : <FileDown className="h-3.5 w-3.5" />}
      {failed ? "پاپ‌آپ مسدود شد" : "گزارش PDF"}
    </button>
  );
}

/** ساخت HTML گزارش چاپی سنجش سلامت مالی — سند کامل RTL */
function buildFinancialHealthReportHtml(opts: {
  appName: string;
  score: number;
  gradeLabel: string;
  gradeColorHex: string;
  yesCount: number;
  partialCount: number;
  noCount: number;
  recs: { title: string; text: string }[];
  jalaliDate: string;
}): string {
  const o = opts;
  const recsHtml =
    o.recs.length === 0
      ? `<li style="padding:8px 0;color:#047857;">✓ در هر ۱۰ سنجه پاسخ کامل دادید — جای کار جدی ندارید؛ قدم بعدی: خودکارسازی همین نظم برای مقیاس‌پذیری.</li>`
      : o.recs
          .map(
            (r, i) =>
              `<li style="padding:9px 0;border-bottom:1px dashed #e5e7eb;"><strong style="color:#111827;">${i + 1}. ${r.title}</strong><div style="margin-top:4px;color:#4b5563;line-height:1.9;">${r.text}</div></li>`
          )
          .join("");
  const distRow = (label: string, count: number, color: string) =>
    `<td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:center;"><span style="color:${color};font-weight:700;">${count}</span><div style="font-size:11px;color:#6b7280;">${label}</div></td>`;

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>گزارش سنجش سلامت مالی — ${o.appName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Vazirmatn", "IRANSans", Tahoma, "Segoe UI", sans-serif; margin: 0; padding: 32px 28px; color: #1f2937; background: #fff; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #059669; padding-bottom: 14px; }
  .brand { font-size: 22px; font-weight: 800; color: #059669; }
  .date { font-size: 12px; color: #6b7280; }
  h1 { font-size: 20px; margin: 22px 0 4px; color: #111827; }
  .sub { font-size: 12px; color: #6b7280; margin: 0 0 18px; }
  .score-box { display: flex; align-items: center; gap: 18px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 20px; }
  .score-num { font-size: 42px; font-weight: 800; color: ${o.gradeColorHex}; line-height: 1; }
  .score-outof { font-size: 13px; color: #6b7280; }
  .grade { font-size: 16px; font-weight: 700; color: ${o.gradeColorHex}; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0 20px; font-size: 13px; }
  h2 { font-size: 15px; color: #111827; border-right: 4px solid #059669; padding-right: 10px; margin: 22px 0 8px; }
  ul { padding: 0 16px 0 0; margin: 0; list-style: none; font-size: 13px; }
  .foot { margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 11px; color: #6b7280; line-height: 1.9; }
  @media print { body { padding: 12px; } .noprint { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">${o.appName}</div>
    <div class="date">تاریخ گزارش: ${o.jalaliDate}</div>
  </div>
  <h1>گزارش سنجش سلامت مالی کسب‌وکار</h1>
  <p class="sub">سنجش ۱۰ سنجه‌ای استاندارد — تولیدشده توسط ابزار رایگان ${o.appName}</p>

  <div class="score-box">
    <div>
      <div class="score-num">${o.score}</div>
      <div class="score-outof">از ۱۰۰ امتیاز</div>
    </div>
    <div>
      <div class="grade">${o.gradeLabel}</div>
      <div style="font-size:12px;color:#4b5563;line-height:1.9;margin-top:4px;">توزیع پاسخ‌ها: بله ${o.yesCount} · تا حدی ${o.partialCount} · خیر ${o.noCount}</div>
    </div>
  </div>

  <table>
    <tr>
      ${distRow("بله (کامل)", o.yesCount, "#059669")}
      ${distRow("تا حدی", o.partialCount, "#d97706")}
      ${distRow("خیر", o.noCount, "#e11d48")}
    </tr>
  </table>

  <h2>نقشهٔ راه اصلاح — اولویت‌ها</h2>
  <ul>${recsHtml}</ul>

  <div class="foot">
    روش‌شناسی: امتیاز از ۱۰ سنجهٔ رایج سلامت مالی کسب‌وکار (جداسازی حساب، انطباق مودیان، نظم ثبت، نقدینگی، مغایرت‌گیری، موجودی، مالیات، گزارش، بودجه، متخصص) محاسبه شده است؛ پاسخ «بله» ۲ امتیاز، «تا حدی» ۱ امتیاز و «خیر» صفر.
    <br />این گزارش جایگزین مشاورهٔ مالی اختصاصی نیست و برای تحلیل دقیق، داده‌های واقعی خود را در تریال ${o.appName} بارگذاری کنید.
    <br />سنجش رایگان: همین ابزار در صفحهٔ سلامت مالی ${o.appName}
  </div>
</body>
</html>`;
}

/* ================================================================
 * کامپوننت اصلی
 * ================================================================ */

export interface FinancialHealthSectionProps {
  /** در حالت سکشن لندینگ: باز کردن pricing SPA */
  onOpenPricing?: () => void;
}

export function FinancialHealthSection({ onOpenPricing }: FinancialHealthSectionProps) {
  const [phase, setPhase] = React.useState<"intro" | "quiz" | "result">("intro");
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<number[]>(Array(QUESTIONS.length).fill(-1));
  const { branding } = useBranding();

  const answeredCount = answers.filter((a) => a >= 0).length;
  const score = answers.reduce((sum, a) => sum + (a >= 0 ? OPTION_SCORE[a] : 0), 0) * 5;
  const grade = gradeFor(score);
  const q = QUESTIONS[step];

  const pick = React.useCallback(
    (optionScore: number) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[step] = optionScore;
        return next;
      });
      // رفتن به پرسش بعدی (کمی تأخیر برای دیدن انتخاب)
      window.setTimeout(() => {
        if (step < QUESTIONS.length - 1) setStep((s) => s + 1);
        else setPhase("result");
      }, 260);
    },
    [step]
  );

  const reset = React.useCallback(() => {
    setAnswers(Array(QUESTIONS.length).fill(-1));
    setStep(0);
    setPhase("intro");
  }, []);

  // توصیه‌ها: پرسش‌هایی که پاسخ ضعیف گرفتند (خیر یا تا حدی)
  const recs = QUESTIONS.filter((qq, i) => answers[i] >= 0 && answers[i] <= 1);
  const yesCount = answers.filter((a) => a === 2).length;
  const partialCount = answers.filter((a) => a === 1).length;
  const noCount = answers.filter((a) => a === 0).length;

  const pricingHref = onOpenPricing ? undefined : "/pricing";
  const openPricing = onOpenPricing;

  return (
    <section
      id="financial-health"
      aria-labelledby="fh-title"
      className="relative overflow-hidden py-14 sm:py-20"
    >
      {/* پس‌زمینه: orbs + گرادیان */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 right-[10%] h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-[5%] h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ─── هدر سکشن ─── */}
        <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
          <Badge variant="secondary" className="mb-3 border border-primary/20 bg-primary/10 text-primary">
            <Activity className="h-3 w-3 ml-1" />
            ابزار رایگان — بدون ثبت‌نام
          </Badge>
          <h2 id="fh-title" className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            سلامت مالی کسب‌وکارتان را در ۲ دقیقه بسنجید
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            ۱۰ پرسش کوتاه از ۱۰ سنجهٔ استاندارد مالی — امتیاز ۰ تا ۱۰۰ بگیرید و نقشهٔ راه
            اصلاح اختصاصی خود را با توصیه‌های عملیاتی تحویل بگیرید.
          </p>
        </div>

        {/* ─── بدنهٔ ابزار ─── */}
        <Card className="relative mx-auto max-w-3xl overflow-hidden border-border/70 bg-card/90 shadow-xl shadow-black/5 backdrop-blur">
          {/* نوار پیشرفت بالای کارت */}
          {phase !== "intro" && (
            <div className="h-1 w-full bg-muted">
              <div
                className="h-full bg-gradient-to-l from-primary to-emerald-500 transition-all duration-300"
                style={{ width: `${((phase === "result" ? QUESTIONS.length : answeredCount) / QUESTIONS.length) * 100}%` }}
                role="progressbar"
                aria-valuenow={phase === "result" ? QUESTIONS.length : answeredCount}
                aria-valuemin={0}
                aria-valuemax={QUESTIONS.length}
                aria-label="پیشرفت سنجش"
              />
            </div>
          )}

          <CardContent className="p-6 sm:p-8">
            {/* ═══════════ حالت مقدمه ═══════════ */}
            {phase === "intro" && (
              <div className="text-center">
                <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/15 [animation-duration:2.4s]" />
                  <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-lg shadow-primary/30">
                    <Activity className="h-8 w-8" />
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground sm:text-xl">
                  سنجش ۱۰ سنجه‌ای سلامت مالی
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  از جداسازی حساب بانکی تا انضباط مالیاتی — همین پرسش‌هایی که بانک‌ها،
                  سرمایه‌گذارها و ممیزان مالیاتی از شما می‌پرسند.
                </p>
                <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-3 text-center">
                  {[
                    { n: "۱۰", t: "سنجهٔ استاندارد" },
                    { n: "~۲", t: "دقیقه زمان" },
                    { n: "۰", t: "تومان هزینه" },
                  ].map((s) => (
                    <div key={s.t} className="rounded-xl border border-border/60 bg-muted/40 p-3">
                      <div className="text-lg font-extrabold text-primary">{s.n}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{s.t}</div>
                    </div>
                  ))}
                </div>
                <Button
                  size="lg"
                  onClick={() => setPhase("quiz")}
                  className="mt-7 h-12 gap-2 rounded-xl px-8 text-base font-bold shadow-lg shadow-primary/25 transition-all duration-150 hover:shadow-xl active:scale-95"
                >
                  شروع سنجش
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* ═══════════ حالت پرسش‌ها ═══════════ */}
            {phase === "quiz" && q && (
              <div>
                {/* شمارهٔ پرسش */}
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    پرسش {toPersianDigits(String(step + 1))} از {toPersianDigits(String(QUESTIONS.length))}
                  </span>
                  <button
                    type="button"
                    onClick={() => (step > 0 ? setStep((s) => s - 1) : setPhase("intro"))}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowRight className="h-3 w-3" />
                    {step > 0 ? "قبلی" : "بازگشت"}
                  </button>
                </div>

                {/* پرسش */}
                <div key={q.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                      <q.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold leading-relaxed text-foreground sm:text-lg">
                        {q.title}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{q.hint}</p>
                    </div>
                  </div>

                  {/* گزینه‌ها */}
                  <div className="mt-6 grid grid-cols-3 gap-3" role="radiogroup" aria-label={q.title}>
                    {OPTIONS.map((o) => {
                      const selected = answers[step] === o.score;
                      const toneCls =
                        o.tone === "emerald"
                          ? selected
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 shadow-sm"
                            : "hover:border-emerald-400/50"
                          : o.tone === "amber"
                          ? selected
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 shadow-sm"
                            : "hover:border-amber-400/50"
                          : selected
                          ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40 shadow-sm"
                          : "hover:border-rose-400/50";
                      return (
                        <button
                          key={o.label}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => pick(o.score)}
                          className={`rounded-xl border-2 bg-card p-4 text-center transition-all duration-150 active:scale-95 ${toneCls}`}
                        >
                          <span className="text-sm font-bold text-foreground">{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* نقطه‌های پیشرفت */}
                <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden="true">
                  {QUESTIONS.map((qq, i) => (
                    <span
                      key={qq.id}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === step
                          ? "w-5 bg-primary"
                          : answers[i] >= 0
                          ? "w-1.5 bg-primary/40"
                          : "w-1.5 bg-border"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ═══════════ حالت نتیجه ═══════════ */}
            {phase === "result" && (
              <div className="animate-in fade-in duration-500">
                {/* گیج + نمره */}
                <div className="text-center">
                  <ScoreGauge score={score} color={grade.bar} />
                  <div className={`mt-2 text-xl font-extrabold ${grade.color}`}>{grade.label}</div>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                    {grade.desc}
                  </p>
                  {/* توزیع پاسخ‌ها */}
                  <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> بله: {toPersianDigits(String(yesCount))}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      تا حدی: {toPersianDigits(String(partialCount))}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                      خیر: {toPersianDigits(String(noCount))}
                    </span>
                  </div>
                </div>

                {/* توصیه‌ها */}
                <div className="mt-8">
                  <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    نقشهٔ راه اصلاح شما {recs.length > 0 && <span className="text-muted-foreground font-normal text-xs">({toPersianDigits(String(recs.length))} اولویت)</span>}
                  </h3>

                  {recs.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-emerald-300/40 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <CheckCircle2 className="ml-1 inline h-4 w-4" />
                      در هر ۱۰ سنجه پاسخ کامل دادید — جای کار جدی ندارید. قدم بعدی شما:
                      خودکارسازی همین نظم برای مقیاس‌پذیری، نه حفظ آن با دست.
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {recs.map((r) => (
                        <div
                          key={r.id}
                          className="group rounded-xl border border-border/70 bg-muted/30 p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-md"
                        >
                          <div className="flex items-center gap-2">
                            <r.icon className="h-4 w-4 shrink-0 text-primary" />
                            <h4 className="text-sm font-bold text-foreground">{r.rec.title}</h4>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{r.rec.text}</p>
                          <a
                            href={r.rec.href}
                            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80 group-hover:gap-2"
                          >
                            {r.rec.linkLabel}
                            <ArrowLeft className="h-3 w-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* CTA + کنترل‌ها */}
                <div className="mt-8 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 to-primary/5 p-5 text-center sm:p-6">
                  <h4 className="flex items-center justify-center gap-2 text-base font-bold text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    از امتیاز تا عمل: هوش همین مسیر را خودکار می‌کند
                  </h4>
                  <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    ثبت خودکار، مغایرت‌گیری بانکی، تقویم مالیاتی و گزارش زنده — ۳ روز رایگان
                    با تمام امکانات، بدون کارت بانکی.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    {pricingHref ? (
                      <Button
                        asChild
                        className="gap-2 rounded-xl px-6 font-bold shadow-lg shadow-primary/25 transition-all duration-150 hover:shadow-xl"
                      >
                        <a href={pricingHref}>شروع ۳ روز رایگان</a>
                      </Button>
                    ) : (
                      <Button
                        onClick={openPricing}
                        className="gap-2 rounded-xl px-6 font-bold shadow-lg shadow-primary/25 transition-all duration-150 hover:shadow-xl active:scale-95"
                      >
                        شروع ۳ روز رایگان
                      </Button>
                    )}
                    <CopyResultButton
                      getText={() =>
                        `سنجش سلامت مالی کسب‌وکار — هوش\nامتیاز: ${score} از ۱۰۰ (${grade.label})\nبله: ${yesCount} · تا حدی: ${partialCount} · خیر: ${noCount}\nاولویت‌های اصلاح: ${recs.map((r) => r.rec.title).join("، ") || "—"}\nسنجش رایگان: hoosh`
                      }
                    />
                    <PrintReportButton
                      buildReport={() =>
                        buildFinancialHealthReportHtml({
                          appName: branding.appName || "هوش",
                          score,
                          gradeLabel: grade.label,
                          gradeColorHex:
                            score >= 75 ? "#059669" : score >= 50 ? "#0d9488" : score >= 30 ? "#d97706" : "#e11d48",
                          yesCount,
                          partialCount,
                          noCount,
                          recs: recs.map((r) => ({ title: r.rec.title, text: r.rec.text })),
                          jalaliDate: toJalali(new Date()),
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      سنجش مجدد
                    </button>
                  </div>
                </div>

                {/* یادداشت روش‌شناسی */}
                <p className="mt-4 flex items-start gap-1.5 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  این سنجش بر پایهٔ ۱۰ سنجهٔ رایج سلامت مالی کسب‌وکار (جداسازی حساب، انطباق
                  مودیان، نظم ثبت، نقدینگی، مغایرت‌گیری، موجودی، مالیات، گزارش، بودجه، متخصص)
                  است و جایگزین مشاورهٔ اختصاصی نیست؛ برای تحلیل دقیق، داده‌های واقعی خود را در
                  تریال هوش بارگذاری کنید.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── نوار اعتماد پایین ─── */}
        <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
          {[
            { icon: ClipboardCheck, t: "بر پایهٔ استانداردهای حسابداری ایران" },
            { icon: Truck, t: "بدون ارسال داده به سرور" },
            { icon: CalendarCheck, t: "هماهنگ با قوانین ۱۴۰۴" },
          ].map((b) => (
            <span key={b.t} className="inline-flex items-center gap-1.5">
              <b.icon className="h-3.5 w-3.5 text-primary/70" />
              {b.t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
