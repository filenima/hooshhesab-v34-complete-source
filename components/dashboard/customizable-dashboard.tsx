"use client";

import * as React from "react";
import {
 DndContext,
 closestCenter,
 KeyboardSensor,
 PointerSensor,
 useSensor,
 useSensors,
 type DragEndEvent,
 TouchSensor,
} from "@dnd-kit/core";
import {
 arrayMove,
 SortableContext,
 sortableKeyboardCoordinates,
 useSortable,
 rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import {
 GripVertical,
 Layout,
 Plus,
 X,
 LayoutDashboard,
 FileText,
 Clock,
 BarChart3,
 Package,
 Bell,
 Zap,
 Sparkles,
 ArrowUpRight,
 ArrowDownRight,
 ShoppingCart,
 Receipt,
 Banknote,
 TrendingUp,
 AlertTriangle,
 Info,
 CheckCircle2,
 Coins,
 CalendarClock,
 Activity,
 RefreshCw,
 ChevronDown,
 ChevronUp,
 AlertCircle,
 Lightbulb,
 BookOpen,
 Trophy,
 type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ux/empty-state";
import { BudgetAlert } from "@/components/ux/budget-alert";
import { PriceWidget } from "@/components/dashboard/widgets/price-widget";
import { NobatimeWidget } from "@/components/ux/nobatime-widget";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali, formatCompactToman, formatCompactRial, formatNumber } from "@/lib/persian";
import {
 getDashboardStorageKey,
 getRoleDashboard,
 type DashboardWidgetType,
} from "@/lib/dashboard-configs";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";

/* ============ انواع ویجت‌ها ============ */
type WidgetType =
 | "kpi"
 | "invoices"
 | "checks"
 | "chart"
 | "products"
 | "alerts"
 | "actions"
 | "ai"
 | "price"
 | "nobatime"
 | "health"
 | "tip"
 | "profit";

interface WidgetMeta {
 title: string;
 description: string;
 span: 1 | 2; // ۲ یعنی تمام‌عرض در دسکتاپ
 icon: LucideIcon;
}

const WIDGET_META: Record<WidgetType, WidgetMeta> = {
 kpi: {
 title: "خلاصه شاخص‌ها",
 description: "درآمد، هزینه، سود و نقدینگی",
 span: 2,
 icon: LayoutDashboard,
 },
 invoices: {
 title: "فاکتورهای اخیر",
 description: "آخرین فاکتورهای خرید و فروش",
 span: 2,
 icon: FileText,
 },
 checks: {
 title: "چک‌های سررسید",
 description: "چک‌های هفته جاری",
 span: 1,
 icon: Clock,
 },
 chart: {
 title: "جریان نقدی",
 description: "نمودار ۳۰ روز اخیر",
 span: 2,
 icon: BarChart3,
 },
 products: {
 title: "پرفروش‌ترین محصولات",
 description: "برترین کالاها بر اساس فروش",
 span: 1,
 icon: Package,
 },
 alerts: {
 title: "هشدارهای هوشمند",
 description: "اخطارهای مالی و سررسیدها",
 span: 1,
 icon: Bell,
 },
 actions: {
 title: "اقدامات سریع",
 description: "دسترسی‌های پرکاربرد",
 span: 1,
 icon: Zap,
 },
 ai: {
 title: "پیشنهاد هوش مصنوعی",
 description: "تحلیل لحظه‌ای وضعیت مالی",
 span: 1,
 icon: Sparkles,
 },
 price: {
 title: "قیمت زنده طلا و ارز",
 description: "نرخ لحظه‌ای طلا، دلار، یورو و درهم",
 span: 1,
 icon: Coins,
 },
 nobatime: {
 title: "نوبت‌های امروز",
 description: "ویجت نوباتایم — نوبت‌های روز جاری",
 span: 1,
 icon: CalendarClock,
 },
 health: {
 title: "امتیاز سلامت مالی",
 description: "تحلیل هوشمند وضعیت کسبوکار",
 span: 1,
 icon: Activity,
 },
 tip: {
 title: "نکته روز مالی",
 description: "آموزش کوتاه حسابداری و مالیات",
 span: 1,
 icon: Lightbulb,
 },
 profit: {
 title: "قهرمان سود امروز",
 description: "سود ناخالص امروز و پرسودترین کالاها",
 span: 1,
 icon: Trophy,
 },
};

const WIDGET_ORDER: WidgetType[] = [
 "kpi",
 "health",
 "invoices",
 "checks",
 "chart",
 "alerts",
 "actions",
 "products",
 "profit",
 "ai",
 "price",
 "nobatime",
 "tip",
];

const DEFAULT_LAYOUT: WidgetType[] = [
 "kpi",
 "health",
 "invoices",
 "checks",
 "chart",
 "alerts",
 "actions",
 "products",
 "profit",
 "ai",
 "price",
 "tip",
];

const STORAGE_KEY = "hoshhesab_dashboard_layout";

/**
 * نگاشت نام‌های ویجت در dashboard-configs به WidgetType‌های این داشبورد.
 * ویجت‌های بدون معادل از قلم می‌افتند تا چیدمان نقش معنا‌دار بماند.
 */
const ROLE_WIDGET_MAP: Record<DashboardWidgetType, WidgetType | null> = {
 kpi_summary: "kpi",
 cash_flow_chart: "chart",
 recent_invoices: "invoices",
 due_checks: "checks",
 ai_insight: "ai",
 alerts: "alerts",
 quick_actions: "actions",
 journal_entries: "invoices",
 trial_balance: "chart",
 tax_summary: "alerts",
 sales_chart: "chart",
 top_products: "products",
 top_customers: "products",
 health_score: "health",
 profit_champion: "profit",
};

function getRoleDefaultLayout(role: string | undefined | null): WidgetType[] {
 const roleWidgets = getRoleDashboard(role).widgets;
 const mapped: WidgetType[] = [];
 const seen = new Set<WidgetType>();
 for (const w of roleWidgets) {
 const m = ROLE_WIDGET_MAP[w];
 if (m &&!seen.has(m)) {
 mapped.push(m);
 seen.add(m);
 }
 }
 return mapped.length > 0? mapped: DEFAULT_LAYOUT;
}

const ROLE_LABELS: Record<string, string> = {
 ADMIN: "مدیر",
 ACCOUNTANT: "حسابدار",
 MANAGER: "مدیر فروش",
 USER: "کاربر",
};

/* ============ کامپوننت اصلی ============ */
export function CustomizableDashboard({ role }: { role?: string }) {
 const { toast } = useToast();
 const roleDefault = React.useMemo(() => getRoleDefaultLayout(role), [role]);
 const [layout, setLayout] = React.useState<WidgetType[]>(roleDefault);
 const [editMode, setEditMode] = React.useState(false);
 const [paletteOpen, setPaletteOpen] = React.useState(false);
 const [hydrated, setHydrated] = React.useState(false);

 const storageKey = React.useMemo(
 () => getDashboardStorageKey(role),
 [role]
 );

 // بررسی هشدارهای بودجه هنگام mount داشبورد (صدور Notification در صورت عبور از آستانه)
 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const res = await authFetch("/api/budget/check-alerts", {
 method: "POST",
 cache: "no-store",
 });
 const json = await res.json();
 if (cancelled ||!json?.success) return;
 const data = json.data?? {};
 const created: number = data.created?? 0;
 if (created > 0) {
 toast({
 title: "هشدار بودجه جدید",
 description: `${toPersianDigits(created)} هشدار بودجه جدید در مرکز اعلان‌ها ثبت شد.`,
 });
 }
 } catch {
 // خطای خاموش — شبکه موقتاً قطع است
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [toast]);

 // بارگذاری چیدمان ذخیره‌شده از localStorage (مختص نقش کاربر)
 React.useEffect(() => {
 try {
 const stored = localStorage.getItem(storageKey);
 if (stored) {
 const parsed = JSON.parse(stored) as WidgetType[];
 if (Array.isArray(parsed) && parsed.length > 0) {
 let valid = parsed.filter((t) => WIDGET_ORDER.includes(t));
 // v13.4 — مهاجرت یک‌باره: ویجت جدید «قهرمان سود امروز» برای کاربران
 // قدیمی (چیدمان ذخیره‌شده بدون profit) بعد از «پرفروش‌ترین محصولات»
 // درج می‌شود. کاربر نمی‌توانسته خودش حذفش کرده باشد (جدید است)، پس
 // امن است؛ حذف دستیِ بعدیِ کاربر محترم (پرچم جدا ذخیره می‌شود).
 if (
 valid.length > 0 &&
 !valid.includes("profit") &&
 !localStorage.getItem(storageKey + ":v134-migrated")
 ) {
 const idx = valid.indexOf("products");
 valid =
 idx >= 0
 ? [...valid.slice(0, idx + 1), "profit", ...valid.slice(idx + 1)]
 : ["profit", ...valid];
 try {
 localStorage.setItem(storageKey + ":v134-migrated", "1");
 } catch {
 /* ignore */
 }
 }
 if (valid.length > 0) setLayout(valid);
 } else {
 setLayout(roleDefault);
 }
 } else {
 setLayout(roleDefault);
 }
 } catch {
 setLayout(roleDefault);
 }
 setHydrated(true);
 }, [storageKey, roleDefault]);

 // ذخیره چیدمان در localStorage هنگام تغییر
 const persistLayout = React.useCallback(
 (next: WidgetType[]) => {
 try {
 localStorage.setItem(storageKey, JSON.stringify(next));
 } catch {
 /* ignore */
 }
 },
 [storageKey]
 );

 const sensors = useSensors(
 useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
 useSensor(TouchSensor, {
 activationConstraint: { delay: 180, tolerance: 8 },
 }),
 useSensor(KeyboardSensor, {
 coordinateGetter: sortableKeyboardCoordinates,
 })
 );

 const handleDragEnd = React.useCallback(
 (event: DragEndEvent) => {
 const { active, over } = event;
 if (!over || active.id === over.id) return;
 setLayout((items) => {
 const oldIndex = items.indexOf(active.id as WidgetType);
 const newIndex = items.indexOf(over.id as WidgetType);
 if (oldIndex < 0 || newIndex < 0) return items;
 const next = arrayMove(items, oldIndex, newIndex);
 persistLayout(next);
 return next;
 });
 },
 [persistLayout]
 );

 const handleRemoveWidget = React.useCallback(
 (type: WidgetType) => {
 setLayout((items) => {
 if (items.length <= 1) {
 toast({
 title: "حداقل یک ویجت لازم است",
 description: "نمی‌توان همه ویجت‌ها را حذف کرد.",
 });
 return items;
 }
 const next = items.filter((t) => t!== type);
 persistLayout(next);
 return next;
 });
 toast({
 title: "ویجت حذف شد",
 description: `«${WIDGET_META[type].title}» از داشبورد حذف شد.`,
 });
 },
 [persistLayout, toast]
 );

 const handleAddWidget = React.useCallback(
 (type: WidgetType) => {
 setLayout((items) => {
 if (items.includes(type)) {
 toast({
 title: "ویجت تکراری",
 description: "این ویجت از قبل در داشبورد وجود دارد.",
 });
 return items;
 }
 const next = [...items, type];
 persistLayout(next);
 return next;
 });
 setPaletteOpen(false);
 toast({
 title: "ویجت افزوده شد",
 description: `«${WIDGET_META[type].title}» به داشبورد اضافه شد.`,
 });
 },
 [persistLayout, toast]
 );

 const handleResetLayout = React.useCallback(() => {
 setLayout(roleDefault);
 persistLayout(roleDefault);
 toast({
 title: "بازگشت به پیش‌فرض نقش",
 description: `چیدمان داشبورد به حالت پیش‌فرض نقش ${
 ROLE_LABELS[role?? "USER"]?? "کاربر"
 } بازگشت.`,
 });
 }, [persistLayout, toast, roleDefault, role]);

 const availableToAdd = React.useMemo(
 () => WIDGET_ORDER.filter((t) =>!layout.includes(t)),
 [layout]
 );

 // برای جلوگیری از ناسازگاری SSR
 if (!hydrated) {
 return (
 <div className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <div className="md:col-span-2 h-28 rounded-lg border border-border skeleton" />
 <div className="md:col-span-2 h-48 rounded-lg border border-border skeleton" />
 <div className="h-48 rounded-lg border border-border skeleton" />
 <div className="h-48 rounded-lg border border-border skeleton" />
 </div>
 </div>
 );
 }

 return (
 <div className="space-y-4 animate-fade-in-up">
 {/* هدر + دکمه‌های مدیریت چیدمان */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <Layout className="h-4 w-4 text-primary" />
 <h2 className="text-base font-bold text-foreground">داشبورد قابل تنظیم</h2>
 {editMode && (
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
 حالت ویرایش
 </Badge>
 )}
 </div>
 <p className="text-xs text-muted-foreground">
 چیدمان داشبورد را با کشیدن ویجت‌ها شخصی‌سازی کنید
 </p>
 </div>
 <div className="flex items-center gap-2">
 {editMode && (
 <Button
 variant="ghost"
 size="sm"
 className="h-9 text-xs gap-1.5 text-muted-foreground"
 onClick={handleResetLayout}
 >
 <Layout className="h-3.5 w-3.5" />
 بازگشت به پیش‌فرض نقش
 </Button>
 )}
 <Button
 variant="outline"
 size="sm"
 className="h-9 gap-1.5"
 onClick={() => setPaletteOpen(true)}
 disabled={availableToAdd.length === 0}
 >
 <Plus className="h-3.5 w-3.5" />
 افزودن ویجت
 </Button>
 <Button
 size="sm"
 className="h-9 gap-1.5"
 variant={editMode? "default": "outline"}
 onClick={() => setEditMode((v) =>!v)}
 >
 <Layout className="h-3.5 w-3.5" />
 {editMode? "پایان ویرایش": "ویرایش چیدمان"}
 </Button>
 </div>
 </div>

 {/* نوتیفیکیشن حالت ویرایش */}
 <AnimatePresence>
 {editMode && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: "auto" }}
 exit={{ opacity: 0, height: 0 }}
 className="overflow-hidden"
 >
 <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2 text-xs text-foreground">
 <Info className="h-4 w-4 text-primary shrink-0" />
 <span>
 برای جابجایی، دستگیره{" "}
 <GripVertical className="inline h-3 w-3 mx-0.5 align-middle text-muted-foreground" />{" "}
 ویجت‌ها را بکشید. برای حذف، روی ضربدر گوشه هر ویجت کلیک کنید.
 </span>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* شبکه ویجت‌ها */}
 <DndContext
 sensors={sensors}
 collisionDetection={closestCenter}
 onDragEnd={handleDragEnd}
 >
 <SortableContext items={layout} strategy={rectSortingStrategy}>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {layout.map((type) => (
 <SortableWidget
 key={type}
 type={type}
 editMode={editMode}
 onRemove={() => handleRemoveWidget(type)}
 />
 ))}
 </div>
 </SortableContext>
 </DndContext>

 {/* پالت افزودن ویجت */}
 <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>افزودن ویجت</DialogTitle>
 <DialogDescription>
 ویجت‌های در دسترس را به داشبورد خود اضافه کنید
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pe-1">
 {availableToAdd.length === 0? (
 <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
 تمام ویجت‌ها از قبل اضافه شده‌اند.
 </div>
 ): (
 availableToAdd.map((type) => {
 const meta = WIDGET_META[type];
 const Icon = meta.icon;
 return (
 <button
 key={type}
 onClick={() => handleAddWidget(type)}
 className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-start hover:border-primary/40 hover:bg-primary/5 transition-colors"
 >
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <Icon className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-foreground">{meta.title}</p>
 <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
 {meta.description}
 </p>
 </div>
 <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
 </button>
 );
 })
 )}
 </div>
 </DialogContent>
 </Dialog>
 </div>
 );
}

/* ============ ویجت قابل‌مرتب‌سازی ============ */
function SortableWidget({
 type,
 editMode,
 onRemove,
}: {
 type: WidgetType;
 editMode: boolean;
 onRemove: () => void;
}) {
 const {
 attributes,
 listeners,
 setNodeRef,
 transform,
 transition,
 isDragging,
 } = useSortable({ id: type });

 const meta = WIDGET_META[type];
 const Icon = meta.icon;
 const spanClass = meta.span === 2? "md:col-span-2": "";

 const style: React.CSSProperties = {
 transform: CSS.Transform.toString(transform),
 transition,
 };

 return (
 <div
 ref={setNodeRef}
 style={style}
 className={`${spanClass} ${isDragging? "z-50": ""}`}
 >
 <Card
 className={`card-hover widget-topline relative overflow-hidden p-0 ${
 isDragging? "shadow-lg ring-2 ring-primary/40": ""
 } ${editMode? "ring-1 ring-primary/20": ""}`}
 >
 {/* هدر ویجت */}
 <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30">
 <div className="flex items-center gap-2 min-w-0">
 {editMode && (
 <button
 {...attributes}
 {...listeners}
 aria-label="کشیدن ویجت"
 className="cursor-grab active:cursor-grabbing p-1 -m-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-none"
 >
 <GripVertical className="h-4 w-4" />
 </button>
 )}
 <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div className="min-w-0">
 <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
 {meta.title}
 </h3>
 <p className="text-[10px] text-muted-foreground leading-tight truncate">
 {meta.description}
 </p>
 </div>
 </div>
 {editMode && (
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
 onClick={onRemove}
 aria-label="حذف ویجت"
 >
 <X className="h-4 w-4" />
 </Button>
 )}
 </div>
 {/* بدنه ویجت */}
 <div className="p-4">
 <WidgetBody type={type} />
 </div>
 </Card>
 </div>
 );
}

/* ============ بدنه ویجت — انتخابگر نوع ============ */
function WidgetBody({ type }: { type: WidgetType }) {
 switch (type) {
 case "kpi":
 return <KPISummaryWidget />;
 case "invoices":
 return <RecentInvoicesWidget />;
 case "checks":
 return <DueChecksWidget />;
 case "chart":
 return <CashFlowChartWidget />;
 case "products":
 return <TopProductsWidget />;
 case "profit":
 return <ProfitChampionWidget />;
 case "alerts":
 return <AlertsWidget />;
 case "actions":
 return <QuickActionsWidget />;
 case "ai":
 return <AIInsightWidget />;
 case "price":
 return <PriceWidget />;
 case "nobatime":
 return <NobatimeWidget />;
 case "health":
 return <HealthScoreWidget />;
 case "tip":
 return <FinancialTipWidget />;
 default:
 return null;
 }
}

/* ============ تایپ‌های داده‌ی داشبورد (هم‌سان با /api/dashboard) ============ */
interface DashboardKPIs {
 revenue: number;
 expenses: number;
 profit: number;
 cash: number;
 receivable: number;
 payable: number;
}

interface DashboardCounts {
 invoices: number;
 parties: number;
 products: number;
 checks: number;
 employees: number;
 pendingReminders: number;
 lowStockProducts: number;
}

interface DashboardInvoice {
 id: string;
 number: string;
 partyName: string;
 total: number;
 status: string;
 type: string;
 date: string;
}

interface DashboardDueCheck {
 id: string;
 amount: number;
 dueDate: string;
 type: string;
}

interface DashboardCashFlowPoint {
 date: string;
 in: number;
 out: number;
}

interface DashboardTopProduct {
 id: string;
 name: string;
 sku: string;
 quantity: number;
 revenue: number;
}

interface DashboardAlert {
 type: "warning" | "info" | "success" | "danger";
 title: string;
 message: string;
 count: number;
}

interface DashboardAiInsight {
 title: string;
 message: string;
 severity: "success" | "info" | "warning" | "danger";
}

interface DashboardData {
 kpis: DashboardKPIs;
 counts: DashboardCounts;
 dueChecks: DashboardDueCheck[];
 recentInvoices: DashboardInvoice[];
 cashFlow: DashboardCashFlowPoint[];
 topProducts: DashboardTopProduct[];
 alerts: DashboardAlert[];
 aiInsight: DashboardAiInsight | null;
}

/* ============ کش مشترک برای داده‌های داشبورد ============
 * چند ویجت به‌طور همزمان به /api/dashboard نیاز دارند. برای جلوگیری از
 * چندبار فراخوانی، پاسخ در سطح ماژول کش می‌شود و تمام ویجت‌ها از یک
 * Promise مشترک بهره می‌برند. پس از ۳۰ ثانیه، کش منقضی می‌شود.
 */
const DASHBOARD_CACHE_TTL = 30_000; // ۳۰ ثانیه

let dashboardCacheData: DashboardData | null = null;
let dashboardCacheTs = 0;
let dashboardInFlight: Promise<DashboardData> | null = null;
let dashboardLastError: string | null = null;
// FIX(v6 — مسموم‌شدن کش): کش باید به توکن کاربر وصل باشد — قبلاً پاسخ
// بی‌احراز (لندینگ → 401/دادهٔ خالی) بعد از ورود کاربر هم برای ۳۰ ثانیه
// نمایش داده می‌شد و داشبورد دمو خالی به‌نظر می‌رسید.
let dashboardCacheToken: string | null = null;

function fetchDashboardShared(signal?: AbortSignal): Promise<DashboardData> {
 const currentToken = getAuthToken();
 // کش تازه — فقط اگر همان کاربر (توکن یکسان) و با احراز هویت باشد
 if (
 dashboardCacheData &&
 currentToken &&
 dashboardCacheToken === currentToken &&
 Date.now() - dashboardCacheTs < DASHBOARD_CACHE_TTL
 ) {
 return Promise.resolve(dashboardCacheData);
 }
 // در حال اجرا همان Promise را برگردان (فقط برای همان توکن)
 if (dashboardInFlight && dashboardCacheToken === currentToken && currentToken) return dashboardInFlight;

 dashboardInFlight = (async () => {
 try {
 const res = await authFetch("/api/dashboard", {
 cache: "no-store",
 signal,
 });
 if (!res.ok) throw new Error("HTTP " + res.status);
 const json = await res.json();
 if (!json.success ||!json.data) throw new Error("پاسخ نامعتبر");
 const data = json.data as Partial<DashboardData>;
 // تضمین وجود تمام فیلدها (برای سازگاری با نسخه‌های قدیمی API)
 const safe: DashboardData = {
 kpis: data.kpis?? { revenue: 0, expenses: 0, profit: 0, cash: 0, receivable: 0, payable: 0 },
 counts: data.counts?? { invoices: 0, parties: 0, products: 0, checks: 0, employees: 0, pendingReminders: 0, lowStockProducts: 0 },
 dueChecks: Array.isArray(data.dueChecks)? data.dueChecks: [],
 recentInvoices: Array.isArray(data.recentInvoices)? data.recentInvoices: [],
 cashFlow: Array.isArray(data.cashFlow)? data.cashFlow: [],
 topProducts: Array.isArray(data.topProducts)? data.topProducts: [],
 alerts: Array.isArray(data.alerts)? data.alerts: [],
 aiInsight: data.aiInsight?? null,
 };
 dashboardCacheData = safe;
 dashboardCacheTs = Date.now();
 dashboardCacheToken = currentToken;
 dashboardLastError = null;
 return safe;
 } catch (err) {
 // اگر به‌خاطر abort باشد، خطا ذخیره نکن
 if (err instanceof DOMException && err.name === "AbortError") {
 throw err;
 }
 dashboardLastError =
 err instanceof Error? err.message: "خطا در بارگذاری داده‌ها";
 throw err;
 } finally {
 dashboardInFlight = null;
 }
 })();

 return dashboardInFlight;
}

function invalidateDashboardCache() {
 dashboardCacheData = null;
 dashboardCacheTs = 0;
 dashboardCacheToken = null;
}

/* ============ FIX(21-C — تازه‌سازی خاموشِ پس‌زمینه) ============
 * داشبورد با keep-alive مونت می‌ماند (app-shell)، پس داده‌هایش باید
 * خودشان تازه شوند و نه با remount/اسپینر:
 *  - «hoshhesab:data-changed» (ثبت فاکتور/کالا/طرف‌حساب در ماژول دیگر)
 *    → ابطال کش مشترک + fetch خاموش + broadcast به ویجت‌های مونت‌شده
 *  - بازگشت به تب (visibilitychange) + کهنگی > TTL → fetch خاموش
 * نتیجه بدون اسپینر/لرزش به ویجت‌ها می‌رسد — دادهٔ نمایشی قدیمی در UI
 * می‌ماند و بی‌صدا تعویض می‌شود (الگوی stale-while-revalidate).
 */
const dashboardSubscribers = new Set<(d: DashboardData) => void>();
let backgroundRefreshInstalled = false;

function broadcastDashboardUpdate(d: DashboardData): void {
 for (const cb of dashboardSubscribers) {
 try {
 cb(d);
 } catch {
 /* شنونده‌ی خطادار بقیه را نبندد */
 }
 }
}

function installDashboardBackgroundRefresh(): void {
 if (backgroundRefreshInstalled || typeof window === "undefined") return;
 backgroundRefreshInstalled = true;

 const silentRefresh = () => {
 if (!getAuthToken()) return;
 fetchDashboardShared()
 .then((d) => {
 broadcastDashboardUpdate(d);
 })
 .catch(() => {
 /* خاموش — دادهٔ فعلی در UI می‌ماند */
 });
 };

 // تغییر داده در هر ماژول → کش مشترک باطل + تازه‌سازی خاموش
 window.addEventListener("hoshhesab:data-changed", () => {
 if (!getAuthToken()) return;
 invalidateDashboardCache();
 silentRefresh();
 });

 // بازگشت به تب فعال + کهنگی > TTL → تازه‌سازی خاموش (هرگز بلاک‌کننده نیست)
 document.addEventListener("visibilitychange", () => {
 if (document.visibilityState !== "visible") return;
 if (!getAuthToken()) return;
 if (dashboardCacheTs && Date.now() - dashboardCacheTs < DASHBOARD_CACHE_TTL) return;
 silentRefresh();
 });
}

/**
 * fetchDashboardSharedExport — برای استفاده‌ی بیرون از این فایل.
 * FIX: ویجت‌ها و ماژول‌های دیگر (مثل AIAssistantPro) قبلاً مستقیم authFetch
 * می‌زدند و کش مشترک را دور می‌زدند چندین فراخوانی تکراری /api/dashboard.
 */
export const fetchDashboardSharedExport = fetchDashboardShared;
export const invalidateDashboardCacheExport = invalidateDashboardCache;

/**
 * useDashboardData — Hook مشترک برای دریافت داده‌های داشبورد.
 * از یک کش ماژول-سطح بهره می‌برد تا اگر چندین ویجت همزمان آن را فراخوانی کنند،
 * فقط یک درخواست HTTP به /api/dashboard ارسال شود.
 *
 * FIX: تلاش مجدد خودکار برای خطاهای گذرا (شبکه/۵xx) — قبلاً هر قطعی
 * لحظه‌ای سرور باعث می‌شد همه‌ی ویجت‌ها دکمه «تلاش مجدد» نشان دهند و
 * کاربر مجبور بود دستی کلیک کند. حالا یک‌بار خودکار (با تأخیر) تلاش می‌شود
 * و فقط خطاهای ۴۰۱ (نشست) و خطاهای ماندگار به کاربر نمایش داده می‌شوند.
 */
const TRANSIENT_AUTO_RETRY_MS = 5_000;

function isTransientDashboardError(err: unknown): boolean {
 if (err instanceof DOMException && err.name === "AbortError") return false;
 const msg = err instanceof Error? err.message: String(err? err: "");
 // 401 یعنی نشست منقضی — authFetch خودش هدایت می‌کند؛ نباید retry شود
 if (msg.includes("HTTP 401")) return false;
 return true; // شبکه قطع، 5xx، HTTP دیگر → گذرا
}

function useDashboardData() {
 // FIX(21-C — مسموم‌شدن کش): دادهٔ اولیه فقط برای «همان کاربر» seed می‌شود
 // (قبلاً دادهٔ کاربر قبلی یک فریم فلاش می‌زد).
 const [data, setData] = React.useState<DashboardData | null>(() =>
 dashboardCacheData && dashboardCacheToken && dashboardCacheToken === getAuthToken()
 ? dashboardCacheData
 : null
 );
 const [loading, setLoading] = React.useState<boolean>(data === null);
 const [error, setError] = React.useState<string | null>(dashboardLastError);

 React.useEffect(() => {
 let mounted = true;
 let retryTimer: ReturnType<typeof setTimeout> | null = null;
 const ac = new AbortController();

 const run = (isAutoRetry: boolean) => {
 // FIX(21-C — SWR): اگر دادهٔ (حتی کهنهٔ) همین کاربر موجود است، اسکلتون
 // نگذار — دادهٔ فعلی در UI می‌ماند و fetch پس‌زمینه بی‌صدا تعویض می‌کند.
 const hasOwnData = !!(
 dashboardCacheData &&
 getAuthToken() &&
 dashboardCacheToken === getAuthToken()
 );
 if (!hasOwnData) {
 setLoading(true);
 }
 fetchDashboardShared(ac.signal)
 .then((d) => {
 if (!mounted) return;
 setData(d);
 setError(null);
 })
 .catch((err) => {
 if (!mounted) return;
 if (err instanceof DOMException && err.name === "AbortError") return;
 // خطای گذرا؟ یک‌بار خودکار تلاش کن قبل از نمایش خطا به کاربر
 if (isAutoRetry === false && isTransientDashboardError(err)) {
 retryTimer = setTimeout(() => {
 if (!mounted) return;
 invalidateDashboardCache();
 run(true);
 }, TRANSIENT_AUTO_RETRY_MS);
 return;
 }
 setError(
 err instanceof Error? err.message: "خطا در بارگذاری داده‌ها"
 );
 })
 .finally(() => {
 if (!mounted) return;
 setLoading(false);
 });
 };

 // اگر کش تازه باشد، نیازی به fetch نیست — فقط با توکن فعلی (FIX مسموم‌شدن کش)
 if (
 dashboardCacheData &&
 getAuthToken() &&
 dashboardCacheToken === getAuthToken() &&
 Date.now() - dashboardCacheTs < DASHBOARD_CACHE_TTL
 ) {
 setData(dashboardCacheData);
 setLoading(false);
 } else {
 run(false);
 }

 // FIX(21-C): تازه‌سازی خاموش پس‌زمینه — نصب یک‌بارهٔ شنونده‌های سراسری +
 // اشتراک این ویجت در broadcast؛ دادهٔ تازه بدون اسپینر تعویض می‌شود.
 installDashboardBackgroundRefresh();
 const onSilentUpdate = (d: DashboardData) => {
 if (!mounted) return;
 setData((prev) => (prev === d ? prev : d));
 setError(null);
 };
 dashboardSubscribers.add(onSilentUpdate);

 return () => {
 mounted = false;
 dashboardSubscribers.delete(onSilentUpdate);
 if (retryTimer) clearTimeout(retryTimer);
 ac.abort();
 };
 }, []);

 const refresh = React.useCallback(() => {
 invalidateDashboardCache();
 setLoading(true);
 setError(null);
 const ac = new AbortController();
 fetchDashboardShared(ac.signal)
.then((d) => {
 setData(d);
 setError(null);
 })
.catch((err) => {
 if (err instanceof DOMException && err.name === "AbortError") return;
 setError(
 err instanceof Error? err.message: "خطا در بارگذاری داده‌ها"
 );
 })
.finally(() => {
 setLoading(false);
 });
 }, []);

 return { data, loading, error, refresh };
}

/* ============ کامپوننت مشترک خطای ویجت ============ */
function WidgetError({
 message,
 onRetry,
}: {
 message: string;
 onRetry: () => void;
}) {
 return (
 <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
 <AlertCircle className="h-8 w-8 text-destructive" />
 <p className="text-xs text-muted-foreground">{message}</p>
 <Button
 size="sm"
 variant="outline"
 className="h-7 gap-1.5 text-xs"
 onClick={onRetry}
 >
 <RefreshCw className="h-3 w-3" />
 تلاش مجدد
 </Button>
 </div>
 );
}

/* ============ ۱) خلاصه شاخص‌ها (KPI) ============ */
function KPISummaryWidget() {
 const { data, loading, error, refresh } = useDashboardData();

 // ===== حالت بارگذاری =====
 if (loading) {
 return (
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
 {Array.from({ length: 4 }).map((_, i) => (
 <Skeleton key={i} className="h-24 w-full rounded-lg" />
 ))}
 </div>
 );
 }

 // ===== حالت خطا =====
 if (error ||!data) {
 return (
 <WidgetError
 message={error || "داده‌ها در دسترس نیست"}
 onRetry={refresh}
 />
 );
 }

 const kpis = data.kpis;
 const hasData =
 kpis.revenue > 0 ||
 kpis.expenses > 0 ||
 kpis.profit > 0 ||
 kpis.cash > 0;

 // ===== حالت خالی =====
 if (!hasData) {
 return (
 <EmptyState
 icon={LayoutDashboard}
 title="داده‌ای برای نمایش وجود ندارد"
 description="پس از ثبت اولین فاکتورها، شاخص‌های مالی اینجا نمایش داده می‌شوند."
 className="py-6"
 />
 );
 }

 // ساخت آرایه‌ی KPIها با مقادیر واقعی + هویت رنگی مجزا برای هر شاخص
 const items = [
 {
 id: "revenue",
 label: "درآمد این ماه",
 icon: TrendingUp,
 value: kpis.revenue,
 positive: kpis.revenue > 0,
 trend: "up" as const,
 accent: "emerald" as const,
 },
 {
 id: "expenses",
 label: "هزینه‌ها",
 icon: Receipt,
 value: kpis.expenses,
 positive: false,
 trend: "down" as const,
 accent: "rose" as const,
 },
 {
 id: "profit",
 label: "سود خالص",
 icon: Banknote,
 value: kpis.profit,
 positive: kpis.profit >= 0,
 trend: kpis.profit >= 0? ("up" as const): ("down" as const),
 accent: "amber" as const,
 },
 {
 id: "cash",
 label: "موجودی نقدی",
 icon: Banknote,
 value: kpis.cash,
 positive: kpis.cash >= 0,
 trend: kpis.cash >= 0? ("up" as const): ("down" as const),
 accent: "teal" as const,
 },
 ];

 return (
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
 {items.map((kpi) => (
 <KpiCard key={kpi.id} kpi={kpi} />
 ))}
 </div>
 );
}

/** پالت رنگی هر شاخص — chip گرادیانی + نوار اکسنت + رنگ trend */
const KPI_ACCENTS: Record<
 string,
 { chip: string; bar: string; ring: string }
> = {
 emerald: {
 chip: "bg-gradient-to-br from-emerald-500/15 to-emerald-600/25 text-emerald-600 dark:text-emerald-400",
 bar: "from-emerald-500/60 to-transparent",
 ring: "hover:border-emerald-500/40",
 },
 rose: {
 chip: "bg-gradient-to-br from-rose-500/15 to-rose-600/25 text-rose-600 dark:text-rose-400",
 bar: "from-rose-500/60 to-transparent",
 ring: "hover:border-rose-500/40",
 },
 amber: {
 chip: "bg-gradient-to-br from-amber-500/15 to-amber-600/25 text-amber-600 dark:text-amber-400",
 bar: "from-amber-500/60 to-transparent",
 ring: "hover:border-amber-500/40",
 },
 teal: {
 chip: "bg-gradient-to-br from-teal-500/15 to-teal-600/25 text-teal-600 dark:text-teal-400",
 bar: "from-teal-500/60 to-transparent",
 ring: "hover:border-teal-500/40",
 },
};

/** کارت تک‌کاره KPI — چون useCountUp هوک است، باید کامپوننت مجزا باشد */
function KpiCard({
 kpi,
}: {
 kpi: {
 id: string;
 label: string;
 icon: React.ComponentType<{ className?: string }>;
 value: number;
 positive: boolean;
 trend: "up" | "down";
 accent: string;
 };
}) {
 const Icon = kpi.icon;
 const isUp = kpi.trend === "up";
 // انیمیشن شمارش عدد از ۰ تا مقدار واقعی
 const animatedValue = useCountUp(kpi.value, 900);
 const accents = KPI_ACCENTS[kpi.accent]?? KPI_ACCENTS.emerald;

 return (
 <div
 className={`group relative overflow-hidden rounded-xl border border-border bg-muted/30 p-3 flex flex-col gap-1.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:bg-muted/50 ${accents.ring}`}
 >
 {/* نوار اکسنت گرادیانی بالا */}
 <div
 aria-hidden="true"
 className={`absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-l ${accents.bar} opacity-70`}
 />
 <div className="flex items-center justify-between">
 <span
 className={`flex h-7 w-7 items-center justify-center rounded-lg ${accents.chip} transition-transform duration-300 group-hover:scale-110`}
 >
 <Icon className="h-3.5 w-3.5" />
 </span>
 <span
 className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
 kpi.positive
? "bg-emerald-500/10 text-success"
: "bg-rose-500/10 text-destructive"
 }`}
 >
 {isUp? (
 <ArrowUpRight className="h-3 w-3" />
 ): (
 <ArrowDownRight className="h-3 w-3" />
 )}
 </span>
 </div>
 <p className="text-[11px] text-muted-foreground leading-tight">
 {kpi.label}
 </p>
 <p
 className="text-sm font-bold text-foreground tnum leading-tight truncate"
 title={`${formatNumber(kpi.value)} ریال`}
 >
 {formatCompactRial(animatedValue)}
 </p>
 </div>
 );
}

/* ============ ۲) فاکتورهای اخیر ============ */
function statusLabel(status: string): string {
 const map: Record<string, string> = {
 PAID: "تسویه",
 SETTLED: "تسویه",
 DRAFT: "پیش‌نویس",
 SENT: "ارسال شده",
 PENDING: "در انتظار",
 PARTIALLY_PAID: "تسویه جزئی",
 PARTIAL: "تسویه جزئی",
 OVERDUE: "سررسید گذشته",
 CANCELLED: "ابطال شده",
 };
 return map[status] || status;
}

function statusBadgeClass(status: string): string {
 if (status === "PAID" || status === "SETTLED") return "bg-success/10 text-success";
 if (status === "DRAFT") return "bg-muted text-muted-foreground";
 if (status === "OVERDUE") return "bg-destructive/10 text-destructive";
 return "bg-warning/10 text-warning";
}

function RecentInvoicesWidget() {
 const { data, loading, error, refresh } = useDashboardData();
 const openInvoiceForm = React.useCallback(() => {
 window.dispatchEvent(new CustomEvent("hoshhesab:new-invoice"));
 }, []);

 const navigateInvoices = React.useCallback(() => {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", { detail: { module: "invoices" } })
 );
 }, []);

 // ===== حالت بارگذاری =====
 if (loading) {
 return (
 <div className="space-y-2">
 {Array.from({ length: 4 }).map((_, i) => (
 <Skeleton key={i} className="h-14 w-full rounded-lg" />
 ))}
 </div>
 );
 }

 // ===== حالت خطا =====
 if (error ||!data) {
 return (
 <WidgetError
 message={error || "داده‌ها در دسترس نیست"}
 onRetry={refresh}
 />
 );
 }

 const invoices = data.recentInvoices;

 // ===== حالت خالی =====
 if (invoices.length === 0) {
 return (
 <EmptyState
 icon={FileText}
 title="هنوز فاکتوری ثبت نشده"
 description="آخرین فاکتورهای خرید و فروش شما پس از ثبت اینجا نمایش داده می‌شوند."
 action={
 <Button size="sm" className="gap-1.5" onClick={openInvoiceForm}>
 <Plus className="h-3.5 w-3.5" />
 ثبت اولین فاکتور
 </Button>
 }
 className="py-6"
 />
 );
 }

 // ===== حالت موفق (داده‌ی واقعی) =====
 return (
 <div className="space-y-1.5 max-h-72 overflow-y-auto pe-1">
 {invoices.map((inv) => {
 const isSale = inv.type === "SALE";
 return (
 <button
 key={inv.id}
 onClick={navigateInvoices}
 className="w-full flex items-center justify-between gap-2.5 rounded-lg border border-border bg-card p-2.5 hover:border-primary/40 hover:bg-primary/5 transition-colors text-start"
 >
 <div className="flex items-center gap-2.5 min-w-0 flex-1">
 <div
 className={`flex h-8 w-8 items-center justify-center rounded-md shrink-0 ${
 isSale
? "bg-success/10 text-success"
: "bg-warning/10 text-warning"
 }`}
 >
 <FileText className="h-3.5 w-3.5" />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-foreground truncate tnum">
 {inv.number}
 </p>
 <p className="text-[10px] text-muted-foreground truncate">
 {inv.partyName}
 </p>
 </div>
 </div>
 <div className="flex flex-col items-end gap-0.5 shrink-0">
 <p className="text-[11px] font-bold text-foreground tnum leading-tight">
 {formatCompactRial(inv.total)}
 </p>
 <Badge
 variant="secondary"
 className={`text-[9px] h-4 px-1.5 ${statusBadgeClass(inv.status)}`}
 >
 {statusLabel(inv.status)}
 </Badge>
 </div>
 </button>
 );
 })}
 </div>
 );
}

/* ============ ۳) چک‌های سررسید ============ */
function DueChecksWidget() {
 const { data, loading, error, refresh } = useDashboardData();

 const navigateTreasury = React.useCallback(() => {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", { detail: { module: "treasury" } })
 );
 }, []);

 // ===== حالت بارگذاری =====
 if (loading) {
 return (
 <div className="space-y-2">
 {Array.from({ length: 3 }).map((_, i) => (
 <Skeleton key={i} className="h-14 w-full rounded-lg" />
 ))}
 </div>
 );
 }

 // ===== حالت خطا =====
 if (error ||!data) {
 return (
 <WidgetError
 message={error || "داده‌ها در دسترس نیست"}
 onRetry={refresh}
 />
 );
 }

 const checks = data.dueChecks;

 // ===== حالت خالی =====
 if (checks.length === 0) {
 return (
 <EmptyState
 icon={Clock}
 title="چکی برای این هفته وجود ندارد"
 description="چک‌های دریافتی و پرداختی با سررسید هفته جاری اینجا نمایش داده می‌شوند."
 className="py-6"
 />
 );
 }

 // ===== حالت موفق (داده‌ی واقعی) =====
 return (
 <div className="space-y-1.5 max-h-72 overflow-y-auto pe-1">
 {checks.map((chk) => {
 const isReceivable = chk.type === "RECEIVABLE";
 const dueDateLabel = (() => {
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 month: "short",
 day: "numeric",
 }).format(new Date(chk.dueDate));
 } catch {
 return "—";
 }
 })();
 return (
 <button
 key={chk.id}
 onClick={navigateTreasury}
 className="w-full flex items-center justify-between gap-2.5 rounded-lg border border-border bg-card p-2.5 hover:border-primary/40 hover:bg-primary/5 transition-colors text-start"
 >
 <div className="flex items-center gap-2.5 min-w-0 flex-1">
 <div
 className={`flex h-8 w-8 items-center justify-center rounded-md shrink-0 ${
 isReceivable
? "bg-success/10 text-success"
: "bg-warning/10 text-warning"
 }`}
 >
 <Clock className="h-3.5 w-3.5" />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-foreground truncate">
 {isReceivable? "چک دریافتی": "چک پرداختی"}
 </p>
 <p className="text-[10px] text-muted-foreground tnum truncate">
 سررسید: {dueDateLabel}
 </p>
 </div>
 </div>
 <p className="text-[11px] font-bold text-foreground tnum shrink-0">
 {formatCompactRial(chk.amount)}
 </p>
 </button>
 );
 })}
 </div>
 );
}

/* ============ ۴) نمودار جریان نقدی ============ */
function CashFlowChartWidget() {
 const { data, loading, error, refresh } = useDashboardData();

 // ===== حالت بارگذاری =====
 if (loading) {
 return (
 <div className="space-y-3">
 <div className="flex items-center gap-3 text-[11px]">
 <Skeleton className="h-3 w-12" />
 <Skeleton className="h-3 w-12" />
 </div>
 <Skeleton className="h-32 w-full rounded-lg" />
 </div>
 );
 }

 // ===== حالت خطا =====
 if (error ||!data) {
 return (
 <WidgetError
 message={error || "داده‌ها در دسترس نیست"}
 onRetry={refresh}
 />
 );
 }

 const cashFlow = data.cashFlow;

 // محاسبه‌ی پیکسل‌ها برای SVG
 // viewBox: 0 0 400 120
 const W = 400;
 const H = 120;
 const PAD_TOP = 8;
 const PAD_BOT = 8;
 const usableH = H - PAD_TOP - PAD_BOT;

 // پیدا کردن max برای scale
 const maxVal = Math.max(
 1,
...cashFlow.map((p) => Math.max(p.in, p.out))
 );

 // اگر هیچ داده‌ای نبود
 const hasData = cashFlow.some((p) => p.in > 0 || p.out > 0);

 // مسیرهای SVG برای ورودی و خروجی
 const buildPath = (key: "in" | "out"): string => {
 if (cashFlow.length === 0) return "";
 return cashFlow
.map((p, i) => {
 const x = cashFlow.length === 1? W / 2: (i / (cashFlow.length - 1)) * W;
 const v = p[key];
 const y = PAD_TOP + usableH - (v / maxVal) * usableH;
 return `${i === 0? "M": "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
 })
.join(" ");
 };

 // مسیر ناحیه (area) زیر نمودار ورودی برای زیبایی
 const buildArea = (key: "in" | "out"): string => {
 if (cashFlow.length === 0) return "";
 const linePath = cashFlow
.map((p, i) => {
 const x =
 cashFlow.length === 1? W / 2: (i / (cashFlow.length - 1)) * W;
 const v = p[key];
 const y = PAD_TOP + usableH - (v / maxVal) * usableH;
 return `${i === 0? "M": "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
 })
.join(" ");
 const lastX =
 cashFlow.length === 1? W / 2: W;
 return `${linePath} L ${lastX.toFixed(1)} ${H - PAD_BOT} L 0 ${H - PAD_BOT} Z`;
 };

 // محاسبه‌ی مجموع ورودی/خروجی ۳۰ روز
 const totalIn = cashFlow.reduce((s, p) => s + p.in, 0);
 const totalOut = cashFlow.reduce((s, p) => s + p.out, 0);
 const net = totalIn - totalOut;

 return (
 <div className="space-y-3">
 <div className="flex items-center justify-between text-[11px]">
 <div className="flex items-center gap-3">
 <span className="flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-primary" />
 ورودی
 </span>
 <span className="flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
 خروجی
 </span>
 </div>
 {hasData && (
 <span
 className={`text-[10px] font-medium tnum ${
 net >= 0? "text-success": "text-destructive"
 }`}
 >
 خالص: {formatCompactRial(net)}
 </span>
 )}
 </div>
 <div className="relative h-32 w-full rounded-lg border border-border bg-muted/20 overflow-hidden">
 {hasData? (
 <svg
 className="absolute inset-0 h-full w-full"
 viewBox={`0 0 ${W} ${H}`}
 preserveAspectRatio="none"
 >
 <defs>
 <linearGradient id="cf-in-grad" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" className="stop-primary" stopOpacity={0.35} />
 <stop offset="100%" className="stop-primary" stopOpacity={0} />
 </linearGradient>
 </defs>
 {/* خطوط راهنما */}
 {[PAD_TOP, PAD_TOP + usableH / 2, H - PAD_BOT].map((y, i) => (
 <line
 key={i}
 x1="0"
 x2={W}
 y1={y}
 y2={y}
 stroke="currentColor"
 strokeOpacity="0.12"
 strokeWidth="1"
 strokeDasharray="3 6"
 className="text-muted-foreground"
 />
 ))}
 {/* ناحیه‌ی ورودی */}
 <path
 d={buildArea("in")}
 fill="url(#cf-in-grad)"
 className="text-primary"
 />
 {/* خط ورودی */}
 <path
 d={buildPath("in")}
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 className="text-primary"
 />
 {/* خط خروجی */}
 <path
 d={buildPath("out")}
 fill="none"
 stroke="currentColor"
 strokeWidth="1.5"
 strokeDasharray="3 3"
 strokeLinecap="round"
 strokeLinejoin="round"
 className="text-muted-foreground"
 />
 </svg>
 ): (
 <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
 داده‌ای برای نمایش وجود ندارد
 </div>
 )}
 </div>
 {hasData && (
 <div className="flex items-center justify-between text-[10px] text-muted-foreground">
 <span className="tnum">ورودی: {formatCompactRial(totalIn)}</span>
 <span className="tnum">خروجی: {formatCompactRial(totalOut)}</span>
 </div>
 )}
 </div>
 );
}

/* ============ ۵) پرفروش‌ترین محصولات ============ */
function TopProductsWidget() {
 const { data, loading, error, refresh } = useDashboardData();

 const navigateInventory = React.useCallback(() => {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", { detail: { module: "inventory" } })
 );
 }, []);

 // ===== حالت بارگذاری =====
 if (loading) {
 return (
 <div className="space-y-2">
 {Array.from({ length: 4 }).map((_, i) => (
 <Skeleton key={i} className="h-12 w-full rounded-lg" />
 ))}
 </div>
 );
 }

 // ===== حالت خطا =====
 if (error ||!data) {
 return (
 <WidgetError
 message={error || "داده‌ها در دسترس نیست"}
 onRetry={refresh}
 />
 );
 }

 const products = data.topProducts;

 // ===== حالت خالی =====
 if (products.length === 0) {
 return (
 <EmptyState
 icon={Package}
 title="هنوز محصولی فروخته نشده"
 description="پس از ثبت اولین فاکتورهای فروش، پرفروش‌ترین کالاها اینجا نمایش داده می‌شوند."
 className="py-6"
 />
 );
 }

 // بالاترین درآمد برای محاسبه‌ی نوار پیشرفت
 const maxRevenue = Math.max(1,...products.map((p) => p.revenue));

 // ===== حالت موفق (داده‌ی واقعی) =====
 return (
 <div className="space-y-2">
 {products.map((p, i) => {
 const pct = Math.round((p.revenue / maxRevenue) * 100);
 return (
 <button
 key={p.id}
 onClick={navigateInventory}
 className="w-full text-start group"
 >
 <div className="flex items-center justify-between gap-2 mb-1">
 <div className="flex items-center gap-2 min-w-0 flex-1">
 <span className="text-[10px] font-bold text-muted-foreground tnum shrink-0">
 {toPersianDigits(String(i + 1))}
 </span>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
 {p.name}
 </p>
 {p.sku && (
 <p className="text-[10px] text-muted-foreground truncate tnum">
 {p.sku}
 </p>
 )}
 </div>
 </div>
 <div className="flex flex-col items-end shrink-0">
 <p className="text-[11px] font-bold text-foreground tnum leading-tight">
 {formatCompactRial(p.revenue)}
 </p>
 <p className="text-[9px] text-muted-foreground tnum leading-tight">
 {toPersianDigits(formatNumber(p.quantity))} عدد
 </p>
 </div>
 </div>
 {/* نوار پیشرفت */}
 <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
 <div
 className="h-full bg-primary/70 rounded-full transition-all duration-500"
 style={{ width: `${pct}%` }}
 />
 </div>
 </button>
 );
 })}
 </div>
 );
}

/* ============ v13.4 — قهرمان سود امروز ============ */
interface ChampionRow {
 productId: string;
 name: string;
 sku: string;
 unitsSold: number;
 revenue: number;
 profit: number;
 margin: number;
}

function ProfitChampionWidget() {
 const [data, setData] = React.useState<{
 totals: { revenue: number; profit: number; margin: number };
 rows: ChampionRow[];
 } | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [refreshKey, setRefreshKey] = React.useState(0);

 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 setLoading(true);
 setError(null);
 try {
 const res = await authFetch("/api/products/profit?today=1&days=1&limit=5", {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}) as Record<string, unknown>);
 if (!res.ok || !json?.success) throw new Error("خطا در دریافت سود امروز");
 if (cancelled) return;
 const j = json as {
 totals: { revenue: number; profit: number; margin: number };
 data: ChampionRow[];
 };
 setData({ totals: j.totals, rows: (j.data || []).slice(0, 3) });
 } catch (e) {
 if (!cancelled) setError(e instanceof Error ? e.message : "خطا");
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [refreshKey]);

 const navigateInventory = React.useCallback(() => {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", { detail: { module: "inventory" } })
 );
 }, []);

 if (loading) {
 return (
 <div className="space-y-2">
 <Skeleton className="h-12 w-full rounded-lg" />
 <Skeleton className="h-9 w-full rounded-lg" />
 <Skeleton className="h-9 w-3/4 rounded-lg" />
 </div>
 );
 }

 if (error || !data) {
 return (
 <WidgetError
 message={error || "داده‌ها در دسترس نیست"}
 onRetry={() => setRefreshKey((k) => k + 1)}
 />
 );
 }

 const { totals, rows } = data;
 const pos = totals.profit >= 0;
 const maxProfit = Math.max(1, ...rows.map((r) => Math.abs(r.profit)));

 // ===== حالت خالی: امروز فروشی ثبت نشده =====
 if (rows.length === 0) {
 return (
 <EmptyState
 icon={Trophy}
 title="امروز هنوز فروشی ثبت نشده"
 description="با ثبت اولین فاکتور فروش امروز، سود لحظه‌ای و پرسودترین کالاها اینجا نمایش داده می‌شود."
 className="py-6"
 />
 );
 }

 // ===== حالت موفق =====
 return (
 <div className="space-y-2.5">
 {/* عدد بزرگ سود امروز */}
 <button
 onClick={navigateInventory}
 className="group flex w-full items-center gap-3 rounded-lg border bg-muted/30 p-2.5 text-start transition-all hover:border-primary/30 hover:shadow-sm"
 aria-label={`سود ناخالص امروز ${pos ? "" : "منفی "}${formatCompactRial(Math.abs(totals.profit))} — رفتن به انبار`}
 >
 <span
 className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
 pos ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
 }`}
 >
 <TrendingUp className={`h-5 w-5 ${pos ? "" : "rotate-180"}`} />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block text-[10px] text-muted-foreground">
 سود ناخالص امروز (تخمینی)
 </span>
 <span
 className={`block text-lg font-bold leading-tight tabular-nums ${
 pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
 }`}
 >
 {pos ? "+" : "−"}
 {formatCompactRial(Math.abs(totals.profit))}
 </span>
 <span className="block text-[10px] text-muted-foreground tabular-nums">
 از درآمد {formatCompactRial(totals.revenue)} — حاشیه{" "}
 {toPersianDigits(String(totals.margin))}٪
 </span>
 </span>
 </button>

 {/* پرسودترین‌های امروز */}
 <div className="space-y-1.5">
 {rows.map((r, i) => {
 const rp = r.profit >= 0;
 const pct = Math.round((Math.abs(r.profit) / maxProfit) * 100);
 return (
 <button
 key={r.productId}
 onClick={navigateInventory}
 className="w-full text-start group"
 aria-label={`${r.name} — سود ${formatCompactRial(r.profit)}`}
 >
 <div className="mb-0.5 flex items-center justify-between gap-2">
 <div className="flex min-w-0 flex-1 items-center gap-1.5">
 <span className="shrink-0 text-[10px] font-bold text-muted-foreground tabular-nums">
 {toPersianDigits(String(i + 1))}
 </span>
 <p
 className="truncate text-xs font-medium text-foreground transition-colors group-hover:text-primary"
 title={r.name}
 >
 {r.name}
 </p>
 </div>
 <span
 className={`shrink-0 text-[11px] font-bold tabular-nums ${
 rp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
 }`}
 >
 {rp ? "+" : "−"}
 {formatCompactRial(Math.abs(r.profit))}
 </span>
 </div>
 <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
 <div
 className={`h-full rounded-full transition-all duration-500 ${
 rp ? "bg-emerald-500/70" : "bg-red-500/70"
 }`}
 style={{ width: `${pct}%` }}
 />
 </div>
 </button>
 );
 })}
 </div>

 <p className="text-center text-[10px] text-muted-foreground">
 بر اساس فاکتورهای امروز — گزارش کامل در انبار › سود ناخالص
 </p>
 </div>
 );
}

/* ============ ۶) هشدارهای هوشمند ============ */
function alertStyle(type: DashboardAlert["type"]): {
 iconBg: string;
 Icon: LucideIcon;
 borderCls: string;
} {
 switch (type) {
 case "danger":
 return {
 iconBg: "bg-destructive/10 text-destructive",
 Icon: AlertCircle,
 borderCls: "border-destructive/30 bg-destructive/5",
 };
 case "warning":
 return {
 iconBg: "bg-warning/10 text-warning",
 Icon: AlertTriangle,
 borderCls: "border-warning/30 bg-warning/5",
 };
 case "success":
 return {
 iconBg: "bg-success/10 text-success",
 Icon: CheckCircle2,
 borderCls: "border-success/30 bg-success/5",
 };
 case "info":
 default:
 return {
 iconBg: "bg-primary/10 text-primary",
 Icon: Info,
 borderCls: "border-border bg-muted/30",
 };
 }
}

function AlertsWidget() {
 const { data, loading, error, refresh } = useDashboardData();

 // ===== حالت بارگذاری =====
 if (loading) {
 return (
 <div className="space-y-2">
 <Skeleton className="h-16 w-full rounded-lg" />
 <Skeleton className="h-16 w-full rounded-lg" />
 <Skeleton className="h-16 w-full rounded-lg" />
 </div>
 );
 }

 // ===== حالت خطا =====
 if (error ||!data) {
 return (
 <WidgetError
 message={error || "داده‌ها در دسترس نیست"}
 onRetry={refresh}
 />
 );
 }

 const alerts = data.alerts;

 // ===== حالت خالی =====
 if (alerts.length === 0) {
 return (
 <div className="space-y-2">
 <BudgetAlert autoRefreshMs={0} />
 <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 p-2.5">
 <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium text-foreground">سیستم آماده است</p>
 <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
 در حال حاضر هیچ هشدار مالی فعالی وجود ندارد.
 </p>
 </div>
 </div>
 </div>
 );
 }

 // ===== حالت موفق (داده‌ی واقعی) =====
 return (
 <div className="space-y-2 max-h-72 overflow-y-auto pe-1">
 <BudgetAlert autoRefreshMs={0} />
 {alerts.map((alert, i) => {
 const { iconBg, Icon, borderCls } = alertStyle(alert.type);
 return (
 <div
 key={`${alert.title}-${i}`}
 className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${borderCls}`}
 >
 <div
 className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${iconBg}`}
 >
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <p className="text-xs font-medium text-foreground truncate">
 {alert.title}
 </p>
 {alert.count > 0 && (
 <Badge
 variant="secondary"
 className="text-[9px] h-4 px-1.5 tnum shrink-0"
 >
 {toPersianDigits(String(alert.count))}
 </Badge>
 )}
 </div>
 <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
 {alert.message}
 </p>
 </div>
 </div>
 );
 })}
 </div>
 );
}

/* ============ ۷) اقدامات سریع — حرفه‌ای ============ */
function QuickActionsWidget() {
 const actions: {
 id: string;
 label: string;
 subtitle: string;
 icon: LucideIcon;
 accent: string;
 event?: string;
 navigate?: string;
 module?: string;
 action?: string;
 }[] = [
 // FIX(C7): دکمه‌های «محصول جدید» و «ثبت چک» رویدادهای بدون listener صادر می‌کردند —
 // حالا با الگوی صحیح hoshhesab:navigate (module + action) هدایت می‌شوند
 { id: "invoice", label: "فاکتور جدید", subtitle: "فروش / خرید", icon: ShoppingCart, accent: "bg-primary/10 text-primary group-hover:bg-primary/20", event: "hoshhesab:new-invoice" },
 { id: "product", label: "محصول جدید", subtitle: "تعریف کالا", icon: Package, accent: "bg-info/10 text-info group-hover:bg-info/20", module: "inventory", action: "new-product" },
 { id: "check", label: "ثبت چک", subtitle: "صیادی", icon: Receipt, accent: "bg-violet/10 text-violet group-hover:bg-violet/20", module: "treasury", action: "new-check" },
 { id: "report", label: "گزارش‌ساز", subtitle: "گزارش‌های مالی", icon: BarChart3, accent: "bg-success/10 text-success group-hover:bg-success/20", module: "reports-builder" },
 ];

 const onClick = React.useCallback(
 (event?: string, navigate?: string, module?: string, action?: string) => {
 if (event) window.dispatchEvent(new CustomEvent(event));
 if (module) {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", { detail: { module, action } })
 );
 }
 },
 []
 );

 return (
 <div className="space-y-2">
 <div className="grid grid-cols-2 gap-2">
 {actions.map((a) => {
 const Icon = a.icon;
 return (
 <button
 key={a.id}
 onClick={() => onClick(a.event, a.navigate, a.module, a.action)}
 className="group flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all"
 >
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.accent} transition-transform group-hover:scale-110`}>
 <Icon className="h-4 w-4" />
 </div>
 <div className="flex flex-col items-center gap-0.5">
 <span className="text-[11px] font-semibold text-foreground leading-tight text-center">
 {a.label}
 </span>
 <span className="text-[9px] text-muted-foreground leading-tight">
 {a.subtitle}
 </span>
 </div>
 </button>
 );
 })}
 </div>
 {/* ردیف میانبرهای مفید */}
 <div className="pt-2 border-t border-border/50 flex flex-wrap gap-1">
 <button
 onClick={() => onClick(undefined, "modian")}
 className="text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
 >
 مودیان
 </button>
 <button
 onClick={() => onClick(undefined, "ai")}
 className="text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
 >
 هوش مصنوعی
 </button>
 <button
 onClick={() => onClick(undefined, "reports-builder")}
 className="text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
 >
 گزارش‌ساز
 </button>
 <button
 onClick={() => onClick(undefined, "account")}
 className="text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
 >
 حساب کاربری
 </button>
 </div>
 </div>
 );
}

/* ============ ۷.۵) نکته روز مالی (ویجت جدید) ============ */
/** محتوای آموزشی کوتاه — بدون API call، انتخاب روزانه بر اساس تاریخ */
const FINANCIAL_TIPS: {
 category: string;
 title: string;
 body: string;
}[] = [
 {
 category: "مالیات",
 title: "مهلت ارسال اظهارنامه ارزش افزوده",
 body: "اظهارنامه ارزش افزوده تا پایان هر فصل باید ارسال شود. جریمه عدم ارسال تا ۳۰٪ مالیات دوره است — با یادآور هوش هیچ‌وقت جا نمی‌ماند.",
 },
 {
 category: "خزانه‌داری",
 title: "قاعده ۳۰ روز چک",
 body: "چک‌های دریافتی را حداکثر تا ۳۰ روز پیش از سررسید پیگیری کنید. ثبت چک در هوش به‌صورت خودکار یادآور پیگیری می‌سازد.",
 },
 {
 category: "مدیریت هزینه",
 title: "تحلیل ۸۰/۲۰ هزینه‌ها",
 body: "معمولاً ۲۰٪ حساب‌های هزینه، ۸۰٪ کل هزینه‌ها را می‌سازند. با گزارش طبقه‌بندی هزینه، همین ۲۰٪ را پیدا و بهینه کنید.",
 },
 {
 category: "نقدینگی",
 title: "نسبت جاری را جدی بگیرید",
 body: "نسبت جاری (دارایی جاری ÷ بدهی جاری) زیر ۱ یعنی خطر ناترازی. ویجت امتیاز سلامت مالی این را هر روز برای شما می‌سنجد.",
 },
 {
 category: "فروش",
 title: "سن فاکتورها را زیر نظر داشته باشید",
 body: "فاکتورهای بالای ۶۰ روز معوق، ریسک نکول بالایی دارند. گزارش «سن فاکتور و ریسک» مشتریان پرریسک را نشانتان می‌دهد.",
 },
 {
 category: "انبار",
 title: "نقطه سفارش مجدد را تنظیم کنید",
 body: "برای کالاهای پرفروش، حداقل موجودی (ROP) تعیین کنید تا قبل از اتمام موجودی، هشدار خرید خودکار دریافت کنید.",
 },
 {
 category: "مودیان",
 title: "شماره اقتصادی خریدار را ثبت کنید",
 body: "فاکتورهای بدون شماره اقتصادی طرف حساب، در سامانه مودیان با نرخ مالیات مقطوع (۶٪) مواجه می‌شوند.",
 },
];

function FinancialTipWidget() {
 // انتخاب نکته بر اساس روز سال — هر روز یک نکته متفاوت (بدون تصادف در هر رندر)
 const dayOfYear = Math.floor(
 (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
 );
 const [index, setIndex] = React.useState(dayOfYear % FINANCIAL_TIPS.length);
 const [fade, setFade] = React.useState(true);

 const tip = FINANCIAL_TIPS[index];

 const nextTip = React.useCallback(() => {
 setFade(false);
 setTimeout(() => {
 setIndex((i) => (i + 1) % FINANCIAL_TIPS.length);
 setFade(true);
 }, 200);
 }, []);

 return (
 <div className="flex flex-col gap-2.5">
 <div
 className={`relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-bl from-primary/10 via-primary/5 to-transparent p-3.5 transition-opacity duration-200 ${
 fade? "opacity-100": "opacity-0"
 }`}
 >
 {/* آیکن بزرگ تزئینی پس‌زمینه */}
 <Lightbulb
 aria-hidden="true"
 className="pointer-events-none absolute -left-3 -bottom-3 h-20 w-20 text-primary/10"
 />
 <div className="flex items-center gap-1.5">
 <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15">
 <BookOpen className="h-3 w-3 text-primary" />
 </span>
 <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
 {tip.category}
 </Badge>
 </div>
 <p className="mt-2 text-xs font-bold text-foreground leading-snug">
 {tip.title}
 </p>
 <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
 {tip.body}
 </p>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-[10px] text-muted-foreground tnum">
 {toPersianDigits(index + 1)} از {toPersianDigits(FINANCIAL_TIPS.length)}
 </span>
 <button
 onClick={nextTip}
 className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
 >
 <RefreshCw className="h-3 w-3" />
 نکته بعدی
 </button>
 </div>
 </div>
 );
}

/* ============ ۸) پیشنهاد هوش مصنوعی ============ */
function aiSeverityStyle(severity: DashboardAiInsight["severity"]): {
 iconBg: string;
 Icon: LucideIcon;
 accent: string;
} {
 switch (severity) {
 case "danger":
 return {
 iconBg: "bg-destructive text-destructive-foreground",
 Icon: AlertCircle,
 accent: "from-destructive/10 to-destructive/5 border-destructive/20",
 };
 case "warning":
 return {
 iconBg: "bg-warning text-warning-foreground",
 Icon: AlertTriangle,
 accent: "from-warning/10 to-warning/5 border-warning/20",
 };
 case "success":
 return {
 iconBg: "bg-success text-success-foreground",
 Icon: CheckCircle2,
 accent: "from-success/10 to-success/5 border-success/20",
 };
 case "info":
 default:
 return {
 iconBg: "bg-primary text-primary-foreground",
 Icon: Sparkles,
 accent: "from-primary/10 to-primary/5 border-primary/20",
 };
 }
}

function AIInsightWidget() {
 const { data, loading, error, refresh } = useDashboardData();

 // ===== حالت بارگذاری =====
 if (loading) {
 return (
 <div className="space-y-3">
 <Skeleton className="h-16 w-full rounded-lg" />
 <Skeleton className="h-3 w-full" />
 <Skeleton className="h-3 w-3/4" />
 <Skeleton className="h-8 w-full rounded-lg" />
 </div>
 );
 }

 // ===== حالت خطا =====
 if (error ||!data) {
 return (
 <WidgetError
 message={error || "داده‌ها در دسترس نیست"}
 onRetry={refresh}
 />
 );
 }

 const insight = data.aiInsight;

 // ===== حالت بدون داده‌ی کافی =====
 if (!insight) {
 return (
 <div className="space-y-3">
 <div className="flex items-center gap-2 rounded-lg bg-gradient-to-l from-primary/10 to-primary/5 p-3 border border-primary/20">
 <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
 <Sparkles className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-semibold text-foreground leading-tight">
 دستیار هوشمند هوش
 </p>
 <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
 آماده کمک به شما در تحلیل داده‌ها
 </p>
 </div>
 <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed">
 پس از ثبت چند فاکتور و پرداختی، هوش مصنوعی پیشنهادهای هوشمندانه برای مدیریت
 بهتر جریان نقدی، کاهش هزینه‌ها و افزایش سودآوری به شما ارائه می‌دهد.
 </p>
 <Button
 size="sm"
 variant="outline"
 className="w-full h-8 gap-1.5 text-xs"
 onClick={() =>
 window.dispatchEvent(new CustomEvent("hoshhesab:open-assistant"))
 }
 >
 <Sparkles className="h-3.5 w-3.5" />
 گفتگو با دستیار
 </Button>
 </div>
 );
 }

 // ===== حالت موفق (داده‌ی واقعی) =====
 const { iconBg, Icon, accent } = aiSeverityStyle(insight.severity);

 return (
 <div className="space-y-3">
 <div className={`flex items-center gap-2 rounded-lg bg-gradient-to-l ${accent} p-3 border`}>
 <div className={`flex h-9 w-9 items-center justify-center rounded-md ${iconBg} shrink-0`}>
 <Icon className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-semibold text-foreground leading-tight">
 {insight.title}
 </p>
 <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
 تحلیل لحظه‌ای وضعیت مالی
 </p>
 </div>
 <Button
 size="icon"
 variant="ghost"
 className="h-6 w-6 shrink-0"
 onClick={refresh}
 aria-label="به‌روزرسانی"
 >
 <RefreshCw className="h-3 w-3" />
 </Button>
 </div>
 <p className="text-[11px] text-foreground/90 leading-relaxed">
 {insight.message}
 </p>
 <Button
 size="sm"
 variant="outline"
 className="w-full h-8 gap-1.5 text-xs"
 onClick={() =>
 window.dispatchEvent(new CustomEvent("hoshhesab:open-assistant"))
 }
 >
 <Sparkles className="h-3.5 w-3.5" />
 گفتگو با دستیار
 </Button>
 </div>
 );
}

/* ============ ۱۱) امتیاز سلامت مالی — تحلیل هوشمند ============ */

interface HealthKPIs {
 revenue: number;
 expenses: number;
 profit: number;
 cash: number;
 receivable: number;
 payable: number;
}

interface ScoreFactor {
 label: string;
 contribution: number;
 description: string;
}

/** محاسبه‌ی امتیاز سلامت مالی (0..100) بر اساس KPIهای واقعی */
function computeHealthScore(kpis: HealthKPIs): {
 score: number;
 factors: ScoreFactor[];
} {
 const factors: ScoreFactor[] = [];
 let s = 50; // امتیاز پایه

 // ۱. سودآوری (±۱۵)
 let profitContrib = 0;
 if (kpis.profit > 0) profitContrib = 15;
 else if (kpis.profit < 0) profitContrib = -15;
 s += profitContrib;
 factors.push({
 label: "سودآوری",
 contribution: profitContrib,
 description:
 profitContrib > 0
? "سود خالص مثبت"
: profitContrib < 0
? "سود خالص منفی"
: "سود خالص صفر",
 });

 // ۲. موجودی نقدی (+۱۰/−۱۰)
 const cashContrib = kpis.cash > 0? 10: -10;
 s += cashContrib;
 factors.push({
 label: "موجودی نقدی",
 contribution: cashContrib,
 description: cashContrib > 0? "موجودی نقدی مثبت": "بدون موجودی نقدی",
 });

 // ۳. نسبت طلب به بدهی (±۱۰/−۵)
 // اگر مطالبات > بدهی +۱۰ (پول بیشتری به ما طلب است تا آنچه ما بدهکاریم)
 let recPayContrib = 0;
 if (kpis.receivable > 0 && kpis.payable > 0) {
 recPayContrib = kpis.receivable > kpis.payable? 10: -5;
 } else if (kpis.receivable > 0 && kpis.payable === 0) {
 recPayContrib = 10;
 } else if (kpis.payable > 0 && kpis.receivable === 0) {
 recPayContrib = -5;
 }
 s += recPayContrib;
 factors.push({
 label: "نسبت طلب به بدهی",
 contribution: recPayContrib,
 description:
 recPayContrib > 0
? "مطالبات بیشتر از بدهی"
: recPayContrib < 0
? "بدهی بیشتر از مطالبات"
: "بدون طلب و بدهی",
 });

 // ۴. درآمد در برابر هزینه (±۱۵/−۱۰)
 let revExpContrib = 0;
 if (kpis.revenue > kpis.expenses) revExpContrib = 15;
 else if (kpis.revenue < kpis.expenses) revExpContrib = -10;
 s += revExpContrib;
 factors.push({
 label: "درآمد در برابر هزینه",
 contribution: revExpContrib,
 description:
 revExpContrib > 0
? "درآمد بیشتر از هزینه"
: revExpContrib < 0
? "هزینه بیشتر از درآمد"
: "درآمد و هزینه برابر",
 });

 // ۵. ذخیره‌ی نقدی (±۱۰)
 let bufferContrib = 0;
 if (kpis.expenses > 0 && kpis.cash > 0) {
 const ratio = kpis.cash / kpis.expenses;
 if (ratio >= 2) bufferContrib = 10;
 else if (ratio >= 1) bufferContrib = 5;
 else if (ratio >= 0.5) bufferContrib = 0;
 else bufferContrib = -10;
 } else if (kpis.expenses > 0 && kpis.cash <= 0) {
 bufferContrib = -10;
 }
 s += bufferContrib;
 factors.push({
 label: "ذخیره‌ی نقدی",
 contribution: bufferContrib,
 description: "نسبت موجودی نقدی به هزینه‌های جاری",
 });

 // ۶. پوشش بدهی (±۵)
 let debtContrib = 0;
 if (kpis.payable === 0) {
 debtContrib = 5; // بدون بدهی
 } else if (kpis.cash > 0) {
 debtContrib = kpis.cash / kpis.payable >= 1? 5: -5;
 } else {
 debtContrib = -5;
 }
 s += debtContrib;
 factors.push({
 label: "پوشش بدهی",
 contribution: debtContrib,
 description: "توانایی پرداخت بدهی از نقدینگی",
 });

 const score = Math.max(0, Math.min(100, s));
 return { score, factors };
}

/** انیمیشن شمارش از ۰ تا عدد هدف در مدت مشخص (easeOutCubic) */
function useCountUp(target: number, duration = 1200): number {
 const [value, setValue] = React.useState(0);
 React.useEffect(() => {
 if (target <= 0) {
 setValue(0);
 return;
 }
 let raf = 0;
 const startTs = performance.now();
 const tick = (now: number) => {
 const progress = Math.min(1, (now - startTs) / duration);
 const eased = 1 - Math.pow(1 - progress, 3);
 setValue(Math.round(target * eased));
 if (progress < 1) raf = requestAnimationFrame(tick);
 };
 raf = requestAnimationFrame(tick);
 return () => cancelAnimationFrame(raf);
 }, [target, duration]);
 return value;
}

function HealthScoreWidget() {
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [kpis, setKpis] = React.useState<HealthKPIs | null>(null);
 const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
 const [showDetails, setShowDetails] = React.useState(false);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 // FIX: استفاده از fetch مشترک (کش ۳۰ ثانیه‌ای) به‌جای fetch مستقیم —
 // قبلاً این ویجت کش مشترک را دور می‌زد و یک درخواست اضافه می‌زد.
 const data = await fetchDashboardShared();
 setKpis(data.kpis as HealthKPIs);
 setLastUpdated(new Date());
 } catch (err) {
 console.error("HealthScoreWidget fetch error:", err);
 setError("خطا در بارگذاری داده‌ها");
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 fetchData();
 }, [fetchData]);

 const hasData = React.useMemo(() => {
 if (!kpis) return false;
 return (
 kpis.revenue > 0 ||
 kpis.expenses > 0 ||
 kpis.profit > 0 ||
 kpis.cash > 0 ||
 kpis.receivable > 0 ||
 kpis.payable > 0
 );
 }, [kpis]);

 const { score, factors } = React.useMemo(() => {
 if (!kpis) return { score: 0, factors: [] as ScoreFactor[] };
 return computeHealthScore(kpis);
 }, [kpis]);

 const animated = useCountUp(score);

 const level = React.useMemo(() => {
 if (!hasData)
 return {
 label: "بدون داده",
 color: "text-muted-foreground",
 bg: "bg-muted",
 desc: "برای محاسبه‌ی امتیاز سلامت مالی، ابتدا فاکتور یا تراکنش ثبت کنید",
 };
 if (score >= 80)
 return {
 label: "عالی",
 color: "text-success",
 bg: "bg-success",
 desc: "وضعیت مالی کسبوکار شما بسیار مطلوب است",
 };
 if (score >= 60)
 return {
 label: "خوب",
 color: "text-info",
 bg: "bg-info",
 desc: "وضعیت مالی پایدار است، فرصت بهبود وجود دارد",
 };
 if (score >= 40)
 return {
 label: "متوسط",
 color: "text-warning",
 bg: "bg-warning",
 desc: "نیاز به توجه در مدیریت جریان نقدی",
 };
 return {
 label: "ضعیف",
 color: "text-destructive",
 bg: "bg-destructive",
 desc: "وضعیت مالی نیازمند اقدام فوری است",
 };
 }, [score, hasData]);

 const radius = 42;
 const circumference = 2 * Math.PI * radius;
 const strokeDashoffset = circumference - (animated / 100) * circumference;

 // موقعیت نقطه‌ی پالس روی قوس (از بالا، در جهت عقربه‌ها)
 const pulseAngleRad = (animated / 100) * 2 * Math.PI;
 const pulseX = 50 + radius * Math.sin(pulseAngleRad);
 const pulseY = 50 - radius * Math.cos(pulseAngleRad);

 const metrics = React.useMemo(() => {
 if (!kpis) return [];
 const cashToman = kpis.cash / 10;
 const profitToman = kpis.profit / 10;
 const payableToman = kpis.payable / 10;
 const receivableToman = kpis.receivable / 10;
 return [
 {
 label: "نقدینگی",
 value: kpis.cash > 0? "مطلوب": "ضعیف",
 positive: kpis.cash > 0,
 amount: kpis.cash > 0? formatCompactToman(cashToman): "—",
 },
 {
 label: "سودآوری",
 value:
 kpis.profit > 0? "سود‌ده": kpis.profit < 0? "زیان‌ده": "متعادل",
 positive: kpis.profit >= 0,
 amount: kpis.profit!== 0? formatCompactToman(Math.abs(profitToman)): "—",
 },
 {
 label: "بدهی",
 value: kpis.payable > 0? "دارای بدهی": "بدون بدهی",
 positive: kpis.payable === 0 || kpis.cash > kpis.payable,
 amount: kpis.payable > 0? formatCompactToman(payableToman): "—",
 },
 {
 label: "مطالبات",
 value: kpis.receivable > 0? "در جریان": "بدون طلب",
 positive: kpis.receivable > 0,
 amount: kpis.receivable > 0? formatCompactToman(receivableToman): "—",
 },
 ];
 }, [kpis]);

 const lastUpdatedLabel = React.useMemo(() => {
 if (!lastUpdated) return "";
 const hh = String(lastUpdated.getHours()).padStart(2, "0");
 const mm = String(lastUpdated.getMinutes()).padStart(2, "0");
 return `${toJalali(lastUpdated)} ${toPersianDigits(`${hh}:${mm}`)}`;
 }, [lastUpdated]);

 const isGlowing = hasData && score >= 60;
 const gradStart = hasData
? score >= 60
? "stop-success"
: score >= 40
? "stop-warning"
: "stop-destructive"
: "stop-muted-foreground";
 const gradEnd = hasData
? score >= 60
? "stop-teal-400"
: score >= 40
? "stop-amber-400"
: "stop-red-400"
: "stop-muted-foreground/50";
 const pulseColor = hasData
? score >= 60
? "rgb(20,184,166)"
: score >= 40
? "rgb(245,158,11)"
: "rgb(239,68,68)"
: "rgb(161,161,170)";

 // ===== حالت بارگذاری =====
 if (loading) {
 return (
 <div className="space-y-3">
 <div className="flex items-center gap-3">
 <Skeleton className="h-24 w-24 rounded-full shrink-0" />
 <div className="flex-1 space-y-2">
 <Skeleton className="h-3 w-20" />
 <Skeleton className="h-3 w-full" />
 <Skeleton className="h-3 w-3/4" />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-1.5">
 {Array.from({ length: 4 }).map((_, i) => (
 <Skeleton key={i} className="h-10 w-full rounded-md" />
 ))}
 </div>
 </div>
 );
 }

 // ===== حالت خطا =====
 if (error) {
 return (
 <div className="space-y-3">
 <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
 <AlertCircle className="h-8 w-8 text-destructive" />
 <p className="text-xs text-muted-foreground">خطا در بارگذاری — تلاش مجدد</p>
 <Button
 size="sm"
 variant="outline"
 className="h-7 gap-1.5 text-xs"
 onClick={fetchData}
 >
 <RefreshCw className="h-3 w-3" />
 تلاش مجدد
 </Button>
 </div>
 </div>
 );
 }

 // ===== حالت خالی (بدون داده) =====
 if (!hasData) {
 return (
 <div className="space-y-3">
 <div className="flex items-center gap-3">
 <div className="relative shrink-0">
 <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
 <circle
 cx="50"
 cy="50"
 r={radius}
 className="stroke-muted/30"
 strokeWidth="6"
 fill="none"
 />
 </svg>
 <div className="absolute inset-0 flex flex-col items-center justify-center">
 <span className="text-[10px] font-medium text-muted-foreground">
 بدون داده
 </span>
 </div>
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5 mb-1">
 <span className="h-2 w-2 rounded-full bg-muted" />
 <span className="text-sm font-bold text-muted-foreground">
 بدون داده
 </span>
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
 برای محاسبه‌ی امتیاز سلامت مالی، ابتدا فاکتور یا تراکنش ثبت کنید
 </p>
 </div>
 </div>
 </div>
 );
 }

 // ===== حالت موفق (داده‌ی واقعی) =====
 return (
 <div className="space-y-3">
 {/* هدر: عنوان + دکمه‌ی به‌روزرسانی */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5">
 <Activity className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[10px] text-muted-foreground">
 تحلیل هوشمند سلامت مالی
 </span>
 </div>
 <div className="flex items-center gap-1.5">
 {lastUpdatedLabel && (
 <span className="text-[9px] text-muted-foreground/70 tnum hidden sm:inline">
 به‌روزرسانی: {lastUpdatedLabel}
 </span>
 )}
 <Button
 size="icon"
 variant="ghost"
 className="h-6 w-6"
 onClick={fetchData}
 aria-label="به‌روزرسانی"
 >
 <RefreshCw className="h-3 w-3" />
 </Button>
 </div>
 </div>

 <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
 {/* دایره‌ی امتیاز */}
 <div
 className={`relative shrink-0 ${
 isGlowing? "drop-shadow-[0_0_12px_rgba(20,184,166,0.35)]": ""
 }`}
 >
 <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
 <defs>
 <linearGradient
 id="health-widget-grad"
 x1="0"
 y1="0"
 x2="1"
 y2="1"
 >
 <stop offset="0%" className={gradStart} />
 <stop offset="100%" className={gradEnd} />
 </linearGradient>
 </defs>
 <circle
 cx="50"
 cy="50"
 r={radius}
 className="stroke-muted/30"
 strokeWidth="6"
 fill="none"
 />
 <circle
 cx="50"
 cy="50"
 r={radius}
 className="stroke-[url(#health-widget-grad)]"
 strokeWidth="6"
 fill="none"
 strokeLinecap="round"
 strokeDasharray={circumference}
 strokeDashoffset={strokeDashoffset}
 style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
 />
 </svg>
 {/* نقطه‌ی پالس روی قوس */}
 {animated > 0 && (
 <div
 className="absolute h-2.5 w-2.5 rounded-full shadow-sm animate-pulse pointer-events-none"
 style={{
 left: `calc(${pulseX}% - 5px)`,
 top: `calc(${pulseY}% - 5px)`,
 background: pulseColor,
 }}
 />
 )}
 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
 <span className="text-2xl font-bold text-foreground tnum">
 {toPersianDigits(String(animated))}
 </span>
 <span className="text-[9px] text-muted-foreground">از ۱۰۰</span>
 </div>
 </div>
 {/* توضیحات */}
 <div className="flex-1 min-w-0 text-center sm:text-right">
 <div className="flex items-center justify-center sm:justify-start gap-1.5 mb-1">
 <span
 className={`h-2 w-2 rounded-full ${level.bg} animate-pulse`}
 />
 <span className={`text-sm font-bold ${level.color}`}>
 {level.label}
 </span>
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
 {level.desc}
 </p>
 </div>
 </div>

 {/* شاخص‌های فرعی */}
 <div className="grid grid-cols-2 gap-1.5">
 {metrics.map((m) => (
 <div
 key={m.label}
 className="flex items-center gap-1.5 rounded-md bg-muted/30 hover:bg-muted/50 hover:scale-[1.02] transition-all px-2 py-1.5 cursor-default"
 >
 <span
 className={`h-1.5 w-1.5 rounded-full shrink-0 ${
 m.positive? "bg-success": "bg-warning"
 }`}
 />
 <div className="flex flex-col min-w-0 flex-1">
 <span className="text-[9px] text-muted-foreground leading-tight">
 {m.label}
 </span>
 <span className="text-[10px] font-medium text-foreground leading-tight truncate">
 {m.value}
 </span>
 {m.amount!== "—" && (
 <span className="text-[8px] text-muted-foreground/80 leading-tight truncate tnum">
 {m.amount}
 </span>
 )}
 </div>
 </div>
 ))}
 </div>

 {/* دکمه‌ی مشاهده‌ی جزئیات */}
 <Button
 size="sm"
 variant="ghost"
 className="w-full h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
 onClick={() => setShowDetails((v) =>!v)}
 >
 {showDetails? (
 <>
 <ChevronUp className="h-3 w-3" />
 بستن جزئیات
 </>
 ): (
 <>
 <ChevronDown className="h-3 w-3" />
 مشاهده جزئیات
 </>
 )}
 </Button>

 {/* بخش جزئیات با انیمیشن */}
 <AnimatePresence initial={false}>
 {showDetails && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: "auto", opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 transition={{ duration: 0.25, ease: "easeInOut" }}
 className="overflow-hidden"
 >
 <div className="rounded-md border border-border overflow-hidden">
 <div className="bg-muted/50 px-2.5 py-1.5 flex items-center justify-between text-[9px] font-medium text-muted-foreground">
 <span>سهم در امتیاز</span>
 <span>عامل ارزیابی</span>
 </div>
 {factors.map((f, i) => (
 <div
 key={f.label}
 className={`px-2.5 py-1.5 flex items-center justify-between text-[10px] ${
 i % 2 === 0? "bg-background": "bg-muted/20"
 }`}
 >
 <span
 className={`font-bold tnum ${
 f.contribution > 0
? "text-success"
: f.contribution < 0
? "text-destructive"
: "text-muted-foreground"
 }`}
 >
 {f.contribution > 0? "+": ""}
 {toPersianDigits(String(f.contribution))}
 </span>
 <div className="flex flex-col items-end mr-1">
 <span className="font-medium text-foreground">{f.label}</span>
 <span className="text-[8px] text-muted-foreground/70">
 {f.description}
 </span>
 </div>
 </div>
 ))}
 <div className="bg-muted/40 px-2.5 py-1.5 flex items-center justify-between text-[10px] border-t border-border">
 <span className="font-bold text-foreground tnum">
 {toPersianDigits(String(score))}
 </span>
 <span className="font-medium text-muted-foreground">
 مجموع نهایی
 </span>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}

export default CustomizableDashboard;
