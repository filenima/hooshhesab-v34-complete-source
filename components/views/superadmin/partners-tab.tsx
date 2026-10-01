"use client";

/**
 * PartnersTab — مدیریت درخواست‌های برنامهٔ شراکت (سوپرادمین، v29)
 * ----------------------------------------------------------------------------
 * - کارت‌های آمار: کل / جدید / در تماس / تأییدشده
 * - فیلتر وضعیت + جست‌وجو (نام/موبایل/شرکت/ایمیل)
 * - جدول درخواست‌ها: جزئیات کامل + تغییر وضعیت (NEW→CONTACTED→APPROVED/REJECTED)
 *   + یادداشت داخلی + حذف
 * - خروجی CSV برای پیگیری خارجی (اکسل/CRM)
 * داده: GET/PATCH/DELETE /api/platform/partners
 */

import * as React from "react";
import {
  Handshake,
  Inbox,
  PhoneCall,
  CheckCircle2,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Trash2,
  Download,
  ExternalLink,
  ChevronLeft,
  Globe,
  Mail,
  Building2,
  MapPin,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toPersianDigits } from "@/lib/persian";

interface PartnerRequest {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  city: string | null;
  website: string | null;
  audience: string;
  audienceFa: string;
  channel: string;
  channelFa: string;
  monthlyVisitors: number | null;
  message: string | null;
  status: string;
  statusFa: string;
  notes: string | null;
  createdAt: string;
}

interface Data {
  requests: PartnerRequest[];
  total: number;
  page: number;
  pageSize: number;
  stats: { total: number; byStatus: Record<string, number> };
}

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-primary/15 text-primary border-primary/25",
  CONTACTED: "bg-warning/15 text-warning border-warning/25",
  APPROVED: "bg-success/15 text-success border-success/25",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/25",
};

function apiFetch(path: string, token: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const months = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
    return toPersianDigits(
      `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} — ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    );
  } catch {
    return iso;
  }
}

export function PartnersTab({ token }: { token: string }) {
  const [data, setData] = React.useState<Data | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [q, setQ] = React.useState("");
  const [qInput, setQInput] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (q) params.set("q", q);
      const res = await apiFetch(`/api/platform/partners?${params.toString()}`, token);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در دریافت درخواست‌ها");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, q]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await apiFetch("/api/platform/partners", token, {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در به‌روزرسانی");
    } finally {
      setBusyId(null);
    }
  }

  async function removeRequest(id: string) {
    if (!window.confirm("این درخواست شراکت حذف شود؟ این عمل بازگشت‌پذیر نیست.")) return;
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/platform/partners?id=${encodeURIComponent(id)}`, token, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "خطا");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در حذف");
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    if (!data) return;
    const header = ["نام", "موبایل", "ایمیل", "شرکت", "شهر", "سایت", "گروه مخاطب", "کانال", "بازدید ماهانه", "وضعیت", "یادداشت", "تاریخ ثبت"];
    const rows = data.requests.map((r) => [
      r.name, r.phone, r.email || "", r.company || "", r.city || "", r.website || "",
      r.audienceFa, r.channelFa, r.monthlyVisitors ? String(r.monthlyVisitors) : "",
      r.statusFa, (r.notes || "").replace(/[\n\r,]/g, " "), fmtDateTime(r.createdAt),
    ]);
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hoosh-partners-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = data?.stats;
  const cards = [
    { icon: Handshake, label: "کل درخواست‌ها", value: stats?.total ?? 0, accent: "text-primary", bg: "bg-primary/10" },
    { icon: Inbox, label: "جدید (نیازمند تماس)", value: stats?.byStatus?.NEW ?? 0, accent: "text-chart-5", bg: "bg-chart-5/10" },
    { icon: PhoneCall, label: "تماس گرفته‌شده", value: stats?.byStatus?.CONTACTED ?? 0, accent: "text-warning", bg: "bg-warning/10" },
    { icon: CheckCircle2, label: "تأییدشده (شرکای فعال)", value: stats?.byStatus?.APPROVED ?? 0, accent: "text-success", bg: "bg-success/10" },
  ];

  const filters = [
    { value: "", label: "همه" },
    { value: "NEW", label: "جدید" },
    { value: "CONTACTED", label: "تماس گرفته‌شده" },
    { value: "APPROVED", label: "تأییدشده" },
    { value: "REJECTED", label: "ردشده" },
  ];

  return (
    <div className="space-y-5">
      {/* هدر تب */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-foreground">
            <Handshake className="h-5 w-5 text-primary" aria-hidden />
            درخواست‌های برنامهٔ شراکت
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            فرم عمومی <span dir="ltr" className="font-mono">/partners</span> → اینجا؛ چرخه: جدید → تماس → تأیید/رد
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/partners"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            مشاهدهٔ صفحهٔ عمومی
          </a>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data || data.requests.length === 0}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            خروجی CSV
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            به‌روزرسانی
          </Button>
        </div>
      </div>

      {/* کارت‌های آمار */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="relative overflow-hidden">
              <div className={`absolute inset-x-0 top-0 h-0.5 ${c.accent.replace("text-", "bg-")}`} />
              <CardContent className="flex items-center gap-3 p-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.bg} ${c.accent}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[26px] font-extrabold leading-none tracking-tight text-foreground">
                    {toPersianDigits(String(c.value))}
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* فیلترها + جست‌وجو */}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all active:scale-[0.98] ${
              statusFilter === f.value
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {f.label}
            {f.value && stats?.byStatus?.[f.value] ? ` (${toPersianDigits(String(stats.byStatus[f.value] ?? 0))})` : ""}
          </button>
        ))}
        <form
          className="relative mr-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput.trim());
          }}
        >
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="جست‌وجوی نام، موبایل، شرکت…"
            className="h-9 w-56 rounded-lg pr-9 text-xs"
          />
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs font-medium text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {/* جدول درخواست‌ها */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">فهرست درخواست‌ها {data ? `(${toPersianDigits(String(data.total))})` : ""}</CardTitle>
          <CardDescription className="text-xs">روی هر ردیف کلیک کنید تا جزئیات کامل و یادداشت‌ها باز شود</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !data || data.requests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <Handshake className="h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-bold text-foreground">درخواستی یافت نشد</p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                هنوز درخواستی با این فیلتر ثبت نشده است. صفحهٔ عمومی برنامهٔ شراکت در حال جذب لید است — آمار
                بازدید ویجت‌ها را در تب «آمار ویجت‌های شرکا» ببینید.
              </p>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              {data.requests.map((r) => (
                <div key={r.id} className="border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-muted/40"
                  >
                    <ChevronLeft
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${expandedId === r.id ? "-rotate-90" : ""}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{r.name}</span>
                        <span dir="ltr" className="font-mono text-xs text-muted-foreground">{r.phone}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status] || "border-border"}`}
                        >
                          {r.statusFa}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {r.audienceFa} · {r.channelFa}
                        {r.company ? ` · ${r.company}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
                  </button>

                  {expandedId === r.id && (
                    <div className="border-t border-border/40 bg-muted/20 px-4 py-4">
                      <div className="grid gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 text-primary/70" aria-hidden />
                          {r.email ? <span dir="ltr">{r.email}</span> : "ایمیل ثبت نشده"}
                        </p>
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5 text-primary/70" aria-hidden />
                          {r.company || "بدون شرکت"}
                        </p>
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-primary/70" aria-hidden />
                          {r.city || "بدون شهر"}
                        </p>
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Globe className="h-3.5 w-3.5 text-primary/70" aria-hidden />
                          {r.website ? <span dir="ltr">{r.website}</span> : "بدون سایت"}
                        </p>
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-3.5 w-3.5 text-primary/70" aria-hidden />
                          {r.monthlyVisitors ? `${toPersianDigits(r.monthlyVisitors.toLocaleString("en"))} بازدید ماهانه` : "بازدید نامشخص"}
                        </p>
                      </div>
                      {r.message && (
                        <div className="mt-3 rounded-lg border border-border/60 bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                          <span className="font-bold text-foreground">پیام متقاضی: </span>
                          {r.message}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {(["CONTACTED", "APPROVED", "REJECTED", "NEW"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={busyId === r.id || r.status === s}
                            onClick={() => updateStatus(r.id, s)}
                            className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all active:scale-[0.98] disabled:opacity-40 ${
                              STATUS_STYLE[s]
                            }`}
                          >
                            {s === "NEW" ? "بازگشت به جدید" : s === "CONTACTED" ? "علامت تماس گرفته‌شد" : s === "APPROVED" ? "تأیید شراکت" : "رد درخواست"}
                          </button>
                        ))}
                        {busyId === r.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => removeRequest(r.id)}
                          className="mr-auto inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-[11px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          حذف
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
