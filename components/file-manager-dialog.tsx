"use client";

import * as React from "react";
import {
 Upload,
 Search,
 Check,
 X,
 FileImage,
 Loader2,
 Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toJalali, toPersianDigits } from "@/lib/persian";

export interface FileManagerFile {
 name: string;
 url: string;
 size: number;
 sizeHuman: string;
 ext: string;
 uploadedAt: string;
}

interface FileManagerDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 token: string;
 onSelect: (url: string, file?: FileManagerFile) => void;
 title?: string;
 description?: string;
 /** در صورت ارسال، این تصویر به‌عنوان انتخاب‌شده فعلی نشان داده می‌شود */
 currentUrl?: string | null;
}

// محدودیت‌ها (هماهنگ با backend)
const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

function humanSize(bytes: number): string {
 if (bytes < 1024) return `${bytes} B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
 return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function FileManagerDialog({
 open,
 onOpenChange,
 token,
 onSelect,
 title = "انتخاب تصویر",
 description = "از بین تصاویر آپلودشده انتخاب کنید یا تصویر جدیدی آپلود کنید",
 currentUrl,
}: FileManagerDialogProps) {
 const { toast } = useToast();
 const [files, setFiles] = React.useState<FileManagerFile[]>([]);
 const [loading, setLoading] = React.useState(false);
 const [search, setSearch] = React.useState("");
 const [selectedUrl, setSelectedUrl] = React.useState<string | null>(null);
 const [selectedFile, setSelectedFile] = React.useState<FileManagerFile | null>(null);
 const [uploading, setUploading] = React.useState(false);
 const [dragOver, setDragOver] = React.useState(false);
 const fileInputRef = React.useRef<HTMLInputElement>(null);

 // بارگذاری لیست فایل‌ها
 const loadFiles = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/files/list", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setFiles(data.data || []);
 } catch (e) {
 toast({
 title: "خطا در دریافت فایل‌ها",
 description: e instanceof Error? e.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 if (open) {
 void loadFiles();
 setSelectedUrl(currentUrl || null);
 setSelectedFile(null);
 setSearch("");
 }
 }, [open, loadFiles, currentUrl]);

 // آپلود فایل
 const uploadFile = async (file: File) => {
 if (!file) return;
 if (!ACCEPTED_TYPES.includes(file.type)) {
 toast({
 title: "نوع فایل نامعتبر",
 description: "فقط فایل‌های jpg, png, webp, gif, svg مجاز هستند.",
 variant: "destructive",
 });
 return;
 }
 if (file.size > MAX_SIZE) {
 toast({
 title: "حجم فایل زیاد",
 description: "حداکثر حجم مجاز ۵ مگابایت است.",
 variant: "destructive",
 });
 return;
 }

 setUploading(true);
 try {
 const formData = new FormData();
 formData.append("file", file);
 const res = await fetch("/api/files/upload", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}` },
 body: formData,
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);

 // افزودن فایل آپلودشده به ابتدای لیست
 const newFile: FileManagerFile = {
 name: data.data.name,
 url: data.data.url,
 size: data.data.size,
 sizeHuman: humanSize(data.data.size),
 ext: data.data.type.split("/")[1] || "",
 uploadedAt: data.data.uploadedAt,
 };
 setFiles((prev) => [newFile,...prev.filter((f) => f.url!== newFile.url)]);
 // انتخاب خودکار فایل آپلودشده
 setSelectedUrl(newFile.url);
 setSelectedFile(newFile);

 toast({
 title: "آپلود شد",
 description: "فایل با موفقیت آپلود و برای انتخاب آماده شد.",
 });
 } catch (e) {
 toast({
 title: "خطا در آپلود",
 description: e instanceof Error? e.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setUploading(false);
 if (fileInputRef.current) fileInputRef.current.value = "";
 }
 };

 const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (file) void uploadFile(file);
 };

 const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
 e.preventDefault();
 setDragOver(false);
 const file = e.dataTransfer.files?.[0];
 if (file) void uploadFile(file);
 };

 // فیلتر بر اساس جستجو
 const filtered = React.useMemo(() => {
 if (!search.trim()) return files;
 const q = search.toLowerCase();
 return files.filter((f) => f.name.toLowerCase().includes(q) || f.ext.toLowerCase().includes(q));
 }, [files, search]);

 const handleSelect = () => {
 if (!selectedUrl) {
 toast({
 title: "تصویری انتخاب نشده",
 description: "ابتدا یک تصویر را انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 onSelect(selectedUrl, selectedFile || undefined);
 onOpenChange(false);
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-3xl max-h-[90dvh] flex flex-col gap-4 p-0">
 <DialogHeader className="p-5 pb-3 border-b border-border">
 <DialogTitle className="flex items-center gap-2 text-base">
 <Folder className="h-4 w-4 text-primary" />
 {title}
 </DialogTitle>
 <DialogDescription className="text-xs">{description}</DialogDescription>
 </DialogHeader>

 {/* نوار ابزار: جستجو + آپلود */}
 <div className="px-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی فایل..."
 className="ps-9 h-9"
 />
 </div>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
 onChange={handleFileChange}
 className="hidden"
 />
 <Button
 type="button"
 variant="default"
 size="sm"
 className="h-9"
 onClick={() => fileInputRef.current?.click()}
 disabled={uploading}
 >
 {uploading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال آپلود...
 </>
 ): (
 <>
 <Upload className="h-4 w-4" />
 آپلود تصویر
 </>
 )}
 </Button>
 </div>

 {/* منطقه drag-and-drop و گالری */}
 <div className="px-5 flex-1 overflow-hidden">
 <div
 onDragOver={(e) => {
 e.preventDefault();
 setDragOver(true);
 }}
 onDragLeave={() => setDragOver(false)}
 onDrop={handleDrop}
 className={`relative h-full min-h-[280px] rounded-lg border-2 border-dashed transition-colors ${
 dragOver? "border-primary bg-primary/5": "border-border bg-muted/20"
 }`}
 >
 {loading? (
 <div className="absolute inset-0 flex items-center justify-center">
 <div className="flex items-center gap-2 text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" />
 <span className="text-xs">در حال بارگذاری...</span>
 </div>
 </div>
 ): filtered.length === 0? (
 <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-6">
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
 <FileImage className="h-6 w-6" />
 </div>
 <p className="text-sm font-medium text-foreground">
 {search? "فایلی مطابق جستجو یافت نشد": "هنوز فایلی آپلود نشده"}
 </p>
 <p className="text-[11px] text-muted-foreground max-w-sm">
 برای آپلود، روی دکمه «آپلود تصویر» کلیک کنید یا فایل را اینجا رها کنید.
 </p>
 </div>
 ): (
 <div className="h-full overflow-y-auto p-3">
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
 {filtered.map((f) => {
 const isSelected = selectedUrl === f.url;
 const isCurrent = currentUrl === f.url;
 return (
 <button
 key={f.url}
 type="button"
 onClick={() => {
 setSelectedUrl(f.url);
 setSelectedFile(f);
 }}
 className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
 isSelected
? "border-primary ring-2 ring-primary/30"
: "border-border hover:border-primary/50"
 }`}
 >
 {/* پیش‌نمایش تصویر */}
 <div className="absolute inset-0 bg-muted flex items-center justify-center">
 { }
 <img
 src={f.url}
 alt={f.name}
 className="h-full w-full object-cover"
 loading="lazy"
 onError={(e) => {
 const t = e.currentTarget;
 t.style.display = "none";
 }}
 />
 </div>

 {/* ماسک اطلاعات فایل */}
 <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-2 pt-6 text-white">
 <p className="text-[10px] font-medium truncate text-right" dir="ltr">
 {f.name}
 </p>
 <div className="flex items-center justify-between gap-1 mt-0.5 text-[9px] opacity-80">
 <span>{f.sizeHuman}</span>
 <span>{toPersianDigits(toJalali(new Date(f.uploadedAt)))}</span>
 </div>
 </div>

 {/* نشانگر انتخاب */}
 {isSelected && (
 <div className="absolute top-1.5 end-1.5 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
 <Check className="h-3.5 w-3.5" />
 </div>
 )}

 {/* نشانگر فایل فعلی */}
 {isCurrent &&!isSelected && (
 <div className="absolute top-1.5 end-1.5">
 <Badge variant="secondary" className="text-[9px] bg-background/85 backdrop-blur text-foreground">
 فعلی
 </Badge>
 </div>
 )}
 </button>
 );
 })}
 </div>
 </div>
 )}
 </div>
 </div>

 {/* اطلاعات فایل انتخاب‌شده */}
 {selectedFile && (
 <div className="px-5">
 <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
 <div className="h-10 w-10 rounded overflow-hidden bg-muted shrink-0">
 { }
 <img src={selectedFile.url} alt={selectedFile.name} className="h-full w-full object-cover" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium truncate" dir="ltr">{selectedFile.name}</p>
 <p className="text-[10px] text-muted-foreground">
 {selectedFile.sizeHuman} • {toPersianDigits(toJalali(new Date(selectedFile.uploadedAt)))}
 </p>
 </div>
 <Badge variant="outline" className="text-[10px] uppercase shrink-0">
 {selectedFile.ext || "img"}
 </Badge>
 </div>
 </div>
 )}

 <DialogFooter className="p-5 pt-3 border-t border-border flex-row items-center justify-between gap-2">
 <p className="text-[10px] text-muted-foreground">
 {toPersianDigits(filtered.length)} فایل
 {search && ` از ${toPersianDigits(files.length)}`}
 </p>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-9">
 <X className="h-4 w-4" />
 انصراف
 </Button>
 <Button
 size="sm"
 onClick={handleSelect}
 disabled={!selectedUrl || uploading}
 className="h-9"
 >
 <Check className="h-4 w-4" />
 انتخاب
 </Button>
 </div>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

export default FileManagerDialog;
