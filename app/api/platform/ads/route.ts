import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت تبلیغات (سوپرادمین) ============
// GET /api/platform/ads — لیست همه تبلیغات با آمار
// POST /api/platform/ads — ایجاد تبلیغ جدید

const AD_TYPES = ["BANNER", "HTML", "TEXT"] as const;
const TARGET_TYPES = ["ALL", "SPECIFIC"] as const;
const MAX_HTML_LENGTH = 20_000;

// اعتبارسنجی و پاک‌سازی فیلدهای مشترک
function sanitizeBody(body: Record<string, unknown>) {
 const data: Record<string, unknown> = {};

 if (typeof body.title === "string") data.title = body.title.trim();
 if (body.type !== undefined && typeof body.type === "string" && (AD_TYPES as readonly string[]).includes(body.type)) {
 data.type = body.type;
 }
 if (body.imageUrl !== undefined) data.imageUrl = String(body.imageUrl || "").trim() || null;
 if (body.htmlCode !== undefined) data.htmlCode = String(body.htmlCode || "").trim() || null;
 if (body.text !== undefined) data.text = String(body.text || "").trim() || null;
 if (body.linkUrl !== undefined) {
 const link = String(body.linkUrl || "").trim();
 if (link && !/^(https?:\/\/|\/)/i.test(link)) {
 throw new Error("لینک باید با http:// یا https:// شروع شود یا مسیر داخلی باشد");
 }
 data.linkUrl = link || null;
 }
 if (body.ctaText !== undefined) data.ctaText = String(body.ctaText || "").trim() || null;
 if (body.ctaColor !== undefined) data.ctaColor = String(body.ctaColor || "").trim() || null;
 if (typeof body.active === "boolean") data.active = body.active;
 if (body.priority !== undefined) {
 const p = Number(body.priority);
 if (Number.isFinite(p)) data.priority = Math.max(-1000, Math.min(1000, Math.trunc(p)));
 }
 if (body.targetType !== undefined && typeof body.targetType === "string" && (TARGET_TYPES as readonly string[]).includes(body.targetType)) {
 data.targetType = body.targetType;
 }
 if (body.targetUserIds !== undefined) {
 let ids: string[] = [];
 if (typeof body.targetUserIds === "string") {
 try {
 ids = JSON.parse(body.targetUserIds);
 } catch {
 throw new Error("فرمت targetUserIds معتبر نیست (باید JSON آرایه باشد)");
 }
 } else if (Array.isArray(body.targetUserIds)) {
 ids = body.targetUserIds;
 }
 if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string" || i.length > 100)) {
 throw new Error("فرمت targetUserIds معتبر نیست");
 }
 ids = ids.map((i) => i.trim()).filter(Boolean).slice(0, 200);
 data.targetUserIds = ids.length? JSON.stringify(ids): null;
 }
 if (body.placement !== undefined) data.placement = String(body.placement || "DASHBOARD_TOP").trim();
 if (body.height !== undefined) {
 const h = String(body.height || "").trim();
 if (h && !/^\d{2,4}$/.test(h)) throw new Error("ارتفاع باید عدد پیکسلی باشد");
 data.height = h || null;
 }
 if (body.startAt !== undefined) data.startAt = body.startAt? new Date(body.startAt as string): null;
 if (body.endAt !== undefined) data.endAt = body.endAt? new Date(body.endAt as string): null;

 if (data.htmlCode && String(data.htmlCode).length > MAX_HTML_LENGTH) {
 throw new Error("کد HTML نباید بیش از ۲۰,۰۰۰ کاراکتر باشد");
 }

 return data;
}

// ============ GET — لیست تبلیغات ============
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const includeStats = searchParams.get("includeStats") === "true";

 const items = await db.advertisement.findMany({
 orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
 });

 let totals: { total: number; active: number; views: number; clicks: number } | null = null;
 if (includeStats) {
 const agg = await db.advertisement.aggregate({
 _sum: { views: true, clicks: true },
 _count: { _all: true },
 });
 const activeCount = items.filter((a) => a.active).length;
 totals = {
 total: agg._count._all,
 active: activeCount,
 views: agg._sum.views || 0,
 clicks: agg._sum.clicks || 0,
 };
 }

 return NextResponse.json({ success: true, data: items, stats: totals });
 } catch (error) {
 console.error("[platform/ads GET]", error);
 return NextResponse.json({ success: false, error: "خطا در دریافت تبلیغات" }, { status: 500 });
 }
}

// ============ POST — ایجاد تبلیغ ============
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => null);
 if (!body || typeof body!== "object") {
 return NextResponse.json({ success: false, error: "بدنه درخواست نامعتبر است" }, { status: 400 });
 }

 const data = sanitizeBody(body as Record<string, unknown>);

 // اعتبارسنجی الزامات
 if (!data.title || String(data.title).trim().length < 2) {
 return NextResponse.json({ success: false, error: "عنوان تبلیغ الزامی است (حداقل ۲ کاراکتر)" }, { status: 400 });
 }
 const type = String(data.type || "BANNER");
 if (type === "BANNER" &&!data.imageUrl) {
 return NextResponse.json({ success: false, error: "برای بنر تصویری، آپلود تصویر الزامی است" }, { status: 400 });
 }
 if (type === "HTML" &&!data.htmlCode) {
 return NextResponse.json({ success: false, error: "برای تبلیغ کد HTML، کد الزامی است" }, { status: 400 });
 }
 if (type === "TEXT" &&!data.text) {
 return NextResponse.json({ success: false, error: "برای تبلیغ متنی، متن الزامی است" }, { status: 400 });
 }

 const ad = await db.advertisement.create({
 data: data as Parameters<typeof db.advertisement.create>[0]["data"],
 });

 return NextResponse.json({ success: true, data: ad, message: "تبلیغ با موفقیت ایجاد شد" }, { status: 201 });
 } catch (error) {
 console.error("[platform/ads POST]", error);
 const msg = error instanceof Error? error.message: "خطا در ایجاد تبلیغ";
 return NextResponse.json({ success: false, error: msg }, { status: 400 });
 }
}
