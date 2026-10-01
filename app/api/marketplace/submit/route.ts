import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthContext } from "@/lib/auth";
import { rateLimitCheck } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/marketplace/submit
// ثبت درخواست توسعه‌دهنده برای انتشار اپ در بازار اپلیکیشن هوش.
// اپ در حالت pending_review ثبت می‌شود و پس از تأیید ادمین منتشر می‌گردد.
// رکورد در AuditLog با action=APP_SUBMITTED ذخیره می‌شود.
export async function POST(req: NextRequest) {
 try {
 // محدودیت نرخ: ۱۰ ثبت در دقیقه برای هر IP
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
 const rl = rateLimitCheck(`marketplace-submit:${ip}`, 10, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "نرخ درخواست بیش از حد مجاز است" },
 { status: 429 }
 );
 }

 const auth = await requireAuthContext(req);
 const { tenantId, userId } = auth;

 const body = await req.json().catch(() => ({}));
 const {
 name,
 description,
 category,
 pricingType,
 monthlyPrice,
 developerName,
 websiteUrl,
 } = body as {
 name?: string;
 description?: string;
 category?: string;
 pricingType?: string;
 monthlyPrice?: number;
 developerName?: string;
 websiteUrl?: string;
 };

 // اعتبارسنجی فیلدهای الزامی
 if (!name || typeof name!== "string" || name.trim().length < 3) {
 return NextResponse.json(
 { success: false, error: "نام اپ حداقل ۳ کاراکتر باید باشد" },
 { status: 400 }
 );
 }
 if (
!description ||
 typeof description!== "string" ||
 description.trim().length < 10
 ) {
 return NextResponse.json(
 { success: false, error: "توضیحات اپ حداقل ۱۰ کاراکتر باید باشد" },
 { status: 400 }
 );
 }
 const validCategories = [
 "accounting",
 "report",
 "sales",
 "integration",
 "tools",
 "ai",
 ];
 if (!category ||!validCategories.includes(category)) {
 return NextResponse.json(
 { success: false, error: "دسته‌بندی نامعتبر است" },
 { status: 400 }
 );
 }
 const validPricing = ["free", "freemium", "paid"];
 if (!pricingType ||!validPricing.includes(pricingType)) {
 return NextResponse.json(
 { success: false, error: "مدل قیمت‌گذاری نامعتبر است" },
 { status: 400 }
 );
 }

 // ساخت شناسه‌ی یکتا برای اپ ثبت‌شده
 const appId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

 // ثبت در AuditLog
 await db.auditLog.create({
 data: {
 tenantId,
 userId: userId?? null,
 action: "APP_SUBMITTED",
 entity: "MarketplaceApp",
 entityId: appId,
 changes: JSON.stringify({
 name: name.trim(),
 description: description.trim(),
 category,
 pricingType,
 monthlyPrice: pricingType === "paid"? Number(monthlyPrice) || 0: 0,
 developerName: developerName?.trim() || "—",
 websiteUrl: websiteUrl?.trim() || null,
 status: "pending_review",
 submittedAt: new Date().toISOString(),
 }),
 ipAddress: ip,
 },
 });

 return NextResponse.json(
 {
 success: true,
 appId,
 status: "pending_review",
 message:
 "اپ شما برای بررسی ثبت شد. ظرف ۴۸ ساعت نتیجه از طریق ایمیل اعلام می‌شود.",
 },
 { status: 201 }
 );
 } catch (error) {
 console.error("Marketplace submit error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت اپ" },
 { status: 500 }
 );
 }
}
