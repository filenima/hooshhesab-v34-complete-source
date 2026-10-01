import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// قالب‌های پیش‌فرض سیستم
const DEFAULT_TEMPLATES = [
 {
 name: "فاکتور جدید",
 type: "INVOICE_CREATED",
 subject: "فاکتور جدید {{invoiceNumber}} از {{companyName}}",
 body: "<p>سلام {{customerName}} عزیز،</p><p>فاکتور جدید شما به شماره <strong>{{invoiceNumber}}</strong> به مبلغ <strong>{{amount}}</strong> صادر شد.</p><p>مهلت پرداخت: {{dueDate}}</p><p>با تشکر،<br/>{{companyName}}</p>",
 variables: JSON.stringify([
 "customerName",
 "invoiceNumber",
 "amount",
 "dueDate",
 "companyName",
 ]),
 },
 {
 name: "پرداخت دریافت شد",
 type: "PAYMENT_RECEIVED",
 subject: "تسویه فاکتور {{invoiceNumber}}",
 body: "<p>سلام {{customerName}} عزیز،</p><p>پرداخت شما به مبلغ <strong>{{amount}}</strong> بابت فاکتور <strong>{{invoiceNumber}}</strong> دریافت شد.</p><p>با تشکر از اعتماد شما،<br/>{{companyName}}</p>",
 variables: JSON.stringify([
 "customerName",
 "invoiceNumber",
 "amount",
 "companyName",
 ]),
 },
 {
 name: "سررسید چک",
 type: "CHECK_DUE",
 subject: "یادآوری سررسید چک {{checkNumber}}",
 body: "<p>سلام {{customerName}}،</p><p>چک شماره <strong>{{checkNumber}}</strong> به مبلغ <strong>{{amount}}</strong> در تاریخ <strong>{{dueDate}}</strong> سررسید می‌شود.</p><p>لطفاً رسیدگی لازم را مبذول فرمایید.<br/>{{companyName}}</p>",
 variables: JSON.stringify([
 "customerName",
 "checkNumber",
 "amount",
 "dueDate",
 "companyName",
 ]),
 },
 {
 name: "خوش‌آمدگویی",
 type: "WELCOME",
 subject: "خوش آمدید به {{companyName}}",
 body: "<p>سلام {{customerName}} عزیز،</p><p>به خانواده {{companyName}} خوش آمدید! حساب کاربری شما با موفقیت فعال شد.</p><p>برای هرگونه سوال، با پشتیبانی در تماس باشید.<br/>{{companyName}}</p>",
 variables: JSON.stringify(["customerName", "companyName"]),
 },
 {
 name: "پایان تریال",
 type: "TRIAL_ENDING",
 subject: "پایان دوره آزمایشی شما نزدیک است",
 body: "<p>سلام {{customerName}}،</p><p>دوره آزمایشی ۱۴ روزه شما در {{daysLeft}} روز آینده به پایان می‌رسد.</p><p>برای تداوم استفاده از خدمات، لطفاً طرح خود را ارتقا دهید.<br/>{{companyName}}</p>",
 variables: JSON.stringify(["customerName", "daysLeft", "companyName"]),
 },
];

// GET /api/email-templates — فهرست قالب‌ها
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const { searchParams } = new URL(req.url);
 const typeFilter = searchParams.get("type");
 const seed = searchParams.get("seed");

 const where: { tenantId?: string | null; type?: string; OR?: Array<{ tenantId: string | null }> } = {};
 // قالب‌های عمومی (tenantId=null) + قالب‌های این tenant
 where.OR = [{ tenantId: null }, { tenantId }];
 if (typeFilter) where.type = typeFilter;

 let templates = await db.emailTemplate.findMany({ where });

 // اگر هیچ قالبی وجود ندارد و seed=1، قالب‌های پیش‌فرض را ایجاد کن
 if (templates.length === 0 && seed === "1") {
 await db.emailTemplate.createMany({
 data: DEFAULT_TEMPLATES.map((t) => ({...t, tenantId })),
 });
 templates = await db.emailTemplate.findMany({ where });
 }

 return NextResponse.json({
 success: true,
 data: templates.map((t) => ({
...t,
 variables: t.variables,
 })),
 });
 } catch (error) {
 console.error("Email templates list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت قالب‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/email-templates — ایجاد قالب جدید
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const body = await req.json();
 const { name, type, subject, body: tplBody, variables } = body as {
 name: string;
 type: string;
 subject: string;
 body: string;
 variables?: string[];
 };

 if (!name ||!type ||!subject ||!tplBody) {
 return NextResponse.json(
 { success: false, error: "نام، نوع، موضوع و متن قالب الزامی است" },
 { status: 400 }
 );
 }

 const template = await db.emailTemplate.create({
 data: {
 tenantId,
 name,
 type,
 subject,
 body: tplBody,
 variables: JSON.stringify(variables?? extractVariables(tplBody)),
 },
 });

 return NextResponse.json({ success: true, data: template });
 } catch (error) {
 console.error("Email template create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد قالب" },
 { status: 500 }
 );
 }
}

// PATCH /api/email-templates — به‌روزرسانی قالب
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
export async function PATCH(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const body = await req.json();
 const { id, name, type, subject, body: tplBody, variables, isActive } = body as {
 id: string;
 name?: string;
 type?: string;
 subject?: string;
 body?: string;
 variables?: string[];
 isActive?: boolean;
 };

 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه قالب الزامی است" },
 { status: 400 }
 );
 }

 // SECURITY: فقط قالب متعلق به tenant کاربر قابل ویرایش است (قالب‌های عمومی را نمی‌توان ویرایش کرد)
 const existing = await db.emailTemplate.findFirst({
 where: { id, tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }

 const updated = await db.emailTemplate.update({
 where: { id },
 data: {
...(name!== undefined? { name }: {}),
...(type!== undefined? { type }: {}),
...(subject!== undefined? { subject }: {}),
...(body!== undefined
? {
 body,
 variables: variables
? JSON.stringify(variables)
: JSON.stringify(extractVariables(body)),
 }
: {}),
...(variables!== undefined
? { variables: JSON.stringify(variables) }
: {}),
...(isActive!== undefined? { isActive }: {}),
 },
 });

 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("Email template update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی قالب" },
 { status: 500 }
 );
 }
}

// DELETE /api/email-templates
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه قالب الزامی است" },
 { status: 400 }
 );
 }
 // SECURITY: فقط قالب متعلق به tenant کاربر قابل حذف است
 const result = await db.emailTemplate.deleteMany({
 where: { id, tenantId },
 });
 if (result.count === 0) {
 return NextResponse.json(
 { success: false, error: "قالب یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Email template delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف قالب" },
 { status: 500 }
 );
 }
}

/** استخراج متغیرهای {{...}} از متن قالب */
function extractVariables(body: string): string[] {
 const matches = body.match(/\{\{(\w+)\}\}/g);
 if (!matches) return [];
 return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ""))));
}
