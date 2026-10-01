// ============ lib/modian.ts — منطق مشترک سامانه مودیان — هوش ============
//
// این ماژول «تنها منبع حقیقت» برای قوانین ارسال صورتحساب به سامانه مودیان است.
// همه‌ی مسیرهای API مودیان (send/batch/inquiry/reconcile) از همین توابع استفاده
// می‌کنند تا قواعد یکسان بمانند:
//
// ۱) واجد شرایط بودن فاکتور (isModianEligible) — فقط فروش نهایی غیرپیش‌نویس
// ۲) صف ارسال (getModianPending) — فاکتورهای واجد شرایطِ ارسال‌نشده/ردشده (retry)
// ۳) محافظت از «مالیات دوبرابر» (findDuplicateCandidates) — تشخیص فاکتور مشابه
//    برای همان فروش (صدور دو فاکتور برای یک فروش = خطر واقعی مالیات دوبرابر)
// ۴) محیط تست/واقعی (getModianEnv) — TEST هیچ‌وقت به سازمان واقعی نمی‌رود
// ۵) اتصال واقعی نسخه ۲ (getModianConnection + moadianFetch) — احراز هویت
//    با nonce + JWS (RS256 + گواهی کارپوشه) مطابق requestsmanager/api/v2
// ۶) ساخت صورتحساب رسمی نسخه ۲ (buildOfficialInvoice) — header/body/payments
//    با taxid (Verhoeff) مطابق دستورالعمل فنی سازمان
//
// CRITICAL: هیچ تابعی در این فایل نباید ارسال را «شبیه‌سازی» کند — مودیان
// سامانه حقوقی-مالیاتی است؛ موفقیت جعلی = جریمه واقعی برای کاربر.
//
// FIX(v4-مودیان): پیاده‌سازی قبلی از OAuth2 (grant_type=client_credentials) و
// endpoint ساختگی /api/v1/invoices استفاده می‌کرد که در API رسمی مودیان وجود
// ندارد. اتصال واقعی مودیان نسخه ۲ با این چرخه کار می‌کند:
//   GET /nonce → JWS({nonce, clientId}) → Authorization: Bearer
//   POST /invoice با پکت‌های JWE-شده (امضای RS256 + رمز RSA-OAEP-256/A256GCM)

import crypto from "crypto";

import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { decryptField } from "@/lib/db-encryption";
import { toEnglishDigits, gregorianToJalali } from "@/lib/persian";
import {
  buildMoadianJws,
  buildMoadianJwe,
  generateMoadianTaxid,
  serialToInno,
} from "@/lib/modian-crypto";

// ---------- انواع ----------

export interface ModianInvoiceLike {
  id?: string;
  type: string; // SALE | PURCHASE | PRE_INVOICE | RETURN
  status: string; // DRAFT | SENT | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED
  partyId: string | null;
  total: bigint;
  deletedAt?: Date | null;
}

/** اتصال واقعی مودیان نسخه ۲ — شناسه حافظه + گواهی + کلید خصوصی */
export interface ModianConnection {
  /** شناسه یکتای حافظه مالیاتی (۶ کاراکتر) — clientId/fiscalId */
  memoryId: string;
  /** گواهی X.509 (PEM) — از کارپوشه */
  certificatePem: string;
  /** کلید خصوصی PKCS#8 (PEM) — از کارپوشه/توکن */
  privateKeyPem: string;
  /** آدرس پایه API نسخه ۲ (requestsmanager/api/v2) */
  baseUrl: string;
}

export interface ModianEnvConfig {
  /** محیط ارسال — TEST هرگز به سازمان واقعی نمی‌رود */
  env: "TEST" | "LIVE";
  /** آدرس API محیط آزمایشی (قابل تنظیم توسط کاربر) */
  testUrl: string;
}

// آدرس‌های رسمی نسخه ۲ مودیان (requestsmanager)
export const DEFAULT_TEST_URL = "https://sandboxrc.tax.gov.ir/requestsmanager/api/v2";
export const DEFAULT_LIVE_URL = "https://tp.tax.gov.ir/requestsmanager/api/v2";

// ساختار JSON ذخیره‌شده در Integration.config
export interface ModianStoredConfig {
  method?: string;
  bookletId?: string;
  apiKeyEnc?: string;
  storeUrl?: string;
  env?: "TEST" | "LIVE";
  testUrl?: string;
  direct?: {
    username?: string;
    passwordEnc?: string;
    apiToken?: string;
    serverUrl?: string;
    /** شناسه یکتای حافظه مالیاتی (۶ کاراکتر) — v2 */
    memoryId?: string;
    /** گواهی X.509 PEM — رمزنگاری‌شده AES-256-GCM */
    certificatePemEnc?: string;
    /** کلید خصوصی PKCS#8 PEM — رمزنگاری‌شده AES-256-GCM */
    privateKeyPemEnc?: string;
    bookletId?: number;
  };
  tsp?: { provider?: string; apiKeyEnc?: string; callbackUrl?: string };
  middleware?: { middlewareType?: string; connectionStringEnc?: string; apiEndpoint?: string };
  oauth?: Record<string, string | undefined>;
  batch?: { enabled?: boolean; size?: number; schedule?: string };
  webhook?: { enabled?: boolean; url?: string; events?: string[] };
  [key: string]: unknown;
}

// ---------- ۱) قوانین واجد شرایط بودن ----------

/** وضعیت‌های «نهایی» فاکتور — فاکتور پیش‌نویس/باطل‌شده به مودیان نمی‌رود */
export const MODIAN_FINAL_STATUSES = [
  "SENT",
  "PARTIALLY_PAID",
  "PARTIAL",
  "PAID",
  "OVERDUE",
];

/**
 * آیا این فاکتور واجد شرایط ارسال به سامانه مودیان است؟
 *
 * قواعد (همان قواعد نمایش‌داده‌شده در UI):
 *  - type === "SALE" (فروش) — PURCHASE در پیاده‌سازی کامل به‌صورت
 *    «برگشت از فروش/خرید» ارسال می‌شود؛ فعلاً فاز دوم است و ارسال نمی‌شود.
 *  - وضعیت نهایی باشد (SENT/PARTIAL/PAID/OVERDUE) — DRAFT و CANCELLED نمی‌روند.
 *  - طرف‌حساب داشته باشد.
 *  - مبلغ کل > 0 باشد.
 */
export function isModianEligible(invoice: ModianInvoiceLike): boolean {
  if (invoice.type !== "SALE") return false;
  if (!MODIAN_FINAL_STATUSES.includes(invoice.status)) return false;
  if (!invoice.partyId) return false;
  if (invoice.deletedAt) return false;
  const total = Number(invoice.total ?? 0n);
  return total > 0;
}

/**
 * فاکتورهای واجد شرایطِ در صف ارسال مودیان:
 * modianStatus تهی (هنوز ارسال نشده) یا REJECTED (قابل ارسال مجدد/retry).
 * PENDING یعنی کاربر آن را به‌عنوان در صف علامت زده — همان‌طور ارسال می‌شود.
 */
export async function getModianPending(tenantId: string, limit = 200) {
  return db.invoice.findMany({
    where: modianPendingWhere(tenantId),
    include: { party: true, items: true },
    orderBy: { date: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}

/** شرط Prisma صف ارسال مودیان — منبع واحد برای count و findMany */
export function modianPendingWhere(tenantId: string) {
  return {
    tenantId,
    deletedAt: null,
    type: "SALE" as const,
    status: { in: MODIAN_FINAL_STATUSES },
    total: { gt: 0n },
    OR: [
      { modianStatus: null },
      { modianStatus: "PENDING" },
      { modianStatus: "REJECTED" },
    ],
  };
}

/** شمارش فاکتورهای در صف ارسال — بدون بارگذاری رکوردها */
export async function countModianPending(tenantId: string): Promise<number> {
  return db.invoice.count({ where: modianPendingWhere(tenantId) });
}

// ---------- ۲) محافظت از مالیات دوبرابر ----------

export interface DuplicateCandidate {
  id: string;
  number: string;
  partyName: string | null;
  total: number; // ریال
  date: string; // ISO
  daysAgo: number;
  modianStatus: string | null;
  modianUid: string | null;
}

/**
 * جستجوی «فاکتور مشابه» برای همان فروش:
 * همان طرف‌حساب + مبلغ کل در بازه ±۵٪ + تاریخ در N روز اخیر + نوع SALE.
 *
 * چرا مهم است: مالیات دوبرابر واقعی وقتی رخ می‌دهد که برای «یک فروش»
 * دو صورتحساب صادر و ارسال شود. هوش قبل از ارسال هشدار می‌دهد و بدون
 * تأیید صریح (`confirm: true`) ارسال نمی‌کند.
 */
export async function findDuplicateCandidates(
  tenantId: string,
  partyId: string | null,
  amountRial: number,
  withinDays = 3,
  excludeInvoiceId?: string
): Promise<DuplicateCandidate[]> {
  if (!partyId || !(amountRial > 0)) return [];

  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, withinDays));
  since.setHours(0, 0, 0, 0);

  const lower = BigInt(Math.max(1, Math.round(amountRial * 0.95)));
  const upper = BigInt(Math.round(amountRial * 1.05));

  const candidates = await db.invoice.findMany({
    where: {
      tenantId,
      deletedAt: null,
      type: "SALE",
      partyId,
      total: { gte: lower, lte: upper },
      date: { gte: since },
      ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
    },
    include: { party: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 10,
  });

  const now = Date.now();
  return candidates.map((c) => ({
    id: c.id,
    number: c.number,
    partyName: c.party?.name ?? null,
    total: Number(c.total),
    date: c.date.toISOString(),
    daysAgo: Math.max(0, Math.floor((now - c.date.getTime()) / 86_400_000)),
    modianStatus: c.modianStatus,
    modianUid: c.modianUid,
  }));
}

// ---------- ۳) خواندن پیکربندی مودیان (اتصال واقعی v2) ----------

export type ModianConnectionResult =
  | { ok: true; connection: ModianConnection }
  | { ok: false; reason: "NO_MEMORY_ID" | "NO_CERTIFICATE" | "NO_PRIVATE_KEY" | "NO_CONFIG" | "DECRYPT_ERROR" };

/**
 * خواندن پیکربندی اتصال واقعی مودیان نسخه ۲ برای یک تنانت.
 *
 * منبع: رکورد Integration با نوع MODIAN (شناسه حافظه + گواهی + کلید —
 * هر دو رمزنگاری‌شده با AES-256-GCM) یا متغیرهای محیطی سراسری:
 *   MODIAN_MEMORY_ID, MODIAN_CERTIFICATE_PEM, MODIAN_PRIVATE_KEY_PEM
 *
 * هرگز خطا نمی‌اندازد — نتیجه‌ی {ok:false} یعنی «پیکربندی نشده».
 */
export async function getModianConnection(
  tenantId: string
): Promise<ModianConnectionResult> {
  const integration = await db.integration.findFirst({
    where: { tenantId, type: "MODIAN" },
  });

  let memoryId: string | undefined;
  let certEnc: string | undefined;
  let keyEnc: string | undefined;
  let baseUrl: string | undefined;

  if (integration) {
    let stored: ModianStoredConfig = {};
    try {
      stored = JSON.parse(integration.config || "{}") as ModianStoredConfig;
    } catch {
      stored = {};
    }

    memoryId = stored.direct?.memoryId?.trim().toUpperCase();
    certEnc = stored.direct?.certificatePemEnc;
    keyEnc = stored.direct?.privateKeyPemEnc;
    baseUrl = stored.direct?.serverUrl?.trim() || undefined;

    // سازگاری قدیمی: username قبلی به‌عنوان memoryId تفسیر می‌شود اگر
    // ساختار جدید تنظیم نشده باشد (کاربران قدیمی مقدار را در username ذخیره داشتند)
    if (!memoryId && stored.direct?.username && /^[A-Za-z0-9]{6}$/.test(stored.direct.username.trim())) {
      memoryId = stored.direct.username.trim().toUpperCase();
    }
  }

  // متغیرهای محیطی سراسری (برای استقرار سرور بدون تنظیم از UI)
  if (!memoryId || !certEnc || !keyEnc) {
    const envMemoryId = process.env.MODIAN_MEMORY_ID?.trim().toUpperCase();
    const envCert = process.env.MODIAN_CERTIFICATE_PEM;
    const envKey = process.env.MODIAN_PRIVATE_KEY_PEM;
    if (envMemoryId && envCert && envKey) {
      if (!memoryId) memoryId = envMemoryId;
      if (!certEnc) certEnc = encrypt(envCert);
      if (!keyEnc) keyEnc = encrypt(envKey);
    }
  }

  if (!memoryId) return { ok: false, reason: "NO_MEMORY_ID" };
  if (!certEnc) return { ok: false, reason: "NO_CERTIFICATE" };
  if (!keyEnc) return { ok: false, reason: "NO_PRIVATE_KEY" };

  let certificatePem: string;
  let privateKeyPem: string;
  try {
    certificatePem = decrypt(certEnc);
    privateKeyPem = decrypt(keyEnc);
  } catch {
    return { ok: false, reason: "DECRYPT_ERROR" };
  }

  return {
    ok: true,
    connection: {
      memoryId,
      certificatePem,
      privateKeyPem,
      baseUrl: baseUrl || DEFAULT_LIVE_URL,
    },
  };
}

/** پیام فارسی قابل‌نمایش برای هر دلیل نبودِ پیکربندی */
export function modianConnectionReasonFa(reason: "NO_MEMORY_ID" | "NO_CERTIFICATE" | "NO_PRIVATE_KEY" | "NO_CONFIG" | "DECRYPT_ERROR"): string {
  switch (reason) {
    case "NO_MEMORY_ID":
      return "شناسه یکتای حافظه مالیاتی تنظیم نشده است (تنظیمات اتصال مودیان)";
    case "NO_CERTIFICATE":
      return "گواهی دیجیتال کارپوشه بارگذاری نشده است (تنظیمات اتصال مودیان)";
    case "NO_PRIVATE_KEY":
      return "کلید خصوصی گواهی بارگذاری نشده است (تنظیمات اتصال مودیان)";
    case "DECRYPT_ERROR":
      return "رمزگشایی گواهی/کلید ناموفق بود — کلید ENCRYPTION_KEY سرور تغییر کرده است";
    default:
      return "اتصال به سامانه مودیان پیکربندی نشده است";
  }
}

/**
 * محیط ارسال مودیان (TEST/LIVE) از پیکربندی Integration.
 * پیش‌فرض LIVE است — محیط تست فقط با انتخاب صریح کاربر فعال می‌شود.
 */
export async function getModianEnv(tenantId: string): Promise<ModianEnvConfig> {
  const integration = await db.integration.findFirst({
    where: { tenantId, type: "MODIAN" },
  });
  if (!integration) return { env: "LIVE", testUrl: DEFAULT_TEST_URL };
  try {
    const stored = JSON.parse(integration.config || "{}") as ModianStoredConfig;
    return {
      env: stored.env === "TEST" ? "TEST" : "LIVE",
      testUrl: stored.testUrl?.trim() || DEFAULT_TEST_URL,
    };
  } catch {
    return { env: "LIVE", testUrl: DEFAULT_TEST_URL };
  }
}

/** اعتبارسنجی شناسه حافظه: دقیقاً ۶ کاراکتر حرف/رقم */
export function isValidMemoryId(memoryId: string): boolean {
  return /^[A-Za-z0-9]{6}$/.test(memoryId.trim());
}

// ---------- ۴) کلاینت HTTP مودیان نسخه ۲ (nonce + JWS) ----------

/** پیام خطای HTTP رسمی مودیان → معادل فارسی قابل‌فهم */
export function modianErrorToFa(status: number, body: unknown): string {
  const bodyObj = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const bodyText = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const code = String(bodyObj?.["errorCode"] ?? bodyObj?.["code"] ?? "");
  switch (status) {
    case 401: {
      if (code === "4103") return "شماره سریال گواهی با شناسه حافظه هم‌خوان نیست (خطای ۴۱۰۳) — گواهی دیجیتال مربوط به این حافظه نیست";
      if (code === "4110") return "شناسه حافظه مالیاتی یافت نشد یا غیرفعال است (خطای ۴۱۱۰)";
      if (code === "4120") return "شناسه شرکت معتمد یافت نشد (خطای ۴۱۲۰)";
      if (code === "4130") return "ساختار توکن امضا نامعتبر است (خطای ۴۱۳۰)";
      if (code === "4131") return "امضا یا گواهی دیجیتال نامعتبر است — زنجیره اعتبار/انقضای گواهی را بررسی کنید (خطای ۴۱۳۱)";
      return "احراز هویت با مودیان ناموفق بود (۴۰۱) — توکن امضا ساخته نشد یا nonce منقضی شده";
    }
    case 400: {
      if (code === "4101") return "توکن فاقد nonce/clientId است (خطای ۴۱۰۱)";
      if (code === "4102") return "چالش nonce استفاده‌شده یا منقضی شده است (خطای ۴۱۰۲) — دوباره تلاش کنید";
      if (code === "4143") return "بیش از ۱۰۰۰ صورتحساب در یک درخواست (خطای ۴۱۴۳)";
      if (code === "4144") return "بدنه درخواست خالی/نامعتبر است (خطای ۴۱۴۴)";
      if (code === "4145") return "payload یا شناسه درخواست خالی است (خطای ۴۱۴۵)";
      if (code === "4146") return "timeToLive خارج از بازه ۱۰ تا ۲۰۰ ثانیه است (خطای ۴۱۴۶)";
      if (code === "4141") return "بیش از ۱۰۰ شناسه در استعلام (خطای ۴۱۴۱)";
      if (code === "4164") return "بازه استعلام بیش از یک هفته است (خطای ۴۱۶۴)";
      if (code === "4140") return "بازه زمانی استعلام نامعتبر است (start بعد از end — خطای ۴۱۴۰)";
      return `درخواست نامعتبر (۴۰۰)${code ? ` — کد ${code}` : ""}`;
    }
    case 404:
      return "سرویس/منبع یافت نشد (۴۰۴) — آدرس API و نسخه را بررسی کنید";
    case 429:
      return "تعداد درخواست‌ها بیش از حد مجاز است (۴۲۹) — کمی بعد تلاش کنید";
    case 500:
    case 502:
    case 503:
      return `سرویس مودیان در دسترس نیست (HTTP ${status}) — چند لحظه بعد تلاش کنید`;
    default: {
      const snippet = bodyText.slice(0, 160).replace(/\s+/g, " ").trim();
      return `خطای مودیان HTTP ${status}${snippet ? `: ${snippet}` : ""}`;
    }
  }
}

export type ModianHttpResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; errorFa: string; body?: unknown };

interface NonceResponse {
  nonce: string;
  expDate?: string;
}

interface ServerInformation {
  serverTime?: number;
  publicKeys?: Array<{ key: string; id: string; algorithm?: string; purpose?: number }>;
}

/**
 * کش کلید عمومی سازمان (با TTL یک‌ساعته — کلیدها به‌ندرت عوض می‌شوند)
 * FIX(v4-مودیان/H6): کش «per baseUrl» است — قبلاً یک کش سراسری بین محیط
 * TEST و LIVE (و بین tenantها) مشترک بود و کلید sandbox روی محیط واقعی (یا
 * برعکس) استفاده می‌شد → خطای رمزنگاری/JWE تا یک ساعت.
 */
const serverKeyCacheMap = new Map<
  string,
  { key: string; id: string; expiresAt: number }
>();

/** حذف کش کلید عمومی برای یک baseUrl خاص (وقتی کلید عوض شد / خطای کلید گرفتیم) */
export function invalidateServerKeyCache(baseUrl?: string): void {
  if (baseUrl) serverKeyCacheMap.delete(baseUrl);
  else serverKeyCacheMap.clear();
}

/** پاسخ استعلام نتیجه ارسال — وضعیت نهایی هر UID */
export interface InquiryResultEntry {
  uid: string | null;
  referenceNumber?: string | null;
  status?: string | null; // PENDING | IN_PROGRESS | SUCCESS | FAILED | TIMEOUT
  data?: {
    confirmationReferenceId?: string | null;
    success?: boolean | null;
    error?: Array<{ code?: string | number; message?: string; errorType?: string }>;
    warning?: Array<{ code?: string | number; message?: string }>;
  } | null;
  packetType?: string | null;
  fiscalId?: string | null;
}

/** پاسخ ارسال پکت (async enqueue) */
export interface SendInvoiceResponseEntry {
  uid?: string | null;
  referenceNumber?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
}

/**
 * دریافت nonce — چالش یک‌بارمصرف برای ساخت توکن امضا.
 * عمومی است (بدون احراز هویت) و TTL پیش‌فرض ۳۰ ثانیه دارد.
 */
export async function fetchModianNonce(
  baseUrl: string,
  timeToLive = 30
): Promise<ModianHttpResult<NonceResponse>> {
  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/nonce?timeToLive=${Math.min(Math.max(timeToLive, 10), 200)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      }
    );
  } catch {
    return {
      ok: false,
      status: 0,
      errorFa: "ارتباط با سامانه مودیان برقرار نشد — اتصال اینترنت/DNS/فیلترینگ را بررسی کنید",
    };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, errorFa: modianErrorToFa(res.status, body), body };
  }
  const nonceData = body as NonceResponse | null;
  if (!nonceData?.nonce) {
    return { ok: false, status: res.status, errorFa: "پاسخ nonce مودیان نامعتبر بود", body };
  }
  return { ok: true, data: nonceData, status: res.status };
}

/**
 * اطلاعات سرور + کلیدهای عمومی سازمان (برای رمزنگاری JWE).
 * نتیجه ۱ ساعت کش می‌شود.
 */
export async function fetchModianServerKey(
  baseUrl: string
): Promise<ModianHttpResult<{ key: string; id: string }>> {
  // FIX(v4-مودیان/H6): کش per baseUrl (TEST/LIVE هرکدام کش خودش را دارند)
  const cached = serverKeyCacheMap.get(baseUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, data: { key: cached.key, id: cached.id }, status: 200 };
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/server-information`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      errorFa: "دریافت اطلاعات سرور مودیان ناموفق بود (ارتباط شبکه)",
    };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, errorFa: modianErrorToFa(res.status, body), body };
  }
  const info = body as ServerInformation | null;
  const keyEntry = info?.publicKeys?.find((k) => k.key && k.id);
  if (!keyEntry) {
    return {
      ok: false,
      status: res.status,
      errorFa: "کلید عمومی سازمان در پاسخ server-information نبود",
      body,
    };
  }

  const newCache = {
    key: keyEntry.key.startsWith("-----") ? keyEntry.key : `-----BEGIN PUBLIC KEY-----\n${keyEntry.key}\n-----END PUBLIC KEY-----`,
    id: keyEntry.id,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  serverKeyCacheMap.set(baseUrl, newCache);
  return { ok: true, data: { key: newCache.key, id: newCache.id }, status: res.status };
}

/**
 * درخواست احراز هویت‌شده به مودیان نسخه ۲:
 * nonce تازه → JWS({nonce, clientId}) → Authorization: Bearer
 *
 * هر فراخوانی nonce جدید می‌گیرد (چالش یک‌بارمصرف است).
 */
async function moadianAuthFetch(
  connection: ModianConnection,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number }
): Promise<{ res: Response | null; networkError?: string }> {
  const nonceResult = await fetchModianNonce(connection.baseUrl);
  if (!nonceResult.ok) {
    return { res: null, networkError: nonceResult.errorFa };
  }

  const authJws = buildMoadianJws(
    JSON.stringify({ nonce: nonceResult.data.nonce, clientId: connection.memoryId }),
    connection.privateKeyPem,
    connection.certificatePem
  );

  try {
    const res = await fetch(`${connection.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${authJws}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(init.timeoutMs ?? 60_000),
    });
    return { res };
  } catch (err) {
    const msg = err instanceof Error && err.name === "TimeoutError" ? "مهلت درخواست به مودیان تمام شد (۶۰ ثانیه)" : "ارتباط با سامانه مودیان قطع شد";
    return { res: null, networkError: msg };
  }
}

/** اعمال محیط TEST: آدرس پایه به testUrl تعویض می‌شود — هیچ درخواستی به سازمان واقعی نمی‌رود */
export function applyEnvToConnection(
  connection: ModianConnection,
  envCfg: ModianEnvConfig
): ModianConnection {
  if (envCfg.env === "TEST") {
    return { ...connection, baseUrl: envCfg.testUrl?.trim() || DEFAULT_TEST_URL };
  }
  return connection;
}

// ---------- ۵) ارسال صورتحساب (پکت JWE) ----------

export interface ModianPacketInput {
  /** JWS امضاشدهٔ صورتحساب (خروجی buildMoadianJws روی JSON صورت‌حساب) */
  invoiceJws: string;
  /** شناسه یکتای سمت کلاینت (UUID) — اختیاری؛ خودکار تولید می‌شود */
  uid?: string;
}

/**
 * ارسال پکت‌های صورتحساب به مودیان (POST /invoice — آرایه‌ای از پکت‌ها).
 *
 * هر پکت: { header: { requestTraceId: <uuid>, fiscalId: <memoryId> }, payload: <JWE> }
 * JWE = رمزنگاری JWS صورتحساب با کلید عمومی سازمان (RSA-OAEP-256 + A256GCM).
 *
 * محدودیت رسمی: حداکثر ۱۰۰۰ پکت در هر درخواست (خطای ۴۱۴۳) —
 * این تابع حداکثر ۱۰۰ پکت می‌فرستد (محافظه‌کارانه برای پایداری).
 */
export async function sendInvoicePackets(
  connection: ModianConnection,
  packets: ModianPacketInput[]
): Promise<ModianHttpResult<SendInvoiceResponseEntry[]>> {
  if (packets.length === 0) {
    return { ok: false, status: 0, errorFa: "پکتی برای ارسال وجود ندارد" };
  }
  if (packets.length > 100) {
    return { ok: false, status: 0, errorFa: "حداکثر ۱۰۰ پکت در هر درخواست مجاز است (پکیج‌بندی را کوچک‌تر کنید)" };
  }

  // کلید عمومی سازمان برای JWE
  const keyResult = await fetchModianServerKey(connection.baseUrl);
  if (!keyResult.ok) {
    return { ok: false, status: keyResult.status, errorFa: keyResult.errorFa, body: keyResult.body };
  }

  const body = packets.map((p) => ({
    header: {
      requestTraceId: p.uid || crypto.randomUUID(),
      fiscalId: connection.memoryId,
    },
    payload: buildMoadianJwe(p.invoiceJws, keyResult.data.key, keyResult.data.id),
  }));

  const { res, networkError } = await moadianAuthFetch(connection, "/invoice", {
    method: "POST",
    body,
    timeoutMs: 90_000,
  });
  if (!res) {
    return { ok: false, status: 0, errorFa: networkError! };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, errorFa: modianErrorToFa(res.status, data), body: data };
  }

  const result = (data as { result?: SendInvoiceResponseEntry[] } | null)?.result ?? [];
  return { ok: true, data: result, status: res.status };
}

// ---------- ۶) استعلام نتیجه (دریافت) ----------

/** استعلام با شناسه‌های یکتای سمت کلاینت (uid) — حداکثر ۱۰۰ شناسه */
export async function inquiryByUid(
  connection: ModianConnection,
  uids: string[]
): Promise<ModianHttpResult<InquiryResultEntry[]>> {
  if (uids.length === 0) return { ok: true, data: [], status: 200 };
  if (uids.length > 100) {
    return { ok: false, status: 0, errorFa: "حداکثر ۱۰۰ شناسه در هر استعلام مجاز است (خطای ۴۱۴۱)" };
  }
  const params = new URLSearchParams();
  for (const uid of uids) params.append("uidList", uid);
  params.set("fiscalId", connection.memoryId);

  const { res, networkError } = await moadianAuthFetch(
    connection,
    `/inquiry-by-uid?${params.toString()}`,
    { method: "GET" }
  );
  if (!res) return { ok: false, status: 0, errorFa: networkError! };

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, errorFa: modianErrorToFa(res.status, data), body: data };
  }
  const result = (data as { result?: InquiryResultEntry[] } | null)?.result ?? [];
  return { ok: true, data: result, status: res.status };
}

/** استعلام با شماره رسید یکتا (referenceNumber) — حداکثر ۱۰۰ شناسه */
export async function inquiryByReferenceIds(
  connection: ModianConnection,
  referenceIds: string[]
): Promise<ModianHttpResult<InquiryResultEntry[]>> {
  if (referenceIds.length === 0) return { ok: true, data: [], status: 200 };
  if (referenceIds.length > 100) {
    return { ok: false, status: 0, errorFa: "حداکثر ۱۰۰ شناسه در هر استعلام مجاز است" };
  }
  const params = new URLSearchParams();
  for (const ref of referenceIds) params.append("referenceIds", ref);

  const { res, networkError } = await moadianAuthFetch(
    connection,
    `/inquiry-by-reference-id?${params.toString()}`,
    { method: "GET" }
  );
  if (!res) return { ok: false, status: 0, errorFa: networkError! };

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, errorFa: modianErrorToFa(res.status, data), body: data };
  }
  const result = (data as { result?: InquiryResultEntry[] } | null)?.result ?? [];
  return { ok: true, data: result, status: res.status };
}

export interface InquiryTimeParams {
  start: Date;
  end: Date;
  pageNumber?: number;
  pageSize?: number;
  status?: "SUCCESS" | "FAILED" | "PENDING" | "TIMEOUT";
}

/** تبدیل یک لحظه UTC به رشته ISO با آفست واقعی تهران (+03:30) — برای query params مودیان */
function toTehranOffsetIso(d: Date): string {
  // اجزای تاریخ به وقت تهران
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const pad = (s: string) => (s === "24" ? "00" : s.padStart(2, "0"));
  return `${get("year")}-${pad(get("month"))}-${pad(get("day"))}T${pad(get("hour"))}:${pad(get("minute"))}:${pad(get("second"))}+03:30`;
}

/** استعلام بر اساس بازه زمانی — بازه حداکثر یک هفته، pageSize ۱ تا ۱۰۰ */
export async function inquiryByTime(
  connection: ModianConnection,
  params: InquiryTimeParams
): Promise<ModianHttpResult<InquiryResultEntry[]>> {
  const q = new URLSearchParams();
  // FIX(v4-مودیان/M): قبلاً toISOString().replace("Z","+03:30") برچسب آفست را
  // بدون «تبدیل» عوض می‌کرد → بازه ۳.۵ ساعت جابه‌جا. حالا لحظه UTC به وقت
  // تهران تبدیل و با آفست صحیح +03:30 فرمت می‌شود.
  q.set("start", toTehranOffsetIso(params.start));
  q.set("end", toTehranOffsetIso(params.end));
  q.set("pageNumber", String(Math.max(1, params.pageNumber ?? 1)));
  q.set("pageSize", String(Math.min(Math.max(params.pageSize ?? 50, 1), 100)));
  if (params.status) q.set("status", params.status);

  const { res, networkError } = await moadianAuthFetch(
    connection,
    `/inquiry?${q.toString()}`,
    { method: "GET" }
  );
  if (!res) return { ok: false, status: 0, errorFa: networkError! };

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, errorFa: modianErrorToFa(res.status, data), body: data };
  }
  const result = (data as { result?: InquiryResultEntry[] } | null)?.result ?? [];
  return { ok: true, data: result, status: res.status };
}

// ---------- ۷) اطلاعات مودی / حافظه مالیاتی (دریافت اطلاعات) ----------

export interface ModianTaxpayerInfo {
  nameTrade?: string | null;
  taxpayerStatus?: string | null;
  taxpayerType?: string | null; // LEGAL | ...
  postalcodeTaxpayer?: string | null;
  addressTaxpayer?: string | null;
  nationalId?: string | null;
  economicCode?: string | null;
}

export interface ModianFiscalInfo {
  nameTrade?: string | null;
  fiscalStatus?: string | null;
  saleThreshold?: number | null;
  economicCode?: string | null;
  nationalId?: string | null;
}

/** استعلام اطلاعات مودی با کد اقتصادی/شناسه ملی — GET /taxpayer */
export async function fetchTaxpayerInfo(
  connection: ModianConnection,
  economicCode: string
): Promise<ModianHttpResult<ModianTaxpayerInfo>> {
  const code = toEnglishDigits(economicCode).replace(/\D/g, "");
  if (!code) {
    return { ok: false, status: 0, errorFa: "کد اقتصادی/شناسه ملی نامعتبر است" };
  }
  const { res, networkError } = await moadianAuthFetch(
    connection,
    `/taxpayer?economicCode=${encodeURIComponent(code)}`,
    { method: "GET" }
  );
  if (!res) return { ok: false, status: 0, errorFa: networkError! };

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, errorFa: modianErrorToFa(res.status, data), body: data };
  }
  return { ok: true, data: (data ?? {}) as ModianTaxpayerInfo, status: res.status };
}

/** استعلام اطلاعات حافظه مالیاتی خودِ مودی — GET /fiscal-information */
export async function fetchFiscalInformation(
  connection: ModianConnection
): Promise<ModianHttpResult<ModianFiscalInfo>> {
  const { res, networkError } = await moadianAuthFetch(
    connection,
    `/fiscal-information?memoryId=${encodeURIComponent(connection.memoryId)}`,
    { method: "GET" }
  );
  if (!res) return { ok: false, status: 0, errorFa: networkError! };

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, errorFa: modianErrorToFa(res.status, data), body: data };
  }
  return { ok: true, data: (data ?? {}) as ModianFiscalInfo, status: res.status };
}

/** تست اتصال کامل: nonce → ساخت توکن امضا → server-information */
export async function testModianConnection(
  connection: ModianConnection
): Promise<
  | {
      ok: true;
      serverTime: number | null;
      serverKeyIds: string[];
    }
  | { ok: false; errorFa: string; step: "NONCE" | "AUTH" | "SERVER_INFO" }
> {
  // مرحله ۱: nonce
  const nonceResult = await fetchModianNonce(connection.baseUrl);
  if (!nonceResult.ok) {
    return { ok: false, errorFa: nonceResult.errorFa, step: "NONCE" };
  }

  // مرحله ۲: ساخت توکن (امضای JWS) — اگر کلید/گواهی خراب باشد اینجا می‌فهمیم
  try {
    buildMoadianJws(
      JSON.stringify({ nonce: nonceResult.data.nonce, clientId: connection.memoryId }),
      connection.privateKeyPem,
      connection.certificatePem
    );
  } catch (err) {
    return {
      ok: false,
      errorFa: `ساخت توکن امضا ناموفق بود — کلید خصوصی/گواهی نامعتبر: ${err instanceof Error ? err.message : String(err)}`,
      step: "AUTH",
    };
  }

  // FIX(v4-مودیان/H2): مرحله ۳ قبلاً فقط server-information «عمومی» را بدون
  // توکن صدا می‌زد — گواهی ناسازگار (خطای 4103/4131) هرگز دیده نمی‌شد و تستِ
  // «موفق» جعلی بود. حالا یک درخواست «احراز هویت‌شده» واقعی می‌فرستیم:
  // POST /invoice با پکت خالی [] — اگر توکن/گواهی معتبر باشد سازمان با
  // خطای 400 (بدنه خالی — کد 4144/4145) پاسخ می‌دهد؛ اگر احراز هویت خراب
  // باشد 401 برمی‌گردد و پیام دقیق فارسی نمایش داده می‌شود.
  const authTest = await moadianAuthFetch(connection, "/invoice", {
    method: "POST",
    body: [],
    timeoutMs: 30_000,
  });
  if (authTest.res === null) {
    return { ok: false, errorFa: authTest.networkError || "ارتباط با مودیان برقرار نشد", step: "SERVER_INFO" };
  }
  const authStatus = authTest.res.status;
  if (authStatus === 401 || authStatus === 403) {
    const body = await authTest.res.json().catch(() => null);
    return {
      ok: false,
      errorFa: `احراز هویت مودیان ناموفق بود — ${modianErrorToFa(authStatus, body)}`,
      step: "SERVER_INFO",
    };
  }
  // 400 با پکت خالی = توکن پذیرفته شد و فقط بدنه خالی رد شد → احراز هویت سالم
  // (۴xx دیگر مثل 429 هم یعنی از سمت احراز هویت رد نشده‌ایم)

  // مرحله ۴: کلیدهای عمومی سازمان (برای نمایش keyId ها)
  const keyResult = await fetchModianServerKey(connection.baseUrl);
  if (!keyResult.ok) {
    // کلید عمومی لازمِ ارسال است ولی برای «تست اتصال» توقف‌کننده نیست — فقط ثبت شود
    return { ok: true, serverTime: Date.now(), serverKeyIds: [] };
  }

  return { ok: true, serverTime: Date.now(), serverKeyIds: [keyResult.data.id] };
}

// ---------- ۸) ساخت صورتحساب رسمی نسخه ۲ (header/body/payments) ----------

/** سال مالیاتی به شمسی — سالِ تاریخ داده‌شده (پیش‌فرض: امروز) */
export function getFiscalYear(date?: Date): string {
  const d = date ?? new Date();
  const [jy] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return String(jy);
}

/** شناسه ملی عمومی برای فروش خرده‌فروشی (نوع ۲) — طبق الگوی رسمی مودیان */
export const RETAIL_BUYER_TAX_ID = "111111111111";

/** رمزگشایی + نرمال‌سازی شناسه خریدار — nationalId در DB با AES-256-GCM رمز است */
function resolveBuyerTaxId(
  encryptedNationalId: string | null | undefined
): string | null {
  if (!encryptedNationalId) return null;
  const decrypted = decryptField(encryptedNationalId);
  if (!decrypted) return null;
  const normalized = toEnglishDigits(decrypted)
    .replace(/[\s\-(),،.]/g, "")
    .trim();
  if (!normalized) return null;
  return /^\d{10,14}$/.test(normalized) ? normalized : null;
}

/** شماره سریال عددی صورتحساب — فقط ارقام بخش سریال شمارهٔ داخلی */
function extractInvoiceSerial(invoiceNumber: string): number | null {
  const parts = invoiceNumber.split("-");
  const lastSegment = parts.length >= 2 ? parts[parts.length - 1] : invoiceNumber;
  const digits = lastSegment.replace(/\D/g, "");
  if (digits) {
    const n = parseInt(digits, 10);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  const allDigits = invoiceNumber.replace(/\D/g, "");
  if (allDigits) {
    const n = parseInt(allDigits, 10);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  return null;
}

/** کدهای واحد اندازه‌گیری (پیوست ۸) — نگاشت واحد فارسی به کد رسمی */
const UNIT_CODE_MAP: Record<string, string> = {
  "عدد": "100",
  "بسته": "101",
  "جعبه": "102",
  "کارتن": "103",
  "شاخه": "104",
  "ساعت": "105",
  "متر": "106",
  "مترمربع": "107",
  "مترمکعب": "108",
  "کیلوگرم": "115",
  "کیلو": "115",
  "گرم": "114",
  "تن": "113",
  "لیتر": "116",
  "دست": "117",
  "رول": "118",
  "حلقه": "119",
  "برگ": "120",
  "قوطی": "121",
  "کارتنو": "103",
};

/** ترجمه واحد فارسی به کد رسمی — پیش‌فرض ۱۰۰ (عدد) */
function unitToCode(unit: string | null | undefined): string {
  if (!unit) return "100";
  const norm = toEnglishDigits(unit).trim().replace(/\u200c/g, "");
  return UNIT_CODE_MAP[norm] ?? "100";
}

/** انواع صورتحساب رسمی: ۱=نوع اول (B2B) ۲=نوع دوم (خرده‌فروشی) */
export type MoadianInvoiceType = 1 | 2;

/** ردیف کالا/خدمات مطابق جدول رسمی بدنه صورتحساب */
export interface MoadianInvoiceBodyItem {
  sstid: string | null;
  sstt: string;
  mu: string;
  am: number;
  fee: number;
  cfee: number | null;
  cut: string | null;
  exr: number | null;
  prdis: number;
  dis: number;
  adis: number;
  vra: number;
  vam: number;
  odt: string | null;
  odr: number | null;
  odam: number;
  olt: string | null;
  olr: number | null;
  olam: number;
  consfee: number;
  spro: number;
  bros: number;
  tcpbs: number;
  cop: number;
  vop: number;
  tsstam: number;
}

/** صورتحساب رسمی نسخه ۲ مودیان */
export interface MoadianOfficialInvoice {
  header: {
    taxid: string;
    indatim: number;
    indati2m: number;
    inty: MoadianInvoiceType;
    inno: string;
    irtaxid: string | null;
    inp: number;
    ins: number;
    tins: string;
    tob: number;
    bid: string | null;
    tinb: string | null;
    sbc: number | null;
    bbc: number | null;
    bpc: number | null;
    ft: number | null;
    bpn: string | null;
    scln: number | null;
    scc: number | null;
    crn: number | null;
    billid: number | null;
    tprdis: number;
    tdis: number;
    tadis: number;
    tvam: number;
    todam: number;
    tbill: number;
    setm: number;
    cap: number;
    insp: number;
    tvop: number;
    dpvb: number | null;
    tax17: number;
  };
  body: MoadianInvoiceBodyItem[];
  payments: Array<{
    iinn: string | null;
    acn: string | null;
    trmn: string | null;
    trn: string | null;
    pcn: string | null;
    pid: string | null;
    pdt: number | null;
    pmt: number | null;
    pv: number;
  }>;
}

export interface BuildOfficialInvoiceInput {
  invoice: {
    number: string;
    date: Date;
    createdAt?: Date | null;
    subtotal?: bigint | null;
    total: bigint;
    tax: bigint;
    discount: bigint | null;
    paidAmount?: bigint | null;
    party?: {
      name?: string | null;
      nationalId?: string | null; // رمزنگاری‌شده
      economicCode?: string | null;
    } | null;
    items?: Array<{
      description: string;
      quantity: number;
      unit?: string | null;
      unitPrice: bigint;
      discount: number; // درصد
      taxRate: number; // درصد
      taxAmount: bigint;
      total: bigint;
      goodsCode?: string | null; // sstid — شناسه کالا/خدمت از نظام کدینگ
      // FIX(v4-مودیان/H4): محصول مرتبط برای خواندن goodsCode (sstid) — الزامی
      // برای صورتحساب نوع ۱ (B2B) در محیط واقعی
      product?: {
        goodsCode?: string | null;
        unit?: string | null;
        taxRate?: number | null;
      } | null;
    }>;
  };
  opts: {
    /** شناسه یکتای حافظه مالیاتی فروشنده (۶ کاراکتر) */
    memoryId: string;
    /** کد اقتصادی/شناسه ملی فروشنده — فیلد tins */
    sellerTaxId: string;
    /** شناسه کالا/خدمت پیش‌فرض اگر روی قلم نبود (اختیاری) */
    defaultSstid?: string | null;
    /** نرخ پیش‌فرض VAT اگر روی قلم نبود (پیش‌فرض ۱۰) */
    defaultVatRate?: number;
  };
}

/**
 * ساخت صورتحساب رسمی نسخه ۲ مودیان (header/body/payments).
 *
 * مطابق دستورالعمل فنی — فرمول‌های رسمی:
 *   prdis = fee × am
 *   adis  = prdis − dis
 *   vam   = adis × vra / 100
 *   tsstam = adis + vam + odam + olam
 *   tbill = tadis + tvam + todam
 *   taxid = fiscalId(۶) + hex(days→۵) + hex(serial→۱۰) + verhoeff(۱)
 *
 * این JSON بعداً با buildMoadianJws امضا و با buildMoadianJwe رمز می‌شود.
 */
export function buildOfficialInvoice(
  input: BuildOfficialInvoiceInput
): MoadianOfficialInvoice {
  const { invoice, opts } = input;

  // رمزگشایی شناسه خریدار — ciphertext هرگز به مودیان نمی‌رود
  const buyerTaxId = resolveBuyerTaxId(invoice.party?.nationalId);
  const buyerEconomicCode = invoice.party?.economicCode
    ? toEnglishDigits(invoice.party.economicCode).replace(/\D/g, "") || null
    : null;

  // نوع صورتحساب: خریدار شناسه دارد → ۱ (B2B)؛ وگرنه ۲ (خرده‌فروشی)
  const invoiceType: MoadianInvoiceType = buyerTaxId ? 1 : 2;

  // نوع شخص خریدار (tob): ۱=حقیقی، ۲=حقوقی، ۵=مصرف‌کننده نهایی
  // کد ملی ۱۰ رقمی = حقیقی؛ شناسه ملی اشخاص حقوقی ۱۱ رقمی = حقوقی
  const buyerType = invoiceType === 2 ? 5 : buyerTaxId?.length === 11 ? 2 : 1;

  // سریال عددی صورتحساب
  const serial = extractInvoiceSerial(invoice.number);
  if (!serial) {
    throw new Error(
      `شماره فاکتور «${invoice.number}» سریال عددی معتبر ندارد — برای ارسال به مودیان لازم است`
    );
  }

  // taxid رسمی (Verhoeff)
  const taxid = generateMoadianTaxid(opts.memoryId, invoice.date, serial);
  const inno = serialToInno(serial);

  const indatim = invoice.date.getTime();
  const indati2m = invoice.createdAt?.getTime() ?? invoice.date.getTime();

  // ---------- اقلام (body) ----------
  const items: MoadianInvoiceBodyItem[] = (invoice.items ?? []).map((it) => {
    const fee = Number(it.unitPrice); // قیمت واحد بدون مالیات
    const am = Number(it.quantity) || 0;
    const prdis = Math.round(fee * am);
    const dis = Math.round((prdis * (Number(it.discount) || 0)) / 100);
    const adis = prdis - dis;
    // FIX(v4-مودیان/C2): نرخ مالیات در DB «کسری» ذخیره می‌شود (0.1 = ۱۰٪) اما
    // فیلد رسمی vra «درصد» می‌خواهد. قبلاً vra=0.1 → مالیات ۰.۱٪ به‌جای ۱۰٪
    // سند مالیاتی ~۱۰۰ برابر کمتر از واقعیت صادر می‌شد.
    // نرمال‌سازی مقاوم: 0.1→10 (کسری)، 10→10 (درصد)، 0→معاف
    const rawRate = Number(it.taxRate ?? opts.defaultVatRate ?? 10) || 0;
    const vra = rawRate > 0 && rawRate < 1 ? Math.round(rawRate * 100) : Math.round(rawRate);
    // دقیق‌ترین حالت: اگر مالیات واقعی ردیف محاسبه‌شده داریم، همان را می‌فرستیم
    // (سازگاری با lineTax = lineTotal × taxRate که در route فاکتور استفاده می‌شود)
    const computedVam = Math.round((adis * vra) / 100);
    const vam =
      it.taxAmount !== undefined && it.taxAmount !== null && Number(it.taxAmount) >= 0
        ? Math.round(Number(it.taxAmount))
        : computedVam;
    const odam = 0;
    const olam = 0;

    return {
      // FIX(v4-مودیان/H4): sstid اول از ردیف، بعد از محصول مرتبط (product.goodsCode)
      sstid:
        it.goodsCode?.trim() ||
        it.product?.goodsCode?.trim() ||
        opts.defaultSstid?.trim() ||
        null,
      sstt: it.description,
      mu: unitToCode(it.unit),
      am,
      fee,
      cfee: null,
      cut: null,
      exr: 1,
      prdis,
      dis,
      adis,
      vra,
      vam,
      odt: null,
      odr: null,
      odam,
      olt: null,
      olr: null,
      olam,
      consfee: 0,
      spro: 0,
      bros: 0,
      tcpbs: 0,
      cop: 0,
      vop: 0,
      tsstam: adis + vam + odam + olam,
    };
  });

  // ---------- جمع‌های سربرگ ----------
  let tprdis = 0;
  let tdis = 0;
  let tadis = 0;
  let tvam = 0;
  for (const it of items) {
    tprdis += it.prdis;
    tdis += it.dis;
    tadis += it.adis;
    tvam += it.vam;
  }
  const todam = 0;
  const tbill = tadis + tvam + todam;

  // اگر فاکتور قلم ندارد، از مبالغ کلی مشتق کن (فرمول رسمی حفظ شود)
  if (items.length === 0) {
    const taxNum = Number(invoice.tax);
    const discountNum = Number(invoice.discount ?? 0n);
    const totalNum = Number(invoice.total);
    const preTax = totalNum - taxNum; // total این برنامه tax-inclusive است
    tadis = preTax - discountNum;
    tprdis = preTax;
    tdis = discountNum;
    tvam = taxNum;
  }
  const finalTbill = tadis + tvam + todam;

  // ---------- روش تسویه (setm: ۱=نقد ۲=نسیه ۳=نقد/نسیه) ----------
  const paidNum = Number(invoice.paidAmount ?? 0n);
  const totalNum = Number(invoice.total);
  const cap = Math.max(0, Math.min(paidNum, totalNum)); // مبلغ نقدی
  const insp = Math.max(0, finalTbill - cap); // مبلغ نسیه
  const setm = cap <= 0 ? 2 : insp <= 0 ? 1 : 3;

  // ---------- پرداخت‌ها ----------
  const payments =
    cap > 0
      ? [
          {
            iinn: null, // شماره سوییچ
            acn: null, // شماره پذیرنده
            trmn: null, // شماره پایانه
            trn: null, // شماره پیگیری
            pcn: null, // شماره کارت پرداخت‌کننده
            pid: buyerTaxId,
            pdt: indatim,
            pmt: null,
            pv: cap, // مبلغ پرداختی نقدی
          },
        ]
      : [];

  return {
    header: {
      taxid,
      indatim,
      indati2m,
      inty: invoiceType,
      inno,
      irtaxid: null, // صورتحساب مرجع (اصلاحی/ابطالی) — فعلاً پشتیبانی نمی‌شود
      inp: 1, // الگوی فروش
      ins: 1, // موضوع: اصلی
      tins: toEnglishDigits(opts.sellerTaxId).replace(/\D/g, ""),
      tob: buyerType,
      // FIX(v4-مودیان/H1): صورتحساب نوع ۲ (خرده‌فروشی/بدون شناسه خریدار) طبق
      // دستورالعمل رسمی باید bid/tinb = 111111111111 (خریدار ناشناس) داشته باشد
      // — قبلاً null می‌رفت و سازمان صورتحساب را رد می‌کرد.
      bid: invoiceType === 1 ? buyerTaxId : "111111111111",
      tinb: invoiceType === 1 ? buyerEconomicCode : "111111111111",
      sbc: null,
      bbc: null,
      bpc: null,
      ft: null,
      bpn: null,
      scln: null,
      scc: null,
      crn: null,
      billid: null,
      tprdis,
      tdis,
      tadis,
      tvam,
      todam,
      tbill: finalTbill,
      setm,
      cap,
      insp,
      tvop: 0,
      dpvb: null,
      tax17: 0,
    },
    body: items,
    payments,
  };
}
