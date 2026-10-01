import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/cms/[id] — دریافت یک صفحه
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const page = await db.cmsPage.findUnique({ where: { id } });
 if (!page) {
 return NextResponse.json(
 { success: false, error: "صفحه یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true, data: page });
 } catch (error) {
 console.error("[/api/platform/cms/[id]] GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت صفحه" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/cms/[id] — به‌روزرسانی
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const body = await req.json();

 const existing = await db.cmsPage.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "صفحه یافت نشد" },
 { status: 404 }
 );
 }

 const updateData: Record<string, unknown> = {};
 const fields = [
 "slug",
 "title",
 "content",
 "excerpt",
 "metaTitle",
 "metaDescription",
 "focusKeyword",
 "tags",
 "category",
 "status",
 "featuredImage",
 ];
 for (const f of fields) {
 if (body[f]!== undefined) updateData[f] = body[f];
 }

 // اگر slug تغییر کرد، یکتایی را بررسی کن
 if (typeof updateData.slug === "string" && updateData.slug!== existing.slug) {
 const conflict = await db.cmsPage.findUnique({
 where: { slug: updateData.slug },
 });
 if (conflict) {
 return NextResponse.json(
 { success: false, error: "این slug قبلاً استفاده شده" },
 { status: 409 }
 );
 }
 }

 // اگر وضعیت به PUBLISHED تغییر کرد
 if (body.status === "PUBLISHED" && existing.status!== "PUBLISHED") {
 updateData.publishedAt = new Date();
 }

 // ─── ذخیره‌ی snapshot از محتوای قبلی به‌عنوان نسخه (Page Versioning) ───
 // هر بار که صفحه به‌روزرسانی می‌شود، یک snapshot از محتوای قبلی ذخیره می‌کنیم
 // تا سوپرادمین بتواند به نسخه‌های قبلی بازگردانی کند.
 if (Object.keys(updateData).length > 0) {
 try {
 await db.cmsPageVersion.create({
 data: {
 pageId: id,
 pageType: "CMS",
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
 // خطای ذخیره‌ی نسخه نباید به‌روزرسانی را متوقف کند
 console.error("[cms PATCH] version save error:", verErr);
 }
 }

 const updated = await db.cmsPage.update({
 where: { id },
 data: updateData,
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "UPDATE_CMS_PAGE",
 entity: "CmsPage",
 entityId: id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: updated,
 message: "صفحه به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("[/api/platform/cms/[id]] PATCH error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}

// DELETE /api/platform/cms/[id]
export async function DELETE(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await params;
 const existing = await db.cmsPage.findUnique({
 where: { id },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "صفحه یافت نشد" },
 { status: 404 }
 );
 }

 await db.cmsPage.delete({ where: { id } });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "DELETE_CMS_PAGE",
 entity: "CmsPage",
 entityId: id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "صفحه حذف شد",
 });
 } catch (error) {
 console.error("[/api/platform/cms/[id]] DELETE error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف" },
 { status: 500 }
 );
 }
}
