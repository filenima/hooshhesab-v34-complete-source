"use client";

import * as React from "react";

/**
 * EmptyIllustration — تصاویر SVG خطی برای حالت‌های خالی.
 *
 * بدون استفاده از تصاویر رستری؛ تماماً SVG با رنگ‌بندی ایندیگو/تیال.
 * اندازه پیش‌فرض: ۱۲۰×۱۲۰ پیکسل.
 *
 * @example
 * <EmptyIllustration type="no-invoices" />
 */

export type IllustrationType =
 | "no-invoices"
 | "no-products"
 | "no-data"
 | "no-customers";

const STROKE = "var(--primary)";
const STROKE_TEAL = "var(--success)";
const FILL_SOFT = "var(--accent)";

export function EmptyIllustration({
 type,
 size = 120,
 className,
}: {
 type: IllustrationType;
 size?: number;
 className?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 120 120"
 fill="none"
 role="img"
 aria-hidden="true"
 className={className}
 >
 {renderIllustration(type)}
 </svg>
 );
}

function renderIllustration(type: IllustrationType) {
 switch (type) {
 case "no-invoices":
 return <NoInvoices />;
 case "no-products":
 return <NoProducts />;
 case "no-data":
 return <NoData />;
 case "no-customers":
 return <NoCustomers />;
 default:
 return <NoData />;
 }
}

/** سند با ذره‌بین */
function NoInvoices() {
 return (
 <>
 {/* سند */}
 <rect
 x="26"
 y="20"
 width="44"
 height="58"
 rx="4"
 fill={FILL_SOFT}
 stroke={STROKE}
 strokeWidth="2"
 />
 <line x1="34" y1="32" x2="62" y2="32" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
 <line x1="34" y1="42" x2="62" y2="42" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
 <line x1="34" y1="52" x2="54" y2="52" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
 <line x1="34" y1="62" x2="50" y2="62" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
 {/* ذره‌بین */}
 <circle
 cx="80"
 cy="78"
 r="16"
 fill="var(--background)"
 stroke={STROKE_TEAL}
 strokeWidth="2.5"
 />
 <line
 x1="92"
 y1="90"
 x2="102"
 y2="100"
 stroke={STROKE_TEAL}
 strokeWidth="3"
 strokeLinecap="round"
 />
 </>
 );
}

/** جعبه با ذره‌بین */
function NoProducts() {
 return (
 <>
 {/* جعبه */}
 <path
 d="M28 38 L60 22 L92 38 L92 78 L60 94 L28 78 Z"
 fill={FILL_SOFT}
 stroke={STROKE}
 strokeWidth="2"
 strokeLinejoin="round"
 />
 <path
 d="M28 38 L60 54 L92 38"
 stroke={STROKE}
 strokeWidth="2"
 strokeLinejoin="round"
 />
 <line
 x1="60"
 y1="54"
 x2="60"
 y2="94"
 stroke={STROKE}
 strokeWidth="2"
 />
 {/* ذره‌بین */}
 <circle
 cx="84"
 cy="86"
 r="14"
 fill="var(--background)"
 stroke={STROKE_TEAL}
 strokeWidth="2.5"
 />
 <line
 x1="94"
 y1="96"
 x2="102"
 y2="104"
 stroke={STROKE_TEAL}
 strokeWidth="3"
 strokeLinecap="round"
 />
 </>
 );
}

/** نمودار با داده خالی */
function NoData() {
 return (
 <>
 {/* محورها */}
 <line x1="22" y1="20" x2="22" y2="96" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
 <line x1="22" y1="96" x2="100" y2="96" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
 {/* میله‌های خالی (دیفالت) */}
 <rect x="32" y="72" width="12" height="24" rx="2" fill={FILL_SOFT} stroke={STROKE} strokeWidth="1.5" />
 <rect x="50" y="60" width="12" height="36" rx="2" fill={FILL_SOFT} stroke={STROKE} strokeWidth="1.5" />
 <rect x="68" y="80" width="12" height="16" rx="2" fill={FILL_SOFT} stroke={STROKE} strokeWidth="1.5" />
 {/* علامت «خالی» */}
 <line
 x1="34"
 y1="74"
 x2="42"
 y2="78"
 stroke={STROKE_TEAL}
 strokeWidth="2"
 strokeLinecap="round"
 />
 <line
 x1="52"
 y1="62"
 x2="60"
 y2="66"
 stroke={STROKE_TEAL}
 strokeWidth="2"
 strokeLinecap="round"
 />
 <line
 x1="70"
 y1="82"
 x2="78"
 y2="86"
 stroke={STROKE_TEAL}
 strokeWidth="2"
 strokeLinecap="round"
 />
 {/* نقطه‌چین بالای محور */}
 <line
 x1="22"
 y1="40"
 x2="100"
 y2="40"
 stroke={STROKE}
 strokeWidth="1.5"
 strokeDasharray="3 4"
 opacity="0.5"
 />
 </>
 );
}

/** افراد با ذره‌بین */
function NoCustomers() {
 return (
 <>
 {/* سر و بدن — شخص اول */}
 <circle cx="44" cy="38" r="9" fill={FILL_SOFT} stroke={STROKE} strokeWidth="2" />
 <path
 d="M28 78 C28 60 60 60 60 78"
 fill={FILL_SOFT}
 stroke={STROKE}
 strokeWidth="2"
 strokeLinecap="round"
 />
 {/* سر و بدن — شخص دوم */}
 <circle cx="70" cy="46" r="8" fill="var(--background)" stroke={STROKE} strokeWidth="2" />
 <path
 d="M58 82 C58 66 82 66 82 82"
 fill="var(--background)"
 stroke={STROKE}
 strokeWidth="2"
 strokeLinecap="round"
 />
 {/* ذره‌بین */}
 <circle
 cx="86"
 cy="80"
 r="14"
 fill="var(--background)"
 stroke={STROKE_TEAL}
 strokeWidth="2.5"
 />
 <line
 x1="96"
 y1="90"
 x2="104"
 y2="98"
 stroke={STROKE_TEAL}
 strokeWidth="3"
 strokeLinecap="round"
 />
 </>
 );
}

export default EmptyIllustration;
