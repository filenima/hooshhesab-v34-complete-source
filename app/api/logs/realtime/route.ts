// ============ SSE — جریان لحظه‌ای لاگ‌ها ============
import { NextRequest } from 'next/server';
import { getRingBufferEntries, type LogEntry } from '@/lib/logger';
import { requireUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
 // FIX(C2): استریم SSE لاگ‌ها قبلاً بدون احراز هویت بود — هر نفر ناشناس لاگ‌های
 // زندهٔ همه tenantها را می‌دید. حالا requireUser اجباری + فیلتر اجباری tenantId
 // از نشست کاربر؛ پارامتر tenantId کلاینت نادیده گرفته می‌شود.
 const auth = await requireUser(req);
 if ('error' in auth) return auth.error;
 const sessionTenantId = auth.user.tenantId;

 const url = new URL(req.url);
 const level = url.searchParams.get('level');

 // فیلتر مشترک — همیشه tenant scoped
 const filterEntries = (entries: LogEntry[]): LogEntry[] => {
  let filtered = entries;
  if (level) {
    filtered = filtered.filter((e) => e.level === level);
  }
  filtered = filtered.filter((e) => e.tenantId === sessionTenantId);
  return filtered;
 };

 const encoder = new TextEncoder();

 const stream = new ReadableStream({
  start(controller) {
   // ارسال رویداد نگهدارنده (keep-alive) هر ۱۵ ثانیه
   const keepAlive = setInterval(() => {
    try {
     controller.enqueue(encoder.encode(': keep-alive\n\n'));
    } catch {
     clearInterval(keepAlive);
     clearInterval(pollInterval);
    }
   }, 15000);

   // ارسال آخرین لاگ‌ها هر ۵ ثانیه
   let lastSentIndex = 0;
   const pollInterval = setInterval(() => {
    try {
     const entries = getRingBufferEntries();

     // فیلتر — همیشه tenant scoped
     const filtered = filterEntries(entries);

     // فقط ورودی‌های جدید
     if (filtered.length > lastSentIndex) {
      const newEntries = filtered.slice(lastSentIndex);
      lastSentIndex = filtered.length;

      for (const entry of newEntries) {
       const data = JSON.stringify(formatEntry(entry));
       controller.enqueue(
        encoder.encode(`event: log\ndata: ${data}\n\n`)
       );
      }
     } else if (filtered.length < lastSentIndex) {
      // بافر ریست شده (ریستارت سرور)
      lastSentIndex = filtered.length;
     }
    } catch {
     clearInterval(keepAlive);
     clearInterval(pollInterval);
    }
   }, 5000);

   // ارسال وضعیت اولیه (۲۰ رویداد آخرِ همین tenant)
   const initialFiltered = filterEntries(getRingBufferEntries()).slice(-20);
   for (const entry of initialFiltered) {
    const data = JSON.stringify(formatEntry(entry));
    controller.enqueue(encoder.encode(`event: log\ndata: ${data}\n\n`));
   }
   // FIX(logic-bug): lastSentIndex قبلاً از «کلِ» entries بدون فیلتر مقدار اولیه
   // می‌گرفت در حالی که لیست فیلترشده (tenant/level) مقایسه می‌شد → تکرار یا
   // جاافتادن رویدادها. حالا از تعداد کلِ ورودی‌های «فیلترشده» مقداردهی می‌شود
   // تا رویدادهای قدیمی دوباره ارسال نشوند و هیچ رویداد جدیدی هم از دست نرود.
   lastSentIndex = filterEntries(getRingBufferEntries()).length;

   // تمیزکاری در بستن اتصال
   req.signal.addEventListener('abort', () => {
    clearInterval(keepAlive);
    clearInterval(pollInterval);
    try {
     controller.close();
    } catch {
     // بسته شده
    }
   });
  },
 });

 return new Response(stream, {
  headers: {
   'Content-Type': 'text/event-stream',
   'Cache-Control': 'no-cache, no-transform',
   Connection: 'keep-alive',
  },
 });
}

function formatEntry(entry: LogEntry) {
 return {
  id: entry.id,
  ts: entry.timestamp.toISOString(),
  level: entry.level,
  cat: entry.category,
  msg: entry.message,
  tid: entry.tenantId || null,
  uid: entry.userId || null,
  meta: entry.metadata || null,
  path: entry.path || null,
  dur: entry.duration?? null,
 };
}
