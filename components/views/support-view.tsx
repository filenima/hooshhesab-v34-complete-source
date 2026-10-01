"use client";

import * as React from "react";
import {
 HelpCircle,
 BookOpen,
 Mail,
 Phone,
 Clock,
 MapPin,
 Plus,
 Search,
 Send,
 MessageCircle,
 FileText,
 Sparkles,
 CheckCircle2,
 AlertCircle,
 CircleDot,
 Loader2,
 type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import {
 TicketImagePicker,
 type TicketAttachment,
} from "@/components/ux/ticket-image-attachments";
import { MarketingHeader, MarketingFooter, type ViewType } from "./_marketing-shell";

interface SupportViewProps {
 onBack: () => void;
 onNavigate: (v: ViewType) => void;
 onOpenAuth: () => void;
}

const QUICK_ACCESS = [
 {
 icon: BookOpen,
 title: "راهنمای استفاده",
 desc: "آموزش گام‌به‌گام تمام امکانات هوش",
 action: "مشاهده راهنما",
 target: "knowledge-base",
 },
 {
 icon: HelpCircle,
 title: "سوالات متداول",
 desc: "پاسخ سوال‌های پرتکرار کاربران",
 action: "مشاهده سوالات",
 target: "knowledge-base",
 },
 {
 icon: Mail,
 title: "تماس با ما",
 desc: "اطلاعات تماس و ساعات کاری تیم پشتیبانی",
 action: "تماس مستقیم",
 target: "contact-info",
 },
];

interface Ticket {
 id: string;
 subject: string;
 category: string;
 priority: "low" | "medium" | "high" | "urgent";
 status: "open" | "answered" | "pending" | "closed";
 date: string;
}

// NOTE: تیکت‌های اخیر به‌صورت پویا از /api/tickets بارگذاری می‌شوند.

const PRIORITY_META: Record<Ticket["priority"], { label: string; color: string; icon: LucideIcon }> = {
 urgent: { label: "فوری", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
 high: { label: "بالا", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
 medium: { label: "متوسط", color: "bg-primary/10 text-primary", icon: CircleDot },
 low: { label: "پایین", color: "bg-muted text-muted-foreground", icon: CircleDot },
};

const STATUS_META: Record<Ticket["status"], { label: string; color: string; icon: LucideIcon }> = {
 open: { label: "باز", color: "bg-primary/10 text-primary", icon: CircleDot },
 answered: { label: "پاسخ داده شده", color: "bg-success/10 text-success", icon: CheckCircle2 },
 pending: { label: "در انتظار", color: "bg-muted text-muted-foreground", icon: Loader2 },
 closed: { label: "بسته شده", color: "bg-muted text-muted-foreground", icon: CheckCircle2 },
};

interface KBArticle {
 id: number;
 title: string;
 category: string;
 views: number;
}

const KB_ARTICLES: KBArticle[] = [
 { id: 1, title: "چطور فاکتور فروش ثبت کنم؟", category: "خرید و فروش", views: 8400 },
 { id: 2, title: "راه‌اندازی اتصال به سامانه مودیان", category: "مالیاتی", views: 7100 },
 { id: 3, title: "تعریف کالا و خدمات در انبار", category: "انبار", views: 5800 },
 { id: 4, title: "محاسبه حقوق و دستمزد ماهانه", category: "حقوق و دستمزد", views: 5400 },
 { id: 5, title: "اتصال فروشگاه ووکامرس به هوش", category: "فروشگاه", views: 4900 },
 { id: 6, title: "تنظیمات چک صیادی و بانک", category: "خزانه‌داری", views: 4100 },
 { id: 7, title: "تهیه گزارش ارزش افزوده دوره‌ای", category: "مالیاتی", views: 3700 },
 { id: 8, title: "دعوت کاربر جدید و تعریف نقش", category: "امنیت", views: 3200 },
];

const CONTACT_INFO = [
 { icon: Phone, label: "تلفن پشتیبانی", value: "۰۷۱-۳۲۶۲۲۴۹۳", note: "شنبه تا چهارشنبه، ۹ تا ۱۸" },
 { icon: Mail, label: "ایمیل", value: "support@hoosh.nobatime.ir", note: "پاسخ زیر ۲۴ ساعت" },
 { icon: Clock, label: "ساعات کاری", value: "۹ تا ۱۸ — پنج روز هفته", note: "پشتیبانی سازمانی ۲۴/۷" },
 { icon: MapPin, label: "آدرس", value: "شیراز، زرقان، خیابان اصلی، پلاک ۲۴۸", note: "طبقه ۶، واحد ۱۲" },
];

export function SupportView({ onBack, onNavigate, onOpenAuth }: SupportViewProps) {
 const { toast } = useToast();
 const [searchQuery, setSearchQuery] = React.useState("");
 const [form, setForm] = React.useState({
 subject: "",
 category: "",
 priority: "",
 description: "",
 });
 const [submitting, setSubmitting] = React.useState(false);
 // تیکت‌های اخیر از API بارگذاری می‌شوند
 const [recentTickets, setRecentTickets] = React.useState<Ticket[]>([]);
 const [loadingTickets, setLoadingTickets] = React.useState(true);
 // پیوست‌های تصویری تیکت (حداکثر ۵ فایل ۵ مگابایتی)
 const [attachments, setAttachments] = React.useState<TicketAttachment[]>([]);
 // مقاله گسترش‌یافته پایه دانش
 const [expandedArticle, setExpandedArticle] = React.useState<number | null>(null);

 const scrollToSection = (id: string) => {
 const el = document.getElementById(id);
 if (el) {
 el.scrollIntoView({ behavior: "smooth", block: "start" });
 }
 };

 const onToggleArticle = (id: number) => {
 setExpandedArticle((prev) => (prev === id? null: id));
 };

 // بارگذاری تیکت‌های اخیر کاربر از API
 React.useEffect(() => {
 let cancelled = false;
 authFetch("/api/tickets", { cache: "no-store" })
.then((r) => r.json())
.then((json: { success?: boolean; data?: Array<Record<string, unknown>> }) => {
 if (cancelled) return;
 if (json.success && Array.isArray(json.data)) {
 const tickets: Ticket[] = json.data.slice(0, 5).map((t) => {
 const d = (t.createdAt as string | Date | undefined)?? new Date();
 return {
 id: String(t.id?? ""),
 subject: String(t.subject?? "—"),
 category: String(t.category?? "سایر"),
 priority: (String(t.priority?? "medium").toLowerCase() as Ticket["priority"]),
 status: (String(t.status?? "open").toLowerCase() as Ticket["status"]),
 date: new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 }).format(new Date(d)),
 };
 });
 setRecentTickets(tickets);
 } else {
 setRecentTickets([]);
 }
 })
.catch(() => {
 if (!cancelled) setRecentTickets([]);
 })
.finally(() => {
 if (!cancelled) setLoadingTickets(false);
 });
 return () => {
 cancelled = true;
 };
 }, []);

 const filteredArticles = React.useMemo(() => {
 if (!searchQuery) return KB_ARTICLES;
 return KB_ARTICLES.filter(
 (a) => a.title.includes(searchQuery) || a.category.includes(searchQuery)
 );
 }, [searchQuery]);

 const groupedArticles = React.useMemo(() => {
 const groups: Record<string, KBArticle[]> = {};
 for (const a of filteredArticles) {
 if (!groups[a.category]) groups[a.category] = [];
 groups[a.category].push(a);
 }
 return groups;
 }, [filteredArticles]);

 const onSubmitTicket = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!form.subject ||!form.category ||!form.priority ||!form.description) {
 toast({
 title: "لطفاً تمام فیلدها را پر کنید",
 description: "برای ثبت تیکت، تکمیل همه‌ی فیلدها الزامی است.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/tickets", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 subject: form.subject,
 description: form.description,
 category: form.category,
 priority: form.priority,
 attachments,
 }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 throw new Error(data?.error || "خطا در ثبت تیکت");
 }
 setForm({ subject: "", category: "", priority: "", description: "" });
 setAttachments([]);
 toast({
 title: "تیکت شما ثبت شد",
 description:
 data?.message??
 "پاسخ تیم پشتیبانی در زیر ۲۴ ساعت ارسال خواهد شد.",
 });
 // به‌روزرسانی لیست تیکت‌های اخیر
 try {
 const refresh = await authFetch("/api/tickets", { cache: "no-store" });
 const rj = await refresh.json().catch(() => ({}));
 if (rj?.success && Array.isArray(rj.data)) {
 setRecentTickets(
 rj.data.slice(0, 5).map((t: Record<string, unknown>) => {
 const d = (t.createdAt as string | Date | undefined)?? new Date();
 return {
 id: String(t.id?? ""),
 subject: String(t.subject?? "—"),
 category: String(t.category?? "سایر"),
 priority: (String(t.priority?? "medium").toLowerCase() as Ticket["priority"]),
 status: (String(t.status?? "open").toLowerCase() as Ticket["status"]),
 date: new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 }).format(new Date(d)),
 };
 })
 );
 }
 } catch {
 /* ignore refresh error */
 }
 } catch (err) {
 toast({
 title: "خطا در ثبت تیکت",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const onStartChat = () => {
 toast({
 title: "چت آنلاین آماده است",
 description: "دستیار هوش مصنوعی هوش‌یار در گوشه پایین صفحه در دسترس شماست.",
 });
 // اسکرول به پایین برای دیدن دکمه شناور
 window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
 };

 return (
 <div className="flex min-h-screen flex-col bg-background">
 <MarketingHeader active="support" onBack={onBack} onNavigate={onNavigate} onOpenAuth={onOpenAuth} />

 {/* Hero */}
 <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
 <Badge variant="secondary" className="bg-primary/10 text-primary mb-4">
 <Sparkles className="h-3 w-3 ml-1" />
 مرکز پشتیبانی
 </Badge>
 <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
 مرکز پشتیبانی هوش
 </h1>
 <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
 هر کمکی نیاز دارید، اینجا هستیم — راهنما، تیکت، چت آنلاین و تماس مستقیم
 </p>
 </div>
 </section>

 <main className="flex-1">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-12">
 {/* Quick access */}
 <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
 {QUICK_ACCESS.map((q) => {
 const Icon = q.icon;
 return (
 <Card key={q.title} className="p-6 card-hover">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
 <Icon className="h-5 w-5" />
 </div>
 <h3 className="text-base font-semibold text-foreground mb-2">{q.title}</h3>
 <p className="text-sm text-muted-foreground leading-relaxed mb-4">{q.desc}</p>
 <Button variant="outline" size="sm" className="w-full" onClick={() => scrollToSection(q.target)}>
 {q.action}
 </Button>
 </Card>
 );
 })}
 </section>

 {/* Ticket system */}
 <section>
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* تیکت‌های اخیر */}
 <Card className="p-6">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-base font-semibold text-foreground">تیکت‌های اخیر</h2>
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(recentTickets.length)} تیکت
 </Badge>
 </div>
 <div className="overflow-x-auto -mx-2">
 {loadingTickets? (
 <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
 در حال بارگذاری تیکت‌ها...
 </div>
 ): recentTickets.length === 0? (
 <div className="text-center py-8 text-sm text-muted-foreground">
 هنوز تیکتی ثبت نشده. اولین تیکت خود را از فرم کنار ثبت کنید.
 </div>
 ): (
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="text-xs">موضوع</TableHead>
 <TableHead className="text-xs">اولویت</TableHead>
 <TableHead className="text-xs">وضعیت</TableHead>
 <TableHead className="text-xs hidden sm:table-cell">تاریخ</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {recentTickets.map((t) => {
 const pMeta = PRIORITY_META[t.priority];
 const sMeta = STATUS_META[t.status];
 const PIcon = pMeta.icon;
 const SIcon = sMeta.icon;
 return (
 <TableRow key={t.id}>
 <TableCell className="text-sm">
 <p className="font-medium text-foreground leading-tight line-clamp-1">
 {t.subject}
 </p>
 <p className="text-[10px] text-muted-foreground mt-0.5">
 {t.id} · {t.category}
 </p>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${pMeta.color}`}>
 <PIcon className="h-2.5 w-2.5 ml-0.5" />
 {pMeta.label}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${sMeta.color}`}>
 <SIcon className="h-2.5 w-2.5 ml-0.5" />
 {sMeta.label}
 </Badge>
 </TableCell>
 <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
 {t.date}
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 )}
 </div>
 </Card>

 {/* تیکت جدید */}
 <Card id="ticket-form" className="p-6">
 <h2 className="text-base font-semibold text-foreground mb-1">تیکت جدید</h2>
 <p className="text-xs text-muted-foreground mb-4">
 تیم پشتیبانی در کمتر از ۲۴ ساعت پاسخ می‌دهد.
 </p>
 <form onSubmit={onSubmitTicket} className="space-y-3.5">
 <div>
 <Label className="text-xs mb-1.5 block">موضوع</Label>
 <Input
 value={form.subject}
 onChange={(e) => setForm({...form, subject: e.target.value })}
 placeholder="عنوان کوتاه مشکل"
 className="h-9"
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <Label className="text-xs mb-1.5 block">دسته‌بندی</Label>
 <Select
 value={form.category}
 onValueChange={(v) => setForm({...form, category: v })}
 >
 <SelectTrigger className="h-9 w-full">
 <SelectValue placeholder="انتخاب..." />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="technical">فنی</SelectItem>
 <SelectItem value="tax">مالیاتی</SelectItem>
 <SelectItem value="account">حساب</SelectItem>
 <SelectItem value="billing">صورتحساب</SelectItem>
 <SelectItem value="education">آموزشی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label className="text-xs mb-1.5 block">اولویت</Label>
 <Select
 value={form.priority}
 onValueChange={(v) => setForm({...form, priority: v })}
 >
 <SelectTrigger className="h-9 w-full">
 <SelectValue placeholder="انتخاب..." />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="low">پایین</SelectItem>
 <SelectItem value="medium">متوسط</SelectItem>
 <SelectItem value="high">بالا</SelectItem>
 <SelectItem value="urgent">فوری</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <div>
 <Label className="text-xs mb-1.5 block">توضیحات</Label>
 <Textarea
 value={form.description}
 onChange={(e) => setForm({...form, description: e.target.value })}
 placeholder="مشکل خود را با جزئیات شرح دهید..."
 rows={4}
 className="resize-none"
 />
 </div>
 {/* پیوست تصویری (حداکثر ۵ فایل ۵ مگابایتی) */}
 <div>
 <Label className="text-xs mb-1.5 block">پیوست تصویری</Label>
 <TicketImagePicker
 value={attachments}
 onChange={setAttachments}
 disabled={submitting}
 />
 </div>
 <div className="flex items-center justify-end">
 <Button type="submit" size="sm" disabled={submitting}>
 {submitting? (
 <>
 <Loader2 className="h-3.5 w-3.5 ml-1.5 animate-spin" />
 در حال ارسال...
 </>
 ): (
 <>
 <Send className="h-3.5 w-3.5 ml-1.5" />
 ثبت تیکت
 </>
 )}
 </Button>
 </div>
 </form>
 </Card>
 </div>
 </section>

 {/* Knowledge base + Live chat + Contact */}
 <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* Knowledge base — کل ستون */}
 <Card id="knowledge-base" className="lg:col-span-2 p-6">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
 <div>
 <h2 className="text-base font-semibold text-foreground">پایه دانش</h2>
 <p className="text-xs text-muted-foreground mt-0.5">
 جستجو در مقالات آموزشی و راهنماها
 </p>
 </div>
 <div className="relative w-full sm:w-64">
 <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="جستجو در مقالات..."
 className="pr-9 h-9 text-sm"
 />
 </div>
 </div>
 <div className="space-y-5 max-h-96 overflow-y-auto pl-1">
 {Object.entries(groupedArticles).map(([cat, articles]) => (
 <div key={cat}>
 <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">{cat}</p>
 <ul className="space-y-1">
 {articles.map((a) => (
 <li key={a.id}>
 <button
 className="group flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-muted text-sm transition-colors"
 onClick={() => onToggleArticle(a.id)}
 >
 <span className="flex items-center gap-2 text-foreground min-w-0">
 <FileText className="h-4 w-4 text-primary shrink-0" />
 <span className="truncate group-hover:text-primary transition-colors">
 {a.title}
 </span>
 </span>
 <span className="text-[10px] text-muted-foreground shrink-0">
 {toPersianDigits(a.views.toLocaleString("en-US"))} بازدید
 </span>
 </button>
 {expandedArticle === a.id && (
 <div className="mr-6 mt-1 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed" dir="rtl">
 <p className="font-medium text-foreground mb-1">{a.title}</p>
 <p>
 این مقاله مربوط به دسته‌ی «{a.category}» است. برای مطالعه‌ی کامل محتوا،
 از بخش راهنما بازدید کنید یا با ثبت تیکت از تیم پشتیبانی کمک بگیرید.
 </p>
 <Button
 variant="link"
 size="sm"
 className="h-auto p-0 mt-1 text-[11px]"
 onClick={() => scrollToSection("ticket-form")}
 >
 ثبت تیکت پشتیبانی 
 </Button>
 </div>
 )}
 </li>
 ))}
 </ul>
 </div>
 ))}
 {filteredArticles.length === 0 && (
 <p className="text-center text-sm text-muted-foreground py-8">
 مقاله‌ای یافت نشد.
 </p>
 )}
 </div>
 </Card>

 <div className="space-y-6">
 {/* Live chat teaser */}
 <Card className="p-6 bg-primary text-primary-foreground">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground/15 mb-4">
 <MessageCircle className="h-5 w-5" />
 </div>
 <h3 className="text-base font-semibold mb-1">چت آنلاین</h3>
 <p className="text-xs text-primary-foreground/80 leading-relaxed mb-4">
 پاسخ فوری به سوال‌های حسابداری از طریق دستیار هوش مصنوعی هوش‌یار — همیشه آنلاین.
 </p>
 <Button
 variant="secondary"
 className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90"
 onClick={onStartChat}
 >
 <MessageCircle className="h-4 w-4 ml-1.5" />
 شروع چت
 </Button>
 </Card>

 {/* New ticket shortcut */}
 <Card className="p-6 card-hover">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
 <Plus className="h-5 w-5" />
 </div>
 <h3 className="text-base font-semibold text-foreground mb-1">سوال پیچیده دارید؟</h3>
 <p className="text-xs text-muted-foreground leading-relaxed mb-4">
 اگر نیاز به بررسی تخصصی دارید، تیکت ثبت کنید تا تیم پشتیبانی پیگیری کند.
 </p>
 <Button variant="outline" size="sm" className="w-full" onClick={() => scrollToSection("ticket-form")}>
 ثبت تیکت جدید
 </Button>
 </Card>
 </div>
 </section>

 {/* Contact info */}
 <section id="contact-info">
 <h2 className="text-lg font-semibold text-foreground mb-4">اطلاعات تماس</h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {CONTACT_INFO.map((c) => {
 const Icon = c.icon;
 return (
 <Card key={c.label} className="p-5 card-hover">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
 <Icon className="h-4 w-4" />
 </div>
 <p className="text-[11px] text-muted-foreground mb-1">{c.label}</p>
 <p className="text-sm font-semibold text-foreground leading-tight">{c.value}</p>
 <p className="text-[11px] text-muted-foreground mt-1">{c.note}</p>
 </Card>
 );
 })}
 </div>
 </section>
 </div>
 </main>

 <MarketingFooter onNavigate={onNavigate} />
 </div>
 );
}
