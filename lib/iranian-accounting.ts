// قوانین حسابداری و مالیاتی ایران — سال ۱۴۰۳
// منبع: سازمان امور مالیاتی، سازمان تامین اجتماعی

// ============ نرخ‌های ۱۴۰۳ ============
export const RATES_1403 = {
 minimumWage: 7_166_184, // حداقل دستمزد ماهانه (تومان)
 minimumWageDaily: 238_873, // حداقل دستمزد روزانه
 baseSanavat: 70_000, // پایه سنوات روزانه
 bonKargari: 140_000, // بن کارگری روزانه (خواربار)
 housingAllowance: 900_000, // حق مسکن ماهانه
 childAllowance: 7_166_184, // حق اولاد (معادل حداقل دستمزد)
 eidCap: 14_332_368, // سقف عیدی = ۲ × حداقل دستمزد
 insuranceEmployeeRate: 0.07, // ۷٪ سهم کارگر
 insuranceEmployerRate: 0.23, // ۲۳٪ سهم کارفرما
 insuranceUnemploymentRate: 0.03, // ۳٪ بیمه بیکاری
} as const;

// ============ پله‌های مالیات حقوق ۱۴۰۳ ============
export const TAX_BRACKETS_1403 = [
 { upTo: 14_810_000, rate: 0.10 }, // تا ۱۴.۸۱M تومان: ۱۰٪
 { upTo: 30_000_000, rate: 0.15 }, // تا ۳۰M: ۱۵٪
 { upTo: 50_000_000, rate: 0.20 }, // تا ۵۰M: ۲۰٪
 { upTo: 70_000_000, rate: 0.25 }, // تا ۷۰M: ۲۵٪
 { upTo: 100_000_000, rate: 0.30 }, // تا ۱۰۰M: ۳۰٪
 { upTo: Infinity, rate: 0.35 }, // بیش از ۱۰۰M: ۳۵٪
] as const;

// ============ نرخ‌های ارزش افزوده ============
export const VAT_RATES = {
 STANDARD: 0.09, // نرخ عمومی: ۹٪
 ESSENTIAL: 0.15, // کالاهای خاص: ۱۵٪ (سیگار، نوشیدنی)
 HOUSING_SERVICES: 0.20, // خدمات مسکن: ۲۰٪
 ZERO: 0, // صادرات، نفت
} as const;

// ============ نرخ مالیات بر درآمد شرکت‌ها ============
export const CORPORATE_TAX = {
 RATE: 0.25, // ۲۵٪ برای شرکت‌ها
 RATE_GUILD: 0.06, // ۶٪ مالیات تکلیفی اصناف (ماده ۱۰۰)
} as const;

// ============ محاسبه مالیات حقوق (پلکانی) ============
export function calculatePayrollTax(taxableIncome: number): number {
 let tax = 0;
 let prevLimit = 0;
 for (const bracket of TAX_BRACKETS_1403) {
 if (taxableIncome <= prevLimit) break;
 const taxableInBracket = Math.min(taxableIncome, bracket.upTo) - prevLimit;
 tax += taxableInBracket * bracket.rate;
 prevLimit = bracket.upTo;
 }
 return Math.round(tax);
}

// ============ محاسبه حقوق کامل ============
export interface PayrollInput {
 baseSalary: number; // مزد پایه (تومان)
 overtime: number; // اضافه‌کار
 bonus: number; // پاداش
 bonDays: number; // تعداد روز بن کارگری
 housingAllowance: number; // حق مسکن
 childCount: number; // تعداد فرزند
 insuranceCode?: string;
}

export interface PayrollResult {
 gross: number; // ناخالص
 insuranceEmployee: number; // بیمه سهم کارگر (۷٪)
 insuranceEmployer: number; // بیمه سهم کارفرما (۲۳٪)
 taxableIncome: number; // مشمول مالیات
 tax: number; // مالیات
 childAllowance: number; // حق اولاد
 net: number; // خالص پرداختی
 totalCost: number; // هزینه کل کارفرما
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
 const bon = input.bonDays * RATES_1403.bonKargari;
 const childAllowance =
 input.childCount > 0
? RATES_1403.childAllowance * Math.min(input.childCount, 2)
: 0;
 const gross =
 input.baseSalary + input.overtime + input.bonus + bon + input.housingAllowance + childAllowance;

 // بیمه: ۷٪ سهم کارگر روی کل مشمول (پایه + اضافه‌کار + بن)
 const insuranceBase = input.baseSalary + input.overtime + bon;
 const insuranceEmployee = Math.round(insuranceBase * RATES_1403.insuranceEmployeeRate);
 const insuranceEmployer = Math.round(insuranceBase * RATES_1403.insuranceEmployerRate);

 // مشمول مالیات = ناخالص - بیمه سهم کارگر
 const taxableIncome = Math.max(0, gross - insuranceEmployee);
 const tax = calculatePayrollTax(taxableIncome);

 const net = gross - insuranceEmployee - tax;
 const totalCost = gross + insuranceEmployer;

 return {
 gross,
 insuranceEmployee,
 insuranceEmployer,
 taxableIncome,
 tax,
 childAllowance,
 net,
 totalCost,
 };
}

// ============ محاسبه عیدی ============
export function calculateEid(baseSalary: number): number {
 // عیدی = min(2 × پایه, 2 × حداقل دستمزد)
 return Math.min(baseSalary * 2, RATES_1403.eidCap);
}

// ============ محاسبه سنوات ============
export function calculateSanavat(baseSalary: number, yearsOfService: number): number {
 // ۱ ماه پایه به ازای هر سال سابقه
 return (baseSalary * yearsOfService * 1) / 12;
}

// ============ محاسبه ارزش افزوده ============
export interface VATInput {
 salesStandard: number; // فروش نرخ ۹٪
 salesEssential: number; // فروش نرخ ۱۵٪
 salesHousing: number; // فروش نرخ ۲۰٪
 purchasesStandard: number; // خرید نرخ ۹٪
 purchasesEssential: number; // خرید نرخ ۱۵٪
 purchasesHousing: number; // خرید نرخ ۲۰٪
}

export interface VATResult {
 outputVAT: number; // مالیات بر ارزش افزوده فروش (دریافتی)
 inputVAT: number; // مالیات بر ارزش افزوده خرید (پرداختی)
 payable: number; // قابل پرداخت (دریافتی - پرداختی)
}

export function calculateVAT(input: VATInput): VATResult {
 const outputVAT =
 input.salesStandard * VAT_RATES.STANDARD +
 input.salesEssential * VAT_RATES.ESSENTIAL +
 input.salesHousing * VAT_RATES.HOUSING_SERVICES;
 const inputVAT =
 input.purchasesStandard * VAT_RATES.STANDARD +
 input.purchasesEssential * VAT_RATES.ESSENTIAL +
 input.purchasesHousing * VAT_RATES.HOUSING_SERVICES;
 return {
 outputVAT: Math.round(outputVAT),
 inputVAT: Math.round(inputVAT),
 payable: Math.round(outputVAT - inputVAT),
 };
}

// ============ شناسه بانک از شماره کارت ============
export const BANK_BIN_RANGES: { prefix: string; bank: string }[] = [
 { prefix: "603799", bank: "بانک ملت" },
 { prefix: "603770", bank: "بانک کشاورزی" },
 { prefix: "502229", bank: "بانک پاسارگاد" },
 { prefix: "627412", bank: "بانک اقتصاد نوین" },
 { prefix: "622106", bank: "بانک پارسیان" },
 { prefix: "502908", bank: "بانک تات" },
 { prefix: "627353", bank: "بانک تجارت" },
 { prefix: "589210", bank: "بانک سپه" },
 { prefix: "627648", bank: "بانک توسعه صادرات" },
 { prefix: "627288", bank: "بانک توسعه تعاون" },
 { prefix: "603769", bank: "بانک صادرات ایران" },
 { prefix: "621986", bank: "بانک سامان" },
 { prefix: "589463", bank: "بانک رفاه کارگران" },
 { prefix: "502938", bank: "بانک دی" },
 { prefix: "639346", bank: "بانک sina" },
 { prefix: "627760", bank: "پست بانک ایران" },
 { prefix: "505416", bank: "بانک قرض‌الحسنه مهر" },
 { prefix: "636949", bank: "بانک مهر ایران" },
 { prefix: "606373", bank: "بانک مهر اقتصاد" },
 { prefix: "505801", bank: "بانک کوثر" },
 { prefix: "639370", bank: "بانک مهر" },
 { prefix: "639599", bank: "بانک قوامین" },
 { prefix: "627381", bank: "بانک انصار" },
 { prefix: "504706", bank: "بانک شهر" },
 { prefix: "603762", bank: "بانک سرمایه" },
];

export function detectBankFromCard(cardNumber: string): string | null {
 const clean = cardNumber.replace(/\D/g, "");
 if (clean.length < 6) return null;
 const prefix6 = clean.substring(0, 6);
 const prefix4 = clean.substring(0, 4);
 for (const entry of BANK_BIN_RANGES) {
 if (entry.prefix === prefix6 || entry.prefix === prefix4) {
 return entry.bank;
 }
 }
 return null;
}

// ============ تشخیص ناهنجاری / تقلب ============
export interface AnomalyResult {
 isAnomaly: boolean;
 reason: string;
 score: number; // 0-1
}

export function detectAnomaly(params: {
 amount: number;
 avgAmount: number;
 time: number; // ساعت 0-23
 isWeekend: boolean;
 duplicateCount: number;
}): AnomalyResult {
 let score = 0;
 const reasons: string[] = [];

 // مبلغ غیرعادی (بیش از ۳ برابر میانگین)
 if (params.avgAmount > 0 && params.amount > params.avgAmount * 3) {
 score += 0.4;
 reasons.push("مبلغ بیش از ۳ برابر میانگین");
 }

 // ساعت غیرعادی (۲ تا ۶ صبح)
 if (params.time >= 2 && params.time <= 6) {
 score += 0.3;
 reasons.push("تراکنش در ساعات غیراداری");
 }

 // تکرار تراکنش
 if (params.duplicateCount >= 3) {
 score += 0.4;
 reasons.push(`تکرار ${params.duplicateCount} تراکنش مشابه`);
 }

 return {
 isAnomaly: score >= 0.5,
 reason: reasons.join("، ") || "عادی",
 score: Math.min(score, 1),
 };
}

// ============ پیش‌بینی جریان نقدی (الگوریتم میانگین متحرک) ============
export function predictCashFlow(
 historical: number[],
 days: number = 90
): { predicted: number[]; confidence: number } {
 if (historical.length < 7) {
 return { predicted: [], confidence: 0 };
 }

 // میانگین متحرک ۷ روزه
 const window = 7;
 const predicted: number[] = [];
 const data = [...historical];

 for (let i = 0; i < days; i++) {
 const lastWindow = data.slice(-window);
 const avg = lastWindow.reduce((a, b) => a + b, 0) / window;
 // اضافه کردن نوسان فصلی ساده
 const trend = (data[data.length - 1] - data[data.length - window]) / window;
 const predicted_val = Math.round(avg + trend * 0.5);
 predicted.push(predicted_val);
 data.push(predicted_val);
 }

 // اعتماد بر اساس واریانس داده
 const mean = historical.reduce((a, b) => a + b, 0) / historical.length;
 const variance =
 historical.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / historical.length;
 const cv = Math.sqrt(variance) / Math.max(mean, 1); // ضریب تغییرات
 const confidence = Math.max(0, Math.min(1, 1 - cv));

 return { predicted, confidence };
}
