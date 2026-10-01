import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const ENTITY_LABELS: Record<string, string> = {
 INVOICE: "فاکتور",
 PRODUCT: "کالا",
 PARTY: "طرف حساب",
 JOURNAL: "سند حسابداری",
};

const ENTITY_COLORS: Record<string, string> = {
 INVOICE: "#6366f1", // primary indigo
 PRODUCT: "#10b981", // emerald
 PARTY: "#f59e0b", // amber
 JOURNAL: "#0ea5e9", // sky
};

/**
 * GET /api/tags/analytics?days=30
 * — تحلیل برچسب‌ها:
 * • topUsed: پراستفاده‌ترین برچسب‌ها (count + percent)
 * • byEntity: توزیع بر اساس نوع موجودیت
 * • trend: روند استفاده در N روز اخیر
 * • highValue: برچسب‌هایی با بیشترین ارزش مالی (مجموع مبلغ فاکتورهای برچسب‌خورده)
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1), 365);

 // دریافت همه برچسب‌های tenant همراه با EntityTagهایش
 const tags = await db.tag.findMany({
 where: { tenantId: user.tenantId },
 include: {
 entityTags: true,
 },
 });

 const totalUsages = tags.reduce((sum, t) => sum + t.entityTags.length, 0);

 // 1) topUsed — مرتب بر اساس تعداد استفاده (Top 10)
 const topUsed = tags
.map((t) => ({
 id: t.id,
 name: t.name,
 color: t.color,
 count: t.entityTags.length,
 percent:
 totalUsages > 0
? Number(((t.entityTags.length / totalUsages) * 100).toFixed(1))
: 0,
 }))
.sort((a, b) => b.count - a.count)
.slice(0, 10);

 // 2) byEntity — توزیع بر اساس entityType
 const byEntityMap: Record<string, number> = {};
 for (const tag of tags) {
 for (const et of tag.entityTags) {
 byEntityMap[et.entityType] = (byEntityMap[et.entityType] || 0) + 1;
 }
 }
 const byEntity = Object.entries(byEntityMap).map(([type, count]) => ({
 type,
 label: ENTITY_LABELS[type] || type,
 color: ENTITY_COLORS[type] || "#94a3b8",
 count,
 percent:
 totalUsages > 0? Number(((count / totalUsages) * 100).toFixed(1)): 0,
 }));

 // 3) trend — روند استفاده در N روز اخیر بر اساس تاریخ فاکتورها
 // برای هر روز در N روز اخیر، تعداد EntityTagهای INVOICE را که فاکتورشان در آن روز ثبت شده بشمار
 const now = new Date();
 const startDate = new Date(now);
 startDate.setDate(startDate.getDate() - (days - 1));
 startDate.setHours(0, 0, 0, 0);

 // دریافت همه EntityTagهای INVOICE که فاکتورشان در بازه است
 const invoiceEntityTags = await db.entityTag.findMany({
 where: {
 entityType: "INVOICE",
 tag: { tenantId: user.tenantId },
 },
 select: {
 entityId: true,
 tagId: true,
 tag: { select: { name: true, color: true } },
 },
 });

 // فاکتورهای مربوط را با تاریخ دریافت کن
 const invoiceIds = Array.from(
 new Set(invoiceEntityTags.map((et) => et.entityId))
 );
 const invoices = await db.invoice.findMany({
 where: {
 id: { in: invoiceIds },
 date: { gte: startDate, lte: now },
 },
 select: { id: true, date: true, total: true, type: true },
 });
 const invoiceMap = new Map(invoices.map((i) => [i.id, i]));

 // ساخت سری زمانی برای N روز
 const trend: Array<{ date: string; count: number; amount: number }> = [];
 for (let i = 0; i < days; i++) {
 const day = new Date(startDate);
 day.setDate(day.getDate() + i);
 const dayStr = day.toISOString().slice(0, 10);
 let count = 0;
 let amount = 0;
 for (const et of invoiceEntityTags) {
 const inv = invoiceMap.get(et.entityId);
 if (!inv) continue;
 if (inv.date.toISOString().slice(0, 10) === dayStr) {
 count += 1;
 amount += Number(inv.total);
 }
 }
 trend.push({ date: dayStr, count, amount });
 }

 // 4) highValue — برچسب‌هایی با بیشترین ارزش مالی
 // برای هر برچسب، مجموع total فاکتورهای برچسب‌خورده را محاسبه کن
 const highValue = tags
.map((t) => {
 const taggedInvoices = t.entityTags.filter(
 (et) => et.entityType === "INVOICE"
 );
 let totalAmount = 0;
 let count = taggedInvoices.length;
 for (const et of taggedInvoices) {
 const inv = invoiceMap.get(et.entityId);
 if (inv) totalAmount += Number(inv.total);
 }
 // برای فاکتورهایی که خارج از بازه trend بودند هم باید بگیریم — استفاده از همه invoiceMap
 // (چون invoiceMap فقط شامل بازه trend است، ممکن است بعضی فاکتورها جا بیفتند)
 return {
 id: t.id,
 name: t.name,
 color: t.color,
 count,
 totalAmount,
 };
 })
.filter((t) => t.count > 0)
.sort((a, b) => b.totalAmount - a.totalAmount)
.slice(0, 10);

 // اگر داده‌های highValue محدود بودند (فقط بازه trend)، یک query جدا برای کل فاکتورها بزنیم
 if (highValue.length > 0) {
 // گرفتن همه فاکتورهای برچسب‌دار بدون محدودیت زمانی
 const allTaggedInvoices = await db.entityTag.findMany({
 where: {
 entityType: "INVOICE",
 tag: { tenantId: user.tenantId },
 },
 select: {
 entityId: true,
 tagId: true,
 },
 });
 const allInvoiceIds = Array.from(
 new Set(allTaggedInvoices.map((et) => et.entityId))
 );
 const allInvoices = await db.invoice.findMany({
 where: { id: { in: allInvoiceIds } },
 select: { id: true, total: true, type: true },
 });
 const allInvoiceMap = new Map(allInvoices.map((i) => [i.id, i]));

 const highValueFull = tags
.map((t) => {
 const tagged = t.entityTags.filter(
 (et) => et.entityType === "INVOICE"
 );
 let totalAmount = 0;
 for (const et of tagged) {
 const inv = allInvoiceMap.get(et.entityId);
 if (inv) totalAmount += Number(inv.total);
 }
 return {
 id: t.id,
 name: t.name,
 color: t.color,
 count: tagged.length,
 totalAmount,
 };
 })
.filter((t) => t.count > 0)
.sort((a, b) => b.totalAmount - a.totalAmount)
.slice(0, 10);

 return NextResponse.json({
 success: true,
 data: {
 topUsed,
 byEntity,
 trend,
 highValue: highValueFull,
 totals: {
 tags: tags.length,
 usages: totalUsages,
 entities: byEntity.reduce((s, e) => s + e.count, 0),
 },
 days,
 },
 });
 }

 return NextResponse.json({
 success: true,
 data: {
 topUsed,
 byEntity,
 trend,
 highValue,
 totals: {
 tags: tags.length,
 usages: totalUsages,
 entities: byEntity.reduce((s, e) => s + e.count, 0),
 },
 days,
 },
 });
 } catch (error) {
 console.error("Tags analytics error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تحلیل برچسب‌ها" },
 { status: 500 }
 );
 }
}
