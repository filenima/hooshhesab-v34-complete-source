"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 ShoppingCart,
 Package,
 Users,
 Banknote,
 Receipt,
 FileCheck,
 AlertTriangle,
 Settings,
 TrendingUp,
 TrendingDown,
 Clock,
 ChevronDown,
 ChevronUp,
 Filter,
 Activity,
 type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toPersianDigits, toJalali } from "@/lib/persian";

/* ============================================================
 تایپ‌ها
 ============================================================ */

type ActivityType =
 | "invoice_created"
 | "invoice_paid"
 | "product_added"
 | "product_updated"
 | "customer_added"
 | "payment_received"
 | "payment_sent"
 | "report_generated"
 | "tax_filed"
 | "alert_triggered"
 | "settings_changed"
 | "system_update";

interface ActivityEntry {
 id: string;
 type: ActivityType;
 title: string;
 description: string;
 timestamp: Date;
 user?: string;
 amount?: number;
}

/* ============================================================
 ثابت‌ها
 ============================================================ */

const ACTIVITY_META: Record<ActivityType, { icon: LucideIcon; color: string; label: string }> = {
 invoice_created: { icon: ShoppingCart, color: "text-indigo-500", label: "فاکتور" },
 invoice_paid: { icon: FileCheck, color: "text-emerald-500", label: "فاکتور" },
 product_added: { icon: Package, color: "text-sky-500", label: "محصول" },
 product_updated: { icon: Package, color: "text-sky-400", label: "محصول" },
 customer_added: { icon: Users, color: "text-amber-500", label: "مشتری" },
 payment_received: { icon: Banknote, color: "text-emerald-500", label: "پرداخت" },
 payment_sent: { icon: Banknote, color: "text-rose-500", label: "پرداخت" },
 report_generated: { icon: Receipt, color: "text-violet-500", label: "گزارش" },
 tax_filed: { icon: FileCheck, color: "text-teal-500", label: "مالیات" },
 alert_triggered: { icon: AlertTriangle, color: "text-amber-500", label: "هشدار" },
 settings_changed: { icon: Settings, color: "text-muted-foreground", label: "تنظیمات" },
 system_update: { icon: TrendingUp, color: "text-primary", label: "سیستم" },
};

/* نمونه داده‌های فعالیت */
const generateSampleActivities = (): ActivityEntry[] => {
 const now = Date.now();
 return [
 { id: "1", type: "invoice_created", title: "فاکتور جدید ثبت شد", description: "فاکتور شماره ۱۴۰۳-۱۲۵۶ برای شرکت آسمان", timestamp: new Date(now - 2 * 60_000), user: "علی محمدی", amount: 25_000_000 },
 { id: "2", type: "payment_received", title: "پرداخت دریافت شد", description: "مبلغ ۱۵,۰۰۰,۰۰۰ تومان از مشتری رادین", timestamp: new Date(now - 15 * 60_000), user: "سارا احمدی", amount: 15_000_000 },
 { id: "3", type: "product_added", title: "محصول جدید اضافه شد", description: "لپ‌تاپ مدل XPS 15 به انبار اضافه شد", timestamp: new Date(now - 45 * 60_000), user: "رضا کریمی" },
 { id: "4", type: "customer_added", title: "مشتری جدید ثبت شد", description: "شرکت فناوری نوآوران پارس", timestamp: new Date(now - 2 * 3600_000), user: "مریم حسینی" },
 { id: "5", type: "invoice_paid", title: "فاکتور تسویه شد", description: "فاکتور شماره ۱۴۰۳-۱۲۳۰ تسویه کامل", timestamp: new Date(now - 3 * 3600_000), amount: 8_500_000 },
 { id: "6", type: "alert_triggered", title: "هشدار سررسید", description: "فاکتور شماره ۱۴۰۳-۱۱۹۸ سررسید گذشته", timestamp: new Date(now - 5 * 3600_000) },
 { id: "7", type: "report_generated", title: "گزارش فروش تولید شد", description: "گزارش فروش ماهانه آبان ۱۴۰۳", timestamp: new Date(now - 6 * 3600_000), user: "علی محمدی" },
 { id: "8", type: "product_updated", title: "قیمت محصول تغییر کرد", description: "قیمت موس کروم از ۴۵۰,۰۰۰ به ۵۲۰,۰۰۰ تومان", timestamp: new Date(now - 8 * 3600_000) },
 { id: "9", type: "tax_filed", title: "اظهارنامه ارسال شد", description: "اظهارنامه مالیاتی سه‌ماهه دوم ۱۴۰۳", timestamp: new Date(now - 24 * 3600_000), user: "سارا احمدی" },
 { id: "10", type: "payment_sent", title: "پرداخت انجام شد", description: "پرداخت به تأمین‌کننده پارس الکترونیک", timestamp: new Date(now - 28 * 3600_000), amount: 42_000_000 },
 { id: "11", type: "settings_changed", title: "تنظیمات تغییر کرد", description: "نرخ مالیات VAT از ۹٪ به ۱۰٪ تغییر کرد", timestamp: new Date(now - 48 * 3600_000), user: "مدیر سیستم" },
 { id: "12", type: "system_update", title: "بروزرسانی سیستم", description: "نسخه ۲.۵.۱ با رفع اشکالات منتشر شد", timestamp: new Date(now - 72 * 3600_000) },
 ];
};

/* ============================================================
 ابزار: زمان نسبی فارسی
 ============================================================ */

function timeAgoFa(date: Date): string {
 const diff = Date.now() - date.getTime();
 if (diff < 0) return "اکنون";
 const sec = Math.floor(diff / 1000);
 if (sec < 60) return "اکنون";
 const min = Math.floor(sec / 60);
 if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
 const hr = Math.floor(min / 60);
 if (hr < 24) return `${toPersianDigits(hr)} ساعت پیش`;
 const day = Math.floor(hr / 24);
 if (day < 7) return `${toPersianDigits(day)} روز پیش`;
 // برای بیشتر از ۷ روز، تاریخ شمسی
 return toJalali(date);
}

/* ============================================================
 کامپوننت اصلی: ActivityFeed
 ============================================================ */

export function ActivityFeed({ className }: { className?: string }) {
 const [activities] = React.useState<ActivityEntry[]>(generateSampleActivities);
 const [visibleCount, setVisibleCount] = React.useState(5);
 const [filter, setFilter] = React.useState<ActivityType | "all">("all");
 const [collapsed, setCollapsed] = React.useState(false);

 const filteredActivities = React.useMemo(() => {
 if (filter === "all") return activities;
 return activities.filter((a) => a.type === filter);
 }, [activities, filter]);

 const visibleActivities = filteredActivities.slice(0, visibleCount);
 const hasMore = visibleCount < filteredActivities.length;

 /* انواع فعالیت‌های موجود برای فیلتر */
 const availableTypes = React.useMemo(() => {
 const types = new Set(activities.map((a) => a.type));
 return Array.from(types);
 }, [activities]);

 return (
 <Card className={cn("w-full", className)} dir="rtl">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-sm flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 فعالیت‌های اخیر
 </CardTitle>
 <div className="flex items-center gap-1">
 {/* فیلتر */}
 <div className="flex items-center gap-1">
 <Button
 variant={filter === "all"? "secondary": "ghost"}
 size="sm"
 className="h-6 text-[10px] px-2"
 onClick={() => setFilter("all")}
 >
 همه
 </Button>
 {availableTypes.slice(0, 4).map((type) => {
 const meta = ACTIVITY_META[type];
 return (
 <Button
 key={type}
 variant={filter === type? "secondary": "ghost"}
 size="sm"
 className="h-6 text-[10px] px-2"
 onClick={() => setFilter(type)}
 >
 {meta.label}
 </Button>
 );
 })}
 </div>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => setCollapsed(!collapsed)}
 aria-label={collapsed? "باز کردن": "جمع کردن"}
 >
 {collapsed? <ChevronDown className="h-3.5 w-3.5" />: <ChevronUp className="h-3.5 w-3.5" />}
 </Button>
 </div>
 </div>
 </CardHeader>

 <AnimatePresence>
 {!collapsed && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: "auto", opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 transition={{ duration: 0.2 }}
 >
 <CardContent className="pt-0">
 <ScrollArea className="max-h-80">
 <div className="space-y-2">
 {visibleActivities.map((activity) => {
 const meta = ACTIVITY_META[activity.type];
 const Icon = meta.icon;
 return (
 <motion.div
 key={activity.id}
 initial={{ opacity: 0, x: 10 }}
 animate={{ opacity: 1, x: 0 }}
 className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
 >
 {/* آیکون */}
 <div className={cn("mt-0.5 shrink-0", meta.color)}>
 <Icon className="h-4 w-4" />
 </div>

 {/* محتوا */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <p className="text-xs font-medium text-foreground truncate">
 {activity.title}
 </p>
 {activity.amount!== undefined && (
 <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">
 {toPersianDigits((activity.amount / 10_000).toFixed(0))} هزار تومان
 </Badge>
 )}
 </div>
 <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
 {activity.description}
 </p>
 <div className="flex items-center gap-2 mt-1">
 <span className="text-[10px] text-muted-foreground flex items-center gap-1">
 <Clock className="h-2.5 w-2.5" />
 {timeAgoFa(activity.timestamp)}
 </span>
 {activity.user && (
 <span className="text-[10px] text-muted-foreground">
 • {activity.user}
 </span>
 )}
 </div>
 </div>
 </motion.div>
 );
 })}
 </div>
 </ScrollArea>

 {hasMore && (
 <Button
 variant="ghost"
 size="sm"
 className="w-full mt-2 text-xs text-muted-foreground"
 onClick={() => setVisibleCount((c) => c + 5)}
 >
 نمایش بیشتر
 <ChevronDown className="h-3 w-3 mr-1" />
 </Button>
 )}

 {filteredActivities.length === 0 && (
 <div className="py-8 text-center">
 <Activity className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
 <p className="text-xs text-muted-foreground">فعالیتی یافت نشد</p>
 </div>
 )}
 </CardContent>
 </motion.div>
 )}
 </AnimatePresence>
 </Card>
 );
}
