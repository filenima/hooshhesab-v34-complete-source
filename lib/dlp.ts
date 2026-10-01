// ============ Data Loss Prevention (DLP) ============
// شناسایی و mask داده‌ی حساس در خروجی‌ها — کد ملی، شماره کارت،
// شماره شبا، تلفن و ایمیل. جلوگیری از نشت PII در export.

export interface SensitivePattern {
 type: string;
 match: string;
 start: number;
 end: number;
}

export interface DlpScanResult {
 found: boolean;
 patterns: SensitivePattern[];
 maskedText: string;
}

// الگوهای regex برای داده‌ی حساس ایرانی
const PATTERNS: { type: string; regex: RegExp }[] = [
 // کد ملی ایران — ۱۰ رقم (با در نظر گرفن فاصله‌ی احتمالی)
 {
 type: "NATIONAL_ID",
 regex: /\b(\d{3})[-\s]?(\d{6})[-\s]?(\d{1})\b/g,
 },
 // شماره کارت بانکی — ۱۶ رقم (با یا بدون فاصله)
 {
 type: "CARD_NUMBER",
 regex: /\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})\b/g,
 },
 // شماره شبا (IR + ۲۴ رقم)
 {
 type: "IBAN",
 regex: /\bIR\d{2}\d{3}\d{19}\b|\bIR\d{24}\b/gi,
 },
 // شماره تلفن همراه ایرانی — ۰۹xxxxxxxxx
 {
 type: "PHONE_NUMBER",
 regex: /\b09\d{9}\b|\b\+989\d{9}\b/g,
 },
 // شماره ثابت تهران — ۰۲۱xxxxxxxx
 {
 type: "LANDLINE",
 regex: /\b0\d{2,3}\d{8}\b/g,
 },
 // ایمیل
 {
 type: "EMAIL",
 regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
 },
 // CVV2
 {
 type: "CVV2",
 regex: /\bcvv2?[:\s]*(\d{3,4})\b/gi,
 },
];

/**
 * اسکن متن برای داده‌ی حساس.
 */
export function scanForSensitiveData(text: string): {
 found: boolean;
 patterns: { type: string; match: string }[];
} {
 const found: { type: string; match: string }[] = [];
 for (const { type, regex } of PATTERNS) {
 const re = new RegExp(regex.source, regex.flags);
 let match: RegExpExecArray | null;
 while ((match = re.exec(text))!== null) {
 found.push({ type, match: match[0] });
 }
 }
 return { found: found.length > 0, patterns: found };
}

/**
 * Mask کردن داده‌ی حساس در متن.
 * مثال: 5022291047363659 5022********3659
 */
export function maskSensitiveData(text: string): string {
 let result = text;
 for (const { type, regex } of PATTERNS) {
 const re = new RegExp(regex.source, regex.flags);
 result = result.replace(re, (match) => maskValue(match, type));
 }
 return result;
}

function maskValue(value: string, type: string): string {
 // فاصله/خط تیره را حفظ کن
 const digits = value.replace(/\D/g, "");
 switch (type) {
 case "NATIONAL_ID": {
 if (digits.length!== 10) return value;
 return `${digits.slice(0, 3)}*******${digits.slice(9)}`;
 }
 case "CARD_NUMBER": {
 if (digits.length!== 16) return value;
 return `${digits.slice(0, 4)}********${digits.slice(12)}`;
 }
 case "IBAN": {
 const d = value.replace(/\s/g, "");
 if (d.length < 8) return "****";
 return `${d.slice(0, 4)}****${d.slice(-4)}`;
 }
 case "PHONE_NUMBER":
 case "LANDLINE": {
 if (digits.length < 5) return "****";
 return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
 }
 case "EMAIL": {
 const [name, domain] = value.split("@");
 if (!domain) return "****";
 const maskedName = name.length > 2? `${name[0]}***${name[name.length - 1]}`: "***";
 return `${maskedName}@${domain}`;
 }
 case "CVV2": {
 return "***";
 }
 default:
 return value.length > 4? `${value.slice(0, 2)}****`: "****";
 }
}

/**
 * اعتبارسنجی داده‌ی export — آیا داده‌ی حساس بدون mask در خروجی هست؟
 */
export function validateExport(data: unknown): {
 allowed: boolean;
 reason?: string;
 maskedData?: unknown;
 sensitiveCount: number;
} {
 if (data == null) return { allowed: true, sensitiveCount: 0 };

 const sensitiveCount = { value: 0 };
 const maskedData = deepMask(data, sensitiveCount);

 if (sensitiveCount.value > 0) {
 // اجازه‌ی خروج با mask — ولی در صورت وجود > ۱۰۰ مورد حساس، نیازمند تأیید
 if (sensitiveCount.value > 100) {
 return {
 allowed: false,
 reason: `داده‌ی خروجی شامل ${sensitiveCount.value} مورد حساس است — نیازمند تأیید مدیر`,
 sensitiveCount: sensitiveCount.value,
 };
 }
 return {
 allowed: true,
 maskedData,
 reason: `${sensitiveCount.value} مورد حساس mask شد`,
 sensitiveCount: sensitiveCount.value,
 };
 }

 return { allowed: true, sensitiveCount: 0 };
}

function deepMask(data: unknown, counter: { value: number }): unknown {
 if (typeof data === "string") {
 const result = scanForSensitiveData(data);
 if (result.found) {
 counter.value += result.patterns.length;
 return maskSensitiveData(data);
 }
 return data;
 }
 if (Array.isArray(data)) {
 return data.map((item) => deepMask(item, counter));
 }
 if (data && typeof data === "object") {
 const out: Record<string, unknown> = {};
 for (const [key, value] of Object.entries(data)) {
 // اگر نام فیلد نشان‌دهنده‌ی حساسیت است، mask اجباری
 if (isSensitiveField(key) && typeof value === "string") {
 const masked = maskSensitiveData(value);
 if (masked!== value) counter.value++;
 out[key] = masked;
 } else {
 out[key] = deepMask(value, counter);
 }
 }
 return out;
 }
 return data;
}

function isSensitiveField(fieldName: string): boolean {
 const lower = fieldName.toLowerCase();
 const sensitiveNames = [
 "nationalid",
 "national_id",
 "nationalcode",
 "cardnumber",
 "card_number",
 "shaba",
 "iban",
 "phone",
 "mobile",
 "email",
 "cvv",
 "cvv2",
 "password",
 "secret",
 "token",
 ];
 return sensitiveNames.some((name) => lower.includes(name));
}

/**
 * نسخه‌ی امن برای نمایش در UI — mask می‌کند و فقط ۴ کاراکتر آخر را نشان می‌دهد.
 */
export function maskForDisplay(value: string, type?: string): string {
 if (!value) return "";
 if (type) {
 return maskValue(value, type);
 }
 const scan = scanForSensitiveData(value);
 if (scan.found) {
 return maskSensitiveData(value);
 }
 return value;
}
