import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 getSeoSettings,
 saveSettings,
 SETTING_KEYS,
 type SeoSettings,
} from "@/lib/system-settings";

export const runtime = "nodejs";

// GET /api/platform/settings/seo — دریافت تنظیمات SEO
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const settings = await getSeoSettings();
 return NextResponse.json({ success: true, data: settings });
 } catch (error) {
 console.error("SEO settings GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تنظیمات SEO" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/settings/seo — به‌روزرسانی تنظیمات SEO
// body: Partial<SeoSettings>
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const body = (await req.json().catch(() => ({}))) as Partial<SeoSettings>;
 const updates: Array<{ key: string; value: string }> = [];

 if (typeof body.metaTitle === "string") {
 updates.push({ key: SETTING_KEYS.SEO_META_TITLE, value: body.metaTitle.trim().slice(0, 200) });
 }
 if (typeof body.metaDescription === "string") {
 updates.push({ key: SETTING_KEYS.SEO_META_DESCRIPTION, value: body.metaDescription.trim().slice(0, 500) });
 }
 if (typeof body.metaKeywords === "string") {
 updates.push({ key: SETTING_KEYS.SEO_META_KEYWORDS, value: body.metaKeywords.trim().slice(0, 500) });
 }
 if (typeof body.gaId === "string") {
 updates.push({ key: SETTING_KEYS.SEO_GA_ID, value: body.gaId.trim().slice(0, 50) });
 }
 if (typeof body.searchConsole === "string") {
 updates.push({ key: SETTING_KEYS.SEO_SEARCH_CONSOLE, value: body.searchConsole.trim().slice(0, 200) });
 }
 if (typeof body.ogTitle === "string") {
 updates.push({ key: SETTING_KEYS.SEO_OG_TITLE, value: body.ogTitle.trim().slice(0, 200) });
 }
 if (typeof body.ogDescription === "string") {
 updates.push({ key: SETTING_KEYS.SEO_OG_DESCRIPTION, value: body.ogDescription.trim().slice(0, 500) });
 }
 if (typeof body.ogImage === "string") {
 updates.push({ key: SETTING_KEYS.SEO_OG_IMAGE, value: body.ogImage.trim().slice(0, 1000) });
 }
 if (typeof body.twitterCard === "string") {
 updates.push({ key: SETTING_KEYS.SEO_TWITTER_CARD, value: body.twitterCard });
 }
 if (typeof body.robotsTxt === "string") {
 updates.push({ key: SETTING_KEYS.SEO_ROBOTS_TXT, value: body.robotsTxt.slice(0, 10000) });
 }
 if (typeof body.sitemapEnabled === "boolean") {
 updates.push({
 key: SETTING_KEYS.SEO_SITEMAP_ENABLED,
 value: body.sitemapEnabled? "true": "false",
 });
 }
 if (body.social && typeof body.social === "object") {
 if (typeof body.social.twitter === "string") {
 updates.push({ key: SETTING_KEYS.SEO_SOCIAL_TWITTER, value: body.social.twitter.trim() });
 }
 if (typeof body.social.linkedin === "string") {
 updates.push({ key: SETTING_KEYS.SEO_SOCIAL_LINKEDIN, value: body.social.linkedin.trim() });
 }
 if (typeof body.social.instagram === "string") {
 updates.push({ key: SETTING_KEYS.SEO_SOCIAL_INSTAGRAM, value: body.social.instagram.trim() });
 }
 if (typeof body.social.telegram === "string") {
 updates.push({ key: SETTING_KEYS.SEO_SOCIAL_TELEGRAM, value: body.social.telegram.trim() });
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
 action: "UPDATE_SEO_SETTINGS",
 entity: "SystemSettings",
 details: JSON.stringify(updates.map((u) => ({ key: u.key }))),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 message: "تنظیمات SEO با موفقیت ذخیره شد",
 });
 } catch (error) {
 console.error("SEO settings PATCH error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره تنظیمات SEO" },
 { status: 500 }
 );
 }
}
