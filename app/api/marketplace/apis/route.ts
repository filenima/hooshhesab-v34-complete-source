// ============ Public API Marketplace — هوش ============
// لیست APIهای عمومی و ثبت endpoint جدید.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ GET /api/marketplace/apis ============
// لیست APIهای عمومی موجود
export async function GET() {
 try {
 const apis = getPublicApis();
 return NextResponse.json({ apis, total: apis.length });
 } catch (err) {
 // FIX(SEC-4a): پیام خام خطا در مسیر عمومی برگردانده نمی‌شود — فقط لاگ سرور
 console.error("[marketplace/apis GET]", err);
 return NextResponse.json({ error: "خطا در دریافت فهرست APIها" }, { status: 500 });
 }
}

// ============ POST /api/marketplace/apis ============
// ثبت endpoint جدید توسط توسعه‌دهنده
export async function POST(req: NextRequest) {
 try {
 if (!rateLimit("api-register", 10, 60_000)) {
 return NextResponse.json({ error: "نرخ درخواست زیاد است" }, { status: 429 });
 }

 const body = await req.json();

 const required = ["name", "description", "endpoint", "method", "authType"];
 for (const field of required) {
 if (!body[field]) {
 return NextResponse.json({ error: `فیلد ${field} الزامی است` }, { status: 400 });
 }
 }

 const apiId = `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

 // FIX(SEC-4a): سقف طول فیلدها در مسیر عمومی — قبلاً بدنهٔ بی‌کران مستقیم در
 // AuditLog ثبت می‌شد (آسیب‌پذیری DoS/بزرگی رکورد از سمت کاربر ناشناس)
 const cap = (v: unknown, n: number) => String(v ?? "").slice(0, n);

 await db.auditLog.create({
 data: {
 tenantId: "system",
 action: "API_REGISTERED",
 entity: "PublicApi",
 entityId: apiId,
 changes: JSON.stringify({
 name: cap(body.name, 120),
 description: cap(body.description, 500),
 endpoint: cap(body.endpoint, 300),
 method: cap(body.method, 10),
 authType: cap(body.authType, 40),
 documentationUrl: cap(body.documentationUrl, 300),
 status: "pending_review",
 registeredAt: new Date().toISOString(),
 }),
 },
 });

 return NextResponse.json(
 {
 success: true,
 apiId,
 status: "pending_review",
 message: "API برای بررسی ثبت شد.",
 },
 { status: 201 }
 );
 } catch (err) {
 // FIX(SEC-4a): پیام خام خطا در مسیر عمومی برگردانده نمی‌شود — فقط لاگ سرور
 console.error("[marketplace/apis POST]", err);
 return NextResponse.json({ error: "خطا در ثبت API — لطفاً دوباره تلاش کنید" }, { status: 500 });
 }
}

// ============ Sample Public APIs ============
function getPublicApis() {
 return [
 {
 id: "api_invoices",
 name: "مدیریت فاکتورها",
 description: "ایجاد، ویرایش، دریافت و حذف فاکتورهای فروش و خرید",
 category: "accounting",
 endpoint: "/api/v1/invoices",
 methods: ["GET", "POST", "PUT", "DELETE"],
 authType: "bearer",
 rateLimit: "1000/hour",
 documentationUrl: "/api-docs#invoices",
 version: "v1",
 status: "stable",
 },
 {
 id: "api_parties",
 name: "مدیریت طرف‌حساب‌ها",
 description: "CRUD کامل مشتریان، تأمین‌کنندگان و طرف‌حساب‌ها",
 category: "accounting",
 endpoint: "/api/v1/parties",
 methods: ["GET", "POST", "PUT", "DELETE"],
 authType: "bearer",
 rateLimit: "1000/hour",
 documentationUrl: "/api-docs#parties",
 version: "v1",
 status: "stable",
 },
 {
 id: "api_products",
 name: "مدیریت کالاها",
 description: "مدیریت محصولات و موجودی انبار",
 category: "inventory",
 endpoint: "/api/v1/products",
 methods: ["GET", "POST", "PUT"],
 authType: "bearer",
 rateLimit: "500/hour",
 documentationUrl: "/api-docs#products",
 version: "v1",
 status: "stable",
 },
 {
 id: "api_payments",
 name: "پرداخت‌ها",
 description: "ثبت پرداخت‌ها و دریافت‌ها و تطابق با فاکتورها",
 category: "treasury",
 endpoint: "/api/v1/payments",
 methods: ["GET", "POST"],
 authType: "bearer",
 rateLimit: "500/hour",
 documentationUrl: "/api-docs#payments",
 version: "v1",
 status: "stable",
 },
 {
 id: "api_reports",
 name: "گزارش‌های مالی",
 description: "دریافت گزارش‌های تراز، سود و زیان، جریان نقدی",
 category: "reports",
 endpoint: "/api/v1/reports/{type}",
 methods: ["GET"],
 authType: "bearer",
 rateLimit: "100/hour",
 documentationUrl: "/api-docs#reports",
 version: "v1",
 status: "stable",
 },
 {
 id: "api_ai_categorize",
 name: "دسته‌بندی هوشمند فاکتور",
 description: "پیشنهاد کد حساب معین برای آیتم‌های فاکتور با هوش مصنوعی",
 category: "ai",
 endpoint: "/api/v1/ai/categorize",
 methods: ["POST"],
 authType: "bearer",
 rateLimit: "100/hour",
 documentationUrl: "/api-docs#ai-categorize",
 version: "v1",
 status: "beta",
 },
 {
 id: "api_webhooks",
 name: "Webhooks",
 description: "ثبت webhook برای رویدادهای فاکتور، پرداخت و انبار",
 category: "integration",
 endpoint: "/api/v1/webhooks",
 methods: ["GET", "POST", "DELETE"],
 authType: "bearer",
 rateLimit: "50/hour",
 documentationUrl: "/api-docs#webhooks",
 version: "v1",
 status: "stable",
 },
 {
 id: "api_modian",
 name: "سامانه مودیان",
 description: "ارسال صورتحساب الکترونیکی به دارایی و دریافت وضعیت",
 category: "tax",
 endpoint: "/api/v1/modian/invoices",
 methods: ["POST", "GET"],
 authType: "bearer",
 rateLimit: "100/hour",
 documentationUrl: "/api-docs#modian",
 version: "v1",
 status: "stable",
 },
 ];
}
