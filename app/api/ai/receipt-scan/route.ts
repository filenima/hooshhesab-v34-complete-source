import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePlanName, PLAN_ORDER } from "@/lib/plan-features";
import { toEnglishDigits, jalaliToGregorian } from "@/lib/persian";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ============ اسکن رسید خرید با هوش مصنوعی ============
 * POST /api/ai/receipt-scan  — { image: dataURL(base64 ≤۵MB), fileName? }
 *   تصویر رسید → مدل بینایی → JSON ساخت‌یافته (فروشنده/تاریخ/اقلام/مبلغ کل/اطمینان)
 *   ذخیره در ReceiptScan (وضعیت PROCESSED یا FAILED) + ذخیره‌ی تصویر در public/uploads
 * GET /api/ai/receipt-scan   — ۲۰ اسکن آخر tenant (تاریخچه)
 *
 * واحد پول: مدل تومان برمی‌گرداند → در DB به ریال (×۱۰) BigInt ذخیره می‌شود
 * (هماهنگ با journal-entries که ورودی تومان را ×۱۰ در ریال ذخیره می‌کند و
 * ماژول هزینه که مبالغ را ریال می‌پذیرد).
 *
 * GATING (پلن): فیچر حرفه‌ای — سرور پلن tenant را از DB چک می‌کند و برای
 * پلن پایین‌تر ۴۰۳ با upgrade:true برمی‌گرداند (الگوی market-sync). ثبت کلید
 * در MODULE_PLAN_REQUIREMENTS انجام نشد چون lib/plan-features.ts خارج از
 * مالکیت فایل این تسک است؛ UI هم همین گیت را با /api/user/profile تکرار می‌کند.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ۵ مگابایت

const RECEIPT_PROMPT = `تو موتور استخراج اطلاعات رسید خرید نرم‌افزار حسابداری «هوش» هستی.
تصویر رسید خرید (فاکتور فروشگاهی، رسید فروش، قبض) که ارسال می‌شود را با دقت بخوان و اطلاعات زیر را استخراج کن:

۱. vendor — نام فروشنده / فروشگاه / ارائه‌دهنده (فارسی)
۲. date — تاریخ رسید همان‌طور که روی رسید نوشته شده (شمسی مثل 1403/05/12 یا میلادی)
۳. items — فهرست اقلام خرید: هر قلم شامل name (نام کالا)، qty (تعداد)، unitPrice (قیمت واحد به تومان)، total (مبلغ کل قلم به تومان)
۴. total — مبلغ کل نهایی رسید (پرداختی) به تومان
۵. confidence — عدد بین ۰ تا ۱ که میزان اطمینان تو از صحت استخراج است

قواعد الزامی:
- پاسخ تو باید فقط و فقط یک JSON معتبر باشد — هیچ متن اضافه، هیچ توضیح، هیچ مارک‌داون.
- ساختار دقیق JSON: {"vendor": "...", "date": "...", "items": [{"name": "...", "qty": 1, "unitPrice": 1000, "total": 1000}], "total": 5000, "confidence": 0.85}
- همه‌ی مبالغ به «تومان» (اگر روی رسید ریال بود ÷۱۰ کن، اگر «هزار تومان» بود ×۱۰۰۰ کن).
- اعداد JSON باید عدد خام انگلیسی باشند (نه رشته، نه عدد فارسی).
- اگر مقداری روی رسید موجود نبود، آن فیلد را null یا آرایه خالی بگذار — چیزی از خودت نساز.
- اگر تصویر اصلاً رسید/فاکتور خرید نبود، JSON با vendor=null و total=null و confidence=0 برگردان.`;

interface ReceiptScanRequest {
  image?: string;
  fileName?: string;
}

interface ExtractedItem {
  name: string;
  qty: number;
  unitPrice: number; // تومان
  total: number; // تومان
}

/* ---------- پارس امن JSON (حذف پرچم مارک‌داون + برش آکولادها) ---------- */
function extractJson(text: string): Record<string, unknown> | null {
  let t = (text || "").trim();
  t = t
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(t.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/* ---------- تبدیل اعداد فارسی/عربی و اعتبارسنجی عدد ---------- */
function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = toEnglishDigits(v).replace(/[,\s٬]/g, "");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/* ---------- پارس تاریخ منعطف: 1403/05/12 (شمسی) | 2024-08-01 | 01/08/2024 ---------- */
function parseFlexibleDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  const s = toEnglishDigits(String(raw).trim()).replace(/[-.]/g, "/").trim();
  if (!s) return null;
  // جدا کردن بخش ساعت (مثل «1403/05/12 14:30» یا ISO «2024-08-01T10:00»)
  const datePart = s.split(/\s+|T/)[0] || "";
  const m = datePart.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,4}))?$/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] !== undefined ? Number(m[3]) : null;
  const mk = (y: number, mo: number, d: number): Date | null => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d, 12, 0, 0); // ظهر — جلوگیری از شیفت UTC
    return Number.isNaN(dt.getTime()) ? null : dt;
  };
  if (c === null) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // سال اول (YYYY/MM/DD) — میلادی یا شمسی
  if (a > 1600) return mk(a, b, c);
  if (a >= 1200 && a <= 1600) {
    if (b < 1 || b > 12 || c < 1 || c > 31) return null; // ماه/روز شمسی نامعتبر
    const [gy, gm, gd] = jalaliToGregorian(a, b, c);
    return mk(gy, gm, gd);
  }
  // سال آخر (DD/MM/YYYY) — میلادی یا شمسی
  if (c > 1600) return mk(c, b, a);
  if (c >= 1200 && c <= 1600) {
    if (b < 1 || b > 12 || a < 1 || a > 31) return null; // ماه/روز شمسی نامعتبر
    const [gy, gm, gd] = jalaliToGregorian(c, b, a);
    return mk(gy, gm, gd);
  }
  return null;
}

/* ---------- ذخیره تصویر در پوشه خصوصی + URL امضاشده ---------- */
// FIX(SECURITY-H3): قبلاً رسیدها (اسناد مالی حساس) در public/uploads بدون
// احراز هویت قابل خواندن بودند. حالا در private-uploads با URL امضاشده.
async function saveReceiptImage(dataUrl: string): Promise<string | null> {
  try {
    const [meta, b64] = dataUrl.split(",");
    if (!b64) return null;
    const mime =
      meta?.match(/data:(image\/[a-z0-9.+-]+)/i)?.[1]?.toLowerCase() || "image/png";
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[mime] || "png";
    const buf = Buffer.from(b64, "base64");
    const { savePrivateUpload, signUploadUrl } = await import("@/lib/secure-uploads");
    const fileName = await savePrivateUpload(buf, "receipt", ext);
    // URL امضاشده با انقضای ۲۴ ساعت — قابل استفاده در <img>
    return signUploadUrl(fileName, 24 * 3600);
  } catch (e) {
    console.error("receipt-scan image save error:", e);
    return null;
  }
}

/* ---------- سریالایز پاسخ (تومان برای نمایش، ریال هم همراه) ---------- */
function serializeScan(scan: {
  id: string;
  status: string;
  vendor: string | null;
  totalAmount: bigint | null;
  scanDate: Date | null;
  items: string | null;
  confidence: number | null;
  imageUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
}) {
  // اقلام در DB به ریال ذخیره شده‌اند → برای نمایش به تومان تبدیل می‌شوند
  let items: { name: string; qty: number; unitPrice: number; total: number }[] = [];
  try {
    const parsed = scan.items ? JSON.parse(scan.items) : null;
    if (Array.isArray(parsed)) {
      items = parsed
        .map((it: Record<string, unknown>) => ({
          name: String(it?.name ?? "").slice(0, 120),
          qty: Number(it?.qty ?? 1) || 1,
          unitPrice: Math.round(Number(it?.unitPrice ?? 0) / 10), // ریال → تومان
          total: Math.round(Number(it?.total ?? 0) / 10),
        }))
        .filter((it: { name: string }) => it.name);
    }
  } catch {
    items = [];
  }
  const totalRial = scan.totalAmount != null ? Number(scan.totalAmount) : null;
  return {
    id: scan.id,
    status: scan.status,
    vendor: scan.vendor,
    totalRial, // برای پرکردن فرم هزینه (ریال)
    totalToman: totalRial != null ? Math.round(totalRial / 10) : null, // برای نمایش
    date: scan.scanDate ? scan.scanDate.toISOString() : null,
    items,
    confidence: scan.confidence,
    imageUrl: scan.imageUrl,
    errorMessage: scan.errorMessage,
    createdAt: scan.createdAt.toISOString(),
  };
}

/* ============================================================ POST */
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`receipt-scan:${ip}`, 8, 60_000)) {
      return NextResponse.json(
        { success: false, error: "سقف درخواست اسکن رسید پر شده است. یک دقیقه بعد تلاش کنید." },
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

    // ---------- گیت پلن: فقط حرفه‌ای و سازمانی ----------
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, plan: true },
    });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "حساب کاربری یافت نشد" },
        { status: 401 }
      );
    }
    const planIdx = PLAN_ORDER.indexOf(normalizePlanName(tenant.plan || ""));
    if (planIdx < PLAN_ORDER.indexOf("pro")) {
      return NextResponse.json(
        {
          success: false,
          error: "اسکن رسید با هوش مصنوعی فقط در پلن حرفه‌ای و سازمانی فعال است.",
          upgrade: true,
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { image, fileName } = (body || {}) as ReceiptScanRequest;

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { success: false, error: "تصویر رسید (base64 data URL) ارسال نشده است" },
        { status: 400 }
      );
    }
    if (!image.startsWith("data:image/")) {
      return NextResponse.json(
        { success: false, error: "تصویر باید به‌صورت data URL با پیشوند data:image/ ارسال شود" },
        { status: 400 }
      );
    }
    const base64Part = image.split(",")[1] ?? "";
    const approxBytes = Math.ceil((base64Part.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, error: "اندازه تصویر بیش از حد مجاز (۵ مگابایت) است" },
        { status: 413 }
      );
    }

    // ذخیره تصویر (شکست ذخیره، اسکن را متوقف نمی‌کند)
    const imageUrl = await saveReceiptImage(image);
    const safeFileName =
      typeof fileName === "string" ? fileName.slice(0, 180) : null;

    // ---------- فراخوانی مدل بینایی (الگوی دقیق ai/vision) ----------
    let reply = "";
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.createVision({
        model: "glm-4.6v",
        messages: [
          { role: "assistant", content: [{ type: "text", text: RECEIPT_PROMPT }] },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "این تصویر رسید خرید را اسکن کن و فقط JSON ساخت‌یافته را برگردان.",
              },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        thinking: { type: "disabled" },
      });
      reply = completion?.choices?.[0]?.message?.content ?? "";
    } catch (aiErr) {
      console.error("receipt-scan AI error:", aiErr);
      await db.receiptScan.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          imageUrl,
          fileName: safeFileName,
          status: "FAILED",
          errorMessage: "خطا در فراخوانی مدل هوش مصنوعی",
          rawText: null,
        },
      });
      return NextResponse.json(
        { success: false, error: "خوانش رسید ناموفق بود — خطا در سرویس هوش مصنوعی" },
        { status: 502 }
      );
    }

    // ---------- پارس امن پاسخ ----------
    const json = extractJson(reply);
    const vendorRaw =
      typeof json?.vendor === "string" && json.vendor.trim() ? json.vendor.trim() : null;
    const dateRaw = typeof json?.date === "string" ? json.date : null;
    const rawItems = Array.isArray(json?.items) ? (json!.items as unknown[]) : [];
    const items: ExtractedItem[] = [];
    for (const it of rawItems.slice(0, 60)) {
      if (typeof it !== "object" || it === null) continue;
      const o = it as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) continue;
      const qty = toNum(o.qty) ?? 1;
      const unitPrice = toNum(o.unitPrice) ?? 0;
      const total = toNum(o.total) ?? Math.round(qty * unitPrice);
      items.push({
        name: name.slice(0, 120),
        qty: Math.max(1, Math.round(qty) || 1),
        unitPrice: Math.max(0, Math.round(unitPrice)),
        total: Math.max(0, Math.round(total)),
      });
    }
    let totalToman = toNum(json?.total);
    if ((totalToman == null || totalToman <= 0) && items.length > 0) {
      totalToman = items.reduce((s, it) => s + it.total, 0);
    }
    if (totalToman != null && totalToman <= 0) totalToman = null;
    const confidenceRaw = toNum(json?.confidence);
    const confidence =
      confidenceRaw == null ? null : Math.min(1, Math.max(0, confidenceRaw));

    // هیچ داده‌ی معناداری استخراج نشد؟
    if (!vendorRaw && !totalToman && items.length === 0) {
      await db.receiptScan.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          imageUrl,
          fileName: safeFileName,
          status: "FAILED",
          errorMessage: "هیچ اطلاعات قابل استخراجی از تصویر پیدا نشد",
          rawText: reply.slice(0, 4000) || null,
        },
      });
      return NextResponse.json(
        { success: false, error: "خوانش رسید ناموفق بود — اطلاعات قابل استخراجی در تصویر یافت نشد" },
        { status: 422 }
      );
    }

    // ---------- تبدیل تومان → ریال BigInt (×۱۰) ----------
    const totalRial = totalToman != null ? BigInt(Math.round(totalToman * 10)) : null;
    const itemsRial = items.map((it) => ({
      name: it.name,
      qty: it.qty,
      unitPrice: Math.round(it.unitPrice * 10), // ریال
      total: Math.round(it.total * 10), // ریال
    }));

    const scanDate = parseFlexibleDate(dateRaw);

    const scan = await db.receiptScan.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        imageUrl,
        fileName: safeFileName,
        status: "PROCESSED",
        vendor: vendorRaw,
        totalAmount: totalRial,
        scanDate,
        items: JSON.stringify(itemsRial),
        rawText: reply.slice(0, 4000) || null,
        confidence,
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "AI_RECEIPT_SCAN",
      entity: "ai.receipt-scan",
      entityId: scan.id,
      changes: {
        vendor: vendorRaw,
        totalRial: totalRial ? totalRial.toString() : null,
        itemsCount: items.length,
        confidence,
        imageSize: approxBytes,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      data: serializeScan(scan),
      message: "رسید با موفقیت خوانده شد",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("receipt-scan error:", msg);
    return NextResponse.json(
      { success: false, error: "خطا در خوانش رسید. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

/* ============================================================ GET — تاریخچه */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const scans = await db.receiptScan.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({
      success: true,
      data: scans.map(serializeScan),
    });
  } catch (error: unknown) {
    console.error("receipt-scan list error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تاریخچه اسکن‌ها" },
      { status: 500 }
    );
  }
}
