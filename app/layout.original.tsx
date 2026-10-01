import type { Metadata, Viewport } from "next";
import { Vazirmatn, JetBrainsMono } from "@/lib/fonts";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { reportWebVitals } from "@/lib/performance";
import { SentryProvider } from "@/components/sentry-provider";
import { SentryErrorBoundary } from "@/components/sentry-error-boundary";

export { reportWebVitals };

const SITE_URL = "https://hoshhesab.ir";
const SITE_NAME = "هوش‌حساب";
const SITE_TITLE = "هوش‌حساب | نرم‌افزار حسابداری هوشمند";
const SITE_DESCRIPTION =
  "نرم‌افزار حسابداری ابری هوشمند — جامع‌ترین سیستم حسابداری ایرانی با اتصال به سامانه مودیان، انبار، فروش، حقوق دستمزد و هوش مصنوعی";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s | هوش‌حساب" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "نرم افزار حسابداری",
    "حسابداری ابری",
    "سامانه مودیان",
    "صورتحساب الکترونیکی",
    "هوش حساب",
    "هوش‌حساب",
    "OCR فاکتور",
    "حقوق و دستمزد",
    "ارزش افزوده",
  ],
  authors: [{ name: "هوش‌حساب", url: SITE_URL }],
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": [{ url: "/rss.xml", title: "بلاگ هوش‌حساب" }] },
  },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`${Vazirmatn.variable} ${JetBrainsMono.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SentryProvider>
            <SentryErrorBoundary componentName="RootLayout">
              {children}
            </SentryErrorBoundary>
            <Toaster />
            <ToastQueueLazy />
            <UndoToastLazy />
            <ServiceWorkerRegister />
          </SentryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

// Lazy-load client-only components (ssr: false requires "use client" wrapper)
import ToastQueueWrapper from "@/components/toast-queue-wrapper";
import UndoToastWrapper from "@/components/undo-toast-wrapper";
const ToastQueueLazy = ToastQueueWrapper;
const UndoToastLazy = UndoToastWrapper;
