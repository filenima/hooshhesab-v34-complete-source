/**
 * cdp.ts — Customer Data Platform برای هوش
 * ساخت پروفایل یکپارچه‌ی مشتری از منابع مختلف: حسابداری، CRM، بازاریابی، رفتار وب
 */

import { db } from '@/lib/db';

export interface CustomerProfile {
 id: string;
 tenantId: string;
 // شناسه‌ها
 email?: string;
 phone?: string;
 nationalId?: string;
 partyId?: string; // شناسه‌ی طرف‌حساب در سیستم حسابداری
 userId?: string; // شناسه‌ی کاربر در اپلیکیشن
 // ویژگی‌ها
 fullName?: string;
 companyName?: string;
 type?: 'individual' | 'business';
 // segments و tags
 segments: string[];
 tags: string[];
 // آمار
 metrics: {
 totalRevenue: number;
 totalInvoices: number;
 avgOrderValue: number;
 lastActivityAt?: number;
 firstSeenAt: number;
 lifetimeDays: number;
 churnRisk: number; // 0..1
 ltv: number; // lifetime value به ریال
 };
 // رفتار
 events: Array<{
 type: string;
 timestamp: number;
 properties?: Record<string, unknown>;
 }>;
 // identity graph
 identities: Array<{
 type: string;
 value: string;
 confidence: number;
 mergedAt?: number;
 }>;
 // آخرین به‌روزرسانی
 updatedAt: number;
}

// ---------- cache ----------
const profileCache = new Map<string, { profile: CustomerProfile; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60_000; // ۵ دقیقه

// ---------- helper ----------
function nextId(): string {
 return `cdp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- resolve identity ----------
export async function resolveProfile(
 tenantId: string,
 identifiers: { email?: string; phone?: string; nationalId?: string; partyId?: string; userId?: string }
): Promise<CustomerProfile | null> {
 // اگر partyId داریم، مستقیم از DB بخوان
 if (identifiers.partyId) {
 return getProfileByPartyId(tenantId, identifiers.partyId);
 }
 // اگر userId داریم، از طریق user party
 if (identifiers.userId) {
 return getProfileByUserId(tenantId, identifiers.userId);
 }
 // جستجو با email/phone
 const cacheKey = `${tenantId}:${JSON.stringify(identifiers)}`;
 const cached = profileCache.get(cacheKey);
 if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.profile;
 // ساخت پروفایل از داده‌های موجود
 const profile: CustomerProfile = {
 id: nextId(),
 tenantId,
...identifiers,
 segments: [],
 tags: [],
 metrics: { totalRevenue: 0, totalInvoices: 0, avgOrderValue: 0, firstSeenAt: Date.now(), lifetimeDays: 0, churnRisk: 0, ltv: 0 },
 events: [],
 identities: Object.entries(identifiers).map(([type, value]) => ({ type, value: value as string, confidence: 1 })),
 updatedAt: Date.now(),
 };
 profileCache.set(cacheKey, { profile, cachedAt: Date.now() });
 return profile;
}

async function getProfileByPartyId(tenantId: string, partyId: string): Promise<CustomerProfile | null> {
 const cachedKey = `party:${tenantId}:${partyId}`;
 const cached = profileCache.get(cachedKey);
 if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.profile;
 try {
 const party = await db.party.findUnique({
 where: { id: partyId },
 include: {
 invoices: { select: { id: true, total: true, status: true, date: true }, take: 1000 },
 },
 });
 if (!party || party.tenantId!== tenantId) return null;

 const paidInvoices = party.invoices.filter(i => i.status === 'paid');
 const totalRevenue = paidInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
 const dates = party.invoices.map(i => new Date(i.date).getTime()).filter(Boolean);
 const firstSeenAt = dates.length? Math.min(...dates): Date.now();
 const lastActivityAt = dates.length? Math.max(...dates): undefined;
 const lifetimeDays = lastActivityAt? Math.floor((lastActivityAt - firstSeenAt) / 86400_000): 0;

 const profile: CustomerProfile = {
 id: `cdp_party_${partyId}`,
 tenantId,
 partyId,
 email: party.email || undefined,
 phone: party.phone || undefined,
 nationalId: party.nationalId || undefined,
 fullName: party.name,
 companyName: party.name,
 type: party.type === 'customer'? 'individual': 'business',
 segments: computeSegments(paidInvoices.length, totalRevenue, lifetimeDays),
 tags: [],
 metrics: {
 totalRevenue,
 totalInvoices: party.invoices.length,
 avgOrderValue: party.invoices.length? Math.round(totalRevenue / party.invoices.length): 0,
 lastActivityAt,
 firstSeenAt,
 lifetimeDays,
 churnRisk: computeChurnRisk(lastActivityAt),
 ltv: totalRevenue,
 },
 events: party.invoices.map(i => ({ type: 'invoice.created', timestamp: new Date(i.date).getTime(), properties: { amount: i.total } })),
 identities: [
 { type: 'partyId', value: partyId, confidence: 1 },
...(party.email? [{ type: 'email', value: party.email, confidence: 1 }]: []),
...(party.phone? [{ type: 'phone', value: party.phone, confidence: 1 }]: []),
 ],
 updatedAt: Date.now(),
 };
 profileCache.set(cachedKey, { profile, cachedAt: Date.now() });
 return profile;
 } catch {
 return null;
 }
}

async function getProfileByUserId(tenantId: string, userId: string): Promise<CustomerProfile | null> {
 const cachedKey = `user:${tenantId}:${userId}`;
 const cached = profileCache.get(cachedKey);
 if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.profile;
 try {
 const user = await db.user.findUnique({ where: { id: userId } });
 if (!user || user.tenantId!== tenantId) return null;
 const profile: CustomerProfile = {
 id: `cdp_user_${userId}`,
 tenantId,
 userId,
 email: user.email,
 fullName: user.name,
 segments: [],
 tags: [],
 metrics: { totalRevenue: 0, totalInvoices: 0, avgOrderValue: 0, firstSeenAt: user.createdAt?.getTime() || Date.now(), lifetimeDays: 0, churnRisk: 0, ltv: 0 },
 events: [],
 identities: [{ type: 'userId', value: userId, confidence: 1 },...(user.email? [{ type: 'email', value: user.email, confidence: 1 }]: [])],
 updatedAt: Date.now(),
 };
 profileCache.set(cachedKey, { profile, cachedAt: Date.now() });
 return profile;
 } catch {
 return null;
 }
}

function computeSegments(invoiceCount: number, revenue: number, lifetimeDays: number): string[] {
 const segments: string[] = [];
 if (revenue > 1_000_000_000) segments.push('vip');
 if (revenue > 100_000_000) segments.push('high_value');
 if (invoiceCount > 50) segments.push('frequent_buyer');
 if (lifetimeDays > 365) segments.push('loyal');
 if (invoiceCount === 0) segments.push('prospect');
 return segments;
}

function computeChurnRisk(lastActivityAt?: number): number {
 if (!lastActivityAt) return 0.5;
 const daysSinceLast = (Date.now() - lastActivityAt) / 86400_000;
 if (daysSinceLast < 30) return 0.1;
 if (daysSinceLast < 90) return 0.3;
 if (daysSinceLast < 180) return 0.6;
 return 0.9;
}

// ---------- track event ----------
export async function trackEvent(
 tenantId: string,
 identifiers: { partyId?: string; userId?: string; email?: string },
 eventType: string,
 properties?: Record<string, unknown>
): Promise<void> {
 const profile = await resolveProfile(tenantId, identifiers);
 if (!profile) return;
 profile.events.push({ type: eventType, timestamp: Date.now(), properties });
 if (profile.events.length > 1000) profile.events = profile.events.slice(-1000);
 profile.metrics.lastActivityAt = Date.now();
 profile.metrics.lifetimeDays = Math.floor((Date.now() - profile.metrics.firstSeenAt) / 86400_000);
 // به‌روزرسانی churn risk
 profile.metrics.churnRisk = computeChurnRisk(profile.metrics.lastActivityAt);
 profile.updatedAt = Date.now();
 // invalidation cache
 for (const [k, v] of profileCache) {
 if (v.profile.id === profile.id) {
 profileCache.set(k, { profile, cachedAt: Date.now() });
 }
 }
}

// ---------- merge profiles ----------
export function mergeProfiles(target: CustomerProfile, source: CustomerProfile): CustomerProfile {
 // ادغام identities
 const identityKeys = new Set(target.identities.map(i => `${i.type}:${i.value}`));
 for (const id of source.identities) {
 if (!identityKeys.has(`${id.type}:${id.value}`)) {
 target.identities.push({...id, mergedAt: Date.now() });
 identityKeys.add(`${id.type}:${id.value}`);
 }
 }
 // ادغام events
 target.events = [...target.events,...source.events].sort((a, b) => a.timestamp - b.timestamp).slice(-1000);
 // ادغام segments و tags
 target.segments = Array.from(new Set([...target.segments,...source.segments]));
 target.tags = Array.from(new Set([...target.tags,...source.tags]));
 // جمع metrics
 target.metrics.totalRevenue += source.metrics.totalRevenue;
 target.metrics.totalInvoices += source.metrics.totalInvoices;
 target.metrics.ltv += source.metrics.ltv;
 target.metrics.firstSeenAt = Math.min(target.metrics.firstSeenAt, source.metrics.firstSeenAt);
 target.metrics.lastActivityAt = Math.max(target.metrics.lastActivityAt || 0, source.metrics.lastActivityAt || 0);
 target.metrics.avgOrderValue = target.metrics.totalInvoices? Math.round(target.metrics.totalRevenue / target.metrics.totalInvoices): 0;
 target.metrics.lifetimeDays = Math.floor((target.metrics.lastActivityAt || Date.now() - target.metrics.firstSeenAt) / 86400_000);
 target.updatedAt = Date.now();
 return target;
}

// ---------- segments ----------
export function getSegment(profile: CustomerProfile, segmentName: string): boolean {
 return profile.segments.includes(segmentName);
}

export function listSegments(tenantId: string): Promise<Array<{ name: string; count: number; description: string }>> {
 // segments پیش‌فرض هوش
 return Promise.resolve([
 { name: 'vip', count: 0, description: 'مشتریان با درآمد بالای ۱ میلیارد ریال' },
 { name: 'high_value', count: 0, description: 'مشتریان با درآمد بالای ۱۰۰ میلیون' },
 { name: 'frequent_buyer', count: 0, description: 'بیش از ۵۰ فاکتور' },
 { name: 'loyal', count: 0, description: 'بیش از یک سال با ما' },
 { name: 'prospect', count: 0, description: 'هیچ فاکتوری ندارند' },
 { name: 'at_risk', count: 0, description: 'ریسک churn بالا' },
 ]);
}

export function clearCache() {
 profileCache.clear();
}
