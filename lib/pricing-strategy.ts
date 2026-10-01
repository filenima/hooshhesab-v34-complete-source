// استراتژیست هوشمند قیمت‌گذاری — هوش
// تحلیل هزینه، موقعیت بازار، کشش تقاضا و قیمت رقبا
// خروجی: قیمت پیشنهادی، استدلال، تحلیل رقبا، حاشیه سود

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export interface PricingStrategy {
 productId: string;
 productName: string;
 sku: string;
 currentPrice: number;
 cost: number;
 recommendedPrice: number;
 currentMargin: number;
 recommendedMargin: number;
 reasoning: string;
 competitors: { name: string; price: number; difference: number }[];
 demandElasticity: "high" | "medium" | "low";
 marketPosition: "budget" | "mid" | "premium";
 generatedAt: string;
}

const rialsToToman = (rials: bigint | number): number => Number(rials) / 10;

/** محاسبه‌ی کشش تقاضا از داده‌ی فروش تاریخی */
function computeDemandElasticity(
 priceChanges: { price: number; volume: number }[]
): "high" | "medium" | "low" {
 if (priceChanges.length < 2) return "medium";
 // محاسبه‌ی تغییرات درصدی قیمت و حجم
 const elasticities: number[] = [];
 for (let i = 1; i < priceChanges.length; i++) {
 const pPrev = priceChanges[i - 1].price;
 const pCur = priceChanges[i].price;
 const qPrev = priceChanges[i - 1].volume;
 const qCur = priceChanges[i].volume;
 if (pPrev === 0 || qPrev === 0) continue;
 const dPrice = (pCur - pPrev) / pPrev;
 const dVolume = (qCur - qPrev) / qPrev;
 if (Math.abs(dPrice) < 0.01) continue;
 elasticities.push(Math.abs(dVolume / dPrice));
 }
 if (elasticities.length === 0) return "medium";
 const avg = elasticities.reduce((a, b) => a + b, 0) / elasticities.length;
 if (avg > 1.5) return "high";
 if (avg < 0.5) return "low";
 return "medium";
}

/** توصیه‌ی قیمت استراتژیک با LLM */
export async function recommendPricing(
 tenantId: string,
 productId: string
): Promise<PricingStrategy | null> {
 const product = await db.product.findFirst({
 where: { id: productId, tenantId, deletedAt: null },
 select: {
 id: true,
 name: true,
 sku: true,
 purchasePrice: true,
 salePrice: true,
 minStock: true,
 maxStock: true,
 },
 });
 if (!product) return null;

 const cost = Number(product.purchasePrice);
 const currentPrice = Number(product.salePrice);
 const currentMargin = currentPrice > 0? (currentPrice - cost) / currentPrice: 0;

 // گردآوری داده‌ی فروش این محصول در ۹۰ روز اخیر برای محاسبه‌ی کشش تقاضا
 const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
 const items = await db.invoiceItem.findMany({
 where: {
 productId: product.id,
 invoice: { date: { gte: ninetyDaysAgo }, type: "SALE", deletedAt: null },
 },
 select: { unitPrice: true, quantity: true, invoice: { select: { date: true } } },
 orderBy: { invoice: { date: "asc" } },
 take: 200,
 });

 // گروه‌بندی بر اساس قیمت برای محاسبه‌ی کشش
 const priceVolumeMap = new Map<number, number>();
 for (const it of items) {
 const p = Number(it.unitPrice);
 priceVolumeMap.set(p, (priceVolumeMap.get(p) || 0) + it.quantity);
 }
 const priceChanges = Array.from(priceVolumeMap.entries())
.sort((a, b) => a[0] - b[0])
.map(([price, volume]) => ({ price, volume }));

 const elasticity = computeDemandElasticity(priceChanges);
 const totalVolume = priceChanges.reduce((s, p) => s + p.volume, 0);

 // رقبای فرضی — در حالت واقعی از بازار جمع‌آوری می‌شود؛ اینجا شبیه‌سازی می‌کنیم
 // برای دمو: قیمت‌های رقبا بر اساس حاشیه‌ی سود معمول بازار (۲۰٪ تا ۴۰٪) ساخته می‌شوند
 const competitorMargins = [0.18, 0.28, 0.38];
 const competitors = competitorMargins.map((m, i) => {
 const compPrice = Math.round(cost / (1 - m));
 return {
 name: `رقب ${i + 1}`,
 price: compPrice,
 difference: Math.round(((currentPrice - compPrice) / Math.max(compPrice, 1)) * 100),
 };
 });

 // موقعیت بازار فعلی
 const avgCompetitorPrice =
 competitors.reduce((s, c) => s + c.price, 0) / competitors.length;
 let marketPosition: PricingStrategy["marketPosition"] = "mid";
 if (currentPrice < avgCompetitorPrice * 0.9) marketPosition = "budget";
 else if (currentPrice > avgCompetitorPrice * 1.1) marketPosition = "premium";

 // توصیه‌ی پایه بر اساس داده‌ی آماری
 let baseRecommended = currentPrice;
 if (marketPosition === "budget" && elasticity!== "high") {
 baseRecommended = Math.round(avgCompetitorPrice * 0.95); // افزایش جزئی
 } else if (marketPosition === "premium" && elasticity === "high") {
 baseRecommended = Math.round(avgCompetitorPrice * 1.05); // کاهش جزئی
 } else if (currentMargin < 0.15) {
 baseRecommended = Math.round(cost / (1 - 0.2)); // حداقل حاشیه ۲۰٪
 }

 // لایه‌ی LLM برای استدلال راهبردی
 let reasoning = `قیمت فعلی ${Math.round(rialsToToman(currentPrice) / 1000)} هزار تومان با حاشیه‌ی ${(currentMargin * 100).toFixed(0)}٪. `;
 try {
 const zai = await ZAI.create();
 const prompt = `تو استراتژیست قیمت‌گذاری نرم‌افزار «هوش» هستی.
محصول: ${product.name} (SKU: ${product.sku})
- بهای تمام‌شده: ${Math.round(rialsToToman(cost) / 1000)} هزار تومان
- قیمت فعلی: ${Math.round(rialsToToman(currentPrice) / 1000)} هزار تومان
- حاشیه‌ی فعلی: ${(currentMargin * 100).toFixed(0)}٪
- قیمت رقبا: ${competitors.map((c) => Math.round(rialsToToman(c.price) / 1000) + "هزار").join("، ")}
- میانگین قیمت رقبا: ${Math.round(rialsToToman(avgCompetitorPrice) / 1000)} هزار تومان
- کشش تقاضا: ${elasticity}
- موقعیت فعلی در بازار: ${marketPosition}
- حجم فروش ۹۰ روز: ${totalVolume} واحد

یک توصیه‌ی قیمت استراتژیک و استدلال کوتاه فارسی (حداکثر ۳ جمله) بده.
خروجی فقط JSON خالص:
{"recommendedPrice": <ریال>, "reasoning": "..."}

بدون emoji، اعداد فارسی در متن، قیمت به ریال (عدد انگلیسی).`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو استراتژیست قیمت‌گذاری هستی. فقط JSON خروجی بده." },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });
 const raw = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
 const s = cleaned.indexOf("{");
 const e = cleaned.lastIndexOf("}");
 if (s!== -1 && e!== -1) {
 const parsed = JSON.parse(cleaned.slice(s, e + 1));
 if (typeof parsed?.recommendedPrice === "number" && parsed.recommendedPrice > 0) {
 baseRecommended = Math.round(parsed.recommendedPrice);
 }
 if (typeof parsed?.reasoning === "string") {
 reasoning = parsed.reasoning;
 }
 }
 } catch (err) {
 console.error("LLM pricing error:", err);
 }

 const recommendedMargin =
 baseRecommended > 0? (baseRecommended - cost) / baseRecommended: 0;

 return {
 productId: product.id,
 productName: product.name,
 sku: product.sku,
 currentPrice,
 cost,
 recommendedPrice: baseRecommended,
 currentMargin: Math.round(currentMargin * 100) / 100,
 recommendedMargin: Math.round(recommendedMargin * 100) / 100,
 reasoning,
 competitors,
 demandElasticity: elasticity,
 marketPosition,
 generatedAt: new Date().toISOString(),
 };
}
