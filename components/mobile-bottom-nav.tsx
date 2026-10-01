"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 LayoutDashboard,
 ShoppingCart,
 Sparkles,
 Wallet,
 Zap,
 type LucideIcon,
} from "lucide-react";
// PERF(speed): prefetch چانک ماژول در لمس اول — قبل از تکمیل کلیک دانلود شروع می‌شود
import { prewarmModule } from "@/lib/module-prewarm";

interface MobileBottomNavProps {
 activeModule: string;
 onNavigate: (id: string) => void;
 onOpenAssistant: () => void;
}

interface NavEntry {
 id: string;
 label: string;
 icon: LucideIcon;
}

// ۴ آیتم کناری + ۱ دکمه مرکزی (AI) — ترتیب RTL
// بروزرسانی: کیف پول و فاکتور سریع — پرکاربردترین‌ها در موبایل (درخواست مالک)
const SIDE_ITEMS: NavEntry[] = [
 { id: "dashboard", label: "داشبورد", icon: LayoutDashboard },
 { id: "quick-invoice-list", label: "فاکتورها", icon: ShoppingCart },
 // دکمه AI در وسط
 { id: "quick-invoice", label: "فاکتور سریع", icon: Zap },
 { id: "wallet", label: "کیف پول", icon: Wallet },
];

/**
 * MobileBottomNav — نوار ناوبری پایین برای موبایل (مخفی در lg+)
 *
 * - ۵ آیتم: داشبورد، فاکتورها، انبار، گزارش‌ها + دکمه AI در وسط
 * - دکمه AI بزرگ‌تر و بالاتر (translate-y-[-8px]) با گرادیانت indigo
 * - آیتم فعال با رنگ indigo و لیبل نمایش داده می‌شود
 * - پس‌زمینه glassmorphism + safe-area padding برای iOS
 * - ترتیب آیتم‌ها RTL (راست به چپ)
 */
export function MobileBottomNav({
 activeModule,
 onNavigate,
 onOpenAssistant,
}: MobileBottomNavProps) {
 return (
 <nav
 aria-label="ناوبری پایین"
 className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t border-border bg-background/85 backdrop-blur-xl"
 style={{
 paddingBottom: "env(safe-area-inset-bottom, 0px)",
 }}
 >
 <ul className="grid grid-cols-5 h-16">
 {SIDE_ITEMS.map((item, idx) => {
 // بعد از آیتم دوم (invoices) یک دکمه AI در وسط قرار می‌گیرد
 const isCenterSlot = idx === 2;
 if (isCenterSlot) {
 return (
 <React.Fragment key="ai-center">
 {/* دکمه مرکزی AI */}
 <li className="relative flex items-center justify-center">
 <motion.button
 type="button"
 onClick={onOpenAssistant}
 animate={{ y: -8 }}
 whileTap={{ scale: 0.9, y: -8 }}
 whileHover={{ scale: 1.05, y: -8 }}
 aria-label="دستیار مالی هوشمند"
 className="absolute -top-2 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background"
 >
 {/* حلقه پالس — محدود به ۳ تکرار (قبلاً بی‌نهایت بود) */}
 <span
 className="absolute inset-0 rounded-full bg-primary/40 animate-ping-finite"
 aria-hidden="true"
 />
 <Sparkles className="relative h-6 w-6" />
 </motion.button>
 {/* لیبل زیر دکمه */}
 <span className="absolute bottom-1.5 text-[9px] text-muted-foreground">
 دستیار
 </span>
 </li>

 {/* سپس آیتم فعلی (inventory) در اسلات خودش */}
 <SideItem
 key={item.id}
 item={item}
 active={activeModule === item.id}
 onClick={() => onNavigate(item.id)}
 />
 </React.Fragment>
 );
 }
 return (
 <SideItem
 key={item.id}
 item={item}
 active={activeModule === item.id}
 onClick={() => onNavigate(item.id)}
 />
 );
 })}
 </ul>
 </nav>
 );
}

// ============ Side item (داخلی) ============
function SideItem({
 item,
 active,
 onClick,
}: {
 item: NavEntry;
 active: boolean;
 onClick: () => void;
}) {
 const Icon = item.icon;
 return (
 <li className="flex relative">
 <button
 type="button"
 onClick={onClick}
 // PERF(speed): در اولین لحظه‌ی لمس/هاور چانک پیش‌دانلود می‌شود → کلیک آنی
 onPointerDown={() => prewarmModule(item.id)}
 onMouseEnter={() => prewarmModule(item.id)}
 aria-current={active? "page": undefined}
 aria-label={item.label}
 className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors"
 >
 <motion.div
 animate={{
 scale: active? 1.1: 1,
 y: active? -1: 0,
 }}
 transition={{ type: "spring", stiffness: 320, damping: 18 }}
 >
 <Icon
 className={`h-5 w-5 transition-colors ${
 active
? "text-primary"
: "text-muted-foreground"
 }`}
 />
 </motion.div>
 <span
 className={`text-[10px] leading-none transition-colors ${
 active
? "text-primary font-medium"
: "text-muted-foreground"
 }`}
 >
 {item.label}
 </span>
 {/* نوار فعال در پایین */}
 <motion.span
 className="absolute bottom-0 h-0.5 rounded-full bg-primary"
 initial={false}
 animate={{
 opacity: active? 1: 0,
 width: active? 28: 0,
 }}
 transition={{ duration: 0.2 }}
 />
 </button>
 </li>
 );
}
