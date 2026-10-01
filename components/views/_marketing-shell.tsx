"use client";

import * as React from "react";
import {
 ArrowLeft,
 ChevronDown,
 Menu,
 ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 DropdownMenu,
 DropdownMenuTrigger,
 DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import {
 Sheet,
 SheetContent,
 SheetDescription,
 SheetTitle,
 SheetTrigger,
} from "@/components/ui/sheet";
import {
 Collapsible,
 CollapsibleTrigger,
 CollapsibleContent,
} from "@/components/ui/collapsible";
import { getCurrentJalaliYear, toPersianDigits } from "@/lib/persian";
import { BrandMark } from "@/components/brand/brand-mark";
import { useBranding } from "@/hooks/use-branding";
import { AppDownloadsStrip } from "@/components/ux/app-downloads-strip";
import {
 HEADER_NAV,
 type NavCategory,
 type NavItem,
} from "@/lib/header-nav-data";

export type ViewType =
 | "app"
 | "pricing"
 | "landing"
 | "blog"
 | "support"
 | "legal"
 | "auth"
 | "superadmin"
 | "account";

/* ------------------------------------------------------------------ */
/* منوی بازشونده‌ی دسکتاپ — hover-to-open با تأخیر کوتاه */
/* ------------------------------------------------------------------ */
function HeaderDropdown({
 category,
 onNavigate,
 active,
}: {
 category: NavCategory;
 onNavigate: (v: ViewType) => void;
 active: ViewType;
}) {
 const [open, setOpen] = React.useState(false);
 const timeoutRef = React.useRef<number | null>(null);

 const cancelClose = React.useCallback(() => {
 if (timeoutRef.current!== null) {
 window.clearTimeout(timeoutRef.current);
 timeoutRef.current = null;
 }
 }, []);

 const scheduleClose = React.useCallback((delay = 150) => {
 if (timeoutRef.current!== null) {
 window.clearTimeout(timeoutRef.current);
 }
 timeoutRef.current = window.setTimeout(() => setOpen(false), delay);
 }, []);

 React.useEffect(
 () => () => {
 if (timeoutRef.current!== null) window.clearTimeout(timeoutRef.current);
 },
 [],
 );

 const sections = category.sections?? [];
 const isMulti = sections.length > 1;
 // اگر هر کدام از آیتم‌ها توضیح داشته‌باشند، عرض منو را بیشتر می‌کنیم
 const hasDescriptions = sections.some((s) =>
 s.items.some((i) => i.description),
 );
 const contentWidth = isMulti
? "min-w-[560px] max-w-[680px]"
: hasDescriptions
? "min-w-[340px] max-w-[400px]"
: "min-w-[240px]";

 // آیا این دسته در حال حاضر فعال است؟ (برای هایلایت)
 const isActive = sections.some((s) =>
 s.items.some((i) => i.view && i.view === active),
 );

 return (
 <div
 className="relative"
 onMouseEnter={() => {
 cancelClose();
 setOpen(true);
 }}
 onMouseLeave={() => scheduleClose(150)}
 >
 <DropdownMenu open={open} onOpenChange={setOpen}>
 <DropdownMenuTrigger asChild>
 <button
 type="button"
 className={`group inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm transition-colors ${
 isActive || open
? "text-primary font-semibold"
: "text-foreground/80 hover:text-foreground hover:bg-muted font-medium"
 }`}
 aria-expanded={open}
 >
 {category.label}
 <ChevronDown
 className={`size-3.5 opacity-60 transition-transform duration-200 ${
 open? "rotate-180": ""
 }`}
 />
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent
 align="start"
 sideOffset={8}
 className={`${contentWidth} p-3`}
 onMouseEnter={cancelClose}
 onMouseLeave={() => scheduleClose(150)}
 >
 <div
 className={
 isMulti
? "grid grid-cols-2 gap-4"
: "flex flex-col gap-1"
 }
 >
 {sections.map((section) => (
 <div key={section.label} className="flex flex-col gap-1">
 {isMulti? (
 <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
 {section.label}
 </p>
 ): null}
 {section.items.map((item) => (
 <MegaItemRow
 key={item.label}
 item={item}
 onNavigate={onNavigate}
 onAfterClick={() => setOpen(false)}
 />
 ))}
 </div>
 ))}
 </div>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 );
}

/* ------------------------------------------------------------------ */
/* ردیف آیتم منوی مگا — اگر href باشد لینک، اگر view باشد دکمه درون‌اپ */
/* ------------------------------------------------------------------ */
function MegaItemRow({
 item,
 onNavigate,
 onAfterClick,
}: {
 item: NavItem;
 onNavigate: (v: ViewType) => void;
 onAfterClick: () => void;
}) {
 const Icon = item.icon;
 const inner = (
 <div className="flex items-start gap-3 w-full">
 <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
 <Icon className="size-4" />
 </span>
 <span className="flex flex-col gap-0.5 min-w-0">
 <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
 {item.label}
 {item.badge? (
 <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
 {item.badge}
 </span>
 ): null}
 </span>
 {item.description? (
 <span className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
 {item.description}
 </span>
 ): null}
 </span>
 </div>
 );

 if (item.href) {
 return (
 <a
 href={item.href}
 className="block rounded-md p-2 transition-colors hover:bg-accent"
 onClick={onAfterClick}
 >
 {inner}
 </a>
 );
 }
 if (item.view) {
 return (
 <button
 type="button"
 className="block rounded-md p-2 text-right transition-colors hover:bg-accent w-full"
 onClick={() => {
 onNavigate(item.view as ViewType);
 onAfterClick();
 }}
 >
 {inner}
 </button>
 );
 }
 return (
 <div className="rounded-md p-2 opacity-60 pointer-events-none">{inner}</div>
 );
}

/* ------------------------------------------------------------------ */
/* لینک مستقیم (قیمت‌گذاری / قوانین) در دسکتاپ */
/* ------------------------------------------------------------------ */
function HeaderDirectLink({
 category,
 active,
 onNavigate,
}: {
 category: NavCategory;
 active: ViewType;
 onNavigate: (v: ViewType) => void;
}) {
 const isActive = category.view === active;
 if (category.href) {
 return (
 <a
 href={category.href}
 className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
 isActive
? "text-primary font-medium"
: "text-muted-foreground hover:text-foreground hover:bg-muted"
 }`}
 >
 {category.label}
 </a>
 );
 }
 return (
 <button
 type="button"
 onClick={() => category.view && onNavigate(category.view as ViewType)}
 className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
 isActive
? "text-primary font-medium"
: "text-muted-foreground hover:text-foreground hover:bg-muted"
 }`}
 >
 {category.label}
 </button>
 );
}

/* ------------------------------------------------------------------ */
/* دراور موبایل — Sheet با دسته‌بندی Colapsible */
/* ------------------------------------------------------------------ */
function MobileNavSheet({
 active,
 onNavigate,
 footerContent,
}: {
 active: ViewType;
 onNavigate: (v: ViewType) => void;
 footerContent?: React.ReactNode;
}) {
 const [open, setOpen] = React.useState(false);
 // برند فعال (وایت‌لیبل) — نام و لوگو از تنظیمات سوپرادمین
 const { branding } = useBranding();

 const handleNavigate = (v: ViewType) => {
 onNavigate(v);
 setOpen(false);
 };

 return (
 <Sheet open={open} onOpenChange={setOpen}>
 <SheetTrigger asChild>
 <Button
 size="sm"
 variant="ghost"
 className="md:hidden px-2"
 aria-label="باز کردن منو"
 >
 <Menu className="size-5" />
 </Button>
 </SheetTrigger>
 <SheetContent side="right" className="w-[88vw] max-w-sm p-0">
 <SheetTitle className="sr-only">منوی {branding.appName}</SheetTitle>
 <SheetDescription className="sr-only">منوی اصلی سایت {branding.appName}</SheetDescription>
 <div className="flex items-center gap-2 border-b border-border px-4 py-3">
 <BrandMark className="h-7 w-7" logoUrl={branding.logoUrl} appName={branding.appName} />
 <span className="font-bold text-sm">{branding.appName}</span>
 </div>
 <nav className="flex flex-col gap-1 overflow-y-auto p-3">
 {HEADER_NAV.map((cat) =>
 cat.type === "link"? (
 <MobileDirectLink
 key={cat.label}
 category={cat}
 active={active}
 onNavigate={handleNavigate}
 />
 ): (
 <MobileCollapsibleCategory
 key={cat.label}
 category={cat}
 active={active}
 onNavigate={handleNavigate}
 />
 ),
 )}
 </nav>
 {footerContent? (
 <div className="mt-auto border-t border-border p-3 flex flex-col gap-2">
 {footerContent}
 </div>
 ): null}
 </SheetContent>
 </Sheet>
 );
}

function MobileDirectLink({
 category,
 active,
 onNavigate,
}: {
 category: NavCategory;
 active: ViewType;
 onNavigate: (v: ViewType) => void;
}) {
 const Icon = category.icon;
 const isActive = category.view === active;
 if (category.href) {
 return (
 <a
 href={category.href}
 className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
 >
 {Icon? <Icon className="size-4" />: null}
 {category.label}
 </a>
 );
 }
 return (
 <button
 type="button"
 onClick={() => category.view && onNavigate(category.view as ViewType)}
 className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-right text-sm transition-colors ${
 isActive
? "bg-primary/5 text-primary font-medium"
: "text-muted-foreground hover:bg-muted hover:text-foreground"
 }`}
 >
 {Icon? <Icon className="size-4" />: null}
 {category.label}
 </button>
 );
}

function MobileCollapsibleCategory({
 category,
 active,
 onNavigate,
}: {
 category: NavCategory;
 active: ViewType;
 onNavigate: (v: ViewType) => void;
}) {
 const [open, setOpen] = React.useState(false);
 const sections = category.sections?? [];
 const isActive = sections.some((s) =>
 s.items.some((i) => i.view && i.view === active),
 );
 return (
 <Collapsible open={open} onOpenChange={setOpen}>
 <CollapsibleTrigger asChild>
 <button
 type="button"
 className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-right text-sm transition-colors ${
 isActive
? "text-primary font-medium"
: "text-muted-foreground hover:bg-muted hover:text-foreground"
 }`}
 >
 <span className="flex items-center gap-1.5">
 {category.label}
 {isActive? (
 <span className="size-1.5 rounded-full bg-primary" />
 ): null}
 </span>
 <ChevronLeft
 className={`size-4 opacity-60 transition-transform duration-200 ${
 open? "-rotate-90": ""
 }`}
 />
 </button>
 </CollapsibleTrigger>
 <CollapsibleContent className="pt-1">
 <div className="flex flex-col gap-0.5 pr-3 border-r border-border/60 mr-3">
 {sections.map((section) => (
 <div key={section.label} className="flex flex-col gap-0.5">
 {sections.length > 1? (
 <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
 {section.label}
 </p>
 ): null}
 {section.items.map((item) => (
 <MobileNavItem
 key={item.label}
 item={item}
 active={active}
 onNavigate={onNavigate}
 />
 ))}
 </div>
 ))}
 </div>
 </CollapsibleContent>
 </Collapsible>
 );
}

function MobileNavItem({
 item,
 active,
 onNavigate,
}: {
 item: NavItem;
 active: ViewType;
 onNavigate: (v: ViewType) => void;
}) {
 const Icon = item.icon;
 const isActive = item.view!= null && item.view === active;
 const content = (
 <>
 <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
 <Icon className="size-3.5" />
 </span>
 <span className="flex flex-col gap-0.5 min-w-0">
 <span className="text-sm font-medium text-foreground">{item.label}</span>
 {item.description? (
 <span className="text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">
 {item.description}
 </span>
 ): null}
 </span>
 </>
 );

 if (item.href) {
 return (
 <a
 href={item.href}
 className="flex items-center gap-2.5 rounded-md p-2 text-right transition-colors hover:bg-accent"
 >
 {content}
 </a>
 );
 }
 if (item.view) {
 return (
 <button
 type="button"
 onClick={() => onNavigate(item.view as ViewType)}
 className={`flex w-full items-center gap-2.5 rounded-md p-2 text-right transition-colors ${
 isActive? "bg-primary/5": "hover:bg-accent"
 }`}
 >
 {content}
 </button>
 );
 }
 return null;
}

/* ------------------------------------------------------------------ */
/* ناوبری مشترک مگا منو — دسکتاپ + موبایل */
/* در MarketingHeader و LandingNavbar (صفحه فرود) به‌کار می‌رود. */
/* ------------------------------------------------------------------ */
export function MarketingMegaNav({
 active,
 onNavigate,
 desktopClassName,
 mobileFooterContent,
}: {
 active: ViewType;
 onNavigate: (v: ViewType) => void;
 desktopClassName?: string;
 mobileFooterContent?: React.ReactNode;
}) {
 return (
 <>
 {/* دسکتاپ: ناوبری مگا منو */}
 <nav
 className={`hidden md:flex items-center gap-0.5 ${desktopClassName?? ""}`}
 >
 {HEADER_NAV.map((cat) =>
 cat.type === "dropdown"? (
 <HeaderDropdown
 key={cat.label}
 category={cat}
 onNavigate={onNavigate}
 active={active}
 />
 ): (
 <HeaderDirectLink
 key={cat.label}
 category={cat}
 active={active}
 onNavigate={onNavigate}
 />
 ),
 )}
 </nav>

 {/* موبایل: دراور Sheet با دسته‌بندی Colapsible */}
 <MobileNavSheet
 active={active}
 onNavigate={onNavigate}
 footerContent={mobileFooterContent}
 />
 </>
 );
}

/* ------------------------------------------------------------------ */
/* هدر اصلی مارکتینگ */
/* ------------------------------------------------------------------ */
export function MarketingHeader({
 active,
 onBack,
 onNavigate,
 onOpenAuth,
}: {
 active: ViewType;
 onBack: () => void;
 onNavigate: (v: ViewType) => void;
 onOpenAuth: () => void;
}) {
 // برند فعال (وایت‌لیبل) — نام و لوگو از تنظیمات سوپرادمین
 const { branding } = useBranding();
 return (
 <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
 <div className="mx-auto w-full max-w-7xl flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
 <button
 onClick={onBack}
 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
 >
 <ArrowLeft className="h-4 w-4" />
 <span className="hidden sm:inline">بازگشت به اپ</span>
 </button>

 <button
 onClick={() => onNavigate("landing")}
 className="flex items-center gap-2 mr-auto shrink-0"
 aria-label={`${branding.appName} — صفحه اصلی`}
 >
 <BrandMark className="h-7 w-7" logoUrl={branding.logoUrl} appName={branding.appName} />
 <span className="font-bold text-sm">{branding.appName}</span>
 </button>

 <MarketingMegaNav active={active} onNavigate={onNavigate} desktopClassName="mr-auto" />

 <Button
 size="sm"
 variant="outline"
 onClick={onOpenAuth}
 className="shrink-0"
 >
 ورود / ثبت‌نام
 </Button>
 </div>
 </header>
 );
}

export function MarketingFooter({ onNavigate }: { onNavigate: (v: ViewType) => void }) {
 // برند فعال (وایت‌لیبل) — نام و لوگو از تنظیمات سوپرادمین
 const { branding } = useBranding();
 return (
 <footer className="mt-auto border-t border-border bg-card/50">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
 <AppDownloadsStrip />
 <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
 <div className="col-span-2 md:col-span-1">
 <div className="flex items-center gap-2 mb-3">
 <BrandMark className="h-7 w-7" logoUrl={branding.logoUrl} appName={branding.appName} />
 <span className="font-bold">{branding.appName}</span>
 </div>
 <p className="text-xs text-muted-foreground leading-relaxed">
 نرم‌افزار حسابداری هوشمند ایرانی با اتصال به سامانه مودیان، هوش مصنوعی و ۱۶ ماژول تخصصی.
 </p>
 </div>
 <div>
 <p className="font-semibold text-foreground mb-3">محصول</p>
 <ul className="space-y-2 text-muted-foreground">
 <li>
 <a href="/features" className="hover:text-foreground transition-colors">
 امکانات
 </a>
 </li>
 <li>
 <a href="/industries" className="hover:text-foreground transition-colors">
 صنایع
 </a>
 </li>
 <li>
 <button className="hover:text-foreground transition-colors" onClick={() => onNavigate("pricing")}>
 قیمت‌گذاری
 </button>
 </li>
 <li>
 <a href="/compare" className="hover:text-foreground transition-colors">
 مقایسه با رقبا
 </a>
 </li>
 <li>
 <a href="/ecosystem" className="hover:text-foreground transition-colors">
 اکوسیستم
 </a>
 </li>
 </ul>
 </div>
 <div>
 <p className="font-semibold text-foreground mb-3">منابع</p>
 <ul className="space-y-2 text-muted-foreground">
 <li>
 <button className="hover:text-foreground transition-colors" onClick={() => onNavigate("blog")}>
 بلاگ
 </button>
 </li>
 <li>
 <a href="/tutorials" className="hover:text-foreground transition-colors">
 آموزش‌ها
 </a>
 </li>
 <li>
 <a href="/taxes" className="hover:text-foreground transition-colors">
 مالیات‌ها
 </a>
 </li>
 <li>
 <a href="/api-docs" className="hover:text-foreground transition-colors">
 مستندات API
 </a>
 </li>
 <li>
 <a href="/widgets" className="hover:text-foreground transition-colors">
 ویجت‌های شرکا
 </a>
 </li>
 <li>
 <a href="/partners" className="hover:text-foreground transition-colors">
 برنامهٔ شراکت
 </a>
 </li>
 <li>
 <button className="hover:text-foreground transition-colors" onClick={() => onNavigate("support")}>
 پشتیبانی
 </button>
 </li>
 </ul>
 </div>
 <div>
 <p className="font-semibold text-foreground mb-3">صفحات تخصصی</p>
 <ul className="space-y-2 text-muted-foreground">
 <li>
 <a href="/seo/online-accounting-software-iran" className="hover:text-foreground transition-colors">
 حسابداری آنلاین ایران
 </a>
 </li>
 <li>
 <a href="/seo/cloud-accounting-modian" className="hover:text-foreground transition-colors">
 حسابداری ابری مودیان
 </a>
 </li>
 <li>
 <a href="/podcasts" className="hover:text-foreground transition-colors">
 پادکست و ویدیو
 </a>
 </li>
 <li>
 <a href="/cities" className="hover:text-foreground transition-colors">
 شهرها
 </a>
 </li>
 <li>
 <a href="/banks" className="hover:text-foreground transition-colors">
 بانک‌ها
 </a>
 </li>
 <li>
 <button className="hover:text-foreground transition-colors" onClick={() => onNavigate("legal")}>
 قوانین و مقررات
 </button>
 </li>
 </ul>
 </div>
 </div>
 <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
 <p>
 {branding.footerText ||
 `${branding.appName} ${toPersianDigits(getCurrentJalaliYear())} — تمامی حقوق محفوظ است.`}
 </p>
 <p>ایران، شیراز — تلفن: ۰۷۱-۳۲۶۲۲۴۹۳</p>
 </div>
 </div>
 </footer>
 );
}
