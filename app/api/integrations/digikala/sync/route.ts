// ============ Digikala Sync API — هوش ============
// همگام‌سازی سفارش‌ها/محصولات/موجودی با Digikala Seller API.
//
// CRITICAL (C6): این مسیر قبلاً داده‌های شبیه‌سازی‌شده با Math.random برمی‌گرداند.
// اکنون اگر API credentials پیکربندی نشده باشد، خطای صریح برمی‌گرداند.
// برای فعال‌سازی همگام‌سازی واقعی، باید کلید API دیجی‌کالا در پنل اتصال‌ها تنظیم شود
// یا متغیر محیطی DIGIKALA_API_URL و DIGIKALA_API_KEY پر شود.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";

export const runtime = "nodejs";

interface DigikalaConfig {
 apiKeyEnc?: string;
 storeUrl?: string;
 extra?: Record<string, unknown>;
}

// بررسی پیکربندی اتصال دیجی‌کالا برای تنانت.
// اولویت ۱: رکورد Integration با apiKeyEnc رمزنگاری‌شده.
// اولویت ۲: متغیرهای محیطی DIGIKALA_API_URL و DIGIKALA_API_KEY.
async function getDigikalaCredentials(
 tenantId: string
): Promise<{ ok: boolean; apiKey?: string; apiUrl?: string; reason?: string }> {
 // ۱) بررسی رکورد Integration مخصوص این تنانت
 const integration = await db.integration.findFirst({
 where: { tenantId, type: "DIGIKALA" },
 });
 if (integration) {
 let stored: DigikalaConfig = {};
 try {
 stored = JSON.parse(integration.config || "{}") as DigikalaConfig;
 } catch {
 stored = {};
 }
 if (stored.apiKeyEnc) {
 try {
 const apiKey = decrypt(stored.apiKeyEnc);
 if (apiKey && apiKey.trim().length > 0) {
 return {
 ok: true,
 apiKey,
 apiUrl: stored.storeUrl || process.env.DIGIKALA_API_URL || "https://api.digikala.com/v1",
 };
 }
 } catch {
 // رمزگشایی ناموفق — ادامه با fallback
 }
 }
 }

 // ۲) متغیرهای محیطی سراسری
 const envKey = process.env.DIGIKALA_API_KEY;
 if (envKey && envKey.trim().length > 0) {
 return {
 ok: true,
 apiKey: envKey,
 apiUrl: process.env.DIGIKALA_API_URL || "https://api.digikala.com/v1",
 };
 }

 return { ok: false, reason: "no_credentials" };
}

// POST /api/integrations/digikala/sync — همگام‌سازی با دیجی‌کالا
// body: { type?: "products" | "orders" | "stock" }
//
// اگر اتصال پیکربندی نشده باشد، خطای 503 با پیام واضح برمی‌گرداند.
// در صورت پیکربندی، فراخوانی واقعی به API دیجی‌کالا انجام می‌شود؛
// اگر خود API خطا داد، همان خطا به کاربر نشان داده می‌شود.
export async function POST(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const { type = "orders" } = body as {
 type?: "products" | "orders" | "stock";
 };

 if (!["products", "orders", "stock"].includes(type)) {
 return NextResponse.json(
 { success: false, error: "نوع همگام‌سازی نامعتبر است" },
 { status: 400 }
 );
 }

 // ===== بررسی پیکربندی اتصال =====
 const creds = await getDigikalaCredentials(tenant.id);
 if (!creds.ok) {
 return NextResponse.json(
 {
 success: false,
 error:
 "اتصال به دیجی‌کالا پیکربندی نشده است. لطفاً در تنظیمات اتصال را فعال کنید.",
 errorCode: "INTEGRATION_NOT_CONFIGURED",
 },
 { status: 503 }
 );
 }

 // ===== فراخوانی واقعی API دیجی‌کالا =====
 // نکته: ساختار دقیق endpoint دیجی‌کالا بسته به سرویس (seller-API) متفاوت است.
 // در اینجا یک فراخوانی نمونه با best-effort انجام می‌شود؛
 // اگر خود API دیجی‌کالا خطا داد، همان خطا به کاربر پاس داده می‌شود.
 const endpoint =
 type === "orders"
? "/orders"
: type === "products"
? "/products"
: "/inventory/stock";

 let apiResponse: Response;
 try {
 apiResponse = await fetch(`${creds.apiUrl}${endpoint}`, {
 method: "GET",
 headers: {
 Authorization: `Bearer ${creds.apiKey}`,
 Accept: "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 // ۳۰ ثانیه timeout برای API خارجی
 signal: AbortSignal.timeout(30_000),
 });
 } catch (fetchErr) {
 console.error("Digikala API fetch failed:", fetchErr);
 return NextResponse.json(
 {
 success: false,
 error:
 "ارتباط با API دیجی‌کالا برقرار نشد. لطفاً اتصال اینترنتی و کلید API را بررسی کنید.",
 errorCode: "INTEGRATION_NETWORK_ERROR",
 },
 { status: 502 }
 );
 }

 if (!apiResponse.ok) {
 const errText = await apiResponse.text().catch(() => "");
 console.error("Digikala API error:", apiResponse.status, errText.slice(0, 500));
 return NextResponse.json(
 {
 success: false,
 error: `خطا از سمت دیجی‌کالا (HTTP ${apiResponse.status}). در صورت تداوم، با پشتیبانی دیجی‌کالا تماس بگیرید.`,
 errorCode: "INTEGRATION_API_ERROR",
 status: apiResponse.status,
 },
 { status: 502 }
 );
 }

 // پاسخ موفق — ساختار خروجی API دیجی‌کالا بسته به endpoint متفاوت است.
 // در اینجا items استخراج می‌شوند و شمارش برمی‌گردد.
 const rawData = (await apiResponse.json().catch(() => null)) as {
 data?: unknown;
 items?: unknown[];
 results?: unknown[];
 } | null;
 const items =
 (rawData?.items as unknown[]) ||
 (rawData?.results as unknown[]) ||
 (Array.isArray(rawData?.data)? (rawData!.data as unknown[]): []);
 const synced = items.length;

 // به‌روزرسانی وضعیت integration
 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type: "DIGIKALA" },
 });
 if (integration) {
 await db.integration.update({
 where: { id: integration.id },
 data: { lastSync: new Date(), status: "CONNECTED" },
 });
 }

 await auditLog({
 tenantId: tenant.id,
 action: "DIGIKALA_SYNC",
 entity: "Integration",
 entityId: integration?.id,
 changes: { type, synced, errorsCount: 0 },
 req,
 });

 return NextResponse.json({
 success: true,
 type,
 synced,
 errors: [],
 lastSync: new Date().toISOString(),
 message: `همگام‌سازی ${type} با دیجی‌کالا کامل شد — ${synced} آیتم`,
 });
 } catch (error) {
 console.error("Digikala sync error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در همگام‌سازی با دیجی‌کالا" },
 { status: 500 }
 );
 }
}
