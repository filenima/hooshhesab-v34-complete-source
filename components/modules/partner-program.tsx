"use client";

// ============ Partner Program Module — هوش ============
// پورتال همکاران — فرم درخواست، مستندات، داشبورد درآمد

import * as React from "react";
import {
 Handshake,
 Building2,
 Mail,
 Phone,
 Globe,
 Loader2,
 CheckCircle2,
 ExternalLink,
 Users,
 TrendingUp,
 Wallet,
 Key,
 Copy,
 Award,
 Star,
 Trophy,
 Crown,
 Medal,
 Timer,
 Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toPersianDigits, formatToman, formatCompactToman } from "@/lib/persian";

interface Partner {
 id: string;
 companyName: string;
 partnerType: string;
 website: string;
 description: string;
 tier: string;
 since: string;
 revenueShare: number;
}

const TIER_LABELS: Record<string, { label: string; color: string }> = {
 bronze: { label: "برنزی", color: "bg-amber-700" },
 silver: { label: "نقره‌ای", color: "bg-slate-400" },
 gold: { label: "طلایی", color: "bg-amber-500" },
 platinum: { label: "پلاتین", color: "bg-primary" },
};

const TYPE_LABELS: Record<string, string> = {
 referral: "معرفی",
 reseller: "نماینده‌ی فروش",
 technology: "فناوری",
 integration: "اتصال",
};

export function PartnerProgram({ token }: { token?: string }) {
 return (
 <div className="space-y-6 p-4">
 <div>
 <h2 className="flex items-center gap-2 text-2xl font-bold">
 <Handshake className="h-6 w-6 text-primary" />
 برنامه‌ی همکاران
 </h2>
 <p className="text-sm text-muted-foreground">
 با هوش همکار شوید و از درآمد پایدار بهره‌مند شوید
 </p>
 </div>

 {/* Task 3-c — مسابقه رفرال به‌عنوان تب پیش‌فرض و برجسته */}
 <Tabs defaultValue="contest">
 <TabsList>
 <TabsTrigger value="contest" className="gap-1.5">
 <Trophy className="h-3.5 w-3.5 text-amber-500" />
 مسابقه رفرال
 </TabsTrigger>
 <TabsTrigger value="apply">درخواست همکاری</TabsTrigger>
 <TabsTrigger value="partners">همکاران فعلی</TabsTrigger>
 <TabsTrigger value="dashboard">داشبورد درآمد</TabsTrigger>
 <TabsTrigger value="docs">مستندات</TabsTrigger>
 </TabsList>

 <TabsContent value="contest">
 <ReferralContest token={token} />
 </TabsContent>

 <TabsContent value="apply">
 <ApplicationForm token={token} />
 </TabsContent>

 <TabsContent value="partners">
 <PartnersList />
 </TabsContent>

 <TabsContent value="dashboard">
 <RevenueDashboard token={token} />
 </TabsContent>

 <TabsContent value="docs">
 <IntegrationDocs />
 </TabsContent>
 </Tabs>
 </div>
 );
}

// ============ Task 3-c — مسابقه رفرال (نمایش برای کاربران) ============
// جایزه‌ها: نفر اول ۲۰ میلیون تومان | دوم و سوم ۱۰ میلیون | نزولی تا نفر دهم ۱ میلیون
// لیدربورد ۱۰ نفر برتر کل پلتفرم + رتبه خود کاربر + شمارش معکوس پایان مسابقه.

interface ContestLeaderRow {
 rank: number;
 displayName: string;
 referralCount: number;
 totalReward: number;
 prizeToman: number;
 isMe: boolean;
}

interface ContestData {
 contest: {
 active: boolean;
 title: string;
 prizes: number[];
 startDate: string | null;
 endDate: string | null;
 windowLabel: string;
 rules: { metric: string; note: string };
 };
 leaders: ContestLeaderRow[];
 me: { rank: number; referralCount: number; totalReward: number; inTop: boolean };
}

/** شمارش معکوس پایان مسابقه — متن فارسی روز/ساعت */
function useCountdown(endDateIso: string | null): string | null {
 const [label, setLabel] = React.useState<string | null>(null);
 React.useEffect(() => {
 if (!endDateIso) {
 setLabel(null);
 return;
 }
 const end = new Date(endDateIso).getTime();
 if (Number.isNaN(end)) {
 setLabel(null);
 return;
 }
 const tick = () => {
 const diff = end - Date.now();
 if (diff <= 0) {
 setLabel("مسابقه پایان یافته است");
 return;
 }
 const days = Math.floor(diff / 86_400_000);
 const hours = Math.floor((diff % 86_400_000) / 3_600_000);
 const minutes = Math.floor((diff % 3_600_000) / 60_000);
 setLabel(
 days > 0
 ? `${toPersianDigits(days)} روز و ${toPersianDigits(hours)} ساعت`
 : `${toPersianDigits(hours)} ساعت و ${toPersianDigits(minutes)} دقیقه`
 );
 };
 tick();
 const timer = setInterval(tick, 30_000);
 return () => clearInterval(timer);
 }, [endDateIso]);
 return label;
}

function ReferralContest({ token }: { token?: string }) {
 const [data, setData] = React.useState<ContestData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);

 React.useEffect(() => {
 const t =
 token ||
 (typeof window !== "undefined" ? localStorage.getItem("hoshhesab_user_token") || "" : "");
 let cancelled = false;
 (async () => {
 try {
 const res = await fetch("/api/referrals/leaderboard", {
 headers: t ? { Authorization: `Bearer ${t}` } : {},
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json.error || "خطا در دریافت مسابقه");
 if (!cancelled) setData(json as ContestData);
 } catch (err) {
 if (!cancelled) setError(err instanceof Error ? err.message : "خطای ناشناخته");
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [token]);

 const countdown = useCountdown(data?.contest.endDate ?? null);

 if (loading) {
 return (
 <div className="space-y-3">
 <Skeleton className="h-24 w-full rounded-xl" />
 <div className="grid grid-cols-3 gap-3">
 <Skeleton className="h-28 rounded-xl" />
 <Skeleton className="h-28 rounded-xl" />
 <Skeleton className="h-28 rounded-xl" />
 </div>
 <Skeleton className="h-64 w-full rounded-xl" />
 </div>
 );
 }

 if (error || !data) {
 return (
 <Card>
 <CardContent className="py-10 text-center space-y-2">
 <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto" />
 <p className="text-sm text-muted-foreground">{error || "مسابقه در دسترس نیست"}</p>
 </CardContent>
 </Card>
 );
 }

 if (!data.contest.active) {
 return (
 <Card>
 <CardContent className="py-10 text-center space-y-2">
 <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto" />
 <p className="text-sm font-medium">مسابقه رفرال فعلاً برگزار نمی‌شود</p>
 <p className="text-xs text-muted-foreground">
 به‌محض شروع دورهٔ جدید، جایزه‌ها و جدول رتبه‌بندی همین‌جا نمایش داده می‌شود.
 </p>
 </CardContent>
 </Card>
 );
 }

 const prizes = data.contest.prizes;
 const top3 = data.leaders.slice(0, 3);

 return (
 <div className="space-y-4">
 {/* هدر مسابقه */}
 <Card className="overflow-hidden border-amber-500/30">
 <div className="flex flex-wrap items-center gap-3 bg-gradient-to-l from-amber-500/10 via-primary/5 to-transparent px-5 py-4">
 <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500 shrink-0">
 <Trophy className="h-6 w-6" />
 </div>
 <div className="flex-1 min-w-[180px]">
 <h3 className="text-lg font-bold text-foreground flex items-center gap-2 flex-wrap">
 {data.contest.title}
 <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
 <Sparkles className="h-3 w-3" />
 جوایز نقدی تا {formatCompactToman(prizes[0] ?? 0)}
 </Badge>
 </h3>
 <p className="text-xs text-muted-foreground mt-1">
 {data.contest.rules.metric} — {data.contest.windowLabel}
 </p>
 </div>
 {countdown && (
 <Badge variant="outline" className="gap-1.5 bg-primary/5 text-primary border-primary/30 shrink-0">
 <Timer className="h-3.5 w-3.5" />
 {countdown} تا پایان
 </Badge>
 )}
 </div>
 {data.me.rank > 0 && (
 <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-2.5 bg-card">
 <p className="text-xs text-muted-foreground">
 رتبه شما در مسابقه: <span className="font-bold text-primary">{toPersianDigits(data.me.rank)}</span>
 <span className="mx-1.5 text-border" aria-hidden>•</span>
 دعوت‌های موفق شما: <span className="font-bold text-foreground">{toPersianDigits(data.me.referralCount)}</span>
 </p>
 {!data.me.inTop && (
 <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/30 shrink-0">
 خارج از ۱۰ نفر اول — دعوت بیشتر = رتبه بهتر
 </Badge>
 )}
 </div>
 )}
 </Card>

 {/* سکو سه نفر اول */}
 <div className="grid grid-cols-3 gap-2 sm:gap-3">
 {[0, 1, 2].map((i) => {
 const row = top3[i];
 const isGold = i === 0;
 const isSilver = i === 1;
 const podiumClass = isGold
 ? "border-amber-500/50 bg-amber-500/10"
 : isSilver
 ? "border-slate-400/50 bg-slate-400/10"
 : "border-orange-700/50 bg-orange-700/10";
 const iconClass = isGold ? "text-amber-500" : isSilver ? "text-slate-400" : "text-orange-700";
 return (
 <Card key={i} className={`border ${podiumClass} ${i === 0 ? "sm:-translate-y-2" : ""}`}>
 <CardContent className="p-3 sm:p-4 text-center space-y-1.5">
 <div className="flex items-center justify-center">
 {isGold ? (
 <Crown className={`h-6 w-6 ${iconClass}`} />
 ) : (
 <Medal className={`h-5 w-5 ${iconClass}`} />
 )}
 </div>
 <p className="text-[10px] text-muted-foreground">
 {i === 0 ? "نفر اول" : i === 1 ? "نفر دوم" : "نفر سوم"}
 </p>
 <p className="text-xs sm:text-sm font-bold text-foreground truncate">
 {row ? row.displayName : "—"}
 </p>
 <p className="text-[11px] text-muted-foreground">
 {row ? `${toPersianDigits(row.referralCount)} دعوت` : "خالی"}
 </p>
 <Badge
 variant="outline"
 className={`text-[10px] tnum ${isGold ? "bg-amber-500/15 text-amber-600 border-amber-500/40" : "bg-muted text-foreground"}`}
 >
 {formatCompactToman(prizes[i] ?? 0)}
 </Badge>
 </CardContent>
 </Card>
 );
 })}
 </div>

 {/* جدول جایزه‌ها */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <Award className="h-5 w-5 text-amber-500" />
 جایزه‌های مسابقه
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
 {prizes.map((p, i) => (
 <div
 key={i}
 className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
 i === 0
 ? "border-amber-500/40 bg-amber-500/10"
 : i === 1 || i === 2
 ? "border-slate-400/40 bg-slate-400/5"
 : "border-border"
 }`}
 >
 <span className="text-xs text-muted-foreground">
 {i === 0
 ? "نفر اول"
 : i === 1
 ? "نفر دوم"
 : i === 2
 ? "نفر سوم"
 : `نفر ${toPersianDigits(i + 1)}`}
 </span>
 <span className="text-sm font-bold text-foreground tnum">{formatToman(p)}</span>
 </div>
 ))}
 </div>
 <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
 {data.contest.rules.note}
 </p>
 </CardContent>
 </Card>

 {/* لیدربورد */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <Users className="h-5 w-5 text-primary" />
 جدول رتبه‌بندی — ۱۰ دعوت‌کنندهٔ برتر
 </CardTitle>
 </CardHeader>
 <CardContent>
 {data.leaders.length === 0 ? (
 <div className="py-8 text-center space-y-1.5">
 <Trophy className="h-8 w-8 text-muted-foreground/40 mx-auto" />
 <p className="text-sm text-muted-foreground">هنوز هیچ دعوت موفقی ثبت نشده — صندلی اول خالی است!</p>
 <p className="text-xs text-muted-foreground/70">اولین نفر باشید و جایزهٔ ۲۰ میلیون تومانی را ببرید.</p>
 </div>
 ) : (
 <ScrollArea className="max-h-96">
 <div className="space-y-1.5">
 {data.leaders.map((row) => (
 <div
 key={row.rank}
 className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
 row.isMe ? "border-primary/40 bg-primary/5" : "border-border bg-card"
 }`}
 >
 <div
 className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
 row.rank === 1
 ? "bg-amber-500/15 text-amber-600"
 : row.rank === 2
 ? "bg-slate-400/15 text-slate-500"
 : row.rank === 3
 ? "bg-orange-700/15 text-orange-700"
 : "bg-muted text-muted-foreground"
 }`}
 >
 {toPersianDigits(row.rank)}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium text-foreground truncate">
 {row.displayName}
 {row.isMe && <span className="text-primary"> (شما)</span>}
 </p>
 </div>
 <div className="text-end shrink-0">
 <p className="text-xs font-bold text-primary tnum">{toPersianDigits(row.referralCount)} دعوت</p>
 {row.prizeToman > 0 && (
 <p className="text-[10px] text-muted-foreground tnum">{formatCompactToman(row.prizeToman)}</p>
 )}
 </div>
 </div>
 ))}
 </div>
 </ScrollArea>
 )}
 {data.me.rank > 0 && !data.me.inTop && (
 <div className="mt-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-center text-xs">
 رتبه شما: <span className="font-bold text-primary">{toPersianDigits(data.me.rank)}</span> — با{" "}
 <span className="font-bold text-foreground">{toPersianDigits(data.me.referralCount)}</span> دعوت موفق
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
}

function ApplicationForm({ token }: { token?: string }) {
 const [form, setForm] = React.useState({
 companyName: "",
 contactName: "",
 email: "",
 phone: "",
 partnerType: "referral",
 website: "",
 description: "",
 });
 const [submitting, setSubmitting] = React.useState(false);
 const [result, setResult] = React.useState<string | null>(null);
 const [error, setError] = React.useState<string | null>(null);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setSubmitting(true);
 setError(null);
 setResult(null);
 try {
 const res = await fetch("/api/partners", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
...(token? { Authorization: `Bearer ${token}` }: {}),
 },
 body: JSON.stringify(form),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error?? "خطا در ثبت درخواست");
 setResult(data.message);
 setForm({
 companyName: "",
 contactName: "",
 email: "",
 phone: "",
 partnerType: "referral",
 website: "",
 description: "",
 });
 } catch (err) {
 setError(err instanceof Error? err.message: "خطا");
 } finally {
 setSubmitting(false);
 }
 };

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Building2 className="h-5 w-5 text-primary" />
 فرم درخواست همکاری
 </CardTitle>
 </CardHeader>
 <CardContent>
 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="grid gap-4 sm:grid-cols-2">
 <div className="space-y-2">
 <Label htmlFor="companyName">نام شرکت</Label>
 <Input
 id="companyName"
 value={form.companyName}
 onChange={(e) => setForm({...form, companyName: e.target.value })}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="contactName">نام فرد مسئول</Label>
 <Input
 id="contactName"
 value={form.contactName}
 onChange={(e) => setForm({...form, contactName: e.target.value })}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="email">ایمیل</Label>
 <Input
 id="email"
 type="email"
 value={form.email}
 onChange={(e) => setForm({...form, email: e.target.value })}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="phone">تلفن تماس</Label>
 <Input
 id="phone"
 type="tel"
 value={form.phone}
 onChange={(e) => setForm({...form, phone: e.target.value })}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="partnerType">نوع همکاری</Label>
 <select
 id="partnerType"
 value={form.partnerType}
 onChange={(e) => setForm({...form, partnerType: e.target.value })}
 className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
 >
 <option value="referral">معرفی (Referral)</option>
 <option value="reseller">نماینده‌ی فروش (Reseller)</option>
 <option value="technology">فناوری (Technology)</option>
 <option value="integration">اتصال (Integration)</option>
 </select>
 </div>
 <div className="space-y-2">
 <Label htmlFor="website">وب‌سایت</Label>
 <Input
 id="website"
 type="url"
 value={form.website}
 onChange={(e) => setForm({...form, website: e.target.value })}
 />
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="description">توضیحات</Label>
 <Textarea
 id="description"
 rows={4}
 placeholder="درباره‌ی شرکت، تجربه و دلیل همکاری توضیح دهید..."
 value={form.description}
 onChange={(e) => setForm({...form, description: e.target.value })}
 />
 </div>

 {error && (
 <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
 {error}
 </div>
 )}
 {result && (
 <div className="flex items-center gap-2 rounded-md border border-primary/50 bg-primary/5 p-3 text-sm text-primary">
 <CheckCircle2 className="h-4 w-4" />
 {result}
 </div>
 )}

 <Button type="submit" disabled={submitting}>
 {submitting? <Loader2 className="h-4 w-4 animate-spin" />: <Handshake className="h-4 w-4" />}
 <span className="mr-2">ثبت درخواست</span>
 </Button>
 </form>
 </CardContent>
 </Card>
 );
}

function PartnersList() {
 const [partners, setPartners] = React.useState<Partner[]>([]);
 const [loading, setLoading] = React.useState(true);

 React.useEffect(() => {
 const token = typeof window!== "undefined"? localStorage.getItem("hoshhesab_user_token"): null;
 fetch("/api/partners", {
 headers: token? { Authorization: `Bearer ${token}` }: {},
 })
.then((r) => r.json())
.then((data) => setPartners(data.partners?? []))
.finally(() => setLoading(false));
 }, []);

 if (loading) {
 return (
 <div className="flex h-40 items-center justify-center text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin" />
 </div>
 );
 }

 return (
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {partners.map((p) => {
 const tier = TIER_LABELS[p.tier]?? TIER_LABELS.bronze;
 return (
 <Card key={p.id}>
 <CardContent className="space-y-3 p-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="rounded-md bg-primary/10 p-2 text-primary">
 <Building2 className="h-5 w-5" />
 </div>
 <div>
 <div className="font-medium">{p.companyName}</div>
 <div className="text-xs text-muted-foreground">
 {TYPE_LABELS[p.partnerType]?? p.partnerType}
 </div>
 </div>
 </div>
 <Badge className={tier.color}>{tier.label}</Badge>
 </div>
 <p className="text-sm text-muted-foreground">{p.description}</p>
 <div className="flex items-center justify-between text-xs text-muted-foreground">
 <span>سهم درآمد: {toPersianDigits(p.revenueShare)}٪</span>
 <span>از {toPersianDigits(p.since.slice(0, 4))}</span>
 </div>
 <Button size="sm" variant="outline" asChild className="w-full">
 <a href={p.website} target="_blank" rel="noopener noreferrer">
 <ExternalLink className="h-3 w-3" />
 <span className="mr-1">وب‌سایت</span>
 </a>
 </Button>
 </CardContent>
 </Card>
 );
 })}
 </div>
 );
}

function RevenueDashboard({ token }: { token?: string }) {
 const [stats] = React.useState({
 totalRevenue: 12_400_000,
 thisMonth: 1_850_000,
 pendingPayout: 320_000,
 referrals: 47,
 conversionRate: 18.5,
 });

 const [apiKey, setApiKey] = React.useState<string>("");
 const [copied, setCopied] = React.useState(false);

 React.useEffect(() => {
 // در پیاده‌سازی واقعی: فراخوانی API برای دریافت API key
 setApiKey("hh_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0");
 }, []);

 const copyKey = () => {
 navigator.clipboard.writeText(apiKey);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 };

 return (
 <div className="space-y-4">
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-xs text-muted-foreground">درآمد کل</div>
 <div className="text-xl font-bold text-primary">
 {formatToman(stats.totalRevenue)}
 </div>
 </div>
 <Wallet className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-xs text-muted-foreground">این ماه</div>
 <div className="text-xl font-bold">{formatToman(stats.thisMonth)}</div>
 </div>
 <TrendingUp className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-xs text-muted-foreground">معرفی‌ها</div>
 <div className="text-xl font-bold">{toPersianDigits(stats.referrals)}</div>
 </div>
 <Users className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-xs text-muted-foreground">نرخ تبدیل</div>
 <div className="text-xl font-bold">{toPersianDigits(stats.conversionRate)}٪</div>
 </div>
 <Award className="h-8 w-8 text-primary/30" />
 </div>
 </CardContent>
 </Card>
 </div>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Key className="h-5 w-5 text-primary" />
 API Key
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex items-center gap-2">
 <Input value={apiKey} readOnly className="font-mono text-sm" dir="ltr" />
 <Button size="sm" variant="outline" onClick={copyKey}>
 {copied? <CheckCircle2 className="h-4 w-4" />: <Copy className="h-4 w-4" />}
 </Button>
 </div>
 <p className="mt-2 text-xs text-muted-foreground">
 این کلید را محرمانه نگه دارید. برای احراز هویت در هدر Authorization استفاده کنید.
 </p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Star className="h-5 w-5 text-primary" />
 سطح همکاری شما
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-between">
 <Badge className="bg-primary">طلایی</Badge>
 <span className="text-sm text-muted-foreground">
 برای ارتقا به پلاتین، {toPersianDigits(3)} معرفی دیگر لازم است
 </span>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

function IntegrationDocs() {
 return (
 <Card>
 <CardHeader>
 <CardTitle className="text-base">مستندات فنی همکاری</CardTitle>
 </CardHeader>
 <CardContent className="space-y-4 text-sm">
 <div>
 <h4 className="mb-2 font-medium">۱. دریافت API Key</h4>
 <p className="text-muted-foreground">
 پس از تأیید درخواست همکاری، API Key اختصاصی برای شما صادر می‌شود. این کلید را در
 هدر <code className="rounded bg-muted px-1">Authorization: Bearer hh_...</code> ارسال کنید.
 </p>
 </div>
 <div>
 <h4 className="mb-2 font-medium">۲. ثبت معرفی (Referral)</h4>
 <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs" dir="ltr">
{`POST /api/v1/referrals
{
 "referredEmail": "customer@example.com",
 "campaignId": "summer2025"
}`}
 </pre>
 </div>
 <div>
 <h4 className="mb-2 font-medium">۳. پیگیری درآمد</h4>
 <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs" dir="ltr">
{`GET /api/v1/partner/revenue
?from=2025-01-01&to=2025-12-31`}
 </pre>
 </div>
 <div>
 <h4 className="mb-2 font-medium">۴. Webhook رویدادها</h4>
 <p className="text-muted-foreground">
 برای دریافت خودکار رویدادهای referral.created، referral.converted و payout.processed،
 یک webhook در پورتال ثبت کنید.
 </p>
 </div>
 <Button variant="outline" asChild>
 <a href="/api-docs" target="_blank" rel="noopener noreferrer">
 <ExternalLink className="h-4 w-4" />
 <span className="mr-1">مشاهده‌ی مستندات کامل API</span>
 </a>
 </Button>
 </CardContent>
 </Card>
 );
}
