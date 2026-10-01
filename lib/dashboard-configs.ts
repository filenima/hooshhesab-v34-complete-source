// ============ Role-based Dashboard Configurations ============
// هر نقش کاربری چیدمان پیش‌فرض خود را دارد.
// کاربر می‌تواند چیدمان را شخصی‌سازی کند — در localStorage با پیشوند نقش ذخیره می‌شود.

export type DashboardWidgetType =
 | "kpi_summary"
 | "cash_flow_chart"
 | "recent_invoices"
 | "due_checks"
 | "ai_insight"
 | "alerts"
 | "quick_actions"
 | "journal_entries"
 | "trial_balance"
 | "tax_summary"
 | "sales_chart"
 | "top_products"
 | "top_customers"
 | "health_score"
 | "profit_champion";

export type DashboardLayout = "1-column" | "2-column" | "3-column";

export interface RoleDashboardConfig {
 widgets: DashboardWidgetType[];
 layout: DashboardLayout;
}

export const ROLE_DASHBOARDS: Record<string, RoleDashboardConfig> = {
 ADMIN: {
 widgets: [
 "kpi_summary",
 "health_score",
 "cash_flow_chart",
 "recent_invoices",
 "due_checks",
 "profit_champion",
 "ai_insight",
 "alerts",
 "quick_actions",
 ],
 layout: "2-column",
 },
 ACCOUNTANT: {
 widgets: [
 "kpi_summary",
 "journal_entries",
 "trial_balance",
 "tax_summary",
 "due_checks",
 "alerts",
 ],
 layout: "2-column",
 },
 MANAGER: {
 widgets: [
 "kpi_summary",
 "sales_chart",
 "top_products",
 "profit_champion",
 "top_customers",
 "alerts",
 "quick_actions",
 ],
 layout: "2-column",
 },
 USER: {
 widgets: ["recent_invoices", "quick_actions", "alerts"],
 layout: "1-column",
 },
};

export const DEFAULT_ROLE = "USER";

export function getRoleDashboard(role: string | undefined | null): RoleDashboardConfig {
 if (!role) return ROLE_DASHBOARDS[DEFAULT_ROLE];
 return ROLE_DASHBOARDS[role]?? ROLE_DASHBOARDS[DEFAULT_ROLE];
}

/**
 * نام کلید localStorage برای چیدمان شخصی‌سازی‌شده کاربر.
 * شامل نقش به‌عنوان پیشوند تا با تغییر نقش، چیدمان پیش‌فرض جدید بارگذاری شود.
 */
export function getDashboardStorageKey(role: string | undefined | null): string {
 const r = role && ROLE_DASHBOARDS[role]? role: DEFAULT_ROLE;
 return `hoshhesab_dashboard_layout_${r}`;
}
