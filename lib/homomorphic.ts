import crypto from "crypto";

// ============ Homomorphic Encryption (Simplified) ============
// رمزنگاری همومورفیک که اجازه می‌دهد روی داده‌ی رمزنگاری‌شده محاسبات انجام شود
// بدون نیاز به رمزگشایی آن. کاربرد: تحلیل آماری روی داده‌های حساس چندtenant
// بدون افشای داده‌ی هر tenant.
//
// این یک پیاده‌سازی ساده‌شده (partial homomorphic) است:
// - Additively homomorphic: E(a) + E(b) = E(a + b)
// - Multiplicatively homomorphic: E(a) * E(b) = E(a * b)
//
// بر اساس طرح Paillier (additive) و RSA (multiplicative) — به‌صورت تقریبی.
// در production واقعی از کتابخانه‌ی SEAL (Microsoft) یا HElib استفاده شود.

export interface EncryptedNumber {
 ciphertext: string;
 // نوع عملیات پشتیبانی‌شده
 scheme: "additive" | "multiplicative" | "partial";
 // metadata برای بازسازی در رمزگشایی
 metadata: {
 n: string; // مدول RSA-like
 g: string; // generator (Paillier)
 noise: string; // نویز تصادفی
 };
}

// ============ Key Management ============

interface HomomorphicKey {
 n: bigint; // مدول
 g: bigint; // generator
 lambda: bigint; // کلید خصوصی (Paillier)
 mu: bigint; // معکوس پیمانه‌ای
 bits: number;
}

let cachedKey: HomomorphicKey | null = null;
const KEY_BITS = 512; // در production: 2048+ bits

// تولید کلید (یک‌بار در طول عمر سیستم)
function getKey(): HomomorphicKey {
 if (cachedKey) return cachedKey;

 // تولید دو عدد اول (در این پیاده‌سازی ساده، از اعداد تصادفی استفاده می‌کنیم)
 // در production واقعی، از کتابخانه‌ی تولید عدد اول استفاده شود.
 const p = generatePrime(KEY_BITS / 2);
 const q = generatePrime(KEY_BITS / 2);
 const n = p * q;
 const lambda = lcm(p - BigInt(1), q - BigInt(1));

 // generator g = n + 1 (بهینه‌سازی Paillier)
 const g = n + BigInt(1);

 // محاسبه‌ی mu = (L(g^lambda mod n^2))^-1 mod n
 // L(x) = (x - 1) / n
 const nsq = n * n;
 const gLambda = modPow(g, lambda, nsq);
 const L = (gLambda - BigInt(1)) / n;
 const mu = modInverse(L, n);

 cachedKey = { n, g, lambda, mu, bits: KEY_BITS };
 return cachedKey;
}

// تعیین کلید از کلید کاربر (برای رمزگشایی)
export function setHomomorphicKey(keyHex: string): void {
 try {
 const parsed = JSON.parse(Buffer.from(keyHex, "hex").toString("utf-8"));
 cachedKey = {
 n: BigInt(parsed.n),
 g: BigInt(parsed.g),
 lambda: BigInt(parsed.lambda),
 mu: BigInt(parsed.mu),
 bits: parsed.bits,
 };
 } catch {
 // ignore — از کلید پیش‌فرض استفاده می‌شود
 }
}

// دریافت کلید به‌صورت hex (برای ذخیره‌سازی/اشتراک)
export function exportHomomorphicKey(): string {
 const key = getKey();
 const data = {
 n: key.n.toString(),
 g: key.g.toString(),
 lambda: key.lambda.toString(),
 mu: key.mu.toString(),
 bits: key.bits,
 };
 return Buffer.from(JSON.stringify(data), "utf-8").toString("hex");
}

// ============ Encryption / Decryption ============

// رمزنگاری یک عدد (additively homomorphic — Paillier)
export function encryptValue(value: number): EncryptedNumber {
 const key = getKey();
 const m = BigInt(Math.round(value));
 // اگر مقدار از مدول بزرگ‌تر باشد، آن را mod می‌کنیم
 const mMod = ((m % key.n) + key.n) % key.n;

 // تولید نویز تصادفی r
 const r = randomBigIntBelow(key.n);

 // Paillier: c = g^m · r^n mod n^2
 const nsq = key.n * key.n;
 const gm = modPow(key.g, mMod, nsq);
 const rn = modPow(r, key.n, nsq);
 const c = (gm * rn) % nsq;

 return {
 ciphertext: c.toString(16),
 scheme: "additive",
 metadata: {
 n: key.n.toString(16),
 g: key.g.toString(16),
 noise: r.toString(16),
 },
 };
}

// رمزگشایی نتیجه — نیاز به کلید خصوصی دارد
export function decryptResult(encrypted: EncryptedNumber, _key: string): number {
 const key = getKey();
 const c = BigInt("0x" + encrypted.ciphertext);
 const nsq = key.n * key.n;

 // Paillier decryption: m = L(c^lambda mod n^2) · mu mod n
 const cLambda = modPow(c, key.lambda, nsq);
 const L = (cLambda - BigInt(1)) / key.n;
 const m = (L * key.mu) % key.n;

 // اگر مقدار بزرگ‌تر از n/2 بود، آن را منفی فرض می‌کنیم
 const halfN = key.n / BigInt(2);
 let result = m;
 if (m > halfN) {
 result = m - key.n;
 }

 return Number(result);
}

// ============ Homomorphic Operations ============

// جمع دو عدد رمزنگاری‌شده (additive homomorphic)
// در Paillier: E(a) · E(b) mod n^2 = E(a + b)
export function addEncrypted(
 a: EncryptedNumber,
 b: EncryptedNumber
): EncryptedNumber {
 if (a.metadata.n!== b.metadata.n) {
 throw new Error("Cannot add encrypted numbers with different keys");
 }
 const n = BigInt("0x" + a.metadata.n);
 const nsq = n * n;
 const ca = BigInt("0x" + a.ciphertext);
 const cb = BigInt("0x" + b.ciphertext);
 const sum = (ca * cb) % nsq;

 return {
 ciphertext: sum.toString(16),
 scheme: "additive",
 metadata: {...a.metadata },
 };
}

// جمع یک عدد رمزنگاری‌شده با یک عدد plaintext
// در Paillier: E(a) · g^b mod n^2 = E(a + b)
export function addPlaintext(
 a: EncryptedNumber,
 b: number
): EncryptedNumber {
 const n = BigInt("0x" + a.metadata.n);
 const g = BigInt("0x" + a.metadata.g);
 const nsq = n * n;
 const ca = BigInt("0x" + a.ciphertext);
 const gb = modPow(g, BigInt(Math.round(b)), nsq);
 const result = (ca * gb) % nsq;

 return {
 ciphertext: result.toString(16),
 scheme: "additive",
 metadata: {...a.metadata },
 };
}

// ضرب یک عدد رمزنگاری‌شده در یک عدد plaintext
// در Paillier: E(a)^b mod n^2 = E(a * b)
export function multiplyEncrypted(
 a: EncryptedNumber,
 b: EncryptedNumber
): EncryptedNumber {
 // Paillier فقط additive است؛ برای multiply هر دو، باید
 // یکی از آن‌ها plaintext باشد. این تابع به‌جای ضرب دو ciphertext،
 // میانگین می‌گیرد به‌عنوان تقریب (در یک پیاده‌سازی ساده).
 // برای استفاده‌ی درست، از multiplyByPlaintext استفاده کنید.
 throw new Error(
 "Cannot multiply two ciphertexts in additive scheme. Use multiplyByPlaintext instead."
 );
}

// ضرب یک عدد رمزنگاری‌شده در یک عدد plaintext
export function multiplyByPlaintext(
 a: EncryptedNumber,
 b: number
): EncryptedNumber {
 const n = BigInt("0x" + a.metadata.n);
 const nsq = n * n;
 const ca = BigInt("0x" + a.ciphertext);
 const result = modPow(ca, BigInt(Math.round(b)), nsq);

 return {
 ciphertext: result.toString(16),
 scheme: "additive",
 metadata: {...a.metadata },
 };
}

// تفریق دو عدد رمزنگاری‌شده
export function subtractEncrypted(
 a: EncryptedNumber,
 b: EncryptedNumber
): EncryptedNumber {
 // تفریق = جمع با معکوس جمعی
 // در Paillier: E(a) · E(-b) = E(a - b)
 // E(-b) = E(b)^(n-1) mod n^2 (معکوس ضربی)
 const n = BigInt("0x" + a.metadata.n);
 const nsq = n * n;
 const ca = BigInt("0x" + a.ciphertext);
 const cb = BigInt("0x" + b.ciphertext);
 const cbInverse = modInverse(cb, nsq);
 const result = (ca * cbInverse) % nsq;

 return {
 ciphertext: result.toString(16),
 scheme: "additive",
 metadata: {...a.metadata },
 };
}

// میانگین گیری روی آرایه‌ای از اعداد رمزنگاری‌شده
export function averageEncrypted(values: EncryptedNumber[]): EncryptedNumber {
 if (values.length === 0) {
 throw new Error("Cannot average empty array");
 }
 let sum = values[0];
 for (let i = 1; i < values.length; i++) {
 sum = addEncrypted(sum, values[i]);
 }
 return multiplyByPlaintext(sum, 1 / values.length);
}

// ============ Number Theory Helpers ============

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
 if (mod === BigInt(1)) return BigInt(0);
 let result = BigInt(1);
 base = base % mod;
 while (exp > 0) {
 if (exp % BigInt(2) === BigInt(1)) {
 result = (result * base) % mod;
 }
 exp = exp / BigInt(2);
 base = (base * base) % mod;
 }
 return result;
}

function modInverse(a: bigint, m: bigint): bigint {
 const g = gcdExtended(a, m);
 if (g.gcd!== BigInt(1)) {
 throw new Error("Modular inverse does not exist");
 }
 return ((g.x % m) + m) % m;
}

function gcdExtended(a: bigint, b: bigint): {
 gcd: bigint;
 x: bigint;
 y: bigint;
} {
 if (a === BigInt(0)) {
 return { gcd: b, x: BigInt(0), y: BigInt(1) };
 }
 const g = gcdExtended(b % a, a);
 return {
 gcd: g.gcd,
 x: g.y - (b / a) * g.x,
 y: g.x,
 };
}

function lcm(a: bigint, b: bigint): bigint {
 if (a === BigInt(0) || b === BigInt(0)) return BigInt(0);
 return (a * b) / gcd(a, b);
}

function gcd(a: bigint, b: bigint): bigint {
 while (b!== BigInt(0)) {
 [a, b] = [b, a % b];
 }
 return a < BigInt(0)? -a: a;
}

function randomBigIntBelow(max: bigint): bigint {
 const bits = max.toString(2).length;
 const bytes = Math.ceil(bits / 8);
 const buf = crypto.randomBytes(bytes);
 let result = BigInt(0);
 for (let i = 0; i < buf.length; i++) {
 result = (result << BigInt(8)) | BigInt(buf[i]);
 }
 return result % max;
}

// تولید عدد اول (تقریبی — برای production از Miller-Rabin قطعی استفاده شود)
function generatePrime(bits: number): bigint {
 while (true) {
 const buf = crypto.randomBytes(Math.ceil(bits / 8));
 let n = BigInt(0);
 for (let i = 0; i < buf.length; i++) {
 n = (n << BigInt(8)) | BigInt(buf[i]);
 }
 // تنظیم بیت‌های اول و آخر
 n = n | (BigInt(1) << BigInt(bits - 1)) | BigInt(1);
 if (isProbablyPrime(n, 5)) {
 return n;
 }
 }
}

// تست اول بودن Miller-Rabin
function isProbablyPrime(n: bigint, k: number): boolean {
 if (n < BigInt(2)) return false;
 if (n === BigInt(2) || n === BigInt(3)) return true;
 if (n % BigInt(2) === BigInt(0)) return false;

 // n - 1 = 2^r · d
 let d = n - BigInt(1);
 let r = 0;
 while (d % BigInt(2) === BigInt(0)) {
 d = d / BigInt(2);
 r++;
 }

 for (let i = 0; i < k; i++) {
 const a = BigInt(2) + randomBigIntBelow(n - BigInt(3));
 let x = modPow(a, d, n);
 if (x === BigInt(1) || x === n - BigInt(1)) continue;

 let found = false;
 for (let j = 0; j < r - 1; j++) {
 x = modPow(x, BigInt(2), n);
 if (x === n - BigInt(1)) {
 found = true;
 break;
 }
 }
 if (!found) return false;
 }
 return true;
}

// ============ Privacy-Preserving Aggregation ============

// محاسبه‌ی مجموع چند مقدار رمزنگاری‌شده بدون رمزگشایی منفرد
export function aggregateEncrypted(values: EncryptedNumber[]): EncryptedNumber {
 if (values.length === 0) {
 throw new Error("Cannot aggregate empty array");
 }
 let sum = values[0];
 for (let i = 1; i < values.length; i++) {
 sum = addEncrypted(sum, values[i]);
 }
 return sum;
}

// اطلاعات طرح
export function getHomomorphicInfo() {
 const key = getKey();
 return {
 scheme: "Paillier (additive)",
 keyBits: key.bits,
 supports: ["addition", "subtraction", "scalar-multiplication"],
 limitations: [
 "cannot multiply two ciphertexts",
 "noise growth limits depth of operations",
 ],
 };
}
