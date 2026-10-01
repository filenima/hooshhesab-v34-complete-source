import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const VALID_ENTITY_TYPES = ["INVOICE", "PRODUCT", "PARTY", "JOURNAL"];

interface Assignment {
 entityType: string;
 entityId: string;
}

/**
 * POST /api/tags/bulk-assign
 * body: { tagId, assignments: [{ entityType, entityId }] }
 * اختصاص یک برچسب به چندین موجودیت به‌صورت یکجا.
 * خروجی: تعداد اختصاص‌های موفق + لیست موارد خطادار.
 */
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const tagId = String(body?.tagId || "");
 const assignments: Assignment[] = Array.isArray(body?.assignments)
? body.assignments
: [];

 if (!tagId) {
 return NextResponse.json(
 { success: false, error: "شناسه برچسب الزامی است" },
 { status: 400 }
 );
 }
 if (assignments.length === 0) {
 return NextResponse.json(
 { success: false, error: "حداقل یک مورد برای اختصاص لازم است" },
 { status: 400 }
 );
 }

 // بررسی تعلق برچسب به tenant
 const tag = await db.tag.findUnique({
 where: { id: tagId },
 select: { id: true, tenantId: true, name: true, color: true },
 });
 if (!tag || tag.tenantId!== user.tenantId) {
 return NextResponse.json(
 { success: false, error: "برچسب یافت نشد" },
 { status: 404 }
 );
 }

 // نرمال‌سازی و فیلتر موارد نامعتبر
 const valid: Assignment[] = [];
 const invalid: { entityType: string; entityId: string; reason: string }[] = [];
 const seen = new Set<string>();

 for (const a of assignments) {
 const entityType = String(a?.entityType || "").toUpperCase();
 const entityId = String(a?.entityId || "");
 if (!VALID_ENTITY_TYPES.includes(entityType)) {
 invalid.push({ entityType, entityId, reason: "نوع موجودیت نامعتبر" });
 continue;
 }
 if (!entityId) {
 invalid.push({ entityType, entityId, reason: "شناسه موجودیت خالی است" });
 continue;
 }
 const key = `${entityType}:${entityId}`;
 if (seen.has(key)) continue; // حذف تکراری
 seen.add(key);
 valid.push({ entityType, entityId });
 }

 if (valid.length === 0) {
 return NextResponse.json({
 success: false,
 error: "هیچ مورد معتبری برای اختصاص وجود ندارد",
 invalid,
 }, { status: 400 });
 }

 // یافتن EntityTagهای موجود برای جلوگیری از خطای unique constraint
 const conditions = valid.map((v) => ({
 tagId,
 entityType: v.entityType,
 entityId: v.entityId,
 }));

 const existing = await db.entityTag.findMany({
 where: { OR: conditions },
 select: { entityType: true, entityId: true },
 });
 const existingSet = new Set(
 existing.map((e) => `${e.entityType}:${e.entityId}`)
 );

 const toCreate = valid.filter(
 (v) =>!existingSet.has(`${v.entityType}:${v.entityId}`)
 );

 // ایجاد انبوه با createMany
 // NOTE: SQLite در Prisma از skipDuplicates پشتیبانی نمی‌کند؛ چون از قبل
 // موارد موجود را با existingSet فیلتر کرده‌ایم، نیازی به skipDuplicates نیست.
 if (toCreate.length > 0) {
 await db.entityTag.createMany({
 data: toCreate.map((v) => ({
 tagId,
 entityType: v.entityType,
 entityId: v.entityId,
 })),
 });
 }

 const successCount = valid.length; // مواردی که اکنون برچسب دارند (جدید + از قبل موجود)

 // ثبت Audit Log
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "BULK_TAG_ASSIGN",
 entity: "Tag",
 entityId: tagId,
 changes: JSON.stringify({
 tagName: tag.name,
 assignedCount: successCount,
 alreadyAssigned: existingSet.size,
 invalidCount: invalid.length,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 tagId,
 tagName: tag.name,
 tagColor: tag.color,
 assignedCount: successCount,
 newlyCreated: toCreate.length,
 alreadyAssigned: existingSet.size,
 invalidCount: invalid.length,
 invalid,
 },
 message: `برچسب «${tag.name}» به ${successCount} مورد اختصاص یافت`,
 });
 } catch (error) {
 console.error("Bulk tag assign error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اختصاص گروهی برچسب" },
 { status: 500 }
 );
 }
}
