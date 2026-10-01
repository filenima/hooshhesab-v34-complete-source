"use client";

/**
 * ScrollProgress — نوار پیشرفت اسکرول + دکمهٔ بازگشت به بالا (v24 + v26)
 * ----------------------------------------------------------------------------
 * ۱) نوار گرادیانی نازک (۳px) که درصد مطالعهٔ صفحه را نشان می‌دهد —
 *    هم بازخورد لمسی خوبی برای صفحه‌های بلند لندینگ است و هم نشانهٔ
 *    «مرجع بلند» برای سئو/UX. رندر با rAF + passive listener (بدون jank).
 *    فقط وقتی بیش از ۲٪ اسکرول شده نمایش داده می‌شود (تمیزتر).
 * ۲) دکمهٔ شناور «بازگشت به بالا» (v26) — بعد از ۶۰۰px اسکرول ظاهر می‌شود؛
 *    در سمت راست پایین (RTL: start) تا با دستیار مالی شناور (چپ پایین)
 *    تداخل نداشته باشد. برای صفحه‌های ۳۰۰۰+ کلمه‌ای هاب کاملاً ضروری است.
 * دسترس‌پذیری: با aria-label و tabIndex که فقط در حالت نمایان فعال است.
 */

import * as React from "react";
import { ArrowUp } from "lucide-react";

export function ScrollProgress() {
  const [progress, setProgress] = React.useState(0);
  const [showTop, setShowTop] = React.useState(false);

  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0;
      setProgress(pct);
      setShowTop(doc.scrollTop > 600 && max > 900);
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      {progress >= 2 && (
        <div className="scroll-progress-track" aria-hidden="true">
          <div className="scroll-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      <button
        type="button"
        aria-label="بازگشت به بالای صفحه"
        title="بازگشت به بالا"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-6 start-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition-all duration-300 hover:border-primary/40 hover:text-primary hover:shadow-xl active:scale-95 print:hidden ${
          showTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
        tabIndex={showTop ? 0 : -1}
      >
        <ArrowUp className="h-5 w-5" aria-hidden />
      </button>
    </>
  );
}
