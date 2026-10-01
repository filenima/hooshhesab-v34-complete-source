"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
 CalendarCheck,
 Globe,
 Bot,
 Calculator,
 CalendarClock,
 CalendarDays,
 BellRing,
 CreditCard,
 BarChart3,
 Smartphone,
 LayoutTemplate,
 MousePointerClick,
 Link as LinkIcon,
 Search,
 ShoppingBag,
 FileInput,
 MessageSquareText,
 PenTool,
 LineChart,
 Workflow,
 Headphones,
 Plug,
 BookOpen,
 Package,
 ShoppingCart,
 Users,
 FileCheck,
 Sparkles,
 ArrowLeft,
 ArrowRight,
 ExternalLink,
 CheckCircle2,
 Network,
 RefreshCw,
 Zap,
 ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
 Accordion,
 AccordionItem,
 AccordionTrigger,
 AccordionContent,
} from "@/components/ui/accordion";
import {
 type NobatimeTool,
 getOtherTools,
 buildFaqJsonLd,
} from "@/lib/nobatime-ecosystem-data";

const ICON_MAP: Record<string, React.ElementType> = {
 CalendarCheck,
 Globe,
 Bot,
 Calculator,
 CalendarClock,
 CalendarDays,
 BellRing,
 CreditCard,
 BarChart3,
 Smartphone,
 LayoutTemplate,
 MousePointerClick,
 Link: LinkIcon,
 Search,
 ShoppingBag,
 FileInput,
 MessageSquareText,
 PenTool,
 LineChart,
 Workflow,
 Headphones,
 Plug,
 BookOpen,
 Package,
 ShoppingCart,
 Users,
 FileCheck,
 Sparkles,
};

const COLOR_MAP: Record<
 string,
 { bg: string; text: string; border: string; gradient: string; ring: string }
> = {
 emerald: {
 bg: "bg-emerald-500/10",
 text: "text-emerald-600 dark:text-emerald-400",
 border: "border-emerald-500/20",
 gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
 ring: "ring-emerald-500/20",
 },
 violet: {
 bg: "bg-violet-500/10",
 text: "text-violet-600 dark:text-violet-400",
 border: "border-violet-500/20",
 gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
 ring: "ring-violet-500/20",
 },
 amber: {
 bg: "bg-amber-500/10",
 text: "text-amber-600 dark:text-amber-400",
 border: "border-amber-500/20",
 gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
 ring: "ring-amber-500/20",
 },
 primary: {
 bg: "bg-primary/10",
 text: "text-primary",
 border: "border-primary/20",
 gradient: "from-primary/20 via-primary/5 to-transparent",
 ring: "ring-primary/20",
 },
};

const fadeInUp = {
 hidden: { opacity: 0, y: 24 },
 visible: (i: number) => ({
 opacity: 1,
 y: 0,
 transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
 }),
};

interface ToolPageContentProps {
 tool: NobatimeTool;
}

export function ToolPageContent({ tool }: ToolPageContentProps) {
 const IconComp = ICON_MAP[tool.icon] || Sparkles;
 const colors = COLOR_MAP[tool.color] || COLOR_MAP.primary;
 const otherTools = getOtherTools(tool.slug);

 return (
 <div dir="rtl" className="min-h-screen flex flex-col bg-background">
 {/* JSON-LD FAQ */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{
 __html: JSON.stringify(buildFaqJsonLd(tool.faq)),
 }}
 />

 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
 <div className="mx-auto w-full max-w-7xl flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
 <Link
 href="/ecosystem"
 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
 >
 <ArrowLeft className="h-4 w-4" />
 <span className="hidden sm:inline">اکوسیستم</span>
 </Link>
 <div className="flex items-center gap-2 mr-auto">
 <div
 className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.bg} ${colors.text}`}
 >
 <IconComp className="h-4 w-4" />
 </div>
 <span className="font-bold">{tool.name}</span>
 </div>
 <Link href={tool.url} target="_blank" rel="noopener noreferrer">
 <Button size="sm" variant="outline" className="gap-1.5">
 <ExternalLink className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">مشاهده سایت</span>
 </Button>
 </Link>
 </div>
 </header>

 <main className="flex-1">
 {/* Hero */}
 <section className="relative overflow-hidden py-16 sm:py-24">
 <div
 className={`absolute inset-0 bg-gradient-to-b ${colors.gradient}`}
 />
 <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="max-w-3xl">
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.6 }}
 >
 <div
 className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 ${colors.bg} ${colors.text} text-sm font-medium mb-6`}
 >
 <IconComp className="h-4 w-4" />
 {tool.url.replace("https://", "")}
 </div>
 <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
 {tool.name}
 </h1>
 <p className="mt-4 text-lg sm:text-xl text-muted-foreground leading-relaxed">
 {tool.tagline}
 </p>
 <p className="mt-3 text-base text-muted-foreground/80 leading-relaxed max-w-2xl">
 {tool.description}
 </p>
 <div className="mt-8 flex flex-col sm:flex-row items-start gap-4">
 <Link href={tool.ctaUrl} target="_blank" rel="noopener noreferrer">
 <Button size="lg" className="px-8 gap-2">
 {tool.ctaText}
 <ArrowRight className="h-4 w-4" />
 </Button>
 </Link>
 {tool.pricingNote && (
 <Badge
 variant="secondary"
 className="text-sm px-4 py-1.5 mt-2 sm:mt-0"
 >
 {tool.pricingNote}
 </Badge>
 )}
 </div>
 </motion.div>
 </div>
 </div>
 </section>

 {/* Target Audience */}
 <section className="py-8 border-b border-border/50">
 <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="flex flex-wrap items-center gap-2">
 <span className="text-sm text-muted-foreground ml-2">
 مناسب برای:
 </span>
 {tool.targetAudience.map((audience) => (
 <Badge key={audience} variant="outline" className="text-xs">
 {audience}
 </Badge>
 ))}
 </div>
 </div>
 </section>

 {/* Features Grid */}
 <section className="py-16 sm:py-20">
 <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <motion.div
 initial={{ opacity: 0 }}
 whileInView={{ opacity: 1 }}
 viewport={{ once: true }}
 className="text-center mb-12"
 >
 <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
 امکانات {tool.name}
 </h2>
 <p className="mt-3 text-muted-foreground">
 تمام ابزارهایی که برای موفقیت کسب‌وکار شما نیاز دارید
 </p>
 </motion.div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
 {tool.features.map((feature, i) => {
 const FeatureIcon = ICON_MAP[feature.icon] || CheckCircle2;
 return (
 <motion.div
 key={feature.title}
 custom={i}
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true }}
 variants={fadeInUp}
 >
 <Card className="h-full p-6 hover:shadow-md transition-shadow border-border/50">
 <div
 className={`flex h-11 w-11 items-center justify-center rounded-xl ${colors.bg} ${colors.text} mb-4`}
 >
 <FeatureIcon className="h-5 w-5" />
 </div>
 <h3 className="font-semibold text-base mb-2">
 {feature.title}
 </h3>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {feature.description}
 </p>
 </Card>
 </motion.div>
 );
 })}
 </div>
 </div>
 </section>

 {/* Benefits */}
 <section className="py-16 sm:py-20 bg-muted/30">
 <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-12">
 چرا {tool.name}؟
 </h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
 {tool.benefits.map((benefit, i) => (
 <motion.div
 key={i}
 custom={i}
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true }}
 variants={fadeInUp}
 className="flex items-start gap-3 p-4 rounded-xl bg-background/60 border border-border/30"
 >
 <CheckCircle2
 className={`h-5 w-5 shrink-0 mt-0.5 ${colors.text}`}
 />
 <span className="text-sm leading-relaxed">{benefit}</span>
 </motion.div>
 ))}
 </div>
 </div>
 </section>

 {/* FAQ */}
 <section className="py-16 sm:py-20">
 <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10">
 سوالات متداول
 </h2>
 <Accordion type="single" collapsible className="w-full">
 {tool.faq.map((item, i) => (
 <AccordionItem key={i} value={`faq-${i}`}>
 <AccordionTrigger className="text-right text-base">
 {item.question}
 </AccordionTrigger>
 <AccordionContent className="text-right text-muted-foreground leading-relaxed">
 {item.answer}
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </div>
 </section>

 {/* Other Ecosystem Tools */}
 <section className="py-16 sm:py-20 bg-muted/30">
 <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="text-center mb-12">
 <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
 سایر ابزارهای اکوسیستم
 </h2>
 <p className="mt-3 text-muted-foreground">
 {tool.name} با این ابزارها یکپارچه است
 </p>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
 {otherTools.map((otherTool, i) => {
 const OtherIcon = ICON_MAP[otherTool.icon] || Sparkles;
 const otherColors =
 COLOR_MAP[otherTool.color] || COLOR_MAP.primary;
 return (
 <motion.div
 key={otherTool.slug}
 custom={i}
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true }}
 variants={fadeInUp}
 >
 <Link
 href={`/ecosystem/${otherTool.slug}`}
 className="block h-full"
 >
 <Card className="h-full p-6 hover:shadow-md transition-all group border-border/50">
 <div
 className={`flex h-12 w-12 items-center justify-center rounded-xl ${otherColors.bg} ${otherColors.text} mb-4`}
 >
 <OtherIcon className="h-6 w-6" />
 </div>
 <h3 className="font-semibold text-lg mb-2">
 {otherTool.name}
 </h3>
 <p className="text-sm text-muted-foreground leading-relaxed mb-4">
 {otherTool.tagline}
 </p>
 <div className="flex items-center gap-1.5">
 <span
 className={`text-sm font-medium ${otherColors.text}`}
 >
 بیشتر بخوانید
 </span>
 <ArrowRight
 className={`h-3.5 w-3.5 ${otherColors.text} group-hover:translate-x-[-4px] transition-transform`}
 />
 </div>
 </Card>
 </Link>
 </motion.div>
 );
 })}
 </div>
 </div>
 </section>

 {/* CTA */}
 <section className="py-16 sm:py-20">
 <div className="mx-auto max-w-3xl px-4 text-center">
 <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
 همین حالا شروع کنید
 </h2>
 <p className="mt-3 text-muted-foreground">{tool.tagline}</p>
 <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
 <Link href={tool.ctaUrl} target="_blank" rel="noopener noreferrer">
 <Button size="lg" className="px-8 gap-2">
 {tool.ctaText}
 <ArrowRight className="h-4 w-4" />
 </Button>
 </Link>
 <Link href="/ecosystem">
 <Button size="lg" variant="outline" className="px-8">
 مشاهده تمام ابزارها
 </Button>
 </Link>
 </div>
 </div>
 </section>
 </main>

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card/50">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
 <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
 <div className="flex items-center gap-2">
 <div
 className={`flex h-5 w-5 items-center justify-center rounded ${colors.bg} ${colors.text}`}
 >
 <IconComp className="h-3 w-3" />
 </div>
 <span className="font-semibold text-foreground">
 {tool.name}
 </span>
 </div>
 <p>اکوسیستم نوباتایم — تمامی حقوق محفوظ است</p>
 </div>
 </div>
 </footer>
 </div>
 );
}
