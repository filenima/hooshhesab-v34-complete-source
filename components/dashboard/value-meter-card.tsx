"use client";

/**
 * ValueMeterCard — موتور ارزش‌افزوده و عادت‌سازی (v30)
 * ============================================================================
 * درخواست مالک: «کاربر وارد ابزار می‌شود گیر بیفتد (hook) و بیشتر ارزش کار را
 * بفهمد (value perception) و بیشتر بخواهد استفاده کند (habit).»
 *
 * سه اصل روانشناسی محصول:
 *  ۱. ارزش ادراک‌شده — صرفه‌جویی زمانی/ریالی محاسبه‌شده از «داده‌های واقعی خود
 *     کاربر» (نه آمار کلی): هر فاکتور ~۵ دقیقه کار دستی، هر چک ~۴ دقیقه، هر
 *     ارسال مودیان ~۶ دقیقه، هر مشتری/کالا ~۲ دقیقه → ساعت × نرخ ساعت اداری.
 *  ۲. زنجیرهٔ عادت (Streak) — روزهای متوالی فعال؛ پیام loss-aversion:
 *     «امروز هم یک ثبت داشته باش تا زنجیره نشکند».
 *  ۳. نشان‌های دستاورد (Milestones) — پیشرفت پلکانی با نوار پیشرفت به
 *     نشانِ بعدی → endowed progress (انگیزهٔ ادامه).
 *
 * داده از /api/value-meter (سبک + کش ۶۰ ثانیه).
 */

import * as React from "react";
import { motion } from "framer-motion";
import { Flame, Trophy, TrendingUp, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toPersianDigits, formatCompactToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface ValueMeterData {
  counts: {
    invoices: number;
    checks: number;
    parties: number;
    products: number;
    moadianSent: number;
  };
  activeDates: string[];
  firstActivityDate: string | null;
}

// نرخ‌های صرفه‌جویی (دقیقه کار دستی به‌ازای هر ثبت) — محافظه‌کارانه
const MINUTES_PER = {
  invoice: 5,
  check: 4,
  moadian: 6,
  party: 2,
  product: 2,
};
/** نرخ ساعت کار اداری-حسابداری (تومان) */
const HOURLY_RATE_TOMAN = 250_000;

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeStreak(activeDates: string[]): number {
  if (activeDates.length === 0) return 0;
  const set = new Set(activeDates);
  const today = localDay(new Date());
  const yesterday = localDay(new Date(Date.now() - 24 * 3600 * 1000));
  // زنجیره فقط معتبر است اگر امروز یا دیروز فعالیتی بوده
  if (!set.has(today) && !set.has(yesterday)) return 0;
  let streak = 0;
  let cursor = new Date();
  if (!set.has(today)) cursor = new Date(Date.now() - 24 * 3600 * 1000);
  // حداکثر ۹۰ روز
  for (let i = 0; i < 90; i++) {
    if (set.has(localDay(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - 24 * 3600 * 1000);
    } else break;
  }
  return streak;
}

interface Milestone {
  id: string;
  label: string;
  current: number;
  target: number;
}

export function ValueMeterCard() {
  const [data, setData] = React.useState<ValueMeterData | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    authFetch("/api/value-meter")
      .then((r) => r.json())
      .then((json) => {
        if (mounted && json?.success && json.data) setData(json.data);
        else if (mounted) setFailed(true);
      })
      .catch(() => mounted && setFailed(true));
    return () => {
      mounted = false;
    };
  }, []);

  // اگر داده‌ای نیست (مثلاً تازه ثبت‌نام کرده) — نسخهٔ «شروع کنید»
  if (failed) return null;

  if (!data) {
    return (
      <Card className="border-primary/15">
        <CardContent className="p-4">
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const { counts } = data;

  // ── ارزش محاسبه‌شده ──
  const totalMinutes =
    counts.invoices * MINUTES_PER.invoice +
    counts.checks * MINUTES_PER.check +
    counts.moadianSent * MINUTES_PER.moadian +
    counts.parties * MINUTES_PER.party +
    counts.products * MINUTES_PER.product;
  const hoursSaved = Math.floor(totalMinutes / 60);
  const minutesLeft = totalMinutes % 60;
  const tomanSaved = Math.round((totalMinutes / 60) * HOURLY_RATE_TOMAN);
  const workDaysSaved = (totalMinutes / 60 / 8).toFixed(1); // روز کاری ۸ ساعته

  // ── زنجیره ──
  const streak = computeStreak(data.activeDates);
  const activeToday = data.activeDates.includes(localDay(new Date()));

  // ── نشان‌ها ──
  const milestones: Milestone[] = [
 { id:"first-invoice", label:"اولین فاکتور", current:counts.invoices, target:1},
 { id:"ten-invoices", label:"۱۰ فاکتور", current:counts.invoices, target:10},
 { id:"first-moadian", label:"اولین ارسال مودیان", current:counts.moadianSent, target:1},
 { id:"fifty-invoices", label:"۵۰ فاکتور", current:counts.invoices, target:50},
 { id:"hundred-invoices", label:"۱۰۰ فاکتور", current:counts.invoices, target:100},
  ];
  const achieved = milestones.filter((m) => m.current >= m.target);
  const nextMilestone = milestones.find((m) => m.current < m.target);

  // هنوز هیچ فعالیتی نیست — کارت انگیزشی شروع
  if (counts.invoices === 0 && counts.parties === 0 && counts.products === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="border-primary/25 bg-gradient-to-l from-primary/10 via-card to-card">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">
 اولین قدم را همین حالا بردارید
                  </p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    اولین فاکتور خود را ثبت کنید تا شمارندهٔ «ارزشی که هوش برایتان
                    می‌سازد» روشن شود — به‌ازای هر ثبت، صرفه‌جویی زمان و پول شما
                    همین‌جا جمع می‌شود.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {milestones.slice(0, 3).map((m) => (
                  <span
                    key={m.id}
                    className="rounded-lg border border-border/60 bg-muted/40 px-2 py-1 opacity-70"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="border-primary/25 bg-gradient-to-l from-primary/10 via-card to-card overflow-hidden">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* ردیف ۱: ارزش کل */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-5.5 w-5.5" />
              </span>
              <div>
                <p className="text-[11px] text-muted-foreground">
                  ارزشی که تا امروز با هوش ساخته‌اید
                </p>
                <p className="text-lg font-extrabold text-foreground sm:text-xl">
                  {tomanSaved >= 1_000_000
                    ? `${formatCompactToman(tomanSaved * 10)} تومان`
                    : `${toPersianDigits(tomanSaved.toLocaleString("fa-IR"))} تومان`}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    زمان صرفه‌جویی‌شده
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-base font-extrabold text-foreground">
                  {toPersianDigits(hoursSaved > 0 ? hoursSaved.toLocaleString("fa-IR") : "۰")}
                  {minutesLeft > 0 && hoursSaved > 0
                    ? `:${toPersianDigits(minutesLeft)}`
                    : ""}
                </span>
                ساعت
              </span>
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-base font-extrabold text-foreground">
                  {toPersianDigits(workDaysSaved)}
                </span>
                روز کاری
              </span>
            </div>
          </div>

          {/* ردیف ۲: زنجیرهٔ فعالیت + نشان بعدی */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* زنجیره */}
            <div className="rounded-xl border border-border/60 bg-card/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Flame
                    className={`h-4 w-4 ${
                      streak > 0 ? "text-orange-500" : "text-muted-foreground"
                    }`}
                  />
                  زنجیرهٔ فعالیت شما
                </span>
                <span className="text-sm font-extrabold text-foreground">
 {toPersianDigits(streak)} روز
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                {streak === 0
                  ? "امروز یک فاکتور یا چک ثبت کنید تا زنجیرهٔ شما روشن شود."
                  : activeToday
                  ? streak >= 7
                    ? `عالی! ${toPersianDigits(streak)} روز بدون قطع — همین ریتم را نگه دارید.`
                    : "امروز هم فعال بودید ✓ زنجیره حفظ شد."
                  : `زنجیرهٔ ${toPersianDigits(streak)} روزه‌ای دارید — امروز هنوز فعالیتی ثبت نشده!`}
              </p>
            </div>

            {/* نشان بعدی */}
            <div className="rounded-xl border border-border/60 bg-card/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  نشان‌های دستاورد
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {toPersianDigits(achieved.length)} از {toPersianDigits(milestones.length)}
                </span>
              </div>
              {nextMilestone ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      نشان بعدی: {nextMilestone.label}
                    </span>
                    <span className="font-medium text-foreground">
                      {toPersianDigits(nextMilestone.current)} /{" "}
                      {toPersianDigits(nextMilestone.target)}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(
                      100,
                      (nextMilestone.current / nextMilestone.target) * 100
                    )}
                    className="h-1.5"
                  />
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
 همهٔ نشان‌های این مرحله را گرفتید! حرفه‌ای‌ها هم از اینجا
                  شروع کرده بودند.
                </p>
              )}
            </div>
          </div>

          {/* ردیف ۳: تفکیک ثبت‌ها (شفافیت محاسبه) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-2.5 text-[10.5px] text-muted-foreground">
            <span>
{toPersianDigits(counts.invoices.toLocaleString("fa-IR"))} فاکتور × ۵ دقیقه
            </span>
            {counts.checks > 0 && (
              <span>
✓ {toPersianDigits(counts.checks.toLocaleString("fa-IR"))} چک × ۴ دقیقه
              </span>
            )}
            {counts.moadianSent > 0 && (
              <span>
{toPersianDigits(counts.moadianSent.toLocaleString("fa-IR"))} ارسال مودیان × ۶ دقیقه
              </span>
            )}
            <span className="text-[10px]">
              (محاسبه بر اساس زمان ثبت دستی معادل — نرخ ساعت اداری{" "}
              {toPersianDigits("۲۵۰,۰۰۰")} تومان)
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
