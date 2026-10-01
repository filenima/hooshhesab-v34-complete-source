import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getBackupFilePath, isValidBackupName } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// GET /api/platform/backups/[name] — دانلود فایل بکاپ (Task 13-a)
// ------------------------------------------------------------
// SECURITY (ضد path traversal):
//  1. نام باید دقیقاً با /^hoosh-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}\.db$/
//     مطابقت داشته باشد (فقط کاراکترهای [a-zA-Z0-9._-] ممکن‌اند).
//  2. نام باید «دقیقاً» به‌صورت یک ورودی موجود در manifest تایید شود
//     (getBackupFilePath) — فایل‌های خارج از manifest هرگز سرو نمی‌شوند.
//  3. مسیر نهایی با path.join داخل پوشه‌ی backups می‌ماند.
// فایل به‌صورت استریم (بدون بارگذاری کامل در حافظه) برگردانده می‌شود.
// ============================================================

export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const { name } = await ctx.params;

    // ۱) اعتبارسنجی الگوی نام — رد سریع نام‌های غیرمجاز
    if (!isValidBackupName(name)) {
      return NextResponse.json({ success: false, error: "نام فایل بکاپ نامعتبر است" }, { status: 400 });
    }

    // ۲) تایید وجود در manifest + مسیر امن روی دیسک
    const filePath = await getBackupFilePath(name);
    if (!filePath) {
      return NextResponse.json({ success: false, error: "بکاپ یافت نشد" }, { status: 404 });
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ success: false, error: "بکاپ یافت نشد" }, { status: 404 });
    }

    // ۳) استریم فایل
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[backups/api] download error:", error);
    return NextResponse.json({ success: false, error: "خطا در دانلود بکاپ" }, { status: 500 });
  }
}
