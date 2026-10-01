"use client";

/**
 * use-offline-sync — وضعیت آنلاین + صف همگام‌سازی آفلاین
 * ============================================================================
 * API (مصرف‌شده در OfflineBanner):
 *   const { isOnline, serverOffline, pendingCount, syncing, lastSyncResult, syncNow } =
 *     useOfflineSync(token);
 *
 * - isOnline      — navigator.onLine + شنیدن online/offline
 * - serverOffline — مرورگر آنلاین است اما سرور جواب نمی‌دهد (پینگ /api/health)
 * - pendingCount  — تعداد درخواست‌های در صف آفلاین (IndexedDB از طریق idb)
 * - syncNow()     — ارسال مجدد صف + بازگشت نتیجه ({ ok, sent, failed })
 * - lastSyncResult — آخرین نتیجهٔ همگام‌سازی
 *
 * صف: درخواست‌های fetch ناموفقِ در حالت آفلاین (متد‌های تغییردهنده) در
 * IndexedDB ذخیره می‌شوند و با بازگشت آنلاین دوباره ارسال می‌شوند.
 * installSyncFetch در app-providers فعال می‌شود.
 */

import * as React from "react";
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "hoosh-offline";
const STORE = "outbox";
const DB_VERSION = 1;
const HEALTH_INTERVAL = 60 * 1000;

export interface OutboxItem {
  id?: number;
  url: string;
  method: string;
  body: string | null;
  contentType: string | null;
  createdAt: number;
  attempts: number;
}

export interface SyncResult {
  ok: boolean;
  sent: number;
  failed: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      },
    }).catch(() => null as unknown as IDBPDatabase);
  }
  return dbPromise;
}

export async function enqueueRequest(item: Omit<OutboxItem, "id" | "createdAt" | "attempts">) {
  try {
    const db = await getDB();
    if (!db) return;
    await db.add(STORE, { ...item, createdAt: Date.now(), attempts: 0 });
  } catch {
    /* ignore */
  }
}

async function countPending(): Promise<number> {
  try {
    const db = await getDB();
    if (!db) return 0;
    return await db.count(STORE);
  } catch {
    return 0;
  }
}

export function useOfflineSync(token: string | null) {
  const [isOnline, setIsOnline] = React.useState(true);
  const [serverOffline, setServerOffline] = React.useState(false);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const [lastSyncResult, setLastSyncResult] = React.useState<SyncResult | null>(null);

  // وضعیت آنلاین مرورگر
  React.useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // پینگ دوره‌ای سلامت سرور (فقط وقتی مرورگر آنلاین است)
  React.useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setServerOffline(false);
        return;
      }
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!cancelled) setServerOffline(!res.ok);
      } catch {
        if (!cancelled) setServerOffline(true);
      }
    };
    void ping();
    const iv = setInterval(ping, HEALTH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  // شمارش صف — ۳۰ ثانیه یک‌بار + هنگام تغییر آنلاین
  React.useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const n = await countPending();
      if (!cancelled) setPendingCount(n);
    };
    void refresh();
    const iv = setInterval(refresh, 30_000);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("online", refresh);
    };
  }, []);

  const syncNow = React.useCallback(async (): Promise<SyncResult> => {
    const result: SyncResult = { ok: true, sent: 0, failed: 0 };
    setSyncing(true);
    try {
      const db = await getDB();
      if (!db) return result;
      const items = (await db.getAll(STORE)) as OutboxItem[];
      for (const item of items) {
        try {
          const res = await fetch(item.url, {
            method: item.method,
            headers: {
              ...(item.contentType ? { "Content-Type": item.contentType } : {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: item.body,
          });
          if (res.ok || (res.status >= 400 && res.status < 500)) {
            // موفق یا خطای غیرقابل‌تلاش‌مجدد → حذف از صف
            if (item.id !== undefined) await db.delete(STORE, item.id);
            result.sent++;
          } else {
            result.failed++;
          }
        } catch {
          result.failed++;
          result.ok = false;
        }
      }
      setPendingCount(await countPending());
      setLastSyncResult(result);
      return result;
    } finally {
      setSyncing(false);
    }
  }, [token]);

  // همگام‌سازی خودکار هنگام بازگشت آنلاین
  const wasOnline = React.useRef(isOnline);
  React.useEffect(() => {
    if (wasOnline.current === false && isOnline) {
      void syncNow();
    }
    wasOnline.current = isOnline;
  }, [isOnline, syncNow]);

  return { isOnline, serverOffline, pendingCount, syncing, lastSyncResult, syncNow };
}

export default useOfflineSync;
