"use client";

/**
 * QuickInvoice — فاکتور سریع برای کسب‌وکارهای کوچک، خرده‌فروشی و رستوران‌ها
 *
 * هدف: سریع‌ترین حالت ثبت فاکتور — کمترین کلیک، پر شدن خودکار اکثر فیلدها:
 *  - مشتری پیش‌فرض «فروش نقدی» (بدون نیاز به انتخاب)
 *  - جستجوی کالا با لمس/کلیک → ردیف اضافه می‌شود (قیمت و مالیات خودکار)
 *  - تاریخ/شماره/ارز خودکار
 *  - ثبت + چاپ رسید حرارتی (۸۰mm) یا A4 — با لوگو، شعار و وب‌سایت کسب‌وکار
 *  - مالیات پیش‌فرض خاموش (درخواست مالک) — با کلید روشن می‌شود
 *  - زیر فرم: «مدیریت فاکتورها» — لیست کامل با جستجو/فیلتر/ویرایش/حذف (QuickInvoiceList)
 *
 * طراحی mobile-first با هدفون لمسی بزرگ (۴۴px+)
 */

import * as React from "react";
import {
 Zap,
 Search,
 Plus,
 Minus,
 Trash2,
 Printer,
 Receipt,
 CheckCircle2,
 Loader2,
 User,
 ChevronDown,
 FileText,
 X,
 ShoppingCart,
 Percent,
 Sparkles,
 // Task 21-B:
 Clock,
 RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, toPersianDigits, toEnglishDigits, persianIncludes } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { openInvoicePrint } from "@/components/ux/print-invoice";
// Task 21-B: تاریخ‌گزین جلالی برای سررسید قرضی + فرم ویرایش فاکتور
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
// مدیریت کامل فاکتورها زیر فاکتور سریع (درخواست مالک — جایگزین «فاکتورهای اخیر»)
import { QuickInvoiceList } from "@/components/modules/quick-invoice-list";
// FIX(zero-stock): دیالوگ تأیید «موجودی صفر — باز هم فاکتور ثبت شود؟» + گزینهٔ «دیگر نپرس»
import { useZeroStockConfirm } from "@/components/ux/zero-stock-confirm";
const InvoiceFormLazy = React.lazy(() =>
 import("@/components/ux/invoice-form").then((m) => ({ default: m.InvoiceForm }))
);
import type { InvoiceFormInitialInvoice } from "@/components/ux/invoice-form";

/* ============ انواع ============ */

interface QuickProduct {
 id: string;
 name: string;
 sku: string;
 unit: string;
 salePrice: number;
 taxRate: number;
 stock: number; // FIX(zero-stock): برای هشدار «موجودی صفر» هنگام ثبت فاکتور
}

interface QuickParty {
 id: string;
 name: string;
}

interface QuickItemRow {
 key: string;
 productId: string | null;
 description: string;
 quantity: number;
 unitPrice: number;
 /** نرخ مالیات روی ارزش افزوده این قلم (کسر — مثل 0.1) */
 taxRate: number;
}

/** شمارندهٔ جلسه‌ای/روزانهٔ «چندفاکتور» — Task 21-B */
function todaySessionKey(): string {
 const d = new Date();
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, "0");
 const day = String(d.getDate()).padStart(2, "0");
 return `hoosh_quick_invoice_count_${y}${m}${day}`;
}

function readSessionCount(): number {
 try {
 const raw = sessionStorage.getItem(todaySessionKey());
 const n = Number(raw);
 return Number.isFinite(n) && n > 0 ? n : 0;
 } catch {
 return 0;
 }
}

function bumpSessionCount(): number {
 const next = readSessionCount() + 1;
 try {
 sessionStorage.setItem(todaySessionKey(), String(next));
 } catch {
 /* ignore quota */
 }
 return next;
}

/* ============ ثابت‌ها ============ */

const CASH_CUSTOMER = "فروش نقدی";
// FIX(مالیات ۱۴۰۴): نرخ مالیات بر ارزش افزوده ایران از ۱۰٪ است (قبلاً ۹٪ بود)
const VAT_RATE = 0.1;
const CACHE_TTL = 3 * 60 * 1000; // ۳ دقیقه

const PRODUCTS_CACHE_KEY = "hoosh_quick_products";
const PARTIES_CACHE_KEY = "hoosh_quick_parties";

function uid() {
 return Math.random().toString(36).slice(2, 10);
}

function readCache<T>(key: string): T | null {
 try {
 const raw = sessionStorage.getItem(key);
 if (!raw) return null;
 const parsed = JSON.parse(raw) as { t?: unknown; d?: unknown };
 // FIX(low): JSON فاسد با t نامشخص → Date.now()-undefined = NaN → شرط TTL همیشه false
 if (
 !parsed ||
 typeof parsed.t!== "number" ||
 Number.isNaN(parsed.t) ||
 Date.now() - parsed.t > CACHE_TTL
 ) {
 return null;
 }
 return parsed.d as T;
 } catch {
 return null;
 }
}

function writeCache(key: string, data: unknown) {
 try {
 sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
 } catch {
 /* ignore quota */
 }
}

/* ============ کامپوننت اصلی ============ */

export function QuickInvoice() {
 const { toast } = useToast();
 // FIX(zero-stock): تأیید موجودی صفر پیش از ثبت فاکتور
 const { confirmZeroStock, ZeroStockDialog } = useZeroStockConfirm();

 // داده‌های پایه
 const [products, setProducts] = React.useState<QuickProduct[]>([]);
 const [parties, setParties] = React.useState<QuickParty[]>([]);
 const [dataLoading, setDataLoading] = React.useState(true);

 // فرم
 const [customerName, setCustomerName] = React.useState<string>(CASH_CUSTOMER);
 const [customCustomer, setCustomCustomer] = React.useState(false);
 const [items, setItems] = React.useState<QuickItemRow[]>([]);
 // درخواست مالک: مالیات پیش‌فرض «خاموش» — کاربر در صورت نیاز روشن می‌کند
 const [withTax, setWithTax] = React.useState(false);
 const [discountPct, setDiscountPct] = React.useState(0);
 const [note, setNote] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);

 // Task 21-B: قرضی (نسیه) + سررسید + شمارندهٔ چندفاکتور
 const [isCredit, setIsCredit] = React.useState(false);
 const [dueDate, setDueDate] = React.useState("");
 const [sessionCount, setSessionCount] = React.useState(0);
 React.useEffect(() => {
 setSessionCount(readSessionCount());
 }, []);

 // Task 21-B: ویرایش فاکتور — همان فرم اصلی پیش‌پرشده
 // (واکشی جزئیات در QuickInvoiceList انجام می‌شود — والد فقط دیالوگ را باز می‌کند)
 const [editInvoice, setEditInvoice] = React.useState<InvoiceFormInitialInvoice | null>(null);
 const [editOpen, setEditOpen] = React.useState(false);
 const searchInputRef = React.useRef<HTMLInputElement | null>(null);

 // سیگنال رفرش لیست مدیریت فاکتورها (پس از ثبت/ویرایش)
 const [listRefresh, setListRefresh] = React.useState(0);
 const openEdit = React.useCallback((initial: InvoiceFormInitialInvoice) => {
 setEditInvoice(initial);
 setEditOpen(true);
 }, []);

 // جستجوی کالا
 const [searchOpen, setSearchOpen] = React.useState(false);
 const [searchQuery, setSearchQuery] = React.useState("");

 // انتخاب مشتری
 const [customerOpen, setCustomerOpen] = React.useState(false);
 const [customerSearch, setCustomerSearch] = React.useState("");
 const [newCustomerName, setNewCustomerName] = React.useState("");

 // نتیجه ثبت
 const [lastSaved, setLastSaved] = React.useState<{ id: string; number: string; total: number } | null>(null);

 /* ============ بارگذاری داده‌ها (با کش) ============ */

 const loadBaseData = React.useCallback(async (force = false) => {
 setDataLoading(true);
 try {
 // FIX(WH-6 — stale-while-revalidate): کش فقط برای «نمایش فوری» است؛
 // همیشه یک fetch تازه در پس‌زمینه انجام می‌شود تا لیست هرگز کهنه نماند.
 let prods = force? null: readCache<QuickProduct[]>(PRODUCTS_CACHE_KEY);
 let prts = force? null: readCache<QuickParty[]>(PARTIES_CACHE_KEY);

 // نمایش فوری از کش (اگر موجود بود) — UI بلاک نمی‌شود
 if (prods) setProducts(prods);
 if (prts) setParties(prts);

 const jobs: Promise<void>[] = [];
 // FIX(perf-1200): همهٔ کالاها با صفحه‌بندی خودکار واکشی می‌شوند (قبلاً فقط ۵۰۰تای اول —
 // با ۱۲۰۰+ کالا، بقیه در جستجوی فاکتور سریع دیده نمی‌شدند). + موجودی هر کالا
 jobs.push(
 (async () => {
  try {
   const PAGE = 1000;
   const MAX = 20000;
   const all: QuickProduct[] = [];
   let total = 0;
   let fetched = 0;
   do {
    const r = await authFetch(`/api/products?limit=${PAGE}&offset=${fetched}&sortBy=name&sortOrder=asc`, { cache: "no-store" });
    const j = await r.json();
    if (!j?.success || !Array.isArray(j.data)) break;
    total = typeof j.total === "number" ? j.total : (j.data as unknown[]).length;
    for (const p of j.data as Record<string, unknown>[]) {
     all.push({
      id: String(p.id),
      name: String(p.name || ""),
      sku: String(p.sku || ""),
      unit: String(p.unit || "عدد"),
      salePrice: Number(p.salePrice) || 0,
      // FIX(M14): نرخ مالیات خودِ کالا — کالای معاف/با نرخ متفاوت دیگر ۱۰٪ سراسری نمی‌گیرد
      taxRate: Number(p.taxRate ?? VAT_RATE) || 0,
      stock: Number((p as { stock?: number }).stock ?? 0) || 0,
     });
    }
    fetched += (j.data as unknown[]).length;
   } while (fetched > 0 && fetched < total && fetched < MAX);
   if (all.length > 0) {
    writeCache(PRODUCTS_CACHE_KEY, all);
    setProducts(all);
   }
  } catch {
   /* شکت شبکه — کش موجود (در صورت بودن) نمایش داده می‌شود */
  }
 })()
 );
 jobs.push(
 authFetch("/api/parties?limit=300&sortBy=name&sortOrder=asc", { cache: "no-store" })
 .then((r) => r.json())
 .then((j) => {
 if (j?.success && Array.isArray(j.data)) {
 prts = j.data.map((p: Record<string, unknown>) => ({
 id: String(p.id),
 name: String(p.name || ""),
 }));
 writeCache(PARTIES_CACHE_KEY, prts);
 setParties(prts as QuickParty[]);
 }
 })
 .catch(() => {})
 );
 await Promise.all(jobs);
 } finally {
 setDataLoading(false);
 }
 }, []);

 React.useEffect(() => {
 loadBaseData();
 }, [loadBaseData]);

 // FIX(WH-6): کش کالا/طرف‌ها هنگام تغییر داده در سایر ماژول‌ها (انبار، فاکتور اصلی و...)
 // بی‌درنگ ابطال و بازخوانی می‌شود — قبلاً فاکتور سریع تا ۳ دقیقه لیست قدیمی نشان می‌داد
 // و «کالای تازه ثبت‌شده در فاکتور سریع نمایش داده نمی‌شد».
 React.useEffect(() => {
 const onDataChanged = (e: Event) => {
 const detail = (e as CustomEvent<{ entity?: string }>).detail;
 const entity = detail?.entity;
 if (entity && entity!== "products" && entity!== "parties" && entity!== "all") return;
 // کش مرتبط را مستقیم پاک می‌کنیم (حتی اگر entity فقط یکی باشد، هر دو ارزان است)
 try {
 localStorage.removeItem(PRODUCTS_CACHE_KEY);
 localStorage.removeItem(PARTIES_CACHE_KEY);
 } catch {
 /* ignore */
 }
 loadBaseData(true); // force — دور کش
 };
 window.addEventListener("hoshhesab:data-changed", onDataChanged as EventListener);
 return () =>
 window.removeEventListener("hoshhesab:data-changed", onDataChanged as EventListener);
 }, [loadBaseData]);

 // FIX(WH-6): وقتی ماژول دوباره نمایان می‌شود (سوییچ بین ماژول‌ها بدون unmount)
 // هم‌راستا با چرخه عمر ساده، کش تازه می‌شود
 React.useEffect(() => {
 const onVisible = () => {
 if (document.visibilityState === "visible") loadBaseData(true);
 };
 document.addEventListener("visibilitychange", onVisible);
 return () => document.removeEventListener("visibilitychange", onVisible);
 }, [loadBaseData]);

 /* ============ محاسبات ============ */

 const lineNet = React.useCallback(
 (r: QuickItemRow) => {
 const gross = r.quantity * r.unitPrice;
 return gross * (1 - discountPct / 100);
 },
 [discountPct]
 );

 const subtotal = items.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
 // FIX(M14): مالیات با نرخ خودِ هر قلم (کالای معاف = 0) — نه ۹/۱۰٪ سراسری
 const tax = items.reduce(
 (s, r) => s + (withTax ? lineNet(r) * (r.taxRate ?? VAT_RATE) : 0),
 0
 );
 const discountAmount = items.reduce((s, r) => s + (r.quantity * r.unitPrice) * (discountPct / 100), 0);
 const total = subtotal - discountAmount + tax;

 // برچسب درصد مالیات — اگر همه اقلام نرخ یکسان دارند همان نرخ نشان داده می‌شود
 const taxRateLabel = React.useMemo(() => {
 if (items.length === 0 ||!withTax) return "۱۰٪";
 const rates = new Set(items.map((r) => r.taxRate ?? VAT_RATE));
 if (rates.size!== 1) return "";
 const rate = [...rates][0];
 return rate > 0 ? `${toPersianDigits(Math.round(rate * 100))}٪` : "";
 }, [items, withTax]);

 /* ============ عملیات اقلام ============ */

 const filteredProducts = React.useMemo(() => {
 // FIX(search): نرمال‌سازی فارسی — «كیف» عربی داده‌ها با «کیف» فارسی کاربر مچ می‌شود
 const q = searchQuery.trim();
 if (!q) return products.slice(0, 8);
 return products
 .filter(
 (p) => persianIncludes(p.name, q) || persianIncludes(p.sku, q)
 )
 .slice(0, 10);
 }, [products, searchQuery]);

 const addProductRow = React.useCallback(
 (p: QuickProduct) => {
 setItems((prev) => {
 // اگر کالا قبلاً هست، تعدادش را زیاد کن
 const idx = prev.findIndex((r) => r.productId === p.id);
 if (idx >= 0) {
 const copy = [...prev];
 copy[idx] = {...copy[idx], quantity: copy[idx].quantity + 1 };
 return copy;
 }
 return [
 ...prev,
 {
 key: uid(),
 productId: p.id,
 description: p.name,
 quantity: 1,
 unitPrice: p.salePrice,
 taxRate: p.taxRate ?? VAT_RATE,
 },
 ];
 });
 setSearchQuery("");
 setSearchOpen(false);
 },
 []
 );

 const addFreeItem = React.useCallback(() => {
 const name = searchQuery.trim();
 if (!name) return;
 setItems((prev) => [
 ...prev,
 { key: uid(), productId: null, description: name, quantity: 1, unitPrice: 0, taxRate: VAT_RATE },
 ]);
 setSearchQuery("");
 setSearchOpen(false);
 }, [searchQuery]);

 const updateRow = React.useCallback((key: string, patch: Partial<QuickItemRow>) => {
 setItems((prev) => prev.map((r) => (r.key === key? {...r, ...patch}: r)));
 }, []);

 const removeRow = React.useCallback((key: string) => {
 setItems((prev) => prev.filter((r) => r.key !== key));
 }, []);

 /* ============ انتخاب مشتری ============ */

 const filteredParties = React.useMemo(() => {
 // FIX(search): نرمال‌سازی فارسی برای نام مشتری‌ها هم
 const q = customerSearch.trim();
 if (!q) return parties.slice(0, 8);
 return parties.filter((p) => persianIncludes(p.name, q)).slice(0, 10);
 }, [parties, customerSearch]);

 const pickCustomer = (name: string) => {
 setCustomerName(name);
 setCustomCustomer(name !== CASH_CUSTOMER);
 setCustomerOpen(false);
 setCustomerSearch("");
 setNewCustomerName("");
 };

 /* ============ ثبت فاکتور ============ */

 const performSubmit = React.useCallback(
 async (mode: "none" | "receipt" | "a4" | "reserve", allowNegStock = false) => {
 if (items.length === 0) return;

 setSubmitting(true);
 try {
 const payload = {
 type: "SALE",
 // FIX(zero-stock): پس از تأیید کاربر در دیالوگ «موجودی صفر»، سرور اجازهٔ ثبت می‌دهد
 allowNegativeStock: allowNegStock,
 // FIX(v11): SENT نهایی — قبلاً DRAFT ثبت می‌شد و نه سند حسابداری می‌خورد نه خروج انبار؛
 // ولی فیش حرارتی مشتری چاپ می‌شد! (مطابق pos-terminal)
 // Task 21-B: رزرو → RESERVED (بدون اثر انبار/سند تا «ثبت نهایی»)
 status: mode === "reserve" ? "RESERVED" : "SENT",
 // نام مشتری — API خودش طرف‌حساب را پیدا یا می‌سازد
 partyName: customerName.trim() || CASH_CUSTOMER,
 description: note.trim() || undefined,
 currency: "IRR",
 // Task 21-B: قرضی (نسیه) + سررسید
 paymentType: isCredit ? "CREDIT" : "CASH",
 dueDate: isCredit && dueDate ? dueDate : undefined,
 items: items.map((r) => ({
 productId: r.productId || undefined,
 description: r.description,
 quantity: r.quantity,
 unitPrice: r.unitPrice,
 discount: discountPct,
 // FIX(M14): نرخ مالیات واقعی قلم (کالای معاف = 0) — قبلاً ۹٪ سراسری بود
 taxRate: withTax ? (r.taxRate ?? VAT_RATE) : 0,
 })),
 };

 // Task 21-B: مسیر جدید /api/invoices — آینهٔ کامل accounting + رزرو/قرضی
 const res = await authFetch("/api/invoices", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) {
 throw new Error(data.error || "خطا در ثبت فاکتور");
 }

 const inv = data.data;
 setLastSaved({
 id: inv.id,
 number: String(inv.number),
 total: Number(inv.total) || 0,
 });

 // Task 21-B: شمارندهٔ چندفاکتور «امروز»
 setSessionCount(bumpSessionCount());

 toast({
 title:
 mode === "reserve"
 ? `فاکتور ${toPersianDigits(String(inv.number))} رزرو شد`
 : `فاکتور ${toPersianDigits(String(inv.number))} ثبت شد`,
 description:
 mode === "reserve"
 ? "بدون اثر انبار/سند — از ماژول «خرید و فروش» ثبت نهایی کنید."
 : `مبلغ: ${formatNumber(Number(inv.total) || 0)} ریال`,
 });

 // FIX(v11): رویداد سراسری — لیست فاکتورها و داشبورد هم‌زمان به‌روز شوند
 if (typeof window !== "undefined") {
 window.dispatchEvent(new CustomEvent("hoshhesab:invoices-changed"));
 }

 // باز کردن چاپ — FIX(C1): با authFetch + Blob (قبلاً window.open مستقیم → 401)
 if (mode !== "none" && mode !== "reserve" && typeof window !== "undefined") {
 void openInvoicePrint(inv.id, {
 mode: mode === "receipt" ? "thermal" : "a4",
 autoprint: mode === "receipt",
 toast,
 });
 }

 // ریست فرم برای فاکتور بعدی
 setItems([]);
 setNote("");
 setDiscountPct(0);
 // Task 21-B (چندفاکتور): مشتری برای فاکتور بعدی «همان» می‌ماند —
 // دکمهٔ «فاکتور بعدی» روی کارت نتیجه، فرم را برای همان مشتری آماده می‌کند.
 // (قبلاً بی‌صدا به «فروش نقدی» برمی‌گشت.)

 // به‌روزرسانی لیست مدیریت فاکتورها + کش طرف‌حساب ممکن است تغییر کرده باشد
 setListRefresh((n) => n + 1);
 sessionStorage.removeItem(PARTIES_CACHE_KEY);
 } catch (err) {
 toast({
 title: "خطا در ثبت فاکتور",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 },
 [items, customerName, note, withTax, discountPct, isCredit, dueDate, toast]
 );

 const submit = React.useCallback(
 async (mode: "none" | "receipt" | "a4" | "reserve") => {
 if (items.length === 0) {
 toast({
 title: "فاکتور خالی است",
 description: "حداقل یک قلم اضافه کنید — کالا را جستجو و انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 if (items.some((r) => r.quantity <= 0)) {
 toast({
 title: "تعداد نامعتبر",
 description: "تعداد همه اقلام باید حداقل ۱ باشد.",
 variant: "destructive",
 });
 return;
 }
 // Task 21-B: قرضی بدون سررسید هم مجاز است (سررسید اختیاری)

 // FIX(zero-stock): اگر کالایی موجودی صفر دارد و کاربر «دیگر نپرس» را نزده،
 // پیش از ثبت پرسیده می‌شود: «موجودی صفر است، باز هم مایلید فاکتور ثبت شود؟»
 const stockById = new Map(products.map((p) => [p.id, p.stock]));
 const zeroItems = items
 .filter((r) => r.productId && (stockById.get(r.productId) ?? 0) <= 0)
 .map((r) => ({ name: r.description, stock: stockById.get(r.productId!) ?? 0 }));
 if (zeroItems.length > 0) {
 confirmZeroStock(zeroItems, () => void performSubmit(mode, true));
 return;
 }
 void performSubmit(mode, false);
 },
 [items, products, confirmZeroStock, performSubmit]
 );

 /* ============ رندر ============ */

 return (
 <div className="space-y-4 sm:space-y-5 pb-20 lg:pb-0">
 {/* FIX(zero-stock): دیالوگ تأیید موجودی صفر + تیک «دیگر نپرس» */}
 {ZeroStockDialog}
 {/* هدر */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2.5">
 <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
 <Zap className="h-4.5 w-4.5 text-primary" />
 </div>
 <div>
 <h2 className="text-base font-bold text-foreground">فاکتور سریع</h2>
 <p className="text-[11px] text-muted-foreground">
 مناسب خرده‌فروشی و رستوران — ثبت در چند ثانیه
 </p>
 </div>
 </div>
 <Badge variant="secondary" className="gap-1 text-[10px]">
 <Sparkles className="h-3 w-3" />
 تکمیل خودکار
 </Badge>
 </div>

 <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-5">
 {/* ستون فرم */}
 <div className="xl:col-span-3 space-y-4">
 <Card className="border-primary/20">
 <div className="p-4 sm:p-5 space-y-4">
 {/* مشتری */}
 <div className="relative">
 <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
 مشتری
 </label>
 <button
 type="button"
 onClick={() => setCustomerOpen((v) =>!v)}
 className="w-full flex items-center justify-between gap-2 rounded-lg border border-input bg-background px-3.5 py-3 text-sm hover:bg-accent/50 transition-colors min-h-[44px]"
 aria-haspopup="listbox"
 aria-expanded={customerOpen}
 >
 <span className="flex items-center gap-2 truncate">
 <User className="h-4 w-4 text-muted-foreground shrink-0" />
 <span className={customCustomer? "text-foreground": "text-muted-foreground"}>
 {customCustomer || customerName !== CASH_CUSTOMER? customerName: `${CASH_CUSTOMER} (پیش‌فرض)`}
 </span>
 </span>
 <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${customerOpen? "rotate-180": ""}`} />
 </button>

 {customerOpen && (
 <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-border bg-popover shadow-lg p-2 space-y-2">
 <Input
 autoFocus
 value={customerSearch}
 onChange={(e) => setCustomerSearch(e.target.value)}
 placeholder="جستجوی مشتری..."
 className="h-10"
 onKeyDown={(e) => {
 if (e.key === "Enter" && filteredParties.length > 0) {
 pickCustomer(filteredParties[0].name);
 }
 }}
 />
 <div className="max-h-56 overflow-y-auto">
 {dataLoading? (
 <p className="text-xs text-muted-foreground text-center py-4">در حال بارگذاری...</p>
 ): filteredParties.length === 0? (
 <p className="text-xs text-muted-foreground text-center py-4">مشتری پیدا نشد</p>
 ): (
 filteredParties.map((p) => (
 <button
 key={p.id}
 type="button"
 onClick={() => pickCustomer(p.name)}
 className={`w-full text-right px-3 py-2.5 rounded-md text-sm hover:bg-accent transition-colors min-h-[40px] ${
 p.name === customerName? "bg-accent font-semibold": ""
 }`}
 >
 {p.name}
 {p.name === CASH_CUSTOMER && (
 <span className="text-[10px] text-muted-foreground mr-1">(نقدی)</span>
 )}
 </button>
 ))
 )}
 </div>
 {/* مشتری جدید سریع */}
 <div className="pt-2 border-t border-border">
 <div className="flex gap-2">
 <Input
 value={newCustomerName}
 onChange={(e) => setNewCustomerName(e.target.value)}
 placeholder="مشتری جدید — فقط نام..."
 className="h-10"
 onKeyDown={(e) => {
 if (e.key === "Enter" && newCustomerName.trim()) {
 pickCustomer(newCustomerName.trim());
 }
 }}
 />
 <Button
 type="button"
 size="sm"
 variant="secondary"
 className="h-10 shrink-0 gap-1"
 disabled={!newCustomerName.trim()}
 onClick={() => newCustomerName.trim() && pickCustomer(newCustomerName.trim())}
 >
 <Plus className="h-3.5 w-3.5" />
 افزودن
 </Button>
 </div>
 </div>
 </div>
 )}

 {customerOpen && (
 <div
 className="fixed inset-0 z-20"
 onClick={() => setCustomerOpen(false)}
 aria-hidden="true"
 />
 )}
 </div>

 {/* جستجوی کالا */}
 <div>
 <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
 افزودن کالا یا خدمت
 </label>
 <div className="relative">
 <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <input
 ref={searchInputRef}
 value={searchQuery}
 onChange={(e) => {
 setSearchQuery(e.target.value);
 setSearchOpen(true);
 }}
 onFocus={() => setSearchOpen(true)}
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 if (filteredProducts.length > 0) addProductRow(filteredProducts[0]);
 else if (searchQuery.trim()) addFreeItem();
 }
 }}
 placeholder="نام کالا یا کد — بنویس و انتخاب کن..."
 className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-9"
 inputMode="search"
 />

 {searchOpen && (searchQuery.trim() || filteredProducts.length > 0) && (
 <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-border bg-popover shadow-lg p-2">
 {dataLoading? (
 <p className="text-xs text-muted-foreground text-center py-3">
 <Loader2 className="h-4 w-4 animate-spin inline ml-1" />
 در حال بارگذاری کالاها...
 </p>
 ): (
 <>
 {filteredProducts.map((p) => (
 <button
 key={p.id}
 type="button"
 onClick={() => addProductRow(p)}
 className="w-full flex items-center justify-between gap-2 text-right px-3 py-2.5 rounded-md hover:bg-accent transition-colors min-h-[44px]"
 >
 <span className="text-sm font-medium truncate">{p.name}</span>
 <span className="text-xs text-muted-foreground shrink-0 tnum">
 {formatNumber(p.salePrice)} ریال
 </span>
 </button>
 ))}
 {searchQuery.trim() && filteredProducts.length === 0 && (
 <p className="text-xs text-muted-foreground text-center py-2">
 کالایی پیدا نشد
 </p>
 )}
 {searchQuery.trim() && (
 <button
 type="button"
 onClick={addFreeItem}
 className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border border-dashed border-border hover:bg-accent/50 transition-colors text-xs text-primary min-h-[44px]"
 >
 <Plus className="h-3.5 w-3.5" />
 افزودن «{searchQuery.trim()}» به‌عنوان قلم آزاد
 </button>
 )}
 </>
 )}
 </div>
 )}
 </div>

 {products.length === 0 &&!dataLoading && (
 <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
 هنوز کالایی ثبت نشده — می‌توانید قلم آزاد (بدون کالا) بنویسید یا از
 ماژول «انبار و کالا» کالاها را اضافه کنید.
 </p>
 )}
 </div>

 {/* اقلام فاکتور */}
 {items.length > 0 && (
 <div className="rounded-lg border border-border overflow-hidden">
 {/* هدر جدول — فقط دسکتاپ */}
 <div className="hidden sm:grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
 <div className="col-span-5">شرح</div>
 <div className="col-span-3 text-center">تعداد</div>
 <div className="col-span-3 text-center">قیمت واحد (ریال)</div>
 <div className="col-span-1 text-center">حذف</div>
 </div>

 <div className="divide-y divide-border">
 {items.map((r) => (
 <div key={r.key} className="px-3 py-3">
 <div className="sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center space-y-2 sm:space-y-0">
 {/* شرح */}
 <div className="sm:col-span-5 flex items-center justify-between gap-2">
 <span className="text-sm font-medium text-foreground leading-snug break-words">
 {r.description}
 {!r.productId && (
 <Badge variant="outline" className="mr-1.5 text-[9px]">آزاد</Badge>
 )}
 </span>
 <span className="sm:hidden text-xs text-muted-foreground tnum shrink-0">
 {formatNumber(r.quantity * r.unitPrice)} ریال
 </span>
 </div>

 {/* تعداد — استپر لمسی */}
 <div className="sm:col-span-3 flex items-center justify-center gap-1.5">
 <button
 type="button"
 aria-label="کاهش تعداد"
 onClick={() => updateRow(r.key, { quantity: Math.max(1, r.quantity - 1) })}
 className="h-10 w-10 rounded-lg border border-border flex items-center justify-center hover:bg-accent active:scale-95 transition-all"
 >
 <Minus className="h-4 w-4" />
 </button>
 <span className="w-12 text-center text-sm font-bold tnum">{toPersianDigits(r.quantity)}</span>
 <button
 type="button"
 aria-label="افزایش تعداد"
 onClick={() => updateRow(r.key, { quantity: r.quantity + 1 })}
 className="h-10 w-10 rounded-lg border border-border flex items-center justify-center hover:bg-accent active:scale-95 transition-all"
 >
 <Plus className="h-4 w-4" />
 </button>
 </div>

 {/* قیمت */}
 <div className="sm:col-span-3 flex items-center justify-center">
 <Input
 value={r.unitPrice === 0? "": String(r.unitPrice)}
 onChange={(e) => {
 // FIX(M3): ارقام فارسی/عربی قبل از حذف نویسه‌های غیرعددی به لاتین تبدیل می‌شوند
 const v = toEnglishDigits(e.target.value).replace(/[^\d]/g, "");
 updateRow(r.key, { unitPrice: v? Number(v): 0 });
 }}
 inputMode="numeric"
 className="h-10 text-center text-sm tnum max-w-[160px]"
 aria-label="قیمت واحد"
 />
 </div>

 {/* حذف */}
 <div className="sm:col-span-1 flex items-center justify-center">
 <button
 type="button"
 aria-label={`حذف ${r.description}`}
 onClick={() => removeRow(r.key)}
 className="h-10 w-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
 >
 <Trash2 className="h-4 w-4" />
 </button>
 </div>
 </div>
 {/* جمع ردیف — موبایل */}
 <div className="sm:hidden flex items-center justify-between pt-2 border-t border-dashed border-border/60 mt-2">
 <span className="text-[10px] text-muted-foreground">جمع ردیف</span>
 <span className="text-sm font-bold tnum">
 {formatNumber(r.quantity * r.unitPrice)} ریال
 </span>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* گزینه‌ها */}
 <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
 <div className="flex items-center gap-2">
 <Switch
 id="qi-tax"
 checked={withTax}
 onCheckedChange={setWithTax}
 aria-label="مالیات ارزش افزوده"
 />
 <label htmlFor="qi-tax" className="text-xs text-muted-foreground cursor-pointer select-none">
 مالیات ارزش افزوده (۱۰٪)
 {!withTax && <span className="text-[10px] text-muted-foreground/70"> — خاموش</span>}
 </label>
 </div>
 <div className="flex items-center gap-2">
 <Percent className="h-3.5 w-3.5 text-muted-foreground" />
 <Input
 value={discountPct === 0? "": String(discountPct)}
 onChange={(e) => {
 // FIX(M3): ارقام فارسی/عربی قبل از حذف نویسه‌های غیرعددی به لاتین تبدیل می‌شوند
 const v = toEnglishDigits(e.target.value).replace(/[^\d]/g, "");
 setDiscountPct(v? Math.min(Number(v), 99): 0);
 }}
 inputMode="numeric"
 className="h-9 w-16 text-center text-xs tnum"
 aria-label="درصد تخفیف"
 placeholder="۰"
 />
 <span className="text-xs text-muted-foreground">٪ تخفیف</span>
 </div>

 {/* Task 21-B: فاکتور قرضی (نسیه) + سررسید */}
 <div className="flex items-center gap-2">
 <Switch
 id="qi-credit"
 checked={isCredit}
 onCheckedChange={(v) => {
 setIsCredit(v);
 if (!v) setDueDate("");
 }}
 aria-label="فاکتور قرضی (نسیه)"
 />
 <label
 htmlFor="qi-credit"
 className="text-xs text-muted-foreground cursor-pointer select-none"
 >
 فاکتور قرضی (نسیه)
 </label>
 {isCredit && (
 <div className="flex-1 min-w-[160px]">
 <JalaliDatePicker
 value={dueDate}
 onChange={setDueDate}
 placeholder="سررسید (اختیاری)"
 className="h-9"
 />
 </div>
 )}
 </div>
 </div>

 {/* یادداشت */}
 <Input
 value={note}
 onChange={(e) => setNote(e.target.value)}
 placeholder="یادداشت فاکتور (اختیاری)..."
 className="h-10 text-xs"
 maxLength={200}
 />

 {/* دکمه‌های ثبت */}
 <div className="flex flex-col sm:flex-row gap-2">
 <Button
 type="button"
 size="lg"
 className="flex-1 h-12 gap-2 text-sm font-bold"
 disabled={submitting || items.length === 0}
 onClick={() => submit("receipt")}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Receipt className="h-4 w-4" />
 )}
 ثبت و چاپ رسید
 </Button>
 <Button
 type="button"
 size="lg"
 variant="secondary"
 className="flex-1 h-12 gap-2 text-sm"
 disabled={submitting || items.length === 0}
 onClick={() => submit("a4")}
 >
 <Printer className="h-4 w-4" />
 ثبت و چاپ A4
 </Button>
 <Button
 type="button"
 size="lg"
 variant="outline"
 className="h-12 gap-2 text-sm"
 disabled={submitting || items.length === 0}
 onClick={() => submit("none")}
 >
 <FileText className="h-4 w-4" />
 فقط ثبت
 </Button>
 {/* Task 21-B: رزرو فاکتور — بدون اثر انبار/سند تا «ثبت نهایی» */}
 <Button
 type="button"
 size="lg"
 variant="secondary"
 className="h-12 gap-2 text-sm"
 disabled={submitting || items.length === 0}
 title="فاکتور ذخیره می‌شود ولی انبار/دفاتر دست نمی‌خورند تا «ثبت نهایی»"
 onClick={() => submit("reserve")}
 >
 {submitting ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Clock className="h-4 w-4" />
 )}
 رزرو فاکتور
 </Button>
 </div>
 </div>
 </Card>

 {/* نتیجه ثبت */}
 {lastSaved && (
 <Card className="border-success/30 bg-success/5">
 <div className="p-4 space-y-3">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2.5">
 <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
 <div>
 <p className="text-sm font-bold text-foreground">
 فاکتور {toPersianDigits(lastSaved.number)} ثبت شد
 </p>
 <p className="text-[11px] text-muted-foreground tnum">
 مبلغ: {formatNumber(lastSaved.total)} ریال
 </p>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 {/* Task 21-B (چندفاکتور): فاکتور بعدی برای «همان مشتری» با یک کلیک */}
 <Button
 size="sm"
 className="gap-1.5 h-9"
 title={`فرم برای فاکتور بعدیِ «${customerName}» آماده می‌شود`}
 onClick={() => {
 setLastSaved(null);
 setItems([]);
 setNote("");
 setDiscountPct(0);
 // مشتری همان قبلی می‌ماند — فقط جستجوی کالا فوکوس می‌شود
 searchInputRef.current?.focus();
 }}
 >
 <RotateCw className="h-3.5 w-3.5" />
 فاکتور بعدی ({customerName})
 </Button>
 <Button
 size="sm"
 variant="secondary"
 className="gap-1.5 h-9"
 onClick={() =>
 void openInvoicePrint(lastSaved.id, { mode: "thermal", autoprint: true, toast })
 }
 >
 <Receipt className="h-3.5 w-3.5" />
 رسید
 </Button>
 <Button
 size="sm"
 variant="secondary"
 className="gap-1.5 h-9"
 onClick={() => void openInvoicePrint(lastSaved.id, { mode: "a4", toast })}
 >
 <Printer className="h-3.5 w-3.5" />
 A4
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="h-9 gap-1.5"
 onClick={() => setLastSaved(null)}
 >
 <X className="h-3.5 w-3.5" />
 بستن
 </Button>
 </div>
 </div>
 {/* Task 21-B (چندفاکتور): بازخورد جلسه‌ای */}
 {sessionCount > 0 && (
 <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
 <Sparkles className="h-3 w-3 text-success" />
 {toPersianDigits(sessionCount)} فاکتور امروز ثبت شد
 {customCustomer ? ` — مشتری جاری: ${customerName}` : ""}
 </p>
 )}
 </div>
 </Card>
 )}
 </div>

 {/* ستون خلاصه فاکتور جاری */}
 <div className="xl:col-span-2 space-y-4">
 {/* خلاصه فاکتور جاری */}
 <Card className="xl:sticky xl:top-4 border-primary/20 bg-gradient-to-br from-background to-primary/5">
 <div className="p-4 sm:p-5 space-y-3">
 <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
 <ShoppingCart className="h-4 w-4 text-primary" />
 فاکتور جاری
 </h3>
 <div className="space-y-2 text-sm">
 <div className="flex justify-between text-muted-foreground">
 <span>تعداد اقلام</span>
 <span className="tnum font-medium text-foreground">
 {toPersianDigits(items.reduce((s, r) => s + r.quantity, 0))}
 </span>
 </div>
 <div className="flex justify-between text-muted-foreground">
 <span>جمع اقلام</span>
 <span className="tnum font-medium text-foreground">{formatNumber(subtotal)} ریال</span>
 </div>
 {discountAmount > 0 && (
 <div className="flex justify-between text-muted-foreground">
 <span>تخفیف ({toPersianDigits(discountPct)}٪)</span>
 <span className="tnum font-medium text-foreground">-{formatNumber(discountAmount)} ریال</span>
 </div>
 )}
 {withTax && tax > 0 && (
 <div className="flex justify-between text-muted-foreground">
 <span>مالیات ({taxRateLabel || "ارزش افزوده"})</span>
 <span className="tnum font-medium text-foreground">{formatNumber(tax)} ریال</span>
 </div>
 )}
 <div className="border-t border-border pt-2.5 flex justify-between items-center">
 <span className="font-bold text-foreground">قابل پرداخت</span>
 <span className="text-lg font-extrabold text-primary tnum">
 {formatNumber(total)}
 <span className="text-xs font-medium mr-1">ریال</span>
 </span>
 </div>
 </div>
 {items.length > 0 && (
 <Button
 variant="ghost"
 size="sm"
 className="w-full h-8 text-[11px] text-muted-foreground"
 onClick={() => {
 setItems([]);
 setNote("");
 setDiscountPct(0);
 }}
 >
 پاک کردن اقلام
 </Button>
 )}
 </div>
 </Card>
 </div>
 </div>

 {/* مدیریت فاکتورها — درخواست مالک: لیست کامل با جستجو/فیلتر/ویرایش/حذف/نهایی‌کردن زیر فاکتور سریع */}
 <QuickInvoiceList onEdit={openEdit} refreshSignal={listRefresh} />

 {/* Task 21-B: دیالوگ ویرایش فاکتور — همان فرم اصلی پیش‌پرشده (mobile-friendly تمام‌صفحه در موبایل) */}
 {editOpen && (
 <React.Suspense
 fallback={
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 }
 >
 <InvoiceFormLazy
 open={editOpen}
 onOpenChange={(v) => {
 setEditOpen(v);
 if (!v) setEditInvoice(null);
 }}
 initialInvoice={editInvoice}
 onCreated={() => setListRefresh((n) => n + 1)}
 onUpdated={() => {
 setListRefresh((n) => n + 1);
 // فاکتور ویرایش‌شده — لیست ماژول فاکتورها هم تازه شود
 window.dispatchEvent(new CustomEvent("hoshhesab:invoices-changed"));
 }}
 />
 </React.Suspense>
 )}
 </div>
 );
}
