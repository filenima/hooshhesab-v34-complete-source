"use client";

/**
 * ReceiptDesignStudio — استودیوی «طرح رسید فاکتور» (v33-b)
 * ============================================================================
 * انتخاب قالب آمادهٔ رسید (۵ قالب مدرن)، اندازهٔ کاغذ (۵۸/۸۰/A5/A4/سفارشی)،
 * رنگ تأکیدی و گزینه‌های نمایش + ثبت اطلاعات کسب‌وکار (نام/لوگو/وب‌سایت/
 * تلفن/آدرس/شعار/پیام پایانی) — همه در یک جا با پیش‌نمایش زندهٔ رسید.
 *
 * استفاده در دو نقطه:
 *   ۱) ماژول فاکتورها — دکمهٔ «طرح رسید فاکتور» → ReceiptDesignDialog
 *   ۲) صفحهٔ حساب کاربری — ReceiptDesignCard (محتوای استودیو داخل Card)
 *
 * داده‌ها:
 *   GET    /api/accounting/tenant-branding  → برندینگ + تنظیمات رسید
 *   PATCH  /api/accounting/tenant-branding  → ذخیرهٔ تنظیمات (قالب/اندازه/رنگ/گزینه‌ها/کسب‌وکار)
 *   POST   /api/accounting/tenant-branding  → آپلود لوگو (multipart)
 *   DELETE /api/accounting/tenant-branding  → حذف لوگو
 *   GET    /api/invoices/[id|sample]/print?preview=1&… → پیش‌نمایش زندهٔ رسید
 */

import * as React from "react";
import {
 Palette,
 Loader2,
 Save,
 Upload,
 Trash2,
 Image as ImageIcon,
 Check,
 RefreshCw,
 Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";
import {
 RECEIPT_ACCENTS,
 RECEIPT_TEMPLATES,
 RECEIPT_WIDTH_MAX,
 RECEIPT_WIDTH_MIN,
 RECEIPT_WIDTH_PRESETS,
 type ReceiptTemplateId,
} from "@/lib/receipt-templates";

/* ============================================================
 فرم‌های داده
 ============================================================ */

interface BrandingApiResponse {
 success: boolean;
 error?: string;
 data?: {
 name: string;
 logoUrl: string | null;
 invoiceSlogan: string | null;
 invoiceWebsite: string | null;
 invoicePhone: string | null;
 invoiceAddress: string | null;
 receiptTemplate: string;
 receiptWidthMm: number;
 receiptAccent: string;
 receiptOptions: {
 showQr: boolean;
 showLogo: boolean;
 showBarcode: boolean;
 showCashier: boolean;
 footerMessage: string | null;
 fontSize: "sm" | "md";
 };
 };
}

/* ============================================================
 پیش‌نمایش مینیاتوری قالب‌ها — ماکت HTML/CSS هر طرح (نه فقط نام)
 ============================================================ */

function TemplateMiniPreview({ id, accent }: { id: ReceiptTemplateId; accent: string }) {
 // خط‌های شبیه‌ساز متن — بلوک‌های خاکستری کوچک
 const line = (w: string, cls = "") => (
 <div className={cn("h-[3px] rounded-full bg-neutral-300", cls)} style={{ width: w }} />
 );
 const num = (w: string) => (
 <div className="h-[3px] rounded-full bg-neutral-400" style={{ width: w }} />
 );

 if (id === "modern") {
 return (
 <div className="w-full overflow-hidden rounded-[4px] border border-neutral-200 bg-white">
 <div className="h-[5px] w-full" style={{ background: `repeating-linear-gradient(45deg, ${accent}, ${accent} 3px, ${accent}dd 3px, ${accent}dd 6px)` }} />
 <div className="flex flex-col items-center gap-[3px] px-2 py-2">
 <div className="flex h-[14px] w-[14px] items-center justify-center rounded-full border text-[5px] font-bold" style={{ borderColor: accent, color: accent }}>
 هـ
 </div>
 <div className="h-[4px] w-3/5 rounded-full bg-neutral-800" />
 {line("40%")}
 </div>
 <div className="mx-2 mb-1 rounded-[3px] px-1 py-[2px] text-center" style={{ background: `${accent}18`, color: accent }}>
 <div className="text-[5px] font-bold leading-[7px]">رسید فروش</div>
 </div>
 <div className="space-y-[3px] px-2 pb-2">
 <div className="flex justify-between">{line("50%")}{num("20%")}</div>
 <div className="flex justify-between">{line("60%")}{num("16%")}</div>
 </div>
 <div className="mx-2 mb-2 flex items-center justify-between rounded-[4px] bg-neutral-900 px-2 py-[3px]">
 <div className="h-[4px] w-1/3 rounded-full bg-white/80" />
 <div className="h-[9px] w-[9px] rounded-[2px] bg-white" />
 </div>
 </div>
 );
 }

 if (id === "boutique") {
 return (
 <div className="w-full rounded-[4px] bg-white p-[3px]">
 <div className="rounded-[2px] border border-neutral-800 p-2">
 <div className="flex flex-col items-center gap-[4px]">
 <div className="flex w-full items-center gap-1">
 <div className="h-px flex-1" style={{ background: accent }} />
 <div className="h-[4px] w-[4px] rotate-45" style={{ background: accent }} />
 <div className="h-px flex-1" style={{ background: accent }} />
 </div>
 <div className="h-[5px] w-3/4 rounded-full bg-neutral-800" />
 {line("50%")}
 </div>
 <div className="mt-2 space-y-[3px]">
 <div className="flex justify-between">{line("55%")}{num("20%")}</div>
 <div className="flex justify-between">{line("45%")}{num("22%")}</div>
 </div>
 <div className="mt-2 flex items-baseline justify-between border-b-2 pb-[2px]" style={{ borderColor: accent }}>
 <div className="h-[4px] w-1/3 rounded-full" style={{ background: accent }} />
 <div className="h-[5px] w-1/4 rounded-full bg-neutral-800" />
 </div>
 <div className="mt-2 rounded-[3px] border py-[4px]" style={{ borderColor: `${accent}55`, background: `${accent}0d` }}>
 <div className="flex justify-center gap-1">{line("30%")}{line("25%")}</div>
 </div>
 </div>
 </div>
 );
 }

 if (id === "classic") {
 return (
 <div className="w-full rounded-[4px] border border-neutral-200 bg-white px-2 py-2">
 <div className="flex flex-col items-center gap-[3px]">
 <div className="h-[5px] w-2/3 rounded-full bg-neutral-800" />
 {line("45%")}
 <div className="h-[4px] w-1/3 rounded-full bg-neutral-500" />
 </div>
 <div className="my-[6px] border-t border-dashed border-neutral-400" />
 <div className="space-y-[3px]">
 <div className="flex justify-between gap-1">
 {num("12%")}{line("40%")}{num("10%")}{num("14%")}{num("16%")}
 </div>
 <div className="flex justify-between gap-1">
 {num("12%")}{line("45%")}{num("8%")}{num("12%")}{num("18%")}
 </div>
 </div>
 <div className="my-[6px] border-t border-dashed border-neutral-400" />
 <div className="flex items-center justify-between">
 <div className="h-[4px] w-1/3 rounded-full bg-neutral-500" />
 <div className="h-[5px] w-1/4 rounded-full bg-neutral-900" />
 </div>
 <div className="mt-2 flex justify-between gap-2">
 <div className="flex-1 border-b border-dotted border-neutral-400 pb-[2px]" />
 <div className="flex-1 border-b border-dotted border-neutral-400 pb-[2px]" />
 </div>
 </div>
 );
 }

 if (id === "bold") {
 return (
 <div className="w-full overflow-hidden rounded-[4px] bg-white">
 <div className="flex items-center gap-[5px] px-2 py-[6px]" style={{ background: "#1c1917" }}>
 <div className="flex h-[12px] w-[12px] items-center justify-center rounded-full border border-white/60 text-[5px] font-bold text-white">
 هـ
 </div>
 <div className="h-[4px] w-1/2 rounded-full bg-white/90" />
 </div>
 <div className="py-[2px] text-center" style={{ background: accent }}>
 <div className="text-[5px] font-bold leading-[7px] text-white">رسید فروش</div>
 </div>
 <div className="space-y-[3px] px-2 py-2">
 <div className="flex justify-between">{line("50%")}{num("18%")}</div>
 <div className="flex justify-between">{line("55%")}{num("20%")}</div>
 </div>
 <div className="mx-2 mb-2 rounded-[5px] border-2 bg-neutral-900 px-2 py-[4px]" style={{ borderColor: accent }}>
 <div className="flex items-center justify-between">
 <div className="h-[4px] w-1/3 rounded-full bg-white/80" />
 <div className="h-[10px] w-[10px] rounded-[2px] bg-white" />
 </div>
 </div>
 <div className="h-[4px]" style={{ background: accent }} />
 </div>
 );
 }

 // lux
 return (
 <div className="w-full rounded-[3px] border border-neutral-300 bg-white p-[4px]">
 <div className="rounded-[2px] border border-neutral-200 px-2 py-2">
 <div className="flex flex-col items-center gap-[4px]">
 <div className="flex h-[13px] w-[13px] items-center justify-center rounded-full border text-[5px] font-bold" style={{ borderColor: accent, color: accent, outline: `1px solid ${accent}44`, outlineOffset: "1.5px" }}>
 هـ
 </div>
 <div className="h-[4px] w-3/5 rounded-full bg-neutral-700" />
 {line("40%")}
 </div>
 <div className="my-2 flex items-center gap-1">
 <div className="h-px flex-1 bg-neutral-300" />
 <div className="text-[4px] font-bold" style={{ color: accent }}>
 رسید
 </div>
 <div className="h-px flex-1 bg-neutral-300" />
 </div>
 <div className="space-y-[4px]">
 <div className="flex justify-between">{line("50%")}{num("20%")}</div>
 <div className="flex justify-between">{line("45%")}{num("18%")}</div>
 <div className="flex justify-between">{line("52%")}{num("16%")}</div>
 </div>
 <div className="mt-2 flex items-baseline justify-between border-b-[1.5px] pb-[2px]" style={{ borderColor: accent }}>
 <div className="h-[4px] w-1/3 rounded-full" style={{ background: accent }} />
 <div className="h-[5px] w-1/4 rounded-full bg-neutral-900" />
 </div>
 </div>
 </div>
 );
}

/* ============================================================
 استودیو — محتوای اصلی (مستقل از ظرف: دیالوگ یا کارت)
 ============================================================ */

interface ReceiptDesignStudioProps {
 /** شناسهٔ فاکتور برای پیش‌نمایش واقعی — نبود: رسید نمونه (sample) */
 invoiceId?: string;
 /** بعد از ذخیرهٔ موفق */
 onSaved?: () => void;
}

export function ReceiptDesignStudio({ invoiceId, onSaved }: ReceiptDesignStudioProps) {
 const { toast } = useToast();
 const fileInputRef = React.useRef<HTMLInputElement>(null);

 const [loading, setLoading] = React.useState(true);
 const [saving, setSaving] = React.useState(false);
 const [uploading, setUploading] = React.useState(false);

 // تنظیمات طرح
 const [template, setTemplate] = React.useState<ReceiptTemplateId>("modern");
 const [widthPreset, setWidthPreset] = React.useState<string>("80");
 const [customWidth, setCustomWidth] = React.useState<string>("85");
 const [accent, setAccent] = React.useState<string>("#0f766e");
 const [fontSize, setFontSize] = React.useState<"sm" | "md">("md");
 const [showQr, setShowQr] = React.useState(true);
 const [showLogo, setShowLogo] = React.useState(true);
 const [showBarcode, setShowBarcode] = React.useState(true);
 const [showCashier, setShowCashier] = React.useState(false);
 const [footerMessage, setFooterMessage] = React.useState("");

 // اطلاعات کسب‌وکار
 const [bizName, setBizName] = React.useState("");
 const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
 const [slogan, setSlogan] = React.useState("");
 const [website, setWebsite] = React.useState("");
 const [phone, setPhone] = React.useState("");
 const [address, setAddress] = React.useState("");

 // پیش‌نمایش زنده
 const [previewHtml, setPreviewHtml] = React.useState<string>("");
 const [previewLoading, setPreviewLoading] = React.useState(false);

 // عرض نهایی مؤثر (mm) — از پریست یا ورودی سفارشی
 const widthMm = React.useMemo(() => {
 if (widthPreset === "custom") {
 const n = Math.round(Number(toEnDigits(customWidth)));
 if (!Number.isFinite(n)) return 80;
 return Math.min(RECEIPT_WIDTH_MAX, Math.max(RECEIPT_WIDTH_MIN, n));
 }
 return Number(widthPreset);
 }, [widthPreset, customWidth]);

 // بارگذاری تنظیمات ذخیره‌شده
 React.useEffect(() => {
 let mounted = true;
 (async () => {
 try {
 const res = await authFetch("/api/accounting/tenant-branding", { cache: "no-store" });
 const j = (await res.json()) as BrandingApiResponse;
 if (mounted && j?.success && j.data) {
 setBizName(j.data.name || "");
 setLogoPreview(j.data.logoUrl || null);
 setSlogan(j.data.invoiceSlogan || "");
 setWebsite(j.data.invoiceWebsite || "");
 setPhone(j.data.invoicePhone || "");
 setAddress(j.data.invoiceAddress || "");
 const t = j.data.receiptTemplate;
 if ((RECEIPT_TEMPLATES.some((x) => x.id === t))) setTemplate(t as ReceiptTemplateId);
 const w = j.data.receiptWidthMm;
 if ([58, 80, 148, 210].includes(w)) {
 setWidthPreset(String(w));
 } else {
 setWidthPreset("custom");
 setCustomWidth(String(w || 85));
 }
 if (j.data.receiptAccent) setAccent(j.data.receiptAccent);
 const o = j.data.receiptOptions;
 if (o) {
 setShowQr(o.showQr);
 setShowLogo(o.showLogo);
 setShowBarcode(o.showBarcode);
 setShowCashier(o.showCashier);
 setFooterMessage(o.footerMessage || "");
 setFontSize(o.fontSize);
 }
 }
 } catch {
 /* بی‌صدا — فرم با پیش‌فرض‌ها شروع می‌شود */
 } finally {
 if (mounted) setLoading(false);
 }
 })();
 return () => {
 mounted = false;
 };
 }, []);

 // پیش‌نمایش زنده — با debounce؛ state کامل به‌صورت override به سرور می‌رود (بدون ذخیره)
 React.useEffect(() => {
 if (loading) return;
 let cancelled = false;
 const timer = setTimeout(async () => {
 setPreviewLoading(true);
 try {
 const opts = encodeURIComponent(
 JSON.stringify({
 showQr,
 showLogo,
 showBarcode,
 showCashier,
 footerMessage: footerMessage.trim() || null,
 fontSize,
 })
 );
 const url =
 `/api/invoices/${encodeURIComponent(invoiceId || "sample")}/print` +
 `?preview=1&template=${template}&width=${widthMm}&accent=${encodeURIComponent(accent)}&opts=${opts}`;
 const res = await authFetch(url, { cache: "no-store" });
 if (res.ok) {
 const html = await res.text();
 if (!cancelled) setPreviewHtml(html);
 }
 } catch {
 /* پیش‌نمایش best-effort است */
 } finally {
 if (!cancelled) setPreviewLoading(false);
 }
 }, 350);
 return () => {
 cancelled = true;
 clearTimeout(timer);
 };
 }, [loading, invoiceId, template, widthMm, accent, fontSize, showQr, showLogo, showBarcode, showCashier, footerMessage]);

 // ذخیرهٔ همهٔ تنظیمات (قالب + اندازه + رنگ + گزینه‌ها + اطلاعات کسب‌وکار)
 const save = async () => {
 setSaving(true);
 try {
 const res = await authFetch("/api/accounting/tenant-branding", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 name: bizName.trim() || undefined,
 invoiceSlogan: slogan.trim() || null,
 invoiceWebsite: website.trim() || null,
 invoicePhone: phone.trim() || null,
 invoiceAddress: address.trim() || null,
 receiptTemplate: template,
 receiptWidthMm: widthMm,
 receiptAccent: accent,
 receiptOptions: {
 showQr,
 showLogo,
 showBarcode,
 showCashier,
 footerMessage: footerMessage.trim() || null,
 fontSize,
 },
 }),
 });
 const j = (await res.json()) as BrandingApiResponse;
 if (!res.ok || !j?.success) throw new Error(j?.error || "خطا در ذخیره");
 toast({
 title: "طرح رسید ذخیره شد",
 description: "چاپ فاکتورها از این پس با همین طرح و اندازه انجام می‌شود.",
 });
 onSaved?.();
 } catch (e) {
 toast({
 title: "خطا در ذخیره",
 description: e instanceof Error ? e.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSaving(false);
 }
 };

 const uploadLogo = async (file: File) => {
 setUploading(true);
 try {
 const fd = new FormData();
 fd.append("logo", file);
 const res = await authFetch("/api/accounting/tenant-branding", { method: "POST", body: fd });
 const j = (await res.json()) as BrandingApiResponse;
 if (!res.ok || !j?.success) throw new Error(j?.error || "خطا در آپلود");
 setLogoPreview(j.data?.logoUrl || null);
 toast({ title: "لوگو ذخیره شد", description: "لوگو روی رسید چاپی نمایش داده می‌شود." });
 } catch (e) {
 toast({
 title: "خطا در آپلود لوگو",
 description: e instanceof Error ? e.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setUploading(false);
 }
 };

 const removeLogo = async () => {
 setUploading(true);
 try {
 const res = await authFetch("/api/accounting/tenant-branding", { method: "DELETE" });
 const j = (await res.json()) as BrandingApiResponse;
 if (!res.ok || !j?.success) throw new Error(j?.error || "خطا در حذف");
 setLogoPreview(null);
 toast({ title: "لوگو حذف شد" });
 } catch (e) {
 toast({
 title: "خطا در حذف لوگو",
 description: e instanceof Error ? e.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setUploading(false);
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center py-16">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 </div>
 );
 }

 return (
 <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,340px)] gap-5">
 {/* ── ستون تنظیمات ── */}
 <div className="space-y-5 min-w-0">
 {/* گالری قالب‌ها */}
 <section className="space-y-2.5">
 <div className="flex items-center gap-2">
 <Palette className="h-4 w-4 text-primary shrink-0" />
 <h3 className="text-sm font-semibold">انتخاب قالب رسید</h3>
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
 {RECEIPT_TEMPLATES.map((t) => {
 const selected = template === t.id;
 return (
 <button
 key={t.id}
 type="button"
 onClick={() => setTemplate(t.id)}
 aria-pressed={selected}
 className={cn(
 "group relative flex flex-col gap-2 rounded-xl border bg-card p-2.5 text-right transition-all",
 selected
 ? "border-primary ring-2 ring-primary/30 shadow-sm"
 : "border-border hover:border-primary/40 hover:shadow-sm"
 )}
 >
 <TemplateMiniPreview id={t.id} accent={accent} />
 <div className="flex items-center justify-between gap-1">
 <span className="text-xs font-bold">{t.name}</span>
 {selected ? (
 <Badge className="h-5 gap-1 px-1.5 text-[10px]">
 <Check className="h-3 w-3" />
 انتخاب
 </Badge>
 ) : (
 <span className="text-[10px] text-muted-foreground">انتخاب</span>
 )}
 </div>
 <p className="text-[10px] leading-relaxed text-muted-foreground">{t.description}</p>
 </button>
 );
 })}
 </div>
 </section>

 <Separator />

 {/* اندازهٔ کاغذ */}
 <section className="space-y-2.5">
 <div className="flex items-center gap-2">
 <Receipt className="h-4 w-4 text-primary shrink-0" />
 <h3 className="text-sm font-semibold">اندازهٔ کاغذ</h3>
 </div>
 <p className="text-[11px] text-muted-foreground">
 چاپ فاکتور به‌طور خودکار با اندازهٔ انتخابی انجام می‌شود — پیش‌فرض ۸۰ میلی‌متر
 (استاندارد رسید کارتخوان و پرینتر حرارتی) است و نیازی به تنظیم ندارد.
 </p>
 <div className="flex flex-wrap items-center gap-2">
 {RECEIPT_WIDTH_PRESETS.map((p) => {
 const selected = widthPreset === String(p.mm);
 return (
 <button
 key={p.mm}
 type="button"
 onClick={() => setWidthPreset(String(p.mm))}
 aria-pressed={selected}
 title={p.hint}
 className={cn(
 "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
 selected
 ? "border-primary bg-primary/10 text-primary"
 : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
 )}
 >
 {p.label}
 {p.mm === 80 && <span className="mr-1 text-[9px] text-primary">(پیش‌فرض)</span>}
 </button>
 );
 })}
 <button
 type="button"
 onClick={() => setWidthPreset("custom")}
 aria-pressed={widthPreset === "custom"}
 className={cn(
 "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
 widthPreset === "custom"
 ? "border-primary bg-primary/10 text-primary"
 : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
 )}
 >
 سفارشی
 </button>
 </div>
 {widthPreset === "custom" && (
 <div className="flex items-center gap-2 max-w-56">
 <Input
 value={customWidth}
 onChange={(e) => setCustomWidth(e.target.value)}
 dir="ltr"
 inputMode="numeric"
 className="h-9"
 aria-label="عرض سفارشی کاغذ به میلی‌متر"
 />
 <span className="text-xs text-muted-foreground whitespace-nowrap">
 میلی‌متر ({toPersianDigits(RECEIPT_WIDTH_MIN)} تا {toPersianDigits(RECEIPT_WIDTH_MAX)})
 </span>
 </div>
 )}
 </section>

 <Separator />

 {/* شخصی‌سازی */}
 <section className="space-y-3">
 <h3 className="text-sm font-semibold">شخصی‌سازی</h3>
 <div className="space-y-2">
 <Label className="text-xs">رنگ تأکیدی</Label>
 <div className="flex flex-wrap items-center gap-2">
 {RECEIPT_ACCENTS.map((a) => (
 <button
 key={a.hex}
 type="button"
 onClick={() => setAccent(a.hex)}
 aria-pressed={accent === a.hex}
 title={a.name}
 className={cn(
 "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
 accent === a.hex ? "border-foreground scale-110" : "border-transparent hover:scale-105"
 )}
 >
 <span className="h-5 w-5 rounded-full" style={{ background: a.hex }} />
 </button>
 ))}
 <span className="text-[11px] text-muted-foreground">
 {RECEIPT_ACCENTS.find((a) => a.hex === accent)?.name || accent}
 </span>
 </div>
 </div>
 <div className="space-y-2">
 <Label className="text-xs">اندازهٔ متن</Label>
 <div className="flex items-center gap-2">
 {([
 ["md", "معمولی"],
 ["sm", "ریز"],
 ] as Array<["sm" | "md", string]>).map(([v, l]) => (
 <button
 key={v}
 type="button"
 onClick={() => setFontSize(v)}
 aria-pressed={fontSize === v}
 className={cn(
 "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
 fontSize === v
 ? "border-primary bg-primary/10 text-primary"
 : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
 )}
 >
 {l}
 </button>
 ))}
 </div>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
 {([
 ["نمایش QR راستی‌آزمایی", showQr, setShowQr],
 ["نمایش لوگو", showLogo, setShowLogo],
 ["بارکد شماره فاکتور", showBarcode, setShowBarcode],
 ["نام صندوقدار", showCashier, setShowCashier],
 ] as Array<[string, boolean, (v: boolean) => void]>).map(([label, val, set]) => (
 <label key={label} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
 <span className="text-xs">{label}</span>
 <Switch checked={val} onCheckedChange={set} aria-label={label} />
 </label>
 ))}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="receipt-footer-msg" className="text-xs">
 پیام پایانی روی رسید
 </Label>
 <Input
 id="receipt-footer-msg"
 value={footerMessage}
 onChange={(e) => setFooterMessage(e.target.value)}
 className="h-9"
 placeholder="پیش‌فرض: از اعتماد و خرید شما سپاسگزاریم"
 maxLength={160}
 />
 </div>
 </section>

 <Separator />

 {/* اطلاعات کسب‌وکار */}
 <section className="space-y-3">
 <h3 className="text-sm font-semibold">اطلاعات کسب‌وکار روی رسید</h3>
 <div className="flex items-center gap-3">
 <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
 {logoPreview ? (
 <img src={logoPreview} alt="لوگوی کسب‌وکار" className="h-full w-full object-contain" />
 ) : (
 <ImageIcon className="h-6 w-6 text-muted-foreground" />
 )}
 </div>
 <div className="flex flex-col gap-1.5">
 <div className="flex gap-1.5">
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-8 text-[11px] gap-1"
 disabled={uploading}
 onClick={() => fileInputRef.current?.click()}
 >
 {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
 {logoPreview ? "تغییر لوگو" : "آپلود لوگو"}
 </Button>
 {logoPreview && (
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-8 text-[11px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
 disabled={uploading}
 onClick={() => void removeLogo()}
 >
 <Trash2 className="h-3 w-3" />
 حذف
 </Button>
 )}
 </div>
 <p className="text-[10px] text-muted-foreground">
 PNG، JPG، WebP یا GIF — حداکثر ۴ مگابایت
 </p>
 </div>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/png,image/jpeg,image/webp,image/gif"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) void uploadLogo(f);
 e.target.value = "";
 }}
 aria-label="انتخاب فایل لوگو"
 />
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
 <div className="space-y-1.5">
 <Label htmlFor="biz-name" className="text-xs">نام کسب‌وکار</Label>
 <Input id="biz-name" value={bizName} onChange={(e) => setBizName(e.target.value)} className="h-9" maxLength={120} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="biz-phone" className="text-xs">تلفن</Label>
 <Input id="biz-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" dir="ltr" placeholder="021-12345678" maxLength={40} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="biz-site" className="text-xs">وب‌سایت</Label>
 <Input id="biz-site" value={website} onChange={(e) => setWebsite(e.target.value)} className="h-9" dir="ltr" placeholder="example.ir" maxLength={120} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="biz-slogan" className="text-xs">شعار</Label>
 <Input id="biz-slogan" value={slogan} onChange={(e) => setSlogan(e.target.value)} className="h-9" placeholder="کیفیت، اعتماد، تضمین رضایت" maxLength={160} />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label htmlFor="biz-address" className="text-xs">آدرس</Label>
 <Input id="biz-address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-9" placeholder="تهران، خیابان ولیعصر..." maxLength={240} />
 </div>
 </div>
 </section>
 </div>

 {/* ── ستون پیش‌نمایش زنده ── */}
 <div className="space-y-2 lg:sticky lg:top-0 self-start">
 <div className="flex items-center justify-between gap-2">
 <h3 className="text-sm font-semibold">پیش‌نمایش زنده</h3>
 <div className="flex items-center gap-1.5">
 {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
 <Badge variant="secondary" className="text-[10px]">
 {invoiceId ? "فاکتور واقعی" : "دادهٔ نمونه"}
 </Badge>
 </div>
 </div>
 <p className="text-[10px] text-muted-foreground">
 {RECEIPT_TEMPLATES.find((t) => t.id === template)?.name} — عرض {toPersianDigits(String(widthMm))} میلی‌متر
 </p>
 <div className="overflow-hidden rounded-xl border bg-neutral-100">
 {previewHtml ? (
 <iframe
 title="پیش‌نمایش رسید"
 srcDoc={previewHtml}
 className="block h-[520px] w-full border-0 bg-neutral-100"
 sandbox=""
 />
 ) : (
 <div className="flex h-[520px] items-center justify-center">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 )}
 </div>
 <Button size="sm" onClick={() => void save()} disabled={saving} className="w-full gap-1.5">
 {saving ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" /> در حال ذخیره...
 </>
 ) : (
 <>
 <Save className="h-4 w-4" /> ذخیره و استفاده
 </>
 )}
 </Button>
 <p className="text-[10px] text-muted-foreground flex items-center gap-1">
 <RefreshCw className="h-3 w-3 shrink-0" />
 پس از ذخیره، دکمهٔ چاپ همهٔ فاکتورها (و فیش صندوق فروش) با همین طرح چاپ می‌کند.
 </p>
 </div>
 </div>
 );
}

/** تبدیل ارقام فارسی/عربی ورودی عددی به لاتین — برای فیلد عرض سفارشی */
function toEnDigits(s: string): string {
 return s
 .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
 .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

/* ============================================================
 ظرف دیالوگ — دکمهٔ «طرح رسید فاکتور» در ماژول فاکتورها
 ============================================================ */

interface ReceiptDesignDialogProps {
 invoiceId?: string;
 triggerLabel?: string;
 triggerSize?: "default" | "sm" | "lg" | "icon";
 triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
 className?: string;
}

export function ReceiptDesignDialog({
 invoiceId,
 triggerLabel = "طرح رسید فاکتور",
 triggerSize = "sm",
 triggerVariant = "outline",
 className,
}: ReceiptDesignDialogProps) {
 const [open, setOpen] = React.useState(false);
 return (
 <>
 <Button
 type="button"
 variant={triggerVariant}
 size={triggerSize}
 className={cn("gap-1.5", className)}
 onClick={() => setOpen(true)}
 >
 <Palette className="h-3.5 w-3.5" />
 {triggerLabel}
 </Button>
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="max-w-5xl w-[95vw] max-h-[92dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Palette className="h-4 w-4 text-primary" />
 طرح رسید فاکتور
 </DialogTitle>
 <DialogDescription>
 قالب آمادهٔ رسید، اندازهٔ کاغذ، رنگ و اطلاعات کسب‌وکار — چاپ فاکتورها به‌طور
 خودکار با همین تنظیمات انجام می‌شود.
 </DialogDescription>
 </DialogHeader>
 <ReceiptDesignStudio invoiceId={invoiceId} />
 </DialogContent>
 </Dialog>
 </>
 );
}

/* ============================================================
 ظرف کارت — بخش «طرح رسید فاکتور» در حساب کاربری
 ============================================================ */

export function ReceiptDesignCard() {
 return (
 <Card className="border-primary/20">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Palette className="h-4 w-4 text-primary" />
 طرح رسید فاکتور
 </CardTitle>
 <CardDescription className="text-xs">
 قالب آمادهٔ رسید چاپی (۵ طرح مدرن)، اندازهٔ کاغذ حرارتی، رنگ تأکیدی، لوگو
 و اطلاعات تماس شما — روی همهٔ رسیدها و فاکتورهای چاپی نمایش داده می‌شود
 </CardDescription>
 </CardHeader>
 <CardContent>
 <ReceiptDesignStudio />
 </CardContent>
 </Card>
 );
}
