import { db } from "@/lib/db";

// ============ Real-time Analytics ============
// ردیابی live metrics: کاربران فعال، رویداد در دقیقه، صفحات پر بازدید.
// با کمک WebSocket (realtime mini-service) به‌روز می‌شود.
// در این لایه، داده‌های لحظه‌ای از AuditLog و SecurityEvent محاسبه می‌شوند.

export interface LiveMetrics {
 activeUsers: number;
 eventsPerMinute: number;
 topPages: { page: string; count: number }[];
 topEvents: { event: string; count: number }[];
 totalToday: number;
 byHour: { hour: number; count: number }[];
}

/**
 * کلاس singleton برای ردیابی live metrics.
 * در production باید از Redis Pub/Sub یا حافظه‌ی مشترک استفاده کند.
 */
export class RealtimeAnalytics {
 private static instance: RealtimeAnalytics;
 private buffer: { userId: string; page: string; ts: number }[] = [];
 private eventBuffer: { userId: string; event: string; ts: number }[] = [];

 private constructor() {}

 static getInstance(): RealtimeAnalytics {
 if (!RealtimeAnalytics.instance) {
 RealtimeAnalytics.instance = new RealtimeAnalytics();
 }
 return RealtimeAnalytics.instance;
 }

 /**
 * ثبت یک بازدید صفحه.
 */
 trackPageView(userId: string, page: string): void {
 this.buffer.push({ userId, page, ts: Date.now() });
 this.trimBuffer();
 }

 /**
 * ثبت یک رویداد دلخواه.
 */
 trackEvent(userId: string, event: string, _data?: unknown): void {
 this.eventBuffer.push({ userId, event, ts: Date.now() });
 this.trimBuffer();
 }

 private trimBuffer(): void {
 const cutoff = Date.now() - 10 * 60 * 1000; // 10 دقیقه
 this.buffer = this.buffer.filter((x) => x.ts > cutoff);
 this.eventBuffer = this.eventBuffer.filter((x) => x.ts > cutoff);
 }

 /**
 * دریافت متریک‌های live از buffer.
 */
 getLiveMetrics(): {
 activeUsers: number;
 eventsPerMinute: number;
 topPages: { page: string; count: number }[];
 topEvents: { event: string; count: number }[];
 } {
 this.trimBuffer();
 const now = Date.now();
 const minuteAgo = now - 60 * 1000;

 const activeUserSet = new Set<string>();
 for (const x of this.buffer) {
 if (now - x.ts < 5 * 60 * 1000) activeUserSet.add(x.userId);
 }

 const eventsPerMinute = this.eventBuffer.filter((x) => x.ts > minuteAgo).length;

 const pageCount = new Map<string, number>();
 for (const x of this.buffer) {
 pageCount.set(x.page, (pageCount.get(x.page) || 0) + 1);
 }
 const topPages = Array.from(pageCount.entries())
.map(([page, count]) => ({ page, count }))
.sort((a, b) => b.count - a.count)
.slice(0, 10);

 const eventCount = new Map<string, number>();
 for (const x of this.eventBuffer) {
 eventCount.set(x.event, (eventCount.get(x.event) || 0) + 1);
 }
 const topEvents = Array.from(eventCount.entries())
.map(([event, count]) => ({ event, count }))
.sort((a, b) => b.count - a.count)
.slice(0, 10);

 return {
 activeUsers: activeUserSet.size,
 eventsPerMinute,
 topPages,
 topEvents,
 };
 }
}

/**
 * دریافت متریک‌های live از دیتابیس (به‌عنوان fallback و برای نمای real).
 */
export async function getDbLiveMetrics(): Promise<LiveMetrics> {
 const now = new Date();
 const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
 const minuteAgo = new Date(now.getTime() - 60 * 1000);

 const [todayAudits, recentAudits, minuteAudits] = await Promise.all([
 db.auditLog.findMany({
 where: { createdAt: { gte: startOfDay }, userId: { not: null } },
 select: { userId: true, entity: true, action: true, createdAt: true },
 take: 10000,
 }),
 db.auditLog.findMany({
 where: { createdAt: { gte: fiveMinAgo }, userId: { not: null } },
 select: { userId: true, entity: true, action: true, createdAt: true },
 take: 5000,
 }),
 db.auditLog.count({ where: { createdAt: { gte: minuteAgo } } }),
 ]);

 const activeUsers = new Set(recentAudits.map((a) => a.userId).filter(Boolean)).size;

 const pageCount = new Map<string, number>();
 for (const a of todayAudits) {
 const key = `${a.entity}:${a.action}`;
 pageCount.set(key, (pageCount.get(key) || 0) + 1);
 }
 const topPages = Array.from(pageCount.entries())
.map(([page, count]) => ({ page, count }))
.sort((a, b) => b.count - a.count)
.slice(0, 10);

 const eventCount = new Map<string, number>();
 for (const a of todayAudits) {
 eventCount.set(a.action, (eventCount.get(a.action) || 0) + 1);
 }
 const topEvents = Array.from(eventCount.entries())
.map(([event, count]) => ({ event, count }))
.sort((a, b) => b.count - a.count)
.slice(0, 10);

 const byHourMap = new Map<number, number>();
 for (const a of todayAudits) {
 const hour = new Date(a.createdAt).getHours();
 byHourMap.set(hour, (byHourMap.get(hour) || 0) + 1);
 }
 const byHour = Array.from(byHourMap.entries())
.map(([hour, count]) => ({ hour, count }))
.sort((a, b) => a.hour - b.hour);

 return {
 activeUsers,
 eventsPerMinute: minuteAudits,
 topPages,
 topEvents,
 totalToday: todayAudits.length,
 byHour,
 };
}

/**
 * انتشار یک رویداد از طریق realtime WebSocket service.
 */
export async function broadcastRealtimeEvent(
 _event: string,
 _tenantId: string,
 _data: Record<string, unknown>
): Promise<void> {
 try {
 const baseUrl = process.env.REALTIME_SERVICE_URL || "http://localhost:3003";
 const url = `${baseUrl}/?XTransformPort=3003`;
 await fetch(url, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 event: _event,
 tenantId: _tenantId,
 data: _data,
 ts: Date.now(),
 }),
 keepalive: true,
 }).catch(() => {
 /* ignore */
 });
 } catch {
 /* ignore */
 }
}

export const realtimeAnalytics = RealtimeAnalytics.getInstance();
