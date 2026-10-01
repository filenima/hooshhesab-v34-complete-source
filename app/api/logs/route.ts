// ============ API لاگ‌ها — GET (فیلتر+صفحه‌بندی) + DELETE (پاک‌سازی) ============
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/user-auth';
import { auditLog } from '@/lib/auth';

export async function GET(req: NextRequest) {
 try {
  // احراز هویت — requireUser (توکن + نشست فعال + کاربر فعال)
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { tenantId } = auth.user;

  const url = new URL(req.url);
  const level = url.searchParams.get('level');
  const category = url.searchParams.get('category');
  const userId = url.searchParams.get('userId');
  const search = url.searchParams.get('search');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const parsedLimit = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Number.isFinite(parsedLimit)
? Math.min(Math.max(parsedLimit, 1), 200)
: 50;
  const parsedOffset = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0? parsedOffset: 0;

  // ساخت شرط‌های فیلتر — همیشه فیلتر tenantId برای جداسازی داده‌ها
  // SECURITY: tenantId از نشست کاربر می‌آید؛ tenantId کلاینت نادیده گرفته می‌شود
  const where: Record<string, unknown> = { tenantId };

  if (level) where.level = level;
  if (category) where.category = category;
  if (userId) where.userId = userId;

  if (search) {
    where.message = { contains: search };
  }

  if (dateFrom || dateTo) {
    const timestampFilter: Record<string, Date> = {};
    if (dateFrom) timestampFilter.gte = new Date(dateFrom);
    if (dateTo) timestampFilter.lte = new Date(dateTo);
    where.timestamp = timestampFilter;
  }

  const [entries, total] = await Promise.all([
    db.logEntry.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.logEntry.count({ where }),
  ]);

  return NextResponse.json({ entries, total, limit, offset });
 } catch (error) {
  return NextResponse.json(
    { error: 'خطا در دریافت لاگ‌ها' },
    { status: 500 }
  );
 }
}

export async function DELETE(req: NextRequest) {
 try {
  // FIX(H4): پاک‌سازی لاگ‌ها قبلاً فقط احراز هویت tenant داشت — هر کاربری با هر
  // نقشی (حتی VIEWER) می‌توانست DELETE /api/logs?all=true بزند و audit-trail
  // tenant را پاک کند. حالا requireUser + نقش ADMIN + اسکوپ اجباری tenant.
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { tenantId, role, userId } = auth.user;
  if (role!== 'ADMIN') {
    return NextResponse.json(
      { error: 'پاک‌سازی لاگ‌ها فقط برای مدیر سیستم مجاز است' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const level = url.searchParams.get('level');
  const category = url.searchParams.get('category');
  const olderThan = url.searchParams.get('olderThan'); // ISO date
  const all = url.searchParams.get('all');

  // امنیت: فقط با فیلتر مشخص پاک شود (مگر all=true)
  if (!all &&!level &&!category &&!olderThan) {
    return NextResponse.json(
      { error: 'حداقل یک فیلتر مشخص کنید یا all=true بگذارید' },
      { status: 400 }
    );
  }

  // SECURITY: پاک‌سازی دسته‌های SECURITY/AUTH مجاز نیست — ردپای امنیتی باید
  // بماند (مهاجم/کاربر نتواند evidence پاک کند)
  if (category && ['SECURITY', 'AUTH'].includes(category.toUpperCase())) {
    return NextResponse.json(
      { error: 'پاک‌سازی لاگ‌های دسته SECURITY/AUTH مجاز نیست' },
      { status: 403 }
    );
  }

  // همیشه فیلتر tenantId برای جداسازی داده‌ها — all=true فقط یعنی
  // «همه لاگ‌های همین tenant»؛ حذف بین-tenantی وجود ندارد.
  // دسته‌های SECURITY/AUTH همیشه از پاک‌سازی all-level مستثنی می‌مانند.
  const where: Record<string, unknown> = {
    tenantId,
    category: { notIn: ['SECURITY', 'AUTH'] },
  };
  if (level) where.level = level;
  if (category) where.category = category;
  if (olderThan) where.timestamp = { lt: new Date(olderThan) };

  const result = await db.logEntry.deleteMany({ where });

  // ثبت رویداد پاک‌سازی در audit trail (خود auditLog حذف نمی‌شود)
  await auditLog({
    tenantId,
    userId,
    action: 'LOGS_PURGE',
    entity: 'LogEntry',
    changes: { deleted: result.count, level, category, olderThan, all: Boolean(all) },
    req,
  });

  return NextResponse.json({ deleted: result.count });
 } catch (error) {
  return NextResponse.json(
    { error: 'خطا در پاک‌سازی لاگ‌ها' },
    { status: 500 }
  );
 }
}
