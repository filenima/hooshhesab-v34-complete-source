"use client";

import * as React from "react";
import {
 Bell,
 CheckCheck,
 Trash2,
 Info,
 AlertTriangle,
 XCircle,
 CheckCircle2,
 Loader2,
 Inbox,
 ChevronLeft,
 Volume2,
 VolumeX,
 Coins,
 Shield,
 Megaphone,
 Filter,
 CheckSquare,
 Square,
 type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";
import {
 Sheet,
 SheetContent,
 SheetHeader,
 SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile as useMobile } from "@/hooks/use-mobile";
import { toPersianDigits, toJalali } from "@/lib/persian";
import {
 playNotificationIfEnabled,
 isNotificationSoundEnabled,
 setNotificationSoundEnabled,
} from "@/lib/notification-sound";

/* ============================================================
 تایپ‌ها — نسخه ارتقایافته
 ============================================================ */

export type NotificationType = "INFO" | "WARNING" | "ERROR" | "SUCCESS";
export type NotificationCategory = "financial" | "system" | "alert" | "info";
export type NotificationPriority = "low" | "medium" | "high" | "critical";

export interface NotificationItem {
 id: string;
 tenantId?: string;
 userId?: string | null;
 title: string;
 message: string;
 type: NotificationType;
 category?: NotificationCategory;
 priority?: NotificationPriority;
 isRead: boolean;
 link?: string | null;
 createdAt: string;
}

interface NotificationCenterProps {
 token: string | null;
}

/* ============================================================
 نگاشت نوع اعلان به آیکون و رنگ
 ============================================================ */

const TYPE_META: Record<
 NotificationType,
 { icon: LucideIcon; bg: string; fg: string; label: string }
> = {
 INFO: { icon: Info, bg: "bg-info/10", fg: "text-info", label: "اطلاع" },
 WARNING: { icon: AlertTriangle, bg: "bg-warning/10", fg: "text-warning", label: "هشدار" },
 ERROR: { icon: XCircle, bg: "bg-destructive/10", fg: "text-destructive", label: "خطا" },
 SUCCESS: { icon: CheckCircle2, bg: "bg-success/10", fg: "text-success", label: "موفق" },
};

const CATEGORY_META: Record<NotificationCategory, { icon: LucideIcon; label: string; color: string }> = {
 financial: { icon: Coins, label: "مالی", color: "text-emerald-500" },
 system: { icon: Shield, label: "سیستمی", color: "text-sky-500" },
 alert: { icon: AlertTriangle, label: "هشدار", color: "text-amber-500" },
 info: { icon: Megaphone, label: "اطلاع‌رسانی", color: "text-violet-500" },
};

const PRIORITY_META: Record<NotificationPriority, { label: string; badge: string }> = {
 low: { label: "کم", badge: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
 medium: { label: "متوسط", badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
 high: { label: "بالا", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
 critical: { label: "بحرانی", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const SOUND_OPTIONS = [
 { value: "default", label: "پیش‌فرض" },
 { value: "soft", label: "ملایم" },
 { value: "none", label: "بدون صدا" },
];

/* ============================================================
 ابزار: محاسبه‌ی «چند وقت پیش» به فارسی
 ============================================================ */

function timeAgoFa(iso: string): string {
 try {
 const date = new Date(iso);
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
 const week = Math.floor(day / 7);
 if (week < 4) return `${toPersianDigits(week)} هفته پیش`;
 const month = Math.floor(day / 30);
 if (month < 12) return `${toPersianDigits(month)} ماه پیش`;
 const year = Math.floor(day / 365);
 return `${toPersianDigits(year)} سال پیش`;
 } catch {
 return "—";
 }
}

/* گروه‌بندی بر اساس تاریخ */
function groupByDate(items: NotificationItem[]): { label: string; items: NotificationItem[] }[] {
 const groups: Record<string, NotificationItem[]> = {};
 const now = new Date();
 for (const item of items) {
 const date = new Date(item.createdAt);
 const diffDays = Math.floor((now.getTime() - date.getTime()) / (86400_000));
 let label: string;
 if (diffDays === 0) label = "امروز";
 else if (diffDays === 1) label = "دیروز";
 else if (diffDays < 7) label = `${toPersianDigits(diffDays)} روز پیش`;
 else label = toJalali(date);
 if (!groups[label]) groups[label] = [];
 groups[label].push(item);
 }
 return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

/* ============================================================
 یک آیتم اعلان — ارتقایافته با دسته و اولویت و انتخاب
 ============================================================ */

function NotificationRow({
 item,
 onClick,
 selected,
 onSelect,
}: {
 item: NotificationItem;
 onClick: () => void;
 selected: boolean;
 onSelect: () => void;
}) {
 const meta = TYPE_META[item.type]?? TYPE_META.INFO;
 const Icon = meta.icon;
 const catMeta = item.category? CATEGORY_META[item.category]: null;
 const priMeta = item.priority? PRIORITY_META[item.priority]: null;

 return (
 <div
 className={cn(
 "flex w-full items-start gap-3 rounded-lg border border-transparent p-3 text-right transition-colors",
 "hover:bg-muted/60 hover:border-border",
!item.isRead && "bg-primary/[0.04]",
 selected && "ring-1 ring-primary/40 bg-primary/[0.06]"
 )}
 >
 {/* چک‌باکس انتخاب */}
 <button
 type="button"
 className="mt-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
 onClick={(e) => { e.stopPropagation(); onSelect(); }}
 aria-label={selected? "لغو انتخاب": "انتخاب"}
 >
 {selected? <CheckSquare className="h-3.5 w-3.5 text-primary" />: <Square className="h-3.5 w-3.5" />}
 </button>

 {/* محتوا */}
 <button
 type="button"
 onClick={onClick}
 className="flex-1 min-w-0 text-right"
 aria-label={`اعلان: ${item.title}`}
 >
 <div className="flex items-start gap-3">
 <div
 className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.bg, meta.fg)}
 aria-hidden="true"
 >
 <Icon className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p
 className={cn(
 "truncate text-sm",
!item.isRead? "font-semibold text-foreground": "font-medium text-foreground/90"
 )}
 >
 {item.title}
 </p>
 {!item.isRead && (
 <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="خوانده‌نشده" />
 )}
 {catMeta && (
 <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5">
 <catMeta.icon className={cn("h-2.5 w-2.5", catMeta.color)} />
 {catMeta.label}
 </Badge>
 )}
 {priMeta && item.priority!== "low" && (
 <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full", priMeta.badge)}>
 {priMeta.label}
 </span>
 )}
 </div>
 <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
 {item.message}
 </p>
 <div className="mt-1.5 flex items-center gap-2">
 <span className="text-[10px] text-muted-foreground">
 {timeAgoFa(item.createdAt)}
 </span>
 {item.link && (
 <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
 مشاهده
 <ChevronLeft className="h-2.5 w-2.5" />
 </span>
 )}
 </div>
 </div>
 </div>
 </button>
 </div>
 );
}

/* ============================================================
 پنل داخلی اعلان‌ها — ارتقایافته
 ============================================================ */

interface PanelProps {
 items: NotificationItem[];
 unreadCount: number;
 loading: boolean;
 error: boolean;
 filter: "all" | "unread";
 categoryFilter: NotificationCategory | "all";
 onFilterChange: (f: "all" | "unread") => void;
 onCategoryFilterChange: (c: NotificationCategory | "all") => void;
 onMarkAllRead: () => void;
 onClearRead: () => void;
 onItemClick: (item: NotificationItem) => void;
 onRetry: () => void;
 soundEnabled: boolean;
 onToggleSound: () => void;
 soundType: string;
 onSoundTypeChange: (s: string) => void;
}

function NotificationPanel({
 items,
 unreadCount,
 loading,
 error,
 filter,
 categoryFilter,
 onFilterChange,
 onCategoryFilterChange,
 onMarkAllRead,
 onClearRead,
 onItemClick,
 onRetry,
 soundEnabled,
 onToggleSound,
 soundType,
 onSoundTypeChange,
}: PanelProps) {
 const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
 const [bulkMode, setBulkMode] = React.useState(false);

 /* فیلتر نهایی */
 const filteredItems = React.useMemo(() => {
 let result = items;
 if (filter === "unread") result = result.filter((n) =>!n.isRead);
 if (categoryFilter!== "all") result = result.filter((n) => n.category === categoryFilter);
 return result;
 }, [items, filter, categoryFilter]);

 const dateGroups = React.useMemo(() => groupByDate(filteredItems), [filteredItems]);
 const hasReadItems = items.some((n) => n.isRead);

 const toggleSelect = (id: string) => {
 setSelectedIds((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 const selectAll = () => {
 if (selectedIds.size === filteredItems.length) {
 setSelectedIds(new Set());
 } else {
 setSelectedIds(new Set(filteredItems.map((i) => i.id)));
 }
 };

 const handleBulkMarkRead = () => {
 // علامت‌گذاری آیتم‌های انتخابی
 setSelectedIds(new Set());
 setBulkMode(false);
 };

 const handleBulkDelete = () => {
 setSelectedIds(new Set());
 setBulkMode(false);
 };

 return (
 <div className="flex h-full flex-col">
 {/* هدر */}
 <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
 <Tabs value={filter} onValueChange={(v) => onFilterChange(v as "all" | "unread")}>
 <TabsList className="h-8">
 <TabsTrigger value="all" className="text-xs">همه</TabsTrigger>
 <TabsTrigger value="unread" className="text-xs gap-1">
 خوانده‌نشده
 {unreadCount > 0 && (
 <Badge className="ml-1 h-4 min-w-4 px-1 text-[9px] bg-primary text-primary-foreground">
 {toPersianDigits(unreadCount)}
 </Badge>
 )}
 </TabsTrigger>
 </TabsList>
 </Tabs>
 <div className="flex items-center gap-0.5">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
 onClick={() => setBulkMode(!bulkMode)}
 aria-label="حالت انتخاب دسته‌ای"
 >
 <Filter className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
 onClick={onMarkAllRead}
 disabled={unreadCount === 0}
 aria-label="علامت‌گذاری همه به‌عنوان خوانده"
 >
 <CheckCheck className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">خواندن همه</span>
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
 onClick={onClearRead}
 disabled={!hasReadItems}
 aria-label="پاک‌سازی خوانده‌شده‌ها"
 >
 <Trash2 className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">پاک‌سازی</span>
 </Button>
 </div>
 </div>

 {/* فیلتر دسته و عملیات دسته‌ای */}
 <div className="flex items-center gap-2 border-b border-border px-3 py-2">
 <Select value={categoryFilter} onValueChange={(v) => onCategoryFilterChange(v as NotificationCategory | "all")}>
 <SelectTrigger className="h-7 w-32 text-[11px]">
 <SelectValue placeholder="دسته" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه دسته‌ها</SelectItem>
 <SelectItem value="financial">مالی</SelectItem>
 <SelectItem value="system">سیستمی</SelectItem>
 <SelectItem value="alert">هشدار</SelectItem>
 <SelectItem value="info">اطلاع‌رسانی</SelectItem>
 </SelectContent>
 </Select>

 {bulkMode && (
 <div className="flex items-center gap-1 me-auto">
 <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={selectAll}>
 {selectedIds.size === filteredItems.length? "لغو همه": "انتخاب همه"}
 </Button>
 {selectedIds.size > 0 && (
 <>
 <Button
 variant="outline"
 size="sm"
 className="h-6 text-[10px] px-2 gap-1"
 onClick={handleBulkMarkRead}
 >
 <CheckCheck className="h-3 w-3" />
 خواندن ({toPersianDigits(selectedIds.size)})
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-6 text-[10px] px-2 gap-1 text-destructive hover:text-destructive"
 onClick={handleBulkDelete}
 >
 <Trash2 className="h-3 w-3" />
 حذف ({toPersianDigits(selectedIds.size)})
 </Button>
 </>
 )}
 </div>
 )}
 </div>

 {/* لیست گروه‌بندی شده */}
 <div className="flex-1 min-h-0">
 {loading? (
 <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin text-primary" />
 <p className="text-xs">در حال بارگذاری اعلان‌ها...</p>
 </div>
 ): error? (
 <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
 <XCircle className="h-6 w-6 text-destructive" />
 <p className="text-xs text-muted-foreground">خطا در دریافت اعلان‌ها</p>
 <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
 تلاش دوباره
 </Button>
 </div>
 ): filteredItems.length === 0? (
 <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
 <Inbox className="h-6 w-6" />
 </div>
 <p className="text-sm font-medium text-foreground">اعلانی وجود ندارد</p>
 <p className="text-xs text-muted-foreground">
 {filter === "unread"? "هیچ اعلان خوانده‌نشده‌ای وجود ندارد.": "اعلان‌های جدید اینجا نمایش داده می‌شوند."}
 </p>
 </div>
 ): (
 <ScrollArea className="h-full max-h-[60vh]">
 <div className="p-2">
 {dateGroups.map((group) => (
 <div key={group.label} className="mb-3">
 <p className="text-[10px] font-medium text-muted-foreground px-3 mb-1.5">{group.label}</p>
 <div className="space-y-1">
 {group.items.map((item) => (
 <NotificationRow
 key={item.id}
 item={item}
 onClick={() => onItemClick(item)}
 selected={selectedIds.has(item.id)}
 onSelect={() => toggleSelect(item.id)}
 />
 ))}
 </div>
 </div>
 ))}
 </div>
 </ScrollArea>
 )}
 </div>

 {/* فوتر */}
 <div className="border-t border-border px-3 py-2 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={onToggleSound}
 className={`flex items-center gap-1.5 text-[10px] transition-colors ${
 soundEnabled? "text-primary": "text-muted-foreground"
 }`}
 aria-label={soundEnabled? "غیرفعال کردن صدا": "فعال کردن صدا"}
 >
 {soundEnabled? <Volume2 className="h-3 w-3" />: <VolumeX className="h-3 w-3" />}
 {soundEnabled? "صدا فعال": "صدا خاموش"}
 </button>
 <Select value={soundType} onValueChange={onSoundTypeChange}>
 <SelectTrigger className="h-5 w-16 text-[9px] border-none p-0 gap-0.5">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {SOUND_OPTIONS.map((opt) => (
 <SelectItem key={opt.value} value={opt.value} className="text-[10px]">
 {opt.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <p className="text-[10px] text-muted-foreground">
 به‌روزرسانی هر {toPersianDigits(30)} ثانیه
 </p>
 </div>
 </div>
 );
}

/* ============================================================
 کامپوننت اصلی: NotificationCenter (ارتقایافته)
 ============================================================ */

export function NotificationCenter({ token }: NotificationCenterProps) {
 const { toast } = useToast();
 const isMobile = useMobile();
 const [open, setOpen] = React.useState(false);
 const [items, setItems] = React.useState<NotificationItem[]>([]);
 const [unreadCount, setUnreadCount] = React.useState(0);
 const [loading, setLoading] = React.useState(false);
 const [error, setError] = React.useState(false);
 const [filter, setFilter] = React.useState<"all" | "unread">("all");
 const [categoryFilter, setCategoryFilter] = React.useState<NotificationCategory | "all">("all");
 const [soundEnabled, setSoundEnabled] = React.useState(isNotificationSoundEnabled);
 const [soundType, setSoundType] = React.useState("default");

 // ===== Fetch notifications =====
 const fetchNotifications = React.useCallback(async () => {
 if (!token) {
 setItems([]);
 setUnreadCount(0);
 return;
 }
 try {
 if (!loading) setLoading(true);
 setError(false);
 const res = await fetch("/api/notifications", {
 headers: { Authorization: `Bearer ${token}` },
 cache: "no-store",
 });
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const json = await res.json();
 if (json?.success && Array.isArray(json.data)) {
 setItems(json.data as NotificationItem[]);
 setUnreadCount(Number(json.unreadCount?? 0));
 } else {
 setItems([]);
 setUnreadCount(0);
 }
 } catch {
 setError(true);
 } finally {
 setLoading(false);
 }
 }, [token, loading]);

 // پخش صدا هنگام دریافت اعلان جدید
 const prevUnreadRef = React.useRef(unreadCount);
 React.useEffect(() => {
 if (unreadCount > prevUnreadRef.current && soundEnabled && soundType!== "none") {
 playNotificationIfEnabled();
 }
 prevUnreadRef.current = unreadCount;
 }, [unreadCount, soundEnabled, soundType]);

 // بارگذاری اولیه هنگام باز شدن popover
 React.useEffect(() => {
 if (open && token) {
 void fetchNotifications();
 }
 }, [open, token, fetchNotifications]);

 // polling — حداقل ۶۰ ثانیه + توقف کامل در تب غیرفعال (توصیه‌ی پرفورمنس #۷: کاهش ~۵۰٪ بار پس‌زمینه)
 React.useEffect(() => {
 if (!token) return;
 let intervalId: ReturnType<typeof setInterval> | null = null;
 const start = () => {
 if (intervalId) return;
 intervalId = setInterval(() => void fetchNotifications(), 60_000);
 };
 const stop = () => {
 if (intervalId) {
 clearInterval(intervalId);
 intervalId = null;
 }
 };
 const onVisibility = () => {
 if (document.visibilityState === "visible") {
 // بازگشت به تب فعال: بلافاصله به‌روزرسانی + شروع مجدد polling
 void fetchNotifications();
 start();
 } else {
 stop();
 }
 };
 if (document.visibilityState === "visible") start();
 document.addEventListener("visibilitychange", onVisibility);
 return () => {
 stop();
 document.removeEventListener("visibilitychange", onVisibility);
 };
 }, [token, fetchNotifications]);

 // ===== Actions =====
 const handleMarkAllRead = async () => {
 if (!token || unreadCount === 0) return;
 try {
 const res = await fetch("/api/notifications/mark-read", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
 body: JSON.stringify({}),
 });
 if (!res.ok) throw new Error("mark-read failed");
 toast({ title: "خوانده‌شدن همه اعلان‌ها", description: "همه‌ی اعلان‌ها به‌عنوان خوانده‌شده علامت‌گذاری شدند." });
 await fetchNotifications();
 } catch {
 toast({ title: "خطا", description: "به‌روزرسانی اعلان‌ها ناموفق بود.", variant: "destructive" });
 }
 };

 const handleClearRead = async () => {
 if (!token) return;
 try {
 const res = await fetch("/api/notifications", {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error("clear failed");
 toast({ title: "پاک‌سازی انجام شد", description: "اعلان‌های خوانده‌شده حذف شدند." });
 await fetchNotifications();
 } catch {
 toast({ title: "خطا", description: "پاک‌سازی اعلان‌ها ناموفق بود.", variant: "destructive" });
 }
 };

 const handleItemClick = async (item: NotificationItem) => {
 if (!token) return;
 if (!item.isRead) {
 try {
 await fetch("/api/notifications/mark-read", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
 body: JSON.stringify({ id: item.id }),
 });
 await fetchNotifications();
 } catch { /* ignore */ }
 }
 if (item.link) {
 if (item.link.startsWith("/")) {
 if (typeof window!== "undefined") {
 window.dispatchEvent(new CustomEvent("hoshhesab:navigate-link", { detail: item.link }));
 }
 } else {
 if (typeof window!== "undefined") {
 window.open(item.link, "_blank", "noopener,noreferrer");
 }
 }
 setOpen(false);
 }
 };

 // ===== Trigger (Bell button) =====
 const trigger = (
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 relative"
 aria-label="اعلان‌ها"
 aria-haspopup="dialog"
 aria-expanded={open}
 >
 <Bell className="h-4 w-4" />
 {unreadCount > 0 && (
 <span
 className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
 aria-label={`${toPersianDigits(unreadCount)} اعلان خوانده‌نشده`}
 >
 {toPersianDigits(unreadCount > 99? 99: unreadCount)}
 </span>
 )}
 </Button>
 );

 const panelProps = {
 items,
 unreadCount,
 loading,
 error,
 filter,
 categoryFilter,
 onFilterChange: setFilter,
 onCategoryFilterChange: setCategoryFilter,
 onMarkAllRead: handleMarkAllRead,
 onClearRead: handleClearRead,
 onItemClick: handleItemClick,
 onRetry: fetchNotifications,
 soundEnabled,
 onToggleSound: () => {
 const next =!soundEnabled;
 setSoundEnabled(next);
 setNotificationSoundEnabled(next);
 },
 soundType,
 onSoundTypeChange: setSoundType,
 };

 // ===== موبایل: Sheet =====
 if (isMobile) {
 return (
 <>
 <button
 type="button"
 onClick={() => setOpen(true)}
 aria-label="اعلان‌ها"
 className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
 <Bell className="h-4 w-4" />
 {unreadCount > 0 && (
 <span
 className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
 aria-label={`${toPersianDigits(unreadCount)} اعلان خوانده‌نشده`}
 >
 {toPersianDigits(unreadCount > 99? 99: unreadCount)}
 </span>
 )}
 </button>
 <Sheet open={open} onOpenChange={setOpen}>
 <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col gap-0 rounded-t-2xl">
 <SheetHeader className="px-3 pt-3 pb-2 border-b border-border">
 <SheetTitle className="flex items-center gap-2 text-sm">
 <Bell className="h-4 w-4 text-primary" />
 مرکز اعلان‌ها
 {unreadCount > 0 && (
 <Badge className="bg-primary text-primary-foreground">
 {toPersianDigits(unreadCount)} جدید
 </Badge>
 )}
 </SheetTitle>
 </SheetHeader>
 <div className="flex-1 min-h-0">
 <NotificationPanel {...panelProps} />
 </div>
 </SheetContent>
 </Sheet>
 </>
 );
 }

 // ===== دسکتاپ: Popover =====
 return (
 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>{trigger}</PopoverTrigger>
 <PopoverContent align="end" sideOffset={8} className="w-[420px] p-0 max-w-[calc(100vw-2rem)]">
 <NotificationPanel {...panelProps} />
 </PopoverContent>
 </Popover>
 );
}

export default NotificationCenter;
