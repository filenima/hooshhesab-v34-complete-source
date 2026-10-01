import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * GET /api/platform/seo-content — داشبورد سئو/محتوا برای پنل سوپرادمین:
 *   - پوشش خوشه‌های کلیدواژه (Cluster Coverage)
 *   - اجراهای اخیر موتور تولید مقاله
 *   - وضعیت بانک موضوعات (چند موضوع باقی مانده)
 *
 * POST /api/platform/seo-content — شروع اجرای تولید (فقط سوپرادمین):
 *   body: { count?: number }  — پیش‌فرض ۱۹
 *   ?status=<runId> — پایش پیشرفت اجرا
 */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const params = new URL(req.url).searchParams;
    const { getRun, listRuns, getClusterCoverage } = await import(
      "@/lib/seo/article-generator"
    );
    const { TOPIC_BANK } = await import("@/lib/seo/topic-bank");
    const { db } = await import("@/lib/db");

    const statusRunId = params.get("status");
    if (statusRunId) {
      const run = getRun(statusRunId);
      if (!run) {
        return NextResponse.json({ success: false, error: "run not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, run });
    }

    const [coverage, runs, usedTopics] = await Promise.all([
      getClusterCoverage(),
      Promise.resolve(listRuns(5)),
      db.blogPost.findMany({
        where: { slug: { in: TOPIC_BANK.map((t) => t.slug) } },
        select: { slug: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        coverage,
        runs: runs.map((r) => ({
          id: r.id,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          status: r.status,
          target: r.target,
          done: r.done,
          failed: r.failed,
          short: r.short,
          autoSchedule: r.autoSchedule,
          error: r.error,
        })),
        bank: {
          total: TOPIC_BANK.length,
          used: usedTopics.length,
          remaining: TOPIC_BANK.length - usedTopics.length,
        },
      },
    });
  } catch (error) {
    console.error("SEO content GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت وضعیت سئو" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    let count = 19;
    try {
      const body = await req.json();
      if (typeof body?.count === "number") {
        count = Math.max(1, Math.min(19, Math.round(body.count)));
      }
    } catch {
      /* body خالی — پیش‌فرض ۱۹ */
    }

    const { startGenerationRun, getRun } = await import("@/lib/seo/article-generator");
    const runId = await startGenerationRun(count);
    const run = getRun(runId);
    return NextResponse.json({
      success: true,
      runId,
      target: run?.target ?? count,
      message: `تولید ${count} مقالهٔ سئو در پس‌زمینه آغاز شد. با GET ?status=${runId} پیشرفت را ببینید.`,
    });
  } catch (error) {
    console.error("SEO content POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در شروع تولید محتوا: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
