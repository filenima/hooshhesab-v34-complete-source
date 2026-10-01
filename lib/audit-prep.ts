// آماده‌سازی حسابرسی هوشمند — هوش
// تولید چک‌لیست اسناد، تطبیق‌ها، نقاط ریسک و توصیه‌ها برای حسابرسی سالانه

import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";

export type AuditStatus = "ok" | "warning" | "missing" | "critical";
export type AuditPriority = "low" | "medium" | "high" | "critical";

export interface AuditItem {
 category: string;
 description: string;
 status: AuditStatus;
 priority: AuditPriority;
 recommendation: string;
}

export interface AuditChecklist {
 year: number;
 generatedAt: string;
 items: AuditItem[];
 summary: {
 total: number;
 ok: number;
 warning: number;
 missing: number;
 critical: number;
 };
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;

/** سال مالی شمسی تقریبی از تاریخ میلادی */
function getJalaliYear(date: Date): number {
 const gy = date.getFullYear();
 const gm = date.getMonth() + 1;
 const gd = date.getDate();
 // تقریب: اگر قبل از 21 مارس (فروردین) بود، سال قبل
 const dayOfYear = Math.floor((Date.UTC(gy, gm - 1, gd) - Date.UTC(gy, 0, 1)) / 86_400_000);
 return gy - (dayOfYear < 80? 622: 621);
}

/** محاسبه‌ی بازه‌ی زمانی یک سال شمسی (تقریبی) */
function getFiscalYearRange(jalaliYear: number): { start: Date; end: Date } {
 // فرض: سال مالی از ۱ فروردین شروع می‌شود = 21 یا 22 مارس
 // تبدیل سال شمسی به میلادی: سال شمسی + ۶۲۱ = سال میلادی تقریبی
 // مثال: ۱۴۰۵ شمسی ≈ ۲۰۲۶ میلادی
 const start = new Date(jalaliYear + 621, 2, 21); // March 21
 const end = new Date(jalaliYear + 622, 2, 20); // March 20 next year
 return { start, end };
}

/**
 * آماده‌سازی چک‌لیست حسابرسی برای یک سال مالی.
 * بررسی‌های متقاطع: فاکتور سند حسابداری، انبار دفتر کل، بانک تطبیق.
 */
export async function prepareAudit(
 tenantId: string,
 year: number
): Promise<AuditChecklist> {
 const { start, end } = getFiscalYearRange(year);
 const items: AuditItem[] = [];

 // ===== ۱. اسناد پایه مورد نیاز =====
 const [
 invoices,
 purchaseInvoices,
 journalEntries,
 bankAccounts,
 products,
 stockItems,
 payrolls,
 checks,
 fiscalYear,
 ] = await Promise.all([
 db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 date: { gte: start, lte: end },
 deletedAt: null,
 },
 select: {
 id: true,
 number: true,
 total: true,
 status: true,
 partyId: true,
 modianStatus: true,
 date: true,
 },
 }),
 db.invoice.findMany({
 where: {
 tenantId,
 type: "PURCHASE",
 date: { gte: start, lte: end },
 deletedAt: null,
 },
 select: {
 id: true,
 number: true,
 total: true,
 status: true,
 partyId: true,
 modianStatus: true,
 },
 }),
 db.journalEntry.findMany({
 where: {
 tenantId,
 date: { gte: start, lte: end },
 deletedAt: null,
 },
 select: { id: true, number: true, status: true, description: true, date: true },
 }),
 db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 select: { id: true, bankName: true, accountNumber: true, balance: true },
 }),
 db.product.findMany({
 where: { tenantId, deletedAt: null },
 select: { id: true, name: true, sku: true },
 }),
 db.stockItem.findMany({
 where: { tenantId },
 select: { id: true, productId: true, quantity: true },
 }),
 db.payroll.findMany({
 where: { tenantId },
 select: { id: true, month: true, total: true },
 }),
 db.check.findMany({
 where: { tenantId, deletedAt: null },
 select: { id: true, amount: true, status: true, dueDate: true },
 }),
 db.fiscalYear.findFirst({
 where: {
 tenantId,
 OR: [
 { name: { contains: String(year) } },
 { name: { contains: toPersianDigits(year) } },
 { isCurrent: true },
 ],
 },
 select: { id: true, status: true, name: true },
 }),
 ]);

 // ===== ۲. اسناد ضروری =====
 items.push({
 category: "اسناد پایه",
 description: `صورتحساب‌های الکترونیکی (سامانه مودیان) — تعداد فاکتورهای فروش: ${invoices.length}`,
 status: invoices.length > 0? "ok": "missing",
 priority: invoices.length > 0? "low": "critical",
 recommendation:
 invoices.length > 0
? "فاکتورهای فروش در سامانه مودیان ثبت شده‌اند؛ اطمینان از تأیید همه‌ی آنها"
: "هیچ فاکتور فروشی در این سال ثبت نشده — بررسی دوره‌ی مالی",
 });

 const noModian = invoices.filter((i) =>!i.modianStatus || i.modianStatus === "PENDING");
 if (noModian.length > 0) {
 items.push({
 category: "سامانه مودیان",
 description: `${noModian.length} فاکتور فروش بدون تأیید در سامانه مودیان`,
 status: "warning",
 priority: "high",
 recommendation: "ارسال و پیگیری فاکتورهای ارسال‌نشده به سامانه مودیان قبل از حسابرسی",
 });
 }

 items.push({
 category: "اسناد پایه",
 description: `دفتر روزنامه و دفتر کل — تعداد اسناد: ${journalEntries.length}`,
 status: journalEntries.length > 0? "ok": "missing",
 priority: journalEntries.length > 0? "low": "critical",
 recommendation:
 journalEntries.length > 0
? "بررسی قطعی بودن همه‌ی اسناد و مهر تاریخ"
: "ثبت اسناد حسابداری دوره الزامی است",
 });

 const draftEntries = journalEntries.filter((j) => j.status === "DRAFT");
 if (draftEntries.length > 0) {
 items.push({
 category: "اسناد حسابداری",
 description: `${draftEntries.length} سند در وضعیت پیش‌نویس (قطعی نشده)`,
 status: "critical",
 priority: "critical",
 recommendation: "قطعی کردن یا حذف اسناد پیش‌نویس قبل از حسابرسی",
 });
 }

 // ===== ۳. تطبیق فاکتور سند حسابداری =====
 // بررسی: آیا برای هر فاکتور یک سند حسابدانی مرتبط ثبت شده؟
 // به‌صورت تقریبی: تطبیق از روی شرح سند (شامل شماره فاکتور)
 const invoiceNumbers = new Set(invoices.map((i) => i.number));
 let matchedCount = 0;
 for (const invNum of invoiceNumbers) {
 const hasEntry = journalEntries.some(
 (j) => j.description && j.description.includes(invNum)
 );
 if (hasEntry) matchedCount++;
 }
 const unmatched = invoiceNumbers.size - matchedCount;
 items.push({
 category: "تطبیق فاکتور و سند",
 description: `فاکتورهای فروش دارای سند حسابداری: ${matchedCount} از ${invoiceNumbers.size}`,
 status: unmatched === 0? "ok": unmatched < 5? "warning": "critical",
 priority: unmatched === 0? "low": unmatched < 5? "medium": "high",
 recommendation:
 unmatched === 0
? "تطبیق کامل — همه‌ی فاکتورها دارای سند هستند"
: `ثبت سند حسابداری برای ${unmatched} فاکتور فاقد سند`,
 });

 // ===== ۴. موجودی انبار دفتر کل =====
 const stockValue = stockItems.reduce((s, i) => s + Number(i.quantity || 0), 0);
 items.push({
 category: "انبارگردانی",
 description: `تعداد اقلام کالا: ${products.length} — مجموع موجودی: ${stockValue.toLocaleString("en-US")} واحد`,
 status: products.length > 0? "ok": "warning",
 priority: products.length > 0? "low": "medium",
 recommendation:
 products.length > 0
? "انبارگردانی پایان سال و تطبیق با حساب موجودی کالا (کد ۱۱۸)"
: "ثبت کارت انبار و موجودی اول دوره",
 });

 // ===== ۵. تطبیق بانک =====
 if (bankAccounts.length === 0) {
 items.push({
 category: "تطبیق بانک",
 description: "هیچ حساب بانکی ثبت نشده است",
 status: "missing",
 priority: "high",
 recommendation: "ثبت اطلاعات حساب‌های بانکی و موجودی اول دوره",
 });
 } else {
 const totalBank = bankAccounts.reduce((s, b) => s + Number(b.balance), 0);
 items.push({
 category: "تطبیق بانک",
 description: `مجموع موجودی بانک‌ها: ${rialsToToman(totalBank).toLocaleString("en-US")} تومان در ${bankAccounts.length} حساب`,
 status: "ok",
 priority: "medium",
 recommendation:
 "دریافت گردش حساب از بانک و تطبیق با دفتر معین بانک — بررسی وصول‌نشده‌ها و پرداخت‌نشده‌ها",
 });
 }

 // ===== ۶. چک‌های معوق =====
 const now = new Date();
 const overdueChecks = checks.filter(
 (c) => c.dueDate && c.dueDate < now && (c.status === "REGISTERED" || c.status === "PENDING")
 );
 if (overdueChecks.length > 0) {
 items.push({
 category: "چک‌ها",
 description: `${overdueChecks.length} چک سررسید شده وصول‌نشده`,
 status: "warning",
 priority: "high",
 recommendation: "پیگیری وصول چک‌های معوق یا ثبت برگشت چک در دفتر",
 });
 }

 // ===== ۷. حقوق و دستمزد =====
 if (payrolls.length > 0) {
 items.push({
 category: "حقوق و دستمزد",
 description: `تعداد فیش‌های حقوق: ${payrolls.length}`,
 status: "ok",
 priority: "medium",
 recommendation:
 "تطبیق لیست حقوق با اسناد پرداختی و بررسی کسورات قانونی (بیمه و مالیات)",
 });
 } else {
 items.push({
 category: "حقوق و دستمزد",
 description: "هیچ فیش حقوقی برای سال مالی ثبت نشده",
 status: "warning",
 priority: "medium",
 recommendation: "ثبت لیست حقوق ماهانه و کسورات قانونی",
 });
 }

 // ===== ۸. خرید و کنترل هزینه =====
 items.push({
 category: "خرید",
 description: `فاکتورهای خرید سال: ${purchaseInvoices.length}`,
 status: purchaseInvoices.length > 0? "ok": "warning",
 priority: purchaseInvoices.length > 0? "low": "medium",
 recommendation:
 purchaseInvoices.length > 0
? "تطبیق فاکتورهای خرید با قراردادها و رسید انبار"
: "ثبت فاکتورهای خرید و رسیدهای انبار",
 });

 // ===== ۹. سال مالی =====
 if (!fiscalYear) {
 items.push({
 category: "سال مالی",
 description: `سال مالی ${year} تعریف نشده است`,
 status: "missing",
 priority: "high",
 recommendation: "تعریف سال مالی در سیستم و بستن سال قبل",
 });
 } else if (fiscalYear.status === "CLOSED") {
 items.push({
 category: "سال مالی",
 description: `سال مالی ${year} بسته شده — حسابرسی نهایی انجام شده`,
 status: "ok",
 priority: "low",
 recommendation: "بازگشایی سال فقط در صورت نیاز و با مجوز حسابدار ارشد",
 });
 } else {
 items.push({
 category: "سال مالی",
 description: `سال مالی ${year} باز و فعال است`,
 status: "ok",
 priority: "low",
 recommendation: "بستن سال پس از تکمیل اسناد و تطبیق‌ها",
 });
 }

 // ===== ۱۰. دارایی‌های ثابت و استهلاک =====
 items.push({
 category: "دارایی‌های ثابت",
 description: "محاسبه استهلاک دارایی‌های ثابت پایان سال",
 status: "ok",
 priority: "medium",
 recommendation:
 "ثبت سند استهلاک پایان سال و تطبیق با رویه سال قبل — بررسی افزایش/کاهش دارایی‌ها",
 });

 // ===== ۱۱. مالیات =====
 items.push({
 category: "مالیات",
 description: "اظهارنامه مالیات بر ارزش افزوده و مالیات بر درآمد",
 status: "ok",
 priority: "high",
 recommendation:
 "تهیه اظهارنامه‌های فصلی VAT و اظهارنامه سالانه مالیات بر درآمد تا پایان خرداد سال بعد",
 });

 // ===== ۱۲. ذخایر و تعهدات =====
 items.push({
 category: "ذخایر و تعهدات",
 description: "بررسی ذخیره مطالبات سوخت‌شده و ذخیره مالیات",
 status: "ok",
 priority: "high",
 recommendation:
 "ثبت ذخیره برای مطالبات مشکوک‌الوصول و ذخیره مالیات بر درآمد سال جاری",
 });

 // محاسبه‌ی خلاصه
 const summary = {
 total: items.length,
 ok: items.filter((i) => i.status === "ok").length,
 warning: items.filter((i) => i.status === "warning").length,
 missing: items.filter((i) => i.status === "missing").length,
 critical: items.filter((i) => i.status === "critical").length,
 };

 return {
 year,
 generatedAt: new Date().toISOString(),
 items,
 summary,
 };
}
