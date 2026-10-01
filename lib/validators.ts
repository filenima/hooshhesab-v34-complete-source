/**
 * lib/validators.ts — Iranian-specific input validators for هوش
 *
 * شامل اعتبارسنجی‌های:
 * - تلفن همراه ایرانی
 * - کد ملی (کد ملی ۱۰ رقمی با رقم کنترل)
 * - کد اقتصادی (۱۱-۱۲ رقمی)
 * - کد پستی ایرانی (۱۰ رقمی)
 * - ایمیل
 * - مبلغ/قیمت (عدد مثبت)
 * - بازه تاریخ
 * - پارامترهای صفحه‌بندی
 * - پاک‌سازی کوئری جستجو (جلوگیری از SQL injection)
 *
 * FIX(3b-بیگ‌۱۰): این ماژول قبلاً dead code بود (هیچ route‌ای importش نمی‌کرد) —
 * حالا در parties و products (و invoices برای صفحه‌بندی) استفاده می‌شود.
 */

import { hashPII } from "./crypto";

// ============ Normalization Helpers ============

/** تبدیل ارقام فارسی/عربی به انگلیسی */
function normalizeDigits(value: string): string {
 return value
.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** حذف جداکننده‌ها و فاصله‌ها */
function cleanSeparators(value: string): string {
 return value.replace(/[\s\-(),،.]/g, "");
}

// ============ Validators ============

/**
 * نرمال‌سازی کد ملی — ارقام فارسی/عربی → انگلیسی + حذف جداکننده‌ها.
 * FIX(3b-بیگ‌۱۰): داده‌های هلو/سپیدار ارقام فارسی دارند؛ قبل از ذخیره نرمال می‌شوند.
 * @returns رشتهٔ فقط-رقمی یا null اگر خالی بود
 */
export function normalizeNationalIdDigits(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== "string") return null;
  const normalized = cleanSeparators(normalizeDigits(value));
  return normalized || null;
}

/**
 * ایندکس کور (blind index) کد ملی — SHA-256 salted از کد ملیِ نرمال‌شده.
 * FIX(3b-بیگ‌۸): nationalId با AES-GCM (IV تصادفی) رمز می‌شود و جستجوی
 * contains هرگز match نمی‌شود؛ این هشِ deterministic در ستون
 * Party.nationalIdIndex ذخیره و برای جستجو/تطبیق استفاده می‌شود.
 * @returns هکس ۶۴ کاراکتری یا null اگر ورودی خالی بود
 */
export function nationalIdBlindIndex(
  value: string | null | undefined
): string | null {
  const normalized = normalizeNationalIdDigits(value);
  if (!normalized) return null;
  return hashPII(normalized);
}

/**
 * اعتبارسنجی تلفن همراه ایرانی.
 * فرمت‌های پذیرفته‌شده:
 * 09123456789, 9123456789, +989123456789, 989123456789
 *
 * @returns true اگر معتبر باشد
 */
export function isValidPersianPhone(phone: string): boolean {
 if (!phone || typeof phone!== "string") return false;
 const clean = cleanSeparators(normalizeDigits(phone));
 return /^(?:\+98|0)?9\d{9}$/.test(clean);
}

/**
 * استخراج شماره استاندارد شده (09123456789)
 * @returns شماره استاندارد یا null اگر نامعتبر
 */
export function normalizePersianPhone(phone: string): string | null {
 if (!isValidPersianPhone(phone)) return null;
 const clean = cleanSeparators(normalizeDigits(phone));
 // تبدیل به فرمت 09XXXXXXXXX
 if (clean.startsWith("+98")) return "0" + clean.slice(3);
 if (clean.startsWith("98")) return "0" + clean.slice(2);
 if (clean.startsWith("0")) return clean;
 return "0" + clean;
}

/**
 * اعتبارسنجی کد ملی ایرانی — الگوریتم استاندارد ۱۰ رقمی با رقم کنترل.
 *
 * @example
 * isValidNationalId("0078547866"); // true
 * isValidNationalId("1234567890"); // false
 */
export function isValidNationalId(id: string): boolean {
 if (!id || typeof id!== "string") return false;
 const normalized = cleanSeparators(normalizeDigits(id));
 if (!/^\d{10}$/.test(normalized)) return false;

 // همه ارقام یکسان نامعتبر
 if (/^(\d)\1{9}$/.test(normalized)) return false;

 const digits = normalized.split("").map(Number);
 const check = digits[9];
 let sum = 0;
 for (let i = 0; i < 9; i++) {
 sum += digits[i] * (10 - i);
 }
 const remainder = sum % 11;
 const expected = remainder < 2? remainder: 11 - remainder;
 return expected === check;
}

/**
 * اعتبارسنجی کد اقتصادی ایرانی — معمولاً ۱۱ یا ۱۲ رقم.
 * برخی منابع ۱۱ رقمی و برخی ۱۲ رقمی را معتبر می‌شمارند.
 */
export function isValidEconomicCode(code: string): boolean {
 if (!code || typeof code!== "string") return false;
 const normalized = cleanSeparators(normalizeDigits(code));
 return /^\d{11,12}$/.test(normalized);
}

/**
 * اعتبارسنجی کد پستی ایرانی — ۱۰ رقمی (یا ۵+۵ با فاصله).
 * الگوریتم ساده: فقط بررسی فرمت ۱۰ رقمی.
 */
export function isValidPostalCode(code: string): boolean {
 if (!code || typeof code!== "string") return false;
 const normalized = cleanSeparators(normalizeDigits(code));
 // کد پستی ایرانی ۱۰ رقمی است — نمی‌تواند با ۰ شروع شود
 if (!/^\d{10}$/.test(normalized)) return false;
 if (normalized[0] === "0") return false;
 return true;
}

/**
 * اعتبارسنجی ایمیل — فرمت استاندارد RFC ساده.
 */
export function isValidEmail(email: string): boolean {
 if (!email || typeof email!== "string") return false;
 return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * اعتبارسنجی مبلغ/قیمت — عدد مثبت (یا صفر).
 *
 * @param value مقدار برای بررسی
 * @param allowZero آیا صفر مجاز است؟ (پیش‌فرض: بله)
 * @param maxValue حداکثر مجاز (اختیاری)
 */
export function isValidAmount(
 value: unknown,
 allowZero = true,
 maxValue?: number
): boolean {
 if (value === undefined || value === null) return false;

 let num: number;
 if (typeof value === "number") {
 num = value;
 } else if (typeof value === "string") {
 const normalized = normalizeDigits(cleanSeparators(value));
 num = Number(normalized);
 } else if (typeof value === "bigint") {
 num = Number(value);
 } else {
 return false;
 }

 if (!Number.isFinite(num)) return false;
 if (!allowZero && num <= 0) return false;
 if (allowZero && num < 0) return false;
 if (maxValue!== undefined && num > maxValue) return false;

 return true;
}

/**
 * تبدیل مقدار ورودی به عدد (پشتیبانی از ارقام فارسی و جداکننده‌ها)
 * @returns عدد یا null اگر نامعتبر
 */
export function parseAmount(value: unknown): number | null {
 if (value === undefined || value === null) return null;
 if (typeof value === "number") return Number.isFinite(value)? value: null;
 if (typeof value === "bigint") return Number(value);
 if (typeof value === "string") {
 const normalized = normalizeDigits(cleanSeparators(value));
 const num = Number(normalized);
 return Number.isFinite(num)? num: null;
 }
 return null;
}

/**
 * اعتبارسنجی بازه تاریخ.
 *
 * @param fromDate تاریخ شروع (ISO string یا Date)
 * @param toDate تاریخ پایان (ISO string یا Date)
 * @returns true اگر بازه معتبر باشد (from <= to)
 */
export function isValidDateRange(
 fromDate: string | Date | undefined,
 toDate: string | Date | undefined
): boolean {
 if (!fromDate &&!toDate) return true; // هر دو خالی = معتبر

 const from = fromDate? new Date(fromDate): null;
 const to = toDate? new Date(toDate): null;

 if (from && isNaN(from.getTime())) return false;
 if (to && isNaN(to.getTime())) return false;

 // اگر هر دو وجود دارند، from باید <= to باشد
 if (from && to && from > to) return false;

 return true;
}

/**
 * پاک‌سازی و اعتبارسنجی پارامترهای صفحه‌بندی.
 *
 * @param limit حداکثر آیتم‌ها در هر صفحه
 * @param offset شروع از آیتم شماره
 * @param maxLimit حداکثر مجاز برای limit (پیش‌فرض: ۲۰۰)
 * @param defaultLimit مقدار پیش‌فرض limit (پیش‌فرض: ۵۰)
 */
export function sanitizePagination(
 limit: unknown,
 offset: unknown,
 maxLimit = 200,
 defaultLimit = 50
): { limit: number; offset: number } {
 let safeLimit = defaultLimit;
 let safeOffset = 0;

 if (typeof limit === "number") {
 safeLimit = Math.min(Math.max(1, limit), maxLimit);
 } else if (typeof limit === "string") {
 const parsed = Number(normalizeDigits(limit));
 if (Number.isFinite(parsed) && parsed > 0) {
 safeLimit = Math.min(parsed, maxLimit);
 }
 }

 if (typeof offset === "number") {
 safeOffset = Math.max(0, offset);
 } else if (typeof offset === "string") {
 const parsed = Number(normalizeDigits(offset));
 if (Number.isFinite(parsed) && parsed >= 0) {
 safeOffset = parsed;
 }
 }

 return { limit: safeLimit, offset: safeOffset };
}

/**
 * پاک‌سازی کوئری جستجو — جلوگیری از SQL injection و الگوهای مخرب.
 *
 * - حذف کاراکترهای خاص SQL (% _ ; ' " --)
 * - حذف الگوهای SQL injection رایج
 * - محدود کردن طول (حداکثر ۲۰۰ کاراکتر)
 * - نرمال‌سازی فاصله‌ها
 *
 * @returns کوئری پاک‌شده یا null اگر خالی باشد
 */
export function sanitizeSearchQuery(query: string | null | undefined): string | null {
 if (!query || typeof query!== "string") return null;

 let sanitized = query.trim();

 // محدود کردن طول
 if (sanitized.length > 200) {
 sanitized = sanitized.slice(0, 200);
 }

 // حذف کاراکترهای خطرناک SQL
 sanitized = sanitized
.replace(/['";\\]/g, "") // حذف نقل‌قول، سمی‌کالن، بک‌اسلش
.replace(/--/g, "") // حذف SQL comment
.replace(/\/\*/g, "") // حذف SQL block comment start
.replace(/\*\//g, "") // حذف SQL block comment end
.replace(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\b/gi, "")
.replace(/%/g, "") // حذف LIKE wildcard
.replace(/_/g, " "); // تبدیل LIKE wildcard به فاصله

 // نرمال‌سازی فاصله‌ها
 sanitized = sanitized.replace(/\s+/g, " ").trim();

 return sanitized || null;
}

/**
 * اعتبارسنجی شماره شبا (IRAN IBAN).
 * فرمت: IR + 24 رقم
 */
export function isValidIban(iban: string): boolean {
 if (!iban || typeof iban!== "string") return false;
 const clean = cleanSeparators(normalizeDigits(iban)).toUpperCase();
 // جایگذاری IR به انتهای عدد برای محاسبه MOD-97
 if (!/^IR\d{24}$/.test(clean)) return false;
 const rearranged = clean.slice(4) + clean.slice(0, 4);
 const numeric = rearranged.replace(/[A-Z]/g, (c) =>
 String(c.charCodeAt(0) - 55)
 );
 let remainder = BigInt(0);
 const TEN = BigInt(10);
 const NINETY_SEVEN = BigInt(97);
 for (const digit of numeric) {
 remainder = (remainder * TEN + BigInt(digit.charCodeAt(0) - 48)) % NINETY_SEVEN;
 }
 return remainder === BigInt(1);
}

/**
 * اعتبارسنجی شماره کارت بانکی ایرانی — ۱۶ رقمی با الگوریتم Luhn.
 */
export function isValidBankCard(card: string): boolean {
 if (!card || typeof card!== "string") return false;
 const normalized = cleanSeparators(normalizeDigits(card));
 if (!/^\d{16}$/.test(normalized)) return false;

 // الگوریتم Luhn
 let sum = 0;
 for (let i = 0; i < 16; i++) {
 let digit = Number(normalized[i]);
 if (i % 2 === 0) {
 digit *= 2;
 if (digit > 9) digit -= 9;
 }
 sum += digit;
 }
 return sum % 10 === 0;
}

/**
 * ترکیب تمام اعتبارسنجی‌ها برای داده‌های طرف‌حساب ایرانی.
 *
 * @returns آبجکت شامل فیلدهای معتبر و خطاها
 */
export function validatePartyData(data: {
 phone?: string;
 nationalId?: string;
 economicCode?: string;
 postalCode?: string;
 email?: string;
}): { valid: boolean; errors: Record<string, string> } {
 const errors: Record<string, string> = {};

 if (data.phone &&!isValidPersianPhone(data.phone)) {
 errors.phone = "شماره تلفن همراه نامعتبر است";
 }
 if (data.nationalId &&!isValidNationalId(data.nationalId)) {
 errors.nationalId = "کد ملی نامعتبر است";
 }
 if (data.economicCode &&!isValidEconomicCode(data.economicCode)) {
 errors.economicCode = "کد اقتصادی نامعتبر است";
 }
 if (data.postalCode &&!isValidPostalCode(data.postalCode)) {
 errors.postalCode = "کد پستی نامعتبر است";
 }
 if (data.email &&!isValidEmail(data.email)) {
 errors.email = "ایمیل نامعتبر است";
 }

 return {
 valid: Object.keys(errors).length === 0,
 errors,
 };
}
