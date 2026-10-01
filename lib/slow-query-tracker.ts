// ============ Slow Query Tracker — هوش ============
// ذخیره‌ی درون‌حافظه‌ای آخرین ۲۰۰ کوئری کند (>100ms) که توسط Prisma
// اجرا شده است. این داده‌ها در پنل سوپرادمین (DB Inspector Slow Queries)
// قابل مشاهده‌اند. با restart سرور پاک می‌شوند.
//
// برای فعال‌سازی ردیابی، متغیر محیطی TRACK_SLOW_QUERIES=true را تنظیم
// کنید — در lib/db.ts این پرچم بررسی می‌شود و Prisma به event emission
// برای query level سوییچ می‌کند.

export interface SlowQueryEntry {
 id: number;
 query: string;
 duration: number;
 model?: string;
 operation?: string;
 timestamp: string;
 params?: string;
}

const MAX_ENTRIES = 200;
const THRESHOLD_MS = 100;
let nextId = 1;
const buffer: SlowQueryEntry[] = [];

/**
 * ثبت یک کوئری کند در buffer.
 */
export function recordSlowQuery(args: {
 query: string;
 duration: number;
 model?: string;
 operation?: string;
 params?: string;
}) {
 if (args.duration < THRESHOLD_MS) return;
 buffer.unshift({
 id: nextId++,
 query: args.query.slice(0, 2000),
 duration: Math.round(args.duration),
 model: args.model,
 operation: args.operation,
 timestamp: new Date().toISOString(),
 params: args.params?.slice(0, 500),
 });
 if (buffer.length > MAX_ENTRIES) {
 buffer.length = MAX_ENTRIES;
 }
}

/**
 * دریافت snapshot از buffer برای endpoint.
 */
export function getSlowQueries(opts?: {
 limit?: number;
 thresholdMs?: number;
}): { entries: SlowQueryEntry[]; stats: SlowQueryStats } {
 const limit = Math.min(opts?.limit?? 50, 100);
 const threshold = opts?.thresholdMs?? THRESHOLD_MS;
 const filtered = buffer.filter((q) => q.duration >= threshold).slice(0, limit);

 const stats: SlowQueryStats = {
 totalLogged: buffer.length,
 avgDurationMs:
 buffer.length > 0
? Math.round(buffer.reduce((s, q) => s + q.duration, 0) / buffer.length)
: 0,
 maxDurationMs: buffer.reduce((m, q) => Math.max(m, q.duration), 0),
 byModel: buffer.reduce<Record<string, number>>((acc, q) => {
 const k = q.model || "unknown";
 acc[k] = (acc[k] || 0) + 1;
 return acc;
 }, {}),
 thresholdMs: THRESHOLD_MS,
 };

 return { entries: filtered, stats };
}

export function clearSlowQueries(): number {
 const cleared = buffer.length;
 buffer.length = 0;
 return cleared;
}

export function getSlowQueryStats(): {
 bufferSize: number;
 maxBuffer: number;
 thresholdMs: number;
} {
 return { bufferSize: buffer.length, maxBuffer: MAX_ENTRIES, thresholdMs: THRESHOLD_MS };
}

export interface SlowQueryStats {
 totalLogged: number;
 avgDurationMs: number;
 maxDurationMs: number;
 byModel: Record<string, number>;
 thresholdMs: number;
}
