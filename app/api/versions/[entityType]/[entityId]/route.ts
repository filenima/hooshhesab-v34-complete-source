import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import { getVersionHistory, saveVersion } from "@/lib/versioning";

export const runtime = "nodejs";

/**
 * GET /api/versions/[entityType]/[entityId]
 * — دریافت تاریخچه نسخه‌های سند
 */
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
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
 select: { id: true, tenantId: true, name: true, family: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { entityType, entityId } = await params;
 const normalizedType = entityType.toUpperCase();

 const history = await getVersionHistory(
 normalizedType,
 entityId,
 user.tenantId
 );

 // تکمیل نام کاربر برای changedBy
 const userIds = [...new Set(history.map((h) => h.changedBy).filter(Boolean))] as string[];
 const users = await db.user.findMany({
 where: { id: { in: userIds } },
 select: { id: true, name: true, family: true },
 });
 const userMap = new Map(users.map((u) => [u.id, u]));

 const data = history.map((v) => {
 const u = v.changedBy? userMap.get(v.changedBy): null;
 return {
 id: v.id,
 version: v.version,
 changedBy: v.changedBy,
 changedByName: u? `${u.name} ${u.family?? ""}`.trim(): null,
 changedAt: v.changedAt,
 changeDescription: v.changeDescription,
 };
 });

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("Get version history error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تاریخچه نسخه‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/versions/[entityType]/[entityId]
 * — ذخیره نسخه فعلی سند
 * body: { description? }
 */
export async function POST(
 req: NextRequest,
 { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
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

 const { entityType, entityId } = await params;
 const normalizedType = entityType.toUpperCase();
 const body = await req.json().catch(() => ({}));
 const description =
 typeof body?.description === "string"? body.description: undefined;

 const version = await saveVersion(
 normalizedType,
 entityId,
 user.tenantId,
 user.id,
 description
 );

 if (!version) {
 return NextResponse.json({
 success: true,
 data: null,
 message: "تغییری نسبت به نسخه قبلی وجود ندارد",
 });
 }

 return NextResponse.json({
 success: true,
 data: {
 id: version.id,
 version: version.version,
 changedAt: version.changedAt,
 },
 message: `نسخه ${version.version} ذخیره شد`,
 });
 } catch (error) {
 console.error("Save version error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره نسخه" },
 { status: 500 }
 );
 }
}
