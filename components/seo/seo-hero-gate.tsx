"use client";

import * as React from "react";

/**
 * SeoHeroGate — دروازه پنهان‌سازی محتوای SEO سرور-رندرشده
 * ============================================================
 * محتوای سرور-رندرشده (SeoHero) در HTML اولیه برای کرالرها و کاربران
 * بدون جاوااسکریپت قابل مشاهده است. برای کاربران عادی (با JS) این محتوا
 * از «اولین paint» با CSS پنهان می‌شود (کلاس js-enabled روی <html> توسط
 * اسکریپت inline در layout اضافه می‌شود) تا Flash متن خام دیده نشود.
 * اگر ظرف ۶ ثانیه محتوای کلاینت mount نشود (خطای JS)، کلاس حذف و محتوای
 * سروری به‌عنوان fallback نمایش داده می‌شود.
 *
 * نشانه‌های mount شدن محتوای واقعی:
 * - section#hero صفحه فرود (LandingDynamic)
 * - aside[data-tour="sidebar"] پنل کاربر/ادمین
 */
export function SeoHeroGate({ children }: { children: React.ReactNode }) {
 const [hidden, setHidden] = React.useState(false);

 React.useEffect(() => {
 const REAL_CONTENT_SELECTOR = "section#hero, aside[data-tour='sidebar']";

 const check = () => {
 if (document.querySelector(REAL_CONTENT_SELECTOR)) {
 setHidden(true);
 }
 };

 // بررسی اولیه (شاید محتوا قبل از این effect آماده شده باشد)
 check();

 // نظارت بر DOM تا لحظه mount شدن محتوای واقعی
 const observer = new MutationObserver(check);
 observer.observe(document.body, { childList: true, subtree: true });
 return () => observer.disconnect();
 }, []);

 return (
 <div data-seo-gate hidden={hidden} suppressHydrationWarning>
 {children}
 </div>
 );
}
