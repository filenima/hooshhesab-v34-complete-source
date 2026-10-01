import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";
import { applyStockChange, resolveDefaultWarehouse } from "@/lib/stock-movements";
import { parseAmount } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * PUT /api/products/[id] — ویرایش کامل تک‌کالا (همهٔ فیلدها)
 * ============================================================================
 * FIX(edit-all): قبلاً ویرایش فقط از طریق PATCH گروهی با وایت‌لیست محدود
 * انجام می‌شد و SKU، بارکد، دسته‌بندی و نوع کالا اصلاً قابل ویرایش نبودند
 * (به‌ویژه برای کالاهای ایمپورت‌شده با SKU خودکار IMP-…).
 * این اندپوینت ویرایش همهٔ فیلدها را با اعتبارسنجی یگانگی SKU/بارکد پشتیبانی می‌کند.
 */

function toBigInt(value: number | string | undefined | null | { toString(): string }): bigint {
  const ZERO = BigInt(0);
  if (value === undefined || value === null || value === "") return ZERO;
  try {
    const n = typeof value === "number" ? value : parseAmount(String(value));
    if (n === null || !Number.isFinite(n)) return ZERO;
    return BigInt(Math.trunc(n));
  } catch {
    return ZERO;
  }
}

// نرخ محدود درون‌حافظه: ۶۰ ویرایش در دقیقه برای هر IP
const rlMap = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rlMap.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= 60) return true;
    entry.count++;
    return false;
  }
  rlMap.set(ip, { count: 1, resetAt: now + 60_000 });
  // پاکسازی دوره‌ای از نشت حافظه
  if (rlMap.size > 10_000) {
    for (const [k, v] of rlMap) if (v.resetAt < now) rlMap.delete(k);
  }
  return false;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "شناسه کالا نامعتبر است" }, { status: 400 });
    }

    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: "درخواست‌های ویرایش بیش از حد مجاز است. کمی بعد تلاش کنید." },
        { status: 429 }
      );
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "احراز هویت الزامی است" }, { status: 401 });
    }
    const tenantId = ctx.tenantId;

    // کالا باید متعلق به همین tenant باشد
    const existing = await db.product.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "کالا یافت نشد" }, { status: 404 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};

    // ── نام و واحد و توضیحات ──
    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim().slice(0, 120);
    }
    if (typeof body.unit === "string" && body.unit.trim()) {
      updateData.unit = body.unit.trim().slice(0, 20);
    }
    if (typeof body.description === "string") {
      updateData.description = body.description.trim().slice(0, 500) || null;
    }

    // ── SKU (با بررسی یگانگی در سطح tenant) ──
    if (typeof body.sku === "string" && body.sku.trim()) {
      const sku = body.sku.trim().slice(0, 60);
      if (sku !== existing.sku) {
        const dup = await db.product.findFirst({
          where: { tenantId, sku, deletedAt: null, NOT: { id } },
          select: { id: true },
        });
        if (dup) {
          return NextResponse.json(
            { success: false, error: `کد کالا (SKU) «${sku}» قبلاً استفاده شده است` },
            { status: 409 }
          );
        }
      }
      updateData.sku = sku;
    }

    // ── بارکد (اختیاری — خالی یعنی حذف) ──
    if (body.barcode !== undefined) {
      const barcode = typeof body.barcode === "string" ? body.barcode.trim().slice(0, 60) : "";
      if (barcode && barcode !== (existing.barcode ?? "")) {
        const dup = await db.product.findFirst({
          where: { tenantId, barcode, deletedAt: null, NOT: { id } },
          select: { id: true },
        });
        if (dup) {
          return NextResponse.json(
            { success: false, error: `بارکد «${barcode}» قبلاً برای کالای دیگری ثبت شده است` },
            { status: 409 }
          );
        }
      }
      updateData.barcode = barcode || null;
    }

    // ── دسته‌بندی (اعتبارسنجی مالکیت) ──
    if (body.categoryId !== undefined) {
      const catId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
      if (catId) {
        const cat = await db.productCategory.findFirst({
          where: { id: catId, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!cat) {
          return NextResponse.json(
            { success: false, error: "دسته‌بندی یافت نشد" },
            { status: 400 }
          );
        }
        updateData.categoryId = cat.id;
      } else {
        updateData.categoryId = null;
      }
    }

    // ── نوع کالا ──
    if (
      typeof body.type === "string" &&
      ["GOODS", "SERVICE", "ASSEMBLY"].includes(body.type)
    ) {
      updateData.type = body.type;
    }

    // ── شناسه کالای مودیان (sstid) ──
    if (body.goodsCode !== undefined) {
      updateData.goodsCode =
        typeof body.goodsCode === "string" && body.goodsCode.trim()
          ? body.goodsCode.trim().slice(0, 30)
          : null;
    }

    // ── قیمت‌ها (ریال) ──
    if (body.salePrice !== undefined) updateData.salePrice = toBigInt(body.salePrice);
    if (body.purchasePrice !== undefined) updateData.purchasePrice = toBigInt(body.purchasePrice);
    if (body.wholesalePrice !== undefined) updateData.wholesalePrice = toBigInt(body.wholesalePrice);

    // ── مالیات، حداقل/حداکثر موجودی ──
    if (body.taxRate !== undefined) {
      const t = Number(body.taxRate);
      updateData.taxRate = Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : 0;
    }
    if (body.minStock !== undefined) {
      const m = Number(body.minStock);
      updateData.minStock = Number.isFinite(m) ? Math.max(m, 0) : 0;
    }
    if (body.maxStock !== undefined) {
      const m = Number(body.maxStock);
      updateData.maxStock = Number.isFinite(m) ? Math.max(m, 0) : 0;
    }

    // ── قیمت دلاری ──
    if (body.usdPrice !== undefined) {
      updateData.usdPrice =
        typeof body.usdPrice === "number" && body.usdPrice > 0 ? body.usdPrice : null;
    }
    if (body.usdSynced !== undefined) updateData.usdSynced = body.usdSynced === true;

    // ── موجودی (در انبار پیش‌فرض) ──
    const wantsStock = body.stock !== undefined;
    let stockUpdated = false;
    const stockUnitCost =
      body.stockUnitCost !== undefined ? toBigInt(body.stockUnitCost) : null;

    if (Object.keys(updateData).length === 0 && !wantsStock) {
      return NextResponse.json(
        { success: false, error: "هیچ فیلدی برای به‌روزرسانی ارائه نشده" },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length > 0) {
      await db.product.update({ where: { id }, data: updateData });
    }

    if (wantsStock) {
      const stockValue = Number(body.stock);
      if (!Number.isFinite(stockValue) || stockValue < 0 || stockValue > 100_000_000) {
        return NextResponse.json(
          { success: false, error: "مقدار موجودی نامعتبر است" },
          { status: 400 }
        );
      }
      const warehouseId = await resolveDefaultWarehouse(tenantId);
      await applyStockChange({
        tenantId,
        productId: id,
        warehouseId,
        newQuantity: stockValue,
        unitCost: stockUnitCost,
        referenceType: "ADJUSTMENT",
        referenceId: null,
      });
      stockUpdated = true;
    }

    await auditLog({
      tenantId,
      action: "PRODUCT_UPDATE",
      entity: "Product",
      entityId: id,
      changes: { fields: Object.keys(updateData), stockUpdated },
      req,
    });

    // پاسخ: کالای به‌روز شده + موجودی
    const updated = await db.product.findFirst({ where: { id, tenantId } });
    const stockAgg = await db.stockItem.aggregate({
      where: { tenantId, productId: id },
      _sum: { quantity: true },
    });
    const p = updated!;
    const salePrice = Number(p.salePrice);
    const purchasePrice = Number(p.purchasePrice);
    const wholesalePrice = Number(p.wholesalePrice);

    return NextResponse.json({
      success: true,
      data: {
        ...p,
        salePrice,
        purchasePrice,
        wholesalePrice,
        salePriceToman: Math.trunc(salePrice / 10),
        purchasePriceToman: Math.trunc(purchasePrice / 10),
        wholesalePriceToman: Math.trunc(wholesalePrice / 10),
        stock: stockAgg._sum.quantity ?? 0,
      },
      message: "کالا با موفقیت به‌روزرسانی شد",
    });
  } catch (error) {
    console.error("Product update error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در به‌روزرسانی کالا" },
      { status: 500 }
    );
  }
}

// PATCH = همان PUT (سازگاری با کلاینت‌هایی که PATCH می‌فرستند)
export const PATCH = PUT;
