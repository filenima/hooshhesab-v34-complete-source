/**
 * هوش — Sentry Client Provider
 * کامپوننت کلاینت برای مقداردهی اولیه‌ی Sentry در مرورگر
 * در layout.tsx رندر می‌شود
 *
 * FIX(compile-memory): بارگذاری @sentry/nextjs (درختِ ~۹ پکیج) فقط زمانی که
 * DSN واقعی存在 — در dev بدون DSN، import پویا انجام نمی‌شود تا گراف کامپایل
 * صفحه سبک بماند (کاهش پیک حافظهٔ Turbopack در سندباکس ۴GB). رفتار production
 * بدون تغییر است (DSN تنظیم‌شده → همان init).
 */

"use client";

import { useEffect } from "react";

export function SentryProvider({ children }: { children: React.ReactNode }) {
 useEffect(() => {
 const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
 if (!dsn) {
 // بدون DSN — Sentry غیرفعال؛ هیچ پکیجی import نمی‌شود
 return;
 }
 void import("@/lib/sentry").then((m) => {
 m.initSentry(dsn, {
 environment: process.env.NODE_ENV ?? "development",
 release: process.env.NEXT_PUBLIC_APP_VERSION,
 tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
 });
 }).catch(() => {
 /* Sentry optional — خطا نباید اپ را بشکند */
 });
 }, []);

 return <>{children}</>;
}
