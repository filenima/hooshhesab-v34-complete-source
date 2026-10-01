"use client";

/**
 * TaxCalculatorWidget — ویجت قابل embed ماشین‌حساب مالیات (v27)
 * ----------------------------------------------------------------------------
 * نسخهٔ سبک و فشردهٔ ماشین‌حساب‌های مالیاتی هوش برای سایت‌های شرکا:
 * حسابداران، مشاوران مالی، سایت‌های آگهی استخدام و پرتال‌های صنفی.
 *
 *   <iframe src="https://SITE/embed/tax-calculator" style="width:100%;height:640px;border:0" loading="lazy"></iframe>
 *
 * سه محاسبه‌گر: مالیات حقوق ۱۴۰۴ (پلکانی) / ارزش افزوده / مالیات عملکرد
 * اعداد با محتوای سایت هماهنگ است (معافیت ۲۰M، پله‌های ۱۰-۳۰٪، VAT ۱۰٪).
 *
 * postMessage: نوع "hoosh:tax-calc:height" — مثل plan-quiz برای تنظیم
 * خودکار ارتفاع iframe توسط میزبان.
 */

import * as React from "react";
import { Sparkle, Copy, Check, Calculator, Wallet, Percent, ArrowLeft } from "lucide-react";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { accentStyle, type EmbedAccent } from "@/lib/embed-theme";

interface TaxCalculatorWidgetProps {
  appBaseUrl: string;
  brandName: string;
  logoUrl?: string;
  /** v29 — رنگ لهجهٔ برند شرکا (پارامتر ?color=) */
  accentColor?: EmbedAccent | null;
}

/* ---------------- منطق مالیات حقوق ۱۴۰۴ (همان هستهٔ /calculators) ---------------- */

const PAYROLL_EXEMPTION = 20_000_000;
const PAYROLL_BRACKETS: { upto: number; rate: number }[] = [
  { upto: 60_000_000, rate: 0.1 },
  { upto: 140_000_000, rate: 0.15 },
  { upto: 200_000_000, rate: 0.2 },
  { upto: 300_000_000, rate: 0.25 },
  { upto: Infinity, rate: 0.3 },
];
const EMPLOYEE_INSURANCE = 0.07;
const VAT_RATE = 0.1;

function calcPayroll(gross: number) {
  const insurance = Math.round(gross * EMPLOYEE_INSURANCE);
  const taxableBase = Math.max(0, gross - insurance);
  const exempt = Math.min(PAYROLL_EXEMPTION, taxableBase);
  const taxable = Math.max(0, taxableBase - exempt);
  let remaining = taxable;
  let lower = PAYROLL_EXEMPTION;
  let totalTax = 0;
  for (const b of PAYROLL_BRACKETS) {
    if (remaining <= 0) break;
    const span = Math.min(remaining, b.upto - lower);
    if (span > 0) {
      totalTax += Math.round(span * b.rate);
      remaining -= span;
    }
    lower = b.upto;
  }
  return {
    gross,
    insurance,
    totalTax,
    net: gross - insurance - totalTax,
    employerCost: Math.round(gross * 1.23),
  };
}

function calcVat(sales: number, purchases: number) {
  const output = Math.round(sales * VAT_RATE);
  const input = Math.round(purchases * VAT_RATE);
  return {
    output,
    input,
    payable: Math.max(0, output - input),
    credit: Math.max(0, input - output),
  };
}

function calcBusinessTax(profit: number, kind: "service" | "other") {
  const rate = kind === "service" ? 0.15 : 0.25;
  const tax = Math.round(profit * rate);
  return { rate, tax, net: profit - tax };
}

/* ---------------- ورودی مبلغ + برچسب فارسی ---------------- */

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
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "danger" | "success";
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary font-black",
    danger: "text-rose-600 dark:text-rose-400 font-bold",
    success: "text-emerald-600 dark:text-emerald-400 font-bold",
  };
  return (
    // key متغیر (value) → هر تغییر عدد، انیمیشن fade-slide را دوباره اجرا می‌کند (پیشنهاد VLM)
    <div
      key={value}
      className="hoosh-value-flash flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 odd:bg-muted/40"
    >
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-xs tabular-nums ${tones[tone]}`}>{value}</span>
    </div>
  );
}

/* ---------------- ویجت اصلی ---------------- */

type Mode = "payroll" | "vat" | "business";

const MODES: { id: Mode; label: string; icon: typeof Calculator }[] = [
  { id: "payroll", label: "مالیات حقوق", icon: Wallet },
  { id: "vat", label: "ارزش افزوده", icon: Percent },
  { id: "business", label: "عملکرد", icon: Calculator },
];

export function TaxCalculatorWidget({ appBaseUrl, brandName, logoUrl, accentColor }: TaxCalculatorWidgetProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [mode, setMode] = React.useState<Mode>("payroll");
  const [copied, setCopied] = React.useState(false);

  const [gross, setGross] = React.useState(30_000_000);
  const [sales, setSales] = React.useState(500_000_000);
  const [purchases, setPurchases] = React.useState(200_000_000);
  const [profit, setProfit] = React.useState(100_000_000);
  const [bizKind, setBizKind] = React.useState<"service" | "other">("service");

  // همگام‌سازی ارتفاع با میزبان iframe
  React.useEffect(() => {
    const send = () => {
      try {
        const h = Math.ceil(
          bodyRef.current?.getBoundingClientRect().height ?? document.documentElement.scrollHeight
        );
        parent?.postMessage({ type: "hoosh:tax-calc:height", height: h }, "*");
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
      const url = "/api/widgets/track?widget=tax-calculator";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        void fetch(url, { method: "POST", keepalive: true, mode: "no-cors" }).catch(() => {});
      }
    } catch {
      /* آمار هرگز UX را خراب نکند */
    }
  }, []);

  const payroll = React.useMemo(() => calcPayroll(gross), [gross]);
  const vat = React.useMemo(() => calcVat(sales, purchases), [sales, purchases]);
  const biz = React.useMemo(() => calcBusinessTax(profit, bizKind), [profit, bizKind]);

  const resultText = React.useMemo(() => {
    if (mode === "payroll")
      return `حقوق ناخالص: ${formatNumber(gross)}\nبیمه سهم کارمند (۷٪): ${formatNumber(payroll.insurance)}\nمالیات پلکانی: ${formatNumber(payroll.totalTax)}\nخالص پرداختی: ${formatNumber(payroll.net)}\nهزینه کل کارفرما: ${formatNumber(payroll.employerCost)}`;
    if (mode === "vat")
      return `فروش دوره: ${formatNumber(sales)}\nخرید دوره: ${formatNumber(purchases)}\nمالیات خروجی (۱۰٪): ${formatNumber(vat.output)}\nمالیات ورودی: ${formatNumber(vat.input)}\n${vat.payable > 0 ? `قابل پرداخت: ${formatNumber(vat.payable)}` : `اعتبار قابل انتقال: ${formatNumber(vat.credit)}`}`;
    return `سود مشمول: ${formatNumber(profit)}\nنرخ: ${toPersianDigits(biz.rate * 100)}٪\nمالیات عملکرد: ${formatNumber(biz.tax)}\nسود خالص: ${formatNumber(biz.net)}`;
  }, [mode, gross, payroll, sales, purchases, vat, profit, biz]);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(resultText + `\n— ${brandName}`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = resultText + `\n— ${brandName}`;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [resultText, brandName]);

  return (
    <div
      ref={bodyRef}
      style={accentStyle(accentColor)}
      className="min-h-[420px] bg-background px-3 py-4 text-foreground sm:px-5 sm:py-5"
    >
      {/* هدر مینیمال برند */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <a
          href={appBaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 font-extrabold text-foreground transition-opacity hover:opacity-80"
        >
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="h-6 w-auto" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkle className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          <span className="text-sm">{brandName}</span>
        </a>
        <span className="text-[10px] font-medium text-muted-foreground">
          ماشین‌حساب مالیات ۱۴۰۴
        </span>
      </header>

      {/* انتخاب حالت */}
      <div
        role="tablist"
        aria-label="نوع ماشین‌حساب"
        className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl bg-muted/60 p-1.5"
      >
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m.id)}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold transition-all active:scale-[0.98] ${
                active
                  ? "bg-background text-primary shadow-sm ring-1 ring-primary/25"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ————— حالت حقوق ————— */}
      {mode === "payroll" && (
        <div className="space-y-3">
          <AmountField label="حقوق ناخالص ماهانه" value={gross} onChange={setGross} />
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between border-b border-primary/15 pb-2">
              <span className="text-xs font-black text-foreground">فیش حقوقی برآوردی</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
                معافیت {formatCompactToman(PAYROLL_EXEMPTION)}
              </span>
            </div>
            <ResultRow label="بیمه سهم کارمند (۷٪)" value={`${formatNumber(payroll.insurance)} ت`} tone="danger" />
            <ResultRow label="مالیات پلکانی" value={`${formatNumber(payroll.totalTax)} ت`} tone="danger" />
            <ResultRow label="خالص پرداختی" value={`${formatNumber(payroll.net)} ت`} tone="success" />
            <ResultRow label="هزینهٔ کل کارفرما (با ۲۳٪)" value={`${formatNumber(payroll.employerCost)} ت`} />
          </div>
          <p className="text-center text-[10px] leading-5 text-muted-foreground">
            محاسبهٔ پلکانی طبق قانون بودجه ۱۴۰۴ — نسخهٔ کامل با جزئیات پله‌ها در{" "}
            <a
              href={`${appBaseUrl}/calculators`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-primary underline decoration-dotted underline-offset-4"
            >
              ماشین‌حساب‌های {brandName}
            </a>
          </p>
        </div>
      )}

      {/* ————— حالت ارزش افزوده ————— */}
      {mode === "vat" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <AmountField label="فروش دوره" value={sales} onChange={setSales} />
            <AmountField label="خرید دوره" value={purchases} onChange={setPurchases} />
          </div>
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between border-b border-primary/15 pb-2">
              <span className="text-xs font-black text-foreground">اظهارنامهٔ برآوردی</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
                نرخ عمومی ۱۰٪
              </span>
            </div>
            <ResultRow label="مالیات خروجی (فروش)" value={`${formatNumber(vat.output)} ت`} tone="danger" />
            <ResultRow label="مالیات ورودی (خرید)" value={`${formatNumber(vat.input)} ت`} tone="success" />
            {vat.payable > 0 ? (
              <ResultRow label="قابل پرداخت" value={`${formatNumber(vat.payable)} ت`} tone="primary" />
            ) : (
              <ResultRow label="اعتبار قابل انتقال دورهٔ بعد" value={`${formatNumber(vat.credit)} ت`} tone="success" />
            )}
          </div>
          <p className="text-center text-[10px] leading-5 text-muted-foreground">
            جریمهٔ تأخیر پرداخت: ۲٫۵٪ به‌ازای هر ماه — محاسبه در نسخهٔ کامل
          </p>
        </div>
      )}

      {/* ————— حالت عملکرد ————— */}
      {mode === "business" && (
        <div className="space-y-3">
          <AmountField label="سود مشمول مالیات (سالانه)" value={profit} onChange={setProfit} />
          <div
        role="radiogroup"
        aria-label="نوع فعالیت"
        className="grid grid-cols-2 gap-2"
          >
            {(
              [
                { id: "service", label: "خدماتی — ۱۵٪" },
                { id: "other", label: "سایر — ۲۵٪" },
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                role="radio"
                aria-checked={bizKind === k.id}
                onClick={() => setBizKind(k.id)}
                className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition-all active:scale-[0.98] ${
                  bizKind === k.id
                    ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-3 shadow-sm">
            <div className="mb-2 border-b border-primary/15 pb-2 text-xs font-black text-foreground">
              مالیات عملکرد اشخاص حقیقی
            </div>
            <ResultRow label={`نرخ مالیات`} value={`${toPersianDigits(biz.rate * 100)}٪`} />
            <ResultRow label="مالیات عملکرد" value={`${formatNumber(biz.tax)} ت`} tone="danger" />
            <ResultRow label="سود خالص پس از مالیات" value={`${formatNumber(biz.net)} ت`} tone="success" />
          </div>
        </div>
      )}

      {/* اکشن‌ها */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onCopy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2.5 text-[11px] font-bold text-primary transition-all hover:bg-primary/15 active:scale-[0.98]"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "کپی شد!" : "کپی نتیجه"}
        </button>
        <a
          href={`${appBaseUrl}/pricing`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-[11px] font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:opacity-90 active:scale-[0.98]"
        >
          حسابداری خودکار با {brandName}
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      {/* فوتر مینیمال */}
      <footer className="mt-3 text-center text-[10px] leading-5 text-muted-foreground/80">
        برآورد است؛ جایگزین مشاورهٔ رسمی نیست — نرخ‌های ۱۴۰۴
      </footer>
    </div>
  );
}
