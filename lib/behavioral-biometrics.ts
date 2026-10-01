// ============ Behavioral Biometrics — Continuous Authentication ============
// تحلیل الگوهای رفتاری کاربر برای احراز هویت پیوسته:
// - سرعت و ریتم تایپ (keystroke dynamics)
// - الگوی حرکت ماوس (mouse movement patterns)
// - رفتار اسکرول (scroll patterns)
// - سرعت کلیک و فاصله‌ی بین کلیک‌ها
//
// اگر الگوی فعلی با الگوی ثبت‌شده‌ی کاربر تطابق نداشته باشد، سیستم می‌تواند
// اقدامات امنیتی انجام دهد (درخواست احراز مجدد، هشدار به ادمین و...).
//
// این کلاس در سمت کلاینت اجرا می‌شود و profile را در حافظه نگه می‌دارد.

export interface KeystrokeEvent {
 key: string;
 timestamp: number;
 // زمان فشار دادن کلید قبلی تا این کلید (dwell time)
 dwellTime?: number;
 // زمان بین رها کردن کلید قبلی تا فشار این کلید (flight time)
 flightTime?: number;
}

export interface MouseEvent {
 x: number;
 y: number;
 timestamp: number;
}

export interface ScrollEvent {
 position: number;
 timestamp: number;
}

export interface BehavioralProfile {
 // میانگین و انحراف معیار زمان تایپ هر کلید (ms)
 avgDwellTime: number;
 stdDwellTime: number;
 // میانگین فاصله‌ی بین کلیدها (ms)
 avgFlightTime: number;
 stdFlightTime: number;
 // سرعت تایپ (کلمه بر دقیقه)
 typingSpeedWPM: number;
 // میانگین مسافت حرکت ماوس بین دو نمونه (پیکسل)
 avgMouseDistance: number;
 // میانگین سرعت ماوس (پیکسل بر ms)
 avgMouseSpeed: number;
 // میانگین جهت حرکت ماوس (رادیان) — برای تشخیص الگوی مستقیم vs منحنی
 avgMouseAngle: number;
 // میانگین فاصله‌ی اسکرول بین رویدادها
 avgScrollDistance: number;
 // مجموع زمان فعالیت (ms)
 totalActivityMs: number;
 // تعداد کل رویدادها
 totalEvents: number;
 // timestamp ایجاد پروفایل
 capturedAt: number;
}

export interface ComparisonResult {
 match: boolean;
 confidence: number; // 0..1
 deviations: {
 dwellTime?: number; // درصد انحراف
 flightTime?: number;
 typingSpeed?: number;
 mouseSpeed?: number;
 scrollDistance?: number;
 };
 recommendation: "allow" | "challenge" | "block";
}

// آستانه‌های تطابق (قابل تنظیم)
const DEFAULT_THRESHOLDS = {
 minSamples: 30, // حداقل رویداد برای ساخت پروفایل معتبر
 confidenceThreshold: 0.7, // آستانه‌ی تطابق
 challengeThreshold: 0.5, // زیر این مقدار، احراز مجدد لازم است
 blockThreshold: 0.3, // زیر این مقدار، خطرناک
 maxDeviationPercent: 50, // انحراف مجاز برای هر ویژگی
};

export class BehavioralTracker {
 private keystrokes: KeystrokeEvent[] = [];
 private mouseEvents: MouseEvent[] = [];
 private scrollEvents: ScrollEvent[] = [];
 private lastKeyTime: { key: string; time: number } | null = null;
 private keyDownTime: Map<string, number> = new Map();
 private thresholds = DEFAULT_THRESHOLDS;

 constructor(thresholds?: Partial<typeof DEFAULT_THRESHOLDS>) {
 if (thresholds) {
 this.thresholds = {...DEFAULT_THRESHOLDS,...thresholds };
 }
 }

 // ثبت فشردن کلید
 trackKeystrokeDown(key: string, timestamp: number): void {
 this.keyDownTime.set(key, timestamp);
 }

 // ثبت رها کردن کلید (با محاسبه‌ی dwell و flight time)
 trackKeystroke(key: string, timestamp: number): void {
 const downTime = this.keyDownTime.get(key);
 const dwellTime = downTime? timestamp - downTime: 0;

 let flightTime: number | undefined;
 if (this.lastKeyTime) {
 flightTime = timestamp - this.lastKeyTime.time;
 }

 this.keystrokes.push({ key, timestamp, dwellTime, flightTime });
 this.lastKeyTime = { key, time: timestamp };

 // نگهداری فقط ۱۰۰۰ رویداد اخیر برای مدیریت حافظه
 if (this.keystrokes.length > 1000) {
 this.keystrokes = this.keystrokes.slice(-1000);
 }

 this.keyDownTime.delete(key);
 }

 // ثبت حرکت ماوس
 trackMouseMovement(x: number, y: number, timestamp: number): void {
 this.mouseEvents.push({ x, y, timestamp });

 // نگهداری فقط ۵۰۰ رویداد اخیر
 if (this.mouseEvents.length > 500) {
 this.mouseEvents = this.mouseEvents.slice(-500);
 }
 }

 // ثبت اسکرول
 trackScroll(position: number, timestamp: number): void {
 this.scrollEvents.push({ position, timestamp });
 if (this.scrollEvents.length > 200) {
 this.scrollEvents = this.scrollEvents.slice(-200);
 }
 }

 // ساخت پروفایل رفتاری فعلی
 getProfile(): BehavioralProfile {
 const profile: BehavioralProfile = {
 avgDwellTime: 0,
 stdDwellTime: 0,
 avgFlightTime: 0,
 stdFlightTime: 0,
 typingSpeedWPM: 0,
 avgMouseDistance: 0,
 avgMouseSpeed: 0,
 avgMouseAngle: 0,
 avgScrollDistance: 0,
 totalActivityMs: 0,
 totalEvents: 0,
 capturedAt: Date.now(),
 };

 // محاسبه‌ی آمار keystroke
 if (this.keystrokes.length > 0) {
 const dwellTimes = this.keystrokes
.map((k) => k.dwellTime?? 0)
.filter((d) => d > 0);
 const flightTimes = this.keystrokes
.map((k) => k.flightTime?? 0)
.filter((f) => f > 0);

 if (dwellTimes.length > 0) {
 profile.avgDwellTime = mean(dwellTimes);
 profile.stdDwellTime = stddev(dwellTimes);
 }
 if (flightTimes.length > 0) {
 profile.avgFlightTime = mean(flightTimes);
 profile.stdFlightTime = stddev(flightTimes);
 }

 // سرعت تایپ: میانگین flight time کلمه در دقیقه
 // یک کلمه ≈ ۵ کاراکتر، ۱ دقیقه = ۶۰٬۰۰۰ ms
 if (profile.avgFlightTime > 0) {
 profile.typingSpeedWPM = (60_000 / profile.avgFlightTime) * (1 / 5);
 }

 // زمان کل فعالیت
 const firstK = this.keystrokes[0]?.timestamp?? 0;
 const lastK = this.keystrokes[this.keystrokes.length - 1]?.timestamp?? 0;
 profile.totalActivityMs = Math.max(profile.totalActivityMs, lastK - firstK);
 }

 // محاسبه‌ی آمار ماوس
 if (this.mouseEvents.length > 1) {
 const distances: number[] = [];
 const speeds: number[] = [];
 const angles: number[] = [];

 for (let i = 1; i < this.mouseEvents.length; i++) {
 const prev = this.mouseEvents[i - 1];
 const curr = this.mouseEvents[i];
 const dx = curr.x - prev.x;
 const dy = curr.y - prev.y;
 const dist = Math.sqrt(dx * dx + dy * dy);
 const dt = curr.timestamp - prev.timestamp;

 if (dist > 0) {
 distances.push(dist);
 if (dt > 0) speeds.push(dist / dt);
 angles.push(Math.atan2(dy, dx));
 }
 }

 if (distances.length > 0) {
 profile.avgMouseDistance = mean(distances);
 profile.avgMouseSpeed = mean(speeds);
 profile.avgMouseAngle = mean(angles);
 }

 const firstM = this.mouseEvents[0]?.timestamp?? 0;
 const lastM = this.mouseEvents[this.mouseEvents.length - 1]?.timestamp?? 0;
 profile.totalActivityMs = Math.max(profile.totalActivityMs, lastM - firstM);
 }

 // محاسبه‌ی آمار اسکرول
 if (this.scrollEvents.length > 1) {
 const scrollDistances: number[] = [];
 for (let i = 1; i < this.scrollEvents.length; i++) {
 scrollDistances.push(
 Math.abs(this.scrollEvents[i].position - this.scrollEvents[i - 1].position)
 );
 }
 if (scrollDistances.length > 0) {
 profile.avgScrollDistance = mean(scrollDistances);
 }
 }

 profile.totalEvents =
 this.keystrokes.length +
 this.mouseEvents.length +
 this.scrollEvents.length;

 return profile;
 }

 // مقایسه‌ی پروفایل فعلی با پروفایل ثبت‌شده
 compareProfile(
 current: BehavioralProfile,
 stored: BehavioralProfile
 ): ComparisonResult {
 const deviations: ComparisonResult["deviations"] = {};
 let totalDeviation = 0;
 let factorsCount = 0;

 // مقایسه‌ی dwell time
 if (stored.avgDwellTime > 0 && current.avgDwellTime > 0) {
 const dev = percentDeviation(current.avgDwellTime, stored.avgDwellTime);
 deviations.dwellTime = dev;
 totalDeviation += dev;
 factorsCount++;
 }

 // مقایسه‌ی flight time
 if (stored.avgFlightTime > 0 && current.avgFlightTime > 0) {
 const dev = percentDeviation(current.avgFlightTime, stored.avgFlightTime);
 deviations.flightTime = dev;
 totalDeviation += dev;
 factorsCount++;
 }

 // مقایسه‌ی سرعت تایپ
 if (stored.typingSpeedWPM > 0 && current.typingSpeedWPM > 0) {
 const dev = percentDeviation(current.typingSpeedWPM, stored.typingSpeedWPM);
 deviations.typingSpeed = dev;
 totalDeviation += dev;
 factorsCount++;
 }

 // مقایسه‌ی سرعت ماوس
 if (stored.avgMouseSpeed > 0 && current.avgMouseSpeed > 0) {
 const dev = percentDeviation(current.avgMouseSpeed, stored.avgMouseSpeed);
 deviations.mouseSpeed = dev;
 totalDeviation += dev;
 factorsCount++;
 }

 // مقایسه‌ی فاصله‌ی اسکرول
 if (stored.avgScrollDistance > 0 && current.avgScrollDistance > 0) {
 const dev = percentDeviation(
 current.avgScrollDistance,
 stored.avgScrollDistance
 );
 deviations.scrollDistance = dev;
 totalDeviation += dev;
 factorsCount++;
 }

 // اگر داده‌ی کافی نبود
 if (factorsCount === 0) {
 return {
 match: true, // در صورت نبود داده، محدود نمی‌کنیم
 confidence: 0.5,
 deviations,
 recommendation: "allow",
 };
 }

 const avgDeviation = totalDeviation / factorsCount;
 // تبدیل انحراف به confidence: ۰٪ انحراف = ۱.۰، ۱۰۰٪ انحراف = ۰.۰
 const confidence = Math.max(0, Math.min(1, 1 - avgDeviation / 100));

 let recommendation: ComparisonResult["recommendation"] = "allow";
 if (confidence < this.thresholds.blockThreshold) {
 recommendation = "block";
 } else if (confidence < this.thresholds.challengeThreshold) {
 recommendation = "challenge";
 }

 return {
 match: confidence >= this.thresholds.confidenceThreshold,
 confidence,
 deviations,
 recommendation,
 };
 }

 // پاک کردن داده‌ها
 reset(): void {
 this.keystrokes = [];
 this.mouseEvents = [];
 this.scrollEvents = [];
 this.lastKeyTime = null;
 this.keyDownTime.clear();
 }

 // دریافت آمار خام (برای debugging)
 getRawStats() {
 return {
 keystrokes: this.keystrokes.length,
 mouseEvents: this.mouseEvents.length,
 scrollEvents: this.scrollEvents.length,
 };
 }

 // آیا پروفایل قابل اعتماد است؟
 hasEnoughData(): boolean {
 return (
 this.keystrokes.length >= this.thresholds.minSamples ||
 this.mouseEvents.length >= this.thresholds.minSamples
 );
 }

 // سریالایز پروفایل برای ذخیره‌سازی
 serializeProfile(): string {
 return JSON.stringify(this.getProfile());
 }

 // دی‌سریالایز پروفایل از ذخیره‌سازی
 static deserializeProfile(json: string): BehavioralProfile | null {
 try {
 return JSON.parse(json) as BehavioralProfile;
 } catch {
 return null;
 }
 }
}

// ============ توابع آماری کمکی ============

function mean(arr: number[]): number {
 if (arr.length === 0) return 0;
 return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
 if (arr.length < 2) return 0;
 const m = mean(arr);
 const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
 return Math.sqrt(variance);
}

function percentDeviation(current: number, stored: number): number {
 if (stored === 0) return current === 0? 0: 100;
 return Math.abs((current - stored) / stored) * 100;
}

// نمونه‌سازی یک tracker سراسری برای استفاده‌ی ساده
let globalTracker: BehavioralTracker | null = null;

export function getGlobalTracker(): BehavioralTracker {
 if (!globalTracker) {
 globalTracker = new BehavioralTracker();
 }
 return globalTracker;
}
