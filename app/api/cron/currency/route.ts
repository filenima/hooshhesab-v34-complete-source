import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acquireScrape, getLatestRates } from "@/lib/currency-fetch";

export const runtime = "nodejs";
export const maxDuration = 120;

/* ============================================================
 * /api/cron/currency — کرون نرخ طلا/سکه/ارز (فعال — v32-B)
 * ============================================================
 * GET/POST بدون احراز هویت (endpoint داخلی؛ لندینگ/health صدا می‌زنند):
 *   - اگر تازه‌ترین ردیف ExchangeRate منبع tgju بیش از ۱۰ دقیقه عمر
 *     داشته باشد → یک scrape بلاک‌کننده (منبع اول ajax.json سبک است).
 *   - گارد ضداسپم در-حافظه: حداکثر یک scrape هر ۵ دقیقه.
 *   - پاسخ: { success, scraped, skipped, fetchedAt, count }
 */

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // کهنگی آستانهٔ تازه‌سازی
const MIN_SCRAPE_GAP_MS = 5 * 60 * 1000; // حداقل فاصلهٔ دو scrape

// module-level — با هر فراخوانی فقط یک بار در ۵ دقیقه scrape می‌شود
let lastScrapeAt = 0;

async function handle() {
  let scraped = false;
  let skipped: string | null = null;

  try {
    const freshest = await db.exchangeRate.findFirst({
      where: { source: "tgju" },
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    });
    const ageMs = freshest
      ? Date.now() - new Date(freshest.fetchedAt).getTime()
      : Infinity;

    if (ageMs > STALE_THRESHOLD_MS) {
      if (Date.now() - lastScrapeAt >= MIN_SCRAPE_GAP_MS) {
        lastScrapeAt = Date.now(); // قبل از شروع ثبت می‌شود (ضد هجوم همزمان)
        scraped = true;
        await acquireScrape().catch(() => undefined); // best-effort
      } else {
        skipped = "rate-limited";
      }
    } else {
      skipped = "fresh";
    }
  } catch {
    skipped = "error";
  }

  let fetchedAt: string | null = null;
  let count = 0;
  try {
    const latest = await getLatestRates();
    fetchedAt = latest.fetchedAt;
    count = latest.count;
  } catch {
    // خواندن وضعیت اختیاری است
  }

  return NextResponse.json({ success: true, scraped, skipped, fetchedAt, count });
}

export async function GET() {
  return handle();
}

export async function POST() {
  return handle();
}
