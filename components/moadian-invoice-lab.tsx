"use client";

/**
 * MoadianInvoiceLab — آزمایشگاه صورتحساب الکترونیکی مودیان (v22)
 * ----------------------------------------------------------------------------
 * ابزار رایگان و تعاملی برای ساخت و «ارسال آزمایشی» صورتحساب الکترونیکی
 * به شبیه‌ساز محیط آزمایشی سامانه مودیان — بدون ثبت‌نام:
 *
 *  ۱) فرم صورتحساب (نوع، فروشنده، خریدار، اقلام) + اعتبارسنجی زندهٔ قواعد مودیان
 *  ۲) پیش‌نمایش زندهٔ صورتحساب در کنار فرم (هر تغییر فوری اعمال می‌شود)
 *  ۳) nonce واقعی از شبیه‌ساز (سازگار با چرخهٔ واقعی: هر nonce یک‌بارمصرف)
 *  ۴) ارسال پکت از طریق /api/modian-demo → referenceNumber رسمی‌شکل
 *  ۵) پیگیری وضعیت async با polling: PENDING → IN_PROGRESS → SUCCESS
 *
 * هدف سئو: کلیدواژه‌های «صورتحساب الکترونیکی مودیان»، «نمونه صورتحساب
 * مودیان»، «ساخت صورتحساب الکترونیکی» + نمایش عمیق تخصص محصول.
 */

import * as React from "react";
import {
  FileText,
  ShieldCheck,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  RefreshCcw,
  Info,
  KeyRound,
  ArrowLeft,
  Copy,
  ServerCog,
  Clock,
  BadgeCheck,
  Zap,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  toPersianDigits,
  formatToman,
  formatNumber,
  toEnglishDigits,
} from "@/lib/persian";

/* ------------------------------------------------------------------ */
/* انواع و ثابت‌ها                                                     */
/* ------------------------------------------------------------------ */

interface GoodRow {
  id: number;
  description: string;
  quantity: string;
  unitAmount: string;
  vatRate: number; // درصد — ۰ یا ۱۰
}

type PacketStatus = "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED";

const INVOICE_TYPES: { value: number; label: string }[] = [
  { value: 1, label: "نوع ۱ — فروش" },
  { value: 2, label: "نوع ۲ — خرید" },
  { value: 3, label: "نوع ۳ — برگشت از فروش" },
  { value: 4, label: "نوع ۴ — برگشت از خرید" },
];

const DEFAULT_GOODS: GoodRow[] = [
  {
    id: 1,
    description: "نرم‌افزار حسابداری ابری — لایسنس سالانه",
    quantity: "1",
    unitAmount: "9750000",
    vatRate: 10,
  },
  {
    id: 2,
    description: "ماژول اتصال سامانه مودیان",
    quantity: "1",
    unitAmount: "1200000",
    vatRate: 10,
  },
];

let rowSeq = 3;

/* ------------------------------------------------------------------ */
/* حالت‌های کمکی                                                       */
/* ------------------------------------------------------------------ */

function parseNum(s: string): number {
  const n = Number(toEnglishDigits(s).replace(/[,٬\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

interface SubmitResult {
  uid: string;
  referenceNumber: string;
  status?: PacketStatus;
}

/* ------------------------------------------------------------------ */
/* کامپوننت اصلی                                                       */
/* ------------------------------------------------------------------ */

export function MoadianInvoiceLab({
  compact = false,
  onOpenPricing,
}: {
  compact?: boolean;
  onOpenPricing?: () => void;
}) {
  // ---- فرم ----
  const [invoiceType, setInvoiceType] = React.useState(1);
  const [invoiceNo, setInvoiceNo] = React.useState("1401");
  const [sellerId, setSellerId] = React.useState("10861234567");
  const [sellerName, setSellerName] = React.useState("شرکت فناوری هوش (دمو)");
  const [buyerId, setBuyerId] = React.useState("10101234567");
  const [buyerName, setBuyerName] = React.useState("فروشگاه نمونه (دمو)");
  const [goods, setGoods] = React.useState<GoodRow[]>(DEFAULT_GOODS);

  // ---- فرآیند ارسال ----
  const [nonce, setNonce] = React.useState<string | null>(null);
  const [nonceExp, setNonceExp] = React.useState<string | null>(null);
  const [fetchingNonce, setFetchingNonce] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<SubmitResult | null>(null);
  const [inquiryStatus, setInquiryStatus] = React.useState<PacketStatus | null>(null);
  const [confirmationRef, setConfirmationRef] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showJson, setShowJson] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [shared, setShared] = React.useState(false);

  // ---- محاسبات ----
  const calc = React.useMemo(() => {
    let total = 0;
    let vat = 0;
    for (const g of goods) {
      const line = parseNum(g.quantity) * parseNum(g.unitAmount);
      total += line;
      vat += Math.round((line * g.vatRate) / 100);
    }
    return { total, vat, grand: total + vat };
  }, [goods]);

  // ---- اعتبارسنجی ----
  const sellerValid = /^\d{11}$/.test(sellerId);
  const buyerValid = /^\d{11}$/.test(buyerId) || buyerId.trim() === "";
  const goodsValid = goods.every(
    (g) =>
      g.description.trim().length >= 2 &&
      parseNum(g.quantity) > 0 &&
      parseNum(g.unitAmount) > 0
  );
  const canSubmit = sellerValid && buyerValid && goodsValid && goods.length > 0;

  // ---- اکشن‌ها ----
  const fetchNonce = React.useCallback(async () => {
    setFetchingNonce(true);
    setError(null);
    try {
      const r = await fetch("/api/modian-demo?action=nonce", { cache: "no-store" });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || "خطا در دریافت nonce");
      setNonce(j.nonce);
      setNonceExp(j.expDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در دریافت nonce");
      setNonce(null);
    } finally {
      setFetchingNonce(false);
    }
  }, []);

  const buildPacket = React.useCallback(
    () => ({
      header: {
        requestTraceId: `demo-${Date.now()}`,
        fiscalId: sellerId,
        nonce,
      },
      payload: {
        header: {
          inno: parseNum(invoiceNo),
          intyp: invoiceType,
          indati2m: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
        },
        seller: { id: sellerId, name: sellerName.slice(0, 80) },
        buyer: buyerId.trim() ? { id: buyerId, name: buyerName.slice(0, 80) } : undefined,
        goods: goods.map((g) => ({
          description: g.description.slice(0, 120),
          quantity: parseNum(g.quantity),
          unitAmount: parseNum(g.unitAmount),
          vat: Math.round((parseNum(g.quantity) * parseNum(g.unitAmount) * g.vatRate) / 100),
        })),
      },
    }),
    [sellerId, nonce, invoiceNo, invoiceType, sellerName, buyerId, buyerName, goods]
  );

  const submit = React.useCallback(async () => {
    if (!nonce) {
      await fetchNonce();
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    setInquiryStatus(null);
    setConfirmationRef(null);
    try {
      const r = await fetch("/api/modian-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPacket()),
      });
      const j = await r.json();
      if (!j.success) {
        throw new Error(
          j.errorCode
            ? `خطای ${j.errorCode} سازمان: ${j.message}`
            : j.message || "ارسال ناموفق بود"
        );
      }
      setResult(j.result);
      setInquiryStatus("PENDING");
      // nonce مصرف شد — مثل سامانهٔ واقعی
      setNonce(null);
      setNonceExp(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ارسال ناموفق بود");
    } finally {
      setSending(false);
    }
  }, [nonce, fetchNonce, buildPacket]);

  // ---- polling وضعیت (PENDING → IN_PROGRESS → SUCCESS) ----
  React.useEffect(() => {
    if (!result || !inquiryStatus || inquiryStatus === "SUCCESS" || inquiryStatus === "FAILED") {
      return;
    }
    const t = window.setInterval(async () => {
      try {
        const r = await fetch(
          `/api/modian-demo?action=inquiry&uid=${encodeURIComponent(result.uid)}`,
          { cache: "no-store" }
        );
        const j = await r.json();
        if (j.success && j.result?.status) {
          setInquiryStatus(j.result.status as PacketStatus);
          if (j.result.status === "SUCCESS") {
            setConfirmationRef(j.result?.data?.confirmationReferenceId ?? null);
          }
        }
      } catch {
        /* استعلام بعدی دوباره تلاش می‌کند */
      }
    }, 2200);
    return () => window.clearInterval(t);
  }, [result, inquiryStatus]);

  const copyRef = React.useCallback(async () => {
    const text = result?.referenceNumber || confirmationRef || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
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
  }, [result, confirmationRef]);

  const resetAll = React.useCallback(() => {
    setResult(null);
    setInquiryStatus(null);
    setConfirmationRef(null);
    setError(null);
    setNonce(null);
    setNonceExp(null);
    setShowJson(false);
    setShared(false);
  }, []);

  /* اشتراک‌گذاری نتیجه — متن کامل با لینک ابزار (v23) */
  const shareResult = React.useCallback(async () => {
    if (!result) return;
    const typeLabel = INVOICE_TYPES.find((t) => t.value === invoiceType)?.label ?? "نوع ۱";
    const statusLabel =
      inquiryStatus === "SUCCESS"
        ? "تأییدشده"
        : inquiryStatus === "FAILED"
        ? "ردشده"
        : inquiryStatus === "IN_PROGRESS"
        ? "در حال پردازش"
        : "در صف پردازش";
    const text =
      `نتیجهٔ ارسال صورتحساب به سامانه مودیان (شبیه‌ساز آزمایشی)\n` +
      `نوع: ${typeLabel}\n` +
      `شمارهٔ صورتحساب: ${invoiceNo}\n` +
      `فروشنده: ${sellerName} (${sellerId})\n` +
      `خریدار: ${buyerName} (${buyerId})\n` +
      `مبلغ کل: ${formatNumber(calc.total)} تومان\n` +
      `وضعیت: ${statusLabel}\n` +
      `شمارهٔ ارجاع: ${result.referenceNumber}\n` +
      (confirmationRef ? `شناسهٔ تأیید سازمان: ${confirmationRef}\n` : "") +
      `\nابزار رایگان آزمایشگاه مودیان: ${
        typeof window !== "undefined" ? window.location.origin : ""
      }/moadian-invoice`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "نتیجهٔ صورتحساب مودیان", text });
        return;
      }
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setShared(true);
    window.setTimeout(() => setShared(false), 2000);
  }, [result, inquiryStatus, confirmationRef, invoiceType, invoiceNo, sellerName, sellerId, buyerName, buyerId, calc.total]);

  /* ---------------- ردیف کالا ---------------- */
  const addRow = () => {
    setGoods((g) => [
      ...g,
      { id: rowSeq++, description: "", quantity: "1", unitAmount: "100000", vatRate: 10 },
    ]);
  };
  const removeRow = (id: number) => {
    setGoods((g) => (g.length <= 1 ? g : g.filter((x) => x.id !== id)));
  };
  const updateRow = (id: number, patch: Partial<GoodRow>) => {
    setGoods((g) => g.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const STATUS_UI: Record<PacketStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    PENDING: {
      label: "در صف پردازش",
      icon: <Clock className="h-4 w-4" />,
      cls: "border-amber-300/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    },
    IN_PROGRESS: {
      label: "در حال پردازش",
      icon: <ServerCog className="h-4 w-4 animate-pulse" />,
      cls: "border-sky-300/50 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    },
    SUCCESS: {
      label: "تأیید شد",
      icon: <BadgeCheck className="h-4 w-4" />,
      cls: "border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    },
    FAILED: {
      label: "رد شد",
      icon: <XCircle className="h-4 w-4" />,
      cls: "border-red-300/50 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    },
  };

  /* ================== رندر ================== */
  return (
    <section
      id="moadian-lab"
      aria-label="آزمایشگاه صورتحساب الکترونیکی مودیان"
      className="relative overflow-hidden py-14 sm:py-16"
    >
      {/* پس‌زمینه — orbs + گرادیان (هم‌خانوادهٔ ماشین‌حساب مالیاتی) */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/[0.02] to-background" />
        <div className="absolute -top-24 right-[10%] h-72 w-72 rounded-full bg-primary/[0.05] blur-3xl" />
        <div className="absolute bottom-0 left-[5%] h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* هدر سکشن */}
        <div className="mb-8 text-center">
          <Badge
            variant="secondary"
            className="mb-3 border border-primary/20 bg-primary/10 text-primary"
          >
            <ShieldCheck className="h-3 w-3 ml-1" />
            آزمایشگاه زنده — متصل به شبیه‌ساز محیط آزمایشی مودیان
          </Badge>
          <h2 className="text-xl font-extrabold leading-tight text-foreground sm:text-3xl">
            صورتحساب الکترونیکی مودیان را همین‌جا بسازید و ارسال کنید
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            بدون ثبت‌نام، فرم را پر کنید، <span className="font-medium text-foreground">nonce واقعی</span> بگیرید
            و پکت را به شبیه‌ساز سامانه مودیان ارسال کنید — همان چرخه‌ای که هوش برای فاکتورهای واقعی
            شما به‌صورت خودکار انجام می‌دهد.
          </p>
        </div>

        {/* گرید اصلی: فرم + پیش‌نمایش */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* ---------- ستون فرم ---------- */}
          <Card className="border-border/70 bg-card/80 shadow-xl shadow-primary/5 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-foreground">اطلاعات صورتحساب</h3>
                <Badge variant="outline" className="mr-auto text-[10px]">
                  فرمت INVOICE.V1
                </Badge>
              </div>

              {/* نوع صورتحساب */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  نوع صورتحساب (intyp)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {INVOICE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setInvoiceType(t.value)}
                      className={`rounded-lg border px-3 py-2 text-right text-xs transition-all duration-150 active:scale-[0.98] ${
                        invoiceType === t.value
                          ? "border-primary/50 bg-primary/10 font-semibold text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* فروشنده */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    نام فروشنده
                  </label>
                  <Input
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    className="h-9 text-xs"
                    placeholder="نام شرکت"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    شناسه ملی
                  </label>
                  <Input
                    dir="ltr"
                    value={sellerId}
                    onChange={(e) => setSellerId(toEnglishDigits(e.target.value).replace(/\D/g, "").slice(0, 11))}
                    className={`h-9 text-xs ${sellerValid ? "" : "border-red-400/60 focus-visible:ring-red-400/30"}`}
                    placeholder="۱۱ رقم"
                  />
                </div>
              </div>

              {/* خریدار */}
              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    نام خریدار <span className="text-[10px] text-muted-foreground/70">(اختیاری)</span>
                  </label>
                  <Input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="h-9 text-xs"
                    placeholder="نام خریدار"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    شناسه ملی
                  </label>
                  <Input
                    dir="ltr"
                    value={buyerId}
                    onChange={(e) => setBuyerId(toEnglishDigits(e.target.value).replace(/\D/g, "").slice(0, 11))}
                    className={`h-9 text-xs ${buyerValid ? "" : "border-red-400/60 focus-visible:ring-red-400/30"}`}
                    placeholder="۱۱ رقم"
                  />
                </div>
              </div>

              {/* اقلام */}
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  اقلام صورتحساب (goods)
                </label>
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary transition-all hover:bg-primary/10 active:scale-95"
                >
                  <Plus className="h-3 w-3" /> افزودن قلم
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pl-1" style={{ scrollbarWidth: "thin" }}>
                {goods.map((g, idx) => (
                  <div
                    key={g.id}
                    className="rounded-lg border border-border/80 bg-background/60 p-2.5 transition-colors hover:border-primary/25"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                        {toPersianDigits(idx + 1)}
                      </span>
                      <Input
                        value={g.description}
                        onChange={(e) => updateRow(g.id, { description: e.target.value })}
                        className="h-8 flex-1 text-xs"
                        placeholder="شرح کالا یا خدمت"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(g.id)}
                        disabled={goods.length <= 1}
                        aria-label={`حذف قلم ${idx + 1}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="mb-1 block text-[10px] text-muted-foreground">تعداد</label>
                        <Input
                          dir="ltr"
                          value={g.quantity}
                          onChange={(e) => updateRow(g.id, { quantity: e.target.value.replace(/[^\d۰-۹]/g, "") })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-muted-foreground">مبلغ واحد (تومان)</label>
                        <Input
                          dir="ltr"
                          value={g.unitAmount}
                          onChange={(e) => updateRow(g.id, { unitAmount: e.target.value.replace(/[^\d۰-۹]/g, "") })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-muted-foreground">مالیات</label>
                        <button
                          type="button"
                          onClick={() => updateRow(g.id, { vatRate: g.vatRate === 10 ? 0 : 10 })}
                          className={`h-8 w-full rounded-md border text-xs font-medium transition-all active:scale-95 ${
                            g.vatRate === 10
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground"
                          }`}
                        >
                          {g.vatRate === 10 ? "۱۰٪" : "بدون"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* جمع */}
              <div className="mt-4 space-y-1.5 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>جمع اقلام</span>
                  <span className="font-medium tabular-nums text-foreground">{formatToman(calc.total)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>مالیات بر ارزش افزوده</span>
                  <span className="font-medium tabular-nums text-foreground">{formatToman(calc.vat)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-primary/15 pt-1.5">
                  <span className="font-bold text-foreground">مبلغ نهایی صورتحساب</span>
                  <span className="font-extrabold tabular-nums text-primary">{formatToman(calc.grand)}</span>
                </div>
              </div>

              {/* اعتبارسنجی */}
              {(!canSubmit || !sellerValid) && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50/60 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-300">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {!sellerValid && "شناسه ملی فروشنده باید دقیقاً ۱۱ رقم باشد. "}
                    {!goodsValid && "شرح/تعداد/مبلغ همهٔ اقلام باید معتبر باشند."}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---------- ستون پیش‌نمایش + ارسال ---------- */}
          <div className="space-y-4">
            {/* پیش‌نمایش صورتحساب */}
            <Card className="border-border/70 bg-card/80 shadow-xl shadow-primary/5 backdrop-blur-sm">
              <CardContent className="p-4 sm:p-6">
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Zap className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-bold text-foreground">پیش‌نمایش زندهٔ صورتحساب</h3>
                  <span className="relative mr-auto flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                </div>

                {/* کارت صورتحساب — شبیه فاکتور رسمی */}
                <div className="rounded-xl border border-border bg-gradient-to-b from-background to-muted/20 p-4" dir="rtl">
                  <div className="mb-3 flex items-start justify-between border-b border-dashed border-border pb-3">
                    <div>
                      <div className="text-[11px] text-muted-foreground">صورتحساب الکترونیکی</div>
                      <div className="text-sm font-bold text-foreground">
                        {INVOICE_TYPES.find((t) => t.value === invoiceType)?.label}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        شماره: <span className="tabular-nums">{toPersianDigits(invoiceNo)}</span>
                      </div>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-3 text-[11px]">
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <div className="mb-0.5 font-semibold text-muted-foreground">فروشنده</div>
                      <div className="truncate font-medium text-foreground">{sellerName || "—"}</div>
                      <div dir="ltr" className="mt-0.5 text-left tabular-nums text-muted-foreground">
                        {sellerId || "—"}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <div className="mb-0.5 font-semibold text-muted-foreground">خریدار</div>
                      <div className="truncate font-medium text-foreground">{buyerName || "—"}</div>
                      <div dir="ltr" className="mt-0.5 text-left tabular-nums text-muted-foreground">
                        {buyerId || "—"}
                      </div>
                    </div>
                  </div>

                  {/* جدول اقلام */}
                  <div className="overflow-hidden rounded-lg border border-border/70">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-border/70 bg-muted/50 text-muted-foreground">
                          <th className="px-2 py-1.5 text-right font-medium">شرح</th>
                          <th className="px-2 py-1.5 text-center font-medium">تعداد</th>
                          <th className="px-2 py-1.5 text-center font-medium">مبلغ</th>
                          <th className="px-2 py-1.5 text-center font-medium">VAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goods.map((g) => {
                          const line = parseNum(g.quantity) * parseNum(g.unitAmount);
                          return (
                            <tr key={g.id} className="border-b border-border/40 last:border-0">
                              <td className="max-w-[160px] truncate px-2 py-1.5 text-foreground">
                                {g.description || "—"}
                              </td>
                              <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                                {toPersianDigits(g.quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                                {formatToman(line)}
                              </td>
                              <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                                {formatToman(Math.round((line * g.vatRate) / 100))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/[0.06] px-3 py-2">
                    <span className="text-[11px] font-semibold text-foreground">مبلغ قابل پرداخت</span>
                    <span className="text-sm font-extrabold tabular-nums text-primary">
                      {formatToman(calc.grand)}
                    </span>
                  </div>
                </div>

                {/* دکمهٔ نمایش JSON */}
                <button
                  type="button"
                  onClick={() => setShowJson((v) => !v)}
                  className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className={`h-3 w-3 transition-transform ${showJson ? "rotate-90" : ""}`} />
                  {showJson ? "بستن JSON" : "نمایش پکت JSON ارسالی (ساختار واقعی)"}
                </button>
                {showJson && (
                  <pre
                    dir="ltr"
                    className="mt-2 max-h-56 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-left text-[10px] leading-relaxed text-muted-foreground"
                  >
                    <code>{JSON.stringify(buildPacket(), null, 2)}</code>
                  </pre>
                )}
              </CardContent>
            </Card>

            {/* کارت ارسال — nonce + وضعیت */}
            <Card className="border-border/70 bg-card/80 shadow-xl shadow-primary/5 backdrop-blur-sm">
              <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Send className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-bold text-foreground">ارسال به سامانه مودیان (محیط آزمایشی)</h3>
                </div>

                {/* خطا */}
                {error && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-300/40 bg-red-50/70 p-3 text-xs leading-relaxed text-red-700 dark:border-red-500/20 dark:bg-red-950/30 dark:text-red-300">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* گام ۱: nonce */}
                <div className="mb-3 rounded-lg border border-border bg-background/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <KeyRound className="h-3.5 w-3.5" />
                      گام ۱ — nonce (رمز یک‌بارمصرف)
                    </div>
                    {nonce ? (
                      <Badge className="border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> دریافت شد
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        منتظر دریافت
                      </Badge>
                    )}
                  </div>
                  {nonce ? (
                    <div className="flex items-center justify-between gap-2">
                      <code dir="ltr" className="truncate rounded bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
                        {nonce}
                      </code>
                      {nonceExp && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          اعتبار تا {new Date(nonceExp).toLocaleTimeString("fa-IR")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fetchNonce}
                      disabled={fetchingNonce}
                      className="h-8 w-full text-xs"
                    >
                      {fetchingNonce ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال دریافت...
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-3.5 w-3.5" /> دریافت nonce از سامانه
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* گام ۲: ارسال */}
                <Button
                  type="button"
                  size="lg"
                  onClick={submit}
                  disabled={!canSubmit || sending}
                  className="h-11 w-full gap-2 text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> در حال ارسال پکت...
                    </>
                  ) : nonce ? (
                    <>
                      <Send className="h-4 w-4" /> ارسال صورتحساب به مودیان
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" /> دریافت nonce و ارسال
                    </>
                  )}
                </Button>

                {/* نتیجه و پیگیری */}
                {result && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-emerald-300/40 bg-emerald-50/60 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/30">
                      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        پکت دریافت شد — ارجاع ثبت شد
                      </div>
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">شمارهٔ ارجاع (referenceNumber)</span>
                          <div className="flex items-center gap-1">
                            <code dir="ltr" className="rounded bg-emerald-100/70 px-1.5 py-0.5 text-[10px] dark:bg-emerald-900/40">
                              {result.referenceNumber.slice(0, 18)}…
                            </code>
                            <button
                              type="button"
                              onClick={copyRef}
                              aria-label="کپی شمارهٔ ارجاع"
                              className={`flex h-6 w-6 items-center justify-center rounded transition-all active:scale-90 ${
                                copied
                                  ? "text-emerald-600"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">شناسهٔ پکت (uid)</span>
                          <code dir="ltr" className="text-[10px] text-muted-foreground">
                            {result.uid.slice(0, 22)}…
                          </code>
                        </div>
                      </div>
                    </div>

                    {/* تایم‌لاین وضعیت */}
                    <div className="rounded-lg border border-border bg-background/50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          وضعیت پردازش در سامانه
                        </span>
                        {inquiryStatus && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_UI[inquiryStatus].cls}`}
                          >
                            {STATUS_UI[inquiryStatus].icon}
                            {STATUS_UI[inquiryStatus].label}
                          </span>
                        )}
                      </div>
                      {/* نوار پیشرفت وضعیت */}
                      <div className="flex items-center gap-1">
                        {(["PENDING", "IN_PROGRESS", "SUCCESS"] as const).map((st, i, arr) => {
                          const order: Record<PacketStatus, number> = {
                            PENDING: 0,
                            IN_PROGRESS: 1,
                            SUCCESS: 2,
                            FAILED: 0,
                          };
                          const currentIdx = inquiryStatus ? order[inquiryStatus] : -1;
                          const done = inquiryStatus === "SUCCESS" || i < currentIdx;
                          const active = inquiryStatus === st && st !== "SUCCESS";
                          return (
                            <React.Fragment key={st}>
                              <div
                                className={`flex h-6 items-center justify-center rounded-md border px-2 text-[9px] font-medium transition-all duration-500 ${
                                  done || inquiryStatus === st
                                    ? "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : active
                                      ? "border-sky-400/50 bg-sky-50 text-sky-700"
                                      : "border-border bg-muted/30 text-muted-foreground"
                                }`}
                              >
                                {STATUS_UI[st].label}
                              </div>
                              {i < arr.length - 1 && (
                                <div
                                  className={`h-0.5 flex-1 rounded ${
                                    done ? "bg-emerald-400/50" : "bg-border"
                                  }`}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                      {inquiryStatus === "PENDING" || inquiryStatus === "IN_PROGRESS" ? (
                        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          هر ~۲ ثانیه استعلام خودکار انجام می‌شود — مثل فرآیند واقعی سازمان...
                        </p>
                      ) : null}
                      {inquiryStatus === "SUCCESS" && confirmationRef && (
                        <div className="mt-2 rounded-md border border-emerald-300/40 bg-emerald-50/60 p-2 text-[10px] dark:border-emerald-500/20 dark:bg-emerald-950/30">
                          <span className="text-muted-foreground">شناسهٔ تأیید سازمان: </span>
                          <code dir="ltr" className="text-emerald-700 dark:text-emerald-300">
                            {confirmationRef}
                          </code>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={resetAll}
                        className="h-8 flex-1 gap-1 text-xs"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" /> صورتحساب جدید
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={shareResult}
                        className={`h-8 flex-1 gap-1 text-xs transition-colors ${
                          shared
                            ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                            : ""
                        }`}
                        aria-live="polite"
                      >
                        {shared ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                        {shared ? "کپی/اشتراک شد" : "اشتراک نتیجه"}
                      </Button>
                      {!compact && onOpenPricing && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={onOpenPricing}
                          className="h-8 flex-1 text-xs"
                        >
                          خودکارسازی با هوش
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <p className="mt-4 border-t border-border pt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
                  این ابزار به <span className="font-medium">شبیه‌ساز محیط آزمایشی</span> سامانه مودیان متصل است —
                  هیچ صورتحسابی به سازمان امور مالیاتی واقعی ارسال نمی‌شود.
                  {" "}
                  {!compact && "در نسخهٔ اصلی هوش، پکت‌ها با امضای RSA و رمزنگاری JWE ارسال می‌شوند."}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
