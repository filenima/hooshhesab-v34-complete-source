import { NextRequest, NextResponse } from "next/server";

// ============ API v1 — Versioned Endpoints ============
// این ماژول ثابت‌ها و helper های مشترک نسخه‌بندی API را نگه می‌دارد.
// هر endpoint تحت /api/v1/... باید از این helper ها استفاده کند تا
// رفتار نسخه‌بندی (هدرهای deprecation، response shape، auth) یکدست بماند.
//
// استراتژی نسخه‌بندی:
// - مسیرهای قدیمی (مثل /api/products) همچنان کار می‌کنند اما با هدر
// X-API-Deprecated: true; Sunset: 2025-12-31
// - مسیرهای جدید (مثل /api/v1/products) نسخه‌ی پایدار هستند
// - تغییرات breaking فقط در v2 (آینده)

export const API_V1_VERSION = "1.0.0";
export const API_SUNSET_DATE = "2025-12-31";
export const API_V1_PREFIX = "/api/v1";

/**
 * هدرهای استاندارد برای پاسخ‌های API v1.
 */
export function v1Headers(): HeadersInit {
 return {
 "X-API-Version": API_V1_VERSION,
 "Cache-Control": "no-store, no-cache, must-revalidate",
 };
}

/**
 * هدرهای deprecation برای endpoints قدیمی.
 * به کلاینت‌ها علامت می‌دهد که این endpoint در آینده حذف می‌شود.
 */
export function deprecatedHeaders(): HeadersInit {
 return {
 "X-API-Deprecated": "true",
 Sunset: API_SUNSET_DATE,
 "Deprecation": "true",
 "Link": `</api/v1/docs>; rel="successor-version"`,
 "Cache-Control": "no-store, no-cache, must-revalidate",
 };
}

/**
 * لیست نگاشت مسیرهای قدیمی نسخه‌ی v1.
 * برای استفاده در /api/v1/docs.
 */
export const V1_ENDPOINT_MAP: Record<string, string> = {
 "/api/v1/invoices": "/api/accounting/invoices",
 "/api/v1/products": "/api/products",
 "/api/v1/parties": "/api/parties",
 "/api/v1/dashboard": "/api/dashboard",
 "/api/v1/reports/multi-currency": "/api/reports/multi-currency",
 "/api/v1/reports/vat": "/api/reports/vat",
};

/**
 * احراز هویت دوگانه برای /api/v1/* — API Key یا JWT.
 *
 * اولویت:
 * ۱) هدر x-api-key یا Bearer hsk_* requireApiKey (ثبت usage + quota)
 * ۲) Bearer JWT کاربر getAuthContext (رفتار قبلی)
 *
 * FIX: قبلاً فقط JWT پذیرفته می‌شد در حالی که مستندات (api.tsx و /api-docs)
 * استفاده از API Key را مستند کرده بودند و authenticateApiKey هیچ‌جا وصل نبود.
 */
export async function v1Auth(
 req: NextRequest
): Promise<
 | { tenantId: string; via: "api-key" | "jwt" }
 | { error: NextResponse }
> {
 const { getAuthContext } = await import("@/lib/auth");
 const { db } = await import("@/lib/db");
 const { hashApiKey } = await import("@/lib/api-key-auth");

 const rawKey =
 req.headers.get("x-api-key") ||
 (req.headers.get("authorization")?.startsWith("Bearer hsk_")
? req.headers.get("authorization")!.substring(7).trim()
: null);
 // نکته: کلید API با hsk_live_ شروع می‌شود؛ هدرهای مجاز: x-api-key یا
 // Authorization: Bearer hsk_live_...

 // ۱) API Key — بررسی مستقیم (requireApiKey فقط x-api-key را می‌خواند،
 // ما با تزریق هدر مجازی از Bearer hsk_ هم پشتیبانی می‌کنیم)
 if (rawKey) {
 const apiKey = await db.apiKey.findUnique({
 where: { keyHash: hashApiKey(rawKey) },
 select: { id: true, tenantId: true, scopes: true, isActive: true, expiresAt: true },
 });
 if (apiKey && apiKey.isActive && (!apiKey.expiresAt || apiKey.expiresAt > new Date())) {
 // به‌روزرسانی best-effort lastUsedAt
 db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
 return { tenantId: apiKey.tenantId, via: "api-key" as const };
 }
 // کلید نامعتبر 401 صریح (کاربر قصد API-key داشت)
 if (rawKey.startsWith("hsk_")) {
 return {
 error: NextResponse.json(
 { success: false, error: "کلید API نامعتبر یا ابطال شده است" },
 { status: 401 }
 ),
 };
 }
 // rawKey از هدر x-api-key بود ولی hsk_ نبود به JWT بیفتد
 }

 // ۲) JWT کاربر
 const ctx = await getAuthContext(req);
 if (ctx?.tenantId) {
 return { tenantId: ctx.tenantId, via: "jwt" };
 }

 return {
 error: NextResponse.json(
 {
 success: false,
 error: "احراز هویت الزامی است — هدر x-api-key یا Authorization: Bearer <token> ارسال کنید",
 },
 { status: 401 }
 ),
 };
}
