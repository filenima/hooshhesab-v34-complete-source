import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, access } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // ۸ مگابایت
// FIX(SEC-4a): SVG حذف شد — فایل در public/uploads سرو می‌شود و SVG حاوی
// اسکریپت روی همان origin اجرا می‌شود (XSS ذخیره‌شده) — سیاست secure-uploads
const ALLOWED_MIME = new Set([
 "image/png",
 "image/jpeg",
 "image/jpg",
 "image/webp",
 "image/gif",
]);

// POST /api/user/upload-logo — آپلود لوگوی شرکت
export async function POST(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const formData = await req.formData();
 const file = formData.get("logo") as File;
 if (!file) {
 return NextResponse.json(
 { success: false, error: "فایل الزامی است" },
 { status: 400 }
 );
 }

 // اعتبارسنجی نوع فایل (سخت‌گیرانه‌تر) — FIX(SEC-4a): پذیرش کلی image/* هم
 // محدود شد؛ SVG از هر مسیری (MIME یا پسوند نام فایل) رد می‌شود
 const fileType = (file.type || "").toLowerCase();
 const fileNameLower = (file.name || "").toLowerCase();
 const isImage =
 (ALLOWED_MIME.has(fileType) && !/\.svg$/i.test(fileNameLower)) ||
 /\.(png|jpe?g|webp|gif)$/i.test(fileNameLower);
 if (!isImage) {
 return NextResponse.json(
 { success: false, error: "فقط فایل تصویری (PNG، JPG، WebP، GIF) مجاز است" },
 { status: 400 }
 );
 }

 // محدودیت حجم: ۸ مگابایت
 if (file.size > MAX_FILE_SIZE) {
 return NextResponse.json(
 { success: false, error: "حجم فایل نباید بیش از ۸ مگابایت باشد" },
 { status: 400 }
 );
 }
 if (file.size === 0) {
 return NextResponse.json(
 { success: false, error: "فایل خالی است" },
 { status: 400 }
 );
 }

 // تعیین پسوند امن — FIX(SEC-4a): نگاشت از MIME مجاز؛ fallback پسوند نام
 // فایل فقط از مجموعهٔ امن (بدون svg)
 const extMap: Record<string, string> = {
 "image/png": "png",
 "image/jpeg": "jpg",
 "image/jpg": "jpg",
 "image/webp": "webp",
 "image/gif": "gif",
 };
 const nameExt = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
 const ext = extMap[fileType] || (["png", "jpg", "jpeg", "webp", "gif"].includes(nameExt) ? nameExt : "png");
 const fileName = `logo-${authUser.userId}-${Date.now()}.${ext}`;
 const uploadDir = path.join(process.cwd(), "public", "uploads");
 // اطمینان از وجود پوشه با تلاش مجدد
 try {
 await mkdir(uploadDir, { recursive: true });
 await access(uploadDir);
 } catch (mkdirErr) {
 console.error("Cannot create uploads dir:", mkdirErr);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد پوشه آپلود — دسترسی فایل سیستم بررسی شود" },
 { status: 500 }
 );
 }
 const filePath = path.join(uploadDir, fileName);

 let buffer: Buffer;
 try {
 buffer = Buffer.from(await file.arrayBuffer());
 } catch (bufErr) {
 console.error("Buffer error:", bufErr);
 return NextResponse.json(
 { success: false, error: "خطا در خواندن فایل — فایل ممکن است خراب باشد" },
 { status: 400 }
 );
 }
 try {
 await writeFile(filePath, buffer);
 } catch (writeErr) {
 console.error("Write file error:", writeErr);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره فایل — دسترسی نوشتن بررسی شود" },
 { status: 500 }
 );
 }

 const logoUrl = `/uploads/${fileName}`;

 // به‌روزرسانی کاربر
 await db.user.update({
 where: { id: authUser.userId },
 data: { logoUrl },
 });

 await db.auditLog.create({
 data: {
 tenantId: authUser.tenantId,
 userId: authUser.userId,
 action: "UPLOAD_LOGO",
 entity: "User",
 entityId: authUser.userId,
 },
 });

 return NextResponse.json({
 success: true,
 logoUrl,
 message: "لوگو با موفقیت آپلود شد",
 });
 } catch (error) {
 console.error("[upload-logo] Error:", error instanceof Error? error.message: error);
 // FIX(SEC-4a): پیام خام خطا به کلاینت نشت نمی‌کند
 return NextResponse.json(
 { success: false, error: "خطا در آپلود لوگو — لطفاً دوباره تلاش کنید" },
 { status: 500 }
 );
 }
}
