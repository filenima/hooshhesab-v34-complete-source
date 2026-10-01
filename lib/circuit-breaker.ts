/**
 * هوش — Circuit Breaker
 * =============================================================
 * الگوی Circuit Breaker برای محافظت از سرویس‌های downstream.
 *
 * حالت‌ها:
 * - closed: درخواست‌ها عبور می‌کنند. اگر failure threshold رسید open
 * - open: درخواست‌ها reject می‌شوند. بعد از resetTimeout half-open
 * - half-open: تعداد محدود درخواست آزمایشی. اگر موفق closed، در غیر این صورت open
 *
 * Usage:
 * const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 });
 * const result = await breaker.execute(() => fetchExternalService());
 */

// ============ Types ============

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
 failureThreshold: number; // تعداد failure متوالی برای open شدن
 resetTimeout: number; // مدت زمان قبل از half-open (ms)
 monitoringPeriod: number; // پنجره‌ی monitoring (ms)
 halfOpenMaxCalls: number; // حداکثر درخواست‌های آزمایشی در half-open
 successThreshold: number; // تعداد success متوالی برای closed شدن از half-open
}

export interface CircuitBreakerStats {
 state: CircuitState;
 failureCount: number;
 successCount: number;
 totalCalls: number;
 totalFailures: number;
 lastFailureTime?: number;
 lastSuccessTime?: number;
 openedAt?: number;
}

// ============ Errors ============

export class CircuitOpenError extends Error {
 constructor(
 message: string,
 public readonly state: CircuitState,
 public readonly retryAfterMs: number
 ) {
 super(message);
 this.name = "CircuitOpenError";
 }
}

// ============ CircuitBreaker ============

export class CircuitBreaker {
 private state: CircuitState = "closed";
 private failureCount = 0;
 private successCount = 0;
 private totalCalls = 0;
 private totalFailures = 0;
 private lastFailureTime?: number;
 private lastSuccessTime?: number;
 private openedAt?: number;
 private halfOpenCalls = 0;
 private options: CircuitBreakerOptions;

 constructor(options: Partial<CircuitBreakerOptions> = {}) {
 this.options = {
 failureThreshold: options.failureThreshold?? 5,
 resetTimeout: options.resetTimeout?? 30_000,
 monitoringPeriod: options.monitoringPeriod?? 60_000,
 halfOpenMaxCalls: options.halfOpenMaxCalls?? 3,
 successThreshold: options.successThreshold?? 2,
 };
 }

 /**
 * اجرای یک تابع با حفاظت circuit breaker.
 * اگر circuit باز باشد، درخواست reject می‌شود.
 */
 async execute<T>(fn: () => Promise<T>): Promise<T> {
 this.checkState();

 if (this.state === "open") {
 const retryAfter = this.getRetryAfterMs();
 throw new CircuitOpenError(
 `Circuit breaker is OPEN — retry after ${retryAfter}ms`,
 this.state,
 retryAfter
 );
 }

 if (this.state === "half-open" && this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
 throw new CircuitOpenError(
 `Circuit breaker is HALF-OPEN and at max calls — retry later`,
 this.state,
 1000
 );
 }

 if (this.state === "half-open") {
 this.halfOpenCalls++;
 }

 this.totalCalls++;

 try {
 const result = await fn();
 this.onSuccess();
 return result;
 } catch (err) {
 this.onFailure();
 throw err;
 }
 }

 /**
 * دریافت وضعیت فعلی.
 */
 getState(): CircuitState {
 this.checkState();
 return this.state;
 }

 /**
 * دریافت آمار کامل.
 */
 getStats(): CircuitBreakerStats {
 return {
 state: this.state,
 failureCount: this.failureCount,
 successCount: this.successCount,
 totalCalls: this.totalCalls,
 totalFailures: this.totalFailures,
 lastFailureTime: this.lastFailureTime,
 lastSuccessTime: this.lastSuccessTime,
 openedAt: this.openedAt,
 };
 }

 /**
 * بازنشانی circuit breaker به حالت closed.
 */
 reset(): void {
 this.state = "closed";
 this.failureCount = 0;
 this.successCount = 0;
 this.halfOpenCalls = 0;
 this.openedAt = undefined;
 }

 /**
 * اجبار به باز کردن circuit (برای maintenance).
 */
 forceOpen(): void {
 this.state = "open";
 this.openedAt = Date.now();
 }

 // ============ Internal ============

 private checkState(): void {
 if (this.state === "open" && this.openedAt) {
 const elapsed = Date.now() - this.openedAt;
 if (elapsed >= this.options.resetTimeout) {
 // transition to half-open
 this.state = "half-open";
 this.halfOpenCalls = 0;
 this.failureCount = 0;
 this.successCount = 0;
 }
 }
 }

 private onSuccess(): void {
 this.lastSuccessTime = Date.now();
 if (this.state === "half-open") {
 this.successCount++;
 if (this.successCount >= this.options.successThreshold) {
 // close the circuit
 this.state = "closed";
 this.failureCount = 0;
 this.halfOpenCalls = 0;
 }
 } else if (this.state === "closed") {
 // reset failure count on success
 this.failureCount = 0;
 }
 }

 private onFailure(): void {
 this.totalFailures++;
 this.lastFailureTime = Date.now();
 this.failureCount++;

 if (this.state === "half-open") {
 // immediately open on failure during half-open
 this.state = "open";
 this.openedAt = Date.now();
 this.halfOpenCalls = 0;
 } else if (this.state === "closed" && this.failureCount >= this.options.failureThreshold) {
 // open the circuit
 this.state = "open";
 this.openedAt = Date.now();
 }
 }

 private getRetryAfterMs(): number {
 if (!this.openedAt) return 0;
 const elapsed = Date.now() - this.openedAt;
 return Math.max(0, this.options.resetTimeout - elapsed);
 }
}

// ============ Registry (named breakers) ============

const breakers = new Map<string, CircuitBreaker>();

/**
 * دریافت یا ساخت circuit breaker با نام.
 */
export function getCircuitBreaker(
 name: string,
 options?: Partial<CircuitBreakerOptions>
): CircuitBreaker {
 let breaker = breakers.get(name);
 if (!breaker) {
 breaker = new CircuitBreaker(options);
 breakers.set(name, breaker);
 }
 return breaker;
}

/**
 * دریافت وضعیت همه‌ی breakerها.
 */
export function getAllBreakerStats(): Record<string, CircuitBreakerStats> {
 const result: Record<string, CircuitBreakerStats> = {};
 for (const [name, breaker] of breakers.entries()) {
 result[name] = breaker.getStats();
 }
 return result;
}
