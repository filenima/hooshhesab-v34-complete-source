// ============ Partner Program API — هوش ============
// مدیریت برنامه‌ی همکاران — لیست همکاران، درخواست همکاری، API keys، درآمد.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/auth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ GET /api/partners ============
// لیست همکاران تأییدشده — عمومی برای نمایش در سایت
export async function GET() {
 try {
 const partners = getSamplePartners();
 return NextResponse.json({ partners, total: partners.length });
 } catch (err) {
 const message = err instanceof Error? err.message: String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}

// ============ POST /api/partners ============
// درخواست همکاری — ثبت‌نام در برنامه‌ی همکاران
export async function POST(req: NextRequest) {
 try {
 if (!rateLimit("partner-apply", 5, 60_000)) {
 return NextResponse.json({ error: "نرخ درخواست زیاد است" }, { status: 429 });
 }

 const body = await req.json();

 const required = ["companyName", "contactName", "email", "phone", "partnerType"];
 for (const field of required) {
 if (!body[field]) {
 return NextResponse.json({ error: `فیلد ${field} الزامی است` }, { status: 400 });
 }
 }

 const validTypes = ["referral", "reseller", "technology", "integration"];
 if (!validTypes.includes(body.partnerType)) {
 return NextResponse.json({ error: "نوع همکاری نامعتبر" }, { status: 400 });
 }

 const partnerId = `ptn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

 // تولید API key اولیه (فعال پس از تأیید)
 const apiKey = `hh_${randomBytes(24).toString("hex")}`;

 await db.auditLog.create({
 data: {
 tenantId: "system",
 action: "PARTNER_APPLICATION",
 entity: "Partner",
 entityId: partnerId,
 changes: JSON.stringify({
 companyName: body.companyName,
 contactName: body.contactName,
 email: body.email,
 phone: body.phone,
 partnerType: body.partnerType,
 website: body.website,
 description: body.description,
 status: "pending_review",
 appliedAt: new Date().toISOString(),
 }),
 },
 });

 return NextResponse.json(
 {
 success: true,
 partnerId,
 status: "pending_review",
 message: "درخواست همکاری شما ثبت شد. ظرف ۷۲ ساعت کاری بررسی می‌شود.",
 },
 { status: 201 }
 );
 } catch (err) {
 const message = err instanceof Error? err.message: String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}

// ============ Sample Partners ============
function getSamplePartners() {
 return [
 {
 id: "ptn_zarinpal",
 companyName: "زرین‌پال",
 partnerType: "integration",
 logo: "/partners/zarinpal.svg",
 website: "https://zarinpal.com",
 description: "درگاه پرداخت آنلاین و کیف پول هوشمند",
 tier: "gold",
 since: "2023-03-15",
 revenueShare: 15,
 },
 {
 id: "ptn_digikala",
 companyName: "دیجی‌کالا",
 partnerType: "integration",
 logo: "/partners/digikala.svg",
 website: "https://digikala.com",
 description: "بازارگاه آنلاین — همگام‌سازی سفارش و موجودی",
 tier: "platinum",
 since: "2022-11-08",
 revenueShare: 20,
 },
 {
 id: "ptn_sms_ir",
 companyName: "SMS.ir",
 partnerType: "technology",
 logo: "/partners/sms-ir.svg",
 website: "https://sms.ir",
 description: "ارسال پیامک انبوه و قالب‌های آماده",
 tier: "silver",
 since: "2023-06-22",
 revenueShare: 12,
 },
 {
 id: "ptn_kasbena",
 companyName: "کسب‌وکار ما",
 partnerType: "reseller",
 logo: "/partners/kasbena.svg",
 website: "https://kasbena.ir",
 description: "نماینده‌ی فروش هوش در استان‌های جنوبی",
 tier: "silver",
 since: "2024-01-10",
 revenueShare: 25,
 },
 {
 id: "ptn_rahnama",
 companyName: "مرکز مشاوره‌ی راهنما",
 partnerType: "referral",
 logo: "/partners/rahnama.svg",
 website: "https://rahnama.com",
 description: "معرفی هوش به کسب‌وکارهای نوپا",
 tier: "bronze",
 since: "2024-04-05",
 revenueShare: 10,
 },
 {
 id: "ptn_nobatime",
 companyName: "نوباتایم",
 partnerType: "integration",
 logo: "/partners/nobatime.svg",
 website: "https://nobatime.com",
 description: "نوبت‌دهی آنلاین و تقویم کاری",
 tier: "gold",
 since: "2023-09-12",
 revenueShare: 15,
 },
 ];
}
