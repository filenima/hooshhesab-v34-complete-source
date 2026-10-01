import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  acquireScrape,
  triggerBackgroundScrape,
  getLatestRates,
  getCacheAgeMs,
} from "@/lib/currency-fetch";

export const runtime = "nodejs";
export const maxDuration = 120;

/* ============================================================
 * /api/currency/fetch-tgju
 * ============================================================
 * GET  (بدون احراز هویت) — آخرین نرخ‌های ذخیره‌شدهٔ DB + پشتیبان بذر.
 *      ?refresh=1 → تلاش تازه‌سازی بلاک‌کننده (best-effort) با محدودیت
 *      حداقل ۳ دقیقه بین هر دو تازه‌سازی (به‌ازای هر IP، در حافظه).
 *      پاسخ همیشه fetchedAt (جدیدترین) و stale (بیش از ۲۴ ساعت) دارد.
 *
 * POST (با احراز هویت) — الگوی stale-while-revalidate:
 *      کش تازه (<۳ دقیقه) → همان کش؛ کش کهنه (<۲۴ ساعت) → همان کش
 *      فوراً + تازه‌سازی پس‌زمینه؛ بدون کش/خیلی کهنه → scrape بلاک‌کننده.
 */

const FRESH_MS = 3 * 60 * 1000; // ۳ دقیقه
const STALE_MS = 24 * 60 * 60 * 1000; // ۲۴ ساعت
const REFRESH_MIN_GAP_MS = 3 * 60 * 1000; // حداکثر یک refresh هر ۳ دقیقه

// محدودکنندهٔ در-حافظه برای ?refresh=1 — کلید: IP (یا "local")
const refreshLastAt = new Map<string, number>();

function buildStaleFlag(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > STALE_MS;
}

export async function GET(req: NextRequest) {
  try {
    // ─── تازه‌سازی دستی (?refresh=1) — بدون احراز هویت اما rate-limited ───
    const url = new URL(req.url);
    if (url.searchParams.get("refresh") === "1") {
      const ip =
        (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
      const last = refreshLastAt.get(ip) ?? 0;
      if (Date.now() - last >= REFRESH_MIN_GAP_MS) {
        refreshLastAt.set(ip, Date.now()); // قبل از تلاش ثبت شود (ضد هجوم همزمان)
        try {
          await acquireScrape(); // best-effort — خطا در پاسخ اثر ندارد
        } catch {
          // نادیده گرفته می‌شود؛ وضعیت DB برگردانده می‌شود
        }
      }
    }

    const { data, count, fetchedAt, seeded } = await getLatestRates();
    return NextResponse.json({
      success: true,
      data,
      count,
      fetchedAt,
      stale: buildStaleFlag(fetchedAt),
      seeded,
    });
  } catch (error) {
    console.error("TGJU latest error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در خواندن نرخ‌ها" },
      { status: 500 }
    );
  }
}

export async function POST(req?: NextRequest) {
  // احراز هویت اجباری — نرخ ارز روی محاسبات مالی اثر دارد
  if (req) {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
  }

  // ─── سن کش را قبل از هر چیز بررسی کن (stale-while-revalidate) ───
  try {
    const ageMs = await getCacheAgeMs();
    if (ageMs != null && ageMs < FRESH_MS) {
      const { data, count, fetchedAt, seeded } = await getLatestRates();
      if (count > 0) {
        return NextResponse.json({
          success: true,
          data,
          updatedAt: fetchedAt,
          fetchedAt,
          count,
          cached: true,
          stale: buildStaleFlag(fetchedAt),
          seeded,
        });
      }
    }
    if (ageMs != null && ageMs < STALE_MS) {
      const { data, count, fetchedAt, seeded } = await getLatestRates();
      if (count > 0) {
        // کهنه اما قابل‌استفاده — فوراً بده و در پس‌زمینه تازه کن
        triggerBackgroundScrape();
        return NextResponse.json({
          success: true,
          data,
          updatedAt: fetchedAt,
          fetchedAt,
          count,
          cached: true,
          stale: true,
          seeded,
        });
      }
    }
  } catch {
    // خطای خواندن سن کش → مسیر scrape بلاک‌کننده
  }

  // ─── scrape بلاک‌کننده (قفل سراسری داخل acquireScrape) ───
  const outcome = await acquireScrape();
  const { data, count, fetchedAt, seeded } = await getLatestRates();
  if (count === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "دریافت نرخ‌ها ناموفق بود. لطفاً دوباره تلاش کنید.",
        cached: false,
      },
      { status: 502 }
    );
  }
  return NextResponse.json({
    success: true,
    data,
    updatedAt: fetchedAt,
    fetchedAt,
    count,
    cached: false,
    stale: buildStaleFlag(fetchedAt),
    seeded,
    scrapedCount: outcome.freshCount,
  });
}
