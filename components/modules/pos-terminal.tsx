"use client";

/**
 * PosTerminal — صندوق فروش (POS) هوش
 *
 * نسخه‌ی صندوق فروشگاهی برای رستوران‌ها، کافه‌ها و هایپرمارکت‌ها:
 *  - گرید کالای لمسی با دسته‌بندی + جستجو + ورودی بارکد (اسکنر)
 *  - سبد خرید با کنترل تعداد (۴۴px+ هدف لمسی)
 *  - مشتری نقدی پیش‌فرض یا انتخاب طرف‌حساب
 *  - دیالوگ پرداخت: نقدی/کارت/آنلاین + مبلغ دریافتی + محاسبه باقی‌مانده
 *  - ثبت فاکتور SALE نهایی (سند حسابداری + خروج انبار خودکار) + چاپ فیش حرارتی ۸۰mm
 *  - سبد معلق: نگه‌داشتن سفارش مشتری و ادامه بعدی
 *  - گزارش شیفت: تعداد و جمع فروش‌های این شیفت (امروز)
 *  - تمام‌صفحه برای سخت‌افزار POS + ریسپانسیو کامل (موبایل: سبد به‌صورت شیت پایین)
 *
 * معماری: همان APIهای اصلی هوش (/api/accounting/invoices) — یعنی هر فروش POS
 * واقعاً در دفاتر، انبار، مالیات و گزارش‌ها ثبت می‌شود (نه شبیه‌سازی).
 */

import * as React from "react";
import {
 MonitorSmartphone,
 Search,
 Barcode,
 Plus,
 Minus,
 Trash2,
 Printer,
 Loader2,
 User,
 ChevronDown,
 RefreshCw,
 X,
 ShoppingCart,
 Banknote,
 CreditCard,
 Globe,
 Pause,
 Play,
 Maximize2,
 Minimize2,
 Receipt,
 ShoppingBasket,
 Keyboard,
 CheckCircle2,
 CircleDollarSign,
 Download,
 // آیکون‌های راهنمای اتصال کارتخوان (Task 25-E)
 Activity,
 AlertCircle,
 ArrowLeft,
 BadgeCheck,
 Cpu,
 FileCode,
 HelpCircle,
 Laptop,
 Layers,
 ListChecks,
 MessageCircle,
 ShieldCheck,
 Timer,
 Wifi,
 Wrench,
 Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, toPersianDigits, toEnglishDigits, persianIncludes } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { openInvoicePrint } from "@/components/ux/print-invoice";
// v13.3 — چاپ لیبل قیمت/بارکد از POS (همان دیالوگ انبار)
import { LabelPrintDialog } from "@/components/ux/label-print-dialog";
// FIX(zero-stock): دیالوگ تأیید «موجودی صفر — باز هم فاکتور ثبت شود؟»
import { useZeroStockConfirm } from "@/components/ux/zero-stock-confirm";
// v32-C: بارکدخوان سراسری + بازخورد صوتی
import { useBarcodeScanner, lookupByBarcode } from "@/hooks/use-barcode-scanner";
import { beepScanOk, beepScanError } from "@/lib/barcode-scanner";
// v32-D: پل کارتخوان — شارژ خودکار مبلغ فیش
import type { PosTerminalConfig } from "@/lib/pos-terminal";

/* ============ انواع ============ */

interface PosProduct {
 id: string;
 name: string;
 sku: string;
 barcode: string | null;
 unit: string;
 salePrice: number; // ریال
 taxRate: number; // کسر
 categoryId: string | null;
 stock: number;
}

interface PosCategory {
 id: string;
 name: string;
}

interface PosParty {
 id: string;
 name: string;
}

interface CartLine {
 key: string;
 productId: string;
 name: string;
 unit: string;
 unitPrice: number; // ریال
 quantity: number;
 taxRate: number;
}

interface HeldOrder {
 id: string;
 at: number;
 customer: string;
 lines: CartLine[];
}

interface ShiftStats {
 date: string; // yyyy-mm-dd
 count: number;
 total: number; // ریال
}

/* ============ ثابت‌ها ============ */

const CASH_CUSTOMER = "فروش نقدی";
const VAT_RATE = 0.1;
const CACHE_TTL = 3 * 60 * 1000;

const PRODUCTS_CACHE_KEY = "hoosh_pos_products";
const CATEGORIES_CACHE_KEY = "hoosh_pos_categories";
const PARTIES_CACHE_KEY = "hoosh_pos_parties";
const HELD_KEY = "hoosh_pos_held";
const SHIFT_KEY = "hoosh_pos_shift";

function todayKey(): string {
 // FIX(v11): تاریخ محلی (ایران +03:30) — قبلاً UTC بود و فروش بعد از نیمه‌شب
 // با تاریخ دیروز ثبت می‌شد و شمارنده شیفت ساعت ۳:۳۰ صبح ریست می‌شد
 const d = new Date();
 const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
 return local.toISOString().slice(0, 10);
}

function readCache<T>(key: string): T | null {
 try {
 const raw = sessionStorage.getItem(key);
 if (!raw) return null;
 const parsed = JSON.parse(raw) as { at: number; data: T };
 if (Date.now() - parsed.at > CACHE_TTL) return null;
 return parsed.data;
 } catch {
 return null;
 }
}

function writeCache<T>(key: string, data: T): void {
 try {
 sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
 } catch {
 /* ignore */
 }
}

/* ============ کامپوننت اصلی ============ */

export function PosTerminal() {
 const { confirmZeroStock, ZeroStockDialog } = useZeroStockConfirm();
 const { toast } = useToast();

 // داده‌ها
 const [products, setProducts] = React.useState<PosProduct[]>([]);
 // v13.3 — چاپ لیبل قیمت/بارکد برای کالاهای فیلترشدهٔ POS
 const [labelPrintOpen, setLabelPrintOpen] = React.useState(false);
 const [categories, setCategories] = React.useState<PosCategory[]>([]);
 const [parties, setParties] = React.useState<PosParty[]>([]);
 const [dataLoading, setDataLoading] = React.useState(true);

 // وضعیت UI
 const [activeCategory, setActiveCategory] = React.useState<string>("ALL");
 const [search, setSearch] = React.useState("");
 const [barcode, setBarcode] = React.useState("");
 const searchRef = React.useRef<HTMLInputElement>(null);
 const barcodeRef = React.useRef<HTMLInputElement>(null);

 // سبد
 const [cart, setCart] = React.useState<CartLine[]>([]);
 const [customer, setCustomer] = React.useState(CASH_CUSTOMER);

 // دیالوگ‌ها
 const [payOpen, setPayOpen] = React.useState(false);
 const [customerOpen, setCustomerOpen] = React.useState(false);
 const [customerSearch, setCustomerSearch] = React.useState("");
 const [heldOpen, setHeldOpen] = React.useState(false);

 // پرداخت
 const [payMethod, setPayMethod] = React.useState<"CASH" | "CARD" | "ONLINE">("CASH");
 const [received, setReceived] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);

 // سبد معلق + شیفت + تمام‌صفحه
 const [heldOrders, setHeldOrders] = React.useState<HeldOrder[]>([]);
 const [shift, setShift] = React.useState<ShiftStats>({ date: todayKey(), count: 0, total: 0 });
 const [isFullscreen, setIsFullscreen] = React.useState(false);

 // مودال موبایل سبد
 const [mobileCartOpen, setMobileCartOpen] = React.useState(false);

 // راهنمای اتصال کارتخوان (Task 25-E) — باز/بسته بودن سکشن راهنما
 const [guideOpen, setGuideOpen] = React.useState(false);

 // v32-D: شارژ خودکار کارتخوان — وضعیت اتصال پل + پیام زنده هنگام دریافت
 const [posBridgeStatus, setPosBridgeStatus] = React.useState<"unknown" | "checking" | "connected" | "offline">("unknown");
 const [cardCharging, setCardCharging] = React.useState(false);
 const [posConfig, setPosConfig] = React.useState<PosTerminalConfig | null>(null);

 /* ============ بارگذاری داده‌ها ============ */

 const loadData = React.useCallback(async (force = false) => {
 setDataLoading(true);
 try {
 let prods = force ? null : readCache<PosProduct[]>(PRODUCTS_CACHE_KEY);
 let cats = force ? null : readCache<PosCategory[]>(CATEGORIES_CACHE_KEY);
 let prts = force ? null : readCache<PosParty[]>(PARTIES_CACHE_KEY);
 // FIX: آرایهٔ خالی معتبر نیست (کش خراب/قدیمی) — مثل نبودِ کش رفتار کن
 if (prods && prods.length === 0) prods = null;
 if (cats && cats.length === 0) cats = null;
 if (prts && prts.length === 0) prts = null;

 const jobs: Promise<void>[] = [];
 if (!prods) {
 // FIX(perf-1200): همهٔ کالاها با صفحه‌بندی خودکار (قبلاً فقط ۵۰۰تای اول)
 jobs.push(
 (async () => {
 try {
 const PAGE = 1000;
 const MAX = 20000;
 const all: PosProduct[] = [];
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
 barcode: p.barcode ? String(p.barcode) : null,
 unit: String(p.unit || "عدد"),
 salePrice: Number(p.salePrice) || 0,
 taxRate: Number(p.taxRate ?? VAT_RATE) || 0,
 categoryId: p.categoryId ? String(p.categoryId) : null,
 stock: Number(p.stock ?? 0),
 });
 }
 fetched += (j.data as unknown[]).length;
 } while (fetched > 0 && fetched < total && fetched < MAX);
 if (all.length > 0) {
 writeCache(PRODUCTS_CACHE_KEY, all);
 prods = all;
 }
 } catch {
 /* offline — کش موجود نمایش داده می‌شود */
 }
 })()
 );
 }
 if (!cats) {
 jobs.push(
 authFetch("/api/products/categories", { cache: "no-store" })
 .then((r) => r.json())
 .then((j) => {
 if (j?.success && Array.isArray(j.data)) {
 cats = j.data.map((c: Record<string, unknown>) => ({
 id: String(c.id),
 name: String(c.name || ""),
 }));
 writeCache(CATEGORIES_CACHE_KEY, cats);
 }
 })
 .catch(() => {})
 );
 }
 if (!prts) {
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
 }
 })
 .catch(() => {})
 );
 }
 await Promise.all(jobs);
 setProducts(prods || []);
 setCategories(cats || []);
 setParties(prts || []);
 } finally {
 setDataLoading(false);
 }
 }, []);

 // FIX: بارگذاری داده‌ها هنگام mount — قبلاً فراموش شده بود و POS همیشه
 // در حالت skeleton گیر می‌کرد!
 React.useEffect(() => {
 void loadData();
 }, [loadData]);

 // بازیابی سبد معلق و شیفت از localStorage
 React.useEffect(() => {
 try {
 const held = localStorage.getItem(HELD_KEY);
 if (held) setHeldOrders(JSON.parse(held) as HeldOrder[]);
 const sh = localStorage.getItem(SHIFT_KEY);
 if (sh) {
 const parsed = JSON.parse(sh) as ShiftStats;
 // شیفت جدید در روز جدید
 setShift(parsed.date === todayKey() ? parsed : { date: todayKey(), count: 0, total: 0 });
 }
 } catch {
 /* ignore */
 }
 }, []);

 const persistShift = React.useCallback((s: ShiftStats) => {
 setShift(s);
 try {
 localStorage.setItem(SHIFT_KEY, JSON.stringify(s));
 } catch {
 /* ignore */
 }
 }, []);

 /* ============ محاسبات سبد ============ */

 const totals = React.useMemo(() => {
 let subtotal = 0;
 let tax = 0;
 for (const l of cart) {
 const lineNet = l.unitPrice * l.quantity;
 subtotal += lineNet;
 tax += lineNet * l.taxRate;
 }
 return { subtotal, tax, total: subtotal + tax, count: cart.reduce((s, l) => s + l.quantity, 0) };
 }, [cart]);

 const receivedNum = React.useMemo(() => {
 const n = Number(toEnglishDigits(received).replace(/[^\d.]/g, ""));
 return Number.isFinite(n) && n > 0 ? n : 0;
 }, [received]);

 const changeDue = Math.max(0, receivedNum - totals.total);

 /* ============ عملیات سبد ============ */

 const addProduct = React.useCallback(
 (p: PosProduct) => {
 // FIX(v12): کالای بدون قیمت فروش نمی‌تواند به سبد برود — فیش صفر معنا ندارد
 if (!p.salePrice || p.salePrice <= 0) {
 toast({
 title: `«${p.name}» قیمت فروش ندارد`,
 description: "ابتدا قیمت فروش را در ماژول «انبار و کالا» تعیین کنید.",
 variant: "destructive",
 });
 return;
 }
 setCart((prev) => {
 const idx = prev.findIndex((l) => l.productId === p.id);
 if (idx >= 0) {
 const next = [...prev];
 next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
 return next;
 }
 return [
 ...prev,
 {
 key: `${p.id}-${Date.now()}`,
 productId: p.id,
 name: p.name,
 unit: p.unit,
 unitPrice: p.salePrice,
 quantity: 1,
 taxRate: p.taxRate,
 },
 ];
 });
 },
 []
 );

 const changeQty = React.useCallback((key: string, delta: number) => {
 setCart((prev) =>
 prev
 .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
 .filter((l) => l.quantity > 0)
 );
 }, []);

 const removeLine = React.useCallback((key: string) => {
 setCart((prev) => prev.filter((l) => l.key !== key));
 }, []);

 const clearCart = React.useCallback(() => {
 setCart([]);
 setCustomer(CASH_CUSTOMER);
 setReceived("");
 }, []);

 /* ============ بارکد (v32-C: اسکن سراسری + fallback از API + بازخورد صوتی) ============ */

 const resolveByCode = React.useCallback(
 async (rawCode: string): Promise<PosProduct | null> => {
 const code = toEnglishDigits(rawCode.trim());
 if (!code) return null;
 // ۱) تطبیق محلی — فوری (کش ۲۰هزارتایی)
 const local = products.find(
 (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase()
 );
 if (local) return local;
 // ۲) fallback از API — کالای خارج از کش + ادغام در کش محلی برای اسکن بعدی
 const remote = await lookupByBarcode(code);
 if (remote) {
 const asPos: PosProduct = {
 id: remote.id,
 name: remote.name,
 sku: remote.sku,
 barcode: remote.barcode,
 unit: remote.unit,
 salePrice: remote.salePrice,
 taxRate: remote.taxRate,
 categoryId: remote.categoryId,
 stock: remote.stock,
 };
 setProducts((prev) =>
 prev.some((p) => p.id === remote.id) ? prev : [...prev, asPos]
 );
 return asPos;
 }
 return null;
 },
 [products]
 );

 const processScannedCode = React.useCallback(
 async (rawCode: string, fromGlobalScanner: boolean) => {
 const code = toEnglishDigits(rawCode.trim());
 if (!code) return;
 const found = await resolveByCode(code);
 if (found) {
 addProduct(found);
 beepScanOk();
 toast({
 title: `افزوده شد: ${found.name}`,
 description: `${formatNumber(found.salePrice)} ریال × ۱ — موجودی: ${toPersianDigits(String(found.stock))} ${found.unit}`,
 });
 // حالت اسکن سریع: آمادهٔ اسکن بعدی — فوکوس در فیلد بارکد بماند
 setBarcode("");
 if (fromGlobalScanner) {
 requestAnimationFrame(() => barcodeRef.current?.focus());
 } else {
 requestAnimationFrame(() => barcodeRef.current?.focus());
 }
 } else {
 beepScanError();
 toast({
 title: "کالا یافت نشد",
 description: `بارکد/SKU «${code}» در بانک کالا نیست — آن را در «انبار و کالا» با همین بارکد ثبت کنید.`,
 variant: "destructive",
 });
 setBarcode("");
 }
 },
 [resolveByCode, addProduct, toast]
 );

 const handleBarcode = React.useCallback(() => {
 const code = toEnglishDigits(barcode.trim());
 if (!code) return;
 void processScannedCode(code, false);
 }, [barcode, processScannedCode]);

 // v32-C: اسکنر سخت‌افزاری «هرجای ماژول POS» کار می‌کند — لازم نیست فوکوس در فیلد بارکد باشد.
 // اگر دیالوگ پرداخت/مشتری/سبد معلق باز است، هندلر غیرفعال تا کد به اشتباه مصرف نشود.
 useBarcodeScanner(
 (code) => {
 if (payOpen || customerOpen || heldOpen || mobileCartOpen || submitting) return false;
 void processScannedCode(code, true);
 return true;
 },
 { enabled: !dataLoading }
 );

 /* ============ سبد معلق ============ */

 const persistHeld = React.useCallback((list: HeldOrder[]) => {
 setHeldOrders(list);
 try {
 localStorage.setItem(HELD_KEY, JSON.stringify(list.slice(0, 10)));
 } catch {
 /* ignore */
 }
 }, []);

 const holdCart = React.useCallback(() => {
 if (cart.length === 0) return;
 const order: HeldOrder = {
 id: `H-${Date.now()}`,
 at: Date.now(),
 customer,
 lines: cart,
 };
 persistHeld([order, ...heldOrders]);
 clearCart();
 toast({
 title: "سفارش نگه داشته شد",
 description: "سبد خالی شد — از دکمه «سبدهای معلق» ادامه دهید.",
 });
 }, [cart, customer, heldOrders, persistHeld, clearCart, toast]);

 const resumeHeld = React.useCallback(
 (id: string) => {
 const order = heldOrders.find((h) => h.id === id);
 if (!order) return;
 if (cart.length > 0) {
 toast({
 title: "سبد فعلی پر است",
 description: "اول سبد فعلی را تسویه یا نگه دارید.",
 variant: "destructive",
 });
 return;
 }
 setCart(order.lines);
 setCustomer(order.customer);
 persistHeld(heldOrders.filter((h) => h.id !== id));
 setHeldOpen(false);
 },
 [cart, heldOrders, persistHeld, toast]
 );

 /* ============ تمام‌صفحه ============ */

 const toggleFullscreen = React.useCallback(() => {
 try {
 if (!document.fullscreenElement) {
 void document.documentElement.requestFullscreen();
 setIsFullscreen(true);
 } else {
 void document.exitFullscreen();
 setIsFullscreen(false);
 }
 } catch {
 /* ignore */
 }
 }, []);

 /* ============ v32-D: تشخیص خودکار پل کارتخوان ============ */
 // هنگام باز شدن POS، تنظیمات کارتخوان خوانده می‌شود؛ اگر فعال باشد، سلامت پل چک می‌شود
 // و چیپ «کارتخوان متصل ✓ / کارتخوان متصل نیست» بالای صندوق نمایش داده می‌شود.
 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const res = await authFetch("/api/pos/config", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 const cfg = json?.data as PosTerminalConfig | undefined;
 if (cancelled) return;
 setPosConfig(cfg && cfg.enabled ? cfg : null);
 if (cfg && cfg.enabled) {
 setPosBridgeStatus("checking");
 const { posHealth } = await import("@/lib/pos-terminal");
 const health = await posHealth(cfg.bridgeUrl);
 if (!cancelled) setPosBridgeStatus(health.ok ? "connected" : "offline");
 }
 } catch {
 /* بی‌صدا — کارتخوان اختیاری است */
 }
 })();
 return () => {
 cancelled = true;
 };
 }, []);

 const performSubmitSale = React.useCallback(async (allowNegStock = false) => {
 if (cart.length === 0) return;
 if (totals.total <= 0) return;

 setSubmitting(true);
 try {
 const methodFa = payMethod === "CASH" ? "نقدی" : payMethod === "CARD" ? "کارت‌خوان" : "آنلاین";
 const res = await authFetch("/api/accounting/invoices", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 type: "SALE",
 status: "SENT",
 // FIX(zero-stock): پس از تأیید کاربر در دیالوگ «موجودی صفر»، سرور اجازهٔ ثبت می‌دهد
 allowNegativeStock: allowNegStock === true,
 partyName: customer.trim() || CASH_CUSTOMER,
 description: `فروش صندوق (POS) — پرداخت ${methodFa}`,
 currency: "IRR",
 items: cart.map((l) => ({
 productId: l.productId,
 description: l.name,
 quantity: l.quantity,
 unitPrice: l.unitPrice,
 taxRate: l.taxRate,
 })),
 }),
 });
 const data = await res.json();
 if (!res.ok || !data.success) {
 throw new Error(data.error || "خطا در ثبت فروش");
 }

 const inv = data.data;

 // v32-D: پرداخت کارتی — اگر پل کارتخوان فعال و متصل باشد، مبلغ «خودکار» به
 // کارتخوان فرستاده می‌شود؛ مشتری فقط کارت را می‌کشد و رمز می‌زند. نتیجه
 // (شماره مرجع) در پیام موفقیت نمایش داده می‌شود. اگر پل ناموفق بود، فیش PAID نمی‌شود.
 let cardRef: string | null = null;
 let cardChargeFailed = false;
 if (payMethod === "CARD" && posConfig) {
 setCardCharging(true);
 try {
 const { posCharge } = await import("@/lib/pos-terminal");
 const charge = await posCharge(posConfig, Number(inv.total) || 0, String(inv.number));
 if (charge.ok) {
 cardRef = charge.reference ?? null;
 } else {
 cardChargeFailed = true;
 toast({
 title: "دریافت با کارتخوان ناموفق",
 description: `${charge.message ?? "پاسخی از کارتخوان نیامد"} — فیش صادر شد؛ پس از دریافت، از ماژول فاکتورها تسویه کنید.`,
 variant: "destructive",
 });
 }
 } catch {
 cardChargeFailed = true;
 } finally {
 setCardCharging(false);
 }
 }

 // FIX(حسابداری POS): فروش نقدی/کارتخوان باید «تسویه‌شده» ثبت شود —
 // قبلاً status=SENT و paidAmount=0 می‌ماند → فروش نقدی جزو مطالبات می‌رفت.
 // PATCH markPaid هم paidAmount/status را درست می‌کند و هم سند دریافت
 // (صندوق بدهکار / دریافتنی بستانکار) را در دفاتر ثبت می‌کند.
 // FIX(v11): پرداخت آنلاین PAID نمی‌شود تا وقتی پول واقعاً دریافت نشده —
 // لینک پرداخت بعداً ارسال می‌شود و verify درگاه خودش تسویه می‌کند.
 // v32-D: در پرداخت کارتی، اگر شارژ پل «ناموفق» بود فیش PAID نمی‌شود (پول نیامده).
 if (payMethod !== "ONLINE" && !cardChargeFailed) {
  try {
  const payRes = await authFetch("/api/accounting/invoices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [inv.id], action: "markPaid" }),
  });
  const payData = await payRes.json().catch(() => null);
  if (payRes.ok && payData?.success) {
    // شیفت با وضعیت نهایی به‌روز شود
    inv.status = "PAID";
    inv.paidAmount = inv.total;
  } else if (payRes.status === 429) {
    // FIX(v11): rate-limit سخت‌گیرانه bulk — به صندو‌دار هشدار بده که تسویه ثبت نشد
    toast({
      title: "تسویه فاکتور به تعویق افتاد",
      description: "سقف درخواست‌های سریع پر شد — از ماژول فاکتورها فاکتور را تسویه کنید.",
      variant: "destructive",
    });
  }
 } catch {
  /* غیرِمهلک — فاکتور ساخته شده؛ تسویه بعداً هم قابل ثبت است */
 }
 }

 // آمار شیفت
 persistShift({
 date: todayKey(),
 count: shift.count + 1,
 total: shift.total + (Number(inv.total) || 0),
 });

 toast({
 title: `فیش ${toPersianDigits(String(inv.number))} صادر شد`,
 description: `مبلغ: ${formatNumber(Number(inv.total) || 0)} ریال — پرداخت ${methodFa}${cardRef ? ` — مرجع کارتخوان: ${toPersianDigits(cardRef)}` : ""}`,
 });

 // FIX(v11): رویداد سراسری — لیست فاکتورها/داشبورد هم‌زمان به‌روز شوند
 if (typeof window !== "undefined") {
 window.dispatchEvent(new CustomEvent("hoshhesab:invoices-changed"));
 }

 // چاپ فیش حرارتی
 if (typeof window !== "undefined") {
 void openInvoicePrint(inv.id, {
 mode: "thermal",
 autoprint: true,
 toast,
 });
 }

 clearCart();
 setPayOpen(false);
 // شارژ مجدد موجودی‌ها (کش ۳ دقیقه‌ای را بی‌اعتبار کن)
 try {
 sessionStorage.removeItem(PRODUCTS_CACHE_KEY);
 } catch {
 /* ignore */
 }
 void loadData(true);
 } catch (err) {
 toast({
 title: "خطا در ثبت فروش",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 }, [cart, customer, payMethod, receivedNum, totals.total, shift, persistShift, clearCart, loadData, toast]);

 const submitSale = React.useCallback(async () => {
 if (cart.length === 0) {
 toast({ title: "سبد خالی است", variant: "destructive" });
 return;
 }
 if (payMethod === "CASH" && receivedNum > 0 && receivedNum < totals.total) {
 toast({
 title: "مبلغ دریافتی کمتر از جمع فاکتور است",
 variant: "destructive",
 });
 return;
 }
 // FIX(v12): جلوگیری از صدور فیش صفر — کالای بی‌قیمت یا سبد اشتباه نباید
 // فاکتور ۰ ریالی بسازد (فاکتورهای صفر در دفاتر و گزارش‌ها نویز می‌سازند)
 if (totals.total <= 0) {
 toast({
 title: "جمع فاکتور صفر است",
 description: "قیمت کالاها را در ماژول «انبار و کالا» تنظیم کنید یا کالای معتبر به سبد اضافه کنید.",
 variant: "destructive",
 });
 return;
 }

 // FIX(zero-stock): کالای موجودی‌صفر — «موجودی صفر است، باز هم مایلید فاکتور ثبت شود؟»
 const stockById = new Map(products.map((p) => [p.id, p.stock]));
 const zeroItems = cart
 .filter((l) => (stockById.get(l.productId) ?? 0) <= 0)
 .map((l) => ({ name: l.name, stock: stockById.get(l.productId) ?? 0 }));
 if (zeroItems.length > 0) {
 confirmZeroStock(zeroItems, () => void performSubmitSale(true));
 return;
 }
 void performSubmitSale(false);
 },
 [cart, payMethod, receivedNum, totals.total, products, confirmZeroStock, performSubmitSale]
 );

 /* ============ فیلتر محصولات ============ */

 const filteredProducts = React.useMemo(() => {
 // FIX(search): نرمال‌سازی فارسی — «كیف» عربی داده‌ها با «کیف» فارسی کاربر مچ می‌شود
 const q = search.trim();
 return products.filter((p) => {
 if (activeCategory !== "ALL" && p.categoryId !== activeCategory) return false;
 if (!q) return true;
 return (
 persianIncludes(p.name, q) ||
 persianIncludes(p.sku, q) ||
 persianIncludes(p.barcode, q)
 );
 });
 }, [products, activeCategory, search]);

 // FIX(perf-1200): رندر همهٔ ۱۲۰۰+ کاشی یکجا مرورگر را لگ می‌انداخت.
 // فقط ۶۰ کاشی اول رندر می‌شود + دکمهٔ «نمایش بیشتر» (جستجو/فیلتر تعداد را کم می‌کند).
 const POS_PAGE = 60;
 const [posVisible, setPosVisible] = React.useState(POS_PAGE);
 const visibleProducts = React.useMemo(
 () => filteredProducts.slice(0, posVisible),
 [filteredProducts, posVisible]
 );
 // تغییر فیلتر/جستجو → ریست شمارندهٔ نمایش
 React.useEffect(() => {
 setPosVisible(POS_PAGE);
 }, [activeCategory, search]);

 const categoryName = React.useCallback(
 (id: string | null) => categories.find((c) => c.id === id)?.name ?? "بدون دسته",
 [categories]
 );

 const filteredParties = React.useMemo(() => {
 // FIX(search): نرمال‌سازی فارسی برای نام مشتری‌ها
 const q = customerSearch.trim();
 if (!q) return parties.slice(0, 10);
 return parties.filter((p) => persianIncludes(p.name, q)).slice(0, 12);
 }, [parties, customerSearch]);

 /* ============ شورتکات‌های کیبورد ============ */

 React.useEffect(() => {
 const handler = (e: KeyboardEvent) => {
 // F2 → دیالوگ پرداخت
 if (e.key === "F2") {
 e.preventDefault();
 if (cart.length > 0) setPayOpen(true);
 }
 // F3 → فوکوس جستجو
 if (e.key === "F3") {
 e.preventDefault();
 searchRef.current?.focus();
 }
 };
 window.addEventListener("keydown", handler);
 return () => window.removeEventListener("keydown", handler);
 }, [cart.length]);

 /* ============ رندر ============ */

 const categoriesWithCount = React.useMemo(() => {
 const counts = new Map<string, number>();
 for (const p of products) {
 if (p.categoryId) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
 }
 return categories.filter((c) => (counts.get(c.id) ?? 0) > 0);
 }, [products, categories]);

 const productGrid = (
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-3">
 {dataLoading ? (
 Array.from({ length: 12 }).map((_, i) => (
 <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
 ))
 ) : filteredProducts.length === 0 ? (
 <div className="col-span-full text-center py-16 text-muted-foreground">
 <ShoppingBasket className="h-10 w-10 mx-auto mb-3 opacity-40" />
 <p className="font-medium">کالایی یافت نشد</p>
 <p className="text-xs mt-1">عبارت جستجو را تغییر دهید یا از ماژول «انبار و کالا» کالا اضافه کنید.</p>
 </div>
 ) : (
 visibleProducts.map((p) => (
 <button
 key={p.id}
 onClick={() => addProduct(p)}
 className="group relative flex flex-col justify-between h-24 sm:h-28 rounded-xl border-2 border-border bg-card p-2.5 text-start transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-md hover:-translate-y-0.5 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
 aria-label={`افزودن ${p.name} به سبد`}
 >
 <span className="text-[13px] font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
 {p.name}
 </span>
 <span className="flex items-end justify-between gap-1 mt-1">
 <span className="text-[11px] text-muted-foreground">
 {p.stock > 0 ? `موجودی: ${toPersianDigits(String(Math.floor(p.stock)))}` : "ناموجود"}
 </span>
 <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">
 {formatCompactRialForPos(p.salePrice)}
 </span>
 </span>
 <span className="absolute top-1.5 end-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity">
 <Plus className="h-3 w-3" />
 </span>
 </button>
 ))
 )}

 {/* FIX(perf-1200): دکمهٔ نمایش بیشتر — به‌جای رندر یکجای همهٔ کالاها */}
 {visibleProducts.length < filteredProducts.length && (
 <div className="col-span-full flex flex-col items-center gap-1.5 py-3">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => setPosVisible((n) => n + POS_PAGE)}
 >
 <ChevronDown className="h-4 w-4" />
 نمایش {Math.min(POS_PAGE, filteredProducts.length - visibleProducts.length)} کالای بعدی
 </Button>
 <p className="text-[10px] text-muted-foreground tnum">
 نمایش {toPersianDigits(String(visibleProducts.length))} از {toPersianDigits(String(filteredProducts.length))} کالا — برای یافتن سریع‌تر، جستجو کنید
 </p>
 </div>
 )}
 </div>
 );

 const cartPanel = (
 <div className="flex flex-col h-full">
 {/* مشتری */}
 <button
 onClick={() => setCustomerOpen(true)}
 className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-start hover:bg-muted/70 transition-colors min-h-[44px]"
 aria-label="تغییر مشتری"
 >
 <span className="flex items-center gap-2 min-w-0">
 <User className="h-4 w-4 shrink-0 text-muted-foreground" />
 <span className="text-[13px] font-medium truncate">{customer}</span>
 </span>
 <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
 </button>

 {/* اقلام سبد */}
 <div className="flex-1 overflow-y-auto mt-2.5 space-y-1.5 min-h-0 max-h-[46vh] lg:max-h-none">
 {cart.length === 0 ? (
 <div className="text-center py-10 text-muted-foreground">
 <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40" />
 <p className="text-xs">سبد خالی است — کالا را لمس کنید یا بارکد بزنید</p>
 </div>
 ) : (
 cart.map((l) => (
 <div
 key={l.key}
 className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2 py-1.5"
 >
 <div className="flex-1 min-w-0">
 <p className="text-[12px] font-bold truncate">{l.name}</p>
 <p className="text-[10px] text-muted-foreground">
 {formatNumber(l.unitPrice)} ریال / {l.unit}
 </p>
 </div>
 <div className="flex items-center gap-1">
 <button
 onClick={() => changeQty(l.key, 1)}
 className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:scale-90 transition-all"
 aria-label="افزایش"
 >
 <Plus className="h-4 w-4" />
 </button>
 <span className="w-8 text-center text-[13px] font-bold">
 {toPersianDigits(String(l.quantity))}
 </span>
 <button
 onClick={() => changeQty(l.key, -1)}
 className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-muted/70 active:scale-90 transition-all"
 aria-label="کاهش"
 >
 <Minus className="h-4 w-4" />
 </button>
 <button
 onClick={() => removeLine(l.key)}
 className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500/10 active:scale-90 transition-all"
 aria-label="حذف"
 >
 <Trash2 className="h-4 w-4" />
 </button>
 </div>
 </div>
 ))
 )}
 </div>

 {/* جمع‌بندی */}
 <div className="mt-2.5 space-y-1.5 rounded-xl border border-border bg-muted/40 p-3 text-[12px]">
 <div className="flex justify-between text-muted-foreground">
 <span>جمع اقلام ({toPersianDigits(String(totals.count))})</span>
 <span>{formatNumber(totals.subtotal)} ریال</span>
 </div>
 <div className="flex justify-between text-muted-foreground">
 <span>مالیات بر ارزش افزوده</span>
 <span>{formatNumber(totals.tax)} ریال</span>
 </div>
 <Separator className="my-1" />
 <div className="flex justify-between items-center">
 <span className="font-bold text-[13px]">قابل پرداخت</span>
 <span className="font-black text-[15px] text-teal-600 dark:text-teal-400">
 {formatNumber(totals.total)} ریال
 </span>
 </div>
 </div>

 {/* اکشن‌ها */}
 <div className="mt-2.5 grid grid-cols-3 gap-1.5">
 <Button
 variant="outline"
 size="sm"
 className="h-10 text-[11px]"
 onClick={holdCart}
 disabled={cart.length === 0}
 aria-label="نگه داشتن سفارش"
 >
 <Pause className="h-4 w-4" />
 معلق
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-10 text-[11px] text-rose-600 hover:text-rose-700 border-rose-500/30"
 onClick={clearCart}
 disabled={cart.length === 0}
 aria-label="خالی کردن سبد"
 >
 <Trash2 className="h-4 w-4" />
 لغو
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-10 text-[11px] relative"
 onClick={() => setHeldOpen(true)}
 aria-label="سبدهای معلق"
 >
 <Play className="h-4 w-4" />
 ادامه
 {heldOrders.length > 0 && (
 <Badge className="absolute -top-1.5 -end-1.5 h-4 min-w-4 px-1 text-[9px] p-0">
 {toPersianDigits(String(heldOrders.length))}
 </Badge>
 )}
 </Button>
 </div>
 <Button
 className="mt-1.5 w-full h-14 text-[15px] font-black rounded-xl"
 onClick={() => setPayOpen(true)}
 disabled={cart.length === 0}
 aria-label="پرداخت و صدور فیش"
 >
 <Receipt className="h-5 w-5" />
 پرداخت و صدور فیش
 <kbd className="hidden sm:inline-block ms-2 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[9px]">F2</kbd>
 </Button>
 </div>
 );

 return (
 <div className="space-y-4 pb-24 lg:pb-0">
 {/* FIX(zero-stock): دیالوگ تأیید موجودی صفر + تیک «دیگر نپرس» */}
 {ZeroStockDialog}
 {/* هدر */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2.5">
 <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
 <MonitorSmartphone className="h-4.5 w-4.5 text-primary" />
 </div>
 <div>
 <h2 className="text-base font-bold text-foreground">صندوق فروش (POS)</h2>
 <p className="text-[11px] text-muted-foreground">
 فروش سریع رستوران و هایپرمارکت — فیش و فاکتور با یک لمس
 </p>
 </div>
 </div>
 <div className="flex items-center gap-1.5">
 {/* آمار شیفت */}
 <div className="hidden sm:flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-1.5">
 <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
 <CircleDollarSign className="h-3.5 w-3.5" />
 شیفت امروز: {toPersianDigits(String(shift.count))} فروش
 </span>
 <Separator orientation="vertical" className="h-4" />
 <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">
 {formatNumber(shift.total)} ریال
 </span>
 <button
 className="text-muted-foreground hover:text-foreground transition-colors"
 onClick={() => persistShift({ date: todayKey(), count: 0, total: 0 })}
 aria-label="بستن شیفت"
 title="بستن شیفت (صفر کردن آمار روز)"
 >
 <RefreshCw className="h-3.5 w-3.5" />
 </button>
 </div>
 <Button
 variant="outline"
 size="icon"
 className="h-9 w-9"
 onClick={toggleFullscreen}
 aria-label={isFullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
 title={isFullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه (برای سخت‌افزار POS)"}
 >
 {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
 </Button>
 </div>
 </div>

 {/* راهنمای اتصال کارتخوان (پل هوش) — Task 25-E */}
 <div id="card-reader-guide" className="space-y-3">
 <button
 type="button"
 onClick={() => setGuideOpen((v) => !v)}
 aria-expanded={guideOpen}
 aria-controls="card-reader-guide-body"
 className="flex w-full items-center gap-3 rounded-2xl border border-teal-500/30 bg-gradient-to-l from-teal-500/10 via-teal-500/5 to-transparent p-3 text-start transition-all hover:border-teal-500/50 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-4"
 >
 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
 <CreditCard className="h-5 w-5" aria-hidden="true" />
 </span>
 <span className="min-w-0 flex-1">
 <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
 <span className="text-[13px] font-bold text-foreground sm:text-sm">راهنمای اتصال کارتخوان</span>
 <Badge className="border-0 bg-teal-500/15 text-[10px] text-teal-700 hover:bg-teal-500/25 dark:text-teal-300">
 مثل هلو، ساده — ۵ دقیقه
 </Badge>
 </span>
 <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
 فاکتور نقدی ثبت کنید؛ مبلغ خودکار روی کارتخوان می‌نشیند و تسویه + سند حسابداری خودکار ثبت می‌شود
 </span>
 </span>
 <ChevronDown
 className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${guideOpen ? "rotate-180" : ""}`}
 aria-hidden="true"
 />
 </button>
 {guideOpen && <CardReaderGuide onClose={() => setGuideOpen(false)} />}
 </div>

 {/* نوار جستجو + بارکد + دسته‌بندی */}
 <div className="space-y-2.5">
 <div className="flex gap-2">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 ref={searchRef}
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی کالا (نام / SKU / بارکد)… F3"
 className="h-11 ps-9 text-[13px] rounded-xl"
 aria-label="جستجوی کالا"
 />
 {search && (
 <button
 onClick={() => setSearch("")}
 className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
 aria-label="پاک کردن جستجو"
 >
 <X className="h-4 w-4" />
 </button>
 )}
 </div>
 <div className="relative w-40 sm:w-52 shrink-0">
 <Barcode className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 ref={barcodeRef}
 value={barcode}
 onChange={(e) => setBarcode(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 e.preventDefault();
 handleBarcode();
 }
 }}
 data-barcode-input="1"
 placeholder="بارکد + Enter — اسکن سریع"
 className="h-11 ps-9 font-mono text-[13px] rounded-xl"
 aria-label="ورودی بارکد اسکنر"
 />
 </div>
 {/* v32-D: چیپ وضعیت اتصال کارتخوان — کنار ورودی بارکد */}
 {posConfig && (
 <span
 title={posBridgeStatus === "connected" ? "پل کارتخوان در دسترس است — مبلغ فیش‌ها خودکار فرستاده می‌شود" : posBridgeStatus === "checking" ? "در حال بررسی اتصال پل کارتخوان…" : "پل کارتخوان در دسترس نیست — فایل پل را اجرا کنید یا از راهنمای پایین صندوق کمک بگیرید"}
 className={`hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 h-9 text-[11px] font-medium transition-colors ${
 posBridgeStatus === "connected"
 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
 : posBridgeStatus === "checking"
 ? "border-border bg-muted/50 text-muted-foreground"
 : "border-amber-500/40 bg-amber-500/10 text-amber-600"
 }`}
 >
 {posBridgeStatus === "checking" ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <span className={`h-1.5 w-1.5 rounded-full ${posBridgeStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} />
 )}
 {posBridgeStatus === "connected" ? "کارتخوان متصل" : posBridgeStatus === "checking" ? "بررسی کارتخوان…" : "کارتخوان متصل نیست"}
 </span>
 )}
 </div>

 {/* چیپ‌های دسته‌بندی */}
 <div className="flex gap-1.5 overflow-x-auto pb-1 pos-categories" role="tablist" aria-label="دسته‌بندی کالاها">
 {/* v13.3 — چاپ لیبل قیمت/بارکد کالاهای فیلترشده (اولین دکمه، برای دسترسی سریع صندوقدار) */}
 <button
 type="button"
 onClick={() => setLabelPrintOpen(true)}
 disabled={filteredProducts.length === 0}
 title={`چاپ لیبل قیمت برای ${toPersianDigits(String(filteredProducts.length))} کالای فیلترشده`}
 className="shrink-0 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-all px-3.5 h-9 text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-40"
 >
 <Tag className="h-3.5 w-3.5" />
 چاپ لیبل
 </button>
 <button
 role="tab"
 aria-selected={activeCategory === "ALL"}
 onClick={() => setActiveCategory("ALL")}
 className={`shrink-0 rounded-full border px-3.5 h-9 text-[12px] font-medium transition-all ${
 activeCategory === "ALL"
 ? "border-primary bg-primary text-primary-foreground shadow"
 : "border-border bg-card text-foreground hover:bg-muted"
 }`}
 >
 همه ({toPersianDigits(String(products.length))})
 </button>
 {categoriesWithCount.map((c) => (
 <button
 key={c.id}
 role="tab"
 aria-selected={activeCategory === c.id}
 onClick={() => setActiveCategory(c.id)}
 className={`shrink-0 rounded-full border px-3.5 h-9 text-[12px] font-medium transition-all ${
 activeCategory === c.id
 ? "border-primary bg-primary text-primary-foreground shadow"
 : "border-border bg-card text-foreground hover:bg-muted"
 }`}
 >
 {c.name}
 </button>
 ))}
 </div>
 </div>

 {/* گرید محصولات + سبد (دسکتاپ) */}
 <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_360px] gap-4 items-start">
 <div className="min-h-[300px]">{productGrid}</div>
 <Card className="hidden lg:flex sticky top-20 max-h-[calc(100vh-6rem)] flex-col p-3.5 !rounded-2xl">
 {cartPanel}
 </Card>
 </div>

 {/* نوار سبد موبایل */}
 <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
 <Button
 className="w-full h-14 rounded-xl text-[14px] font-black justify-between"
 onClick={() => setMobileCartOpen(true)}
 disabled={cart.length === 0}
 aria-label="مشاهده سبد خرید"
 >
 <span className="flex items-center gap-2">
 <ShoppingCart className="h-5 w-5" />
 سبد ({toPersianDigits(String(totals.count))} قلم)
 </span>
 <span>{formatNumber(totals.total)} ریال</span>
 </Button>
 </div>

 {/* دیالوگ سبد موبایل */}
 <Dialog open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
 <DialogContent className="max-w-lg w-[95vw] max-h-[90dvh] overflow-hidden flex flex-col" dir="rtl">
 <DialogHeader className="text-start">
 <DialogTitle className="flex items-center gap-2">
 <ShoppingCart className="h-4.5 w-4.5 text-primary" />
 سبد خرید
 </DialogTitle>
 </DialogHeader>
 <div className="flex-1 overflow-y-auto -mx-1 px-1">{cartPanel}</div>
 </DialogContent>
 </Dialog>

 {/* دیالوگ پرداخت */}
 <Dialog open={payOpen} onOpenChange={(o) => {
 setPayOpen(o);
 if (!o) setReceived("");
 }}>
 <DialogContent className="max-w-md w-[95vw]" dir="rtl">
 <DialogHeader className="text-start">
 <DialogTitle className="flex items-center gap-2">
 <Banknote className="h-5 w-5 text-teal-600" />
 دریافت پرداخت
 </DialogTitle>
 <DialogDescription>
 جمع قابل پرداخت: {formatNumber(totals.total)} ریال
 ({formatNumber(Math.round(totals.total / 10))} تومان)
 </DialogDescription>
 </DialogHeader>

 {/* روش پرداخت */}
 <div className="grid grid-cols-3 gap-2">
 {(
 [
 { key: "CASH", label: "نقدی", icon: Banknote },
 { key: "CARD", label: "کارت‌خوان", icon: CreditCard },
 { key: "ONLINE", label: "آنلاین", icon: Globe },
 ] as const
 ).map((m) => (
 <button
 key={m.key}
 onClick={() => setPayMethod(m.key)}
 className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all min-h-[64px] justify-center ${
 payMethod === m.key
 ? "border-primary bg-primary/10 text-primary shadow-sm"
 : "border-border hover:bg-muted"
 }`}
 aria-pressed={payMethod === m.key}
 >
 <m.icon className="h-5 w-5" />
 <span className="text-[12px] font-bold">{m.label}</span>
 </button>
 ))}
 </div>

 {/* مبلغ دریافتی (نقدی) */}
 {payMethod === "CASH" && (
 <div className="space-y-2.5">
 <div>
 <label htmlFor="pos-received" className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
 مبلغ دریافتی از مشتری (ریال)
 </label>
 <Input
 id="pos-received"
 value={received}
 onChange={(e) => setReceived(e.target.value)}
 inputMode="numeric"
 placeholder={String(totals.total)}
 className="h-12 text-[15px] font-bold rounded-xl"
 dir="ltr"
 />
 </div>
 {/* دکمه‌های سریع */}
 <div className="grid grid-cols-4 gap-1.5">
 <button
 onClick={() => setReceived(String(totals.total))}
 className="h-9 rounded-lg border border-border text-[11px] font-bold hover:bg-muted transition-colors"
 >
 دقیق
 </button>
 {[100, 200, 500, 1000].map((t) => (
 <button
 key={t}
 onClick={() => setReceived(String(t * 10000))}
 className="h-9 rounded-lg border border-border text-[11px] font-bold hover:bg-muted transition-colors"
 >
 {toPersianDigits(String(t))}ه‌ت
 </button>
 ))}
 </div>
 {/* باقی‌مانده */}
 <div
 className={`rounded-xl p-3 flex items-center justify-between ${
 changeDue > 0
 ? "bg-amber-500/10 border border-amber-500/30"
 : "bg-teal-500/10 border border-teal-500/30"
 }`}
 >
 <span className="text-[12px] font-medium flex items-center gap-1.5">
 {changeDue > 0 ? (
 <>
 <CircleDollarSign className="h-4 w-4 text-amber-600" />
 باقی‌مانده مشتری
 </>
 ) : (
 <>
 <CheckCircle2 className="h-4 w-4 text-teal-600" />
 تسویه کامل
 </>
 )}
 </span>
 <span className="text-[15px] font-black">
 {formatNumber(receivedNum > 0 ? changeDue : totals.total)} ریال
 </span>
 </div>
 </div>
 )}

 {payMethod === "CARD" && (
 <div className="space-y-2">
 {/* v32-D: وضعیت زندهٔ اتصال کارتخوان + دریافت خودکار */}
 {posConfig ? (
 <div className={`rounded-xl p-3 text-[12px] leading-relaxed border ${
 cardCharging
 ? "bg-primary/5 border-primary/30 text-primary"
 : "bg-muted/50 border-border text-muted-foreground"
 }`}>
 {cardCharging ? (
 <span className="flex items-center gap-2 font-medium">
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ارسال مبلغ به کارتخوان… کارت را بکشید و رمز را بزنید
 </span>
 ) : (
 <>
 <span className="font-medium text-foreground">دریافت خودکار با کارتخوان فعال است ✓</span>
 <br />
 با زدن «صدور فیش»، مبلغ {formatNumber(totals.total)} ریال خودکار به کارتخوان متصل ({toPersianDigits(posConfig.bridgeUrl.replace(/^https?:\/\//, ""))}) فرستاده می‌شود — مشتری فقط کارت می‌کشد و رمز می‌زند.
 </>
 )}
 </div>
 ) : (
 <p className="text-[12px] text-muted-foreground rounded-xl bg-muted/50 p-3 leading-relaxed">
 مبلغ را روی کارت‌خوان دریافت و تأیید کنید، سپس «صدور فیش» را بزنید.
 <br />
 <span className="text-primary">برای دریافت خودکار:</span> از راهنمای «اتصال کارتخوان» (پایین صندوق) فایل پل را دانلود و روی همین کامپیوتر اجرا کنید — بعدش مبلغ خودکار می‌رود و فقط باید کارت کشیده شود.
 </p>
 )}
 </div>
 )}
 {payMethod === "ONLINE" && (
 <p className="text-[12px] text-muted-foreground rounded-xl bg-muted/50 p-3 leading-relaxed">
 لینک پرداخت آنلاین برای مشتری پیامک/واتساپ می‌شود — پس از صدور فیش، از ماژول «فاکتورها» دکمه «پرداخت آنلاین» را بزنید.
 </p>
 )}

 <DialogFooter className="gap-2 sm:gap-0">
 <Button variant="outline" onClick={() => setPayOpen(false)} disabled={submitting} className="h-11">
 انصراف
 </Button>
 <Button onClick={submitSale} disabled={submitting} className="h-11 font-bold flex-1 sm:flex-none">
 {submitting ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ثبت…
 </>
 ) : (
 <>
 <Printer className="h-4 w-4" />
 صدور فیش و ثبت فروش
 </>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ انتخاب مشتری */}
 <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
 <DialogContent className="max-w-md w-[95vw]" dir="rtl">
 <DialogHeader className="text-start">
 <DialogTitle>انتخاب مشتری</DialogTitle>
 <DialogDescription>مشتری نقدی یا طرف‌حساب ثبت‌شده</DialogDescription>
 </DialogHeader>
 <div className="relative">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 value={customerSearch}
 onChange={(e) => setCustomerSearch(e.target.value)}
 placeholder="جستجوی نام مشتری…"
 className="h-11 ps-9 rounded-xl"
 autoFocus
 />
 </div>
 <div className="max-h-72 overflow-y-auto space-y-1.5">
 <button
 onClick={() => {
 setCustomer(CASH_CUSTOMER);
 setCustomerOpen(false);
 setCustomerSearch("");
 }}
 className="w-full flex items-center justify-between rounded-xl border-2 border-teal-500/40 bg-teal-500/5 hover:bg-teal-500/10 p-3 transition-colors text-start"
 >
 <span className="font-bold text-[13px] flex items-center gap-2">
 <Banknote className="h-4 w-4 text-teal-600" />
 {CASH_CUSTOMER}
 </span>
 <Badge variant="secondary" className="text-[10px]">پیش‌فرض</Badge>
 </button>
 {filteredParties.map((p) => (
 <button
 key={p.id}
 onClick={() => {
 setCustomer(p.name);
 setCustomerOpen(false);
 setCustomerSearch("");
 }}
 className="w-full flex items-center gap-2 rounded-xl border border-border hover:bg-muted p-3 transition-colors text-start"
 >
 <User className="h-4 w-4 text-muted-foreground shrink-0" />
 <span className="text-[13px] font-medium truncate">{p.name}</span>
 </button>
 ))}
 {filteredParties.length === 0 && (
 <p className="text-center text-xs text-muted-foreground py-6">طرف‌حسابی یافت نشد</p>
 )}
 </div>
 </DialogContent>
 </Dialog>

 {/* دیالوگ سبدهای معلق */}
 <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
 <DialogContent className="max-w-md w-[95vw]" dir="rtl">
 <DialogHeader className="text-start">
 <DialogTitle className="flex items-center gap-2">
 <Pause className="h-4.5 w-4.5 text-amber-500" />
 سبدهای معلق ({toPersianDigits(String(heldOrders.length))})
 </DialogTitle>
 <DialogDescription>سفارش‌های نگه‌داشته‌شده — برای ادامه لمس کنید</DialogDescription>
 </DialogHeader>
 <div className="max-h-80 overflow-y-auto space-y-2">
 {heldOrders.length === 0 ? (
 <p className="text-center text-xs text-muted-foreground py-8">
 سفارش معلقی نیست — با دکمه «معلق» سبد فعلی را نگه دارید
 </p>
 ) : (
 heldOrders.map((h) => {
 const hTotal = h.lines.reduce(
 (s, l) => s + l.unitPrice * l.quantity * (1 + l.taxRate),
 0
 );
 return (
 <div key={h.id} className="rounded-xl border border-border p-3 space-y-2">
 <div className="flex items-center justify-between gap-2">
 <div className="min-w-0">
 <p className="font-bold text-[13px] truncate">{h.customer}</p>
 <p className="text-[11px] text-muted-foreground">
 {toPersianDigits(new Date(h.at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }))} •{" "}
 {toPersianDigits(String(h.lines.length))} قلم
 </p>
 </div>
 <span className="text-[12px] font-bold text-teal-600 whitespace-nowrap">
 {formatNumber(hTotal)} ریال
 </span>
 </div>
 <div className="flex gap-1.5">
 <Button size="sm" className="h-9 flex-1 text-[12px]" onClick={() => resumeHeld(h.id)}>
 <Play className="h-3.5 w-3.5" />
 ادامه سفارش
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="h-9 text-rose-600 border-rose-500/30 hover:text-rose-700 text-[12px]"
 onClick={() => persistHeld(heldOrders.filter((x) => x.id !== h.id))}
 >
 <Trash2 className="h-3.5 w-3.5" />
 حذف
 </Button>
 </div>
 </div>
 );
 })
 )}
 </div>
 </DialogContent>
 </Dialog>

 {/* راهنمای شورتکات */}
 <div className="hidden xl:flex items-center gap-4 text-[11px] text-muted-foreground border-t border-border pt-3">
 <span className="flex items-center gap-1.5">
 <Keyboard className="h-3.5 w-3.5" />
 شورتکات‌ها:
 </span>
 <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">F2</kbd>
 <span>پرداخت</span>
 <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">F3</kbd>
 <span>جستجو</span>
 <span className="ms-auto">هر فروش POS به‌صورت خودکار در دفاتر، انبار و مالیات ثبت می‌شود</span>
 </div>

 {/* v13.3 — دیالوگ چاپ لیبل قیمت/بارکد (کالاهای فیلترشدهٔ POS) */}
 <LabelPrintDialog
 open={labelPrintOpen}
 onOpenChange={setLabelPrintOpen}
 products={filteredProducts.map((p) => ({
 id: p.id,
 name: p.name,
 sku: p.sku,
 barcode: p.barcode,
 price: p.salePrice,
 unit: p.unit,
 }))}
 />
 </div>
 );
}

/** نمایش فشرده قیمت برای کاشی کالا (ریال → خوانا) */
function formatCompactRialForPos(rial: number): string {
 const toman = Math.round(rial / 10);
 if (toman >= 1_000_000) return `${formatNumber(Math.round(toman / 1000))}ه‌ت`;
 if (toman >= 1000) return `${formatNumber(toman)} ت`;
 return `${formatNumber(toman)} ت`;
}

/* ============ راهنمای اتصال کارتخوان (Task 25-E) ============ */

/** نوع آیکون lucide مورد استفاده در راهنمای اتصال کارتخوان */
type GuideIcon = React.ComponentType<{ className?: string }>;

/** کلاس مشترک کدهای درون‌متنی راهنما (چپ‌به‌راست داخل متن فارسی) */
const GUIDE_CODE_CLS = "rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-foreground";

/** کد درون‌متنی LTR — برای نام فایل‌ها، متغیرها و دستورها */
function GuideCode({ children }: { children: React.ReactNode }) {
 return (
 <code dir="ltr" className={GUIDE_CODE_CLS}>
 {children}
 </code>
 );
}

/** بلوک کد قابل اسکرول افقی — برای دستورهای اجرایی */
function GuideCodeBlock({ children }: { children: React.ReactNode }) {
 return (
 <code
 dir="ltr"
 className="mt-1.5 block overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono text-[11px] text-foreground"
 >
 {children}
 </code>
 );
}

/** دایرهٔ شمارهٔ گام‌ها با اعداد فارسی */
function GuideStepNum({ n, small }: { n: number; small?: boolean }) {
 return (
 <span
 aria-hidden="true"
 className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-black text-primary-foreground ${
 small ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-[12px]"
 }`}
 >
 {toPersianDigits(String(n))}
 </span>
 );
}

/** سرتیتر یکایک سکشن‌های راهنما */
function GuideSectionHeader({
 id,
 icon: Icon,
 title,
 badge,
}: {
 id: string;
 icon: GuideIcon;
 title: string;
 badge?: string;
}) {
 return (
 <div className="mb-2.5 flex flex-wrap items-center gap-2">
 <Icon className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
 <h4 id={id} className="text-[13.5px] font-bold text-foreground">
 {title}
 </h4>
 {badge ? (
 <Badge variant="secondary" className="text-[10px]">
 {badge}
 </Badge>
 ) : null}
 </div>
 );
}

/** کارت یک حالت اتصال (شبیه‌سازی / درایور واقعی / نقدی دستی) */
function GuideModeCard({
 icon: Icon,
 title,
 code,
 desc,
 badge,
 featured,
}: {
 icon: GuideIcon;
 title: string;
 code: string;
 desc: string;
 badge?: string;
 featured?: boolean;
}) {
 return (
 <div
 className={`rounded-xl border p-3.5 sm:p-4 ${
 featured ? "border-teal-500/40 bg-teal-500/5" : "border-border bg-muted/20"
 }`}
 >
 <div className="flex items-center gap-2.5">
 <span
 className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
 featured ? "bg-teal-500/15 text-teal-600 dark:text-teal-400" : "bg-muted text-foreground"
 }`}
 >
 <Icon className="h-4.5 w-4.5" aria-hidden="true" />
 </span>
 <div className="min-w-0">
 <div className="flex items-center gap-1.5">
 <p className="text-[13px] font-bold text-foreground">{title}</p>
 {badge ? (
 <Badge
 variant="secondary"
 className={`px-1.5 text-[9px] ${
 featured ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : ""
 }`}
 >
 {badge}
 </Badge>
 ) : null}
 </div>
 <code dir="ltr" className="block truncate font-mono text-[10.5px] text-muted-foreground">
 {code}
 </code>
 </div>
 </div>
 <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{desc}</p>
 </div>
 );
}

/** ردیف‌های عیب‌یابی — منبع: docs/POS-INTEGRATION.md */
const GUIDE_TROUBLESHOOTING: ReadonlyArray<{ symptom: string; cause: string; fix: string }> = [
 {
 symptom: "پیام «توکن نامعتبر است»",
 cause: "TENANT_TOKEN قدیمی یا منقضی شده",
 fix: "USERNAME و PASSWORD را پر کنید (لاگین خودکار) یا توکن تازه بگیرید",
 },
 {
 symptom: "«ارتباط با هوش برقرار نشد» — همیشه",
 cause: "HOOSH_DOMAIN اشتباه یا مشکل DNS/فیلترینگ",
 fix: "دامنه را در مرورگر باز کنید؛ اگر باز شد، آدرس را در فایل پل اصلاح کنید",
 },
 {
 symptom: "«اتصال به کارتخوان برقرار نشد»",
 cause: "درایور کارتخوان اجرا نیست یا پورت اشتباه است",
 fix: "نرم‌افزار پذیرندگی بانک را باز کنید؛ GATEWAY_URL و پورت را از مستندات همان درایور چک کنید",
 },
 {
 symptom: "فاکتور شارژ می‌شود ولی «تسویه‌شده» نمی‌شود",
 cause: "گزارش نتیجه از سمت سرور رد شده است",
 fix: "پاسخ JSON مسیر charge-result را در لاگ پل ببینید؛ اگر 401 بود توکن را تازه کنید",
 },
 {
 symptom: "فاکتور دیر به پل می‌رسد",
 cause: "فاصلهٔ polling زیاد است",
 fix: "POLL_INTERVAL را کم کنید (حداقل ۲۰۰۰ میلی‌ثانیه)",
 },
 {
 symptom: "هیچ فاکتوری به پل نمی‌آید",
 cause: "فاکتور نسیه/رزرو است یا بیش از ۱۰ دقیقه از ثبتش گذشته",
 fix: "فقط فروش نقدیِ تازه وارد صف پرداخت می‌شود",
 },
 {
 symptom: "دوبار پول کشیده شد",
 cause: "دو پل یا «پل + مرورگر» هم‌زمان روی یک صف",
 fix: "فقط یک مسیر شارژ فعال نگه دارید؛ تراکنش تکراری را از گزارش کارتخوان بانک ببینید",
 },
 {
 symptom: "مشتری کارت را نکشید یا لغو کرد",
 cause: "تراکنش ناموفق (گزارش success=false)",
 fix: "فاکتور سالم می‌ماند و ۳۰ ثانیه بعد دوباره تلاش می‌شود؛ در صورت نیاز از خود هوش دستی تسویه کنید",
 },
];

/**
 * CardReaderGuide — راهنمای گام‌به‌گام اتصال کارتخوان فیزیکی به هوش
 *
 * محتوای این بخش آینهٔ مستند رسمی docs/POS-INTEGRATION.md است (منبع حقیقت)
 * که به‌شکل UI تمیز بازنویسی شده — نه کپی مستقیم مارک‌داون.
 */
function CardReaderGuide({ onClose }: { onClose: () => void }) {
 return (
 <Card
 id="card-reader-guide-body"
 role="region"
 aria-label="راهنمای اتصال کارتخوان به هوش"
 className="!rounded-2xl overflow-hidden py-0"
 >
 <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
 {/* سربرگ راهنما */}
 <div className="border-b border-border bg-gradient-to-l from-teal-500/15 via-teal-500/5 to-transparent p-4 sm:p-6">
 <div className="flex items-start gap-3">
 <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
 <CreditCard className="h-5.5 w-5.5" aria-hidden="true" />
 </span>
 <div className="min-w-0">
 <h3 className="text-sm font-black text-foreground sm:text-base">
 اتصال کارتخوان به هوش — مثل هلو، ساده
 </h3>
 <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
 فاکتور نقدی را در هوش ثبت کنید؛ مبلغ همان لحظه خودکار روی کارتخوان می‌نشیند، مشتری پرداخت
 می‌کند و تسویهٔ فاکتور و سند حسابداری خودکار ثبت می‌شود — بدون هیچ کلیک اضافه. مناسب برای
 وقتی که هوش روی موبایل یا کامپیوتر دیگری باز می‌شود یا مرورگر به کارتخوان دسترسی ندارد.
 </p>
 </div>
 </div>
 <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
 {[
 "فاکتور نقدی در هوش ثبت می‌شود",
 "مبلغ خودکار روی کارتخوان می‌نشیند",
 "مشتری کارت می‌کشد و رمز می‌زند",
 "تسویهٔ خودکار فاکتور + سند حسابداری",
 ].map((t, i) => (
 <div key={t} className="rounded-xl border border-border bg-card p-2.5 text-center">
 <GuideStepNum n={i + 1} small />
 <p className="mt-1.5 text-[11px] leading-snug text-foreground/90">{t}</p>
 </div>
 ))}
 </div>
 </div>

 <div className="space-y-6 p-4 sm:p-6">
 {/* ۱) روش ۵ دقیقه‌ای */}
 <section aria-labelledby="pos-guide-quick">
 <GuideSectionHeader
 id="pos-guide-quick"
 icon={Timer}
 title="روش ۵ دقیقه‌ای با فایل آمادهٔ هوش"
 badge="پیشنهادی"
 />
 <ol className="space-y-2.5">
 <li className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
 <GuideStepNum n={1} />
 <div className="min-w-0 flex-1">
 <p className="text-[13px] font-bold text-foreground">فایل پل آمادهٔ هوش را دانلود کنید</p>
 <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
 فایل <GuideCode>hoosh-pos-bridge.js</GuideCode> (نسخهٔ ۲) را دانلود کنید و در یک پوشهٔ ساده روی
 کامپیوتر صندوق ذخیره کنید — مثلاً <GuideCode>C:\hoosh-pos</GuideCode>. این فایل یک فایل
 واحد است؛ هیچ <GuideCode>npm install</GuideCode> یا نصب دیگری لازم ندارد.
 </p>
 <a
 href="/pos-bridge/hoosh-pos-bridge.js"
 download="hoosh-pos-bridge.js"
 className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12px] font-bold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
 >
 <Download className="h-4 w-4" aria-hidden="true" />
 دانلود فایل پل کارتخوان (hoosh-pos-bridge.js)
 </a>
 </div>
 </li>
 <li className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
 <GuideStepNum n={2} />
 <div className="min-w-0 flex-1">
 <p className="text-[13px] font-bold text-foreground">
 Node.js را نصب کنید (یک بار برای همیشه)
 </p>
 <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
 اگر Node.js ندارید، از سایت <GuideCode>nodejs.org</GuideCode> نسخهٔ{" "}
 <span className="font-bold">LTS</span> را دانلود و مثل هر نرم‌افزار ویندوزی نصب کنید
 (بعدی/بعدی/پایان). برای اطمینان در cmd بزنید <GuideCode>node --version</GuideCode> — باید
 عددی مانند ۲۰ یا بالاتر نشان دهد. اگر Bun دارید، همان هم کار می‌کند.
 </p>
 </div>
 </li>
 <li className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
 <GuideStepNum n={3} />
 <div className="min-w-0 flex-1">
 <p className="text-[13px] font-bold text-foreground">اجرا و تست در حالت شبیه‌سازی</p>
 <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
 در cmd، در همان پوشهٔ فایل، بزنید:
 </p>
 <GuideCodeBlock>node hoosh-pos-bridge.js</GuideCodeBlock>
 <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
 حالت پیش‌فرض <GuideCode>simulation</GuideCode> (تست بدون کارتخوان) است — هر درخواست پرداخت
 بعد از ~۴ ثانیه «پرداخت شد» برمی‌گرداند. پنجرهٔ پل باید باز بماند (قابل Minimize).
 </p>
 </div>
 </li>
 <li className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
 <GuideStepNum n={4} />
 <div className="min-w-0 flex-1">
 <p className="text-[13px] font-bold text-foreground">
 در هوش، تنظیمات کارتخوان را فعال کنید
 </p>
 <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
 در ماژول <span className="font-bold">فاکتورها</span> دکمهٔ «تنظیمات کارتخوان» را بزنید (یا از
 همین صندوق، در دیالوگ پرداخت گزینهٔ کارت‌خوان). کارتخوان را <span className="font-bold">فعال</span>
 کنید، آدرس پل را <GuideCode>http://127.0.0.1:9090</GuideCode> بگذارید و
 <span className="font-bold">«تست اتصال»</span> را بزنید — باید ✓ ببینید. از این لحظه، در صندوق
 POS با انتخاب پرداخت «کارت‌خوان» و زدن «صدور فیش»، مبلغ خودکار به کارتخوان می‌رود و مشتری
 فقط کارت می‌کشد و رمز می‌زند.
 </p>
 </div>
 </li>
 <li className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
 <GuideStepNum n={5} />
 <div className="min-w-0 flex-1">
 <p className="text-[13px] font-bold text-foreground">کارتخوان واقعی را وصل کنید</p>
 <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
 سه راه واقعی (بسته به نوع کارتخوان):
 <br />
 <span className="font-bold">۱) کارتخوان معمولی بانکی (سم‌کارت):</span> حالت
 <GuideCode>manual</GuideCode> — مبلغ روی صفحهٔ کامپیوتر بزرگ نمایش داده می‌شود، کارت را روی
 کارتخوان می‌کشید و کلید <GuideCode>y</GuideCode> را می‌زنید (ناموفق: <GuideCode>n</GuideCode>،
 انصراف: <GuideCode>t</GuideCode>).
 <br />
 <span className="font-bold">۲) کارتخوان هوشمند اندرویدی (تراستر/هایپر...):</span> اگر اپ PSP شما
 درگاه محلی دارد، حالت <GuideCode>gateway</GuideCode> و آدرس همان اپ.
 <br />
 <span className="font-bold">۳) درگاه درون‌ساز PSP (به‌پرداخت/سامان/آسان‌پرداخت/پاسارگاد):</span>
 برای فروشگاه‌های پرتراکنش — از پشتیبانی PSP خود <GuideCode>GATEWAY_URL</GuideCode> و
 <GuideCode>GATEWAY_TOKEN</GuideCode> بگیرید و حالت <GuideCode>gateway</GuideCode> را فعال
 کنید؛ رسید دیجیتال خودکار برمی‌گردد.
 </p>
 <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
 تغییر حالت بدون ویرایش فایل — با متغیر محیطی:
 </p>
 <GuideCodeBlock>{'set HOOSH_POS_MODE=manual  &&  node hoosh-pos-bridge.js'}</GuideCodeBlock>
 </div>
 </li>
 </ol>
 </section>

 {/* ۲) سه حالت اتصال */}
 <section aria-labelledby="pos-guide-modes">
 <GuideSectionHeader id="pos-guide-modes" icon={Layers} title="سه حالت اتصال" />
 <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
 <GuideModeCard
 icon={Cpu}
 title="شبیه‌سازی"
 code={'HOOSH_POS_MODE=simulation'}
 badge="پیش‌فرض"
 desc="تست بدون کارتخوان — هر درخواست پرداخت بعد از ~۴ ثانیه «پرداخت شد» برمی‌گرداند. برای آموزش صندوقدار و تست گردش‌کار قبل از وصل‌کردن کارتخوان واقعی."
 />
 <GuideModeCard
 icon={Wifi}
 title="اتصال واقعی"
 code={'HOOSH_POS_MODE=gateway'}
 badge="کار روزانه"
 featured
 desc="اتصال به درگاه درون‌ساز PSP (به‌پرداخت/سامان/آسان‌پرداخت/پاسارگاد) — مبلغ هر فیش به کارتخوان ارسال و نتیجهٔ پرداخت (موفق/ناموفق + شماره پیگیری) خودکار به هوش برمی‌گردد."
 />
 <GuideModeCard
 icon={Banknote}
 title="نقدی/دستی"
 code={'HOOSH_POS_MODE=manual'}
 desc="کارتخوان معمولی سم‌کارت بدون درایو HTTP — مبلغ روی صفحهٔ کامپیوتر بزرگ نمایش داده می‌شود؛ بعد از کشیدن کارت روی کارتخوان بانک، کلید y را می‌زنید (ناموفق n، انصراف t)."
 />
 </div>
 </section>

 {/* ۳) پیش‌نیازها */}
 <section aria-labelledby="pos-guide-prereq">
 <GuideSectionHeader id="pos-guide-prereq" icon={ListChecks} title="پیش‌نیازها" />
 <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
 {[
 {
 icon: CreditCard,
 title: "کارتخوان با درایو محلی/شبکه",
 desc: "نرم‌افزار پذیرندگی بانک (پوشین، سامان کیش، پارسیان، به‌پرداخت و…) باید روی همان کامپیوتر با پورت HTTP در دسترس باشد.",
 },
 {
 icon: Laptop,
 title: "یک کامپیوتر در فروشگاه",
 desc: "ویندوز، مک یا لینوکس — همان کامپیوتری که کارتخوان به آن وصل است.",
 },
 {
 icon: Wifi,
 title: "اتصال اینترنت",
 desc: "برای همگام‌سازی ابری هوش و پل؛ قطع موقت اینترنت چیزی را از دست نمی‌دهد — صف ادامه پیدا می‌کند.",
 },
 {
 icon: BadgeCheck,
 title: "اشتراک فعال هوش",
 desc: "فاکتورها و صف پرداخت روی حساب و شرکتِ همان اشتراک ثبت می‌شوند.",
 },
 ].map((p) => (
 <div
 key={p.title}
 className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 p-3.5"
 >
 <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
 <p.icon className="h-4 w-4" aria-hidden="true" />
 </span>
 <div className="min-w-0">
 <p className="text-[12.5px] font-bold text-foreground">{p.title}</p>
 <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{p.desc}</p>
 </div>
 </div>
 ))}
 </div>
 </section>

 {/* ۴) نحوهٔ کار */}
 <section aria-labelledby="pos-guide-how">
 <GuideSectionHeader id="pos-guide-how" icon={Activity} title="نحوهٔ کار — چرخهٔ کامل یک فروش" />
 <ol className="space-y-1.5">
 {[
 "فاکتور فروش (SALE) نقدی در هوش ثبت می‌شود — مثل همیشه، بدون کار اضافه.",
 "فاکتور در «صف پرداخت‌های منتظر» سرور هوش ظاهر می‌شود.",
 "پل هر ۳ ثانیه از سرور می‌پرسد: «فاکتورِ منتظرِ پرداخت کارتی هست؟»",
 "مبلغ به درایور کارتخوان ارسال می‌شود — مشتری کارت می‌کشد و رمز می‌زند.",
 "نتیجهٔ پرداخت (موفق/ناموفق + شماره پیگیری) به هوش برمی‌گردد.",
 "فاکتور خودکار «تسویه‌شده» می‌شود + سند صندوق ثبت و موجودی انبار کم می‌شود.",
 ].map((t, i) => (
 <li key={t} className="flex items-start gap-2.5 rounded-lg bg-muted/30 px-3 py-2">
 <GuideStepNum n={i + 1} small />
 <p className="pt-0.5 text-[12px] leading-relaxed text-foreground/90">{t}</p>
 </li>
 ))}
 </ol>
 <div className="mt-3 flex gap-2.5 rounded-xl border border-teal-500/30 bg-teal-500/5 p-3 sm:p-4">
 <ShieldCheck
 className="h-4.5 w-4.5 shrink-0 text-teal-600 dark:text-teal-400"
 aria-hidden="true"
 />
 <p className="text-[11.5px] leading-relaxed text-foreground/90">
 <span className="font-bold">ضد شارژ دوباره:</span> نتیجهٔ هر تراکنش فقط یک‌بار اعمال می‌شود —
 اگر گزارش به سرور نرسد، پل فقط «گزارش» را دوباره می‌فرستد و کارت دوباره کشیده نمی‌شود.
 تراکنش ناموفق هم بعد از ۳۰ ثانیه خودکار دوباره تلاش می‌شود.
 </p>
 </div>
 </section>

 {/* ۵) سؤالات پرتکرار */}
 <section aria-labelledby="pos-guide-faq">
 <GuideSectionHeader id="pos-guide-faq" icon={HelpCircle} title="سؤالات پرتکرار" />
 <Accordion type="single" collapsible className="w-full rounded-xl border border-border px-4">
 <AccordionItem value="faq-security">
 <AccordionTrigger className="py-3 text-start text-[12.5px] font-bold hover:no-underline">
 امنیت این توکن چقدر است؟
 </AccordionTrigger>
 <AccordionContent className="text-[11.5px] leading-relaxed text-muted-foreground">
 توکن فقط برای همان حساب/شرکت شما کار می‌کند و فقط به داده‌های خودتان دسترسی دارد. فایل پل
 را روی کامپیوتر خودتان نگه دارید و به کسی نفرستید. اگر لو رفت: رمز عبور را عوض کنید یا در
 هوش از «حساب کاربری ← نشست‌های فعال» همهٔ نشست‌ها را باطل کنید — توکن پل بی‌اثر می‌شود.
 </AccordionContent>
 </AccordionItem>
 <AccordionItem value="faq-offline">
 <AccordionTrigger className="py-3 text-start text-[12.5px] font-bold hover:no-underline">
 اگر اینترنت مغازه قطع شود چه می‌شود؟
 </AccordionTrigger>
 <AccordionContent className="text-[11.5px] leading-relaxed text-muted-foreground">
 هیچ چیزی از دست نمی‌رود. پل بی‌صدا تلاش می‌کند تا اینترنت برگردد؛ فاکتورهای این مدت در
 صف سرور می‌مانند (پنجرهٔ ۱۰ دقیقه) و بعد از برگشت اینترنت خودکار شارژ می‌شوند. تراکنشی
 که کارتش کشیده شده ولی گزارشش نرسیده، دوباره کشیده نمی‌شود — پل نتیجه را به‌خاطر
 می‌سپارد و فقط گزارش را دوباره می‌فرستد.
 </AccordionContent>
 </AccordionItem>
 <AccordionItem value="faq-multi">
 <AccordionTrigger className="py-3 text-start text-[12.5px] font-bold hover:no-underline">
 چند کارتخوان دارم — چه کنم؟
 </AccordionTrigger>
 <AccordionContent className="text-[11.5px] leading-relaxed text-muted-foreground">
 برای هر صندوق/کارتخوان یک پل با <GuideCode>TERMINAL_ID</GuideCode> جدا اجرا کنید (مثلاً{" "}
 <GuideCode>POS-1</GuideCode> و <GuideCode>POS-2</GuideCode>). چون هر پل هر درخواست را فقط
 یک‌بار می‌کشد، تداخل عملی رخ نمی‌دهد؛ برای تفکیک کامل صندوق‌ها از «شرکت»های جدا در هوش
 استفاده کنید.
 </AccordionContent>
 </AccordionItem>
 <AccordionItem value="faq-token">
 <AccordionTrigger className="py-3 text-start text-[12.5px] font-bold hover:no-underline">
 توکن کِی منقضی می‌شود؟
 </AccordionTrigger>
 <AccordionContent className="text-[11.5px] leading-relaxed text-muted-foreground">
 اگر <GuideCode>USERNAME</GuideCode> و <GuideCode>PASSWORD</GuideCode> را پر کرده باشید،
 هرگز دردسر نمی‌شود — پل خودش دوباره وارد می‌شود. با توکن دستی (F12)، نشست حدود ۷ روز
 (یا ۳۰ روز با «مرا به خاطر بسپار») عمر دارد.
 </AccordionContent>
 </AccordionItem>
 <AccordionItem value="faq-cashonly">
 <AccordionTrigger className="py-3 text-start text-[12.5px] font-bold hover:no-underline">
 فاکتور نسیه/رزرو/خرید هم شارژ می‌شود؟
 </AccordionTrigger>
 <AccordionContent className="text-[11.5px] leading-relaxed text-muted-foreground">
 نه. صف فقط «فروشِ نقدیِ صادرشدهٔ تسویه‌نشده» را برمی‌گرداند؛ فاکتور نسیه و رزرو و خرید
 وارد صف پرداخت کارتی نمی‌شوند.
 </AccordionContent>
 </AccordionItem>
 <AccordionItem value="faq-browser">
 <AccordionTrigger className="py-3 text-start text-[12.5px] font-bold hover:no-underline">
 با «شارژ خودکار مرورگر» هم‌زمان تداخل دارد؟
 </AccordionTrigger>
 <AccordionContent className="text-[11.5px] leading-relaxed text-muted-foreground">
 اگر هوش و پل روی یک کامپیوترند و هر دو فعال باشند، ممکن است یک فاکتور هم از مرورگر و هم
 از پل به کارتخوان برسد — فقط یکی از دو مسیر را فعال نگه دارید (بخش «راه پیشرفته» پایین
 را ببینید).
 </AccordionContent>
 </AccordionItem>
 </Accordion>
 </section>

 {/* ۶) عیب‌یابی */}
 <section aria-labelledby="pos-guide-trouble">
 <GuideSectionHeader id="pos-guide-trouble" icon={Wrench} title="عیب‌یابی" />
 <div className="overflow-hidden rounded-xl border border-border">
 <div className="hidden bg-muted/50 px-3 py-2 text-[10.5px] font-bold text-muted-foreground md:grid md:grid-cols-[1.15fr_1fr_1.35fr] md:gap-2 md:border-b md:border-border">
 <span>نشانه</span>
 <span>علت احتمالی</span>
 <span>راه حل</span>
 </div>
 <div>
 {GUIDE_TROUBLESHOOTING.map((r) => (
 <div
 key={r.symptom}
 className="grid grid-cols-1 gap-1 border-t border-border px-3 py-2.5 text-[11px] leading-relaxed first:border-t-0 md:grid-cols-[1.15fr_1fr_1.35fr] md:gap-2 md:py-2"
 >
 <span className="flex items-start gap-1.5 font-bold text-foreground">
 <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
 {r.symptom}
 </span>
 <span className="text-muted-foreground">
 <span className="text-muted-foreground/60 md:hidden">علت: </span>
 {r.cause}
 </span>
 <span className="text-foreground/90">
 <span className="text-muted-foreground/60 md:hidden">راه حل: </span>
 {r.fix}
 </span>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* ۷) راه پیشرفته */}
 <section aria-labelledby="pos-guide-advanced">
 <GuideSectionHeader
 id="pos-guide-advanced"
 icon={FileCode}
 title="راه پیشرفته (کاربران حرفه‌ای)"
 />
 <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-[11.5px] leading-relaxed text-muted-foreground sm:p-4">
 <p>
 اگر هوش روی همان کامپیوترِ کارتخوان باز می‌شود، بدون فایل پل هم می‌توانید از «شارژ خودکار
 هنگام صدور فاکتور» استفاده کنید: در ماژول «خرید و فروش» ← منوی تنظیمات (چرخ‌دنده) ←
 «اتصال کارتخوان» را فعال کنید و سوییچ «شارژ خودکار هنگام صدور فاکتور» را روشن کنید — با
 ثبت هر فاکتور نقدی، مبلغ همان لحظه از مرورگر به پل محلی می‌رود.
 </p>
 <p>
 راهنمای کامل‌تر — قرارداد HTTP پل، جدول APIهای ابری و نمونهٔ کد برای توسعه‌دهندگان — در
 فایل <GuideCode>docs/POS-INTEGRATION.md</GuideCode> داخل بستهٔ هوش آمده است. توجه: روش
 مرورگر و پلِ فایل آماده را هم‌زمان فعال نکنید.
 </p>
 </div>
 </section>

 {/* دریافت فایل از پشتیبانی */}
 <div className="flex flex-col items-center gap-3 rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 text-center sm:flex-row sm:p-6 sm:text-start">
 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400">
 <MessageCircle className="h-5 w-5" aria-hidden="true" />
 </span>
 <p className="flex-1 text-[12.5px] leading-relaxed text-foreground">
 برای دریافت فایل آمادهٔ پل و راهنمای کامل‌تر به پشتیبانی هوش پیام دهید:{" "}
 <a
 href="https://hoosh.nobatime.ir"
 target="_blank"
 rel="noopener noreferrer"
 className="font-bold text-teal-600 underline underline-offset-4 transition-opacity hover:opacity-80 dark:text-teal-400"
 >
 hoosh.nobatime.ir
 </a>
 </p>
 <Button
 variant="outline"
 size="sm"
 className="h-10 shrink-0 border-teal-500/30"
 onClick={onClose}
 >
 <X className="h-4 w-4" aria-hidden="true" />
 بستن راهنما
 </Button>
 </div>
 </div>
 </div>
 </Card>
 );
}

export default PosTerminal;
