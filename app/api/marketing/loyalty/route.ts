import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import {
 awardPoints,
 awardAuto,
 getPointsBalance,
 getPointsHistory,
 redeemPoints,
 AWARD_AMOUNTS,
 type LoyaltyReason,
} from "@/lib/loyalty-engine";

export const runtime = "nodejs";

// ============ types ============
interface LoyaltyBalanceDTO {
 userId: string;
 balance: number;
 totalEarned: number;
 totalRedeemed: number;
 historyCount: number;
}

interface LoyaltyHistoryItemDTO {
 id: string;
 points: number;
 reason: string;
 referenceId: string | null;
 note: string | null;
 createdAt: string;
}

const VALID_REASONS: LoyaltyReason[] = [
 "INVOICE_CREATED",
 "DAILY_LOGIN",
 "REFERRAL",
 "PROFILE_COMPLETE",
 "BONUS",
 "REDEEM",
 "MANUAL",
];

/**
 * GET /api/marketing/loyalty
 *?userId=... (optional — default: current user)
 *?history=1 (optional — include history)
 *?limit=50 (optional — history limit)
 *
 * دریافت موجودی امتیاز وفاداری کاربر + (اختیاری) تاریخچه.
 */
export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId: currentUserId, tenantId, role } = auth.user;

 try {
 const { searchParams } = new URL(req.url);
 const targetUserId = searchParams.get("userId") || currentUserId;
 const includeHistory = searchParams.get("history") === "1";
 const limit = Math.min(
 parseInt(searchParams.get("limit") || "50", 10) || 50,
 500
 );

 // بررسی دسترسی: ADMIN می‌تواند دیگران را ببیند
 if (targetUserId!== currentUserId && role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز" },
 { status: 403 }
 );
 }

 const balance = await getPointsBalance(tenantId, targetUserId);
 const balanceDTO: LoyaltyBalanceDTO = {
 userId: balance.userId,
 balance: balance.balance,
 totalEarned: balance.totalEarned,
 totalRedeemed: balance.totalRedeemed,
 historyCount: balance.historyCount,
 };

 let history: LoyaltyHistoryItemDTO[] | undefined;
 if (includeHistory) {
 const items = await getPointsHistory(tenantId, targetUserId, limit);
 history = items.map((h) => ({
 id: h.id,
 points: h.points,
 reason: h.reason,
 referenceId: h.referenceId,
 note: h.note,
 createdAt: h.createdAt,
 }));
 }

 return NextResponse.json({
 success: true,
 data: {
 balance: balanceDTO,
...(history? { history }: {}),
 },
 });
 } catch (error) {
 console.error("Get loyalty error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت امتیازات" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/marketing/loyalty
 * body: {
 * userId?: string, // default: current user
 * action: "award" | "redeem" | "auto",
 * points?: number, // for award/redeem
 * reason?: string, // for award (INVOICE_CREATED | DAILY_LOGIN | REFERRAL |...)
 * referenceId?: string,
 * note?: string,
 * }
 *
 * اعطای یا مصرف امتیاز وفاداری.
 *
 * - action=award: اعطای دستی امتیاز (فقط ADMIN)
 * - action=redeem: مصرف امتیاز (کاربر خودش یا ADMIN)
 * - action=auto: اعطای خودکار بر اساس قانون (داخلی — فقط ADMIN)
 */
export async function POST(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId: currentUserId, tenantId, role } = auth.user;

 try {
 const body = await req.json().catch(() => ({}));
 const action = String(body?.action || "award") as "award" | "redeem" | "auto";
 const targetUserId = String(body?.userId || currentUserId);

 // برای award/auto فقط ADMIN
 if ((action === "award" || action === "auto") && role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "فقط مدیر می‌تواند امتیاز اعطا کند" },
 { status: 403 }
 );
 }

 // برای redeem: کاربر خودش یا ADMIN
 if (action === "redeem" && targetUserId!== currentUserId && role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "دسترسی غیرمجاز" },
 { status: 403 }
 );
 }

 let result: { awarded: boolean; redeemed?: boolean; newBalance: number; message: string; points?: number };

 if (action === "award") {
 const points = Number(body?.points);
 const reason = String(body?.reason || "MANUAL") as LoyaltyReason;
 const referenceId = body?.referenceId? String(body.referenceId): undefined;
 const note = body?.note? String(body.note): undefined;

 if (isNaN(points) || points === 0) {
 return NextResponse.json(
 { success: false, error: "points باید عدد غیر صفر باشد" },
 { status: 400 }
 );
 }
 if (!VALID_REASONS.includes(reason)) {
 return NextResponse.json(
 { success: false, error: `reason باید یکی از ${VALID_REASONS.join(", ")} باشد` },
 { status: 400 }
 );
 }

 const r = await awardPoints(tenantId, targetUserId, points, reason, referenceId, note);
 result = { awarded: r.awarded, newBalance: r.newBalance, message: r.message };
 } else if (action === "redeem") {
 const points = Number(body?.points);
 const note = body?.note? String(body.note): undefined;

 if (isNaN(points) || points <= 0) {
 return NextResponse.json(
 { success: false, error: "points باید عدد مثبت باشد" },
 { status: 400 }
 );
 }

 const r = await redeemPoints(tenantId, targetUserId, points, note);
 result = { awarded: r.redeemed, redeemed: r.redeemed, newBalance: r.newBalance, message: r.message };
 } else {
 // action = auto
 const reason = String(body?.reason || "") as keyof typeof AWARD_AMOUNTS;
 const referenceId = body?.referenceId? String(body.referenceId): undefined;

 const r = await awardAuto(tenantId, targetUserId, reason, referenceId);
 result = { awarded: r.awarded, newBalance: r.newBalance, points: r.points, message: r.message };
 }

 // ثبت audit log
 try {
 await db.auditLog.create({
 data: {
 tenantId,
 userId: currentUserId,
 action: `LOYALTY_${action.toUpperCase()}`,
 entity: "LoyaltyPoint",
 changes: JSON.stringify({
 targetUserId,
 action,
 points: body?.points,
 reason: body?.reason,
 awarded: result.awarded,
 redeemed: result.redeemed,
 newBalance: result.newBalance,
 }),
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: result,
 message: result.message,
 });
 } catch (error) {
 console.error("Loyalty action error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در عملیات امتیاز وفاداری" },
 { status: 500 }
 );
 }
}
