"use client";

/**
 * ProfitCalculatorWidget — ویجت قابل embed سود و حاشیه سود (v34)
 * ----------------------------------------------------------------------------
 * ویجت ششم کانال شرکا — ماشین‌حساب سود و حاشیه سود:
 * قیمت فروش واحد + بهای تمام‌شدهٔ واحد + تعداد فروش ماهانه + هزینه‌های ثابت
 * + کارمزد/پورسانت اختیاری → سود ناخالص/خالص، حاشیه‌ها، نقطهٔ سربه‌سر،
 * سود سالانه و جدول سه سناریو (فروش −۲۰٪ / پایه / +۲۰٪).
 *
 *   <iframe src="https://SITE/embed/profit-calculator" style="width:100%;height:760px;border:0" loading="lazy" title="ماشین‌حساب سود و حاشیه سود"></iframe>
 *
 * همهٔ محاسبات سمت کلاینت و لحظه‌ای است — بدون درخواست سرور.
 * postMessage: نوع "hoosh:profit:height" (الگوی ویجت‌های قبلی).
 */

import * as React from "react";
import { Copy, Check, TrendingUp, BarChart3, ArrowLeft, Info } from "lucide-react";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { accentStyle, type EmbedAccent } from "@/lib/embed-theme";

interface ProfitCalculatorWidgetProps {
  appBaseUrl: string;
  brandName: string;
  logoUrl?: string;
  /** v34 — رنگ لهجهٔ برند شرکا (پارامتر ?color=) */
  accentColor?: EmbedAccent | null;
}

/* ---------------- هستهٔ محاسبه ---------------- */

interface ProfitInput {
  price: number; // قیمت فروش واحد (تومان)
  unitCost: number; // بهای تمام‌شدهٔ واحد (تومان)
  qty: number; // تعداد فروش ماهانه
  fixedCosts: number; // هزینه‌های ثابت ماهانه (تومان)
  commissionRate: number; // نرخ کارمزد/پورسانت (٪)
}

function calcProfit(input: ProfitInput) {
  const revenue = input.price * input.qty;
  const cogs = input.unitCost * input.qty;
  const grossProfit = revenue - cogs;
  const commission = Math.round((revenue * input.commissionRate) / 100);
  const netProfit = grossProfit - input.fixedCosts - commission;

  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // نقطهٔ سربه‌سر: سهم واحد از سود ناخالص پس از کارمزد
  const contributionPerUnit = input.price - input.unitCost - (input.price * input.commissionRate) / 100;
  const breakEvenUnits =
    contributionPerUnit > 0 && input.fixedCosts > 0
      ? Math.ceil(input.fixedCosts / contributionPerUnit)
      : contributionPerUnit > 0
        ? 0
        : null; // null = با این قیمت‌ها سربه‌سر ممکن نیست

  return {
    revenue,
    cogs,
    grossProfit,
    commission,
    netProfit,
    grossMarginPct,
    netMarginPct,
    contributionPerUnit,
    breakEvenUnits,
    annualNetProfit: netProfit * 12,
  };
}

/** سود خالص با تعداد فروش دلخواه (برای جدول سناریو) */
function netProfitAtQty(input: ProfitInput, qty: number): number {
  const revenue = input.price * qty;
  const gross = revenue - input.unitCost * qty;
  return gross - input.fixedCosts - Math.round((revenue * input.commissionRate) / 100);
}

/* ---------------- ورودی مبلغ (44px لمس) ---------------- */

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
        aria-label={label}
        value={value ? formatNumber(value) : ""}
        placeholder="۰"
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
          onChange(digits ? Number(digits) : 0);
        }}
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-center text-sm font-bold tabular-nums text-foreground shadow-sm transition-all outline-none placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
    </label>
  );
}

/** ورودی عددی + اسلایدر — لمس ۴۴px و کنترل دقیق همزمان */
function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
}) {
  const clamped = Math.min(Math.max(value, min), max);
  return (
    <div>
      <label className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{hint ?? unit}</span>
      </label>
      <div className="flex items-center gap-2.5">
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          aria-label={label}
          value={value ? toPersianDigits(String(value)) : ""}
          placeholder="۰"
          onChange={(e) => {
            const digits = e.target.value
              .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
              .replace(/[^\d]/g, "");
            onChange(digits ? Number(digits) : 0);
          }}
          className="h-11 w-24 shrink-0 rounded-xl border border-border bg-background px-2 text-center text-sm font-bold tabular-nums text-foreground shadow-sm transition-all outline-none placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
        <input
          type="range"
          aria-label={`اسلایدر ${label}`}
          dir="ltr"
          min={min}
          max={max}
          step={step}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 w-full cursor-pointer accent-[var(--primary)]"
        />
      </div>
    </div>
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

const DEFAULTS: ProfitInput = {
  price: 250_000,
  unitCost: 150_000,
  qty: 300,
  fixedCosts: 15_000_000,
  commissionRate: 0,
};

export function ProfitCalculatorWidget({ appBaseUrl, brandName, logoUrl, accentColor }: ProfitCalculatorWidgetProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [price, setPrice] = React.useState(DEFAULTS.price);
  const [unitCost, setUnitCost] = React.useState(DEFAULTS.unitCost);
  const [qty, setQty] = React.useState(DEFAULTS.qty);
  const [fixedCosts, setFixedCosts] = React.useState(DEFAULTS.fixedCosts);
  const [commissionRate, setCommissionRate] = React.useState(DEFAULTS.commissionRate);

  const input = React.useMemo<ProfitInput>(
    () => ({ price, unitCost, qty, fixedCosts, commissionRate }),
    [price, unitCost, qty, fixedCosts, commissionRate]
  );
  const r = React.useMemo(() => calcProfit(input), [input]);

  const scenarios = React.useMemo(
    () => [
      { label: "فروش ۲۰٪ کمتر", qty: Math.max(0, Math.round(qty * 0.8)), delta: -20 },
      { label: "مبنای فعلی", qty, delta: 0 },
      { label: "فروش ۲۰٪ بیشتر", qty: Math.round(qty * 1.2), delta: 20 },
    ],
    [qty]
  );

  // همگام‌سازی ارتفاع با میزبان iframe
  React.useEffect(() => {
    const send = () => {
      try {
        const h = Math.ceil(
          bodyRef.current?.getBoundingClientRect().height ?? document.documentElement.scrollHeight
        );
        parent?.postMessage({ type: "hoosh:profit:height", height: h }, "*");
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
      const url = "/api/widgets/track?widget=profit-calculator";
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
    const text = `تحلیل سود ماهانه — ${brandName}
فروش ماهانه: ${formatNumber(r.revenue)} تومان
سود ناخالص ماهانه: ${formatNumber(r.grossProfit)} تومان (حاشیهٔ ${formatNumber(r.grossMarginPct, 1)}٪)
سود خالص ماهانه: ${formatNumber(r.netProfit)} تومان (حاشیهٔ ${formatNumber(r.netMarginPct, 1)}٪)
نقطهٔ سربه‌سر: ${r.breakEvenUnits === null ? "با این قیمت‌ها ممکن نیست" : `${toPersianDigits(String(r.breakEvenUnits))} عدد فروش`}
سود سالانهٔ برآوردی: ${formatNumber(r.annualNetProfit)} تومان`;
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

  // سقف اسلایدرها — عدد گرد و بالاتر از مقدار فعلی
  const priceMax = Math.max(1_000_000, Math.ceil((price * 1.5) / 100_000) * 100_000);
  const costMax = Math.max(1_000_000, Math.ceil((unitCost * 1.5) / 100_000) * 100_000);
  const qtyMax = Math.max(2_000, Math.ceil((qty * 1.5) / 100) * 100);
  const fixedMax = Math.max(200_000_000, Math.ceil((fixedCosts * 1.5) / 10_000_000) * 10_000_000);

  return (
    <div ref={bodyRef} dir="rtl" style={accentStyle(accentColor)} className="mx-auto w-full max-w-xl bg-background px-3 py-4 sm:px-4">
      {/* هدر برند */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <a href={`${appBaseUrl}/calculators`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="text-xs font-extrabold text-foreground">{brandName}</span>
        </a>
        <a
          href={`${appBaseUrl}/pricing`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary transition-all hover:bg-primary/15 active:scale-[0.97]"
        >
          گزارش سود خودکار هوش
          <ArrowLeft className="h-3 w-3" aria-hidden />
        </a>
      </div>

      {/* عنوان */}
      <div className="mb-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h1 className="text-sm font-extrabold text-foreground">ماشین‌حساب سود و حاشیه سود</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          قیمت فروش، بهای تمام‌شده و تعداد فروش ماهانه را وارد کنید؛ سود ناخالص و خالص،
          حاشیه‌ها، نقطهٔ سربه‌سر و سود سالانه را لحظه‌ای ببینید.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">به‌روزرسانی لحظه‌ای</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">سه سناریوی فروش</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">بدون ثبت‌نام</span>
        </div>
      </div>

      {/* فرم — ورودی‌های مدل سود */}
      <p className="mb-2 mt-1 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        مدل قیمت و فروش
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="space-y-3">
        <SliderField label="قیمت فروش واحد" value={price} onChange={setPrice} min={0} max={priceMax} step={10_000} unit="تومان" />
        <SliderField label="بهای تمام‌شدهٔ واحد" value={unitCost} onChange={setUnitCost} min={0} max={costMax} step={10_000} unit="تومان" />
        <SliderField label="تعداد فروش ماهانه" value={qty} onChange={setQty} min={0} max={qtyMax} step={5} unit="عدد" />
        <SliderField label="هزینه‌های ثابت ماهانه" value={fixedCosts} onChange={setFixedCosts} min={0} max={fixedMax} step={1_000_000} unit="تومان" />
        <div className="grid grid-cols-2 gap-3">
          <AmountField label="کارمزد/پورسانت (اختیاری)" value={commissionRate} onChange={setCommissionRate} hint="درصد" />
          <div className="flex items-end">
            <div className="w-full rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Info className="h-3 w-3" aria-hidden />
                سهم هر فروش از سود: {formatNumber(r.contributionPerUnit)} تومان
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* نتایج */}
      <p className="mb-2 mt-5 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        سود و حاشیه (ماهانه)
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
        <p className="mb-2 text-[11px] font-black text-primary">تحلیل سود ماهانه</p>
        <ResultRow label="فروش ماهانه" value={`${formatNumber(r.revenue)} ت`} />
        <ResultRow label="سود ناخالص ماهانه" value={`${formatNumber(r.grossProfit)} ت`} tone={r.grossProfit >= 0 ? "success" : "danger"} />
        <ResultRow label="حاشیهٔ ناخالص" value={`${formatNumber(r.grossMarginPct, 1)}٪`} />
        {r.commission > 0 && <ResultRow label="کارمزد/پورسانت" value={`${formatNumber(r.commission)} ت`} tone="danger" />}
        <ResultRow label="سود خالص ماهانه" value={`${formatNumber(r.netProfit)} ت`} tone={r.netProfit >= 0 ? "success" : "danger"} strong />
        <ResultRow label="حاشیهٔ خالص" value={`${formatNumber(r.netMarginPct, 1)}٪`} />
        <div className="my-2 h-px bg-gradient-to-l from-primary/30 via-border to-transparent" />
        <ResultRow
          label="نقطهٔ سربه‌سر (تعداد فروش)"
          value={r.breakEvenUnits === null ? "با این قیمت‌ها ممکن نیست" : `${toPersianDigits(String(r.breakEvenUnits))} عدد`}
          tone="primary"
        />
        <ResultRow label="سود سالانهٔ برآوردی" value={`${formatCompactToman(r.annualNetProfit)}`} strong />
      </div>

      {/* جدول سناریوها */}
      <p className="mb-2 mt-5 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        سناریوهای فروش
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-[11px]">
          <caption className="sr-only">سود خالص ماهانه در سه سناریوی فروش</caption>
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th scope="col" className="px-3 py-2 text-right font-bold">سناریو</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">تعداد فروش</th>
              <th scope="col" className="px-3 py-2 text-left font-bold">سود خالص ماهانه</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              const profit = netProfitAtQty(input, s.qty);
              const tone = s.delta < 0 ? "text-rose-600 dark:text-rose-400" : s.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground font-black";
              return (
                <tr key={s.label} className="border-t border-border/60">
                  <td className="px-3 py-2 text-foreground">{s.label}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{toPersianDigits(String(s.qty))}</td>
                  <td className={`px-3 py-2 text-left tabular-nums ${tone}`}>{formatNumber(profit)} تومان</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
          {copied ? "کپی شد!" : "کپی خلاصهٔ تحلیل"}
        </button>
        <a
          href={`${appBaseUrl}/blog/business-budgeting-guide`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.98]"
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden />
          راهنمای بودجه‌بندی کسب‌وکار
        </a>
      </div>

      {/* فوتر */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="text-[9px] leading-relaxed text-muted-foreground">
          برآورد ساده بر پایهٔ مدل قیمت‌گذاری واحد است؛ مالیات و سایر اقلام در ماژول گزارش سود هوش محاسبه می‌شود.
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
