"use client";

import * as React from "react";
import {
 CreditCard,
 Link2,
 CheckCircle2,
 AlertTriangle,
 Loader2,
 Copy,
 ExternalLink,
 Receipt,
 Wallet,
 ShieldCheck,
 QrCode,
 Send,
 Settings2,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatCompactToman, formatNumber, toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

type GatewayStatus = "connected" | "pending" | "inactive";

interface Gateway {
 id: string;
 name: string;
 nameEn: string;
 icon: LucideIcon;
 status: GatewayStatus;
 merchantId: string;
 transactions: number;
 accent: string;
 /** آیا از API پیکربندی شده است (zarinpal/idpay) */
 managed?: boolean;
}

// حالت پایه درگاه‌ها — zarinpal و idpay از API به‌روزرسانی می‌شوند
// nextpay و payping فعلاً placeholder هستند و در نسخه‌های بعدی فعال می‌شوند
const GATEWAYS_BASE: Gateway[] = [
 {
 id: "zarinpal",
 name: "زرین‌پال",
 nameEn: "ZarinPal",
 icon: CreditCard,
 status: "inactive",
 merchantId: "—",
 transactions: 0,
 accent: "bg-primary/10 text-primary",
 managed: true,
 },
 {
 id: "idpay",
 name: "آیدی‌پی",
 nameEn: "IDPay",
 icon: Wallet,
 status: "inactive",
 merchantId: "—",
 transactions: 0,
 accent: "bg-primary/10 text-primary",
 managed: true,
 },
 {
 id: "nextpay",
 name: "نکست‌پی",
 nameEn: "NextPay",
 icon: ShieldCheck,
 status: "inactive",
 merchantId: "—",
 transactions: 0,
 accent: "bg-primary/10 text-primary",
 },
 {
 id: "payping",
 name: "پی‌پینگ",
 nameEn: "PayPing",
 icon: Receipt,
 status: "inactive",
 merchantId: "—",
 transactions: 0,
 accent: "bg-primary/10 text-primary",
 },
];

const STATUS_META: Record<
 GatewayStatus,
 { label: string; color: string; dot: string }
> = {
 connected: {
 label: "متصل",
 color: "bg-success/10 text-success",
 dot: "bg-success",
 },
 pending: {
 label: "در انتظار",
 color: "bg-warning/10 text-warning",
 dot: "bg-warning",
 },
 inactive: {
 label: "غیرفعال",
 color: "bg-muted text-muted-foreground",
 dot: "bg-muted-foreground",
 },
};

interface MockPayment {
 id: string;
 gateway: string;
 amount: number;
 description: string;
 status: "SUCCESS" | "PENDING" | "FAILED";
 date: string;
 refId?: string;
}

const INITIAL_PAYMENTS: MockPayment[] = [];

const PAYMENT_STATUS_FA: Record<MockPayment["status"], string> = {
 SUCCESS: "موفق",
 PENDING: "در انتظار",
 FAILED: "ناموفق",
};

const PAYMENT_STATUS_STYLE: Record<MockPayment["status"], string> = {
 SUCCESS: "bg-success/10 text-success",
 PENDING: "bg-warning/10 text-warning",
 FAILED: "bg-destructive/10 text-destructive",
};

export function PaymentGatewayModule() {
 const { toast } = useToast();
 const [gateways, setGateways] = React.useState<Gateway[]>(GATEWAYS_BASE);
 const [isSuperadmin, setIsSuperadmin] = React.useState(false);
 const [loadingSettings, setLoadingSettings] = React.useState(true);
 const [savingGateway, setSavingGateway] = React.useState(false);
 const [amount, setAmount] = React.useState("");
 const [description, setDescription] = React.useState("");
 const [invoiceId, setInvoiceId] = React.useState("none");
 const [invoices, setInvoices] = React.useState<Array<{ id: string; number: string; partyName: string; total: number }>>([]);
 const [creating, setCreating] = React.useState(false);
 const [paymentLink, setPaymentLink] = React.useState<{
 gatewayUrl: string;
 authority: string;
 paymentId: string;
 amount: number;
 } | null>(null);
 const [payments, setPayments] = React.useState<MockPayment[]>(INITIAL_PAYMENTS);
 const [settingsOpen, setSettingsOpen] = React.useState<Gateway | null>(null);
 const [merchantInput, setMerchantInput] = React.useState("");
 const [enabledToggle, setEnabledToggle] = React.useState(false);

 // ============ دریافت تنظیمات درگاه‌ها از API ============
 const fetchSettings = React.useCallback(async () => {
 setLoadingSettings(true);
 try {
 const res = await authFetch("/api/platform/settings/payment");
 if (!res.ok) return;
 const json = (await res.json()) as {
 success: boolean;
 data?: {
 isSuperadmin?: boolean;
 zarinpal?: { merchantId?: string; enabled?: boolean; configured?: boolean };
 idpay?: { merchantId?: string; enabled?: boolean; configured?: boolean };
 };
 };
 if (!json.success ||!json.data) return;
 setIsSuperadmin(!!json.data.isSuperadmin);
 setGateways((prev) =>
 prev.map((g) => {
 if (g.id === "zarinpal" && json.data?.zarinpal) {
 const z = json.data.zarinpal;
 return {
...g,
 merchantId: z.merchantId || "—",
 status: z.configured && z.enabled? "connected": z.configured? "pending": "inactive",
 };
 }
 if (g.id === "idpay" && json.data?.idpay) {
 const i = json.data.idpay;
 return {
...g,
 merchantId: i.merchantId || "—",
 status: i.configured && i.enabled? "connected": i.configured? "pending": "inactive",
 };
 }
 return g;
 })
 );
 } catch {
 // ignore — حالت پایه نمایش داده می‌شود
 } finally {
 setLoadingSettings(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchSettings();
 }, [fetchSettings]);

 // بارگذاری فاکتورهای قابل پرداخت برای انتخاب در فرم
 React.useEffect(() => {
 (async () => {
 try {
 const res = await authFetch("/api/v1/invoices?limit=50&type=SALE", { cache: "no-store" });
 const json = await res.json();
 if (json?.success && Array.isArray(json.data)) {
 setInvoices(
 json.data
.filter((inv: Record<string, unknown>) => {
 const status = String(inv.status?? "");
 const paid = Number(inv.paidAmount?? 0);
 const total = Number(inv.totalAmount?? inv.total?? 0);
 // فقط فاکتورهای باز (غیر تسویه) را نمایش می‌دهیم
 return status!== "PAID" && status!== "SETTLED" && total - paid > 0;
 })
.slice(0, 50)
.map((inv: Record<string, unknown>) => ({
 id: String(inv.id?? ""),
 number: String(inv.number?? inv.invoiceNumber?? "—"),
 partyName: String(inv.partyName?? (inv.party as { name?: string })?.name?? "—"),
 total: Number(inv.totalAmount?? inv.total?? 0),
 }))
 );
 }
 } catch {
 // silent — فاکتورها انتخابی است
 }
 })();
 }, []);

 const handleCreatePayment = async () => {
 const numericAmount = Number(amount.replace(/[^\d]/g, ""));
 if (!numericAmount || numericAmount <= 0) {
 toast({
 title: "مبلغ نامعتبر",
 description: "لطفاً مبلغ معتبری وارد کنید.",
 variant: "destructive",
 });
 return;
 }

 setCreating(true);
 try {
 const res = await authFetch("/api/integrations/payment/create", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 amount: numericAmount,
 invoiceId: invoiceId!== "none"? invoiceId: undefined,
 callbackUrl:
 typeof window!== "undefined"
? `${window.location.origin}/api/integrations/payment/verify`
: "https://hoosh.nobatime.ir/api/integrations/payment/verify",
 description: description || undefined,
 }),
 });
 const data = (await res.json()) as {
 success: boolean;
 authority?: string;
 gatewayUrl?: string;
 paymentId?: string;
 amount?: number;
 message?: string;
 error?: string;
 };

 if (data.success && data.gatewayUrl && data.authority) {
 setPaymentLink({
 gatewayUrl: data.gatewayUrl,
 authority: data.authority,
 paymentId: data.paymentId?? "",
 amount: data.amount?? numericAmount,
 });

 setPayments((prev) => [
 {
 id: data.paymentId?? `PAY-${Date.now()}`,
 gateway: "زرین‌پال",
 amount: numericAmount,
 description: description || "لینک پرداخت دستی",
 status: "PENDING",
 date: new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 }).format(new Date()),
 },
...prev,
 ]);

 toast({
 title: "لینک پرداخت ایجاد شد",
 description: "لینک درگاه آماده‌ی اشتراک‌گذاری است.",
 });
 } else {
 toast({
 title: "خطا در ایجاد لینک",
 description: data.error?? "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } catch (err) {
 console.error(err);
 toast({
 title: "خطا در ارتباط با سرور",
 description: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setCreating(false);
 }
 };

 const handleVerify = async () => {
 if (!paymentLink) return;
 try {
 const res = await authFetch("/api/integrations/payment/verify", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 authority: paymentLink.authority,
 status: "OK",
 }),
 });
 const data = (await res.json()) as {
 success: boolean;
 verified: boolean;
 refId?: string;
 message?: string;
 };

 if (data.verified) {
 toast({
 title: "پرداخت تأیید شد",
 description: `کد پیگیری: ${data.refId?? "—"}`,
 });
 setPayments((prev) =>
 prev.map((p) =>
 p.id === paymentLink.paymentId
? {
...p,
 status: "SUCCESS",
 refId: data.refId?? "",
 }
: p
 )
 );
 setPaymentLink(null);
 } else {
 toast({
 title: "تأیید ناموفق",
 description: data.message?? "تراکنش تأیید نشد.",
 variant: "destructive",
 });
 }
 } catch (err) {
 console.error(err);
 toast({
 title: "خطا در تأیید پرداخت",
 description: "ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 }
 };

 const copyToClipboard = (text: string) => {
 if (typeof navigator!== "undefined" && navigator.clipboard) {
 navigator.clipboard.writeText(text).then(() =>
 toast({ title: "کپی شد", description: "در حافظه کپی شد." })
 );
 }
 };

 const openSettings = (g: Gateway) => {
 if (!isSuperadmin) {
 toast({
 title: "دسترسی محدود",
 description: "تنظیمات درگاه‌های پرداخت فقط توسط مدیر سیستم قابل ویرایش است.",
 variant: "destructive",
 });
 return;
 }
 setSettingsOpen(g);
 setMerchantInput(g.merchantId === "—"? "": g.merchantId);
 setEnabledToggle(g.status === "connected");
 };

 const saveSettings = async () => {
 if (!settingsOpen) return;
 if (!settingsOpen.managed) {
 toast({
 title: "درگاه پشتیبانی نمی‌شود",
 description: "این درگاه در نسخه فعلی پشتیبانی نمی‌شود.",
 variant: "destructive",
 });
 return;
 }
 setSavingGateway(true);
 try {
 const res = await authFetch("/api/platform/settings/payment", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 [settingsOpen.id]: {
 merchantId: merchantInput.trim(),
 enabled: enabledToggle,
 },
 }),
 });
 const json = (await res.json()) as { success: boolean; error?: string };
 if (!res.ok ||!json.success) {
 throw new Error(json.error || "خطا در ذخیره تنظیمات");
 }
 toast({
 title: "تنظیمات ذخیره شد",
 description: `پیکربندی درگاه «${settingsOpen.name}» به‌روزرسانی شد.`,
 });
 setSettingsOpen(null);
 void fetchSettings();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 variant: "destructive",
 });
 } finally {
 setSavingGateway(false);
 }
 };

 const totalToday = payments
.filter((p) => p.status === "SUCCESS")
.reduce((sum, p) => sum + p.amount, 0);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={Wallet}
 label="تراکنش‌های امروز"
 value={toPersianDigits(payments.length)}
 sub="در همه درگاه‌ها"
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={CheckCircle2}
 label="مبلغ جمع‌آوری‌شده"
 value={formatCompactToman(totalToday)}
 sub="امروز"
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={AlertTriangle}
 label="در انتظار تأیید"
 value={toPersianDigits(
 payments.filter((p) => p.status === "PENDING").length
 )}
 sub="نیازمند بررسی"
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={CreditCard}
 label="درگاه‌های متصل"
 value={toPersianDigits(
 gateways.filter((g) => g.status === "connected").length
 )}
 sub={`از ${toPersianDigits(gateways.length)} درگاه`}
 color="bg-primary/10 text-primary"
 />
 </div>

 {/* درگاه‌های پرداخت */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CreditCard className="h-4 w-4" />
 </span>
 درگاه‌های پرداخت آنلاین
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {gateways.map((g) => {
 const meta = STATUS_META[g.status];
 const Icon = g.icon;
 return (
 <div
 key={g.id}
 className="rounded-xl border border-border/60 p-4 card-hover"
 >
 <div className="flex items-start justify-between mb-3">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <Badge
 variant="secondary"
 className={`text-[10px] gap-1 ${meta.color}`}
 >
 <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
 {meta.label}
 </Badge>
 </div>
 <h4 className="font-bold text-sm">{g.name}</h4>
 <p className="text-[11px] text-muted-foreground mb-3" dir="ltr">
 {g.nameEn}
 </p>
 <div className="space-y-1.5 text-xs">
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground">کد پذیرنده</span>
 <span className="font-mono text-[10px]">
 {g.merchantId}
 </span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground">تراکنش‌ها</span>
 <span className="font-medium tnum">
 {toPersianDigits(formatNumber(g.transactions))}
 </span>
 </div>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="w-full mt-4 h-8 text-xs gap-1.5"
 onClick={() => openSettings(g)}
 disabled={loadingSettings}
 >
 {g.managed? (
 <>
 <Settings2 className="h-3.5 w-3.5" />
 {isSuperadmin? "تنظیمات": "مشاهده"}
 </>
 ): (
 <>
 <Settings2 className="h-3.5 w-3.5" />
 تنظیمات
 </>
 )}
 </Button>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* فرم ایجاد لینک پرداخت */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Link2 className="h-4 w-4" />
 </span>
 ایجاد لینک پرداخت
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-1.5">
 <Label htmlFor="amount">مبلغ (تومان)</Label>
 <Input
 id="amount"
 inputMode="numeric"
 dir="ltr"
 placeholder="1000000"
 value={amount? toPersianDigits(amount): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setAmount(eng);
 }}
 className="text-end font-mono"
 />
 {amount && (
 <p className="text-[10px] text-muted-foreground tnum">
 معادل: {formatCompactToman(Number(amount))}
 </p>
 )}
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="invoice-select">فاکتور مرتبط (اختیاری)</Label>
 <Select value={invoiceId} onValueChange={setInvoiceId}>
 <SelectTrigger id="invoice-select" className="w-full">
 <SelectValue placeholder="بدون فاکتور" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">بدون فاکتور</SelectItem>
 {invoices.map((inv) => (
 <SelectItem key={inv.id} value={inv.id}>
 {inv.number} — {inv.partyName}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 {invoices.length > 0 && (
 <p className="text-[10px] text-muted-foreground">
 {toPersianDigits(invoices.length)} فاکتور باز یافت شد
 </p>
 )}
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="description">توضیحات</Label>
 <Input
 id="description"
 placeholder="مثلاً: پرداخت فاکتور فروش"
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 />
 </div>

 <Button
 className="w-full gap-1.5"
 onClick={handleCreatePayment}
 disabled={creating}
 >
 {creating? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Send className="h-4 w-4" />
 )}
 ایجاد لینک پرداخت
 </Button>
 </CardContent>
 </Card>

 {/* نتیجه لینک پرداخت */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <QrCode className="h-4 w-4" />
 </span>
 لینک پرداخت
 </CardTitle>
 </CardHeader>
 <CardContent>
 {!paymentLink? (
 <div className="flex flex-col items-center justify-center py-10 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
 <QrCode className="h-7 w-7" />
 </div>
 <p className="text-sm font-medium">لینکی ایجاد نشده</p>
 <p className="text-xs text-muted-foreground mt-1">
 با تکمیل فرم کنار این بخش، لینک پرداخت تولید می‌شود.
 </p>
 </div>
 ): (
 <div className="space-y-4">
 {/* QR placeholder */}
 <div className="flex justify-center">
 <div className="h-36 w-36 rounded-xl border-2 border-dashed border-primary/30 grid grid-cols-6 grid-rows-6 gap-0.5 p-2 bg-primary/5">
 {Array.from({ length: 36 }).map((_, i) => {
 const seed = (i * 9301 + 49297) % 233280;
 const on = (seed / 233280) > 0.5;
 return (
 <div
 key={i}
 className={`rounded-sm ${on? "bg-primary": "bg-transparent"}`}
 />
 );
 })}
 </div>
 </div>

 <div className="space-y-2">
 <div className="flex items-center justify-between gap-2 text-xs">
 <span className="text-muted-foreground">شناسه پرداخت</span>
 <code dir="ltr" className="font-mono text-foreground">
 {paymentLink.paymentId}
 </code>
 </div>
 <div className="flex items-center justify-between gap-2 text-xs">
 <span className="text-muted-foreground">مبلغ</span>
 <span className="font-bold tnum text-primary">
 {formatCompactToman(paymentLink.amount)}
 </span>
 </div>
 <div className="space-y-1">
 <span className="text-xs text-muted-foreground">
 آدرس درگاه
 </span>
 <div
 dir="ltr"
 className="bg-muted rounded-md px-2.5 py-2 font-mono text-[11px] flex items-center justify-between gap-2"
 >
 <code className="truncate text-foreground">
 {paymentLink.gatewayUrl}
 </code>
 <div className="flex gap-1 shrink-0">
 <Button
 variant="ghost"
 size="icon"
 className="h-6 w-6 text-muted-foreground hover:text-foreground"
 aria-label="کپی"
 onClick={() =>
 copyToClipboard(paymentLink.gatewayUrl)
 }
 >
 <Copy className="h-3 w-3" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-6 w-6 text-muted-foreground hover:text-foreground"
 aria-label="باز کردن"
 onClick={() =>
 window.open(paymentLink.gatewayUrl, "_blank")
 }
 >
 <ExternalLink className="h-3 w-3" />
 </Button>
 </div>
 </div>
 </div>
 </div>

 <div className="flex gap-2">
 <Button
 variant="outline"
 size="sm"
 className="flex-1 gap-1.5"
 onClick={() => copyToClipboard(paymentLink.gatewayUrl)}
 >
 <Copy className="h-3.5 w-3.5" />
 کپی لینک
 </Button>
 <Button
 size="sm"
 className="flex-1 gap-1.5"
 onClick={handleVerify}
 >
 <CheckCircle2 className="h-3.5 w-3.5" />
 تأیید پرداخت
 </Button>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 </div>

 {/* تراکنش‌های اخیر — خالی */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Receipt className="h-4 w-4 text-primary" />
 تراکنش‌های اخیر
 </CardTitle>
 </CardHeader>
 <CardContent className="p-0">
 {payments.length === 0? (
 <EmptyState
 icon={Receipt}
 title="هنوز تراکنشی وجود ندارد"
 description="با ایجاد اولین لینک پرداخت و دریافت پرداخت موفق، لیست تراکنش‌ها در این جدول نمایش داده می‌شود."
 className="py-6"
 />
 ): (
 <div className="overflow-x-auto">
 <Table className="min-w-[760px] tnum">
 <TableHeader>
 <TableRow className="text-start">
 <TableHead scope="col" className="text-start">شناسه</TableHead>
 <TableHead scope="col" className="text-start">درگاه</TableHead>
 <TableHead scope="col" className="text-start">مبلغ</TableHead>
 <TableHead scope="col" className="text-start">توضیحات</TableHead>
 <TableHead scope="col" className="text-start">تاریخ</TableHead>
 <TableHead scope="col" className="text-start">کد پیگیری</TableHead>
 <TableHead scope="col" className="text-start">وضعیت</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {payments.map((p) => (
 <TableRow key={p.id}>
 <TableCell className="font-mono text-[10px]">
 {p.id}
 </TableCell>
 <TableCell className="font-medium">{p.gateway}</TableCell>
 <TableCell className="font-medium">
 {formatCompactToman(p.amount)}
 </TableCell>
 <TableCell className="text-muted-foreground text-xs">
 {p.description}
 </TableCell>
 <TableCell className="text-muted-foreground text-xs">
 {p.date}
 </TableCell>
 <TableCell className="font-mono text-[10px] text-muted-foreground">
 {p.refId?? "—"}
 </TableCell>
 <TableCell>
 <Badge
 className={`text-[10px] ${PAYMENT_STATUS_STYLE[p.status]}`}
 >
 {PAYMENT_STATUS_FA[p.status]}
 </Badge>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* دیالوگ تنظیمات درگاه */}
 <Dialog
 open={settingsOpen!== null}
 onOpenChange={(open) =>!open && setSettingsOpen(null)}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 {settingsOpen && (
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <settingsOpen.icon className="h-4 w-4" />
 </span>
 )}
 تنظیمات درگاه {settingsOpen?.name}
 </DialogTitle>
 <DialogDescription>
 پیکربندی کد پذیرنده و کلیدهای امنیتی {settingsOpen?.nameEn}.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="merchant-id">کد پذیرنده</Label>
 <Input
 id="merchant-id"
 dir="ltr"
 placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
 value={merchantInput}
 onChange={(e) => setMerchantInput(e.target.value)}
 disabled={savingGateway}
 />
 <p className="text-[10px] text-muted-foreground">
 کد پذیرنده (Merchant ID) را از پنل درگاه وارد کنید.
 </p>
 </div>
 <div className="flex items-center justify-between rounded-md border p-3">
 <div>
 <p className="text-sm font-medium">فعال‌سازی درگاه</p>
 <p className="text-[10px] text-muted-foreground">
 در صورت غیرفعال بودن، تراکنش‌ها از این درگاه قابل ایجاد نخواهند بود.
 </p>
 </div>
 <Switch
 checked={enabledToggle}
 onCheckedChange={setEnabledToggle}
 disabled={savingGateway}
 />
 </div>
 <p className="text-[10px] text-muted-foreground">
 برای فعال‌سازی درگاه، کد پذیرنده را از پنل درگاه وارد کرده و کلید را فعال کنید.
 </p>
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => setSettingsOpen(null)} disabled={savingGateway}>
 انصراف
 </Button>
 <Button className="gap-1.5" onClick={saveSettings} disabled={savingGateway}>
 {savingGateway? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ذخیره
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 color,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 color: string;
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-4 flex items-center gap-3">
 <div
 className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}
 >
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="font-bold text-base truncate tnum">{value}</p>
 <p className="text-[10px] text-muted-foreground">{sub}</p>
 </div>
 </CardContent>
 </Card>
 );
}
