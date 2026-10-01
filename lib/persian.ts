// توابع کمکی فارسی - هوش

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** تبدیل اعداد انگلیسی به فارسی */
export function toPersianDigits(input: string | number): string {
 return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** تبدیل اعداد فارسی به انگلیسی */
export function toEnglishDigits(input: string): string {
 return input
.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** قالب‌بندی عدد با جداکننده هزارگان (فارسی) */
export function formatNumber(value: number, decimals = 0): string {
 const formatted = new Intl.NumberFormat("en-US", {
 minimumFractionDigits: decimals,
 maximumFractionDigits: decimals,
 }).format(Math.abs(value));
 const persian = toPersianDigits(formatted);
 return value < 0? `-${persian}`: persian;
}

/** قالب‌بندی مبلغ به تومان */
export function formatToman(value: number): string {
 return `${formatNumber(value)} تومان`;
}

/** قالب‌بندی مبلغ به ریال */
export function formatRial(value: number): string {
 return `${formatNumber(value)} ریال`;
}

/** قالب‌بندی مبلغ به شکل خلاصه (میلیون/میلیارد) — ورودی به تومان */
export function formatCompactToman(value: number): string {
 const abs = Math.abs(value);
 if (abs >= 1_000_000_000) {
 return `${formatNumber(value / 1_000_000_000, 2)} میلیارد تومان`;
 }
 if (abs >= 1_000_000) {
 return `${formatNumber(value / 1_000_000, 1)} میلیون تومان`;
 }
 if (abs >= 1_000) {
 return `${formatNumber(value / 1_000, 0)} هزار تومان`;
 }
 return formatToman(value);
}

/** قالب‌بندی مبلغ به شکل خلاصه — ورودی به ریال (۱ ریال = ۰٫۱ تومان) */
export function formatCompactRial(value: number): string {
 const abs = Math.abs(value);
 if (abs >= 10_000_000_000) {
 return `${formatNumber(value / 10_000_000_000, 2)} میلیارد ریال`;
 }
 if (abs >= 10_000_000) {
 return `${formatNumber(value / 10_000_000, 1)} میلیون ریال`;
 }
 if (abs >= 10_000) {
 return `${formatNumber(value / 1_000, 0)} هزار ریال`;
 }
 return formatRial(value);
}

export type PriceUnit = "toman" | "rial";

/**
 * قالب‌بندی فشرده یک مبلغ بر اساس واحد انتخابی.
 * - ورودی همیشه به‌صورت «ریال» است (همان چیزی که در DB ذخیره می‌شود).
 * - اگر unit = "toman" بود، مقدار به تومان (ریال ÷ ۱۰) تبدیل و با قالب تومان نمایش داده می‌شود.
 * - اگر unit = "rial" بود، با قالب ریال نمایش داده می‌شود.
 */
export function formatPriceCompact(valueRial: number, unit: PriceUnit): string {
 if (unit === "toman") {
 return formatCompactToman(Math.trunc(valueRial / 10));
 }
 return formatCompactRial(valueRial);
}

/**
 * قالب‌بندی دقیق یک مبلغ (با جداکننده هزارگان) بر اساس واحد انتخابی.
 * ورودی همیشه به‌صورت «ریال» است.
 */
export function formatPrice(valueRial: number, unit: PriceUnit): string {
 if (unit === "toman") {
 return `${formatNumber(Math.trunc(valueRial / 10))} تومان`;
 }
 return `${formatNumber(valueRial)} ریال`;
}

/** تبدیل تاریخ میلادی به شمسی (تقریبی، بدون کتابخانه خارجی) */
export function toJalali(date: Date): string {
 const gy = date.getFullYear();
 const gm = date.getMonth() + 1;
 const gd = date.getDate();
 const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
 return `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, "0"))}/${toPersianDigits(
 String(jd).padStart(2, "0")
 )}`;
}

/** سال شمسی جاری را برمی‌گرداند (مثلاً 1405 در سال 2026 میلادی) */
export function getCurrentJalaliYear(date: Date = new Date()): number {
 const [jy] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
 return jy;
}

/** ماه شمسی جاری (1..12) */
export function getCurrentJalaliMonth(date: Date = new Date()): number {
 const [, jm] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
 return jm;
}

// FIX(3b-بیگ۴): gregorianToJalali export شد — lib/modian برای محاسبهٔ سال مالیِ
// «تاریخ فاکتور» (نه تاریخ الان) به آن نیاز دارد. خودِ تابع بدون تغییر است
// (تست‌شده با ICU — ممیزی ۷.۱: ۰ mismatch روی ۱۹۹۵–۲۰۴۰).
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
 const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
 let jy = gy <= 1600? 0: 979;
 gy -= gy <= 1600? 621: 1600;
 const gy2 = gm > 2? gy + 1: gy;
 let days =
 365 * gy +
 Math.floor((gy2 + 3) / 4) -
 Math.floor((gy2 + 99) / 100) +
 Math.floor((gy2 + 399) / 400) -
 80 +
 gd +
 g_d_m[gm - 1];
 jy += 33 * Math.floor(days / 12053);
 days %= 12053;
 jy += 4 * Math.floor(days / 1461);
 days %= 1461;
 if (days > 365) {
 jy += Math.floor((days - 1) / 365);
 days = (days - 1) % 365;
 }
 const jm = days < 186? 1 + Math.floor(days / 31): 7 + Math.floor((days - 186) / 30);
 const jd = 1 + (days < 186? days % 31: (days - 186) % 30);
 return [jy, jm, jd];
}

/** تبدیل تاریخ شمسی (جلالی) به میلادی — معکوس gregorianToJalali */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
 let gy = jy <= 979? 621: 1600;
 jy -= jy <= 979? 0: 979;
 let days =
 365 * jy +
 Math.floor(jy / 33) * 8 +
 Math.floor((jy % 33 + 3) / 4) +
 78 +
 jd +
 (jm < 7? (jm - 1) * 31: (jm - 7) * 30 + 186);
 gy += 400 * Math.floor(days / 146097);
 days %= 146097;
 if (days > 36524) {
 gy += 100 * Math.floor(--days / 36524);
 days %= 36524;
 if (days >= 365) days++;
 }
 gy += 4 * Math.floor(days / 1461);
 days %= 1461;
 if (days > 365) {
 gy += Math.floor((days - 1) / 365);
 days = (days - 1) % 365;
 }
 let gd = days + 1;
 const sal_a = [
 0,
 31,
 (gy % 4 === 0 && gy % 100!== 0) || gy % 400 === 0? 29: 28,
 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
 ];
 let gm = 0;
 for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
 return [gy, gm, gd];
}

/**
 * بازه‌ی زمانی یک فصل شمسی را به تاریخ میلادی برمی‌گرداند.
 * @param year سال شمسی (مثلاً 1403)
 * @param quarter شماره فصل (1..4)
 * @returns { start: Date, end: Date } — بازه‌ی [start, end)
 */
export function getJalaliQuarterRange(
 year: number,
 quarter: number
): { start: Date; end: Date } {
 // هر فصل ۳ ماه شمسی است:
 // Q1: فروردین–خرداد (ماه‌های 1..3)
 // Q2: تیر–شهریور (ماه‌های 4..6)
 // Q3: مهر–آذر (ماه‌های 7..9)
 // Q4: دی–اسفند (ماه‌های 10..12)
 const startMonth = (quarter - 1) * 3 + 1;
 const endMonth = startMonth + 3; // ماه بعد از پایان فصل
 const [syGy, syGm, syGd] = jalaliToGregorian(year, startMonth, 1);
 const start = new Date(syGy, syGm - 1, syGd, 0, 0, 0, 0);
 // پایان فصل = ابتدای ماه بعد (ممکن است به سال بعد برود — اسفند 1403 فروردین 1404)
 const [eyGy, eyGm, eyGd] = jalaliToGregorian(
 endMonth > 12? year + 1: year,
 endMonth > 12? 1: endMonth,
 1
 );
 const end = new Date(eyGy, eyGm - 1, eyGd, 0, 0, 0, 0);
 return { start, end };
}

/** بازه‌ی زمانی یک سال شمسی را برمی‌گرداند (۱ فروردین تا ۳۰ اسفند) */
export function getJalaliYearRange(year: number): { start: Date; end: Date } {
 return {
 start: getJalaliQuarterRange(year, 1).start,
 end: getJalaliQuarterRange(year + 1, 1).start,
 };
}

/** نام ماه‌های شمسی */
export const JALALI_MONTHS = [
 "فروردین",
 "اردیبهشت",
 "خرداد",
 "تیر",
 "مرداد",
 "شهریور",
 "مهر",
 "آبان",
 "آذر",
 "دی",
 "بهمن",
 "اسفند",
];

// #22 (v34-5): برچسب تاریخ شمسی «روز ماه سال» از ISO — همیشه بر مبنای زمان
// تهران (UTC+03:30 ثابت — ایران ساعت تابستانی ندارد). بدون این جابجایی،
// مرورگرهایی خارج از منطقهٔ زمانی ایران تاریخ را یک روز عقب نشان می‌دادند
// (مثلاً «۳۰ آبان» به‌جای «۱ آذر» برای پلهٔ افزایش قیمت).
const TEHRAN_TZ_OFFSET_MINUTES = 210;

/** برچسب تاریخ شمسی خوانا — مثلاً «۱ آذر ۱۴۰۵»؛ ورودی نامعتبر → «—» */
export function formatJalaliDayLabel(isoDate: string | Date): string {
 try {
 const d = typeof isoDate === "string"? new Date(isoDate): isoDate;
 if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
 const tehran = new Date(d.getTime() + TEHRAN_TZ_OFFSET_MINUTES * 60_000);
 const [jy, jm, jd] = gregorianToJalali(
 tehran.getUTCFullYear(),
 tehran.getUTCMonth() + 1,
 tehran.getUTCDate()
 );
 return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
 } catch {
 return "—";
 }
}

/** وضعیت فاکتور به فارسی */
export const INVOICE_STATUS_FA: Record<string, string> = {
 DRAFT: "پیش‌نویس",
 SENT: "ارسال شده",
 PAID: "تسویه شده",
 PARTIAL: "تسویه جزئی",
 OVERDUE: "سررسید گذشته",
 CANCELLED: "ابطال شده",
};

/** رنگ badge بر اساس وضعیت */
export function statusColor(status: string): string {
 const map: Record<string, string> = {
 DRAFT: "bg-muted text-muted-foreground",
 SENT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
 PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 PARTIAL: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
 OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
 CANCELLED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
 POSTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 OPEN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
 CLOSED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
 };
 return map[status] || "bg-muted text-muted-foreground";
}

/**
 * تاریخ ISO محلی (YYYY-MM-DD) — بدون تبدیل به UTC.
 *
 * نکته باگ: `date.toISOString().split("T")[0]` تاریخ را به UTC می‌برد و برای
 * ایران (+03:30) بعد از ساعت ۲۰:۳۰ «دیروز» را برمی‌گرداند. این تابع
 * ترکیب اجزای محلی تاریخ را می‌سازد و برای فاکتورها و فیلترهای تاریخی
 * باید همیشه استفاده شود.
 */
export function toLocalISODate(date: Date = new Date()): string {
 const y = date.getFullYear();
 const m = String(date.getMonth() + 1).padStart(2, "0");
 const d = String(date.getDate()).padStart(2, "0");
 return `${y}-${m}-${d}`;
}

/* ============================================================
 * FIX(search): نرمال‌سازی متن فارسی/عربی برای جستجو
 * ============================================================
 * ریشهٔ باگ «جستجو کار نمی‌کند»: داده‌های ایمپورت‌شده (CSV cp1256) با
 * نویسه‌های عربی (ي U+064A، ك U+0643) ذخیره شده‌اند، ولی کاربر با
 * کیبورد فارسی ی (U+06CC) و ک (U+06A9) تایپ می‌کند. این نویسه‌ها در
 * یونیکد «متفاوت»ند و includes/contains هیچ‌وقت مچ نمی‌شود —
 * مثلاً جستجوی «کیف» در انباری با ۳۰ نوع «كیف» نتیجه‌ای ندارد.
 * راه‌حل: یکسان‌سازی همهٔ نویسه‌های هم‌ارز قبل از مقایسه.
 */
export function normalizePersianText(text: string | null | undefined): string {
 if (!text) return "";
 let out = String(text);
 // نویسه‌های هم‌ارز عربی → فارسی
 out = out
.replace(/[\u064A\u0649\u0626]/g, "\u06CC") // ي / ى / ئ → ی
.replace(/\u0643/g, "\u06A9") // ك → ک
.replace(/\u0629/g, "\u0647") // ة → ه
.replace(/[\u0623\u0625\u0671]/g, "\u0627") // أ / إ / ٱ → ا
.replace(/\u0624/g, "\u0648") // ؤ → و
// حذف اعراب، تشدید، سکون، تطویل و هیچره‌ها
.replace(/[\u064B-\u0652\u0670\u0640\u0653-\u0655\u0640]/g, "")
// ZWNJ و نشانه‌های جهت متن → حذف (تا «می‌خواهم» با «میخواهم» مچ شود)
.replace(/[\u200C\u200F\u200E\u202A-\u202E\u2066-\u2069]/g, "")
// ارقام فارسی/عربی → لاتین (برای جستجوی SKU/بارکد/قیمت)
.replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
 // فاصله‌های چندگانه → یکی + کوچک‌سازی لاتین
 return out.replace(/\s+/g, " ").trim().toLowerCase();
}

/** آیا «درختی» شامل «گرهٔ» جستجو است؟ (با نرمال‌سازی کامل فارسی) */
export function persianIncludes(
 haystack: string | null | undefined,
 needle: string | null | undefined
): boolean {
 const h = normalizePersianText(haystack);
 const n = normalizePersianText(needle);
 if (!n) return true; // جستجوی خالی = همه
 return h.includes(n);
}

/**
 * واریانت‌های جستجو برای contains سمت سرور (SQLite حساس به نویسه است):
 * برای هر نویسهٔ فارسیِ دارای هم‌ارز عربی (ی/ک/ه/ا/و)، نسخهٔ عربی هم
 * می‌سازد تا «کیف» با «كیف» و «كيف» در دیتابیس مچ شود (و برعکس).
 * خروجی: آرایه‌ای از رشته‌ها (حداکثر ۶۴ واریانت) برای شرط OR.
 */
export function persianSearchVariants(query: string | null | undefined): string[] {
 if (!query) return [];
 const q = String(query).replace(/\s+/g, " ").trim();
 if (!q) return [];
 let variants: string[] = [q];
 for (let i = 0; i < q.length; i++) {
 let twins: string[] = [];
 switch (q[i]) {
 case "\u06CC": twins = ["\u064A", "\u0649"]; break; // ی → ي/ى
 case "\u06A9": twins = ["\u0643"]; break; // ک → ك
 case "\u0647": twins = ["\u0629"]; break; // ه → ة
 case "\u0627": twins = ["\u0623", "\u0625"]; break; // ا → أ/إ
 case "\u0648": twins = ["\u0624"]; break; // و → ؤ
 }
 if (twins.length === 0) continue;
 const next: string[] = [];
 for (const v of variants) {
 next.push(v);
 for (const t of twins) next.push(v.slice(0, i) + t + v.slice(i + 1));
 }
 variants = next;
 if (variants.length > 64) { variants = variants.slice(0, 64); break; }
 }
 // حذف تکراری‌ها + واریانت نرمال‌شدهٔ کامل (اگر کاربر عربی تایپ کرده باشد)
 const normalized = normalizePersianText(q).replace(/\s+/g, " ");
 const set = new Set<string>([...variants.map((v) => v.toLowerCase()), q.toLowerCase()]);
 if (normalized && !set.has(normalized)) {
 // نرمال‌شده ممکن است فاصله‌ها را تغییر داده باشد — فقط اگر طولش منطقی است اضافه کن
 if (normalized.length >= 2) set.add(normalized);
 }
 return [...set].filter(Boolean);
}
