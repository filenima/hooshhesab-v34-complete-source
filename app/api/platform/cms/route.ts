import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/cms — لیست همه صفحات CMS با جستجو و فیلتر
// Query params:?q=search&status=PUBLISHED&category=legal&page=1&pageSize=20
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const q = (searchParams.get("q") || "").trim();
 const status = searchParams.get("status"); // DRAFT | PUBLISHED | ARCHIVED
 const category = searchParams.get("category");
 const page = Math.max(1, Number(searchParams.get("page") || 1));
 const pageSize = Math.min(
 100,
 Math.max(1, Number(searchParams.get("pageSize") || 50))
 );

 const where: Record<string, unknown> = {};
 if (status) where.status = status;
 if (category) where.category = category;
 if (q) {
 where.OR = [
 { title: { contains: q } },
 { slug: { contains: q } },
 { excerpt: { contains: q } },
 ];
 }

 const [pages, total] = await Promise.all([
 db.cmsPage.findMany({
 where,
 orderBy: { updatedAt: "desc" },
 skip: (page - 1) * pageSize,
 take: pageSize,
 }),
 db.cmsPage.count({ where }),
 ]);

 return NextResponse.json({
 success: true,
 data: pages,
 pagination: {
 page,
 pageSize,
 total,
 totalPages: Math.ceil(total / pageSize),
 },
 });
 } catch (error) {
 console.error("[/api/platform/cms] GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت صفحات" },
 { status: 500 }
 );
 }
}

// POST /api/platform/cms — ایجاد صفحه CMS جدید
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const {
 slug,
 title,
 content,
 excerpt,
 metaTitle,
 metaDescription,
 focusKeyword,
 tags,
 category,
 status = "DRAFT",
 featuredImage,
 } = body;

 if (!slug ||!title ||!content) {
 return NextResponse.json(
 { success: false, error: "slug، عنوان و محتوا الزامی است" },
 { status: 400 }
 );
 }

 // بررسی یکتایی slug
 const existing = await db.cmsPage.findUnique({ where: { slug } });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "این slug قبلاً استفاده شده" },
 { status: 409 }
 );
 }

 const page = await db.cmsPage.create({
 data: {
 slug,
 title,
 content,
 excerpt: excerpt || null,
 metaTitle: metaTitle || null,
 metaDescription: metaDescription || null,
 focusKeyword: focusKeyword || null,
 tags: tags || null,
 category: category || null,
 status,
 featuredImage: featuredImage || null,
 publishedAt: status === "PUBLISHED"? new Date(): null,
 authorId: auth.admin.id,
 },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CREATE_CMS_PAGE",
 entity: "CmsPage",
 entityId: page.id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: page,
 message: "صفحه ایجاد شد",
 });
 } catch (error) {
 console.error("[/api/platform/cms] POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد صفحه" },
 { status: 500 }
 );
 }
}
