"use client";

/**
 * use-auto-save — ذخیرهٔ خودکار پیش‌نویس فرم‌ها در localStorage
 * ============================================================================
 * API (هم‌راستا با مصرف در invoice-form):
 *   const autoSave = useAutoSave<T>(key, data, debounceMs);
 *   autoSave.isSaving   — در حال debounce/نوشتن
 *   autoSave.lastSaved  — timestamp آخرین ذخیره (null = هنوز ذخیره نشده)
 *   autoSave.hasDraft   — پیش‌نویس موجود است؟
 *   autoSave.restore()  — { data, savedAt } | null
 *   autoSave.saveNow()  — نوشتن فوری
 *   autoSave.clear()    — حذف پیش‌نویس
 *
 * ذخیره با JSON.serialize در localStorage (سقف اطمینان‌پذیر مرورگرها) انجام
 * می‌شود؛ خطای QuotaExceeded بی‌صدا بلعیده می‌شود تا فرم هرگز به‌خاطر
 * پیش‌نویس خراب نشکند.
 */

import * as React from "react";

const PREFIX = "hoosh_autosave_v1:";
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // پیش‌نویس‌ها پس از ۴۸ ساعت منقضی می‌شوند

interface StoredDraft<T> {
  savedAt: number;
  data: T;
}

function readDraft<T>(key: string): StoredDraft<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.savedAt !== "number" ||
      !("data" in parsed)
    ) {
      return null;
    }
    // پیش‌نویس خیلی قدیمی → مثل نبودن
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft<T>(key: string, data: T): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
    return true;
  } catch {
    return false;
  }
}

export function useAutoSave<T>(key: string, data: T, debounceMs = 2000) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<number | null>(null);
  const [hasDraft, setHasDraft] = React.useState(false);

  // خواندن یکباره در mount — وجود پیش‌نویس قبلی
  React.useEffect(() => {
    const d = readDraft<T>(key);
    setHasDraft(Boolean(d));
    if (d) setLastSaved(d.savedAt);
  }, [key]);

  const dataRef = React.useRef(data);
  React.useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // debounce نوشتن
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSaving(true);
    const t = setTimeout(() => {
      const ok = writeDraft(key, dataRef.current);
      if (ok) {
        setLastSaved(Date.now());
        setHasDraft(true);
      }
      setIsSaving(false);
    }, Math.max(500, debounceMs));
    return () => {
      clearTimeout(t);
      setIsSaving(false);
    };
  }, [key, data, debounceMs]);

  const restore = React.useCallback((): StoredDraft<T> | null => readDraft<T>(key), [key]);

  const saveNow = React.useCallback(() => {
    const ok = writeDraft(key, dataRef.current);
    if (ok) {
      setLastSaved(Date.now());
      setHasDraft(true);
    }
    return ok;
  }, [key]);

  const clear = React.useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
    setHasDraft(false);
  }, [key]);

  return { isSaving, lastSaved, hasDraft, restore, saveNow, clear };
}

/** نوع خروجی useAutoSave — سازگار با نسخه ۱۲.۸ */
export interface UseAutoSaveReturn<T> {
  isSaving: boolean;
  lastSaved: number | null;
  hasDraft: boolean;
  restore: () => StoredDraft<T> | null;
  saveNow: () => boolean;
  clear: () => void;
}

export default useAutoSave;
