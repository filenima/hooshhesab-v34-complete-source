/**
 * ============ lib/sanitize-html.ts ============
 *
 * پاک‌سازی HTML برای رندر ایمن داخل dangerouslySetInnerHTML.
 *
 * FIX(SEC-M3): قالب‌های سند/ایمیل که کاربر tenant می‌نویسد، قبلاً بدون
 * پاک‌سازی در «پیش‌نمایش» رندر می‌شدند → stored-XSS بین کاربران یک سازمان
 * (سرقت توکن از localStorage). حالا همهٔ رندرهای pre-preview از این تابع
 * رد می‌شوند.
 *
 * توجه: این پاک‌سازِ دفاع‌عمقی است (حذف تگ‌های خطرناک + رویدادهای on* +
 * javascript: + data: خطرناک). برای محتوای کاملاً نامطمئن، رندر داخل
 * iframe سندباکس‌شده (sandbox="") توصیه می‌شود.
 */

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return (
    html
      // تگ‌های خطرناک به‌صورت جفتی (باز و بسته)
      .replace(
        /<\s*(script|iframe|object|embed|form|input|link|meta|base|svg|math|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
        ""
      )
      // تگ‌های خطرناک خودبسته یا بدون بسته
      .replace(
        /<\s*(script|iframe|object|embed|form|input|link|meta|base)\b[^>]*\/?>/gi,
        ""
      )
      // همهٔ اتریبیوت‌های رویدادی (onclick, onerror, onload, …)
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // URI های خطرناک در href/src/action/formaction
      .replace(
        /\s(href|src|action|formaction|xlink:href)\s*=\s*(?:"\s*(javascript|data|vbscript)\s*:[^"]*"|'\s*(javascript|data|vbscript)\s*:[^']*'|(javascript|data|vbscript)\s*:[^\s>]*)/gi,
        ""
      )
      // javascript: بدون quotes
      .replace(/javascript\s*:/gi, "")
      // style با expression/url(javascript (IE قدیمی — دفاع اضافی)
      .replace(/expression\s*\(/gi, "")
  );
}

export default sanitizeHtml;
