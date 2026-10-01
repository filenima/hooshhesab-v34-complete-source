"use client";

// ============ هوش — تب «کیف پول و برداشت‌ها» (پنل سوپرادمین، Task 24) ============
// بررسی درخواست‌های برداشت (تأیید → نمایش کارت/شبا → واریز → ثبت PAID)
// + سوییچ‌های per-plan (کیف پول / دعوت دوستان / گزارش باگ)
// + شارژ/کسر دستی کیف پول سازمان‌ها. بدون ایموجی.

import * as React from "react";
import {
  Wallet as WalletIcon,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Eye,
  Loader2,
  RefreshCw,
  Landmark,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  XCircle,
  Users,
  Bug,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

interface WithdrawalRow {
  id: string;
  amountToman: number;
  taxToman?: number | null;
  netToman?: number | null;
  holderName: string;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  cardNumber: string | null;
  shebaNumber: string | null;
  tenant: { id: string; name: string; plan: string; status: string } | null;
  user: { id: string; name: string | null; email: string } | null;
}

interface OverviewData {
  stats: {
    totalBalance: number;
    totalCredit: number;
    totalWithdrawn: number;
    totalWithdrawalCount: number;
    byType: Array<{ type: string; sumToman: number; count: number }>;
    withdrawalByStatus: Array<{ status: string; count: number; sumToman: number }>;
  };
  toggles: Record<string, { wallet: boolean; referral: boolean; bugReport: boolean }>;
  rules: {
    referralRewardToman: number;
    bugRewardsToman: Record<string, number>;
    minWithdrawalToman: number;
    maxWithdrawalToman: number;
  };
  recentTransactions: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    type: string;
    amountToman: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
  }>;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "در انتظار بررسی", color: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
  APPROVED: { label: "تأیید شد — آماده واریز", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  PAID: { label: "واریز شد", color: "bg-emerald-600/10 text-emerald-700 border-emerald-600/30" },
  REJECTED: { label: "رد شد", color: "bg-red-500/10 text-red-600 border-red-500/30" },
};

const PLAN_LABELS: Record<string, string> = {
  free: "رایگان",
  basic: "پایه",
  pro: "حرفه‌ای",
  enterprise: "سازمانی",
};

const TYPE_LABELS: Record<string, string> = {
  REFERRAL_BONUS: "پاداش دعوت",
  BUG_REWARD: "پاداش باگ",
  WITHDRAWAL: "برداشت",
  ADMIN_ADJUSTMENT: "تعدیل دستی",
  SIGNUP_GIFT: "هدیه ثبت‌نام",
};

function fmt(n: number): string {
  return Math.abs(n).toLocaleString("fa-IR");
}

export function WalletAdminTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [withdrawals, setWithdrawals] = React.useState<WithdrawalRow[]>([]);
  const [stats, setStats] = React.useState<{ byStatus: Array<{ status: string; count: number; sumToman: number }>; totalPaidToman: number } | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("PENDING");
  const [overview, setOverview] = React.useState<OverviewData | null>(null);

  // دیالوگ‌ها
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [detailsData, setDetailsData] = React.useState<{
    id: string;
    cardNumber: string | null;
    shebaNumber: string | null;
    holderName: string;
    amountToman: number;
  } | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectTarget, setRejectTarget] = React.useState<WithdrawalRow | null>(null);
  const [rejectNote, setRejectNote] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // سوییچ‌های per-plan
  const [toggles, setToggles] = React.useState<Record<string, { wallet: boolean; referral: boolean; bugReport: boolean }>>({});
  const [savingToggles, setSavingToggles] = React.useState(false);

  // تعدیل دستی
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [adjustTenantId, setAdjustTenantId] = React.useState("");
  const [adjustAmount, setAdjustAmount] = React.useState("");
  const [adjustNote, setAdjustNote] = React.useState("");
  const [adjustMode, setAdjustMode] = React.useState<"credit" | "debit">("credit");
  const [adjustSubmitting, setAdjustSubmitting] = React.useState(false);

  const fetchWithdrawals = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/platform/wallet/withdrawals?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setWithdrawals(json.data || []);
        setStats(json.stats || null);
      }
    } catch {
      toast({ title: "خطا در دریافت درخواست‌های برداشت", variant: "destructive" });
    }
  }, [token, statusFilter, toast]);

  const fetchOverview = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/platform/wallet/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setOverview(json.data || null);
        if (json.data?.toggles) setToggles(json.data.toggles);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    void fetchWithdrawals();
  }, [fetchWithdrawals]);

  React.useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const patchWithdrawal = async (id: string, action: string, adminNote?: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/platform/wallet/withdrawals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, action, adminNote }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در پردازش");
      }
      toast({ title: "انجام شد", description: json.message });
      // اگر approve/unlock بود → دیالوگ شماره‌ها
      if (json.data && (json.data.cardNumber || json.data.shebaNumber)) {
        setDetailsData({
          id,
          cardNumber: json.data.cardNumber ?? null,
          shebaNumber: json.data.shebaNumber ?? null,
          holderName: json.data.holderName ?? "—",
          amountToman: json.data.amountToman ?? 0,
        });
        setDetailsOpen(true);
      }
      await fetchWithdrawals();
      void fetchOverview();
    } catch (err) {
      toast({
        title: "خطا",
        description: err instanceof Error ? err.message : "دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const saveToggles = async () => {
    setSavingToggles(true);
    try {
      const res = await fetch(`/api/platform/wallet/overview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "save_toggles", toggles }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا در ذخیره");
      toast({ title: "ذخیره شد", description: json.message });
    } catch (err) {
      toast({
        title: "خطا در ذخیره تنظیمات",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setSavingToggles(false);
    }
  };

  const submitAdjust = async () => {
    const amount = Number(adjustAmount.replace(/[,\s٬۰-۹]/g, (m) => (/[۰-۹]/.test(m) ? String("۰۱۲۳۴۵۶۷۸۹".indexOf(m)) : "")));
    if (!adjustTenantId.trim()) {
      toast({ title: "شناسه سازمان الزامی است", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "مبلغ نامعتبر", variant: "destructive" });
      return;
    }
    setAdjustSubmitting(true);
    try {
      const res = await fetch(`/api/platform/wallet/overview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: adjustMode,
          tenantId: adjustTenantId.trim(),
          amountToman: amount,
          note: adjustNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({ title: "انجام شد", description: json.message });
      setAdjustOpen(false);
      setAdjustTenantId("");
      setAdjustAmount("");
      setAdjustNote("");
      void fetchOverview();
    } catch (err) {
      toast({
        title: "خطا در تعدیل",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const pendingCount = stats?.byStatus?.find((s) => s.status === "PENDING")?.count ?? 0;

  return (
    <div className="space-y-6">
      {/* آمار کلی */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">مجموع موجودی کیف‌ها</p>
                <p className="tnum text-xl font-bold">{fmt(overview?.stats.totalBalance ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground">تومان</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <WalletIcon className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">کل پاداش‌های پرداختی</p>
                <p className="tnum text-xl font-bold">{fmt(overview?.stats.totalCredit ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground">تومان</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <ArrowDownLeft className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">کل برداشت‌های واریزشده</p>
                <p className="tnum text-xl font-bold">{fmt(overview?.stats.totalWithdrawn ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground">تومان • {toPersianDigits(String(overview?.stats.totalWithdrawalCount ?? 0))} مورد</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                <ArrowUpRight className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">برداشت در انتظار بررسی</p>
                <p className="tnum text-xl font-bold text-amber-600">{toPersianDigits(String(pendingCount))}</p>
                <p className="text-[10px] text-muted-foreground">نیازمند اقدام شما</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* درخواست‌های برداشت */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" />
            درخواست‌های برداشت وجه
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">در انتظار بررسی</SelectItem>
                <SelectItem value="APPROVED">تأییدشده</SelectItem>
                <SelectItem value="PAID">واریزشده</SelectItem>
                <SelectItem value="REJECTED">ردشده</SelectItem>
                <SelectItem value="all">همه</SelectItem>
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" onClick={() => { void fetchWithdrawals(); void fetchOverview(); }} aria-label="بروزرسانی">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <WalletIcon className="h-10 w-10 opacity-30" />
              <p className="text-xs">درخواستی با این وضعیت وجود ندارد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w) => {
                const st = STATUS_META[w.status] ?? STATUS_META.PENDING;
                return (
                  <div key={w.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.color}`}>
                        {st.label}
                      </span>
                      <span className="tnum text-sm font-bold">{fmt(w.amountToman)} تومان</span>
                      {w.netToman != null && w.netToman > 0 && w.taxToman ? (
                        <span className="tnum text-[11px] text-muted-foreground">
                          (مالیات ۱۰٪: {fmt(w.taxToman)} — خالص: <span className="text-emerald-600 font-medium">{fmt(w.netToman)}</span>)
                        </span>
                      ) : null}
                      <Badge variant="outline" className="text-[10px]">{PLAN_LABELS[w.tenant?.plan ?? ""] ?? w.tenant?.plan}</Badge>
                      <span className="mr-auto text-[11px] text-muted-foreground">
                        {new Date(w.createdAt).toLocaleDateString("fa-IR")}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>سازمان: {w.tenant?.name ?? "—"}</span>
                      <span>کاربر: {w.user?.name || (w.user?.email ?? "—")}</span>
                      <span>به نام: {w.holderName}</span>
                    </div>
                    {/* شماره‌های ماسک‌شده (قبل از approve) */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" dir="ltr">
                      {w.cardNumber && w.cardNumber !== "—" && (
                        <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                          <CreditCard className="h-3 w-3" /> {w.cardNumber}
                        </span>
                      )}
                      {w.shebaNumber && w.shebaNumber !== "—" && (
                        <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                          <Landmark className="h-3 w-3" /> {w.shebaNumber}
                        </span>
                      )}
                    </div>
                    {w.adminNote && (
                      <div className="mt-2 rounded-lg bg-muted/60 p-2 text-[11px] text-muted-foreground">
                        {w.adminNote}
                      </div>
                    )}
                    {/* اقدامات */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {w.status === "PENDING" && (
                        <>
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={busyId === w.id}
                            onClick={() => void patchWithdrawal(w.id, "approve")}
                          >
                            {busyId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            تأیید + نمایش شماره‌ها
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5"
                            disabled={busyId === w.id}
                            onClick={() => { setRejectTarget(w); setRejectNote(""); setRejectOpen(true); }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            رد
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={busyId === w.id}
                            onClick={() => void patchWithdrawal(w.id, "unlock_details")}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            نمایش موقت شماره‌ها
                          </Button>
                        </>
                      )}
                      {w.status === "APPROVED" && (
                        <>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                            disabled={busyId === w.id}
                            onClick={() => void patchWithdrawal(w.id, "mark_paid")}
                          >
                            {busyId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                            واریز شد (کسر از کیف)
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={busyId === w.id}
                            onClick={() => void patchWithdrawal(w.id, "unlock_details")}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            شماره‌ها
                          </Button>
                        </>
                      )}
                      {w.status === "PAID" && (
                        <span className="text-[11px] text-emerald-600">
                          واریز شده در {w.paidAt ? new Date(w.paidAt).toLocaleDateString("fa-IR") : "—"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* سوییچ‌های per-plan */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-primary" />
            فعال/غیرفعال‌سازی قابلیت‌ها به تفکیک پلن
          </CardTitle>
          <Button size="sm" className="gap-1.5" onClick={() => void saveToggles()} disabled={savingToggles}>
            {savingToggles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            ذخیره تنظیمات
          </Button>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-muted-foreground">
            هر پلن را می‌توانید جداگانه کنترل کنید: کیف پول (پاداش نقدی + برداشت)، دعوت دوستان، گزارش باگ.
            غیرفعال‌کردن، ماژول را برای کاربران آن پلن مخفی می‌کند و پاداش جدیدی اعطا نمی‌شود.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-muted-foreground border-b">
                  <th className="font-medium px-3 py-2 text-right">پلن</th>
                  <th className="font-medium px-3 py-2">کیف پول</th>
                  <th className="font-medium px-3 py-2">دعوت دوستان</th>
                  <th className="font-medium px-3 py-2">گزارش باگ</th>
                </tr>
              </thead>
              <tbody>
                {(["free", "basic", "pro", "enterprise"] as const).map((planId) => {
                  const t = toggles[planId] ?? { wallet: true, referral: true, bugReport: true };
                  const toggle = (key: "wallet" | "referral" | "bugReport") => {
                    setToggles((prev) => ({
                      ...prev,
                      [planId]: { ...(prev[planId] ?? { wallet: true, referral: true, bugReport: true }), [key]: !(prev[planId]?.[key] ?? true) },
                    }));
                  };
                  const ToggleCell = ({ k, icon }: { k: "wallet" | "referral" | "bugReport"; icon: React.ReactNode }) => (
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(k)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                          t[k]
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                            : "border-border bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        {t[k] ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                        {t[k] ? "فعال" : "غیرفعال"}
                        {icon}
                      </button>
                    </td>
                  );
                  return (
                    <tr key={planId} className="border-b border-border/40">
                      <td className="px-3 py-3 font-medium">{PLAN_LABELS[planId]}</td>
                      <ToggleCell k="wallet" icon={<WalletIcon className="h-3 w-3" />} />
                      <ToggleCell k="referral" icon={<Users className="h-3 w-3" />} />
                      <ToggleCell k="bugReport" icon={<Bug className="h-3 w-3" />} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {overview && (
            <div className="mt-4 rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
              قوانین فعلی پاداش: دعوت دوست {fmt(overview.rules.referralRewardToman)} تومان (پس از خرید اشتراک) •
              باگ: کم {fmt(overview.rules.bugRewardsToman?.low ?? 0)} / متوسط {fmt(overview.rules.bugRewardsToman?.medium ?? 0)} /
              زیاد {fmt(overview.rules.bugRewardsToman?.high ?? 0)} / بحرانی {fmt(overview.rules.bugRewardsToman?.critical ?? 0)} تومان •
              حداقل برداشت {fmt(overview.rules.minWithdrawalToman)} تومان
            </div>
          )}
        </CardContent>
      </Card>

      {/* تعدیل دستی + تراکنش‌های اخیر */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <WalletIcon className="h-4 w-4 text-primary" />
              شارژ / کسر دستی کیف پول
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              برای هدیه، جبران یا اصلاح — شناسه سازمان (tenant id) را از تب «سازمان‌ها» کپی کنید.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setAdjustMode("credit")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${adjustMode === "credit" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground hover:bg-muted/50"}`}
              >
                شارژ (افزایش)
              </button>
              <button
                type="button"
                onClick={() => setAdjustMode("debit")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${adjustMode === "debit" ? "border-red-500/50 bg-red-500/10 text-red-600" : "border-border text-muted-foreground hover:bg-muted/50"}`}
              >
                کسر (کاهش)
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">شناسه سازمان (tenantId)</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={adjustTenantId}
                  onChange={(e) => setAdjustTenantId(e.target.value)}
                  placeholder="cmxxxxxxxxxxxxxxxx"
                  dir="ltr"
                  className="pr-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">مبلغ (تومان)</Label>
              <Input
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="1000000"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">یادداشت (اختیاری)</Label>
              <Textarea
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="مثلاً: هدیه جبرانی بابت اختلال درگاه پرداخت"
                rows={2}
              />
            </div>
            <Button className="w-full gap-2" onClick={() => void submitAdjust()} disabled={adjustSubmitting}>
              {adjustSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              اعمال {adjustMode === "credit" ? "شارژ" : "کسر"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ChevronRight className="h-4 w-4 text-primary" />
              آخرین تراکنش‌های کیف پول
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!overview || overview.recentTransactions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <WalletIcon className="h-8 w-8 opacity-30" />
                <p className="text-xs">هنوز تراکنشی ثبت نشده است</p>
              </div>
            ) : (
              <div className="max-h-96 divide-y overflow-y-auto pl-2 compact-scroll">
                {overview.recentTransactions.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {TYPE_LABELS[t.type] ?? t.type} — {t.tenantName}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {t.description ?? "—"} • {new Date(t.createdAt).toLocaleDateString("fa-IR")}
                      </p>
                    </div>
                    <p className={`tnum text-xs font-bold ${t.amountToman >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {t.amountToman >= 0 ? "+" : "−"}{fmt(t.amountToman)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* دیالوگ نمایش شماره‌ها (بعد از تأیید) */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md compact-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              اطلاعات واریز
            </DialogTitle>
            <DialogDescription>
              مبلغ را کارت‌به‌کارت یا با شبا واریز کنید، سپس در لیست «واریز شد» را بزنید.
            </DialogDescription>
          </DialogHeader>
          {detailsData && (
            <div className="space-y-2 py-1">
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-[11px] text-muted-foreground">مبلغ قابل واریز</p>
                <p className="tnum text-base font-bold">{fmt(detailsData.amountToman)} تومان</p>
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-[11px] text-muted-foreground mb-0.5">به نام</p>
                <p className="text-sm font-medium">{detailsData.holderName}</p>
              </div>
              {detailsData.cardNumber && (
                <div className="rounded-lg border p-2.5">
                  <p className="text-[11px] text-muted-foreground mb-0.5">شماره کارت</p>
                  <p className="font-mono text-sm tracking-wider" dir="ltr">{detailsData.cardNumber}</p>
                </div>
              )}
              {detailsData.shebaNumber && (
                <div className="rounded-lg border p-2.5">
                  <p className="text-[11px] text-muted-foreground mb-0.5">شماره شبا</p>
                  <p className="font-mono text-sm" dir="ltr">{detailsData.shebaNumber}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailsOpen(false)}>متوجه شدم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ رد */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md compact-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              رد درخواست برداشت
            </DialogTitle>
            <DialogDescription>
              مبلغ در کیف پول کاربر باقی می‌ماند. دلیل رد برای کاربر ارسال می‌شود.
            </DialogDescription>
          </DialogHeader>
          {rejectTarget && (
            <div className="rounded-xl border bg-muted/30 p-3 text-xs">
              <p className="font-medium">{rejectTarget.tenant?.name} — {fmt(rejectTarget.amountToman)} تومان</p>
              <p className="text-muted-foreground mt-1">به نام {rejectTarget.holderName}</p>
            </div>
          )}
          <div className="space-y-1.5 py-1">
            <Label className="text-xs">دلیل رد</Label>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="مثلاً: نام صاحب حساب با اطلاعات کاربر مطابقت ندارد"
              rows={2}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>انصراف</Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || busyId === rejectTarget?.id}
              onClick={() => {
                if (rejectTarget) void patchWithdrawal(rejectTarget.id, "reject", rejectNote.trim());
                setRejectOpen(false);
              }}
            >
              رد درخواست
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
