import { db } from "@/lib/db";

/**
 * WH-1: تولید SKU ترتیبی برای tenant
 *
 * الگو: SKUهایی مثل «SKU-1001» یا «1001» را اسکن می‌کند (regex
 * /^(?:SKU-)?(\d+)$/)، بزرگ‌ترین بخش عددی را برمی‌دارد و +۱ می‌کند.
 * اگر هیچ کالایی با این الگو نبود، از ۱۰۰۱ شروع می‌شود.
 *
 * نکته: عمداً بدون فیلتر deletedAt اسکن می‌شود — چون unique constraint
 * روی (tenantId, sku) شامل کالاهای حذف‌شدهٔ نرم هم می‌شود، باید از
 * تصادم با SKU کالای حذف‌شده هم جلوگیری کرد.
 */
const SKU_SEQ_PATTERN = /^(?:SKU-)?(\d+)$/;

const SKU_START = 1000;

export async function generateNextSku(tenantId: string): Promise<string> {
  const products = await db.product.findMany({
    where: { tenantId },
    select: { sku: true },
  });

  let max = SKU_START;
  for (const p of products) {
    const match = SKU_SEQ_PATTERN.exec(p.sku.trim());
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > max) {
        max = n;
      }
    }
  }

  return `SKU-${max + 1}`;
}
