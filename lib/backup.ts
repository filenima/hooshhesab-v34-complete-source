import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db";

// ============================================================
// هوش — lib/backup.ts — موتور بکاپ‌گیری پایگاه داده (Task 13-a)
// ------------------------------------------------------------
// بکاپ روزانه/دستی از SQLite (db/custom.db) در پوشه‌ی backups/ ریشه‌ی
// پروژه + manifest.json برای فهرست/retention (۳۰ نسخه‌ی آخر).
//
// SECURITY:
//  - نام فایل بکاپ با regex سخت‌گیرانه اعتبارسنجی می‌شود
//    (^hoosh-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}\.db$) — فقط
//    کاراکترهای [a-zA-Z0-9._-]؛ هر درخواست حذف/دانلود ابتدا باید در
//    manifest موجود باشد → path traversal غیرممکن است.
//  - پوشه‌ی backups خارج از public/ است و به‌صورت استاتیک سرو نمی‌شود؛
//    تنها مسیر دانلود، API سوپرادمین با احراز هویت است.
// ============================================================

/** فاصله‌ی بکاپ‌گیری خودکار (ساعت) */
export const AUTO_BACKUP_INTERVAL_HOURS = 24;

/** حداکثر تعداد بکاپ نگهداری‌شده (retention) */
export const MAX_BACKUPS = 30;

/** نام پوشه‌ی بکاپ نسبت به ریشه‌ی پروژه */
const BACKUP_DIR_NAME = "backups";
const MANIFEST_FILE = "manifest.json";

/** الگوی مجاز نام فایل بکاپ — ضد path traversal (فقط [a-zA-Z0-9._-]) */
// FIX(SA-8): الگوی نام‌گذاری الزامی بکاپ‌ها — مستندسازی صریح
// ──────────────────────────────────────────────────────────────
// فقط فایل‌هایی با این الگو در manifest/لیست/دانلود دیده می‌شوند:
//   hoosh-backup-YYYY-MM-DD-HHmmss.db
//   مثال: hoosh-backup-2026-09-17-162057.db
//
// اگر بکاپ دستی یا فایل migrate می‌سازید، حتماً با همین الگو و
// timestamp واقعی نام‌گذاری کنید (ts الگو: تاریخ محلی + ساعت/دقیقه/ثانیه):
//   sqlite3 db/custom.db ".backup 'backups/hoosh-backup-$(date +%F-%H%M%S).db'"
// سپس از پنل سوپرادمین «بکاپ جدید» بزنید تا manifest هم به‌روز شود،
// یا فایل را در manifest (backups/manifest.json) با فرمت موجود ثبت کنید.
// فایل‌های خارج از الگو عمداً نادیده گرفته می‌شوند (محافظت path-traversal).
const BACKUP_NAME_RE = /^hoosh-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}\.db$/;

export type BackupTrigger = "manual" | "auto";

export interface BackupManifestEntry {
  /** نام فایل — hoosh-backup-YYYY-MM-DD-HHmmss.db */
  name: string;
  /** حجم بایت */
  size: number;
  /** ISO زمان ایجاد */
  createdAt: string;
  /** عامل ایجاد: دستی یا خودکار */
  trigger: BackupTrigger;
  /** (اختیاری) شناسه‌ی سوپرادمینِ ایجادکننده */
  adminId?: string;
}

export interface BackupResult {
  ok: boolean;
  error?: string;
  /** بکاپ ایجادشده (در صورت موفقیت) */
  backup?: BackupManifestEntry;
  /** بکاپ‌های حذف‌شده توسط retention */
  pruned?: string[];
}

export interface BackupListResult {
  ok: boolean;
  error?: string;
  backups: BackupManifestEntry[];
}

// ─────────────────────────── helper های مسیر ───────────────────────────

/** مسیر مطلق پوشه‌ی بکاپ (project-root/backups) */
export function getBackupDir(): string {
  return path.join(process.cwd(), BACKUP_DIR_NAME);
}

/** مسیر مطلق فایل manifest.json */
function getManifestPath(): string {
  return path.join(getBackupDir(), MANIFEST_FILE);
}

/**
 * مسیر مطلق فایل پایگاه داده‌ی SQLite.
 * اول از DATABASE_URL (file:) حل می‌شود؛ fallback: <cwd>/db/custom.db
 */
function getDbPath(): string {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("file:")) {
    // جدا کردن query params (مثل ?socket_timeout=...)
    const p = url.slice("file:".length).split("?")[0];
    if (p) return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  }
  return path.join(process.cwd(), "db", "custom.db");
}

/** اعتبارسنجی سخت‌گیرانه‌ی نام فایل بکاپ (ضد path traversal) */
export function isValidBackupName(name: string): boolean {
  return typeof name === "string" && BACKUP_NAME_RE.test(name);
}

/** ساخت نام فایل بکاپ از یک تاریخ: hoosh-backup-YYYY-MM-DD-HHmmss.db */
function buildBackupName(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `hoosh-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.db`
  );
}

// ─────────────────────────── manifest ───────────────────────────

function isPlainEntry(v: unknown): v is BackupManifestEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.name === "string" &&
    isValidBackupName(e.name) &&
    typeof e.size === "number" &&
    typeof e.createdAt === "string" &&
    (e.trigger === "manual" || e.trigger === "auto")
  );
}

/** خواندن manifest — در صورت خرابی/نبود، آرایه‌ی خالی (خطا نمی‌دهد) */
async function readManifest(): Promise<BackupManifestEntry[]> {
  try {
    const raw = await fs.readFile(getManifestPath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPlainEntry);
  } catch {
    return [];
  }
}

/** نوشتن manifest (ایجاد پوشه در صورت نبود) */
async function writeManifest(entries: BackupManifestEntry[]): Promise<void> {
  await fs.mkdir(getBackupDir(), { recursive: true });
  await fs.writeFile(
    getManifestPath(),
    JSON.stringify([...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), null, 2),
    "utf-8"
  );
}

// ─────────────────────────── عملیات اصلی ───────────────────────────

/**
 * تهیه‌ی بکاپ از پایگاه داده‌ی SQLite.
 *
 * مراحل:
 *  1. WAL checkpoint (TRUNCATE) — صفحات WAL به فایل اصلی منتقل می‌شوند
 *     تا کپیِ db/custom.db کامل باشد (در صورت خطا ادامه می‌دهیم — بدون
 *     توقف عملیات).
 *  2. کپی فایل DB → backups/hoosh-backup-YYYY-MM-DD-HHmmss.db
 *  3. به‌روزرسانی manifest + اجرای retention (نگهداری ۳۰ نسخه‌ی آخر).
 */
export async function createBackup(
  trigger: BackupTrigger,
  adminId?: string
): Promise<BackupResult> {
  try {
    // ۱) فلش WAL به فایل اصلی — قبل از کپی
    try {
      await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch (pragmaErr) {
      // غیربحرانی — مثلاً حالت journal غیر WAL؛ کپی ادامه می‌یابد
      console.warn("[backup] wal_checkpoint failed (continuing):", pragmaErr);
    }

    const dbPath = getDbPath();
    const dbStat = await fs.stat(dbPath).catch(() => null);
    if (!dbStat || !dbStat.isFile()) {
      return { ok: false, error: "فایل پایگاه داده یافت نشد" };
    }

    await fs.mkdir(getBackupDir(), { recursive: true });

    // انتخاب نام یکتا (اگر در همان ثانیه بکاپ دیگری بود، یک ثانیه جلوتر)
    const manifest = await readManifest();
    let now = new Date();
    let name = buildBackupName(now);
    for (let i = 0; i < 10; i++) {
      const inManifest = manifest.some((e) => e.name === name);
      const onDisk = await fs
        .stat(path.join(getBackupDir(), name))
        .then(() => true)
        .catch(() => false);
      if (!inManifest && !onDisk) break;
      now = new Date(now.getTime() + 1000);
      name = buildBackupName(now);
    }

    const dest = path.join(getBackupDir(), name);
    await fs.copyFile(dbPath, dest);

    const stat = await fs.stat(dest);
    const entry: BackupManifestEntry = {
      name,
      size: stat.size,
      createdAt: now.toISOString(),
      trigger,
      ...(adminId ? { adminId } : {}),
    };

    // ۳) manifest + retention — فقط ۳۰ نسخه‌ی اخیر
    manifest.push(entry);
    manifest.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // نزولی
    const pruned: string[] = [];
    if (manifest.length > MAX_BACKUPS) {
      const removed = manifest.splice(MAX_BACKUPS);
      for (const r of removed) {
        if (!isValidBackupName(r.name)) continue;
        try {
          await fs.rm(path.join(getBackupDir(), r.name), { force: true });
          pruned.push(r.name);
        } catch (rmErr) {
          console.warn(`[backup] failed to prune ${r.name}:`, rmErr);
        }
      }
    }
    await writeManifest(manifest);

    return { ok: true, backup: entry, pruned };
  } catch (error) {
    console.error("[backup] createBackup failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "خطای ناشناخته در بکاپ‌گیری",
    };
  }
}

/**
 * فهرست بکاپ‌ها — manifest خوانده و با stat فایل‌ها تطبیق داده می‌شود
 * (ورودی‌های بدون فایل حذف می‌شوند؛ حجم از فایل واقعی برداشته می‌شود).
 * خروجی نزولی بر اساس createdAt.
 */
export async function listBackups(): Promise<BackupListResult> {
  try {
    const manifest = await readManifest();
    const verified: BackupManifestEntry[] = [];
    for (const entry of manifest) {
      if (!isValidBackupName(entry.name)) continue;
      try {
        const st = await fs.stat(path.join(getBackupDir(), entry.name));
        if (st.isFile()) verified.push({ ...entry, size: st.size });
      } catch {
        /* فایل وجود ندارد — از فهرست خارج می‌شود */
      }
    }
    verified.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { ok: true, backups: verified };
  } catch (error) {
    console.error("[backup] listBackups failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "خطا در خواندن فهرست بکاپ‌ها",
      backups: [],
    };
  }
}

/**
 * بکاپ‌گیری خودکارِ تنبل (lazy):
 * اگر در ۲۴ ساعت گذشته بکاپِ «خودکار» وجود نداشته باشد «و» امروز هیچ
 * بکاپی (دستی یا خودکار) تهیه نشده باشد، یک بکاپ خودکار می‌سازد.
 * ارزان است — فقط manifest را می‌خواند.
 */
export async function maybeRunAutoBackup(): Promise<{
  ran: boolean;
  reason?: string;
  backup?: BackupManifestEntry;
}> {
  try {
    const manifest = await readManifest();

    // آخرین بکاپ خودکار (ترتیبِ manifest تضمین نمی‌شود → max)
    const lastAutoMs = manifest
      .filter((e) => e.trigger === "auto")
      .reduce((max, e) => Math.max(max, Date.parse(e.createdAt) || 0), 0);

    const intervalMs = AUTO_BACKUP_INTERVAL_HOURS * 3_600_000;
    if (lastAutoMs > 0 && Date.now() - lastAutoMs < intervalMs) {
      return { ran: false, reason: "auto-backup-recent" };
    }

    // آیا «امروز» (روز تقویمی محلی) بکاپی تهیه شده؟
    const today = new Date();
    const isToday = (iso: string) => {
      const d = new Date(iso);
      return Number.isFinite(d.getTime())
        ? d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
        : false;
    };
    if (manifest.some((e) => isToday(e.createdAt))) {
      return { ran: false, reason: "backup-exists-today" };
    }

    const res = await createBackup("auto");
    if (!res.ok) return { ran: false, reason: res.error || "create-failed" };
    return { ran: true, backup: res.backup };
  } catch (error) {
    console.error("[backup] maybeRunAutoBackup failed:", error);
    return { ran: false, reason: "error" };
  }
}

/** حذف یک بکاپ (فایل + ورودی manifest) — با اعتبارسنجی سخت‌گیرانه‌ی نام */
export async function deleteBackup(name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isValidBackupName(name)) {
      return { ok: false, error: "نام فایل بکاپ نامعتبر است" };
    }
    const manifest = await readManifest();
    const entry = manifest.find((e) => e.name === name);
    if (!entry) {
      return { ok: false, error: "بکاپ در فهرست یافت نشد" };
    }
    try {
      await fs.rm(path.join(getBackupDir(), name), { force: true });
    } catch (rmErr) {
      console.warn(`[backup] failed to delete file ${name}:`, rmErr);
      return { ok: false, error: "خطا در حذف فایل بکاپ" };
    }
    await writeManifest(manifest.filter((e) => e.name !== name));
    return { ok: true };
  } catch (error) {
    console.error("[backup] deleteBackup failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "خطای ناشناخته در حذف بکاپ",
    };
  }
}

/**
 * مسیر فایل یک بکاپ برای دانلود — فقط اگر نام معتبر و در manifest
 * موجود باشد (و فایل روی دیسک وجود داشته باشد). در غیر این صورت null.
 */
export async function getBackupFilePath(name: string): Promise<string | null> {
  if (!isValidBackupName(name)) return null;
  const manifest = await readManifest();
  if (!manifest.some((e) => e.name === name)) return null;
  const filePath = path.join(getBackupDir(), name);
  try {
    const st = await fs.stat(filePath);
    return st.isFile() ? filePath : null;
  } catch {
    return null;
  }
}
