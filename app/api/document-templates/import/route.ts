import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const VALID_TYPES = ["INVOICE_SALE", "INVOICE_PURCHASE", "RECEIPT", "QUOTE", "CUSTOM"];

interface ImportTemplate {
 name?: unknown;
 type?: unknown;
 content?: unknown;
 header?: unknown;
 footer?: unknown;
 paperSize?: unknown;
 orientation?: unknown;
 isDefault?: unknown;
 isActive?: unknown;
}

interface ImportPayload {
 version?: unknown;
 templates?: unknown;
}

/**
 * POST /api/document-templates/import
 * body: { templates: [...] } یا { version, exportedAt, templates }
 * - اعتبارسنجی ساختار هر قالب
 * - قالب‌های تکراری (با همان name+type در tenant) نادیده گرفته می‌شوند
 * - قالب‌های جدید ایجاد می‌شوند (بدون بازنویسی موجود)
 * خروجی: { created, skipped, invalid }
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

 const body = (await req.json().catch(() => ({}))) as ImportPayload;
 const templates = Array.isArray(body?.templates)? body.templates: [];

 if (templates.length === 0) {
 return NextResponse.json(
 {
 success: false,
 error: "هیچ قالبی برای ورود وجود ندارد — فیلد templates الزامی است",
 },
 { status: 400 }
 );
 }

 if (templates.length > 200) {
 return NextResponse.json(
 {
 success: false,
 error: "حداکثر ۲۰۰ قالب در هر بار ورود مجاز است",
 },
 { status: 400 }
 );
 }

 // گرفتن نام‌های موجود برای جلوگیری از تکرار
 const existing = await db.documentTemplate.findMany({
 where: { tenantId: user.tenantId },
 select: { name: true, type: true },
 });
 const existingKeys = new Set(
 existing.map((t) => `${t.name}|${t.type}`)
 );

 const created: { id: string; name: string; type: string }[] = [];
 const skipped: { name: string; reason: string }[] = [];
 const invalid: { index: number; errors: string[] }[] = [];

 for (let i = 0; i < templates.length; i++) {
 const t = templates[i] as ImportTemplate;
 const errors: string[] = [];

 const name = typeof t?.name === "string"? t.name.trim(): "";
 const type = VALID_TYPES.includes(t?.type as string)
? (t.type as string)
: "";
 const content = typeof t?.content === "string"? t.content: "";

 if (!name) errors.push("نام قالب الزامی است");
 if (!type) errors.push(`نوع قالب نامعتبر (مجاز: ${VALID_TYPES.join(", ")})`);
 if (!content) errors.push("محتوای قالب الزامی است");

 if (errors.length > 0) {
 invalid.push({ index: i, errors });
 continue;
 }

 const key = `${name}|${type}`;
 if (existingKeys.has(key)) {
 skipped.push({ name, reason: "قالب با همین نام و نوع موجود است" });
 continue;
 }

 // اعتبارسنجی فیلدهای اختیاری
 const paperSize =
 t.paperSize === "Letter"? "Letter": "A4";
 const orientation =
 t.orientation === "landscape"? "landscape": "portrait";
 const isDefault = Boolean(t.isDefault);
 const isActive = t.isActive === false? false: true;
 const header =
 typeof t.header === "string" && t.header? t.header: null;
 const footer =
 typeof t.footer === "string" && t.footer? t.footer: null;

 try {
 // اگر isDefault=true، بقیه‌ی قالب‌های هم‌نوع tenant را غیرپیش‌فرض کن
 if (isDefault) {
 await db.documentTemplate.updateMany({
 where: { tenantId: user.tenantId, type },
 data: { isDefault: false },
 });
 }

 const tpl = await db.documentTemplate.create({
 data: {
 tenantId: user.tenantId,
 name,
 type,
 content,
 header,
 footer,
 paperSize,
 orientation,
 isActive,
 isDefault,
 },
 });

 existingKeys.add(key);
 created.push({ id: tpl.id, name: tpl.name, type: tpl.type });
 } catch (err) {
 console.error("Import template create error:", err);
 invalid.push({
 index: i,
 errors: ["خطا در ایجاد قالب در دیتابیس"],
 });
 }
 }

 // ثبت Audit Log
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "IMPORT_TEMPLATES",
 entity: "DocumentTemplate",
 entityId: null,
 changes: JSON.stringify({
 created: created.length,
 skipped: skipped.length,
 invalid: invalid.length,
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 created: created.length,
 skipped: skipped.length,
 invalid: invalid.length,
 createdTemplates: created,
 skippedTemplates: skipped,
 invalidTemplates: invalid,
 },
 message: `${created.length} قالب جدید وارد شد${
 skipped.length > 0? `، ${skipped.length} مورد تکراری نادیده گرفته شد`: ""
 }${invalid.length > 0? `، ${invalid.length} مورد نامعتبر`: ""}`,
 });
 } catch (error) {
 console.error("Import document templates error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ورود قالب‌ها" },
 { status: 500 }
 );
 }
}
