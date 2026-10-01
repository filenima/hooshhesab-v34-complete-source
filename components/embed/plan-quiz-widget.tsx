"use client";

/**
 * PlanQuizWidget — ویجت قابل embed کیویز انتخاب پلن
 *
 * برای iframe در سایت‌های شرکا/وبلاگ‌نویسان:
 *   <iframe src="https://SITE/embed/plan-quiz" style="width:100%;height:520px;border:0" loading="lazy"></iframe>
 *
 * v26 — با پیام postMessage ارتفاع خود را به والد اطلاع می‌دهد تا میزبان
 * بتواند ارتفاع iframe را دقیق تنظیم کند:
 *   window.addEventListener("message", (e) => {
 *     if (e.data?.type === "hoosh:plan-quiz:height") iframe.style.height = e.data.height + "px";
 *   });
 */

import * as React from "react";
import { PlanQuiz } from "@/components/plan-comparison-section";
import { Sparkle } from "lucide-react";
import { accentStyle, type EmbedAccent } from "@/lib/embed-theme";

interface PlanQuizWidgetProps {
  /** آدرس پایهٔ سایت اصلی — برای لینک‌های خروجی از iframe */
  appBaseUrl: string;
  /** نام برند (وایت‌لبل) */
  brandName: string;
  /** لوگوی برند در صورت وجود */
  logoUrl?: string;
  /** v29 — رنگ لهجهٔ برند شرکا (پارامتر ?color=) */
  accentColor?: EmbedAccent | null;
}

export function PlanQuizWidget({ appBaseUrl, brandName, logoUrl, accentColor }: PlanQuizWidgetProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);

  // همگام‌سازی ارتفاع با میزبان iframe (postMessage + ResizeObserver)
  React.useEffect(() => {
    const send = () => {
      try {
        const h = Math.ceil(
          bodyRef.current?.getBoundingClientRect().height ?? document.documentElement.scrollHeight
        );
        parent?.postMessage({ type: "hoosh:plan-quiz:height", height: h }, "*");
      } catch {
        /* sandbox بدون allow-scripts پیام نمی‌دهد — نادیده */
      }
    };
    send();
    const t1 = window.setTimeout(send, 350); // پس از فونت/هیدر
    const t2 = window.setTimeout(send, 1200);
    const ro = new ResizeObserver(send);
    if (bodyRef.current) ro.observe(bodyRef.current);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
    };
  }, []);

  // beacon ثبت بازدید (تحلیل کانال شرکا — v28، fire-and-forget)
  React.useEffect(() => {
    try {
      const url = "/api/widgets/track?widget=plan-quiz";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        void fetch(url, { method: "POST", keepalive: true, mode: "no-cors" }).catch(() => {});
      }
    } catch {
      /* آمار هرگز UX را خراب نکند */
    }
  }, []);

  const openPricing = React.useCallback(() => {
    window.open(`${appBaseUrl}/pricing`, "_blank", "noopener,noreferrer");
  }, [appBaseUrl]);

  return (
    <div
      ref={bodyRef}
      style={accentStyle(accentColor)}
      className="min-h-[420px] bg-background px-3 py-4 text-foreground sm:px-5 sm:py-6"
    >
      {/* هدر مینیمال برند */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <a
          href={appBaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 font-extrabold text-foreground transition-opacity hover:opacity-80"
        >
          {logoUrl ? (
            // لوگوی داینامیک وایت‌لبل — دامنهٔ نامعلوم برای next/image
            <img src={logoUrl} alt={brandName} className="h-6 w-auto" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkle className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          <span className="text-sm">{brandName}</span>
        </a>
        <span className="text-[10px] font-medium text-muted-foreground">
          ابزار انتخاب پلن
        </span>
      </header>

      {/* خود کیویز — همان منطق صفحهٔ مقایسهٔ پلن‌ها */}
      <PlanQuiz onOpenPricing={openPricing} />

      {/* فوتر مینیمال */}
      <footer className="mt-4 text-center text-[10px] leading-5 text-muted-foreground/80">
        <a
          href={`${appBaseUrl}/compare-plans`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
        >
          مقایسهٔ کامل ۳۸ قابلیت پلن‌ها در {brandName}
        </a>
      </footer>
    </div>
  );
}
