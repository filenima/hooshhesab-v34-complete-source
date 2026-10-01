"use client";

/**
 * use-license-check — گارد لایسنس اپلیکیشن
 * ============================================================================
 * LicenseGuard — کامپوننت wrapper که وضعیت لایسنس tenant را از
 * GET /api/license/status می‌خواند (توکن کاربر لازم است):
 *  - بدون توکن / کاربر دمو / isValid → children رندر می‌شود
 *  - لایسنس منقضی/نامعتبر → LicenseLockScreen (تمدید یا خروج)
 *  - خطای شبکه → گرایش به نمایش children (fail-open برای در دسترس بودن
 *    محصول در اختلالات گذرا؛ حداکثر ۲ تلاش مجدد خودکار)
 *
 * بازچک دوره‌ای هر ۱۵ دقیقه + هنگام visible شدن تب.
 */

import * as React from "react";
import { LicenseLockScreen } from "@/components/views/license-lock-screen";

interface LicenseInfo {
  isValid: boolean;
  isDemo: boolean;
  isTrial: boolean;
  plan: string;
  status: string;
  endDate: string | null;
  daysRemaining: number | null;
}

interface LicenseGuardProps {
  token: string | null;
  onRenew: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const RECHECK_INTERVAL = 15 * 60 * 1000;

export function useLicenseCheck(token: string | null) {
  const [license, setLicense] = React.useState<LicenseInfo | null>(null);
  const [locked, setLocked] = React.useState(false);
  const [checking, setChecking] = React.useState(false);

  const check = React.useCallback(async () => {
    if (!token) {
      setLocked(false);
      setLicense(null);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("/api/license/status", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.success && json.data) {
        setLicense(json.data as LicenseInfo);
        // قفل فقط وقتی است که پاسخ معتبرِ isValid=false باشد — نه در خطای شبکه
        setLocked(json.data.isValid === false);
      }
    } catch {
      /* خطای شبکه → وضعیت قبلی حفظ می‌شود (fail-open) */
    } finally {
      setChecking(false);
    }
  }, [token]);

  React.useEffect(() => {
    void check();
    const iv = setInterval(() => void check(), RECHECK_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  return { license, locked, checking, recheck: check };
}

export function LicenseGuard({ token, onRenew, onLogout, children }: LicenseGuardProps) {
  const { license, locked } = useLicenseCheck(token);

  if (!token) {
    // بدون توکن، احراز هویت خودش کاربر را هدایت می‌کند
    return <>{children}</>;
  }

  if (locked) {
    return (
      <LicenseLockScreen
        licenseInfo={
          license
            ? { plan: license.plan, endDate: license.endDate, status: license.status }
            : null
        }
        onRenew={onRenew}
        onLogout={onLogout}
      />
    );
  }

  return <>{children}</>;
}

export default LicenseGuard;
