import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// نگاشت item key (gold:GERAM18, currency:USD) به fromCurrency در جدول ExchangeRate
function itemToCurrencyCode(item: string): string {
 const [kind, code] = item.split(":");
 if (!code) return item;
 if (kind === "gold") return `GOLD_${code.toUpperCase()}`;
 return code.toUpperCase();
}

// برچسب فارسی قلم برای متن اعلان
const ITEM_LABELS: Record<string, string> = {
 "gold:GERAM18": "طلای ۱۸ عیار",
 "gold:SEKEE": "سکه امامی",
 "gold:ONSE": "انس طلا",
 "gold:MESGHAL": "مثقال طلا",
 "currency:USD": "دلار آمریکا",
 "currency:EUR": "یورو",
 "currency:GBP": "پوند انگلیس",
 "currency:AED": "درهم امارات",
 "currency:TRY": "لیر ترکیه",
 "currency:CNY": "یوآن چین",
 "currency:SAR": "ریال عربستان",
};

// POST /api/price-alerts/check — بررسی همه‌ی هشدارهای فعال و صدور اعلان برای.triggerها
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const alerts = await db.priceAlert.findMany({
 where: { tenantId, isActive: true },
 });

 if (alerts.length === 0) {
 return NextResponse.json({
 success: true,
 checked: 0,
 triggered: [],
 });
 }

 // واکشی آخرین نرخ‌های هر fromCurrency (tgju + manual + API)
 const codes = Array.from(
 new Set(alerts.map((a) => itemToCurrencyCode(a.item)))
 );
 const rates = await db.exchangeRate.findMany({
 where: { fromCurrency: { in: codes }, toCurrency: "IRR" },
 orderBy: { fetchedAt: "desc" },
 });
 const latestMap = new Map<string, { rate: number; fetchedAt: Date }>();
 for (const r of rates) {
 if (!latestMap.has(r.fromCurrency)) {
 latestMap.set(r.fromCurrency, { rate: r.rate, fetchedAt: r.fetchedAt });
 }
 }

 const triggered: Array<{
 id: string;
 item: string;
 label: string;
 oldPrice: number | null;
 newPrice: number;
 changePct: number;
 direction: "up" | "down";
 threshold: number;
 }> = [];
 const now = new Date();

 for (const alert of alerts) {
 const code = itemToCurrencyCode(alert.item);
 const latest = latestMap.get(code);
 if (!latest) {
 // نرخ یافت نشد — فقط lastChecked را به‌روز کن
 await db.priceAlert.update({
 where: { id: alert.id },
 data: { lastChecked: now },
 });
 continue;
 }

 const newPrice = latest.rate;
 const oldPrice = alert.lastPrice;

 // به‌روزرسانی lastPrice و lastChecked
 const patch: { lastChecked: Date; lastPrice: number; triggeredAt?: Date } = {
 lastChecked: now,
 lastPrice: newPrice,
 };

 if (oldPrice!= null && oldPrice > 0) {
 const changePct = ((newPrice - oldPrice) / oldPrice) * 100;
 const absChange = Math.abs(changePct);
 const directionMatch =
 (changePct > 0 && (alert.direction === "up" || alert.direction === "both")) ||
 (changePct < 0 && (alert.direction === "down" || alert.direction === "both"));

 if (absChange >= alert.threshold && directionMatch) {
 patch.triggeredAt = now;
 const label = ITEM_LABELS[alert.item]?? alert.item;
 const dirFa = changePct > 0? "افزایش": "کاهش";
 const title = `هشدار قیمتی: ${label}`;
 const message = `${label} با ${dirFa} ${absChange.toFixed(2)}٪ به ${new Intl.NumberFormat(
 "fa-IR"
 ).format(Math.round(newPrice))} تومان رسید (آستانه: ${alert.threshold}٪).`;

 await db.notification.create({
 data: {
 tenantId,
 title,
 message,
 type: "WARNING",
 isRead: false,
 },
 });

 triggered.push({
 id: alert.id,
 item: alert.item,
 label,
 oldPrice,
 newPrice,
 changePct,
 direction: changePct > 0? "up": "down",
 threshold: alert.threshold,
 });
 }
 }

 await db.priceAlert.update({
 where: { id: alert.id },
 data: patch,
 });
 }

 return NextResponse.json({
 success: true,
 checked: alerts.length,
 triggeredCount: triggered.length,
 triggered,
 checkedAt: now.toISOString(),
 });
 } catch (error) {
 console.error("PriceAlert check error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بررسی هشدارها" },
 { status: 500 }
 );
 }
}
