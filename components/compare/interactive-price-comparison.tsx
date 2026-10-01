"use client";

import * as React from "react";
import { CheckCircle2, XCircle, CircleDollarSign, RefreshCw, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, toPersianDigits, formatJalaliDayLabel } from "@/lib/persian";
import { monthlyPriceOfYearly } from "@/lib/plans";
import { competitorAnalysis } from "@/lib/competitor-deep-analysis";
import {
  COMPETITOR_REGISTRY_LABELS,
  type CompetitorPricesSetting,
  type CompetitorRegistryId,
} from "@/lib/system-settings";

/**
 * InteractivePriceComparison — «مقایسهٔ تعاملی قیمت روز» (#23، v34-5)
 * ============================================================================
 * بخش تعاملی صفحهٔ /compare:
 * - جدول قیمت هوش (ماهانه/سالانه — منبع واحد lib/plans.ts) در برابر دفتر قیمت
 *   رقبا (هلو/تدبیر/سپیدار — قابل ویرایش سوپرادمین از SystemSettings)
 * - چیپ «آخرین به‌روزرسانی» + هشدار کهربایی اگر استعلام بیش از ۳۰ روز قدیمی باشد
 * - کلید دورهٔ مقایسه (سالانه/ماهانه) + چیپ‌های سقف بودجه که ردیف‌های خارج از
 *   بودجه را کم‌رنگ می‌کنند
 * - ماتریس فشردهٔ قابلیت‌ها از دادهٔ تحلیل رقبا (lib/competitor-deep-analysis)
 * قاب صادقانه: قیمت رقبا «بر اساس آخرین استعلام» است — عدد لایو نیست.
 */

export interface HooshPlanPrice {
  id: string;
  name: string;
  yearlyToman: number;
}

type CompareMode = "yearly" | "monthly";

const PERIOD_LABELS_FA: Record<string, string> = {
 year: "سالانه",
 month: "ماهانه",
 once: "یک‌باره (لایسنس دائمی)",
};

/** ویژگی‌های فشردهٔ هر رقیب — از تحلیل رقبا؛ تدبیر محافظه‌کارانه (استعلام نشده = «؟») */
const FEATURE_MATRIX: {
  key: string;
  label: string;
  values: Record<string, boolean | "unknown">;
}[] = (() => {
  const byId = Object.fromEntries(competitorAnalysis.map((c) => [c.id, c]));
  const holoo = byId["holoo"];
  const sepidar = byId["sepidar"];
  return [
    {
      key: "cloud",
      label: "ابری — دسترسی از هر دستگاه",
      values: { hoosh: true, holoo: false, tadbir: false, sepidar: false },
    },
    {
      key: "modian",
      label: "اتصال به سامانه مودیان",
      values: {
        hoosh: true,
        holoo: holoo ? holoo.modian.connected : "unknown",
        tadbir: true, // تدبیر — اتصال مودیان در نسخه‌های رسمی (استعلام عمومی)
        sepidar: sepidar ? sepidar.modian.connected : "unknown",
      },
    },
    {
      key: "ai",
      label: "هوش مصنوعی (OCR، پیش‌بینی، چت‌بات)",
      values: { hoosh: true, holoo: false, tadbir: "unknown", sepidar: false },
    },
    {
      key: "mobile",
      label: "اپ موبایل نیتیو",
      values: { hoosh: true, holoo: false, tadbir: "unknown", sepidar: false },
    },
    {
      key: "api",
      label: "API و اتصال برنامه‌نویسی",
      values: {
        hoosh: true,
        holoo: false,
        tadbir: "unknown",
        sepidar: sepidar ? sepidar.api.hasApi : "unknown",
      },
    },
  ];
})();

const FEATURE_BRAND_LABELS: { key: string; label: string }[] = [
  { key: "hoosh", label: "هوش" },
  { key: "holoo", label: "هلو" },
  { key: "tadbir", label: "تدبیر" },
  { key: "sepidar", label: "سپیدار" },
];

/** بودجه‌های پیشنهادی هر حالت (تومان) */
const BUDGETS: Record<CompareMode, { label: string; max: number }[]> = {
 yearly: [
  { label: "تا ۱۰ میلیون", max: 10_000_000 },
  { label: "تا ۲۰ میلیون", max: 20_000_000 },
  { label: "تا ۴۰ میلیون", max: 40_000_000 },
 ],
 monthly: [
  { label: "تا ۱ میلیون / ماه", max: 1_000_000 },
  { label: "تا ۱٫۵ میلیون / ماه", max: 1_500_000 },
  { label: "تا ۳ میلیون / ماه", max: 3_000_000 },
 ],
};

export function InteractivePriceComparison({
  hooshPlans,
  registry,
}: {
  hooshPlans: HooshPlanPrice[];
  registry: CompetitorPricesSetting;
}) {
  const [mode, setMode] = React.useState<CompareMode>("yearly");
  const [budgetMax, setBudgetMax] = React.useState<number | null>(null);

  // سن استعلام — هشدار کهربایی اگر بیش از ۳۰ روز از آخرین به‌روزرسانی گذشته باشد
  const updatedMs = React.useMemo(() => {
    const t = Date.parse(registry.updatedAt);
    return Number.isFinite(t) ? t : 0;
  }, [registry.updatedAt]);
  const isStale = React.useMemo(() => {
    if (!updatedMs) return true;
    return Date.now() - updatedMs > 30 * 24 * 60 * 60 * 1000;
  }, [updatedMs]);

  // ردیف‌های هوش — قیمت دورهٔ انتخابی از منبع واحد
  const hooshRows = React.useMemo(
    () =>
      hooshPlans.map((p) => {
        const price = mode === "monthly" ? monthlyPriceOfYearly(p.yearlyToman) : p.yearlyToman;
        return {
          key: `hoosh-${p.id}`,
          brand: "هوش",
          planName: `پلن ${p.name}`,
          periodLabel: mode === "monthly" ? "ماهانه" : "سالانه",
          priceToman: price,
          note: mode === "monthly" ? "قابل لغو هر زمان" : "شامل تمام ماژول‌های پلن",
          isHoosh: true as const,
        };
      }),
    [hooshPlans, mode]
  );

  // ردیف‌های رقبا — مستقیم از دفتر قیمت (استعلام دستی)
  const competitorRows = React.useMemo(
    () =>
      registry.sources.map((s, i) => ({
        key: `comp-${s.competitor}-${i}`,
        brand: COMPETITOR_REGISTRY_LABELS[s.competitor as CompetitorRegistryId] ?? s.competitor,
        planName: s.planName,
        periodLabel: PERIOD_LABELS_FA[s.period] ?? "سالانه",
        priceToman: s.priceToman,
        note: s.note,
        isHoosh: false as const,
      })),
    [registry.sources]
  );

  const allRows = React.useMemo(() => [...hooshRows, ...competitorRows], [hooshRows, competitorRows]);
  const visibleRows = React.useMemo(
    () =>
      budgetMax === null
        ? allRows.map((r) => ({ ...r, affordable: true }))
        : allRows.map((r) => ({ ...r, affordable: r.priceToman <= budgetMax })),
    [allRows, budgetMax]
  );
  const affordableCount = visibleRows.filter((r) => r.affordable).length;

  return (
    <Card className="overflow-visible" id="interactive-price-compare">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">مقایسهٔ تعاملی قیمت روز</CardTitle>
              <CardDescription className="text-xs leading-relaxed mt-1">
                قیمت پلن‌های هوش (ماهانه و سالانه، زنده) در برابر آخرین استعلام قیمت هلو، تدبیر و
                سپیدار — بودجهٔ خود را انتخاب کنید تا گزینه‌های در دسترس مشخص شود
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] gap-1">
              <RefreshCw className="h-3 w-3" />
              آخرین به‌روزرسانی: {formatJalaliDayLabel(registry.updatedAt)}
            </Badge>
            {isStale && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] gap-1">
                به‌روزرسانی بیش از ۳۰ روز قبل
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* کلید دورهٔ مقایسه + چیپ‌های بودجه */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="دورهٔ مقایسه"
            className="inline-flex items-center rounded-full border border-border bg-muted/50 p-1"
          >
            <button
              type="button"
              onClick={() => setMode("yearly")}
              aria-pressed={mode === "yearly"}
              className={`flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition-all ${
                mode === "yearly"
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              سالانه
            </button>
            <button
              type="button"
              onClick={() => setMode("monthly")}
              aria-pressed={mode === "monthly"}
              className={`flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition-all ${
                mode === "monthly"
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ماهانه
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="سقف بودجه">
            <span className="text-xs text-muted-foreground">سقف بودجه:</span>
            <button
              type="button"
              onClick={() => setBudgetMax(null)}
              aria-pressed={budgetMax === null}
              className={`h-11 rounded-full border px-3 text-xs font-medium transition-all ${
                budgetMax === null
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              بدون سقف
            </button>
            {BUDGETS[mode].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => setBudgetMax(b.max)}
                aria-pressed={budgetMax === b.max}
                className={`h-11 rounded-full border px-3 text-xs font-medium transition-all ${
                  budgetMax === b.max
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {b.label}
              </button>
            ))}
            {budgetMax !== null && (
              <span className="text-[10px] text-muted-foreground tnum" role="status">
                {toPersianDigits(affordableCount)} گزینه در بودجهٔ شما
              </span>
            )}
          </div>
        </div>

        {/* جدول قیمت روز */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right text-xs">محصول</TableHead>
                <TableHead className="text-right text-xs min-w-[10rem]">بسته / پلن</TableHead>
                <TableHead className="text-right text-xs">دوره</TableHead>
                <TableHead className="text-right text-xs min-w-[8rem]">قیمت (تومان)</TableHead>
                <TableHead className="text-right text-xs min-w-[10rem]">یادداشت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r) => (
                <TableRow
                  key={r.key}
                  className={`transition-opacity ${r.affordable ? "" : "opacity-35"}`}
                >
                  <TableCell className="text-xs font-semibold">
                    {r.isHoosh ? (
                      <Badge className="bg-primary/10 text-primary text-[10px]">{r.brand}</Badge>
                    ) : (
                      <span className="text-foreground">{r.brand}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-foreground leading-relaxed">{r.planName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.periodLabel}</TableCell>
                  <TableCell className="text-xs tnum font-medium text-foreground">
                    {r.priceToman > 0 ? formatNumber(r.priceToman) : "رایگان"}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground leading-relaxed">{r.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ماتریس فشردهٔ قابلیت‌ها */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right text-xs">قابلیت</TableHead>
                {FEATURE_BRAND_LABELS.map((b) => (
                  <TableHead key={b.key} className="text-center text-xs">
                    {b.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURE_MATRIX.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="text-xs text-foreground leading-relaxed">{row.label}</TableCell>
                  {FEATURE_BRAND_LABELS.map((b) => {
                    const v = row.values[b.key];
                    return (
                      <TableCell key={b.key} className="text-center">
                        {v === true ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-primary" aria-label="دارد" />
                        ) : v === false ? (
                          <XCircle className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="ندارد" />
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                            title="استعلام نشده"
                          >
                            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            استعلام نشده
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          قیمت رقبا بر اساس آخرین استعلام دستی از فروشنده‌ها و سایت‌های رسمی ثبت شده است و ممکن است
          با قیمت لحظهٔ خرید تفاوت داشته باشد؛ برای قیمت قطعی با فروشندهٔ رسمی تماس بگیرید. قیمت‌های
          هوش از تعرفهٔ رسمی سایت خوانده می‌شود.
        </p>
      </CardContent>
    </Card>
  );
}
