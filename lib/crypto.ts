import crypto from "crypto";

// ============ AES-256-GCM Encryption ============
// برای رمزنگاری داده‌های حساس مثل کدهای پشتیبان 2FA، کلیدهای API و...

const ALGORITHM = "aes-256-gcm";

/* ============================================================
 * FIX(H6/B8): کلیدهای رمزنگاری بدون fallback عمومی در production
 * ============================================================
 * قبلاً اگر ENCRYPTION_KEY/PII_SALT در env تنظیم نشده بودند، بی‌سروصدا به
 * ثابت‌های هاردکد عمومی (موجود در سورس) fallback می‌شد — یعنی کدهای پشتیبان 2FA
 * و PII با کلید شناخته‌شده قابل بازگشایی بودند. برخلاف JWT_SECRET که در
 * production پرتاب می‌کند، این‌ها پرتاب نمی‌کردند.
 * حالا (mirror الگوی JWT_SECRET):
 * - production: نبود کلید → throw با پیام فارسی روشن (در اولین استفاده — lazy،
 *   تا build بدون env هم موفق باشد)
 * - development: مقدار پیش‌فرض + console.warn
 */
function getEncryptionKey(): string {
 const key = process.env.ENCRYPTION_KEY;
 if (!key) {
 if (process.env.NODE_ENV === "production") {
 throw new Error(
 "ENCRYPTION_KEY در محیط production تنظیم نشده است — کلید ۳۲ بایتی را در متغیرهای محیطی سرور تنظیم کنید"
 );
 }
 console.warn(
 "[crypto] ENCRYPTION_KEY تنظیم نشده است — از کلید پیش‌فرض توسعه استفاده می‌شود. " +
 "این پیام فقط در محیط توسعه/تست باید دیده شود."
 );
 return "hoshhesab-32-byte-encryption-key-!!";
 }
 return key;
}

function getPiiSalt(): string {
 const salt = process.env.PII_SALT;
 if (!salt) {
 if (process.env.NODE_ENV === "production") {
 throw new Error(
 "PII_SALT در محیط production تنظیم نشده است — برای هش امن PII این مقدار را در متغیرهای محیطی سرور تنظیم کنید"
 );
 }
 console.warn(
 "[crypto] PII_SALT تنظیم نشده است — از salt پیش‌فرض توسعه استفاده می‌شود."
 );
 return "hoshhesab-pii-salt-2024";
 }
 return salt;
}

// کلید lazy خوانده می‌شود (الگوی JWT_SECRET در platform-auth) تا build بدون env var
// هم موفق باشد؛ در production اولین استفاده بدون کلید → throw (fail-closed).
let _cachedKey: Buffer | null = null;

function getKey(): Buffer {
 if (_cachedKey) return _cachedKey;
 const buf = Buffer.from(getEncryptionKey(), "utf-8");
 // کلید کوتاه‌تر از ۳۲ بایت با صفر pad می‌شود؛ بلندتر truncate
 _cachedKey =
 buf.length < 32
? Buffer.concat([buf, Buffer.alloc(32 - buf.length, 0)])
: buf.slice(0, 32);
 return _cachedKey;
}

// رمزنگاری متن با AES-256-GCM
// خروجی: iv:authTag:encrypted (همگی hex)
export function encrypt(text: string): string {
 const iv = crypto.randomBytes(16);
 const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
 let encrypted = cipher.update(text, "utf8", "hex");
 encrypted += cipher.final("hex");
 const authTag = cipher.getAuthTag();
 return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

// رمزگشایی متن AES-256-GCM
export function decrypt(encryptedText: string): string {
 const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
 if (!ivHex ||!authTagHex ||!encrypted) {
 throw new Error("Invalid encrypted text format");
 }
 const iv = Buffer.from(ivHex, "hex");
 const authTag = Buffer.from(authTagHex, "hex");
 const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
 decipher.setAuthTag(authTag);
 let decrypted = decipher.update(encrypted, "hex", "utf8");
 decrypted += decipher.final("utf8");
 return decrypted;
}

// هش یک‌طرفه برای داده‌های PII (کد ملی، شماره تماس و...)
export function hashPII(text: string): string {
 const salt = getPiiSalt();
 return crypto.createHash("sha256").update(`${text}:${salt}`).digest("hex");
}

// رمزنگاری یک آبجکت JSON (برای ذخیره‌سازی آرایه‌ها و ساختارهای پیچیده)
export function encryptJSON(data: unknown): string {
 return encrypt(JSON.stringify(data));
}

// رمزگشایی JSON
export function decryptJSON<T = unknown>(encryptedText: string): T {
 return JSON.parse(decrypt(encryptedText)) as T;
}

// مقایسه امن برای جلوگیری از timing attack
export function safeEqual(a: string, b: string): boolean {
 const bufA = Buffer.from(a);
 const bufB = Buffer.from(b);
 if (bufA.length!== bufB.length) return false;
 return crypto.timingSafeEqual(bufA, bufB);
}
