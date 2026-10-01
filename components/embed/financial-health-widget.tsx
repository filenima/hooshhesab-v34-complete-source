"use client";

/**
 * FinancialHealthWidget — ویجت قابل embed سنجش سریع سلامت مالی (v28)
 * ----------------------------------------------------------------------------
 * نسخهٔ ۵ پرسشی و فشردهٔ ابزار کامل /financial-health (۱۰ پرسشی) برای سایت‌های
 * شرکا: حسابداران، اپراتورهای کسب‌وکار، شتاب‌دهنده‌ها و پرتال‌های صنفی.
 *
 *   <iframe src="https://SITE/embed/financial-health" style="width:100%;height:640px;border:0" loading="lazy"></iframe>
 *
 * امتیاز ۰..۱۰۰ با همان منطق اصلی (خیر=۰ / تا حدی=۱ / بله=۲) + گیج
 * نیم‌دایره‌ای + دو توصیهٔ برتر + CTA به سنجش کامل.
 *
 * postMessage: نوع "hoosh:health:height" — مثل بقیهٔ ویجت‌ها برای تنظیم
 * خودکار ارتفاع iframe توسط میزبان.
 */

import * as React from "react";
import { Sparkle, HeartPulse, ArrowLeft, RotateCcw, ShieldCheck } from "lucide-react";
import { toPersianDigits } from "@/lib/persian";
import { accentStyle, type EmbedAccent } from "@/lib/embed-theme";

interface FinancialHealthWidgetProps {
  appBaseUrl: string;
  brandName: string;
  logoUrl?: string;
  /** v29 — رنگ لهجهٔ برند شرکا (پارامتر ?color=) */
  accentColor?: EmbedAccent | null;
}

/* ---------------- ۵ پرسش منتخب (مهم‌ترین‌ها از نسخهٔ ۱۰ پرسشی) ---------------- */

interface MiniQuestion {
  id: string;
  title: string;
  hint: string;
  fix: string; // توصیهٔ کوتاه وقتی جواب «خیر» است
}

const MINI_QUESTIONS: MiniQuestion[] = [
  {
    id: "separation",
    title: "حساب بانکی کسب‌وکار از حساب شخصی جدا است؟",
    hint: "تراکنش‌های شخصی و کاری از یک حساب عبور نمی‌کنند",
    fix: "یک حساب مجزا برای کسب‌وکار باز کنید؛ حساب مخلوط یعنی خطای مالیاتی و دردسر ممیزی.",
  },
  {
    id: "moadian",
    title: "برای تمام فروش‌ها صورتحساب مودیان صادر می‌کنید؟",
    hint: "الزام قانون پایانه‌های فروشگاهی",
    fix: "عدم صدور صورتحساب الکترونیکی مشمول جرایم ماده ۱۶۹ می‌شود.",
  },
  {
    id: "recording",
    title: "تراکنش‌ها را روزانه یا هفتگی ثبت می‌کنید؟",
    hint: "نه پایان ماه به‌صورت دسته‌ای",
    fix: "ثبت دیرهنگام یعنی فراموشی و گزارش بی‌اعتبار؛ ثبت روزانه چند دقیقه بیشتر طول نمی‌کشد.",
  },
  {
    id: "cashflow",
    title: "جریان نقدی ۳۰ روز آینده را پیش‌بینی می‌کنید؟",
    hint: "اطمینان از وجود پول سر موعد چک/قسط",
    fix: "بیشتر کسب‌وکارهای سالم به‌خاطر نقدینگی ورشکست می‌شوند، نه ضرر.",
  },
  {
    id: "reporting",
    title: "گزارش سود و زیان را ماهانه می‌بینید؟",
    hint: "نه فقط پایان سال برای اظهارنامه",
    fix: "تصمیم ماه‌هاست که فرصت اصلاح می‌دهد؛ گزارش سالانه فقط کالبدشکافی است.",
  },
];

const OPTIONS: { label: string; score: 0 | 1 | 2; tone: "rose" | "amber" | "emerald" }[] = [
  { label: "خیر", score: 0, tone: "rose" },
  { label: "تا حدی", score: 1, tone: "amber" },
  { label: "بله", score: 2, tone: "emerald" },
];

const TONE_CLASS: Record<string, string> = {
  rose: "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60",
  amber:
    "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60",
  emerald:
    "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60",
};

interface Grade {
  label: string;
  color: string;
  hex: string;
  desc: string;
}

function gradeFor(score: number): Grade {
  if (score >= 80)
    return {
      label: "عالی",
      color: "text-emerald-600 dark:text-emerald-400",
      hex: "#059669",
      desc: "کسب‌وکار شما از نظر مالی سازمان‌یافته است؛ حالا وقت رشد است، نه ترمیم.",
    };
  if (score >= 60)
    return {
      label: "خوب",
      color: "text-teal-600 dark:text-teal-400",
      hex: "#0d9488",
      desc: "پایه‌های مالی محکم است اما چند حفرهٔ مشخص، ریسک و پول شما را قفل کرده است.",
    };
  if (score >= 40)
    return {
      label: "متوسط",
      color: "text-amber-600 dark:text-amber-400",
      hex: "#d97706",
      desc: "بین نظم و آشفتگی هستید؛ بدون سیستم‌سازی، با رشد، مشکلات هم رشد می‌کنند.",
    };
  return {
    label: "نیازمند اقدام فوری",
    color: "text-rose-600 dark:text-rose-400",
    hex: "#e11d48",
    desc: "ساختار مالی در معرض ریسک جدی است — از جرایم مالیاتی تا خفه‌شدن نقدینگی.",
  };
}

/* ---------------- گیج نیم‌دایره (مینیاتور ویجت اصلی) ---------------- */

function MiniGauge({ score, hex }: { score: number; hex: string }) {
  const [animated, setAnimated] = React.useState(0);
  React.useEffect(() => {
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

  const R = 62;
  const CX = 86;
  const CY = 80;
  const arcLen = Math.PI * R;
  const offset = arcLen * (1 - animated / 100);

  return (
    <div className="relative mx-auto w-[172px] select-none" dir="ltr">
      <svg viewBox="0 0 172 92" className="w-full overflow-visible">
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke={hex}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 120ms linear" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-3xl font-extrabold tabular-nums tracking-tight" dir="rtl">
          {toPersianDigits(String(animated))}
          <span className="text-sm text-muted-foreground">/۱۰۰</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ویجت اصلی ---------------- */

export function FinancialHealthWidget({ appBaseUrl, brandName, logoUrl, accentColor }: FinancialHealthWidgetProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [step, setStep] = React.useState(0); // 0..4 پرسش، 5 = نتیجه
  const [answers, setAnswers] = React.useState<Record<string, 0 | 1 | 2>>({});

  // همگام‌سازی ارتفاع با میزبان iframe
  React.useEffect(() => {
    const send = () => {
      try {
        const h = Math.ceil(
          bodyRef.current?.getBoundingClientRect().height ?? document.documentElement.scrollHeight
        );
        parent?.postMessage({ type: "hoosh:health:height", height: h }, "*");
      } catch {
        /* sandbox سخت‌گیر — نادیده */
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

  // beacon ثبت بازدید (تحلیل کانال شرکا — fire-and-forget)
  React.useEffect(() => {
    try {
      const url = "/api/widgets/track?widget=financial-health";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        void fetch(url, { method: "POST", keepalive: true, mode: "no-cors" }).catch(() => {});
      }
    } catch {
      /* آمار هرگز UX را خراب نکند */
    }
  }, []);

  const answered = Object.keys(answers).length;
  const score = Math.round(
    (MINI_QUESTIONS.reduce((s, q) => s + (answers[q.id] ?? 0), 0) / (MINI_QUESTIONS.length * 2)) * 100
  );
  const grade = gradeFor(score);

  // دو حفرهٔ برتر = پرسش‌های با بدترین پاسخ که «خیر» یا «تا حدی» دارند
  const topGaps = MINI_QUESTIONS.filter((q) => (answers[q.id] ?? 2) < 2)
    .sort((a, b) => (answers[a.id] ?? 0) - (answers[b.id] ?? 0))
    .slice(0, 2);

  const restart = () => {
    setAnswers({});
    setStep(0);
  };

  const q = MINI_QUESTIONS[step];

  return (
    <div ref={bodyRef} style={accentStyle(accentColor)} className="min-h-[420px] bg-background px-3 py-4 text-foreground sm:px-5 sm:py-5">
      {/* هدر مینیمال برند */}
      <header className="mb-3 flex items-center justify-between gap-3">
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
        <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <HeartPulse className="h-3 w-3 text-rose-500" aria-hidden />
          سنجش سریع سلامت مالی
        </span>
      </header>

      {/* نوار پیشرفت پلکانی */}
      {step < MINI_QUESTIONS.length && (
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              پرسش {toPersianDigits(String(step + 1))} از {toPersianDigits(String(MINI_QUESTIONS.length))}
            </span>
            <span className="tnum">
              {toPersianDigits(String(Math.round((answered / MINI_QUESTIONS.length) * 100)))}٪ تکمیل
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(answered / MINI_QUESTIONS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* حالت پرسش */}
      {step < MINI_QUESTIONS.length && q && (
        <div className="space-y-3">
          {/* کارت پرسش */}
          <div key={q.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-extrabold leading-7">{q.title}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{q.hint}</p>
          </div>

          {/* گزینه‌ها */}
          <div className="grid grid-cols-3 gap-2">
            {OPTIONS.map((opt) => {
              const selected = answers[q.id] === opt.score;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, [q.id]: opt.score }));
                    // مکث کوتاه برای دیدن انتخاب، بعد پرسش بعدی
                    window.setTimeout(() => setStep((s) => Math.min(s + 1, MINI_QUESTIONS.length)), 260);
                  }}
                  className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition-all active:scale-95 ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : TONE_CLASS[opt.tone]
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* حالت نتیجه */}
      {step >= MINI_QUESTIONS.length && (
        <div className="space-y-5">
          {/* گیج + توصیف */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <MiniGauge score={score} hex={grade.hex} />
            <p className={`mt-1 text-center text-sm font-extrabold ${grade.color}`}>{grade.label}</p>
            <p className="mx-auto mt-2 max-w-[34ch] text-center text-[11px] leading-6 text-muted-foreground">
              {grade.desc}
            </p>
          </div>

          {/* دو حفرهٔ برتر */}
          {topGaps.length > 0 && (
            <div className="space-y-2.5">
              <p className="flex items-center gap-1.5 border-t border-border/60 pt-3 text-[11px] font-extrabold text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                اولویت‌های اصلاح شما
              </p>
              {topGaps.map((g, i) => (
                <div
                  key={g.id}
                  className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-[11px] leading-6 text-foreground"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[10px] font-extrabold text-primary tnum">
                    {toPersianDigits(String(i + 1))}
                  </span>
                  <span>{g.fix}</span>
                </div>
              ))}
            </div>
          )}
          {topGaps.length === 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-300/60 bg-emerald-50 p-3.5 text-[11px] font-bold leading-6 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>همهٔ پرسش‌ها را کامل پاسخ گفتید — سازمان‌یافتگی مالی نمونه. برای رشد، نسخهٔ کامل ۱۰ پرسشی را ببینید.</span>
            </div>
          )}

          {/* CTA سنجش کامل */}
          <a
            href={`${appBaseUrl}/financial-health`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
          >
            سنجش کامل ۱۰ پرسشی + توصیه‌های اختصاصی
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
          </a>

          <button
            type="button"
            onClick={restart}
            className="mx-auto flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-primary"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            انجام دوباره
          </button>
        </div>
      )}

      {/* فوتر مینیمال */}
      <footer className="mt-4 text-center text-[10px] leading-5 text-muted-foreground/80">
        <a
          href={`${appBaseUrl}/financial-health`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
        >
          ابزار کامل سلامت مالی در {brandName}
        </a>
      </footer>
    </div>
  );
}
