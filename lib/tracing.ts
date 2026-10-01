/**
 * هوش — Distributed Tracing
 * =============================================================
 * سیستم tracing ساده در حافظه (OpenTelemetry-compatible interface).
 *
 * - startTrace(name): شروع یک trace جدید
 * - addSpan(trace, name, data?): افزودن span به trace
 * - endTrace(trace): پایان trace و بازگشت نتیجه
 *
 * هر trace شامل چند span است و duration کل و هر span گزارش می‌شود.
 * در production می‌توان با OpenTelemetry SDK جایگزین کرد.
 */

import { randomUUID } from "crypto";

// ============ Types ============

export interface Span {
 id: string;
 name: string;
 startTime: number;
 endTime?: number;
 durationMs?: number;
 data?: unknown;
 status: "ok" | "error";
 error?: string;
}

export interface TraceContext {
 id: string;
 name: string;
 startTime: number;
 spans: Span[];
 metadata: Record<string, unknown>;
 parentId?: string; // برای distributed tracing
}

export interface TraceResult {
 id: string;
 name: string;
 durationMs: number;
 spanCount: number;
 spans: Array<{
 name: string;
 durationMs: number;
 status: "ok" | "error";
 }>;
 status: "ok" | "error";
 metadata: Record<string, unknown>;
}

// ============ Tracer (singleton) ============

class Tracer {
 private traces = new Map<string, TraceContext>();
 private completed: TraceResult[] = [];
 private maxCompleted = 1000;

 startTrace(name: string, metadata?: Record<string, unknown>): TraceContext {
 const trace: TraceContext = {
 id: randomUUID(),
 name,
 startTime: Date.now(),
 spans: [],
 metadata: metadata || {},
 };
 this.traces.set(trace.id, trace);
 return trace;
 }

 addSpan(trace: TraceContext, name: string, data?: unknown): void {
 const span: Span = {
 id: randomUUID(),
 name,
 startTime: Date.now(),
 data,
 status: "ok",
 };
 trace.spans.push(span);
 }

 endSpan(trace: TraceContext, name: string, error?: string): void {
 const span = trace.spans.find((s) => s.name === name &&!s.endTime);
 if (span) {
 span.endTime = Date.now();
 span.durationMs = span.endTime - span.startTime;
 if (error) {
 span.status = "error";
 span.error = error;
 }
 }
 }

 endTrace(trace: TraceContext): TraceResult {
 const endTime = Date.now();
 const durationMs = endTime - trace.startTime;

 // پایان span‌های باز
 for (const span of trace.spans) {
 if (!span.endTime) {
 span.endTime = endTime;
 span.durationMs = span.endTime - span.startTime;
 }
 }

 const status: "ok" | "error" = trace.spans.some((s) => s.status === "error")
? "error"
: "ok";

 const result: TraceResult = {
 id: trace.id,
 name: trace.name,
 durationMs,
 spanCount: trace.spans.length,
 spans: trace.spans.map((s) => ({
 name: s.name,
 durationMs: s.durationMs || 0,
 status: s.status,
 })),
 status,
 metadata: trace.metadata,
 };

 this.traces.delete(trace.id);
 this.completed.push(result);
 if (this.completed.length > this.maxCompleted) {
 this.completed.shift();
 }

 // log slow traces
 if (durationMs > 1000) {
 console.warn(`[tracing] slow trace: ${trace.name} took ${durationMs}ms`);
 }

 return result;
 }

 getTrace(id: string): TraceContext | null {
 return this.traces.get(id) || null;
 }

 getCompletedTraces(limit = 100): TraceResult[] {
 return this.completed.slice(-limit).reverse();
 }

 getStats(): {
 activeCount: number;
 completedCount: number;
 avgDurationMs: number;
 errorRate: number;
 } {
 const completed = this.completed;
 const avgDuration =
 completed.length > 0
? completed.reduce((sum, t) => sum + t.durationMs, 0) / completed.length
: 0;
 const errors = completed.filter((t) => t.status === "error").length;
 return {
 activeCount: this.traces.size,
 completedCount: completed.length,
 avgDurationMs: Math.round(avgDuration),
 errorRate: completed.length > 0? errors / completed.length: 0,
 };
 }

 /**
 * پاک کردن همه‌ی trace‌ها (برای تست).
 */
 clear(): void {
 this.traces.clear();
 this.completed = [];
 }
}

// ============ Singleton ============

let tracerInstance: Tracer | null = null;

export function getTracer(): Tracer {
 if (!tracerInstance) {
 tracerInstance = new Tracer();
 }
 return tracerInstance;
}

/**
 * helper: اجرای یک تابع در یک span.
 */
export async function withSpan<T>(
 trace: TraceContext,
 name: string,
 fn: () => Promise<T>,
 data?: unknown
): Promise<T> {
 getTracer().addSpan(trace, name, data);
 try {
 const result = await fn();
 getTracer().endSpan(trace, name);
 return result;
 } catch (err) {
 getTracer().endSpan(trace, name, err instanceof Error? err.message: String(err));
 throw err;
 }
}

/**
 * helper: اجرای یک تابع در یک trace کامل.
 */
export async function withTrace<T>(
 name: string,
 fn: (trace: TraceContext) => Promise<T>,
 metadata?: Record<string, unknown>
): Promise<{ result: T; trace: TraceResult }> {
 const tracer = getTracer();
 const trace = tracer.startTrace(name, metadata);
 try {
 const result = await fn(trace);
 return { result, trace: tracer.endTrace(trace) };
 } catch (err) {
 tracer.endTrace(trace);
 throw err;
 }
}

// Re-export for convenience
export { Tracer };
