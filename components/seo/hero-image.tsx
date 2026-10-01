"use client";

import Image from "next/image";
import { SITE_URL } from "@/lib/seo";

interface HeroImageProps {
 src: string;
 alt: string;
 title?: string;
 subtitle?: string;
 priority?: boolean;
}

/**
 * صفحه‌ی Hero تصویر — تصویر اختصاصی با عنوان و زیرعنوان
 * برای تمام صفحات سئو قابل استفاده است
 */
export function HeroImage({ src, alt, title, subtitle, priority = false }: HeroImageProps) {
 return (
 <div className="relative w-full overflow-hidden rounded-xl mb-8">
 <div className="relative aspect-[16/9] w-full">
 <Image
 src={src}
 alt={alt}
 fill
 className="object-cover"
 priority={priority}
 sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
 />
 {/* overlay gradient */}
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 </div>
 {(title || subtitle) && (
 <div className="absolute bottom-0 inset-x-0 p-6 text-white">
 {title && (
 <h1 className="text-2xl md:text-3xl font-bold mb-1 drop-shadow-lg">
 {title}
 </h1>
 )}
 {subtitle && (
 <p className="text-sm md:text-base opacity-90 drop-shadow-md max-w-2xl">
 {subtitle}
 </p>
 )}
 </div>
 )}
 </div>
 );
}

/**
 * تصویر سئو ساده — بدون overlay
 */
export function SeoImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
 return (
 <div className={`relative overflow-hidden rounded-lg ${className}`}>
 <Image
 src={src}
 alt={alt}
 width={800}
 height={450}
 className="object-cover w-full h-auto"
 sizes="(max-width: 768px) 100vw, 800px"
 />
 </div>
 );
}

/** نقشه‌ی تصاویر بر اساس نوع صفحه */
export const PAGE_IMAGES: Record<string, string> = {
 accounting: "/images/hero-accounting.webp",
 industries: "/images/hero-industries.webp",
 ecosystem: "/images/hero-ecosystem.webp",
 banks: "/images/hero-banks.webp",
 taxes: "/images/hero-taxes.webp",
 cities: "/images/hero-cities.webp",
};
