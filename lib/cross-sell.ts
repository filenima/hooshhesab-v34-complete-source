/**
 * هوش — Cross-Sell Recommendations
 * =============================================================
 * پیشنهاد ماژول‌های مکمل بر اساس وضعیت tenant.
 *
 * ماژول‌ها:
 * - inventory: انبارداری پیشرفته
 * - crm: مدیریت مشتریان
 * - payroll: حقوق و دستمزد
 * - manufacturing: تولید و BOM
 * - treasury: خزانه‌داری و چک
 * - multi_currency: چند ارزی
 * - api_access: دسترسی API
 * - mobile_app: اپلیکیشن موبایل
 */

// ============ Types ============

export interface CrossSellRecommendation {
 module: string;
 title: string;
 description: string;
 reason: string;
 expectedBenefit: string;
 priority: "high" | "medium" | "low";
 estimatedPrice: number; // ریال ماهانه
 icon: string;
}

interface ModuleRule {
 module: string;
 title: string;
 description: string;
 icon: string;
 estimatedPrice: number;
 // شرط پیشنهاد — بر اساس داده‌های tenant
 condition: (ctx: TenantContext) => boolean;
 reason: (ctx: TenantContext) => string;
 expectedBenefit: string;
 priority: (ctx: TenantContext) => "high" | "medium" | "low";
}

interface TenantContext {
 hasInvoices: boolean;
 invoiceCount: number;
 hasProducts: boolean;
 productCount: number;
 hasParties: boolean;
 partyCount: number;
 hasBankAccounts: boolean;
 hasEmployees: boolean;
 tenantAge: number;
 plan: string;
 hasMultiCurrency: boolean;
 hasApiAccess: boolean;
 //...
}

// ============ Module Rules ============

const MODULE_RULES: ModuleRule[] = [
 // ============ انبارداری ============
 {
 module: "inventory",
 title: "انبارداری پیشرفته",
 description: "مدیریت چند انبار، کاردکس لحظه‌ای، انبارگردانی، حداقل/حداکثر موجودی",
 icon: "Package",
 estimatedPrice: 49000,
 condition: (ctx) => ctx.hasProducts && ctx.productCount > 20 &&!ctx.hasBankAccounts,
 reason: (ctx) => `با ${ctx.productCount} محصول، مدیریت موجودی به انبارداری پیشرفته نیاز دارد`,
 expectedBenefit: "کاهش ۵۰٪ خطاهای انبارداری، هشدار خودکار کمبود موجودی",
 priority: (ctx) => ctx.productCount > 100? "high": "medium",
 },
 // ============ CRM ============
 {
 module: "crm",
 title: "مدیریت مشتریان (CRM)",
 description: "Pipeline فروش، پیگیری‌ها، باشگاه مشتریان، تحلیل رفتار مشتری",
 icon: "Users",
 estimatedPrice: 69000,
 condition: (ctx) => ctx.hasParties && ctx.partyCount > 50,
 reason: (ctx) => `با ${ctx.partyCount} طرف حساب، CRM برای مدیریت ارتباطات ضروری است`,
 expectedBenefit: "افزایش ۳۰٪ نرخ تبدیل، بهبود رضایت مشتری",
 priority: (ctx) => ctx.partyCount > 200? "high": "medium",
 },
 // ============ حقوق و دستمزد ============
 {
 module: "payroll",
 title: "حقوق و دستمزد",
 description: "محاسبه حقوق، بیمه، مالیات، فیش حقوقی، گزارش‌های پرسنلی",
 icon: "Wallet",
 estimatedPrice: 89000,
 condition: (ctx) => ctx.hasEmployees === true,
 reason: () => `با داشتن کارمند، مدیریت حقوق و دستمزد نیاز تخصصی دارد`,
 expectedBenefit: "محاسبه خودکار بیمه و مالیات، صدور فیش حقوقی",
 priority: () => "high",
 },
 // ============ تولید و BOM ============
 {
 module: "manufacturing",
 title: "تولید و BOM",
 description: "فرمول محصول، دستور کار، هزینه‌یابی، مدیریت خط تولید",
 icon: "Factory",
 estimatedPrice: 99000,
 condition: (ctx) => ctx.hasProducts && ctx.productCount > 10 && ctx.tenantAge > 90,
 reason: () => `اگر تولیدکننده هستید، BOM برای محاسبه‌ی بهای تمام‌شده ضروری است`,
 expectedBenefit: "محاسبه دقیق بهای تمام‌شده، کاهش ۲۰٪ هدررفت مواد",
 priority: () => "medium",
 },
 // ============ خزانه‌داری ============
 {
 module: "treasury",
 title: "خزانه‌داری و چک",
 description: "مدیریت چک‌های دریافتی/پرداختی، تنخواه گردان، وام، حساب‌های بانکی",
 icon: "Landmark",
 estimatedPrice: 59000,
 condition: (ctx) => ctx.invoiceCount > 30,
 reason: () => `با افزایش تعداد فاکتورها، مدیریت جریان نقدی اهمیت پیدا می‌کند`,
 expectedBenefit: "کنترل بهتر جریان نقدی، مدیریت خودکار چک‌های سررسید",
 priority: (ctx) => ctx.invoiceCount > 100? "high": "medium",
 },
 // ============ چند ارزی ============
 {
 module: "multi_currency",
 title: "مدیریت چند ارزی",
 description: "پشتیبانی از دلار، یورو، درهم با نرخ روز و تبدیل خودکار",
 icon: "DollarSign",
 estimatedPrice: 39000,
 condition: (ctx) => ctx.tenantAge > 60 &&!ctx.hasMultiCurrency,
 reason: () => `اگر با مشتریان بین‌المللی کار می‌کنید، چند ارزی ضروری است`,
 expectedBenefit: "گزارش‌گیری به هر ارزی، تطبیق با استانداردهای بین‌المللی",
 priority: () => "low",
 },
 // ============ API دسترسی ============
 {
 module: "api_access",
 title: "دسترسی API",
 description: "REST API، GraphQL، Webhook برای یکپارچه‌سازی با سیستم‌های دیگر",
 icon: "Code",
 estimatedPrice: 99000,
 condition: (ctx) => ctx.tenantAge > 90 && ctx.plan!== "starter" &&!ctx.hasApiAccess,
 reason: () => `با رشد کسب‌وکار، یکپارچه‌سازی با سیستم‌های دیگر (ERP، فروشگاه) ضروری است`,
 expectedBenefit: "خودکارسازی فرآیندها، یکپارچگی با هر سیستم خارجی",
 priority: () => "medium",
 },
 // ============ اپلیکیشن موبایل ============
 {
 module: "mobile_app",
 title: "اپلیکیشن موبایل",
 description: "ثبت فاکتور از موبایل، اسکن OCR، اعلان‌های push، دسترسی آفلاین",
 icon: "Smartphone",
 estimatedPrice: 29000,
 condition: (ctx) => ctx.invoiceCount > 10 && ctx.tenantAge > 30,
 reason: () => `ثبت فاکتور از محل مشتری با موبایل، سرعت شما را افزایش می‌دهد`,
 expectedBenefit: "افزایش ۴۰٪ سرعت ثبت فاکتور، دسترسی از هر جا",
 priority: () => "medium",
 },
];

// ============ Main ============

/**
 * پیشنهاد ماژول‌های مکمل برای tenant.
 *
 * @param tenantId شناسه tenant
 * @returns لیست پیشنهادها بر اساس اولویت
 */
export function getCrossSellRecommendations(
 tenantId: string
): CrossSellRecommendation[] {
 // در این پیاده‌سازی، context از داده‌های نمونه ساخته می‌شود
 // در production واقعی، از دیتابیس خوانده می‌شود
 const ctx = buildContextFromTenantId(tenantId);

 const recommendations: CrossSellRecommendation[] = [];

 for (const rule of MODULE_RULES) {
 if (rule.condition(ctx)) {
 recommendations.push({
 module: rule.module,
 title: rule.title,
 description: rule.description,
 reason: rule.reason(ctx),
 expectedBenefit: rule.expectedBenefit,
 priority: rule.priority(ctx),
 estimatedPrice: rule.estimatedPrice,
 icon: rule.icon,
 });
 }
 }

 // sort by priority
 const priorityOrder = { high: 0, medium: 1, low: 2 };
 recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

 return recommendations;
}

/**
 * ساخت context از tenantId (mock — در production از دیتابیس).
 */
function buildContextFromTenantId(_tenantId: string): TenantContext {
 // برای client-side استفاده می‌شود — context باید از سمت سرور پاس داده شود
 // اینجا context نمونه برمی‌گردانیم
 return {
 hasInvoices: true,
 invoiceCount: 50,
 hasProducts: true,
 productCount: 30,
 hasParties: true,
 partyCount: 80,
 hasBankAccounts: false,
 hasEmployees: false,
 tenantAge: 120,
 plan: "business",
 hasMultiCurrency: false,
 hasApiAccess: false,
 };
}

/**
 * نسخه‌ی server-side که context واقعی از دیتابیس می‌سازد.
 */
export async function getCrossSellRecommendationsServer(
 tenantId: string
): Promise<CrossSellRecommendation[]> {
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const { db } = require("@/lib/db") as typeof import("@/lib/db");

 const tenant = await db.tenant.findUnique({
 where: { id: tenantId },
 select: { id: true, plan: true, createdAt: true },
 });
 if (!tenant) return [];

 const [invoiceCount, productCount, partyCount, employeeCount, bankAccountCount] = await Promise.all([
 db.invoice.count({ where: { tenantId } }),
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.party.count({ where: { tenantId, deletedAt: null } }),
 db.employee.count({ where: { tenantId } }),
 db.bankAccount.count({ where: { tenantId } }),
 ]);

 const ctx: TenantContext = {
 hasInvoices: invoiceCount > 0,
 invoiceCount,
 hasProducts: productCount > 0,
 productCount,
 hasParties: partyCount > 0,
 partyCount,
 hasBankAccounts: bankAccountCount > 0,
 hasEmployees: employeeCount > 0,
 tenantAge: Math.floor((Date.now() - tenant.createdAt.getTime()) / 86400000),
 plan: tenant.plan,
 hasMultiCurrency: false, // TODO: check from settings
 hasApiAccess: tenant.plan === "enterprise",
 };

 const recommendations: CrossSellRecommendation[] = [];
 for (const rule of MODULE_RULES) {
 if (rule.condition(ctx)) {
 recommendations.push({
 module: rule.module,
 title: rule.title,
 description: rule.description,
 reason: rule.reason(ctx),
 expectedBenefit: rule.expectedBenefit,
 priority: rule.priority(ctx),
 estimatedPrice: rule.estimatedPrice,
 icon: rule.icon,
 });
 }
 }

 const priorityOrder = { high: 0, medium: 1, low: 2 };
 recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
 return recommendations;
}

/**
 * محاسبه‌ی ارزش کل cross-sell برای یک tenant.
 */
export function calculateCrossSellValue(
 recommendations: CrossSellRecommendation[]
): number {
 return recommendations.reduce((sum, r) => sum + r.estimatedPrice, 0);
}
