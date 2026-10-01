import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/accounting/summary — خلاصه آماری برای داشبورد
// SECURITY (C1/H2): احراز هویت اجباری + فیلتر tenant — قبلاً کل دیتابیس را می‌شمرد.
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const [
 invoicesCount,
 partiesCount,
 productsCount,
 checksCount,
 employeesCount,
 journalCount,
 ] = await Promise.all([
 db.invoice.count({ where: { tenantId, deletedAt: null } }),
 db.party.count({ where: { tenantId, deletedAt: null } }),
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.check.count({ where: { tenantId, deletedAt: null } }),
 db.employee.count({ where: { tenantId, deletedAt: null } }),
 db.journalEntry.count({ where: { tenantId, deletedAt: null } }),
 ]);

 return NextResponse.json({
 success: true,
 data: {
 invoices: invoicesCount,
 parties: partiesCount,
 products: productsCount,
 checks: checksCount,
 employees: employeesCount,
 journalEntries: journalCount,
 },
 });
 } catch (error) {
 console.error("Accounting summary error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت آمار" },
 { status: 500 }
 );
 }
}
