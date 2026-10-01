// ============ Database Field Encryption (Data at Rest) ============
// رمزنگاری فیلدهای حساس پیش از ذخیره در دیتابیس و رمزگشایی هنگام خواندن.
//
// مکانیزم:
// - الگوریتم AES-256-GCM (با IV تصادفی و AuthTag)
// - کلید از متغیر محیطی ENCRYPTION_KEY خوانده می‌شود
// - خروجی encrypt در فرمت iv:authTag:ciphertext (همگی hex)
// - اگر متن رمزنگاری‌نشده (plain) عبور داده شود، در رمزگشایی همان
// متن اصلی برمی‌گردد تا migration تدریجی ممکن شود.
//
// فیلدهایی که باید رمزنگاری شوند:
// - User.nationalId — شناسه ملی کاربر/شرکت
// - Party.nationalId — کد ملی طرف‌حساب
// - BankAccount.cardNumber — شماره کارت بانکی
// - BankAccount.shaba — شماره شبا
// - (در آینده) User.phone, Party.mobile — شماره تماس
//
// الگوی استفاده در API routeها:
// const user = await db.user.create({
// data: {...other, nationalId: encryptField(nationalId) },
// });
// const decrypted = decryptField(user.nationalId || "");
//
// برای migration:
// 1. فیلد جدید با پسوند `_enc` اضافه کنید (مثلاً nationalIdEnc)
// 2. در هر read، اگر فیلد قدیمی پر است، آن را رمزنگاری کرده و در _enc ذخیره کنید
// 3. پس از migration کامل، فیلد قدیمی را حذف کنید
//
// توجه: SQLite رشته‌های طولانی را به‌خوبی ذخیره می‌کند، اما برای Postgres
// طول فیلد را متناسب با طول ciphertext تنظیم کنید (تقریباً ۲ برابر plaintext).

import { encrypt, decrypt } from "./crypto";

/**
 * رمزنگاری یک فیلد حساس.
 *
 * اگر مقدار خالی یا null باشد، همان مقدار برمی‌گردد.
 * اگر مقدار از قبل رمزنگاری‌شده باشد (شامل ":" با فرمت iv:authTag:cipher)،
 * دوباره رمزنگاری نمی‌شود تا از double-encryption جلوگیری شود.
 *
 * @param value مقدار plain text
 * @returns متن رمزنگاری‌شده با فرمت iv:authTag:ciphertext
 */
export function encryptField(value: string | null | undefined): string | null {
 if (value === null || value === undefined || value === "") return null;

 // اگر به‌نظر می‌رسد از قبل رمزنگاری‌شده است (۳ بخش hex با ":")، آن را برگردان
 // این یک heuristic ساده است — در production بهتر است فیلد مارکر جداگانه داشته باشید.
 if (looksEncrypted(value)) {
 return value;
 }

 try {
 return encrypt(value);
 } catch (err) {
 // در صورت خطا، مقدار اصلی را برگردان تا داده از دست نرود
 console.error("[db-encryption] encryptField failed — returning plain value:", err);
 return value;
 }
}

/**
 * رمزگشایی یک فیلد رمزنگاری‌شده.
 *
 * اگر مقدار خالی باشد، null برمی‌گردد.
 * اگر مقدار رمزنگاری‌شده نباشد (مثلاً داده‌ی قدیمی plain)، همان مقدار
 * برمی‌گردد تا migration تدریجی پشتیبانی شود.
 *
 * @param encryptedValue متن رمزنگاری‌شده با فرمت iv:authTag:ciphertext
 * @returns مقدار plain text
 */
export function decryptField(encryptedValue: string | null | undefined): string | null {
 if (encryptedValue === null || encryptedValue === undefined || encryptedValue === "") {
 return null;
 }

 // اگر رمزنگاری‌شده نیست، همان مقدار را برگردان
 if (!looksEncrypted(encryptedValue)) {
 return encryptedValue;
 }

 try {
 return decrypt(encryptedValue);
 } catch {
 // در صورت خطا در رمزگشایی (مثلاً کلید اشتباه)، مقدار اصلی را برگردان
 return encryptedValue;
 }
}

/**
 * تشخیص اینکه آیا یک مقدار از قبل رمزنگاری‌شده است یا خیر.
 *
 * heuristic: باید ۳ بخش hex با ":" جدا شده باشد و هر بخش حداقل ۳۲ کاراکتر باشد.
 */
function looksEncrypted(value: string): boolean {
 const parts = value.split(":");
 if (parts.length!== 3) return false;
 const [iv, authTag, cipher] = parts;
 // IV: 32 hex (16 bytes)
 // AuthTag: 32 hex (16 bytes)
 // Cipher: حداقل ۳۲ hex
 return (
 /^[0-9a-f]{32}$/.test(iv) &&
 /^[0-9a-f]{32}$/.test(authTag) &&
 /^[0-9a-f]+$/.test(cipher) &&
 // FIX(3b-بیگ۴ب): قبلاً cipher باید >=32 hex بود — plaintext کوتاه‌تر از ۱۶ بایت
 // (کد ملی ۱۰ رقمی!) «رمز» تشخیص داده نمی‌شد و decryptField ciphertext خام
 // برمی‌گرداند. IV+AuthTag هرکدام ۳۲ hex سیگنال قوی فرمت‌اند؛ حداقل cipher = ۲ hex.
 cipher.length >= 2
 );
}

/**
 * رمزنگاری چند فیلد به‌صورت یکجا (مثلاً برای ساخت رکورد جدید).
 *
 * @example
 * const enc = encryptFields({ nationalId: "1234567890", cardNumber: "6037-..." });
 * // { nationalId: "iv:tag:cipher", cardNumber: "iv:tag:cipher" }
 */
export function encryptFields<T extends Record<string, string | null | undefined>>(
 fields: T
): { [K in keyof T]: string | null } {
 const result: Record<string, string | null> = {};
 for (const [key, value] of Object.entries(fields)) {
 result[key] = encryptField(value);
 }
 return result as { [K in keyof T]: string | null };
}

/**
 * رمزگشایی چند فیلد به‌صورت یکجا.
 *
 * @example
 * const dec = decryptFields({ nationalId: user.nationalId, card: account.cardNumber });
 * // { nationalId: "1234567890", card: "6037-..." }
 */
export function decryptFields<T extends Record<string, string | null | undefined>>(
 fields: T
): { [K in keyof T]: string | null } {
 const result: Record<string, string | null> = {};
 for (const [key, value] of Object.entries(fields)) {
 result[key] = decryptField(value);
 }
 return result as { [K in keyof T]: string | null };
}

/**
 * ماسک کردن بخشی از یک مقدار حساس برای نمایش (مثلاً کارت بانکی).
 * فقط ۴ رقم آخر و ۴ رقم اول نمایش داده می‌شود.
 *
 * @example maskCardNumber("6037991122334455") "6037-****-****-4455"
 */
export function maskSensitive(value: string | null | undefined): string {
 if (!value) return "";
 // حذف کاراکترهای غیر عددی
 const digits = value.replace(/\D/g, "");
 if (digits.length < 8) return "****";
 const first = digits.slice(0, 4);
 const last = digits.slice(-4);
 const middle = "*".repeat(Math.max(4, digits.length - 8));
 return `${first}${middle}${last}`;
}

/**
 * ماسک کردن شماره شبا (IR — ۲۴ رقم).
 * @example maskShaba("IR123456789012345678901234") "IR12**************************01234"
 */
export function maskShaba(shaba: string | null | undefined): string {
 if (!shaba) return "";
 if (shaba.length < 8) return "****";
 const prefix = shaba.slice(0, 4);
 const suffix = shaba.slice(-5);
 return `${prefix}${"*".repeat(Math.max(8, shaba.length - 9))}${suffix}`;
}
