/**
 * notification-sound — پخش صدای اعلان با Web Audio API
 * بدون نیاز به فایل خارجی؛ یک beep کوتاه تولید می‌کند.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
 try {
 if (!audioCtx) {
 audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
 }
 // اگر suspend شده (مثل autoplay policy)، resume کن
 if (audioCtx.state === "suspended") {
 void audioCtx.resume();
 }
 return audioCtx;
 } catch {
 return null;
 }
}

/**
 * playNotificationBeep — پخش یک beep کوتاه و لطیف
 * @param frequency فرکانس هرتز (پیش‌فرض ۸۸۰ — A5)
 * @param duration طول میلی‌ثانیه (پیش‌فرض ۱۵۰ms)
 * @param volume صدا ۰-۱ (پیش‌فرض ۰.۳)
 */
export function playNotificationBeep(
 frequency = 880,
 duration = 150,
 volume = 0.3
): void {
 const ctx = getAudioContext();
 if (!ctx) return;

 const oscillator = ctx.createOscillator();
 const gainNode = ctx.createGain();

 oscillator.type = "sine";
 oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

 // fade in / fade out برای جلوگیری از click
 gainNode.gain.setValueAtTime(0, ctx.currentTime);
 gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
 gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration / 1000);

 oscillator.connect(gainNode);
 gainNode.connect(ctx.destination);

 oscillator.start(ctx.currentTime);
 oscillator.stop(ctx.currentTime + duration / 1000 + 0.01);
}

/* ============================================================
 تنظیمات صدا در localStorage
 ============================================================ */
const SOUND_ENABLED_KEY = "hoshhesab_notification_sound";

/**
 * isNotificationSoundEnabled — آیا صدا فعال است؟
 */
export function isNotificationSoundEnabled(): boolean {
 if (typeof window === "undefined") return false;
 try {
 return localStorage.getItem(SOUND_ENABLED_KEY) === "true";
 } catch {
 return false;
 }
}

/**
 * setNotificationSoundEnabled — فعال/غیرفعال کردن صدا
 */
export function setNotificationSoundEnabled(enabled: boolean): void {
 try {
 localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
 } catch { /* ignore */ }
}

/**
 * playNotificationIfEnabled — پخش صدا فقط اگر در تنظیمات فعال باشد
 */
export function playNotificationIfEnabled(): void {
 if (isNotificationSoundEnabled()) {
 playNotificationBeep();
 }
}
