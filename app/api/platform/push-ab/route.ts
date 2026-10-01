import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { sendPushNotification } from "@/lib/push-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============ آزمایش A/B پوش نوتیفیکیشن (Task 12-a) ============
// GET   /api/platform/push-ab        — لیست تست‌ها با آمار (sent/clicks/CTR)
// POST  /api/platform/push-ab        — ایجاد تست {name, title, bodyA, bodyB, urlA, urlB, splitPercent}
// PATCH /api/platform/push-ab        — {id, action: "send" | "pause" | "complete"}
// فقط سوپرادمین. ارسال واقعی از طریق lib/push-notifications (VAPID یا
// fallback درون‌سیستمی). رصد کلیک: /api/platform/push-ab/track?test=&variant=

const BATCH_SIZE = 40; // ارسال همزمان در هر دسته — فشار نیاوردن به سرور پوش

/** تخصیص قطعی variant بر اساس hash اندپوینت — hash mod 100 < splitPercent → A */
function pickVariant(endpoint: string, splitPercent: number): "A" | "B" {
  const hash = crypto.createHash("sha256").update(endpoint).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < splitPercent ? "A" : "B";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const tests = await db.pushABTest.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const data = tests.map((t) => {
      const ctrA = t.sentA > 0 ? (t.clicksA / t.sentA) * 100 : 0;
      const ctrB = t.sentB > 0 ? (t.clicksB / t.sentB) * 100 : 0;
      // راهنمای ساده معناداری: حداقل ۳۰ ارسال برای هر variant و اختلاف >۲۰٪
      let significanceHint: string | null = null;
      if (t.sentA >= 30 && t.sentB >= 30 && ctrA > 0 && ctrB > 0) {
        const diff = Math.abs(ctrA - ctrB);
        const base = Math.min(ctrA, ctrB);
        if (base > 0 && diff / base > 0.2) {
          const winner = ctrB > ctrA ? "B" : "A";
          const diffPercent = Math.round((diff / base) * 100);
          significanceHint = `برندهٔ احتمالی ${winner} با ${diffPercent}٪ اختلاف`;
        }
      }
      return {
        ...t,
        ctrA: Math.round(ctrA * 10) / 10,
        ctrB: Math.round(ctrB * 10) / 10,
        significanceHint,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Push A/B GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت لیست آزمایش‌ها" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim().slice(0, 120);
    const title = String(body?.title || "").trim().slice(0, 200);
    const bodyA = String(body?.bodyA || "").trim().slice(0, 2000);
    const bodyB = String(body?.bodyB || "").trim().slice(0, 2000);
    const urlA = String(body?.urlA || "").trim().slice(0, 500) || null;
    const urlB = String(body?.urlB || "").trim().slice(0, 500) || null;
    const splitPercentRaw = Number(body?.splitPercent ?? 50);
    const splitPercent = Number.isFinite(splitPercentRaw)
      ? Math.min(100, Math.max(0, Math.round(splitPercentRaw)))
      : 50;

    if (!name || !title || !bodyA || !bodyB) {
      return NextResponse.json(
        {
          success: false,
          error: "نام، عنوان و متن هر دو نسخه (A و B) الزامی است",
        },
        { status: 400 }
      );
    }
    if (bodyA === bodyB) {
      return NextResponse.json(
        { success: false, error: "متن نسخه A و B نباید یکسان باشد" },
        { status: 400 }
      );
    }

    const test = await db.pushABTest.create({
      data: { name, title, bodyA, bodyB, urlA, urlB, splitPercent },
    });

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "PUSH_AB_TEST_CREATED",
          entity: "PushABTest",
          entityId: test.id,
          details: JSON.stringify({ name, title, splitPercent }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: test,
      message: "آزمایش A/B ایجاد شد",
    });
  } catch (error) {
    console.error("Push A/B POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد آزمایش A/B" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    const action = String(body?.action || "");

    if (!id || !["send", "pause", "complete"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "پارامترهای نامعتبر (id و action الزامی)" },
        { status: 400 }
      );
    }

    const test = await db.pushABTest.findUnique({ where: { id } });
    if (!test) {
      return NextResponse.json(
        { success: false, error: "آزمایش یافت نشد" },
        { status: 404 }
      );
    }

    // ── pause / complete ──
    if (action === "pause" || action === "complete") {
      const status = action === "pause" ? "PAUSED" : "COMPLETED";
      if (test.status === status) {
        return NextResponse.json({
          success: true,
          data: test,
          message:
            action === "pause"
              ? "آزمایش از قبل متوقف بود"
              : "آزمایش از قبل تکمیل شده بود",
        });
      }
      const updated = await db.pushABTest.update({
        where: { id },
        data: { status, ...(action === "complete" ? { completedAt: new Date() } : {}) },
      });
      try {
        await db.platformAuditLog.create({
          data: {
            superAdminId: admin.id,
            action: action === "pause" ? "PUSH_AB_TEST_PAUSED" : "PUSH_AB_TEST_COMPLETED",
            entity: "PushABTest",
            entityId: id,
            details: JSON.stringify({ name: test.name }),
            ipAddress: req.headers.get("x-forwarded-for") || null,
          },
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({
        success: true,
        data: updated,
        message: action === "pause" ? "آزمایش متوقف شد" : "آزمایش تکمیل شد",
      });
    }

    // ── send: یک موج ارسال به همه اشتراک‌های فعال ──
    if (test.status === "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "این آزمایش تکمیل شده است" },
        { status: 400 }
      );
    }

    const subs = await db.pushSubscription.findMany({
      where: { isActive: true },
      select: { id: true, endpoint: true, p256dhKey: true, authKey: true },
    });

    let sentA = 0;
    let sentB = 0;
    let failed = 0;
    let removedExpired = 0;
    const expiredIds: string[] = [];

    for (let i = 0; i < subs.length; i += BATCH_SIZE) {
      const batch = subs.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (sub) => {
          const variant = pickVariant(sub.endpoint, test.splitPercent);
          const variantBody = variant === "A" ? test.bodyA : test.bodyB;
          const targetUrl =
            variant === "A" ? test.urlA || "/" : test.urlB || "/";
          // لینک از طریق endpoint رصد کلیک عبور می‌کند تا CTR دقیق ثبت شود
          const trackUrl = `/api/platform/push-ab/track?test=${test.id}&variant=${variant}`;
          const payload = {
            title: test.title,
            body: variantBody,
            data: { url: trackUrl, targetUrl, abTest: test.id, variant },
            tag: `push-ab-${test.id}`,
            timestamp: Date.now(),
          };
          try {
            const result = await sendPushNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } },
              payload
            );
            if (result.success) {
              if (variant === "A") sentA++;
              else sentB++;
            } else if (result.error === "subscription expired") {
              failed++;
              expiredIds.push(sub.id);
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        })
      );
    }

    // حذف اشتراک‌های منقضی‌شده (الگوی موجود در push-notifications.ts → اینجا حذف واقعی)
    if (expiredIds.length > 0) {
      try {
        const del = await db.pushSubscription.deleteMany({
          where: { id: { in: expiredIds } },
        });
        removedExpired = del.count;
      } catch {
        /* ignore */
      }
    }

    const updated = await db.pushABTest.update({
      where: { id },
      data: {
        sentA: { increment: sentA },
        sentB: { increment: sentB },
        status: "RUNNING", // اگر PAUSED بود با ارسال مجدد فعال می‌شود
      },
    });

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: admin.id,
          action: "PUSH_AB_TEST_SENT",
          entity: "PushABTest",
          entityId: id,
          details: JSON.stringify({
            name: test.name,
            recipients: subs.length,
            sentA,
            sentB,
            failed,
            removedExpired,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      data: updated,
      summary: { recipients: subs.length, sentA, sentB, failed, removedExpired },
      message:
        subs.length === 0
          ? "هیچ اشتراک فعالی برای ارسال وجود ندارد"
          : `ارسال انجام شد — گروه A: ${sentA} | گروه B: ${sentB}${failed > 0 ? ` | ناموفق: ${failed}` : ""}`,
    });
  } catch (error) {
    console.error("Push A/B PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای عملیات آزمایش A/B" },
      { status: 500 }
    );
  }
}
