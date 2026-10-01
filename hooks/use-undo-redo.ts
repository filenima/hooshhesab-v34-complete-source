"use client";

import * as React from "react";
import { undoToast } from "@/components/ux/undo-toast";

/* ============ use-undo-redo.ts ============
 *
 * مدیریت تاریخچه‌ی undo/redo برای هر نوع داده.
 *
 * ویژگی‌ها:
 * - نگه‌داری یک پشته‌ی history با حداکثر maxHistory ورودی
 * - undo(): برگشت به حالت قبلی
 * - redo(): اعمال مجدد تغییر برگشت‌خورده
 * - setState(): push به history
 * - canUndo / canRedo — flag برای فعال‌سازی دکمه‌ها
 *
 * @example
 * const { state, setState, undo, redo, canUndo, canRedo } = useUndoRedo(
 * { items: [], filter: "all" },
 * 50
 * );
 */

export interface UseUndoRedoReturn<T> {
 state: T;
 setState: (next: T | ((prev: T) => T)) => void;
 undo: () => void;
 redo: () => void;
 canUndo: boolean;
 canRedo: boolean;
 /** طول تاریخچه (برای نمایش) */
 history: T[];
 /** اندیس فعلی در تاریخچه */
 currentIndex: number;
 reset: (next: T) => void;
}

export function useUndoRedo<T>(
 initialData: T,
 maxHistory: number = 50
): UseUndoRedoReturn<T> {
 const [history, setHistory] = React.useState<T[]>([initialData]);
 const [index, setIndex] = React.useState(0);

 const state = history[index];

 const setState = React.useCallback(
 (next: T | ((prev: T) => T)) => {
 setHistory((prevHistory) => {
 const current = prevHistory[index];
 const resolved =
 typeof next === "function"
? (next as (prev: T) => T)(current)
: next;

 // اگر مقدار جدید با فعلی یکسان است، push نکن
 if (Object.is(resolved, current)) return prevHistory;

 // حذف redo های بعد از اندیس فعلی
 const sliced = prevHistory.slice(0, index + 1);
 const newHistory = [...sliced, resolved];

 // محدود کردن به maxHistory
 const trimmed =
 newHistory.length > maxHistory
? newHistory.slice(newHistory.length - maxHistory)
: newHistory;

 // اگر trim کردیم، اندیس را تنظیم کن
 const offset = newHistory.length - trimmed.length;
 setIndex(trimmed.length - 1);
 // اگر offset > 0 باید offset از setIndex کم کنیم — اما setIndex بالا انجام شد
 // در واقع trimmed همیشه newHistory.length = maxHistory است وقتی trim اتفاق می‌افتد
 // و setIndex(trimmed.length - 1) درست است
 if (offset > 0) {
 // noop — setIndex بالا صحیح است
 }

 return trimmed;
 });
 },
 [index, maxHistory]
 );

 const undo = React.useCallback(() => {
 setIndex((prev) => (prev > 0? prev - 1: prev));
 }, []);

 const redo = React.useCallback(() => {
 setIndex((prev) =>
 prev < history.length - 1? prev + 1: prev
 );
 }, [history.length]);

 const reset = React.useCallback(
 (next: T) => {
 setHistory([next]);
 setIndex(0);
 },
 []
 );

 return {
 state,
 setState,
 undo,
 redo,
 canUndo: index > 0,
 canRedo: index < history.length - 1,
 history,
 currentIndex: index,
 reset,
 };
}

export default useUndoRedo;

/* ============ useUndoableAction ============
 *
 * برای عملیات مخرب (مثل حذف) — toast با دکمه‌ی «بازگرداندن» نشان می‌دهد.
 * اگر کاربر روی «بازگرداندن» کلیک کرد، تابع undo اجرا می‌شود.
 *
 * @example
 * const { notify } = useUndoableAction();
 *
 * const handleDelete = (id: string) => {
 * const backup = items.find(i => i.id === id);
 * setItems(prev => prev.filter(i => i.id!== id));
 * notify({
 * title: "حذف شد",
 * description: "آیتم حذف شد",
 * onUndo: () => setItems(prev => [backup,...prev]),
 * });
 * };
 */

export interface UndoableActionOptions {
 title?: React.ReactNode;
 description?: React.ReactNode;
 onUndo: () => void | Promise<void>;
 /** مدت نمایش toast قبل از auto-dismiss (ms) — default: 10000 */
 duration?: number;
}

export interface UseUndoableActionReturn {
 /** نمایش toast با دکمه‌ی بازگرداندن */
 notify: (options: UndoableActionOptions) => string;
}

export function useUndoableAction(): UseUndoableActionReturn {
 const notify = React.useCallback((options: UndoableActionOptions) => {
 return undoToast.show({
 title: options.title?? "عملیات انجام شد",
 description: options.description,
 onUndo: options.onUndo,
 duration: options.duration?? 10000,
 });
 }, []);

 return { notify };
}
