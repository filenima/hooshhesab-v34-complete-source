// ============ White-Label Solution — هوش ============
// FIX(SA-10): این ماژول قبلاً «آینده‌نگر/نیمه‌کاره» بود (Storage در auditLog و
// resolveTenantByDomain ساختگی). اکنون به داده‌ی واقعی متصل شده است:
//   • پیکربندی هر tenant در SystemSettings با کلید «whitelabel:{tenantId}»
//   • دامنه‌ی اختصاصی از جدول واقعی TenantDomain (ثبت/تأیید DNS از
//     /api/domains — همان سیستم فعال پروژه) خوانده می‌شود.
// کاربرد: رندر برندینگ اختصاصی مشتری‌ها روی دامنه‌ی تأییدشده‌ی خودشان.
// applyWhiteLabeling در client اجرا می‌شود؛ بقیه توابع server-only هستند.

import { db } from "@/lib/db";
import { DEFAULT_BRANDING } from "@/lib/system-settings";

// ============ Types ============

export interface WhiteLabelConfig {
  appName: string;
  logoUrl: string;
  primaryColor: string;
  domain: string;
  features: string[];
  footerText?: string;
  supportEmail?: string;
  supportPhone?: string;
  hidePoweredBy?: boolean;
}

// ============ Default Config ============
// رنگ پیش‌فرض از برندینگ واقعی پلتفرم (سبز زمردی هوش — نه ایندیگو)

const DEFAULT_CONFIG: WhiteLabelConfig = {
  appName: DEFAULT_BRANDING.appName || "هوش",
  logoUrl: "/logo.svg",
  primaryColor: DEFAULT_BRANDING.primaryColor || "#10b981",
  domain: DEFAULT_BRANDING.domain || "hoosh.nobatime.ir",
  features: ["invoices", "inventory", "crm", "reports", "ai"],
  footerText: "تمامی حقوق محفوظ است.",
  supportEmail: "support@hoosh.nobatime.ir",
  supportPhone: "071-32622493",
  hidePoweredBy: false,
};

// کلید SystemSettings برای پیکربندی white-label هر tenant
const whiteLabelKey = (tenantId: string) => `whitelabel:${tenantId}`;

// کش پیکربندی white-label برای tenantها
const configCache = new Map<string, { config: WhiteLabelConfig; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // ۵ دقیقه

// ============ Public API ============

/**
 * دریافت پیکربندی white-label برای یک tenant.
 * منبع: SystemSettings (کلید whitelabel:{tenantId}) + دامنه‌ی primary تأییدشده
 * از جدول TenantDomain. اگر هیچ‌کدام نبود، پیکربندی پیش‌فرض برمی‌گردد.
 */
export async function getWhiteLabelConfig(tenantId: string): Promise<WhiteLabelConfig> {
  const cached = configCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) {
      return DEFAULT_CONFIG;
    }

    // پیکربندی ذخیره‌شده‌ی ادمین tenant
    const settings = await db.systemSettings.findFirst({
      where: { key: whiteLabelKey(tenantId) },
    });

    // FIX(SA-10): دامنه‌ی اختصاصی واقعی — primary تأییدشده از TenantDomain
    const primaryDomain = await db.tenantDomain.findFirst({
      where: { tenantId, status: "VERIFIED", isPrimary: true },
      select: { domain: true },
      orderBy: { createdAt: "asc" },
    });

    let config: WhiteLabelConfig = { ...DEFAULT_CONFIG };

    if (settings?.value) {
      try {
        const parsed = JSON.parse(settings.value) as Partial<WhiteLabelConfig>;
        config = { ...config, ...parsed };
      } catch {
        // JSON نامعتبر — از default ادامه بده
      }
    }

    if (primaryDomain?.domain) {
      config.domain = primaryDomain.domain;
    }

    // اگر ادمین نام اختصاصی نداده ولی دامنه‌ی تأییدشده دارد، نام tenant را بگذار
    if (!settings?.value && primaryDomain?.domain && config.appName === DEFAULT_CONFIG.appName) {
      config.appName = tenant.name || config.appName;
    }

    configCache.set(tenantId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  } catch (err) {
    console.error("[white-label] خطا در دریافت پیکربندی:", err);
    return DEFAULT_CONFIG;
  }
}

/**
 * اعمال پیکربندی white-label در DOM (client-side).
 * تغییر عنوان صفحه، favicon، CSS variables و data-attribute ها.
 */
export function applyWhiteLabeling(config: WhiteLabelConfig): void {
  if (typeof document === "undefined") {
    console.warn("[white-label] applyWhiteLabeling فقط در client-side قابل استفاده است");
    return;
  }

  document.title = config.appName;

  if (config.logoUrl) {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) {
      favicon.href = config.logoUrl;
    } else {
      const newFavicon = document.createElement("link");
      newFavicon.rel = "icon";
      newFavicon.href = config.logoUrl;
      document.head.appendChild(newFavicon);
    }
  }

  if (config.primaryColor) {
    const root = document.documentElement;
    root.style.setProperty("--primary", config.primaryColor);

    const lighter = lightenColor(config.primaryColor, 20);
    const darker = lightenColor(config.primaryColor, -20);
    root.style.setProperty("--primary-light", lighter);
    root.style.setProperty("--primary-dark", darker);
  }

  if (config.footerText) {
    document.documentElement.setAttribute("data-footer-text", config.footerText);
  }

  if (config.hidePoweredBy) {
    document.documentElement.setAttribute("data-hide-powered-by", "true");
  }
}

/**
 * ذخیره/به‌روزرسانی پیکربندی white-label یک tenant.
 * FIX(SA-10): ذخیره‌ی واقعی در SystemSettings (قبلاً فقط auditLog می‌نوشت که
 * storage نبود). فراخوانی فقط از مسیر ادمینِ tenant مجاز است.
 */
export async function updateWhiteLabelConfig(
  tenantId: string,
  config: Partial<WhiteLabelConfig>
): Promise<void> {
  // مقدار فعلی را بخوان و merge کن
  const existing = await db.systemSettings.findFirst({
    where: { key: whiteLabelKey(tenantId) },
  });
  let merged: Partial<WhiteLabelConfig> = { ...config };
  if (existing?.value) {
    try {
      merged = { ...(JSON.parse(existing.value) as Partial<WhiteLabelConfig>), ...config };
    } catch {
      merged = { ...config };
    }
  }

  await db.systemSettings.upsert({
    where: { key: whiteLabelKey(tenantId) },
    create: { key: whiteLabelKey(tenantId), value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });

  // پاک کردن کش
  configCache.delete(tenantId);
}

/**
 * بررسی دامنه‌ی سفارشی — tenant صاحب این دامنه کیست؟
 * FIX(SA-10): کوئری واقعی از TenantDomain (فقط دامنه‌های VERIFIED).
 * @returns tenantId یا null
 */
export async function resolveTenantByDomain(domain: string): Promise<string | null> {
  const clean = domain.trim().toLowerCase().replace(/^[a-zA-Z]+:\/\//, "").replace(/\/+$/, "");
  if (!clean) return null;

  // دامنه‌ی خود پلتفرم → tenant خاصی نیست
  if (clean === DEFAULT_CONFIG.domain || clean === `app.${DEFAULT_CONFIG.domain}`) {
    return null;
  }

  try {
    const record = await db.tenantDomain.findFirst({
      where: { domain: clean, status: "VERIFIED" },
      select: { tenantId: true },
    });
    return record?.tenantId ?? null;
  } catch (err) {
    console.error("[white-label] خطا در resolveTenantByDomain:", err);
    return null;
  }
}

// ============ Helpers ============

function lightenColor(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}
