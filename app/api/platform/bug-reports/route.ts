import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { signUploadUrl } from "@/lib/secure-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت گزارش‌های باگ (پنل سوپرادمین) ============
// GET /api/platform/bug-reports?status=OPEN&severity=high&page=1
//    — فهرست گزارش‌ها با اطلاعات کاربر + آمار
// PATCH /api/platform/bug-reports/[id] — در فایل [id]/route.ts

export async function GET(req: NextRequest) {
 try {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const { searchParams } = new URL(req.url);
 const statusFilter = searchParams.get("status") || "";
 const severityFilter = searchParams.get("severity") || "";
 const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
 const pageSize = Math.min(50, Math.max(10, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

 const where: Record<string, unknown> = {};
 if (statusFilter) where.status = statusFilter;
 if (severityFilter) where.severity = severityFilter;

 const [reports, total, stats] = await Promise.all([
 db.bugReport.findMany({
 where,
 orderBy: { createdAt: "desc" },
 skip: (page - 1) * pageSize,
 take: pageSize,
 include: {
 user: {
 select: {
 id: true,
 name: true,
 email: true,
 username: true,
 tenantId: true,
 tenant: { select: { id: true, name: true, plan: true, status: true } },
 },
 },
 },
 }),
 db.bugReport.count({ where }),
 db.bugReport.groupBy({
 by: ["status"],
 _count: { _all: true },
 }),
 ]);

 // URL امضاشده اسکرین‌شات‌ها (۶ ساعت برای بررسی راحت)
 const data = reports.map((r) => ({
 id: r.id,
 title: r.title,
 description: r.description,
 module: r.module,
 severity: r.severity,
 status: r.status,
 adminNote: r.adminNote,
 reviewedAt: r.reviewedAt,
 reviewedBy: r.reviewedBy,
 rewardGranted: r.rewardGranted,
 rewardLicenseId: r.rewardLicenseId,
 createdAt: r.createdAt,
 screenshotUrl: r.screenshot ? signUploadUrl(r.screenshot, 6 * 3600) : null,
 user: r.user,
 }));

 const statsMap: Record<string, number> = { OPEN: 0, IN_REVIEW: 0, APPROVED: 0, REJECTED: 0, FIXED: 0 };
 for (const s of stats) {
 statsMap[s.status] = s._count._all;
 }

 return NextResponse.json({
 success: true,
 data,
 pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
 stats: {
 ...statsMap,
 total: Object.values(statsMap).reduce((a: number, b: number) => a + b, 0),
 rewardedCount: statsMap.APPROVED,
 },
 });
 } catch (error) {
 console.error("Platform bug reports list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گزارش‌های باگ" },
 { status: 500 }
 );
 }
}
