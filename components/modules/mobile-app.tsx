"use client";

import * as React from "react";
import {
 Smartphone,
 Apple,
 ScanLine,
 Bell,
 WifiOff,
 Package,
 FileText,
 Download,
 CheckCircle2,
 Receipt,
 TrendingUp,
 Wallet,
 QrCode,
 Monitor,
 Shield,
 ChevronRight,
 Share,
 Chrome,
 BookOpen,
 Check,
 Info,
 PlusCircle,
 MonitorSmartphone,
 type LucideIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { toPersianDigits } from "@/lib/persian";

/* ============ Types ============ */
/**
 * BeforeInstallPromptEvent — رویداد `beforeinstallprompt` که توسط Chrome/Edge
 * برای PWA installable ارسال می‌شود. این نوع در DOM typings استاندارد وجود ندارد
 * و باید دستی تعریف شود.
 */
interface BeforeInstallPromptEvent extends Event {
 readonly platforms: string[];
 readonly userChoice: Promise<{
 outcome: "accepted" | "dismissed";
 platform: string;
 }>;
 prompt: () => Promise<void>;
}

type Platform = "ios" | "android" | "desktop" | "other";
type ModalKind = "ios" | "android" | "desktop" | "install-fallback" | null;

/* ============ داده‌ها ============ */
interface Feature {
 icon: LucideIcon;
 title: string;
 desc: string;
 accent: "primary" | "info" | "success" | "warning";
}

const FEATURES: Feature[] = [
 {
 icon: Receipt,
 title: "ثبت فاکتور از موبایل",
 desc: "ایجاد و ارسال فاکتور فروش در چند ثانیه از روی گوشی",
 accent: "primary",
 },
 {
 icon: ScanLine,
 title: "اسکن بارکد",
 desc: "ثبت سریع کالا و موجودی انبار با اسکن بارکد",
 accent: "info",
 },
 {
 icon: TrendingUp,
 title: "گزارش لحظه‌ای",
 desc: "دسترسی به KPI های مالی و فروش به‌صورت زنده",
 accent: "success",
 },
 {
 icon: Bell,
 title: "نوتیفیکیشن Push",
 desc: "هشدار سررسید چک، کسری موجودی و فاکتور معوق",
 accent: "warning",
 },
 {
 icon: WifiOff,
 title: "کار آفلاین",
 desc: "ثبت اطلاعات بدون اینترنت و همگام‌سازی خودکار بعد از اتصال",
 accent: "primary",
 },
 {
 icon: Package,
 title: "مدیریت چک",
 desc: "ثبت، پیگیری و سررسید چک‌های صیادی در موبایل",
 accent: "info",
 },
];

const PHONE_KPIS = [
 { label: "فروش امروز", value: "۴۲ م ت", icon: TrendingUp, color: "text-success" },
 { label: "موجودی نقدی", value: "۲.۱۵ م.ت", icon: Wallet, color: "text-primary" },
 { label: "فاکتورهای امروز", value: "۱۸", icon: Receipt, color: "text-info" },
];

const PHONE_RECENT = [
 { party: "پارس‌فناور", amount: "۴۵ م ت", status: "PAID" },
 { party: "آریا", amount: "۱۲.۵ م ت", status: "PARTIAL" },
 { party: "دیجی‌مارت", amount: "۲۳ م ت", status: "OVERDUE" },
];

const ACCENT_MAP: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 info: "bg-info/10 text-info",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
};

/* ============ Hook: usePwaInstall ============ */
/**
 * مدیریت کامل جریان نصب PWA:
 * - گوش دادن به `beforeinstallprompt` و ذخیره رویداد
 * - تشخیص نصب بودن (display-mode: standalone یا iOS navigator.standalone)
 * - تشخیص پلتفرم (iOS / Android / Desktop)
 * - تابع `promptInstall` که در صورت موجود بودن رویداد، پرامپت را نمایش می‌دهد
 */
function usePwaInstall() {
 const [deferredPrompt, setDeferredPrompt] =
 React.useState<BeforeInstallPromptEvent | null>(null);
 const [installed, setInstalled] = React.useState<boolean>(false);
 const [platform, setPlatform] = React.useState<Platform>("other");

 React.useEffect(() => {
 if (typeof window === "undefined") return;

 // تشخیص پلتفرم از User-Agent
 const ua = navigator.userAgent || "";
 let detected: Platform = "other";
 if (/android/i.test(ua)) detected = "android";
 else if (/ipad|iphone|ipod/i.test(ua)) detected = "ios";
 else if (/Mac|Win|Linux/i.test(ua)) detected = "desktop";
 setPlatform(detected);

 // تشخیص نصب بودن (standalone)
 const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
 const isStandalone =
 standaloneQuery?.matches === true ||
 // iOS Safari
 (navigator as Navigator & { standalone?: boolean }).standalone === true;
 setInstalled(Boolean(isStandalone));

 const onBeforeInstall = (e: Event) => {
 // جلوگیری از نمایش خودکار mini-infobar توسط Chrome
 e.preventDefault();
 setDeferredPrompt(e as BeforeInstallPromptEvent);
 };

 const onInstalled = () => {
 setInstalled(true);
 setDeferredPrompt(null);
 };

 window.addEventListener("beforeinstallprompt", onBeforeInstall);
 window.addEventListener("appinstalled", onInstalled);

 // اگر کاربر از حالت standalone خارج شد (مثلاً uninstall)، وضعیت را به‌روز کن
 const onDisplayChange = () => {
 setInstalled(Boolean(standaloneQuery?.matches));
 };
 standaloneQuery?.addEventListener?.("change", onDisplayChange);

 return () => {
 window.removeEventListener("beforeinstallprompt", onBeforeInstall);
 window.removeEventListener("appinstalled", onInstalled);
 standaloneQuery?.removeEventListener?.("change", onDisplayChange);
 };
 }, []);

 const promptInstall = React.useCallback(async (): Promise<
 "accepted" | "dismissed" | "unavailable"
 > => {
 if (!deferredPrompt) return "unavailable";
 try {
 await deferredPrompt.prompt();
 const choice = await deferredPrompt.userChoice;
 // پس از یک بار prompt، رویداد دیگر قابل استفاده مجدد نیست — پاک کن
 setDeferredPrompt(null);
 return choice.outcome;
 } catch {
 return "unavailable";
 }
 }, [deferredPrompt]);

 const canInstall = Boolean(deferredPrompt) &&!installed;

 return { deferredPrompt, installed, platform, canInstall, promptInstall };
}

/* ============ کامپوننت اصلی ============ */
export function MobileAppModule() {
 const { canInstall, installed, platform, promptInstall } = usePwaInstall();
 const [activeModal, setActiveModal] = React.useState<ModalKind>(null);
 const [installing, setInstalling] = React.useState(false);
 // origin را در state نگه می‌داریم تا QR فقط در کلاینت رندر شود (جلوگیری از SSR mismatch)
 const [origin, setOrigin] = React.useState<string>("");

 React.useEffect(() => {
 if (typeof window!== "undefined") {
 setOrigin(window.location.origin);
 }
 }, []);

 // راهنما: انتشار رویداد سفارشی `hoshhesab:navigate` که در app-shell.tsx گوش داده می‌شود
 const goToHelp = React.useCallback(() => {
 if (typeof window === "undefined") return;
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", { detail: { module: "help" } })
 );
 }, []);

 // نصب روی این دستگاه — اگر beforeinstallprompt موجود باشد، پرامپت را صدا بزن؛
 // در غیر این صورت (iOS Safari یا مرورگرهای بدون پشتیبانی) مودال راهنما نمایش بده.
 const handleInstall = React.useCallback(async () => {
 if (canInstall) {
 setInstalling(true);
 const outcome = await promptInstall();
 setInstalling(false);
 if (outcome === "unavailable") {
 // رویداد بود اما prompt شکست خورد — راهنما نمایش بده
 setActiveModal(platform === "ios"? "ios": "install-fallback");
 }
 // اگر accepted یا dismissed بود، نیازی به مودال نیست
 return;
 }
 // beforeinstallprompt در دسترس نیست (iOS یا قبلاً نصب شده)
 if (installed) return;
 if (platform === "ios") setActiveModal("ios");
 else if (platform === "android") setActiveModal("android");
 else setActiveModal("install-fallback");
 }, [canInstall, installed, platform, promptInstall]);

 const handleAndroid = React.useCallback(() => {
 setActiveModal("android");
 }, []);

 const handleIos = React.useCallback(() => {
 setActiveModal("ios");
 }, []);

 const handleDesktop = React.useCallback(() => {
 setActiveModal("desktop");
 }, []);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هیرو */}
 <Card className="card-hover overflow-hidden relative">
 <div className="absolute inset-0 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent pointer-events-none" />
 <CardContent className="p-6 relative">
 <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-center">
 <div>
 <div className="flex items-center gap-2 mb-2">
 <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shrink-0">
 <Smartphone className="h-6 w-6" />
 </div>
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
 نسخه {toPersianDigits("۲.۴")} منتشر شد
 </Badge>
 {installed && (
 <Badge variant="outline" className="text-[10px] gap-1 border-success/40 text-success">
 <Check className="h-3 w-3" />
 نصب‌شده
 </Badge>
 )}
 </div>
 <h2 className="text-2xl font-bold text-foreground mb-1">
 اپلیکیشن موبایل هوش
 </h2>
 <p className="text-sm text-muted-foreground leading-relaxed mb-4">
 iOS و Android — همه‌جا همراه شما. کسب‌وکارتان را در جیب خود مدیریت کنید:
 فاکتور، انبار، چک، گزارش و یادآور — همه در یک اپ.
 </p>
 <div className="flex flex-wrap items-center gap-2">
 <Button size="sm" className="gap-2 h-10 px-4" onClick={handleIos}>
 <Apple className="h-4 w-4" />
 <div className="flex flex-col items-start leading-none">
 <span className="text-[9px] opacity-80">دانلود برای</span>
 <span className="text-xs font-bold">iOS</span>
 </div>
 </Button>
 <Button variant="outline" size="sm" className="gap-2 h-10 px-4" onClick={handleAndroid}>
 <Smartphone className="h-4 w-4" />
 <div className="flex flex-col items-start leading-none">
 <span className="text-[9px] text-muted-foreground">دانلود برای</span>
 <span className="text-xs font-bold">Android</span>
 </div>
 </Button>
 <Button variant="ghost" size="sm" className="gap-1.5 h-10 text-xs text-muted-foreground" onClick={handleDesktop}>
 <Monitor className="h-3.5 w-3.5" />
 نسخه دسکتاپ (PWA)
 </Button>
 </div>
 <div className="flex flex-wrap items-center gap-4 mt-4 text-[11px] text-muted-foreground">
 <span className="flex items-center gap-1">
 <CheckCircle2 className="h-3 w-3 text-success" />
 رایگان برای کاربران هوش
 </span>
 <span className="flex items-center gap-1">
 <CheckCircle2 className="h-3 w-3 text-success" />
 پشتیبانی از فارسی و RTL
 </span>
 <span className="flex items-center gap-1">
 <CheckCircle2 className="h-3 w-3 text-success" />
 بدون نیاز به گوگل‌پلی یا اپ‌استور
 </span>
 </div>
 </div>

 {/* ماکت موبایل */}
 <PhoneMockup />
 </div>
 </CardContent>
 </Card>

 {/* قابلیت‌ها */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {FEATURES.map((f, i) => (
 <FeatureCard key={f.title} feature={f} delay={i * 50} onTryInstall={handleInstall} />
 ))}
 </div>

 {/* PWA + QR + آفلاین */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 {/* PWA دسکتاپ */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Monitor className="h-4 w-4" />
 </div>
 <CardTitle className="text-base">PWA: نصب روی دسکتاپ</CardTitle>
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 <p className="text-xs text-muted-foreground leading-relaxed mb-3">
 هوش یک Progressive Web App است. می‌توانید بدون نصب اپ native، آن را روی
 دسکتاپ ویندوز، مک یا کروم‌بوک نصب کنید و مانند یک نرم‌افزار مستقل اجرا کنید.
 </p>
 <div className="flex items-center gap-2 mb-3 flex-wrap">
 <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
 <CheckCircle2 className="h-2.5 w-2.5" />
 آفلاین
 </Badge>
 <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
 <CheckCircle2 className="h-2.5 w-2.5" />
 Fast Install
 </Badge>
 <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
 <CheckCircle2 className="h-2.5 w-2.5" />
 Push Notification
 </Badge>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="w-full h-8 gap-1.5 text-xs"
 onClick={handleInstall}
 disabled={installing || installed}
 >
 <Download className="h-3.5 w-3.5" />
 {installed? "نصب‌شده": installing? "در حال نصب…": "نصب روی این دستگاه"}
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="w-full h-7 gap-1.5 text-[11px] text-muted-foreground mt-1"
 onClick={handleDesktop}
 >
 <Info className="h-3 w-3" />
 راهنمای نصب روی دسکتاپ
 </Button>
 </CardContent>
 </Card>

 {/* QR Code */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
 <QrCode className="h-4 w-4" />
 </div>
 <CardTitle className="text-base">نصب با اسکن QR</CardTitle>
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 <div className="flex flex-col items-center">
 <div className="w-32 h-32 rounded-xl bg-white p-2 border border-border mb-3 flex items-center justify-center">
 {origin? (
 <QRCodeSVG
 value={origin}
 size={112}
 level="M"
 marginSize={1}
 bgColor="#ffffff"
 fgColor="#0a0a0a"
 aria-label="QR کد نصب هوش"
 />
 ): (
 <div className="w-full h-full animate-pulse bg-muted/40 rounded-md" />
 )}
 </div>
 <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
 دوربین موبایل خود را روی این کد بگیرید تا اپلیکیشن را مستقیم نصب کنید
 </p>
 {origin && (
 <p dir="ltr" className="text-[10px] text-muted-foreground/70 mt-1 font-mono truncate max-w-full">
 {origin}
 </p>
 )}
 </div>
 </CardContent>
 </Card>

 {/* قابلیت آفلاین */}
 <Card className="card-hover relative overflow-hidden">
 <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
 <CardHeader className="pb-3 relative">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
 <WifiOff className="h-4 w-4" />
 </div>
 <CardTitle className="text-base">قابلیت آفلاین</CardTitle>
 </div>
 </CardHeader>
 <CardContent className="pt-0 relative">
 <p className="text-xs text-muted-foreground leading-relaxed mb-3">
 بدون اتصال اینترنت هم کار می‌کند. تمام داده‌های شما به‌صورت محلی ذخیره می‌شود
 و به‌محض اتصال مجدد، به‌صورت خودکار با سرور همگام می‌شود.
 </p>
 <div className="space-y-2">
 <div className="flex items-center gap-2 text-xs">
 <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
 <span className="text-foreground">ثبت فاکتور و چک آفلاین</span>
 </div>
 <div className="flex items-center gap-2 text-xs">
 <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
 <span className="text-foreground">مشاهده کاردکس انبار</span>
 </div>
 <div className="flex items-center gap-2 text-xs">
 <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
 <span className="text-foreground">همگام‌سازی خودکار پس از اتصال</span>
 </div>
 <div className="flex items-center gap-2 text-xs">
 <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
 <span className="text-foreground">رمزنگاری کامل داده محلی</span>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* بنر پایانی */}
 <Card className="card-hover">
 <CardContent className="p-5">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <FileText className="h-5 w-5" />
 </div>
 <div>
 <p className="text-sm font-medium">راهنمای نصب و راه‌اندازی</p>
 <p className="text-xs text-muted-foreground mt-0.5">
 گام‌به‌گام نصب اپ روی iOS، Android و دسکتاپ
 </p>
 </div>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 h-8 text-xs"
 onClick={goToHelp}
 aria-label="مشاهده راهنمای نصب"
 >
 مشاهده راهنما
 <ChevronRight className="h-3 w-3 rotate-180" />
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* v32-G: نسخه‌های آفلاین کامل — سورس اندروید/دسکتاپ + پل کارتخوان */}
 <Card className="card-hover border-primary/20">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <WifiOff className="h-4 w-4 text-primary" />
 نسخه‌های آفلاین کامل (سورس آماده)
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <p className="text-xs text-muted-foreground leading-relaxed">
 علاوه بر نصب PWA بالا (که صفحات بازدیدشده را آفلاین نگه می‌دارد)، نسخه‌های
 کامل‌تر هم موجود است: اپ اندرویدی بومی (APK) و اپ دسکتاپ ویندوزی — هر دو با
 راهنمای فارسی گام‌به‌گام. برای کارکرد «۱۰۰٪ آفلاین» می‌توانید سرور هوش را
 روی همان کامپیوتر اجرا کنید (راهنما داخل هر پکیج).
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
 <a
 href="/downloads/android-app-hoosh.zip"
 download="android-app-hoosh.zip"
 className="group rounded-xl border border-border bg-muted/30 hover:bg-primary/5 hover:border-primary/40 transition-colors p-3.5 flex items-start gap-2.5"
 >
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Smartphone className="h-4.5 w-4.5" />
 </span>
 <span className="min-w-0">
 <span className="block text-xs font-bold text-foreground">اپ اندروید (APK)</span>
 <span className="block text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
 سورس Capacitor + راهنمای ساخت APK با Android Studio
 </span>
 </span>
 <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary ms-auto shrink-0 mt-1" />
 </a>
 <a
 href="/downloads/desktop-app-hoosh.zip"
 download="desktop-app-hoosh.zip"
 className="group rounded-xl border border-border bg-muted/30 hover:bg-primary/5 hover:border-primary/40 transition-colors p-3.5 flex items-start gap-2.5"
 >
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Monitor className="h-4.5 w-4.5" />
 </span>
 <span className="min-w-0">
 <span className="block text-xs font-bold text-foreground">اپ دسکتاپ (ویندوز)</span>
 <span className="block text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
 سورس Electron + ساخت EXE نصبی — با منوی فارسی و میان‌برها
 </span>
 </span>
 <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary ms-auto shrink-0 mt-1" />
 </a>
 <a
 href="/pos-bridge/hoosh-pos-bridge.js"
 download="hoosh-pos-bridge.js"
 className="group rounded-xl border border-border bg-muted/30 hover:bg-primary/5 hover:border-primary/40 transition-colors p-3.5 flex items-start gap-2.5"
 >
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Receipt className="h-4.5 w-4.5" />
 </span>
 <span className="min-w-0">
 <span className="block text-xs font-bold text-foreground">پل کارتخوان</span>
 <span className="block text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
 فایل آماده اتصال کارتخوان به صندوق POS — فقط اجرا کنید
 </span>
 </span>
 <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary ms-auto shrink-0 mt-1" />
 </a>
 </div>
 </CardContent>
 </Card>

 {/* مودال‌ها */}
 <InstallModals
 activeModal={activeModal}
 onClose={() => setActiveModal(null)}
 onInstall={handleInstall}
 canInstall={canInstall}
 installing={installing}
 />
 </div>
 );
}

/* ============ Install Modals ============ */
function InstallModals({
 activeModal,
 onClose,
 onInstall,
 canInstall,
 installing,
}: {
 activeModal: ModalKind;
 onClose: () => void;
 onInstall: () => void;
 canInstall: boolean;
 installing: boolean;
}) {
 return (
 <>
 {/* مودال iOS */}
 <Dialog open={activeModal === "ios"} onOpenChange={(o) =>!o && onClose()}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Apple className="h-5 w-5" />
 نصب هوش روی iPhone و iPad
 </DialogTitle>
 <DialogDescription>
 هوش یک وب‌اپ (PWA) است. برای نصب روی iOS از مرورگر Safari استفاده کنید —
 نیازی به اپ‌استور نیست.
 </DialogDescription>
 </DialogHeader>
 <ol className="space-y-3 text-sm">
 <StepItem
 n={1}
 icon={Chrome}
 text="این صفحه را در مرورگر Safari باز کنید (نه Chrome یا سایر مرورگرها)."
 />
 <StepItem
 n={2}
 icon={Share}
 text="روی دکمه Share (آیکون مربع با فلش رو به بالا) در نوار پایین Safari بزنید."
 />
 <StepItem
 n={3}
 icon={PlusCircle}
 text="گزینه «Add to Home Screen» یا «افزودن به صفحه اصلی» را انتخاب کنید."
 />
 <StepItem
 n={4}
 icon={Check}
 text="روی «Add» بزنید — هوش روی صفحه اصلی شما نصب می‌شود و مانند یک اپ مستقل اجرا می‌گردد."
 />
 </ol>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={onClose}>
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* مودال Android */}
 <Dialog open={activeModal === "android"} onOpenChange={(o) =>!o && onClose()}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Smartphone className="h-5 w-5" />
 نصب هوش روی Android
 </DialogTitle>
 <DialogDescription>
 هوش یک وب‌اپ (PWA) است — نیازی به نصب از گوگل‌پلی نیست.
 </DialogDescription>
 </DialogHeader>
 <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
 <p>
 روی دکمه «نصب روی این دستگاه» بزنید تا اپ هوش مستقیماً روی اندروید شما
 نصب شود. این کار کاملاً امن است و از طریق مرورگر Chrome یا Edge انجام می‌شود.
 </p>
 <div className="rounded-lg border border-info/30 bg-info/5 p-3 flex gap-2">
 <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
 <p className="text-xs">
 اگر دکمه نصب فعال نبود، از منوی سه‌نقطه مرورگر (بالا-راست) گزینه
 «Install app» / «افزودن به صفحه اصلی» را انتخاب کنید.
 </p>
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={onClose}>
 بعداً
 </Button>
 <Button onClick={onInstall} disabled={installing}>
 <Download className="h-4 w-4" />
 {installing? "در حال نصب…": "نصب روی این دستگاه"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* مودال Desktop */}
 <Dialog open={activeModal === "desktop"} onOpenChange={(o) =>!o && onClose()}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Monitor className="h-5 w-5" />
 نصب هوش روی دسکتاپ
 </DialogTitle>
 <DialogDescription>
 هوش را روی ویندوز، مک یا کروم‌بوک نصب کنید و مانند یک نرم‌افزار مستقل اجرا کنید.
 </DialogDescription>
 </DialogHeader>
 <ol className="space-y-3 text-sm">
 <StepItem
 n={1}
 icon={Chrome}
 text="در مرورگر Chrome یا Edge (نسخه اخیر) به هوش بروید."
 />
 <StepItem
 n={2}
 icon={Download}
 text="آیکون نصب (یعنی «Install this site as an app») را در سمت راست نوار آدرس پیدا کنید."
 />
 <StepItem
 n={3}
 icon={Check}
 text="روی آن بزنید و تأیید کنید — هوش در منوی Start/Dock شما ظاهر می‌شود."
 />
 </ol>
 <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex gap-2">
 <MonitorSmartphone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
 <p className="text-xs text-muted-foreground">
 اگر آیکون نصب را نمی‌بینید، می‌توانید از منوی سه‌نقطه مرورگر گزینه
 «Cast, save, and share» «Install page as app» را انتخاب کنید.
 </p>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={onClose}>
 بستن
 </Button>
 <Button onClick={onInstall} disabled={installing}>
 <Download className="h-4 w-4" />
 {installing? "در حال نصب…": "نصب سریع"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* مودال نصب دستی (Fallback) */}
 <Dialog open={activeModal === "install-fallback"} onOpenChange={(o) =>!o && onClose()}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Download className="h-5 w-5" />
 نصب دستی هوش
 </DialogTitle>
 <DialogDescription>
 مرورگر شما هنوز دکمه نصب خودکار را نمایش نداده است. مراحل زیر را دنبال کنید:
 </DialogDescription>
 </DialogHeader>
 <ol className="space-y-3 text-sm">
 <StepItem
 n={1}
 icon={Chrome}
 text="در مرورگر Chrome یا Edge به هوش بروید."
 />
 <StepItem
 n={2}
 icon={Info}
 text="منوی سه‌نقطه (بالا-راست) مرورگر را باز کنید."
 />
 <StepItem
 n={3}
 icon={Download}
 text="گزینه «Install app» یا «Add to Home Screen» / «افزودن به صفحه اصلی» را انتخاب کنید."
 />
 <StepItem
 n={4}
 icon={Check}
 text="تأیید کنید — هوش نصب می‌شود."
 />
 </ol>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={onClose}>
 بستن
 </Button>
 <Button variant="ghost" onClick={() => { onClose(); }}>
 <BookOpen className="h-4 w-4" />
 مشاهده راهنمای کامل
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>
 );
}

/* ============ StepItem ============ */
function StepItem({
 n,
 icon: Icon,
 text,
}: {
 n: number;
 icon: LucideIcon;
 text: string;
}) {
 return (
 <li className="flex gap-3">
 <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold tnum">
 {toPersianDigits(String(n))}
 </div>
 <div className="flex gap-2 items-start pt-0.5">
 <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
 <span className="text-foreground/90 leading-relaxed">{text}</span>
 </div>
 </li>
 );
}

/* ============ PhoneMockup ============ */
function PhoneMockup() {
 return (
 <div className="mx-auto lg:mx-0 shrink-0">
 <div className="relative w-[220px] h-[440px] rounded-[2.5rem] border-[6px] border-foreground/80 bg-foreground p-1 shadow-2xl">
 {/* ناچ */}
 <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-5 bg-foreground rounded-b-2xl z-10" />
 {/* صفحه */}
 <div className="w-full h-full rounded-[2rem] bg-background overflow-hidden flex flex-col">
 {/* نوار وضعیت */}
 <div className="flex items-center justify-between px-4 pt-3 pb-1 text-[9px] text-muted-foreground">
 <span className="tnum">۹:۴۱</span>
 <div className="flex items-center gap-1">
 <SignalIcon />
 <WifiIcon />
 <BatteryIcon />
 </div>
 </div>
 {/* هدر اپ */}
 <div className="px-3 py-2 border-b border-border flex items-center justify-between">
 <div>
 <p className="text-[10px] text-muted-foreground">سلام، رضا</p>
 <p className="text-xs font-bold">وضعیت امروز</p>
 </div>
 <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary relative">
 <Bell className="h-3.5 w-3.5" />
 <span className="absolute -top-0.5 -start-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />
 </div>
 </div>
 {/* محتوا */}
 <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
 {/* KPI ها */}
 <div className="grid grid-cols-3 gap-1.5">
 {PHONE_KPIS.map((k) => {
 const Icon = k.icon;
 return (
 <div key={k.label} className="rounded-lg border border-border/60 p-1.5">
 <Icon className={`h-3 w-3 ${k.color}`} />
 <p className="text-[9px] text-muted-foreground mt-1 leading-tight">{k.label}</p>
 <p className="text-[11px] font-bold tnum leading-tight">{k.value}</p>
 </div>
 );
 })}
 </div>
 {/* فاکتور اخیر */}
 <div className="rounded-lg border border-border/60 p-2">
 <p className="text-[10px] font-medium mb-1.5">فاکتورهای اخیر</p>
 <div className="space-y-1">
 {PHONE_RECENT.map((r, i) => (
 <div key={i} className="flex items-center justify-between text-[10px]">
 <span className="truncate">{r.party}</span>
 <span className="font-medium tnum">{r.amount}</span>
 </div>
 ))}
 </div>
 </div>
 {/* چارت مینی */}
 <div className="rounded-lg border border-border/60 p-2">
 <p className="text-[10px] font-medium mb-1.5">فروش هفته</p>
 <div className="flex items-end gap-1 h-12">
 {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
 <div
 key={i}
 className="flex-1 bg-primary/30 rounded-sm"
 style={{ height: `${h}%` }}
 >
 <div className="w-full h-1/2 bg-primary rounded-sm" />
 </div>
 ))}
 </div>
 </div>
 </div>
 {/* تپ‌بار پایین */}
 <div className="border-t border-border flex items-center justify-around py-2 bg-card">
 <div className="flex flex-col items-center gap-0.5">
 <div className="h-3.5 w-3.5 rounded bg-primary" />
 <span className="text-[8px] text-primary font-medium">خانه</span>
 </div>
 <div className="flex flex-col items-center gap-0.5">
 <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[8px] text-muted-foreground">فاکتور</span>
 </div>
 <div className="flex flex-col items-center gap-0.5">
 <Package className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[8px] text-muted-foreground">انبار</span>
 </div>
 <div className="flex flex-col items-center gap-0.5">
 <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[8px] text-muted-foreground">مالی</span>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}

function SignalIcon() {
 return (
 <svg width="10" height="8" viewBox="0 0 10 8" fill="currentColor">
 <rect x="0" y="6" width="2" height="2" rx="0.5" />
 <rect x="3" y="4" width="2" height="4" rx="0.5" />
 <rect x="6" y="2" width="2" height="6" rx="0.5" />
 <rect x="9" y="0" width="2" height="8" rx="0.5" opacity="0.4" />
 </svg>
 );
}

function WifiIcon() {
 return (
 <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="1">
 <path d="M1 2.5 Q5 -0.5 9 2.5" />
 <path d="M2.5 4 Q5 2 7.5 4" />
 <circle cx="5" cy="6" r="0.7" fill="currentColor" />
 </svg>
 );
}

function BatteryIcon() {
 return (
 <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
 <rect x="0.5" y="0.5" width="11" height="7" rx="1.5" stroke="currentColor" />
 <rect x="2" y="2" width="8" height="4" rx="0.5" fill="currentColor" />
 <rect x="12" y="2.5" width="1.5" height="3" rx="0.5" fill="currentColor" />
 </svg>
 );
}

/* ============ FeatureCard ============ */
function FeatureCard({
 feature,
 delay,
 onTryInstall,
}: {
 feature: Feature;
 delay: number;
 onTryInstall: () => void;
}) {
 const Icon = feature.icon;
 return (
 <Card
 className="card-hover animate-stagger cursor-pointer transition-shadow hover:shadow-md"
 style={{ animationDelay: `${delay}ms` }}
 onClick={onTryInstall}
 role="button"
 tabIndex={0}
 onKeyDown={(e: React.KeyboardEvent) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 onTryInstall();
 }
 }}
 >
 <CardContent className="p-4">
 <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${ACCENT_MAP[feature.accent]} mb-3`}>
 <Icon className="h-5 w-5" />
 </div>
 <p className="text-sm font-semibold mb-1">{feature.title}</p>
 <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
 <div className="flex items-center gap-1 mt-3 text-[11px] text-primary">
 <span>امتحان کنید</span>
 <ChevronRight className="h-3 w-3 rotate-180" />
 </div>
 </CardContent>
 </Card>
 );
}
