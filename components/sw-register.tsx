"use client";

/**
 * ServiceWorkerRegister — ثبت Service Worker با مدیریت به‌روزرسانی
 *
 * - در production و development (پیش‌نمایش) ثبت می‌شود
 *   — با NEXT_PUBLIC_DISABLE_SW=1 می‌توان آن را کاملاً خاموش کرد
 * - استراتژی‌های network-first در sw.js برای dev امن‌اند (کلاینت آنلاین
 *   همیشه پاسخ زنده می‌گیرد؛ کش فقط وقتی سرور در دسترس نیست استفاده می‌شود)
 * - هنگام در دسترس قرار گرفتن نسخه‌ی جدید، toast «به‌روزرسانی موجود» نمایش می‌دهد
 * - دکمه‌ی «به‌روزرسانی» برای reload و فعال‌سازی SW جدید
 * - اطلاع به کاربر پس از پایان Background Sync
 * - مدیریت خطا
 * - بهینه‌سازی: فقط یک toast همزمان، throttle بررسی دوره‌ای
 */

import * as React from "react";
import { RefreshCw, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

interface SWState {
 registered: boolean;
 updateAvailable: boolean;
 version: string | null;
 error: string | null;
 bgSyncRemaining: number | null;
 bgSyncProcessed: number | null;
}

export function ServiceWorkerRegister() {
 const { toast } = useToast();
 const [state, setState] = React.useState<SWState>({
 registered: false,
 updateAvailable: false,
 version: null,
 error: null,
 bgSyncRemaining: null,
 bgSyncProcessed: null,
 });
 const registrationRef = React.useRef<ServiceWorkerRegistration | null>(null);
 const toastShownRef = React.useRef(false);

 React.useEffect(() => {
 if (typeof window === "undefined") return;
 if (!("serviceWorker" in navigator)) return;

 // FIX(v13-preview — ریشه‌ی «پیش‌نمایش کار نمی‌کند»):
 // در حالت development چانک‌های Turbopack نامِ ثابت ولی محتوای متغیر دارند
 // (مثل _4cd39b0e._.js). SW با استراتژی cache-first نسخهٔ قدیمی چانک را
 // «برای همیشه» سرو می‌کرد → کاربر تغییرات را هرگز نمی‌دید و پیش‌نمایش
 // «خراب» به نظر می‌رسید. راه‌حل: در dev هرگز ثبت نکن + هر SW و کش قدیمی
 // را پاک کن. آفلاین/PWA فقط در build واقعی (production) فعال است.
 if (process.env.NODE_ENV === "development") {
 const purge = async () => {
 try {
 const regs = await navigator.serviceWorker.getRegistrations();
 await Promise.all(regs.map((r) => r.unregister()));
 if (typeof window.caches !== "undefined") {
 const keys = await caches.keys();
 await Promise.all(keys.map((k) => caches.delete(k)));
 }
 } catch {
 /* ignore */
 }
 };
 void purge();
 return;
 }
 // خاموش‌کردن کامل: NEXT_PUBLIC_DISABLE_SW=1
 if (process.env.NEXT_PUBLIC_DISABLE_SW === "1") return;

 let mounted = true;
 let cleanupFn: (() => void) | undefined;

 const handleControllerChange = () => {
 // کنترل‌کننده‌ی جدید فعال شده — اگر کاربر تأیید کرد، reload کن
 };

 const showUpdateToast = (reg: ServiceWorkerRegistration) => {
 if (!mounted) return;
 // فقط یک بار toast نمایش بده تا اسپم نشود
 if (toastShownRef.current) return;
 toastShownRef.current = true;
 setState((s) => ({...s, updateAvailable: true }));
 toast({
 title: "به‌روزرسانی موجود",
 description:
 "نسخه‌ی جدید نرم‌افزار آماده است. برای فعال‌سازی به‌روزرسانی کنید.",
 duration: 30000,
 action: (
 <ToastAction
 altText="به‌روزرسانی"
 onClick={() => {
 const waiting = reg.waiting;
 if (waiting) {
 // ارسال پیام به SW جدید برای skipWaiting
 waiting.postMessage({ type: "SKIP_WAITING" });
 } else {
 // اگر waiting نیست، یک update اجباری انجام بده
 reg.update().then(() => window.location.reload());
 }
 }}
 >
 <RefreshCw className="h-3.5 w-3.5 ml-1" />
 به‌روزرسانی
 </ToastAction>
 ),
 });
 };

 const registerSW = async () => {
 try {
 const reg = await navigator.serviceWorker.register("/sw.js", {
 scope: "/",
 updateViaCache: "none",
 });
 if (!mounted) return;
 registrationRef.current = reg;

 setState((s) => ({
...s,
 registered: true,
 error: null,
 }));

 // گوش دادن به پیام‌های SW — BG_SYNC_DONE, SW_ACTIVATED, NOTIFICATION_CLICK
 const handleMessage = (event: MessageEvent) => {
 if (!mounted) return;
 const data = event.data || {};
 if (data.type === "SW_ACTIVATED") {
 setState((s) => ({...s, version: data.version?? null }));
 } else if (data.type === "BG_SYNC_DONE") {
 const processed = Number(data.processed?? 0);
 const remaining = Number(data.remaining?? 0);
 setState((s) => ({
...s,
 bgSyncProcessed: processed,
 bgSyncRemaining: remaining,
 }));
 if (processed > 0 && remaining === 0) {
 toast({
 title: "همگام‌سازی آفلاین انجام شد",
 description: `${processed} درخواست آفلاین با موفقیت ارسال شد.`,
 });
 } else if (remaining > 0) {
 toast({
 title: "همگام‌سازی ناقص",
 description: `${processed} درخواست ارسال شد، ${remaining} درخواست هنوز باقی است.`,
 variant: "destructive",
 });
 }
 }
 };
 navigator.serviceWorker.addEventListener("message", handleMessage);

 // بررسی نسخه‌ی SW
 if (reg.active) {
 const channel = new MessageChannel();
 channel.port1.onmessage = (ev) => {
 if (mounted && ev.data?.version) {
 setState((s) => ({...s, version: ev.data.version }));
 }
 };
 reg.active.postMessage({ type: "GET_VERSION" }, [channel.port2]);
 }

 // اگر SW جدیدی در انتظار است
 if (reg.waiting) {
 showUpdateToast(reg);
 }

 // گوش دادن به updatefound
 reg.addEventListener("updatefound", () => {
 const newWorker = reg.installing;
 if (!newWorker) return;
 newWorker.addEventListener("statechange", () => {
 if (
 newWorker.state === "installed" &&
 navigator.serviceWorker.controller
 ) {
 // نسخه‌ی جدید نصب شد و منتظر فعال‌سازی
 showUpdateToast(reg);
 }
 });
 });

 // گوش دادن به controllerchange — reload صفحه
 let refreshing = false;
 const onControllerChange = () => {
 if (refreshing) return;
 refreshing = true;
 window.location.reload();
 };
 navigator.serviceWorker.addEventListener(
 "controllerchange",
 onControllerChange
 );

 // بررسی دوره‌ای به‌روزرسانی (هر ۶۰ دقیقه) — فقط وقتی tab visible است
 const interval = setInterval(
 () => {
 if (document.visibilityState === "visible") {
 reg.update().catch(() => {});
 }
 },
 60 * 60 * 1000
 );

 // گوش دادن به online event — تلاش برای trigger کردن background sync
 const onOnline = () => {
 if ("sync" in reg) {
 (reg as ServiceWorkerRegistration & {
 sync: { register: (tag: string) => Promise<void> };
 }).sync.register("hoosh-bg-sync").catch(() => {
 // fallback: مرورگرهای بدون Background Sync — پیام مستقیم به SW فعال
 reg.active?.postMessage({ type: "FORCE_SYNC" });
 });
 } else {
 // FIX(v4-PWA): مرورگرهای بدون Background Sync (مثل Firefox/Safari)
 // — بازپخش صف با پیام مستقیم به SW
 reg.active?.postMessage({ type: "FORCE_SYNC" });
 }
 };
 window.addEventListener("online", onOnline);

 cleanupFn = () => {
 clearInterval(interval);
 window.removeEventListener("online", onOnline);
 navigator.serviceWorker.removeEventListener("message", handleMessage);
 navigator.serviceWorker.removeEventListener(
 "controllerchange",
 onControllerChange
 );
 };
 } catch (err) {
 console.error("[SW-Register] Registration failed:", err);
 if (mounted) {
 setState((s) => ({
...s,
 error: err instanceof Error? err.message: "خطا در ثبت Service Worker",
 }));
 }
 }
 };

 // پس از load صفحه، SW را ثبت کن
 if (document.readyState === "complete") {
 registerSW();
 } else {
 window.addEventListener("load", registerSW);
 }

 navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

 return () => {
 mounted = false;
 navigator.serviceWorker.removeEventListener(
 "controllerchange",
 handleControllerChange
 );
 if (cleanupFn) cleanupFn();
 };
 }, [toast]);

 // نمایش خطای ثبت SW به‌صورت بنر نوار پایین — در همه‌ی محیط‌ها (شامل dev)
 if (state.error) {
 return (
 <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 rounded-xl border border-destructive/30 bg-destructive/10 shadow-lg p-3 flex items-center gap-3">
 {/* FIX(mobile): بنر خطا بالای نوار ناوبری پایین (نه روی آن) */}
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
 <AlertCircle className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-semibold text-foreground">
 خطا در ثبت Service Worker
 </p>
 <p className="text-[11px] text-muted-foreground truncate">
 {state.error}
 </p>
 </div>
 </div>
 );
 }

 return null;
}

/**
 * SWUpdateBanner — بنر اختیاری برای نمایش دائمی وضعیت به‌روزرسانی
 * قابل استفاده در گوشه‌ی صفحه وقتی آپدیت در دسترس است.
 */
export function SWUpdateBanner({
 open,
 onUpdate,
 onDismiss,
}: {
 open: boolean;
 onUpdate: () => void;
 onDismiss?: () => void;
}) {
 if (!open) return null;
 return (
 <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 rounded-xl border border-primary/30 bg-card shadow-lg p-3 flex items-center gap-3">
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
 <Download className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-semibold text-foreground">به‌روزرسانی موجود</p>
 <p className="text-[11px] text-muted-foreground">نسخه‌ی جدید آماده است</p>
 </div>
 <Button size="sm" onClick={onUpdate} className="shrink-0">
 <RefreshCw className="h-3 w-3" />
 به‌روزرسانی
 </Button>
 {onDismiss && (
 <button
 type="button"
 onClick={onDismiss}
 className="shrink-0 text-muted-foreground hover:text-foreground text-xs"
 aria-label="بستن"
 >
 بستن
 </button>
 )}
 </div>
 );
}

/**
 * BgSyncStatus — نمایش وضعیت همگام‌سازی پس‌زمینه (اختیاری)
 * قابل استفاده در داشبورد یا نوار وضعیت.
 */
export function BgSyncStatus({
 processed,
 remaining,
}: {
 processed: number | null;
 remaining: number | null;
}) {
 if (processed === null && remaining === null) return null;
 const total = (processed?? 0) + (remaining?? 0);
 if (total === 0) return null;
 const isComplete = (remaining?? 0) === 0;
 return (
 <div
 className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs"
 role="status"
 aria-live="polite"
 >
 {isComplete? (
 <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
 ): (
 <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin" />
 )}
 <span className="text-foreground">
 {isComplete
? `${processed} درخواست آفلاین ارسال شد`
: `${remaining} درخواست در انتظار اتصال`}
 </span>
 </div>
 );
}

export default ServiceWorkerRegister;
