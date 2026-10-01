"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";

interface DemoContextValue {
 isDemoMode: boolean;
 setIsDemoMode: (v: boolean) => void;
 checkAction: () => boolean;
}

const DEMO_STORAGE_KEY = "hoshhesab_demo_mode";

/** روش‌های HTTP که در حالت دمو مسدود می‌شوند */
const BLOCKED_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * FIX(بازخورد کاربر «خطا در ساخت حساب»): endpointهای احراز هویت/تریال/دمو
 * هرگز در حالت دمو بلاک نمی‌شوند — کاربر که وارد دمو شده و بعد به لندینگ
 * برگشته، قبلاً POST «شروع رایگان» و «ورود به دمو» بلاک می‌شد و پاسخ جعلی
 * {success:false} باعث پیام «خطا در ساخت حساب» می‌شد.
 *
 * FIX(v6-POS): صدور فاکتور/فیش صندوق فروش هم در دمو مجاز است — طبق درخواست
 * صریح مالک محصول، بخش POS باید در دمو هم «کار کند». ثبت فاکتور در tenant
 * دمو بی‌خطر است (دادهٔ نمونه است) و تجربهٔ کامل فروش را به بازدیدکننده می‌دهد.
 */
const DEMO_EXEMPT_PATHS = [
 "/api/demo/access",
 "/api/trial/create",
 "/api/auth/",
 "/api/superadmin/",
 "/api/license/status",
 "/api/payments/",
 "/api/accounting/invoices",
];

function isDemoExemptUrl(input: RequestInfo | URL): boolean {
 try {
 const url =
 typeof input === "string"
 ? input
 : input instanceof URL
 ? input.pathname
 : input.url;
 // فقط مسیر (بدون query/hash) با انتهای /
 const path = url.split("?")[0].split("#")[0];
 return DEMO_EXEMPT_PATHS.some(
 (p) => path === p.replace(/\/$/, "") || path.startsWith(p)
 );
 } catch {
 return false;
 }
}

const DemoContext = React.createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
 const [isDemoMode, setIsDemoModeState] = React.useState(false);
 const [hydrated, setHydrated] = React.useState(false);
 const { toast } = useToast();

 // بارگذاری isDemo از localStorage هنگام mount
 React.useEffect(() => {
 try {
 const stored = localStorage.getItem(DEMO_STORAGE_KEY);
 if (stored === "true") {
 setIsDemoModeState(true);
 }
 } catch {
 /* ignore */
 }
 setHydrated(true);
 }, []);

 // همگام‌سازی setter با localStorage
 const setIsDemoMode = React.useCallback(
 (v: boolean) => {
 setIsDemoModeState(v);
 try {
 if (v) {
 localStorage.setItem(DEMO_STORAGE_KEY, "true");
 } else {
 localStorage.removeItem(DEMO_STORAGE_KEY);
 }
 } catch {
 /* ignore */
 }
 },
 []
 );

 // checkAction: اگر در حالت دمو باشیم، toast هشدار نشان می‌دهد و false برمی‌گرداند
 const checkAction = React.useCallback((): boolean => {
 if (!hydrated) {
 // قبل از هیدرات شدن، اجازه نمی‌دهیم اقدامی انجام شود
 return false;
 }
 if (isDemoMode) {
 toast({
 title: "در حالت دمو امکان تغییر وجود ندارد",
 description:
 "این قابلیت در محیط دمو غیرفعال است. برای ذخیره اطلاعات، حساب خود را بسازید.",
 variant: "destructive",
 });
 return false;
 }
 return true;
 }, [isDemoMode, hydrated, toast]);

 // ــintercept fetch در حالت دمو: مسدود کردن POST/PUT/DELETE/PATCH ــ
 React.useEffect(() => {
 if (!isDemoMode) return;

 const originalFetch = window.fetch;

 window.fetch = function demoFetch(
 input: RequestInfo | URL,
 init?: RequestInit,
 ) {
 const method = (init?.method?? "GET").toUpperCase();
 // FIX: endpointهای احراز هویت/تریال/دمو حتی در حالت دمو عبور می‌کنند
 if (BLOCKED_METHODS.has(method) &&!isDemoExemptUrl(input)) {
 // نمایش هشدار و برگرداندن پاسخ جعلی موفق
 toast({
 title: "در حالت دمو امکان تغییر وجود ندارد",
 description:
 "عملیات " + method + " در محیط دمو مسدود است.",
 variant: "destructive",
 });
 // برگرداندن یک پاسخ موفق‌آمیز جعلی برای جلوگیری از خطای برنامه
 return Promise.resolve(
 new Response(JSON.stringify({ success: false, demo: true }), {
 status: 200,
 headers: { "Content-Type": "application/json" },
 }),
 );
 }
 // درخواست‌های خواندن (GET) بدون تغییر عبور می‌کنند
 return originalFetch.call(this, input, init);
 };

 // بازیابی fetch اصلی هنگام خروج از حالت دمو یا unmount
 return () => {
 window.fetch = originalFetch;
 };
 }, [isDemoMode, toast]);

 const value = React.useMemo<DemoContextValue>(
 () => ({ isDemoMode, setIsDemoMode, checkAction }),
 [isDemoMode, setIsDemoMode, checkAction]
 );

 return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
 const ctx = React.useContext(DemoContext);
 if (!ctx) {
 throw new Error("useDemo باید داخل DemoProvider استفاده شود");
 }
 return ctx;
}
