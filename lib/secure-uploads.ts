// ============ هوش — آپلود امن فایل‌های حساس (FIX SECURITY-H3) ============
// ----------------------------------------------------------------------
// مشکل قبلی: رسیدها و اسکن‌های مالی در public/uploads ذخیره می‌شدند و
// بدون احراز هویت برای همه قابل خواندن بودند (تنها پوشش: نام UUID).
// SVG هم مجاز بود → XSS ذخیره‌شده روی origin سایت.
//
// راه‌حل: فایل‌های حساس در پوشه خصوصی «private-uploads» (خارج از public/)
// ذخیره می‌شوند و فقط از طریق /api/uploads/[name] با URL امضاشده (HMAC +
// انقضا) سرو می‌شوند — قابل استفاده در تگ <img> بدون هدر Authorization.

import path from "path";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";

/** دایرکتوری خصوصی (خارج از public — استاتیک سرو نمی‌شود) */
export function privateUploadsDir(): string {
  return path.join(process.cwd(), "private-uploads");
}

/** پسوندهای مجاز برای آپلود خصوصی — SVG ممنوع (XSS) */
export const PRIVATE_ALLOWED_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "pdf",
]);

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

export function mimeForExt(ext: string): string | null {
  return EXT_MIME[ext.toLowerCase()] ?? null;
}

/** راز امضای URL — از ENCRYPTION_KEY یا JWT_SECRET مشتق می‌شود */
function getSignSecret(): string {
  const s = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY/JWT_SECRET required for upload signing");
    }
    return "dev-only-upload-sign-secret";
  }
  return s;
}

/** ذخیره فایل در پوشه خصوصی با نام UUID — خروجی: نام فایل */
export async function savePrivateUpload(
  buf: Buffer,
  prefix: string,
  ext: string
): Promise<string> {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!PRIVATE_ALLOWED_EXT.has(safeExt)) {
    throw new Error(`پسوند غیرمجاز: ${safeExt}`);
  }
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const fileName = `${safePrefix}-${randomUUID()}.${safeExt}`;
  const dir = privateUploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buf);
  return fileName;
}

/** ساخت URL امضاشده با انقضا — قابل استفاده در <img> بدون هدر auth */
export function signUploadUrl(fileName: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac("sha256", getSignSecret())
    .update(`${fileName}:${exp}`)
    .digest("base64url");
  return `/api/uploads/${encodeURIComponent(fileName)}?exp=${exp}&sig=${sig}`;
}

/** اعتبارسنجی امضای URL — constant-time */
export function verifyUploadSignature(
  fileName: string,
  exp: string | null,
  sig: string | null
): boolean {
  if (!exp || !sig) return false;
  const expNum = parseInt(exp, 10);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false; // منقضی
  }
  const expected = crypto
    .createHmac("sha256", getSignSecret())
    .update(`${fileName}:${expNum}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
