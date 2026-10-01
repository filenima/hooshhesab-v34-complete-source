import { NextRequest, NextResponse } from "next/server";
import type { Product } from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { createProductSchema } from "@/lib/schemas";
import { rateLimit, auditLog } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { applyStockChange, resolveDefaultWarehouse } from "@/lib/stock-movements";
// WH-1: تولید SKU ترتیبی سمت سرور وقتی کلاینت کد خالی/نبود بفرستد
import { generateNextSku } from "@/lib/product-sku";
// FIX(3b-بیگ۱۰): اتصال lib/validators (قبلاً dead code) — نرمال‌سازی ارقام فارسی
import { parseAmount, normalizeNationalIdDigits } from "@/lib/validators";
import { persianSearchVariants } from "@/lib/persian";

export const runtime = "nodejs";

/**
 * به‌روزرسانی موجودی یک کالا در انبار پیش‌فرض (اگر انباری نبود، «انبار اصلی» ساخته می‌شود)
 * FIX(C2/C3): قبلاً UI موجودی را با PATCH {stock} می‌فرستاد ولی API آن را نمی‌شناخت.
 * ⑩ FIX(stock-movement): حالا هر تغییر موجودی یک ردیف StockMovement هم ثبت می‌کند و
 * در ورودها با بهای مشخص (unitCost) «بهای تمام‌شده میانگین متحرک» بازمحاسبه می‌شود.
 */
async function setProductStock(
 tenantId: string,
 productId: string,
 stock: number,
 opts?: { unitCost?: bigint | null; referenceType?: string; referenceId?: string | null }
): Promise<void> {
 const warehouseId = await resolveDefaultWarehouse(tenantId);
 await applyStockChange({
 tenantId,
 productId,
 warehouseId,
 newQuantity: stock,
 unitCost: opts?.unitCost ?? null,
 referenceType: opts?.referenceType ?? "ADJUSTMENT",
 referenceId: opts?.referenceId ?? null,
 });
}

const isDev = process.env.NODE_ENV!== "production";

/** عدد به رشته فارسی برای پیام‌ها */
function toPersianCount(n: number): string {
 return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** تبدیل ایمن مقدار به BigInt (پذیرفته number|string و در نبود آن ۰ برمی‌گرداند). */
function toBigInt(value: number | string | undefined | null): bigint {
 const ZERO = BigInt(0);
 if (value === undefined || value === null || value === "") return ZERO;
 try {
 // نکته: BigInt اعداد اعشاری را نمی‌پذیرد، بنابراین صحیح‌سازی می‌کنیم.
 // FIX(3b-بیگ‌۱۰): رشتهٔ با ارقام فارسی/جداکننده («۱٬۲۰۰۰۰۰») قبلاً NaN→۰
 // می‌شد؛ حالا با parseAmount (lib/validators) نرمال می‌شود.
 const n = typeof value === "number"? value: parseAmount(value);
 if (n === null || !Number.isFinite(n)) return ZERO;
 return BigInt(Math.trunc(n));
 } catch {
 return ZERO;
 }
}

/** تبدیل یک محصول Prisma به شکل قابل JSON با فیلدهای تومانی. */
function serializeProduct(p: {
 id: string;
 sku: string;
 barcode: string | null;
 name: string;
 unit: string;
 type: string;
 purchasePrice: bigint;
 salePrice: bigint;
 wholesalePrice: bigint;
 minStock: number;
 maxStock: number;
 taxRate: number;
 description: string | null;
 [key: string]: unknown;
}) {
 const purchasePrice = Number(p.purchasePrice);
 const salePrice = Number(p.salePrice);
 const wholesalePrice = Number(p.wholesalePrice);
 return {
...p,
 purchasePrice,
 salePrice,
 wholesalePrice,
 // مبالغ در دیتابیس به‌صورت ریال ذخیره می‌شوند؛ تومان = ریال / ۱۰
 purchasePriceToman: Math.trunc(purchasePrice / 10),
 salePriceToman: Math.trunc(salePrice / 10),
 wholesalePriceToman: Math.trunc(wholesalePrice / 10),
 };
}

// GET /api/products — لیست کالاها با فیلتر، مرتب‌سازی و صفحه‌بندی
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const search = searchParams.get("search");
 const barcode = searchParams.get("barcode");
 const category = searchParams.get("category");
 const type = searchParams.get("type");
 const minPrice = searchParams.get("minPrice");
 const maxPrice = searchParams.get("maxPrice");
 const sortBy = searchParams.get("sortBy") || "createdAt";
 const sortOrder = searchParams.get("sortOrder") === "asc"? "asc": "desc";
 // FIX(perf-1200): سقف قبلی ۵۰۰ بود و با ۱۲۰۰+ کالا، ۷۰۰+ کالا هیچ‌جا دیده نمی‌شد.
 // سقف به ۵۰۰۰ افزایش یافت؛ مصرف‌کننده‌ها با صفحه‌بندی خودکار همهٔ کالاها را می‌گیرند.
 const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 50), 5000);
 const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const where: Record<string, unknown> = {
 tenantId: tenantId,
 deletedAt: null,
 };

 // فیلتر دسته‌بندی
 if (category) where.category = category;
 // فیلتر نوع
 if (type) where.type = type;

 // فیلتر بازه قیمت
 if (minPrice || maxPrice) {
 const salePrice: Record<string, number> = {};
 if (minPrice) salePrice.gte = Number(minPrice);
 if (maxPrice) salePrice.lte = Number(maxPrice);
 where.salePrice = salePrice;
 }

 // H9: فیلتر دقیق بارکد — اگر barcode ارسال شده باشد، فقط محصولات مطابق را برمی‌گرداند.
 if (barcode) {
 where.barcode = barcode.trim();
 }

 // جستجو در نام، SKU و بارکد
 if (search) {
 // FIX(search): SQLite حساس به نویسه است — داده‌های CSV با «ي/ك» عربی
 // ذخیره شده‌اند. واریانت‌های عربی/فارسی هر عبارت جستجو ساخته می‌شود تا
 // «کیف» کاربر با «كیف» دیتابیس مچ شود (و برعکس).
 const variants = persianSearchVariants(search);
 if (variants.length > 0) {
 where.OR = variants.flatMap((v) => [
 { name: { contains: v } },
 { sku: { contains: v } },
 { barcode: { contains: v } },
 ]);
 }
 }

 // مرتب‌سازی — فقط فیلدهای مجاز (FIX: «stock» فیلد دیتابیس نیست — از Prisma خطا می‌گرفت)
 // FIX(sort-price): «price» ستون دیتابیس نیست — به salePrice نگاشت می‌شود (قبلاً بی‌صدا به createdAt برمی‌گشت)
 const sortAlias: Record<string, string> = { price: "salePrice" };
 const validSortFields = ["name", "price", "createdAt", "updatedAt", "salePrice"];
 const rawSort = validSortFields.includes(sortBy)? sortBy: "createdAt";
 const sortField = sortAlias[rawSort] || rawSort;
 const orderBy = { [sortField]: sortOrder };

 const [products, total] = await Promise.all([
 db.product.findMany({
 where,
 orderBy,
 take: limit,
 skip: offset,
 // FIX(category-col): نام دسته‌بندی هم ارسال می‌شود — قبلاً ستون «دسته» در انبار
 // همیشه «—» بود چون رابطهٔ category هیچ‌وقت include نمی‌شد
 include: { category: { select: { id: true, name: true } } },
 }),
 db.product.count({ where }),
 ]);

 // FIX: موجودی واقعی هر کالا (جمع StockItem ها در همه انبارها) — قبلاً stock هرگز
 // برگردانده نمی‌شد و ستون موجودی همیشه صفر بود
 const productIds = products.map((p) => p.id);
 const stockAgg = productIds.length
 ? await db.stockItem.groupBy({
 by: ["productId"],
 where: { tenantId, productId: { in: productIds } },
 _sum: { quantity: true },
 })
 : [];
 const stockMap = new Map(stockAgg.map((s) => [s.productId, s._sum.quantity ?? 0]));

 const serialized = products.map((p) => ({
 ...serializeProduct(p),
 // FIX(category-col): نام + شناسهٔ دسته به‌صورت فیلد تخت (نه آبجکت Prisma)
 category: p.category?.name ?? null,
 categoryId: p.category?.id ?? null,
 stock: stockMap.get(p.id) ?? 0,
 }));

 return NextResponse.json({ success: true, data: serialized, total, limit, offset });
 } catch (error) {
 console.error("Products error:", error);
 return NextResponse.json(
 {
 success: false,
 error: "خطا در دریافت کالاها",
...(isDev && {
 devMessage: error instanceof Error? error.message: String(error),
 }),
 },
 { status: 500 }
 );
 }
}

// POST /api/products — ایجاد کالای جدید
export async function POST(req: NextRequest) {
 try {
 // Rate limiting — هر دو سیستم
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`product-create:${ip}`, 20, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 if (!rateLimit(`product-create:${ip}`, 20, 60000)) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 // FIX(3b-بیگ‌۱۰): نرمال‌سازی ارقام فارسی/جداکننده در فیلدهای عددی و بارکد
 // (قیمت‌های خروجی هلو/سپیدار «۱٬۲۰۰۰۰۰» هستند) قبل از اعتبارسنجی zod.
 if (body && typeof body === "object" && !Array.isArray(body)) {
 const b = body as Record<string, unknown>;
 for (const key of ["purchasePrice", "salePrice", "wholesalePrice", "minStock", "maxStock", "taxRate"]) {
 if (typeof b[key] === "string") {
 const parsedNum = parseAmount(b[key] as string);
 if (parsedNum !== null) b[key] = parsedNum;
 }
 }
 if (typeof b.barcode === "string") {
 b.barcode = normalizeNationalIdDigits(b.barcode) ?? b.barcode;
 }
 }
 const parsed = createProductSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json(
 {
 success: false,
 error: "داده نامعتبر",
 details: parsed.error.flatten(),
 },
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
 // FIX(category-col): categoryId اختیاری — با اعتبارسنجی مالکیت tenant
 // (قبلاً کلاینت دسته را داخل description می‌چپاند!)
 let categoryId: string | null = null;
 const rawCatId = (body as { categoryId?: unknown }).categoryId;
 if (typeof rawCatId === "string" && rawCatId.trim()) {
  const cat = await db.productCategory.findFirst({
   where: { id: rawCatId.trim(), tenantId, deletedAt: null },
   select: { id: true },
  });
  categoryId = cat?.id ?? null;
 }
 // WH-1: اگر SKU خالی/حذف بود، به‌صورت ترتیبی (SKU-1001…) تولید می‌شود.
 // نکته: داده‌ها به‌صورت صریح ساخته می‌شوند (نه spread) تا از پاس‌کردن
 // فیلدهای `undefined` به Prisma جلوگیری شود. این خطای رایج ایجاد کالا بود.
 const providedSku = (parsed.data.sku?? "").trim();
 // اگر کلاینت خودش SKU نفرستاد، در صورت تصادم (P2002) دوباره تلاش می‌کنیم
 const isAutoSku = !providedSku;
 let sku = providedSku || (await generateNextSku(tenantId));
 let product: Product | undefined;
 for (let attempt = 0; attempt < 3 &&!product; attempt++) {
 try {
 product = await db.product.create({
 data: {
 tenantId: tenantId,
 sku,
 barcode: parsed.data.barcode || null,
 name: parsed.data.name,
 categoryId,
 unit: parsed.data.unit,
 type: parsed.data.type,
 purchasePrice: toBigInt(parsed.data.purchasePrice),
 salePrice: toBigInt(parsed.data.salePrice),
 wholesalePrice: toBigInt(parsed.data.wholesalePrice),
 minStock: Number(parsed.data.minStock) || 0,
    // USD-PRICE: قیمت دلاری + پرچم همگام‌سازی (درخواست مالک)
    usdPrice: typeof parsed.data.usdPrice === "number" && parsed.data.usdPrice > 0 ? parsed.data.usdPrice : null,
    usdSynced: parsed.data.usdSynced === true,
 maxStock: Number(parsed.data.maxStock) || 0,
 taxRate: Number(parsed.data.taxRate) || 0,
 description: parsed.data.description || null,
 },
 });
 } catch (error) {
 // تصادم SKU خودکار (دو ایجاد هم‌زمان) → تولید مجدد و تلاش دوباره
 const code =
 error && typeof error === "object" && "code" in error
? String((error as { code: unknown }).code)
 : undefined;
 if (code === "P2002" && isAutoSku) {
 sku = await generateNextSku(tenantId);
 continue;
 }
 throw error;
 }
 }
 if (!product) {
 throw new Error("خطا در ایجاد کالا");
 }

 await auditLog({
 tenantId: tenantId,
 action: "CREATE",
 entity: "Product",
 entityId: product.id,
 changes: parsed.data,
 req,
 });

 // FIX: موجودی اولیه کالا (اختیاری) — در انبار پیش‌فرض ثبت می‌شود
 // ⑩ موجودی اولیه هم یک حرکت ورود (ADJUSTMENT) در گردش انبار ثبت می‌کند
 const initialStock = Number((body as { stock?: unknown }).stock ?? 0);
 if (Number.isFinite(initialStock) && initialStock > 0) {
 await setProductStock(tenantId, product.id, initialStock, {
 referenceType: "ADJUSTMENT",
 }).catch(() => null);
 }

 return NextResponse.json({
 success: true,
 data: serializeProduct(product),
 message: "کالا با موفقیت ایجاد شد",
 });
 } catch (error) {
 // لاگ دقیق برای دیباگ
 console.error("Create product error:", error);
 if (error instanceof Error && error.stack) {
 console.error("Stack:", error.stack);
 }
 // استخراج کد خطای Prisma (مثل P2002 برای unique constraint)
 let prismaCode: string | undefined;
 let prismaMessage: string | undefined;
 if (error && typeof error === "object" && "code" in error) {
 prismaCode = String((error as { code: unknown }).code);
 }
 if (error && typeof error === "object" && "message" in error) {
 prismaMessage = String((error as { message: unknown }).message);
 }

 // پیام فارسی‌سازی برای خطاهای رایج Prisma
 let userMessage = "خطا در ایجاد کالا";
 // FIX: خطای ورودی کاربر (کلید تکراری) باید 409 برگرداند نه 500
 let statusCode = 500;
 if (prismaCode === "P2002") {
 userMessage = "کد کالا (SKU) تکراری است. لطفاً کد دیگری وارد کنید.";
 statusCode = 409;
 } else if (prismaCode === "P2003") {
 userMessage = "رابطه داده‌ها نامعتبر است (کلید خارجی یافت نشد).";
 statusCode = 400;
 }

 return NextResponse.json(
 {
 success: false,
 error: userMessage,
...(isDev && {
 devMessage: prismaMessage || (error instanceof Error? error.message: String(error)),
 prismaCode,
 }),
 },
 { status: statusCode }
 );
 }
}

// PATCH /api/products — به‌روزرسانی دسته‌ای (bulk update)
// Body: { ids: string[], data: { salePrice?: number, taxRate?: number,... } }
// Task 24 — یا: { updates: [{ id: string, stock?: number, salePrice?: number, ... }] }
// (به‌روزرسانی «موجودی گروهی با مقادیر متفاوت» — مثل +۵ به موجودی هر کالا)
export async function PATCH(req: NextRequest) {
 try {
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`product-bulk:${ip}`, 30, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 { success: false, error: "درخواست بیش از حد" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { ids, data, updates } = body as {
 ids?: string[];
 data?: Record<string, unknown>;
 updates?: Array<{ id: string; stock?: number; stockUnitCost?: number }>;
 };

 // Task 24 — مسیر updates[]: موجودی گروهی با مقادیر متفاوت
 if (Array.isArray(updates) && updates.length > 0) {
 if (updates.length > 500) {
 return NextResponse.json(
 { success: false, error: "حداکثر ۵۰۰ کالا در هر درخواست موجودی گروهی" },
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

 // اعتبارسنجی + پاک‌سازی ردیف‌ها
 const clean = updates
 .filter((u) => u && typeof u.id === "string" && u.id.trim() !== "")
 .map((u) => ({
 id: String(u.id),
 stock: Number(u.stock),
 stockUnitCost: u.stockUnitCost !== undefined ? toBigInt(u.stockUnitCost as number) : null,
 }))
 .filter((u) => Number.isFinite(u.stock) && u.stock >= 0 && u.stock <= 100_000_000);
 if (clean.length === 0) {
 return NextResponse.json(
 { success: false, error: "هیچ مقدار موجودی معتبری ارائه نشد" },
 { status: 400 }
 );
 }

 // مالکیت: فقط کالاهای همین tenant (یک کوئری)
 const ownedIds = new Set(
 (
 await db.product.findMany({
 where: { id: { in: clean.map((u) => u.id) }, tenantId, deletedAt: null },
 select: { id: true },
 })
 ).map((p) => p.id)
 );

 let stockUpdated = 0;
 for (const u of clean) {
 if (!ownedIds.has(u.id)) continue; // متعلق به tenant دیگر — رد
 try {
 await setProductStock(tenantId, u.id, u.stock, {
 unitCost: u.stockUnitCost,
 referenceType: "ADJUSTMENT",
 });
 stockUpdated++;
 } catch (err) {
 console.warn("[products] bulk stock item failed:", u.id, err instanceof Error ? err.message : err);
 }
 }

 await auditLog({
 tenantId,
 action: "BULK_STOCK_UPDATE",
 entity: "Product",
 entityId: "bulk-stock",
 changes: { count: clean.length, stockUpdated },
 req,
 });

 return NextResponse.json({
 success: true,
 updated: stockUpdated,
 message: `موجودی ${toPersianCount(stockUpdated)} کالا به‌روزرسانی شد`,
 });
 }

 if (!Array.isArray(ids) || ids.length === 0) {
 return NextResponse.json(
 { success: false, error: "لیست شناسه‌ها الزامی است" },
 { status: 400 }
 );
 }
 if (!data || Object.keys(data).length === 0) {
 return NextResponse.json(
 { success: false, error: "داده‌ای برای به‌روزرسانی ارائه نشده" },
 { status: 400 }
 );
 }
 if (ids.length > 500) {
 return NextResponse.json(
 { success: false, error: "حداکثر ۵۰۰ کالا در هر درخواست" },
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
 // ساخت شیء به‌روزرسانی ایمن — فقط فیلدهای مجاز
 // FIX(C1): name/unit/description برای «ویرایش کالا» — قبلاً فقط قیمت‌ها مجاز بودند
 const updateData: Record<string, unknown> = {};
 if (typeof data.name === "string" && data.name.trim()) updateData.name = data.name.trim().slice(0, 120);
 if (typeof data.unit === "string" && data.unit.trim()) updateData.unit = data.unit.trim().slice(0, 20);
 if (typeof data.description === "string") updateData.description = data.description.trim().slice(0, 500) || null;
 if (data.salePrice!== undefined) updateData.salePrice = toBigInt(data.salePrice as string | number | undefined | null);
 if (data.purchasePrice!== undefined) updateData.purchasePrice = toBigInt(data.purchasePrice as string | number | undefined | null);
 if (data.wholesalePrice!== undefined) updateData.wholesalePrice = toBigInt(data.wholesalePrice as string | number | undefined | null);
 if (data.taxRate!== undefined) updateData.taxRate = Number(data.taxRate) || 0;
 if (data.minStock!== undefined) updateData.minStock = Number(data.minStock) || 0;
    // USD-PRICE: قیمت دلاری + پرچم همگام‌سازی (درخواست مالک)
    if (data.usdPrice !== undefined) {
      updateData.usdPrice = typeof data.usdPrice === "number" && data.usdPrice > 0 ? data.usdPrice : null;
    }
    if (data.usdSynced !== undefined) updateData.usdSynced = data.usdSynced === true;
 if (data.maxStock!== undefined) updateData.maxStock = Number(data.maxStock) || 0;
 // FIX(edit-all): دسته‌بندی و نوع کالا هم در ویرایش گروهی مجاز شدند
 // (SKU و بارکد عمداً اینجا نیستند — ویرایش گروهی آن‌ها یگانگی را می‌شکند؛
 //  ویرایش تک‌کالا از PUT /api/products/[id] پشتیبانی می‌شود)
 if (typeof data.categoryId === "string" && data.categoryId.trim()) {
  // اعتبارسنجی مالکیت دسته — دستهٔ tenant دیگر پذیرفته نمی‌شود
  const cat = await db.productCategory.findFirst({
   where: { id: data.categoryId.trim(), tenantId, deletedAt: null },
   select: { id: true },
  });
  if (cat) updateData.categoryId = cat.id;
 } else if (data.categoryId === null || data.categoryId === "") {
  updateData.categoryId = null;
 }
 if (typeof data.type === "string" && ["GOODS", "SERVICE", "ASSEMBLY"].includes(data.type)) {
  updateData.type = data.type;
 }
 // FIX(C2/C3): موجودی از طریق StockItem در انبار پیش‌فرض (فیلد stock روی Product وجود ندارد)
 const wantsStock = data.stock !== undefined;
 // ⑩ بهای تمام‌شده ورود (ریال) — اختیاری؛ در ورودها میانگین متحرک را بازمحاسبه می‌کند
 const stockUnitCost =
 data.stockUnitCost !== undefined
 ? toBigInt(data.stockUnitCost as string | number | undefined | null)
 : null;

 if (Object.keys(updateData).length === 0 &&!wantsStock) {
 return NextResponse.json(
 { success: false, error: "هیچ فیلد مجازی برای به‌روزرسانی ارائه نشده" },
 { status: 400 }
 );
 }

 let result = { count: 0 };
 if (Object.keys(updateData).length > 0) {
 // به‌روزرسانی دسته‌ای — فقط کالاهای tenant فعلی
 result = await db.product.updateMany({
 where: {
 id: { in: ids },
 tenantId: tenantId,
 deletedAt: null,
 },
 data: updateData,
 });
 }

 // به‌روزرسانی موجودی (تنها کالاهای متعلق به tenant)
 let stockUpdated = 0;
 if (wantsStock) {
 const stockValue = Number(data.stock);
 if (!Number.isFinite(stockValue) || stockValue < 0) {
 return NextResponse.json(
 { success: false, error: "مقدار موجودی نامعتبر است" },
 { status: 400 }
 );
 }
 const owned = await db.product.findMany({
 where: { id: { in: ids }, tenantId, deletedAt: null },
 select: { id: true },
 });
 for (const p of owned) {
 await setProductStock(tenantId, p.id, stockValue, {
 unitCost: stockUnitCost,
 referenceType: "ADJUSTMENT",
 });
 stockUpdated++;
 }
 }

 await auditLog({
 tenantId: tenantId,
 action: "BULK_UPDATE",
 entity: "Product",
 entityId: "bulk",
 changes: { ids: ids.length, data: updateData, updated: result.count, stockUpdated },
 req,
 });

 const totalUpdated = Math.max(result.count, stockUpdated);
 return NextResponse.json({
 success: true,
 updated: totalUpdated,
 message:
 stockUpdated > 0
 ? `موجودی ${toPersianCount(stockUpdated)} کالا به‌روزرسانی شد`
 : `${toPersianCount(totalUpdated)} کالا به‌روزرسانی شد`,
 });
 } catch (error) {
 console.error("Bulk update products error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی دسته‌ای کالاها" },
 { status: 500 }
 );
 }
}

// DELETE /api/products?id=xxx — حذف نرم (soft delete) یک کالا
// فیلد deletedAt ست می‌شود تا در کوئری‌های بعدی فیلتر شود.
export async function DELETE(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");

 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه کالا الزامی است" },
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
 // مطمئن می‌شویم کالا متعلق به tenant فعلی است
 const product = await db.product.findFirst({
 where: { id, tenantId: tenantId },
 select: { id: true, name: true },
 });

 if (!product) {
 return NextResponse.json(
 { success: false, error: "کالا یافت نشد" },
 { status: 404 }
 );
 }

 // حذف نرم
 await db.product.update({
 where: { id: product.id },
 data: { deletedAt: new Date() },
 });

 await auditLog({
 tenantId: tenantId,
 action: "DELETE",
 entity: "Product",
 entityId: product.id,
 changes: { name: product.name },
 req,
 });

 return NextResponse.json({
 success: true,
 message: "کالا با موفقیت حذف شد",
 });
 } catch (error) {
 console.error("Delete product error:", error);
 return NextResponse.json(
 {
 success: false,
 error: "خطا در حذف کالا",
...(isDev && {
 devMessage: error instanceof Error? error.message: String(error),
 }),
 },
 { status: 500 }
 );
 }
}
