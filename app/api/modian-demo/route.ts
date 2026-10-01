import { NextRequest, NextResponse } from "next/server";

// ============================================================
// /api/modian-demo — پروکسی امن «آزمایشگاه صورتحساب مودیان»
// ============================================================
// ابزار عمومی لندینگ (/moadian-invoice) از این مسیر استفاده می‌کند:
//   GET  ?action=nonce            → nonce واقعی از شبیه‌ساز مودیان (3031)
//   GET  ?action=inquiry&uid=...   → استعلام وضعیت پکت دمو
//   POST {packet}                  → ارسال پکت دمو به /invoice-demo
//
// چرا پروکسی؟
//  - مرورگر در محیط‌های مختلف (داخل اپ پورت 3000 / از طریق گیت‌وی) بدون
//    اطلاع از توپولوژی سرویس‌ها کار می‌کند — مسیر نسبی همیشه یکسان است.
//  - محدودسازی نرخ (rate-limit) و پاک‌سازی ورودی قبل از رسیدن به سرویس.
//  - در استقرار واقعی، مقصد با env قابل تعویض است (MODIAN_DEMO_BASE_URL).
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODIAN_BASE = process.env.MODIAN_DEMO_BASE_URL || "http://localhost:3031";

// ---- rate-limit سبک در حافظه (۶۰ درخواست در دقیقه per-IP) ----
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || rec.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

// پاک‌سازی دوره‌ای نقشه تا نشت حافظه نداشته باشیم
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  for (const [ip, rec] of hits) if (rec.resetAt < now) hits.delete(ip);
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

const jsonErr = (status: number, message: string) =>
  NextResponse.json({ success: false, message }, { status });

export async function GET(req: NextRequest) {
  sweep();
  const ip = clientIp(req);
  if (rateLimited(ip)) return jsonErr(429, "درخواست‌های زیاد — کمی بعد دوباره امتحان کنید.");

  const action = req.nextUrl.searchParams.get("action");

  try {
    if (action === "nonce") {
      const r = await fetch(`${MODIAN_BASE}/nonce?timeToLive=200`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      const data = await r.json();
      return NextResponse.json(
        { success: true, nonce: data.nonce, expDate: data.expDate },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (action === "inquiry") {
      const uid = (req.nextUrl.searchParams.get("uid") || "").trim();
      if (!/^[a-zA-Z0-9-]{4,64}$/.test(uid)) {
        return jsonErr(400, "شناسهٔ پکت نامعتبر است.");
      }
      const r = await fetch(
        `${MODIAN_BASE}/inquiry-demo?uidList=${encodeURIComponent(uid)}`,
        { cache: "no-store", signal: AbortSignal.timeout(8_000) }
      );
      const data = await r.json();
      const first = Array.isArray(data.result) ? data.result[0] : null;
      return NextResponse.json({ success: true, result: first });
    }

    return jsonErr(400, "action نامعتبر — nonce یا inquiry.");
  } catch (err) {
    console.error("[modian-demo] GET failed:", err);
    return jsonErr(502, "شبیه‌ساز سامانه مودیان در دسترس نیست — لطفاً دوباره تلاش کنید.");
  }
}

export async function POST(req: NextRequest) {
  sweep();
  const ip = clientIp(req);
  if (rateLimited(ip)) return jsonErr(429, "درخواست‌های زیاد — کمی بعد دوباره امتحان کنید.");

  // بدنهٔ پکت: هدر + صورتحساب — فقط فیلدهای مجاز و محدود طول
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonErr(400, "بدنهٔ درخواست JSON معتبر نیست.");
  }

  // اعتبارسنجی ساختاری قبل از forwarding (دفاع عمقی)
  const header = (body?.header ?? {}) as Record<string, unknown>;
  const payload = (body?.payload ?? {}) as Record<string, unknown>;
  const nonce = typeof header.nonce === "string" ? header.nonce : "";
  const fiscalId = String(header.fiscalId ?? "");
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(nonce)) return jsonErr(400, "nonce نامعتبر — ابتدا nonce بگیرید.");
  if (!/^\d{11}$/.test(fiscalId)) return jsonErr(400, "شناسه ملی فروشنده باید دقیقاً ۱۱ رقم باشد.");

  const goods = Array.isArray(payload.goods) ? payload.goods : [];
  if (goods.length === 0 || goods.length > 20) return jsonErr(400, "فهرست کالا باید بین ۱ تا ۲۰ قلم باشد.");
  for (const g of goods) {
    const item = g as Record<string, unknown>;
    const desc = typeof item.description === "string" ? item.description.slice(0, 120) : "";
    const qty = Number(item.quantity ?? 0);
    const unit = Number(item.unitAmount ?? 0);
    if (desc.trim().length < 2) return jsonErr(400, "شرح هر قلم کالا حداقل ۲ نویسه است.");
    if (!(qty > 0) || qty > 100000) return jsonErr(400, "تعداد باید عددی بین ۱ تا ۱۰۰٬۰۰۰ باشد.");
    if (!(unit > 0) || unit > 1_000_000_000_000) return jsonErr(400, "مبلغ واحد نامعتبر است.");
  }

  try {
    const r = await fetch(`${MODIAN_BASE}/invoice-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await r.json();
    if (!r.ok) {
      return NextResponse.json(
        { success: false, errorCode: data.errorCode, message: data.message },
        { status: r.status }
      );
    }
    const first = Array.isArray(data.result) ? data.result[0] : null;
    return NextResponse.json({ success: true, result: first });
  } catch (err) {
    console.error("[modian-demo] POST failed:", err);
    return jsonErr(502, "شبیه‌ساز سامانه مودیان در دسترس نیست — لطفاً دوباره تلاش کنید.");
  }
}
