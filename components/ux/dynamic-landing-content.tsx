"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth-fetch";
import { Sparkles, Check } from "lucide-react";

interface DynamicLandingContentProps {
 defaultRef?: string;
 defaultIndustry?: string;
 defaultSegment?: string;
}

interface LandingData {
 hero: {
 title: string;
 subtitle: string;
 cta: string;
 badge?: string;
 };
 features: Array<{ icon: string; title: string; description: string }>;
 testimonials: Array<{ name: string; role: string; quote: string; rating: number }>;
 pricing: {
 badge?: string;
 plans: Array<{
 name: string;
 price: number;
 period: string;
 features: string[];
 highlighted: boolean;
 cta: string;
 }>;
 };
 socialProof: { userCount: string; activeBusinesses: string; badge: string };
 ctaBanner: { title: string; subtitle: string; buttonText: string };
}

/**
 * کامپوننت خواندن URL params و شخصی‌سازی محتوای landing page.
 *
 * پارامترهای URL:
 * - ref: منبع ترافیک (telegram, instagram, google, direct, email)
 * - industry: صنعت کاربر (retail, services, manufacturing, contracting, accounting)
 * - segment: بخش کاربر (trial, paid, new)
 *
 * این کامپوننت محتوای شخصی‌سازی‌شده را از /api/marketing/personalized-landing
 * دریافت می‌کند و در اختیار landing page قرار می‌دهد.
 *
 * Usage:
 * const { content, loading } = useDynamicLandingContent();
 * // استفاده از content.hero.title و...
 */
export function useDynamicLandingContent(options: DynamicLandingContentProps = {}) {
 const [content, setContent] = React.useState<LandingData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [params, setParams] = React.useState({
 ref: options.defaultRef || "direct",
 industry: options.defaultIndustry || "accounting",
 segment: options.defaultSegment || "new",
 });

 React.useEffect(() => {
 // خواندن params از URL
 const url = new URL(window.location.href);
 const ref = url.searchParams.get("ref") || options.defaultRef || "direct";
 const industry = url.searchParams.get("industry") || options.defaultIndustry || "accounting";
 const segment = url.searchParams.get("segment") || options.defaultSegment || "new";

 setParams({ ref, industry, segment });

 // ذخیره در sessionStorage برای استفاده در صفحات بعدی
 try {
 sessionStorage.setItem("hoshhesab_landing_ref", ref);
 sessionStorage.setItem("hoshhesab_landing_industry", industry);
 sessionStorage.setItem("hoshhesab_landing_segment", segment);
 } catch {
 /* ignore */
 }

 // دریافت محتوا از API
 authFetch(`/api/marketing/personalized-landing?ref=${ref}&industry=${industry}&segment=${segment}`)
.then((res) => res.json())
.then((data) => {
 if (data.success) {
 setContent(data.data);
 }
 })
.catch((err) => {
 console.warn("Dynamic landing content fetch failed:", err);
 })
.finally(() => setLoading(false));
 }, [options.defaultRef, options.defaultIndustry, options.defaultSegment]);

 return { content, loading, params };
}

/**
 * badge نمایش منبع ترافیک (برای UI).
 */
export function ReferrerBadge({ ref }: { ref: string }) {
 const refLabels: Record<string, string> = {
 telegram: "ورود از کانال تلگرام",
 instagram: "ورود از اینستاگرام",
 google: "ورود از جستجوی گوگل",
 email: "ورود از ایمیل",
 direct: "ورود مستقیم",
 };

 const label = refLabels[ref] || refLabels.direct;

 return (
 <Badge variant="secondary" className="bg-primary/10 text-primary">
 <Sparkles className="h-3 w-3 ml-1" />
 {label}
 </Badge>
 );
}

/**
 * Component برای نمایش hero شخصی‌سازی‌شده.
 */
export function DynamicHero({ content }: { content: LandingData | null }) {
 if (!content) {
 return (
 <div className="animate-pulse">
 <div className="h-12 bg-muted rounded w-3/4 mb-4" />
 <div className="h-6 bg-muted rounded w-full mb-2" />
 <div className="h-6 bg-muted rounded w-5/6 mb-6" />
 </div>
 );
 }

 return (
 <>
 {content.hero.badge && (
 <Badge variant="secondary" className="bg-primary/10 text-primary mb-4">
 <Sparkles className="h-3 w-3 ml-1" />
 {content.hero.badge}
 </Badge>
 )}
 <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight">
 {content.hero.title}
 </h1>
 <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
 {content.hero.subtitle}
 </p>
 </>
 );
}

/**
 * Component برای نمایش pricing شخصی‌سازی‌شده.
 */
export function DynamicPricing({ content }: { content: LandingData | null }) {
 if (!content) return null;

 return (
 <div>
 {content.pricing.badge && (
 <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 mb-6">
 {content.pricing.badge}
 </Badge>
 )}
 <div className="grid md:grid-cols-3 gap-6">
 {content.pricing.plans.map((plan) => (
 <div
 key={plan.name}
 className={`p-6 rounded-lg border ${
 plan.highlighted
? "border-primary bg-primary/5 ring-2 ring-primary/20"
: "border-border bg-card"
 }`}
 >
 <h3 className="text-lg font-semibold mb-2">{plan.name}</h3>
 <div className="mb-4">
 <span className="text-3xl font-bold text-primary">
 {plan.price === 0? "رایگان": plan.price.toLocaleString("fa-IR")}
 </span>
 {plan.price > 0 && (
 <span className="text-sm text-muted-foreground mr-1">تومان / {plan.period}</span>
 )}
 </div>
 <ul className="space-y-2 mb-6">
 {plan.features.map((feat, i) => (
 <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
 <Check className="inline h-4 w-4 text-emerald-500 mt-0.5" />
 {feat}
 </li>
 ))}
 </ul>
 <button
 className={`w-full py-2 rounded-md text-sm font-medium transition-colors ${
 plan.highlighted
? "bg-primary text-primary-foreground hover:bg-primary/90"
: "bg-muted hover:bg-muted/80 text-foreground"
 }`}
 >
 {plan.cta}
 </button>
 </div>
 ))}
 </div>
 </div>
 );
}

export type { LandingData };
