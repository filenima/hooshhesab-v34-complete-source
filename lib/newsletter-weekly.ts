// ============================================================
// lib/newsletter-weekly — خبرنامهٔ هفتگی خودکار (#۱۶ — v34)
// ============================================================
// ساخت و ارسال «شمارهٔ هفتگی» خبرنامهٔ هوش:
//  - گردآوری پست‌های منتشرشدهٔ ۷ روز اخیر (fallback: ۳ پست منتشرشدهٔ اخیر)
//  - ساخت ایمیل HTML فارسی RTL با استایل درون‌خطی و لهجهٔ زمردی (بدون ایموجی)
//  - ارسال به مشترکین فعال (سقف ۵۰۰ در هر اجرا) با تلاش مجدد
//  - ثبت ردیف NewsletterIssue (mode: auto | manual | test)
//
// زمان‌بندی پیشنهادی: پنجشنبه‌ها ساعت ۹:۳۰ تهران (سرآغاز آخر هفتهٔ کاری
// ایران — بیشترین نرخ باز شدن ایمیل کسب‌وکاری) — از طریق کرون خارجی:
//   curl -H "x-cron-secret: $CRON_SECRET" https://SITE/api/cron/newsletter-weekly
//
// گارد هفتگی: اگر در ۶ روز گذشته شمارهٔ auto ثبت شده باشد، ارسال رد می‌شود
// تا تکرار در همان هفته غیرممکن باشد (idempotent).

import { db } from "@/lib/db";
import { sendEmail, isSmtpActive } from "@/lib/email-sender";
import { getAppBaseUrl } from "@/lib/app-url";
import { getBrandingSettings } from "@/lib/system-settings";
import { toPersianDigits, gregorianToJalali } from "@/lib/persian";

export const WEEKLY_MAX_RECIPIENTS = 500;
const WEEKLY_GUARD_DAYS = 6;
const POSTS_WINDOW_DAYS = 7;
const FALLBACK_POSTS = 3;

export interface WeeklyPost {
  slug: string;
  title: string;
  excerpt: string | null;
  readingTime: number;
  category: string;
}

export interface WeeklyIssueContent {
  subject: string;
  html: string;
  postSlugs: string[];
  posts: WeeklyPost[];
  usedFallback: boolean;
}

export interface WeeklySendResult {
  success: boolean;
  skipped?: string;
  issueId?: string;
  subject?: string;
  posts: string[];
  usedFallback: boolean;
  recipients: number;
  sent: number;
  failed: number;
  smtpMock: boolean;
  error?: string;
}

/* ---------------- گردآوری پست‌ها ---------------- */

export async function gatherWeeklyPosts(): Promise<{ posts: WeeklyPost[]; usedFallback: boolean }> {
  const since = new Date(Date.now() - POSTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const recent = await db.blogPost.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ publishedAt: { gte: since } }, { publishedAt: null, createdAt: { gte: since } }],
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 5,
    select: { slug: true, title: true, excerpt: true, readingTime: true, category: true },
  });

  if (recent.length > 0) {
    return { posts: recent, usedFallback: false };
  }

  // هیچ پست تازه‌ای نیست → ۳ پست منتشرشدهٔ اخیر به‌عنوان «پیشنهاد مطالعه»
  const latest = await db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: FALLBACK_POSTS,
    select: { slug: true, title: true, excerpt: true, readingTime: true, category: true },
  });

  return { posts: latest, usedFallback: true };
}

/* ---------------- استایل‌های درون‌خطی ایمیل ---------------- */

// پالت زمردی (بدون آبی/نیلی) — همهٔ استایل‌ها درون‌خطی برای سازگاری کلاینت‌های ایمیل
const EMERALD = "#0E9F6E";
const EMERALD_DARK = "#047857";
const TEAL_SOFT = "#E6F6F0";
const INK = "#1F2937";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";
const BG = "#F6F8F7";

const CATEGORY_FA: Record<string, string> = {
  ACCOUNTING: "حسابداری",
  TAX: "مالیات",
  PAYROLL: "حقوق و دستمزد",
  TUTORIAL: "آموزش",
  NEWS: "خبر",
  MODIAN: "مودیان",
};

/* ---------------- ساخت محتوای شماره ---------------- */

export async function buildWeeklyIssueContent(): Promise<WeeklyIssueContent> {
  const [baseUrl, branding, { posts, usedFallback }] = await Promise.all([
    getAppBaseUrl().catch(() => "https://hoosh.nobatime.ir"),
    getBrandingSettings().catch(() => null),
    gatherWeeklyPosts(),
  ]);

  const brandName = branding?.appName || "هوش";
  const jalaliToday = (() => {
    try {
      const [jy, jm, jd] = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
      return toPersianDigits(`${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`);
    } catch {
      return "";
    }
  })();

  const subject = usedFallback
    ? `پیشنهاد مطالعهٔ این هفته — ${brandName}`
    : `خبرنامهٔ هوش | تازه‌های این هفته${jalaliToday ? ` (${jalaliToday})` : ""}`;

  const postCards = posts
    .map(
      (p) => `
    <tr>
      <td style="padding:0 0 14px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 6px 0;direction:rtl;text-align:right;">
                <span style="display:inline-block;background:${TEAL_SOFT};color:${EMERALD_DARK};border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;font-family:Tahoma,'Segoe UI',sans-serif;">
                  ${CATEGORY_FA[p.category] || "مقاله"}
                </span>
                <span style="color:${MUTED};font-size:11px;font-family:Tahoma,'Segoe UI',sans-serif;"> · ${toPersianDigits(String(p.readingTime || 5))} دقیقه مطالعه</span>
              </p>
              <h3 style="margin:0 0 8px 0;direction:rtl;text-align:right;font-size:16px;line-height:1.7;color:${INK};font-family:Tahoma,'Segoe UI',sans-serif;">
                <a href="${baseUrl}/blog/${p.slug}" style="color:${INK};text-decoration:none;font-weight:800;">${p.title}</a>
              </h3>
              <p style="margin:0 0 12px 0;direction:rtl;text-align:right;font-size:13px;line-height:2;color:${MUTED};font-family:Tahoma,'Segoe UI',sans-serif;">
                ${(p.excerpt || "خواندن این مقاله را از دست ندهید.").slice(0, 180)}
              </p>
              <a href="${baseUrl}/blog/${p.slug}" style="display:inline-block;direction:rtl;background:${EMERALD};color:#FFFFFF;text-decoration:none;border-radius:8px;padding:9px 18px;font-size:12px;font-weight:700;font-family:Tahoma,'Segoe UI',sans-serif;">
                خواندن مقاله
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background:${BG};direction:rtl;">
  <div style="display:none;max-height:0;overflow:hidden;">${usedFallback ? "مقالات منتخب هوش برای شما" : "تازه‌ترین مقالات حسابداری و مالیات این هفته"} — ${brandName}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- هدر -->
          <tr>
            <td style="background:linear-gradient(135deg,${EMERALD} 0%,${EMERALD_DARK} 100%);background-color:${EMERALD_DARK};border-radius:14px 14px 0 0;padding:26px 24px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:20px;font-weight:800;color:#FFFFFF;font-family:Tahoma,'Segoe UI',sans-serif;">${brandName}</p>
              <p style="margin:0;font-size:12px;color:#D1FAE5;font-family:Tahoma,'Segoe UI',sans-serif;">
                ${usedFallback ? "پیشنهاد مطالعهٔ این هفته" : "خبرنامهٔ هفتگی — تازه‌های حسابداری و مالیات"}${jalaliToday ? ` · ${jalaliToday}` : ""}
              </p>
            </td>
          </tr>
          <!-- بدنه -->
          <tr>
            <td style="background:#FFFFFF;border:1px solid ${LINE};border-top:none;border-radius:0 0 14px 14px;padding:24px 20px;">
              <p style="margin:0 0 18px 0;direction:rtl;text-align:right;font-size:13px;line-height:2.1;color:${INK};font-family:Tahoma,'Segoe UI',sans-serif;">
                ${usedFallback ? "این هفته مقالهٔ تازه‌ای منتشر نشد؛ اما این سه مقالهٔ اخیر، پرخواننده‌ترین‌های ماه‌های اخیرند و اگر هنوز نخوانده‌اید ارزش وقت گذاشتن دارند:" : "این هفته این مقالات تازه در بلاگ هوش منتشر شد — خلاصه‌ای از هرکدام را اینجا می‌خوانید و با یک کلیک به متن کامل می‌روید:"}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${postCards}
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
                <tr>
                  <td style="background:${TEAL_SOFT};border:1px solid ${EMERALD};border-radius:12px;padding:16px 20px;text-align:center;">
                    <p style="margin:0 0 10px 0;direction:rtl;font-size:13px;font-weight:800;color:${EMERALD_DARK};font-family:Tahoma,'Segoe UI',sans-serif;">همهٔ محاسبات مالیاتی و مالی کسب‌وکارتان خودکار شود</p>
                    <a href="${baseUrl}/pricing" style="display:inline-block;direction:rtl;background:${EMERALD_DARK};color:#FFFFFF;text-decoration:none;border-radius:8px;padding:10px 24px;font-size:13px;font-weight:700;font-family:Tahoma,'Segoe UI',sans-serif;">
                      تریال ۳ روزهٔ رایگان ${brandName}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- فوتر -->
          <tr>
            <td style="padding:18px 8px;text-align:center;">
              <p style="margin:0 0 6px 0;direction:rtl;font-size:11px;color:${MUTED};font-family:Tahoma,'Segoe UI',sans-serif;line-height:2;">
                این ایمیل را دریافت کردید چون در خبرنامهٔ ${brandName} عضو هستید.
              </p>
              <p style="margin:0;direction:rtl;font-size:11px;color:${MUTED};font-family:Tahoma,'Segoe UI',sans-serif;">
                <a href="{{UNSUBSCRIBE_URL}}" style="color:${EMERALD_DARK};text-decoration:underline;">لغو عضویت</a>
                ·
                <a href="${baseUrl}/blog" style="color:${EMERALD_DARK};text-decoration:underline;">همهٔ مقالات</a>
                ·
                <a href="${baseUrl}" style="color:${EMERALD_DARK};text-decoration:underline;">${brandName}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    html,
    postSlugs: posts.map((p) => p.slug),
    posts,
    usedFallback,
  };
}

/* ---------------- گارد هفتگی ---------------- */

export async function isWeeklyAlreadySent(): Promise<boolean> {
  const since = new Date(Date.now() - WEEKLY_GUARD_DAYS * 24 * 60 * 60 * 1000);
  const recent = await db.newsletterIssue.findFirst({
    where: { mode: "auto", createdAt: { gte: since } },
    select: { id: true },
  });
  return Boolean(recent);
}

/* ---------------- ارسال با لغو عضویت شخصی ---------------- */

function buildUnsubscribeUrl(baseUrl: string, email: string): string {
  return `${baseUrl}/api/newsletter/subscribe?unsubscribe=${encodeURIComponent(email)}`;
}

/** ارسال با یک تلاش مجدد در شکست موقت */
async function sendWithRetry(params: { to: string; subject: string; html: string }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await sendEmail(params);
      if (res.success) return res;
      if (attempt === 1) return res;
    } catch (err) {
      if (attempt === 1) {
        return { success: false, error: err instanceof Error ? err.message : "خطای ناشناخته" };
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { success: false as const, error: "unreachable" };
}

/* ---------------- اجرای کامل شمارهٔ هفتگی ---------------- */

export async function runWeeklyNewsletter(options: {
  mode: "auto" | "manual" | "test";
  /** برای حالت test — ارسال فقط به این آدرس */
  testEmail?: string;
}): Promise<WeeklySendResult> {
  const { mode, testEmail } = options;

  try {
    const baseUrl = await getAppBaseUrl().catch(() => "https://hoosh.nobatime.ir");
    const content = await buildWeeklyIssueContent();
    const smtp = await isSmtpActive();
    const smtpMock = !smtp.active;

    // گیرندگان: حالت آزمایشی فقط یک آدرس؛ در غیر این صورت مشترکین فعال (سقف ۵۰۰)
    let recipients: { id: string; email: string }[] = [];
    if (mode === "test") {
      const email = (testEmail || "").trim().toLowerCase();
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return {
          success: false,
          posts: content.postSlugs,
          usedFallback: content.usedFallback,
          recipients: 0,
          sent: 0,
          failed: 0,
          smtpMock,
          error: "آدرس ایمیل دریافت نسخهٔ آزمایشی معتبر نیست",
        };
      }
      recipients = [{ id: "test", email }];
    } else {
      recipients = await db.newsletterSubscriber.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, email: true },
        take: WEEKLY_MAX_RECIPIENTS,
        orderBy: { createdAt: "asc" },
      });
    }

    let sent = 0;
    let failed = 0;
    const now = new Date();

    for (const r of recipients) {
      // لینک لغو عضویت شخصی — جایگزینی در فوتر هر گیرنده
      const personalizedHtml = content.html.replaceAll(
        "{{UNSUBSCRIBE_URL}}",
        buildUnsubscribeUrl(baseUrl, r.email)
      );
      const res = await sendWithRetry({ to: r.email, subject: content.subject, html: personalizedHtml });
      if (res.success) sent += 1;
      else failed += 1;
    }

    // به‌روزرسانی lastEmailAt فقط برای مشترکین واقعی همان دسته
    if (mode !== "test" && recipients.length > 0) {
      const realIds = recipients.filter((r) => r.id !== "test").map((r) => r.id);
      if (realIds.length > 0) {
        await db.newsletterSubscriber.updateMany({
          where: { id: { in: realIds } },
          data: { lastEmailAt: now, updatedAt: now },
        });
      }
    }

    // ثبت شماره در تاریخچه — حتی در حالت mock (با یادداشت)
    const senderNote = smtpMock ? "SMTP پیکربندی نشده — ارسال در حالت mock ثبت شد" : null;
    const issue = await db.newsletterIssue.create({
      data: {
        subject: content.subject,
        html: content.html,
        postSlugs: JSON.stringify(content.postSlugs),
        recipientCount: recipients.length,
        sentCount: sent,
        failedCount: failed,
        mode,
        sentAt: now,
        senderNote,
      },
      select: { id: true },
    });

    return {
      success: true,
      issueId: issue.id,
      subject: content.subject,
      posts: content.postSlugs,
      usedFallback: content.usedFallback,
      recipients: recipients.length,
      sent,
      failed,
      smtpMock,
    };
  } catch (err) {
    console.error("[newsletter-weekly] run failed:", err);
    return {
      success: false,
      posts: [],
      usedFallback: false,
      recipients: 0,
      sent: 0,
      failed: 0,
      smtpMock: false,
      error: err instanceof Error ? err.message : "خطای ناشناخته",
    };
  }
}
