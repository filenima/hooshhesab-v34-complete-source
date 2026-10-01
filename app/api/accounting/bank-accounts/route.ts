import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/accounting/bank-accounts — فهرست ساده‌ی حساب‌های بانکی برای ماژول مغایرت‌گیری
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
 const tenantId = ctx.tenantId;
 const accounts = await db.bankAccount.findMany({
 where: { tenantId, deletedAt: null },
 orderBy: { createdAt: "desc" },
 });
 return NextResponse.json({
 success: true,
 data: accounts.map((a) => ({
 id: a.id,
 bankName: a.bankName,
 branch: a.branch,
 accountNumber: a.accountNumber,
 balance: Number(a.balance),
 currency: a.currency,
 type: a.type,
 })),
 });
 } catch (error) {
 console.error("Bank accounts list (accounting) error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت حساب‌های بانکی" },
 { status: 500 }
 );
 }
}
