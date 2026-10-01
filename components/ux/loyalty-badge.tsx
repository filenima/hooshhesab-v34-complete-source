"use client";

import * as React from "react";
import { Star, Award, Sparkles, TrendingUp } from "lucide-react";
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toPersianDigits } from "@/lib/persian";

// ============ types ============
interface LoyaltyHistoryItem {
 id: string;
 points: number;
 reason: string;
 referenceId: string | null;
 note: string | null;
 createdAt: string;
}

interface LoyaltyBalance {
 userId: string;
 balance: number;
 totalEarned: number;
 totalRedeemed: number;
 historyCount: number;
}

interface LoyaltyResponse {
 success: boolean;
 data: {
 balance: LoyaltyBalance;
 history?: LoyaltyHistoryItem[];
 };
}

// ============ reason meta ============
const REASON_META: Record<
 string,
 { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
 INVOICE_CREATED: { label: "ثبت فاکتور", icon: TrendingUp, color: "text-primary" },
 DAILY_LOGIN: { label: "ورود روزانه", icon: Sparkles, color: "text-emerald-600" },
 REFERRAL: { label: "معرفی دوست", icon: Award, color: "text-amber-600" },
 PROFILE_COMPLETE: { label: "تکمیل پروفایل", icon: Star, color: "text-primary" },
 BONUS: { label: "پاداش", icon: Star, color: "text-emerald-600" },
 REDEEM: { label: "مصرف", icon: Award, color: "text-rose-600" },
 MANUAL: { label: "دستی", icon: Star, color: "text-muted-foreground" },
};

// ============ main badge ============
/**
 * LoyaltyBadge — نشان امتیاز وفاداری در topbar
 *
 * نمایش موجودی امتیاز با آیکن Star.
 * با کلیک، Popover باز می‌شود و تاریخچه اخیر را نشان می‌دهد.
 *
 * @param token توکن کاربر (اختیاری — در صورت نبود، از localStorage خوانده می‌شود)
 */
export function LoyaltyBadge({ token: tokenProp }: { token?: string }) {
 const [balance, setBalance] = React.useState<LoyaltyBalance | null>(null);
 const [history, setHistory] = React.useState<LoyaltyHistoryItem[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [open, setOpen] = React.useState(false);

 // نام‌گذاری تابع برای self-retry قانونی (بدون رفرنس به const خارجی)
 const fetchLoyalty = React.useCallback(async function fetchLoyalty(attempt = 0) {
 const token = tokenProp || localStorage.getItem("hoshhesab_user_token") || "";
 if (!token) {
 setLoading(false);
 return;
 }
 try {
 const res = await fetch("/api/marketing/loyalty?history=1&limit=10", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) {
 setLoading(false);
 return;
 }
 const json: LoyaltyResponse = await res.json();
 setBalance(json.data.balance);
 setHistory(json.data.history || []);
 setLoading(false);
 } catch (err) {
 // FIX: retry هوشمند — اگر سرور موقتاً در حال ری‌استارت/کامپایل بود،
 // بعد از تأخیر تصاعدی دوباره تلاش کن (حداکثر ۲ بار دیگر).
 if (attempt < 2) {
 setTimeout(() => void fetchLoyalty(attempt + 1), 3000 * (attempt + 1));
 return; // loading را نگه دار
 }
 console.error("Loyalty fetch failed:", err);
 setLoading(false);
 }
 }, [tokenProp]);

 React.useEffect(() => {
 fetchLoyalty();
 }, [fetchLoyalty]);

 // وقتی Popover باز شد، دوباره fetch کن
 React.useEffect(() => {
 if (open) fetchLoyalty();
 }, [open, fetchLoyalty]);

 if (loading) {
 return <Skeleton className="h-7 w-16 rounded-full" />;
 }

 if (!balance || balance.historyCount === 0) {
 // اگر هیچ امتیازی ندارنده، نشان نده
 return null;
 }

 return (
 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>
 <button
 className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
 aria-label="امتیاز وفاداری"
 >
 <Star className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />
 <span className="text-xs font-bold text-amber-600 tnum">
 {toPersianDigits(balance.balance)}
 </span>
 </button>
 </PopoverTrigger>
 <PopoverContent className="w-80 p-0" align="end">
 {/* هدر */}
 <div className="px-4 py-3 border-b border-border bg-gradient-to-l from-amber-500/5 to-transparent">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
 <Star className="h-4 w-4 fill-amber-500" />
 </div>
 <div className="flex-1">
 <p className="text-sm font-semibold text-foreground">امتیاز وفاداری</p>
 <p className="text-[10px] text-muted-foreground">باشگاه مشتریان هوش</p>
 </div>
 <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/5">
 {toPersianDigits(balance.balance)} امتیاز
 </Badge>
 </div>
 </div>

 {/* آمار کلی */}
 <div className="grid grid-cols-2 gap-px bg-border border-b border-border">
 <div className="bg-card px-3 py-2">
 <p className="text-[10px] text-muted-foreground">کسب شده</p>
 <p className="text-sm font-bold text-emerald-600 tnum">
 +{toPersianDigits(balance.totalEarned)}
 </p>
 </div>
 <div className="bg-card px-3 py-2">
 <p className="text-[10px] text-muted-foreground">مصرف شده</p>
 <p className="text-sm font-bold text-rose-600 tnum">
 -{toPersianDigits(balance.totalRedeemed)}
 </p>
 </div>
 </div>

 {/* تاریخچه */}
 <div className="p-2">
 <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">
 فعالیت‌های اخیر
 </p>
 {history.length === 0? (
 <div className="py-6 text-center">
 <Star className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1" />
 <p className="text-xs text-muted-foreground">هنوز امتیازی کسب نکرده‌اید.</p>
 </div>
 ): (
 <ScrollArea className="max-h-64">
 <div className="space-y-1">
 {history.map((item) => {
 const meta = REASON_META[item.reason] || REASON_META.MANUAL;
 const Icon = meta.icon;
 const isPositive = item.points > 0;
 return (
 <div
 key={item.id}
 className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30"
 >
 <div className={`flex h-7 w-7 items-center justify-center rounded-md bg-muted ${meta.color}`}>
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium text-foreground truncate">
 {meta.label}
 </p>
 <p className="text-[10px] text-muted-foreground">
 {new Date(item.createdAt).toLocaleDateString("fa-IR")}
 </p>
 </div>
 <span
 className={`text-xs font-bold tnum ${
 isPositive? "text-emerald-600": "text-rose-600"
 }`}
 >
 {isPositive? "+": ""}
 {toPersianDigits(item.points)}
 </span>
 </div>
 );
 })}
 </div>
 </ScrollArea>
 )}
 </div>
 </PopoverContent>
 </Popover>
 );
}

export default LoyaltyBadge;
