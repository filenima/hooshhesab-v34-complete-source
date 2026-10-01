import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getBugRewardRules } from "@/lib/system-settings";
import { grantBugReward, type GrantBugRewardResult } from "@/lib/bug-rewards";
import { creditBugRewardWallet, getPlanFeatureToggles } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ بررسی/تأیید گزارش باگ (پنل سوپرادمین) ============
// PATCH /api/platform/bug-reports/[id]
// body: { action: "approve" | "reject" | "in_review" | "fixed" | "grant_reward", adminNote?, verifiedSeverity? }
//
// action=approve   → وضعیت APPROVED + پاداش خودکار برای شدت بحرانی/زیاد
//                     (قوانین SystemSettings با کلید bug_reward_rules — Task 10-b:
//                     بحرانی = ۱ ماه پلن حرفه‌ای، زیاد = ۱۵ روز؛ بدون کلیک)
//                     شدت کم/متوسط: بدون پاداش خودکار — جریان دستی (پاپ‌آپ) باقی می‌ماند
// action=reject    → وضعیت REJECTED + دلیل
// action=grant_reward → فعال‌سازی اشتراک یک‌ماهه پلن حرفه‌ای برای کاربر گزارش‌دهنده
//                        (لایسنس pro یک‌ماهه + به‌روزرسانی tenant.plan + rewardGranted=true)

const VALID_ACTIONS = new Set(["approve", "reject", "in_review", "fixed", "grant_reward"]);

export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const { id } = await params;
 const body = await req.json().catch(() => ({}));
 const action = String(body?.action || "");
 const adminNote = String(body?.adminNote || "").trim().slice(0, 2000);

 if (!VALID_ACTIONS.has(action)) {
 return NextResponse.json(
 { success: false, error: "اکشن نامعتبر است" },
 { status: 400 }
 );
 }

 const report = await db.bugReport.findUnique({
 where: { id },
 include: {
 user: {
 select: {
 id: true,
 name: true,
 email: true,
 tenantId: true,
 tenant: { select: { id: true, name: true, plan: true, status: true } },
 },
 },
 },
 });
 if (!report) {
 return NextResponse.json(
 { success: false, error: "گزارش باگ یافت نشد" },
 { status: 404 }
 );
 }

 // ---- اکشن‌های ساده (بدون پاداش) ----
 if (action === "in_review") {
 const updated = await db.bugReport.update({
 where: { id },
 data: { status: "IN_REVIEW", adminNote: adminNote || report.adminNote, reviewedBy: auth.admin.id, reviewedAt: new Date() },
 });
 return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } });
 }
 if (action === "reject") {
 const updated = await db.bugReport.update({
 where: { id },
 data: { status: "REJECTED", adminNote: adminNote || "بدون دلیل ثبت نشده", reviewedBy: auth.admin.id, reviewedAt: new Date() },
 });
 return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } });
 }
 if (action === "fixed") {
 const updated = await db.bugReport.update({
 where: { id },
 data: { status: "FIXED", adminNote: adminNote || report.adminNote, reviewedBy: auth.admin.id, reviewedAt: new Date() },
 });
 return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } });
 }

 // ---- تأیید (APPROVED) + پاداش خودکار (Task 10-b) ----
 if (action === "approve") {
 if (report.status === "APPROVED") {
 return NextResponse.json(
 { success: false, error: "این گزارش قبلاً تأیید شده است" },
 { status: 400 }
 );
 }

 // FIX(SA-4): شدت تأییدشده توسط سوپرادمین — مستقل از شدت خودگزارش‌شده‌ی کاربر.
 // اگر سوپرادمین verifiedSeverity نفرستاد، به‌صورت پیش‌فرض شدت خودگزارش‌شده رها می‌شود
 // (رفتار قدیمی)، اما پاداش خودکار فقط بر مبنای شدت تأییدشده صادر می‌شود.
 const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
 const rawVerified = String(body?.verifiedSeverity || "").trim().toLowerCase();
 const verifiedSeverity = VALID_SEVERITIES.has(rawVerified)? rawVerified: report.severity;

 const updated = await db.bugReport.update({
 where: { id },
 data: { status: "APPROVED", verifiedSeverity, adminNote: adminNote || report.adminNote, reviewedBy: auth.admin.id, reviewedAt: new Date() },
 });

 // ---- پاداش خودکار طبق قوانین (SystemSettings: bug_reward_rules) ----
 // FIX(SA-4): مبنای محاسبه = verifiedSeverity (تأیید سوپرادمین)، نه severity کاربر —
 // اگر کاربر critical بگوید و ادمین medium تأیید کند، پاداش خودکار صادر نمی‌شود.
 const rules = await getBugRewardRules();
 let autoReward: GrantBugRewardResult | null = null;
 let autoRewardError: string | null = null;
 if (rules.enabled && !report.rewardGranted && (verifiedSeverity === "critical" || verifiedSeverity === "high")) {
 const days = verifiedSeverity === "critical" ? rules.criticalDays : rules.highDays;
 try {
 autoReward = await grantBugReward({
 reportId: report.id,
 tenantId: report.tenantId,
 userId: report.userId,
 plan: rules.plan,
 days,
 adminId: auth.admin.id,
 adminNote: adminNote || `پاداش خودکار (شدت تأییدشده: ${verifiedSeverity === "critical" ? "بحرانی" : "زیاد"}): ${days} روز پلن ${rules.plan}`,
 auditAction: "BUG_REWARD_AUTO_GRANTED",
 ipAddress: req.headers.get("x-forwarded-for") || null,
 });
 } catch (err) {
 // خطای پاداش خودکار نباید تأیید را شکست بدهد — جریان دستی جایگزین می‌شود
 console.error("Auto bug reward error:", err);
 autoRewardError = "پاداش خودکار با خطا مواجه شد — از پاپ‌آپ پاداش دستی استفاده کنید";
 }
 }

 // ---- پاداش نقدی کیف پول (Task 24) — با «تأیید پشتیبانی» شارژ می‌شود ----
 // ۲۵۰,۰۰۰ تا ۱,۰۰۰,۰۰۰ تومان بر اساس شدت تأییدشده — idempotent (bug:{id})
 let walletReward: { amountToman: number; balance: number } | null = null;
 try {
 const toggles = await getPlanFeatureToggles(report.user?.tenant?.plan ?? "free");
 if (toggles.bugReport && toggles.wallet) {
 const wres = await creditBugRewardWallet({
 reportId: report.id,
 tenantId: report.tenantId,
 userId: report.userId,
 verifiedSeverity,
 });
 if (wres.ok && !wres.skipped && wres.balance !== undefined) {
 walletReward = { amountToman: wres.amountToman ?? 0, balance: wres.balance };
 }
 }
 } catch (err) {
 console.warn("[wallet] bug reward credit failed:", err);
 }

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 status: updated.status,
 rewardGranted: autoReward ? true : updated.rewardGranted,
 autoReward,
 walletReward,
 },
 message: walletReward
 ? `گزارش تأیید شد — ${walletReward.amountToman.toLocaleString("fa-IR")} تومان به کیف پول کاربر شارژ شد${autoReward ? ` و ${autoReward.days} روز پلن ${autoReward.plan === "pro" ? "حرفه‌ای" : autoReward.plan} فعال شد` : ""}`
 : autoReward
 ? `گزارش تأیید شد و پاداش (${autoReward.days} روز پلن ${autoReward.plan === "pro" ? "حرفه‌ای" : autoReward.plan}) به‌صورت خودکار فعال شد`
 : autoRewardError
 ? `گزارش تأیید شد — ${autoRewardError}`
 : verifiedSeverity === "critical" || verifiedSeverity === "high"
 ? "گزارش تأیید شد — پاداش خودکار غیرفعال است؛ برای فعال‌سازی اشتراک رایگان، پاداش را اعمال کنید"
 : "گزارش تأیید شد — برای فعال‌سازی اشتراک رایگان یک‌ماهه، پاداش را اعمال کنید",
 verifiedSeverity,
 reportedSeverity: report.severity,
 });
 }

 // ---- اعطای پاداش دستی: اشتراک یک‌ماهه پلن حرفه‌ای ----
 if (action === "grant_reward") {
 if (report.status !== "APPROVED") {
 return NextResponse.json(
 { success: false, error: "ابتدا گزارش را تأیید کنید (action=approve)" },
 { status: 400 }
 );
 }
 if (report.rewardGranted) {
 return NextResponse.json(
 { success: false, error: "پاداش این گزارش قبلاً اعمال شده است" },
 { status: 400 }
 );
 }

 const result = await grantBugReward({
 reportId: report.id,
 tenantId: report.tenantId,
 userId: report.userId,
 plan: "pro",
 days: 30, // یک ماه پلن حرفه‌ای (جریان دستی پاپ‌آپ)
 adminId: auth.admin.id,
 adminNote: adminNote || "پاداش: اشتراک یک‌ماهه پلن حرفه‌ای",
 auditAction: "BUG_REWARD_GRANTED",
 ipAddress: req.headers.get("x-forwarded-for") || null,
 });

 // Task 24 — اگر کیف پول هنوز شارژ نشده (تأیید قبل از این قابلیت بوده)،
 // همین‌جا با شدت تأییدشده شارژ می‌شود (idempotent)
 let manualWalletReward: { amountToman: number; balance: number } | null = null;
 try {
 const toggles = await getPlanFeatureToggles(report.user?.tenant?.plan ?? "free");
 if (toggles.bugReport && toggles.wallet) {
 const wres = await creditBugRewardWallet({
 reportId: report.id,
 tenantId: report.tenantId,
 userId: report.userId,
 verifiedSeverity: report.verifiedSeverity ?? report.severity,
 });
 if (wres.ok && !wres.skipped && wres.balance !== undefined) {
 manualWalletReward = { amountToman: wres.amountToman ?? 0, balance: wres.balance };
 }
 }
 } catch (err) {
 console.warn("[wallet] bug reward credit (manual) failed:", err);
 }

 return NextResponse.json({
 success: true,
 data: {
 id: report.id,
 status: report.status,
 rewardGranted: true,
 license: {
 id: result.licenseId,
 plan: result.plan,
 endDate: result.endDate,
 },
 walletReward: manualWalletReward,
 },
 message: `اشتراک یک‌ماهه پلن حرفه‌ای برای «${report.user.name || report.user.email}» فعال شد${manualWalletReward ? ` و ${manualWalletReward.amountToman.toLocaleString("fa-IR")} تومان به کیف پولش شارژ شد` : ""}`,
 });
 }
 } catch (error) {
 console.error("Platform bug report action error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش اقدام گزارش باگ" },
 { status: 500 }
 );
 }
}
