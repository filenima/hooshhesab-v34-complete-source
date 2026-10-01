"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
 CheckCircle2,
 XCircle,
 AlertTriangle,
 Info,
 X,
 type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ============ Toast Queue — صف اعلان‌ها ============
 *
 * یک سیستم اعلان موازی که:
 * - تا ۳ toast همزمان نشان می‌دهد
 * - هر toast پس از ۴ ثانیه (قابل تنظیم) خودکار بسته می‌شود
 * - در گوشه‌ی پایین-چپ (RTL: پایین-چپ = bottom-left) قرار می‌گیرد
 * - انیمیشن slide-in از راست و slide-out به راست
 * - با کلیک روی دکمه‌ی X بسته می‌شود
 * - تم ایندیگو، پاسخگو، قابل دسترس
 *
 * API سراسری (بدون context):
 * import { toastQueue } from "@/components/ui/toast-queue";
 * toastQueue.success("عنوان", "توضیح");
 * toastQueue.error("خطا", "پیام خطا");
 * toastQueue.dismiss(id); // اختیاری
 */

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface QueuedToast {
 id: string;
 title?: React.ReactNode;
 description?: React.ReactNode;
 variant: ToastVariant;
 duration: number; // میلی‌ثانیه، ۰ = بدون auto-dismiss
 createdAt: number;
}

interface QueueState {
 toasts: QueuedToast[];
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;

const listeners = new Set<(state: QueueState) => void>();
let state: QueueState = { toasts: [] };

function setState(next: QueueState) {
 state = next;
 listeners.forEach((l) => l(state));
}

let idCounter = 0;
function genId(): string {
 idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
 return `tq-${idCounter}-${Date.now()}`;
}

function pushToast(
 variant: ToastVariant,
 title?: React.ReactNode,
 description?: React.ReactNode,
 duration: number = DEFAULT_DURATION
): string {
 const id = genId();
 const toast: QueuedToast = {
 id,
 title,
 description,
 variant,
 duration,
 createdAt: Date.now(),
 };

 // نگه داشتن حداکثر MAX_VISIBLE تاست در صف (FIFO)
 const nextToasts = [...state.toasts, toast].slice(-MAX_VISIBLE);
 setState({ toasts: nextToasts });

 // auto-dismiss
 if (duration > 0) {
 setTimeout(() => {
 dismissToast(id);
 }, duration);
 }

 return id;
}

function dismissToast(id: string) {
 setState({ toasts: state.toasts.filter((t) => t.id!== id) });
}

function dismissAll() {
 setState({ toasts: [] });
}

/** API سراسری — قابل import در هر فایل */
export const toastQueue = {
 show: (
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
 ) => pushToast("default", title, description, duration),
 success: (
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
 ) => pushToast("success", title, description, duration),
 error: (
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
 ) => pushToast("error", title, description, duration),
 warning: (
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
 ) => pushToast("warning", title, description, duration),
 info: (
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
 ) => pushToast("info", title, description, duration),
 dismiss: dismissToast,
 dismissAll,
};

/* ============ hook برای کامپوننت رندر ============ */
function useToastQueue(): QueueState {
 const [local, setLocal] = React.useState<QueueState>(state);
 React.useEffect(() => {
 listeners.add(setLocal);
 return () => {
 listeners.delete(setLocal);
 };
 }, []);
 return local;
}

/* ============ Variants icon + color ============ */
const VARIANT_CONFIG: Record<
 ToastVariant,
 { icon: LucideIcon; ring: string; iconColor: string }
> = {
 default: { icon: Info, ring: "border-border", iconColor: "text-primary" },
 success: {
 icon: CheckCircle2,
 ring: "border-success/30",
 iconColor: "text-success",
 },
 error: {
 icon: XCircle,
 ring: "border-destructive/30",
 iconColor: "text-destructive",
 },
 warning: {
 icon: AlertTriangle,
 ring: "border-warning/30",
 iconColor: "text-warning",
 },
 info: { icon: Info, ring: "border-primary/30", iconColor: "text-primary" },
};

/* ============ یک آیتم toast ============ */
function QueuedToastItem({
 toast,
 onDismiss,
}: {
 toast: QueuedToast;
 onDismiss: (id: string) => void;
}) {
 const config = VARIANT_CONFIG[toast.variant]?? VARIANT_CONFIG.default;
 const Icon = config.icon;

 // نوار پیشرفت تا auto-dismiss
 const [progress, setProgress] = React.useState(100);
 React.useEffect(() => {
 if (toast.duration <= 0) return;
 const start = Date.now();
 const tick = setInterval(() => {
 const elapsed = Date.now() - start;
 const pct = Math.max(0, 100 - (elapsed / toast.duration) * 100);
 setProgress(pct);
 if (pct <= 0) clearInterval(tick);
 }, 60);
 return () => clearInterval(tick);
 }, [toast.duration]);

 return (
 <div
 role="status"
 aria-live="polite"
 className={cn(
 "pointer-events-auto relative w-[calc(100vw-2rem)] sm:w-80 overflow-hidden",
 "rounded-lg border bg-card/95 backdrop-blur shadow-lg",
 "animate-slide-in-right",
 config.ring
 )}
 >
 <div className="flex items-start gap-2.5 p-3 pe-9">
 <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", config.iconColor)} />
 <div className="flex-1 min-w-0 space-y-0.5">
 {toast.title && (
 <div className="text-sm font-semibold text-foreground truncate">
 {toast.title}
 </div>
 )}
 {toast.description && (
 <div className="text-xs text-muted-foreground leading-relaxed">
 {toast.description}
 </div>
 )}
 </div>
 </div>
 <button
 type="button"
 onClick={() => onDismiss(toast.id)}
 aria-label="بستن"
 className="absolute top-2 end-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 {toast.duration > 0 && (
 <div className="absolute bottom-0 inset-inline-0 h-0.5 bg-muted">
 <div
 className="h-full bg-primary/40 transition-[width] duration-75 ease-linear"
 style={{ width: `${progress}%` }}
 />
 </div>
 )}
 </div>
 );
}

/* ============ کامپوننت رندر — باید در یک جا از درخت رندر قرار گیرد ============ */
export function ToastQueue() {
 const { toasts } = useToastQueue();
 const [mounted, setMounted] = React.useState(false);

 React.useEffect(() => setMounted(true), []);

 if (!mounted) return null;

 return createPortal(
 <div
 aria-live="polite"
 className="fixed z-[200] bottom-4 inset-inline-start-4 flex flex-col gap-2 pointer-events-none"
 >
 {toasts.map((t) => (
 <QueuedToastItem key={t.id} toast={t} onDismiss={dismissToast} />
 ))}
 </div>,
 document.body
 );
}

export default ToastQueue;
