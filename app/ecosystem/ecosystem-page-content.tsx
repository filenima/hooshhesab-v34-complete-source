"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
 CalendarCheck,
 Globe,
 Bot,
 Calculator,
 ArrowLeft,
 ExternalLink,
 ArrowRight,
 Sparkles,
 CheckCircle2,
 Zap,
 Network,
 RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
 nobatimeTools,
 buildItemListJsonLd,
 type NobatimeTool,
} from "@/lib/nobatime-ecosystem-data";

const ICON_MAP: Record<string, React.ElementType> = {
 CalendarCheck,
 Globe,
 Bot,
 Calculator,
};

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
 emerald: {
 bg: "bg-emerald-500/10",
 text: "text-emerald-600 dark:text-emerald-400",
 border: "border-emerald-500/20",
 gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
 },
 violet: {
 bg: "bg-violet-500/10",
 text: "text-violet-600 dark:text-violet-400",
 border: "border-violet-500/20",
 gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
 },
 amber: {
 bg: "bg-amber-500/10",
 text: "text-amber-600 dark:text-amber-400",
 border: "border-amber-500/20",
 gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
 },
 primary: {
 bg: "bg-primary/10",
 text: "text-primary",
 border: "border-primary/20",
 gradient: "from-primary/20 via-primary/5 to-transparent",
 },
};

const fadeInUp = {
 hidden: { opacity: 0, y: 24 },
 visible: (i: number) => ({
 opacity: 1,
 y: 0,
 transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
 }),
};

export function EcosystemPageContent() {
 return (
 <div dir="rtl" className="min-h-screen flex flex-col bg-background">
 {/* JSON-LD */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(buildItemListJsonLd()) }}
 />

 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
 <div className="mx-auto w-full max-w-7xl flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
 <Link
 href="/"
 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
 >
 <ArrowLeft className="h-4 w-4" />
 <span className="hidden sm:inline">بازگشت</span>
 </Link>
 <div className="flex items-center gap-2 mr-auto">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-4 w-4" />
 </div>
 <span className="font-bold">اکوسیستم نوباتایم</span>
 </div>
 </div>
 </header>

 <main className="flex-1">
 {/* Hero */}
 <section className="relative overflow-hidden py-20 sm:py-28">
 <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
 <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
 <div className="relative aspect-[16/7] w-full max-w-4xl mx-auto overflow-hidden rounded-xl mb-8">
 <Image src="/images/ecosystem-nobatime.webp" alt="اکوسیستم نوباتایم — ابزارهای یکپارچه کسب‌وکار" fill className="object-cover" sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
 </div>
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.6 }}
 >
 <Badge variant="secondary" className="mb-4 text-sm px-4 py-1">
 <Network className="h-3.5 w-3.5 ml-1.5" />
 یکپارچه و قدرتمند
 </Badge>
 <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
 اکوسیستم نوباتایم
 </h1>
 <p className="mt-4 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
 تمام ابزارهای کسب‌وکار شما در یک پلتفرم — از نوبت‌دهی و وبسایت
 تا هوش مصنوعی و حسابداری
 </p>
 </motion.div>
 </div>
 </section>

 {/* Tool Cards */}
 <section className="py-12 sm:py-16">
 <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
 {nobatimeTools.map((tool, i) => (
 <ToolCard key={tool.slug} tool={tool} index={i} />
 ))}
 </div>
 </div>
 </section>

 {/* Integration Diagram */}
 <section className="py-16 sm:py-20 bg-muted/30">
 <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <motion.div
 initial={{ opacity: 0 }}
 whileInView={{ opacity: 1 }}
 viewport={{ once: true }}
 transition={{ duration: 0.6 }}
 className="text-center mb-12"
 >
 <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
 همه ابزارها به هم متصل هستند
 </h2>
 <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
 داده‌ها بین ابزارها جریان دارند — نوبت‌ها به حسابداری، وبسایت به
 نوبت‌دهی، و AI همه را تحلیل می‌کند
 </p>
 </motion.div>

 <IntegrationDiagram />
 </div>
 </section>

 {/* Benefits of Integration */}
 <section className="py-16 sm:py-20">
 <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-12">
 مزای استفاده از اکوسیستم یکپارچه
 </h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
 {[
 {
 icon: RefreshCw,
 title: "همگام‌سازی خودکار",
 desc: "داده‌ها بین تمام ابزارها به‌صورت آنی همگام می‌شوند — بدون نیاز به واردات دستی",
 },
 {
 icon: Zap,
 title: "اتوماسیون فرآیندها",
 desc: "از نوبت‌دهی تا صورتحساب — تمام فرآیندها به‌صورت خودکار به هم متصل هستند",
 },
 {
 icon: Sparkles,
 title: "تحلیل هوشمند یکپارچه",
 desc: "AI Agent داده‌های همه ابزارها را تحلیل می‌کند و بینش‌های ارزشمند ارائه می‌دهد",
 },
 {
 icon: Network,
 title: "مدیریت متمرکز",
 desc: "یک داشبورد برای مدیریت تمام ابزارها — کاربران، دسترسی‌ها و تنظیمات",
 },
 {
 icon: CheckCircle2,
 title: "داده‌های یکپارچه",
 desc: "مشتری یکپارچه در تمام سرویس‌ها — از نوبت تا حسابداری تا وبسایت",
 },
 {
 icon: ExternalLink,
 title: "API باز",
 desc: "تمام ابزارها دارای API مستندسازی‌شده برای اتصال به سرویس‌های خارجی",
 },
 ].map((item, i) => (
 <motion.div
 key={i}
 custom={i}
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true }}
 variants={fadeInUp}
 >
 <Card className="h-full p-6 hover:shadow-md transition-shadow border-border/50">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
 <item.icon className="h-5 w-5" />
 </div>
 <h3 className="font-semibold text-base mb-2">{item.title}</h3>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {item.desc}
 </p>
 </Card>
 </motion.div>
 ))}
 </div>
 </div>
 </section>

 {/* CTA */}
 <section className="py-16 sm:py-20 bg-muted/30">
 <div className="mx-auto max-w-3xl px-4 text-center">
 <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
 کسب‌وکار خود را قدرتمند کنید
 </h2>
 <p className="mt-3 text-muted-foreground">
 با اکوسیستم نوباتایم، تمام ابزارهای مورد نیاز شما در یک جا هستند
 </p>
 <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
 <Link href="/ecosystem/hoosh">
 <Button size="lg" className="px-8">
 شروع با هوش
 </Button>
 </Link>
 <Link href="/ecosystem/nobatime">
 <Button size="lg" variant="outline" className="px-8">
 شروع با نوباتایم
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
 <Sparkles className="h-4 w-4 text-primary" />
 <span className="font-semibold text-foreground">اکوسیستم نوباتایم</span>
 </div>
 <p>تمامی حقوق محفوظ است — نوباتایم</p>
 </div>
 </div>
 </footer>
 </div>
 );
}

function ToolCard({ tool, index }: { tool: NobatimeTool; index: number }) {
 const IconComp = ICON_MAP[tool.icon] || Sparkles;
 const colors = COLOR_MAP[tool.color] || COLOR_MAP.primary;

 return (
 <motion.div
 custom={index}
 initial="hidden"
 whileInView="visible"
 viewport={{ once: true }}
 variants={fadeInUp}
 >
 <Link href={`/ecosystem/${tool.slug}`} className="block h-full">
 <Card className="h-full overflow-hidden hover:shadow-lg transition-all duration-300 group border-border/50">
 {/* Gradient top border */}
 <div className={`h-1 w-full bg-gradient-to-l ${colors.gradient}`} />
 <CardHeader className="pb-2">
 <div className="flex items-start justify-between gap-3">
 <div
 className={`flex h-12 w-12 items-center justify-center rounded-xl ${colors.bg} ${colors.text} shrink-0`}
 >
 <IconComp className="h-6 w-6" />
 </div>
 <div className="flex-1">
 <CardTitle className="text-xl">{tool.name}</CardTitle>
 <CardDescription className="mt-1 text-xs">
 {tool.url}
 </CardDescription>
 </div>
 <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-[-4px] transition-all shrink-0 mt-1" />
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 <p className="text-sm text-muted-foreground leading-relaxed mb-4">
 {tool.description}
 </p>
 <div className="flex flex-wrap gap-2 mb-4">
 {tool.features.slice(0, 3).map((f) => (
 <Badge
 key={f.title}
 variant="secondary"
 className="text-xs font-normal"
 >
 {f.title}
 </Badge>
 ))}
 {tool.features.length > 3 && (
 <Badge variant="outline" className="text-xs">
 +{tool.features.length - 3}
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-2">
 <span className={`text-sm font-medium ${colors.text}`}>
 {tool.ctaText}
 </span>
 <ArrowRight className={`h-3.5 w-3.5 ${colors.text}`} />
 </div>
 </CardContent>
 </Card>
 </Link>
 </motion.div>
 );
}

function IntegrationDiagram() {
 const tools = nobatimeTools;
 const colors = ["emerald", "violet", "amber", "primary"] as const;

 return (
 <div className="relative max-w-2xl mx-auto">
 {/* Center hub */}
 <div className="flex items-center justify-center mb-8">
 <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
 <RefreshCw className="h-8 w-8" />
 </div>
 </div>
 <p className="text-center text-sm text-muted-foreground mb-8">
 داده‌ها از طریق API و Webhooks بین تمام سرویس‌ها جریان دارند
 </p>

 {/* Connections grid */}
 <div className="grid grid-cols-2 gap-4">
 {tools.map((tool, i) => {
 const IconComp = ICON_MAP[tool.icon] || Sparkles;
 const c = COLOR_MAP[colors[i]] || COLOR_MAP.primary;
 return (
 <motion.div
 key={tool.slug}
 initial={{ opacity: 0, scale: 0.9 }}
 whileInView={{ opacity: 1, scale: 1 }}
 viewport={{ once: true }}
 transition={{ delay: i * 0.1, duration: 0.4 }}
 className="flex flex-col items-center text-center"
 >
 <div
 className={`flex h-14 w-14 items-center justify-center rounded-xl ${c.bg} ${c.text} border ${c.border} mb-3`}
 >
 <IconComp className="h-7 w-7" />
 </div>
 <p className="font-semibold text-sm">{tool.name}</p>
 <p className="text-xs text-muted-foreground mt-1">
 {tool.url.replace("https://", "")}
 </p>
 {/* Integration lines to center */}
 <div className="mt-3 space-y-1">
 {tools
.filter((t) => t.slug!== tool.slug)
.slice(0, 2)
.map((other) => (
 <div
 key={other.slug}
 className="flex items-center gap-1.5 text-xs text-muted-foreground"
 >
 <div className="h-1 w-1 rounded-full bg-primary/50" />
 <span>اتصال به {other.name}</span>
 </div>
 ))}
 </div>
 </motion.div>
 );
 })}
 </div>
 </div>
 );
}
