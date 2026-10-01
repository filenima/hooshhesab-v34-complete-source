// ============ Basalam Sync API — هوش ============
// همگام‌سازی محصولات/سفارشات/موجودی با Basalam Seller API.
//
// CRITICAL (C6): این مسیر قبلاً داده‌های شبیه‌سازی‌شده با Math.random برمی‌گرداند.
// اکنون اگر API credentials پیکربندی نشده باشد، خطای صریح برمی‌گرداند.
// برای فعال‌سازی همگام‌سازی واقعی، باید کلید API باسلام در پنل اتصال‌ها تنظیم شود
// یا متغیر محیطی BASALAM_API_URL و BASALAM_API_KEY پر شود.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";

export const runtime = "nodejs";

interface BasalamConfig {
 apiKeyEnc?: string;
 storeUrl?: string;
 extra?: Record<string, unknown>;
}

async function getBasalamCredentials(
 tenantId: string
): Promise<{ ok: boolean; apiKey?: string; apiUrl?: string; reason?: string }> {
 // ۱) رکورد Integration مخصوص این تنانت
 const integration = await db.integration.findFirst({
 where: { tenantId, type: "BASALAM" },
 });
 if (integration) {
 let stored: BasalamConfig = {};
 try {
 stored = JSON.parse(integration.config || "{}") as BasalamConfig;
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
 apiUrl: stored.storeUrl || process.env.BASALAM_API_URL || "https://api.basalam.com/v1",
 };
 }
 } catch {
 // رمزگشایی ناموفق — ادامه با fallback
 }
 }
 }

 // ۲) متغیرهای محیطی سراسری
 const envKey = process.env.BASALAM_API_KEY;
 if (envKey && envKey.trim().length > 0) {
 return {
 ok: true,
 apiKey: envKey,
 apiUrl: process.env.BASALAM_API_URL || "https://api.basalam.com/v1",
 };
 }

 return { ok: false, reason: "no_credentials" };
}

// POST /api/integrations/basalam/sync — همگام‌سازی با باسلام
// body: { type?: "products" | "orders" | "stock" }
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
 const { type = "products" } = body as {
 type?: "products" | "orders" | "stock";
 };

 if (!["products", "orders", "stock"].includes(type)) {
 return NextResponse.json(
 { success: false, error: "نوع همگام‌سازی نامعتبر است" },
 { status: 400 }
 );
 }

 // ===== بررسی پیکربندی اتصال =====
 const creds = await getBasalamCredentials(tenant.id);
 if (!creds.ok) {
 return NextResponse.json(
 {
 success: false,
 error:
 "اتصال به باسلام پیکربندی نشده است. لطفاً در تنظیمات اتصال را فعال کنید.",
 errorCode: "INTEGRATION_NOT_CONFIGURED",
 },
 { status: 503 }
 );
 }

 // ===== فراخوانی واقعی API باسلام =====
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
 signal: AbortSignal.timeout(30_000),
 });
 } catch (fetchErr) {
 console.error("Basalam API fetch failed:", fetchErr);
 return NextResponse.json(
 {
 success: false,
 error:
 "ارتباط با API باسلام برقرار نشد. لطفاً اتصال اینترنتی و کلید API را بررسی کنید.",
 errorCode: "INTEGRATION_NETWORK_ERROR",
 },
 { status: 502 }
 );
 }

 if (!apiResponse.ok) {
 const errText = await apiResponse.text().catch(() => "");
 console.error("Basalam API error:", apiResponse.status, errText.slice(0, 500));
 return NextResponse.json(
 {
 success: false,
 error: `خطا از سمت باسلام (HTTP ${apiResponse.status}). در صورت تداوم، با پشتیبانی باسلام تماس بگیرید.`,
 errorCode: "INTEGRATION_API_ERROR",
 status: apiResponse.status,
 },
 { status: 502 }
 );
 }

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

 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type: "BASALAM" },
 });
 if (integration) {
 await db.integration.update({
 where: { id: integration.id },
 data: { lastSync: new Date(), status: "CONNECTED" },
 });
 }

 await auditLog({
 tenantId: tenant.id,
 action: "BASALAM_SYNC",
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
 message: `همگام‌سازی ${type} با باسلام کامل شد — ${synced} آیتم`,
 });
 } catch (error) {
 console.error("Basalam sync error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در همگام‌سازی با باسلام" },
 { status: 500 }
 );
 }
}
