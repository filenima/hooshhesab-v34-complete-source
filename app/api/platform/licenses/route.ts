import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateLicenseKey } from "@/lib/platform-auth";
import { hashLicenseKey, maskLicenseKey } from "@/lib/license-security";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { normalizePlanName, VALID_PLANS, getEffectiveLicenseDefaults } from "@/lib/plans";

export const runtime = "nodejs";

// SECURITY (SA-CRIT-4): maskLicenseKey اکنون در lib/license-security.ts تعریف شده
// و در همه‌ی اندپوینت‌های platform که لایسنس برمی‌گردانند به‌صورت مشترک استفاده می‌شود.
// کلید کامل فقط در پاسخ POST (ایجاد لایسنس) یک‌بار نمایش داده می‌شود.

// GET /api/platform/licenses — لیست همه لایسنس‌ها
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const status = searchParams.get("status");

 const where: Record<string, unknown> = {};
 if (status) where.status = status;

 const licenses = await db.license.findMany({
 where,
 include: {
 tenant: { select: { id: true, name: true, plan: true, status: true } },
 },
 orderBy: { createdAt: "desc" },
 });

 // SECURITY (SA-CRIT-4): کلید لایسنس هرگز در پاسخ لیست به‌صورت plaintext بازگردانده
 // نمی‌شود. نسخه‌ی ماسک‌شده (مثلاً ABCDE...XYZW) بازگردانده می‌شود — کلید کامل
 // فقط در زمان ساخت (POST) یک‌بار قابل مشاهده است.
 const masked = licenses.map((l) => ({
...l,
 key: maskLicenseKey(l.key),
 }));

 return NextResponse.json({ success: true, data: masked });
 } catch (error) {
 console.error("List licenses error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لایسنس‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/platform/licenses — ایجاد لایسنس جدید
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const {
 plan = "pro",
 maxUsers,
 maxInvoices,
 maxWarehouses,
 features = [],
 endDate,
 tenantId,
 } = body;

 // نرمال‌سازی نام پلن — یکپارچه‌سازی starter/business/accountant با free/pro
 const normalizedPlan = normalizePlanName(plan);
 if (!VALID_PLANS.includes(normalizedPlan)) {
 return NextResponse.json(
 { success: false, error: "پلن نامعتبر" },
 { status: 400 }
 );
 }

 // FIX(v18-لایسنس): منبع واحد تنظیمات پلن — قبلاً اینجا ۴ ماتریس ناسازگار وجود داشت
 // (basic=۳ کاربر/۵۰۰۰ فاکتور) که با lib/plans.ts (basic=۱ کاربر/۲۴۰۰ فاکتور) تناقض داشت.
 // حالا همه از getLicenseDefaults می‌خوانند؛ سوپرادمین همچنان می‌تواند در دیالوگ،
 // مقادیر دلخواه (maxUsers و...) را دستی override کند.
 // FIX(4-a): مقادیر پیش‌فرضِ هاردکد (۵/۱۰۰۰/۳) از destructuring حذف شدند —
 // قبلاً حتی وقتی فرم فیلدی نمی‌فرستاد، این مقادیر به‌جای سهمیه‌ی واقعی پلن
 // (مثلاً pro=۲ کاربر/۱۵۰۰۰ فاکتور) اعمال می‌شدند. حالا omit → getLicenseDefaults.
 const defaults = await getEffectiveLicenseDefaults(normalizedPlan);
 const finalMaxUsers = maxUsers || defaults.maxUsers;
 const finalMaxInvoices = maxInvoices || defaults.maxInvoices;
 const finalMaxWarehouses = maxWarehouses || defaults.maxWarehouses;
 const finalFeatures = features.length? features: defaults.features;

 const key = generateLicenseKey();
 const keyHash = hashLicenseKey(key);

 const license = await db.license.create({
 data: {
 key,
 keyHash,
 plan: normalizedPlan,
 maxUsers: finalMaxUsers,
 maxInvoices: finalMaxInvoices,
 maxWarehouses: finalMaxWarehouses,
 features: JSON.stringify(finalFeatures),
 status: "ACTIVE",
 issuedBy: auth.admin.id,
 endDate: endDate? new Date(endDate): null,
 tenantId: tenantId || null,
 // FIX(4-a): activatedAt فقط از مسیر /api/license/activate ست می‌شود.
 // صدور لایسنس با tenantId یعنی «صادرشده برای این سازمان» نه «فعال‌شده» —
 // قبلاً activatedAt همین‌جا ست می‌شد، در نتیجه اولین فعال‌سازی واقعی توسط
 // کاربر (همگام‌سازی plan تنانت + isTrial=false) از دوباره‌فعال‌سازی قابل
 // تشخیص نبود و پاسخ تکراری هم «موفق» برمی‌گشت.
 activatedAt: null,
 },
 });

 // SECURITY (SA-HIGH-8): کلید لایسنس هرگز به‌صورت plaintext در لاگ ممیزی ذخیره نمی‌شود.
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CREATE_LICENSE",
 entity: "License",
 entityId: license.id,
 details: JSON.stringify({
 key: maskLicenseKey(key),
 plan: normalizedPlan,
 maxUsers: finalMaxUsers,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: license,
 message: `لایسنس ایجاد شد: ${key}`,
 });
 } catch (error) {
 console.error("Create license error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد لایسنس" },
 { status: 500 }
 );
 }
}
