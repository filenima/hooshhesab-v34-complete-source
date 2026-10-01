"use client";

import * as React from "react";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Star, X } from "lucide-react";

/**
 * ShortcutHandler — تابعی که هنگام فشرده شدن کلید اجرا می‌شود.
 * می‌تواند یک actions بازگشتی باشد تا دیالوگ/فرم را باز کند.
 */
export type ShortcutHandler = () => void;

export interface ShortcutDefinition {
 /** کلید ترکیبی، مثل "alt+n" — case-insensitive */
 combo: string;
 /** توضیح فارسی برای راهنما */
 description: string;
 /** نمایش خوانا برای راهنما */
 display: string;
 /** دسته‌بندی */
 category?: "navigation" | "actions" | "general";
 /** شناسه ماژول (برای مورد علاقه‌ها) */
 moduleId?: string;
 handler: ShortcutHandler;
}

interface KeyboardShortcutsContextValue {
 shortcuts: ShortcutDefinition[];
 register: (s: ShortcutDefinition) => () => void;
 showHelp: () => void;
 /** موردعلاقه‌ها */
 favorites: string[];
 toggleFavorite: (moduleId: string) => void;
 isFavorite: (moduleId: string) => boolean;
}

const KeyboardShortcutsContext = React.createContext<KeyboardShortcutsContextValue | null>(null);

/**
 * useKeyboardShortcuts — هوک دسترسی به context میانبرها
 */
export function useKeyboardShortcuts() {
 const ctx = React.useContext(KeyboardShortcutsContext);
 if (!ctx) {
 throw new Error("useKeyboardShortcuts باید داخل <KeyboardShortcutsProvider> استفاده شود");
 }
 return ctx;
}

/* ============================================================
 مدیریت موردعلاقه‌ها با localStorage
 ============================================================ */
const FAVORITES_KEY = "hoshhesab_favorites";

function loadFavorites(): string[] {
 if (typeof window === "undefined") return [];
 try {
 const raw = localStorage.getItem(FAVORITES_KEY);
 if (raw) return JSON.parse(raw) as string[];
 } catch { /* ignore */ }
 return [];
}

function saveFavorites(favs: string[]) {
 try {
 localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
 } catch { /* ignore */ }
}

interface PendingSequence {
 key: string;
 timestamp: number;
}

/**
 * KeyboardShortcuts — کامپوننت Provider که میانبرهای سراسری را ثبت و اجرا می‌کند.
 *
 * شامل:
 * - Ctrl+N / Alt+N: فاکتور جدید
 * - Ctrl+S: ذخیره (ارسال فرم فعال)
 * - Ctrl+P: چاپ
 * - Ctrl+/: جستجوی پیشرفته
 * - Ctrl+,: تنظیمات
 * - /: تمرکز روی جستجو
 * -?: نمایش راهنما
 * - Esc: بستن دیالوگ باز
 * - G سپس D: داشبورد (vim-style)
 * - G سپس I: فاکتورها (vim-style)
 * + موردعلاقه‌ها: pin/unpin ماژول‌ها
 *
 * @example
 * <KeyboardShortcuts
 * onNewInvoice={() => setInvoiceOpen(true)}
 * onPrint={() => window.print()}
 * onExport={() => exportToCSV(...)}
 * onSettings={() => setSettingsOpen(true)}
 * onNavigate={(id) => setActiveModule(id)}
 * />
 */
export function KeyboardShortcuts({
 onNewInvoice,
 onPrint,
 onExport,
 onSettings,
 onNavigate,
 onSearchFocus,
 onCloseDialog,
 onSubmitForm,
 children,
}: {
 onNewInvoice?: () => void;
 onPrint?: () => void;
 onExport?: () => void;
 onSettings?: () => void;
 onNavigate?: (id: string) => void;
 onSearchFocus?: () => void;
 onCloseDialog?: () => void;
 onSubmitForm?: () => void;
 children?: React.ReactNode;
}) {
 const [shortcuts, setShortcuts] = React.useState<ShortcutDefinition[]>([]);
 const [helpOpen, setHelpOpen] = React.useState(false);
 const [favorites, setFavorites] = React.useState<string[]>(loadFavorites);
 const pendingRef = React.useRef<PendingSequence | null>(null);
 const shortcutsRef = React.useRef<ShortcutDefinition[]>([]);
 const handlersRef = React.useRef<{
 onNewInvoice?: () => void;
 onPrint?: () => void;
 onExport?: () => void;
 onSettings?: () => void;
 onNavigate?: (id: string) => void;
 onSearchFocus?: () => void;
 onCloseDialog?: () => void;
 onSubmitForm?: () => void;
 }>({});

 // نگه‌داری آخرین propها در ref تا listener همیشه جدید باشد بدون re-bind
 React.useEffect(() => {
 handlersRef.current = {
 onNewInvoice,
 onPrint,
 onExport,
 onSettings,
 onNavigate,
 onSearchFocus,
 onCloseDialog,
 onSubmitForm,
 };
 }, [
 onNewInvoice,
 onPrint,
 onExport,
 onSettings,
 onNavigate,
 onSearchFocus,
 onCloseDialog,
 onSubmitForm,
 ]);

 // ثبت میانبر پیش‌فرض داخلی
 React.useEffect(() => {
 const defaults: ShortcutDefinition[] = [
 {
 combo: "ctrl+n",
 description: "ایجاد فاکتور جدید",
 display: "Ctrl + N",
 category: "actions",
 moduleId: "invoices",
 handler: () => handlersRef.current.onNewInvoice?.(),
 },
 {
 combo: "alt+n",
 description: "ایجاد فاکتور جدید (جایگزین)",
 display: "Alt + N",
 category: "actions",
 moduleId: "invoices",
 handler: () => handlersRef.current.onNewInvoice?.(),
 },
 {
 combo: "ctrl+s",
 description: "ذخیره فرم فعال",
 display: "Ctrl + S",
 category: "actions",
 handler: () => handlersRef.current.onSubmitForm?.(),
 },
 {
 combo: "ctrl+p",
 description: "چاپ / خروجی PDF",
 display: "Ctrl + P",
 category: "actions",
 handler: () => handlersRef.current.onPrint?.(),
 },
 {
 combo: "ctrl+e",
 description: "خروجی گرفتن (CSV/Excel)",
 display: "Ctrl + E",
 category: "actions",
 moduleId: "export",
 handler: () => handlersRef.current.onExport?.(),
 },
 {
 combo: "ctrl+/",
 description: "باز کردن جستجوی پیشرفته",
 display: "Ctrl + /",
 category: "general",
 handler: () => handlersRef.current.onSearchFocus?.(),
 },
 {
 combo: "/",
 description: "تمرکز روی جستجو",
 display: "/",
 category: "general",
 handler: () => handlersRef.current.onSearchFocus?.(),
 },
 {
 combo: "?",
 description: "نمایش راهنمای میانبرها",
 display: "?",
 category: "general",
 handler: () => setHelpOpen(true),
 },
 {
 combo: "meta+,",
 description: "باز کردن تنظیمات",
 display: "Cmd + ,",
 category: "general",
 moduleId: "settings",
 handler: () => handlersRef.current.onSettings?.(),
 },
 {
 combo: "ctrl+,",
 description: "باز کردن تنظیمات",
 display: "Ctrl + ,",
 category: "general",
 moduleId: "settings",
 handler: () => handlersRef.current.onSettings?.(),
 },
 {
 combo: "escape",
 description: "بستن دیالوگ/پنجره باز",
 display: "Esc",
 category: "general",
 handler: () => {
 handlersRef.current.onCloseDialog?.();
 },
 },
 {
 combo: "g>d",
 description: "رفتن به داشبورد",
 display: "G سپس D",
 category: "navigation",
 moduleId: "dashboard",
 handler: () => handlersRef.current.onNavigate?.("dashboard"),
 },
 {
 combo: "g>i",
 description: "رفتن به فاکتورها",
 display: "G سپس I",
 category: "navigation",
 moduleId: "invoices",
 handler: () => handlersRef.current.onNavigate?.("invoices"),
 },
 ];

 setShortcuts(defaults);
 shortcutsRef.current = defaults;
 }, []);

 // ===== Favorites management =====
 const toggleFavorite = React.useCallback((moduleId: string) => {
 setFavorites((prev) => {
 const next = prev.includes(moduleId)
? prev.filter((id) => id!== moduleId)
: [...prev, moduleId];
 saveFavorites(next);
 return next;
 });
 }, []);

 const isFavorite = React.useCallback(
 (moduleId: string) => favorites.includes(moduleId),
 [favorites]
 );

 const register = React.useCallback((s: ShortcutDefinition) => {
 setShortcuts((prev) => [...prev, s]);
 shortcutsRef.current = [...shortcutsRef.current, s];
 return () => {
 setShortcuts((prev) => prev.filter((x) => x.combo!== s.combo || x.description!== s.description));
 shortcutsRef.current = shortcutsRef.current.filter(
 (x) => x.combo!== s.combo || x.description!== s.description
 );
 };
 }, []);

 // گوش دادن به رویداد سفارشی «show-shortcuts-help» (از منوی پروفایل)
 React.useEffect(() => {
 const onCustomHelp = () => setHelpOpen(true);
 window.addEventListener(
 "hoshhesab:show-shortcuts-help",
 onCustomHelp as EventListener
 );
 return () =>
 window.removeEventListener(
 "hoshhesab:show-shortcuts-help",
 onCustomHelp as EventListener
 );
 }, []);

 // listener سراسری
 React.useEffect(() => {
 const onKeyDown = (e: KeyboardEvent) => {
 const target = e.target as HTMLElement | null;
 const isInput =
 target &&
 (target.tagName === "INPUT" ||
 target.tagName === "TEXTAREA" ||
 target.isContentEditable);

 // ساخت کلید ترکیبی نرمالایز شده
 const parts: string[] = [];
 if (e.altKey) parts.push("alt");
 if (e.ctrlKey) parts.push("ctrl");
 if (e.metaKey) parts.push("meta");
 if (e.shiftKey) parts.push("shift");
 const key = e.key.toLowerCase();
 parts.push(key);
 const combo = parts.join("+");

 // Escape — همیشه پاسخ بده (حتی در input)
 if (key === "escape") {
 findAndRun("escape");
 return;
 }

 // میانبرهای تک‌کلیدی: فقط وقتی در input نیستیم
 if (!isInput) {
 if (key === "/" &&!e.altKey &&!e.ctrlKey &&!e.metaKey) {
 e.preventDefault();
 findAndRun("/");
 return;
 }
 if (key === "?" &&!e.altKey &&!e.ctrlKey &&!e.metaKey) {
 e.preventDefault();
 findAndRun("?");
 return;
 }
 // vim-style: g سپس d/i
 if (key === "g" &&!e.altKey &&!e.ctrlKey &&!e.metaKey) {
 pendingRef.current = { key: "g", timestamp: Date.now() };
 return;
 }
 if (pendingRef.current?.key === "g" && Date.now() - pendingRef.current.timestamp < 800) {
 if (key === "d") {
 e.preventDefault();
 findAndRun("g>d");
 pendingRef.current = null;
 return;
 }
 if (key === "i") {
 e.preventDefault();
 findAndRun("g>i");
 pendingRef.current = null;
 return;
 }
 }
 pendingRef.current = null;
 }

 // Ctrl/Cmd+N — فاکتور جدید (حتی در input)
 if ((e.ctrlKey || e.metaKey) && key === "n") {
 e.preventDefault();
 findAndRun("ctrl+n");
 return;
 }

 // Ctrl/Cmd+S — ذخیره فرم
 if ((e.ctrlKey || e.metaKey) && key === "s") {
 e.preventDefault();
 findAndRun("ctrl+s");
 return;
 }

 // Ctrl/Cmd+P — چاپ
 if ((e.ctrlKey || e.metaKey) && key === "p") {
 e.preventDefault();
 findAndRun("ctrl+p");
 return;
 }

 // Ctrl/Cmd+/ — جستجوی پیشرفته
 if ((e.ctrlKey || e.metaKey) && key === "/") {
 e.preventDefault();
 findAndRun("ctrl+/");
 return;
 }

 // Ctrl/Cmd+, — تنظیمات
 if ((e.ctrlKey || e.metaKey) && key === ",") {
 e.preventDefault();
 findAndRun("ctrl+,");
 return;
 }

 // در input، فقط Alt+E و Ctrl/Cmd+, قبلاً پاسخ داده شد
 if (isInput) {
 return;
 }

 // Alt+N/P/E (legacy)
 if (e.altKey && (key === "n" || key === "p" || key === "e")) {
 e.preventDefault();
 findAndRun(combo);
 return;
 }

 // پاکسازی pending اگر کلید غیرمرتبط
 if (key!== "g") {
 pendingRef.current = null;
 }
 };

 function findAndRun(combo: string) {
 const s = shortcutsRef.current.find((x) => x.combo === combo);
 if (s) {
 try {
 s.handler();
 } catch (err) {
 console.error("shortcut handler error:", err);
 }
 }
 }

 window.addEventListener("keydown", onKeyDown);
 return () => window.removeEventListener("keydown", onKeyDown);
 }, []);

 const showHelp = React.useCallback(() => setHelpOpen(true), []);

 const ctxValue = React.useMemo(
 () => ({ shortcuts, register, showHelp, favorites, toggleFavorite, isFavorite }),
 [shortcuts, register, showHelp, favorites, toggleFavorite, isFavorite]
 );

 return (
 <KeyboardShortcutsContext.Provider value={ctxValue}>
 {children}
 <ShortcutsHelpDialog
 open={helpOpen}
 onOpenChange={setHelpOpen}
 shortcuts={shortcuts}
 favorites={favorites}
 toggleFavorite={toggleFavorite}
 />
 </KeyboardShortcutsContext.Provider>
 );
}

/**
 * ShortcutsHelpDialog — دیالوگ راهنمای میانبرها + موردعلاقه‌ها
 */
function ShortcutsHelpDialog({
 open,
 onOpenChange,
 shortcuts,
 favorites,
 toggleFavorite,
}: {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 shortcuts: ShortcutDefinition[];
 favorites: string[];
 toggleFavorite: (moduleId: string) => void;
}) {
 const categories: Record<string, ShortcutDefinition[]> = {};
 for (const s of shortcuts) {
 const cat = s.category?? "general";
 if (!categories[cat]) categories[cat] = [];
 categories[cat].push(s);
 }

 const catLabels: Record<string, string> = {
 navigation: "ناوبری",
 actions: "عملیات",
 general: "عمومی",
 };

 // موردعلاقه‌ها: میانبرهایی که moduleId دارند و در favorites هستند
 const favoriteShortcuts = shortcuts.filter(
 (s) => s.moduleId && favorites.includes(s.moduleId)
 );

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="text-base">میانبرهای صفحه‌کلید</DialogTitle>
 <DialogDescription className="text-xs">
 برای کارایی بیشتر از این میانبرها استفاده کنید
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3 max-h-[60vh] overflow-y-auto">
 {/* بخش موردعلاقه‌ها */}
 {favoriteShortcuts.length > 0 && (
 <div>
 <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1">
 <Star className="h-3 w-3 fill-primary" />
 موردعلاقه‌ها
 </p>
 <div className="space-y-1">
 {favoriteShortcuts.map((s, i) => (
 <div
 key={`fav-${i}`}
 className="flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5"
 >
 <div className="flex items-center gap-2 min-w-0">
 <span className="text-xs text-foreground truncate">{s.description}</span>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
 {s.display}
 </kbd>
 <button
 type="button"
 onClick={() => s.moduleId && toggleFavorite(s.moduleId)}
 className="text-primary hover:text-primary/60 transition-colors"
 aria-label="حذف از موردعلاقه‌ها"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {Object.entries(categories).map(([cat, items]) => (
 <div key={cat}>
 <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
 {catLabels[cat]?? cat}
 </p>
 <div className="space-y-1">
 {items.map((s, i) => (
 <div
 key={i}
 className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
 >
 <div className="flex items-center gap-2 min-w-0">
 {s.moduleId && (
 <button
 type="button"
 onClick={() => toggleFavorite(s.moduleId!)}
 className={`shrink-0 transition-colors ${
 favorites.includes(s.moduleId!)
? "text-primary"
: "text-muted-foreground/30 hover:text-muted-foreground/60"
 }`}
 aria-label={favorites.includes(s.moduleId!)? "حذف از موردعلاقه‌ها": "افزودن به موردعلاقه‌ها"}
 >
 <Star className={`h-3 w-3 ${favorites.includes(s.moduleId!)? "fill-primary": ""}`} />
 </button>
 )}
 {!s.moduleId && <span className="w-3 shrink-0" />}
 <span className="text-xs text-foreground truncate">{s.description}</span>
 </div>
 <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono shrink-0">
 {s.display}
 </kbd>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 </DialogContent>
 </Dialog>
 );
}

export default KeyboardShortcuts;
