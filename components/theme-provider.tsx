"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * ThemeProvider — wrapper حول next-themes با پیش‌فرض‌های پروژه‌ی هوش.
 *
 * قرارداد:
 * - attribute="class" (روش استاندارد Tailwind 4 +.dark variant)
 * - defaultTheme="system" — تشخیص خودکار از تنظیمات سیستم‌عامل
 * - enableSystem — پشتیبانی از حالت سیستم
 * - disableTransitionOnChange — جلوگیری از flash رنگ هنگام تغییر تم
 *
 * اگر caller این مقادیر را override کند، آن‌ها را حفظ می‌کنیم.
 */
export function ThemeProvider({
 children,
...props
}: React.ComponentProps<typeof NextThemesProvider>) {
 return (
 <NextThemesProvider
 attribute="class"
 defaultTheme="system"
 enableSystem
 disableTransitionOnChange
 {...props}
 >
 {children}
 </NextThemesProvider>
 );
}
