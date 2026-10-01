"use client";

import * as React from "react";
import {
  Globe,
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Trash2,
  Star,
  ShieldCheck,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { toJalali, toPersianDigits } from "@/lib/persian";

// ============ تب «دامنه‌ها» پنل سوپرادمین (۲۱-e — Feature ③) ============
// مدیریت دامنه‌های اختصاصی tenantها: مشاهده، فیلتر، تأیید دستی، رد،
// بررسی DNS، دامنه اصلی کردن و حذف.
// ساختار tab از الگوی موجود پنل سوپرادمین (کارت + جدول + فیلتر) پیروی می‌کند.

interface DomainRow {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED";
  isPrimary: boolean;
  dnsTxtRecord: string | null;
  verificationToken: string;
  txtName: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  notes: string | null;
  createdAt: string;
  tenantId: string;
  tenantName: string | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  PENDING: {
    label: "در انتظار",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    icon: Clock,
  },
  VERIFYING: {
    label: "در حال بررسی",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    icon: Loader2,
  },
  VERIFIED: {
    label: "تأییدشده",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  FAILED: {
    label: "ردشده",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    icon: XCircle,
  },
};

function statusBadge(status: string) {
  return (
    STATUS_BADGE[status] || {
      label: status,
      className: "bg-muted text-muted-foreground",
      icon: Ban,
    }
  );
}

function jalali(iso: string | null): string {
  if (!iso) return "—";
  try {
    return toJalali(new Date(iso));
  } catch {
    return "—";
  }
}

export function DomainRegistrationTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [domains, setDomains] = React.useState<DomainRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const apiFetch = (path: string, options: RequestInit = {}) =>
    fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const q = search.trim().toLowerCase();
      if (q) params.set("q", q);
      const res = await apiFetch(`/api/platform/domains?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      setDomains(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "دریافت دامنه‌ها ناموفق بود",
      });
      setDomains([]);
    } finally {
      setLoading(false);
    }
     
  }, [statusFilter, search, token, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (id: string, action: string, notes?: string) => {
    setBusyId(id);
    try {
      const res = await apiFetch("/api/platform/domains", {
        method: "POST",
        body: JSON.stringify({ id, action, notes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({ title: "انجام شد", description: json.message || "عملیات با موفقیت انجام شد" });
      // به‌روزرسانی ردیف محلی
      setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, ...json.data } : d)));
    } catch (e) {
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "عملیات ناموفق بود",
      });
    } finally {
      setBusyId(null);
    }
  };

  const deleteDomain = async (id: string, domain: string) => {
    if (!confirm(`دامنه ${domain} حذف شود؟ این عمل قابل بازگشت نیست.`)) return;
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/platform/domains?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({ title: "حذف شد", description: json.message || "دامنه حذف شد" });
      setDomains((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "حذف ناموفق بود",
      });
    } finally {
      setBusyId(null);
    }
  };

  const counts = React.useMemo(() => {
    const c = { PENDING: 0, VERIFIED: 0, FAILED: 0, total: domains.length };
    for (const d of domains) {
      if (d.status === "PENDING" || d.status === "VERIFYING") c.PENDING++;
      else if (d.status === "VERIFIED") c.VERIFIED++;
      else if (d.status === "FAILED") c.FAILED++;
    }
    return c;
  }, [domains]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            دامنه‌های اختصاصی
          </CardTitle>
          <CardDescription>
            دامنه‌هایی که کسب‌وکارها برای دسترسی اختصاصی ثبت کرده‌اند — تأیید مالکیت با رکورد
            TXT در DNS انجام می‌شود؛ در صورت مشکل بررسی، تأیید دستی در دسترس است.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* آمار و فیلترها */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className="text-[10px] bg-muted text-muted-foreground">
                کل: {toPersianDigits(String(counts.total))}
              </Badge>
              <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                در انتظار: {toPersianDigits(String(counts.PENDING))}
              </Badge>
              <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                تأییدشده: {toPersianDigits(String(counts.VERIFIED))}
              </Badge>
              <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                ردشده: {toPersianDigits(String(counts.FAILED))}
              </Badge>
            </div>
            <div className="sm:ms-auto flex items-center gap-2 flex-1 sm:max-w-md">
              <div className="relative flex-1">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جستجوی دامنه..."
                  className="h-8 text-xs ps-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="PENDING" className="text-xs">در انتظار</SelectItem>
                  <SelectItem value="VERIFIED" className="text-xs">تأییدشده</SelectItem>
                  <SelectItem value="FAILED" className="text-xs">ردشده</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => void load()}
                disabled={loading}
                aria-label="بروزرسانی"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* جدول دامنه‌ها */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin ml-2" />
              در حال بارگذاری دامنه‌ها...
            </div>
          ) : domains.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">دامنه‌ای یافت نشد</p>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter !== "ALL" || search
                  ? "فیلترها را تغییر دهید یا جستجو را پاک کنید"
                  : "هنوز هیچ کسب‌کاری دامنه اختصاصی ثبت نکرده است — کاربران از بخش «حساب من ← دامنه اختصاصی» دامنه ثبت می‌کنند"}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-xs">دامنه</TableHead>
                    <TableHead className="text-xs">سازمان</TableHead>
                    <TableHead className="text-xs">وضعیت</TableHead>
                    <TableHead className="text-xs">ثبت</TableHead>
                    <TableHead className="text-xs">آخرین بررسی</TableHead>
                    <TableHead className="text-xs text-center">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((d) => {
                    const badge = statusBadge(d.status);
                    const StatusIcon = badge.icon;
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {d.isPrimary && (
                              <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="دامنه اصلی" />
                            )}
                            <code className="font-mono text-xs" dir="ltr" title={d.txtName}>
                              {d.domain}
                            </code>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {d.tenantName || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] h-5 gap-1 ${badge.className}`}>
                            <StatusIcon
                              className={`h-3 w-3 ${d.status === "VERIFYING" ? "animate-spin" : ""}`}
                            />
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {jalali(d.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {jalali(d.lastCheckedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {/* بررسی DNS */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              disabled={busyId === d.id || d.status === "VERIFIED"}
                              onClick={() => void runAction(d.id, "verify")}
                              title="بررسی رکورد DNS"
                            >
                              {busyId === d.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              بررسی DNS
                            </Button>
                            {/* تأیید دستی */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] gap-1 text-emerald-600 hover:text-emerald-700"
                              disabled={busyId === d.id || d.status === "VERIFIED"}
                              onClick={() => void runAction(d.id, "approve")}
                              title="تأیید دستی (بی‌نیاز از DNS)"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              تأیید دستی
                            </Button>
                            {/* رد */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] gap-1 text-amber-600 hover:text-amber-700"
                              disabled={busyId === d.id}
                              onClick={() => void runAction(d.id, "reject")}
                              title="رد دامنه"
                            >
                              <Ban className="h-3 w-3" />
                              رد
                            </Button>
                            {/* دامنه اصلی */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              disabled={busyId === d.id || d.isPrimary}
                              onClick={() => void runAction(d.id, "primary")}
                              title="دامنه اصلی این سازمان شود"
                            >
                              <Star className="h-3 w-3" />
                              اصلی
                            </Button>
                            {/* حذف */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              disabled={busyId === d.id}
                              onClick={() => void deleteDomain(d.id, d.domain)}
                              aria-label="حذف دامنه"
                              title="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
