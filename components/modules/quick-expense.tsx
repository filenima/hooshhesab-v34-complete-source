"use client";

/**
 * QuickExpense — هزینه سریع برای کسب‌وکارهای کوچک و خرده‌فروش‌ها
 *
 * هدف: ثبت هزینه روزمره (اجاره، قبض، خرید، سوخت...) در کمتر از ۵ ثانیه:
 *  - انتخاب دسته با یک لمس
 *  - مبلغ با صفحه‌کلید عددی راحت
 *  - توضیح اختیاری
 *  - ثبت با یک دکمه
 *  - جمع امروز + لیست هزینه‌های اخیر
 *
 * طراحی mobile-first با هدفون لمسی بزرگ (۴۴px+)
 */

import * as React from "react";
import {
  Wallet,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Receipt,
  Store,
  CalendarDays,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatCompactToman, toLocalISODate } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { handleApiError } from "@/lib/api-error-handler";

/* ============ دسته‌بندی‌ها ============ */

const QUICK_CATEGORIES: Array<{ code: string; label: string; hint: string }> = [
  { code: "RENT", label: "اجاره", hint: "ملک / غرفه" },
  { code: "UTILITIES", label: "قبض‌ها", hint: "آب، برق، گاز، تلفن" },
  { code: "PURCHASE", label: "خرید کالا", hint: "تهیه جنس فروش" },
  { code: "SALARY", label: "حقوق", hint: "دستمزد پرسنل" },
  { code: "FUEL", label: "سوخت", hint: "بنزین / کارت سوخت" },
  { code: "TRANSPORT", label: "حمل‌ونقل", hint: "باربری / پیک" },
  { code: "MEALS", label: "خوراک", hint: "میان‌وعده پرسنل" },
  { code: "MARKETING", label: "تبلیغات", hint: "بنر / تراکت / اینستاگرام" },
  { code: "REPAIR", label: "تعمیرات", hint: "تجهیزات / ملزومات" },
  { code: "TAX", label: "مالیات و عوارض", hint: "شهرداری / مالیات" },
  { code: "OFFICE", label: "ملزومات", hint: "لوازم دفتری" },
  { code: "OTHER", label: "سایر", hint: "متفرقه" },
];

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  QUICK_CATEGORIES.map((c) => [c.code, c.label])
);

interface ExpenseRow {
  id: string;
  amount: number; // ریال
  category: string;
  description: string | null;
  vendor: string | null;
  date: string;
}

export function QuickExpense() {
  const { toast } = useToast();
  const [category, setCategory] = React.useState<string>("PURCHASE");
  const [amountToman, setAmountToman] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const [rows, setRows] = React.useState<ExpenseRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  /* ============ دریافت هزینه‌های اخیر ============ */
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        // FIX(v11): بازه ۶۲ روز اخیر + سقف ۲۰۰ — قبلاً take=30 بود و جمع ماه/امروز
        // با بیش از ۳۰ هزینه کم‌شمار می‌شد
        const to = new Date();
        const from = new Date(to.getTime() - 62 * 24 * 3600 * 1000);
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        const res = await authFetch(
          `/api/expenses?take=200&from=${iso(from)}&to=${iso(to)}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => ({}));
        if (!cancelled && json?.success && Array.isArray(json.data)) {
          setRows(
            json.data.map((e: Record<string, unknown>) => ({
              id: String(e.id ?? ""),
              amount: Number(e.amount ?? 0),
              category: String(e.category ?? "OTHER"),
              description: (e.description as string) ?? null,
              vendor: (e.vendor as string) ?? null,
              date: String(e.date ?? ""),
            }))
          );
        } else if (!cancelled) {
          setRows([]);
        }
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  /* ============ جمع امروز ============ */
  const todayKey = new Date().toDateString();
  const todayRows = rows.filter((r) => {
    if (!r.date) return false;
    const d = new Date(r.date);
    return !Number.isNaN(d.getTime()) && d.toDateString() === todayKey;
  });
  const todayTotal = todayRows.reduce((s, r) => s + r.amount, 0);
  const monthTotal = rows
    .filter((r) => {
      const d = r.date ? new Date(r.date) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((s, r) => s + r.amount, 0);

  /* ============ ثبت هزینه ============ */
  const submit = async () => {
    const amountNum = Number(amountToman.replace(/\D/g, "")) || 0;
    if (amountNum < 1000) {
      toast({
        title: "مبلغ نامعتبر",
        description: "حداقل مبلغ ۱٬۰۰۰ تومان است.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "EXPENSE",
          amount: amountNum * 10, // تومان → ریال
          category,
          description: description.trim() || undefined,
          vendor: vendor.trim() || undefined,
          date: toLocalISODate(), // FIX(v11): ISO datetime با ولیدیشن YYYY-MM-DD سرور نمی‌خواند → همیشه ۴۰۰ می‌شد
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "ثبت ناموفق بود");
      }
      toast({
        title: "هزینه ثبت شد",
        description: `${CAT_LABEL[category] ?? "هزینه"} — ${toPersianDigits(
          formatCompactToman(amountNum)
        )}`,
      });
      setAmountToman("");
      setDescription("");
      setVendor("");
      // FIX(v11): رویداد سراسری به‌روزرسانی هزینه‌ها
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("hoshhesab:expenses-changed"));
      }
      refresh();
    } catch (err) {
      toast({
        title: "خطا در ثبت هزینه",
        description: handleApiError(err, "ثبت هزینه ناموفق بود"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ============ حذف ============ */
  const remove = async (row: ExpenseRow) => {
    try {
      const res = await authFetch(`/api/expenses?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "حذف ناموفق بود");
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast({ title: "حذف شد", description: "هزینه حذف شد." });
    } catch (err) {
      toast({
        title: "خطا در حذف",
        description: handleApiError(err, "حذف ناموفق بود"),
        variant: "destructive",
      });
    }
  };

  const faDate = (iso: string) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("fa-IR", { month: "2-digit", day: "2-digit" });
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* خلاصه */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">هزینه‌های امروز</p>
              <p className="font-bold text-lg tnum">
                {todayTotal > 0 ? formatCompactToman(todayTotal / 10) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">هزینه‌های این ماه</p>
              <p className="font-bold text-lg tnum">
                {monthTotal > 0 ? formatCompactToman(monthTotal / 10) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover col-span-2 lg:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Receipt className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">تعداد ثبت‌شده</p>
              <p className="font-bold text-lg tnum">{toPersianDigits(rows.length)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* فرم ثبت سریع */}
      <Card className="card-hover">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h3 className="font-bold">ثبت هزینه جدید</h3>
          </div>

          {/* دسته‌ها — یک لمس */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">دسته هزینه</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {QUICK_CATEGORIES.map((c) => {
                const active = category === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCategory(c.code)}
                    className={`flex flex-col items-start gap-0.5 rounded-xl border p-2.5 min-h-[56px] text-start transition-all active:scale-95 ${
                      active
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-background hover:border-primary/40 hover:bg-muted/40"
                    }`}
                    aria-pressed={active}
                  >
                    <span className={`text-sm font-bold ${active ? "text-primary" : ""}`}>
                      {c.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{c.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* مبلغ + توضیح */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="text-xs text-muted-foreground mb-1.5 block">مبلغ (تومان)</label>
              <Input
                inputMode="numeric"
                dir="ltr"
                className="h-12 text-lg font-bold text-left tnum"
                placeholder="۲۵۰٬۰۰۰"
                value={amountToman ? toPersianDigits(Number(amountToman.replace(/\D/g, "")).toLocaleString("en-US")) : ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[۰-۹]/g, (d) =>
                    String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
                  );
                  setAmountToman(digits.replace(/\D/g, ""));
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                بابت / فروشنده (اختیاری)
              </label>
              <Input
                className="h-12"
                placeholder="مثلاً: بنزین ورزش"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">توضیح (اختیاری)</label>
              <Input
                className="h-12"
                placeholder="یادداشت کوتاه..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>
          </div>

          <Button
            className="w-full h-12 text-base cta-gradient gap-2"
            onClick={submit}
            disabled={submitting || !amountToman}
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            ثبت هزینه
          </Button>
        </CardContent>
      </Card>

      {/* هزینه‌های اخیر */}
      <Card className="card-hover">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-bold text-sm">هزینه‌های اخیر</h3>
              <Badge variant="secondary" className="text-[10px]">
                {toPersianDigits(rows.length)} مورد
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refresh} aria-label="تازه‌سازی">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">در حال دریافت...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <CheckCircle2 className="h-8 w-8 text-success/60" />
              <p className="text-sm text-muted-foreground">
                هنوز هزینه‌ای ثبت نشده — اولین هزینه را بالا ثبت کنید.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      variant="outline"
                      className="shrink-0 border-warning/30 text-warning text-[10px]"
                    >
                      {CAT_LABEL[r.category] ?? r.category}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.vendor || r.description || (CAT_LABEL[r.category] ?? "هزینه")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{faDate(r.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold tnum">{formatCompactToman(r.amount / 10)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(r)}
                      aria-label="حذف هزینه"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
