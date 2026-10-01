import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

// ============================================================
// /api/platform/partners — مدیریت درخواست‌های برنامهٔ شراکت (v29)
// ============================================================
// GET    : لیست + آمار (فیلتر وضعیت، جست‌وجو، صفحه‌بندی)
// PATCH  : تغییر وضعیت (NEW → CONTACTED → APPROVED/REJECTED) + یادداشت
// DELETE : حذف درخواست (سوپرادمین)
// همه با requireSuperAdmin
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["NEW", "CONTACTED", "APPROVED", "REJECTED"];

const AUDIENCE_FA: Record<string, string> = {
  accountant: "حسابدار مستقل",
  consultant: "مشاور مالی/کسب‌وکار",
  blogger: "بلاگر/تولیدکنندهٔ محتوا",
  agency: "آژانس/شرکت نرم‌افزاری",
  incubator: "شتاب‌دهنده/پرتال صنفی",
  other: "سایر",
};

const CHANNEL_FA: Record<string, string> = {
  widgets: "نصب ویجت‌های embed",
  content: "محتوا و مقاله",
  seminars: "سمینار/آموزش حضوری",
  direct: "معرفی مستقیم مشتری",
  other: "سایر",
};

const STATUS_FA: Record<string, string> = {
  NEW: "جدید",
  CONTACTED: "تماس گرفته‌شد",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
};

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(5, parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));

  const where: Prisma.PartnerRequestWhereInput = {};
  if (STATUSES.includes(status)) where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { phone: { contains: q } },
      { company: { contains: q } },
      { email: { contains: q } },
    ];
  }

  try {
    const [total, requests, byStatus] = await Promise.all([
      db.partnerRequest.count({ where }),
      db.partnerRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.partnerRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const stats = {
      total: await db.partnerRequest.count(),
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    };

    return NextResponse.json({
      success: true,
      data: {
        requests: requests.map((r) => ({
          ...r,
          audienceFa: AUDIENCE_FA[r.audience] || r.audience,
          channelFa: CHANNEL_FA[r.channel] || r.channel,
          statusFa: STATUS_FA[r.status] || r.status,
        })),
        total,
        page,
        pageSize,
        stats,
      },
    });
  } catch (err) {
    console.error("[platform/partners GET] error:", err);
    return NextResponse.json({ success: false, error: "خطا در دریافت درخواست‌ها" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  let body: { id?: unknown; status?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ success: false, error: "شناسهٔ درخواست الزامی است" }, { status: 400 });
  }

  const data: { status?: string; notes?: string } = {};
  if (typeof body.status === "string" && STATUSES.includes(body.status)) data.status = body.status;
  if (typeof body.notes === "string") data.notes = body.notes.trim().slice(0, 2000);

  if (!data.status && !data.notes) {
    return NextResponse.json({ success: false, error: "چیزی برای به‌روزرسانی نیست" }, { status: 400 });
  }

  try {
    const updated = await db.partnerRequest.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      success: true,
      data: { ...updated, statusFa: STATUS_FA[updated.status] || updated.status },
    });
  } catch {
    return NextResponse.json({ success: false, error: "درخواست یافت نشد" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json({ success: false, error: "شناسهٔ درخواست الزامی است" }, { status: 400 });
  }

  try {
    await db.partnerRequest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "درخواست یافت نشد" }, { status: 404 });
  }
}
