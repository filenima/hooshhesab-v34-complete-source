import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { toEnglishDigits } from "@/lib/persian";

export const runtime = "nodejs";

/**
 * GET /api/products/lookup?code=XXX (v32-C)
 * ------------------------------------------------
 * جستجوی «فوری» کالا با بارکد یا SKU برای بارکدخوان سخت‌افزاری.
 * اولویت: بارکد دقیق → SKU دقیق (با واریانت بزرگی/کوچکی) → پیشوند بارکد.
 * سبک و سریع است چون در چرخهٔ اسکنِ سریع (هر اسکن < ۱ ثانیه) صدا زده می‌شود.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`lookup:${ip}`, 60, 60_000); // ۶۰ درخواست در دقیقه
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست‌های زیاد — کمی صبر کنید" },
        { status: 429 }
      );
    }

    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const raw = req.nextUrl.searchParams.get("code") ?? "";
    // نرمال‌سازی: ارقام فارسی/عربی → انگلیسی + حذف فاصله
    const code = toEnglishDigits(raw).trim();
    if (!code || code.length < 2) {
      return NextResponse.json(
        { success: false, error: "کد نامعتبر است" },
        { status: 400 }
      );
    }

    const tenantId = ctx.tenantId;
    const select = {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      unit: true,
      salePrice: true,
      purchasePrice: true,
      taxRate: true,
      categoryId: true,
    };

    // ۱) بارکد دقیق
    let product = await db.product.findFirst({
      where: { tenantId, deletedAt: null, barcode: code },
      select,
    });
    let matchType: "barcode" | "sku" | "prefix" = "barcode";

    // ۲) SKU دقیق — SQLite حساس به بزرگی است؛ واریانت‌ها امتحان می‌شوند
    if (!product) {
      const variants = Array.from(new Set([code, code.toLowerCase(), code.toUpperCase()]));
      product = await db.product.findFirst({
        where: { tenantId, deletedAt: null, sku: { in: variants } },
        select,
      });
      matchType = "sku";
    }

    // ۳) پیشوند بارکد (اسکنرهایی که صفر ابتدایی را می‌خورند)
    if (!product) {
      product = await db.product.findFirst({
        where: { tenantId, deletedAt: null, barcode: { startsWith: code } },
        select,
      });
      matchType = "prefix";
    }
    if (!product && code.length >= 8) {
      // برعکس: بارکد صفردار در DB، کد اسکن‌شده بدون صفر
      const stripped = code.replace(/^0+/, "");
      if (stripped.length >= 4) {
        product = await db.product.findFirst({
          where: { tenantId, deletedAt: null, barcode: { startsWith: stripped } },
          select,
        });
        matchType = "prefix";
      }
    }

    if (!product) {
      return NextResponse.json({ success: true, data: null });
    }

    // موجودی + نام دسته
    const [stockAgg, category] = await Promise.all([
      db.stockItem.aggregate({
        where: { tenantId, productId: product.id },
        _sum: { quantity: true },
      }),
      product.categoryId
        ? db.productCategory
            .findUnique({
              where: { id: product.categoryId },
              select: { name: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        unit: product.unit,
        salePrice: Number(product.salePrice),
        purchasePrice: Number(product.purchasePrice),
        taxRate: product.taxRate,
        categoryId: product.categoryId,
        categoryName: category?.name ?? null,
        stock: stockAgg._sum.quantity ?? 0,
        matchType,
      },
    });
  } catch (error) {
    console.error("products/lookup error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در جستجوی کالا" },
      { status: 500 }
    );
  }
}
