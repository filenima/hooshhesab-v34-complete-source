// ============ blog-scheduler.ts — موتور انتشار زمان‌بندی‌شده بلاگ (v19) ============
// ----------------------------------------------------------------------------
// درخواست مالک: «۲۷ وبلاگ در حالت پیشنویس باشد و بشونه انتخاب کرد که مثلاً
// هر دو روز یک وبلاگ منتشر بشه.»
//
// سازوکار:
//   ۱) autoScheduleDrafts(intervalDays) — به همهٔ پیشنویس‌های بدونِ زمان‌بندی،
//      نوبت‌های هر-N-روزه اختصاص می‌دهد (بر اساس scheduleOrder یا createdAt).
//      اولین نوبت = فردا ساعت ۹ صبح؛ بعدی‌ها هر N روز.
//   ۲) publishDueScheduledPosts() — پیشنویس‌هایی که موعدشان رسیده را منتشر
//      می‌کند (status=PUBLISHED + publishedAt=now + cache bust).
//   ۳) تریگرها: cron endpoint (برای scheduler خارجی) + فراخوانی فرصت‌طلبانه
//      در /api/blog/list (بدون تأخیر محسوس — حداکثر هر ۱۵ دقیقه یک‌بار).
//
// تنظیم بازهٔ انتشار (intervalDays) در SystemSettings با کلید
// «blog_publish_interval_days» ذخیره می‌شود؛ پیش‌فرض = ۲ روز.
// ============================================================================

import { db } from "@/lib/db";

const INTERVAL_SETTING_KEY = "blog_publish_interval_days";
export const DEFAULT_INTERVAL_DAYS = 2;

/** خواندن بازهٔ انتشار از تنظیمات (پیش‌فرض ۲ روز) */
export async function getPublishIntervalDays(): Promise<number> {
  try {
    const row = await db.systemSettings.findUnique({
      where: { key: INTERVAL_SETTING_KEY },
    });
    const n = Number(row?.value);
    if (Number.isFinite(n) && n >= 1 && n <= 30) return Math.round(n);
  } catch {
    /* ignore */
  }
  return DEFAULT_INTERVAL_DAYS;
}

/** ذخیرهٔ بازهٔ انتشار (سوپرادمین) */
export async function setPublishIntervalDays(days: number): Promise<void> {
  const clamped = Math.max(1, Math.min(30, Math.round(days)));
  await db.systemSettings.upsert({
    where: { key: INTERVAL_SETTING_KEY },
    create: { key: INTERVAL_SETTING_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  });
}

/**
 * زمان‌بندی خودکار پیشنویس‌های بدون نوبت — هر N روز یک پست.
 * ترتیب: scheduleOrder موجود → createdAt. نوبت‌ها از فردا ۹:۰۰ صبح شروع می‌شوند.
 */
export async function autoScheduleDrafts(): Promise<{ scheduled: number; intervalDays: number }> {
  const intervalDays = await getPublishIntervalDays();

  // پیشنویس‌های بدون زمان‌بندی
  const drafts = await db.blogPost.findMany({
    where: { status: "DRAFT", scheduledPublishAt: null },
    orderBy: [{ scheduleOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (drafts.length === 0) return { scheduled: 0, intervalDays };

  // آخرین نوبتِ موجود — نوبت‌های جدید بعد از آن
  const lastScheduled = await db.blogPost.findFirst({
    where: { scheduledPublishAt: { not: null } },
    orderBy: { scheduledPublishAt: "desc" },
    select: { scheduledPublishAt: true },
  });

  const base =
    lastScheduled?.scheduledPublishAt && new Date(lastScheduled.scheduledPublishAt) > new Date()
      ? new Date(lastScheduled.scheduledPublishAt)
      : nextRunAt9am();

  let scheduled = 0;
  // FIX(v30 — date overlap): نوبت اولِ پیشنویسِ جدید باید «یک بازه» بعد از
  // آخرین نوبتِ موجود باشد، نه هم‌روزِ آن — وگرنه دو مقاله هم‌زمان منتشر
  // می‌شدند (باگ دیده‌شده در ۲۰۲۶-۱۱-۲۰ و ۲۰۲۶-۱۲-۲۶).
  const hasFutureBase =
    lastScheduled?.scheduledPublishAt && new Date(lastScheduled.scheduledPublishAt) > new Date();
  for (let i = 0; i < drafts.length; i++) {
    const offsetIdx = hasFutureBase ? i + 1 : i;
    const slot = new Date(base.getTime() + offsetIdx * intervalDays * 24 * 60 * 60 * 1000);
    await db.blogPost.update({
      where: { id: drafts[i].id },
      data: { scheduledPublishAt: slot, scheduleOrder: i + 1 },
    });
    scheduled++;
  }
  return { scheduled, intervalDays };
}

/** فردا ساعت ۹:۰۰ صبح (زمان محلی سرور) */
function nextRunAt9am(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * انتشار پیشنویس‌های سررسیده — موعد رسیده → PUBLISHED.
 * idempotent و امن برای فراخوانی هم‌زمان (updateMany با شرط status=DRAFT).
 */
export async function publishDueScheduledPosts(): Promise<{
  published: number;
  nextSlot: Date | null;
}> {
  const now = new Date();
  const res = await db.blogPost.updateMany({
    where: {
      status: "DRAFT",
      scheduledPublishAt: { lte: now },
    },
    data: { status: "PUBLISHED", publishedAt: now },
  });

  // باطل‌کردن کش لیست بلاگ
  try {
    const { cacheDeleteByPrefix } = await import("@/lib/cache");
    cacheDeleteByPrefix("blog:");
  } catch {
    /* ignore */
  }

  const next = await db.blogPost.findFirst({
    where: { status: "DRAFT", scheduledPublishAt: { not: null } },
    orderBy: { scheduledPublishAt: "asc" },
    select: { scheduledPublishAt: true },
  });

  return {
    published: res.count,
    nextSlot: next?.scheduledPublishAt ? new Date(next.scheduledPublishAt) : null,
  };
}

/** آمار صف انتشار برای پنل سوپرادمین */
export async function getScheduleStats(): Promise<{
  intervalDays: number;
  drafts: number;
  scheduled: number;
  published: number;
  nextSlot: Date | null;
  lastPublishedAt: Date | null;
}> {
  const [intervalDays, drafts, scheduled, published, next, last] = await Promise.all([
    getPublishIntervalDays(),
    db.blogPost.count({ where: { status: "DRAFT", scheduledPublishAt: null } }),
    db.blogPost.count({ where: { status: "DRAFT", scheduledPublishAt: { not: null } } }),
    db.blogPost.count({ where: { status: "PUBLISHED" } }),
    db.blogPost.findFirst({
      where: { status: "DRAFT", scheduledPublishAt: { not: null } },
      orderBy: { scheduledPublishAt: "asc" },
      select: { scheduledPublishAt: true },
    }),
    db.blogPost.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    }),
  ]);
  return {
    intervalDays,
    drafts,
    scheduled,
    published,
    nextSlot: next?.scheduledPublishAt ? new Date(next.scheduledPublishAt) : null,
    lastPublishedAt: last?.publishedAt ? new Date(last.publishedAt) : null,
  };
}
