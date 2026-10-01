import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, getAuthContext } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { invalidateDashboardCache } from "@/lib/cache";
import { nextDocumentNumber } from "@/lib/document-sequence";
import { getLatestRate } from "@/lib/currency";
import {
  getVatRateFraction,
  isAutoPostJournalsEnabled,
  isFinalInvoiceStatus,
  invoiceHasPostedLedger,
  postInvoiceSettlementToLedger,
  reverseInvoiceLedger,
} from "@/lib/accounting";
import { moveStockForInvoice, NegativeStockError } from "@/lib/products";
import {
  InvalidInputError,
  computeInvoiceTotals,
  loadOwnedProducts,
  postInvoiceJournalForce,
  resolvePartyId,
  reverseAndClearInvoiceStock,
  serializeInvoice,
  writeInvoiceAudit,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/invoices/[id] — دریافت یک فاکتور با اقلام و طرف حساب.
 * FIX(F2 از ممیزی رگرنس v4): این مسیر قبلاً وجود نداشت (فقط email/print داشت)
 * و هر GET /api/invoices/{id} → 404 می‌داد.
 * امنیت: احراز هویت + گارد tenant (فاکتور فقط از سازمان خود کاربر).
 * پارامترها: ?include=items,party,journal (پیش‌فرض: items,party)
 */

export async function GET(
 req: NextRequest,
 context: { params: Promise<{ id: string }> }
) {
 try {
 const { id } = await context.params;

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "احراز هویت لازم است" },
 { status: 401 }
 );
 }

 if (!id || id.length < 10) {
 return NextResponse.json(
 { success: false, error: "شناسه فاکتور نامعتبر" },
 { status: 400 }
 );
 }

 const includeParam = req.nextUrl.searchParams.get("include") ?? "items,party";
 const wanted = new Set(
 includeParam.split(",").map((s) => s.trim()).filter(Boolean)
 );

 const invoice = await db.invoice.findUnique({
 where: { id },
 include: {
 items: wanted.has("items") || wanted.size === 0,
 party: wanted.has("party") || wanted.size === 0,
 // FIX(v12.1): tenant برای پیش‌نمایش چاپ (نام شرکت/تلفن/آدرس روی چاپی)
 tenant: wanted.has("tenant")
? {
 select: {
 name: true,
 invoicePhone: true,
 invoiceAddress: true,
 invoiceWebsite: true,
 logoUrl: true,
 invoiceSlogan: true,
 },
 }
: false,
 },
 });

 if (!invoice || invoice.tenantId !== tenant.id) {
 // 404 به‌جای 403 — افشای وجود فاکتور بین tenantها نشود
 return NextResponse.json(
 { success: false, error: "فاکتور یافت نشد" },
 { status: 404 }
 );
 }

 // اسناد حسابداری مرتبط (اختیاری) — از طریق sourceInvoiceId
 let journal: unknown = undefined;
 if (wanted.has("journal")) {
 journal = await db.journalEntry.findMany({
 where: { tenantId: tenant.id, sourceInvoiceId: id },
 select: {
 id: true, number: true, date: true, type: true,
 status: true, description: true,
 },
 });
 }

 // FIX: مبالغ در مدل Invoice از نوع BigInt هستند و NextResponse.json
 // از BigInt پشتیبانی نمی‌کند — تبدیل امن به Number (مثل /api/embed/invoice)
 const serializable = JSON.parse(
 JSON.stringify(invoice, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
 );

 return NextResponse.json({
 success: true,
 data: serializable,
 ...(journal !== undefined
 ? { journal: JSON.parse(JSON.stringify(journal)) }
 : {}),
 });
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : "خطای ناشناخته";
 console.error("[GET /api/invoices/[id]]", msg);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت فاکتور" },
 { status: 500 }
 );
 }
}

/* ============================================================
 * Task 21-B — PUT/PATCH /api/invoices/[id] — ویرایش فاکتور ذخیره‌شده
 * ============================================================
 *
 * بدنه (همه اختیاری به‌جز items — جایگزینی کامل اقلام):
 *  { type?, partyId?|partyName?, date?, dueDate?, warehouseId?, items[],
 *    description?, currency?, exchangeRate?, paymentType? }
 *
 * قواعد حسابداری (نامتغیر می‌ماند):
 *  - اگر فاکتور نهایی بوده (SENT/PAID/...): سند حسابداری با «سند قرینه»
 *    معکوس (reverseInvoiceLedger — همان الگوی ابطال/حذف موجود) و سند جدید
 *    ثبت می‌شود؛ حرکت انبار با الگوی delete+recreate معکوس و دوباره اعمال
 *    می‌شود (گارد موجودی منفی مجدد فعال است).
 *  - سند تسویهٔ پرداخت‌های قبلی نیز معکوس و به مبلغِ (clamp شدهٔ) جدید
 *    دوباره ثبت می‌شود — دفاتر با paidAmount همیشه سازگار می‌ماند.
 *  - فاکتور RESERVED فقط فیلدهایش به‌روز می‌شود (چیزی برای معکوس‌کردن ندارد).
 *  - وضعیت از این مسیر عوض نمی‌شود (نهایی‌سازی: /finalize، تسویه: markPaid).
 *  - AuditLog: entity=Invoice، action=UPDATE، changes JSON با old/new.
 */
async function handleEdit(
 req: NextRequest,
 context: { params: Promise<{ id: string }> }
) {
 try {
 const { id } = await context.params;

 // Rate limit — همان سقف عملیات دسته‌ای accounting
 const ip = getClientIp(req);
 const ctx0 = await getAuthContext(req).catch(() => null);
 const rl = ctx0
 ? rateLimitCheck(`invoice-edit:${ctx0.tenantId}:${ctx0.userId ?? ip}`, 60, 60_000)
 : rateLimitCheck(`invoice-edit:${ip}`, 5, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const ctx = ctx0;
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const userId = ctx.userId;

 if (!id || id.length < 10) {
 return NextResponse.json(
 { success: false, error: "شناسه فاکتور نامعتبر" },
 { status: 400 }
 );
 }

 // فاکتور هدف — گارد tenant (404 به‌جای 403)
 const existing = await db.invoice.findFirst({
 where: { id, tenantId, deletedAt: null },
 include: { items: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "فاکتور یافت نشد" },
 { status: 404 }
 );
 }
 if (existing.status === "CANCELLED") {
 return NextResponse.json(
 {
 success: false,
 error: "فاکتور ابطال‌شده قابل ویرایش نیست — فاکتور جدید ثبت کنید",
 },
 { status: 400 }
 );
 }

 const body = await req.json().catch(() => ({}));
 // FIX(zero-stock): تأیید صریح کاربر برای فاکتور با موجودی صفر/منفی (از دیالوگ کلاینت)
 const allowNegStock: boolean = (body as { allowNegativeStock?: boolean })?.allowNegativeStock === true;
 const {
 type,
 partyId,
 partyName,
 date,
 dueDate,
 warehouseId,
 items,
 description,
 currency,
 exchangeRate,
 paymentType,
 } = body as Record<string, unknown>;

 if (!Array.isArray(items) || items.length === 0) {
 return NextResponse.json(
 { success: false, error: "حداقل یک قلم فاکتور الزامی است" },
 { status: 400 }
 );
 }

 // نوع — از بدنه یا مقدار فعلی
 const invoiceType =
 type !== undefined
 ? String(type).toUpperCase()
 : existing.type;
 if (!["SALE", "PURCHASE", "PRE_INVOICE", "RETURN"].includes(invoiceType)) {
 return NextResponse.json(
 { success: false, error: "نوع فاکتور نامعتبر است" },
 { status: 400 }
 );
 }

 // نوع پرداخت — CASH | CREDIT
 const normPaymentType =
 (paymentType !== undefined
 ? String(paymentType).toUpperCase()
 : (existing.paymentType ?? "CASH")) === "CREDIT"
 ? "CREDIT"
 : "CASH";

 // تاریخ‌ها
 const invoiceDate = date !== undefined ? new Date(String(date)) : existing.date;
 if (Number.isNaN(invoiceDate.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ فاکتور نامعتبر است" },
 { status: 400 }
 );
 }
 let invoiceDueDate: Date | null = existing.dueDate;
 if (dueDate !== undefined) {
 const rawStr = String(dueDate ?? "").trim();
 if (rawStr) {
 const parsed = new Date(rawStr);
 if (Number.isNaN(parsed.getTime())) {
 return NextResponse.json(
 { success: false, error: "تاریخ سررسید نامعتبر است" },
 { status: 400 }
 );
 }
 invoiceDueDate = parsed;
 } else {
 invoiceDueDate = null;
 }
 }

 // طرف‌حساب — id متعلق به tenant یا پیدا/ساخت با نام
 let resolvedPartyId: string;
 try {
 resolvedPartyId = await resolvePartyId(
 tenantId,
 partyId !== undefined ? String(partyId) : existing.partyId,
 partyName ? String(partyName) : undefined
 );
 } catch (err) {
 if (err instanceof InvalidInputError) {
 return NextResponse.json(
 { success: false, error: err.message },
 { status: err.message === "طرف‌حساب یافت نشد" ? 404 : 400 }
 );
 }
 throw err;
 }

 // ارز — از بدنه یا مقدار فعلی
 const normCurrency = (
 currency !== undefined ? String(currency) : existing.currency || "IRR"
 ).toUpperCase();
 let finalRate = 1;
 if (normCurrency === "TOMAN") {
 finalRate = 10;
 } else if (normCurrency !== "IRR") {
 if (typeof exchangeRate === "number" && exchangeRate > 0) {
 finalRate = exchangeRate;
 } else if (normCurrency === existing.currency && existing.exchangeRate) {
 finalRate = existing.exchangeRate;
 } else {
 const latest = await getLatestRate(normCurrency, "IRR");
 finalRate = latest ?? 1;
 }
 }

 // محاسبات — آینهٔ POST (نرخ مالیات پیش‌فرض از SystemSettings)
 const defaultVatRate = await getVatRateFraction();
 let totals;
 try {
 totals = computeInvoiceTotals(
 items as Array<Record<string, unknown>>,
 defaultVatRate,
 finalRate
 );
 } catch (err) {
 if (err instanceof InvalidInputError) {
 return NextResponse.json(
 { success: false, error: err.message },
 { status: 400 }
 );
 }
 throw err;
 }

 // SECURITY: مالکیت productIdها + نام‌ها
 let productNames: Map<string, string>;
 try {
 productNames = await loadOwnedProducts(totals.items, tenantId);
 } catch (err) {
 if (err instanceof InvalidInputError) {
 return NextResponse.json(
 { success: false, error: err.message },
 { status: 400 }
 );
 }
 throw err;
 }

 // فاکتور نهایی بوده؟ → معکوس + اعمال مجدد لازم است
 const wasFinal = isFinalInvoiceStatus(existing.status);
 const hadLedger = wasFinal ? await invoiceHasPostedLedger(tenantId, id) : false;
 const autoPost = wasFinal ? await isAutoPostJournalsEnabled() : false;

 // clamp پرداخت‌ها به مبلغ جدید
 let newPaid = existing.paidAmount;
 if (newPaid > totals.total) newPaid = totals.total;
 if (newPaid < 0n) newPaid = 0n;

 // وضعیت جدید — فقط بازمحاسبهٔ تسویه؛ تغییر وضعیت از این مسیر ممنوع
 let newStatus = existing.status;
 if (existing.status !== "RESERVED" && existing.status !== "DRAFT" && existing.status !== "PENDING") {
 if (totals.total > 0n && newPaid >= totals.total) newStatus = "PAID";
 else if (newPaid > 0n) newStatus = "PARTIALLY_PAID";
 }

 // شماره‌های سند «قبل از tx» (SQLite تک‌نویسنده — همان الگوی accounting)
 let reversalNumber = 0;
 if (hadLedger) {
 reversalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
 }
 let newJournalNumber = 0;
 if (wasFinal && autoPost) {
 newJournalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
 }
 let settlementNumber = 0;
 if (
 newPaid > 0n &&
 (invoiceType === "SALE" || invoiceType === "PURCHASE")
 ) {
 settlementNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
 }

 const stockContextItems = totals.items
 .filter((it) => it.productId)
 .map((it) => ({
 productId: it.productId as string,
 quantity: it.quantity,
 unitPrice: it.unitPrice,
 }));

 const updated = await db.$transaction(async (tx) => {
 // ۱) معکوس سند حسابداری (سند قرینه — همان الگوی ابطال/حذف)
 if (hadLedger) {
 await reverseInvoiceLedger(
 tx,
 tenantId,
 userId,
 id,
 "ویرایش فاکتور",
 { reversalNumber }
 );
 }

 // ۲) معکوس + پاک‌سازی حرکت انبار (delete+recreate — Task 21-B)
 if (wasFinal) {
 await reverseAndClearInvoiceStock(tx, tenantId, id);
 }

 // ۳) جایگزینی اقلام
 await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
 await tx.invoiceItem.createMany({
 data: totals.items.map((it) => ({ ...it, invoiceId: id })),
 });

 // ۴) به‌روزرسانی سربرگ
 const saved = await tx.invoice.update({
 where: { id },
 data: {
 type: invoiceType,
 partyId: resolvedPartyId,
 date: invoiceDate,
 dueDate: invoiceDueDate,
 warehouseId:
 warehouseId !== undefined
 ? warehouseId
 ? String(warehouseId)
 : null
 : existing.warehouseId,
 description:
 description !== undefined
 ? description
 ? String(description)
 : null
 : existing.description,
 currency: normCurrency,
 exchangeRate: normCurrency === "IRR" ? 1 : finalRate,
 paymentType: normPaymentType,
 subtotal: totals.subtotal,
 tax: totals.tax,
 total: totals.total,
 paidAmount: newPaid,
 status: newStatus,
 },
 include: { items: true, party: true },
 });

 // ۵) اعمال مجدد حرکت انبار (گارد منفی فعال — rollback در صورت خطا)
 if (wasFinal && stockContextItems.length > 0) {
 await moveStockForInvoice(
 tx,
 tenantId,
 {
 invoiceId: id,
 type: invoiceType,
 date: invoiceDate,
 warehouseId: saved.warehouseId,
 allowNegativeStock: allowNegStock === true,
 },
 stockContextItems,
 productNames
 );
 }

 // ۶) سند جدید فاکتور — نسخهٔ force (سند قرینه قبلاً ثبت شده)
 if (wasFinal && autoPost && newJournalNumber > 0) {
 await postInvoiceJournalForce(
 tx,
 tenantId,
 userId,
 {
 invoiceId: id,
 number: saved.number,
 type: invoiceType,
 date: invoiceDate,
 description: saved.description,
 subtotal: saved.subtotal,
 tax: saved.tax,
 discount: saved.discount,
 total: saved.total,
 },
 { journalNumber: newJournalNumber }
 );
 }

 // ۷) سند تسویهٔ پرداخت‌های قبلی — دوباره به مبلغ clamp شده
 // (معکوس در مرحلهٔ ۱ انجام شد؛ بدون این مرحله دفاتر با paidAmount ناسازگار می‌شد)
 if (settlementNumber > 0) {
 await postInvoiceSettlementToLedger(
 tx,
 tenantId,
 userId,
 {
 invoiceId: id,
 number: saved.number,
 type: invoiceType,
 date: invoiceDate,
 description: saved.description,
 },
 newPaid,
 { journalNumber: settlementNumber }
 );
 }

 return saved;
 });

 // حسابرسی — old/new (مبالغ BigInt → Number در writeInvoiceAudit)
 await writeInvoiceAudit(tenantId, userId, "UPDATE", id, {
 number: { old: existing.number, new: updated.number },
 type: { old: existing.type, new: updated.type },
 paymentType: { old: existing.paymentType ?? "CASH", new: normPaymentType },
 dueDate: {
 old: existing.dueDate ? existing.dueDate.toISOString() : null,
 new: invoiceDueDate ? invoiceDueDate.toISOString() : null,
 },
 subtotal: { old: existing.subtotal, new: updated.subtotal },
 tax: { old: existing.tax, new: updated.tax },
 total: { old: existing.total, new: updated.total },
 paidAmount: { old: existing.paidAmount, new: updated.paidAmount },
 status: { old: existing.status, new: updated.status },
 itemsCount: { old: existing.items.length, new: updated.items.length },
 });

 invalidateDashboardCache(tenantId);

 return NextResponse.json({
 success: true,
 data: serializeInvoice(updated),
 message: `فاکتور ${updated.number} به‌روزرسانی شد`,
 });
 } catch (error) {
 if (error instanceof NegativeStockError) {
 return NextResponse.json(
 { success: false, error: `موجودی منفی مجاز نیست — ${error.productName}` },
 { status: 400 }
 );
 }
 if (error instanceof InvalidInputError) {
 return NextResponse.json(
 { success: false, error: error.message },
 { status: 400 }
 );
 }
 console.error("Edit invoice error (/api/invoices/[id]):", error);
 return NextResponse.json(
 { success: false, error: "خطا در ویرایش فاکتور" },
 { status: 500 }
 );
 }
}

export async function PUT(
 req: NextRequest,
 context: { params: Promise<{ id: string }> }
) {
 return handleEdit(req, context);
}

// PATCH — مترادف PUT (همان بدنه/رفتار)
export async function PATCH(
 req: NextRequest,
 context: { params: Promise<{ id: string }> }
) {
 return handleEdit(req, context);
}
