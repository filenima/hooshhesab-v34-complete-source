import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/accounting/document-sequences
 * فهرست همه‌ی شمارنده‌های اتمیک اسناد برای tenant احراز هویت‌شده.
 * شامل: entityType, fiscalYear, prefix, lastNumber, updatedAt.
 * ترجمه‌ی entityType به فارسی در فرانت‌اند انجام می‌شود.
 */
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
 const sequences = await db.documentSequence.findMany({
 where: { tenantId },
 orderBy: [{ fiscalYear: "desc" }, { entityType: "asc" }],
 });
 return NextResponse.json({
 success: true,
 data: sequences.map((s) => ({
 id: s.id,
 entityType: s.entityType,
 fiscalYear: s.fiscalYear,
 prefix: s.prefix,
 lastNumber: s.lastNumber,
 createdAt: s.createdAt.toISOString(),
 updatedAt: s.updatedAt.toISOString(),
 })),
 });
 } catch (error) {
 console.error("Document sequences list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت شمارنده‌های اسناد" },
 { status: 500 }
 );
 }
}
