"use client";

/**
 * ============ zero-stock-confirm.tsx ============
 *
 * دیالوگ تأیید «موجودی صفر» هنگام ثبت فاکتور (درخواست مالک):
 * اگر کالایی در فاکتور موجودی صفر (یا منفی) داشته باشد، پیش از ثبت پرسیده می‌شود:
 *
 *   «موجودی صفر است، باز هم مایلید فاکتور ثبت شود؟»
 *
 * + یک چک‌باکس زیرش: «دیگر نپرس — با موجودی صفر هم مستقیم ثبت کن»
 *   که با زدن آن، تأیید برای همیشه (localStorage) ذخیره می‌شود و
 *   دیگر این سؤال پرسیده نمی‌شود.
 *
 * استفاده:
 *   const { confirmZeroStock, ZeroStockDialog } = useZeroStockConfirm();
 *   // در submit:
 *   confirmZeroStock(items, () => { ...ادامهٔ ثبت فاکتور... });
 *   // در رندر:
 *   <ZeroStockDialog />
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Loader2 } from "lucide-react";

const ZERO_STOCK_OK_KEY = "hoosh_zero_stock_ok";

export interface ZeroStockItem {
  name: string;
  stock: number;
}

export function useZeroStockConfirm() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<ZeroStockItem[]>([]);
  const [dontAsk, setDontAsk] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);
  const onProceedRef = React.useRef<(() => void) | null>(null);

  const isSuppressed = React.useCallback(() => {
    try {
      return window.localStorage.getItem(ZERO_STOCK_OK_KEY) === "1";
    } catch {
      return false;
    }
  }, []);

  /**
   * اگر اقلامِ دارای موجودی صفر وجود دارد و کاربر «دیگر نپرس» را نزده،
   * دیالوگ باز می‌کند؛ در غیر این صورت بلافاصله onProceed اجرا می‌شود.
   */
  const confirmZeroStock = React.useCallback(
    (zeroItems: ZeroStockItem[], onProceed: () => void) => {
      if (zeroItems.length === 0) {
        onProceed();
        return;
      }
      if (isSuppressed()) {
        onProceed();
        return;
      }
      onProceedRef.current = onProceed;
      setItems(zeroItems);
      setDontAsk(false);
      setWaiting(false);
      setOpen(true);
    },
    [isSuppressed]
  );

  const handleProceed = React.useCallback(() => {
    const fn = onProceedRef.current;
    if (dontAsk) {
      try {
        window.localStorage.setItem(ZERO_STOCK_OK_KEY, "1");
      } catch {
        /* private mode */
      }
    }
    setOpen(false);
    onProceedRef.current = null;
    if (fn) {
      setWaiting(true);
      // اجرای کمی بعدتر تا دیالوگ بسته شود و استک تمیز بماند
      setTimeout(() => {
        setWaiting(false);
        fn();
      }, 50);
    }
  }, [dontAsk]);

  const handleCancel = React.useCallback(() => {
    setOpen(false);
    onProceedRef.current = null;
  }, []);

  /** پرچم «دیگر نپرس» را ریست می‌کند (برای صفحهٔ تنظیمات در آینده) */
  const resetSuppression = React.useCallback(() => {
    try {
      window.localStorage.removeItem(ZERO_STOCK_OK_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const ZeroStockDialog = (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleCancel() : setOpen(true))}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/15 text-warning">
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            تأیید ثبت با موجودی صفر
          </DialogTitle>
          <DialogDescription className="text-start leading-relaxed">
            موجودی این کالا{items.length > 1 ? "ها" : ""} صفر است، باز هم مایلید فاکتور ثبت شود؟
          </DialogDescription>
        </DialogHeader>

        {items.length > 0 && (
          <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-muted/40 p-2 text-xs">
            {items.slice(0, 8).map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{it.name}</span>
                <span className="shrink-0 text-destructive tnum">
                  موجودی: {it.stock}
                </span>
              </li>
            ))}
            {items.length > 8 && (
              <li className="text-center text-[10px] text-muted-foreground">
                و {items.length - 8} کالای دیگر…
              </li>
            )}
          </ul>
        )}

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-xs leading-relaxed">
          <Checkbox
            checked={dontAsk}
            onCheckedChange={(v) => setDontAsk(v === true)}
            aria-label="دیگر این سؤال پرسیده نشود"
          />
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">دیگر نپرس</span> — از این به بعد
            با موجودی صفر هم بدون پرسش، فاکتور ثبت شود.
          </span>
        </label>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={waiting}>
            انصراف
          </Button>
          <Button size="sm" onClick={handleProceed} disabled={waiting} className="gap-1.5">
            {waiting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            بله، فاکتور ثبت شود
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmZeroStock, ZeroStockDialog, resetSuppression, isSuppressed };
}
