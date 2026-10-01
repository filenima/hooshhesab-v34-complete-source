import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { toPersianDigits } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Task 3-b — کامنت داخلی تیم پشتیبانی روی هر tenant ============
// GET    /api/platform/tenant-comments?tenantId=... — رشتهٔ کامنت‌های آن سازمان
//        (بدون tenantId → خطا؛ ?summary=1 خلاصهٔ شمار+آخرین کامنت همهٔ سازمان‌ها)
// POST   /api/platform/tenant-comments { tenantId, body } — ثبت یادداشت جدید
//        (authorName = نام کاربری سوپرادمین + superAdminId — denormalized)
// DELETE /api/platform/tenant-comments?id=... — حذف یک یادداشت
//
// این یادداشت‌ها صرفاً داخلی‌اند — کاربران سازمان هرگز آن‌ها را نمی‌بینند.
// مدل TenantComment بدون FK است (سبک no-FK بخش‌های اخیر اسکیما) تا حذف
// سازمان/ادمین رکوردها را نشکند. هر تغییر در PlatformAuditLog ثبت می‌شود.

/** حداکثر طول متن یادداشت */
const MAX_BODY_LENGTH = 2000;
/** حداکثر رکورد بازگردانده‌شده در هر GET */
const MAX_TAKE = 200;

interface CommentDTO {
 id: string;
 tenantId: string;
 superAdminId: string | null;
 authorName: string;
 body: string;
 createdAt: string;
}

function toDTO(c: {
 id: string;
 tenantId: string;
 superAdminId: string | null;
 authorName: string;
 body: string;
 createdAt: Date;
}): CommentDTO {
 return {
  id: c.id,
  tenantId: c.tenantId,
  superAdminId: c.superAdminId,
  authorName: c.authorName,
  body: c.body,
  createdAt: c.createdAt.toISOString(),
 };
}

export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const rl = rateLimitCheck(`tenant-comments-get:${auth.admin.id}:${getClientIp(req)}`, 60, 60_000);
 if (!rl.ok) {
  return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
 }

 try {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") || "";
  const summary = searchParams.get("summary") === "1";
  const take = Math.min(Number(searchParams.get("take") || "100") || 100, MAX_TAKE);

  // خلاصه برای همهٔ سازمان‌ها — شمار + پیش‌نمایش آخرین یادداشت هر سازمان
  if (summary) {
   const rows = await db.tenantComment.findMany({
    orderBy: { createdAt: "desc" },
    select: { tenantId: true, body: true, createdAt: true },
    take: 1000,
   });
   const map: Record<string, { count: number; latestPreview: string; latestAt: string }> = {};
   for (const r of rows) {
    const existing = map[r.tenantId];
    if (!existing) {
     map[r.tenantId] = {
      count: 1,
      latestPreview: r.body.slice(0, 60),
      latestAt: r.createdAt.toISOString(),
     };
    } else {
     existing.count += 1;
    }
   }
   return NextResponse.json({ success: true, data: { summary: map } });
  }

  if (!tenantId) {
   return NextResponse.json({ success: false, error: "شناسه سازمان الزامی است" }, { status: 400 });
  }
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) {
   return NextResponse.json({ success: false, error: "سازمان یافت نشد" }, { status: 404 });
  }

  const comments = await db.tenantComment.findMany({
   where: { tenantId },
   orderBy: { createdAt: "desc" },
   take,
  });

  return NextResponse.json({
   success: true,
   data: {
    tenant: { id: tenant.id, name: tenant.name },
    comments: comments.map(toDTO),
    total: comments.length,
   },
  });
 } catch (error) {
  console.error("Tenant comments GET error:", error);
  return NextResponse.json({ success: false, error: "خطا در دریافت یادداشت‌ها" }, { status: 500 });
 }
}

export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const rl = rateLimitCheck(`tenant-comments-post:${auth.admin.id}:${getClientIp(req)}`, 30, 60_000);
 if (!rl.ok) {
  return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
 }

 try {
  const body = await req.json().catch(() => ({}));
  const tenantId = String(body?.tenantId || "").trim();
  const text = String(body?.body || "").trim();

  if (!tenantId) {
   return NextResponse.json({ success: false, error: "شناسه سازمان الزامی است" }, { status: 400 });
  }
  if (!text) {
   return NextResponse.json({ success: false, error: "متن یادداشت الزامی است" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
   return NextResponse.json(
    { success: false, error: `متن یادداشت حداکثر ${toPersianDigits(MAX_BODY_LENGTH)} کاراکتر است` },
    { status: 400 }
   );
  }

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) {
   return NextResponse.json({ success: false, error: "سازمان یافت نشد" }, { status: 404 });
  }

  const comment = await db.tenantComment.create({
   data: {
    tenantId,
    superAdminId: auth.admin.id,
    authorName: auth.admin.username || "پشتیبانی",
    body: text,
   },
  });

  try {
   await db.platformAuditLog.create({
    data: {
     superAdminId: auth.admin.id,
     action: "TENANT_COMMENT_CREATE",
     entity: "TenantComment",
     entityId: comment.id,
     details: JSON.stringify({ tenantId, tenantName: tenant.name, preview: text.slice(0, 80) }),
     ipAddress: req.headers.get("x-forwarded-for") || null,
    },
   });
  } catch {
   /* ignore */
  }

  return NextResponse.json({
   success: true,
   data: toDTO(comment),
   message: "یادداشت داخلی ثبت شد",
  });
 } catch (error) {
  console.error("Tenant comment POST error:", error);
  return NextResponse.json({ success: false, error: "خطا در ثبت یادداشت" }, { status: 500 });
 }
}

export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const rl = rateLimitCheck(`tenant-comments-delete:${auth.admin.id}:${getClientIp(req)}`, 30, 60_000);
 if (!rl.ok) {
  return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
 }

 try {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) {
   return NextResponse.json({ success: false, error: "شناسه یادداشت الزامی است" }, { status: 400 });
  }

  const existing = await db.tenantComment.findUnique({ where: { id } });
  if (!existing) {
   return NextResponse.json({ success: false, error: "یادداشت یافت نشد" }, { status: 404 });
  }

  await db.tenantComment.delete({ where: { id } });

  try {
   await db.platformAuditLog.create({
    data: {
     superAdminId: auth.admin.id,
     action: "TENANT_COMMENT_DELETE",
     entity: "TenantComment",
     entityId: id,
     details: JSON.stringify({ tenantId: existing.tenantId, preview: existing.body.slice(0, 80) }),
     ipAddress: req.headers.get("x-forwarded-for") || null,
    },
   });
  } catch {
   /* ignore */
  }

  return NextResponse.json({ success: true, message: "یادداشت حذف شد" });
 } catch (error) {
  console.error("Tenant comment DELETE error:", error);
  return NextResponse.json({ success: false, error: "خطا در حذف یادداشت" }, { status: 500 });
 }
}
