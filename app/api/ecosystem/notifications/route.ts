import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

// اطلاعات سرویس‌های اکوسیستم برای badge
const SERVICE_META: Record<string, { name: string; color: string }> = {
 NOBATIME: { name: "نوباتایم", color: "bg-primary/10 text-primary border-primary/30" },
 CATALOG: { name: "کاتالوگ", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
 HESABYAR: { name: "حساب‌یار", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
};

interface UnifiedNotification {
 id: string;
 source: "local" | "NOBATIME" | "CATALOG" | "HESABYAR";
 sourceName: string;
 sourceColor: string;
 title: string;
 message: string;
 type: "INFO" | "WARNING" | "ERROR" | "SUCCESS";
 isRead: boolean;
 link?: string;
 createdAt: string;
}

/**
 * GET /api/ecosystem/notifications
 *
 * مرکز اعلان‌های یکپارچه — اعلان‌های محلی هوش را با اعلان‌های
 * سرویس‌های اکوسیستم متصل ادغام می‌کند و یک لیست مرتب برمی‌گرداند.
 *
 * پاسخ: { notifications: UnifiedNotification[], total: number, unread: number, sources: [...] }
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);
 const onlyUnread = searchParams.get("unread") === "1";

 // 1) اعلان‌های محلی هوش
 const localWhere: Record<string, unknown> = {
 tenantId: user.tenantId,
...(onlyUnread? { isRead: false }: {}),
 OR: [{ userId: null }, { userId: user.id }],
 };
 const localNotifs = await db.notification.findMany({
 where: localWhere as never,
 orderBy: { createdAt: "desc" },
 take: limit,
 });

 const notifications: UnifiedNotification[] = localNotifs.map((n) => ({
 id: `local-${n.id}`,
 source: "local" as const,
 sourceName: "هوش",
 sourceColor: "bg-foreground/10 text-foreground border-foreground/30",
 title: n.title,
 message: n.message,
 type: (n.type as UnifiedNotification["type"]) || "INFO",
 isRead: n.isRead,
 link: n.link || undefined,
 createdAt: n.createdAt.toISOString(),
 }));

 // 2) اعلان‌های سرویس‌های اکوسیستم متصل (best-effort)
 const connections = await db.ecosystemConnection.findMany({
 where: {
 tenantId: user.tenantId,
 status: "CONNECTED",
 ssoToken: { not: null },
 },
 });

 const upstreamSources = ["NOBATIME", "CATALOG", "HESABYAR"] as const;
 const upstreamBaseUrls: Record<string, string> = {
 NOBATIME: "https://nobatime.ir",
 CATALOG: "https://catalog.nobatime.ir",
 HESABYAR: "https://yar.nobatime.ir",
 };

 await Promise.all(
 upstreamSources.map(async (service) => {
 const conn = connections.find((c) => c.service === service);
 if (!conn?.ssoToken) return; // سرویس متصل نیست

 const base = upstreamBaseUrls[service];
 try {
 const upstream = await fetch(
 `${base}/api/v1/notifications${onlyUnread? "?unread=1": ""}?limit=${Math.floor(limit / 3)}`,
 {
 headers: {
 Authorization: `Bearer ${conn.ssoToken}`,
 Accept: "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 signal: AbortSignal.timeout(4000),
 }
 );
 if (!upstream.ok) return;
 const json = (await upstream.json()) as {
 notifications?: Array<{
 id?: string;
 title?: string;
 message?: string;
 type?: string;
 read?: boolean;
 link?: string;
 created_at?: string;
 }>;
 };
 const meta = SERVICE_META[service];
 for (const n of json.notifications || []) {
 notifications.push({
 id: `${service}-${n.id || Math.random().toString(36).slice(2)}`,
 source: service,
 sourceName: meta.name,
 sourceColor: meta.color,
 title: n.title || "اعلان جدید",
 message: n.message || "",
 type: validateType(n.type),
 isRead:!!n.read,
 link: n.link,
 createdAt: n.created_at || new Date().toISOString(),
 });
 }
 } catch {
 // خطای شبکه — این سرویس را نادیده می‌گیریم
 }
 })
 );

 // مرتب‌سازی بر اساس زمان (نزولی) و محدودسازی
 notifications.sort(
 (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
 );
 const trimmed = notifications.slice(0, limit);

 // آمار
 const unread = trimmed.filter((n) =>!n.isRead).length;
 const sources = Array.from(new Set(trimmed.map((n) => n.source)));
 const sourcesByName = sources.map((s) => {
 if (s === "local") {
 return { id: s, name: "هوش", connected: true };
 }
 const meta = SERVICE_META[s];
 return { id: s, name: meta?.name || s, connected: true };
 });

 return NextResponse.json({
 success: true,
 data: {
 notifications: trimmed,
 total: trimmed.length,
 unread,
 sources: sourcesByName,
 },
 });
 } catch (error) {
 console.error("Unified notifications error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت اعلان‌ها" },
 { status: 500 }
 );
 }
}

function validateType(t?: string): UnifiedNotification["type"] {
 const valid = ["INFO", "WARNING", "ERROR", "SUCCESS"];
 const upper = (t || "INFO").toUpperCase();
 return (valid.includes(upper)? upper: "INFO") as UnifiedNotification["type"];
}
