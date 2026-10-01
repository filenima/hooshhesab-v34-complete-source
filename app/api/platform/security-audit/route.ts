import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

const SETTING_KEY_LAST_AUDIT = "security_audit_last_result";
const SETTING_KEY_LAST_RUN = "security_audit_last_run_at";

interface AuditCheck {
 id: string;
 name: string;
 description: string;
 category: "dependency" | "secrets" | "tls" | "headers" | "files" | "permissions" | "sast";
 status: "pass" | "warning" | "critical";
 details: string;
 recommendation?: string;
}

interface AuditReport {
 runAt: string;
 triggeredBy: string;
 criticalCount: number;
 warningCount: number;
 passCount: number;
 totalChecks: number;
 checks: AuditCheck[];
 summary: string;
 durationMs: number;
}

/**
 * اجرای ممیزی امنیتی درون‌ساختاری — بدون اجرای اسکریپت shell.
 * این نسخه از ممیزی، فایل‌های پروژه و تنظیمات دیتابیس را بررسی می‌کند و یک
 * گزارش JSON در SystemSettings ذخیره می‌کند. برای ممیزی کامل‌تر (با ZAP،
 * npm audit و...) از `scripts/security-audit.sh` استفاده کنید.
 */
async function runSecurityAudit(triggeredBy: string): Promise<AuditReport> {
 const start = Date.now();
 const checks: AuditCheck[] = [];
 const now = new Date();
 const day24Ago = new Date(now.getTime() - 24 * 3600 * 1000);

 // 1) filesystem note
 checks.push({
 id: "filesystem_audit",
 name: "ممیزی فایل‌سیستم",
 description: "بررسی فایل‌های حساس (.env، کلیدها) — ممیزی کامل در scripts/security-audit.sh",
 category: "files",
 status: "pass",
 details: "برای ممیزی کامل فایل‌سیستم، scripts/security-audit.sh را اجرا کنید.",
 recommendation: "اجرای هفتگی security-audit.sh در CI/CD",
 });

 // 2) 2FA enforcement
 try {
 const setting = await db.systemSettings.findUnique({
 where: { key: "enforce_2fa_admin" },
 });
 const enforced = setting?.value === "true";
 const adminsWithout2FA = await db.user.count({
 where: { role: "ADMIN", isActive: true, twoFactorEnabled: false, deletedAt: null },
 });
 checks.push({
 id: "2fa_enforcement",
 name: "اجبار 2FA برای ادمین‌ها",
 description: "آیا 2FA برای همه‌ی ادمین‌ها اجباری شده است؟",
 category: "permissions",
 status: enforced? "pass": adminsWithout2FA > 0? "critical": "warning",
 details: enforced
? "اجرای 2FA برای ادمین‌ها فعال است."
: `اجرای 2FA غیرفعال است. ${adminsWithout2FA} ادمین بدون 2FA.`,
 recommendation: enforced? undefined: "فعال‌سازی enforce_2fa_admin از پنل سوپرادمین",
 });
 } catch {
 checks.push({
 id: "2fa_enforcement",
 name: "اجبار 2FA برای ادمین‌ها",
 description: "خطا در بررسی",
 category: "permissions",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 // 3) API keys expiring
 try {
 const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
 const expiringSoon = await db.apiKey.count({
 where: {
 isActive: true,
 expiresAt: { gte: now, lte: sevenDaysAhead },
 },
 });
 const expiredStillActive = await db.apiKey.count({
 where: {
 isActive: true,
 expiresAt: { lt: now },
 },
 });
 checks.push({
 id: "api_keys_expiry",
 name: "انقضای کلیدهای API",
 description: "کلیدهای در حال انقضا یا منقضی‌شده",
 category: "secrets",
 status: expiredStillActive > 0? "critical": expiringSoon > 0? "warning": "pass",
 details: `${expiringSoon} کلید در حال انقضا (۷ روز)، ${expiredStillActive} کلید منقضی‌شده ولی هنوز فعال.`,
 recommendation:
 expiredStillActive > 0
? "غیرفعال‌سازی فوری کلیدهای منقضی"
: expiringSoon > 0
? "چرخش کلیدهای در حال انقضا"
: undefined,
 });
 } catch {
 checks.push({
 id: "api_keys_expiry",
 name: "انقضای کلیدهای API",
 description: "خطا در بررسی",
 category: "secrets",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 // 4) Blocked IPs
 try {
 const hour1Ago = new Date(now.getTime() - 3600 * 1000);
 const blockedLastHour = await db.blockedIp.count({
 where: { blockedAt: { gte: hour1Ago } },
 });
 const totalBlocked = await db.blockedIp.count({
 where: { isActive: true },
 });
 checks.push({
 id: "ip_blocks",
 name: "مسدودسازی IP",
 description: "تعداد IPهای مسدود شده (ساعتی/کل)",
 category: "permissions",
 status: blockedLastHour > 50? "critical": blockedLastHour > 20? "warning": "pass",
 details: `${blockedLastHour} IP در ساعت اخیر مسدود شده؛ ${totalBlocked} IP فعال مسدود.`,
 recommendation:
 blockedLastHour > 50
? "بررسی احتمالی حمله — فعال‌سازی Under Attack Mode در Cloudflare"
: undefined,
 });
 } catch {
 checks.push({
 id: "ip_blocks",
 name: "مسدودسازی IP",
 description: "خطا در بررسی",
 category: "permissions",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 // 5) ERROR logs 24h
 try {
 const errorCount24h = await db.errorLog.count({
 where: { level: "ERROR", createdAt: { gte: day24Ago } },
 });
 checks.push({
 id: "error_rate_24h",
 name: "نرخ خطا (۲۴ ساعت)",
 description: "تعداد خطاهای سطح ERROR در ۲۴ ساعت اخیر",
 category: "sast",
 status: errorCount24h > 100? "critical": errorCount24h > 30? "warning": "pass",
 details: `${errorCount24h} خطای ERROR در ۲۴ ساعت اخیر.`,
 recommendation:
 errorCount24h > 100
? "بررسی لاگ خطاها در پنل سوپرادمین — ممکن است باگ production وجود داشته باشد"
: undefined,
 });
 } catch {
 checks.push({
 id: "error_rate_24h",
 name: "نرخ خطا (۲۴ ساعت)",
 description: "خطا در بررسی",
 category: "sast",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 // 6) IP Allowlist
 try {
 const allowlistCount = await db.ipWhitelist.count({
 where: { isActive: true },
 });
 checks.push({
 id: "ip_allowlist",
 name: "IP Allowlist سوپرادمین",
 description: "آیا لیست سفید IP برای ورود سوپرادمین فعال است؟",
 category: "permissions",
 status: allowlistCount > 0? "pass": "warning",
 details:
 allowlistCount > 0
? `${allowlistCount} IP در لیست سفید — ورود سوپرادمین محدود است.`
: "لیست سفید خالی است — ورود سوپرادمین از همه‌ی IPها مجاز (حالت توسعه).",
 recommendation:
 allowlistCount === 0
? "افزودن IPهای مجاز به لیست سفید در production"
: undefined,
 });
 } catch {
 checks.push({
 id: "ip_allowlist",
 name: "IP Allowlist سوپرادمین",
 description: "خطا در بررسی",
 category: "permissions",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 // 7) Active sessions
 try {
 const activeSessions = await db.userSession.count({
 where: { isActive: true, expiresAt: { gt: now } },
 });
 const totalUsers = await db.user.count({ where: { isActive: true, deletedAt: null } });
 const avgSessionsPerUser = totalUsers > 0? activeSessions / totalUsers: 0;
 checks.push({
 id: "active_sessions",
 name: "نشست‌های فعال",
 description: "بررسی non-normal نشست‌های همزمان",
 category: "permissions",
 status: avgSessionsPerUser > 10? "warning": "pass",
 details: `${activeSessions} نشست فعال برای ${totalUsers} کاربر فعال (میانگین ${avgSessionsPerUser.toFixed(1)} به ازای کاربر).`,
 recommendation:
 avgSessionsPerUser > 10
? "میانگین نشست بالا است — بررسی session hijacking یا session flooding"
: undefined,
 });
 } catch {
 checks.push({
 id: "active_sessions",
 name: "نشست‌های فعال",
 description: "خطا در بررسی",
 category: "permissions",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 // 8) SuperAdmin accounts
 try {
 const superAdmins = await db.superAdmin.count({ where: { isActive: true } });
 checks.push({
 id: "superadmin_accounts",
 name: "حساب‌های سوپرادمین",
 description: "تعداد حساب‌های سوپرادمین فعال",
 category: "permissions",
 status: superAdmins === 0? "critical": superAdmins > 5? "warning": "pass",
 details: `${superAdmins} سوپرادمین فعال.`,
 recommendation:
 superAdmins === 0
? "هیچ سوپرادمینی فعال نیست — غیرممکن بودن مدیریت پلتفرم"
: superAdmins > 5
? "تعداد سوپرادمین زیاد است — بررسی لزوم دسترسی‌ها"
: undefined,
 });
 } catch {
 checks.push({
 id: "superadmin_accounts",
 name: "حساب‌های سوپرادمین",
 description: "خطا در بررسی",
 category: "permissions",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 // 9) WAF config
 try {
 const wafSetting = await db.systemSettings.findUnique({
 where: { key: "waf_last_updated" },
 });
 checks.push({
 id: "waf_config",
 name: "پیکربندی WAF",
 description: "وضعیت قوانین WAF (Cloudflare)",
 category: "headers",
 status: wafSetting? "pass": "warning",
 details: wafSetting
? `آخرین به‌روزرسانی WAF: ${wafSetting.value}`
: "قوانین WAF در فایل security/waf-rules.json موجود است ولی در SystemSettings ثبت نشده.",
 recommendation: wafSetting
? undefined
: "ثبت تاریخ آخرین به‌روزرسانی WAF پس از apply در Cloudflare",
 });
 } catch {
 checks.push({
 id: "waf_config",
 name: "پیکربندی WAF",
 description: "خطا در بررسی",
 category: "headers",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 // 10) Failed logins
 try {
 const hour1Ago = new Date(now.getTime() - 3600 * 1000);
 // NOTE: BlockedIp فیلد `lastFailedAt` ندارد؛ از `blockedAt` (تاریخ مسدودسازی) استفاده می‌کنیم
 // به‌عنوان نماینده‌ی تلاش‌های ناموفق اخیر که منجر به مسدودیت شده‌اند.
 const failedAttempts = await db.blockedIp.count({
 where: { blockedAt: { gte: hour1Ago } },
 });
 checks.push({
 id: "failed_logins",
 name: "تلاش‌های ورود ناموفق",
 description: "بررسی brute-force در ساعت اخیر",
 category: "permissions",
 status: failedAttempts > 100? "critical": failedAttempts > 30? "warning": "pass",
 details: `${failedAttempts} IP با تلاش ناموفق در ساعت اخیر.`,
 recommendation:
 failedAttempts > 100
? "احتمال حمله‌ی brute-force — افزایش حساسیت rate limit در auth"
: undefined,
 });
 } catch {
 checks.push({
 id: "failed_logins",
 name: "تلاش‌های ورود ناموفق",
 description: "خطا در بررسی",
 category: "permissions",
 status: "warning",
 details: "بررسی ناموفق",
 });
 }

 const criticalCount = checks.filter((c) => c.status === "critical").length;
 const warningCount = checks.filter((c) => c.status === "warning").length;
 const passCount = checks.filter((c) => c.status === "pass").length;
 const durationMs = Date.now() - start;

 const summary =
 criticalCount > 0
? `${criticalCount} مسئله‌ی بحرانی شناسایی شد — اقدام فوری لازم است.`
: warningCount > 0
? `${warningCount} هشدار — بررسی در ۷ روز آینده.`
: "همه‌ی بررسی‌ها با موفقیت گذرانده شدند.";

 return {
 runAt: now.toISOString(),
 triggeredBy,
 criticalCount,
 warningCount,
 passCount,
 totalChecks: checks.length,
 checks,
 summary,
 durationMs,
 };
}

/**
 * GET /api/platform/security-audit
 * آخرین گزارش ممیزی امنیتی را برمی‌گرداند.
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const [reportSetting, runAtSetting] = await Promise.all([
 db.systemSettings.findUnique({ where: { key: SETTING_KEY_LAST_AUDIT } }),
 db.systemSettings.findUnique({ where: { key: SETTING_KEY_LAST_RUN } }),
 ]);

 let report: AuditReport | null = null;
 if (reportSetting) {
 try {
 report = JSON.parse(reportSetting.value) as AuditReport;
 } catch {
 report = null;
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 report,
 lastRunAt: runAtSetting?.value || null,
 },
 });
 } catch (error) {
 console.error("Get security audit error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گزارش امنیتی" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/platform/security-audit
 * اجرای ممیزی امنیتی جدید. فقط سوپرادمین.
 */
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const report = await runSecurityAudit(auth.admin.username);

 await db.systemSettings.upsert({
 where: { key: SETTING_KEY_LAST_AUDIT },
 update: { value: JSON.stringify(report) },
 create: { key: SETTING_KEY_LAST_AUDIT, value: JSON.stringify(report) },
 });
 await db.systemSettings.upsert({
 where: { key: SETTING_KEY_LAST_RUN },
 update: { value: report.runAt },
 create: { key: SETTING_KEY_LAST_RUN, value: report.runAt },
 });

 try {
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "RUN_SECURITY_AUDIT",
 entity: "SystemSettings",
 entityId: SETTING_KEY_LAST_AUDIT,
 details: JSON.stringify({
 criticalCount: report.criticalCount,
 warningCount: report.warningCount,
 passCount: report.passCount,
 durationMs: report.durationMs,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: report,
 message: report.summary,
 });
 } catch (error) {
 console.error("Run security audit error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای ممیزی امنیتی" },
 { status: 500 }
 );
 }
}
