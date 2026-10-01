import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { rateLimitCheck } from "@/lib/rate-limit";
import { toJalali, toPersianDigits } from "@/lib/persian";
// FIX(v10-ai هم‌راستا): موتور یکپارچه — کلید/مدل دلخواه سوپرادمین
import { chatComplete, getAiProviderSettings } from "@/lib/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================================
// /api/platform/root-ai — «روت» ایجنت اجرایی سوپرادمین (Task 21-D)
// ----------------------------------------------------------------------------
// ارتقای کامل: از «چت با زمینه آماری» به ایجنت واقعی با پروتکل
// TOOL_CALL / TOOL_RESULT (همان پروتکل هوش‌یار):
//   query_platform_stats, query_active_users, query_plan_distribution,
//   query_churn_risk, query_bug_reports, query_payments_recent,
//   query_saan_health  (خواندنی)
//   send_broadcast     (جهش‌دار — پشت پرچم confirm + PlatformAuditLog)
//
// پشتیبانی استریم: حلقه ابزار غیراستریم اجرا می‌شود و «پاسخ نهایی» به‌صورت
// SSE با chunk های کوچک استریم می‌شود (سازگار با UI موجود + رویداد meta).
// ============================================================================

const MAX_MESSAGES = 40;
const MAX_TOOL_ITERATIONS = 6;
const MAX_MESSAGE_LENGTH = 8000;

const BROADCAST_TYPES = ["INFO", "WARNING", "PROMO", "FEATURE"] as const;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ExecutedAction {
  tool: string;
  label: string;
  success: boolean;
  summary: string;
}

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  invalid: boolean;
}

const KNOWN_TOOLS = [
  "query_platform_stats",
  "query_active_users",
  "query_plan_distribution",
  "query_churn_risk",
  "query_bug_reports",
  "query_payments_recent",
  "query_saan_health",
  "send_broadcast",
];

// ============ Helpers ============
function toStr(v: unknown, def = ""): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return def;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** فراخوانی LLM با retry برای خطای 429 */
async function callLLM(
  zai: Awaited<ReturnType<typeof ZAI.create>> | null,
  messages: Array<{ role: "assistant" | "user" | "system"; content: string }>,
  retries = 2
): Promise<string> {
  let lastErr: unknown = null;
  const backoffs = [3000, 8000];
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (!zai) {
        const result = await chatComplete(messages, { stream: false });
        return result.text;
      }
      const completion = await zai.chat.completions.create({
        messages: messages as Array<{ role: "assistant" | "user"; content: string }>,
        thinking: { type: "disabled" },
      });
      return completion?.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = msg.includes("429") || msg.toLowerCase().includes("too many requests");
      if (!retryable || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, backoffs[attempt] ?? 8000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("خطای ناشناخته LLM");
}

// ============ System prompt ============
function buildRootSystemPrompt(statsText: string): string {
  return `تو «روت» هستی — ایجنت سوپرادمین پلتفرم حسابداری «هوش». با مدیر پلتفرم (سوپرادمین) فارسی صحبت می‌کنی و به داده‌های زندهٔ کل پلتفرم دسترسی و «ابزار اجرایی» داری.

## نقش تو
ایجنت مدیریتی proactive هستی: نه فقط پاسخ‌دهنده. آمار را می‌خوانی، ریسک‌ها (ریزش مشتری، خطای درگاه، باگ‌های بحرانی) را خودت کشف می‌کنی و «اقدام بعدی مشخص با عدد» پیشنهاد می‌دهی.

## ممنوعیت «انداختن کار به گردن کاربر» (بحرانی)
- هرگز نگو «باید خودت از پنل درستش کنی» / «این کار از پنل مدیریت انجام می‌شود» و مشابه آن.
- هر داده‌ای که لازم داری را با ابزار query بخوان؛ برای اطلاعیه همگانی send_broadcast را صدا بزن.
- فقط کارهای ذاتاً خارج از دست تو (مثلاً تغییر رمز سوپرادمین، پرداخت واقعی پول) را با دلیل دقیق رد کن و نزدیک‌ترین جایگزین را بده.

## پروتکل ابزار (دقیقاً رعایت کن)
- برای داده یا عمل، کل خروجی تو باید «دقیقاً یک خط» باشد:
TOOL_CALL: {"tool":"نام_ابزار","args":{...}}
- بعدش هیچ متن دیگری ننویس. نتیجه با TOOL_RESULT: برمی‌گردد؛ پشت‌سرهم یکی‌یکی ابزار بزن.
- وقتی کافی داری، پاسخ نهایی فارسی مارک‌داون بده (بدون TOOL_CALL).

## ابزارها
1. query_platform_stats — آمار کلی: سازمان‌ها/کاربران/لایسنس/خطا/ورود امروز. args: {}
2. query_active_users — فعالیت اخیر کاربران (نشست‌های فعال، ورود روزهای ۷ روز اخیر، دستگاه‌ها). args: {}
3. query_plan_distribution — توزیع پلن‌ها + درآمد تخمینی هر پلن + فعال/غیرفعال. args: {}
4. query_churn_risk — سازمان‌های ریسک ریزش (غیرفعال ۳۰ روز+ / تریال سر رفته / معلق). args: {"limit":15}
5. query_bug_reports — گزارش‌های باگ باز با شدت و ماژول. args: {"status":"OPEN|IN_REVIEW|all","limit":15}
6. query_payments_recent — آخرین رویدادهای درگاه پرداخت (موفق/ناموفق/آزمایشی) + خطاهای پرداخت ۷ روز. args: {"limit":10}
7. query_saan_health — سلامت زیرساخت: دیتابیس/realtime/حافظه/خطاها. args: {}
8. send_broadcast — ارسال اطلاعیه درون‌برنامه‌ای به همه کاربران. args: {"title":"...","body":"...","type":"INFO|WARNING|PROMO|FEATURE","confirm":false}
   ابتدا با confirm:false پیش‌نویس را بساز؛ پس از تأیید صریح سوپرادمین (پیام «تأیید/بفرست») دوباره با همان title و body و "confirm":true صدا بزن.

## قواعد رفتار
۱) سوال آماری → اول ابزار query مربوطه، بعد پاسخ با عدد واقعی. هرگز عدد نساز.
۲) تحلیل مدیریتی: همیشه «عدد + تفسیر + اقدام پیشنهادی مشخص» بده (مثلاً: «۳ سازمان با پلن حرفه‌ای ۴۵+ روز غیرفعال‌اند — پیشنهاد: کمپین بازگشت یا تماس»).
۳) proactive: اگر در داده‌ها نشانهٔ ریسک دیدی (ریزش/خطای درگاه/باگ critical) خودت اعلام کن حتی اگر پرسیده نشده.
۴) send_broadcast فقط با تأیید صریح. متن دقیق عنوان/متن را در پاسخ نشان بده تا سوپرادمین ببیند چه ارسال می‌شود.
۵) پاسخ نهایی: فارسی، مارک‌داون (bullet/bold/جدول کوتاه)، اعداد فارسی، مبالغ تومان با جداکننده هزارگان. آخر پاسخ یک «قدم بعدی» پیشنهادی.
۶) صداقت اجرا: فقط با دیدن TOOL_RESULT موفق بگو «انجام شد».
۷) لینک/URL از خودت نساز؛ نام ماژول پنل را بگو (مثل «تب پیام‌رسانی گروهی»).
۸) تاریخ امروز شمسی: ${currentJalaliToday()}

--- آمار سریع سیستم (آخرین snapshot) ---
${statsText}
--- پایان snapshot — برای عدد تازه ابزار query بزن ---`;
}

function currentJalaliToday(): string {
  try {
    return toJalali(new Date());
  } catch {
    return "";
  }
}

// ============ TOOL_CALL parser (همان پروتکل هوش‌یار) ============
function parseToolCall(reply: string): ToolCall | null {
  if (!reply) return null;
  const tryParse = (raw: string): ToolCall | null => {
    const jsonPart = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const start = jsonPart.indexOf("{");
    if (start === -1) return { tool: "", args: {}, invalid: true };
    const end = jsonPart.lastIndexOf("}");
    if (end <= start) return { tool: "", args: {}, invalid: true };
    try {
      const parsed = JSON.parse(jsonPart.slice(start, end + 1)) as {
        tool?: unknown;
        args?: unknown;
      };
      if (parsed && typeof parsed.tool === "string" && parsed.tool) {
        return {
          tool: parsed.tool,
          args:
            parsed.args && typeof parsed.args === "object"
              ? (parsed.args as Record<string, unknown>)
              : {},
          invalid: false,
        };
      }
      return { tool: "", args: {}, invalid: true };
    } catch {
      return { tool: "", args: {}, invalid: true };
    }
  };

  const lines = reply.split("\n").map((l) => l.trim());
  if (lines[0].startsWith("TOOL_CALL:")) {
    return tryParse(lines[0].slice("TOOL_CALL:".length));
  }
  for (const line of lines) {
    const cleaned = line.replace(/^```(?:json)?\s*/i, "").trim();
    if (cleaned.startsWith("TOOL_CALL:")) {
      return tryParse(cleaned.slice("TOOL_CALL:".length));
    }
  }
  const idx = reply.indexOf("TOOL_CALL:");
  if (idx !== -1) {
    const rest = reply
      .slice(idx + "TOOL_CALL:".length)
      .replace(/```(?:json)?/gi, "")
      .trim();
    const start = rest.indexOf("{");
    const end = rest.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return tryParse(rest.slice(start, end + 1));
    }
  }
  return null;
}

// ============ Tool: query_platform_stats ============
async function toolQueryPlatformStats() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalTenants,
    activeTenants,
    suspendedTenants,
    trialTenants,
    totalUsers,
    activeUsersToday,
    totalLicenses,
    activeLicenses,
    expiringLicenses,
    totalInvoices,
    todayErrors,
    weekErrors,
    blockedIps,
    blogPosts,
    recentSignups,
  ] = await Promise.all([
    db.tenant.count(),
    db.tenant.count({ where: { status: "active" } }),
    db.tenant.count({ where: { status: { in: ["suspended", "cancelled"] } } }),
    db.tenant.count({ where: { status: "trial" } }),
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { lastLogin: { gte: todayStart }, deletedAt: null } }),
    db.license.count(),
    db.license.count({ where: { status: "ACTIVE" } }),
    db.license.count({
      where: { status: "ACTIVE", endDate: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) } },
    }),
    db.invoice.count(),
    db.errorLog.count({ where: { createdAt: { gte: todayStart } } }),
    db.errorLog.count({ where: { createdAt: { gte: weekAgo } } }),
    db.blockedIp.count({ where: { isActive: true } }),
    db.blogPost.count(),
    db.tenant.findMany({
      where: { createdAt: { gte: weekAgo } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { name: true, plan: true, createdAt: true },
    }),
  ]);

  // v33-c (درآمد صادقانه): درآمد تخمینی فقط از لایسنس‌های «خریداری‌شده»
  // (source="purchase") محاسبه می‌شود — قبلاً همهٔ tenantها (حتی تریال) ×
  // قیمت پلن حساب می‌شدند و عددی غیرواقعی به دستیار داده می‌شد.
  const planPrices: Record<string, number> = {
    starter: 4_900_000,
    business: 9_900_000,
    enterprise: 24_900_000,
    accountant: 7_900_000,
    free: 0,
    basic: 9_750_000,
    pro: 13_900_000,
  };
  const purchasedLicenses = await db.license.findMany({
    where: { source: "purchase" },
    select: { plan: true, status: true, amountToman: true },
  });
  let estimatedRevenue = 0;
  for (const lic of purchasedLicenses) {
    if (lic.status !== "ACTIVE") continue;
    estimatedRevenue += lic.amountToman ?? planPrices[lic.plan] ?? 0;
  }

  return {
    tenants: { total: totalTenants, active: activeTenants, suspendedOrCancelled: suspendedTenants, trial: trialTenants },
    users: { total: totalUsers, loggedInToday: activeUsersToday },
    licenses: { total: totalLicenses, active: activeLicenses, expiringWithin30d: expiringLicenses },
    invoicesTotal: totalInvoices,
    errors: { today: todayErrors, week: weekErrors },
    security: { blockedIps },
    content: { blogPosts },
    estimatedAnnualRevenueToman: fmt(estimatedRevenue),
    purchasedLicenses: purchasedLicenses.length,
    recentSignups: recentSignups.map((t) => ({
      name: t.name,
      plan: t.plan,
      createdAt: toJalali(t.createdAt),
    })),
    note: "درآمد سالانه فقط از لایسنس‌های خریداری‌شده (source=purchase) — لایسنس تریال درآمد حساب نمی‌شود.",
  };
}

/** متن snapshot کوتاه برای پرامپت — همان دادهٔ آماری کلیدی */
async function buildStatsSnapshot(): Promise<string> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [totalTenants, activeTenants, totalUsers, loggedInToday, weekErrors, openBugs] =
      await Promise.all([
        db.tenant.count().catch(() => 0),
        db.tenant.count({ where: { status: "active" } }).catch(() => 0),
        db.user.count({ where: { deletedAt: null } }).catch(() => 0),
        db.user.count({ where: { lastLogin: { gte: todayStart }, deletedAt: null } }).catch(() => 0),
        db.errorLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } } }).catch(() => 0),
        db.bugReport.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }).catch(() => 0),
      ]);
    return `- سازمان‌ها: ${toPersianDigits(String(totalTenants))} (فعال ${toPersianDigits(
      String(activeTenants)
    )})\n- کاربران: ${toPersianDigits(String(totalUsers))} — ورود امروز ${toPersianDigits(
      String(loggedInToday)
    )}\n- خطاهای ۷ روز: ${toPersianDigits(String(weekErrors))} | باگ‌های باز: ${toPersianDigits(
      String(openBugs)
    )}`;
  } catch {
    return "- (آمار در دسترس نیست)";
  }
}

// ============ Tool: query_active_users ============
async function toolQueryActiveUsers() {
  const now = new Date();
  const days: Array<{ label: string; date: Date }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ label: toJalali(d), date: d });
  }
  const dayStarts = days.map((d) => d.date);
  const [activeSessions, sessionDays, topDevices, loggedInWeek, newUsersWeek] = await Promise.all([
    db.userSession.count({ where: { isActive: true, expiresAt: { gt: now } } }),
    Promise.all(
      dayStarts.map((start, idx) =>
        db.userSession
          .count({ where: { lastUsedAt: { gte: start, lt: dayStarts[idx - 1] ?? now } } })
          .then((count) => ({ label: days[idx].label, count }))
      )
    ),
    db.userSession.groupBy({
      by: ["deviceName"],
      where: { isActive: true, lastUsedAt: { gte: new Date(now.getTime() - 7 * 86400000) } },
      _count: true,
      orderBy: { _count: { deviceName: "desc" } },
      take: 5,
    }),
    db.user.count({ where: { lastLogin: { gte: new Date(now.getTime() - 7 * 86400000) }, deletedAt: null } }),
    db.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * 86400000) }, deletedAt: null } }),
  ]);
  return {
    activeSessionsNow: activeSessions,
    usersLoggedInLast7d: loggedInWeek,
    newUsersLast7d: newUsersWeek,
    sessionsByDay: sessionDays.reverse(),
    topDevices: topDevices.map((d) => ({
      device: d.deviceName || "نامشخص",
      sessions: d._count,
    })),
    note: "sessionsByDay تعداد نشست‌های «استفاده‌شده» در هر روز است (lastUsedAt).",
  };
}

// ============ Tool: query_plan_distribution ============
async function toolQueryPlanDistribution() {
  const grouped = await db.tenant.groupBy({ by: ["plan", "status"], _count: true });
  const planFa: Record<string, string> = {
    starter: "استارتر",
    business: "بیزینس",
    enterprise: "سازمانی",
    accountant: "حسابدار",
    free: "رایگان",
    basic: "پایه",
    pro: "حرفه‌ای",
  };
  const planPrices: Record<string, number> = {
    starter: 4_900_000,
    business: 9_900_000,
    enterprise: 24_900_000,
    accountant: 7_900_000,
    free: 0,
    basic: 9_750_000,
    pro: 13_900_000,
  };
  const byPlan = new Map<string, { plan: string; label: string; total: number; active: number; suspended: number; trial: number }>();
  for (const g of grouped) {
    const cur =
      byPlan.get(g.plan) ??
      { plan: g.plan, label: planFa[g.plan] || g.plan, total: 0, active: 0, suspended: 0, trial: 0 };
    cur.total += g._count;
    if (g.status === "active") cur.active += g._count;
    else if (g.status === "trial") cur.trial += g._count;
    else cur.suspended += g._count;
    byPlan.set(g.plan, cur);
  }
  // v33-c (قاعدهٔ صادقانه): درآمد تخمینی هر پلن فقط از لایسنس‌های
  // «خریداری‌شده» (source="purchase") محاسبه می‌شود — قبلاً تعداد tenantهای
  // فعال × قیمت پلن بود و تریال‌ها درآمد ساختگی می‌ساختند.
  // مبلغ هر لایسنس = amountToman ثبت‌شده یا قیمت پایهٔ پلن.
  const purchasedLicensesByPlan = await db.license.findMany({
    where: { source: "purchase", status: "ACTIVE" },
    select: { plan: true, amountToman: true },
  });
  const purchasedRevenueByPlan = new Map<string, number>();
  for (const lic of purchasedLicensesByPlan) {
    const yearly = lic.amountToman?? planPrices[lic.plan]?? 0;
    purchasedRevenueByPlan.set(lic.plan, (purchasedRevenueByPlan.get(lic.plan) ?? 0) + yearly);
  }
  const rows = Array.from(byPlan.values())
    .map((r) => ({
      ...r,
      estimatedAnnualRevenueToman: fmt(purchasedRevenueByPlan.get(r.plan) ?? 0),
    }))
    .sort((a, b) => b.total - a.total);
  return {
    plans: rows,
    totalTenants: rows.reduce((s, r) => s + r.total, 0),
    note: "درآمد سالانهٔ هر پلن فقط از لایسنس‌های خریداری‌شدهٔ فعال (source=purchase) — تریال درآمد نیست.",
  };
}

// ============ Tool: query_churn_risk ============
async function toolQueryChurnRisk(args: Record<string, unknown>) {
  const limit = Math.min(Math.max(1, Math.round(Number(args.limit ?? 15) || 15)), 50);
  const now = Date.now();
  const days30 = new Date(now - 30 * 86400000);

  const tenants = await db.tenant.findMany({
    where: {},
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      plan: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      users: { select: { lastLogin: true }, take: 5 },
    },
  });

  const rows: Array<{
    tenant: string;
    plan: string;
    status: string;
    daysSinceActivity: number;
    lastLogin: string | null;
    risk: "بالا" | "متوسط" | "کم";
    reason: string;
  }> = [];
  for (const t of tenants) {
    const logins = t.users.map((u) => u.lastLogin?.getTime() ?? 0);
    const lastActivity = Math.max(t.updatedAt.getTime(), ...logins, 0);
    const daysSince = lastActivity ? Math.floor((now - lastActivity) / 86400000) : 999;
    let risk: "بالا" | "متوسط" | "کم" = "کم";
    let reason = "فعال";
    if (t.status !== "active" && t.status !== "trial") {
      risk = "بالا";
      reason = `وضعیت سازمان «${t.status}»`;
    } else if (daysSince >= 30 || lastActivity === 0) {
      risk = "بالا";
      reason = lastActivity === 0 ? "هیچ ورودی ثبت نشده" : `${daysSince} روز بدون فعالیت`;
    } else if (daysSince >= 14) {
      risk = "متوسط";
      reason = `${daysSince} روز بدون فعالیت`;
    } else {
      continue; // فعال — وارد لیست ریسک نمی‌شود
    }
    const lastLoginDate = logins.length ? new Date(Math.max(...logins)) : null;
    rows.push({
      tenant: t.name,
      plan: t.plan,
      status: t.status,
      daysSinceActivity: lastActivity === 0 ? 9999 : daysSince,
      lastLogin: lastLoginDate ? toJalali(lastLoginDate) : null,
      risk,
      reason,
    });
  }
  const sorted = rows.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity).slice(0, limit);
  return {
    riskCount: { high: rows.filter((r) => r.risk === "بالا").length, medium: rows.filter((r) => r.risk === "متوسط").length },
    tenants: sorted,
    note: "ریزش = ۳۰+ روز بی‌فعالیت یا وضعیت غیرفعال. daysSinceActivity=۹۹۹۹ یعنی هیچ ورودی ثبت نشده. پیشنهاد: اطلاعیه بازگشت (send_broadcast) یا تماس مستقیم.",
  };
}

// ============ Tool: query_bug_reports ============
async function toolQueryBugReports(args: Record<string, unknown>) {
  const status = toStr(args.status, "all").toUpperCase();
  const limit = Math.min(Math.max(1, Math.round(Number(args.limit ?? 15) || 15)), 50);
  // پیش‌فرض: باز + در حال بررسی (آمار «همه» از openCounts می‌آید)
  const where: Record<string, unknown> =
    status === "OPEN"
      ? { status: "OPEN" }
      : status === "IN_REVIEW"
        ? { status: "IN_REVIEW" }
        : { status: { in: ["OPEN", "IN_REVIEW"] } };

  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const [reports, severityAgg] = await Promise.all([
    db.bugReport.findMany({
      where,
      take: limit * 2,
      include: { tenant: { select: { name: true } }, user: { select: { name: true, email: true } } },
    }),
    db.bugReport.groupBy({ by: ["severity", "status"], where: { status: { in: ["OPEN", "IN_REVIEW"] } }, _count: true }),
  ]);
  const sortedReports = reports
    .sort(
      (a, b) =>
        (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) ||
        b.createdAt.getTime() - a.createdAt.getTime()
    )
    .slice(0, limit);

  const severityFa: Record<string, string> = {
    critical: "بحرانی",
    high: "بالا",
    medium: "متوسط",
    low: "کم",
  };
  const counts = new Map<string, number>();
  for (const g of severityAgg) {
    counts.set(g.severity, (counts.get(g.severity) ?? 0) + g._count);
  }
  return {
    openCounts: {
      critical: counts.get("critical") ?? 0,
      high: counts.get("high") ?? 0,
      medium: counts.get("medium") ?? 0,
      low: counts.get("low") ?? 0,
    },
    reports: sortedReports.map((r) => ({
      title: r.title,
      tenant: r.tenant?.name || "—",
      reporter: r.user?.name || r.user?.email || "—",
      severity: severityFa[r.severity] || r.severity,
      module: r.module || "—",
      status: r.status,
      createdAt: toJalali(r.createdAt),
      description: r.description.slice(0, 200),
    })),
    note: "باگ‌های critical/high پس از تأیید خودکار پاداش می‌گیرند (critical=۳۰ روز حرفه‌ای، high=۱۵ روز).",
  };
}

// ============ Tool: query_payments_recent ============
async function toolQueryPaymentsRecent(args: Record<string, unknown>) {
  const limit = Math.min(Math.max(1, Math.round(Number(args.limit ?? 10) || 10)), 30);
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [integrations, paymentErrors, paymentAlerts] = await Promise.all([
    db.integration.findMany({
      where: { type: "PAYMENT" },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { name: true, status: true, config: true, updatedAt: true, tenantId: true },
    }),
    db.errorLog.count({
      where: { createdAt: { gte: weekAgo }, OR: [{ message: { contains: "payment" } }, { message: { contains: "zarinpal" } }, { message: { contains: "پرداخت" } }] },
    }),
    db.platformAuditLog.count({
      where: { action: "HEALTH_ALERT", createdAt: { gte: weekAgo }, details: { contains: "payment" } },
    }),
  ]);

  const tenantIds = Array.from(new Set(integrations.map((i) => i.tenantId)));
  const tenants = tenantIds.length
    ? await db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
    : [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  const events = integrations.map((i) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(i.config) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return {
      tenant: tenantMap.get(i.tenantId) || "—",
      name: i.name,
      status: i.status,
      updatedAt: toJalali(i.updatedAt),
      summary: {
        sandbox: parsed.sandbox,
        lastStatus: parsed.lastStatus ?? parsed.status ?? null,
        amount: parsed.amount ?? null,
        authority: parsed.authority ?? null,
        error: parsed.error ?? parsed.errorMessage ?? null,
      },
    };
  });
  return {
    events,
    paymentErrorLogs7d: paymentErrors,
    paymentHealthAlerts7d: paymentAlerts,
    note: "رویدادهای درگاه از Integration type=PAYMENT (تست/پرداخت) و خطاهای لاگ ۷ روز اخیر. خطای verify = HEALTH_ALERT.",
  };
}

// ============ Tool: query_saan_health ============
async function toolQuerySaanHealth() {
  const startTime = Date.now();
  const dbStart = Date.now();
  let dbStatus: "up" | "down" = "up";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "down";
  }
  const dbLatency = Date.now() - dbStart;

  let realtimeStatus: "up" | "down" = "down";
  let realtimeLatency = 0;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const rtStart = Date.now();
    await fetch(`http://localhost:3032/socket.io/?EIO=4&transport=polling`, {
      signal: controller.signal,
    });
    realtimeLatency = Date.now() - rtStart;
    realtimeStatus = "up";
    clearTimeout(timeout);
  } catch {
    realtimeStatus = "down";
  }

  const since = new Date(Date.now() - 86400000);
  const [errors24h, warnings24h, activeTenants, activeSessions, trialTenants] = await Promise.all([
    db.errorLog.count({ where: { level: "ERROR", createdAt: { gte: since } } }).catch(() => 0),
    db.errorLog.count({ where: { level: "WARN", createdAt: { gte: since } } }).catch(() => 0),
    db.tenant.count({ where: { status: "active" } }).catch(() => 0),
    db.userSession.count({ where: { isActive: true, expiresAt: { gt: new Date() } } }).catch(() => 0),
    db.tenant.count({ where: { status: "trial" } }).catch(() => 0),
  ]);
  const mem = process.memoryUsage();
  const status = dbStatus === "up" && realtimeStatus === "up" ? "healthy" : dbStatus === "up" ? "degraded" : "down";
  return {
    status,
    services: {
      database: { status: dbStatus, latencyMs: dbLatency },
      realtime: { status: realtimeStatus, port: 3032, latencyMs: realtimeLatency },
      ai: { status: "up" },
    },
    metrics: {
      errors24h,
      warnings24h,
      activeTenants,
      activeSessions,
      trialTenants,
    },
    memory: {
      rssMb: Math.round(mem.rss / 1048576),
      heapUsedMb: Math.round(mem.heapUsed / 1048576),
      heapTotalMb: Math.round(mem.heapTotal / 1048576),
    },
    responseTimeMs: Date.now() - startTime,
    note: "healthy = همه سرویس‌ها بالا. اگر errors24h بالاست، query_bug_reports و لاگ خطاها را بررسی کن.",
  };
}

// ============ Tool: send_broadcast (جهش‌دار — پشت پرچم confirm) ============
async function toolSendBroadcast(
  adminId: string,
  args: Record<string, unknown>,
  ip: string
): Promise<{ result: Record<string, unknown>; action: ExecutedAction }> {
  const title = toStr(args.title);
  const body = toStr(args.body);
  const type = toStr(args.type, "INFO").toUpperCase();
  const confirm = args.confirm === true;

  if (!title || !body) {
    return {
      result: {
        error: "برای اطلاعیه همگانی، title و body الزامی است. متن دقیق را از سوپرادمین بگیر.",
      },
      action: { tool: "send_broadcast", label: "ارسال اطلاعیه همگانی", success: false, summary: "عنوان/متن ناقص" },
    };
  }

  if (!confirm) {
    // دروازهٔ تأیید — بدون confirm:true هیچ پیامی ساخته نمی‌شود
    return {
      result: {
        pending: true,
        requiresConfirmation: true,
        draft: { title, body, type },
        instruction:
          "پیش‌نویس آماده است. برای ارسال واقعی، از سوپرادمین تأیید صریح بگیر (پیام «تأیید — بفرست») و بعد send_broadcast را با همان title/body و confirm=true صدا بزن.",
      },
      action: {
        tool: "send_broadcast",
        label: "پیش‌نویس اطلاعیه «" + title.slice(0, 40) + "»",
        success: true,
        summary: "در انتظار تأیید سوپرادمین",
      },
    };
  }

  const normType = (BROADCAST_TYPES as readonly string[]).includes(type) ? type : "INFO";
  const msg = await db.inAppMessage.create({
    data: {
      title,
      body,
      type: normType,
      targetRole: "all",
      dismissible: true,
      isActive: true,
    },
  });

  // PlatformAuditLog با superAdminId — هرگز db.auditLog (FK tenant/user ندارد)
  try {
    await db.platformAuditLog.create({
      data: {
        superAdminId: adminId,
        action: "ROOT_AI_BROADCAST",
        entity: "InAppMessage",
        entityId: msg.id,
        details: JSON.stringify({ title, type: normType, via: "root-ai", bodyLength: body.length }),
        ipAddress: ip,
      },
    });
  } catch (err) {
    // audit نباید ارسال را بشکند
    console.error("[root-ai] broadcast audit error:", err);
  }

  return {
    result: {
      sent: true,
      messageId: msg.id,
      title,
      type: normType,
      audience: "همه کاربران (اعلان درون‌برنامه‌ای)",
    },
    action: {
      tool: "send_broadcast",
      label: "اطلاعیه «" + title.slice(0, 40) + "» برای همه کاربران ارسال شد",
      success: true,
      summary: `${normType} · ${toPersianDigits(String(body.length))} کاراکتر متن`,
    },
  };
}

// ============ Endpoint ============
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    // Rate limit: 12 درخواست/دقیقه per admin (جلوگیری از اسپم LLM)
    const rl = rateLimitCheck(`root-ai:${auth.admin.id}`, 12, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست‌های زیاد — یک دقیقه صبر کنید" },
        { status: 429 }
      );
    }

    const { messages, stream } = (await req.json()) as {
      messages?: ChatMessage[];
      stream?: boolean;
    };

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      !messages.every(
        (m) =>
          m &&
          typeof m === "object" &&
          typeof m.content === "string" &&
          m.content.trim().length > 0 &&
          m.content.length <= MAX_MESSAGE_LENGTH
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "ساختار درخواست نامعتبر — آرایه‌ی messages با حداقل یک پیام متنی الزامی است",
        },
        { status: 400 }
      );
    }
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }

    // ─── پیام‌های API + پرامپت ───
    const statsSnapshot = await buildStatsSnapshot();
    const systemPrompt = buildRootSystemPrompt(statsSnapshot);

    const providerSettings = await getAiProviderSettings();
    const useCustom =
      providerSettings.provider === "custom" && providerSettings.baseUrl && providerSettings.apiKey;

    const apiMessages: Array<{ role: "assistant" | "user" | "system"; content: string }> = useCustom
      ? [{ role: "system", content: systemPrompt }]
      : [{ role: "assistant", content: systemPrompt }];
    for (const m of messages) {
      if ((m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()) {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    const zai = useCustom ? null : await ZAI.create();

    const executedActions: ExecutedAction[] = [];
    const toolResults: Array<{ tool: string; data: unknown }> = [];
    const toolTrace: string[] = [];
    let finalReply = "";

    // ─── حلقه ابزار ───
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const isLastIteration = iteration === MAX_TOOL_ITERATIONS - 1;
      const promptMessages = [...apiMessages];
      if (isLastIteration && iteration > 0) {
        promptMessages.push({
          role: "user",
          content:
            "SYSTEM_NOTE: سقف فراخوانی ابزار پر شده — همین حالا پاسخ نهایی فارسی را با اطلاعات موجود بده.",
        });
      }

      let reply: string;
      try {
        reply = await callLLM(zai, promptMessages);
      } catch (llmErr) {
        // تاب‌آوری — پیام فارسی دوستانه، بدون stack خام
        console.error("[root-ai] LLM failure mid-loop:", llmErr);
        finalReply =
          "ارتباط با موتور هوش مصنوعی برقرار نشد — لطفاً چند لحظه بعد دوباره بپرسید." +
          (executedActions.length > 0
            ? `\n\nکارهای انجام‌شدهٔ همین درخواست:\n${executedActions.map((a) => `- ${a.label}`).join("\n")}`
            : "");
        break;
      }

      const toolCall = parseToolCall(reply);
      if (!toolCall) {
        finalReply = reply.trim();
        break;
      }

      if (toolCall.invalid || !toolCall.tool) {
        apiMessages.push({ role: "assistant", content: "TOOL_CALL: (نامعتبر)" });
        apiMessages.push({
          role: "user",
          content:
            'TOOL_RESULT: {"error":"فرمت TOOL_CALL نامعتبر است. دقیقاً: TOOL_CALL: {\\"tool\\":\\"query_platform_stats\\",\\"args\\":{}}"}',
        });
        continue;
      }

      const { tool, args } = toolCall;
      toolTrace.push(tool);
      apiMessages.push({
        role: "assistant",
        content: `TOOL_CALL: ${JSON.stringify({ tool, args })}`,
      });

      let result: Record<string, unknown>;
      try {
        if (tool === "query_platform_stats") {
          result = await toolQueryPlatformStats();
          toolResults.push({ tool, data: result });
          executedActions.push({ tool, label: "آمار کلی پلتفرم", success: true, summary: "آمار زنده خوانده شد" });
        } else if (tool === "query_active_users") {
          result = await toolQueryActiveUsers();
          toolResults.push({ tool, data: result });
          executedActions.push({ tool, label: "فعالیت کاربران", success: true, summary: "نشست‌های ۷ روز اخیر تحلیل شد" });
        } else if (tool === "query_plan_distribution") {
          result = await toolQueryPlanDistribution();
          toolResults.push({ tool, data: result });
          executedActions.push({ tool, label: "توزیع پلن‌ها", success: true, summary: "پلن‌ها و درآمد تخمینی محاسبه شد" });
        } else if (tool === "query_churn_risk") {
          result = await toolQueryChurnRisk(args);
          toolResults.push({ tool, data: result });
          executedActions.push({ tool, label: "ریسک ریزش مشتریان", success: true, summary: "سازمان‌های غیرفعال شناسایی شد" });
        } else if (tool === "query_bug_reports") {
          result = await toolQueryBugReports(args);
          toolResults.push({ tool, data: result });
          executedActions.push({ tool, label: "گزارش‌های باگ", success: true, summary: "باگ‌های باز با شدت خوانده شد" });
        } else if (tool === "query_payments_recent") {
          result = await toolQueryPaymentsRecent(args);
          toolResults.push({ tool, data: result });
          executedActions.push({ tool, label: "رویدادهای درگاه پرداخت", success: true, summary: "پرداخت‌های اخیر خوانده شد" });
        } else if (tool === "query_saan_health") {
          result = await toolQuerySaanHealth();
          toolResults.push({ tool, data: result });
          executedActions.push({ tool, label: "سلامت زیرساخت", success: true, summary: "دیتابیس/realtime/حافظه بررسی شد" });
        } else if (tool === "send_broadcast") {
          const bc = await toolSendBroadcast(auth.admin.id, args, ip);
          result = bc.result;
          if (bc.result.sent || bc.result.pending) toolResults.push({ tool, data: bc.result });
          executedActions.push(bc.action);
        } else {
          result = { error: `ابزار «${tool}» شناخته نشد. معتبر: ${KNOWN_TOOLS.join(", ")}` };
        }
      } catch (err) {
        console.error(`[root-ai] tool '${tool}' error:`, err);
        result = { error: `خطا در اجرای ابزار ${tool}` };
      }

      apiMessages.push({
        role: "user",
        content: `TOOL_RESULT: ${JSON.stringify(result)}`,
      });
    }

    if (!finalReply) {
      finalReply = (
        await callLLM(zai, [
          ...apiMessages,
          {
            role: "user",
            content: "SYSTEM_NOTE: حلقه ابزار تمام شد — الان پاسخ نهایی فارسی مارک‌داون را بنویس و هیچ TOOL_CALL ننویس.",
          },
        ])
      ).trim();
    }
    if (!finalReply) {
      finalReply = "پاسخی دریافت نشد — لطفاً دوباره بپرسید.";
    }

    // ─── Audit (PlatformAuditLog — superAdminId) ───
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "ROOT_AI_CHAT",
          entity: "AI",
          details: JSON.stringify({
            messageCount: messages.length,
            preview: messages[messages.length - 1]?.content?.slice(0, 200) ?? "",
            toolTrace,
            executedActions: executedActions.length,
          }),
          ipAddress: ip,
        },
      });
    } catch (err) {
      console.error("[root-ai] audit error:", err);
    }

    // ─── پاسخ ───
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            // رویداد meta (اکشن‌های اجراشده + نتایج ساخت‌یافته ابزار) قبل از متن
            if (executedActions.length > 0 || toolResults.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    meta: { executedActions, toolResults },
                  })}\n\n`
                )
              );
            }
            // متن پاسخ نهایی به‌صورت chunk استریم می‌شود
            const chunkSize = 24;
            for (let i = 0; i < finalReply.length; i += chunkSize) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ delta: finalReply.slice(i, i + chunkSize) })}\n\n`)
              );
              // مکث ریز برای حس تایپ — بدون بلاک‌کردن طولانی
              if (i % (chunkSize * 20) === 0 && i > 0) {
                await new Promise((r) => setTimeout(r, 15));
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "خطا در استریم" })}\n\n`));
            controller.close();
          }
        },
      });
      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json({
      success: true,
      reply: finalReply,
      executedActions,
      toolResults,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("Root AI error:", msg);
    const isConfigError =
      msg.includes("missing X-Token header") || msg.includes("Configuration file not found");
    const isUpstreamRateLimit =
      msg.includes("429") || msg.toLowerCase().includes("too many requests");
    return NextResponse.json(
      {
        success: false,
        error: isConfigError
          ? "سرویس هوش مصنوعی در دسترس نیست (خطای پیکربندی)."
          : isUpstreamRateLimit
            ? "سقف درخواست سرویس هوش مصنوعی پر شده — چند لحظه بعد تلاش کنید."
            : "خطا در پردازش دستیار روت. لطفاً دوباره تلاش کنید.",
      },
      { status: isConfigError ? 503 : isUpstreamRateLimit ? 429 : 500 }
    );
  }
}

// GET — health + فهرست ابزار
export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: "/api/platform/root-ai",
    tools: KNOWN_TOOLS,
    features: [
      "agentic-tool-loop-max-6",
      "broadcast-confirm-gate",
      "platform-audit-logged",
      "stream-sse-with-meta",
      "rate-limit-12-per-minute",
    ],
  });
}
