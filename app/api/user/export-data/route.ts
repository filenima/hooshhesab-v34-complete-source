import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { toJalali } from "@/lib/persian";
import { decryptField } from "@/lib/db-encryption";
import { validateExport } from "@/lib/dlp";

export const runtime = "nodejs";

// GET /api/user/export-data — GDPR-like data portability
// تمام داده‌های کاربر به‌صورت JSON قابل دانوند
export async function GET(req: NextRequest) {
 try {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { user: authUser } = auth;

 const user = await db.user.findUnique({
 where: { id: authUser.userId },
 include: {
 tenant: true,
 auditLogs: { orderBy: { createdAt: "desc" }, take: 200 },
 },
 });

 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const tenantId = user.tenantId;

 // بارگذاری موازی تمام داده‌های مربوط به این tenant
 const [
 parties,
 products,
 invoices,
 journalEntries,
 checks,
 bankAccounts,
 employees,
 contacts,
 warehouses,
 stockMovements,
 reminders,
 notifications,
 integrations,
 aiConversations,
 supportTickets,
 ] = await Promise.all([
 db.party.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
 db.product.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
 db.invoice.findMany({
 where: { tenantId },
 orderBy: { date: "desc" },
 take: 500,
 include: { items: true },
 }),
 db.journalEntry.findMany({
 where: { tenantId },
 orderBy: { date: "desc" },
 take: 500,
 include: { lines: true },
 }),
 db.check.findMany({ where: { tenantId }, orderBy: { dueDate: "desc" } }),
 db.bankAccount.findMany({ where: { tenantId } }),
 db.employee.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
 db.contact.findMany({ where: { tenantId } }),
 db.warehouse.findMany({ where: { tenantId } }),
 db.stockMovement.findMany({
 where: { tenantId },
 orderBy: { date: "desc" },
 take: 500,
 }),
 db.reminder.findMany({ where: { tenantId }, orderBy: { dueDate: "desc" } }),
 db.notification.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 200 }),
 db.integration.findMany({ where: { tenantId } }),
 db.aIConversation.findMany({
 where: { tenantId, userId: user.id },
 orderBy: { createdAt: "desc" },
 take: 50,
 include: { messages: { orderBy: { createdAt: "asc" } } },
 }),
 db.supportTicket.findMany({ where: { tenantId } }),
 ]);

 // پروفایل کاربر (بدون رمز و داده‌های حساس)
 const profile = {
 id: user.id,
 name: user.name,
 family: user.family,
 email: user.email,
 username: user.username,
 phone: user.phone,
 role: user.role,
 isActive: user.isActive,
 isTrial: user.isTrial,
 trialEndsAt: user.trialEndsAt,
 twoFactorEnabled: user.twoFactorEnabled,
 company: user.company,
 nationalId: decryptField(user.nationalId),
 address: user.address,
 lastLogin: user.lastLogin,
 createdAt: user.createdAt,
 updatedAt: user.updatedAt,
 };

 const tenant = {
 id: user.tenant.id,
 name: user.tenant.name,
 plan: user.tenant.plan,
 status: user.tenant.status,
 subdomain: user.tenant.subdomain,
 createdAt: user.tenant.createdAt,
 };

 const exportData = {
 meta: {
 exportedAt: new Date().toISOString(),
 exportedAtJalali: toJalali(new Date()),
 format: "Hoosh-GDPR-Export-v1",
 userId: user.id,
 tenantId,
 },
 profile,
 tenant,
 statistics: {
 parties: parties.length,
 products: products.length,
 invoices: invoices.length,
 journalEntries: journalEntries.length,
 checks: checks.length,
 bankAccounts: bankAccounts.length,
 employees: employees.length,
 contacts: contacts.length,
 warehouses: warehouses.length,
 stockMovements: stockMovements.length,
 reminders: reminders.length,
 notifications: notifications.length,
 integrations: integrations.length,
 aiConversations: aiConversations.length,
 supportTickets: supportTickets.length,
 auditLogs: user.auditLogs.length,
 },
 data: {
 parties,
 products,
 invoices,
 journalEntries,
 checks,
 bankAccounts,
 employees,
 contacts,
 warehouses,
 stockMovements,
 reminders,
 notifications,
 integrations,
 aiConversations,
 supportTickets,
 auditLogs: user.auditLogs,
 },
 };

 const filename = `hoshhesab-data-${user.id.slice(-8)}-${new Date()
.toISOString()
.slice(0, 10)}.json`;

 // تبدیل BigInt به string برای JSON serialization
 const jsonReplacer = (_key: string, value: unknown) => {
 if (typeof value === "bigint") return value.toString();
 return value;
 };

 // ============ DLP: اسکن و mask داده‌ی حساس قبل از خروج ============
 const serialized = JSON.parse(JSON.stringify(exportData, jsonReplacer));
 const dlpResult = validateExport(serialized);
 if (!dlpResult.allowed) {
 return NextResponse.json(
 { success: false, error: dlpResult.reason },
 { status: 403 }
 );
 }
 const finalData = dlpResult.maskedData?? exportData;

 return new NextResponse(JSON.stringify(finalData, jsonReplacer, 2), {
 status: 200,
 headers: {
 "Content-Type": "application/json; charset=utf-8",
 "Content-Disposition": `attachment; filename="${filename}"`,
 "Cache-Control": "no-store",
 },
 });
 } catch (error) {
 console.error("Export data error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در استخراج داده‌ها" },
 { status: 500 }
 );
 }
}
