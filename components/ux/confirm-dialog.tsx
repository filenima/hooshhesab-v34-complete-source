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

/**
 * ConfirmDialog — دیالوگ تأیید عملیات با پشتیبانی از حالت مخرب (قرمز) و پیش‌فرض (indigo)
 *
 * @example
 * const [open, setOpen] = React.useState(false);
 * <ConfirmDialog
 * open={open}
 * onOpenChange={setOpen}
 * title="حذف فاکتور؟"
 * description="این عمل قابل بازگشت نیست."
 * variant="destructive"
 * confirmText="حذف"
 * onConfirm={async () => { await deleteInvoice(); }}
 * />
 */
export function ConfirmDialog({
 open,
 onOpenChange,
 title,
 description,
 confirmText = "تأیید",
 cancelText = "انصراف",
 variant = "default",
 onConfirm,
}: {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 title: string;
 description?: string;
 confirmText?: string;
 cancelText?: string;
 variant?: ConfirmVariant;
 onConfirm: () => void | Promise<void>;
}) {
 const [loading, setLoading] = React.useState(false);

 const handleConfirm = async (e: React.MouseEvent) => {
 e.preventDefault();
 if (loading) return;
 setLoading(true);
 try {
 await onConfirm();
 onOpenChange(false);
 } finally {
 setLoading(false);
 }
 };

 return (
 <AlertDialog open={open} onOpenChange={onOpenChange}>
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
 {title}
 </AlertDialogTitle>
 {description && (
 <AlertDialogDescription className="text-right mt-1">
 {description}
 </AlertDialogDescription>
 )}
 </div>
 </div>
 </AlertDialogHeader>
 <AlertDialogFooter className="flex-row gap-2">
 <AlertDialogCancel
 disabled={loading}
 className="ms-0"
 >
 {cancelText}
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
 {confirmText}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 );
}

export default ConfirmDialog;
