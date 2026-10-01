"use client";

/**
 * DepreciationCalculatorWidget — ویجت قابل embed استهلاک (v34)
 * ----------------------------------------------------------------------------
 * ویجت هفتم کانال شرکا — ماشین‌حساب استهلاک دارایی:
 * بهای تمام‌شده + ارزش اسقاط + عمر مفید + روش (مستقیم / نزولی ۲ برابری)
 * → جدول کامل سال‌به‌سال (استهلاک سال، هزینهٔ انباشته، ارزش دفتری پایان سال)
 * + جمع کل + یادداشت مالیاتی ایران (مادهٔ ۱۴۹ ق.م.م).
 *
 *   <iframe src="https://SITE/embed/depreciation-calculator" style="width:100%;height:820px;border:0" loading="lazy" title="ماشین‌حساب استهلاک"></iframe>
 *
 * همهٔ محاسبات سمت کلاینت و لحظه‌ای است.
 * postMessage: نوع "hoosh:depreciation:height" (الگوی ویجت‌های قبلی).
 */

import * as React from "react";
import { Copy, Check, Building2, Scale, ArrowLeft, Info } from "lucide-react";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { accentStyle, type EmbedAccent } from "@/lib/embed-theme";

interface DepreciationCalculatorWidgetProps {
  appBaseUrl: string;
  brandName: string;
  logoUrl?: string;
  /** v34 — رنگ لهجهٔ برند شرکا (پارامتر ?color=) */
  accentColor?: EmbedAccent | null;
}

/* ---------------- هستهٔ محاسبه ---------------- */

type Method = "straight" | "ddb";

interface DepRow {
  year: number; // سال شمارهٔ n (۱..usefulLife)
  depreciation: number; // استهلاک همان سال
  accumulated: number; // هزینهٔ انباشته تا پایان سال
  bookValue: number; // ارزش دفتری پایان سال
}

function calcDepreciation(cost: number, salvage: number, life: number, method: Method): DepRow[] {
  const safeCost = Math.max(0, cost);
  const safeSalvage = Math.min(Math.max(0, salvage), safeCost);
  const safeLife = Math.max(1, Math.min(50, Math.round(life)));

  const rows: DepRow[] = [];
  const depreciableBase = safeCost - safeSalvage;

  if (method === "straight") {
    const yearly = Math.round(depreciableBase / safeLife);
    let accumulated = 0;
    let allocated = 0;
    for (let y = 1; y <= safeLife; y++) {
      // سال آخر: باقیمانده دقیق تخصیص می‌شود تا جمع = پای استهلاک
      const dep = y === safeLife ? depreciableBase - allocated : yearly;
      allocated += dep;
      accumulated += dep;
      rows.push({ year: y, depreciation: dep, accumulated, bookValue: safeCost - accumulated });
    }
    return rows;
  }

  // نزولی ۲ برابری (Double Declining Balance)
  const rate = 2 / safeLife;
  let accumulated = 0;
  let remaining = safeCost;
  for (let y = 1; y <= safeLife; y++) {
    let dep = Math.round(remaining * rate);
    // هرگز به زیر ارزش اسقاط نرود
    if (remaining - dep < safeSalvage) {
      dep = Math.max(0, remaining - safeSalvage);
    }
    remaining -= dep;
    accumulated += dep;
    rows.push({ year: y, depreciation: dep, accumulated, bookValue: remaining });
  }
  return rows;
}

/* ---------------- ورودی‌ها ---------------- */

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

/* ---------------- ویجت ---------------- */

export function DepreciationCalculatorWidget({ appBaseUrl, brandName, logoUrl, accentColor }: DepreciationCalculatorWidgetProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [cost, setCost] = React.useState(600_000_000);
  const [salvage, setSalvage] = React.useState(60_000_000);
  const [life, setLife] = React.useState(5);
  const [method, setMethod] = React.useState<Method>("straight");

  const rows = React.useMemo(() => calcDepreciation(cost, salvage, life, method), [cost, salvage, life, method]);
  const totalDepreciation = rows.length ? rows[rows.length - 1].accumulated : 0;

  // همگام‌سازی ارتفاع با میزبان iframe
  React.useEffect(() => {
    const send = () => {
      try {
        const h = Math.ceil(
          bodyRef.current?.getBoundingClientRect().height ?? document.documentElement.scrollHeight
        );
        parent?.postMessage({ type: "hoosh:depreciation:height", height: h }, "*");
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
      const url = "/api/widgets/track?widget=depreciation-calculator";
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
    const text = `جدول استهلاک — ${brandName}
بهای تمام‌شده: ${formatNumber(cost)} تومان
ارزش اسقاط: ${formatNumber(salvage)} تومان
عمر مفید: ${toPersianDigits(String(life))} سال
روش: ${method === "straight" ? "مستقیم" : "نزولی ۲ برابری"}
جمع استهلاک: ${formatNumber(totalDepreciation)} تومان
ارزش دفتری پایان دوره: ${formatNumber(cost - totalDepreciation)} تومان`;
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

  const costMax = Math.max(2_000_000_000, Math.ceil((cost * 1.5) / 100_000_000) * 100_000_000);
  const salvageMax = Math.max(cost, Math.ceil((salvage * 1.5) / 10_000_000) * 10_000_000);

  return (
    <div ref={bodyRef} dir="rtl" style={accentStyle(accentColor)} className="mx-auto w-full max-w-xl bg-background px-3 py-4 sm:px-4">
      {/* هدر برند */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <a href={`${appBaseUrl}/calculators`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="text-xs font-extrabold text-foreground">{brandName}</span>
        </a>
        <a
          href={`${appBaseUrl}/pricing`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary transition-all hover:bg-primary/15 active:scale-[0.97]"
        >
          ثبت خودکار استهلاک در هوش
          <ArrowLeft className="h-3 w-3" aria-hidden />
        </a>
      </div>

      {/* عنوان */}
      <div className="mb-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h1 className="text-sm font-extrabold text-foreground">ماشین‌حساب استهلاک دارایی</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          مشخصات دارایی را وارد کنید؛ جدول کامل استهلاک سال‌به‌سال با هزینهٔ انباشته و ارزش دفتری
          را لحظه‌ای ببینید — روش مستقیم و نزولی ۲ برابری.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">جدول سال‌به‌سال</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">مادهٔ ۱۴۹ ق.م.م</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">بدون ثبت‌نام</span>
        </div>
      </div>

      {/* فرم */}
      <p className="mb-2 mt-1 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        مشخصات دارایی
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="space-y-3">
        <SliderField label="بهای تمام‌شدهٔ دارایی" value={cost} onChange={setCost} min={0} max={costMax} step={10_000_000} unit="تومان" />
        <SliderField label="ارزش اسقاط" value={salvage} onChange={setSalvage} min={0} max={salvageMax} step={1_000_000} unit="تومان" />
        <SliderField label="عمر مفید" value={life} onChange={setLife} min={1} max={20} step={1} unit="سال" />
        <div
          role="radiogroup"
          aria-label="روش استهلاک"
          className="grid grid-cols-2 gap-2"
        >
          {(
            [
              { id: "straight" as Method, label: "روش مستقیم" },
              { id: "ddb" as Method, label: "نزولی ۲ برابری" },
            ]
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              onClick={() => setMethod(m.id)}
              className={`h-11 rounded-xl border px-3 text-[11px] font-bold transition-all active:scale-[0.98] ${
                method === m.id
                  ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* خلاصه */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">جمع استهلاک دوره</p>
          <p className="mt-0.5 text-xs font-black tabular-nums text-primary">{formatCompactToman(totalDepreciation)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">ارزش دفتری پایان دوره</p>
          <p className="mt-0.5 text-xs font-black tabular-nums text-foreground">{formatCompactToman(cost - totalDepreciation)}</p>
        </div>
      </div>

      {/* جدول سال‌به‌سال */}
      <p className="mb-2 mt-5 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        جدول استهلاک سال‌به‌سال
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-[11px]">
          <caption className="sr-only">استهلاک، هزینهٔ انباشته و ارزش دفتری هر سال</caption>
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th scope="col" className="px-2.5 py-2 text-right font-bold">سال</th>
              <th scope="col" className="px-2.5 py-2 text-left font-bold">استهلاک سال</th>
              <th scope="col" className="px-2.5 py-2 text-left font-bold">هزینهٔ انباشته</th>
              <th scope="col" className="px-2.5 py-2 text-left font-bold">ارزش دفتری</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year} className="border-t border-border/60 odd:bg-muted/20">
                <td className="px-2.5 py-2 text-center font-bold text-foreground">{toPersianDigits(String(row.year))}</td>
                <td className="px-2.5 py-2 text-left tabular-nums text-foreground">{formatNumber(row.depreciation)}</td>
                <td className="px-2.5 py-2 text-left tabular-nums text-muted-foreground">{formatNumber(row.accumulated)}</td>
                <td className="px-2.5 py-2 text-left tabular-nums text-primary">{formatNumber(row.bookValue)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-primary/25 bg-primary/[0.06]">
              <td className="px-2.5 py-2 text-center font-black text-foreground">جمع</td>
              <td className="px-2.5 py-2 text-left font-black tabular-nums text-primary">{formatNumber(totalDepreciation)}</td>
              <td colSpan={2} className="px-2.5 py-2 text-left text-[10px] text-muted-foreground">تومان — پایان عمر مفید</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* یادداشت مالیاتی */}
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
        <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="text-[10px] leading-relaxed text-foreground/80">
          <span className="font-bold">یادداشت مالیاتی:</span> در ایران ملاک محاسبهٔ استهلاک برای تشخیص
          درآمد مشمول مالیات، <span className="font-bold">روش استهلاک مستقیم</span> است
          (تبصرهٔ ۱ مادهٔ ۱۴۹ قانون مالیات‌های مستقیم). روش نزولی برای گزارش مدیریتی و تصمیم‌های
          داخلی کاربرد دارد و هزینهٔ استهلاک آن در دفاتر مالیاتی به‌عنوان هزینهٔ قابل قبول پذیرفته نمی‌شود.
        </p>
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
          {copied ? "کپی شد!" : "کپی خلاصهٔ جدول"}
        </button>
        <a
          href={`${appBaseUrl}/blog/business-budgeting-guide`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.98]"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          راهنمای هزینه‌ها و بودجه
        </a>
      </div>

      {/* فوتر */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="text-[9px] leading-relaxed text-muted-foreground">
          عمر مفید انواع دارایی (مبانی، ماشین‌آلات، وسایل نقلیه) طبق جدول‌های سازمان امور مالیاتی متفاوت است.
        </p>
        <a
          href={`${appBaseUrl}/partners`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-[9px] font-bold text-primary transition-opacity hover:opacity-80"
        >
          <Building2 className="h-3 w-3" aria-hidden />
          ویجت رایگان برای سایت شما
        </a>
      </div>
    </div>
  );
}
