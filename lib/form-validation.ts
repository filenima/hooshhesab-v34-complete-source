/* ============ form-validation.ts ============
 *
 * اعتبارسنجی فرم‌ها با پشتیبانی از:
 * - قوانین پایه: required, min, max, pattern
 * - قوانین ایرانی: email, phone, nationalId
 * - قوانین سفارشی: custom function
 *
 * @example
 * const errors = validateField("0912", { phone: true });
 * // ["فرمت تلفن همراه معتبر نیست"]
 */

export interface ValidationRule {
 required?: boolean;
 min?: number;
 max?: number;
 pattern?: RegExp;
 email?: boolean;
 phone?: boolean;
 nationalId?: boolean;
 /** پیام خطای سفارشی */
 message?: string;
 /** تابع اعتبارسنجی سفارشی — برمی‌گرداند: پیام خطا یا null */
 custom?: (value: string) => string | null;
}

export interface FieldValidation {
 value: string;
 rules: ValidationRule;
 errors: string[];
 touched: boolean;
 valid: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// تلفن همراه ایرانی: 09XXXXXXXXX یا ۹۸۹XXXXXXXXX یا +۹۸۹XXXXXXXXX
const PHONE_RE = /^(?:\+98|0)?9\d{9}$/;
// شماره ثابت ایرانی با کد شهر: 0XXXXXXXXX (۸ تا ۱۱ رقم)
const LANDLINE_RE = /^0\d{8,11}$/;

/**
 * اعتبارسنجی یک فیلد بر اساس قوانین.
 * @returns آرایه‌ای از پیام‌های خطا (خالی = معتبر)
 */
export function validateField(value: string, rules: ValidationRule): string[] {
 const errors: string[] = [];
 const v = (value?? "").trim();

 if (rules.required &&!v) {
 errors.push(rules.message?? "این فیلد الزامی است.");
 return errors;
 }

 // اگر مقدار خالی است و required نیست، بقیه قوانین را بررسی نکن
 if (!v) return errors;

 if (rules.min!= null && v.length < rules.min) {
 errors.push(
 rules.message?? `حداقل ${String(rules.min)} کاراکتر وارد کنید.`
 );
 }
 if (rules.max!= null && v.length > rules.max) {
 errors.push(
 rules.message?? `حداکثر ${String(rules.max)} کاراکتر مجاز است.`
 );
 }
 if (rules.pattern &&!rules.pattern.test(v)) {
 errors.push(rules.message?? "فرمت وارد شده معتبر نیست.");
 }
 if (rules.email &&!validateEmail(v)) {
 errors.push(rules.message?? "ایمیل معتبر نیست.");
 }
 if (rules.phone &&!validatePhone(v)) {
 errors.push(rules.message?? "فرمت تلفن همراه معتبر نیست.");
 }
 if (rules.nationalId &&!validateNationalId(v)) {
 errors.push(rules.message?? "کد ملی معتبر نیست.");
 }
 if (rules.custom) {
 const customErr = rules.custom(v);
 if (customErr) errors.push(customErr);
 }

 return errors;
}

/**
 * اعتبارسنجی کد ملی ایرانی — الگوریتم استاندارد ۱۰ رقمی با رقم کنترل.
 *
 * کد ملی ۱۰ رقمی است. رقم آخر رقم کنترل است و بر اساس وزن‌دهی ارقام ۱ تا ۹
 * اول محاسبه می‌شود: مجموع (رقم × وزن) mod 11، اگر کمتر از ۲ باشد برابر
 * خودش وگرنه 11 منهای آن.
 *
 * @example
 * validateNationalId("1234567890"); // false
 * validateNationalId("0078547866"); // true (نمونه معتبر)
 */
export function validateNationalId(id: string): boolean {
 const clean = (id?? "").replace(/[\s\-]/g, "");
 // فقط اعداد انگلیسی/فارسی
 const normalized = clean
.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
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
 * اعتبارسنجی تلفن همراه ایرانی.
 * فرمت‌های پذیرفته‌شده:
 * 09123456789
 * 9123456789
 * +989123456789
 * 989123456789
 */
export function validatePhone(phone: string): boolean {
 const clean = (phone?? "")
.replace(/[\s\-()]/g, "")
.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
 return PHONE_RE.test(clean);
}

/**
 * اعتبارسنجی تلفن ثابت ایرانی.
 */
export function validateLandline(phone: string): boolean {
 const clean = (phone?? "")
.replace(/[\s\-()]/g, "")
.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
 return LANDLINE_RE.test(clean);
}

/**
 * اعتبارسنجی ایمیل — فرمت استاندارد RFC ساده.
 */
export function validateEmail(email: string): boolean {
 const v = (email?? "").trim();
 if (!v) return false;
 return EMAIL_RE.test(v);
}

/**
 * اعتبارسنجی کد اقتصادی ایرانی — معمولاً ۱۲ رقم.
 */
export function validateEconomicCode(code: string): boolean {
 const clean = (code?? "")
.replace(/[\s\-]/g, "")
.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
 return /^\d{11,12}$/.test(clean);
}

/**
 * اعتبارسنجی شماره شبا (IRAN).
 */
export function validateIban(iban: string): boolean {
 const clean = (iban?? "")
.replace(/[\s\-]/g, "")
.toUpperCase();
 if (!/^IR\d{24}$/.test(clean)) return false;
 // الگوریتم MOD-97 استاندارد IBAN
 const rearranged = clean.slice(4) + clean.slice(0, 4);
 const numeric = rearranged.replace(/[A-Z]/g, (c) =>
 String(c.charCodeAt(0) - 55)
 );
 // BigInt برای اعداد بزرگ (با target ES2017 سازگار است چون از constructor استفاده می‌کنیم)
 let remainder = BigInt(0);
 const TEN = BigInt(10);
 const NINETY_SEVEN = BigInt(97);
 for (const digit of numeric) {
 remainder = (remainder * TEN + BigInt(digit.charCodeAt(0) - 48)) % NINETY_SEVEN;
 }
 return remainder === BigInt(1);
}
