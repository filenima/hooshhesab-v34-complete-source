"use client";

/**
 * export-guard — قفل خروجی‌گرفتن داده در پلن رایگان/تریال (v19)
 * ----------------------------------------------------------------------------
 * درخواست مالک: «صادر کردن اطلاعات در پلن رایگان قفل باشد»
 *
 * همهٔ توابع خروجی (CSV / Excel / JSON / TSV / چاپ) قبل از دانلود از این
 * گارد می‌گذرند:
 *   - کاربر تریال/رایگان/دمو → توست زیبا با دکمهٔ «ارتقا حساب» + باز شدن
 *     صفحه پلن‌ها؛ فایل دانلود نمی‌شود.
 *   - کاربر پلن پولی (basic/pro/enterprise) → دانلود عادی.
 *
 * وضعیت لایسنس ۵ دقیقه کش می‌شود تا هر کلیک خروجی یک درخواست اضافه نسازد.
 * سمت سرور هم مسیرهای خروجی (logs/export و…) برای تریال بسته شده‌اند —
 * این گارد لایهٔ UX است، نه امنیتی.
 */

import { toast } from "sonner";
import { Sparkles, Lock } from "lucide-react";

const CACHE_KEY = "hoosh_export_license_cache_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface LicenseCacheEntry {
  at: number;
  allowed: boolean;
}

/** پلن‌هایی که خروجی دارند */
const EXPORT_ALLOWED_PLANS = ["basic", "pro", "enterprise", "professional", "business"];

/** بررسی اجازهٔ خروجی — با کش ۵ دقیقه‌ای */
export async function ensureExportAllowed(): Promise<boolean> {
  if (typeof window === "undefined") return true;

  // کش معتبر؟
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const entry = JSON.parse(raw) as LicenseCacheEntry;
      if (Date.now() - entry.at < CACHE_TTL_MS) {
        if (!entry.allowed) showLockedToast();
        return entry.allowed;
      }
    }
  } catch {
    /* ignore */
  }

  // بدون توکن = کاربر مهمان در لندینگ → خروجی داشبورد دمو مجاز است؟
  // خیر — قفل درخواستی مالک شامل همهٔ کاربران غیرپرداختی است؛ اما مهمانِ
  // لندینگ اصلاً به ماژول‌ها دسترسی ندارد، پس این حالت عملاً رخ نمی‌دهد.
  let token: string | null = null;
  try {
    token = localStorage.getItem("hoshhesab_user_token");
  } catch {
    /* ignore */
  }
  if (!token) {
    // دمو-مود لندینگ (بدون حساب) — قفل با پیام واضح
    cache(false);
    showLockedToast();
    return false;
  }

  try {
    const res = await fetch("/api/license/status", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = await res.json();
    if (!json?.success || !json?.data) {
      // پاسخ نامشخص — fail-open تا خروجیِ کاربران پرداختی هرگز قفل نشود
      cache(true);
      return true;
    }
    const { isTrial, isDemo, plan, isValid } = json.data as {
      isTrial: boolean;
      isDemo: boolean;
      plan: string;
      isValid: boolean;
    };
    // لایسنس معتبرِ غیرتریال با پلن پولی → مجاز
    const allowed =
      !isDemo &&
      !isTrial &&
      isValid === true &&
      EXPORT_ALLOWED_PLANS.includes(String(plan).toLowerCase());
    cache(allowed);
    if (!allowed) showLockedToast();
    return allowed;
  } catch {
    // خطای شبکه — fail-open (دانلود سمت کلاینت است؛ داده از قبل در UI هست)
    return true;
  }
}

function cache(allowed: boolean) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), allowed } satisfies LicenseCacheEntry)
    );
  } catch {
    /* ignore */
  }
}

/** ریست کش — بعد از ارتقا یا پرداخت موفق صدا زده شود */
export function invalidateExportGuardCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function showLockedToast() {
  toast.error("خروجی‌گرفتن در پلن رایگان قفل است", {
    description:
      "در پلن رایگان/تریال نمی‌توانید اطلاعات را خارج کنید. با ارتقا به پلن پایه یا حرفه‌ای، خروجی CSV و Excel همهٔ گزارش‌ها فعال می‌شود.",
    duration: 8000,
    icon: <Lock className="h-4 w-4" aria-hidden="true" />,
    action: {
      label: (
        <span className="flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          ارتقا حساب
        </span>
      ),
      onClick: () => {
        // ناوبری به صفحه پلن‌ها — هم SPA route و هم fallback URL
        try {
          window.sessionStorage.setItem("hoosh_navigate_to", "pricing");
          window.dispatchEvent(new CustomEvent("hoosh:navigate", { detail: "pricing" }));
        } catch {
          /* ignore */
        }
        window.location.hash = "#pricing";
      },
    },
  });
}
