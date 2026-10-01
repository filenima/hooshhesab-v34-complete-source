import { db } from "@/lib/db";

// ============ Task 3-c — پیکربندی مسابقه رفرال (مشترک سرور) ============
// منبع یگانهٔ جدول جایزه‌ها و وضعیت مسابقه — در SystemSettings با کلید
// referral_contest ذخیره می‌شود و از تب «مدیریت رفرال» سوپرادمین قابل
// ویرایش است. اگر تنظیم نشده باشد، جدول پیش‌فرض درخواست مالک برمی‌گردد:
// نفر اول ۲۰ میلیون تومان | دوم و سوم ۱۰ میلیون | نزولی تا نفر دهم ۱ میلیون.

/** جدول جایزه پیش‌فرض مسابقه رفرال (تومان) — رتبه ۱ تا ۱۰ */
export const DEFAULT_CONTEST_PRIZES: number[] = [
 20_000_000, // نفر اول
 10_000_000, // نفر دوم
 10_000_000, // نفر سوم
 8_000_000, // نفر چهارم
 7_000_000, // نفر پنجم
 6_000_000, // نفر ششم
 5_000_000, // نفر هفتم
 4_000_000, // نفر هشتم
 2_000_000, // نفر نهم
 1_000_000, // نفر دهم
];

export interface ReferralContestConfig {
 active: boolean;
 title: string;
 prizes: number[];
 startDate: string | null;
 endDate: string | null;
}

/** خواندن پیکربندی مسابقه از SystemSettings — با مقادیر پیش‌فرض امن */
export async function getReferralContestConfig(): Promise<ReferralContestConfig> {
 try {
  const row = await db.systemSettings.findUnique({ where: { key: "referral_contest" } });
  if (row?.value) {
   const parsed = JSON.parse(row.value) as Partial<ReferralContestConfig>;
   const prizes = Array.isArray(parsed.prizes)
    ? parsed.prizes
      .map((p) => Math.max(0, Math.round(Number(p) || 0)))
      .filter((p) => p > 0)
      .slice(0, 10)
    : [];
   return {
    active: parsed.active !== false,
    title:
     typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "مسابقه رفرال هوش",
    prizes: prizes.length > 0 ? prizes : DEFAULT_CONTEST_PRIZES,
    startDate: typeof parsed.startDate === "string" ? parsed.startDate : null,
    endDate: typeof parsed.endDate === "string" ? parsed.endDate : null,
   };
  }
 } catch (e) {
  console.warn("[referral-contest] خواندن تنظیمات مسابقه ناموفق — پیش‌فرض:", e);
 }
 return {
  active: true,
  title: "مسابقه رفرال هوش",
  prizes: DEFAULT_CONTEST_PRIZES,
  startDate: null,
  endDate: null,
 };
}
