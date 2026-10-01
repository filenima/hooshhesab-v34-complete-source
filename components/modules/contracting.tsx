"use client";

import * as React from "react";
import {
 HardHat,
 Building2,
 FileBarChart,
 Shield,
 Percent,
 Plus,
 ChevronLeft,
 CheckCircle2,
 AlertTriangle,
 Loader2,
 RefreshCw,
 AlertCircle,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ux/empty-state";
import { formatCompactToman, toJalali, toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

/* ============ نوع‌های داده ============ */
type UiStatus = "ACTIVE" | "PAUSED" | "DONE";

interface ProjectData {
 id: string;
 code: string;
 name: string;
 clientId: string | null;
 startDate: string; // ISO
 endDate: string | null; // ISO
 contractValue: number;
 status: string; // وضعیت خام دیتابیس: ACTIVE | SUSPENDED | COMPLETED
 progress: number;
}

interface Statement {
 number: string;
 project: string;
 period: string;
 amount: number;
 ksourat: number;
 status: "DRAFT" | "SENT" | "PAID";
}

const PROJECT_STATUS_FA: Record<UiStatus, string> = {
 ACTIVE: "در حال اجرا",
 PAUSED: "متوقف",
 DONE: "تکمیل شده",
};

const PROJECT_STATUS_BADGE: Record<UiStatus, string> = {
 ACTIVE: "bg-success/10 text-success",
 PAUSED: "bg-warning/10 text-warning",
 DONE: "bg-primary/10 text-primary",
};

/** نگاشت وضعیت دیتابیس به وضعیت نمایشی UI */
function mapProjectStatus(status: string): UiStatus {
 if (status === "COMPLETED") return "DONE";
 if (status === "SUSPENDED") return "PAUSED";
 if (status === "ACTIVE" || status === "PAUSED" || status === "DONE") {
 return status as UiStatus;
 }
 return "ACTIVE";
}

/**
 * ساخت لیست کسورات قانونی برای یک پروژه بر اساس مبلغ قرارداد.
 * نرخ‌ها ثابت و قانونی هستند: بیمه ۲٪، مالیات بر ارزش افزوده ۱۰٪،
 * حسن انجام کار ۵٪، سپرده حسن انجام کار ۱۰٪ (مجموع ۲۷٪).
 */
function buildKsourat(baseAmount: number) {
 return [
 {
 name: "بیمه تأمین اجتماعی",
 rate: "۲٪",
 amount: Math.round(baseAmount * 0.02),
 desc: "سهم کارفرما از کل صورت‌وضعیت",
 },
 {
 name: "مالیات بر ارزش افزوده",
 rate: "۱۰٪",
 amount: Math.round(baseAmount * 0.1),
 desc: "کسورات مالیاتی قانونی",
 },
 {
 name: "حسن انجام کار",
 rate: "۵٪",
 amount: Math.round(baseAmount * 0.05),
 desc: "تا پایان پروژه نزد کارفرما",
 },
 {
 name: "سپرده حسن انجام کار",
 rate: "۱۰٪",
 amount: Math.round(baseAmount * 0.1),
 desc: "حساب بانکی مسدود",
 },
 ];
}

/** صورت‌وضعیت‌های نمونه — این داده‌ها صرفاً برای پیش‌نمایش UI هستند.
 * مدل مستقلی برای صورت‌وضعیت در Prisma وجود ندارد؛ پس از افزودن مدل
 * `ProjectStatement`، این بخش به‌صورت پویا از API بارگذاری می‌شود.
 * برچسب «نمونه» در UI نمایش داده می‌شود تا با داده‌های واقعی اشتباه گرفته نشود.
 */
const STATEMENTS: Statement[] = [
 {
 number: "SW-۱۴۰۳-۰۲۱",
 project: "ساختمان اداری پارس",
 period: "مهر ۱۴۰۳",
 amount: 184_000_000,
 ksourat: 32_120_000,
 status: "PAID",
 },
 {
 number: "SW-۱۴۰۳-۰۲۰",
 project: "به‌سازی راه آهن جنوب",
 period: "مهر ۱۴۰۳",
 amount: 268_000_000,
 ksourat: 46_760_000,
 status: "SENT",
 },
 {
 number: "SW-۱۴۰۳-۰۱۹",
 project: "ساخت سکوهای نفتی",
 period: "شهریور ۱۴۰۳",
 amount: 92_000_000,
 ksourat: 16_100_000,
 status: "PAID",
 },
 {
 number: "SW-۱۴۰۳-۰۲۲",
 project: "نصب سیستم تهویه",
 period: "مهر ۱۴۰۳",
 amount: 28_000_000,
 ksourat: 4_900_000,
 status: "DRAFT",
 },
];

const SW_STATUS_FA: Record<Statement["status"], string> = {
 DRAFT: "پیش‌نویس",
 SENT: "ارسال شده",
 PAID: "تسویه شده",
};

const SW_STATUS_BADGE: Record<Statement["status"], string> = {
 DRAFT: "bg-muted text-muted-foreground",
 SENT: "bg-info/10 text-info",
 PAID: "bg-success/10 text-success",
};

/* ============ کامپوننت اصلی ============ */
export function ContractingModule() {
 const [projects, setProjects] = React.useState<ProjectData[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [refreshKey, setRefreshKey] = React.useState(0);

 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 // دریافت پروژه‌ها از API
 const fetchProjects = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const res = await authFetch("/api/projects", { cache: "no-store" });
 if (!res.ok) {
 throw new Error("دریافت داده‌های ماژول پیمانکاری ناموفق بود");
 }
 const json = (await res.json().catch(() => null)) as
 | { success?: boolean; data?: ProjectData[] }
 | null;
 if (json?.success === false) {
 throw new Error("خطا در دریافت پروژه‌های پیمانکاری");
 }
 setProjects(Array.isArray(json?.data)? json!.data!: []);
 } catch (e) {
 const msg =
 e instanceof Error
? e.message
: "خطای ناشناخته در دریافت داده‌های پیمانکاری رخ داد.";
 setError(msg);
 setProjects([]);
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchProjects();
 }, [fetchProjects, refreshKey]);

 // محاسبه آمار پویا از داده‌های واقعی
 const mapped = projects.map((p) => ({
...p,
 uiStatus: mapProjectStatus(p.status),
 }));

 const activeCount = mapped.filter((p) => p.uiStatus === "ACTIVE").length;
 const pausedCount = mapped.filter((p) => p.uiStatus === "PAUSED").length;
 const doneCount = mapped.filter((p) => p.uiStatus === "DONE").length;
 const totalContractValue = mapped.reduce(
 (sum, p) => sum + (p.contractValue?? 0),
 0
 );
 const criticalCount = mapped.filter(
 (p) => p.uiStatus === "ACTIVE" && p.progress < 30
 ).length;
 const totalLegalDeductions = Math.round(totalContractValue * 0.27);

 const STATS: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "info" | "success" | "warning";
 }[] = [
 {
 icon: HardHat,
 label: "پروژه‌های فعال",
 value: toPersianDigits(activeCount),
 sub:
 criticalCount > 0
? `${toPersianDigits(criticalCount)} پروژه در پیشرفت بحرانی`
: "بدون پروژه بحرانی",
 accent: "primary",
 },
 {
 icon: Building2,
 label: "ارزش قراردادها",
 value:
 totalContractValue > 0? formatCompactToman(totalContractValue): "—",
 sub: "کل قراردادهای جاری",
 accent: "info",
 },
 {
 icon: FileBarChart,
 label: "صورت‌وضعیت‌های صادرشده",
 value: toPersianDigits(STATEMENTS.length),
 sub: "در سال جاری",
 accent: "success",
 },
 {
 icon: Percent,
 label: "کسورات قانونی",
 value:
 totalLegalDeductions > 0
? formatCompactToman(totalLegalDeductions)
: "—",
 sub: "بیمه + مالیات + حسن انجام",
 accent: "warning",
 },
 ];

 // پروژه نمونه برای کارت کسورات قانونی (اولین پروژه)
 const sampleProject = mapped[0]?? null;
 const KSOURAT = sampleProject
? buildKsourat(sampleProject.contractValue)
: [];
 const sampleTotal = KSOURAT.reduce((s, k) => s + k.amount, 0);

 // ردیف‌های جدول پروژه‌ها
 const projectRows = mapped.map((p) => ({
 id: p.id,
 code: p.code,
 name: p.name,
 client: p.clientId?? "بدون کارفرما",
 startDate: toJalali(new Date(p.startDate)),
 value: p.contractValue,
 progress: p.progress,
 status: p.uiStatus,
 }));

 /* ============ حالت بارگذاری ============ */
 if (loading && projects.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-20 gap-3 animate-fade-in-up">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">
 در حال دریافت داده‌های ماژول پیمانکاری…
 </p>
 </div>
 );
 }

 /* ============ حالت خطا ============ */
 if (error && projects.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in-up">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
 <AlertCircle className="h-7 w-7" strokeWidth={1.5} />
 </div>
 <div className="text-center max-w-sm">
 <h3 className="text-sm font-semibold text-foreground mb-1">
 خطا در دریافت داده‌ها
 </h3>
 <p className="text-xs text-muted-foreground leading-relaxed">
 {error}
 </p>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => void refresh()}
 >
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 );
 }

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر + اقدامات */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <p className="text-xs text-muted-foreground mb-0.5">مدیریت پیمانکاری</p>
 <h2 className="text-xl font-bold text-foreground">ماژول پیمانکاری</h2>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 h-9"
 onClick={() => void refresh()}
 disabled={loading}
 >
 <RefreshCw
 className={`h-3.5 w-3.5 ${loading? "animate-spin": ""}`}
 />
 به‌روزرسانی
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <FileBarChart className="h-3.5 w-3.5" />
 گزارش پیشرفت
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <Shield className="h-3.5 w-3.5" />
 ضمانت‌نامه
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <FileBarChart className="h-3.5 w-3.5" />
 صورت‌وضعیت
 </Button>
 <Button size="sm" className="gap-1.5 h-9">
 <Plus className="h-3.5 w-3.5" />
 پروژه جدید
 </Button>
 </div>
 </div>

 {/* ردیف آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {STATS.map((s, i) => (
 <StatCard key={s.label} {...s} delay={i * 60} />
 ))}
 </div>

 {/* جدول پروژه‌ها */}
 <Card className="card-hover">
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <HardHat className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">پروژه‌های پیمانکاری</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(activeCount)} فعال · {toPersianDigits(pausedCount)} متوقف · {toPersianDigits(doneCount)} تکمیل‌شده
 </p>
 </div>
 </div>
 <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-muted-foreground" disabled>
 همه
 <ChevronLeft className="h-3 w-3" />
 </Button>
 </CardHeader>
 <CardContent className="p-0">
 {projectRows.length === 0? (
 <EmptyState
 icon={HardHat}
 title="هنوز پروژه‌ای ثبت نشده"
 description="برای مدیریت پیمانکاری، اولین پروژه خود را با مشخص کردن کد، نام، کارفرما و مبلغ قرارداد ثبت کنید."
 action={
 <Button size="sm" className="gap-1.5">
 <Plus className="h-3.5 w-3.5" />
 پروژه جدید
 </Button>
 }
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[860px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">کد پروژه</th>
 <th scope="col" className="font-medium px-4 py-2.5">نام پروژه</th>
 <th scope="col" className="font-medium px-4 py-2.5">کارفرما</th>
 <th scope="col" className="font-medium px-4 py-2.5">تاریخ شروع</th>
 <th scope="col" className="font-medium px-4 py-2.5">ارزش قرارداد</th>
 <th scope="col" className="font-medium px-4 py-2.5">پیشرفت</th>
 <th scope="col" className="font-medium px-4 py-2.5">وضعیت</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {projectRows.map((p, i) => (
 <tr
 key={p.id}
 className="border-b border-border/40 transition-colors animate-stagger"
 style={{ animationDelay: `${i * 40}ms` }}
 >
 <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
 <td className="px-4 py-3 font-medium">{p.name}</td>
 <td className="px-4 py-3 text-muted-foreground">
 <div className="flex items-center gap-1.5">
 <Building2 className="h-3 w-3 text-muted-foreground/60" />
 <span>{p.client}</span>
 </div>
 </td>
 <td className="px-4 py-3 text-muted-foreground text-xs">{p.startDate}</td>
 <td className="px-4 py-3 font-medium">
 {p.value > 0? formatCompactToman(p.value): "—"}
 </td>
 <td className="px-4 py-3">
 <div className="flex items-center gap-2 min-w-[120px]">
 <Progress value={p.progress} className="h-1.5 flex-1" />
 <span className="text-[11px] font-medium text-muted-foreground w-9 text-end">
 {toPersianDigits(Math.round(p.progress))}٪
 </span>
 </div>
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="secondary"
 className={`text-[10px] ${PROJECT_STATUS_BADGE[p.status]}`}
 >
 {PROJECT_STATUS_FA[p.status]}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* کسورات قانونی + صورت‌وضعیت‌ها */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
 {/* کسورات قانونی */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
 <Percent className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">کسورات قانونی</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {sampleProject
? `پروژه نمونه: ${sampleProject.name} · صورت‌وضعیت پایه ${formatCompactToman(sampleProject.contractValue)}`
: "پروژه‌ای برای محاسبه کسورات موجود نیست"}
 </p>
 </div>
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 {sampleProject? (
 <div className="space-y-2.5">
 {KSOURAT.map((k, i) => (
 <div
 key={i}
 className="flex items-center justify-between rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors"
 >
 <div className="min-w-0">
 <div className="flex items-center gap-2 mb-0.5">
 <span className="text-xs font-medium">{k.name}</span>
 <Badge variant="outline" className="text-[10px] font-mono">
 {k.rate}
 </Badge>
 </div>
 <p className="text-[10px] text-muted-foreground">{k.desc}</p>
 </div>
 <p className="text-sm font-bold text-destructive tnum shrink-0 ms-3">
 − {formatCompactToman(k.amount)}
 </p>
 </div>
 ))}
 <div className="flex items-center justify-between rounded-lg bg-destructive/5 border border-destructive/20 p-3 mt-2">
 <div className="flex items-center gap-2">
 <AlertTriangle className="h-4 w-4 text-destructive" />
 <span className="text-xs font-medium">جمع کسورات قانونی</span>
 </div>
 <p className="text-sm font-bold text-destructive tnum">
 − {formatCompactToman(sampleTotal)}
 </p>
 </div>
 <div className="flex items-center justify-between rounded-lg bg-success/5 border border-success/20 p-3">
 <div className="flex items-center gap-2">
 <CheckCircle2 className="h-4 w-4 text-success" />
 <span className="text-xs font-medium">خالص پرداختی کارفرما</span>
 </div>
 <p className="text-sm font-bold text-success tnum">
 {formatCompactToman(sampleProject.contractValue - sampleTotal)}
 </p>
 </div>
 </div>
 ): (
 <EmptyState
 icon={Percent}
 title="کسوراتی برای نمایش وجود ندارد"
 description="با ثبت اولین پروژه، کسورات قانونی آن شامل بیمه، مالیات و حسن انجام کار به‌صورت خودکار محاسبه و نمایش داده می‌شود."
 />
 )}
 </CardContent>
 </Card>

 {/* صورت‌وضعیت‌ها */}
 <Card className="card-hover">
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
 <FileBarChart className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 صورت‌وضعیت‌ها
 <Badge variant="outline" className="text-[10px] border-warning/30 text-warning">
 داده‌های نمونه
 </Badge>
 </CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 آخرین صورت‌وضعیت‌های صادرشده — در نسخه‌ی بعدی از API بارگذاری می‌شود
 </p>
 </div>
 </div>
 <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-muted-foreground" disabled>
 همه
 <ChevronLeft className="h-3 w-3" />
 </Button>
 </CardHeader>
 <CardContent className="p-0">
 {STATEMENTS.length === 0? (
 <EmptyState
 icon={FileBarChart}
 title="هنوز صورت‌وضعیتی صادر نشده"
 description="برای صدور اولین صورت‌وضعیت، یک پروژه فعال انتخاب و دوره مربوطه را تعیین کنید."
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[560px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-3 py-2.5">شماره</th>
 <th scope="col" className="font-medium px-3 py-2.5">پروژه</th>
 <th scope="col" className="font-medium px-3 py-2.5">دوره</th>
 <th scope="col" className="font-medium px-3 py-2.5">مبلغ</th>
 <th scope="col" className="font-medium px-3 py-2.5">کسورات</th>
 <th scope="col" className="font-medium px-3 py-2.5">خالص</th>
 <th scope="col" className="font-medium px-3 py-2.5">وضعیت</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {STATEMENTS.map((s, i) => (
 <tr
 key={i}
 className="border-b border-border/40 transition-colors animate-stagger"
 style={{ animationDelay: `${i * 40}ms` }}
 >
 <td className="px-3 py-3 font-mono text-xs">{s.number}</td>
 <td className="px-3 py-3 font-medium">
 <span className="block text-xs truncate max-w-[140px]">{s.project}</span>
 </td>
 <td className="px-3 py-3 text-muted-foreground text-xs">{s.period}</td>
 <td className="px-3 py-3 font-medium">{formatCompactToman(s.amount)}</td>
 <td className="px-3 py-3 text-destructive text-xs">
 − {formatCompactToman(s.ksourat)}
 </td>
 <td className="px-3 py-3 font-medium text-success">
 {formatCompactToman(s.amount - s.ksourat)}
 </td>
 <td className="px-3 py-3">
 <Badge
 variant="secondary"
 className={`text-[10px] ${SW_STATUS_BADGE[s.status]}`}
 >
 {SW_STATUS_FA[s.status]}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 </div>
 );
}

/* ============ StatCard ============ */
function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent,
 delay,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "info" | "success" | "warning";
 delay: number;
}) {
 const accentMap: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 info: "bg-info/10 text-info",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
 };
 return (
 <Card
 className="card-hover animate-stagger"
 style={{ animationDelay: `${delay}ms` }}
 >
 <CardContent className="p-4">
 <div className="flex items-start justify-between mb-2">
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[accent]}`}>
 <Icon className="h-4.5 w-4.5" />
 </div>
 </div>
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="text-lg font-bold text-foreground tnum leading-tight mt-0.5">{value}</p>
 <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
 </CardContent>
 </Card>
 );
}
