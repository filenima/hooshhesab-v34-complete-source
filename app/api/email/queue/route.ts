import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { queueEmail } from "@/lib/email-sender";

export const runtime = "nodejs";

const VALID_STATUSES = ["PENDING", "SENT", "FAILED", "RETRYING"];

/**
 * GET /api/email/queue?status=PENDING&page=1&limit=20
 * — فهرست ایمیل‌های در صف
 *
 * FIX(H5): قبلاً فقط verifyToken چک می‌شد و کوئری بدون فیلتر tenantId بود —
 * هر کاربرِ (حتی با توکن باطل‌شده) لیست صف ایمیل همه tenantها (شامل to/subject/html)
 * را می‌دید. حالا requireUser + مجوز ADMIN + اسکوپ اجباری به tenant نشست.
 */
export async function GET(req: NextRequest) {
 try {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { tenantId, role } = auth.user;
  if (role!== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "مشاهده صف ایمیل فقط برای مدیر مجاز است" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20)
  );

  // SECURITY: اسکوپ اجباری به tenant نشست کاربر
  const where: Record<string, unknown> = { tenantId };
  if (status && VALID_STATUSES.includes(status.toUpperCase())) {
    where.status = status.toUpperCase();
  }

  const [items, total] = await Promise.all([
    db.emailQueue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.emailQueue.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: items,
    total,
    page,
    limit,
  });
 } catch (error) {
  console.error("Email queue list error:", error);
  return NextResponse.json(
    { success: false, error: "خطا در دریافت صف ایمیل" },
    { status: 500 }
  );
 }
}

/**
 * POST /api/email/queue — افزودن ایمیل به صف
 * body: { to, subject, html, maxAttempts?, scheduledAt? }
 *
 * FIX(H5): requireUser به‌جای verifyToken (توکن باطل‌شده دیگر کار نمی‌کند) +
 * tenantId همیشه از نشست کاربر گرفته می‌شود (نه payload توکن کلاینت).
 */
export async function POST(req: NextRequest) {
 try {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { tenantId, userId } = auth.user;

  const body = await req.json().catch(() => ({}));
  const to = String(body?.to || "").trim();
  const subject = String(body?.subject || "").trim();
  const html = String(body?.html || "");
  const maxAttempts =
    typeof body?.maxAttempts === "number"? body.maxAttempts: 3;
  const scheduledAt = body?.scheduledAt? new Date(body.scheduledAt): undefined;

  if (!to ||!subject ||!html) {
    return NextResponse.json(
      { success: false, error: "گیرنده، موضوع و محتوا الزامی است" },
      { status: 400 }
    );
  }

  const result = await queueEmail({
    to,
    subject,
    html,
    tenantId,
    maxAttempts,
    scheduledAt,
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error?? "خطا در افزودن به صف" },
      { status: 400 }
    );
  }

  // ثبت لاگ audit
  try {
    await db.documentEdit.create({
      data: {
        tenantId,
        entityType: "EMAIL_QUEUE",
        entityId: result.id || "unknown",
        userId,
        field: "queue",
        oldValue: null,
        newValue: `${to} | ${subject}`,
      },
    });
  } catch {
    // audit log نباید باعث شکست endpoint شود
  }

  return NextResponse.json({
    success: true,
    data: { id: result.id },
    message: "ایمیل به صف افزوده شد",
  });
 } catch (error) {
  console.error("Email queue add error:", error);
  return NextResponse.json(
    { success: false, error: "خطا در افزودن به صف" },
    { status: 500 }
  );
 }
}

/**
 * DELETE /api/email/queue?status=SENT — حذف ایمیل‌های SENT
 * یا با id ایمیل خاص
 *
 * FIX(H5): قبلاً حذف با id بدون چک مالکیت بود (حذف ایمیل tenant دیگر) و
 * deleteMany وضعیت SENT جهانی بود (همه tenantها). حالا:
 * - requireUser + مجوز ADMIN
 * - حذف با id فقط برای ایمیل‌های همین tenant
 * - حذف SENT فقط برای همین tenant (حذف جهانی فقط با سوپرادمین — که از این
 *   مسیر عبور نمی‌کند؛ نیاز به ابزار superadmin جداگانه دارد)
 */
export async function DELETE(req: NextRequest) {
 try {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { tenantId, role } = auth.user;
  if (role!== "ADMIN") {
    return NextResponse.json(
      { success: false, error: "حذف از صف ایمیل فقط برای مدیر مجاز است" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const status = (searchParams.get("status") || "").toUpperCase();

  if (id) {
    // SECURITY: فقط ایمیل‌های متعلق به tenant خود کاربر قابل حذف‌اند
    const existing = await db.emailQueue.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "ایمیل یافت نشد یا به سازمان شما تعلق ندارد" },
        { status: 404 }
      );
    }
    await db.emailQueue.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "ایمیل حذف شد" });
  }

  // حذف همه ایمیل‌های با وضعیت مشخص (معمولاً SENT) — فقط همین tenant
  if (status === "SENT") {
    const deleted = await db.emailQueue.deleteMany({
      where: { status: "SENT", tenantId },
    });
    return NextResponse.json({
      success: true,
      deleted: deleted.count,
      message: "ایمیل‌های ارسال‌شده پاک‌سازی شدند",
    });
  }

  return NextResponse.json(
    { success: false, error: "یا id یا status=SENT را ارسال کنید" },
    { status: 400 }
  );
 } catch (error) {
  console.error("Email queue delete error:", error);
  return NextResponse.json(
    { success: false, error: "خطا در حذف ایمیل" },
    { status: 500 }
  );
 }
}
