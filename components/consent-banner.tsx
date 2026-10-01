"use client";

import * as React from "react";
import { Cookie, X, Check, Shield, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import {
 getConsent,
 setConsent,
 type ConsentChoice,
} from "@/lib/marketing";
import { cn } from "@/lib/utils";

/**
 * GDPR/Privacy Consent Banner
 * - در ابتدای اولین بازدید نمایش داده می‌شود
 * - سه گزینه: Accept All / Reject / Customize
 * - انتخاب در localStorage ذخیره می‌شود
 * - در صورت accept، GA4 راه‌اندازی می‌شود (در lib/marketing)
 */
export function ConsentBanner() {
 const [visible, setVisible] = React.useState(false);
 const [customizeOpen, setCustomizeOpen] = React.useState(false);
 const [analytics, setAnalytics] = React.useState(true);
 const [marketing, setMarketing] = React.useState(true);

 // بررسی وضعیت consent در mount
 React.useEffect(() => {
 const existing = getConsent();
 if (!existing) {
 // نمایش پس از تأخیر کوتاه برای UX بهتر
 const t = setTimeout(() => setVisible(true), 800);
 return () => clearTimeout(t);
 }
 }, []);

 const handleAcceptAll = () => {
 setConsent({
 necessary: true,
 analytics: true,
 marketing: true,
 });
 setVisible(false);
 setCustomizeOpen(false);
 };

 const handleRejectAll = () => {
 setConsent({
 necessary: true,
 analytics: false,
 marketing: false,
 });
 setVisible(false);
 setCustomizeOpen(false);
 };

 const handleSaveCustomize = () => {
 setConsent({
 necessary: true,
 analytics,
 marketing,
 });
 setVisible(false);
 setCustomizeOpen(false);
 };

 if (!visible) return null;

 return (
 <>
 {/* Banner */}
 <div
 className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-0 inset-x-0 z-50 p-3 sm:p-4 animate-fade-in-up"
 role="region"
 aria-label="هشدار رضایت به کوکی‌ها"
 >
 <div className="mx-auto max-w-4xl rounded-xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
 <div className="flex flex-col sm:flex-row items-start gap-3 p-4">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <Cookie className="h-5 w-5" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <h3 className="text-sm font-bold text-foreground">
 رضایت به استفاده از کوکی
 </h3>
 <Badge variant="outline" className="text-[9px] h-4 px-1 bg-primary/5 text-primary border-primary/30">
 <Shield className="h-2.5 w-2.5 ml-0.5" />
 GDPR
 </Badge>
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed">
 ما از کوکی‌های ضروری برای عملکرد صحیح سرویس استفاده می‌کنیم.
 با اجازه دادن کوکی‌های تحلیلی، به ما کمک می‌کنید محصول را بهبود
 ببخشیم. همواره می‌توانید تنظیمات را در هر زمان تغییر دهید.
 </p>
 </div>
 <div className="flex items-center gap-2 flex-wrap shrink-0">
 <Button
 size="sm"
 variant="outline"
 className="h-8 text-xs"
 onClick={() => setCustomizeOpen(true)}
 >
 <Settings2 className="h-3.5 w-3.5" />
 سفارشی‌سازی
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-8 text-xs text-muted-foreground"
 onClick={handleRejectAll}
 >
 رد کردن
 </Button>
 <Button
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={handleAcceptAll}
 >
 <Check className="h-3.5 w-3.5" />
 پذیرش همه
 </Button>
 <button
 onClick={() => setVisible(false)}
 className="text-muted-foreground hover:text-foreground p-1"
 aria-label="بستن"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 </div>
 </div>
 </div>
 </div>

 {/* Customize Dialog */}
 <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Settings2 className="h-4 w-4 text-primary" />
 سفارشی‌سازی کوکی
 </DialogTitle>
 <DialogDescription className="text-xs">
 انتخاب کنید کدام دسته کوکی‌ها برای شما فعال باشد
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-2.5 py-2">
 {/* Necessary */}
 <CookieCategory
 title="کوکی‌های ضروری"
 description="برای عملکرد صحیح سرویس الزامی هستند (احراز هویت، امنیت، تنظیمات کاربری)"
 disabled
 checked
 />
 {/* Analytics */}
 <CookieCategory
 title="کوکی‌های تحلیلی"
 description="برای جمع‌آوری آمار ناشناس استفاده از سرویس و بهبود تجربه کاربری"
 checked={analytics}
 onCheckedChange={(c) => setAnalytics(!!c)}
 />
 {/* Marketing */}
 <CookieCategory
 title="کوکی‌های بازاریابی"
 description="برای نمایش نوتیفیکیشن‌ها و ارتباطات تبلیغاتی مرتبط"
 checked={marketing}
 onCheckedChange={(c) => setMarketing(!!c)}
 />
 </div>

 <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
 <Button
 variant="ghost"
 size="sm"
 className="text-xs"
 onClick={handleRejectAll}
 >
 رد کردن همه
 </Button>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="text-xs gap-1"
 onClick={handleSaveCustomize}
 >
 ذخیره انتخاب
 </Button>
 <Button
 size="sm"
 className="text-xs gap-1"
 onClick={handleAcceptAll}
 >
 <Check className="h-3.5 w-3.5" />
 پذیرش همه
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 </>
 );
}

interface CookieCategoryProps {
 title: string;
 description: string;
 checked: boolean;
 onCheckedChange?: (checked: boolean) => void;
 disabled?: boolean;
}

function CookieCategory({
 title,
 description,
 checked,
 onCheckedChange,
 disabled,
}: CookieCategoryProps) {
 return (
 <label
 className={cn(
 "flex items-start gap-3 rounded-lg border border-border p-3 transition-colors",
 disabled
? "bg-muted/30 cursor-not-allowed"
: "hover:bg-muted/40 cursor-pointer",
 checked &&!disabled && "border-primary/30 bg-primary/5"
 )}
 >
 <Checkbox
 checked={checked}
 disabled={disabled}
 onCheckedChange={(c) => onCheckedChange?.(!!c)}
 className="mt-0.5"
 />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <span className="text-xs font-medium text-foreground">{title}</span>
 {disabled && (
 <Badge variant="secondary" className="text-[9px] h-4 px-1">
 الزامی
 </Badge>
 )}
 </div>
 <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
 {description}
 </p>
 </div>
 </label>
 );
}

export type { ConsentChoice };
export default ConsentBanner;
