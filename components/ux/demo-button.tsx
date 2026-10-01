"use client";

import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { useDemo } from "@/components/demo-provider";
import { cn } from "@/lib/utils";

type DemoButtonProps = React.ComponentProps<"button"> &
 VariantProps<typeof buttonVariants> & {
 /** اگر true باشد، در حالت دمو اقدام مسدود می‌شود (پیش‌فرض: true) */
 checkDemo?: boolean;
 onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
 asChild?: boolean;
 };

/**
 * دکمه‌ای که به‌صورت خودکار حالت دمو را بررسی می‌کند.
 * اگر کاربر در حالت دمو باشد، onClick اجرا نمی‌شود و toast هشدار نمایش داده می‌شود.
 *
 * مثال:
 * <DemoButton onClick={() => saveInvoice()}>ذخیره</DemoButton>
 *
 * برای غیرفعال کردن بررسی دمو در یک مورد خاص:
 * <DemoButton checkDemo={false} onClick={...}>...</DemoButton>
 */
export function DemoButton({
 children,
 onClick,
 checkDemo = true,
 variant,
 size,
 className,
 asChild = false,
...props
}: DemoButtonProps) {
 const { checkAction } = useDemo();

 const handleClick = React.useCallback(
 (e: React.MouseEvent<HTMLButtonElement>) => {
 if (checkDemo &&!checkAction()) {
 e.preventDefault();
 return;
 }
 onClick?.(e);
 },
 [checkDemo, checkAction, onClick]
 );

 return (
 <Button
 variant={variant}
 size={size}
 className={cn(className)}
 asChild={asChild}
 onClick={handleClick}
 {...props}
 >
 {children}
 </Button>
 );
}
