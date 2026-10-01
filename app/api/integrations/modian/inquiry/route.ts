// ============ Modian Inquiry API — هوش ============
// استعلام نتیجهٔ ارسال از سامانه مودیان — اتصال واقعی نسخه ۲ (inquiry-by-uid).
//
// POST: استعلام وضعیت فاکتورهای ارسال‌شده:
//  - body: { uids?: string[], all?: boolean, page?: number }
//  - بدون uids و all=true → همهٔ فاکتورهای SENT محلی (با modianUid)
//  - حداکثر ۱۰۰ شناسه در هر استعلام (خطای رسمی ۴۱۴۱)
//
// خروجی علاوه بر جزئیات، وضعیت‌های محلی هم به‌روز می‌شود:
//  SUCCESS → ACCEPTED | FAILED/TIMEOUT → REJECTED | PENDING/IN_PROGRESS → SENT
//
// CRITICAL: هیچ شبیه‌سازی‌ای نیست — بدون اتصال واقعی → 503.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import {
  applyEnvToConnection,
  getModianConnection,
  modianConnectionReasonFa,
  getModianEnv,
  inquiryByUid,
  type InquiryResultEntry,
} from "@/lib/modian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ترجمهٔ وضعیت استعلام → وضعیت داخلی */
function inquiryStatusToLocal(entry: InquiryResultEntry): {
  local: "ACCEPTED" | "REJECTED" | "SENT";
  fa: string;
} {
  const status = entry.status ?? "";
  if (status === "SUCCESS" || entry.data?.success === true) {
    return { local: "ACCEPTED", fa: "تأیید شده توسط سازمان" };
  }
  if (status === "FAILED" || status === "TIMEOUT" || entry.data?.success === false) {
    return { local: "REJECTED", fa: status === "TIMEOUT" ? "مهلت پردازش تمام شد" : "رد شده توسط سازمان" };
  }
  return { local: "SENT", fa: "در صف پردازش سازمان" };
}

// POST /api/integrations/modian/inquiry — استعلام نتیجه ارسال‌ها
export async function POST(req: NextRequest) {
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

    const body = (await req.json().catch(() => ({}))) as {
      uids?: string[];
      all?: boolean;
      page?: number;
    };

    // منبع UIDها: بدنه درخواست یا همهٔ ارسال‌شده‌های محلی
    let targetInvoices: Array<{ id: string; modianUid: string | null; number: string }> = [];
    let uids: string[] = [];

    if (body.uids?.length) {
      uids = body.uids.slice(0, 100).map((u) => u.replace(/^TEST-/, ""));
      targetInvoices = await db.invoice.findMany({
        where: { tenantId: tenant.id, modianUid: { in: body.uids } },
        select: { id: true, modianUid: true, number: true },
      });
    } else if (body.all !== false) {
      const page = Math.max(1, Number(body.page) || 1);
      targetInvoices = await db.invoice.findMany({
        where: {
          tenantId: tenant.id,
          modianUid: { not: null },
          modianStatus: { in: ["SENT", "ACCEPTED", "REJECTED"] },
        },
        select: { id: true, modianUid: true, number: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
        skip: (page - 1) * 100,
      });
      uids = targetInvoices
        .map((inv) => inv.modianUid?.replace(/^TEST-/, "") ?? "")
        .filter(Boolean);
    }

    if (uids.length === 0) {
      return NextResponse.json({
        success: true,
        total: 0,
        entries: [],
        message: "UIDی برای استعلام وجود ندارد — ابتدا فاکتور ارسال کنید.",
      });
    }

    const inquiryResult = await inquiryByUid(connection, uids);
    if (!inquiryResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `استعلام از سامانه مودیان ناموفق بود: ${inquiryResult.errorFa}`,
          errorCode: "MODIAN_INQUIRY_FAILED",
        },
        { status: 502 }
      );
    }

    // نقشه uid → فاکتور محلی (برای به‌روزرسانی)
    const invoiceByUid = new Map<string, { id: string; number: string }>();
    for (const inv of targetInvoices) {
      if (inv.modianUid) invoiceByUid.set(inv.modianUid.replace(/^TEST-/, ""), inv);
    }

    const entries = inquiryResult.data.map((entry) => {
      const rawUid = entry.uid ?? "";
      const local = invoiceByUid.get(rawUid);
      const statusInfo = inquiryStatusToLocal(entry);
      const confirmationReferenceId = entry.data?.confirmationReferenceId ?? null;
      const errors = (entry.data?.error ?? []).map((e) => ({ code: e.code, message: e.message }));

      return {
        uid: rawUid,
        invoiceNumber: local?.number ?? null,
        status: entry.status ?? null,
        statusFa: statusInfo.fa,
        localStatus: statusInfo.local,
        confirmationReferenceId,
        ...(errors.length > 0 ? { errors } : {}),
        ...(entry.data?.warning?.length ? { warnings: entry.data.warning } : {}),
      };
    });

    // به‌روزرسانی وضعیت‌های محلی (await تا نتیجه دقیق برگردد)
    let updated = 0;
    for (const entry of entries) {
      const rawUid = entry.uid;
      const local = invoiceByUid.get(rawUid);
      if (!local) continue;
      const inv = await db.invoice.findFirst({
        where: { id: local.id, tenantId: tenant.id },
        select: { modianStatus: true },
      });
      if (inv && inv.modianStatus !== entry.localStatus) {
        // FIX(v4-مودیان/M): شناسه تأیید سازمان (confirmationReferenceId) هم ذخیره
        // می‌شود — قبلاً فقط در پاسخ نمایش داده می‌شد و در DB ثبت نمی‌شد.
        await db.invoice
          .update({
            where: { id: local.id },
            data: {
              modianStatus: entry.localStatus,
              ...(entry.confirmationReferenceId ? { modianRefId: entry.confirmationReferenceId } : {}),
            },
          })
          .then(() => {
            updated++;
          })
          .catch(() => undefined);
      } else if (inv && entry.confirmationReferenceId && inv.modianStatus === entry.localStatus) {
        // وضعیت همان بود اما شناسه تأیید تازه رسیده
        await db.invoice
          .update({ where: { id: local.id }, data: { modianRefId: entry.confirmationReferenceId } })
          .catch(() => undefined);
      }
    }

    await auditLog({
      tenantId: tenant.id,
      action: "MODIAN_INQUIRY",
      entity: "Invoice",
      changes: {
        queried: uids.length,
        env: envCfg.env,
        statuses: entries.map((e) => `${e.invoiceNumber ?? e.uid}: ${e.status ?? "?"}`),
      },
      req,
    });

    return NextResponse.json({
      success: true,
      total: entries.length,
      updated,
      entries,
    });
  } catch (error) {
    console.error("Modian inquiry error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در استعلام از سامانه مودیان" },
      { status: 500 }
    );
  }
}

// GET /api/integrations/modian/inquiry — استعلام یک UID خاص (query param)
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenant(req);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "تنانت یافت نشد" }, { status: 401 });
    }

    const uid = new URL(req.url).searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ success: false, error: "پارامتر uid الزامی است" }, { status: 400 });
    }

    const connResult = await getModianConnection(tenant.id);
    if (!connResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: modianConnectionReasonFa(connResult.reason),
          errorCode: "MODIAN_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const envCfg = await getModianEnv(tenant.id);
    const connection = applyEnvToConnection(connResult.connection, envCfg);

    const inquiryResult = await inquiryByUid(connection, [uid.replace(/^TEST-/, "")]);
    if (!inquiryResult.ok) {
      return NextResponse.json(
        { success: false, error: inquiryResult.errorFa, errorCode: "MODIAN_INQUIRY_FAILED" },
        { status: 502 }
      );
    }

    const entry = inquiryResult.data[0] ?? null;
    return NextResponse.json({
      success: true,
      uid,
      entry: entry
        ? {
            status: entry.status ?? null,
            statusFa: inquiryStatusToLocal(entry).fa,
            confirmationReferenceId: entry.data?.confirmationReferenceId ?? null,
            errors: entry.data?.error ?? [],
            warnings: entry.data?.warning ?? [],
          }
        : null,
    });
  } catch (error) {
    console.error("Modian inquiry GET error:", error);
    return NextResponse.json({ success: false, error: "خطا در استعلام" }, { status: 500 });
  }
}
