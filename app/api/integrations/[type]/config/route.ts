// ============ Integration Config API — هوش ============
// ذخیره و بارگذاری پیکربندی یکپارچگی (apiKey, storeUrl,...)
// - apiKey با AES-256-GCM رمزنگاری می‌شود و در فیلد config رکورد Integration ذخیره می‌گردد.
// - در پاسخ GET، apiKey هرگز به‌صورت متن بازگردانده نمی‌شود (امنیت).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE_MAP: Record<string, string> = {
 woocommerce: "WOOCOMMERCE",
 digikala: "DIGIKALA",
 basalam: "BASALAM",
 modian: "MODIAN",
 payment: "PAYMENT",
 bank: "BANK",
 api: "API",
};

function normalizeType(type: string): string | null {
 const lower = (type || "").toLowerCase();
 return TYPE_MAP[lower]?? null;
}

interface StoredConfig {
 apiKeyEnc?: string;
 storeUrl?: string;
 extra?: Record<string, unknown>;
}

// ============ GET /api/integrations/[type]/config ============
// پیکربندی فعلی را برمی‌گرداند. apiKey هرگز بازگردانده نمی‌شود.
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ type: string }> }
) {
 try {
 const { type: rawType } = await params;
 const type = normalizeType(rawType);
 if (!type) {
 return NextResponse.json(
 { success: false, error: "نوع یکپارچگی نامعتبر است" },
 { status: 400 }
 );
 }

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type },
 });

 if (!integration) {
 return NextResponse.json({
 success: true,
 config: {
 storeUrl: "",
 hasApiKey: false,
 },
 });
 }

 let stored: StoredConfig = {};
 try {
 stored = JSON.parse(integration.config || "{}") as StoredConfig;
 } catch {
 stored = {};
 }

 return NextResponse.json({
 success: true,
 config: {
 storeUrl: stored.storeUrl?? "",
 hasApiKey: Boolean(stored.apiKeyEnc),
 },
 });
 } catch (error) {
 console.error("Integration config GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پیکربندی یکپارچگی" },
 { status: 500 }
 );
 }
}

// ============ POST /api/integrations/[type]/config ============
// ذخیره‌ی پیکربندی (apiKey با رمزنگاری)
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ type: string }> }
) {
 try {
 const { type: rawType } = await params;
 const type = normalizeType(rawType);
 if (!type) {
 return NextResponse.json(
 { success: false, error: "نوع یکپارچگی نامعتبر است" },
 { status: 400 }
 );
 }

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const body = (await req.json().catch(() => ({}))) as {
 apiKey?: string;
 storeUrl?: string;
 };

 const storeUrl = (body.storeUrl?? "").trim();
 const apiKey = (body.apiKey?? "").trim();

 // اعتبارسنجی URL در صورت وجود
 if (storeUrl) {
 try {
 new URL(storeUrl);
 } catch {
 return NextResponse.json(
 { success: false, error: "آدرس فروشگاه نامعتبر است" },
 { status: 400 }
 );
 }
 }

 if (!apiKey) {
 return NextResponse.json(
 { success: false, error: "کلید API الزامی است" },
 { status: 400 }
 );
 }

 // یافتن integration موجود
 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type },
 });

 // ساخت پیکربندی رمزنگاری‌شده
 const newConfig: StoredConfig = {
 apiKeyEnc: encrypt(apiKey),
 storeUrl,
 };

 if (integration) {
 // ادغام با config قبلی (حفظ فیلدهای اضافی)
 let prev: StoredConfig = {};
 try {
 prev = JSON.parse(integration.config || "{}") as StoredConfig;
 } catch {
 prev = {};
 }
 const merged: StoredConfig = {
...prev,
 apiKeyEnc: newConfig.apiKeyEnc,
 storeUrl: newConfig.storeUrl,
 };

 await db.integration.update({
 where: { id: integration.id },
 data: {
 config: JSON.stringify(merged),
 status: "CONNECTED",
 },
 });

 await auditLog({
 tenantId: tenant.id,
 action: "INTEGRATION_CONFIG_UPDATE",
 entity: "Integration",
 entityId: integration.id,
 changes: { type, hasStoreUrl: Boolean(storeUrl), apiKeyUpdated: true },
 req,
 });

 // تست رمزگشایی برای اطمینان
 try {
 decrypt(merged.apiKeyEnc as string);
 } catch (e) {
 console.error("ApiKey decrypt verification failed:", e);
 }

 return NextResponse.json({
 success: true,
 message: "پیکربندی با موفقیت ذخیره شد",
 config: {
 storeUrl: merged.storeUrl?? "",
 hasApiKey: true,
 },
 });
 }

 // ساخت رکورد جدید اگر وجود نداشت
 const created = await db.integration.create({
 data: {
 tenantId: tenant.id,
 type,
 name: rawType.toLowerCase(),
 status: "CONNECTED",
 config: JSON.stringify(newConfig),
 },
 });

 await auditLog({
 tenantId: tenant.id,
 action: "INTEGRATION_CONFIG_CREATE",
 entity: "Integration",
 entityId: created.id,
 changes: { type, hasStoreUrl: Boolean(storeUrl), apiKeyUpdated: true },
 req,
 });

 return NextResponse.json({
 success: true,
 message: "پیکربندی با موفقیت ذخیره شد",
 config: {
 storeUrl: newConfig.storeUrl?? "",
 hasApiKey: true,
 },
 });
 } catch (error) {
 console.error("Integration config POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره‌ی پیکربندی یکپارچگی" },
 { status: 500 }
 );
 }
}
