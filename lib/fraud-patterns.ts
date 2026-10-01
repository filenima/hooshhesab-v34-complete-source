// کتابخانه‌ی الگوهای تقلب — هوش
// الگوهای قابل‌تشخیص: فاکتور تکراری، مبالغ گرد غیرعادی، تراکنش غیراداری،
// همپوشانی تأمین‌کننده، مبالغ آستانه، توالی سریع.

import { db } from "@/lib/db";

export type FraudSeverity = "low" | "medium" | "high";

export interface FraudDetectionData {
 amount: number;
 invoiceNumber?: string;
 description?: string;
 date?: Date;
 partyName?: string;
 tenantId: string;
}

export interface FraudPattern {
 id: string;
 name: string;
 description: string;
 severity: FraudSeverity;
 detection: (data: FraudDetectionData, ctx?: FraudScanContext) => boolean;
}

export interface FraudScanContext {
 duplicateNumbers?: Set<string>;
 avgAmount?: number;
 thresholdAmount?: number;
 recentTransactions?: { date: Date; amount: number; description: string }[];
 supplierTxCount?: Map<string, number>;
}

export interface FraudAlert {
 patternId: string;
 patternName: string;
 severity: FraudSeverity;
 description: string;
 evidence: string;
 transactionRef?: string;
 detectedAt: string;
}

export const FRAUD_PATTERNS: FraudPattern[] = [
 {
 id: "duplicate-invoice",
 name: "فاکتور تکراری",
 description: "شماره فاکتور یا مبلغ و شرح یکسان در تراکنش‌های متعدد",
 severity: "high",
 detection: (data, ctx) => {
 if (!data.invoiceNumber ||!ctx?.duplicateNumbers) return false;
 return ctx.duplicateNumbers.has(data.invoiceNumber);
 },
 },
 {
 id: "round-amount",
 name: "مبالغ گرد غیرعادی",
 description: "تراکنش با مبلغ کاملاً گرد (مثلاً ۱۰۰٬۰۰۰٬۰۰۰) — گاهی نشانه‌ی دستکاری",
 severity: "medium",
 detection: (data) => {
 if (data.amount <= 0) return false;
 // مبلغ گرد: قابل‌بخش بر ۱۰ میلیون ریال (۱ میلیون تومان) و بالای ۱۰ میلیون ریال
 return data.amount >= 10_000_000 && data.amount % 10_000_000 === 0;
 },
 },
 {
 id: "after-hours",
 name: "تراکنش غیراداری",
 description: "ثبت فاکتور یا تراکنش در ساعات غیراداری (۲۲ تا ۶ صبح)",
 severity: "low",
 detection: (data) => {
 if (!data.date) return false;
 const h = data.date.getHours();
 return h >= 22 || h < 6;
 },
 },
 {
 id: "vendor-overlap",
 name: "همپوشانی تأمین‌کننده",
 description: "تأمین‌کننده‌ای که تعداد تراکنش غیرعادی بالایی در مدت کوتاه داشته است",
 severity: "medium",
 detection: (data, ctx) => {
 if (!data.partyName ||!ctx?.supplierTxCount) return false;
 const count = ctx.supplierTxCount.get(data.partyName) || 0;
 return count > 10; // بیش از ۱۰ تراکنش در بازه‌ی بررسی
 },
 },
 {
 id: "amount-threshold",
 name: "مبالغ آستانه",
 description: "تراکنش با مبلغی نزدیک به آستانه‌ی گزارش‌دهی (مثلاً ۵۰ میلیون تومان)",
 severity: "high",
 detection: (data, ctx) => {
 const threshold = ctx?.thresholdAmount?? 500_000_000; // ۵۰ میلیون تومان
 // نزدیک آستانه = بین ۹۰٪ تا ۱۰۰٪ آستانه (احتمال شکستن عمدی آستانه)
 return data.amount >= threshold * 0.9 && data.amount < threshold;
 },
 },
 {
 id: "rapid-sequence",
 name: "توالی سریع",
 description: "چندین تراکنش با شرح مشابه در کمتر از ۱۰ دقیقه",
 severity: "medium",
 detection: (data, ctx) => {
 if (!ctx?.recentTransactions ||!data.date ||!data.description) return false;
 const tenMinAgo = new Date(data.date.getTime() - 10 * 60 * 1000);
 let similar = 0;
 for (const t of ctx.recentTransactions) {
 if (t.date >= tenMinAgo && t.date <= data.date) {
 if (
 t.description === data.description ||
 (data.description.length > 5 &&
 t.description.includes(data.description.slice(0, 5)))
 ) {
 similar++;
 }
 }
 }
 return similar >= 3;
 },
 },
];

/** اجرای تمام الگوهای تقلب روی تراکنش‌های اخیر یک tenant */
export async function scanForFraud(tenantId: string): Promise<FraudAlert[]> {
 const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

 const invoices = await db.invoice.findMany({
 where: { tenantId, deletedAt: null, date: { gte: since } },
 include: { party: true },
 orderBy: { date: "asc" },
 take: 500,
 });

 if (invoices.length === 0) return [];

 // ساخت context برای الگوها
 const duplicateNumbers = new Set<string>();
 const numberCount = new Map<string, number>();
 for (const inv of invoices) {
 numberCount.set(inv.number, (numberCount.get(inv.number) || 0) + 1);
 }
 for (const [num, c] of numberCount) {
 if (c > 1) duplicateNumbers.add(num);
 }

 const avgAmount =
 invoices.reduce((s, i) => s + Number(i.total), 0) / invoices.length;

 const supplierTxCount = new Map<string, number>();
 for (const inv of invoices) {
 const name = inv.party?.name?? "_";
 supplierTxCount.set(name, (supplierTxCount.get(name) || 0) + 1);
 }

 const recentTransactions = invoices.map((i) => ({
 date: i.date,
 amount: Number(i.total),
 description: i.description?? i.number,
 }));

 const ctx: FraudScanContext = {
 duplicateNumbers,
 avgAmount,
 thresholdAmount: 500_000_000, // ۵۰ میلیون تومان
 recentTransactions,
 supplierTxCount,
 };

 const alerts: FraudAlert[] = [];
 const seen = new Set<string>(); // برای جلوگیری از تکرار همان هشدار

 for (const inv of invoices) {
 const data: FraudDetectionData = {
 amount: Number(inv.total),
 invoiceNumber: inv.number,
 description: inv.description?? inv.number,
 date: inv.date,
 partyName: inv.party?.name,
 tenantId,
 };

 for (const pattern of FRAUD_PATTERNS) {
 try {
 if (pattern.detection(data, ctx)) {
 const key = `${pattern.id}:${inv.id}`;
 if (seen.has(key)) continue;
 seen.add(key);
 alerts.push({
 patternId: pattern.id,
 patternName: pattern.name,
 severity: pattern.severity,
 description: pattern.description,
 evidence: `فاکتور ${inv.number} — ${inv.party?.name?? ""} — مبلغ ${inv.total} ریال — تاریخ ${inv.date.toLocaleDateString("fa-IR")}`,
 transactionRef: inv.id,
 detectedAt: new Date().toISOString(),
 });
 }
 } catch {
 // هر الگو مستقل — خطای یک الگو بقیه را متوقف نمی‌کند
 }
 }
 }

 // مرتب‌سازی: شدت بالا اول
 const order = { high: 0, medium: 1, low: 2 };
 alerts.sort((a, b) => order[a.severity] - order[b.severity]);

 return alerts;
}
