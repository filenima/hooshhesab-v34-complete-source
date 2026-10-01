"use client";

import * as React from "react";
import { Loader2, CheckCircle2, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/persian";

/* ============ auto-save-indicator.tsx ============
 *
 * نشانگر ذخیره‌ی خودکار — کوچک و غیرمزاحم.
 *
 * سه حالت:
 * ۱. ذخیره خودکار... (with spinner) — در حال debounce
 * ۲. ذخیره شد (with checkmark) — پس از ۲ ثانیه محو می‌شود
 * ۳. دکمه «بازیابی پیش‌نویس» — اگر پیش‌نویسی موجود باشد
 *
 * @example
 * <AutoSaveIndicator
 * isSaving={isSaving}
 * lastSaved={lastSaved}
 * hasDraft={hasDraft}
 * onRestore={() => setData(restore()?.data)}
 * onClear={clear}
 * />
 */

export interface AutoSaveIndicatorProps {
 isSaving: boolean;
 lastSaved: number | null;
 hasDraft: boolean;
 onRestore?: () => void;
 onClear?: () => void;
 className?: string;
 /** نمایش دکمه‌ی حذف پیش‌نویس (default: true) */
 showClear?: boolean;
 /** نمایش دکمه‌ی ذخیره‌ی دستی (default: false) */
 showSaveNow?: boolean;
 onSaveNow?: () => void;
}

function relativeTime(ts: number): string {
 const diff = Date.now() - ts;
 if (diff < 60_000) return "لحظاتی پیش";
 if (diff < 3_600_000) return `${toPersianDigits(Math.floor(diff / 60_000))} دقیقه پیش`;
 if (diff < 86_400_000) return `${toPersianDigits(Math.floor(diff / 3_600_000))} ساعت پیش`;
 return `${toPersianDigits(Math.floor(diff / 86_400_000))} روز پیش`;
}

export function AutoSaveIndicator({
 isSaving,
 lastSaved,
 hasDraft,
 onRestore,
 onClear,
 className,
 showClear = true,
 showSaveNow = false,
 onSaveNow,
}: AutoSaveIndicatorProps) {
 const [showSaved, setShowSaved] = React.useState(false);
 const prevSaving = React.useRef(false);

 // وقتی از saving saved شد، «ذخیره شد» را ۲ ثانیه نمایش بده
 React.useEffect(() => {
 if (prevSaving.current &&!isSaving && lastSaved) {
 setShowSaved(true);
 const timer = setTimeout(() => setShowSaved(false), 2000);
 return () => clearTimeout(timer);
 }
 prevSaving.current = isSaving;
 }, [isSaving, lastSaved]);

 return (
 <div
 className={cn(
 "flex items-center gap-1.5 text-[11px] text-muted-foreground",
 className
 )}
 >
 {isSaving? (
 <>
 <Loader2 className="h-3 w-3 animate-spin text-primary" />
 <span>ذخیره خودکار...</span>
 </>
 ): showSaved? (
 <span className="flex items-center gap-1 text-success animate-fade-in-up">
 <CheckCircle2 className="h-3 w-3" />
 <span>ذخیره شد</span>
 </span>
 ): lastSaved? (
 <>
 <CheckCircle2 className="h-3 w-3 text-muted-foreground/60" />
 <span>ذخیره خودکار: {relativeTime(lastSaved)}</span>
 </>
 ): hasDraft? (
 <span className="text-muted-foreground/80">پیش‌نویس موجود</span>
 ): (
 <span className="text-muted-foreground/40">خودکار ذخیره می‌شود</span>
 )}

 {hasDraft && onRestore &&!isSaving && (
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-6 px-2 text-[10px] gap-1 text-primary hover:text-primary"
 onClick={onRestore}
 >
 <RotateCcw className="h-3 w-3" />
 بازیابی پیش‌نویس
 </Button>
 )}

 {showSaveNow && onSaveNow && (
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-6 px-2 text-[10px] gap-1 text-primary"
 onClick={onSaveNow}
 disabled={isSaving}
 >
 <Save className="h-3 w-3" />
 ذخیره
 </Button>
 )}

 {showClear && hasDraft && onClear && (
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
 onClick={onClear}
 aria-label="حذف پیش‌نویس"
 >
 <Trash2 className="h-3 w-3" />
 حذف پیش‌نویس
 </Button>
 )}
 </div>
 );
}

export default AutoSaveIndicator;
