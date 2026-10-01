"use client";

/**
 * EndOfDayReport — گزارش پایان روز برای کسب‌وکارهای کوچک
 *
 * همه‌چیزِ امروز در یک صفحه:
 *  - فروش امروز (تعداد + مبلغ)
 *  - هزینه‌های امروز
 *  - سود ناخالص امروز
 *  - فاکتورهای پرداخت‌نشده (بدهی مشتریان) + متن یادآور آماده برای کپی
 *  - چاپ گزارش + اشتراک‌گذاری خلاصه (واتساپ/تلگرام)
 */

import * as React from "react";
import {
  Sun,
  TrendingUp,
  TrendingDown,
  Wallet,
  Loader2,
  RefreshCw,
  Printer,
  Share2,
  Copy,
  Check,
  CheckCircle2,
  FileText,
  AlertCircle,
  MessageCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface InvoiceRow {
  id: string;
  number: string;
  party: string;
  type: string; // SALE | PURCHASE | ...
  total: number; // ریال
  paid: number; // ریال
  date: string;
  status: string;
}

interface ExpenseRow {
  id: string;
  amount: number; // ریال
  category: string;
  date: string;
}

const CAT_LABEL: Record<string, string> = {
  MEALS: "خوراک",
  TRAVEL: "سفر",
  FUEL: "سوخت",
  OFFICE: "تجهیزات دفتری",
  CLIENT_MEETING: "ملاقات با مشتری",
  SOFTWARE: "نرم‌افزار",
  OTHER: "سایر",
  RENT: "اجاره",
  UTILITIES: "قبض‌ها",
  PURCHASE: "خرید کالا",
  SALARY: "حقوق",
  TRANSPORT: "حمل‌ونقل",
  MARKETING: "تبلیغات",
  REPAIR: "تعمیرات",
  TAX: "مالیات و عوارض",
};

export function EndOfDayReport() {
  const { toast } = useToast();
  const [invoices, setInvoices] = React.useState<InvoiceRow[]>([]);
  const [expenses, setExpenses] = React.useState<ExpenseRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [invRes, expRes] = await Promise.all([
          authFetch("/api/accounting/invoices?limit=200", { cache: "no-store" }),
          authFetch("/api/expenses?take=100", { cache: "no-store" }),
        ]);
        const invJson = await invRes.json().catch(() => ({}));
        const expJson = await expRes.json().catch(() => ({}));
        if (cancelled) return;
        setInvoices(
          invJson?.success && Array.isArray(invJson.data)
            ? invJson.data.map((inv: Record<string, unknown>) => ({
                id: String(inv.id ?? ""),
                number: String(inv.number ?? ""),
                party: (inv.party as { name?: string } | null)?.name ?? "—",
                type: String(inv.type ?? "SALE").toUpperCase(),
                total: Number(inv.total ?? 0),
                paid: Number(inv.paidAmount ?? 0),
                date: String(inv.date ?? ""),
                status: String(inv.status ?? "DRAFT").toUpperCase(),
              }))
            : []
        );
        setExpenses(
          expJson?.success && Array.isArray(expJson.data)
            ? expJson.data.map((e: Record<string, unknown>) => ({
                id: String(e.id ?? ""),
                amount: Number(e.amount ?? 0),
                category: String(e.category ?? "OTHER"),
                date: String(e.date ?? ""),
              }))
            : []
        );
      } catch {
        if (!cancelled) {
          setInvoices([]);
          setExpenses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const isToday = (iso: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
  };

  const todaySales = invoices.filter(
    // FIX(v11): فقط فاکتور «فروش» نهایی — قبلاً خرید/برگشت/پیش‌نویس هم در فروش امروز می‌آمد
    (i) =>
      i.type === "SALE" &&
      i.status !== "CANCELLED" &&
      i.status !== "DRAFT" &&
      isToday(i.date)
  );
  const todaySalesTotal = todaySales.reduce((s, i) => s + i.total, 0);
  const todayExpenses = expenses.filter((e) => isToday(e.date));
  const todayExpensesTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const todayProfit = todaySalesTotal - todayExpensesTotal;

  // FIX(v11): بدهی‌های باز «مشتریان» — فقط فاکتور فروش (قبلاً بدهی به تأمین‌کننده‌ها هم می‌آمد)
  const openInvoices = invoices.filter(
    (i) =>
      i.type === "SALE" &&
      i.status !== "CANCELLED" &&
      i.status !== "DRAFT" &&
      i.total - i.paid > 0
  );
  const openTotal = openInvoices.reduce((s, i) => s + (i.total - i.paid), 0);

  const faToday = new Date().toLocaleDateString("fa-IR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // FIX(v11): مبالغ DB ریال است — قبل از نمایش «تومان» باید بر ۱۰ تقسیم شود
  // (قبلاً ارقام ۱۰ برابر نمایش داده می‌شد و برای مشتری پیامک/واتساپ می‌رفت)
  const ft = (rial: number) => formatToman(rial / 10);

  /* ============ اشتراک خلاصه روز ============ */
  const summaryText = `گزارش پایان روز — ${faToday}
 فروش: ${ft(todaySalesTotal)} (${toPersianDigits(todaySales.length)} فاکتور)
 هزینه: ${ft(todayExpensesTotal)}
 سود ناخالص: ${ft(todayProfit)}
 بدهی‌های باز: ${ft(openTotal)}`;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "گزارش پایان روز", text: summaryText });
      } else {
        await navigator.clipboard.writeText(summaryText);
        toast({ title: "کپی شد", description: "خلاصه گزارش در کلیپ‌بورد کپی شد." });
      }
    } catch {
      try {
        await navigator.clipboard.writeText(summaryText);
        toast({ title: "کپی شد", description: "خلاصه گزارش در کلیپ‌بورد کپی شد." });
      } catch {
        toast({ title: "اشتراک‌گذاری ناموفق بود", variant: "destructive" });
      }
    }
  };

  const copyReminder = async (inv: InvoiceRow) => {
    const remaining = inv.total - inv.paid;
    const text = `${inv.party} عزیز، سلام
یادآوری فاکتور شماره ${toPersianDigits(inv.number)}:
مبلغ باقیمانده: ${ft(remaining)}
در صورت پرداخت، لطفاً رسید را ارسال بفرمایید. سپاسگزاریم`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: "متن یادآور کپی شد", description: "در واتساپ یا تلگرام پیست کنید." });
    } catch {
      toast({ title: "کپی ناموفق بود", variant: "destructive" });
    }
  };

  const shareInvoiceLink = (inv: InvoiceRow): string => {
    // مسیر عمومی فاکتور (قابل نمایش در iframe یا مرورگر)
    return `${window.location.origin}/embed/invoice/${inv.id}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 animate-fade-in-up">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">در حال تهیه گزارش امروز...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-warning" />
          <div>
            <h3 className="font-bold">گزارش پایان روز</h3>
            <p className="text-xs text-muted-foreground">{faToday}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            تازه‌سازی
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            چاپ
          </Button>
          <Button size="sm" className="gap-1.5 cta-gradient" onClick={share}>
            <Share2 className="h-4 w-4" />
            اشتراک خلاصه
          </Button>
        </div>
      </div>

      {/* کارت‌های خلاصه */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">فروش امروز</p>
              <p className="font-bold text-lg tnum">{ft(todaySalesTotal)}</p>
              <p className="text-[10px] text-muted-foreground">
                {toPersianDigits(todaySales.length)} فاکتور
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">هزینه امروز</p>
              <p className="font-bold text-lg tnum">{ft(todayExpensesTotal)}</p>
              <p className="text-[10px] text-muted-foreground">
                {toPersianDigits(todayExpenses.length)} مورد
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                todayProfit >= 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
              }`}
            >
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">سود ناخالص امروز</p>
              <p
                className={`font-bold text-lg tnum ${
                  todayProfit < 0 ? "text-destructive" : ""
                }`}
              >
                {ft(todayProfit)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">بدهی‌های باز</p>
              <p className="font-bold text-lg tnum">{ft(openTotal)}</p>
              <p className="text-[10px] text-muted-foreground">
                {toPersianDigits(openInvoices.length)} فاکتور
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* جزئیات امروز */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-hover">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-success" />
              <h4 className="font-bold text-sm">فاکتورهای امروز</h4>
            </div>
            {todaySales.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                امروز فاکتوری ثبت نشده است.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
                {todaySales.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{i.party}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{i.number}</p>
                    </div>
                    <span className="text-sm font-bold tnum shrink-0">
                      {ft(i.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-warning" />
              <h4 className="font-bold text-sm">هزینه‌های امروز</h4>
            </div>
            {todayExpenses.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                امروز هزینه‌ای ثبت نشده است.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
                {todayExpenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 p-2.5">
                    <Badge variant="outline" className="border-warning/30 text-warning text-[10px]">
                      {CAT_LABEL[e.category] ?? e.category}
                    </Badge>
                    <span className="text-sm font-bold tnum">{ft(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* بدهی‌های باز + یادآور */}
      <Card className="card-hover">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <h4 className="font-bold text-sm">بدهی‌های باز مشتریان</h4>
              <Badge variant="secondary" className="text-[10px]">
                {toPersianDigits(openInvoices.length)} فاکتور
              </Badge>
            </div>
            <span className="text-sm font-bold tnum text-destructive">
              {ft(openTotal)}
            </span>
          </div>
          {openInvoices.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              همه فاکتورها تسویه شده‌اند.{" "}
              <CheckCircle2 className="ms-1 inline h-4 w-4 align-middle text-emerald-600" aria-hidden="true" />
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
              {openInvoices.map((i) => {
                const remaining = i.total - i.paid;
                return (
                  <div
                    key={i.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{i.party}</p>
                        <Badge variant="outline" className="text-[9px] shrink-0">
                          {toPersianDigits(i.number)}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        باقیمانده: <span className="font-bold tnum">{ft(remaining)}</span>
                        {i.paid > 0 && (
                          <> — پرداخت‌شده: {ft(i.paid)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => copyReminder(i)}
                        title="کپی متن یادآور برای ارسال در واتساپ/تلگرام"
                      >
                        {copiedId === i.id ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        یادآور
                      </Button>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `${i.party} عزیز، یادآوری فاکتور ${toPersianDigits(
                            i.number
                          )} — مبلغ باقیمانده: ${ft(remaining)}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-muted"
                        title="ارسال در واتساپ"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(
                          shareInvoiceLink(i)
                        )}&text=${encodeURIComponent(
                          `فاکتور ${toPersianDigits(i.number)} — باقیمانده: ${ft(remaining)}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-muted"
                        title="ارسال در تلگرام"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
