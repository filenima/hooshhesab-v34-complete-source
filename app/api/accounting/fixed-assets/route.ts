import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/accounting/fixed-assets — فهرست دارایی‌های ثابت
// SECURITY (C2): احراز هویت اجباری + فیلتر tenant — قبلاً getTenantId() بدون req
// صدا زده می‌شد که در production همیشه null برمی‌گرداند.
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
 const assets = await db.fixedAsset.findMany({
 where: { tenantId, deletedAt: null },
 orderBy: { code: "asc" },
 include: { _count: { select: { depreciationEntries: true } } },
 });
 return NextResponse.json({
 success: true,
 data: assets.map((a) => ({
...a,
 purchaseCost: Number(a.purchaseCost),
 salvageValue: Number(a.salvageValue),
 accumulatedDepreciation: Number(a.accumulatedDepreciation),
 currentValue: Number(a.currentValue),
 depreciationCount: a._count.depreciationEntries,
 })),
 });
 } catch (error) {
 console.error("Fixed assets list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت دارایی‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/accounting/fixed-assets — ایجاد دارایی ثابت جدید
// SECURITY (C2): احراز هویت اجباری + tenant از auth context
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
 const {
 code,
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
 } = body as {
 code?: string;
 name?: string;
 category?: string;
 purchaseDate?: string;
 purchaseCost?: number;
 salvageValue?: number;
 usefulLifeYears?: number;
 depreciationMethod?: string;
 location?: string;
 custodian?: string;
 description?: string;
 };
 if (!code ||!name ||!category ||!purchaseDate) {
 return NextResponse.json(
 { success: false, error: "کد، نام، دسته و تاریخ خرید الزامی است" },
 { status: 400 }
 );
 }
 const cost = BigInt(purchaseCost?? 0);
 const salvage = BigInt(salvageValue?? 0);
 const lifeYears = Number(usefulLifeYears?? 5) > 0? Number(usefulLifeYears): 5;
 const asset = await db.fixedAsset.create({
 data: {
 tenantId,
 code,
 name,
 category,
 purchaseDate: new Date(purchaseDate),
 purchaseCost: cost,
 salvageValue: salvage,
 usefulLifeYears: lifeYears,
 depreciationMethod: depreciationMethod?? "STRAIGHT_LINE",
 accumulatedDepreciation: 0n,
 currentValue: cost,
 location: location?? null,
 custodian: custodian?? null,
 description: description?? null,
 status: "ACTIVE",
 },
 });
 return NextResponse.json({
 success: true,
 data: {
...asset,
 purchaseCost: Number(asset.purchaseCost),
 salvageValue: Number(asset.salvageValue),
 accumulatedDepreciation: Number(asset.accumulatedDepreciation),
 currentValue: Number(asset.currentValue),
 },
 });
 } catch (error) {
 console.error("Fixed asset create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد دارایی" },
 { status: 500 }
 );
 }
}
