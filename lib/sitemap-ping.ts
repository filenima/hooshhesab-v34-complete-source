// ============================================================
// هوش — پینگ خودکار sitemap به موتورهای جست‌وجو (v26)
// ============================================================
// پس از هر انتشار زمان‌بندی‌شدهٔ بلاگ (زمان‌بند یا انتشار دستی سوپرادمین)،
// sitemap به‌صورت fire-and-forget به موتورهای پذیرای پینگ ارسال می‌شود.
//
// نکته‌ها (وضعیت واقعی آزموده‌شده در ۰۷ مهر ۱۴۰۵ / ۲۹ سپتامبر ۲۰۲۶):
// - Google پینگ sitemap را از ۲۰۲۳ رسماً بازنشسته کرده (410) — جایی برای
//   پینگ نیست؛ کش Google با ربات‌های خودش sitemap را دوباره کش می‌کند.
// - Bing هم /ping را بازنشسته کرده و 410 برمی‌گرداند (آزموده شد).
// - بنابراین آرایهٔ engines عمداً خالی از موتور فعال است؛ ساختار برای
//   افزودن سرویس‌های آینده (مثل IndexNow با کلید env) آماده است و
//   ارزش فعلی این ماژول: ثبت زمان اطلاع‌رسانی + رخداد زندهٔ ممیزی +
//   شفافیت در پاسخ cron است.
// - همهٔ خطاها بی‌صدا بلعیده می‌شوند (انتشار بلاگ هرگز به‌خاطر پینگ شکست
//   نمی‌خورد) و نتیجهٔ آخرین پینگ در SystemSettings ثبت می‌شود تا پنل
//   سوپرادمین بتواند تاریخ آخرین اطلاع‌رسانی را نشان دهد.
// - همچنین یک رخداد ممیزی «sitemap.ping» در گزارش زندهٔ رخدادها پخش می‌شود.

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/lib/audit-bus";

const PING_TIMEOUT_MS = 4_000;
const LAST_PING_KEY = "sitemap_last_ping_at";

export interface SitemapPingResult {
  sitemapUrl: string;
  pinged: string[];
  failed: string[];
  skipped: string[];
}

/** ساخت URL کامل sitemap بر اساس دامنهٔ فعال برند */
async function buildSitemapUrl(origin?: string): Promise<string> {
  try {
    const { getAppBaseUrl } = await import("@/lib/app-url");
    const base = await getAppBaseUrl(origin ? new Request(origin) : undefined);
    return `${base.replace(/\/+$/, "")}/sitemap.xml`;
  } catch {
    return "/sitemap.xml";
  }
}

/**
 * pingSitemapEngines — اطلاع‌رسانی آپدیت sitemap به موتورهای جست‌وجو.
 *
 * @param publishedCount تعداد پست‌های تازه منتشرشده (برای لاگ ممیزی)
 * @param origin  در صورت وجود، برای استخراج دامنهٔ درخواست جاری
 */
export async function pingSitemapEngines(
  publishedCount: number,
  origin?: string
): Promise<SitemapPingResult> {
  const sitemapUrl = await buildSitemapUrl(origin);
  const result: SitemapPingResult = {
    sitemapUrl,
    pinged: [],
    failed: [],
    skipped: [],
  };

  // Google و Bing هر دو پینگ sitemap را بازنشسته کرده‌اند (410) —
  // برای شفافیت پاسخ cron ثبت می‌شوند، نه درخواست واقعی
  result.skipped.push("google (deprecated)", "bing (deprecated)");

  // سرویس‌های پذیرای پینگ (در صورت ظهور دوباره/کلید IndexNow اینجا اضافه شود)
  const engines: { name: string; url: string }[] = [];

  await Promise.all(
    engines.map(async (engine) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      try {
        const res = await fetch(engine.url, {
          method: "GET",
          signal: controller.signal,
          headers: { "User-Agent": "Hoosh-Sitemap-Ping/1.0" },
          cache: "no-store",
        });
        // Bing معمولاً 200 یا 202 برمی‌گرداند؛ 4xx/5xx یعنی خطا
        if (res.ok) {
          result.pinged.push(engine.name);
        } else {
          result.failed.push(`${engine.name} (HTTP ${res.status})`);
        }
      } catch {
        // آفلاین/تایم‌اوت/فیلترشده — بی‌صدا
        result.failed.push(`${engine.name} (network)`);
      } finally {
        clearTimeout(timer);
      }
    })
  );

  // ثبت نتیجه برای پنل سوپرادمین (best-effort)
  try {
    const stamp = new Date().toISOString();
    await db.systemSettings.upsert({
      where: { key: LAST_PING_KEY },
      create: {
        key: LAST_PING_KEY,
        value: JSON.stringify({
          at: stamp,
          sitemapUrl,
          publishedCount,
          pinged: result.pinged,
          failed: result.failed,
        }),
      },
      update: { value: JSON.stringify({ at: stamp, sitemapUrl, publishedCount, pinged: result.pinged, failed: result.failed }) },
    });
  } catch {
    /* DB در دسترس نیست — پینگ مهم‌تر از ثبت است */
  }

  // رخداد زندهٔ ممیزی برای تب «گزارش زندهٔ رخدادها»
  try {
    emitAuditEvent({
      tenantId: "platform",
      action: "sitemap.ping",
      entity: "sitemap",
      entityId: null,
      changes: JSON.stringify({
        publishedCount,
        pinged: result.pinged,
        failed: result.failed,
        sitemapUrl,
      }),
    });
  } catch {
    /* audit bus قطع — نادیده */
  }

  return result;
}

/** خواندن آخرین پینگ برای نمایش در پنل (null = هرگز) */
export async function getLastSitemapPing(): Promise<{
  at: string;
  publishedCount: number;
  pinged: string[];
} | null> {
  try {
    const row = await db.systemSettings.findUnique({ where: { key: LAST_PING_KEY } });
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as {
      at: string;
      publishedCount: number;
      pinged: string[];
    };
    return parsed;
  } catch {
    return null;
  }
}
