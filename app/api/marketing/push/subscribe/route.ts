import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * POST /api/marketing/push/subscribe
 * body: { endpoint, p256dhKey, authKey, userAgent? }
 * ثبت اشتراک Push Notification برای کاربر فعلی.
 * اگر endpoint قبلاً ثبت شده، به‌روزرسانی می‌شود (upsert).
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
 const endpoint = String(body?.endpoint || "").trim();
 const p256dhKey = String(body?.p256dhKey || "").trim();
 const authKey = String(body?.authKey || "").trim();
 const userAgent =
 typeof body?.userAgent === "string"? body.userAgent: null;

 if (!endpoint ||!p256dhKey ||!authKey) {
 return NextResponse.json(
 { success: false, error: "پارامترهای endpoint، p256dhKey و authKey الزامی هستند" },
 { status: 400 }
 );
 }

 if (!endpoint.startsWith("https://")) {
 return NextResponse.json(
 { success: false, error: "endpoint نامعتبر" },
 { status: 400 }
 );
 }

 // upsert با (userId, endpoint) unique
 const sub = await db.pushSubscription.upsert({
 where: {
 userId_endpoint: { userId: user.id, endpoint },
 },
 update: {
 p256dhKey,
 authKey,
 userAgent,
 isActive: true,
 updatedAt: new Date(),
 },
 create: {
 userId: user.id,
 tenantId: user.tenantId,
 endpoint,
 p256dhKey,
 authKey,
 userAgent,
 isActive: true,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 id: sub.id,
 endpoint: sub.endpoint,
 isActive: sub.isActive,
 },
 message: "اشتراک نوتیفیکیشن با موفقیت ثبت شد",
 });
 } catch (error) {
 console.error("Push subscribe error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت اشتراک" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/marketing/push/subscribe
 *?endpoint=... — لغو اشتراک
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
 const { searchParams } = new URL(req.url);
 const endpoint = searchParams.get("endpoint") || "";

 if (!endpoint) {
 return NextResponse.json(
 { success: false, error: "endpoint الزامی است" },
 { status: 400 }
 );
 }

 await db.pushSubscription.updateMany({
 where: { userId, endpoint },
 data: { isActive: false },
 });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Push unsubscribe error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در لغو اشتراک" },
 { status: 500 }
 );
 }
}
