import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const VALID_TYPES = ["INVOICE_SALE", "INVOICE_PURCHASE", "RECEIPT", "QUOTE", "CUSTOM"];

/**
 * GET /api/document-templates/[id]
 */
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
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

 const { id } = await params;
 const template = await db.documentTemplate.findFirst({
 where: {
 id,
 OR: [{ tenantId: user.tenantId }, { tenantId: null }],
 },
 });

 if (!template) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }

 return NextResponse.json({ success: true, data: template });
 } catch (error) {
 console.error("Get document template error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت قالب" },
 { status: 500 }
 );
 }
}

/**
 * PATCH /api/document-templates/[id]
 * body: { name?, type?, content?, header?, footer?, paperSize?, orientation?, isActive?, isDefault? }
 */
export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
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

 const { id } = await params;
 const existing = await db.documentTemplate.findFirst({
 where: { id, tenantId: user.tenantId },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const data: Record<string, unknown> = {};
 if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
 if (VALID_TYPES.includes(body?.type)) data.type = body.type;
 if (typeof body?.content === "string") data.content = body.content;
 if (body?.header!== undefined) data.header = body.header? String(body.header): null;
 if (body?.footer!== undefined) data.footer = body.footer? String(body.footer): null;
 if (body?.paperSize === "Letter" || body?.paperSize === "A4") data.paperSize = body.paperSize;
 if (body?.orientation === "portrait" || body?.orientation === "landscape")
 data.orientation = body.orientation;
 if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
 if (typeof body?.isDefault === "boolean") {
 // اگر پیش‌فرض می‌شود، بقیه‌ی هم‌نوع‌ها را غیرپیش‌فرض کن
 if (body.isDefault) {
 await db.documentTemplate.updateMany({
 where: {
 tenantId: user.tenantId,
 type: existing.type,
 id: { not: id },
 },
 data: { isDefault: false },
 });
 }
 data.isDefault = body.isDefault;
 }

 const updated = await db.documentTemplate.update({
 where: { id },
 data,
 });

 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("Update document template error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ویرایش قالب" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/document-templates/[id]
 */
export async function DELETE(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
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

 const { id } = await params;
 await db.documentTemplate.deleteMany({
 where: { id, tenantId: user.tenantId },
 });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Delete document template error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف قالب" },
 { status: 500 }
 );
 }
}
