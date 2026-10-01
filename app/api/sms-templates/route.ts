import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const VALID_TYPES = [
 "VERIFICATION",
 "REMINDER",
 "DISCOUNT",
 "WELCOME",
 "CHECK_DUE",
 "INVOICE_PAID",
];

const TYPE_LABELS: Record<string, string> = {
 VERIFICATION: "کد تأیید",
 REMINDER: "یادآوری",
 DISCOUNT: "تخفیف",
 WELCOME: "خوش‌آمدگویی",
 CHECK_DUE: "سررسید چک",
 INVOICE_PAID: "تسویه فاکتور",
};

const DEFAULT_TEMPLATES: Array<{
 name: string;
 type: string;
 body: string;
 variables: string[];
}> = [
 {
 name: "کد تأیید ورود",
 type: "VERIFICATION",
 body: "هوش\nکد تأیید شما: {{code}}\nاین کد تا ۲ دقیقه معتبر است.",
 variables: ["code"],
 },
 {
 name: "یادآوری سررسید فاکتور",
 type: "REMINDER",
 body: "مشتری گرامی {{customerName}}، فاکتور {{invoiceNumber}} شما به مبلغ {{amount}} تومان در تاریخ {{dueDate}} سررسید می‌شود. هوش",
 variables: ["customerName", "invoiceNumber", "amount", "dueDate"],
 },
 {
 name: "کد تخفیف ویژه",
 type: "DISCOUNT",
 body: "{{customerName}} عزیز، با کد {{discountCode}} تا {{percent}}٪ تخفیف روی فاکتور بعدی شما. مهلت تا {{expiryDate}}.",
 variables: ["customerName", "discountCode", "percent", "expiryDate"],
 },
 {
 name: "خوش‌آمدگویی به هوش",
 type: "WELCOME",
 body: "{{customerName}} عزیز، به خانواده هوش خوش آمدید. حساب کاربری شما با موفقیت ایجاد شد.",
 variables: ["customerName"],
 },
 {
 name: "یادآوری سررسید چک",
 type: "CHECK_DUE",
 body: "چک شماره {{checkNumber}} به مبلغ {{amount}} تومان در تاریخ {{dueDate}} سررسید می‌شود. طرف حساب: {{partyName}}.",
 variables: ["checkNumber", "amount", "dueDate", "partyName"],
 },
 {
 name: "تأیید تسویه فاکتور",
 type: "INVOICE_PAID",
 body: "فاکتور {{invoiceNumber}} به مبلغ {{amount}} تومان با موفقیت تسویه شد. از اعتماد شما سپاسگزاریم. هوش",
 variables: ["invoiceNumber", "amount"],
 },
];

/**
 * استخراج متغیرهای {{name}} از متن قالب
 */
function extractVariables(body: string): string[] {
 const matches = body.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
 const names = new Set<string>();
 for (const m of matches) {
 const name = m.replace(/[{}]/g, "").trim();
 if (name) names.add(name);
 }
 return Array.from(names);
}

/**
 * GET /api/sms-templates?type=REMINDER&seed=1
 * — فهرست قالب‌های پیامک. با seed=1 قالب‌های پیش‌فرض ایجاد می‌شوند.
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
 const tenantId = (payload.tenantId as string) || null;
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
 const type = searchParams.get("type") || "";
 const seed = searchParams.get("seed") === "1";

 // seed: اگر قالبی برای این tenant وجود ندارد، قالب‌های پیش‌فرض ایجاد کن
 if (seed) {
 const count = await db.smsTemplate.count({
 where: { tenantId: user.tenantId },
 });
 if (count === 0) {
 await db.smsTemplate.createMany({
 data: DEFAULT_TEMPLATES.map((t) => ({
 tenantId: user.tenantId,
 name: t.name,
 type: t.type,
 body: t.body,
 variables: JSON.stringify(t.variables),
 isActive: true,
 })),
 });
 }
 }

 const where: Record<string, unknown> = {
 OR: [{ tenantId: user.tenantId }, { tenantId: null }],
 };
 if (type && VALID_TYPES.includes(type.toUpperCase())) {
 where.type = type.toUpperCase();
 }

 const templates = await db.smsTemplate.findMany({
 where,
 orderBy: { createdAt: "desc" },
 });

 const data = templates.map((t) => ({
 id: t.id,
 name: t.name,
 type: t.type,
 typeLabel: TYPE_LABELS[t.type] || t.type,
 body: t.body,
 variables: t.variables,
 isActive: t.isActive,
 createdAt: t.createdAt,
 updatedAt: t.updatedAt,
 }));

 return NextResponse.json({ success: true, data, types: TYPE_LABELS });
 } catch (error) {
 console.error("List SMS templates error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت قالب‌های پیامک" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/sms-templates — ایجاد قالب جدید
 * body: { name, type, body }
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
 const type = String(body?.type || "").toUpperCase();
 const text = String(body?.body || "");

 if (!name ||!type ||!text) {
 return NextResponse.json(
 { success: false, error: "نام، نوع و متن قالب الزامی است" },
 { status: 400 }
 );
 }

 if (!VALID_TYPES.includes(type)) {
 return NextResponse.json(
 { success: false, error: "نوع قالب نامعتبر است" },
 { status: 400 }
 );
 }

 const variables = extractVariables(text);

 const tpl = await db.smsTemplate.create({
 data: {
 tenantId: user.tenantId,
 name,
 type,
 body: text,
 variables: JSON.stringify(variables),
 isActive: true,
 },
 });

 return NextResponse.json({
 success: true,
 data: {...tpl, variables: tpl.variables },
 });
 } catch (error) {
 console.error("Create SMS template error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد قالب" },
 { status: 500 }
 );
 }
}

/**
 * PATCH /api/sms-templates?id=... — ویرایش قالب
 * body: { name?, type?, body?, isActive? }
 */
export async function PATCH(req: NextRequest) {
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

 // SECURITY: قالب باید متعلق به tenant کاربر باشد (IDOR) — قالب‌های سراسری (tenantId=null)
 // فقط از پنل پلتفرم قابل ویرایش‌اند.
 const owned = await db.smsTemplate.findFirst({
 where: { id, tenantId: user.tenantId },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const data: Record<string, unknown> = {};

 if (typeof body?.name === "string" && body.name.trim()) {
 data.name = body.name.trim();
 }
 if (typeof body?.type === "string" && VALID_TYPES.includes(body.type.toUpperCase())) {
 data.type = body.type.toUpperCase();
 }
 if (typeof body?.body === "string") {
 data.body = body.body;
 data.variables = JSON.stringify(extractVariables(body.body));
 }
 if (typeof body?.isActive === "boolean") {
 data.isActive = body.isActive;
 }

 const updated = await db.smsTemplate.update({
 where: { id: owned.id },
 data,
 });

 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("Update SMS template error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ویرایش قالب" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/sms-templates?id=...
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

 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }

 // (رفع 5-b-complete) در DELETE برخلاف PATCH کاربر از توکن خوانده نمی‌شد و
 // «user» تعریف‌نشده بود → خطای tsc «Cannot find name 'user'» و ۵۰۰ در ران‌تایم.
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

 // SECURITY: قالب باید متعلق به tenant کاربر باشد (IDOR) — قالب‌های سراسری (tenantId=null)
 // فقط از پنل پلتفرم قابل حذف‌اند.
 const owned = await db.smsTemplate.findFirst({
 where: { id, tenantId: user.tenantId },
 select: { id: true },
 });
 if (!owned) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }

 await db.smsTemplate.delete({ where: { id: owned.id } });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Delete SMS template error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف قالب" },
 { status: 500 }
 );
 }
}
