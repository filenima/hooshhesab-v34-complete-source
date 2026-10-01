import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// قالب‌های از پیش تعریف‌شده
const TEMPLATE_WORKFLOWS = [
 {
 name: "هشدار سررسید چک پرداختی",
 trigger: "CHECK_DUE",
 conditions: JSON.stringify([
 { field: "daysUntilDue", operator: "lte", value: 3 },
 ]),
 actions: JSON.stringify([
 {
 type: "sms",
 template: "CHECK_DUE",
 recipient: "{{partyMobile}}",
 },
 {
 type: "notification",
 message: "چک پرداختی نزدیک سررسید است",
 },
 ]),
 },
 {
 name: "هشدار کسری موجودی کالا",
 trigger: "LOW_STOCK",
 conditions: JSON.stringify([
 { field: "stockLevel", operator: "lte", value: 5 },
 ]),
 actions: JSON.stringify([
 {
 type: "notification",
 message: "موجودی کالا به حداقل رسیده است",
 },
 ]),
 },
 {
 name: "تشکر از پرداخت",
 trigger: "PAYMENT_RECEIVED",
 conditions: JSON.stringify([]),
 actions: JSON.stringify([
 {
 type: "email",
 template: "PAYMENT_RECEIVED",
 recipient: "{{customerEmail}}",
 },
 ]),
 },
 {
 name: "فاکتور سررسید گذشته",
 trigger: "INVOICE_OVERDUE",
 conditions: JSON.stringify([
 { field: "daysOverdue", operator: "gte", value: 7 },
 ]),
 actions: JSON.stringify([
 {
 type: "sms",
 template: "INVOICE_OVERDUE",
 recipient: "{{partyMobile}}",
 },
 ]),
 },
];

// GET /api/workflows — فهرست گردش‌کارها
// SECURITY (C1): احراز هویت اجبانی + فیلتر tenant
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
 const workflows = await db.workflow.findMany({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 });

 // اگر هیچ گردش‌کاری وجود ندارد، قالب‌ها را seed کن
 if (workflows.length === 0) {
 await db.workflow.createMany({
 data: TEMPLATE_WORKFLOWS.map((t) => ({...t, tenantId })),
 });
 const seeded = await db.workflow.findMany({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 });
 return NextResponse.json({ success: true, data: seeded });
 }

 return NextResponse.json({ success: true, data: workflows });
 } catch (error) {
 console.error("Workflows list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گردش‌کارها" },
 { status: 500 }
 );
 }
}

// POST /api/workflows — ایجاد گردش کار جدید
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
 const { name, trigger, conditions, actions, isActive = true } = body as {
 name: string;
 trigger: string;
 conditions: { field: string; operator: string; value: string | number }[];
 actions: { type: string; template?: string; recipient?: string; message?: string }[];
 isActive?: boolean;
 };

 if (!name ||!trigger) {
 return NextResponse.json(
 { success: false, error: "نام و تریگر الزامی است" },
 { status: 400 }
 );
 }

 const workflow = await db.workflow.create({
 data: {
 tenantId,
 name,
 trigger,
 conditions: JSON.stringify(conditions?? []),
 actions: JSON.stringify(actions?? []),
 isActive,
 },
 });

 return NextResponse.json({ success: true, data: workflow });
 } catch (error) {
 console.error("Workflow create error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد گردش کار" },
 { status: 500 }
 );
 }
}

// PATCH /api/workflows — به‌روزرسانی وضعیت فعال/غیرفعال
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
 const { id, isActive } = body as { id: string; isActive?: boolean };

 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }

 // SECURITY: فقط workflow متعلق به tenant کاربر قابل ویرایش است
 const existing = await db.workflow.findFirst({
 where: { id, tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "گردش کار یافت نشد" },
 { status: 404 }
 );
 }

 const updated = await db.workflow.update({
 where: { id },
 data: {...(isActive!== undefined? { isActive }: {}) },
 });

 return NextResponse.json({ success: true, data: updated });
 } catch (error) {
 console.error("Workflow update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی" },
 { status: 500 }
 );
 }
}
