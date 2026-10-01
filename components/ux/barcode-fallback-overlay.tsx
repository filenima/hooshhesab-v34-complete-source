"use client";

/**
 * اورلی سراسری بارکد (v32-C)
 * ------------------------------------------------
 * وقتی اسکنر سخت‌افزاری کدی می‌فرستد ولی هیچ ماژول فعالی (POS/فرم فاکتور/
 * انبار) آن را مصرف نکرد، این کارت پایین صفحه ظاهر می‌شود: کالا را از API
 * جستجو می‌کند و دکمهٔ «افزودن به فاکتور فروش» فرم فاکتور را با همان کالا
 * باز می‌کند (از طریق pending scan).
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ScanBarcode, ShoppingCart, PackageSearch, X } from "lucide-react";
import { lookupByBarcode, type LookupProduct } from "@/hooks/use-barcode-scanner";
import { setPendingScan, beepScanOk, beepScanError } from "@/lib/barcode-scanner";
import { toPersianDigits, formatToman } from "@/lib/persian";

interface BarcodeFallbackOverlayProps {
  /** باز کردن فرم فاکتور سراسری (همان onNewInvoice در app-shell) */
  onNewInvoice: () => void;
  /** رفتن به ماژول انبار */
  onOpenInventory?: () => void;
}

export function BarcodeFallbackOverlay({ onNewInvoice, onOpenInventory }: BarcodeFallbackOverlayProps) {
  const [state, setState] = React.useState<
    | { phase: "idle" }
    | { phase: "loading"; code: string }
    | { phase: "found"; code: string; product: LookupProduct }
    | { phase: "notfound"; code: string }
  >({ phase: "idle" });

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ phase: "idle" });
  }, []);

  React.useEffect(() => {
    const onFallback = async (e: Event) => {
      const code = (e as CustomEvent<{ code: string }>).detail?.code;
      if (!code) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setState({ phase: "loading", code });
      const product = await lookupByBarcode(code);
      if (product) {
        beepScanOk();
        setState({ phase: "found", code, product });
      } else {
        beepScanError();
        setState({ phase: "notfound", code });
      }
      // بستن خودکار بعد از ۱۰ ثانیه
      timerRef.current = setTimeout(() => setState({ phase: "idle" }), 10_000);
    };
    window.addEventListener("hoosh:barcode-fallback", onFallback);
    return () => {
      window.removeEventListener("hoosh:barcode-fallback", onFallback);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (state.phase === "idle") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 start-4 z-[60] w-[min(92vw,360px)] animate-in slide-in-from-bottom-4 fade-in duration-200"
    >
      <div className="rounded-xl border border-border bg-card shadow-lg p-4">
        {state.phase === "loading" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>در حال جستجوی کالا…</span>
          </div>
        )}

        {state.phase === "notfound" && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <ScanBarcode className="h-5 w-5" />
                <span>کالایی با این کد یافت نشد</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={dismiss} aria-label="بستن">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground break-all" dir="ltr">
              {toPersianDigits(state.code)}
            </p>
            <p className="text-xs text-muted-foreground">
              ابتدا کالا را در «انبار و کالا» با همین بارکد ثبت کنید تا با اسکن سریع به فاکتور اضافه شود.
            </p>
            {onOpenInventory && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  onOpenInventory();
                  dismiss();
                }}
              >
                <PackageSearch className="h-4 w-4" />
                رفتن به انبار و کالا
              </Button>
            )}
          </div>
        )}

        {state.phase === "found" && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ScanBarcode className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{state.product.name}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {toPersianDigits(state.product.sku)}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={dismiss} aria-label="بستن">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="gap-1">
                قیمت: {formatToman(state.product.salePrice / 10)}
              </Badge>
              <Badge
                variant={
                  state.product.stock > 0 ? "secondary" : "destructive"
                }
                className="gap-1"
              >
                موجودی: {toPersianDigits(state.product.stock)} {state.product.unit}
              </Badge>
              {state.product.categoryName && (
                <Badge variant="outline">{state.product.categoryName}</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5 flex-1"
                onClick={() => {
                  setPendingScan(state.code);
                  onNewInvoice();
                  dismiss();
                }}
              >
                <ShoppingCart className="h-4 w-4" />
                افزودن به فاکتور فروش
              </Button>
              {onOpenInventory && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { onOpenInventory(); dismiss(); }}>
                  <PackageSearch className="h-4 w-4" />
                  انبار
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
