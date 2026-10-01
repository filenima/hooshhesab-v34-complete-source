import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 listFeatureFlags,
 setFeatureFlag,
 deleteFeatureFlag,
 seedDefaultFeatureFlags,
} from "@/lib/feature-flags";

export const runtime = "nodejs";

// GET /api/platform/feature-flags
// دریافت لیست همه فلگ‌ها (با seed خودکار اولین بار)
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const shouldSeed = searchParams.get("seed") === "1";

 if (shouldSeed) {
 await seedDefaultFeatureFlags();
 }

 const flags = await listFeatureFlags();

 return NextResponse.json({
 success: true,
 data: flags,
 count: flags.length,
 });
 } catch (error) {
 console.error("Feature flags list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت فلگ‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/platform/feature-flags
// ایجاد یا به‌روزرسانی فلگ
// Body: { name, enabled, rolloutPercentage?, conditions?, description? }
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const {
 name,
 enabled,
 rolloutPercentage,
 conditions,
 description,
 } = body as {
 name?: string;
 enabled?: boolean;
 rolloutPercentage?: number;
 conditions?: { plan?: string[]; roles?: string[]; tenantIds?: string[] };
 description?: string;
 };

 // Validation
 if (!name || typeof name!== "string" || name.length < 2) {
 return NextResponse.json(
 { success: false, error: "نام فلگ معتبر نیست (حداقل ۲ کاراکتر)" },
 { status: 400 }
 );
 }

 if (typeof enabled!== "boolean") {
 return NextResponse.json(
 { success: false, error: "enabled باید boolean باشد" },
 { status: 400 }
 );
 }

 const rollout =
 typeof rolloutPercentage === "number"
? Math.max(0, Math.min(100, Math.round(rolloutPercentage)))
: enabled
? 100
: 0;

 // اگر enabled=true باشد rollout باید > 0
 if (enabled && rollout === 0) {
 return NextResponse.json(
 {
 success: false,
 error: "اگر enabled=true است، rolloutPercentage باید بیشتر از ۰ باشد",
 },
 { status: 400 }
 );
 }

 // admin id برای audit
 const adminId = "admin" in auth? (auth.admin as { id: string }).id: undefined;

 // اگر توضیح ارسال شده، آن را هم ذخیره کنیم (upsert مودیل FeatureFlag)
 // NOTE: setFeatureFlag توضیح را مدیریت نمی‌کند؛ برای حفظ description در update
 // مستقیماً از prisma.upsert استفاده می‌کنیم اگر description موجود باشد.
 if (description!== undefined) {
 const existing = await db.featureFlag.findUnique({ where: { name } });
 if (existing) {
 await db.featureFlag.update({
 where: { name },
 data: { description, enabled, rolloutPercentage: rollout, conditions: conditions? JSON.stringify(conditions): existing.conditions, updatedBy: adminId?? null },
 });
 } else {
 await db.featureFlag.create({
 data: {
 name,
 description,
 enabled,
 rolloutPercentage: rollout,
 conditions: conditions? JSON.stringify(conditions): null,
 updatedBy: adminId?? null,
 },
 });
 }
 } else {
 await setFeatureFlag(name, enabled, rollout, conditions, adminId);
 }

 return NextResponse.json({
 success: true,
 data: {
 name,
 enabled,
 rolloutPercentage: rollout,
 conditions: conditions?? null,
 description,
 },
 });
 } catch (error) {
 console.error("Feature flag create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد فلگ" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/feature-flags?name=FLAG_NAME
// به‌روزرسانی فلگ موجود — برای toggle سریع enabled یا تغییر rollout
// Body: { enabled?, rolloutPercentage?, conditions?, description? }
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const name = searchParams.get("name");

 if (!name) {
 return NextResponse.json(
 { success: false, error: "پارامتر name الزامی است" },
 { status: 400 }
 );
 }

 const body = await req.json().catch(() => ({})) as {
 enabled?: boolean;
 rolloutPercentage?: number;
 conditions?: { plan?: string[]; roles?: string[]; tenantIds?: string[] } | null;
 description?: string;
 };

 const existing = await db.featureFlag.findUnique({ where: { name } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "فلگ یافت نشد" },
 { status: 404 }
 );
 }

 const data: Record<string, unknown> = { updatedBy: auth.admin.id };

 if (typeof body.enabled === "boolean") {
 data.enabled = body.enabled;
 // اگر enabled=true و rollout صفر است، آن را به 100 ببریم
 if (body.enabled && existing.rolloutPercentage === 0) {
 data.rolloutPercentage = 100;
 } else if (!body.enabled && existing.rolloutPercentage >= 100) {
 // غیرفعال کردن: rollout را ۰ می‌کنیم تا با منطق ارزیابی هماهنگ باشد
 data.rolloutPercentage = 0;
 }
 }

 if (typeof body.rolloutPercentage === "number") {
 const r = Math.max(0, Math.min(100, Math.round(body.rolloutPercentage)));
 data.rolloutPercentage = r;
 }

 if (body.conditions!== undefined) {
 data.conditions = body.conditions? JSON.stringify(body.conditions): null;
 }

 if (typeof body.description === "string") {
 data.description = body.description;
 }

 const updated = await db.featureFlag.update({
 where: { name },
 data,
 });

 return NextResponse.json({
 success: true,
 data: {
 id: updated.id,
 name: updated.name,
 description: updated.description,
 enabled: updated.enabled,
 rolloutPercentage: updated.rolloutPercentage,
 conditions: updated.conditions? JSON.parse(updated.conditions): null,
 updatedAt: updated.updatedAt,
 },
 message: `فلگ ${name} به‌روزرسانی شد`,
 });
 } catch (error) {
 console.error("Feature flag patch error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی فلگ" },
 { status: 500 }
 );
 }
}

// DELETE /api/platform/feature-flags?name=FLAG_NAME
// حذف فلگ
export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const name = searchParams.get("name");

 if (!name) {
 return NextResponse.json(
 { success: false, error: "پارامتر name الزامی است" },
 { status: 400 }
 );
 }

 await deleteFeatureFlag(name);

 return NextResponse.json({
 success: true,
 message: `فلگ ${name} حذف شد`,
 });
 } catch (error) {
 console.error("Feature flag delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف فلگ" },
 { status: 500 }
 );
 }
}
