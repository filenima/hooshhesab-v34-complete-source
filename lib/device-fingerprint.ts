"use client";

/**
 * device-fingerprint — اثر انگشت پایدار مرورگر برای سد ضدتقلب ثبت‌نام (v19)
 * ----------------------------------------------------------------------------
 * ترکیب سیگنال‌های پایدار مرورگر → هش sha-256 (از Web Crypto):
 *   - canvas rendering (رندر متن/شکل وابسته به GPU/فونت/درایور)
 *   - screen: عرض/ارتفاع/عمق رنگ
 *   - timezone + locale + زبان‌ها
 *   - hardwareConcurrency / deviceMemory / platform
 *   - touch support
 *   - sessionStorage/localStorage availability
 *
 * نتیجه در localStorage کش می‌شود تا در بازدیدهای بعدی پایدار بماند؛
 * پاک‌کردن آن هم مشکلی ایجاد نمی‌کند چون سرور از همان سیگنال‌ها
 * دوباره همان هش را می‌سازد و هویت دستگاه حفظ می‌شود.
 */

const FP_CACHE_KEY = "hoosh_device_fp_v1";

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // fallback: hash ساده (محیط‌های بدون crypto.subtle مثل http غیرامن)
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
    }
    return `fb${Math.abs(h).toString(16)}${input.length.toString(16)}`.padEnd(24, "0").slice(0, 40);
  }
}

function canvasSignal(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 220;
    c.height = 40;
    const ctx = c.getContext("2d");
    if (!ctx) return "nocanvas";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 90, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("هوش-حساب fp ✓ 123", 2, 2);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("hoosh fp", 4, 20);
    return c.toDataURL().slice(-160);
  } catch {
    return "canvas-err";
  }
}

function collectSignals(): string {
  const nav = navigator as Navigator & {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    platform?: string;
    maxTouchPoints?: number;
  };
  return [
    canvasSignal(),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
    navigator.language,
    (navigator.languages || []).join(","),
    String(nav.hardwareConcurrency || 0),
    String(nav.deviceMemory || 0),
    String(nav.platform || ""),
    String(nav.maxTouchPoints || 0),
    "ontouchstart" in window ? "t" : "f",
    typeof localStorage !== "undefined" ? "ls" : "nols",
    typeof sessionStorage !== "undefined" ? "ss" : "noss",
  ].join("~");
}

/** ساخت/خواندن fingerprint پایدار — hex ۶۴ کاراکتری */
export async function getDeviceFingerprint(): Promise<string> {
  try {
    const cached = localStorage.getItem(FP_CACHE_KEY);
    if (cached && /^[a-f0-9]{16,64}$/i.test(cached)) return cached;
    const fp = await sha256Hex(collectSignals());
    localStorage.setItem(FP_CACHE_KEY, fp);
    return fp;
  } catch {
    // private mode — بدون کش هر بار بساز
    try {
      return await sha256Hex(collectSignals());
    } catch {
      return "";
    }
  }
}

/** هدر/فیلد آماده برای ارسال در بدنهٔ درخواست ثبت‌نام */
export async function deviceFingerprintField(): Promise<{ deviceFingerprint: string }> {
  return { deviceFingerprint: await getDeviceFingerprint() };
}

export default getDeviceFingerprint;
