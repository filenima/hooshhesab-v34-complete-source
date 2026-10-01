"use client";

import * as React from "react";
import {
 MessageSquare,
 Plus,
 Send,
 Clock,
 CheckCircle2,
 AlertCircle,
 CircleDot,
 Loader2,
 RefreshCw,
 ChevronLeft,
 X,
 Filter,
 Ticket as TicketIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import {
 TicketImagePicker,
 TicketAttachmentThumbnails,
 type TicketAttachment,
} from "@/components/ux/ticket-image-attachments";

/* ============ انواع ============ */

interface TicketMessage {
 id: string;
 body: string;
 authorType: string;
 authorId: string | null;
 authorName: string | null;
 isAdmin: boolean;
 attachments?: TicketAttachment[] | null;
 createdAt: string;
}

interface Ticket {
 id: string;
 subject: string;
 description: string;
 category: string;
 priority: string;
 status: string;
 createdAt: string;
 updatedAt: string;
 messages?: TicketMessage[];
}

type ViewMode = "list" | "detail" | "new";

/* ============ ثابت‌های فارسی ============ */

const CATEGORY_LABELS: Record<string, string> = {
 BILLING: "مالی و صورتحساب",
 TECHNICAL: "فنی",
 FEATURE_REQUEST: "درخواست امکانات",
 BUG: "گزارش باگ",
 OTHER: "سایر",
};

const PRIORITY_LABELS: Record<string, string> = {
 LOW: "کم",
 MEDIUM: "متوسط",
 HIGH: "زیاد",
 URGENT: "فوری",
};

const STATUS_LABELS: Record<string, string> = {
 OPEN: "باز",
 IN_PROGRESS: "در حال بررسی",
 RESOLVED: "حل‌شده",
 CLOSED: "بسته‌شده",
};

const STATUS_COLORS: Record<string, string> = {
 OPEN: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
 IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
 RESOLVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
 CLOSED: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const PRIORITY_COLORS: Record<string, string> = {
 LOW: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
 MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
 HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
 URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

/* ============ کمکی ============ */

function toPersianDigits(n: number | string): string {
 const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
 return String(n).replace(/\d/g, (d) => fa[Number(d)]);
}

function formatDate(iso: string): string {
 try {
 const d = new Date(iso);
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 }).format(d);
 } catch {
 return iso;
 }
}

function StatusIcon({ status }: { status: string }) {
 switch (status) {
 case "OPEN":
 return <AlertCircle className="h-4 w-4 text-amber-500" />;
 case "IN_PROGRESS":
 return <CircleDot className="h-4 w-4 text-blue-500" />;
 case "RESOLVED":
 return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
 case "CLOSED":
 return <CheckCircle2 className="h-4 w-4 text-gray-400" />;
 default:
 return <Clock className="h-4 w-4" />;
 }
}

/* ============ کش آفلاین (localStorage) ============ */

const CACHE_KEY = "hoshhesab_tickets_cache";
const CACHE_TTL = 5 * 60 * 1000; // ۵ دقیقه

interface CachedTickets {
 data: Ticket[];
 timestamp: number;
}

function saveToCache(tickets: Ticket[]): void {
 try {
 const cache: CachedTickets = { data: tickets, timestamp: Date.now() };
 localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
 } catch {
 /* suppress */
 }
}

function loadFromCache(): Ticket[] | null {
 try {
 const raw = localStorage.getItem(CACHE_KEY);
 if (!raw) return null;
 const cache: CachedTickets = JSON.parse(raw);
 if (Date.now() - cache.timestamp > CACHE_TTL) return null;
 return cache.data;
 } catch {
 return null;
 }
}

/* ============ کامپوننت اصلی ============ */

export function SupportTicketModule() {
 const { toast } = useToast();
 const [tickets, setTickets] = React.useState<Ticket[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [view, setView] = React.useState<ViewMode>("list");
 const [selectedTicket, setSelectedTicket] = React.useState<Ticket | null>(null);
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [isOffline, setIsOffline] = React.useState(false);

 // فرم تیکت جدید
 const [newSubject, setNewSubject] = React.useState("");
 const [newDescription, setNewDescription] = React.useState("");
 const [newCategory, setNewCategory] = React.useState("OTHER");
 const [newPriority, setNewPriority] = React.useState("MEDIUM");
 const [newAttachments, setNewAttachments] = React.useState<TicketAttachment[]>([]);
 const [submitting, setSubmitting] = React.useState(false);

 // فرم پاسخ
 const [replyMessage, setReplyMessage] = React.useState("");
 const [replyAttachments, setReplyAttachments] = React.useState<TicketAttachment[]>([]);
 const [replying, setReplying] = React.useState(false);

 // بارگذاری لیست تیکت‌ها
 const loadTickets = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await authFetch("/api/tickets?limit=100");
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در دریافت تیکت‌ها");
 setTickets(data.data || []);
 saveToCache(data.data || []);
 setIsOffline(false);
 } catch {
 // fallback به کش محلی
 const cached = loadFromCache();
 if (cached) {
 setTickets(cached);
 setIsOffline(true);
 toast({
 title: "حالت آفلاین",
 description: "اطلاعات از حافظه محلی بارگذاری شده‌اند.",
 variant: "destructive",
 });
 } else {
 toast({
 title: "خطا",
 description: "دریافت تیکت‌ها ناموفق بود.",
 variant: "destructive",
 });
 }
 } finally {
 setLoading(false);
 }
 }, [toast]);

 React.useEffect(() => {
 void loadTickets();
 }, [loadTickets]);

 // بارگذاری جزئیات تیکت
 const loadTicketDetail = async (id: string) => {
 try {
 const res = await authFetch(`/api/tickets/${id}`);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در دریافت جزئیات");
 setSelectedTicket(data.data);
 } catch {
 toast({
 title: "خطا",
 description: "دریافت جزئیات تیکت ناموفق بود.",
 variant: "destructive",
 });
 }
 };

 // ایجاد تیکت جدید
 const handleSubmit = async () => {
 if (!newSubject.trim() ||!newDescription.trim()) {
 toast({ title: "خطا", description: "موضوع و توضیحات الزامی است.", variant: "destructive" });
 return;
 }
 if (newSubject.trim().length < 3) {
 toast({ title: "خطا", description: "موضوع باید حداقل ۳ کاراکتر باشد.", variant: "destructive" });
 return;
 }
 if (newDescription.trim().length < 10) {
 toast({ title: "خطا", description: "توضیحات باید حداقل ۱۰ کاراکتر باشد.", variant: "destructive" });
 return;
 }

 setSubmitting(true);
 try {
 const res = await authFetch("/api/tickets", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 subject: newSubject.trim(),
 description: newDescription.trim(),
 category: newCategory,
 priority: newPriority,
 attachments: newAttachments,
 }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در ثبت تیکت");

 toast({
 title: "تیکت ثبت شد",
 description: "تیکت شما با موفقیت ثبت شد. تیم پشتیبانی به‌زودی پاسخ خواهد داد.",
 });

 // بازنشانی فرم
 setNewSubject("");
 setNewDescription("");
 setNewCategory("OTHER");
 setNewPriority("MEDIUM");
 setNewAttachments([]);
 setView("list");
 await loadTickets();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "ثبت تیکت ناموفق بود.",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // پاسخ کاربر به تیکت
 const handleReply = async () => {
 if (!selectedTicket ||!replyMessage.trim()) return;
 setReplying(true);
 try {
 const res = await authFetch(`/api/tickets/${selectedTicket.id}/user-reply`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ message: replyMessage.trim(), attachments: replyAttachments }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در ارسال پاسخ");

 toast({ title: "پاسخ ارسال شد", description: "پاسخ شما ثبت شد." });
 setReplyMessage("");
 setReplyAttachments([]);
 await loadTicketDetail(selectedTicket.id);
 await loadTickets();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "ارسال پاسخ ناموفق بود.",
 variant: "destructive",
 });
 } finally {
 setReplying(false);
 }
 };

 // فیلتر تیکت‌ها
 const filteredTickets = React.useMemo(() => {
 if (statusFilter === "all") return tickets;
 return tickets.filter((t) => t.status === statusFilter);
 }, [tickets, statusFilter]);

 // آمار
 const stats = React.useMemo(() => {
 const s = { open: 0, inProgress: 0, resolved: 0, closed: 0 };
 for (const t of tickets) {
 if (t.status === "OPEN") s.open++;
 else if (t.status === "IN_PROGRESS") s.inProgress++;
 else if (t.status === "RESOLVED") s.resolved++;
 else if (t.status === "CLOSED") s.closed++;
 }
 return s;
 }, [tickets]);

 /* ============ رندر: فرم تیکت جدید ============ */
 if (view === "new") {
 return (
 <div className="space-y-4 p-4">
 <div className="flex items-center gap-2">
 <Button variant="ghost" size="sm" onClick={() => setView("list")}>
 <ChevronLeft className="h-4 w-4" />
 بازگشت
 </Button>
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <Plus className="h-4 w-4 text-primary" />
 تیکت جدید
 </h2>
 </div>

 <Card>
 <CardContent className="p-4 space-y-4">
 <div className="space-y-2">
 <Label htmlFor="ticket-subject">موضوع</Label>
 <Input
 id="ticket-subject"
 value={newSubject}
 onChange={(e) => setNewSubject(e.target.value)}
 placeholder="موضوع تیکت خود را وارد کنید..."
 maxLength={200}
 dir="rtl"
 />
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label>دسته‌بندی</Label>
 <Select value={newCategory} onValueChange={setNewCategory}>
 <SelectTrigger className="text-start">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="BILLING">مالی و صورتحساب</SelectItem>
 <SelectItem value="TECHNICAL">فنی</SelectItem>
 <SelectItem value="FEATURE_REQUEST">درخواست امکانات</SelectItem>
 <SelectItem value="BUG">گزارش باگ</SelectItem>
 <SelectItem value="OTHER">سایر</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-2">
 <Label>اولویت</Label>
 <Select value={newPriority} onValueChange={setNewPriority}>
 <SelectTrigger className="text-start">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="LOW">کم</SelectItem>
 <SelectItem value="MEDIUM">متوسط</SelectItem>
 <SelectItem value="HIGH">زیاد</SelectItem>
 <SelectItem value="URGENT">فوری</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="ticket-desc">توضیحات</Label>
 <Textarea
 id="ticket-desc"
 value={newDescription}
 onChange={(e) => setNewDescription(e.target.value)}
 placeholder="توضیحات کامل مشکل یا درخواست خود را بنویسید..."
 rows={6}
 maxLength={5000}
 dir="rtl"
 />
 <p className="text-[11px] text-muted-foreground text-start">
 {toPersianDigits(newDescription.length)} / {toPersianDigits(5000)} کاراکتر
 </p>
 </div>

 {/* پیوست تصویری (حداکثر ۵ فایل ۵ مگابایتی) */}
 <div className="space-y-2">
 <Label>پیوست تصویری</Label>
 <TicketImagePicker
 value={newAttachments}
 onChange={setNewAttachments}
 disabled={submitting}
 />
 </div>

 <div className="flex justify-end gap-2">
 <Button variant="outline" onClick={() => setView("list")} disabled={submitting}>
 انصراف
 </Button>
 <Button onClick={handleSubmit} disabled={submitting}>
 {submitting? (
 <>
 <Loader2 className="h-4 w-4 animate-spin me-2" />
 در حال ثبت...
 </>
 ): (
 <>
 <Send className="h-4 w-4 me-2" />
 ثبت تیکت
 </>
 )}
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 );
 }

 /* ============ رندر: جزئیات تیکت ============ */
 if (view === "detail" && selectedTicket) {
 const t = selectedTicket;
 return (
 <div className="space-y-4 p-4">
 <div className="flex items-center gap-2">
 <Button variant="ghost" size="sm" onClick={() => { setView("list"); setSelectedTicket(null); }}>
 <ChevronLeft className="h-4 w-4" />
 بازگشت
 </Button>
 <h2 className="text-sm font-semibold truncate">{t.subject}</h2>
 </div>

 {/* هدر تیکت */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-wrap items-center gap-2 mb-3">
 <Badge className={STATUS_COLORS[t.status] || ""}>
 <StatusIcon status={t.status} />
 <span className="ms-1">{STATUS_LABELS[t.status] || t.status}</span>
 </Badge>
 <Badge variant="outline" className={PRIORITY_COLORS[t.priority] || ""}>
 {PRIORITY_LABELS[t.priority] || t.priority}
 </Badge>
 <Badge variant="secondary">
 {CATEGORY_LABELS[t.category] || t.category}
 </Badge>
 </div>
 <p className="text-sm text-muted-foreground mb-2">{t.description}</p>
 <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
 <span>ایجاد: {formatDate(t.createdAt)}</span>
 <span>به‌روزرسانی: {formatDate(t.updatedAt)}</span>
 <span>شناسه: {t.id.slice(0, 8)}</span>
 </div>
 </CardContent>
 </Card>

 {/* پیام‌ها */}
 <Card>
 <CardHeader className="p-3 pb-0">
 <CardTitle className="text-xs flex items-center gap-2">
 <MessageSquare className="h-4 w-4" />
 تاریخچه مکالمه
 </CardTitle>
 </CardHeader>
 <CardContent className="p-3">
 <ScrollArea className="max-h-96">
 <div className="space-y-3">
 {(t.messages || []).map((msg, i) => (
 <div key={msg.id || i}>
 <div
 className={`rounded-lg p-3 text-sm ${
 msg.isAdmin
? "bg-primary/5 border border-primary/20 ms-8"
: "bg-muted me-8"
 }`}
 >
 <div className="flex items-center gap-2 mb-1">
 <span className={`text-[11px] font-medium ${msg.isAdmin? "text-primary": "text-foreground"}`}>
 {msg.authorName || (msg.isAdmin? "پشتیبانی": "شما")}
 </span>
 <span className="text-[10px] text-muted-foreground">
 {formatDate(msg.createdAt)}
 </span>
 </div>
 <p className="whitespace-pre-wrap leading-relaxed" dir="rtl">{msg.body}</p>
 <TicketAttachmentThumbnails attachments={msg.attachments} />
 </div>
 {i < (t.messages || []).length - 1 && <Separator className="my-2 opacity-50" />}
 </div>
 ))}

 {(!t.messages || t.messages.length === 0) && (
 <p className="text-sm text-muted-foreground text-center py-4">
 هنوز پیامی ثبت نشده است.
 </p>
 )}
 </div>
 </ScrollArea>
 </CardContent>
 </Card>

 {/* فرم پاسخ (فقط اگر تیکت باز یا در حال بررسی است) */}
 {(t.status === "OPEN" || t.status === "IN_PROGRESS") && (
 <Card>
 <CardContent className="p-3">
 <div className="space-y-2">
 <Label htmlFor="reply-input">پاسخ شما</Label>
 <Textarea
 id="reply-input"
 value={replyMessage}
 onChange={(e) => setReplyMessage(e.target.value)}
 placeholder="پاسخ خود را بنویسید..."
 rows={3}
 maxLength={5000}
 dir="rtl"
 />
 <TicketImagePicker
 value={replyAttachments}
 onChange={setReplyAttachments}
 compact
 disabled={replying}
 />
 <div className="flex justify-end">
 <Button onClick={handleReply} disabled={replying ||!replyMessage.trim()}>
 {replying? (
 <>
 <Loader2 className="h-4 w-4 animate-spin me-2" />
 در حال ارسال...
 </>
 ): (
 <>
 <Send className="h-4 w-4 me-2" />
 ارسال پاسخ
 </>
 )}
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 );
 }

 /* ============ رندر: لیست تیکت‌ها ============ */
 return (
 <div className="space-y-4 p-4">
 {/* هدر */}
 <div className="flex items-center justify-between gap-2">
 <div>
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <TicketIcon className="h-4 w-4 text-primary" />
 تیکت‌های پشتیبانی
 </h2>
 <p className="text-[11px] text-muted-foreground">
 ارسال تیکت و پیگیری وضعیت درخواست‌ها
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" onClick={loadTickets} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 <span className="hidden sm:inline ms-1">به‌روزرسانی</span>
 </Button>
 <Button size="sm" onClick={() => setView("new")}>
 <Plus className="h-4 w-4 me-1" />
 تیکت جدید
 </Button>
 </div>
 </div>

 {isOffline && (
 <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs p-2 rounded-md flex items-center gap-2">
 <AlertCircle className="h-3 w-3 shrink-0" />
 اطلاعات از حافظه محلی بارگذاری شده‌اند (حالت آفلاین).
 </div>
 )}

 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <Card className="p-3 text-center">
 <div className="flex items-center justify-center gap-1 mb-1">
 <AlertCircle className="h-3 w-3 text-amber-500" />
 <span className="text-[11px] text-muted-foreground">باز</span>
 </div>
 <span className="text-lg font-bold">{toPersianDigits(stats.open)}</span>
 </Card>
 <Card className="p-3 text-center">
 <div className="flex items-center justify-center gap-1 mb-1">
 <CircleDot className="h-3 w-3 text-blue-500" />
 <span className="text-[11px] text-muted-foreground">در حال بررسی</span>
 </div>
 <span className="text-lg font-bold">{toPersianDigits(stats.inProgress)}</span>
 </Card>
 <Card className="p-3 text-center">
 <div className="flex items-center justify-center gap-1 mb-1">
 <CheckCircle2 className="h-3 w-3 text-emerald-500" />
 <span className="text-[11px] text-muted-foreground">حل‌شده</span>
 </div>
 <span className="text-lg font-bold">{toPersianDigits(stats.resolved)}</span>
 </Card>
 <Card className="p-3 text-center">
 <div className="flex items-center justify-center gap-1 mb-1">
 <CheckCircle2 className="h-3 w-3 text-gray-400" />
 <span className="text-[11px] text-muted-foreground">بسته‌شده</span>
 </div>
 <span className="text-lg font-bold">{toPersianDigits(stats.closed)}</span>
 </Card>
 </div>

 {/* فیلتر وضعیت */}
 <div className="flex items-center gap-2">
 <Filter className="h-4 w-4 text-muted-foreground" />
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="h-8 w-[160px] text-xs">
 <SelectValue placeholder="فیلتر وضعیت" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه وضعیت‌ها</SelectItem>
 <SelectItem value="OPEN">باز</SelectItem>
 <SelectItem value="IN_PROGRESS">در حال بررسی</SelectItem>
 <SelectItem value="RESOLVED">حل‌شده</SelectItem>
 <SelectItem value="CLOSED">بسته‌شده</SelectItem>
 </SelectContent>
 </Select>
 <span className="text-[11px] text-muted-foreground">
 {toPersianDigits(filteredTickets.length)} تیکت
 </span>
 </div>

 {/* لیست تیکت‌ها */}
 {loading? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): filteredTickets.length === 0? (
 <Card className="p-8 text-center">
 <TicketIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
 <p className="text-sm text-muted-foreground mb-3">
 {statusFilter!== "all"? "تیکتی با این وضعیت یافت نشد.": "هنوز تیکتی ثبت نکرده‌اید."}
 </p>
 <Button size="sm" onClick={() => setView("new")}>
 <Plus className="h-4 w-4 me-1" />
 ثبت اولین تیکت
 </Button>
 </Card>
 ): (
 <div className="space-y-2">
 {filteredTickets.map((t) => (
 <Card
 key={t.id}
 className="cursor-pointer hover:bg-accent/50 transition-colors"
 onClick={() => {
 setSelectedTicket(t);
 setView("detail");
 void loadTicketDetail(t.id);
 }}
 >
 <CardContent className="p-3">
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <StatusIcon status={t.status} />
 <span className="text-sm font-medium truncate">{t.subject}</span>
 </div>
 <p className="text-xs text-muted-foreground truncate" dir="rtl">
 {t.description}
 </p>
 </div>
 <div className="flex flex-col items-end gap-1 shrink-0">
 <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[t.status] || ""}`}>
 {STATUS_LABELS[t.status] || t.status}
 </Badge>
 <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[t.priority] || ""}`}>
 {PRIORITY_LABELS[t.priority] || t.priority}
 </Badge>
 </div>
 </div>
 <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
 <span>{CATEGORY_LABELS[t.category] || t.category}</span>
 <span>{formatDate(t.createdAt)}</span>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </div>
 );
}
