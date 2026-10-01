// قوانین تطبیق هوشمند قابل تنظیم — هوش
// قواعد تطبیق: بازه‌ی مبلغ، کلیدواژه‌ی شرح، نزدیکی تاریخ، طرف‌حساب
// یادگیری خودکار: تأیید کاربر یک تطابق، قانون می‌سازد
// ذخیره‌سازی: SystemSettings با کلید tenant-specific (بدون نیاز به migration)

import { db } from "@/lib/db";

export type RuleType = "amount_range" | "keyword" | "date_proximity" | "party_match";

export interface ReconRule {
 id: string;
 tenantId: string;
 name: string;
 type: RuleType;
 // پارامترها بسته به نوع قانون متفاوت‌اند
 amountMin?: number;
 amountMax?: number;
 keyword?: string;
 dateWindowDays?: number;
 partyId?: string;
 invoiceIdPattern?: string;
 confidence: number; // امتیاز اعتماد قانون
 autoLearned: boolean;
 createdAt: string;
 hits: number; // تعداد دفعات استفاده
}

export interface Transaction {
 id: string;
 date: string;
 amount: number;
 description: string;
 partyId?: string;
}

export interface Invoice {
 id: string;
 number: string;
 amount: number;
 partyId?: string;
 partyName?: string;
 date?: string;
}

export interface RuleMatch {
 ruleId: string;
 ruleName: string;
 transactionId: string;
 invoiceId: string;
 confidence: number;
 note: string;
}

// کلید نگهداری قوانین در SystemSettings
function ruleKey(tenantId: string): string {
 return `recon_rules_${tenantId}`;
}

// کش محلی برای کاهش کوئری DB
const ruleCache = new Map<string, { ts: number; rules: ReconRule[] }>();
const CACHE_TTL_MS = 30_000;

async function loadRules(tenantId: string): Promise<ReconRule[]> {
 const cached = ruleCache.get(tenantId);
 if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
 return cached.rules;
 }
 const setting = await db.systemSettings.findUnique({
 where: { key: ruleKey(tenantId) },
 });
 let rules: ReconRule[] = [];
 if (setting) {
 try {
 rules = JSON.parse(setting.value);
 } catch {
 rules = [];
 }
 }
 ruleCache.set(tenantId, { ts: Date.now(), rules });
 return rules;
}

async function saveRules(tenantId: string, rules: ReconRule[]): Promise<void> {
 const key = ruleKey(tenantId);
 await db.systemSettings.upsert({
 where: { key },
 update: { value: JSON.stringify(rules) },
 create: { key, value: JSON.stringify(rules) },
 });
 ruleCache.set(tenantId, { ts: Date.now(), rules });
}

/** ایجاد قانون جدید */
export async function createRule(rule: Omit<ReconRule, "id" | "createdAt" | "hits">): Promise<ReconRule> {
 const newRule: ReconRule = {
...rule,
 id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
 createdAt: new Date().toISOString(),
 hits: 0,
 };
 const rules = await loadRules(rule.tenantId);
 rules.push(newRule);
 await saveRules(rule.tenantId, rules);
 return newRule;
}

/** حذف قانون با شناسه */
export async function deleteRule(tenantId: string, ruleId: string): Promise<void> {
 const rules = await loadRules(tenantId);
 const filtered = rules.filter((r) => r.id!== ruleId);
 await saveRules(tenantId, filtered);
}

/** فهرست تمام قوانین یک tenant */
export async function listRules(tenantId: string): Promise<ReconRule[]> {
 return loadRules(tenantId);
}

/** ارزیابی یک تراکنش در برابر قوانین و فاکتورها */
export async function evaluateRules(
 transaction: Transaction,
 invoices: Invoice[],
 tenantId: string
): Promise<RuleMatch[]> {
 const rules = await loadRules(tenantId);
 const matches: RuleMatch[] = [];
 const matchedInvIds = new Set<string>();

 for (const rule of rules) {
 for (const inv of invoices) {
 if (matchedInvIds.has(inv.id)) continue;
 const m = applyRule(rule, transaction, inv);
 if (m) {
 matches.push(m);
 matchedInvIds.add(inv.id);
 }
 }
 }

 // به‌روزرسانی شمارنده‌ی استفاده (غیرهمزمان)
 if (matches.length > 0) {
 const allRules = await loadRules(tenantId);
 const usedRuleIds = new Set(matches.map((m) => m.ruleId));
 let changed = false;
 for (const r of allRules) {
 if (usedRuleIds.has(r.id)) {
 r.hits++;
 changed = true;
 }
 }
 if (changed) {
 void saveRules(tenantId, allRules);
 }
 }

 return matches;
}

function applyRule(rule: ReconRule, tx: Transaction, inv: Invoice): RuleMatch | null {
 const absAmt = Math.abs(tx.amount);
 switch (rule.type) {
 case "amount_range": {
 const min = rule.amountMin?? 0;
 const max = rule.amountMax?? Number.MAX_SAFE_INTEGER;
 const invAmt = inv.amount;
 if (
 absAmt >= min &&
 absAmt <= max &&
 Math.abs(absAmt - invAmt) <= Math.max(1000, invAmt * 0.02)
 ) {
 return {
 ruleId: rule.id,
 ruleName: rule.name,
 transactionId: tx.id,
 invoiceId: inv.id,
 confidence: rule.confidence,
 note: `تطابق بازه‌ی مبلغ (${min} - ${max})`,
 };
 }
 return null;
 }
 case "keyword": {
 if (!rule.keyword) return null;
 const kw = rule.keyword.toLowerCase();
 const haystacks = [tx.description, inv.number, inv.partyName?? ""].join(" ").toLowerCase();
 if (haystacks.includes(kw)) {
 return {
 ruleId: rule.id,
 ruleName: rule.name,
 transactionId: tx.id,
 invoiceId: inv.id,
 confidence: rule.confidence,
 note: `تطابق کلیدواژه‌ی «${rule.keyword}»`,
 };
 }
 return null;
 }
 case "date_proximity": {
 if (!tx.date ||!inv.date) return null;
 const days = Math.abs(
 (new Date(tx.date).getTime() - new Date(inv.date).getTime()) /
 (24 * 60 * 60 * 1000)
 );
 if (days <= (rule.dateWindowDays?? 7)) {
 return {
 ruleId: rule.id,
 ruleName: rule.name,
 transactionId: tx.id,
 invoiceId: inv.id,
 confidence: rule.confidence,
 note: `فاصله‌ی زمانی ${Math.round(days)} روز`,
 };
 }
 return null;
 }
 case "party_match": {
 if (!tx.partyId ||!inv.partyId || tx.partyId!== inv.partyId) return null;
 return {
 ruleId: rule.id,
 ruleName: rule.name,
 transactionId: tx.id,
 invoiceId: inv.id,
 confidence: rule.confidence,
 note: `تطابق طرف‌حساب`,
 };
 }
 default:
 return null;
 }
}

/** یادگیری خودکار: وقتی کاربر یک تطابق را تأیید می‌کند، قانون مرتبط ساخته می‌شود */
export async function learnFromMatch(
 tenantId: string,
 transaction: Transaction,
 invoice: Invoice
): Promise<ReconRule | null> {
 // تشخیص بهترین نوع قانون بر اساس داده‌ی تطابق
 const absAmt = Math.abs(transaction.amount);
 let type: RuleType = "amount_range";
 let extra: Partial<ReconRule> = {};

 if (transaction.partyId && invoice.partyId && transaction.partyId === invoice.partyId) {
 type = "party_match";
 extra.partyId = transaction.partyId;
 } else if (transaction.date && invoice.date) {
 const days = Math.abs(
 (new Date(transaction.date).getTime() - new Date(invoice.date).getTime()) /
 (24 * 60 * 60 * 1000)
 );
 if (days <= 7) {
 type = "date_proximity";
 extra.dateWindowDays = Math.ceil(days) + 2;
 }
 } else if (absAmt > 0 && Math.abs(absAmt - invoice.amount) <= Math.max(1000, invoice.amount * 0.02)) {
 type = "amount_range";
 extra.amountMin = Math.round(absAmt * 0.95);
 extra.amountMax = Math.round(absAmt * 1.05);
 }

 // جلوگیری از تکرار: اگر قانون مشابه هست، فقط hits را زیاد کن
 const existing = await loadRules(tenantId);
 const similar = existing.find((r) => {
 if (r.type!== type) return false;
 if (type === "amount_range") {
 return (
 Math.abs((r.amountMin?? 0) - (extra.amountMin?? 0)) < absAmt * 0.05 &&
 Math.abs((r.amountMax?? 0) - (extra.amountMax?? 0)) < absAmt * 0.05
 );
 }
 if (type === "party_match") return r.partyId === extra.partyId;
 if (type === "date_proximity") return r.dateWindowDays === extra.dateWindowDays;
 return false;
 });
 if (similar) {
 similar.hits++;
 await saveRules(tenantId, existing);
 return similar;
 }

 return createRule({
 tenantId,
 name: `قانون یادگرفته‌شده — ${type}`,
 type,
...extra,
 confidence: 0.7,
 autoLearned: true,
 });
}
