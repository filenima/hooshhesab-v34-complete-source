"use client";

/**
 * RealtimePresence — آواتارهای کاربران آنلاین در تاپ‌بار
 *
 * در کنار سوییچر شرکت نمایش داده می‌شود و کاربران آنلاین همان tenant را
 * به‌صورت آواتارهای رنگی با tooltip (نام + ماژول) نشان می‌دهد.
 */

import * as React from "react";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRealtime } from "@/hooks/use-realtime";
import { toPersianDigits } from "@/lib/persian";

const MODULE_LABELS: Record<string, string> = {
 dashboard: "داشبورد",
 core: "هسته حسابداری",
 invoices: "خرید و فروش",
 treasury: "خزانه‌داری",
 tax: "مالیات",
 modian: "سامانه مودیان",
 payment: "درگاه پرداخت",
 inventory: "انبار",
 ecommerce: "فروشگاه",
 payroll: "حقوق و دستمزد",
 crm: "CRM",
 ai: "هوش مصنوعی",
 security: "امنیت",
 api: "API",
 manufacturing: "تولیدی",
 contracting: "پیمانکاری",
 marketplace: "بازار اپلیکیشن",
 reminders: "یادآورها",
 loyalty: "باشگاه مشتریان",
 mobile: "اپ موبایل",
 ecosystem: "اکوسیستم",
 "reports-builder": "گزارش‌ساز",
 app: "برنامه",
};

// پالت رنگی پایدار بر اساس userId
const COLOR_PALETTE = [
 "bg-rose-500",
 "bg-emerald-500",
 "bg-amber-500",
 "bg-violet-500",
 "bg-fuchsia-500",
 "bg-cyan-500",
 "bg-orange-500",
 "bg-teal-500",
 "bg-pink-500",
 "bg-lime-600",
];

function colorFor(userId: string): string {
 let hash = 0;
 for (let i = 0; i < userId.length; i++) {
 hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
 }
 return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function initials(name: string): string {
 const parts = name.trim().split(/\s+/).filter(Boolean);
 if (parts.length === 0) return "؟";
 if (parts.length === 1) return parts[0].slice(0, 2);
 return parts[0][0] + parts[1][0];
}

export function RealtimePresence({
 token,
 activeModule,
}: {
 token: string | null;
 activeModule?: string;
}) {
 const { onlineUsers, connected } = useRealtime(token, activeModule);

 if (!token) return null;

 // نهایتاً ۵ آواتار نمایش داده می‌شود و بقیه به‌صورت "+N"
 const visible = onlineUsers.slice(0, 5);
 const hidden = onlineUsers.length - visible.length;

 return (
 <TooltipProvider delayDuration={150}>
 <div className="hidden md:flex items-center gap-1.5">
 {/* شمارنده آنلاین‌ها */}
 <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-1">
 <span
 className={`h-1.5 w-1.5 rounded-full ${
 connected? "bg-emerald-500 animate-pulse": "bg-muted-foreground/40"
 }`}
 aria-hidden="true"
 />
 <Users className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[11px] font-medium text-muted-foreground">
 {toPersianDigits(onlineUsers.length + 1)} نفر آنلاین
 </span>
 </div>

 {/* آواتارها */}
 <div className="flex -space-x-2 -space-x-reverse">
 {visible.map((u) => (
 <Tooltip key={u.userId}>
 <TooltipTrigger asChild>
 <div className="relative">
 <Avatar className="h-7 w-7 ring-2 ring-background">
 <AvatarFallback
 className={`${colorFor(u.userId)} text-white text-[10px] font-bold`}
 >
 {initials(u.name)}
 </AvatarFallback>
 </Avatar>
 <span
 className="absolute -bottom-0.5 -end-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-background"
 aria-hidden="true"
 />
 </div>
 </TooltipTrigger>
 <TooltipContent side="bottom" align="end" className="text-xs">
 <div className="flex flex-col gap-0.5">
 <span className="font-medium">{u.name}</span>
 <span className="text-muted-foreground">
 {u.module? (MODULE_LABELS[u.module]?? u.module): "برنامه"}
 </span>
 </div>
 </TooltipContent>
 </Tooltip>
 ))}

 {hidden > 0 && (
 <Tooltip>
 <TooltipTrigger asChild>
 <Avatar className="h-7 w-7 ring-2 ring-background">
 <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-bold">
 +{toPersianDigits(hidden)}
 </AvatarFallback>
 </Avatar>
 </TooltipTrigger>
 <TooltipContent side="bottom" align="end" className="text-xs">
 <span>{toPersianDigits(hidden)} کاربر دیگر آنلاین</span>
 </TooltipContent>
 </Tooltip>
 )}
 </div>
 </div>
 </TooltipProvider>
 );
}
