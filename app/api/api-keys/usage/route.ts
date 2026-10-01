import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";

// GET /api/api-keys/usage — آمار استفاده از کلیدها
// بازگشت: تعداد کلیدها، فعال‌ها، استفاده‌شده در ۲۴ ساعت گذشته، آخرین استفاده
export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { tenantId } = auth.user;

 const now = new Date();
 const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
 const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
 const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

 const keys = await db.apiKey.findMany({
 where: { tenantId },
 select: {
 id: true,
 name: true,
 keyPrefix: true,
 lastUsedAt: true,
 isActive: true,
 createdAt: true,
 },
 orderBy: { createdAt: "desc" },
 });

 // آمار کلی
 const totalKeys = keys.length;
 const activeKeys = keys.filter((k) => k.isActive).length;
 const usedIn24h = keys.filter(
 (k) => k.lastUsedAt && k.lastUsedAt >= last24h
 ).length;
 const usedIn7d = keys.filter(
 (k) => k.lastUsedAt && k.lastUsedAt >= last7d
 ).length;
 const usedIn30d = keys.filter(
 (k) => k.lastUsedAt && k.lastUsedAt >= last30d
 ).length;
 const neverUsed = keys.filter((k) =>!k.lastUsedAt).length;

 // آمار هر کلید
 const perKey = keys.map((k) => ({
 id: k.id,
 name: k.name,
 keyPrefix: `${k.keyPrefix.slice(0, 8)}****`,
 isActive: k.isActive,
 lastUsedAt: k.lastUsedAt,
 createdAt: k.createdAt,
 usedRecently: k.lastUsedAt? k.lastUsedAt >= last24h: false,
 }));

 return NextResponse.json({
 success: true,
 data: {
 summary: {
 total: totalKeys,
 active: activeKeys,
 inactive: totalKeys - activeKeys,
 usedIn24h,
 usedIn7d,
 usedIn30d,
 neverUsed,
 },
 keys: perKey,
 },
 });
}
