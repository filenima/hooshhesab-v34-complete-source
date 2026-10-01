"use client";

// ============ هوش — ماژول «کیف پول» (پنل کاربر، Task 24) ============
// پاداش‌های نقدی (دعوت دوست ۱,۰۰۰,۰۰۰ ت + گزارش باگ ۲۵۰k-۱M ت)
// + تراکنش‌ها + درخواست برداشت (کارت/شبا) — بدون ایموجی.

import * as React from "react";
import {
  Wallet as WalletIcon,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Loader2,
  Send,
  Users,
  Bug,
  ShieldCheck,
  Landmark,
  Info,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";
// USER-CONTENT(3-d): برچسب‌های کیف پول از پنل سوپرادمین قابل‌ویرایش است
import { getUserContent, useUserContentOverrides } from "@/lib/user-content";

interface WalletTx {
  id: string;
  type: string;
  typeLabel: string;
  amountToman: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
  status: string;
}

interface WithdrawalItem {
  id: string;
  amountToman: number;
  taxToman?: number;
  netToman?: number;
  holderName: string;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  cardNumber: string;
  shebaNumber: string;
}

interface WalletData {
  balance: number;
  transactions: WalletTx[];
  withdrawals: WithdrawalItem[];
  rules: {
    referralRewardToman: number;
    bugRewardsToman: Record<string, number>;
    minWithdrawalToman: number;
    maxWithdrawalToman: number;
    withdrawalTaxPercent?: number;
    referralNote: string;
    bugNote: string;
  };
  features: { wallet: boolean; referral: boolean; bugReport: boolean };
}

const WITHDRAWAL_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "در انتظار بررسی پشتیبانی", color: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
  APPROVED: { label: "تأیید شد — در حال واریز", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  PAID: { label: "واریز شد", color: "bg-emerald-600/10 text-emerald-700 border-emerald-600/30" },
  REJECTED: { label: "رد شد", color: "bg-red-500/10 text-red-600 border-red-500/30" },
};

function fmtToman(n: number): string {
  return Math.abs(n).toLocaleString("fa-IR") + " تومان";
}

const TX_ICON: Record<string, React.ReactNode> = {
  REFERRAL_BONUS: <Users className="h-4 w-4 text-emerald-600" />,
  BUG_REWARD: <Bug className="h-4 w-4 text-amber-600" />,
  WITHDRAWAL: <ArrowUpRight className="h-4 w-4 text-red-600" />,
  ADMIN_ADJUSTMENT: <ShieldCheck className="h-4 w-4 text-primary" />,
  SIGNUP_GIFT: <Banknote className="h-4 w-4 text-emerald-600" />,
};

export function WalletModule() {
  const { toast } = useToast();
  const [data, setData] = React.useState<WalletData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [disabled, setDisabled] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  // USER-CONTENT(3-d): برچسب‌ها با ذخیرهٔ سوپرادمین همگام می‌شوند (fallback امن)
  const userContentOverrides = useUserContentOverrides();
  void userContentOverrides;
  const balanceLabel = getUserContent("wallet.balance_label", "موجودی کیف پول");
  const withdrawableLabel = getUserContent("wallet.withdrawable_label", "قابل برداشت");
  const transactionsTitle = getUserContent("wallet.transactions_title", "تراکنش‌های کیف پول");

  // فرم برداشت
  const [amount, setAmount] = React.useState("");
  const [cardNumber, setCardNumber] = React.useState("");
  const [shebaNumber, setShebaNumber] = React.useState("");
  const [holderName, setHolderName] = React.useState("");

  const fetchWallet = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/wallet");
      const json = await res.json();
      if (res.status === 403 && json?.code === "WALLET_DISABLED") {
        setDisabled(true);
        return;
      }
      if (json.success) setData(json.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchWallet();
  }, [fetchWallet]);

  const submitWithdrawal = async () => {
    const amountNum = Number(amount.replace(/[,\s٬]/g, ""));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: "مبلغ نامعتبر", description: "مبلغ برداشت را به تومان وارد کنید.", variant: "destructive" });
      return;
    }
    if (!cardNumber.trim() && !shebaNumber.trim()) {
      toast({ title: "شماره حساب لازم است", description: "شماره کارت ۱۶ رقمی یا شبا (IR + ۲۴ رقم) را وارد کنید.", variant: "destructive" });
      return;
    }
    if (holderName.trim().length < 3) {
      toast({ title: "نام صاحب حساب", description: "نام صاحب حساب (مطابق کارت/شبا) را کامل وارد کنید.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountToman: amountNum,
          cardNumber: cardNumber.trim() || undefined,
          shebaNumber: shebaNumber.trim() || undefined,
          holderName: holderName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ثبت درخواست");
      }
      toast({
        title: "درخواست برداشت ثبت شد",
        description: json.message || "پس از بررسی پشتیبانی، مبلغ به حساب شما واریز می‌شود.",
      });
      setAmount("");
      setCardNumber("");
      setShebaNumber("");
      setHolderName("");
      void fetchWallet();
    } catch (err) {
      toast({
        title: "خطا در ثبت برداشت",
        description: err instanceof Error ? err.message : "دوباره تلاش کنید.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (disabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <WalletIcon className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">کیف پول برای پلن فعال شما در دسترس نیست</p>
          <p className="max-w-md text-xs text-muted-foreground">
            برای فعال‌سازی کیف پول و پاداش‌های نقدی (دعوت دوستان و گزارش باگ) با پشتیبانی تماس بگیرید.
          </p>
        </CardContent>
      </Card>
    );
  }

  const balance = data?.balance ?? 0;
  const rules = data?.rules;
  const pendingWithdrawals = (data?.withdrawals ?? []).filter(
    (w) => w.status === "PENDING" || w.status === "APPROVED"
  );
  const availableForWithdraw = balance - pendingWithdrawals.reduce((m, w) => m + w.amountToman, 0);

  return (
    <div className="space-y-6">
      {/* کارت موجودی */}
      <Card className="overflow-hidden border-primary/25">
        <div className="relative bg-gradient-to-l from-primary/15 via-primary/5 to-transparent px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <WalletIcon className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{balanceLabel}</p>
                <p className="text-3xl font-bold tracking-tight tnum">
                  {balance.toLocaleString("fa-IR")}
                  <span className="ms-2 text-sm font-medium text-muted-foreground">تومان</span>
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                {withdrawableLabel}: {availableForWithdraw.toLocaleString("fa-IR")} تومان
              </span>
              {pendingWithdrawals.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  {toPersianDigits(String(pendingWithdrawals.length))} درخواست در انتظار
                </span>
              )}
            </div>
          </div>
        </div>
        {/* راهنمای پاداش‌ها */}
        {rules && (
          <div className="grid gap-3 border-t bg-muted/30 px-6 py-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Users className="h-4.5 w-4.5 h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold">دعوت دوستان</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtToman(rules.referralRewardToman)} بعد از خرید اشتراک توسط دوست شما
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <Bug className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold">گزارش باگ</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtToman(rules.bugRewardsToman?.low ?? 250_000)} تا {fmtToman(rules.bugRewardsToman?.critical ?? 1_000_000)} بعد از تأیید پشتیبانی
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* فرم برداشت */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-primary" />
              درخواست برداشت وجه
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              مبلغ را وارد کنید و شماره کارت یا شبای خود را ثبت نمایید. درخواست شما پس از بررسی
              پشتیبانی، به‌صورت کارت‌به‌کارت یا انتقال شبا واریز می‌شود (معمولاً تا ۷۲ ساعت کاری).
              {rules ? ` حداقل ${rules.minWithdrawalToman.toLocaleString("fa-IR")} تومان.` : ""}
            </p>
            {/* هشدار مالیات برداشت — درخواست مالک: نمایش شفاف ۱۰٪ */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <Percent className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                <strong>برداشت مشمول {toPersianDigits(String(rules?.withdrawalTaxPercent ?? 10))}٪ مالیات است.</strong>{" "}
                از مبلغ درخواستی شما ۱۰٪ به‌عنوان مالیات کسر و مبلغ خالص به حساب شما واریز می‌شود —
                محاسبهٔ دقیق در کادر زیر نمایش داده می‌شود.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wd-amount" className="text-xs">مبلغ برداشت (تومان) *</Label>
              <Input
                id="wd-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={rules ? String(rules.minWithdrawalToman) : "500000"}
                inputMode="numeric"
                disabled={submitting}
              />
              {/* محاسبهٔ زندهٔ مالیات و مبلغ خالص */}
              {(() => {
                const n = Number(String(amount).replace(/[،,\s٬۰-۹]/g, (ch) => (/[۰-۹]/.test(ch) ? String(ch.charCodeAt(0) - 1776) : "")));
                if (!Number.isFinite(n) || n <= 0) return null;
                const tax = Math.round(n * 0.1);
                const net = Math.max(0, n - tax);
                return (
                  <div className="mt-1 rounded-lg border border-border bg-card p-2.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">مبلغ درخواستی</span>
                      <span className="tnum font-medium">{fmtToman(n)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-muted-foreground">مالیات برداشت (۱۰٪)</span>
                      <span className="tnum font-medium text-amber-600">−{fmtToman(tax)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5">
                      <span className="font-medium text-foreground">مبلغ خالص قابل واریز</span>
                      <span className="tnum font-bold text-emerald-600">{fmtToman(net)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wd-card" className="text-xs">شماره کارت (۱۶ رقم)</Label>
              <div className="relative">
                <CreditCard className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="wd-card"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="۶۰۳۷۹۹۷۵۱۲۳۴۵۶۷۸"
                  inputMode="numeric"
                  className="pr-9 pls-3"
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wd-sheba" className="text-xs">یا شماره شبا (IR + ۲۴ رقم)</Label>
              <div className="relative">
                <Landmark className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="wd-sheba"
                  value={shebaNumber}
                  onChange={(e) => setShebaNumber(e.target.value)}
                  placeholder="IR123456789012345678901234"
                  dir="ltr"
                  className="pr-9"
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wd-name" className="text-xs">نام صاحب حساب *</Label>
              <Input
                id="wd-name"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="مثلاً: علی محمدی"
                disabled={submitting}
              />
            </div>
            <Button onClick={submitWithdrawal} disabled={submitting} className="w-full gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              ثبت درخواست برداشت
            </Button>
          </CardContent>
        </Card>

        {/* درخواست‌های برداشت */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              درخواست‌های برداشت من
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data || data.withdrawals.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <Banknote className="h-8 w-8 opacity-30" />
                <p className="text-xs">هنوز درخواست برداشتی ثبت نکرده‌اید</p>
              </div>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto pl-2">
                {data.withdrawals.map((w) => {
                  const st = WITHDRAWAL_STATUS[w.status] ?? WITHDRAWAL_STATUS.PENDING;
                  return (
                    <div key={w.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.color}`}>
                          {st.label}
                        </span>
                        <span className="tnum text-sm font-bold">
                          {w.amountToman.toLocaleString("fa-IR")} تومان
                        </span>
                        <span className="mr-auto text-[11px] text-muted-foreground">
                          {new Date(w.createdAt).toLocaleDateString("fa-IR")}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span>به نام: {w.holderName}</span>
                        {w.netToman != null && w.netToman > 0 && w.taxToman ? (
                          <>
                            <span>مالیات (۱۰٪): {w.taxToman.toLocaleString("fa-IR")} تومان</span>
                            <span className="text-emerald-600">خالص: {w.netToman.toLocaleString("fa-IR")} تومان</span>
                          </>
                        ) : null}
                        {w.cardNumber && w.cardNumber !== "—" && <span dir="ltr">{w.cardNumber}</span>}
                        {w.shebaNumber && w.shebaNumber !== "—" && <span dir="ltr">{w.shebaNumber}</span>}
                      </div>
                      {w.paidAt && (
                        <p className="mt-1.5 text-[11px] text-emerald-600">
                          واریز شده در {new Date(w.paidAt).toLocaleDateString("fa-IR")}
                        </p>
                      )}
                      {w.adminNote && (
                        <div className="mt-2 rounded-lg bg-muted/60 p-2 text-[11px] text-muted-foreground">
                          <span className="font-medium">پاسخ پشتیبانی: </span>
                          {w.adminNote}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* تراکنش‌ها */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowDownLeft className="h-4 w-4 text-primary" />
            {transactionsTitle}
            {data && data.transactions.length > 0 && (
              <Badge variant="secondary" className="font-mono">
                {toPersianDigits(String(data.transactions.length))}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <WalletIcon className="h-8 w-8 opacity-30" />
              <p className="text-xs">هنوز تراکنشی ندارید — دوستان را دعوت کنید یا باگ گزارش دهید تا پاداش بگیرید</p>
            </div>
          ) : (
            <div className="max-h-96 divide-y overflow-y-auto pl-2">
              {data.transactions.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                    {TX_ICON[t.type] ?? <Banknote className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{t.typeLabel}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t.description ?? "—"} • {new Date(t.createdAt).toLocaleDateString("fa-IR")}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className={`tnum text-sm font-bold ${t.amountToman >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {t.amountToman >= 0 ? "+" : "−"}
                      {fmtToman(t.amountToman)}
                    </p>
                    <p className="tnum text-[10px] text-muted-foreground">
                      موجودی: {t.balanceAfter.toLocaleString("fa-IR")}
                    </p>
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

export default WalletModule;
