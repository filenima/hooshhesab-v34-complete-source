// ============ App Marketplace API — هوش ============
// مدیریت اپلیکیشن‌های third-party در بازار اپلیکیشن.
// GET: لیست اپ‌ها — POST: ثبت اپ جدید (developer) — POST /install: نصب برای tenant

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ GET /api/marketplace/apps ============
// پارامترهای query: category, search, sort, page, limit, installed (bool)
export async function GET(req: NextRequest) {
 try {
 const url = new URL(req.url);
 const category = url.searchParams.get("category")?? "all";
 const search = url.searchParams.get("search")?? "";
 const sort = url.searchParams.get("sort")?? "popular"; // popular | newest | rating
 const page = Math.max(1, Number(url.searchParams.get("page")?? "1"));
 const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")?? "20")));
 const installedOnly = url.searchParams.get("installed") === "true";

 const tenant = await requireTenant(req).catch(() => null);

 // FIX(SA-3): اپ‌های این نسخه نمونه/غیرفعال هستند (entryUrlها استقرار نیافته‌اند) — همه با experimental:true برچسب می‌خورند و UI باید نشانگر «آزمایشی — به‌زودی» نمایش دهد. مدل واقعی MarketplaceApp در نقشه راه است.
// در پیاده‌سازی واقعی: جدول MarketplaceApp در دیتابیس.
 // در این نسخه: داده‌ی نمونه + آمار نصب از DB.
 const allApps = getSampleApps();

 let filtered = allApps;
 if (category!== "all") {
 filtered = filtered.filter((a) => a.category === category);
 }
 if (search) {
 const q = search.toLowerCase();
 filtered = filtered.filter(
 (a) =>
 a.name.toLowerCase().includes(q) ||
 a.description.toLowerCase().includes(q) ||
 a.developer.toLowerCase().includes(q)
 );
 }

 if (sort === "newest") {
 filtered.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
 } else if (sort === "rating") {
 filtered.sort((a, b) => b.rating - a.rating);
 } else {
 // popular — sort by installs
 filtered.sort((a, b) => b.installs - a.installs);
 }

 // pagination
 const total = filtered.length;
 const offset = (page - 1) * limit;
 const paged = filtered.slice(offset, offset + limit);

 // اگر tenant مشخص است، وضعیت نصب را بررسی کن
 let installedIds: Set<string> = new Set();
 if (tenant && installedOnly) {
 // در پیاده‌سازی واقعی: query از جدول TenantAppInstallation
 // فعلاً از auditLog استفاده می‌کنیم برای track installations
 const installations = await db.auditLog.findMany({
 where: {
 tenantId: tenant.id,
 action: "APP_INSTALLED",
 },
 select: { entityId: true },
 });
 installedIds = new Set((installations.map((i) => i.entityId).filter((id): id is string => Boolean(id))));
 filtered = filtered.filter((a) => installedIds.has(a.id));
 }

 const result = paged.map((a) => ({
...a,
 // FIX(SA-3): اپ‌های نمونه — صریحاً «آزمایشی/به‌زودی» علامت‌گذاری می‌شوند تا
 // کاربر آن‌ها را اپ واقعیِ نصب‌شدنی تلقی نکند (entryUrl ها استقرار نیافته‌اند)
 experimental: true,
 status: "COMING_SOON",
 installed: tenant? installedIds.has(a.id): false,
 }));

 return NextResponse.json({
 apps: result,
 total,
 page,
 limit,
 hasMore: offset + limit < total,
 });
 } catch (err) {
 const message = err instanceof Error? err.message: String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}

// ============ POST /api/marketplace/apps ============
// ثبت اپ جدید توسط توسعه‌دهنده
export async function POST(req: NextRequest) {
 try {
 if (!rateLimit("marketplace-submit", 10, 60_000)) {
 return NextResponse.json({ error: "نرخ درخواست زیاد است" }, { status: 429 });
 }

 const tenant = await requireTenant(req);
 const body = await req.json();

 // اعتبارسنجی
 const required = ["name", "description", "category", "developer", "version", "entryUrl"];
 for (const field of required) {
 if (!body[field]) {
 return NextResponse.json({ error: `فیلد ${field} الزامی است` }, { status: 400 });
 }
 }

 const validCategories = ["accounting", "report", "sales", "integration", "tools", "ai"];
 if (!validCategories.includes(body.category)) {
 return NextResponse.json({ error: "دسته‌بندی نامعتبر" }, { status: 400 });
 }

 // ساخت رکورد اپ — در پیاده‌سازی واقعی: جدول MarketplaceApp
 const appId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

 // ثبت در auditLog (شبیه‌سازی)
 await db.auditLog.create({
 data: {
 tenantId: tenant.id,
 action: "APP_SUBMITTED",
 entity: "MarketplaceApp",
 entityId: appId,
 changes: JSON.stringify({
 name: body.name,
 description: body.description,
 category: body.category,
 developer: body.developer,
 version: body.version,
 entryUrl: body.entryUrl,
 status: "pending_review",
 submittedAt: new Date().toISOString(),
 }),
 },
 });

 return NextResponse.json(
 {
 success: true,
 appId,
 status: "pending_review",
 message: "اپ شما برای بررسی ثبت شد. ظرف ۴۸ ساعت نتیجه اعلام می‌شود.",
 },
 { status: 201 }
 );
 } catch (err) {
 const message = err instanceof Error? err.message: String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}

// ============ Sample Apps Data ============
export function getSampleApps() {
 return [
 {
 id: "app_report_builder_pro",
 name: "گزارش‌ساز حرفه‌ای",
 developer: "هوش",
 description: "ساخت گزارش‌های سفارشی با فرمول‌نویسی، نمودار پویا و export به Excel/PDF",
 category: "report",
 version: "2.4.1",
 rating: 4.7,
 installs: 1240,
 icon: "FileBarChart",
 entryUrl: "https://apps.hoosh.nobatime.ir/report-builder/remoteEntry.js",
 publishedAt: "2024-09-15",
 verified: true,
 pricing: { type: "freemium", monthlyPrice: 0, proPrice: 99000 },
 },
 {
 id: "app_zarinpal_link",
 name: "اتصال زرین‌پال",
 developer: "ZarinPal",
 description: "درگاه پرداخت آنلاین با لینک پرداخت و گزارش تراکنش‌های زرین‌پال",
 category: "integration",
 version: "3.1.0",
 rating: 4.9,
 installs: 3420,
 icon: "CreditCard",
 entryUrl: "https://apps.hoosh.nobatime.ir/zarinpal/remoteEntry.js",
 publishedAt: "2024-08-20",
 verified: true,
 pricing: { type: "free", monthlyPrice: 0 },
 },
 {
 id: "app_digi_sync",
 name: "همگام‌ساز دیجی‌کالا",
 developer: "Digikala",
 description: "همگام‌سازی خودکار سفارش‌ها و موجودی با فروشگاه دیجی‌کالا",
 category: "integration",
 version: "1.8.2",
 rating: 4.5,
 installs: 890,
 icon: "ShoppingCart",
 entryUrl: "https://apps.hoosh.nobatime.ir/digi-sync/remoteEntry.js",
 publishedAt: "2024-10-01",
 verified: true,
 pricing: { type: "paid", monthlyPrice: 149000 },
 },
 {
 id: "app_ai_categorizer",
 name: "دسته‌بند هوشمند فاکتور",
 developer: "هوش AI",
 description: "دسته‌بندی خودکار آیتم‌های فاکتور با هوش مصنوعی طبق چارت حساب‌های ایران",
 category: "ai",
 version: "1.2.0",
 rating: 4.8,
 installs: 670,
 icon: "Sparkles",
 entryUrl: "https://apps.hoosh.nobatime.ir/ai-categorizer/remoteEntry.js",
 publishedAt: "2024-10-10",
 verified: true,
 pricing: { type: "freemium", monthlyPrice: 0, proPrice: 199000 },
 },
 {
 id: "app_woo_sync",
 name: "اتصال ووکامرس",
 developer: "WooCommerce",
 description: "همگام‌سازی محصولات و سفارش‌های فروشگاه ووکامرس با هوش",
 category: "integration",
 version: "2.0.5",
 rating: 4.3,
 installs: 540,
 icon: "Store",
 entryUrl: "https://apps.hoosh.nobatime.ir/woo-sync/remoteEntry.js",
 publishedAt: "2024-07-12",
 verified: true,
 pricing: { type: "paid", monthlyPrice: 99000 },
 },
 {
 id: "app_sms_ir",
 name: "پیامک SMS.ir",
 developer: "SMS.ir",
 description: "ارسال خودکار پیامک برای فاکتور، سررسید و پرداخت با قالب‌های آماده",
 category: "integration",
 version: "1.5.1",
 rating: 4.6,
 installs: 1100,
 icon: "MessageSquare",
 entryUrl: "https://apps.hoosh.nobatime.ir/sms-ir/remoteEntry.js",
 publishedAt: "2024-06-25",
 verified: true,
 pricing: { type: "paid", monthlyPrice: 49000 },
 },
 {
 id: "app_persian_calendar",
 name: "تقویم مالی شمسی",
 developer: "هوش",
 description: "نمایش تعطیلات رسمی، مناسبت‌ها و تاریخ سررسیدها در یک تقویم کامل",
 category: "tools",
 version: "1.0.0",
 rating: 4.2,
 installs: 2100,
 icon: "Calendar",
 entryUrl: "https://apps.hoosh.nobatime.ir/persian-calendar/remoteEntry.js",
 publishedAt: "2024-11-01",
 verified: true,
 pricing: { type: "free", monthlyPrice: 0 },
 },
 {
 id: "app_bank_reconcile",
 name: "تطابق بانکی هوشمند",
 developer: "هوش AI",
 description: "تطابق خودکار تراکنش‌های بانکی با فاکتورها با الگوریتم فازی و AI",
 category: "ai",
 version: "0.9.0",
 rating: 4.4,
 installs: 320,
 icon: "Landmark",
 entryUrl: "https://apps.hoosh.nobatime.ir/bank-reconcile/remoteEntry.js",
 publishedAt: "2024-10-25",
 verified: false,
 pricing: { type: "freemium", monthlyPrice: 0, proPrice: 249000 },
 },
 ];
}
