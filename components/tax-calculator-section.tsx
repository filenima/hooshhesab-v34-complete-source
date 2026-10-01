"use client";

/**
 * TaxCalculatorSection — ماشین‌حساب‌های مالیاتی تعاملی ایران (v20)
 * ----------------------------------------------------------------------------
 * سه ابزار رایگان + تقویم مالیاتی زنده برای جذب ترافیک ارگانیک سئو
 * («محاسبه مالیات حقوق ۱۴۰۴»، «محاسبه مالیات ارزش افزوده» و...) و نمایش
 * تخصص محصول. اعداد با محتوای بلاگ‌های تخصصی سایت هماهنگ است:
 *  - معافیت حقوق ماهانه ۱۴۰۴: ۲۰٬۰۰۰٬۰۰۰ تومان
 *  - پله‌های پلکانی: ۱۰٪/۱۵٪/۲۰٪/۲۵٪/۳۰٪
 *  - بیمه: ۷٪ سهم کارمند / ۲۳٪ سهم کارفرما
 *  - VAT: نرخ عمومی ۱۰٪، جریمه تأخیر پرداخت ۲٫۵٪ به‌ازای هر ماه
 *
 * نکته فنی: کامپوننت هم در LandingView (SPA) استفاده می‌شود و هم در
 * مسیر سئویی /calculators — props اختیاری است تا در هر دو کار کند.
 */

import * as React from "react";
import {
  Calculator,
  Wallet,
  Receipt,
  TrendingUp,
  CalendarDays,
  RotateCcw,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Percent,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  toPersianDigits,
  toJalali,
  formatNumber,
  formatCompactToman,
  gregorianToJalali,
  jalaliToGregorian,
} from "@/lib/persian";

/* ------------------------------------------------------------------ */
/* دکمهٔ کپی نتیجه — برای اشتراک‌گذاری سریع حسابداران/کارفرمایان */
/* ------------------------------------------------------------------ */

function CopyResultButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = React.useCallback(async () => {
    const text = getText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback برای مرورگرهای بدون clipboard API در http
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
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all duration-150 active:scale-95 ${
        copied
          ? "border-emerald-400/60 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
          : "border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
      }`}
      aria-label={copied ? "کپی شد" : "کپی نتیجهٔ محاسبه"}
    >
      {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "کپی شد!" : "کپی نتیجه"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* منطق مالیات حقوق ۱۴۰۴ — پلکانی                                     */
/* ------------------------------------------------------------------ */

const PAYROLL_EXEMPTION = 20_000_000; // معافیت ماهانه ۱۴۰۴ (تومان)
const PAYROLL_BRACKETS: { upto: number; rate: number }[] = [
  { upto: 60_000_000, rate: 0.1 },
  { upto: 140_000_000, rate: 0.15 },
  { upto: 200_000_000, rate: 0.2 },
  { upto: 300_000_000, rate: 0.25 },
  { upto: Infinity, rate: 0.3 },
];
const EMPLOYEE_INSURANCE = 0.07;
const EMPLOYER_INSURANCE = 0.23;

interface PayrollRow {
  label: string;
  from: number;
  to: number | null;
  rate: number;
  tax: number;
}

function calcPayroll(gross: number) {
  // بیمه سهم کارمند روی حقوق مشمول (قبل از معافیت مالیاتی)
  const insurance = Math.round(gross * EMPLOYEE_INSURANCE);
  // درآمد مشمول مالیات: حقوق بعد از کسر بیمه
  const taxableBase = Math.max(0, gross - insurance);
  const exempt = Math.min(PAYROLL_EXEMPTION, taxableBase);
  const taxable = Math.max(0, taxableBase - exempt);

  const rows: PayrollRow[] = [];
  let remaining = taxable;
  let lower = PAYROLL_EXEMPTION;
  let totalTax = 0;
  for (const b of PAYROLL_BRACKETS) {
    if (remaining <= 0) break;
    const span = Math.min(remaining, b.upto - lower);
    if (span > 0) {
      const tax = Math.round(span * b.rate);
      totalTax += tax;
      rows.push({
        label: `پلهٔ ${toPersianDigits(rows.length + 1)}`,
        from: lower,
        to: Math.min(b.upto, lower + span),
        rate: b.rate,
        tax,
      });
      remaining -= span;
    }
    lower = b.upto;
  }

  const net = gross - insurance - totalTax;
  const employerCost = Math.round(gross * (1 + EMPLOYER_INSURANCE));
  return { gross, insurance, exempt, taxable, totalTax, net, employerCost, rows };
}

/* ------------------------------------------------------------------ */
/* منطق ارزش افزوده                                                    */
/* ------------------------------------------------------------------ */

const VAT_RATE = 0.1;
const VAT_LATE_MONTHLY = 0.025;

function calcVat(sales: number, purchases: number) {
  const output = Math.round(sales * VAT_RATE);
  const input = Math.round(purchases * VAT_RATE);
  const payable = Math.max(0, output - input);
  const credit = Math.max(0, input - output); // اعتبار قابل انتقال
  return { sales, purchases, output, input, payable, credit };
}

/* ------------------------------------------------------------------ */
/* منطق مالیات عملکرد                                                  */
/* ------------------------------------------------------------------ */

function calcBusinessTax(profit: number, kind: "service" | "other") {
  // اشخاص حقیقی: خدمات ۱۵٪ — سایر فعالیت‌ها ۲۵٪ (ساده‌شده برای ابزار عمومی)
  const rate = kind === "service" ? 0.15 : 0.25;
  const tax = Math.round(profit * rate);
  return { profit, rate, tax, net: profit - tax };
}

/* ------------------------------------------------------------------ */
/* ورودی مبلغ با جداکننده فارسی                                        */
/* ------------------------------------------------------------------ */

function AmountInput({
  value,
  onChange,
  label,
  hint,
  icon,
  min = 0,
  max = 100_000_000_000,
  step = 1_000_000,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = React.useState("");
  const display = text || (value ? formatNumber(value) : "");

  const handle = (raw: string) => {
    // ارقام فارسی/عربی → انگلیسی، حذف جداکننده‌ها
    const en = raw
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[^\d]/g, "");
    setText(en ? formatNumber(Number(en)) : "");
    const n = en ? Math.min(max, Number(en)) : 0;
    onChange(Math.max(min, n));
  };

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <span className="text-primary">{icon}</span>
        {label}
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`راهنمای ${label}`} className="text-muted-foreground/70 hover:text-primary transition-colors">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-right leading-relaxed">
              {hint}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </label>
      <div className="relative">
        <Input
          inputMode="numeric"
          dir="ltr"
          value={display}
          onChange={(e) => handle(e.target.value)}
          placeholder={formatNumber(min || 30_000_000)}
          className="h-12 pl-20 text-left font-semibold tabular-nums text-base"
          aria-label={label}
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          تومان
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>گام افزایش: {formatCompactToman(step)}</span>
        <span className="flex gap-1">
          {[0.5, 1, 5].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange(Math.min(max, value + Math.round(m * 1_000_000)))}
              className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 hover:border-primary/40 hover:text-primary transition-colors"
            >
              +{toPersianDigits(m)}م
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ردیف نتیجه با شمارش متحرک                                           */
/* ------------------------------------------------------------------ */

function AnimatedAmount({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = React.useState(value);
  const prev = React.useRef(value);
  React.useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 450;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{formatCompactToman(display)}</span>;
}

function ResultRow({
  label,
  value,
  tone = "default",
  strong,
  tooltip,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "primary";
  strong?: boolean;
  tooltip?: string;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-rose-600 dark:text-rose-400",
    primary: "text-primary",
  };
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`راهنمای ${label}`} className="text-muted-foreground/60 hover:text-primary transition-colors">
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-right leading-relaxed">{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${strong ? "text-base" : ""} ${tones[tone]}`}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* تقویم مالیاتی — شمارش معکوس زنده                                    */
/* ------------------------------------------------------------------ */

interface TaxDeadline {
  title: string;
  desc: string;
  icon: React.ElementType;
  /** محاسبهٔ تاریخ سررسید بعدی (میلادی) بر اساس امروز */
  nextDate: (now: Date) => Date;
}

const JALALI_MONTH_DAYS = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

function jalaliMonthEnd(jy: number, jm: number): Date {
  const days = jm === 12 ? (isJalaliLeap(jy) ? 30 : 29) : JALALI_MONTH_DAYS[jm - 1];
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, days);
  return new Date(gy, gm - 1, gd, 23, 59, 59);
}

function isJalaliLeap(jy: number): boolean {
  // الگوریتم کبیسهٔ جلالی (۳۳ ساله)
  const r = jy % 33;
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(r);
}

const TAX_DEADLINES: TaxDeadline[] = [
  {
    title: "لیست حقوق و دستمزد ماهانه",
    desc: "مهلت ارسال لیست بیمه و پرداخت مالیات حقوق کارکنان — پایان هر ماه",
    icon: Wallet,
    nextDate: (now) => {
      const [jy, jm] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const end = jalaliMonthEnd(jy, jm);
      return end >= now ? end : (() => { const nm = jm === 12 ? 1 : jm + 1; const ny = jm === 12 ? jy + 1 : jy; return jalaliMonthEnd(ny, nm); })();
    },
  },
  {
    title: "اظهارنامهٔ فصلی ارزش افزوده",
    desc: "تا ۱۵ روز پس از پایان هر فصل مالیاتی — فصل جاری",
    icon: Receipt,
    nextDate: (now) => {
      const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      // پایان فصل جاری: ماه‌های ۳، ۶، ۹، ۱۲
      const qEndMonth = Math.ceil(jm / 3) * 3;
      const qEnd = jalaliMonthEnd(jy, qEndMonth);
      if (qEnd >= now) {
        // سررسید = ۱۵ روز پس از پایان فصل
        const deadline = new Date(qEnd.getTime() + 15 * 86400_000);
        return deadline;
      }
      // فصل بعدی
      const nm = qEndMonth === 12 ? 3 : qEndMonth + 3;
      const ny = qEndMonth === 12 ? jy + 1 : jy;
      return new Date(jalaliMonthEnd(ny, nm).getTime() + 15 * 86400_000);
    },
  },
  {
    title: "اظهارنامهٔ عملکرد اشخاص حقیقی",
    desc: "معمولاً تا پایان خرداد سال بعد — دورهٔ مالی جاری",
    icon: TrendingUp,
    nextDate: (now) => {
      const [jy] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const [gy, gm, gd] = jalaliToGregorian(jy + 1, 3, 31);
      return new Date(gy, gm - 1, gd, 23, 59, 59);
    },
  },
  {
    title: "گواهی ارزش افزوده خرید (فصل)",
    desc: "ثبت گواهی‌های خرید برای کسر مالیات ورودی — هم‌زمان با اظهارنامهٔ فصل",
    icon: CalendarDays,
    nextDate: (now) => {
      const [jy, jm] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const qEndMonth = Math.ceil(jm / 3) * 3;
      const qEnd = jalaliMonthEnd(jy, qEndMonth);
      if (qEnd >= now) return new Date(qEnd.getTime() + 15 * 86400_000);
      const nm = qEndMonth === 12 ? 3 : qEndMonth + 3;
      const ny = qEndMonth === 12 ? jy + 1 : jy;
      return new Date(jalaliMonthEnd(ny, nm).getTime() + 15 * 86400_000);
    },
  },
];

function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function DeadlineCard({ d, now }: { d: TaxDeadline; now: Date }) {
  const nowMs = now.getTime();
  const target = React.useMemo(() => d.nextDate(new Date(nowMs)), [d, nowMs]);
  const msLeft = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(msLeft / 86400_000);
  const hours = Math.floor((msLeft % 86400_000) / 3600_000);
  const [jy, jm, jd] = gregorianToJalali(target.getFullYear(), target.getMonth() + 1, target.getDate());
  const urgency =
    days <= 3 ? "danger" : days <= 10 ? "warning" : "ok";
  const Icon = d.icon;
  const urgencyStyles: Record<string, { badge: string; ring: string; label: string }> = {
    danger: { badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300", ring: "hover:border-rose-400/50", label: "فوری" },
    warning: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300", ring: "hover:border-amber-400/50", label: "نزدیک" },
    ok: { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300", ring: "hover:border-emerald-400/50", label: "در حال حاضر امن" },
  };
  const u = urgencyStyles[urgency];
  return (
    <Card className={`group border-border/70 bg-card/70 backdrop-blur transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 ${u.ring}`}>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <Badge variant="secondary" className={`text-[11px] ${u.badge}`}>
            {days > 0 ? `${toPersianDigits(days)} روز مانده` : `${toPersianDigits(hours)} ساعت مانده`}
          </Badge>
        </div>
        <h4 className="text-sm font-bold text-foreground leading-snug">{d.title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{d.desc}</p>
        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <span>سررسید شمسی: {toPersianDigits(`${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`)}</span>
          <span className="flex items-center gap-1 text-primary/80">
            <AlertTriangle className="h-3 w-3" />
            {u.label}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* کامپوننت اصلی                                                       */
/* ------------------------------------------------------------------ */

export function TaxCalculatorSection({
  onOpenAuth,
  onNavigatePricing,
}: {
  onOpenAuth?: () => void;
  onNavigatePricing?: () => void;
}) {
  const now = useNow(30_000);

  // حقوق
  const [salary, setSalary] = React.useState(50_000_000);
  const payroll = React.useMemo(() => calcPayroll(salary), [salary]);

  // VAT
  const [sales, setSales] = React.useState(800_000_000);
  const [purchases, setPurchases] = React.useState(500_000_000);
  const [lateMonths, setLateMonths] = React.useState(0);
  const vat = React.useMemo(() => calcVat(sales, purchases), [sales, purchases]);
  const vatLate = React.useMemo(
    () => Math.round(vat.payable * VAT_LATE_MONTHLY * lateMonths),
    [vat.payable, lateMonths]
  );

  // عملکرد
  const [profit, setProfit] = React.useState(300_000_000);
  const [bizKind, setBizKind] = React.useState<"service" | "other">("other");
  const biz = React.useMemo(() => calcBusinessTax(profit, bizKind), [profit, bizKind]);

  const reset = () => {
    setSalary(50_000_000);
    setSales(800_000_000);
    setPurchases(500_000_000);
    setLateMonths(0);
    setProfit(300_000_000);
    setBizKind("other");
  };

  return (
    <section className="relative overflow-hidden border-y border-border bg-gradient-to-b from-muted/40 via-background to-background" aria-labelledby="tax-calc-heading">
      {/* پس‌زمینهٔ تزئینی */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 right-1/3 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-success/6 blur-3xl" />
        <div className="absolute inset-0 grid-pattern opacity-25" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        {/* هدر بخش */}
        <div className="mx-auto max-w-2xl text-center mb-10">
          <Badge variant="secondary" className="bg-primary/10 text-primary mb-4 border border-primary/20">
            <Calculator className="h-3 w-3 ml-1" />
            ابزارهای رایگان مالی
          </Badge>
          <h2 id="tax-calc-heading" className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            ماشین‌حساب‌های مالیاتی{" "}
            <span className="bg-gradient-to-l from-primary to-primary/60 bg-clip-text text-transparent">۱۴۰۴</span>
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            حقوق و دستمزد، ارزش افزوده و مالیات عملکرد را همین‌جا آنلاین و رایگان محاسبه کنید —
            با همان نرخ‌ها و پله‌هایی که هوش به‌صورت خودکار در فاکتورها و فیش‌های شما اعمال می‌کند.
          </p>
        </div>

        <TooltipProvider delayDuration={200}>
          <Tabs defaultValue="payroll" dir="rtl" className="w-full">
            {/* تب‌ها */}
            <TabsList className="mx-auto grid w-full max-w-xl grid-cols-3 h-auto p-1.5 rounded-xl bg-muted/60 border border-border/60">
              <TabsTrigger
                value="payroll"
                className="rounded-lg py-2.5 px-2 data-[state=active]:shadow-md data-[state=active]:bg-background transition-all duration-200 gap-1.5"
              >
                <Wallet className="h-4 w-4" />
                <span className="text-xs sm:text-sm">مالیات حقوق</span>
              </TabsTrigger>
              <TabsTrigger
                value="vat"
                className="rounded-lg py-2.5 px-2 data-[state=active]:shadow-md data-[state=active]:bg-background transition-all duration-200 gap-1.5"
              >
                <Receipt className="h-4 w-4" />
                <span className="text-xs sm:text-sm">ارزش افزوده</span>
              </TabsTrigger>
              <TabsTrigger
                value="business"
                className="rounded-lg py-2.5 px-2 data-[state=active]:shadow-md data-[state=active]:bg-background transition-all duration-200 gap-1.5"
              >
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs sm:text-sm">عملکرد مشاغل</span>
              </TabsTrigger>
            </TabsList>

            {/* ------------------- تب حقوق ------------------- */}
            <TabsContent value="payroll" className="mt-6 focus-visible:outline-none">
              <div className="grid gap-5 lg:grid-cols-5">
                <Card className="lg:col-span-2 border-border/70 bg-card/80 backdrop-blur">
                  <CardContent className="p-5 space-y-5">
                    <AmountInput
                      value={salary}
                      onChange={setSalary}
                      label="حقوق مشمول ماهانه (ناخالص)"
                      hint="حقوق پایه + مزایای مشمول بیمه. معافیت ماهانهٔ ۱۴۰۴: ۲۰ میلیون تومان."
                      icon={<Wallet className="h-4 w-4" />}
                    />
                    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Percent className="h-3.5 w-3.5 text-primary" />
                        نرخ‌های ۱۴۰۴ (پلکانی)
                      </p>
                      <ul className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
                        <li className="flex justify-between"><span>تا ۲۰ میلیون</span><span>معاف</span></li>
                        <li className="flex justify-between"><span>۲۰ تا ۶۰ میلیون</span><span>۱۰٪</span></li>
                        <li className="flex justify-between"><span>۶۰ تا ۱۴۰ میلیون</span><span>۱۵٪</span></li>
                        <li className="flex justify-between"><span>۱۴۰ تا ۲۰۰ میلیون</span><span>۲۰٪</span></li>
                        <li className="flex justify-between"><span>۲۰۰ تا ۳۰۰ میلیون</span><span>۲۵٪</span></li>
                        <li className="flex justify-between"><span>بیش از ۳۰۰ میلیون</span><span>۳۰٪</span></li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-3 border-primary/25 bg-gradient-to-bl from-primary/5 via-card to-card">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        فیش برآوردی ماهانه
                      </h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px]">
                          <CheckCircle2 className="h-3 w-3 ml-1" />
                          معافیت ۲۰میلیونی اعمال شد
                        </Badge>
                        <CopyResultButton
                          getText={() =>
                            `فیش برآوردی ۱۴۰۴ — هوش\nحقوق ناخالص: ${formatNumber(payroll.gross)} تومان\nبیمهٔ کارمند (۷٪): ${formatNumber(payroll.insurance)} تومان\nمعافیت: ${formatNumber(payroll.exempt)} تومان\nمالیات: ${formatNumber(payroll.totalTax)} تومان\nخالص پرداختی: ${formatNumber(payroll.net)} تومان\nهزینهٔ کل کارفرما: ${formatNumber(payroll.employerCost)} تومان\n(محاسبهٔ پلکانی طبق قانون بودجهٔ ۱۴۰۴ — hoosh)`
                          }
                        />
                      </div>
                    </div>
                    <ResultRow label="حقوق ناخالص" value={<AnimatedAmount value={payroll.gross} />} />
                    <ResultRow
                      label="بیمه سهم کارمند (۷٪)"
                      value={<AnimatedAmount value={-payroll.insurance} />}
                      tone="danger"
                      tooltip="سهم کارمند از بیمهٔ تأمین اجتماعی — ۷٪ حقوق مشمول"
                    />
                    <ResultRow
                      label="معافیت مالیاتی"
                      value={<AnimatedAmount value={payroll.exempt} />}
                      tone="success"
                      tooltip="طبق قانون بودجهٔ ۱۴۰۴، درآمد ماهانه تا ۲۰ میلیون تومان از مالیات حقوق معاف است"
                    />
                    {payroll.rows.length > 0 ? (
                      <div className="rounded-lg border border-border/60 divide-y divide-border/50 bg-muted/30">
                        {payroll.rows.map((r) => (
                          <div key={r.label} className="flex items-center justify-between px-3 py-1.5 text-xs">
                            <span className="text-muted-foreground">
                              {r.label}: {formatCompactToman(r.from)} {r.to !== null && r.to > r.from ? `تا ${formatCompactToman(r.to)}` : "به بالا"} × {toPersianDigits(r.rate * 100)}٪
                            </span>
                            <span className="font-semibold tabular-nums text-foreground">{formatNumber(r.tax)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <ResultRow
                      label="مالیات حقوق"
                      value={<AnimatedAmount value={-payroll.totalTax} />}
                      tone="danger"
                      strong
                      tooltip="محاسبهٔ پلکانی: هر پله نرخ خودش — کل درآمد با نرخ بالاتر حساب نمی‌شود"
                    />
                    <div className="mt-2 rounded-xl bg-primary/10 border border-primary/20 p-4 flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">خالص پرداختی به کارمند</span>
                      <AnimatedAmount value={payroll.net} className="text-xl font-extrabold text-primary tabular-nums" />
                    </div>
                    <ResultRow
                      label="هزینهٔ کل کارفرما (با بیمهٔ ۲۳٪)"
                      value={<AnimatedAmount value={payroll.employerCost} />}
                      tone="warning"
                      tooltip="حقوق + سهم کارفرما از بیمه (۲۳٪) — عددی که برای قیمت‌گذاری نیرو باید دید"
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ------------------- تب ارزش افزوده ------------------- */}
            <TabsContent value="vat" className="mt-6 focus-visible:outline-none">
              <div className="grid gap-5 lg:grid-cols-5">
                <Card className="lg:col-span-2 border-border/70 bg-card/80 backdrop-blur">
                  <CardContent className="p-5 space-y-5">
                    <AmountInput
                      value={sales}
                      onChange={setSales}
                      label="فروش فصلی (بدون مالیات)"
                      hint="مجموع فاکتورهای فروش فصل — مبنای مالیات خروجی ۱۰٪"
                      icon={<TrendingUp className="h-4 w-4" />}
                    />
                    <AmountInput
                      value={purchases}
                      onChange={setPurchases}
                      label="خرید فصلی (با صورتحساب معتبر)"
                      hint="فقط خریدهای دارای صورتحساب الکترونیکی معتبر — مبنای کسر مالیات ورودی"
                      icon={<Receipt className="h-4 w-4" />}
                    />
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        ماه‌های تأخیر در پرداخت
                      </label>
                      <div className="flex items-center gap-2">
                        {[0, 1, 2, 3].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setLateMonths(m)}
                            className={`h-10 flex-1 rounded-lg border text-sm font-semibold transition-all duration-150 active:scale-95 ${
                              lateMonths === m
                                ? "border-primary bg-primary/10 text-primary shadow-sm"
                                : "border-border bg-muted/40 text-muted-foreground hover:border-primary/30"
                            }`}
                            aria-pressed={lateMonths === m}
                          >
                            {toPersianDigits(m)} ماه
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">جریمهٔ تأخیر: ۲٫۵٪ به‌ازای هر ماه</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-3 border-primary/25 bg-gradient-to-bl from-primary/5 via-card to-card">
                  <CardContent className="p-5 space-y-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      اظهارنامهٔ فصلی برآوردی
                    </h3>
                    <div className="flex justify-end">
                      <CopyResultButton
                        getText={() =>
                          `اظهارنامهٔ ارزش افزوده (برآورد) — هوش\nفروش فصل: ${formatNumber(vat.sales)} تومان\nخرید فصل: ${formatNumber(vat.purchases)} تومان\nمالیات خروجی (۱۰٪): ${formatNumber(vat.output)} تومان\nمالیات ورودی: ${formatNumber(vat.input)} تومان\nقابل پرداخت: ${formatNumber(vat.payable)} تومان${vatLate > 0 ? `\nجریمهٔ تأخیر ${toPersianDigits(lateMonths)} ماه: ${formatNumber(vatLate)} تومان` : ""}\n(نرخ عمومی ۱۰٪ — hoosh)`
                        }
                      />
                    </div>
                    <ResultRow label="مالیات خروجی (فروش × ۱۰٪)" value={<AnimatedAmount value={vat.output} />} />
                    <ResultRow
                      label="مالیات ورودی قابل کسر (خرید × ۱۰٪)"
                      value={<AnimatedAmount value={-vat.input} />}
                      tone="success"
                      tooltip="مالیات خریدهای دارای صورتحساب معتبر از مالیات فروش کسر می‌شود"
                    />
                    <div className="mt-2 rounded-xl bg-primary/10 border border-primary/20 p-4 flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">مالیات قابل پرداخت</span>
                      <AnimatedAmount value={vat.payable} className="text-xl font-extrabold text-primary tabular-nums" />
                    </div>
                    {vat.credit > 0 ? (
                      <div className="rounded-lg border border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        اعتبار قابل انتقال به فصل بعد: {formatCompactToman(vat.credit)} — خرید شما از فروش جلوتر است.
                      </div>
                    ) : null}
                    {vatLate > 0 ? (
                      <div className="rounded-lg border border-rose-300/40 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        جریمهٔ تأخیر {toPersianDigits(lateMonths)} ماهه: {formatCompactToman(vatLate)} — جمع پرداختی: {formatCompactToman(vat.payable + vatLate)}
                      </div>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
                      در هوش، این محاسبه برای هر فاکتور به‌صورت خودکار انجام می‌شود؛ اظهارنامهٔ فصلی با یک کلیک
                      از دلِ همین اعداد ساخته می‌شود و یادآور سررسید، جریمه را صفر می‌کند.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ------------------- تب عملکرد ------------------- */}
            <TabsContent value="business" className="mt-6 focus-visible:outline-none">
              <div className="grid gap-5 lg:grid-cols-5">
                <Card className="lg:col-span-2 border-border/70 bg-card/80 backdrop-blur">
                  <CardContent className="p-5 space-y-5">
                    <AmountInput
                      value={profit}
                      onChange={setProfit}
                      label="سود مشمول مالیات (سالانه)"
                      hint="سود خالص پس از کسر هزینه‌های قابل قبول مالیاتی"
                      icon={<TrendingUp className="h-4 w-4" />}
                    />
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Percent className="h-4 w-4 text-primary" />
                        نوع فعالیت
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { k: "service", t: "خدمات (۱۵٪)", d: "اشخاص حقیقی — ارائهٔ خدمت" },
                            { k: "other", t: "سایر (۲۵٪)", d: "تولیدی، بازرگانی، حقوقی" },
                          ] as const
                        ).map((o) => (
                          <button
                            key={o.k}
                            type="button"
                            onClick={() => setBizKind(o.k)}
                            className={`rounded-xl border p-3 text-right transition-all duration-150 active:scale-95 ${
                              bizKind === o.k
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border bg-muted/40 hover:border-primary/30"
                            }`}
                            aria-pressed={bizKind === o.k}
                          >
                            <span className={`block text-sm font-bold ${bizKind === o.k ? "text-primary" : "text-foreground"}`}>{o.t}</span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">{o.d}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-3 border-primary/25 bg-gradient-to-bl from-primary/5 via-card to-card">
                  <CardContent className="p-5 space-y-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      مالیات عملکرد برآوردی
                    </h3>
                    <ResultRow label="سود مشمول" value={<AnimatedAmount value={biz.profit} />} />
                    <ResultRow
                      label="نرخ مالیات"
                      value={`${toPersianDigits(biz.rate * 100)}٪`}
                      tone="primary"
                      tooltip="خدمات اشخاص حقیقی ۱۵٪ — سایر فعالیت‌ها و اشخاص حقوقی ۲۵٪ (ساده‌شده)"
                    />
                    <div className="mt-2 rounded-xl bg-primary/10 border border-primary/20 p-4 flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">مالیات عملکرد</span>
                      <AnimatedAmount value={biz.tax} className="text-xl font-extrabold text-primary tabular-nums" />
                    </div>
                    <ResultRow label="سود پس از مالیات" value={<AnimatedAmount value={biz.net} />} tone="success" strong />
                    <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
                      برای مشاغل مشمول درصدمعین، مبنای محاسبه درآمد (نه سود) است و نرخ‌ها به صنف بستگی دارند —
                      ماژول مالیاتی هوش هر دو حالت را با جداول به‌روز پشتیبانی می‌کند.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </TooltipProvider>

        {/* ------------------- تقویم مالیاتی ------------------- */}
        <div className="mt-12">
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarDays className="h-4.5 w-4.5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-foreground">تقویم مالیاتی زنده</h3>
                <p className="text-xs text-muted-foreground">نزدیک‌ترین سررسیدهای قانونی — هر ۳۰ ثانیه به‌روزرسانی می‌شود</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              زنده — {toJalali(now)}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TAX_DEADLINES.map((d) => (
              <DeadlineCard key={d.title} d={d} now={now} />
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl border border-primary/25 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="text-center sm:text-right">
            <h3 className="text-lg font-bold text-foreground">این محاسبات را یک‌بار برای همیشه خودکار کنید</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xl">
              فیش حقوقی با پله‌های به‌روز، ارزش افزوده روی هر فاکتور، اظهارنامهٔ آمادهٔ ارسال و هشدار سررسید —
              همه در ۱۶ ماژول هوش، با تریال ۳ روزهٔ رایگان.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row">
            {onOpenAuth ? (
              <Button size="lg" className="h-12 px-6 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all" onClick={onOpenAuth}>
                شروع آزمایش ۳ روزه
                <ArrowLeft className="h-4 w-4 mr-2" />
              </Button>
            ) : (
              <a href="/portal/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all">
                شروع آزمایش ۳ روزه
                <ArrowLeft className="h-4 w-4" />
              </a>
            )}
            {onNavigatePricing ? (
              <Button size="lg" variant="outline" className="h-12 px-6 hover:border-primary/50 hover:shadow-md transition-all" onClick={onNavigatePricing}>
                مشاهدهٔ پلن‌ها
              </Button>
            ) : (
              <a href="/pricing" className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-semibold hover:border-primary/50 hover:shadow-md transition-all">
                مشاهدهٔ پلن‌ها
              </a>
            )}
            <Button size="lg" variant="ghost" className="h-12 px-4 text-muted-foreground hover:text-foreground" onClick={reset} aria-label="بازنشانی مقادیر پیش‌فرض">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          اعداد بر اساس قانون بودجهٔ ۱۴۰۴ و نرخ‌های جاری است و جایگزین مشاورهٔ مالیاتی نیست؛ برای فیش‌ها و
          اظهارنامه‌های رسمی همیشه نسخهٔ به‌روز قانون و ابلاغیه‌های سازمان امور مالیاتی را مبنا قرار دهید.
        </p>
      </div>
    </section>
  );
}
