import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { invalidateDashboardCache } from "@/lib/cache";
import { nextDocumentNumber } from "@/lib/document-sequence";

export const runtime = "nodejs";

// POST /api/accounting/journal-entries — ایجاد سند حسابداری با دو ردیف بدهکار/بستانکار
// بدنه: { date, description, debitAccount, creditAccount, amount }
// - debitAccount/creditAccount می‌تواند نام حساب باشد؛ اگر وجود نداشت، ساخته می‌شود.
// - amount به تومان وارد می‌شود و به ریال (Int) ذخیره می‌شود.
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const userId = ctx.userId;

 const body = await req.json();
 const {
 date,
 description,
 debitAccount,
 creditAccount,
 amount,
 type = "JOURNAL",
 } = body as {
 date?: string;
 description?: string;
 debitAccount?: string;
 creditAccount?: string;
 amount?: number;
 type?: string;
 };

 if (!description ||!description.trim()) {
 return NextResponse.json(
 { success: false, error: "شرح سند الزامی است" },
 { status: 400 }
 );
 }
 if (!debitAccount ||!creditAccount) {
 return NextResponse.json(
 { success: false, error: "حساب بدهکار و بستانکار الزامی است" },
 { status: 400 }
 );
 }
 const amountRial = Math.round(Number(amount || 0) * 10);
 if (!amountRial || amountRial <= 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ سند نامعتبر است" },
 { status: 400 }
 );
 }

 // سال مالی جاری (در صورت وجود)
 const fiscalYear = await db.fiscalYear.findFirst({
 where: { tenantId, isCurrent: true },
 });

 // گروه حساب پیش‌فرض برای اسناد ساده (در صورت عدم وجود، ساخته می‌شود)
 let defaultGroup = await db.accountGroup.findFirst({
 where: { tenantId, code: "9" },
 });
 if (!defaultGroup) {
 defaultGroup = await db.accountGroup.create({
 data: {
 tenantId,
 code: "9",
 name: "سایر حساب‌ها",
 type: "BALANCE_SHEET",
 nature: "DEBIT",
 order: 9,
 },
 });
 }

 // پیدا کردن یا ساخت حساب بدهکار
 const debitAcc = await findOrCreateAccount(
 tenantId,
 defaultGroup.id,
 debitAccount.trim(),
 "DEBIT"
 );
 // پیدا کردن یا ساخت حساب بستانکار
 const creditAcc = await findOrCreateAccount(
 tenantId,
 defaultGroup.id,
 creditAccount.trim(),
 "CREDIT"
 );

 // تولید شماره سند — اتمیک با DocumentSequence (پادزهرِ M2 — شرط مسابقه)
 // قبلاً از findFirst(orderBy: number desc) + 1 استفاده می‌کرد که در هم‌زمانی
 // بالا، شماره‌های تکراری تولید می‌کرد و قید @@unique([tenantId, number]) را
 // نقض می‌کرد. حالا با upsert + inc اتمیک، هر درخواست شماره‌ی یکتا می‌گیرد.
 // از entityType=JOURNAL استفاده می‌کنیم و فقط seq (عدد صحیح) را برای
 // فیلد Int JournalEntry.number برمی‌داریم.
 const { seq: nextNumber } = await nextDocumentNumber("JOURNAL", tenantId);

 const entryDate = date? new Date(date): new Date();
 if (Number.isNaN(entryDate.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ نامعتبر است" },
 { status: 400 }
 );
 }

 const entry = await db.journalEntry.create({
 data: {
 tenantId,
 number: nextNumber,
 date: entryDate,
 type: String(type || "JOURNAL").toUpperCase(),
 description: description.trim(),
 status: "POSTED",
 fiscalYearId: fiscalYear?.id?? null,
 createdBy: userId?? null,
 lines: {
 create: [
 {
 tenantId,
 accountId: debitAcc.id,
 // FIX(3b-بیگ۱-compat): JournalLine.debit/credit اکنون BigInt است
 debit: BigInt(amountRial),
 credit: 0n,
 description: description.trim(),
 },
 {
 tenantId,
 accountId: creditAcc.id,
 debit: 0n,
 credit: BigInt(amountRial),
 description: description.trim(),
 },
 ],
 },
 },
 include: { lines: { include: { account: true } } },
 });

 await auditLog({
 tenantId,
 action: "JOURNAL_ENTRY_CREATE",
 entity: "JournalEntry",
 entityId: entry.id,
 changes: {
 number: entry.number,
 description: entry.description,
 amount: amountRial,
 debitAccount: debitAcc.name,
 creditAccount: creditAcc.name,
 },
 req,
 });

 // باطل‌سازی کش داشبورد — سند جدید باید بلافاصله در KPIها دیده شود
 invalidateDashboardCache(tenantId);

 return NextResponse.json({
 success: true,
 data: {
 id: entry.id,
 number: entry.number,
 date: entry.date,
 type: entry.type,
 description: entry.description,
 status: entry.status,
 amount: amountRial / 10,
 lines: entry.lines.map((l) => ({
 id: l.id,
 accountCode: l.account.code,
 accountName: l.account.name,
 debit: l.debit,
 credit: l.credit,
 })),
 },
 message: `سند شماره ${entry.number.toLocaleString("fa-IR")} با موفقیت ثبت شد`,
 });
 } catch (error) {
 console.error("Create journal entry error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت سند حسابداری" },
 { status: 500 }
 );
 }
}

async function findOrCreateAccount(
 tenantId: string,
 groupId: string,
 name: string,
 nature: "DEBIT" | "CREDIT"
) {
 const existing = await db.account.findFirst({
 where: { tenantId, name },
 });
 if (existing) return existing;

 const code = `${nature === "DEBIT"? "DB": "CR"}-${Date.now().toString(36).toUpperCase()}`;
 return db.account.create({
 data: {
 tenantId,
 code,
 name,
 groupId,
 nature,
 balanceType: "GENERAL",
 },
 });
}

// GET /api/accounting/journal-entries — لیست اسناد حسابداری (با صفحه‌بندی)
// FIX (M4): قبلاً take:100 ثابت بود و صفحه‌بندی نداشت — برای tenant‌های با هزاران سند مشکل‌ساز بود.
// پارامترهای query: page (1-based), limit (default 20, max 100), status, type, search, fromDate, toDate
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const { searchParams } = new URL(req.url);
 const page = Math.max(1, Number(searchParams.get("page") || 1));
 const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
 const status = searchParams.get("status");
 const type = searchParams.get("type");
 const search = searchParams.get("search")?.trim();
 const fromDate = searchParams.get("fromDate");
 const toDate = searchParams.get("toDate");

 // ساخت فیلتر پویا
 const where: {
 tenantId: string;
 status?: string;
 type?: string;
 description?: { contains: string };
 date?: { gte?: Date; lte?: Date };
 } = { tenantId };

 if (status && status!== "ALL") where.status = status;
 if (type && type!== "ALL") where.type = type;
 if (search) where.description = { contains: search };
 if (fromDate || toDate) {
 where.date = {};
 if (fromDate) where.date.gte = new Date(fromDate);
 if (toDate) where.date.lte = new Date(toDate);
 }

 // شمارش کل برای صفحه‌بندی
 const [entries, total] = await Promise.all([
 db.journalEntry.findMany({
 where,
 include: { lines: { include: { account: true } } },
 orderBy: { date: "desc" },
 skip: (page - 1) * limit,
 take: limit,
 }),
 db.journalEntry.count({ where }),
 ]);

 const safe = entries.map((e) => ({
 id: e.id,
 number: e.number,
 date: e.date,
 type: e.type,
 description: e.description,
 status: e.status,
 // FIX(3b-بیگ۱-compat): BigInt → Number (ترجمه با seed عددی و type BigInt خطا می‌داد)
 debit: e.lines.reduce((s, l) => s + Number(l.debit), 0),
 credit: e.lines.reduce((s, l) => s + Number(l.credit), 0),
 lines: e.lines.map((l) => ({
 id: l.id,
 accountCode: l.account.code,
 accountName: l.account.name,
 // FIX(3b-بیگ۱-compat): BigInt → Number برای JSON serialization
 debit: Number(l.debit),
 credit: Number(l.credit),
 })),
 }));

 const totalPages = Math.ceil(total / limit);

 return NextResponse.json({
 success: true,
 data: safe,
 pagination: {
 page,
 limit,
 total,
 totalPages,
 hasNext: page < totalPages,
 hasPrev: page > 1,
 },
 });
 } catch (error) {
 console.error("List journal entries error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت اسناد" },
 { status: 500 }
 );
 }
}

// DELETE /api/accounting/journal-entries?id=xxx — حذف یک سند حسابداری (همراه با ردیف‌هایش)
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 const number = searchParams.get("number");

 if (!id &&!number) {
 return NextResponse.json(
 { success: false, error: "شناسه یا شماره سند الزامی است" },
 { status: 400 }
 );
 }

 // پیدا کردن سند متعلق به tenant
 const whereClause: { tenantId: string; id?: string; number?: number } = {
 tenantId,
 };
 if (id) {
 whereClause.id = id;
 } else if (number) {
 const parsed = Number(number);
 if (!Number.isNaN(parsed)) whereClause.number = parsed;
 }
 const entry = await db.journalEntry.findFirst({
 where: whereClause,
 select: { id: true, number: true, description: true },
 });

 if (!entry) {
 return NextResponse.json(
 { success: false, error: "سند یافت نشد" },
 { status: 404 }
 );
 }

 // حذف سند (ردیف‌های خطوط به‌صورت cascade حذف می‌شوند)
 await db.journalEntry.delete({ where: { id: entry.id } });

 await auditLog({
 tenantId,
 action: "DELETE",
 entity: "JournalEntry",
 entityId: entry.id,
 changes: { number: entry.number, description: entry.description },
 req,
 });

 return NextResponse.json({
 success: true,
 message: `سند شماره ${entry.number} با موفقیت حذف شد`,
 });
 } catch (error) {
 console.error("Delete journal entry error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف سند" },
 { status: 500 }
 );
 }
}
