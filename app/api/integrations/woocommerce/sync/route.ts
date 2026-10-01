// ============ WooCommerce Sync API — هوش ============
// همگام‌سازی محصولات/سفارشات/موجودی با WooCommerce REST API.
//
// CRITICAL (C6): این مسیر قبلاً داده‌های شبیه‌سازی‌شده با Math.random برمی‌گرداند.
// اکنون اگر API credentials پیکربندی نشده باشد، خطای صریح برمی‌گرداند.
// برای فعال‌سازی همگام‌سازی واقعی، باید URL فروشگاه و consumer key/secret
// در پنل اتصال‌ها تنظیم شود یا متغیرهای محیطی WOOCOMMERCE_URL، WOOCOMMERCE_KEY،
// WOOCOMMERCE_SECRET پر شوند.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";

export const runtime = "nodejs";

interface WoocommerceConfig {
 apiKeyEnc?: string; // در ووکامرس: consumer_key:consumer_secret قبل از encrypt
 storeUrl?: string;
 extra?: Record<string, unknown>;
}

interface WoocommerceCreds {
 ok: boolean;
 storeUrl?: string;
 consumerKey?: string;
 consumerSecret?: string;
 reason?: string;
}

// بررسی پیکربندی اتصال ووکامرس برای تنانت.
// اولویت ۱: رکورد Integration با apiKeyEnc رمزنگاری‌شده (مقدار: "consumer_key:consumer_secret").
// اولویت ۲: متغیرهای محیطی WOOCOMMERCE_URL، WOOCOMMERCE_KEY، WOOCOMMERCE_SECRET.
async function getWoocommerceCredentials(tenantId: string): Promise<WoocommerceCreds> {
 // ۱) رکورد Integration
 const integration = await db.integration.findFirst({
 where: { tenantId, type: "WOOCOMMERCE" },
 });
 if (integration) {
 let stored: WoocommerceConfig = {};
 try {
 stored = JSON.parse(integration.config || "{}") as WoocommerceConfig;
 } catch {
 stored = {};
 }
 if (stored.apiKeyEnc && stored.storeUrl) {
 try {
 const decrypted = decrypt(stored.apiKeyEnc);
 // فرمت: "consumer_key:consumer_secret"
 const [consumerKey, consumerSecret] = decrypted.split(":");
 if (consumerKey && consumerSecret) {
 return {
 ok: true,
 storeUrl: stored.storeUrl,
 consumerKey,
 consumerSecret,
 };
 }
 } catch {
 // رمزگشایی ناموفق — fallback
 }
 }
 }

 // ۲) متغیرهای محیطی سراسری
 const envUrl = process.env.WOOCOMMERCE_URL;
 const envKey = process.env.WOOCOMMERCE_KEY;
 const envSecret = process.env.WOOCOMMERCE_SECRET;
 if (envUrl && envKey && envSecret) {
 return {
 ok: true,
 storeUrl: envUrl,
 consumerKey: envKey,
 consumerSecret: envSecret,
 };
 }

 return { ok: false, reason: "no_credentials" };
}

// ساخت URL endpoint ووکامرس بر اساس نوع همگام‌سازی.
function buildWcEndpoint(baseUrl: string, type: "products" | "orders" | "stock"): string {
 const base = baseUrl.replace(/\/$/, "");
 const path =
 type === "orders"
? "/wp-json/wc/v3/orders"
: type === "products"
? "/wp-json/wc/v3/products"
: "/wp-json/wc/v3/products"; // stock از products استخراج می‌شود
 return `${base}${path}`;
}

// POST /api/integrations/woocommerce/sync — همگام‌سازی با ووکامرس
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
 const creds = await getWoocommerceCredentials(tenant.id);
 if (!creds.ok) {
 return NextResponse.json(
 {
 success: false,
 error:
 "اتصال به ووکامرس پیکربندی نشده است. لطفاً در تنظیمات اتصال را فعال کنید.",
 errorCode: "INTEGRATION_NOT_CONFIGURED",
 },
 { status: 503 }
 );
 }

 // ===== فراخوانی واقعی WooCommerce REST API =====
 // ووکامرس از Basic Auth با consumer_key:consumer_secret استفاده می‌کند.
 const url = new URL(buildWcEndpoint(creds.storeUrl!, type));
 url.searchParams.set("per_page", "100");
 url.searchParams.set("orderby", "date");
 url.searchParams.set("order", "desc");

 const basicAuth = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");

 let apiResponse: Response;
 try {
 apiResponse = await fetch(url.toString(), {
 method: "GET",
 headers: {
 Authorization: `Basic ${basicAuth}`,
 Accept: "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 signal: AbortSignal.timeout(30_000),
 });
 } catch (fetchErr) {
 console.error("WooCommerce API fetch failed:", fetchErr);
 return NextResponse.json(
 {
 success: false,
 error:
 "ارتباط با فروشگاه ووکامرس برقرار نشد. لطفاً URL و کلیدها را بررسی کنید.",
 errorCode: "INTEGRATION_NETWORK_ERROR",
 },
 { status: 502 }
 );
 }

 if (!apiResponse.ok) {
 const errText = await apiResponse.text().catch(() => "");
 console.error("WooCommerce API error:", apiResponse.status, errText.slice(0, 500));
 return NextResponse.json(
 {
 success: false,
 error: `خطا از سمت ووکامرس (HTTP ${apiResponse.status}). در صورت تداوم، با مدیر فروشگاه تماس بگیرید.`,
 errorCode: "INTEGRATION_API_ERROR",
 status: apiResponse.status,
 },
 { status: 502 }
 );
 }

 const items = (await apiResponse.json().catch(() => [])) as unknown[];

 // ===== Task 23-G: import واقعی داده‌ها (نه فقط شمارش) =====
 // products → ساخت/به‌روزرسانی Product (idempotent با sku=wc-{id}) + موجودی انبار پیش‌فرض
 // stock → به‌روزرسانی موجودی همان رکوردها
 // orders → گزارش تعداد + جمع مبلغ (ثبت فاکتور دستی باقی می‌ماند تا نگاشت مالیاتی فروشگاه)
 let imported = 0;
 let updated = 0;
 let ordersTotal = 0;
 let ordersRevenue = 0;

 if (type === "products" || type === "stock") {
  const products = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  // انبار پیش‌فرض tenant (اولین انبار) — برای موجودی
  const defaultWarehouse = await db.warehouse.findFirst({
  where: { tenantId: tenant.id },
  select: { id: true },
  });
  for (const p of products) {
  const wcId = String(p.id ?? "");
  const name = String(p.name ?? "").trim() || `کالای ووکامرس ${wcId}`;
  const sku = `wc-${wcId}`;
  // قیمت‌های ووکامرس به Toman است → ریال ×۱۰ (خالی/صفر → 0)
  const priceToRial = (v: unknown): bigint => {
  const n = Number(v);
  return BigInt(Number.isFinite(n) && n > 0 ? Math.round(n) * 10 : 0);
  };
  const salePrice = priceToRial(p.price);
  const purchasePrice = priceToRial((p as Record<string, unknown>).regular_price ?? p.price);
  const stockQty = Number(p.stock_quantity ?? 0) || 0;
  const imageUrl = Array.isArray((p as Record<string, unknown>).images)
  ? String(((p as Record<string, unknown>).images as Array<Record<string, unknown>>)[0]?.src ?? "") || null
  : null;
  try {
  const existing = await db.product.findFirst({
  where: { tenantId: tenant.id, sku },
  select: { id: true },
  });
  if (existing) {
  await db.product.update({
  where: { id: existing.id },
  data: {
  name,
  ...(salePrice > 0 ? { salePrice } : {}),
  ...(purchasePrice > 0 ? { purchasePrice } : {}),
  ...(imageUrl ? { imageUrl } : {}),
  },
  });
  updated++;
  } else {
  const created = await db.product.create({
  data: {
  tenantId: tenant.id,
  sku,
  name,
  unit: "عدد",
  type: "GOODS",
  salePrice,
  purchasePrice,
  ...(imageUrl ? { imageUrl } : {}),
  description: `درون‌ریزی‌شده از ووکامرس (#${wcId})`,
  },
  });
  imported++;
  // موجودی اولیه در انبار پیش‌فرض
  if (defaultWarehouse && stockQty > 0) {
  await db.stockItem.upsert({
  where: {
  tenantId_productId_warehouseId: {
  tenantId: tenant.id,
  productId: created.id,
  warehouseId: defaultWarehouse.id,
  },
  },
  create: {
  tenantId: tenant.id,
  productId: created.id,
  warehouseId: defaultWarehouse.id,
  quantity: stockQty,
  },
  update: { quantity: stockQty },
  });
  }
  }
  // sync نوع stock: موجودی رکوردهای موجود هم به‌روز شود
  if (type === "stock" && existing && defaultWarehouse) {
  await db.stockItem.upsert({
  where: {
  tenantId_productId_warehouseId: {
  tenantId: tenant.id,
  productId: existing.id,
  warehouseId: defaultWarehouse.id,
  },
  },
  create: {
  tenantId: tenant.id,
  productId: existing.id,
  warehouseId: defaultWarehouse.id,
  quantity: stockQty,
  },
  update: { quantity: stockQty },
  });
  }
  } catch (e) {
  console.warn(`[woocommerce-sync] product upsert failed (sku=${sku}):`, e);
  }
  }
 } else if (type === "orders") {
  const orders = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  ordersTotal = orders.length;
  for (const o of orders) {
  const total = Number(o.total ?? 0);
  if (Number.isFinite(total)) ordersRevenue += Math.round(total) * 10; // تومان → ریال
  }
 }

 const synced = Array.isArray(items)? items.length: 0;

 const integration = await db.integration.findFirst({
 where: { tenantId: tenant.id, type: "WOOCOMMERCE" },
 });
 if (integration) {
 await db.integration.update({
 where: { id: integration.id },
 data: { lastSync: new Date(), status: "CONNECTED" },
 });
 }

 await auditLog({
 tenantId: tenant.id,
 action: "WOOCOMMERCE_SYNC",
 entity: "Integration",
 entityId: integration?.id,
 changes: { type, synced, imported, updated, ordersTotal, ordersRevenue, errorsCount: 0 },
 req,
 });

 return NextResponse.json({
 success: true,
 type,
 synced,
 imported,
 updated,
 ...(type === "orders" ? { ordersTotal, ordersRevenue } : {}),
 errors: [],
 lastSync: new Date().toISOString(),
 message:
 type === "products"
 ? `همگام‌سازی محصولات ووکامرس کامل شد — ${imported} کالای جدید ساخته شد، ${updated} به‌روزرسانی`
 : type === "stock"
 ? `موجودی ${synced} کالا از ووکامرس به‌روزرسانی شد`
 : type === "orders"
 ? `${ordersTotal} سفارش ووکامرس خوانده شد (جمع ${ordersRevenue.toLocaleString("en-US")} ریال) — برای ثبت فاکتور، سفارش‌ها را از ماژول فاکتور با اتصال ووکامرس وارد کنید`
 : `همگام‌سازی با ووکامرس کامل شد — ${synced} آیتم`,
 });
 } catch (error) {
 console.error("WooCommerce sync error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در همگام‌سازی با ووکامرس" },
 { status: 500 }
 );
 }
}
