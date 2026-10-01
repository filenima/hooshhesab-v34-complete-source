import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import { invalidateDashboardCache } from "@/lib/cache";
import { nextDocumentNumber } from "@/lib/document-sequence";

export const runtime = "nodejs";

// POST /api/checks — ثبت چک جدید (دریافتی/پرداختی)
// بدنه: { number, sayadId, type, amount, bankName, dueDate, partyId, branch?, description? }
// - amount به تومان وارد می‌شود و به ریال (BigInt) ذخیره می‌شود.
export async function POST(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const body = await req.json();
 const {
 number,
 sayadId,
 type = "RECEIVED",
 amount,
 bankName,
 dueDate,
 partyId,
 branch,
 description,
 } = body as {
 number?: string;
 sayadId?: string;
 type?: string;
 amount?: number;
 bankName?: string;
 dueDate?: string;
 partyId?: string;
 branch?: string;
 description?: string;
 };

 if (!number ||!number.trim()) {
 return NextResponse.json(
 { success: false, error: "شماره چک الزامی است" },
 { status: 400 }
 );
 }
 if (!bankName ||!bankName.trim()) {
 return NextResponse.json(
 { success: false, error: "نام بانک الزامی است" },
 { status: 400 }
 );
 }
 // FIX (الگوی NaN): Number(NaN) از گارد `<= 0` رد می‌شود و BigInt(NaN) کرش
 // می‌کرد → ابتدا Number.isFinite
 const amountNum = Number(amount);
 if (!Number.isFinite(amountNum) || amountNum <= 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ چک نامعتبر است" },
 { status: 400 }
 );
 }
 const amountRial = BigInt(Math.round(amountNum * 10));
 if (amountRial <= 0) {
 return NextResponse.json(
 { success: false, error: "مبلغ چک نامعتبر است" },
 { status: 400 }
 );
 }
 if (!dueDate) {
 return NextResponse.json(
 { success: false, error: "تاریخ سررسید الزامی است" },
 { status: 400 }
 );
 }

 const issueDate = new Date();
 const due = new Date(dueDate);
 if (Number.isNaN(due.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ سررسید نامعتبر است" },
 { status: 400 }
 );
 }

 // بررسی یکتایی شماره چک در تنانت
 const dup = await db.check.findFirst({
 where: { tenantId: tenant.id, number: number.trim() },
 select: { id: true },
 });
 if (dup) {
 return NextResponse.json(
 { success: false, error: "چک با این شماره قبلاً ثبت شده است" },
 { status: 409 }
 );
 }

 // اعتبارسنجی طرف‌حساب (در صورت ارسال)
 let validatedPartyId: string | null = null;
 if (partyId) {
 const party = await db.party.findFirst({
 where: { id: partyId, tenantId: tenant.id },
 select: { id: true },
 });
 if (!party) {
 return NextResponse.json(
 { success: false, error: "طرف‌حساب یافت نشد" },
 { status: 404 }
 );
 }
 validatedPartyId = party.id;
 }

 const check = await db.check.create({
 data: {
 tenantId: tenant.id,
 number: number.trim(),
 type: String(type || "RECEIVED").toUpperCase() === "ISSUED"? "ISSUED": "RECEIVED",
 sayadId: sayadId?.trim() || null,
 status: "REGISTERED",
 amount: amountRial,
 issueDate,
 dueDate: due,
 bankName: bankName.trim(),
 branch: branch?.trim() || null,
 partyId: validatedPartyId,
 description: description?.trim() || null,
 },
 });

 await auditLog({
 tenantId: tenant.id,
 action: "CHECK_CREATE",
 entity: "Check",
 entityId: check.id,
 changes: {
 number: check.number,
 type: check.type,
 amount: Number(check.amount),
 bankName: check.bankName,
 dueDate: check.dueDate,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 data: {
 id: check.id,
 number: check.number,
 type: check.type,
 sayadId: check.sayadId,
 status: check.status,
 amount: Number(check.amount) / 10,
 bankName: check.bankName,
 dueDate: check.dueDate,
 partyId: check.partyId,
 },
 message: `چک ${check.type === "RECEIVED"? "دریافتی": "پرداختی"} شماره ${check.number} ثبت شد`,
 });
 } catch (error) {
 console.error("Create check error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت چک" },
 { status: 500 }
 );
 }
}

// GET /api/checks — لیست چک‌ها
// FIX (HIGH): پارامتر limit/take پذیرفته می‌شود (قبلاً take:100 ثابت بود و
// ?limit= نادیده گرفته می‌شد — چک‌های tenant های بزرگ ناقص دیده می‌شدند)
export async function GET(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const limitParam =
 searchParams.get("limit")?? searchParams.get("take")?? "200";
 const limit = Math.min(500, Math.max(1, Number(limitParam) || 200));

 const checks = await db.check.findMany({
 where: { tenantId: tenant.id, deletedAt: null },
 include: { party: true },
 orderBy: { dueDate: "asc" },
 take: limit,
 });

 const safe = checks.map((c) => ({
 id: c.id,
 number: c.number,
 type: c.type,
 sayadId: c.sayadId,
 status: c.status,
 amount: Number(c.amount) / 10,
 bankName: c.bankName,
 dueDate: c.dueDate,
 party: c.party?.name?? null,
 }));

 return NextResponse.json({ success: true, data: safe });
 } catch (error) {
 console.error("List checks error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت چک‌ها" },
 { status: 500 }
 );
 }
}

// ================= کمکی‌های حسابداری چک =================
// الگوبرداری‌شده از app/api/accounting/journal-entries/route.ts (فقط‌خواندنی) —
// چون findOrCreateAccount آنجا export نمی‌شود، همان الگو اینجا تکرار شده است.
// نکته: این کمکی‌ها «قبل از» $transaction اجرا می‌شوند تا با قفل تک‌نویسنده‌ی
// SQLite تداخل نکنند (nextDocumentNumber از کلاینت سراسری استفاده می‌کند).

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

async function getDefaultAccountGroupId(tenantId: string): Promise<string> {
 let group = await db.accountGroup.findFirst({
 where: { tenantId, code: "9" },
 });
 if (!group) {
 group = await db.accountGroup.create({
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
 return group.id;
}

const MAX_JOURNAL_INT = 2_147_483_647; // سقف Int ستون‌های debit/credit

/** اطلاعات لازم برای ثبت سند — قبل از تراکنش آماده می‌شود */
interface PreparedJournal {
 number: number;
 debitAccountId: string;
 creditAccountId: string;
 amount: number;
 description: string;
}

/**
 * آماده‌سازی سند حسابداری دوردیفی برای گردش چک (شماره سند + حساب‌ها).
 * اگر مبلغ از سقف Int ستون‌های JournalLine بزرگ‌تر باشد null برمی‌گردد
 * (محدودیت اسکیما — ثبت کامل در AuditLog انجام می‌شود).
 */
async function prepareCheckJournal(
 tenantId: string,
 check: { number: string; bankName: string },
 amountRial: bigint,
 debitAccount: string,
 creditAccount: string,
 description: string
): Promise<PreparedJournal | null> {
 const amount = Number(amountRial);
 if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_JOURNAL_INT) {
 return null;
 }

 const groupId = await getDefaultAccountGroupId(tenantId);
 const debitAcc = await findOrCreateAccount(tenantId, groupId, debitAccount, "DEBIT");
 const creditAcc = await findOrCreateAccount(tenantId, groupId, creditAccount, "CREDIT");
 const { seq } = await nextDocumentNumber("JOURNAL", tenantId);

 return { number: seq, debitAccountId: debitAcc.id, creditAccountId: creditAcc.id, amount, description };
}

// PATCH /api/checks?id=xxx — به‌روزرسانی وضعیت چک (وصول/برگشت)
// بدنه: { status: "COLLECTED" | "BOUNCED" }
//
// FIX (MEDIUM): ماشین حالت — REGISTERED فقط به COLLECTED/BOUNCED می‌رود و
// این دو وضعیت نهایی‌اند (قبلاً هر گذاری آزاد بود: COLLECTED → BOUNCED و
// BOUNCED → REGISTERED باعث دوباردیداری در KPIها می‌شد).
// FIX (HIGH/MEDIUM): وصول/برگشت چک حالا اثر حسابداری دارد — همه در «یک» $transaction:
// ۱) وضعیت چک، ۲) موجودی حساب بانکی (دریافتی + / پرداختی −)، ۳) سند حسابداری:
//   - وصول چک دریافتی: بدهکار «بانک» / بستانکار «چک‌های دریافتنی»
//   - وصول چک پرداختی: بدهکار «چک‌های پرداختنی» / بستانکار «بانک»
//   - برگشت چک دریافتی: بدهکار «مطالبات از طرف‌حساب» / بستانکار «چک‌های دریافتنی»
//   - برگشت چک پرداختی: بدهکار «چک‌های پرداختنی» / بستانکار «بدهی به طرف‌حساب»
export async function PATCH(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه چک الزامی است" },
 { status: 400 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const { status } = body as { status?: string };

 const allowed = ["COLLECTED", "BOUNCED"];
 const newStatus = String(status || "").toUpperCase();
 if (!allowed.includes(newStatus)) {
 return NextResponse.json(
 {
 success: false,
 error: "وضعیت نامعتبر است — فقط «وصول شده» یا «برگشت خورده» قابل ثبت است",
 },
 { status: 400 }
 );
 }

 // چک باید متعلق به tenant فعلی باشد
 const check = await db.check.findFirst({
 where: { id, tenantId: tenant.id },
 });
 if (!check) {
 return NextResponse.json(
 { success: false, error: "چک یافت نشد" },
 { status: 404 }
 );
 }

 // ماشین حالت: REGISTERED → {COLLECTED|BOUNCED} (نهایی)
 if (check.status === "COLLECTED" || check.status === "BOUNCED") {
 return NextResponse.json(
 {
 success: false,
 error:
 check.status === "COLLECTED"
? "این چک قبلاً وصول شده است — تغییر وضعیت مجاز نیست"
: "این چک برگشت خورده است — برای پیگیری، چک جدید ثبت کنید",
 },
 { status: 409 }
 );
 }

 const isReceived = check.type === "RECEIVED";
 const amountRial = check.amount;
 const amountToman = Number(amountRial) / 10;

 // حساب بانکی هدف: bankAccountId چک، وگرنه اولین حساب فعال tenant
 const bankAccount = check.bankAccountId
? await db.bankAccount.findFirst({
 where: { id: check.bankAccountId, tenantId: tenant.id, deletedAt: null },
 })
: await db.bankAccount.findFirst({
 where: { tenantId: tenant.id, deletedAt: null },
 orderBy: { createdAt: "asc" },
 });

 // آماده‌سازی سند «قبل از» تراکنش (شماره سند اتمیک + حساب‌ها) — تا داخل
 // $transaction با کلاینت سراسری (قفل SQLite) تداخل نداشته باشیم
 const journal = await prepareCheckJournal(
 tenant.id,
 { number: check.number, bankName: check.bankName },
 amountRial,
 newStatus === "COLLECTED"
? (isReceived? "بانک": "چک‌های پرداختنی")
: (isReceived? "مطالبات از طرف‌حساب": "چک‌های پرداختنی"),
 newStatus === "COLLECTED"
? (isReceived? "چک‌های دریافتنی": "بانک")
: (isReceived? "چک‌های دریافتنی": "بدهی به طرف‌حساب"),
 newStatus === "COLLECTED"
? (isReceived
? `وصول چک دریافتی شماره ${check.number} (${check.bankName})`
: `پرداخت چک شماره ${check.number} (${check.bankName})`)
: (isReceived
? `برگشت چک دریافتی شماره ${check.number} (${check.bankName})`
: `برگشت چک پرداختی شماره ${check.number} (${check.bankName})`)
 );

 // همه‌ی نوشتن‌ها اتمیک: وضعیت چک + موجودی بانک + سند حسابداری
 await db.$transaction(async (tx) => {
 await tx.check.update({
 where: { id: check.id },
 data: { status: newStatus },
 });

 if (newStatus === "COLLECTED" && bankAccount) {
 const delta = isReceived? amountRial: -amountRial;
 await tx.bankAccount.update({
 where: { id: bankAccount.id },
 data: { balance: { increment: delta } },
 });
 }

 if (journal) {
 await tx.journalEntry.create({
 data: {
 tenantId: tenant.id,
 number: journal.number,
 date: new Date(),
 type: "JOURNAL",
 description: journal.description,
 status: "POSTED",
 lines: {
 create: [
 {
 tenantId: tenant.id,
 accountId: journal.debitAccountId,
 debit: journal.amount,
 credit: 0,
 description: journal.description,
 },
 {
 tenantId: tenant.id,
 accountId: journal.creditAccountId,
 debit: 0,
 credit: journal.amount,
 description: journal.description,
 },
 ],
 },
 },
 });
 }
 });

 await auditLog({
 tenantId: tenant.id,
 action: "UPDATE",
 entity: "Check",
 entityId: check.id,
 changes: {
 from: check.status,
 to: newStatus,
 amountToman,
 bankBalanceUpdated:
 newStatus === "COLLECTED" && Boolean(bankAccount),
 journalNumber: journal?.number?? null,
 journalSkipped: journal === null,
 },
 req,
 });

 // باطل‌سازی کش داشبورد — وضعیت چک و موجودی بانکی در KPIها دیده شود
 invalidateDashboardCache(tenant.id);

 const statusFa =
 newStatus === "COLLECTED"? "وصول شده": "برگشت خورده";
 return NextResponse.json({
 success: true,
 message:
 newStatus === "COLLECTED"
? `وضعیت چک شماره ${check.number} به «${statusFa}» تغییر یافت` +
 (bankAccount
? ` و ${amountToman.toLocaleString("fa-IR")} تومان به موجودی حساب ${bankAccount.bankName} ${isReceived? "افزوده": "کسر"} شد`
: " (حساب بانکی ثبت‌شده‌ای برای به‌روزرسانی موجودی یافت نشد)") +
 (journal? ` — سند حسابداری شماره ${journal.number} ثبت شد`: "")
: `وضعیت چک شماره ${check.number} به «${statusFa}» تغییر یافت` +
 (journal? ` — سند حسابداری شماره ${journal.number} ثبت شد`: ""),
 data: { id: check.id, status: newStatus, journalNumber: journal?.number?? null },
 });
 } catch (error) {
 console.error("Update check error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی چک" },
 { status: 500 }
 );
 }
}
