import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { generateLicenseKey, hashLicenseKey } from "@/lib/license-security";
import { getEffectiveLicenseDefaults } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Task 23-B — لیدربورد ماهانه دعوت + جدول جایزه ============
// GET  /api/marketing/referral/leaderboard → لیدربورد ماه جاری (ناشناس‌سازی) + جایزه‌ها + رتبه خود کاربر
// POST /api/marketing/referral/leaderboard → فقط سوپرادمین: تسویه جوایز ماه (۳ نفر اول)
//
// جدول جایزه ماهانه (اشتراک رایگان پلن حرفه‌ای):
//   رتبه ۱ → ۳۰ روز | رتبه ۲ → ۲۰ روز | رتبه ۳ → ۱۰ روز
// معیار: تعداد رفرال‌های SIGNED_UP/REWARDED ماه جاری

const PRIZE_TABLE = [
  { rank: 1, days: 30, label: "۳۰ روز اشتراک حرفه‌ای" },
  { rank: 2, days: 20, label: "۲۰ روز اشتراک حرفه‌ای" },
  { rank: 3, days: 10, label: "۱۰ روز اشتراک حرفه‌ای" },
];

/** بازه ماه جاری (میلادیِ محلی) */
function currentMonthRange(): { start: Date; end: Date; key: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { start, end, key };
}

/** ناشناس‌سازی نام برای لیدربورد عمومی: «علی ر.» */
function anonymize(name: string | null | undefined, email: string): string {
  const base = (name || "").trim();
  if (base && base.length > 1) {
    const parts = base.split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
  }
  const emailName = email.split("@")[0] || "کاربر";
  return emailName.length > 2 ? `${emailName.slice(0, 2)}…` : emailName;
}

interface LeaderRow {
  rank: number;
  displayName: string;
  signedUp: number;
  rewarded: number;
  totalReward: number;
  isMe: boolean;
  prize: { rank: number; days: number; label: string } | null;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { userId } = auth.user;

  try {
    const { start, end, key } = currentMonthRange();

    // گروه‌بندی رفرال‌های ماه جاری بر اساس دعوت‌کننده
    const referrals = await db.referral.findMany({
      where: {
        updatedAt: { gte: start, lt: end },
        status: { in: ["SIGNED_UP", "REWARDED"] },
      },
      select: {
        referrerId: true,
        status: true,
        reward: true,
      },
    });

    const agg = new Map<string, { signedUp: number; rewarded: number; totalReward: number }>();
    for (const r of referrals) {
      const cur = agg.get(r.referrerId) ?? { signedUp: 0, rewarded: 0, totalReward: 0 };
      if (r.status === "SIGNED_UP") cur.signedUp += 1;
      if (r.status === "REWARDED") {
        cur.rewarded += 1;
        cur.totalReward += r.reward;
      }
      agg.set(r.referrerId, cur);
    }

    // امتیاز لیدربورد = مجموع ثبت‌نام‌های موفق ماه (SIGNED_UP + REWARDED)
    const sorted = [...agg.entries()]
      .map(([rid, cur]) => ({
        referrerId: rid,
        ...cur,
        score: cur.signedUp + cur.rewarded,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.totalReward - a.totalReward)
      .slice(0, 20);

    const leaderUserIds = sorted.map((s) => s.referrerId);
    const users = leaderUserIds.length
      ? await db.user.findMany({
          where: { id: { in: leaderUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const leaders: LeaderRow[] = sorted.map((row, i) => {
      const u = userMap.get(row.referrerId);
      const prize = PRIZE_TABLE.find((p) => p.rank === i + 1) ?? null;
      return {
        rank: i + 1,
        displayName: anonymize(u?.name, u?.email ?? ""),
        signedUp: row.signedUp,
        rewarded: row.rewarded,
        totalReward: row.totalReward,
        isMe: row.referrerId === userId,
        prize,
      };
    });

    // رتبه خود کاربر (حتی خارج از ۲۰ نفر اول)
    const my = agg.get(userId);
    const myScore = my ? my.signedUp + my.rewarded : 0;
    const ranking = [...agg.entries()]
      .map(([rid, cur]) => ({ rid, score: cur.signedUp + cur.rewarded }))
      .sort((a, b) => b.score - a.score);
    const myRank = myScore > 0 ? ranking.findIndex((x) => x.rid === userId) + 1 : 0;

    return NextResponse.json({
      success: true,
      monthKey: key,
      monthLabel: new Intl.DateTimeFormat("fa-IR", { month: "long", year: "numeric" }).format(start),
      prizeTable: PRIZE_TABLE,
      leaders,
      me: { rank: myRank, score: myScore, inTop: myRank > 0 && myRank <= 3 },
      rules: {
        metric: "تعداد دعوت‌های موفق (ثبت‌نام) در این ماه",
        resetAt: end.toISOString(),
        note:
          "جوایز ابتدای ماه بعد توسط تیم هوش اعمال می‌شود؛ در صورت تساوی، مجموع پاداش نقدی ملاک است.",
      },
    });
  } catch (error) {
    console.error("Referral leaderboard error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت لیدربورد دعوت" },
      { status: 500 }
    );
  }
}

// ============ POST — تسویه جوایز ماه (فقط سوپرادمین) ============
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const monthKey = String(body?.monthKey || "").trim();
    const { start, end, key: currentKey } = currentMonthRange();
    // فقط ماه جاری قابل تسویه است (ماه گذشته را در ابتدای ماه بعد تسویه کنید)
    if (monthKey && monthKey !== currentKey) {
      return NextResponse.json(
        { success: false, error: "فعلاً فقط ماه جاری قابل تسویه است" },
        { status: 400 }
      );
    }

    const referrals = await db.referral.findMany({
      where: { updatedAt: { gte: start, lt: end }, status: { in: ["SIGNED_UP", "REWARDED"] } },
      select: { referrerId: true, status: true },
    });
    const agg = new Map<string, number>();
    for (const r of referrals) {
      agg.set(r.referrerId, (agg.get(r.referrerId) ?? 0) + 1);
    }
    const top3 = [...agg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .filter(([, count]) => count > 0);

    if (top3.length === 0) {
      return NextResponse.json(
        { success: false, error: "این ماه هیچ دعوت موفقی ثبت نشده است" },
        { status: 400 }
      );
    }

    const granted: Array<{
      rank: number;
      userId: string;
      name: string;
      days: number;
      licenseId: string;
      endDate: string;
    }> = [];
    for (let i = 0; i < top3.length; i++) {
      const [referrerId, count] = top3[i];
      const prize = PRIZE_TABLE[i];
      if (!prize) break;

      const referrer = await db.user.findUnique({
        where: { id: referrerId },
        select: {
          id: true,
          name: true,
          email: true,
          tenantId: true,
          isActive: true,
          deletedAt: true,
        },
      });
      if (!referrer || !referrer.isActive || referrer.deletedAt || !referrer.tenantId) continue;

      // لایسنس پلن حرفه‌ای جایزه (همان الگوی grantBugReward)
      const defaults = await getEffectiveLicenseDefaults("pro");
      const licenseKey = generateLicenseKey();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + prize.days);

      await db.license.updateMany({
        where: { tenantId: referrer.tenantId, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      const license = await db.license.create({
        data: {
          key: licenseKey,
          keyHash: hashLicenseKey(licenseKey),
          tenantId: referrer.tenantId,
          plan: "pro",
          maxUsers: defaults.maxUsers,
          maxInvoices: defaults.maxInvoices,
          maxWarehouses: defaults.maxWarehouses,
          features: JSON.stringify(defaults.features),
          source: "referral-prize",
          issuedBy: auth.admin.id,
          status: "ACTIVE",
          startDate: new Date(),
          endDate,
        },
      });
      await db.tenant.update({ where: { id: referrer.tenantId }, data: { plan: "pro" } });

      granted.push({
        rank: prize.rank,
        userId: referrerId,
        name: referrer.name || referrer.email,
        days: prize.days,
        licenseId: license.id,
        endDate: endDate.toISOString(),
      });

      // audit پلتفرم
      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: auth.admin.id,
            action: "REFERRAL_PRIZE_GRANTED",
            entity: "Referral",
            entityId: referrerId,
            details: JSON.stringify({
              monthKey: currentKey,
              rank: prize.rank,
              days: prize.days,
              invitations: count,
              licenseId: license.id,
            }),
            ipAddress: req.headers.get("x-forwarded-for") || null,
          },
        });
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({
      success: true,
      monthKey: currentKey,
      granted,
      message: `${toPersianDigitsLite(granted.length)} جایزه ماه اعمال شد`,
    });
  } catch (error) {
    console.error("Referral prize settle error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در تسویه جوایز" },
      { status: 500 }
    );
  }
}

function toPersianDigitsLite(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
