// داده‌های مشترک صفحات هاب سئو — لینک‌سازی داخلی بین ۹ صفحهٔ اصلی

export interface HubLink {
 title: string;
 href: string;
}

/** ۹ صفحهٔ هاب سئو + پادکست (#15، v34-5) */
export const HUB_LINKS: HubLink[] = [
 { title: "امکانات هوش", href: "/features" },
 { title: "حسابداری صنایع", href: "/industries" },
 { title: "راهنمای مالیات و مودیان", href: "/taxes" },
 { title: "مقایسهٔ نرم‌افزارهای حسابداری", href: "/compare" },
 { title: "اتصال بانکی", href: "/banks" },
 { title: "حسابداری در شهرهای ایران", href: "/cities" },
 { title: "مطالعات موردی", href: "/case-studies" },
 { title: "مرکز آموزش", href: "/tutorials" },
 { title: "اکوسیستم و اتصالات", href: "/ecosystem" },
 // #15 (v34-5): هاب پادکست/ویدیو — مشتق از مقالات پیلار
 { title: "پادکست و ویدیو", href: "/podcasts" },
];

/**
 * hubNavLinks — لینک‌های ناوبری به سایر صفحات هاب (بدون خودِ صفحه)
 * برای بلوک «ادامهٔ مسیر شما در هوش» در انتهای هر صفحهٔ هاب
 */
export function hubNavLinks(currentHref: string): HubLink[] {
 return HUB_LINKS.filter((l) => l.href!== currentHref);
}
