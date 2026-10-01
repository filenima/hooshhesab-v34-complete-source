// ============ خروجی لاگ‌ها — CSV / JSON ============
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/user-auth';
import { auditLog } from '@/lib/auth';

export async function GET(req: NextRequest) {
 try {
  // FIX(C1): خروجی لاگ‌ها قبلاً بدون هیچ احراز هویت بود — هر نفر ناشناس با
  // GET /api/logs/export?limit=5000 تمام LogEntryها (شامل IPها و پیام‌های AUTH)
  // برای همه tenantها را دانلود می‌کرد. حالا:
  // ۱) احراز هویت اجباری (requireUser — توکن + نشست فعال)
  // ۲) tenantId همیشه از نشست کاربر گرفته می‌شود؛ پارامتر client نادیده گرفته می‌شود
  // ۳) فقط ADMIN مجاز به خروجی است
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { tenantId, role, userId } = auth.user;
  if (role!== 'ADMIN') {
    return NextResponse.json(
      { error: 'خروجی لاگ‌ها فقط برای مدیر سیستم مجاز است' },
      { status: 403 }
    );
  }

  // EXPORT-LOCK(v19): خروجی داده در پلن رایگان/تریال قفل است — کاربر تریال
  // باید ابتدا پلن بخرد. لایهٔ سرور برای ممانعت از دور زدن گارد کلاینت.
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    const isTrialUser = user?.isTrial === true;
    if (isTrialUser) {
      return NextResponse.json(
        {
          error:
            'خروجی‌گرفتن اطلاعات در پلن رایگان قفل است. برای فعال‌سازی خروجی CSV/JSON، حساب خود را به پلن پایه یا حرفه‌ای ارتقا دهید.',
          errorCode: 'EXPORT_LOCKED',
        },
        { status: 403 }
      );
    }
  } catch {
    /* خطای بررسی → ادامه (fail-open) */
  }

  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'json'; // json | csv
  const level = url.searchParams.get('level');
  const category = url.searchParams.get('category');
  // SECURITY: tenantId کلاینت نادیده گرفته می‌شود — اسکوپ اجباری به tenant نشست
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const parsedLimit = parseInt(url.searchParams.get('limit') || '1000', 10);
  const limit = Number.isFinite(parsedLimit)
? Math.min(Math.max(parsedLimit, 1), 5000)
: 1000;

  const where: Record<string, unknown> = { tenantId };
  if (level) where.level = level;
  if (category) where.category = category;
  if (dateFrom || dateTo) {
    const tf: Record<string, Date> = {};
    if (dateFrom) tf.gte = new Date(dateFrom);
    if (dateTo) tf.lte = new Date(dateTo);
    where.timestamp = tf;
  }

  const entries = await db.logEntry.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  // ثبت رویداد خروجی در audit (داده حساس افشا می‌شود)
  await auditLog({
    tenantId,
    userId,
    action: 'LOGS_EXPORT',
    entity: 'LogEntry',
    changes: { format, limit, level, category, count: entries.length },
    req,
  });

  if (format === 'csv') {
    // ساخت CSV
    const headers = [
      'timestamp',
      'level',
      'category',
      'message',
      'tenantId',
      'userId',
      'requestId',
      'ip',
      'path',
      'duration',
    ];
    const rows = entries.map((e) =>
      headers
.map((h) => {
          const val = e[h as keyof typeof e];
          const str = val === null || val === undefined? '': String(val);
          // فرار کاما و کوتیشن
          return str.includes(',') || str.includes('"')
? `"${str.replace(/"/g, '""')}"`
: str;
        })
.join(',')
    );
    const csv = [headers.join(','),...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="logs-${Date.now()}.csv"`,
      },
    });
  }

  // JSON پیش‌فرض
  return new NextResponse(JSON.stringify(entries, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="logs-${Date.now()}.json"`,
    },
  });
 } catch (error) {
  return NextResponse.json(
    { error: 'خطا در خروجی لاگ‌ها' },
    { status: 500 }
  );
 }
}
