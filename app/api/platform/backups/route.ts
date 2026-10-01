import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  AUTO_BACKUP_INTERVAL_HOURS,
  createBackup,
  deleteBackup,
  listBackups,
  maybeRunAutoBackup,
} from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// /api/platform/backups — مدیریت بکاپ‌های پایگاه داده (Task 13-a)
// ------------------------------------------------------------
// GET    → فهرست بکاپ‌ها + اجرای «تنبل» بکاپ‌گیری خودکار روزانه
//          (fire-and-forget و غیرمسدودکننده — هر بار پنل باز شود
//          چک می‌شود؛ اگر >۲۴ ساعت از آخرین بکاپ خودکار گذشته و
//          امروز بکاپی نباشد، یکی ساخته می‌شود)
// POST   → تهیه‌ی بکاپ فوری (دستی) توسط سوپرادمین
// DELETE → حذف یک بکاپ با ?name= (اعتبارسنجی سخت‌گیرانه‌ی نام)
// دانلود: /api/platform/backups/[name] (فایل، استریم)
// ============================================================

// ── GET: فهرست + اتوماسیون تنبل روزانه ──
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    // بکاپ‌گیری خودکارِ تنبل — بدون بلاک شدن پاسخ (سرور Node طول‌عمر
    // بلند دارد و پرامیس در پس‌زمینه کامل می‌شود)
    void maybeRunAutoBackup().catch((err) => {
      console.warn("[backups/api] maybeRunAutoBackup failed:", err);
    });

    const list = await listBackups();
    if (!list.ok) {
      return NextResponse.json({ success: false, error: list.error || "خطا در خواندن بکاپ‌ها" }, { status: 500 });
    }

    // آخرین بکاپ خودکار (لیست نزولی است → اولین مورد auto)
    const lastAuto = list.backups.find((b) => b.trigger === "auto") ?? null;

    return NextResponse.json({
      success: true,
      data: {
        backups: list.backups,
        autoIntervalHours: AUTO_BACKUP_INTERVAL_HOURS,
        lastAutoAt: lastAuto ? lastAuto.createdAt : null,
      },
    });
  } catch (error) {
    console.error("[backups/api] GET error:", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت فهرست بکاپ‌ها" }, { status: 500 });
  }
}

// ── POST: بکاپ فوری (دستی) ──
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const result = await createBackup("manual", auth.admin.id);
    if (!result.ok || !result.backup) {
      return NextResponse.json({ success: false, error: result.error || "بکاپ‌گیری ناموفق بود" }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      data: {
        backup: result.backup,
        pruned: result.pruned ?? [],
      },
    });
  } catch (error) {
    console.error("[backups/api] POST error:", error);
    return NextResponse.json({ success: false, error: "خطا در تهیه بکاپ" }, { status: 500 });
  }
}

// ── DELETE: حذف بکاپ با ?name= ──
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const name = req.nextUrl.searchParams.get("name") || "";
    // نام ابتدا در deleteBackup با regex سخت‌گیرانه و سپس با manifest
    // اعتبارسنجی می‌شود (ضد path traversal)
    const result = await deleteBackup(name);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error || "حذف بکاپ ناموفق بود" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[backups/api] DELETE error:", error);
    return NextResponse.json({ success: false, error: "خطا در حذف بکاپ" }, { status: 500 });
  }
}
