"use client";

import * as React from "react";
import {
 FileText,
 Receipt,
 Wallet,
 Phone,
 Mail,
 Building2,
 Loader2,
 AlertCircle,
 CheckCircle2,
 Clock,
 Download,
 ArrowLeft,
 ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toPersianDigits, formatNumber } from "@/lib/persian";

interface PortalClientProps {
 token: string;
}

interface Party {
 id: string;
 name: string;
 code: string | null;
 mobile: string | null;
 email: string | null;
}

interface PortalInfo {
 success: boolean;
 party?: Party;
 tenant?: { name: string };
 expiresAt?: string | null;
 error?: string;
}

interface Invoice {
 id: string;
 number: string;
 date: string;
 dueDate: string | null;
 total: number;
 paidAmount: number;
 status: string;
 type: string;
}

interface StatementEntry {
 date: string;
 description: string;
 reference: string;
 debit: number;
 credit: number;
 balance: number;
}

interface Statement {
 success: boolean;
 party?: Party;
 openingBalance?: number;
 closingBalance?: number;
 totalDebit?: number;
 totalCredit?: number;
 entries?: StatementEntry[];
 error?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
 PAID: { label: "پرداخت شده", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
 PARTIALLY_PAID: { label: "پرداخت جزئی", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
 PENDING: { label: "در انتظار پرداخت", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
 SENT: { label: "ارسال شده", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: FileText },
 OVERDUE: { label: "سررسید گذشته", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle },
 DRAFT: { label: "پیش‌نویس", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: FileText },
 CANCELLED: { label: "لغو شده", color: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", icon: AlertCircle },
};

export function PortalClient({ token }: PortalClientProps) {
 const [info, setInfo] = React.useState<PortalInfo | null>(null);
 const [invoices, setInvoices] = React.useState<Invoice[]>([]);
 const [statement, setStatement] = React.useState<Statement | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [activeTab, setActiveTab] = React.useState<"invoices" | "statement">("invoices");

 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 setLoading(true);
 const [infoRes, invRes, stmtRes] = await Promise.all([
 fetch(`/api/portal/${token}`),
 fetch(`/api/portal/${token}/invoices`),
 fetch(`/api/portal/${token}/statement`),
 ]);
 const infoData = await infoRes.json();
 const invData = await invRes.json();
 const stmtData = await stmtRes.json();
 if (cancelled) return;
 if (!infoData.success) {
 setError(infoData.error || "لینک نامعتبر است");
 return;
 }
 // FIX(v11): تطبیق با قرارداد واقعی API — قبلاً کلاینت info.party و
 // invData.invoices و stmtData.entries می‌خواند ولی API data.{...} برمی‌گرداند
 // → صفحه عمومی برای هر لینک معتبر سفید می‌شد (TypeError)
 const d = infoData.data?? {};
 setInfo({
 success: true,
 party: {
 id: String(d.partyId?? ""),
 name: String(d.partyName?? "—"),
 code: d.partyCode?? null,
 mobile: d.mobile?? null,
 email: d.email?? null,
 },
 tenant: { name: String(d.tenantName?? "هوش") },
 expiresAt: d.expiresAt?? null,
 });
 setInvoices(invData.success? invData.data || []: []);
 setStatement(
 stmtData.success && stmtData.data
 ? {
 success: true,
 openingBalance: 0,
 closingBalance: Number(stmtData.data.totals?.balance?? 0),
 totalDebit: Number(stmtData.data.totals?.totalDebit?? 0),
 totalCredit: Number(stmtData.data.totals?.totalCredit?? 0),
 entries: (stmtData.data.lines|| []).map(
 (l: { date: string; description: string; reference: string; debit: number; credit: number; balanceAfter?: number }) => ({
 date: l.date,
 description: l.description,
 reference: l.reference,
 debit: Number(l.debit?? 0),
 credit: Number(l.credit?? 0),
 balance: Number(l.balanceAfter?? 0),
 })
 ),
 }
 : null
 );
 } catch (e) {
 if (!cancelled) setError("خطا در ارتباط با سرور");
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [token]);

 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-violet-50 dark:from-emerald-950/20 dark:via-background dark:to-violet-950/20">
 <div className="flex flex-col items-center gap-3">
 <Loader2 className="h-10 w-10 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">در حال بارگذاری پورتال...</p>
 </div>
 </div>
 );
 }

 if (error ||!info?.success) {
 return (
 <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-background to-orange-50 dark:from-red-950/20 dark:via-background dark:to-orange-950/20 p-4">
 <Card className="max-w-md w-full">
 <CardHeader className="text-center">
 <div className="mx-auto w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
 <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
 </div>
 <CardTitle className="text-xl">لینک نامعتبر</CardTitle>
 </CardHeader>
 <CardContent className="text-center space-y-3">
 <p className="text-sm text-muted-foreground">
 {error || info?.error || "لینک پورتال نامعتبر یا منقضی است."}
 </p>
 <p className="text-xs text-muted-foreground">
 لطفاً با شرکت تماس بگیرید تا لینک جدید دریافت کنید.
 </p>
 </CardContent>
 </Card>
 </div>
 );
 }

 const party = info.party!;
 const tenantName = info.tenant?.name || "هوش";
 // FIX(v11): مبالغ DB ریال است — قبل از نمایش «تومان» بر ۱۰ تقسیم شود
 // (قبلاً مانده و پرداخت‌شده ۱۰ برابر نمایش داده می‌شد)
 const outstanding =
 invoices.reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.paidAmount)), 0) / 10;
 const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.paidAmount), 0) / 10;

 return (
 <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-background to-violet-50 dark:from-emerald-950/20 dark:via-background dark:to-violet-950/20">
 {/* Header */}
 <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
 <div className="container mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-violet-600 flex items-center justify-center text-white font-bold">
 {tenantName.charAt(0)}
 </div>
 <div>
 <h1 className="text-sm font-bold leading-tight">{tenantName}</h1>
 <p className="text-xs text-muted-foreground">پورتال مشتری</p>
 </div>
 </div>
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <ShieldCheck className="h-4 w-4 text-emerald-500" />
 <span className="hidden sm:inline">ارتباط امن</span>
 </div>
 </div>
 </header>

 <main className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
 {/* Welcome card */}
 <Card className="overflow-hidden border-0 shadow-lg">
 <div className="bg-gradient-to-l from-emerald-500 via-emerald-600 to-violet-600 p-6 text-white">
 <div className="flex flex-col sm:flex-row items-start gap-4 justify-between">
 <div className="space-y-1">
 <p className="text-emerald-50 text-xs">سلام</p>
 <h2 className="text-2xl font-bold">{party.name}</h2>
 <div className="flex flex-wrap gap-3 mt-2 text-xs text-emerald-50">
 {party.code && (
 <span className="flex items-center gap-1">
 <Building2 className="h-3.5 w-3.5" />
 کد: {party.code}
 </span>
 )}
 {party.mobile && (
 <span className="flex items-center gap-1">
 <Phone className="h-3.5 w-3.5" />
 {toPersianDigits(party.mobile)}
 </span>
 )}
 {party.email && (
 <span className="flex items-center gap-1">
 <Mail className="h-3.5 w-3.5" />
 {party.email}
 </span>
 )}
 </div>
 </div>
 </div>
 </div>
 </Card>

 {/* Stats */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 <Card>
 <CardContent className="p-5 flex items-center gap-3">
 <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
 <Wallet className="h-5 w-5 text-red-600 dark:text-red-400" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">مانده قابل پرداخت</p>
 <p className="text-lg font-bold text-red-600 dark:text-red-400">
 {formatNumber(outstanding)} <span className="text-xs font-normal">تومان</span>
 </p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-5 flex items-center gap-3">
 <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
 <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">پرداخت شده</p>
 <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
 {formatNumber(totalPaid)} <span className="text-xs font-normal">تومان</span>
 </p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-5 flex items-center gap-3">
 <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
 <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">تعداد فاکتور</p>
 <p className="text-lg font-bold">{toPersianDigits(invoices.length)}</p>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Tabs */}
 <div className="flex gap-2 border-b border-border">
 <button
 onClick={() => setActiveTab("invoices")}
 className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
 activeTab === "invoices"
? "border-primary text-primary"
: "border-transparent text-muted-foreground hover:text-foreground"
 }`}
 >
 فاکتورها ({toPersianDigits(invoices.length)})
 </button>
 <button
 onClick={() => setActiveTab("statement")}
 className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
 activeTab === "statement"
? "border-primary text-primary"
: "border-transparent text-muted-foreground hover:text-foreground"
 }`}
 >
 صورت‌حساب
 </button>
 </div>

 {/* Content */}
 {activeTab === "invoices" && (
 <Card>
 <CardHeader>
 <CardTitle className="text-base flex items-center gap-2">
 <FileText className="h-4 w-4" />
 فاکتورهای شما
 </CardTitle>
 </CardHeader>
 <CardContent>
 {invoices.length === 0? (
 <div className="text-center py-12 text-muted-foreground">
 <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
 <p className="text-sm">هنوز فاکتوری ثبت نشده است.</p>
 </div>
 ): (
 <div className="space-y-3">
 {invoices.map((inv) => {
 const st = STATUS_LABELS[inv.status] || STATUS_LABELS.PENDING;
 const StatusIcon = st.icon;
 const remaining = Number(inv.total) - Number(inv.paidAmount);
 return (
 <div
 key={inv.id}
 className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border hover:bg-accent/30 transition-colors"
 >
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <span className="font-semibold text-sm">فاکتور {toPersianDigits(inv.number)}</span>
 <Badge variant="outline" className={`text-xs ${st.color}`}>
 <StatusIcon className="h-3 w-3 ml-1" />
 {st.label}
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground">
 تاریخ: {new Date(inv.date).toLocaleDateString("fa-IR")}
 {inv.dueDate && ` • سررسید: ${new Date(inv.dueDate).toLocaleDateString("fa-IR")}`}
 </p>
 </div>
 <div className="flex items-center gap-4">
 <div className="text-left">
 <p className="text-sm font-bold">{formatNumber(Number(inv.total) / 10)} ت</p>
 {remaining > 0 && (
 <p className="text-xs text-red-600 dark:text-red-400">
 مانده: {formatNumber(remaining / 10)} ت
 </p>
 )}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>
 )}

 {activeTab === "statement" && (
 <Card>
 <CardHeader>
 <CardTitle className="text-base flex items-center gap-2">
 <Receipt className="h-4 w-4" />
 صورت‌حساب
 </CardTitle>
 </CardHeader>
 <CardContent>
 {!statement?.entries || statement.entries.length === 0? (
 <div className="text-center py-12 text-muted-foreground">
 <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
 <p className="text-sm">هنوز تراکنشی ثبت نشده است.</p>
 </div>
 ): (
 <>
 <div className="grid grid-cols-3 gap-3 mb-4 text-center">
 <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
 <p className="text-xs text-muted-foreground">بدهکاری</p>
 <p className="text-sm font-bold text-red-600 dark:text-red-400">
 {formatNumber((statement.totalDebit || 0) / 10)}
 </p>
 </div>
 <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
 <p className="text-xs text-muted-foreground">بستانکاری</p>
 <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
 {formatNumber((statement.totalCredit || 0) / 10)}
 </p>
 </div>
 <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
 <p className="text-xs text-muted-foreground">مانده</p>
 <p className="text-sm font-bold">
 {formatNumber((statement.closingBalance || 0) / 10)}
 </p>
 </div>
 </div>
 <Separator className="my-3" />
 <div className="max-h-96 overflow-y-auto">
 <table className="w-full text-xs">
 <thead className="sticky top-0 bg-background">
 <tr className="text-right border-b">
 <th className="p-2 font-medium">تاریخ</th>
 <th className="p-2 font-medium">شرح</th>
 <th className="p-2 font-medium text-left">بدهکار</th>
 <th className="p-2 font-medium text-left">بستانکار</th>
 <th className="p-2 font-medium text-left">مانده</th>
 </tr>
 </thead>
 <tbody>
 {statement.entries.map((e, i) => (
 <tr key={i} className="border-b border-border/50">
 <td className="p-2 whitespace-nowrap">
 {new Date(e.date).toLocaleDateString("fa-IR")}
 </td>
 <td className="p-2">{e.description}</td>
 <td className="p-2 text-left text-red-600 dark:text-red-400">
 {e.debit? formatNumber(e.debit / 10): "—"}
 </td>
 <td className="p-2 text-left text-emerald-600 dark:text-emerald-400">
 {e.credit? formatNumber(e.credit / 10): "—"}
 </td>
 <td className="p-2 text-left font-medium">
 {formatNumber(e.balance / 10)}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </>
 )}
 </CardContent>
 </Card>
 )}

 {/* Footer note */}
 <div className="text-center text-xs text-muted-foreground py-4">
 <p>این اطلاعات از طریق لینک امن نمایش داده می‌شود.</p>
 <p className="mt-1">{toPersianDigits(new Date().getFullYear() - 621)} هوش — تمامی حقوق محفوظ است.</p>
 </div>
 </main>
 </div>
 );
}
