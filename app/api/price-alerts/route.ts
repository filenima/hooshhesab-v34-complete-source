import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/price-alerts — فهرست هشدارهای قیمتی فعال/غیرفعال
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
 const { searchParams } = new URL(req.url);
 const onlyActive = searchParams.get("active") === "true";
 const alerts = await db.priceAlert.findMany({
 where: {
 tenantId,
...(onlyActive? { isActive: true }: {}),
 },
 orderBy: { createdAt: "desc" },
 });
 return NextResponse.json({
 success: true,
 data: alerts.map((a) => ({
 id: a.id,
 tenantId: a.tenantId,
 item: a.item,
 threshold: a.threshold,
 direction: a.direction,
 isActive: a.isActive,
 lastChecked: a.lastChecked,
 lastPrice: a.lastPrice,
 triggeredAt: a.triggeredAt,
 createdAt: a.createdAt,
 updatedAt: a.updatedAt,
 })),
 });
 } catch (error) {
 console.error("PriceAlert list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت هشدارها" },
 { status: 500 }
 );
 }
}

// POST /api/price-alerts — ایجاد هشدار جدید
// body: { item: string, threshold: number, direction: "up"|"down"|"both" }
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
 const body = await req.json();
 const { item, threshold, direction } = body as {
 item: string;
 threshold: number;
 direction: string;
 };

 if (!item || typeof threshold!== "number" || threshold <= 0) {
 return NextResponse.json(
 { success: false, error: "قلم، آستانه مثبت و جهت الزامی است" },
 { status: 400 }
 );
 }
 const dir = ["up", "down", "both"].includes(direction)? direction: "both";

 const alert = await db.priceAlert.create({
 data: {
 tenantId,
 item: String(item),
 threshold: Number(threshold),
 direction: dir,
 isActive: true,
 },
 });
 return NextResponse.json({ success: true, data: alert });
 } catch (error) {
 console.error("PriceAlert create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد هشدار" },
 { status: 500 }
 );
 }
}

// PATCH /api/price-alerts — به‌روزرسانی وضعیت/پارامترهای هشدار
// body: { id: string, isActive?: boolean, threshold?: number, direction?: string }
export async function PATCH(req: NextRequest) {
 try {
 // SECURITY: احراز هویت اجباری (قبلاً PATCH بدون توکن در دسترس بود)
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const body = await req.json();
 const { id, isActive, threshold, direction } = body as {
 id: string;
 isActive?: boolean;
 threshold?: number;
 direction?: string;
 };
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه هشدار الزامی است" },
 { status: 400 }
 );
 }
 // SECURITY: هشدار باید متعلق به tenant کاربر باشد (IDOR)
 const owned = await db.priceAlert.findFirst({
 where: { id, tenantId: ctx.tenantId },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "هشدار یافت نشد" },
 { status: 404 }
 );
 }
 const data: Record<string, unknown> = {};
 if (typeof isActive === "boolean") data.isActive = isActive;
 if (typeof threshold === "number" && threshold > 0) data.threshold = threshold;
 if (direction && ["up", "down", "both"].includes(direction)) data.direction = direction;

 const updated = await db.priceAlert.update({
 where: { id: owned.id },
 data,
 });
 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("PriceAlert update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی هشدار" },
 { status: 500 }
 );
 }
}

// DELETE /api/price-alerts — حذف هشدار
// query:?id=xxx یا body { id: string }
export async function DELETE(req: NextRequest) {
 try {
 // SECURITY: احراز هویت اجباری (قبلاً DELETE بدون توکن در دسترس بود)
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const url = new URL(req.url);
 const idParam = url.searchParams.get("id");
 let id = idParam;
 if (!id) {
 try {
 const body = await req.json();
 id = (body as { id?: string }).id?? null;
 } catch {
 id = null;
 }
 }
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه هشدار الزامی است" },
 { status: 400 }
 );
 }
 // SECURITY: هشدار باید متعلق به tenant کاربر باشد (IDOR)
 const owned = await db.priceAlert.findFirst({
 where: { id, tenantId: ctx.tenantId },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "هشدار یافت نشد" },
 { status: 404 }
 );
 }
 await db.priceAlert.delete({ where: { id: owned.id } });
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("PriceAlert delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف هشدار" },
 { status: 500 }
 );
 }
}
