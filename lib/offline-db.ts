/**
 * offline-db — wrapper IndexedDB برای ذخیره‌سازی آفلاین هوش
 *
 * دو store اصلی دارد:
 * - queuedActions: درخواست‌های POST/PATCH/DELETE که هنگام آفلاین صف می‌شوند
 * و هنگام اتصال مجدد replay می‌شوند.
 * - responseCache: پاسخ GET را برای مشاهده آفلاین کش می‌کند.
 *
 * Install: bun add idb
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "hoshhesab-offline";
const DB_VERSION = 1;
const ACTIONS_STORE = "queuedActions";
const CACHE_STORE = "responseCache";

export interface QueuedAction {
 id: string;
 url: string;
 method: "POST" | "PATCH" | "PUT" | "DELETE";
 body?: unknown;
 headers?: Record<string, string>;
 queuedAt: number;
 attempts: number;
 lastError?: string;
}

interface CacheEntry {
 key: string;
 data: unknown;
 cachedAt: number;
 ttlMs?: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export async function initOfflineDB(): Promise<IDBPDatabase> {
 if (typeof indexedDB === "undefined") {
 throw new Error("IndexedDB در این محیط پشتیبانی نمی‌شود");
 }
 if (!dbPromise) {
 dbPromise = openDB(DB_NAME, DB_VERSION, {
 upgrade(db) {
 if (!db.objectStoreNames.contains(ACTIONS_STORE)) {
 const store = db.createObjectStore(ACTIONS_STORE, { keyPath: "id" });
 store.createIndex("queuedAt", "queuedAt");
 }
 if (!db.objectStoreNames.contains(CACHE_STORE)) {
 const store = db.createObjectStore(CACHE_STORE, { keyPath: "key" });
 store.createIndex("cachedAt", "cachedAt");
 }
 },
 });
 }
 return dbPromise;
}

function generateId(): string {
 if (typeof crypto!== "undefined" && crypto.randomUUID) {
 return crypto.randomUUID();
 }
 return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ============ Queued actions ============ */

export async function saveOfflineAction(
 action: Omit<QueuedAction, "id" | "queuedAt" | "attempts">
): Promise<string> {
 const db = await initOfflineDB();
 const id = generateId();
 const record: QueuedAction = {
...action,
 id,
 queuedAt: Date.now(),
 attempts: 0,
 };
 await db.put(ACTIONS_STORE, record);
 return id;
}

export async function getOfflineActions(): Promise<QueuedAction[]> {
 const db = await initOfflineDB();
 const all = (await db.getAllFromIndex(
 ACTIONS_STORE,
 "queuedAt"
 )) as QueuedAction[];
 return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function removeOfflineAction(id: string): Promise<void> {
 const db = await initOfflineDB();
 await db.delete(ACTIONS_STORE, id);
}

export async function updateOfflineAction(
 id: string,
 patch: Partial<QueuedAction>
): Promise<void> {
 const db = await initOfflineDB();
 const existing = (await db.get(ACTIONS_STORE, id)) as QueuedAction | undefined;
 if (!existing) return;
 await db.put(ACTIONS_STORE, {...existing,...patch });
}

export async function clearOfflineActions(): Promise<void> {
 const db = await initOfflineDB();
 await db.clear(ACTIONS_STORE);
}

/* ============ Response cache ============ */

export async function saveOfflineCache(
 key: string,
 data: unknown,
 ttlMs?: number
): Promise<void> {
 const db = await initOfflineDB();
 const entry: CacheEntry = {
 key,
 data,
 cachedAt: Date.now(),
 ttlMs,
 };
 await db.put(CACHE_STORE, entry);
}

export async function getOfflineCache(key: string): Promise<unknown | null> {
 const db = await initOfflineDB();
 const entry = (await db.get(CACHE_STORE, key)) as CacheEntry | undefined;
 if (!entry) return null;
 if (entry.ttlMs && Date.now() - entry.cachedAt > entry.ttlMs) {
 await db.delete(CACHE_STORE, key);
 return null;
 }
 return entry.data;
}

export async function clearOfflineCache(): Promise<void> {
 const db = await initOfflineDB();
 await db.clear(CACHE_STORE);
}

/* ============ Replay/sync helper ============ */

export interface ReplayResult {
 total: number;
 succeeded: number;
 failed: number;
 errors: { id: string; url: string; error: string }[];
}

/**
 * replayQueuedActions — replay تمام اکشن‌های در صف با fetch واقعی
 * @param token توکن احراز هویت برای ارسال در header
 */
export async function replayQueuedActions(
 token: string | null
): Promise<ReplayResult> {
 const actions = await getOfflineActions();
 const result: ReplayResult = {
 total: actions.length,
 succeeded: 0,
 failed: 0,
 errors: [],
 };

 for (const action of actions) {
 try {
 const headers: Record<string, string> = {
 "Content-Type": "application/json",
...action.headers,
 };
 if (token) headers.Authorization = `Bearer ${token}`;

 const res = await fetch(action.url, {
 method: action.method,
 headers,
 body: action.body? JSON.stringify(action.body): undefined,
 });

 if (res.status >= 500) {
 // خطای سرور — نگه می‌داریم برای تلاش بعدی
 throw new Error(`Server error: ${res.status}`);
 }
 if (res.status === 401 || res.status === 403) {
 // FIX(v8/H3): نشست منقضی در حالت آفلاین طبیعی است — اکشن «حذف نمی‌شود»؛
 // نگه می‌داریم تا بعد از لاگین مجدد دوباره ارسال شود (حذف قبلی = از دست
 // رفتن بی‌صدای فاکتور واقعی کاربر). سقف تلاش برای جلوگیری از حلقه بی‌نهایت.
 if (action.attempts + 1 >= 5) {
 await removeOfflineAction(action.id);
 result.failed++;
 result.errors.push({
 id: action.id,
 url: action.url,
 error: `HTTP ${res.status} پس از ۵ تلاش — نشست بازنشانی نشد`,
 });
 } else {
 await updateOfflineAction(action.id, {
 attempts: action.attempts + 1,
 lastError: `HTTP ${res.status} — نشست منقضی، منتظر لاگین مجدد`,
 });
 result.errors.push({ id: action.id, url: action.url, error: `HTTP ${res.status}` });
 }
 continue;
 }
 if (res.status >= 400) {
 // خطای کلاینت — احتمالاً اکشن نامعتبر، حذف می‌کنیم
 const text = await res.text().catch(() => "");
 result.errors.push({
 id: action.id,
 url: action.url,
 error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
 });
 await removeOfflineAction(action.id);
 result.failed++;
 continue;
 }

 await removeOfflineAction(action.id);
 result.succeeded++;
 } catch (err) {
 const msg = err instanceof Error? err.message: String(err);
 await updateOfflineAction(action.id, {
 attempts: action.attempts + 1,
 lastError: msg,
 });
 result.errors.push({ id: action.id, url: action.url, error: msg });
 result.failed++;
 // در صورت خطای شبکه، توقف replay بقیه
 if (msg.includes("fetch") || msg.includes("network")) {
 break;
 }
 }
 }

 return result;
}
