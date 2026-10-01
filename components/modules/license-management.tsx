"use client";

import * as React from "react";
import {
 KeyRound,
 CheckCircle2,
 XCircle,
 Clock,
 Loader2,
 ShieldCheck,
 Calendar,
 Package,
 AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface LicenseInfo {
 isValid?: boolean;
 isDemo?: boolean;
 isTrial?: boolean;
 plan?: string;
 status?: string;
 endDate?: string | null;
 daysRemaining?: number | null;
}

export function LicenseManagement({ token }: { token: string }) {
 const { toast } = useToast();
 const [licenseKey, setLicenseKey] = React.useState("");
 const [loading, setLoading] = React.useState(false);
 const [activating, setActivating] = React.useState(false);
 const [info, setInfo] = React.useState<LicenseInfo | null>(null);

 const loadStatus = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await authFetch("/api/license/status");
 const data = await res.json();
 if (data.success) {
 setInfo(data.data || data);
 }
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 loadStatus();
 }, [loadStatus]);

 const handleActivate = async () => {
 if (!licenseKey.trim()) {
 toast({ title: "خطا", description: "کد لایسنس را وارد کنید", variant: "destructive" });
 return;
 }
 setActivating(true);
 try {
 const res = await authFetch("/api/license/activate", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ licenseKey: licenseKey.trim() }),
 });
 const data = await res.json();
 if (data.success) {
 toast({ title: "لایسنس فعال شد", description: "اشتراک شما با موفقیت فعال شد — قفل‌های پلن باز شدند" });
 setLicenseKey("");
 // FIX(v18-لایسنس): اطلاع به app-shell تا پلن جدید واکشی و قفل‌های ماژول باز شوند
 try {
 window.dispatchEvent(new Event("hoshhesab:license-changed"));
 } catch { /* ignore */ }
 loadStatus();
 } else {
 toast({ title: "خطا در فعال‌سازی", description: data.error || "کد نامعتبر", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setActivating(false);
 }
 };

 const planNameFa: Record<string, string> = {
 free: "رایگان",
 basic: "پایه",
 pro: "حرفه‌ای",
 enterprise: "سازمانی",
 starter: "پایه",
 business: "کسب‌وکار",
 trial: "آزمایشی",
 none: "بدون لایسنس",
 };

 const formatDate = (d?: string | null) => {
 if (!d) return "نامحدود";
 try {
 return new Date(d).toLocaleDateString("fa-IR");
 } catch {
 return d;
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center h-96">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 );
 }

 const hasActiveLicense = info?.isValid &&!info?.isTrial && info?.status === "ACTIVE" &&!info?.isDemo;
 const isTrialMode = info?.isTrial && info?.isValid;
 const noLicense =!hasActiveLicense &&!isTrialMode;

 return (
 <div className="p-4 max-w-4xl mx-auto space-y-6">
 <div className="flex items-center gap-3">
 <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <KeyRound className="h-6 w-6" />
 </div>
 <div>
 <h1 className="text-xl font-bold">مدیریت لایسنس</h1>
 <p className="text-sm text-muted-foreground">فعال‌سازی و مدیریت لایسنس نرم‌افزار</p>
 </div>
 </div>

 {/* Current Status */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <ShieldCheck className="h-5 w-5 text-primary" />
 وضعیت فعلی
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 {hasActiveLicense? (
 <div className="space-y-3">
 <div className="flex items-center gap-2">
 <CheckCircle2 className="h-5 w-5 text-green-500" />
 <Badge className="bg-green-500/10 text-green-600">لایسنس فعال</Badge>
 <span className="text-sm font-medium">
 پلن {planNameFa[info?.plan || ""] || info?.plan}
 </span>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="flex items-center gap-2 text-sm">
 <Calendar className="h-4 w-4 text-muted-foreground" />
 <span>تاریخ انقضا: {toPersianDigits(formatDate(info?.endDate))}</span>
 </div>
 <div className="flex items-center gap-2 text-sm">
 <Package className="h-4 w-4 text-muted-foreground" />
 <span>روزهای باقی‌مانده: {info?.daysRemaining? toPersianDigits(info.daysRemaining) + " روز": "نامحدود"}</span>
 </div>
 </div>
 </div>
 ): isTrialMode? (
 <div className="space-y-3">
 <div className="flex items-center gap-2">
 <Clock className="h-5 w-5 text-amber-500" />
 <Badge className="bg-amber-500/10 text-amber-600">دوره آزمایشی</Badge>
 {info?.endDate && (
 <span className="text-sm text-muted-foreground">
 تا {toPersianDigits(formatDate(info.endDate))}
 </span>
 )}
 </div>
 <p className="text-sm text-muted-foreground">
 شما در حال استفاده از دوره آزمایشی ۱۴ روزه هستید. برای ادامه استفاده، لایسنس خود را فعال کنید.
 </p>
 </div>
 ): (
 <div className="flex items-center gap-2">
 <XCircle className="h-5 w-5 text-red-500" />
 <Badge variant="destructive">بدون لایسنس</Badge>
 <p className="text-sm text-muted-foreground">برای استفاده از نرم‌افزار، لایسنس خود را فعال کنید.</p>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Activate License */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <KeyRound className="h-5 w-5 text-primary" />
 فعال‌سازی لایسنس
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div>
 <Label className="mb-2 block">کد لایسنس</Label>
 <Input
 value={licenseKey}
 onChange={(e) => setLicenseKey(e.target.value)}
 placeholder="مثلاً HOSH-XXXXX-XXXXX-XXXXX-XXXXX"
 className="font-mono text-base"
 dir="ltr"
 />
 <p className="text-xs text-muted-foreground mt-1">
 کد لایسنس را از ایمیل خرید یا پشتیبانی دریافت کرده‌اید.
 </p>
 </div>
 <Button
 onClick={handleActivate}
 disabled={activating ||!licenseKey.trim()}
 className="w-full"
 >
 {activating? (
 <>
 <Loader2 className="h-4 w-4 ml-2 animate-spin" />
 در حال فعال‌سازی...
 </>
 ): (
 <>
 <KeyRound className="h-4 w-4 ml-2" />
 فعال‌سازی لایسنس
 </>
 )}
 </Button>
 </CardContent>
 </Card>

 {/* Anti-piracy Info */}
 <Card className="bg-amber-50/50 border-amber-200">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base text-amber-700">
 <AlertTriangle className="h-5 w-5" />
 اطلاعات امنیتی لایسنس
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-2 text-sm text-amber-800">
 <p>• هر لایسنس فقط به یک شرکت متصل می‌شود.</p>
 <p>• انتقال لایسنس بین شرکت‌ها با تماس با پشتیبانی امکان‌پذیر است.</p>
 <p>• لایسنس غیرقابل کپی‌برداری است و با کلید واحد ذخیره می‌شود.</p>
 <p>• در صورت تلاش برای استفاده غیرمجاز، لایسنس به‌طور خودکار مسدود می‌شود.</p>
 <p>• پشتیبانی: ۰۷۱-۳۲۶۲۲۴۹۳</p>
 </CardContent>
 </Card>
 </div>
 );
}
