import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ id: string }>;
}

// GET /api/accounting/fixed-assets/[id] — جزئیات یک دارایی + تاریخچه استهلاک
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
export async function GET(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const asset = await db.fixedAsset.findFirst({
 where: { id, tenantId: auth.tenantId, deletedAt: null },
 include: { depreciationEntries: { orderBy: { period: "desc" } } },
 });
 if (!asset) {
 return NextResponse.json(
 { success: false, error: "دارایی یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({
 success: true,
 data: {
...asset,
 purchaseCost: Number(asset.purchaseCost),
 salvageValue: Number(asset.salvageValue),
 accumulatedDepreciation: Number(asset.accumulatedDepreciation),
 currentValue: Number(asset.currentValue),
 depreciationEntries: asset.depreciationEntries.map((e) => ({
...e,
 amount: Number(e.amount),
 accumulatedAfter: Number(e.accumulatedAfter),
 })),
 },
 });
 } catch (error) {
 console.error("Fixed asset detail error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت دارایی" },
 { status: 500 }
 );
 }
}

// PUT /api/accounting/fixed-assets/[id] — ویرایش دارایی
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
export async function PUT(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const existing = await db.fixedAsset.findFirst({
 where: { id, tenantId: auth.tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "دارایی یافت نشد" },
 { status: 404 }
 );
 }
 const body = await req.json();
 const {
 name,
 category,
 purchaseDate,
 purchaseCost,
 salvageValue,
 usefulLifeYears,
 depreciationMethod,
 location,
 custodian,
 description,
 status,
 } = body as Record<string, unknown>;
 const updated = await db.fixedAsset.update({
 where: { id },
 data: {
...(name? { name: String(name) }: {}),
...(category? { category: String(category) }: {}),
...(purchaseDate? { purchaseDate: new Date(String(purchaseDate)) }: {}),
...(purchaseCost!== undefined? { purchaseCost: BigInt(Number(purchaseCost)) }: {}),
...(salvageValue!== undefined? { salvageValue: BigInt(Number(salvageValue)) }: {}),
...(usefulLifeYears!== undefined? { usefulLifeYears: Number(usefulLifeYears) }: {}),
...(depreciationMethod? { depreciationMethod: String(depreciationMethod) }: {}),
...(location!== undefined? { location: location? String(location): null }: {}),
...(custodian!== undefined? { custodian: custodian? String(custodian): null }: {}),
...(description!== undefined? { description: description? String(description): null }: {}),
...(status? { status: String(status) }: {}),
 },
 });
 return NextResponse.json({
 success: true,
 data: {
...updated,
 purchaseCost: Number(updated.purchaseCost),
 salvageValue: Number(updated.salvageValue),
 accumulatedDepreciation: Number(updated.accumulatedDepreciation),
 currentValue: Number(updated.currentValue),
 },
 });
 } catch (error) {
 console.error("Fixed asset update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ویرایش دارایی" },
 { status: 500 }
 );
 }
}

// DELETE /api/accounting/fixed-assets/[id] — حذف نرم دارایی
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
export async function DELETE(req: NextRequest, ctx: RouteContext) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { id } = await ctx.params;
 const existing = await db.fixedAsset.findFirst({
 where: { id, tenantId: auth.tenantId, deletedAt: null },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "دارایی یافت نشد" },
 { status: 404 }
 );
 }
 await db.fixedAsset.update({
 where: { id },
 data: { deletedAt: new Date(), status: "DISPOSED" },
 });
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Fixed asset delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف دارایی" },
 { status: 500 }
 );
 }
}
