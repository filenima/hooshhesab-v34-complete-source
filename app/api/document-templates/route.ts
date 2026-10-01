import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const VALID_TYPES = ["INVOICE_SALE", "INVOICE_PURCHASE", "RECEIPT", "QUOTE", "CUSTOM"];

/**
 * GET /api/document-templates — لیست قالب‌های سند
 *?type=INVOICE_SALE برای فیلتر بر اساس نوع
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
 const type = searchParams.get("type");

 const where: Record<string, unknown> = {
 OR: [{ tenantId: user.tenantId }, { tenantId: null }],
 isActive: true,
 };
 if (type && VALID_TYPES.includes(type)) {
 where.type = type;
 }

 const templates = await db.documentTemplate.findMany({
 where,
 orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
 });

 return NextResponse.json({ success: true, data: templates });
 } catch (error) {
 console.error("List document templates error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت قالب‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/document-templates — ایجاد قالب جدید
 * body: { name, type, content, header?, footer?, paperSize?, orientation?, isDefault? }
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
 const type = VALID_TYPES.includes(body?.type)? body.type: "CUSTOM";
 const content = String(body?.content || "");
 const header = body?.header? String(body.header): null;
 const footer = body?.footer? String(body.footer): null;
 const paperSize = body?.paperSize === "Letter"? "Letter": "A4";
 const orientation =
 body?.orientation === "landscape"? "landscape": "portrait";
 const isDefault = Boolean(body?.isDefault);

 if (!name) {
 return NextResponse.json(
 { success: false, error: "نام قالب الزامی است" },
 { status: 400 }
 );
 }

 // اگر isDefault=true، بقیه‌ی قالب‌های هم‌نوع tenant را غیرپیش‌فرض کن
 if (isDefault) {
 await db.documentTemplate.updateMany({
 where: { tenantId: user.tenantId, type },
 data: { isDefault: false },
 });
 }

 const template = await db.documentTemplate.create({
 data: {
 tenantId: user.tenantId,
 name,
 type,
 content,
 header,
 footer,
 paperSize,
 orientation,
 isActive: true,
 isDefault,
 },
 });

 return NextResponse.json({ success: true, data: template });
 } catch (error) {
 console.error("Create document template error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد قالب" },
 { status: 500 }
 );
 }
}
