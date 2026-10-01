"use client";

import * as React from "react";
import { List } from "lucide-react";

export interface TocItem {
 id: string;
 text: string;
 level: number; // 2 = h2, 3 = h3
}

interface TableOfContentsProps {
 items: TocItem[];
}

/**
 * TableOfContents — فهرست مطالب مقاله با scroll-spy
 *
 * برای مقالات طولانی، یک فهرست چسبان (sticky) در کنار محتوا نمایش می‌دهد
 * که با اسکرول کاربر، بخش فعال را هایلایت می‌کند.
 */
export function TableOfContents({ items }: TableOfContentsProps) {
 const [activeId, setActiveId] = React.useState<string>("");

 React.useEffect(() => {
 if (items.length === 0) return;

 const observer = new IntersectionObserver(
 (entries) => {
 for (const entry of entries) {
 if (entry.isIntersecting) {
 setActiveId(entry.target.id);
 }
 }
 },
 {
 rootMargin: "0px 0px -70% 0px",
 threshold: 0,
 }
 );

 for (const item of items) {
 const el = document.getElementById(item.id);
 if (el) observer.observe(el);
 }

 return () => observer.disconnect();
 }, [items]);

 if (items.length === 0) return null;

 const activeIndex = items.findIndex((it) => it.id === activeId);

 return (
 <nav
 aria-label="فهرست مطالب"
 className="rounded-xl border border-border bg-card p-4"
 >
 <div className="flex items-center gap-1.5 mb-3">
 <List className="h-4 w-4 text-primary" />
 <h2 className="text-sm font-semibold">فهرست مطالب</h2>
 {activeIndex >= 0 && (
 <span className="ms-auto text-[10px] font-medium text-muted-foreground/70 tnum">
 {toPersian(activeIndex + 1)} / {toPersian(items.length)}
 </span>
 )}
 </div>
 <ul className="relative space-y-0.5">
 {/* خط عمودی راهنما */}
 <span
 aria-hidden
 className="absolute top-1 bottom-1 start-[3px] w-px bg-border"
 />
 {items.map((item) => {
 const isActive = activeId === item.id;
 return (
 <li
 key={item.id}
 style={{ paddingInlineStart: `${(item.level - 2) * 14}px` }}
 >
 <a
 href={`#${item.id}`}
 aria-current={isActive ? "location" : undefined}
 className={`group relative flex items-center gap-2 rounded-md py-1.5 pe-2 text-xs leading-relaxed transition-all duration-200 ${
 isActive
 ? "bg-primary/15 font-bold text-primary"
 : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
 }`}
 style={item.level >= 3 ? { fontSize: "11px" } : undefined}
 >
 {/* نقطهٔ نشانگر روی خط */}
 <span
 aria-hidden
 className={`relative z-10 ms-0.5 h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300 ${
 isActive
 ? "scale-125 bg-primary shadow-[0_0_0_3px] shadow-primary/20"
 : "bg-muted-foreground/30 group-hover:bg-muted-foreground/60"
 }`}
 />
 <span className="flex-1">
 {item.text}
 </span>
 </a>
 </li>
 );
 })}
 </ul>
 </nav>
 );
}

function toPersian(n: number): string {
 return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
