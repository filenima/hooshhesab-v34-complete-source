"use client";

import * as React from "react";

/**
 * ModuleSkeleton — اسکلتون یکپارچه برای بارگذاری ماژول‌ها.
 *
 * شامل:
 * - ۴ کارت KPI (موجودی نقدی، فروش، خرید، سود)
 * - ۲ نمودار (سکه‌ای + خطی)
 * - ۱ جدول
 *
 * از کلاس `.skeleton` با انیمیشن shimmer ایندیگو-رنگ استفاده می‌کند.
 *
 * @example
 * <React.Suspense fallback={<ModuleSkeleton />}>
 * <Invoices />
 * </React.Suspense>
 */
export function ModuleSkeleton() {
 return (
 <div
 className="space-y-5 animate-fade-in-up"
 aria-busy="true"
 aria-live="polite"
 role="status"
 aria-label="در حال بارگذاری..."
 >
 {/* ۴ کارت KPI */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
 {Array.from({ length: 4 }).map((_, i) => (
 <div
 key={i}
 className="rounded-xl border border-border bg-card p-4 lg:p-5 card-hover"
 >
 <div className="flex items-center justify-between mb-3">
 <div className="h-9 w-9 rounded-lg skeleton" />
 <div className="h-5 w-12 rounded-full skeleton" />
 </div>
 <div className="h-3 w-16 rounded skeleton mb-2" />
 <div className="h-6 w-24 rounded skeleton" />
 </div>
 ))}
 </div>

 {/* ۲ نمودار */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
 <div className="rounded-xl border border-border bg-card p-4 lg:p-5 card-hover">
 <div className="flex items-center justify-between mb-4">
 <div className="h-4 w-32 rounded skeleton" />
 <div className="h-6 w-6 rounded skeleton" />
 </div>
 {/* نمودار سکه‌ای (donut) */}
 <div className="flex items-center justify-center py-4">
 <div className="h-40 w-40 rounded-full skeleton" />
 </div>
 <div className="flex items-center justify-center gap-4 mt-2">
 <div className="h-3 w-20 rounded skeleton" />
 <div className="h-3 w-20 rounded skeleton" />
 </div>
 </div>
 <div className="rounded-xl border border-border bg-card p-4 lg:p-5 card-hover">
 <div className="flex items-center justify-between mb-4">
 <div className="h-4 w-32 rounded skeleton" />
 <div className="h-6 w-6 rounded skeleton" />
 </div>
 {/* نمودار خطی با میله‌ها */}
 <div className="flex items-end justify-between gap-2 h-40 px-2">
 {Array.from({ length: 9 }).map((_, i) => (
 <div
 key={i}
 className="flex-1 rounded-t skeleton"
 style={{ height: `${30 + ((i * 13) % 60)}%` }}
 />
 ))}
 </div>
 <div className="flex items-center justify-between mt-3 px-2">
 {Array.from({ length: 5 }).map((_, i) => (
 <div key={i} className="h-2 w-10 rounded skeleton" />
 ))}
 </div>
 </div>
 </div>

 {/* ۱ جدول */}
 <div className="rounded-xl border border-border bg-card p-4 lg:p-5 card-hover">
 <div className="flex items-center justify-between mb-4">
 <div className="h-4 w-40 rounded skeleton" />
 <div className="h-8 w-24 rounded-lg skeleton" />
 </div>
 <div className="space-y-2">
 {/* هدر */}
 <div className="grid grid-cols-6 gap-3 pb-2 border-b border-border">
 {Array.from({ length: 6 }).map((_, i) => (
 <div key={i} className="h-3 rounded skeleton" />
 ))}
 </div>
 {/* ردیف‌ها */}
 {Array.from({ length: 6 }).map((_, row) => (
 <div key={row} className="grid grid-cols-6 gap-3 py-2.5">
 {Array.from({ length: 6 }).map((_, col) => (
 <div
 key={col}
 className="h-3 rounded skeleton"
 style={{ width: `${50 + ((col + row * 7) % 40)}%` }}
 />
 ))}
 </div>
 ))}
 </div>
 </div>

 <span className="sr-only">در حال بارگذاری ماژول...</span>
 </div>
 );
}

export default ModuleSkeleton;
