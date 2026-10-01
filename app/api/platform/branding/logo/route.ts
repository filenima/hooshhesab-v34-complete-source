import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, access } from "fs/promises";
import path from "path";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/branding/logo — آپلود لوگوی برند از پنل سوپرادمین (v14)
 *
 * درخواست مالک: «از پنل سوپرادمین باید بتونم لوگو رو هم تغییر بدم ذخیره زدم سریع
 * لوگو کامل تغییر بکنه برای همه کاربرا.»
 *
 * سازوکار انتشار سریع:
 *  - فایل با نام versioned ذخیره می‌شود (logo-{ts}-{rand}.png) → کش مرورگر
 *    کاربران با URL جدید می‌شکند (نه با URL تکراری)
 *  - آدرس versioned در SystemSettings (branding_logo_url) ثبت می‌شود → کش
 *    سرور برندینگ باطل می‌شود → همهٔ کاربران در فچ بعدی (حداکثر ~۹۰ ثانیه)
 *    لوگوی جدید را می‌بینند؛ سوپرادمین همان لحظه.
 *  - MIME سخت‌گیرانه: فقط PNG/JPG/WebP/GIF (SVG ممنوع — XSS)
 */
const MAX_FILE_SIZE = 2 * 1024 * 1024; // ۲MB
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const formData = await req.formData();
    const file = formData.get("logo") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "فایل الزامی است" }, { status: 400 });
    }

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
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: "حجم فایل نباید بیش از ۲ مگابایت باشد" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: "فایل خالی است" }, { status: 400 });
    }

    // نام یکتا + versioned → شکستن کش مرورگر همهٔ کاربران
    const ext = (fileNameLower.match(/\.(png|jpe?g|webp|gif)$/)?.[1] || "png").toLowerCase();
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const fileName = `logo-platform-${stamp}-${rand}.${ext}`;

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    try {
      await mkdir(uploadDir, { recursive: true });
      await access(uploadDir);
    } catch {
      return NextResponse.json({ success: false, error: "خطا در ایجاد پوشه آپلود" }, { status: 500 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ success: false, error: "خطا در خواندن فایل" }, { status: 400 });
    }

    try {
      await writeFile(path.join(uploadDir, fileName), buffer);
    } catch {
      return NextResponse.json({ success: false, error: "خطا در ذخیره فایل" }, { status: 500 });
    }

    const logoUrl = `/uploads/${fileName}`;

    // ثبت فوری در SystemSettings + باطل‌کردن کش برندینگ (انتشار سریع)
    try {
      await db.systemSettings.upsert({
        where: { key: "branding_logo_url" },
        update: { value: logoUrl },
        create: { key: "branding_logo_url", value: logoUrl },
      });
      const { invalidateSettingsCache } = await import("@/lib/system-settings");
      invalidateSettingsCache();
    } catch {
      /* حتی اگر ثبت تنظیمات خطا خورد، فایل آپلود شده و URL برگردانده می‌شود */
    }

    // ممیزی پلتفرم (best-effort)
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin?.id ?? "system",
          action: "PLATFORM_BRANDING_LOGO_UPLOAD",
          entity: "SystemSettings",
          entityId: "branding_logo_url",
          details: JSON.stringify({ logoUrl, size: file.size, type: fileType }),
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({ success: true, data: { logoUrl } });
  } catch (error) {
    console.error("platform branding logo upload error:", error);
    return NextResponse.json({ success: false, error: "خطای سرور در آپلود لوگو" }, { status: 500 });
  }
}
