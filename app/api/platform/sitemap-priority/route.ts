import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

// GET /api/platform/sitemap-priority — دریافت اولویت صفحات sitemap
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 // خواندن اولویت‌های ذخیره شده از SeoMeta (در صورت وجود)
 const seoMetas = await db.seoMeta.findMany({
 select: { page: true, title: true, description: true, ogImage: true },
 });

 const defaultPages = [
 { url: "/", priority: "1.0", changefreq: "daily" },
 { url: "/pricing", priority: "0.9", changefreq: "weekly" },
 { url: "/blog", priority: "0.8", changefreq: "daily" },
 { url: "/support", priority: "0.6", changefreq: "monthly" },
 { url: "/legal", priority: "0.4", changefreq: "yearly" },
 ];

 const pages = defaultPages.map((p) => {
 const meta = seoMetas.find((m) => m.page === p.url);
 return {
...p,
 metaTitle: meta?.title || null,
 metaDescription: meta?.description || null,
 ogImage: meta?.ogImage || null,
 };
 });

 return NextResponse.json({
 success: true,
 data: { pages },
 });
 } catch (error) {
 console.error("Sitemap priority GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت اولویت‌ها" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/sitemap-priority — به‌روزرسانی اولویت یک صفحه
// body: { page: "/", priority: "1.0", changefreq: "daily", title?, description? }
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const { page, priority, changefreq, title, description } = body as {
 page?: string;
 priority?: string;
 changefreq?: string;
 title?: string;
 description?: string;
 };

 if (!page) {
 return NextResponse.json(
 { success: false, error: "مسیر صفحه الزامی است" },
 { status: 400 }
 );
 }

 // در SeoMeta ذخیره می‌کنیم (آپسرت)
 const updateData: Record<string, unknown> = {};
 if (typeof title === "string") updateData.title = title;
 if (typeof description === "string") updateData.description = description;

 if (Object.keys(updateData).length > 0) {
 await db.seoMeta.upsert({
 where: { page },
 create: {
 page,
 title: title || null,
 description: description || null,
 },
 update: updateData,
 });
 }

 // ثبت در پلتفرم AuditLog
 await db.platformAuditLog.create({
 data: {
 action: "UPDATE",
 entity: "Sitemap",
 entityId: page,
 details: JSON.stringify({
 page,
 priority,
 changefreq,
 title,
 description,
 updatedAt: new Date().toISOString(),
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "اولویت صفحه به‌روزرسانی شد",
 data: { page, priority, changefreq },
 });
 } catch (error) {
 console.error("Sitemap priority PATCH error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}
