import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPartySchema } from "@/lib/schemas";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import { encryptField, decryptField, maskSensitive } from "@/lib/db-encryption";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { requireApiKey } from "@/lib/api-key-auth";
import {
 isValidNationalId,
 isValidEconomicCode,
 isValidPostalCode,
 isValidEmail,
 normalizePersianPhone,
 normalizeNationalIdDigits,
 nationalIdBlindIndex,
} from "@/lib/validators";

export const runtime = "nodejs";

// GET /api/parties — لیست طرف‌حساب‌ها با فیلتر، مرتب‌سازی و صفحه‌بندی
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const search = searchParams.get("search");
 const type = searchParams.get("type");
 const reveal = searchParams.get("reveal") === "1"; // نمایش مقادیر اصلی
 const sortBy = searchParams.get("sortBy") || "createdAt";
 const sortOrder = searchParams.get("sortOrder") === "asc"? "asc": "desc";
 const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
 const offset = Number(searchParams.get("offset") || "0");

 const tenantId = ctx.tenantId;

 // FIX(3b-بیگ۷) MEDIUM-HIGH: `?reveal=1` قبلاً بدون هیچ بررسی scope/role بود —
 // هر کاربرِ احراز هویت‌شده کد ملیِ همهٔ طرف‌حساب‌ها را decrypt شده می‌گرفت.
 // حالا فقط ADMIN (یا کلید API با scope خواندن طرف‌حساب‌ها) اجازهٔ reveal دارد
 // و «همیشه» در AuditLog با شناسهٔ درخواست‌کننده ثبت می‌شود.
 let revealAllowed =
 ctx.role === "ADMIN" || ctx.role === "SUPERADMIN" || ctx.role === "SUPER_ADMIN";
 if (!revealAllowed && reveal) {
 const rawKey = req.headers.get("x-api-key");
 if (rawKey) {
 const keyRes = await requireApiKey(req);
 if (!("error" in keyRes) && keyRes.ctx.tenantId === tenantId) {
 revealAllowed = keyRes.ctx.scopes.includes("read:parties");
 }
 }
 }
 if (reveal && !revealAllowed) {
 return NextResponse.json(
 {
 success: false,
 error:
 "دسترسی به نمایش کد ملی (reveal) محدود به مدیر سیستم یا کلید API با دسترسی خواندن طرف‌حساب‌ها است",
 },
 { status: 403 }
 );
 }
 if (reveal) {
 // FIX(3b-بیگ۷): هر reveal حتماً لاگ ممیزی می‌شود — چه کنترل، چه سوءاستفاده
 await auditLog({
 tenantId,
 userId: ctx.userId,
 action: "PII_REVEAL",
 entity: "Party",
 entityId: "list",
 changes: {
 action: "reveal-national-id",
 search: search?? null,
 limit,
 offset,
 requesterRole: ctx.role?? null,
 source: ctx.source,
 },
 req,
 });
 }

 const where: Record<string, unknown> = {
 tenantId,
 deletedAt: null,
 };
 if (type) where.type = type;
 if (search) {
 // FIX(3b-بیگ۸) MEDIUM: جستجوی «contains» روی nationalId رمزنگاری‌شده (AES-GCM
 // با IV تصادفی) هرگز match نمی‌شد — جستجوی کد ملی کاملاً مرده بود.
 // حالا: اگر عبارت جستجو فقط رقم است، با ایندکس کور (nationalIdIndex) جستجو
 // می‌شود؛ در غیر این‌صورت نام/کد/موبایل به‌صورت قبلی.
 const digitsOnly = normalizeNationalIdDigits(search);
 if (digitsOnly && /^\d{10,11}$/.test(digitsOnly)) {
 where.OR = [
 { name: { contains: search } },
 { code: { contains: search } },
 { mobile: { contains: search } },
 { nationalIdIndex: nationalIdBlindIndex(digitsOnly) },
 ];
 } else {
 where.OR = [
 { name: { contains: search } },
 { code: { contains: search } },
 { mobile: { contains: search } },
 ];
 }
 }

 // مرتب‌سازی — فقط فیلدهای مجاز
 const validSortFields = ["name", "code", "createdAt", "updatedAt", "type"];
 const sortField = validSortFields.includes(sortBy)? sortBy: "createdAt";
 const orderBy = { [sortField]: sortOrder };

 const [parties, total] = await Promise.all([
 db.party.findMany({
 where,
 orderBy,
 take: limit,
 skip: offset,
 }),
 db.party.count({ where }),
 ]);

 // تبدیل BigInt به Number برای JSON serialization + رمزگشایی فیلدهای حساس
 const serialized = parties.map((p) => {
 const nationalIdDecrypted = decryptField(p.nationalId);
 return {
...p,
 creditLimit: Number(p.creditLimit),
 openingBalance: Number(p.openingBalance),
 // در حالت پیش‌فرض مقادیر حساس ماسک می‌شوند. اگر reveal=1 (مجاز — 3b-بیگ۷)
 // داده شود، مقدار اصلی نمایش داده می‌شود و در AuditLog ثبت می‌گردد.
 nationalId: reveal && revealAllowed && nationalIdDecrypted? nationalIdDecrypted: maskSensitive(nationalIdDecrypted),
 };
 });

 return NextResponse.json({ success: true, data: serialized, total, limit, offset });
 } catch (error) {
 console.error("Parties error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت طرف‌حساب‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/parties — ایجاد طرف‌حساب
export async function POST(req: NextRequest) {
 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`party-create:${ip}`, 20, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 if (!rateLimit(`party-create:${ip}`, 20, 60000)) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const parsed = createPartySchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json(
 { success: false, error: "داده نامعتبر", details: parsed.error.flatten() },
 { status: 400 }
 );
 }

 // SECURITY (C1/C2): احراز هویت اجباری + فیلتر tenant
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 // FIX(3b-بیگ‌۱۰): اعتبارسنجی ایرانی + نرمال‌سازی — lib/validators قبلاً dead code بود.
 // - ارقام فارسی ۰-۹ → انگلیسی (کد ملی/کد اقتصادی/کد پستی)
 // - checksum کد ملی (رقم کنترل) — دادهٔ نامعتبر دیگر ذخیره نمی‌شود (و به مودیان نمی‌رود)
 // - موبایل به فرمت استاندارد 09xxxxxxxxx
 const data = { ...parsed.data };
 const validationErrors: Record<string, string> = {};

 const normalizedNationalId = normalizeNationalIdDigits(data.nationalId);
 if (normalizedNationalId) {
 if (!/^\d{10,11}$/.test(normalizedNationalId)) {
 validationErrors.nationalId = "کد ملی باید ۱۰ رقمی (یا شناسه ملی ۱۱ رقمی) باشد";
 } else if (
 normalizedNationalId.length === 10 &&
 !isValidNationalId(normalizedNationalId)
 ) {
 validationErrors.nationalId = "کد ملی نامعتبر است (رقم کنترل صحیح نیست)";
 }
 data.nationalId = normalizedNationalId;
 }

 if (data.economicCode) {
 const normalizedEconomic = normalizeNationalIdDigits(data.economicCode);
 if (normalizedEconomic && !isValidEconomicCode(normalizedEconomic)) {
 validationErrors.economicCode = "کد اقتصادی نامعتبر است (۱۱ یا ۱۲ رقم)";
 } else if (normalizedEconomic) {
 data.economicCode = normalizedEconomic;
 }
 }

 if (data.postalCode) {
 const normalizedPostal = normalizeNationalIdDigits(data.postalCode);
 if (normalizedPostal && !isValidPostalCode(normalizedPostal)) {
 validationErrors.postalCode = "کد پستی نامعتبر است (۱۰ رقم، بدون صفر ابتدایی)";
 } else if (normalizedPostal) {
 data.postalCode = normalizedPostal;
 }
 }

 // موبایل: نرمال‌سازی فرمت (+98912…، 98912…، 912… → 09xxxxxxxxx)
 if (data.mobile) {
 const normalizedMobile = normalizePersianPhone(data.mobile);
 if (data.mobile.trim() && !normalizedMobile) {
 validationErrors.mobile = "شماره موبایل نامعتبر است (مثال: 09123456789)";
 } else if (normalizedMobile) {
 data.mobile = normalizedMobile;
 }
 }

 if (data.email && data.email.trim() && !isValidEmail(data.email)) {
 validationErrors.email = "ایمیل نامعتبر است";
 }

 if (Object.keys(validationErrors).length > 0) {
 return NextResponse.json(
 { success: false, error: "داده نامعتبر", details: { fieldErrors: validationErrors } },
 { status: 400 }
 );
 }

 // رمزنگاری فیلد nationalId پیش از ذخیره در دیتابیس
 const encryptedNationalId = encryptField(data.nationalId || null);

 try {
 const party = await db.party.create({
 data: {
 tenantId,
 ...data,
 nationalId: encryptedNationalId,
 // FIX(3b-بیگ‌۸): ایندکس کور کد ملی — برای جستجوی واقعی (nationalId رمز است)
 nationalIdIndex: nationalIdBlindIndex(data.nationalId || null),
 creditLimit: BigInt(data.creditLimit),
 openingBalance: BigInt(0),
 },
 });

 await auditLog({
 tenantId,
 action: "CREATE",
 entity: "Party",
 entityId: party.id,
 changes: { ...data, nationalId: maskSensitive(data.nationalId) },
 req,
 });

 return NextResponse.json({
 success: true,
 data: { ...party, creditLimit: Number(party.creditLimit), openingBalance: Number(party.openingBalance) },
 message: "طرف‌حساب با موفقیت ایجاد شد",
 });
 } catch (error) {
 // FIX(3b — ممیزی ۴.۴): کد تکراری → 409 فارسی (نه 500 خام Prisma)
 if (
 error &&
 typeof error === "object" &&
 "code" in error &&
 (error as { code: unknown }).code === "P2002"
 ) {
 return NextResponse.json(
 { success: false, error: "کد طرف‌حساب تکراری است. لطفاً کد دیگری وارد کنید." },
 { status: 409 }
 );
 }
 throw error;
 }
 } catch (error) {
 console.error("Create party error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد طرف‌حساب" },
 { status: 500 }
 );
 }
}

// PATCH /api/parties — ادغام طرف‌حساب‌های تکراری
// Body: { action: "merge", primaryId: string, duplicateIds: string[] }
export async function PATCH(req: NextRequest) {
 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`party-merge:${ip}`, 5, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { action, primaryId, duplicateIds } = body as {
 action?: string;
 primaryId?: string;
 duplicateIds?: string[];
 };

 if (action!== "merge") {
 return NextResponse.json(
 { success: false, error: "عملیات نامعتبر — فقط merge پشتیبانی می‌شود" },
 { status: 400 }
 );
 }

 if (!primaryId) {
 return NextResponse.json(
 { success: false, error: "شناسه طرف‌حساب اصلی الزامی است" },
 { status: 400 }
 );
 }

 if (!Array.isArray(duplicateIds) || duplicateIds.length === 0) {
 return NextResponse.json(
 { success: false, error: "لیست شناسه‌های تکراری الزامی است" },
 { status: 400 }
 );
 }

 if (duplicateIds.includes(primaryId)) {
 return NextResponse.json(
 { success: false, error: "شناسه اصلی نباید در لیست تکراری‌ها باشد" },
 { status: 400 }
 );
 }

 if (duplicateIds.length > 50) {
 return NextResponse.json(
 { success: false, error: "حداکثر ۵۰ طرف‌حساب تکراری در هر درخواست" },
 { status: 400 }
 );
 }

 // SECURITY (C1/C2): احراز هویت اجباری + فیلتر tenant
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 // بررسی وجود طرف‌حساب اصلی
 const primary = await db.party.findFirst({
 where: { id: primaryId, tenantId, deletedAt: null },
 });
 if (!primary) {
 return NextResponse.json(
 { success: false, error: "طرف‌حساب اصلی یافت نشد" },
 { status: 404 }
 );
 }

 // انتقال فاکتورها و سایر رکوردهای وابسته به طرف‌حساب اصلی
 const invoiceUpdate = await db.invoice.updateMany({
 where: { partyId: { in: duplicateIds }, tenantId },
 data: { partyId: primaryId },
 });

 // حذف نرم طرف‌حساب‌های تکراری
 const deleteResult = await db.party.updateMany({
 where: { id: { in: duplicateIds }, tenantId, deletedAt: null },
 data: { deletedAt: new Date() },
 });

 await auditLog({
 tenantId,
 action: "MERGE",
 entity: "Party",
 entityId: primaryId,
 changes: {
 primaryId,
 duplicateIds,
 invoicesMoved: invoiceUpdate.count,
 duplicatesSoftDeleted: deleteResult.count,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 invoicesMoved: invoiceUpdate.count,
 duplicatesMerged: deleteResult.count,
 message: `${deleteResult.count} طرف‌حساب تکراری ادغام شد. ${invoiceUpdate.count} فاکتور منتقل شد.`,
 });
 } catch (error) {
 console.error("Merge parties error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ادغام طرف‌حساب‌ها" },
 { status: 500 }
 );
 }
}
