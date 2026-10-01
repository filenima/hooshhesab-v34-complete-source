import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { recordRateHistory } from "@/lib/currency";
import { applyMarketSyncForAnchor, syncUsdPricedProducts } from "@/lib/market-sync";

/* ============================================================
 * نرخ طلا، سکه و ارز — منطق مشترک (فقط سمت سرور)
 * ============================================================
 * منبع ۱: call1.tgju.org/ajax.json — JSON سبک و عمومی (بدون page_reader)
 * منبع ۲: page_reader روی صفحات profile تگ‌جو (با پشتیبان alanchand.com)
 *
 * گارد sanity هر نماد پیش از ذخیره: مقدار خارج از بازهٔ معقول رد و لاگ
 * می‌شود و «آخرین مقدار سالم DB» برای آن نماد حفظ می‌گردد (فیکس باگ
 * انس جهانی که قبلاً مقدار یورو می‌گرفت).
 *
 * نکتهٔ کالیبراسیون بازه‌ها (مهر ۱۴۰۵ / سپتامبر ۲۰۲۶): گرم طلا ≈ ۲۵۵
 * میلیون ریال و دلار ≈ ۲٫۵ میلیون ریال است؛ بازه‌ها بر همین مبنای واقعی
 * تنظیم شده‌اند تا پارس‌های غلط (مثل ۷٫۶ میلیون ریال برای انس/یورو)
 * رد شوند اما دادهٔ زندهٔ سالم قبول بشود.
 */

export interface RateProfile {
  key: string; // کلید خروجی مثل "gold:GERAM18"
  fromCurrency: string; // کلید DB مثل "GOLD_GERAM18"
  url: string; // صفحهٔ profile تگ‌جو (منبع دوم)
  name: string;
  isGold: boolean;
  currencyCode: string | null;
  currencyName: string | null;
  symbol: string | null;
}

// ۱۰ نماد: طلا و سکه (۴) + ارزها (۶)
export const PRICE_PROFILES: RateProfile[] = [
  { key: "gold:GERAM18", fromCurrency: "GOLD_GERAM18", url: "https://www.tgju.org/profile/geram18", name: "طلای ۱۸ عیار", isGold: true, currencyCode: null, currencyName: null, symbol: null },
  { key: "gold:SEKEE", fromCurrency: "GOLD_SEKEE", url: "https://www.tgju.org/profile/sekee", name: "سکه امامی", isGold: true, currencyCode: null, currencyName: null, symbol: null },
  { key: "gold:ONSE", fromCurrency: "GOLD_ONSE", url: "https://www.tgju.org/profile/ons", name: "انس جهانی طلا", isGold: true, currencyCode: null, currencyName: null, symbol: null },
  { key: "gold:MESGHAL", fromCurrency: "GOLD_MESGHAL", url: "https://www.tgju.org/profile/mesghal", name: "مثقال طلا", isGold: true, currencyCode: null, currencyName: null, symbol: null },
  { key: "currency:USD", fromCurrency: "USD", url: "https://www.tgju.org/profile/price_dollar_rl", name: "دلار آمریکا", isGold: false, currencyCode: "USD", currencyName: "دلار آمریکا", symbol: "$" },
  { key: "currency:EUR", fromCurrency: "EUR", url: "https://www.tgju.org/profile/price_eur", name: "یورو", isGold: false, currencyCode: "EUR", currencyName: "یورو", symbol: "€" },
  { key: "currency:AED", fromCurrency: "AED", url: "https://www.tgju.org/profile/price_aed", name: "درهم امارات", isGold: false, currencyCode: "AED", currencyName: "درهم امارات", symbol: "د.إ" },
  { key: "currency:GBP", fromCurrency: "GBP", url: "https://www.tgju.org/profile/price_gbp", name: "پوند انگلیس", isGold: false, currencyCode: "GBP", currencyName: "پوند انگلیس", symbol: "£" },
  { key: "currency:TRY", fromCurrency: "TRY", url: "https://www.tgju.org/profile/price_try", name: "لیر ترکیه", isGold: false, currencyCode: "TRY", currencyName: "لیر ترکیه", symbol: "₺" },
  { key: "currency:CNY", fromCurrency: "CNY", url: "https://www.tgju.org/profile/price_cny", name: "یوان چین", isGold: false, currencyCode: "CNY", currencyName: "یوان چین", symbol: "¥" },
];

const PROFILE_BY_FROM: Record<string, RateProfile> = Object.fromEntries(
  PRICE_PROFILES.map((p) => [p.fromCurrency, p])
);

/* ------------------------------------------------------------
 * نگاشت کلیدهای ajax.json (بررسی‌شدهٔ زنده — ۱۴۰۵/۰۷/۰۸):
 *   geram18 / sekee / ons / mesghal / price_dollar_rl /
 *   price_eur / price_aed / price_gbp / price_try / price_cny
 * نکته‌ها:
 *  - کلید «sekee_emami» وجود ندارد؛ سکهٔ امامی همان «sekee» است.
 *  - «ons» به «دلار» است (مثل ۴٬۱۹۹٫۸۶) و باید در نرخ دلار ضرب شود.
 *  - p ممکن است شامل کاما/تب/اعشار باشد: "2,589,950,000" یا "4,199.86"
 * کلیدهای دوم فقط برای مقاومت در برابر تغییر نام بالادست هستند.
 * ------------------------------------------------------------ */
interface AjaxMapping {
  keys: string[]; // به‌ترتیب اولویت
  unit: "irr" | "usd"; // واحد مقدار خام
}

const AJAX_KEY_MAP: Record<string, AjaxMapping> = {
  GOLD_GERAM18: { keys: ["geram18", "gold_geram18", "tgju_gold_irg18"], unit: "irr" },
  GOLD_SEKEE: { keys: ["sekee", "sekee_emami", "retail_sekee"], unit: "irr" },
  GOLD_ONSE: { keys: ["ons", "gold_ounce", "gold"], unit: "usd" },
  GOLD_MESGHAL: { keys: ["mesghal", "gold_mesghal"], unit: "irr" },
  USD: { keys: ["price_dollar_rl", "price_dollar"], unit: "irr" },
  EUR: { keys: ["price_eur", "eur"], unit: "irr" },
  AED: { keys: ["price_aed", "aed"], unit: "irr" },
  GBP: { keys: ["price_gbp", "gbp"], unit: "irr" },
  TRY: { keys: ["price_try", "try_price"], unit: "irr" },
  CNY: { keys: ["price_cny", "cny"], unit: "irr" },
};

const TGJU_AJAX_URL = "https://call1.tgju.org/ajax.json";
const AJAX_TIMEOUT_MS = 8_000;

/* ------------------------------------------------------------
 * بذر نرخ‌ها — آخرین نرخ‌های معتبر شناخته‌شده (ریال)
 * ثبت ۱۴۰۵/۰۷/۰۸ (۳۰ سپتامبر ۲۰۲۶) از call1.tgju.org/ajax.json.
 * اگر DB برای نمادی هیچ ردیفی نداشته باشد، همین مقدار ارائه می‌شود
 * (source = "seed") تا ویجت در نصب تازه/قطعی کامل، هرگز خالی نماند.
 * ------------------------------------------------------------ */
export const SEED_RATES_DATE = "2026-09-30T08:30:00.000Z";
export const SEED_RATES: Record<string, number> = {
  GOLD_GERAM18: 254_753_000, // گرم ۱۸ عیار
  GOLD_SEKEE: 2_589_950_000, // سکهٔ امامی
  GOLD_ONSE: 10_680_243_980, // انس جهانی (۴٬۱۹۹٫۸۶ دلار × ۲٬۵۴۳٬۰۰۰ ریال)
  GOLD_MESGHAL: 1_103_460_000, // مثقال طلا
  USD: 2_543_000,
  EUR: 2_886_100,
  AED: 692_670,
  GBP: 3_371_800,
  TRY: 52_765,
  CNY: 379_100,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ============================================================
 * گارد sanity — ردِ پارس‌های غلط قبل از نوشتن در DB
 * ============================================================ */
export interface SanityCtx {
  usd?: number; // نرخ دلار به ریال (از همین دور یا DB)
  gold18?: number; // نرخ گرم ۱۸ به ریال
}

export function sanityCheckRate(
  from: string,
  value: number,
  ctx: SanityCtx
): { ok: boolean; reason?: string } {
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: "مقدار نامعتبر" };
  }
  const usd = ctx.usd && ctx.usd > 0 ? ctx.usd : undefined;
  const g18 = ctx.gold18 && ctx.gold18 > 0 ? ctx.gold18 : undefined;

  switch (from) {
    case "GOLD_GERAM18":
      // گرم ۱۸ عیار: ۲۰M تا ۵B ریال (زیر ۲۰M قطعاً پارس غلط است —
      // مثل باگ قبلی که ۷٫۶M ریال ذخیره شد)
      if (value < 20_000_000 || value > 5_000_000_000) {
        return { ok: false, reason: `گرم ۱۸ خارج از بازهٔ ۲۰M–۵B ریال: ${value}` };
      }
      break;
    case "GOLD_ONSE": {
      // انس ≈ ۳۱٫۱ گرم ⇒ باید ~۲۰ تا ~۱۰۰ برابرِ گرم باشد (فیکس باگ
      // انس=یورو؛ یورو-گونه‌ها همیشه زیر ۲۰ برابر گرم می‌مانند)
      const lo = g18 ? g18 * 20 : 1_000_000_000;
      const hi = g18 ? g18 * 100 : 500_000_000_000;
      if (value <= lo || value >= hi) {
        return { ok: false, reason: `انس جهانی باید بین ~۲۰ تا ~۱۰۰ برابر گرم طلا باشد: ${value}` };
      }
      break;
    }
    case "GOLD_SEKEE": {
      // سکهٔ امامی (۸٫۱۳ گرم + حباب) ≈ ۴ تا ۴۰ برابر گرم
      const lo = g18 ? g18 * 4 : 500_000_000;
      const hi = g18 ? g18 * 40 : 50_000_000_000;
      if (value <= lo || value >= hi) {
        return { ok: false, reason: `سکهٔ امامی خارج از بازهٔ معقول نسبت به گرم: ${value}` };
      }
      break;
    }
    case "GOLD_MESGHAL": {
      // مثقال (۴٫۶۰۸ گرم) ≈ ۳ تا ۸ برابر گرم
      const lo = g18 ? g18 * 3 : 300_000_000;
      const hi = g18 ? g18 * 8 : 5_000_000_000;
      if (value <= lo || value >= hi) {
        return { ok: false, reason: `مثقال طلا خارج از بازهٔ معقول نسبت به گرم: ${value}` };
      }
      break;
    }
    case "USD":
      if (value < 100_000 || value > 50_000_000) {
        return { ok: false, reason: `دلار خارج از بازهٔ ۱۰۰K–۵۰M ریال: ${value}` };
      }
      break;
    case "EUR":
      if (value < 100_000 || value > 50_000_000) {
        return { ok: false, reason: `یورو خارج از بازهٔ ۱۰۰K–۵۰M ریال: ${value}` };
      }
      // یورو در واقعیت ۰٫۵ تا ۲ برابر دلار است — پارس قبلی (۷٫۶M با دلار
      // ۲٫۵M = ۳ برابر) همین‌جا رد می‌شود
      if (usd && (value < usd * 0.5 || value > usd * 2)) {
        return { ok: false, reason: `یورو خارج از بازهٔ ۰٫۵–۲ برابر دلار: ${value}` };
      }
      break;
    case "AED":
      // درهم ≈ دلار ÷ ۳٫۶۷ ⇒ ۰٫۱ تا ۰٫۵ برابر دلار
      if (usd) {
        if (value < usd * 0.1 || value > usd * 0.5) {
          return { ok: false, reason: `درهم خارج از بازهٔ معقول نسبت به دلار: ${value}` };
        }
      } else if (value < 50_000 || value > 20_000_000) {
        return { ok: false, reason: `درهم خارج از بازهٔ ۵۰K–۲۰M ریال: ${value}` };
      }
      break;
    case "GBP":
      if (value < 100_000 || value > 50_000_000) {
        return { ok: false, reason: `پوند خارج از بازهٔ ۱۰۰K–۵۰M ریال: ${value}` };
      }
      if (usd && (value < usd * 0.7 || value > usd * 2)) {
        return { ok: false, reason: `پوند خارج از بازهٔ ۰٫۷–۲ برابر دلار: ${value}` };
      }
      break;
    case "TRY":
      if (value < 10_000 || value > 2_000_000) {
        return { ok: false, reason: `لیر خارج از بازهٔ ۱۰K–۲M ریال: ${value}` };
      }
      if (usd && value > usd * 0.2) {
        return { ok: false, reason: `لیر خارج از بازهٔ معقول نسبت به دلار: ${value}` };
      }
      break;
    case "CNY":
      // یوان ≈ دلار ÷ ۷ ⇒ ۰٫۰۵ تا ۰٫۵ برابر دلار
      if (usd) {
        if (value < usd * 0.05 || value > usd * 0.5) {
          return { ok: false, reason: `یوان خارج از بازهٔ معقول نسبت به دلار: ${value}` };
        }
      } else if (value < 50_000 || value > 10_000_000) {
        return { ok: false, reason: `یوان خارج از بازهٔ ۵۰K–۱۰M ریال: ${value}` };
      }
      break;
  }
  return { ok: true };
}

/* ============================================================
 * منبع ۱ — call1.tgju.org/ajax.json
 * ============================================================ */
function readAjaxPrice(
  current: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const k of keys) {
    const entry = current[k];
    if (!entry || typeof entry !== "object") continue;
    const p = (entry as { p?: unknown }).p;
    if (p == null) continue;
    // پاک‌سازی کاما/تب/فاصله/اعشار فارسی: "2,589,950,000" یا "\t8520000"
    const n = Number(String(p).replace(/[,،\s\t]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** واکشی سبک از TGJU ajax.json — خروجی: fromCurrency → ریال */
async function fetchFromTgjuAjax(
  fallbackUsd?: number
): Promise<Record<string, number> | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AJAX_TIMEOUT_MS);
    try {
      const res = await fetch(TGJU_AJAX_URL, {
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; HooshAccounting/1.0)",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const current =
        json && typeof json === "object"
          ? (json as { current?: unknown }).current
          : undefined;
      if (!current || typeof current !== "object") {
        throw new Error("ساختار پاسخ ajax.json نامعتبر");
      }
      const map = current as Record<string, unknown>;

      const usdIrr =
        readAjaxPrice(map, AJAX_KEY_MAP.USD.keys) ?? fallbackUsd ?? null;

      const out: Record<string, number> = {};
      for (const profile of PRICE_PROFILES) {
        const mapping = AJAX_KEY_MAP[profile.fromCurrency];
        if (!mapping) continue;
        let price = readAjaxPrice(map, mapping.keys);
        if (price == null) continue;
        if (mapping.unit === "usd") {
          // انس جهانی به دلار است — تبدیل به ریال با تازه‌ترین دلار
          const rate = usdIrr;
          if (!rate || rate <= 0) continue; // بدون نرخ دلار، انس قابل تبدیل نیست
          price = price * rate;
        }
        price = Math.round(price);
        if (price > 0) out[profile.fromCurrency] = price;
      }
      if (Object.keys(out).length > 0) return out;
      throw new Error("هیچ کلید شناخته‌شده‌ای در پاسخ نبود");
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 0) {
        await sleep(600); // یک تلاش دوم برای خطای گذرا
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[currency] ajax.json error:", msg);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/* ============================================================
 * منبع ۲ — page_reader روی صفحات profile (با پشتیبان alanchand)
 * ============================================================ */
const ALANCHAND_FALLBACKS: Record<string, string> = {
  GOLD_GERAM18: "https://alanchand.com/geram18",
  GOLD_SEKEE: "https://alanchand.com/emami-coin",
  GOLD_ONSE: "https://alanchand.com/ounce",
  GOLD_MESGHAL: "https://alanchand.com/mesghal",
  USD: "https://alanchand.com/price-dollar",
  EUR: "https://alanchand.com/price-euro",
  AED: "https://alanchand.com/price-dirham",
  GBP: "https://alanchand.com/price-pound",
  TRY: "https://alanchand.com/price-lira",
  CNY: "https://alanchand.com/price-yuan",
};

// استخراج قیمت از HTML صفحهٔ profile — چند الگو برای مقاومت در برابر تغییر ساختار
function extractPrice(html: string): number | null {
  if (!html || html.length < 500) return null;
  const patterns: RegExp[] = [
    /data-col="info\.last_trade\.PDrCotVal"[^>]*>\s*([\d][\d,]*\s*)/i,
    /class="price"[^>]*data-col="info\.last_trade\.PDrCotVal"[^>]*>\s*([\d][\d,]*)/i,
    /class="[^"]*\bprice\b[^"]*"[^>]*>\s*([\d][\d.,،\s]*)\s*(?:<|\sریال|&nbsp;)/i,
    /class="[^"]*price[^"]*"[^>]*>\s*([\d][\d.,،\s]*)/i,
    /data-key="p"[^>]*>\s*([\d][\d.,،\s]*)/i,
    /قیمت\s*لحظه[^<]*<[^>]*>[^<]*<[^>]*>\s*([\d][\d.,،\s]*)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const price = parseInt(m[1].replace(/[^\d]/g, ""), 10);
      if (price > 0) return price;
    }
  }
  return null;
}

// FIX(429-hammering): قطع‌کنندهٔ مدار page_reader — بعد از 429 بالادست،
// به‌مدت ۵ دقیقه منبع دوم اصطلاً صدا زده نمی‌شود (منبع ajax.json جدا است
// و محدود نمی‌شود).
let last429At = 0;
const CIRCUIT_BREAK_MS = 5 * 60 * 1000;

function pageReaderBreakerOpen(): boolean {
  return Date.now() - last429At < CIRCUIT_BREAK_MS;
}

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

async function fetchHtmlWithRetry(
  zai: ZaiClient,
  url: string,
  retries: number,
  fallbackFrom?: string
): Promise<string | null> {
  const attemptUrls = [url];
  if (fallbackFrom && ALANCHAND_FALLBACKS[fallbackFrom]) {
    attemptUrls.push(ALANCHAND_FALLBACKS[fallbackFrom]);
  }
  let lastErr: unknown = null;
  for (const attemptUrl of attemptUrls) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await zai.functions.invoke("page_reader", { url: attemptUrl });
        const html: string = result?.data?.html || "";
        if (html && html.length > 500) return html;
      } catch (err) {
        lastErr = err;
        const m = err instanceof Error ? err.message : String(err);
        if (m.includes("429") || m.includes("Too many requests")) {
          last429At = Date.now();
        }
      }
      await sleep(500 * (attempt + 1));
    }
  }
  if (lastErr) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    if (!msg.includes("429") && !msg.includes("Too many requests")) {
      console.error("[currency] page_reader error (both sources):", msg.substring(0, 100));
    }
  }
  return null;
}

/** استخراج نمادهای گمشده از صفحات profile — فقط برای fromهای داده‌شده */
async function scrapeViaPageReader(
  missing: RateProfile[],
  previousMap: Record<string, number>
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (missing.length === 0) return out;
  let zai: ZaiClient;
  try {
    zai = await ZAI.create();
  } catch (err) {
    console.error("[currency] ZAI create error:", err instanceof Error ? err.message : err);
    return out;
  }

  const fetchOne = async (profile: RateProfile): Promise<[string, number] | null> => {
    const html = await fetchHtmlWithRetry(zai, profile.url, 2, profile.fromCurrency);
    if (!html) return null;
    let price = extractPrice(html);
    if (price == null || price <= 0) return null;

    // انس جهانی در تگ‌جو/آلان‌چند به «دلار» است (مثلاً ۴٬۱۹۹$) —
    // مقدار کوچک قطعاً دلاری است و به ریال تبدیل می‌شود
    if (profile.fromCurrency === "GOLD_ONSE" && price < 50_000) {
      const usdRate =
        out.USD && out.USD > 0
          ? out.USD
          : previousMap.USD && previousMap.USD > 0
            ? previousMap.USD
            : null;
      if (usdRate) price = Math.round(price * usdRate);
    }
    return [profile.fromCurrency, price];
  };

  // موازی‌سازی با محدودیت (۳ همزمان برای جلوگیری از timeout و rate-limit)
  const batchSize = 3;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(fetchOne));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        out[r.value[0]] = r.value[1];
      }
    }
  }
  return out;
}

/* ============================================================
 * ذخیره در DB + هوک‌ها (تاریخچه، market-sync، سینک دلاری، Currency)
 * ============================================================ */
async function persistRate(
  profile: RateProfile,
  price: number,
  previousMap: Record<string, number>,
  now: Date
): Promise<void> {
  try {
    await db.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: { fromCurrency: profile.fromCurrency, toCurrency: "IRR" },
      },
      update: { rate: price, source: "tgju", fetchedAt: now },
      create: { fromCurrency: profile.fromCurrency, toCurrency: "IRR", rate: price, source: "tgju" },
    });
    // هوک تاریخچهٔ نرخ — خطا نباید بقیهٔ نمادها را قطع کند
    try {
      await recordRateHistory(profile.fromCurrency, "IRR", price, "tgju", previousMap[profile.fromCurrency] ?? null);
    } catch {
      // ignore
    }
    // هوک همگام‌سازی بازار: اگر لنگرِ tenantی همین نماد باشد، قیمت
    // کالاهایش به نسبت تغییر نرخ به‌روز می‌شود
    try {
      await applyMarketSyncForAnchor(profile.fromCurrency, price);
    } catch {
      // ignore
    }
    // با تغییر دلار، قیمت کالاهای usdSynced بازمحاسبه می‌شود
    if (profile.fromCurrency === "USD") {
      try {
        const syncedCount = await syncUsdPricedProducts(price);
        if (syncedCount > 0) {
          console.log(`[usd-price-sync] ${syncedCount} کالا با نرخ دلار ${price} به‌روز شد`);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // خطای DB نباید کل عملیات را قطع کند
  }

  // برای ارزهای معمولی، رکورد Currency را هم به‌روز نگه دار
  if (!profile.isGold && profile.currencyCode && profile.currencyName && profile.symbol) {
    try {
      await db.currency.upsert({
        where: { code: profile.currencyCode },
        update: { name: profile.currencyName, symbol: profile.symbol, isActive: true },
        create: {
          code: profile.currencyCode,
          name: profile.currencyName,
          symbol: profile.symbol,
          isActive: true,
        },
      });
    } catch {
      // ignore
    }
  }
}

/* ============================================================
 * ارکستراسیون scrape چندمنبعی + قفل سراسری + ضداسپم
 * ============================================================ */
export interface ScrapeOutcome {
  ok: boolean; // حداقل یک نماد تازه ذخیره شد
  freshCount: number; // تعداد نمادهای تازه
  sources: string[]; // منابعی که مقدار دادند
  rejected: string[]; // نمادهای ردشده توسط گارد sanity
  skipped?: boolean; // به‌دلیل cooldown رد شد
  error?: string;
}

// قفل سراسری: اگر چند مسیر همزمان scrape بخواهند، فقط یکی اجرا می‌شود
let inflightScrape: Promise<ScrapeOutcome> | null = null;

// ضداسپم: اگر یک تلاش کامل هیچ نمادی نیاورد، ۹۰ ثانیه صبر (به‌جای
// کوبیدن بی‌فایدهٔ منابع در هر poll)
let lastAllFailedAt = 0;
const SCRAPE_FAIL_COOLDOWN_MS = 90_000;

export function acquireScrape(): Promise<ScrapeOutcome> {
  if (!inflightScrape) {
    inflightScrape = runCurrencyScrape()
      .catch((err): ScrapeOutcome => {
        console.error("[currency] scrape error:", err instanceof Error ? err.message : err);
        return { ok: false, freshCount: 0, sources: [], rejected: [], error: "خطا در دریافت نرخ‌ها" };
      })
      .finally(() => {
        setTimeout(() => {
          inflightScrape = null;
        }, 1000);
      });
  }
  return inflightScrape;
}

/** scrape پس‌زمینه — نتیجه به کسی برنمی‌گردد؛ فقط DB تازه می‌شود */
export function triggerBackgroundScrape(): void {
  if (inflightScrape) return;
  void acquireScrape().catch(() => undefined);
}

async function loadPreviousMap(): Promise<Record<string, number>> {
  const rows = await db.exchangeRate.findMany({
    where: { source: "tgju" },
    orderBy: { fetchedAt: "desc" },
  });
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (map[r.fromCurrency] == null) map[r.fromCurrency] = r.rate;
  }
  return map;
}

export async function runCurrencyScrape(): Promise<ScrapeOutcome> {
  // cooldown پس از شکست کامل — سریع رد شو
  if (Date.now() - lastAllFailedAt < SCRAPE_FAIL_COOLDOWN_MS && !inflightScrape) {
    return {
      ok: false,
      freshCount: 0,
      sources: [],
      rejected: [],
      skipped: true,
      error: "تلاش قبلی ناموفق بوده — کمی بعد دوباره تلاش کنید",
    };
  }

  const now = new Date();
  const previousMap = await loadPreviousMap();
  const saved = new Set<string>();
  const rejected: string[] = [];
  const sources: string[] = [];

  // ساختن context گارد sanity از «مقدارهای تازهٔ این دور» یا DB
  const buildCtx = (candidates: Record<string, number>): SanityCtx => ({
    usd: candidates.USD ?? previousMap.USD,
    gold18: candidates.GOLD_GERAM18 ?? previousMap.GOLD_GERAM18,
  });

  const persistCandidates = async (candidates: Record<string, number>): Promise<number> => {
    const ctx = buildCtx(candidates);
    let count = 0;
    const writes: Promise<void>[] = [];
    for (const profile of PRICE_PROFILES) {
      if (saved.has(profile.fromCurrency)) continue;
      const price = candidates[profile.fromCurrency];
      if (price == null) continue;
      const check = sanityCheckRate(profile.fromCurrency, price, ctx);
      if (!check.ok) {
        console.warn(`[currency] sanity رد شد — ${profile.name} (${profile.fromCurrency}): ${check.reason}`);
        rejected.push(profile.fromCurrency);
        continue;
      }
      writes.push(persistRate(profile, price, previousMap, now));
      saved.add(profile.fromCurrency);
      count++;
    }
    // نوشتن DB باید کامل شود تا خوانندهٔ بلافاصلهٔ بعدی مقدار تازه ببیند
    await Promise.allSettled(writes);
    return count;
  };

  // ─── منبع ۱: ajax.json (سبک، بدون page_reader) ───
  const ajaxRates = await fetchFromTgjuAjax(previousMap.USD);
  if (ajaxRates) {
    sources.push("ajax");
    await persistCandidates(ajaxRates);
  }

  // ─── منبع ۲: page_reader — فقط برای نمادهای گمشده/ردشده ───
  // (نماد ردشده توسط sanity منبع ۱ هم اینجا شانس دوباره پیدا می‌کند)
  const missing = PRICE_PROFILES.filter((p) => !saved.has(p.fromCurrency));
  if (missing.length > 0 && !pageReaderBreakerOpen()) {
    const scraped = await scrapeViaPageReader(missing, previousMap);
    if (Object.keys(scraped).length > 0) {
      sources.push("page_reader");
      // مقدارهای تازهٔ این دور را هم به کاندیدها اضافه کن تا sanity متقابل درست باشد
      const merged: Record<string, number> = { ...scraped };
      for (const from of saved) {
        if (ajaxRates && ajaxRates[from] != null) merged[from] = ajaxRates[from];
      }
      await persistCandidates(merged);
    }
  }

  const freshCount = saved.size;
  if (freshCount === 0) {
    lastAllFailedAt = Date.now();
    return { ok: false, freshCount: 0, sources, rejected };
  }
  return { ok: true, freshCount, sources, rejected };
}

/* ============================================================
 * خواندن آخرین نرخ‌ها از DB + پشتیبان بذر
 * ============================================================ */
export interface RateEntry {
  price: number;
  name: string;
  isGold: boolean;
  currencyCode: string | null;
  currencyName: string | null;
  symbol: string | null;
  fetchedAt: string; // ISO
  source: string; // "tgju" | "seed"
}

export interface LatestRates {
  data: Record<string, RateEntry>;
  count: number;
  fetchedAt: string | null; // جدیدترین fetchedAt بین همهٔ نمادها
  seeded: boolean; // حداقل یک نماد از بذر سرو شد
}

/**
 * آخرین نرخ‌های ذخیره‌شده برای هر ۱۰ نماد.
 * اگر DB برای نمادی ردیفی نداشته باشد، مقدار بذر (SEED_RATES) سرو
 * می‌شود تا خروجی هرگز خالی نباشد.
 */
export async function getLatestRates(): Promise<LatestRates> {
  const rows = await db.exchangeRate.findMany({
    where: { source: "tgju" },
    orderBy: { fetchedAt: "desc" },
  });
  const latest: Record<string, { rate: number; fetchedAt: Date }> = {};
  for (const r of rows) {
    if (!latest[r.fromCurrency]) {
      latest[r.fromCurrency] = { rate: r.rate, fetchedAt: r.fetchedAt };
    }
  }

  const data: Record<string, RateEntry> = {};
  let seeded = false;
  let maxAt: Date | null = null;
  // مقایسه درون همان اسکوپ (بدون closure) تا تحلیل جریان TypeScript
  // نوع maxAt را درست نگه دارد
  const consider = (d: Date): Date =>
    !maxAt || d.getTime() > maxAt.getTime() ? d : maxAt;

  for (const profile of PRICE_PROFILES) {
    const v = latest[profile.fromCurrency];
    if (v) {
      data[profile.key] = {
        price: v.rate,
        name: profile.name,
        isGold: profile.isGold,
        currencyCode: profile.currencyCode,
        currencyName: profile.currencyName,
        symbol: profile.symbol,
        fetchedAt: v.fetchedAt.toISOString(),
        source: "tgju",
      };
      maxAt = consider(v.fetchedAt);
    } else if (SEED_RATES[profile.fromCurrency] != null) {
      data[profile.key] = {
        price: SEED_RATES[profile.fromCurrency],
        name: profile.name,
        isGold: profile.isGold,
        currencyCode: profile.currencyCode,
        currencyName: profile.currencyName,
        symbol: profile.symbol,
        fetchedAt: SEED_RATES_DATE,
        source: "seed",
      };
      seeded = true;
      maxAt = consider(new Date(SEED_RATES_DATE));
    }
  }

  return {
    data,
    count: Object.keys(data).length,
    fetchedAt: maxAt ? maxAt.toISOString() : null,
    seeded,
  };
}

/** سن تازه‌ترین ردیف tgju به میلی‌ثانیه — null اگر هیچ ردیفی نیست */
export async function getCacheAgeMs(): Promise<number | null> {
  const freshest = await db.exchangeRate.findFirst({
    where: { source: "tgju" },
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });
  if (!freshest) return null;
  return Date.now() - new Date(freshest.fetchedAt).getTime();
}
