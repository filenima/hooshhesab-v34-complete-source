// ============ Error Rate Alerting ============
// بررسی نرخ خطای ۵ دقیقه‌ای و ارسال هشدار در صورت عبور از آستانه.
//
// سطوح هشدار:
// - > 5٪ ارسال به Slack webhook + push notification به سوپرادمین
// - > 10٪ ایجاد اعلان urgent برای سوپرادمین + ارسال مجدد به Slack
//
// این تابع باید به‌صورت دوره‌ای (هر ۵ دقیقه) توسط یک cron job فراخوانی شود.
//
// متغیرهای محیطی:
// SLACK_WEBHOOK_URL — آدرس webhook برای ارسال هشدار (اختیاری)
// ERROR_ALERT_THRESHOLD_PCT — آستانه‌ی هشدار (پیش‌فرض ۵)
// ERROR_ALERT_URGENT_PCT — آستانه‌ی urgent (پیش‌فرض ۱۰)

import { db } from "@/lib/db";

const DEFAULT_ALERT_THRESHOLD_PCT = 5;
const DEFAULT_URGENT_THRESHOLD_PCT = 10;
const WINDOW_MINUTES = 5;

export interface ErrorRateCheckResult {
 windowMinutes: number;
 totalRequests: number;
 errorCount: number;
 errorRate: number; // درصد
 alertTriggered: boolean;
 alertLevel: "none" | "warning" | "urgent";
 slackSent: boolean;
 notificationCreated: boolean;
 checkedAt: string;
}

/**
 * بررسی نرخ خطا در ۵ دقیقه‌ی اخیر و ارسال هشدار در صورت لزوم.
 *
 * محاسبه:
 * - totalRequests = تعداد AuditLog در ۵ دقیقه (به‌عنوان مبنای کل درخواست‌ها)
 * - errorCount = تعداد ErrorLog با level=ERROR در همان بازه
 * - errorRate = (errorCount / totalRequests) * 100
 *
 * توجه: این یک تقریب است چون AuditLog فقط درخواست‌های احراز‌شده را ثبت می‌کند.
 * برای دقت بالاتر می‌توان از access logs یا یک meter سیستم استفاده کرد.
 */
export async function checkErrorRate(): Promise<ErrorRateCheckResult> {
 const now = new Date();
 const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

 const [errorCount, totalRequests] = await Promise.all([
 db.errorLog.count({
 where: {
 level: "ERROR",
 createdAt: { gte: windowStart },
 },
 }),
 // تخمین کل درخواست‌ها: تعداد AuditLog در همان بازه
 // اگر AuditLog کمیاب است، حداقل ۱۰۰ فرض می‌کنیم تا false positive جلوگیری شود
 db.auditLog.count({
 where: {
 createdAt: { gte: windowStart },
 },
 }),
 ]);

 // اگر totalRequests صفر است، از errorCount به‌عنوان مبنای استفاده کن
 // (این یعنی فقط خطا ثبت شده — یعنی نرخ خطای ۱۰۰٪)
 const effectiveTotal = Math.max(totalRequests, errorCount, 100);
 const errorRate = Math.round((errorCount / effectiveTotal) * 1000) / 10;

 const alertThreshold = Number(
 process.env.ERROR_ALERT_THRESHOLD_PCT || DEFAULT_ALERT_THRESHOLD_PCT
 );
 const urgentThreshold = Number(
 process.env.ERROR_ALERT_URGENT_PCT || DEFAULT_URGENT_THRESHOLD_PCT
 );

 let alertLevel: ErrorRateCheckResult["alertLevel"] = "none";
 if (errorRate >= urgentThreshold) {
 alertLevel = "urgent";
 } else if (errorRate >= alertThreshold) {
 alertLevel = "warning";
 }

 if (alertLevel === "none") {
 return {
 windowMinutes: WINDOW_MINUTES,
 totalRequests: effectiveTotal,
 errorCount,
 errorRate,
 alertTriggered: false,
 alertLevel,
 slackSent: false,
 notificationCreated: false,
 checkedAt: now.toISOString(),
 };
 }

 // ===== ارسال هشدار به Slack =====
 const message = formatSlackMessage(errorRate, errorCount, effectiveTotal, alertLevel, now);
 const slackSent = await sendSlackAlert(message).catch((err) => {
 console.error("[error-alerting] Slack send failed:", err);
 return false;
 });

 // ===== ایجاد اعلان برای سوپرادمین =====
 let notificationCreated = false;
 try {
 // برای همه‌ی tenantها یک Notification عمومی ایجاد نمی‌کنیم؛
 // به‌جای آن، در SystemSettings ثبت می‌کنیم تا در پنل سوپرادمین نمایش داده شود.
 const alertKey = `error_alert_${now.toISOString().slice(0, 16)}`; // دقیقه‌ای
 const existing = await db.systemSettings.findUnique({
 where: { key: alertKey },
 });
 if (!existing) {
 await db.systemSettings.create({
 data: {
 key: alertKey,
 value: JSON.stringify({
 level: alertLevel,
 errorRate,
 errorCount,
 totalRequests: effectiveTotal,
 timestamp: now.toISOString(),
 message:
 alertLevel === "urgent"
? `هشدار فوری: نرخ خطای پلتفرم در ۵ دقیقه‌ی اخیر ${errorRate}٪ بوده است (${errorCount} خطا از ${effectiveTotal} درخواست).`
: `هشدار: نرخ خطای پلتفرم در ۵ دقیقه‌ی اخیر ${errorRate}٪ بوده است.`,
 }),
 },
 });
 notificationCreated = true;
 }
 } catch (err) {
 console.error("[error-alerting] Notification creation failed:", err);
 }

 return {
 windowMinutes: WINDOW_MINUTES,
 totalRequests: effectiveTotal,
 errorCount,
 errorRate,
 alertTriggered: true,
 alertLevel,
 slackSent,
 notificationCreated,
 checkedAt: now.toISOString(),
 };
}

/**
 * ارسال پیام به Slack webhook.
 *
 * اگر SLACK_WEBHOOK_URL تنظیم نشده باشد، هیچ کاری نمی‌کند.
 * پیام در فرمت Slack Block Kit ارسال می‌شود.
 *
 * @param message متن پیام (می‌تواند شامل markdown باشد)
 */
export async function sendSlackAlert(message: string): Promise<boolean> {
 const webhookUrl = process.env.SLACK_WEBHOOK_URL;
 if (!webhookUrl) {
 // بدون webhook، فقط در کنسول لاگ می‌کنیم
 console.warn("[slack] SLACK_WEBHOOK_URL not set — alert not sent:", message);
 return false;
 }

 const payload = {
 text: message,
 blocks: [
 {
 type: "header",
 text: {
 type: "plain_text",
 text: "Hoosh Error Alert",
 },
 },
 {
 type: "section",
 text: {
 type: "mrkdwn",
 text: message,
 },
 },
 {
 type: "context",
 elements: [
 {
 type: "mrkdwn",
 text: `*Environment:* ${process.env.NODE_ENV || "development"}\n*Time:* ${new Date().toISOString()}`,
 },
 ],
 },
 ],
 };

 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 5000);

 try {
 const res = await fetch(webhookUrl, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 signal: controller.signal,
 });
 clearTimeout(timeout);
 return res.ok;
 } catch (err) {
 clearTimeout(timeout);
 console.error("[slack] webhook call failed:", err);
 return false;
 }
}

function formatSlackMessage(
 errorRate: number,
 errorCount: number,
 totalRequests: number,
 level: "warning" | "urgent",
 now: Date
): string {
 const emoji = level === "urgent"? ":rotating_light:": ":warning:";
 return [
 `${emoji} *${level === "urgent"? "URGENT": "WARNING"} — Error Rate Alert*`,
 "",
 `*Error Rate:* ${errorRate}% (in last ${WINDOW_MINUTES} minutes)`,
 `*Errors:* ${errorCount}`,
 `*Total Requests:* ${totalRequests}`,
 `*Time:* ${now.toISOString()}`,
 "",
 level === "urgent"
? "Immediate investigation required. Check superadmin panel Error Logs."
: "Monitor the situation. Check superadmin panel Error Logs if it persists.",
 ].join("\n");
}
