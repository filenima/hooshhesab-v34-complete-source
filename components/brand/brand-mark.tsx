"use client";

import * as React from "react";

/**
 * BrandMark — نشان برند «هوش» (وایت‌لیبل‌پذیر)
 *
 * v14: گرادیان نِیوی→مِنت (#12304A → #19B394) — هم‌هویت با تم
 * پیش‌فرض «نِیوی مِنت» (پیشنهاد اول مالک) و فاوآیکون.
 * اگر logoUrl تنظیم شده باشد تصویر سفارشی رندر می‌شود؛ در صورت خرابی/
 * نالود شدن تصویر (onError) خودکار به همین نشان پیش‌فرض برمی‌گردیم.
 */
export function BrandMark({
  className = "h-9 w-9",
  logoUrl,
  appName = "هوش",
}: {
  className?: string;
  logoUrl?: string;
  appName?: string;
}) {
  const gradientId = React.useId();
  const sheenId = `${gradientId}-sheen`;
  const [imgBroken, setImgBroken] = React.useState(false);

  if (logoUrl && !imgBroken) {
    return (
      <img
        src={logoUrl}
        alt={appName}
        className={`${className} rounded-xl object-cover`}
        onError={() => setImgBroken(true)}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 30 30"
      role="img"
      aria-label={appName}
      className={`${className} rounded-xl select-none drop-shadow-[0_2px_8px_rgba(18,48,74,0.35)] transition-transform duration-200`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* گرادیان اصلی — بنفش → فوشیا (هویت تم سلطنتی + فاوآیکون) */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12304A" />
          <stop offset="0.55" stopColor="#1F5F7A" />
          <stop offset="1" stopColor="#19B394" />
        </linearGradient>
        {/* درخشش داخلی — سفید محو از بالا (حس شیشه‌ای) */}
        <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* پس‌زمینه‌ی گرادیانی + هاله‌ی داخلی */}
      <rect x="0.5" y="0.5" width="29" height="29" rx="9.5" fill={`url(#${gradientId})`} />
      <rect x="0.5" y="0.5" width="29" height="29" rx="9.5" fill={`url(#${sheenId})`} />
      {/* خط نوری دور قاب — حس شیشه‌ای */}
      <rect
        x="1.1"
        y="1.1"
        width="27.8"
        height="27.8"
        rx="9"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.25"
        strokeWidth="0.7"
      />
      {/* «ه» هندسی — خطوط سفید با گوشه‌های گرد */}
      <g fill="#ffffff">
        {/* خط افقی بالا */}
        <path d="M15.47,7.1 l-1.3,1.85 c-0.2,0.29 -0.54,0.47 -0.9,0.47 h-7.1 V7.09 Z" />
        {/* قطره‌ی اصلی — مورب مدرن */}
        <polygon points="24.3,7.1 13.14,22.91 5.7,22.91 16.86,7.1" />
        {/* خط افقی پایین */}
        <path d="M14.53,22.91 l1.31,-1.86 c0.2,-0.29 0.54,-0.47 0.9,-0.47 h7.09 v2.33 Z" />
      </g>
      {/* اسپارک — نشانگر هوشمندی، گوشه‌ی بالا-راست */}
      <path
        d="M25.8,3.5 c0.3,0.75 0.75,1.2 1.4,1.4 c-0.65,0.2 -1.1,0.65 -1.4,1.4 c-0.3,-0.75 -0.75,-1.2 -1.4,-1.4 c0.65,-0.2 1.1,-0.65 1.4,-1.4 Z"
        fill="#ffffff"
        fillOpacity="0.95"
      />
      {/* نقطه‌های ریز هم‌راستا با اسپارک — حس داده و نمودار */}
      <circle cx="24.1" cy="2.6" r="0.45" fill="#ffffff" fillOpacity="0.6" />
      <circle cx="27.2" cy="8.1" r="0.4" fill="#ffffff" fillOpacity="0.5" />
    </svg>
  );
}
