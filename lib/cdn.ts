// ============ CDN Helpers (Cloudflare) ============
// توابع کمکی برای ساخت URL تصاویر و دارایی‌های استاتیک از CDN.
// اگر NEXT_PUBLIC_CDN_URL تنظیم نشده باشد، مسیر اصلی برگردانده می‌شود.
//
// متغیرهای محیطی:
// NEXT_PUBLIC_CDN_URL — آدرس پایه‌ی CDN (مثلاً https://cdn.hoosh.nobatime.ir)
// NEXT_PUBLIC_CF_ZONE — اختیاری: zone id برای Image Resizing
// NEXT_PUBLIC_CF_IMAGE_HOST — اختیاری: هاست تصاویر برای Image Resizing

/**
 * ساخت URL کامل برای یک مسیر از CDN.
 * اگر CDN تنظیم نشده باشد، همان مسیر نسبی برگردانده می‌شود.
 *
 * مثال:
 * getCdnUrl("/logo.svg") "https://cdn.hoosh.nobatime.ir/logo.svg"
 * getCdnUrl("/blog/1.webp") "https://cdn.hoosh.nobatime.ir/blog/1.webp"
 */
export function getCdnUrl(path: string): string {
 const cdnBase = process.env.NEXT_PUBLIC_CDN_URL;
 if (!cdnBase) return path;
 // اگر مسیر از قبل absolute است، دست نزن
 if (/^https?:\/\//i.test(path)) return path;
 // اگر path با / شروع نمی‌شود، / اضافه کن
 const normalizedPath = path.startsWith("/")? path: `/${path}`;
 // strip trailing slash از cdnBase
 return `${cdnBase.replace(/\/$/, "")}${normalizedPath}`;
}

/**
 * ساخت URL تصویر با Cloudflare Image Resizing.
 * اگر CDN یا Image Resizing پیکربندی نشده باشد، مسیر اصلی برگردانده می‌شود.
 *
 * مثال:
 * cdnImage("/blog/post-1.jpg", 800)
 * "https://cdn.hoosh.nobatime.ir/cdn-cgi/image/?width=800&height=600&fit=cover&format=auto/blog/post-1.jpg"
 *
 * @param path مسیر تصویر (نسبی یا absolute)
 * @param width عرض تصویر (اختیاری)
 * @param options گزینه‌های اضافی: height, fit, quality, format, dpr
 */
export function cdnImage(
 path: string,
 width?: number,
 options?: {
 height?: number;
 fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
 quality?: number; // 1..100
 format?: "auto" | "webp" | "avif" | "json" | "jpeg" | "png";
 dpr?: number; // device pixel ratio: 1, 2, 3
 sharpen?: number; // 0..10
 blur?: number; // 0..250
 gravity?: "auto" | "left" | "right" | "top" | "bottom" | "center";
 }
): string {
 const cdnBase = process.env.NEXT_PUBLIC_CDN_URL;
 if (!cdnBase) return path;
 // اگر مسیر از قبل absolute و از دامنه‌ی دیگر است، دست نزن
 if (/^https?:\/\//i.test(path) &&!path.includes(cdnBase)) return path;

 // normalize path
 const normalizedPath = path.startsWith("/")? path: `/${path}`;
 const base = cdnBase.replace(/\/$/, "");

 // ساخت رشته‌ی options
 const opts: string[] = [];
 if (width && width > 0) opts.push(`width=${width}`);
 if (options?.height && options.height > 0) opts.push(`height=${options.height}`);
 if (options?.fit) opts.push(`fit=${options.fit}`);
 if (options?.quality && options.quality > 0 && options.quality <= 100) {
 opts.push(`quality=${options.quality}`);
 }
 opts.push(`format=${options?.format || "auto"}`);
 if (options?.dpr && options.dpr > 0) opts.push(`dpr=${options.dpr}`);
 if (options?.sharpen && options.sharpen > 0) opts.push(`sharpen=${options.sharpen}`);
 if (options?.blur && options.blur > 0) opts.push(`blur=${options.blur}`);
 if (options?.gravity) opts.push(`gravity=${options.gravity}`);

 // Cloudflare Image Resizing URL format:
 // https://<zone>/cdn-cgi/image/?<options>/<path>
 const optsStr = opts.join(",");
 return `${base}/cdn-cgi/image/?${optsStr}${normalizedPath}`;
}

/**
 * ساخت مجموعه‌ای از URLهای تصویر با اندازه‌های مختلف برای srcset.
 * برای responsive images.
 *
 * @param path مسیر تصویر
 * @param widths لیفت عرض‌ها (مثلاً [320, 640, 960, 1280])
 */
export function cdnImageSrcset(
 path: string,
 widths: number[] = [320, 640, 960, 1280]
): string {
 return widths
.map((w) => `${cdnImage(path, w)} ${w}w`)
.join(", ");
}

/**
 * آیا CDN فعال است؟ (برای تصمیم‌گیری در سمت کلاینت)
 */
export function isCdnEnabled(): boolean {
 return!!process.env.NEXT_PUBLIC_CDN_URL;
}

/**
 * URL آواتار کاربر با fallback به initials.
 * اگر logoUrl تنظیم شده باشد از CDN می‌خواند، در غیر این‌صورت یک avatar UI-Avatars می‌سازد.
 */
export function avatarUrl(
 logoUrl: string | null | undefined,
 name: string,
 size: number = 80
): string {
 if (logoUrl) return cdnImage(logoUrl, size, { fit: "cover", height: size });
 const encoded = encodeURIComponent(name || "کاربر");
 return `https://ui-avatars.com/api/?name=${encoded}&size=${size}&background=4f46e5&color=fff&bold=true`;
}
