import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface MergeBody {
 entityIds: string[];
 entityType: string; // "invoice" | "journal" |...
 mergeType: string; // "summary" | "batch" |...
}

/**
 * POST /api/documents/merge
 * ادغام چند سند در یک خروجی خلاصه:
 * - entityType=invoice + mergeType=summary خلاصه‌ی فاکتورها (جمع مبالغ، طرف‌حساب‌ها، اقلام)
 * - entityType=journal + mergeType=batch دسته‌ی اسناد حسابداری
 */
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const body = (await req.json()) as MergeBody;
 if (!Array.isArray(body.entityIds) || body.entityIds.length < 2) {
 return NextResponse.json(
 {
 success: false,
 error: "حداقل دو شناسه‌ی سند برای ادغام ارسال کنید",
 },
 { status: 400 }
 );
 }
 if (!body.entityType) {
 return NextResponse.json(
 { success: false, error: "نوع موجودیت الزامی است" },
 { status: 400 }
 );
 }

 if (body.entityType === "invoice") {
 // واکشی فاکتورها با اقلام و طرف‌حساب
 const invoices = await db.invoice.findMany({
 where: { id: { in: body.entityIds }, tenantId },
 include: { items: true, party: true },
 orderBy: { date: "asc" },
 });

 if (invoices.length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ فاکتوری یافت نشد" },
 { status: 404 }
 );
 }

 const mergedItems: Array<{
 description: string;
 quantity: number;
 unitPrice: number;
 total: number;
 }> = [];
 let totalSubtotal = 0;
 let totalTax = 0;
 let totalDiscount = 0;
 let grandTotal = 0;
 const partySet = new Map<string, { name: string; total: number }>();

 for (const inv of invoices) {
 const invSubtotal = Number(inv.subtotal);
 const invTax = Number(inv.tax);
 const invDiscount = Number(inv.discount);
 const invTotal = Number(inv.total);
 totalSubtotal += invSubtotal;
 totalTax += invTax;
 totalDiscount += invDiscount;
 grandTotal += invTotal;

 const partyName = inv.party?.name?? "—";
 const existing = partySet.get(partyName);
 if (existing) {
 existing.total += invTotal;
 } else {
 partySet.set(partyName, { name: partyName, total: invTotal });
 }

 for (const it of inv.items) {
 mergedItems.push({
 description: it.description || "—",
 quantity: Number(it.quantity),
 unitPrice: Number(it.unitPrice),
 total: Number(it.total),
 });
 }
 }

 // گروه‌بندی اقلام مشابه (با شرح)
 const groupedItems = new Map<string, { description: string; quantity: number; total: number }>();
 for (const it of mergedItems) {
 const key = it.description;
 const existing = groupedItems.get(key);
 if (existing) {
 existing.quantity += it.quantity;
 existing.total += it.total;
 } else {
 groupedItems.set(key, {
 description: it.description,
 quantity: it.quantity,
 total: it.total,
 });
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 entityType: "invoice",
 mergeType: body.mergeType?? "summary",
 count: invoices.length,
 invoiceNumbers: invoices.map((i) => i.number),
 dateRange: {
 from: invoices[0].date,
 to: invoices[invoices.length - 1].date,
 },
 summary: {
 totalSubtotal,
 totalTax,
 totalDiscount,
 grandTotal,
 invoiceCount: invoices.length,
 itemCount: mergedItems.length,
 },
 parties: Array.from(partySet.values()).map((p) => ({
 name: p.name,
 total: p.total,
 })),
 groupedItems: Array.from(groupedItems.values()),
 generatedAt: new Date().toISOString(),
 },
 });
 }

 if (body.entityType === "journal") {
 const entries = await db.journalEntry.findMany({
 where: { id: { in: body.entityIds }, tenantId },
 include: { lines: { include: { account: true } } },
 orderBy: { date: "asc" },
 });

 if (entries.length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ سند حسابداری یافت نشد" },
 { status: 404 }
 );
 }

 let totalDebit = 0;
 let totalCredit = 0;
 const lineCount = entries.reduce((s, e) => s + e.lines.length, 0);

 for (const entry of entries) {
 for (const line of entry.lines) {
 totalDebit += Number(line.debit?? 0);
 totalCredit += Number(line.credit?? 0);
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 entityType: "journal",
 mergeType: body.mergeType?? "batch",
 count: entries.length,
 entryNumbers: entries.map((e) => String(e.number)),
 dateRange: {
 from: entries[0].date,
 to: entries[entries.length - 1].date,
 },
 summary: {
 entryCount: entries.length,
 lineCount,
 totalDebit,
 totalCredit,
 isBalanced: totalDebit === totalCredit,
 },
 entries: entries.map((e) => ({
 id: e.id,
 number: e.number,
 date: e.date,
 description: e.description,
 lineCount: e.lines.length,
 totalDebit: e.lines.reduce((s, l) => s + Number(l.debit?? 0), 0),
 totalCredit: e.lines.reduce((s, l) => s + Number(l.credit?? 0), 0),
 })),
 generatedAt: new Date().toISOString(),
 },
 });
 }

 return NextResponse.json(
 {
 success: false,
 error: `نوع موجودیت «${body.entityType}» پشتیبانی نمی‌شود. انواع مجاز: invoice, journal`,
 },
 { status: 400 }
 );
 } catch (error) {
 console.error("Document merge error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ادغام اسناد" },
 { status: 500 }
 );
 }
}
