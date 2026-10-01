"use client";

// ============================================================
// PartnerRequestForm — فرم درخواست برنامهٔ شراکت هوش (v29)
// ============================================================
// فرم چندفیلدی با اعتبارسنجی کلاینت (نرمال‌سازی موبایل فارسی) +
// stateهای idle/loading/ok/err + پیام موفقیت دوحالته (تازه/تکراری).
// محتوا فارسی — RTL.

import * as React from "react";
import { CheckCircle2, Loader2, Send, AlertCircle, PartyPopper } from "lucide-react";

type Status = "idle" | "loading" | "ok" | "err";

const AUDIENCES = [
  { value: "accountant", label: "حسابدار مستقل" },
  { value: "consultant", label: "مشاور مالی / کسب‌وکار" },
  { value: "blogger", label: "بلاگر / تولیدکنندهٔ محتوا" },
  { value: "agency", label: "آژانس / شرکت نرم‌افزاری" },
  { value: "incubator", label: "شتاب‌دهنده / پرتال صنفی" },
  { value: "other", label: "سایر" },
] as const;

const CHANNELS = [
  { value: "widgets", label: "نصب ویجت‌های embed در سایت/اپ" },
  { value: "content", label: "محتوا، مقاله و ویدیو" },
  { value: "seminars", label: "سمینار و آموزش حضوری" },
  { value: "direct", label: "معرفی مستقیم مشتری" },
  { value: "other", label: "ترکیبی / سایر" },
] as const;

function normalizePhoneDisplay(v: string): string {
  // نمایش زندهٔ ارقام فارسی برای تجربهٔ بومی
  const en = "0123456789";
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return v.replace(/[0-9]/g, (d) => fa[en.indexOf(d)]);
}

export function PartnerRequestForm() {
  const [status, setStatus] = React.useState<Status>("idle");
  const [okMessage, setOkMessage] = React.useState("");
  const [isDuplicate, setIsDuplicate] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState("");
  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    city: "",
    website: "",
    audience: "accountant",
    channel: "widgets",
    monthlyVisitors: "",
    message: "",
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (status === "err") setStatus("idle");
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;

    // اعتبارسنجی کلاینت — قبل از ارسال
    if (form.name.trim().length < 3) {
      setErrMsg("نام و نام خانوادگی را کامل وارد کنید.");
      setStatus("err");
      return;
    }
    const phoneNorm = form.phone
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[\s-()+]/g, "")
      .replace(/^\+98/, "0")
      .replace(/^98/, "0");
    if (!/^09\d{9}$/.test(phoneNorm)) {
      setErrMsg("شمارهٔ موبایل معتبر نیست (مثل ۰۹۱۲۳۴۵۶۷۸۹).");
      setStatus("err");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/partners/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: phoneNorm,
          monthlyVisitors: form.monthlyVisitors ? Number(form.monthlyVisitors.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^\d]/g, "")) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrMsg(data.message || "ثبت درخواست ناموفق بود. دوباره تلاش کنید.");
        setStatus("err");
        return;
      }
      setOkMessage(data.message || "درخواست شما ثبت شد.");
      setIsDuplicate(Boolean(data.duplicate));
      setStatus("ok");
    } catch {
      setErrMsg("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
      setStatus("err");
    }
  }

  if (status === "ok") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6 text-center sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-emerald-400 via-emerald-500 to-teal-500" />
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
          {isDuplicate ? <CheckCircle2 className="h-7 w-7" aria-hidden /> : <PartyPopper className="h-7 w-7" aria-hidden />}
        </span>
        <h3 className="text-lg font-extrabold text-foreground">
 {isDuplicate ?"درخواست شما در صف بررسی است":"درخواست همکاری شما ثبت شد"}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{okMessage}</p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setForm((f) => ({ ...f, name: "", phone: "", email: "", message: "" }));
          }}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold text-foreground transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.98]"
        >
          ارسال درخواست دیگر
        </button>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20";
  const labelCls = "mb-1.5 block text-xs font-bold text-foreground";

  return (
    <form
      onSubmit={onSubmit}
      className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-lg shadow-black/[0.03] sm:p-7"
      noValidate
    >
      {/* خط لهجهٔ بالای فرم */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-primary via-primary/70 to-transparent" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pr-name" className={labelCls}>
            نام و نام خانوادگی <span className="text-destructive">*</span>
          </label>
          <input
            id="pr-name"
            type="text"
            value={form.name}
            onChange={set("name")}
            placeholder="مثلاً: سارا محمدی"
            className={inputCls}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label htmlFor="pr-phone" className={labelCls}>
            شمارهٔ موبایل <span className="text-destructive">*</span>
          </label>
          <input
            id="pr-phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            value={form.phone}
            onChange={set("phone")}
            placeholder={normalizePhoneDisplay("09123456789")}
            className={`${inputCls} text-left`}
            autoComplete="tel"
            required
          />
          <p className="mt-1 text-[10px] text-muted-foreground">با این شماره کارشناس شراکت تماس می‌گیرد</p>
        </div>
        <div>
          <label htmlFor="pr-email" className={labelCls}>
            ایمیل <span className="font-normal text-muted-foreground">(اختیاری)</span>
          </label>
          <input
            id="pr-email"
            type="email"
            dir="ltr"
            value={form.email}
            onChange={set("email")}
            placeholder="you@example.com"
            className={`${inputCls} text-left`}
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="pr-company" className={labelCls}>
            نام کسب‌وکار / مؤسسه <span className="font-normal text-muted-foreground">(اختیاری)</span>
          </label>
          <input
            id="pr-company"
            type="text"
            value={form.company}
            onChange={set("company")}
            placeholder="مثلاً: مؤسسهٔ حسابداری آرامش"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="pr-city" className={labelCls}>
            شهر <span className="font-normal text-muted-foreground">(اختیاری)</span>
          </label>
          <input
            id="pr-city"
            type="text"
            value={form.city}
            onChange={set("city")}
            placeholder="مثلاً: اصفهان"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="pr-website" className={labelCls}>
            آدرس سایت / صفحهٔ اینستاگرام <span className="font-normal text-muted-foreground">(اختیاری)</span>
          </label>
          <input
            id="pr-website"
            type="text"
            dir="ltr"
            value={form.website}
            onChange={set("website")}
            placeholder="example.ir"
            className={`${inputCls} text-left`}
          />
        </div>
        <div>
          <label htmlFor="pr-audience" className={labelCls}>
            شما چه کسی هستید؟
          </label>
          <select id="pr-audience" value={form.audience} onChange={set("audience")} className={inputCls}>
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pr-channel" className={labelCls}>
            روش همکاری موردنظر
          </label>
          <select id="pr-channel" value={form.channel} onChange={set("channel")} className={inputCls}>
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pr-visitors" className={labelCls}>
            بازدید ماهانهٔ سایت/شبکهٔ شما <span className="font-normal text-muted-foreground">(تخمینی، اختیاری)</span>
          </label>
          <input
            id="pr-visitors"
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={form.monthlyVisitors}
            onChange={set("monthlyVisitors")}
            placeholder="12000"
            className={`${inputCls} text-left`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pr-message" className={labelCls}>
            توضیح تکمیلی <span className="font-normal text-muted-foreground">(اختیاری)</span>
          </label>
          <textarea
            id="pr-message"
            value={form.message}
            onChange={set("message")}
            placeholder="دربارهٔ مخاطبان و کانال‌هایتان بگویید؛ مثلاً: کانال تلگرامی با ۸ هزار عضو دارم و…"
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>

      {status === "err" && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {errMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            در حال ارسال…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden />
            ارسال درخواست همکاری
          </>
        )}
      </button>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        اطلاعات شما فقط برای بررسی درخواست شراکت استفاده می‌شود و در پنل مدیریت هوش نگهداری می‌گردد؛ هرگز با
        اشخاص ثالث به اشتراک گذاشته نمی‌شود.
      </p>
    </form>
  );
}
