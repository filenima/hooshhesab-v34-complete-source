/**
 * هوش — Shared Search Index
 * =============================================================
 * ایندکس و جستجوی مشترک برای همه‌ی سرویس‌های اکوسیستم.
 *
 * - indexDocument(service, doc): افزودن یک سند به ایندکس
 * - searchAll(query): جستجو در همه‌ی سرویس‌ها
 *
 * پیاده‌سازی: in-memory inverted index با token-based search.
 * در production می‌توان با Meilisearch یا Elasticsearch جایگزین کرد.
 */

// ============ Types ============

export interface SearchDocument {
 id: string;
 title: string;
 body?: string;
 type?: string; // invoice, product, party, appointment,...
 tenantId?: string;
 url?: string;
 metadata?: Record<string, unknown>;
 createdAt?: number;
 updatedAt?: number;
}

export interface SearchResult {
 doc: SearchDocument;
 score: number;
 matchedFields: string[];
 service: string;
}

export interface ServiceSearchResult {
 service: string;
 results: SearchResult[];
 total: number;
 durationMs: number;
}

// ============ Index Storage ============

interface IndexedDoc {
 service: string;
 doc: SearchDocument;
 tokens: Map<string, number>; // token tf (term frequency)
 length: number; // تعداد tokenها برای normalization
 indexedAt: number;
}

const index = new Map<string, IndexedDoc>(); // key = service:docId
const invertedIndex = new Map<string, Set<string>>(); // token set of "service:docId"

// ============ Tokenization ============

/**
 * Tokenize یک متن به termها.
 * - lowercase
 * - حذف punctuation
 * - پشتیبانی از فارسی (بدون stemming ساده)
 */
function tokenize(text: string): string[] {
 if (!text) return [];
 const normalized = text.toLowerCase();
 // جدا کردن کلمات — شامل حروف فارسی و انگلیسی
 const tokens = normalized.match(/[\u0600-\u06FF\u0698\u06A9\u06AF\u06C0-\u06FFa-z0-9]+/g) || [];
 // حذف stop words فارسی و انگلیسی
 const stopWords = new Set([
 "و", "در", "به", "از", "که", "این", "را", "با", "است", "برای", "آن", "یک",
 "the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "in", "on",
 "at", "by", "for", "with", "about", "as", "into", "like", "through", "after",
 ]);
 return tokens.filter((t) =>!stopWords.has(t) && t.length > 1);
}

/**
 * محاسبه‌ی term frequency برای یک سند.
 */
function buildTermFrequency(tokens: string[]): Map<string, number> {
 const tf = new Map<string, number>();
 for (const token of tokens) {
 tf.set(token, (tf.get(token) || 0) + 1);
 }
 return tf;
}

// ============ Public API ============

/**
 * افزودن یا به‌روزرسانی یک سند در ایندکس.
 */
export async function indexDocument(
 service: string,
 doc: SearchDocument
): Promise<void> {
 const key = `${service}:${doc.id}`;

 // حذف ایندکس قبلی اگر وجود دارد
 await removeDocument(service, doc.id);

 // tokenize title + body
 const titleTokens = tokenize(doc.title);
 const bodyTokens = tokenize(doc.body || "");
 const allTokens = [...titleTokens,...bodyTokens];

 // title وزن بیشتری دارد (x3)
 const weightedTokens = [...titleTokens,...titleTokens,...titleTokens,...bodyTokens];
 const tf = buildTermFrequency(weightedTokens);

 const indexed: IndexedDoc = {
 service,
 doc: {
...doc,
 createdAt: doc.createdAt || Date.now(),
 updatedAt: Date.now(),
 },
 tokens: tf,
 length: allTokens.length || 1,
 indexedAt: Date.now(),
 };

 index.set(key, indexed);

 // به‌روزرسانی inverted index
 for (const token of tf.keys()) {
 if (!invertedIndex.has(token)) {
 invertedIndex.set(token, new Set());
 }
 invertedIndex.get(token)!.add(key);
 }
}

/**
 * حذف یک سند از ایندکس.
 */
export async function removeDocument(service: string, docId: string): Promise<void> {
 const key = `${service}:${docId}`;
 const existing = index.get(key);
 if (!existing) return;

 // حذف از inverted index
 for (const token of existing.tokens.keys()) {
 const set = invertedIndex.get(token);
 if (set) {
 set.delete(key);
 if (set.size === 0) {
 invertedIndex.delete(token);
 }
 }
 }

 index.delete(key);
}

/**
 * جستجو در همه‌ی سرویس‌ها.
 */
export async function searchAll(
 query: string,
 options: {
 services?: string[];
 tenantId?: string;
 limit?: number;
 type?: string;
 } = {}
): Promise<ServiceSearchResult[]> {
 const start = Date.now();
 const queryTokens = tokenize(query);

 if (queryTokens.length === 0) {
 return [];
 }

 const limit = options.limit || 10;

 // یافتن candidate documents (union of token matches)
 const candidateKeys = new Set<string>();
 for (const token of queryTokens) {
 const matching = invertedIndex.get(token);
 if (matching) {
 for (const key of matching) {
 candidateKeys.add(key);
 }
 }
 }

 // محاسبه‌ی score برای هر candidate
 const scoredResults: SearchResult[] = [];
 for (const key of candidateKeys) {
 const indexed = index.get(key);
 if (!indexed) continue;

 // فیلتر service
 if (options.services &&!options.services.includes(indexed.service)) continue;
 // فیلتر tenant
 if (options.tenantId && indexed.doc.tenantId!== options.tenantId) continue;
 // فیلتر type
 if (options.type && indexed.doc.type!== options.type) continue;

 let score = 0;
 const matchedFields: string[] = [];

 for (const token of queryTokens) {
 const tf = indexed.tokens.get(token);
 if (tf) {
 // TF-IDF-like scoring (ساده)
 const idf = Math.log((index.size + 1) / ((invertedIndex.get(token)?.size || 1) + 1)) + 1;
 score += tf * idf;
 matchedFields.push(token);
 }
 }

 if (score > 0) {
 // normalize by document length
 score = score / Math.sqrt(indexed.length);
 scoredResults.push({
 doc: indexed.doc,
 score,
 matchedFields,
 service: indexed.service,
 });
 }
 }

 // sort by score desc
 scoredResults.sort((a, b) => b.score - a.score);

 // group by service
 const byService = new Map<string, SearchResult[]>();
 for (const result of scoredResults) {
 if (!byService.has(result.service)) {
 byService.set(result.service, []);
 }
 byService.get(result.service)!.push(result);
 }

 const results: ServiceSearchResult[] = [];
 for (const [service, serviceResults] of byService.entries()) {
 results.push({
 service,
 results: serviceResults.slice(0, limit),
 total: serviceResults.length,
 durationMs: Date.now() - start,
 });
 }

 // sort services by total results
 results.sort((a, b) => b.total - a.total);

 return results;
}

/**
 * جستجو در یک سرویس خاص.
 */
export async function searchInService(
 service: string,
 query: string,
 options: { limit?: number; tenantId?: string } = {}
): Promise<ServiceSearchResult> {
 const results = await searchAll(query, {
 services: [service],
 tenantId: options.tenantId,
 limit: options.limit,
 });
 return results[0] || { service, results: [], total: 0, durationMs: 0 };
}

/**
 * دریافت تعداد اسناد ایندکس‌شده در هر سرویس.
 */
export function getIndexStats(): { service: string; count: number }[] {
 const counts = new Map<string, number>();
 for (const indexed of index.values()) {
 counts.set(indexed.service, (counts.get(indexed.service) || 0) + 1);
 }
 return Array.from(counts.entries()).map(([service, count]) => ({ service, count }));
}

/**
 * پاک کردن ایندکس یک سرویس.
 */
export async function clearServiceIndex(service: string): Promise<number> {
 let count = 0;
 const keysToDelete: string[] = [];
 for (const [key, indexed] of index.entries()) {
 if (indexed.service === service) {
 keysToDelete.push(key);
 count++;
 }
 }
 for (const key of keysToDelete) {
 const [service, docId] = key.split(":");
 await removeDocument(service, docId);
 }
 return count;
}

/**
 * پاک کردن کل ایندکس (برای تست).
 */
export function clearAllIndexes(): void {
 index.clear();
 invertedIndex.clear();
}

/**
 * Seed ایندکس با داده‌های نمونه (برای demo).
 */
export async function seedDemoIndex(): Promise<void> {
 const demoDocs: Array<{ service: string; doc: SearchDocument }> = [
 {
 service: "hoshhesab",
 doc: {
 id: "inv-1",
 title: "فاکتور فروش شماره ۱۰۳۴",
 body: "فاکتور فروش به شرکت پارس نوین برای ۵ دستگاه لپ‌تاپ",
 type: "invoice",
 url: "/dashboard/invoices/1034",
 },
 },
 {
 service: "nobatime",
 doc: {
 id: "apt-1",
 title: "نوبت جلسه با مشتری",
 body: "جلسه با آقای رضایی برای بررسی گزارش مالی",
 type: "appointment",
 url: "/nobatime/appointments/apt-1",
 },
 },
 {
 service: "catalog",
 doc: {
 id: "prod-1",
 title: "لپ‌تاپ ۱۵ اینچی مدل X",
 body: "لپ‌تاپ با پردازنده Core i7 و حافظه ۱۶ گیگابایت",
 type: "product",
 url: "/catalog/products/prod-1",
 },
 },
 ];

 for (const { service, doc } of demoDocs) {
 await indexDocument(service, doc);
 }
}
