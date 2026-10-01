"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 Calendar,
 BookOpen,
 Wallet,
 Globe,
 ArrowUpRight,
 CheckCircle2,
 Unlink,
 Link2,
 RefreshCw,
 AlertCircle,
 Sparkles,
 ShieldCheck,
 Zap,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

const TOKEN_KEY = "hoshhesab_user_token";

type ServiceId = "NOBATIME" | "CATALOG" | "HESABYAR";

interface EcosystemService {
 id: ServiceId;
 name: string;
 nameEn: string;
 url: string;
 description: string;
 icon: LucideIcon;
 longDescription: string;
 features: string[];
}

const SERVICES: EcosystemService[] = [
 {
 id: "NOBATIME",
 name: "نوباتایم",
 nameEn: "Nobatime",
 url: "https://nobatime.ir",
 description: "سامانه مدیریت نوبت‌دهی آنلاین",
 icon: Calendar,
 longDescription:
 "نوباتایم به مشتریان شما اجازه می‌دهد به‌صورت آنلاین نوبت رزرو کنند و یادآور پیامکی دریافت نمایند. نوبات‌های پرداخت‌شده به‌صورت خودکار به‌عنوان فاکتور فروش در هوش ثبت می‌شوند.",
 features: [
 "رزرو آنلاین نوبت با درگاه پرداخت",
 "یادآور پیامکی و ایمیلی خودکار",
 "همگام‌سازی نوبت‌های پرداختی با فاکتور فروش",
 "تقویم کاری و مدیریت زمان‌بندی",
 ],
 },
 {
 id: "CATALOG",
 name: "کاتالوگ",
 nameEn: "Catalog",
 url: "https://catalog.nobatime.ir",
 description: "کاتالوگ دیجیتال محصولات و خدمات",
 icon: BookOpen,
 longDescription:
 "کاتالوگ یک فروشگاه آنلاین سبک برای نمایش محصولات و خدمات شماست. هر سفارش در کاتالوگ به‌صورت خودکار به فاکتور فروش و کاهش موجودی انبار در هوش منجر می‌شود.",
 features: [
 "کاتالوگ آنلاین با دامنه اختصاصی",
 "درگاه پرداخت زرین‌پال و آیدی‌پی",
 "تبدیل خودکار سفارش به فاکتور فروش",
 "همگام‌سازی موجودی و قیمت با انبار هوش",
 ],
 },
 {
 id: "HESABYAR",
 name: "حساب‌یار",
 nameEn: "HesabYar",
 url: "https://yar.nobatime.ir",
 description: "دستیار مالی هوشمند کسب‌وکار",
 icon: Wallet,
 longDescription:
 "حساب‌یار دستیار مالی هوشمندی است که با تحلیل تراکنش‌های بانکی و فاکتورهای شما، گزارش‌های مدیریتی، پیش‌بینی جریان نقدی و هشدارهای مالیاتی را به‌صورت خودکار ارائه می‌دهد.",
 features: [
 "تحلیل هوشمند تراکنش‌های بانکی",
 "پیش‌بینی جریان نقدی ۳۰ روز آینده",
 "هشدار سررسید چک و فاکتور معوق",
 "گزارش‌های مدیریتی لحظه‌ای",
 ],
 },
];

interface ConnectionStatus {
 id: ServiceId;
 name: string;
 nameEn: string;
 url: string;
 description: string;
 icon: LucideIcon;
 connected: boolean;
 connectedAt: string | null;
 loginUrl: string | null;
}

const FALLBACK_STATUS: ConnectionStatus[] = SERVICES.map((s) => ({
 id: s.id,
 name: s.name,
 nameEn: s.nameEn,
 url: s.url,
 description: s.description,
 icon: s.icon,
 connected: false,
 connectedAt: null,
 loginUrl: null,
}));

type LoadState = "loading" | "error" | "ready";

function getAuthHeaders(): HeadersInit {
 if (typeof window === "undefined") return {};
 const token = localStorage.getItem(TOKEN_KEY);
 if (!token) return {};
 return {
 Authorization: `Bearer ${token}`,
 "Content-Type": "application/json",
 };
}

function formatDate(iso: string | null): string {
 if (!iso) return "—";
 try {
 const d = new Date(iso);
 const j = new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 }).format(d);
 return j;
 } catch {
 return "—";
 }
}

export function EcosystemModule() {
 const { toast } = useToast();
 const [statusList, setStatusList] = React.useState<ConnectionStatus[]>(
 FALLBACK_STATUS
 );
 const [loadState, setLoadState] = React.useState<LoadState>("loading");
 const [connectingId, setConnectingId] = React.useState<ServiceId | null>(null);
 const [disconnectingId, setDisconnectingId] = React.useState<ServiceId | null>(
 null
 );

 const fetchStatus = React.useCallback(async () => {
 setLoadState("loading");
 try {
 const res = await fetch("/api/ecosystem/status", {
 headers: getAuthHeaders(),
 });
 const data = await res.json();
 if (!data.success) {
 throw new Error(data.error || "خطا در دریافت وضعیت اتصال");
 }
 const arr: unknown[] = Array.isArray(data.data)? data.data: [];
 // همیشه ۳ سرویس نمایش داده می‌شوند؛ در صورت نبود داده، از fallback استفاده می‌کنیم
 const merged = SERVICES.map((s) => {
 const found = arr.find(
 (it: unknown) =>
 typeof it === "object" &&
 it!== null &&
 "id" in it &&
 (it as { id: string }).id === s.id
 ) as
 | {
 connected?: boolean;
 connectedAt?: string | null;
 loginUrl?: string | null;
 }
 | undefined;
 return {
 id: s.id,
 name: s.name,
 nameEn: s.nameEn,
 url: s.url,
 description: s.description,
 icon: s.icon,
 connected: found?.connected?? false,
 connectedAt: found?.connectedAt?? null,
 loginUrl: found?.loginUrl?? null,
 } satisfies ConnectionStatus;
 });
 setStatusList(merged);
 setLoadState("ready");
 } catch (err) {
 console.error("ecosystem fetch error", err);
 setLoadState("error");
 }
 }, []);

 React.useEffect(() => {
 void fetchStatus();
 }, [fetchStatus]);

 const handleConnect = React.useCallback(
 async (service: ServiceId) => {
 const meta = SERVICES.find((s) => s.id === service);
 if (!meta) return;
 setConnectingId(service);
 try {
 if (service === "NOBATIME") {
 // جریان OAuth واقعی برای نوباتایم
 const res = await fetch("/api/ecosystem/oauth/nobatime", {
 headers: getAuthHeaders(),
 });
 const data = await res.json();
 if (!data.success) {
 throw new Error(data.error || "شروع OAuth ناموفق بود");
 }

 if (data.data?.mode === "live" && data.data?.authorizationUrl) {
 // redirect مرورگر به authorization URL نوباتایم
 if (typeof window!== "undefined") {
 window.location.href = data.data.authorizationUrl;
 }
 return; // state در انتظار redirect
 }

 // حالت mock — اتصال فوری برقرار شد
 setStatusList((prev) =>
 prev.map((it) =>
 it.id === service
? {
...it,
 connected: true,
 connectedAt: new Date().toISOString(),
 loginUrl: data.data?.loginUrl?? it.loginUrl,
 }
: it
 )
 );
 toast({
 title: "اتصال برقرار شد",
 description: data.data?.message || `سرویس «${meta.name}» متصل شد.`,
 });
 return;
 }

 // سایر سرویس‌ها از مسیر قبلی connect استفاده می‌کنند
 const res = await fetch("/api/ecosystem/connect", {
 method: "POST",
 headers: getAuthHeaders(),
 body: JSON.stringify({ service }),
 });
 const data = await res.json();
 if (!data.success) {
 throw new Error(data.error || "اتصال ناموفق بود");
 }
 // به‌روزرسانی محلی وضعیت
 setStatusList((prev) =>
 prev.map((it) =>
 it.id === service
? {
...it,
 connected: true,
 connectedAt: new Date().toISOString(),
 loginUrl: data.data?.loginUrl?? it.loginUrl,
 }
: it
 )
 );
 toast({
 title: "اتصال برقرار شد",
 description: `سرویس «${meta.name}» با موفقیت متصل شد.`,
 });
 } catch (err) {
 const message =
 err instanceof Error? err.message: "خطای ناشناخته در اتصال";
 toast({
 title: "خطا در اتصال",
 description: message,
 variant: "destructive",
 });
 } finally {
 setConnectingId(null);
 }
 },
 [toast]
 );

 const handleDisconnect = React.useCallback(
 async (service: ServiceId) => {
 const meta = SERVICES.find((s) => s.id === service);
 if (!meta) return;
 setDisconnectingId(service);
 // در نسخه فعلی، قطع اتصال به‌صورت محلی شبیه‌سازی می‌شود
 // (API واقعی هنوز پیاده‌سازی نشده است)
 try {
 await new Promise((resolve) => setTimeout(resolve, 600));
 setStatusList((prev) =>
 prev.map((it) =>
 it.id === service
? {
...it,
 connected: false,
 connectedAt: null,
 loginUrl: null,
 }
: it
 )
 );
 toast({
 title: "اتصال قطع شد",
 description: `سرویس «${meta.name}» از حساب شما قطع شد.`,
 });
 } finally {
 setDisconnectingId(null);
 }
 },
 [toast]
 );

 const handleLogin = React.useCallback((url: string | null) => {
 if (!url) return;
 if (typeof window!== "undefined") {
 window.open(url, "_blank", "noopener,noreferrer");
 }
 }, []);

 const connectedCount = statusList.filter((s) => s.connected).length;
 const totalCount = statusList.length;

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* Hero */}
 <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
 <div
 className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl"
 aria-hidden="true"
 />
 <div
 className="pointer-events-none absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-primary/10 blur-3xl"
 aria-hidden="true"
 />
 <CardContent className="relative p-6 sm:p-8">
 <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
 <div className="max-w-2xl">
 <Badge variant="secondary" className="bg-primary/10 text-primary">
 <Globe className="h-3 w-3 ml-1" />
 اکوسیستم یکپارچه
 </Badge>
 <h2 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
 اکوسیستم یکپارچه کسب‌وکار شما
 </h2>
 <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
 حسابداری هوش به نوباتایم، کاتالوگ و حساب‌یار متصل می‌شود تا
 کسب‌وکار شما را یکپارچه مدیریت کنید. نوبات‌ها، سفارش‌های آنلاین و
 تحلیل‌های هوشمند به‌صورت خودکار با حسابداری شما همگام می‌شوند.
 </p>
 <div className="mt-5 flex flex-wrap items-center gap-2">
 <Badge
 variant="outline"
 className="border-primary/30 bg-primary/5 text-primary"
 >
 <CheckCircle2 className="h-3 w-3 ml-1" />
 {toPersianDigits(connectedCount)} از {toPersianDigits(totalCount)} سرویس متصل
 </Badge>
 <Badge variant="outline" className="gap-1 text-muted-foreground">
 <ShieldCheck className="h-3 w-3" />
 ورود یکپارچه SSO
 </Badge>
 <Badge variant="outline" className="gap-1 text-muted-foreground">
 <Zap className="h-3 w-3" />
 همگام‌سازی خودکار
 </Badge>
 </div>
 </div>
 <div className="hidden lg:flex shrink-0 flex-col items-center gap-2 rounded-xl border border-primary/20 bg-background/60 p-5">
 <Sparkles className="h-8 w-8 text-primary" />
 <p className="text-xs font-medium text-foreground">یک حساب، سه سرویس</p>
 <p className="text-[11px] text-muted-foreground">بدون ورود مجدد</p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* States: loading / error */}
 {loadState === "loading" && (
 <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
 {SERVICES.map((s) => (
 <Card key={s.id} className="p-5">
 <div className="flex items-start gap-3">
 <Skeleton className="h-12 w-12 rounded-xl" />
 <div className="flex-1 space-y-2">
 <Skeleton className="h-4 w-24" />
 <Skeleton className="h-3 w-20" />
 </div>
 <Skeleton className="h-6 w-14 rounded-full" />
 </div>
 <Skeleton className="mt-4 h-3 w-full" />
 <Skeleton className="mt-2 h-3 w-3/4" />
 <div className="mt-4 flex gap-2">
 <Skeleton className="h-9 w-24" />
 <Skeleton className="h-9 w-20" />
 </div>
 </Card>
 ))}
 </div>
 )}

 {loadState === "error" && (
 <Card className="p-8 text-center border-destructive/30 bg-destructive/5">
 <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
 <AlertCircle className="h-6 w-6" />
 </div>
 <p className="mt-4 text-sm font-medium text-foreground">
 خطا در بارگذاری وضعیت اتصال
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 لطفاً اتصال اینترنت خود را بررسی کرده و دوباره تلاش کنید.
 </p>
 <Button onClick={() => void fetchStatus()} className="mt-4" size="sm">
 <RefreshCw className="h-4 w-4 ml-1" />
 تلاش مجدد
 </Button>
 </Card>
 )}

 {/* Ready: cards */}
 {loadState === "ready" && (
 <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
 {statusList.map((service, idx) => {
 const Icon = service.icon;
 const meta = SERVICES.find((s) => s.id === service.id);
 const isConnecting = connectingId === service.id;
 const isDisconnecting = disconnectingId === service.id;
 const busy = isConnecting || isDisconnecting;
 return (
 <motion.div
 key={service.id}
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.4, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
 >
 <Card className="card-hover flex h-full flex-col overflow-hidden border-border">
 <CardContent className="flex flex-1 flex-col p-5">
 {/* Header */}
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-start gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm shadow-primary/20">
 <Icon className="h-6 w-6" />
 </div>
 <div>
 <h3 className="text-base font-bold text-foreground">
 {service.name}
 </h3>
 <p
 dir="ltr"
 className="text-right text-[11px] font-medium text-muted-foreground"
 >
 {service.nameEn} — {service.url.replace("https://", "")}
 </p>
 </div>
 </div>
 {service.connected? (
 <Badge className="bg-success/10 text-success hover:bg-success/10">
 <CheckCircle2 className="h-3 w-3 ml-1" />
 متصل
 </Badge>
 ): (
 <Badge variant="secondary" className="bg-muted text-muted-foreground">
 قطع
 </Badge>
 )}
 </div>

 {/* Description */}
 <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
 {service.description}
 </p>

 {/* Features */}
 {meta && (
 <ul className="mt-4 space-y-1.5">
 {meta.features.map((f) => (
 <li
 key={f}
 className="flex items-start gap-2 text-xs text-foreground/80"
 >
 <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
 <span>{f}</span>
 </li>
 ))}
 </ul>
 )}

 {/* Connection meta */}
 {service.connected && service.connectedAt && (
 <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
 متصل از:{" "}
 <span className="font-medium text-foreground">
 {formatDate(service.connectedAt)}
 </span>
 </div>
 )}

 {/* Actions */}
 <div className="mt-auto flex flex-wrap gap-2 pt-5">
 {service.connected? (
 <>
 <Button
 size="sm"
 onClick={() => handleLogin(service.loginUrl)}
 className="gap-1"
 >
 <ArrowUpRight className="h-3.5 w-3.5" />
 ورود
 </Button>
 <Button
 size="sm"
 variant="outline"
 disabled={busy}
 onClick={() => void handleDisconnect(service.id)}
 className="gap-1 text-destructive hover:text-destructive"
 >
 {isDisconnecting? (
 <RefreshCw className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Unlink className="h-3.5 w-3.5" />
 )}
 قطع اتصال
 </Button>
 </>
 ): (
 <button
 type="button"
 disabled={busy}
 onClick={() => void handleConnect(service.id)}
 className="relative inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
 style={{
 animation: isConnecting
? undefined
: "pulse-shadow 2.4s infinite",
 }}
 >
 {isConnecting? (
 <>
 <RefreshCw className="h-4 w-4 animate-spin" />
 در حال اتصال...
 </>
 ): (
 <>
 <Link2 className="h-4 w-4" />
 {service.id === "NOBATIME"
? "اتصال با نوباتایم"
: "اتصال"}
 </>
 )}
 </button>
 )}
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleLogin(service.url)}
 className="gap-1 text-muted-foreground"
 >
 <Globe className="h-3.5 w-3.5" />
 وب‌سایت
 </Button>
 </div>
 </CardContent>
 </Card>
 </motion.div>
 );
 })}
 </div>
 )}

 {/* Footer hint */}
 <Card className="border-primary/15 bg-primary/5">
 <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-start gap-3">
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <ShieldCheck className="h-4.5 w-4.5" />
 </div>
 <div>
 <p className="text-sm font-medium text-foreground">
 اتصال امن با SSO یکپارچه
 </p>
 <p className="mt-0.5 text-xs text-muted-foreground">
 ورود به سرویس‌های اکوسیستم بدون نیاز به رمز عبور مجدد و با همان
 حساب کاربری هوش انجام می‌شود. توکن‌های SSO به‌صورت رمزنگاری‌شده
 ذخیره می‌شوند.
 </p>
 </div>
 </div>
 <Badge variant="outline" className="border-primary/30 bg-background text-primary">
 <Sparkles className="h-3 w-3 ml-1" />
 امنیت سطح بانکی
 </Badge>
 </CardContent>
 </Card>
 </div>
 );
}
