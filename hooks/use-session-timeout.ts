"use client";

/**
 * use-session-timeout — مدیریت نشست و خروج خودکار پس از بی‌فعالیتی
 * ============================================================================
 * API (مصرف‌شده در SessionTimeoutDialog):
 *   const { showWarning, remainingMinutes, dismissWarning, forceLogout } =
 *     useSessionTimeout({ token, sessionTimeoutMs, warningMinutesBefore, onTimeout });
 *
 * - ردیابی آخرین فعالیت کاربر (mousemove/keydown/click/touch/scroll — passive)
 * - وقتی (timeout - warning) بگذرد → showWarning = true
 *   و شمارش معکوس دقیقه‌ای تا پایان نشست
 * - dismissWarning() → ریست تایمر فعالیت (ادامهٔ نشست)
 * - forceLogout() → فراخوانی فوری onTimeout
 * - بی‌فعالیتی را سمت کلاینت می‌سنجد؛ اعمال واقعی انقضا در سرور
 *   (api/auth/me + sessions) انجام می‌شود.
 */

import * as React from "react";

interface SessionTimeoutOptions {
  token: string | null;
  /** کل مدت نشست (ms) — از /api/platform/settings/session */
  sessionTimeoutMs: number;
  /** چند دقیقه قبل از انقضا هشدار نشان بده */
  warningMinutesBefore?: number;
  /** فراخوانی هنگام انقضای کامل */
  onTimeout?: () => void;
}

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "click",
  "touchstart",
  "scroll",
];

export function useSessionTimeout({
  token,
  sessionTimeoutMs,
  warningMinutesBefore = 5,
  onTimeout,
}: SessionTimeoutOptions) {
  const [showWarning, setShowWarning] = React.useState(false);
  const [remainingMinutes, setRemainingMinutes] = React.useState(0);

  const lastActivityRef = React.useRef(Date.now());
  const onTimeoutRef = React.useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  // به‌روزرسانی آخرین فعالیت — passive + throttled
  React.useEffect(() => {
    if (!token) return;
    let last = Date.now();
    const update = () => {
      const now = Date.now();
      if (now - last < 5_000) return; // throttle ۵ ثانیه
      last = now;
      lastActivityRef.current = now;
    };
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, update, { passive: true })
    );
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, update));
    };
  }, [token]);

  // تیک ۳۰ ثانیه‌ای — ارزیابی وضعیت هشدار/انقضا
  React.useEffect(() => {
    if (!token) {
      setShowWarning(false);
      return;
    }
    const warningMs = Math.max(1, warningMinutesBefore) * 60 * 1000;
    let firedTimeout = false;

    const tick = () => {
      const idle = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, sessionTimeoutMs - idle);

      if (remaining <= 0) {
        if (!firedTimeout) {
          firedTimeout = true;
          setShowWarning(false);
          onTimeoutRef.current?.();
        }
        return;
      }

      const shouldWarn = remaining <= warningMs;
      setShowWarning((prev) => {
        if (shouldWarn && !prev) setRemainingMinutes(Math.ceil(remaining / 60_000));
        return shouldWarn;
      });
      if (shouldWarn) {
        setRemainingMinutes(Math.max(1, Math.ceil(remaining / 60_000)));
      }
    };

    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [token, sessionTimeoutMs, warningMinutesBefore]);

  const dismissWarning = React.useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  const forceLogout = React.useCallback(() => {
    setShowWarning(false);
    onTimeoutRef.current?.();
  }, []);

  return { showWarning, remainingMinutes, dismissWarning, forceLogout };
}

export default useSessionTimeout;
