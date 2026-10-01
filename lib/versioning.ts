import { db } from "@/lib/db";
import type { DocumentVersion } from "@prisma/client";

// ============ Document Versioning Library ============
// مدیریت نسخه‌های اسناد (فاکتور، سند حسابداری)
// هر نسخه شامل snapshot کامل سند به‌صورت JSON است.

export const VERSIONED_ENTITIES = ["INVOICE", "JOURNAL_ENTRY"] as const;
export type VersionedEntity = (typeof VERSIONED_ENTITIES)[number];

interface SnapshotData {
 [key: string]: unknown;
}

/**
 * ذخیره نسخه فعلی سند به‌عنوان یک snapshot.
 * نسخه‌بندی به‌صورت افزایشی است (1, 2, 3,...).
 * اگر نسخه قبلی با snapshot یکسان وجود داشت، رکورد جدید ایجاد نمی‌شود.
 */
export async function saveVersion(
 entityType: string,
 entityId: string,
 tenantId: string,
 userId?: string,
 description?: string
): Promise<DocumentVersion | null> {
 // گرفتن snapshot فعلی سند از DB
 const snapshot = await fetchSnapshot(entityType, entityId, tenantId);
 if (!snapshot) return null;

 const snapshotJson = JSON.stringify(snapshot, (_key, value) =>
 typeof value === "bigint"? value.toString(): value
 );

 // بررسی نسخه آخر برای جلوگیری از snapshot تکراری
 const lastVersion = await db.documentVersion.findFirst({
 where: { entityType, entityId, tenantId },
 orderBy: { version: "desc" },
 take: 1,
 });

 if (lastVersion && lastVersion.snapshot === snapshotJson) {
 // بدون تغییر — نسخه جدید ثبت نمی‌شود
 return null;
 }

 const nextVersion = lastVersion? lastVersion.version + 1: 1;

 return db.documentVersion.create({
 data: {
 tenantId,
 entityType,
 entityId,
 version: nextVersion,
 snapshot: snapshotJson,
 changedBy: userId,
 changeDescription: description,
 },
 });
}

/**
 * دریافت تاریخچه نسخه‌های یک سند (جدیدترین اول).
 */
export async function getVersionHistory(
 entityType: string,
 entityId: string,
 tenantId: string
): Promise<DocumentVersion[]> {
 return db.documentVersion.findMany({
 where: { entityType, entityId, tenantId },
 orderBy: { version: "desc" },
 take: 100,
 });
}

/**
 * بازیابی سند به یک نسخه خاص.
 * snapshot نسخه را به جدول اصلی برمی‌گرداند.
 */
export async function restoreVersion(
 versionId: string,
 tenantId: string
): Promise<{ success: boolean; message: string }> {
 const version = await db.documentVersion.findUnique({
 where: { id: versionId },
 });
 if (!version || version.tenantId!== tenantId) {
 return { success: false, message: "نسخه یافت نشد" };
 }

 const snapshot = JSON.parse(version.snapshot) as SnapshotData;
 const { entityType, entityId } = version;

 try {
 if (entityType === "INVOICE") {
 // به‌روزرسانی فاکتور با snapshot
 const { number, type, partyId, date, dueDate, status, description, items } =
 snapshot;
 const invoiceData: Record<string, unknown> = {
 number: String(number?? ""),
 type: String(type?? "SALE"),
 partyId: String(partyId?? ""),
 date: date? new Date(date as string): new Date(),
 dueDate: dueDate? new Date(dueDate as string): null,
 status: String(status?? "DRAFT"),
 description: (description as string)?? null,
 };

 // تبدیل مبالغ BigInt از snapshot (string)
 for (const field of ["subtotal", "discount", "tax", "otherCosts", "total", "paidAmount"]) {
 if (snapshot[field]!== undefined && snapshot[field]!== null) {
 invoiceData[field] = BigInt(snapshot[field] as string | number);
 }
 }

 await db.invoice.update({
 where: { id: entityId },
 data: invoiceData as never,
 });

 // به‌روزرسانی آیتم‌ها: حذف قدیمی‌ها و ایجاد جدید از snapshot
 if (Array.isArray(items)) {
 await db.invoiceItem.deleteMany({ where: { invoiceId: entityId } });
 for (const it of items) {
 await db.invoiceItem.create({
 data: {
 invoiceId: entityId,
 productId: (it.productId as string) || null,
 description: String(it.description?? ""),
 quantity: Number(it.quantity?? 1),
 unitPrice: BigInt(String(it.unitPrice?? "0")),
 discount: Number(it.discount?? 0),
 taxRate: Number(it.taxRate?? 0.09),
 taxAmount: BigInt(String(it.taxAmount?? "0")),
 total: BigInt(String(it.total?? "0")),
 },
 });
 }
 }
 } else if (entityType === "JOURNAL_ENTRY") {
 const { number, type, description, status, date } = snapshot;
 await db.journalEntry.update({
 where: { id: entityId },
 data: {
 number: Number(number?? 1),
 type: String(type?? "JOURNAL"),
 description: String(description?? ""),
 status: String(status?? "DRAFT"),
 date: date? new Date(date as string): new Date(),
 } as never,
 });
 }

 // ثبت نسخه جدید با توضیح بازیابی
 await saveVersion(
 entityType,
 entityId,
 tenantId,
 undefined,
 `بازیابی به نسخه ${version.version}`
 );

 return {
 success: true,
 message: `سند به نسخه ${version.version} بازیابی شد`,
 };
 } catch (error) {
 console.error("restoreVersion error:", error);
 return { success: false, message: "خطا در بازیابی نسخه" };
 }
}

/**
 * گرفتن snapshot فعلی سند از DB برای ذخیره به‌عنوان نسخه.
 */
async function fetchSnapshot(
 entityType: string,
 entityId: string,
 tenantId: string
): Promise<SnapshotData | null> {
 if (entityType === "INVOICE") {
 const invoice = await db.invoice.findFirst({
 where: { id: entityId, tenantId },
 include: { items: true },
 });
 if (!invoice) return null;
 return {
 number: invoice.number,
 type: invoice.type,
 partyId: invoice.partyId,
 date: invoice.date,
 dueDate: invoice.dueDate,
 subtotal: invoice.subtotal.toString(),
 discount: invoice.discount.toString(),
 tax: invoice.tax.toString(),
 otherCosts: invoice.otherCosts.toString(),
 total: invoice.total.toString(),
 paidAmount: invoice.paidAmount.toString(),
 status: invoice.status,
 description: invoice.description,
 items: invoice.items.map((it) => ({
 productId: it.productId,
 description: it.description,
 quantity: it.quantity,
 unitPrice: it.unitPrice.toString(),
 discount: it.discount,
 taxRate: it.taxRate,
 taxAmount: it.taxAmount.toString(),
 total: it.total.toString(),
 })),
 };
 }
 if (entityType === "JOURNAL_ENTRY") {
 const entry = await db.journalEntry.findFirst({
 where: { id: entityId, tenantId },
 include: { lines: true },
 });
 if (!entry) return null;
 return {
 number: entry.number,
 type: entry.type,
 description: entry.description,
 status: entry.status,
 date: entry.date,
 lines: entry.lines.map((l) => ({
 accountId: l.accountId,
 subAccountId: l.subAccountId,
 description: l.description,
 debit: l.debit.toString(),
 credit: l.credit.toString(),
 })),
 };
 }
 return null;
}
