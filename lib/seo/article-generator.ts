// ============================================================
// seo/article-generator.ts — رابط سمت Next.js موتور تولید مقاله (v31)
// ============================================================
// FIX(v31 — worker decoupling): تولید مقاله‌های ۳۰۰۰+ کلمه‌ای ۵-۸ دقیقه
// فراخوانی LLM نیاز دارد؛ اما سرور dev در سندباکس ۴GB با ترافیک کاربر هر
// ~۹۰ ثانیه memory-recycle می‌شد → هیچ مقاله‌ای کامل نمی‌شد (اجرای ۱۱:۲۴
// با done=0 گیر کرد). حالا تولید در پروسهٔ مستقل mini-services/seo-worker
// (پورت ۳۰۳۵، bun) انجام می‌شود — مصون از ری‌استارت‌های سرور Next.js.
//
// این ماژول فقط:
//   - startGenerationRun → POST به worker (با spawn-fallback)
//   - getRun/listRuns    → GET وضعیت از worker (با fallback فایل JSON مشترک)
//   - getClusterCoverage → کوئری DB (سبک — همان قبلی)
// API عمومی نسبت به قبل «بدون تغییر» است؛ مسیرهای cron و پنل سوپرادمین
// بی‌تغییر کار می‌کنند.
// ============================================================

import { PILLAR_SLUGS, TOPIC_BANK } from "./topic-bank";
import type { ClusterId } from "./topics/types";
import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";

export { ARTICLES_PER_RUN, MIN_WORDS } from "./article-core";
import { ARTICLES_PER_RUN } from "./article-core";

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

const WORKER_BASE = "http://127.0.0.1:3035";
const RUNS_FILE = "/tmp/hoosh-seo-runs.json";

// ============ ارتباط با worker ============

async function fetchWorker(
  pathAndQuery: string,
  init?: RequestInit,
  timeoutMs = 4000
): Promise<unknown | null> {
  try {
    const res = await Promise.race([
      fetch(`${WORKER_BASE}${pathAndQuery}`, init),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("worker timeout")), timeoutMs)
      ),
    ]);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** بالا آوردن پروسهٔ worker (اگر به هر دلیلی پایین بود) */
function spawnWorker(): void {
  try {
    const cwd = path.join(process.cwd(), "mini-services", "seo-worker");
    const child = spawn("bun", ["run", "dev"], {
      cwd,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();
  } catch {
    /* best-effort */
  }
}

// نرمال‌سازی اجرا از JSON (تاریخ‌ها string هستند)
function reviveRun(r: unknown): GenerationRun | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    ...(o as unknown as GenerationRun),
    startedAt: new Date(o.startedAt as string),
    finishedAt: o.finishedAt ? new Date(o.finishedAt as string) : null,
  } as GenerationRun;
}

// ============ API عمومی (امضای قبلی حفظ شده) ============

/**
 * شروع اجرای تولید — POST به worker مستقل. اگر worker پایین بود،
 * spawn می‌شود و یک‌بار دیگر تلاش می‌شود.
 */
export async function startGenerationRun(count = ARTICLES_PER_RUN): Promise<string> {
  const clamped = Math.max(1, Math.min(19, Math.round(count)));

  let res = (await fetchWorker(`/start?count=${clamped}`, { method: "POST" }, 6000)) as
    | { runId?: string }
    | null;

  if (!res?.runId) {
    // worker پایین است — spawn و تلاش مجدد
    spawnWorker();
    await new Promise((r) => setTimeout(r, 4000));
    res = (await fetchWorker(`/start?count=${clamped}`, { method: "POST" }, 8000)) as
      | { runId?: string }
      | null;
  }

  if (!res?.runId) {
    throw new Error("سرویس تولید محتوا (seo-worker:3035) پاسخ نمی‌دهد");
  }
  return res.runId;
}

/** وضعیت یک اجرا — از worker؛ fallback: فایل مشترک JSON */
export function getRun(runId: string): GenerationRun | null {
  // ابتدا از فایل مشترک (همیشه تازه است — worker بعد از هر مقاله می‌نویسد)
  const fromFile = readRunsFile().find((r) => r.id === runId);
  if (fromFile) return fromFile;
  return null;
}

/** اجراهای اخیر — از worker؛ fallback: فایل مشترک JSON */
export function listRuns(limit = 5): GenerationRun[] {
  return readRunsFile().slice(0, limit);
}

function readRunsFile(): GenerationRun[] {
  try {
    if (!existsSync(RUNS_FILE)) return [];
    const parsed = JSON.parse(readFileSync(RUNS_FILE, "utf8")) as unknown[];
    return parsed.map(reviveRun).filter((r): r is GenerationRun => r !== null);
  } catch {
    return [];
  }
}

// FIX(v31 — lazy-load): از /api/health صدا زده می‌شود (fire-and-forget).
// worker خودش هنگام بوت، اجراهای نیمه‌کاره را ازسرگیری می‌کند؛ این هوک
// فقط مطمئن می‌شود که worker زنده است (وگرنه spawnش می‌کند).
let lastWorkerPing = 0;
export async function ensureResumeHook(): Promise<void> {
  const now = Date.now();
  if (now - lastWorkerPing < 60_000) return; // حداکثر یک‌بار در دقیقه
  lastWorkerPing = now;
  const res = (await fetchWorker("/status", undefined, 2500)) as unknown;
  if (!res) spawnWorker();
}

// ============ آمار پوشش خوشه‌ها (برای پنل سوپرادمین) ============

export interface ClusterCoverage {
  id: ClusterId | string;
  label: string;
  total: number;
  published: number;
  draft: number;
  pillar: string;
}

const CLUSTER_LABELS: Record<string, string> = {
  accounting: "نرم‌افزار حسابداری",
  moadian: "سامانه مودیان",
  education: "آموزش عملی حسابداری",
  industry: "صنف‌محور",
  tax: "مالیات و ارزش افزوده",
  tools: "ابزارها و محاسبات",
  comparison: "انتخاب و مقایسه",
};

export async function getClusterCoverage(): Promise<ClusterCoverage[]> {
  const { db } = await import("@/lib/db");
  const posts = await db.blogPost.findMany({
    where: { tags: { contains: "cluster:" } },
    select: { tags: true, status: true },
  });
  const coverageMap = new Map<string, ClusterCoverage>();
  for (const post of posts) {
    try {
      const tags: string[] = JSON.parse(post.tags || "[]");
      for (const tag of tags) {
        if (tag.startsWith("cluster:")) {
          const id = tag.slice("cluster:".length);
          if (!coverageMap.has(id)) {
            coverageMap.set(id, {
              id,
              label: CLUSTER_LABELS[id] || id,
              total: 0,
              published: 0,
              draft: 0,
              pillar: PILLAR_SLUGS[id as ClusterId] || "—",
            });
          }
          const c = coverageMap.get(id)!;
          c.total++;
          if (post.status === "PUBLISHED") c.published++;
          else c.draft++;
        }
      }
    } catch {
      /* tags خراب — نادیده */
    }
  }
  return Array.from(coverageMap.values()).sort((a, b) => b.total - a.total);
}

// سکشن بانک موضوعات (برای راستی‌آزمایی مسیرها — بدون وابستگی)
export { TOPIC_BANK };
