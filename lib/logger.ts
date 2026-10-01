// ============ سیستم لاگ‌نویسی پیشرفته هوش ============
// ساختارمند، چندسطحی، با بافر حلقوی در حافظه و نوشتن در DB

// --- سطوح لاگ ---
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export const LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
 DEBUG: 0,
 INFO: 1,
 WARN: 2,
 ERROR: 3,
 FATAL: 4,
};

// --- دسته‌بندی لاگ ---
export type LogCategory =
 | 'AUTH'
 | 'API'
 | 'INVOICE'
 | 'MODIAN'
 | 'PAYMENT'
 | 'IMPORT'
 | 'EXPORT'
 | 'SYNC'
 | 'SECURITY'
 | 'PERFORMANCE'
 | 'SYSTEM'
 | 'USER_ACTION';

export const LOG_CATEGORIES: LogCategory[] = [
 'AUTH',
 'API',
 'INVOICE',
 'MODIAN',
 'PAYMENT',
 'IMPORT',
 'EXPORT',
 'SYNC',
 'SECURITY',
 'PERFORMANCE',
 'SYSTEM',
 'USER_ACTION',
];

// --- ساختار ورودی لاگ ---
export interface LogEntry {
 id: string;
 timestamp: Date;
 level: LogLevel;
 category: LogCategory;
 message: string;
 tenantId?: string;
 userId?: string;
 metadata?: Record<string, unknown>;
 stackTrace?: string;
 requestId?: string;
 userAgent?: string;
 ip?: string;
 path?: string;
 duration?: number; // ms
}

// --- بافر حلقوی در حافظه (آخرین ۱۰۰۰ ورودی) ---
const RING_BUFFER_SIZE = 1000;
const ringBuffer: LogEntry[] = [];
let ringBufferHead = 0;

function pushToRingBuffer(entry: LogEntry) {
 if (ringBuffer.length < RING_BUFFER_SIZE) {
 ringBuffer.push(entry);
 } else {
 ringBuffer[ringBufferHead] = entry;
 ringBufferHead = (ringBufferHead + 1) % RING_BUFFER_SIZE;
 }
}

/** خواندن تمام ورودی‌های بافر حلقوی (از قدیمی به جدید) */
export function getRingBufferEntries(): LogEntry[] {
 if (ringBuffer.length < RING_BUFFER_SIZE) {
 return [...ringBuffer];
 }
 // بافر پر شده — از head شروع کنیم تا ترتیب chronological حفظ شود
 const result: LogEntry[] = [];
 for (let i = 0; i < RING_BUFFER_SIZE; i++) {
 result.push(ringBuffer[(ringBufferHead + i) % RING_BUFFER_SIZE]);
 }
 return result;
}

/** تعداد ورودی‌های بافر */
export function getRingBufferSize(): number {
 return ringBuffer.length;
}

// --- تولید شناسه یکتا ---
let counter = 0;
function generateId(): string {
 counter = (counter + 1) % 1_000_000;
 return `log_${Date.now().toString(36)}_${counter.toString(36).padStart(6, '0')}`;
}

// --- حداقل سطح لاگ ---
let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'INFO';

export function setMinLevel(level: LogLevel) {
 minLevel = level;
}

export function getMinLevel(): LogLevel {
 return minLevel;
}

// --- زمینه‌ی جاری (tenantId, userId, requestId) ---
let currentContext: { tenantId?: string; userId?: string; requestId?: string } = {};

export function setLogContext(ctx: { tenantId?: string; userId?: string; requestId?: string }) {
 currentContext = {...currentContext,...ctx };
}

export function clearLogContext() {
 currentContext = {};
}

export function getLogContext() {
 return {...currentContext };
}

// --- ثبت لاگ در کنسول ---
function consoleLog(entry: LogEntry) {
 const { level, category, message, tenantId, userId, timestamp, metadata, stackTrace } = entry;
 const ts = timestamp.toISOString();

 if (process.env.NODE_ENV === 'production') {
 // JSON ساختارمند در پروداکشن
 const json: Record<string, unknown> = {
 ts,
 level,
 cat: category,
 msg: message,
 };
 if (tenantId) json.tid = tenantId;
 if (userId) json.uid = userId;
 if (metadata && Object.keys(metadata).length > 0) json.meta = metadata;
 if (stackTrace) json.stack = stackTrace;

 switch (level) {
 case 'DEBUG': console.debug(JSON.stringify(json)); break;
 case 'INFO': console.info(JSON.stringify(json)); break;
 case 'WARN': console.warn(JSON.stringify(json)); break;
 case 'ERROR': console.error(JSON.stringify(json)); break;
 case 'FATAL': console.error(JSON.stringify(json)); break;
 }
 } else {
 // خوانا در dev
 const prefix = `[${ts}] [${level}] [${category}]`;
 const tid = tenantId? ` tenant=${tenantId}`: '';
 const uid = userId? ` user=${userId}`: '';
 const meta = metadata? ` ${JSON.stringify(metadata)}`: '';

 switch (level) {
 case 'DEBUG': console.debug(`${prefix}${tid}${uid} ${message}${meta}`); break;
 case 'INFO': console.info(`${prefix}${tid}${uid} ${message}${meta}`); break;
 case 'WARN': console.warn(`${prefix}${tid}${uid} ${message}${meta}`); break;
 case 'ERROR': console.error(`${prefix}${tid}${uid} ${message}${meta}`); break;
 case 'FATAL': console.error(`${prefix}${tid}${uid} ${message}${meta}`); break;
 }

 if (stackTrace) {
 console.error(stackTrace);
 }
 }
}

// --- ثبت لاگ در دیتابیس (غیرهمزمان، بدون await) ---
function dbLog(entry: LogEntry) {
 // وارد کردن داینامیک تا از circular dependency جلوگیری شود
 import('@/lib/db')
.then(({ db }) =>
 db.logEntry.create({
 data: {
 id: entry.id,
 timestamp: entry.timestamp,
 level: entry.level,
 category: entry.category,
 message: entry.message,
 tenantId: entry.tenantId,
 userId: entry.userId,
 metadata: entry.metadata? JSON.stringify(entry.metadata): null,
 stackTrace: entry.stackTrace || null,
 requestId: entry.requestId || null,
 userAgent: entry.userAgent || null,
 ip: entry.ip || null,
 path: entry.path || null,
 duration: entry.duration?? null,
 },
 })
 )
.catch((err) => {
 // خطا در نوشتن DB — فقط کنسول
 console.error('[Logger] Failed to write log to DB:', err);
 });
}

// --- برداشت stack trace ---
function captureStackTrace(): string | undefined {
 const err = new Error();
 // حذف خطوط خود logger
 const lines = (err.stack || '').split('\n').filter(
 (line) =>!line.includes('lib/logger.ts') &&!line.includes('captureStackTrace')
 );
 return lines.join('\n') || undefined;
}

// --- تابع اصلی لاگ‌نویسی ---
function log(
 level: LogLevel,
 category: LogCategory,
 message: string,
 metadata?: Record<string, unknown>
): LogEntry {
 // فیلتر بر اساس حداقل سطح
 if (LOG_LEVEL_SEVERITY[level] < LOG_LEVEL_SEVERITY[minLevel]) {
 // حتی در صورت فیلتر، بافر حلقوی آپدیت نمی‌شود (عملکرد)
 const entry: LogEntry = {
 id: generateId(),
 timestamp: new Date(),
 level,
 category,
 message,
 tenantId: currentContext.tenantId,
 userId: currentContext.userId,
 requestId: currentContext.requestId,
 metadata,
 };
 return entry;
 }

 const entry: LogEntry = {
 id: generateId(),
 timestamp: new Date(),
 level,
 category,
 message,
 tenantId: currentContext.tenantId,
 userId: currentContext.userId,
 requestId: currentContext.requestId,
 metadata,
 stackTrace: level === 'ERROR' || level === 'FATAL'? captureStackTrace(): undefined,
 };

 // ۱) کنسول
 consoleLog(entry);

 // ۲) بافر حلقوی
 pushToRingBuffer(entry);

 // ۳) دیتابیس (غیرهمزمان)
 dbLog(entry);

 return entry;
}

// --- API عمومی ---
export const logger = {
 debug: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
 log('DEBUG', category, message, metadata),

 info: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
 log('INFO', category, message, metadata),

 warn: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
 log('WARN', category, message, metadata),

 error: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
 log('ERROR', category, message, metadata),

 fatal: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
 log('FATAL', category, message, metadata),

 /** لاگ مستقیم با سطح و دسته مشخص (برای middleware و غیره) */
 log,
};

// --- نام‌های فارسی دسته‌بندی ---
export const CATEGORY_LABELS_FA: Record<LogCategory, string> = {
 AUTH: 'احراز هویت',
 API: 'API',
 INVOICE: 'فاکتور',
 MODIAN: 'مودیان',
 PAYMENT: 'پرداخت',
 IMPORT: 'واردات',
 EXPORT: 'صادرکرد',
 SYNC: 'همگام‌سازی',
 SECURITY: 'امنیت',
 PERFORMANCE: 'عملکرد',
 SYSTEM: 'سیستم',
 USER_ACTION: 'عمل کاربر',
};

// --- نام‌های فارسی سطوح ---
export const LEVEL_LABELS_FA: Record<LogLevel, string> = {
 DEBUG: 'دیباگ',
 INFO: 'اطلاعات',
 WARN: 'هشدار',
 ERROR: 'خطا',
 FATAL: 'بحرانی',
};

// --- رنگ‌های سطوح برای UI ---
export const LEVEL_COLORS: Record<LogLevel, string> = {
 DEBUG: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
 INFO: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
 WARN: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
 ERROR: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
 FATAL: 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
};

export const LEVEL_DOT_COLORS: Record<LogLevel, string> = {
 DEBUG: 'bg-gray-400',
 INFO: 'bg-blue-500',
 WARN: 'bg-yellow-500',
 ERROR: 'bg-red-500',
 FATAL: 'bg-red-700',
};
