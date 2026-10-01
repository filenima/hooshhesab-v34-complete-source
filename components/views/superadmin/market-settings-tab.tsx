"use client";

import * as React from "react";
import {
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Youtube,
  Video,
  Save,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toPersianDigits, formatNumber, formatJalaliDayLabel } from "@/lib/persian";
import {
  COMPETITOR_REGISTRY_LABELS,
  type CompetitorPriceRow,
  type CompetitorRegistryId,
  type MediaChannelsSetting,
} from "@/lib/system-settings";

/**
 * MarketSettingsTab — تب «قیمت روز رقبا و کانال‌های رسانه» (#23 + #15، v34-5)
 * ============================================================================
 * ادیتور سوپرادمین برای:
 * ۱) دفتر قیمت روز رقبا (هلو/تدبیر/سپیدار) — منبع حقیقت صفحهٔ /compare
 * ۲) کانال‌های رسانه (یوتیوب/آپارات) — iframeهای صفحهٔ /podcasts
 * ذخیره از طریق PATCH /api/platform/market-settings (requireSuperAdmin).
 * قیمت‌ها «بر اساس آخرین استعلام» ثبت می‌شوند — عدد لایو نیست.
 */

const COMPETITOR_IDS = Object.keys(COMPETITOR_REGISTRY_LABELS) as CompetitorRegistryId[];

const PERIOD_OPTIONS: { value: CompetitorPriceRow["period"]; label: string }[] = [
  { value: "year", label: "سالانه" },
  { value: "month", label: "ماهانه" },
  { value: "once", label: "یک‌باره (لایسنس دائمی)" },
];

function periodLabelFa(period: CompetitorPriceRow["period"]): string {
  return PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? "سالانه";
}

/** ردیف ویرایش محلی — فیلد قیمت به‌صورت رشته نگه داشته می‌شود تا تایپ راحت باشد */
interface EditableRow {
  key: string;
  competitor: CompetitorRegistryId;
  planName: string;
  period: CompetitorPriceRow["period"];
  price: string;
  note: string;
  verifiedAt: string;
}

function rowToEditable(r: CompetitorPriceRow, i: number): EditableRow {
  return {
    key: `row-${i}-${r.competitor}-${Math.random().toString(36).slice(2, 8)}`,
    competitor: r.competitor,
    planName: r.planName,
    period: r.period,
    price: String(r.priceToman ?? ""),
    note: r.note,
    verifiedAt: r.verifiedAt,
  };
}

function emptyRow(): EditableRow {
  return {
    key: `row-new-${Math.random().toString(36).slice(2, 8)}`,
    competitor: "holoo",
    planName: "",
    period: "year",
    price: "",
    note: "استعلام دستی",
    verifiedAt: new Date().toISOString(),
  };
}

export function MarketSettingsTab({ token }: { token?: string }) {
  const [rows, setRows] = React.useState<EditableRow[]>([]);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [channels, setChannels] = React.useState<MediaChannelsSetting>({
    youtubeChannelId: "",
    aparatUsername: "",
  });
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [savingPrices, setSavingPrices] = React.useState(false);
  const [savingChannels, setSavingChannels] = React.useState(false);
  const [priceMsg, setPriceMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [channelMsg, setChannelMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const authHeaders = React.useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/platform/market-settings", {
        headers: { Authorization: `Bearer ${token ?? ""}` },
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        competitorPrices?: { updatedAt: string; sources: CompetitorPriceRow[] };
        mediaChannels?: MediaChannelsSetting;
        error?: string;
      };
      if (!res.ok || !json?.success || !json.competitorPrices) {
        setLoadError(json?.error || "خطا در دریافت تنظیمات بازار و رسانه");
        return;
      }
      setRows(json.competitorPrices.sources.map(rowToEditable));
      setUpdatedAt(json.competitorPrices.updatedAt);
      if (json.mediaChannels) setChannels(json.mediaChannels);
    } catch {
      setLoadError("خطا در ارتباط با سرور — دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const updateRow = (key: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const savePrices = async () => {
    // اعتبارسنجی سمت کلاینت — نام خالی یا قیمت نامعتبر رد می‌شود
    const clean: CompetitorPriceRow[] = [];
    for (const r of rows) {
      const price = Number(r.price.replace(/[^\d]/g, ""));
      if (!r.planName.trim() || !Number.isFinite(price) || price <= 0) continue;
      clean.push({
        competitor: r.competitor,
        planName: r.planName.trim(),
        period: r.period,
        priceToman: price,
        note: r.note.trim() || "استعلام دستی",
        verifiedAt: r.verifiedAt,
      });
    }
    if (clean.length === 0) {
      setPriceMsg({ ok: false, text: "حداقل یک ردیف معتبر لازم است — نام بسته و قیمت را کامل کنید" });
      return;
    }
    setSavingPrices(true);
    setPriceMsg(null);
    try {
      const res = await fetch("/api/platform/market-settings", {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ competitorPrices: { sources: clean } }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        competitorPrices?: { updatedAt: string; sources: CompetitorPriceRow[] };
        error?: string;
      };
      if (!res.ok || !json?.success) {
        setPriceMsg({ ok: false, text: json?.error || "ذخیره ناموفق بود" });
        return;
      }
      if (json.competitorPrices) {
        setRows(json.competitorPrices.sources.map(rowToEditable));
        setUpdatedAt(json.competitorPrices.updatedAt);
      }
      setPriceMsg({
        ok: true,
        text: `قیمت‌ها به‌روزرسانی شد — ${toPersianDigits(clean.length)} ردیف ذخیره شد`,
      });
    } catch {
      setPriceMsg({ ok: false, text: "خطا در ارتباط با سرور — دوباره تلاش کنید" });
    } finally {
      setSavingPrices(false);
    }
  };

  const saveChannels = async () => {
    setSavingChannels(true);
    setChannelMsg(null);
    try {
      const res = await fetch("/api/platform/market-settings", {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ mediaChannels: channels }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        mediaChannels?: MediaChannelsSetting;
        error?: string;
      };
      if (!res.ok || !json?.success) {
        setChannelMsg({ ok: false, text: json?.error || "ذخیره ناموفق بود" });
        return;
      }
      if (json.mediaChannels) setChannels(json.mediaChannels);
      setChannelMsg({ ok: true, text: "کانال‌های رسانه ذخیره شد" });
    } catch {
      setChannelMsg({ ok: false, text: "خطا در ارتباط با سرور — دوباره تلاش کنید" });
    } finally {
      setSavingChannels(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground" role="status">
        <Loader2 className="ml-2 h-5 w-5 animate-spin" />
        در حال بارگذاری تنظیمات بازار و رسانه...
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={() => void load()} className="h-11">
            <RefreshCw className="ml-1 h-4 w-4" />
            تلاش مجدد
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ===== بخش ۱: دفتر قیمت روز رقبا (#23) ===== */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">قیمت روز رقبا</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  منبع حقیقت بخش «مقایسهٔ تعاملی قیمت روز» در صفحهٔ /compare — قیمت‌ها بر اساس
                  آخرین استعلام دستی ثبت می‌شوند، نه عدد لایو
                </CardDescription>
              </div>
            </div>
            {updatedAt && (
              <Badge variant="secondary" className="text-[10px]">
                آخرین به‌روزرسانی: {formatJalaliDayLabel(updatedAt)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* جدول ردیف‌های قیمت */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-right text-xs">رقیب</TableHead>
                  <TableHead className="text-right text-xs min-w-[12rem]">نام بسته/پلن</TableHead>
                  <TableHead className="text-right text-xs">دوره</TableHead>
                  <TableHead className="text-right text-xs min-w-[8rem]">قیمت (تومان)</TableHead>
                  <TableHead className="text-right text-xs min-w-[10rem]">یادداشت استعلام</TableHead>
                  <TableHead className="w-12" aria-label="حذف" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>
                      <select
                        value={r.competitor}
                        onChange={(e) =>
                          updateRow(r.key, { competitor: e.target.value as CompetitorRegistryId })
                        }
                        aria-label={`رقیب ردیف ${r.planName || "بدون نام"}`}
                        className="h-11 w-24 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        {COMPETITOR_IDS.map((id) => (
                          <option key={id} value={id}>
                            {COMPETITOR_REGISTRY_LABELS[id]}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.planName}
                        onChange={(e) => updateRow(r.key, { planName: e.target.value })}
                        placeholder="مثلاً هلو — لایسنس پایه"
                        className="h-11 text-xs"
                        aria-label="نام بسته"
                        maxLength={120}
                      />
                    </TableCell>
                    <TableCell>
                      <select
                        value={r.period}
                        onChange={(e) =>
                          updateRow(r.key, {
                            period: e.target.value as CompetitorPriceRow["period"],
                          })
                        }
                        aria-label="دورهٔ صورتحساب"
                        className="h-11 w-28 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        {PERIOD_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.price}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^\d]/g, "");
                          updateRow(r.key, { price: digits });
                        }}
                        inputMode="numeric"
                        dir="ltr"
                        placeholder="9500000"
                        className="h-11 text-xs tnum"
                        aria-label="قیمت تومان"
                      />
                      {r.price && (
                        <p className="mt-1 text-[10px] text-muted-foreground tnum">
                          {formatNumber(Number(r.price) || 0)} تومان
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.note}
                        onChange={(e) => updateRow(r.key, { note: e.target.value })}
                        placeholder="مثلاً استعلام دستی — شامل ارتقا"
                        className="h-11 text-xs"
                        aria-label="یادداشت استعلام"
                        maxLength={300}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-destructive hover:bg-destructive/10"
                        onClick={() => removeRow(r.key)}
                        aria-label={`حذف ردیف ${r.planName || "بدون نام"}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                      ردیفی ثبت نشده — با دکمهٔ «افزودن ردیف» اولین استعلام را ثبت کنید
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
            >
              <Plus className="ml-1 h-4 w-4" />
              افزودن ردیف
            </Button>
            <Button
              type="button"
              className="h-11"
              onClick={() => void savePrices()}
              disabled={savingPrices}
            >
              {savingPrices ? (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="ml-1 h-4 w-4" />
              )}
              به‌روزرسانی قیمت‌ها
            </Button>
            {priceMsg && (
              <p
                role="status"
                className={`flex items-center gap-1 text-xs ${
                  priceMsg.ok
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {priceMsg.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {priceMsg.text}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ===== بخش ۲: کانال‌های رسانه (#15) ===== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">کانال‌های رسانه (پادکست و ویدیو)</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                شناسهٔ کانال یوتیوب و نام کاربری آپارات — پس از ثبت، صفحهٔ /podcasts قسمت‌ها را
                همان‌جا نمایش می‌دهد؛ خالی بگذارید تا جای‌نگهدار «به‌زودی» دیده شود
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="yt-channel" className="text-xs">
                <Youtube className="ml-1 inline h-3.5 w-3.5" />
                شناسهٔ کانال یوتیوب (UC...)
              </Label>
              <Input
                id="yt-channel"
                dir="ltr"
                value={channels.youtubeChannelId}
                onChange={(e) =>
                  setChannels((c) => ({ ...c, youtubeChannelId: e.target.value }))
                }
                placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                className="h-11 text-xs font-mono"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aparat-username" className="text-xs">
                نام کاربری آپارات
              </Label>
              <Input
                id="aparat-username"
                dir="ltr"
                value={channels.aparatUsername}
                onChange={(e) =>
                  setChannels((c) => ({ ...c, aparatUsername: e.target.value }))
                }
                placeholder="hooshhesab"
                className="h-11 text-xs font-mono"
                maxLength={60}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="h-11"
              onClick={() => void saveChannels()}
              disabled={savingChannels}
            >
              {savingChannels ? (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="ml-1 h-4 w-4" />
              )}
              ذخیرهٔ کانال‌ها
            </Button>
            {channelMsg && (
              <p
                role="status"
                className={`flex items-center gap-1 text-xs ${
                  channelMsg.ok
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {channelMsg.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {channelMsg.text}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
