"use client";

// ============ هوش — تب «کدهای تخفیف» (v32 — پنل سوپرادمین) ============
// مدیریت کدهای تخفیف قابل‌واردکردن در چک‌اوت:
//   GET/POST/PATCH     /api/platform/coupons      (فهرست/ایجاد/فعال‌سازی)
//   PATCH/DELETE       /api/platform/coupons/[id] (ویرایش/حذف)
// موتور ارزیابی مشترک: lib/coupons.ts (در مسیرهای پرداخت و /api/coupons/validate)
// برخلاف «تخفیف‌های خودکار»، این‌ها را کاربر باید در مودال پرداخت وارد کند.

import * as React from "react";
import {
  History,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Sparkles,
  TicketPercent,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, toEnglishDigits, toJalali, toPersianDigits } from "@/lib/persian";

// ============ انواع و برچسب‌های فارسی ============

interface CouponRow {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxDiscountToman: number | null;
  minAmountToman: number | null;
  planIds: string | null;
  planIdList?: string[];
  maxUses: number;
  usedCount: number;
  perUserLimit: number;
  firstTimeOnly: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  // مشتق‌شده از سرور:
  expired?: boolean;
  notStarted?: boolean;
  exhausted?: boolean;
  status?: "ACTIVE" | "INACTIVE" | "EXPIRED" | "NOT_STARTED" | "EXHAUSTED";
}

interface CouponStats {
  total: number;
  activeCount: number;
  totalUses: number;
  totalUsedCounters: number;
  totalDiscountToman: number;
}

const PLAN_LABELS: Record<string, string> = {
  free: "رایگان",
  basic: "پایه",
  pro: "حرفه‌ای",
  enterprise: "سازمانی",
};
const ALL_PLANS = ["basic", "pro", "enterprise"] as const;

const STATUS_LABELS: Record<NonNullable<CouponRow["status"]>, string> = {
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  EXPIRED: "منقضی",
  NOT_STARTED: "شروع نشده",
  EXHAUSTED: "ظرفیت تمام شده",
};

/** اثر کد به فارسی — «۴۰٪ تخفیف» / «۵۰۰٬۰۰۰ تومان تخفیف» */
function effectText(c: { type: string; value: number }): string {
  if (c.type === "FIXED") return `${formatNumber(c.value)} تومان تخفیف`;
  const v = Number(c.value) || 0;
  const shown = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
  return `${toPersianDigits(shown)}٪ تخفیف`;
}

/** تاریخ شمسی اختیاری — null → «—» */
function jalaliDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return toJalali(d);
}

// ============ حالت فرم ایجاد/ویرایش ============

interface FormState {
  code: string;
  type: "PERCENT" | "FIXED";
  value: string;
  maxDiscountToman: string; // "" = بدون سقف
  minAmountToman: string; // "" = بدون شرط
  planIds: string[];
  maxUses: string; // "" = ۰ (نامحدود)
  perUserLimit: string;
  firstTimeOnly: boolean;
  startsAt: string; // yyyy-mm-dd یا ""
  expiresAt: string;
  note: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  code: "",
  type: "PERCENT",
  value: "20",
  maxDiscountToman: "",
  minAmountToman: "",
  planIds: [],
  maxUses: "",
  perUserLimit: "1",
  firstTimeOnly: false,
  startsAt: "",
  expiresAt: "",
  note: "",
  active: true,
};

/** پارس عددی ورودی فرم — ارقام فارسی هم پذیرفته می‌شود */
function parseNum(raw: string): number | null {
  const s = toEnglishDigits(raw.trim().replace(/[,،\s]/g, ""));
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** تولید کد تصادفی سمت کلاینت — فقط برای پیشنهاد؛ سرور هم generate دارد */
function suggestCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function CouponsTab({ token }: { token?: string }) {
  const { toast } = useToast();
  const [coupons, setCoupons] = React.useState<CouponRow[]>([]);
  const [stats, setStats] = React.useState<CouponStats>({
    total: 0,
    activeCount: 0,
    totalUses: 0,
    totalUsedCounters: 0,
    totalDiscountToman: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CouponRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({ Authorization: `Bearer ${token ?? ""}` }),
    [token]
  );

  const fetchCoupons = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/coupons", { headers: authHeaders });
      const json = await res.json();
      if (json.success) {
        setCoupons(json.data.coupons || []);
        setStats(json.data.stats || { total: 0, activeCount: 0, totalUses: 0, totalUsedCounters: 0, totalDiscountToman: 0 });
      } else {
        toast({ title: "خطا در دریافت کدها", description: json.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا در دریافت کدها", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, toast]);

  React.useEffect(() => {
    void fetchCoupons();
  }, [fetchCoupons]);

  // ============ بازکردن فرم ============
  const openCreate = React.useCallback(() => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, code: suggestCode() });
    setDialogOpen(true);
  }, []);

  const openEdit = React.useCallback((c: CouponRow) => {
    setEditingId(c.id);
    const isoToLocal = (iso: string | null): string => {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    setForm({
      code: c.code,
      type: c.type === "FIXED" ? "FIXED" : "PERCENT",
      value: String(c.value ?? 0),
      maxDiscountToman: c.maxDiscountToman != null ? String(c.maxDiscountToman) : "",
      minAmountToman: c.minAmountToman != null ? String(c.minAmountToman) : "",
      planIds: c.planIdList ?? [],
      maxUses: c.maxUses > 0 ? String(c.maxUses) : "",
      perUserLimit: String(c.perUserLimit ?? 1),
      firstTimeOnly: !!c.firstTimeOnly,
      startsAt: isoToLocal(c.startsAt),
      expiresAt: isoToLocal(c.expiresAt),
      note: c.note ?? "",
      active: !!c.active,
    });
    setDialogOpen(true);
  }, []);

  // ============ ذخیره (ایجاد/ویرایش) ============
  const submitForm = async () => {
    // اعتبارسنجی سمت کلاینت — پیام فارسی (هم‌راستا با سرور)
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) {
      toast({
        title: "کد نامعتبر",
        description: "کد باید ۴ تا ۲۰ کاراکتر از حروف بزرگ انگلیسی و رقم باشد.",
        variant: "destructive",
      });
      return;
    }
    const value = parseNum(form.value);
    if (value === null) {
      toast({ title: "مقدار تخفیف نامعتبر", variant: "destructive" });
      return;
    }
    if (form.type === "PERCENT" && (value < 1 || value > 100)) {
      toast({ title: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد", variant: "destructive" });
      return;
    }
    if (form.type === "FIXED" && (!Number.isInteger(value) || value < 1000)) {
      toast({
        title: "مبلغ ثابت نامعتبر",
        description: "مبلغ تخفیف ثابت باید عدد صحیح دست‌کم ۱٬۰۰۰ تومان باشد.",
        variant: "destructive",
      });
      return;
    }
    const maxCap = form.maxDiscountToman.trim() === "" ? null : parseNum(form.maxDiscountToman);
    if (maxCap !== null && (!Number.isInteger(maxCap) || maxCap < 1000)) {
      toast({ title: "سقف تخفیف باید عدد صحیح ۱٬۰۰۰ تومان یا بیشتر باشد", variant: "destructive" });
      return;
    }
    const minAmount = form.minAmountToman.trim() === "" ? null : parseNum(form.minAmountToman);
    if (minAmount !== null && (!Number.isInteger(minAmount) || minAmount < 1000)) {
      toast({ title: "حداقل مبلغ سبد باید عدد صحیح ۱٬۰۰۰ تومان یا بیشتر باشد", variant: "destructive" });
      return;
    }
    const maxUses = form.maxUses.trim() === "" ? 0 : parseNum(form.maxUses) ?? -1;
    if (maxUses < 0) {
      toast({ title: "ظرفیت کل استفاده نامعتبر", variant: "destructive" });
      return;
    }
    const perUserLimit = parseNum(form.perUserLimit) ?? -1;
    if (perUserLimit < 0) {
      toast({ title: "سقف استفادهٔ هر کاربر نامعتبر", variant: "destructive" });
      return;
    }
    if (form.startsAt && form.expiresAt && form.startsAt >= form.expiresAt) {
      toast({ title: "تاریخ شروع باید قبل از تاریخ انقضا باشد", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code,
        type: form.type,
        value,
        maxDiscountToman: maxCap,
        minAmountToman: minAmount,
        planIds: form.planIds,
        maxUses,
        perUserLimit,
        firstTimeOnly: form.firstTimeOnly,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        note: form.note.trim(),
        ...(editingId ? { active: form.active } : {}),
      };
      const res = await fetch(
        editingId ? `/api/platform/coupons/${encodeURIComponent(editingId)}` : "/api/platform/coupons",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ذخیره");
      }
      toast({ title: editingId ? "کد ذخیره شد" : "کد ایجاد شد", description: json.message });
      setDialogOpen(false);
      void fetchCoupons();
    } catch (err) {
      toast({
        title: "خطا در ذخیره",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ============ فعال/غیرفعال ============
  const toggleCoupon = async (c: CouponRow) => {
    setTogglingId(c.id);
    try {
      const res = await fetch("/api/platform/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ id: c.id, active: !c.active }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({ title: json.message });
      void fetchCoupons();
    } catch (err) {
      toast({
        title: "خطا در تغییر وضعیت",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  };

  // ============ حذف ============
  const deleteCoupon = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/platform/coupons/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({ title: "انجام شد", description: json.message });
      setDeleteTarget(null);
      void fetchCoupons();
    } catch (err) {
      toast({
        title: "خطا در حذف",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  // ============ رندر ============
  return (
    <div className="space-y-4">
      {/* بنر راهنما */}
      <Alert>
        <TicketPercent className="h-4 w-4" />
        <AlertTitle>کدهای تخفیف</AlertTitle>
        <AlertDescription>
          این کدها را کاربر در مودال پرداخت وارد می‌کند — برخلاف «تخفیف‌های خودکار» که بدون
          کد اعمال می‌شوند. کد تخفیف بعد از تخفیف‌های خودکار روی مبلغ اعمال می‌شود.
        </AlertDescription>
      </Alert>

      {/* کارت‌های آماری */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 shrink-0">
              <TicketPercent className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight">کدهای فعال</p>
              <p className="text-xl font-bold tnum leading-tight mt-0.5">
                {toPersianDigits(stats.activeCount)}
                <span className="text-xs font-normal text-muted-foreground mr-1">
                  از {toPersianDigits(stats.total)}
                </span>
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <History className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight">کل استفاده</p>
              <p className="text-xl font-bold tnum leading-tight mt-0.5">
                {toPersianDigits(stats.totalUses)}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 shrink-0">
              <Percent className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight">مجموع تخفیف اعطاشده</p>
              <p className="text-xl font-bold tnum leading-tight mt-0.5">
                {formatNumber(stats.totalDiscountToman)}
                <span className="text-xs font-normal text-muted-foreground mr-1">تومان</span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* سربرگ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Badge variant="secondary">{toPersianDigits(stats.total)} کد</Badge>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="ml-2 h-4 w-4" />
          کد جدید
        </Button>
      </div>

      {/* جدول کدها — اسکرول با اسکرول‌بار سفارشی */}
      {loading ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : coupons.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">هنوز هیچ کد تخفیفی ساخته نشده است</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                اولین کد تخفیف را بسازید و در اختیار مشتریان بگذارید.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="ml-2 h-4 w-4" />
              کد جدید
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-96 overflow-y-auto overflow-x-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
            <Table className="table-zebra">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold text-foreground">کد</TableHead>
                  <TableHead className="font-semibold text-foreground">نوع و مقدار</TableHead>
                  <TableHead className="font-semibold text-foreground">استفاده</TableHead>
                  <TableHead className="font-semibold text-foreground">انقضا</TableHead>
                  <TableHead className="font-semibold text-foreground">وضعیت</TableHead>
                  <TableHead className="font-semibold text-foreground text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((c) => {
                  const status = c.status ?? "ACTIVE";
                  const statusVariant =
                    status === "ACTIVE"
                      ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                      : status === "EXPIRED" || status === "EXHAUSTED"
                        ? "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                        : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400";
                  return (
                    <TableRow key={c.id} className={c.active ? undefined : "opacity-70"}>
                      <TableCell>
                        <span className="font-mono text-sm" dir="ltr">
                          {c.code}
                        </span>
                        {c.firstTimeOnly ? (
                          <Badge variant="outline" className="mr-2 text-[10px] px-1 py-0 h-4">
                            اولین خرید
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{effectText(c)}</span>
                        {c.type === "PERCENT" && c.maxDiscountToman ? (
                          <span className="block text-[11px] text-muted-foreground">
                            سقف {formatNumber(c.maxDiscountToman)} تومان
                          </span>
                        ) : null}
                        {c.minAmountToman ? (
                          <span className="block text-[11px] text-muted-foreground">
                            حداقل سبد {formatNumber(c.minAmountToman)} تومان
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tnum">
                          {toPersianDigits(c.usedCount)}
                          <span className="text-muted-foreground">
                            {" / "}
                            {c.maxUses > 0 ? toPersianDigits(c.maxUses) : "∞"}
                          </span>
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          هر کاربر: {c.perUserLimit > 0 ? toPersianDigits(c.perUserLimit) : "نامحدود"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tnum">{jalaliDate(c.expiresAt)}</span>
                        {c.startsAt ? (
                          <span className="block text-[11px] text-muted-foreground">
                            از {jalaliDate(c.startsAt)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusVariant}>
                          {STATUS_LABELS[status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="flex items-center justify-end gap-1">
                          {togglingId === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Switch
                              checked={c.active}
                              onCheckedChange={() => void toggleCoupon(c)}
                              aria-label={`فعال/غیرفعال کردن کد ${c.code}`}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(c)}
                            aria-label={`ویرایش کد ${c.code}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                            aria-label={`حذف کد ${c.code}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ============ دیالوگ ایجاد/ویرایش ============ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "ویرایش کد تخفیف" : "کد تخفیف جدید"}</DialogTitle>
            <DialogDescription>
              کد را کاربر در مودال پرداخت وارد می‌کند — بعد از تخفیف‌های خودکار روی مبلغ اعمال می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* کد + تولید خودکار */}
            <div className="space-y-1.5">
              <Label htmlFor="cp-code">کد تخفیف</Label>
              <div className="flex gap-2">
                <Input
                  id="cp-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  dir="ltr"
                  className="font-mono"
                  placeholder="مثلاً HOOSH40"
                  maxLength={20}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => setForm((f) => ({ ...f, code: suggestCode() }))}
                  title="تولید کد تصادفی"
                >
                  <Wand2 className="h-4 w-4" />
                  تولید
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                ۴ تا ۲۰ کاراکتر از حروف بزرگ انگلیسی و رقم — بدون فاصله.
              </p>
            </div>

            {/* نوع (segmented) + مقدار */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>نوع تخفیف</Label>
                <div
                  className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-0.5"
                  role="tablist"
                  aria-label="نوع تخفیف"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={form.type === "PERCENT"}
                    onClick={() => setForm((f) => ({ ...f, type: "PERCENT" }))}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      form.type === "PERCENT"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    درصدی
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={form.type === "FIXED"}
                    onClick={() => setForm((f) => ({ ...f, type: "FIXED" }))}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      form.type === "FIXED"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    مبلغ ثابت
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-value">
                  {form.type === "PERCENT" ? "درصد تخفیف (۱ تا ۱۰۰)" : "مبلغ تخفیف (تومان)"}
                </Label>
                <Input
                  id="cp-value"
                  inputMode="numeric"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {form.type === "PERCENT"
                ? "درصدی از مبلغ سبد (پس از تخفیف‌های خودکار) — با سقف اختیاری پایین."
                : "مبلغ ثابت به تومان از مبلغ سبد کسر می‌شود."}
            </p>

            {/* سقف + حداقل سبد */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.type === "PERCENT" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cp-cap">سقف تخفیف (تومان)</Label>
                  <Input
                    id="cp-cap"
                    inputMode="numeric"
                    value={form.maxDiscountToman}
                    onChange={(e) => setForm((f) => ({ ...f, maxDiscountToman: e.target.value }))}
                    placeholder="بدون سقف"
                  />
                  <p className="text-xs text-muted-foreground">خالی = بدون سقف.</p>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="cp-min">حداقل مبلغ سبد (تومان)</Label>
                <Input
                  id="cp-min"
                  inputMode="numeric"
                  value={form.minAmountToman}
                  onChange={(e) => setForm((f) => ({ ...f, minAmountToman: e.target.value }))}
                  placeholder="بدون شرط"
                />
                <p className="text-xs text-muted-foreground">خالی = بدون شرط.</p>
              </div>
            </div>

            {/* پلن‌های مجاز */}
            <div className="space-y-1.5">
              <Label>پلن‌های مجاز</Label>
              <div className="flex flex-wrap gap-3 pt-1">
                {ALL_PLANS.map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={form.planIds.includes(p)}
                      onCheckedChange={(checked) =>
                        setForm((f) => ({
                          ...f,
                          planIds:
                            checked === true
                              ? [...f.planIds, p]
                              : f.planIds.filter((x) => x !== p),
                        }))
                      }
                    />
                    {PLAN_LABELS[p]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                هیچ‌کدام انتخاب نشود = کد روی همهٔ پلن‌ها معتبر است.
              </p>
            </div>

            {/* ظرفیت‌ها */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-maxuses">ظرفیت کل استفاده</Label>
                <Input
                  id="cp-maxuses"
                  inputMode="numeric"
                  value={form.maxUses}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                  placeholder="نامحدود"
                />
                <p className="text-xs text-muted-foreground">خالی یا ۰ = نامحدود.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-peruser">سقف استفادهٔ هر کاربر</Label>
                <Input
                  id="cp-peruser"
                  inputMode="numeric"
                  value={form.perUserLimit}
                  onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">۰ = نامحدود؛ ۱ = فقط یک‌بار.</p>
              </div>
            </div>

            {/* بازهٔ اعتبار */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-starts">تاریخ شروع (اختیاری)</Label>
                <Input
                  id="cp-starts"
                  type="date"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {form.startsAt ? `شمسی: ${jalaliDate(new Date(form.startsAt).toISOString())}` : "خالی = از همین حالا."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-expires">تاریخ انقضا (اختیاری)</Label>
                <Input
                  id="cp-expires"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {form.expiresAt ? `شمسی: ${jalaliDate(new Date(form.expiresAt).toISOString())}` : "خالی = بدون انقضا."}
                </p>
              </div>
            </div>

            {/* یادداشت */}
            <div className="space-y-1.5">
              <Label htmlFor="cp-note">یادداشت (اختیاری)</Label>
              <Input
                id="cp-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="مثلاً: کمپین نوروز ۱۴۰۵ — اینستاگرام"
                maxLength={200}
              />
            </div>

            {/* سوییچ‌ها */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="cp-firsttime">فقط اولین خرید</Label>
                  <p className="text-xs text-muted-foreground">
                    کد فقط برای کاربرانِ بدون لایسنس فعال معتبر می‌ماند.
                  </p>
                </div>
                <Switch
                  id="cp-firsttime"
                  checked={form.firstTimeOnly}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, firstTimeOnly: v }))}
                />
              </div>
              {editingId ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="cp-active">فعال</Label>
                    <p className="text-xs text-muted-foreground">کد غیرفعال در چک‌اوت پذیرفته نمی‌شود.</p>
                  </div>
                  <Switch
                    id="cp-active"
                    checked={form.active}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              انصراف
            </Button>
            <Button onClick={() => void submitForm()} disabled={saving}>
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? "ذخیرهٔ تغییرات" : "ایجاد کد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ تأیید حذف ============ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کد تخفیف</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف کد «{deleteTarget?.code}» مطمئن هستید؟ اگر این کد قبلاً استفاده شده
              باشد، به‌جای حذف فقط غیرفعال می‌شود تا تاریخچهٔ تخفیف‌ها حفظ شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // جلوگیری از بستن خودکار — حذف را خودمان مدیریت می‌کنیم
                void deleteCoupon();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              حذف کد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
