import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ رجیستری نسخه‌ها + اطلاع‌رسانی (Task 3-d) ============
// GET    /api/platform/versions — فهرست نسخه‌ها (جدیدترین اول)
//        ?recipientCount=1&audience=all|trial|paid → شمار گیرندگان اطلاع‌رسانی
// POST   /api/platform/versions — دو حالت:
//   ۱) { version, title, releasedAt?, items? } → ایجاد نسخهٔ جدید
//      items: [{ title, description?, type: feature|fix|improvement }]
//   ۲) { action: "notify", id, audience: all|trial|paid }
//      → ارسال اطلاع‌رسانی نسخه: پیام درون‌برنامه‌ای (InAppMessage — بنر
//        پنل کاربر) + اعلان (Notification) برای هر کاربر فعالِ مخاطب؛
//        سپس نسخه notified=true می‌شود.
// PUT    /api/platform/versions — ویرایش { id, version?, title?, releasedAt?, items?, notified? }
// DELETE /api/platform/versions?id=... — حذف نسخه
//
// همهٔ تغییرات با PlatformAuditLog (VERSION_*). بدون FK — مدل AppVersion.

// ============ تایپ‌ها و ثابت‌ها ============

interface VersionItem {
 title: string;
 description?: string;
 type: "feature" | "fix" | "improvement";
}

interface VersionDTO {
 id: string;
 version: string;
 title: string;
 releasedAt: string;
 items: VersionItem[];
 notified: boolean;
 createdAt: string;
 updatedAt: string;
}

const ITEM_TYPES = ["feature", "fix", "improvement"] as const;
const TYPE_LABELS: Record<string, string> = {
 feature: "ویژگی جدید",
 fix: "رفع باگ",
 improvement: "بهبود",
};
const AUDIENCES = ["all", "trial", "paid"] as const;
type Audience = (typeof AUDIENCES)[number];
const AUDIENCE_LABELS: Record<Audience, string> = {
 all: "همهٔ کاربران فعال",
 trial: "کاربران تریالی/رایگان",
 paid: "کاربران پرداخت‌کننده",
};

const MAX_ITEMS = 50;
const MAX_BODY_CHARS = 4000;

// ============ کمکی‌ها ============

function parseItems(raw: string | null | undefined): VersionItem[] {
 if (!raw) return [];
 try {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const out: VersionItem[] = [];
  for (const p of parsed.slice(0, MAX_ITEMS)) {
   if (!p || typeof p !== "object") continue;
   const r = p as Record<string, unknown>;
   const title = typeof r.title === "string" ? r.title.trim().slice(0, 120) : "";
   if (!title) continue;
   const typeRaw = typeof r.type === "string" ? r.type : "feature";
   const type = (ITEM_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as VersionItem["type"])
    : "feature";
   const description =
    typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 500) : undefined;
   out.push(description ? { title, description, type } : { title, type });
  }
  return out;
 } catch {
  return [];
 }
}

function sanitizeItems(input: unknown): VersionItem[] | "invalid" {
 if (input === undefined || input === null) return [];
 if (!Array.isArray(input)) return "invalid";
 if (input.length > MAX_ITEMS) return "invalid";
 const out: VersionItem[] = [];
 for (const p of input) {
  if (!p || typeof p !== "object") return "invalid";
  const r = p as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 120) : "";
  if (!title) return "invalid";
  const typeRaw = typeof r.type === "string" ? r.type : "feature";
  if (!(ITEM_TYPES as readonly string[]).includes(typeRaw)) return "invalid";
  const description =
   typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 500) : undefined;
  out.push(description ? { title, description, type: typeRaw as VersionItem["type"] } : { title, type: typeRaw as VersionItem["type"] });
 }
 return out;
}

function toDTO(v: {
 id: string;
 version: string;
 title: string;
 releasedAt: Date;
 itemsJson: string;
 notified: boolean;
 createdAt: Date;
 updatedAt: Date;
}): VersionDTO {
 return {
  id: v.id,
  version: v.version,
  title: v.title,
  releasedAt: v.releasedAt.toISOString(),
  items: parseItems(v.itemsJson),
  notified: v.notified,
  createdAt: v.createdAt.toISOString(),
  updatedAt: v.updatedAt.toISOString(),
 };
}

function isValidVersionString(v: string): boolean {
 return /^\d{1,3}(\.\d{1,3}){0,3}$/.test(v);
}

/** ساخت متن اطلاع‌رسانی نسخه از اقلام (برچسب نوع فارسی + بولت) */
function buildNotifyBody(version: string, title: string, items: VersionItem[]): string {
 const lines: string[] = [title || `نسخهٔ ${version}`];
 if (items.length > 0) {
  lines.push("");
  for (const item of items.slice(0, 30)) {
   const label = TYPE_LABELS[item.type] ?? "ویژگی جدید";
   const desc = item.description ? ` — ${item.description}` : "";
   lines.push(`• [${label}] ${item.title}${desc}`);
  }
 }
 lines.push("");
 lines.push("برای مشاهدهٔ جزئیات، پنل هوش را ببینید.");
 let body = lines.join("\n");
 if (body.length > MAX_BODY_CHARS) body = body.slice(0, MAX_BODY_CHARS - 3) + "…";
 return body;
}

/**
 * گیرندگان اطلاع‌رسانی — کاربران فعال و حذف‌نشده.
 * segmentation مطابق /api/marketing/in-app-messages:
 * trial = پلن starter یا tenant تریالی؛ paid = status active و غیر تریالی.
 */
async function getRecipients(audience: Audience) {
 const users = await db.user.findMany({
  where: { deletedAt: null, isActive: true },
  select: {
   id: true,
   tenantId: true,
   tenant: { select: { plan: true, status: true } },
  },
  take: 5000,
 });

 const matched = users.filter((u) => {
  if (audience === "all") return true;
  const plan = u.tenant?.plan;
  const status = u.tenant?.status;
  const isTrialSegment = plan === "starter" || status === "trial";
  if (audience === "trial") return isTrialSegment;
  // paid: tenant فعال و مشمول بخش پرداختی (طبق منطق in-app-messages)
  return status === "active" && !isTrialSegment;
 });

 return {
  total: users.length,
  matched: matched.length,
  recipients: matched.map((u) => ({ userId: u.id, tenantId: u.tenantId })),
 };
}

async function audit(
 adminId: string,
 action: string,
 entityId: string | null,
 details: Record<string, unknown>,
 req?: NextRequest
) {
 try {
  await db.platformAuditLog.create({
   data: {
    superAdminId: adminId,
    action,
    entity: "AppVersion",
    entityId,
    details: JSON.stringify(details),
    ipAddress: req?.headers?.get("x-forwarded-for") || null,
   },
  });
 } catch {
  /* ignore */
 }
}

// ============ GET — فهرست نسخه‌ها (+ شمار گیرندگان اختیاری) ============

export async function GET(req: NextRequest) {
 try {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const rl = rateLimitCheck(
   `versions-get:${auth.admin.id}:${getClientIp(req)}`,
   60,
   60_000
  );
  if (!rl.ok) {
   return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const versions = await db.appVersion.findMany({
   orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
   take: 200,
  });

  const data: {
   versions: VersionDTO[];
   recipientCount?: number;
   recipientTotal?: number;
   audienceLabels?: Record<string, string>;
  } = { versions: versions.map(toDTO) };

  // شمار گیرندگان برای دیالوگ تأیید ارسال
  if (searchParams.get("recipientCount") === "1") {
   const audienceParam = searchParams.get("audience") || "all";
   const audience = (AUDIENCES as readonly string[]).includes(audienceParam)
    ? (audienceParam as Audience)
    : "all";
   const { total, matched } = await getRecipients(audience);
   data.recipientCount = matched;
   data.recipientTotal = total;
   data.audienceLabels = AUDIENCE_LABELS;
  }

  return NextResponse.json({ success: true, data });
 } catch (error) {
  console.error("Versions GET error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در دریافت نسخه‌ها" },
   { status: 500 }
  );
 }
}

// ============ POST — ایجاد نسخه یا ارسال اطلاع‌رسانی ============

export async function POST(req: NextRequest) {
 try {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const rl = rateLimitCheck(
   `versions-post:${auth.admin.id}:${getClientIp(req)}`,
   20,
   60_000
  );
  if (!rl.ok) {
   return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));

  // ---------- حالت ۲: ارسال اطلاع‌رسانی نسخه ----------
  if (body?.action === "notify") {
   const id = String(body.id || "").trim();
   if (!id) {
    return NextResponse.json(
     { success: false, error: "شناسهٔ نسخه الزامی است" },
     { status: 400 }
    );
   }
   const audienceParam = String(body.audience || "all");
   if (!(AUDIENCES as readonly string[]).includes(audienceParam)) {
    return NextResponse.json(
     { success: false, error: "audience نامعتبر است (all | trial | paid)" },
     { status: 400 }
    );
   }
   const audience = audienceParam as Audience;

   const version = await db.appVersion.findUnique({ where: { id } });
   if (!version) {
    return NextResponse.json(
     { success: false, error: "نسخه یافت نشد" },
     { status: 404 }
    );
   }

   const items = parseItems(version.itemsJson);
   const title = `نسخهٔ ${version.version} منتشر شد`;
   const messageBody = buildNotifyBody(version.version, version.title, items);

   // ۱) پیام درون‌برنامه‌ای (بنر پنل کاربر) — الگوی /api/marketing/in-app-messages
   const inAppMessage = await db.inAppMessage.create({
    data: {
     title,
     body: messageBody,
     type: "FEATURE",
     targetRole: "all",
     targetSegment: audience === "all" ? null : audience,
     dismissible: true,
     isActive: true,
    },
   });

   // ۲) اعلان per-user (چیزی که کاربر در زنگ اعلان‌ها می‌بیند)
   const { total, matched, recipients } = await getRecipients(audience);
   let notificationsCreated = 0;
   if (recipients.length > 0) {
    const rows = recipients.map((r) => ({
     tenantId: r.tenantId,
     userId: r.userId,
     title,
     message: messageBody.slice(0, 2000),
     type: "INFO",
    }));
    // دسته‌های ۲۰۰تایی — createMany روی SQLite پشتیبانی می‌شود
    for (let i = 0; i < rows.length; i += 200) {
     const chunk = rows.slice(i, i + 200);
     const res = await db.notification.createMany({ data: chunk });
     notificationsCreated += res.count;
    }
   }

   // ۳) علامت‌گذاری نسخه به‌عنوان اطلاع‌رسانی‌شده
   await db.appVersion.update({ where: { id }, data: { notified: true } });

   await audit(auth.admin.id, "VERSION_NOTIFIED", id, {
    version: version.version,
    audience,
    recipientCount: matched,
    totalUsers: total,
    inAppMessageId: inAppMessage.id,
    notificationsCreated,
   }, req);

   return NextResponse.json({
    success: true,
    data: {
     versionId: id,
     version: version.version,
     notified: true,
     audience,
     audienceLabel: AUDIENCE_LABELS[audience],
     recipientCount: matched,
     totalUsers: total,
     inAppMessageId: inAppMessage.id,
     notificationsCreated,
    },
    message: `اطلاع‌رسانی نسخهٔ ${version.version} برای ${matched} کاربر ارسال شد`,
   });
  }

  // ---------- حالت ۱: ایجاد نسخهٔ جدید ----------
  const version = String(body?.version || "").trim();
  const title = String(body?.title || "").trim();
  if (!version || !isValidVersionString(version)) {
   return NextResponse.json(
    { success: false, error: "شمارهٔ نسخه نامعتبر است — مثل 12.9.0" },
    { status: 400 }
    );
  }
  if (!title || title.length > 120) {
   return NextResponse.json(
    { success: false, error: "عنوان نسخه الزامی است (حداکثر ۱۲۰ کاراکتر)" },
    { status: 400 }
   );
  }

  const items = sanitizeItems(body?.items);
  if (items === "invalid") {
   return NextResponse.json(
    { success: false, error: "اقلام نامعتبر — هر قلم { title, description?, type } با type در feature|fix|improvement" },
    { status: 400 }
   );
  }

  let releasedAt = new Date();
  if (body?.releasedAt) {
   const d = new Date(body.releasedAt);
   if (isNaN(d.getTime())) {
    return NextResponse.json(
     { success: false, error: "تاریخ انتشار نامعتبر است" },
     { status: 400 }
    );
   }
   releasedAt = d;
  }

  const existing = await db.appVersion.findUnique({ where: { version } });
  if (existing) {
   return NextResponse.json(
    { success: false, error: `نسخهٔ ${version} قبلاً ثبت شده است` },
    { status: 409 }
   );
  }

  const created = await db.appVersion.create({
   data: {
    version,
    title,
    releasedAt,
    itemsJson: JSON.stringify(items),
   },
  });

  await audit(auth.admin.id, "VERSION_CREATED", created.id, {
   version,
   title,
   itemCount: items.length,
  }, req);

  return NextResponse.json({
   success: true,
   data: toDTO(created),
   message: `نسخهٔ ${version} ثبت شد`,
  });
 } catch (error) {
  console.error("Versions POST error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در ثبت نسخه" },
   { status: 500 }
  );
 }
}

// ============ PUT — ویرایش نسخه ============

export async function PUT(req: NextRequest) {
 try {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const rl = rateLimitCheck(
   `versions-put:${auth.admin.id}:${getClientIp(req)}`,
   20,
   60_000
  );
  if (!rl.ok) {
   return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) {
   return NextResponse.json(
    { success: false, error: "شناسهٔ نسخه الزامی است" },
    { status: 400 }
   );
  }

  const existing = await db.appVersion.findUnique({ where: { id } });
  if (!existing) {
   return NextResponse.json(
    { success: false, error: "نسخه یافت نشد" },
    { status: 404 }
   );
  }

  const data: Record<string, unknown> = {};
  const changed: Record<string, unknown> = {};

  if (body?.version !== undefined) {
   const version = String(body.version || "").trim();
   if (!isValidVersionString(version)) {
    return NextResponse.json(
     { success: false, error: "شمارهٔ نسخه نامعتبر است — مثل 12.9.0" },
     { status: 400 }
    );
   }
   if (version !== existing.version) {
    const dup = await db.appVersion.findUnique({ where: { version } });
    if (dup && dup.id !== id) {
     return NextResponse.json(
      { success: false, error: `نسخهٔ ${version} قبلاً ثبت شده است` },
      { status: 409 }
     );
    }
    data.version = version;
    changed.version = version;
   }
  }

  if (body?.title !== undefined) {
   const title = String(body.title || "").trim();
   if (!title || title.length > 120) {
    return NextResponse.json(
     { success: false, error: "عنوان نسخه الزامی است (حداکثر ۱۲۰ کاراکتر)" },
     { status: 400 }
    );
   }
   data.title = title;
   changed.title = title;
  }

  if (body?.releasedAt !== undefined) {
   const d = new Date(body.releasedAt);
   if (isNaN(d.getTime())) {
    return NextResponse.json(
     { success: false, error: "تاریخ انتشار نامعتبر است" },
     { status: 400 }
    );
   }
   data.releasedAt = d;
   changed.releasedAt = body.releasedAt;
  }

  if (body?.items !== undefined) {
   const items = sanitizeItems(body.items);
   if (items === "invalid") {
    return NextResponse.json(
     { success: false, error: "اقلام نامعتبر — هر قلم { title, description?, type } با type در feature|fix|improvement" },
     { status: 400 }
    );
   }
   data.itemsJson = JSON.stringify(items);
   changed.itemCount = items.length;
  }

  if (body?.notified !== undefined) {
   if (typeof body.notified !== "boolean") {
    return NextResponse.json(
     { success: false, error: "notified باید true/false باشد" },
     { status: 400 }
    );
   }
   data.notified = body.notified;
   changed.notified = body.notified;
  }

  if (Object.keys(data).length === 0) {
   return NextResponse.json(
    { success: false, error: "هیچ فیلدی برای ویرایش ارسال نشده است" },
    { status: 400 }
   );
  }

  const updated = await db.appVersion.update({ where: { id }, data });

  await audit(auth.admin.id, "VERSION_UPDATED", id, changed, req);

  return NextResponse.json({
   success: true,
   data: toDTO(updated),
   message: "نسخه به‌روزرسانی شد",
  });
 } catch (error) {
  console.error("Versions PUT error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در ویرایش نسخه" },
   { status: 500 }
  );
 }
}

// ============ DELETE — حذف نسخه ============

export async function DELETE(req: NextRequest) {
 try {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const rl = rateLimitCheck(
   `versions-delete:${auth.admin.id}:${getClientIp(req)}`,
   20,
   60_000
  );
  if (!rl.ok) {
   return NextResponse.json({ success: false, error: "درخواست بیش از حد" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") || "").trim();
  if (!id) {
   return NextResponse.json(
    { success: false, error: "شناسهٔ نسخه الزامی است" },
    { status: 400 }
   );
  }

  const existing = await db.appVersion.findUnique({ where: { id } });
  if (!existing) {
   return NextResponse.json(
    { success: false, error: "نسخه یافت نشد" },
    { status: 404 }
   );
  }

  await db.appVersion.delete({ where: { id } });

  await audit(auth.admin.id, "VERSION_DELETED", id, {
   version: existing.version,
   title: existing.title,
  }, req);

  return NextResponse.json({
   success: true,
   message: `نسخهٔ ${existing.version} حذف شد`,
  });
 } catch (error) {
  console.error("Versions DELETE error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در حذف نسخه" },
   { status: 500 }
  );
 }
}
