import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { generateNextSku } from "@/lib/product-sku";

export const runtime = "nodejs";

/**
 * GET /api/products/next-sku — WH-1
 *
 * کد کالای (SKU) ترتیبی بعدی tenant را برمی‌گرداند (مثل «SKU-1001»).
 * برای پیش‌پر کردن فرم کالای جدید استفاده می‌شود؛ کاربر می‌تواند آن را
 * ویرایش کند. منطق تولید مشترک با POST /api/products است
 * (lib/product-sku.ts) تا کلاینت و سرور همیشه یک توالی را ببینند.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const sku = await generateNextSku(ctx.tenantId);

    return NextResponse.json({
      success: true,
      data: { sku },
    });
  } catch (error) {
    console.error("Next SKU error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت کد کالا" },
      { status: 500 }
    );
  }
}
