// قالب‌های آماده‌ی گردش کار - هوش
// بازارچه‌ی قالب‌های آماده برای نصب با یک کلیک

export interface WorkflowTemplateAction {
 type: "email" | "sms" | "notification";
 template?: string;
 recipient?: string;
 message?: string;
}

export interface WorkflowTemplateCondition {
 field: string;
 operator: string;
 value: string;
}

export interface WorkflowTemplate {
 id: string;
 name: string;
 description?: string;
 trigger: string;
 conditions?: WorkflowTemplateCondition[];
 actions: WorkflowTemplateAction[];
 category: string; // فروش | انبار | CRM | مالی | سیستم
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
 {
 id: "invoice-overdue-sms",
 name: "هشدار فاکتور سررسید شده",
 description: "ارسال پیامک به مشتری وقتی فاکتور سررسید می‌شود",
 trigger: "INVOICE_OVERDUE",
 actions: [{ type: "sms", template: "check_due" }],
 category: "فروش",
 },
 {
 id: "low-stock-alert",
 name: "هشدار کسری موجودی",
 description: "اعلان درون‌سیستمی هنگام کاهش موجودی کالا",
 trigger: "LOW_STOCK",
 conditions: [{ field: "stockLevel", operator: "lt", value: "5" }],
 actions: [{ type: "notification", message: "موجودی کالا به زیر حد مجاز رسیده است" }],
 category: "انبار",
 },
 {
 id: "welcome-email",
 name: "ایمیل خوش‌آمدگویی",
 description: "ارسال ایمیل خوش‌آمدگویی به کاربران جدید",
 trigger: "USER_SIGNUP",
 actions: [{ type: "email", template: "WELCOME" }],
 category: "CRM",
 },
 {
 id: "payment-thankyou",
 name: "تشکر پرداخت",
 description: "ارسال ایمیل تشکر پس از دریافت پرداخت",
 trigger: "PAYMENT_RECEIVED",
 actions: [{ type: "email", template: "PAYMENT_RECEIVED" }],
 category: "فروش",
 },
 {
 id: "trial-ending",
 name: "پایان تریال",
 description: "یادآوری پایان تریال ۳ روز قبل از انقضا",
 trigger: "DAILY",
 conditions: [{ field: "daysRemaining", operator: "lt", value: "3" }],
 actions: [{ type: "email", template: "TRIAL_ENDING" }],
 category: "سیستم",
 },
 {
 id: "check-due-reminder",
 name: "یادآوری سررسید چک",
 description: "ارسال پیامک و اعلان هنگام سررسید چک",
 trigger: "CHECK_DUE",
 actions: [{ type: "sms" }, { type: "notification", message: "چک سررسید شده است" }],
 category: "مالی",
 },
];

export function getWorkflowTemplate(
 id: string
): WorkflowTemplate | undefined {
 return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
