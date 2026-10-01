"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Lock, Sparkles, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toPersianDigits, toJalali } from "@/lib/persian";

interface LicenseLockScreenProps {
 licenseInfo: {
 plan: string;
 endDate: string | null;
 status: string;
 } | null;
 onRenew: () => void;
 onLogout: () => void;
}

export function LicenseLockScreen({
 licenseInfo,
 onRenew,
 onLogout,
}: LicenseLockScreenProps) {
 const endDate = licenseInfo?.endDate? toJalali(new Date(licenseInfo.endDate)): null;

 return (
 <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
 <div className="absolute inset-0 grid-pattern opacity-30" aria-hidden="true" />
 <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-primary/10 blur-3xl orb-float" />
 <div className="absolute bottom-1/4 left-1/4 h-48 w-48 rounded-full bg-primary/5 blur-3xl orb-float" style={{ animationDelay: "7s" }} />

 <motion.div
 initial={{ opacity: 0, scale: 0.9, y: 20 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
 className="relative w-full max-w-md"
 >
 <Card className="overflow-hidden border-border/60 shadow-2xl">
 {/* هدر */}
 <div className="relative bg-gradient-to-br from-primary via-primary to-primary/80 px-6 py-10 text-center text-primary-foreground">
 <div className="absolute inset-0 opacity-20" aria-hidden="true">
 <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-white/30 blur-3xl" />
 </div>
 <motion.div
 initial={{ scale: 0, rotate: -180 }}
 animate={{ scale: 1, rotate: 0 }}
 transition={{ type: "spring", delay: 0.2 }}
 className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md"
 >
 <Lock className="h-8 w-8" />
 </motion.div>
 <motion.h1
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.3 }}
 className="relative text-2xl font-bold"
 >
 دسترسی شما محدود شده است
 </motion.h1>
 <motion.p
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.4 }}
 className="relative mt-2 text-sm text-primary-foreground/80"
 >
 لایسنس یا دوره تریال شما به پایان رسیده است
 </motion.p>
 </div>

 {/* بدنه */}
 <div className="p-6 space-y-5">
 {/* اطلاعات لایسنس */}
 {licenseInfo && (
 <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">پلن:</span>
 <span className="font-medium">
 {licenseInfo.plan === "free"? "رایگان":
 licenseInfo.plan === "starter"? "رایگان":
 licenseInfo.plan === "basic"? "پایه":
 licenseInfo.plan === "business"? "حرفه‌ای":
 licenseInfo.plan === "pro"? "حرفه‌ای":
 licenseInfo.plan === "enterprise"? "سازمانی":
 licenseInfo.plan === "accountant"? "حسابداران":
 licenseInfo.plan}
 </span>
 </div>
 {endDate && (
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">تاریخ انقضا:</span>
 <span className="font-medium tnum">{endDate}</span>
 </div>
 )}
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">وضعیت:</span>
 <span className="font-medium text-destructive">
 {licenseInfo.status === "EXPIRED"? "منقضی شده":
 licenseInfo.status === "SUSPENDED"? "تعلیق شده":
 licenseInfo.status === "REVOKED"? "ابطال شده":
 licenseInfo.status}
 </span>
 </div>
 </div>
 )}

 <p className="text-sm text-muted-foreground text-center leading-relaxed">
 برای ادامه استفاده از هوش، لایسنس خود را تمدید کنید یا به پلن بالاتر ارتقا دهید. داده‌های شما به‌صورت امن نگهداری می‌شود.
 </p>

 {/* دکمه‌ها */}
 <div className="space-y-2">
 <Button
 className="w-full"
 onClick={onRenew}
 style={{ animation: "pulse-shadow 2s infinite" }}
 >
 <Sparkles className="h-4 w-4 me-2" />
 تمدید لایسنس
 </Button>
 <Button
 variant="outline"
 className="w-full"
 onClick={onLogout}
 >
 <ArrowLeft className="h-4 w-4 me-2" />
 بازگشت به صفحه اصلی
 </Button>
 </div>

 <p className="text-center text-xs text-muted-foreground">
 برای تمدید با پشتیبانی تماس بگیرید
 </p>
 </div>
 </Card>
 </motion.div>
 </div>
 );
}
