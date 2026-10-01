"use client";

/**
 * هوک React برای ثبت هندلر بارکدخوان سراسری (v32-C)
 * ---------------------------------------------------
 * هر ماژولی که «باز/فعال» است این هوک را صدا می‌زند؛ اسکنر سخت‌افزاری
 * هرجای برنامه که باشد، کد به آخرین هندلر ثبت‌شده (LIFO) می‌رسد.
 *
 * هندلر می‌تواند Promise برگرداند (برای lookup از API) — در آن صورت
 * مصرف بودن اسکن را از طریق بازگشت true اعلام می‌کند. برای سادگی،
 * هندلرِ sync که false/undefined برگرداند یعنی «مصرف نکردم».
 */

import * as React from "react";
import { ensureBarcodeEngine, registerBarcodeHandler, type ScanHandler } from "@/lib/barcode-scanner";

export interface UseBarcodeScannerOptions {
  /** فعال بودن ثبت هندلر (پیش‌فرض true) — مثلاً وقتی دیالوگ پرداخت باز است خاموشش کنید */
  enabled?: boolean;
}

export function useBarcodeScanner(
  handler: (code: string) => boolean | void,
  options?: UseBarcodeScannerOptions
): void {
  const enabled = options?.enabled !== false;
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  React.useEffect(() => {
    if (!enabled) return;
    ensureBarcodeEngine();
    const wrapped: ScanHandler = (code) => handlerRef.current(code);
    return registerBarcodeHandler(wrapped);
  }, [enabled]);
}

/** جستجوی کالا با بارکد/SKU از API (با کش سبک) — مشترک بین POS/فاکتور/اورلی */
export interface LookupProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  salePrice: number; // ریال
  purchasePrice: number; // ریال
  taxRate: number; // کسر
  categoryId: string | null;
  categoryName?: string | null;
  stock: number;
  matchType?: "barcode" | "sku" | "prefix";
}

const lookupCache = new Map<string, { at: number; product: LookupProduct | null }>();
const LOOKUP_TTL = 60_000;

export async function lookupByBarcode(code: string): Promise<LookupProduct | null> {
  const key = code.trim();
  if (!key) return null;
  const cached = lookupCache.get(key);
  if (cached && Date.now() - cached.at < LOOKUP_TTL) return cached.product;
  try {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("hoshhesab_user_token") : null;
    const res = await fetch(`/api/products/lookup?code=${encodeURIComponent(key)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      lookupCache.set(key, { at: Date.now(), product: null });
      return null;
    }
    const json = (await res.json()) as { success?: boolean; data?: LookupProduct };
    const product = json?.success && json.data ? json.data : null;
    lookupCache.set(key, { at: Date.now(), product });
    return product;
  } catch {
    return null;
  }
}

/** ریست کش lookup (بعد از تغییر کالاها) */
export function invalidateLookupCache(): void {
  lookupCache.clear();
}
