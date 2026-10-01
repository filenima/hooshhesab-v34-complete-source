"use client";

// ============ هوش — تب «مدیریت منوی کاربران» (پنل سوپرادمین) ============
// کنترل کامل سایدبار پنل کاربر، per plan:
//  - نمایش/مخفی هر آیتم (سراسری + اختصاصی هر پلن)
//  - تغییر نام نمایشی (label) و متن بج هر آیتم
//  - جابه‌جایی ترتیب با دکمه‌های بالا/پایین (ساده و موبایل‌پسند — بدون drag)
//  - افزودن آیتم دلخواه: ماژول موجودِ مخفی (مثل مدیریت تولیدی) یا لینک خارجی
//  - حذف آیتم‌های دلخواه
//  - پیش‌نمایش زندهٔ سایدبار با همان موتور محاسبهٔ سرور (computeEffectiveNavItems)
// ذخیره در SystemSettings (کلید module_manager_config) — PUT /api/platform/module-manager

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Layers,
  ListTree,
  Loader2,
  PanelLeft,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { navIconByName } from "@/lib/nav-icons";
import {
  NAV_GROUPS,
  NAV_ITEMS,
  ICON_CHOICES,
  KNOWN_MODULE_IDS,
  PLAN_LABELS,
  VALID_PLANS,
  computeEffectiveNavItems,
  groupEffectiveNav,
  mergeGroupOrder,
  type CustomNavItem,
  type ModuleManagerConfig,
  type EffectiveNavItem,
} from "@/lib/nav-config";

// ═════════════════════ انواع داخلی ═════════════════════

type PlanKey = "all" | (typeof VALID_PLANS)[number];

interface RowItem {
  id: string;
  /** نام پیش‌فرض (برای آیتم دلخواه = نام ذخیره‌شدهٔ خودش) */
  defaultLabel: string;
  icon: string;
  group: string;
  defaultBadge?: string;
  url?: string;
  isCustom: boolean;
}

function emptyConfig(): ModuleManagerConfig {
  return {
    hidden: [],
    labels: {},
    badges: {},
    order: [],
    groupOrder: [],
    customItems: [],
    perPlan: {},
  };
}

/** ادغام cfg.order با ترتیب پیش‌فرض → فهرست کامل مرتب */
function mergeOrder(cfg: ModuleManagerConfig): string[] {
  const allIds = [
    ...NAV_ITEMS.map((n) => n.id),
    ...cfg.customItems.map((c) => c.id),
  ];
  const valid = new Set(allIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of cfg.order) {
    if (valid.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of allIds) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

// ═════════════════════ کامپوننت اصلی ═════════════════════

export function ModuleManagerTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [armedReset, setArmedReset] = React.useState(false);
  const [planTab, setPlanTab] = React.useState<PlanKey>("all");
  const [cfg, setCfg] = React.useState<ModuleManagerConfig>(emptyConfig());
  const [initialJson, setInitialJson] = React.useState("{}");

  // لغو حالت «تایید بازنشانی» بعد از ۴ ثانیه
  React.useEffect(() => {
    if (!armedReset) return;
    const t = setTimeout(() => setArmedReset(false), 4000);
    return () => clearTimeout(t);
  }, [armedReset]);

  // ============ بارگذاری ============
  const fetchConfig = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/module-manager", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        const loaded = json.data.config as ModuleManagerConfig;
        const normalized: ModuleManagerConfig = {
          ...loaded,
          badges: loaded.badges ?? {},
          order: mergeOrder(loaded),
          groupOrder: mergeGroupOrder(loaded),
        };
        setCfg(normalized);
        setInitialJson(JSON.stringify(normalized));
      }
    } catch {
      toast({ title: "خطا در دریافت پیکربندی منو", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  React.useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  // ============ مشتقات (derivations) ============

  /** ترتیب کامل نمایش (cfg.order فهرست کامل را نگه می‌دارد) */
  const displayOrder = React.useMemo(() => mergeOrder(cfg), [cfg]);

  /** نقشهٔ id → تعریف ردیف (پیش‌فرض + دلخواه) */
  const rowById = React.useMemo(() => {
    const map = new Map<string, RowItem>();
    for (const n of NAV_ITEMS) {
      map.set(n.id, {
        id: n.id,
        defaultLabel: n.label,
        icon: n.icon,
        group: n.group,
        defaultBadge: n.badge,
        isCustom: false,
      });
    }
    for (const c of cfg.customItems) {
      map.set(c.id, {
        id: c.id,
        defaultLabel: c.label,
        icon: c.icon,
        group: c.group,
        defaultBadge: c.badge,
        url: c.url,
        isCustom: true,
      });
    }
    return map;
  }, [cfg.customItems]);

  // مرجع تازه برای دسترسی امن داخل setCfg (تابع move)
  const rowByIdRef = React.useRef(rowById);
  React.useEffect(() => {
    rowByIdRef.current = rowById;
  }, [rowById]);

  /** ردیف‌های گروه‌بندی‌شدهٔ لیست اصلی (شامل مخفی‌ها) — ترتیب گروه‌ها از
   * cfg.groupOrder (جابه‌جایی گروهی — درخواست مالک)، سپس پیش‌فرض NAV_GROUPS */
  const masterGroups = React.useMemo(() => {
    const groupIdx = new Map(mergeGroupOrder(cfg).map((g, i) => [g, i]));
    const map = new Map<string, RowItem[]>();
    for (const id of displayOrder) {
      const row = rowById.get(id);
      if (!row) continue;
      if (!map.has(row.group)) map.set(row.group, []);
      map.get(row.group)!.push(row);
    }
    return [...map.entries()]
      .sort((a, b) => {
        const ia = groupIdx.get(a[0]) ?? 1000;
        const ib = groupIdx.get(b[0]) ?? 1000;
        return ia - ib;
      })
      .map(([group, items]) => ({ group, items }));
  }, [displayOrder, rowById, cfg]);

  /** پیش‌نمایش زنده — همان موتور سرور */
  const previewNav = React.useMemo<EffectiveNavItem[]>(
    () => computeEffectiveNavItems(cfg, planTab === "all" ? null : planTab),
    [cfg, planTab]
  );
  const previewGroups = React.useMemo(
    () => groupEffectiveNav(previewNav),
    [previewNav]
  );

  const globalHidden = React.useMemo(() => new Set(cfg.hidden), [cfg.hidden]);
  const planCfg = planTab !== "all" ? cfg.perPlan[planTab] : undefined;
  const planHidden = React.useMemo(
    () => new Set(planCfg?.hidden ?? []),
    [planCfg]
  );

  const dirty = React.useMemo(
    () => JSON.stringify(cfg) !== initialJson,
    [cfg, initialJson]
  );

  const effectiveCountAll = React.useMemo(
    () => computeEffectiveNavItems(cfg, null).length,
    [cfg]
  );

  // ============ عملیات ویرایش ============

  /** جابه‌جایی آیتم در گروه خودش (بالا/پایین) */
  const move = React.useCallback((id: string, dir: -1 | 1) => {
    setCfg((prev) => {
      const order = mergeOrder(prev);
      const idx = order.indexOf(id);
      if (idx < 0) return prev;
      const groupOf = (oid: string) => rowByIdRef.current.get(oid)?.group ?? null;
      const myGroup = groupOf(id);
      if (myGroup === null) return prev;
      let j = idx + dir;
      while (j >= 0 && j < order.length && groupOf(order[j]) !== myGroup) {
        j += dir;
      }
      if (j < 0 || j >= order.length || j === idx) return prev;
      const next = [...order];
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...prev, order: next };
    });
  }, []);

  /** جابه‌جایی کل گروه در سایدبار (بالا/پایین) — درخواست مالک:
   * مثلاً بردن گروه «کیف پول و پاداش» به پایین منو */
  const moveGroup = React.useCallback((group: string, dir: -1 | 1) => {
    setCfg((prev) => {
      const groups = mergeGroupOrder(prev);
      const idx = groups.indexOf(group);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= groups.length) return prev;
      const next = [...groups];
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...prev, groupOrder: next };
    });
  }, []);

  /** نام مؤثر فعلی (سراسری) برای placeholder */
  const effectiveLabel = (id: string): string => {
    const row = rowById.get(id);
    const override = cfg.labels[id];
    return override && override.trim() ? override : row?.defaultLabel ?? id;
  };

  /** تغییر نام — آیتم دلخواه مستقیم، آیتم پیش‌فرض از طریق labels */
  const setLabel = (id: string, text: string) => {
    const clean = text.slice(0, 40);
    setCfg((prev) => {
      const ci = prev.customItems.findIndex((c) => c.id === id);
      if (ci >= 0) {
        const customItems = [...prev.customItems];
        customItems[ci] = { ...customItems[ci], label: clean.trim() || customItems[ci].label };
        return { ...prev, customItems };
      }
      const labels = { ...prev.labels };
      if (clean.trim()) labels[id] = clean.trim();
      else delete labels[id];
      return { ...prev, labels };
    });
  };

  /** تغییر بج — خالی یعنی حذف بج */
  const setBadge = (id: string, text: string) => {
    const clean = text.slice(0, 20);
    setCfg((prev) => {
      const ci = prev.customItems.findIndex((c) => c.id === id);
      if (ci >= 0) {
        const customItems = [...prev.customItems];
        customItems[ci] = { ...customItems[ci], badge: clean.trim() || undefined };
        return { ...prev, customItems };
      }
      return { ...prev, badges: { ...prev.badges, [id]: clean.trim() } };
    });
  };

  /** سوییچ نمایش — در تب «همه» سراسری، در تب پلن اختصاصی همان پلن */
  const toggleVisible = (id: string, visible: boolean) => {
    setCfg((prev) => {
      if (planTab === "all") {
        const hidden = new Set(prev.hidden);
        if (visible) hidden.delete(id);
        else hidden.add(id);
        return { ...prev, hidden: [...hidden] };
      }
      const existing = prev.perPlan[planTab] ?? { hidden: [], labels: {} };
      const hidden = new Set(existing.hidden);
      if (visible) hidden.delete(id);
      else hidden.add(id);
      return {
        ...prev,
        perPlan: {
          ...prev.perPlan,
          [planTab]: { ...existing, hidden: [...hidden] },
        },
      };
    });
  };

  /** label اختصاصی پلن */
  const setPlanLabel = (id: string, text: string) => {
    if (planTab === "all") return;
    const clean = text.slice(0, 40);
    setCfg((prev) => {
      const existing = prev.perPlan[planTab] ?? { hidden: [], labels: {} };
      const labels = { ...existing.labels };
      if (clean.trim()) labels[id] = clean.trim();
      else delete labels[id];
      const nextPlan = { ...existing, labels };
      const perPlan = { ...prev.perPlan, [planTab]: nextPlan };
      // اگر override خالی شد، کل پلن حذف شود
      if (nextPlan.hidden.length === 0 && Object.keys(nextPlan.labels).length === 0) {
        delete perPlan[planTab];
      }
      return { ...prev, perPlan };
    });
  };

  /** حذف آیتم دلخواه + پاک‌سازی همه ارجاع‌ها */
  const deleteCustom = (id: string) => {
    setCfg((prev) => {
      const labels = { ...prev.labels };
      delete labels[id];
      const badges = { ...prev.badges };
      delete badges[id];
      const perPlan: ModuleManagerConfig["perPlan"] = {};
      for (const [plan, o] of Object.entries(prev.perPlan)) {
        const hidden = o.hidden.filter((h) => h !== id);
        const pLabels = { ...o.labels };
        delete pLabels[id];
        if (hidden.length > 0 || Object.keys(pLabels).length > 0) {
          perPlan[plan] = { hidden, labels: pLabels };
        }
      }
      return {
        ...prev,
        customItems: prev.customItems.filter((c) => c.id !== id),
        hidden: prev.hidden.filter((h) => h !== id),
        order: prev.order.filter((o) => o !== id),
        labels,
        badges,
        perPlan,
      };
    });
    toast({ title: "آیتم دلخواه حذف شد", description: "برای اعمال، ذخیره کنید" });
  };

  // ============ ذخیره / بازنشانی ============

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/platform/module-manager", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ config: cfg }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در ذخیره");
      }
      const normalized = json.data.config as ModuleManagerConfig;
      setCfg({ ...normalized, badges: normalized.badges ?? {}, order: mergeOrder(normalized), groupOrder: mergeGroupOrder(normalized) });
      setInitialJson(JSON.stringify(json.data.config));
      setArmedReset(false);
      toast({ title: "پیکربندی منو ذخیره شد", description: json.message });
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

  const resetAll = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/platform/module-manager", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "reset" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در بازنشانی");
      }
      setCfg(emptyConfig());
      setInitialJson(JSON.stringify(emptyConfig()));
      setArmedReset(false);
      toast({ title: "بازنشانی انجام شد", description: json.message });
    } catch (err) {
      toast({
        title: "خطا در بازنشانی",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  // ============ رندر ============

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const planTabs: { key: PlanKey; label: string; overrides?: number }[] = [
    { key: "all", label: "همه" },
    ...VALID_PLANS.map((p) => {
      const o = cfg.perPlan[p];
      const count = (o?.hidden.length ?? 0) + Object.keys(o?.labels ?? {}).length;
      return { key: p as PlanKey, label: PLAN_LABELS[p], overrides: count };
    }),
  ];

  return (
    <div className="space-y-4">
      {/* کارت راهنما */}
      <Card className="border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ListTree className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold">مدیریت منوی پنل کاربران</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              آیتم‌های سایدبار پنل کاربر را کنترل کنید: نمایش/مخفی، تغییر نام و بج،
              جابه‌جایی ترتیب آیتم‌ها و <span className="font-medium text-foreground">جابه‌جایی کل گروه‌ها</span>
              (مثلاً بردن «کیف پول و پاداش» به پایین منو)، افزودن آیتم دلخواه (ماژول مخفی مثل
              «مدیریت تولیدی» یا لینک خارجی) و حذف. با انتخاب هر پلن، overrideهای اختصاصی همان پلن
              (مخفی‌سازی و نام جداگانه) تنظیم می‌شود. تغییرات حداکثر تا{" "}
              <span className="font-medium text-foreground">۳۰ ثانیه</span> بعد در
              پنل کاربران اعمال می‌شود (کش سرور).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* نوار اکشن */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving || !dirty} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          ذخیره پیکربندی
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (armedReset) void resetAll();
            else setArmedReset(true);
          }}
          disabled={resetting || saving}
          className="gap-1.5"
          title="حذف کامل پیکربندی و بازگشت به منوی پیش‌فرض سیستم"
        >
          {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {armedReset ? "تایید بازنشانی؟" : "بازنشانی به پیش‌فرض"}
        </Button>
        {dirty && <span className="text-xs text-amber-600">تغییرات ذخیره‌نشده دارید</span>}
        {!dirty && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" />
            {toPersianDigits(String(effectiveCountAll))} آیتم برای «همه» فعال است
          </span>
        )}
      </div>

      {/* انتخاب پلن */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          ویرایش برای پلن:
          <span className="text-foreground font-medium">
            {planTab === "all" ? "همه پلن‌ها (پیش‌فرض سراسری)" : PLAN_LABELS[planTab]}
          </span>
        </label>
        <Tabs value={planTab} onValueChange={(v) => setPlanTab(v as PlanKey)}>
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
            {planTabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1 text-xs">
                {t.label}
                {!!t.overrides && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    {toPersianDigits(String(t.overrides))}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {planTab !== "all" && (
          <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            در این حالت، سوییچ «نمایش» و فیلد نامِ هر آیتم فقط برای پلن{" "}
            {PLAN_LABELS[planTab]} اعمال می‌شود (لایه‌ای روی تنظیمات سراسری). آیتمِ
            مخفیِ سراسری با هیچ overrideی در این پلن نمایش داده نمی‌شود.
          </p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* ستون اصلی: لیست آیتم‌ها + آیتم‌های دلخواه */}
        <div className="min-w-0 space-y-4">
          {masterGroups.map((g, gi) => {
            const visibleCount = g.items.filter((i) => !globalHidden.has(i.id)).length;
            return (
              <Card key={g.group}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <PanelLeft className="h-4 w-4 text-muted-foreground" />
                    {g.group}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {toPersianDigits(String(visibleCount))} از{" "}
                      {toPersianDigits(String(g.items.length))}
                    </Badge>
                    {/* جابه‌جایی کل گروه — فقط تب «همه» (درخواست مالک) */}
                    {planTab === "all" && (
                      <span className="ms-auto flex flex-col" title="جابه‌جایی گروه در سایدبار">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4 p-0"
                          onClick={() => moveGroup(g.group, -1)}
                          disabled={gi === 0}
                          aria-label={`انتقال گروه ${g.group} به بالا`}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4 p-0"
                          onClick={() => moveGroup(g.group, 1)}
                          disabled={gi === masterGroups.length - 1}
                          aria-label={`انتقال گروه ${g.group} به پایین`}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {g.items.map((item) => {
                    const globallyHidden = globalHidden.has(item.id);
                    const planHiddenHere = planHidden.has(item.id);
                    // در تب «همه»: کنترل سراسری؛ در تب پلن: کنترل پلن
                    const switchChecked =
                      planTab === "all" ? !globallyHidden : !planHiddenHere;
                    const switchDisabled =
                      planTab !== "all" && globallyHidden;
                    const labelValue =
                      planTab === "all"
                        ? cfg.labels[item.id] ?? ""
                        : planCfg?.labels?.[item.id] ?? "";
                    const isCustomLink = !!item.url;
                    const ci = cfg.customItems.findIndex((c) => c.id === item.id);
                    const customBadgeValue =
                      ci >= 0 ? cfg.customItems[ci].badge ?? "" : cfg.badges[item.id] ?? "";
                    const badgeValue =
                      planTab === "all" ? customBadgeValue : cfg.badges[item.id] ?? "";
                    const Icon = navIconByName(item.icon);
                    return (
                      <div
                        key={item.id}
                        className={`flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 ${
                          (planTab === "all" ? globallyHidden : globallyHidden || planHiddenHere)
                            ? "opacity-60"
                            : ""
                        }`}
                      >
                        {/* جابه‌جایی — فقط در تب «همه» */}
                        {planTab === "all" ? (
                          <div className="flex flex-col">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-4 w-4 p-0"
                              onClick={() => move(item.id, -1)}
                              aria-label={`انتقال ${effectiveLabel(item.id)} به بالا`}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-4 w-4 p-0"
                              onClick={() => move(item.id, 1)}
                              aria-label={`انتقال ${effectiveLabel(item.id)} به پایین`}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="w-4" />
                        )}

                        {/* آیکون */}
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

                        {/* شناسه + نام */}
                        <div className="flex min-w-[130px] flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground/70">
                            {item.id}
                            {isCustomLink && <ExternalLink className="h-2.5 w-2.5" />}
                            {item.isCustom && !isCustomLink && (
                              <Badge variant="secondary" className="h-3 px-1 text-[8px]">
                                دلخواه
                              </Badge>
                            )}
                          </span>
                          <Input
                            value={labelValue}
                            placeholder={effectiveLabel(item.id)}
                            onChange={(e) =>
                              planTab === "all"
                                ? setLabel(item.id, e.target.value)
                                : setPlanLabel(item.id, e.target.value)
                            }
                            className="h-8 text-xs"
                            maxLength={40}
                            disabled={saving}
                          />
                        </div>

                        {/* بج — فقط تب «همه» */}
                        {planTab === "all" && (
                          <div className="flex w-[84px] flex-col gap-0.5">
                            <span className="text-[9px] text-muted-foreground/70">بج</span>
                            <Input
                              value={badgeValue}
                              placeholder={item.defaultBadge ?? "—"}
                              onChange={(e) => setBadge(item.id, e.target.value)}
                              className="h-8 text-xs"
                              maxLength={20}
                              disabled={saving}
                            />
                          </div>
                        )}

                        {/* سوییچ نمایش */}
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[9px] text-muted-foreground/70">
                            {planTab === "all" ? "نمایش" : "در این پلن"}
                          </span>
                          <Switch
                            checked={switchChecked}
                            onCheckedChange={(v) => toggleVisible(item.id, v)}
                            disabled={saving || switchDisabled}
                            aria-label={`نمایش ${effectiveLabel(item.id)}`}
                          />
                        </div>

                        {/* حذف آیتم دلخواه */}
                        {item.isCustom && planTab === "all" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive/80 hover:text-destructive"
                            onClick={() => deleteCustom(item.id)}
                            aria-label={`حذف ${effectiveLabel(item.id)}`}
                            title="حذف آیتم دلخواه"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* یادداشت وضعیت سراسری در تب پلن */}
                        {planTab !== "all" && globallyHidden && (
                          <span className="flex w-full items-center gap-1 text-[10px] text-destructive/80">
                            <EyeOff className="h-3 w-3" /> این آیتم به‌صورت سراسری مخفی است
                          </span>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}

          {/* آیتم‌های دلخواه */}
          <CustomItemsCard cfg={cfg} setCfg={setCfg} saving={saving} />
        </div>

        {/* ستون پیش‌نمایش زنده */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <PanelLeft className="h-4 w-4 text-primary" />
                پیش‌نمایش زنده
                <Badge variant="secondary" className="text-[10px]">
                  {planTab === "all" ? "همه" : PLAN_LABELS[planTab]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                dir="rtl"
                className="compact-scroll max-h-[440px] xl:max-h-[560px] overflow-y-auto rounded-lg border border-border bg-sidebar p-2"
              >
                {previewGroups.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    هیچ آیتمی نمایش داده نمی‌شود
                  </p>
                )}
                {previewGroups.map((g, gi) => (
                  <div key={g.group} className="mb-1">
                    {gi > 0 && <div className="mx-2 my-2 h-px bg-border" />}
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {g.group}
                    </p>
                    {g.items.map((item) => {
                      const PIcon = navIconByName(item.icon);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground"
                        >
                          <PIcon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate text-start">{item.label}</span>
                          {item.badge && (
                            <Badge
                              variant="secondary"
                              className={`min-h-[20px] h-auto leading-[1.2] text-[10px] px-1.5 py-0.5 ${
                                item.badge === "جدید"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-destructive/10 text-destructive"
                              }`}
                            >
                              {item.badge}
                            </Badge>
                          )}
                          {item.url && <ExternalLink className="h-3 w-3 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                {toPersianDigits(String(previewNav.length))} آیتم فعال — این دقیقاً همان
                چیزی است که کاربران{" "}
                {planTab === "all" ? "همه پلن‌ها" : `پلن ${PLAN_LABELS[planTab]}`} در
                سایدبار پنل می‌بینند (قفل پلن جداگانه اعمال می‌شود).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════ کارت آیتم‌های دلخواه ═════════════════════

function CustomItemsCard({
  cfg,
  setCfg,
  saving,
}: {
  cfg: ModuleManagerConfig;
  setCfg: React.Dispatch<React.SetStateAction<ModuleManagerConfig>>;
  saving: boolean;
}) {
  const { toast } = useToast();

  // فرم افزودن
  const [addType, setAddType] = React.useState<"module" | "link">("module");
  const [addLabel, setAddLabel] = React.useState("");
  const [addModuleId, setAddModuleId] = React.useState("");
  const [addUrl, setAddUrl] = React.useState("");
  const [addIcon, setAddIcon] = React.useState("Star");
  const [addGroupMode, setAddGroupMode] = React.useState<"existing" | "custom">("existing");
  const [addGroup, setAddGroup] = React.useState(NAV_GROUPS[6] ?? NAV_GROUPS[0]);
  const [addCustomGroup, setAddCustomGroup] = React.useState("");
  const [addBadge, setAddBadge] = React.useState("");

  /** گزینه‌های ماژول: فقط ماژول‌های خارج از سایدبار پیش‌فرض + استفاده‌نشده */
  const moduleOptions = React.useMemo(() => {
    const used = new Set([
      ...NAV_ITEMS.map((n) => n.id),
      ...cfg.customItems.map((c) => c.id),
    ]);
    return KNOWN_MODULE_IDS.filter((m) => !used.has(m.id));
  }, [cfg.customItems]);

  const addCustomItem = () => {
    const label = addLabel.trim().slice(0, 40);
    if (!label) {
      toast({
        title: "نام آیتم الزامی است",
        description: "متنی بین ۱ تا ۴۰ کاراکتر وارد کنید",
        variant: "destructive",
      });
      return;
    }
    const group =
      addGroupMode === "custom"
        ? addCustomGroup.trim().slice(0, 30)
        : addGroup;
    if (!group) {
      toast({
        title: "گروه آیتم را مشخص کنید",
        description: "گروه موجود را انتخاب کنید یا نام گروه دلخواه بنویسید",
        variant: "destructive",
      });
      return;
    }

    let id: string;
    if (addType === "module") {
      if (!addModuleId) {
        toast({
          title: "ماژول مقصد را انتخاب کنید",
          description: "آیتم دلخواه از نوع «ماژول» باید به یک ماژول موجود اشاره کند",
          variant: "destructive",
        });
        return;
      }
      id = addModuleId;
    } else {
      const url = addUrl.trim().slice(0, 300);
      if (!/^https?:\/\/[^\s]+$/i.test(url) && !url.startsWith("/")) {
        toast({
          title: "آدرس لینک نامعتبر است",
          description: "آدرس باید با http:// یا https:// شروع شود (حداکثر ۳۰۰ کاراکتر)",
          variant: "destructive",
        });
        return;
      }
      // شناسهٔ یکتا برای لینک — الگوی [a-z0-9-]+
      let n = 1;
      const taken = new Set([
        ...NAV_ITEMS.map((v) => v.id),
        ...cfg.customItems.map((c) => c.id),
      ]);
      while (taken.has(`link-${n}`)) n++;
      id = `link-${n}`;
    }

    const item: CustomNavItem = {
      id,
      label,
      icon: addIcon,
      group,
      ...(addBadge.trim() ? { badge: addBadge.trim().slice(0, 20) } : {}),
      ...(addType === "link" ? { url: addUrl.trim().slice(0, 300) } : {}),
    };

    setCfg((prev) => ({
      ...prev,
      customItems: [...prev.customItems, item],
      order: [...prev.order.filter((o) => o !== id), id],
    }));

    // ریست فرم
    setAddLabel("");
    setAddModuleId("");
    setAddUrl("");
    setAddBadge("");
    toast({
      title: "آیتم دلخواه افزوده شد",
      description: `«${label}» به گروه «${group}» اضافه شد — برای اعمال، ذخیره کنید`,
    });
  };

  const updateCustom = (id: string, patch: Partial<CustomNavItem>) => {
    setCfg((prev) => ({
      ...prev,
      customItems: prev.customItems.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <Plus className="h-4 w-4 text-primary" />
          افزودن آیتم دلخواه
          <Badge variant="outline" className="font-mono text-[10px]">
            {toPersianDigits(String(cfg.customItems.length))} از ۲۰
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* فرم افزودن */}
        <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">نوع آیتم</Label>
            <Select
              value={addType}
              onValueChange={(v) => setAddType(v as "module" | "link")}
              disabled={saving}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="module">ماژول موجود (مخفی)</SelectItem>
                <SelectItem value="link">لینک خارجی</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {addType === "module"
                ? "ماژول‌هایی که رندر می‌شوند ولی در سایدبار نیستند (مثل مدیریت تولیدی)"
                : "با کلیک، آدرس در تب جدید باز می‌شود"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">نام نمایشی</Label>
            <Input
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              placeholder="مثلاً مدیریت تولیدی"
              maxLength={40}
              disabled={saving}
              className="h-9 text-xs"
            />
          </div>

          {addType === "module" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">ماژول مقصد</Label>
              <Select
                value={addModuleId}
                onValueChange={setAddModuleId}
                disabled={saving || moduleOptions.length === 0}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="یک ماژول انتخاب کنید" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {moduleOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.label} — {m.id}
                    </SelectItem>
                  ))}
                  {moduleOptions.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      همه ماژول‌های موجود استفاده شده‌اند
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">آدرس لینک</Label>
              <Input
                dir="ltr"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://example.com"
                maxLength={300}
                disabled={saving}
                className="h-9 text-xs"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">آیکون</Label>
            <div className="flex items-center gap-2">
              {React.createElement(navIconByName(addIcon), {
                className: "h-4 w-4 shrink-0 text-primary",
              })}
              <Select value={addIcon} onValueChange={setAddIcon} disabled={saving}>
                <SelectTrigger className="h-9 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {ICON_CHOICES.map((ic) => (
                    <SelectItem key={ic} value={ic} className="text-xs">
                      {ic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">گروه</Label>
            <Select
              value={addGroupMode === "existing" ? addGroup : "__custom__"}
              onValueChange={(v) => {
                if (v === "__custom__") {
                  setAddGroupMode("custom");
                } else {
                  setAddGroupMode("existing");
                  setAddGroup(v);
                }
              }}
              disabled={saving}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {NAV_GROUPS.map((g) => (
                  <SelectItem key={g} value={g} className="text-xs">
                    {g}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__" className="text-xs">
                  گروه دلخواه…
                </SelectItem>
              </SelectContent>
            </Select>
            {addGroupMode === "custom" && (
              <Input
                value={addCustomGroup}
                onChange={(e) => setAddCustomGroup(e.target.value)}
                placeholder="نام گروه جدید (حداکثر ۳۰ کاراکتر)"
                maxLength={30}
                disabled={saving}
                className="h-9 text-xs"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">بج (اختیاری)</Label>
            <Input
              value={addBadge}
              onChange={(e) => setAddBadge(e.target.value)}
              placeholder="مثلاً جدید"
              maxLength={20}
              disabled={saving}
              className="h-9 text-xs"
            />
          </div>

          <div className="flex items-end">
            <Button
              size="sm"
              onClick={addCustomItem}
              disabled={saving || cfg.customItems.length >= 20}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              افزودن به سایدبار
            </Button>
          </div>
        </div>

        {/* فهرست آیتم‌های دلخواه فعلی */}
        {cfg.customItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              آیتم‌های دلخواه فعلی — ویرایش مستقیم:
            </p>
            {cfg.customItems.map((c) => {
              const CIcon = navIconByName(c.icon);
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2"
                >
                  <CIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground/70">
                    {c.id}
                    {c.url ? (
                      <Badge variant="secondary" className="h-3 px-1 text-[8px] gap-0.5">
                        <ExternalLink className="h-2.5 w-2.5" /> لینک
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="h-3 px-1 text-[8px]">
                        ماژول
                      </Badge>
                    )}
                  </span>
                  <Input
                    value={c.label}
                    onChange={(e) => updateCustom(c.id, { label: e.target.value.slice(0, 40) })}
                    className="h-8 min-w-[110px] flex-1 text-xs"
                    maxLength={40}
                    disabled={saving}
                    aria-label={`نام ${c.label}`}
                  />
                  <Input
                    value={c.badge ?? ""}
                    onChange={(e) =>
                      updateCustom(c.id, {
                        badge: e.target.value.slice(0, 20).trim() || undefined,
                      })
                    }
                    placeholder="بج"
                    className="h-8 w-[70px] text-xs"
                    maxLength={20}
                    disabled={saving}
                    aria-label={`بج ${c.label}`}
                  />
                  <Select
                    value={c.icon}
                    onValueChange={(v) => updateCustom(c.id, { icon: v })}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="آیکون">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {ICON_CHOICES.map((ic) => (
                        <SelectItem key={ic} value={ic} className="text-xs">
                          {ic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={NAV_GROUPS.includes(c.group) ? c.group : "__custom__"}
                    onValueChange={(v) => updateCustom(c.id, { group: v === "__custom__" ? c.group : v })}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="گروه">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {NAV_GROUPS.map((g) => (
                        <SelectItem key={g} value={g} className="text-xs">
                          {g}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__" className="text-xs">
                        {NAV_GROUPS.includes(c.group) ? "گروه دلخواه…" : c.group}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
