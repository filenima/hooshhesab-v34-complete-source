import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";

/**
 * GET /api/email/queue/stats — آمار صف ایمیل
 * — تعداد ایمیل‌ها به تفکیک وضعیت (PENDING, SENT, FAILED, RETRYING)
 * — میانگین تلاش‌ها و نرخ موفقیت
 *
 * FIX(H5/M9): آمار قبلاً بدون tenant-scoping بود (اعداد همه tenantها).
 * حالا requireUser + مجوز ADMIN + اسکوپ اجباری به tenant نشست کاربر.
 */
export async function GET(req: NextRequest) {
 try {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { tenantId, role } = auth.user;
  if (role!== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "مشاهده آمار صف ایمیل فقط برای مدیر مجاز است" },
      { status: 403 }
    );
  }

  // SECURITY: اسکوپ اجباری به tenant نشست کاربر
  const scope = { tenantId };
  const [pending, sent, failed, retrying, total] = await Promise.all([
  db.emailQueue.count({ where: {...scope, status: "PENDING" } }),
  db.emailQueue.count({ where: {...scope, status: "SENT" } }),
  db.emailQueue.count({ where: {...scope, status: "FAILED" } }),
  db.emailQueue.count({ where: {...scope, status: "RETRYING" } }),
  db.emailQueue.count({ where: scope }),
 ]);

  // مجموع تلاش‌ها برای محاسبه میانگین
  const agg = await db.emailQueue.aggregate({
   where: scope,
   _sum: { attempts: true },
  });
  const avgAttempts = total > 0? (agg._sum.attempts?? 0) / total: 0;

  // نرخ موفقیت
  const successRate = total > 0? (sent / total) * 100: 0;

  // آخرین ۵ ایمیل FAILED برای نمایش سریع (فقط همین tenant)
  const recentFailed = await db.emailQueue.findMany({
  where: {...scope, status: "FAILED" },
  orderBy: { createdAt: "desc" },
  take: 5,
  select: {
   id: true,
   to: true,
   subject: true,
   attempts: true,
   maxAttempts: true,
   lastError: true,
   createdAt: true,
  },
 });

  return NextResponse.json({
   success: true,
   data: {
   pending,
   sent,
   failed,
   retrying,
   total,
   avgAttempts: Number(avgAttempts.toFixed(2)),
   successRate: Number(successRate.toFixed(1)),
   recentFailed,
   },
  });
 } catch (error) {
  console.error("Email queue stats error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در دریافت آمار صف" },
   { status: 500 }
  );
 }
}
