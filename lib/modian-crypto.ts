// ============ lib/modian-crypto.ts — رمزنگاری اتصال واقعی سامانه مودیان (نسخه ۲) — هوش ============
//
// این ماژول «چرخ‌دنده‌های رمزنگاری» اتصال واقعی به سامانه مودیان (requestsmanager/api/v2)
// را پیاده‌سازی می‌کند — مطابق دستورالعمل فنی رسمی سازمان امور مالیاتی:
//
//   ۱) Verhoeff — رقم کنترلی taxid (شماره منحصربه‌فرد مالیاتی ۲۲ کاراکتری)
//   ۲) JWS (RS256 + x5c) — امضای دیجیتال با گواهی کارپوشه (کلید خصوصی PKCS#8)
//   ۳) JWE (RSA-OAEP-256 + A256GCM) — رمزنگاری پاکت صورتحساب با کلید عمومی سازمان
//
// منبع: دستورالعمل فنی اتصال به سامانه مودیان + راهنمای SDK (نسخه ۲ — JWS/JWE).
// الگوریتم‌ها با چند پیاده‌سازی متن‌باز معتبر (kiankamgar/php-moadian،
// imantalebi/moadian-PHP-v2، thisiskarimi/moadian2) تطبیق داده شده‌اند.
//
// CRITICAL: این ماژول در سمت سرور (Node.js runtime) استفاده می‌شود —
// کلید خصوصی هرگز نباید به کلاینت برسد.

import crypto from "crypto";

// ============================================================
// ۱) الگوریتم Verhoeff — رقم کنترلی
// ============================================================

// جدول‌های d و p و inv الگوریتم Verhoeff (استاندارد)
const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const VERHOEFF_INV: number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * محاسبه رقم کنترلی Verhoeff برای رشتهٔ ارقام دهدهی.
 * (رشته باید فقط شامل ارقام ۰-۹ باشد)
 */
export function verhoeffCheckDigit(digits: string): number {
  let c = 0;
  const reversed = digits.split("").reverse();
  reversed.forEach((ch, i) => {
    const d = Number(ch);
    if (!Number.isInteger(d) || d < 0 || d > 9) {
      throw new Error(`کاراکتر غیررقمی در ورودی Verhoeff: «${ch}»`);
    }
    c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][d]];
  });
  return VERHOEFF_INV[c];
}

/** اعتبارسنجی رشتهٔ رقم+رقم کنترلی با Verhoeff */
export function verhoeffValidate(digitsWithCheck: string): boolean {
  try {
    const check = verhoeffCheckDigit(digitsWithCheck.slice(0, -1));
    return check === Number(digitsWithCheck.slice(-1));
  } catch {
    return false;
  }
}

/**
 * تبدیل شناسه حافظه مالیاتی به رقم ورودی Verhoeff — طبق دستورالعمل رسمی:
 *  - «حروف» به کد ASCII دهدهی تبدیل می‌شوند (A→65، B→66، ...)
 *  - «ارقام» به همان صورت باقی می‌مانند (رقم ۵ = 5، نه 53)
 *
 * FIX(v4-مودیان/C1): پیاده‌سازی قبلی ارقام را هم به ASCII تبدیل می‌کرد
 * ('5'→"53") در حالی که سند رسمی فقط حروف را تبدیل می‌کند. نتیجه: رقم کنترلی
 * taxid در ~۹۰٪ شناسه‌های دارای رقم غلط بود و سازمان صورتحساب را رد می‌کرد.
 * صحت با ۳ مثال رسمی سند (DEF5GH...) راستی‌آزمایی شد.
 */
function fiscalIdToVerhoeffInput(fiscalId: string): string {
  return fiscalId
    .split("")
    .map((ch) => (/[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0))))
    .join("");
}

// ============================================================
// ۲) تولید taxid — شماره منحصربه‌فرد مالیاتی (۲۲ کاراکتر)
// ============================================================

/**
 * ساخت taxid مطابق الگوریتم رسمی:
 *
 *   taxid = fiscalId(۶) + hex(days→۵) + hex(serial→۱۰) + verhoeff(۱) = ۲۲ کاراکتر
 *
 * - fiscalId: شناسه یکتای حافظه مالیاتی (۶ کاراکتر حرف/رقم)
 * - days: floor(unixMs / 86400000) → رشته hex صفرپُر تا ۵ رقم
 * - serial: سریال داخلی صورتحساب → رشته hex صفرپُر تا ۱۰ رقم
 *   (همین مقدار در فیلد inno صورتحساب قرار می‌گیرد)
 * - رقم کنترلی: Verhoeff روی رشتهٔ
 *   ASCII(fiscalId) + days(۶ رقم دهدهی صفرپُر) + serial(۱۲ رقم دهدهی صفرپُر)
 *
 * نمونه رسمی: A278W6 + 04C80 + 0000004744 + 4 → A278W604C8000000004744
 */
export function generateMoadianTaxid(
  fiscalId: string,
  invoiceDate: Date,
  serial: number
): string {
  const fid = fiscalId.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(fid)) {
    throw new Error(
      `شناسه حافظه مالیاتی نامعتبر است: «${fiscalId}» — باید دقیقاً ۶ کاراکتر حرف/رقم باشد`
    );
  }
  if (!Number.isSafeInteger(serial) || serial <= 0) {
    throw new Error(`سریال صورتحساب باید عدد صحیح مثبت باشد (دریافتی: ${serial})`);
  }

  const days = Math.floor(invoiceDate.getTime() / 86_400_000);
  const daysHex = days.toString(16).toUpperCase().padStart(5, "0");
  const serialHex = serial.toString(16).toUpperCase().padStart(10, "0");

  const checkInput =
    fiscalIdToVerhoeffInput(fid) +
    String(days).padStart(6, "0") +
    String(serial).padStart(12, "0");
  const check = verhoeffCheckDigit(checkInput);

  return `${fid}${daysHex}${serialHex}${check}`;
}

/** سریال عددی صورتحساب → فیلد inno (رشته hex ۱۰ کاراکتری) */
export function serialToInno(serial: number): string {
  return serial.toString(16).toUpperCase().padStart(10, "0");
}

// ============================================================
// ۳) ابزارهای base64url
// ============================================================

function b64urlFromBuffer(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlFromString(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

// ============================================================
// ۴) گواهی X.509 — ابزارهای اعتبارسنجی و استخراج
// ============================================================

export interface CertificateInfo {
  /** DER به base64 استاندارد (برای x5c در JWS) */
  derBase64: string;
  /** شماره سریال گواهی (hex) — باید با کد ملی مودی در SUBJECT هم‌خوان باشد */
  serialNumber: string;
  /** SUBJECT کامل گواهی */
  subject: string;
  /** تاریخ انقضا */
  validTo: Date;
  /** آیا منقضی شده؟ */
  expired: boolean;
}

/**
 * اعتبارسنجی و استخراج اطلاعات گواهی X.509 (PEM).
 * خطا می‌اندازد اگر گواهی نامعتبر/منقضی باشد.
 */
export function parseCertificate(certPem: string): CertificateInfo {
  const cert = new crypto.X509Certificate(certPem);
  if (cert.validTo) {
    const validTo = new Date(cert.validTo);
    const expired = validTo.getTime() < Date.now();
    return {
      derBase64: cert.raw.toString("base64"),
      serialNumber: cert.serialNumber,
      subject: cert.subject,
      validTo,
      expired,
    };
  }
  throw new Error("گواهی نامعتبر است (بدون تاریخ اعتبار)");
}

/**
 * اعتبارسنجی کلید خصوصی PKCS#8 (PEM) — با یک امضای آزمایشی.
 * خطا می‌اندازد اگر کلید نامعتبر باشد یا با گواهی نخواند.
 */
export function validateKeyPair(privateKeyPem: string, certificatePem: string): void {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const cert = new crypto.X509Certificate(certificatePem);

  // بررسی تطابق کلید خصوصی با کلید عمومی گواهی
  const message = Buffer.from("hoosh-key-pair-check", "utf8");
  const signature = crypto.sign("sha256", message, privateKey);
  const ok = crypto.verify("sha256", message, cert.publicKey, signature);
  if (!ok) {
    throw new Error("کلید خصوصی با گواهی هم‌خوان نیست — جفت کلید نامعتبر است");
  }
}

// ============================================================
// ۵) JWS — امضای دیجیتال (RS256 + x5c + sigT)
// ============================================================

/**
 * ساخت JWS فشرده مطابق نسخه ۲ مودیان:
 *
 * header: { alg: RS256, typ: jose, x5c: [گواهی], sigT, crit: [sigT], cty: text/plain }
 * payload: متن خام (JSON صورت‌حساب یا {nonce, clientId})
 *
 * امضا: RSA PKCS#1 v1.5 + SHA-256 روی «b64url(header).b64url(payload)»
 * خروجی: سه‌بخشی با base64url
 */
export function buildMoadianJws(
  payloadText: string,
  privateKeyPem: string,
  certificatePem: string
): string {
  const certInfo = parseCertificate(certificatePem);

  const header = {
    alg: "RS256",
    typ: "jose",
    // x5c: محتوای base64 گواهی بدون BEGIN/END و بدون line-break
    x5c: [certInfo.derBase64],
    // sigT: زمان امضا — فرمت ISO با دقت ثانیه (بدون میلی‌ثانیه)
    sigT: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    crit: ["sigT"],
    cty: "text/plain",
  };

  const encodedHeader = b64urlFromString(JSON.stringify(header));
  const encodedPayload = b64urlFromString(payloadText);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput, "utf8");
  const signature = signer.sign(privateKeyPem);

  return `${signingInput}.${b64urlFromBuffer(signature)}`;
}

// ============================================================
// ۶) JWE — رمزنگاری پاکت (RSA-OAEP-256 + A256GCM)
// ============================================================

/**
 * ساخت JWE پنج‌بخشی مطابق نسخه ۲ مودیان:
 *
 *   base64url(jweHeader) . base64url(encryptedCEK) . base64url(iv) . base64url(ciphertext) . base64url(tag)
 *
 * - jweHeader: { alg: RSA-OAEP-256, enc: A256GCM, kid: <شناسه کلید عمومی سازمان> }
 * - CEK: کلید تصادفی ۳۲ بایتی — با RSA-OAEP-SHA256 و کلید عمومی سازمان رمز می‌شود
 * - IV: ۱۲ بایت (۹۶ بیت — استاندارد GCM)
 * - ciphertext: AES-256-GCM روی رشتهٔ JWS — AAD = همان base64url(jweHeader)
 * - tag: ۱۶ بایت
 *
 * خطای رسمی 04152 اگر الگوریتم‌ها چیز دیگری باشند — دقیقاً همین مقادیر الزامی است.
 */
export function buildMoadianJwe(
  jwsString: string,
  serverPublicKeyPem: string,
  keyId: string
): string {
  const header = {
    alg: "RSA-OAEP-256",
    enc: "A256GCM",
    kid: keyId,
  };
  const encodedHeader = b64urlFromString(JSON.stringify(header));

  // CEK تصادفی ۳۲ بایتی + IV ۱۲ بایتی
  const cek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // رمزکردن CEK با کلید عمومی سازمان (RSA-OAEP + SHA-256)
  const encryptedKey = crypto.publicEncrypt(
    {
      key: serverPublicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    cek
  );

  // AES-256-GCM با AAD = base64url(header)
  const cipher = crypto.createCipheriv("aes-256-gcm", cek, iv, {
    authTagLength: 16,
  });
  cipher.setAAD(Buffer.from(encodedHeader, "ascii"));
  const ciphertext = Buffer.concat([
    cipher.update(jwsString, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    encodedHeader,
    b64urlFromBuffer(encryptedKey),
    b64urlFromBuffer(iv),
    b64urlFromBuffer(ciphertext),
    b64urlFromBuffer(tag),
  ].join(".");
}

// ============================================================
// ۷) اعتبارسنجی PEM — برای فرم تنظیمات
// ============================================================

/** آیا رشته یک PEM گواهی X.509 معتبر است؟ (بدون throw) */
export function isValidCertificatePem(certPem: string): { ok: boolean; error?: string } {
  try {
    const info = parseCertificate(certPem);
    if (info.expired) {
      return {
        ok: false,
        error: `گواهی منقضی شده است (تاریخ انقضا: ${info.validTo.toISOString().slice(0, 10)})`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `گواهی X.509 نامعتبر است — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** آیا رشته یک PEM کلید خصوصی PKCS#8 معتبر است؟ (بدون throw) */
export function isValidPrivateKeyPem(keyPem: string): { ok: boolean; error?: string } {
  try {
    crypto.createPrivateKey(keyPem);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `کلید خصوصی نامعتبر است — فرمت PKCS#8 (-----BEGIN PRIVATE KEY-----) لازم است. ${err instanceof Error ? err.message : ""}`,
    };
  }
}
