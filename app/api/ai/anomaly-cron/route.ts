// /api/ai/anomaly-cron — اجرای روزانه تشخیص ناهنجاری برای همه‌ی tenantها
// هوش — AI Anomaly Detection Cron Job
// ----------------------------------------------------------------------------
// این اندپوینت با یک CRON_SECRET محافظت می‌شود و باید روزانه (مثلاً از طریق
// یک system cron یا Vercel Cron / WakaTime) فراخوانی شود. ناهنجاری‌های
// بحرانی/با اهمیت برای tenantها را به‌صورت اعلان درج می‌کند.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAnomalyDetection } from "@/app/api/ai/anomaly-detect/route";

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 minutes for many tenants

// ============ Secret validation ============
function isAuthorized(req: NextRequest): boolean {
 // 1) CRON_SECRET در هدر
 const secret = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
 const envSecret = process.env.CRON_SECRET || process.env.ANOMALY_CRON_SECRET;
 if (secret && envSecret && secret === envSecret) return true;

 // 2) در development — بدون نیاز به secret
 if (process.env.NODE_ENV!== "production") return true;

 // 3) اگر SECRET تنظیم نشده — در production رد کن
 if (!envSecret) return false;

 return false;
}

// ============ Endpoint ============
export async function POST(req: NextRequest) {
 try {
 if (!isAuthorized(req)) {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز — CRON_SECRET معتبر نیست" },
 { status: 401 }
 );
 }

 // Get all active tenants
 const tenants = await db.tenant.findMany({
 where: { status: "active" },
 select: { id: true, name: true },
 take: 200, // cap for safety
 });

 if (tenants.length === 0) {
 return NextResponse.json({
 success: true,
 message: "هیچ tenant فعالی یافت نشد",
 checked: 0,
 });
 }

 const results: Array<{
 tenantId: string;
 tenantName: string;
 totalAnomalies: number;
 critical: number;
 high: number;
 notificationsCreated: number;
 error?: string;
 }> = [];

 // Run sequentially (avoid overwhelming DB with parallel detection across many tenants)
 for (const tenant of tenants) {
 try {
 const { summary } = await runAnomalyDetection(tenant.id, {
 createNotifications: true,
 });

 results.push({
 tenantId: tenant.id,
 tenantName: tenant.name,
 totalAnomalies: summary.total,
 critical: summary.critical,
 high: summary.high,
 notificationsCreated: Math.min(5, summary.critical + summary.high),
 });
 } catch (err) {
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 console.error(`Anomaly cron error for tenant ${tenant.id}:`, msg);
 results.push({
 tenantId: tenant.id,
 tenantName: tenant.name,
 totalAnomalies: 0,
 critical: 0,
 high: 0,
 notificationsCreated: 0,
 error: msg,
 });
 }
 }

 const totalAnomalies = results.reduce((s, r) => s + r.totalAnomalies, 0);
 const totalCritical = results.reduce((s, r) => s + r.critical, 0);
 const totalNotifications = results.reduce((s, r) => s + r.notificationsCreated, 0);

 // Audit log (system-level, tenantId = first tenant or a special marker)
 try {
 await db.auditLog.create({
 data: {
 tenantId: tenants[0].id,
 action: "AI_ANOMALY_CRON_RUN",
 entity: "ai.anomaly-cron",
 changes: JSON.stringify({
 tenantsChecked: tenants.length,
 totalAnomalies,
 totalCritical,
 totalNotifications,
 runAt: new Date().toISOString(),
 }),
 ipAddress: req.headers.get("x-forwarded-for") || "cron",
 },
 });
 } catch (err) {
 console.error("Audit log error in cron:", err);
 }

 return NextResponse.json({
 success: true,
 checked: tenants.length,
 totalAnomalies,
 totalCritical,
 totalNotifications,
 results: results.slice(0, 50), // first 50 for debugging
 runAt: new Date().toISOString(),
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Anomaly cron error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای کرون ناهنجاری." },
 { status: 500 }
 );
 }
}

// GET — info
export async function GET() {
 return NextResponse.json({
 success: true,
 endpoint: "/api/ai/anomaly-cron",
 schedule: "daily (recommend 03:00 AM Iran time)",
 auth: "x-cron-secret header or CRON_SECRET env",
 features: ["protected", "multi-tenant", "auto-notifications"],
 });
}
