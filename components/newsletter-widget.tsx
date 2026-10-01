"use client";

/**
 * NewsletterWidget — فرم عضویت در خبرنامهٔ مالیاتی هوش (v22 + A/B در v24)
 * ----------------------------------------------------------------------------
 * جعبهٔ شیشه‌ای جذاب در فوتر لندینگ:
 *  - ورودی ایمیل + اعتبارسنجی کلاینت + stateهای موفق/خطا/لودینگ
 *  - POST به /api/newsletter/subscribe (عمومی + rate-limited سمت سرور)
 *  - پیام‌های فارسی دقیق (عضو جدید / قبلاً عضو / خطا)
 *  - بدون Clerk — کاملاً عمومی، حتی برای بازدیدکنندهٔ ناشناس
 *
 * A/B (v24): هر بازدیدکننده یک‌بار و پایدار به variant A (کارت افقی جمع‌وجور)
 * یا B (کارت عمودی با اثبات اجتماعی و مزایای لیست‌شده) تقسیم می‌شود —
 * ذخیره در localStorage؛ variant به source الصاق می‌شود (مثلاً landing-A)
 * تا در پنل سوپرادمین نرخ تبدیل هر نسخه قابل تحلیل باشد.
 */

import * as React from "react";
import { Mail, CheckCircle2, Loader2, Send, BellRing, Sparkles, Users, CalendarClock, ShieldCheck } from "lucide-react";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const AB_KEY = "hoosh_nl_ab";

/** تخصیص پایدار variant — ۵۰/۵۰، یک‌بار برای هر بازدیدکننده */
function pickVariant(): "A" | "B" {
  try {
    const stored = window.localStorage.getItem(AB_KEY);
    if (stored === "A" || stored === "B") return stored;
    const v: "A" | "B" = Math.random() < 0.5 ? "A" : "B";
    window.localStorage.setItem(AB_KEY, v);
    return v;
  } catch {
    return "A"; // localStorage در دسترس نیست — پیش‌فرض امن
  }
}

/* ------------------------------------------------------------------ */
/* فرم مشترک (ورودی + دکمه + پیام وضعیت) — در هر دو نسخه استفاده     */
/* ------------------------------------------------------------------ */

function NewsletterForm({
  email,
  setEmail,
  state,
  setState,
  setMessage,
  message,
  submit,
  compact,
}: {
  email: string;
  setEmail: (v: string) => void;
  state: "idle" | "loading" | "ok" | "err";
  setState: (s: "idle" | "loading" | "ok" | "err") => void;
  setMessage: (m: string | null) => void;
  message: string | null;
  submit: (e: React.FormEvent) => void;
  compact: boolean;
}) {
  return (
    <div className={compact ? "" : "w-full"}>
      <form onSubmit={submit} className={`flex w-full gap-2 ${compact ? "sm:w-auto sm:min-w-[300px]" : "sm:max-w-md"}`}>
        <div className="relative flex-1">
          <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (state !== "idle") {
                setState("idle");
                setMessage(null);
              }
            }}
            placeholder="name@example.com"
            aria-label="ایمیل برای خبرنامه"
            className="h-11 w-full rounded-lg border border-border bg-background/80 pr-9 pl-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            disabled={state === "loading" || state === "ok"}
          />
        </div>
        <button
          type="submit"
          disabled={state === "loading" || state === "ok"}
          className={`flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-70 ${
            state === "ok"
              ? "bg-emerald-500 text-white"
              : "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
          }`}
        >
          {state === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : state === "ok" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {state === "ok" ? "عضو شدید" : "عضویت رایگان"}
        </button>
      </form>

      {/* پیام وضعیت */}
      {message && (
        <p
          className={`animate-in fade-in slide-in-from-bottom-1 duration-300 mt-3 flex items-center gap-1.5 text-xs leading-relaxed ${
            state === "ok"
              ? "text-emerald-600 dark:text-emerald-400"
              : state === "err"
                ? "text-red-500 dark:text-red-400"
                : "text-muted-foreground"
          }`}
          role="status"
        >
          {state === "ok" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
          {message}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* کامپوننت اصلی — انتخاب variant در mount                             */
/* ------------------------------------------------------------------ */

export function NewsletterWidget({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [variant, setVariant] = React.useState<"A" | "B" | null>(null);

  React.useEffect(() => {
    setVariant(pickVariant());
  }, []);

  // variant به source الصاق می‌شود تا در پنل قابل تحلیل باشد
  const taggedSource = variant ? `${source}-${variant}` : source;

  const submit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const normalized = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalized)) {
        setState("err");
        setMessage("ایمیل واردشده معتبر نیست — مثال: name@example.com");
        return;
      }
      setState("loading");
      setMessage(null);
      try {
        const r = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalized, source: taggedSource }),
        });
        const j = await r.json();
        if (j.success) {
          setState("ok");
          setMessage(j.message || "عضویت انجام شد.");
          setEmail("");
        } else {
          setState("err");
          setMessage(j.message || "خطا در ثبت عضویت.");
        }
      } catch {
        setState("err");
        setMessage("ارتباط برقرار نشد — دوباره تلاش کنید.");
      }
    },
    [email, taggedSource]
  );

  // قبل از mount (SSR/اولین فریم) — نسخهٔ A را رندر کن تا فلش نکند
  const v = variant ?? "A";

  /* ---------------- نسخهٔ A — کارت افقی جمع‌وجور (کنترل) ---------------- */
  if (v === "A") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-l from-primary/[0.06] via-card to-primary/[0.03] p-5 shadow-lg shadow-primary/5 transition-shadow duration-300 hover:shadow-primary/10">
        {/* خط تزئینی بالای کارت */}
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/40 to-transparent" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* آیکن + متن */}
          <div className="flex flex-1 items-start gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BellRing className="h-5 w-5" />
              {state === "ok" && (
                <span className="absolute -top-0.5 -left-0.5 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
              )}
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">
                خبرنامهٔ مالیاتی هوش
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                یادآوری سررسیدهای مالیاتی، نکات مودیان و تغییرات قوانین — ماهی حداکثر ۲ ایمیل، بدون اسپم.
              </p>
            </div>
          </div>

          {/* فرم */}
          <NewsletterForm
            email={email}
            setEmail={setEmail}
            state={state}
            setState={setState}
            setMessage={setMessage}
            message={message}
            submit={submit}
            compact
          />
        </div>
      </div>
    );
  }

  /* ------- نسخهٔ B — کارت عمودی با اثبات اجتماعی و مزایا (چالش) ------- */
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.1] via-card to-primary/[0.04] p-6 shadow-lg shadow-primary/10 transition-shadow duration-300 hover:shadow-primary/15 sm:p-7">
      {/* خط تزئینی گرادیانی دوطرفه */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-transparent via-primary/60 to-transparent" />
      {/* orb تزئینی */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-primary/[0.08] blur-2xl" />

      <div className="flex flex-col items-center gap-4 text-center">
        {/* بج اجتماعی */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
          <Users className="h-3 w-3" />
          بیش از ۲٬۴۰۰ حسابدار و مدیر مالی عضو هستند
        </span>

        <div className="flex items-center gap-2.5">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
            <BellRing className="h-5 w-5" />
            {state === "ok" && (
              <span className="absolute -top-0.5 -left-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
            )}
          </span>
          <h3 className="text-base font-extrabold text-foreground sm:text-lg">
            خبرنامهٔ مالیاتی هوش — <span className="text-primary">مخصوص تصمیم‌گیران</span>
          </h3>
        </div>

        {/* مزایا */}
        <ul className="grid w-full gap-1.5 text-right sm:grid-cols-3 sm:max-w-2xl">
          {[
            { icon: CalendarClock, t: "یادآوری سررسید مالیاتی قبل از جریمه" },
            { icon: Sparkles, t: "نکات کاربردی مودیان و اظهارنامه" },
            { icon: ShieldCheck, t: "بدون اسپم — ماهی حداکثر ۲ ایمیل" },
          ].map((b) => (
            <li
              key={b.t}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
            >
              <b.icon className="h-3.5 w-3.5 shrink-0 text-primary/80" />
              {b.t}
            </li>
          ))}
        </ul>

        {/* فرم — وسط‌چین */}
        <div className="flex w-full justify-center">
          <NewsletterForm
            email={email}
            setEmail={setEmail}
            state={state}
            setState={setState}
            setMessage={setMessage}
            message={message}
            submit={submit}
            compact={false}
          />
        </div>
      </div>
    </div>
  );
}
