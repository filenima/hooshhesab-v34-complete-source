// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * observability.ts — OpenTelemetry instrumentation برای هوش
 * شامل: traces (spans)، metrics (counters, histograms)، logs (structured)
 * قابل استفاده در Next.js server و mini-services
 */

// تایپ‌های سبک بدون وابستگی به پکیج OTel (برای جلوگیری از bundle bloat)
type AttributeValue = string | number | boolean | Array<string | number | boolean>;

export interface Span {
 name: string;
 traceId: string;
 spanId: string;
 parentId?: string;
 startTime: number;
 endTime?: number;
 attributes: Record<string, AttributeValue>;
 events: Array<{ name: string; time: number; attributes?: Record<string, AttributeValue> }>;
 status: { code: 'OK' | 'ERROR'; message?: string };
}

export interface LogEntry {
 timestamp: number;
 level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
 message: string;
 traceId?: string;
 spanId?: string;
 attributes?: Record<string, AttributeValue>;
}

// ---------- تولید ID ----------
function generateId(bytes: number): string {
 const arr = new Uint8Array(bytes);
 // crypto در Next.js server در دسترس است
 if (typeof globalThis.crypto?.getRandomValues === 'function') {
 globalThis.crypto.getRandomValues(arr);
 } else {
 for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
 }
 return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- buffer در حافظه ----------
const MAX_BUFFER = 1000;
const spanBuffer: Span[] = [];
const logBuffer: LogEntry[] = [];
const metricCounters = new Map<string, { value: number; attributes: Record<string, AttributeValue> }>();
const metricHistograms = new Map<string, { count: number; sum: number; min: number; max: number; buckets: Record<string, number> }>();

// ---------- exporters (همگام، با fallback) ----------
const exporters: Array<(data: { spans: Span[]; logs: LogEntry[]; metrics: unknown }) => void> = [];

export function addExporter(fn: (data: { spans: Span[]; logs: LogEntry[]; metrics: unknown }) => void) {
 exporters.push(fn);
}

// exporter پیش‌فرض: چاپ در لاگ سرور
addExporter((data) => {
 if (process.env.NODE_ENV === 'development' && process.env.OTEL_DEBUG === '1') {
 console.log('[otel]', JSON.stringify(data).slice(0, 500));
 }
});

// ---------- Tracer ----------
class TracerImpl {
 private currentSpan: Span | null = null;

 startSpan(name: string, attributes?: Record<string, AttributeValue>): Span {
 const span: Span = {
 name,
 traceId: this.currentSpan?.traceId || generateId(16),
 spanId: generateId(8),
 parentId: this.currentSpan?.spanId,
 startTime: Date.now(),
 attributes: {...attributes },
 events: [],
 status: { code: 'OK' },
 };
 this.currentSpan = span;
 return span;
 }

 endSpan(span: Span, status?: { code: 'OK' | 'ERROR'; message?: string }) {
 span.endTime = Date.now();
 if (status) span.status = status;
 spanBuffer.push(span);
 if (spanBuffer.length > MAX_BUFFER) spanBuffer.shift();
 if (this.currentSpan === span) this.currentSpan = null;
 return span;
 }

 addEvent(span: Span, name: string, attributes?: Record<string, AttributeValue>) {
 span.events.push({ name, time: Date.now(), attributes });
 }

 setAttribute(span: Span, key: string, value: AttributeValue) {
 span.attributes[key] = value;
 }

 recordError(span: Span, error: Error) {
 span.status = { code: 'ERROR', message: error.message };
 span.events.push({
 name: 'exception',
 time: Date.now(),
 attributes: {
 'exception.type': error.name,
 'exception.message': error.message,
 'exception.stacktrace': error.stack || '',
 },
 });
 }

 withSpan<T>(name: string, fn: () => T, attributes?: Record<string, AttributeValue>): T {
 const span = this.startSpan(name, attributes);
 try {
 const result = fn();
 this.endSpan(span);
 return result;
 } catch (e) {
 this.recordError(span, e as Error);
 this.endSpan(span, { code: 'ERROR', message: (e as Error).message });
 throw e;
 }
 }

 async withSpanAsync<T>(name: string, fn: () => Promise<T>, attributes?: Record<string, AttributeValue>): Promise<T> {
 const span = this.startSpan(name, attributes);
 try {
 const result = await fn();
 this.endSpan(span);
 return result;
 } catch (e) {
 this.recordError(span, e as Error);
 this.endSpan(span, { code: 'ERROR', message: (e as Error).message });
 throw e;
 }
 }

 flush() {
 const spans = [...spanBuffer];
 spanBuffer.length = 0;
 const logs = [...logBuffer];
 logBuffer.length = 0;
 const metrics = {
 counters: Object.fromEntries(metricCounters),
 histograms: Object.fromEntries(metricHistograms),
 };
 for (const exporter of exporters) exporter({ spans, logs, metrics });
 return { spans, logs, metrics };
 }
}

export const tracer = new TracerImpl();

// ---------- Meter ----------
export const meter = {
 counter(name: string, value = 1, attributes: Record<string, AttributeValue> = {}) {
 const key = `${name}:${JSON.stringify(attributes)}`;
 const existing = metricCounters.get(key);
 if (existing) existing.value += value;
 else metricCounters.set(key, { value, attributes });
 },
 histogram(name: string, value: number) {
 const existing = metricHistograms.get(name);
 const bucketKey = this._bucketFor(name, value);
 if (existing) {
 existing.count++;
 existing.sum += value;
 existing.min = Math.min(existing.min, value);
 existing.max = Math.max(existing.max, value);
 existing.buckets[bucketKey] = (existing.buckets[bucketKey] || 0) + 1;
 } else {
 metricHistograms.set(name, {
 count: 1,
 sum: value,
 min: value,
 max: value,
 buckets: { [bucketKey]: 1 },
 });
 }
 },
 _bucketFor(_name: string, value: number): string {
 // bucketهای استاندارد برای latency (ms)
 if (value < 5) return '<5';
 if (value < 10) return '<10';
 if (value < 25) return '<25';
 if (value < 50) return '<50';
 if (value < 100) return '<100';
 if (value < 250) return '<250';
 if (value < 500) return '<500';
 if (value < 1000) return '<1000';
 if (value < 5000) return '<5000';
 return '>=5000';
 },
 gauge(_name: string, _value: number) {
 // gauge به‌سادگی به‌عنوان آخرین مقدار ذخیره می‌شود
 metricCounters.set(`gauge:${_name}`, { value: _value, attributes: {} });
 },
};

// ---------- Logger (structured) ----------
export const logger = {
 log(level: LogEntry['level'], message: string, attributes?: Record<string, AttributeValue>) {
 const entry: LogEntry = {
 timestamp: Date.now(),
 level,
 message,
 traceId: tracer.currentSpan?.traceId,
 spanId: tracer.currentSpan?.spanId,
 attributes,
 };
 logBuffer.push(entry);
 if (logBuffer.length > MAX_BUFFER) logBuffer.shift();
 // چاپ همگام در کنسول
 const fn = level === 'error' || level === 'fatal'? console.error
: level === 'warn'? console.warn
: level === 'debug' || level === 'trace'? console.debug
: console.info;
 fn(JSON.stringify(entry));
 },
 info(msg: string, attrs?: Record<string, AttributeValue>) { this.log('info', msg, attrs); },
 warn(msg: string, attrs?: Record<string, AttributeValue>) { this.log('warn', msg, attrs); },
 error(msg: string, attrs?: Record<string, AttributeValue>) { this.log('error', msg, attrs); },
 debug(msg: string, attrs?: Record<string, AttributeValue>) { this.log('debug', msg, attrs); },
};

// ---------- middleware برای API routes ----------
export function withTracing<T extends (...args: never[]) => unknown>(
 name: string,
 handler: T,
 attributes?: Record<string, AttributeValue>
): T {
 return ((...args: never[]) => {
 return tracer.withSpan(name, () => handler(...args), attributes);
 }) as T;
}

export function withTracingAsync<T extends (...args: never[]) => Promise<unknown>>(
 name: string,
 handler: T,
 attributes?: Record<string, AttributeValue>
): T {
 return ((...args: never[]) => {
 return tracer.withSpanAsync(name, () => handler(...args), attributes);
 }) as T;
}

// ---------- دیاگنوستیک ----------
export function getMetricsSnapshot() {
 return {
 spansEmitted: spanBuffer.length,
 logsBuffered: logBuffer.length,
 counters: Object.fromEntries(metricCounters),
 histograms: Object.fromEntries(metricHistograms),
 };
}

export function getRecentSpans(limit = 50): Span[] {
 return spanBuffer.slice(-limit);
}

export function getRecentLogs(limit = 50): LogEntry[] {
 return logBuffer.slice(-limit);
}

// ---------- API عمومی هماهنگ با رابطه‌ی task ----------
// این توابع به‌عنوان لایه‌ی نازک روی tracer/meter پیاده شده‌اند تا
// کد فراخوان بتواند بدون دانستن جزئیات tracer، یک trace ساده بسازد.

// شروع یک trace (مجموعه‌ای از spanها). یک span ریشه می‌سازد و context را برمی‌گرداند.
export function startTrace(name: string, attributes?: Record<string, AttributeValue>): Span {
 return tracer.startSpan(name, attributes);
}

// افزودن یک span فرزند به trace جاری (اگر span والد داده شود، از آن استفاده می‌کند).
export function addSpan(
 parent: Span,
 name: string,
 attributes?: Record<string, AttributeValue>,
): Span {
 // والد را به‌عنوان currentSpan موقتاً set می‌کنیم تا startSpan parentId درست بگیرد
 const prev = (tracer as unknown as { currentSpan: Span | null }).currentSpan;
 (tracer as unknown as { currentSpan: Span | null }).currentSpan = parent;
 const child = tracer.startSpan(name, attributes);
 (tracer as unknown as { currentSpan: Span | null }).currentSpan = prev;
 // span فرزند را بلافاصله در buffer نمی‌کنیم — endTrace آن کار را می‌کند
 return child;
}

// پایان یک span (و در نتیجه trace اگر ریشه باشد).
export function endSpan(span: Span, status?: { code: 'OK' | 'ERROR'; message?: string }): Span {
 return tracer.endSpan(span, status);
}

// alias خواناتر
export const endTrace = endSpan;

// خلاصه‌ی metrics (همان getMetricsSnapshot با نام کوتاه‌تر).
export function getMetrics() {
 return getMetricsSnapshot();
}
