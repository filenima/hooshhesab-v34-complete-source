import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getTenant } from "@/lib/auth";
import { predictItemsCached } from "@/lib/item-predictor";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`predict-items:${ip}`, 60, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پر شده است" },
 { status: 429 }
 );
 }

 const url = new URL(req.url);
 const q = url.searchParams.get("q")?? "";
 if (!q.trim()) {
 return NextResponse.json({ success: true, suggestions: [] });
 }

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 401 }
 );
 }

 const suggestions = await predictItemsCached(tenant.id, q);
 return NextResponse.json({ success: true, suggestions });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("predict-items GET error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی آیتم" },
 { status: 500 }
 );
 }
}

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`predict-items:${ip}`, 60, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پر شده است" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { partialDescription } = body as { partialDescription?: string };
 if (!partialDescription || typeof partialDescription!== "string") {
 return NextResponse.json(
 { success: false, error: "partialDescription الزامی است" },
 { status: 400 }
 );
 }

 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "Tenant یافت نشد" },
 { status: 401 }
 );
 }

 const suggestions = await predictItemsCached(tenant.id, partialDescription);
 return NextResponse.json({ success: true, suggestions });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("predict-items POST error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در پیش‌بینی آیتم" },
 { status: 500 }
 );
 }
}
