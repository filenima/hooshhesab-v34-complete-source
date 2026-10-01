import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getSeoSettings, saveSettings, SETTING_KEYS } from "@/lib/system-settings";

export const runtime = "nodejs";

// GET /api/platform/content-seo — دریافت وضعیت محتوا و SEO
// شامل: تعداد پست‌های بلاگ، تنظیمات SEO، sitemap، robots.txt، OG، شبکه‌های اجتماعی
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const [seoSettings, postsCount, publishedPosts, recentPosts] = await Promise.all([
 getSeoSettings(),
 db.blogPost.count(),
 db.blogPost.count({ where: { status: "PUBLISHED" } }),
 db.blogPost.findMany({
 orderBy: { updatedAt: "desc" },
 take: 10,
 select: {
 id: true,
 title: true,
 slug: true,
 status: true,
 category: true,
 publishedAt: true,
 createdAt: true,
 updatedAt: true,
 metaTitle: true,
 },
 }),
 ]);

 return NextResponse.json({
 success: true,
 data: {
 seo: seoSettings,
 blog: {
 total: postsCount,
 published: publishedPosts,
 draft: postsCount - publishedPosts,
 recent: recentPosts.map((p) => ({
 id: p.id,
 title: p.title,
 slug: p.slug,
 status: p.status,
 category: p.category,
 publishedAt: p.publishedAt,
 createdAt: p.createdAt,
 updatedAt: p.updatedAt,
 hasCustomMeta:!!p.metaTitle,
 })),
 },
 },
 });
 } catch (error) {
 console.error("Content SEO GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت وضعیت محتوا" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/content-seo — به‌روزرسانی تنظیمات محتوا و SEO
// body: Partial<SeoSettings> — همان فیلدهای SEO
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const body = await req.json().catch(() => ({}));
 const updates: Array<{ key: string; value: string }> = [];

 // لیست فیلدهای قابل به‌روزرسانی (مشابه /settings/seo ولی بدون احراز اضافی)
 const fieldMap: Record<string, string> = {
 metaTitle: SETTING_KEYS.SEO_META_TITLE,
 metaDescription: SETTING_KEYS.SEO_META_DESCRIPTION,
 metaKeywords: SETTING_KEYS.SEO_META_KEYWORDS,
 gaId: SETTING_KEYS.SEO_GA_ID,
 searchConsole: SETTING_KEYS.SEO_SEARCH_CONSOLE,
 ogTitle: SETTING_KEYS.SEO_OG_TITLE,
 ogDescription: SETTING_KEYS.SEO_OG_DESCRIPTION,
 ogImage: SETTING_KEYS.SEO_OG_IMAGE,
 twitterCard: SETTING_KEYS.SEO_TWITTER_CARD,
 robotsTxt: SETTING_KEYS.SEO_ROBOTS_TXT,
 };

 for (const [field, key] of Object.entries(fieldMap)) {
 if (typeof body[field] === "string") {
 const maxLen = field === "robotsTxt"? 10000: field === "metaDescription" || field === "ogDescription"? 500: 500;
 updates.push({ key, value: String(body[field]).slice(0, maxLen) });
 }
 }
 if (typeof body.sitemapEnabled === "boolean") {
 updates.push({
 key: SETTING_KEYS.SEO_SITEMAP_ENABLED,
 value: body.sitemapEnabled? "true": "false",
 });
 }
 if (body.social && typeof body.social === "object") {
 const socialMap: Record<string, string> = {
 twitter: SETTING_KEYS.SEO_SOCIAL_TWITTER,
 linkedin: SETTING_KEYS.SEO_SOCIAL_LINKEDIN,
 instagram: SETTING_KEYS.SEO_SOCIAL_INSTAGRAM,
 telegram: SETTING_KEYS.SEO_SOCIAL_TELEGRAM,
 };
 for (const [field, key] of Object.entries(socialMap)) {
 if (typeof body.social[field] === "string") {
 updates.push({ key, value: body.social[field].trim() });
 }
 }
 }

 if (updates.length === 0) {
 return NextResponse.json(
 { success: false, error: "تغییری برای اعمال نیست" },
 { status: 400 }
 );
 }

 await saveSettings(updates);

 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "UPDATE_CONTENT_SEO",
 entity: "SystemSettings",
 details: JSON.stringify(updates.map((u) => ({ key: u.key }))),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "تنظیمات محتوا و SEO با موفقیت ذخیره شد",
 });
 } catch (error) {
 console.error("Content SEO PATCH error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره تنظیمات محتوا" },
 { status: 500 }
 );
 }
}
