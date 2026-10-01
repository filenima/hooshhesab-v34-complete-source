// ============================================================
// scripts/webp-convert.ts — تبدیل تصاویر PNG بلاگ به WebP (#۲۱ — v34)
// ============================================================
// برای هر فایل *.png داخل public/images یک نسخهٔ .webp با همان ابعاد
// می‌سازد (sharp: quality 82, effort 6). فایل‌های PNG نگه داشته می‌شوند
// (fallback برای کلاینت‌های قدیمی و مقایسه).
//
// اجرا:  bun scripts/webp-convert.ts
// خروجی: جدول «فایل | حجم png | حجم webp | صرفه‌جویی» + جمع کل
//
// پس از تبدیل، ارجاع‌های کد به /images/*.png باید به .webp برورسند
// (به‌جز جاهایی که نسخهٔ webp وجود ندارد) — دیتابیس هم با اسکریپت
// موقت db-webp به‌روز می‌شود.

import sharp from "sharp";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const IMAGES_DIR = path.join(process.cwd(), "public", "images");
const QUALITY = 82;
const EFFORT = 6;

function faDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

async function main() {
  const files = (await readdir(IMAGES_DIR)).filter((f) => f.endsWith(".png")).sort();
  if (files.length === 0) {
    console.log("هیچ فایل PNG در public/images نیست.");
    return;
  }

  let totalPng = 0;
  let totalWebp = 0;
  const rows: { name: string; png: number; webp: number }[] = [];
  let failed = 0;

  for (const file of files) {
    const pngPath = path.join(IMAGES_DIR, file);
    const webpPath = path.join(IMAGES_DIR, file.replace(/\.png$/, ".webp"));
    try {
      const pngBytes = (await stat(pngPath)).size;
      const buffer = await sharp(pngPath).webp({ quality: QUALITY, effort: EFFORT }).toBuffer();
      await writeFile(webpPath, buffer);
      rows.push({ name: file, png: pngBytes, webp: buffer.byteLength });
      totalPng += pngBytes;
      totalWebp += buffer.byteLength;
    } catch (err) {
      failed += 1;
      console.error(`خطا در تبدیل ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  // جدول نتیجه
  const nameW = Math.max(...rows.map((r) => r.name.length), 10);
  console.log("\n╔" + "═".repeat(nameW + 42) + "╗");
  console.log(`║ ${"فایل".padEnd(nameW)} │ ${"png".padStart(9)} │ ${"webp".padStart(9)} │ ${"صرفه".padStart(6)} ║`);
  console.log("╟" + "─".repeat(nameW + 42) + "╢");
  for (const r of rows) {
    const saving = Math.round(((r.png - r.webp) / r.png) * 100);
    console.log(
      `║ ${r.name.padEnd(nameW)} │ ${fmtBytes(r.png).padStart(9)} │ ${fmtBytes(r.webp).padStart(9)} │ ${faDigits(String(saving)).padStart(4)}٪ ║`
    );
  }
  console.log("╟" + "─".repeat(nameW + 42) + "╢");
  const totalSaving = Math.round(((totalPng - totalWebp) / totalPng) * 100);
  console.log(
    `║ ${"جمع".padEnd(nameW)} │ ${fmtBytes(totalPng).padStart(9)} │ ${fmtBytes(totalWebp).padStart(9)} │ ${faDigits(String(totalSaving)).padStart(4)}٪ ║`
  );
  console.log("╚" + "═".repeat(nameW + 42) + "╝\n");

  console.log(
    `نتیجه: ${faDigits(String(rows.length))} فایل تبدیل شد${failed > 0 ? ` — ${faDigits(String(failed))} خطا` : ""}؛ ` +
      `نسخه‌های .png به‌عنوان fallback حفظ شدند.`
  );
}

main().catch((err) => {
  console.error("خطای کلی:", err);
  process.exit(1);
});
