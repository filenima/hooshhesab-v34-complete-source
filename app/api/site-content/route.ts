import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  getSiteContent,
  saveSiteContent,
  resetSiteContent,
  normalizeSiteContent,
} from "@/lib/site-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/site-content — محتوای داینامیک صفحه فرود (عمومی)
 * defaults + overrides ادغام‌شده — برای همه‌ی بازدیدکنندگان.
 * کش سرور (TTL ۵ دقیقه) + no-store روی HTTP تا تغییرات فوری دیده شوند.
 */
export async function GET() {
  try {
    const data = await getSiteContent();
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Site content GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت محتوای سایت" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/site-content — ذخیره‌ی overrides محتوای سایت (فقط سوپرادمین)
 * body: { fields?, hidden?, order?, custom? } | { reset: true }
 */
export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "بدنه‌ی درخواست نامعتبر است" },
        { status: 400 }
      );
    }

    const raw = body as Record<string, unknown>;

    // بازنشانی به پیش‌فرض‌ها
    if (raw.reset === true) {
      await resetSiteContent(admin.id);
      try {
        const { db } = await import("@/lib/db");
        await db.platformAuditLog.create({
          data: {
            superAdminId: admin.id,
            action: "RESET_SITE_CONTENT",
            entity: "SiteContent",
            details: JSON.stringify({ reset: true }),
            ipAddress: req.headers.get("x-forwarded-for") || null,
          },
        });
      } catch {
        // ignore audit log failure
      }
      return NextResponse.json({
        success: true,
        message: "محتوای سایت به حالت پیش‌فرض بازنشانی شد",
      });
    }

    // ذخیره‌ی overrides نرمال‌شده
    const overrides = normalizeSiteContent(raw);
    await saveSiteContent(overrides, admin.id);

    try {
      const { db } = await import("@/lib/db");
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "UPDATE_SITE_CONTENT",
          entity: "SiteContent",
          details: JSON.stringify({
            fieldsCount: Object.keys(overrides.fields).length,
            hiddenCount: overrides.hidden.length,
            orderCount: overrides.order.length,
            customCount: overrides.custom.length,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      // ignore audit log failure
    }

    return NextResponse.json({
      success: true,
      message: "محتوای سایت با موفقیت ذخیره شد",
      data: overrides,
    });
  } catch (error) {
    console.error("Site content PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره محتوای سایت" },
      { status: 500 }
    );
  }
}
