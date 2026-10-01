"use client";

/**
 * MarketplaceModule — بازار اپلیکیشن هوش
 *
 * داده‌ها از /api/marketplace/apps دریافت می‌شود.
 * دکمه «نصب» به /api/marketplace/apps/install POST می‌کند.
 * اپ‌های نصب‌شده از همان API با flag installed:true فیلتر می‌شوند.
 */

import * as React from "react";
import {
 Store,
 Download,
 Star,
 Code2,
 Plus,
 FileText,
 BarChart3,
 Boxes,
 MessageSquare,
 Link2,
 Receipt,
 ScanLine,
 Bell,
 LayoutDashboard,
 CheckCircle2,
 Settings,
 ChevronLeft,
 Loader2,
 Package,
 Trash2,
 ExternalLink,
 Tag,
 User,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

/* ============ types ============ */
type Category = "all" | "accounting" | "report" | "sales" | "integration" | "tools";

type SubmitCategory = Exclude<Category, "all"> | "ai";
type PricingType = "free" | "freemium" | "paid";

const SUBMIT_CATEGORY_LABEL: Record<SubmitCategory, string> = {
 accounting: "حسابداری",
 report: "گزارش",
 sales: "فروش",
 integration: "یکپارچگی",
 tools: "ابزار",
 ai: "هوش مصنوعی",
};

const PRICING_LABEL: Record<PricingType, string> = {
 free: "رایگان",
 freemium: "فریمیوم (پایه رایگان + پرو پولی)",
 paid: "پولی (اشتراک ماهانه)",
};

interface AppItem {
 id: string;
 name: string;
 developer: string;
 description: string;
 category: Exclude<Category, "all">;
 icon: string; // نام آیکن به‌صورت رشته — نگاشت به کامپوننت Lucide
 rating: number;
 installs: string | number;
 installed?: boolean;
 version?: string;
 entryUrl?: string;
 publishedAt?: string;
 verified?: boolean;
 pricing?: {
 type: "free" | "freemium" | "paid";
 monthlyPrice?: number;
 proPrice?: number;
 };
}

/* نگاشت نام آیکن کامپوننت Lucide */
const ICON_MAP: Record<string, LucideIcon> = {
 BarChart3,
 Boxes,
 MessageSquare,
 Link2,
 Receipt,
 ScanLine,
 Bell,
 LayoutDashboard,
 Package,
 Store,
};

function getIcon(name: string): LucideIcon {
 return ICON_MAP[name]?? Package;
}
void getIcon; // (kept for backward compat; not used directly anymore)

const CATEGORY_LABEL: Record<Category, string> = {
 all: "همه",
 accounting: "حسابداری",
 report: "گزارش",
 sales: "فروش",
 integration: "یکپارچگی",
 tools: "ابزار",
};

/* ============ کامپوننت اصلی ============ */
export function MarketplaceModule() {
 const { toast } = useToast();
 const [apps, setApps] = React.useState<AppItem[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [installingId, setInstallingId] = React.useState<string | null>(null);
 const [category, setCategory] = React.useState<Category>("all");

 const [error, setError] = React.useState<string | null>(null);
 const [manageApp, setManageApp] = React.useState<AppItem | null>(null);
 const [uninstallTarget, setUninstallTarget] = React.useState<AppItem | null>(
 null
 );
 const [uninstalling, setUninstalling] = React.useState(false);

 // ============ فرم ثبت اپ توسعه‌دهنده ============
 const [registerOpen, setRegisterOpen] = React.useState(false);
 const [registerForm, setRegisterForm] = React.useState({
 name: "",
 description: "",
 category: "accounting" as SubmitCategory,
 pricingType: "free" as PricingType,
 monthlyPrice: 0,
 developerName: "",
 websiteUrl: "",
 });
 const [registerSubmitting, setRegisterSubmitting] = React.useState(false);

 const resetRegisterForm = () => {
 setRegisterForm({
 name: "",
 description: "",
 category: "accounting",
 pricingType: "free",
 monthlyPrice: 0,
 developerName: "",
 websiteUrl: "",
 });
 };

 const fetchApps = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const res = await authFetch("/api/marketplace/apps", { cache: "no-store" });
 const json = await res.json();
 if (json.apps && Array.isArray(json.apps)) {
 setApps(json.apps);
 } else if (Array.isArray(json.data)) {
 setApps(json.data);
 } else if (Array.isArray(json)) {
 setApps(json);
 } else {
 setApps([]);
 }
 } catch (err) {
 console.error("fetchApps error:", err);
 setApps([]);
 setError("دریافت لیست اپ‌ها با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchApps();
 }, [fetchApps]);

 const handleInstall = async (app: AppItem) => {
 setInstallingId(app.id);
 try {
 const res = await authFetch("/api/marketplace/apps/install", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ appId: app.id }),
 });
 const json = await res.json();
 if (json.success || res.ok) {
 toast({
 title: "نصب کامل شد",
 description: `اپ «${app.name}» با موفقیت نصب شد.`,
 });
 // به‌روزرسانی state محلی
 setApps((prev) =>
 prev.map((a) => (a.id === app.id? {...a, installed: true }: a))
 );
 } else {
 toast({
 title: "خطا در نصب",
 description: json.error?? "نصب ناموفق بود",
 variant: "destructive",
 });
 }
 } catch (err) {
 console.error("handleInstall error:", err);
 toast({
 title: "خطا در نصب",
 description: `خطا در ارتباط با سرور. اپ «${app.name}» نصب نشد.`,
 variant: "destructive",
 });
 } finally {
 setInstallingId(null);
 }
 };

 const handleManage = (app: AppItem) => {
 setManageApp(app);
 };

 const handleUninstall = async (app: AppItem) => {
 setUninstalling(true);
 try {
 const res = await authFetch(
 `/api/marketplace/apps/install?appId=${encodeURIComponent(app.id)}`,
 { method: "DELETE" }
 );
 const json = await res.json().catch(() => ({}));
 if (json.success || res.ok) {
 toast({
 title: "حذف اپ",
 description: `اپ «${app.name}» از حساب شما حذف شد.`,
 });
 setApps((prev) =>
 prev.map((a) => (a.id === app.id? {...a, installed: false }: a))
 );
 setManageApp(null);
 } else {
 toast({
 title: "خطا در حذف",
 description: json.error?? "حذف ناموفق بود",
 variant: "destructive",
 });
 }
 } catch (err) {
 console.error("handleUninstall error:", err);
 toast({
 title: "خطا در ارتباط با سرور",
 description: `حذف اپ «${app.name}» انجام نشد.`,
 variant: "destructive",
 });
 } finally {
 setUninstalling(false);
 setUninstallTarget(null);
 }
 };

 const handleDevDocs = () => {
 toast({
 title: "مستندات توسعه‌دهنده",
 description: "برای مشاهده‌ی مستندات کامل به بخش API و توسعه مراجعه کنید.",
 });
 };

 const handleRegisterApp = () => {
 resetRegisterForm();
 setRegisterOpen(true);
 };

 const handleRegisterSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (registerForm.name.trim().length < 3) {
 toast({
 title: "نام اپ کوتاه است",
 description: "نام اپ باید حداقل ۳ کاراکتر باشد.",
 variant: "destructive",
 });
 return;
 }
 if (registerForm.description.trim().length < 10) {
 toast({
 title: "توضیحات ناکافی",
 description: "توضیحات اپ باید حداقل ۱۰ کاراکتر باشد.",
 variant: "destructive",
 });
 return;
 }
 setRegisterSubmitting(true);
 try {
 // تلاش برای خواندن توکن کاربر از localStorage
 const token =
 typeof window!== "undefined"
? localStorage.getItem("hoshhesab_user_token") || ""
: "";
 const res = await fetch("/api/marketplace/submit", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
...(token? { Authorization: `Bearer ${token}` }: {}),
 },
 body: JSON.stringify({
 name: registerForm.name.trim(),
 description: registerForm.description.trim(),
 category: registerForm.category,
 pricingType: registerForm.pricingType,
 monthlyPrice:
 registerForm.pricingType === "paid"
? Number(registerForm.monthlyPrice) || 0
: 0,
 developerName: registerForm.developerName.trim(),
 websiteUrl: registerForm.websiteUrl.trim(),
 }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) {
 throw new Error(data.error || "ثبت اپ ناموفق بود");
 }
 toast({
 title: "اپ ثبت شد",
 description:
 data.message ||
 "اپ شما برای بررسی ثبت شد. ظرف ۴۸ ساعت نتیجه اعلام می‌شود.",
 });
 setRegisterOpen(false);
 resetRegisterForm();
 } catch (err) {
 toast({
 title: "خطا در ثبت اپ",
 description: err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setRegisterSubmitting(false);
 }
 };

 const filtered = React.useMemo(() => {
 if (category === "all") return apps;
 return apps.filter((a) => a.category === category);
 }, [apps, category]);

 const installedApps = React.useMemo(() => apps.filter((a) => a.installed), [apps]);

 const avgRating = apps.length > 0
? apps.reduce((s, a) => s + a.rating, 0) / apps.length
: 0;

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هیرو */}
 <Card className="card-hover overflow-hidden relative">
 <div className="absolute inset-0 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent pointer-events-none" />
 <CardContent className="p-6 relative">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div className="flex items-start gap-4 max-w-2xl">
 <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shrink-0">
 <Store className="h-7 w-7" />
 </div>
 <div className="min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <h2 className="text-xl font-bold text-foreground">بازار اپلیکیشن هوش</h2>
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
 جدید
 </Badge>
 </div>
 <p className="text-sm text-muted-foreground leading-relaxed">
 اپلیکیشن‌های تخصصی حسابداری را نصب کنید و قابلیت‌های هوش را گسترش دهید.
 از گزارش‌ساز پیشرفته تا اتصال به CRM خارجی — همه در یکجا.
 </p>
 <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-muted-foreground">
 <span className="flex items-center gap-1">
 <Download className="h-3 w-3" />
 {toPersianDigits(apps.length)} اپ
 </span>
 <span className="flex items-center gap-1">
 <Star className="h-3 w-3 text-primary" />
 میانگین {toPersianDigits(avgRating.toFixed(1))} از {toPersianDigits("۵")}
 </span>
 <span className="flex items-center gap-1">
 <CheckCircle2 className="h-3 w-3 text-success" />
 تأییدشده توسط هوش
 </span>
 </div>
 </div>
 </div>
 <div className="flex flex-col sm:flex-row gap-2 shrink-0">
 <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={handleDevDocs}>
 <Code2 className="h-3.5 w-3.5" />
 مستندات API توسعه‌دهنده
 </Button>
 <Button size="sm" className="gap-1.5 h-9" onClick={handleRegisterApp}>
 <Plus className="h-3.5 w-3.5" />
 ثبت اپ خود
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* فیلتر دسته‌بندی */}
 <Tabs value={category} onValueChange={(v) => setCategory(v as Category)}>
 <TabsList className="flex-wrap h-auto">
 {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
 <TabsTrigger key={c} value={c} className="text-xs">
 {CATEGORY_LABEL[c]}
 </TabsTrigger>
 ))}
 </TabsList>

 <TabsContent value={category} className="mt-4">
 {loading? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 </div>
 ): error? (
 <Card>
 <CardContent className="py-12 text-center">
 <Store className="h-10 w-10 mx-auto mb-2 opacity-40" />
 <p className="text-sm text-destructive mb-3">{error}</p>
 <Button variant="outline" size="sm" className="h-8" onClick={() => void fetchApps()}>
 <Loader2 className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </CardContent>
 </Card>
 ): filtered.length === 0? (
 <Card>
 <CardContent className="py-12 text-center text-muted-foreground">
 <Store className="h-10 w-10 mx-auto mb-2 opacity-40" />
 <p className="text-sm">اپلیکیشنی در این دسته یافت نشد.</p>
 </CardContent>
 </Card>
 ): (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
 {filtered.map((app, i) => (
 <AppCard
 key={app.id}
 app={app}
 delay={i * 50}
 installing={installingId === app.id}
 onInstall={() => handleInstall(app)}
 onManage={() => handleManage(app)}
 />
 ))}
 </div>
 )}
 </TabsContent>
 </Tabs>

 {/* اپ‌های نصب‌شده */}
 <Card className="card-hover">
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
 <CheckCircle2 className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">اپ‌های نصب‌شده</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(installedApps.length)} اپ فعال روی حساب شما
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 gap-1 text-muted-foreground"
 onClick={() => setCategory("all")}
 >
 همه
 <ChevronLeft className="h-3 w-3" />
 </Button>
 </CardHeader>
 <CardContent>
 {installedApps.length === 0? (
 <div className="text-center py-8 text-sm text-muted-foreground">
 هنوز اپی نصب نشده است. از لیست بالا اولین اپ خود را نصب کنید.
 </div>
 ): (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {installedApps.map((app) => {
 const Icon = ICON_MAP[app.icon]?? Package;
 return (
 <div
 key={app.id}
 className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors"
 >
 <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/10 text-success shrink-0">
 <Icon className="h-5 w-5" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-0.5">
 <p className="text-sm font-medium truncate">{app.name}</p>
 <Badge variant="secondary" className="text-[9px] bg-success/10 text-success">
 نصب‌شده
 </Badge>
 </div>
 <p className="text-[11px] text-muted-foreground line-clamp-2">{app.description}</p>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-7 gap-1 text-xs shrink-0"
 onClick={() => handleManage(app)}
 >
 <Settings className="h-3 w-3" />
 مدیریت
 </Button>
 </div>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>

 {/* بنر توسعه‌دهنده */}
 <Card className="card-hover">
 <CardContent className="p-5">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <Code2 className="h-5 w-5" />
 </div>
 <div>
 <p className="text-sm font-medium">برای توسعه‌دهندگان</p>
 <p className="text-xs text-muted-foreground mt-0.5">
 از REST API هوش استفاده کنید و اپ خود را منتشر کنید
 </p>
 </div>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleDevDocs}>
 <FileText className="h-3 w-3" />
 مستندات
 </Button>
 <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleRegisterApp}>
 <Plus className="h-3 w-3" />
 ثبت اپ جدید
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ مدیریت اپ */}
 <Dialog
 open={manageApp!== null}
 onOpenChange={(open) =>!open && setManageApp(null)}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 {manageApp && (
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 {(() => {
 const Icon = ICON_MAP[manageApp.icon]?? Package;
 return <Icon className="h-4 w-4" />;
 })()}
 </span>
 )}
 مدیریت اپ — {manageApp?.name}
 </DialogTitle>
 <DialogDescription>
 مشاهده‌ی اطلاعات اپ نصب‌شده و حذف آن از حساب شما.
 </DialogDescription>
 </DialogHeader>

 {manageApp && (
 <div className="space-y-3">
 <div className="text-sm text-muted-foreground leading-relaxed">
 {manageApp.description}
 </div>

 <div className="grid grid-cols-2 gap-2 text-xs">
 <div className="rounded-lg border border-border/60 p-2.5">
 <div className="flex items-center gap-1 text-muted-foreground mb-1">
 <User className="h-3 w-3" />
 توسعه‌دهنده
 </div>
 <p className="font-medium truncate">{manageApp.developer}</p>
 </div>
 <div className="rounded-lg border border-border/60 p-2.5">
 <div className="flex items-center gap-1 text-muted-foreground mb-1">
 <Tag className="h-3 w-3" />
 دسته‌بندی
 </div>
 <p className="font-medium">
 {CATEGORY_LABEL[manageApp.category]}
 </p>
 </div>
 <div className="rounded-lg border border-border/60 p-2.5">
 <div className="flex items-center gap-1 text-muted-foreground mb-1">
 <Star className="h-3 w-3" />
 رتبه
 </div>
 <p className="font-medium tnum">
 {toPersianDigits(manageApp.rating.toFixed(1))} از{" "}
 {toPersianDigits("۵")}
 </p>
 </div>
 <div className="rounded-lg border border-border/60 p-2.5">
 <div className="flex items-center gap-1 text-muted-foreground mb-1">
 <Download className="h-3 w-3" />
 نصب‌ها
 </div>
 <p className="font-medium tnum">
 {toPersianDigits(manageApp.installs)}
 </p>
 </div>
 </div>

 {manageApp.version && (
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">نسخه</span>
 <Badge variant="secondary" className="text-[10px] tnum">
 v{toPersianDigits(manageApp.version)}
 </Badge>
 </div>
 )}

 {manageApp.verified!== undefined && (
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">وضعیت تأیید</span>
 {manageApp.verified? (
 <Badge className="text-[10px] bg-success/10 text-success gap-1">
 <CheckCircle2 className="h-3 w-3" />
 تأییدشده
 </Badge>
 ): (
 <Badge variant="secondary" className="text-[10px]">
 در حال بررسی
 </Badge>
 )}
 </div>
 )}

 {manageApp.entryUrl && (
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">آدرس اپ</span>
 <a
 href={manageApp.entryUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="flex items-center gap-1 text-primary hover:underline truncate max-w-[60%]"
 dir="ltr"
 >
 <ExternalLink className="h-3 w-3 shrink-0" />
 <span className="truncate">ورود به اپ</span>
 </a>
 </div>
 )}
 </div>
 )}

 <DialogFooter className="gap-2 sm:gap-2">
 <Button variant="outline" onClick={() => setManageApp(null)}>
 بستن
 </Button>
 <Button
 variant="destructive"
 className="gap-1.5"
 disabled={uninstalling}
 onClick={() => manageApp && setUninstallTarget(manageApp)}
 >
 {uninstalling? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Trash2 className="h-4 w-4" />
 )}
 حذف اپ
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ تأیید حذف اپ */}
 <AlertDialog
 open={uninstallTarget!== null}
 onOpenChange={(open) =>!open &&!uninstalling && setUninstallTarget(null)}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>حذف اپ</AlertDialogTitle>
 <AlertDialogDescription>
 آیا از حذف اپ «{uninstallTarget?.name}» از حساب خود مطمئن هستید؟
 این عمل قابل بازگشت نیست.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={uninstalling}>انصراف</AlertDialogCancel>
 <AlertDialogAction
 disabled={uninstalling}
 onClick={(e) => {
 e.preventDefault();
 if (uninstallTarget) void handleUninstall(uninstallTarget);
 }}
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 {uninstalling? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Trash2 className="h-4 w-4" />
 )}
 حذف
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* دیالوگ ثبت اپ توسعه‌دهنده */}
 <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Plus className="h-4 w-4" />
 </span>
 ثبت اپ جدید در بازار اپلیکیشن
 </DialogTitle>
 <DialogDescription>
 فرم زیر را پر کنید. اپ پس از بررسی تیم هوش منتشر خواهد شد.
 </DialogDescription>
 </DialogHeader>
 <form onSubmit={handleRegisterSubmit} className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="reg-app-name">نام اپ *</Label>
 <Input
 id="reg-app-name"
 value={registerForm.name}
 onChange={(e) =>
 setRegisterForm({...registerForm, name: e.target.value })
 }
 placeholder="مثلاً: گزارش‌ساز پیشرفته"
 disabled={registerSubmitting}
 maxLength={60}
 />
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="reg-app-desc">توضیحات اپ *</Label>
 <Textarea
 id="reg-app-desc"
 value={registerForm.description}
 onChange={(e) =>
 setRegisterForm({...registerForm, description: e.target.value })
 }
 placeholder="قابلیت‌ها و کاربردهای اپ خود را شرح دهید..."
 rows={4}
 disabled={registerSubmitting}
 maxLength={500}
 />
 <p className="text-[10px] text-muted-foreground">
 {toPersianDigits(registerForm.description.length)} / ۵۰۰ کاراکتر
 </p>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label>دسته‌بندی</Label>
 <Select
 value={registerForm.category}
 onValueChange={(v) =>
 setRegisterForm({
...registerForm,
 category: v as SubmitCategory,
 })
 }
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {(Object.keys(SUBMIT_CATEGORY_LABEL) as SubmitCategory[]).map(
 (c) => (
 <SelectItem key={c} value={c}>
 {SUBMIT_CATEGORY_LABEL[c]}
 </SelectItem>
 )
 )}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label>مدل قیمت‌گذاری</Label>
 <Select
 value={registerForm.pricingType}
 onValueChange={(v) =>
 setRegisterForm({
...registerForm,
 pricingType: v as PricingType,
 })
 }
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {(Object.keys(PRICING_LABEL) as PricingType[]).map((p) => (
 <SelectItem key={p} value={p}>
 {PRICING_LABEL[p]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 {registerForm.pricingType === "paid" && (
 <div className="space-y-1.5">
 <Label htmlFor="reg-price">قیمت ماهانه (تومان)</Label>
 <Input
 id="reg-price"
 type="number"
 min={0}
 value={registerForm.monthlyPrice}
 onChange={(e) =>
 setRegisterForm({
...registerForm,
 monthlyPrice: Number(e.target.value) || 0,
 })
 }
 disabled={registerSubmitting}
 dir="ltr"
 />
 </div>
 )}

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="reg-dev">نام توسعه‌دهنده</Label>
 <Input
 id="reg-dev"
 value={registerForm.developerName}
 onChange={(e) =>
 setRegisterForm({
...registerForm,
 developerName: e.target.value,
 })
 }
 placeholder="نام شما یا شرکت"
 disabled={registerSubmitting}
 maxLength={80}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="reg-url">آدرس وب‌سایت (اختیاری)</Label>
 <Input
 id="reg-url"
 type="url"
 value={registerForm.websiteUrl}
 onChange={(e) =>
 setRegisterForm({...registerForm, websiteUrl: e.target.value })
 }
 placeholder="https://example.com"
 disabled={registerSubmitting}
 dir="ltr"
 />
 </div>
 </div>

 <DialogFooter>
 <Button
 type="button"
 variant="outline"
 onClick={() => setRegisterOpen(false)}
 disabled={registerSubmitting}
 >
 انصراف
 </Button>
 <Button type="submit" disabled={registerSubmitting} className="gap-1.5">
 {registerSubmitting? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ارسال...
 </>
 ): (
 <>
 <Plus className="h-4 w-4" />
 ثبت برای بررسی
 </>
 )}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 </div>
 );
}

/* ============ AppCard ============ */
function AppCard({
 app,
 delay,
 installing,
 onInstall,
 onManage,
}: {
 app: AppItem;
 delay: number;
 installing: boolean;
 onInstall: () => void;
 onManage: () => void;
}) {
 const Icon = ICON_MAP[app.icon]?? Package;
 return (
 <Card
 className="card-hover animate-stagger flex flex-col"
 style={{ animationDelay: `${delay}ms` }}
 >
 <CardContent className="p-4 flex-1 flex flex-col">
 <div className="flex items-start gap-3 mb-3">
 <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <Icon className="h-5 w-5" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-semibold truncate">{app.name}</p>
 <p className="text-[11px] text-muted-foreground truncate">توسعه: {app.developer}</p>
 </div>
 </div>

 <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1">
 {app.description}
 </p>

 <div className="flex items-center justify-between mb-3 text-[11px]">
 <div className="flex items-center gap-1">
 <StarRating rating={app.rating} />
 <span className="text-muted-foreground tnum">{toPersianDigits(app.rating.toFixed(1))}</span>
 </div>
 <span className="text-muted-foreground tnum">
 {toPersianDigits(app.installs)} نصب
 </span>
 </div>

 {app.installed? (
 <Button
 size="sm"
 variant="outline"
 className="w-full h-8 gap-1.5 text-xs"
 onClick={onManage}
 >
 <Settings className="h-3.5 w-3.5" />
 مدیریت
 </Button>
 ): (
 <Button
 size="sm"
 className="w-full h-8 gap-1.5 text-xs"
 onClick={onInstall}
 disabled={installing}
 >
 {installing? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Download className="h-3.5 w-3.5" />
 )}
 {installing? "در حال نصب...": "نصب"}
 </Button>
 )}
 </CardContent>
 </Card>
 );
}

/* ============ StarRating ============ */
function StarRating({ rating }: { rating: number }) {
 const full = Math.floor(rating);
 const half = rating - full >= 0.5;
 return (
 <div className="flex items-center gap-0.5" aria-label={`رتبه ${rating} از ۵`}>
 {Array.from({ length: 5 }).map((_, i) => {
 const filled = i < full;
 const isHalf = i === full && half;
 return (
 <span
 key={i}
 className={`relative inline-block ${
 filled || isHalf? "text-primary": "text-muted-foreground/30"
 }`}
 >
 <Star className="h-3 w-3" fill={filled? "currentColor": "none"} />
 {isHalf && (
 <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
 <Star className="h-3 w-3 text-primary" fill="currentColor" />
 </span>
 )}
 </span>
 );
 })}
 </div>
 );
}
