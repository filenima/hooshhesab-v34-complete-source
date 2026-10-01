"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 BarChart3,
 Globe2,
 Trophy,
 Users,
 TrendingUp,
 TrendingDown,
 Lightbulb,
 AlertTriangle,
 Target,
 CheckCircle2,
 XCircle,
 ChevronDown,
 Sparkles,
 ShieldCheck,
 Smartphone,
 Code2,
 Server,
 Cpu,
 CircleDollarSign,
 CalendarClock,
 Building2,
 Layers,
 Rocket,
 Award,
 ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { toPersianDigits, formatCompactToman, formatNumber } from "@/lib/persian";
import {
 competitorAnalysis,
 globalCompetitorsDeep,
 hoshhesabSWOT,
 strategicRecommendations,
 roadmap12Months,
 type CompetitorDeepAnalysis,
} from "@/lib/competitor-deep-analysis";
// #23 + #15 (v34-5): تب «قیمت روز رقبا و کانال‌های رسانه» — دفتر قیمت /compare + iframeهای /podcasts
import { MarketSettingsTab } from "@/components/views/superadmin/market-settings-tab";

// ============ کمک‌کننده‌ها ============

const TYPE_LABELS: Record<CompetitorDeepAnalysis["type"], string> = {
 desktop: "دسکتاپ",
 cloud: "ابری",
 hybrid: "هیبرید",
};

function typeBadgeClass(type: CompetitorDeepAnalysis["type"]): string {
 switch (type) {
 case "desktop":
 return "bg-muted text-muted-foreground";
 case "cloud":
 return "bg-primary/10 text-primary";
 case "hybrid":
 return "bg-chart-5/10 text-chart-5";
 }
}

function qualityLabel(q: "excellent" | "good" | "basic" | "none"): string {
 switch (q) {
 case "excellent":
 return "عالی";
 case "good":
 return "خوب";
 case "basic":
 return "پایه";
 case "none":
 return "ندارد";
 }
}

function qualityClass(q: "excellent" | "good" | "basic" | "none"): string {
 switch (q) {
 case "excellent":
 return "bg-success/10 text-success";
 case "good":
 return "bg-primary/10 text-primary";
 case "basic":
 return "bg-warning/10 text-warning";
 case "none":
 return "bg-destructive/10 text-destructive";
 }
}

function priorityLabel(p: string): string {
 return p;
}

function priorityClass(p: string): string {
 if (p === "بحرانی") return "bg-destructive/10 text-destructive border-destructive/20";
 if (p === "بالا") return "bg-warning/10 text-warning border-warning/20";
 return "bg-muted text-muted-foreground border-border";
}

function priorityDot(p: string): string {
 if (p === "بحرانی") return "bg-destructive";
 if (p === "بالا") return "bg-warning";
 return "bg-muted-foreground";
}

function scoreColor(score: number): string {
 if (score >= 8) return "text-success";
 if (score >= 7) return "text-primary";
 if (score >= 6) return "text-warning";
 return "text-destructive";
}

function scoreProgressClass(score: number): string {
 if (score >= 8) return "[&_[data-slot=progress-indicator]]:bg-success";
 if (score >= 7) return "[&_[data-slot=progress-indicator]]:bg-primary";
 if (score >= 6) return "[&_[data-slot=progress-indicator]]:bg-warning";
 return "[&_[data-slot=progress-indicator]]:bg-destructive";
}

// ============ کامپوننت اصلی ============

export function CompetitorAnalysisView({ token }: { token?: string }) {
 const [tab, setTab] = React.useState("iranian");

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر بخش */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
 <BarChart3 className="h-5 w-5" />
 </div>
 <div>
 <h2 className="text-base font-bold leading-tight">تحلیل عمیق رقبای بازار</h2>
 <p className="text-[11px] text-muted-foreground leading-tight">
 رقبای ایرانی و جهانی، SWOT، پیشنهادات استراتژیک و نقشه راه ۱۲ ماهه
 </p>
 </div>
 </div>
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] gap-1">
 <Sparkles className="h-3 w-3" />
 {toPersianDigits(competitorAnalysis.length + globalCompetitorsDeep.length)} رقیب تحلیل‌شده
 </Badge>
 </div>

 <Tabs value={tab} onValueChange={setTab} className="space-y-4">
 <TabsList className="h-9 flex-wrap">
 <TabsTrigger value="iranian" className="text-xs gap-1.5">
 <Building2 className="h-3.5 w-3.5" />
 رقبای ایرانی
 </TabsTrigger>
 <TabsTrigger value="global" className="text-xs gap-1.5">
 <Globe2 className="h-3.5 w-3.5" />
 رقبای جهانی
 </TabsTrigger>
 <TabsTrigger value="swot" className="text-xs gap-1.5">
 <Layers className="h-3.5 w-3.5" />
 SWOT هوش
 </TabsTrigger>
 <TabsTrigger value="strategy" className="text-xs gap-1.5">
 <Target className="h-3.5 w-3.5" />
 پیشنهادات استراتژیک
 </TabsTrigger>
 <TabsTrigger value="roadmap" className="text-xs gap-1.5">
 <CalendarClock className="h-3.5 w-3.5" />
 نقشه راه ۱۲ ماه
 </TabsTrigger>
 {/* #23 + #15 (v34-5): دفتر قیمت روز رقبا + کانال‌های رسانه */}
 <TabsTrigger value="market" className="text-xs gap-1.5">
 <CircleDollarSign className="h-3.5 w-3.5" />
 قیمت روز و رسانه
 </TabsTrigger>
 </TabsList>

 <TabsContent value="iranian" className="outline-none space-y-4">
 <IranianCompetitorsTab />
 </TabsContent>

 <TabsContent value="global" className="outline-none space-y-4">
 <GlobalCompetitorsTab />
 </TabsContent>

 <TabsContent value="swot" className="outline-none space-y-4">
 <SwotTab />
 </TabsContent>

 <TabsContent value="strategy" className="outline-none space-y-4">
 <StrategyTab />
 </TabsContent>

 <TabsContent value="roadmap" className="outline-none space-y-4">
 <RoadmapTab />
 </TabsContent>

 {/* #23 + #15 (v34-5): ادیتور قیمت روز رقبا + کانال‌های رسانه */}
 <TabsContent value="market" className="outline-none space-y-4">
 <MarketSettingsTab token={token} />
 </TabsContent>
 </Tabs>
 </div>
 );
}

// ============ تب ۱: رقبای ایرانی ============

function IranianCompetitorsTab() {
 const totalMarket = competitorAnalysis.reduce((sum, c) => sum + c.marketShare, 0);
 const avgSatisfaction = Math.round(
 competitorAnalysis.reduce((sum, c) => sum + c.userFeedback.satisfaction, 0) /
 competitorAnalysis.length
 );
 const topPlayer = [...competitorAnalysis].sort((a, b) => b.marketShare - a.marketShare)[0];
 const totalUsers = competitorAnalysis.reduce((sum, c) => sum + c.estimatedUsers, 0);

 return (
 <div className="space-y-4">
 {/* ردیف خلاصه */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <SummaryStat
 icon={TrendingUp}
 label="سهم بازار پوشش‌داده‌شده"
 value={`${toPersianDigits(totalMarket)}٪`}
 sub={`از ${toPersianDigits(competitorAnalysis.length)} رقیب اصلی`}
 accent="primary"
 />
 <SummaryStat
 icon={Award}
 label="میانگین رضایت کاربران"
 value={`${toPersianDigits(avgSatisfaction)}٪`}
 sub="از ۱۰۰"
 accent="success"
 />
 <SummaryStat
 icon={Trophy}
 label="بازیگر برتر بازار"
 value={topPlayer.name}
 sub={`سهم ${toPersianDigits(topPlayer.marketShare)}٪`}
 accent="warning"
 />
 <SummaryStat
 icon={Users}
 label="کاربران تخمینی کل"
 value={toPersianDigits(formatNumber(totalUsers))}
 sub="مجموع کاربران رقبا"
 accent="chart5"
 />
 </div>

 {/* کارت‌های تفصیلی رقبا */}
 <div className="space-y-3">
 {competitorAnalysis.map((c, idx) => (
 <CompetitorDeepCard key={c.id} competitor={c} index={idx} />
 ))}
 </div>

 {/* جدول مقایسه */}
 <ComparisonTable />
 </div>
 );
}

function SummaryStat({
 icon: Icon,
 label,
 value,
 sub,
 accent = "primary",
}: {
 icon: React.ElementType;
 label: string;
 value: string;
 sub?: string;
 accent?: "primary" | "success" | "warning" | "chart5";
}) {
 const accentMap: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
 chart5: "bg-chart-5/10 text-chart-5",
 };
 return (
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">{label}</p>
 <p className="text-xl font-bold leading-none tnum truncate">{value}</p>
 {sub && <p className="text-[10px] text-muted-foreground mt-1 truncate">{sub}</p>}
 </div>
 <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accentMap[accent]}`}>
 <Icon className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

function CompetitorDeepCard({
 competitor: c,
 index,
}: {
 competitor: CompetitorDeepAnalysis;
 index: number;
}) {
 const [expanded, setExpanded] = React.useState(false);

 return (
 <motion.div
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(index * 0.04, 0.3) }}
 >
 <Card className="card-hover overflow-hidden">
 {/* هدر کارت */}
 <button
 type="button"
 onClick={() => setExpanded((v) =>!v)}
 className="w-full text-start p-4 hover:bg-muted/30 transition-colors"
 aria-expanded={expanded}
 >
 <div className="flex items-center gap-4">
 {/* امتیاز کلی بزرگ */}
 <div className="flex flex-col items-center justify-center shrink-0 w-16 h-16 rounded-xl bg-muted/50 border border-border">
 <span className={`text-2xl font-bold leading-none tnum ${scoreColor(c.overallScore)}`}>
 {toPersianDigits(c.overallScore.toFixed(1))}
 </span>
 <span className="text-[9px] text-muted-foreground mt-0.5">از ۱۰</span>
 </div>

 {/* اطلاعات اصلی */}
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="font-bold text-sm">{c.name}</h3>
 <span className="text-[10px] text-muted-foreground" dir="ltr">
 {c.nameEn}
 </span>
 <Badge variant="secondary" className={`text-[10px] ${typeBadgeClass(c.type)}`}>
 {TYPE_LABELS[c.type]}
 </Badge>
 {c.ai.hasAI && (
 <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary gap-1">
 <Cpu className="h-2.5 w-2.5" />
 AI
 </Badge>
 )}
 {c.mobile.hasApp && (
 <Badge variant="secondary" className="text-[10px] bg-chart-5/10 text-chart-5 gap-1">
 <Smartphone className="h-2.5 w-2.5" />
 موبایل
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
 <span className="flex items-center gap-1">
 <CalendarClock className="h-3 w-3" />
 تأسیس {c.founded}
 </span>
 <span className="flex items-center gap-1">
 <Users className="h-3 w-3" />
 {toPersianDigits(formatNumber(c.estimatedUsers))} کاربر
 </span>
 <span className="flex items-center gap-1">
 <CircleDollarSign className="h-3 w-3" />
 {c.estimatedRevenue}
 </span>
 </div>
 </div>

 {/* سهم بازار */}
 <div className="hidden sm:flex flex-col items-end shrink-0 ps-3 border-s border-border">
 <span className="text-[10px] text-muted-foreground">سهم بازار</span>
 <span className="text-lg font-bold tnum text-primary">
 {toPersianDigits(c.marketShare)}٪
 </span>
 </div>

 {/* دکمه باز/بسته */}
 <ChevronDown
 className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
 expanded? "rotate-180": ""
 }`}
 />
 </div>

 {/* نوار پیشرفت سهم بازار - همیشه قابل دیدن */}
 <div className="mt-3">
 <Progress value={c.marketShare * 3} className="h-1.5" />
 </div>
 </button>

 {/* محتوای بازشونده */}
 {expanded && (
 <div className="border-t border-border p-4 space-y-4 bg-muted/10">
 {/* قیمت‌گذاری */}
 <Section icon={CircleDollarSign} title="قیمت‌گذاری">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <InfoTile label="حداقل قیمت" value={formatCompactToman(c.pricing.min)} />
 <InfoTile label="حداکثر قیمت" value={formatCompactToman(c.pricing.max)} />
 <InfoTile label="مدل قیمت‌گذاری" value={c.pricing.model} />
 </div>
 {c.pricing.hiddenCosts.length > 0 && (
 <div className="mt-3">
 <p className="text-[11px] text-muted-foreground mb-1.5">هزینه‌های پنهان:</p>
 <div className="flex flex-wrap gap-1.5">
 {c.pricing.hiddenCosts.map((cost, i) => (
 <Badge
 key={i}
 variant="secondary"
 className="text-[10px] bg-destructive/5 text-destructive border-destructive/15"
 >
 {cost}
 </Badge>
 ))}
 </div>
 </div>
 )}
 </Section>

 {/* ماژول‌ها */}
 <Section icon={Layers} title="ماژول‌ها">
 <div className="flex flex-wrap gap-1.5">
 {c.modules.map((m, i) => (
 <Badge key={i} variant="secondary" className="text-[10px] bg-muted text-foreground">
 {m}
 </Badge>
 ))}
 </div>
 </Section>

 {/* نقاط قوت و ضعف */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Section icon={TrendingUp} title="نقاط قوت" accent="success">
 <ul className="space-y-1.5">
 {c.strengths.map((s, i) => (
 <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
 <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
 <span>{s}</span>
 </li>
 ))}
 </ul>
 </Section>
 <Section icon={TrendingDown} title="نقاط ضعف" accent="destructive">
 <ul className="space-y-1.5">
 {c.weaknesses.map((w, i) => (
 <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
 <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
 <span>{w}</span>
 </li>
 ))}
 </ul>
 </Section>
 </div>

 {/* فرصت‌ها و تهدیدها */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Section icon={Lightbulb} title="فرصت‌ها" accent="primary">
 <ul className="space-y-1.5">
 {c.opportunities.map((o, i) => (
 <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
 <ArrowUpRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
 <span>{o}</span>
 </li>
 ))}
 </ul>
 </Section>
 <Section icon={AlertTriangle} title="تهدیدها" accent="warning">
 <ul className="space-y-1.5">
 {c.threats.map((t, i) => (
 <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
 <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
 <span>{t}</span>
 </li>
 ))}
 </ul>
 </Section>
 </div>

 {/* بازخورد کاربران */}
 <Section icon={Users} title="بازخورد کاربران">
 <div className="space-y-3">
 {/* امتیاز رضایت */}
 <div className="flex items-center gap-3">
 <span className="text-[11px] text-muted-foreground shrink-0 w-20">رضایت کلی</span>
 <Progress
 value={c.userFeedback.satisfaction}
 className={`flex-1 h-2 ${scoreProgressClass(c.userFeedback.satisfaction / 10)}`}
 />
 <span className="text-sm font-bold tnum w-10 text-end">
 {toPersianDigits(c.userFeedback.satisfaction)}٪
 </span>
 </div>

 {/* شکایات و تعاریف */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <p className="text-[10px] text-destructive mb-2 font-medium">شکایات برتر</p>
 <div className="space-y-1.5">
 {c.userFeedback.complaints.slice(0, 4).map((com, i) => (
 <FeedbackBar key={i} topic={com.topic} frequency={com.frequency} type="complaint" />
 ))}
 </div>
 </div>
 <div>
 <p className="text-[10px] text-success mb-2 font-medium">تعاریف برتر</p>
 <div className="space-y-1.5">
 {c.userFeedback.praises.slice(0, 4).map((pr, i) => (
 <FeedbackBar key={i} topic={pr.topic} frequency={pr.frequency} type="praise" />
 ))}
 </div>
 </div>
 </div>
 </div>
 </Section>

 {/* پشته فنی */}
 <Section icon={Server} title="پشته فنی">
 <div className="flex flex-wrap gap-1.5">
 {c.techStack.map((t, i) => (
 <Badge key={i} variant="outline" className="text-[10px] font-mono" dir="ltr">
 {t}
 </Badge>
 ))}
 </div>
 </Section>

 {/* شاخص‌های فنی: مودیان، AI، موبایل، API */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <CapabilityTile
 icon={ShieldCheck}
 label="اتصال مودیان"
 value={c.modian.connected? qualityLabel(c.modian.quality): "متصل نیست"}
 tone={c.modian.connected? qualityClass(c.modian.quality): "bg-destructive/10 text-destructive"}
 />
 <CapabilityTile
 icon={Cpu}
 label="هوش مصنوعی"
 value={c.ai.hasAI? `${c.ai.features.length} قابلیت`: "ندارد"}
 tone={c.ai.hasAI? "bg-primary/10 text-primary": "bg-destructive/10 text-destructive"}
 />
 <CapabilityTile
 icon={Smartphone}
 label="اپ موبایل"
 value={
 c.mobile.hasApp
? `امتیاز ${toPersianDigits(c.mobile.rating.toFixed(1))}`
: "ندارد"
 }
 tone={c.mobile.hasApp? "bg-success/10 text-success": "bg-destructive/10 text-destructive"}
 />
 <CapabilityTile
 icon={Code2}
 label="کیفیت API"
 value={c.api.hasApi? qualityLabel(c.api.quality): "ندارد"}
 tone={c.api.hasApi? qualityClass(c.api.quality): "bg-destructive/10 text-destructive"}
 />
 </div>

 {/* امتیاز UX و پشتیبانی */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <ScoreBar label="امتیاز تجربه کاربری (UX)" value={c.uxScore} />
 <ScoreBar label="امتیاز پشتیبانی" value={c.supportScore} />
 </div>
 </div>
 )}
 </Card>
 </motion.div>
 );
}

function Section({
 icon: Icon,
 title,
 children,
 accent,
}: {
 icon: React.ElementType;
 title: string;
 children: React.ReactNode;
 accent?: "success" | "destructive" | "warning" | "primary";
}) {
 const accentMap: Record<string, string> = {
 success: "text-success",
 destructive: "text-destructive",
 warning: "text-warning",
 primary: "text-primary",
 };
 return (
 <div>
 <div className="flex items-center gap-1.5 mb-2">
 <Icon className={`h-3.5 w-3.5 ${accent? accentMap[accent]: "text-muted-foreground"}`} />
 <h4 className="text-xs font-semibold">{title}</h4>
 </div>
 {children}
 </div>
 );
}

function InfoTile({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-lg border border-border bg-background p-2.5">
 <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
 <p className="text-xs font-semibold tnum">{value}</p>
 </div>
 );
}

function FeedbackBar({
 topic,
 frequency,
 type,
}: {
 topic: string;
 frequency: number;
 type: "complaint" | "praise";
}) {
 const color = type === "complaint"? "bg-destructive": "bg-success";
 return (
 <div className="space-y-1">
 <div className="flex items-center justify-between text-[10px]">
 <span className="text-muted-foreground truncate">{topic}</span>
 <span className="tnum text-muted-foreground shrink-0 ms-2">{toPersianDigits(frequency)}٪</span>
 </div>
 <div className="h-1.5 rounded-full bg-muted overflow-hidden">
 <div
 className={`h-full rounded-full ${color}`}
 style={{ width: `${frequency}%` }}
 />
 </div>
 </div>
 );
}

function CapabilityTile({
 icon: Icon,
 label,
 value,
 tone,
}: {
 icon: React.ElementType;
 label: string;
 value: string;
 tone: string;
}) {
 return (
 <div className={`rounded-lg border border-border p-2.5 ${tone}`}>
 <div className="flex items-center gap-1.5 mb-1">
 <Icon className="h-3 w-3" />
 <span className="text-[10px] opacity-80">{label}</span>
 </div>
 <p className="text-xs font-semibold">{value}</p>
 </div>
 );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
 return (
 <div className="space-y-1.5">
 <div className="flex items-center justify-between text-[11px]">
 <span className="text-muted-foreground">{label}</span>
 <span className="tnum font-semibold">{toPersianDigits(value)}٪</span>
 </div>
 <Progress value={value} className={`h-2 ${scoreProgressClass(value / 10)}`} />
 </div>
 );
}

// ============ جدول مقایسه رقبا ============

function ComparisonTable() {
 return (
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <BarChart3 className="h-4 w-4 text-primary" />
 جدول مقایسه جامع رقبا
 </CardTitle>
 <CardDescription className="text-xs">
 مقایسه قیمت، امتیاز و قابلیت‌های فنی همه رقبا در یک نگاه
 </CardDescription>
 </CardHeader>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra min-w-[900px]">
 <TableHeader className="sticky top-0 bg-card z-10">
 <TableRow>
 <TableHead className="text-start text-[11px]">رقبا</TableHead>
 <TableHead className="text-end text-[11px]">حداقل قیمت</TableHead>
 <TableHead className="text-end text-[11px]">امتیاز کل</TableHead>
 <TableHead className="text-center text-[11px]">مودیان</TableHead>
 <TableHead className="text-center text-[11px]">AI</TableHead>
 <TableHead className="text-center text-[11px]">موبایل</TableHead>
 <TableHead className="text-center text-[11px]">API</TableHead>
 <TableHead className="text-end text-[11px]">UX</TableHead>
 <TableHead className="text-end text-[11px]">پشتیبانی</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {competitorAnalysis.map((c) => (
 <TableRow key={c.id}>
 <TableCell className="text-xs font-medium">
 <div className="flex items-center gap-2">
 <span>{c.name}</span>
 <Badge variant="secondary" className={`text-[9px] ${typeBadgeClass(c.type)}`}>
 {TYPE_LABELS[c.type]}
 </Badge>
 </div>
 </TableCell>
 <TableCell className="text-end text-[10px] tnum text-muted-foreground">
 {formatCompactToman(c.pricing.min)}
 </TableCell>
 <TableCell className="text-end">
 <span className={`text-sm font-bold tnum ${scoreColor(c.overallScore)}`}>
 {toPersianDigits(c.overallScore.toFixed(1))}
 </span>
 </TableCell>
 <TableCell className="text-center">
 <Badge variant="secondary" className={`text-[9px] ${qualityClass(c.modian.quality)}`}>
 {qualityLabel(c.modian.quality)}
 </Badge>
 </TableCell>
 <TableCell className="text-center">
 {c.ai.hasAI? (
 <Badge variant="secondary" className="text-[9px] bg-primary/10 text-primary">
 دارد
 </Badge>
 ): (
 <span className="text-[10px] text-muted-foreground">—</span>
 )}
 </TableCell>
 <TableCell className="text-center">
 {c.mobile.hasApp? (
 <Badge variant="secondary" className="text-[9px] bg-success/10 text-success">
 {toPersianDigits(c.mobile.rating.toFixed(1))}
 </Badge>
 ): (
 <span className="text-[10px] text-muted-foreground">—</span>
 )}
 </TableCell>
 <TableCell className="text-center">
 <Badge variant="secondary" className={`text-[9px] ${qualityClass(c.api.quality)}`}>
 {qualityLabel(c.api.quality)}
 </Badge>
 </TableCell>
 <TableCell className="text-end text-[10px] tnum">{toPersianDigits(c.uxScore)}</TableCell>
 <TableCell className="text-end text-[10px] tnum">{toPersianDigits(c.supportScore)}</TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>
 );
}

// ============ تب ۲: رقبای جهانی ============

function GlobalCompetitorsTab() {
 return (
 <div className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {globalCompetitorsDeep.map((g, idx) => (
 <motion.div
 key={g.id}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(idx * 0.05, 0.4) }}
 >
 <Card className="card-hover h-full">
 <CardHeader className="pb-3">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <CardTitle className="text-sm">{g.name}</CardTitle>
 <p className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">
 {g.website}
 </p>
 </div>
 <div className="flex flex-col items-center justify-center shrink-0 w-12 h-12 rounded-lg bg-muted/50 border border-border">
 <span className={`text-base font-bold leading-none tnum ${scoreColor(g.score)}`}>
 {toPersianDigits(g.score.toFixed(1))}
 </span>
 </div>
 </div>
 <div className="flex items-center gap-2 flex-wrap mt-2">
 <Badge variant="secondary" className="text-[10px] bg-muted text-foreground gap-1">
 <Globe2 className="h-2.5 w-2.5" />
 {g.country}
 </Badge>
 <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
 {g.pricing}
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-2 gap-2">
 <InfoTile label="کاربران" value={g.users} />
 <InfoTile label="درآمد سالانه" value={g.revenue} />
 </div>

 {g.aiFeatures.length > 0 && (
 <div>
 <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
 <Cpu className="h-3 w-3 text-primary" />
 قابلیت‌های AI
 </p>
 <div className="flex flex-wrap gap-1">
 {g.aiFeatures.map((a, i) => (
 <Badge key={i} variant="secondary" className="text-[9px] bg-primary/10 text-primary">
 {a}
 </Badge>
 ))}
 </div>
 </div>
 )}

 <div>
 <p className="text-[10px] text-success mb-1.5 flex items-center gap-1">
 <TrendingUp className="h-3 w-3" />
 نقاط قوت
 </p>
 <ul className="space-y-1">
 {g.strengths.map((s, i) => (
 <li key={i} className="flex items-start gap-1.5 text-[10px] leading-relaxed">
 <CheckCircle2 className="h-3 w-3 text-success shrink-0 mt-0.5" />
 <span>{s}</span>
 </li>
 ))}
 </ul>
 </div>

 <div>
 <p className="text-[10px] text-destructive mb-1.5 flex items-center gap-1">
 <TrendingDown className="h-3 w-3" />
 نقاط ضعف
 </p>
 <ul className="space-y-1">
 {g.weaknesses.map((w, i) => (
 <li key={i} className="flex items-start gap-1.5 text-[10px] leading-relaxed">
 <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
 <span>{w}</span>
 </li>
 ))}
 </ul>
 </div>
 </CardContent>
 </Card>
 </motion.div>
 ))}
 </div>

 {/* درس‌های آموخته */}
 <Card className="border-primary/30 bg-primary/5">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Lightbulb className="h-4 w-4 text-primary" />
 درس‌های آموخته از رقبای جهانی
 </CardTitle>
 <CardDescription className="text-xs">
 آنچه هوش باید از هر رقیب جهانی یاد بگیرد
 </CardDescription>
 </CardHeader>
 <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {globalLessons.map((lesson, i) => (
 <div key={i} className="rounded-lg border border-border bg-background p-3">
 <div className="flex items-center gap-2 mb-1.5">
 <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-bold tnum">
 {toPersianDigits(i + 1)}
 </span>
 <span className="text-xs font-semibold">{lesson.name}</span>
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed">{lesson.lesson}</p>
 </div>
 ))}
 </CardContent>
 </Card>
 </div>
 );
}

const globalLessons: { name: string; lesson: string }[] = [
 {
 name: "QuickBooks",
 lesson: "اکوسیستم ادغام گسترده با هزاران اپ third-party — باید App Marketplace قوی بسازیم تا کاربر lock-in شود.",
 },
 {
 name: "Xero",
 lesson: "Bank Feeds قوی و رابط کاربری تمیز — باید روی تجربه کاربری premium و اتصال بانکی هوشمند تمرکز کنیم.",
 },
 {
 name: "Zoho Books",
 lesson: "نسخه رایگان قوی به عنوان hook بازاریابی — پلن freemium با ۵۰ فاکتور رایگان برای جذب کاربر.",
 },
 {
 name: "FreshBooks",
 lesson: "تمرکز روی فریلنسرها با time tracking و سادگی — پلن اختصاصی برای کسب‌وکارهای بسیار کوچک.",
 },
 {
 name: "Wave",
 lesson: "مدل درآمد از خدمات پرداخت به جای لایسنس نرم‌افزار — درگاه پرداخت داخلی با درآمد مکرر.",
 },
 {
 name: "Odoo",
 lesson: "Open-source و سفارشی‌سازی کامل — API عمومی و SDK برای توسعه‌دهندگان ایجاد lock-in اکوسیستم.",
 },
 {
 name: "Sage Intacct",
 lesson: "Multi-entity و گزارش‌دهی پیشرفته برای سازمان‌های بزرگ — پلن enterprise با کنترل چند شرکتی.",
 },
];

// ============ تب ۳: SWOT هوش ============

function SwotTab() {
 return (
 <div className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {/* نقاط ضعف - بالا چپ (قرمز) */}
 <SwotQuadrant
 title="نقاط ضعف"
 subtitle="Weaknesses"
 icon={TrendingDown}
 accent="destructive"
 items={hoshhesabSWOT.weaknesses}
 />
 {/* نقاط قوت - بالا راست (سبز) */}
 <SwotQuadrant
 title="نقاط قوت"
 subtitle="Strengths"
 icon={TrendingUp}
 accent="success"
 items={hoshhesabSWOT.strengths}
 />
 {/* تهدیدها - پایین چپ (کهربایی) */}
 <SwotQuadrant
 title="تهدیدها"
 subtitle="Threats"
 icon={AlertTriangle}
 accent="warning"
 items={hoshhesabSWOT.threats}
 />
 {/* فرصت‌ها - پایین راست (آبی/اطلاعاتی) */}
 <SwotQuadrant
 title="فرصت‌ها"
 subtitle="Opportunities"
 icon={Lightbulb}
 accent="primary"
 items={hoshhesabSWOT.opportunities}
 />
 </div>

 {/* خلاصه استراتژیک */}
 <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Target className="h-4 w-4 text-primary" />
 تحلیل استراتژیک
 </CardTitle>
 </CardHeader>
 <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <SwotCount label="نقاط قوت" count={hoshhesabSWOT.strengths.length} accent="success" />
 <SwotCount label="نقاط ضعف" count={hoshhesabSWOT.weaknesses.length} accent="destructive" />
 <SwotCount label="فرصت‌ها" count={hoshhesabSWOT.opportunities.length} accent="primary" />
 <SwotCount label="تهدیدها" count={hoshhesabSWOT.threats.length} accent="warning" />
 </CardContent>
 </Card>
 </div>
 );
}

function SwotQuadrant({
 title,
 subtitle,
 icon: Icon,
 accent,
 items,
}: {
 title: string;
 subtitle: string;
 icon: React.ElementType;
 accent: "success" | "destructive" | "warning" | "primary";
 items: string[];
}) {
 const accentMap: Record<string, { bg: string; text: string; border: string; dot: string }> = {
 success: { bg: "bg-success/5", text: "text-success", border: "border-success/30", dot: "bg-success" },
 destructive: { bg: "bg-destructive/5", text: "text-destructive", border: "border-destructive/30", dot: "bg-destructive" },
 warning: { bg: "bg-warning/5", text: "text-warning", border: "border-warning/30", dot: "bg-warning" },
 primary: { bg: "bg-primary/5", text: "text-primary", border: "border-primary/30", dot: "bg-primary" },
 };
 const a = accentMap[accent];
 return (
 <Card className={`${a.bg} ${a.border} card-hover`}>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.bg} ${a.text}`}>
 <Icon className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-sm">{title}</CardTitle>
 <p className="text-[10px] text-muted-foreground" dir="ltr">{subtitle}</p>
 </div>
 </div>
 <Badge variant="secondary" className={`text-[10px] ${a.bg} ${a.text}`}>
 {toPersianDigits(items.length)} مورد
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <ul className="space-y-2 max-h-80 overflow-y-auto pe-1">
 {items.map((item, i) => (
 <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
 <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${a.dot}`} />
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>
 );
}

function SwotCount({ label, count, accent }: { label: string; count: number; accent: "success" | "destructive" | "warning" | "primary" }) {
 const accentMap: Record<string, string> = {
 success: "text-success",
 destructive: "text-destructive",
 warning: "text-warning",
 primary: "text-primary",
 };
 return (
 <div className="rounded-lg border border-border bg-background p-3 text-center">
 <p className={`text-2xl font-bold tnum ${accentMap[accent]}`}>{toPersianDigits(count)}</p>
 <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
 </div>
 );
}

// ============ تب ۴: پیشنهادات استراتژیک ============

function StrategyTab() {
 const critical = strategicRecommendations.filter((r) => r.priority === "بحرانی").length;
 const high = strategicRecommendations.filter((r) => r.priority === "بالا").length;
 const medium = strategicRecommendations.filter((r) => r.priority === "متوسط").length;
 const totalItems = strategicRecommendations.reduce((sum, r) => sum + r.items.length, 0);

 return (
 <div className="space-y-4">
 {/* خلاصه شمارش */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <SummaryStat
 icon={Target}
 label="دسته‌بندی کل"
 value={toPersianDigits(strategicRecommendations.length)}
 sub={`${toPersianDigits(totalItems)} پیشنهاد`}
 accent="primary"
 />
 <SummaryStat
 icon={AlertTriangle}
 label="اولویت بحرانی"
 value={toPersianDigits(critical)}
 sub="نیازمند اقدام فوری"
 accent="warning"
 />
 <SummaryStat
 icon={TrendingUp}
 label="اولویت بالا"
 value={toPersianDigits(high)}
 sub="مهم اما قابل تعویق"
 accent="primary"
 />
 <SummaryStat
 icon={Lightbulb}
 label="اولویت متوسط"
 value={toPersianDigits(medium)}
 sub="برای رشد آینده"
 accent="chart5"
 />
 </div>

 {/* کارت‌های دسته‌بندی */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {strategicRecommendations.map((rec, idx) => (
 <motion.div
 key={rec.category}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(idx * 0.04, 0.4) }}
 >
 <Card className="card-hover h-full">
 <CardHeader className="pb-3">
 <div className="flex items-start justify-between gap-2">
 <div className="flex items-center gap-2">
 <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${priorityDot(rec.priority)}`} />
 <CardTitle className="text-sm">{rec.category}</CardTitle>
 </div>
 <Badge variant="outline" className={`text-[10px] ${priorityClass(rec.priority)}`}>
 {priorityLabel(rec.priority)}
 </Badge>
 </div>
 <p className="text-[10px] text-muted-foreground">{toPersianDigits(rec.items.length)} پیشنهاد عملی</p>
 </CardHeader>
 <CardContent>
 <ul className="space-y-1.5 max-h-72 overflow-y-auto pe-1">
 {rec.items.map((item, i) => (
 <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
 <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>
 </motion.div>
 ))}
 </div>
 </div>
 );
}

// ============ تب ۵: نقشه راه ۱۲ ماه ============

function RoadmapTab() {
 return (
 <div className="space-y-4">
 <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Rocket className="h-4 w-4 text-primary" />
 نقشه راه ۱۲ ماهه هوش
 </CardTitle>
 <CardDescription className="text-xs">
 ۵ فاز اصلی از MVP تا تثبیت بازار و گسترش منطقه‌ای
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
 {roadmap12Months.map((phase, i) => (
 <div key={i} className="text-center">
 <p className="text-[10px] text-muted-foreground">فاز {toPersianDigits(i + 1)}</p>
 <p className="text-xs font-bold mt-0.5">{phase.month}</p>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* تایم‌لاین عمودی */}
 <div className="relative">
 {/* خط اتصال عمودی */}
 <div className="absolute top-0 bottom-0 start-5 w-px bg-border" aria-hidden="true" />

 <div className="space-y-4">
 {roadmap12Months.map((phase, idx) => (
 <motion.div
 key={idx}
 initial={{ opacity: 0, x: -10 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: Math.min(idx * 0.1, 0.5) }}
 className="relative ps-14"
 >
 {/* نقطه فاز */}
 <div className="absolute start-0 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-background">
 <span className="text-xs font-bold tnum">{toPersianDigits(idx + 1)}</span>
 </div>

 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div>
 <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary mb-1.5">
 {phase.month}
 </Badge>
 <CardTitle className="text-sm flex items-center gap-2">
 <Target className="h-3.5 w-3.5 text-primary" />
 {phase.phase}
 </CardTitle>
 </div>
 <Badge variant="outline" className="text-[10px]">
 {toPersianDigits(phase.goals.length)} هدف
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <ul className="space-y-2">
 {phase.goals.map((goal, i) => (
 <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
 <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
 <span>{goal}</span>
 </li>
 ))}
 </ul>
 </CardContent>
 </Card>
 </motion.div>
 ))}
 </div>
 </div>
 </div>
 );
}
