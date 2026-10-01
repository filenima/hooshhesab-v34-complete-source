import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

/**
 * ارسال رویداد به همه‌ی اشتراک‌های فعال اکوسیستم (Nobatime، Catalog، HesabYar).
 * هر درخواست با امضای HMAC-SHA256 (با secret اگر تنظیم شده باشد) امضا می‌شود.
 *
 * @param tenantId شناسه‌ی tenant
 * @param event نام رویداد (invoice_created، payment_received،...)
 * @param data داده‌ی JSON رویداد
 */
export async function sendEcosystemEvent(
 tenantId: string,
 event: string,
 data: unknown
): Promise<{
 dispatched: number;
 succeeded: number;
 failed: number;
}> {
 const subs = await db.ecosystemWebhook.findMany({
 where: { tenantId, event, isActive: true },
 });

 if (subs.length === 0) {
 return { dispatched: 0, succeeded: 0, failed: 0 };
 }

 const body = JSON.stringify({
 event,
 tenantId,
 timestamp: new Date().toISOString(),
 data,
 });

 let succeeded = 0;
 let failed = 0;

 await Promise.all(
 subs.map(async (sub) => {
 try {
 const headers: Record<string, string> = {
 "Content-Type": "application/json",
 "X-Hoosh-Event": event,
 "X-Hoosh-Source": "hoshhesab",
 "X-Hoosh-Service": sub.service,
 "X-Hoosh-Delivery": sub.id,
 };

 if (sub.secret) {
 const signature = createHmac("sha256", sub.secret)
.update(body)
.digest("hex");
 headers["X-Hoosh-Signature"] = `sha256=${signature}`;
 }

 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 10_000);

 const res = await fetch(sub.url, {
 method: "POST",
 headers,
 body,
 signal: controller.signal,
 });

 clearTimeout(timeout);

 if (res.ok) {
 succeeded++;
 await db.ecosystemWebhook.update({
 where: { id: sub.id },
 data: {
 lastFired: new Date(),
 lastStatus: "success",
 },
 });
 } else {
 failed++;
 await db.ecosystemWebhook.update({
 where: { id: sub.id },
 data: {
 lastFired: new Date(),
 lastStatus: "failed",
 },
 });
 }
 } catch (err) {
 console.error(
 `Ecosystem webhook dispatch failed for ${sub.url} (${event}):`,
 err
 );
 failed++;
 try {
 await db.ecosystemWebhook.update({
 where: { id: sub.id },
 data: {
 lastFired: new Date(),
 lastStatus: "failed",
 },
 });
 } catch {
 /* ignore update error */
 }
 }
 })
 );

 return { dispatched: subs.length, succeeded, failed };
}

/**
 * رویدادهای پشتیبانی‌شده در اکوسیستم.
 */
export const ECOSYSTEM_EVENTS = [
 {
 value: "invoice_created",
 label: "فاکتور ایجاد شد",
 description: "هنگام ثبت فاکتور جدید (فروش یا خرید)",
 },
 {
 value: "payment_received",
 label: "پرداخت دریافت شد",
 description: "هنگام ثبت دریافت وجه از طرف‌حساب",
 },
 {
 value: "product_updated",
 label: "کالا به‌روزرسانی شد",
 description: "هنگام تغییر قیمت، موجودی یا اطلاعات کالا",
 },
 {
 value: "party_created",
 label: "طرف‌حساب ایجاد شد",
 description: "هنگام ثبت مشتری یا تأمین‌کننده جدید",
 },
] as const;

export const ECOSYSTEM_SERVICES = [
 { value: "NOBATIME", label: "نوباتایم" },
 { value: "CATALOG", label: "کاتالوگ" },
 { value: "HESABYAR", label: "حساب‌یار" },
] as const;

/**
 * کمک‌تابع: ارسال رویداد ایجاد فاکتور.
 */
export async function notifyInvoiceCreated(
 tenantId: string,
 invoice: {
 id: string;
 number: string;
 type: string;
 total: number | bigint;
 partyId?: string;
 partyName?: string;
 date?: Date | string;
 }
): Promise<void> {
 try {
 await sendEcosystemEvent(tenantId, "invoice_created", {
 invoiceId: invoice.id,
 number: invoice.number,
 type: invoice.type,
 total:
 typeof invoice.total === "bigint"
? invoice.total.toString()
: invoice.total,
 partyId: invoice.partyId,
 partyName: invoice.partyName,
 date: invoice.date
? new Date(invoice.date as string).toISOString()
: undefined,
 });
 } catch (err) {
 console.error("notifyInvoiceCreated failed:", err);
 }
}

/**
 * کمک‌تابع: ارسال رویداد دریافت پرداخت.
 */
export async function notifyPaymentReceived(
 tenantId: string,
 payment: {
 id: string;
 invoiceId?: string;
 invoiceNumber?: string;
 amount: number | bigint;
 partyName?: string;
 date?: Date | string;
 }
): Promise<void> {
 try {
 await sendEcosystemEvent(tenantId, "payment_received", {
 paymentId: payment.id,
 invoiceId: payment.invoiceId,
 invoiceNumber: payment.invoiceNumber,
 amount:
 typeof payment.amount === "bigint"
? payment.amount.toString()
: payment.amount,
 partyName: payment.partyName,
 date: payment.date
? new Date(payment.date as string).toISOString()
: undefined,
 });
 } catch (err) {
 console.error("notifyPaymentReceived failed:", err);
 }
}

/**
 * کمک‌تابع: ارسال رویداد به‌روزرسانی کالا.
 */
export async function notifyProductUpdated(
 tenantId: string,
 product: {
 id: string;
 name: string;
 code?: string;
 price?: number | bigint;
 stock?: number;
 }
): Promise<void> {
 try {
 await sendEcosystemEvent(tenantId, "product_updated", {
 productId: product.id,
 name: product.name,
 code: product.code,
 price:
 typeof product.price === "bigint"
? product.price.toString()
: product.price,
 stock: product.stock,
 });
 } catch (err) {
 console.error("notifyProductUpdated failed:", err);
 }
}

/**
 * کمک‌تابع: ارسال رویداد ایجاد طرف‌حساب.
 */
export async function notifyPartyCreated(
 tenantId: string,
 party: {
 id: string;
 name: string;
 type: string;
 phone?: string;
 email?: string;
 }
): Promise<void> {
 try {
 await sendEcosystemEvent(tenantId, "party_created", {
 partyId: party.id,
 name: party.name,
 type: party.type,
 phone: party.phone,
 email: party.email,
 });
 } catch (err) {
 console.error("notifyPartyCreated failed:", err);
 }
}
