import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { verifyToken } from "@/lib/platform-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import {
 USER_PANEL_CONTENT_KEY,
 USER_CONTENT_FIELDS,
 parseUserContent,
 serializeUserContent,
 sanitizeUserContentValue,
 type UserContentMap,
} from "@/lib/user-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ متن‌های قابل‌ویرایش پنل کاربر (Task 3-d) ============
// GET  /api/platform/user-content — دو سطح دسترسی:
//   ۱) توکن سوپرادمین → { content: {کلید: {value, updatedAt}}, fields: فیلدهای سرپرستی‌شده }
//   ۲) توکن کاربر (پنل کاربر — فراخوانی بوت app-shell) → فقط { content }
//      تا متن‌های بازنویسی‌شده در همهٔ پنل‌های کاربر اعمال شود.
// PUT  /api/platform/user-content — فقط سوپرادمین:
//   { updates: { "کلید": "متن جدید" | null } } — مقدار null/خالی = حذف
//   override و بازگشت به پیش‌فرض کد. ذخیره در SystemSettings (کلید
//   user_panel_content) + PlatformAuditLog (USER_CONTENT_SAVED).

/** خواندن نقشهٔ ذخیره‌شده از SystemSettings */
async function loadContent(): Promise<UserContentMap> {
 const row = await db.systemSettings.findUnique({ where: { key: USER_PANEL_CONTENT_KEY } });
 return parseUserContent(row?.value);
}

async function persistContent(map: UserContentMap): Promise<UserContentMap> {
 const value = serializeUserContent(map);
 await db.systemSettings.upsert({
  where: { key: USER_PANEL_CONTENT_KEY },
  update: { value },
  create: { key: USER_PANEL_CONTENT_KEY, value },
 });
 return parseUserContent(value);
}

export async function GET(req: NextRequest) {
 try {
  // ۱) ابتدا سوپرادمین؟ (خروجی کامل با فیلدهای سرپرستی‌شده)
  const adminAuth = await requireSuperAdmin(req);
  if (!("error" in adminAuth)) {
   const rl = rateLimitCheck(
    `user-content-admin:${adminAuth.admin.id}:${getClientIp(req)}`,
    60,
    60_000
   );
   if (!rl.ok) {
    return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
   }
   const content = await loadContent();
   return NextResponse.json({
    success: true,
    data: { content, fields: USER_CONTENT_FIELDS },
   });
  }

  // ۲) توکن کاربر عادی؟ (فقط نقشهٔ override ها — برای بوت پنل کاربر)
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
   return NextResponse.json(
    { success: false, error: "احراز هویت الزامی است" },
    { status: 401 }
   );
  }
  const payload = verifyToken(authHeader.substring(7));
  if (!payload || payload.type !== "user") {
   return NextResponse.json(
    { success: false, error: "توکن نامعتبر" },
    { status: 401 }
   );
  }
  const user = await db.user.findUnique({
   where: { id: payload.id as string },
   select: { id: true, deletedAt: true, isActive: true },
  });
  if (!user || user.deletedAt || !user.isActive) {
   return NextResponse.json(
    { success: false, error: "کاربر یافت نشد" },
    { status: 401 }
   );
  }

  const rl = rateLimitCheck(
   `user-content-user:${user.id}:${getClientIp(req)}`,
   30,
   60_000
  );
  if (!rl.ok) {
   return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
  }

  const content = await loadContent();
  return NextResponse.json(
   { success: true, data: { content } },
   {
    headers: {
     // خصوصی per-user + کش کوتاه مرورگری (الگوی module-config)
     "Cache-Control": "private, max-age=30",
    },
   }
  );
 } catch (error) {
  console.error("User content GET error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در دریافت متن‌های پنل کاربر" },
   { status: 500 }
  );
 }
}

export async function PUT(req: NextRequest) {
 try {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  // ذخیره سنگین‌تر از خواندن — سقف ۲۰ در دقیقه
  const rl = rateLimitCheck(
   `user-content-put:${auth.admin.id}:${getClientIp(req)}`,
   20,
   60_000
  );
  if (!rl.ok) {
   return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const updates = body?.updates;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
   return NextResponse.json(
    { success: false, error: "بدنه درخواست نامعتبر — { updates: { کلید: مقدار | null } }" },
    { status: 400 }
   );
  }

  // اعتبارسنجی تک‌تک کلید/مقدارها
  const entries = Object.entries(updates as Record<string, unknown>);
  if (entries.length === 0) {
   return NextResponse.json(
    { success: false, error: "هیچ تغییری ارسال نشده است" },
    { status: 400 }
   );
  }
  if (entries.length > 60) {
   return NextResponse.json(
    { success: false, error: "حداکثر ۶۰ فیلد در هر ذخیره" },
    { status: 400 }
   );
  }

  const changed: { key: string; value: string | null }[] = [];
  const current = await loadContent();
  const next: UserContentMap = { ...current };
  const now = new Date().toISOString();

  for (const [key, raw] of entries) {
   if (!key || typeof key !== "string" || key.length > 120) {
    return NextResponse.json(
     { success: false, error: `کلید نامعتبر: ${key}` },
     { status: 400 }
    );
   }
   const value = sanitizeUserContentValue(raw);
   if (value === "invalid") {
    return NextResponse.json(
     { success: false, error: `مقدار «${key}» نامعتبر است (حداکثر ۳۰۰ کاراکتر)` },
     { status: 400 }
    );
   }
   if (value === null) {
    delete next[key]; // حذف override → بازگشت به پیش‌فرض کد
   } else {
    next[key] = { value, updatedAt: now };
   }
   changed.push({ key, value });
  }

  if (Object.keys(next).length > 200) {
   return NextResponse.json(
    { success: false, error: "سقف کل کلیدهای سفارشی (۲۰۰) پر شده است" },
    { status: 400 }
   );
  }

  await persistContent(next);

  // لاگ ممیزی — کلیدها و پاک‌شدن (نه مقادیر کامل، برای جلوگیری از size)
  try {
   await db.platformAuditLog.create({
    data: {
     superAdminId: auth.admin.id,
     action: "USER_CONTENT_SAVED",
     entity: "SystemSettings",
     entityId: USER_PANEL_CONTENT_KEY,
     details: JSON.stringify({
      count: changed.length,
      keys: changed.slice(0, 50).map((c) => ({ key: c.key, cleared: c.value === null })),
     }),
     ipAddress: req.headers.get("x-forwarded-for") || null,
    },
   });
  } catch {
   /* ignore */
  }

  const content = await loadContent();
  return NextResponse.json({
   success: true,
   data: { content, fields: USER_CONTENT_FIELDS },
   message: "متن‌های پنل کاربر ذخیره شد — در همهٔ پنل‌های کاربر اعمال می‌شود",
  });
 } catch (error) {
  console.error("User content PUT error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در ذخیره متن‌های پنل کاربر" },
   { status: 500 }
  );
 }
}
