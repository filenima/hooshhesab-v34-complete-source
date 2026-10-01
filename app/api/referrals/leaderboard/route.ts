import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getReferralContestConfig } from "@/lib/referral-contest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Task 3-c — لیدربورد مسابقه رفرال (سمت کاربر) ============
// GET /api/referrals/leaderboard (requireUser)
// - پیکربندی مسابقه از SystemSettings (کلید referral_contest) — قابل ویرایش
//   توسط سوپرادمین از تب «مدیریت رفرال»؛ اگر تنظیم نشده باشد جدول پیش‌فرض
//   جایزه‌ها (نفر اول ۲۰ میلیون تومان ... نفر دهم ۱ میلیون تومان) برمی‌گردد.
// - ۱۰ دعوت‌کنندهٔ برتر کل پلتفرم (شمارش دعوت‌های موفق = SIGNED_UP + REWARDED)
//   با ناشناس‌سازی ایمیل (نام + دو حرف اول ایمیل) برای حریم خصوصی.
// - رتبه و تعداد دعوت خود کاربر — حتی اگر خارج از ۱۰ نفر اول باشد.

/** ناشنام‌سازی برای لیدربورد عمومی — نام + دو حرف اول ایمیل */
function maskDisplay(name: string | null | undefined, email: string): string {
 const base = (name || "").trim();
 const emailPrefix = (email || "").split("@")[0] || "";
 const maskedEmail = emailPrefix ? `(${emailPrefix.slice(0, 2)}…)` : "";
 return base ? (maskedEmail ? `${base} ${maskedEmail}` : base) : maskedEmail || "کاربر هوش";
}

export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { userId } = auth.user;

 try {
  const contest = await getReferralContestConfig();

  // بازهٔ مسابقه (اختیاری) — اگر تاریخ شروع/پایان تنظیم شده باشد فقط دعوت‌های
  // همان بازه شمرده می‌شود؛ در غیر این صورت شمارش کل (all-time) است.
  const createdAtFilter: Record<string, unknown> = {};
  if (contest.startDate) {
   const s = new Date(contest.startDate);
   if (!Number.isNaN(s.getTime())) createdAtFilter.gte = s;
  }
  if (contest.endDate) {
   const e = new Date(contest.endDate);
   if (!Number.isNaN(e.getTime())) createdAtFilter.lte = e;
  }

  const referrals = await db.referral.findMany({
   where: {
    status: { in: ["SIGNED_UP", "REWARDED"] },
    ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
   },
   select: { referrerId: true, status: true, reward: true },
  });

  // تجمیع بر اساس دعوت‌کننده — امتیاز = تعداد دعوت موفق، معیار بعدی = پاداش کل
  const agg = new Map<string, { count: number; rewarded: number; totalReward: number }>();
  for (const r of referrals) {
   const cur = agg.get(r.referrerId) ?? { count: 0, rewarded: 0, totalReward: 0 };
   cur.count += 1;
   if (r.status === "REWARDED") {
    cur.rewarded += 1;
    cur.totalReward += r.reward ?? 0;
   }
   agg.set(r.referrerId, cur);
  }

  // دقت (Task 3-c): دعوت‌کننده‌های حذف‌شده (soft-delete) از مسابقه کنار
  // گذاشته می‌شوند — کاربر حذف‌شده نباید جایزه بگیرد یا در جدول دیده شود.
  const aggIds = [...agg.keys()];
  const aliveUsers = aggIds.length
   ? await db.user.findMany({
      where: { id: { in: aggIds }, deletedAt: null },
      select: { id: true },
     })
   : [];
  const aliveSet = new Set(aliveUsers.map((u) => u.id));

  // مرتب‌سازی پایدار: تعداد ↓ ، پاداش کل ↓
  const sorted = [...agg.entries()]
   .map(([rid, cur]) => ({ referrerId: rid, ...cur }))
   .filter((x) => x.count > 0 && aliveSet.has(x.referrerId))
   .sort((a, b) => b.count - a.count || b.totalReward - a.totalReward);

  // ۱۰ نفر اول + وضعیت کاربر فعلی
  const topIds = sorted.slice(0, 10).map((s) => s.referrerId);
  const needMe = !topIds.includes(userId);
  const lookupIds = needMe ? [...topIds, userId] : topIds;
  const users = lookupIds.length
   ? await db.user.findMany({
      where: { id: { in: lookupIds } },
      select: { id: true, name: true, email: true, isActive: true, deletedAt: true },
     })
   : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const leaders = sorted.slice(0, 10).map((row, i) => {
   const u = userMap.get(row.referrerId);
   const rank = i + 1;
   return {
    rank,
    displayName: maskDisplay(u?.name, u?.email ?? ""),
    referralCount: row.count,
    rewarded: row.rewarded,
    totalReward: row.totalReward,
    prizeToman: rank <= contest.prizes.length ? contest.prizes[rank - 1] : 0,
    isMe: row.referrerId === userId,
   };
  });

  // رتبهٔ خود کاربر — حتی خارج از ۱۰ نفر اول
  const myIdx = sorted.findIndex((x) => x.referrerId === userId);
  const myRow = myIdx >= 0 ? sorted[myIdx] : null;
  const me = {
   rank: myIdx >= 0 ? myIdx + 1 : 0,
   referralCount: myRow ? myRow.count : 0,
   totalReward: myRow ? myRow.totalReward : 0,
   inTop: myIdx >= 0 && myIdx < 10,
  };

  return NextResponse.json({
   success: true,
   contest: {
    active: contest.active,
    title: contest.title,
    prizes: contest.prizes,
    startDate: contest.startDate,
    endDate: contest.endDate,
    // بازهٔ شمارش — برای شفافیت قواعد مسابقه
    windowLabel:
     contest.startDate || contest.endDate
      ? "شمارش دعوت‌ها فقط در بازهٔ زمانی مسابقه"
      : "شمارش کل دعوت‌های موفق (از ابتدا)",
    rules: {
     metric: "تعداد دعوت‌های موفق (ثبت‌نام با کد شما)",
     note: "جوایز نقدی پس از پایان مسابقه توسط تیم هوش واریز می‌شود؛ در صورت تساوی، مجموع پاداش‌های نقدی ملاک تعیین رتبه است.",
    },
   },
   leaders,
   me,
  });
 } catch (error) {
  console.error("Referral contest leaderboard error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در دریافت لیدربورد مسابقه رفرال" },
   { status: 500 }
  );
 }
}
