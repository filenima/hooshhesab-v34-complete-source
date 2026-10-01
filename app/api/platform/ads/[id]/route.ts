import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ PATCH/DELETE /api/platform/ads/[id] — ویرایش/حذف تبلیغ (سوپرادمین) ============

// PATCH — ویرایش فیلدهای تبلیغ
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await ctx.params;
 const existing = await db.advertisement.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json({ success: false, error: "تبلیغ یافت نشد" }, { status: 404 });
 }

 const body = await req.json().catch(() => null);
 if (!body || typeof body!== "object") {
 return NextResponse.json({ success: false, error: "بدنه درخواست نامعتبر است" }, { status: 400 });
 }

 // همان sanitize مسیر /api/platform/ads (بدون import برای سادگی — منطق یکسان)
 const data: Record<string, unknown> = {};
 const b = body as Record<string, unknown>;
 const AD_TYPES = ["BANNER", "HTML", "TEXT"];
 const TARGET_TYPES = ["ALL", "SPECIFIC"];

 if (typeof b.title === "string") data.title = b.title.trim();
 if (b.type !== undefined && typeof b.type === "string" && AD_TYPES.includes(b.type)) data.type = b.type;
 if (b.imageUrl !== undefined) data.imageUrl = String(b.imageUrl || "").trim() || null;
 if (b.htmlCode !== undefined) {
 const html = String(b.htmlCode || "").trim();
 if (html.length > 20_000) {
 return NextResponse.json({ success: false, error: "کد HTML نباید بیش از ۲۰,۰۰۰ کاراکتر باشد" }, { status: 400 });
 }
 data.htmlCode = html || null;
 }
 if (b.text !== undefined) data.text = String(b.text || "").trim() || null;
 if (b.linkUrl !== undefined) {
 const link = String(b.linkUrl || "").trim();
 if (link && !/^(https?:\/\/|\/)/i.test(link)) {
 return NextResponse.json({ success: false, error: "لینک باید با http:// یا https:// شروع شود یا مسیر داخلی باشد" }, { status: 400 });
 }
 data.linkUrl = link || null;
 }
 if (b.ctaText !== undefined) data.ctaText = String(b.ctaText || "").trim() || null;
 if (b.ctaColor !== undefined) data.ctaColor = String(b.ctaColor || "").trim() || null;
 if (typeof b.active === "boolean") data.active = b.active;
 if (b.priority !== undefined) {
 const p = Number(b.priority);
 if (Number.isFinite(p)) data.priority = Math.max(-1000, Math.min(1000, Math.trunc(p)));
 }
 if (b.targetType !== undefined && typeof b.targetType === "string" && TARGET_TYPES.includes(b.targetType)) data.targetType = b.targetType;
 if (b.targetUserIds !== undefined) {
 let ids: string[] = [];
 if (typeof b.targetUserIds === "string") {
 try {
 ids = JSON.parse(b.targetUserIds);
 } catch {
 return NextResponse.json({ success: false, error: "فرمت targetUserIds معتبر نیست" }, { status: 400 });
 }
 } else if (Array.isArray(b.targetUserIds)) {
 ids = b.targetUserIds;
 }
 if (!Array.isArray(ids) || ids.some((i) => typeof i!== "string")) {
 return NextResponse.json({ success: false, error: "فرمت targetUserIds معتبر نیست" }, { status: 400 });
 }
 ids = ids.map((i) => i.trim()).filter(Boolean).slice(0, 200);
 data.targetUserIds = ids.length? JSON.stringify(ids): null;
 }
 if (b.placement !== undefined) data.placement = String(b.placement || "DASHBOARD_TOP").trim();
 if (b.height !== undefined) {
 const h = String(b.height || "").trim();
 if (h && !/^\d{2,4}$/.test(h)) {
 return NextResponse.json({ success: false, error: "ارتفاع باید عدد پیکسلی باشد" }, { status: 400 });
 }
 data.height = h || null;
 }
 if (b.startAt !== undefined) data.startAt = b.startAt? new Date(b.startAt as string): null;
 if (b.endAt !== undefined) data.endAt = b.endAt? new Date(b.endAt as string): null;

 const ad = await db.advertisement.update({
 where: { id },
 data: data as Parameters<typeof db.advertisement.update>[0]["data"],
 });

 return NextResponse.json({ success: true, data: ad, message: "تبلیغ به‌روزرسانی شد" });
 } catch (error) {
 console.error("[platform/ads PATCH]", error);
 const msg = error instanceof Error? error.message: "خطا در به‌روزرسانی تبلیغ";
 return NextResponse.json({ success: false, error: msg }, { status: 400 });
 }
}

// DELETE — حذف تبلیغ
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { id } = await ctx.params;
 const existing = await db.advertisement.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json({ success: false, error: "تبلیغ یافت نشد" }, { status: 404 });
 }

 await db.advertisement.delete({ where: { id } });

 return NextResponse.json({ success: true, message: "تبلیغ حذف شد" });
 } catch (error) {
 console.error("[platform/ads DELETE]", error);
 return NextResponse.json({ success: false, error: "خطا در حذف تبلیغ" }, { status: 500 });
 }
}
