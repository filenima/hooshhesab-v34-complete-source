import { PrismaClient } from '@prisma/client'
import { recordSlowQuery } from '@/lib/slow-query-tracker'

// هوش — Prisma Client singleton
// بررسی عملکرد: query logging به‌طور پیش‌فرض غیرفعال است تا I/O و حافظه
// مصرف نشود. در صورت نیاز برای دیباگ، متغیر محیطی PRISMA_LOG=query
// را تنظیم کنید. برای ردیابی کوئری‌های کند (Slow Query Log) که در پنل
// سوپرادمین قابل مشاهده است، متغیر TRACK_SLOW_QUERIES=true را تنظیم کنید.
const enableQueryLog = process.env.PRISMA_LOG === 'query'
const trackSlowQueries = process.env.TRACK_SLOW_QUERIES === 'true'

// در حالت Slow Query Tracking از event emission برای query level استفاده
// می‌کنیم تا بتوانیم duration هر کوئری را بررسی کنیم.
const logConfig =
 enableQueryLog || trackSlowQueries
? [{ emit: 'stdout' as const, level: 'error' as const }, { emit: 'stdout' as const, level: 'warn' as const }, { emit: 'event' as const, level: 'query' as const }]
: ['error' as const, 'warn' as const]

const globalForPrisma = globalThis as unknown as {
 prisma: PrismaClient | undefined
}

export const db =
 globalForPrisma.prisma??
 new PrismaClient({
 log: [...logConfig],
 })

// در dev یک singleton در global نگه می‌داریم تا هات‌ریلود چندین کانکشن نسازد.
if (process.env.NODE_ENV!== 'production') globalForPrisma.prisma = db

// ─── Slow Query Tracking ───
// وقتی فعال باشد، Prisma برای هر کوئری یک event emits می‌کند. ما فقط
// کوئری‌های طولانی‌تر از ۱۰۰ms را در buffer ذخیره می‌کنیم.
if (trackSlowQueries) {
 try {
 ;(db as any).$on('query', (e: { query: string; duration: number; params?: string }) => {
 if (typeof e?.duration === 'number' && e.duration >= 100) {
 // تلاش برای تشخیص model و operation از روی query (heuristic)
 const queryStr = (e.query || '').toString()
 const opMatch = queryStr.match(/^(\w+)/)
 const modelMatch = queryStr.match(/"(?:defaultDb"\.)?(\w+)"/)
 recordSlowQuery({
 query: queryStr,
 duration: e.duration,
 operation: opMatch?.[1]?.toUpperCase(),
 model: modelMatch?.[1],
 params: e.params as string | undefined,
 })
 }
 })
 } catch {
 /* ignore — اگر $on در دسترس نبود، نادیده می‌گیریم */
 }
}
