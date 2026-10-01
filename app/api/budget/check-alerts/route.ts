import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

interface AlertResult {
 budgetId: string;
 budgetTitle: string;
 category: string;
 period: string;
 budgetAmount: number;
 actualAmount: number;
 usagePercent: number;
 severity: "WARNING" | "CRITICAL";
 message: string;
 notificationId?: string;
}

/**
 * POST /api/budget/check-alerts
 * بررسی همه‌ی بودجه‌های ACTIVE تننت فعلی و صدور Notification در صورت عبور از آستانه‌ها
 * - actual >= 80٪ WARNING
 * - actual >= 100٪ CRITICAL
 * جلوگیری از duplicate با بررسی پیام یکسان در ۶ ساعت گذشته
 */
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

 const budgets = await db.budget.findMany({
 where: { tenantId, status: "ACTIVE" },
 include: { items: true },
 });

 const triggered: AlertResult[] = [];
 let checked = 0;
 let created = 0;

 const now = new Date();
 const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

 // دریافت آخرین هشدارهای مشابه برای جلوگیری از duplicate
 const recentNotifications = await db.notification.findMany({
 where: {
 tenantId,
 type: { in: ["WARNING", "ERROR"] },
 createdAt: { gte: sixHoursAgo },
 },
 select: { title: true, message: true },
 });
 const dedupKey = new Set(
 recentNotifications.map((n) => `${n.title}::${n.message}`)
 );

 for (const budget of budgets) {
 for (const item of budget.items) {
 checked++;
 const budgetAmt = Number(item.budgetAmount?? 0);
 const actualAmt = Number(item.actualAmount?? 0);
 if (budgetAmt <= 0) continue;
 const usagePercent = (actualAmt / budgetAmt) * 100;

 let severity: "WARNING" | "CRITICAL" | null = null;
 let message = "";
 let title = "";

 if (usagePercent >= 100) {
 severity = "CRITICAL";
 const over = usagePercent - 100;
 title = `عبور از بودجه: ${item.category}`;
 message = `بودجه «${budget.title}» — دسته‌ی ${item.category} (${item.period}) با ${over.toFixed(
 1
 )}٪ عبور کرده است. مصرف: ${usagePercent.toFixed(0)}٪`;
 } else if (usagePercent >= 80) {
 severity = "WARNING";
 title = `هشدار بودجه: ${item.category}`;
 message = `بودجه «${budget.title}» — دسته‌ی ${item.category} (${item.period}) تا ${usagePercent.toFixed(
 0
 )}٪ مصرف شده است.`;
 }

 if (!severity) continue;

 const key = `${title}::${message}`;
 const isDuplicate = dedupKey.has(key);
 dedupKey.add(key);

 let notificationId: string | undefined;
 if (!isDuplicate) {
 const notif = await db.notification.create({
 data: {
 tenantId,
 title,
 message,
 type: severity === "CRITICAL"? "ERROR": "WARNING",
 isRead: false,
 link: "/budget",
 },
 });
 notificationId = notif.id;
 created++;
 }

 triggered.push({
 budgetId: budget.id,
 budgetTitle: budget.title,
 category: item.category,
 period: item.period,
 budgetAmount: budgetAmt,
 actualAmount: actualAmt,
 usagePercent,
 severity,
 message,
 notificationId,
 });
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 triggered,
 checked,
 created,
 },
 });
 } catch (error) {
 console.error("Budget check-alerts error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بررسی هشدارهای بودجه" },
 { status: 500 }
 );
 }
}

/**
 * GET /api/budget/check-alerts — فقط فهرست هشدارهای فعال بدون ایجاد Notification
 */
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json({
 success: true,
 data: { triggered: [], checked: 0 },
 });
 }
 const tenantId = ctx.tenantId;
 if (!tenantId) {
 return NextResponse.json({
 success: true,
 data: { triggered: [], checked: 0 },
 });
 }
 const budgets = await db.budget.findMany({
 where: { tenantId, status: "ACTIVE" },
 include: { items: true },
 });
 const triggered: AlertResult[] = [];
 let checked = 0;
 for (const budget of budgets) {
 for (const item of budget.items) {
 checked++;
 const budgetAmt = Number(item.budgetAmount?? 0);
 const actualAmt = Number(item.actualAmount?? 0);
 if (budgetAmt <= 0) continue;
 const usagePercent = (actualAmt / budgetAmt) * 100;
 let severity: "WARNING" | "CRITICAL" | null = null;
 let message = "";
 if (usagePercent >= 100) {
 severity = "CRITICAL";
 message = `بودجه ${item.category} با ${(usagePercent - 100).toFixed(
 1
 )}٪ عبور کرده است (${item.period})`;
 } else if (usagePercent >= 80) {
 severity = "WARNING";
 message = `بودجه ${item.category} تا ${usagePercent.toFixed(
 0
 )}٪ مصرف شده است (${item.period})`;
 }
 if (severity) {
 triggered.push({
 budgetId: budget.id,
 budgetTitle: budget.title,
 category: item.category,
 period: item.period,
 budgetAmount: budgetAmt,
 actualAmount: actualAmt,
 usagePercent,
 severity,
 message,
 });
 }
 }
 }
 return NextResponse.json({
 success: true,
 data: { triggered, checked },
 });
 } catch (error) {
 console.error("Budget check-alerts GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بررسی هشدارهای بودجه" },
 { status: 500 }
 );
 }
}
