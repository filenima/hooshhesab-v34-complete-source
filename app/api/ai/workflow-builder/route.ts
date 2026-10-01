// /api/ai/workflow-builder — ساخت گردش کار با هوش مصنوعی
// هوش — AI Workflow Builder
// ----------------------------------------------------------------------------
// این اندپوینت یک توصیف زبان طبیعی از کاربر می‌گیرد، با استفاده از LLM یک
// گردش کار (workflow) تولید می‌کند (JSON با trigger, conditions, actions) و در
// صورت درخواست آن را در دیتابیس ذخیره می‌کند.
// ----------------------------------------------------------------------------
// مثال:
// "هر زمان فاکتور ثبت شد و مبلغش بالای ۱۰۰ میلیون بود، به مدیر اطلاع بده"
// "هر روز ساعت ۹ صبح گزارش فروش دیروز را ایمیل کن"
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DESCRIPTION_LENGTH = 500;
const VALID_TRIGGERS = [
 "INVOICE_CREATED",
 "INVOICE_OVERDUE",
 "INVOICE_PAID",
 "CHECK_DUE",
 "LOW_STOCK",
 "PAYMENT_RECEIVED",
 "EXPENSE_CREATED",
 "PARTY_CREATED",
 "DAILY",
 "WEEKLY",
 "MONTHLY",
 "MANUAL",
];

const VALID_ACTION_TYPES = ["notification", "email", "sms", "webhook", "create_task", "tag"];

// ============ Workflow JSON types ============
interface WorkflowCondition {
 field: string;
 operator: "gt" | "lt" | "eq" | "ne" | "contains" | "in" | "gte" | "lte";
 value: string | number | boolean;
}

interface WorkflowAction {
 type: (typeof VALID_ACTION_TYPES)[number];
 template?: string;
 recipient?: string;
 message?: string;
 url?: string;
 payload?: Record<string, unknown>;
}

interface WorkflowDefinition {
 name: string;
 description: string;
 trigger: (typeof VALID_TRIGGERS)[number];
 triggerDescription?: string;
 conditions: WorkflowCondition[];
 actions: WorkflowAction[];
 isActive: boolean;
}

// ============ LLM prompt ============
const WORKFLOW_SYSTEM_PROMPT = `تو یک متخصص اتوماسیون گردش کار در نرم‌افزار حسابداری هوش هستی.

کاربر با زبان طبیعی فارسی یک گردش کار (workflow) را توصیف می‌کند و تو باید آن را به یک JSON ساختاریافته تبدیل کنی.

ساختار JSON مورد نظر:
{
 "name": "نام کوتاه گردش کار (فارسی)",
 "description": "توضیح کامل فارسی",
 "trigger": "نوع trigger — یکی از مقادیر زیر",
 "triggerDescription": "توضیح فارسی زمان وقوع",
 "conditions": [
 { "field": "نام فیلد", "operator": "gt|lt|eq|ne|contains|in|gte|lte", "value": "مقدار" }
 ],
 "actions": [
 {
 "type": "notification|email|sms|webhook|create_task|tag",
 "template": "قالب پیام فارسی با {{متغیر}}",
 "recipient": "آدرس ایمیل/شماره موبایل در صورت وجود",
 "message": "متن پیام فارسی",
 "url": "URL در صورت نیاز"
 }
 ],
 "isActive": true
}

Triggerهای معتبر:
- INVOICE_CREATED (هنگام ثبت فاکتور)
- INVOICE_OVERDUE (فاکتور سررسید شده)
- INVOICE_PAID (فاکتور پرداخت شد)
- CHECK_DUE (سررسید چک)
- LOW_STOCK (موجودی کم محصول)
- PAYMENT_RECEIVED (دریافت پرداخت)
- EXPENSE_CREATED (ثبت هزینه)
- PARTY_CREATED (افزودن طرف‌حساب)
- DAILY (روزانه)
- WEEKLY (هفتگی)
- MONTHLY (ماهانه)
- MANUAL (دستی)

فیلدهای موجود برای conditions:
- invoice.total (مبلغ فاکتور به تومان)
- invoice.type (SALE/PURCHASE)
- invoice.status (DRAFT/SENT/PAID/PARTIAL/OVERDUE)
- invoice.partyName (نام طرف‌حساب)
- check.amount (مبلغ چک)
- check.type (RECEIVED/ISSUED)
- product.stock (موجودی محصول)
- product.name (نام محصول)
- expense.amount (مبلغ هزینه)
- expense.category (دسته‌بندی هزینه)

قواعد:
۱) فقط JSON معتبر برگردان — بدون متن اضافه قبل یا بعد.
۲) نام و توضیح به فارسی روان.
۳) در صورت نیاز به action با پیام، از {{متغیر}} در قالب استفاده کن.
۴) اگر توصیف مبهم بود، trigger مناسب حدس بزن و توضیح بده.
۵) حداقل یک action قرار بده.
۶) isActive را true بگذار مگر اینکه کاربر خلاف آن گفت.

پاسخ فقط به‌صورت JSON معتبر باشد. از بلاک markdown \`\`\`json استفاده نکن — فقط JSON خام.`;

// ============ Parse JSON from LLM response ============
function parseWorkflowJson(raw: string): WorkflowDefinition | null {
 try {
 // حذف بلاک‌های markdown اگر بود
 let cleaned = raw.trim();
 if (cleaned.startsWith("```")) {
 // remove first line
 cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
 }
 // پیدا کردن اولین { و آخرین }
 const start = cleaned.indexOf("{");
 const end = cleaned.lastIndexOf("}");
 if (start === -1 || end === -1 || end <= start) return null;
 const jsonStr = cleaned.slice(start, end + 1);
 const parsed = JSON.parse(jsonStr);
 // اعتبارسنجی حداقلی
 if (!parsed || typeof parsed!== "object") return null;
 if (!parsed.name ||!parsed.trigger) return null;
 if (!Array.isArray(parsed.conditions)) parsed.conditions = [];
 if (!Array.isArray(parsed.actions)) parsed.actions = [];
 if (typeof parsed.isActive!== "boolean") parsed.isActive = true;
 return parsed as WorkflowDefinition;
 } catch {
 return null;
 }
}

// ============ Fallback rule-based workflow ============
function fallbackWorkflow(description: string): WorkflowDefinition {
 const d = description.toLowerCase();
 // اگر کلمه‌ی کلیدی مشخص داشت — یک workflow پیش‌فرض بساز
 if (d.includes("فاکتور") && (d.includes("بالا") || d.includes("مilian") || d.includes("میلیون"))) {
 // استخراج عدد از توضیح
 const amountMatch = d.match(/(\d[\d٬,]*)\s*(میلیون|میلیارد|هزار)?/);
 let amount = 100_000_000; // default 100 million
 if (amountMatch) {
 const raw = Number(amountMatch[1].replace(/[٬,]/g, ""));
 const unit = amountMatch[2] || "";
 if (unit === "میلیون") amount = raw * 1_000_000;
 else if (unit === "میلیارد") amount = raw * 1_000_000_000;
 else if (unit === "هزار") amount = raw * 1_000;
 else amount = raw;
 }
 return {
 name: "هشدار فاکتور بزرگ",
 description: `هنگام ثبت فاکتور فروش با مبلغ بالای ${amount.toLocaleString("en-US")} تومان، اعلان به مدیر ارسال شود.`,
 trigger: "INVOICE_CREATED",
 triggerDescription: "هنگام ثبت فاکتور فروش جدید",
 conditions: [
 { field: "invoice.total", operator: "gt", value: String(amount) },
 { field: "invoice.type", operator: "eq", value: "SALE" },
 ],
 actions: [
 {
 type: "notification",
 template: "فاکتور فروش {{invoice.number}} به مبلغ {{invoice.total}} تومان برای {{invoice.partyName}} ثبت شد.",
 message: "فاکتور فروش بزرگ ثبت شد — لطفاً بررسی کنید.",
 },
 ],
 isActive: true,
 };
 }
 if (d.includes("گزارش") && (d.includes("روزانه") || d.includes("هر روز") || d.includes("daily"))) {
 return {
 name: "گزارش روزانه فروش",
 description: "هر روز ساعت ۹ صبح، گزارش فروش روز قبل به مدیر ایمیل شود.",
 trigger: "DAILY",
 triggerDescription: "هر روز ساعت ۹:۰۰ صبح",
 conditions: [
 { field: "time", operator: "eq", value: "09:00" },
 ],
 actions: [
 {
 type: "email",
 template: "گزارش فروش روز {{date}}: {{summary}}",
 message: "گزارش روزانه فروش",
 },
 ],
 isActive: true,
 };
 }
 if (d.includes("سررسید") || d.includes("چک") || d.includes("overdue")) {
 return {
 name: "هشدار سررسید",
 description: "هنگام سررسید شدن فاکتور یا چک، اعلان هشدار ارسال شود.",
 trigger: "INVOICE_OVERDUE",
 triggerDescription: "هنگام عبور از تاریخ سررسید",
 conditions: [],
 actions: [
 {
 type: "notification",
 template: "سند {{entity.number}} به مبلغ {{entity.amount}} تومان سررسید شده است.",
 message: "هشدار سررسید",
 },
 ],
 isActive: true,
 };
 }
 if (d.includes("موجودی") || d.includes("کم") || d.includes("stock")) {
 return {
 name: "هشدار موجودی کم",
 description: "هنگام کاهش موجودی محصول به زیر حداقل، اعلان ارسال شود.",
 trigger: "LOW_STOCK",
 triggerDescription: "هنگام رسیدن موجودی به زیر حداقل مجاز",
 conditions: [],
 actions: [
 {
 type: "notification",
 template: "موجودی محصول {{product.name}} به {{product.stock}} {{product.unit}} کاهش یافت.",
 message: "موجودی محصول کم است",
 },
 ],
 isActive: true,
 };
 }
 // generic — manual trigger
 return {
 name: "گردش کار سفارشی",
 description: `گردش کار بر اساس: ${description}`,
 trigger: "MANUAL",
 triggerDescription: "دستی — توسط کاربر فعال می‌شود",
 conditions: [],
 actions: [
 {
 type: "notification",
 template: "گردش کار اجرا شد: {{description}}",
 message: "گردش کار اجرا شد",
 },
 ],
 isActive: true,
 };
}

// ============ Endpoint ============
export async function POST(req: NextRequest) {
 try {
 const authCtx = await getAuthContext(req);
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 const rateKey = `wf-build:${authCtx.tenantId}:${authCtx.userId?? ip}`;
 if (!rateLimit(rateKey, 6, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست ساخت گردش کار پر شده است." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { description, save } = body as {
 description?: string;
 save?: boolean;
 };

 if (!description || typeof description!== "string" || description.trim().length === 0) {
 return NextResponse.json(
 { success: false, error: "توضیح گردش کار الزامی است" },
 { status: 400 }
 );
 }
 if (description.length > MAX_DESCRIPTION_LENGTH) {
 return NextResponse.json(
 { success: false, error: `حداکثر طول توضیح ${MAX_DESCRIPTION_LENGTH} کاراکتر است` },
 { status: 400 }
 );
 }

 let workflow: WorkflowDefinition | null = null;
 let usedFallback = false;
 let llmError: string | null = null;

 // 1) تلاش برای استفاده از LLM
 try {
 const zai = await ZAI.create();
 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: WORKFLOW_SYSTEM_PROMPT },
 { role: "user", content: `توضیح کاربر: ${description}` },
 ],
 thinking: { type: "disabled" },
 });
 const raw = completion?.choices?.[0]?.message?.content?? "";
 workflow = parseWorkflowJson(raw);
 if (!workflow) {
 usedFallback = true;
 llmError = "LLM پاسخ JSON معتبر نداد";
 } else {
 // اعتبارسنجی و نرمال‌سازی trigger
 if (!VALID_TRIGGERS.includes(workflow.trigger)) {
 workflow.trigger = "MANUAL";
 }
 // اعتبارسنجی actions
 workflow.actions = workflow.actions
.filter((a) => a && a.type && VALID_ACTION_TYPES.includes(a.type))
.slice(0, 5);
 if (workflow.actions.length === 0) {
 workflow.actions = [
 {
 type: "notification",
 template: "گردش کار اجرا شد",
 message: "گردش کار اجرا شد",
 },
 ];
 }
 }
 } catch (err) {
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 console.error("Workflow builder LLM error:", msg);
 const isConfigError = msg.includes("missing X-Token header") || msg.includes("Configuration file not found");
 llmError = isConfigError? "سرویس مدل زبانی در دسترس نیست": msg;
 usedFallback = true;
 }

 // 2) در صورت شکست LLM — fallback rule-based
 if (!workflow) {
 workflow = fallbackWorkflow(description);
 usedFallback = true;
 }

 // 3) ذخیره در دیتابیس (در صورت درخواست)
 let savedWorkflowId: string | null = null;
 if (save && workflow) {
 try {
 const saved = await db.workflow.create({
 data: {
 tenantId: authCtx.tenantId,
 name: workflow.name,
 trigger: workflow.trigger,
 conditions: JSON.stringify(workflow.conditions),
 actions: JSON.stringify(workflow.actions),
 isActive: workflow.isActive,
 },
 });
 savedWorkflowId = saved.id;

 await auditLog({
 tenantId: authCtx.tenantId,
 userId: authCtx.userId,
 action: "AI_WORKFLOW_CREATE",
 entity: "workflow",
 entityId: saved.id,
 changes: {
 name: workflow.name,
 trigger: workflow.trigger,
 description: workflow.description,
 usedFallback,
 },
 req,
 });
 } catch (dbErr) {
 console.error("Workflow save error:", dbErr);
 }
 }

 return NextResponse.json({
 success: true,
 workflow,
 savedWorkflowId,
 usedFallback,
 llmError,
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Workflow builder error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در ساخت گردش کار. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}

// GET — list saved workflows
export async function GET(req: NextRequest) {
 try {
 const authCtx = await getAuthContext(req);
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const workflows = await db.workflow.findMany({
 where: { tenantId: authCtx.tenantId },
 orderBy: { createdAt: "desc" },
 take: 50,
 select: {
 id: true,
 name: true,
 trigger: true,
 conditions: true,
 actions: true,
 isActive: true,
 lastFired: true,
 firedCount: true,
 createdAt: true,
 updatedAt: true,
 },
 });

 return NextResponse.json({
 success: true,
 workflows: workflows.map((w) => ({
...w,
 conditions: (() => { try { return JSON.parse(w.conditions); } catch { return []; } })(),
 actions: (() => { try { return JSON.parse(w.actions); } catch { return []; } })(),
 })),
 count: workflows.length,
 validTriggers: VALID_TRIGGERS,
 validActionTypes: VALID_ACTION_TYPES,
 });
 } catch (error: unknown) {
 console.error("Workflow list error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گردش کارها" },
 { status: 500 }
 );
 }
}

// PATCH — toggle active / update workflow
export async function PATCH(req: NextRequest) {
 try {
 const authCtx = await getAuthContext(req);
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const body = await req.json();
 const { id, isActive, name, conditions, actions } = body as {
 id?: string;
 isActive?: boolean;
 name?: string;
 conditions?: WorkflowCondition[];
 actions?: WorkflowAction[];
 };

 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه گردش کار الزامی است" },
 { status: 400 }
 );
 }

 // Check ownership
 const existing = await db.workflow.findFirst({
 where: { id, tenantId: authCtx.tenantId },
 select: { id: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "گردش کار یافت نشد" },
 { status: 404 }
 );
 }

 const updateData: {
 isActive?: boolean;
 name?: string;
 conditions?: string;
 actions?: string;
 } = {};
 if (typeof isActive === "boolean") updateData.isActive = isActive;
 if (name) updateData.name = name;
 if (Array.isArray(conditions)) updateData.conditions = JSON.stringify(conditions);
 if (Array.isArray(actions)) updateData.actions = JSON.stringify(actions);

 const updated = await db.workflow.update({
 where: { id },
 data: updateData,
 });

 await auditLog({
 tenantId: authCtx.tenantId,
 userId: authCtx.userId,
 action: "AI_WORKFLOW_UPDATE",
 entity: "workflow",
 entityId: id,
 changes: updateData,
 req,
 });

 return NextResponse.json({
 success: true,
 workflow: {
 id: updated.id,
 name: updated.name,
 trigger: updated.trigger,
 conditions: (() => { try { return JSON.parse(updated.conditions); } catch { return []; } })(),
 actions: (() => { try { return JSON.parse(updated.actions); } catch { return []; } })(),
 isActive: updated.isActive,
 firedCount: updated.firedCount,
 },
 });
 } catch (error: unknown) {
 console.error("Workflow update error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در به‌روزرسانی گردش کار" },
 { status: 500 }
 );
 }
}

// DELETE — remove workflow
export async function DELETE(req: NextRequest) {
 try {
 const authCtx = await getAuthContext(req);
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه گردش کار الزامی است" },
 { status: 400 }
 );
 }

 // Check ownership
 const existing = await db.workflow.findFirst({
 where: { id, tenantId: authCtx.tenantId },
 select: { id: true, name: true },
 });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "گردش کار یافت نشد" },
 { status: 404 }
 );
 }

 await db.workflow.delete({ where: { id } });

 await auditLog({
 tenantId: authCtx.tenantId,
 userId: authCtx.userId,
 action: "AI_WORKFLOW_DELETE",
 entity: "workflow",
 entityId: id,
 changes: { name: existing.name },
 req,
 });

 return NextResponse.json({ success: true });
 } catch (error: unknown) {
 console.error("Workflow delete error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف گردش کار" },
 { status: 500 }
 );
 }
}
