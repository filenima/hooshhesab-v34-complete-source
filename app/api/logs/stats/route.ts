// ============ آمار لاگ‌ها — شمارش بر سطح، دسته، روند زمانی ============
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/user-auth';

export async function GET(req: NextRequest) {
 try {
  // FIX(C2): آمار لاگ‌ها قبلاً بدون احراز هویت بود — هر کسی آمار/پیام خطاهای
  // هر tenant را می‌دید. حالا requireUser اجباری + اسکوپ اجباری به tenant نشست؛
  // پارامتر tenantId کلاینت نادیده گرفته می‌شود (فقط در DEMO_MODE سمت سرور قابل
  // تنظیم است، نه از query).
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { tenantId } = auth.user;

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');

  const baseWhere: Record<string, unknown> = { tenantId };
  if (dateFrom || dateTo) {
    const tf: Record<string, Date> = {};
    if (dateFrom) tf.gte = new Date(dateFrom);
    if (dateTo) tf.lte = new Date(dateTo);
    baseWhere.timestamp = tf;
  }

  // شمارش بر سطح
  const byLevelRaw = await db.logEntry.groupBy({
    by: ['level'],
    where: baseWhere,
    _count: { _all: true },
  });
  // مرتب‌سازی دستی بر شمارش نزولی
  const byLevel = byLevelRaw
.map((r) => ({ level: r.level, count: (r._count as Record<string, number>)._all }))
.sort((a, b) => b.count - a.count);

  // شمارش بر دسته
  const byCategoryRaw = await db.logEntry.groupBy({
    by: ['category'],
    where: baseWhere,
    _count: { _all: true },
  });
  const byCategory = byCategoryRaw
.map((r) => ({ category: r.category, count: (r._count as Record<string, number>)._all }))
.sort((a, b) => b.count - a.count);

  // کل
  const total = await db.logEntry.count({ where: baseWhere });

  // خطاها و هشدارها
  const errorCount = await db.logEntry.count({
    where: {...baseWhere, level: { in: ['ERROR', 'FATAL'] } },
  });
  const warnCount = await db.logEntry.count({
    where: {...baseWhere, level: 'WARN' },
  });

  // روند ۲۴ ساعت اخیر
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const trendWhere = {...baseWhere, timestamp: { gte: last24h } };
  const hourlyTrendRaw = await db.logEntry.groupBy({
    by: ['level'],
    where: trendWhere,
    _count: { _all: true },
  });
  const hourlyTrend = hourlyTrendRaw.map((r) => ({
    level: r.level,
    count: (r._count as Record<string, number>)._all,
  }));

  // ۱۰ خطای پرتکرار
  const topErrors = await db.logEntry.findMany({
    where: {...baseWhere, level: { in: ['ERROR', 'FATAL'] } },
    select: { message: true, category: true },
    take: 5000,
    orderBy: { timestamp: 'desc' },
  });

  // تجمیع پیام‌های خطا
  const errorFreq: Record<string, number> = {};
  for (const e of topErrors) {
    const key = `${e.category}:${e.message.slice(0, 100)}`;
    errorFreq[key] = (errorFreq[key] || 0) + 1;
  }
  const topErrorMessages = Object.entries(errorFreq)
.sort((a, b) => b[1] - a[1])
.slice(0, 10)
.map(([key, count]) => {
    const [cat,...msgParts] = key.split(':');
    return { category: cat, message: msgParts.join(':'), count };
  });

  return NextResponse.json({
    total,
    errorCount,
    warnCount,
    byLevel,
    byCategory,
    hourlyTrend,
    topErrors: topErrorMessages,
  });
 } catch (error) {
  return NextResponse.json(
    { error: 'خطا در دریافت آمار لاگ‌ها' },
    { status: 500 }
  );
 }
}
