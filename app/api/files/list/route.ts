import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg"]);

// فرمت خوانا برای حجم فایل
function humanSize(bytes: number): string {
 if (bytes < 1024) return `${bytes} B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
 return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// GET /api/files/list — لیست فایل‌های تصویری آپلودشده در public/uploads
// احراز هویت: Bearer token
// پارامتر query اختیاری:?type=images (default) — برای آینده
//
// FIX(3b-بیگ۹) MEDIUM: قبلاً کل پوشهٔ uploads (مشترک بین همهٔ tenantها) به هر
// کاربرِ احراز هویت‌شدهٔ هر tenantی لیست می‌شد — نشت receipt/لوگو/فایل tenantهای
// دیگر. حالا فقط فایل‌های «متعلق به tenant کاربر» برگردانده می‌شوند:
// نام‌گذاری فایل‌های آپلود (tenant-logo-<tenantId>-… و logo-<userId>-…) این
// اجازه را می‌دهد؛ فایل‌های بدون شناسهٔ tenant (پلتفرمی/CMS/تبلیغات) لیست
// نمی‌شوند.
export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const tenantId = auth.user.tenantId;
 const userId = auth.user.userId;

 const uploadDir = path.join(process.cwd(), "public", "uploads");
 let entries: string[] = [];
 try {
 entries = await readdir(uploadDir);
 } catch {
 // اگر پوشه وجود نداشت، لیست خالی برمی‌گردانیم
 entries = [];
 }

 const files: Array<{
 name: string;
 url: string;
 size: number;
 sizeHuman: string;
 ext: string;
 uploadedAt: string;
 }> = [];

 for (const name of entries) {
 // فقط فایل‌های تصویری
 const ext = name.split(".").pop()?.toLowerCase() || "";
 if (!ALLOWED_EXT.has(ext)) continue;

 // FIX(3b-بیگ۹): tenant-scoping — نام فایل باید شامل tenantId یا userId
 // (فایل‌های logo-<userId>-…) باشد تا در لیست این کاربر بیاید.
 const isTenantOwned =
 name.includes(tenantId) ||
 (userId ? name.includes(userId) : false);
 if (!isTenantOwned) continue;

 const fullPath = path.join(uploadDir, name);
 try {
 const st = await stat(fullPath);
 if (!st.isFile()) continue;
 files.push({
 name,
 url: `/uploads/${name}`,
 size: st.size,
 sizeHuman: humanSize(st.size),
 ext,
 uploadedAt: st.mtime.toISOString(),
 });
 } catch {
 // اگر stat ناموفق بود، رد می‌کنیم
 continue;
 }
 }

 // مرتب‌سازی بر اساس تاریخ آپلود نزولی (جدیدترین اول)
 files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

 return NextResponse.json({
 success: true,
 data: files,
 count: files.length,
 });
 } catch (error) {
 console.error("List files error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست فایل‌ها" },
 { status: 500 }
 );
 }
}
