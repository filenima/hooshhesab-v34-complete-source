"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Sparkles,
 KeyRound,
 CheckCircle2,
 Loader2,
 AlertCircle,
 ShieldCheck,
 LifeBuoy,
} from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface UpgradeModalProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 token: string;
 onUpgraded: () => void;
}

type Stage = "form" | "loading" | "success" | "error";

/**
 * UpgradeModal — مودال فعال‌سازی کد لایسنس و ارتقا به Premium
 *
 * - ورودی کد لایسنس با فونت مونو، dir=ltr و uppercase خودکار
 * - فراخوانی POST /api/license/activate برای فعال‌سازی
 * - در صورت موفقیت: نمایش وضعیت موفقیت با انیمیشن تیک و بستن پس از ۲s
 * - در صورت خطا: نمایش پیام خطا به رنگ قرمز
 * - لینک «نحوه دریافت لایسنس» برای راهنمایی (mock toast)
 */
export function UpgradeModal({
 open,
 onOpenChange,
 token,
 onUpgraded,
}: UpgradeModalProps) {
 const [licenseKey, setLicenseKey] = React.useState("");
 const [stage, setStage] = React.useState<Stage>("form");
 const [errorMsg, setErrorMsg] = React.useState<string>("");
 const { toast } = useToast();

 // ریست state ها هنگام باز/بسته شدن مودال
 React.useEffect(() => {
 if (open) {
 setStage("form");
 setLicenseKey("");
 setErrorMsg("");
 }
 }, [open]);

 const handleSubmit = async (e?: React.FormEvent) => {
 e?.preventDefault();
 if (!licenseKey.trim()) {
 setErrorMsg("کد لایسنس را وارد کنید.");
 setStage("error");
 return;
 }

 setStage("loading");
 setErrorMsg("");

 try {
 const res = await fetch("/api/license/activate", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ licenseKey: licenseKey.trim() }),
 });
 const data = await res.json();

 if (!res.ok ||!data.success) {
 throw new Error(data.error || "فعال‌سازی ناموفق بود.");
 }

 setStage("success");

 // FIX(v18-لایسنس): اطلاع به app-shell تا پلن جدید واکشی و قفل‌های ماژول باز شوند
 try {
 window.dispatchEvent(new Event("hoshhesab:license-changed"));
 } catch { /* ignore */ }

 // بستن خودکار پس از ۲ ثانیه و callback
 setTimeout(() => {
 onOpenChange(false);
 onUpgraded();
 }, 2000);
 } catch (err) {
 const msg =
 err instanceof Error? err.message: "خطا در ارتباط با سرور.";
 setErrorMsg(msg);
 setStage("error");
 }
 };

 // نرمال‌سازی ورودی: uppercase و فقط کاراکترهای مجاز
 const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
 setLicenseKey(v);
 if (stage === "error") setStage("form");
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
 {/* هدر با گرادیانت و glassmorphism */}
 <DialogHeader className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-indigo-600 via-indigo-600 to-purple-600 text-white overflow-hidden">
 {/* حباب‌های تزئینی */}
 <div
 className="absolute inset-0 opacity-30 pointer-events-none"
 aria-hidden="true"
 >
 <div className="absolute -top-8 -left-8 h-28 w-28 rounded-full bg-white/40 blur-2xl" />
 <div className="absolute -bottom-6 -right-4 h-20 w-20 rounded-full bg-purple-300/40 blur-2xl" />
 </div>

 <div className="relative flex items-center gap-3 mb-2">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
 <ShieldCheck className="h-5 w-5" />
 </div>
 <div>
 <DialogTitle className="text-base font-bold leading-tight">
 ارتقا حساب به Premium
 </DialogTitle>
 <DialogDescription className="text-white/80 text-xs mt-0.5">
 کد لایسنس خود را وارد کنید تا حساب شما فعال شود
 </DialogDescription>
 </div>
 </div>
 </DialogHeader>

 {/* بدنه */}
 <div className="p-6">
 <AnimatePresence mode="wait">
 {stage === "success"? (
 <motion.div
 key="success"
 initial={{ opacity: 0, scale: 0.92 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.92 }}
 className="flex flex-col items-center text-center py-4"
 >
 <motion.div
 initial={{ scale: 0, rotate: -90 }}
 animate={{ scale: 1, rotate: 0 }}
 transition={{ type: "spring", stiffness: 220, damping: 14 }}
 className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-3"
 >
 <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
 </motion.div>
 <h3 className="text-base font-bold text-foreground mb-1">
 حساب شما ارتقا یافت
 </h3>
 <p className="text-xs text-muted-foreground">
 امکانات Premium فعال شد. در حال انتقال...
 </p>
 </motion.div>
 ): (
 <motion.form
 key="form"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onSubmit={handleSubmit}
 className="space-y-4"
 >
 {/* برچسب و فیلد کد لایسنس */}
 <div className="space-y-1.5">
 <label
 htmlFor="license-key-input"
 className="flex items-center gap-1.5 text-xs font-medium text-foreground"
 >
 <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
 کد لایسنس
 </label>
 <Input
 id="license-key-input"
 dir="ltr"
 value={licenseKey}
 onChange={handleKeyChange}
 placeholder="HOSH-XXXXX-XXXXX-XXXXX-XXXXX"
 autoComplete="off"
 spellCheck={false}
 disabled={stage === "loading"}
 className="font-mono text-sm tracking-wider h-11 text-center placeholder:text-muted-foreground/60 placeholder:tracking-normal"
 maxLength={40}
 />
 </div>

 {/* پیام خطا */}
 <AnimatePresence>
 {stage === "error" && errorMsg && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: "auto" }}
 exit={{ opacity: 0, height: 0 }}
 className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2"
 >
 <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
 <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
 {errorMsg}
 </p>
 </motion.div>
 )}
 </AnimatePresence>

 {/* دکمه ثبت */}
 <Button
 type="submit"
 disabled={stage === "loading" ||!licenseKey.trim()}
 className="w-full h-11 gap-2 font-semibold"
 >
 {stage === "loading"? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال فعال‌سازی...
 </>
 ): (
 <>
 <Sparkles className="h-4 w-4" />
 فعال‌سازی و ارتقا
 </>
 )}
 </Button>

 {/* لینک راهنما */}
 <button
 type="button"
 onClick={() =>
 toast({
 title: "دریافت لایسنس",
 description: "با پشتیبانی تماس بگیرید.",
 })
 }
 className="flex items-center justify-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
 >
 <LifeBuoy className="h-3.5 w-3.5" />
 نحوه دریافت لایسنس
 </button>
 </motion.form>
 )}
 </AnimatePresence>
 </div>
 </DialogContent>
 </Dialog>
 );
}
