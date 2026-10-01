// ============================================================
// mini-services/seo-worker — موتور مستقل تولید مقالهٔ سئو هوش (v31)
// ============================================================
// FIX(v31): تولید هر مقاله ۵-۸ دقیقه فراخوانی LLM نیاز دارد؛ سرور
// Next.js در سندباکس ۴GB با ترافیک کاربر هر ~۹۰ ثانیه memory-recycle
// می‌شد → اجرای ۱۹تایی همیشه نیمه‌کاره می‌مرد (لاگ ۱۱:۲۴ با done=0).
// این پروسهٔ کوچکِ bun (~۱۰۰MB) مستقل از Next.js اجرا می‌شود:
//   - تولید مقاله از بانک موضوع (lib/seo/article-core — منطق مشترک)
//   - ذخیرهٔ پیشنویس + نوبت‌دهی انتشار (autoScheduleDrafts)
//   - وضعیت اجرا در /tmp/hoosh-seo-runs.json (مشترک با پنل سوپرادمین)
//   - ازسرگیری خودکار نیمه‌کاره‌ها هنگام بوت (با dedupe)
//
// HTTP (پورت ۳۰۳۵):
//   GET  /status         → اجراهای اخیر
//   GET|POST /start?count=N → شروع اجرای جدید (پیش‌فرض ۱۹)
//
// z-ai-web-dev-sdk فقط در همین پروسهٔ backend استفاده می‌شود.
// ============================================================

import "./env"; // اول — DATABASE_URL و JWT_SECRET
import { writeFileSync, readFileSync, existsSync } from "fs";
import {
  ARTICLES_PER_RUN,
  MIN_WORDS,
  generateArticle,
  extractExcerpt,
} from "../../lib/seo/article-core";
import { TOPIC_BANK, type TopicBrief } from "../../lib/seo/topic-bank";

const PORT = 3035;
const RUNS_FILE = "/tmp/hoosh-seo-runs.json";

// FIX(v31 — zombie-loop guard): با bun --hot، پروسهٔ قدیمی بعد از reload
// زنده می‌ماند و حلقهٔ تولیدش ادامه پیدا می‌کند → دو حلقهٔ موازی LLM را
// دوبرابر می‌زدند (۴۲۹ طولانی‌تر) و هر دو روی فایل وضعیت می‌نوشتند.
// هر بارگذاری ماژول شناسهٔ یکتا می‌گیرد؛ فقط «جدیدترین» instance حق
// نوشتن فایل و ادامهٔ حلقه را دارد — زامبی‌ها بی‌سروصدا می‌میرند.
const globalForWorker = globalThis as unknown as { __seoWorkerInstance?: number };
const MY_INSTANCE = (globalForWorker.__seoWorkerInstance =
  (globalForWorker.__seoWorkerInstance ?? 0) + 1);
function isZombie(): boolean {
  return MY_INSTANCE !== globalForWorker.__seoWorkerInstance;
}

// ============ رجیستری اجرا ============

export interface GenerationRunArticle {
  slug: string;
  title: string;
  status: "done" | "short" | "failed" | "generating";
  words?: number;
  tables?: number;
  retryUsed?: boolean;
  error?: string;
}

export interface GenerationRun {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  target: number;
  done: number;
  failed: number;
  short: number;
  articles: GenerationRunArticle[];
  status: "running" | "finished" | "error";
  error?: string;
  autoSchedule?: { scheduled: number; intervalDays: number } | null;
}

const RUNS = new Map<string, GenerationRun>();

function listRunsSorted(limit = 5): GenerationRun[] {
  return Array.from(RUNS.values())
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit);
}

function persistRuns(): void {
  if (isZombie()) return; // زامبی نمی‌نویسد
  try {
    const runs = listRunsSorted(5).map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    }));
    writeFileSync(RUNS_FILE, JSON.stringify(runs), "utf8");
  } catch {
    /* best-effort */
  }
}

// ازسرگیری خودکار — با dedupe: چند اجرای نیمه‌کارهٔ هم‌زمان فقط «یک»
// جایگزین با بیشینهٔ باقی‌مانده می‌سازند (باگ تریگر دوگانهٔ قبلی).
function loadPersistedRuns(): void {
  try {
    if (!existsSync(RUNS_FILE)) return;
    const parsed = JSON.parse(readFileSync(RUNS_FILE, "utf8")) as Array<
      GenerationRun & { startedAt: string; finishedAt: string | null }
    >;

    let staleRemaining = 0;
    let hasStale = false;

    for (const r of parsed) {
      if (RUNS.has(r.id)) continue;
      const wasRunning = r.status === "running";
      RUNS.set(r.id, {
        ...r,
        status: wasRunning ? "error" : r.status,
        error: wasRunning
          ? "بازراه‌اندازی پروسهٔ worker — ادامهٔ خودکار در اجرای جدید"
          : r.error,
        startedAt: new Date(r.startedAt),
        finishedAt: r.finishedAt ? new Date(r.finishedAt) : new Date(),
      });
      if (wasRunning) {
        hasStale = true;
        staleRemaining = Math.max(staleRemaining, Math.max(0, (r.target || 0) - (r.done || 0)));
      }
    }

    if (hasStale && staleRemaining > 0) {
      const resuming = staleRemaining;
      console.log(`[seo-worker] auto-resume: ${resuming} articles remaining from stale run(s)`);
      setTimeout(() => {
        void startGenerationRun(resuming).catch((e) =>
          console.error("[seo-worker] auto-resume failed:", e)
        );
      }, 15_000);
    }
  } catch {
    /* best-effort */
  }
}

// ============ گیت سهمیهٔ LLM ============
// FIX(v31): سهمیهٔ LLM سندباکس گاهی برای مدتی «کلی» تمام می‌شود (ترافیک
// کاربر + کرون‌ها + تولید مقاله). retry کورکورانه فقط CPU می‌سوزاند. این
// گیت قبل از هر مقاله با یک فراخوانی سبک سهمیه را چک می‌کند و تا برگشت
// آن هر ۵ دقیقه صبر می‌کند (حداکثر ۶ ساعت — بعدش اجرا با پیام صادقانه
// خطا می‌خورد و کرون هفتگی/ازسرگیری دوباره تلاش می‌کند).
const QUOTA_SLEEP_MS = 5 * 60 * 1000;
const QUOTA_MAX_WAIT_MS = 6 * 60 * 60 * 1000;

async function quotaPing(): Promise<boolean> {
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    await zai.chat.completions.create({
      messages: [{ role: "user", content: "پینگ" }],
      thinking: { type: "disabled" },
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // ۴۲۹ یعنی سهمیه نیست؛ خطای دیگر را به لایه retry عادی واگذار می‌کنیم
    return !/429|too many/i.test(msg);
  }
}

async function waitForQuota(entry: GenerationRunArticle): Promise<boolean> {
  const start = Date.now();
  let waited = 0;
  while (Date.now() - start < QUOTA_MAX_WAIT_MS) {
    if (isZombie()) return false;
    if (await quotaPing()) return true;
    waited = Math.round((Date.now() - start) / 60000);
    entry.error = `سهمیهٔ LLM موقتاً تمام است — بررسی مجدد هر ۵ دقیقه (${waited} دقیقه گذشت)`;
    persistRuns();
    await new Promise((r) => setTimeout(r, QUOTA_SLEEP_MS));
  }
  return false;
}

// ============ بانک موضوع + ذخیره ============

// db به‌صورت lazy import می‌شود تا هات‌ریلود سریع بماند
async function getDb() {
  const { db } = await import("@/lib/db");
  return db;
}

async function pickNextTopics(count: number): Promise<TopicBrief[]> {
  const db = await getDb();
  const slugs = TOPIC_BANK.map((t) => t.slug);
  const existing = await db.blogPost.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true },
  });
  const used = new Set(existing.map((e) => e.slug));
  return TOPIC_BANK.filter((t) => !used.has(t.slug)).slice(0, count);
}

/** بافر کش بلاگ سرور Next.js را (از راه دور) باطل می‌کند */
function bustNextBlogCache(): void {
  void fetch("http://127.0.0.1:3000/api/blog/list?fresh=1&limit=1", {
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined);
}

/** ذخیرهٔ پست با retry روی قفل SQLite (نویسندهٔ هم‌زمان از سرور) */
async function savePostWithRetry(topic: TopicBrief, html: string, words: number): Promise<void> {
  const db = await getDb();
  const data = {
    slug: topic.slug,
    title: topic.title,
    excerpt: extractExcerpt(html),
    content: html,
    coverImage: topic.coverImage,
    category: topic.category,
    tags: JSON.stringify([topic.focusKeyword, `cluster:${topic.cluster}`, "seo-generated"]),
    status: "DRAFT" as const,
    metaTitle: topic.title.slice(0, 60),
    metaDescription: extractExcerpt(html).slice(0, 158),
    focusKeyword: topic.focusKeyword,
    readingTime: Math.max(8, Math.round(words / 220)),
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const exists = await db.blogPost.findUnique({ where: { slug: topic.slug } });
      if (!exists) {
        await db.blogPost.create({ data });
      }
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isBusy = /busy|locked|P2034/i.test(msg);
      if (!isBusy || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ============ اجرای دسته‌ای ============

export async function startGenerationRun(count = ARTICLES_PER_RUN): Promise<string> {
  // گارد دوگانگی: اگر اجرای فعالی هست، همان را برگردان (باگ تریگر دوگانه)
  const active = Array.from(RUNS.values()).find((r) => r.status === "running");
  if (active) {
    console.log(`[seo-worker] run already active (${active.id}) — returning existing`);
    return active.id;
  }

  const runId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const run: GenerationRun = {
    id: runId,
    startedAt: new Date(),
    finishedAt: null,
    target: count,
    done: 0,
    failed: 0,
    short: 0,
    articles: [],
    status: "running",
  };
  RUNS.set(runId, run);
  persistRuns();
  console.log(`[seo-worker] run ${runId} started (target=${count})`);

  // اجرای پس‌زمینه — endpoint فوراً برمی‌گردد
  void (async () => {
    try {
      const topics = await pickNextTopics(count);
      run.target = topics.length;
      if (topics.length === 0) {
        run.status = "finished";
        run.finishedAt = new Date();
        run.error = "بانک موضوع تمام شده است — موضوعات جدید نیاز است.";
        persistRuns();
        return;
      }

      for (const topic of topics) {
        // زامبی‌ها اینجا می‌ایستند — نسخهٔ جدید ماژول جایگزین شده
        if (isZombie()) {
          console.log(`[seo-worker] zombie loop aborted before ${topic.slug}`);
          return;
        }
        const entry: GenerationRunArticle = {
          slug: topic.slug,
          title: topic.title,
          status: "generating",
        };
        run.articles.push(entry);
        persistRuns();

        // FIX(v31 — rate-limit resilience): اگر مقاله به‌خاطر 429 شکست خورد،
        // همان موضوع بعد از ۹۰ ثانیه cooldown دوباره تلاش می‌شود (تا ۳ بار)
        // — اجرا موضوعات را پشت‌سرهم بی‌فایده نمی‌سوزاند.
        for (let attempt = 0; attempt <= 3; attempt++) {
          // گیت سهمیه — قبل از هر تلاش سنگین، با پینگ سبک چک کن
          if (!(await waitForQuota(entry))) {
            entry.status = "failed";
            entry.error = "سهمیهٔ LLM تا ۶ ساعت برنگشت — اجرای بعدی (کرون/ازسرگیری) ادامه می‌دهد";
            run.failed++;
            run.status = "error";
            run.error = "سهمیهٔ LLM تمام شد — مقالهٔ شکست‌خورده در بانک موضوع می‌ماند و کرون بعدی دوباره می‌سازد";
            run.finishedAt = new Date();
            persistRuns();
            return;
          }
          try {
            const { html, validation, rounds, saved } = await generateArticle(topic);
            entry.words = validation.words;
            entry.tables = validation.tables;
            entry.retryUsed = rounds > 2;

            // زیر حداقل کیفیت ذخیره نمی‌شود — موضوع در بانک می‌ماند
            if (!saved) {
              entry.status = "failed";
              entry.error = `کیفیت پایین پس از ${rounds} دور: ${validation.problems.join("؛ ")}`;
              run.failed++;
              break;
            }

            await savePostWithRetry(topic, html, validation.words);

            if (validation.words >= 3000) {
              entry.status = "done";
              run.done++;
            } else {
              entry.status = "short";
              run.short++;
            }
            bustNextBlogCache();
            console.log(
              `[seo-worker] ${topic.slug}: ${validation.words} words, ${validation.tables} tables ✓`
            );
            break;
          } catch (err) {
            entry.error = err instanceof Error ? err.message : String(err);
            const isRateLimit = /429|too many/i.test(entry.error);
            if (isRateLimit && attempt < 3) {
              entry.status = "generating";
              entry.error = `rate-limit — تلاش مجدد ${attempt + 1}/۳ پس از ۹۰ ثانیه`;
              console.warn(`[seo-worker] ${topic.slug}: rate-limited, cooling down 90s`);
              persistRuns();
              await new Promise((r) => setTimeout(r, 90_000));
              continue;
            }
            entry.status = "failed";
            run.failed++;
            console.error(`[seo-worker] ${topic.slug} failed:`, entry.error);
            break;
          }
        }
        persistRuns();
      }

      // نوبت‌دهی انتشار پیشنویس‌های جدید بر اساس بازهٔ سوپرادمین
      try {
        const { autoScheduleDrafts } = await import("@/lib/blog-scheduler");
        run.autoSchedule = await autoScheduleDrafts();
      } catch {
        /* اختیاری */
      }

      run.status = "finished";
      run.finishedAt = new Date();
      persistRuns();
      console.log(
        `[seo-worker] run ${runId} finished: done=${run.done} short=${run.short} failed=${run.failed}`
      );
    } catch (err) {
      run.status = "error";
      run.error = err instanceof Error ? err.message : String(err);
      run.finishedAt = new Date();
      persistRuns();
      console.error(`[seo-worker] run ${runId} error:`, run.error);
    }
  })();

  return runId;
}

// ============ HTTP ============

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/start") {
      const count = Math.max(
        1,
        Math.min(19, Number(url.searchParams.get("count")) || ARTICLES_PER_RUN)
      );
      try {
        const runId = await startGenerationRun(count);
        return Response.json({ success: true, runId, target: count });
      } catch (err) {
        return Response.json(
          { success: false, error: err instanceof Error ? err.message : String(err) },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/status" || url.pathname === "/") {
      return Response.json({
        success: true,
        worker: "seo-worker",
        port: PORT,
        runs: listRunsSorted(10).map((r) => ({
          ...r,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
        })),
      });
    }

    return Response.json({ success: false, error: "not found" }, { status: 404 });
  },
});

console.log(`[seo-worker] listening on :${PORT} (bun ${Bun.version})`);

// بوت — ازسرگیری نیمه‌کاره‌ها
loadPersistedRuns();
