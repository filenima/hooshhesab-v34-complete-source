import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getTenant } from "@/lib/auth";
import { analyzeSupplier } from "@/lib/supplier-analytics";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
 req: NextRequest,
 context: { params: Promise<{ id: string }> }
) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`supplier-report:${ip}`, 20, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پر شده است" },
 { status: 429 }
 );
 }

 const { id } = await context.params;
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 401 }
 );
 }

 const report = await analyzeSupplier(tenant.id, id);
 return NextResponse.json({ success: true, report });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Supplier report error:", msg);
 if (msg.includes("یافت نشد")) {
 return NextResponse.json(
 { success: false, error: msg },
 { status: 404 }
 );
 }
 return NextResponse.json(
 { success: false, error: "خطا در تولید گزارش تأمین‌کننده" },
 { status: 500 }
 );
 }
}
