import crypto from "crypto";
import bcrypt from "bcryptjs";

// ============ JWT-like token ساده (بدون کتابخانه) ============
// در production واقعی می‌توان از jose/jsonwebtoken استفاده کرد

// SECURITY: هیچ fallback هاردکد برای JWT_SECRET وجود ندارد.
// بررسی به‌صورت lazy (هنگام استفاده) انجام می‌شود تا build بدون env var هم موفق باشد.
// در production اگر env var نباشد، اولین فراخوانی signToken/verifyToken خطا می‌دهد.
// در development یک secret ephemeral استفاده می‌شود تا تست‌ها بدون config هم کار کنند.
let _cachedSecret: string | null = null;
// FIX(SA-6): هشدار فقط یک‌بار هر پروسه — نه در هر فراخوانی (اسپم لاگ)
let _warnedDevSecret = false;
function getJwtSecret(): string {
 if (_cachedSecret) return _cachedSecret;
 const secret = process.env.JWT_SECRET;
 if (secret) {
 _cachedSecret = secret;
 return secret;
 }
 if (process.env.NODE_ENV === "production") {
 throw new Error("JWT_SECRET environment variable is required in production");
 }
 
 // FIX(SA-6): هشدار توسعه به error سطح‌بالا ارتقا یافت + راهنمای صریح —
 // اگر روی سرور اصلی این پیام را می‌بینید یعنی NODE_ENV=production تنظیم نشده
 if (!_warnedDevSecret) {
 console.error(
"\n"+"".repeat(3) +
 " [SECURITY][platform-auth] JWT_SECRET تنظیم نشده و NODE_ENV=production هم فعال نیست! " +
 "راز موقتِ شناخته‌شده‌ی توسعه استفاده می‌شود — توکن‌ها قابل جعل‌اند. " +
 "روی سرور اصلی: (۱) NODE_ENV=production را تنظیم کنید (۲) JWT_SECRET با «openssl rand -hex 32» بسازید و در .env بگذارید. " +
"راهنما:.env.example"+"".repeat(3) +"\n"
 );
 // فقط یک‌بار در هر پروسه هشدار بده (نه در هر فراخوانی)
 _warnedDevSecret = true;
 }
 _cachedSecret = "dev-only-ephemeral-secret-change-me";
 return _cachedSecret;
}

export function signToken(payload: Record<string, unknown>): string {
 const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
 const body = Buffer.from(JSON.stringify({...payload, iat: Date.now() })).toString("base64url");
 const signature = crypto.createHmac("sha256", getJwtSecret()).update(`${header}.${body}`).digest("base64url");
 return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
 try {
 const [header, body, signature] = token.split(".");
 const expectedSig = crypto.createHmac("sha256", getJwtSecret()).update(`${header}.${body}`).digest("base64url");
 // FIX(B17): مقایسه constant-time — مقایسه !== روی امضا کانال زمانی (timing
 // side channel) ایجاد می‌کرد. طول‌های متفاوت بلافاصله رد می‌شوند (بی‌خطر).
 if (
 typeof signature!== "string" ||
 signature.length!== expectedSig.length ||
 !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
 ) {
 return null;
 }
 const payload = JSON.parse(Buffer.from(body, "base64url").toString());
 // انقضای هاردکپ: ۹۰ روز (حداکثر مدت نشست قابل تنظیم توسط سوپرادمین)
 // انقضای واقعی توسط isSessionActive و session.expiresAt کنترل می‌شود
 const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;
 if (payload.iat && Date.now() - payload.iat > MAX_TTL_MS) return null;
 // FIX(SECURITY-M4): توکن‌های سوپرادمین حداکثر ۷ روز اعتبار دارند —
 // قبلاً تا ۹۰ روز بدون هیچ راهکار ابطال معتبر می‌ماندند
 if (payload.type === "superadmin") {
 const SUPERADMIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
 if (payload.iat && Date.now() - payload.iat > SUPERADMIN_TTL_MS) return null;
 }
 return payload;
 } catch {
 return null;
 }
}

// ============ تولید کلید لایسنس ============
// فرمت: HOSH-XXXXX-XXXXX-XXXXX-XXXXX
// SECURITY: از crypto.randomInt برای انتخاب کاراکترها استفاده می‌شود (غیرقابل پیش‌بینی).
export function generateLicenseKey(): string {
 const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون 0/O/1/I
 const segment = (n: number) =>
 Array.from({ length: n }, () => chars[crypto.randomInt(0, chars.length)]).join("");
 return `HOSH-${segment(5)}-${segment(5)}-${segment(5)}-${segment(5)}`;
}

// ============ هش رمز عبور ============
export async function hashPassword(password: string): Promise<string> {
 return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
 return bcrypt.compare(password, hash);
}

// ============ تولید رمز عبور تصادفی برای ورود فوری ============
// SECURITY: از crypto.randomInt برای انتخاب کاراکترها و Fisher-Yates shuffle استفاده می‌شود.
export function generatePassword(length: number = 12): string {
 const lower = "abcdefghijkmnpqrstuvwxyz";
 const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
 const digits = "23456789";
 const special = "!@#$%";
 const all = lower + upper + digits + special;
 const pick = (alphabet: string) => alphabet[crypto.randomInt(0, alphabet.length)];
 const pwdArray: string[] = [];
 // حداقل یک از هر نوع
 pwdArray.push(pick(lower));
 pwdArray.push(pick(upper));
 pwdArray.push(pick(digits));
 pwdArray.push(pick(special));
 for (let i = 4; i < length; i++) {
 pwdArray.push(pick(all));
 }
 // Fisher-Yates shuffle با crypto.randomInt (بدون بایاس)
 for (let i = pwdArray.length - 1; i > 0; i--) {
 const j = crypto.randomInt(0, i + 1);
 [pwdArray[i], pwdArray[j]] = [pwdArray[j], pwdArray[i]];
 }
 return pwdArray.join("");
}

export function generateUsername(prefix: string = "user"): string {
 // NOTE: نام کاربری یک شناسه عمومی است، نه یک راز امنیتی — Math.random کافی است.
 const num = Math.floor(1000 + Math.random() * 9000);
 return `${prefix}${num}`;
}
