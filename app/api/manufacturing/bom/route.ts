import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * ماژول تولیدی — BOM (Bill of Materials)
 *
 * GET /api/manufacturing/bom فهرست تمام BOM های tenant فعال
 * POST /api/manufacturing/bom ایجاد BOM جدید به همراه اقلام
 *
 * تمام پاسخ‌ها فارسی است. مبالغ به‌صورت BigInt در DB ذخیره می‌شوند
 * و در پاسخ به Number تبدیل می‌شوند تا قابل سریالایز باشند.
 */

// ============ GET: لیست BOM ها ============
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

 const boms = await db.bOM.findMany({
 where: { tenantId: tenantId, deletedAt: null },
 include: {
 items: {
 include: { product: true },
 },
 },
 orderBy: { createdAt: "desc" },
 });

 const serialized = boms.map((bom) => ({
 id: bom.id,
 tenantId: bom.tenantId,
 name: bom.name,
 productId: bom.productId,
 version: bom.version,
 status: bom.status,
 createdAt: bom.createdAt,
 updatedAt: bom.updatedAt,
 deletedAt: bom.deletedAt,
 items: bom.items.map((item) => ({
 id: item.id,
 bomId: item.bomId,
 productId: item.productId,
 quantity: item.quantity,
 unit: item.unit,
 product: item.product
? {
 id: item.product.id,
 name: item.product.name,
 sku: item.product.sku,
 unit: item.product.unit,
 type: item.product.type,
 purchasePrice: Number(item.product.purchasePrice),
 salePrice: Number(item.product.salePrice),
 }
: null,
 })),
 // محاسبه هزینه برآوردی BOM بر اساس مجموع (quantity * purchasePrice) اقلام
 estimatedCost: bom.items.reduce((sum, item) => {
 const price = item.product? Number(item.product.purchasePrice): 0;
 return sum + item.quantity * price;
 }, 0),
 materialsCount: bom.items.length,
 }));

 return NextResponse.json({ success: true, data: serialized });
 } catch (error) {
 console.error("BOM list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت فهرست BOM ها" },
 { status: 500 }
 );
 }
}

// ============ POST: ایجاد BOM جدید ============
export async function POST(req: NextRequest) {
 try {
 const body = await req.json().catch(() => null);
 if (!body || typeof body!== "object") {
 return NextResponse.json(
 { success: false, error: "بدنه درخواست نامعتبر است" },
 { status: 400 }
 );
 }

 const { name, productId, version, items } = body as {
 name?: unknown;
 productId?: unknown;
 version?: unknown;
 items?: unknown;
 };

 if (typeof name!== "string" ||!name.trim()) {
 return NextResponse.json(
 { success: false, error: "نام BOM الزامی است" },
 { status: 400 }
 );
 }

 if (!Array.isArray(items) || items.length === 0) {
 return NextResponse.json(
 { success: false, error: "حداقل یک قلم مواد اولیه الزامی است" },
 { status: 400 }
 );
 }

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 // اعتبارسنجی و آماده‌سازی اقلام
 const cleanItems: { productId: string; quantity: number; unit: string }[] = [];
 for (const [idx, raw] of items.entries()) {
 if (!raw || typeof raw!== "object") {
 return NextResponse.json(
 {
 success: false,
 error: `قلم شماره ${idx + 1} نامعتبر است`,
 },
 { status: 400 }
 );
 }
 const it = raw as {
 productId?: unknown;
 quantity?: unknown;
 unit?: unknown;
 };
 if (typeof it.productId!== "string" ||!it.productId) {
 return NextResponse.json(
 {
 success: false,
 error: `شناسه محصول قلم شماره ${idx + 1} الزامی است`,
 },
 { status: 400 }
 );
 }
 const quantity = Number(it.quantity);
 if (!Number.isFinite(quantity) || quantity <= 0) {
 return NextResponse.json(
 {
 success: false,
 error: `مقدار قلم شماره ${idx + 1} باید عددی مثبت باشد`,
 },
 { status: 400 }
 );
 }
 const unit = typeof it.unit === "string" && it.unit? it.unit: "عدد";
 cleanItems.push({ productId: it.productId, quantity, unit });
 }

 const versionNumber =
 typeof version === "number" && Number.isFinite(version) && version > 0
? Math.floor(version)
: 1;

 // FIX (LOW): اعتبارسنجی مالکیت اقلام — قبلاً productId های tenant دیگر
 // پذیرفته می‌شد و جمع بهای BOM قیمت‌های tenant دیگر را می‌خواند
 const ownedProducts = await db.product.findMany({
 where: {
 tenantId: tenantId,
 id: { in: cleanItems.map((it) => it.productId) },
 deletedAt: null,
 },
 select: { id: true },
 });
 const ownedSet = new Set(ownedProducts.map((p) => p.id));
 const foreignItem = cleanItems.find((it) =>!ownedSet.has(it.productId));
 if (foreignItem) {
 return NextResponse.json(
 { success: false, error: "کالای انتخاب‌شده یافت نشد یا به این سازمان تعلق ندارد" },
 { status: 400 }
 );
 }

 const created = await db.bOM.create({
 data: {
 tenantId: tenantId,
 name: name.trim(),
 productId: typeof productId === "string" && productId? productId: null,
 version: versionNumber,
 status: "ACTIVE",
 items: {
 create: cleanItems.map((it) => ({
 productId: it.productId,
 quantity: it.quantity,
 unit: it.unit,
 })),
 },
 },
 include: {
 items: { include: { product: true } },
 },
 });

 const serialized = {
 id: created.id,
 tenantId: created.tenantId,
 name: created.name,
 productId: created.productId,
 version: created.version,
 status: created.status,
 createdAt: created.createdAt,
 updatedAt: created.updatedAt,
 deletedAt: created.deletedAt,
 items: created.items.map((item) => ({
 id: item.id,
 bomId: item.bomId,
 productId: item.productId,
 quantity: item.quantity,
 unit: item.unit,
 product: item.product
? {
 id: item.product.id,
 name: item.product.name,
 sku: item.product.sku,
 unit: item.product.unit,
 type: item.product.type,
 purchasePrice: Number(item.product.purchasePrice),
 salePrice: Number(item.product.salePrice),
 }
: null,
 })),
 estimatedCost: created.items.reduce((sum, item) => {
 const price = item.product? Number(item.product.purchasePrice): 0;
 return sum + item.quantity * price;
 }, 0),
 materialsCount: created.items.length,
 };

 return NextResponse.json(
 {
 success: true,
 data: serialized,
 message: "BOM با موفقیت ایجاد شد",
 },
 { status: 201 }
 );
 } catch (error) {
 console.error("BOM create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد BOM جدید" },
 { status: 500 }
 );
 }
}
