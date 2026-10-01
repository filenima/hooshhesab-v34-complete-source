import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ تعریف هدرهای امنیتی موردانتظار ============
type HeaderStatus = "pass" | "weak" | "missing";

interface HeaderCheck {
 key: string;
 label: string; // نام فارسی
 severity: "high" | "medium" | "low"; // اهمیت غیبت هدر
 suggested: string; // مقدار پیشنهادی
 // ارزیابی مقدار فعلی: pass = کامل، weak = هست ولی سست، missing = غایب
 evaluate: (value: string | null) => HeaderStatus;
 // دقیقاً همان خطی که باید به آرایهٔ headers() در next.config.ts اضافه شود
 fixCode: string;
 description: string;
}

const EXPECTED_HEADERS: HeaderCheck[] = [
 {
 key: "Strict-Transport-Security",
 label: "اجبار HTTPS (HSTS)",
 severity: "high",
 suggested: "max-age=31536000; includeSubDomains",
 evaluate: (v) => {
 if (!v) return "missing";
 const maxAge = Number((v.match(/max-age=(\d+)/) || [])[1] || 0);
 if (maxAge >= 31536000) return "pass";
 return "weak";
 },
 fixCode: `{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },`,
 description:
 "مرورگر را ملزم می‌کند فقط از HTTPS ارتباط برقرار کند (ضد حملات downgrade/SSL-strip).",
 },
 {
 key: "X-Content-Type-Options",
 label: "جلوگیری از MIME-Sniffing",
 severity: "high",
 suggested: "nosniff",
 evaluate: (v) => {
 if (!v) return "missing";
 return v.trim().toLowerCase() === "nosniff" ? "pass" : "weak";
 },
 fixCode: `{ key: "X-Content-Type-Options", value: "nosniff" },`,
 description: "مرورگر اجازهٔ حدس Content-Type و اجرای محتوای جعل‌شده را نمی‌گیرد.",
 },
 {
 key: "X-Frame-Options",
 label: "جلوگیری از Clickjacking",
 severity: "medium",
 suggested: "SAMEORIGIN",
 evaluate: (v) => {
 if (!v) return "missing";
 const t = v.trim().toUpperCase();
 return t === "SAMEORIGIN" || t === "DENY" ? "pass" : "weak";
 },
 fixCode: `{ key: "X-Frame-Options", value: "SAMEORIGIN" },`,
 description:
 "جلوگیری از بارگذاری سایت در iframe دامنهٔ دیگر (کلیک‌های قاب‌شده). برای پنل پیش‌نمایش sandbox باید خاموش بماند.",
 },
 {
 key: "Referrer-Policy",
 label: "سیاست ارجاع‌دهنده",
 severity: "medium",
 suggested: "strict-origin-when-cross-origin",
 evaluate: (v) => {
 if (!v) return "missing";
 const t = v.trim().toLowerCase();
 if (t === "unsafe-url" || t === "no-referrer-when-downgrade") return "weak";
 return "pass";
 },
 fixCode: `{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },`,
 description: "مقدار ارسال‌شدهٔ Referer به سایت‌های دیگر را محدود می‌کند.",
 },
 {
 key: "Permissions-Policy",
 label: "سیاست مجوزهای مرورگر",
 severity: "medium",
 suggested: "camera=(), microphone=(), geolocation=(), payment=()",
 evaluate: (v) => {
 if (!v) return "missing";
 // اگر دسترسی‌های حساس واقعاً باز باشند، ضعیف حساب می‌کنیم
 if (/camera=\*|microphone=\*|geolocation=\*/.test(v)) return "weak";
 return "pass";
 },
 fixCode: `{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },`,
 description: "دسترسی به دوربین/میکروفون/موقعیت مکانی و APIهای حساس مرورگر را قفل می‌کند.",
 },
 {
 key: "Content-Security-Policy",
 label: "سیاست امنیت محتوا (CSP)",
 severity: "high",
 suggested:
 "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors 'self'",
 evaluate: (v) => {
 if (!v) return "missing";
 // CSP با unsafe-inline و unsafe-eval روی script هنوز قابل‌عبور است — ضعیف
 if (/script-src[^;]*'unsafe-inline'[^;]*'unsafe-eval'/.test(v)) return "weak";
 return "pass";
 },
 fixCode: `{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors 'self'" },`,
 description:
 "منبع مجاز اسکریپت/استایل/تصویر را محدود می‌کند — قوی‌ترین سپر ضد XSS. مقدار پیشنهادی با Next.js سازگار است.",
 },
];

/**
 * GET /api/platform/security-headers
 * اسکن وضعیت هدرهای امنیتی سرور در حال اجرا:
 * درخواست داخلی به صفحهٔ اصلی می‌زند و هدرهای پاسخ را با چک‌لیست امنیتی مقایسه می‌کند.
 * برای هر هدر: وضعیت (pass/weak/missing)، مقدار فعلی، مقدار پیشنهادی،
 * شدت اهمیت و کد دقیق اصلاح (اسنیپت next.config.ts).
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 // درخواست داخلی به سرور در حال اجرا — فقط سمت سرور، بدون کش
 const origin = "http://127.0.0.1:3000";
 let res: Response;
 try {
 res = await fetch(`${origin}/`, {
 cache: "no-store",
 headers: { "user-agent": "hosh-security-scanner/1.0" },
 signal: AbortSignal.timeout(10000),
 });
 } catch (fetchError) {
 console.error("security-headers self-fetch error:", fetchError);
 return NextResponse.json(
 {
 success: false,
 error: "اتصال به سرور در حال اجرا برقرار نشد — اسکن هدرها ناموفق بود",
 },
 { status: 503 }
 );
 }

 const headers = res.headers;

 const results = EXPECTED_HEADERS.map((h) => {
 const current = headers.get(h.key);
 const status = h.evaluate(current);
 return {
 header: h.key,
 label: h.label,
 status, // pass | weak | missing
 current: current ?? "", // مقدار فعلی (خالی = غایب)
 suggested: h.suggested,
 severity: h.severity,
 fixCode: h.fixCode,
 description: h.description,
 };
 });

 // امتیاز: pass کامل، weak نیم‌نمره — درصد ۰ تا ۱۰۰
 const total = results.length;
 const weighted =
 results.filter((r) => r.status === "pass").length +
 results.filter((r) => r.status === "weak").length * 0.5;
 const score = Math.round((weighted / total) * 100);

 return NextResponse.json({
 success: true,
 headers: results,
 score,
 passed: results.filter((r) => r.status === "pass").length,
 weak: results.filter((r) => r.status === "weak").length,
 missing: results.filter((r) => r.status === "missing").length,
 targetUrl: "/",
 httpStatus: res.status,
 checkedAt: new Date().toISOString(),
 });
 } catch (error) {
 console.error("platform/security-headers error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اسکن هدرهای امنیتی" },
 { status: 500 }
 );
 }
}
