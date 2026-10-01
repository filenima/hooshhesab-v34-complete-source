// ============ Modian Test Connection API — هوش ============
// تست اتصال واقعی به سامانه مودیان نسخه ۲ — بدون ارسال صورتحساب.
//
// GET /api/integrations/modian/test-connection
//
// چرخهٔ تست (امن — هیچ صورتحسابی ارسال نمی‌شود):
//  ۱) GET /nonce — چالش یک‌بارمصرف
//  ۲) ساخت توکن JWS با کلید/گواهی کاربر (خطای کلید/گواهی اینجا مشخص می‌شود)
//  ۳) GET /server-information با توکن — احراز هویت واقعی سازمان
//
// خروجی: مرحله‌های پاس/خطا + پیام فارسی دقیق برای هر مرحله.

import { NextRequest, NextResponse } from "next/server";
import { getTenant, auditLog } from "@/lib/auth";
import {
  applyEnvToConnection,
  getModianConnection,
  modianConnectionReasonFa,
  getModianEnv,
  testModianConnection,
} from "@/lib/modian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEP_FA: Record<string, string> = {
  NONCE: "گرفتن چالش nonce از مودیان",
  AUTH: "ساخت توکن امضا (JWS) با گواهی/کلید",
  SERVER_INFO: "احراز هویت در سازمان (server-information)",
};

// GET /api/integrations/modian/test-connection
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "تنانت یافت نشد" }, { status: 401 });
    }

    const connResult = await getModianConnection(tenant.id);
    if (!connResult.ok) {
      return NextResponse.json(
        {
          success: false,
          connected: false,
          error: `اتصال پیکربندی نشده است: ${modianConnectionReasonFa(connResult.reason)}`,
          reason: connResult.reason,
          errorCode: "MODIAN_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const envCfg = await getModianEnv(tenant.id);
    const connection = applyEnvToConnection(connResult.connection, envCfg);

    const result = await testModianConnection(connection);

    await auditLog({
      tenantId: tenant.id,
      action: "MODIAN_TEST_CONNECTION",
      entity: "Integration",
      changes: {
        memoryId: connection.memoryId,
        env: envCfg.env,
        ok: result.ok,
        ...(result.ok ? {} : { failedStep: result.step, error: result.errorFa }),
      },
      req,
    });

    if (!result.ok) {
      return NextResponse.json({
        success: false,
        connected: false,
        failedStep: result.step,
        failedStepFa: STEP_FA[result.step] ?? result.step,
        error: result.errorFa,
        env: envCfg.env,
      });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      env: envCfg.env,
      memoryId: connection.memoryId,
      serverKeyIds: result.serverKeyIds,
      message:
        envCfg.env === "TEST"
          ? "اتصال به محیط آزمایشی مودیان با موفقیت برقرار شد (بدون اثر حقوقی)"
          : "اتصال به سامانه مودیان با موفقیت برقرار شد — احراز هویت گواهی دیجیتال معتبر است",
    });
  } catch (error) {
    console.error("Modian test-connection error:", error);
    return NextResponse.json(
      { success: false, connected: false, error: "خطا در تست اتصال مودیان" },
      { status: 500 }
    );
  }
}
