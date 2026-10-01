"use client";

/**
 * PayrollCalculatorWidget — ویجت قابل embed حقوق و دستمزد (v29)
 * ----------------------------------------------------------------------------
 * ویجت پنجم کانال شرکا — ماشین‌حساب فیش حقوقی ۱۴۰۴:
 * حقوق پایه + مسکن + بن + اضافه‌کاری → بیمه ۷٪، مالیات پلکانی (معافیت ۲۰M،
 * ۱۰-۳۰٪)، خالص دریافتی و هزینهٔ کل کارفرما (سهم ۲۳٪).
 *
 *   <iframe src="https://SITE/embed/payroll-calculator" style="width:100%;height:680px;border:0" loading="lazy" title="ماشین‌حساب حقوق و دستمزد ۱۴۰۴"></iframe>
 *
 * تفاوت با تب «مالیات حقوق» ماشین‌حساب مالیات: این ویجت فیش کامل حقوق و
 * دستمزد را شبیه‌سازی می‌کند (مزایای شمول‌پذیر/معاف + اضافه‌کاری ۱٫۴×
 * مادهٔ ۵۹ + هزینهٔ واقعی کارفرما) — برای سایت‌های جذب نیرو/HR/حسابداران.
 *
 * postMessage: نوع "hoosh:payroll:height" (الگوی ویجت‌های قبلی).
 */

import * as React from "react";
import { Copy, Check, Users, Briefcase, TrendingUp, ArrowLeft, Info } from "lucide-react";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { accentStyle, type EmbedAccent } from "@/lib/embed-theme";

interface PayrollCalculatorWidgetProps {
  appBaseUrl: string;
  brandName: string;
  logoUrl?: string;
  /** v29 — رنگ لهجهٔ برند شرکا (پارامتر ?color=) */
  accentColor?: EmbedAccent | null;
}

/* ---------------- هستهٔ محاسبه (هماهنگ با محتوای سایت — ۱۴۰۴) ---------------- */

const PAYROLL_EXEMPTION = 20_000_000;
const PAYROLL_BRACKETS: { upto: number; rate: number }[] = [
  { upto: 60_000_000, rate: 0.1 },
  { upto: 140_000_000, rate: 0.15 },
  { upto: 200_000_000, rate: 0.2 },
  { upto: 300_000_000, rate: 0.25 },
  { upto: Infinity, rate: 0.3 },
];
const EMPLOYEE_INSURANCE = 0.07;
const EMPLOYER_INSURANCE = 0.23;
const OVERTIME_MULTIPLIER = 1.4; // مادهٔ ۵۹ قانون کار
const MONTHLY_HOURS = 220; // ساعت کار در ماه (۳۰ روزه × ۷٫۲۰)

// مقادیر پیش‌فرض ۱۴۰۴ (طبق محتوای سایت: دستمزد روزانه ۳۷۳٬۳۳۳)
const DEFAULTS = {
  base: 11_200_000,
  housing: 900_000,
  food: 13_200_000, // بن روزانه ~۱٬۲۰۰٬۰۰۰ × ۱۱ روز
  overtimeHours: 0,
};

function calcSlip(input: {
  base: number;
  housing: number;
  food: number;
  overtimeHours: number;
}) {
  const hourlyBase = input.base / MONTHLY_HOURS;
  const overtimePay = Math.round(hourlyBase * OVERTIME_MULTIPLIER * input.overtimeHours);

  // درآمد کل (همهٔ اقلام مشمول بیمه هستند)
  const gross = input.base + input.housing + input.food + overtimePay;

  // بیمه ۷٪ سهم کارمند روی کل مشمول
  const insurance = Math.round(gross * EMPLOYEE_INSURANCE);

  // مشمول مالیات: پایه + اضافه‌کاری − بیمه (مسکن و بن معاف مالیات‌اند)
  const taxableIncome = Math.max(0, input.base + overtimePay - insurance);
  const exempt = Math.min(PAYROLL_EXEMPTION, taxableIncome);
  const taxable = Math.max(0, taxableIncome - exempt);
  let remaining = taxable;
  let lower = 0;
  let tax = 0;
  for (const b of PAYROLL_BRACKETS) {
    if (remaining <= 0) break;
    const span = Math.min(remaining, b.upto - lower);
    if (span > 0) {
      tax += Math.round(span * b.rate);
      remaining -= span;
    }
    lower = b.upto;
  }

  const net = gross - insurance - tax;
  const employerInsurance = Math.round(gross * EMPLOYER_INSURANCE);
  const employerTotal = gross + employerInsurance;
  const hourlyRate = Math.round(hourlyBase);

  return {
    hourlyRate,
    overtimePay,
    gross,
    insurance,
    taxableIncome,
    tax,
    net,
    employerInsurance,
    employerTotal,
    annualEmployerTotal: employerTotal * 12,
  };
}

/* ---------------- ورودی مبلغ ---------------- */

function AmountField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{hint ?? "تومان"}</span>
      </span>
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        value={value ? formatNumber(value) : ""}
        placeholder="۰"
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
          onChange(digits ? Number(digits) : 0);
        }}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center text-sm font-bold tabular-nums text-foreground shadow-sm transition-all outline-none placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
    </label>
  );
}

function ResultRow({
  label,
  value,
  tone = "default",
  strong,
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "danger" | "success";
  strong?: boolean;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary font-black",
    danger: "text-rose-600 dark:text-rose-400 font-bold",
    success: "text-emerald-600 dark:text-emerald-400 font-bold",
  };
  return (
    <div
      key={value}
      className={`hoosh-value-flash flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 odd:bg-muted/40 ${strong ? "bg-primary/[0.06]" : ""}`}
    >
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-xs tabular-nums ${tones[tone]}`}>{value}</span>
    </div>
  );
}

/* ---------------- ویجت ---------------- */

export function PayrollCalculatorWidget({ appBaseUrl, brandName, logoUrl, accentColor }: PayrollCalculatorWidgetProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [base, setBase] = React.useState(DEFAULTS.base);
  const [housing, setHousing] = React.useState(DEFAULTS.housing);
  const [food, setFood] = React.useState(DEFAULTS.food);
  const [overtimeHours, setOvertimeHours] = React.useState(DEFAULTS.overtimeHours);

  const slip = React.useMemo(
    () => calcSlip({ base, housing, food, overtimeHours }),
    [base, housing, food, overtimeHours]
  );

  // همگام‌سازی ارتفاع با میزبان iframe
  React.useEffect(() => {
    const send = () => {
      try {
        const h = Math.ceil(
          bodyRef.current?.getBoundingClientRect().height ?? document.documentElement.scrollHeight
        );
        parent?.postMessage({ type: "hoosh:payroll:height", height: h }, "*");
      } catch {
        /* نادیده */
      }
    };
    send();
    const t1 = window.setTimeout(send, 350);
    const t2 = window.setTimeout(send, 1200);
    const ro = new ResizeObserver(send);
    if (bodyRef.current) ro.observe(bodyRef.current);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
    };
  }, []);

  // beacon ثبت بازدید (تحلیل کانال شرکا — v28، fire-and-forget)
  React.useEffect(() => {
    try {
      const url = "/api/widgets/track?widget=payroll-calculator";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        void fetch(url, { method: "POST", keepalive: true, mode: "no-cors" }).catch(() => {});
      }
    } catch {
      /* نادیده */
    }
  }, []);

  async function copyResult() {
    const text = `فیش حقوقی ${brandName} — حقوق و دستمزد ۱۴۰۴
حقوق پایه: ${formatNumber(base)} تومان
اضافه‌کاری (${toPersianDigits(String(overtimeHours))} ساعت × ۱٫۴): ${formatNumber(slip.overtimePay)} تومان
جمع درآمد: ${formatNumber(slip.gross)} تومان
بیمه سهم کارمند (۷٪): ${formatNumber(slip.insurance)} تومان
مالیات حقوق: ${formatNumber(slip.tax)} تومان
خالص دریافتی: ${formatNumber(slip.net)} تومان
هزینهٔ کل ماهانهٔ کارفرما (با بیمه ۲۳٪): ${formatNumber(slip.employerTotal)} تومان`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } catch {
        /* نادیده */
      }
    }
  }

  return (
    <div ref={bodyRef} dir="rtl" style={accentStyle(accentColor)} className="mx-auto w-full max-w-xl bg-background px-3 py-4 sm:px-4">
      {/* هدر برند */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <a href={`${appBaseUrl}/calculators`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="text-xs font-extrabold text-foreground">{brandName}</span>
        </a>
        <a
          href={`${appBaseUrl}/pricing`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary transition-all hover:bg-primary/15 active:scale-[0.97]"
        >
          ماژول حقوق و دستمزد هوش
          <ArrowLeft className="h-3 w-3" aria-hidden />
        </a>
      </div>

      {/* عنوان */}
      <div className="mb-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h1 className="text-sm font-extrabold text-foreground">
          ماشین‌حساب فیش حقوقی ۱۴۰۴
        </h1>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          حقوق پایه + مزایا + اضافه‌کاری را وارد کنید؛ بیمه ۷٪، مالیات پلکانی، خالص دریافتی و
          هزینهٔ واقعی کارفرما را لحظه‌ای ببینید.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">معافیت مالیاتی ۲۰M</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">اضافه‌کاری ×۱٫۴</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">بیمه ۷٪/۲۳٪</span>
        </div>
      </div>

      {/* فرم — گروه‌بندی بصری: دریافتی‌ها (پیشنهاد VLM v29) */}
      <p className="mb-2 mt-1 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        دریافتی‌های ماهانه
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="grid grid-cols-2 gap-3">
        <AmountField label="حقوق پایه ماهانه" value={base} onChange={setBase} />
        <AmountField label="حق مسکن" value={housing} onChange={setHousing} />
        <AmountField label="بن کارگری (ماهانه)" value={food} onChange={setFood} />
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold text-foreground">ساعت اضافه‌کاری</span>
            <span className="text-[10px] text-muted-foreground">ساعت</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={overtimeHours ? toPersianDigits(String(overtimeHours)) : ""}
            placeholder="۰"
            onChange={(e) => {
              const digits = e.target.value
                .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
                .replace(/[^\d]/g, "");
              setOvertimeHours(digits ? Math.min(Number(digits), 200) : 0);
            }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center text-sm font-bold tabular-nums text-foreground shadow-sm transition-all outline-none placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </label>
      </div>

      {/* نرخ ساعتی — بینایی فوری برای کارفرمای آگاه */}
      <div className="mt-2.5 flex items-center justify-between rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Info className="h-3 w-3" aria-hidden />
          نرخ هر ساعت عادی
        </span>
        <span className="font-bold tabular-nums text-foreground/80">{formatNumber(slip.hourlyRate)} تومان</span>
      </div>

      {/* نتایج — گروه‌بندی بصری: کسورات و خالص */}
      <p className="mb-2 mt-5 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        کسورات و خالص دریافتی
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
        <p className="mb-2 text-[11px] font-black text-primary">خلاصهٔ فیش حقوقی (ماهانه)</p>
        <ResultRow label="اضافه‌کاری (۱٫۴×)" value={`${formatNumber(slip.overtimePay)} ت`} />
        <ResultRow label="جمع درآمد مشمول بیمه" value={`${formatNumber(slip.gross)} ت`} />
        <ResultRow label="بیمه سهم کارمند (۷٪)" value={`${formatNumber(slip.insurance)} ت`} tone="danger" />
        <ResultRow label="درآمد مشمول مالیات" value={`${formatNumber(slip.taxableIncome)} ت`} />
        <ResultRow label="مالیات حقوق (پلکانی)" value={`${formatNumber(slip.tax)} ت`} tone="danger" />
        <ResultRow label="خالص دریافتی کارمند" value={`${formatNumber(slip.net)} ت`} tone="success" strong />
        <div className="my-2 h-px bg-gradient-to-l from-primary/30 via-border to-transparent" />
        <ResultRow label="سهم کارفرما بیمه (۲۳٪)" value={`${formatNumber(slip.employerInsurance)} ت`} />
        <ResultRow label="هزینهٔ کل ماهانهٔ کارفرما" value={`${formatNumber(slip.employerTotal)} ت`} tone="primary" strong />
        <ResultRow label="هزینهٔ سالانهٔ کارفرما" value={`${formatCompactToman(slip.annualEmployerTotal)} ت`} />
      </div>

      {/* اقدام‌ها */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyResult}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold shadow-md transition-all active:scale-[0.98] ${
            copied
              ? "bg-success/15 text-success"
              : "bg-primary text-primary-foreground shadow-primary/20 hover:shadow-lg hover:shadow-primary/25"
          }`}
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "کپی شد!" : "کپی خلاصهٔ فیش"}
        </button>
        <a
          href={`${appBaseUrl}/blog/payroll-1404-complete-guide`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.98]"
        >
          <Briefcase className="h-3.5 w-3.5" aria-hidden />
          راهنمای کامل حقوق ۱۴۰۴
        </a>
      </div>

      {/* فوتر */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="text-[9px] leading-relaxed text-muted-foreground">
          محاسبه بر اساس پله‌های مالیات حقوق و نرخ‌های بیمهٔ رایج ۱۴۰۴ است؛ جدول ابلاغی سال را مبنا قرار دهید.
        </p>
        <a
          href={`${appBaseUrl}/partners`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-[9px] font-bold text-primary transition-opacity hover:opacity-80"
        >
          <TrendingUp className="h-3 w-3" aria-hidden />
          ویجت رایگان برای سایت شما
        </a>
      </div>
    </div>
  );
}
