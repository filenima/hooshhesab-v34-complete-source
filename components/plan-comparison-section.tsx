"use client";

/**
 * PlanComparisonSection — مقایسهٔ تعاملی پلن‌های هوش (v25)
 * ----------------------------------------------------------------------------
 * دو ابزار در یک صفحه:
 *  ۱) ماتریس مقایسهٔ ۳ پلن × ~۳۵ قابلیت در ۸ گروه:
 *     - قیمت‌ها داینامیک از useEffectivePlans (قابل‌ویرایش سوپرادمین)
 *     - سوییچ «فقط تفاوت‌ها» — ردیف‌های یکسان جمع می‌شوند
 *     - گروه‌های accordion با آیکن + شمارنده
 *     - سلول‌های سه‌نوعه: بول (✓/—)، عدد (+ نامحدود)، متن
 *  ۲) «کدام پلن برای من؟» — ۴ پرسش → پلن پیشنهادی + دلیل + CTA
 *
 * هم در /compare-plans (SSR سئو) و هم قابل استفاده مستقل.
 */

import * as React from "react";
import {
  Users,
  BookOpenCheck,
  ShieldCheck,
  Sparkles,
  Store,
  Users2,
  Server,
  LifeBuoy,
  Check,
  Minus,
  Infinity as InfinityIcon,
  ChevronDown,
  Scale,
  Sparkle,
  ArrowLeft,
  RotateCcw,
  HelpCircle,
  Share2,
  Check as CheckIcon,
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
import {
  toPersianDigits,
  formatNumber,
  formatCompactToman,
} from "@/lib/persian";
import { useEffectivePlans } from "@/hooks/use-effective-plans";
import {
  COMPARISON_GROUPS,
  PLAN_QUIZ,
  recommendPlan,
  TOTAL_COMPARISON_ROWS,
  type CellValue,
} from "@/lib/plan-comparison-data";

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  BookOpenCheck,
  ShieldCheck,
  Sparkles,
  Store,
  Users2,
  Server,
  LifeBuoy,
};

/* ------------------------------------------------------------------ */
/* رندر سلول ماتریس                                                     */
/* ------------------------------------------------------------------ */

function Cell({ value }: { value: CellValue }) {
  if (value.kind === "bool") {
    return value.ok ? (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" aria-label="دارد">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    ) : (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground/50" aria-label="ندارد">
        <Minus className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (value.kind === "number") {
    if (value.unlimited) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-primary" title="نامحدود">
          <InfinityIcon className="h-4 w-4" />
          نامحدود
        </span>
      );
    }
    return (
      <span className="tabular-nums font-semibold text-foreground">
        {toPersianDigits(formatNumber(value.value))}
        {value.suffix ? <span className="mr-1 text-[11px] font-normal text-muted-foreground">{value.suffix}</span> : null}
      </span>
    );
  }
  return <span className="text-[12px] font-medium text-foreground/90">{value.label}</span>;
}

/** آیا هر سه سلول ردیف یکسان‌اند؟ (برای سوییچ «فقط تفاوت‌ها») */
function rowUniform(cells: [CellValue, CellValue, CellValue]): boolean {
  const [a, b, c] = cells;
  if (a.kind !== b.kind || b.kind !== c.kind) return false;
  if (a.kind === "bool") return a.ok === b.ok && b.ok === c.ok;
  if (a.kind === "number") {
    const bb = b as { kind: "number"; value: number; unlimited?: boolean };
    const cc = c as { kind: "number"; value: number; unlimited?: boolean };
    return a.value === bb.value && !!a.unlimited === !!bb.unlimited && a.value === cc.value && !!a.unlimited === !!cc.unlimited;
  }
  const bb = b as { kind: "text"; label: string };
  const cc = c as { kind: "text"; label: string };
  return a.label === bb.label && a.label === cc.label;
}

/* ------------------------------------------------------------------ */
/* بخش ۱: ماتریس مقایسه                                                */
/* ------------------------------------------------------------------ */

function ComparisonMatrix({ onOpenPricing }: { onOpenPricing?: () => void }) {
  const { visiblePlans } = useEffectivePlans();
  const [diffOnly, setDiffOnly] = React.useState(false);
  const [openGroups, setOpenGroups] = React.useState<string[]>(
    COMPARISON_GROUPS.map((g) => g.id)
  );

  // v25 — راهنمای اسکرول افقی موبایل: وقتی جدول سرریز دارد و در ابتدای اسکرول است
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [hint, setHint] = React.useState(false);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const overflows = el.scrollWidth > el.clientWidth + 4;
      // RTL: scrollLeft=0 ابتداست (راست)؛ منفی‌شدن یعنی به انتها (چپ) رفته
      const atStart = el.scrollLeft === 0;
      setHint(overflows && atStart);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const plan = (id: string) => visiblePlans.find((p) => p.id === id);

  const toggleGroup = React.useCallback((id: string) => {
    setOpenGroups((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  // در حالت «فقط تفاوت‌ها» گروه‌هایی که همهٔ ردیف‌هایشان یکسان است مخفی می‌شوند
  const groups = COMPARISON_GROUPS.map((g) => ({
    ...g,
    rows: diffOnly ? g.rows.filter((r) => !rowUniform(r.cells)) : g.rows,
  })).filter((g) => g.rows.length > 0);

  const uniformCount = COMPARISON_GROUPS.reduce(
    (sum, g) => sum + g.rows.filter((r) => rowUniform(r.cells)).length,
    0
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm backdrop-blur-sm">
        {/* هدر جدول — قیمت‌های واقعی */}
        <div
          ref={scrollRef}
          className={`compare-matrix-scroll overflow-x-auto ${hint ? "show-scroll-hint" : ""}`}
        >
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="w-[34%] p-4 text-right text-xs font-semibold text-muted-foreground">
                  قابلیت
                </th>
                {(["basic", "pro", "enterprise"] as const).map((id) => {
                  const p = plan(id);
                  if (!p) return <th key={id} className="p-4" />;
                  return (
                    <th key={id} className={`relative p-4 text-center ${id === "pro" ? "bg-primary/[0.06]" : ""}`}>
                      {p.popular && (
                        <span className="absolute -top-0.5 right-1/2 translate-x-1/2 rounded-b-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground">
                          محبوب‌ترین
                        </span>
                      )}
                      <div className="mt-1 text-sm font-bold text-foreground">{p.name}</div>
                      <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        {p.priceToman > 0 ? (
                          <>
                            {toPersianDigits(formatNumber(p.priceToman))} تومان
                            <span className="block text-[10px] opacity-75">
                              سالانه · {formatCompactToman(Math.round(p.priceToman / 365))}/روز
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const Icon = GROUP_ICONS[g.icon] ?? Scale;
                const open = openGroups.includes(g.id) || !diffOnly;
                return (
                  <React.Fragment key={g.id}>
                    {/* سطر گروه — دکمهٔ باز/بسته */}
                    <tr
                      className={`cursor-pointer select-none border-y border-border bg-muted/25 transition-colors hover:bg-muted/45 ${
                        diffOnly ? "" : "cursor-default"
                      }`}
                      onClick={() => !diffOnly && toggleGroup(g.id)}
                    >
                      <td colSpan={4} className="p-3">
                        <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                          {diffOnly ? (
                            <Icon className="h-4 w-4 text-primary" />
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleGroup(g.id); }}
                              className="flex items-center gap-2"
                              aria-expanded={open}
                              aria-label={`گروه ${g.title}`}
                            >
                              <Icon className="h-4 w-4 text-primary" />
                              {g.title}
                              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
                            </button>
                          )}
                          {diffOnly && <span>{g.title}</span>}
                          <span className="mr-auto rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {toPersianDigits(String(g.rows.length))} قابلیت
                          </span>
                        </span>
                      </td>
                    </tr>
                    {open &&
                      g.rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-border/60 transition-colors hover:bg-muted/20"
                        >
                          <td className="p-3.5 text-right">
                            <span className="flex items-center gap-1.5 text-[13px] text-foreground/90">
                              {r.label}
                              {r.hint ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label={`راهنمای ${r.label}`}
                                      className="text-muted-foreground/60 transition-colors hover:text-primary"
                                    >
                                      <HelpCircle className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-52 text-right text-xs leading-relaxed">
                                    {r.hint}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </span>
                          </td>
                          {r.cells.map((c, i) => (
                            <td
                              key={i}
                              className={`p-3.5 text-center ${i === 1 ? "bg-primary/[0.04]" : ""}`}
                            >
                              <Cell value={c} />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
              {/* سطر پایانی CTA */}
              <tr className="border-t-2 border-border bg-muted/30">
                <td className="p-4 text-xs text-muted-foreground">
                  تریال {toPersianDigits(3)} روزهٔ رایگان — بدون کارت بانکی
                </td>
                {(["basic", "pro", "enterprise"] as const).map((id, i) => (
                  <td key={id} className="p-4 text-center">
                    <Button
                      size="sm"
                      variant={id === "pro" ? "default" : "outline"}
                      className={`gap-1 ${id === "pro" ? "shadow-md shadow-primary/25" : ""}`}
                      onClick={onOpenPricing}
                    >
                      {i === 2 ? "تماس با فروش" : "شروع رایگان"}
                      {i !== 2 && <ArrowLeft className="h-3.5 w-3.5" />}
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* سوییچ فقط تفاوت‌ها */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 p-3.5">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-muted-foreground">
            <button
              type="button"
              role="switch"
              aria-checked={diffOnly}
              onClick={() => setDiffOnly((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                diffOnly ? "bg-primary" : "bg-muted-foreground/25"
              }`}
            >
              <span
                className={`absolute h-4 w-4 rounded-full bg-background shadow transition-all duration-200 ${
                  diffOnly ? "right-0.5" : "right-4.5"
                }`}
                style={{ right: diffOnly ? "2px" : "18px" }}
              />
            </button>
            فقط تفاوت‌ها را نشان بده
            <span className="text-[10px] text-muted-foreground/70">
              ({toPersianDigits(String(uniformCount))} قابلیت مشترک از {toPersianDigits(String(TOTAL_COMPARISON_ROWS))})
            </span>
          </label>
          <span className="text-[10px] text-muted-foreground/70">
            قیمت‌ها از تنظیمات زندهٔ پلتفرم خوانده می‌شوند
          </span>
        </div>
      </Card>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/* بخش ۲: کدام پلن برای من؟ (کیویز ۴ پرسشی)                            */
/* ------------------------------------------------------------------ */

// v26 — برای صفحهٔ ویجت قابل embed در /embed/plan-quiz هم export شده است
export function PlanQuiz({ onOpenPricing }: { onOpenPricing?: () => void }) {
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<number[]>(Array(PLAN_QUIZ.length).fill(-1));
  const [copied, setCopied] = React.useState(false);
  const done = answers.every((a) => a >= 0);
  const result = React.useMemo(
    () => (done ? recommendPlan(answers) : null),
    [done, answers]
  );

  // v26 — لینک اشتراک‌گذاری نتیجه: اگر ?quiz=XXXX در URL باشد (رقم = ایندکس پاسخ هر پرسش)،
  // پاسخ‌ها از لینک بازیابی و نتیجه بلافاصله نمایش داده می‌شود.
  React.useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("quiz");
      if (q && /^[0-2]{4}$/.test(q)) {
        const restored = q.split("").map(Number);
        setAnswers(restored);
        setStep(PLAN_QUIZ.length - 1);
      }
    } catch {
      /* URL parsing نبود window — نادیده */
    }
  }, []);

  const shareResult = React.useCallback(async () => {
    const url = `${window.location.origin}/compare-plans?quiz=${answers.join("")}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard مسدود — fallback: انتخاب دستی */
      window.prompt("این لینک را کپی کنید:", url);
    }
  }, [answers]);

  const pick = React.useCallback((optIdx: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[step] = optIdx;
      return next;
    });
    window.setTimeout(() => {
      if (step < PLAN_QUIZ.length - 1) setStep((s) => s + 1);
    }, 240);
  }, [step]);

  const reset = React.useCallback(() => {
    setAnswers(Array(PLAN_QUIZ.length).fill(-1));
    setStep(0);
  }, []);

  const planNames: Record<string, string> = { base: "پایه", pro: "حرفه‌ای", enterprise: "سازمانی" };

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-b from-primary/[0.07] to-card shadow-md backdrop-blur-sm">
      <div className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full bg-primary/[0.07] blur-3xl" aria-hidden="true" />
      <CardContent className="p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Sparkle className="h-4 w-4 text-primary" />
            کدام پلن برای من مناسب است؟
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {toPersianDigits(String(PLAN_QUIZ.length))} پرسش · ۳۰ ثانیه
          </span>
        </div>

        {/* نقاط پیشرفت */}
        <div className="mt-4 flex items-center gap-1.5" aria-label={`پرسش ${toPersianDigits(String(step + 1))} از ${toPersianDigits(String(PLAN_QUIZ.length))}`}>
          {PLAN_QUIZ.map((q, i) => {
            const answered = answers[i] >= 0;
            return (
              <span
                key={q.id}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  answered ? "bg-primary" : i === step ? "bg-primary/40" : "bg-muted"
                }`}
              />
            );
          })}
        </div>

        {!done ? (
          <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="mt-5 text-sm font-semibold leading-relaxed text-foreground">
              {PLAN_QUIZ[step].question}
            </p>
            {PLAN_QUIZ[step].hint && (
              <p className="mt-1 text-[11px] text-muted-foreground">{PLAN_QUIZ[step].hint}</p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {PLAN_QUIZ[step].options.map((opt, i) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => pick(i)}
                  className="rounded-xl border border-border bg-background/70 p-3.5 text-right text-sm text-foreground transition-all duration-150 hover:border-primary/40 hover:bg-primary/[0.04] active:scale-[0.98]"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          result && (
            <div className="animate-in fade-in duration-500 mt-5 text-center">
              <p className="text-xs text-muted-foreground">پیشنهاد ما برای شما</p>
              <div className="mt-2 inline-flex items-baseline gap-2">
                <span className="bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-3xl font-black text-transparent sm:text-4xl">
                  پلن {planNames[result.id]}
                </span>
              </div>
              <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
                {result.reason}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <Button className="gap-1.5 shadow-md transition-all active:scale-[0.98]" onClick={onOpenPricing}>
                  شروع تریال ۳ روزهٔ {planNames[result.id]}
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary active:scale-95"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  پاسخ‌هایم را عوض کنم
                </button>
                <button
                  type="button"
                  onClick={shareResult}
                  aria-label="کپی لینک نتیجهٔ کیویز"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    copied
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-3.5 w-3.5" />
                      لینک کپی شد!
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3.5 w-3.5" />
                      کپی لینک نتیجه
                    </>
                  )}
                </button>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground/70">
                همهٔ پلن‌ها با تریال ۳ روزهٔ کامل شروع می‌شوند — ارتقای بعدی بدون از دست دادن داده است.
              </p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* کامپوننت اصلی                                                        */
/* ------------------------------------------------------------------ */

export function PlanComparisonSection({ onOpenPricing }: { onOpenPricing?: () => void }) {
  return (
    <section id="compare-plans" aria-label="مقایسهٔ پلن‌های هوش" className="py-10 sm:py-14">
      <div className="space-y-8">
        {/* هدر */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-3 border border-primary/20 bg-primary/10 text-primary">
            <Scale className="h-3 w-3" />
            مقایسهٔ شفاف — {toPersianDigits(String(TOTAL_COMPARISON_ROWS))} قابلیت در ۸ گروه
          </Badge>
          <h2 className="text-xl font-extrabold leading-tight text-foreground sm:text-3xl">
            کدام پلن هوش برای کسب‌وکار شماست؟
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            ماتریس کامل امکانات، سقف‌ها و پشتیبانی را ردیف‌به‌ردیف ببینید؛ یا با ۴ پرسش،
            پلن مناسب خودتان را پیدا کنید — همه‌چیز شفاف، بدون ستارهٔ پنهانی.
          </p>
        </div>

        <ComparisonMatrix onOpenPricing={onOpenPricing} />
        <PlanQuiz onOpenPricing={onOpenPricing} />
      </div>
    </section>
  );
}
