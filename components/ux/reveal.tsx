"use client";

/**
 * Reveal — ظهور نرم هنگام اسکرول (v27)
 * ----------------------------------------------------------------------------
 * Wrapper سبک برای انیمیشن ورود محتوا هنگام ورود به دیدرس:
 *   <Reveal>...</Reveal>
 *   <Reveal delay={150}>...</Reveal>
 *
 * - IntersectionObserver یکی‌بار مصرف (unobserve) — بدون هزینهٔ مداوم
 * - prefers-reduced-motion و Performance Mode → بدون انیمیشن، محتوای عادی
 * - SSR-safe: محتوا از اول در DOM است (فقط opacity/translate) — سئو دست‌نخورده
 * - disableOnMobile: در موبایل پرچم static (سبک‌تر) — پیش‌فرض روشن
 */

import * as React from "react";

interface RevealProps {
  children: React.ReactNode;
  /** تأخیر شروع (ms) — برای افکت پلکانی */
  delay?: number;
  /** جهت حرکت ورود */
  from?: "bottom" | "start" | "none";
  /** انیمیشن در موبایل (عرض < 768) غیرفعال باشد؟ */
  disableOnMobile?: boolean;
  className?: string;
  /** تگ wrapper — سلسله‌مراتب معنایی حفظ شود */
  as?: "div" | "section" | "article" | "li";
}

const OFFSETS: Record<NonNullable<RevealProps["from"]>, string> = {
  bottom: "translateY(22px)",
  start: "translateX(-18px)", // RTL: از راست وارد شود — منفی X در RTL یعنی سمت شروع
  none: "none",
};

export function Reveal({
  children,
  delay = 0,
  from = "bottom",
  disableOnMobile = true,
  className,
  as: Tag = "div",
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [skip, setSkip] = React.useState(false);

  // تشخیص کاهش حرکت + موبایل + حالت پرفورمنس → انیمیشن لازم نیست
  React.useEffect(() => {
    try {
      const reduced =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.documentElement.classList.contains("perf-mode");
      const mobile = disableOnMobile && window.matchMedia("(max-width: 767px)").matches;
      if (reduced || mobile) setSkip(true);
    } catch {
      setSkip(true);
    }
  }, [disableOnMobile]);

  React.useEffect(() => {
    if (skip) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true); // محیط بدون IO (مثل SSR تست‌ها) → بدون انیمیشن
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [skip]);

  const style: React.CSSProperties = React.useMemo(() => {
    if (skip || visible) return { transitionDelay: `${delay}ms` };
    return {
      opacity: 0,
      transform: OFFSETS[from],
      transitionDelay: `${delay}ms`,
    };
  }, [skip, visible, delay, from]);

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        ...style,
        transitionProperty: "opacity, transform",
        transitionDuration: "600ms",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}
