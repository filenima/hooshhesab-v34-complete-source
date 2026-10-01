import crypto from "crypto";
import {
 generateSecret,
 generateURI,
 verifySync,
 generateSync,
} from "otplib";

// ============ TOTP (Time-based One-Time Password) ============
// مدیریت احراز هویت دو مرحله‌ای با استاندارد RFC 6238
// استفاده از otplib v13 API

// تولید secret برای TOTP (base32, 32 chars)
export function generateTwoFactorSecret(): string {
 return generateSecret({ length: 20 });
}

// ساخت otpauth:// URL برای QR code
// این URL توسط اپ‌های Authenticator (Google Authenticator, Authy,...) اسکن می‌شود
export function generateQRCodeURL(secret: string, email: string): string {
 return generateURI({
 issuer: "هوش",
 label: email,
 secret,
 algorithm: "sha1",
 digits: 6,
 period: 30,
 });
}

// تأیید کد TOTP وارد شده توسط کاربر
// otplib v13 verifySync برمی‌گرداند: { valid: boolean, delta?: number,... }
export function verifyTwoFactorToken(token: string, secret: string): boolean {
 try {
 // پاک‌سازی فاصله‌ها
 const cleanToken = token.replace(/\s/g, "");
 if (!cleanToken) return false;
 const result = verifySync({
 token: cleanToken,
 secret,
 // پذیرش کدهای ۱ گام قبل و بعد برای جبران اختلاف زمان
 epochTolerance: 1,
 });
 // result می‌تواند boolean یا { valid: boolean,... } باشد
 if (typeof result === "boolean") return result;
 if (result && typeof result === "object" && "valid" in result) {
 return Boolean((result as { valid: unknown }).valid);
 }
 return false;
 } catch {
 return false;
 }
}

// تولید کد TOTP فعلی برای یک secret (برای تست و دیباگ)
export function generateCurrentToken(secret: string): string {
 return generateSync({
 secret,
 algorithm: "sha1",
 digits: 6,
 period: 30,
 });
}

// تولید ۸ کد پشتیبان برای زمانی که کاربر به دستگاه TOTP دسترسی ندارد
// هر کد ۸ کاراکتر: حروف بزرگ + اعداد (hex)
export function generateBackupCodes(): string[] {
 const codes: string[] = [];
 for (let i = 0; i < 8; i++) {
 const bytes = crypto.randomBytes(4);
 const code = bytes.toString("hex").toUpperCase();
 codes.push(code);
 }
 return codes;
}

// هش کردن کد پشتیبان برای مقایسه امن در برابر timing attack
export function hashBackupCode(code: string): string {
 return crypto.createHash("sha256").update(code).digest("hex");
}

// بررسی کد پشتیبان وارد شده با لیست کدهای ذخیره‌شده (plain)
// کدهای ذخیره‌شده از AES-256-GCM decrypt شده‌اند و plain هستند
// برای جلوگیری از timing attack، هر دو طرف هش می‌شوند سپس با timingSafeEqual مقایسه می‌شوند
// در صورت تطابق، ایندکس کد را برمی‌گرداند تا بعداً حذف شود
export function findBackupCodeIndex(
 code: string,
 storedCodes: string[]
): number {
 const hashed = hashBackupCode(code);
 for (let i = 0; i < storedCodes.length; i++) {
 const storedHashed = hashBackupCode(storedCodes[i]);
 const bufA = Buffer.from(hashed);
 const bufB = Buffer.from(storedHashed);
 if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
 return i;
 }
 }
 return -1;
}
