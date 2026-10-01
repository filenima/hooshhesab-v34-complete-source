import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * GET /api/search/saved — لیست جستجوهای ذخیره‌شده کاربر
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

 const saved = await db.savedSearch.findMany({
 where: { tenantId: user.tenantId, userId: user.id },
 orderBy: { createdAt: "desc" },
 });

 const data = saved.map((s) => ({
...s,
 filters: safeParse(s.filters),
 }));

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("List saved searches error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت جستجوهای ذخیره‌شده" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/search/saved — ذخیره جستجو
 * body: { name, query, filters, entity }
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
 const query = String(body?.query || "").trim();
 const entity = String(body?.entity || "all");
 const filters = body?.filters?? {};

 if (!name) {
 return NextResponse.json(
 { success: false, error: "نام جستجو الزامی است" },
 { status: 400 }
 );
 }

 const created = await db.savedSearch.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 name,
 query,
 entity,
 filters: JSON.stringify(filters),
 },
 });

 return NextResponse.json({
 success: true,
 data: {...created, filters: safeParse(created.filters) },
 });
 } catch (error) {
 console.error("Save search error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره جستجو" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/search/saved?id=... — حذف جستجوی ذخیره‌شده
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

 await db.savedSearch.deleteMany({
 where: { id, tenantId: user.tenantId, userId: user.id },
 });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Delete saved search error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف جستجو" },
 { status: 500 }
 );
 }
}

function safeParse(raw: string): unknown {
 try {
 return JSON.parse(raw);
 } catch {
 return {};
 }
}
