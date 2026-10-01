/**
 * event-bus.ts — رویداد محور درون‌حافظه‌ای برای هوش
 * الگوی pub/sub با قابلیت‌های: typed events، wildcard subscription، replay، DLQ
 */

type EventHandler<T = unknown> = (event: BusEvent<T>) => void | Promise<void>;

export interface BusEvent<T = unknown> {
 id: string;
 type: string;
 payload: T;
 timestamp: number;
 source?: string;
 tenantId?: string;
 correlationId?: string;
 metadata?: Record<string, unknown>;
}

interface Subscription {
 id: string;
 pattern: string; // می‌تواند wildcard باشد: 'invoice.*'
 handler: EventHandler;
 options: { priority?: number; maxRetries?: number; deadLetter?: boolean };
}

const subscribers: Subscription[] = [];
const eventHistory: BusEvent[] = [];
const deadLetterQueue: BusEvent[] = [];
const MAX_HISTORY = 1000;
const MAX_DLQ = 100;

let seq = 0;
function nextId(): string {
 seq = (seq + 1) % Number.MAX_SAFE_INTEGER;
 return `evt_${Date.now()}_${seq}`;
}

function matchPattern(pattern: string, type: string): boolean {
 if (pattern === '*') return true;
 if (pattern === type) return true;
 // پشتیبانی از wildcard: 'invoice.*' مطابقت با 'invoice.created'
 if (pattern.endsWith('.*')) {
 const prefix = pattern.slice(0, -2);
 return type === prefix || type.startsWith(prefix + '.');
 }
 // پشتیبانی از wildcard با کاما: 'invoice.paid,payment.received'
 if (pattern.includes(',')) {
 return pattern.split(',').some(p => p.trim() === type);
 }
 return false;
}

export class EventBus {
 /** انتشار یک رویداد */
 async publish<T>(type: string, payload: T, options?: Partial<Omit<BusEvent<T>, 'id' | 'type' | 'payload' | 'timestamp'>>): Promise<BusEvent<T>> {
 const event: BusEvent<T> = {
 id: nextId(),
 type,
 payload,
 timestamp: Date.now(),
 source: options?.source,
 tenantId: options?.tenantId,
 correlationId: options?.correlationId || nextId(),
 metadata: options?.metadata,
 };
 eventHistory.push(event);
 if (eventHistory.length > MAX_HISTORY) eventHistory.shift();

 // مرتب‌سازی بر اساس priority
 const matching = subscribers
.filter(s => matchPattern(s.pattern, type))
.sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0));

 // اجرای handlers به‌صورت موازی (با محدودیت retry)
 const results = await Promise.allSettled(
 matching.map(async (sub) => {
 const maxRetries = sub.options.maxRetries?? 3;
 let lastError: Error | null = null;
 for (let attempt = 0; attempt < maxRetries; attempt++) {
 try {
 await sub.handler(event);
 return;
 } catch (e) {
 lastError = e as Error;
 // exponential backoff
 if (attempt < maxRetries - 1) {
 await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
 }
 }
 }
 // اگر تمام retries ناموفق بود و DLQ فعال است
 if (sub.options.deadLetter!== false) {
 deadLetterQueue.push({...event, metadata: {...event.metadata, _error: lastError?.message, _failedSubscription: sub.id } });
 if (deadLetterQueue.length > MAX_DLQ) deadLetterQueue.shift();
 }
 throw lastError;
 })
 );

 // اگر همه‌ی handlers ناموفق بودند، log کن
 const failures = results.filter(r => r.status === 'rejected');
 if (failures.length > 0) {
 console.warn(`[event-bus] ${failures.length} از ${matching.length} handler برای رویداد "${type}" ناموفق بود`);
 }

 return event;
 }

 /** اشتراک در رویداد */
 subscribe<T = unknown>(
 pattern: string,
 handler: EventHandler<T>,
 options?: { priority?: number; maxRetries?: number; deadLetter?: boolean; id?: string }
 ): () => void {
 const sub: Subscription = {
 id: options?.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
 pattern,
 handler: handler as EventHandler,
 options: {
 priority: options?.priority?? 0,
 maxRetries: options?.maxRetries?? 3,
 deadLetter: options?.deadLetter?? true,
 },
 };
 subscribers.push(sub);
 // تابع لغو اشتراک
 return () => {
 const idx = subscribers.indexOf(sub);
 if (idx >= 0) subscribers.splice(idx, 1);
 };
 }

 /** پخش مجدد رویدادهای قبلی بر اساس نوع */
 async replay(since: number, typeFilter?: string): Promise<number> {
 const events = eventHistory.filter(
 e => e.timestamp >= since && (!typeFilter || matchPattern(typeFilter, e.type))
 );
 for (const event of events) {
 const matching = subscribers.filter(s => matchPattern(s.pattern, event.type));
 await Promise.allSettled(matching.map(s => s.handler(event)));
 }
 return events.length;
 }

 /** مشاهده‌ی رویدادهای اخیر */
 getHistory(limit = 50, typeFilter?: string): BusEvent[] {
 const filtered = typeFilter
? eventHistory.filter(e => matchPattern(typeFilter, e.type))
: eventHistory;
 return filtered.slice(-limit);
 }

 /** مشاهده‌ی صف حروف مرده */
 getDeadLetterQueue(limit = 50): BusEvent[] {
 return deadLetterQueue.slice(-limit);
 }

 /** پاک‌سازی DLQ */
 clearDeadLetterQueue(): number {
 const count = deadLetterQueue.length;
 deadLetterQueue.length = 0;
 return count;
 }

 /** تعداد اشتراک‌ها */
 getStats() {
 return {
 subscriptions: subscribers.length,
 eventsPublished: eventHistory.length,
 deadLetter: deadLetterQueue.length,
 };
 }
}

// نمونه‌ی سراسری
export const eventBus = new EventBus();

// ---------- رویدادهای آماده‌ی هوش ----------
export const HesabEvents = {
 INVOICE_CREATED: 'invoice.created',
 INVOICE_PAID: 'invoice.paid',
 INVOICE_OVERDUE: 'invoice.overdue',
 INVOICE_CANCELLED: 'invoice.cancelled',
 PARTY_CREATED: 'party.created',
 PARTY_UPDATED: 'party.updated',
 PAYMENT_RECEIVED: 'payment.received',
 PAYMENT_SENT: 'payment.sent',
 JOURNAL_POSTED: 'journal.posted',
 JOURNAL_REVERSED: 'journal.reversed',
 TAX_REPORTED: 'tax.reported',
 INVENTORY_LOW: 'inventory.low_stock',
 INVENTORY_MOVEMENT: 'inventory.movement',
 USER_INVITED: 'user.invited',
 USER_LOGIN: 'user.login',
 USER_LOGOUT: 'user.logout',
 TENANT_CREATED: 'tenant.created',
 TENANT_UPGRADED: 'tenant.upgraded',
 REPORT_GENERATED: 'report.generated',
 BUDGET_ALERT: 'budget.alert',
} as const;

// helper برای انتشار آسان
export async function publishInvoiceEvent(type: string, payload: unknown, tenantId: string) {
 return eventBus.publish(type, payload, { tenantId, source: 'accounting' });
}
