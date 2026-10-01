"use client";

/**
 * VendorPortalModule — پورتال تأمین‌کنندگان
 *
 * - فهرست لینک‌های فعال برای تأمین‌کنندگان (SUPPLIER / BOTH)
 * - تولید لینک امن برای ورود تأمین‌کننده به پورتال
 * - پیش‌نمایش: فاکتورهای خرید، صورت‌حساب بستانکار، وضعیت پرداخت‌ها
 * - ابطال / فعال‌سازی لینک
 *
 * زیرساخت توکن‌محور را با پورتال مشتریان به اشتراک می‌گذارد
 * (CustomerPortalAccess + /api/portal/* APIها).
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Truck,
 Link2,
 ShieldCheck,
 Copy,
 Check,
 Trash2,
 Eye,
 Loader2,
 RefreshCw,
 Clock,
 FileText,
 Wallet,
 Plus,
 X,
 Send,
 type LucideIcon,
} from "lucide-react";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ux/empty-state";
import { formatNumber, toPersianDigits, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface Party {
 id: string;
 name: string;
 code: string;
 mobile: string | null;
 email: string | null;
 type: string;
}

interface PortalLink {
 id: string;
 partyId: string;
 partyName: string;
 partyCode: string;
 partyMobile: string | null;
 partyEmail: string | null;
 isActive: boolean;
 expiresAt: string | null;
 lastAccessAt: string | null;
 createdAt: string;
}

interface VendorInvoice {
 id: string;
 number: string;
 date: string;
 dueDate: string | null;
 total: number;
 paidAmount: number;
 balance: number;
 status: string;
}

interface VendorStatement {
 invoices: VendorInvoice[];
 totalPayable: number;
 totalPaid: number;
 totalOverdue: number;
 partyName: string;
}

export function VendorPortalModule() {
 const { toast } = useToast();
 const [links, setLinks] = React.useState<PortalLink[]>([]);
 const [parties, setParties] = React.useState<Party[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [genOpen, setGenOpen] = React.useState(false);
 const [selectedPartyId, setSelectedPartyId] = React.useState<string>("");
 const [expiresInDays, setExpiresInDays] = React.useState("90");
 const [generating, setGenerating] = React.useState(false);
 const [newToken, setNewToken] = React.useState<{
 token: string;
 url: string;
 partyName: string;
 } | null>(null);
 const [copied, setCopied] = React.useState(false);
 const [preview, setPreview] = React.useState<PortalLink | null>(null);

 const load = React.useCallback(async () => {
 try {
 setLoading(true);
 const [linksRes, partiesRes] = await Promise.all([
 authFetch("/api/portal/links", { cache: "no-store" }),
 // SUPPLIER و BOTH پورتال می‌شوند
 authFetch("/api/parties?type=SUPPLIER&limit=200", { cache: "no-store" }),
 ]);
 const linksJson = await linksRes.json();
 const partiesJson = await partiesRes.json();
 if (linksJson.success) {
 // فقط لینک‌هایی که مربوط به تأمین‌کنندگان هستند
 const supplierIds = new Set(
 (partiesJson.data?? []).map((p: Party) => p.id)
 );
 setLinks(
 (linksJson.data?? []).filter(
 (l: PortalLink) => supplierIds.has(l.partyId)
 )
 );
 }
 if (partiesJson.success) setParties(partiesJson.data);
 } catch {
 toast({ title: "خطا", description: "بارگذاری لینک‌های پورتال ناموفق بود", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [toast]);

 React.useEffect(() => {
 load();
 }, [load]);

 const handleGenerate = async () => {
 if (!selectedPartyId) {
 toast({ title: "خطا", description: "یک تأمین‌کننده انتخاب کنید", variant: "destructive" });
 return;
 }
 try {
 setGenerating(true);
 const res = await authFetch("/api/portal/generate-link", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 partyId: selectedPartyId,
 expiresInDays: Number(expiresInDays),
 }),
 });
 const json = await res.json();
 if (json.success) {
 setNewToken({
 token: json.data.token,
 url: json.data.url,
 partyName: json.data.partyName,
 });
 setGenOpen(false);
 toast({
 title: "لینک پورتال تأمین‌کننده تولید شد",
 description: "این لینک را کپی و برای تأمین‌کننده ارسال کنید — فقط یک‌بار نمایش داده می‌شود.",
 });
 await load();
 } else {
 toast({ title: "خطا", description: json.error?? "تولید ناموفق", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setGenerating(false);
 }
 };

 const handleRevoke = async (id: string) => {
 if (!confirm("این لینک ابطال شود؟ تأمین‌کننده دیگر به پورتال دسترسی نخواهد داشت.")) return;
 try {
 const res = await authFetch(`/api/portal/links/${id}`, { method: "DELETE" });
 const json = await res.json();
 if (json.success) {
 toast({ title: "لینک ابطال شد" });
 await load();
 } else {
 toast({ title: "خطا", description: json.error, variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 }
 };

 const handleToggleActive = async (id: string, current: boolean) => {
 try {
 const res = await authFetch(`/api/portal/links/${id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isActive:!current }),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title:!current? "لینک فعال شد": "لینک غیرفعال شد" });
 await load();
 } else {
 toast({ title: "خطا", description: json.error, variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 }
 };

 const handleCopyToken = async () => {
 if (!newToken) return;
 try {
 const fullUrl = `${window.location.origin}${newToken.url}`;
 await navigator.clipboard.writeText(fullUrl);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 toast({ title: "لینک کپی شد", description: "آماده‌ی ارسال به تأمین‌کننده" });
 } catch {
 toast({ title: "خطا", description: "کپی ممکن نشد", variant: "destructive" });
 }
 };

 const handleShareViaWhatsApp = () => {
 if (!newToken) return;
 const fullUrl = `${window.location.origin}${newToken.url}`;
 const text = encodeURIComponent(
 `سلام ${newToken.partyName}،\nبه پورتال تأمین‌کنندگان دسترسی دارید:\n${fullUrl}\n— هوش`
 );
 window.open(`https://wa.me/?text=${text}`, "_blank");
 };

 const activeCount = links.filter((l) => l.isActive).length;
 const expiredCount = links.filter(
 (l) => l.expiresAt && new Date(l.expiresAt) < new Date()
 ).length;

 return (
 <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
 <Truck className="h-5 w-5 text-primary" />
 پورتال تأمین‌کنندگان
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 به تأمین‌کنندگان خود اجازه دهید فاکتورهای خرید و وضعیت پرداخت را آنلاین مشاهده کنند.
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
 <RefreshCw className="h-4 w-4" />
 به‌روزرسانی
 </Button>
 <Button
 size="sm"
 className="gap-1.5"
 onClick={() => {
 setSelectedPartyId("");
 setExpiresInDays("90");
 setGenOpen(true);
 }}
 >
 <Plus className="h-4 w-4" />
 لینک جدید
 </Button>
 </div>
 </div>

 {/* Stat cards */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={Truck}
 label="تأمین‌کنندگان"
 value={parties.length}
 color="primary"
 />
 <StatCard
 icon={Link2}
 label="لینک‌های فعال"
 value={activeCount}
 color="success"
 />
 <StatCard
 icon={Clock}
 label="منقضی‌شده"
 value={expiredCount}
 color="warning"
 />
 <StatCard
 icon={ShieldCheck}
 label="کل لینک‌ها"
 value={links.length}
 color="info"
 />
 </div>

 {/* Links table */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">لینک‌های فعال پورتال</CardTitle>
 <CardDescription className="text-xs">
 هر لینک به‌صورت رمزنگاری‌شده تولید می‌شود و فقط با توکن قابل دسترسی است.
 </CardDescription>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): links.length === 0? (
 <EmptyState
 icon={Truck}
 title="هنوز لینکی ساخته نشده"
 description="برای اولین تأمین‌کننده، روی «لینک جدید» بزنید."
 action={
 <Button
 size="sm"
 className="gap-1.5"
 onClick={() => setGenOpen(true)}
 >
 <Plus className="h-4 w-4" />
 ساخت لینک
 </Button>
 }
 />
 ): (
 <div className="max-h-[460px] overflow-y-auto -mx-2 sm:-mx-3 styled-scroll">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>تأمین‌کننده</TableHead>
 <TableHead className="hidden md:table-cell">کد</TableHead>
 <TableHead className="hidden lg:table-cell">موبایل</TableHead>
 <TableHead>وضعیت</TableHead>
 <TableHead className="hidden md:table-cell">انقضا</TableHead>
 <TableHead className="hidden lg:table-cell">آخرین دسترسی</TableHead>
 <TableHead className="text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {links.map((l) => {
 const isExpired = l.expiresAt && new Date(l.expiresAt) < new Date();
 return (
 <TableRow key={l.id}>
 <TableCell className="font-medium">{l.partyName}</TableCell>
 <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
 {toPersianDigits(l.partyCode)}
 </TableCell>
 <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
 {l.partyMobile? toPersianDigits(l.partyMobile): "—"}
 </TableCell>
 <TableCell>
 {l.isActive &&!isExpired? (
 <Badge className="bg-success/15 text-success border-success/30">فعال</Badge>
 ): isExpired? (
 <Badge className="bg-warning/15 text-warning border-warning/30">منقضی</Badge>
 ): (
 <Badge variant="secondary">غیرفعال</Badge>
 )}
 </TableCell>
 <TableCell className="hidden md:table-cell text-xs">
 {l.expiresAt? toJalali(new Date(l.expiresAt)): "بدون انقضا"}
 </TableCell>
 <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
 {l.lastAccessAt? toJalali(new Date(l.lastAccessAt)): "بدون دسترسی"}
 </TableCell>
 <TableCell className="text-end">
 <div className="flex gap-1 justify-end">
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0"
 onClick={() => setPreview(l)}
 title="پیش‌نمایش"
 >
 <Eye className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0"
 onClick={() => handleToggleActive(l.id, l.isActive)}
 title={l.isActive? "غیرفعال‌کردن": "فعال‌کردن"}
 >
 <ShieldCheck className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0 text-destructive"
 onClick={() => handleRevoke(l.id)}
 title="ابطال"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Generate dialog */}
 <Dialog open={genOpen} onOpenChange={setGenOpen}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Link2 className="h-4 w-4 text-primary" />
 تولید لینک پورتال تأمین‌کننده
 </DialogTitle>
 <DialogDescription>
 یک لینک امن یکتا برای دسترسی تأمین‌کننده به پورتال ساخته می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="space-y-1.5">
 <Label className="text-xs">تأمین‌کننده</Label>
 <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
 <SelectTrigger className="h-10">
 <SelectValue placeholder="انتخاب تأمین‌کننده..." />
 </SelectTrigger>
 <SelectContent>
 {parties.length === 0? (
 <div className="px-3 py-2 text-xs text-muted-foreground">
 هیچ تأمین‌کننده‌ای ثبت نشده. ابتدا در ماژول «خرید و فروش» یک طرف‌حساب با نوع «تأمین‌کننده» بسازید.
 </div>
 ): (
 parties.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.name} {p.code? `(${toPersianDigits(p.code)})`: ""}
 </SelectItem>
 ))
 )}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">مدت اعتبار (روز)</Label>
 <Input
 type="number"
 value={expiresInDays}
 onChange={(e) => setExpiresInDays(e.target.value)}
 min={1}
 max={365}
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setGenOpen(false)}>
 انصراف
 </Button>
 <Button
 onClick={handleGenerate}
 disabled={generating ||!selectedPartyId}
 className="gap-1.5"
 >
 {generating? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Link2 className="h-4 w-4" />
 )}
 تولید لینک
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* New token dialog */}
 <Dialog open={!!newToken} onOpenChange={(o) =>!o && setNewToken(null)}>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-success">
 <Check className="h-5 w-5" />
 لینک پورتال ساخته شد
 </DialogTitle>
 <DialogDescription>
 این لینک فقط یک‌بار نمایش داده می‌شود. آن را کپی و برای{" "}
 <span className="font-medium text-foreground">{newToken?.partyName}</span> ارسال کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <div className="flex items-center justify-between gap-2">
 <code className="text-xs break-all text-foreground flex-1">
 {newToken? `${window.location.origin}${newToken.url}`: ""}
 </code>
 <Button
 size="sm"
 variant="outline"
 className="shrink-0 gap-1.5"
 onClick={handleCopyToken}
 >
 {copied? (
 <Check className="h-3.5 w-3.5 text-success" />
 ): (
 <Copy className="h-3.5 w-3.5" />
 )}
 کپی
 </Button>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5"
 onClick={handleShareViaWhatsApp}
 >
 <Send className="h-3.5 w-3.5" />
 ارسال در واتساپ
 </Button>
 </div>
 <div className="rounded-md bg-warning/10 border border-warning/30 p-2.5 text-xs text-warning-foreground">
 <p className="flex items-start gap-2">
 <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
 <span>
 این لینک حاوی توکن یکتا و رمزنگاری‌شده است. هر کس با این لینک می‌تواند به اطلاعات مالی تأمین‌کننده دسترسی داشته باشد — فقط از طریق کانال‌های امن ارسال کنید.
 </span>
 </p>
 </div>
 </div>
 <DialogFooter>
 <Button onClick={() => setNewToken(null)} className="gap-1.5">
 <X className="h-4 w-4" />
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Preview dialog */}
 <AnimatePresence>
 {preview && (
 <VendorPreviewDialog link={preview} onClose={() => setPreview(null)} />
 )}
 </AnimatePresence>
 </div>
 );
}

function StatCard({
 icon,
 label,
 value,
 color,
}: {
 icon: LucideIcon;
 label: string;
 value: number;
 color: "primary" | "success" | "warning" | "info";
}) {
 const colors: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
 info: "bg-info/10 text-info",
 };
 const Icon = icon;
 return (
 <Card>
 <CardContent className="p-3 sm:p-4">
 <div className="flex items-center justify-between">
 <span className="text-xs text-muted-foreground">{label}</span>
 <div className={`rounded-md p-1.5 ${colors[color]}`}><Icon className="h-4 w-4" /></div>
 </div>
 <div className="mt-2 text-2xl font-bold text-foreground">
 {toPersianDigits(value.toLocaleString("fa-IR"))}
 </div>
 </CardContent>
 </Card>
 );
}

function VendorPreviewDialog({
 link,
 onClose,
}: {
 link: PortalLink;
 onClose: () => void;
}) {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(true);
 const [data, setData] = React.useState<VendorStatement | null>(null);

 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 setLoading(true);
 // از طریق verify endpoint توکن را داریم؛ اما در پنل مدیریت، مستقیماً
 // فاکتورهای خرید (PURCHASE) طرف‌حساب را واکشی می‌کنیم.
 const res = await authFetch(
 `/api/accounting/invoices?partyId=${link.partyId}&type=PURCHASE&limit=100`,
 { cache: "no-store" }
 );
 const json = await res.json();
 if (cancelled) return;
 const invoices: VendorInvoice[] = (json?.data?? []).map(
 (inv: {
 id: string;
 number: string | number;
 date: string;
 dueDate?: string | null;
 totalAmount?: number;
 total?: number;
 paidAmount?: number;
 status?: string;
 }) => ({
 id: inv.id,
 number: String(inv.number?? "—"),
 date: inv.date,
 dueDate: inv.dueDate?? null,
 total: Number(inv.totalAmount?? inv.total?? 0),
 paidAmount: Number(inv.paidAmount?? 0),
 balance:
 Number(inv.totalAmount?? inv.total?? 0) -
 Number(inv.paidAmount?? 0),
 status: inv.status?? "ISSUED",
 })
 );
 const now = new Date();
 const totalPayable = invoices.reduce((s, i) => s + i.balance, 0);
 const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
 const totalOverdue = invoices
.filter((i) => i.dueDate && new Date(i.dueDate) < now && i.balance > 0)
.reduce((s, i) => s + i.balance, 0);
 setData({
 invoices,
 totalPayable,
 totalPaid,
 totalOverdue,
 partyName: link.partyName,
 });
 } catch {
 if (!cancelled) {
 toast({
 title: "خطا",
 description: "دریافت داده ناموفق بود",
 variant: "destructive",
 });
 }
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [link, toast]);

 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
 onClick={onClose}
 >
 <motion.div
 initial={{ scale: 0.95, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0.95, opacity: 0 }}
 className="bg-background rounded-xl border border-border shadow-2xl max-w-3xl w-full max-h-[85dvh] overflow-hidden flex flex-col"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="px-5 py-4 border-b border-border flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Truck className="h-5 w-5 text-primary" />
 <div>
 <h3 className="font-bold text-foreground">پیش‌نمایش پورتال</h3>
 <p className="text-xs text-muted-foreground">{link.partyName}</p>
 </div>
 </div>
 <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0">
 <X className="h-4 w-4" />
 </Button>
 </div>
 <div className="overflow-y-auto p-5 styled-scroll">
 {loading? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ):!data? (
 <p className="text-sm text-muted-foreground text-center py-8">
 داده‌ای موجود نیست
 </p>
 ): (
 <div className="space-y-5">
 {/* Summary */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <SummaryCard
 icon={Wallet}
 label="بستانکار (قابل پرداخت)"
 value={data.totalPayable}
 color="text-destructive"
 />
 <SummaryCard
 icon={Check}
 label="پرداخت‌شده"
 value={data.totalPaid}
 color="text-success"
 />
 <SummaryCard
 icon={Clock}
 label="سررسید گذشته"
 value={data.totalOverdue}
 color="text-warning"
 />
 </div>
 {/* Invoices table */}
 <div>
 <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
 <FileText className="h-4 w-4" />
 فاکتورهای خرید ({toPersianDigits(data.invoices.length)})
 </h4>
 {data.invoices.length === 0? (
 <p className="text-xs text-muted-foreground py-6 text-center bg-muted/20 rounded-lg">
 هنوز فاکتور خریدی ثبت نشده
 </p>
 ): (
 <div className="max-h-72 overflow-y-auto border border-border rounded-lg styled-scroll">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-xs">شماره</TableHead>
 <TableHead className="text-xs">تاریخ</TableHead>
 <TableHead className="text-xs">سررسید</TableHead>
 <TableHead className="text-xs text-end">مبلغ</TableHead>
 <TableHead className="text-xs text-end">مانده</TableHead>
 <TableHead className="text-xs">وضعیت</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {data.invoices.map((inv) => {
 const overdue =
 inv.dueDate &&
 new Date(inv.dueDate) < new Date() &&
 inv.balance > 0;
 return (
 <TableRow key={inv.id}>
 <TableCell className="text-xs font-medium">
 {toPersianDigits(inv.number)}
 </TableCell>
 <TableCell className="text-xs">
 {inv.date? toJalali(new Date(inv.date)): "—"}
 </TableCell>
 <TableCell className="text-xs">
 {inv.dueDate? toJalali(new Date(inv.dueDate)): "—"}
 </TableCell>
 <TableCell className="text-xs text-end">
 {formatNumber(inv.total)}
 </TableCell>
 <TableCell className="text-xs text-end font-medium">
 {formatNumber(inv.balance)}
 </TableCell>
 <TableCell>
 {inv.balance <= 0? (
 <Badge className="bg-success/15 text-success border-success/30 text-[10px]">
 تسویه
 </Badge>
 ): overdue? (
 <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">
 سررسید گذشته
 </Badge>
 ): (
 <Badge variant="secondary" className="text-[10px]">
 باز
 </Badge>
 )}
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 </motion.div>
 </motion.div>
 );
}

function SummaryCard({
 icon,
 label,
 value,
 color,
}: {
 icon: LucideIcon;
 label: string;
 value: number;
 color: string;
}) {
 const Icon = icon;
 return (
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
 <Icon className="h-4 w-4" />
 {label}
 </div>
 <div className={`mt-1.5 text-lg font-bold ${color}`}>
 {formatNumber(value)}
 <span className="text-xs ms-1 text-muted-foreground">ریال</span>
 </div>
 </div>
 );
}
