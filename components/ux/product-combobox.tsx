"use client";

/* ============================================================
 * ProductCombobox — انتخابگر کالای قابل‌جستجو برای فرم فاکتور
 * ============================================================
 * FIX(search): قبلاً فرم فاکتور از Select ساده با ۱۲۰۰+ آیتم استفاده
 * می‌کرد — بدون جستجوی واقعی (typeahead رادیکس فقط prefix-exact است و
 * با نویسه‌های عربی «ي/ك» داده‌های CSV هم مچ نمی‌شد). کاربر می‌نوشت
 * «کیف» و پیام «کالایی یافت نشد» می‌گرفت در حالی که ۳۰ نوع «كیف» داشت!
 *
 * این کامپوننت:
 *  - جستجوی زنده با نرمال‌سازی کامل فارسی (persianIncludes)
 *    → مچ شدن ي/ی، ك/ک، ة/ه، ZWNJ، اعراب و ارقام فارسی/عربی
 *  - جستجو در نام + SKU + بارکد
 *  - نمایش قیمت فروش و موجودی در هر گزینه (تصمیم‌گیری سریع)
 *  - کاپ رندر روی ۵۰ نتیجه (کارایی با ۱۲۰۰+ کالا)
 *  - دکمهٔ پاک‌کردن انتخاب (بازگشت به ردیف آزاد)
 *  - دسترس‌پذیری کامل کیبورد (cmdk)
 */

import * as React from "react";
import { Check, ChevronsUpDown, Package, PackageX, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
 Command,
 CommandEmpty,
 CommandGroup,
 CommandInput,
 CommandItem,
 CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { persianIncludes, formatPriceCompact } from "@/lib/persian";

export interface ComboboxProduct {
 id: string;
 name: string;
 sku: string;
 barcode?: string | null;
 salePrice: number;
 stock?: number | null;
 unit?: string | null;
}

interface ProductComboboxProps {
 products: ComboboxProduct[];
 value: string | null | undefined;
 onSelect: (productId: string) => void;
 /** وقتی کاربر انتخاب را پاک می‌کند (null = ردیف آزاد) */
 onClear?: () => void;
 placeholder?: string;
 /** ارز نمایش قیمت — ورودی salePrice همیشه ریال است */
 priceUnit?: "toman" | "rial";
 disabled?: boolean;
 className?: string;
 /** ارتفاع تریگر: "sm" (h-9 فرم دسکتاپ) یا "md" (h-11 فرم موبایل) */
 size?: "sm" | "md";
}

const MAX_RENDER = 50;

export function ProductCombobox({
 products,
 value,
 onSelect,
 onClear,
 placeholder = "انتخاب کالا...",
 priceUnit = "toman",
 disabled = false,
 className,
 size = "sm",
}: ProductComboboxProps) {
 const [open, setOpen] = React.useState(false);
 const [query, setQuery] = React.useState("");

 const selected = React.useMemo(
 () => products.find((p) => p.id === value) ?? null,
 [products, value]
 );

 // جستجوی زندهٔ نرمال‌شده — نام، SKU و بارکد
 const filtered = React.useMemo(() => {
 const q = query.trim();
 if (!q) return products.slice(0, MAX_RENDER);
 return products
 .filter(
 (p) =>
 persianIncludes(p.name, q) ||
 persianIncludes(p.sku, q) ||
 persianIncludes(p.barcode, q)
 )
 .slice(0, MAX_RENDER);
 }, [products, query]);

 const handleSelect = React.useCallback(
 (productId: string) => {
 if (productId === value) {
 setOpen(false);
 return;
 }
 onSelect(productId);
 setOpen(false);
 setQuery("");
 },
 [onSelect, value]
 );

 const triggerHeight = size === "md" ? "h-11" : "h-9";

 return (
 <div className={cn("flex w-full items-center gap-1", className)}>
 <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
 <PopoverTrigger asChild>
 <Button
 type="button"
 variant="outline"
 role="combobox"
 aria-expanded={open}
 disabled={disabled}
 className={cn(
 "w-full justify-between gap-1 px-2 font-normal",
 triggerHeight,
 !selected && "text-muted-foreground"
 )}
 >
 <span className="flex min-w-0 items-center gap-1.5">
 {selected ? (
 <>
 <Package className="h-3.5 w-3.5 shrink-0 text-primary/70" />
 <span className="truncate text-xs">
 {selected.name}
 {selected.sku ? (
 <span className="text-muted-foreground"> ({selected.sku})</span>
 ) : null}
 </span>
 </>
 ) : (
 <>
 <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
 <span className="truncate text-xs">{placeholder}</span>
 </>
 )}
 </span>
 <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
 </Button>
 </PopoverTrigger>
 <PopoverContent
 className="w-[min(24rem,var(--radix-popover-trigger-width))] p-0"
 align="start"
 sideOffset={4}
 >
 <Command shouldFilter={false} dir="rtl">
 <CommandInput
 value={query}
 onValueChange={setQuery}
 placeholder="جستجوی نام کالا، SKU یا بارکد..."
 className="text-xs"
 />
 <CommandList className="max-h-72">
 {filtered.length === 0 ? (
 <CommandEmpty>
 {products.length === 0
 ? "کالایی ثبت نشده است"
 : query.trim()
 ? `کالایی با «${query.trim()}» یافت نشد — نویسه‌ها را ساده‌تر کنید`
 : undefined}
 </CommandEmpty>
 ) : (
 <CommandGroup>
 {filtered.map((p) => {
 const stock = p.stock ?? 0;
 const outOfStock = stock <= 0;
 return (
 <CommandItem
 key={p.id}
 value={p.id}
 onSelect={handleSelect}
 className="gap-2 py-2"
 >
 <Check
 className={cn(
 "h-3.5 w-3.5 shrink-0",
 value === p.id ? "opacity-100" : "opacity-0"
 )}
 />
 <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
 <div className="flex min-w-0 flex-col">
 <span className="truncate text-xs font-medium">{p.name}</span>
 <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
 {p.sku ? <span dir="ltr" className="tnum">{p.sku}</span> : null}
 <span className="text-primary/70">
 {formatPriceCompact(p.salePrice, priceUnit)}
 </span>
 </span>
 </div>
 <Badge
 variant="outline"
 className={cn(
 "shrink-0 border-transparent px-1.5 text-[9px] font-normal",
 outOfStock
 ? "bg-muted text-muted-foreground"
 : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
 )}
 >
 {outOfStock ? (
 <PackageX className="h-2.5 w-2.5" />
 ) : null}
 <span className="tnum">
 {outOfStock ? "ناموجود" : `${stock > 999 ? "999+" : stock}`}
 </span>
 </Badge>
 </div>
 </CommandItem>
 );
 })}
 {products.length > filtered.length && !query.trim() ? (
 <div className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">
 برای یافتن سریع‌تر، تایپ کنید… ({`نمایش ${filtered.length} از ${products.length}`})
 </div>
 ) : null}
 </CommandGroup>
 )}
 </CommandList>
 </Command>
 </PopoverContent>
 </Popover>

 {/* دکمهٔ پاک‌کردن انتخاب — بازگشت به ردیف آزاد */}
 {selected && onClear && !disabled ? (
 <Button
 type="button"
 variant="ghost"
 size="icon"
 className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
 onClick={onClear}
 aria-label="پاک‌کردن انتخاب کالا"
 tabIndex={-1}
 >
 <X className="h-3.5 w-3.5" />
 </Button>
 ) : null}
 </div>
 );
}
