"use client";

/**
 * FileDropzone — ناحیه‌ی آپلود فایل با drag-and-drop
 *
 * - پشتیبانی از drag-and-drop و کلیک برای انتخاب فایل
 * - پیش‌نمایش فایل (تصویر thumbnail یا آیکن فایل)
 * - اعتبارسنجی نوع و حجم فایل
 * - نمایش نوار پیشرفت (شبیه‌سازی شده)
 * - تم ایندیگو
 *
 * استفاده‌ها: آپلود OCR فاکتور، آپلود لوگو، آپلود گروهی CSV
 */

import * as React from "react";
import { UploadCloud, File as FileIcon, X, ImageIcon, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, toPersianDigits } from "@/lib/persian";

export interface FileDropzoneProps {
 /** فراخوانی هنگام انتخاب فایل معتبر */
 onFile: (file: File) => void;
 /** انواع مجاز (مثلاً "image/*" یا "image/png,image/jpeg" یا ".csv") */
 accept?: string;
 /** برچسب راهنما داخل ناحیه */
 label?: string;
 /** برچسب ثانویه‌ی کوچک‌تر */
 hint?: string;
 /** حداکثر حجم به مگابایت */
 maxSize?: number; // MB
 /** پاک کردن خودکار فایل پیشین هنگام انتخاب فایل جدید (پیش‌فرض true) */
 clearOnNew?: boolean;
 className?: string;
 /** نمایش پیش‌نمایش تصویر (پیش‌فرض true) */
 showPreview?: boolean;
 /** در صورت نیاز به حذف فایل انتخابی */
 onClear?: () => void;
}

interface DropState {
 file: File | null;
 previewUrl: string | null;
 progress: number;
 status: "idle" | "uploading" | "done" | "error";
 error: string | null;
}

function formatBytes(bytes: number): string {
 if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
 if (bytes < 1024 * 1024) return `${formatNumber(Number((bytes / 1024).toFixed(1)))} کیلوبایت`;
 return `${formatNumber(Number((bytes / 1024 / 1024).toFixed(2)))} مگابایت`;
}

function isImageFile(file: File): boolean {
 return file.type.startsWith("image/");
}

function matchesAccept(file: File, accept?: string): boolean {
 if (!accept) return true;
 const patterns = accept.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
 if (patterns.length === 0) return true;
 const fileName = file.name.toLowerCase();
 const fileType = file.type.toLowerCase();
 return patterns.some((pattern) => {
 if (pattern.endsWith("/*")) {
 const prefix = pattern.slice(0, -1); // "image/"
 return fileType.startsWith(prefix);
 }
 if (pattern.startsWith(".")) {
 return fileName.endsWith(pattern);
 }
 return fileType === pattern;
 });
}

export function FileDropzone({
 onFile,
 accept,
 label = "فایل را اینجا رها کنید یا کلیک کنید",
 hint,
 maxSize = 10,
 clearOnNew = true,
 className,
 showPreview = true,
 onClear,
}: FileDropzoneProps) {
 const inputRef = React.useRef<HTMLInputElement>(null);
 const [state, setState] = React.useState<DropState>({
 file: null,
 previewUrl: null,
 progress: 0,
 status: "idle",
 error: null,
 });
 const [isDragging, setIsDragging] = React.useState(false);
 const dragCounter = React.useRef(0);

 // پاکسازی Object URL هنگام unmount یا تغییر فایل
 React.useEffect(() => {
 return () => {
 if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
 };
 }, [state.previewUrl]);

 const validateAndSet = React.useCallback(
 (file: File) => {
 if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);

 // اعتبارسنجی نوع
 if (!matchesAccept(file, accept)) {
 setState({
 file: null,
 previewUrl: null,
 progress: 0,
 status: "error",
 error: "نوع فایل مجاز نیست",
 });
 return;
 }
 // اعتبارسنجی حجم
 const sizeMb = file.size / 1024 / 1024;
 if (sizeMb > maxSize) {
 setState({
 file: null,
 previewUrl: null,
 progress: 0,
 status: "error",
 error: `حجم فایل نباید بیشتر از ${toPersianDigits(maxSize)} مگابایت باشد`,
 });
 return;
 }

 const previewUrl = isImageFile(file)? URL.createObjectURL(file): null;
 setState({
 file,
 previewUrl,
 progress: 0,
 status: "uploading",
 error: null,
 });

 // شبیه‌سازی نوار پیشرفت (چون آپلود واقعی توسط parent انجام می‌شود)
 let p = 0;
 const interval = setInterval(() => {
 p += Math.random() * 18 + 6;
 if (p >= 100) {
 p = 100;
 clearInterval(interval);
 setState((s) => ({...s, progress: 100, status: "done" }));
 // فراخوانی callback پس از پایان شبیه‌سازی
 onFile(file);
 } else {
 setState((s) => ({...s, progress: p }));
 }
 }, 120);
 },
 [accept, maxSize, onFile, state.previewUrl]
 );

 const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
 e.preventDefault();
 e.stopPropagation();
 dragCounter.current += 1;
 if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
 setIsDragging(true);
 }
 };

 const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
 e.preventDefault();
 e.stopPropagation();
 dragCounter.current -= 1;
 if (dragCounter.current <= 0) {
 setIsDragging(false);
 dragCounter.current = 0;
 }
 };

 const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
 e.preventDefault();
 e.stopPropagation();
 };

 const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
 e.preventDefault();
 e.stopPropagation();
 setIsDragging(false);
 dragCounter.current = 0;
 if (clearOnNew) {
 // nothing special — validateAndSet handles replacement
 }
 const files = Array.from(e.dataTransfer.files || []);
 if (files.length === 0) return;
 validateAndSet(files[0]);
 };

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (file) validateAndSet(file);
 // reset input value تا همان فایل دوباره قابل انتخاب باشد
 if (inputRef.current) inputRef.current.value = "";
 };

 const handleClear = () => {
 if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
 setState({
 file: null,
 previewUrl: null,
 progress: 0,
 status: "idle",
 error: null,
 });
 onClear?.();
 };

 const triggerBrowse = () => {
 if (state.status === "uploading") return;
 inputRef.current?.click();
 };

 return (
 <div className={cn("w-full", className)}>
 <input
 ref={inputRef}
 type="file"
 accept={accept}
 onChange={handleInputChange}
 className="hidden"
 />

 {!state.file &&!state.error && (
 <div
 onDragEnter={handleDragEnter}
 onDragLeave={handleDragLeave}
 onDragOver={handleDragOver}
 onDrop={handleDrop}
 onClick={triggerBrowse}
 role="button"
 tabIndex={0}
 onKeyDown={(e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 triggerBrowse();
 }
 }}
 aria-label={label}
 className={cn(
 "relative flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed cursor-pointer transition-all px-6 py-10",
 isDragging
? "border-primary bg-primary/10 scale-[1.01]"
: "border-border hover:border-primary/60 hover:bg-muted/50 bg-card"
 )}
 >
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
 <UploadCloud className="h-6 w-6" strokeWidth={1.75} />
 </div>
 <p className="text-sm font-medium text-foreground">{label}</p>
 {hint && (
 <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">{hint}</p>
 )}
 {accept && (
 <p className="text-[11px] text-muted-foreground mt-2">
 انواع مجاز:{" "}
 <span dir="ltr" className="font-mono">
 {accept}
 </span>
 </p>
 )}
 {maxSize > 0 && (
 <p className="text-[11px] text-muted-foreground">
 حداکثر حجم: {toPersianDigits(maxSize)} مگابایت
 </p>
 )}
 </div>
 )}

 {/* حالت خطا */}
 {state.error &&!state.file && (
 <div
 onDragEnter={handleDragEnter}
 onDragLeave={handleDragLeave}
 onDragOver={handleDragOver}
 onDrop={handleDrop}
 onClick={triggerBrowse}
 role="button"
 tabIndex={0}
 className="relative flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed border-destructive/60 bg-destructive/5 cursor-pointer px-6 py-10"
 >
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
 <AlertCircle className="h-6 w-6" strokeWidth={1.75} />
 </div>
 <p className="text-sm font-medium text-destructive">{state.error}</p>
 <p className="text-xs text-muted-foreground mt-1">برای انتخاب مجدد کلیک کنید</p>
 </div>
 )}

 {/* پیش‌نمایش فایل انتخابی */}
 {state.file && (
 <div className="rounded-xl border border-border bg-card p-4">
 <div className="flex items-start gap-3">
 {/* پیش‌نمایش تصویر یا آیکن فایل */}
 {showPreview && state.previewUrl? (
 <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-border bg-muted">
 <img
 src={state.previewUrl}
 alt={state.file.name}
 className="h-full w-full object-cover"
 />
 </div>
 ): (
 <div className="h-16 w-16 shrink-0 rounded-lg border border-border bg-primary/10 flex items-center justify-center text-primary">
 {isImageFile(state.file)? (
 <ImageIcon className="h-7 w-7" strokeWidth={1.5} />
 ): (
 <FileIcon className="h-7 w-7" strokeWidth={1.5} />
 )}
 </div>
 )}

 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-sm font-medium text-foreground truncate" title={state.file.name}>
 {state.file.name}
 </p>
 <p className="text-xs text-muted-foreground mt-0.5">
 {formatBytes(state.file.size)}
 </p>
 </div>
 <button
 type="button"
 onClick={handleClear}
 aria-label="حذف فایل"
 className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
 >
 <X className="h-4 w-4" />
 </button>
 </div>

 {/* نوار پیشرفت */}
 {state.status === "uploading" && (
 <div className="mt-3">
 <div className="flex items-center gap-2">
 <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
 <div
 className="h-full bg-primary transition-all duration-150 ease-out"
 style={{ width: `${state.progress}%` }}
 />
 </div>
 <span className="text-[11px] text-muted-foreground tnum">
 {toPersianDigits(Math.round(state.progress))}٪
 </span>
 </div>
 <div className="flex items-center gap-1.5 mt-1.5">
 <Loader2 className="h-3 w-3 animate-spin text-primary" />
 <span className="text-[11px] text-muted-foreground">در حال بارگذاری...</span>
 </div>
 </div>
 )}

 {/* حالت موفق */}
 {state.status === "done" && (
 <div className="flex items-center gap-1.5 mt-2">
 <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
 <span className="text-[11px] text-primary font-medium">فایل آماده شد</span>
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

export default FileDropzone;
