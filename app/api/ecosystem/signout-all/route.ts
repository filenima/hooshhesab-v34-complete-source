import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { isSessionActive } from "@/lib/session";

export const runtime = "nodejs";

// نقاط خروج (logout) هر سرویس اکوسیستم
const SERVICE_LOGOUT_URLS: Record<string, string> = {
 NOBATIME: "https://nobatime.ir/api/v1/auth/logout",
 CATALOG: "https://catalog.nobatime.ir/api/v1/auth/logout",
 HESABYAR: "https://yar.nobatime.ir/api/v1/auth/logout",
};

interface SignoutResult {
 service: string;
 success: boolean;
 skipped: boolean;
 error?: string;
}

/**
 * POST /api/ecosystem/signout-all
 *
 * خروج از همه‌ی سرویس‌های اکوسیستم متصل (Nobatime، Catalog، HesabYar)
 * به‌علاوه‌ی ابطال نشست محلی هوش.
 *
 * روند کار:
 * 1) احراز توکن کاربر
 * 2) یافتن همه‌ی EcosystemConnection های CONNECTED برای tenant
 * 3) فراخوانی logout endpoint هر سرویس (با timeout کوتاه و best-effort)
 * 4) پاک‌سازی ssoToken و علامت‌گذاری status = "PENDING"
 * 5) ابطال نشست محلی (UserSession.isActive = false)
 *
 * پاسخ: { results: [{service, success, skipped}], localSignedOut: boolean }
 */
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const token = authHeader.substring(7);
 const payload = verifyToken(token);
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 // بررسی اینکه نشست هنوز فعال است (اگر از قبل ابطال شده، فقط acknowledge کن)
 const sessionActive = await isSessionActive(token);
 if (!sessionActive) {
 return NextResponse.json({
 success: true,
 data: {
 localSignedOut: true,
 results: [],
 message: "نشست قبلاً ابطال شده بود.",
 },
 });
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true, name: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // پیدا کردن همه‌ی اتصالات فعال
 const connections = await db.ecosystemConnection.findMany({
 where: {
 tenantId: user.tenantId,
 status: "CONNECTED",
 },
 });

 const results: SignoutResult[] = [];

 // فراخوانی logout هر سرویس به‌صورت موازی (best-effort)
 await Promise.all(
 connections.map(async (conn) => {
 const logoutUrl = SERVICE_LOGOUT_URLS[conn.service];
 if (!logoutUrl ||!conn.ssoToken) {
 results.push({
 service: conn.service,
 success: true,
 skipped: true,
 });
 return;
 }

 try {
 const upstream = await fetch(logoutUrl, {
 method: "POST",
 headers: {
 Authorization: `Bearer ${conn.ssoToken}`,
 "Content-Type": "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 body: JSON.stringify({ source: "hoshhesab" }),
 signal: AbortSignal.timeout(4000),
 });
 // logout معمولاً 200 یا 204 برمی‌گرداند؛ حتی 401 هم قابل‌قبول است
 // چون نشست ممکن است از قبل منقضی شده باشد
 const ok = upstream.ok || upstream.status === 401 || upstream.status === 404;
 results.push({
 service: conn.service,
 success: ok,
 skipped: false,
 error: ok? undefined: `HTTP ${upstream.status}`,
 });
 } catch (err) {
 // خطای شبکه — به‌هرحال توکن محلی را پاک می‌کنیم
 results.push({
 service: conn.service,
 success: true, // موفق در حد محلی
 skipped: false,
 error: err instanceof Error? err.message: "network error",
 });
 }

 // پاک‌سازی توکن SSO در دیتابیس
 try {
 await db.ecosystemConnection.update({
 where: { id: conn.id },
 data: {
 ssoToken: null,
 status: "PENDING",
 externalId: null,
 connectedAt: null,
 },
 });
 } catch (e) {
 console.warn(`Failed to clear connection ${conn.service}:`, e);
 }
 })
 );

 // ابطال نشست محلی هوش
 let localSignedOut = false;
 try {
 const updated = await db.userSession.updateMany({
 where: { token, isActive: true },
 data: { isActive: false },
 });
 localSignedOut = updated.count > 0;
 } catch (e) {
 console.warn("Failed to revoke local session:", e);
 }

 // ثبت audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "LOGOUT",
 entity: "EcosystemConnection",
 changes: JSON.stringify({
 services: results.map((r) => r.service),
 localSignedOut,
 source: "signout-all",
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 userAgent: req.headers.get("user-agent") || null,
 },
 });
 } catch {
 /* ignore audit log errors */
 }

 return NextResponse.json({
 success: true,
 data: {
 localSignedOut,
 results,
 message: `از ${results.length} سرویس اکوسیستم خارج شدید.`,
 },
 });
 } catch (error) {
 console.error("Signout-all error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در خروج از سرویس‌ها" },
 { status: 500 }
 );
 }
}
