"use client";

/**
 * ThemeApplier — اعمال تم ذخیره‌شده روی <html> هنگام بارگذاری برنامه.
 *
 * داخل AppProviders mount می‌شود تا data-theme مربوط به انتخاب کاربر
 * (یا پیش‌فرض) روی documentElement بنشیند.
 *
 * v14 — کنترل سوپرادمین: اگر کاربر «خودش» تمی انتخاب نکرده باشد،
 * تم پیش‌فرض پلتفرم (انتخاب سوپرادمین از ۱۵ تم یا رنگ‌های دلخواه)
 * از GET /api/theme-default خوانده و اعمال می‌شود. انتخاب شخصی کاربر
 * همیشه مقدم است. حالت custom متغیرهای CSS را به‌صورت پویا تزریق می‌کند.
 */

import * as React from "react";
import { useAppTheme, applyPlatformTheme } from "@/lib/theme-registry";

/** ساخت متغیرهای CSS تم سفارشی از Primary + Accent (همان فرمول ژنراتور v14) */
function buildCustomThemeCss(primary: string, accent: string): string {
  const mix = (a: string, b: string, r: number) => {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * r).toString(16).padStart(2, "0")).join("")}`;
  };
  const darken = (h: string, r: number) => mix(h, "#000000", r);
  const lighten = (h: string, r: number) => mix(h, "#FFFFFF", r);
  const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");

  const buildVars = (dark: boolean) => {
    const p = dark ? lighten(primary, 0.38) : primary;
    const bg = dark ? "#0D141B" : "#F7F9FB";
    const card = dark ? "#151D26" : "#FFFFFF";
    const fg = dark ? "#E9EDF2" : "#17212B";
    const border = dark ? "#253140" : "#E2E8F0";
    const pFg = dark ? darken(bg, 0.78) : "#FFFFFF";
    const accSoft = dark ? mix(accent, "#000000", 0.82) : lighten(accent, 0.9);
    const accFg = dark ? lighten(accent, 0.25) : darken(accent, 0.38);
    const charts = dark
      ? [p, lighten(accent, 0.1), lighten(p, 0.28), "#8C9AA9", lighten(accent, 0.45)]
      : [p, accent, lighten(p, 0.35), "#94A3B8", lighten(accent, 0.35)];
    const v: Record<string, string> = {
      "--background": bg, "--foreground": fg,
      "--card": card, "--card-foreground": fg,
      "--popover": card, "--popover-foreground": fg,
      "--primary": p, "--primary-foreground": pFg,
      "--primary-deep": dark ? lighten(p, 0.12) : darken(primary, 0.15),
      "--secondary": dark ? "#1C2630" : "#EEF2F6",
      "--secondary-foreground": dark ? "#D4DCE3" : "#24313F",
      "--muted": dark ? "#1A232D" : "#F1F4F7",
      "--muted-foreground": dark ? "#8C9AA9" : "#5B6B7B",
      "--accent": accSoft, "--accent-foreground": accFg,
      "--teal": accent, "--teal-foreground": dark ? "#0D141B" : "#FFFFFF",
      "--border": border, "--input": border, "--ring": p,
      "--chart-1": charts[0], "--chart-2": charts[1], "--chart-3": charts[2],
      "--chart-4": charts[3], "--chart-5": charts[4],
      "--sidebar": dark ? "#101923" : "#F3F6F9",
      "--sidebar-foreground": dark ? "#E9EDF2" : "#1B2733",
      "--sidebar-primary": p, "--sidebar-primary-foreground": pFg,
      "--sidebar-accent": dark ? mix(p, "#000000", 0.55) : lighten(primary, 0.92),
      "--sidebar-accent-foreground": dark ? lighten(p, 0.42) : darken(primary, 0.18),
      "--sidebar-border": dark ? "#1E2933" : "#E3E9EF",
      "--sidebar-ring": p,
      "--swatch-1": p, "--swatch-2": accent, "--swatch-3": lighten(accent, 0.3),
      "--glow": accent,
      "--grad-primary": `linear-gradient(135deg, ${primary} 0%, ${mix(primary, accent, 0.65)} 100%)`,
      "--grad-sidebar": dark
        ? `linear-gradient(180deg, #101923 0%, ${mix("#101923", primary, 0.08)} 100%)`
        : `linear-gradient(180deg, #F3F6F9 0%, ${mix("#F3F6F9", primary, 0.05)} 100%)`,
      "--glow-ring": `0 0 0 1px ${p}30, 0 4px 18px -4px ${accent}40`,
      "--grad-rgb": hexRgb(p),
    };
    return Object.entries(v).map(([k, val]) => `${k}: ${val};`).join(" ");
  };

  return `
[data-theme="platform-custom"] { ${buildVars(false)} }
.dark[data-theme="platform-custom"] { ${buildVars(true)} }`;
}

const CUSTOM_STYLE_ID = "hoosh-platform-custom-theme";
const CUSTOM_THEME_ATTR = "platform-custom";

function injectCustomTheme(primary: string, accent: string): void {
  // توجه: applyThemeToDom شناسه‌های ناشناس را به تم اول فالبک می‌کند؛
  // برای تم سفارشی مستقیماً data-theme را می‌نویسیم.
  document.documentElement.dataset.theme = CUSTOM_THEME_ATTR;
  let style = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = CUSTOM_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = buildCustomThemeCss(primary, accent);
}

export function ThemeApplier() {
  // هوک در mount مقدار ذخیره‌شده را اعمال می‌کند و روی رویداد تغییر تم
  // (CustomEvent + storage بین تب‌ها) دوباره اعمال می‌کند
 useAppTheme();

  // v14 — تم پیش‌فرض پلتفرم (سوپرادمین) برای کاربرِ بدونِ انتخاب شخصی
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hasPersonal = window.localStorage.getItem("hoosh_theme_explicit") === "1";
        if (hasPersonal) return; // انتخاب شخصی کاربر مقدم است
        const res = await fetch("/api/theme-default", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.success || !json?.data) return;
        const setting = json.data as {
          mode: "preset" | "custom";
          themeId?: string;
          custom?: { primary: string; accent: string };
        };
        if (setting.mode === "preset" && setting.themeId) {
          const current = window.localStorage.getItem("hoosh_theme");
          if (current !== setting.themeId) applyPlatformTheme(setting.themeId);
        } else if (setting.mode === "custom" && setting.custom) {
          injectCustomTheme(setting.custom.primary, setting.custom.accent);
        }
      } catch {
        /* آفلاین/خطا — تم پیش‌فرض محلی (نِیوی مِنت) باقی می‌ماند */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

export default ThemeApplier;
