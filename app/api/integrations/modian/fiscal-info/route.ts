// ============ Modian Fiscal Info API — هوش ============
// استعلام اطلاعات حافظه مالیاتی خودِ مودی — GET /fiscal-information رسمی.
//
// GET /api/integrations/modian/fiscal-info
//
// کاربرد: «وارد کردن اطلاعات مودیان» — بعد از تنظیم شناسه حافظه + گواهی،
// کاربر می‌تواند اطلاعات رسمی حافظهٔ خودش را بگیرد:
//  - nameTrade (نام تجاری)، fiscalStatus (وضعیت حافظه)، saleThreshold
//    (سقف فروش دوره)، economicCode (کد اقتصادی)، nationalId (شناسه ملی)
//
// این اطلاعات می‌تواند فیلد «شناسه ملی شرکت (فروشنده/tins)» را خودکار
// پر کند — exact داده رسمی سازمان، بدون تایپ دستی.
//
// CRITICAL: بدون اتصال واقعی → 503 — هرگز داده جعلی برنمی‌گردد.

import { NextRequest, NextResponse } from "next/server";
import { getTenant, auditLog } from "@/lib/auth";
import {
  applyEnvToConnection,
  getModianConnection,
  modianConnectionReasonFa,
  getModianEnv,
  fetchFiscalInformation,
} from "@/lib/modian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FISCAL_STATUS_FA: Record<string, string> = {
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  SUSPENDED: "معلق",
};

// GET /api/integrations/modian/fiscal-info — اطلاعات حافظه مالیاتی خودِ مودی
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
          error: `اتصال به سامانه مودیان پیکربندی نشده است: ${modianConnectionReasonFa(connResult.reason)}`,
          errorCode: "MODIAN_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const envCfg = await getModianEnv(tenant.id);
    const connection = applyEnvToConnection(connResult.connection, envCfg);

    const result = await fetchFiscalInformation(connection);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.errorFa, errorCode: "MODIAN_FISCAL_FAILED" },
        { status: 502 }
      );
    }

    const info = result.data;

    await auditLog({
      tenantId: tenant.id,
      action: "MODIAN_FISCAL_INFO",
      entity: "Integration",
      changes: {
        memoryId: connection.memoryId,
        nameTrade: info.nameTrade ?? null,
        fiscalStatus: info.fiscalStatus ?? null,
        env: envCfg.env,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      fiscal: {
        memoryId: connection.memoryId,
        nameTrade: info.nameTrade ?? null,
        fiscalStatus: info.fiscalStatus ?? null,
        fiscalStatusFa: info.fiscalStatus
          ? FISCAL_STATUS_FA[info.fiscalStatus] ?? info.fiscalStatus
          : null,
        saleThreshold: info.saleThreshold ?? null,
        economicCode: info.economicCode ?? null,
        nationalId: info.nationalId ?? null,
      },
      env: envCfg.env,
    });
  } catch (error) {
    console.error("Modian fiscal-info error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در استعلام اطلاعات حافظه مالیاتی" },
      { status: 500 }
    );
  }
}
