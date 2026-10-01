import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * GET /api/notifications
 * - Bearer auth الزامی
 * - خروجی: لیست اعلان‌های کاربر فعلی (و اعلان‌های tenant-wide با userId = null)
 * - پارامترهای query:?unreadOnly=true
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
 const unreadOnly = searchParams.get("unreadOnly") === "true";

 const where: Record<string, unknown> = {
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 };
 if (unreadOnly) where.isRead = false;

 const notifications = await db.notification.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: 50,
 });

 const unreadCount = await db.notification.count({
 where: {
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 isRead: false,
 },
 });

 return NextResponse.json({
 success: true,
 data: notifications,
 unreadCount,
 });
 } catch (error) {
 console.error("List notifications error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت اعلان‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/notifications/mark-read
 * - body: { id?: string } — اگر id ارسال شود فقط همان رکورد خوانده می‌شود،
 * در غیر این‌صورت همه‌ی خوانده‌نشده‌ها به‌عنوان خوانده‌شده علامت‌گذاری می‌شوند.
 *
 * نکته: مسیر مفهومی است؛ عملیات اصلی روی همین /api/notifications انجام می‌شود.
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
 const id = typeof body?.id === "string"? body.id: null;

 if (id) {
 await db.notification.updateMany({
 where: { id, tenantId: user.tenantId, OR: [{ userId: null }, { userId: user.id }] },
 data: { isRead: true },
 });
 return NextResponse.json({
 success: true,
 message: "اعلان به‌عنوان خوانده‌شده علامت‌گذاری شد",
 });
 }

 const result = await db.notification.updateMany({
 where: {
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 isRead: false,
 },
 data: { isRead: true },
 });

 return NextResponse.json({
 success: true,
 message: "همه‌ی اعلان‌ها به‌عنوان خوانده‌شده علامت‌گذاری شدند",
 updatedCount: result.count,
 });
 } catch (error) {
 console.error("Mark-read notifications error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی اعلان‌ها" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/notifications
 * - حذف اعلان‌هایی که خوانده شده‌اند (isRead = true)
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

 const result = await db.notification.deleteMany({
 where: {
 tenantId: user.tenantId,
 OR: [{ userId: null }, { userId: user.id }],
 isRead: true,
 },
 });

 return NextResponse.json({
 success: true,
 message: "اعلان‌های خوانده‌شده پاک‌سازی شدند",
 deletedCount: result.count,
 });
 } catch (error) {
 console.error("Clear notifications error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پاک‌سازی اعلان‌ها" },
 { status: 500 }
 );
 }
}
