// قالب‌های آماده‌ی بودجه برای صنایع مختلف - هوش
// کاربر با انتخاب یک قالب، دسته‌بندی‌ها و درصدهای پیشنهادی به‌صورت خودکار پر می‌شوند.

export interface BudgetTemplateCategory {
 category: string;
 percentage: number; // 0..100
}

export interface BudgetTemplate {
 id: string;
 name: string;
 description: string;
 categories: BudgetTemplateCategory[];
}

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
 {
 id: "retail",
 name: "فروشگاهی",
 description: "مناسب برای فروشگاه‌های خرد، سوپرمارکت، پوشاک و...",
 categories: [
 { category: "خرید کالا", percentage: 50 },
 { category: "حقوق و دستمزد", percentage: 15 },
 { category: "اجاره", percentage: 10 },
 { category: "بازاریابی", percentage: 10 },
 { category: "سایر", percentage: 15 },
 ],
 },
 {
 id: "manufacturing",
 name: "تولیدی",
 description: "مناسب برای کارخانجات و تولیدی‌ها با تمرکز بر مواد اولیه و تولید",
 categories: [
 { category: "مواد اولیه", percentage: 45 },
 { category: "حقوق و دستمزد", percentage: 18 },
 { category: "انرژی و سوخت", percentage: 8 },
 { category: "تعمیرات و نگهداری", percentage: 7 },
 { category: "استهلاک ماشین‌آلات", percentage: 10 },
 { category: "بازاریابی و فروش", percentage: 7 },
 { category: "سایر", percentage: 5 },
 ],
 },
 {
 id: "services",
 name: "خدماتی",
 description: "شرکت‌های خدماتی، مشاوره‌ای، فنی و مهندسی",
 categories: [
 { category: "حقوق و دستمزد", percentage: 50 },
 { category: "اجاره و تأسیسات", percentage: 15 },
 { category: "بازاریابی", percentage: 12 },
 { category: "نرم‌افزار و ابزار", percentage: 8 },
 { category: "سفر و مأموریت", percentage: 5 },
 { category: "سایر", percentage: 10 },
 ],
 },
 {
 id: "construction",
 name: "پیمانکاری",
 description: "شرکت‌های پیمانکاری ساختمانی، عمرانی و نصب",
 categories: [
 { category: "مصالح و تجهیزات", percentage: 45 },
 { category: "دستمزد پیمانکاران", percentage: 25 },
 { category: "ماشین‌آلات", percentage: 10 },
 { category: "حقوق پرسنل دفتری", percentage: 8 },
 { category: "بازاریابی و مناقصه", percentage: 5 },
 { category: "کسورات قانونی", percentage: 4 },
 { category: "سایر", percentage: 3 },
 ],
 },
 {
 id: "startup",
 name: "استارتاپ",
 description: "استارتاپ‌های فناوری و دانش‌بنیان با تمرکز بر رشد",
 categories: [
 { category: "حقوق و دستمزد", percentage: 55 },
 { category: "بازاریابی و رشد", percentage: 20 },
 { category: "زیرساخت و سرور", percentage: 8 },
 { category: "نرم‌افزار و ابزار", percentage: 7 },
 { category: "اجاره و دفتر", percentage: 5 },
 { category: "سایر", percentage: 5 },
 ],
 },
];

/** دریافت قالب با شناسه */
export function getTemplate(id: string): BudgetTemplate | null {
 return BUDGET_TEMPLATES.find((t) => t.id === id)?? null;
}

/** محاسبه‌ی مبلغ هر دسته بر اساس مبلغ کل و درصدهای قالب */
export function applyTemplate(
 templateId: string,
 totalAmount: number
): Array<{ category: string; amount: number; percentage: number }> {
 const t = getTemplate(templateId);
 if (!t) return [];
 return t.categories.map((c) => ({
 category: c.category,
 percentage: c.percentage,
 amount: Math.round((totalAmount * c.percentage) / 100),
 }));
}
