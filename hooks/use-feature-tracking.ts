"use client";

import * as React from "react";
import { trackFeatureUsage } from "@/lib/analytics";

/**
 * هوک ردیابی استفاده از ماژول‌ها
 *
 * - زمان ورود به ماژول: یک رویداد feature_usage ثبت می‌کند
 * - زمان حضور در ماژول: هر ۳۰ ثانیه یک heartbeat می‌فرستد تا زمان حضور ردیابی شود
 * - زمان خروج/تغییر مسیر: زمان کل حضور لاگ می‌شود
 *
 * @param feature نام ماژول/قابلیت (مثل "invoices", "inventory")
 * @param enabled آیا ردیابی فعال باشد (پیش‌فرض: بله)
 */
export function useFeatureTracking(feature: string, enabled: boolean = true): void {
 const enteredAtRef = React.useRef<number | null>(null);
 const featureRef = React.useRef(feature);
 const lastBeatRef = React.useRef<number>(0);

 // به‌روزرسانی ref نام قابلیت
 React.useEffect(() => {
 featureRef.current = feature;
 }, [feature]);

 // ردیابی ورود و heartbeat هر ۳۰ ثانیه
 React.useEffect(() => {
 if (!enabled) return;
 if (typeof window === "undefined") return;

 // ورود به ماژول
 enteredAtRef.current = Date.now();
 trackFeatureUsage(feature);

 // heartbeat — FIX(21-C — PERF موبایل): دسکتاپ ۳۰s / موبایل ۶۰s و وقتی تب
 // مخفی است heartbeat نزن (صرفه‌جویی باتری/داده؛ حضورِ تب مخفی ارزش ردیابی ندارد)
 const HEARTBEAT_MS =
 typeof window.matchMedia === "function" &&
 window.matchMedia("(max-width: 768px)").matches
 ? 60_000
 : 30_000;
 const interval = window.setInterval(() => {
 if (typeof document !== "undefined" && document.hidden) return;
 const now = Date.now();
 lastBeatRef.current = now;
 // یک رویداد heartbeat با پراپرتی duration می‌فرستیم (ثبت در AuditLog)
 try {
 const token = window.localStorage.getItem("hoshhesab_token") || "";
 void fetch("/api/analytics/feature-usage", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 ...(token? { Authorization: `Bearer ${token}` }: {}),
 },
 body: JSON.stringify({
 feature: featureRef.current,
 heartbeat: true,
 durationSec: HEARTBEAT_MS / 1000,
 }),
 keepalive: true,
 }).catch(() => {
 /* ignore */
 });
 } catch {
 /* ignore */
 }
 }, HEARTBEAT_MS);

 // هندل beforeunload — ارسال آخرین heartbeat قبل از بستن صفحه
 const handleUnload = () => {
 const enteredAt = enteredAtRef.current;
 if (!enteredAt) return;
 const duration = Math.round((Date.now() - enteredAt) / 1000);
 try {
 const token = window.localStorage.getItem("hoshhesab_token") || "";
 const payload = JSON.stringify({
 feature: featureRef.current,
 durationSec: duration,
 exit: true,
 });
 // استفاده از sendBeacon برای ارسال قابل اعتماد هنگام unload
 if (navigator.sendBeacon) {
 const blob = new Blob([payload], { type: "application/json" });
 navigator.sendBeacon("/api/analytics/feature-usage", blob);
 } else {
 void fetch("/api/analytics/feature-usage", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
...(token? { Authorization: `Bearer ${token}` }: {}),
 },
 body: payload,
 keepalive: true,
 }).catch(() => {
 /* ignore */
 });
 }
 } catch {
 /* ignore */
 }
 };

 window.addEventListener("beforeunload", handleUnload);
 window.addEventListener("pagehide", handleUnload);

 return () => {
 window.clearInterval(interval);
 window.removeEventListener("beforeunload", handleUnload);
 window.removeEventListener("pagehide", handleUnload);
 };
 }, [enabled]);
}

/**
 * هوک ردیابی زمان حضور در مسیر فعلی
 * به‌طور خودکار بر اساس pathname مسیر را ردیابی می‌کند
 */
export function usePathTracking(): void {
 const [pathname, setPathname] = React.useState<string>("");

 React.useEffect(() => {
 if (typeof window === "undefined") return;
 setPathname(window.location.pathname);

 // گوش‌دادن به تغییرات history (pushState/replaceState)
 const handleLocationChange = () => {
 setPathname(window.location.pathname);
 };

 window.addEventListener("popstate", handleLocationChange);
 const origPush = history.pushState;
 const origReplace = history.replaceState;
 history.pushState = function (...args) {
 const ret = origPush.apply(this, args);
 handleLocationChange();
 return ret;
 };
 history.replaceState = function (...args) {
 const ret = origReplace.apply(this, args);
 handleLocationChange();
 return ret;
 };

 return () => {
 window.removeEventListener("popstate", handleLocationChange);
 history.pushState = origPush;
 history.replaceState = origReplace;
 };
 }, []);

 // استخراج نام ماژول از مسیر
 const currentModule = React.useMemo(() => {
 if (!pathname) return "unknown";
 if (pathname === "/" || pathname === "/dashboard") return "dashboard";
 const segments = pathname.split("/").filter(Boolean);
 if (segments.length === 0) return "dashboard";
 return segments[0];
 }, [pathname]);

 useFeatureTracking(currentModule,!!pathname);
}
