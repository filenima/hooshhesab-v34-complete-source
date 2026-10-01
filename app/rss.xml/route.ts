import { db } from "@/lib/db";
import { getBrandName } from "@/lib/brand-interpolate";

export const runtime = "nodejs";

// GET /rss.xml — تولید RSS Feed
export async function GET() {
 try {
 const posts = await db.blogPost.findMany({
 where: { status: "PUBLISHED" },
 orderBy: { publishedAt: "desc" },
 take: 20,
 select: {
 slug: true,
 title: true,
 excerpt: true,
 content: true,
 publishedAt: true,
 category: true,
 },
 });

 const baseUrl = "https://hoosh.nobatime.ir";

 const items = posts
.map(
 (post) => ` <item>
 <title><![CDATA[${post.title}]]></title>
 <link>${baseUrl}/blog/${post.slug}</link>
 <guid isPermaLink="true">${baseUrl}/blog/${post.slug}</guid>
 <description><![CDATA[${post.excerpt || ""}]]></description>
 <category>${post.category}</category>
 <pubDate>${post.publishedAt?.toUTCString() || new Date().toUTCString()}</pubDate>
 </item>`
 )
.join("\n");

 const brand = await getBrandName();
 const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
 <channel>
 <title>بلاگ ${brand} — نرم‌افزار حسابداری هوشمند</title>
 <link>${baseUrl}/blog</link>
 <description>آموزش حسابداری، مالیات، حقوق و دستمزد و نکات کسب‌وکار</description>
 <language>fa-IR</language>
 <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
${items}
 </channel>
</rss>`;

 return new Response(xml, {
 headers: {
 "Content-Type": "application/rss+xml; charset=utf-8",
 "Cache-Control": "public, max-age=3600",
 },
 });
 } catch (error) {
 console.error("RSS error:", error);
 return new Response("Error generating RSS feed", { status: 500 });
 }
}
