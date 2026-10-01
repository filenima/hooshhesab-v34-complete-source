"use client";

/**
 * Module Prewarm — پیش‌بارگذاری هوشمند چانک ماژول‌ها
 * =====================================================
 *
 * هدف: «سریع‌ترین زمان بین قسمت‌ها» — وقتی کاربر روی یک ماژول در
 * سایدبار/ناوبری پایین موبایل کلیک می‌کند، چانک آن از قبل دانلود شده
 * باشد و سوئیچ «آنی» حس شود.
 *
 * مکانیزم:
 * - import() داینامیک همان ماژول‌هایی است که next/dynamic لود می‌کند
 * (باندلر promise را dedupe می‌کند — بدون دانلود مضاعف)
 * - requestIdleCallback: پیش‌گرم بعد از رندر اولیه، وقتی مرورگر بیکار است
 * (اولویت با محتوای صفحه است — سرعت اولین رندر خراب نمی‌شود)
 * - dedupe با Set سراسری + بازیابی خودکار از خطای شبکه (silent)
 *
 * استراتژی پیش‌گرم:
 * 1) prewarmCoreMobile — بعد از ورود به پنل در idle: ۵ ماژول پرکاربرد
 * 2) prewarmModule(id) — هنگام hover/pointerdown روی آیتم ناوبری
 * 3) prewarmMarketing — صفحات مارکتینگ (در لندینگ) برای ورود سریع به اپ
 */

const prewarmed = new Set<string>();

/**
 * DEV GUARD: در محیط توسعه prewarm غیرفعال است —
 * هر import() در dev باعث کامپایل ماژول + HMR refresh می‌شود و
 * چرخه‌ی remount/فشار حافظه ایجاد می‌کند (سرور با RAM محدود می‌میرد).
 * در production چانک‌ها از قبل build شده‌اند و prewarm = صرفاً دانلود سریع.
 */
const PREWARM_ENABLED =
 typeof window !== "undefined" && process.env.NODE_ENV === "production";

// نقشه import همه ماژول‌ها — همان specifier های retryLazy در app-shell
// (Turbopack/Webpack این درخواست‌ها را با dynamic import های app-shell
// یکی می‌داند؛ پس chunk مشترک است و دانلود تکراری رخ نمی‌دهد)
const MODULE_IMPORTS: Record<string, () => Promise<unknown>> = {
 dashboard: () => import("@/components/modules/dashboard"),
 invoices: () => import("@/components/modules/invoices"),
 "quick-invoice": () => import("@/components/modules/quick-invoice"),
 "quick-expense": () => import("@/components/modules/quick-expense"),
 "end-of-day": () => import("@/components/modules/end-of-day"),
 core: () => import("@/components/modules/core-accounting"),
 inventory: () => import("@/components/modules/inventory"),
 crm: () => import("@/components/modules/crm"),
 treasury: () => import("@/components/modules/treasury"),
 payroll: () => import("@/components/modules/payroll"),
 tax: () => import("@/components/modules/tax"),
 modian: () => import("@/components/modules/modian"),
 "reports-builder": () => import("@/components/modules/reports-builder"),
 ai: () => import("@/components/modules/ai-module"),
 calculator: () => import("@/components/ux/accounting-calculator"),
 settings: () => import("@/components/ux/settings-dialog"),
 budget: () => import("@/components/modules/budget-planning"),
 "time-attendance": () => import("@/components/modules/time-attendance"),
 "leave-management": () => import("@/components/modules/leave-management"),
 "annual-bonus": () => import("@/components/modules/annual-bonus"),
 "employee-portal": () => import("@/components/modules/employee-portal"),
};

/** پیش‌گرم یک ماژول مشخص (ایده‌آل: hover یا pointerdown قبل از کلیک) */
export function prewarmModule(id: string): void {
 if (typeof window === "undefined") return;
 if (!PREWARM_ENABLED) return;
 if (prewarmed.has(id)) return;
 const importer = MODULE_IMPORTS[id];
 if (!importer) return;
 prewarmed.add(id);
 // خطا را بی‌صدا قورت بده — prefetch هرگز نباید UX را بشکند
 importer().catch(() => {
 // در صورت شکست شبکه اجازه بده دوباره تلاش شود
 prewarmed.delete(id);
 });
}

/**
 * پیش‌گرم هسته موبایل — بعد از ورود به پنل، در زمان بیکاری مرورگر
 * ۵ ماژول پرکاربردِ نوار پایین موبایل + فاکتور سریع را دانلود می‌کند
 * تا سوئیچ بین قسمت‌ها آنی باشد.
 */
export function prewarmCoreMobile(): void {
 if (typeof window === "undefined") return;
 if (!PREWARM_ENABLED) return;
 const core = ["dashboard", "invoices", "inventory", "reports-builder", "quick-invoice"];
 const run = () => {
 for (const id of core) prewarmModule(id);
 };
 if ("requestIdleCallback" in window) {
 (window as Window & {
 requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
 }).requestIdleCallback(run, { timeout: 3500 });
 } else {
 setTimeout(run, 1800);
 }
}

/**
 * پیش‌گرم تدریجی باقی ماژول‌ها — دیرتر از core (اولویت پایین‌تر)
 * فقط وقتی واقعاً بیکار باشیم، با فاصله بین هر ماژول
 */
export function prewarmSecondaryModules(): void {
 if (typeof window === "undefined") return;
 if (!PREWARM_ENABLED) return;
 const secondary = [
 "quick-expense",
 "end-of-day",
 "modian",
 "crm",
 "treasury",
 "tax",
 "payroll",
 "ai",
 "core",
 ];
 let i = 0;
 const step = () => {
 if (i >= secondary.length) return;
 prewarmModule(secondary[i]);
 i++;
 if ("requestIdleCallback" in window) {
 (window as Window & {
 requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
 }).requestIdleCallback(step, { timeout: 6000 });
 } else {
 setTimeout(step, 1200);
 }
 };
 if ("requestIdleCallback" in window) {
 (window as Window & {
 requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
 }).requestIdleCallback(step, { timeout: 8000 });
 } else {
 setTimeout(step, 4000);
 }
}

/** پاک‌سازی وضعیت (برای تست) */
export function resetPrewarmState(): void {
 prewarmed.clear();
}
