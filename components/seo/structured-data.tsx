import * as React from "react";
import { db } from "@/lib/db";
import {
 generateOrganizationSchema,
 generateWebSiteSchema,
 generateSoftwareApplicationSchema,
 generateLocalBusinessSchema,
 generateProductSchema,
 generateSpeakableSchema,
} from "@/lib/seo";

interface StructuredDataProps {
 /**
 * اسکیماهای اضافی که فقط در صفحات خاص باید تزریق شوند (مثلاً Article یا FAQPage).
 * پیش‌فرض: فقط Organization + WebSite + SoftwareApplication + LocalBusiness.
 *
 * نکته سئو: FAQPage به‌صورت سراسری تزریق نمی‌شود — هر صفحه فقط FAQ خودش را
 * از طریق extraSchemas یا <JsonLd> اختصاصی خودش می‌گیرد (صفحه اصلی: app/page.tsx).
 */
 extraSchemas?: object[];
}

/**
 * دریافت آمار واقعی نظرات تاییدشده از دیتابیس (برای AggregateRating واقعی).
 * SEO SAFETY: امتیاز فیک در schema.org خطر جریمه گوگل (rich snippet spam) دارد —
 * اینجا فقط نظرات تاییدشده‌ی واقعی شمرده می‌شوند. اگر نظری نبود،
 * aggregateRating حذف می‌شود تا ریسک صفر باشد.
 */
async function getRealRating() {
 try {
 const agg = await db.siteTestimonial.aggregate({
 where: { status: "APPROVED" },
 _avg: { rating: true },
 _count: { _all: true },
 });
 const count = agg._count._all;
 if (count < 3) return null; // حداقل ۳ نظر واقعی برای نمایش ستاره
 return {
 ratingValue: Math.round((agg._avg.rating?? 5) * 10) / 10,
 reviewCount: count,
 };
 } catch {
 return null;
 }
}

/** نظرات برتر تاییدشده برای schema.org Review (حداکثر ۵ نظر شاخص) */
async function getTopReviews() {
 try {
 const items = await db.siteTestimonial.findMany({
 where: { status: "APPROVED" },
 orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
 take: 5,
 select: { name: true, rating: true, content: true, role: true, company: true, createdAt: true },
 });
 return items;
 } catch {
 return [];
 }
}

/**
 * StructuredData — تزریق JSON-LD ساختاریافته سراسری (async server component)
 *
 * شامل:
 * - Organization — اطلاعات سازمانی هوش
 * - WebSite — با SearchAction (برای جستجوی سایت در Google)
 * - SoftwareApplication — با AggregateRating واقعی از دیتابیس (ستاره گوگل)
 * - Review — نظرات واقعی تاییدشده (rich snippet)
 * - LocalBusiness
 */
export async function StructuredData({ extraSchemas = [] }: StructuredDataProps) {
 // آماده‌سازی SoftwareApplication با امتیاز واقعی
 const software = generateSoftwareApplicationSchema() as Record<string, unknown>;

 const [rating, reviews] = await Promise.all([getRealRating(), getTopReviews()]);

 if (rating) {
 // امتیاز واقعی جایگزین مقادیر placeholder می‌شود
 software.aggregateRating = {
 "@type": "AggregateRating",
 ratingValue: String(rating.ratingValue),
 reviewCount: String(rating.reviewCount),
 bestRating: "5",
 worstRating: "1",
 };
 } else {
 // بدون حداقل ۳ نظر واقعی، امتیاد را کامل حذف کن (سئوی امن)
 delete software.aggregateRating;
 }

 // نظرات واقعی schema.org Review
 const reviewSchemas = reviews.slice(0, 5).map((r) => ({
 "@type": "Review",
 reviewRating: {
 "@type": "Rating",
 ratingValue: String(r.rating),
 bestRating: "5",
 worstRating: "1",
 },
 author: {
 "@type": "Person",
 name: r.name,
 jobTitle: r.role || undefined,
 affiliation: r.company
? { "@type": "Organization", name: r.company }
: undefined,
 },
 reviewBody: r.content,
 datePublished: r.createdAt.toISOString(),
 itemReviewed: { "@id": `${"https://hoosh.nobatime.ir"}/#software` },
 }));

 if (reviewSchemas.length > 0) {
 software.review = reviewSchemas;
 }

 const schemas = [
 generateOrganizationSchema(),
 generateWebSiteSchema(),
 software,
 generateLocalBusinessSchema(),
 // سئو: Product با قیمت مؤثر پلن‌ها (ویرایش سوپرادمین — FIX 9-a) + Speakable برای جستجوی صوتی
 await generateProductSchema(),
 generateSpeakableSchema(),
...extraSchemas,
 ];

 return (
 <>
 {schemas.map((schema, i) => (
 <script
 key={i}
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
 />
 ))}
 </>
 );
}

/**
 * JsonLd — کامپوننت کمکی برای تزریق یک اسکیمای منفرد
 */
export function JsonLd({ data }: { data: object }) {
 return (
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
 />
 );
}
