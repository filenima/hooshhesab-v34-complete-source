// تجزیه‌کننده‌ی زبان طبیعی فارسی برای عامل هوش‌یار
// هوش — AI Agent Parser

// ============ انواع اکشن‌ها ============

export type AgentAction =
 | { type: 'CREATE_INVOICE'; partyName: string; items: { name: string; amount: number }[] }
 | { type: 'CREATE_PARTY'; name: string; partyType: 'customer' | 'supplier' | 'both' }
 | { type: 'CREATE_EXPENSE'; description: string; amount: number; category?: string }
 | { type: 'CREATE_JOURNAL_ENTRY'; description: string; entries: { account: string; debit: number; credit: number }[] }
 | { type: 'SEARCH_PARTY'; query: string }
 | { type: 'CALCULATE_TAX'; amount: number; taxType: string }
 | { type: 'CALCULATE_PAYROLL'; baseSalary: number; deductions: number }
 | { type: 'NAVIGATE'; path: string; label: string }
 | { type: 'ANSWER_QUESTION'; question: string };

export interface AgentStep {
 id: string;
 description: string;
 status: 'pending' | 'running' | 'done' | 'error';
 result?: unknown;
}

// ============ نگاشت اعداد فارسی ============

const PERSIAN_DIGITS_MAP: Record<string, string> = {
 '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
 '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
 '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
 '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** تبدیل ارقام فارسی/عربی به انگلیسی */
function normalizeDigits(text: string): string {
 return text.replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_DIGITS_MAP[ch]?? ch);
}

// ============ اعداد فارسی به رقم ============

/** اعداد فارسی: یک، دو، سه،... */
const PERSIAN_WORD_UNITS: Record<string, number> = {
 'یک': 1, 'یکی': 1, 'يك': 1,
 'دو': 2, 'دوتا': 2,
 'سه': 3, 'سها': 3,
 'چهار': 4,
 'پنج': 5,
 'شش': 6,
 'هفت': 7,
 'هشت': 8,
 'نه': 9, 'نُه': 9,
 'ده': 10,
 'یازده': 11,
 'دوازده': 12,
 'سیزده': 13,
 'چهارده': 14,
 'پانزده': 15, 'پونزده': 15,
 'شانزده': 16, 'شونزده': 16,
 'هفده': 17,
 'هجده': 18,
 'نوزده': 19,
 'بیست': 20,
 'سی': 30,
 'چهل': 40,
 'پنجاه': 50,
 'شصت': 60,
 'هفتاد': 70,
 'هشتاد': 80,
 'نود': 90,
};

const PERSIAN_WORD_SCALES: Record<string, number> = {
 'صد': 100, 'یکصد': 100, 'یكصد': 100,
 'دویست': 200,
 'سیصد': 300,
 'چهارصد': 400,
 'پانصد': 500, 'پنجصد': 500,
 'ششصد': 600,
 'هفتصد': 700,
 'هشتصد': 800,
 'نهصد': 900, 'نوسد': 900,
 'هزار': 1000,
 'میلیون': 1_000_000, 'ملیون': 1_000_000,
 'میلیارد': 1_000_000_000, 'ملیارد': 1_000_000_000,
};

/**
 * تبدیل عدد فارسی نوشتاری به رقم
 * مثال: "یک میلیون و هفتصد هزار" 1700000
 * مثال: "دویست و پنجاه و سه هزار" 293000
 */
export function parsePersianAmount(text: string): number {
 const normalized = normalizeDigits(text)
.replace(/[,،]/g, '') // حذف جداکننده‌ها
.replace(/تومان/g, '') // حذف واحد پول
.replace(/ریال/g, '')
.replace(/\s+/g, ' ')
.trim();

 // ابتدا بررسی اعداد رقم‌نوشته‌شده (مثلاً 1700000 یا ۱,۷۰۰,۰۰۰)
 const pureNumberMatch = normalized.match(/[\d]+/);
 if (pureNumberMatch && normalized.replace(/[\d.,]+/g, '').trim().length < 5) {
 const num = parseFloat(normalized.replace(/[^\d.]/g, ''));
 if (!isNaN(num) && num > 0) return num;
 }

 // تجزیه‌ی عدد فارسی نوشتاری
 const words = normalized
.split(/\s+و\s+|\s+/)
.filter(w => w.length > 0);

 let result = 0;
 let currentGroup = 0;

 for (const word of words) {
 if (PERSIAN_WORD_UNITS[word]!== undefined) {
 currentGroup += PERSIAN_WORD_UNITS[word];
 } else if (PERSIAN_WORD_SCALES[word]!== undefined) {
 const scale = PERSIAN_WORD_SCALES[word];
 if (scale >= 1000 && currentGroup === 0) {
 // مثلاً "هزار" به‌تنهایی = 1000
 currentGroup = 1;
 }
 if (scale >= 1000) {
 result += currentGroup * scale;
 currentGroup = 0;
 } else {
 // صد، دویست،...
 currentGroup += scale;
 }
 }
 }

 result += currentGroup;
 return result;
}

// ============ استخراج نام‌ها ============

/**
 * استخراج نام اشخاص/محصولات از متن فارسی
 * الگوهای رایج: "به اسم X"، "به نام X"، "برای X"، "به X"
 */
export function extractEntityNames(text: string): string[] {
 const names: string[] = [];

 // الگو: "به اسم/نام X"
 const namePatterns = [
 /به\s+(?:اسم|نام)\s+([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+(?:\s+[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+){0,3})/g,
 /برای\s+([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+(?:\s+[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+){0,3})/g,
 ];

 for (const pattern of namePatterns) {
 let match;
 while ((match = pattern.exec(text))!== null) {
 if (match[1] && match[1].length > 1) {
 names.push(match[1].trim());
 }
 }
 }

 return Array.from(new Set(names));
}

// ============ تجزیه‌ی اقلام فاکتور ============

/**
 * تجزیه‌ی اقلام فاکتور از متن فارسی
 * الگو: "محصولات: کفش ۱,۷۰۰,۰۰۰ تومان و شلوار ۲,۳۰۰,۰۰۰ تومان"
 * یا: "کفش ۱.۷ میلیون و شلوار ۲.۳ میلیون"
 */
export function parseInvoiceItems(text: string): { name: string; amount: number }[] {
 const items: { name: string; amount: number }[] = [];

 // نرمال‌سازی
 const normalized = normalizeDigits(text).replace(/[,،]/g, '');

 // الگو: نام‌محصول + عدد + (تومان/ریال/میلیون/...)
 // پترن ۱: "کفش 1700000 تومان و شلوار 2300000 تومان"
 // پترن ۲: "کفش ۱.۷ میلیون تومان و شلوار ۲.۳ میلیون"
 const itemPattern = /([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+(?:\s+[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+){0,2}?)\s+(\d[\d.]*)\s*(?:میلیون|ملیون)?\s*(?:تومان|ریال)?/g;

 // ابتدا بخش "محصولات:" یا " اقلام:" را جدا کن
 const itemsSection = normalized.match(/(?:محصولات|اقلام|کالاها|قلم‌ها)[:：]?\s*(.*)/);
 const searchIn = itemsSection? itemsSection[1]: normalized;

 let match;
 while ((match = itemPattern.exec(searchIn))!== null) {
 const name = match[1].trim();
 let amount = parseFloat(match[2]) || 0;

 // اگر میلیون داشت
 if (/میلیون|ملیون/.test(match[0])) {
 amount *= 1_000_000;
 }

 // حذف نام‌های کلیدی
 if (name && amount > 0 &&!/محصولات|اقلام|کالاها|قلم|تومان|ریال|و/.test(name)) {
 items.push({ name, amount: Math.round(amount) });
 }
 }

 // اگر پترن بالا جواب نداد، تلاش با پترن ساده‌تر
 if (items.length === 0) {
 // "محصول ۱,۷۰۰,۰۰۰ و محصول۲ ۲,۳۰۰,۰۰۰"
 const simplePattern = /([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+)\s+(\d[\d.,]*)/g;
 let simpleMatch;
 while ((simpleMatch = simplePattern.exec(searchIn))!== null) {
 const name = simpleMatch[1].trim();
 const amountStr = simpleMatch[2].replace(/[,،.]/g, '');
 const amount = parseInt(amountStr, 10);
 if (name && amount > 100 &&!/و|تومان|ریال|میلیون/.test(name)) {
 items.push({ name, amount });
 }
 }
 }

 return items;
}

// ============ تجزیه‌ی نیت کاربر ============

// الگوهای نیت
const INTENT_PATTERNS: { pattern: RegExp; type: string }[] = [
 // ایجاد فاکتور
 { pattern: /(?:برای\s+من\s+)?(?:یه|یک|یکی)\s+(?:فاکتور|پیش‌فاکتور|صورتحساب)\s+(?:بنویس|بساز|ایجاد|ثبت|درج|جدید)/, type: 'CREATE_INVOICE' },
 { pattern: /(?:فاکتور|صورتحساب)\s+(?:جدید|بنویس|بساز|ایجاد|ثبت)/, type: 'CREATE_INVOICE' },
 { pattern: /ثبت\s+(?:فاکتور|صورتحساب)/, type: 'CREATE_INVOICE' },
 { pattern: /ایجاد\s+(?:فاکتور|صورتحساب)/, type: 'CREATE_INVOICE' },

 // ایجاد طرف‌حساب
 { pattern: /(?:یه|یک)?\s*(?:مشتری|طرف‌حساب|فروشنده|تامین‌کننده|خریدار)\s+(?:جدید|اضافه|ثبت|ایجاد|بنویس|بساز)/, type: 'CREATE_PARTY' },
 { pattern: /(?:اضافه|ثبت|ایجاد|بنویس|بساز)\s+(?:مشتری|طرف‌حساب|فروشنده|تامین‌کننده)/, type: 'CREATE_PARTY' },
 { pattern: /مشتری\s+(?:جدید|بنویس)/, type: 'CREATE_PARTY' },

 // ثبت هزینه
 { pattern: /(?:یه|یک)?\s*(?:هزینه|خرج|مصرف)\s+(?:ثبت|بنویس|ایجاد|اضافه|جدید)/, type: 'CREATE_EXPENSE' },
 { pattern: /(?:ثبت|بنویس|ایجاد)\s+(?:هزینه|خرج|مصرف)/, type: 'CREATE_EXPENSE' },

 // سند حسابداری
 { pattern: /(?:یه|یک)?\s*(?:سند)\s+(?:ثبت|بنویس|ایجاد|جدید)/, type: 'CREATE_JOURNAL_ENTRY' },
 { pattern: /(?:ثبت|بنویس|ایجاد)\s+(?:سند)/, type: 'CREATE_JOURNAL_ENTRY' },

 // جستجوی مشتری
 { pattern: /(?:پیدا|بگرد|جستجو|سرچ|نمایش|ببین)\s+(?:مشتری|طرف‌حساب|فروشنده)/, type: 'SEARCH_PARTY' },
 { pattern: /(?:مشتری|طرف‌حساب)\s+(?:پیدا|بگرد|جستجو|سرچ)/, type: 'SEARCH_PARTY' },

 // محاسبه مالیات
 { pattern: /(?:محاسبه|حساب|محاسبه‌ی)\s+(?:مالیات|ارزش\s+افزوده| VAT|مالیات\s+بر\s+درآمد)/, type: 'CALCULATE_TAX' },
 { pattern: /مالیات\s+(?:چقدر|محاسبه|حساب)/, type: 'CALCULATE_TAX' },

 // محاسبه حقوق
 { pattern: /(?:محاسبه|حساب)\s+(?:حقوق|دستمزد|حقوق\s+و\s+دستمزد|پرول|فیش)/, type: 'CALCULATE_PAYROLL' },
 { pattern: /(?:حقوق|دستمزد|فیش)\s+(?:محاسبه|چقدر)/, type: 'CALCULATE_PAYROLL' },

 // ناوبری
 { pattern: /(?:برو|برو\s+به|نمایش|باز\s+کن|باز\s+کردن)\s+(?:صفحه|بخش|منو)\s+(?:فاکتور|مشتری|هزینه|سند|داشبورد|انبار|گزارش|حقوق|مالیات)/, type: 'NAVIGATE' },
 { pattern: /صفحه\s+(?:فاکتور|مشتری|هزینه|سند|داشبورد|انبار|گزارش|حقوق|مالیات)/, type: 'NAVIGATE' },
];

// نگاشت ناوبری
const NAVIGATE_MAP: Record<string, { path: string; label: string }> = {
 'فاکتور': { path: '/invoices', label: 'فاکتورها' },
 'فاکتورها': { path: '/invoices', label: 'فاکتورها' },
 'مشتری': { path: '/parties', label: 'مشتریان' },
 'مشتریان': { path: '/parties', label: 'مشتریان' },
 'طرف‌حساب': { path: '/parties', label: 'طرف‌حساب‌ها' },
 'هزینه': { path: '/expenses', label: 'هزینه‌ها' },
 'هزینه‌ها': { path: '/expenses', label: 'هزینه‌ها' },
 'سند': { path: '/journal-entries', label: 'اسناد حسابداری' },
 'داشبورد': { path: '/dashboard', label: 'داشبورد' },
 'انبار': { path: '/inventory', label: 'انبار' },
 'گزارش': { path: '/reports', label: 'گزارش‌ها' },
 'حقوق': { path: '/payroll', label: 'حقوق و دستمزد' },
 'دستمزد': { path: '/payroll', label: 'حقوق و دستمزد' },
 'مالیات': { path: '/tax', label: 'مالیات' },
};

/**
 * تجزیه‌ی متن فارسی برای تعیین نیت کاربر
 * خروجی: یک AgentAction یا null (اگر نیت شناخته نشد)
 */
export function parseAgentIntent(text: string): AgentAction | null {
 const normalizedText = normalizeDigits(text);

 // بررسی الگوهای نیت
 for (const { pattern, type } of INTENT_PATTERNS) {
 if (pattern.test(normalizedText)) {
 switch (type) {
 case 'CREATE_INVOICE': {
 // استخراج نام طرف‌حساب
 const partyName = extractPartyNameFromInvoiceText(text);
 // استخراج اقلام فاکتور
 const items = parseInvoiceItems(text);
 return { type: 'CREATE_INVOICE', partyName, items };
 }

 case 'CREATE_PARTY': {
 const name = extractPartyNameFromText(text) || '';
 const partyType = /فروشنده|تامین/.test(text)? 'supplier' as const
: /خریدار/.test(text)? 'customer' as const
: 'both' as const;
 return { type: 'CREATE_PARTY', name, partyType };
 }

 case 'CREATE_EXPENSE': {
 const amount = extractAmountFromText(text);
 const description = extractExpenseDescription(text);
 const category = extractExpenseCategory(text);
 return { type: 'CREATE_EXPENSE', description, amount, category };
 }

 case 'CREATE_JOURNAL_ENTRY': {
 return { type: 'CREATE_JOURNAL_ENTRY', description: text, entries: [] };
 }

 case 'SEARCH_PARTY': {
 const query = extractSearchQuery(text);
 return { type: 'SEARCH_PARTY', query };
 }

 case 'CALCULATE_TAX': {
 const amount = extractAmountFromText(text);
 const taxType = /ارزش\s*افزوده| VAT|vat/i.test(text)? 'VAT': 'income';
 return { type: 'CALCULATE_TAX', amount, taxType };
 }

 case 'CALCULATE_PAYROLL': {
 const amount = extractAmountFromText(text);
 return { type: 'CALCULATE_PAYROLL', baseSalary: amount, deductions: 0 };
 }

 case 'NAVIGATE': {
 const nav = extractNavigationTarget(text);
 if (nav) return { type: 'NAVIGATE',...nav };
 break;
 }
 }
 }
 }

 // اگر نیت شناخته نشد، به‌عنوان سوال حسابداری پاسخ بده
 return { type: 'ANSWER_QUESTION', question: text };
}

// ============ توابع کمکی استخراج ============

/** استخراج نام شخص از متن فاکتور */
function extractPartyNameFromInvoiceText(text: string): string {
 // الگو: "به اسم/نام X" یا "برای X"
 const patterns = [
 /به\s+(?:اسم|نام)\s+([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+(?:\s+[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+){0,3})/,
 /برای\s+([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+(?:\s+[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+){0,3})/,
 /(?:مشتری|طرف‌حساب)[:：\s]+([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+(?:\s+[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+){0,3})/,
 ];

 for (const p of patterns) {
 const match = text.match(p);
 if (match?.[1]) {
 // حذف کلیدواژه‌هایی که ممکن است اشتباهاً استخراج شوند
 const name = match[1].trim()
.replace(/(?:محصولات|اقلام|کالاها|هزینه|تومان|ریال|و).*/, '')
.trim();
 if (name.length > 1) return name;
 }
 }

 return '';
}

/** استخراج نام شخص از متن عمومی */
function extractPartyNameFromText(text: string): string {
 const patterns = [
 /(?:به\s+نام|به\s+اسم|با\s+نام)\s+([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+(?:\s+[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+){0,3})/,
 /نام\s+(?:او|ش|مشتری|طرف‌حساب)[:：\s]*([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+(?:\s+[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءًَُِّٰ]+){0,3})/,
 ];

 for (const p of patterns) {
 const match = text.match(p);
 if (match?.[1]) return match[1].trim();
 }

 return '';
}

/** استخراج مبلغ از متن */
function extractAmountFromText(text: number | string): number {
 if (typeof text === 'number') return text;
 const normalized = normalizeDigits(text).replace(/[,،]/g, '');

 // ابتدا اعداد رقم‌نوشته
 const numberPattern = /(\d[\d.]*)\s*(?:تومان|ریال|میلیون|ملیون|میلیارد|ملیارد)?/g;
 let match;
 let maxAmount = 0;
 while ((match = numberPattern.exec(normalized))!== null) {
 let amount = parseFloat(match[1]) || 0;
 if (/میلیارد|ملیارد/.test(match[0])) amount *= 1_000_000_000;
 else if (/میلیون|ملیون/.test(match[0])) amount *= 1_000_000;
 if (amount > maxAmount) maxAmount = amount;
 }

 if (maxAmount > 0) return Math.round(maxAmount);

 // سپس اعداد فارسی نوشتاری
 return parsePersianAmount(text);
}

/** استخراج شرح هزینه */
function extractExpenseDescription(text: string): string {
 // حذف کلیدواژه‌های دستور و استخراج شرح
 const cleaned = text
.replace(/(?:یه|یک)?\s*(?:هزینه|خرج|مصرف)\s+(?:ثبت|بنویس|ایجاد|اضافه|جدید)/, '')
.replace(/(?:ثبت|بنویس|ایجاد)\s+(?:هزینه|خرج|مصرف)/, '')
.replace(/\d[\d,،.]*(?:\s*(?:تومان|ریال|میلیون|میلیارد))?/g, '')
.replace(/برای\s+من/, '')
.trim();

 return cleaned || 'هزینه ثبت‌شده توسط هوش‌یار';
}

/** استخراج دسته‌بندی هزینه */
function extractExpenseCategory(text: string): string | undefined {
 const categories: Record<string, string> = {
 'سفر': 'TRAVEL',
 'غذا': 'MEALS',
 'خوراکی': 'MEALS',
 'سوخت': 'FUEL',
 'بنزین': 'FUEL',
 'دفتر': 'OFFICE',
 'لوازم': 'OFFICE',
 'نرم‌افزار': 'SOFTWARE',
 'اپلیکیشن': 'SOFTWARE',
 };

 for (const [keyword, category] of Object.entries(categories)) {
 if (text.includes(keyword)) return category;
 }

 return undefined;
}

/** استخراج عبارت جستجو */
function extractSearchQuery(text: string): string {
 const cleaned = text
.replace(/(?:پیدا|بگرد|جستجو|سرچ|نمایش|ببین)\s+(?:مشتری|طرف‌حساب|فروشنده)\s*/, '')
.replace(/(?:مشتری|طرف‌حساب)\s+(?:پیدا|بگرد|جستجو|سرچ)\s*/, '')
.trim();

 return cleaned || '';
}

/** استخراج مقصد ناوبری */
function extractNavigationTarget(text: string): { path: string; label: string } | null {
 for (const [keyword, target] of Object.entries(NAVIGATE_MAP)) {
 if (text.includes(keyword)) return target;
 }
 return null;
}

// ============ تولید مراحل اجرا ============

/**
 * تولید مراحل اجرا بر اساس نوع اکشن
 * هر مرحله شامل شرح فارسی و وضعیت اولیه است
 */
export function generateSteps(action: AgentAction): AgentStep[] {
 const step = (desc: string): AgentStep => ({
 id: `step-${Math.random().toString(36).slice(2, 8)}`,
 description: desc,
 status: 'pending',
 });

 switch (action.type) {
 case 'CREATE_INVOICE':
 return [
 step('در حال رفتن به صفحه فاکتورها...'),
 step('در حال ایجاد فاکتور جدید...'),
...(action.partyName? [step(`در حال وارد کردن اطلاعات ${action.partyName}...`)]: []),
...action.items.map(item =>
 step(`در حال افزودن ${item.name} — ${item.amount.toLocaleString('fa-IR')} تومان...`)
 ),
 step('فاکتور با موفقیت ثبت شد'),
 ];

 case 'CREATE_PARTY':
 return [
 step('در حال رفتن به صفحه طرف‌حساب‌ها...'),
 step(`در حال ایجاد ${action.partyType === 'supplier'? 'فروشنده': action.partyType === 'customer'? 'مشتری': 'طرف‌حساب'} جدید...`),
...(action.name? [step(`در حال وارد کردن نام ${action.name}...`)]: []),
 step('طرف‌حساب با موفقیت ثبت شد'),
 ];

 case 'CREATE_EXPENSE':
 return [
 step('در حال رفتن به صفحه هزینه‌ها...'),
 step('در حال ثبت هزینه جدید...'),
...(action.description? [step(`شرح: ${action.description}`)]: []),
 step('هزینه با موفقیت ثبت شد'),
 ];

 case 'CREATE_JOURNAL_ENTRY':
 return [
 step('در حال رفتن به صفحه اسناد حسابداری...'),
 step('در حال ایجاد سند جدید...'),
 step('سند با موفقیت ثبت شد'),
 ];

 case 'SEARCH_PARTY':
 return [
 step(`در حال جستجوی "${action.query}"...`),
 step('نمایش نتایج جستجو'),
 ];

 case 'CALCULATE_TAX':
 return [
 step('در حال محاسبه مالیات...'),
 step('نمایش نتیجه محاسبه'),
 ];

 case 'CALCULATE_PAYROLL':
 return [
 step('در حال محاسبه حقوق و دستمزد...'),
 step('نمایش نتیجه محاسبه'),
 ];

 case 'NAVIGATE':
 return [
 step(`در حال رفتن به صفحه ${action.label}...`),
 ];

 case 'ANSWER_QUESTION':
 return [
 step('در حال پردازش سوال شما...'),
 ];

 default:
 return [step('در حال اجرا...')];
 }
}

// ============ آفلاین: پاسخ‌های کش‌شده ============

/** پاسخ‌های آماده برای حالت آفلاین */
export const OFFLINE_RESPONSES: Record<string, string> = {
 'نرخ ارزش افزوده': 'نرخ ارزش افزوده (VAT) در ایران ۹٪ است. برخی کالاها و خدمات نرخ متفاوتی دارند: ۱۵٪ برای مشروبات و ۲۰٪ برای دخانیات.',
 'حداقل دستمزد': 'حداقل دستمزد سال ۱۴۰۳ حدود ۷۱,۶۶۱,۸۴۰ ریال (۷,۱۶۶,۱۸۴ تومان) در ماه است.',
 'نرخ بیمه': 'نرخ حق بیمه سهم کارمند ۷٪ و سهم کارفرما ۲۳٪ (شامل ۳٪ بیکاری) است.',
 'سانوات': 'سانوات_service_years = تعداد سال خدمت × آخرین حقوق پایه × ۱۵٪ (قانون کار)',
 'عیدی': 'عیدی = ۲ × آخرین حقوق پایه (حداکثر به سقف مصوب دولت)',
 'سود سپرده': 'سود سپرده قانونی بانکی در حال حاضر ۲۳٪ سالانه است (مصوب بانک مرکزی).',
 'فرمول سود': 'سود = اصل × نرخ × زمان / ۱۰۰',
 'صورتحساب الکترونیکی': 'صورتحساب الکترونیکی در سامانه مودیان برای کسب‌وکارهای با درآمد بیش از ۳ میلیارد ریال الزامی است.',
 'مودیان': 'سامانه مودیان مالیاتی برای ثبت صورتحساب‌ها و رسیدهای الکترونیکی است. تمام کسب‌وکارهای مشمول باید صورتحساب‌ها را الکترونیکی صادر کنند.',
};

/**
 * جستجو در پاسخ‌های آفلاین
 */
export function findOfflineResponse(question: string): string | null {
 const normalized = question.trim();
 for (const [keyword, response] of Object.entries(OFFLINE_RESPONSES)) {
 if (normalized.includes(keyword)) return response;
 }

 // پاسخ عمومی آفلاین
 if (/مالیات|ارزش\s*افزوده| VAT/i.test(normalized)) {
 return OFFLINE_RESPONSES['نرخ ارزش افزوده'];
 }
 if (/دستمزد|حقوق|بیمه/i.test(normalized)) {
 return OFFLINE_RESPONSES['حداقل دستمزد'];
 }
 if (/مودیان|صورتحساب\s*الکترونیکی/i.test(normalized)) {
 return OFFLINE_RESPONSES['مودیان'];
 }

 return null;
}
