import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

/**
 * دریافت tenant فعال برای caller احراز هویت شده.
 *
 * SECURITY (C1): این تابع قبلاً اولین tenant با status=active را برمی‌گرداند که
 * یک باگ امنیتی critical بود — هر کاربر ناشناس به داده‌های tenant اول دسترسی داشت.
 * اکنون req را به getAuthContext می‌دهد و tenant کاربر احراز شده را برمی‌گرداند.
 *
 * در development بدون req: به tenant دمو fallback می‌شود تا تست دستی ممکن باشد.
 * در production بدون req: null برمی‌گرداند (deny by default).
 */
export async function getTenantId(req?: NextRequest): Promise<string | null> {
 if (req) {
 const ctx = await getAuthContext(req);
 if (ctx) return ctx.tenantId;
 return null;
 }

 // بدون req — فقط با env صریح DEMO_MODE=1 به tenant دمو fallback کن
 // (FIX امنیتی: قبلاً NODE_ENV!==production بود — مثل lib/auth.ts سخت‌گیرانه شد)
 // FIX(v6 — نشت داده): فقط tenant دمو (subdomain=demo) — نه اولین tenant فعال
 if (process.env.DEMO_MODE === "1") {
 const tenant = await db.tenant.findFirst({
 where: { status: "active", subdomain: "demo" },
 });
 return tenant?.id?? null;
 }
 return null;
}
