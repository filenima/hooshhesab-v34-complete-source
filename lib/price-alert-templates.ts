// قالب‌های آماده برای هشدار قیمتی طلا و ارز - هوش
// هر قالب یک تنظیم پیش‌فرض است که کاربر می‌تواند با یک کلیک آن را به‌عنوان هشدار ثبت کند.

export interface PriceAlertTemplate {
 id: string;
 name: string;
 item: string; // gold:GERAM18 | currency:USD |...
 threshold: number; // درصد تغییر
 direction: "up" | "down" | "both";
 description?: string;
}

export const PRICE_ALERT_TEMPLATES: PriceAlertTemplate[] = [
 {
 id: "gold-high",
 name: "طلا بالای ۲۰۰ میلیون",
 item: "gold:GERAM18",
 threshold: 5,
 direction: "up",
 description: "هنگام افزایش ۵٪ طلا",
 },
 {
 id: "usd-high",
 name: "دلار بالای ۷۰ هزار",
 item: "currency:USD",
 threshold: 5,
 direction: "up",
 description: "هنگام افزایش ۵٪ دلار",
 },
 {
 id: "gold-low",
 name: "کاهش طلا",
 item: "gold:GERAM18",
 threshold: 3,
 direction: "down",
 description: "هنگام کاهش ۳٪ طلا",
 },
 {
 id: "eur-alert",
 name: "یورو",
 item: "currency:EUR",
 threshold: 5,
 direction: "both",
 description: "هنگام تغییر ۵٪ یورو در هر دو جهت",
 },
];

export function getAlertTemplate(id: string): PriceAlertTemplate | undefined {
 return PRICE_ALERT_TEMPLATES.find((t) => t.id === id);
}
