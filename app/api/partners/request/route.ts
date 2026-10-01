import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";

// ============================================================
// POST /api/partners/request — ثبت درخواست برنامهٔ شراکت (v29)
// ============================================================
// عمومی (بدون احراز هویت) با دفاع ضدتقلب:
//  - اعتبارسنجی عمیق فیلدها (نام/موبایل/ایمیل اختیاری)
//  - rate-limit هر IP (۳ درخواست در ۱۵ دقیقه)
//  - هش IP (SHA-256 + salt روزانه) — IP خام ذخیره نمی‌شود
//  - idempotent-ish: تلفن تکراری با وضعیت فعال → پیام «در انتظار بررسی»
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHONE_RE = /^09\d{9}$/; // پس از نرمال‌سازی
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const WINDOW_MS = 15 * 60_000;
const MAX_PER_WINDOW = 3;

// نرمال‌سازی موبایل ایرانی: ارقام فارسی/عربی → لاتین، حذف +98/98/+/فاصله
function normalizePhone(raw: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  let s = String(raw).trim();
  s = s.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
  s = s.replace(/[\s-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return s;
}

const AUDIENCES = ["accountant", "consultant", "blogger", "agency", "incubator", "other"];
const CHANNELS = ["widgets", "content", "seminars", "direct", "other"];

const attempts = new Map<string, number[]>();

function ipHash(ip: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${day}:${ip}`).digest("hex").slice(0, 24);
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  attempts.set(key, arr);
  if (attempts.size > 3000) {
    for (const [k, v] of attempts) {
      if (v.every((t) => now - t >= WINDOW_MS)) attempts.delete(k);
    }
  }
  return arr.length > MAX_PER_WINDOW;
}

function sanitize(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (!s) return undefined;
  return s.slice(0, max);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "درخواست نامعتبر است." }, { status: 400 });
  }

  const name = sanitize(body.name, 80);
  const phoneRaw = sanitize(body.phone, 20);
  const email = sanitize(body.email, 254)?.toLowerCase();
  const company = sanitize(body.company, 100);
  const city = sanitize(body.city, 60);
  const website = sanitize(body.website, 200);
  const message = sanitize(body.message, 1500);
  const audience = AUDIENCES.includes(String(body.audience)) ? String(body.audience) : "other";
  const channel = CHANNELS.includes(String(body.channel)) ? String(body.channel) : "other";
  const monthlyVisitorsRaw = Number(body.monthlyVisitors);

  if (!name || name.length < 3) {
    return NextResponse.json({ success: false, message: "نام و نام خانوادگی را کامل وارد کنید." }, { status: 400 });
  }
  if (!phoneRaw) {
    return NextResponse.json({ success: false, message: "شمارهٔ موبایل الزامی است." }, { status: 400 });
  }
  const phone = normalizePhone(phoneRaw);
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ success: false, message: "شمارهٔ موبایل معتبر نیست (مثل ۰۹۱۲۳۴۵۶۷۸۹)." }, { status: 400 });
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ success: false, message: "ایمیل واردشده معتبر نیست." }, { status: 400 });
  }
  if (website && !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(website.replace(/^https?:\/\//, ""))) {
    return NextResponse.json({ success: false, message: "آدرس سایت معتبر نیست." }, { status: 400 });
  }
  const monthlyVisitors =
    Number.isFinite(monthlyVisitorsRaw) && monthlyVisitorsRaw >= 0
      ? Math.min(Math.round(monthlyVisitorsRaw), 50_000_000)
      : null;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const hashed = ipHash(ip);

  if (rateLimited(hashed)) {
    return NextResponse.json(
      { success: false, message: "درخواست‌های زیادی ارسال کرده‌اید. کمی بعد دوباره تلاش کنید." },
      { status: 429 }
    );
  }

  try {
    // تلفن تکراری با وضعیت غیرردشده → همان درخواست قبلی زنده است
    const existing = await db.partnerRequest.findFirst({
      where: { phone, status: { not: "REJECTED" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        message: "درخواست همکاری شما قبلاً ثبت شده و در حال بررسی است. تیم شراکت به‌زودی با شما تماس می‌گیرد.",
        duplicate: true,
      });
    }

    await db.partnerRequest.create({
      data: {
        name,
        phone,
        email: email || null,
        company: company || null,
        city: city || null,
        website: website || null,
        audience,
        channel,
        monthlyVisitors,
        message: message || null,
        ipHash: hashed,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        "درخواست شما با موفقیت ثبت شد. کارشناس برنامهٔ شراکت طی ۲ روز کاری تماس می‌گیرد و کد اختصاصی نمایندگی + آموزش شروع را برایتان می‌فرستد.",
    });
  } catch (err) {
    console.error("[partners/request] db error:", err);
    return NextResponse.json(
      { success: false, message: "خطای سرور در ثبت درخواست. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
