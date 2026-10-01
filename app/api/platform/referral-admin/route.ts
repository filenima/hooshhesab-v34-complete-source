import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { getReferralContestConfig } from "@/lib/referral-contest";
import { REFERRAL_REWARD_TOMAN } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Task 3-c — مدیریت رفرال (پنل سوپرادمین) ============
// GET  /api/platform/referral-admin — فهرست کاربران با شمار رفرال + درآمد +
//     کد شخصی + جستجو (نام/ایمیل/کد) + مرتب‌سازی + صفحه‌بندی ۲۰تایی
// POST /api/platform/referral-admin
//   { action: "adjust", userId, delta, grantReward?, amount? }
//     → افزایش/کاهش دستی شمار رفرال کاربر با رکوردهای ترکیبی «MANUAL»
//       (قابل حذفِ معکوس — رکوردهای واقعی هرگز حذف نمی‌شوند)
//   { action: "create-test-user", name?, referralCount? }
//     → کاربر تستی برای پرکردن لیدربورد مسابقه (ایمیل @test.hoosh.local + isDemo)
//   { action: "delete-test-user", userId }
//     → حذف کاربر تستی همین مسیر (فقط ایمیل @test.hoosh.local) + رکوردهایش
//   { action: "save-contest", active?, title?, prizes?, endDate? }
//     → ذخیرهٔ پیکربندی مسابقه رفرال در SystemSettings (referral_contest)
// همهٔ تغییرات در PlatformAuditLog ثبت می‌شوند.

const VALID_ACTIONS = new Set(["adjust", "create-test-user", "delete-test-user", "save-contest"]);

/** نشانهٔ رکورد دستی — refereeEmail با این پیشوند شروع می‌شود */
const MANUAL_EMAIL_PREFIX = "manual:";
const TEST_EMAIL_SUFFIX = "@test.hoosh.local";
const PAGE_SIZE = 20;

/** کد شخصی دعوت — ۸ کاراکتر از hash (همان الگوی ماژول مارکتینگ) */
function generatePersonalCode(seed: string): string {
 const hash = crypto
  .createHash("sha256")
  .update(`${seed}:${Date.now()}:${Math.random()}`)
  .digest("hex");
 return `HH-${hash.slice(0, 8).toUpperCase()}`;
}

// ----------------------------------------------------------------------------
// GET — فهرست کاربران + شمار رفرال + کد شخصی + تنظیمات مسابقه
// ----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 // FIX(SEC-4a): محدودیت نرخ — گزار‌های تجمیعی سنگین (groupBy کل رکوردهای رفرال)؛
 // هم‌راستا با بقیهٔ مسیرهای platform این سشن (نسخه‌ها/عملیات کاربران)
 const rlGet = rateLimitCheck(`referral-admin-get:${auth.admin.id}:${getClientIp(req)}`, 60, 60_000);
 if (!rlGet.ok) {
  return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
 }

 try {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const sort = searchParams.get("sort") || "count";
  const page = Math.max(1, Math.round(Number(searchParams.get("page")) || 1));
  const includeEmpty = searchParams.get("includeEmpty") === "1";

  // ۱) تجمیع رفرال‌های موفق بر اساس دعوت‌کننده
  const [aggRows, codeRows] = await Promise.all([
   db.referral.groupBy({
    by: ["referrerId"],
    where: { status: { in: ["SIGNED_UP", "REWARDED"] } },
    _count: { _all: true },
    _sum: { reward: true },
   }),
   db.referral.findMany({
    distinct: ["referrerId"],
    orderBy: { createdAt: "asc" },
    select: { referrerId: true, code: true },
   }),
  ]);

  const countMap = new Map<string, { count: number; rewardSum: number }>();
  for (const r of aggRows) {
   countMap.set(r.referrerId, {
    count: r._count._all,
    rewardSum: r._sum.reward ?? 0,
   });
  }
  const codeMap = new Map<string, string>();
  for (const r of codeRows) codeMap.set(r.referrerId, r.code);

  // ۲) کاربران با فیلتر جستجو — نام / ایمیل / کد دعوت
  // (SQLite از mode:insensitive پشتیبانی نمی‌کند — هر دو شکل کوچک/بزرگ جستجو می‌شود)
  let userIds: string[] | null = null;
  if (q) {
   const codeMatches = [...codeMap.entries()]
    .filter(([, code]) => code.toUpperCase().includes(q.toUpperCase()))
    .map(([rid]) => rid);
   userIds = codeMatches;
  }

  const users = await db.user.findMany({
   where: {
    deletedAt: null,
    ...(q
     ? {
        OR: [
         { name: { contains: q } },
         { email: { contains: q } },
         { email: { contains: q.toLowerCase() } },
         ...(userIds && userIds.length > 0 ? [{ id: { in: userIds } }] : []),
        ],
       }
     : {}),
   },
   select: {
    id: true,
    name: true,
    family: true,
    email: true,
    tenantId: true,
    isActive: true,
    isDemo: true,
    createdAt: true,
   },
   orderBy: { createdAt: "desc" },
   take: 3000, // سقف امانت — برای پنل ادمین کافی است
  });

  // ۳) اتصال شمار/کد + فیلتر «فقط دارای رفرال» (پیش‌فرض روشن)
  let rows = users.map((u) => {
   const agg = countMap.get(u.id);
   return {
    id: u.id,
    name: [u.name, u.family].filter(Boolean).join(" ").trim() || u.email,
    email: u.email,
    tenantId: u.tenantId,
    referralCode: codeMap.get(u.id) ?? null,
    referralCount: agg?.count ?? 0,
    totalReward: agg?.rewardSum ?? 0,
    isActive: u.isActive,
    isDemo: u.isDemo,
    isTestUser: u.email.endsWith(TEST_EMAIL_SUFFIX),
    createdAt: u.createdAt.toISOString(),
   };
  });
  if (!includeEmpty) {
   rows = rows.filter((r) => r.referralCount > 0);
  }

  // ۴) مرتب‌سازی
  switch (sort) {
   case "reward":
    rows.sort((a, b) => b.totalReward - a.totalReward || b.referralCount - a.referralCount);
    break;
   case "name":
    rows.sort((a, b) => a.name.localeCompare(b.name, "fa"));
    break;
   case "newest":
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    break;
   default:
    // count — پیش‌فرض: بیشترین رفرال اول
    rows.sort((a, b) => b.referralCount - a.referralCount || b.totalReward - a.totalReward);
  }

  // ۵) صفحه‌بندی ۲۰تایی
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ۶) آمار کلی + تنظیمات مسابقه
  const contest = await getReferralContestConfig();
  const [manualAgg, statusAgg] = await Promise.all([
   db.referral.count({
    where: { refereeEmail: { startsWith: MANUAL_EMAIL_PREFIX } },
   }),
   db.referral.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const statusMap: Record<string, number> = {};
  for (const s of statusAgg) statusMap[s.status] = s._count._all;

  return NextResponse.json({
   success: true,
   data: {
    users: pageRows,
    total,
    page: safePage,
    pageSize: PAGE_SIZE,
    totalPages,
    stats: {
     referralUsers: countMap.size,
     totalReferrals: Object.values(statusMap).reduce((a, b) => a + b, 0),
     pending: statusMap.PENDING ?? 0,
     signedUp: statusMap.SIGNED_UP ?? 0,
     rewarded: statusMap.REWARDED ?? 0,
     totalRewardToman: [...countMap.values()].reduce((a, b) => a + b.rewardSum, 0),
     manualRecords: manualAgg,
     testUsers: rows.filter((r) => r.isTestUser).length,
    },
    contest,
   },
  });
 } catch (error) {
  console.error("Referral admin GET error:", error);
  return NextResponse.json({ success: false, error: "خطا در دریافت فهرست رفرال" }, { status: 500 });
 }
}

// ----------------------------------------------------------------------------
// POST — اکشن‌های مدیریتی
// ----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const adminId = auth.admin.id;

 // FIX(SEC-4a): محدودیت نرخ روی اکشن‌های حساس (شارژ کیف پول + ساخت کاربر تستی)
 const rlPost = rateLimitCheck(`referral-admin-post:${adminId}:${getClientIp(req)}`, 20, 60_000);
 if (!rlPost.ok) {
  return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
 }

 try {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  if (!VALID_ACTIONS.has(action)) {
   return NextResponse.json({ success: false, error: "اکشن نامعتبر است" }, { status: 400 });
  }

  // ─── تعدیل دستی شمار رفرال ───
  if (action === "adjust") {
   const userId = String(body?.userId || "");
   const delta = Math.round(Number(body?.delta));
   const grantReward = body?.grantReward === true;
   const amount = grantReward ? Math.round(Number(body?.amount) || REFERRAL_REWARD_TOMAN) : 0;

   if (!userId) {
    return NextResponse.json({ success: false, error: "شناسه کاربر الزامی است" }, { status: 400 });
   }
   if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1000) {
    return NextResponse.json(
     { success: false, error: "تغییر باید عددی بین ۱ تا ۱۰۰۰ (مثبت یا منفی) باشد" },
     { status: 400 }
    );
   }
   if (grantReward && (amount <= 0 || amount > 500_000_000)) {
    return NextResponse.json({ success: false, error: "مبلغ پاداش نامعتبر است" }, { status: 400 });
   }

   const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, tenantId: true, isActive: true, deletedAt: true },
   });
   if (!user || user.deletedAt) {
    return NextResponse.json({ success: false, error: "کاربر یافت نشد" }, { status: 404 });
   }

   // کد شخصی موجود یا ساخت کد جدید
   const existing = await db.referral.findFirst({
    where: { referrerId: userId },
    orderBy: { createdAt: "asc" },
    select: { code: true },
   });
   const code = existing?.code ?? generatePersonalCode(userId);

   let applied = 0;
   if (delta > 0) {
    // افزایش — رکوردهای دستی MANUAL با وضعیت SIGNED_UP (شمرده می‌شوند)
    for (let i = 0; i < delta; i++) {
     await db.referral.create({
      data: {
       referrerId: userId,
       refereeEmail: `${MANUAL_EMAIL_PREFIX}${Date.now()}-${i}@admin`,
       code,
       status: "SIGNED_UP",
       reward: 0,
      },
     });
    }
    applied = delta;
   } else {
    // کاهش — فقط رکوردهای دستی MANUAL حذف می‌شوند (جدیدترین اول)
    const manualRefs = await db.referral.findMany({
     where: { referrerId: userId, refereeEmail: { startsWith: MANUAL_EMAIL_PREFIX } },
     orderBy: { createdAt: "desc" },
     select: { id: true },
     take: Math.abs(delta),
    });
    if (manualRefs.length < Math.abs(delta)) {
     return NextResponse.json(
      {
       success: false,
       error: `فقط ${manualRefs.length.toLocaleString("fa-IR")} رکورد دستی برای کاهش وجود دارد — رکوردهای واقعی دعوت قابل حذف نیستند`,
      },
      { status: 400 }
     );
    }
    for (const r of manualRefs) {
     await db.referral.delete({ where: { id: r.id } });
    }
    applied = delta;
   }

   // پاداش نقدی اختیاری → کیف پول (نوع REFERRAL_BONUS — همان نوع پاداش دعوت)
   let walletMsg = "";
   if (grantReward && user.tenantId) {
    const { creditWallet } = await import("@/lib/wallet");
    const res = await creditWallet({
     tenantId: user.tenantId,
     userId: user.id,
     type: "REFERRAL_BONUS",
     amountToman: amount,
     description: "تعدیل دستی پاداش رفرال — سوپرادمین",
     meta: { adminId, manualAdjust: true, delta },
    });
    walletMsg = res.ok ? `پاداش ${amount.toLocaleString("fa-IR")} تومانی به کیف پول شارژ شد` : "شارژ پاداش ناموفق بود";
   }

   await db.platformAuditLog
    .create({
     data: {
      superAdminId: adminId,
      action: "REFERRAL_ADMIN_ADJUST",
      entity: "Referral",
      entityId: userId,
      details: JSON.stringify({ delta: applied, grantReward, amount, user: user.email }),
      ipAddress: req.headers.get("x-forwarded-for") || null,
     },
    })
    .catch(() => null);

   const newCount = await db.referral.count({
    where: { referrerId: userId, status: { in: ["SIGNED_UP", "REWARDED"] } },
   });

   return NextResponse.json({
    success: true,
    data: { referralCount: newCount },
    message: `شمار رفرال «${user.name || user.email}» ${applied > 0 ? "افزایش" : "کاهش"} یافت (جديد: ${newCount.toLocaleString("fa-IR")})${walletMsg ? " — " + walletMsg : ""}`,
   });
  }

  // ─── ساخت کاربر تستی برای لیدربورد مسابقه ───
  if (action === "create-test-user") {
   const name = String(body?.name || "").trim() || "کاربر تست رفرال";
   const referralCount = Math.max(0, Math.min(500, Math.round(Number(body?.referralCount) || 0)));

   const { generatePassword, hashPassword } = await import("@/lib/platform-auth");
   const stamp = Date.now().toString(36);
   const email = `reftest-${stamp}${TEST_EMAIL_SUFFIX}`;

   // سازمان + کاربر تستی (isDemo + ایمیل test → قابل تشخیص و حذف)
   const tenant = await db.tenant.create({
    data: {
     name: `سازمان تست ${name}`.slice(0, 80),
     subdomain: `reftest-${stamp}`,
     plan: "pro",
     status: "active",
    },
   });
   const password = generatePassword(10);
   const user = await db.user.create({
    data: {
     tenantId: tenant.id,
     email,
     username: `reftest${stamp}`,
     name,
     password: await hashPassword(password),
     role: "ADMIN",
     isActive: true,
     isDemo: true,
    },
   });

   // رکوردهای دعوت دستی به تعداد خواسته‌شده — با کد شخصی تستی
   const code = `TST-${stamp.toUpperCase().slice(0, 8)}`;
   if (referralCount > 0) {
    await db.referral.createMany({
     data: Array.from({ length: referralCount }, (_, i) => ({
      referrerId: user.id,
      refereeEmail: `${MANUAL_EMAIL_PREFIX}${stamp}-${i}${TEST_EMAIL_SUFFIX}`,
      code,
      status: "SIGNED_UP" as const,
      reward: 0,
     })),
    });
   }

   await db.platformAuditLog
    .create({
     data: {
      superAdminId: adminId,
      action: "REFERRAL_TEST_USER_CREATED",
      entity: "Referral",
      entityId: user.id,
      details: JSON.stringify({ name, email, referralCount, code }),
      ipAddress: req.headers.get("x-forwarded-for") || null,
     },
    })
    .catch(() => null);

   return NextResponse.json({
    success: true,
    data: { userId: user.id, email, password, referralCode: code, referralCount },
    message: `کاربر تستی «${name}» با ${referralCount.toLocaleString("fa-IR")} رفرال ساخته شد`,
   });
  }

  // ─── حذف کاربر تستی (فقط همین مسیر) ───
  if (action === "delete-test-user") {
   const userId = String(body?.userId || "");
   if (!userId) {
    return NextResponse.json({ success: false, error: "شناسه کاربر الزامی است" }, { status: 400 });
   }
   const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, tenantId: true, isDemo: true },
   });
   if (!user || !user.email.endsWith(TEST_EMAIL_SUFFIX)) {
    return NextResponse.json(
     { success: false, error: "فقط کاربران تستی همین بخش قابل حذف هستند" },
     { status: 400 }
    );
   }

   await db.referral.deleteMany({ where: { referrerId: user.id } });
   await db.user.delete({ where: { id: user.id } });
   if (user.tenantId) {
    await db.tenant.delete({ where: { id: user.tenantId } }).catch(() => null);
   }

   await db.platformAuditLog
    .create({
     data: {
      superAdminId: adminId,
      action: "REFERRAL_TEST_USER_DELETED",
      entity: "Referral",
      entityId: userId,
      details: JSON.stringify({ email: user.email }),
      ipAddress: req.headers.get("x-forwarded-for") || null,
     },
    })
    .catch(() => null);

   return NextResponse.json({
    success: true,
    message: `کاربر تستی ${user.email} و رکوردهایش حذف شد`,
   });
  }

  // ─── ذخیرهٔ پیکربندی مسابقه رفرال ───
  if (action === "save-contest") {
   const active = body?.active !== false;
   const title = String(body?.title || "").trim() || "مسابقه رفرال هوش";
   const prizes = Array.isArray(body?.prizes)
    ? body.prizes.map((p: unknown) => Math.max(0, Math.round(Number(p) || 0))).filter((p: number) => p > 0).slice(0, 10)
    : [];
   const endDateRaw = body?.endDate;
   const endDate = endDateRaw ? new Date(String(endDateRaw)) : null;
   const startDateRaw = body?.startDate;
   const startDate = startDateRaw ? new Date(String(startDateRaw)) : null;

   if (prizes.length === 0) {
    return NextResponse.json(
     { success: false, error: "جدول جایزه نمی‌تواند خالی باشد — حداقل یک جایزه وارد کنید" },
     { status: 400 }
    );
   }
   if (endDate && Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ success: false, error: "تاریخ پایان نامعتبر است" }, { status: 400 });
   }
   if (startDate && Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ success: false, error: "تاریخ شروع نامعتبر است" }, { status: 400 });
   }

   const value = JSON.stringify({
    active,
    title: title.slice(0, 80),
    prizes,
    startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate.toISOString() : null,
    endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : null,
   });
   await db.systemSettings.upsert({
    where: { key: "referral_contest" },
    update: { value },
    create: { key: "referral_contest", value },
   });

   await db.platformAuditLog
    .create({
     data: {
      superAdminId: adminId,
      action: "REFERRAL_CONTEST_SAVED",
      entity: "SystemSettings",
      entityId: "referral_contest",
      details: value,
      ipAddress: req.headers.get("x-forwarded-for") || null,
     },
    })
    .catch(() => null);

   return NextResponse.json({
    success: true,
    data: JSON.parse(value),
    message: "تنظیمات مسابقه رفرال ذخیره شد",
   });
  }

  return NextResponse.json({ success: false, error: "اکشن پشتیبانی نمی‌شود" }, { status: 400 });
 } catch (error) {
  console.error("Referral admin POST error:", error);
  return NextResponse.json({ success: false, error: "خطا در پردازش درخواست" }, { status: 500 });
 }
}
