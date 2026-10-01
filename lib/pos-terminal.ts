// ============ lib/pos-terminal.ts — چارچوب اتصال کارتخوان (POS) — هوش ============
//
// Task 21-B: «کارتخوان» — وقتی فاکتور با روش پرداخت کارت صادر می‌شود، می‌توان
// مبلغ را به کارتخوانِ روی کامپیوتر/شبکهٔ محلی کاربر فرستاد.
//
// معماری:
//   مرورگر ──(HTTP مستقیم به LAN)──> اپ پلِ محلی (Bridge) ──> درگاه کارتخوان
//
// استثنای مهم معماری (مستندسازی عمدی — ثبت در Task 21-B):
//   درخواست «پرداخت با کارتخوان» از مرورگرِ کاربر مستقیماً به آدرس پل محلی
//   (مثل http://127.0.0.1:9090) زده می‌شود — این درخواست از gateway اپ عبور
//   نمی‌کند و نباید مسیر نسبی باشد. دلیل: پل روی دستگاه خود کاربر اجرا می‌شود
//   (loopback/LAN) و سرور اپ (VPS) به آن دسترسی ندارد؛ فقط مرورگرِ همان
//   ماشین می‌تواند به آن برسد. تنظیمات CORS در پل محلی اجازهٔ origin اپ را می‌دهد.
//
// این ماژول «بدون وابستگی سرور» است تا در bundle کلاینت هم قابل import باشد.
// خواندن/ذخیرهٔ تنظیمات (SystemSettings) در app/api/pos/config/route.ts انجام
// می‌شود (الگوی lib/system-settings.ts).
//
// مستندات نصب پل + نمونه کد: docs/POS-INTEGRATION.md

/** شکل JSON ذخیره‌شده در SystemSettings (کلید pos_terminal_config:{tenantId}) */
export interface PosTerminalConfig {
  /** فعال بودن ادغام کارتخوان */
  enabled: boolean;
  /** آدرس پل محلی روی کامپیوتر کاربر — مثل http://127.0.0.1:9090 */
  bridgeUrl: string;
  /** شناسه ترمینال (اختیاری — برای پل‌های چندترمیناله) */
  terminalId: string;
  /** حداکثر زمان انتظار پاسخ کارتخوان (میلی‌ثانیه) */
  timeoutMs: number;
  /** Task 23-D — شارژ خودکار: با صدور هر فاکتور نقدی، مبلغ خودکار به کارتخوان فرستاده شود
   *  (مشتری فقط کارت می‌کشد و رمز می‌زند؛ نتیجه خودکار روی فاکتور ثبت می‌شود) */
  autoChargeOnIssue?: boolean;
}

/** پیش‌فرض‌های امن — غیرفعال تا کاربر تنظیم نکرده باشد */
export const DEFAULT_POS_TERMINAL_CONFIG: PosTerminalConfig = {
  enabled: false,
  bridgeUrl: "http://127.0.0.1:9090",
  terminalId: "",
  timeoutMs: 30000,
  // Task 23-D: با فعال‌کردن کارتخوان، شارژ خودکار پیش‌فرض روشن است
  // (خواستهٔ صریح مالک: «وقتی فاکتور زد اتومات روی کارتخوانش بیاد»)
  autoChargeOnIssue: true,
};

/** نرمال‌سازی ورودی کاربر (متصل‌کنندهٔ UI → API) */
export function sanitizePosTerminalConfig(
  raw: Partial<Record<keyof PosTerminalConfig, unknown>>
): PosTerminalConfig {
  let bridgeUrl = String(raw.bridgeUrl ?? "").trim();
  // برداشتن اسلش انتهایی و اعتبارسنجی ساده
  if (bridgeUrl.endsWith("/")) bridgeUrl = bridgeUrl.slice(0, -1);
  if (bridgeUrl && !/^https?:\/\//i.test(bridgeUrl)) {
    // پیشوند پروتکل فراموش شده — اضافه می‌کنیم (معمولاً http روی LAN)
    bridgeUrl = `http://${bridgeUrl}`;
  }
  const timeoutRaw = Number(raw.timeoutMs);
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 2000 && timeoutRaw <= 180000
      ? Math.round(timeoutRaw)
      : DEFAULT_POS_TERMINAL_CONFIG.timeoutMs;
  return {
    enabled: raw.enabled === true,
    bridgeUrl: bridgeUrl.slice(0, 200) || DEFAULT_POS_TERMINAL_CONFIG.bridgeUrl,
    terminalId: String(raw.terminalId ?? "").trim().slice(0, 50),
    timeoutMs,
    // اگر کلید غایب باشد (تنظیمات قدیمی) → پیش‌فرض true؛ فقط false صریح خاموشش می‌کند
    autoChargeOnIssue: raw.autoChargeOnIssue === undefined ? true : raw.autoChargeOnIssue === true,
  };
}

/** پاسخ پل به درخواست charge */
export interface PosChargeResult {
  ok: boolean;
  /** وضعیت پرداخت: paid | failed | timeout */
  status: "paid" | "failed" | "timeout" | string;
  /** شماره پیگیری کارتخوان (اختیاری) */
  reference?: string;
  /** پیام خطای پل (اختیاری) */
  message?: string;
}

/**
 * ارسال مبلغ به کارتخوان از مرورگر — اتصال مستقیم به پل محلی کاربر.
 * (توضیح استثنای «بدون مسیر نسبی» در کامنت بالای فایل.)
 *
 * @param cfg تنظیمات پل (از /api/pos/config)
 * @param amountRial مبلغ به ریال
 * @param invoiceNumber شماره فاکتور برای درج در رسید
 */
export async function posCharge(
  cfg: PosTerminalConfig,
  amountRial: number,
  invoiceNumber: string
): Promise<PosChargeResult> {
  const url = `${cfg.bridgeUrl}/charge`;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(cfg.timeoutMs, 2000)
  );
  try {
    // درخواست مستقیم به دستگاه کاربر — نه از طریق gateway اپ (استثنای معماری)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        amountRial: Math.round(amountRial),
        terminalId: cfg.terminalId || undefined,
        invoiceNumber,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<PosChargeResult>;
    if (!res.ok) {
      return {
        ok: false,
        status: String(json.status ?? "failed"),
        message:
          (json.message as string | undefined) ??
          `پل کارتخوان خطای HTTP ${res.status} برگرداند`,
      };
    }
    return {
      ok: json.ok === true,
      status: String(json.status ?? (json.ok ? "paid" : "failed")),
      reference: json.reference ? String(json.reference) : undefined,
      message: json.message ? String(json.message) : undefined,
    };
  } catch (err) {
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    return {
      ok: false,
      status: aborted ? "timeout" : "failed",
      message: aborted
        ? "پاسخ کارتخوان در مهلت مقرر دریافت نشد"
        : "اتصال به پل کارتخوان برقرار نشد — آیا برنامه پل روی این کامپیوتر اجراست؟",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * تست سلامت پل — GET {bridgeUrl}/health با مهلت ۳ ثانیه.
 * برای دکمهٔ «تست اتصال» در تنظیمات کارتخوان.
 */
export async function posHealth(
  bridgeUrl: string
): Promise<{ ok: boolean; message?: string; version?: string }> {
  const base = bridgeUrl.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, message: "آدرس پل خالی است" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      version?: string;
    };
    return {
      ok: res.ok && json.ok !== false,
      version: json.version ? String(json.version) : undefined,
      message: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch {
    return {
      ok: false,
      message:
        "پل در دسترس نیست — برنامه پل باید روی همین کامپیوتر در حال اجرا باشد",
    };
  } finally {
    clearTimeout(timer);
  }
}
