// موتور اتوماسیون گردش کار - هوش
// ارزیابی شرط‌ها و اجرای اکشن‌های مرتبط با رویدادهای سیستم

import { db } from "@/lib/db";

export interface WorkflowCondition {
 field: string;
 operator: "equals" | "not_equals" | "gt" | "lt" | "gte" | "lte" | "contains";
 value: string | number;
}

export interface WorkflowAction {
 type: "email" | "sms" | "notification";
 template?: string;
 recipient?: string;
 message?: string;
}

export interface WorkflowShape {
 id: string;
 tenantId: string;
 name: string;
 trigger: string;
 conditions: string; // JSON
 actions: string; // JSON
 isActive: boolean;
 lastFired: Date | null;
 firedCount: number;
}

/** ارزیابی یک شرط واحد در برابر context */
function evalCondition(
 cond: WorkflowCondition,
 context: Record<string, unknown>
): boolean {
 const value = context[cond.field];
 if (value === undefined) return false;
 const actual = typeof value === "number"? value: String(value);
 const expected =
 typeof cond.value === "number"
? cond.value
: Number.isFinite(Number(cond.value))
? Number(cond.value)
: cond.value;

 switch (cond.operator) {
 case "equals":
 return String(actual) === String(expected);
 case "not_equals":
 return String(actual)!== String(expected);
 case "gt":
 return Number(actual) > Number(expected);
 case "lt":
 return Number(actual) < Number(expected);
 case "gte":
 return Number(actual) >= Number(expected);
 case "lte":
 return Number(actual) <= Number(expected);
 case "contains":
 return String(actual).includes(String(cond.value));
 default:
 return false;
 }
}

/** ارزیابی کل گردش کار */
export async function evaluateWorkflow(
 workflow: WorkflowShape,
 context: Record<string, unknown>
): Promise<boolean> {
 try {
 const conditions: WorkflowCondition[] = JSON.parse(workflow.conditions);
 if (!Array.isArray(conditions) || conditions.length === 0) {
 return true; // بدون شرط همیشه اجرا شود
 }
 return conditions.every((c) => evalCondition(c, context));
 } catch {
 return false;
 }
}

/** اجرای اکشن‌های گردش کار (ثبت در Notification) */
export async function executeWorkflowActions(
 workflow: WorkflowShape,
 context: Record<string, unknown>
): Promise<void> {
 try {
 const actions: WorkflowAction[] = JSON.parse(workflow.actions);
 for (const action of actions) {
 if (action.type === "notification") {
 // ثبت در جدول Notification (که از قبل وجود دارد)
 await db.notification
.create({
 data: {
 tenantId: workflow.tenantId,
 title: `گردش کار: ${workflow.name}`,
 message:
 action.message??
 `رویداد ${workflow.trigger} رخ داد. ${JSON.stringify(context).slice(0, 200)}`,
 type: "INFO",
 isRead: false,
 },
 })
.catch(() => {
 // اگر Notification وجود نداشت، نادیده بگیر
 });
 }
 // برای email و sms — در حالت واقعی به سرویس ارسال متصل می‌شود
 // اینجا فقط در دیتابیس لاگ می‌اندازیم (mock)
 await db.auditLog
.create({
 data: {
 tenantId: workflow.tenantId,
 action: `WORKFLOW_${action.type.toUpperCase()}`,
 entity: "Workflow",
 entityId: workflow.id,
 changes: JSON.stringify({
 description: `ارسال ${action.type} با قالب ${action.template?? "default"} به ${action.recipient?? "default"}`,
 }),
 ipAddress: "127.0.0.1",
 },
 })
.catch(() => {
 // ignore
 });
 }
 } catch {
 // ignore parse errors
 }
}

/** بررسی همه گردش‌کارهای فعال برای یک رویداد */
export async function checkAllWorkflows(
 tenantId: string,
 event: string,
 context: Record<string, unknown>
): Promise<void> {
 try {
 const workflows = await db.workflow.findMany({
 where: {
 tenantId,
 trigger: event,
 isActive: true,
 },
 });
 for (const wf of workflows) {
 const shouldFire = await evaluateWorkflow(wf as unknown as WorkflowShape, context);
 if (shouldFire) {
 await executeWorkflowActions(wf as unknown as WorkflowShape, context);
 await db.workflow.update({
 where: { id: wf.id },
 data: {
 lastFired: new Date(),
 firedCount: { increment: 1 },
 },
 });
 }
 }
 } catch (error) {
 console.error("Workflow check error:", error);
 }
}
