import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const VALID_COLORS = ["primary", "success", "warning", "destructive", "info"];

/**
 * GET /api/tags — لیست برچسب‌های tenant
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

 const tags = await db.tag.findMany({
 where: { tenantId: user.tenantId },
 orderBy: { name: "asc" },
 include: { _count: { select: { entityTags: true } } },
 });

 const data = tags.map((t) => ({
 id: t.id,
 name: t.name,
 color: t.color,
 usageCount: t._count.entityTags,
 createdAt: t.createdAt,
 }));

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("List tags error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت برچسب‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/tags — ایجاد برچسب جدید
 * body: { name, color? }
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
 const name = String(body?.name || "").trim();
 const color = VALID_COLORS.includes(body?.color)
? body.color
: "primary";

 if (!name) {
 return NextResponse.json(
 { success: false, error: "نام برچسب الزامی است" },
 { status: 400 }
 );
 }

 // بررسی تکراری نبودن
 const existing = await db.tag.findUnique({
 where: { tenantId_name: { tenantId: user.tenantId, name } },
 });
 if (existing) {
 return NextResponse.json({ success: true, data: existing });
 }

 const tag = await db.tag.create({
 data: { tenantId: user.tenantId, name, color },
 });

 return NextResponse.json({ success: true, data: tag });
 } catch (error) {
 console.error("Create tag error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد برچسب" },
 { status: 500 }
 );
 }
}

/**
 * PATCH /api/tags?id=... — ویرایش برچسب
 * body: { name?, color? }
 */
export async function PATCH(req: NextRequest) {
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
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const data: Record<string, string> = {};
 if (typeof body?.name === "string" && body.name.trim()) {
 data.name = body.name.trim();
 }
 if (VALID_COLORS.includes(body?.color)) {
 data.color = body.color;
 }

 const tag = await db.tag.update({
 where: { id, tenantId: user.tenantId },
 data,
 });

 return NextResponse.json({ success: true, data: tag });
 } catch (error) {
 console.error("Update tag error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ویرایش برچسب" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/tags?id=... — حذف برچسب
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
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }

 // 404 درست برای برچسب ناموجود/متعلق به tenant دیگر (قبلاً 500 برمی‌گشت)
 const exists = await db.tag.findFirst({
 where: { id, tenantId: user.tenantId },
 select: { id: true },
 });
 if (!exists) {
 return NextResponse.json(
 { success: false, error: "برچسب یافت نشد" },
 { status: 404 }
 );
 }

 await db.tag.delete({ where: { id, tenantId: user.tenantId } });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Delete tag error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف برچسب" },
 { status: 500 }
 );
 }
}
