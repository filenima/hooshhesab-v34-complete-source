"use client";

/**
 * OCRBatchUpload — آپلود و پردازش دسته‌ای تصاویر فاکتور با VLM
 *
 * قابلیت‌ها:
 * - drag-and-drop چند تصویر همزمان
 * - پیش‌نمایش thumbnail هر تصویر
 * - نمایش پیشرفت پردازش هر تصویر
 * - جدول نتایج: thumbnail، داده‌ی استخراج‌شده، وضعیت
 * - دکمه‌ی «ایجاد فاکتور» برای هر نتیجه
 * - دکمه‌ی «ایجاد همه» برای ساخت دسته‌ای
 *
 * از /api/ai/ocr-batch با حالت stream (SSE) استفاده می‌کند تا نتیجه‌ی هر تصویر
 * به‌محض آماده شدن نمایش داده شود.
 */

import * as React from "react";
import {
 Upload,
 FileImage,
 Loader2,
 CheckCircle2,
 XCircle,
 Trash2,
 Sparkles,
 FilePlus2,
 Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface OCRItem {
 description: string;
 qty: number;
 unitPrice: number;
 lineTotal: number;
}

interface OCRResult {
 sellerName: string;
 buyerName: string;
 invoiceNumber: string;
 date: string;
 totalAmount: number;
 vat: number;
 items: OCRItem[];
}

type FileStatus = "pending" | "processing" | "done" | "error";

interface FileEntry {
 id: string;
 file: File;
 dataUrl: string;
 status: FileStatus;
 progress: number;
 result?: OCRResult;
 error?: string;
}

interface SSEMessage {
 type: "start" | "progress" | "done";
 index?: number;
 total?: number;
 success?: boolean;
 data?: OCRResult;
 error?: string;
}

const MAX_FILES = 10;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function OCRBatchUpload({ onCreated }: { onCreated?: (r: OCRResult) => void }) {
 const { toast } = useToast();
 const [files, setFiles] = React.useState<FileEntry[]>([]);
 const [processing, setProcessing] = React.useState(false);
 const [dragOver, setDragOver] = React.useState(false);
 const inputRef = React.useRef<HTMLInputElement>(null);

 const addFiles = React.useCallback(async (fileList: FileList | File[]) => {
 const arr = Array.from(fileList).filter(
 (f) => f.type.startsWith("image/") && f.size <= MAX_SIZE_BYTES
 );
 if (arr.length === 0) {
 toast({
 title: "فایل نامعتبر",
 description: "فقط تصویر با حداکثر ۵ مگابایت مجاز است.",
 variant: "destructive",
 });
 return;
 }
 const entries: FileEntry[] = [];
 for (const f of arr) {
 if (files.length + entries.length >= MAX_FILES) {
 toast({
 title: "سقف مجاز",
 description: `حداکثر ${toPersianDigits(MAX_FILES)} تصویر در هر دسته.`,
 });
 break;
 }
 const dataUrl = await readFileAsDataURL(f);
 entries.push({
 id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
 file: f,
 dataUrl,
 status: "pending",
 progress: 0,
 });
 }
 setFiles((prev) => [...prev,...entries]);
 }, [files.length, toast]);

 const removeFile = React.useCallback((id: string) => {
 setFiles((prev) => prev.filter((f) => f.id!== id));
 }, []);

 const clearAll = React.useCallback(() => {
 setFiles([]);
 }, []);

 // ===== پردازش دسته‌ای با SSE =====
 const processBatch = React.useCallback(async () => {
 const pending = files.filter((f) => f.status === "pending" || f.status === "error");
 if (pending.length === 0) {
 toast({
 title: "تصویری برای پردازش نیست",
 description: "ابتدا تصویر جدید اضافه کنید.",
 });
 return;
 }

 setProcessing(true);
 // همه را pending processing با progress 0
 setFiles((prev) =>
 prev.map((f) =>
 f.status === "pending" || f.status === "error"
? {...f, status: "processing", progress: 0, error: undefined }
: f
 )
 );

 try {
 const res = await authFetch("/api/ai/ocr-batch", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 images: pending.map((f) => f.dataUrl),
 stream: true,
 }),
 });

 if (!res.ok ||!res.body) {
 throw new Error("پاسخ سرور نامعتبر");
 }

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer = "";

 const indexToId = new Map<number, string>();
 pending.forEach((f, i) => indexToId.set(i, f.id));

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split("\n");
 buffer = lines.pop()?? "";
 for (const line of lines) {
 const trimmed = line.trim();
 if (!trimmed.startsWith("data:")) continue;
 const inner = trimmed.slice(5).trim();
 if (inner === "[DONE]") continue;
 try {
 const msg: SSEMessage = JSON.parse(inner);
 if (msg.type === "progress" && msg.index!== undefined) {
 const id = indexToId.get(msg.index);
 if (!id) continue;
 setFiles((prev) =>
 prev.map((f) =>
 f.id === id
? {
...f,
 status: msg.success? "done": "error",
 progress: 100,
 result: msg.data,
 error: msg.error,
 }
: f
 )
 );
 } else if (msg.type === "progress") {
 // به‌روزرسانی جزئی پیشرفت (placeholder)
 }
 } catch {
 // ignore parse errors
 }
 }
 }

 toast({
 title: "پردازش دسته‌ای کامل شد",
 description: `${toPersianDigits(pending.length)} تصویر پردازش شد.`,
 });
 } catch (err) {
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 toast({
 title: "خطا در پردازش دسته‌ای",
 description: msg,
 variant: "destructive",
 });
 setFiles((prev) =>
 prev.map((f) =>
 f.status === "processing"? {...f, status: "error", error: msg }: f
 )
 );
 } finally {
 setProcessing(false);
 }
 }, [files, toast]);

 const createInvoice = React.useCallback(
 (entry: FileEntry) => {
 if (!entry.result) return;
 onCreated?.(entry.result);
 toast({
 title: "ایجاد فاکتور",
 description: `فاکتور ${entry.result.invoiceNumber || "بدون شماره"} از ${entry.result.sellerName || "نامشخص"} آماده‌ی ثبت است.`,
 });
 },
 [onCreated, toast]
 );

 const createAll = React.useCallback(() => {
 const done = files.filter((f) => f.status === "done" && f.result);
 if (done.length === 0) {
 toast({
 title: "نتیجه‌ای برای ایجاد فاکتور وجود ندارد",
 description: "ابتدا تصاویر را پردازش کنید.",
 });
 return;
 }
 done.forEach((f) => f.result && onCreated?.(f.result));
 toast({
 title: "ایجاد دسته‌ای",
 description: `${toPersianDigits(done.length)} فاکتور آماده‌ی ثبت شد.`,
 });
 }, [files, onCreated, toast]);

 const stats = React.useMemo(() => {
 return {
 total: files.length,
 pending: files.filter((f) => f.status === "pending").length,
 processing: files.filter((f) => f.status === "processing").length,
 done: files.filter((f) => f.status === "done").length,
 error: files.filter((f) => f.status === "error").length,
 };
 }, [files]);

 return (
 <Card className="overflow-hidden">
 <CardHeader>
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div>
 <CardTitle className="flex items-center gap-2">
 <Layers className="h-5 w-5 text-primary" />
 پردازش دسته‌ای OCR
 </CardTitle>
 <CardDescription className="mt-1">
 چند فاکتور را همزمان آپلود کنید تا با هوش مصنوعی استخراج شوند
 </CardDescription>
 </div>
 {files.length > 0 && (
 <div className="flex items-center gap-2">
 <Badge variant="secondary">
 کل: {toPersianDigits(stats.total)}
 </Badge>
 {stats.done > 0 && (
 <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
 موفق: {toPersianDigits(stats.done)}
 </Badge>
 )}
 {stats.error > 0 && (
 <Badge className="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
 خطا: {toPersianDigits(stats.error)}
 </Badge>
 )}
 {stats.processing > 0 && (
 <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
 در حال پردازش: {toPersianDigits(stats.processing)}
 </Badge>
 )}
 </div>
 )}
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* ناحیه‌ی drag-and-drop */}
 <div
 onDragOver={(e) => {
 e.preventDefault();
 setDragOver(true);
 }}
 onDragLeave={() => setDragOver(false)}
 onDrop={(e) => {
 e.preventDefault();
 setDragOver(false);
 if (e.dataTransfer.files.length > 0) {
 void addFiles(e.dataTransfer.files);
 }
 }}
 className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
 dragOver
? "border-primary bg-primary/5"
: "border-border hover:border-primary/50 hover:bg-muted/30"
 }`}
 onClick={() => inputRef.current?.click()}
 >
 <input
 ref={inputRef}
 type="file"
 accept="image/*"
 multiple
 className="hidden"
 onChange={(e) => {
 if (e.target.files && e.target.files.length > 0) {
 void addFiles(e.target.files);
 e.target.value = "";
 }
 }}
 />
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
 <Upload className="h-6 w-6" />
 </div>
 <p className="text-sm font-medium text-foreground">
 تصاویر فاکتور را اینجا رها کنید
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 یا برای انتخاب کلیک کنید — حداکثر {toPersianDigits(MAX_FILES)} تصویر، هر کدام تا ۵ مگابایت
 </p>
 </div>

 {/* دکمه‌های اقدام */}
 {files.length > 0 && (
 <div className="flex items-center gap-2 flex-wrap">
 <Button
 onClick={processBatch}
 disabled={processing || stats.pending + stats.error === 0}
 >
 {processing? (
 <>
 <Loader2 className="h-4 w-4 me-2 animate-spin" />
 در حال پردازش...
 </>
 ): (
 <>
 <Sparkles className="h-4 w-4 me-2" />
 پردازش دسته‌ای
 </>
 )}
 </Button>
 <Button
 variant="secondary"
 onClick={createAll}
 disabled={stats.done === 0 || processing}
 >
 <FilePlus2 className="h-4 w-4 me-2" />
 ایجاد همه ({toPersianDigits(stats.done)})
 </Button>
 <Button
 variant="ghost"
 onClick={clearAll}
 disabled={processing}
 >
 <Trash2 className="h-4 w-4 me-2" />
 پاک کردن همه
 </Button>
 </div>
 )}

 {/* لیست نتایج */}
 {files.length > 0 && (
 <div className="space-y-3 max-h-[480px] overflow-y-auto pe-1">
 {files.map((entry) => (
 <div
 key={entry.id}
 className="rounded-lg border border-border bg-card p-3 space-y-3"
 >
 <div className="flex items-start gap-3">
 {/* thumbnail */}
 <div className="h-16 w-16 shrink-0 rounded-md overflow-hidden border border-border bg-muted">
 <img
 src={entry.dataUrl}
 alt={entry.file.name}
 className="h-full w-full object-cover"
 />
 </div>
 {/* اطلاعات فایل */}
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-sm font-medium text-foreground truncate" title={entry.file.name}>
 {entry.file.name}
 </p>
 <p className="text-xs text-muted-foreground">
 {toPersianDigits(Math.round(entry.file.size / 1024))} کیلوبایت
 </p>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 <StatusBadge status={entry.status} />
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => removeFile(entry.id)}
 disabled={processing}
 aria-label="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>
 {entry.status === "processing" && (
 <Progress value={entry.progress} className="h-1.5 mt-2" />
 )}
 </div>
 </div>

 {/* نتیجه‌ی استخراج‌شده */}
 {entry.status === "done" && entry.result && (
 <ExtractedData result={entry.result} onCreate={() => createInvoice(entry)} />
 )}
 {entry.status === "error" && entry.error && (
 <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-700 dark:text-red-300">
 {entry.error}
 </div>
 )}
 </div>
 ))}
 </div>
 )}

 {files.length === 0 && (
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <FileImage className="h-4 w-4" />
 <span>هنوز تصویری اضافه نشده — حداقل ۱ تصویر برای شروع لازم است.</span>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

/* ============ اجزای فرعی ============ */

function StatusBadge({ status }: { status: FileStatus }) {
 if (status === "pending") {
 return <Badge variant="outline">در انتظار</Badge>;
 }
 if (status === "processing") {
 return (
 <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
 در حال پردازش
 </Badge>
 );
 }
 if (status === "done") {
 return (
 <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
 <CheckCircle2 className="h-3 w-3 me-1" />
 موفق
 </Badge>
 );
 }
 return (
 <Badge className="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
 <XCircle className="h-3 w-3 me-1" />
 خطا
 </Badge>
 );
}

function ExtractedData({
 result,
 onCreate,
}: {
 result: OCRResult;
 onCreate: () => void;
}) {
 return (
 <div className="rounded-md bg-muted/40 p-3 space-y-2 text-xs">
 <div className="grid grid-cols-2 gap-2">
 <Field label="فروشنده" value={result.sellerName} />
 <Field label="خریدار" value={result.buyerName} />
 <Field label="شماره فاکتور" value={result.invoiceNumber} />
 <Field label="تاریخ" value={result.date} />
 <Field
 label="مبلغ کل"
 value={result.totalAmount > 0? `${formatNumber(result.totalAmount)} تومان`: "—"}
 />
 <Field
 label="ارزش افزوده"
 value={result.vat > 0? `${formatNumber(result.vat)} تومان`: "—"}
 />
 </div>
 {result.items.length > 0 && (
 <div className="border-t border-border pt-2">
 <p className="text-[11px] font-medium text-muted-foreground mb-1">
 آیتم‌ها ({toPersianDigits(result.items.length)}):
 </p>
 <div className="space-y-1 max-h-32 overflow-y-auto">
 {result.items.slice(0, 8).map((it, i) => (
 <div
 key={i}
 className="flex items-center justify-between gap-2 text-[11px]"
 >
 <span className="text-foreground truncate">
 {toPersianDigits(i + 1)}. {it.description || "بدون شرح"}
 </span>
 <span className="text-muted-foreground shrink-0">
 {toPersianDigits(it.qty)} × {formatNumber(it.unitPrice)}
 </span>
 </div>
 ))}
 {result.items.length > 8 && (
 <p className="text-[10px] text-muted-foreground">
 +{toPersianDigits(result.items.length - 8)} آیتم دیگر...
 </p>
 )}
 </div>
 </div>
 )}
 <Button size="sm" className="w-full" onClick={onCreate}>
 <FilePlus2 className="h-3.5 w-3.5 me-1.5" />
 ایجاد فاکتور
 </Button>
 </div>
 );
}

function Field({ label, value }: { label: string; value: string }) {
 return (
 <div className="min-w-0">
 <p className="text-[10px] text-muted-foreground">{label}</p>
 <p className="text-foreground truncate" title={value}>
 {value || "—"}
 </p>
 </div>
 );
}

/* ============ helper ============ */
function readFileAsDataURL(file: File): Promise<string> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(String(reader.result?? ""));
 reader.onerror = () => reject(reader.error?? new Error("read failed"));
 reader.readAsDataURL(file);
 });
}

export default OCRBatchUpload;
