"use client";

/**
 * موتور بارکدخوان سراسری هوش (v32-C)
 * =====================================================
 * چرا این ماژول؟ کاربران با «بارکدخوان سخت‌افزاری» (USB/بلوتوث/بی‌سیم) کار
 * می‌کنند. این دستگاه‌ها مثل کیبورد عمل می‌کنند: رشتهٔ بارکد را با فاصلهٔ
 * زمانی خیلی کم (معمولاً ۱۰ تا ۵۰ میلی‌ثانیه بین کلیدها) تایپ می‌کنند و
 * با Enter (یا Tab) تمامش می‌کنند.
 *
 * این موتور روی window (فاز capture) گوش می‌دهد، الگوی «تایپ بسیار سریع +
 * پایان‌دهندهٔ Enter/Tab» را تشخیص می‌دهد و:
 *   ۱) اگر فوکوس داخل input/textarea باشد، متنِ تایپ‌شدهٔ بارکد را از آن
 *      فیلد پاک می‌کند (تا فیلدِ مثلاً «نام طرف‌حساب» آلوده نشود)
 *   ۲) رویداد Enter را preventDefault می‌کند (تا فرمی submit نشود)
 *   ۳) کد را نرمال‌سازی (ارقام فارسی→انگلیسی) و به پشتهٔ هندلرها می‌دهد
 *
 * هندلرها (LIFO): هر ماژولی که باز است (POS، فرم فاکتور، انبار) هندلر خودش
 * را ثبت می‌کند. اگر هیچ هندلری مصرف نکرد، رویداد fallback برای اورلی
 * سراسری (کارت «کالا یافت شد») ارسال می‌شود.
 *
 * استثنا: inputهایی با data-barcode-input="1" — این فیلدهای اختصاصی
 * بارکد خودشان onKeyDown دارند؛ موتور سراسری آن‌ها را دست نمی‌زند.
 */

import { toEnglishDigits } from "@/lib/persian";

export type ScanHandler = (code: string) => boolean | void;

interface BufferEntry {
  ch: string;
  t: number;
}

/** حداقل طول کد برای تشخیص اسکن (EAN-13 = ۱۳ رقم؛ SKU کوتاه‌تر هم ممکن) */
const MIN_LENGTH = 5;
/** بیشینهٔ فاصلهٔ مجاز بین دو کلید (میلی‌ثانیه) */
const MAX_GAP_MS = 130;
/** بیشینهٔ میانگین فاصله (اسکنر واقعی معمولاً < ۴۰ms) */
const MAX_AVG_GAP_MS = 70;
/** پس از این مدت بی‌تحرکی، بافر ریست می‌شود */
const BUFFER_TTL_MS = 400;
/** طول نگه‌داشتن اسکن اخیر برای مصرفِ دیرهنگام (مثلاً بعد از باز شدن فرم) */
const PENDING_TTL_MS = 30_000;

const handlers: ScanHandler[] = [];
const buffer: BufferEntry[] = [];
let listening = false;
let lastKeyTime = 0;
let interceptorActive = false; // از لحظه‌ای که مطمئنیم اسکنر در حال تایپ است

/** آخرین اسکنِ مصرف‌نشده — برای «اسکن → باز شدن فرم فاکتور با کالا» */
let pendingScan: { code: string; t: number } | null = null;

let audioCtx: AudioContext | null = null;

/* ============ بوق بازخورد (WebAudio — بدون فایل صوتی) ============ */

function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    // مرورگرها بعد از تعامل کاربر AudioContext را resume می‌کنند
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** صدای اسکن موفق — دو نت کوتاه صعودی */
export function beepScanOk(): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    const mk = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };
    mk(1180, t0, 0.07);
    mk(1560, t0 + 0.08, 0.09);
  } catch {
    /* ignore */
  }
}

/** صدای خطا — نت بم کشیده */
export function beepScanError(): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 220;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  } catch {
    /* ignore */
  }
}

/* ============ پشتهٔ هندلر (LIFO) ============ */

export function registerBarcodeHandler(handler: ScanHandler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.lastIndexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

/* ============ اسکن در انتظار (pending) ============ */

export function setPendingScan(code: string): void {
  pendingScan = { code, t: Date.now() };
}

/** اسکن معلق را برمی‌گرداند و پاک می‌کند؛ اگر کهنه بود null */
export function consumePendingScan(): string | null {
  if (pendingScan && Date.now() - pendingScan.t <= PENDING_TTL_MS) {
    const code = pendingScan.code;
    pendingScan = null;
    return code;
  }
  pendingScan = null;
  return null;
}

/* ============ تشخیص الگو ============ */

function isPrintableChar(key: string): boolean {
  return key.length === 1 && /[\x20-\x7E\u0600-\u06FF]/.test(key);
}

function clearBuffer(): void {
  buffer.length = 0;
  interceptorActive = false;
}

/** پاک‌کردن متنِ تایپ‌شدهٔ اسکنر از فیلدِ فوکوس‌شده (ترفند setter بومی React) */
function cleanFocusedInput(scanned: string): void {
  const el = document.activeElement;
  if (!el) return;
  const tag = el.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA") return;
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  // فیلد اختصاصی بارکد — مال ماژول مربوطه است
  if (input.getAttribute("data-barcode-input") === "1") return;
  try {
    const proto = tag === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setter) return;
    let v = input.value;
    // حذف آخرین رخداد رشتهٔ اسکن‌شده (ارقام فارسی/انگلیسی هر دو)
    const idxEn = v.lastIndexOf(scanned);
    const idxFa = v.lastIndexOf(toEnglishDigits(scanned) === scanned ? scanned : scanned);
    const useIdx = Math.max(idxEn, idxFa);
    if (useIdx >= 0) v = v.slice(0, useIdx) + v.slice(useIdx + scanned.length);
    setter.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } catch {
    /* ignore */
  }
}

function fireScan(code: string): void {
  // نرمال‌سازی ارقام فارسی/عربی → انگلیسی + حذف فاصله‌های ابتدا/انتها
  const normalized = toEnglishDigits(code).trim();
  if (!normalized) return;
  // LIFO: آخرین هندلر ثبت‌شده (عمیق‌ترین ماژول باز) اول امتحان می‌شود
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      const consumed = handlers[i](normalized);
      if (consumed === true) return;
    } catch {
      /* هندلر خطا خورد — هندلر بعدی */
    }
  }
  // هیچ ماژولی مصرف نکرد → اورلی سراسری (کارت «کالا یافت شد»)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hoosh:barcode-fallback", { detail: { code: normalized } }));
  }
}

function onKeyDown(e: KeyboardEvent): void {
  const now = performance.now();

  // ترکیبی با Ctrl/Alt/Meta یا Escape → اسکن نیست، بافر را خالی کن
  if (e.ctrlKey || e.altKey || e.metaKey || e.key === "Escape") {
    clearBuffer();
    return;
  }

  // فیلد اختصاصی بارکد: کاملاً به خودش واگذار
  const target = e.target as HTMLElement | null;
  if (
    target &&
    target.getAttribute &&
    target.getAttribute("data-barcode-input") === "1"
  ) {
    clearBuffer();
    return;
  }

  if (e.key === "Enter" || e.key === "Tab") {
    const len = buffer.length;
    if (len >= MIN_LENGTH) {
      const first = buffer[0].t;
      const last = buffer[len - 1].t;
      const totalSpan = last - first;
      const avgGap = len > 1 ? totalSpan / (len - 1) : 0;
      let maxGap = 0;
      for (let i = 1; i < len; i++) {
        const g = buffer[i].t - buffer[i - 1].t;
        if (g > maxGap) maxGap = g;
      }
      if (maxGap <= MAX_GAP_MS && avgGap <= MAX_AVG_GAP_MS && totalSpan <= 2000) {
 // ✓ الگوی اسکنر تشخیص داده شد
        const code = buffer.map((b) => b.ch).join("");
        clearBuffer();
        // جلوگیری از submit فرم / پرش فوکوس
        e.preventDefault();
        e.stopPropagation();
        // اگر اسکنر داخل فیلدی تایپ کرده بود، پاکش کن
        cleanFocusedInput(code);
        fireScan(code);
        return;
      }
    }
    clearBuffer();
    return;
  }

  if (e.key === "Backspace") {
    clearBuffer();
    return;
  }

  if (isPrintableChar(e.key)) {
    // بافر کهنه؟ ریست
    if (buffer.length > 0 && now - lastKeyTime > BUFFER_TTL_MS) clearBuffer();
    buffer.push({ ch: e.key, t: now });
    lastKeyTime = now;
    // اگر شکاف بزرگ شد، بافر را از نقطهٔ سالم ادامه بده
    if (buffer.length > 1) {
      const gap = now - buffer[buffer.length - 2].t;
      if (gap > MAX_GAP_MS) {
        buffer.splice(0, buffer.length - 1);
        interceptorActive = false;
      } else if (gap <= MAX_GAP_MS && buffer.length >= 3) {
        interceptorActive = true;
      }
    }
    // محافظ سرریز
    if (buffer.length > 64) buffer.splice(0, buffer.length - 64);
  }
}

/** فعال‌سازی شنوندهٔ سراسری (idempotent) */
export function ensureBarcodeEngine(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", onKeyDown, true);
}

export interface BarcodeEngineStats {
  handlersCount: number;
}
export function getBarcodeEngineStats(): BarcodeEngineStats {
  return { handlersCount: handlers.length };
}
