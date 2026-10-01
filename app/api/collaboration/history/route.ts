import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * GET /api/collaboration/history?entityType=INVOICE&entityId=...&limit=50
 * — تاریخچه ویرایش‌های یک سند
 *
 * POST /api/collaboration/history — ثبت یک ویرایش
 * body: { entityType, entityId, field, oldValue?, newValue? }
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

 const { searchParams } = new URL(req.url);
 const entityType = (searchParams.get("entityType") || "").toUpperCase();
 const entityId = searchParams.get("entityId") || "";
 const limit = Math.min(
 200,
 Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
 );

 if (!entityType ||!entityId) {
 return NextResponse.json(
 { success: false, error: "entityType و entityId الزامی است" },
 { status: 400 }
 );
 }

 const edits = await db.documentEdit.findMany({
 where: { entityType, entityId },
 orderBy: { createdAt: "desc" },
 take: limit,
 });

 // دریافت نام کاربران
 const userIds = Array.from(new Set(edits.map((e) => e.userId)));
 const users = await db.user.findMany({
 where: { id: { in: userIds } },
 select: { id: true, name: true, email: true },
 });
 const userMap = new Map(users.map((u) => [u.id, u]));

 const data = edits.map((e) => ({
 id: e.id,
 field: e.field,
 oldValue: e.oldValue,
 newValue: e.newValue,
 createdAt: e.createdAt,
 user: userMap.get(e.userId)
? {
 id: userMap.get(e.userId)!.id,
 name: userMap.get(e.userId)!.name,
 email: userMap.get(e.userId)!.email,
 }
: { id: e.userId, name: "کاربر حذف‌شده", email: null },
 }));

 return NextResponse.json({ success: true, data, total: data.length });
 } catch (error) {
 console.error("Document history GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تاریخچه" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/collaboration/history — ثبت یک ویرایش در تاریخچه
 * body: { entityType, entityId, field, oldValue?, newValue? }
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
 const tenantId = payload.tenantId as string;
 const body = await req.json().catch(() => ({}));
 const entityType = String(body?.entityType || "").toUpperCase();
 const entityId = String(body?.entityId || "");
 const field = String(body?.field || "");
 const oldValue = body?.oldValue!= null? String(body.oldValue): null;
 const newValue = body?.newValue!= null? String(body.newValue): null;

 if (!entityType ||!entityId ||!field) {
 return NextResponse.json(
 { success: false, error: "entityType, entityId و field الزامی است" },
 { status: 400 }
 );
 }

 const edit = await db.documentEdit.create({
 data: {
 tenantId,
 entityType,
 entityId,
 userId,
 field,
 oldValue,
 newValue,
 },
 });

 return NextResponse.json({ success: true, data: edit });
 } catch (error) {
 console.error("Document history POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت ویرایش" },
 { status: 500 }
 );
 }
}
