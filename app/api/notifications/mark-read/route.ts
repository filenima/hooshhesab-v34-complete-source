import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * POST /api/notifications/mark-read
 * - body: { id?: string }
 * - اگر id ارسال شود فقط همان رکورد خوانده‌شده می‌شود
 * - در غیر این‌صورت همه‌ی خوانده‌نشده‌های کاربر/tenant به‌عنوان خوانده‌شده علامت‌گذاری می‌شوند
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
 where: { id, tenantId: user.tenantId },
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
