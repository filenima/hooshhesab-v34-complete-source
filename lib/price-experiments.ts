/**
 * lib/price-experiments.ts — موتور آزمایش A/B قیمت‌گذاری (Task 6-c)
 * ============================================================================
 * تست قیمت‌های مختلف روی گروه‌های قطعی کاربران:
 *  - هر کاربر (بر اساس شناسه پایدار) همیشه در همان گروه A یا B می‌ماند.
 *  - گروه A قیمت اصلی پلن را می‌بیند (کنترل)؛ گروه B فقط در صفحه قیمت
 *    قیمت آزمایشی (priceBToman) را می‌بیند.
 *
 * ساختار دو-محیطی (همان الگوی اثبات‌شدهٔ lib/plans.ts):
 *  - بخش «خالص» (assignVariant / computeStats / parseMetrics) هیچ وابستگی
 *    ندارد → قابل import در کامپوننت‌های client (صفحه قیمت‌گذاری).
 *  - بخش «دیتابیس» (getActiveExperimentsForPlan / trackMetric) فقط در سرور
 *    فراخوانی می‌شود و Prisma را به‌صورت lazy (dynamic import داخل تابع)
 *    بارگذاری می‌کند تا به باندل client راه پیدا نکند.
 *
 * مدل داده: PriceExperiment (Prisma — از قبل موجود، db:push شده)
 *  metricsJson = {"visitsA":n,"visitsB":n,"signupsA":n,"signupsB":n}
 */

// ─────────────────────────── انواع عمومی ───────────────────────────

/** گروه آزمایش — A = کنترل (قیمت اصلی)، B = تست (قیمت آزمایشی) */
export type ExperimentVariant = "A" | "B";

/** رویداد قابل ردیابی — visit = بازدید صفحه قیمت، signup = شروع خرید/ثبت‌نام */
export type TrackedEvent = "visit" | "signup";

/** وضعیت آزمایش (هم‌نام با ستون status در دیتابیس) */
export type PriceExperimentStatus = "RUNNING" | "PAUSED" | "COMPLETED";

/** شکل رکورد PriceExperiment که از Prisma برمی‌گردد */
export interface PriceExperimentRecord {
  id: string;
  name: string;
  planId: string;
  status: string;
  priceAToman: number;
  priceBToman: number;
  splitPercent: number;
  metricsJson: string;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** کلیدهای شمارشی داخل metricsJson */
export interface ExperimentMetrics {
  visitsA: number;
  visitsB: number;
  signupsA: number;
  signupsB: number;
}

/** آمار محاسبه‌شده برای نمایش در پنل سوپرادمین */
export interface ExperimentStats {
  visitsA: number;
  visitsB: number;
  signupsA: number;
  signupsB: number;
  /** نرخ تبدیل گروه A (signupsA/visitsA) — null یعنی بازدیدی ثبت نشده */
  convA: number | null;
  /** نرخ تبدیل گروه B */
  convB: number | null;
  /** رشد نسبی B نسبت به A (درصد) — null یعنی قابل محاسبه نیست */
  liftPercent: number | null;
  /** آمارهٔ z آزمون دو-نسبت — null یعنی قابل محاسبه نیست */
  zScore: number | null;
  /** آیا تفاوت در سطح ۹۵٪ معنادار است؟ */
  significant: boolean;
  /** حداقل نمونه (۳۰ بازدید در هر گروه) رسیده است؟ */
  sampleSufficient: boolean;
  /** توضیح فارسی کوتاه برای نمایش کنار آمار */
  noteFa: string;
}

// ─────────────────────────── بخش خالص (client-safe) ───────────────────────────

/**
 * هش FNV-1a سی‌ودو بیتی — خالص و قطعی (خروجی برای ورودی یکسان همیشه یکی است).
 * عدد برگشتی با >>> 0 به بازهٔ بدون علامت می‌رود تا باقیماندهٔ مثبت بماند.
 */
export function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5; // offset basis استاندارد FNV-1a 32bit
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // ضرب در prime استاندارد FNV
  }
  return hash >>> 0;
}

/**
 * تخصیص قطعی variant — تابع خالص (pure).
 *
 * ورودی `${experimentId}:${userId}` هش می‌شود → سطل ۰..۹۹ → اگر سطل از
 * splitPercent کوچک‌تر باشد کاربر در گروه B (تست) و وگرنه در گروه A (کنترل)
 * قرار می‌گیرد. چون هش قطعی است، همان کاربر در هر بارگشتن صفحه همان گروه را
 * می‌بیند — بدون نیاز به ذخیرهٔ تخصیص در دیتابیس.
 *
 * @param userId        شناسهٔ پایدار کاربر (userId از JWT یا شناسهٔ ناشناس localStorage)
 * @param experimentId  شناسهٔ آزمایش
 * @param splitPercent  درصد تخصیص به گروه B (۱..۹۹)
 */
export function assignVariant(
  userId: string,
  experimentId: string,
  splitPercent: number
): ExperimentVariant {
  // clamp ایمن — درصد خارج از بازه نباید کل گروه را یک‌طرفه کند
  const pct = Number.isFinite(splitPercent) ? Math.min(99, Math.max(0, Math.trunc(splitPercent))) : 50;
  const bucket = fnv1aHash(`${experimentId}:${userId}`) % 100;
  return bucket < pct ? "B" : "A";
}

/** خواندن امن metricsJson — JSON خراب یا ناقص هرگز خطا نمی‌دهد */
export function parseMetrics(metricsJson: string | null | undefined): ExperimentMetrics {
  const empty: ExperimentMetrics = { visitsA: 0, visitsB: 0, signupsA: 0, signupsB: 0 };
  if (!metricsJson) return empty;
  try {
    const parsed = JSON.parse(metricsJson) as Partial<ExperimentMetrics> | null;
    if (!parsed || typeof parsed !== "object") return empty;
    return {
      visitsA: toCount(parsed.visitsA),
      visitsB: toCount(parsed.visitsB),
      signupsA: toCount(parsed.signupsA),
      signupsB: toCount(parsed.signupsB),
    };
  } catch {
    return empty;
  }
}

function toCount(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(Math.trunc(num), 1_000_000_000);
}

/** حداقل نمونه در «هر گروه» برای اینکه عدد قابل‌اتکا باشد */
export const MIN_SAMPLE_PER_VARIANT = 30;

/** آستانهٔ z برای سطح اطمینان ~۹۵٪ (دو-طرفه) */
const Z_95 = 1.96;

/**
 * محاسبهٔ آمار آزمایش — نرخ تبدیل هر گروه، رشد نسبی و آزمون دو-نسبت (z-test).
 * خالص و بدون وابستگی؛ ورودی فقط metricsJson رکورد است.
 *  - نمونهٔ کافی نیست وقتی بازدید هر گروه < ۳۰ → «نمونه کافی نیست»
 *  - |z| ≥ ۱.۹۶ → تفاوت در سطح ۹۵٪ معنادار (برنده A یا B مشخص می‌شود)
 */
export function computeStats(experiment: {
  metricsJson: string | null | undefined;
}): ExperimentStats {
  const m = parseMetrics(experiment.metricsJson);
  const nA = m.visitsA;
  const nB = m.visitsB;
  const total = nA + nB;

  const convA = nA > 0 ? m.signupsA / nA : null;
  const convB = nB > 0 ? m.signupsB / nB : null;

  // رشد نسبی B نسبت به A — فقط وقتی هر دو نرخ و مخرج A موجود باشند
  let liftPercent: number | null = null;
  if (convA !== null && convB !== null && convA > 0) {
    liftPercent = ((convB - convA) / convA) * 100;
  }

  // آزمون دو-نسبت z (pooled) — فقط با نمونهٔ دو طرف
  let zScore: number | null = null;
  if (nA > 0 && nB > 0) {
    const pPool = (m.signupsA + m.signupsB) / total;
    if (pPool > 0 && pPool < 1) {
      const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
      if (se > 0) {
        zScore = ((convB ?? 0) - (convA ?? 0)) / se;
      }
    }
  }

  const sampleSufficient = nA >= MIN_SAMPLE_PER_VARIANT && nB >= MIN_SAMPLE_PER_VARIANT;
  const significant = sampleSufficient && zScore !== null && Math.abs(zScore) >= Z_95;

  // توضیح فارسی کوتاه برای پنل
  let noteFa: string;
  if (total === 0) {
    noteFa = "هنوز داده‌ای ثبت نشده است";
  } else if (!sampleSufficient) {
    noteFa = "نمونه کافی نیست";
  } else if (significant && (zScore as number) > 0) {
    noteFa = "تفاوت معنادار است — گروه B بهتر عمل کرده (۹۵٪)";
  } else if (significant && (zScore as number) < 0) {
    noteFa = "تفاوت معنادار است — گروه A بهتر عمل کرده (۹۵٪)";
  } else {
    noteFa = "تفاوت آماری معنادار نیست";
  }

  return {
    visitsA: nA,
    visitsB: nB,
    signupsA: m.signupsA,
    signupsB: m.signupsB,
    convA,
    convB,
    liftPercent,
    zScore,
    significant,
    sampleSufficient,
    noteFa,
  };
}

// ─────────────────────────── بخش دیتابیس (فقط سرور) ───────────────────────────
// Prisma با dynamic import داخل تابع بارگذاری می‌شود تا این ماژول بتواند در
// کامپوننت‌های client هم import شود (الگوی lib/plans.ts — اثبات‌شده).

/** کش در-حافظهٔ آزمایش‌های در حال اجرا — TTL ۳۰ ثانیه */
interface ActiveCacheEntry {
  experiments: PriceExperimentRecord[];
  expiresAt: number;
}
const activeCache = new Map<string, ActiveCacheEntry>();
const ACTIVE_CACHE_TTL_MS = 30_000;

/** زنجیرهٔ نوشتن metrics به‌ازای هر آزمایش — نوشتن‌های هم‌زمان صف می‌شوند */
const metricWriteChain = new Map<string, Promise<unknown>>();

/**
 * آزمایش‌های RUNNING یک پلن (یا همهٔ پلن‌ها اگر planId نداده شود) —
 * مرتب بر اساس startedAt نزولی؛ اگر چند آزمایش هم‌زمان RUNNING باشد
 * «اولین» همان جدیدترین است و صفحهٔ قیمت از همان استفاده می‌کند.
 * نتیجه ۳۰ ثانیه در حافظه کش می‌شود.
 */
export async function getActiveExperimentsForPlan(
  planId?: string
): Promise<PriceExperimentRecord[]> {
  const key = planId || "*";
  const cached = activeCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.experiments;
  }
  try {
    const { db } = await import("@/lib/db");
    const rows = (await db.priceExperiment.findMany({
      where: { status: "RUNNING", ...(planId ? { planId } : {}) },
      orderBy: { startedAt: "desc" },
    })) as PriceExperimentRecord[];
    activeCache.set(key, {
      experiments: rows,
      expiresAt: Date.now() + ACTIVE_CACHE_TTL_MS,
    });
    return rows;
  } catch (error) {
    console.error("getActiveExperimentsForPlan error:", error);
    // در خطای دیتابیس آخرین کش معتبر (در صورت وجود) برگردانده می‌شود
    return cached?.experiments ?? [];
  }
}

/** بی‌اعتبارکردن کش آزمایش‌ها — پس از هر ایجاد/ویرایش/حذف/تغییر وضعیت صدا زده شود */
export function invalidatePriceExperimentCache(): void {
  activeCache.clear();
}

/**
 * ثبت رویداد (visit | signup) برای یک variant — «fire-and-forget»:
 *  - خواندن metricsJson فعلی، افزایش شمارندهٔ مربوطه، نوشتن مجدد (read-modify-write)
 *  - کل مسیر try/catch — خطا هرگز فراخواننده را نمی‌شکند
 *  - نوشتن‌های هم‌زمانِ یک آزمایش با زنجیرهٔ Promise صف می‌شوند تا گم‌شدن شمارش
 *    در یک پروسه کمینه شود.
 * فقط آزمایش RUNNING شمارش می‌کند (آزمایش متوقف/تمام‌شده داده نمی‌گیرد).
 *
 * @returns true اگر ثبت شد؛ false اگر آزمایش نبود/اجرا نمی‌شد/خطا داد
 */
export async function trackMetric(
  experimentId: string,
  variant: ExperimentVariant,
  event: TrackedEvent
): Promise<boolean> {
  const prefix = event === "visit" ? "visits" : "signups";
  const key = `${prefix}${variant}`;
  const previous = metricWriteChain.get(experimentId) ?? Promise.resolve();
  const tracked = previous
    .catch(() => {
      /* زنجیرهٔ قبلی نباید نوشتن جدید را بشکند */
    })
    .then(async () => {
      const { db } = await import("@/lib/db");
      const exp = await db.priceExperiment.findUnique({
        where: { id: experimentId },
        select: { id: true, status: true, metricsJson: true },
      });
      if (!exp || exp.status !== "RUNNING") return false;
      const metrics = parseMetrics(exp.metricsJson);
      metrics[key as keyof ExperimentMetrics] =
        (metrics[key as keyof ExperimentMetrics] || 0) + 1;
      await db.priceExperiment.update({
        where: { id: experimentId },
        data: { metricsJson: JSON.stringify(metrics) },
      });
      return true;
    })
    .catch((error) => {
      console.error("trackMetric error:", error);
      return false;
    });

  // نگه‌داشتن زنجیره تا نوشتن‌های بعدی بعد از این صف شوند؛ پس از پایان،
  // ورودی از حافظه پاک می‌شود (اگر هنوز همین زنجیره آخرین باشد)
  const chained = tracked.finally(() => {
    if (metricWriteChain.get(experimentId) === chained) {
      metricWriteChain.delete(experimentId);
    }
  });
  metricWriteChain.set(experimentId, chained);
  return tracked;
}
