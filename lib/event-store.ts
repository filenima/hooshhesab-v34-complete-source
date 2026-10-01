/**
 * هوش — Event Store (Event Sourcing)
 * =============================================================
 * ذخیره‌ی رویدادهای دامنه (append-only) برای الگوی Event Sourcing.
 *
 * رویدادها در جدول DomainEvent ذخیره می‌شوند و قابلیت replay دارند.
 * این فایل از مودل Prisma `DomainEvent` استفاده می‌کند.
 *
 * aggregateType: Invoice | Product | Party |...
 * eventType: CREATED | UPDATED | DELETED | STATUS_CHANGED |...
 */

import { db } from "@/lib/db";

// ============ Types ============

export interface DomainEvent {
 id: string;
 tenantId: string;
 aggregateType: string; // Invoice, Product, Party
 aggregateId: string;
 eventType: string; // CREATED, UPDATED, DELETED
 data: unknown;
 metadata: {
 userId?: string;
 timestamp: string;
 version: number;
 source?: string;
 ipAddress?: string;
 correlationId?: string;
 };
}

export interface EventStoreQuery {
 tenantId?: string;
 aggregateType?: string;
 aggregateId?: string;
 fromVersion?: number;
 fromDate?: Date;
 limit?: number;
}

// ============ Append ============

/**
 * افزودن رویداد به event store.
 * رویدادها append-only هستند و version به‌صورت خودکار افزایش می‌یابد.
 */
export async function appendEvent(
 event: Omit<DomainEvent, "id" | "metadata"> & {
 metadata?: Partial<DomainEvent["metadata"]>;
 }
): Promise<DomainEvent> {
 // محاسبه‌ی version بعدی برای این aggregate
 const lastEvent = await db.domainEvent.findFirst({
 where: {
 tenantId: event.tenantId,
 aggregateType: event.aggregateType,
 aggregateId: event.aggregateId,
 },
 orderBy: { version: "desc" },
 select: { version: true },
 });
 const nextVersion = (lastEvent?.version || 0) + 1;

 const created = await db.domainEvent.create({
 data: {
 tenantId: event.tenantId,
 aggregateType: event.aggregateType,
 aggregateId: event.aggregateId,
 eventType: event.eventType,
 data: JSON.stringify(event.data?? {}),
 metadata: JSON.stringify({
 userId: event.metadata?.userId,
 timestamp: new Date().toISOString(),
 version: nextVersion,
 source: event.metadata?.source || "system",
 ipAddress: event.metadata?.ipAddress,
 correlationId: event.metadata?.correlationId,
 }),
 version: nextVersion,
 },
 });

 return toDomainEvent(created);
}

/**
 * افزودن batch رویدادها (برای bulk imports).
 */
export async function appendEvents(
 events: Array<Omit<DomainEvent, "id" | "metadata"> & { metadata?: Partial<DomainEvent["metadata"]> }>
): Promise<number> {
 let count = 0;
 for (const event of events) {
 try {
 await appendEvent(event);
 count++;
 } catch (err) {
 console.error("appendEvents: failed for event", event.aggregateId, err);
 }
 }
 return count;
}

// ============ Query ============

/**
 * دریافت رویدادهای یک aggregate خاص.
 */
export async function getEvents(
 aggregateType: string,
 aggregateId: string,
 tenantId?: string
): Promise<DomainEvent[]> {
 const rows = await db.domainEvent.findMany({
 where: {
 aggregateType,
 aggregateId,
...(tenantId? { tenantId }: {}),
 },
 orderBy: { version: "asc" },
 });
 return rows.map(toDomainEvent);
}

/**
 * دریافت رویدادهای یک tenant در بازه‌ی مشخص.
 */
export async function getEventsByTenant(
 tenantId: string,
 options: { fromDate?: Date; toDate?: Date; aggregateType?: string; limit?: number } = {}
): Promise<DomainEvent[]> {
 const rows = await db.domainEvent.findMany({
 where: {
 tenantId,
...(options.aggregateType? { aggregateType: options.aggregateType }: {}),
...(options.fromDate || options.toDate
? {
 createdAt: {
 gte: options.fromDate,
 lte: options.toDate,
 },
 }
: {}),
 },
 orderBy: { createdAt: "asc" },
 take: options.limit || 1000,
 });
 return rows.map(toDomainEvent);
}

/**
 * کوئری پیشرفته با چند شرط.
 */
export async function queryEvents(query: EventStoreQuery): Promise<DomainEvent[]> {
 const rows = await db.domainEvent.findMany({
 where: {
...(query.tenantId? { tenantId: query.tenantId }: {}),
...(query.aggregateType? { aggregateType: query.aggregateType }: {}),
...(query.aggregateId? { aggregateId: query.aggregateId }: {}),
...(query.fromVersion? { version: { gte: query.fromVersion } }: {}),
...(query.fromDate? { createdAt: { gte: query.fromDate } }: {}),
 },
 orderBy: { createdAt: "asc" },
 take: query.limit || 500,
 });
 return rows.map(toDomainEvent);
}

// ============ Replay ============

/**
 * بازپخش همه‌ی رویدادهای یک tenant برای بازسازی state.
 * برای disaster recovery یا تست projections.
 */
export async function replayEvents(tenantId: string): Promise<{
 processed: number;
 byAggregate: Record<string, number>;
 durationMs: number;
}> {
 const start = Date.now();
 const events = await db.domainEvent.findMany({
 where: { tenantId },
 orderBy: { createdAt: "asc" },
 });

 const byAggregate: Record<string, number> = {};
 for (const row of events) {
 const key = `${row.aggregateType}:${row.aggregateId}`;
 byAggregate[key] = (byAggregate[key] || 0) + 1;

 // در اینجا projection handlers باید فراخوانی شوند
 // برای نمونه فقط لاگ می‌اندازیم
 if (process.env.EVENT_REPLAY_VERBOSE === "true") {
 console.log(`[replay] ${row.aggregateType}.${row.eventType} v${row.version}`);
 }
 }

 return {
 processed: events.length,
 byAggregate,
 durationMs: Date.now() - start,
 };
}

/**
 * بازپخش رویدادهای یک aggregate برای رسیدن به state فعلی.
 */
export async function replayAggregate(
 tenantId: string,
 aggregateType: string,
 aggregateId: string
): Promise<{ state: Record<string, unknown>; version: number }> {
 const events = await getEvents(aggregateType, aggregateId, tenantId);
 let state: Record<string, unknown> = {};
 let version = 0;
 for (const ev of events) {
 state = applyEventToState(state, ev);
 version = ev.metadata.version;
 }
 return { state, version };
}

// ============ Projections ============

/**
 * اعمال یک رویداد روی state (reducer).
 * برای aggregateTypeهای شناخته‌شده reducer اختصاصی دارد.
 */
function applyEventToState(
 state: Record<string, unknown>,
 event: DomainEvent
): Record<string, unknown> {
 const data = (event.data || {}) as Record<string, unknown>;
 switch (event.eventType) {
 case "CREATED":
 return {...state,...data, id: event.aggregateId };
 case "UPDATED":
 return {...state,...data };
 case "DELETED":
 return {...state, _deleted: true };
 default:
 return {...state,...data };
 }
}

// ============ Snapshot ============

/**
 * ذخیره‌ی snapshot از state فعلی یک aggregate برای بازیابی سریع.
 * (در production می‌توان در جدول جداگانه‌ای ذخیره کرد)
 */
export interface AggregateSnapshot {
 aggregateType: string;
 aggregateId: string;
 tenantId: string;
 state: unknown;
 version: number;
 takenAt: string;
}

const snapshotCache = new Map<string, AggregateSnapshot>();

export async function saveSnapshot(
 tenantId: string,
 aggregateType: string,
 aggregateId: string
): Promise<AggregateSnapshot | null> {
 const { state, version } = await replayAggregate(tenantId, aggregateType, aggregateId);
 if (version === 0) return null;

 const snapshot: AggregateSnapshot = {
 aggregateType,
 aggregateId,
 tenantId,
 state,
 version,
 takenAt: new Date().toISOString(),
 };
 snapshotCache.set(`${tenantId}:${aggregateType}:${aggregateId}`, snapshot);
 return snapshot;
}

export function getSnapshot(
 tenantId: string,
 aggregateType: string,
 aggregateId: string
): AggregateSnapshot | null {
 return snapshotCache.get(`${tenantId}:${aggregateType}:${aggregateId}`) || null;
}

// ============ Helper ============

function toDomainEvent(row: {
 id: string;
 tenantId: string;
 aggregateType: string;
 aggregateId: string;
 eventType: string;
 data: string;
 metadata: string;
 version: number;
 createdAt: Date;
}): DomainEvent {
 let data: unknown = {};
 let metadata: DomainEvent["metadata"] = {
 timestamp: row.createdAt.toISOString(),
 version: row.version,
 };
 try {
 data = JSON.parse(row.data);
 } catch {
 /* ignore */
 }
 try {
 metadata = JSON.parse(row.metadata) as DomainEvent["metadata"];
 } catch {
 /* ignore */
 }
 return {
 id: row.id,
 tenantId: row.tenantId,
 aggregateType: row.aggregateType,
 aggregateId: row.aggregateId,
 eventType: row.eventType,
 data,
 metadata,
 };
}
