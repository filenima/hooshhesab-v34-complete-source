/**
 * هوش — Canary Deployment
 * =============================================================
 * Progressive Delivery با Canary Release.
 *
 * ۵٪ از کاربران نسخه‌ی canary را می‌بینند، بقیه stable.
 * اگر معیارهای سلامت (error rate، latency) در آستانه باشند، canary به stable promote می‌شود.
 *
 * استراتژی:
 * - hash(userId) % 100 < 5 canary
 * - track metrics (errors، latency، conversion)
 * - auto-promote اگر: errorRate < 1٪ و latency < baseline * 1.2
 */

import { createHash } from "crypto";

// ============ Types ============

export type CanaryVariant = "stable" | "canary";

export interface CanaryConfig {
 percentage: number; // درصد کاربرانی که canary می‌بینند (پیش‌فرض 5)
 errorThreshold: number; // حداکثر error rate مجاز (0-1) — پیش‌فرض 0.01
 latencyThresholdRatio: number; // حداکثر نسبت latency به baseline — پیش‌فرض 1.2
 minSampleSize: number; // حداقل تعداد نمونه برای تصمیم — پیش‌فرض 100
 evaluationWindowMs: number; // پنجره‌ی ارزیابی — پیش‌فرض ۱۰ دقیقه
}

const DEFAULT_CONFIG: CanaryConfig = {
 percentage: 5,
 errorThreshold: 0.01,
 latencyThresholdRatio: 1.2,
 minSampleSize: 100,
 evaluationWindowMs: 10 * 60 * 1000,
};

// ============ Variant Assignment ============

/**
 * تعیین variant برای یک کاربر.
 * پایدار: همان userId همیشه همان variant را می‌گیرد.
 */
export function getCanaryVariant(
 userId: string,
 config: Partial<CanaryConfig> = {}
): CanaryVariant {
 const cfg = {...DEFAULT_CONFIG,...config };
 const hash = createHash("md5").update(userId).digest("hex");
 const bucket = parseInt(hash.substring(0, 8), 16) % 100;
 return bucket < cfg.percentage? "canary": "stable";
}

/**
 * تعیین variant برای یک درخواست ناشناس (بر اساس IP).
 */
export function getCanaryVariantByIp(
 ip: string,
 config: Partial<CanaryConfig> = {}
): CanaryVariant {
 return getCanaryVariant(`ip:${ip}`, config);
}

// ============ Metrics Collection ============

interface MetricSample {
 variant: CanaryVariant;
 metric: string;
 value: number;
 timestamp: number;
}

// در production این باید در Redis یا Prometheus باشد
const metricsStore: MetricSample[] = [];
const MAX_STORE_SIZE = 100_000;

/**
 * ثبت یک metric برای یک variant.
 */
export function trackCanaryMetric(
 variant: CanaryVariant,
 metric: string,
 value: number
): void {
 metricsStore.push({
 variant,
 metric,
 value,
 timestamp: Date.now(),
 });

 // محدود کردن اندازه‌ی store
 if (metricsStore.length > MAX_STORE_SIZE) {
 metricsStore.splice(0, metricsStore.length - MAX_STORE_SIZE);
 }
}

/**
 * ثبت error برای یک variant.
 */
export function trackCanaryError(variant: CanaryVariant, errorType: string): void {
 trackCanaryMetric(variant, `error.${errorType}`, 1);
}

/**
 * ثبت latency برای یک variant.
 */
export function trackCanaryLatency(variant: CanaryVariant, latencyMs: number): void {
 trackCanaryMetric(variant, "latency", latencyMs);
}

// ============ Evaluation ============

export interface CanaryEvaluation {
 variant: CanaryVariant;
 sampleSize: number;
 errorRate: number;
 avgLatencyMs: number;
 p95LatencyMs: number;
 healthy: boolean;
}

/**
 * ارزیابی metrics برای یک variant در پنجره‌ی زمانی.
 */
export function evaluateVariant(
 variant: CanaryVariant,
 config: Partial<CanaryConfig> = {}
): CanaryEvaluation {
 const cfg = {...DEFAULT_CONFIG,...config };
 const now = Date.now();
 const since = now - cfg.evaluationWindowMs;

 const samples = metricsStore.filter(
 (s) => s.variant === variant && s.timestamp >= since
 );

 const latencySamples = samples
.filter((s) => s.metric === "latency")
.map((s) => s.value);
 const errorSamples = samples.filter((s) => s.metric.startsWith("error."));
 const totalRequests = latencySamples.length || 1;

 const errorRate = errorSamples.length / totalRequests;
 const avgLatency = latencySamples.length
? latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length
: 0;

 // محاسبه‌ی p95
 const sorted = [...latencySamples].sort((a, b) => a - b);
 const p95Index = Math.floor(sorted.length * 0.95);
 const p95Latency = sorted.length? sorted[p95Index] || 0: 0;

 return {
 variant,
 sampleSize: totalRequests,
 errorRate,
 avgLatencyMs: avgLatency,
 p95LatencyMs: p95Latency,
 healthy: errorRate <= cfg.errorThreshold,
 };
}

/**
 * تصمیم‌گیری برای promote کردن canary به stable.
 *
 * شروط:
 * ۱) sample size کافی باشد (≥ minSampleSize)
 * ۲) error rate canary ≤ errorThreshold
 * ۳) p95 latency canary ≤ baseline * latencyThresholdRatio
 */
export function shouldPromoteCanary(
 config: Partial<CanaryConfig> = {}
): { promote: boolean; reason: string; details: { stable: CanaryEvaluation; canary: CanaryEvaluation } } {
 const cfg = {...DEFAULT_CONFIG,...config };

 const stable = evaluateVariant("stable", cfg);
 const canary = evaluateVariant("canary", cfg);

 if (canary.sampleSize < cfg.minSampleSize) {
 return {
 promote: false,
 reason: `نمونه‌ی کافی نیست (canary=${canary.sampleSize}، لازم=${cfg.minSampleSize})`,
 details: { stable, canary },
 };
 }

 if (canary.errorRate > cfg.errorThreshold) {
 return {
 promote: false,
 reason: `error rate canary (${(canary.errorRate * 100).toFixed(2)}٪) بالاتر از آستانه (${(cfg.errorThreshold * 100).toFixed(2)}٪)`,
 details: { stable, canary },
 };
 }

 const latencyBaseline = stable.p95LatencyMs || 1000;
 if (canary.p95LatencyMs > latencyBaseline * cfg.latencyThresholdRatio) {
 return {
 promote: false,
 reason: `p95 latency canary (${canary.p95LatencyMs}ms) بالاتر از baseline * ${cfg.latencyThresholdRatio} (${latencyBaseline * cfg.latencyThresholdRatio}ms)`,
 details: { stable, canary },
 };
 }

 return {
 promote: true,
 reason: `canary سالم است — errorRate=${(canary.errorRate * 100).toFixed(2)}٪، p95=${canary.p95LatencyMs}ms`,
 details: { stable, canary },
 };
}

/**
 * rollback canary (در صورت شناسایی مشکل).
 */
export function rollbackCanary(): { rolledBack: boolean; timestamp: string } {
 // در production: این باید flag را در feature flag system به 0 برگرداند
 trackCanaryMetric("canary", "rollback", 1);
 return {
 rolledBack: true,
 timestamp: new Date().toISOString(),
 };
}

/**
 * دریافت خلاصه‌ی وضعیت canary برای داشبورد.
 */
export function getCanaryStatus(): {
 config: CanaryConfig;
 stable: CanaryEvaluation;
 canary: CanaryEvaluation;
 promotion: ReturnType<typeof shouldPromoteCanary>;
} {
 return {
 config: DEFAULT_CONFIG,
 stable: evaluateVariant("stable"),
 canary: evaluateVariant("canary"),
 promotion: shouldPromoteCanary(),
 };
}

/**
 * پاک کردن metrics (برای تست).
 */
export function clearCanaryMetrics(): void {
 metricsStore.length = 0;
}
