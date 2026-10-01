"use client";

import * as React from "react";
import type { SiteContentOverrides, SiteCustomSection } from "@/lib/site-content";
import {
  useSiteContent,
  setSiteContentCache,
  getSiteEditorToken,
  deactivateSiteEditor,
  DEFAULT_SITE_CONTENT_CLIENT,
} from "@/hooks/use-site-content";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_SECTION_ORDER } from "@/components/site-editor/section-registry";

/**
 * site-editor-context — وضعیت مرکزی ویرایشگر بصری سایت
 *
 * نکته‌ی حیاتی (باگ بازسازی قبلی): استیت ویرایش در React state نگه داشته
 * می‌شود و یک contentRef همیشه با useEffect با آخرین تغییر همگام می‌ماند؛
 * ذخیره از contentRef.current می‌خواند تا هیچ ویرایشی از دست نرود.
 */

// ============ انواع ============

export interface SectionSlot {
  /** شناسه‌ی سکشن (built-in یا cs_* سفارشی) */
  id: string;
  custom?: SiteCustomSection;
}

export interface SiteEditorContextValue {
  // محتوا
  content: SiteContentOverrides; // محتوای مؤثر (پیش‌نویس زنده)
  draftReady: boolean;
  dirty: boolean;
  saving: boolean;

  // انتخاب/دیالوگ‌ها
  selectedSection: string | null;
  selectSection: (id: string | null) => void;
  managerOpen: boolean;
  setManagerOpen: (open: boolean) => void;

  // ویرایش فیلدها
  setField: (path: string, value: string) => void;
  resetField: (path: string) => void;

  // نمایش/ترتیب
  isHidden: (id: string) => boolean;
  toggleHidden: (id: string) => void;
  setHidden: (id: string, hidden: boolean) => void;
  moveSection: (id: string, dir: -1 | 1) => void;

  // سکشن‌های سفارشی
  addCustom: (section: SiteCustomSection) => void;
  updateCustom: (id: string, patch: Partial<SiteCustomSection>) => void;
  removeCustom: (id: string) => void;

  // عملیات کلی
  save: () => Promise<void>;
  reset: () => Promise<void>;
  exit: () => void;
}

const SiteEditorContext = React.createContext<SiteEditorContextValue | null>(null);

export function useSiteEditor(): SiteEditorContextValue {
  const ctx = React.useContext(SiteEditorContext);
  if (!ctx) {
    throw new Error("useSiteEditor باید داخل SiteEditorProvider استفاده شود");
  }
  return ctx;
}

// ============ محاسبه‌ی توالی سکشن‌ها ============

/**
 * توالی نهایی سکشن‌ها: ترتیب built-in از order (یا پیش‌فرض) + سکشن‌های
 * سفارشی بعد از لنگر afterشان (یا انتهای صفحه).
 *
 * FIX (v24): سکشن‌های جدیدی که در order ذخیره‌شده (از قبل از افزودنشان) نیستند،
 * قبلاً به انتهای صفحه می‌رفتند (position 1000+). حالا merge هوشمند: هر سکشنِ
 * غایب در نزدیک‌ترین جایگاه پیش‌فرضش نسبت به همسایه‌های موجود درج می‌شود —
 * یعنی ابزارهای رایگان (calculators → moadian-lab → financial-health) به‌درستی
 * بعد از stats و قبل از pricing می‌نشینند، حتی اگر order قدیمی ذخیره شده باشد.
 */
export function computeSectionSequence(
  content: SiteContentOverrides
): SectionSlot[] {
  // order معتبر: فقط built-in های شناخته‌شده
  const saved = content.order.filter(
    (id) => !id.startsWith("cs_") && DEFAULT_SECTION_ORDER.includes(id)
  );
  // سکشن‌های غایب (به ترتیب پیش‌فرض) باید درج شوند
  const missing = DEFAULT_SECTION_ORDER.filter((id) => !saved.includes(id));

  const merged = saved.slice();
  for (const id of missing) {
    const defIdx = DEFAULT_SECTION_ORDER.indexOf(id);
    // ۱) نزدیک‌ترین پیش‌نفرِ پیش‌فرضِ حاضر در merged → درج بلافاصله بعدش
    let insertAt = -1;
    for (let i = defIdx - 1; i >= 0 && insertAt === -1; i--) {
      const idx = merged.indexOf(DEFAULT_SECTION_ORDER[i]);
      if (idx !== -1) insertAt = idx + 1;
    }
    // ۲) وگرنه نزدیک‌ترین جانشینِ حاضر → درج قبلش
    for (let i = defIdx + 1; i < DEFAULT_SECTION_ORDER.length && insertAt === -1; i++) {
      const idx = merged.indexOf(DEFAULT_SECTION_ORDER[i]);
      if (idx !== -1) insertAt = idx;
    }
    // ۳) هیچ همسایه‌ای نبود → انتها
    if (insertAt === -1) insertAt = merged.length;
    merged.splice(insertAt, 0, id);
  }

  const builtins = merged;

  const seq: SectionSlot[] = builtins.map((id) => ({ id }));

  // سکشن‌های سفارشی با لنگر معتبر → بلافاصله بعد از لنگر
  const anchored: SiteCustomSection[] = [];
  const atEnd: SiteCustomSection[] = [];
  for (const c of content.custom) {
    if (c.after && builtins.includes(c.after)) anchored.push(c);
    else atEnd.push(c);
  }
  for (const c of anchored) {
    const idx = seq.findIndex((s) => s.id === c.after);
    if (idx === -1) continue;
    seq.splice(idx + 1, 0, { id: c.id, custom: c });
  }
  for (const c of atEnd) {
    seq.push({ id: c.id, custom: c });
  }

  return seq;
}

/** ترتیب فعلی built-in ها به‌عنوان آرایه‌ی کامل (برای جابه‌جایی) */
function currentBuiltinOrder(content: SiteContentOverrides): string[] {
  return computeSectionSequence(content)
    .filter((s) => !s.custom)
    .map((s) => s.id);
}

/** آیا محتوا از پیش‌فرض تغییر کرده؟ (برای نشانگر پیش‌نویس) */
function isPristine(c: SiteContentOverrides): boolean {
  // GET عمومی order را با ترتیب پیش‌فرض پر می‌کند —
  // پس «order برابر پیش‌فرض» هم مثل «order خالی» بدون تغییر است.
  const builtinOrder = c.order.filter((x) => !x.startsWith("cs_"));
  const orderIsDefault =
    builtinOrder.length === 0 ||
    builtinOrder.join("\u0000") === DEFAULT_SECTION_ORDER.join("\u0000");
  return (
    Object.keys(c.fields).length === 0 &&
    c.hidden.length === 0 &&
    orderIsDefault &&
    c.custom.length === 0
  );
}

// ============ Provider ============

export function SiteEditorProvider({
  children,
  onExit,
}: {
  children: React.ReactNode;
  onExit: () => void;
}) {
  const { toast } = useToast();
  const { content: publicContent, loading } = useSiteContent();

  // پیش‌نویس — تا وقتی محتوای عمومی بار نشده null می‌ماند
  const [draft, setDraft] = React.useState<SiteContentOverrides | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [selectedSection, setSelectedSection] = React.useState<string | null>(null);
  const [managerOpen, setManagerOpen] = React.useState(false);

  // محتوای مؤثر — پیش‌نویس زنده یا محتوای عمومی
  const effective = draft ?? publicContent ?? DEFAULT_SITE_CONTENT_CLIENT;

  // همگام‌سازی اولیه‌ی پیش‌نویس با محتوای سرور (فقط وقتی دست‌نخورده است)
  React.useEffect(() => {
    if (draft === null && !loading && publicContent) {
      setDraft(publicContent);
    }
  }, [draft, loading, publicContent]);

  // FIX باگ بازسازی قبلی: contentRef همیشه با آخرین state همگام می‌ماند
  const contentRef = React.useRef<SiteContentOverrides>(effective);
  React.useEffect(() => {
    contentRef.current = effective;
  }, [effective]);

  // به‌روزرسانی امن پیش‌نویس
  const update = React.useCallback(
    (fn: (prev: SiteContentOverrides) => SiteContentOverrides) => {
      setDraft((prev) => {
        const base = prev ?? contentRef.current;
        return fn(base);
      });
      setDirty(true);
    },
    []
  );

  // ---- ویرایش فیلد ----
  const setField = React.useCallback(
    (path: string, value: string) => {
      update((prev) => {
        const fields = { ...prev.fields };
        if (value === "") delete fields[path];
        else fields[path] = value;
        return { ...prev, fields };
      });
    },
    [update]
  );

  const resetField = React.useCallback(
    (path: string) => {
      update((prev) => {
        const fields = { ...prev.fields };
        delete fields[path];
        return { ...prev, fields };
      });
    },
    [update]
  );

  // ---- نمایش/ترتیب ----
  const isHidden = React.useCallback(
    (id: string) => effective.hidden.includes(id),
    [effective.hidden]
  );

  const setHidden = React.useCallback(
    (id: string, hidden: boolean) => {
      update((prev) => {
        let hiddenList = prev.hidden.filter((x) => x !== id);
        if (hidden) hiddenList = [...hiddenList, id];
        return { ...prev, hidden: hiddenList };
      });
    },
    [update]
  );

  const toggleHidden = React.useCallback(
    (id: string) => {
      update((prev) => {
        const hiddenList = prev.hidden.includes(id)
          ? prev.hidden.filter((x) => x !== id)
          : [...prev.hidden, id];
        return { ...prev, hidden: hiddenList };
      });
    },
    [update]
  );

  const moveSection = React.useCallback(
    (id: string, dir: -1 | 1) => {
      update((prev) => {
        const current = currentBuiltinOrder(prev);
        const idx = current.indexOf(id);
        if (idx === -1) return prev;
        const target = idx + dir;
        if (target < 0 || target >= current.length) return prev;
        // جابه‌جایی و ثبت ترتیب کامل
        const next = current.slice();
        [next[idx], next[target]] = [next[target], next[idx]];
        return { ...prev, order: next };
      });
    },
    [update]
  );

  // ---- سکشن‌های سفارشی ----
  const addCustom = React.useCallback(
    (section: SiteCustomSection) => {
      update((prev) => ({
        ...prev,
        custom: [...prev.custom.filter((c) => c.id !== section.id), section],
      }));
    },
    [update]
  );

  const updateCustom = React.useCallback(
    (id: string, patch: Partial<SiteCustomSection>) => {
      update((prev) => ({
        ...prev,
        custom: prev.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    [update]
  );

  const removeCustom = React.useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        custom: prev.custom.filter((c) => c.id !== id),
        hidden: prev.hidden.filter((h) => h !== id),
      }));
      // اگر همین سکشن باز است، بسته شود
      setSelectedSection((sel) => (sel === id ? null : sel));
    },
    [update]
  );

  // ---- ذخیره (از contentRef — همیشه آخرین ویرایش) ----
  const save = React.useCallback(async () => {
    const token = getSiteEditorToken();
    if (!token) {
      toast({
        title: "خطا در ذخیره",
        description: "توکن سوپرادمین یافت نشد — دوباره از پنل وارد شوید.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/site-content", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(contentRef.current),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) {
        throw new Error(j?.error || `خطای سرور (${res.status})`);
      }
      // به‌روزرسانی کش ماژولی — همه‌ی مصرف‌کننده‌ها فوراً مقدار جدید را می‌بینند
      setSiteContentCache(contentRef.current);
      setDirty(false);
      toast({
        title: "ذخیره شد",
        description: "تغییرات برای همه‌ی بازدیدکنندگان اعمال شد.",
      });
    } catch (err) {
      toast({
        title: "خطا در ذخیره",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [toast]);

  // ---- بازنشانی به پیش‌فرض ----
  const reset = React.useCallback(async () => {
    const token = getSiteEditorToken();
    if (!token) {
      toast({
        title: "خطا",
        description: "توکن سوپرادمین یافت نشد.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/site-content", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reset: true }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) {
        throw new Error(j?.error || `خطای سرور (${res.status})`);
      }
      const fresh = { ...DEFAULT_SITE_CONTENT_CLIENT, fields: {}, hidden: [], order: [], custom: [] };
      setDraft(fresh);
      setSiteContentCache(fresh);
      setDirty(false);
      toast({
        title: "بازنشانی شد",
        description: "محتوای سایت به حالت پیش‌فرض بازگشت.",
      });
    } catch (err) {
      toast({
        title: "خطا در بازنشانی",
        description: err instanceof Error ? err.message : "لطفاً دوباره تلاش کنید.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [toast]);

  // ---- خروج از حالت ویرایش ----
  const exit = React.useCallback(() => {
    deactivateSiteEditor();
    setSelectedSection(null);
    setManagerOpen(false);
    onExit();
  }, [onExit]);

  const value: SiteEditorContextValue = {
    content: effective,
    draftReady: !loading && draft !== null,
    dirty: dirty || !isPristine(effective),
    saving,
    selectedSection,
    selectSection: setSelectedSection,
    managerOpen,
    setManagerOpen,
    setField,
    resetField,
    isHidden,
    toggleHidden,
    setHidden,
    moveSection,
    addCustom,
    updateCustom,
    removeCustom,
    save,
    reset,
    exit,
  };

  return <SiteEditorContext.Provider value={value}>{children}</SiteEditorContext.Provider>;
}
