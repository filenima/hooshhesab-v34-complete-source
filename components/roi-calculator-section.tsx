"use client";

/**
 * RoiCalculatorSection — ماشین‌حساب بازگشت سرمایهٔ نرم‌افزار حسابداری (v24)
 * ----------------------------------------------------------------------------
 * ابزار رایگان لیدمگنت سئو («محاسبه بازگشت سرمایه نرم‌افزار حسابداری»،
 * «هزینه حسابداری دستی» و...) — ورودی‌های وضعیت فعلی کسب‌وکار را می‌گیرد و
 * صرفه‌جویی سالانه، ROI و دورهٔ بازگشت سرمایه را با فرض‌های شفاف محاسبه می‌کند.
 *
 * فرض‌های محاسبه (قابل مشاهده در راهنما — شفافیت روش):
 *  - صرفه‌جویی زمانی خودکارسازی: ۶۵٪ (ثبت از فاکتور، مغایرت‌گیری بانکی، گزارش)
 *  - کاهش خطا: ۸۰٪ (اعتبارسنجی + حذف ثبت دستی)
 *  - کاهش جریمهٔ مالیاتی/مودیانی: ۹۰٪ (ارسال خودکار + تقویم سررسید)
 *  - هر اشتباه به‌طور میانگین ۴۵ دقیقه زمان اصلاح می‌برد
 *
 * قیمت پلن‌ها با lib/plans.ts هماهنگ است (سالانه، تومان).
 * نکته فنی: هم در LandingView (SPA) و هم مسیر سئویی /roi-calculator؛
 * props اختیاری است تا در هر دو کار کند.
 */

import * as React from "react";
import {
  TrendingUp,
  Timer,
  Coins,
  PiggyBank,
  Scale,
  Info,
  Copy,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  FileDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toPersianDigits, formatNumber, formatCompactToman, toJalali } from "@/lib/persian";

/* ------------------------------------------------------------------ */
/* فرض‌های محاسبه — شفاف و قابل توضیح                                  */
/* ------------------------------------------------------------------ */

const AUTOMATION_SAVING = 0.65; // صرفه‌جویی زمانی خودکارسازی
const ERROR_REDUCTION = 0.8; // کاهش نرخ خطا
const PENALTY_REDUCTION = 0.9; // کاهش جریمه‌ها
const MINUTES_PER_ERROR = 45; // میانگین زمان اصلاح هر اشتباه
const WEEKS_PER_MONTH = 4.33;

/** پلن‌ها — هماهنگ با lib/plans.ts (سالانه، تومان) */
const PLAN_OPTIONS = [
  { id: "base", label: "پایه", price: 9_750_000, hint: "کسب‌وکار کوچک" },
  { id: "pro", label: "حرفه‌ای", price: 13_900_000, hint: "پیشنهاد ما" },
  { id: "org", label: "سازمانی", price: 34_900_000, hint: "تیم و چندشماره" },
] as const;

/* ------------------------------------------------------------------ */
/* اسلایدر فارسی — RTL، بج مقدار زنده، برچسب توضیحی                   */
/* ------------------------------------------------------------------ */

interface SliderProps {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  icon: React.ComponentType<{ className?: string }>;
}

function PersianSlider({ label, hint, min, max, step, value, onChange, format, icon: Icon }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon className="h-3.5 w-3.5 text-primary/80" />
          {label}
          {hint ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`راهنمای ${label}`}
                  className="text-muted-foreground/70 transition-colors hover:text-primary"
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-56 text-right text-xs leading-relaxed">
                {hint}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </label>
        <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        dir="rtl"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none
          [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary
          [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background
          [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-md"
        style={{
          background: `linear-gradient(to left, hsl(var(--primary)) 0%, hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}%, hsl(var(--muted)) 100%)`,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* منطق محاسبه                                                          */
/* ------------------------------------------------------------------ */

interface RoiResult {
  monthlyLaborSaving: number;
  monthlyErrorSaving: number;
  annualPenaltySaving: number;
  annualBenefit: number;
  annualCost: number;
  netBenefit: number;
  roiPercent: number;
  paybackMonths: number;
  hoursFreedPerMonth: number;
}

function computeRoi(input: {
  invoicesPerMonth: number;
  hoursPerWeek: number;
  hourlyCost: number;
  errorsPerMonth: number;
  annualPenalties: number;
  planPrice: number;
}): RoiResult {
  const monthlyHours = input.hoursPerWeek * WEEKS_PER_MONTH;
  const hoursFreedPerMonth = monthlyHours * AUTOMATION_SAVING;
  const monthlyLaborSaving = hoursFreedPerMonth * input.hourlyCost;
  const monthlyErrorSaving =
    input.errorsPerMonth * (MINUTES_PER_ERROR / 60) * input.hourlyCost * ERROR_REDUCTION;
  const annualPenaltySaving = input.annualPenalties * PENALTY_REDUCTION;

  const annualBenefit =
    (monthlyLaborSaving + monthlyErrorSaving) * 12 + annualPenaltySaving;
  const annualCost = input.planPrice;
  const netBenefit = annualBenefit - annualCost;
  const roiPercent = annualCost > 0 ? (netBenefit / annualCost) * 100 : 0;
  const monthlyBenefit = annualBenefit / 12;
  const paybackMonths = monthlyBenefit > 0 ? annualCost / monthlyBenefit : Infinity;

  return {
    monthlyLaborSaving,
    monthlyErrorSaving,
    annualPenaltySaving,
    annualBenefit,
    annualCost,
    netBenefit,
    roiPercent,
    paybackMonths,
    hoursFreedPerMonth,
  };
}

/* ------------------------------------------------------------------ */
/* شمارندهٔ انیمیشنی                                                    */
/* ------------------------------------------------------------------ */

function AnimatedNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = React.useState(value);
  const prevRef = React.useRef(value);

  React.useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // cubic ease-out
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{Math.round(display)}</span>;
}

/* ------------------------------------------------------------------ */
/* کامپوننت اصلی                                                        */
/* ------------------------------------------------------------------ */

interface RoiCalculatorSectionProps {
  onOpenPricing?: () => void;
}

export function RoiCalculatorSection({ onOpenPricing }: RoiCalculatorSectionProps) {
  // ورودی‌ها
  const [invoicesPerMonth, setInvoices] = React.useState(150);
  const [hoursPerWeek, setHours] = React.useState(12);
  const [hourlyCost, setHourlyCost] = React.useState(120_000);
  const [errorsPerMonth, setErrors] = React.useState(8);
  const [annualPenalties, setPenalties] = React.useState(3_000_000);
  const [planId, setPlanId] = React.useState<(typeof PLAN_OPTIONS)[number]["id"]>("pro");

  const plan = PLAN_OPTIONS.find((p) => p.id === planId) ?? PLAN_OPTIONS[1];
  const roi = React.useMemo(
    () =>
      computeRoi({
        invoicesPerMonth,
        hoursPerWeek,
        hourlyCost,
        errorsPerMonth,
        annualPenalties,
        planPrice: plan.price,
      }),
    [invoicesPerMonth, hoursPerWeek, hourlyCost, errorsPerMonth, annualPenalties, plan.price]
  );

  const [copied, setCopied] = React.useState(false);
  const onCopy = React.useCallback(() => {
    const text = [
"نتیجهٔ ماشین‌حساب بازگشت سرمایه — هوش",
      `پلن: ${plan.label} (${formatCompactToman(plan.price)} در سال)`,
      `صرفه‌جویی سالانه: ${formatCompactToman(roi.annualBenefit)}`,
      `ROI: ${toPersianDigits(Math.max(0, Math.round(roi.roiPercent)))}٪`,
      `دورهٔ بازگشت: ${toPersianDigits(roi.paybackMonths.toFixed(1))} ماه`,
      `ساعت آزادشده در ماه: ${toPersianDigits(Math.round(roi.hoursFreedPerMonth))} ساعت`,
    ].join("\n");
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          done();
        } catch { /* ignore */ }
      });
    } else {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch { /* ignore */ }
    }
  }, [plan, roi]);

  const reset = React.useCallback(() => {
    setInvoices(150);
    setHours(12);
    setHourlyCost(120_000);
    setErrors(8);
    setPenalties(3_000_000);
    setPlanId("pro");
  }, []);

  /* ---------- v25: خروجی PDF نتیجهٔ ROI (گزارش چاپی) ---------- */
  const [pdfBlocked, setPdfBlocked] = React.useState(false);
  const onPdf = React.useCallback(() => {
    const toneHex =
      roi.roiPercent >= 300 ? "#059669" : roi.roiPercent >= 100 ? "#0d9488" : "#d97706";
    const row = (label: string, value: string) =>
      `<tr><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;color:#4b5563;">${label}</td><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;font-weight:700;color:#111827;text-align:left;direction:ltr;">${value}</td></tr>`;
    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8" /><title>گزارش بازگشت سرمایه — هوش</title>
<style>
  body { font-family:"Vazirmatn","IRANSans",Tahoma,sans-serif; margin:0; padding:32px 28px; color:#1f2937; background:#fff; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #059669; padding-bottom:14px; }
  .brand { font-size:22px; font-weight:800; color:#059669; }
  .date { font-size:12px; color:#6b7280; }
  h1 { font-size:20px; margin:22px 0 4px; color:#111827; }
  .sub { font-size:12px; color:#6b7280; margin:0 0 18px; }
  .hero { display:flex; align-items:center; gap:20px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; padding:18px 22px; margin-bottom:18px; }
  .roi-num { font-size:44px; font-weight:800; color:${toneHex}; line-height:1; }
  table { width:100%; border-collapse:collapse; margin:12px 0 20px; }
  .foot { margin-top:26px; border-top:1px solid #e5e7eb; padding-top:12px; font-size:11px; color:#6b7280; line-height:1.9; }
  @media print { body { padding:12px; } }
</style></head>
<body>
  <div class="head"><div class="brand">هوش</div><div class="date">تاریخ گزارش: ${toJalali(new Date())}</div></div>
  <h1>گزارش بازگشت سرمایهٔ نرم‌افزار حسابداری</h1>
  <p class="sub">تولیدشده توسط ماشین‌حساب رایگان هوش — فرض‌های شفاف در پاورقی</p>
  <div class="hero">
    <div><div class="roi-num">${toPersianDigits(Math.max(0, Math.round(roi.roiPercent)))}٪</div><div style="font-size:12px;color:#6b7280;">بازگشت سرمایهٔ سالانه</div></div>
    <div style="font-size:13px;color:#374151;line-height:2;">دورهٔ بازگشت: <strong>${toPersianDigits(roi.paybackMonths.toFixed(1))} ماه</strong> · پلن: <strong>${plan.label}</strong> (${toPersianDigits(formatNumber(plan.price))} تومان در سال)</div>
  </div>
  <table>
    ${row("صرفه‌جویی سالانهٔ کل", `${toPersianDigits(formatNumber(Math.round(roi.annualBenefit)))} تومان`)}
    ${row("↳ زمان نیروی انسانی (سالانه)", `${toPersianDigits(formatNumber(Math.round(roi.monthlyLaborSaving * 12)))} تومان`)}
    ${row("↳ کاهش اشتباه و بازکاری (سالانه)", `${toPersianDigits(formatNumber(Math.round(roi.monthlyErrorSaving * 12)))} تومان`)}
    ${row("↳ پیشگیری از جریمه", `${toPersianDigits(formatNumber(Math.round(roi.annualPenaltySaving)))} تومان`)}
    ${row("سود خالص سالانه (بعد از هزینهٔ پلن)", `${toPersianDigits(formatNumber(Math.round(roi.netBenefit)))} تومان`)}
    ${row("ساعت آزادشده در ماه", `${toPersianDigits(Math.round(roi.hoursFreedPerMonth))} ساعت`)}
    ${row("ورودی: اسناد در ماه", `${toPersianDigits(formatNumber(invoicesPerMonth))} سند`)}
    ${row("ورودی: ساعت حسابداری در هفته", `${toPersianDigits(hoursPerWeek)} ساعت`)}
    ${row("ورودی: هزینهٔ ساعتی نیرو", `${toPersianDigits(formatNumber(hourlyCost))} تومان`)}
    ${row("ورودی: اشتباه در ماه", `${toPersianDigits(errorsPerMonth)} مورد`)}
    ${row("ورودی: جریمهٔ سالانهٔ ورودی", `${toPersianDigits(formatNumber(annualPenalties))} تومان`)}
  </table>
  <div class="foot">
    فرض‌های محاسبه (شفافیت روش): صرفه‌جویی زمانی خودکارسازی ۶۵٪ · کاهش خطا ۸۰٪ · کاهش جریمه ۹۰٪ · هر اشتباه ۴۵ دقیقه اصلاح.
    <br />این گزارش تخمینی آموزشی است و جایگزین مشاورهٔ مالی نیست؛ محاسبه در مرورگر شما انجام شده و هیچ داده‌ای ارسال نشده است.
  </div>
</body></html>`;
    const w = window.open("", "_blank", "width=920,height=760");
    if (!w) {
      setPdfBlocked(true);
      window.setTimeout(() => setPdfBlocked(false), 2600);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    window.setTimeout(() => {
      try { w.print(); } catch { /* ignore */ }
    }, 420);
  }, [roi, plan, invoicesPerMonth, hoursPerWeek, hourlyCost, errorsPerMonth, annualPenalties]);

  // توزیع منافع برای نمودار میله‌ای
  const laborShare =
    roi.annualBenefit > 0
      ? (roi.monthlyLaborSaving * 12) / roi.annualBenefit
      : 0;
  const errorShare =
    roi.annualBenefit > 0 ? (roi.monthlyErrorSaving * 12) / roi.annualBenefit : 0;
  const penaltyShare = roi.annualBenefit > 0 ? roi.annualPenaltySaving / roi.annualBenefit : 0;

  const roiTone =
    roi.roiPercent >= 300
      ? { text: "text-emerald-600 dark:text-emerald-400", label: "بازگشت سرمایهٔ عالی", cls: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30" }
      : roi.roiPercent >= 100
        ? { text: "text-primary", label: "بازگشت سرمایهٔ خوب", cls: "border-primary/30 from-primary/15 to-primary/5" }
        : { text: "text-amber-600 dark:text-amber-400", label: "بازگشت سرمایهٔ متوسط", cls: "border-amber-500/30 from-amber-500/15 to-amber-500/5" };

  const paybackText = Number.isFinite(roi.paybackMonths)
    ? `${toPersianDigits(roi.paybackMonths.toFixed(1))} ماه`
    : "—";

  return (
    <TooltipProvider delayDuration={150}>
      <section
        id="roi"
        aria-label="ماشین‌حساب بازگشت سرمایه"
        className="relative overflow-hidden border-y border-border bg-muted/30 py-12 sm:py-16"
      >
        {/* پس‌زمینهٔ تزئینی — orbs */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute -top-24 right-[10%] h-56 w-56 rounded-full bg-primary/[0.05] blur-3xl" />
          <div className="absolute bottom-0 left-[5%] h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* هدر سکشن */}
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <Badge
              variant="secondary"
              className="mb-3 border border-primary/20 bg-primary/10 text-primary"
            >
              <TrendingUp className="h-3 w-3" />
              ابزار رایگان — تخمین دقیق با فرض‌های شفاف
            </Badge>
            <h2 className="text-xl font-extrabold leading-tight text-foreground sm:text-3xl">
              حسابداری دستی سالانه چقدر از شما هزینه می‌کند؟
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              وضعیت فعلی‌تان را تنظیم کنید تا <strong className="text-foreground">صرفه‌جویی سالانه، بازگشت سرمایه (ROI)</strong> و
              دورهٔ بازگشت هزینه با قیمت واقعی پلن‌های هوش محاسبه شود — بدون ثبت‌نام، محاسبه در مرورگر شما.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* ------------- فرم ورودی ------------- */}
            <Card className="lg:col-span-3 border-border/70 bg-card/80 shadow-sm backdrop-blur-sm">
              <CardContent className="space-y-6 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Scale className="h-4 w-4 text-primary" />
                    وضعیت فعلی کسب‌وکار شما
                  </h3>
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary active:scale-95"
                  >
                    <RotateCcw className="h-3 w-3" />
                    بازنشانی
                  </button>
                </div>

                <PersianSlider
                  label="فاکتورها و اسناد در ماه"
                  hint="میانگین تعداد فاکتور فروش/خرید و اسناد حسابداری که هر ماه ثبت می‌کنید."
                  icon={Coins}
                  min={20}
                  max={2000}
                  step={10}
                  value={invoicesPerMonth}
                  onChange={setInvoices}
                  format={(v) => `${toPersianDigits(formatNumber(v))} سند`}
                />
                <PersianSlider
                  label="ساعت حسابداری دستی در هفته"
                  hint="مجموع ساعتی که شما یا همکارتان صرف ثبت دستی، مغایرت‌گیری و گزارش‌سازی می‌کنید."
                  icon={Timer}
                  min={2}
                  max={60}
                  step={1}
                  value={hoursPerWeek}
                  onChange={setHours}
                  format={(v) => `${toPersianDigits(v)} ساعت`}
                />
                <PersianSlider
                  label="هزینهٔ ساعتی نیرو (تومان)"
                  hint="حقوق و مزایای ساعتی نیروی حسابداری — برای تخمین واقع‌بینانه از نرخ تمام‌شده استفاده کنید."
                  icon={PiggyBank}
                  min={50_000}
                  max={500_000}
                  step={10_000}
                  value={hourlyCost}
                  onChange={setHourlyCost}
                  format={(v) => `${toPersianDigits(formatNumber(v))} ت`}
                />
                <PersianSlider
                  label="اشتباهات و بازکاری در ماه"
                  hint="مواردی که نیاز به اصلاح، جابه‌جایی سند یا پیگیری دارند (مغایرت، کد اشتباه، فراموشی)."
                  icon={Scale}
                  min={0}
                  max={50}
                  step={1}
                  value={errorsPerMonth}
                  onChange={setErrors}
                  format={(v) => `${toPersianDigits(v)} مورد`}
                />
                <PersianSlider
                  label="جریمه‌ها و بخشودگی‌نشده‌ها در سال"
                  hint="جریمه‌های ماده ۱۶۹ مودیان، عدم ارسال، تأخیر اظهارنامه و ریزش‌های مشابه (تومان)."
                  icon={Sparkles}
                  min={0}
                  max={50_000_000}
                  step={500_000}
                  value={annualPenalties}
                  onChange={setPenalties}
                  format={(v) => formatCompactToman(v)}
                />

                {/* انتخاب پلن */}
                <div className="space-y-2">
                  <span className="text-sm font-medium text-foreground">پلن هوش برای مقایسه</span>
                  <div
                    role="radiogroup"
                    aria-label="انتخاب پلن"
                    className="grid grid-cols-3 gap-2"
                  >
                    {PLAN_OPTIONS.map((p) => {
                      const active = p.id === planId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setPlanId(p.id)}
                          className={`rounded-xl border p-3 text-center transition-all duration-150 active:scale-[0.98] ${
                            active
                              ? "border-primary/50 bg-primary/10 shadow-sm"
                              : "border-border bg-muted/30 hover:border-primary/25"
                          }`}
                        >
                          <span className={`block text-sm font-bold ${active ? "text-primary" : "text-foreground"}`}>
                            {p.label}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                            {p.hint}
                          </span>
                          <span className="mt-1 block text-[10px] font-medium tabular-nums text-muted-foreground/80">
                            {formatCompactToman(p.price)}/سال
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* فرض‌های شفاف */}
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">فرض‌های محاسبه (شفافیت روش):</strong>{" "}
                  صرفه‌جویی زمانی خودکارسازی {toPersianDigits(65)}٪ · کاهش خطا {toPersianDigits(80)}٪ ·
                  کاهش جریمه با ارسال خودکار مودیان {toPersianDigits(90)}٪ · هر اشتباه{" "}
                  {toPersianDigits(45)} دقیقه اصلاح. این تخمین آموزشی است و جایگزین مشاورهٔ مالی نیست.
                </div>
              </CardContent>
            </Card>

            {/* ------------- نتیجه ------------- */}
            <div className="space-y-4 lg:col-span-2">
              {/* کارت ROI */}
              <Card
                className={`relative overflow-hidden border bg-gradient-to-b ${roiTone.cls} shadow-md backdrop-blur-sm`}
              >
                <CardContent className="p-5 text-center sm:p-6">
                  <span className="text-xs font-medium text-muted-foreground">
                    بازگشت سرمایهٔ سالانه (ROI)
                  </span>
                  {/* v24 — عدد بزرگ با گرادیان tone‌دار (پیشنهاد VLM: برجسته‌تر) */}
                  <div
                    className={`mt-2 inline-block bg-gradient-to-l bg-clip-text text-5xl font-black leading-none text-transparent sm:text-6xl ${
                      roi.roiPercent >= 300
                        ? "from-emerald-500 to-emerald-400"
                        : roi.roiPercent >= 100
                          ? "from-primary to-primary/70"
                          : "from-amber-500 to-amber-400"
                    }`}
                  >
                    <AnimatedNumber value={Math.max(0, Math.round(roi.roiPercent))} />
                    <span className="text-3xl sm:text-4xl">٪</span>
                  </div>
                  <Badge variant="outline" className="mt-3 border-current/30 text-[11px]">
                    {roiTone.label}
                  </Badge>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    با پلن <strong className="text-foreground">{plan.label}</strong> ({formatCompactToman(plan.price)} در سال)
                  </p>
                </CardContent>
              </Card>

              {/* کارت‌های عددی */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-border/70 bg-card/80 shadow-sm backdrop-blur-sm">
                  <CardContent className="p-4">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <PiggyBank className="h-3 w-3 text-primary/80" />
                      صرفه‌جویی سالانه
                    </span>
                    <span className="mt-1.5 block text-lg font-extrabold tabular-nums text-foreground sm:text-xl">
                      {formatCompactToman(roi.annualBenefit)}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      معادل {formatCompactToman(roi.annualBenefit / 12)} در ماه
                    </span>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/80 shadow-sm backdrop-blur-sm">
                  <CardContent className="p-4">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Timer className="h-3 w-3 text-primary/80" />
                      دورهٔ بازگشت
                    </span>
                    <span className="mt-1.5 block text-lg font-extrabold tabular-nums text-foreground sm:text-xl">
                      {paybackText}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {toPersianDigits(Math.round(roi.hoursFreedPerMonth))} ساعت آزاد/ماه
                    </span>
                  </CardContent>
                </Card>
              </div>

              {/* توزیع منافع */}
              <Card className="border-border/70 bg-card/80 shadow-sm backdrop-blur-sm">
                <CardContent className="p-4 sm:p-5">
                  <h4 className="text-xs font-bold text-foreground">منشأ صرفه‌جویی سالانه</h4>
                  <div className="mt-3 space-y-2.5">
                    {[
                      { label: "زمان نیروی انسانی", share: laborShare, amount: roi.monthlyLaborSaving * 12, tone: "bg-primary" },
                      { label: "کاهش اشتباه و بازکاری", share: errorShare, amount: roi.monthlyErrorSaving * 12, tone: "bg-emerald-500" },
                      { label: "پیشگیری از جریمه", share: penaltyShare, amount: roi.annualPenaltySaving, tone: "bg-amber-500" },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {formatCompactToman(row.amount)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${row.label}: ${Math.round(row.share * 100)}٪`}>
                          <div
                            className={`h-full rounded-full ${row.tone} transition-[width] duration-500 ease-out`}
                            style={{ width: `${Math.max(2, row.share * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-dashed border-border pt-3 text-xs">
                    <span className="text-muted-foreground">سود خالص سالانه (بعد از هزینهٔ پلن)</span>
                    <span className={`font-extrabold tabular-nums ${roi.netBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {formatCompactToman(roi.netBenefit)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* اکشن‌ها */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="h-11 flex-1 gap-1.5 shadow-md transition-all active:scale-[0.98]"
                  onClick={onOpenPricing}
                >
                  دیدن پلن‌ها و شروع تریال ۳ روزه
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={onCopy}
                  className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-all active:scale-95 ${
                    copied
                      ? "border-emerald-400/60 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "کپی شد!" : "کپی نتیجه"}
                </button>
                {/* v25 — خروجی PDF گزارش چاپی */}
                <button
                  type="button"
                  onClick={onPdf}
                  className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-all active:scale-95 ${
                    pdfBlocked
                      ? "border-rose-400/60 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                      : "border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                  }`}
                  aria-label="دریافت گزارش PDF"
                >
                  {pdfBlocked ? <AlertTriangle className="h-3.5 w-3.5" /> : <FileDown className="h-3.5 w-3.5" />}
                  {pdfBlocked ? "پاپ‌آپ مسدود شد" : "گزارش PDF"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
