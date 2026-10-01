import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { nobatimeTools } from "@/lib/nobatime-ecosystem-data";
import { industries } from "@/lib/industry-data";
import { banks } from "@/lib/bank-data";
import { taxTypes } from "@/lib/tax-data";
import { cities, industryInfos } from "@/lib/city-industry-data";
import { caseStudies } from "@/lib/case-study-data";
import { seoPages } from "@/lib/seo-pages-data";
import { tutorials } from "@/lib/tutorial-data";
import { competitorAnalysis } from "@/lib/competitor-deep-analysis";

export const runtime = "nodejs";

/**
 * /sitemap.xml — نقشه‌ی سایت برای موتورهای جستجو
 *
 * شامل صفحات اصلی، بلاگ ایندکس، صفحات اکوسیستم و هر مقاله‌ی منتشرشده.
 * شامل صفحات SEO: صنایع (+FAQ)، بانک‌ها، مالیات، شهرها (+ترکیب شهر×صنعت)،
 * مقایسه، نمونه‌های موفق، آموزش‌ها و صفحات تخصصی.
 *
 * نکته سئو: lastModified صفحات غیر-بلاگ از new Date() به RELEASE_DATE ثابت
 * تغییر کرد — تاریخ «همیشه امروز» سیگنال نامعتبر برای گوگل است و باعث
 * نوسان lastmod در هر بار تولید sitemap می‌شود. تاریخ واقعی ویرایش محتوا
 * باید در همین ثابت به‌روزرسانی شود.
 */
const RELEASE_DATE = new Date("2025-08-23");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
 const SITE_URL = "https://hoosh.nobatime.ir";

 // صفحات ثابت
 const staticPages: MetadataRoute.Sitemap = [
 {
 url: SITE_URL,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 1.0,
 },
 {
 url: `${SITE_URL}/blog`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 url: `${SITE_URL}/pricing`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/features`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/ecosystem`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 // صفحات لیست SEO
 {
 url: `${SITE_URL}/industries`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/banks`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/taxes`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/calculators`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 url: `${SITE_URL}/moadian-invoice`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 // v23 — سنجش سلامت مالی (لیدمگنت ابزار رایگان)
 url: `${SITE_URL}/financial-health`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 // v24 — ماشین‌حساب بازگشت سرمایه ROI (لیدمگنت ابزار رایگان)
 url: `${SITE_URL}/roi-calculator`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 // v25 — مقایسهٔ پلن‌ها (لیدمگنت تصمیم خرید)
 url: `${SITE_URL}/compare-plans`,
 lastModified: RELEASE_DATE,
 changeFrequency: "daily",
 priority: 0.9,
 },
 {
 // v27 — دایرکتوری ویجت‌های قابل embed برای شرکا
 url: `${SITE_URL}/widgets`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 // v29 — برنامهٔ شراکت (لیدمگنت جذب شرکا)
 url: `${SITE_URL}/partners`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/glossary`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/cities`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/compare`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 // v34-5 (#15) — هاب پادکست و ویدیوهای کوتاه (مشتق از مقالات پیلار)
 url: `${SITE_URL}/podcasts`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.8,
 },
 {
 url: `${SITE_URL}/case-studies`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.7,
 },
 {
 url: `${SITE_URL}/tutorials`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.7,
 },
 {
 url: `${SITE_URL}/seo`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly",
 priority: 0.7,
 },
 ];

 // صفحات ابزارهای اکوسیستم (پویا از nobatimeTools)
 const ecosystemPages: MetadataRoute.Sitemap = nobatimeTools.map((tool) => ({
 url: `${SITE_URL}/ecosystem/${tool.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "weekly" as const,
 priority: 0.7,
 }));

 // صفحات صنایع
 const industryPages: MetadataRoute.Sitemap = industries.map((ind) => ({
 url: `${SITE_URL}/industries/${ind.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.7,
 }));

 // صفحات پرسش‌های متداول هر صنعت (/industries/{slug}/faq)
 const industryFaqPages: MetadataRoute.Sitemap = industries.map((ind) => ({
 url: `${SITE_URL}/industries/${ind.slug}/faq`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // صفحات بانکی
 const bankPages: MetadataRoute.Sitemap = banks.map((bank) => ({
 url: `${SITE_URL}/banks/${bank.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.7,
 }));

 // صفحات مالیاتی
 const taxPages: MetadataRoute.Sitemap = taxTypes.map((tax) => ({
 url: `${SITE_URL}/taxes/${tax.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.7,
 }));

 // صفحات شهری
 const cityPages: MetadataRoute.Sitemap = cities.map((city) => ({
 url: `${SITE_URL}/cities/${city.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.7,
 }));

 // صفحات ترکیب شهر × صنعت (/cities/{city}/industries/{industry})
 const cityIndustryPages: MetadataRoute.Sitemap = cities.flatMap((city) =>
 industryInfos.map((ind) => ({
 url: `${SITE_URL}/cities/${city.slug}/industries/${ind.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.5,
 }))
 );

 // صفحات مقایسه رقبا
 const comparePages: MetadataRoute.Sitemap = competitorAnalysis.map((comp) => ({
 url: `${SITE_URL}/compare/${comp.id}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // صفحات نمونه‌های موفق
 const caseStudyPages: MetadataRoute.Sitemap = caseStudies.map((cs) => ({
 url: `${SITE_URL}/case-studies/${cs.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // صفحات آموزشی
 const tutorialPages: MetadataRoute.Sitemap = tutorials.map((tut) => ({
 url: `${SITE_URL}/tutorials/${tut.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // صفحات تخصصی SEO
 const seoPagesSitemap: MetadataRoute.Sitemap = seoPages.map((sp) => ({
 url: `${SITE_URL}/seo/${sp.slug}`,
 lastModified: RELEASE_DATE,
 changeFrequency: "monthly" as const,
 priority: 0.6,
 }));

 // مقالات منتشرشده بلاگ — lastModified واقعی از updatedAt دیتابیس
 let blogPages: MetadataRoute.Sitemap = [];
 try {
 const posts = await db.blogPost.findMany({
 where: { status: "PUBLISHED" },
 select: { slug: true, updatedAt: true },
 orderBy: { publishedAt: "desc" },
 });
 blogPages = posts.map((post) => ({
 url: `${SITE_URL}/blog/${post.slug}`,
 lastModified: post.updatedAt,
 changeFrequency: "weekly" as const,
 priority: 0.7,
 }));
 } catch {
 // اگر دیتابیس در دسترس نبود، فقط صفحات ثابت را برگردان
 }

 return [
...staticPages,
...ecosystemPages,
...industryPages,
...industryFaqPages,
...bankPages,
...taxPages,
...cityPages,
...cityIndustryPages,
...comparePages,
...caseStudyPages,
...tutorialPages,
...seoPagesSitemap,
...blogPages,
 ];
}
