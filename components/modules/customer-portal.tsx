"use client";

/**
 * CustomerPortalModule — پورتال مشتریان
 *
 * - فهرست لینک‌های فعال/منقضی
 * - تولید لینک امن (token-based) برای هر مشتری
 * - ابطال / فعال‌سازی لینک
 * - پیش‌نمایش آنچه مشتری در پورتال می‌بیند: فاکتورها، صورت‌حساب، پرداخت آنلاین
 *
 * نکته: توکن خام فقط یک‌بار هنگام تولید نمایش داده می‌شود (هش آن در DB ذخیره می‌شود).
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Link2,
 Users,
 ShieldCheck,
 Copy,
 Check,
 Trash2,
 Eye,
 Loader2,
 RefreshCw,
 ExternalLink,
 Clock,
 FileText,
 Wallet,
 Plus,
 X,
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

interface PortalInvoice {
 id: string;
 number: string;
 date: string;
 dueDate: string | null;
 total: number;
 paidAmount: number;
 balance: number;
 status: string;
 description: string | null;
}

interface PortalStatementLine {
 date: string;
 description: string;
 reference: string;
 debit: number;
 credit: number;
 balanceAfter: number;
}

export function CustomerPortalModule() {
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
 authFetch("/api/parties?type=CUSTOMER&limit=200", { cache: "no-store" }),
 ]);
 const linksJson = await linksRes.json();
 const partiesJson = await partiesRes.json();
 if (linksJson.success) setLinks(linksJson.data);
 if (partiesJson.success) setParties(partiesJson.data);
 } catch {
 toast({ title: "خطا", description: "بارگذاری لیست لینک‌ها ناموفق بود", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [toast]);

 React.useEffect(() => {
 load();
 }, [load]);

 const handleGenerate = async () => {
 if (!selectedPartyId) {
 toast({ title: "خطا", description: "یک مشتری انتخاب کنید", variant: "destructive" });
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
 title: "لینک پورتال تولید شد",
 description: "این لینک را کپی و برای مشتری ارسال کنید — فقط یک‌بار نمایش داده می‌شود.",
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
 if (!confirm("این لینک ابطال شود؟ مشتری دیگر به پورتال دسترسی نخواهد داشت.")) return;
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

 const handleToggle = async (link: PortalLink) => {
 try {
 const res = await authFetch(`/api/portal/links/${link.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isActive:!link.isActive }),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: link.isActive? "لینک غیرفعال شد": "لینک فعال شد" });
 await load();
 } else {
 toast({ title: "خطا", description: json.error?? "عملیات ناموفق بود", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 }
 };

 const copyToClipboard = async (text: string) => {
 try {
 await navigator.clipboard.writeText(text);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 } catch {
 toast({ title: "کپی ناموفق", variant: "destructive" });
 }
 };

 const stats = React.useMemo(() => {
 const active = links.filter((l) => l.isActive);
 const expired = active.filter(
 (l) => l.expiresAt && new Date(l.expiresAt) < new Date()
 );
 const accessed = active.filter((l) => l.lastAccessAt);
 return {
 total: links.length,
 active: active.length,
 expired: expired.length,
 accessed: accessed.length,
 };
 }, [links]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Link2 className="h-5 w-5 text-primary" />
 پورتال مشتریان
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 تولید لینک امن برای مشتریان جهت مشاهده فاکتورها، صورت‌حساب و پرداخت آنلاین
 </p>
 </div>
 <Button onClick={() => setGenOpen(true)} className="gap-1.5">
 <Plus className="h-4 w-4" />
 تولید لینک جدید
 </Button>
 </div>

 {/* آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard icon={Link2} label="کل لینک‌ها" value={toPersianDigits(stats.total)} color="text-primary" />
 <StatCard icon={ShieldCheck} label="لینک‌های فعال" value={toPersianDigits(stats.active)} color="text-success" />
 <StatCard icon={Clock} label="منقضی شده" value={toPersianDigits(stats.expired)} color="text-destructive" />
 <StatCard icon={Eye} label="استفاده شده" value={toPersianDigits(stats.accessed)} color="text-info" />
 </div>

 {/* جدول لینک‌ها */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">لینک‌های پورتال</CardTitle>
 <Button variant="ghost" size="sm" onClick={load} className="gap-1">
 <RefreshCw className="h-3.5 w-3.5" />
 به‌روزرسانی
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex justify-center py-10">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): links.length === 0? (
 <EmptyState
 icon={Link2}
 title="هنوز لینکی تولید نشده"
 description="با کلیک روی «تولید لینک جدید»، اولین لینک پورتال را برای مشتری خود بسازید."
 action={
 <Button onClick={() => setGenOpen(true)} className="gap-1.5">
 <Plus className="h-4 w-4" />
 تولید لینک
 </Button>
 }
 />
 ): (
 <div className="max-h-[480px] overflow-y-auto -mx-2">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>مشتری</TableHead>
 <TableHead className="hidden md:table-cell">تماس</TableHead>
 <TableHead>وضعیت</TableHead>
 <TableHead className="hidden lg:table-cell">انقضا</TableHead>
 <TableHead className="hidden lg:table-cell">آخرین دسترسی</TableHead>
 <TableHead className="text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {links.map((l) => {
 const isExpired =
 l.expiresAt && new Date(l.expiresAt) < new Date();
 const statusBadge =!l.isActive? (
 <Badge variant="outline">غیرفعال</Badge>
 ): isExpired? (
 <Badge variant="destructive">منقضی</Badge>
 ): (
 <Badge className="bg-success/10 text-success">فعال</Badge>
 );
 return (
 <TableRow key={l.id}>
 <TableCell>
 <div className="font-medium">{l.partyName}</div>
 <div className="text-xs text-muted-foreground">کد: {toPersianDigits(l.partyCode)}</div>
 </TableCell>
 <TableCell className="hidden md:table-cell text-xs">
 {l.partyMobile && <div>{toPersianDigits(l.partyMobile)}</div>}
 {l.partyEmail && <div className="text-muted-foreground">{l.partyEmail}</div>}
 </TableCell>
 <TableCell>{statusBadge}</TableCell>
 <TableCell className="hidden lg:table-cell text-xs">
 {l.expiresAt? toJalali(new Date(l.expiresAt)): "بدون انقضا"}
 </TableCell>
 <TableCell className="hidden lg:table-cell text-xs">
 {l.lastAccessAt? toJalali(new Date(l.lastAccessAt)): "—"}
 </TableCell>
 <TableCell className="text-end">
 <div className="flex justify-end gap-1">
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => setPreview(l)}
 title="پیش‌نمایش پورتال"
 >
 <Eye className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => handleToggle(l)}
 title={l.isActive? "غیرفعال‌کردن": "فعال‌کردن"}
 >
 <ShieldCheck className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-destructive hover:text-destructive"
 onClick={() => handleRevoke(l.id)}
 title="ابطال لینک"
 >
 <Trash2 className="h-4 w-4" />
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

 {/* دیالوگ تولید لینک */}
 <Dialog open={genOpen} onOpenChange={setGenOpen}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>تولید لینک پورتال</DialogTitle>
 <DialogDescription>
 یک مشتری انتخاب کنید تا لینک امن اختصاصی برای او ساخته شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-4 py-2">
 <div className="space-y-2">
 <Label>مشتری</Label>
 <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
 <SelectTrigger>
 <SelectValue placeholder="انتخاب مشتری..." />
 </SelectTrigger>
 <SelectContent className="max-h-72">
 {parties.length === 0? (
 <div className="p-4 text-sm text-muted-foreground text-center">
 ابتدا یک مشتری در ماژول «خرید و فروش» ثبت کنید.
 </div>
 ): (
 parties.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.name} — کد {toPersianDigits(p.code)}
 </SelectItem>
 ))
 )}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>مدت اعتبار (روز)</Label>
 <Select value={expiresInDays} onValueChange={setExpiresInDays}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="30">۳۰ روز</SelectItem>
 <SelectItem value="90">۹۰ روز</SelectItem>
 <SelectItem value="180">۱۸۰ روز</SelectItem>
 <SelectItem value="365">یک سال</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setGenOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleGenerate} disabled={generating ||!selectedPartyId} className="gap-1.5">
 {generating && <Loader2 className="h-4 w-4 animate-spin" />}
 تولید لینک
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ نمایش توکن تولیدشده */}
 <Dialog open={!!newToken} onOpenChange={(o) =>!o && setNewToken(null)}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>لینک با موفقیت ساخته شد</DialogTitle>
 <DialogDescription>
 مشتری: {newToken?.partyName} — این لینک را کپی و برای مشتری ارسال کنید. توکن فقط یک‌بار نمایش داده می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="bg-muted rounded-lg p-3 font-mono text-xs break-all">
 {typeof window!== "undefined"? window.location.origin: ""}
 {newToken?.url}
 </div>
 <Button
 variant="outline"
 onClick={() =>
 copyToClipboard(
 `${typeof window!== "undefined"? window.location.origin: ""}${newToken?.url?? ""}`
 )
 }
 className="w-full gap-1.5"
 >
 {copied? <Check className="h-4 w-4 text-success" />: <Copy className="h-4 w-4" />}
 {copied? "کپی شد": "کپی لینک"}
 </Button>
 </div>
 <DialogFooter>
 <Button onClick={() => setNewToken(null)}>بستن</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* پیش‌نمایش پورتال */}
 <PortalPreviewDialog link={preview} onClose={() => setPreview(null)} />
 </div>
 );
}

/* ============ StatCard داخلی ============ */
function StatCard({
 icon: Icon,
 label,
 value,
 color = "text-foreground",
}: {
 icon: React.ComponentType<{ className?: string }>;
 label: string;
 value: string;
 color?: string;
}) {
 return (
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground mb-1">{label}</p>
 <p className="text-xl font-bold">{value}</p>
 </div>
 <Icon className={`h-8 w-8 ${color} opacity-80`} />
 </div>
 </CardContent>
 </Card>
 );
}

/* ============ پیش‌نمایش آنچه مشتری می‌بیند ============ */
function PortalPreviewDialog({
 link,
 onClose,
}: {
 link: PortalLink | null;
 onClose: () => void;
}) {
 const { toast } = useToast();
 const [tab, setTab] = React.useState<"invoices" | "statement">("invoices");
 const [invoices, setInvoices] = React.useState<PortalInvoice[]>([]);
 const [lines, setLines] = React.useState<PortalStatementLine[]>([]);
 const [totals, setTotals] = React.useState<{
 totalDebit: number;
 totalCredit: number;
 balance: number;
 } | null>(null);
 const [loading, setLoading] = React.useState(false);

 React.useEffect(() => {
 if (!link) return;
 let cancelled = false;
 (async () => {
 try {
 setLoading(true);
 // یافتن توکن برای این link — چون توکن خام ذخیره نمی‌شود، از api /links استفاده می‌کنیم.
 // برای پیش‌نمایش، یک token جدید به‌صورت موقتی تولید می‌کنیم.
 const res = await authFetch("/api/portal/generate-link", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 // FIX(v11): preview=true — لینک زنده قبلی مشتری باطل نمی‌شود
 body: JSON.stringify({ partyId: link.partyId, expiresInDays: 1, preview: true }),
 });
 const json = await res.json();
 if (!json.success) {
 toast({ title: "خطا", description: "تهیه پیش‌نمایش ناموفق بود", variant: "destructive" });
 return;
 }
 const token = json.data.token;
 const [invRes, stmtRes] = await Promise.all([
 authFetch(`/api/portal/${token}/invoices`, { cache: "no-store" }),
 authFetch(`/api/portal/${token}/statement`, { cache: "no-store" }),
 ]);
 const invJson = await invRes.json();
 const stmtJson = await stmtRes.json();
 if (!cancelled) {
 if (invJson.success) setInvoices(invJson.data);
 if (stmtJson.success) {
 setLines(stmtJson.data.lines);
 setTotals(stmtJson.data.totals);
 }
 }
 } catch {
 // ignore
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [link, toast]);

 if (!link) return null;

 return (
 <Dialog open={!!link} onOpenChange={(o) =>!o && onClose()}>
 <DialogContent className="max-w-3xl">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <ExternalLink className="h-4 w-4 text-primary" />
 پیش‌نمایش پورتال مشتری
 </DialogTitle>
 <DialogDescription>
 {link.partyName} — آنچه این مشتری پس از کلیک روی لینک می‌بیند.
 </DialogDescription>
 </DialogHeader>
 <div className="flex gap-2 mb-2">
 <Button
 size="sm"
 variant={tab === "invoices"? "default": "outline"}
 onClick={() => setTab("invoices")}
 className="gap-1.5"
 >
 <FileText className="h-3.5 w-3.5" />
 فاکتورها
 </Button>
 <Button
 size="sm"
 variant={tab === "statement"? "default": "outline"}
 onClick={() => setTab("statement")}
 className="gap-1.5"
 >
 <Wallet className="h-3.5 w-3.5" />
 صورت‌حساب
 </Button>
 </div>
 {loading? (
 <div className="flex justify-center py-10">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): tab === "invoices"? (
 <div className="max-h-[420px] overflow-y-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>شماره</TableHead>
 <TableHead>تاریخ</TableHead>
 <TableHead className="text-end">مبلغ</TableHead>
 <TableHead className="text-end">مانده</TableHead>
 <TableHead>وضعیت</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {invoices.length === 0? (
 <TableRow>
 <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
 فاکتوری ثبت نشده است.
 </TableCell>
 </TableRow>
 ): (
 invoices.map((inv) => (
 <TableRow key={inv.id}>
 <TableCell className="font-medium">{toPersianDigits(inv.number)}</TableCell>
 <TableCell className="text-xs">{toJalali(new Date(inv.date))}</TableCell>
 <TableCell className="text-end">{formatNumber(inv.total)} ریال</TableCell>
 <TableCell className="text-end font-medium">
 {inv.balance > 0? (
 <span className="text-destructive">{formatNumber(inv.balance)}</span>
 ): (
 <span className="text-success">تسویه</span>
 )}
 </TableCell>
 <TableCell>
 <Badge variant="outline">{inv.status}</Badge>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 ): (
 <div className="max-h-[420px] overflow-y-auto space-y-2">
 {totals && (
 <div className="grid grid-cols-3 gap-2 mb-2">
 <div className="bg-muted rounded-lg p-2 text-center">
 <div className="text-xs text-muted-foreground">بدهکار</div>
 <div className="font-bold text-sm">{formatNumber(totals.totalDebit)}</div>
 </div>
 <div className="bg-muted rounded-lg p-2 text-center">
 <div className="text-xs text-muted-foreground">بستانکار</div>
 <div className="font-bold text-sm">{formatNumber(totals.totalCredit)}</div>
 </div>
 <div className="bg-muted rounded-lg p-2 text-center">
 <div className="text-xs text-muted-foreground">مانده</div>
 <div className={`font-bold text-sm ${totals.balance >= 0? "text-destructive": "text-success"}`}>
 {formatNumber(Math.abs(totals.balance))}
 {totals.balance >= 0? " (بدهکار)": " (بستانکار)"}
 </div>
 </div>
 </div>
 )}
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>تاریخ</TableHead>
 <TableHead>شرح</TableHead>
 <TableHead className="text-end">بدهکار</TableHead>
 <TableHead className="text-end">بستانکار</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {lines.length === 0? (
 <TableRow>
 <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
 تراکنشی ثبت نشده است.
 </TableCell>
 </TableRow>
 ): (
 lines.map((l, idx) => (
 <TableRow key={idx}>
 <TableCell className="text-xs">{toJalali(new Date(l.date))}</TableCell>
 <TableCell className="text-xs">{l.description}</TableCell>
 <TableCell className="text-end text-xs">
 {l.debit > 0? formatNumber(l.debit): "—"}
 </TableCell>
 <TableCell className="text-end text-xs">
 {l.credit > 0? formatNumber(l.credit): "—"}
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 )}
 <DialogFooter>
 <Button variant="outline" onClick={onClose} className="gap-1.5">
 <X className="h-4 w-4" />
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
