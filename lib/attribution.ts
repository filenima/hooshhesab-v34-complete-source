// ============ Attribution Modeling — هوش ============
// مدل‌سازی اسناد برای تخصیص درآمد به کانال‌های بازاریابی.
// پشتیبانی از ۵ مدل: first-touch، last-touch، linear، time-decay، position-based.

// ============ Types ============

export interface Touchpoint {
 channel: string; // organic، paid_search، social، email، referral، direct
 campaign?: string;
 timestamp: string;
 cost?: number; // هزینه‌ی این touchpoint
}

export interface Attribution {
 userId: string;
 model: AttributionModel;
 touchpoints: Touchpoint[];
 attribution: Array<{
 channel: string;
 weight: number; // 0-1
 revenue: number;
 conversions: number;
 }>;
 totalRevenue: number;
 totalConversions: number;
}

export type AttributionModel =
 | "first-touch"
 | "last-touch"
 | "linear"
 | "time-decay"
 | "position-based";

export interface AttributionReportRow {
 channel: string;
 conversions: number;
 revenue: number;
 cost: number;
 roi: number; // بازگشت سرمایه
 weight: number;
}

// ============ Channel Labels ============

export const CHANNEL_LABELS: Record<string, string> = {
 organic: "جستجوی ارگانیک",
 paid_search: "تبلیغات جستجو",
 social: "شبکه‌های اجتماعی",
 email: "ایمیل",
 referral: "معرفی",
 direct: "مستقیم",
 affiliate: "همکار",
 display: "تبلیغات نمایشی",
};

// ============ Public API ============

/**
 * تخصیص درآمد و تبدیل به touchpointها بر اساس مدل انتخابی.
 *
 * @param userId شناسه‌ی کاربر
 * @param touchpoints لیست touchpointهای کاربر به ترتیب زمانی
 * @param model مدل attribution
 * @param revenue درآمد نهایی (اختیاری — پیش‌فرض ۰)
 * @param conversions تعداد تبدیل (اختیاری — پیش‌فرض ۱)
 */
export function assignAttribution(
 userId: string,
 touchpoints: Touchpoint[],
 model: AttributionModel = "last-touch",
 revenue = 0,
 conversions = 1
): Attribution {
 if (touchpoints.length === 0) {
 return {
 userId,
 model,
 touchpoints: [],
 attribution: [],
 totalRevenue: revenue,
 totalConversions: conversions,
 };
 }

 // مرتب‌سازی touchpointها بر اساس زمان
 const sorted = [...touchpoints].sort(
 (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
 );

 // محاسبه‌ی وزن هر touchpoint بر اساس مدل
 const weights = calculateWeights(sorted, model);

 // تخصیص درآمد و تبدیل بر اساس وزن
 const byChannel = new Map<string, { weight: number; revenue: number; conversions: number }>();

 sorted.forEach((tp, idx) => {
 const weight = weights[idx];
 const existing = byChannel.get(tp.channel)?? { weight: 0, revenue: 0, conversions: 0 };
 existing.weight += weight;
 existing.revenue += revenue * weight;
 existing.conversions += conversions * weight;
 byChannel.set(tp.channel, existing);
 });

 return {
 userId,
 model,
 touchpoints: sorted,
 attribution: Array.from(byChannel.entries()).map(([channel, data]) => ({
 channel,
 weight: data.weight,
 revenue: data.revenue,
 conversions: data.conversions,
 })),
 totalRevenue: revenue,
 totalConversions: conversions,
 };
}

/**
 * دریافت گزارش attribution برای همه‌ی کاربران.
 *
 * @param model مدل attribution (پیش‌فرض: last-touch)
 * @returns گزارش تجمیع‌شده بر اساس کانال
 */
export function getAttributionReport(
 model: AttributionModel = "last-touch"
): AttributionReportRow[] {
 // در پیاده‌سازی واقعی: query از دیتابیس و تجمیع
 // در این نسخه: داده‌ی نمونه بر اساس سناریوی واقعی SaaS ایرانی

 const sampleUsers = generateSampleTouchpoints();
 const channelAgg = new Map<
 string,
 { conversions: number; revenue: number; cost: number; weight: number }
 >();

 for (const user of sampleUsers) {
 const attribution = assignAttribution(
 user.userId,
 user.touchpoints,
 model,
 user.revenue,
 1
 );

 for (const a of attribution.attribution) {
 const existing = channelAgg.get(a.channel)?? {
 conversions: 0,
 revenue: 0,
 cost: 0,
 weight: 0,
 };
 existing.conversions += a.conversions;
 existing.revenue += a.revenue;
 existing.weight += a.weight;

 // محاسبه‌ی هزینه‌ی کانال از touchpointها
 const channelTouchpoints = user.touchpoints.filter((t) => t.channel === a.channel);
 existing.cost += channelTouchpoints.reduce((sum, t) => sum + (t.cost?? 0), 0);

 channelAgg.set(a.channel, existing);
 }
 }

 return Array.from(channelAgg.entries())
.map(([channel, data]) => ({
 channel,
 conversions: data.conversions,
 revenue: data.revenue,
 cost: data.cost,
 roi: data.cost > 0? ((data.revenue - data.cost) / data.cost) * 100: 0,
 weight: data.weight,
 }))
.sort((a, b) => b.revenue - a.revenue);
}

// ============ Weight Calculation ============

function calculateWeights(touchpoints: Touchpoint[], model: AttributionModel): number[] {
 const n = touchpoints.length;
 if (n === 0) return [];
 if (n === 1) return [1];

 switch (model) {
 case "first-touch":
 // اولین touchpoint ۱۰۰٪
 return touchpoints.map((_, i) => (i === 0? 1: 0));

 case "last-touch":
 // آخرین touchpoint ۱۰۰٪
 return touchpoints.map((_, i) => (i === n - 1? 1: 0));

 case "linear":
 // توزیع مساوی
 return touchpoints.map(() => 1 / n);

 case "time-decay":
 // وزن بیشتر برای touchpointهای نزدیک‌تر به تبدیل
 return calculateTimeDecay(touchpoints);

 case "position-based":
 // ۴۰٪ اول، ۴۰٪ آخر، ۲۰٪ باقی‌مانده برای وسط
 return calculatePositionBased(n);

 default:
 return touchpoints.map(() => 1 / n);
 }
}

function calculateTimeDecay(touchpoints: Touchpoint[]): number[] {
 // half-life: ۷ روز — touchpointهای قدیمی‌تر وزن کمتری دارند
 const halfLifeDays = 7;
 const lastTime = new Date(touchpoints[touchpoints.length - 1].timestamp).getTime();

 const weights = touchpoints.map((tp) => {
 const days = (lastTime - new Date(tp.timestamp).getTime()) / (1000 * 60 * 60 * 24);
 return Math.pow(0.5, days / halfLifeDays);
 });

 const sum = weights.reduce((a, b) => a + b, 0);
 return weights.map((w) => w / sum);
}

function calculatePositionBased(n: number): number[] {
 if (n === 1) return [1];
 if (n === 2) return [0.5, 0.5];

 const weights = new Array(n).fill(0);
 weights[0] = 0.4; // اولین
 weights[n - 1] = 0.4; // آخرین
 const middleWeight = 0.2 / (n - 2);
 for (let i = 1; i < n - 1; i++) {
 weights[i] = middleWeight;
 }
 return weights;
}

// ============ Sample Data ============

interface UserTouchpoints {
 userId: string;
 touchpoints: Touchpoint[];
 revenue: number;
}

function generateSampleTouchpoints(): UserTouchpoints[] {
 return [
 {
 userId: "u1",
 touchpoints: [
 { channel: "organic", timestamp: "2025-01-01T10:00:00Z", cost: 0 },
 { channel: "social", timestamp: "2025-01-05T14:00:00Z", cost: 50000 },
 { channel: "email", timestamp: "2025-01-10T09:00:00Z", cost: 5000 },
 ],
 revenue: 990_000,
 },
 {
 userId: "u2",
 touchpoints: [
 { channel: "paid_search", timestamp: "2025-01-02T11:00:00Z", cost: 120000 },
 { channel: "direct", timestamp: "2025-01-08T16:00:00Z", cost: 0 },
 ],
 revenue: 990_000,
 },
 {
 userId: "u3",
 touchpoints: [
 { channel: "referral", timestamp: "2025-01-03T13:00:00Z", cost: 99000 },
 { channel: "email", timestamp: "2025-01-07T10:00:00Z", cost: 5000 },
 { channel: "social", timestamp: "2025-01-12T18:00:00Z", cost: 30000 },
 ],
 revenue: 1_980_000,
 },
 {
 userId: "u4",
 touchpoints: [
 { channel: "social", timestamp: "2025-01-04T09:00:00Z", cost: 75000 },
 { channel: "organic", timestamp: "2025-01-09T14:00:00Z", cost: 0 },
 ],
 revenue: 990_000,
 },
 {
 userId: "u5",
 touchpoints: [
 { channel: "organic", timestamp: "2025-01-01T08:00:00Z", cost: 0 },
 { channel: "paid_search", timestamp: "2025-01-06T12:00:00Z", cost: 95000 },
 { channel: "email", timestamp: "2025-01-11T15:00:00Z", cost: 5000 },
 { channel: "direct", timestamp: "2025-01-15T11:00:00Z", cost: 0 },
 ],
 revenue: 2_490_000,
 },
 ];
}
