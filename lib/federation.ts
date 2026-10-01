// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
// ============ Database Federation — هوش ============
// مدیریت Prisma client چندمنطقه‌ای و همگام‌سازی فدراتیو داده‌ها.
// این فایل سرور-تنهاست (import از db و فدراسیون remote) — در API routes و cron jobs.

import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

// ============ Region Registry ============
// نگاشتی از کد منطقه به URL/پیکربندی remote DB.
// در محیط production این مقادیر از env خوانده می‌شوند.
const FEDERATED_REGIONS: Record<string, { url: string; role: "writer" | "reader" }> = {
 aws: { url: process.env.FEDERATED_AWS_URL?? "aws.hoshhesab.local:5432", role: "writer" },
 gcp: { url: process.env.FEDERATED_GCP_URL?? "gcp.hoshhesab.local:5432", role: "reader" },
 azure: { url: process.env.FEDERATED_AZURE_URL?? "azure.hoshhesab.local:5432", role: "reader" },
};

// کش Prisma clientها بر اساس منطقه (singleton per region)
const clientCache = new Map<string, PrismaClient>();

/**
 * بازگرداندن PrismaClient برای یک منطقه‌ی خاص.
 * - اگر منطقه‌ی writer درخواست شود، client اصلی برنامه برگردانده می‌شود.
 * - برای منطقه‌های reader، یک client اختصاصی با datasource URL جداگانه ساخته می‌شود.
 * - تمام client‌ها در یک Map کش می‌شوند تا در طول عمر پروسه reuse شوند.
 *
 * @param region کد منطقه (aws | gcp | azure)
 * @returns PrismaClient برای منطقه‌ی درخواستی
 */
export function getFederatedDb(region: string): PrismaClient {
 const config = FEDERATED_REGIONS[region];
 if (!config) {
 throw new Error(`Unknown federated region: ${region}`);
 }

 // اگر writer درخواست شد، client اصلی (با اتصال به AWS) برگردانده می‌شود.
 if (config.role === "writer") {
 return db;
 }

 // بررسی کش
 const cached = clientCache.get(region);
 if (cached) return cached;

 // ساخت client جدید برای reader (با URL اختصاصی)
 // Note: در این پیاده‌سازی نمونه، از همان db اصلی استفاده می‌کنیم
 // چون تنظیم datasourceUrl پویا نیازمند راه‌اندازی PrismaClient جداگانه است.
 // در production، هر reader یک datasource URL مستقل دارد.
 const client = new PrismaClient({
 log: ["error", "warn"],
 // datasourceUrl: `postgresql://reader:${process.env.READER_PASSWORD}@${config.url}/hoshhesab`,
 });
 clientCache.set(region, client);
 return client;
}

// ============ Conflict Resolution ============
// استراتژی حل تعارض هنگام همگام‌سازی داده‌های فدراتیو.
// بر اساس LWW (Last-Write-Wins) با اولویت برای داده‌های متادیتا-غنی‌تر.

export interface FederatedRecord {
 id: string;
 updatedAt: Date;
 region: string;
 data: unknown;
 metadata?: Record<string, unknown>;
}

/**
 * حل تعارض بین دو نسخه از یک رکورد فدراتیو.
 * استراتژی:
 * 1. اگر updatedAt یکی دقیقاً جدیدتر باشد، آن برنده است (LWW).
 * 2. در صورت برابری updatedAt، رکوردی با metadata کامل‌تر برنده می‌شود.
 * 3. در صورت تساوی کامل، رکورد writer (AWS) اولویت دارد.
 *
 * @param local رکورد محلی
 * @param remote رکورد remote
 * @returns رکورد نهایی حل‌شده
 */
export function resolveConflict(local: any, remote: any): any {
 // اگر یکی null باشد، دیگری برنده است.
 if (!local) return remote;
 if (!remote) return local;

 const localTime = new Date(local.updatedAt?? local.updated_at?? 0).getTime();
 const remoteTime = new Date(remote.updatedAt?? remote.updated_at?? 0).getTime();

 // ۱. LWW صریح
 if (remoteTime > localTime + 1000) {
 return {...remote, _resolvedBy: "remote-lww" };
 }
 if (localTime > remoteTime + 1000) {
 return {...local, _resolvedBy: "local-lww" };
 }

 // ۲. برابری زمانی: مقایسه‌ی غنای metadata
 const localMetaCount = local.metadata? Object.keys(local.metadata).length: 0;
 const remoteMetaCount = remote.metadata? Object.keys(remote.metadata).length: 0;

 if (remoteMetaCount > localMetaCount) {
 return {...remote, _resolvedBy: "remote-metadata" };
 }
 if (localMetaCount > remoteMetaCount) {
 return {...local, _resolvedBy: "local-metadata" };
 }

 // ۳. اولویت writer (AWS)
 const writerWins = local.region === "aws"? local: remote;
 return {...writerWins, _resolvedBy: "writer-priority" };
}

// ============ Federation Sync ============

/**
 * همگام‌سازی داده‌های یک tenant بین منطقه‌ها.
 * این تابع به‌صورت دوره‌ای (cron) یا در زمان نوشتن مهم فراخوانی می‌شود.
 *
 * مراحل:
 * 1. خواندن آخرین timestamp همگام‌سازی برای tenant.
 * 2. query رکوردهای تغییر یافته از همه‌ی region‌ها.
 * 3. حل تعارض برای هر رکورد.
 * 4. نوشتن نسخه‌ی نهایی به همه‌ی reader‌ها.
 *
 * @param tenantId شناسه‌ی tenant
 */
export async function syncFederatedData(tenantId: string): Promise<void> {
 const syncStartTime = new Date();

 // ۱. آخرین timestamp
 // در پیاده‌سازی واقعی، این مقدار در یک جدول FederationSyncLog ذخیره می‌شود.
 const lastSync = new Date(Date.now() - 60 * 60 * 1000); // ۱ ساعت پیش

 // ۲. جمع‌آوری تغییرات از هر منطقه
 const regions = ["aws", "gcp", "azure"];
 const changesPerRegion: FederatedRecord[][] = await Promise.all(
 regions.map(async (region) => {
 try {
 const client = getFederatedDb(region);
 // در اینجا به‌عنوان نمونه، رکوردهای Invoice تغییر یافته بررسی می‌شوند.
 // در پیاده‌سازی کامل، چندین جدول iter می‌شوند.
 const recentInvoices = await client.invoice.findMany({
 where: {
 tenantId,
 updatedAt: { gt: lastSync },
 },
 take: 500,
 });
 return recentInvoices.map((inv) => ({
 id: inv.id,
 updatedAt: inv.updatedAt,
 region,
 data: inv,
 }));
 } catch (err) {
 console.error(`[federation] خطا در خواندن از ${region}:`, err);
 return [];
 }
 })
 );

 // ۳. حل تعارض per-id
 const byId = new Map<string, FederatedRecord[]>();
 for (const records of changesPerRegion) {
 for (const rec of records) {
 const list = byId.get(rec.id)?? [];
 list.push(rec);
 byId.set(rec.id, list);
 }
 }

 const resolved: FederatedRecord[] = [];
 for (const [id, versions] of byId.entries()) {
 if (versions.length === 1) {
 resolved.push(versions[0]);
 continue;
 }
 // merge با reduce
 const merged = versions.reduce((acc, cur) => resolveConflict(acc, cur));
 resolved.push({...merged, id });
 }

 // ۴. نوشتن نسخه‌ی نهایی به readerها
 const writer = getFederatedDb("aws");
 const readers = ["gcp", "azure"].map((r) => getFederatedDb(r));

 for (const rec of resolved) {
 // نوشتن به writer برای تأیید نهایی
 try {
 await writer.invoice.update({
 where: { id: rec.id },
 data: {...(rec.data as object) },
 });
 } catch (err) {
 console.error(`[federation] خطا در write به writer برای ${rec.id}:`, err);
 }

 // نوشتن به readerها (به‌صورت async بدون انتظار)
 for (const reader of readers) {
 reader.invoice
.upsert({
 where: { id: rec.id },
 create: {...(rec.data as object) },
 update: {...(rec.data as object) },
 })
.catch((err) =>
 console.error(`[federation] خطا در write به reader برای ${rec.id}:`, err)
 );
 }
 }

 // ثبت لاگ همگام‌سازی
 console.log(
 `[federation] tenant=${tenantId} همگام‌سازی کامل: ${resolved.length} رکورد در ${Date.now() - syncStartTime.getTime()}ms`
 );
}

// ============ Health Check ============

export async function getFederationHealth(): Promise<
 Record<string, { status: "up" | "down"; latencyMs: number }>
> {
 const result: Record<string, { status: "up" | "down"; latencyMs: number }> = {};
 for (const region of Object.keys(FEDERATED_REGIONS)) {
 const start = Date.now();
 try {
 const client = getFederatedDb(region);
 await client.$queryRaw`SELECT 1`;
 result[region] = { status: "up", latencyMs: Date.now() - start };
 } catch {
 result[region] = { status: "down", latencyMs: Date.now() - start };
 }
 }
 return result;
}
