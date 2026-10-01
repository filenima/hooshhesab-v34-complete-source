"use client";

/**
 * ============ MARKET-SYNC: همگام‌سازی قیمت با نرخ بازار ============
 * بخش اختیاری در ماژول انبار — قیمت کالاها به‌صورت خودکار/دستی به نسبت
 * تغییر نرخ لنگر (ارز یا طلا) تنظیم می‌شود. مخصوص پلن حرفه‌ای و سازمانی.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  Lock,
  Crown,
  ChevronDown,
  Loader2,
  RefreshCw,
  PowerOff,
  Search,
  Coins,
  ArrowLeft,
  Undo2,
  Sparkles,
  Check,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import {
  formatNumber,
  formatPrice,
  formatCompactRial,
  toPersianDigits,
  toJalali,
} from "@/lib/persian";

/** پلن‌های مجاز (سمت کلاینت — فقط برای نمایش؛ gating اصلی سمت سرور است) */
const ALLOWED_PLANS = ["pro", "enterprise", "business", "accountant"];

/** آیتم لنگر نرخ از /api/currency */
interface AnchorOption {
  code: string;
  name: string;
  rateToIrr: number | null;
  isGold: boolean;
}

/** کالای قابل انتخاب در حالت «انتخابی» */
interface PickerProduct {
  id: string;
  name: string;
  sku: string;
  price: number; // ریال
}

/** وضعیت همگام‌سازی از GET /api/products/market-sync */
interface SyncState {
  planAllowed: boolean;
  enabled: boolean;
  mode: "ALL" | "SELECTED" | null;
  anchorCode: string | null;
  anchorLabel: string | null;
  baseRate: number | null;
  currentRate: number | null;
  driftPercent: number | null;
  trackedCount: number;
  lastSyncedAt: string | null;
  lastUpdatedCount: number;
  samples: Array<{
    id: string;
    name: string;
    sku: string;
    currentPrice: number;
    newPrice: number;
    basePrice: number | null;
  }>;
}

const EMPTY_SYNC: SyncState = {
  planAllowed: true,
  enabled: false,
  mode: null,
  anchorCode: null,
  anchorLabel: null,
  baseRate: null,
  currentRate: null,
  driftPercent: null,
  trackedCount: 0,
  lastSyncedAt: null,
  lastUpdatedCount: 0,
  samples: [],
};

/** نمایش فشرده و خوانا نرخ ریالی لنگر */
function formatRate(rate: number): string {
  if (rate >= 10_000_000) return formatCompactRial(rate);
  return `${formatNumber(rate)} ریال`;
}

/** زمان نسبی فارسی */
function relativeTimeFa(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const minutes = Math.floor(Math.abs(diffMs) / 60_000);
  if (minutes < 1) return "چند لحظه پیش";
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toPersianDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${toPersianDigits(days)} روز پیش`;
  return toJalali(new Date(iso));
}

/** تغییر رنگ درصد انحراف نرخ */
function driftColor(pct: number | null): string {
  if (pct === null || Math.abs(pct) < 0.05) return "text-muted-foreground";
  return pct > 0 ? "text-success" : "text-destructive";
}

interface MarketPriceSyncProps {
  /** بعد از هر تغییر قیمت (sync/disable)، ماژول انبار لیست را refresh کند */
  onPricesChanged?: () => void;
}

export function MarketPriceSync({ onPricesChanged }: MarketPriceSyncProps) {
  const { toast } = useToast();

  const [sync, setSync] = React.useState<SyncState>(EMPTY_SYNC);
  const [loading, setLoading] = React.useState(true);
  const [anchors, setAnchors] = React.useState<AnchorOption[]>([]);
  const [anchorsLoading, setAnchorsLoading] = React.useState(true);

  // فرم فعال‌سازی
  const [formOpen, setFormOpen] = React.useState(true);
  const [anchorCode, setAnchorCode] = React.useState("USD");
  const [mode, setMode] = React.useState<"ALL" | "SELECTED">("ALL");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [pickerProducts, setPickerProducts] = React.useState<PickerProduct[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [pickerSearch, setPickerSearch] = React.useState("");

  // اکشن‌ها
  const [busy, setBusy] = React.useState<"enable" | "sync" | "disable" | null>(null);
  const [disableOpen, setDisableOpen] = React.useState(false);

  // ============ دریافت وضعیت ============
  const fetchSyncState = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/products/market-sync", { cache: "no-store" });
      const json = await res.json();
      if (json?.success && json.data) {
        setSync({ ...EMPTY_SYNC, ...json.data });
      }
    } catch {
      // خطای شبکه — حالت پیش‌فرض (غیرفعال) نمایش داده می‌شود
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSyncState();
    // پلن کاربر از پروفایل (نمایش نام پلن روی نشان پلن)
    void (async () => {
      try {
        const res = await authFetch("/api/user/profile", { cache: "no-store" });
        const json = await res.json();
        if (json?.success && json.data?.tenant) {
          const plan = String(json.data.tenant.plan || "").toLowerCase();
          setSync((s) => ({ ...s, planAllowed: ALLOWED_PLANS.includes(plan) }));
        }
      } catch {
        // وضعیت پلن از GET همگام‌سازی می‌آید
      }
    })();
    // فهرست لنگرها (ارزها + طلا) از /api/currency
    void (async () => {
      try {
        const res = await authFetch("/api/currency", { cache: "no-store" });
        const json = await res.json();
        if (json?.success && Array.isArray(json.data)) {
          const list: AnchorOption[] = json.data
            .filter(
              (c: { code?: string; name?: string; rateToIrr?: number | null; isGold?: boolean }) =>
                c.code && c.name && c.rateToIrr != null && c.rateToIrr > 0
            )
            .map((c: { code: string; name: string; rateToIrr: number; isGold: boolean }) => ({
              code: c.code,
              name: c.name,
              rateToIrr: c.rateToIrr,
              isGold: Boolean(c.isGold),
            }));
          setAnchors(list);
        }
      } catch {
        // فرم فعال‌سازی با فهرست خالی — کاربر پیام خطا می‌بیند
      } finally {
        setAnchorsLoading(false);
      }
    })();
  }, [fetchSyncState]);

  // بارگذاری تنبل کالاها برای حالت «انتخابی»
  React.useEffect(() => {
    if (mode !== "SELECTED" || pickerProducts.length > 0 || pickerLoading) return;
    let cancelled = false;
    setPickerLoading(true);
    void (async () => {
      try {
        const res = await authFetch("/api/products?limit=2000", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json?.success && Array.isArray(json.data)) {
          setPickerProducts(
            json.data.map(
              (p: { id: string; name: string; sku: string; salePrice: number }) => ({
                id: String(p.id),
                name: String(p.name),
                sku: String(p.sku),
                price: Number(p.salePrice) || 0, // ریال
              })
            )
          );
        }
      } catch {
        // لیست خالی می‌ماند
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, pickerProducts.length, pickerLoading]);

  // نرخ فعلی لنگرِ انتخاب‌شده در فرم
  const selectedAnchor = anchors.find((a) => a.code === anchorCode);
  const filteredPicker = React.useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return pickerProducts;
    return pickerProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [pickerProducts, pickerSearch]);

  const toggleProduct = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // ============ اجرای اکشن POST ============
  const runAction = React.useCallback(
    async (
      action: "enable" | "sync" | "disable",
      payload: Record<string, unknown>,
      successTitle: string
    ): Promise<boolean> => {
      setBusy(action);
      try {
        const res = await authFetch("/api/products/market-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.success) {
          toast({
            title: successTitle,
            description: json.message || undefined,
          });
          await fetchSyncState();
          onPricesChanged?.();
          return true;
        }
        // پاسخ ۴۰۳ با upgrade:true → پلن اجازه نمی‌دهد
        if (res.status === 403 && json?.upgrade) {
          setSync((s) => ({ ...s, planAllowed: false }));
        }
        toast({
          title: "خطا در همگام‌سازی بازار",
          description: json?.error || "پس از چند لحظه دوباره تلاش کنید.",
          variant: "destructive",
        });
        return false;
      } catch {
        toast({
          title: "خطای شبکه",
          description: "اتصال به سرور برقرار نشد.",
          variant: "destructive",
        });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [toast, fetchSyncState, onPricesChanged]
  );

  const handleEnable = async () => {
    if (!anchorCode) {
      toast({ title: "لنگر نرخ را انتخاب کنید", variant: "destructive" });
      return;
    }
    if (mode === "SELECTED" && selectedIds.size === 0) {
      toast({
        title: "هیچ کالایی انتخاب نشده",
        description: "در حالت «انتخابی» حداقل یک کالا را تیک بزنید.",
        variant: "destructive",
      });
      return;
    }
    const anchor = anchors.find((a) => a.code === anchorCode);
    await runAction(
      "enable",
      {
        mode,
        anchorCode,
        anchorLabel: anchor?.name,
        ...(mode === "SELECTED" ? { productIds: Array.from(selectedIds) } : {}),
      },
      "همگام‌سازی بازار فعال شد"
    );
  };

  const handleSync = async () => {
    await runAction("sync", {}, "قیمت‌ها با نرخ بازار همگام شد");
  };

  const handleDisable = async (choice: "keep" | "restore") => {
    const ok = await runAction("disable", { choice }, "همگام‌سازی بازار غیرفعال شد");
    if (ok) setDisableOpen(false);
  };

  // ============ رندر ============
  if (loading) {
    return (
      <Card className="card-hover">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  // ---------- حالت قفل (پلن پایین‌تر از حرفه‌ای) ----------
  if (!sync.planAllowed) {
    return (
      <Card className="card-hover overflow-hidden border-amber-200/60 dark:border-amber-500/20">
        <CardContent className="p-0">
          <div
            className="p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            style={{
              background:
                "linear-gradient(135deg, rgba(254,243,199,0.55) 0%, rgba(255,255,255,0.2) 100%)",
            }}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 border border-amber-200">
              <Lock className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">همگام‌سازی قیمت با نرخ بازار</h3>
                <Badge className="bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-500/30">
                  <Crown className="h-3 w-3 me-1" />
                  مخصوص پلن حرفه‌ای و سازمانی
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                قیمت کالاهای شما می‌تواند خودکار به‌تناسب نوسان دلار یا طلا بالا و پایین شود —
                بدون نیاز به ویرایش دستی کالا به کالا.
              </p>
            </div>
            <Button
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 shrink-0"
              onClick={() =>
                toast({
                  title: "ارتقای پلن لازم است",
                  description: "برای فعال‌سازی همگام‌سازی نرخ بازار، پلن خود را ارتقا دهید.",
                })
              }
            >
              <Crown className="h-4 w-4" />
              ارتقای پلن
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---------- حالت فعال — کارت وضعیت ----------
  if (sync.enabled) {
    const drift = sync.driftPercent;
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="card-hover border-teal-500/30 dark:border-teal-400/20 overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  همگام‌سازی قیمت با نرخ بازار
                  <Badge className="bg-success/10 text-success border border-success/20">
                    فعال
                  </Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void handleSync()}
                    disabled={busy === "sync"}
                  >
                    {busy === "sync" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    همگام‌سازی دستی
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
                    onClick={() => setDisableOpen(true)}
                    disabled={busy === "disable"}
                  >
                    <PowerOff className="h-4 w-4" />
                    غیرفعال‌سازی
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">لنگر نرخ</p>
                  <p className="font-bold text-sm mt-1">{sync.anchorLabel || sync.anchorCode}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    نرخ فعلی:{" "}
                    <span className="font-medium text-foreground tnum">
                      {sync.currentRate != null ? formatRate(sync.currentRate) : "—"}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">نرخ پایه (لحظه فعال‌سازی)</p>
                  <p className="font-bold text-sm mt-1 tnum">
                    {sync.baseRate != null ? formatRate(sync.baseRate) : "—"}
                  </p>
                  <p className={`text-[11px] font-medium mt-0.5 tnum ${driftColor(drift)}`}>
                    {drift !== null
                      ? `انحراف: ${drift > 0 ? "+" : ""}${formatNumber(drift, 1)}٪`
                      : "انحراف: —"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">کالاهای تحت پوشش</p>
                  <p className="font-bold text-sm mt-1">
                    {toPersianDigits(sync.trackedCount)} کالا
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {" "}
                      ({sync.mode === "SELECTED" ? "انتخابی" : "همه کالاها"})
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    آخرین همگام‌سازی: {relativeTimeFa(sync.lastSyncedAt)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">آخرین به‌روزرسانی</p>
                  <p className="font-bold text-sm mt-1">
                    {toPersianDigits(sync.lastUpdatedCount)} کالا
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    قیمت‌ها به نسبت تغییر نرخ بازار تنظیم می‌شوند
                  </p>
                </div>
              </div>

              {/* پیش‌نمایش تغییر قیمت‌ها (نمونه) */}
              {sync.samples.length > 0 && (
                <div className="mt-3 rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    پیش‌نمایش اثر همگام‌سازی (نمونه {toPersianDigits(sync.samples.length)} کالا)
                  </p>
                  <div className="space-y-1.5">
                    {sync.samples.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 text-xs flex-wrap"
                      >
                        <span className="font-medium truncate max-w-[45%]">{s.name}</span>
                        <span className="flex items-center gap-1.5 tnum text-muted-foreground">
                          <span>{formatPrice(s.currentPrice, "toman")}</span>
                          <ArrowLeft className="h-3 w-3 shrink-0" />
                          <span
                            className={
                              s.newPrice > s.currentPrice
                                ? "text-success font-medium"
                                : s.newPrice < s.currentPrice
                                  ? "text-destructive font-medium"
                                  : "font-medium"
                            }
                          >
                            {formatPrice(s.newPrice, "toman")}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ---------- دیالوگ جذاب غیرفعال‌سازی ---------- */}
        <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
          <AlertDialogContent className="sm:max-w-lg overflow-hidden p-0">
            <AnimatePresence>
              {disableOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <AlertDialogHeader className="p-5 pb-3 bg-gradient-to-br from-amber-50/80 via-transparent to-transparent dark:from-amber-950/20">
                    <AlertDialogTitle className="flex items-center gap-2.5 text-base">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-500/30">
                        <PowerOff className="h-4.5 w-4.5" />
                      </span>
                      غیرفعال‌سازی همگام‌سازی با بازار
                    </AlertDialogTitle>
                    <AlertDialogDescription className="leading-relaxed pt-1">
                      همگام‌سازی خودکار قیمت‌ها با نرخ{" "}
                      <span className="font-medium text-foreground">
                        {sync.anchorLabel || sync.anchorCode}
                      </span>{" "}
                      متوقف می‌شود. الان قیمت{" "}
                      <span className="font-medium text-foreground">
                        {toPersianDigits(sync.trackedCount)} کالا
                      </span>{" "}
                      حامل آخرین تغییرات بازار است. می‌خواهید بعد از غیرفعال‌سازی چه اتفاقی
                      بیفتد؟
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="px-5 pb-2 space-y-2.5">
                    {/* گزینه ۱: حفظ قیمت‌های فعلی */}
                    <button
                      type="button"
                      className="w-full text-start rounded-xl border border-teal-500/30 bg-teal-500/5 p-3.5 hover:bg-teal-500/10 hover:border-teal-500/50 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                      onClick={() => void handleDisable("keep")}
                      disabled={busy === "disable"}
                      aria-label="قیمت‌های فعلی به‌روز با بازار بمانند"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                          <Check className="h-4 w-4" />
                        </span>
                        <span className="flex-1">
                          <span className="block font-bold text-sm group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                            قیمت‌های فعلی (به‌روز با بازار) بمانند
                          </span>
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            آخرین قیمت‌های تنظیم‌شده توسط بازار روی کالاها حفظ می‌شود.
                          </span>
                        </span>
                        {busy === "disable" && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </span>
                    </button>

                    {/* گزینه ۲: برگشت به قیمت‌های اصلی */}
                    <button
                      type="button"
                      className="w-full text-start rounded-xl border border-border bg-card p-3.5 hover:bg-muted/40 hover:border-destructive/30 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
                      onClick={() => void handleDisable("restore")}
                      disabled={busy === "disable"}
                      aria-label="برگشت به قیمت‌های اصلی اولیه"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                          <Undo2 className="h-4 w-4" />
                        </span>
                        <span className="flex-1">
                          <span className="block font-bold text-sm">برگشت به قیمت‌های اصلی اولیه</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            قیمت کالاها به مقادیری که خودتان اول وارد کرده بودید برمی‌گردد.
                          </span>
                        </span>
                      </span>
                      {/* پیش‌نمایش قبل → بعد (برگشت) */}
                      {sync.samples.filter((s) => s.basePrice != null).length > 0 && (
                        <span className="mt-2.5 block rounded-lg bg-muted/40 border border-border/60 p-2 space-y-1">
                          {sync.samples
                            .filter((s) => s.basePrice != null)
                            .slice(0, 3)
                            .map((s) => (
                              <span
                                key={s.id}
                                className="flex items-center justify-between gap-2 text-[11px] flex-wrap"
                              >
                                <span className="truncate max-w-[45%]">{s.name}</span>
                                <span className="flex items-center gap-1 tnum text-muted-foreground">
                                  <span>{formatPrice(s.currentPrice, "toman")}</span>
                                  <ArrowLeft className="h-2.5 w-2.5 shrink-0" />
                                  <span className="font-medium text-foreground">
                                    {formatPrice(s.basePrice ?? 0, "toman")}
                                  </span>
                                </span>
                              </span>
                            ))}
                        </span>
                      )}
                    </button>
                  </div>

                  <AlertDialogFooter className="px-5 py-4 border-t border-border/50">
                    <AlertDialogCancel disabled={busy === "disable"} className="gap-1.5">
                      انصراف
                    </AlertDialogCancel>
                  </AlertDialogFooter>
                </motion.div>
              )}
            </AnimatePresence>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ---------- حالت خاموش — فرم فعال‌سازی ----------
  return (
    <Collapsible open={formOpen} onOpenChange={setFormOpen}>
      <Card className="card-hover border-teal-500/25 dark:border-teal-400/15">
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-lg"
              aria-expanded={formOpen}
            >
              <CardTitle className="text-base flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                  <TrendingUp className="h-4 w-4" />
                </span>
                همگام‌سازی قیمت با نرخ بازار
                <Badge variant="secondary" className="font-normal">
                  اختیاری — غیرفعال
                </Badge>
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${formOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              با فعال‌سازی این قابلیت، قیمت کالاها به‌صورت خودکار به‌تناسب نوسان نرخ بازار
              (ارز یا طلا) بالا و پایین می‌شود؛ هر زمان بخواهید می‌توانید آن را خاموش کنید.
            </p>

            {/* انتخاب لنگر نرخ */}
            <div className="space-y-1.5">
              <Label className="text-xs">لنگر نرخ بازار</Label>
              <Select value={anchorCode} onValueChange={setAnchorCode}>
                <SelectTrigger className="w-full" aria-label="لنگر نرخ بازار">
                  <SelectValue placeholder="یک ارز یا طلا انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {anchorsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : anchors.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3 px-2">
                      نرخی برای انتخاب یافت نشد — از صفحه ارزها نرخ‌ها را به‌روز کنید.
                    </p>
                  ) : (
                    anchors.map((a) => (
                      <SelectItem key={a.code} value={a.code}>
                        <span className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5">
                            {a.isGold ? (
                              <Coins className="h-3.5 w-3.5 text-amber-500" />
                            ) : (
                              <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {a.name}
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedAnchor?.rateToIrr != null && (
                <p className="text-[11px] text-muted-foreground">
                  نرخ فعلی:{" "}
                  <span className="font-medium text-foreground tnum">
                    {formatRate(selectedAnchor.rateToIrr)}
                  </span>{" "}
                  — قیمت‌ها به نسبت تغییر این نرخ بالا و پایین می‌شوند.
                </p>
              )}
            </div>

            {/* انتخاب محدوده کالاها */}
            <div className="space-y-1.5">
              <Label className="text-xs">کدام کالاها همگام شوند؟</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v === "SELECTED" ? "SELECTED" : "ALL")}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="mode-all"
                  className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                    mode === "ALL"
                      ? "border-teal-500/50 bg-teal-500/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="ALL" id="mode-all" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">همه کالاها</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      هر کالای تعریف‌شده (و کالاهای جدید) به‌طور خودکار دنبال می‌شوند.
                    </span>
                  </span>
                </Label>
                <Label
                  htmlFor="mode-selected"
                  className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                    mode === "SELECTED"
                      ? "border-teal-500/50 bg-teal-500/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="SELECTED" id="mode-selected" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">انتخابی</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      فقط کالاهایی که خودتان انتخاب می‌کنید.
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            </div>

            {/* لیست انتخاب کالاها */}
            <AnimatePresence initial={false}>
              {mode === "SELECTED" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="جستجوی نام کالا یا SKU..."
                        className="ps-9"
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                      />
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                        <span className="text-xs text-muted-foreground">
                          {pickerLoading
                            ? "در حال دریافت کالاها..."
                            : `${toPersianDigits(filteredPicker.length)} کالا — ${toPersianDigits(selectedIds.size)} انتخاب‌شده`}
                        </span>
                        {pickerProducts.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] px-2"
                            onClick={() =>
                              setSelectedIds(
                                selectedIds.size === filteredPicker.length
                                  ? new Set()
                                  : new Set(filteredPicker.map((p) => p.id))
                              )
                            }
                          >
                            {selectedIds.size === filteredPicker.length &&
                            filteredPicker.length > 0
                              ? "پاک‌کردن همه"
                              : "انتخاب همه"}
                          </Button>
                        )}
                      </div>
                      <div
                        className="max-h-72 overflow-y-auto p-2 space-y-1
                        [&::-webkit-scrollbar]:w-1.5
                        [&::-webkit-scrollbar-thumb]:rounded-full
                        [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25
                        [&::-webkit-scrollbar-track]:bg-transparent"
                        role="listbox"
                        aria-label="انتخاب کالاها برای همگام‌سازی"
                      >
                        {pickerLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : filteredPicker.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-6">
                            کالایی یافت نشد.
                          </p>
                        ) : (
                          filteredPicker.map((p) => {
                            const checked = selectedIds.has(p.id);
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                                  checked ? "bg-teal-500/5" : "hover:bg-muted/40"
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => toggleProduct(p.id, c === true)}
                                  aria-label={`انتخاب ${p.name}`}
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm font-medium truncate">
                                    {p.name}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground font-mono">
                                    {p.sku}
                                  </span>
                                </span>
                                <span className="text-[11px] text-muted-foreground tnum shrink-0">
                                  {formatPrice(p.price, "toman")}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Button
                className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white sm:w-auto w-full"
                onClick={() => void handleEnable()}
                disabled={busy === "enable" || anchorsLoading || anchors.length === 0}
              >
                {busy === "enable" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                فعال‌سازی همگام‌سازی
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
                نرخ فعلی لنگر به‌عنوان «نرخ پایه» ثبت و قیمت‌های امروز کالاها مبنا قرار می‌گیرند؛
                سپس با هر تغییر نرخ، قیمت‌ها به همان نسبت اصلاح می‌شوند.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
