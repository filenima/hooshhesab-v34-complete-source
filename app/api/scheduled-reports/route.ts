import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit, getClientIp } from "@/lib/auth";
import { toJalali, toPersianDigits } from "@/lib/persian";
import { isValidEmail } from "@/lib/email-sender";
import {
  REPORT_FREQUENCIES,
  REPORT_TYPES,
  MAX_REPORTS_PER_TENANT,
  MAX_RECIPIENTS,
  FREQUENCY_LABELS_FA,
  REPORT_TYPE_LABELS_FA,
  computeNextRunAt,
  describeScheduleFa,
  isScheduledReportsPlanAllowed,
  parseRecipients,
} from "@/lib/scheduled-report-engine";

export const runtime = "nodejs";

const isDev = process.env.NODE_ENV !== "production";

/** قالب خروجی هر گزارش برای UI */
function serializeReport(r: {
  id: string;
  name: string;
  frequency: string;
  reportType: string;
  recipients: string;
  format: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  hour: number;
  isActive: boolean;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const nextRunAt = computeNextRunAt(
    { frequency: r.frequency, dayOfWeek: r.dayOfWeek, dayOfMonth: r.dayOfMonth, hour: r.hour },
    new Date()
  );
  return {
    id: r.id,
    name: r.name,
    frequency: r.frequency,
    frequencyLabel: FREQUENCY_LABELS_FA[r.frequency] || r.frequency,
    reportType: r.reportType,
    reportTypeLabel: REPORT_TYPE_LABELS_FA[r.reportType] || r.reportType,
    recipients: parseRecipients(r.recipients),
    format: r.format,
    dayOfMonth: r.dayOfMonth,
    dayOfWeek: r.dayOfWeek,
    hour: r.hour,
    isActive: r.isActive,
    scheduleFa: describeScheduleFa({
      frequency: r.frequency,
      dayOfWeek: r.dayOfWeek,
      dayOfMonth: r.dayOfMonth,
      hour: r.hour,
    }),
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    lastRunAtJalali: r.lastRunAt ? toJalali(r.lastRunAt) : null,
    lastRunStatus: r.lastRunStatus,
    lastError: r.lastError,
    nextRunAt: nextRunAt.toISOString(),
    nextRunAtJalali: toJalali(nextRunAt),
    createdAt: r.createdAt.toISOString(),
    createdAtJalali: toJalali(r.createdAt),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** اعتبارسنجی مشترک POST/PUT — خطاها فارسی */
function validatePayload(body: Record<string, unknown>): {
  data?: {
    name: string;
    frequency: string;
    reportType: string;
    recipients: string[];
    format: string;
    dayOfMonth: number | null;
    dayOfWeek: number | null;
    hour: number;
    isActive: boolean;
  };
  error?: string;
} {
  const name = String(body.name || "").trim();
  if (name.length < 3 || name.length > 80) {
    return { error: "نام گزارش باید بین ۳ تا ۸۰ نویسه باشد" };
  }

  const frequency = String(body.frequency || "");
  if (!REPORT_FREQUENCIES.includes(frequency as (typeof REPORT_FREQUENCIES)[number])) {
    return { error: "دوره تکرار نامعتبر است (روزانه/هفتگی/ماهانه/فصلی)" };
  }

  const reportType = String(body.reportType || "");
  if (!REPORT_TYPES.includes(reportType as (typeof REPORT_TYPES)[number])) {
    return { error: "نوع گزارش نامعتبر است" };
  }

  const recipientsRaw = body.recipients;
  if (!Array.isArray(recipientsRaw) || recipientsRaw.length === 0) {
    return { error: "حداقل یک گیرنده ایمیل وارد کنید" };
  }
  const recipients = recipientsRaw.map((r) => String(r || "").trim().toLowerCase()).filter(Boolean);
  if (recipients.length === 0) {
    return { error: "حداقل یک گیرنده ایمیل وارد کنید" };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return { error: `حداکثر ${toPersianDigits(MAX_RECIPIENTS)} گیرنده برای هر گزارش مجاز است` };
  }
  for (const email of recipients) {
    if (!isValidEmail(email)) {
      return { error: `ایمیل ${email} معتبر نیست` };
    }
  }

  const format = String(body.format || "HTML");
  if (!["HTML", "JSON"].includes(format)) {
    return { error: "قالب گزارش نامعتبر است (HTML یا JSON)" };
  }

  const hour = Number(body.hour ?? 8);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { error: "ساعت ارسال باید بین ۰ تا ۲۳ باشد" };
  }

  let dayOfWeek: number | null = null;
  let dayOfMonth: number | null = null;
  if (frequency === "WEEKLY") {
    const d = Number(body.dayOfWeek);
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      return { error: "برای گزارش هفتگی، روز هفته (۰ تا ۶) الزامی است" };
    }
    dayOfWeek = d;
  }
  if (frequency === "MONTHLY" || frequency === "QUARTERLY") {
    const d = Number(body.dayOfMonth);
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      return frequency === "MONTHLY"
        ? { error: "برای گزارش ماهانه، روز ماه (۱ تا ۳۱) الزامی است" }
        : { error: "برای گزارش فصلی، روز ماه (۱ تا ۳۱) الزامی است" };
    }
    dayOfMonth = d;
  }

  return {
    data: {
      name,
      frequency,
      reportType,
      recipients,
      format,
      dayOfMonth,
      dayOfWeek,
      hour,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    },
  };
}

// GET /api/scheduled-reports — فهرست گزارش‌های tenant (با تاریخ جلالی و nextRun)
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const [reports, tenant] = await Promise.all([
      db.scheduledReport.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
      }),
      db.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { plan: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: reports.map(serializeReport),
      planAllowed: isScheduledReportsPlanAllowed(tenant?.plan),
      maxReports: MAX_REPORTS_PER_TENANT,
    });
  } catch (error) {
    console.error("Scheduled reports list error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت گزارش‌های دوره‌ای", ...(isDev && { devMessage: String(error) }) },
      { status: 500 }
    );
  }
}

// POST /api/scheduled-reports — ایجاد گزارش جدید (ویژگی پلن حرفه‌ای)
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(`scheduled-report-create:${ip}`, 20, 60_000)) {
      return NextResponse.json({ success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." }, { status: 429 });
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = validatePayload(body);
    if (!parsed.data) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const data = parsed.data;

    // GATING: قابلیت پلن حرفه‌ای و بالاتر
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { plan: true },
    });
    if (!isScheduledReportsPlanAllowed(tenant?.plan)) {
      return NextResponse.json(
        {
          success: false,
          error: "گزارش‌های دوره‌ای خودکار در پلن حرفه‌ای فعال است. برای استفاده، پلن خود را ارتقا دهید.",
          upgrade: true,
        },
        { status: 403 }
      );
    }

    // سهمیه: حداکثر ۱۰ گزارش برای هر tenant
    const count = await db.scheduledReport.count({ where: { tenantId: ctx.tenantId } });
    if (count >= MAX_REPORTS_PER_TENANT) {
      return NextResponse.json(
        { success: false, error: `حداکثر ${toPersianDigits(MAX_REPORTS_PER_TENANT)} گزارش برای هر سازمان مجاز است` },
        { status: 400 }
      );
    }

    const created = await db.scheduledReport.create({
      data: {
        tenantId: ctx.tenantId,
        name: data.name,
        frequency: data.frequency,
        reportType: data.reportType,
        recipients: JSON.stringify(data.recipients),
        format: data.format,
        dayOfMonth: data.dayOfMonth,
        dayOfWeek: data.dayOfWeek,
        hour: data.hour,
        isActive: data.isActive,
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "CREATE",
      entity: "ScheduledReport",
      entityId: created.id,
      changes: { name: data.name, frequency: data.frequency, reportType: data.reportType },
      req,
    });

    return NextResponse.json({
      success: true,
      data: serializeReport(created),
      message: "گزارش دوره‌ای با موفقیت ایجاد شد",
    });
  } catch (error) {
    console.error("Create scheduled report error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد گزارش دوره‌ای", ...(isDev && { devMessage: String(error) }) },
      { status: 500 }
    );
  }
}

// PUT /api/scheduled-reports?id=xxx — ویرایش (فقط مالک tenant)
export async function PUT(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(`scheduled-report-update:${ip}`, 20, 60_000)) {
      return NextResponse.json({ success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." }, { status: 429 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "شناسه گزارش الزامی است" }, { status: 400 });
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const existing = await db.scheduledReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "گزارش یافت نشد" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = validatePayload(body);
    if (!parsed.data) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const data = parsed.data;

    // GATING پلن
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { plan: true },
    });
    if (!isScheduledReportsPlanAllowed(tenant?.plan)) {
      return NextResponse.json(
        {
          success: false,
          error: "گزارش‌های دوره‌ای خودکار در پلن حرفه‌ای فعال است. برای ویرایش، پلن خود را ارتقا دهید.",
          upgrade: true,
        },
        { status: 403 }
      );
    }

    const updated = await db.scheduledReport.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        frequency: data.frequency,
        reportType: data.reportType,
        recipients: JSON.stringify(data.recipients),
        format: data.format,
        dayOfMonth: data.dayOfMonth,
        dayOfWeek: data.dayOfWeek,
        hour: data.hour,
        isActive: data.isActive,
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "UPDATE",
      entity: "ScheduledReport",
      entityId: existing.id,
      changes: { name: data.name, frequency: data.frequency },
      req,
    });

    return NextResponse.json({
      success: true,
      data: serializeReport(updated),
      message: "گزارش دوره‌ای به‌روزرسانی شد",
    });
  } catch (error) {
    console.error("Update scheduled report error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در به‌روزرسانی گزارش دوره‌ای", ...(isDev && { devMessage: String(error) }) },
      { status: 500 }
    );
  }
}

// DELETE /api/scheduled-reports?id=xxx — حذف (فقط مالک tenant)
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "شناسه گزارش الزامی است" }, { status: 400 });
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const existing = await db.scheduledReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "گزارش یافت نشد" }, { status: 404 });
    }

    await db.scheduledReport.delete({ where: { id: existing.id } });

    await auditLog({
      tenantId: ctx.tenantId,
      action: "DELETE",
      entity: "ScheduledReport",
      entityId: existing.id,
      changes: { name: existing.name },
      req,
    });

    return NextResponse.json({
      success: true,
      message: "گزارش دوره‌ای حذف شد",
    });
  } catch (error) {
    console.error("Delete scheduled report error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف گزارش دوره‌ای", ...(isDev && { devMessage: String(error) }) },
      { status: 500 }
    );
  }
}
