"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ============ undo-toast.tsx ============
 *
 * Toast با دکمه‌ی «بازگرداندن» برای عملیات مخرب.
 *
 * ویژگی‌ها:
 * - نمایش پس از عملیات (delete/update)
 * - دکمه‌ی «بازگرداندن» برای reverse کردن عملیات
 * - auto-dismiss پس از ۱۰ ثانیه
 * - تم ایندیگو، RTL
 *
 * استفاده:
 * ۱. <UndoToastContainer /> را در root رندر کنید (یک‌بار)
 * ۲. import { undoToast } from "@/components/ux/undo-toast";
 * ۳. undoToast.show({ title, description, onUndo });
 */

export interface UndoToastItem {
 id: string;
 title?: React.ReactNode;
 description?: React.ReactNode;
 onUndo: () => void | Promise<void>;
 duration: number;
 createdAt: number;
}

let idCounter = 0;
function genId(): string {
 idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
 return `ut-${idCounter}-${Date.now()}`;
}

const listeners = new Set<(items: UndoToastItem[]) => void>();
let items: UndoToastItem[] = [];
const MAX_ITEMS = 3;

function setItems(next: UndoToastItem[]) {
 items = next.slice(-MAX_ITEMS);
 listeners.forEach((l) => l(items));
}

function dismiss(id: string) {
 setItems(items.filter((i) => i.id!== id));
}

/** API سراسری */
export const undoToast = {
 show(options: {
 title?: React.ReactNode;
 description?: React.ReactNode;
 onUndo: () => void | Promise<void>;
 duration?: number;
 }): string {
 const id = genId();
 const item: UndoToastItem = {
 id,
 title: options.title,
 description: options.description,
 onUndo: options.onUndo,
 duration: options.duration?? 10000,
 createdAt: Date.now(),
 };
 setItems([...items, item]);
 if (item.duration > 0) {
 setTimeout(() => dismiss(id), item.duration);
 }
 return id;
 },
 dismiss,
};

/* ============ رندر ============ */
function UndoToastCard({ item }: { item: UndoToastItem }) {
 const [running, setRunning] = React.useState(false);

 // نوار پیشرفت تا auto-dismiss
 const [progress, setProgress] = React.useState(100);
 React.useEffect(() => {
 if (item.duration <= 0) return;
 const start = Date.now();
 const tick = setInterval(() => {
 const elapsed = Date.now() - start;
 const pct = Math.max(0, 100 - (elapsed / item.duration) * 100);
 setProgress(pct);
 if (pct <= 0) clearInterval(tick);
 }, 60);
 return () => clearInterval(tick);
 }, [item.duration]);

 const handleUndo = async () => {
 if (running) return;
 setRunning(true);
 try {
 await item.onUndo();
 } finally {
 dismiss(item.id);
 }
 };

 return (
 <div
 role="alert"
 aria-live="assertive"
 className={cn(
 "pointer-events-auto relative w-[calc(100vw-2rem)] sm:w-96",
 "rounded-lg border border-primary/30 bg-card/95 backdrop-blur shadow-lg",
 "animate-slide-in-right overflow-hidden"
 )}
 >
 <div className="flex items-start gap-2.5 p-3 pe-2">
 <div className="flex-1 min-w-0 space-y-0.5">
 {item.title && (
 <div className="text-sm font-semibold text-foreground">
 {item.title}
 </div>
 )}
 {item.description && (
 <div className="text-xs text-muted-foreground leading-relaxed">
 {item.description}
 </div>
 )}
 </div>
 <button
 type="button"
 onClick={() => dismiss(item.id)}
 aria-label="بستن"
 className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 </div>
 <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
 <Button
 type="button"
 variant="default"
 size="sm"
 className="h-8 gap-1.5 text-xs"
 onClick={handleUndo}
 disabled={running}
 >
 <Undo2 className="h-3.5 w-3.5" />
 بازگرداندن
 </Button>
 </div>
 {item.duration > 0 && (
 <div className="absolute bottom-0 inset-inline-0 h-0.5 bg-muted">
 <div
 className="h-full bg-primary/50 transition-[width] duration-75 ease-linear"
 style={{ width: `${progress}%` }}
 />
 </div>
 )}
 </div>
 );
}

export function UndoToastContainer() {
 const [list, setList] = React.useState<UndoToastItem[]>(items);
 const [mounted, setMounted] = React.useState(false);

 React.useEffect(() => {
 setMounted(true);
 listeners.add(setList);
 return () => {
 listeners.delete(setList);
 };
 }, []);

 if (!mounted || list.length === 0) return null;

 return createPortal(
 <div
 aria-live="assertive"
 className="fixed z-[210] bottom-4 inset-inline-end-4 flex flex-col gap-2 pointer-events-none"
 >
 {list.map((item) => (
 <UndoToastCard key={item.id} item={item} />
 ))}
 </div>,
 document.body
 );
}

export default UndoToastContainer;
