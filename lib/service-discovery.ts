/**
 * هوش — Service Discovery
 * =============================================================
 * کشف و ثبت سرویس‌ها در یک محیط توزیع‌شده.
 *
 * - discoverService(name): یافتن URL و سلامت یک سرویس
 * - registerService(name, url): ثبت یک سرویس جدید
 * - healthCheckAll(): بررسی سلامت همه‌ی سرویس‌ها
 *
 * پیاده‌سازی: in-memory registry با TTL + heartbeat.
 * در production می‌توان با Consul یا etcd جایگزین کرد.
 */

// ============ Types ============

export interface ServiceInstance {
 name: string;
 url: string;
 healthy: boolean;
 registeredAt: number;
 lastHeartbeat: number;
 metadata?: Record<string, string>;
}

export interface HealthCheckResult {
 name: string;
 url: string;
 healthy: boolean;
 latencyMs?: number;
 error?: string;
 lastCheckedAt: number;
}

// ============ Registry ============

const registry = new Map<string, ServiceInstance>();
const HEALTH_CHECK_INTERVAL_MS = 30_000; // ۳۰ ثانیه
const HEARTBEAT_TTL_MS = 90_000; // ۹۰ ثانیه بدون heartbeat = unhealthy

// سرویس‌های پیش‌فرض اکوسیستم
const DEFAULT_SERVICES: Array<{ name: string; url: string }> = [
 { name: "nobatime", url: "https://nobatime.ir" },
 { name: "catalog", url: "https://catalog.nobatime.ir" },
 { name: "hesabyar", url: "https://hesabyar.ir" },
 { name: "hoshhesab-web", url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" },
 { name: "hoshhesab-api", url: process.env.API_URL || "http://localhost:3000/api" },
 { name: "realtime", url: "http://localhost:3003" },
];

// bootstrap: ثبت سرویس‌های پیش‌فرض
let bootstrapped = false;
function bootstrap(): void {
 if (bootstrapped) return;
 bootstrapped = true;
 for (const svc of DEFAULT_SERVICES) {
 if (!registry.has(svc.name)) {
 registerService(svc.name, svc.url);
 }
 }
}

// ============ Public API ============

/**
 * ثبت یک سرویس در registry.
 */
export async function registerService(
 name: string,
 url: string,
 metadata?: Record<string, string>
): Promise<void> {
 bootstrap();
 registry.set(name, {
 name,
 url,
 healthy: true,
 registeredAt: Date.now(),
 lastHeartbeat: Date.now(),
 metadata,
 });
}

/**
 * یافتن یک سرویس در registry.
 */
export async function discoverService(
 name: string
): Promise<{ url: string; healthy: boolean } | null> {
 bootstrap();
 const instance = registry.get(name);
 if (!instance) return null;
 // بررسی stale heartbeat
 const stale = Date.now() - instance.lastHeartbeat > HEARTBEAT_TTL_MS;
 return {
 url: instance.url,
 healthy: instance.healthy &&!stale,
 };
}

/**
 * ثبت heartbeat برای یک سرویس (به‌روزرسانی lastHeartbeat).
 */
export async function heartbeat(name: string): Promise<boolean> {
 const instance = registry.get(name);
 if (!instance) return false;
 instance.lastHeartbeat = Date.now();
 instance.healthy = true;
 return true;
}

/**
 * لغو ثبت یک سرویس.
 */
export async function deregisterService(name: string): Promise<void> {
 registry.delete(name);
}

/**
 * بررسی سلامت همه‌ی سرویس‌ها.
 */
export async function healthCheckAll(): Promise<HealthCheckResult[]> {
 bootstrap();
 const results: HealthCheckResult[] = [];

 const checks = Array.from(registry.values()).map(async (instance) => {
 const result = await checkServiceHealth(instance);
 // به‌روزرسانی registry
 instance.healthy = result.healthy;
 return result;
 });

 return Promise.all(checks);
}

/**
 * بررسی سلامت یک سرویس.
 */
export async function checkServiceHealth(
 instance: ServiceInstance
): Promise<HealthCheckResult> {
 const start = Date.now();
 const checkedAt = start;

 try {
 const url = `${instance.url}/api/health`;
 const res = await fetch(url, {
 method: "GET",
 signal: AbortSignal.timeout(5000),
 headers: { "User-Agent": "Hoosh-ServiceDiscovery/1.0" },
 });
 const latencyMs = Date.now() - start;
 const healthy = res.ok;
 return {
 name: instance.name,
 url: instance.url,
 healthy,
 latencyMs,
 lastCheckedAt: checkedAt,
...(healthy? {}: { error: `HTTP ${res.status}` }),
 };
 } catch (err) {
 const latencyMs = Date.now() - start;
 return {
 name: instance.name,
 url: instance.url,
 healthy: false,
 latencyMs,
 error: err instanceof Error? err.message: "unknown error",
 lastCheckedAt: checkedAt,
 };
 }
}

/**
 * دریافت همه‌ی سرویس‌های ثبت‌شده.
 */
export function listServices(): ServiceInstance[] {
 bootstrap();
 return Array.from(registry.values());
}

/**
 * دریافت یک سرویس خاص.
 */
export function getService(name: string): ServiceInstance | null {
 bootstrap();
 return registry.get(name) || null;
}

/**
 * کشف بهترین instance از یک سرویس (با کمترین latency).
 * در production با load balancing real پیاده می‌شود.
 */
export async function discoverBestInstance(
 name: string
): Promise<{ url: string; latencyMs: number } | null> {
 const instance = registry.get(name);
 if (!instance) return null;

 const health = await checkServiceHealth(instance);
 if (!health.healthy) return null;

 return {
 url: instance.url,
 latencyMs: health.latencyMs || 0,
 };
}

/**
 * شروع background health checker.
 */
let checkerInterval: NodeJS.Timeout | null = null;
export function startHealthChecker(): void {
 if (checkerInterval) return;
 bootstrap();
 checkerInterval = setInterval(async () => {
 try {
 await healthCheckAll();
 } catch (err) {
 console.error("[service-discovery] health check failed:", err);
 }
 }, HEALTH_CHECK_INTERVAL_MS);
 // اطمینان از توقف clean در shutdown
 if (checkerInterval.unref) checkerInterval.unref();
}

/**
 * توقف background health checker.
 */
export function stopHealthChecker(): void {
 if (checkerInterval) {
 clearInterval(checkerInterval);
 checkerInterval = null;
 }
}

/**
 * پاک کردن registry (برای تست).
 */
export function clearRegistry(): void {
 registry.clear();
 bootstrapped = false;
}
