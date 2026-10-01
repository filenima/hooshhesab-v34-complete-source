/**
 * هوش — Database Sharding
 * =============================================================
 * Sharding مبتنی بر hash برای tenant shard mapping.
 *
 * هر tenant به یک shard نگاشته می‌شود؛ shardها به‌صورت separate SQLite files
 * (در محیط dev) یا separate PostgreSQL schemas/databases (در production) هستند.
 *
 * استراتژی:
 * - tenantId md5 hash first 8 hex chars mod SHARD_COUNT shard_N
 * - PrismaClient نمونه‌سازی شده برای هر shard کش می‌شود
 * - در production با DATABASE_URL_SHARD_0..N پیکربندی می‌شود
 */

import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

// تعداد shardها — باید با infrastructure هماهنگ باشد
export const SHARD_COUNT = Number(process.env.SHARD_COUNT) || 4;

// نگاشت shard name PrismaClient
const shardClients = new Map<string, PrismaClient>();

/**
 * تعیین shard برای tenant بر اساس hash.
 * پایدار: همان tenantId همیشه همان shard را می‌گیرد.
 */
export function getShardForTenant(tenantId: string): string {
 const hash = createHash("md5").update(tenantId).digest("hex");
 const shardNum = parseInt(hash.substring(0, 8), 16) % SHARD_COUNT;
 return `shard_${shardNum}`;
}

/**
 * تعیین shard بر اساس شناسه‌ی عددی (مثلاً برای تست).
 */
export function getShardByNumber(num: number): string {
 return `shard_${((num % SHARD_COUNT) + SHARD_COUNT) % SHARD_COUNT}`;
}

/**
 * لیست همه‌ی shardها.
 */
export function listAllShards(): string[] {
 return Array.from({ length: SHARD_COUNT }, (_, i) => `shard_${i}`);
}

/**
 * دریافت DATABASE_URL برای یک shard مشخص.
 * در production با env: DATABASE_URL_SHARD_0, DATABASE_URL_SHARD_1,...
 */
function getDatabaseUrlForShard(shardName: string): string {
 // استخراج shard number از نام
 const match = shardName.match(/^shard_(\d+)$/);
 if (!match) {
 throw new Error(`نام shard نامعتبر: ${shardName}`);
 }
 const shardNum = match[1];
 const envKey = `DATABASE_URL_SHARD_${shardNum}`;
 const url = process.env[envKey];
 if (url) return url;

 // fallback: اگر shard-specific env نباشد، از DATABASE_URL پیش‌فرض استفاده کن
 // (در dev فقط یک دیتابیس داریم)
 return process.env.DATABASE_URL || "file:./db/custom.db";
}

/**
 * دریافت PrismaClient صحیح برای tenant.
 * PrismaClient برای هر shard کش می‌شود تا overhead ساخت مجدد نباشد.
 */
export function getDbForTenant(tenantId: string): PrismaClient {
 const shardName = getShardForTenant(tenantId);
 return getDbForShard(shardName);
}

/**
 * دریافت PrismaClient برای shard مشخص.
 */
export function getDbForShard(shardName: string): PrismaClient {
 let client = shardClients.get(shardName);
 if (client) return client;

 const databaseUrl = getDatabaseUrlForShard(shardName);
 client = new PrismaClient({
 datasources: { db: { url: databaseUrl } },
 log: process.env.NODE_ENV!== "production"? ["error", "warn"]: ["error"],
 });

 shardClients.set(shardName, client);
 return client;
}

/**
 * دریافت shard master — کلاینت دیتابیس اصلی (برای queries cross-shard).
 */
export function getMasterDb(): PrismaClient {
 // import از lib/db برای استفاده از singleton موجود
 // (از dynamic import استفاده می‌کنیم تا circular dependency نباشد)
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const { db } = require("@/lib/db") as { db: PrismaClient };
 return db;
}

/**
 * بستن همه‌ی shard clients (برای graceful shutdown یا تست).
 */
export async function disconnectAllShards(): Promise<void> {
 const disconnects: Promise<void>[] = [];
 for (const client of shardClients.values()) {
 disconnects.push(client.$disconnect());
 }
 await Promise.all(disconnects);
 shardClients.clear();
}

/**
 * آمار توزیع tenants در shardها (برای مانیتورینگ rebalancing).
 */
export function getShardStats(): { shard: string; clientCount: number }[] {
 return listAllShards().map((shard) => ({
 shard,
 clientCount: shardClients.has(shard)? 1: 0,
 }));
}

/**
 * بررسی سلامت همه‌ی shardها.
 */
export async function healthCheckAllShards(): Promise<
 { shard: string; healthy: boolean; latencyMs?: number }[]
> {
 const results = await Promise.all(
 listAllShards().map(async (shard) => {
 try {
 const start = Date.now();
 const client = getDbForShard(shard);
 await client.$queryRaw`SELECT 1`;
 return { shard, healthy: true, latencyMs: Date.now() - start };
 } catch {
 return { shard, healthy: false };
 }
 })
 );
 return results;
}
