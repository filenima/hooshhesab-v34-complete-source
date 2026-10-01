/**
 * اعتبارسنجی ایمیل — کاملاً client-safe (بدون وابستگی سروری).
 *
 * FIX (ريگرession 3-e): دیالوگ ارسال فاکتور (email-invoice-dialog.tsx — کامپوننت کلاینت)
 * قبلاً isValidEmail را مستقیم از lib/email-sender (دارای nodemailer فقط-سروری) می‌گرفت؛
 * زنجیره import باعث ورود nodemailer به باندل مرورگر و خطای «Module not found: tls» و
 * کرش کامل صفحه (۵۰۰) می‌شد. تابع اینجا قرار گرفت تا هر دو سمت سرور و کلاینت
 * بدون کشتن باندل از آن استفاده کنند.
 */

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
