"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "destructive";

export interface ConfirmOptions {
 /** عنوان دیالوگ */
 title: string;
 /** توضیحات تکمیلی */
 description?: string;
 /** متن دکمه‌ی تأیید — پیش‌فرض: "تأیید" */
 confirmText?: string;
 /** متن دکمه‌ی انصراف — پیش‌فرض: "انصراف" */
 cancelText?: string;
 /** نوع بصری دیالوگ — destructive برای عملیات مخرب (قرمز) */
 variant?: ConfirmVariant;
 /** کال‌بک هنگام تأیید — می‌تواند async باشد؛ تا پایان کار loading نمایش داده می‌شود */
 onConfirm: () => void | Promise<void>;
}

interface DialogState extends ConfirmOptions {
 open: boolean;
}

/**
 * useConfirmAction — hook قابل‌استفاده مجدد برای تأیید عملیات مخرب یا حساس
 *
 * خروجی:
 * - `confirm(opts)`: باز کردن دیالوگ با گزینه‌های داده‌شده
 * - `ConfirmDialogComponent`: کامپوننت دیالوگ — باید یک‌بار در درخت رندر شود
 *
 * @example
 * const { confirm, ConfirmDialogComponent } = useConfirmAction();
 *
 * const handleDelete = () => {
 * confirm({
 * title: "حذف فاکتور؟",
 * description: "این عمل قابل بازگشت نیست.",
 * variant: "destructive",
 * confirmText: "حذف",
 * onConfirm: async () => { await api.delete(); },
 * });
 * };
 *
 * return (
 * <>
 * <Button onClick={handleDelete}>حذف</Button>
 * {ConfirmDialogComponent}
 * </>
 * );
 */
export function useConfirmAction() {
 const [state, setState] = React.useState<DialogState>({
 open: false,
 title: "",
 onConfirm: () => {},
 });
 const [loading, setLoading] = React.useState(false);

 const confirm = React.useCallback((opts: ConfirmOptions) => {
 setState({...opts, open: true });
 }, []);

 const handleConfirm = React.useCallback(
 async (e: React.MouseEvent) => {
 e.preventDefault();
 if (loading) return;
 setLoading(true);
 try {
 await state.onConfirm();
 setState((prev) => ({...prev, open: false }));
 } finally {
 setLoading(false);
 }
 },
 [loading, state]
 );

 const handleOpenChange = React.useCallback((open: boolean) => {
 if (!open &&!loading) {
 setState((prev) => ({...prev, open: false }));
 }
 }, [loading]);

 const variant = state.variant?? "default";

 const ConfirmDialogComponent = (
 <AlertDialog open={state.open} onOpenChange={handleOpenChange}>
 <AlertDialogContent className="max-w-md">
 <AlertDialogHeader>
 <div className="flex items-start gap-3">
 <div
 className={cn(
 "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
 variant === "destructive"
? "bg-destructive/10 text-destructive"
: "bg-primary/10 text-primary"
 )}
 >
 <AlertTriangle className="h-5 w-5" />
 </div>
 <div className="flex-1">
 <AlertDialogTitle className="text-base text-right">
 {state.title}
 </AlertDialogTitle>
 {state.description && (
 <AlertDialogDescription className="text-right mt-1">
 {state.description}
 </AlertDialogDescription>
 )}
 </div>
 </div>
 </AlertDialogHeader>
 <AlertDialogFooter className="flex-row gap-2">
 <AlertDialogCancel disabled={loading} className="ms-0">
 {state.cancelText?? "انصراف"}
 </AlertDialogCancel>
 <AlertDialogAction
 onClick={handleConfirm}
 disabled={loading}
 className={cn(
 variant === "destructive" &&
 "bg-destructive text-destructive-foreground hover:bg-destructive/90"
 )}
 >
 {loading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
 {state.confirmText?? "تأیید"}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 );

 return { confirm, ConfirmDialogComponent };
}

export default useConfirmAction;
