import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import {
  RECEIPT_TEMPLATE_IDS,
  RECEIPT_WIDTH_MAX,
  RECEIPT_WIDTH_MIN,
  parseReceiptOptions,
} from "@/lib/receipt-templates";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // ۴ مگابایت
// FIX(SEC-4a): SVG حذف شد — فایل‌ها در public/uploads سرو می‌شوند و SVG با
// اسکریپت درون‌جاسازی‌شده روی همان origin اجرا می‌شود (XSS ذخیره‌شده).
// سیاست یکسان با lib/secure-uploads (SVG ممنوع در آپلود‌های عمومی)
const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function cleanStr(v: unknown, maxLen: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

/** فیلدهای انتخابی tenant — برندینگ + تنظیمات رسید (v33-b) */
const TENANT_SELECT = {
  name: true,
  logoUrl: true,
  invoiceSlogan: true,
  invoiceWebsite: true,
  invoicePhone: true,
  invoiceAddress: true,
  receiptTemplate: true,
  receiptWidthMm: true,
  receiptAccent: true,
  receiptOptions: true,
} as const;

/** سریال‌سازی tenant برای پاسخ API — گزینه‌های رسید به‌صورت JSON پارس‌شده */
function serializeTenant(t: {
  name: string;
  logoUrl: string | null;
  invoiceSlogan: string | null;
  invoiceWebsite: string | null;
  invoicePhone: string | null;
  invoiceAddress: string | null;
  receiptTemplate: string;
  receiptWidthMm: number;
  receiptAccent: string;
  receiptOptions: string | null;
}) {
  return {
    name: t.name,
    logoUrl: t.logoUrl,
    invoiceSlogan: t.invoiceSlogan,
    invoiceWebsite: t.invoiceWebsite,
    invoicePhone: t.invoicePhone,
    invoiceAddress: t.invoiceAddress,
    receiptTemplate: (RECEIPT_TEMPLATE_IDS as string[]).includes(t.receiptTemplate)
      ? t.receiptTemplate
      : "modern",
    receiptWidthMm: Math.min(RECEIPT_WIDTH_MAX, Math.max(RECEIPT_WIDTH_MIN, t.receiptWidthMm || 80)),
    receiptAccent: /^#[0-9a-fA-F]{6}$/.test(t.receiptAccent) ? t.receiptAccent : "#0f766e",
    receiptOptions: parseReceiptOptions(t.receiptOptions),
  };
}

/**
 * GET /api/accounting/tenant-branding
 * برندینگ فاکتور کسب‌وکار: لوگو، شعار، وب‌سایت، تلفن، آدرس
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: TENANT_SELECT,
    });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "سازمان یافت نشد" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: serializeTenant(tenant) });
  } catch (error) {
    console.error("Get tenant branding error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت اطلاعات فاکتور" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/accounting/tenant-branding
 * به‌روزرسانی برندینگ فاکتور (متن‌ها) — بدنه JSON
 */
export async function PUT(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`tenant-branding:${ip}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const data = {
      invoiceSlogan: cleanStr(body.invoiceSlogan, 160),
      invoiceWebsite: cleanStr(body.invoiceWebsite, 120),
      invoicePhone: cleanStr(body.invoicePhone, 40),
      invoiceAddress: cleanStr(body.invoiceAddress, 240),
    };

    const tenant = await db.tenant.update({
      where: { id: ctx.tenantId },
      data,
      select: TENANT_SELECT,
    });

    return NextResponse.json({ success: true, data: serializeTenant(tenant) });
  } catch (error) {
    console.error("Update tenant branding error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره اطلاعات فاکتور" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/accounting/tenant-branding — ذخیرهٔ تنظیمات «طرح رسید فاکتور» (v33-b)
 * بدنهٔ JSON (همهٔ فیلدها اختیاری — فقط فیلدهای ارسالی به‌روزرسانی می‌شوند):
 *   receiptTemplate: modern|boutique|classic|bold|lux
 *   receiptWidthMm: ۴۰ تا ۳۰۰ (۵۸/۸۰/A5=۱۴۸/A4=۲۱۰/سفارشی)
 *   receiptAccent: hex رنگ تأکیدی (#rrggbb)
 *   receiptOptions: {showQr,showLogo,showBarcode,showCashier,footerMessage,fontSize}
 *   name / invoiceSlogan / invoiceWebsite / invoicePhone / invoiceAddress: اطلاعات کسب‌وکار روی رسید
 */
export async function PATCH(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`tenant-receipt-settings:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    // اطلاعات کسب‌وکار (همان فیلدهای PUT — اختیاری)
    if (body.name !== undefined) {
      const n = cleanStr(body.name, 120);
      if (!n) {
        return NextResponse.json(
          { success: false, error: "نام کسب‌وکار نمی‌تواند خالی باشد" },
          { status: 400 }
        );
      }
      data.name = n;
    }
    if (body.invoiceSlogan !== undefined) data.invoiceSlogan = cleanStr(body.invoiceSlogan, 160);
    if (body.invoiceWebsite !== undefined) data.invoiceWebsite = cleanStr(body.invoiceWebsite, 120);
    if (body.invoicePhone !== undefined) data.invoicePhone = cleanStr(body.invoicePhone, 40);
    if (body.invoiceAddress !== undefined) data.invoiceAddress = cleanStr(body.invoiceAddress, 240);

    // تنظیمات طرح رسید
    if (body.receiptTemplate !== undefined) {
      const t = String(body.receiptTemplate);
      if (!(RECEIPT_TEMPLATE_IDS as string[]).includes(t)) {
        return NextResponse.json(
          { success: false, error: "قالب رسید نامعتبر است" },
          { status: 400 }
        );
      }
      data.receiptTemplate = t;
    }
    if (body.receiptWidthMm !== undefined) {
      const w = Math.round(Number(body.receiptWidthMm));
      if (!Number.isFinite(w) || w < RECEIPT_WIDTH_MIN || w > RECEIPT_WIDTH_MAX) {
        return NextResponse.json(
          { success: false, error: `عرض کاغذ باید بین ${RECEIPT_WIDTH_MIN} تا ${RECEIPT_WIDTH_MAX} میلی‌متر باشد` },
          { status: 400 }
        );
      }
      data.receiptWidthMm = w;
    }
    if (body.receiptAccent !== undefined) {
      const a = String(body.receiptAccent).trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(a)) {
        return NextResponse.json(
          { success: false, error: "رنگ تأکیدی باید کد hex معتبر باشد" },
          { status: 400 }
        );
      }
      data.receiptAccent = a;
    }
    if (body.receiptOptions !== undefined && body.receiptOptions !== null) {
      // نرمال‌سازی از طریق همان تجزیه‌کنندهٔ سرور — گزینه‌های ناشناخته حذف می‌شوند
      const o = parseReceiptOptions(JSON.stringify(body.receiptOptions));
      data.receiptOptions = JSON.stringify(o);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: "فیلدی برای ذخیره ارسال نشده است" },
        { status: 400 }
      );
    }

    const tenant = await db.tenant.update({
      where: { id: ctx.tenantId },
      data,
      select: TENANT_SELECT,
    });

    return NextResponse.json({ success: true, data: serializeTenant(tenant) });
  } catch (error) {
    console.error("Update tenant receipt settings error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره تنظیمات رسید" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounting/tenant-branding — آپلود لوگوی فاکتور (multipart/form-data)
 * فیلد: logo (png/jpg/webp/svg/gif — حداکثر ۴MB)
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`tenant-branding-logo:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("logo") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "فایل الزامی است" },
        { status: 400 }
      );
    }

    const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { success: false, error: "فقط تصویر (PNG، JPG، WebP، GIF) مجاز است" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "حجم فایل نباید بیش از ۴ مگابایت باشد" },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: "فایل خالی است" },
        { status: 400 }
      );
    }

    const fileName = `tenant-logo-${ctx.tenantId}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, fileName), buffer);

    const logoUrl = `/uploads/${fileName}`;
    const tenant = await db.tenant.update({
      where: { id: ctx.tenantId },
      data: { logoUrl },
      select: TENANT_SELECT,
    });

    return NextResponse.json({ success: true, data: serializeTenant(tenant) });
  } catch (error) {
    console.error("Upload tenant logo error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در آپلود لوگو" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/accounting/tenant-branding — حذف لوگو
 */
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenant = await db.tenant.update({
      where: { id: ctx.tenantId },
      data: { logoUrl: null },
      select: TENANT_SELECT,
    });
    return NextResponse.json({ success: true, data: serializeTenant(tenant) });
  } catch (error) {
    console.error("Delete tenant logo error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف لوگو" },
      { status: 500 }
    );
  }
}
