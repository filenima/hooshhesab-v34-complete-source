import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/cms/[id]/versions?pageType=CMS|BLOG
 * - پیش‌فرض pageType=CMS
 *
 * لیست نسخه‌های ذخیره‌شده‌ی یک صفحه یا پست بلاگ. هر نسخه شامل عنوان، slug،
 * excerpt، author، تاریخ ایجاد و یک snippet از محتواست. محتوای کامل فقط
 * با فراخوانی جزئیات از نسخه‌ی خاص دریافت می‌شود.
 */
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const { searchParams } = new URL(req.url);
 const pageType = (searchParams.get("pageType") || "CMS").toUpperCase();
 const validTypes = ["CMS", "BLOG"];
 if (!validTypes.includes(pageType)) {
 return NextResponse.json(
 { success: false, error: "pageType نامعتبر است" },
 { status: 400 }
 );
 }

 const versions = await db.cmsPageVersion.findMany({
 where: { pageId: id, pageType },
 orderBy: { createdAt: "desc" },
 take: 50,
 select: {
 id: true,
 title: true,
 slug: true,
 excerpt: true,
 authorId: true,
 authorName: true,
 versionNote: true,
 createdAt: true,
 },
 });

 return NextResponse.json({
 success: true,
 data: versions.map((v) => ({
 id: v.id,
 title: v.title,
 slug: v.slug,
 excerpt: v.excerpt,
 authorId: v.authorId,
 authorName: v.authorName,
 versionNote: v.versionNote,
 createdAt: v.createdAt.toISOString(),
 })),
 count: versions.length,
 });
 } catch (error) {
 console.error("[cms-versions] GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نسخه‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/platform/cms/[id]/versions
 * Body: { pageType?: "CMS"|"BLOG", versionNote?: string }
 * یک snapshot از وضعیت فعلی صفحه/پست ذخیره می‌کند.
 */
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const body = await req.json().catch(() => ({}));
 const pageType = (body.pageType || "CMS").toUpperCase();
 const versionNote = (body.versionNote || "").slice(0, 200);

 let snapshot: {
 title: string;
 slug: string;
 content: string;
 excerpt: string | null;
 metaTitle: string | null;
 metaDescription: string | null;
 focusKeyword: string | null;
 tags: string | null;
 } | null = null;

 if (pageType === "CMS") {
 snapshot = await db.cmsPage.findUnique({
 where: { id },
 select: {
 title: true,
 slug: true,
 content: true,
 excerpt: true,
 metaTitle: true,
 metaDescription: true,
 focusKeyword: true,
 tags: true,
 },
 });
 } else if (pageType === "BLOG") {
 const post = await db.blogPost.findUnique({
 where: { id },
 select: {
 title: true,
 slug: true,
 content: true,
 excerpt: true,
 metaTitle: true,
 metaDescription: true,
 focusKeyword: true,
 tags: true,
 },
 });
 snapshot = post;
 } else {
 return NextResponse.json(
 { success: false, error: "pageType نامعتبر" },
 { status: 400 }
 );
 }

 if (!snapshot) {
 return NextResponse.json(
 { success: false, error: "صفحه/پست یافت نشد" },
 { status: 404 }
 );
 }

 const version = await db.cmsPageVersion.create({
 data: {
 pageId: id,
 pageType,
 title: snapshot.title,
 slug: snapshot.slug,
 content: snapshot.content,
 excerpt: snapshot.excerpt,
 metaTitle: snapshot.metaTitle,
 metaDescription: snapshot.metaDescription,
 focusKeyword: snapshot.focusKeyword,
 tags: snapshot.tags,
 authorId: auth.admin.id,
 authorName: auth.admin.username,
 versionNote: versionNote || null,
 },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CMS_VERSION_SAVE",
 entity: `${pageType}_VERSION`,
 entityId: version.id,
 details: JSON.stringify({ pageId: id, pageType, versionNote }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: version.id,
 createdAt: version.createdAt.toISOString(),
 title: version.title,
 },
 message: "نسخه‌ی جدید ذخیره شد",
 });
 } catch (error) {
 console.error("[cms-versions] POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره‌ی نسخه" },
 { status: 500 }
 );
 }
}
