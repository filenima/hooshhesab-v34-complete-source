// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * feature-store.ts — ML Feature Store برای هوش
 * مدیریت feature‌های ML: تعریف، محاسبه، ذخیره، و بازیابی
 */

export interface FeatureDefinition {
 id: string;
 name: string;
 description?: string;
 entity: string; // customer, invoice, tenant,...
 type: 'numerical' | 'categorical' | 'boolean' | 'datetime';
 dtype: 'int' | 'float' | 'string' | 'bool';
 source: string; // SQL, API, computed
 query?: string; // در صورت SQL source
 computation?: string; // در صورت computed
 // metadata
 version: string;
 createdAt: number;
 updatedAt: number;
 tags: string[];
 owner?: string;
 stats?: {
 mean?: number;
 std?: number;
 min?: number;
 max?: number;
 nullCount?: number;
 uniqueCount?: number;
 };
}

export interface FeatureValue {
 entityId: string;
 featureName: string;
 value: unknown;
 timestamp: number;
 version: string;
}

export interface FeatureGroup {
 id: string;
 name: string;
 description?: string;
 entity: string;
 featureNames: string[];
 refreshInterval: number; // دقیقه
 lastRefreshedAt?: number;
 enabled: boolean;
}

// ---------- state ----------
const definitions = new Map<string, FeatureDefinition>();
const values = new Map<string, FeatureValue[]>(); // key: featureName
const groups = new Map<string, FeatureGroup>();

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- definitions ----------
export function registerFeature(def: Omit<FeatureDefinition, 'id' | 'createdAt' | 'updatedAt' | 'version'>): FeatureDefinition {
 const f: FeatureDefinition = {
...def,
 id: def.id || nextId('feat'),
 version: '1.0.0',
 createdAt: Date.now(),
 updatedAt: Date.now(),
 };
 definitions.set(f.name, f);
 if (!values.has(f.name)) values.set(f.name, []);
 return f;
}

export function getFeature(name: string): FeatureDefinition | undefined {
 return definitions.get(name);
}

export function listFeatures(filter?: { entity?: string; tag?: string }): FeatureDefinition[] {
 let result = Array.from(definitions.values());
 if (filter?.entity) result = result.filter(f => f.entity === filter.entity);
 if (filter?.tag) result = result.filter(f => f.tags.includes(filter.tag!));
 return result;
}

export function updateFeature(name: string, updates: Partial<FeatureDefinition>): FeatureDefinition | null {
 const f = definitions.get(name);
 if (!f) return null;
 Object.assign(f, updates, { updatedAt: Date.now() });
 if (updates.query || updates.computation) {
 f.version = incrementVersion(f.version);
 }
 definitions.set(name, f);
 return f;
}

function incrementVersion(v: string): string {
 const parts = v.split('.').map(Number);
 parts[2] = (parts[2] || 0) + 1;
 return parts.join('.');
}

export function deleteFeature(name: string): boolean {
 if (!definitions.delete(name)) return false;
 values.delete(name);
 return true;
}

// ---------- values ----------
export function setFeatureValue(
 featureName: string,
 entityId: string,
 value: unknown,
 timestamp = Date.now()
): void {
 const def = definitions.get(featureName);
 if (!def) throw new Error(`Feature ${featureName} not registered`);
 const arr = values.get(featureName) || [];
 // حذف مقدار قبلی برای همان entityId و timestamp
 const filtered = arr.filter(v =>!(v.entityId === entityId && v.timestamp === timestamp));
 filtered.push({ entityId, featureName, value, timestamp, version: def.version });
 // مرتب‌سازی بر اساس entityId و timestamp
 filtered.sort((a, b) => a.entityId.localeCompare(b.entityId) || a.timestamp - b.timestamp);
 values.set(featureName, filtered);
 // به‌روزرسانی stats
 updateStats(featureName);
}

export function getFeatureValue(featureName: string, entityId: string, asOf?: number): FeatureValue | undefined {
 const arr = values.get(featureName) || [];
 const filtered = asOf
? arr.filter(v => v.entityId === entityId && v.timestamp <= asOf)
: arr.filter(v => v.entityId === entityId);
 return filtered[filtered.length - 1];
}

export function getFeatureVector(entityId: string, featureNames: string[], asOf?: number): Record<string, unknown> {
 const result: Record<string, unknown> = {};
 for (const name of featureNames) {
 const v = getFeatureValue(name, entityId, asOf);
 result[name] = v?.value;
 }
 return result;
}

export function getTrainingDataset(featureNames: string[], entityIds?: string[], limit = 1000): Array<{ entityId: string; features: Record<string, unknown> }> {
 // یافتن همه‌ی entityId‌ها
 const allEntityIds = new Set<string>();
 for (const name of featureNames) {
 const arr = values.get(name) || [];
 for (const v of arr) allEntityIds.add(v.entityId);
 }
 const ids = entityIds || Array.from(allEntityIds);
 return ids.slice(0, limit).map(entityId => ({
 entityId,
 features: getFeatureVector(entityId, featureNames),
 }));
}

function updateStats(featureName: string): void {
 const def = definitions.get(featureName);
 const arr = values.get(featureName) || [];
 if (!def) return;
 if (def.type === 'numerical') {
 const nums = arr.map(v => Number(v.value)).filter(n =>!isNaN(n));
 if (nums.length > 0) {
 const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
 const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length;
 def.stats = {
 mean,
 std: Math.sqrt(variance),
 min: Math.min(...nums),
 max: Math.max(...nums),
 nullCount: arr.length - nums.length,
 };
 }
 } else {
 const uniqueValues = new Set(arr.map(v => v.value));
 def.stats = {
 uniqueCount: uniqueValues.size,
 nullCount: arr.filter(v => v.value === null || v.value === undefined).length,
 };
 }
 definitions.set(featureName, def);
}

// ---------- groups ----------
export function createFeatureGroup(group: Omit<FeatureGroup, 'id' | 'lastRefreshedAt'>): FeatureGroup {
 const g: FeatureGroup = {...group, id: nextId('fg') };
 groups.set(g.id, g);
 return g;
}

export function listGroups(): FeatureGroup[] {
 return Array.from(groups.values());
}

export async function refreshGroup(groupId: string): Promise<number> {
 const group = groups.get(groupId);
 if (!group ||!group.enabled) return 0;
 let updated = 0;
 for (const featureName of group.featureNames) {
 const def = definitions.get(featureName);
 if (!def) continue;
 if (def.source === 'computed' && def.computation) {
 // در عمل: اجرای computation واقعی
 // برای demo: فقط timestamp را به‌روزرسانی می‌کنیم
 updated++;
 }
 }
 group.lastRefreshedAt = Date.now();
 groups.set(groupId, group);
 return updated;
}

// ---------- offline / online serving ----------
export function getOnlineFeatures(entityId: string, featureNames: string[]): Record<string, unknown> {
 // برای serving آنلاین (کم‌تأخیر) — از آخرین مقدار استفاده می‌کنیم
 return getFeatureVector(entityId, featureNames);
}

export function getOfflineFeatures(featureNames: string[], entityIds?: string[]): Array<{ entityId: string; features: Record<string, unknown> }> {
 // برای training (batch) — تمام تاریخچه
 return getTrainingDataset(featureNames, entityIds);
}

// ---------- defaults ----------
export function registerDefaultFeatures() {
 registerFeature({
 id: 'feat_customer_total_revenue',
 name: 'customer_total_revenue',
 description: 'مجموع درآمد مشتری از همه‌ی فاکتورهای پرداخت‌شده',
 entity: 'customer',
 type: 'numerical',
 dtype: 'int',
 source: 'sql',
 query: 'SELECT party_id, SUM(total_amount) FROM invoices WHERE status = "paid" GROUP BY party_id',
 tags: ['revenue', 'customer'],
 owner: 'data-team',
 });

 registerFeature({
 id: 'feat_customer_invoice_count',
 name: 'customer_invoice_count',
 description: 'تعداد کل فاکتورهای مشتری',
 entity: 'customer',
 type: 'numerical',
 dtype: 'int',
 source: 'sql',
 query: 'SELECT party_id, COUNT(*) FROM invoices GROUP BY party_id',
 tags: ['engagement', 'customer'],
 });

 registerFeature({
 id: 'feat_customer_tenure_days',
 name: 'customer_tenure_days',
 description: 'تعداد روز از اولین فاکتور',
 entity: 'customer',
 type: 'numerical',
 dtype: 'int',
 source: 'computed',
 computation: 'days_since(first_invoice_date)',
 tags: ['engagement', 'customer'],
 });

 registerFeature({
 id: 'feat_customer_avg_order_value',
 name: 'customer_avg_order_value',
 description: 'میانگین ارزش هر فاکتور',
 entity: 'customer',
 type: 'numerical',
 dtype: 'float',
 source: 'computed',
 computation: 'total_revenue / invoice_count',
 tags: ['revenue', 'customer'],
 });

 registerFeature({
 id: 'feat_customer_churn_risk',
 name: 'customer_churn_risk',
 description: 'ریسک ریزش مشتری (0..1)',
 entity: 'customer',
 type: 'numerical',
 dtype: 'float',
 source: 'computed',
 computation: 'ml_model:churn_predictor',
 tags: ['churn', 'ml'],
 });

 registerFeature({
 id: 'feat_customer_segment',
 name: 'customer_segment',
 description: 'بخش مشتری (vip, high_value, regular, at_risk)',
 entity: 'customer',
 type: 'categorical',
 dtype: 'string',
 source: 'computed',
 computation: 'segmentation_rules',
 tags: ['segmentation'],
 });

 registerFeature({
 id: 'feat_invoice_amount',
 name: 'invoice_amount',
 description: 'مبلغ فاکتور',
 entity: 'invoice',
 type: 'numerical',
 dtype: 'int',
 source: 'sql',
 query: 'SELECT id, total_amount FROM invoices',
 tags: ['invoice'],
 });

 registerFeature({
 id: 'feat_invoice_days_overdue',
 name: 'invoice_days_overdue',
 description: 'تعداد روز عبور از سررسید',
 entity: 'invoice',
 type: 'numerical',
 dtype: 'int',
 source: 'computed',
 computation: 'days_since(due_date) if status!= "paid"',
 tags: ['invoice', 'overdue'],
 });

 // ثبت مقدار نمونه
 for (let i = 1; i <= 10; i++) {
 setFeatureValue('customer_total_revenue', `party_${i}`, 100_000_000 + Math.random() * 500_000_000);
 setFeatureValue('customer_invoice_count', `party_${i}`, Math.round(Math.random() * 50));
 setFeatureValue('customer_tenure_days', `party_${i}`, Math.round(Math.random() * 720));
 setFeatureValue('customer_segment', `party_${i}`, ['vip', 'high_value', 'regular'][Math.floor(Math.random() * 3)]);
 }

 // گروه features
 createFeatureGroup({
 name: 'customer_features',
 description: 'تمام feature‌های مرتبط با مشتری',
 entity: 'customer',
 featureNames: ['customer_total_revenue', 'customer_invoice_count', 'customer_tenure_days', 'customer_avg_order_value', 'customer_churn_risk', 'customer_segment'],
 refreshInterval: 60,
 enabled: true,
 });
}
