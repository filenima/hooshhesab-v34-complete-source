"use client";

// ============ هوش — تب «ویرایش پلن‌ها» (پنل سوپرادمین) ============
// FIX(9-a): ویرایش کامل هر پلن — قیمت (تومان)، نام، توضیح، امکانات (هر خط
// یک مورد)، محبوب‌ترین، مخفی/نمایش + سقف‌های کاربر/فاکتور/انبار.
// ذخیره در SystemSettings (plan_overrides_v2) — پس از ذخیره، کش پلن‌های
// مؤثر بی‌اعتبار می‌شود و تغییرات روی صفحه قیمت، لندینگ و چک‌اوت اعمال
// می‌شود (تا TTL ۶۰ ثانیه). «بازنشانی» = حذف کامل override (برگشت به
// پیش‌فرض استاتیک). legacy plan_overrides (سقف‌های قدیمی) همچنان
// محترم شمرده می‌شود تا داده‌های قبلی از بین نرود.

import * as React from "react";
import {
  BadgeCheck,
  EyeOff,
  Gauge,
  Infinity as InfinityIcon,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  FileText,
  Users,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, toPersianDigits } from "@/lib/persian";

interface PlanDefaults {
  name: string;
  description: string;
  priceToman: number;
  features: string[];
  popular: boolean;
  hidden: boolean;
  maxUsers: number;
  maxInvoices: number;
  maxWarehouses: number;
}

interface PlanEffective extends PlanDefaults {
  priceRial: number;
}

interface PlanRow {
  id: string;
  name: string;
  nameEn: string;
  accent: string;
  defaults: PlanDefaults;
  override: Record<string, unknown> | null;
  isCustom: boolean;
  effective: PlanEffective;
}

/** فرم ویرایش هر پلن — همه مقادیر رشته/بولین برای controlled inputs */
interface PlanFormState {
  name: string;
  description: string;
  priceToman: string;
  featuresText: string;
  popular: boolean;
  hidden: boolean;
  maxUsers: string;
  maxInvoices: string;
  maxWarehouses: string;
}

function initForm(p: PlanRow): PlanFormState {
  const e = p.effective;
  return {
    name: e.name,
    description: e.description,
    priceToman: String(e.priceToman),
    featuresText: e.features.join("\n"),
    popular: e.popular,
    hidden: e.hidden,
    maxUsers: String(e.maxUsers),
    maxInvoices: String(e.maxInvoices),
    maxWarehouses: String(e.maxWarehouses),
  };
}

export function PlanLimitsTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [plans, setPlans] = React.useState<PlanRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingPlan, setSavingPlan] = React.useState<string | null>(null);
  const [resettingPlan, setResettingPlan] = React.useState<string | null>(null);
  const [armedReset, setArmedReset] = React.useState<string | null>(null);
  const [forms, setForms] = React.useState<Record<string, PlanFormState>>({});

  const fetchPlans = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/plan-limits", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        const rows: PlanRow[] = json.data.plans || [];
        setPlans(rows);
        const initial: Record<string, PlanFormState> = {};
        for (const p of rows) {
          initial[p.id] = initForm(p);
        }
        setForms(initial);
      }
    } catch {
      toast({ title: "خطا در دریافت پلن‌ها", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  React.useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  // لغو حالت «تایید بازنشانی» بعد از ۴ ثانیه
  React.useEffect(() => {
    if (!armedReset) return;
    const t = setTimeout(() => setArmedReset(null), 4000);
    return () => clearTimeout(t);
  }, [armedReset]);

  const setField = (
    planId: string,
    field: keyof PlanFormState,
    value: string | boolean
  ) => {
    setForms((prev) => ({
      ...prev,
      [planId]: { ...(prev[planId] || ({} as PlanFormState)), [field]: value } as PlanFormState,
    }));
  };

  /** پلن تغییرات ذخیره‌نشده دارد؟ (مقایسه با مقادیر مؤثر فعلی) */
  const isDirty = React.useCallback(
    (p: PlanRow): boolean => {
      const f = forms[p.id];
      if (!f) return false;
      const base = initForm(p);
      return (
        f.name !== base.name ||
        f.description !== base.description ||
        f.priceToman !== base.priceToman ||
        f.featuresText !== base.featuresText ||
        f.popular !== base.popular ||
        f.hidden !== base.hidden ||
        f.maxUsers !== base.maxUsers ||
        f.maxInvoices !== base.maxInvoices ||
        f.maxWarehouses !== base.maxWarehouses
      );
    },
    [forms]
  );

  const parseLimit = (raw: string, fallback: number): number | "invalid" => {
    const s = raw.trim();
    if (s === "") return fallback;
    const num = parseInt(s, 10);
    if (!Number.isFinite(num)) return "invalid";
    if (num === -1) return -1;
    if (num < 1) return "invalid";
    return Math.min(num, 1_000_000);
  };

  const savePlan = async (p: PlanRow) => {
    const f = forms[p.id];
    if (!f) return;

    // اعتبارسنجی قیمت — خالی/غیرعددی مجاز نیست
    const priceStr = f.priceToman.trim();
    const price = Number(priceStr);
    if (priceStr === "" || !Number.isFinite(price) || !Number.isInteger(price) || price < 0) {
      toast({
        title: "قیمت نامعتبر",
        description: "قیمت باید عدد صحیح و بزرگ‌تر یا مساوی ۰ (تومان) باشد.",
        variant: "destructive",
      });
      return;
    }

    const limits: Record<string, number> = {};
    for (const [field, fallback] of [
      ["maxUsers", p.effective.maxUsers],
      ["maxInvoices", p.effective.maxInvoices],
      ["maxWarehouses", p.effective.maxWarehouses],
    ] as const) {
      const parsed = parseLimit(f[field as keyof PlanFormState] as string, fallback);
      if (parsed === "invalid") {
        toast({
          title: "سقف نامعتبر",
          description: "سقف کاربر/فاکتور/انبار باید عدد صحیح -1 (نامحدود) یا بین ۱ تا ۱٬۰۰۰٬۰۰۰ باشد.",
          variant: "destructive",
        });
        return;
      }
      limits[field] = parsed;
    }

    const features = f.featuresText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    setSavingPlan(p.id);
    try {
      const res = await fetch("/api/platform/plan-limits", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: p.id,
          name: f.name.trim() || p.defaults.name,
          description: f.description.trim(),
          priceToman: price,
          features,
          popular: f.popular,
          hidden: f.hidden,
          maxUsers: limits.maxUsers,
          maxInvoices: limits.maxInvoices,
          maxWarehouses: limits.maxWarehouses,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ذخیره");
      }
      toast({
        title: `پلن ${f.name || p.id} ذخیره شد`,
        description: json.message,
      });
      setArmedReset(null);
      void fetchPlans();
    } catch (err) {
      toast({
        title: "خطا در ذخیره",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setSavingPlan(null);
    }
  };

  const resetPlan = async (p: PlanRow) => {
    setResettingPlan(p.id);
    try {
      const res = await fetch("/api/platform/plan-limits", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "reset", planId: p.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در بازنشانی");
      }
      toast({
        title: `پلن ${p.name} بازنشانی شد`,
        description: json.message,
      });
      setArmedReset(null);
      void fetchPlans();
    } catch (err) {
      toast({
        title: "خطا در بازنشانی",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setResettingPlan(null);
    }
  };

  const anyDirty = plans.some((p) => isDirty(p));

  const limitInput = (
    p: PlanRow,
    field: "maxUsers" | "maxInvoices" | "maxWarehouses",
    label: string,
    icon: React.ReactNode
  ) => {
    const value = forms[p.id]?.[field] ?? String(p.effective[field]);
    const unlimited = value.trim() === "-1";
    return (
      <div className="space-y-1.5">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {icon} {label}
        </label>
        <Input
          dir="ltr"
          type="number"
          min={-1}
          value={value}
          onChange={(e) => setField(p.id, field, e.target.value)}
          className="font-mono"
          disabled={savingPlan === p.id}
        />
        {unlimited && (
          <p className="flex items-center gap-1 text-[10px] text-emerald-600">
            <InfinityIcon className="h-3 w-3" /> نامحدود
          </p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Gauge className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold">ویرایش قیمت و مشخصات پلن‌ها</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              قیمت، نام، توضیح، امکانات و سقف‌های هر پلن را ویرایش کنید. تغییرات{" "}
              <span className="font-medium text-foreground">همه‌جا</span> اعمال می‌شود:
              صفحه قیمت‌گذاری، صفحه اصلی، چک‌اوت و درگاه پرداخت، صدور لایسنس و
              بررسی سهمیه‌ها (تا حداکثر ۶۰ ثانیه تأخیر کش). مقدار{" "}
              <span className="font-mono">-1</span> یعنی نامحدود. دکمه «بازنشانی»
              پلن را به تنظیمات پیش‌فرض سیستم برمی‌گرداند.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((p) => {
          const f = forms[p.id];
          if (!f) return null;
          const dirty = isDirty(p);
          const saving = savingPlan === p.id;
          const resetting = resettingPlan === p.id;
          const priceNum = Number(f.priceToman) || 0;
          return (
            <Card key={p.id} className={dirty ? "border-primary/40" : undefined}>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {f.name || p.name}
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {p.id}
                  </Badge>
                  {p.isCustom && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
                      <BadgeCheck className="h-3 w-3" /> سفارشی
                    </Badge>
                  )}
                  {f.popular && (
                    <Badge className="bg-primary/10 text-primary gap-1">
                      <Sparkles className="h-3 w-3" /> محبوب‌ترین
                    </Badge>
                  )}
                  {f.hidden && (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <EyeOff className="h-3 w-3" /> مخفی
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* قیمت */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">
                    قیمت سالانه (تومان) — ۰ یعنی رایگان
                  </label>
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={f.priceToman}
                    onChange={(e) => setField(p.id, "priceToman", e.target.value.replace(/[^\d]/g, ""))}
                    className="font-mono"
                    disabled={saving}
                    placeholder="0"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {priceNum > 0
                      ? `${formatNumber(priceNum)} تومان / سال — معادل ${formatNumber(priceNum * 10)} ریال`
                      : "رایگان"}
                    {p.effective.priceToman !== p.defaults.priceToman && (
                      <span className="mr-1">
                        (پیش‌فرض: {p.defaults.priceToman > 0 ? formatNumber(p.defaults.priceToman) : "رایگان"})
                      </span>
                    )}
                  </p>
                </div>

                {/* نام و توضیح */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">نام نمایشی</label>
                    <Input
                      value={f.name}
                      onChange={(e) => setField(p.id, "name", e.target.value)}
                      disabled={saving}
                      maxLength={60}
                      placeholder={p.defaults.name}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">توضیح کوتاه</label>
                    <Input
                      value={f.description}
                      onChange={(e) => setField(p.id, "description", e.target.value)}
                      disabled={saving}
                      maxLength={300}
                      placeholder={p.defaults.description}
                    />
                  </div>
                </div>

                {/* امکانات — هر خط یک مورد */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">
                    امکانات نمایشی — هر خط یک مورد
                  </label>
                  <Textarea
                    dir="rtl"
                    rows={6}
                    value={f.featuresText}
                    onChange={(e) => setField(p.id, "featuresText", e.target.value)}
                    disabled={saving}
                    className="text-xs leading-relaxed resize-y"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {toPersianDigits(String(f.featuresText.split("\n").filter((l) => l.trim()).length))} مورد — این متن‌ها در صفحه قیمت‌گذاری و صفحه اصلی نمایش داده می‌شوند
                  </p>
                </div>

                {/* سوییچ‌ها */}
                <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`popular-${p.id}`}
                      checked={f.popular}
                      onCheckedChange={(v) => setField(p.id, "popular", v)}
                      disabled={saving}
                    />
                    <Label htmlFor={`popular-${p.id}`} className="text-xs cursor-pointer">
                      محبوب‌ترین
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`hidden-${p.id}`}
                      checked={f.hidden}
                      onCheckedChange={(v) => setField(p.id, "hidden", v)}
                      disabled={saving}
                    />
                    <Label htmlFor={`hidden-${p.id}`} className="text-xs cursor-pointer">
                      مخفی از صفحه قیمت‌گذاری
                    </Label>
                  </div>
                </div>

                {/* سقف‌ها */}
                <div className="grid grid-cols-3 gap-3">
                  {limitInput(p, "maxUsers", "حداکثر کاربر", <Users className="h-3.5 w-3.5" />)}
                  {limitInput(p, "maxInvoices", "سقف فاکتور/سال", <FileText className="h-3.5 w-3.5" />)}
                  {limitInput(p, "maxWarehouses", "حداکثر انبار", <Warehouse className="h-3.5 w-3.5" />)}
                </div>

                {/* اکشن‌ها */}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Button
                    size="sm"
                    onClick={() => void savePlan(p)}
                    disabled={saving || !dirty}
                    className="gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    ذخیره {f.name || p.name}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (armedReset === p.id) {
                        void resetPlan(p);
                      } else {
                        setArmedReset(p.id);
                      }
                    }}
                    disabled={resetting || saving || !p.isCustom}
                    className="gap-1.5"
                    title="حذف کامل پوشش و بازگشت به تنظیمات پیش‌فرض سیستم"
                  >
                    {resetting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    {armedReset === p.id ? "تایید بازنشانی؟" : "بازنشانی به پیش‌فرض"}
                  </Button>
                  {dirty && (
                    <button
                      type="button"
                      onClick={() =>
                        setForms((prev) => ({ ...prev, [p.id]: initForm(p) }))
                      }
                      className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                      disabled={saving}
                    >
                      لغو تغییرات این پلن
                    </button>
                  )}
                </div>

                {p.isCustom && (
                  <p className="text-[11px] text-muted-foreground">
                    پیش‌فرض سیستم: {p.defaults.priceToman > 0 ? formatNumber(p.defaults.priceToman) : "رایگان"} تومان /{" "}
                    {toPersianDigits(String(p.defaults.maxUsers))} کاربر /{" "}
                    {toPersianDigits(String(p.defaults.maxInvoices))} فاکتور /{" "}
                    {toPersianDigits(String(p.defaults.maxWarehouses))} انبار — مقادیر این کارت سفارشی‌سازی شده‌اند
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => void fetchPlans()} disabled={loading || !anyDirty} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          بازگردانی همه تغییرات
        </Button>
        {anyDirty && (
          <span className="text-xs text-amber-600">تغییرات ذخیره‌نشده دارید</span>
        )}
      </div>
    </div>
  );
}
