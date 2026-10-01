// ============ license-trial.ts ============
// تشخیص یکسان «لایسنس تریال» بین همه‌ی مسیرها (single source of truth)
//
// باگ: trial/create برای tenant تریال یک لایسنس ACTIVE با plan=pro می‌سازد؛
// license/status قبلاً isTrial:false برمی‌گرداند بنر شمارش معکوس ۳ روزه
// هرگز برای کاربر تریال نمایش داده نمی‌شد و با auth/me هم ناسازگار بود.
//
// قواعد (در هر دو مسیر /api/license/status و /api/auth/me یکسان):
// ۱) لایسنس دارای source === "trial" تریال است.
// ۲) سازگاری با لایسن‌سهای قدیمی (قبل از افزودن ستون source):
// اگر کاربر isTrial است و endDate لایسنس فعال دقیقاً همان trialEndsAt
// کاربر باشد همان لایسنس تریال است.
// ۳) لایسنس خریداری‌شده (source خالی/“purchase” و endDate متفاوت) تریال نیست،
// حتی اگر رکورد user.isTrial هنوز true مانده باشد (payment/verify آن را
// بازنشانی نمی‌کند).
// ۴) daysRemaining تریال همیشه از user.trialEndsAt محاسبه می‌شود.

interface TrialUserLike {
 isTrial: boolean;
 trialEndsAt: Date | string | null;
}

interface LicenseLike {
 source?: string | null;
 endDate?: Date | string | null;
}

/** آیا endDate لایسنس همان روزِ trialEndsAt کاربر است؟ (سازگاری با داده‌های قدیمی) */
function isSameDay(a: Date, b: Date): boolean {
 return (
 a.getUTCFullYear() === b.getUTCFullYear() &&
 a.getUTCMonth() === b.getUTCMonth() &&
 a.getUTCDate() === b.getUTCDate()
 );
}

/**
 * آیا این لایسنسِ فعال، لایسنس تریالِ این کاربر است؟
 * (لایسنس null false؛ یعنی بدون لایسنس، تشخیص تریال به user.isTrial واگذار می‌شود)
 */
export function isTrialLicense(user: TrialUserLike, license: LicenseLike | null): boolean {
 if (!license) return false;
 if (license.source === "trial") return true;
 // fallback برای لایسن‌سهایی که قبل از افزودن ستون source ساخته شده‌اند
 if (!user.isTrial ||!user.trialEndsAt ||!license.endDate) return false;
 try {
 return isSameDay(new Date(license.endDate), new Date(user.trialEndsAt));
 } catch {
 return false;
 }
}

/**
 * isTrial مؤثر کاربر — همان منطقی که /api/license/status برمی‌گرداند:
 * کاربر تریال است اگر user.isTrial باشد و لایسنس فعالِ «غیرتریال» نداشته باشد.
 */
export function effectiveIsTrial(
 user: TrialUserLike,
 activeLicense: LicenseLike | null
): boolean {
 if (!user.isTrial) return false;
 // لایسنس فعالِ غیرتریال (خرید) دیگر تریال نیست
 if (activeLicense &&!isTrialLicense(user, activeLicense)) return false;
 return true;
}

/** روزهای باقی‌مانده تا پایان تریال (کف ۰). null یعنی تاریخ نامعتبر. */
export function trialDaysRemaining(user: TrialUserLike): number | null {
 if (!user.trialEndsAt) return null;
 try {
 const end = new Date(user.trialEndsAt).getTime();
 const now = Date.now();
 return Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
 } catch {
 return null;
 }
}
