import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ============ Rate limiting ساده در حافظه (ضد اسپم) ============
const RATE_WINDOW_MS = 60_000; // ۱ دقیقه
const RATE_MAX = 3; // حداکثر ۳ نظر در دقیقه از هر IP
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
 const now = Date.now();
 const entry = ipHits.get(ip);
 if (!entry || now > entry.resetAt) {
 ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
 return false;
 }
 entry.count += 1;
 return entry.count > RATE_MAX;
}

// ============ GET /api/testimonials — نظرات تاییدشده برای لندینگ ============
// عمومی — بدون auth (برای سئو و لندینگ)
export async function GET(req: NextRequest) {
 try {
 const url = new URL(req.url);
 const limit = Math.min(parseInt(url.searchParams.get("limit") || "12", 10) || 12, 24);

 const [items, agg] = await Promise.all([
 db.siteTestimonial.findMany({
 where: { status: "APPROVED" },
 orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
 take: limit,
 select: {
 id: true,
 name: true,
 role: true,
 company: true,
 rating: true,
 content: true,
 reply: true,
 featured: true,
 createdAt: true,
 },
 }),
 db.siteTestimonial.aggregate({
 where: { status: "APPROVED" },
 _avg: { rating: true },
 _count: { _all: true },
 }),
 ]);

 return NextResponse.json({
 success: true,
 data: items,
 summary: {
 averageRating: agg._avg.rating? Math.round(agg._avg.rating * 10) / 10: 5,
 totalCount: agg._count._all,
 },
 });
 } catch (error) {
 console.error("[testimonials GET]", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نظرات" },
 { status: 500 }
 );
 }
}

// ============ POST /api/testimonials — ثبت نظر جدید (عمومی) ============
export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
 req.headers.get("x-real-ip") ||
 "unknown";

 if (isRateLimited(ip)) {
 return NextResponse.json(
 { success: false, error: "درخواست‌های زیادی ارسال شده. لطفاً کمی صبر کنید." },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => null);
 if (!body) {
 return NextResponse.json(
 { success: false, error: "درخواست نامعتبر" },
 { status: 400 }
 );
 }

 const name = String(body.name || "").trim();
 const role = String(body.role || "").trim() || null;
 const company = String(body.company || "").trim() || null;
 const content = String(body.content || "").trim();
 const rating = Math.min(Math.max(parseInt(body.rating, 10) || 5, 1), 5);
 // اختیاری — اگر کاربر لاگین بود ذخیره می‌کنیم (نمایش داده نمی‌شود)
 const userEmail = String(body.email || "").trim() || null;

 // اعتبارسنجی
 if (name.length < 2 || name.length > 60) {
 return NextResponse.json(
 { success: false, error: "نام باید بین ۲ تا ۶۰ نویسه باشد" },
 { status: 400 }
 );
 }
 if (content.length < 20 || content.length > 800) {
 return NextResponse.json(
 { success: false, error: "متن نظر باید بین ۲۰ تا ۸۰۰ نویسه باشد" },
 { status: 400 }
 );
 }
 if (userEmail &&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
 return NextResponse.json(
 { success: false, error: "ایمیل نامعتبر است" },
 { status: 400 }
 );
 }

 await db.siteTestimonial.create({
 data: {
 name,
 role,
 company,
 rating,
 content,
 userEmail,
 submitIp: ip,
 status: "PENDING",
 },
 });

 return NextResponse.json({
 success: true,
 message: "نظر شما ثبت شد و پس از بررسی تیم هوش نمایش داده می‌شود. سپاس از همراهی شما!",
 });
 } catch (error) {
 console.error("[testimonials POST]", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت نظر. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}
