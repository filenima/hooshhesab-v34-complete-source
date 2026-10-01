"use client";

import * as React from "react";
import {
 Search,
 Command,
 LayoutDashboard,
 BookOpen,
 ShoppingCart,
 Landmark,
 Receipt,
 FileCheck,
 Package,
 Store,
 Users,
 Sparkles,
 BarChart3,
 Heart,
 ShieldCheck,
 Code2,
 Plus,
 FileText,
 Settings,
 Moon,
 Sun,
 CornerDownLeft,
 Factory,
 HardHat,
 ShoppingBag,
 Bell,
 Crown,
 Smartphone,
 Globe,
 Wallet,
 Coins,
 Truck,
 TrendingUp,
 FileBarChart,
 CreditCard,
 Loader2,
 Clock,
 Download,
 AlertTriangle,
 Mail,
 MessageSquare,
 Workflow,
 Webhook,
 Handshake,
 Layers,
 Tags,
 GraduationCap,
 Fingerprint,
 Printer,
 GitCompare,
 Calculator,
 FileSearch,
 type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import { toPersianDigits } from "@/lib/persian";

/* ============================================================
 تاریخچه جستجو — localStorage
 ============================================================ */
const SEARCH_HISTORY_KEY = "hoshhesab_search_history";
const MAX_SEARCH_HISTORY = 8;

function loadSearchHistory(): string[] {
 if (typeof window === "undefined") return [];
 try {
 const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
 if (raw) return JSON.parse(raw) as string[];
 } catch { /* ignore */ }
 return [];
}

function saveSearchHistory(history: string[]) {
 try {
 localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_SEARCH_HISTORY)));
 } catch { /* ignore */ }
}

function addToSearchHistory(query: string) {
 if (!query.trim()) return;
 const prev = loadSearchHistory().filter((q) => q!== query.trim());
 saveSearchHistory([query.trim(),...prev]);
}

function clearSearchHistory() {
 try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch { /* ignore */ }
}

interface CommandItem {
 id: string;
 label: string;
 hint?: string;
 icon: LucideIcon;
 group: string;
 action: () => void;
 keywords?: string[];
 entityLabel?: string;
}

interface DataSearchResult {
 id: string;
 entityType: "invoice" | "product" | "party" | "journal";
 title: string;
 snippet: string;
 date?: string;
 amount?: number;
 status?: string;
 url?: string;
}

interface CommandPaletteProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onNavigate: (moduleId: string) => void;
 onQuickAction?: (action: string) => void;
 token?: string | null;
}

// نگاشت نوع موجودیت به ماژول مقصد + آیکون + برچسب فارسی
const ENTITY_META: Record<
 DataSearchResult["entityType"],
 { icon: LucideIcon; label: string; module: string }
> = {
 invoice: { icon: ShoppingCart, label: "فاکتور", module: "invoices" },
 product: { icon: Package, label: "کالا", module: "inventory" },
 party: { icon: Heart, label: "طرف‌حساب", module: "crm" },
 journal: { icon: BookOpen, label: "سند", module: "core" },
};

export function CommandPalette({
 open,
 onOpenChange,
 onNavigate,
 onQuickAction,
 token,
}: CommandPaletteProps) {
 const { setTheme, theme } = useTheme();
 const [query, setQuery] = React.useState("");
 const [activeIndex, setActiveIndex] = React.useState(0);
 const [dataResults, setDataResults] = React.useState<DataSearchResult[]>([]);
 const [dataLoading, setDataLoading] = React.useState(false);
 const [searchHistory, setSearchHistory] = React.useState<string[]>(loadSearchHistory);
 const inputRef = React.useRef<HTMLInputElement>(null);
 const listRef = React.useRef<HTMLDivElement>(null);

 const items: CommandItem[] = React.useMemo(() => {
 const go = (id: string) => () => {
 onNavigate(id);
 onOpenChange(false);
 };
 const act = (a: string) => () => {
 onQuickAction?.(a);
 onOpenChange(false);
 };
 return [
 // ناوبری — متناسب با NAV_ITEMS سایدبار تجمیع‌شده
 { id: "nav-dashboard", label: "داشبورد", icon: LayoutDashboard, group: "انتقال سریع", action: go("dashboard"), keywords: ["home", "داشبورد"] },
 { id: "nav-invoices", label: "خرید و فروش", icon: ShoppingCart, group: "انتقال سریع", action: go("invoices"), keywords: ["فاکتور", "invoice", "فروش"] },
 { id: "nav-ecommerce", label: "فروشگاه و بازارها", icon: Store, group: "انتقال سریع", action: go("ecommerce"), keywords: ["ووکامرس", "دیجی‌کالا", "باسلام"] },
 { id: "nav-crm", label: "مشتریان (CRM)", icon: Heart, group: "انتقال سریع", action: go("crm"), keywords: ["مشتری", "crm", "پیگیری"] },
 { id: "nav-ecosystem", label: "اکوسیستم کسب‌وکار", icon: Globe, group: "انتقال سریع", action: go("ecosystem"), keywords: ["اکوسیستم", "نوباتایم", "کاتالوگ", "حساب‌یار"] },
 { id: "nav-inventory", label: "انبار و کالا", icon: Package, group: "انتقال سریع", action: go("inventory"), keywords: ["انبار", "کالا", "stock"] },
 { id: "nav-multi-currency", label: "ارز و چندارزی", icon: Coins, group: "انتقال سریع", action: go("multi-currency"), keywords: ["ارز", "نرخ", "دلار"] },
 { id: "nav-budget", label: "بودجه‌ریزی", icon: Wallet, group: "انتقال سریع", action: go("budget"), keywords: ["بودجه", "پیش‌بینی"] },
 { id: "nav-supplier-analytics", label: "تحلیل تأمین‌کنندگان", icon: Truck, group: "انتقال سریع", action: go("supplier-analytics"), keywords: ["تأمین", "vendor"] },
 { id: "nav-core", label: "هسته حسابداری", icon: BookOpen, group: "انتقال سریع", action: go("core"), keywords: ["حسابداری", "سند", "ledger", "دفتر"] },
 { id: "nav-treasury", label: "خزانه‌داری و چک", icon: Landmark, group: "انتقال سریع", action: go("treasury"), keywords: ["چک", "بانک", "صیادی"] },
 { id: "nav-tax", label: "ارزش افزوده و مالیات", icon: Receipt, group: "انتقال سریع", action: go("tax"), keywords: ["مالیات", "vat"] },
 { id: "nav-modian", label: "سامانه مودیان", icon: FileCheck, group: "انتقال سریع", action: go("modian"), keywords: ["مودیان", "دارایی"] },
 { id: "nav-payroll", label: "حقوق و دستمزد", icon: Users, group: "انتقال سریع", action: go("payroll"), keywords: ["حقوق", "پرسنل"] },
 { id: "nav-payment", label: "درگاه پرداخت", icon: CreditCard, group: "انتقال سریع", action: go("payment"), keywords: ["درگاه", "پرداخت", "زرین‌پال"] },
 { id: "nav-forecast", label: "پیش‌بینی هوشمند", icon: TrendingUp, group: "انتقال سریع", action: go("forecast"), keywords: ["پیش‌بینی", "forecast"] },
 { id: "nav-reports-builder", label: "گزارش‌ساز", icon: FileBarChart, group: "انتقال سریع", action: go("reports-builder"), keywords: ["گزارش", "report"] },
 { id: "nav-ai", label: "هوش مصنوعی", icon: Sparkles, group: "انتقال سریع", action: go("ai"), keywords: ["ai", "هوش"] },
 { id: "nav-ai-financial-suite", label: "سوپرماژول هوش مالی", icon: Sparkles, group: "انتقال سریع", action: go("ai-financial-suite"), keywords: ["سوپرماژول", "هوش مالی"] },
 { id: "nav-api", label: "API و توسعه", icon: Code2, group: "انتقال سریع", action: go("api"), keywords: ["api", "توسعه", "webhook"] },
 { id: "nav-security", label: "امنیت و کاربران", icon: ShieldCheck, group: "انتقال سریع", action: go("security"), keywords: ["امنیت", "کاربر"] },
 // ماژول‌های پنهان از سایدبار (دسترسی سریع)
 { id: "nav-manufacturing", label: "مدیریت تولیدی", icon: Factory, group: "ماژول‌های بیشتر", action: go("manufacturing"), keywords: ["تولیدی", "bom", "حکم تولید"] },
 { id: "nav-contracting", label: "مدیریت پیمانکاری", icon: HardHat, group: "ماژول‌های بیشتر", action: go("contracting"), keywords: ["پیمانکاری", "صورت‌وضعیت", "کسورات", "پروژه"] },
 { id: "nav-loyalty", label: "باشگاه مشتریان", icon: Crown, group: "ماژول‌های بیشتر", action: go("loyalty"), keywords: ["وفاداری", "امتیاز", "تخفیف"] },
 { id: "nav-reminders", label: "یادآورهای هوشمند", icon: Bell, group: "ماژول‌های بیشتر", action: go("reminders"), keywords: ["یادآور", "هشدار", "سررسید"] },
 { id: "nav-workflow", label: "اتوماسیون گردش کار", icon: BarChart3, group: "ماژول‌های بیشتر", action: go("workflow"), keywords: ["اتوماسیون", "workflow", "گردش کار"] },
 { id: "nav-marketplace", label: "بازار اپلیکیشن", icon: ShoppingBag, group: "ماژول‌های بیشتر", action: go("marketplace"), keywords: ["مارکت", "اپ", "افزونه"] },
 { id: "nav-mobile", label: "اپلیکیشن موبایل", icon: Smartphone, group: "ماژول‌های بیشتر", action: go("mobile"), keywords: ["موبایل", "ios", "android", "pwa"] },
 // FIX: پالت فرمان فقط ۳۳ اکشن داشت در حالی که app-shell از ۶۳ ماژول پشتیبانی
 // می‌کند — ماژول‌های مهمِ زیر عملاً از Cmd+K غیرقابل دسترس بودند.
 { id: "nav-tax-filing", label: "اظهارنامه مالیاتی", icon: FileText, group: "ماژول‌های بیشتر", action: go("tax-filing"), keywords: ["اظهارنامه", "مالیات", "vat", "filing"] },
 { id: "nav-smart-dashboard", label: "داشبورد هوشمند", icon: LayoutDashboard, group: "ماژول‌های بیشتر", action: go("smart-dashboard"), keywords: ["هوشمند", "smart", "ویجت"] },
 { id: "nav-nl-query", label: "پرس‌وجوی زبان طبیعی", icon: Sparkles, group: "ماژول‌های بیشتر", action: go("nl-query"), keywords: ["زبان طبیعی", "سوال", "nl", "query", "sql"] },
 { id: "nav-data-import-export", label: "واردات و صادرکرد داده", icon: Download, group: "ماژول‌های بیشتر", action: go("data-import-export"), keywords: ["import", "export", "csv", "excel", "پشتیبان"] },
 { id: "nav-custom-report-builder", label: "سازنده گزارش پیشرفته", icon: FileBarChart, group: "ماژول‌های بیشتر", action: go("custom-report-builder"), keywords: ["گزارش سفارشی", "builder", "تجمیع"] },
 { id: "nav-forecast-dashboard", label: "داشبورد پیش‌بینی", icon: TrendingUp, group: "ماژول‌های بیشتر", action: go("forecast-dashboard"), keywords: ["پیش‌بینی", "forecast", "جریان نقدی"] },
 { id: "nav-anomaly-dashboard", label: "داشبورد ناهنجاری", icon: AlertTriangle, group: "ماژول‌های بیشتر", action: go("anomaly-dashboard"), keywords: ["ناهنجاری", "تقلب", "anomaly", "z-score"] },
 { id: "nav-document-templates", label: "قالب‌های سند", icon: FileText, group: "ماژول‌های بیشتر", action: go("document-templates"), keywords: ["قالب", "سند", "template", "چاپ فاکتور"] },
 { id: "nav-email-templates", label: "قالب‌های ایمیل", icon: Mail, group: "ماژول‌های بیشتر", action: go("email-templates"), keywords: ["ایمیل", "template", "پیام"] },
 { id: "nav-sms-templates", label: "قالب‌های پیامک", icon: MessageSquare, group: "ماژول‌های بیشتر", action: go("sms-templates"), keywords: ["پیامک", "sms", "template"] },
 { id: "nav-workflow-editor", label: "ویرایشگر بصری اتوماسیون", icon: Workflow, group: "ماژول‌های بیشتر", action: go("workflow-editor"), keywords: ["گردش کار", "ویرایشگر", "workflow", "اتوماسیون بصری"] },
 { id: "nav-webhook-manager", label: "مدیریت Webhook", icon: Webhook, group: "ماژول‌های بیشتر", action: go("webhook-manager"), keywords: ["وبهوک", "webhook", "رویداد"] },
 { id: "nav-data-notebook", label: "دفترچه تحلیل داده", icon: BookOpen, group: "ماژول‌های بیشتر", action: go("data-notebook"), keywords: ["دفترچه", "notebook", "تحلیل", "کد"] },
 { id: "nav-app-marketplace", label: "بازار اپ و پورتال توسعه‌دهنده", icon: ShoppingBag, group: "ماژول‌های بیشتر", action: go("app-marketplace"), keywords: ["مارکت", "اپ", "third-party", "developer"] },
 { id: "nav-partner-program", label: "برنامه همکاران", icon: Handshake, group: "ماژول‌های بیشتر", action: go("partner-program"), keywords: ["همکار", "همکاری در فروش", "referral"] },
 { id: "nav-multi-currency-report", label: "گزارش چندارزی", icon: Coins, group: "ماژول‌های بیشتر", action: go("multi-currency-report"), keywords: ["ارز", "گزارش", "دلار", "یورو"] },
 { id: "nav-ocr-batch", label: "استخراج دسته‌ای فاکتور", icon: FileSearch, group: "ماژول‌های بیشتر", action: go("ocr-batch"), keywords: ["ocr", "دسته", "تصویر فاکتور"] },
 { id: "nav-cross-service", label: "داشبورد یکپارچه اکوسیستم", icon: Layers, group: "ماژول‌های بیشتر", action: go("cross-service"), keywords: ["یکپارچه", "اکوسیستم", "سرویس‌ها"] },
 { id: "nav-ltv-dashboard", label: "داشبورد LTV", icon: TrendingUp, group: "ماژول‌های بیشتر", action: go("ltv-dashboard"), keywords: ["ltv", "ارزش مشتری", "عمر"] },
 { id: "nav-tags-analytics", label: "تحلیل برچسب‌ها", icon: Tags, group: "ماژول‌های بیشتر", action: go("tags-analytics"), keywords: ["برچسب", "تگ", "تحلیل"] },
 { id: "nav-security-training", label: "آموزش امنیتی", icon: GraduationCap, group: "ماژول‌های بیشتر", action: go("security-training"), keywords: ["آموزش", "امنیت", "کوییز"] },
 { id: "nav-biometric-login", label: "ورود بیومتریک", icon: Fingerprint, group: "ماژول‌های بیشتر", action: go("biometric-login"), keywords: ["بیومتریک", "اثر انگشت", "webauthn"] },
 { id: "nav-email-queue", label: "صف ایمیل", icon: Mail, group: "ماژول‌های بیشتر", action: go("email-queue"), keywords: ["صف", "ایمیل", "queue", "ارسال"] },
 { id: "nav-print-templates", label: "قالب‌های چاپ", icon: Printer, group: "ماژول‌های بیشتر", action: go("print-templates"), keywords: ["چاپ", "print", "قالب"] },
 { id: "nav-forecast-comparison", label: "مقایسه پیش‌بینی‌ها", icon: GitCompare, group: "ماژول‌های بیشتر", action: go("forecast-comparison"), keywords: ["مقایسه", "پیش‌بینی", "mape"] },
 { id: "nav-ab-test-calculator", label: "محاسبه‌گر تست A/B", icon: Calculator, group: "ماژول‌های بیشتر", action: go("ab-test-calculator"), keywords: ["تست", "ab", "آزمایش", "نمونه"] },
 // اقدامات سریع
 { id: "act-new-invoice", label: "فاکتور فروش جدید", hint: "ایجاد", icon: Plus, group: "اقدامات سریع", action: act("new-invoice"), keywords: ["فاکتور جدید", "ثبت"] },
 { id: "act-new-product", label: "تعریف کالای جدید", icon: Plus, group: "اقدامات سریع", action: act("new-product") },
 { id: "act-new-journal", label: "ثبت سند حسابداری", icon: FileText, group: "اقدامات سریع", action: act("new-journal") },
 { id: "act-send-modian", label: "ارسال فاکتورها به مودیان", icon: FileCheck, group: "اقدامات سریع", action: act("send-modian") },
 // تنظیمات
 { id: "set-theme", label: theme === "dark"? "روشن کردن صفحه": "تاریک کردن صفحه", icon: theme === "dark"? Sun: Moon, group: "تنظیمات", action: () => { setTheme(theme === "dark"? "light": "dark"); onOpenChange(false); } },
 { id: "set-settings", label: "تنظیمات سیستم", icon: Settings, group: "تنظیمات", action: () => onOpenChange(false) },
 ];
 }, [onNavigate, onOpenChange, onQuickAction, setTheme, theme]);

 // ============ فیلتر ناوبری ============
 const filteredNav = React.useMemo(() => {
 if (!query.trim()) return items;
 const q = query.toLowerCase();
 return items.filter(
 (item) =>
 item.label.toLowerCase().includes(q) ||
 item.keywords?.some((k) => k.toLowerCase().includes(q)) ||
 item.group.toLowerCase().includes(q)
 );
 }, [items, query]);

 // ============ جستجوی داده‌ها با Debounce ۳۰۰ms ============
 React.useEffect(() => {
 const q = query.trim();
 if (!q || q.length < 2 ||!token) {
 setDataResults([]);
 setDataLoading(false);
 return;
 }
 setDataLoading(true);
 const controller = new AbortController();
 const t = setTimeout(async () => {
 try {
 const res = await fetch(
 `/api/search?q=${encodeURIComponent(q)}&limit=8`,
 {
 signal: controller.signal,
 headers: {
 Authorization: `Bearer ${token}`,
 "Content-Type": "application/json",
 },
 }
 );
 if (!res.ok) {
 setDataResults([]);
 return;
 }
 const data = await res.json();
 if (data?.success && Array.isArray(data.results)) {
 setDataResults(data.results);
 } else {
 setDataResults([]);
 }
 } catch (err) {
 if ((err as Error).name!== "AbortError") {
 setDataResults([]);
 }
 } finally {
 setDataLoading(false);
 }
 }, 300);
 return () => {
 clearTimeout(t);
 controller.abort();
 };
 }, [query, token]);

 // ============ گروه‌بندی: جستجوهای اخیر + ناوبری + داده ============
 const grouped = React.useMemo(() => {
 const g: Record<string, CommandItem[]> = {};

 // جستجوهای اخیر (فقط وقتی query خالی است)
 if (!query.trim() && searchHistory.length > 0) {
 g["جستجوهای اخیر"] = searchHistory.map((q, i) => ({
 id: `history-${i}`,
 label: q,
 icon: Search,
 group: "جستجوهای اخیر",
 action: () => {
 setQuery(q);
 addToSearchHistory(q);
 },
 keywords: [q],
 hint: "اخیر",
 }));
 }

 for (const item of filteredNav) {
 if (!g[item.group]) g[item.group] = [];
 g[item.group].push(item);
 }
 // افزودن نتایج داده به‌عنوان گروه «جستجو در داده‌ها»
 if (dataResults.length > 0 || dataLoading) {
 const dataItems: CommandItem[] = dataResults.map((r) => {
 const meta = ENTITY_META[r.entityType]?? ENTITY_META.invoice;
 return {
 id: `data-${r.entityType}-${r.id}`,
 label: r.title,
 hint: r.snippet,
 icon: meta.icon,
 group: "جستجو در داده‌ها",
 action: () => {
 onNavigate(meta.module);
 onOpenChange(false);
 },
 keywords: [meta.label, r.snippet],
 entityLabel: meta.label,
 };
 });
 g["جستجو در داده‌ها"] = dataItems;
 }
 return g;
 }, [filteredNav, dataResults, dataLoading, onNavigate, onOpenChange, query, searchHistory]);

 // ============ شمارش کل آیتم‌ها برای keyboard nav ============
 const totalCount = React.useMemo(() => {
 return Object.values(grouped).reduce((s, items) => s + items.length, 0);
 }, [grouped]);

 // ============ ریست state هنگام باز شدن ============
 React.useEffect(() => {
 if (open) {
 setQuery("");
 setActiveIndex(0);
 setDataResults([]);
 setDataLoading(false);
 setSearchHistory(loadSearchHistory());
 const t = setTimeout(() => inputRef.current?.focus(), 50);
 return () => clearTimeout(t);
 }
 }, [open]);

 React.useEffect(() => {
 setActiveIndex(0);
 }, [query, dataResults]);

 // ============ keyboard nav: Enter ============
 React.useEffect(() => {
 if (!open) return;
 const onKey = (e: KeyboardEvent) => {
 if (e.key === "ArrowDown") {
 e.preventDefault();
 setActiveIndex((i) => Math.min(i + 1, Math.max(0, totalCount - 1)));
 } else if (e.key === "ArrowUp") {
 e.preventDefault();
 setActiveIndex((i) => Math.max(i - 1, 0));
 } else if (e.key === "Enter") {
 e.preventDefault();
 // ثبت جستجو در تاریخچه
 if (query.trim()) {
 addToSearchHistory(query.trim());
 setSearchHistory(loadSearchHistory());
 }
 // پیدا کردن آیتم فعال
 let idx = 0;
 for (const groupItems of Object.values(grouped)) {
 for (const item of groupItems) {
 if (idx === activeIndex) {
 item.action();
 return;
 }
 idx++;
 }
 }
 }
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [open, grouped, activeIndex, totalCount]);

 // اسکرول به آیتم فعال
 React.useEffect(() => {
 const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
 el?.scrollIntoView({ block: "nearest" });
 }, [activeIndex]);

 const hasAnyResults = totalCount > 0 || dataLoading;
 let runningIdx = -1;

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 {/* FIX(21-C — موبایل): پالت فرمان ۹۵vw مرکز‌چین (قانون ≤640px در globals.css
 جایگزین top:15vh می‌شود)؛ لیست نتایج با dvh تا کیبورد موبایل آن را نبلعد. */}
 <DialogContent
 className="w-[95vw] sm:w-full max-w-xl p-0 gap-0 overflow-hidden rounded-2xl border-border shadow-2xl"
 style={{ top: "15vh" }}
 >
 <DialogTitle className="sr-only">Command Palette</DialogTitle>
 {/* ورودی جستجو */}
 <div className="flex items-center gap-3 border-b border-border px-4">
 <Search className="h-4 w-4 text-muted-foreground shrink-0" />
 {/* text-base روی موبایل: iOS هنگام فوکوس، input با فونت <16px را زوم می‌کند */}
 <input
 ref={inputRef}
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 placeholder="جستجو در ماژول‌ها و داده‌ها..."
 role="combobox"
 aria-expanded={open}
 aria-controls="command-palette-listbox"
 aria-autocomplete="list"
 aria-label="جستجو در دستورات و داده‌ها"
 className="flex-1 bg-transparent py-4 text-base sm:text-sm outline-none placeholder:text-muted-foreground"
 />
 {dataLoading && (
 <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-label="در حال جستجو" />
 )}
 <kbd className="hidden sm:flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
 <Command className="h-2.5 w-2.5" />K
 </kbd>
 </div>

 {/* نتایج */}
 <div
 ref={listRef}
 id="command-palette-listbox"
 role="listbox"
 aria-label="نتایج جستجو"
 className="max-h-[55dvh] sm:max-h-[60vh] overflow-y-auto p-2 custom-scroll overscroll-contain"
 >
 {!hasAnyResults? (
 <div className="py-12 text-center text-sm text-muted-foreground">
 {query.trim()
? "نتیجه‌ای یافت نشد"
: "برای شروع، چیزی تایپ کنید یا یکی از موارد زیر را انتخاب کنید"}
 </div>
 ): (
 Object.entries(grouped).map(([group, groupItems]) => {
 if (groupItems.length === 0 && group!== "جستجو در داده‌ها") return null;
 return (
 <div key={group} className="mb-1">
 <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
 {group}
 {group === "جستجو در داده‌ها" && dataResults.length > 0 && (
 <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded">
 {toPersianDigits(dataResults.length)}
 </span>
 )}
 </p>
 {groupItems.length === 0 && dataLoading? (
 <div className="px-2.5 py-3 text-xs text-muted-foreground flex items-center gap-2">
 <Loader2 className="h-3 w-3 animate-spin" />
 در حال جستجوی داده‌ها...
 </div>
 ): (
 groupItems.map((item) => {
 runningIdx++;
 const idx = runningIdx;
 const active = idx === activeIndex;
 const Icon = item.icon;
 return (
 <button
 key={item.id}
 data-idx={idx}
 role="option"
 aria-selected={active}
 onMouseEnter={() => setActiveIndex(idx)}
 onClick={item.action}
 className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${
 active
? "bg-accent text-accent-foreground"
: "text-foreground hover:bg-muted"
 }`}
 >
 <Icon
 className={`h-4 w-4 shrink-0 ${
 active? "text-primary": "text-muted-foreground"
 }`}
 />
 <div className="flex-1 min-w-0 text-start">
 <div className="flex items-center gap-2">
 <span className="truncate">{highlightMatch(item.label, query)}</span>
 {item.entityLabel && (
 <span className="text-[9px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
 {item.entityLabel}
 </span>
 )}
 </div>
 {item.hint && (
 <div className="text-[11px] text-muted-foreground truncate mt-0.5">
 {item.hint}
 </div>
 )}
 </div>
 {active && (
 <CornerDownLeft className="h-3 w-3 text-muted-foreground shrink-0" />
 )}
 </button>
 );
 })
 )}
 </div>
 );
 })
 )}
 </div>

 {/* فوتر */}
 <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
 <div className="flex items-center gap-3 flex-wrap">
 <span className="flex items-center gap-1">
 <kbd className="rounded border border-border bg-muted px-1"></kbd>
 انتخاب
 </span>
 <span className="flex items-center gap-1">
 <kbd className="rounded border border-border bg-muted px-1"></kbd>
 اجرا
 </span>
 <span className="flex items-center gap-1">
 <kbd className="rounded border border-border bg-muted px-1">esc</kbd>
 بستن
 </span>
 {searchHistory.length > 0 && (
 <button
 type="button"
 onClick={() => { clearSearchHistory(); setSearchHistory([]); }}
 className="text-muted-foreground/60 hover:text-destructive transition-colors"
 >
 پاک‌سازی تاریخچه
 </button>
 )}
 </div>
 <span className="flex items-center gap-1">
 <Sparkles className="h-3 w-3" />
 هوش
 </span>
 </div>
 </DialogContent>
 </Dialog>
 );
}

function highlightMatch(text: string, query: string) {
 if (!query.trim()) return text;
 const idx = text.toLowerCase().indexOf(query.toLowerCase());
 if (idx === -1) return text;
 return (
 <>
 {text.slice(0, idx)}
 <mark className="cmdk-highlight bg-primary/20 text-foreground rounded px-0.5">
 {text.slice(idx, idx + query.length)}
 </mark>
 {text.slice(idx + query.length)}
 </>
 );
}
