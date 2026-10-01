"use client";

/**
 * BankReconciliationModule — مغایرت‌گیری بانکی
 *
 * - فهرست مغایرت‌گیری‌های قبلی
 * - ایجاد مغایرت‌گیری جدید با وارد کردن خطوط صورت‌حساب (CSV/text یا دستی)
 * - تطبیق خودکار اولیه با فاکتورها و چک‌ها
 * - تطبیق دستی هر خط
 * - تکمیل مغایرت‌گیری پس از تطبیق همه‌ی خطوط
 *
 * فرمت ورودی متن: هر خط — تاریخ,شرح,مبلغ
 * 1403-07-01,واریز از فروش,5000000
 * 1403-07-02,برداشت چک,2000000 (منفی)
 */

import * as React from "react";
import {
 Landmark,
 Plus,
 Trash2,
 Loader2,
 RefreshCw,
 CheckCircle2,
 XCircle,
 Circle,
 Link2,
 Unlink,
 Eye,
 AlertTriangle,
 FileSpreadsheet,
 FileUp,
 ChevronDown,
 Play,
 Check,
 Upload,
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
import { Textarea } from "@/components/ui/textarea";
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
 Collapsible,
 CollapsibleContent,
 CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

interface BankAccount {
 id: string;
 bankName: string;
 accountNumber: string;
 balance: number;
}

interface Reconciliation {
 id: string;
 period: string;
 status: string;
 statementBalance: number;
 bookBalance: number;
 difference: number;
 bankAccountId: string;
 bankName: string;
 accountNumber: string;
 notes: string | null;
 createdAt: string;
 completedAt: string | null;
 lineCount: number;
}

interface ReconciliationLine {
 id: string;
 date: string;
 description: string;
 amount: number;
 status: string;
 matchedEntityType: string | null;
 matchedEntityId: string | null;
}

const STATUS_FA: Record<string, string> = {
 DRAFT: "پیش‌نویس",
 IN_PROGRESS: "در حال انجام",
 COMPLETED: "تکمیل شده",
 ARCHIVED: "بایگانی",
};

const STATUS_COLOR: Record<string, string> = {
 DRAFT: "bg-muted text-muted-foreground",
 IN_PROGRESS: "bg-info/10 text-info",
 COMPLETED: "bg-success/10 text-success",
 ARCHIVED: "bg-muted text-muted-foreground",
};

const LINE_STATUS_FA: Record<string, string> = {
 MATCHED: "تطبیق خورد",
 UNMATCHED: "تطبیق نخورد",
 IGNORED: "نادیده گرفته شد",
};

/* ============ ایمپورت صورتحساب CSV ============ */
interface ImportHistoryItem {
 id: string;
 fileName: string;
 bankAccountId: string | null;
 bankName: string | null;
 accountNumber: string | null;
 rowsTotal: number;
 rowsImported: number;
 rowsSkipped: number;
 status: string;
 errors: { row: number; reason: string }[];
 createdAt: string;
}

interface ImportResult {
 id: string;
 fileName: string;
 rowsTotal: number;
 rowsImported: number;
 rowsSkipped: number;
 status: string;
 errors: { row: number; reason: string }[];
 period: string;
 reconciliationId: string | null;
}

const IMPORT_STATUS_FA: Record<string, string> = {
 COMPLETED: "کامل",
 PARTIAL: "ناقص",
 FAILED: "ناموفق",
 PENDING: "در انتظار",
};

const IMPORT_STATUS_COLOR: Record<string, string> = {
 COMPLETED: "bg-success/10 text-success",
 PARTIAL: "bg-warning/10 text-warning",
 FAILED: "bg-destructive/10 text-destructive",
 PENDING: "bg-muted text-muted-foreground",
};

export function BankReconciliationModule() {
 const { toast } = useToast();
 const [recs, setRecs] = React.useState<Reconciliation[]>([]);
 const [banks, setBanks] = React.useState<BankAccount[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [wizardOpen, setWizardOpen] = React.useState(false);
 const [detail, setDetail] = React.useState<Reconciliation | null>(null);
 const [detailLines, setDetailLines] = React.useState<ReconciliationLine[]>([]);
 const [detailLoading, setDetailLoading] = React.useState(false);

 // فرم جادوگر
 const now = new Date();
 const [wForm, setWForm] = React.useState({
 bankAccountId: "",
 period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
 statementBalance: 0,
 notes: "",
 });
 const [statementText, setStatementText] = React.useState(
 "1403-07-01,واریز از فروش فاکتور 1023,5000000\n1403-07-05,برداشت چک 88231,3000000"
 );
 const [creating, setCreating] = React.useState(false);

 // ============ ایمپورت صورتحساب CSV ============
 const [csvAccountId, setCsvAccountId] = React.useState("");
 const [csvFileName, setCsvFileName] = React.useState<string | null>(null);
 const [csvText, setCsvText] = React.useState<string | null>(null);
 const [importing, setImporting] = React.useState(false);
 const [importResult, setImportResult] = React.useState<ImportResult | null>(null);
 const [importsHistory, setImportsHistory] = React.useState<ImportHistoryItem[]>([]);
 const [importsOpen, setImportsOpen] = React.useState(false);
 const csvInputRef = React.useRef<HTMLInputElement | null>(null);

 const load = React.useCallback(async () => {
 try {
 setLoading(true);
 const [recsRes, banksRes] = await Promise.all([
 authFetch("/api/accounting/reconciliations", { cache: "no-store" }),
 authFetch("/api/accounting/bank-accounts", { cache: "no-store" }),
 ]);
 const rJson = await recsRes.json();
 const bJson = await banksRes.json();
 if (rJson.success) setRecs(rJson.data);
 if (bJson.success) setBanks(bJson.data);
 } catch {
 toast({ title: "خطا", description: "بارگذاری مغایرت‌گیری‌ها ناموفق بود", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [toast]);

 React.useEffect(() => {
 load();
 }, [load]);

 // بارگذاری تاریخچه ایمپورت‌ها + انتخاب پیش‌فرض حساب بانکی
 const loadImports = React.useCallback(async () => {
 try {
 const res = await authFetch("/api/import/bank-statement", { cache: "no-store" });
 const json = await res.json();
 if (json.success) setImportsHistory(json.data ?? []);
 } catch {
 /* سکوت — بخش اختیاری است */
 }
 }, []);

 React.useEffect(() => {
 void loadImports();
 }, [loadImports]);

 React.useEffect(() => {
 if (banks.length > 0 && !csvAccountId) {
 setCsvAccountId(banks[0].id);
 }
 }, [banks, csvAccountId]);

 /* ---------- خواندن فایل CSV سمت کلاینت (متن UTF-8) ---------- */
 const handleCsvFile = (file: File) => {
 const name = file.name || "";
 if (!/\.(csv|txt)$/i.test(name) && file.type !== "text/csv") {
 toast({
 title: "خطا",
 description: "فقط فایل CSV یا TXT قابل ایمپورت است",
 variant: "destructive",
 });
 return;
 }
 if (file.size > 2 * 1024 * 1024) {
 toast({
 title: "حجم زیاد",
 description: "حداکثر حجم فایل ۲ مگابایت است",
 variant: "destructive",
 });
 return;
 }
 const reader = new FileReader();
 reader.onload = () => {
 setCsvText(String(reader.result || ""));
 setCsvFileName(name);
 setImportResult(null);
 };
 reader.onerror = () => {
 toast({ title: "خطا", description: "خواندن فایل ناموفق بود", variant: "destructive" });
 };
 reader.readAsText(file, "utf-8");
 };

 /* ---------- پیش‌نمایش ساده ۵ ردیف اول (شکستن با جداکننده غالب) ---------- */
 const csvPreview = React.useMemo(() => {
 if (!csvText || !csvText.trim()) return null;
 const lines = csvText
 .replace(/\r\n?/g, "\n")
 .split("\n")
 .map((l) => l.trim())
 .filter(Boolean);
 if (lines.length < 2) return null;
 const header = lines[0];
 const counts = [",", ";", "\t"].map((d) => header.split(d).length - 1);
 let delim = ",";
 let max = counts[0];
 if (counts[1] > max) {
 delim = ";";
 max = counts[1];
 }
 if (counts[2] > max) delim = "\t";
 const clean = (c: string) => c.trim().replace(/^"|"$/g, "");
 const headCells = header.split(delim).map(clean);
 const rows = lines.slice(1, 6).map((l) => l.split(delim).map(clean));
 return { headCells, rows, dataRows: Math.max(0, lines.length - 1) };
 }, [csvText]);

 /* ---------- ارسال به سرور ---------- */
 const handleImport = async () => {
 if (!csvAccountId) {
 toast({ title: "خطا", description: "ابتدا حساب بانکی را انتخاب کنید", variant: "destructive" });
 return;
 }
 if (!csvText || !csvText.trim()) {
 toast({ title: "خطا", description: "ابتدا فایل CSV را انتخاب کنید", variant: "destructive" });
 return;
 }
 try {
 setImporting(true);
 const res = await authFetch("/api/import/bank-statement", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 fileName: csvFileName ?? "statement.csv",
 bankAccountId: csvAccountId,
 csvContent: csvText,
 }),
 });
 const json = await res.json();
 if (json.success) {
 setImportResult(json.data);
 toast({
 title: "ایمپورت انجام شد",
 description: json.message ?? `${toPersianDigits(json.data?.rowsImported ?? 0)} تراکنش ثبت شد`,
 });
 await Promise.all([load(), loadImports()]);
 } else {
 toast({ title: "خطا در ایمپورت", description: json.error ?? "ایمپورت ناموفق بود", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setImporting(false);
 }
 };

 /** تبدیل متن ورودی به خطوط قابل فهم برای API */
 const parseStatementText = (): {
 date: string;
 description: string;
 amount: number;
 }[] => {
 const lines = statementText
.split(/\n+/)
.map((l) => l.trim())
.filter(Boolean);
 const parsed: { date: string; description: string; amount: number }[] = [];
 for (const raw of lines) {
 const parts = raw.split(",").map((p) => p.trim());
 if (parts.length < 3) continue;
 // اگر تاریخ شمسی بود (مثلاً 1403-07-01) آن را به میلادی تبدیل نمی‌کنیم —
 // کاربر می‌تواند تاریخ میلادی وارد کند (YYYY-MM-DD). در غیر این‌صورت،
 // اولین فیلد به‌عنوان رشته‌ی تاریخ در نظر گرفته می‌شود و در سرور به Date تبدیل می‌شود.
 const date = parts[0];
 const description = parts[1];
 const amount = Number(parts[2].replace(/[^\d-]/g, ""));
 if (!date ||!description || Number.isNaN(amount)) continue;
 parsed.push({ date, description, amount });
 }
 return parsed;
 };

 const openWizard = () => {
 if (banks.length === 0) {
 toast({
 title: "حساب بانکی موجود نیست",
 description: "ابتدا در ماژول «خزانه‌داری و چک» یک حساب بانکی ثبت کنید.",
 variant: "destructive",
 });
 return;
 }
 setWForm({
 bankAccountId: banks[0].id,
 period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
 statementBalance: banks[0].balance,
 notes: "",
 });
 setWizardOpen(true);
 };

 const handleCreate = async () => {
 if (!wForm.bankAccountId ||!wForm.period) {
 toast({ title: "خطا", description: "حساب بانکی و دوره الزامی است", variant: "destructive" });
 return;
 }
 const lines = parseStatementText();
 if (lines.length === 0) {
 toast({
 title: "خطا",
 description: "هیچ خط صورتحساب معتبری وارد نشده. هر خط: تاریخ,شرح,مبلغ",
 variant: "destructive",
 });
 return;
 }
 try {
 setCreating(true);
 const res = await authFetch("/api/accounting/reconciliations", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 bankAccountId: wForm.bankAccountId,
 period: wForm.period,
 statementBalance: wForm.statementBalance,
 notes: wForm.notes || undefined,
 lines,
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: "مغایرت‌گیری ایجاد شد",
 description: `${toPersianDigits(lines.length)} خط وارد شد. تطبیق خودکار انجام شد.`,
 });
 setWizardOpen(false);
 await load();
 // باز کردن مستقیم جزئیات
 if (json.data?.id) {
 openDetail(json.data.id);
 }
 } else {
 toast({ title: "خطا", description: json.error?? "ایجاد ناموفق", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setCreating(false);
 }
 };

 const openDetail = async (id: string) => {
 try {
 setDetailLoading(true);
 const res = await authFetch(`/api/accounting/reconciliations/${id}`, { cache: "no-store" });
 const json = await res.json();
 if (json.success) {
 setDetail(json.data);
 setDetailLines(json.data.lines?? []);
 } else {
 toast({ title: "خطا", description: json.error, variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setDetailLoading(false);
 }
 };

 const handleLineAction = async (
 recId: string,
 lineId: string,
 action: "match" | "unmatch" | "ignore"
 ) => {
 try {
 const body: Record<string, unknown> = { lineId, action };
 if (action === "match") {
 body.entityType = "MANUAL";
 }
 const res = await authFetch(`/api/accounting/reconciliations/${recId}/match`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(body),
 });
 const json = await res.json();
 if (json.success) {
 // به‌روزرسانی محلی خط
 setDetailLines((prev) =>
 prev.map((l) =>
 l.id === lineId
? {
...l,
 status: json.data.status,
 matchedEntityType: json.data.matchedEntityType,
 matchedEntityId: json.data.matchedEntityId,
 }
: l
 )
 );
 toast({
 title:
 action === "match"
? "خط تطبیق داده شد"
: action === "ignore"
? "خط نادیده گرفته شد"
: "تطبیق لغو شد",
 });
 } else {
 toast({ title: "خطا", description: json.error, variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 }
 };

 const handleComplete = async (recId: string) => {
 if (!confirm("مغایرت‌گیری تکمیل شود؟ این عملیات قابل بازگشت نیست.")) return;
 try {
 const res = await authFetch(`/api/accounting/reconciliations/${recId}/complete`, {
 method: "POST",
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "مغایرت‌گیری تکمیل شد", description: json.message });
 setDetail(null);
 await load();
 } else {
 toast({ title: "خطا", description: json.error, variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 }
 };

 const handleDelete = async (id: string) => {
 if (!confirm("این مغایرت‌گیری حذف شود؟")) return;
 try {
 const res = await authFetch(`/api/accounting/reconciliations/${id}`, { method: "DELETE" });
 const json = await res.json();
 if (json.success) {
 toast({ title: "حذف شد" });
 await load();
 } else {
 toast({ title: "خطا", description: json.error?? "حذف ناموفق بود", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 }
 };

 const unmatchedCount = detailLines.filter((l) => l.status === "UNMATCHED").length;
 const matchedCount = detailLines.filter((l) => l.status === "MATCHED").length;
 const ignoredCount = detailLines.filter((l) => l.status === "IGNORED").length;

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Landmark className="h-5 w-5 text-primary" />
 مغایرت‌گیری بانکی
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 تطبیق صورت‌حساب بانکی با تراکنش‌های ثبت‌شده در سیستم
 </p>
 </div>
 <Button onClick={openWizard} className="gap-1.5">
 <Plus className="h-4 w-4" />
 مغایرت‌گیری جدید
 </Button>
 </div>

 {/* ============ ایمپورت صورتحساب CSV ============ */}
 <Card className="border-teal-500/25 dark:border-teal-400/15">
 <CardHeader className="pb-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20">
 <FileUp className="h-4 w-4" />
 </span>
 ایمپورت صورتحساب CSV
 </CardTitle>
 <Badge variant="secondary" className="text-[10px]">
 ستون‌ها: تاریخ، شرح، بدهکار، بستانکار، مبلغ، شماره پیگیری، مانده
 </Badge>
 </div>
 <CardDescription className="text-xs">
 فایل صورتحساب بانک را انتخاب کنید؛ تراکنش‌ها به‌صورت خودکار به مغایرت‌گیری همان دوره اضافه می‌شوند. تاریخ شمسی و میلادی و جداکننده‌ی کاما/سمی‌کالن/تب پشتیبانی می‌شود.
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label>حساب بانکی</Label>
 <Select value={csvAccountId} onValueChange={setCsvAccountId}>
 <SelectTrigger>
 <SelectValue placeholder="انتخاب حساب..." />
 </SelectTrigger>
 <SelectContent>
 {banks.map((b) => (
 <SelectItem key={b.id} value={b.id}>
 {b.bankName} — {toPersianDigits(b.accountNumber)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>فایل صورتحساب (CSV / TXT)</Label>
 <input
 ref={csvInputRef}
 type="file"
 accept=".csv,.txt,text/csv"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) handleCsvFile(f);
 e.target.value = "";
 }}
 />
 <Button
 variant="outline"
 className="gap-1.5 w-full justify-start"
 onClick={() => csvInputRef.current?.click()}
 disabled={banks.length === 0}
 >
 <Upload className="h-4 w-4" />
 {csvFileName ? csvFileName : "انتخاب فایل CSV..."}
 </Button>
 </div>
 </div>

 {/* پیش‌نمایش ۵ ردیف اول */}
 {csvPreview && (
 <div className="rounded-lg border border-border/60 overflow-hidden">
 <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground flex items-center justify-between">
 <span className="flex items-center gap-1">
 <FileSpreadsheet className="h-3.5 w-3.5" />
 پیش‌نمایش {toPersianDigits(csvPreview.rows.length)} ردیف از {toPersianDigits(csvPreview.dataRows)}
 </span>
 <button
 className="text-[10px] text-muted-foreground hover:text-destructive"
 onClick={() => {
 setCsvText(null);
 setCsvFileName(null);
 setImportResult(null);
 }}
 >
 حذف فایل
 </button>
 </div>
 <div className="max-h-44 overflow-auto styled-scroll">
 <Table>
 <TableHeader>
 <TableRow>
 {csvPreview.headCells.map((h, i) => (
 <TableHead key={i} className="text-xs">
 {h || "—"}
 </TableHead>
 ))}
 </TableRow>
 </TableHeader>
 <TableBody>
 {csvPreview.rows.map((r, ri) => (
 <TableRow key={ri}>
 {r.map((c, ci) => (
 <TableCell key={ci} className="text-xs whitespace-nowrap">
 {c.length > 24 ? c.slice(0, 24) + "…" : c || "—"}
 </TableCell>
 ))}
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </div>
 )}

 <Button
 onClick={handleImport}
 disabled={importing || !csvText || !csvAccountId}
 className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
 >
 {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
 ایمپورت تراکنش‌ها
 </Button>

 {/* نتیجه ایمپورت */}
 {importResult && (
 <div
 className={`rounded-lg p-3 space-y-2 text-xs ${
 importResult.status === "FAILED"
 ? "bg-destructive/5 border border-destructive/25"
 : importResult.status === "PARTIAL"
 ? "bg-warning/5 border border-warning/25"
 : "bg-success/5 border border-success/25"
 }`}
 >
 <div className="flex flex-wrap items-center gap-2">
 <Badge className={IMPORT_STATUS_COLOR[importResult.status] ?? "bg-muted"}>
 {IMPORT_STATUS_FA[importResult.status] ?? importResult.status}
 </Badge>
 <span>
 {toPersianDigits(importResult.rowsImported)} تراکنش ثبت شد
 {importResult.rowsSkipped > 0 &&
 `، ${toPersianDigits(importResult.rowsSkipped)} ردیف رد شد`}
 </span>
 {importResult.period && (
 <span className="text-muted-foreground">
 (دوره {toPersianDigits(importResult.period)} — در فهرست مغایرت‌گیری‌ها)
 </span>
 )}
 </div>
 {importResult.errors?.length > 0 && (
 <div className="space-y-1 max-h-40 overflow-y-auto styled-scroll">
 <div className="text-muted-foreground font-medium">
 ردیف‌های رد شده (حداکثر ۲۰ مورد):
 </div>
 {importResult.errors.slice(0, 20).map((e, i) => (
 <div key={i} className="flex gap-2 text-destructive/90">
 <span className="shrink-0">ردیف {toPersianDigits(e.row)}:</span>
 <span>{e.reason}</span>
 </div>
 ))}
 {importResult.errors.length > 20 && (
 <div className="text-muted-foreground">
 و {toPersianDigits(importResult.errors.length - 20)} مورد دیگر...
 </div>
 )}
 </div>
 )}
 </div>
 )}

 {/* تاریخچه ایمپورت‌ها */}
 <Collapsible open={importsOpen} onOpenChange={setImportsOpen}>
 <CollapsibleTrigger className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors">
 <span className="flex items-center gap-1.5 font-medium">
 <FileSpreadsheet className="h-4 w-4 text-teal-600" />
 تاریخچه ایمپورت‌ها
 {importsHistory.length > 0 && (
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(importsHistory.length)}
 </Badge>
 )}
 </span>
 <ChevronDown
 className={`h-4 w-4 text-muted-foreground transition-transform ${importsOpen ? "rotate-180" : ""}`}
 />
 </CollapsibleTrigger>
 <CollapsibleContent>
 <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto styled-scroll">
 {importsHistory.length === 0 ? (
 <div className="text-xs text-muted-foreground text-center py-6">
 هنوز صورتحسابی ایمپورت نشده است.
 </div>
 ) : (
 importsHistory.map((im) => (
 <div
 key={im.id}
 className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors"
 >
 <div className="flex-1 min-w-0">
 <div className="text-xs font-medium truncate">{im.fileName}</div>
 <div className="text-[10px] text-muted-foreground">
 {im.bankName ? `${im.bankName} — ` : ""}
 {toJalali(new Date(im.createdAt))}
 </div>
 </div>
 <div className="text-xs text-muted-foreground">
 {toPersianDigits(im.rowsImported)}/{toPersianDigits(im.rowsTotal)} تراکنش
 </div>
 <Badge className={`${IMPORT_STATUS_COLOR[im.status] ?? "bg-muted"} text-[10px]`}>
 {IMPORT_STATUS_FA[im.status] ?? im.status}
 </Badge>
 </div>
 ))
 )}
 </div>
 </CollapsibleContent>
 </Collapsible>
 </CardContent>
 </Card>

 {/* جدول مغایرت‌گیری‌ها */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">مغایرت‌گیری‌های اخیر</CardTitle>
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
 ): recs.length === 0? (
 <EmptyState
 icon={Landmark}
 title="هنوز مغایرت‌گیری ثبت نشده"
 description="با کلیک روی «مغایرت‌گیری جدید»، اولین تطبیق بانکی خود را آغاز کنید."
 action={
 <Button onClick={openWizard} className="gap-1.5">
 <Plus className="h-4 w-4" />
 مغایرت‌گیری جدید
 </Button>
 }
 />
 ): (
 <div className="max-h-[440px] overflow-y-auto -mx-2">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>بانک</TableHead>
 <TableHead>دوره</TableHead>
 <TableHead className="text-end">موجویی صورتحساب</TableHead>
 <TableHead className="text-end">موجویی دفتر</TableHead>
 <TableHead className="text-end">اختلاف</TableHead>
 <TableHead>وضعیت</TableHead>
 <TableHead className="text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {recs.map((r) => (
 <TableRow key={r.id}>
 <TableCell>
 <div className="font-medium">{r.bankName}</div>
 <div className="text-xs text-muted-foreground">
 {toPersianDigits(r.accountNumber)}
 </div>
 </TableCell>
 <TableCell className="font-mono text-xs">{toPersianDigits(r.period)}</TableCell>
 <TableCell className="text-end text-xs">{formatNumber(r.statementBalance)}</TableCell>
 <TableCell className="text-end text-xs">{formatNumber(r.bookBalance)}</TableCell>
 <TableCell className="text-end">
 <span className={r.difference === 0? "text-success font-medium": "text-destructive font-medium"}>
 {formatNumber(r.difference)}
 </span>
 </TableCell>
 <TableCell>
 <Badge className={STATUS_COLOR[r.status]?? "bg-muted"}>
 {STATUS_FA[r.status]?? r.status}
 </Badge>
 </TableCell>
 <TableCell className="text-end">
 <div className="flex justify-end gap-1">
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => openDetail(r.id)}
 title="جزئیات و تطبیق خطوط"
 disabled={r.status === "COMPLETED"}
 >
 <Eye className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-destructive hover:text-destructive"
 onClick={() => handleDelete(r.id)}
 title="حذف"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* جادوگر ایجاد */}
 <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>مغایرت‌گیری بانکی جدید</DialogTitle>
 <DialogDescription>
 اطلاعات دوره و خطوط صورت‌حساب بانک را وارد کنید. تطبیق خودکار پس از ذخیره انجام می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label>حساب بانکی</Label>
 <Select
 value={wForm.bankAccountId}
 onValueChange={(v) => setWForm({...wForm, bankAccountId: v })}
 >
 <SelectTrigger>
 <SelectValue placeholder="انتخاب حساب..." />
 </SelectTrigger>
 <SelectContent>
 {banks.map((b) => (
 <SelectItem key={b.id} value={b.id}>
 {b.bankName} — {toPersianDigits(b.accountNumber)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>دوره (سال-ماه میلادی)</Label>
 <Input
 type="month"
 value={wForm.period}
 onChange={(e) => setWForm({...wForm, period: e.target.value })}
 />
 </div>
 <div className="space-y-2">
 <Label>موجویی صورت‌حساب بانک (ریال)</Label>
 <Input
 type="number"
 value={wForm.statementBalance || ""}
 onChange={(e) => setWForm({...wForm, statementBalance: Number(e.target.value) })}
 />
 </div>
 <div className="space-y-2">
 <Label>یادداشت (اختیاری)</Label>
 <Input
 value={wForm.notes}
 onChange={(e) => setWForm({...wForm, notes: e.target.value })}
 />
 </div>
 </div>
 <div className="space-y-2">
 <Label className="flex items-center gap-1.5">
 <FileSpreadsheet className="h-4 w-4 text-info" />
 خطوط صورت‌حساب (هر خط: تاریخ,شرح,مبلغ)
 </Label>
 <Textarea
 rows={8}
 dir="ltr"
 className="text-xs font-mono"
 value={statementText}
 onChange={(e) => setStatementText(e.target.value)}
 placeholder={"2024-10-01,Deposit from invoice 1023,5000000\n2024-10-05,Check 88231 cleared,-3000000"}
 />
 <p className="text-xs text-muted-foreground">
 مبلغ مثبت = واریز، مبلغ منفی = برداشت. تاریخ میلادی (YYYY-MM-DD).
 </p>
 </div>
 <div className="bg-muted/50 rounded-lg p-3 text-xs">
 <div className="font-medium mb-1">پیش‌نمایش خطوط:</div>
 <div className="text-muted-foreground">
 {toPersianDigits(parseStatementText().length)} خط معتبر شناسایی شد.
 </div>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setWizardOpen(false)}>انصراف</Button>
 <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
 {creating && <Loader2 className="h-4 w-4 animate-spin" />}
 <Play className="h-4 w-4" />
 ایجاد و تطبیق خودکار
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ جزئیات و تطبیق خطوط */}
 <Dialog open={!!detail} onOpenChange={(o) =>!o && setDetail(null)}>
 <DialogContent className="max-w-4xl">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Landmark className="h-4 w-4 text-primary" />
 مغایرت‌گیری {detail && toPersianDigits(detail.period)}
 </DialogTitle>
 <DialogDescription>
 {detail?.bankName} — {detail && toPersianDigits(detail.accountNumber)}
 </DialogDescription>
 </DialogHeader>
 {detail && (
 <>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
 <DetailStat
 label="موجویی صورتحساب"
 value={formatNumber(detail.statementBalance)}
 color=""
 />
 <DetailStat
 label="موجویی دفتر"
 value={formatNumber(detail.bookBalance)}
 color=""
 />
 <DetailStat
 label="اختلاف"
 value={formatNumber(detail.difference)}
 color={detail.difference === 0? "text-success": "text-destructive"}
 />
 <DetailStat
 label="تطبیق‌ها"
 value={`${toPersianDigits(matchedCount)} / ${toPersianDigits(detailLines.length)}`}
 color=""
 />
 </div>

 {unmatchedCount > 0 && (
 <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs text-warning flex items-center gap-2 mb-2">
 <AlertTriangle className="h-4 w-4" />
 {toPersianDigits(unmatchedCount)} خط هنوز تطبیق داده نشده‌اند. برای تکمیل، همه‌ی خطوط را
 «تطبیق» یا «نادیده» کنید.
 </div>
 )}

 {detailLoading? (
 <div className="flex justify-center py-10">
 <Loader2 className="h-6 w-6 animate-spin" />
 </div>
 ): (
 <div className="max-h-[400px] overflow-y-auto -mx-2">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>تاریخ</TableHead>
 <TableHead>شرح</TableHead>
 <TableHead className="text-end">مبلغ</TableHead>
 <TableHead>وضعیت</TableHead>
 <TableHead className="text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {detailLines.map((l) => (
 <TableRow
 key={l.id}
 className={
 l.status === "MATCHED"
? "bg-success/5"
: l.status === "IGNORED"
? "bg-muted/40"
: "bg-destructive/5"
 }
 >
 <TableCell className="text-xs">{toJalali(new Date(l.date))}</TableCell>
 <TableCell className="text-xs">{l.description}</TableCell>
 <TableCell className="text-end text-xs">
 <span className={l.amount >= 0? "text-success": "text-destructive"}>
 {l.amount >= 0? "+": ""}
 {formatNumber(l.amount)}
 </span>
 </TableCell>
 <TableCell>
 <div className="flex items-center gap-1.5">
 {l.status === "MATCHED"? (
 <CheckCircle2 className="h-3.5 w-3.5 text-success" />
 ): l.status === "IGNORED"? (
 <Circle className="h-3.5 w-3.5 text-muted-foreground" />
 ): (
 <XCircle className="h-3.5 w-3.5 text-destructive" />
 )}
 <span className="text-xs">
 {LINE_STATUS_FA[l.status]?? l.status}
 </span>
 </div>
 </TableCell>
 <TableCell className="text-end">
 <div className="flex justify-end gap-1">
 {l.status === "UNMATCHED"? (
 <>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 gap-1 text-success"
 onClick={() => handleLineAction(detail.id, l.id, "match")}
 >
 <Link2 className="h-3.5 w-3.5" />
 تطبیق
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7"
 onClick={() => handleLineAction(detail.id, l.id, "ignore")}
 >
 نادیده
 </Button>
 </>
 ): (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 gap-1"
 onClick={() => handleLineAction(detail.id, l.id, "unmatch")}
 >
 <Unlink className="h-3.5 w-3.5" />
 لغو
 </Button>
 )}
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}

 <DialogFooter className="flex items-center justify-between">
 <div className="text-xs text-muted-foreground">
 تطبیق: {toPersianDigits(matchedCount)} — نادیده: {toPersianDigits(ignoredCount)} — تطبیق‌نخورده: {toPersianDigits(unmatchedCount)}
 </div>
 <div className="flex gap-2">
 <Button variant="outline" onClick={() => setDetail(null)}>بستن</Button>
 <Button
 onClick={() => handleComplete(detail.id)}
 disabled={unmatchedCount > 0 || detail.status === "COMPLETED"}
 className="gap-1.5"
 >
 <Check className="h-4 w-4" />
 تکمیل مغایرت‌گیری
 </Button>
 </div>
 </DialogFooter>
 </>
 )}
 </DialogContent>
 </Dialog>
 </div>
 );
}

/* ============ اجزای داخلی ============ */
function DetailStat({
 label,
 value,
 color,
}: {
 label: string;
 value: string;
 color: string;
}) {
 return (
 <div className="bg-muted rounded-lg p-2.5">
 <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
 <div className={`font-bold text-sm ${color}`}>{value}</div>
 </div>
 );
}
