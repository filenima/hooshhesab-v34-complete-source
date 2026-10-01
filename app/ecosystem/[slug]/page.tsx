import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { nobatimeTools, getToolBySlug } from "@/lib/nobatime-ecosystem-data";
import { SITE_URL } from "@/lib/seo";
import { ToolPageContent } from "./tool-page-content";

export function generateStaticParams() {
 return nobatimeTools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
 params,
}: {
 params: Promise<{ slug: string }>;
}): Promise<Metadata> {
 const { slug } = await params;
 const tool = getToolBySlug(slug);
 if (!tool) return {};

 return {
 // نکته سئو: عنوان کوتاه بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 title: `${tool.name} | ${tool.tagline}`,
 description: tool.description,
 keywords: tool.keywords,
 alternates: {
 canonical: `${SITE_URL}/ecosystem/${tool.slug}`,
 },
 openGraph: {
 title: `${tool.name} — ${tool.tagline}`,
 description: tool.description,
 url: `${SITE_URL}/ecosystem/${tool.slug}`,
 siteName: "هوش",
 type: "website",
 locale: "fa_IR",
 images: [
 {
 url: "/og-image.png",
 width: 1200,
 height: 630,
 alt: `${tool.name} — ${tool.tagline}`,
 type: "image/png",
 },
 ],
 },
 twitter: {
 card: "summary_large_image",
 title: `${tool.name} — ${tool.tagline}`,
 description: tool.description,
 images: ["/og-image.png"],
 },
 };
}

export default async function ToolPage({
 params,
}: {
 params: Promise<{ slug: string }>;
}) {
 const { slug } = await params;
 const tool = getToolBySlug(slug);
 if (!tool) notFound();

 return <ToolPageContent tool={tool} />;
}
