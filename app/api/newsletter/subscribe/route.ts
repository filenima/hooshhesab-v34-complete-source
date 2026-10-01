import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";

// ============================================================
// POST /api/newsletter/subscribe — ثبت‌نام عمومی در خبرنامه
// ============================================================
// عمومی (بدون احراز هویت) با دفاع ضدتقلب:
//  - اعتبارسنجی ایمیل + نرمال‌سازی
//  - rate-limit هر IP (۵ ثبت در ۱۰ دقیقه)
//  - هش IP (SHA-256 + salt روزانه) — IP خام ذخیره نمی‌شود
//  - idempotent: ایمیل تکراری → موفق با پیام «قبلاً عضو»
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;

const attempts = new Map<string, number[]>();

function ipHash(ip: string): string {
  const day = new Date().toISOString().slice(0, 10); // salt روزانه
  return crypto.createHash("sha256").update(`${day}:${ip}`).digest("hex").slice(0, 24);
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  attempts.set(key, arr);
  if (attempts.size > 5000) {
    // پاک‌سازی سبک
    for (const [k, v] of attempts) {
      if (v.every((t) => now - t >= WINDOW_MS)) attempts.delete(k);
    }
  }
  return arr.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  let body: { email?: unknown; name?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "درخواست نامعتبر است." }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : undefined;
  // v24 — منابع مجاز + پسوند variant برای A/B (مثل landing-A / roi-calculator-B)
  const ALLOWED_SOURCES = [
    "landing",
    "calculators",
    "moadian",
    "blog",
    "glossary",
    "financial-health", // v23 — سنجش سلامت مالی
    "roi-calculator", // v24 — ماشین‌حساب بازگشت سرمایه
    "compare-plans", // v25 — مقایسهٔ پلن‌ها
    "widgets", // v27 — دایرکتوری ویجت‌های شرکا
    "partners", // v29 — برنامهٔ شراکت
  ];
  const rawSource = String(body.source ?? "").trim();
  const baseSource = rawSource.replace(/-[AB]$/i, "");
  const source =
    ALLOWED_SOURCES.includes(baseSource) && rawSource.length <= 40 ? rawSource : "landing";

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ success: false, message: "ایمیل واردشده معتبر نیست." }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const hashed = ipHash(ip);

  if (rateLimited(hashed)) {
    return NextResponse.json(
      { success: false, message: "درخواست‌های زیاد — کمی بعد دوباره امتحان کنید." },
      { status: 429 }
    );
  }

  try {
    // idempotent — اگر قبلاً عضو است:
    const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
    if (existing) {
      if (existing.status === "UNSUBSCRIBED") {
        // بازگشت داوطلبانه
        await db.newsletterSubscriber.update({
          where: { email },
          data: { status: "ACTIVE", updatedAt: new Date() },
        });
        return NextResponse.json({ success: true, message: "خوش آمدید — عضویت شما دوباره فعال شد." });
      }
      return NextResponse.json({ success: true, message: "شما قبلاً عضو خبرنامه هستید." });
    }

    await db.newsletterSubscriber.create({
      data: { email, name: name || null, source, ipHash: hashed },
    });

    return NextResponse.json({
      success: true,
      message: "عضویت انجام شد — نکات مالیاتی و به‌روزرسانی‌ها به ایمیل شما می‌آید.",
    });
  } catch (err) {
    console.error("[newsletter] subscribe failed:", err);
    return NextResponse.json(
      { success: false, message: "خطای سرور — لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

// ============================================================
// GET /api/newsletter/subscribe?unsubscribe=EMAIL — لغو عضویت یک‌کلیکی (v34)
// ============================================================
// لینک «لغو عضویت» در پایین ایمیل‌های خبرنامه به همین مسیر اشاره می‌کند؛
// کلیک مشترک → وضعیت UNSUBSCRIBED (idempotent) + صفحهٔ تأیید فارسی HTML.
// ایمیل خام هرگز در پاسخ نمایش داده نمی‌شود (فقط وضعیت عملیات).

function unsubscribePage(ok: boolean, already: boolean): NextResponse {
  const title = ok ? "لغو عضویت انجام شد" : "لغو عضویت ناموفق بود";
  const body = ok
    ? already
      ? "عضویت شما پیش از این لغو شده بود؛ در صورت تمایل می‌توانید دوباره عضو شوید."
      : "از این پس ایمیل‌های خبرنامه برای شما ارسال نمی‌شود. اگر اشتباه بوده، از فرم خبرنامهٔ سایت دوباره عضو شوید."
    : "لینک نامعتبر است یا مشکلی پیش آمد. اگر مشکل ادامه داشت با پشتیبانی تماس بگیرید.";
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, follow" />
<title>${title}</title>
<style>
body { font-family: Vazirmatn, Tahoma, 'Segoe UI', sans-serif; background: #F6F8F7; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
.card { background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; max-width: 420px; width: calc(100% - 32px); padding: 32px 28px; text-align: center; }
.badge { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 16px; background: ${ok ? "#E6F6F0" : "#FEF2F2"}; color: ${ok ? "#047857" : "#DC2626"}; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; }
h1 { font-size: 17px; color: #1F2937; margin: 0 0 10px; }
p { font-size: 13px; color: #6B7280; line-height: 2.1; margin: 0 0 20px; }
a.btn { display: inline-block; background: #0E9F6E; color: #FFFFFF; text-decoration: none; border-radius: 10px; padding: 10px 26px; font-size: 13px; font-weight: 700; }
</style>
</head>
<body>
<div class="card">
<div class="badge">${ok ? "&#10003;" : "&#10007;"}</div>
<h1>${title}</h1>
<p>${body}</p>
<a class="btn" href="/">بازگشت به صفحهٔ اصلی</a>
</div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// صفحهٔ توضیحی برای GET بدون پارامتر — کاربری که آدرس اندپوینت را مستقیم باز
// می‌کند نباید «لغو عضویت ناموفق» ببیند؛ توضیح صادقانه + راهنمای مسیر درست.
function infoPage(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, follow" />
<title>خبرنامهٔ هوش</title>
<style>
body { font-family: Vazirmatn, Tahoma, 'Segoe UI', sans-serif; background: #F6F8F7; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
.card { background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; max-width: 420px; width: calc(100% - 32px); padding: 32px 28px; text-align: center; }
.badge { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 16px; background: #E6F6F0; color: #047857; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; }
h1 { font-size: 17px; color: #1F2937; margin: 0 0 10px; }
p { font-size: 13px; color: #6B7280; line-height: 2.1; margin: 0 0 20px; }
a.btn { display: inline-block; background: #0E9F6E; color: #FFFFFF; text-decoration: none; border-radius: 10px; padding: 10px 26px; font-size: 13px; font-weight: 700; }
</style>
</head>
<body>
<div class="card">
<div class="badge">&#9993;</div>
<h1>خبرنامهٔ هوش‌حساب</h1>
<p>این آدرس، خط خدماتی خبرنامه است؛ برای عضویت از فرم خبرنامه در سایت استفاده کنید.<br />لغو عضویت فقط از طریق لینک پایین ایمیل‌های خبرنامه انجام می‌شود.</p>
<a class="btn" href="/">بازگشت به صفحهٔ اصلی</a>
</div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("unsubscribe");
  if (!raw) {
    return infoPage();
  }
  const email = decodeURIComponent(raw).trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return unsubscribePage(false, false);
  }

  try {
    const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
    if (!existing) {
      // عضو نیست → نمایش همان صفحهٔ موفق (افشای عضویت نداریم؛ عملیات idempotent)
      return unsubscribePage(true, false);
    }
    if (existing.status === "UNSUBSCRIBED") {
      return unsubscribePage(true, true);
    }
    await db.newsletterSubscriber.update({
      where: { email },
      data: { status: "UNSUBSCRIBED", updatedAt: new Date() },
    });
    return unsubscribePage(true, false);
  } catch (err) {
    console.error("[newsletter] unsubscribe failed:", err);
    return unsubscribePage(false, false);
  }
}
