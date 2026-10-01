"use client";

// ============ هوش — تب «قانون‌های تخفیف خودکار» (Task 6-b — پنل سوپرادمین) ============
// مدیریت قانون‌های تخفیف اشتراک که هنگام خرید، خودکار ارزیابی می‌شوند:
//   GET/POST/PUT/DELETE /api/platform/discount-rules
// موتور ارزیابی: lib/discount-rules.ts (در /api/payment/subscribe فراخوانی می‌شود)
// بدون نیاز به کد تخفیف — شرایط: پرداخت سالانه / کاربر راکد / کاربر تازه /
// پلن خاص / قدمت حساب.

import * as React from "react";
import {
  BadgePercent,
  CalendarCheck2,
  CalendarClock,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserPlus,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, toEnglishDigits, toPersianDigits } from "@/lib/persian";

// ============ انواع و برچسب‌های فارسی ============

type RuleKind = "PERCENT" | "FIXED" | "TRIAL_DAYS";
type RuleCondition =
  | "ANNUAL_PAY"
  | "INACTIVE_DAYS"
  | "NEW_USER"
  | "PLAN"
  | "TENURE_DAYS";

interface DiscountRuleRow {
  id: string;
  name: string;
  kind: string;
  value: number;
  conditionType: string;
  conditionValue: number;
  planIdsJson: string;
  planIds?: string[];
  maxAmountToman: number;
  priority: number;
  stackable: boolean;
  active: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

const KIND_LABELS: Record<RuleKind, string> = {
  PERCENT: "درصد",
  FIXED: "مبلغ ثابت",
  TRIAL_DAYS: "روز رایگان",
};

const CONDITION_LABELS: Record<RuleCondition, string> = {
  ANNUAL_PAY: "پرداخت سالانه",
  INACTIVE_DAYS: "روزهای عدم فعالیت",
  NEW_USER: "کاربر تازه",
  PLAN: "پلن خاص",
  TENURE_DAYS: "قدمت حساب",
};

const PLAN_LABELS: Record<string, string> = {
  free: "رایگان",
  basic: "پایه",
  pro: "حرفه‌ای",
  enterprise: "سازمانی",
};
const ALL_PLANS = ["free", "basic", "pro", "enterprise"] as const;

/** برچسب بسته به نوع تخفیف — «۲۰٪» / «۵۰۰٬۰۰۰ تومان» / «۷ روز رایگان» */
function effectText(rule: { kind: string; value: number }): string {
  if (rule.kind === "TRIAL_DAYS") {
    return `${toPersianDigits(Math.round(rule.value))} روز رایگان`;
  }
  if (rule.kind === "FIXED") {
    return `${formatNumber(rule.value)} تومان تخفیف`;
  }
  return `${toPersianDigits(rule.value)}٪ تخفیف`;
}

/** شرط به فارسی با اعداد فارسی — مثل «۳۰+ روز عدم فعالیت» */
function conditionText(rule: {
  conditionType: string;
  conditionValue: number;
  planIds?: string[];
  planIdsJson?: string;
}): string {
  const cv = rule.conditionValue;
  let planIds: string[] = rule.planIds ?? [];
  if (!planIds.length && rule.planIdsJson) {
    try {
      const parsed = JSON.parse(rule.planIdsJson);
      if (Array.isArray(parsed)) planIds = parsed.filter((p) => typeof p === "string");
    } catch {
      /* ignore */
    }
  }
  switch (rule.conditionType as RuleCondition) {
    case "ANNUAL_PAY":
      return "پرداخت سالانه";
    case "INACTIVE_DAYS":
      return `${toPersianDigits(cv)}+ روز عدم فعالیت`;
    case "NEW_USER":
      return `کاربر تازه (≤${toPersianDigits(cv > 0 ? cv : 14)} روز)`;
    case "PLAN": {
      if (planIds.length === 0) return "پلن خاص (بدون انتخاب)";
      return `پلن ${planIds.map((p) => PLAN_LABELS[p] ?? p).join("، ")}`;
    }
    case "TENURE_DAYS":
      return `قدمت ≥ ${toPersianDigits(cv)} روز`;
    default:
      return rule.conditionType;
  }
}

// ============ حالت فرم ایجاد/ویرایش ============

interface FormState {
  name: string;
  kind: RuleKind;
  value: string;
  conditionType: RuleCondition;
  conditionValue: string;
  planIds: string[];
  maxAmountToman: string;
  priority: string;
  stackable: boolean;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  kind: "PERCENT",
  value: "20",
  conditionType: "ANNUAL_PAY",
  conditionValue: "0",
  planIds: [],
  maxAmountToman: "0",
  priority: "0",
  stackable: false,
  active: true,
};

/** قوانین آمادهٔ پیشنهادی — فرم ایجاد را پر می‌کنند */
const PRESETS: Array<{ label: string; form: Partial<FormState> }> = [
  {
    label: "۲۰٪ تخفیف پرداخت سالانه",
    form: {
      name: "۲۰٪ تخفیف پرداخت سالانه",
      kind: "PERCENT",
      value: "20",
      conditionType: "ANNUAL_PAY",
      conditionValue: "0",
      maxAmountToman: "0",
      priority: "10",
    },
  },
  {
    label: "۱۵٪ تخفیف کاربران راکد ۳۰ روزه",
    form: {
      name: "بازگشت کاربران راکد — ۱۵٪",
      kind: "PERCENT",
      value: "15",
      conditionType: "INACTIVE_DAYS",
      conditionValue: "30",
      maxAmountToman: "2000000",
      priority: "5",
    },
  },
  {
    label: "۷ روز رایگان کاربران تازه",
    form: {
      name: "۷ روز رایگان کاربران تازه",
      kind: "TRIAL_DAYS",
      value: "7",
      conditionType: "NEW_USER",
      conditionValue: "14",
      maxAmountToman: "0",
      priority: "3",
    },
  },
];

/** پارس عددی ورودی فرم — ارقام فارسی هم پذیرفته می‌شود */
function parseNum(raw: string): number | null {
  const s = toEnglishDigits(raw.trim().replace(/[,،\s]/g, ""));
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function DiscountRulesTab({ token }: { token?: string }) {
  const { toast } = useToast();
  const [rules, setRules] = React.useState<DiscountRuleRow[]>([]);
  const [stats, setStats] = React.useState<{ total: number; activeCount: number }>({
    total: 0,
    activeCount: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DiscountRuleRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({ Authorization: `Bearer ${token ?? ""}` }),
    [token]
  );

  const fetchRules = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/discount-rules", {
        headers: authHeaders,
      });
      const json = await res.json();
      if (json.success) {
        setRules(json.data.rules || []);
        setStats(json.data.stats || { total: 0, activeCount: 0 });
      } else {
        toast({ title: "خطا در دریافت قانون‌ها", description: json.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا در دریافت قانون‌ها", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, toast]);

  React.useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  // ============ بازکردن فرم ============
  const openCreate = React.useCallback((preset?: Partial<FormState>) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, ...(preset ?? {}) });
    setDialogOpen(true);
  }, []);

  const openEdit = React.useCallback((rule: DiscountRuleRow) => {
    setEditingId(rule.id);
    let planIds: string[] = [];
    try {
      const parsed = JSON.parse(rule.planIdsJson || "[]");
      if (Array.isArray(parsed)) planIds = parsed.filter((p) => typeof p === "string");
    } catch {
      /* ignore */
    }
    setForm({
      name: rule.name,
      kind: (rule.kind as RuleKind) || "PERCENT",
      value: String(rule.value ?? 0),
      conditionType: (rule.conditionType as RuleCondition) || "ANNUAL_PAY",
      conditionValue: String(rule.conditionValue ?? 0),
      planIds,
      maxAmountToman: String(rule.maxAmountToman ?? 0),
      priority: String(rule.priority ?? 0),
      stackable: !!rule.stackable,
      active: !!rule.active,
    });
    setDialogOpen(true);
  }, []);

  // ============ ذخیره (ایجاد/ویرایش) ============
  const submitForm = async () => {
    // اعتبارسنجی سمت کلاینت — پیام فارسی
    const name = form.name.trim();
    if (name.length < 1 || name.length > 80) {
      toast({ title: "نام قانون نامعتبر", description: "نام باید ۱ تا ۸۰ کاراکتر باشد.", variant: "destructive" });
      return;
    }
    const value = parseNum(form.value);
    if (value === null || value < 0) {
      toast({ title: "مقدار تخفیف نامعتبر", variant: "destructive" });
      return;
    }
    if (form.kind === "PERCENT" && (value < 1 || value > 100)) {
      toast({ title: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد", variant: "destructive" });
      return;
    }
    if (form.kind === "TRIAL_DAYS" && (!Number.isInteger(value) || value < 1 || value > 365)) {
      toast({ title: "روزهای رایگان باید عدد صحیح ۱ تا ۳۶۵ باشد", variant: "destructive" });
      return;
    }
    if (form.kind === "FIXED" && (!Number.isInteger(value) || value <= 0)) {
      toast({ title: "مبلغ تخفیف ثابت باید عدد صحیح بزرگ‌تر از صفر (تومان) باشد", variant: "destructive" });
      return;
    }
    const conditionValue = parseNum(form.conditionValue) ?? 0;
    if (conditionValue < 0) {
      toast({ title: "مقدار شرط نامعتبر", variant: "destructive" });
      return;
    }
    const maxAmountToman = parseNum(form.maxAmountToman) ?? 0;
    if (maxAmountToman < 0 || !Number.isInteger(maxAmountToman)) {
      toast({ title: "سقف مبلغ تخفیف باید عدد صحیح مساوی/بزرگ‌تر از صفر باشد", variant: "destructive" });
      return;
    }
    const priority = parseNum(form.priority) ?? 0;
    if (!Number.isInteger(priority) || Math.abs(priority) > 1_000_000) {
      toast({ title: "اولویت باید عدد صحیح باشد", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/platform/discount-rules", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          name,
          kind: form.kind,
          value,
          conditionType: form.conditionType,
          conditionValue,
          planIds: form.planIds,
          maxAmountToman,
          priority,
          stackable: form.stackable,
          ...(editingId ? { active: form.active } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ذخیره");
      }
      toast({ title: editingId ? "قانون ذخیره شد" : "قانون ایجاد شد", description: json.message });
      setDialogOpen(false);
      void fetchRules();
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
  const toggleRule = async (rule: DiscountRuleRow) => {
    setTogglingId(rule.id);
    try {
      const res = await fetch("/api/platform/discount-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ id: rule.id, action: "toggle" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({ title: json.message });
      void fetchRules();
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
  const deleteRule = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/platform/discount-rules?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({ title: json.message });
      setDeleteTarget(null);
      void fetchRules();
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
        <Zap className="h-4 w-4" />
        <AlertTitle>قانون‌های تخفیف خودکار</AlertTitle>
        <AlertDescription>
          این قانون‌ها هنگام خرید اشتراک به‌صورت خودکار ارزیابی می‌شوند — بدون نیاز به کد تخفیف.
        </AlertDescription>
      </Alert>

      {/* سربرگ + آمار */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {toPersianDigits(stats.total)} قانون
          </Badge>
          <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
            {toPersianDigits(stats.activeCount)} فعال
          </Badge>
        </div>
        <Button onClick={() => openCreate()} className="w-full sm:w-auto">
          <Plus className="ml-2 h-4 w-4" />
          قانون جدید
        </Button>
      </div>

      {/* محتوا */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rules.length === 0 ? (
        /* حالت خالی */
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">هنوز هیچ قانون تخفیفی تعریف نشده است</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                با یک قانون آماده شروع کنید یا از صفر بسازید.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => openCreate(preset.form)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Button onClick={() => openCreate()}>
              <Plus className="ml-2 h-4 w-4" />
              قانون جدید
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rules.map((rule) => {
            const planIds = (() => {
              try {
                const parsed = JSON.parse(rule.planIdsJson || "[]");
                return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
              } catch {
                return [];
              }
            })();
            const kind = (rule.kind as RuleKind) || "PERCENT";
            return (
              <Card
                key={rule.id}
                className={!rule.active ? "opacity-70" : undefined}
              >
                <CardContent className="space-y-3 p-4">
                  {/* نام + سوییچ فعال */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="truncate text-base">{rule.name}</CardTitle>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={
                            kind === "PERCENT"
                              ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                              : kind === "FIXED"
                                ? "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                                : "border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-400"
                          }
                        >
                          {KIND_LABELS[kind]}
                        </Badge>
                        {rule.stackable ? (
                          <Badge variant="outline" className="border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400">
                            قابل ترکیب
                          </Badge>
                        ) : null}
                        {!rule.active ? <Badge variant="destructive">غیرفعال</Badge> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {togglingId === rule.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Switch
                          checked={rule.active}
                          onCheckedChange={() => void toggleRule(rule)}
                          aria-label={`فعال/غیرفعال کردن قانون ${rule.name}`}
                        />
                      )}
                    </div>
                  </div>

                  {/* شرط */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-4 w-4 shrink-0" />
                    <span>{conditionText(rule)}</span>
                  </div>

                  {/* اثر تخفیف */}
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <BadgePercent className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{effectText(rule)}</span>
                    {kind === "PERCENT" && rule.maxAmountToman > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        (سقف {formatNumber(rule.maxAmountToman)} تومان)
                      </span>
                    ) : null}
                  </div>

                  <Separator />

                  {/* متادیتا */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" />
                        اولویت {toPersianDigits(rule.priority)}
                      </span>
                      <span>
                        {planIds.length > 0
                          ? `پلن‌های ${planIds.map((p) => PLAN_LABELS[p] ?? p).join("، ")}`
                          : "همه پلن‌ها"}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {toPersianDigits(rule.usageCount)} بار اعمال شده
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(rule)}
                        aria-label={`ویرایش قانون ${rule.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(rule)}
                        aria-label={`حذف قانون ${rule.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ============ دیالوگ ایجاد/ویرایش ============ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "ویرایش قانون تخفیف" : "قانون تخفیف جدید"}
            </DialogTitle>
            <DialogDescription>
              قانون هنگام خرید اشتراک به‌صورت خودکار ارزیابی می‌شود — بدون کد تخفیف.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* نام */}
            <div className="space-y-1.5">
              <Label htmlFor="dr-name">نام قانون</Label>
              <Input
                id="dr-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثلاً: ۲۰٪ تخفیف پرداخت سالانه"
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">۱ تا ۸۰ کاراکتر — نام نمایشی قانون.</p>
            </div>

            {/* نوع تخفیف + مقدار */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>نوع تخفیف</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm((f) => ({ ...f, kind: v as RuleKind }))}
                >
                  <SelectTrigger dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABELS) as RuleKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dr-value">
                  {form.kind === "PERCENT"
                    ? "درصد تخفیف (۱ تا ۱۰۰)"
                    : form.kind === "FIXED"
                      ? "مبلغ تخفیف (تومان)"
                      : "روزهای رایگان (۱ تا ۳۶۵)"}
                </Label>
                <Input
                  id="dr-value"
                  inputMode="numeric"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {form.kind === "PERCENT"
                ? "درصدی از مبلغ پرداختی — با سقف اختیاری پایین."
                : form.kind === "FIXED"
                  ? "مبلغ ثابت به تومان از مبلغ پرداخت کسر می‌شود."
                  : "روزهای اشتراک رایگان اضافه می‌شود — کسر مبلغ ندارد."}
            </p>

            {/* شرط */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>شرط فعال‌سازی</Label>
                <Select
                  value={form.conditionType}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, conditionType: v as RuleCondition }))
                  }
                >
                  <SelectTrigger dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CONDITION_LABELS) as RuleCondition[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CONDITION_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.conditionType !== "ANNUAL_PAY" && form.conditionType !== "PLAN" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="dr-cond">مقدار شرط (روز)</Label>
                  <Input
                    id="dr-cond"
                    inputMode="numeric"
                    value={form.conditionValue}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, conditionValue: e.target.value }))
                    }
                  />
                </div>
              ) : null}
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {form.conditionType === "ANNUAL_PAY"
                ? "فقط هنگام انتخاب دورهٔ سالانه در چک‌اوت اعمال می‌شود."
                : form.conditionType === "INACTIVE_DAYS"
                  ? "کاربری که حداقل این تعداد روز غایب بوده — ۰ یعنی هر کاربرِ دارای تاریخ فعالیت."
                  : form.conditionType === "NEW_USER"
                    ? "سن حساب از ثبت‌نام ≤ مقدار شرط روز — ۰ یعنی پیش‌فرض ۱۴ روز."
                    : form.conditionType === "PLAN"
                      ? "پلن‌های هدف را در فیلد «پلن‌های هدف» انتخاب کنید."
                      : "قدمت حساب کاربر ≥ مقدار شرط روز."}
            </p>

            {/* پلن‌های هدف */}
            <div className="space-y-1.5">
              <Label>پلن‌های هدف</Label>
              <div className="flex flex-wrap gap-3 pt-1">
                {ALL_PLANS.map((p) => (
                  <label
                    key={p}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
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
                هیچ‌کدام انتخاب نشود = قانون روی همه پلن‌ها اعمال می‌شود.
              </p>
            </div>

            {/* سقف + اولویت */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.kind === "PERCENT" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="dr-cap">سقف مبلغ تخفیف (تومان)</Label>
                  <Input
                    id="dr-cap"
                    inputMode="numeric"
                    value={form.maxAmountToman}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, maxAmountToman: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">۰ = بدون سقف.</p>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="dr-priority">اولویت</Label>
                <Input
                  id="dr-priority"
                  inputMode="numeric"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  عدد بزرگ‌تر = ارزیابی زودتر — قانون‌ها به‌ترتیب اولویت بررسی می‌شوند.
                </p>
              </div>
            </div>

            {/* سوییچ‌ها */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="dr-stackable">قابل ترکیب</Label>
                  <p className="text-xs text-muted-foreground">
                    رزرو برای ترکیب چند تخفیف — فعلاً بهترین قانون در پرداخت اعمال می‌شود.
                  </p>
                </div>
                <Switch
                  id="dr-stackable"
                  checked={form.stackable}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, stackable: v }))}
                />
              </div>
              {editingId ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="dr-active">فعال</Label>
                    <p className="text-xs text-muted-foreground">
                      قانون غیرفعال ارزیابی نمی‌شود.
                    </p>
                  </div>
                  <Switch
                    id="dr-active"
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
              {editingId ? "ذخیرهٔ تغییرات" : "ایجاد قانون"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ تأیید حذف ============ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف قانون تخفیف</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف قانون «{deleteTarget?.name}» مطمئن هستید؟ این عمل قابل بازگشت
              نیست و از خریدهای بعدی اعمال نمی‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // جلوگیری از بستن خودکار — حذف را خودمان مدیریت می‌کنیم
                void deleteRule();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              حذف قانون
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
