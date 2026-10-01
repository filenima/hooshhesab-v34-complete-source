"use client";

import * as React from "react";
import {
 Sparkles,
 ScanText,
 BrainCircuit,
 LineChart,
 ShieldAlert,
 MessageSquare,
 CreditCard,
 FileText,
 Wand2,
 Upload,
 CheckCircle2,
 TrendingUp,
 Zap,
 Cpu,
 ArrowLeft,
 Loader2,
 AlertCircle,
 Landmark,
 ListChecks,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { toPersianDigits, formatNumber, formatCompactToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
} from "recharts";

interface AIFeature {
 icon: LucideIcon;
 title: string;
 description: string;
 badge: string;
}

const AI_FEATURES: AIFeature[] = [
 {
 icon: ScanText,
 title: "OCR فاکتور",
 description: "تبدیل عکس فاکتور به سند حسابداری با اسکن رایگان و دقت بالا",
 badge: "عکس سند",
 },
 {
 icon: BrainCircuit,
 title: "دسته‌بندی خودکار تراکنش‌ها",
 description: "طبقه‌بندی هوشمند هر تراکنش بانکی در حساب مناسب با دقت ۹۸٪",
 badge: "۹۸٪ دقت",
 },
 {
 icon: CreditCard,
 title: "تطبیق هوشمند بانکی",
 description: "مغایرت‌گیری خودکار صورت‌حساب بانک با اسناد حسابداری به‌صورت خودکار",
 badge: "خودکار",
 },
 {
 icon: LineChart,
 title: "پیش‌بینی جریان نقدی",
 description: "پیش‌بینی جریان نقدی ۹۰ و ۱۸۰ روز آینده با مدل یادگیری ماشین",
 badge: "۹۰/۱۸۰ روز",
 },
 {
 icon: ShieldAlert,
 title: "تشخیص ناهنجاری و تقلب",
 description: "ردیابی تراکنش‌های مشکوک و ناهنجاری در لحظه با هشدار real-time",
 badge: "real-time",
 },
 {
 icon: MessageSquare,
 title: "چت‌بات حسابداری فارسی",
 description: "دستیار هوشمند فارسی برای پاسخ به پرسش‌های حسابداری ۲۴ ساعته",
 badge: "۲۴/۷",
 },
 {
 icon: CreditCard,
 title: "تشخیص طرف‌حساب از شماره کارت",
 description: "شناسایی خودکار صاحب حساب از روی شماره کارت به‌صورت آنی و دقیق",
 badge: "آنی",
 },
 {
 icon: Wand2,
 title: "تولید خودکار شرح سند",
 description: "تولید هوشمند شرح فارسی مناسب برای هر سند بر اساس الگوی تراکنش",
 badge: "هوشمند",
 },
];

const AI_STATS = [
 {
 icon: BrainCircuit,
 label: "تراکنش‌های دسته‌بندی‌شده",
 value: "—",
 sub: "نمایشی",
 },
 {
 icon: ScanText,
 label: "سند تولیدشده با OCR",
 value: "—",
 sub: "نمایشی",
 },
 {
 icon: ShieldAlert,
 label: "تقلب شناسایی‌شده",
 value: "—",
 sub: "نمایشی",
 },
 {
 icon: Cpu,
 label: "دقت مدل",
 value: "—",
 sub: "نمایشی",
 },
];

// ============ انواع خروجی API ============
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

interface CategorizeResult {
 group: string;
 account: string;
 accountCode: string;
 confidence: number;
 suggestedDescription: string;
}

// ============ هوک کمکی فراخوانی API ============
type ApiResponse<T> =
 | { success: true; data: T }
 | { success: false; error?: string; raw?: string };

function useAsyncAction<T>() {
 const [loading, setLoading] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 const [data, setData] = React.useState<T | null>(null);

 const run = React.useCallback(async (fn: () => Promise<ApiResponse<T>>) => {
 setLoading(true);
 setError(null);
 try {
 const res = await fn();
 if (!res.success) {
 setError(res.error || "خطای ناشناخته");
 setData(null);
 toast.error(res.error || "عملیات ناموفق بود");
 return;
 }
 setData(res.data);
 } catch (e) {
 const msg = e instanceof Error? e.message: "خطای شبکه";
 setError(msg);
 toast.error(msg);
 } finally {
 setLoading(false);
 }
 }, []);

 return { loading, error, data, setData, run };
}

// ============ تبدیل فایل به data URL ============
function fileToDataUrl(file: File): Promise<string> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(reader.result as string);
 reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود"));
 reader.readAsDataURL(file);
 });
}

// ============ کامپوننت اصلی ============
export function AIModule() {
 return (
 <div className="space-y-5 animate-fade-in-up">
 <HeroCard />

 {/* آمار هوش مصنوعی */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {AI_STATS.map((stat) => {
 const Icon = stat.icon;
 return (
 <Card key={stat.label} className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{stat.label}</p>
 <p className="font-bold text-lg truncate tnum text-primary">
 {stat.value}
 </p>
 <p className="text-[10px] text-muted-foreground">{stat.sub}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>

 {/* گرید قابلیت‌های AI */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {AI_FEATURES.map((feature) => {
 const Icon = feature.icon;
 return (
 <Card key={feature.title} className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-start justify-between mb-3">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <Badge
 variant="secondary"
 className="text-[10px] bg-primary/10 text-primary"
 >
 {feature.badge}
 </Badge>
 </div>
 <h3 className="font-semibold text-sm mb-1.5">{feature.title}</h3>
 <p className="text-xs text-muted-foreground leading-5">
 {feature.description}
 </p>
 </CardContent>
 </Card>
 );
 })}
 </div>

 <OCRInteractiveCard />
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <CardDetectCard />
 <CategorizeCard />
 </div>
 <PredictCashCard />
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <FraudCheckCard />
 <ModelPerformanceCard />
 </div>
 </div>
 );
}

// ============ هیرو ============
function HeroCard() {
 return (
 <Card className="relative overflow-hidden border-0 bg-primary text-primary-foreground">
 <CardContent className="relative p-6 md:p-8">
 <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
 <div className="space-y-2 max-w-2xl">
 <div className="flex items-center gap-2">
 <Badge className="bg-white/15 text-primary-foreground border-white/20">
 <Sparkles className="h-3 w-3 me-1" />
 موتور هوش مصنوعی
 </Badge>
 <Badge className="bg-white/10 text-primary-foreground border-white/20">
 <Zap className="h-3 w-3 me-1" />
 آنی
 </Badge>
 </div>
 <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
 <BrainCircuit className="h-7 w-7 md:h-8 md:w-8" />
 هوش مصنوعی هوش
 </h2>
 <p className="text-primary-foreground/90 text-sm md:text-base">
 مزیت رقابتی اصلی شما — ترکیب یادگیری ماشین، OCR فارسی و مدل‌های
 زبانی برای خودکارسازی کامل حسابداری
 </p>
 </div>
 <div className="flex flex-col gap-2 w-full md:w-auto">
 <Button
 className="bg-white text-primary hover:bg-white/90 gap-1.5"
 size="lg"
 onClick={() =>
 toast.success("شروع دمو زنده", {
 description: "دموی زنده موتور هوش مصنوعی آغاز شد.",
 })
 }
 >
 <Sparkles className="h-4 w-4" />
 شروع دمو زنده
 </Button>
 <Button
 variant="outline"
 className="bg-transparent border-white/30 text-primary-foreground hover:bg-white/10 gap-1.5"
 size="lg"
 onClick={() =>
 toast.info("مستندات هوش مصنوعی", {
 description: "مستندات کامل APIهای هوش مصنوعی به‌زودی منتشر می‌شود.",
 })
 }
 >
 مشاهده مستندات
 <ArrowLeft className="h-4 w-4" />
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

// ============ OCR تعاملی ============
function OCRInteractiveCard() {
 const { loading, error, data, setData, run } = useAsyncAction<OCRResult>();
 const fileRef = React.useRef<HTMLInputElement>(null);
 const [preview, setPreview] = React.useState<string | null>(null);
 const [savingJournal, setSavingJournal] = React.useState(false);

 // ذخیره‌ی نتیجه‌ی OCR به‌عنوان سند حسابداری
 const handleSaveAsJournal = React.useCallback(async () => {
 if (!data) return;
 setSavingJournal(true);
 try {
 const description = `فاکتور خرید ${data.sellerName || "نامشخص"} — شماره ${data.invoiceNumber || "—"}${data.items.length? ` (${data.items.length} قلم)`: ""}`;
 const res = await authFetch("/api/accounting/journal-entries", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 description,
 debitAccount: "خرید کالا",
 creditAccount: "صندوق",
 amount: data.totalAmount,
 type: "JOURNAL",
 date: data.date || undefined,
 }),
 });
 const json = await res.json().catch(() => ({}));
 if (res.ok && json?.success) {
 toast.success("سند ایجاد شد", {
 description: `فاکتور ${data.invoiceNumber || "نامشخص"} به‌عنوان سند حسابداری ثبت شد.`,
 });
 } else {
 toast.error("خطا در ثبت سند", {
 description: json?.error || "ثبت سند ناموفق بود",
 });
 }
 } catch (e) {
 toast.error("خطا در ارتباط با سرور", {
 description: e instanceof Error? e.message: "ثبت سند ناموفق بود",
 });
 } finally {
 setSavingJournal(false);
 }
 }, [data]);

 const handleFile = React.useCallback(
 async (file: File) => {
 if (!file.type.startsWith("image/")) {
 toast.error("فقط فایل تصویری مجاز است");
 return;
 }
 if (file.size > 5 * 1024 * 1024) {
 toast.error("حداکثر اندازه تصویر ۵ مگابایت است");
 return;
 }
 const dataUrl = await fileToDataUrl(file);
 setPreview(dataUrl);
 await run(async () => {
 const res = await authFetch("/api/ai/ocr", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ image: dataUrl }),
 });
 return res.json();
 });
 },
 [run]
 );

 const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const f = e.target.files?.[0];
 if (f) void handleFile(f);
 };

 const onDrop = (e: React.DragEvent) => {
 e.preventDefault();
 const f = e.dataTransfer.files?.[0];
 if (f) void handleFile(f);
 };

 const reset = () => {
 setData(null);
 setPreview(null);
 if (fileRef.current) fileRef.current.value = "";
 };

 return (
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <ScanText className="h-4 w-4" />
 </span>
 OCR زنده — اسکن فاکتور
 </CardTitle>
 <Badge className="bg-success/10 text-success border-success/20">
 <span className="h-1.5 w-1.5 rounded-full bg-success me-1.5 animate-pulse" />
 آماده استفاده
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* ناحیه آپلود */}
 <div
 onDrop={onDrop}
 onDragOver={(e) => e.preventDefault()}
 className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 flex flex-col items-center justify-center text-center min-h-[300px]"
 >
 <input
 ref={fileRef}
 type="file"
 accept="image/*"
 className="hidden"
 onChange={onInputChange}
 />
 {preview? (
 <div className="space-y-3 w-full">
 <div className="relative rounded-lg overflow-hidden border bg-white max-h-[220px] flex items-center justify-center">
 {/* پیش‌نمایش تصویر آپلودشده فاکتور */}
 <img
 src={preview}
 alt="پیش‌نمایش فاکتور"
 className="max-h-[220px] w-auto object-contain"
 />
 {loading && (
 <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
 <Loader2 className="h-8 w-8 text-white animate-spin" />
 </div>
 )}
 </div>
 <div className="flex gap-2 justify-center">
 <Button
 size="sm"
 variant="outline"
 onClick={() => fileRef.current?.click()}
 disabled={loading}
 >
 <Upload className="h-3.5 w-3.5 me-1" />
 تغییر تصویر
 </Button>
 <Button
 size="sm"
 variant="ghost"
 onClick={reset}
 disabled={loading}
 >
 پاک کردن
 </Button>
 </div>
 </div>
 ): (
 <>
 <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
 {loading? (
 <Loader2 className="h-8 w-8 animate-spin" />
 ): (
 <Upload className="h-8 w-8" />
 )}
 </div>
 <p className="font-semibold mb-1">عکس فاکتور را آپلود کنید</p>
 <p className="text-xs text-muted-foreground mb-4 max-w-xs">
 فایل JPG یا PNG — حداکثر ۵ مگابایت — OCR رایگان و آنی با مدل
 دیداری glm-4.6v
 </p>
 <Button
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
 onClick={() => fileRef.current?.click()}
 disabled={loading}
 >
 <Upload className="h-4 w-4" />
 انتخاب فایل
 </Button>
 <p className="text-[10px] text-muted-foreground mt-3">
 یا فایل را اینجا رها کنید
 </p>
 </>
 )}
 </div>

 {/* داده استخراج‌شده */}
 <div className="rounded-xl border bg-card p-5">
 <div className="flex items-center gap-2 mb-4">
 {error? (
 <AlertCircle className="h-4 w-4 text-destructive" />
 ): data? (
 <CheckCircle2 className="h-4 w-4 text-success" />
 ): (
 <ScanText className="h-4 w-4 text-muted-foreground" />
 )}
 <p className="text-sm font-semibold">
 {error
? "خطا در استخراج"
: data
? "داده‌های استخراج‌شده از فاکتور"
: "در انتظار آپلود تصویر"}
 </p>
 {data && (
 <Badge
 variant="secondary"
 className="text-[10px] ms-auto bg-success/10 text-success"
 >
 استخراج موفق
 </Badge>
 )}
 </div>

 {error && (
 <div className="space-y-3">
 <p className="text-xs text-destructive">{error}</p>
 <Button size="sm" variant="outline" onClick={reset}>
 تلاش مجدد
 </Button>
 </div>
 )}

 {!error &&!data && (
 <div className="space-y-2.5">
 {[
 { label: "نام فروشنده", placeholder: "—" },
 { label: "مبلغ کل", placeholder: "—" },
 { label: "تاریخ فاکتور", placeholder: "—" },
 { label: "شماره فاکتور", placeholder: "—" },
 ].map((item) => (
 <div
 key={item.label}
 className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5"
 >
 <span className="text-xs text-muted-foreground">
 {item.label}
 </span>
 <span className="text-xs text-muted-foreground/60 tnum">
 {item.placeholder}
 </span>
 </div>
 ))}
 <p className="text-[11px] text-muted-foreground pt-2 text-center">
 پس از انتخاب تصویر، فاکتور به‌صورت خودکار پردازش می‌شود
 </p>
 </div>
 )}

 {!error && data && (
 <div className="space-y-2.5 max-h-[300px] overflow-y-auto ps-1">
 <ExtractedRow
 icon={FileText}
 label="نام فروشنده"
 value={data.sellerName || "—"}
 />
 <ExtractedRow
 icon={FileText}
 label="نام خریدار"
 value={data.buyerName || "—"}
 />
 <ExtractedRow
 icon={ScanText}
 label="شماره فاکتور"
 value={data.invoiceNumber || "—"}
 />
 <ExtractedRow
 icon={ScanText}
 label="تاریخ"
 value={data.date || "—"}
 />
 <ExtractedRow
 icon={TrendingUp}
 label="مبلغ کل"
 value={
 data.totalAmount > 0
? formatCompactToman(data.totalAmount)
: "—"
 }
 />
 {data.vat > 0 && (
 <ExtractedRow
 icon={TrendingUp}
 label="ارزش افزوده"
 value={formatNumber(data.vat) + " تومان"}
 />
 )}

 {data.items.length > 0 && (
 <div className="pt-2 mt-2 border-t">
 <div className="flex items-center gap-1.5 mb-2">
 <ListChecks className="h-3.5 w-3.5 text-primary" />
 <p className="text-xs font-semibold">
 ردیف‌های فاکتور ({toPersianDigits(data.items.length)} قلم)
 </p>
 </div>
 <div className="space-y-1.5">
 {data.items.map((it, idx) => (
 <div
 key={idx}
 className="rounded-md bg-muted/40 px-2.5 py-2 text-xs"
 >
 <div className="flex justify-between gap-2">
 <span className="font-medium line-clamp-1">
 {it.description || `ردیف ${toPersianDigits(idx + 1)}`}
 </span>
 <span className="font-semibold tnum text-primary whitespace-nowrap">
 {formatNumber(it.lineTotal || it.qty * it.unitPrice)}
 </span>
 </div>
 <div className="text-[10px] text-muted-foreground tnum mt-0.5">
 {toPersianDigits(it.qty)} ×{" "}
 {formatNumber(it.unitPrice)} تومان
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 <div className="flex items-center justify-between mt-4 pt-3 border-t">
 <span className="text-xs text-muted-foreground">
 {loading? "در حال پردازش...": "استخراج کامل شد"}
 </span>
 <Button
 size="sm"
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
 disabled={savingJournal ||!data || data.totalAmount <= 0}
 onClick={handleSaveAsJournal}
 >
 {savingJournal? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <CheckCircle2 className="h-3.5 w-3.5" />
 )}
 {savingJournal? "در حال ثبت...": "ثبت به‌عنوان سند"}
 </Button>
 </div>
 </div>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

function ExtractedRow({
 icon: Icon,
 label,
 value,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
}) {
 return (
 <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
 <div className="flex items-center gap-2">
 <Icon className="h-4 w-4 text-muted-foreground" />
 <span className="text-xs text-muted-foreground">{label}</span>
 </div>
 <span className="font-medium text-sm tnum">{value}</span>
 </div>
 );
}

// ============ تشخیص بانک از شماره کارت ============
function CardDetectCard() {
 const [cardNumber, setCardNumber] = React.useState("");
 const [bank, setBank] = React.useState<string | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);

 const detect = React.useCallback(async () => {
 if (cardNumber.replace(/\D/g, "").length < 6) {
 setError("حداقل ۶ رقم لازم است");
 setBank(null);
 return;
 }
 setLoading(true);
 setError(null);
 try {
 const res = await authFetch("/api/ai/card-detect", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ cardNumber }),
 });
 const json = await res.json();
 if (!json.success) {
 setError(json.error || "خطا");
 setBank(null);
 return;
 }
 setBank(json.bank);
 } catch (e) {
 setError(e instanceof Error? e.message: "خطای شبکه");
 setBank(null);
 } finally {
 setLoading(false);
 }
 }, [cardNumber]);

 const formatCard = (raw: string) => {
 const digits = raw.replace(/\D/g, "").slice(0, 19);
 const groups = digits.match(/.{1,4}/g)?? [];
 return groups.join(" - ");
 };

 return (
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Landmark className="h-4 w-4" />
 </span>
 تشخیص بانک از شماره کارت
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <p className="text-xs text-muted-foreground">
 شماره کارت ۱۶ رقمی را وارد کنید — بانک صادرکننده آنی شناسایی می‌شود
 (تشخیص محلی بدون نیاز به LLM)
 </p>
 <div className="flex gap-2">
 <Input
 dir="ltr"
 inputMode="numeric"
 placeholder="6037 - 9912 - 3456 - 7890"
 value={formatCard(cardNumber)}
 onChange={(e) => setCardNumber(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && detect()}
 className="text-start font-mono tnum"
 />
 <Button
 onClick={detect}
 disabled={loading}
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shrink-0"
 >
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CreditCard className="h-4 w-4" />
 )}
 تشخیص
 </Button>
 </div>

 {error && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertCircle className="h-3.5 w-3.5" />
 {error}
 </p>
 )}

 {bank!== null &&!error && (
 <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex items-center gap-3">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <Landmark className="h-5 w-5" />
 </div>
 <div className="flex-1">
 <p className="text-[10px] text-muted-foreground">بانک صادرکننده</p>
 <p className="font-bold text-primary">{bank}</p>
 </div>
 <Badge className="bg-success/10 text-success border-success/20">
 شناسایی شد
 </Badge>
 </div>
 )}

 {bank === null &&!error && cardNumber.length > 0 && (
 <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground text-center">
 در انتظار شناسایی...
 </div>
 )}

 <div className="flex flex-wrap gap-1.5 pt-1">
 {["۶۰۳۷۹۹", "۶۰۳۷۷۰", "۵۸۹۲۱۰", "۶۲۲۱۰۶"].map((p) => (
 <button
 key={p}
 onClick={() => setCardNumber(p + "1234567890")}
 className="text-[10px] px-2 py-1 rounded-md bg-muted hover:bg-primary/10 hover:text-primary transition-colors tnum"
 >
 {p}
 </button>
 ))}
 </div>
 </CardContent>
 </Card>
 );
}

// ============ دسته‌بندی تراکنش ============
function CategorizeCard() {
 const [description, setDescription] = React.useState("");
 const [amount, setAmount] = React.useState("");
 const [type, setType] = React.useState<"DEBIT" | "CREDIT">("DEBIT");
 const { loading, error, data, run } = useAsyncAction<CategorizeResult>();

 const categorize = () => {
 if (!description.trim()) {
 toast.error("شرح تراکنش را وارد کنید");
 return;
 }
 void run(async () => {
 const res = await authFetch("/api/ai/categorize", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 description,
 amount: Number(amount.replace(/\D/g, "")) || 0,
 type,
 }),
 });
 return res.json();
 });
 };

 return (
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <BrainCircuit className="h-4 w-4" />
 </span>
 دسته‌بندی هوشمند تراکنش
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <p className="text-xs text-muted-foreground">
 شرح و مبلغ تراکنش را وارد کنید — هوش مصنوعی آن را در طرح حساب ملی ایران
 دسته‌بندی می‌کند
 </p>
 <Textarea
 placeholder="مثال: واریز حقوق پرسنل اداره از طرف شرکت توسعه صنایع"
 value={description}
 onChange={(e) => setDescription(e.target.value.slice(0, 500))}
 rows={2}
 className="resize-none text-sm"
 />
 <div className="grid grid-cols-2 gap-2">
 <Input
 dir="ltr"
 inputMode="numeric"
 placeholder="مبلغ (تومان)"
 value={amount}
 onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
 className="text-start tnum"
 />
 <div className="flex rounded-lg border overflow-hidden">
 <button
 onClick={() => setType("DEBIT")}
 className={`flex-1 text-xs py-2 transition-colors ${
 type === "DEBIT"
? "bg-primary text-primary-foreground"
: "bg-background hover:bg-muted"
 }`}
 >
 برداشت
 </button>
 <button
 onClick={() => setType("CREDIT")}
 className={`flex-1 text-xs py-2 transition-colors ${
 type === "CREDIT"
? "bg-primary text-primary-foreground"
: "bg-background hover:bg-muted"
 }`}
 >
 واریز
 </button>
 </div>
 </div>
 <Button
 onClick={categorize}
 disabled={loading}
 className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
 >
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Wand2 className="h-4 w-4" />
 )}
 {loading? "در حال تحلیل...": "دسته‌بندی هوشمند"}
 </Button>

 {error && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertCircle className="h-3.5 w-3.5" />
 {error}
 </p>
 )}

 {data && (
 <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <CheckCircle2 className="h-4 w-4" />
 </div>
 <div>
 <p className="text-[10px] text-muted-foreground">
 گروه حساب
 </p>
 <p className="font-bold text-sm text-primary">
 {data.group || "—"}
 </p>
 </div>
 </div>
 <Badge className="bg-primary/10 text-primary tnum">
 {toPersianDigits(Math.round(data.confidence * 100))}٪ اطمینان
 </Badge>
 </div>
 <div className="grid grid-cols-2 gap-2 text-xs">
 <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
 <p className="text-[10px] text-muted-foreground">حساب</p>
 <p className="font-medium">{data.account || "—"}</p>
 </div>
 <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
 <p className="text-[10px] text-muted-foreground">کد حساب</p>
 <p className="font-medium tnum">{data.accountCode || "—"}</p>
 </div>
 </div>
 {data.suggestedDescription && (
 <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
 <p className="text-[10px] text-muted-foreground mb-0.5">
 شرح پیشنهادی سند
 </p>
 <p className="text-xs font-medium leading-5">
 {data.suggestedDescription}
 </p>
 </div>
 )}
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ============ عملکرد مدل‌ها ============
function ModelPerformanceCard() {
 return (
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Cpu className="h-4 w-4 text-primary" />
 عملکرد مدل‌های هوش مصنوعی
 </CardTitle>
 <p className="text-[10px] text-muted-foreground">ارقام نمایشی — در نسخه‌ی نهایی از API بارگذاری می‌شود</p>
 </CardHeader>
 <CardContent className="space-y-4">
 {[
 { label: "دقت OCR فارسی", value: 98 },
 { label: "دقت دسته‌بندی تراکنش", value: 96 },
 { label: "دقت پیش‌بینی جریان نقدی", value: 89 },
 { label: "دقت تشخیص تقلب", value: 94 },
 ].map((m) => (
 <div key={m.label}>
 <div className="flex justify-between text-xs mb-1.5">
 <span className="text-muted-foreground">{m.label}</span>
 <span className="font-semibold tnum text-primary">
 {toPersianDigits(m.value)}٪
 </span>
 </div>
 <Progress value={m.value} className="h-2" />
 </div>
 ))}
 </CardContent>
 </Card>
 );
}

// ============ پیش‌بینی جریان نقدی ============
interface CashForecastData {
 predicted: number[];
 confidence: number;
 days: number;
}

function PredictCashCard() {
 const [input, setInput] = React.useState("");
 const [days, setDays] = React.useState("30");
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<CashForecastData | null>(null);
 const [error, setError] = React.useState<string | null>(null);

 const run = async () => {
 const cleaned = input
.split(/[\s,،\n]+/)
.map((s) => Number(s.trim()))
.filter((n) => Number.isFinite(n) && n!== 0);
 if (cleaned.length < 7) {
 setError("حداقل ۷ عدد لازم است — با کاما یا خط فاصله جدا کنید.");
 setData(null);
 toast.error("داده ناکافی", {
 description: "حداقل ۷ نقطه‌ی تاریخی برای پیش‌بینی لازم است.",
 });
 return;
 }
 setLoading(true);
 setError(null);
 try {
 const res = await authFetch("/api/ai/predict-cash", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ historical: cleaned, days: Number(days) }),
 });
 const json = await res.json();
 if (!json.success) {
 throw new Error(json.error || "پیش‌بینی ناموفق بود");
 }
 setData({
 predicted: Array.isArray(json.predicted)? json.predicted: [],
 confidence: Number(json.confidence?? 0),
 days: Number(json.days?? days),
 });
 toast.success("پیش‌بینی انجام شد", {
 description: `${toPersianDigits(json.predicted?.length?? 0)} روز پیش‌بینی شد.`,
 });
 } catch (e) {
 const msg = e instanceof Error? e.message: "خطای شبکه";
 setError(msg);
 setData(null);
 toast.error("خطا در پیش‌بینی", { description: msg });
 } finally {
 setLoading(false);
 }
 };

 const chartData = React.useMemo(() => {
 if (!data) return [];
 return data.predicted.map((v, i) => ({
 day: toPersianDigits(i + 1),
 value: Math.round(v),
 }));
 }, [data]);

 return (
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <LineChart className="h-4 w-4" />
 </span>
 پیش‌بینی جریان نقدی
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <p className="text-xs text-muted-foreground">
 داده‌های تاریخی روزانه (حداقل ۷ نقطه) را وارد کنید تا هوش مصنوعی
 جریان نقدی آینده را پیش‌بینی کند.
 </p>
 <Textarea
 dir="ltr"
 placeholder="مثال: 1200000, 980000, 1500000,..."
 value={input}
 onChange={(e) => setInput(e.target.value)}
 rows={2}
 className="resize-none text-sm tnum"
 />
 <div className="flex flex-wrap gap-2 items-center">
 <div className="flex items-center gap-2">
 <Label className="text-xs whitespace-nowrap">افق (روز):</Label>
 <Select value={days} onValueChange={setDays}>
 <SelectTrigger className="h-8 w-24 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="7">۷ روز</SelectItem>
 <SelectItem value="14">۱۴ روز</SelectItem>
 <SelectItem value="30">۳۰ روز</SelectItem>
 <SelectItem value="60">۶۰ روز</SelectItem>
 <SelectItem value="90">۹۰ روز</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <Button
 onClick={run}
 disabled={loading}
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 ms-auto"
 >
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <TrendingUp className="h-4 w-4" />
 )}
 پیش‌بینی جریان نقدی
 </Button>
 </div>

 {error && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertCircle className="h-3.5 w-3.5" />
 {error}
 </p>
 )}

 {data && data.predicted.length > 0 && (
 <div className="space-y-3">
 <div className="flex items-center gap-3 flex-wrap">
 <Badge className="bg-primary/10 text-primary">
 <TrendingUp className="h-3 w-3 me-1" />
 {toPersianDigits(data.days)} روز پیش‌بینی
 </Badge>
 <Badge variant="outline" className="tnum">
 اطمینان: {toPersianDigits(Math.round(data.confidence * 100))}٪
 </Badge>
 <span className="text-xs text-muted-foreground ms-auto">
 میانگین:{" "}
 <span className="font-semibold text-primary tnum">
 {formatCompactToman(
 data.predicted.reduce((a, b) => a + b, 0) / data.predicted.length
 )}
 </span>
 </span>
 </div>
 <div className="h-64">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={chartData}>
 <defs>
 <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
 <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
 </linearGradient>
 </defs>
 <CartesianGrid
 strokeDasharray="3 3"
 stroke="hsl(var(--border))"
 vertical={false}
 />
 <XAxis
 dataKey="day"
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickLine={false}
 axisLine={false}
 />
 <YAxis
 tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
 tickFormatter={(v: number) =>
 toPersianDigits(
 Math.abs(v) >= 1_000_000
? `${formatNumber(v / 1_000_000, 1)}M`
: formatNumber(v, 0)
 )
 }
 tickLine={false}
 axisLine={false}
 width={55}
 />
 <Tooltip
 contentStyle={{
 fontSize: "12px",
 borderRadius: "8px",
 border: "1px solid hsl(var(--border))",
 background: "hsl(var(--popover))",
 color: "hsl(var(--popover-foreground))",
 }}
 formatter={(value: number) => [formatCompactToman(value), "پیش‌بینی"]}
 labelFormatter={(label) => `روز ${label}`}
 />
 <Area
 type="monotone"
 dataKey="value"
 stroke="hsl(var(--primary))"
 strokeWidth={2.5}
 fill="url(#cashGradient)"
 dot={false}
 />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ============ بررسی تقلب ============
interface FraudResult {
 isAnomaly: boolean;
 score: number;
 reason: string;
}

function FraudCheckCard() {
 const [amount, setAmount] = React.useState("");
 const [avgAmount, setAvgAmount] = React.useState("");
 const [time, setTime] = React.useState("12");
 const [isWeekend, setIsWeekend] = React.useState(false);
 const [duplicateCount, setDuplicateCount] = React.useState("0");
 const [loading, setLoading] = React.useState(false);
 const [data, setData] = React.useState<FraudResult | null>(null);
 const [error, setError] = React.useState<string | null>(null);

 const run = async () => {
 const amt = Number(amount.replace(/\D/g, ""));
 const avg = Number(avgAmount.replace(/\D/g, ""));
 const t = Number(time);
 const dup = Number(duplicateCount.replace(/\D/g, ""));
 if (!amt ||!avg) {
 setError("مبلغ و میانگین مبلغ الزامی است.");
 toast.error("اطلاعات ناقص", {
 description: "مبلغ تراکنش و میانگین را وارد کنید.",
 });
 return;
 }
 setLoading(true);
 setError(null);
 try {
 const res = await authFetch("/api/ai/fraud-check", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 amount: amt,
 avgAmount: avg,
 time: t,
 isWeekend,
 duplicateCount: dup,
 }),
 });
 const json = await res.json();
 if (!json.success) {
 throw new Error(json.error || "بررسی تقلب ناموفق بود");
 }
 const r = json.result?? {};
 const result: FraudResult = {
 isAnomaly: Boolean(r.isAnomaly),
 score: Number(r.score?? 0),
 reason: String(r.reason?? "عادی"),
 };
 setData(result);
 if (result.isAnomaly) {
 toast.warning("هشدار تقلب", {
 description: `امتیاز ریسک: ${toPersianDigits(Math.round(result.score * 100))}٪`,
 });
 } else {
 toast.success("تراکنش عادی", {
 description: "هیچ نشانه‌ی تقلبی شناسایی نشد.",
 });
 }
 } catch (e) {
 const msg = e instanceof Error? e.message: "خطای شبکه";
 setError(msg);
 setData(null);
 toast.error("خطا در بررسی تقلب", { description: msg });
 } finally {
 setLoading(false);
 }
 };

 return (
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <ShieldAlert className="h-4 w-4" />
 </span>
 بررسی تقلب تراکنش
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <p className="text-xs text-muted-foreground">
 مشخصات تراکنش را وارد کنید تا موتور تشخیص تقلب آن را تحلیل کند.
 </p>
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1">
 <Label className="text-xs">مبلغ تراکنش (تومان)</Label>
 <Input
 dir="ltr"
 inputMode="numeric"
 value={amount}
 onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
 placeholder="0"
 className="text-start tnum"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">میانگین مبلغ</Label>
 <Input
 dir="ltr"
 inputMode="numeric"
 value={avgAmount}
 onChange={(e) => setAvgAmount(e.target.value.replace(/[^\d]/g, ""))}
 placeholder="0"
 className="text-start tnum"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">ساعت تراکنش (۰-۲۳)</Label>
 <Select value={time} onValueChange={setTime}>
 <SelectTrigger className="h-9 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent className="max-h-60">
 {Array.from({ length: 24 }, (_, i) => i).map((h) => (
 <SelectItem key={h} value={String(h)}>
 {toPersianDigits(h)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label className="text-xs">تعداد تراکنش تکراری</Label>
 <Input
 dir="ltr"
 inputMode="numeric"
 value={duplicateCount}
 onChange={(e) => setDuplicateCount(e.target.value.replace(/[^\d]/g, ""))}
 placeholder="0"
 className="text-start tnum"
 />
 </div>
 </div>
 <div className="flex items-center gap-2">
 <input
 id="fraud-weekend"
 type="checkbox"
 checked={isWeekend}
 onChange={(e) => setIsWeekend(e.target.checked)}
 className="h-4 w-4 rounded border-border accent-primary"
 />
 <Label htmlFor="fraud-weekend" className="text-xs cursor-pointer">
 تراکنش در روز تعطیل انجام شده است
 </Label>
 </div>
 <Button
 onClick={run}
 disabled={loading}
 className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
 >
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <ShieldAlert className="h-4 w-4" />
 )}
 {loading? "در حال بررسی...": "بررسی تقلب"}
 </Button>

 {error && (
 <p className="text-xs text-destructive flex items-center gap-1">
 <AlertCircle className="h-3.5 w-3.5" />
 {error}
 </p>
 )}

 {data && (
 <div
 className={`rounded-lg border p-4 space-y-3 ${
 data.isAnomaly
? "bg-destructive/5 border-destructive/30"
: "bg-success/5 border-success/30"
 }`}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div
 className={`flex h-9 w-9 items-center justify-center rounded-lg ${
 data.isAnomaly
? "bg-destructive/10 text-destructive"
: "bg-success/10 text-success"
 }`}
 >
 {data.isAnomaly? (
 <ShieldAlert className="h-4 w-4" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 </div>
 <div>
 <p className="text-[10px] text-muted-foreground">نتیجه بررسی</p>
 <p
 className={`font-bold text-sm ${
 data.isAnomaly? "text-destructive": "text-success"
 }`}
 >
 {data.isAnomaly? "تراکنش مشکوک": "تراکنش عادی"}
 </p>
 </div>
 </div>
 <Badge
 className={`tnum ${
 data.isAnomaly
? "bg-destructive/10 text-destructive"
: "bg-success/10 text-success"
 }`}
 >
 امتیاز ریسک: {toPersianDigits(Math.round(data.score * 100))}٪
 </Badge>
 </div>
 <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
 <p className="text-[10px] text-muted-foreground mb-0.5">
 تحلیل:
 </p>
 <p className="text-xs font-medium leading-5">
 {data.reason}
 </p>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}
