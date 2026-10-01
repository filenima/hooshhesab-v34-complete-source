// ============ هوش — اتوبوس پخش رخدادهای ممیزی (Task 10) ============
// این فایل فقط سمت سرور است (server-side only) — از هیچ کلاینتی import نشود.
//
// پس از هر `db.auditLog.create` موفق در اپ اصلی، رویداد به‌صورت
// fire-and-forget به mini-service پخش زنده (audit-stream-service روی :3034)
// POST می‌شود تا سوپرادمین‌های متصل بلافاصله رخداد را در تب
// «گزارش زندهٔ رخدادها» ببینند.
//
// امنیت:در production حتماً AUDIT_STREAM_TOKEN باید در env ست شود —
// مقدار پیش‌فرض «dev-internal-audit-token» فقط برای محیط توسعه است.

/** شکل رویداد ممیزی که پخش می‌شود — هم‌ساختار رکورد AuditLog در Prisma */
export interface AuditBusEvent {
  id?: string;
  tenantId: string;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string | null;
  changes?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string | Date;
}

const AUDIT_STREAM_URL =
  process.env.AUDIT_STREAM_URL || "http://127.0.0.1:3034/emit";

const AUDIT_STREAM_TOKEN =
  process.env.AUDIT_STREAM_TOKEN || "dev-internal-audit-token";

/** سقف انتظار برای POST پخش — بعد از آن abort می‌شود تا درخواست اصلی معطل نماند */
const EMIT_TIMEOUT_MS = 1_500;

/**
 * emitAuditEvent — پخش fire-and-forget یک رخداد ممیزی به سوپرادمین‌های آنلاین.
 *
 * هرگز throw نمی‌کند (همه‌ی خطاها بی‌صدا بلعیده می‌شوند) و هرگز جریان اصلی
 * درخواست را مسدود نمی‌کند: تایم‌اوت ۱.۵ ثانیه‌ای و بدون await از سوی فراخوان.
 */
export function emitAuditEvent(event: AuditBusEvent): void {
  void (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMIT_TIMEOUT_MS);
    try {
      const body = JSON.stringify({
        ...event,
        createdAt:
          event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : event.createdAt ?? new Date().toISOString(),
      });
      await fetch(AUDIT_STREAM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": AUDIT_STREAM_TOKEN,
        },
        body,
        signal: controller.signal,
        // کش نشود — همیشه مستقیم به سرویس برود
        cache: "no-store",
      });
    } catch {
      // سرویس پخش در دسترس نیست یا timeout شد — بی‌صدا نادیده گرفته می‌شود؛
      // رخداد همان‌طور در دیتابیس (AuditLog) ثبت شده و از دست نمی‌رود.
    } finally {
      clearTimeout(timer);
    }
  })();
}
