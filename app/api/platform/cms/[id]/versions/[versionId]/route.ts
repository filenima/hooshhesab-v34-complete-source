import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/cms/[id]/versions/[versionId]?pageType=CMS|BLOG
 * - محتوای کامل یک نسخه‌ی خاص را برمی‌گرداند.
 */
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string; versionId: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id, versionId } = await params;
 const { searchParams } = new URL(req.url);
 const pageType = (searchParams.get("pageType") || "CMS").toUpperCase();

 const version = await db.cmsPageVersion.findUnique({
 where: { id: versionId },
 });

 if (!version || version.pageId!== id || version.pageType!== pageType) {
 return NextResponse.json(
 { success: false, error: "نسخه یافت نشد" },
 { status: 404 }
 );
 }

 return NextResponse.json({
 success: true,
 data: {
 id: version.id,
 pageId: version.pageId,
 pageType: version.pageType,
 title: version.title,
 slug: version.slug,
 content: version.content,
 excerpt: version.excerpt,
 metaTitle: version.metaTitle,
 metaDescription: version.metaDescription,
 focusKeyword: version.focusKeyword,
 tags: version.tags,
 authorId: version.authorId,
 authorName: version.authorName,
 versionNote: version.versionNote,
 createdAt: version.createdAt.toISOString(),
 },
 });
 } catch (error) {
 console.error("[cms-version-detail] GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نسخه" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/platform/cms/[id]/versions/[versionId]?pageType=CMS|BLOG
 * - rollback: محتوای صفحه/پست را به نسخه‌ی ذخیره‌شده بازگردانی می‌کند.
 * - قبل از بازگردانی، یک snapshot از وضعیت فعلی هم ذخیره می‌شود.
 */
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ id: string; versionId: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id, versionId } = await params;
 const { searchParams } = new URL(req.url);
 const pageType = (searchParams.get("pageType") || "CMS").toUpperCase();

 const version = await db.cmsPageVersion.findUnique({
 where: { id: versionId },
 });

 if (!version || version.pageId!== id || version.pageType!== pageType) {
 return NextResponse.json(
 { success: false, error: "نسخه یافت نشد" },
 { status: 404 }
 );
 }

 // 1. ذخیره‌ی snapshot از وضعیت فعلی قبل از rollback
 let current: {
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
 current = await db.cmsPage.findUnique({
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
 } else {
 current = await db.blogPost.findUnique({
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
 }

 if (current) {
 await db.cmsPageVersion.create({
 data: {
 pageId: id,
 pageType,
 title: current.title,
 slug: current.slug,
 content: current.content,
 excerpt: current.excerpt,
 metaTitle: current.metaTitle,
 metaDescription: current.metaDescription,
 focusKeyword: current.focusKeyword,
 tags: current.tags,
 authorId: auth.admin.id,
 authorName: auth.admin.username,
 versionNote: `Snapshot قبل از rollback به نسخه‌ی ${versionId.slice(-6)}`,
 },
 });
 }

 // 2. اعمال محتوای نسخه‌ی هدف روی صفحه/پست
 const restoreData = {
 title: version.title,
 slug: version.slug,
 content: version.content,
 excerpt: version.excerpt,
 metaTitle: version.metaTitle,
 metaDescription: version.metaDescription,
 focusKeyword: version.focusKeyword,
 tags: version.tags,
 };

 if (pageType === "CMS") {
 await db.cmsPage.update({ where: { id }, data: restoreData });
 } else {
 await db.blogPost.update({ where: { id }, data: restoreData });
 }

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CMS_VERSION_ROLLBACK",
 entity: `${pageType}_VERSION`,
 entityId: versionId,
 details: JSON.stringify({ pageId: id, pageType, fromTitle: current?.title }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: `محتوا به نسخه‌ی «${version.title}» بازگردانی شد`,
 data: { restoredFrom: versionId, restoredAt: new Date().toISOString() },
 });
 } catch (error) {
 console.error("[cms-version-rollback] POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بازگردانی نسخه" },
 { status: 500 }
 );
 }
}
