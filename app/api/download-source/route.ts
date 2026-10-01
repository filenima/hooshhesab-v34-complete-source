import { NextRequest, NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { verifyToken } from '@/lib/platform-auth';

// نام پیش‌فرض فایل سورس؛ اگر موجود نباشد، جدیدترین بستهٔ نسخه‌دار
// (hooshhesab-v*-complete-source.zip) به‌صورت خودکار سرو می‌شود تا
// اندپوینت هرگز به‌خاطر جابه‌جایی شمارهٔ نسخه، ۴۰۴ ندهد.
const SOURCE_FINAL = 'hoshhesab-source-final.zip';

async function resolveSourceZip(): Promise<{ file: string; versionLabel: string } | null> {
  const dir = path.join(process.cwd(), 'download');
  const finalPath = path.join(dir, SOURCE_FINAL);
  if (existsSync(finalPath)) {
    return { file: finalPath, versionLabel: SOURCE_FINAL };
  }
  if (!existsSync(dir)) return null;
  const names = await readdir(dir).catch(() => [] as string[]);
  const candidates = names
    .filter((n) => /^hooshhesab-v(\d+)-complete-source\.zip$/.test(n))
    .map((n) => ({ n, v: Number(n.match(/^hooshhesab-v(\d+)-complete-source\.zip$/)?.[1] ?? 0) }))
    .sort((a, b) => b.v - a.v);
  if (candidates.length === 0) return null;
  const best = candidates[0];
  return { file: path.join(dir, best.n), versionLabel: best.n };
}


export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
 try {
 // ─── PRODUCTION GUARD: در محیط production این اندپوینت به‌کلی غیرفعال است ───
 // سورس‌کد محصول تجاری است — فقط برای dev/testing در دسترس است.
 if (process.env.NODE_ENV === "production" && process.env.ENABLE_SOURCE_DOWNLOAD!== "1") {
 return NextResponse.json(
 { success: false, error: "این قابلیت در محیط production غیرفعال است" },
 { status: 404 }
 );
 }

 // ─── SECURITY FIX: فقط سوپرادمین اجازه دانلود سورس را دارد ───
 // قبلاً هر کاربر احراز هویت‌شده (tenant user) می‌توانست کل سورس اپ را
 // دانلود کند — نشت شدید IP برای محصول تجاری.
 let authorized = false;
 const authHeader = req.headers.get('authorization');
 if (authHeader?.startsWith('Bearer ')) {
 const token = authHeader.substring(7);
 const payload = verifyToken(token);
 if (payload?.type === 'superadmin') authorized = true;
 }
 if (!authorized) {
 return NextResponse.json(
 { success: false, error: 'دسترسی فقط برای مدیر پلتفرم مجاز است' },
 { status: 403 }
 );
 }

 const resolved = await resolveSourceZip();
 if (!resolved) {
 return NextResponse.json(
 { error: 'فایل ZIP یافت نشد. لطفاً دوباره تلاش کنید.' },
 { status: 404 }
 );
 }

 const fileBuffer = await readFile(resolved.file);

 return new NextResponse(fileBuffer, {
 status: 200,
 headers: {
 'Content-Type': 'application/zip',
 'Content-Disposition': `attachment; filename="${resolved.versionLabel}"`,
 'Content-Length': fileBuffer.byteLength.toString(),
 'Cache-Control': 'no-store, no-cache, must-revalidate',
 },
 });
 } catch (error) {
 console.error('Download error:', error);
 return NextResponse.json(
 { error: 'خطا در دانلود فایل' },
 { status: 500 }
 );
 }
}
