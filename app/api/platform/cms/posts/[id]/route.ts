import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { cacheDeleteByPrefix } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/cms/posts/[id] — دریافت یک پست
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const post = await db.blogPost.findUnique({ where: { id } });
 if (!post) {
 return NextResponse.json(
 { success: false, error: "پست یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true, data: post });
 } catch {
 return NextResponse.json({ success: false, error: "خطا" }, { status: 500 });
 }
}

// PATCH /api/platform/cms/posts/[id] — به‌روزرسانی
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const body = await req.json();

 const existing = await db.blogPost.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "پست یافت نشد" },
 { status: 404 }
 );
 }

 const updateData: Record<string, unknown> = {};
 const fields = [
 "slug", "title", "excerpt", "content", "coverImage", "category",
 "status", "metaTitle", "metaDescription", "focusKeyword",
 "ogImage", "canonicalUrl", "readingTime",
 ];
 for (const f of fields) {
 if (body[f]!== undefined) updateData[f] = body[f];
 }
 if (body.tags!== undefined) {
 updateData.tags = body.tags? JSON.stringify(body.tags): null;
 }

 // اگر وضعیت به PUBLISHED تغییر کرد
 if (body.status === "PUBLISHED" && existing.status!== "PUBLISHED") {
 updateData.publishedAt = new Date();
 }

 // ─── ذخیره‌ی snapshot از محتوای قبلی به‌عنوان نسخه (Page Versioning) ───
 if (Object.keys(updateData).length > 0) {
 try {
 await db.cmsPageVersion.create({
 data: {
 pageId: id,
 pageType: "BLOG",
 title: existing.title,
 slug: existing.slug,
 content: existing.content,
 excerpt: existing.excerpt,
 metaTitle: existing.metaTitle,
 metaDescription: existing.metaDescription,
 focusKeyword: existing.focusKeyword,
 tags: existing.tags,
 authorId: auth.admin.id,
 authorName: auth.admin.username,
 versionNote: "snapshot خودکار قبل از به‌روزرسانی",
 },
 });
 } catch (verErr) {
 console.error("[blog PATCH] version save error:", verErr);
 }
 }

 const updated = await db.blogPost.update({
 where: { id },
 data: updateData,
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "UPDATE_BLOG_POST",
 entity: "BlogPost",
 entityId: id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // اگر پست منتشر شده یا به‌روزرسانی شده، کش را باطل کن
 if (updated.status === "PUBLISHED" || existing.status === "PUBLISHED") {
 cacheDeleteByPrefix("blog:list:");
 cacheDeleteByPrefix(`blog:post:${existing.slug}`);
 if (typeof updateData.slug === "string" && updateData.slug!== existing.slug) {
 cacheDeleteByPrefix(`blog:post:${updateData.slug}`);
 }
 }

 return NextResponse.json({
 success: true,
 data: updated,
 message: "پست به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Update post error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}

// DELETE /api/platform/cms/posts/[id]
export async function DELETE(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 // slug را برای باطل کردن کش دقیق نگه می‌داریم
 const existing = await db.blogPost.findUnique({ where: { id }, select: { slug: true, status: true } });
 await db.blogPost.delete({ where: { id } });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "DELETE_BLOG_POST",
 entity: "BlogPost",
 entityId: id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // اگر پست منتشرشده بود، کش را باطل کن
 if (existing?.status === "PUBLISHED") {
 cacheDeleteByPrefix("blog:list:");
 if (existing.slug) cacheDeleteByPrefix(`blog:post:${existing.slug}`);
 }

 return NextResponse.json({
 success: true,
 message: "پست حذف شد",
 });
 } catch {
 return NextResponse.json(
 { success: false, error: "خطا در حذف" },
 { status: 500 }
 );
 }
}
