/**
 * ============ module-manager.ts ============
 *
 * موتور سمت سرور «مدیریت منوی کاربران» (پنل سوپرادمین).
 * سوپرادمین می‌تواند سایدبار پنل کاربر را کنترل کند: نمایش/مخفی، تغییر نام،
 * تغییر بج، ترتیب، آیتم دلخواه (ماژول موجود یا لینک خارجی) و همهٔ این‌ها
 * به‌صورت per-plan (رایگان / پایه / حرفه‌ای / سازمانی).
 *
 * ذخیره‌سازی: SystemSettings (key/value) زیر کلید module_manager_config
 * به‌صورت JSON رشته‌ای (طبق قواعد پروژه: primitive فقط).
 *
 * منطق ادغام (خالص و مشترک با کلاینت) در lib/nav-config.ts است
 * (computeEffectiveNavItems) — این فایل فقط دیتابیس + کش + sanitize.
 *
 * الگوی کش: مثل lib/wallet.ts (سوییچ‌های per-plan) — کش حافظهٔ ۳۰ ثانیه‌ای
 * + اعمال فوری بعد از ذخیره + تابع بی‌اعتبارسازی.
 */

import { db } from "@/lib/db";
import {
  NAV_ITEMS,
  NAV_GROUPS,
  ICON_CHOICES,
  isValidIconName,
  isValidModuleId,
  VALID_PLANS,
  normalizePlan,
  DEFAULT_MODULE_MANAGER_CONFIG,
  computeEffectiveNavItems,
  type ModuleManagerConfig,
  type CustomNavItem,
  type PerPlanOverrides,
  type EffectiveNavItem,
} from "@/lib/nav-config";

// بازصادر انواع برای راحتی مصرف‌کننده‌های سمت سرور (API routes)
export type {
  ModuleManagerConfig,
  CustomNavItem,
  PerPlanOverrides,
  EffectiveNavItem,
};

export { VALID_PLANS, normalizePlan };

/** کلید SystemSettings برای ذخیرهٔ پیکربندی */
export const MODULE_MANAGER_KEY = "module_manager_config";

const MAX_HIDDEN = 200;
const MAX_LABELS = 100;
const MAX_ORDER = 300;
const MAX_GROUPS = 30;
const MAX_CUSTOM_ITEMS = 20;
const MAX_LABEL_LEN = 40;
const MAX_BADGE_LEN = 20;
const MAX_GROUP_LEN = 30;
const MAX_URL_LEN = 300;

// ═════════════════════ پاک‌سازی ورودی (sanitize) ═════════════════════

/** حذف کاراکترهای کنترلی نامرئی از متن */
function cleanText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLen);
}

/** پاک‌سازی فهرست شناسه‌ها — معتبر، بدون تکرار، با سقف */
function sanitizeIdList(raw: unknown, max = MAX_HIDDEN): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, max)) {
    if (!isValidModuleId(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** پاک‌سازی نقشهٔ labelها — کلید معتبر + متن تا ۴۰ کاراکتر؛ رشتهٔ خالی حذف می‌شود */
function sanitizeLabelMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let count = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_LABELS) break;
    if (!isValidModuleId(key)) continue;
    const text = cleanText(value, MAX_LABEL_LEN);
    if (!text) continue; // خالی = برگشت به پیش‌فرض → نیازی به ذخیره نیست
    out[key] = text;
    count++;
  }
  return out;
}

/** پاک‌سازی نقشهٔ بج‌ها — رشتهٔ خالی یعنی «حذف بج» و نگه داشته می‌شود */
function sanitizeBadgeMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let count = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_LABELS) break;
    if (!isValidModuleId(key)) continue;
    out[key] = cleanText(value, MAX_BADGE_LEN); // خالی = حذف عمدی بج
    count++;
  }
  return out;
}

/** پاک‌سازی آیتم‌های دلخواه — حداکثر ۲۰، بدون تداخل با پیش‌فرض‌ها */
function sanitizeCustomItems(raw: unknown): CustomNavItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomNavItem[] = [];
  const seen = new Set<string>();
  const builtinIds = new Set(NAV_ITEMS.map((n) => n.id));
  for (const item of raw.slice(0, MAX_CUSTOM_ITEMS)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (!isValidModuleId(c.id)) continue;
    // تداخل با آیتم‌های پیش‌فرض مجاز نیست — برای رندر ماژول مخفی باید آیتم دلخواه
    // با شناسهٔ همان ماژول (مثل manufacturing) ساخته شود که در NAV_ITEMS نیست.
    if (builtinIds.has(c.id)) continue;
    if (seen.has(c.id)) continue;
    const label = cleanText(c.label, MAX_LABEL_LEN);
    if (!label) continue;
    const group = cleanText(c.group, MAX_GROUP_LEN) || "ابزارهای پیشرفته ما";
    const icon = isValidIconName(c.icon) ? c.icon : "Circle";
    const badge = cleanText(c.badge, MAX_BADGE_LEN) || undefined;
    // URL: فقط http(s) خارجی یا مسیر نسبی داخلی (سقف ۳۰۰ کاراکتر)
    let url: string | undefined;
    if (typeof c.url === "string" && c.url.trim()) {
      const u = c.url.trim().slice(0, MAX_URL_LEN);
      if (/^https?:\/\/[^\s]+$/i.test(u) || u.startsWith("/")) {
        url = u;
      }
    }
    seen.add(c.id);
    out.push(
      url
        ? { id: c.id, label, icon, group, badge, url }
        : { id: c.id, label, icon, group, badge }
    );
  }
  return out;
}

/** پاک‌سازی overrideهای per-plan — فقط پلن‌های معتبر */
function sanitizePerPlan(raw: unknown): Record<string, PerPlanOverrides> {
  const out: Record<string, PerPlanOverrides> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const plan of VALID_PLANS) {
    const v = (raw as Record<string, unknown>)[plan];
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const hidden = sanitizeIdList(o.hidden);
    const labels = sanitizeLabelMap(o.labels);
    if (hidden.length === 0 && Object.keys(labels).length === 0) continue;
    out[plan] = { hidden, labels };
  }
  return out;
}

/** پاک‌سازی فهرست ترتیب گروه‌ها — فقط نام گروه‌های معتبر (پیش‌فرض یا گروهِ
 * آیتم‌های دلخواه)، بدون تکرار و با سقف — درخواست مالک: جابه‌جایی گروه‌ها */
function sanitizeGroupOrder(raw: unknown, customItems: CustomNavItem[]): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>([
    ...NAV_GROUPS,
    ...customItems.map((c) => c.group),
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of raw.slice(0, MAX_GROUPS)) {
    if (typeof g !== "string") continue;
    const name = g.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, MAX_GROUP_LEN);
    if (!name || !valid.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** پاک‌سازی کامل پیکربندی — هر ورودی غیرمعتبر بی‌صدا حذف/محدود می‌شود */
export function sanitizeModuleManagerConfig(raw: unknown): ModuleManagerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyConfig();
  }
  const c = raw as Record<string, unknown>;
  const customItems = sanitizeCustomItems(c.customItems);
  return {
    hidden: sanitizeIdList(c.hidden),
    labels: sanitizeLabelMap(c.labels),
    badges: sanitizeBadgeMap(c.badges),
    order: sanitizeIdList(c.order, MAX_ORDER),
    groupOrder: sanitizeGroupOrder(c.groupOrder, customItems),
    customItems,
    perPlan: sanitizePerPlan(c.perPlan),
  };
}

function emptyConfig(): ModuleManagerConfig {
  return {
    hidden: [],
    labels: {},
    badges: {},
    order: [],
    groupOrder: [],
    customItems: [],
    perPlan: {},
  };
}

// ═════════════════════ کش ۳۰ ثانیه‌ای ═════════════════════

let configCache: ModuleManagerConfig | null = null;
let configLoadedAt = 0;
const CONFIG_TTL_MS = 30_000;

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** بی‌اعتبارسازی کش (بعد از ذخیرهٔ سوپرادمین یا تست) */
export function invalidateModuleManagerCache(): void {
  configCache = null;
  configLoadedAt = 0;
}

/** خواندن پیکربندی ذخیره‌شده (با کش ۳۰ ثانیه‌ای — الگوی lib/wallet.ts) */
export async function getModuleManagerConfig(): Promise<ModuleManagerConfig> {
  const now = Date.now();
  if (!configCache || now - configLoadedAt > CONFIG_TTL_MS) {
    try {
      const row = await db.systemSettings.findUnique({
        where: { key: MODULE_MANAGER_KEY },
      });
      configCache = row?.value
        ? sanitizeModuleManagerConfig(safeJsonParse(row.value))
        : emptyConfig();
    } catch {
      configCache = emptyConfig();
    }
    configLoadedAt = now;
  }
  return configCache;
}

/** ذخیرهٔ پیکربندی (upsert) + اعمال فوری در کش */
export async function saveModuleManagerConfig(
  cfg: ModuleManagerConfig
): Promise<ModuleManagerConfig> {
  const clean = sanitizeModuleManagerConfig(cfg);
  const json = JSON.stringify(clean);
  await db.systemSettings.upsert({
    where: { key: MODULE_MANAGER_KEY },
    update: { value: json },
    create: { key: MODULE_MANAGER_KEY, value: json },
  });
  // اعمال فوری (مثل applyPlanFeatureToggles در lib/wallet.ts)
  configCache = clean;
  configLoadedAt = Date.now();
  return clean;
}

/** حذف کامل پیکربندی — برگشت به پیش‌فرض کارخانه */
export async function resetModuleManagerConfig(): Promise<void> {
  await db.systemSettings.deleteMany({ where: { key: MODULE_MANAGER_KEY } });
  invalidateModuleManagerCache();
}

// ═════════════════════ منوی مؤثر ═════════════════════

/**
 * منوی نهایی برای یک پلن — خواندن پیکربندی (کش‌شده) و محاسبه با
 * موتور خالص مشترک (computeEffectiveNavItems در lib/nav-config.ts).
 */
export async function getEffectiveNavForPlan(
  plan: string
): Promise<EffectiveNavItem[]> {
  const cfg = await getModuleManagerConfig();
  return computeEffectiveNavItems(cfg, plan);
}

/** آیکون‌های مجاز — برای UI سوپرادمین */
export { ICON_CHOICES };
export { DEFAULT_MODULE_MANAGER_CONFIG };
