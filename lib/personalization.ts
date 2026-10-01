/**
 * personalization.ts — موتور شخصی‌سازی محتوا برای هوش
 * بر اساس segment کاربر، رفتار، و context، محتوای متفاوت نمایش می‌دهد
 */

import { resolveProfile, type CustomerProfile } from '@/lib/cdp';

export interface PersonalizationContext {
 userId?: string;
 tenantId?: string;
 sessionId?: string;
 page?: string;
 device?: 'mobile' | 'desktop' | 'tablet';
 geo?: string;
 referrer?: string;
 time?: number;
 isFirstVisit?: boolean;
}

export interface PersonalizationRule {
 id: string;
 name: string;
 description?: string;
 // شرایط
 conditions: Array<{
 attribute: string; // segment, ltv, device, geo, referrer, page, time, isVip, churnRisk
 operator: 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'regex';
 value: unknown;
 }>;
 logic?: 'AND' | 'OR';
 priority: number;
 // محتوای شخصی‌سازی شده
 content: {
 headline?: string;
 subheadline?: string;
 ctaText?: string;
 ctaColor?: string;
 backgroundImage?: string;
 badge?: string;
 showBanner?: boolean;
 bannerText?: string;
 pricingPlan?: string;
 discountPercent?: number;
 customFields?: Record<string, unknown>;
 };
 // metric tracking
 impressions: number;
 conversions: number;
}

// ---------- حافظه ----------
const rules: PersonalizationRule[] = [];

export function addRule(rule: Omit<PersonalizationRule, 'impressions' | 'conversions'>): PersonalizationRule {
 const r: PersonalizationRule = {...rule, impressions: 0, conversions: 0 };
 rules.push(r);
 rules.sort((a, b) => b.priority - a.priority);
 return r;
}

export function removeRule(id: string): boolean {
 const idx = rules.findIndex(r => r.id === id);
 if (idx < 0) return false;
 rules.splice(idx, 1);
 return true;
}

export function listRules(): PersonalizationRule[] {
 return [...rules];
}

// ---------- ارزیابی شرایط ----------
function evaluateCondition(condition: PersonalizationRule['conditions'][0], context: PersonalizationContext & { profile?: CustomerProfile | null }): boolean {
 const { attribute, operator, value } = condition;
 let actual: unknown;

 // استخراج مقدار از context یا profile
 if (attribute === 'segment' || attribute === 'ltv' || attribute === 'churnRisk' || attribute === 'isVip' || attribute === 'tags') {
 if (!context.profile) return false;
 if (attribute === 'segment') actual = context.profile.segments;
 else if (attribute === 'ltv') actual = context.profile.metrics.ltv;
 else if (attribute === 'churnRisk') actual = context.profile.metrics.churnRisk;
 else if (attribute === 'isVip') actual = context.profile.segments.includes('vip');
 else if (attribute === 'tags') actual = context.profile.tags;
 else actual = undefined;
 } else {
 actual = (context as Record<string, unknown>)[attribute];
 }

 switch (operator) {
 case 'eq': return actual === value;
 case 'neq': return actual!== value;
 case 'in': return Array.isArray(value) && Array.isArray(actual)? actual.some(a => (value as unknown[]).includes(a)): (value as unknown[]).includes(actual);
 case 'not_in': return Array.isArray(value)?!(value as unknown[]).includes(actual): true;
 case 'gt': return typeof actual === 'number' && typeof value === 'number' && actual > value;
 case 'lt': return typeof actual === 'number' && typeof value === 'number' && actual < value;
 case 'gte': return typeof actual === 'number' && typeof value === 'number' && actual >= value;
 case 'lte': return typeof actual === 'number' && typeof value === 'number' && actual <= value;
 case 'contains': return typeof actual === 'string' && typeof value === 'string' && actual.includes(value);
 case 'regex': return typeof actual === 'string' && typeof value === 'string' && new RegExp(value).test(actual);
 default: return false;
 }
}

function evaluateRule(rule: PersonalizationRule, context: PersonalizationContext & { profile?: CustomerProfile | null }): boolean {
 if (rule.conditions.length === 0) return true;
 const logic = rule.logic || 'AND';
 if (logic === 'AND') {
 return rule.conditions.every(c => evaluateCondition(c, context));
 }
 return rule.conditions.some(c => evaluateCondition(c, context));
}

// ---------- شخصی‌سازی ----------
export async function personalize(ctx: PersonalizationContext): Promise<{
 matchedRules: PersonalizationRule[];
 content: PersonalizationRule['content'];
}> {
 // دریافت پروفایل اگر userId وجود دارد
 let profile: CustomerProfile | null = null;
 if (ctx.userId && ctx.tenantId) {
 profile = await resolveProfile(ctx.tenantId, { userId: ctx.userId });
 }

 const enrichedCtx = {...ctx, profile };

 // یافتن قوانین منطبق
 const matched = rules.filter(r => evaluateRule(r, enrichedCtx));
 // افزایش impressions
 for (const rule of matched) {
 rule.impressions++;
 }

 // ادغام content از همه‌ی قوانین منطبق (به ترتیب priority)
 const mergedContent: PersonalizationRule['content'] = {};
 for (const rule of matched) {
 Object.assign(mergedContent, rule.content);
 }

 return { matchedRules: matched, content: mergedContent };
}

// ---------- ثبت conversion ----------
export function trackConversion(ruleId: string): void {
 const rule = rules.find(r => r.id === ruleId);
 if (rule) rule.conversions++;
}

// ---------- گزارش‌گیری ----------
export function getRuleStats(ruleId: string): { impressions: number; conversions: number; conversionRate: number } | null {
 const rule = rules.find(r => r.id === ruleId);
 if (!rule) return null;
 return {
 impressions: rule.impressions,
 conversions: rule.conversions,
 conversionRate: rule.impressions > 0? rule.conversions / rule.impressions: 0,
 };
}

// ---------- قوانین پیش‌فرض ----------
export function registerDefaultRules() {
 addRule({
 id: 'vip_pricing',
 name: 'قیمت‌گذاری ویژه برای VIP',
 description: 'نمایش تخفیف ۲۰٪ برای مشتریان VIP',
 conditions: [
 { attribute: 'segment', operator: 'in', value: ['vip'] },
 ],
 logic: 'AND',
 priority: 100,
 content: {
 badge: 'مشتری ویژه',
 ctaText: 'ارتقا به پلن Enterprise',
 discountPercent: 20,
 bannerText: 'به‌عنوان مشتری ویژه، ۲۰٪ تخفیف ویژه دریافت کنید',
 showBanner: true,
 },
 });

 addRule({
 id: 'mobile_first_cta',
 name: 'CTA موبایل',
 description: 'متن CTA متفاوت برای کاربران موبایل',
 conditions: [
 { attribute: 'device', operator: 'eq', value: 'mobile' },
 ],
 logic: 'AND',
 priority: 50,
 content: {
 ctaText: 'همین حالا اپلیکیشن را نصب کنید',
 headline: 'حسابداری هوش در جیب شما',
 },
 });

 addRule({
 id: 'churn_risk_save',
 name: 'بازگرداندن کاربران ریسک churn',
 description: 'نمایش پیام بازگرداندن برای کاربران با ریسک بالا',
 conditions: [
 { attribute: 'churnRisk', operator: 'gte', value: 0.6 },
 ],
 logic: 'AND',
 priority: 90,
 content: {
 badge: 'تخفیف ویژه برای شما',
 bannerText: 'ما شما را از دست نداده‌ایم — ۳۰٪ تخفیف ۳ ماهه',
 showBanner: true,
 discountPercent: 30,
 ctaText: 'فعال‌سازی تخفیف',
 },
 });

 addRule({
 id: 'first_visit_welcome',
 name: 'خوش‌آمدگویی اولین بازدید',
 conditions: [
 { attribute: 'isFirstVisit', operator: 'eq', value: true },
 ],
 logic: 'AND',
 priority: 70,
 content: {
 headline: 'به هوش خوش آمدید',
 subheadline: 'نرم‌افزار حسابداری هوشمند ایرانی — ۳ روز رایگان',
 ctaText: 'شروع رایگان',
 badge: 'تازه وارد',
 },
 });

 addRule({
 id: 'high_value_cross_sell',
 name: 'Cross-sell به مشتریان با ارزش',
 conditions: [
 { attribute: 'segment', operator: 'in', value: ['high_value'] },
 { attribute: 'ltv', operator: 'gte', value: 100_000_000 },
 ],
 logic: 'AND',
 priority: 80,
 content: {
 ctaText: 'افزودن ماژول CRM',
 bannerText: 'با توجه به حجم فعالیت شما، CRM یکپارچه پیشنهاد می‌شود',
 showBanner: true,
 },
 });
}
