import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ رصد کلیک آزمایش A/B پوش (Task 12-a) ============
// GET /api/platform/push-ab/track?test=<id>&variant=A|B
// endpoint عمومی (بدون احراز هویت — مثل لینک‌های UTM): شمارنده clicksA/clicksB
// را افزایش می‌دهد و به urlA/urlB ریدایرکت (302) می‌کند. لینک پوش در
// payload data.url به همین مسیر اشاره می‌کند تا CTR قابل اندازه‌گیری باشد.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const testId = searchParams.get("test") || "";
    const variant = (searchParams.get("variant") || "").toUpperCase();

    if (!testId || (variant !== "A" && variant !== "B")) {
      return NextResponse.redirect(new URL("/", req.url), 302);
    }

    const test = await db.pushABTest.findUnique({ where: { id: testId } });
    if (!test || test.status === "COMPLETED") {
      // تست تکمیل‌شده دیگر کلیک نمی‌شمارد — مستقیم ریدایرکت
      const fallback = variant === "A" ? test?.urlA || "/" : test?.urlB || "/";
      return NextResponse.redirect(new URL(fallback, req.url), 302);
    }

    await db.pushABTest.update({
      where: { id: testId },
      data: variant === "A" ? { clicksA: { increment: 1 } } : { clicksB: { increment: 1 } },
    });

    const target = variant === "A" ? test.urlA || "/" : test.urlB || "/";
    // فقط مسیرهای نسبی یا مطلقِ http(s) مجاز — جلوگیری از javascript: و غیره
    if (!/^https?:\/\//i.test(target) && !target.startsWith("/")) {
      return NextResponse.redirect(new URL("/", req.url), 302);
    }
    return NextResponse.redirect(new URL(target, req.url), 302);
  } catch (error) {
    console.error("Push A/B track error:", error);
    return NextResponse.redirect(new URL("/", req.url), 302);
  }
}
