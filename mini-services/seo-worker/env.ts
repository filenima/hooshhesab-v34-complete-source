// env.ts — بارگذاری .env ریشهٔ پروژه قبل از هر ماژول دیگری
// WHY: PrismaClient (از طریق @/lib/db) به DATABASE_URL نیاز دارد؛
// این فایل باید «اولین» import باشد تا متغیرها قبل از ساخت کلاینت ست شوند.
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

function findRootEnv(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

try {
  const envPath = findRootEnv(import.meta.dir);
  if (envPath) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      // حذف کوتیشن‌ها
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log(`[seo-worker] env loaded from ${envPath}`);
  } else {
    console.warn("[seo-worker] root .env not found — relying on existing env");
  }
} catch (err) {
  console.warn("[seo-worker] env load failed:", err);
}

export {};
