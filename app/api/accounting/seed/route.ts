import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/auth";
import { getCurrentJalaliYear, toPersianDigits } from "@/lib/persian";

export const runtime = "nodejs";

// POST /api/accounting/seed — پر کردن دیتابیس با داده‌های نمونه کامل
// SECURITY (C1): این مسیر فقط در development مجاز است — در production هرگز نباید
// قابل فراخوانی باشد. همچنین rate-limit اعمال می‌شود تا از سوءاستفاده جلوگیری شود.
export async function POST(req: NextRequest) {
 try {
 // SECURITY: مسدودسازی در production
 if (process.env.NODE_ENV === "production") {
 return NextResponse.json(
 {
 success: false,
 error: "این مسیر در محیط production غیرفعال است",
 },
 { status: 403 }
 );
 }

 // SECURITY: rate limit برای جلوگیری از فراخوانی مکرر
 const clientKey =
 req.headers.get("x-forwarded-for") ||
 req.headers.get("x-real-ip") ||
 "unknown";
 if (!rateLimit(`seed:${clientKey}`, 5, 60_000)) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const existing = await db.tenant.count();
 if (existing > 0) {
 return NextResponse.json({
 success: true,
 message: "داده‌ها از قبل موجود هستند",
 skipped: true,
 });
 }

 // ۱. Tenant
 const tenant = await db.tenant.create({
 data: {
 name: "شرکت نمونه هوش",
 subdomain: "demo",
 plan: "business",
 status: "active",
 },
 });

 // ۲. کاربر ادمین (رمز هش‌شده با bcrypt در production واقعی)
 await db.user.create({
 data: {
 tenantId: tenant.id,
 email: "admin@hoosh.nobatime.ir",
 name: "رضا محمدی",
 password: "$2a$10$demoHashNotForProductionUse12345678901234567890",
 role: "ADMIN",
 isActive: true,
 },
 });

 // ۳. سال مالی
 // FIX (FIX-HIGH-ISSUES): سال شمسی جاری به‌جای ۱۴۰۳ ثابت
 await db.fiscalYear.create({
 data: {
 tenantId: tenant.id,
 name: `سال مالی ${toPersianDigits(getCurrentJalaliYear())}`,
 startDate: new Date("2024-03-20"),
 endDate: new Date("2025-03-20"),
 status: "OPEN",
 isCurrent: true,
 },
 });

 // ۴. گروه‌های حساب
 const groups = await db.accountGroup.createMany({
 data: [
 { tenantId: tenant.id, code: "1", name: "دارایی‌ها", type: "BALANCE_SHEET", nature: "DEBIT", order: 1 },
 { tenantId: tenant.id, code: "2", name: "بدهی‌ها", type: "BALANCE_SHEET", nature: "CREDIT", order: 2 },
 { tenantId: tenant.id, code: "3", name: "سرمایه", type: "BALANCE_SHEET", nature: "CREDIT", order: 3 },
 { tenantId: tenant.id, code: "4", name: "درآمدها", type: "PROFIT_LOSS", nature: "CREDIT", order: 4 },
 { tenantId: tenant.id, code: "5", name: "هزینه‌ها", type: "PROFIT_LOSS", nature: "DEBIT", order: 5 },
 ],
 });

 // ۵. طرف‌حساب‌ها
 const parties = await db.party.createMany({
 data: [
 { tenantId: tenant.id, code: "1001", name: "شرکت پارس‌فناور", type: "CUSTOMER", nationalId: "14001234567", economicCode: "411111111", phone: "02188123456", city: "تهران", province: "تهران" },
 { tenantId: tenant.id, code: "1002", name: "فروشگاه آریا", type: "CUSTOMER", nationalId: "10987654321", phone: "02144556677", city: "تهران" },
 { tenantId: tenant.id, code: "2001", name: "تأمین‌کننده تهران‌قطعه", type: "SUPPLIER", nationalId: "10111222334", economicCode: "422222222", phone: "02133221100", city: "تهران" },
 { tenantId: tenant.id, code: "1003", name: "شرکت ایران‌پیام", type: "CUSTOMER", phone: "02177665544", city: "اصفهان" },
 ],
 });

 // ۶. کالاها (قیمت‌ها به ریال)
 const products = await db.product.createMany({
 data: [
 { tenantId: tenant.id, sku: "LP-XVB15", name: "لپ‌تاپ ایکس‌وی‌بی۱۵", unit: "عدد", type: "GOODS", purchasePrice: 38000000000, salePrice: 45000000000, minStock: 10, taxRate: 0.09 },
 { tenantId: tenant.id, sku: "MS-WL220", name: "موس بی‌سیم", unit: "عدد", type: "GOODS", purchasePrice: 250000000, salePrice: 350000000, minStock: 15, taxRate: 0.09 },
 { tenantId: tenant.id, sku: "KB-MC84", name: "کیبورد مکانیکی", unit: "عدد", type: "GOODS", purchasePrice: 850000000, salePrice: 1200000000, minStock: 20, taxRate: 0.09 },
 { tenantId: tenant.id, sku: "MN-27QHD", name: "مانیتور ۲۷ اینچ QHD", unit: "عدد", type: "GOODS", purchasePrice: 15500000000, salePrice: 18500000000, minStock: 8, taxRate: 0.09 },
 ],
 });

 // ۷. انبار
 await db.warehouse.create({
 data: { tenantId: tenant.id, code: "WH01", name: "انبار مرکزی تهران" },
 });

 // ۸. حساب بانکی
 await db.bankAccount.create({
 data: {
 tenantId: tenant.id,
 bankName: "بانک ملت",
 branch: "مرکزی",
 accountNumber: "1234567890",
 cardNumber: "6104337812345678",
 shaba: "IR120120000000001234567890",
 type: "CURRENT",
 balance: 215000000000, // 2.15 میلیارد تومان = 21.5 میلیارد ریال
 },
 });

 // ۹. فاکتور فروش نمونه
 const p1 = await db.party.findFirst({ where: { tenantId: tenant.id, code: "1001" } });
 if (p1) {
 await db.invoice.create({
 data: {
 tenantId: tenant.id,
 // FIX (M1): سال شمسی جاری به‌جای ۱۴۰۳ ثابت
 number: `${getCurrentJalaliYear()}-001245`,
 type: "SALE",
 partyId: p1.id,
 date: new Date(),
 subtotal: 41284403000,
 tax: 3715597000,
 total: 45000000000,
 paidAmount: 45000000000,
 status: "PAID",
 modianStatus: "ACCEPTED",
 },
 });
 }

 // ۱۰. یکپارچگی‌ها
 await db.integration.createMany({
 data: [
 { tenantId: tenant.id, type: "WOOCOMMERCE", name: "فروشگاه ووکامرس", status: "CONNECTED", config: "{}", lastSync: new Date() },
 { tenantId: tenant.id, type: "DIGIKALA", name: "پنل دیجی‌کالا", status: "CONNECTED", config: "{}", lastSync: new Date() },
 { tenantId: tenant.id, type: "MODIAN", name: "سامانه مودیان", status: "CONNECTED", config: "{}", lastSync: new Date() },
 ],
 });

 return NextResponse.json({
 success: true,
 message: "داده‌های نمونه کامل ایجاد شدند",
 counts: {
 tenant: 1,
 parties: parties.count,
 products: products.count,
 accountGroups: groups.count,
 },
 });
 } catch (error) {
 console.error("Seed error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد داده‌های نمونه" },
 { status: 500 }
 );
 }
}
