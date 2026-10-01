// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
// ============ Micro-Frontend Architecture — هوش ============
// بارگذاری ماژول‌های remote با Module Federation (Webpack 5).
// این فایل کلاینت-تنهاست — در browser اجرا می‌شود.

"use client";

import React from "react";

// ============ Types ============

export interface RemoteModule {
 __esModule?: boolean;
 [key: string]: unknown;
}

export interface MicroAppConfig {
 name: string;
 entry: string;
 scope: string;
 module: string;
 loadedAt?: Date;
}

// رجیستری ماژول‌های ثبت‌شده
const registry = new Map<string, MicroAppConfig>();

// کش ماژول‌های بارگذاری‌شده
const moduleCache = new Map<string, RemoteModule>();

// کش promiseهای در حال اجرا برای جلوگیری از بارگذاری موازی
const pendingLoads = new Map<string, Promise<RemoteModule>>();

// ============ Helpers ============

/**
 * تزریق یک <script> به DOM برای بارگذاری remoteEntry.js.
 */
function injectScript(url: string): Promise<void> {
 return new Promise((resolve, reject) => {
 // اگر قبلاً تزریق شده، skip کن
 const existing = document.querySelector(`script[data-mf-src="${url}"]`);
 if (existing) {
 resolve();
 return;
 }

 const script = document.createElement("script");
 script.src = url;
 script.type = "text/javascript";
 script.async = true;
 script.setAttribute("data-mf-src", url);

 script.onload = () => resolve();
 script.onerror = () =>
 reject(new Error(`بارگذاری اسکریپت micro-frontend ناموفق بود: ${url}`));

 document.head.appendChild(script);
 });
}

/**
 * فراخوانی __webpack_init_sharing__ و __webpack_share_scopes__ برای مقداردهی scope.
 */
async function initSharedScope(scope: string): Promise<void> {
 // @ts-expect-error - متغیرهای جهانی Webpack
 if (!window.__webpack_init_sharing__) {
 throw new Error("Module Federation در دسترس نیست — Webpack 5 لازم است");
 }

 // @ts-expect-error - مقداردهی scope اشتراکی
 await window.__webpack_init_sharing__("default");

 const container = (window as Record<string, unknown>)[scope] as
 | { init: (arg: unknown) => Promise<void> }
 | undefined;

 if (!container?.init) {
 throw new Error(`scope موردنظر یافت نشد: ${scope}`);
 }

 // @ts-expect-error - scope اشتراکی موجود
 await container.init(window.__webpack_share_scopes__?.default);
}

// ============ Public API ============

/**
 * بارگذاری یک ماژول remote با Module Federation.
 *
 * @param url آدرس remoteEntry.js
 * @param scope نام remote (مثلاً "authApp")
 * @param module مسیر ماژول (مثلاً "./Widget")
 * @returns ماژول بارگذاری‌شده
 */
export async function loadRemoteModule(
 url: string,
 scope: string,
 module: string
): Promise<RemoteModule> {
 const cacheKey = `${url}::${scope}::${module}`;

 // اگر قبلاً بارگذاری شده، از کش برگردان
 const cached = moduleCache.get(cacheKey);
 if (cached) return cached;

 // اگر در حال بارگذاری است، به همان Promise متصل شو
 const pending = pendingLoads.get(cacheKey);
 if (pending) return pending;

 const promise = (async () => {
 await injectScript(url);
 await initSharedScope(scope);

 const container = (window as Record<string, unknown>)[scope] as
 | { get: (m: string) => () => Promise<RemoteModule> }
 | undefined;

 if (!container?.get) {
 throw new Error(`container برای scope ${scope} یافت نشد`);
 }

 const factory = container.get(module);
 const mod = await factory();
 moduleCache.set(cacheKey, mod);
 return mod;
 })();

 pendingLoads.set(cacheKey, promise);

 try {
 return await promise;
 } finally {
 pendingLoads.delete(cacheKey);
 }
}

/**
 * ثبت یک micro-app در رجیستری محلی.
 * این متد فقط متادیتا را ذخیره می‌کند — بارگذاری هنگام نیاز انجام می‌شود.
 *
 * @param name نام یکتای micro-app
 * @param entry آدرس remoteEntry.js
 */
export function registerMicroApp(name: string, entry: string): void {
 if (registry.has(name)) {
 console.warn(`[micro-frontend] ${name} قبلاً ثبت شده — بازنویسی شد`);
 }
 registry.set(name, {
 name,
 entry,
 scope: name,
 module: "./App",
 });
}

/**
 * گرفتن پیکربندی یک micro-app ثبت‌شده.
 */
export function getMicroApp(name: string): MicroAppConfig | undefined {
 return registry.get(name);
}

/**
 * لیست همه‌ی micro-app‌های ثبت‌شده.
 */
export function listMicroApps(): MicroAppConfig[] {
 return Array.from(registry.values());
}

/**
 * لغو ثبت یک micro-app و پاک کردن کش آن.
 */
export function unregisterMicroApp(name: string): void {
 const config = registry.get(name);
 if (!config) return;
 const key = `${config.entry}::${config.scope}::${config.module}`;
 moduleCache.delete(key);
 registry.delete(name);
}

// ============ React Component Wrapper ============

interface RemoteComponentProps {
 url: string;
 scope: string;
 module: string;
 fallback?: React.ReactNode;
 [key: string]: unknown;
}

/**
 * کامپوننت React برای نمایش یک ماژول remote به‌صورت lazy.
 *
 * @example
 * <RemoteComponent url="https://apps.hoosh.nobatime.ir/auth/remoteEntry.js" scope="authApp" module="./Widget" />
 */
export const RemoteComponent: React.FC<RemoteComponentProps> = ({
 url,
 scope,
 module,
 fallback,
...props
}) => {
 const [Component, setComponent] = React.useState<React.ComponentType<Record<string, unknown>> | null>(
 null
 );
 const [error, setError] = React.useState<Error | null>(null);

 React.useEffect(() => {
 let mounted = true;
 setError(null);

 loadRemoteModule(url, scope, module)
.then((mod) => {
 if (!mounted) return;
 const Comp = (mod.default?? mod) as React.ComponentType<Record<string, unknown>>;
 setComponent(() => Comp);
 })
.catch((err: Error) => {
 if (!mounted) return;
 setError(err);
 });

 return () => {
 mounted = false;
 };
 }, [url, scope, module]);

 if (error) {
 return (
 <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
 خطا در بارگذاری ماژول remote: {error.message}
 </div>
 );
 }

 if (!Component) {
 return <>{fallback?? <div className="animate-pulse text-muted-foreground">در حال بارگذاری...</div>}</>;
 }

 return <Component {...props} />;
};
