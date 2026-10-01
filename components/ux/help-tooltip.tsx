"use client";

/**
 * HelpTooltip — آیکن کوچک «؟» که با hover یا کلیک،
 * توضیحات فارسیِ المان فنی را در یک Popover نمایش می‌دهد.
 *
 * - آیکون HelpCircle از lucide (14px)
 * - تم indigo (text-primary)
 * - محتوا می‌تواند چندخطی باشد
 * - RTL، قابل دسترس با کیبورد (focus)
 */

import * as React from "react";
import { HelpCircle } from "lucide-react";
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface HelpTooltipProps {
 /** متن توضیح فارسی (می‌تواند شامل \n باشد) */
 content: string;
 /** کلاس اضافی برای trigger */
 className?: string;
 /** اندازه آیکون (پیش‌فرض 14px) */
 size?: number;
 /** عنوان اختیاری برای popover */
 title?: string;
}

export function HelpTooltip({
 content,
 className,
 size = 14,
 title,
}: HelpTooltipProps) {
 const [open, setOpen] = React.useState(false);

 if (!content) return null;

 return (
 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>
 <button
 type="button"
 aria-label={title || "راهنما"}
 onClick={(e) => {
 e.preventDefault();
 e.stopPropagation();
 setOpen((o) =>!o);
 }}
 className={cn(
 "inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
 className
 )}
 >
 <HelpCircle className="text-primary/70 hover:text-primary" style={{ width: size, height: size }} />
 </button>
 </PopoverTrigger>
 <PopoverContent
 side="top"
 align="center"
 sideOffset={6}
 className="max-w-xs text-xs leading-relaxed p-3 shadow-lg border-border bg-popover text-popover-foreground"
 >
 {title && (
 <p className="font-semibold text-foreground mb-1 text-[12px] flex items-center gap-1.5">
 <HelpCircle className="h-3.5 w-3.5 text-primary" />
 {title}
 </p>
 )}
 <p className="whitespace-pre-line text-muted-foreground text-[11.5px] leading-6">
 {content}
 </p>
 </PopoverContent>
 </Popover>
 );
}

/**
 * مجموعه‌ای از توضیحات استاندارد برای اصطلاحات فنی.
 * در سراسر اپ می‌توان از این آبجکت برای یکدستی توضیحات استفاده کرد.
 */
export const HELP_TEXTS: Record<string, { title: string; content: string }> = {
 API_KEY: {
 title: "کلید API",
 content:
 "کلید API یک کد منحصر‌به‌فرد است که به برنامه‌های دیگر اجازه می‌دهد به داده‌های هوش شما دسترسی داشته باشند. این کلید را از منوی «حساب کاربری > کلیدهای API» دریافت کنید.",
 },
 WEBHOOK: {
 title: "Webhook",
 content:
 "Webhook یک آدرس است که هوش هنگام رخ دادن رویدادهای خاص (مثلاً ثبت فاکتور جدید) به آن اطلاع می‌فرستد. برای دریافت رویدادها باید یک آدرس HTTPS معتبر وارد کنید.",
 },
 OAUTH: {
 title: "OAuth 2.0",
 content:
 "OAuth 2.0 یک استاندارد احراز هویت است که به برنامه‌های سوم‌شخص اجازه می‌دهد بدون در اختیار داشتن رمز عبور شما، به داده‌های هوش دسترسی محدود داشته باشند.",
 },
 GRAPHQL: {
 title: "GraphQL",
 content:
 "GraphQL یک زبان پرس‌وجو است که به شما اجازه می‌دهد دقیقاً همان فیلدهایی که نیاز دارید را از API درخواست کنید — نه کم، نه زیاد. مناسب اپلیکیشن‌های موبایل و SPA.",
 },
 SDK: {
 title: "SDK",
 content:
 "مجموعه‌ی توسعه‌ی نرم‌افزار (SDK) شامل کتابخانه و ابزارهایی است که ادغام هوش را با زبان‌های برنامه‌نویسی مختلف (Node.js، Python، PHP،.NET) ساده می‌کند.",
 },
 SYNC: {
 title: "همگام‌سازی",
 content:
 "همگام‌سازی یعنی به‌روزرسانی دوطرفه‌ی داده‌ها بین هوش و فروشگاه یا سرویس دیگر. هر تغییر در یک‌سو، در سوی دیگر هم اعمال می‌شود.",
 },
 MODIAN_UID: {
 title: "UID مودیان",
 content:
 "شناسه‌ی یکتای فاکتور در سامانه مودیان که پس از ارسال فاکتور توسط سازمان دارایی صادر می‌شود. این شناسه برای پیگیری وضعیت فاکتور الزامی است.",
 },
 MODIAN_PATTERN: {
 title: "الگوهای فروش",
 content:
 "الگوهای فروش در سامانه مودیان، قالب‌های ازپیش‌تعریف‌شده‌ای هستند که نوع معامله (خرد، عمده، مصرف‌کننده نهایی) را مشخص می‌کنند. انتخاب الگوی درست برای محاسبه صحیح مالیات الزامی است.",
 },
 MODIAN_FAQ: {
 title: "سوالات متداول مودیان",
 content:
 "پاسخ رایج‌ترین پرسش‌ها: فرق فاکتور تستی و واقعی (UID با پیشوند TEST- و برچسب تستی — بدون اثر حقوقی)، مهلت ارسال (صدور هنگام فروش و ارسال طبق ابلاغ جاری)، هزینه اتصال (در هوش رایگان) و رفتار هوش در قطعی سامانه (فاکتور در صف می‌ماند و دوباره ارسال می‌شود).",
 },
 MODIAN_INQUIRY: {
 title: "استعلام نتیجه مودیان",
 content:
 "وضعیت نهایی هر صورتحساب (تأیید/رد/در حال بررسی) را از سازمان استعلام می‌کند و وضعیت محلی را بروز می‌کند.\nشناسه تأیید سازمان (confirmationReferenceId) در فاکتور ذخیره می‌شود.",
 },
 MODIAN_FISCAL_INFO: {
 title: "اطلاعات حافظه مالیاتی",
 content:
 "اطلاعات رسمی حافظه مالیاتی خودتان (نام تجاری، کد اقتصادی، شناسه ملی، وضعیت) را مستقیم از سامانه مودیان می‌گیرد — بعد از تنظیم شناسه حافظه و گواهی دیجیتال.\nاین داده رسمی سازمان است، بدون تایپ دستی.",
 },
 MODIAN_TAXPAYER: {
 title: "استعلام مودی",
 content:
 "قبل از صدور صورتحساب نوع اول (B2B)، طرف حساب را با کد اقتصادی/شناسه ملی اعتبارسنجی کنید — اگر مودی فعال نباشد صورتحسابش رد می‌شود.\nنام تجاری، وضعیت و شناسه رسمی مودی از سازمان برگردانده می‌شود.",
 },
 MODIAN_TEST: {
 title: "محیط آزمایشی مودیان",
 content:
 "در محیط آزمایشی، فاکتورها به آدرس محیط تست (کارپوشه آزمایشی یا TSP شما) می‌روند و هیچ چیزی به سازمان امور مالیاتی واقعی نمی‌رود. UID فاکتورهای تستی با پیشوند TEST- مشخص می‌شود و در جدول برچسب «تستی» می‌گیرند. توصیه: قبل از فعال‌سازی محیط واقعی، چند فاکتور را تستی ارسال کنید.",
 },
 MODIAN_DOUBLE_TAX: {
 title: "کارتخوان و مالیات دوبرابر",
 content:
 "فاکتور مودیان برای فروش کارتخوانی مالیات دوبرابر نیست: گردش کارتخوان در طرح نظارت یکسان به‌صورت خودکار به سازمان مالیاتی گزارش و با فروش اعلامی شما تطبیق داده می‌شود — فاکتور همان اعلام فروش است. خطر واقعی فقط صدور دو صورتحساب برای یک فروش است که هوش با هشدار فاکتور مشابه (±۵٪ / ۳ روز) و مسدودی ارسال مجدد جلوی آن را می‌گیرد.",
 },
 CURRENCY_RATE: {
 title: "نرخ ارز",
 content:
 "نرخ ارز بر اساس منبعی که انتخاب می‌کنید (API زنده، TGJU، یا دستی) تعیین می‌شود. برای تبدیل مبالغ چندارزی به ریال، این نرخ ضرب در مبلغ ارزی می‌شود.",
 },
 FIFO_LIFO: {
 title: "FIFO / LIFO",
 content:
 "FIFO (ورود اول، خروج اول) و LIFO (ورود آخر، خروج اول) دو روش رایج برای محاسبه‌ی بهای تمام‌شده‌ی کالای فروخته‌شده هستند. در ایران، روش FIFO برای انبار معمول‌تر است.",
 },
 TWO_FA: {
 title: "احراز هویت دو مرحله‌ای (2FA)",
 content:
 "2FA یک لایه‌ی امنیتی اضافی است که پس از وارد کردن رمز عبور، یک کد یک‌بارمصرف (از Google Authenticator یا پیامک) را نیز درخواست می‌کند. به‌شدت توصیه می‌شود.",
 },
 RBAC: {
 title: "کنترل دسترسی مبتنی بر نقش (RBAC)",
 content:
 "RBAC یا Role-Based Access Control سیستمی است که در آن دسترسی به بخش‌های نرم‌افزار بر اساس نقش کاربر (مدیر، حسابدار، کاربر) تعیین می‌شود، نه به‌صورت فردی.",
 },
 AUDIT_TRAIL: {
 title: "ردپای تغییرات (Audit Trail)",
 content:
 "Audit Trail لاگ کاملی از همه‌ی تغییرات (ایجاد، ویرایش، حذف) را با زمان، کاربر و آدرس IP ذخیره می‌کند. برای حسابداری قانونی و حسابرسی الزامی است.",
 },
 CODING: {
 title: "کدینگ حساب‌ها",
 content:
 "کدینگ یا کانتینگ، ساختار سلسله‌مراتبی حساب‌های هوش است (گروه > کل > معین). کدینگ استاندارد ایرانی معمولاً سه‌رقمی است: ۱۰۱، ۲۰۱، ۵۰۴ و...",
 },
 DEBIT_CREDIT: {
 title: "بدهکار / بستانکار",
 content:
 "در حسابداری دوطرفه، هر تراکنش حداقل در دو حساب ثبت می‌شود: یک حساب بدهکار (دارایی/هزینه) و یک حساب بستانکار (بدهی/درآمد/سرمایه). جمع بدهکار همیشه با جمع بستانکار برابر است.",
 },
 DENSITY: {
 title: "تراکم نمایش",
 content:
 "تراکم تعیین می‌کند که چقدر اطلاعات در واحد سطح نمایش داده شود. «جمع‌وجور» برای کاربران حرفه‌ای با مانیتور بزرگ، و «راحت» برای خوانایی بهتر مناسب است.",
 },
 FONT_SIZE: {
 title: "اندازه‌ی فونت",
 content:
 "اندازه‌ی فونت پایه‌ی برنامه را تنظیم می‌کند. این تنظیم روی همه‌ی متن‌ها اعمال می‌شود و برای کاربران با ضعف بینایی قابل افزایش است.",
 },
};

/**
 * راهنمای فوری با متن از پیش تعریف‌شده در HELP_TEXTS.
 *
 * مثال: <HelpTip name="API_KEY" />
 */
export function HelpTip({
 name,
 className,
 size,
}: {
 name: keyof typeof HELP_TEXTS;
 className?: string;
 size?: number;
}) {
 const t = HELP_TEXTS[name];
 if (!t) return null;
 return <HelpTooltip title={t.title} content={t.content} className={className} size={size} />;
}
