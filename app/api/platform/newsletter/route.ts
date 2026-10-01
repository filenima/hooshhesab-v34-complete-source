import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { sendEmail, isSmtpActive } from "@/lib/email-sender";
import { runWeeklyNewsletter } from "@/lib/newsletter-weekly";

// ============================================================
// /api/platform/newsletter — مدیریت خبرنامه (سوپرادمین)
// ============================================================
//   GET    ?limit=&offset=&status=&q=   → لیست + آمار + شماره‌های ارسال‌شده (v34)
//   PATCH  {id, status}                 → تغییر وضعیت مشترک
//   DELETE ?id=                          → حذف مشترک
//   POST   {subject, html, onlyActive}   → ارسال کمپین (SMTP واقعی)
//   POST   {section:"weekly-test", toEmail} → پیش‌نمایش شمارهٔ هفتگی فقط به یک ایمیل (v34)
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CAMPAIGN = 500; // سقف ایمیل هر ارسال (حفاظت انفجار ارسال)

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const status = sp.get("status") || undefined;
  const q = (sp.get("q") || "").trim();

  try {
    const where: Record<string, unknown> = {};
    if (status && ["ACTIVE", "UNSUBSCRIBED", "BLOCKED"].includes(status)) {
      where.status = status;
    }
    if (q) where.email = { contains: q };

    const [items, total, activeCount, unsubscribedCount, blockedCount, issues] = await Promise.all([
      db.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          source: true,
          lastEmailAt: true,
          createdAt: true,
        },
      }),
      db.newsletterSubscriber.count({ where }),
      db.newsletterSubscriber.count({ where: { status: "ACTIVE" } }),
      db.newsletterSubscriber.count({ where: { status: "UNSUBSCRIBED" } }),
      db.newsletterSubscriber.count({ where: { status: "BLOCKED" } }),
      // v34 — شماره‌های ارسال‌شده (خبرنامهٔ هفتگی/دستی/آزمایشی)
      db.newsletterIssue.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          subject: true,
          postSlugs: true,
          recipientCount: true,
          sentCount: true,
          failedCount: true,
          mode: true,
          createdAt: true,
          sentAt: true,
          senderNote: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: items,
      stats: { total, active: activeCount, unsubscribed: unsubscribedCount, blocked: blockedCount },
      issues,
    });
  } catch (err) {
    console.error("[platform/newsletter] GET failed:", err);
    return NextResponse.json({ success: false, error: "خطا در خواندن خبرنامه" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  let body: { id?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "بدنهٔ نامعتبر" }, { status: 400 });
  }

  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  if (!id || !["ACTIVE", "UNSUBSCRIBED", "BLOCKED"].includes(status)) {
    return NextResponse.json({ success: false, error: "پارامترهای نامعتبر" }, { status: 400 });
  }

  try {
    const updated = await db.newsletterSubscriber.update({
      where: { id },
      data: { status, updatedAt: new Date() },
      select: { id: true, email: true, status: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: "مشترک یافت نشد" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json({ success: false, error: "شناسه لازم است" }, { status: 400 });
  }

  try {
    await db.newsletterSubscriber.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "مشترک یافت نشد" }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  let body: { subject?: unknown; html?: unknown; onlyActive?: unknown; section?: unknown; toEmail?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "بدنهٔ نامعتبر" }, { status: 400 });
  }

  // v34 — پیش‌نمایش شمارهٔ هفتگی: همان سازندهٔ کرون، فقط برای یک ایمیل (mode=test)
  if (body.section === "weekly-test") {
    const result = await runWeeklyNewsletter({
      mode: "test",
      testEmail: String(body.toEmail ?? ""),
    });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "خطا در ارسال آزمایشی" }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      data: {
        issueId: result.issueId,
        subject: result.subject,
        posts: result.posts,
        usedFallback: result.usedFallback,
        recipients: result.recipients,
        sent: result.sent,
        failed: result.failed,
        smtpMock: result.smtpMock,
      },
    });
  }

  const subject = String(body.subject ?? "").trim();
  const html = String(body.html ?? "").trim();
  const onlyActive = body.onlyActive !== false;

  if (subject.length < 3 || subject.length > 150) {
    return NextResponse.json({ success: false, error: "موضوع باید بین ۳ تا ۱۵۰ نویسه باشد" }, { status: 400 });
  }
  if (html.length < 10 || html.length > 100_000) {
    return NextResponse.json({ success: false, error: "محتوای ایمیل نامعتبر است" }, { status: 400 });
  }

  // SMTP فعال است؟ (اگر mock است هشدار بده — ایمیل واقعی نمی‌رود)
  const smtp = await isSmtpActive();

  try {
    const subscribers = await db.newsletterSubscriber.findMany({
      where: onlyActive ? { status: "ACTIVE" } : {},
      select: { id: true, email: true },
      take: MAX_CAMPAIGN,
      orderBy: { createdAt: "asc" },
    });

    if (subscribers.length === 0) {
      return NextResponse.json(
        { success: false, error: "هیچ مشترک فعالی برای ارسال وجود ندارد" },
        { status: 400 }
      );
    }

    let sent = 0;
    let failed = 0;
    const now = new Date();
    for (const s of subscribers) {
      try {
        const res = await sendEmail({ to: s.email, subject, html });
        if (res.success || res.mock) {
          sent += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

    // به‌روزرسانی lastEmailAt فقط برای همان دسته
    await db.newsletterSubscriber.updateMany({
      where: { id: { in: subscribers.map((s) => s.id) } },
      data: { lastEmailAt: now, updatedAt: now },
    });

    return NextResponse.json({
      success: true,
      data: {
        recipients: subscribers.length,
        sent,
        failed,
        smtpMock: smtp.mock === true,
      },
    });
  } catch (err) {
    console.error("[platform/newsletter] POST campaign failed:", err);
    return NextResponse.json({ success: false, error: "خطا در ارسال کمپین" }, { status: 500 });
  }
}
