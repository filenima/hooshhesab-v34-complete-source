import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const VALID_TYPES = ["INVOICE_SALE", "INVOICE_PURCHASE", "RECEIPT", "QUOTE", "CUSTOM"];

/**
 * GET /api/document-templates/export
 *?ids=id1,id2 (اختیاری — برای export انتخابی)
 * خروجی: فایل JSON قابل دانلود شامل همه قالب‌های tenant فعلی.
 * ساختار: { version: "1.0", exportedAt, templates: [...] }
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
 select: { id: true, tenantId: true, name: true, family: true, tenant: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const idsParam = searchParams.get("ids");
 const ids = idsParam
? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
: null;

 const where: Record<string, unknown> = {
 tenantId: user.tenantId,
 };
 if (ids && ids.length > 0) {
 where.id = { in: ids };
 }

 const templates = await db.documentTemplate.findMany({
 where,
 orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
 });

 const exportPayload = {
 version: "1.0",
 exportedAt: new Date().toISOString(),
 exportedBy: {
 userId: user.id,
 name: `${user.name} ${user.family?? ""}`.trim(),
 tenantName: user.tenant.name,
 },
 count: templates.length,
 templates: templates.map((t) => ({
 name: t.name,
 type: t.type,
 content: t.content,
 header: t.header,
 footer: t.footer,
 paperSize: t.paperSize,
 orientation: t.orientation,
 isDefault: t.isDefault,
 isActive: t.isActive,
 // tenantId عمداً export نمی‌شود تا در import به tenant جدید برسد
 })),
 };

 const json = JSON.stringify(exportPayload, null, 2);
 const filename = `hoshhesab-templates-${new Date().toISOString().slice(0, 10)}.json`;

 return new NextResponse(json, {
 status: 200,
 headers: {
 "Content-Type": "application/json; charset=utf-8",
 "Content-Disposition": `attachment; filename="${filename}"`,
 "Content-Length": Buffer.byteLength(json).toString(),
 },
 });
 } catch (error) {
 console.error("Export document templates error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در خروجی قالب‌ها" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/document-templates/export
 * body: { ids?: string[] } — برای export انتخابی با POST
 * خروجی همان GET اما از طریق POST برای ارسال آرایه بزرگ‌تر از ids
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
 select: { id: true, tenantId: true, name: true, family: true, tenant: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const ids: string[] = Array.isArray(body?.ids)? body.ids: [];

 const where: Record<string, unknown> = { tenantId: user.tenantId };
 if (ids.length > 0) where.id = { in: ids };

 const templates = await db.documentTemplate.findMany({
 where,
 orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
 });

 const exportPayload = {
 version: "1.0",
 exportedAt: new Date().toISOString(),
 exportedBy: {
 userId: user.id,
 name: `${user.name} ${user.family?? ""}`.trim(),
 tenantName: user.tenant.name,
 },
 count: templates.length,
 templates: templates.map((t) => ({
 name: t.name,
 type: t.type,
 content: t.content,
 header: t.header,
 footer: t.footer,
 paperSize: t.paperSize,
 orientation: t.orientation,
 isDefault: t.isDefault,
 isActive: t.isActive,
 })),
 };

 const json = JSON.stringify(exportPayload, null, 2);
 const filename = `hoshhesab-templates-${new Date().toISOString().slice(0, 10)}.json`;

 return new NextResponse(json, {
 status: 200,
 headers: {
 "Content-Type": "application/json; charset=utf-8",
 "Content-Disposition": `attachment; filename="${filename}"`,
 "Content-Length": Buffer.byteLength(json).toString(),
 },
 });
 } catch (error) {
 console.error("Export document templates (POST) error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در خروجی قالب‌ها" },
 { status: 500 }
 );
 }
}

export const _internal = { VALID_TYPES };
