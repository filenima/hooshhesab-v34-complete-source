import { NextRequest, NextResponse } from "next/server";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";
import {
 reconcileTransactions,
 type BankTransaction,
 type InvoiceRef,
} from "@/lib/reconciliation-engine";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`reconcile:${ip}`, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست تطبیق پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { bankTransactions, invoices } = body as {
 bankTransactions?: BankTransaction[];
 invoices?: InvoiceRef[];
 };

 if (!Array.isArray(bankTransactions) ||!Array.isArray(invoices)) {
 return NextResponse.json(
 {
 success: false,
 error: "bankTransactions و invoices آرایه باید ارسال شوند",
 },
 { status: 400 }
 );
 }

 const tenant = await getTenant(req);

 const matches = await reconcileTransactions(bankTransactions, invoices);

 const stats = {
 total: matches.length,
 exact: matches.filter((m) => m.method === "exact").length,
 fuzzy: matches.filter((m) => m.method === "fuzzy").length,
 llm: matches.filter((m) => m.method === "llm" && m.invoiceId).length,
 unmatched: matches.filter((m) =>!m.invoiceId).length,
 };

 await auditLog({
 tenantId: tenant?.id?? "anonymous",
 action: "AI_RECONCILE",
 entity: "ai.reconcile",
 changes: stats,
 req,
 });

 return NextResponse.json({ success: true, matches, stats });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Reconcile error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در تطبیق هوشمند" },
 { status: 500 }
 );
 }
}
