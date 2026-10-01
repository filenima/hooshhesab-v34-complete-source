// ============ Modian Taxpayer Info API — هوش ============
// استعلام اطلاعات مودی (شخص/شرکت) با کد اقتصادی/شناسه ملی از سامانه مودیان.
//
// GET /api/integrations/modian/taxpayer-info?economicCode=...
//
// کاربردها:
//  ۱) «وارد کردن اطلاعات مودی» — کاربران ثبت‌نام‌شدهٔ مودیان می‌توانند
//     اطلاعات رسمی خودشان (نام تجاری، وضعیت، نوع، شناسه ملی، آدرس) را
//     از سازمان بگیرند و در پروفایل/طرف‌حساب ذخیره کنند.
//  ۲) اعتبارسنجی طرف‌حساب‌ها قبل از صدور صورتحساب نوع اول (B2B) —
//     اگر طرف‌حساب در مودیان فعال نباشد، صورتحسابش رد می‌شود.
//
// پاسخ رسمی GET /taxpayer: { nameTrade, taxpayerStatus, taxpayerType,
//   postalcodeTaxpayer, addressTaxpayer, nationalId, ... }
//
// CRITICAL: بدون اتصال واقعی → 503 — هرگز داده جعلی برنمی‌گردد.

import { NextRequest, NextResponse } from "next/server";
import { getTenant, auditLog } from "@/lib/auth";
import {
  applyEnvToConnection,
  getModianConnection,
  modianConnectionReasonFa,
  getModianEnv,
  fetchTaxpayerInfo,
} from "@/lib/modian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FA: Record<string, string> = {
  ENABLED: "فعال",
  DISABLED: "غیرفعال",
  SUSPENDED: "معلق",
};

const TYPE_FA: Record<string, string> = {
  LEGAL: "شخص حقوقی",
  REAL: "شخص حقیقی",
};

// GET /api/integrations/modian/taxpayer-info?economicCode=12345678901
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "تنانت یافت نشد" }, { status: 401 });
    }

    const economicCode = new URL(req.url).searchParams.get("economicCode")?.trim() ?? "";
    if (!economicCode || !/^\d{10,14}$/.test(economicCode.replace(/\D/g, ""))) {
      return NextResponse.json(
        { success: false, error: "کد اقتصادی/شناسه ملی نامعتبر است — ۱۰ تا ۱۴ رقم" },
        { status: 400 }
      );
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

    const result = await fetchTaxpayerInfo(connection, economicCode);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.errorFa, errorCode: "MODIAN_TAXPAYER_FAILED" },
        { status: 502 }
      );
    }

    const info = result.data;

    await auditLog({
      tenantId: tenant.id,
      action: "MODIAN_TAXPAYER_INFO",
      entity: "Party",
      entityId: economicCode,
      changes: {
        economicCode,
        nameTrade: info.nameTrade ?? null,
        taxpayerStatus: info.taxpayerStatus ?? null,
        env: envCfg.env,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      taxpayer: {
        economicCode,
        nameTrade: info.nameTrade ?? null,
        taxpayerStatus: info.taxpayerStatus ?? null,
        taxpayerStatusFa: info.taxpayerStatus ? STATUS_FA[info.taxpayerStatus] ?? info.taxpayerStatus : null,
        taxpayerType: info.taxpayerType ?? null,
        taxpayerTypeFa: info.taxpayerType ? TYPE_FA[info.taxpayerType] ?? info.taxpayerType : null,
        nationalId: info.nationalId ?? null,
        postalCode: info.postalcodeTaxpayer ?? null,
        address: info.addressTaxpayer ?? null,
      },
      env: envCfg.env,
    });
  } catch (error) {
    console.error("Modian taxpayer-info error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در استعلام اطلاعات مودی" },
      { status: 500 }
    );
  }
}
