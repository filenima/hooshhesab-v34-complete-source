import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/platform/anti-fraud/[id] — مسدود/آزادسازی دستی یک کلید توسط سوپرادمین
// body: { blocked: boolean, note?: string }
// DELETE /api/platform/anti-fraud/[id] — حذف کامل رکورد (ریست شمارنده)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { blocked, note } = body as { blocked?: boolean; note?: string };

    const existing = await db.registrationGuard.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "رکورد یافت نشد" },
        { status: 404 }
      );
    }

    const updated = await db.registrationGuard.update({
      where: { id },
      data: {
        ...(typeof blocked === "boolean" ? { blocked } : {}),
        ...(note !== undefined ? { note } : {}),
      },
    });

    // audit log
    await db.auditLog.create({
      data: {
        tenantId: "PLATFORM",
        action: "ANTI_FRAUD_UPDATE",
        entity: "RegistrationGuard",
        entityId: id,
        changes: JSON.stringify({
          guardKey: existing.guardKey,
          blockedBefore: existing.blocked,
          blockedAfter: updated.blocked,
          note: note || null,
        }),
      },
    }).catch(() => {
      /* audit نباید عملیات را متوقف کند */
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Anti-fraud update error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در به‌روزرسانی رکورد" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const existing = await db.registrationGuard.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "رکورد یافت نشد" },
        { status: 404 }
      );
    }

    await db.registrationGuard.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        tenantId: "PLATFORM",
        action: "ANTI_FRAUD_DELETE",
        entity: "RegistrationGuard",
        entityId: id,
        changes: JSON.stringify({ guardKey: existing.guardKey, count: existing.count }),
      },
    }).catch(() => {
      /* audit نباید عملیات را متوقف کند */
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Anti-fraud delete error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف رکورد" },
      { status: 500 }
    );
  }
}
