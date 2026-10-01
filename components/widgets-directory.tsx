"use client";

/**
 * WidgetsDirectory — دایرکتوری ویجت‌های قابل embed برای شرکا (v27)
 * ----------------------------------------------------------------------------
 * صفحهٔ /widgets — معرفی همهٔ ویجت‌های قابل اشتراک هوش برای سایت‌های شرکا:
 * حسابداران، مشاوران مالی، بلاگرهای حوزهٔ کسب‌وکار و پرتال‌های صنفی.
 *
 * هر ویجت: تب [پیش‌نمایش زنده | کد embed] + کپی کد با یک کلیک +
 * پارامتر تم (روشن/تیره) که در کد اعمال می‌شود.
 */

import * as React from "react";
import { Check, Copy, Code2, Eye, ExternalLink, Sparkles, Palette, Brain, Calculator, HeartPulse, Users, FileText, CreditCard, Calendar, TrendingUp, Building2 } from "lucide-react";

type WidgetDef = {
  id: string;
  icon: "quiz" | "tax" | "invoice" | "payment" | "booking" | "health" | "payroll" | "profit" | "depreciation";
  title: string;
  tagline: string;
  audience: string;
  bestFor: string[];
  /** مسیر embed نسبی */
  path: string;
  /** ارتفاع پیشنهادی iframe */
  height: number;
  /** آیا پیش‌نمایش زنده بدون ID ممکن است؟ */
  previewable: boolean;
  /** کد نمونه — {BASE} جایگزین دامنهٔ واقعی در رندر می‌شود */
  codeTemplate: string;
  accent: string;
};

const WIDGETS: WidgetDef[] = [
  {
    id: "plan-quiz",
    icon: "quiz",
    title: "کوییز انتخاب پلن",
    tagline: "۴ پرسش تا پیشنهاد پلن مناسب — نرخ تبدیل بالا برای مخاطب تصمیم‌گیر",
    audience: "بلاگرهای کسب‌وکار، مشاوران، سایت‌های مقایسه",
    bestFor: ["لیدمگنت تعاملی", "افزایش زمان ماندگاری", "لینک به /pricing با پارامتر"],
    path: "/embed/plan-quiz",
    height: 560,
    previewable: true,
    codeTemplate:
      '<iframe src="{BASE}/embed/plan-quiz" style="width:100%;height:560px;border:0" loading="lazy" title="کوییز انتخاب پلن هوش"></iframe>',
    accent: "from-violet-500/15 to-fuchsia-500/10 text-violet-600 dark:text-violet-300",
  },
  {
    id: "tax-calculator",
    icon: "tax",
    title: "ماشین‌حساب مالیات ۱۴۰۴",
    tagline: "حقوق پلکانی، ارزش افزوده و عملکرد — به‌روز با نرخ‌های ۱۴۰۴",
    audience: "حسابداران، مشاوران مالی، پرتال‌های استخدام",
    bestFor: ["ترافیک ارگانیک تکرارشونده", "نرخ بازگشت بالا (محاسبهٔ ماهانه)", "سازگار با موبایل"],
    path: "/embed/tax-calculator",
    height: 620,
    previewable: true,
    codeTemplate:
      '<iframe src="{BASE}/embed/tax-calculator" style="width:100%;height:620px;border:0" loading="lazy" title="ماشین‌حساب مالیات ۱۴۰۴"></iframe>',
    accent: "from-emerald-500/15 to-teal-500/10 text-emerald-600 dark:text-emerald-300",
  },
  {
    id: "financial-health",
    icon: "health",
    title: "سنجش سریع سلامت مالی",
    tagline: "۵ پرسش + امتیاز ۰ تا ۱۰۰ — لیدمگنت جذاب برای مخاطب کسب‌وکار",
    audience: "شتاب‌دهنده‌ها، اپراتورهای کسب‌وکار، مشاوران",
    bestFor: ["امتیاز لحظه‌ای با گیج متحرک", "دو اولویت اصلاح پیشنهادی", "لینک به سنجش کامل ۱۰ پرسشی"],
    path: "/embed/financial-health",
    height: 640,
    previewable: true,
    codeTemplate:
      '<iframe src="{BASE}/embed/financial-health" style="width:100%;height:640px;border:0" loading="lazy" title="سنجش سلامت مالی هوش"></iframe>',
    accent: "from-rose-500/15 to-red-500/10 text-rose-600 dark:text-rose-300",
  },
  {
    id: "payroll-calculator",
    icon: "payroll",
    title: "ماشین‌حساب حقوق و دستمزد",
    tagline: "فیش حقوقی کامل ۱۴۰۴ — بیمه، مالیات پلکانی، اضافه‌کاری ۱٫۴× و هزینهٔ واقعی کارفرما",
    audience: "سایت‌های جذب نیرو و HR، حسابداران، پرتال‌های صنفی",
    bestFor: ["ترافیک تکرارشوندهٔ مدیران و HR", "عدد دقیق برای تصمیم استخدام", "کپی خلاصهٔ فیش"],
    path: "/embed/payroll-calculator",
    height: 680,
    previewable: true,
    codeTemplate:
      '<iframe src="{BASE}/embed/payroll-calculator" style="width:100%;height:680px;border:0" loading="lazy" title="ماشین‌حساب حقوق و دستمزد ۱۴۰۴"></iframe>',
    accent: "from-violet-500/15 to-purple-500/10 text-violet-600 dark:text-violet-300",
  },
  {
    id: "profit-calculator",
    icon: "profit",
    title: "ماشین‌حساب سود و حاشیه سود",
    tagline: "قیمت واحد، بهای تمام‌شده و فروش ماهانه → سود ناخالص/خالص، حاشیه‌ها، نقطهٔ سربه‌سر و سه سناریو",
    audience: "بلاگرهای کسب‌وکار، استارتاپ‌ها، مشاوران مالی",
    bestFor: ["نقطهٔ سربه‌سر با اسلایدر زنده", "جدول سه سناریوی فروش", "کپی خلاصهٔ تحلیل"],
    path: "/embed/profit-calculator",
    height: 780,
    previewable: true,
    codeTemplate:
      '<iframe src="{BASE}/embed/profit-calculator" style="width:100%;height:780px;border:0" loading="lazy" title="ماشین‌حساب سود و حاشیه سود"></iframe>',
    accent: "from-emerald-500/15 to-teal-500/10 text-emerald-600 dark:text-emerald-300",
  },
  {
    id: "depreciation-calculator",
    icon: "depreciation",
    title: "ماشین‌حساب استهلاک",
    tagline: "جدول کامل استهلاک سال‌به‌سال (مستقیم / نزولی ۲ برابری) با ارزش دفتری و یادداشت مادهٔ ۱۴۹",
    audience: "حسابداران، شرکت‌های صنعتی، پرتال‌های دارایی",
    bestFor: ["جدول سال‌به‌سال با هزینهٔ انباشته", "روش مستقیم و نزولی ۲ برابری", "یادداشت مالیاتی ایران"],
    path: "/embed/depreciation-calculator",
    height: 860,
    previewable: true,
    codeTemplate:
      '<iframe src="{BASE}/embed/depreciation-calculator" style="width:100%;height:860px;border:0" loading="lazy" title="ماشین‌حساب استهلاک"></iframe>',
    accent: "from-teal-500/15 to-emerald-500/10 text-teal-600 dark:text-teal-300",
  },
  {
    id: "invoice",
    icon: "invoice",
    title: "فاکتور عمومی برنددار",
    tagline: "لینک اشتراک فاکتور با برندینگ کسب‌وکار — چاپ و واتساپ یک‌کلیکی",
    audience: "کسب‌وکارهای کاربر هوش (از پنل خودشان)",
    bestFor: ["اشتراک‌گذاری حرفه‌ای فاکتور", "بدون ثبت‌نام برای گیرنده", "قالب چاپ تمیز"],
    path: "/embed/invoice/ID",
    height: 760,
    previewable: false,
    codeTemplate:
      '<!-- ID را از «اشتراک‌گذاری فاکتور» در پنل هوش بردارید -->\n<iframe src="{BASE}/embed/invoice/INVOICE_ID" style="width:100%;height:760px;border:0" loading="lazy" title="فاکتور"></iframe>',
    accent: "from-sky-500/15 to-cyan-500/10 text-sky-600 dark:text-sky-300",
  },
  {
    id: "payment",
    icon: "payment",
    title: "دکمه پرداخت آنلاین",
    tagline: "دکمهٔ پرداخت مستقیم فاکتور برای وب‌سایت/واتساپ کسب‌وکار",
    audience: "کسب‌وکارهای کاربر هوش",
    bestFor: ["وصول سریع‌تر مطالبات", "کاهش چرخهٔ وصول", "امکان درج در هر سایتی"],
    path: "/embed/payment/ID",
    height: 120,
    previewable: false,
    codeTemplate:
      '<!-- ID را از «اشتراک‌گذاری فاکتور» در پنل هوش بردارید -->\n<iframe src="{BASE}/embed/payment/INVOICE_ID" style="width:100%;height:120px;border:0" loading="lazy" title="پرداخت آنلاین"></iframe>',
    accent: "from-amber-500/15 to-orange-500/10 text-amber-600 dark:text-amber-300",
  },
  {
    id: "booking",
    icon: "booking",
    title: "فرم رزرو نوبت",
    tagline: "رزرو وقت مشاوره/خدمات با تقویم شمسی — مستقیم در سایت شما",
    audience: "مشاوران، موسسات خدماتی، کسب‌وکارهای نوبت‌محور",
    bestFor: ["تبدیل بازدید به نوبت", "تقویم شمسی", "بدون هزینهٔ ابزار جداگانه"],
    path: "/embed/booking/ID",
    height: 520,
    previewable: false,
    codeTemplate:
      '<!-- ID فرم رزرو را از پنل هوش بردارید -->\n<iframe src="{BASE}/embed/booking/BOOKING_ID" style="width:100%;height:520px;border:0" loading="lazy" title="رزرو نوبت"></iframe>',
    accent: "from-rose-500/15 to-pink-500/10 text-rose-600 dark:text-rose-300",
  },
];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
 quiz: Brain,
 tax: Calculator,
 health: HeartPulse,
 payroll: Users,
 profit: TrendingUp,
 depreciation: Building2,
 invoice: FileText,
 payment: CreditCard,
 booking: Calendar,
};

function CopyCodeButton({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
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
  }, [code]);

  return (
    <button
      onClick={onCopy}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all active:scale-[0.97] ${
        copied
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-primary/10 text-primary hover:bg-primary/15"
      }`}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "کپی شد!" : "کپی کد"}
    </button>
  );
}

function WidgetCard({ w, baseUrl }: { w: WidgetDef; baseUrl: string }) {
  const [tab, setTab] = React.useState<"preview" | "code">(w.previewable ? "preview" : "code");

  const resolvedCode = w.codeTemplate.replaceAll("{BASE}", baseUrl || "https://hoosh.nobatime.ir");
  const previewUrl = `${baseUrl || ""}${w.path}`;

  return (
    <article
      id={`widget-${w.id}`}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
    >
      {/* هدر ویجت */}
      <div className={`relative bg-gradient-to-bl ${w.accent} border-b border-border/70 p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-foreground shadow-sm backdrop-blur">
              {ICONS[w.icon] && React.createElement(ICONS[w.icon], { className: "h-5 w-5" })}
            </span>
            <div>
              <h3 className="text-base font-extrabold text-foreground">{w.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{w.tagline}</p>
            </div>
          </div>
          <span className="hidden shrink-0 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[9px] font-bold text-muted-foreground backdrop-blur sm:block">
            {w.previewable ? "پیش‌نمایش زنده" : "نیازمند ID"}
          </span>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {w.bestFor.map((b) => (
            <span
              key={b}
              className="rounded-md border border-border/50 bg-background/60 px-2 py-0.5 text-[10px] font-medium text-foreground/80 backdrop-blur"
            >
              {b}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          <span className="font-bold">مناسب برای:</span> {w.audience}
        </p>
      </div>

      {/* تب‌ها */}
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-4 py-2">
        <div role="tablist" aria-label={`بخش‌های ${w.title}`} className="flex gap-1">
          {w.previewable && (
            <button
              role="tab"
              aria-selected={tab === "preview"}
              onClick={() => setTab("preview")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                tab === "preview"
                  ? "bg-background text-primary shadow-sm ring-1 ring-primary/25"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
              پیش‌نمایش
            </button>
          )}
          <button
            role="tab"
            aria-selected={tab === "code"}
            onClick={() => setTab("code")}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all ${
              tab === "code"
                ? "bg-background text-primary shadow-sm ring-1 ring-primary/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden />
            کد embed
          </button>
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground transition-colors hover:text-primary"
        >
          باز کردن مستقیم
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>

      {/* محتوای تب */}
      <div className="p-4">
        {tab === "preview" && w.previewable ? (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
            <iframe
              src={previewUrl}
              title={`پیش‌نمایش ${w.title}`}
              loading="lazy"
              className="w-full"
              style={{ height: w.height, border: 0 }}
            />
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-3 top-3 z-10">
              <CopyCodeButton code={resolvedCode} label={`کپی کد ${w.title}`} />
            </div>
            <pre
              dir="ltr"
              className="overflow-x-auto rounded-xl border border-border/70 bg-muted/50 p-4 pt-12 text-left text-[11px] leading-relaxed text-foreground/90"
            >
              <code>{resolvedCode}</code>
            </pre>
          </div>
        )}
      </div>
    </article>
  );
}

const HEIGHT_SNIPPET = `// تنظیم خودکار ارتفاع iframe با پیام هوش
window.addEventListener("message", (e) => {
  if (e.data?.type === "hoosh:plan-quiz:height") {
    const iframe = document.querySelector('iframe[src*="plan-quiz"]');
    if (iframe) iframe.style.height = e.data.height + "px";
  }
  if (e.data?.type === "hoosh:tax-calc:height") {
    const iframe = document.querySelector('iframe[src*="tax-calculator"]');
    if (iframe) iframe.style.height = e.data.height + "px";
  }
  if (e.data?.type === "hoosh:payroll:height") {
    const iframe = document.querySelector('iframe[src*="payroll-calculator"]');
    if (iframe) iframe.style.height = e.data.height + "px";
  }
  if (e.data?.type === "hoosh:profit:height") {
    const iframe = document.querySelector('iframe[src*="profit-calculator"]');
    if (iframe) iframe.style.height = e.data.height + "px";
  }
  if (e.data?.type === "hoosh:depreciation:height") {
    const iframe = document.querySelector('iframe[src*="depreciation-calculator"]');
    if (iframe) iframe.style.height = e.data.height + "px";
  }
  if (e.data?.type === "hoosh:health:height") {
    const iframe = document.querySelector('iframe[src*="financial-health"]');
    if (iframe) iframe.style.height = e.data.height + "px";
  }
});`;

export function WidgetsDirectory({ baseUrl }: { baseUrl: string }) {
  const [snipCopied, setSnipCopied] = React.useState(false);

  const onSnipCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(HEIGHT_SNIPPET);
      setSnipCopied(true);
      window.setTimeout(() => setSnipCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div id="widgets-directory" className="scroll-mt-24">
      {/* شبکهٔ ویجت‌ها */}
      <div className="grid gap-6 lg:grid-cols-2">
        {WIDGETS.map((w) => (
          <WidgetCard key={w.id} w={w} baseUrl={baseUrl} />
        ))}

        {/* کارت همگام‌سازی ارتفاع — عرض کامل */}
        <article className="overflow-hidden rounded-2xl border border-dashed border-primary/35 bg-primary/[0.04] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-foreground">
                  ارتفاع خودکار — بدون اسکرول اضافه
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  ویجت‌های تعاملی (کوییز پلن، ماشین‌حساب مالیات و سنجش سلامت مالی) ارتفاع واقعی خود را با
                  <code dir="ltr" className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">postMessage</code>
                  اعلام می‌کنند؛ با این قطعه کد iframe شما همیشه دقیق و بدون اسکرول نمایش داده می‌شود:
                </p>
              </div>
            </div>
            <button
              onClick={onSnipCopy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all active:scale-[0.97] ${
                snipCopied
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-primary/10 text-primary hover:bg-primary/15"
              }`}
            >
              {snipCopied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {snipCopied ? "کپی شد!" : "کپی اسکریپت"}
            </button>
          </div>
          <pre
            dir="ltr"
            className="mt-4 overflow-x-auto rounded-xl border border-border/70 bg-muted/50 p-4 text-left text-[11px] leading-relaxed text-foreground/90"
          >
            <code>{HEIGHT_SNIPPET}</code>
          </pre>
          <ul className="mt-4 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
              سازگار با همهٔ CMSها (وردپرس، پرستاشاپ، سایت‌سازها)
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
              بدون وابستگی به کتابخانهٔ خارجی — جاوااسکریپت خالص
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
              CSP سازگار — ویجت‌ها از هر دامنه‌ای قابل نمایش‌اند
            </li>
          </ul>
        </article>

        {/* کارت سفارشی‌سازی رنگ برند (v29) — عرض کامل */}
        <article className="overflow-hidden rounded-2xl border border-dashed border-violet-500/40 bg-violet-500/[0.05] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                <Palette className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-foreground">
                  رنگ برند خودتان — پارامتر <span dir="ltr" className="font-mono text-violet-600 dark:text-violet-300">?color=</span>
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  ویجت‌های تعاملی (کوییز پلن، ماشین‌حساب مالیات، حقوق و دستمزد، سود و استهلاک و سنجش سلامت مالی)
                  با یک پارامتر URL رنگ لهجهٔ خود را با برند سایت شما هماهنگ می‌کنند — رنگ کدها، دکمه‌ها و بج‌ها:
                </p>
                <pre
                  dir="ltr"
                  className="mt-3 overflow-x-auto rounded-xl border border-border/70 bg-muted/50 p-3 text-left text-[11px] leading-relaxed text-foreground/90"
                >
                  <code>{`<iframe src="https://YOUR-SITE.../embed/tax-calculator?color=0E7C5B" ...>`}</code>
                </pre>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {(["#0E9F6E", "#2563EB", "#7C3AED", "#E11D48", "#EA580C", "#0D9488"] as const).map((c) => (
                    <span
                      key={c}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 shadow-sm"
                      style={{ backgroundColor: c }}
                      title={`color=${c.replace("#", "")}`}
                    />
                  ))}
                  <span className="text-[10px] text-muted-foreground">۱۸ رنگ آماده (emerald، violet، rose،…) یا هر hex دلخواه</span>
                </div>
              </div>
            </div>
            <a
              href={`/embed/tax-calculator?color=violet`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 text-[11px] font-bold text-violet-600 transition-all hover:bg-violet-500/15 active:scale-[0.97] dark:text-violet-300"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              پیش‌نمایش با رنگ بنفش
            </a>
          </div>
          <ul className="mt-4 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
              متنِ روی رنگ سفارشی خودکار روشن/تیره می‌شود (کنتراست خوانا)
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
              اعتبارسنجی امن — فقط hex معتبر؛ بدون تزریق CSS
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
              بدون رنگ = تم پیش‌فرض هوش روی هر صفحه
            </li>
          </ul>
        </article>
      </div>
    </div>
  );
}
