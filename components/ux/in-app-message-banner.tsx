"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Info,
 AlertTriangle,
 Sparkles,
 Megaphone,
 X,
 ArrowLeft,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ============ types ============
interface InAppMessage {
 id: string;
 title: string;
 body: string;
 type: string;
 targetRole: string | null;
 targetSegment: string | null;
 actionLabel: string | null;
 actionUrl: string | null;
 dismissible: boolean;
 isActive: boolean;
 startsAt: string | null;
 endsAt: string | null;
 createdAt: string;
}

interface MessagesResponse {
 success: boolean;
 data: InAppMessage[];
}

// ============ type meta ============
const TYPE_META: Record<
 string,
 {
 label: string;
 icon: React.ComponentType<{ className?: string }>;
 color: string;
 bg: string;
 border: string;
 }
> = {
 INFO: {
 label: "اطلاعیه",
 icon: Info,
 color: "text-primary",
 bg: "bg-primary/5",
 border: "border-primary/30",
 },
 WARNING: {
 label: "هشدار",
 icon: AlertTriangle,
 color: "text-amber-600",
 bg: "bg-amber-500/5",
 border: "border-amber-500/30",
 },
 PROMO: {
 label: "پیشنهاد ویژه",
 icon: Megaphone,
 color: "text-emerald-600",
 bg: "bg-emerald-500/5",
 border: "border-emerald-500/30",
 },
 FEATURE: {
 label: "امکان جدید",
 icon: Sparkles,
 color: "text-primary",
 bg: "bg-primary/5",
 border: "border-primary/30",
 },
};

const DISMISS_KEY = "hoshhesab_in_app_dismissed";

/**
 * InAppMessageBanner — بنر پیام‌های درون‌برنامه‌ای
 *
 * پیام‌های فعال و مناسب کاربر فعلی را به‌صورت بنر یا مودال نمایش می‌دهد.
 * - اگر dismissible=true، کاربر می‌تواند dismiss کند (در localStorage ذخیره می‌شود)
 * - اگر actionUrl دارد، دکمه CTA نمایش داده می‌شود
 * - چند پیام به‌صورت stacking (روی هم) نمایش داده می‌شوند
 *
 * پیام‌ها هر ۶۰ ثانیه از /api/marketing/in-app-messages?forCurrentUser=1 بارگذاری می‌شوند.
 */
export function InAppMessageBanner() {
 const { toast } = useToast();
 const [messages, setMessages] = React.useState<InAppMessage[]>([]);
 const [loading, setLoading] = React.useState(true);

 // نام‌گذاری تابع برای self-retry قانونی (بدون رفرنس به const خارجی)
 const fetchMessages = React.useCallback(async function fetchMessages(attempt = 0) {
 const token = localStorage.getItem("hoshhesab_user_token") || "";
 if (!token) {
 setLoading(false);
 return;
 }
 try {
 const res = await fetch(
 "/api/marketing/in-app-messages?forCurrentUser=1&active=1",
 { headers: { Authorization: `Bearer ${token}` } }
 );
 if (!res.ok) {
 setLoading(false);
 return;
 }
 const json: MessagesResponse = await res.json();
 setMessages(json.data || []);
 setLoading(false);
 } catch (err) {
 // FIX: retry هوشمند — اگر سرور موقتاً در حال ری‌استارت/کامپایل بود،
 // بعد از تأخیر تصاعدی دوباره تلاش کن (حداکثر ۲ بار دیگر).
 if (attempt < 2) {
 setTimeout(() => void fetchMessages(attempt + 1), 3000 * (attempt + 1));
 return; // loading را نگه دار
 }
 console.error("In-app messages fetch failed:", err);
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 fetchMessages();
 // refresh هر ۶۰ ثانیه — FIX(21-C — PERF): وقتی تب مخفی است poll نزن؛
 // در بازگشت به تب یک fetch بی‌صدا (نه بلاک‌کننده) انجام می‌شود.
 const interval = setInterval(() => {
 if (typeof document === "undefined" || document.hidden) return;
 void fetchMessages();
 }, 60000);
 const onVisible = () => {
 if (document.visibilityState === "visible") void fetchMessages();
 };
 document.addEventListener("visibilitychange", onVisible);
 return () => {
 clearInterval(interval);
 document.removeEventListener("visibilitychange", onVisible);
 };
 }, [fetchMessages]);

 const handleDismiss = React.useCallback(
 (id: string) => {
 // ذخیره در localStorage
 try {
 const raw = localStorage.getItem(DISMISS_KEY);
 const dismissed: string[] = raw? JSON.parse(raw): [];
 if (!dismissed.includes(id)) {
 dismissed.push(id);
 localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
 }
 } catch {
 /* ignore */
 }
 // حذف از state
 setMessages((prev) => prev.filter((m) => m.id!== id));
 toast({ title: "پیام بسته شد", description: "می‌توانید از تنظیمات دوباره فعال کنید." });
 },
 [toast]
 );

 const handleAction = React.useCallback((msg: InAppMessage) => {
 if (!msg.actionUrl) return;
 // اگر actionUrl داخلی است (شروع با /)، از navigate سفارشی استفاده کن
 if (msg.actionUrl.startsWith("/")) {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate-link", {
 detail: { link: msg.actionUrl },
 })
 );
 } else {
 window.open(msg.actionUrl, "_blank", "noopener,noreferrer");
 }
 }, []);

 if (loading || messages.length === 0) return null;

 // فیلتر کردن پیام‌های dismiss شده
 let dismissedIds: string[] = [];
 try {
 const raw = localStorage.getItem(DISMISS_KEY);
 dismissedIds = raw? JSON.parse(raw): [];
 } catch {
 /* ignore */
 }
 const visibleMessages = messages.filter(
 (m) => m.dismissible === false ||!dismissedIds.includes(m.id)
 );

 if (visibleMessages.length === 0) return null;

 return (
 <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl space-y-2 pointer-events-none">
 <AnimatePresence>
 {visibleMessages.map((msg) => {
 const meta = TYPE_META[msg.type] || TYPE_META.INFO;
 const Icon = meta.icon;
 return (
 <motion.div
 key={msg.id}
 initial={{ opacity: 0, y: -20, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: -20, scale: 0.95 }}
 transition={{ duration: 0.2 }}
 className="pointer-events-auto"
 >
 <Card className={`overflow-hidden border ${meta.border} ${meta.bg}`}>
 <div className="flex items-start gap-3 p-4">
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-card ${meta.color} shrink-0`}>
 <Icon className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <h4 className="text-sm font-semibold text-foreground truncate">
 {msg.title}
 </h4>
 <span className={`text-[10px] font-medium ${meta.color}`}>
 {meta.label}
 </span>
 </div>
 <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
 {msg.body}
 </p>
 {msg.actionLabel && msg.actionUrl && (
 <Button
 size="sm"
 variant="outline"
 className="mt-2 h-7 text-xs gap-1.5"
 onClick={() => handleAction(msg)}
 >
 {msg.actionLabel}
 <ArrowLeft className="h-3 w-3" />
 </Button>
 )}
 </div>
 {msg.dismissible && (
 <button
 onClick={() => handleDismiss(msg.id)}
 className="text-muted-foreground hover:text-foreground shrink-0"
 aria-label="بستن"
 >
 <X className="h-4 w-4" />
 </button>
 )}
 </div>
 </Card>
 </motion.div>
 );
 })}
 </AnimatePresence>
 </div>
 );
}

export default InAppMessageBanner;
