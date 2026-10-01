// ============ هوش — متن‌های قابل‌ویرایش پنل کاربر (Task 3-d) ============
// منبع یگانهٔ متن‌هایی که سوپرادمین از تب «نسخه‌ها و اطلاع‌رسانی» ویرایش
// می‌کند و در پنل «همهٔ» کاربران اعمال می‌شود:
//  - خوش‌آمد داشبورد (عنوان + زیرمتن)
//  - عنوان گروه‌های سایدبار (کیف پول و پاداش، فروش و خرید، ...)
//  - عنوان/زیرعنوان سرصفحهٔ هر ماژول (module_title.{id} / module_subtitle.{id})
//  - برچسب‌های کیف پول (موجودی، قابل برداشت، تراکنش‌ها)
//
// ذخیره‌سازی: SystemSettings با کلید user_panel_content — JSON رشته‌ای
// به شکل { "کلید": { value: "متن", updatedAt: "ISO" } } (طبق قواعد پروژه:
// فقط نوع‌های primitive — نقشه به‌صورت JSON string).
//
// سمت کاربر: app-shell هنگام بالا آمدن /api/platform/user-content را
// می‌گیرد و با setUserContentOverrides در فروش مشترک می‌گذارد؛ اجزای UI
// با getUserContent(key, fallback) می‌خوانند — اگر override نباشد همان
// fallback نمایش داده می‌شود (اپ هرگز نمی‌شکند).
//
// FIX(Task 3-d): این فایل عمداً بدون "use client" است — ثابت‌ها و تابع‌های
// خالصش از route سروری /api/platform/user-content هم ایمپورت می‌شوند؛ با
// "use client" (مرز client در Turbopack) مقدار ثابت در سمت سرور به
// پروکسی تابع تبدیل می‌شد و Prisma خطای [object Function] می‌داد. سبک
// مشترک مشابه nav-config/module-manager (بدون دیکتیو، ایمپورت‌کنندهٔ
// client خودش مرز را تعیین می‌کند).

import * as React from "react";

/** کلید SystemSettings برای متن‌های پنل کاربر */
export const USER_PANEL_CONTENT_KEY = "user_panel_content";

/** سقف‌های sanity */
export const MAX_USER_CONTENT_KEYS = 200;
export const MAX_USER_CONTENT_VALUE_LENGTH = 300;

// ============ تایپ‌ها ============

export interface UserContentEntry {
 value: string;
 updatedAt: string; // ISO
}
export type UserContentMap = Record<string, UserContentEntry>;

export interface UserContentFieldDef {
 key: string;
 label: string;
 group: string;
 default: string;
 multiline?: boolean;
}

// ============ فیلدهای سرپرستی‌شده (نمایش در ویرایشگر سوپرادمین) ============
// الگوی module_title.{id} / module_subtitle.{id} برای «همهٔ» ماژول‌ها کار
// می‌کند — سرصفحهٔ app-shell از همین الگو می‌خواند؛ اینجا فقط پرمرئیاترین
//‌ها برای ویرایش سریع فهرست شده‌اند (کلید دلخواه را هم می‌توان افزود).
export const USER_CONTENT_FIELDS: UserContentFieldDef[] = [
 // — داشبورد —
 {
  key: "dashboard.welcome_title",
  label: "عنوان خوش‌آمد داشبورد",
  group: "داشبورد",
  default: "به هوش خوش آمدید",
 },
 {
  key: "dashboard.welcome_subtitle",
  label: "زیرمتن خوش‌آمد داشبورد",
  group: "داشبورد",
  default:
   "نرم‌افزار حسابداری هوشمند شما آماده است. برای شروع، اولین فاکتور فروش یا خرید خود را ثبت کنید تا داشبورد با داده‌های واقعی شما پر شود.",
  multiline: true,
 },
 // — سرصفحهٔ ماژول‌ها (چند ماژول پرکاربرد) —
 {
  key: "module_title.dashboard",
  label: "سرصفحهٔ داشبورد (عنوان)",
  group: "سرصفحهٔ ماژول‌ها",
  default: "داشبورد",
 },
 {
  key: "module_subtitle.dashboard",
  label: "سرصفحهٔ داشبورد (زیرعنوان)",
  group: "سرصفحهٔ ماژول‌ها",
  default: "نمای کلی وضعیت مالی کسب‌وکار",
 },
 {
  key: "module_title.quick-invoice",
  label: "سرصفحهٔ فاکتور سریع (عنوان)",
  group: "سرصفحهٔ ماژول‌ها",
  default: "فاکتور سریع",
 },
 {
  key: "module_subtitle.quick-invoice",
  label: "سرصفحهٔ فاکتور سریع (زیرعنوان)",
  group: "سرصفحهٔ ماژول‌ها",
  default: "ثبت فاکتور در چند ثانیه — مناسب خرده‌فروشی و رستوران",
 },
 {
  key: "module_title.invoices",
  label: "سرصفحهٔ خرید و فروش (عنوان)",
  group: "سرصفحهٔ ماژول‌ها",
  default: "خرید و فروش",
 },
 {
  key: "module_subtitle.invoices",
  label: "سرصفحهٔ خرید و فروش (زیرعنوان)",
  group: "سرصفحهٔ ماژول‌ها",
  default: "فاکتورها، سفارشات و طرف‌حساب‌ها",
 },
 // — عنوان گروه‌های سایدبار —
 {
  key: "nav_group.داشبورد",
  label: "عنوان گروه «داشبورد»",
  group: "سایدبار",
  default: "داشبورد",
 },
 {
  key: "nav_group.کیف پول و پاداش",
  label: "عنوان گروه «کیف پول و پاداش»",
  group: "سایدبار",
  default: "کیف پول و پاداش",
 },
 {
  key: "nav_group.فروش و خرید",
  label: "عنوان گروه «فروش و خرید»",
  group: "سایدبار",
  default: "فروش و خرید",
 },
 {
  key: "nav_group.انبار و کالا",
  label: "عنوان گروه «انبار و کالا»",
  group: "سایدبار",
  default: "انبار و کالا",
 },
 {
  key: "nav_group.مالی و بانک",
  label: "عنوان گروه «مالی و بانک»",
  group: "سایدبار",
  default: "مالی و بانک",
 },
 {
  key: "nav_group.گزارش‌ها و هوشمند",
  label: "عنوان گروه «گزارش‌ها و هوشمند»",
  group: "سایدبار",
  default: "گزارش‌ها و هوشمند",
 },
 {
  key: "nav_group.سیستم",
  label: "عنوان گروه «سیستم»",
  group: "سایدبار",
  default: "سیستم",
 },
 {
  key: "nav_group.ابزارهای پیشرفته ما",
  label: "عنوان گروه «ابزارهای پیشرفته»",
  group: "سایدبار",
  default: "ابزارهای پیشرفته ما",
 },
 {
  key: "nav_group.راهنما",
  label: "عنوان گروه «راهنما»",
  group: "سایدبار",
  default: "راهنما",
 },
 // — برچسب‌های کیف پول —
 {
  key: "wallet.balance_label",
  label: "برچسب موجودی کیف پول",
  group: "کیف پول",
  default: "موجودی کیف پول",
 },
 {
  key: "wallet.withdrawable_label",
  label: "برچسب «قابل برداشت»",
  group: "کیف پول",
  default: "قابل برداشت",
 },
 {
  key: "wallet.transactions_title",
  label: "عنوان تراکنش‌های کیف پول",
  group: "کیف پول",
  default: "تراکنش‌های کیف پول",
 },
];

// ============ پارس/serialize (مشترک سرور و کلاینت) ============

/** پارس امن JSON ذخیره‌شده → نقشهٔ {key: {value, updatedAt}} */
export function parseUserContent(raw: string | null | undefined): UserContentMap {
 if (!raw) return {};
 try {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: UserContentMap = {};
  let count = 0;
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
   if (count >= MAX_USER_CONTENT_KEYS) break;
   if (!key || typeof key !== "string" || key.length > 120) continue;
   if (!val || typeof val !== "object") continue;
   const v = val as Record<string, unknown>;
   const value = typeof v.value === "string" ? v.value.slice(0, MAX_USER_CONTENT_VALUE_LENGTH) : "";
   if (!value.trim()) continue; // مقدار خالی = بدون override
   const updatedAt =
    typeof v.updatedAt === "string" && !isNaN(Date.parse(v.updatedAt)) ? v.updatedAt : new Date().toISOString();
   out[key] = { value, updatedAt };
   count++;
  }
  return out;
 } catch {
  return {};
 }
}

/** serialize نقشه → JSON رشته‌ای برای SystemSettings */
export function serializeUserContent(map: UserContentMap): string {
 const clean: UserContentMap = {};
 const entries = Object.entries(map).slice(0, MAX_USER_CONTENT_KEYS);
 for (const [key, entry] of entries) {
  const value = (entry?.value || "").slice(0, MAX_USER_CONTENT_VALUE_LENGTH).trim();
  if (!value) continue;
  clean[key] = {
   value,
   updatedAt: typeof entry.updatedAt === "string" && !isNaN(Date.parse(entry.updatedAt))
    ? entry.updatedAt
    : new Date().toISOString(),
  };
 }
 return JSON.stringify(clean);
}

/** اعتبارسنجی یک مقدار ورودی (سوپرادمین) — رشتهٔ trim‌شده یا null برای حذف */
export function sanitizeUserContentValue(raw: unknown): string | null | "invalid" {
 if (raw === null || raw === undefined) return null;
 if (typeof raw !== "string") return "invalid";
 const s = raw.slice(0, MAX_USER_CONTENT_VALUE_LENGTH + 50).trim();
 if (s.length > MAX_USER_CONTENT_VALUE_LENGTH) return "invalid";
 return s || null; // خالی = حذف override (بازگشت به پیش‌فرض)
}

// ============ فروش مشترک سمت کلاینت (بدون Context — سبک و پایدار) ============

let _overrides: UserContentMap = {};
const _listeners = new Set<() => void>();
const _EMPTY: UserContentMap = {};

function _emit() {
 for (const cb of _listeners) {
  try {
   cb();
  } catch {
   /* ignore */
  }
 }
}

/** app-shell بعد از fetch بوت این را صدا می‌زند (کل نقشهٔ override) */
export function setUserContentOverrides(map: UserContentMap | null | undefined) {
 const next = map && typeof map === "object" ? map : {};
 const changed =
  Object.keys(_overrides).length !== Object.keys(next).length ||
  Object.keys(next).some((k) => _overrides[k]?.value !== next[k]?.value);
 if (!changed) return;
 _overrides = next;
 _emit();
}

/** نقشهٔ فعلی override ها (برای memo dependencies) */
export function getUserContentOverrides(): UserContentMap {
 return _overrides;
}

/** خواندن یک متن با merge: override سوپرادمین ← fallback کد */
export function getUserContent(key: string, fallback: string): string {
 const entry = _overrides[key];
 const value = entry?.value?.trim();
 return value ? value : fallback;
}

/** عنوان نمایشی یک گروه سایدبار (با override سوپرادمین) */
export function getNavGroupTitle(group: string): string {
 return getUserContent(`nav_group.${group}`, group);
}

/** مشترک شدن در تغییرات (برای useSyncExternalStore) */
export function subscribeUserContent(cb: () => void): () => void {
 _listeners.add(cb);
 return () => {
  _listeners.delete(cb);
 };
}

/** هوک React — نقشهٔ override ها؛ با تغییر fetch بوت دوباره رندر می‌شود */
export function useUserContentOverrides(): UserContentMap {
 return React.useSyncExternalStore(
  subscribeUserContent,
  getUserContentOverrides,
  () => _EMPTY
 );
}
