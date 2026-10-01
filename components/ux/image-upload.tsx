"use client";

import * as React from "react";
import { Upload, X, Loader2, Copy, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadProps {
 value?: string;
 onChange: (url: string) => void;
 className?: string;
 label?: string;
 maxSizeMB?: number;
}

export function ImageUpload({ value, onChange, className, label = "آپلود تصویر", maxSizeMB = 8 }: ImageUploadProps) {
 const { toast } = useToast();
 const inputRef = React.useRef<HTMLInputElement>(null);
 const [loading, setLoading] = React.useState(false);
 const [progress, setProgress] = React.useState(0);
 const [error, setError] = React.useState<string | null>(null);
 const [dragOver, setDragOver] = React.useState(false);
 const [copied, setCopied] = React.useState(false);

 const upload = async (file: File) => {
 if (!file) return;
 if (!file.type.startsWith("image/")) { setError("فقط فایل تصویری مجاز است"); return; }
 if (file.size > maxSizeMB * 1024 * 1024) { setError(`حجم فایل نباید بیش از ${maxSizeMB} مگابایت باشد`); return; }

 setLoading(true); setError(null); setProgress(0);
 const formData = new FormData();
 formData.append("file", file);

 const xhr = new XMLHttpRequest();
 xhr.upload.addEventListener("progress", (e) => {
 if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
 });
 xhr.upload.addEventListener("error", () => {
 setLoading(false); setError("خطا در آپلود — ارتباط برقرار نشد");
 });
 xhr.addEventListener("load", () => {
 setLoading(false);
 try {
 const data = JSON.parse(xhr.responseText);
 if (data.success && data.url) {
 onChange(data.url);
 toast({ title: "آپلود شد", description: "تصویر با موفقیت آپلود شد" });
 } else {
 setError(data.error || "خطا در آپلود");
 }
 } catch { setError("خطا در پاسخ سرور"); }
 });
 xhr.addEventListener("error", () => { setLoading(false); setError("خطا در ارتباط با سرور"); });
 xhr.open("POST", "/api/files/upload");

 const token = typeof window!== "undefined"? localStorage.getItem("hoshhesab_user_token") || localStorage.getItem("hoshhesab_admin_token"): null;
 if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
 xhr.send(formData);
 };

 const handleDrop = (e: React.DragEvent) => {
 e.preventDefault(); setDragOver(false);
 const file = e.dataTransfer.files[0];
 if (file) upload(file);
 };

 const copyUrl = () => {
 if (value) { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }
 };

 return (
 <div className={cn("space-y-2", className)}>
 <label className="text-sm font-medium">{label}</label>
 {value? (
 <div className="relative group">
 <img src={value} alt="preview" className="w-full max-w-xs rounded-lg border border-border object-cover" style={{ maxHeight: 200 }} />
 <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button onClick={copyUrl} className="rounded-md bg-background/80 p-1.5 hover:bg-background" title="کپی URL">
 {copied? <Check className="h-4 w-4 text-green-500" />: <Copy className="h-4 w-4" />}
 </button>
 <button onClick={() => onChange("")} className="rounded-md bg-background/80 p-1.5 hover:bg-background" title="حذف">
 <X className="h-4 w-4 text-red-500" />
 </button>
 </div>
 </div>
 ): (
 <div
 onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
 onDragLeave={() => setDragOver(false)}
 onDrop={handleDrop}
 onClick={() => inputRef.current?.click()}
 className={cn(
 "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
 dragOver? "border-primary bg-primary/5": "border-border hover:border-primary/50"
 )}
 >
 {loading? (
 <>
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">در حال آپلود... {progress}%</p>
 <div className="w-full max-w-xs h-2 bg-muted rounded-full overflow-hidden">
 <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
 </div>
 </>
 ): (
 <>
 <Upload className="h-8 w-8 text-muted-foreground" />
 <p className="text-sm text-muted-foreground">برای آپلود، فایل را اینجا بکشید یا کلیک کنید</p>
 <p className="text-xs text-muted-foreground">PNG, JPG, WebP, GIF, SVG — حداکثر {maxSizeMB}MB</p>
 </>
 )}
 </div>
 )}
 {error && (
 <div className="flex items-center gap-2 text-sm text-red-500">
 <AlertCircle className="h-4 w-4" /> {error}
 </div>
 )}
 <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
 </div>
 );
}
