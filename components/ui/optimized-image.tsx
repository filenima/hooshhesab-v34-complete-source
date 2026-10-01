"use client";

/**
 * OptimizedImage — wrapper هوشمند حول next/image
 *
 * ویژگی‌ها:
 * - blur placeholder پیش‌فرض (مشکی بسیار کم‌رنگ / رنگ indigo)
 * - lazy loading پیش‌فرض (مگر با priority=true)
 * - responsive sizes برای موبایل/تبلت/دسکتاپ
 * - fallback در صورت خطای بارگذاری (تصویر placeholder یا متن alt)
 * - RTL-aware: در صورتی که تصویر آواتار/آیکون باشد، dir روی تصویر تأثیر نمی‌گذارد
 * اما برای کارت‌ها و بنرها به‌صورت پیش‌فرض از dir="rtl" تبعیت می‌کند.
 *
 * مثال استفاده:
 * <OptimizedImage src="/logo.svg" alt="هوش" width={120} height={40} priority />
 * <OptimizedImage src={user.avatar} alt={user.name} width={48} height={48} className="rounded-full" />
 */

import * as React from "react";
import Image, { ImageProps } from "next/image";

// Blur placeholder به‌صورت SVG data URL با رنگ indigo (مطابق تم پروژه)
const BLUR_DATA_URL =
 "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23e0e7ff'/%3E%3C/svg%3E";

export interface OptimizedImageProps
 extends Omit<ImageProps, "placeholder" | "loading" | "onError"> {
 /** در صورت خطای بارگذاری، این مسیر جایگزین نمایش داده می‌شود. پیش‌فرض: placeholder. */
 fallbackSrc?: string;
 /** متن جایگزین که در صورت نبود fallback نمایش داده می‌شود. */
 showAltOnFallback?: boolean;
 /** ابعاد پیش‌فرض برای sizes — در صورت عدم ارائه از حدس‌های هوشمند استفاده می‌شود. */
 sizes?: string;
 /** پشتیبانی RTL — در حالت true، direction به rtl تنظیم می‌شود. */
 rtl?: boolean;
 /** اگر تصویر بعد از ۵ ثانیه بارگذاری نشد، fallback نمایش داده شود. */
 timeoutMs?: number;
}

export function OptimizedImage({
 src,
 alt,
 width,
 height,
 fill,
 sizes,
 className,
 priority = false,
 fallbackSrc,
 showAltOnFallback = false,
 rtl = true,
 timeoutMs = 5000,
 style,
...rest
}: OptimizedImageProps) {
 const [errored, setErrored] = React.useState(false);
 const [timedOut, setTimedOut] = React.useState(false);
 const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

 // اگر src تغییر کرد، state را ریست کن
 React.useEffect(() => {
 setErrored(false);
 setTimedOut(false);
 }, [src]);

 // تایم‌اوت بارگذاری — فقط برای non-priority و وقتی هنوز خطا نداشتیم
 React.useEffect(() => {
 if (priority || errored || typeof src!== "string") return;
 timerRef.current = setTimeout(() => setTimedOut(true), timeoutMs);
 return () => {
 if (timerRef.current) clearTimeout(timerRef.current);
 };
 }, [priority, errored, src, timeoutMs]);

 // به‌محض errored یا تغییر src، تایمر را پاک کن
 React.useEffect(() => {
 if (errored && timerRef.current) {
 clearTimeout(timerRef.current);
 timerRef.current = null;
 }
 }, [errored]);

 const showFallback = errored || timedOut;

 // responsive sizes پیش‌فرض
 const computedSizes =
 sizes??
 (fill
? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
: undefined);

 // اگر خطا داشتیم و fallbackSrc بود، آن را نمایش بده
 const effectiveSrc = showFallback && fallbackSrc? fallbackSrc: src;

 // اگر خطا داشتیم و نه fallbackSrc و نه alt نبود، یک div خاکستری برگردان
 if (showFallback &&!fallbackSrc &&!showAltOnFallback) {
 return (
 <div
 role="img"
 aria-label={alt}
 className={
 "flex items-center justify-center bg-muted text-muted-foreground text-xs " +
 (className?? "")
 }
 style={{
 width: typeof width === "number"? `${width}px`: width,
 height: typeof height === "number"? `${height}px`: height,
...style,
 }}
 dir={rtl? "rtl": "ltr"}
 >
 {alt? alt.slice(0, 24): ""}
 </div>
 );
 }

 // اگر خطا داشتیم و فقط alt داشتیم
 if (showFallback && showAltOnFallback &&!fallbackSrc) {
 return (
 <div
 role="img"
 aria-label={alt}
 className={
 "flex items-center justify-center bg-muted text-muted-foreground text-xs p-2 text-center " +
 (className?? "")
 }
 style={{
 width: typeof width === "number"? `${width}px`: width,
 height: typeof height === "number"? `${height}px`: height,
...style,
 }}
 dir={rtl? "rtl": "ltr"}
 >
 {alt}
 </div>
 );
 }

 return (
 <Image
 src={effectiveSrc}
 alt={alt}
 width={fill? undefined: width}
 height={fill? undefined: height}
 fill={fill}
 sizes={computedSizes}
 className={className}
 priority={priority}
 // lazy به‌صورت پیش‌فرض — next/image با priority=true به‌صورت خودکار eager می‌کند
 loading={priority? "eager": "lazy"}
 placeholder="blur"
 blurDataURL={BLUR_DATA_URL}
 onError={() => setErrored(true)}
 style={style}
 dir={rtl? "rtl": "ltr"}
 {...rest}
 />
 );
}

export default OptimizedImage;
