"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
 Copy,
 Eye,
 EyeOff,
 Check,
 User,
 Lock,
 CalendarClock,
 AlertTriangle,
 Sparkles,
 ArrowLeft,
 Download,
 Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

export interface TrialCredentials {
 username: string;
 password: string;
 trialEndsAt: string;
 companyName?: string;
}

interface TrialSuccessModalProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 credentials: TrialCredentials | null;
 onEnterPanel: () => void;
}

export function TrialSuccessModal({
 open,
 onOpenChange,
 credentials,
 onEnterPanel,
}: TrialSuccessModalProps) {
 const { toast } = useToast();
 const [showPassword, setShowPassword] = React.useState(false);
 const [copiedField, setCopiedField] = React.useState<
 "username" | "password" | "all" | null
 >(null);
 const [countdown, setCountdown] = React.useState(10);
 // FIX(mobile): شمارش معکوس با اولین تعامل کاربر (کپی/نمایش رمز/دانلود) متوقف می‌شود
 // تا فرصت دیدن و کپی کردن اطلاعات وجود داشته باشد
 const [countdownPaused, setCountdownPaused] = React.useState(false);

 // ورود خودکار بعد از ۱۰ ثانیه — با تعامل کاربر متوقف می‌شود
 React.useEffect(() => {
 if (!open || !credentials) return;
 setCountdown(10);
 setCountdownPaused(false);
 const interval = setInterval(() => {
 if (countdownPaused) return;
 setCountdown((c) => {
 if (c <= 1) {
 clearInterval(interval);
 onEnterPanel();
 return 0;
 }
 return c - 1;
 });
 }, 1000);
 return () => clearInterval(interval);
 }, [open, credentials, onEnterPanel, countdownPaused]);

 React.useEffect(() => {
 if (!open) {
 setShowPassword(false);
 setCopiedField(null);
 }
 }, [open]);

 if (!credentials) return null;

 const trialEndsJalali = toJalali(new Date(credentials.trialEndsAt));

 const copyToClipboard = async (text: string, field: "username" | "password" | "all") => {
 setCountdownPaused(true); // تعامل کاربر — شمارش معکوس متوقف
 let ok = false;
 try {
 if (navigator.clipboard?.writeText) {
 await navigator.clipboard.writeText(text);
 ok = true;
 }
 } catch {
 ok = false;
 }
 if (!ok) {
 // Fallback برای مرورگرهای قدیمی/WebView که clipboard API ندارند (موبایل)
 try {
 const ta = document.createElement("textarea");
 ta.value = text;
 ta.style.position = "fixed";
 ta.style.opacity = "0";
 document.body.appendChild(ta);
 ta.select();
 document.execCommand("copy");
 document.body.removeChild(ta);
 ok = true;
 } catch {
 ok = false;
 }
 }
 if (ok) {
 setCopiedField(field);
 toast({
 title: "کپی شد",
 description: "اطلاعات در حافظه کپی شد.",
 });
 setTimeout(() => setCopiedField(null), 2000);
 } else {
 toast({
 title: "خطا در کپی",
 description: "لطفاً به‌صورت دستی کپی کنید (متن قابل انتخاب است).",
 variant: "destructive",
 });
 }
 };

 const handleCopyAll = () => {
 const text = `نام کاربری: ${credentials.username}\nرمز عبور: ${credentials.password}\nتاریخ پایان تریال: ${trialEndsJalali}`;
 copyToClipboard(text, "all");
 };

 const handleDownloadCredentials = () => {
 try {
 const lines = [
 "هوش — اطلاعات ورود به حساب کاربری",
 "===========================================",
 "",
 `نام کاربری: ${credentials.username}`,
 `رمز عبور: ${credentials.password}`,
 "",
 `تاریخ پایان تریال: ${trialEndsJalali}`,
 credentials.companyName? `سازمان: ${credentials.companyName}`: "",
 "",
 "تاریخ تولید: " + new Date().toLocaleString("fa-IR"),
 "",
 "هشدار: این اطلاعات را در جای امنی ذخیره کنید.",
 "برای ورود مجدد به پنل، به نام کاربری و رمز عبور بالا نیاز دارید.",
 "در صورت گم کردن رمز، بازیابی فقط از طریق پشتیبانی امکان‌پذیر است.",
 ].filter(Boolean);
 const fileContent = lines.join("\n") + "\n";
 const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `hoshhesab-login-${credentials.username}.txt`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 // آزاد کردن URL پس از مدت کوتاهی
 setTimeout(() => URL.revokeObjectURL(url), 2000);
 toast({
 title: "دانلود شروع شد",
 description: "فایل اطلاعات ورود دانلود می‌شود.",
 });
 } catch {
 toast({
 title: "خطا در دانلود",
 description: "لطفاً به‌صورت دستی اطلاعات را کپی کنید.",
 variant: "destructive",
 });
 }
 };

 const handleEnterPanelNow = () => {
 onOpenChange(false);
 onEnterPanel();
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 {/* FIX(mobile): max-height + اسکرول عمودی — قبلاً overflow-hidden بود و در موبایل
 اطلاعات ورود بیرون از کادر می‌افتاد و نه دیده می‌شد نه قابل کپی بود.
 FIX(21-C): w-[95vw] صریح + max-h-[92dvh] — همیشه مرکز‌چین و درون viewport؛
 پهنای موبایل ۹۵٪ صفحه (الگوی سراسری globals.css هم همین را تضمین می‌کند).
 overflow-hidden حذف شد تا با overflow-y-auto تداخل نکند (اسکرول بدنه قطعی باشد). */}
 <DialogContent className="w-[95vw] max-w-md p-0 gap-0 border-0 shadow-2xl max-h-[92dvh] overflow-y-auto overscroll-contain">
 {/* هدر Glassmorphism ایندیگو */}
 <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80 px-4 sm:px-6 py-6 sm:py-8 text-primary-foreground shrink-0">
 <div className="absolute inset-0 opacity-30" aria-hidden="true">
 <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-white/30 blur-3xl orb-float" />
 <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-white/20 blur-2xl orb-float" style={{ animationDelay: "5s" }} />
 </div>
 <DialogHeader className="relative space-y-3">
 <motion.div
 initial={{ scale: 0, rotate: -180 }}
 animate={{ scale: 1, rotate: 0 }}
 transition={{ type: "spring", duration: 0.7 }}
 className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md mx-auto"
 >
 <Sparkles className="h-7 w-7" />
 </motion.div>
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.2 }}
 >
 <Badge className="bg-white/20 text-primary-foreground border-white/20 backdrop-blur mb-2">
 تریال ۳ روزه فعال شد
 </Badge>
 <DialogTitle className="text-2xl font-bold tracking-tight text-center">
 حساب شما ساخته شد
 </DialogTitle>
 <DialogDescription className="text-primary-foreground/80 text-sm text-center">
 ۳ روز رایگان — بدون نیاز به کارت اعتباری
 </DialogDescription>
 </motion.div>
 </DialogHeader>
 </div>

 {/* بدنه — اطلاعات ورود */}
 <div className="glass p-4 sm:p-6 space-y-3 sm:space-y-4">
 {credentials.companyName && (
 <div className="text-center">
 <p className="text-xs text-muted-foreground mb-1">سازمان</p>
 <p className="text-sm font-semibold text-foreground">
 {credentials.companyName}
 </p>
 </div>
 )}

 {/* نام کاربری */}
 <div className="space-y-1.5">
 <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
 <User className="h-3.5 w-3.5" />
 نام کاربری
 </label>
 <div className="flex items-center gap-1.5 sm:gap-2">
 <div className="flex-1 min-w-0 rounded-md border border-border bg-background px-2.5 sm:px-3 py-2.5 text-[13px] sm:text-sm font-mono text-foreground select-all break-all leading-relaxed" dir="ltr">
 {credentials.username}
 </div>
 <Button
 variant="outline"
 size="icon"
 className="h-10 w-10 sm:h-9 sm:w-9 shrink-0"
 onClick={() => copyToClipboard(credentials.username, "username")}
 aria-label="کپی نام کاربری"
 >
 {copiedField === "username"? (
 <Check className="h-4 w-4 text-success" />
 ): (
 <Copy className="h-4 w-4" />
 )}
 </Button>
 </div>
 </div>

 {/* رمز عبور */}
 <div className="space-y-1.5">
 <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
 <Lock className="h-3.5 w-3.5" />
 رمز عبور
 </label>
 <div className="flex items-center gap-1.5 sm:gap-2">
 <div
 className="flex-1 min-w-0 rounded-md border border-border bg-background px-2.5 sm:px-3 py-2.5 text-[13px] sm:text-sm font-mono text-foreground select-all break-all leading-relaxed"
 dir="ltr"
 >
 {showPassword? credentials.password: "•".repeat(Math.min(credentials.password.length, 14))}
 </div>
 <Button
 variant="outline"
 size="icon"
 className="h-10 w-10 sm:h-9 sm:w-9 shrink-0"
 onClick={() => {
 setShowPassword((s) =>!s);
 setCountdownPaused(true); // تعامل کاربر — توقف شمارش معکوس
 }}
 aria-label={showPassword? "پنهان کردن رمز": "نمایش رمز"}
 >
 {showPassword? (
 <EyeOff className="h-4 w-4" />
 ): (
 <Eye className="h-4 w-4" />
 )}
 </Button>
 <Button
 variant="outline"
 size="icon"
 className="h-10 w-10 sm:h-9 sm:w-9 shrink-0"
 onClick={() => copyToClipboard(credentials.password, "password")}
 aria-label="کپی رمز عبور"
 >
 {copiedField === "password"? (
 <Check className="h-4 w-4 text-success" />
 ): (
 <Copy className="h-4 w-4" />
 )}
 </Button>
 </div>
 </div>

 {/* تاریخ پایان تریال */}
 <div className="space-y-1.5">
 <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
 <CalendarClock className="h-3.5 w-3.5" />
 تاریخ پایان تریال
 </label>
 <div className="rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground tnum">
 {trialEndsJalali}
 <span className="text-xs text-muted-foreground me-2">
 ({toPersianDigits(14)} روز باقی‌مانده)
 </span>
 </div>
 </div>

 {/* هشدار */}
 <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-foreground">
 <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
 <p className="leading-relaxed">
 <span className="font-semibold text-warning">این اطلاعات را ذخیره کنید</span> — برای ورود مجدد به آن نیاز دارید. در صورت گم شدن، بازیابی رمز فقط از طریق پشتیبانی امکان‌پذیر است.
 </p>
 </div>

 {/* نوار شمارش معکوس */}
 <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
 <div
 className="absolute inset-y-0 right-0 bg-primary transition-all duration-1000 ease-linear"
 style={{ width: `${(countdown / 10) * 100}%` }}
 />
 </div>

 {/* دکمه‌های دانلود و کپی */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
 <Button
 variant="outline"
 className="text-xs sm:text-sm"
 onClick={handleCopyAll}
 >
 {copiedField === "all"? (
 <Check className="h-4 w-4 me-2 text-success" />
 ): (
 <Copy className="h-4 w-4 me-2" />
 )}
 کپی اطلاعات
 </Button>
 <Button
 variant="outline"
 className="text-xs sm:text-sm"
 onClick={() => {
 setCountdownPaused(true);
 handleDownloadCredentials();
 }}
 >
 <Download className="h-4 w-4 me-2" />
 دانلود اطلاعات ورود
 </Button>
 </div>

 {/* دکمه‌ی ورود فوری — پررنگ، تمام عرض */}
 <Button
 className="w-full relative"
 size="lg"
 onClick={handleEnterPanelNow}
 >
 <Zap className="h-4 w-4 me-2" />
 <span>ورود فوری به پنل</span>
 {countdown > 0 && (
 <span className="me-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] tnum">
 {toPersianDigits(countdown)}
 </span>
 )}
 <ArrowLeft className="h-4 w-4 me-2" />
 </Button>

 <p className="text-center text-[10px] text-muted-foreground">
 {countdownPaused
 ? "ورود خودکار متوقف شد — وقتی آماده بودید دکمه ورود را بزنید"
 : `ورود خودکار تا ${toPersianDigits(countdown)} ثانیه دیگر`}
 </p>
 </div>
 </DialogContent>
 </Dialog>
 );
}
