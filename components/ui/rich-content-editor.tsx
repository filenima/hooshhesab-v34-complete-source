"use client";

import * as React from "react";
import {
 Bold,
 Italic,
 Underline,
 Strikethrough,
 Heading1,
 Heading2,
 Heading3,
 List,
 ListOrdered,
 Link as LinkIcon,
 Image as ImageIcon,
 Code,
 Quote,
 Table as TableIcon,
 Eye,
 Code2,
 Undo,
 Redo,
 Upload,
 Loader2,
 Type,
 Check,
 X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

export interface RichContentEditorProps {
 value: string; // HTML content
 onChange: (html: string) => void;
 placeholder?: string;
 minHeight?: number;
 /** disable image upload (only URL) */
 disableUpload?: boolean;
 /** reading direction */
 dir?: "rtl" | "ltr";
}

/**
 * ویرایشگر محتوای غنی (WYSIWYG) — کاملاً قابل استفاده مجدد
 *
 * قابلیت‌ها:
 * - ضخیم، کج، زیرخط، خط‌خورده
 * - سرتیتر H1/H2/H3 و پاراگراف
 * - لیست نقطه‌ای و شماره‌ای
 * - درج لینک (با دیالوگ)
 * - درج تصویر (آپلود فایل + URL)
 * - بلاک کد
 * - نقل‌قول
 * - جدول (سطر×ستون)
 * - نمایش منبع HTML (Source/Visual toggle)
 * - Undo / Redo
 *
 * از document.execCommand استفاده می‌کند (Deprecated اما هنوز در همه مرورگرها کار می‌کند).
 * محتوا به‌صورت HTML خام در state نگهداری می‌شود و با onChange منتقل می‌گردد.
 */
export function RichContentEditor({
 value,
 onChange,
 placeholder = "محتوای خود را اینجا بنویسید...",
 minHeight = 360,
 disableUpload = false,
 dir = "rtl",
}: RichContentEditorProps) {
 const { toast } = useToast();
 const editorRef = React.useRef<HTMLDivElement | null>(null);
 const [showSource, setShowSource] = React.useState(false);
 const [sourceText, setSourceText] = React.useState("");
 const [linkDialog, setLinkDialog] = React.useState(false);
 const [linkUrl, setLinkUrl] = React.useState("");
 const [linkText, setLinkText] = React.useState("");
 const [imageDialog, setImageDialog] = React.useState(false);
 const [imageUrl, setImageUrl] = React.useState("");
 const [imageAlt, setImageAlt] = React.useState("");
 const [uploading, setUploading] = React.useState(false);
 const [tableDialog, setTableDialog] = React.useState(false);
 const [tableRows, setTableRows] = React.useState("3");
 const [tableCols, setTableCols] = React.useState("3");

 // همگام‌سازی مقدار اولیه با DOM فقط هنگام mount یا تغییر خارجی کنترل‌شده
 // (با compare string تا از reset cursor جلوگیری شود)
 const lastExternalValue = React.useRef(value);
 React.useEffect(() => {
 if (
 editorRef.current &&
 lastExternalValue.current!== value &&
 editorRef.current.innerHTML!== value
 ) {
 editorRef.current.innerHTML = value || "";
 lastExternalValue.current = value;
 }
 }, [value]);

 // هنگام mount، مقدار اولیه را در editor قرار بده
 React.useEffect(() => {
 if (editorRef.current && value) {
 editorRef.current.innerHTML = value;
 lastExternalValue.current = value;
 }
 }, []);

 const syncState = React.useCallback(() => {
 if (editorRef.current) {
 const html = editorRef.current.innerHTML;
 lastExternalValue.current = html;
 onChange(html);
 }
 }, [onChange]);

 const exec = (command: string, val?: string) => {
 editorRef.current?.focus();
 try {
 document.execCommand(command, false, val);
 syncState();
 } catch {
 // ignore
 }
 };

 const formatBlock = (tag: string) => {
 // formatBlock needs <tagname>
 exec("formatBlock", tag);
 };

 // ---------- Insert Link ----------
 const openLinkDialog = () => {
 const selection = window.getSelection();
 const selectedText = selection?.toString() || "";
 setLinkText(selectedText);
 setLinkUrl("");
 setLinkDialog(true);
 };

 const insertLink = () => {
 const url = linkUrl.trim();
 if (!url) return;
 let finalUrl = url;
 if (!/^https?:\/\//i.test(url)) {
 finalUrl = "https://" + url;
 }
 editorRef.current?.focus();
 // اگر متن انتخاب شده بود، لینک روی همان متن
 if (linkText.trim()) {
 // ذخیره انتخاب فعلی
 const sel = window.getSelection();
 if (sel && sel.rangeCount > 0) {
 const range = sel.getRangeAt(0);
 range.deleteContents();
 const a = document.createElement("a");
 a.href = finalUrl;
 a.target = "_blank";
 a.rel = "noopener noreferrer";
 a.textContent = linkText;
 range.insertNode(a);
 syncState();
 } else {
 // fallback به execCommand
 exec("insertHTML", `<a href="${finalUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`);
 }
 } else {
 exec("createLink", finalUrl);
 }
 setLinkDialog(false);
 setLinkUrl("");
 setLinkText("");
 };

 // ---------- Image Upload ----------
 const uploadFile = async (file: File) => {
 setUploading(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const formData = new FormData();
 formData.append("file", file);
 const res = await fetch("/api/files/upload", {
 method: "POST",
 headers: {
 Authorization: `Bearer ${token}`,
 },
 body: formData,
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در آپلود");
 return data.url as string;
 } catch (e) {
 toast({
 title: "خطا در آپلود",
 description: e instanceof Error? e.message: "خطا ناشناخته",
 variant: "destructive",
 });
 return null;
 } finally {
 setUploading(false);
 }
 };

 const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 const url = await uploadFile(file);
 if (url) {
 setImageUrl(url);
 // دیالوگ را باز کن برای تنظیم alt
 setImageDialog(true);
 }
 // reset input
 e.target.value = "";
 };

 const insertImage = () => {
 const url = imageUrl.trim();
 if (!url) return;
 const alt = imageAlt.trim() || "image";
 editorRef.current?.focus();
 exec("insertHTML", `<img src="${url}" alt="${alt.replace(/"/g, "&quot;")}" style="max-width:100%;border-radius:8px;" />`);
 setImageDialog(false);
 setImageUrl("");
 setImageAlt("");
 };

 // ---------- Code Block ----------
 const insertCodeBlock = () => {
 editorRef.current?.focus();
 const selection = window.getSelection();
 const selectedText = selection?.toString() || "// کد خود را اینجا بنویسید";
 exec(
 "insertHTML",
 `<pre dir="ltr" style="background:#0f172a;color:#f1f5f9;padding:12px;border-radius:8px;overflow-x:auto;font-family:ui-monospace,monospace;"><code>${escapeHtml(selectedText)}</code></pre><p><br/></p>`
 );
 };

 // ---------- Quote ----------
 const insertQuote = () => {
 formatBlock("<blockquote>");
 };

 // ---------- Table ----------
 const insertTable = () => {
 const rows = Math.max(1, Math.min(20, Number(tableRows) || 3));
 const cols = Math.max(1, Math.min(10, Number(tableCols) || 3));
 let html = '<table style="width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #e2e8f0;">';
 // header row
 html += "<thead><tr>";
 for (let c = 0; c < cols; c++) {
 html += `<th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:right;">سرتیتر</th>`;
 }
 html += "</tr></thead><tbody>";
 for (let r = 0; r < rows; r++) {
 html += "<tr>";
 for (let c = 0; c < cols; c++) {
 html += `<td style="border:1px solid #e2e8f0;padding:8px;">—</td>`;
 }
 html += "</tr>";
 }
 html += "</tbody></table><p><br/></p>";
 editorRef.current?.focus();
 exec("insertHTML", html);
 setTableDialog(false);
 };

 // ---------- Source Toggle ----------
 const toggleSource = () => {
 if (!showSource) {
 // visual -> source
 setSourceText(editorRef.current?.innerHTML || "");
 } else {
 // source -> visual
 if (editorRef.current) {
 editorRef.current.innerHTML = sourceText;
 syncState();
 }
 }
 setShowSource(!showSource);
 };

 const onSourceChange = (val: string) => {
 setSourceText(val);
 // ذخیره برای sync پس از toggle
 lastExternalValue.current = val;
 onChange(val);
 };

 // محتوای متنی برای شمارش کلمات
 const wordCount = React.useMemo(() => {
 const text = (editorRef.current?.innerText || value || "").replace(/<[^>]+>/g, " ").trim();
 return text.split(/\s+/).filter(Boolean).length;
 }, [value]);

 return (
 <div className="rounded-lg border border-border overflow-hidden bg-background">
 {/* Toolbar */}
 <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border flex-wrap bg-muted/30 sticky top-0 z-10">
 <ToolbarButton onClick={() => exec("undo")} title="بازگشت (Undo)">
 <Undo className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => exec("redo")} title="از نو (Redo)">
 <Redo className="h-3.5 w-3.5" />
 </ToolbarButton>
 <Divider />
 <ToolbarButton onClick={() => exec("bold")} title="ضخیم (Ctrl+B)">
 <Bold className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => exec("italic")} title="کج (Ctrl+I)">
 <Italic className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => exec("underline")} title="زیرخط (Ctrl+U)">
 <Underline className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => exec("strikeThrough")} title="خط‌خورده">
 <Strikethrough className="h-3.5 w-3.5" />
 </ToolbarButton>
 <Divider />
 <ToolbarButton onClick={() => formatBlock("<p>")} title="پاراگراف">
 <Type className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => formatBlock("<h1>")} title="سرتیتر ۱">
 <Heading1 className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => formatBlock("<h2>")} title="سرتیتر ۲">
 <Heading2 className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => formatBlock("<h3>")} title="سرتیتر ۳">
 <Heading3 className="h-3.5 w-3.5" />
 </ToolbarButton>
 <Divider />
 <ToolbarButton onClick={() => exec("insertUnorderedList")} title="لیست نقطه‌ای">
 <List className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => exec("insertOrderedList")} title="لیست شماره‌ای">
 <ListOrdered className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={insertQuote} title="نقل‌قول">
 <Quote className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={insertCodeBlock} title="بلاک کد">
 <Code className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => setTableDialog(true)} title="جدول">
 <TableIcon className="h-3.5 w-3.5" />
 </ToolbarButton>
 <Divider />
 <ToolbarButton onClick={openLinkDialog} title="درج لینک (Ctrl+K)">
 <LinkIcon className="h-3.5 w-3.5" />
 </ToolbarButton>
 <ToolbarButton onClick={() => setImageDialog(true)} title="درج تصویر">
 <ImageIcon className="h-3.5 w-3.5" />
 </ToolbarButton>
 {!disableUpload && (
 <label
 className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors"
 title="آپلود تصویر از سیستم"
 >
 {uploading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Upload className="h-3.5 w-3.5" />
 )}
 <input
 type="file"
 accept="image/*"
 className="hidden"
 onChange={onFileSelected}
 disabled={uploading}
 />
 </label>
 )}
 <Divider />
 <ToolbarButton onClick={toggleSource} title={showSource? "نمایش بصری": "نمایش کد HTML"} active={showSource}>
 {showSource? <Eye className="h-3.5 w-3.5" />: <Code2 className="h-3.5 w-3.5" />}
 </ToolbarButton>

 <div className="ms-auto text-[10px] text-muted-foreground tnum">
 {toPersianDigits(wordCount)} کلمه
 </div>
 </div>

 {/* Editor or Source */}
 {showSource? (
 <textarea
 value={sourceText}
 onChange={(e) => onSourceChange(e.target.value)}
 dir="ltr"
 spellCheck={false}
 className="w-full p-3 font-mono text-[11px] leading-relaxed bg-zinc-950 text-zinc-100 border-0 outline-none resize-y"
 style={{ minHeight: minHeight + 40 }}
 placeholder="<p>HTML source...</p>"
 />
 ): (
 <div
 ref={editorRef}
 contentEditable
 onInput={syncState}
 onBlur={syncState}
 dir={dir}
 suppressContentEditableWarning
 className="prose prose-sm max-w-none focus:outline-none p-4 text-[14px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_a]:text-primary [&_a]:underline [&_img]:rounded-lg [&_blockquote]:border-r-4 [&_blockquote]:border-primary [&_blockquote]:bg-muted/40 [&_blockquote]:py-2 [&_blockquote]:px-3 [&_blockquote]:italic [&_pre]:bg-zinc-950 [&_pre]:text-zinc-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_th]:bg-muted [&_th]:p-2 [&_th]:border [&_td]:p-2 [&_td]:border"
 style={{ minHeight }}
 data-placeholder={placeholder}
 />
 )}

 {/* Link Dialog */}
 <Dialog open={linkDialog} onOpenChange={setLinkDialog}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="text-base flex items-center gap-2">
 <LinkIcon className="h-4 w-4 text-primary" />
 درج لینک
 </DialogTitle>
 <DialogDescription className="text-xs">
 آدرس لینک و متن آن را وارد کنید. متن انتخاب‌شده به‌صورت پیش‌فرض استفاده می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div>
 <label className="text-xs font-medium mb-1 block">آدرس URL</label>
 <Input
 value={linkUrl}
 onChange={(e) => setLinkUrl(e.target.value)}
 placeholder="https://example.com"
 dir="ltr"
 autoFocus
 onKeyDown={(e) => e.key === "Enter" && insertLink()}
 />
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">متن لینک</label>
 <Input
 value={linkText}
 onChange={(e) => setLinkText(e.target.value)}
 placeholder="متن نمایش‌داده‌شده برای لینک"
 />
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setLinkDialog(false)}>
 <X className="h-3.5 w-3.5" />
 انصراف
 </Button>
 <Button size="sm" onClick={insertLink} disabled={!linkUrl.trim()}>
 <Check className="h-3.5 w-3.5" />
 درج لینک
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Image Dialog */}
 <Dialog open={imageDialog} onOpenChange={setImageDialog}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="text-base flex items-center gap-2">
 <ImageIcon className="h-4 w-4 text-primary" />
 درج تصویر
 </DialogTitle>
 <DialogDescription className="text-xs">
 آدرس URL تصویر را وارد کنید یا از سیستم آپلود کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div>
 <label className="text-xs font-medium mb-1 block">آدرس تصویر (URL)</label>
 <div className="flex gap-2">
 <Input
 value={imageUrl}
 onChange={(e) => setImageUrl(e.target.value)}
 placeholder="https://... یا /uploads/..."
 dir="ltr"
 />
 {!disableUpload && (
 <label className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent px-3 cursor-pointer whitespace-nowrap">
 {uploading? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Upload className="h-3.5 w-3.5" />
 )}
 <input
 type="file"
 accept="image/*"
 className="hidden"
 onChange={onFileSelected}
 disabled={uploading}
 />
 </label>
 )}
 </div>
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">متن جایگزین (Alt)</label>
 <Input
 value={imageAlt}
 onChange={(e) => setImageAlt(e.target.value)}
 placeholder="توضیح تصویر برای دسترس‌پذیری و سئو"
 />
 </div>
 {imageUrl && (
 <div className="rounded-lg overflow-hidden border border-border">
 <img
 src={imageUrl}
 alt="preview"
 className="w-full max-h-48 object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).style.opacity = "0.3";
 }}
 />
 </div>
 )}
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setImageDialog(false)}>
 <X className="h-3.5 w-3.5" />
 انصراف
 </Button>
 <Button size="sm" onClick={insertImage} disabled={!imageUrl.trim()}>
 <Check className="h-3.5 w-3.5" />
 درج تصویر
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Table Dialog */}
 <Dialog open={tableDialog} onOpenChange={setTableDialog}>
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle className="text-base flex items-center gap-2">
 <TableIcon className="h-4 w-4 text-primary" />
 درج جدول
 </DialogTitle>
 <DialogDescription className="text-xs">
 ابعاد جدول را انتخاب کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-2 gap-3 py-2">
 <div>
 <label className="text-xs font-medium mb-1 block">تعداد سطرها</label>
 <Input
 type="number"
 value={tableRows}
 onChange={(e) => setTableRows(e.target.value)}
 min={1}
 max={20}
 dir="ltr"
 />
 </div>
 <div>
 <label className="text-xs font-medium mb-1 block">تعداد ستون‌ها</label>
 <Input
 type="number"
 value={tableCols}
 onChange={(e) => setTableCols(e.target.value)}
 min={1}
 max={10}
 dir="ltr"
 />
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setTableDialog(false)}>
 انصراف
 </Button>
 <Button size="sm" onClick={insertTable}>
 درج جدول
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ============ Helpers ============

function escapeHtml(str: string): string {
 return str
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#39;");
}

function Divider() {
 return <div className="w-px h-5 bg-border mx-0.5" />;
}

function ToolbarButton({
 children,
 onClick,
 title,
 active,
}: {
 children: React.ReactNode;
 onClick: () => void;
 title: string;
 active?: boolean;
}) {
 return (
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onClick={onClick}
 title={title}
 className={`h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary ${
 active? "bg-primary/15 text-primary": "text-muted-foreground"
 }`}
 >
 {children}
 </Button>
 );
}

export default RichContentEditor;
