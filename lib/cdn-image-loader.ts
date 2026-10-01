// ============ Custom Next.js Image Loader for Cloudflare CDN ============
// این loader در زمان بیلد/رانتایم از Next.js فراخوانی می‌شود تا URL تصویر
// نهایی را بسازد. اگر NEXT_PUBLIC_CDN_URL تنظیم شده باشد، از Cloudflare
// Image Resizing استفاده می‌کند؛ در غیر این‌صورت به default loader برمی‌گردد.
//
// فعال‌سازی: در next.config.ts images.loader = "custom", images.loaderFile = this file
//
// مستندات: https://nextjs.org/docs/app/api-reference/components/image#loader

import { cdnImage } from "@/lib/cdn";

interface ImageLoaderProps {
 src: string;
 width: number;
 quality?: number;
}

export default function cloudflareImageLoader({
 src,
 width,
 quality,
}: ImageLoaderProps): string {
 // کیفیت پیش‌فرض Next.js 75 است
 const q = quality || 75;
 // اگر CDN فعال نباشد، cdnImage همان src را برمی‌گرداند (fallback).
 return cdnImage(src, width, {
 quality: q,
 fit: "cover",
 format: "auto",
 });
}
