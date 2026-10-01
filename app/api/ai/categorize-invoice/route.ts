import { NextRequest, NextResponse } from "next/server";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { categorizeInvoice } from "@/lib/invoice-categorizer";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CategorizeItem {
 description: string;
 amount: number;
}

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`cat-inv:${ip}`, 15, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف مجاز درخواست پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { invoiceId, items, partyName, description } = body as {
 invoiceId?: string;
 items?: CategorizeItem[];
 partyName?: string;
 description?: string;
 };

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 401 }
 );
 }

 // مسیر ۱: invoiceId موجود است — از دیتابیس آیتم‌ها را بارگذاری کن
 let targetItems: CategorizeItem[] = [];
 let targetInvoiceId: string | undefined = invoiceId;
 let resolvedPartyName = partyName;

 if (invoiceId) {
 const inv = await db.invoice.findFirst({
 where: { id: invoiceId, tenantId: tenant.id },
 include: { items: true, party: true },
 });
 if (!inv) {
 return NextResponse.json(
 { success: false, error: "فاکتور یافت نشد" },
 { status: 404 }
 );
 }
 targetItems = inv.items.map((it) => ({
 description: it.description,
 amount: Number(it.total),
 }));
 if (inv.party?.name) resolvedPartyName = resolvedPartyName?? inv.party.name;
 } else if (Array.isArray(items) && items.length > 0) {
 targetItems = items.map((it) => ({
 description: String(it.description?? ""),
 amount: Number(it.amount?? 0),
 }));
 } else {
 return NextResponse.json(
 { success: false, error: "یا invoiceId ارسال کنید یا آرایه‌ی items" },
 { status: 400 }
 );
 }

 const results = await categorizeInvoice(targetItems);

 // ذخیره در description فاکتور (به‌عنوان metadata ساده) اگر invoiceId داشت
 if (targetInvoiceId && description) {
 try {
 await db.invoice.update({
 where: { id: targetInvoiceId },
 data: { description: `${description} [AI categorization applied]` },
 });
 } catch {
 // بی‌خطر است
 }
 }

 await auditLog({
 tenantId: tenant.id,
 action: "AI_CATEGORIZE_INVOICE",
 entity: "ai.categorize",
 entityId: targetInvoiceId,
 changes: {
 itemCount: targetItems.length,
 partyName: resolvedPartyName,
 sample: results.slice(0, 3),
 },
 req,
 });

 return NextResponse.json({
 success: true,
 items: targetItems.map((it, i) => ({
 description: it.description,
 suggestedAccount: results[i]?.accountCode?? "403",
 suggestedCategory: results[i]?.category?? "متفرقه",
 confidence: results[i]?.confidence?? 0,
 rationale: results[i]?.rationale?? "",
 })),
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Categorize invoice error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در دسته‌بندی هوشمند فاکتور" },
 { status: 500 }
 );
 }
}
