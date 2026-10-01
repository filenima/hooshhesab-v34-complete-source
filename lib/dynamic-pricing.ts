/**
 * هوش — Dynamic Pricing
 * =============================================================
 * قیمت‌گذاری پویا بر اساس ویژگی‌های کاربر.
 *
 * عوامل:
 * - userSegment: new | trial | paid | loyal | at_risk
 * - referralCount: تعداد دعوت‌های موفق
 * - accountAge: سن حساب به روز
 * - usageLevel: low | medium | high | power
 *
 * خروجی: قیمت نهایی، درصد تخفیف، دلیل تخفیف
 */

// ============ Types ============

export interface PricingContext {
 userSegment: string;
 referralCount: number;
 accountAge: number; // days
 usageLevel: string;
}

export interface DynamicPriceResult {
 price: number;
 discount: number; // percentage (0-100)
 discountAmount: number;
 reason: string;
 originalPrice: number;
}

// ============ Pricing Rules ============

interface DiscountRule {
 condition: (ctx: PricingContext) => boolean;
 discount: number;
 reason: string;
}

const DISCOUNT_RULES: DiscountRule[] = [
 // کاربران جدید — تخفیف welcome
 {
 condition: (ctx) => ctx.userSegment === "new" && ctx.accountAge <= 7,
 discount: 20,
 reason: "تخفیف خوش‌آمدگویی — ۲۰٪ برای هفته‌ی اول",
 },
 // کاربران وفادار — تخفیف وفاداری
 {
 condition: (ctx) => ctx.userSegment === "loyal" && ctx.accountAge > 365,
 discount: 15,
 reason: "تخفیف وفاداری — ۱۵٪ برای مشتریان بیش از یک ساله",
 },
 // کاربران در خطر ریزش — تخفیف retention
 {
 condition: (ctx) => ctx.userSegment === "at_risk",
 discount: 25,
 reason: "تخفیف ویژه بازگرداندن — ۲۵٪ برای کاربران در معرض ریزش",
 },
 // کاربران با referral بالا
 {
 condition: (ctx) => ctx.referralCount >= 10,
 discount: 30,
 reason: "تخفیف سفیر برند — ۳۰٪ برای ۱۰+ دعوت موفق",
 },
 {
 condition: (ctx) => ctx.referralCount >= 5,
 discount: 20,
 reason: "تخفیف دعوت‌کننده — ۲۰٪ برای ۵+ دعوت موفق",
 },
 {
 condition: (ctx) => ctx.referralCount >= 1,
 discount: 10,
 reason: "تخفیف دعوت — ۱۰٪ برای اولین دعوت موفق",
 },
 // کاربران power — قیمت کامل (بدون تخفیف) اما با value-add
 {
 condition: (ctx) => ctx.usageLevel === "power" && ctx.userSegment === "paid",
 discount: 0,
 reason: "کاربر پاور — قیمت استاندارد (توصیه: ارتقا به پلن سازمانی)",
 },
 // کاربران trial که در حال تبدیل شدن هستند
 {
 condition: (ctx) => ctx.userSegment === "trial" && ctx.usageLevel === "high",
 discount: 15,
 reason: "تخفیف تبدیل تریال — ۱۵٪ برای کاربران فعال تریال",
 },
];

// ============ Main Function ============

/**
 * محاسبه‌ی قیمت پویا بر اساس context کاربر.
 *
 * @param basePrice قیمت پایه به ریال
 * @param context اطلاعات کاربر
 * @returns قیمت نهایی + تخفیف + دلیل
 */
export function getDynamicPrice(
 basePrice: number,
 context: PricingContext
): DynamicPriceResult {
 // یافتن اولین rule که condition آن صدق کند
 const matchedRule = DISCOUNT_RULES.find((rule) => rule.condition(context));

 if (!matchedRule) {
 return {
 price: basePrice,
 discount: 0,
 discountAmount: 0,
 reason: "قیمت استاندارد — بدون تخفیف",
 originalPrice: basePrice,
 };
 }

 const discountAmount = Math.round((basePrice * matchedRule.discount) / 100);
 const finalPrice = basePrice - discountAmount;

 return {
 price: finalPrice,
 discount: matchedRule.discount,
 discountAmount,
 reason: matchedRule.reason,
 originalPrice: basePrice,
 };
}

/**
 * دریافت همه‌ی تخفیف‌های قابل اعمال برای کاربر (نه فقط بهترین).
 * برای نمایش در UI: "شما واجد این تخفیف‌ها هستید"
 */
export function getAllEligibleDiscounts(
 basePrice: number,
 context: PricingContext
): DynamicPriceResult[] {
 return DISCOUNT_RULES
.filter((rule) => rule.condition(context))
.map((rule) => {
 const discountAmount = Math.round((basePrice * rule.discount) / 100);
 return {
 price: basePrice - discountAmount,
 discount: rule.discount,
 discountAmount,
 reason: rule.reason,
 originalPrice: basePrice,
 };
 });
}

/**
 * پیشنهاد بهترین پلن برای کاربر بر اساس usage.
 */
export function recommendPlan(
 context: PricingContext
): { plan: string; reason: string; estimatedMonthlyPrice: number } {
 const basePrices: Record<string, number> = {
 starter: 0,
 business: 290000,
 enterprise: 890000,
 };

 if (context.usageLevel === "power" || context.accountAge > 365) {
 const price = getDynamicPrice(basePrices.enterprise, context);
 return {
 plan: "enterprise",
 reason: "با توجه به استفاده‌ی intensiv شما، پلن سازمانی با کاربر نامحدود و API مناسب‌تر است",
 estimatedMonthlyPrice: price.price,
 };
 }

 if (context.usageLevel === "high" || context.usageLevel === "medium") {
 const price = getDynamicPrice(basePrices.business, context);
 return {
 plan: "business",
 reason: "پلن کسب‌وکار با امکانات کامل و هوش مصنوعی برای کاربران فعال توصیه می‌شود",
 estimatedMonthlyPrice: price.price,
 };
 }

 return {
 plan: "starter",
 reason: "پلن استارتر رایگان برای شروع مناسب است — هر زمان نیاز بود ارتقا دهید",
 estimatedMonthlyPrice: 0,
 };
}

/**
 * محاسبه‌ی قیمت با چند پلن (مقایسه‌ای).
 */
export function comparePlans(
 context: PricingContext
): Array<{ plan: string; basePrice: number; finalPrice: number; discount: number; reason: string }> {
 const plans = [
 { name: "starter", basePrice: 0 },
 { name: "business", basePrice: 290000 },
 { name: "enterprise", basePrice: 890000 },
 ];

 return plans.map((plan) => {
 const result = getDynamicPrice(plan.basePrice, context);
 return {
 plan: plan.name,
 basePrice: plan.basePrice,
 finalPrice: result.price,
 discount: result.discount,
 reason: result.reason,
 };
 });
}
