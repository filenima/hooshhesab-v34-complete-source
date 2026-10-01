import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit } from "@/lib/auth";
import { invalidateDashboardCache } from "@/lib/cache";

export const runtime = "nodejs";

// POST /api/bank-accounts — ثبت حساب بانکی جدید
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (!rateLimit(`bank-create:${ctx.tenantId}`, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "تعداد درخواست‌ها زیاد است — کمی بعد تلاش کنید" },
 { status: 429 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const bankName = String(body.bankName || "").trim();
 const branch = String(body.branch || "").trim() || null;
 const accountNumber = String(body.accountNumber || "").trim();
 const cardNumber = String(body.cardNumber || "").trim() || null;
 const shaba = String(body.shaba || "").trim() || null;
 const type = String(body.type || "CURRENT").trim();
 const balance = Number(body.balance || 0);
 const currency = String(body.currency || "IRR").trim().toUpperCase();

 if (!bankName) {
 return NextResponse.json(
 { success: false, error: "نام بانک الزامی است" },
 { status: 400 }
 );
 }
 if (!accountNumber) {
 return NextResponse.json(
 { success: false, error: "شماره حساب الزامی است" },
 { status: 400 }
 );
 }
 if (!["CURRENT", "SAVING", "LOAN"].includes(type)) {
 return NextResponse.json(
 { success: false, error: "نوع حساب نامعتبر است (CURRENT | SAVING | LOAN)" },
 { status: 400 }
 );
 }
 // FIX (MEDIUM): اعتبارسنجی currency — قبلاً هر رشته‌ای پذیرفته می‌شد و
 // هیچ‌جا استفاده نمی‌شد
 const ALLOWED_CURRENCIES = ["IRR", "TOMAN", "USD", "EUR", "GBP", "AED", "TRY", "CNY", "SAR"];
 if (!ALLOWED_CURRENCIES.includes(currency)) {
 return NextResponse.json(
 { success: false, error: `واحد پول نامعتبر است (مجاز: ${ALLOWED_CURRENCIES.join(" | ")})` },
 { status: 400 }
 );
 }

 // بررسی تکراری نبودن شماره حساب در همان tenant
 const existing = await db.bankAccount.findFirst({
 where: { tenantId: ctx.tenantId, accountNumber, deletedAt: null },
 select: { id: true },
 });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "حساب بانکی با این شماره قبلاً ثبت شده" },
 { status: 409 }
 );
 }

 // FIX(واحد پول): فرم UI موجودی را به «تومان» می‌گیرد (برچسب «موجودی اولیه (تومان)» و راهنمای
 // «معادل: X ریال») — ذخیره در دیتابیس به «ریال» است. مانند /api/checks، ورودی تومان را ×۱۰
 // تبدیل می‌کنیم تا موجودی حساب ۱۰ برابر کمتر از منظور کاربر ذخیره نشود.
 const account = await db.bankAccount.create({
 data: {
 tenantId: ctx.tenantId,
 bankName,
 branch,
 accountNumber,
 cardNumber,
 shaba,
 type,
 balance: BigInt(Math.max(0, Math.floor(balance * 10))),
 currency,
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "BANK_ACCOUNT_CREATE",
 entity: "BankAccount",
 entityId: account.id,
 changes: { bankName, accountNumber, type },
 req,
 });

 // باطل‌سازی کش داشبورد — موجودی نقد پس از ایجاد حساب
 invalidateDashboardCache(ctx.tenantId);

 return NextResponse.json({
 success: true,
 data: {
...account,
 // FIX(3-b): خروجی به «تومان» مثل ورودی فرم (الگوی /api/checks) — قبلاً ریال خام
 // برمی‌گشت و UI آن را با formatToman نمایش می‌داد → موجودی ۱۰ برابر دیده می‌شد.
 balance: Number(account.balance) / 10,
 },
 message: `حساب بانکی ${bankName} با موفقیت ثبت شد`,
 });
 } catch (error) {
 console.error("Bank account create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت حساب بانکی" },
 { status: 500 }
 );
 }
}

// GET /api/bank-accounts — لیست حساب‌های بانکی tenant
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const accounts = await db.bankAccount.findMany({
 where: { tenantId: ctx.tenantId, deletedAt: null },
 orderBy: { createdAt: "desc" },
 });

 return NextResponse.json({
 success: true,
 data: accounts.map((a) => ({
...a,
 // FIX(3-b): ریال DB → تومان — سازگار با فرم/UI (formatToman) و الگوی /api/checks
 balance: Number(a.balance) / 10,
 })),
 total: accounts.length,
 });
 } catch (error) {
 console.error("Bank accounts list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست حساب‌ها" },
 { status: 500 }
 );
 }
}

// PATCH /api/bank-accounts?id=xxx — به‌روزرسانی موجودی یا اطلاعات حساب
export async function PATCH(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const url = new URL(req.url);
 const id = url.searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه حساب الزامی است" },
 { status: 400 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const data: Record<string, unknown> = {};

 // FIX (MEDIUM): balance رشته‌ای قبلاً «بی‌صدا» نادیده گرفته می‌شد و پاسخ
 // «به‌روزرسانی شد» برمی‌گشت — حالا رشته‌ی عددی پذیرفته و نامعتبر ۴۰۰ می‌شود.
 // مقادیر منفی در PATCH مجاز است (کشف حساب/overdraft) — POST موجودی اولیه
 // را در ≥ ۰ نگه می‌دارد (رفتار عمدی: افتتاح حساب با منفی بی‌معناست).
 if (body.balance!== undefined) {
 let parsedBalance: number | null;
 if (typeof body.balance === "number") {
 parsedBalance = body.balance;
 } else {
 const n = Number(String(body.balance).replace(/[\u066C\u060C,\s]/g, ""));
 parsedBalance = Number.isFinite(n)? n: null;
 }
 if (parsedBalance === null ||!Number.isFinite(parsedBalance)) {
 return NextResponse.json(
 { success: false, error: "موجودی ارسالی نامعتبر است — عدد (تومان) وارد کنید" },
 { status: 400 }
 );
 }
 // FIX(واحد پول): موجودی از UI به تومان ارسال می‌شود؛ دیتابیس ریالی است (×۱۰)
 data.balance = BigInt(Math.floor(parsedBalance * 10));
 }
 if (typeof body.bankName === "string") data.bankName = body.bankName.trim();
 if (typeof body.branch === "string") data.branch = body.branch.trim() || null;
 if (typeof body.cardNumber === "string") data.cardNumber = body.cardNumber.trim() || null;
 if (typeof body.shaba === "string") data.shaba = body.shaba.trim() || null;
 if (typeof body.type === "string" && ["CURRENT", "SAVING", "LOAN"].includes(body.type)) {
 data.type = body.type;
 }
 // FIX (MEDIUM): اعتبارسنجی currency در PATCH (مثل POST)
 if (typeof body.currency === "string" && body.currency.trim()!== "") {
 const cur = body.currency.trim().toUpperCase();
 const ALLOWED_CURRENCIES = ["IRR", "TOMAN", "USD", "EUR", "GBP", "AED", "TRY", "CNY", "SAR"];
 if (!ALLOWED_CURRENCIES.includes(cur)) {
 return NextResponse.json(
 { success: false, error: `واحد پول نامعتبر است (مجاز: ${ALLOWED_CURRENCIES.join(" | ")})` },
 { status: 400 }
 );
 }
 data.currency = cur;
 }

 if (Object.keys(data).length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ فیلدی برای به‌روزرسانی ارسال نشده" },
 { status: 400 }
 );
 }

 // SECURITY: مالکیت حساب باید متعلق به tenant کاربر باشد (IDOR)
 const owned = await db.bankAccount.findFirst({
 where: { id, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "حساب بانکی یافت نشد" },
 { status: 404 }
 );
 }

 const updated = await db.bankAccount.update({
 where: { id: owned.id },
 data,
 });

 // (رفع 5-b-complete) changes شامل balance به‌صورت BigInt است و JSON.stringify
 // کرش می‌کرد («Do not know how to serialize a BigInt» در dev.log) → رکورد
 // AuditLog برای ویرایش موجودی از دست می‌رفت. مانند /api/loans به رشته تبدیل شد.
 const auditChanges: Record<string, unknown> = { ...data };
 if (auditChanges.balance!== undefined) {
 auditChanges.balance = String(auditChanges.balance);
 }

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "BANK_ACCOUNT_UPDATE",
 entity: "BankAccount",
 entityId: id,
 changes: auditChanges,
 req,
 });

 // باطل‌سازی کش داشبورد — موجودی نقد پس از تغییر
 invalidateDashboardCache(ctx.tenantId);

 return NextResponse.json({
 success: true,
 data: {...updated, balance: Number(updated.balance) / 10 },
 message: "حساب بانکی به‌روزرسانی شد",
 });
 } catch (error) {
 console.error("Bank account update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی حساب" },
 { status: 500 }
 );
 }
}

// DELETE /api/bank-accounts?id=xxx — soft delete
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const url = new URL(req.url);
 const id = url.searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه حساب الزامی است" },
 { status: 400 }
 );
 }

 // SECURITY: مالکیت حساب باید متعلق به tenant کاربر باشد (IDOR)
 const owned = await db.bankAccount.findFirst({
 where: { id, tenantId: ctx.tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "حساب بانکی یافت نشد" },
 { status: 404 }
 );
 }

 await db.bankAccount.update({
 where: { id: owned.id },
 data: { deletedAt: new Date() },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "BANK_ACCOUNT_DELETE",
 entity: "BankAccount",
 entityId: id,
 req,
 });

 // باطل‌سازی کش داشبورد — موجودی نقد پس از حذف
 invalidateDashboardCache(ctx.tenantId);

 return NextResponse.json({
 success: true,
 message: "حساب بانکی حذف شد",
 });
 } catch (error) {
 console.error("Bank account delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف حساب" },
 { status: 500 }
 );
 }
}
