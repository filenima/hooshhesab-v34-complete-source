/**
 * lib/ticket-attachments.ts — ابزار مشترک پیوست‌های تصویری تیکت پشتیبانی
 *
 * ساختار ذخیره‌شده در TicketMessage.attachments (رشته JSON):
 *   [{ url: "/uploads/ticket-xxx.png", name: "name.png", size: 12345, type: "image/png" }]
 */

export interface TicketAttachment {
 url: string;
 name: string;
 size: number;
 type: string;
}

const MAX_ATTACHMENTS = 5;
const MAX_SIZE = 5 * 1024 * 1024; // ۵ مگابایت
const URL_PREFIX = "/uploads/ticket-";

/**
 * اعتبارسنجی و پاکسازی آرایه‌ی attachments دریافتی از کلاینت.
 * ورودی نامعتبر → خروجی آرایه‌ی امن (احتمالاً خالی).
 */
export function sanitizeAttachments(raw: unknown): TicketAttachment[] {
 if (!Array.isArray(raw)) return [];
 const out: TicketAttachment[] = [];
 for (const item of raw.slice(0, MAX_ATTACHMENTS)) {
 if (!item || typeof item!== "object") continue;
 const a = item as Record<string, unknown>;
 const url = typeof a.url === "string"? a.url: "";
 const name = typeof a.name === "string"? a.name: "";
 const size = Number(a.size);
 const type = typeof a.type === "string"? a.type.toLowerCase(): "";
 if (
!url.startsWith(URL_PREFIX) || // فقط فایل‌های آپلودشده از مسیر تیکت
typeof name!== "string" ||
 name.length > 100 ||
!Number.isFinite(size) ||
 size < 0 ||
 size > MAX_SIZE ||
!type.startsWith("image/")
 ) {
 continue;
 }
 // URL نباید مسیر نسبی/خطرناک داشته باشد
 if (url.includes("..") || url.includes("\\") || /[^a-zA-Z0-9\-._/]/.test(url)) {
 continue;
 }
 out.push({ url, name, size, type });
 }
 return out.slice(0, MAX_ATTACHMENTS);
}

/** رشته‌ی JSON امن برای ذخیره در دیتابیس (null اگر خالی) */
export function serializeAttachments(list: TicketAttachment[]): string | null {
 if (!list.length) return null;
 return JSON.stringify(list);
}

/** پارس امن رشته‌ی JSON ذخیره‌شده → آرایه (خطا/خالی → []) */
export function parseAttachments(json: string | null | undefined): TicketAttachment[] {
 if (!json) return [];
 try {
 const parsed = JSON.parse(json);
 if (!Array.isArray(parsed)) return [];
 return parsed.filter(
 (a): a is TicketAttachment =>
 a &&
 typeof a === "object" &&
 typeof a.url === "string" &&
 typeof a.name === "string"
 );
 } catch {
 return [];
 }
}
