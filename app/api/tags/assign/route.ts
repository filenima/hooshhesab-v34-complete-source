import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const VALID_ENTITY_TYPES = ["INVOICE", "PRODUCT", "PARTY", "JOURNAL"];

/**
 * GET /api/tags/assign?entityType=INVOICE&entityId=...
 * — لیست برچسب‌های اختصاص‌یافته به یک موجودیت
 */
export async function GET(req: NextRequest) {
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

 const { searchParams } = new URL(req.url);
 const entityType = (searchParams.get("entityType") || "").toUpperCase();
 const entityId = searchParams.get("entityId") || "";

 if (!VALID_ENTITY_TYPES.includes(entityType) ||!entityId) {
 return NextResponse.json(
 { success: false, error: "پارامترها نامعتبر" },
 { status: 400 }
 );
 }

 const entityTags = await db.entityTag.findMany({
 where: { entityType, entityId },
 include: { tag: true },
 });

 const data = entityTags.map((et) => ({
 id: et.id,
 tagId: et.tagId,
 name: et.tag.name,
 color: et.tag.color,
 }));

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("List entity tags error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت برچسب‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/tags/assign — اختصاص برچسب به موجودیت
 * body: { tagId, entityType, entityId }
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
 const entityType = String(body?.entityType || "").toUpperCase();
 const entityId = String(body?.entityId || "");

 if (!tagId ||!VALID_ENTITY_TYPES.includes(entityType) ||!entityId) {
 return NextResponse.json(
 { success: false, error: "پارامترها نامعتبر" },
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

 // upsert برای جلوگیری از خطای unique constraint
 const existing = await db.entityTag.findFirst({
 where: { tagId, entityType, entityId },
 });
 if (existing) {
 return NextResponse.json({
 success: true,
 data: { id: existing.id, tagId, name: tag.name, color: tag.color },
 });
 }

 const et = await db.entityTag.create({
 data: { tagId, entityType, entityId },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: et.id,
 tagId,
 name: tag.name,
 color: tag.color,
 },
 });
 } catch (error) {
 console.error("Assign tag error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اختصاص برچسب" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/tags/assign?tagId=...&entityType=...&entityId=...
 * — حذف برچسب از موجودیت
 */
export async function DELETE(req: NextRequest) {
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

 const { searchParams } = new URL(req.url);
 const tagId = searchParams.get("tagId") || "";
 const entityType = (searchParams.get("entityType") || "").toUpperCase();
 const entityId = searchParams.get("entityId") || "";

 if (!tagId ||!VALID_ENTITY_TYPES.includes(entityType) ||!entityId) {
 return NextResponse.json(
 { success: false, error: "پارامترها نامعتبر" },
 { status: 400 }
 );
 }

 await db.entityTag.deleteMany({
 where: { tagId, entityType, entityId },
 });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Remove tag error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف برچسب" },
 { status: 500 }
 );
 }
}
