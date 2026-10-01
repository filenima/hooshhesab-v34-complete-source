"use client";

import * as React from "react";
import {
 CheckCircle2,
 XCircle,
 AlertTriangle,
 Info,
 type LucideIcon,
} from "lucide-react";
import { toastQueue } from "@/components/ui/toast-queue";

/**
 * تابع toast که از useToast برمی‌گردد.
 *
 * توجه: به‌جای intersect با ToastProps (که `title?: string` از Primitive.li را
 * به ارث می‌برد و باعث می‌شود `title?: ReactNode` به `string` تنگ شود)،
 * فقط شکل مورد نیاز را تعریف می‌کنیم.
 */
type ToastFn = (props: {
 title?: React.ReactNode;
 description?: React.ReactNode;
 variant?: "default" | "destructive";
 [key: string]: unknown;
}) => unknown;

/**
 * toast-helpers — لایه‌ی یکپارچه روی صف اعلان‌ها.
 *
 * این ماژول هم‌اکنون از ToastQueue (صف سه‌تایی پایین-چپ) استفاده می‌کند.
 * امضای تابع‌ها برای backward-compat حفظ شده — اولین آرگومان `toast`
 * اختیاری است و اگر پاس داده شود، اعلان هم در سیستم قدیمی و هم در صف
 * جدید نشان داده می‌شود.
 *
 * قرارداد رنگ‌ها:
 * - toastSuccess عملیات موفق (مثلاً ثبت فاکتور) — variant: success
 * - toastError خطا (مثلاً ورود ناموفق) — variant: error
 * - toastWarning هشدار (مثلاً حذف یک رکورد) — variant: warning
 * - toastInfo اطلاع‌رسانی (مثلاً خروجی CSV) — variant: info
 *
 * @example
 * // سبک قدیمی (با toast fn از useToast)
 * const { toast } = useToast();
 * toastSuccess(toast, "فاکتور ثبت شد", "فاکتور ۱۲۳۴ با موفقیت ایجاد شد");
 *
 * // سبک جدید (بدون useToast)
 * toastSuccess(null, "فاکتور ثبت شد", "توضیحات");
 * toastError(null, "خطا", "ذخیره‌سازی ناموفق بود");
 */

function notify(
 toast: ToastFn | null | undefined,
 variant: "default" | "success" | "error" | "warning" | "info",
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
) {
 // ۱) ارسال به صف جدید (همیشه)
 if (variant === "success") {
 toastQueue.success(title, description, duration);
 } else if (variant === "error") {
 toastQueue.error(title, description, duration);
 } else if (variant === "warning") {
 toastQueue.warning(title, description, duration);
 } else if (variant === "info") {
 toastQueue.info(title, description, duration);
 } else {
 toastQueue.show(title, description, duration);
 }

 // ۲) ارسال به سیستم قدیمی (اگر caller تابع toast داده باشد)
 if (toast) {
 try {
 toast({
 title,
 description,
 variant: variant === "error"? "destructive": "default",
 });
 } catch {
 // radix toast ممکن است در حال unmount باشد — بی‌خطر
 }
 }
}

export function toastSuccess(
 toast: ToastFn | null | undefined,
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
) {
 notify(toast, "success", title, description, duration);
}

export function toastError(
 toast: ToastFn | null | undefined,
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
) {
 notify(toast, "error", title, description, duration);
}

export function toastWarning(
 toast: ToastFn | null | undefined,
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
) {
 notify(toast, "warning", title, description, duration);
}

export function toastInfo(
 toast: ToastFn | null | undefined,
 title: React.ReactNode,
 description?: React.ReactNode,
 duration?: number
) {
 notify(toast, "info", title, description, duration);
}

/** آیکون‌های پیشنهادی برای variant ها (اختیاری) */
export const TOAST_ICONS: Record<"default" | "destructive", LucideIcon> = {
 default: Info,
 destructive: XCircle,
};

export const SUCCESS_ICON: LucideIcon = CheckCircle2;
export const WARNING_ICON: LucideIcon = AlertTriangle;
export const INFO_ICON: LucideIcon = Info;
export const ERROR_ICON: LucideIcon = XCircle;
