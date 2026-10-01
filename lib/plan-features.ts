// نقشه‌ی دسترسی ماژول‌ها بر اساس پلن — هوش
export type PlanId = "free" | "basic" | "pro" | "enterprise";

export const PLAN_ORDER: PlanId[] = ["free", "basic", "pro", "enterprise"];

export const PLAN_NAMES_FA: Record<PlanId, string> = {
 free: "رایگان",
 basic: "پایه",
 pro: "حرفه‌ای",
 enterprise: "سازمانی",
};

export const MODULE_PLAN_REQUIREMENTS: Record<string, PlanId> = {
 "dashboard": "free",
 "core": "free",
 "invoices": "free",
 "inventory": "basic",
 "crm": "basic",
 "treasury": "basic",
 "calculator": "free",
 "payroll": "pro",
 "insurance": "pro", // بیمه (سپید/سپاه) — لیست بیمه تأمین اجتماعی
 // FIX: کلید «taxes» با id واقعی ماژول در NAV_ITEMS/renderModule («tax»)
 // یکی نبود گیت پلن ماژول مالیات عملاً هیچ‌وقت اعمال نمی‌شد.
 "tax": "pro",
 "tax-filing": "pro",
 "budget": "pro",
 "reports-builder": "pro",
 // FIX: مودیان «سازمانی» بود و برای همه‌ی پلن‌های دمو (pro/starter) قفل می‌شد —
 // در تناقض با راهنمای خود ماژول («اتصال به مودیان در تمام پلن‌های هوش رایگان
 // است») و با رقبا (هلو: اتصال رایگان). مودیان تکلیف قانونی همه‌ی کسب‌وکارهای
 // مشمول است، نه قابلیت لوکس — برای همه آزاد شد.
 "modian": "free",
 "ecommerce": "enterprise",
 "app-marketplace": "enterprise",
 "ecosystem": "enterprise",

 // ===== FIX(v18-پلن پایه): ماتریس کامل ماژول‌ها + محدودیت معقول پلن پایه =====
 // تصمیم مالک: «ارز» در پلن پایه بماند (مشتری خرد به نرخ ارز نیاز دارد)،
 // بخش‌های مهم (فاکتور/انبار/خزانه/CRM/مودیان/گزارش پایان روز) در پایه بمانند،
 // ماژول‌های پیشرفته (هوش مصنوعی، پیش‌بینی، حقوق، تولیدی...) به حرفه‌ای بروند.
 "multi-currency": "basic", // ارز — طبق تصمیم صریح مالک
 "multi-currency-report": "basic", // گزارش چندارزی همراه همان ماژول
 "price-alerts": "basic", // هشدار قیمت طلا/ارز
 "quick-invoice": "free",
 "quick-invoice-list": "free",
 "quick-expense": "free",
 "end-of-day": "basic", // گزارش پایان روز — ابزار روزمره خرد
 "expense-tracker": "basic", // هزینه و مسافت — ابزار روزمره
 "invoice-aging": "basic", // سن فاکتور و ریسک — برای مدیریت بدهی خرد مهم است
 "customer-portal": "basic", // پورتال مشتریان — مزیت رقابتی، سخاوتمندانه در پایه
 "vendor-portal": "basic",
 "document-templates": "basic",
 "document-merge": "basic",
 "reminders": "basic", // یادآور سررسید — ارزش روزمره بالا
 "fiscal-year": "basic",
 "loyalty": "pro", // باشگاه مشتریان پیشرفته (امتیاز/سطح) — حرفه‌ای
 "forecast": "pro",
 "forecast-dashboard": "pro",
 "forecast-comparison": "pro",
 "anomaly-dashboard": "pro",
 "ai": "pro",
 "ai-financial-suite": "pro",
 "ocr-batch": "pro",
 "nl-query": "pro",
 "smart-dashboard": "pro",
 "custom-report-builder": "pro",
 "data-notebook": "pro",
 "ab-test-calculator": "pro",
 "bank-reconciliation": "pro",
 "fixed-assets": "pro",
 "financial-ratios": "pro",
 "project-profitability": "pro",
 "manufacturing": "pro",
 "contracting": "pro",
 "payment": "pro", // درگاه پرداخت اختصاصی
 "api": "pro",
 "security": "pro", // مدیریت کاربران تیم — پلن پایه تک‌کاربره است
 "tenant-logs": "pro",
 "time-attendance": "pro",
 "leave-management": "pro",
 "annual-bonus": "pro",
 "employee-portal": "pro",
 "workflow": "pro",
 "workflow-editor": "pro",
 "webhook-manager": "pro",
 "email-templates": "pro",
 "sms-templates": "pro",
 "email-queue": "pro",
 "tags-analytics": "pro",
 "supplier-analytics": "pro",
 "biometric-login": "pro",
 "partner-program": "enterprise",
 "marketplace": "enterprise",
 "mobile": "free",
 "account": "free",
 "license": "free",
 "support": "free",
 "help": "free",
 // ابزارها و صفحات عمومی
 "biometric": "pro",
 "security-training": "basic",
};

// رفتار پیش‌فرض dev-friendly است: وقتی پلن کاربر مشخص نیست (مثلاً پروفایل هنوز
// لود نشده)، ماژول قفل نمی‌شود تا در dev/دمو صفحه‌ها خالی نباشند.
// برای قفل‌گذاری سخت‌گیرانه در production، env زیر را ست کنید:
// NEXT_PUBLIC_STRICT_PLAN_GATE=true
const STRICT_PLAN_GATE = process.env.NEXT_PUBLIC_STRICT_PLAN_GATE === "true";

export function hasModuleAccess(userPlan: PlanId | string | undefined, moduleKey: string): boolean {
 const required = MODULE_PLAN_REQUIREMENTS[moduleKey] || "free";
 if (required === "free") return true;
 // dev-friendly (پیش‌فرض): بدون پلن دسترسی. در حالت strict (env) قفل.
 if (!userPlan) return!STRICT_PLAN_GATE;
 // FIX: normalizePlanName قبلاً استفاده نمی‌شد (کد مرده) — نام‌های فارسی/غیرمعیار
 // پلن (مثل «حرفه‌ای»، «کسب‌وکار»، «trial») با indexOf مستقیم -1 می‌شدند و
 // دسترسی نقض می‌شد. حالا همه از همان نگاشت واحدی عبور می‌کنند.
 const userPlanIdx = PLAN_ORDER.indexOf(normalizePlanName(userPlan));
 const requiredIdx = PLAN_ORDER.indexOf(required);
 return userPlanIdx >= requiredIdx;
}

export function getRequiredPlan(moduleKey: string): PlanId {
 return MODULE_PLAN_REQUIREMENTS[moduleKey] || "free";
}

export function normalizePlanName(plan: string): PlanId {
 const p = (plan || "").toLowerCase();
 if (p === "free" || p === "رایگان" || p === "trial") return "free";
 if (p === "basic" || p === "پایه" || p === "starter") return "basic";
 if (p === "pro" || p === "حرفه‌ای" || p === "professional" || p === "business" || p === "کسب‌وکار") return "pro";
 if (p === "enterprise" || p === "سازمانی") return "enterprise";
 return "free";
}
