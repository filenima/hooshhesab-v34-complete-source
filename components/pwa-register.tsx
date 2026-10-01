"use client";

/**
 * ثبت Service Worker هوش (v32-G)
 * ------------------------------------------------
 * PWA آفلاین: صفحات بازدیدشده + استاتیک‌ها کش می‌شوند تا بدون اینترنت
 * هم اپ باز شود (offline.html برای صفحات جدید). استراتژی network-first
 * است تا در حالت dev هم محتوای تازه همیشه اولویت داشته باشد.
 */

import * as React from "react";

export function PwaRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // ثبت بعد از لود کامل — مزاحم بوت اولیه نمی‌شود
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* بی‌صدا — مثلاً مرورگر قدیمی یا حالت ناشناس */
        });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
