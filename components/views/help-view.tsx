"use client";

import * as React from "react";
import {
 BookOpen,
 MessageSquare,
 Phone,
 Mail,
 Video,
 FileText,
 ChevronDown,
 ExternalLink,
 Search,
 Headphones,
 Code2,
 Zap,
 Plus,
 Send,
 Ticket as TicketIcon,
 Loader2,
 CheckCircle2,
 Clock,
 AlertCircle,
 CircleDot,
 Inbox,
 MessageCircle,
 Paperclip,
 RotateCw,
 X,
 File as FileIcon,
 type LucideIcon,
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
import {
 Tabs,
 TabsContent,
 TabsList,
 TabsTrigger,
} from "@/components/ui/tabs";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

// ============ داده‌های سوالات متداول ============
const FAQS = [
 {
 q: "چگونه فاکتور جدید صادر کنم؟",
 a: "از منوی سایدبار بخش «خرید و فروش» را انتخاب کنید، سپس روی دکمه «فاکتور جدید» کلیک کنید. فرم فاکتور شامل انتخاب طرف‌حساب، افزودن آیتم‌ها و تعیین شرایط پرداخت است.",
 },
 {
 q: "اتصال به سامانه مودیان چگونه کار می‌کند؟",
 a: "در بخش «سامانه مودیان»، ابتدا اطلاعات شرکت خود (شناسه ملی، کد اقتصادی) را وارد کنید. سپس کلید API مودیان را تنظیم کنید. پس از تأیید، فاکتورها به‌صورت خودکار به مودیان ارسال می‌شوند.",
 },
 {
 q: "آیا هوش از چند ارز پشتیبانی می‌کند؟",
 a: "بله. بخش «ارز و چندارزی» امکان تعریف ارزهای سفارشی، ثبت نرخ‌های روز و تبدیل خودکار مبالغ را فراهم می‌کند. نرخ‌ها از tgju.org به‌روزرسانی می‌شوند. همچنین فاکتور به ریال و تومان پشتیبانی می‌شود.",
 },
 {
 q: "چگونه از هوش مصنوعی استفاده کنم؟",
 a: "در بخش «هوش مصنوعی» به امکاناتی مانند OCR فاکتور (استخراج اطلاعات از تصویر)، پیش‌بینی جریان نقدی، تشخیص تقلب و چت‌بات مالی دسترسی دارید.",
 },
 {
 q: "اپلیکیشن موبایل چگونه نصب می‌شود؟",
 a: "هوش PWA است. در مرورگر موبایل خود به app.hoosh.nobatime.ir بروید و از منوی مرورگر «افزودن به صفحه اصلی» را انتخاب کنید. اپلیکیشن با قابلیت آفلاین کار می‌کند.",
 },
 {
 q: "چگونه داده‌هایم را از هسابفا یا هلو وارد کنم؟",
 a: "در بخش «سیستم» > «API و توسعه»، ابزار «مهاجرت داده» وجود دارد. فایل اکسل از نرم‌افزار قبلی صادر و در هوش وارد کنید. نگاشت ستون‌ها به‌صورت خودکار پیشنهاد داده می‌شود.",
 },
 {
 q: "آیا هوش ارزش افزوده را محاسبه می‌کند؟",
 a: "بله، هوش به‌صورت خودکار مالیات بر ارزش افزوده (۹٪، ۱۵٪ و ۲۰٪) را بر اساس نوع کالا محاسبه و در فاکتور اعمال می‌کند. همچنین صورتحساب الکترونیکی مودیان شامل VAT است.",
 },
 {
 q: "حقوق و دستمزد چگونه محاسبه می‌شود؟",
 a: "ماژول حقوق و دستمزد شامل تعریف پیمانکار، افزودن کارکنان، محاسبه حقوق بر اساس پایه، اضافه‌کاری، عیودی و کسورات بیمه و مالیات است. فیش حقوقی به‌صورت PDF قابل صدور است.",
 },
 {
 q: "آیا می‌توانم چند کسب‌وکار را در یک حساب مدیریت کنم؟",
 a: "بله، با پلن Business و Enterprise امکان مدیریت چندین شرکت (Tenant) وجود دارد. هر شرکت دیتای مستقل دارد و کاربر می‌تواند بین آن‌ها جابجا شود.",
 },
 {
 q: "پشتیبانی فنی چگونه ارائه می‌شود؟",
 a: "پشتیبانی از طریق تیکت، چت زنده و تلفن (شنبه تا پنجشنبه ۹ تا ۱۸) ارائه می‌شود. مشتریان پلن Business و Enterprise اولویت بالاتری در پاسخ‌گویی دارند.",
 },
];

// ============ منابع آموزشی ============
const RESOURCES = [
 { title: "مستندات فنی API", desc: "راهنمای کامل APIهای REST و GraphQL", icon: Code2, href: "#" },
 { title: "ویدیوی آموزشی شروع سریع", desc: "۱۵ دقیقه آموزش ویدیویی برای شروع کار", icon: Video, href: "#" },
 { title: "راهنمای کاربر حسابداری", desc: "مستندات کامل ماژول‌های حسابداری", icon: BookOpen, href: "#" },
 { title: "نمونه کد SDK", desc: "نمونه‌های کد برای Python، Node.js و PHP", icon: FileText, href: "#" },
];

// ============ انواع تیکت ============
type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TicketCategory = "BILLING" | "TECHNICAL" | "FEATURE_REQUEST" | "BUG" | "OTHER";

interface TicketMessage {
 id: string;
 body: string;
 authorType: string;
 authorName: string | null;
 isAdmin: boolean;
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

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: LucideIcon }> = {
 OPEN: { label: "باز", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: CircleDot },
 IN_PROGRESS: { label: "در حال بررسی", color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: Clock },
 RESOLVED: { label: "حل‌شده", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
 CLOSED: { label: "بسته‌شده", color: "bg-muted text-muted-foreground border-border", icon: AlertCircle },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
 LOW: { label: "کم", color: "bg-muted text-muted-foreground" },
 MEDIUM: { label: "متوسط", color: "bg-blue-500/10 text-blue-600" },
 HIGH: { label: "زیاد", color: "bg-amber-500/10 text-amber-600" },
 URGENT: { label: "فوری", color: "bg-red-500/10 text-red-600" },
};

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; icon: LucideIcon }> = {
 BILLING: { label: "مالی و صورتحساب", icon: FileText },
 TECHNICAL: { label: "فنی", icon: Code2 },
 FEATURE_REQUEST: { label: "درخواست امکانات", icon: Zap },
 BUG: { label: "گزارش باگ", icon: AlertCircle },
 OTHER: { label: "سایر", icon: MessageCircle },
};

// ============ کامپوننت اصلی ============
export function HelpView() {
 const { toast } = useToast();
 const [openFaq, setOpenFaq] = React.useState<number | null>(null);
 const [searchQuery, setSearchQuery] = React.useState("");
 const [activeTab, setActiveTab] = React.useState("faq");

 // وضعیت تیکت‌ها
 const [tickets, setTickets] = React.useState<Ticket[]>([]);
 const [loadingTickets, setLoadingTickets] = React.useState(false);
 const [createOpen, setCreateOpen] = React.useState(false);
 const [detailTicket, setDetailTicket] = React.useState<Ticket | null>(null);
 const [replyText, setReplyText] = React.useState("");
 const [sendingReply, setSendingReply] = React.useState(false);
 const [closingTicket, setClosingTicket] = React.useState(false);
 const [ticketFilter, setTicketFilter] = React.useState<"all" | TicketStatus>("all");

 // فرم ساخت تیکت
 const [form, setForm] = React.useState({
 subject: "",
 description: "",
 category: "TECHNICAL" as TicketCategory,
 priority: "MEDIUM" as TicketPriority,
 });
 const [creating, setCreating] = React.useState(false);

 // ============ پیوست فایل به پاسخ تیکت ============
 const MAX_FILES = 5;
 const MAX_FILE_SIZE = 5 * 1024 * 1024; // ۵ مگابایت
 const ACCEPTED_TYPES = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip";
 const [attachedFiles, setAttachedFiles] = React.useState<
 Array<{ name: string; size: number; type: string; dataUrl: string }>
 >([]);
 const fileInputRef = React.useRef<HTMLInputElement>(null);

 const formatFileSize = (bytes: number): string => {
 if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
 if (bytes < 1024 * 1024) return `${toPersianDigits((bytes / 1024).toFixed(0))} کیلوبایت`;
 return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
 };

 const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
 const fileList = e.target.files;
 if (!fileList || fileList.length === 0) return;

 const incoming = Array.from(fileList);
 const errors: string[] = [];
 const accepted: Array<{ name: string; size: number; type: string; dataUrl: string }> = [];

 for (const file of incoming) {
 if (attachedFiles.length + accepted.length >= MAX_FILES) {
 errors.push(`حداکثر ${toPersianDigits(MAX_FILES)} فایل قابل پیوست است.`);
 break;
 }
 if (file.size > MAX_FILE_SIZE) {
 errors.push(`«${file.name}» بزرگ‌تر از ۵ مگابایت است.`);
 continue;
 }
 // خواندن به‌صورت data URL (base64)
 const reader = new FileReader();
 reader.onload = () => {
 const dataUrl = typeof reader.result === "string"? reader.result: "";
 setAttachedFiles((prev) => [
...prev,
 {
 name: file.name,
 size: file.size,
 type: file.type || "application/octet-stream",
 dataUrl,
 },
 ]);
 };
 reader.onerror = () => {
 errors.push(`خواندن فایل «${file.name}» ناموفق بود.`);
 };
 reader.readAsDataURL(file);
 accepted.push({
 name: file.name,
 size: file.size,
 type: file.type,
 dataUrl: "",
 });
 }

 if (errors.length > 0) {
 toast({
 title: "برخی فایل‌ها رد شدند",
 description: errors.join(" "),
 variant: "destructive",
 });
 }

 // ریست مقدار input تا انتخاب مجدد فایل همان نام ممکن شود
 if (fileInputRef.current) {
 fileInputRef.current.value = "";
 }
 };

 const handleRemoveFile = (idx: number) => {
 setAttachedFiles((prev) => prev.filter((_, i) => i!== idx));
 };

 const filteredFaqs = FAQS.filter(
 (faq) => faq.q.includes(searchQuery) || faq.a.includes(searchQuery)
 );

 // بارگذاری تیکت‌ها
 const loadTickets = React.useCallback(async () => {
 setLoadingTickets(true);
 try {
 const res = await authFetch("/api/tickets");
 const data = await res.json();
 if (data.success) {
 setTickets(data.data || []);
 }
 } catch {
 /* ignore */
 } finally {
 setLoadingTickets(false);
 }
 }, []);

 React.useEffect(() => {
 if (activeTab === "tickets") {
 loadTickets();
 }
 }, [activeTab, loadTickets]);

 // ساخت تیکت جدید
 const handleCreateTicket = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!form.subject.trim() ||!form.description.trim()) {
 toast({
 title: "اطلاعات ناقص",
 description: "موضوع و توضیحات الزامی است.",
 variant: "destructive",
 });
 return;
 }
 setCreating(true);
 try {
 const res = await authFetch("/api/tickets", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(form),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) {
 throw new Error(data.error || "خطا در ثبت تیکت");
 }
 toast({
 title: "تیکت ثبت شد",
 description: "تیکت شما با موفقیت ثبت شد. تیم پشتیبانی به‌زودی پاسخ خواهد داد.",
 });
 setForm({
 subject: "",
 description: "",
 category: "TECHNICAL",
 priority: "MEDIUM",
 });
 setCreateOpen(false);
 loadTickets();
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error? err.message: "خطا در ثبت تیکت",
 variant: "destructive",
 });
 } finally {
 setCreating(false);
 }
 };

 // باز کردن جزئیات تیکت
 const openTicketDetail = async (ticket: Ticket) => {
 setDetailTicket(ticket);
 setReplyText("");
 // بارگذاری پیام‌ها
 try {
 const res = await authFetch(`/api/tickets/${ticket.id}`);
 const data = await res.json();
 if (data.success && data.data) {
 setDetailTicket({...ticket, messages: data.data.messages || [] });
 }
 } catch {
 /* ignore */
 }
 };

 // ارسال پاسخ کاربر
 const handleSendReply = async () => {
 if (!detailTicket ||!replyText.trim()) return;
 setSendingReply(true);
 try {
 // افزودن لیست فایل‌های پیوست به انتهای پیام
 let message = replyText.trim();
 if (attachedFiles.length > 0) {
 const attachmentList = attachedFiles
.map((f) => `[پیوست] ${f.name} (${formatFileSize(f.size)})`)
.join("\n");
 message = `${message}\n\n--- پیوست‌ها ---\n${attachmentList}`;
 }
 const res = await authFetch(`/api/tickets/${detailTicket.id}/user-reply`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ message }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) {
 throw new Error(data.error || "خطا در ارسال پاسخ");
 }
 // افزودن پیام جدید به لیست
 const newMessage: TicketMessage = {
 id: data.data?.id || Date.now().toString(),
 body: message,
 authorType: "USER",
 authorName: "شما",
 isAdmin: false,
 createdAt: new Date().toISOString(),
 };
 setDetailTicket({
...detailTicket,
 messages: [...(detailTicket.messages || []), newMessage],
 });
 setReplyText("");
 setAttachedFiles([]);
 toast({
 title: "پاسخ ارسال شد",
 description:
 attachedFiles.length > 0
? `پاسخ شما به همراه ${toPersianDigits(attachedFiles.length)} پیوست ثبت شد.`
: "پاسخ شما ثبت شد.",
 });
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error? err.message: "خطا در ارسال پاسخ",
 variant: "destructive",
 });
 } finally {
 setSendingReply(false);
 }
 };

 // بستن تیکت توسط کاربر
 const handleCloseTicket = async () => {
 if (!detailTicket) return;
 setClosingTicket(true);
 try {
 const res = await authFetch(`/api/tickets/${detailTicket.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: "CLOSED" }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) {
 throw new Error(data.error || "خطا در بستن تیکت");
 }
 setDetailTicket({...detailTicket, status: "CLOSED" });
 toast({ title: "تیکت بسته شد", description: "تیکت شما با موفقیت بسته شد." });
 loadTickets();
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error? err.message: "خطا در بستن تیکت",
 variant: "destructive",
 });
 } finally {
 setClosingTicket(false);
 }
 };

 // آمار تیکت‌ها
 const filteredTickets = React.useMemo(() => {
 if (ticketFilter === "all") return tickets;
 return tickets.filter((t) => t.status === ticketFilter);
 }, [tickets, ticketFilter]);

 const ticketStats = React.useMemo(() => {
 const open = tickets.filter((t) => t.status === "OPEN").length;
 const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS").length;
 const resolved = tickets.filter((t) => t.status === "RESOLVED").length;
 return { total: tickets.length, open, inProgress, resolved };
 }, [tickets]);

 return (
 <div className="space-y-6 p-6 max-w-5xl mx-auto">
 {/* هدر */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div className="space-y-1">
 <h1 className="text-2xl font-bold text-foreground">راهنما و پشتیبانی</h1>
 <p className="text-sm text-muted-foreground">
 مستندات، آموزش، سوالات متداول و تیکت‌های پشتیبانی
 </p>
 </div>
 <Button onClick={() => setCreateOpen(true)} className="shrink-0">
 <Plus className="h-4 w-4" />
 تیکت جدید
 </Button>
 </div>

 {/* تب‌ها */}
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <TabsList className="grid w-full grid-cols-2">
 <TabsTrigger value="faq" className="gap-1.5">
 <BookOpen className="h-4 w-4" />
 سوالات متداول
 </TabsTrigger>
 <TabsTrigger value="tickets" className="gap-1.5">
 <TicketIcon className="h-4 w-4" />
 تیکت‌های پشتیبانی
 {ticketStats.open + ticketStats.inProgress > 0 && (
 <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-[10px]">
 {toPersianDigits(ticketStats.open + ticketStats.inProgress)}
 </Badge>
 )}
 </TabsTrigger>
 </TabsList>

 {/* تب سوالات متداول */}
 <TabsContent value="faq" className="space-y-6 mt-4">
 {/* جستجو */}
 <div className="relative">
 <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 type="text"
 placeholder="جستجو در سوالات متداول..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pr-10"
 />
 </div>

 {/* سوالات متداول */}
 <div className="space-y-3">
 <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
 <MessageSquare className="h-5 w-5 text-primary" />
 سوالات متداول
 </h2>
 <div className="space-y-2">
 {filteredFaqs.map((faq, i) => (
 <div key={i} className="rounded-lg border border-border overflow-hidden">
 <button
 onClick={() => setOpenFaq(openFaq === i? null: i)}
 className="w-full flex items-center justify-between p-4 text-right hover:bg-muted/50 transition-colors"
 >
 <span className="font-medium text-foreground">{faq.q}</span>
 <ChevronDown
 className={`h-4 w-4 text-muted-foreground transition-transform ${
 openFaq === i? "rotate-180": ""
 }`}
 />
 </button>
 {openFaq === i && (
 <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/30">
 {faq.a}
 </div>
 )}
 </div>
 ))}
 {filteredFaqs.length === 0 && (
 <p className="text-center text-muted-foreground py-8">
 نتیجه‌ای یافت نشد
 </p>
 )}
 </div>
 </div>

 {/* منابع آموزشی */}
 <div className="space-y-3">
 <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
 <BookOpen className="h-5 w-5 text-primary" />
 منابع آموزشی
 </h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {RESOURCES.map((res, i) => (
 <a
 key={i}
 href={res.href}
 className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all group"
 >
 <res.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
 <div className="space-y-1">
 <div className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
 {res.title}
 <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
 </div>
 <p className="text-xs text-muted-foreground">{res.desc}</p>
 </div>
 </a>
 ))}
 </div>
 </div>

 {/* تماس با پشتیبانی */}
 <div className="space-y-3">
 <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
 <Headphones className="h-5 w-5 text-primary" />
 تماس با پشتیبانی
 </h2>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-card">
 <Phone className="h-6 w-6 text-primary" />
 <span className="text-sm font-medium text-foreground">تلفن پشتیبانی</span>
 <span className="text-sm text-muted-foreground" dir="ltr">071-32622493</span>
 </div>
 <div className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-card">
 <Mail className="h-6 w-6 text-primary" />
 <span className="text-sm font-medium text-foreground">ایمیل</span>
 <span className="text-sm text-muted-foreground">support@hoosh.nobatime.ir</span>
 </div>
 <div className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-card">
 <MessageSquare className="h-6 w-6 text-primary" />
 <span className="text-sm font-medium text-foreground">چت زنده</span>
 <span className="text-sm text-muted-foreground">شنبه تا پنجشنبه ۹ تا ۱۸</span>
 </div>
 </div>
 </div>

 {/* نکات کاربردی */}
 <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
 <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
 <Zap className="h-4 w-4 text-primary" />
 نکات کاربردی
 </h3>
 <ul className="space-y-1 text-sm text-muted-foreground">
 <li>- با فشردن <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">Ctrl+K</kbd> به Command Palette دسترسی سریع داشته باشید</li>
 <li>- با <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">Ctrl+/</kbd> جستجوی پیشرفته را باز کنید</li>
 <li>- از بخش «تنظیمات» تم روشن/تاریک را تغییر دهید</li>
 <li>- فاکتورها را با drag & drop در داشبورد سازماندهی کنید</li>
 </ul>
 </div>
 </TabsContent>

 {/* تب تیکت‌های پشتیبانی */}
 <TabsContent value="tickets" className="space-y-4 mt-4">
 {/* آمار */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
 <Inbox className="h-5 w-5 text-muted-foreground" />
 </div>
 <div>
 <p className="text-2xl font-bold text-foreground">{toPersianDigits(ticketStats.total)}</p>
 <p className="text-xs text-muted-foreground">کل تیکت‌ها</p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
 <CircleDot className="h-5 w-5 text-blue-600" />
 </div>
 <div>
 <p className="text-2xl font-bold text-foreground">{toPersianDigits(ticketStats.open)}</p>
 <p className="text-xs text-muted-foreground">باز</p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
 <Clock className="h-5 w-5 text-amber-600" />
 </div>
 <div>
 <p className="text-2xl font-bold text-foreground">{toPersianDigits(ticketStats.inProgress)}</p>
 <p className="text-xs text-muted-foreground">در حال بررسی</p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
 <CheckCircle2 className="h-5 w-5 text-emerald-600" />
 </div>
 <div>
 <p className="text-2xl font-bold text-foreground">{toPersianDigits(ticketStats.resolved)}</p>
 <p className="text-xs text-muted-foreground">حل‌شده</p>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* فیلتر وضعیت تیکت‌ها */}
 <div className="flex items-center gap-2 flex-wrap">
 {(["all", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((f) => (
 <Button
 key={f}
 variant={ticketFilter === f? "default": "outline"}
 size="sm"
 className="h-7 text-xs gap-1"
 onClick={() => setTicketFilter(f)}
 >
 {f === "all"? "همه": STATUS_CONFIG[f as TicketStatus]?.label || f}
 </Button>
 ))}
 </div>

 {/* لیست تیکت‌ها */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <TicketIcon className="h-4 w-4 text-primary" />
 تیکت‌های شما
 </CardTitle>
 <Button variant="ghost" size="sm" onClick={loadTickets} disabled={loadingTickets}>
 <RotateCw className={`h-4 w-4 ${loadingTickets? "animate-spin": ""}`} />
 </Button>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {loadingTickets? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): filteredTickets.length === 0? (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-3">
 <Inbox className="h-7 w-7 text-muted-foreground" />
 </div>
 <p className="text-sm font-medium text-foreground">تیکتی یافت نشد</p>
 <p className="text-xs text-muted-foreground mt-1">
 فیلتر را تغییر دهید یا تیکت جدید ثبت کنید
 </p>
 </div>
 ): (
 <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
 {filteredTickets.map((ticket) => {
 const status = (ticket.status as TicketStatus) || "OPEN";
 const priority = (ticket.priority as TicketPriority) || "MEDIUM";
 const category = (ticket.category as TicketCategory) || "OTHER";
 const StatusIcon = STATUS_CONFIG[status]?.icon || CircleDot;
 return (
 <button
 key={ticket.id}
 onClick={() => openTicketDetail(ticket)}
 className="w-full p-4 text-right hover:bg-muted/50 transition-colors flex items-start gap-3"
 >
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${STATUS_CONFIG[status]?.color}`}>
 <StatusIcon className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <p className="font-medium text-foreground truncate">{ticket.subject}</p>
 </div>
 <div className="flex flex-wrap items-center gap-1.5">
 <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${PRIORITY_CONFIG[priority]?.color}`}>
 اولویت: {PRIORITY_CONFIG[priority]?.label}
 </Badge>
 <Badge variant="outline" className="text-[10px] px-1.5 py-0">
 {CATEGORY_CONFIG[category]?.label}
 </Badge>
 <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_CONFIG[status]?.color}`}>
 {STATUS_CONFIG[status]?.label}
 </Badge>
 <span className="text-[10px] text-muted-foreground">
 {new Date(ticket.createdAt).toLocaleDateString("fa-IR")}
 </span>
 </div>
 </div>
 </button>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>

 {/* مودال ساخت تیکت جدید */}
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Plus className="h-5 w-5 text-primary" />
 تیکت پشتیبانی جدید
 </DialogTitle>
 <DialogDescription>
 تیم پشتیبانی در اسرع وقت به تیکت شما پاسخ خواهد داد.
 </DialogDescription>
 </DialogHeader>
 <form onSubmit={handleCreateTicket} className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="ticket-subject">موضوع *</Label>
 <Input
 id="ticket-subject"
 value={form.subject}
 onChange={(e) => setForm({...form, subject: e.target.value })}
 placeholder="مثلاً: مشکل در صدور فاکتور"
 disabled={creating}
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label>دسته‌بندی</Label>
 <Select
 value={form.category}
 onValueChange={(v) => setForm({...form, category: v as TicketCategory })}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
 <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>اولویت</Label>
 <Select
 value={form.priority}
 onValueChange={(v) => setForm({...form, priority: v as TicketPriority })}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
 <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="space-y-2">
 <Label htmlFor="ticket-desc">توضیحات *</Label>
 <Textarea
 id="ticket-desc"
 value={form.description}
 onChange={(e) => setForm({...form, description: e.target.value })}
 placeholder="مشکل یا درخواست خود را به‌طور کامل توضیح دهید..."
 rows={5}
 disabled={creating}
 />
 </div>
 <DialogFooter>
 <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
 انصراف
 </Button>
 <Button type="submit" disabled={creating}>
 {creating? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ارسال...
 </>
 ): (
 <>
 <Send className="h-4 w-4" />
 ثبت تیکت
 </>
 )}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>

 {/* مودال جزئیات تیکت */}
 <Dialog open={!!detailTicket} onOpenChange={(o) =>!o && setDetailTicket(null)}>
 <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col">
 {detailTicket && (
 <>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-lg">
 <MessageCircle className="h-5 w-5 text-primary" />
 {detailTicket.subject}
 </DialogTitle>
 <DialogDescription className="flex flex-wrap items-center gap-2">
 {(() => {
 const status = (detailTicket.status as TicketStatus) || "OPEN";
 const priority = (detailTicket.priority as TicketPriority) || "MEDIUM";
 const category = (detailTicket.category as TicketCategory) || "OTHER";
 return (
 <>
 <Badge variant="outline" className={`text-[10px] ${STATUS_CONFIG[status]?.color}`}>
 {STATUS_CONFIG[status]?.label}
 </Badge>
 <Badge variant="outline" className={`text-[10px] ${PRIORITY_CONFIG[priority]?.color}`}>
 اولویت: {PRIORITY_CONFIG[priority]?.label}
 </Badge>
 <Badge variant="outline" className="text-[10px]">
 {CATEGORY_CONFIG[category]?.label}
 </Badge>
 <span className="text-[10px]">
 {new Date(detailTicket.createdAt).toLocaleDateString("fa-IR")}
 </span>
 </>
 );
 })()}
 </DialogDescription>
 </DialogHeader>

 {/* مکالمه */}
 <ScrollArea className="flex-1 min-h-0 max-h-[400px] -mx-2 px-2">
 <div className="space-y-3 py-2">
 {/* پیام اول (توضیحات تیکت) */}
 <div className="flex gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
 <MessageSquare className="h-4 w-4 text-primary" />
 </div>
 <div className="flex-1 rounded-lg bg-muted/50 p-3">
 <div className="flex items-center justify-between mb-1">
 <span className="text-xs font-medium text-foreground">شما</span>
 <span className="text-[10px] text-muted-foreground">
 {new Date(detailTicket.createdAt).toLocaleString("fa-IR")}
 </span>
 </div>
 <p className="text-sm text-foreground whitespace-pre-wrap">{detailTicket.description}</p>
 </div>
 </div>

 {/* سایر پیام‌ها */}
 {(detailTicket.messages || []).slice(1).map((msg) => (
 <div
 key={msg.id}
 className={`flex gap-2 ${msg.isAdmin? "flex-row": "flex-row"}`}
 >
 <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
 msg.isAdmin? "bg-emerald-500/10": "bg-primary/10"
 }`}>
 {msg.isAdmin? (
 <Headphones className="h-4 w-4 text-emerald-600" />
 ): (
 <MessageSquare className="h-4 w-4 text-primary" />
 )}
 </div>
 <div className={`flex-1 rounded-lg p-3 ${
 msg.isAdmin? "bg-emerald-500/5 border border-emerald-500/20": "bg-muted/50"
 }`}>
 <div className="flex items-center justify-between mb-1">
 <span className="text-xs font-medium text-foreground flex items-center gap-1">
 {msg.isAdmin? "پشتیبانی": "شما"}
 {msg.isAdmin && <Badge variant="secondary" className="text-[9px] px-1 py-0">ادمین</Badge>}
 </span>
 <span className="text-[10px] text-muted-foreground">
 {new Date(msg.createdAt).toLocaleString("fa-IR")}
 </span>
 </div>
 <p className="text-sm text-foreground whitespace-pre-wrap">{msg.body}</p>
 </div>
 </div>
 ))}

 {(!detailTicket.messages || detailTicket.messages.length <= 1) && (
 <div className="text-center py-4">
 <p className="text-xs text-muted-foreground">
 در انتظار پاسخ تیم پشتیبانی...
 </p>
 </div>
 )}
 </div>
 </ScrollArea>

 {/* فرم پاسخ */}
 {detailTicket.status!== "CLOSED" && (
 <div className="border-t border-border pt-3 space-y-2">
 {/* پیوست فایل */}
 <div className="space-y-2">
 <input
 ref={fileInputRef}
 type="file"
 multiple
 accept={ACCEPTED_TYPES}
 onChange={handleFilePick}
 className="hidden"
 aria-hidden="true"
 />
 <div className="flex flex-wrap items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-xs gap-1"
 onClick={() => fileInputRef.current?.click()}
 disabled={sendingReply || attachedFiles.length >= MAX_FILES}
 >
 <Paperclip className="h-3.5 w-3.5" />
 پیوست فایل
 </Button>
 <span className="text-[10px] text-muted-foreground">
 {toPersianDigits(attachedFiles.length)} / {toPersianDigits(MAX_FILES)} فایل
 (حداکثر ۵ مگابایت هر کدام)
 </span>
 </div>

 {attachedFiles.length > 0 && (
 <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-2">
 {attachedFiles.map((file, idx) => (
 <div
 key={`${file.name}-${idx}`}
 className="flex items-center gap-2 rounded-md bg-background/80 px-2 py-1.5"
 >
 <FileIcon className="h-3.5 w-3.5 text-primary shrink-0" />
 <span
 className="text-xs truncate flex-1"
 title={file.name}
 dir="ltr"
 >
 {file.name}
 </span>
 <span className="text-[10px] text-muted-foreground tnum shrink-0">
 {formatFileSize(file.size)}
 </span>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
 onClick={() => handleRemoveFile(idx)}
 disabled={sendingReply}
 aria-label={`حذف فایل ${file.name}`}
 >
 <X className="h-3 w-3" />
 </Button>
 </div>
 ))}
 </div>
 )}
 </div>
 <Textarea
 value={replyText}
 onChange={(e) => setReplyText(e.target.value)}
 placeholder="پاسخ خود را بنویسید..."
 rows={3}
 disabled={sendingReply}
 />
 <div className="flex justify-end gap-2">
 <Button
 onClick={handleSendReply}
 disabled={sendingReply ||!replyText.trim()}
 size="sm"
 >
 {sendingReply? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ارسال...
 </>
 ): (
 <>
 <Send className="h-4 w-4" />
 ارسال پاسخ
 </>
 )}
 </Button>
 <Button
 variant="outline"
 onClick={handleCloseTicket}
 disabled={closingTicket}
 size="sm"
 className="text-destructive hover:text-destructive"
 >
 {closingTicket? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 بستن تیکت
 </Button>
 </div>
 </div>
 )}
 {detailTicket.status === "CLOSED" && (
 <div className="border-t border-border pt-3 text-center">
 <Badge className="bg-muted text-muted-foreground">
 <CheckCircle2 className="h-3 w-3 ml-1" />
 این تیکت بسته شده است
 </Badge>
 </div>
 )}
 </>
 )}
 </DialogContent>
 </Dialog>
 </div>
 );
}
