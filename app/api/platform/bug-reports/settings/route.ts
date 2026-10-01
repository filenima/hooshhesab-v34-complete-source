import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  getBugRewardRules,
  saveBugRewardRules,
  type BugRewardRules,
} from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ تنظیمات پاداش خودکار باگ (Task 10-b) ============
// GET  /api/platform/bug-reports/settings — قوانین فعلی
// PUT  /api/platform/bug-reports/settings — ذخیره قوانین
//      body: { enabled?, criticalDays?, highDays?, plan? }
// فقط سوپرادمین.

const VALID_PLANS = new Set(["free", "basic", "pro", "enterprise"]);

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const rules = await getBugRewardRules();
    return NextResponse.json({ success: true, data: rules });
  } catch (error) {
    console.error("Bug reward settings GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تنظیمات پاداش" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));

    const current = await getBugRewardRules();
    const rules: BugRewardRules = {
      enabled:
        typeof body?.enabled === "boolean" ? body.enabled : current.enabled,
      criticalDays:
        typeof body?.criticalDays === "number" && !isNaN(body.criticalDays)
          ? body.criticalDays
          : current.criticalDays,
      highDays:
        typeof body?.highDays === "number" && !isNaN(body.highDays)
          ? body.highDays
          : current.highDays,
      plan:
        typeof body?.plan === "string" && VALID_PLANS.has(body.plan)
          ? body.plan
          : current.plan,
    };

    if (rules.criticalDays < 1 || rules.criticalDays > 365) {
      return NextResponse.json(
        { success: false, error: "روزهای پاداش بحرانی باید بین ۱ تا ۳۶۵ باشد" },
        { status: 400 }
      );
    }
    if (rules.highDays < 1 || rules.highDays > 365) {
      return NextResponse.json(
        { success: false, error: "روزهای پاداش زیاد باید بین ۱ تا ۳۶۵ باشد" },
        { status: 400 }
      );
    }

    await saveBugRewardRules(rules);

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "BUG_REWARD_SETTINGS_UPDATED",
          entity: "SystemSettings",
          entityId: "bug_reward_rules",
          details: JSON.stringify(rules),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: rules,
      message: "قوانین پاداش خودکار ذخیره شد",
    });
  } catch (error) {
    console.error("Bug reward settings PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره تنظیمات پاداش" },
      { status: 500 }
    );
  }
}
