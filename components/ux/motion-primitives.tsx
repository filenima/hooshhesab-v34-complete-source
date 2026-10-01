"use client";

import * as React from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

// ============ Scroll Reveal ============
// المان‌ها هنگام اسکرول شدن با fade-in + translateY ظاهر می‌شوند

interface RevealProps {
 children: React.ReactNode;
 delay?: number;
 y?: number;
 className?: string;
 once?: boolean;
}

export function Reveal({
 children,
 delay = 0,
 y = 20,
 className,
 once = true,
}: RevealProps) {
 const ref = React.useRef<HTMLDivElement>(null);
 const isInView = useInView(ref, { once, margin: "-50px 0px" });

 return (
 <motion.div
 ref={ref}
 initial={{ opacity: 0, y }}
 animate={isInView? { opacity: 1, y: 0 }: { opacity: 0, y }}
 transition={{
 duration: 0.5,
 delay,
 ease: [0.22, 1, 0.36, 1], // cubic-bezier برای حس Linear/Stripe
 }}
 className={className}
 >
 {children}
 </motion.div>
 );
}

// ============ Stagger Container ============
// برای ظاهر شدن زنجیره‌ای المان‌های فرزند

export function StaggerGroup({
 children,
 className,
 stagger = 0.08,
}: {
 children: React.ReactNode;
 className?: string;
 stagger?: number;
}) {
 const ref = React.useRef<HTMLDivElement>(null);
 const isInView = useInView(ref, { once: true, margin: "-50px 0px" });

 const containerVariants: Variants = {
 hidden: { opacity: 0 },
 show: {
 opacity: 1,
 transition: {
 staggerChildren: stagger,
 delayChildren: 0.1,
 },
 },
 };

 return (
 <motion.div
 ref={ref}
 variants={containerVariants}
 initial="hidden"
 animate={isInView? "show": "hidden"}
 className={className}
 >
 {children}
 </motion.div>
 );
}

export function StaggerItem({
 children,
 className,
 y = 20,
}: {
 children: React.ReactNode;
 className?: string;
 y?: number;
}) {
 const itemVariants: Variants = {
 hidden: { opacity: 0, y },
 show: {
 opacity: 1,
 y: 0,
 transition: {
 duration: 0.5,
 ease: [0.22, 1, 0.36, 1],
 },
 },
 };

 return (
 <motion.div variants={itemVariants} className={className}>
 {children}
 </motion.div>
 );
}

// ============ Pulse Button ============
// دکمه‌های مهم با افکت پالس نرم box-shadow

export function PulseButton({
 children,
 className,
...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
 return (
 <button
 className={cn(
 "relative inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90",
 "shadow-[0_0_0_0_rgba(79,70,229,0.4)]",
 "hover:shadow-[0_0_0_8px_rgba(79,70,229,0)]",
 "active:scale-[0.97]",
 className
 )}
 style={{
 animation: "pulse-shadow 2s infinite",
 }}
 {...props}
 >
 {children}
 </button>
 );
}

// ============ Hover Card ============
// کارت با هاور ملایم: translateY(-4px) + سایه قوی‌تر

export function HoverCard({
 children,
 className,
}: {
 children: React.ReactNode;
 className?: string;
}) {
 return (
 <div
 className={cn(
 "group relative overflow-hidden rounded-xl border border-border bg-card p-6",
 "transition-all duration-200 ease-out",
 "hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5",
 "hover:border-primary/30",
 // v28 — لهجهٔ بالایی گرادیانی: با هاور از راست کشیده می‌شود (RTL)
 "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:origin-right",
 "before:scale-x-0 before:bg-gradient-to-l before:from-primary before:to-primary/40",
 "before:transition-transform before:duration-300 before:ease-out",
 "hover:before:scale-x-100",
 className
 )}
 >
 {children}
 </div>
 );
}

// ============ Animated Counter ============
// شمارش انیمیشنی اعداد

export function AnimatedCounter({
 value,
 duration = 2,
 format,
 className,
}: {
 value: number;
 duration?: number;
 format?: (n: number) => string;
 className?: string;
}) {
 const [count, setCount] = React.useState(0);
 const ref = React.useRef<HTMLSpanElement>(null);
 const isInView = useInView(ref, { once: true });
 const hasAnimated = React.useRef(false);

 React.useEffect(() => {
 if (!isInView || hasAnimated.current) return;
 hasAnimated.current = true;

 let startTime: number;
 let rafId: number;

 const animate = (currentTime: number) => {
 if (!startTime) startTime = currentTime;
 const elapsed = (currentTime - startTime) / 1000;
 const progress = Math.min(elapsed / duration, 1);
 const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
 setCount(Math.floor(eased * value));

 if (progress < 1) {
 rafId = requestAnimationFrame(animate);
 } else {
 setCount(value);
 }
 };

 rafId = requestAnimationFrame(animate);
 return () => cancelAnimationFrame(rafId);
 }, [isInView, value, duration]);

 return (
 <span ref={ref} className={className}>
 {format? format(count): count}
 </span>
 );
}

// ============ Gradient Text ============

export function GradientText({
 children,
 className,
}: {
 children: React.ReactNode;
 className?: string;
}) {
 return (
 <span
 className={cn(
 "bg-gradient-to-l from-primary via-primary to-primary/60 bg-clip-text text-transparent",
 className
 )}
 >
 {children}
 </span>
 );
}
