import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, auditLog } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/accounting/aging — سن فاکتور و ریسک اعتباری طرف‌حساب‌ها
export async function GET(req: NextRequest) {
 try {
 const auth = await getAuthContext(req);
 if (!auth?.userId ||!auth?.tenantId) {
 return NextResponse.json({ error: "احراز هویت نشده" }, { status: 401 });
 }

 const now = new Date();
 const dayMs = 86400000;

 // دریافت فاکتورهای باز فروش و خرید
 // FIX (F19): deletedAt لحاظ شد؛ PRE_INVOICE و RETURN حذف شدند (گزارش سن فقط
 // مطالبات/بدهی‌های واقعی باز را می‌سنجد)؛ DRAFT حذف شد؛ هر دو صورت PARTIAL و
 // PARTIALLY_PAID شامل شد؛ سقف ۵۰۰ رکورد برداشته شد (گزارش کامل، بدون برش بی‌صدا).
 const invoices = await db.invoice.findMany({
 where: {
 tenantId: auth.tenantId,
 deletedAt: null,
 type: { in: ["SALE", "PURCHASE"] },
 status: { in: ["PENDING", "SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] },
 },
 select: {
 id: true,
 type: true,
 partyId: true,
 total: true,
 paidAmount: true,
 date: true,
 dueDate: true,
 },
 });

 // دریافت طرف‌حساب‌ها برای نام و اطلاعات تماس
 const partyIds = [...new Set(invoices.map((i) => i.partyId))];
 const parties_db = await db.party.findMany({
 where: { id: { in: partyIds } },
 select: {
 id: true,
 name: true,
 type: true,
 phone: true,
 mobile: true,
 email: true,
 },
 });
 const partyMap_db = new Map(parties_db.map((p) => [p.id, p]));

 // گروه‌بندی بر اساس طرف‌حساب — جهت (مشتری/تأمین‌کننده) از Party.type (FIX F19)
 // نه از نوع آخرین فاکتور؛ طرف‌حساب BOTH بر اساس جهت غالب طبقه‌بندی می‌شود.
 type Buckets = { current: number; d30: number; d60: number; d90: number };
 const partyMap = new Map<
 string,
 {
 partyId: string;
 partyName: string;
 type: "CUSTOMER" | "VENDOR";
 ar: Buckets;
 ap: Buckets;
 arTotal: number;
 apTotal: number;
 overdueDays: number;
 contactPhone: string | null;
 contactEmail: string | null;
 }
 >();

 for (const inv of invoices) {
 const remaining = Number(inv.total || 0) - Number(inv.paidAmount || 0);
 if (remaining <= 0) continue;

 const key = inv.partyId;
 const partyInfo = partyMap_db.get(key);
 if (!partyMap.has(key)) {
 partyMap.set(key, {
 partyId: key,
 partyName: partyInfo?.name || "نامشخص",
 type: partyInfo?.type === "SUPPLIER" ? "VENDOR" : "CUSTOMER",
 ar: { current: 0, d30: 0, d60: 0, d90: 0 },
 ap: { current: 0, d30: 0, d60: 0, d90: 0 },
 arTotal: 0,
 apTotal: 0,
 overdueDays: 0,
 contactPhone: partyInfo?.phone || partyInfo?.mobile || null,
 contactEmail: partyInfo?.email || null,
 });
 }

 const party = partyMap.get(key)!;
 const dueDate = inv.dueDate? new Date(inv.dueDate): new Date(inv.date);
 const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / dayMs);

 // سمت مطالبات (فروش) یا بدهی (خرید) — فاکتورهای برگشتی و پیش‌فاکتور حذف شده‌اند
 const isReceivable = inv.type === "SALE";
 const bucketSet = isReceivable? party.ar: party.ap;
 if (diffDays <= 0) {
 bucketSet.current += remaining; // سررسید نشده
 } else if (diffDays <= 30) {
 bucketSet.d30 += remaining;
 } else if (diffDays <= 60) {
 bucketSet.d60 += remaining;
 } else {
 bucketSet.d90 += remaining;
 }
 if (isReceivable) party.arTotal += remaining;
 else party.apTotal += remaining;

 if (diffDays > party.overdueDays) {
 party.overdueDays = Math.max(0, diffDays);
 }
 }

 // FIX (F19): آخرین پرداخت/دریافت واقعی هر طرف‌حساب از لاگ تسویه‌ها (SETTLEMENT_CREATE)
 const lastPaymentByParty = new Map<string, string>();
 try {
 const settlementLogs = await db.auditLog.findMany({
 where: {
 tenantId: auth.tenantId,
 action: "SETTLEMENT_CREATE",
 entityId: { in: Array.from(partyMap.keys()) },
 },
 orderBy: { createdAt: "desc" },
 select: { entityId: true, createdAt: true },
 });
 for (const log of settlementLogs) {
 if (log.entityId && !lastPaymentByParty.has(log.entityId)) {
 lastPaymentByParty.set(log.entityId, log.createdAt.toISOString());
 }
 }
 } catch {
 // AuditLog در دسترس نیست — lastPaymentDate null می‌ماند
 }

 // محاسبه امتیاز اعتباری برای هر طرف‌حساب
 // FIX (F19): نوع نمایش از Party.type (BOTH → جهت غالب)؛ سطل‌های همان جهت نمایش داده می‌شود
 const parties = Array.from(partyMap.values()).map((p) => {
 // جهت غالب برای طرف‌حساب‌های BOTH/نامشخص
 const displayType: "CUSTOMER" | "VENDOR" =
 p.type === "VENDOR" || (p.type !== "CUSTOMER" && p.apTotal > p.arTotal)
 ? "VENDOR"
 : "CUSTOMER";
 const buckets = displayType === "CUSTOMER"? p.ar: p.ap;
 const total = displayType === "CUSTOMER"? p.arTotal: p.apTotal;

 let creditScore = 100;
 if (total > 0) {
 const weighted =
 (buckets.current * 1 +
 buckets.d30 * 0.7 +
 buckets.d60 * 0.4 +
 buckets.d90 * 0.1) /
 total;
 creditScore = Math.round(weighted * 100);

 if (p.overdueDays > 90) creditScore -= 30;
 else if (p.overdueDays > 60) creditScore -= 20;
 else if (p.overdueDays > 30) creditScore -= 10;

 creditScore = Math.max(0, Math.min(100, creditScore));
 }

 let creditRating: "A" | "B" | "C" | "D" = "A";
 let riskLevel: "low" | "medium" | "high" | "critical" = "low";

 if (creditScore >= 85) {
 creditRating = "A";
 riskLevel = "low";
 } else if (creditScore >= 70) {
 creditRating = "B";
 riskLevel = "low";
 } else if (creditScore >= 50) {
 creditRating = "C";
 riskLevel = "medium";
 } else if (creditScore >= 30) {
 creditRating = "C";
 riskLevel = "high";
 } else {
 creditRating = "D";
 riskLevel = "critical";
 }

 return {
 partyId: p.partyId,
 partyName: p.partyName,
 partyType: displayType,
 totalReceivable: displayType === "CUSTOMER"? p.arTotal: 0,
 totalPayable: displayType === "VENDOR"? p.apTotal: 0,
 buckets,
 overdueDays: p.overdueDays,
 creditScore,
 creditRating,
 lastPaymentDate: lastPaymentByParty.get(p.partyId)?? null,
 contactPhone: p.contactPhone,
 contactEmail: p.contactEmail,
 riskLevel,
 };
 });

 // دریافت آخرین اقدامات وصول از AuditLog
 let actionLogs: any[] = [];
 try {
 actionLogs = await db.auditLog.findMany({
 where: {
 tenantId: auth.tenantId,
 action: { startsWith: "AGING_ACTION_" },
 },
 orderBy: { createdAt: "desc" },
 take: 50,
 select: {
 id: true,
 action: true,
 changes: true,
 createdAt: true,
 entityId: true,
 },
 });
 } catch {
 // AuditLog ممکن است وجود نداشته باشد
 }

 return NextResponse.json({
 parties,
 actionLogs: actionLogs.map((l) => ({
 id: l.id,
 partyId: l.entityId || "",
 partyName: "",
 action: (l.action || "").replace("AGING_ACTION_", "") as any,
 date: l.createdAt?.toISOString() || new Date().toISOString(),
 note: l.changes || "",
 by: "سیستم",
 })),
 generatedAt: now.toISOString(),
 });
 } catch (err: any) {
 console.error("[aging] error:", err);
 return NextResponse.json(
 { error: "خطا در محاسبه سن مطالبات", detail: err?.message },
 { status: 500 }
 );
 }
}

// POST /api/accounting/aging — ثبت اقدام وصول
export async function POST(req: NextRequest) {
 try {
 const auth = await getAuthContext(req);
 if (!auth?.userId ||!auth?.tenantId) {
 return NextResponse.json({ error: "احراز هویت نشده" }, { status: 401 });
 }

 const body = await req.json();
 const { partyId, partyName, action, note } = body as {
 partyId?: string;
 partyName: string;
 action: "REMINDER" | "CALL" | "NOTICE" | "ESCALATE";
 note: string;
 };

 if (!partyName ||!action ||!note) {
 return NextResponse.json(
 { error: "نام طرف‌حساب، نوع اقدام و توضیحات الزامی است" },
 { status: 400 }
 );
 }

 // ذخیره در AuditLog
 try {
 await db.auditLog.create({
 data: {
 tenantId: auth.tenantId,
 userId: auth.userId,
 action: `AGING_ACTION_${action}`,
 entity: "PARTY",
 entityId: partyId || partyName,
 changes: `طرف‌حساب: ${partyName} | ${note}`,
 ipAddress: req.headers.get("x-forwarded-for") || "unknown",
 userAgent: req.headers.get("user-agent") || "unknown",
 },
 });
 } catch (e) {
 console.error("[aging] auditLog error:", e);
 }

 return NextResponse.json({
 success: true,
 message: "اقدام وصول ثبت شد",
 log: {
 partyName,
 action,
 note,
 date: new Date().toISOString(),
 },
 });
 } catch (err: any) {
 console.error("[aging] POST error:", err);
 return NextResponse.json(
 { error: "خطا در ثبت اقدام", detail: err?.message },
 { status: 500 }
 );
 }
}
