"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
 EmptyIllustration,
 type IllustrationType,
} from "@/components/ux/empty-illustration";

/**
 * EmptyState — حالت خالی برای جداول/لیست‌ها بدون داده
 *
 * @example
 * <EmptyState
 * icon={Inbox}
 * title="فاکتوری یافت نشد"
 * description="برای ثبت اولین فاکتور روی دکمه زیر کلیک کنید"
 * action={<Button>فاکتور جدید</Button>}
 * />
 *
 * @example با تصویر SVG
 * <EmptyState
 * illustration="no-invoices"
 * title="هنوز فاکتوری ثبت نشده"
 * description="با ثبت اولین فاکتور، آمار فروش اینجا نمایش داده می‌شود."
 * action={<Button>فاکتور جدید</Button>}
 * />
 */
export function EmptyState({
 icon: Icon,
 illustration,
 title,
 description,
 action,
 className,
}: {
 icon?: LucideIcon;
 illustration?: IllustrationType;
 title: string;
 description?: string;
 action?: React.ReactNode;
 className?: string;
}) {
 return (
 <div
 className={cn(
 "flex flex-col items-center justify-center text-center py-12 px-6",
 className
 )}
 >
 {illustration? (
 <EmptyIllustration type={illustration} className="mb-3" />
 ): Icon? (
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
 <Icon className="h-7 w-7" strokeWidth={1.5} />
 </div>
 ): null}
 <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
 {description && (
 <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-4">
 {description}
 </p>
 )}
 {action && <div className="mt-1">{action}</div>}
 </div>
 );
}

export default EmptyState;
