import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { toPersianDigits } from "@/lib/persian";
import { getCachedInsights } from "@/lib/insight-generator";
import { predictJourney, getStageLabel } from "@/lib/journey-predictor";

// ============ AI-Powered Smart Dashboard ============
// داشبورد هوشمند که خودش تصمیم می‌گیرد چه ویجت‌هایی نمایش دهد بر اساس:
// - نقش کاربر (ADMIN, ACCOUNTANT, MANAGER, USER)
// - فعالیت اخیر
// - زمان روز (صبح: گزارش دیروز، عصر: پیش‌بینی فردا)
// - ناهنجاری‌های تشخیص‌داده‌شده
// - اولویت‌های کسب‌وکار

export type WidgetType =
 | "kpi_summary"
 | "sales_chart"
 | "expense_chart"
 | "cash_flow"
 | "recent_invoices"
 | "pending_checks"
 | "low_stock_alerts"
 | "churn_risks"
 | "anomaly_alerts"
 | "ai_insights"
 | "budget_status"
 | "customer_journey"
 | "forecast"
 | "ai_recommendations"
 | "quick_actions"
 | "tax_calendar"
 | "team_activity";

export interface SmartWidget {
 type: WidgetType;
 position: number;
 title: string;
 subtitle?: string;
 data: unknown;
 reasoning: string; // چرا این ویجت انتخاب شد
 priority: "high" | "medium" | "low";
}

export interface SmartDashboardResult {
 widgets: SmartWidget[];
 layout: "2-column" | "3-column";
 insights: string[];
 generatedAt: Date;
 // metadata
 userContext: {
 role: string;
 timeOfDay: "morning" | "afternoon" | "evening" | "night";
 activeModules: string[];
 };
}

// تابع اصلی: تولید داشبورد هوشمند
export async function generateSmartDashboard(
 tenantId: string,
 userId?: string,
 role: string = "USER"
): Promise<SmartDashboardResult> {
 // تشخیص زمان روز
 const hour = new Date().getHours();
 const timeOfDay: SmartDashboardResult["userContext"]["timeOfDay"] =
 hour >= 5 && hour < 12
? "morning"
: hour >= 12 && hour < 17
? "afternoon"
: hour >= 17 && hour < 21
? "evening"
: "night";

 // دریافت فعالیت‌های اخیر برای تشخیص ماژول‌های فعال
 const activeModules = await detectActiveModules(tenantId, userId);

 // دریافت بینش‌ها
 const insights = await getCachedInsights(tenantId).catch(() => []);

 // دریافت پیش‌بینی مسیر کاربر (اگر userId داده شده)
 let journeyPrediction: Awaited<ReturnType<typeof predictJourney>> | null = null;
 if (userId) {
 try {
 journeyPrediction = await predictJourney(userId);
 } catch {
 // ignore
 }
 }

 // جمع‌آوری کاندید ویجت‌ها
 const candidates: SmartWidget[] = [];

 // ۱) KPI خلاصه — همیشه
 candidates.push(await buildKpiSummaryWidget(tenantId, role, timeOfDay));

 // ۲) نمودار فروش — همیشه
 candidates.push(await buildSalesChartWidget(tenantId, timeOfDay));

 // ۳) ناهنجاری‌ها — اگر وجود دارد
 const anomalyWidget = await buildAnomalyAlertsWidget(tenantId, insights);
 if (anomalyWidget) candidates.push(anomalyWidget);

 // ۴) بینش‌های AI — اگر وجود دارد
 const aiInsightsWidget = await buildAiInsightsWidget(tenantId, insights);
 if (aiInsightsWidget) candidates.push(aiInsightsWidget);

 // ۵) چک‌های در انتظار — برای ADMIN/ACCOUNTANT
 if (role === "ADMIN" || role === "ACCOUNTANT") {
 candidates.push(await buildPendingChecksWidget(tenantId));
 }

 // ۶) هشدار موجودی — اگر انبار فعال است
 if (activeModules.includes("inventory")) {
 candidates.push(await buildLowStockAlertsWidget(tenantId));
 }

 // ۷) ریسک ریزش — برای ADMIN/MANAGER
 if (role === "ADMIN" || role === "MANAGER") {
 const churnWidget = await buildChurnRisksWidget(tenantId, insights);
 if (churnWidget) candidates.push(churnWidget);
 }

 // ۸) پیش‌بینی — در عصر/شب
 if (timeOfDay === "afternoon" || timeOfDay === "evening") {
 candidates.push(await buildForecastWidget(tenantId));
 }

 // ۹) وضعیت بودجه — اگر بودجه تعریف شده
 if (activeModules.includes("budget")) {
 candidates.push(await buildBudgetStatusWidget(tenantId));
 }

 // ۱۰) مسیر کاربر — اگر userId داده شده
 if (journeyPrediction) {
 candidates.push(buildCustomerJourneyWidget(journeyPrediction));
 }

 // ۱۱) توصیه‌های AI — همیشه
 const aiRecWidget = await buildAiRecommendationsWidget(tenantId, role, insights);
 if (aiRecWidget) candidates.push(aiRecWidget);

 // ۱۲) اقدامات سریع — همیشه
 candidates.push(buildQuickActionsWidget(role, timeOfDay));

 // ۱۳) تقویم مالیاتی — اگر نزدیک سررسید
 const taxWidget = await buildTaxCalendarWidget(tenantId);
 if (taxWidget) candidates.push(taxWidget);

 // ۱۴) فاکتورهای اخیر — همیشه
 candidates.push(await buildRecentInvoicesWidget(tenantId));

 // ۱۵) فعالیت تیم — برای ADMIN
 if (role === "ADMIN") {
 candidates.push(await buildTeamActivityWidget(tenantId));
 }

 // انتخاب و مرتب‌سازی ویجت‌ها
 const selectedWidgets = selectAndSortWidgets(candidates, role, timeOfDay);

 // تعیین layout
 const layout: SmartDashboardResult["layout"] =
 selectedWidgets.length > 8? "3-column": "2-column";

 // تولید insights خلاصه — بدون بلاک شدن روی LLM (پاسخ فوری + غنی‌سازی در پس‌زمینه)
 // FIX: قبلاً await روی LLM باعث می‌شد پاسخ dashboard تا ۴۰-۶۰ ثانیه معلق بماند.
 const fallbackInsights =
 insights.length > 0
? insights.slice(0, 3).map((i) => i.description)
: selectedWidgets.slice(0, 3).map((w) => `${w.title}: ${w.reasoning}`);

 // غنی‌سازی پس‌زمینه: LLM در background اجرا می‌شود و کش را به‌روز می‌کند
 const enrichmentKey = `${tenantId}:${userId || "anon"}:${role || "USER"}`;
 if (!pendingEnrichments.has(enrichmentKey)) {
 pendingEnrichments.add(enrichmentKey);
 void generateSummaryInsights(tenantId, role, insights, selectedWidgets)
.then((enriched) => {
 if (Array.isArray(enriched) && enriched.length > 0) {
 // کش فعلی را با insights غنی‌شده به‌روز کن (در صورت وجود)
 const existing = dashboardCache.get(enrichmentKey);
 if (existing && existing.expiresAt > Date.now()) {
 dashboardCache.set(enrichmentKey, {
...existing,
 dashboard: {
...existing.dashboard,
 insights: enriched,
 },
 });
 }
 }
 })
.catch(() => {
 /* fallback همین خوب است */
 })
.finally(() => {
 setTimeout(() => pendingEnrichments.delete(enrichmentKey), 120_000);
 });
 }

 const summaryInsights = fallbackInsights;

 return {
 widgets: selectedWidgets,
 layout,
 insights: summaryInsights,
 generatedAt: new Date(),
 userContext: {
 role,
 timeOfDay,
 activeModules,
 },
 };
}

// ============ Widget Builders ============

async function buildKpiSummaryWidget(
 tenantId: string,
 role: string,
 timeOfDay: string
): Promise<SmartWidget> {
 try {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

 const [sales, purchases, invoiceCount] = await Promise.all([
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: monthStart },
 },
 _sum: { total: true },
 _count: true,
 }),
 db.invoice.aggregate({
 where: {
 tenantId,
 type: "PURCHASE",
 deletedAt: null,
 date: { gte: monthStart },
 },
 _sum: { total: true },
 }),
 db.invoice.count({
 where: {
 tenantId,
 deletedAt: null,
 date: { gte: monthStart },
 },
 }),
 ]);

 return {
 type: "kpi_summary",
 position: 1,
 title: "خلاصه‌ی ماه جاری",
 subtitle: "نمای کلی عملکرد مالی",
 data: {
 totalSales: Number(sales._sum.total || 0),
 totalPurchases: Number(purchases._sum.total || 0),
 profit:
 Number(sales._sum.total || 0) - Number(purchases._sum.total || 0),
 invoiceCount,
 },
 reasoning: `نقش ${role} در ${timeOfDay} به خلاصه‌ی ماه نیاز دارد`,
 priority: "high",
 };
 } catch {
 return {
 type: "kpi_summary",
 position: 1,
 title: "خلاصه‌ی ماه جاری",
 data: { totalSales: 0, totalPurchases: 0, profit: 0, invoiceCount: 0 },
 reasoning: "خلاصه‌ی ماه همیشه نمایش داده می‌شود",
 priority: "high",
 };
 }
}

async function buildSalesChartWidget(
 tenantId: string,
 timeOfDay: string
): Promise<SmartWidget> {
 try {
 const sales = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
 },
 select: { date: true, total: true },
 orderBy: { date: "asc" },
 });

 const byDay = new Map<string, number>();
 for (const s of sales) {
 const day = s.date.toISOString().slice(0, 10);
 byDay.set(day, (byDay.get(day) || 0) + Number(s.total));
 }
 const chartData = Array.from(byDay.entries())
.map(([day, value]) => ({ date: day, value }))
.slice(-30);

 return {
 type: "sales_chart",
 position: 2,
 title: "روند فروش ۳۰ روز اخیر",
 subtitle: "مجموع فروش روزانه",
 data: chartData,
 reasoning: `نمودار فروش در ${timeOfDay} برای نظارت بر روند`,
 priority: "high",
 };
 } catch {
 return {
 type: "sales_chart",
 position: 2,
 title: "روند فروش ۳۰ روز اخیر",
 data: [],
 reasoning: "نمودار فروش همیشه نمایش داده می‌شود",
 priority: "high",
 };
 }
}

async function buildAnomalyAlertsWidget(
 _tenantId: string,
 insights: { category: string; severity: string; title: string; description: string }[]
): Promise<SmartWidget | null> {
 const anomalies = insights.filter((i) => i.category === "anomaly");
 if (anomalies.length === 0) return null;

 return {
 type: "anomaly_alerts",
 position: 3,
 title: "هشدارهای ناهنجاری",
 subtitle: `${toPersianDigits(anomalies.length)} مورد ناهنجاری تشخیص داده شد`,
 data: anomalies,
 reasoning: "ناهنجاری‌های تشخیص‌داده‌شده نیاز به توجه فوری دارند",
 priority: "high",
 };
}

async function buildAiInsightsWidget(
 _tenantId: string,
 insights: { category: string; title: string; description: string; recommendation?: string }[]
): Promise<SmartWidget | null> {
 if (insights.length === 0) return null;

 return {
 type: "ai_insights",
 position: 4,
 title: "بینش‌های هوشمند",
 subtitle: `${toPersianDigits(insights.length)} بینش تولید شد`,
 data: insights.slice(0, 5),
 reasoning: "بینش‌های خودکار برای کمک به تصمیم‌گیری",
 priority: "medium",
 };
}

async function buildPendingChecksWidget(tenantId: string): Promise<SmartWidget> {
 try {
 const checks = await db.check.findMany({
 where: {
 tenantId,
 status: { in: ["REGISTERED", "DEPOSITED"] },
 dueDate: {
 gte: new Date(),
 lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
 },
 },
 select: { id: true, number: true, amount: true, dueDate: true, type: true },
 orderBy: { dueDate: "asc" },
 take: 10,
 });

 return {
 type: "pending_checks",
 position: 5,
 title: "چک‌های سررسید ۱۴ روز آینده",
 subtitle: `${toPersianDigits(checks.length)} چک در انتظار`,
 data: checks.map((c) => ({
...c,
 amount: Number(c.amount),
 })),
 reasoning: "برای ADMIN/ACCOUNTANT اطلاع از چک‌های در انتظار ضروری است",
 priority: "high",
 };
 } catch {
 return {
 type: "pending_checks",
 position: 5,
 title: "چک‌های سررسید ۱۴ روز آینده",
 data: [],
 reasoning: "اطلاع از چک‌های در انتظار",
 priority: "medium",
 };
 }
}

async function buildLowStockAlertsWidget(tenantId: string): Promise<SmartWidget> {
 try {
 const lowStock = await db.stockItem.findMany({
 where: {
 tenantId,
 quantity: { lte: 0 },
 },
 include: { product: true },
 take: 10,
 });

 // همچنین مواردی که کمتر از minStock محصول هستند
 const belowMin = await db.stockItem.findMany({
 where: {
 tenantId,
 product: { minStock: { gt: 0 } },
 },
 include: { product: true },
 take: 50,
 });
 const filtered = belowMin.filter(
 (s) => s.product && s.quantity < (s.product.minStock || 0)
 );
 const combined = [...lowStock,...filtered].slice(0, 10);

 return {
 type: "low_stock_alerts",
 position: 6,
 title: "هشدار موجودی",
 subtitle: `${toPersianDigits(combined.length)} محصول با موجودی پایین`,
 data: combined.map((s) => ({
 productName: s.product?.name || "نامشخص",
 quantity: s.quantity,
 minStock: s.product?.minStock || 0,
 })),
 reasoning: "ماژول انبار فعال است — هشدار موجودی مهم",
 priority: combined.length > 0? "high": "low",
 };
 } catch {
 return {
 type: "low_stock_alerts",
 position: 6,
 title: "هشدار موجودی",
 data: [],
 reasoning: "ماژول انبار فعال است",
 priority: "low",
 };
 }
}

async function buildChurnRisksWidget(
 _tenantId: string,
 insights: { category: string; title: string; description: string }[]
): Promise<SmartWidget | null> {
 const churnRisks = insights.filter((i) => i.category === "churn_risk");
 if (churnRisks.length === 0) return null;

 return {
 type: "churn_risks",
 position: 7,
 title: "ریسک ریزش مشتری",
 subtitle: `${toPersianDigits(churnRisks.length)} مشتری در معرض ریزش`,
 data: churnRisks,
 reasoning: "برای ADMIN/MANAGER حفظ مشتری مهم است",
 priority: "high",
 };
}

async function buildForecastWidget(tenantId: string): Promise<SmartWidget> {
 try {
 // پیش‌بینی ساده: میانگین ۷ روز اخیر × ۷
 const sales = await db.invoice.findMany({
 where: {
 tenantId,
 type: "SALE",
 deletedAt: null,
 date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
 },
 select: { total: true },
 });
 const avgDaily =
 sales.length > 0
? sales.reduce((s, inv) => s + Number(inv.total), 0) / 7
: 0;
 const forecast7days = avgDaily * 7;

 return {
 type: "forecast",
 position: 8,
 title: "پیش‌بینی ۷ روز آینده",
 subtitle: `تقریب: ${toPersianDigits(Math.round(forecast7days / 10))} تومان`,
 data: {
 avgDaily,
 forecast7days,
 method: "میانگین متحرک ۷ روزه",
 },
 reasoning: "در عصر/شب، پیش‌بینی فردا مفید است",
 priority: "medium",
 };
 } catch {
 return {
 type: "forecast",
 position: 8,
 title: "پیش‌بینی ۷ روز آینده",
 data: { avgDaily: 0, forecast7days: 0, method: "میانگین متحرک" },
 reasoning: "پیش‌بینی برای برنامه‌ریزی",
 priority: "medium",
 };
 }
}

async function buildBudgetStatusWidget(tenantId: string): Promise<SmartWidget> {
 try {
 const budgets = await db.budget.findMany({
 where: { tenantId },
 select: {
 id: true,
 title: true,
 totalAmount: true,
 period: true,
 fiscalYear: true,
 status: true,
 },
 take: 5,
 });

 return {
 type: "budget_status",
 position: 9,
 title: "وضعیت بودجه",
 subtitle: `${toPersianDigits(budgets.length)} بودجه فعال`,
 data: budgets.map((b) => ({
 id: b.id,
 name: b.title,
 period: b.period,
 amount: Number(b.totalAmount),
 spent: 0, // محاسبه‌ی دقیق از BudgetItem
 utilization: 0,
 })),
 reasoning: "ماژول بودجه فعال است",
 priority: "medium",
 };
 } catch {
 return {
 type: "budget_status",
 position: 9,
 title: "وضعیت بودجه",
 data: [],
 reasoning: "وضعیت بودجه",
 priority: "low",
 };
 }
}

function buildCustomerJourneyWidget(prediction: {
 currentStage: string;
 predictedNextStage: string;
 probability: number;
 recommendedActions: string[];
 stageProgress: number;
 churnRisk: number;
}): SmartWidget {
 return {
 type: "customer_journey",
 position: 10,
 title: "مسیر کاربری شما",
 subtitle: `مرحله‌ی فعلی: ${getStageLabel(prediction.currentStage as never)}`,
 data: prediction,
 reasoning: "اطلاع کاربر از مرحله‌ی خود باعث افزایش درگیری می‌شود",
 priority: "medium",
 };
}

async function buildAiRecommendationsWidget(
 tenantId: string,
 role: string,
 insights: { recommendation?: string; title: string }[]
): Promise<SmartWidget | null> {
 const recommendations = insights
.filter((i) => i.recommendation)
.slice(0, 3)
.map((i) => ({ title: i.title, recommendation: i.recommendation }));

 if (recommendations.length === 0) {
 // تولید توصیه‌های پایه
 return {
 type: "ai_recommendations",
 position: 11,
 title: "توصیه‌های هوشمند",
 data: [
 {
 title: "بررسی فروش",
 recommendation: "گزارش فروش هفتگی را بررسی کنید",
 },
 {
 title: "پیگیری مشتریان",
 recommendation: "با مشتریانی که مدتی است خرید نکرده‌اند تماس بگیرید",
 },
 ],
 reasoning: `توصیه‌های پایه برای نقش ${role}`,
 priority: "low",
 };
 }

 return {
 type: "ai_recommendations",
 position: 11,
 title: "توصیه‌های هوشمند",
 data: recommendations,
 reasoning: "توصیه‌های تولیدشده بر اساس بینش‌ها",
 priority: "medium",
 };
}

function buildQuickActionsWidget(
 role: string,
 timeOfDay: string
): SmartWidget {
 const actions: { label: string; action: string; icon?: string }[] = [
 { label: "فاکتور جدید", action: "new-invoice", icon: "plus" },
 { label: "گزارش امروز", action: "report-today", icon: "file" },
 ];

 if (role === "ADMIN") {
 actions.push({ label: "مدیریت کاربران", action: "users", icon: "users" });
 }
 if (timeOfDay === "morning") {
 actions.push({ label: "چک‌های امروز", action: "checks-today", icon: "check" });
 }

 return {
 type: "quick_actions",
 position: 12,
 title: "اقدامات سریع",
 data: actions,
 reasoning: `اقدامات سریع برای نقش ${role} در ${timeOfDay}`,
 priority: "medium",
 };
}

async function buildTaxCalendarWidget(
 _tenantId: string
): Promise<SmartWidget | null> {
 // بررسی نزدیک بودن به سررسید مالیاتی (۱۵ هر ماه)
 const now = new Date();
 const day = now.getDate();
 if (day >= 10 && day <= 20) {
 return {
 type: "tax_calendar",
 position: 13,
 title: "یادآوری مالیاتی",
 subtitle: "سررسید گزارش ارزش افزوده نزدیک است",
 data: {
 deadline: new Date(now.getFullYear(), now.getMonth(), 15),
 daysLeft: 15 - day,
 },
 reasoning: "نزدیک سررسید مالیاتی — هشدار مهم",
 priority: "high",
 };
 }
 return null;
}

async function buildRecentInvoicesWidget(tenantId: string): Promise<SmartWidget> {
 try {
 const invoices = await db.invoice.findMany({
 where: { tenantId, deletedAt: null },
 select: {
 id: true,
 number: true,
 type: true,
 date: true,
 total: true,
 status: true,
 party: { select: { name: true } },
 },
 orderBy: { createdAt: "desc" },
 take: 5,
 });

 return {
 type: "recent_invoices",
 position: 14,
 title: "فاکتورهای اخیر",
 subtitle: "۵ فاکتور آخر",
 data: invoices.map((i) => ({
...i,
 total: Number(i.total),
 partyName: i.party?.name,
 })),
 reasoning: "اطلاع از فاکتورهای اخیر",
 priority: "medium",
 };
 } catch {
 return {
 type: "recent_invoices",
 position: 14,
 title: "فاکتورهای اخیر",
 data: [],
 reasoning: "اطلاع از فاکتورهای اخیر",
 priority: "low",
 };
 }
}

async function buildTeamActivityWidget(tenantId: string): Promise<SmartWidget> {
 try {
 const activities = await db.auditLog.findMany({
 where: { tenantId },
 select: {
 id: true,
 action: true,
 entity: true,
 userId: true,
 createdAt: true,
 },
 orderBy: { createdAt: "desc" },
 take: 8,
 });

 return {
 type: "team_activity",
 position: 15,
 title: "فعالیت تیم",
 subtitle: "آخرین فعالیت‌های کاربران",
 data: activities,
 reasoning: "ADMIN باید از فعالیت تیم مطلع باشد",
 priority: "low",
 };
 } catch {
 return {
 type: "team_activity",
 position: 15,
 title: "فعالیت تیم",
 data: [],
 reasoning: "فعالیت تیم",
 priority: "low",
 };
 }
}

// ============ Helpers ============

async function detectActiveModules(
 tenantId: string,
 userId?: string
): Promise<string[]> {
 const modules: string[] = [];

 try {
 // inventory
 const stockCount = await db.stockItem.count({
 where: { tenantId },
 });
 if (stockCount > 0) modules.push("inventory");

 // budget
 const budgetCount = await db.budget.count({ where: { tenantId } });
 if (budgetCount > 0) modules.push("budget");

 // manufacturing/contracting (از audit log)
 if (userId) {
 const advancedActions = await db.auditLog.findFirst({
 where: {
 tenantId,
 userId,
 action: { contains: "MANUFACTURING" },
 },
 });
 if (advancedActions) modules.push("manufacturing");
 }
 } catch {
 // ignore
 }

 return modules;
}

// انتخاب و مرتب‌سازی ویجت‌ها
function selectAndSortWidgets(
 candidates: SmartWidget[],
 _role: string,
 _timeOfDay: string
): SmartWidget[] {
 // مرتب‌سازی بر اساس priority و position
 const priorityOrder = { high: 0, medium: 1, low: 2 };
 return candidates
.sort((a, b) => {
 // اول بر اساس priority
 const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
 if (pDiff!== 0) return pDiff;
 // سپس بر اساس position
 return a.position - b.position;
 })
.slice(0, 12); // حداکثر ۱۲ ویجت
}

// تولید خلاصه‌ی بینش‌ها با LLM
async function generateSummaryInsights(
 tenantId: string,
 role: string,
 insights: { title: string; description: string; severity: string }[],
 widgets: SmartWidget[]
): Promise<string[]> {
 // اگر بینش کافی نیست، از بینش‌های widgets استفاده می‌کنیم
 if (insights.length === 0) {
 return widgets.slice(0, 3).map((w) => `${w.title}: ${w.reasoning}`);
 }

 try {
 const zai = await ZAI.create();
 const prompt = `بر اساس بینش‌های زیر، ۳ نکته‌ی کلیدی به فارسی برای ${role} بنویس:
${insights
.slice(0, 5)
.map((i, idx) => `${idx + 1}. ${i.title}: ${i.description}`)
.join("\n")}

پاسخ را به‌صورت JSON Array بده: ["نکته ۱", "نکته ۲", "نکته ۳"]`;

 const completion = await zai.chat.completions.create({
 messages: [
 {
 role: "system",
 content:
 "تو یک دستیار هوشمند حسابداری هستی. ۳ نکته‌ی کلیدی و actionable به فارسی بده.",
 },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });

 const reply = completion?.choices?.[0]?.message?.content?? "";
 const match = reply.match(/\[[\s\S]*\]/);
 if (match) {
 return JSON.parse(match[0]) as string[];
 }
 } catch {
 // fallback
 }

 return insights.slice(0, 3).map((i) => i.description);
}

// ============ Cache ============
const dashboardCache = new Map<
 string,
 { dashboard: SmartDashboardResult; expiresAt: number }
>();
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000; // ۵ دقیقه
// جلوگیری از اسپم شدن LLM enrichment برای یک کلید (dedup پس‌زمینه)
const pendingEnrichments = new Set<string>();

export async function getCachedSmartDashboard(
 tenantId: string,
 userId?: string,
 role?: string
): Promise<SmartDashboardResult> {
 const cacheKey = `${tenantId}:${userId || "anon"}:${role || "USER"}`;
 const cached = dashboardCache.get(cacheKey);
 if (cached && cached.expiresAt > Date.now()) {
 return cached.dashboard;
 }

 const dashboard = await generateSmartDashboard(
 tenantId,
 userId,
 role || "USER"
 );
 dashboardCache.set(cacheKey, {
 dashboard,
 expiresAt: Date.now() + DASHBOARD_CACHE_TTL,
 });

 return dashboard;
}

export function clearDashboardCache(tenantId?: string): void {
 if (tenantId) {
 for (const key of dashboardCache.keys()) {
 if (key.startsWith(tenantId)) {
 dashboardCache.delete(key);
 }
 }
 } else {
 dashboardCache.clear();
 }
}
