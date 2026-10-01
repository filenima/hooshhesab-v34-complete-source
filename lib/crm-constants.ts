/**
 * lib/crm-constants.ts
 * ثابت‌های مشترک CRM — برای استفاده در API routes و کامپوننت‌ها
 */

export const PIPELINE_STAGES = [
 { id: "PROSPECT", label: "پیش‌بینی", color: "bg-muted/60", accent: "text-muted-foreground" },
 { id: "CONTACTED", label: "تماس گرفته‌شده", color: "bg-blue-500/10", accent: "text-blue-600 dark:text-blue-400" },
 { id: "NEGOTIATION", label: "مذاکره", color: "bg-amber-500/10", accent: "text-amber-600 dark:text-amber-400" },
 { id: "PROPOSAL", label: "پیشنهاد", color: "bg-purple-500/10", accent: "text-purple-600 dark:text-purple-400" },
 { id: "CLOSED", label: "بسته‌شده", color: "bg-emerald-500/10", accent: "text-emerald-600 dark:text-emerald-400" },
 { id: "LOST", label: "باخته", color: "bg-rose-500/10", accent: "text-rose-600 dark:text-rose-400" },
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]["id"];

export const ACTIVITY_TYPES = [
 { id: "CALL", label: "تماس", icon: "Phone" },
 { id: "EMAIL", label: "ایمیل", icon: "Mail" },
 { id: "MEETING", label: "جلسه", icon: "Users" },
 { id: "NOTE", label: "یادداشت", icon: "StickyNote" },
 { id: "TASK", label: "وظیفه", icon: "CheckSquare" },
 { id: "VISIT", label: "ویزیت", icon: "MapPin" },
] as const;

export const LIFECYCLE_STAGES = [
 { id: "lead", label: "سرنخ" },
 { id: "customer", label: "مشتری" },
 { id: "loyal", label: "وفادار" },
 { id: "churned", label: "از دست رفته" },
] as const;
