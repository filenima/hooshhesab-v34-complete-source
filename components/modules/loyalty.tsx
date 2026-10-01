"use client";

/**
 * LoyaltyModule — باشگاه مشتریان + امتیاز وفاداری کاربر
 *
 * داده‌ها:
 * - /api/marketing/loyalty?history=1&limit=50 موجودی و تاریخچه امتیاز کاربر فعلی
 * - /api/parties?type=CUSTOMER اعضای باشگاه (از طرف‌حساب‌ها)
 *
 * توکن از localStorage (hoshhesab_user_token) خوانده می‌شود. در نبود توکن،
 * پیام «لطفاً وارد شوید» نمایش داده می‌شود ولی UI با مقادیر صفر قابل مشاهده می‌ماند.
 *
 * سطح وفاداری کاربر از روی موجودی محاسبه می‌شود:
 * 0-100 = برنزی
 * 101-500 = نقره‌ای
 * 501-999 = طلایی
 * 1000+ = پلاتینیوم
 */

import * as React from "react";
import {
 Crown,
 Gift,
 Star,
 Users,
 Award,
 Plus,
 Send,
 FileBarChart,
 Percent,
 ChevronLeft,
 Phone,
 Loader2,
 AlertCircle,
 LogIn,
 History,
 RefreshCw,
 TrendingUp,
 TrendingDown,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatCompactToman, toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

/* ============ types ============ */
type Tier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

interface LoyaltyBalanceDTO {
 userId: string;
 balance: number;
 totalEarned: number;
 totalRedeemed: number;
 historyCount: number;
}

interface LoyaltyHistoryItemDTO {
 id: string;
 points: number;
 reason: string;
 referenceId: string | null;
 note: string | null;
 createdAt: string;
}

interface Member {
 id: string;
 name: string;
 phone: string;
 tier: Tier;
 points: number;
 totalBuy: number;
 lastBuy?: string;
}

const TIER_LABEL: Record<Tier, string> = {
 BRONZE: "برنزی",
 SILVER: "نقره‌ای",
 GOLD: "طلایی",
 PLATINUM: "پلاتینیوم",
};

const TIER_BADGE: Record<Tier, string> = {
 BRONZE: "bg-warning/10 text-warning border-warning/30",
 SILVER: "bg-muted text-muted-foreground border-border",
 GOLD: "bg-primary/10 text-primary border-primary/30",
 PLATINUM: "bg-info/10 text-info border-info/30",
};

const TIER_ACCENT: Record<Tier, string> = {
 BRONZE: "bg-warning/10 text-warning",
 SILVER: "bg-muted text-muted-foreground",
 GOLD: "bg-primary/10 text-primary",
 PLATINUM: "bg-info/10 text-info",
};

const TIER_ICON: Record<Tier, LucideIcon> = {
 BRONZE: Award,
 SILVER: Award,
 GOLD: Crown,
 PLATINUM: Crown,
};

const TIER_COLOR_BAR: Record<Tier, string> = {
 BRONZE: "bg-warning",
 SILVER: "bg-muted-foreground",
 GOLD: "bg-primary",
 PLATINUM: "bg-info",
};

// آستانه‌های سطح وفاداری کاربر (بر اساس موجودی فعلی):
// 0-100 = برنزی
// 101-500 = نقره‌ای
// 501-999 = طلایی
// 1000+ = پلاتینیوم
const TIER_THRESHOLD: Record<Tier, number> = {
 BRONZE: 0,
 SILVER: 101,
 GOLD: 501,
 PLATINUM: 1000,
};

interface PointsRule {
 rule: string;
 desc: string;
 icon: LucideIcon;
 accent: string;
}

const POINTS_RULES: PointsRule[] = [
 {
 rule: "صدور فاکتور",
 desc: "۱۰ امتیاز برای هر فاکتور جدید",
 icon: FileBarChart,
 accent: "bg-primary/10 text-primary",
 },
 {
 rule: "ورود روزانه",
 desc: "۵ امتیاز در روز (یک‌بار در روز)",
 icon: LogIn,
 accent: "bg-info/10 text-info",
 },
 {
 rule: "معرفی دوست",
 desc: "۱۰۰ امتیاز وقتی معرفی‌شده ثبت‌نام می‌کند",
 icon: Users,
 accent: "bg-success/10 text-success",
 },
 {
 rule: "تکمیل پروفایل",
 desc: "۲۰ امتیاز برای تکمیل اطلاعات پروفایل",
 icon: Award,
 accent: "bg-warning/10 text-warning",
 },
];

// برچسب‌های فارسی دلایل امتیاز
const REASON_LABEL: Record<string, string> = {
 INVOICE_CREATED: "صدور فاکتور",
 DAILY_LOGIN: "ورود روزانه",
 REFERRAL: "معرفی دوست",
 PROFILE_COMPLETE: "تکمیل پروفایل",
 BONUS: "پاداش",
 REDEEM: "مصرف امتیاز",
 MANUAL: "ثبت دستی",
};

const REASON_ICON: Record<string, LucideIcon> = {
 INVOICE_CREATED: FileBarChart,
 DAILY_LOGIN: LogIn,
 REFERRAL: Users,
 PROFILE_COMPLETE: Award,
 BONUS: Gift,
 REDEEM: Percent,
 MANUAL: Award,
};

const ZERO_BALANCE: LoyaltyBalanceDTO = {
 userId: "",
 balance: 0,
 totalEarned: 0,
 totalRedeemed: 0,
 historyCount: 0,
};

function calcTier(points: number): Tier {
 if (points >= TIER_THRESHOLD.PLATINUM) return "PLATINUM";
 if (points >= TIER_THRESHOLD.GOLD) return "GOLD";
 if (points >= TIER_THRESHOLD.SILVER) return "SILVER";
 return "BRONZE";
}

function nextTier(t: Tier): Tier | null {
 if (t === "BRONZE") return "SILVER";
 if (t === "SILVER") return "GOLD";
 if (t === "GOLD") return "PLATINUM";
 return null;
}

/** تبدیل ISO به تاریخ شمسی خلاصه */
function formatJalaliDate(iso: string): string {
 try {
 const d = new Date(iso);
 if (isNaN(d.getTime())) return "—";
 return d.toLocaleDateString("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 });
 } catch {
 return "—";
 }
}

/* ============ کامپوننت اصلی ============ */
export function LoyaltyModule() {
 const { toast } = useToast();
 const [members, setMembers] = React.useState<Member[]>([]);
 const [balance, setBalance] = React.useState<LoyaltyBalanceDTO>(ZERO_BALANCE);
 const [history, setHistory] = React.useState<LoyaltyHistoryItemDTO[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [refreshing, setRefreshing] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 const [notLoggedIn, setNotLoggedIn] = React.useState(false);
 const [refreshKey, setRefreshKey] = React.useState(0);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 setError(null);

 const token =
 typeof window!== "undefined"
? localStorage.getItem("hoshhesab_user_token") || ""
: "";

 if (!token) {
 // نبود توکن پیام لاگین + UI با مقادیر صفر
 setNotLoggedIn(true);
 setBalance(ZERO_BALANCE);
 setHistory([]);
 setMembers([]);
 setLoading(false);
 return;
 }

 setNotLoggedIn(false);

 let loyaltyFailed = false;

 // ===== دریافت موجودی و تاریخچه امتیاز وفاداری کاربر =====
 try {
 const lRes = await authFetch(
 "/api/marketing/loyalty?history=1&limit=50",
 { cache: "no-store" }
 );

 if (lRes.status === 401) {
 setNotLoggedIn(true);
 setBalance(ZERO_BALANCE);
 setHistory([]);
 setError("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.");
 setLoading(false);
 return;
 }

 if (!lRes.ok) {
 throw new Error(`خطای سرور: ${lRes.status}`);
 }

 const lj = await lRes.json();
 const ld = lj?.data?? lj;

 if (ld?.balance) {
 setBalance({
 userId: String(ld.balance.userId?? ""),
 balance: Number(ld.balance.balance?? 0),
 totalEarned: Number(ld.balance.totalEarned?? 0),
 totalRedeemed: Number(ld.balance.totalRedeemed?? 0),
 historyCount: Number(ld.balance.historyCount?? 0),
 });
 } else {
 setBalance(ZERO_BALANCE);
 }

 if (Array.isArray(ld?.history)) {
 setHistory(ld.history as LoyaltyHistoryItemDTO[]);
 } else {
 setHistory([]);
 }
 } catch (err) {
 console.error("Loyalty fetch error:", err);
 loyaltyFailed = true;
 setBalance(ZERO_BALANCE);
 setHistory([]);
 setError("دریافت اطلاعات امتیاز وفاداری ناموفق بود. لطفاً دوباره تلاش کنید.");
 }

 // ===== دریافت اعضا از parties (type=CUSTOMER) — اختیاری =====
 // این بخش در صورت خطا، کل ماژول را خراب نمی‌کند.
 try {
 const pRes = await authFetch("/api/parties?type=CUSTOMER&limit=20", {
 cache: "no-store",
 });
 if (pRes.ok) {
 const pj = await pRes.json();
 const parties = pj?.parties?? pj?.data?? [];
 const ms: Member[] = (Array.isArray(parties)? parties: []).map(
 (p: Record<string, unknown>) => {
 const points = Number(p?.loyaltyPoints?? p?.points?? 0);
 const totalBuy = Number(p?.totalBuy?? p?.totalPurchases?? 0);
 return {
 id: String(p?.id?? ""),
 name: String(p?.name?? "—"),
 phone: String(p?.phone?? p?.mobile?? "—"),
 tier: calcTier(points),
 points,
 totalBuy,
 lastBuy: p?.lastBuy? String(p.lastBuy): undefined,
 };
 }
 );
 ms.sort((a, b) => b.points - a.points);
 setMembers(ms);
 } else {
 setMembers([]);
 }
 } catch {
 setMembers([]);
 } finally {
 setLoading(false);
 // اگر فقط loyalty خطا داده بود، error را حفظ کن؛ در غیر این صورت پاک کن
 if (!loyaltyFailed) setError(null);
 }
 }, []);

 React.useEffect(() => {
 void fetchData();
 }, [refreshKey, fetchData]);

 const handleRefresh = async () => {
 setRefreshing(true);
 setRefreshKey((k) => k + 1);
 // یک تأخیر کوچک تا فرآیند fetch آغاز شود — fetchData خودش state را مدیریت می‌کند.
 await new Promise((r) => setTimeout(r, 50));
 setRefreshing(false);
 toast({
 title: "به‌روزرسانی شد",
 description: "اطلاعات امتیاز وفاداری به‌روز شد.",
 });
 };

 const handleNewMember = () => {
 toast({
 title: "افزودن عضو",
 description:
 "اعضای باشگاه مشتریان به‌صورت خودکار از طرف‌حساب‌ها ایجاد می‌شوند. برای افزودن عضو جدید، یک طرف‌حساب مشتری در بخش «مشتریان (CRM)» ثبت کنید.",
 });
 };

 const handleReport = () => {
 toast({
 title: "گزارش باشگاه مشتریان",
 description: "گزارش تفصیلی وفاداری مشتریان در حال آماده‌سازی است.",
 });
 };

 const handleBulkDiscount = () => {
 toast({
 title: "ارسال تخفیف گروهی",
 description: "فرم ارسال تخفیف گروهی به اعضای باشگاه فعال شد.",
 });
 };

 const handleDefineRule = () => {
 toast({
 title: "تعریف قانون امتیاز",
 description:
 "قوانین امتیازدهی فعلی در کارت زیر نمایش داده شده‌اند. برای تغییر با پشتیبانی تماس بگیرید.",
 });
 };

 // ===== محاسبات مشتق‌شده =====
 const currentBalance = balance.balance;
 const currentTier = calcTier(currentBalance);
 const nt = nextTier(currentTier);
 const ntThreshold = nt? TIER_THRESHOLD[nt]: currentBalance;
 const prevThreshold = TIER_THRESHOLD[currentTier];
 const tierProgress = nt
? Math.min(
 100,
 Math.max(
 0,
 Math.round(
 ((currentBalance - prevThreshold) /
 Math.max(1, ntThreshold - prevThreshold)) *
 100
 )
 )
 )
: 100;
 const pointsToNext = nt? Math.max(0, ntThreshold - currentBalance): 0;

 // توزیع سطوح اعضا (از parties)
 const tierDist = React.useMemo(() => {
 const out: Record<Tier, number> = { BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0 };
 for (const m of members) out[m.tier]++;
 return out;
 }, [members]);

 const totalTierCount = members.length;

 // ===== ۴ کارت آمار — حالا به داده‌های واقعی امتیاز وفاداری متصل =====
 const STATS_CARDS: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "info" | "success" | "warning";
 }[] = [
 {
 icon: Star,
 label: "موجودی فعلی",
 value: toPersianDigits(currentBalance.toLocaleString("en-US")),
 sub: `سطح ${TIER_LABEL[currentTier]}`,
 accent: "primary",
 },
 {
 icon: TrendingUp,
 label: "امتیاز کسب‌شده",
 value: toPersianDigits(balance.totalEarned.toLocaleString("en-US")),
 sub: "از ابتدا",
 accent: "info",
 },
 {
 icon: TrendingDown,
 label: "امتیاز مصرف‌شده",
 value: toPersianDigits(balance.totalRedeemed.toLocaleString("en-US")),
 sub: "از ابتدا",
 accent: "warning",
 },
 {
 icon: History,
 label: "تعداد تراکنش‌ها",
 value: toPersianDigits(String(balance.historyCount)),
 sub: "در تاریخچه",
 accent: "success",
 },
 ];

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر + اقدامات */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <p className="text-xs text-muted-foreground mb-0.5">وفاداری مشتریان</p>
 <h2 className="text-xl font-bold text-foreground">باشگاه مشتریان</h2>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 h-9"
 onClick={handleRefresh}
 disabled={refreshing || loading}
 >
 {refreshing || loading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 به‌روزرسانی
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={handleReport}>
 <FileBarChart className="h-3.5 w-3.5" />
 گزارش
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={handleBulkDiscount}>
 <Send className="h-3.5 w-3.5" />
 ارسال تخفیف گروهی
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={handleDefineRule}>
 <Percent className="h-3.5 w-3.5" />
 تعریف قانون امتیاز
 </Button>
 <Button size="sm" className="gap-1.5 h-9" onClick={handleNewMember}>
 <Plus className="h-3.5 w-3.5" />
 عضو جدید
 </Button>
 </div>
 </div>

 {/* بنر «لطفاً وارد شوید» — نبود توکن */}
 {notLoggedIn && (
 <div className="flex items-center gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-md bg-warning/10 text-warning shrink-0">
 <LogIn className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-foreground">
 برای مشاهده امتیاز وفاداری وارد شوید
 </p>
 <p className="text-xs text-muted-foreground mt-0.5">
 اطلاعات نمایش‌داده‌شده صفر است. لطفاً برای دیدن امتیازهای واقعی خود وارد حساب
 کاربری شوید.
 </p>
 </div>
 <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleRefresh}>
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 )}

 {/* بنر خطا — failure در دریافت loyalty */}
 {error &&!notLoggedIn && (
 <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive shrink-0">
 <AlertCircle className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-foreground">خطا در دریافت اطلاعات</p>
 <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
 </div>
 <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleRefresh}>
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 )}

 {/* آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {STATS_CARDS.map((s, i) => (
 <StatCard key={s.label} {...s} delay={i * 60} />
 ))}
 </div>

 {/* کارت سطح فعلی + پیشرفت تا سطح بعدی */}
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex flex-col sm:flex-row sm:items-center gap-4">
 <div className="flex items-center gap-3">
 <div
 className={`flex h-12 w-12 items-center justify-center rounded-xl ${TIER_ACCENT[currentTier]}`}
 >
 {(() => {
 const Icon = TIER_ICON[currentTier];
 return <Icon className="h-5 w-5" />;
 })()}
 </div>
 <div>
 <p className="text-[11px] text-muted-foreground">سطح فعلی شما</p>
 <div className="flex items-center gap-2 mt-0.5">
 <p className="text-base font-bold">{TIER_LABEL[currentTier]}</p>
 <Badge variant="outline" className={`text-[10px] ${TIER_BADGE[currentTier]}`}>
 {toPersianDigits(currentBalance.toLocaleString("en-US"))} امتیاز
 </Badge>
 </div>
 </div>
 </div>
 <div className="flex-1 min-w-0">
 {loading? (
 <div className="flex items-center gap-2">
 <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
 <span className="text-xs text-muted-foreground">در حال بارگذاری...</span>
 </div>
 ): nt? (
 <div className="space-y-1.5">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">
 پیشرفت تا سطح {TIER_LABEL[nt]}
 </span>
 <span className="font-medium tnum">
 {toPersianDigits(currentBalance.toLocaleString("en-US"))} /{" "}
 {toPersianDigits(ntThreshold.toLocaleString("en-US"))}
 </span>
 </div>
 <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
 <div
 className={`absolute inset-y-0 start-0 ${TIER_COLOR_BAR[currentTier]} transition-all duration-500`}
 style={{ width: `${tierProgress}%` }}
 />
 </div>
 <p className="text-[10px] text-muted-foreground">
 {pointsToNext > 0
? `${toPersianDigits(pointsToNext.toLocaleString("en-US"))} امتیاز تا سطح ${TIER_LABEL[nt]}`
: `آماده ارتقا به سطح ${TIER_LABEL[nt]}`}
 </p>
 </div>
 ): (
 <div className="space-y-1.5">
 <p className="text-xs font-medium">بالاترین سطح وفاداری</p>
 <p className="text-[10px] text-muted-foreground">
 شما در بالاترین سطح ممکن قرار دارید. ادامه فعالیت‌ها برای حفظ سطح توصیه
 می‌شود.
 </p>
 </div>
 )}
 </div>
 </div>
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 {/* توزیع سطوح + قوانین امتیاز */}
 <div className="space-y-3">
 {/* توزیع سطوح اعضا */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Crown className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">توزیع سطوح اعضا</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(totalTierCount)} عضو کل
 </p>
 </div>
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 {loading? (
 <div className="flex items-center justify-center py-6">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): totalTierCount === 0? (
 <div className="text-center py-6 text-xs text-muted-foreground">
 هنوز عضوی ثبت نشده است.
 </div>
 ): (
 <div className="space-y-3">
 {(Object.keys(tierDist) as Tier[]).map((t, i) => {
 const Icon = TIER_ICON[t];
 const count = tierDist[t];
 const pct =
 totalTierCount > 0
? Math.round((count / totalTierCount) * 100)
: 0;
 return (
 <div
 key={t}
 className="space-y-1.5 animate-stagger"
 style={{ animationDelay: `${i * 50}ms` }}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div
 className={`flex h-6 w-6 items-center justify-center rounded-md ${TIER_ACCENT[t]}`}
 >
 <Icon className="h-3 w-3" />
 </div>
 <span className="text-xs font-medium">{TIER_LABEL[t]}</span>
 </div>
 <span className="text-xs font-medium tnum">
 {toPersianDigits(count)}
 <span className="text-muted-foreground ms-1 text-[10px]">
 ({toPersianDigits(pct)}٪)
 </span>
 </span>
 </div>
 <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
 <div
 className={`absolute inset-y-0 start-0 ${TIER_COLOR_BAR[t]} transition-all duration-500`}
 style={{ width: `${pct}%` }}
 />
 </div>
 </div>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>

 {/* قوانین امتیازدهی */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
 <Star className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">قوانین امتیازدهی</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 نحوه کسب امتیاز
 </p>
 </div>
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 <div className="space-y-2">
 {POINTS_RULES.map((r, i) => {
 const Icon = r.icon;
 return (
 <div
 key={i}
 className="flex items-start gap-2.5 rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors"
 >
 <div
 className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${r.accent}`}
 >
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs font-medium">{r.rule}</p>
 <p className="text-[10px] text-muted-foreground mt-0.5">{r.desc}</p>
 </div>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>
 </div>

 {/* اعضای برتر (از parties) */}
 <Card className="lg:col-span-2 card-hover">
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
 <Award className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">اعضای برتر</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 مرتب‌شده بر اساس امتیاز
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 gap-1 text-muted-foreground"
 onClick={() =>
 toast({
 title: "همه اعضا",
 description: "لیست کامل اعضا در حال آماده‌سازی است.",
 })
 }
 >
 همه اعضا
 <ChevronLeft className="h-3 w-3" />
 </Button>
 </CardHeader>
 <CardContent className="p-0">
 {loading? (
 <div className="flex items-center justify-center py-10">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): members.length === 0? (
 <div className="text-center py-10 text-sm text-muted-foreground">
 <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
 هنوز عضوی ثبت نشده است.
 <p className="text-[11px] mt-1">
 با ثبت طرف‌حساب مشتری در CRM، به‌صورت خودکار عضو باشگاه می‌شوند.
 </p>
 </div>
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[680px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">نام</th>
 <th scope="col" className="font-medium px-4 py-2.5">تلفن</th>
 <th scope="col" className="font-medium px-4 py-2.5">سطح</th>
 <th scope="col" className="font-medium px-4 py-2.5">امتیاز</th>
 <th scope="col" className="font-medium px-4 py-2.5">خرید کل</th>
 <th scope="col" className="font-medium px-4 py-2.5">آخرین خرید</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {members.slice(0, 10).map((m, i) => (
 <tr
 key={m.id || i}
 className="border-b border-border/40 transition-colors animate-stagger"
 style={{ animationDelay: `${i * 40}ms` }}
 >
 <td className="px-4 py-3">
 <div className="flex items-center gap-2">
 <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-bold shrink-0">
 {m.name.charAt(0)}
 </div>
 <span className="text-xs font-medium">{m.name}</span>
 </div>
 </td>
 <td className="px-4 py-3 text-muted-foreground">
 <div className="flex items-center gap-1.5 text-[11px]">
 <Phone className="h-3 w-3 text-muted-foreground/60" />
 <span className="font-mono">{m.phone}</span>
 </div>
 </td>
 <td className="px-4 py-3">
 <Badge variant="outline" className={`text-[10px] ${TIER_BADGE[m.tier]}`}>
 {TIER_LABEL[m.tier]}
 </Badge>
 </td>
 <td className="px-4 py-3">
 <div className="flex items-center gap-1.5">
 <Star className="h-3 w-3 text-primary" fill="currentColor" />
 <span className="text-xs font-bold">
 {toPersianDigits(m.points.toLocaleString("en-US"))}
 </span>
 </div>
 </td>
 <td className="px-4 py-3 font-medium">
 {m.totalBuy > 0? formatCompactToman(m.totalBuy): "—"}
 </td>
 <td className="px-4 py-3 text-muted-foreground text-xs">
 {m.lastBuy?? "—"}
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

 {/* تاریخچه تراکنش‌های امتیاز وفاداری کاربر */}
 <Card className="card-hover">
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
 <History className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">تاریخچه تراکنش‌های امتیاز</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(history.length)} تراکنش اخیر
 </p>
 </div>
 </div>
 {history.length > 0 && (
 <Badge variant="outline" className="text-[10px] gap-1">
 <Star className="h-3 w-3 text-primary" fill="currentColor" />
 موجودی: {toPersianDigits(currentBalance.toLocaleString("en-US"))}
 </Badge>
 )}
 </CardHeader>
 <CardContent className="p-0">
 {loading? (
 <div className="flex items-center justify-center py-10">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ): notLoggedIn? (
 <div className="text-center py-10 text-sm text-muted-foreground">
 <LogIn className="h-8 w-8 mx-auto mb-2 opacity-40" />
 برای مشاهده تاریخچه تراکنش‌ها وارد شوید.
 <p className="text-[11px] mt-1">
 با فعالیت‌هایی مثل صدور فاکتور یا ورود روزانه امتیاز کسب کنید.
 </p>
 </div>
 ): history.length === 0? (
 <div className="text-center py-10 text-sm text-muted-foreground">
 <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
 هنوز تراکنشی ثبت نشده است.
 <p className="text-[11px] mt-1">
 با فعالیت‌هایی مثل صدور فاکتور یا ورود روزانه امتیاز کسب کنید.
 </p>
 </div>
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[680px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">دلیل</th>
 <th scope="col" className="font-medium px-4 py-2.5">نوع</th>
 <th scope="col" className="font-medium px-4 py-2.5">امتیاز</th>
 <th scope="col" className="font-medium px-4 py-2.5">یادداشت</th>
 <th scope="col" className="font-medium px-4 py-2.5">تاریخ</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {history.slice(0, 20).map((h, i) => {
 const isRedeem = h.points < 0;
 const ReasonIcon = REASON_ICON[h.reason] || Award;
 return (
 <tr
 key={h.id || i}
 className="border-b border-border/40 transition-colors animate-stagger"
 style={{ animationDelay: `${i * 30}ms` }}
 >
 <td className="px-4 py-3">
 <div className="flex items-center gap-2">
 <div
 className={`flex h-7 w-7 items-center justify-center rounded-md ${
 isRedeem
? "bg-warning/10 text-warning"
: "bg-success/10 text-success"
 }`}
 >
 <ReasonIcon className="h-3.5 w-3.5" />
 </div>
 <span className="text-xs font-medium">
 {REASON_LABEL[h.reason] || h.reason}
 </span>
 </div>
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="outline"
 className={`text-[10px] ${
 isRedeem
? "bg-warning/10 text-warning border-warning/30"
: "bg-success/10 text-success border-success/30"
 }`}
 >
 {isRedeem? "مصرف": "کسب"}
 </Badge>
 </td>
 <td className="px-4 py-3">
 <span
 className={`text-xs font-bold ${
 isRedeem? "text-warning": "text-success"
 }`}
 >
 {isRedeem? "−": "+"}
 {toPersianDigits(Math.abs(h.points).toLocaleString("en-US"))}
 </span>
 </td>
 <td className="px-4 py-3 text-muted-foreground text-xs">
 {h.note || "—"}
 </td>
 <td className="px-4 py-3 text-muted-foreground text-xs">
 {formatJalaliDate(h.createdAt)}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>
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
