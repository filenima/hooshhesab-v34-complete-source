"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { SentryProvider } from "@/components/sentry-provider";
import { SentryErrorBoundary } from "@/components/sentry-error-boundary";
import { ThemeApplier } from "@/components/theme-applier";

// ============ Dynamic import برای کاهش مصرف حافظه کامپایل ============
// مهم (سئو): فقط ServiceWorkerRegister به‌صورت ssr:false بارگذاری می‌شود.
// SentryProvider و SentryErrorBoundary import استاتیک دارند — هر دو کامپوننت
// سبک کلاینت هستند (init داخل useEffect انجام می‌شود) و برای SSR ایمن‌اند.
// با این تغییر، {children} سرور-رندر می‌ماند و HTML اولیه برای کرالرها کامل است.
const ServiceWorkerRegister = dynamic(
 () => import("@/components/sw-register").then((m) => ({ default: m.ServiceWorkerRegister })),
 { ssr: false, loading: () => <span className="sr-only">در حال بارگذاری...</span> }
);

/**
 * AppProviders — wrapper اصلی برای تمام providerهای application
 * شامل: Sentry ErrorBoundary، ThemeProvider، Sentry، ServiceWorker
 *
 * ساختار: children بیرون از هر dynamic ssr:false قرار دارد تا
 * محتوای SSR صفحات (H1، متن، لینک‌ها) در HTML اولیه حفظ شود.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
 return (
 <SentryErrorBoundary>
 <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
 {/* اعمال تم ظاهری ذخیره‌شده (hoosh_theme) روی <html data-theme> */}
 <ThemeApplier />
 {children}
 <ServiceWorkerRegister />
 <SentryProvider>
 <Toaster />
 <SonnerToaster richColors position="top-center" dir="rtl" />
 </SentryProvider>
 </NextThemesProvider>
 </SentryErrorBoundary>
 );
}
