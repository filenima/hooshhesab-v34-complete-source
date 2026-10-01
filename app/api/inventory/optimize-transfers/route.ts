import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getTenant } from "@/lib/auth";
import {
 optimizeTransfers,
 optimizeTransfersFromDb,
 type Demand,
 type Supply,
} from "@/lib/warehouse-optimizer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`opt-transfers:${ip}`, 20, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پر شده است" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { demands, supplies, auto } = body as {
 demands?: Demand[];
 supplies?: Supply[];
 auto?: boolean;
 };

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 401 }
 );
 }

 if (auto === true) {
 const result = await optimizeTransfersFromDb(tenant.id);
 const totalCost = result.transfers.reduce((s, t) => s + t.estimatedCost, 0);
 return NextResponse.json({
 success: true,
...result,
 warehouses: result.warehouses,
 totalTransfers: result.transfers.length,
 totalCost,
 });
 }

 if (!Array.isArray(demands) ||!Array.isArray(supplies)) {
 return NextResponse.json(
 { success: false, error: "demands و supplies آرایه باید ارسال شوند یا auto=true بگذارید" },
 { status: 400 }
 );
 }

 const transfers = await optimizeTransfers(demands, supplies);
 const totalCost = transfers.reduce((s, t) => s + t.estimatedCost, 0);

 return NextResponse.json({
 success: true,
 transfers,
 totalTransfers: transfers.length,
 totalCost,
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Optimize transfers error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در بهینه‌سازی انتقالات" },
 { status: 500 }
 );
 }
}
