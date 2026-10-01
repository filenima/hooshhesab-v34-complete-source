"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 ShieldCheck,
 LogOut,
 LayoutDashboard,
 Building2,
 KeyRound,
 Zap,
 History,
 Search,
 Loader2,
 Copy,
 Check,
 Plus,
 Ban,
 Power,
 RefreshCw,
 Handshake,
 RotateCcw,
 ExternalLink,
 Link2,
 CalendarClock,
 Database,
 Users as UsersIcon,
 FileText,
 Package,
 Activity,
 AlertTriangle,
 X,
 Filter,
 BarChart3,
 MoreVertical,
 ChevronDown,
 ChevronUp,
 AlertCircle,
 Globe,
 ShieldAlert,
 Layers,
 Trash2,
 Eye,
 EyeOff,
 Smartphone,
 Lock,
 Unlock,
 Info,
 Server,
 DollarSign,
 ArrowUpDown,
 Clock,
 Key,
 UserCheck,
 ShieldBan,
 Sparkles,
 Bot,
 Settings,
 Save,
 CreditCard,
 Mail,
 Phone,
 Contact,
 StickyNote,
 LayoutGrid,
 List as ListIcon,
 TrendingUp,
 CircleDot,
 Plus as PlusIcon,
 Flag,
 Ticket as TicketIcon,
 Bug as BugIcon,
 Gauge as GaugeIcon,
 UserCog,
 Cog,
 PieChart,
 Send,
 Hash,
 Search as SearchIcon,
 PenSquare,
 CheckCircle2,
 Wrench,
 MailCheck,
 FileCheck,
 Receipt,
 Wallet,
 MessageSquare,
 ScrollText,
 // GOD-level icons
 Monitor,
 Database as DbIcon,
 Rocket,
 Timer,
 Palette,
 SwatchBook,
 HardDrive,
 UserSearch,
 TrendingDown,
 Download,
 Upload as UploadIcon,
 RefreshCcw,
 Trash,
 Terminal,
 GitBranch,
 Globe2,
 Siren,
 FileDown,
 FileUp,
 UserMinus,
 UserPlus,
 ArrowRightLeft,
 Network,
 Cpu,
 MemoryStick,
 Gauge,
 Workflow,
 CalendarDays,
 PencilRuler,
 Crown,
 Swords,
 Newspaper,
 MessageSquareQuote,
 Megaphone,
 Brain,
 ListTree,
 BadgePercent,
 FlaskConical,
 Radio,
 Puzzle,
 // v32 — کدهای تخفیف
 TicketPercent,
} from "lucide-react";
import { activateSiteEditor } from "@/hooks/use-site-content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PLANS, getPlanName, normalizePlanName, type PlanId } from "@/lib/plans";
// اطلاعات بیلد واقعی — نسخه از package.json (نه عدد جعلی)
import pkg from "../../package.json";
// v14 — رجیستری ۱۵ تم برای تب «تم و ظاهر پیش‌فرض»
import { THEMES } from "@/lib/theme-registry";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import {
 Tabs,
 TabsList,
 TabsTrigger,
 TabsContent,
} from "@/components/ui/tabs";
import { SafeBoundary } from "@/components/safe-boundary";
// v12.1: تب‌های جدید — گزارش باگ کاربران + مدیریت محدودیت پلن‌ها
import { BugReportsTab } from "@/components/views/superadmin/bug-reports-tab";
// Task 24 — کیف پول: بررسی برداشت‌ها + سوییچ‌های per-plan + تعدیل دستی
import { WalletAdminTab } from "@/components/views/superadmin/wallet-admin-tab";
// Task 3-c — مدیریت رفرال: فهرست کاربران + تعدیل دستی + کاربر تستی + مسابقه
import { ReferralAdminTab } from "@/components/views/superadmin/referral-admin-tab";
// Task 3-b — عملیات کاربران: مدیریت گروهی + کامنت داخلی tenant + معوق‌ها + هشدار افت استفاده
import { UserOpsTab } from "@/components/views/superadmin/user-ops-tab";
import { PlanLimitsTab } from "@/components/views/superadmin/plan-limits-tab";
import { SidebarConfigTab } from "@/components/views/superadmin/sidebar-config-tab";
import { DiscountRulesTab } from "@/components/views/superadmin/discount-rules-tab";
// v32 — تب کدهای تخفیف
import { CouponsTab } from "@/components/views/superadmin/coupons-tab";
// v28 — آمار ویجت‌های قابل embed (کانال توزیع شرکا)
import { WidgetsStatsTab } from "@/components/views/superadmin/widgets-stats-tab";
import { PartnersTab } from "@/components/views/superadmin/partners-tab";
import { PriceExperimentsTab } from "@/components/views/superadmin/price-experiments-tab";
import { ModuleManagerTab } from "@/components/views/superadmin/module-manager-tab";
// Task 3-d — نسخه‌ها و اطلاع‌رسانی + متن‌های پنل کاربر
import { VersionsTab } from "@/components/views/superadmin/versions-tab";
import { ModuleErrorFallback } from "@/components/ux/module-error-fallback";
import { BrandMark } from "@/components/brand/brand-mark";
import { setBrandingCache } from "@/hooks/use-branding";

// هِلپر برای پوشش دادن هر tab در SafeBoundary مخصوص خودش.
// اگر یک tab کرش کند، فقط همان tab fallback می‌گیرد و بقیه‌ی پنل کار می‌کند.
function SafeTab({
 name,
 children,
}: {
 name: string;
 children: React.ReactNode;
}) {
 return (
 <SafeBoundary fallback={<ModuleErrorFallback name={name} />}>
 {children}
 </SafeBoundary>
 );
}
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { TicketAttachmentThumbnails, type TicketAttachment } from "@/components/ux/ticket-image-attachments";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 BarChart,
 Bar,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 Cell,
 PieChart as RPieChart,
 Pie,
 Legend,
} from "recharts";
import {
 toPersianDigits,
 formatCompactToman,
 formatNumber,
 toJalali,
 getCurrentJalaliYear,
} from "@/lib/persian";
import { clearStoredAdmin } from "@/components/views/superadmin-login";
import { CompetitorAnalysisView } from "@/components/views/competitor-analysis-view";
import { CmsEditorTab } from "@/components/views/superadmin/cms-editor-tab";
import { BlogEditorTab } from "@/components/views/superadmin/blog-editor-tab";
import { NewsletterTab } from "@/components/views/superadmin/newsletter-tab";
import { TestimonialsTab } from "@/components/views/superadmin/testimonials-tab";
import { AdsTab } from "@/components/views/superadmin/ads-tab";
import { TrustBadgesTab } from "@/components/views/superadmin/trust-badges-tab";
import { TenantHealthBadge } from "@/components/views/superadmin/tenant-health-badge";
import {
 BulkOperationsBar,
 SelectAllCheckbox,
 RowCheckbox,
} from "@/components/views/superadmin/bulk-operations-bar";
import { OnlinePresenceWidget } from "@/components/views/superadmin/online-presence-widget";
import { QueryExplorer } from "@/components/views/superadmin/query-explorer";
import { SchemaVisualizer } from "@/components/views/superadmin/schema-visualizer";
import { SlowQueriesPanel } from "@/components/views/superadmin/slow-queries-panel";
import { RootAIPanel } from "@/components/views/root-ai-panel";
import { AiSettingsTab } from "@/components/views/superadmin/ai-settings-tab";
import { AnalyticsDashboard } from "@/components/views/analytics-dashboard";
import { ComplianceDashboard } from "@/components/views/compliance-dashboard";
import { HealthDashboard } from "@/components/views/health-dashboard";
import { CohortDashboard } from "@/components/views/cohort-dashboard";
import { FeatureAdoptionDashboard } from "@/components/views/feature-adoption-dashboard";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SystemLogsTab } from "@/components/views/system-logs-tab";
// FIX(8-a): داشبورد مالی SaaS — MRR/ARR/Churn + نمودار رشد ۱۲ ماه
import { SaasFinanceTab } from "@/components/views/superadmin/saas-finance-tab";
// Task 3-a: هوش درآمد — MRR/ARR + پیش‌بینی، VAT کل، ساعات اوج، سلامت/ریزش tenantها
import { RevenueIntelligenceTab } from "@/components/views/superadmin/revenue-intelligence-tab";
// FIX(13-a): بکاپ‌گیری خودکار روزانه + دانلود
import BackupTab from "@/components/views/superadmin/backup-tab";
// FIX(10-b/11-a/12-b): پیام‌های گروهی + هشدارهای سلامت
import MessagingTab from "@/components/views/superadmin/messaging-tab";
// Task 12+13: آزمایش A/B پوش + تنظیمات ایمیل SMTP/یادآور 2FA
import PushAbTab from "@/components/views/superadmin/push-ab-tab";
import SmtpSettingsTab from "@/components/views/superadmin/smtp-settings-tab";
import { DomainRegistrationTab } from "@/components/views/superadmin/domain-registration-tab";
// Task 10 — گزارش زندهٔ رخدادها (پخش real-time لاگ ممیزی از audit-stream-service :3034)
import { AuditLiveTab } from "@/components/views/superadmin/audit-live-tab";
// Task 11+14b — نقشهٔ geo-location نشست‌ها (تب کاربران آنلاین) + ویجت امتیاز امنیت هدرها (تب امنیت)
import { GeoSessionsMap } from "@/components/views/superadmin/geo-sessions-map";
import { SecurityHeadersWidget } from "@/components/views/superadmin/security-headers-widget";

interface SuperAdminPanelProps {
 token: string;
 admin: { id: string; username: string; role: string };
 onLogout: () => void;
 onQuickLogin: (token: string, tenantName?: string) => void;
 onBackToSite: () => void;
}

// ============ انواع داده‌ای ============
interface Stats {
 counts: {
 tenants: number;
 activeTenants: number;
 users: number;
 licenses: number;
 activeLicenses: number;
 purchasedLicenses?: number;
 activePurchases?: number;
 activeTrials?: number;
 invoices: number;
 products: number;
 auditLogs: number;
 };
 billing?: {
 activeSubscriptions: number;
 subscriptionRevenueToman: number;
 activeTrials?: number;
 noSalesYet?: boolean;
 };
 planDistribution: { plan: string; count: number }[];
 recentTenants: {
 id: string;
 name: string;
 plan: string;
 status: string;
 createdAt: string;
 users: number;
 invoices: number;
 products: number;
 license: { key: string; plan: string; status: string } | null;
 }[];
 recentLogins: {
 id: string;
 name: string;
 email: string;
 lastLogin: string | null;
 tenant?: string;
 }[];
}

interface TenantRow {
 id: string;
 name: string;
 subdomain: string | null;
 plan: string;
 status: string;
 createdAt: string;
 counts: { users: number; invoices: number; products: number; parties: number };
 license: { key: string; plan: string; status: string; endDate: string | null } | null;
}

interface LicenseRow {
 id: string;
 key: string;
 plan: string;
 status: string;
 source?: string | null;
 amountToman?: number | null;
 maxUsers: number;
 maxInvoices: number;
 maxWarehouses: number;
 features: string;
 startDate: string | null;
 endDate: string | null;
 createdAt: string;
 tenant: { id: string; name: string; plan: string; status: string } | null;
}

interface AuditLogRow {
 id: string;
 action: string;
 entity: string;
 entityId: string | null;
 details: string | null;
 ipAddress: string | null;
 createdAt: string;
 superAdmin: { username: string } | null;
}

const PLAN_LABELS: Record<string, string> = {
 // نام‌های نرمال‌شده (canonical)
 free: "رایگان",
 basic: "پایه",
 pro: "حرفه‌ای",
 enterprise: "سازمانی",
 // نام‌های قدیمی برای سازگاری با داده‌های موجود
 starter: "رایگان",
 business: "حرفه‌ای",
 accountant: "حرفه‌ای",
};

const STATUS_LABELS: Record<string, string> = {
 active: "فعال",
 suspended: "تعلیق‌شده",
 ACTIVE: "فعال",
 SUSPENDED: "معلق",
 REVOKED: "ابطال‌شده",
};

function planBadge(plan: string) {
 // پشتیبانی از هر دو دسته نام (نرمال‌شده و قدیمی) برای رنگ‌بندی
 const map: Record<string, string> = {
 free: "bg-muted text-muted-foreground",
 basic: "bg-primary/10 text-primary",
 pro: "bg-primary/10 text-primary",
 enterprise: "bg-warning/10 text-warning",
 // legacy aliases
 starter: "bg-muted text-muted-foreground",
 business: "bg-primary/10 text-primary",
 accountant: "bg-chart-5/10 text-chart-5",
 };
 return map[plan] || "bg-muted text-muted-foreground";
}

function statusBadge(status: string) {
 const map: Record<string, string> = {
 active: "bg-success/10 text-success",
 ACTIVE: "bg-success/10 text-success",
 suspended: "bg-warning/10 text-warning",
 SUSPENDED: "bg-warning/10 text-warning",
 REVOKED: "bg-destructive/10 text-destructive",
 };
 return map[status] || "bg-muted text-muted-foreground";
}

function apiFetch(path: string, token: string, options: RequestInit = {}) {
 return fetch(path, {
...options,
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
...(options.headers || {}),
 },
 }).then((res) => {
 // ─── 401 handler: توکن منقضی شده خروج خودکار ───
 if (res.status === 401) {
 if (typeof window!== "undefined") {
 try {
 localStorage.removeItem("hoshhesab_admin_token");
 localStorage.removeItem("hoshhesab_admin_user");
 } catch { /* ignore */ }
 // هدایت به صفحه اصلی و نمایش پیام
 window.location.href = "/";
 }
 }
 return res;
 });
}

/**
 * FIX(B3): دانلود فایل از اندپوینت‌های محافظت‌شده — لینک مستقیم <a href>
 * هدر Authorization را نمی‌فرستاد و به‌جای فایل، پاسخ 401 JSON دانلود می‌شد.
 * این helper با fetch + Blob دانلود واقعی انجام می‌دهد.
 */
async function downloadProtectedFile(path: string, token: string, fallbackName = "hoshhesab-backup.json") {
 const res = await fetch(path, {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) {
 throw new Error(`دانلود ناموفق (${res.status})`);
 }
 const blob = await res.blob();
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 // نام فایل از Content-Disposition یا نام پیش‌فرض
 const dispo = res.headers.get("content-disposition") || "";
 const match = dispo.match(/filename="?([^";]+)"?/i);
 a.download = match? decodeURIComponent(match[1]): fallbackName;
 document.body.appendChild(a);
 a.click();
 a.remove();
 setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ============ آیتم سایدبار ============
// دکمه‌ی تک‌انتخابی برای ناوبری عمودی پنل سوپرادمین
function SidebarItem({
 icon: Icon,
 value,
 label,
 active,
 onSelect,
 god,
}: {
 icon: React.ComponentType<{ className?: string }>;
 value: string;
 label: string;
 active: boolean;
 onSelect: (v: string) => void;
 god?: boolean;
}) {
 return (
 <button
 type="button"
 onClick={() => onSelect(value)}
 className={cn(
 "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-right",
 active
? "bg-primary text-primary-foreground shadow-sm"
: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
 god &&!active && "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
 )}
 >
 <Icon className="h-4 w-4 shrink-0" />
 <span className="truncate">{label}</span>
 </button>
 );
}

// نگاشت مقدار tab به عنوان فارسی برای هدر بالای محتوا
const TAB_TITLES: Record<string, string> = {
 dashboard: "داشبورد",
 tenants: "سازمان‌ها",
 users: "مدیریت کاربران",
 licenses: "لایسنس‌ها",
 quick: "ورود فوری",
 crm: "CRM و مشتریان",
 cms: "مدیریت محتوا",
 "blog-editor": "ویرایشگر بلاگ",
 newsletter: "خبرنامه",
 testimonials: "نظرات مشتریان",
 ads: "تبلیغات",
 "trust-badges": "نمادهای اعتماد",
 audit: "لاگ تغییرات",
 errors: "لاگ خطاها",
 security: "امنیت و IP",
 competitors: "تحلیل رقبا",
 analytics: "تحلیل‌ها",
 cohort: "کوهورت",
 adoption: "پذیرش ویژگی",
 compliance: "انطباق",
 "root-ai": "دستیار روت",
 "ai-settings": "هوش مصنوعی و دانش‌نامه",
 health: "سلامت سیستم",
 "feature-flags": "فلگ‌های ویژگی",
 tickets: "تیکت‌های پشتیبانی",
 "bug-reports": "گزارش‌های باگ",
 "plan-limits": "محدودیت پلن‌ها",
 "module-manager": "مدیریت منوی کاربران",
 "versions": "نسخه‌ها و اطلاع‌رسانی",
 "adv-users": "مدیریت پیشرفته کاربران",
 "platform-settings": "تنظیمات پلتفرم",
 reports: "گزارش‌ها و تحلیل‌ها",
 "content-seo": "محتوا و سئو",
 settings: "تنظیمات",
 modian: "سامانه مودیان",
 // v32 — کدهای تخفیف
 coupons: "کدهای تخفیف",
 billing: "صورتحساب و پرداخت",
 "saas-finance": "داشبورد مالی SaaS",
 backups: "بکاپ‌گیری و بازیابی",
 messaging: "پیام‌های گروهی",
 "push-ab": "آزمایش A/B پوش",
 "smtp-settings": "تنظیمات ایمیل SMTP",
 domains: "دامنه‌ها",
 notifications: "پیامک و ایمیل",
 "system-logs": "لاگ‌های سیستم",
 "sys-monitor": "مانیتور سیستم",
 "db-manager": "دیتابیس",
 deploy: "دیپلوی و سرور",
 cron: "کارهای زمان‌بندی",
 branding: "برندینگ و وایت‌لیبل",
 "theme-default": "تم و ظاهر (پیش‌فرض)",
 "data-mgr": "مدیریت داده",
 impersonate: "جعل هویت (Impersonate)",
 consolidation: "تلفیق مالی",
 "threat-center": "مرکز تهدیدات",
 "global-control": "کنترل سراسری",
 "api-gateway": "API گیت‌وی",
 "cache-perf": "کش و پردفرمانس",
 "db-query": "کوئری اکسپلورر",
 "db-schema": "اسکیما دیتابیس",
 "db-slow": "کوئری‌های کند",
 "online-users": "کاربران آنلاین",
 "widgets-stats": "آمار ویجت‌های شرکا",
 "partners": "درخواست‌های شراکت",
};
function getTabTitle(value: string): string {
 return TAB_TITLES[value] || "پنل مدیریت";
}

// ============ کامپوننت اصلی ============
export function SuperAdminPanel({
 token,
 admin,
 onLogout,
 onQuickLogin,
 onBackToSite,
}: SuperAdminPanelProps) {
 const { toast } = useToast();
 const [tab, setTab] = React.useState("dashboard");
 // FIX(B22): رفرنس منوی موبایل — بعد از انتخاب تب بسته می‌شود
 const mobileMenuRef = React.useRef<HTMLDetailsElement>(null);

 const handleLogout = () => {
 clearStoredAdmin();
 toast({ title: "خروج انجام شد", description: "از پنل مدیریت خارج شدید." });
 onLogout();
 };

 return (
 <div className="flex h-screen overflow-hidden bg-background">
 {/* ──── سایدبار راست (RTL) ──── */}
 <aside className="hidden md:flex w-64 border-l border-border bg-card/50 backdrop-blur-sm flex-col shrink-0">
 {/* هدر سایدبار: لوگو + ادمین */}
 <div className="p-4 border-b border-border">
 <div className="flex items-center gap-2.5">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shrink-0">
 <ShieldCheck className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-sm font-bold leading-tight truncate">پنل مدیریت</p>
 <p className="text-[11px] text-muted-foreground leading-tight truncate">
 {admin.username} · {admin.role || "superadmin"}
 </p>
 </div>
 </div>
 </div>

 {/* لیست ناوبری با اسکرول */}
 <ScrollArea className="flex-1 px-2 py-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
 {/* گروه ۱: اصلی */}
 <div className="mb-4">
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 uppercase tracking-wide">اصلی</p>
 <SidebarItem icon={LayoutDashboard} value="dashboard" label="داشبورد" active={tab === "dashboard"} onSelect={setTab} />
 <SidebarItem icon={CircleDot} value="online-users" label="کاربران آنلاین" active={tab === "online-users"} onSelect={setTab} />
 <SidebarItem icon={Building2} value="tenants" label="سازمان‌ها" active={tab === "tenants"} onSelect={setTab} />
 <SidebarItem icon={UsersIcon} value="users" label="مدیریت کاربران" active={tab === "users"} onSelect={setTab} />
 <SidebarItem icon={KeyRound} value="licenses" label="لایسنس‌ها" active={tab === "licenses"} onSelect={setTab} />
 <SidebarItem icon={Globe} value="domains" label="دامنه‌ها" active={tab === "domains"} onSelect={setTab} />
 <SidebarItem icon={Zap} value="quick" label="ورود فوری" active={tab === "quick"} onSelect={setTab} />
 </div>

 {/* گروه ۲: محتوا */}
 <div className="mb-4">
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 uppercase tracking-wide">محتوا</p>
 <SidebarItem icon={FileText} value="cms" label="مدیریت محتوا" active={tab === "cms"} onSelect={setTab} />
 <SidebarItem icon={Newspaper} value="blog-editor" label="ویرایشگر بلاگ" active={tab === "blog-editor"} onSelect={setTab} />
 <SidebarItem icon={Mail} value="newsletter" label="خبرنامه" active={tab === "newsletter"} onSelect={setTab} />
 <SidebarItem icon={MessageSquareQuote} value="testimonials" label="نظرات مشتریان" active={tab === "testimonials"} onSelect={setTab} />
 <SidebarItem icon={Megaphone} value="ads" label="تبلیغات" active={tab === "ads"} onSelect={setTab} />
 <SidebarItem icon={ShieldCheck} value="trust-badges" label="نمادها" active={tab === "trust-badges"} onSelect={setTab} />
 <SidebarItem icon={Contact} value="crm" label="CRM و مشتریان" active={tab === "crm"} onSelect={setTab} />
 <SidebarItem icon={PieChart} value="reports" label="گزارش‌ها و تحلیل‌ها" active={tab === "reports"} onSelect={setTab} />
 <SidebarItem icon={Globe} value="content-seo" label="محتوا و سئو" active={tab === "content-seo"} onSelect={setTab} />
 </div>

 {/* گروه ۳: تحلیل */}
 <div className="mb-4">
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 uppercase tracking-wide">تحلیل</p>
 <SidebarItem icon={BarChart3} value="analytics" label="تحلیل‌ها" active={tab === "analytics"} onSelect={setTab} />
 <SidebarItem icon={Layers} value="cohort" label="کوهورت" active={tab === "cohort"} onSelect={setTab} />
 <SidebarItem icon={DollarSign} value="revenue-intelligence" label="هوش درآمد" active={tab === "revenue-intelligence"} onSelect={setTab} />
 <SidebarItem icon={Activity} value="adoption" label="پذیرش ویژگی" active={tab === "adoption"} onSelect={setTab} />
 <SidebarItem icon={ShieldCheck} value="compliance" label="انطباق" active={tab === "compliance"} onSelect={setTab} />
 <SidebarItem icon={TrendingUp} value="competitors" label="تحلیل رقبا" active={tab === "competitors"} onSelect={setTab} />
 <SidebarItem icon={Puzzle} value="widgets-stats" label="آمار ویجت‌های شرکا" active={tab === "widgets-stats"} onSelect={setTab} />
 <SidebarItem icon={Handshake} value="partners" label="درخواست‌های شراکت" active={tab === "partners"} onSelect={setTab} />
 </div>

 {/* گروه ۴: امنیت */}
 <div className="mb-4">
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 uppercase tracking-wide">امنیت</p>
 <SidebarItem icon={History} value="audit" label="لاگ تغییرات" active={tab === "audit"} onSelect={setTab} />
 <SidebarItem icon={Radio} value="audit-live" label="گزارش زندهٔ رخدادها" active={tab === "audit-live"} onSelect={setTab} />
 <SidebarItem icon={AlertCircle} value="errors" label="لاگ خطاها" active={tab === "errors"} onSelect={setTab} />
 <SidebarItem icon={ShieldAlert} value="security" label="امنیت و IP" active={tab === "security"} onSelect={setTab} />
 <SidebarItem icon={Activity} value="health" label="سلامت سیستم" active={tab === "health"} onSelect={setTab} />
 <SidebarItem icon={ScrollText} value="system-logs" label="لاگ‌های سیستم" active={tab === "system-logs"} onSelect={setTab} />
 </div>

 {/* گروه ۵: سیستم */}
 <div className="mb-4">
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 uppercase tracking-wide">سیستم</p>
 <SidebarItem icon={Flag} value="feature-flags" label="فلگ‌های ویژگی" active={tab === "feature-flags"} onSelect={setTab} />
 <SidebarItem icon={Cog} value="platform-settings" label="تنظیمات پلتفرم" active={tab === "platform-settings"} onSelect={setTab} />
 <SidebarItem icon={Settings} value="settings" label="تنظیمات" active={tab === "settings"} onSelect={setTab} />
 <SidebarItem icon={TicketIcon} value="tickets" label="تیکت‌های پشتیبانی" active={tab === "tickets"} onSelect={setTab} />
 <SidebarItem icon={BugIcon} value="bug-reports" label="گزارش‌های باگ (پاداش)" active={tab === "bug-reports"} onSelect={setTab} />
 <SidebarItem icon={Wallet} value="wallet-admin" label="کیف پول و برداشت‌ها" active={tab === "wallet-admin"} onSelect={setTab} />
 <SidebarItem icon={UsersIcon} value="referral-admin" label="مدیریت رفرال" active={tab === "referral-admin"} onSelect={setTab} />
 <SidebarItem icon={GaugeIcon} value="plan-limits" label="محدودیت پلن‌ها" active={tab === "plan-limits"} onSelect={setTab} />
 <SidebarItem icon={ListTree} value="sidebar-config" label="چیدمان سایدبار کاربران" active={tab === "sidebar-config"} onSelect={setTab} />
 <SidebarItem icon={BadgePercent} value="discount-rules" label="تخفیف‌های خودکار" active={tab === "discount-rules"} onSelect={setTab} />
 <SidebarItem icon={TicketPercent} value="coupons" label="کدهای تخفیف" active={tab === "coupons"} onSelect={setTab} />
 <SidebarItem icon={FlaskConical} value="price-experiments" label="آزمایش A/B قیمت" active={tab === "price-experiments"} onSelect={setTab} />
 <SidebarItem icon={ListTree} value="module-manager" label="مدیریت منوی کاربران" active={tab === "module-manager"} onSelect={setTab} />
 <SidebarItem icon={GitBranch} value="versions" label="نسخه‌ها و اطلاع‌رسانی" active={tab === "versions"} onSelect={setTab} />
 <SidebarItem icon={UserCog} value="adv-users" label="مدیریت پیشرفته کاربران" active={tab === "adv-users"} onSelect={setTab} />
 <SidebarItem icon={ArrowUpDown} value="user-ops" label="عملیات کاربران" active={tab === "user-ops"} onSelect={setTab} />
 </div>

 {/* گروه ۶: GOD */}
 <div className="mb-4">
 <p className="text-[10px] font-semibold text-amber-600 px-3 mb-1 uppercase tracking-wide"> GOD</p>
 <SidebarItem icon={Power} value="global-control" label="کنترل سراسری" active={tab === "global-control"} onSelect={setTab} god />
 <SidebarItem icon={Rocket} value="deploy" label="دیپلوی و سرور" active={tab === "deploy"} onSelect={setTab} god />
 <SidebarItem icon={Gauge} value="cache-perf" label="کش و پردفرمانس" active={tab === "cache-perf"} onSelect={setTab} god />
 <SidebarItem icon={Palette} value="branding" label="برندینگ و وایت‌لیبل" active={tab === "branding"} onSelect={setTab} god />
 <SidebarItem icon={SwatchBook} value="theme-default" label="تم و ظاهر (پیش‌فرض)" active={tab === "theme-default"} onSelect={setTab} god />
 <SidebarItem icon={Timer} value="cron" label="کارهای زمان‌بندی" active={tab === "cron"} onSelect={setTab} god />
 <SidebarItem icon={Network} value="api-gateway" label="API گیت‌وی" active={tab === "api-gateway"} onSelect={setTab} god />
 <SidebarItem icon={HardDrive} value="data-mgr" label="مدیریت داده" active={tab === "data-mgr"} onSelect={setTab} god />
 <SidebarItem icon={UserSearch} value="impersonate" label="جعل هویت (Impersonate)" active={tab === "impersonate"} onSelect={setTab} god />
 <SidebarItem icon={Crown} value="consolidation" label="تلفیق مالی" active={tab === "consolidation"} onSelect={setTab} god />
 <SidebarItem icon={Swords} value="threat-center" label="مرکز تهدیدات" active={tab === "threat-center"} onSelect={setTab} god />
 <SidebarItem icon={Monitor} value="sys-monitor" label="مانیتور سیستم" active={tab === "sys-monitor"} onSelect={setTab} god />
 <SidebarItem icon={DbIcon} value="db-manager" label="دیتابیس" active={tab === "db-manager"} onSelect={setTab} god />
 <SidebarItem icon={Terminal} value="db-query" label="کوئری اکسپلورر" active={tab === "db-query"} onSelect={setTab} god />
 <SidebarItem icon={Network} value="db-schema" label="اسکیما دیتابیس" active={tab === "db-schema"} onSelect={setTab} god />
 <SidebarItem icon={Clock} value="db-slow" label="کوئری‌های کند" active={tab === "db-slow"} onSelect={setTab} god />
 </div>

 {/* گروه ۷: سایر */}
 <div className="mb-2">
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 uppercase tracking-wide">سایر</p>
 <SidebarItem icon={Bot} value="root-ai" label="دستیار روت" active={tab === "root-ai"} onSelect={setTab} />
 <SidebarItem icon={Brain} value="ai-settings" label="هوش مصنوعی و دانش‌نامه" active={tab === "ai-settings"} onSelect={setTab} />
 <SidebarItem icon={Wallet} value="billing" label="صورتحساب و پرداخت" active={tab === "billing"} onSelect={setTab} />
 <SidebarItem icon={TrendingUp} value="saas-finance" label="داشبورد مالی SaaS" active={tab === "saas-finance"} onSelect={setTab} />
 <SidebarItem icon={Database} value="backups" label="بکاپ‌گیری و بازیابی" active={tab === "backups"} onSelect={setTab} />
 <SidebarItem icon={Mail} value="messaging" label="پیام‌های گروهی" active={tab === "messaging"} onSelect={setTab} />
 <SidebarItem icon={FlaskConical} value="push-ab" label="آزمایش A/B پوش" active={tab === "push-ab"} onSelect={setTab} />
 <SidebarItem icon={Mail} value="smtp-settings" label="تنظیمات ایمیل SMTP" active={tab === "smtp-settings"} onSelect={setTab} />
 <SidebarItem icon={MessageSquare} value="notifications" label="پیامک و ایمیل" active={tab === "notifications"} onSelect={setTab} />
 <SidebarItem icon={FileCheck} value="modian" label="سامانه مودیان" active={tab === "modian"} onSelect={setTab} />
 </div>
 </ScrollArea>

 {/* دکمه خروج پایین سایدبار */}
 <div className="p-3 border-t border-border">
 <Button
 variant="outline"
 className="w-full text-destructive hover:text-destructive hover:bg-destructive/5"
 onClick={handleLogout}
 >
 <LogOut className="h-4 w-4 ml-2" />
 خروج
 </Button>
 </div>
 </aside>

 {/* ──── محتوای اصلی ──── */}
 <main className="flex-1 overflow-auto flex flex-col min-w-0">
 {/* هدر بالای محتوا */}
 <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6 py-3 flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0">
 {/* دکمه منوی موبایل */}
 <details className="md:hidden relative" ref={mobileMenuRef}>
 <summary className="list-none cursor-pointer inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-background hover:bg-accent">
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
 </summary>
 <div className="absolute right-0 top-full mt-1 w-64 max-h-[70vh] overflow-auto bg-card border border-border rounded-lg shadow-lg p-2 z-30">
 {/* بازتولید آیتم‌های سایدبار برای موبایل — FIX(B22): بعد از انتخاب تب، منو بسته می‌شود */}
 <MobileSidebarNav
 tab={tab}
 setTab={(v) => {
 setTab(v);
 // بستن <details> بعد از انتخاب — قبلاً منوی ۷۰vh روی محتوای انتخابی می‌ماند
 if (mobileMenuRef.current) mobileMenuRef.current.removeAttribute("open");
 }}
 />
 </div>
 </details>
 <h1 className="text-base lg:text-lg font-bold truncate">{getTabTitle(tab)}</h1>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <Button
 variant="outline"
 size="sm"
 className="text-primary hover:text-primary hover:bg-primary/5"
 onClick={() => {
 // فعال‌سازی ویرایشگر بصری سایت — پرچم + توکن در sessionStorage
 // سپس onBackToSite در app-shell پرچم را می‌بیند و به صفحه فرود می‌رود
 activateSiteEditor(token);
 toast({
 title: "حالت ویرایش سایت فعال شد",
 description: "روی هر بخش صفحه فرود کلیک کنید تا ویرایش شود. از نوار بالای صفحه ذخیره کنید.",
 });
 onBackToSite();
 }}
 >
 <PencilRuler className="h-3.5 w-3.5 ml-1" />
 <span className="hidden sm:inline">ویرایشگر سایت</span>
 </Button>
 <Button variant="outline" size="sm" onClick={onBackToSite}>
 <ExternalLink className="h-3.5 w-3.5 ml-1" />
 <span className="hidden sm:inline">نمایش سایت</span>
 </Button>
 <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive md:hidden" onClick={handleLogout}>
 <LogOut className="h-3.5 w-3.5" />
 </Button>
 </div>
 </header>

 {/* محتوای فعال — رندر شرطی */}
 <div className="flex-1 p-4 lg:p-6">
 {tab === "dashboard" && (
 <SafeTab name="داشبورد سوپرادمین"><DashboardTab token={token} /></SafeTab>
 )}
 {tab === "tenants" && (
 <SafeTab name="مدیریت سازمان‌ها"><TenantsTab token={token} onQuickLogin={onQuickLogin} /></SafeTab>
 )}
 {tab === "users" && (
 <SafeTab name="مدیریت کاربران"><UsersTab token={token} onQuickLogin={onQuickLogin} /></SafeTab>
 )}
 {tab === "licenses" && (
 <SafeTab name="لایسنس‌ها"><LicensesTab token={token} /></SafeTab>
 )}
 {tab === "quick" && (
 <SafeTab name="ورود سریع"><QuickLoginTab token={token} onQuickLogin={onQuickLogin} /></SafeTab>
 )}
 {tab === "crm" && (
 <SafeTab name="CRM"><CRMTab token={token} onQuickLogin={onQuickLogin} /></SafeTab>
 )}
 {tab === "cms" && (
 <SafeTab name="مدیریت محتوا"><CMSTab /></SafeTab>
 )}
 {tab === "blog-editor" && (
 <SafeTab name="ویرایشگر بلاگ"><BlogTab /></SafeTab>
 )}
 {tab === "newsletter" && (
 <SafeTab name="خبرنامه"><NewsletterTab token={token} /></SafeTab>
 )}
 {tab === "testimonials" && (
 <SafeTab name="نظرات مشتریان"><TestimonialsTab token={token} /></SafeTab>
 )}
 {tab === "ads" && (
 <SafeTab name="تبلیغات"><AdsTab token={token} /></SafeTab>
 )}
 {tab === "trust-badges" && (
 <SafeTab name="نمادهای اعتماد"><TrustBadgesTab token={token} /></SafeTab>
 )}
 {tab === "audit" && (
 <SafeTab name="لاگ ممیزی"><AuditTab token={token} /></SafeTab>
 )}
 {tab === "audit-live" && <AuditLiveTab />}
 {tab === "errors" && (
 <SafeTab name="خطاها"><ErrorsTab token={token} /></SafeTab>
 )}
 {tab === "security" && (
 <SafeTab name="امنیت"><SecurityTab token={token} /></SafeTab>
 )}
 {tab === "competitors" && (
 <SafeTab name="تحلیل رقبا"><CompetitorAnalysisView token={token} /></SafeTab>
 )}
 {tab === "analytics" && (
 <SafeTab name="آنالیتیکس"><AnalyticsDashboard token={token} /></SafeTab>
 )}
 {tab === "revenue-intelligence" && (
 <SafeTab name="هوش درآمد"><RevenueIntelligenceTab token={token} /></SafeTab>
 )}
 {tab === "widgets-stats" && (
 <SafeTab name="آمار ویجت‌ها"><WidgetsStatsTab token={token} /></SafeTab>
 )}
 {tab === "partners" && (
 <SafeTab name="درخواست‌های شراکت"><PartnersTab token={token} /></SafeTab>
 )}
 {tab === "cohort" && (
 <SafeTab name="داشبورد کوهورت"><CohortDashboard token={token} /></SafeTab>
 )}
 {tab === "adoption" && (
 <SafeTab name="پذیرش ویژگی‌ها"><FeatureAdoptionDashboard token={token} /></SafeTab>
 )}
 {tab === "compliance" && (
 <SafeTab name="تطبیق"><ComplianceDashboard token={token} /></SafeTab>
 )}
 {tab === "root-ai" && (
 <SafeTab name="هوش مصنوعی ریشه"><RootAIPanel /></SafeTab>
 )}
 {tab === "ai-settings" && (
 <SafeTab name="هوش مصنوعی و دانش‌نامه"><AiSettingsTab token={token} /></SafeTab>
 )}
 {tab === "health" && (
 <SafeTab name="سلامت سیستم"><HealthDashboard token={token} /></SafeTab>
 )}
 {tab === "feature-flags" && (
 <SafeTab name="feature flags"><FeatureFlagsTab token={token} /></SafeTab>
 )}
 {tab === "tickets" && (
 <SafeTab name="تیکت‌های پشتیبانی"><SupportTicketsTab token={token} /></SafeTab>
 )}
 {tab === "bug-reports" && (
 <SafeTab name="گزارش‌های باگ"><BugReportsTab token={token} /></SafeTab>
 )}
 {tab === "wallet-admin" && (
 <SafeTab name="کیف پول و برداشت‌ها"><WalletAdminTab token={token} /></SafeTab>
 )}
 {tab === "referral-admin" && (
 <SafeTab name="مدیریت رفرال"><ReferralAdminTab token={token} /></SafeTab>
 )}
 {tab === "plan-limits" && (
 <SafeTab name="محدودیت پلن‌ها"><PlanLimitsTab token={token} /></SafeTab>
 )}
 {tab === "sidebar-config" && (
 <SafeTab name="چیدمان سایدبار کاربران"><SidebarConfigTab token={token} /></SafeTab>
 )}
 {tab === "discount-rules" && (
 <SafeTab name="تخفیف‌های خودکار"><DiscountRulesTab token={token} /></SafeTab>
 )}
 {tab === "coupons" && (
 <SafeTab name="کدهای تخفیف"><CouponsTab token={token} /></SafeTab>
 )}
 {tab === "price-experiments" && (
 <SafeTab name="آزمایش A/B قیمت"><PriceExperimentsTab token={token} /></SafeTab>
 )}
 {tab === "module-manager" && (
 <SafeTab name="مدیریت منوی کاربران"><ModuleManagerTab token={token} /></SafeTab>
 )}
 {tab === "versions" && (
 <SafeTab name="نسخه‌ها و اطلاع‌رسانی"><VersionsTab token={token} /></SafeTab>
 )}
 {tab === "adv-users" && (
 <SafeTab name="مدیریت پیشرفته کاربران"><AdvancedUserManagementTab token={token} onQuickLogin={onQuickLogin} /></SafeTab>
 )}
 {tab === "user-ops" && (
 <SafeTab name="عملیات کاربران"><UserOpsTab token={token} /></SafeTab>
 )}
 {tab === "platform-settings" && (
 <SafeTab name="تنظیمات پلتفرم"><PlatformSettingsTab token={token} /></SafeTab>
 )}
 {tab === "reports" && (
 <SafeTab name="گزارش‌ها و تحلیل‌ها"><ReportsAnalyticsTab token={token} /></SafeTab>
 )}
 {tab === "content-seo" && (
 <SafeTab name="محتوا و سئو"><ContentSEOTab token={token} /></SafeTab>
 )}
 {tab === "settings" && (
 <SafeTab name="تنظیمات"><SettingsTab token={token} /></SafeTab>
 )}
 {tab === "modian" && (
 <SafeTab name="سامانه مودیان"><ModianManagementTab token={token} /></SafeTab>
 )}
 {tab === "billing" && (
 <SafeTab name="صورتحساب و پرداخت"><BillingPaymentsTab token={token} /></SafeTab>
 )}
 {tab === "saas-finance" && (
 <SafeTab name="داشبورد مالی SaaS"><SaasFinanceTab token={token} /></SafeTab>
 )}
 {tab === "backups" && (
 <SafeTab name="بکاپ‌گیری و بازیابی"><BackupTab token={token} /></SafeTab>
 )}
 {tab === "messaging" && (
 <SafeTab name="پیام‌های گروهی"><MessagingTab token={token} /></SafeTab>
 )}
 {tab === "push-ab" && (
 <SafeTab name="آزمایش A/B پوش"><PushAbTab token={token} /></SafeTab>
 )}
 {tab === "smtp-settings" && (
 <SafeTab name="تنظیمات ایمیل SMTP"><SmtpSettingsTab token={token} /></SafeTab>
 )}
 {tab === "domains" && (
 <SafeTab name="دامنه‌ها"><DomainRegistrationTab token={token} /></SafeTab>
 )}
 {tab === "notifications" && (
 <SafeTab name="پیامک و ایمیل"><NotificationsConfigTab token={token} /></SafeTab>
 )}
 {tab === "system-logs" && (
 <SafeTab name="لاگ‌های سیستم"><SystemLogsTab token={token} /></SafeTab>
 )}
 {/* ──── GOD-Level Tab Contents ──── */}
 {tab === "sys-monitor" && (
 <SafeTab name="مانیتور سیستم"><SystemMonitorTab token={token} /></SafeTab>
 )}
 {tab === "db-manager" && (
 <SafeTab name="مدیریت دیتابیس"><DatabaseManagerTab token={token} /></SafeTab>
 )}
 {tab === "deploy" && (
 <SafeTab name="دیپلوی و سرور"><DeploymentControlTab token={token} /></SafeTab>
 )}
 {tab === "cron" && (
 <SafeTab name="کارهای زمان‌بندی"><CronManagerTab token={token} /></SafeTab>
 )}
 {tab === "branding" && (
 <SafeTab name="برندینگ و وایت‌لیبل"><BrandingTab token={token} /></SafeTab>
 )}
 {tab === "theme-default" && (
 <SafeTab name="تم و ظاهر (پیش‌فرض)"><ThemeDefaultTab token={token} /></SafeTab>
 )}
 {tab === "data-mgr" && (
 <SafeTab name="مدیریت داده"><DataManagerTab token={token} /></SafeTab>
 )}
 {tab === "impersonate" && (
 <SafeTab name="جعل هویت"><ImpersonateTab token={token} onQuickLogin={onQuickLogin} /></SafeTab>
 )}
 {tab === "consolidation" && (
 <SafeTab name="تلفیق مالی"><ConsolidationTab token={token} /></SafeTab>
 )}
 {tab === "threat-center" && (
 <SafeTab name="مرکز تهدیدات"><ThreatCenterTab token={token} /></SafeTab>
 )}
 {tab === "global-control" && (
 <SafeTab name="کنترل سراسری"><GlobalControlTab token={token} /></SafeTab>
 )}
 {tab === "api-gateway" && (
 <SafeTab name="API گیت‌وی"><APIGatewayTab token={token} /></SafeTab>
 )}
 {tab === "cache-perf" && (
 <SafeTab name="کش و پردفرمانس"><CachePerformanceTab token={token} /></SafeTab>
 )}
 {tab === "db-query" && (
 <SafeTab name="کوئری اکسپلورر"><QueryExplorer token={token} /></SafeTab>
 )}
 {tab === "db-schema" && (
 <SafeTab name="اسکیما دیتابیس"><SchemaVisualizer token={token} /></SafeTab>
 )}
 {tab === "db-slow" && (
 <SafeTab name="کوئری‌های کند"><SlowQueriesPanel token={token} /></SafeTab>
 )}
 {tab === "online-users" && (
 <SafeTab name="کاربران آنلاین">
 <GeoSessionsMap token={token} />
 <div className="max-w-2xl mx-auto pt-4">
 <OnlinePresenceWidget token={token} />
 </div>
 </SafeTab>
 )}
 </div>
 </main>
 </div>
 );
}

// ──── منوی موبایل: بازتولید سایدبار در یک دیالوگ فشرده ────
function MobileSidebarNav({ tab, setTab }: { tab: string; setTab: (v: string) => void }) {
 const item = (icon: React.ComponentType<{ className?: string }>, value: string, label: string, god?: boolean) => (
 <SidebarItem icon={icon} value={value} label={label} active={tab === value} onSelect={setTab} god={god} />
 );
 return (
 <>
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 uppercase tracking-wide">اصلی</p>
 {item(LayoutDashboard, "dashboard", "داشبورد")}
 {item(CircleDot, "online-users", "کاربران آنلاین")}
 {item(Building2, "tenants", "سازمان‌ها")}
 {item(UsersIcon, "users", "مدیریت کاربران")}
 {item(KeyRound, "licenses", "لایسنس‌ها")}
 {item(Globe, "domains", "دامنه‌ها")}
 {item(Zap, "quick", "ورود فوری")}
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 mt-3 uppercase tracking-wide">محتوا</p>
 {item(FileText, "cms", "مدیریت محتوا")}
 {item(Newspaper, "blog-editor", "ویرایشگر بلاگ")}
 {item(Mail, "newsletter", "خبرنامه")}
 {item(MessageSquareQuote, "testimonials", "نظرات مشتریان")}
 {item(Megaphone, "ads", "تبلیغات")}
 {item(ShieldCheck, "trust-badges", "نمادها")}
 {item(Contact, "crm", "CRM و مشتریان")}
 {item(PieChart, "reports", "گزارش‌ها و تحلیل‌ها")}
 {item(Globe, "content-seo", "محتوا و سئو")}
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 mt-3 uppercase tracking-wide">تحلیل</p>
 {item(BarChart3, "analytics", "تحلیل‌ها")}
 {item(Layers, "cohort", "کوهورت")}
 {item(Activity, "adoption", "پذیرش ویژگی")}
 {item(ShieldCheck, "compliance", "انطباق")}
 {item(TrendingUp, "competitors", "تحلیل رقبا")}
 {item(Puzzle, "widgets-stats", "آمار ویجت‌های شرکا")}
 {item(Handshake, "partners", "درخواست‌های شراکت")}
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 mt-3 uppercase tracking-wide">امنیت</p>
 {item(History, "audit", "لاگ تغییرات")}
 {item(AlertCircle, "errors", "لاگ خطاها")}
 {item(ShieldAlert, "security", "امنیت و IP")}
 {item(Activity, "health", "سلامت سیستم")}
 {item(ScrollText, "system-logs", "لاگ‌های سیستم")}
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 mt-3 uppercase tracking-wide">سیستم</p>
 {item(Flag, "feature-flags", "فلگ‌های ویژگی")}
 {item(Cog, "platform-settings", "تنظیمات پلتفرم")}
 {item(Settings, "settings", "تنظیمات")}
 {item(TicketIcon, "tickets", "تیکت‌های پشتیبانی")}
 {item(BugIcon, "bug-reports", "گزارش‌های باگ")}
 {item(GaugeIcon, "plan-limits", "محدودیت پلن‌ها")}
 {item(TicketPercent, "coupons", "کدهای تخفیف")}
 {item(ListTree, "module-manager", "مدیریت منوی کاربران")}
 {item(GitBranch, "versions", "نسخه‌ها و اطلاع‌رسانی")}
 {item(UserCog, "adv-users", "مدیریت پیشرفته کاربران")}
 <p className="text-[10px] font-semibold text-amber-600 px-3 mb-1 mt-3 uppercase tracking-wide"> GOD</p>
 {item(Power, "global-control", "کنترل سراسری", true)}
 {item(Rocket, "deploy", "دیپلوی و سرور", true)}
 {item(Gauge, "cache-perf", "کش و پردفرمانس", true)}
 {item(Palette, "branding", "برندینگ و وایت‌لیبل", true)}
 {item(Timer, "cron", "کارهای زمان‌بندی", true)}
 {item(Network, "api-gateway", "API گیت‌وی", true)}
 {item(HardDrive, "data-mgr", "مدیریت داده", true)}
 {item(UserSearch, "impersonate", "جعل هویت (Impersonate)", true)}
 {item(Crown, "consolidation", "تلفیق مالی", true)}
 {item(Swords, "threat-center", "مرکز تهدیدات", true)}
 {item(Monitor, "sys-monitor", "مانیتور سیستم", true)}
 {item(DbIcon, "db-manager", "دیتابیس", true)}
 {item(Terminal, "db-query", "کوئری اکسپلورر", true)}
 {item(Network, "db-schema", "اسکیما دیتابیس", true)}
 {item(Clock, "db-slow", "کوئری‌های کند", true)}
 <p className="text-[10px] font-semibold text-muted-foreground px-3 mb-1 mt-3 uppercase tracking-wide">سایر</p>
 {item(Bot, "root-ai", "دستیار روت")}
 {item(Brain, "ai-settings", "هوش مصنوعی و دانش‌نامه")}
 {item(Wallet, "billing", "صورتحساب و پرداخت")}
 {item(MessageSquare, "notifications", "پیامک و ایمیل")}
 {item(FileCheck, "modian", "سامانه مودیان")}
 </>
 );
}

// ============ کارت آماری ============
function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent = "primary",
}: {
 icon: React.ElementType;
 label: string;
 value: string | number;
 sub?: string;
 accent?: "primary" | "success" | "warning" | "chart5" | "destructive";
}) {
 // v28 — لهجهٔ رنگی اختصاصی هر کارت: خط بالایی + آیکن + hover هماهنگ
 const accentMap: Record<string, string> = {
 primary: "bg-primary/10 text-primary [--accent:var(--primary)]",
 success: "bg-success/10 text-success [--accent:var(--success)]",
 warning: "bg-warning/10 text-warning [--accent:var(--warning)]",
 chart5: "bg-chart-5/10 text-chart-5 [--accent:var(--chart-5)]",
 destructive: "bg-destructive/10 text-destructive [--accent:var(--destructive)]",
 };
 return (
 <Card className="card-hover group relative overflow-hidden border-t-2 border-t-[var(--accent)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--accent)]/10">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-muted-foreground mb-1.5 truncate">{label}</p>
 <p className="text-[26px] font-extrabold leading-none tracking-tight tnum">{value}</p>
 {sub && <p className="text-[10px] text-muted-foreground mt-1.5">{sub}</p>}
 </div>
 <div
 className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 ${accentMap[accent]}`}
 >
 <Icon className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

// ============ تب مدیریت محتوا (CMS) ============
// اکنون به ویرایشگر قدرتمند جدید صفحات CMS متصل می‌شود.
function CMSTab() {
 return <CmsEditorTab />;
}

// ============ تب وبلاگ (Blog Editor قدرتمند) ============
function BlogTab() {
 return <BlogEditorTab />;
}

// ============ تب داشبورد ============
function DashboardTab({ token }: { token: string }) {
 const [stats, setStats] = React.useState<Stats | null>(null);
 const [trialCount, setTrialCount] = React.useState(0);
 const [todayErrors, setTodayErrors] = React.useState(0);
 const [revenue, setRevenue] = React.useState(0);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const res = await apiFetch("/api/platform/stats", token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 setStats(data.data);

 // بارگذاری موازی: کاربران تریال و لاگ خطاها
 const [trialRes, errRes] = await Promise.all([
 apiFetch("/api/platform/users?trial=true", token).catch(() => null),
 apiFetch("/api/platform/errors?limit=200", token).catch(() => null),
 ]);

 if (trialRes && trialRes.ok) {
 const td = await trialRes.json();
 if (td.success) setTrialCount(Array.isArray(td.data)? td.data.length: 0);
 }

 if (errRes && errRes.ok) {
 const ed = await errRes.json();
 if (ed.success && Array.isArray(ed.data)) {
 const startOfToday = new Date();
 startOfToday.setHours(0, 0, 0, 0);
 setTodayErrors(ed.data.filter((e: { createdAt: string }) => new Date(e.createdAt) >= startOfToday).length);
 }
 }

 // v33-c (درآمد صادقانه): درآمد واقعی از billing آمار پلتفرم خوانده می‌شود —
 // فقط لایسنس‌های خریداری‌شده (source="purchase")؛ تریال هرگز درآمد نیست.
 // قبلاً «تعداد سازمان × قیمت پلن» محاسبه می‌شد و عدد جعلی نمایش داده می‌شد.
 const billing = data.data?.billing || null;
 setRevenue(billing? billing.subscriptionRevenueToman?? 0: 0);
 } catch (e) {
 setError(e instanceof Error? e.message: "خطا در دریافت آمار");
 } finally {
 setLoading(false);
 }
 }, [token]);

 React.useEffect(() => {
 void load();
 }, [load]);

 if (loading) {
 return (
 <div className="flex items-center justify-center py-20 text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin me-2" />
 در حال بارگذاری آمار...
 </div>
 );
 }
 if (error ||!stats) {
 return (
 <div className="flex flex-col items-center justify-center py-20 gap-3">
 <AlertTriangle className="h-8 w-8 text-warning" />
 <p className="text-sm text-muted-foreground">{error || "داده‌ای یافت نشد"}</p>
 <Button variant="outline" size="sm" onClick={load}>
 <RefreshCw className="h-4 w-4" />
 تلاش مجدد
 </Button>
 </div>
 );
 }

 const c = stats.counts;
 // رنگ پلن‌ها — کلیدها با normalizePlanName پوشش همه‌ی پلن‌های واقعی/legacy را می‌دهد
 const planColors: Record<string, string> = {
 free: "bg-muted-foreground",
 basic: "bg-success",
 pro: "bg-primary",
 enterprise: "bg-warning",
 // legacy — فقط برای اطمینان اگر مقدار خام نمایش داده شود
 starter: "bg-success",
 business: "bg-primary",
 accountant: "bg-chart-5",
 };
 const maxPlan = Math.max(1,...stats.planDistribution.map((p) => p.count));

 return (
 <div className="space-y-5">
 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
 <StatCard icon={Building2} label="تعداد سازمان‌ها" value={toPersianDigits(c.tenants)} accent="primary" />
 <StatCard icon={Activity} label="سازمان‌های فعال" value={toPersianDigits(c.activeTenants)} accent="success" />
 <StatCard icon={UsersIcon} label="کاربران کل" value={toPersianDigits(c.users)} accent="chart5" />
 <StatCard
 icon={KeyRound}
 label="لایسنس‌های فعال"
 value={toPersianDigits(c.activeLicenses)}
 sub={`خریداری‌شده: ${toPersianDigits(c.activePurchases?? 0)} | تریال: ${toPersianDigits(c.activeTrials?? 0)}`}
 accent="primary"
 />
 <StatCard icon={FileText} label="فاکتورهای کل" value={toPersianDigits(c.invoices)} accent="warning" />
 <StatCard icon={Package} label="کالاهای کل" value={toPersianDigits(c.products)} accent="success" />
 </div>

 {/* کارت‌های جدید: درآمد، تریال، خطاهای امروز */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <Card className="card-hover group relative overflow-hidden border-primary/30 bg-gradient-to-bl from-primary/[0.07] via-transparent to-transparent">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-muted-foreground mb-1.5 truncate">درآمد واقعی پلتفرم (فروش لایسنس)</p>
 <p className="text-[26px] font-extrabold leading-none tracking-tight tnum text-primary">{formatCompactToman(revenue)}</p>
 <p className="text-[10px] text-muted-foreground mt-1.5">
 {revenue > 0
 ? "فقط لایسنس‌های خریداری‌شده — تریال درآمد نیست"
 : "هنوز فروشی ثبت نشده است — تریال‌ها درآمد حساب نمی‌شوند"}
 </p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
 <DollarSign className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover group relative overflow-hidden border-t-2 border-t-warning/70">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-muted-foreground mb-1.5 truncate">کاربران در حالت تریال</p>
 <p className="text-[26px] font-extrabold leading-none tracking-tight tnum">{toPersianDigits(trialCount)}</p>
 <p className="text-[10px] text-muted-foreground mt-1.5">نیازمند ارتقا یا تمدید</p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning transition-transform duration-300 group-hover:scale-110">
 <Clock className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover group relative overflow-hidden border-t-2 border-t-destructive/70">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-muted-foreground mb-1.5 truncate">خطاهای امروز</p>
 <p className={`text-[26px] font-extrabold leading-none tracking-tight tnum ${todayErrors > 0 ? "text-destructive" : ""}`}>{toPersianDigits(todayErrors)}</p>
 <p className="text-[10px] text-muted-foreground mt-1.5">رویدادهای ثبت‌شده امروز</p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-transform duration-300 group-hover:scale-110">
 <AlertCircle className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* ویجت کاربران آنلاین (live presence) — به‌روزرسانی خودکار هر ۶۰ ثانیه */}
 <OnlinePresenceWidget token={token} />

 {/* توزیع پلن‌ها */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm">توزیع پلن‌ها</CardTitle>
 <CardDescription className="text-xs">تفکیک سازمان‌ها بر اساس پلن فعلی</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 {stats.planDistribution.length === 0? (
 <p className="text-xs text-muted-foreground py-4 text-center">داده‌ای موجود نیست</p>
 ): (
 stats.planDistribution.map((p) => (
 <div key={p.plan} className="space-y-1">
 <div className="flex items-center justify-between text-xs">
 <span className="font-medium">{PLAN_LABELS[p.plan] || p.plan}</span>
 <span className="text-muted-foreground tnum">{toPersianDigits(p.count)} سازمان</span>
 </div>
 <div className="h-2 rounded-full bg-muted overflow-hidden">
 <div
 className={`h-full rounded-full transition-all ${planColors[normalizePlanName(p.plan)] || planColors[p.plan] || "bg-primary"}`}
 style={{ width: `${(p.count / maxPlan) * 100}%` }}
 />
 </div>
 </div>
 ))
 )}
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* سازمان‌های اخیر */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 سازمان‌های اخیر
 </CardTitle>
 </CardHeader>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px]">نام سازمان</TableHead>
 <TableHead className="text-start text-[11px]">پلن</TableHead>
 <TableHead className="text-start text-[11px]">وضعیت</TableHead>
 <TableHead className="text-end text-[11px]">کاربر</TableHead>
 <TableHead className="text-end text-[11px]">فاکتور</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {stats.recentTenants.length === 0? (
 <TableRow>
 <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
 موردی یافت نشد
 </TableCell>
 </TableRow>
 ): (
 stats.recentTenants.map((t) => (
 <TableRow key={t.id}>
 <TableCell className="text-xs font-medium truncate max-w-[140px]">
 {t.name}
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${planBadge(t.plan)}`}>
 {PLAN_LABELS[t.plan] || t.plan}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${statusBadge(t.status)}`}>
 {STATUS_LABELS[t.status] || t.status}
 </Badge>
 </TableCell>
 <TableCell className="text-end text-xs tnum">{toPersianDigits(t.users)}</TableCell>
 <TableCell className="text-end text-xs tnum">{toPersianDigits(t.invoices)}</TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* ورودهای اخیر */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <UsersIcon className="h-4 w-4 text-primary" />
 ورودهای اخیر
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 {stats.recentLogins.length === 0? (
 <p className="text-xs text-muted-foreground py-6 text-center">ورودی ثبت نشده است</p>
 ): (
 stats.recentLogins.map((u) => (
 <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
 <Avatar className="h-8 w-8">
 <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
 {u.name?.slice(0, 2) || "؟"}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium truncate">{u.name || "—"}</p>
 <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{u.email}</p>
 </div>
 <div className="text-end shrink-0">
 {u.tenant && (
 <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{u.tenant}</p>
 )}
 {u.lastLogin && (
 <p className="text-[10px] text-muted-foreground tnum">
 {toJalali(new Date(u.lastLogin))}
 </p>
 )}
 </div>
 </div>
 ))
 )}
 </CardContent>
 </Card>
 </div>
 </div>
 );
}

// ============ تب سازمان‌ها ============
function TenantsTab({
 token,
 onQuickLogin,
}: {
 token: string;
 onQuickLogin: (token: string, tenantName?: string) => void;
}) {
 const { toast } = useToast();
 const [tenants, setTenants] = React.useState<TenantRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [search, setSearch] = React.useState("");
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [suspendTarget, setSuspendTarget] = React.useState<TenantRow | null>(null);
 const [planTarget, setPlanTarget] = React.useState<TenantRow | null>(null);
 const [newPlan, setNewPlan] = React.useState("business");
 const [actingId, setActingId] = React.useState<string | null>(null);
 // ─── حالت bulk operations: انتخاب چند tenant ───
 const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

 const load = React.useCallback(async (searchOverride?: string, statusOverride?: string) => {
 setLoading(true);
 try {
 const params = new URLSearchParams();
 const s = searchOverride?? search;
 const st = statusOverride?? statusFilter;
 if (s.trim()) params.set("search", s.trim());
 if (st!== "all") params.set("status", st);
 const qs = params.toString();
 const res = await apiFetch(`/api/platform/tenants${qs? `?${qs}`: ""}`, token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setTenants(data.data || []);
 // پاک‌سازی انتخاب‌هایی که دیگر در لیست نیستند
 setSelectedIds((prev) => {
 const valid = new Set((data.data || []).map((t: TenantRow) => t.id));
 return prev.filter((id) => valid.has(id));
 });
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت سازمان‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, search, statusFilter, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const act = async (id: string, action: string, plan?: string) => {
 setActingId(id);
 try {
 const res = await apiFetch(`/api/platform/tenants/${id}`, token, {
 method: "PATCH",
 body: JSON.stringify(plan? { action, plan }: { action }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "عملیات موفق", description: data.message || "انجام شد" });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در عملیات",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 const quickLogin = async (id: string, name: string) => {
 setActingId(id);
 try {
 const res = await apiFetch("/api/platform/quick-login", token, {
 method: "POST",
 body: JSON.stringify({ tenantId: id }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "ورود فوری ایجاد شد",
 description: `کاربر ${data.user.username} برای «${name}» ساخته شد.`,
 });
 onQuickLogin(data.token, name);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ورود فوری",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 return (
 <div className="space-y-4">
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی نام سازمان..."
 className="ps-9 h-9"
 />
 </div>
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="h-9 w-full sm:w-[160px]">
 <Filter className="h-3.5 w-3.5" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه وضعیت‌ها</SelectItem>
 <SelectItem value="active">فعال</SelectItem>
 <SelectItem value="suspended">معلق</SelectItem>
 </SelectContent>
 </Select>
 <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 به‌روزرسانی
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="w-8 text-center text-[11px]">
 <SelectAllCheckbox
 allIds={tenants.map((t) => t.id)}
 selectedIds={selectedIds}
 onToggle={setSelectedIds}
 />
 </TableHead>
 <TableHead className="text-start text-[11px]">نام سازمان</TableHead>
 <TableHead className="text-start text-[11px]">پلن</TableHead>
 <TableHead className="text-start text-[11px]">وضعیت</TableHead>
 <TableHead className="text-center text-[11px]">سلامت</TableHead>
 <TableHead className="text-end text-[11px]">کاربران</TableHead>
 <TableHead className="text-end text-[11px]">فاکتورها</TableHead>
 <TableHead className="text-start text-[11px]">تاریخ ایجاد</TableHead>
 <TableHead className="text-start text-[11px]">لایسنس</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {tenants.length === 0? (
 <TableRow>
 <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">
 {loading? "در حال بارگذاری...": "سازمانی یافت نشد"}
 </TableCell>
 </TableRow>
 ): (
 tenants.map((t) => (
 <TableRow key={t.id} className={selectedIds.includes(t.id)? "bg-primary/5": ""}>
 <TableCell className="text-center">
 <RowCheckbox
 id={t.id}
 selectedIds={selectedIds}
 onToggle={setSelectedIds}
 />
 </TableCell>
 <TableCell>
 <div className="flex flex-col">
 <span className="text-xs font-medium truncate max-w-[160px]">{t.name}</span>
 {t.subdomain && (
 <span className="text-[10px] text-muted-foreground" dir="ltr">
 {t.subdomain}.hoosh.nobatime.ir
 </span>
 )}
 </div>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${planBadge(t.plan)}`}>
 {PLAN_LABELS[t.plan] || t.plan}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${statusBadge(t.status)}`}>
 {STATUS_LABELS[t.status] || t.status}
 </Badge>
 </TableCell>
 <TableCell className="text-center">
 <TenantHealthBadge tenantId={t.id} token={token} tenantName={t.name} />
 </TableCell>
 <TableCell className="text-end text-xs tnum">{toPersianDigits(t.counts.users)}</TableCell>
 <TableCell className="text-end text-xs tnum">{toPersianDigits(t.counts.invoices)}</TableCell>
 <TableCell className="text-xs tnum text-muted-foreground">
 {toJalali(new Date(t.createdAt))}
 </TableCell>
 <TableCell>
 {t.license? (
 <Badge variant="outline" className={`text-[10px] ${statusBadge(t.license.status)}`}>
 {STATUS_LABELS[t.license.status] || t.license.status}
 </Badge>
 ): (
 <span className="text-[10px] text-muted-foreground">—</span>
 )}
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-end gap-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] text-primary"
 onClick={() => quickLogin(t.id, t.name)}
 disabled={actingId === t.id}
 >
 {actingId === t.id? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): (
 <Zap className="h-3 w-3" />
 )}
 <span className="hidden sm:inline">ورود فوری</span>
 </Button>
 {t.status === "active"? (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] text-warning"
 onClick={() => setSuspendTarget(t)}
 disabled={actingId === t.id}
 >
 <Ban className="h-3 w-3" />
 <span className="hidden sm:inline">تعلیق</span>
 </Button>
 ): (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] text-success"
 onClick={() => act(t.id, "activate")}
 disabled={actingId === t.id}
 >
 <Power className="h-3 w-3" />
 <span className="hidden sm:inline">فعال‌سازی</span>
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px]"
 onClick={() => {
 setPlanTarget(t);
 setNewPlan(t.plan);
 }}
 >
 <RefreshCw className="h-3 w-3" />
 <span className="hidden sm:inline">پلن</span>
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* نوار عملیات گروهی — وقتی حداقل یک ردیف انتخاب شده */}
 <BulkOperationsBar
 selectedIds={selectedIds}
 selectedNames={tenants
.filter((t) => selectedIds.includes(t.id))
.map((t) => t.name)}
 token={token}
 onClear={() => setSelectedIds([])}
 onComplete={load}
 />

 {/* دیالوگ تأیید تعلیق */}
 <Dialog open={!!suspendTarget} onOpenChange={(o) =>!o && setSuspendTarget(null)}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <AlertTriangle className="h-4 w-4 text-warning" />
 تعلیق سازمان
 </DialogTitle>
 <DialogDescription className="text-xs">
 آیا از تعلیق «{suspendTarget?.name}» مطمئن هستید؟ همه کاربران این سازمان غیرفعال و لایسنس آن معلق می‌شود.
 </DialogDescription>
 </DialogHeader>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setSuspendTarget(null)}>
 لغو
 </Button>
 <Button
 variant="destructive"
 size="sm"
 onClick={async () => {
 if (suspendTarget) await act(suspendTarget.id, "suspend");
 setSuspendTarget(null);
 }}
 >
 <Ban className="h-4 w-4" />
 تعلیق سازمان
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ تغییر پلن */}
 <Dialog open={!!planTarget} onOpenChange={(o) =>!o && setPlanTarget(null)}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="text-base">تغییر پلن سازمان</DialogTitle>
 <DialogDescription className="text-xs">
 پلن جدید را برای «{planTarget?.name}» انتخاب کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2">
 <Label className="text-xs">پلن</Label>
 <Select value={newPlan} onValueChange={setNewPlan}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="starter">استارتر</SelectItem>
 <SelectItem value="business">کسب‌وکار</SelectItem>
 <SelectItem value="enterprise">سازمانی</SelectItem>
 <SelectItem value="accountant">حسابدار</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setPlanTarget(null)}>
 لغو
 </Button>
 <Button
 size="sm"
 onClick={async () => {
 if (planTarget) await act(planTarget.id, "changePlan", newPlan);
 setPlanTarget(null);
 }}
 >
 <Check className="h-4 w-4" />
 اعمال پلن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ============ تب لایسنس‌ها ============
function LicensesTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [licenses, setLicenses] = React.useState<LicenseRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [createOpen, setCreateOpen] = React.useState(false);
 const [createdKey, setCreatedKey] = React.useState<string | null>(null);
 const [copiedId, setCopiedId] = React.useState<string | null>(null);
 const [actingId, setActingId] = React.useState<string | null>(null);
 const [extendTarget, setExtendTarget] = React.useState<LicenseRow | null>(null);
 const [extendDays, setExtendDays] = React.useState("30");
 // فیلتر و جستجو
 const [search, setSearch] = React.useState("");
 const [statusFilter, setStatusFilter] = React.useState("all");

 // form state — پلن‌های واقعی از lib/plans.ts (free/basic/pro/enterprise)
 const [plan, setPlan] = React.useState<PlanId>("basic");
 const [maxUsers, setMaxUsers] = React.useState("");
 const [maxInvoices, setMaxInvoices] = React.useState("");
 const [maxWarehouses, setMaxWarehouses] = React.useState("");
 const [endDate, setEndDate] = React.useState("");
 // مدت اعتبار آماده: ۱/۳/۶/۱۲ ماه (پیش‌فرض ۱۲ ماه طبق قیمت‌گذاری سالانه)
 const [durationMonths, setDurationMonths] = React.useState<number | null>(12);
 const [tenantId, setTenantId] = React.useState("");
 const [creating, setCreating] = React.useState(false);

 // محاسبه تاریخ انقضا بر اساس مدت انتخاب‌شده (از امروز)
 React.useEffect(() => {
 if (durationMonths !== null) {
 const d = new Date();
 d.setMonth(d.getMonth() + durationMonths);
 setEndDate(d.toISOString().split("T")[0]);
 }
 }, [durationMonths]);

 // با تغییر پلن، محدودیت‌ها به پیش‌فرض پلن برگردند
 const handlePlanChange = (v: string) => {
 setPlan(v as PlanId);
 setMaxUsers("");
 setMaxInvoices("");
 setMaxWarehouses("");
 };

 // بازکردن دیالوگ ساخت لایسنس — بازمحاسبه تاریخ انقضا از امروز
 const openCreateDialog = () => {
 setCreateOpen(true);
 setCreatedKey(null);
 if (durationMonths !== null) {
 const d = new Date();
 d.setMonth(d.getMonth() + durationMonths);
 setEndDate(d.toISOString().split("T")[0]);
 }
 };

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/licenses", token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setLicenses(data.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت لایسنس‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const copyText = async (text: string, id: string) => {
 try {
 await navigator.clipboard.writeText(text);
 setCopiedId(id);
 toast({ title: "کپی شد", description: "در کلیپ‌بورد ذخیره شد." });
 setTimeout(() => setCopiedId(null), 2000);
 } catch {
 toast({ title: "خطا در کپی", variant: "destructive" });
 }
 };

 const createLicense = async () => {
 setCreating(true);
 try {
 const body: Record<string, unknown> = { plan };
 if (maxUsers) body.maxUsers = Number(maxUsers);
 if (maxInvoices) body.maxInvoices = Number(maxInvoices);
 if (maxWarehouses) body.maxWarehouses = Number(maxWarehouses);
 if (endDate) body.endDate = endDate;
 if (tenantId) body.tenantId = tenantId;
 const res = await apiFetch("/api/platform/licenses", token, {
 method: "POST",
 body: JSON.stringify(body),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setCreatedKey(data.data.key);
 toast({
 title: "لایسنس ایجاد شد",
 description: "کلید با موفقیت تولید شد.",
 });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ایجاد لایسنس",
 variant: "destructive",
 });
 } finally {
 setCreating(false);
 }
 };

 const act = async (id: string, action: string, days?: number) => {
 setActingId(id);
 try {
 const res = await apiFetch(`/api/platform/licenses/${id}`, token, {
 method: "PATCH",
 body: JSON.stringify(days? { action, days }: { action }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "عملیات موفق", description: data.message || "انجام شد" });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 // فیلتر محلی لایسنس‌ها (search + status)
 const filteredLicenses = React.useMemo(() => {
 let list = licenses;
 if (statusFilter!== "all") {
 list = list.filter((l) => l.status === statusFilter);
 }
 if (search.trim()) {
 const q = search.trim().toLowerCase();
 list = list.filter(
 (l) =>
 l.key.toLowerCase().includes(q) ||
 l.plan.toLowerCase().includes(q) ||
 (l.tenant?.name || "").toLowerCase().includes(q)
 );
 }
 return list;
 }, [licenses, search, statusFilter]);


 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between gap-2">
 <div>
 <h2 className="text-sm font-semibold">لایسنس‌های پلتفرم</h2>
 <p className="text-[11px] text-muted-foreground">مدیریت کلیدهای فعال‌سازی سازمان‌ها</p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 به‌روزرسانی
 </Button>
 <Button size="sm" onClick={openCreateDialog}>
 <Plus className="h-4 w-4" />
 تولید لایسنس جدید
 </Button>
 </div>
 </div>

 {/* فیلتر و جستجو */}
 <Card className="card-hover">
 <CardContent className="p-3">
 <div className="flex flex-wrap items-center gap-2">
 <div className="relative flex-1 min-w-[220px]">
 <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجو در کلید، پلن یا نام سازمان..."
 className="ps-8 h-9 text-xs"
 />
 </div>
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="w-[150px] h-9 text-xs">
 <Filter className="h-3.5 w-3.5 text-muted-foreground me-1.5" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه وضعیت‌ها</SelectItem>
 <SelectItem value="ACTIVE">فعال</SelectItem>
 <SelectItem value="SUSPENDED">معلق</SelectItem>
 <SelectItem value="REVOKED">ابطال‌شده</SelectItem>
 <SelectItem value="EXPIRED">منقضی</SelectItem>
 </SelectContent>
 </Select>
 {(search || statusFilter!== "all") && (
 <Button
 variant="ghost"
 size="sm"
 className="h-9 text-xs"
 onClick={() => {
 setSearch("");
 setStatusFilter("all");
 }}
 >
 پاک کردن فیلترها
 </Button>
 )}
 <div className="ms-auto text-[10px] text-muted-foreground tnum">
 {toPersianDigits(filteredLicenses.length)} از {toPersianDigits(licenses.length)} لایسنس
 </div>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px]">کلید لایسنس</TableHead>
 <TableHead className="text-start text-[11px]">پلن</TableHead>
 <TableHead className="text-start text-[11px]">وضعیت</TableHead>
 <TableHead className="text-end text-[11px]">کاربر/فاکتور</TableHead>
 <TableHead className="text-start text-[11px]">سازمان متصل</TableHead>
 <TableHead className="text-start text-[11px]">انقضا</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {licenses.length === 0? (
 <TableRow>
 <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
 {loading? "در حال بارگذاری...": "لایسنسی موجود نیست"}
 </TableCell>
 </TableRow>
 ): filteredLicenses.length === 0? (
 <TableRow>
 <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
 موردی با فیلتر انتخاب‌شده یافت نشد
 </TableCell>
 </TableRow>
 ): (
 filteredLicenses.map((l) => (
 <TableRow key={l.id}>
 <TableCell>
 <code className="text-[11px] font-mono text-foreground" dir="ltr">
 {l.key}
 </code>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${planBadge(l.plan)}`}>
 {PLAN_LABELS[l.plan] || l.plan}
 </Badge>
 </TableCell>
 <TableCell>
 <div className="flex items-center gap-1 flex-wrap">
 <Badge variant="secondary" className={`text-[10px] ${statusBadge(l.status)}`}>
 {STATUS_LABELS[l.status] || l.status}
 </Badge>
 {/* v33-c — تفکیک صادقانهٔ منبع لایسنس */}
 {l.source === "purchase"? (
 <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:text-emerald-300">
 خرید
 </Badge>
 ): l.source === "trial"? (
 <Badge variant="outline" className="text-[10px] text-muted-foreground">
 تریال
 </Badge>
 ): null}
 </div>
 </TableCell>
 <TableCell className="text-end text-[10px] tnum text-muted-foreground">
 {toPersianDigits(l.maxUsers)} / {toPersianDigits(l.maxInvoices)}
 </TableCell>
 <TableCell className="text-xs">
 {l.tenant? (
 <span className="truncate max-w-[120px] inline-block">{l.tenant.name}</span>
 ): (
 <span className="text-muted-foreground">—</span>
 )}
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground">
 {l.endDate? toJalali(new Date(l.endDate)): "نامحدود"}
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-end gap-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px]"
 onClick={() => copyText(l.key, l.id)}
 >
 {copiedId === l.id? (
 <Check className="h-3 w-3 text-success" />
 ): (
 <Copy className="h-3 w-3" />
 )}
 </Button>
 {l.status === "ACTIVE" && (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] text-warning"
 onClick={() => act(l.id, "suspend")}
 disabled={actingId === l.id}
 >
 <Ban className="h-3 w-3" />
 </Button>
 )}
 {l.status!== "ACTIVE" && (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] text-success"
 onClick={() => act(l.id, "activate")}
 disabled={actingId === l.id}
 >
 <Power className="h-3 w-3" />
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] text-destructive"
 onClick={() => act(l.id, "revoke")}
 disabled={actingId === l.id}
 >
 <X className="h-3 w-3" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] text-primary"
 onClick={() => {
 setExtendTarget(l);
 setExtendDays("30");
 }}
 >
 <CalendarClock className="h-3 w-3" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ ایجاد لایسنس */}
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle className="text-base">تولید لایسنس جدید</DialogTitle>
 <DialogDescription className="text-xs">
 یک کلید فعال‌سازی جدید برای سازمان بسازید.
 </DialogDescription>
 </DialogHeader>

 {createdKey? (
 <div className="space-y-3">
 <div className="rounded-xl border border-success/30 bg-success/5 p-4 space-y-2">
 <div className="flex items-center gap-2 text-success">
 <Check className="h-4 w-4" />
 <span className="text-sm font-medium">لایسنس ساخته شد</span>
 </div>
 <p className="text-[11px] text-muted-foreground">کلید زیر را کپی و در اختیار سازمان قرار دهید:</p>
 <div className="flex items-center gap-2">
 <code className="flex-1 rounded-lg bg-background border border-border px-3 py-2.5 text-sm font-mono text-foreground" dir="ltr">
 {createdKey}
 </code>
 <Button size="sm" variant="default" onClick={() => copyText(createdKey, "created")}>
 {copiedId === "created"? <Check className="h-4 w-4" />: <Copy className="h-4 w-4" />}
 کپی
 </Button>
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
 بستن
 </Button>
 <Button size="sm" variant="ghost" onClick={() => setCreatedKey(null)}>
 ساخت لایسنس دیگر
 </Button>
 </DialogFooter>
 </div>
 ): (
 <>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5 col-span-2">
 <Label className="text-xs">پلن (هماهنگ با صفحه قیمت‌گذاری)</Label>
 <Select value={plan} onValueChange={handlePlanChange}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {PLANS.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.name === "رایگان"? "آزمایشی (رایگان)": p.name}
 {p.priceToman > 0
? ` — ${(p.priceToman / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} میلیون تومان/سال`
: ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <p className="text-[10px] text-muted-foreground">
 محدودیت‌ها به‌طور خودکار از پلن پر می‌شوند؛ در صورت نیاز می‌توانید دستی تغییر دهید.
 </p>
 </div>
 <div className="space-y-1.5 col-span-2">
 <Label className="text-xs">مدت اعتبار لایسنس</Label>
 <div className="grid grid-cols-5 gap-1.5">
 {[
 { m: 1, label: "۱ ماه" },
 { m: 3, label: "۳ ماه" },
 { m: 6, label: "۶ ماه" },
 { m: 12, label: "۱۲ ماه" },
 ].map((d) => (
 <Button
 key={d.m}
 type="button"
 size="sm"
 variant={durationMonths === d.m? "default": "outline"}
 className="h-8 text-[11px]"
 onClick={() => setDurationMonths(d.m)}
 >
 {d.label}
 </Button>
 ))}
 <Button
 type="button"
 size="sm"
 variant={durationMonths === null? "default": "outline"}
 className="h-8 text-[11px]"
 onClick={() => {
 setDurationMonths(null);
 setEndDate("");
 }}
 >
 بدون انقضا
 </Button>
 </div>
 </div>
 <div className="space-y-1.5 col-span-2">
 <Label className="text-xs">
 تاریخ انقضا {durationMonths!== null? "(خودکار از مدت بالا — قابل ویرایش)": "(اختیاری)"}
 </Label>
 <JalaliDatePicker
 value={endDate}
 onChange={(v) => {
 setEndDate(v);
 setDurationMonths(null);
 }}
 className="h-9"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">حداکثر کاربران (اختیاری)</Label>
 <Input
 type="number"
 value={maxUsers}
 onChange={(e) => setMaxUsers(e.target.value)}
 placeholder={plan === "enterprise"? "نامحدود": "پیش‌فرض پلن"}
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">حداکثر فاکتورها</Label>
 <Input
 type="number"
 value={maxInvoices}
 onChange={(e) => setMaxInvoices(e.target.value)}
 placeholder="پیش‌فرض پلن"
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">حداکثر انبارها</Label>
 <Input
 type="number"
 value={maxWarehouses}
 onChange={(e) => setMaxWarehouses(e.target.value)}
 placeholder="پیش‌فرض پلن"
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5 col-span-2">
 <Label className="text-xs">شناسه سازمان (اختیاری)</Label>
 <Input
 value={tenantId}
 onChange={(e) => setTenantId(e.target.value)}
 placeholder="برای اتصال به سازمان مشخص"
 className="h-9"
 dir="ltr"
 />
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
 لغو
 </Button>
 <Button size="sm" onClick={createLicense} disabled={creating}>
 {creating? <Loader2 className="h-4 w-4 animate-spin" />: <KeyRound className="h-4 w-4" />}
 تولید کلید
 </Button>
 </DialogFooter>
 </>
 )}
 </DialogContent>
 </Dialog>

 {/* دیالوگ تمدید */}
 <Dialog open={!!extendTarget} onOpenChange={(o) =>!o && setExtendTarget(null)}>
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle className="text-base">تمدید لایسنس</DialogTitle>
 <DialogDescription className="text-xs">
 تعداد روز تمدید را وارد کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2">
 <Label className="text-xs">تعداد روز</Label>
 <Input
 type="number"
 value={extendDays}
 onChange={(e) => setExtendDays(e.target.value)}
 className="h-9"
 dir="ltr"
 />
 <div className="flex gap-1.5">
 {[30, 90, 180, 365].map((d) => (
 <Button
 key={d}
 variant="outline"
 size="sm"
 className="h-7 text-[11px] flex-1"
 onClick={() => setExtendDays(String(d))}
 >
 {toPersianDigits(d)} روز
 </Button>
 ))}
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setExtendTarget(null)}>
 لغو
 </Button>
 <Button
 size="sm"
 onClick={async () => {
 if (extendTarget) await act(extendTarget.id, "extend", Number(extendDays));
 setExtendTarget(null);
 }}
 >
 <CalendarClock className="h-4 w-4" />
 تمدید
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ============ تب ورود فوری ============
function QuickLoginTab({
 token,
 onQuickLogin,
}: {
 token: string;
 onQuickLogin: (token: string, tenantName?: string) => void;
}) {
 const { toast } = useToast();
 const [companyName, setCompanyName] = React.useState("");
 const [plan, setPlan] = React.useState("business");
 const [userName, setUserName] = React.useState("");
 const [creating, setCreating] = React.useState(false);
 const [result, setResult] = React.useState<{
 token: string;
 tenantName: string;
 username: string;
 password: string | null;
 isNewTenant: boolean;
 } | null>(null);
 const [copied, setCopied] = React.useState(false);
 const pwTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

 const clearPassword = React.useCallback(() => {
 setResult((prev) => prev? {...prev, password: null }: prev);
 if (pwTimerRef.current) { clearTimeout(pwTimerRef.current); pwTimerRef.current = null; }
 }, []);

 React.useEffect(() => {
 return () => { if (pwTimerRef.current) clearTimeout(pwTimerRef.current); };
 }, []);

 // فرم ورود فوری به tenant موجود
 const [tenants, setTenants] = React.useState<TenantRow[]>([]);
 const [selectedTenant, setSelectedTenant] = React.useState("");
 const [existingLoading, setExistingLoading] = React.useState(false);

 const loadTenants = React.useCallback(async () => {
 try {
 const res = await apiFetch("/api/platform/tenants", token);
 const data = await res.json();
 if (data.success) setTenants(data.data || []);
 } catch {
 /* ignore */
 }
 }, [token]);

 React.useEffect(() => {
 void loadTenants();
 }, [loadTenants]);

 const createAndLogin = async () => {
 setCreating(true);
 try {
 const body: Record<string, unknown> = { plan };
 if (companyName.trim()) body.companyName = companyName.trim();
 if (userName.trim()) body.name = userName.trim();
 const res = await apiFetch("/api/platform/quick-login", token, {
 method: "POST",
 body: JSON.stringify(body),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setResult({
 token: data.token,
 tenantName: data.tenant.name,
 username: data.user.username,
 password: data.user.password,
 isNewTenant: data.isNewTenant,
 });
 if (pwTimerRef.current) clearTimeout(pwTimerRef.current);
 pwTimerRef.current = setTimeout(clearPassword, 30000);
 toast({
 title: data.isNewTenant? "سازمان جدید ساخته شد": "ورود فوری آماده است",
 description: data.message,
 });
 await loadTenants();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ایجاد",
 variant: "destructive",
 });
 } finally {
 setCreating(false);
 }
 };

 const loginExisting = async () => {
 if (!selectedTenant) {
 toast({ title: "انتخاب سازمان", description: "یک سازمان را انتخاب کنید." });
 return;
 }
 setExistingLoading(true);
 try {
 const res = await apiFetch("/api/platform/quick-login", token, {
 method: "POST",
 body: JSON.stringify({ tenantId: selectedTenant }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setResult({
 token: data.token,
 tenantName: data.tenant.name,
 username: data.user.username,
 password: data.user.password,
 isNewTenant: false,
 });
 if (pwTimerRef.current) clearTimeout(pwTimerRef.current);
 pwTimerRef.current = setTimeout(clearPassword, 30000);
 toast({
 title: "ورود فوری ایجاد شد",
 description: `کاربر ${data.user.username} برای «${data.tenant.name}» ساخته شد.`,
 });
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا",
 variant: "destructive",
 });
 } finally {
 setExistingLoading(false);
 }
 };

 const copyInfo = async () => {
 if (!result) return;
 const text = `سازمان: ${result.tenantName}\nنام کاربری: ${result.username}${result.password? `\nرمز عبور: ${result.password}`: ""}`;
 try {
 await navigator.clipboard.writeText(text);
 setCopied(true);
 toast({ title: "کپی شد", description: "اطلاعات ورود کپی شد." });
 setTimeout(() => setCopied(false), 2000);
 } catch {
 toast({ title: "خطا در کپی", variant: "destructive" });
 }
 };

 return (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* ساخت سازمان + کاربر جدید */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Plus className="h-4 w-4 text-primary" />
 ساخت سازمان جدید و ورود فوری
 </CardTitle>
 <CardDescription className="text-xs">
 سازمان جدید با لایسنس خودکار و کاربر ادمین می‌سازد.
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs">نام سازمان (اختیاری)</Label>
 <Input
 value={companyName}
 onChange={(e) => setCompanyName(e.target.value)}
 placeholder="نام پیش‌فرض تصادفی ساخته می‌شود"
 className="h-9"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">پلن</Label>
 <Select value={plan} onValueChange={setPlan}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="starter">استارتر</SelectItem>
 <SelectItem value="business">کسب‌وکار</SelectItem>
 <SelectItem value="enterprise">سازمانی</SelectItem>
 <SelectItem value="accountant">حسابدار</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">نام کاربر (اختیاری)</Label>
 <Input
 value={userName}
 onChange={(e) => setUserName(e.target.value)}
 placeholder="مثال: مدیر سیستم"
 className="h-9"
 />
 </div>
 <Button className="w-full" onClick={createAndLogin} disabled={creating}>
 {creating? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ایجاد...
 </>
 ): (
 <>
 <Zap className="h-4 w-4" />
 ایجاد و ورود
 </>
 )}
 </Button>
 </CardContent>
 </Card>

 {/* ورود به سازمان موجود */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 ورود فوری به سازمان موجود
 </CardTitle>
 <CardDescription className="text-xs">
 یک کاربر جدید برای سازمان انتخاب‌شده می‌سازد.
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs">انتخاب سازمان</Label>
 <Select value={selectedTenant} onValueChange={setSelectedTenant}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder="یک سازمان انتخاب کنید" />
 </SelectTrigger>
 <SelectContent>
 {tenants.map((t) => (
 <SelectItem key={t.id} value={t.id}>
 {t.name} — {PLAN_LABELS[t.plan] || t.plan}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <Button className="w-full" variant="outline" onClick={loginExisting} disabled={existingLoading ||!selectedTenant}>
 {existingLoading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ایجاد کاربر...
 </>
 ): (
 <>
 <Zap className="h-4 w-4" />
 ایجاد کاربر و ورود
 </>
 )}
 </Button>
 </CardContent>
 </Card>

 {/* نتیجه */}
 {result && (
 <Card className="lg:col-span-2 border-success/30">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2 text-success">
 <Check className="h-4 w-4" />
 {result.isNewTenant? "سازمان جدید ساخته شد": "ورود فوری آماده است"}
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">نام سازمان</p>
 <p className="text-sm font-medium truncate">{result.tenantName}</p>
 </div>
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">نام کاربری</p>
 <p className="text-sm font-mono font-medium" dir="ltr">{result.username}</p>
 </div>
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">رمز عبور</p>
 <p className="text-sm font-mono font-medium" dir="ltr">{result.password?? "••••••••"}</p>
 </div>
 </div>
 <div className="flex flex-col sm:flex-row gap-2">
 <Button variant="outline" size="sm" className="flex-1" onClick={copyInfo} disabled={!result.password}>
 {copied? <Check className="h-4 w-4 text-success" />: <Copy className="h-4 w-4" />}
 کپی اطلاعات
 </Button>
 {result.password? (
 <Button variant="outline" size="sm" className="flex-1" onClick={clearPassword}>
 <Lock className="h-4 w-4" />
 پاک کردن رمز
 </Button>
 ): null}
 <Button
 size="sm"
 className="flex-1"
 onClick={() => onQuickLogin(result.token, result.tenantName)}
 >
 <ExternalLink className="h-4 w-4" />
 ورود به پنل کاربر
 </Button>
 </div>
 <p className="text-[10px] text-muted-foreground">
 {result.password
? "رمز عبور فقط همین یک‌بار نمایش داده می‌شود و پس از ۳۰ ثانیه به‌صورت خودکار پاک می‌شود — همین حالا کپی و به مشتری تحویل دهید."
: "رمز از نمایش پاک شد. برای رمز جدید از تب «کاربران» ← «بازنشانی رمز» استفاده کنید."}
 </p>
 </CardContent>
 </Card>
 )}
 </div>
 );
}

// ============ تب لاگ تغییرات ============
function AuditTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [logs, setLogs] = React.useState<AuditLogRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [actionFilter, setActionFilter] = React.useState("all");
 const [limit, setLimit] = React.useState(50);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams({ limit: String(limit) });
 if (actionFilter!== "all") params.set("action", actionFilter);
 const res = await apiFetch(`/api/platform/audit?${params}`, token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setLogs(data.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت لاگ‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, actionFilter, limit, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const actionBadge = (action: string) => {
 if (action.includes("LOGIN")) return "bg-primary/10 text-primary";
 if (action.includes("CREATE")) return "bg-success/10 text-success";
 if (action.includes("SUSPEND")) return "bg-warning/10 text-warning";
 if (action.includes("REVOKE") || action.includes("DELETE")) return "bg-destructive/10 text-destructive";
 if (action.includes("ACTIVATE") || action.includes("EXTEND")) return "bg-success/10 text-success";
 return "bg-muted text-muted-foreground";
 };

 return (
 <div className="space-y-4">
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2">
 <Select value={actionFilter} onValueChange={setActionFilter}>
 <SelectTrigger className="h-9 w-full sm:w-[200px]">
 <Filter className="h-3.5 w-3.5" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه عملیات‌ها</SelectItem>
 <SelectItem value="LOGIN">ورود</SelectItem>
 <SelectItem value="CREATE_LICENSE">ایجاد لایسنس</SelectItem>
 <SelectItem value="QUICK_LOGIN">ورود فوری</SelectItem>
 <SelectItem value="SUSPEND">تعلیق</SelectItem>
 <SelectItem value="ACTIVATE">فعال‌سازی</SelectItem>
 <SelectItem value="REVOKE">ابطال</SelectItem>
 <SelectItem value="EXTEND">تمدید</SelectItem>
 <SelectItem value="CHANGE_PLAN">تغییر پلن</SelectItem>
 </SelectContent>
 </Select>
 <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
 <SelectTrigger className="h-9 w-full sm:w-[120px]">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="20">۲۰ رکورد</SelectItem>
 <SelectItem value="50">۵۰ رکورد</SelectItem>
 <SelectItem value="100">۱۰۰ رکورد</SelectItem>
 <SelectItem value="200">۲۰۰ رکورد</SelectItem>
 </SelectContent>
 </Select>
 <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 به‌روزرسانی
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-9 ms-auto"
 onClick={() => setLimit((l) => l + 50)}
 disabled={loading}
 >
 بارگذاری بیشتر
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardContent className="p-0">
 <div className="max-h-[600px] overflow-y-auto">
 <Table className="table-zebra">
 <TableHeader className="sticky top-0 bg-card z-10">
 <TableRow>
 <TableHead className="text-start text-[11px]">زمان</TableHead>
 <TableHead className="text-start text-[11px]">مدیر</TableHead>
 <TableHead className="text-start text-[11px]">عملیات</TableHead>
 <TableHead className="text-start text-[11px]">موجودیت</TableHead>
 <TableHead className="text-start text-[11px]">جزئیات</TableHead>
 <TableHead className="text-start text-[11px]">IP</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {logs.length === 0? (
 <TableRow>
 <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
 {loading? "در حال بارگذاری...": "لاگی موجود نیست"}
 </TableCell>
 </TableRow>
 ): (
 logs.map((l) => (
 <TableRow key={l.id}>
 <TableCell className="text-[10px] tnum text-muted-foreground whitespace-nowrap">
 {toJalali(new Date(l.createdAt))}
 <br />
 <span dir="ltr">
 {new Date(l.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
 </span>
 </TableCell>
 <TableCell className="text-xs font-medium">
 {l.superAdmin?.username || "—"}
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${actionBadge(l.action)}`}>
 {l.action}
 </Badge>
 </TableCell>
 <TableCell className="text-xs text-muted-foreground">{l.entity}</TableCell>
 <TableCell className="text-[10px] text-muted-foreground max-w-[260px] truncate" dir="ltr">
 {l.details || "—"}
 </TableCell>
 <TableCell className="text-[10px] text-muted-foreground" dir="ltr">
 {l.ipAddress || "—"}
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

// ============ تب مدیریت کاربران ============
interface UserRow {
 id: string;
 username: string | null;
 email: string;
 name: string;
 role: string;
 isActive: boolean;
 isDemo: boolean;
 isTrial: boolean;
 trialEndsAt: string | null;
 lastLogin: string | null;
 lastLoginIp: string | null;
 createdAt: string;
 tenant: { name: string; plan: string; status: string } | null;
}

const ROLE_LABELS_FA: Record<string, string> = {
 ADMIN: "مدیر سیستم",
 MANAGER: "مدیر",
 ACCOUNTANT: "حسابدار",
 USER: "کاربر",
};

function roleBadge(role: string) {
 const map: Record<string, string> = {
 ADMIN: "bg-primary/10 text-primary",
 MANAGER: "bg-chart-5/10 text-chart-5",
 ACCOUNTANT: "bg-warning/10 text-warning",
 USER: "bg-muted text-muted-foreground",
 };
 return map[role] || "bg-muted text-muted-foreground";
}

function UsersTab({
 token,
 onQuickLogin,
}: {
 token: string;
 onQuickLogin: (token: string, tenantName?: string) => void;
}) {
 const { toast } = useToast();
 const [users, setUsers] = React.useState<UserRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [search, setSearch] = React.useState("");
 const [filter, setFilter] = React.useState<"all" | "trial" | "demo">("all");
 const [actingId, setActingId] = React.useState<string | null>(null);

 // مدال‌ها
 const [blockTarget, setBlockTarget] = React.useState<UserRow | null>(null);
 const [extendTarget, setExtendTarget] = React.useState<UserRow | null>(null);
 const [extendDays, setExtendDays] = React.useState("14");
 const [resetResult, setResetResult] = React.useState<string | null>(null);
 const [copied, setCopied] = React.useState(false);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams();
 if (filter === "trial") params.set("trial", "true");
 if (filter === "demo") params.set("demo", "true");
 if (search.trim()) params.set("search", search.trim());
 const res = await apiFetch(`/api/platform/users?${params}`, token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setUsers(data.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت کاربران",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, filter, search, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const act = async (userId: string, action: string, days?: number) => {
 setActingId(userId);
 try {
 const res = await apiFetch("/api/platform/users", token, {
 method: "PATCH",
 body: JSON.stringify(days? { userId, action, days }: { userId, action }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 if (action === "reset-password" && data.newPassword) {
 setResetResult(data.newPassword);
 } else {
 toast({ title: "عملیات موفق", description: data.message || "انجام شد" });
 }
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در عملیات",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 const quickLogin = async (u: UserRow) => {
 if (!u.tenant) {
 toast({ title: "خطا", description: "این کاربر سازمان فعال ندارد.", variant: "destructive" });
 return;
 }
 setActingId(u.id);
 try {
 // ورود به‌عنوان خودِ کاربر (نه ساخت کاربر جدید) —
 // PATCH /api/platform/users با action=impersonate برای userId مشخص نشست واقعی آن کاربر را می‌سازد
 const res = await apiFetch("/api/platform/users", token, {
 method: "PATCH",
 body: JSON.stringify({ userId: u.id, action: "impersonate" }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در ورود فوری");
 onQuickLogin(data.token, data.tenant?.name || u.tenant?.name || "سازمان");
 toast({ title: "ورود فوری", description: `به‌عنوان ${data.user?.username || u.username || u.name} وارد شدید.` });
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ورود فوری",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 const copyPwd = async (text: string) => {
 try {
 await navigator.clipboard.writeText(text);
 setCopied(true);
 toast({ title: "کپی شد", description: "رمز جدید در کلیپ‌بورد ذخیره شد." });
 setTimeout(() => setCopied(false), 2000);
 } catch {
 toast({ title: "خطا در کپی", variant: "destructive" });
 }
 };

 return (
 <div className="space-y-4">
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی نام، ایمیل یا یوزرنیم..."
 className="ps-9 h-9"
 />
 </div>
 <div className="flex gap-1.5">
 {([
 { key: "all", label: "همه" },
 { key: "trial", label: "تریال" },
 { key: "demo", label: "دمو" },
 ] as const).map((f) => (
 <Button
 key={f.key}
 variant={filter === f.key? "default": "outline"}
 size="sm"
 className="h-9 text-xs"
 onClick={() => setFilter(f.key)}
 >
 {f.label}
 </Button>
 ))}
 </div>
 <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 به‌روزرسانی
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px]">نام</TableHead>
 <TableHead className="text-start text-[11px]">یوزرنیم</TableHead>
 <TableHead className="text-start text-[11px]">ایمیل</TableHead>
 <TableHead className="text-start text-[11px]">نقش</TableHead>
 <TableHead className="text-start text-[11px]">سازمان</TableHead>
 <TableHead className="text-start text-[11px]">وضعیت</TableHead>
 <TableHead className="text-start text-[11px]">تریال</TableHead>
 <TableHead className="text-start text-[11px]">آخرین ورود</TableHead>
 <TableHead className="text-start text-[11px]">IP</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {users.length === 0? (
 <TableRow>
 <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">
 {loading? "در حال بارگذاری...": "کاربری یافت نشد"}
 </TableCell>
 </TableRow>
 ): (
 users.map((u) => (
 <TableRow key={u.id}>
 <TableCell>
 <div className="flex items-center gap-2">
 <Avatar className="h-7 w-7">
 <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
 {u.name?.slice(0, 2) || "؟"}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-medium truncate max-w-[120px]">{u.name || "—"}</span>
 </div>
 </TableCell>
 <TableCell className="text-xs font-mono" dir="ltr">{u.username || "—"}</TableCell>
 <TableCell className="text-[10px] text-muted-foreground truncate max-w-[140px]" dir="ltr">{u.email}</TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${roleBadge(u.role)}`}>
 {ROLE_LABELS_FA[u.role] || u.role}
 </Badge>
 </TableCell>
 <TableCell className="text-xs truncate max-w-[120px]">
 {u.tenant?.name || "—"}
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${u.isActive? "bg-success/10 text-success": "bg-destructive/10 text-destructive"}`}>
 {u.isActive? "فعال": "مسدود"}
 </Badge>
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground">
 {u.isTrial && u.trialEndsAt? (
 <span className="flex items-center gap-1">
 <CalendarClock className="h-3 w-3" />
 {toJalali(new Date(u.trialEndsAt))}
 </span>
 ): u.isTrial? (
 <span className="text-warning">تریال فعال</span>
 ): (
 "—"
 )}
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground whitespace-nowrap">
 {u.lastLogin? toJalali(new Date(u.lastLogin)): "—"}
 </TableCell>
 <TableCell className="text-[10px] text-muted-foreground font-mono" dir="ltr">
 {u.lastLoginIp || "—"}
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-end">
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={actingId === u.id}>
 {actingId === u.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <MoreVertical className="h-3.5 w-3.5" />
 )}
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-44">
 <DropdownMenuLabel className="text-[10px] text-muted-foreground">
 عملیات کاربر
 </DropdownMenuLabel>
 <DropdownMenuSeparator />
 {u.isActive? (
 <DropdownMenuItem
 className="text-xs text-warning"
 onClick={() => setBlockTarget(u)}
 >
 <Ban className="h-3.5 w-3.5" />
 مسدود کردن
 </DropdownMenuItem>
 ): (
 <DropdownMenuItem
 className="text-xs text-success"
 onClick={() => act(u.id, "unblock")}
 >
 <Unlock className="h-3.5 w-3.5" />
 فعال‌سازی
 </DropdownMenuItem>
 )}
 <DropdownMenuItem
 className="text-xs"
 onClick={() => act(u.id, "reset-password")}
 >
 <Key className="h-3.5 w-3.5" />
 بازنشانی رمز
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs text-primary"
 onClick={() => {
 setExtendTarget(u);
 setExtendDays("14");
 }}
 >
 <CalendarClock className="h-3.5 w-3.5" />
 تمدید تریال
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs"
 onClick={() => quickLogin(u)}
 >
 <Zap className="h-3.5 w-3.5" />
 ورود فوری
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ تأیید مسدودسازی */}
 <AlertDialog open={!!blockTarget} onOpenChange={(o) =>!o && setBlockTarget(null)}>
 <AlertDialogContent className="max-w-md">
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2 text-base">
 <Ban className="h-4 w-4 text-warning" />
 مسدودسازی کاربر
 </AlertDialogTitle>
 <AlertDialogDescription className="text-xs">
 آیا از مسدود کردن «{blockTarget?.name}» مطمئن هستید؟ این کاربر دیگر قادر به ورود نخواهد بود.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter className="gap-2">
 <AlertDialogCancel className="h-8 text-xs">لغو</AlertDialogCancel>
 <AlertDialogAction
 className="h-8 text-xs bg-warning text-warning-foreground hover:bg-warning/90"
 onClick={() => {
 if (blockTarget) void act(blockTarget.id, "block");
 setBlockTarget(null);
 }}
 >
 <Ban className="h-3.5 w-3.5" />
 مسدود کن
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* دیالوگ تمدید تریال */}
 <Dialog open={!!extendTarget} onOpenChange={(o) =>!o && setExtendTarget(null)}>
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle className="text-base">تمدید تریال</DialogTitle>
 <DialogDescription className="text-xs">
 تعداد روز تمدید را برای «{extendTarget?.name}» وارد کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2">
 <Label className="text-xs">تعداد روز</Label>
 <Input
 type="number"
 value={extendDays}
 onChange={(e) => setExtendDays(e.target.value)}
 className="h-9"
 dir="ltr"
 />
 <div className="flex gap-1.5">
 {[7, 14, 30, 60].map((d) => (
 <Button
 key={d}
 variant="outline"
 size="sm"
 className="h-7 text-[11px] flex-1"
 onClick={() => setExtendDays(String(d))}
 >
 {toPersianDigits(d)} روز
 </Button>
 ))}
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setExtendTarget(null)}>
 لغو
 </Button>
 <Button
 size="sm"
 onClick={async () => {
 if (extendTarget) await act(extendTarget.id, "extend-trial", Number(extendDays));
 setExtendTarget(null);
 }}
 >
 <CalendarClock className="h-4 w-4" />
 تمدید
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* مدال نمایش رمز جدید */}
 <Dialog open={!!resetResult} onOpenChange={(o) =>!o && setResetResult(null)}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base text-success">
 <Check className="h-4 w-4" />
 رمز عبور بازنشانی شد
 </DialogTitle>
 <DialogDescription className="text-xs">
 رمز جدید را در اختیار کاربر قرار دهید. این مقدار یک‌بار نمایش داده می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="rounded-xl border border-success/30 bg-success/5 p-4">
 <div className="flex items-center gap-2">
 <code className="flex-1 rounded-lg bg-background border border-border px-3 py-2.5 text-sm font-mono text-foreground" dir="ltr">
 {resetResult}
 </code>
 <Button size="sm" variant="default" onClick={() => copyPwd(resetResult || "")}>
 {copied? <Check className="h-4 w-4" />: <Copy className="h-4 w-4" />}
 کپی
 </Button>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" size="sm" className="w-full" onClick={() => setResetResult(null)}>
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ============ تب لاگ خطاها ============
interface ErrorLogRow {
 id: string;
 level: string;
 message: string;
 stack?: string | null;
 url?: string | null;
 method?: string | null;
 statusCode?: number | null;
 userId?: string | null;
 tenantId?: string | null;
 ipAddress?: string | null;
 userAgent?: string | null;
 metadata?: string | null;
 createdAt: string;
}

function levelBadge(level: string) {
 const map: Record<string, string> = {
 ERROR: "bg-destructive/10 text-destructive",
 WARN: "bg-warning/10 text-warning",
 INFO: "bg-primary/10 text-primary",
 };
 return map[level] || "bg-muted text-muted-foreground";
}

function ErrorsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [logs, setLogs] = React.useState<ErrorLogRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [level, setLevel] = React.useState<string>("all");
 const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
 const [clearOpen, setClearOpen] = React.useState(false);
 const [clearing, setClearing] = React.useState(false);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams({ limit: "100" });
 if (level!== "all") params.set("level", level);
 const res = await apiFetch(`/api/platform/errors?${params}`, token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setLogs(data.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت لاگ‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, level, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const toggleExpand = (id: string) => {
 setExpanded((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 // SA-HIGH-4: پاک‌سازی واقعی لاگ‌های قدیمی از طریق API (قبلاً فقط state محلی پاک می‌شد).
 const clearLogs = async (mode: "old" | "all") => {
 setClearing(true);
 try {
 const url =
 mode === "all"
? "/api/platform/errors/clear?all=true"
: "/api/platform/errors/clear?olderThanDays=30";
 const res = await apiFetch(url, token, { method: "POST" });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در پاک‌سازی");
 toast({
 title: "پاک‌سازی شد",
 description: data.message || "لاگ‌های قدیمی پاک‌سازی شدند.",
 });
 setClearOpen(false);
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در پاک‌سازی لاگ‌ها",
 variant: "destructive",
 });
 } finally {
 setClearing(false);
 }
 };

 return (
 <div className="space-y-4">
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2">
 <Select value={level} onValueChange={setLevel}>
 <SelectTrigger className="h-9 w-full sm:w-[160px]">
 <Filter className="h-3.5 w-3.5" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه سطوح</SelectItem>
 <SelectItem value="ERROR">ERROR</SelectItem>
 <SelectItem value="WARN">WARN</SelectItem>
 <SelectItem value="INFO">INFO</SelectItem>
 </SelectContent>
 </Select>
 <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 به‌روزرسانی
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-9 ms-auto text-destructive hover:bg-destructive/5"
 onClick={() => setClearOpen(true)}
 disabled={logs.length === 0}
 >
 <Trash2 className="h-4 w-4" />
 پاک‌سازی
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardContent className="p-0">
 <div className="max-h-[640px] overflow-y-auto">
 <Table className="table-zebra">
 <TableHeader className="sticky top-0 bg-card z-10">
 <TableRow>
 <TableHead className="text-start text-[11px] w-8"></TableHead>
 <TableHead className="text-start text-[11px]">زمان</TableHead>
 <TableHead className="text-start text-[11px]">سطح</TableHead>
 <TableHead className="text-start text-[11px]">پیام</TableHead>
 <TableHead className="text-start text-[11px]">URL / متد</TableHead>
 <TableHead className="text-end text-[11px]">کد</TableHead>
 <TableHead className="text-start text-[11px]">tenant</TableHead>
 <TableHead className="text-start text-[11px]">IP</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {logs.length === 0? (
 <TableRow>
 <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
 {loading? "در حال بارگذاری...": "خطایی ثبت نشده است"}
 </TableCell>
 </TableRow>
 ): (
 logs.map((l) => {
 const isOpen = expanded.has(l.id);
 return (
 <React.Fragment key={l.id}>
 <TableRow
 className="cursor-pointer hover:bg-muted/40"
 onClick={() => toggleExpand(l.id)}
 >
 <TableCell className="w-8 p-2">
 {isOpen? (
 <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
 ): (
 <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
 )}
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground whitespace-nowrap">
 {toJalali(new Date(l.createdAt))}
 <br />
 <span dir="ltr">
 {new Date(l.createdAt).toLocaleTimeString("en-GB", {
 hour: "2-digit",
 minute: "2-digit",
 })}
 </span>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${levelBadge(l.level)}`}>
 {l.level}
 </Badge>
 </TableCell>
 <TableCell className="text-xs max-w-[260px] truncate">{l.message}</TableCell>
 <TableCell className="text-[10px] text-muted-foreground font-mono" dir="ltr">
 {l.method || "—"} {l.url || ""}
 </TableCell>
 <TableCell className="text-end">
 {l.statusCode? (
 <Badge
 variant="outline"
 className={`text-[10px] tnum ${
 l.statusCode >= 500
? "border-destructive/30 text-destructive"
: l.statusCode >= 400
? "border-warning/30 text-warning"
: "border-success/30 text-success"
 }`}
 >
 {toPersianDigits(l.statusCode)}
 </Badge>
 ): (
 "—"
 )}
 </TableCell>
 <TableCell className="text-[10px] text-muted-foreground font-mono" dir="ltr">
 {l.tenantId? l.tenantId.slice(-8): "—"}
 </TableCell>
 <TableCell className="text-[10px] text-muted-foreground font-mono" dir="ltr">
 {l.ipAddress || "—"}
 </TableCell>
 </TableRow>
 {isOpen && (
 <TableRow className="bg-muted/20">
 <TableCell colSpan={8} className="p-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
 {l.userId && (
 <div>
 <p className="text-[10px] text-muted-foreground mb-1">شناسه کاربر</p>
 <code className="font-mono text-[11px]" dir="ltr">{l.userId}</code>
 </div>
 )}
 {l.userAgent && (
 <div>
 <p className="text-[10px] text-muted-foreground mb-1">User-Agent</p>
 <p className="text-[10px] font-mono break-all" dir="ltr">{l.userAgent}</p>
 </div>
 )}
 {l.stack && (
 <div className="md:col-span-2">
 <p className="text-[10px] text-muted-foreground mb-1">Stack Trace</p>
 <pre className="text-[10px] font-mono bg-background border border-border rounded-lg p-3 overflow-x-auto max-h-48" dir="ltr">
 {l.stack}
 </pre>
 </div>
 )}
 {l.metadata && (
 <div className="md:col-span-2">
 <p className="text-[10px] text-muted-foreground mb-1">Metadata</p>
 <pre className="text-[10px] font-mono bg-background border border-border rounded-lg p-3 overflow-x-auto max-h-40" dir="ltr">
 {l.metadata}
 </pre>
 </div>
 )}
 </div>
 </TableCell>
 </TableRow>
 )}
 </React.Fragment>
 );
 })
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
 <AlertDialogContent className="max-w-md">
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2 text-base">
 <Trash2 className="h-4 w-4 text-destructive" />
 پاک‌سازی لاگ‌ها
 </AlertDialogTitle>
 <AlertDialogDescription className="text-xs">
 این عمل لاگ‌های خطا را پاک می‌کند. می‌توانید فقط لاگ‌های قدیمی (قدمت بیش از ۳۰ روز) یا همه‌ی لاگ‌ها را حذف کنید. این عمل قابل بازگشت نیست.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter className="gap-2 flex-row-reverse">
 <AlertDialogAction
 className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
 disabled={clearing}
 onClick={(e) => {
 e.preventDefault();
 void clearLogs("old");
 }}
 >
 {clearing? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Trash2 className="h-3.5 w-3.5" />}
 فقط قدیمی‌ها (۳۰+ روز)
 </AlertDialogAction>
 <AlertDialogAction
 className="h-8 text-xs border border-destructive/30 text-destructive hover:bg-destructive/10"
 disabled={clearing}
 onClick={(e) => {
 e.preventDefault();
 void clearLogs("all");
 }}
 >
 <X className="h-3.5 w-3.5" />
 حذف همه
 </AlertDialogAction>
 <AlertDialogCancel className="h-8 text-xs ms-auto" disabled={clearing}>
 لغو
 </AlertDialogCancel>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}

// ============ تب امنیت و IP ============
interface BlockedIpRow {
 id: string;
 ipAddress: string;
 reason: string;
 attempts: number;
 blockedAt: string;
 expiresAt: string | null;
 isActive: boolean;
}

interface WhitelistRow {
 id: string;
 ipAddress: string;
 label: string;
 isActive: boolean;
 createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
 RATE_LIMIT_EXCEEDED: "محدودیت درخواست",
 BRUTE_FORCE: "حمله جستجوی رمز",
 SUSPICIOUS_ACTIVITY: "فعالیت مشکوک",
 MANUAL: "مسدودسازی دستی",
};

function reasonBadge(reason: string) {
 const map: Record<string, string> = {
 RATE_LIMIT_EXCEEDED: "bg-warning/10 text-warning",
 BRUTE_FORCE: "bg-destructive/10 text-destructive",
 SUSPICIOUS_ACTIVITY: "bg-destructive/10 text-destructive",
 MANUAL: "bg-primary/10 text-primary",
 };
 return map[reason] || "bg-muted text-muted-foreground";
}

function SecurityTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [blocked, setBlocked] = React.useState<BlockedIpRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [actingIp, setActingIp] = React.useState<string | null>(null);

 // داده‌های Whitelist — SA-HIGH-3: اکنون از API واقعی /api/platform/ip-allowlist خوانده می‌شود
 const [whitelist, setWhitelist] = React.useState<WhitelistRow[]>([]);
 const [wlLoading, setWlLoading] = React.useState(true);
 const [wlSaving, setWlSaving] = React.useState<string | null>(null); // id در حال حذف یا "new" در حال افزودن

 // فرم IP Whitelist
 const [wlIp, setWlIp] = React.useState("");
 const [wlLabel, setWlLabel] = React.useState("");

 // فرم مسدودسازی دستی
 const [blockIpInput, setBlockIpInput] = React.useState("");
 const [blockReason, setBlockReason] = React.useState("MANUAL");
 const [blockDuration, setBlockDuration] = React.useState("60");
 const [blocking, setBlocking] = React.useState(false);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/ip-blocks", token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setBlocked(data.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت IPها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 const loadWhitelist = React.useCallback(async () => {
 setWlLoading(true);
 try {
 const res = await apiFetch("/api/platform/ip-allowlist", token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setWhitelist(data?.data?.items || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت لیست سفید IP",
 variant: "destructive",
 });
 } finally {
 setWlLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 void loadWhitelist();
 }, [load, loadWhitelist]);

 const unblock = async (id: string) => {
 setActingIp(id);
 try {
 const res = await apiFetch(`/api/platform/ip-blocks?id=${id}`, token, { method: "DELETE" });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "رفع مسدودیت", description: data.message || "انجام شد" });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا",
 variant: "destructive",
 });
 } finally {
 setActingIp(null);
 }
 };

 const blockManual = async () => {
 if (!blockIpInput.trim()) {
 toast({ title: "IP الزامی است", variant: "destructive" });
 return;
 }
 setBlocking(true);
 try {
 const res = await apiFetch("/api/platform/ip-blocks", token, {
 method: "POST",
 body: JSON.stringify({
 ipAddress: blockIpInput.trim(),
 reason: blockReason,
 durationMinutes: Number(blockDuration) || 60,
 }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "IP مسدود شد", description: data.message });
 setBlockIpInput("");
 setBlockReason("MANUAL");
 setBlockDuration("60");
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا",
 variant: "destructive",
 });
 } finally {
 setBlocking(false);
 }
 };

 // SA-HIGH-3: افزودن IP به لیست سفید از طریق API واقعی
 const addWhitelist = async () => {
 if (!wlIp.trim()) {
 toast({ title: "IP الزامی است", variant: "destructive" });
 return;
 }
 setWlSaving("new");
 try {
 const res = await apiFetch("/api/platform/ip-allowlist", token, {
 method: "POST",
 body: JSON.stringify({
 ipAddress: wlIp.trim(),
 label: wlLabel.trim() || null,
 }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "افزوده شد",
 description: data.message || `${wlIp} به لیست سفید اضافه شد.`,
 });
 setWlIp("");
 setWlLabel("");
 await loadWhitelist();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در افزودن IP",
 variant: "destructive",
 });
 } finally {
 setWlSaving(null);
 }
 };

 // SA-HIGH-3: حذف IP از لیست سفید از طریق API واقعی
 const removeWhitelist = async (id: string) => {
 setWlSaving(id);
 try {
 const res = await apiFetch(`/api/platform/ip-allowlist?id=${id}`, token, {
 method: "DELETE",
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "حذف شد", description: data.message || "IP از لیست سفید حذف شد." });
 await loadWhitelist();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در حذف IP",
 variant: "destructive",
 });
 } finally {
 setWlSaving(null);
 }
 };

 const todayErrors = blocked.filter(
 (b) => new Date(b.blockedAt).toDateString() === new Date().toDateString()
 ).length;
 const activeBlocked = blocked.filter((b) => b.isActive).length;

 return (
 <div className="space-y-4">
 {/* Task 11+14b — ویجت امتیاز امنیت هدرها (اسکن زنده + پیشنهاد اصلاح خودکار) */}
 <SecurityHeadersWidget token={token} />

 {/* کارت‌های آماری امنیت */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div>
 <p className="text-[11px] text-muted-foreground mb-1">کل IPهای مسدود</p>
 <p className="text-2xl font-bold tnum">{toPersianDigits(activeBlocked)}</p>
 </div>
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
 <ShieldBan className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div>
 <p className="text-[11px] text-muted-foreground mb-1">تلاش‌های ناموفق امروز</p>
 <p className="text-2xl font-bold tnum">{toPersianDigits(todayErrors)}</p>
 </div>
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
 <AlertTriangle className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div>
 <p className="text-[11px] text-muted-foreground mb-1">IPهای لیست سفید</p>
 <p className="text-2xl font-bold tnum">{toPersianDigits(whitelist.length)}</p>
 </div>
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
 <ShieldCheck className="h-4 w-4" />
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* لیست سفید IP */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <ShieldCheck className="h-4 w-4 text-success" />
 لیست سفید IP
 </CardTitle>
 <CardDescription className="text-xs">IPهای مجاز برای دسترسی به پنل مدیریت</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
 <Input
 value={wlIp}
 onChange={(e) => setWlIp(e.target.value)}
 placeholder="آدرس IP"
 className="h-9"
 dir="ltr"
 disabled={wlSaving === "new"}
 />
 <Input
 value={wlLabel}
 onChange={(e) => setWlLabel(e.target.value)}
 placeholder="برچسب (مثلاً دفتر)"
 className="h-9"
 disabled={wlSaving === "new"}
 />
 <Button
 size="sm"
 onClick={addWhitelist}
 className="h-9"
 disabled={wlSaving === "new" ||!wlIp.trim()}
 >
 {wlSaving === "new"? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Plus className="h-4 w-4" />
 )}
 افزودن
 </Button>
 </div>
 <div className="max-h-72 overflow-y-auto space-y-2">
 {wlLoading? (
 <p className="text-xs text-muted-foreground py-6 text-center flex items-center justify-center gap-2">
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 در حال بارگذاری...
 </p>
 ): whitelist.length === 0? (
 <p className="text-xs text-muted-foreground py-6 text-center">IPی در لیست سفید نیست</p>
 ): (
 whitelist.map((w) => (
 <div
 key={w.id}
 className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/30"
 >
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
 <Globe className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-mono" dir="ltr">{w.ipAddress}</p>
 <p className="text-[10px] text-muted-foreground truncate">{w.label || "بدون برچسب"}</p>
 </div>
 <Badge variant="secondary" className={`text-[10px] ${w.isActive? "bg-success/10 text-success": "bg-muted text-muted-foreground"}`}>
 {w.isActive? "فعال": "غیرفعال"}
 </Badge>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-destructive"
 onClick={() => removeWhitelist(w.id)}
 disabled={wlSaving === w.id}
 >
 {wlSaving === w.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Trash2 className="h-3.5 w-3.5" />
 )}
 </Button>
 </div>
 ))
 )}
 </div>
 </CardContent>
 </Card>

 {/* مسدودسازی دستی */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <ShieldBan className="h-4 w-4 text-destructive" />
 مسدودسازی دستی IP
 </CardTitle>
 <CardDescription className="text-xs">افزودن IP به لیست مسدود شده‌ها</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs">آدرس IP</Label>
 <Input
 value={blockIpInput}
 onChange={(e) => setBlockIpInput(e.target.value)}
 placeholder="مثال: 1.2.3.4"
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1.5">
 <Label className="text-xs">دلیل</Label>
 <Select value={blockReason} onValueChange={setBlockReason}>
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="MANUAL">دستی</SelectItem>
 <SelectItem value="RATE_LIMIT_EXCEEDED">محدودیت درخواست</SelectItem>
 <SelectItem value="BRUTE_FORCE">حمله رمز</SelectItem>
 <SelectItem value="SUSPICIOUS_ACTIVITY">فعالیت مشکوک</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">مدت (دقیقه)</Label>
 <Input
 type="number"
 value={blockDuration}
 onChange={(e) => setBlockDuration(e.target.value)}
 className="h-9"
 dir="ltr"
 />
 </div>
 </div>
 <div className="flex gap-1.5">
 {[30, 60, 360, 1440].map((d) => (
 <Button
 key={d}
 variant="outline"
 size="sm"
 className="h-7 text-[11px] flex-1"
 onClick={() => setBlockDuration(String(d))}
 >
 {d < 60? `${toPersianDigits(d)} دقیقه`: d < 1440? `${toPersianDigits(d / 60)} ساعت`: `${toPersianDigits(d / 1440)} روز`}
 </Button>
 ))}
 </div>
 <Button
 size="sm"
 variant="destructive"
 className="w-full"
 onClick={blockManual}
 disabled={blocking}
 >
 {blocking? <Loader2 className="h-4 w-4 animate-spin" />: <ShieldBan className="h-4 w-4" />}
 مسدود کن
 </Button>
 </CardContent>
 </Card>
 </div>

 {/* لیست IPهای مسدود */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="text-sm flex items-center gap-2">
 <ShieldBan className="h-4 w-4 text-destructive" />
 IPهای مسدودشده
 </CardTitle>
 <CardDescription className="text-xs">تلاش‌های ناموفق و مسدودیت‌های فعال</CardDescription>
 </div>
 <Button variant="outline" size="sm" className="h-8 text-xs" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RefreshCw className="h-3.5 w-3.5" />}
 به‌روزرسانی
 </Button>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
 <Table className="table-zebra">
 <TableHeader className="sticky top-0 bg-card z-10">
 <TableRow>
 <TableHead className="text-start text-[11px]">IP</TableHead>
 <TableHead className="text-start text-[11px]">دلیل</TableHead>
 <TableHead className="text-end text-[11px]">تلاش</TableHead>
 <TableHead className="text-start text-[11px]">زمان مسدودیت</TableHead>
 <TableHead className="text-start text-[11px]">انقضا</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {blocked.length === 0? (
 <TableRow>
 <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
 {loading? "در حال بارگذاری...": "IP مسدودی وجود ندارد"}
 </TableCell>
 </TableRow>
 ): (
 blocked.map((b) => (
 <TableRow key={b.id}>
 <TableCell className="text-xs font-mono" dir="ltr">{b.ipAddress}</TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${reasonBadge(b.reason)}`}>
 {REASON_LABELS[b.reason] || b.reason}
 </Badge>
 </TableCell>
 <TableCell className="text-end text-xs tnum">{toPersianDigits(b.attempts)}</TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground">
 {toJalali(new Date(b.blockedAt))}
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground">
 {b.expiresAt? toJalali(new Date(b.expiresAt)): "دائمی"}
 </TableCell>
 <TableCell>
 <div className="flex justify-end">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] text-success"
 onClick={() => unblock(b.id)}
 disabled={actingIp === b.id ||!b.isActive}
 >
 {actingIp === b.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Unlock className="h-3.5 w-3.5" />
 )}
 رفع مسدودیت
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

/* ============ FeatureFlagsTab — مدیریت فلگ‌های ویژگی (SA-HIGH-6) ============ */
interface FeatureFlagConditions {
 plan?: string[];
 roles?: string[];
 tenantIds?: string[];
}

interface FeatureFlagRow {
 id: string;
 name: string;
 description: string | null;
 enabled: boolean;
 rolloutPercentage: number;
 conditions: FeatureFlagConditions | null;
 updatedAt: string;
}

// نگاشت برچسب پلن برای نمایش در conditions
const FLAG_PLAN_LABELS: Record<string, string> = {
 free: "رایگان",
 basic: "پایه",
 pro: "حرفه‌ای",
 enterprise: "سازمانی",
};

function describeTarget(conditions: FeatureFlagConditions | null): string {
 if (!conditions) return "همه";
 const parts: string[] = [];
 if (conditions.plan && conditions.plan.length > 0) {
 parts.push(
 "پلن: " +
 conditions.plan.map((p) => FLAG_PLAN_LABELS[p] || p).join("، ")
 );
 }
 if (conditions.roles && conditions.roles.length > 0) {
 parts.push("نقش: " + conditions.roles.join("، "));
 }
 if (conditions.tenantIds && conditions.tenantIds.length > 0) {
 parts.push(`سازمان‌های خاص: ${conditions.tenantIds.length} مورد`);
 }
 return parts.length > 0? parts.join(" | "): "همه";
}

function FeatureFlagsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [flags, setFlags] = React.useState<FeatureFlagRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [actingName, setActingName] = React.useState<string | null>(null);
 const [createOpen, setCreateOpen] = React.useState(false);
 const [deleteTarget, setDeleteTarget] = React.useState<FeatureFlagRow | null>(null);

 // فرم ساخت فلگ جدید
 const [fName, setFName] = React.useState("");
 const [fDescription, setFDescription] = React.useState("");
 const [fEnabled, setFEnabled] = React.useState(true);
 const [fRollout, setFRollout] = React.useState("100");
 const [fPlans, setFPlans] = React.useState<string[]>([]);
 const [creating, setCreating] = React.useState(false);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/feature-flags?seed=1", token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setFlags(data.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description:
 e instanceof Error? e.message: "خطا در دریافت فلگ‌های ویژگی",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const toggleEnabled = async (flag: FeatureFlagRow) => {
 setActingName(flag.name);
 try {
 const res = await apiFetch(
 `/api/platform/feature-flags?name=${encodeURIComponent(flag.name)}`,
 token,
 {
 method: "PATCH",
 body: JSON.stringify({ enabled:!flag.enabled }),
 }
 );
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: flag.enabled? "غیرفعال شد": "فعال شد",
 description: `فلگ ${flag.name} ${flag.enabled? "غیرفعال": "فعال"} شد`,
 });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در تغییر وضعیت فلگ",
 variant: "destructive",
 });
 } finally {
 setActingName(null);
 }
 };

 const createFlag = async () => {
 if (!fName.trim() || fName.trim().length < 2) {
 toast({ title: "نام فلگ معتبر نیست", variant: "destructive" });
 return;
 }
 setCreating(true);
 try {
 const rollout = Math.max(0, Math.min(100, Number(fRollout) || 0));
 const conditions: FeatureFlagConditions | undefined =
 fPlans.length > 0? { plan: fPlans }: undefined;
 const res = await apiFetch("/api/platform/feature-flags", token, {
 method: "POST",
 body: JSON.stringify({
 name: fName.trim(),
 description: fDescription.trim() || undefined,
 enabled: fEnabled,
 rolloutPercentage: rollout,
 conditions,
 }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "فلگ ساخته شد",
 description: `فلگ ${fName} با موفقیت ایجاد شد`,
 });
 setFName("");
 setFDescription("");
 setFEnabled(true);
 setFRollout("100");
 setFPlans([]);
 setCreateOpen(false);
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ایجاد فلگ",
 variant: "destructive",
 });
 } finally {
 setCreating(false);
 }
 };

 const deleteFlag = async (flag: FeatureFlagRow) => {
 setActingName(flag.name);
 try {
 const res = await apiFetch(
 `/api/platform/feature-flags?name=${encodeURIComponent(flag.name)}`,
 token,
 { method: "DELETE" }
 );
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "حذف شد",
 description: data.message || `فلگ ${flag.name} حذف شد`,
 });
 setDeleteTarget(null);
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در حذف فلگ",
 variant: "destructive",
 });
 } finally {
 setActingName(null);
 }
 };

 const togglePlanInForm = (plan: string) => {
 setFPlans((prev) =>
 prev.includes(plan)? prev.filter((p) => p!== plan): [...prev, plan]
 );
 };

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between gap-2">
 <div>
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <Flag className="h-4 w-4 text-primary" />
 فلگ‌های ویژگی
 </h2>
 <p className="text-[11px] text-muted-foreground">
 مدیریت فعال/غیرفعال‌سازی تدریجی قابلیت‌ها بر اساس پلن، نقش یا سازمان
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={load} disabled={loading}>
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <RefreshCw className="h-4 w-4" />
 )}
 به‌روزرسانی
 </Button>
 <Button size="sm" onClick={() => setCreateOpen(true)}>
 <Plus className="h-4 w-4" />
 فلگ جدید
 </Button>
 </div>
 </div>

 <Card>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px]">نام فلگ</TableHead>
 <TableHead className="text-start text-[11px]">توضیح</TableHead>
 <TableHead className="text-center text-[11px]">فعال</TableHead>
 <TableHead className="text-end text-[11px]">Rollout</TableHead>
 <TableHead className="text-start text-[11px]">مخاطب</TableHead>
 <TableHead className="text-start text-[11px]">به‌روزرسانی</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {flags.length === 0? (
 <TableRow>
 <TableCell
 colSpan={7}
 className="text-center text-xs text-muted-foreground py-8"
 >
 {loading? "در حال بارگذاری...": "فلگی ثبت نشده است"}
 </TableCell>
 </TableRow>
 ): (
 flags.map((f) => (
 <TableRow key={f.id}>
 <TableCell>
 <code className="text-[11px] font-mono" dir="ltr">
 {f.name}
 </code>
 </TableCell>
 <TableCell className="text-[11px] text-muted-foreground max-w-[240px] truncate">
 {f.description || "—"}
 </TableCell>
 <TableCell className="text-center">
 <div className="flex items-center justify-center">
 <Switch
 checked={f.enabled}
 onCheckedChange={() => toggleEnabled(f)}
 disabled={actingName === f.name}
 />
 </div>
 </TableCell>
 <TableCell className="text-end text-xs tnum">
 {toPersianDigits(f.rolloutPercentage)}٪
 </TableCell>
 <TableCell className="text-[11px] text-muted-foreground">
 {describeTarget(f.conditions)}
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground">
 {toJalali(new Date(f.updatedAt))}
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-end">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-destructive"
 onClick={() => setDeleteTarget(f)}
 disabled={actingName === f.name}
 >
 {actingName === f.name? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Trash2 className="h-3.5 w-3.5" />
 )}
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ ایجاد فلگ جدید */}
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle className="text-base flex items-center gap-2">
 <Flag className="h-4 w-4 text-primary" />
 فلگ ویژگی جدید
 </DialogTitle>
 <DialogDescription className="text-xs">
 یک فلگ جدید برای فعال/غیرفعال‌سازی تدریجی قابلیتی بسازید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs">نام فلگ (انگلیسی، حداقل ۲ کاراکتر)</Label>
 <Input
 value={fName}
 onChange={(e) => setFName(e.target.value)}
 placeholder="مثال: ai-fraud-detection"
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">توضیح (اختیاری)</Label>
 <Input
 value={fDescription}
 onChange={(e) => setFDescription(e.target.value)}
 placeholder="توضیح کوتاه فارسی"
 className="h-9"
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">درصد Rollout (۰ تا ۱۰۰)</Label>
 <Input
 type="number"
 value={fRollout}
 onChange={(e) => setFRollout(e.target.value)}
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">فعال‌سازی</Label>
 <div className="flex items-center h-9 gap-2">
 <Switch
 checked={fEnabled}
 onCheckedChange={setFEnabled}
 />
 <span className="text-xs text-muted-foreground">
 {fEnabled? "فعال": "غیرفعال"}
 </span>
 </div>
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">محدود کردن به پلن‌ها (اختیاری)</Label>
 <div className="flex flex-wrap gap-1.5">
 {Object.entries(FLAG_PLAN_LABELS).map(([id, label]) => (
 <Button
 key={id}
 variant={fPlans.includes(id)? "default": "outline"}
 size="sm"
 className="h-7 text-[11px]"
 onClick={() => togglePlanInForm(id)}
 >
 {label}
 </Button>
 ))}
 </div>
 <p className="text-[10px] text-muted-foreground">
 اگر هیچ پلنی انتخاب نشود، فلگ برای همه‌ی پلن‌ها اعمال می‌شود.
 </p>
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
 لغو
 </Button>
 <Button size="sm" onClick={createFlag} disabled={creating}>
 {creating? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Plus className="h-4 w-4" />
 )}
 ایجاد فلگ
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ تأیید حذف */}
 <AlertDialog
 open={!!deleteTarget}
 onOpenChange={(o) =>!o && setDeleteTarget(null)}
 >
 <AlertDialogContent className="max-w-md">
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2 text-base">
 <Trash2 className="h-4 w-4 text-destructive" />
 حذف فلگ
 </AlertDialogTitle>
 <AlertDialogDescription className="text-xs">
 آیا از حذف فلگ «{deleteTarget?.name}» مطمئن هستید؟ این عمل قابل بازگشت نیست.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter className="gap-2">
 <AlertDialogCancel className="h-8 text-xs">لغو</AlertDialogCancel>
 <AlertDialogAction
 className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
 disabled={!deleteTarget || actingName === deleteTarget?.name}
 onClick={(e) => {
 e.preventDefault();
 if (deleteTarget) void deleteFlag(deleteTarget);
 }}
 >
 {actingName === deleteTarget?.name? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Trash2 className="h-3.5 w-3.5" />
 )}
 حذف
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}

/* ============ SettingsTab — تنظیمات پنل مدیریت ============ */
// به‌روزرسانی‌شده در SEC-2: شامل سیاست رمز عبور، مدت نشست، نگهداری لاگ ممیزی
interface PasswordPolicyState {
 minLength: number;
 requireUppercase: boolean;
 requireLowercase: boolean;
 requireNumbers: boolean;
 requireSpecialChars: boolean;
}

interface AuditStats {
 total: number;
 last24h: number;
 last7d: number;
 last30d: number;
 last90d: number;
 olderThan90d: number;
}

function SettingsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(true);
 const [savingPolicy, setSavingPolicy] = React.useState(false);
 const [savingRetention, setSavingRetention] = React.useState(false);
 const [savingSession, setSavingSession] = React.useState(false);
 const [cleaning, setCleaning] = React.useState(false);

 // password policy
 const [policy, setPolicy] = React.useState<PasswordPolicyState>({
 minLength: 8,
 requireUppercase: true,
 requireLowercase: true,
 requireNumbers: true,
 requireSpecialChars: false,
 });

 // session timeout
 const [sessionDays, setSessionDays] = React.useState(7);

 // audit retention
 const [retentionDays, setRetentionDays] = React.useState(90);
 const [auditStats, setAuditStats] = React.useState<AuditStats | null>(null);
 const [deletableCount, setDeletableCount] = React.useState(0);

 // ===== payment gateway settings (زرین‌پال + آیدی‌پی) =====
 const [zarinpalMerchant, setZarinpalMerchant] = React.useState("");
 const [zarinpalEnabled, setZarinpalEnabled] = React.useState(false);
 const [idpayMerchant, setIdpayMerchant] = React.useState("");
 const [idpayEnabled, setIdpayEnabled] = React.useState(false);
 const [savingPayment, setSavingPayment] = React.useState(false);
 // نمایش ماسک‌شده + وضعیت پیکربندی (از GET /api/platform/settings/payment)
 const [zarinpalMasked, setZarinpalMasked] = React.useState("");
 const [zarinpalConfigured, setZarinpalConfigured] = React.useState(false);
 const [idpayMasked, setIdpayMasked] = React.useState("");
 const [idpayConfigured, setIdpayConfigured] = React.useState(false);
 // تست اتصال زرین‌پال
 const [testingPayment, setTestingPayment] = React.useState(false);
 const [paymentTest, setPaymentTest] = React.useState<
 { ok: boolean; message: string } | null
 >(null);

 const fetchSettings = React.useCallback(async () => {
 setLoading(true);
 try {
 const [settingsRes, auditRes, paymentRes] = await Promise.all([
 apiFetch("/api/platform/settings", token),
 apiFetch("/api/platform/audit-retention", token),
 apiFetch("/api/platform/settings/payment", token),
 ]);

 if (settingsRes.ok) {
 const json = await settingsRes.json();
 if (json.data?.passwordPolicy) setPolicy(json.data.passwordPolicy);
 if (typeof json.data?.sessionTimeoutDays === "number") {
 setSessionDays(json.data.sessionTimeoutDays);
 }
 if (typeof json.data?.auditRetentionDays === "number") {
 setRetentionDays(json.data.auditRetentionDays);
 }
 }

 if (auditRes.ok) {
 const json = await auditRes.json();
 if (json.data?.stats) setAuditStats(json.data.stats);
 if (typeof json.data?.deletableCount === "number") {
 setDeletableCount(json.data.deletableCount);
 }
 }

 if (paymentRes.ok) {
 const json = await paymentRes.json();
 if (json.data?.zarinpal) {
 setZarinpalMerchant(json.data.zarinpal.merchantId || "");
 setZarinpalEnabled(!!json.data.zarinpal.enabled);
 setZarinpalMasked(json.data.zarinpal.merchantMasked || "");
 setZarinpalConfigured(!!json.data.zarinpal.configured);
 }
 if (json.data?.idpay) {
 setIdpayMerchant(json.data.idpay.merchantId || "");
 setIdpayEnabled(!!json.data.idpay.enabled);
 setIdpayMasked(json.data.idpay.merchantMasked || "");
 setIdpayConfigured(!!json.data.idpay.configured);
 }
 }
 } catch {
 toast({
 variant: "destructive",
 title: "خطا",
 description: "دریافت تنظیمات ناموفق بود",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void fetchSettings();
 }, [fetchSettings]);

 const savePolicy = async () => {
 setSavingPolicy(true);
 try {
 const res = await apiFetch("/api/platform/settings", token, {
 method: "PATCH",
 body: JSON.stringify({ passwordPolicy: policy }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 toast({
 title: "ذخیره شد",
 description: "سیاست رمز عبور به‌روزرسانی شد",
 });
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 });
 } finally {
 setSavingPolicy(false);
 }
 };

 const saveSession = async () => {
 setSavingSession(true);
 try {
 const res = await apiFetch("/api/platform/settings/session", token, {
 method: "PATCH",
 body: JSON.stringify({ sessionTimeoutDays: sessionDays }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 toast({
 title: "ذخیره شد",
 description: `مدت نشست به ${toPersianDigits(sessionDays)} روز تنظیم شد`,
 });
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 });
 } finally {
 setSavingSession(false);
 }
 };

 const saveRetention = async () => {
 setSavingRetention(true);
 try {
 const res = await apiFetch("/api/platform/audit-retention", token, {
 method: "PATCH",
 body: JSON.stringify({ daysToKeep: retentionDays }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 if (typeof json.data?.deletableCount === "number") {
 setDeletableCount(json.data.deletableCount);
 }
 toast({
 title: "ذخیره شد",
 description: `دوره نگهداری به ${toPersianDigits(retentionDays)} روز تنظیم شد`,
 });
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 });
 } finally {
 setSavingRetention(false);
 }
 };

 const runCleanup = async () => {
 if (
!confirm(
 `${toPersianDigits(deletableCount)} لاگ قدیمی حذف شود؟ این کار قابل بازگشت نیست.`
 )
 ) {
 return;
 }
 setCleaning(true);
 try {
 const res = await apiFetch("/api/platform/audit-retention", token, {
 method: "POST",
 body: JSON.stringify({ daysToKeep: retentionDays }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 toast({
 title: "پاک‌سازی انجام شد",
 description: `${toPersianDigits(json.data.deletedCount)} لاگ قدیمی حذف شد`,
 });
 void fetchSettings();
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در پاک‌سازی",
 });
 } finally {
 setCleaning(false);
 }
 };

 // فرمت UUID زرین‌پال — XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX (۳۶ کاراکتر)
 const ZARINPAL_UUID_RE =
 /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

 // ذخیره تنظیمات درگاه پرداخت (زرین‌پال + آیدی‌پی)
 const savePaymentSettings = async () => {
 const zTrimmed = zarinpalMerchant.trim();
 // اعتبارسنجی فرمت UUID برای زرین‌پال (خالی یعنی بدون تغییر/حذف — اجازه ذخیره)
 if (zTrimmed &&!ZARINPAL_UUID_RE.test(zTrimmed)) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: "فرمت کد پذیرنده معتبر نیست",
 });
 return;
 }
 setSavingPayment(true);
 try {
 const res = await apiFetch("/api/platform/settings/payment", token, {
 method: "POST",
 body: JSON.stringify({
 zarinpal: {
 merchantId: zTrimmed,
 enabled: zarinpalEnabled,
 },
 idpay: {
 merchantId: idpayMerchant.trim(),
 enabled: idpayEnabled,
 },
 }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 setPaymentTest(null);
 toast({
 title: "ذخیره شد",
 description: "تنظیمات درگاه پرداخت با موفقیت به‌روزرسانی شد",
 });
 // بعد از ذخیره، وضعیت ماسک‌شده را دوباره بخوان
 try {
 const getRes = await apiFetch("/api/platform/settings/payment", token);
 if (getRes.ok) {
 const gJson = await getRes.json();
 setZarinpalMasked(gJson.data?.zarinpal?.merchantMasked || "");
 setZarinpalConfigured(!!gJson.data?.zarinpal?.configured);
 setIdpayMasked(gJson.data?.idpay?.merchantMasked || "");
 setIdpayConfigured(!!gJson.data?.idpay?.configured);
 }
 } catch { /* ignore refresh */ }
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 });
 } finally {
 setSavingPayment(false);
 }
 };

 // تست اتصال درگاه زرین‌پال — درخواست حداقلی به API زرین‌پال
 const testZarinpalConnection = async () => {
 setTestingPayment(true);
 setPaymentTest(null);
 try {
 const res = await apiFetch("/api/platform/settings/payment/test", token);
 const json = await res.json();
 const ok = !!json.ok;
 const message = json.message || json.error || "نتیجه نامشخص";
 setPaymentTest({ ok, message });
 toast({
 variant: ok? "default": "destructive",
 title: ok? "اتصال برقرار است": "تست اتصال ناموفق",
 description: message,
 });
 } catch (e) {
 const message = e instanceof Error? e.message: "خطا در تست اتصال";
 setPaymentTest({ ok: false, message });
 toast({
 variant: "destructive",
 title: "خطا",
 description: message,
 });
 } finally {
 setTestingPayment(false);
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center py-20 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin ml-2" />
 در حال بارگذاری تنظیمات...
 </div>
 );
 }

 return (
 <div className="space-y-5">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Key className="h-5 w-5 text-primary" />
 سیاست رمز عبور
 </CardTitle>
 <CardDescription>
 قوانین حداقل مورد نیاز برای رمزهای عبور کاربران
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="min-length">حداقل طول رمز</Label>
 <Input
 id="min-length"
 type="number"
 min={6}
 max={128}
 value={policy.minLength}
 onChange={(e) =>
 setPolicy({
...policy,
 minLength: parseInt(e.target.value, 10) || 8,
 })
 }
 />
 </div>
 </div>

 <div className="space-y-3">
 <PolicyToggle
 label="الزام حرف بزرگ (A-Z)"
 checked={policy.requireUppercase}
 onChange={(v) => setPolicy({...policy, requireUppercase: v })}
 />
 <PolicyToggle
 label="الزام حرف کوچک (a-z)"
 checked={policy.requireLowercase}
 onChange={(v) => setPolicy({...policy, requireLowercase: v })}
 />
 <PolicyToggle
 label="الزام عدد (0-9)"
 checked={policy.requireNumbers}
 onChange={(v) => setPolicy({...policy, requireNumbers: v })}
 />
 <PolicyToggle
 label="الزام کاراکتر خاص (!@#$%)"
 checked={policy.requireSpecialChars}
 onChange={(v) => setPolicy({...policy, requireSpecialChars: v })}
 />
 </div>

 <Button onClick={savePolicy} disabled={savingPolicy}>
 {savingPolicy? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Save className="h-4 w-4" />
 )}
 ذخیره سیاست رمز عبور
 </Button>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Clock className="h-5 w-5 text-primary" />
 مدت نشست کاربران
 </CardTitle>
 <CardDescription>
 مدت زمانی که نشست کاربران معتبر می‌ماند (قبل از نیاز به ورود مجدد)
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex flex-col sm:flex-row sm:items-end gap-3">
 <div className="space-y-2 flex-1">
 <Label htmlFor="session-days">مدت نشست (روز)</Label>
 <Input
 id="session-days"
 type="number"
 min={1}
 max={90}
 value={sessionDays}
 onChange={(e) =>
 setSessionDays(parseInt(e.target.value, 10) || 7)
 }
 />
 <p className="text-xs text-muted-foreground">
 بین ۱ تا ۹۰ روز. نشست‌های فعلی تحت تأثیر قرار نمی‌گیرند.
 </p>
 </div>
 <Button onClick={saveSession} disabled={savingSession}>
 {savingSession? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Save className="h-4 w-4" />
 )}
 ذخیره
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <History className="h-5 w-5 text-primary" />
 سیاست نگهداری لاگ
 </CardTitle>
 <CardDescription>
 مدیریت لاگ‌های ممیزی قدیمی برای جلوگیری از رشد نامحدود دیتابیس
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 {auditStats && (
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
 <StatBox label="کل لاگ‌ها" value={auditStats.total} tone="primary" />
 <StatBox label="۲۴ ساعت اخیر" value={auditStats.last24h} tone="success" />
 <StatBox label="۷ روز اخیر" value={auditStats.last7d} tone="success" />
 <StatBox label="۳۰ روز اخیر" value={auditStats.last30d} tone="info" />
 <StatBox label="۹۰ روز اخیر" value={auditStats.last90d} tone="info" />
 <StatBox
 label="قدیمی‌تر از ۹۰ روز"
 value={auditStats.olderThan90d}
 tone="warning"
 />
 </div>
 )}

 <div className="flex flex-col sm:flex-row sm:items-end gap-3">
 <div className="space-y-2 flex-1">
 <Label htmlFor="retention-days">دوره نگهداری (روز)</Label>
 <Input
 id="retention-days"
 type="number"
 min={7}
 max={3650}
 value={retentionDays}
 onChange={(e) =>
 setRetentionDays(parseInt(e.target.value, 10) || 90)
 }
 />
 <p className="text-xs text-muted-foreground">
 لاگ‌های قدیمی‌تر از این مدت قابل حذف خواهند بود. حداقل ۷ روز.
 </p>
 </div>
 <Button onClick={saveRetention} variant="outline" disabled={savingRetention}>
 {savingRetention? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Save className="h-4 w-4" />
 )}
 ذخیره دوره
 </Button>
 </div>

 <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4">
 <div className="flex items-start gap-3">
 <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
 <div className="flex-1">
 <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
 پاک‌سازی دستی
 </p>
 <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
 {toPersianDigits(deletableCount)} لاگ قدیمی‌تر از{" "}
 {toPersianDigits(retentionDays)} روز قابل حذف هستند. این عملیات
 قابل بازگشت نیست.
 </p>
 <Button
 onClick={runCleanup}
 variant="destructive"
 size="sm"
 className="mt-3"
 disabled={cleaning || deletableCount === 0}
 >
 {cleaning? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Trash2 className="h-4 w-4" />
 )}
 پاک‌سازی دستی
 </Button>
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* ===== Payment Gateway Settings ===== */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <CreditCard className="h-5 w-5 text-primary" />
 تنظیمات درگاه پرداخت
 </CardTitle>
 <CardDescription>
 پیکربندی کد پذیرنده زرین‌پال و آیدی‌پی برای خرید پلن‌ها و پرداخت آنلاین
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-6">
 {/* Zarinpal */}
 <div className="space-y-3 rounded-lg border p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="flex items-center gap-2">
 <p className="text-sm font-semibold">زرین‌پال (ZarinPal)</p>
 <Badge
 className={`text-[10px] h-5 ${
 zarinpalConfigured
 ? "bg-success/10 text-success"
 : "bg-muted text-muted-foreground"
 }`}
 >
 {zarinpalConfigured? "پیکربندی‌شده": "پیکربندی نشده"}
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground mt-0.5">
 کد پذیرنده UUID با فرمت XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX (۳۶ کاراکتر)
 </p>
 </div>
 <div className="flex items-center gap-2">
 <span className="text-xs text-muted-foreground">فعال</span>
 <Switch
 checked={zarinpalEnabled}
 onCheckedChange={setZarinpalEnabled}
 disabled={savingPayment}
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="zarinpal-merchant">کد پذیرنده زرین‌پال</Label>
 <Input
 id="zarinpal-merchant"
 dir="ltr"
 placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 value={zarinpalMerchant}
 onChange={(e) => setZarinpalMerchant(e.target.value)}
 disabled={savingPayment}
 className="font-mono"
 />
 {zarinpalMerchant.trim() &&
!ZARINPAL_UUID_RE.test(zarinpalMerchant.trim()) && (
 <p className="text-xs text-destructive">فرمت کد پذیرنده معتبر نیست</p>
 )}
 {zarinpalMasked && (
 <p className="text-[11px] text-muted-foreground" dir="ltr">
 مقدار ذخیره‌شده: <span className="font-mono">{zarinpalMasked}</span>
 </p>
 )}
 </div>
 </div>

 {/* IDPay */}
 <div className="space-y-3 rounded-lg border p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="flex items-center gap-2">
 <p className="text-sm font-semibold">آیدی‌پی (IDPay)</p>
 <Badge
 className={`text-[10px] h-5 ${
 idpayConfigured
 ? "bg-success/10 text-success"
 : "bg-muted text-muted-foreground"
 }`}
 >
 {idpayConfigured? "پیکربندی‌شده": "پیکربندی نشده"}
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground mt-0.5">
 کد پذیرنده API Key از پنل آیدی‌پی
 </p>
 </div>
 <div className="flex items-center gap-2">
 <span className="text-xs text-muted-foreground">فعال</span>
 <Switch
 checked={idpayEnabled}
 onCheckedChange={setIdpayEnabled}
 disabled={savingPayment}
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="idpay-merchant">کد پذیرنده آیدی‌پی</Label>
 <Input
 id="idpay-merchant"
 dir="ltr"
 placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 value={idpayMerchant}
 onChange={(e) => setIdpayMerchant(e.target.value)}
 disabled={savingPayment}
 className="font-mono"
 />
 {idpayMasked && (
 <p className="text-[11px] text-muted-foreground" dir="ltr">
 مقدار ذخیره‌شده: <span className="font-mono">{idpayMasked}</span>
 </p>
 )}
 </div>
 </div>

 <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4">
 <div className="flex items-start gap-3">
 <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
 <div className="flex-1">
 <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
 توجه امنیتی
 </p>
 <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
 کد پذیرنده به‌صورت رمزنگاری‌شده در دیتابیس ذخیره نمی‌شود. مطمئن شوید
 دسترسی به پنل سوپرادمین محدود و از طریق HTTPS است. درگاه آیدی‌پی در
 نسخه فعلی فقط برای نمایش پیکربندی است و پرداخت از طریق زرین‌پال انجام می‌شود.
 </p>
 </div>
 </div>
 </div>

 <div className="flex flex-col sm:flex-row gap-2">
 <Button onClick={savePaymentSettings} disabled={savingPayment}>
 {savingPayment? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Save className="h-4 w-4" />
 )}
 ذخیره تنظیمات درگاه پرداخت
 </Button>
 <Button
 variant="outline"
 onClick={testZarinpalConnection}
 disabled={testingPayment || savingPayment}
 >
 {testingPayment? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Zap className="h-4 w-4" />
 )}
 تست اتصال زرین‌پال
 </Button>
 </div>
 {paymentTest && (
 <div
 className={`rounded-lg border p-3 flex items-start gap-2 ${
 paymentTest.ok
 ? "border-success/30 bg-success/5"
 : "border-destructive/30 bg-destructive/5"
 }`}
 >
 {paymentTest.ok? (
 <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
 ): (
 <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
 )}
 <p
 className={`text-xs leading-relaxed ${
 paymentTest.ok? "text-success": "text-destructive"
 }`}
 >
 {paymentTest.message}
 </p>
 </div>
 )}
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Server className="h-5 w-5 text-primary" />
 وضعیت سلامت سرویس‌ها
 </CardTitle>
 <CardDescription>
 مشاهده وضعیت لحظه‌ای سرویس‌های حیاتی (database، realtime، AI)
 </CardDescription>
 </CardHeader>
 <CardContent>
 <HealthCheckWidget />
 </CardContent>
 </Card>
 </div>
 );
}

function PolicyToggle({
 label,
 checked,
 onChange,
}: {
 label: string;
 checked: boolean;
 onChange: (v: boolean) => void;
}) {
 return (
 <div className="flex items-center justify-between rounded-md border p-3">
 <span className="text-sm">{label}</span>
 <Switch checked={checked} onCheckedChange={onChange} />
 </div>
 );
}

function StatBox({
 label,
 value,
 tone,
}: {
 label: string;
 value: number;
 tone: "primary" | "success" | "info" | "warning";
}) {
 // v28 — تینت پس‌زمینهٔ ملایم + هم‌ترازی عمودی بهتر برای اسکن سریع وضعیت
 const toneClass =
 tone === "success"
? "text-emerald-700 bg-emerald-50 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/60"
: tone === "info"
? "text-primary bg-primary/10 border-primary/20"
: tone === "warning"
? "text-amber-700 bg-amber-50 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/60"
: "text-muted-foreground bg-muted border-border";
 return (
 <div className="rounded-md border border-border/60 bg-card p-3">
 <div className="text-xs text-muted-foreground">{label}</div>
 <div
 className={`text-lg font-extrabold mt-1.5 inline-block px-2.5 py-1 rounded-md border tnum ${toneClass}`}
 >
 {toPersianDigits(value)}
 </div>
 </div>
 );
}

function HealthCheckWidget() {
 const [health, setHealth] = React.useState<{
 status: string;
 services?: {
 database?: { status: string; latency?: number };
 ai?: { status: string };
 realtime?: { status: string; port: number; latency?: number };
 };
 uptime?: number;
 responseTimeMs?: number;
 } | null>(null);
 const [loading, setLoading] = React.useState(true);

 const fetchHealth = React.useCallback(async () => {
 try {
 const res = await fetch("/api/health");
 if (res.ok) {
 const json = await res.json();
 setHealth(json);
 }
 } catch {
 // ignore
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchHealth();
 const interval = setInterval(fetchHealth, 30000);
 return () => clearInterval(interval);
 }, [fetchHealth]);

 if (loading) {
 return (
 <div className="flex items-center justify-center py-6 text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin ml-2" />
 در حال بررسی وضعیت...
 </div>
 );
 }

 if (!health) {
 return (
 <div className="text-sm text-muted-foreground">
 دریافت وضعیت ناموفق بود
 </div>
 );
 }

 const statusLabel =
 health.status === "healthy"
? "سالم"
: health.status === "degraded"
? "کاهش یافته"
: "از کار افتاده";
 const statusColor =
 health.status === "healthy"
? "bg-emerald-100 text-emerald-700"
: health.status === "degraded"
? "bg-amber-100 text-amber-700"
: "bg-red-100 text-red-700";

 return (
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium">وضعیت کلی</span>
 <Badge className={statusColor}>{statusLabel}</Badge>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <ServiceStatus
 name="دیتابیس"
 status={health.services?.database?.status || "unknown"}
 extra={
 health.services?.database?.latency
? `${toPersianDigits(health.services.database.latency)}ms`
: undefined
 }
 />
 <ServiceStatus
 name="realtime (ws)"
 status={health.services?.realtime?.status || "unknown"}
 extra={
 health.services?.realtime
? `پورت ${toPersianDigits(health.services.realtime.port)}`
: undefined
 }
 />
 <ServiceStatus
 name="AI"
 status={health.services?.ai?.status || "unknown"}
 />
 </div>

 <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
 <span>
 آپتایم:{" "}
 {toPersianDigits(Math.floor((health.uptime || 0) / 60))} دقیقه
 </span>
 <span>زمان پاسخ: {toPersianDigits(health.responseTimeMs || 0)}ms</span>
 </div>
 </div>
 );
}

function ServiceStatus({
 name,
 status,
 extra,
}: {
 name: string;
 status: string;
 extra?: string;
}) {
 const isUp = status === "up";
 const color = isUp
? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
: "text-red-600 bg-red-50 dark:bg-red-950/30";
 return (
 <div className="rounded-md border p-3">
 <div className="text-xs text-muted-foreground">{name}</div>
 <div className="flex items-center gap-2 mt-1">
 <span
 className={`inline-block size-2 rounded-full ${
 isUp? "bg-emerald-500": "bg-red-500"
 }`}
 />
 <span className={`text-sm font-medium px-2 py-0.5 rounded ${color}`}>
 {isUp? "فعال": "از کار افتاده"}
 </span>
 </div>
 {extra && (
 <div className="text-xs text-muted-foreground mt-1" dir="ltr">
 {extra}
 </div>
 )}
 </div>
 );
}

// ============ تب CRM و مشتریان ============

interface CrmNoteRow {
 id: string;
 content: string;
 creatorName: string | null;
 createdAt: string;
}

interface CrmCustomerRow {
 id: string;
 name: string;
 subdomain: string | null;
 plan: string;
 status: string;
 crmStage: string; // lead | trial | active | churned
 contactName: string | null;
 contactEmail: string | null;
 contactPhone: string | null;
 lastActivityAt: string | null;
 totalRevenue: number;
 createdAt: string;
 counts: { users: number; invoices: number; products: number; parties: number };
 license: { key: string; plan: string; status: string; endDate: string | null } | null;
 notes: CrmNoteRow[];
}

interface CrmPipeline {
 lead: number;
 trial: number;
 active: number;
 churned: number;
 totalRevenue: number;
 total: number;
}

const CRM_STAGES: { value: string; label: string; color: string; dot: string }[] = [
 { value: "lead", label: "سرنخ", color: "bg-muted/60 border-border", dot: "bg-muted-foreground" },
 { value: "trial", label: "دوره آزمایشی", color: "bg-amber-50 dark:bg-amber-900/15 border-amber-300/50 dark:border-amber-700/30", dot: "bg-amber-500" },
 { value: "active", label: "فعال", color: "bg-emerald-50 dark:bg-emerald-900/15 border-emerald-300/50 dark:border-emerald-700/30", dot: "bg-emerald-500" },
 { value: "churned", label: "رها شده", color: "bg-red-50 dark:bg-red-900/15 border-red-300/50 dark:border-red-700/30", dot: "bg-red-500" },
];

const CRM_STAGE_LABEL: Record<string, string> = Object.fromEntries(
 CRM_STAGES.map((s) => [s.value, s.label])
);

function crmStageBadge(stage: string) {
 const s = CRM_STAGES.find((x) => x.value === stage);
 if (!s) return "bg-muted text-muted-foreground";
 return "text-foreground/80";
}

function CRMTab({
 token,
 onQuickLogin,
}: {
 token: string;
 onQuickLogin: (token: string, tenantName?: string) => void;
}) {
 const { toast } = useToast();
 const [customers, setCustomers] = React.useState<CrmCustomerRow[]>([]);
 const [pipeline, setPipeline] = React.useState<CrmPipeline | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [search, setSearch] = React.useState("");
 const [stageFilter, setStageFilter] = React.useState("all");
 const [view, setView] = React.useState<"pipeline" | "list">("pipeline");
 const [detailCustomer, setDetailCustomer] = React.useState<CrmCustomerRow | null>(null);
 const [newNote, setNewNote] = React.useState("");
 const [addingNote, setAddingNote] = React.useState(false);
 const [actingId, setActingId] = React.useState<string | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/crm", token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setCustomers(data.data || []);
 setPipeline(data.pipeline || null);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت لیست مشتریان",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const filtered = React.useMemo(() => {
 return customers.filter((c) => {
 if (stageFilter!== "all" && c.crmStage!== stageFilter) return false;
 if (search) {
 const q = search.toLowerCase();
 const matches =
 c.name.toLowerCase().includes(q) ||
 (c.contactEmail || "").toLowerCase().includes(q) ||
 (c.contactName || "").toLowerCase().includes(q) ||
 (c.contactPhone || "").includes(q);
 if (!matches) return false;
 }
 return true;
 });
 }, [customers, search, stageFilter]);

 const addNote = async (tenantId: string) => {
 if (!newNote.trim()) return;
 setAddingNote(true);
 try {
 const res = await apiFetch("/api/platform/crm", token, {
 method: "POST",
 body: JSON.stringify({ tenantId, content: newNote.trim(), action: "addNote" }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "یادداشت ذخیره شد", description: "در پروفایل مشتری ثبت شد." });
 setNewNote("");
 // به‌روزرسانی محلی
 setCustomers((prev) =>
 prev.map((c) =>
 c.id === tenantId
? {...c, notes: [data.data,...c.notes], lastActivityAt: new Date().toISOString() }
: c
 )
 );
 if (detailCustomer?.id === tenantId) {
 setDetailCustomer((d) =>
 d? {...d, notes: [data.data,...d.notes], lastActivityAt: new Date().toISOString() }: d
 );
 }
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره یادداشت",
 variant: "destructive",
 });
 } finally {
 setAddingNote(false);
 }
 };

 const updateStage = async (tenantId: string, stage: string) => {
 setActingId(tenantId);
 try {
 const res = await apiFetch("/api/platform/crm", token, {
 method: "POST",
 body: JSON.stringify({ tenantId, content: stage, action: "updateStage" }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "مرحله به‌روزرسانی شد", description: `مشتری به مرحله‌ی «${CRM_STAGE_LABEL[stage]}» منتقل شد.` });
 setCustomers((prev) =>
 prev.map((c) => (c.id === tenantId? {...c, crmStage: stage }: c))
 );
 if (detailCustomer?.id === tenantId) {
 setDetailCustomer((d) => (d? {...d, crmStage: stage }: d));
 }
 setPipeline((p) => {
 if (!p) return p;
 const next = {...p };
 const old = customers.find((c) => c.id === tenantId)?.crmStage;
 if (old) next[old as keyof CrmPipeline] = Math.max(0, (next[old as keyof CrmPipeline] as number) - 1);
 next[stage as keyof CrmPipeline] = (next[stage as keyof CrmPipeline] as number) + 1;
 return next;
 });
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در به‌روزرسانی مرحله",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 const quickLogin = async (id: string, name: string) => {
 setActingId(id);
 try {
 const res = await apiFetch("/api/platform/quick-login", token, {
 method: "POST",
 body: JSON.stringify({ tenantId: id }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "ورود فوری ایجاد شد",
 description: `ورود به «${name}» انجام شد.`,
 });
 onQuickLogin(data.token, name);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ورود فوری",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 return (
 <div className="space-y-4">
 {/* کارت‌های خلاصه‌ی pipeline */}
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
 <StatCard
 icon={Contact}
 label="کل مشتریان"
 value={pipeline? toPersianDigits(pipeline.total): "—"}
 accent="primary"
 />
 {CRM_STAGES.map((s) => (
 <Card key={s.value} className="card-hover overflow-hidden">
 <CardContent className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] text-muted-foreground mb-1 truncate">{s.label}</p>
 <p className="text-2xl font-bold leading-none tnum">
 {pipeline? toPersianDigits(pipeline[s.value as keyof CrmPipeline] as number): "—"}
 </p>
 </div>
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
 <CircleDot className={`h-4 w-4 ${s.dot.replace("bg-", "text-")}`} />
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>

 {/* کارت درآمد کل */}
 <Card className="card-hover border-primary/30">
 <CardContent className="p-4 flex items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <TrendingUp className="h-5 w-5" />
 </div>
 <div>
 <p className="text-[11px] text-muted-foreground">درآمد ثبت‌شدهٔ واقعی (CRM)</p>
 <p className="text-xl font-bold tnum">
 {pipeline? formatCompactToman(pipeline.totalRevenue): "—"}
 </p>
 </div>
 </div>
 <Button variant="outline" size="sm" className="h-8 text-xs" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 به‌روزرسانی
 </Button>
 </CardContent>
 </Card>

 {/* جستجو + فیلتر + تغییر نما */}
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی نام، ایمیل، تلفن..."
 className="ps-9 h-9"
 />
 </div>
 <Select value={stageFilter} onValueChange={setStageFilter}>
 <SelectTrigger className="h-9 w-full sm:w-[180px]">
 <Filter className="h-3.5 w-3.5" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه مراحل</SelectItem>
 {CRM_STAGES.map((s) => (
 <SelectItem key={s.value} value={s.value}>
 {s.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
 <Button
 type="button"
 variant={view === "pipeline"? "default": "ghost"}
 size="sm"
 className="h-8 text-xs"
 onClick={() => setView("pipeline")}
 >
 <LayoutGrid className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">پیپ‌لاین</span>
 </Button>
 <Button
 type="button"
 variant={view === "list"? "default": "ghost"}
 size="sm"
 className="h-8 text-xs"
 onClick={() => setView("list")}
 >
 <ListIcon className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">لیست</span>
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {loading? (
 <div className="flex items-center justify-center py-20 text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin me-2" />
 در حال بارگذاری مشتریان...
 </div>
 ): filtered.length === 0? (
 <div className="flex flex-col items-center justify-center py-16 gap-2">
 <Contact className="h-8 w-8 text-muted-foreground" />
 <p className="text-sm text-muted-foreground">مشتری‌ای با این فیلترها یافت نشد</p>
 </div>
 ): view === "pipeline"? (
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
 {CRM_STAGES.map((stage) => {
 const stageCustomers = filtered.filter((c) => c.crmStage === stage.value);
 return (
 <div
 key={stage.value}
 className={`rounded-xl border ${stage.color} p-3 min-h-[260px] flex flex-col`}
 >
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-2">
 <span className={`inline-block size-2 rounded-full ${stage.dot}`} />
 <span className="text-xs font-bold">{stage.label}</span>
 </div>
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(stageCustomers.length)}
 </Badge>
 </div>
 <div className="space-y-2 flex-1">
 {stageCustomers.length === 0? (
 <p className="text-[10px] text-muted-foreground text-center py-6">
 مشتری‌ای در این مرحله نیست
 </p>
 ): (
 stageCustomers.map((c) => (
 <CustomerCard
 key={c.id}
 customer={c}
 onOpen={() => setDetailCustomer(c)}
 onQuickLogin={() => quickLogin(c.id, c.name)}
 acting={actingId === c.id}
 />
 ))
 )}
 </div>
 </div>
 );
 })}
 </div>
 ): (
 <Card>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px]">نام سازمان</TableHead>
 <TableHead className="text-start text-[11px]">مرحله CRM</TableHead>
 <TableHead className="text-start text-[11px]">پلن</TableHead>
 <TableHead className="text-start text-[11px]">اطلاعات تماس</TableHead>
 <TableHead className="text-end text-[11px]">درآمد ثبت‌شده</TableHead>
 <TableHead className="text-start text-[11px]">آخرین فعالیت</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filtered.map((c) => (
 <TableRow key={c.id}>
 <TableCell>
 <div className="flex flex-col">
 <span className="text-xs font-medium truncate max-w-[160px]">{c.name}</span>
 {c.contactName && (
 <span className="text-[10px] text-muted-foreground">{c.contactName}</span>
 )}
 </div>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${crmStageBadge(c.crmStage)}`}>
 <span
 className={`inline-block size-1.5 rounded-full me-1 ${
 CRM_STAGES.find((s) => s.value === c.crmStage)?.dot || "bg-muted"
 }`}
 />
 {CRM_STAGE_LABEL[c.crmStage] || c.crmStage}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${planBadge(c.plan)}`}>
 {PLAN_LABELS[c.plan] || c.plan}
 </Badge>
 </TableCell>
 <TableCell>
 <div className="flex flex-col gap-0.5">
 {c.contactEmail? (
 <span className="text-[10px] text-muted-foreground truncate max-w-[180px]" dir="ltr">
 {c.contactEmail}
 </span>
 ): (
 <span className="text-[10px] text-muted-foreground">—</span>
 )}
 {c.contactPhone && (
 <span className="text-[10px] text-muted-foreground" dir="ltr">
 {c.contactPhone}
 </span>
 )}
 </div>
 </TableCell>
 <TableCell className="text-end text-xs tnum">
 {c.totalRevenue > 0? formatCompactToman(c.totalRevenue): "—"}
 </TableCell>
 <TableCell className="text-xs tnum text-muted-foreground">
 {c.lastActivityAt? toJalali(new Date(c.lastActivityAt)): "—"}
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-end gap-1">
 {c.contactPhone && (
 <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary">
 <a href={`tel:${c.contactPhone}`} title="تماس">
 <Phone className="h-3.5 w-3.5" />
 </a>
 </Button>
 )}
 {c.contactEmail && (
 <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary">
 <a href={`mailto:${c.contactEmail}`} title="ارسال ایمیل">
 <Mail className="h-3.5 w-3.5" />
 </a>
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0"
 onClick={() => setDetailCustomer(c)}
 title="یادداشت‌ها و جزئیات"
 >
 <StickyNote className="h-3.5 w-3.5" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>
 )}

 {/* دیالوگ جزئیات مشتری + یادداشت‌ها */}
 <Dialog open={!!detailCustomer} onOpenChange={(o) =>!o && setDetailCustomer(null)}>
 <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
 {detailCustomer && (
 <>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Contact className="h-4 w-4 text-primary" />
 {detailCustomer.name}
 </DialogTitle>
 <DialogDescription className="text-xs">
 پروفایل مشتری — اطلاعات تماس، یادداشت‌ها و مرحله‌ی CRM
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4">
 {/* خلاصه‌ی اطلاعات */}
 <div className="grid grid-cols-2 gap-3">
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">مرحله‌ی CRM</p>
 <div className="flex items-center gap-2">
 <span
 className={`inline-block size-2 rounded-full ${
 CRM_STAGES.find((s) => s.value === detailCustomer.crmStage)?.dot || "bg-muted"
 }`}
 />
 <span className="text-sm font-medium">
 {CRM_STAGE_LABEL[detailCustomer.crmStage] || detailCustomer.crmStage}
 </span>
 </div>
 </div>
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">پلن</p>
 <Badge variant="secondary" className={`text-[10px] ${planBadge(detailCustomer.plan)}`}>
 {PLAN_LABELS[detailCustomer.plan] || detailCustomer.plan}
 </Badge>
 </div>
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">تماس‌دهنده</p>
 <p className="text-xs font-medium">{detailCustomer.contactName || "—"}</p>
 <p className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">
 {detailCustomer.contactEmail || "—"}
 </p>
 <p className="text-[10px] text-muted-foreground" dir="ltr">
 {detailCustomer.contactPhone || "—"}
 </p>
 </div>
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">آخرین فعالیت</p>
 <p className="text-xs tnum">
 {detailCustomer.lastActivityAt
? toJalali(new Date(detailCustomer.lastActivityAt))
: "—"}
 </p>
 <p className="text-[10px] text-muted-foreground mt-0.5 tnum">
 درآمد ثبت‌شده: {detailCustomer.totalRevenue > 0
? formatCompactToman(detailCustomer.totalRevenue)
: "—"}
 </p>
 </div>
 </div>

 {/* دکمه‌های تماس + تغییر مرحله */}
 <div className="flex flex-wrap items-center gap-2">
 {detailCustomer.contactPhone && (
 <Button asChild size="sm" variant="outline" className="h-8 text-xs">
 <a href={`tel:${detailCustomer.contactPhone}`}>
 <Phone className="h-3.5 w-3.5" />
 تماس
 </a>
 </Button>
 )}
 {detailCustomer.contactEmail && (
 <Button asChild size="sm" variant="outline" className="h-8 text-xs">
 <a href={`mailto:${detailCustomer.contactEmail}`}>
 <Mail className="h-3.5 w-3.5" />
 ارسال ایمیل
 </a>
 </Button>
 )}
 <Button
 size="sm"
 variant="outline"
 className="h-8 text-xs"
 onClick={() => quickLogin(detailCustomer.id, detailCustomer.name)}
 disabled={actingId === detailCustomer.id}
 >
 {actingId === detailCustomer.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Zap className="h-3.5 w-3.5" />
 )}
 ورود فوری
 </Button>
 <div className="ms-auto flex items-center gap-2">
 <span className="text-[10px] text-muted-foreground">انتقال به مرحله:</span>
 <Select
 value={detailCustomer.crmStage}
 onValueChange={(v) => updateStage(detailCustomer.id, v)}
 disabled={actingId === detailCustomer.id}
 >
 <SelectTrigger className="h-8 w-[140px] text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {CRM_STAGES.map((s) => (
 <SelectItem key={s.value} value={s.value}>
 {s.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 {/* یادداشت‌ها */}
 <div className="rounded-lg border border-border p-3 space-y-3">
 <div className="flex items-center gap-2">
 <StickyNote className="h-4 w-4 text-primary" />
 <p className="text-xs font-bold">یادداشت‌ها ({toPersianDigits(detailCustomer.notes.length)})</p>
 </div>
 <div className="space-y-2 max-h-[200px] overflow-y-auto">
 {detailCustomer.notes.length === 0? (
 <p className="text-[11px] text-muted-foreground text-center py-3">
 هنوز یادداشتی ثبت نشده است
 </p>
 ): (
 detailCustomer.notes.map((n) => (
 <div key={n.id} className="rounded-md bg-muted/40 p-2.5">
 <p className="text-xs leading-relaxed">{n.content}</p>
 <div className="flex items-center justify-between mt-1.5">
 <span className="text-[10px] text-muted-foreground">
 {n.creatorName || "سوپرادمین"}
 </span>
 <span className="text-[10px] text-muted-foreground tnum">
 {toJalali(new Date(n.createdAt))}
 </span>
 </div>
 </div>
 ))
 )}
 </div>
 <div className="space-y-2">
 <Textarea
 value={newNote}
 onChange={(e) => setNewNote(e.target.value)}
 placeholder="یادداشت جدید درباره‌ی این مشتری..."
 rows={2}
 className="text-xs resize-none"
 />
 <div className="flex items-center justify-between">
 <span className="text-[10px] text-muted-foreground tnum">
 {toPersianDigits(newNote.length)} کاراکتر
 </span>
 <Button
 size="sm"
 className="h-8 text-xs"
 onClick={() => addNote(detailCustomer.id)}
 disabled={addingNote ||!newNote.trim()}
 >
 {addingNote? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <PlusIcon className="h-3.5 w-3.5" />
 )}
 افزودن یادداشت
 </Button>
 </div>
 </div>
 </div>
 </div>

 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setDetailCustomer(null)}>
 بستن
 </Button>
 </DialogFooter>
 </>
 )}
 </DialogContent>
 </Dialog>
 </div>
 );
}

// کارت مشتری در نمای pipeline
function CustomerCard({
 customer,
 onOpen,
 onQuickLogin,
 acting,
}: {
 customer: CrmCustomerRow;
 onOpen: () => void;
 onQuickLogin: () => void;
 acting: boolean;
}) {
 return (
 <button
 type="button"
 onClick={onOpen}
 className="w-full text-start rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all p-2.5"
 >
 <div className="flex items-start justify-between gap-2 mb-1.5">
 <span className="text-xs font-bold truncate flex-1">{customer.name}</span>
 <Badge variant="secondary" className={`text-[9px] shrink-0 ${planBadge(customer.plan)}`}>
 {PLAN_LABELS[customer.plan] || customer.plan}
 </Badge>
 </div>
 <div className="space-y-0.5">
 {customer.contactName && (
 <p className="text-[10px] text-muted-foreground truncate">{customer.contactName}</p>
 )}
 {customer.contactEmail && (
 <p className="text-[10px] text-muted-foreground truncate" dir="ltr">
 {customer.contactEmail}
 </p>
 )}
 {customer.contactPhone && (
 <p className="text-[10px] text-muted-foreground" dir="ltr">
 {customer.contactPhone}
 </p>
 )}
 </div>
 <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
 <span className="text-[10px] text-muted-foreground tnum">
 {customer.totalRevenue > 0? formatCompactToman(customer.totalRevenue): "—"}
 </span>
 <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
 {customer.contactPhone && (
 <Button asChild variant="ghost" size="sm" className="h-6 w-6 p-0 text-primary">
 <a href={`tel:${customer.contactPhone}`} title="تماس">
 <Phone className="h-3 w-3" />
 </a>
 </Button>
 )}
 {customer.contactEmail && (
 <Button asChild variant="ghost" size="sm" className="h-6 w-6 p-0 text-primary">
 <a href={`mailto:${customer.contactEmail}`} title="ایمیل">
 <Mail className="h-3 w-3" />
 </a>
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 className="h-6 w-6 p-0 text-warning"
 onClick={onQuickLogin}
 disabled={acting}
 title="ورود فوری"
 >
 {acting? <Loader2 className="h-3 w-3 animate-spin" />: <Zap className="h-3 w-3" />}
 </Button>
 </div>
 </div>
 </button>
 );
}

// ============ تب مدیریت تیکت‌های پشتیبانی ============

interface SupportTicketRow {
 id: string;
 subject: string;
 description: string;
 category: string;
 priority: string;
 status: string;
 tenantId: string;
 tenant: { id: string; name: string; plan: string; status: string };
 userId: string | null;
 messageCount: number;
 createdAt: string;
 updatedAt: string;
}

interface TicketMessageRow {
 id: string;
 body: string;
 authorType: string;
 authorId: string | null;
 authorName: string | null;
 isAdmin: boolean;
 attachments?: TicketAttachment[] | null;
 createdAt: string;
}

interface TicketDetail extends SupportTicketRow {
 messages: TicketMessageRow[];
}

const TICKET_STATUS_LABELS: Record<string, string> = {
 OPEN: "باز",
 IN_PROGRESS: "در حال بررسی",
 RESOLVED: "حل‌شده",
 CLOSED: "بسته‌شده",
};

const TICKET_STATUS_COLORS: Record<string, string> = {
 OPEN: "bg-primary/10 text-primary",
 IN_PROGRESS: "bg-warning/10 text-warning",
 RESOLVED: "bg-success/10 text-success",
 CLOSED: "bg-muted text-muted-foreground",
};

const TICKET_PRIORITY_LABELS: Record<string, string> = {
 LOW: "پایین",
 MEDIUM: "متوسط",
 HIGH: "بالا",
 URGENT: "فوری",
};

const TICKET_PRIORITY_COLORS: Record<string, string> = {
 LOW: "bg-muted text-muted-foreground",
 MEDIUM: "bg-primary/10 text-primary",
 HIGH: "bg-warning/10 text-warning",
 URGENT: "bg-destructive/10 text-destructive",
};

const TICKET_CATEGORY_LABELS: Record<string, string> = {
 BILLING: "صورتحساب",
 TECHNICAL: "فنی",
 FEATURE_REQUEST: "درخواست ویژگی",
 BUG: "خطا",
 OTHER: "سایر",
};

function SupportTicketsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [tickets, setTickets] = React.useState<SupportTicketRow[]>([]);
 const [stats, setStats] = React.useState({
 open: 0,
 inProgress: 0,
 resolved: 0,
 closed: 0,
 total: 0,
 });
 const [loading, setLoading] = React.useState(true);
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [priorityFilter, setPriorityFilter] = React.useState("all");
 const [search, setSearch] = React.useState("");

 // مدال پاسخ
 const [replyTarget, setReplyTarget] = React.useState<SupportTicketRow | null>(null);
 const [ticketDetail, setTicketDetail] = React.useState<TicketDetail | null>(null);
 const [replyMessage, setReplyMessage] = React.useState("");
 const [sendingReply, setSendingReply] = React.useState(false);
 const [loadingDetail, setLoadingDetail] = React.useState(false);
 const [actingId, setActingId] = React.useState<string | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams();
 if (statusFilter!== "all") params.set("status", statusFilter);
 if (priorityFilter!== "all") params.set("priority", priorityFilter);
 if (search.trim()) params.set("search", search.trim());
 const res = await apiFetch(`/api/tickets/all?${params}`, token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setTickets(data.data || []);
 if (data.stats) setStats(data.stats);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت تیکت‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, statusFilter, priorityFilter, search, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const openReply = async (ticket: SupportTicketRow) => {
 setReplyTarget(ticket);
 setReplyMessage("");
 setLoadingDetail(true);
 try {
 const res = await apiFetch(`/api/tickets/${ticket.id}`, token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setTicketDetail(data.data);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت جزئیات تیکت",
 variant: "destructive",
 });
 setReplyTarget(null);
 } finally {
 setLoadingDetail(false);
 }
 };

 const sendReply = async () => {
 if (!replyTarget ||!replyMessage.trim()) return;
 setSendingReply(true);
 try {
 const res = await apiFetch(`/api/tickets/${replyTarget.id}/reply`, token, {
 method: "POST",
 body: JSON.stringify({ message: replyMessage.trim() }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "پاسخ ارسال شد",
 description: "پاسخ شما در تیکت ثبت شد. (ارسال ایمیل به کاربر توسط agent دیگر انجام می‌شود)",
 });
 setReplyMessage("");
 // بارگذاری مجدد جزئیات تیکت
 await openReply(replyTarget);
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ارسال پاسخ",
 variant: "destructive",
 });
 } finally {
 setSendingReply(false);
 }
 };

 const updateTicket = async (ticketId: string, patch: { status?: string; priority?: string }) => {
 setActingId(ticketId);
 try {
 const res = await apiFetch(`/api/tickets/${ticketId}`, token, {
 method: "PATCH",
 body: JSON.stringify(patch),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "به‌روزرسانی شد", description: data.message });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در به‌روزرسانی",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between gap-2">
 <div>
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <TicketIcon className="h-4 w-4 text-primary" />
 مدیریت تیکت‌های پشتیبانی
 </h2>
 <p className="text-[11px] text-muted-foreground">
 مشاهده و پاسخ به تیکت‌های همه‌ی سازمان‌ها
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 به‌روزرسانی
 </Button>
 </div>

 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
 <StatCard icon={TicketIcon} label="کل تیکت‌ها" value={toPersianDigits(stats.total)} accent="primary" />
 <StatCard icon={AlertCircle} label="باز" value={toPersianDigits(stats.open)} accent="warning" />
 <StatCard icon={Clock} label="در حال بررسی" value={toPersianDigits(stats.inProgress)} accent="chart5" />
 <StatCard icon={CheckCircle2} label="حل‌شده" value={toPersianDigits(stats.resolved)} accent="success" />
 <StatCard icon={Check} label="بسته‌شده" value={toPersianDigits(stats.closed)} accent="primary" />
 </div>

 {/* فیلترها */}
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی موضوع یا توضیحات تیکت..."
 className="ps-9 h-9"
 />
 </div>
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="h-9 w-full sm:w-[150px] text-xs">
 <SelectValue placeholder="وضعیت" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه وضعیت‌ها</SelectItem>
 <SelectItem value="OPEN">باز</SelectItem>
 <SelectItem value="IN_PROGRESS">در حال بررسی</SelectItem>
 <SelectItem value="RESOLVED">حل‌شده</SelectItem>
 <SelectItem value="CLOSED">بسته‌شده</SelectItem>
 </SelectContent>
 </Select>
 <Select value={priorityFilter} onValueChange={setPriorityFilter}>
 <SelectTrigger className="h-9 w-full sm:w-[150px] text-xs">
 <SelectValue placeholder="اولویت" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه اولویت‌ها</SelectItem>
 <SelectItem value="LOW">پایین</SelectItem>
 <SelectItem value="MEDIUM">متوسط</SelectItem>
 <SelectItem value="HIGH">بالا</SelectItem>
 <SelectItem value="URGENT">فوری</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </CardContent>
 </Card>

 {/* جدول تیکت‌ها */}
 <Card>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px]">موضوع</TableHead>
 <TableHead className="text-start text-[11px]">سازمان</TableHead>
 <TableHead className="text-start text-[11px]">دسته</TableHead>
 <TableHead className="text-start text-[11px]">اولویت</TableHead>
 <TableHead className="text-start text-[11px]">وضعیت</TableHead>
 <TableHead className="text-start text-[11px]">پیام‌ها</TableHead>
 <TableHead className="text-start text-[11px]">تاریخ</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {tickets.length === 0? (
 <TableRow>
 <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
 {loading? "در حال بارگذاری...": "تیکتی یافت نشد"}
 </TableCell>
 </TableRow>
 ): (
 tickets.map((t) => (
 <TableRow key={t.id}>
 <TableCell>
 <p className="text-xs font-medium line-clamp-1 max-w-[200px]">{t.subject}</p>
 <p className="text-[10px] text-muted-foreground line-clamp-1 max-w-[200px]">{t.description}</p>
 </TableCell>
 <TableCell>
 <div className="flex items-center gap-1.5">
 <Building2 className="h-3 w-3 text-muted-foreground" />
 <span className="text-xs truncate max-w-[100px]">{t.tenant?.name || "—"}</span>
 </div>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
 {TICKET_CATEGORY_LABELS[t.category] || t.category}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${TICKET_PRIORITY_COLORS[t.priority] || ""}`}>
 {TICKET_PRIORITY_LABELS[t.priority] || t.priority}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${TICKET_STATUS_COLORS[t.status] || ""}`}>
 {TICKET_STATUS_LABELS[t.status] || t.status}
 </Badge>
 </TableCell>
 <TableCell className="text-xs tnum text-center">
 {toPersianDigits(t.messageCount)}
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground whitespace-nowrap">
 {toJalali(new Date(t.createdAt))}
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-end gap-1">
 <Button
 variant="default"
 size="sm"
 className="h-7 text-xs"
 onClick={() => openReply(t)}
 >
 <Send className="h-3.5 w-3.5" />
 پاسخ
 </Button>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={actingId === t.id}>
 {actingId === t.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <MoreVertical className="h-3.5 w-3.5" />
 )}
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-48">
 <DropdownMenuLabel className="text-[10px] text-muted-foreground">
 تغییر وضعیت
 </DropdownMenuLabel>
 <DropdownMenuSeparator />
 <DropdownMenuItem
 className="text-xs"
 onClick={() => updateTicket(t.id, { status: "OPEN" })}
 >
 باز
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs"
 onClick={() => updateTicket(t.id, { status: "IN_PROGRESS" })}
 >
 در حال بررسی
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs"
 onClick={() => updateTicket(t.id, { status: "RESOLVED" })}
 >
 حل‌شده
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs"
 onClick={() => updateTicket(t.id, { status: "CLOSED" })}
 >
 بسته‌شده
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuLabel className="text-[10px] text-muted-foreground">
 تغییر اولویت
 </DropdownMenuLabel>
 <DropdownMenuItem
 className="text-xs"
 onClick={() => updateTicket(t.id, { priority: "URGENT" })}
 >
 فوری
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs"
 onClick={() => updateTicket(t.id, { priority: "HIGH" })}
 >
 بالا
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs"
 onClick={() => updateTicket(t.id, { priority: "MEDIUM" })}
 >
 متوسط
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs"
 onClick={() => updateTicket(t.id, { priority: "LOW" })}
 >
 پایین
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* مدال پاسخ به تیکت */}
 <Dialog open={!!replyTarget} onOpenChange={(o) =>!o && (setReplyTarget(null), setTicketDetail(null))}>
 <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <TicketIcon className="h-4 w-4 text-primary" />
 {replyTarget?.subject}
 </DialogTitle>
 <DialogDescription className="text-xs">
 {replyTarget?.tenant?.name} · {TICKET_CATEGORY_LABELS[replyTarget?.category || ""] || replyTarget?.category}
 </DialogDescription>
 </DialogHeader>

 {loadingDetail? (
 <div className="flex items-center justify-center py-10 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin me-2" />
 در حال بارگذاری...
 </div>
 ): ticketDetail? (
 <div className="flex-1 overflow-hidden flex flex-col gap-3">
 {/* توضیحات اولیه تیکت */}
 <div className="rounded-lg border border-border p-3 bg-muted/30">
 <p className="text-[10px] text-muted-foreground mb-1">توضیحات اولیه:</p>
 <p className="text-xs leading-relaxed">{ticketDetail.description}</p>
 </div>

 {/* لیست پیام‌ها */}
 <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pe-1">
 {ticketDetail.messages.length === 0? (
 <p className="text-[11px] text-muted-foreground text-center py-4">
 هنوز پیامی ثبت نشده است
 </p>
 ): (
 ticketDetail.messages.map((m) => (
 <div
 key={m.id}
 className={`rounded-lg p-3 ${m.isAdmin? "bg-primary/10 ms-8": "bg-muted me-8"}`}
 >
 <div className="flex items-center justify-between mb-1">
 <span className="text-[10px] font-medium">
 {m.isAdmin? "[پشتیبانی] " + (m.authorName || "پشتیبانی"): "[کاربر] " + (m.authorName || "کاربر")}
 </span>
 <span className="text-[10px] text-muted-foreground tnum">
 {toJalali(new Date(m.createdAt))}
 </span>
 </div>
 <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.body}</p>
 <TicketAttachmentThumbnails attachments={m.attachments} compact />
 </div>
 ))
 )}
 </div>

 {/* فرم پاسخ */}
 <div className="space-y-2 border-t pt-3">
 <Label className="text-xs">پاسخ شما:</Label>
 <Textarea
 value={replyMessage}
 onChange={(e) => setReplyMessage(e.target.value)}
 placeholder="پاسخ به تیکت کاربر را بنویسید..."
 rows={3}
 className="text-xs resize-none"
 />
 <div className="flex items-center justify-between">
 <p className="text-[10px] text-muted-foreground">
 ایمیل به کاربر توسط agent جداگانه ارسال خواهد شد (formsubmit.co)
 </p>
 <Button
 size="sm"
 onClick={sendReply}
 disabled={sendingReply ||!replyMessage.trim()}
 >
 {sendingReply? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Send className="h-3.5 w-3.5" />
 )}
 ارسال پاسخ
 </Button>
 </div>
 </div>
 </div>
 ): (
 <p className="text-xs text-muted-foreground text-center py-4">خطا در بارگذاری</p>
 )}
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ============ تب مدیریت پیشرفته کاربران ============

function AdvancedUserManagementTab({
 token,
 onQuickLogin,
}: {
 token: string;
 onQuickLogin: (token: string, tenantName?: string) => void;
}) {
 const { toast } = useToast();
 const [users, setUsers] = React.useState<UserRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [search, setSearch] = React.useState("");
 const [roleFilter, setRoleFilter] = React.useState("all");
 const [planFilter, setPlanFilter] = React.useState("all");
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [selected, setSelected] = React.useState<Set<string>>(new Set());
 const [actingId, setActingId] = React.useState<string | null>(null);
 const [bulkOpen, setBulkOpen] = React.useState(false);
 const [bulkAction, setBulkAction] = React.useState<"block" | "activate" | "extend-trial" | "delete">("block");
 const [bulkDays, setBulkDays] = React.useState("14");
 const [bulkRunning, setBulkRunning] = React.useState(false);

 // مدال‌ها
 const [planTarget, setPlanTarget] = React.useState<UserRow | null>(null);
 const [newPlan, setNewPlan] = React.useState<string>("basic");
 const [changingPlan, setChangingPlan] = React.useState(false);
 const [resetResult, setResetResult] = React.useState<string | null>(null);
 const [copied, setCopied] = React.useState(false);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams();
 if (search.trim()) params.set("search", search.trim());
 if (roleFilter!== "all") params.set("role", roleFilter);
 if (planFilter!== "all") params.set("plan", planFilter);
 if (statusFilter!== "all") params.set("status", statusFilter);
 params.set("take", "200");
 const res = await apiFetch(`/api/platform/users?${params}`, token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setUsers(data.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت کاربران",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, search, roleFilter, planFilter, statusFilter, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const act = async (userId: string, action: string, days?: number, plan?: string) => {
 setActingId(userId);
 try {
 const res = await apiFetch("/api/platform/users", token, {
 method: "PATCH",
 body: JSON.stringify(
 days
? { userId, action, days }
: plan
? { userId, action, plan }
: { userId, action }
 ),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 if (action === "reset-password" && data.newPassword) {
 setResetResult(data.newPassword);
 } else if (action === "impersonate" && data.token) {
 onQuickLogin(data.token, data.tenant?.name || "سازمان");
 toast({ title: "ورود فوری", description: `به‌عنوان ${data.user?.name || data.user?.username} وارد شدید.` });
 return;
 } else {
 toast({ title: "عملیات موفق", description: data.message || "انجام شد" });
 }
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در عملیات",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 const runBulk = async () => {
 if (selected.size === 0) {
 toast({ title: "هیچ کاربری انتخاب نشده", variant: "destructive" });
 return;
 }
 setBulkRunning(true);
 try {
 const res = await apiFetch("/api/platform/users", token, {
 method: "POST",
 body: JSON.stringify({
 userIds: Array.from(selected),
 action: bulkAction,
 days: bulkAction === "extend-trial"? Number(bulkDays): undefined,
 }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "عملیات گروهی انجام شد",
 description: data.message,
 });
 setSelected(new Set());
 setBulkOpen(false);
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در عملیات گروهی",
 variant: "destructive",
 });
 } finally {
 setBulkRunning(false);
 }
 };

 const toggleSelected = (id: string) => {
 setSelected((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 const toggleSelectAll = () => {
 if (selected.size === users.length) {
 setSelected(new Set());
 } else {
 setSelected(new Set(users.map((u) => u.id)));
 }
 };

 const copyPwd = async (text: string) => {
 try {
 await navigator.clipboard.writeText(text);
 setCopied(true);
 toast({ title: "کپی شد", description: "رمز جدید در کلیپ‌بورد ذخیره شد." });
 setTimeout(() => setCopied(false), 2000);
 } catch {
 toast({ title: "خطا در کپی", variant: "destructive" });
 }
 };

 const stats = {
 total: users.length,
 active: users.filter((u) => u.isActive).length,
 trial: users.filter((u) => u.isTrial).length,
 suspended: users.filter((u) =>!u.isActive).length,
 };

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between gap-2">
 <div>
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <UserCog className="h-4 w-4 text-primary" />
 مدیریت پیشرفته کاربران
 </h2>
 <p className="text-[11px] text-muted-foreground">
 جستجو، فیلتر و عملیات گروهی روی کاربران همه‌ی سازمان‌ها
 </p>
 </div>
 <div className="flex gap-2">
 {selected.size > 0 && (
 <Button size="sm" variant="default" onClick={() => setBulkOpen(true)}>
 <Layers className="h-4 w-4" />
 عملیات گروهی ({toPersianDigits(selected.size)})
 </Button>
 )}
 <Button variant="outline" size="sm" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 به‌روزرسانی
 </Button>
 </div>
 </div>

 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <StatCard icon={UsersIcon} label="کل کاربران" value={toPersianDigits(stats.total)} accent="primary" />
 <StatCard icon={UserCheck} label="فعال" value={toPersianDigits(stats.active)} accent="success" />
 <StatCard icon={CalendarClock} label="تریال" value={toPersianDigits(stats.trial)} accent="warning" />
 <StatCard icon={Ban} label="مسدود" value={toPersianDigits(stats.suspended)} accent="chart5" />
 </div>

 {/* فیلترها */}
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی نام، ایمیل یا یوزرنیم..."
 className="ps-9 h-9"
 />
 </div>
 <Select value={roleFilter} onValueChange={setRoleFilter}>
 <SelectTrigger className="h-9 w-full sm:w-[140px] text-xs">
 <SelectValue placeholder="نقش" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه نقش‌ها</SelectItem>
 <SelectItem value="ADMIN">مدیر سیستم</SelectItem>
 <SelectItem value="MANAGER">مدیر</SelectItem>
 <SelectItem value="ACCOUNTANT">حسابدار</SelectItem>
 <SelectItem value="USER">کاربر</SelectItem>
 </SelectContent>
 </Select>
 <Select value={planFilter} onValueChange={setPlanFilter}>
 <SelectTrigger className="h-9 w-full sm:w-[140px] text-xs">
 <SelectValue placeholder="پلن" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه پلن‌ها</SelectItem>
 <SelectItem value="free">رایگان</SelectItem>
 <SelectItem value="basic">پایه</SelectItem>
 <SelectItem value="pro">حرفه‌ای</SelectItem>
 <SelectItem value="enterprise">سازمانی</SelectItem>
 </SelectContent>
 </Select>
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="h-9 w-full sm:w-[140px] text-xs">
 <SelectValue placeholder="وضعیت" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه</SelectItem>
 <SelectItem value="active">فعال</SelectItem>
 <SelectItem value="suspended">مسدود</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </CardContent>
 </Card>

 {/* جدول کاربران */}
 <Card>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="w-8 text-center">
 <Checkbox
 checked={selected.size > 0 && selected.size === users.length}
 onCheckedChange={toggleSelectAll}
 />
 </TableHead>
 <TableHead className="text-start text-[11px]">نام</TableHead>
 <TableHead className="text-start text-[11px]">یوزرنیم</TableHead>
 <TableHead className="text-start text-[11px]">ایمیل</TableHead>
 <TableHead className="text-start text-[11px]">نقش</TableHead>
 <TableHead className="text-start text-[11px]">سازمان</TableHead>
 <TableHead className="text-start text-[11px]">پلن</TableHead>
 <TableHead className="text-start text-[11px]">وضعیت</TableHead>
 <TableHead className="text-start text-[11px]">تریال</TableHead>
 <TableHead className="text-start text-[11px]">آخرین ورود</TableHead>
 <TableHead className="text-start text-[11px]">IP</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {users.length === 0? (
 <TableRow>
 <TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-8">
 {loading? "در حال بارگذاری...": "کاربری یافت نشد"}
 </TableCell>
 </TableRow>
 ): (
 users.map((u) => (
 <TableRow key={u.id} className={selected.has(u.id)? "bg-primary/5": undefined}>
 <TableCell className="text-center">
 <Checkbox
 checked={selected.has(u.id)}
 onCheckedChange={() => toggleSelected(u.id)}
 />
 </TableCell>
 <TableCell>
 <div className="flex items-center gap-2">
 <Avatar className="h-7 w-7">
 <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
 {u.name?.slice(0, 2) || "؟"}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-medium truncate max-w-[100px]">{u.name || "—"}</span>
 </div>
 </TableCell>
 <TableCell className="text-xs font-mono" dir="ltr">{u.username || "—"}</TableCell>
 <TableCell className="text-[10px] text-muted-foreground truncate max-w-[120px]" dir="ltr">{u.email}</TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${roleBadge(u.role)}`}>
 {ROLE_LABELS_FA[u.role] || u.role}
 </Badge>
 </TableCell>
 <TableCell className="text-xs truncate max-w-[100px]">
 {u.tenant?.name || "—"}
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${planBadge(u.tenant?.plan || "")}`}>
 {PLAN_LABELS[u.tenant?.plan || ""] || u.tenant?.plan || "—"}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${u.isActive? "bg-success/10 text-success": "bg-destructive/10 text-destructive"}`}>
 {u.isActive? "فعال": "مسدود"}
 </Badge>
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground">
 {u.isTrial && u.trialEndsAt? (
 <span className="flex items-center gap-1">
 <CalendarClock className="h-3 w-3" />
 {toJalali(new Date(u.trialEndsAt))}
 </span>
 ): u.isTrial? (
 <span className="text-warning">تریال فعال</span>
 ): (
 "—"
 )}
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground whitespace-nowrap">
 {u.lastLogin? toJalali(new Date(u.lastLogin)): "—"}
 </TableCell>
 <TableCell className="text-[10px] text-muted-foreground font-mono" dir="ltr">
 {u.lastLoginIp || "—"}
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-end">
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={actingId === u.id}>
 {actingId === u.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <MoreVertical className="h-3.5 w-3.5" />
 )}
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-48">
 <DropdownMenuLabel className="text-[10px] text-muted-foreground">
 عملیات کاربر
 </DropdownMenuLabel>
 <DropdownMenuSeparator />
 {u.isActive? (
 <DropdownMenuItem
 className="text-xs text-warning"
 onClick={() => act(u.id, "suspend")}
 >
 <Ban className="h-3.5 w-3.5" />
 تعلیق
 </DropdownMenuItem>
 ): (
 <DropdownMenuItem
 className="text-xs text-success"
 onClick={() => act(u.id, "activate")}
 >
 <Unlock className="h-3.5 w-3.5" />
 فعال‌سازی
 </DropdownMenuItem>
 )}
 <DropdownMenuItem
 className="text-xs"
 onClick={() => act(u.id, "reset-password")}
 >
 <Key className="h-3.5 w-3.5" />
 بازنشانی رمز
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs text-primary"
 onClick={() => {
 setPlanTarget(u);
 setNewPlan(u.tenant?.plan || "basic");
 }}
 >
 <CreditCard className="h-3.5 w-3.5" />
 تغییر پلن
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs text-primary"
 onClick={() => act(u.id, "extend-trial", 14)}
 >
 <CalendarClock className="h-3.5 w-3.5" />
 تمدید تریال (۱۴ روز)
 </DropdownMenuItem>
 <DropdownMenuItem
 className="text-xs text-warning"
 onClick={() => act(u.id, "impersonate")}
 >
 <Zap className="h-3.5 w-3.5" />
 ورود به‌عنوان کاربر
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* مدال تغییر پلن */}
 <Dialog open={!!planTarget} onOpenChange={(o) =>!o && setPlanTarget(null)}>
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle className="text-base flex items-center gap-2">
 <CreditCard className="h-4 w-4 text-primary" />
 تغییر پلن
 </DialogTitle>
 <DialogDescription className="text-xs">
 پلن جدید را برای «{planTarget?.name}» (سازمان: {planTarget?.tenant?.name}) انتخاب کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2">
 <Label className="text-xs">پلن جدید</Label>
 <Select value={newPlan} onValueChange={setNewPlan}>
 <SelectTrigger className="h-9 w-full text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="free">رایگان</SelectItem>
 <SelectItem value="basic">پایه</SelectItem>
 <SelectItem value="pro">حرفه‌ای</SelectItem>
 <SelectItem value="enterprise">سازمانی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setPlanTarget(null)}>
 لغو
 </Button>
 <Button
 size="sm"
 disabled={changingPlan}
 onClick={async () => {
 if (!planTarget) return;
 setChangingPlan(true);
 await act(planTarget.id, "change-plan", undefined, newPlan);
 setChangingPlan(false);
 setPlanTarget(null);
 }}
 >
 {changingPlan? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Save className="h-3.5 w-3.5" />}
 اعمال پلن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* مدال عملیات گروهی */}
 <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle className="text-base flex items-center gap-2">
 <Layers className="h-4 w-4 text-primary" />
 عملیات گروهی
 </DialogTitle>
 <DialogDescription className="text-xs">
 روی {toPersianDigits(selected.size)} کاربر انتخاب‌شده اعمال می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2">
 <Label className="text-xs">نوع عملیات</Label>
 <Select value={bulkAction} onValueChange={(v) => setBulkAction(v as typeof bulkAction)}>
 <SelectTrigger className="h-9 w-full text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="block">تعلیق همه</SelectItem>
 <SelectItem value="activate">فعال‌سازی همه</SelectItem>
 <SelectItem value="extend-trial">تمدید تریال</SelectItem>
 <SelectItem value="delete">حذف (soft delete)</SelectItem>
 </SelectContent>
 </Select>
 {bulkAction === "extend-trial" && (
 <div className="space-y-1.5">
 <Label className="text-xs">تعداد روز تمدید</Label>
 <Input
 type="number"
 value={bulkDays}
 onChange={(e) => setBulkDays(e.target.value)}
 className="h-9"
 dir="ltr"
 />
 <div className="flex gap-1.5">
 {[7, 14, 30, 60].map((d) => (
 <Button
 key={d}
 variant="outline"
 size="sm"
 className="h-7 text-[11px] flex-1"
 onClick={() => setBulkDays(String(d))}
 >
 {toPersianDigits(d)} روز
 </Button>
 ))}
 </div>
 </div>
 )}
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" size="sm" onClick={() => setBulkOpen(false)}>
 لغو
 </Button>
 <Button
 size="sm"
 variant={bulkAction === "delete"? "destructive": "default"}
 disabled={bulkRunning}
 onClick={runBulk}
 >
 {bulkRunning? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Check className="h-3.5 w-3.5" />}
 اجرای عملیات
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* مدال نمایش رمز جدید */}
 <Dialog open={!!resetResult} onOpenChange={(o) =>!o && setResetResult(null)}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base text-success">
 <Check className="h-4 w-4" />
 رمز عبور بازنشانی شد
 </DialogTitle>
 <DialogDescription className="text-xs">
 رمز جدید را در اختیار کاربر قرار دهید.
 </DialogDescription>
 </DialogHeader>
 <div className="rounded-xl border border-success/30 bg-success/5 p-4">
 <div className="flex items-center gap-2">
 <code className="flex-1 rounded-lg bg-background border border-border px-3 py-2.5 text-sm font-mono text-foreground" dir="ltr">
 {resetResult}
 </code>
 <Button size="sm" variant="default" onClick={() => copyPwd(resetResult || "")}>
 {copied? <Check className="h-4 w-4" />: <Copy className="h-4 w-4" />}
 کپی
 </Button>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" size="sm" className="w-full" onClick={() => setResetResult(null)}>
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ============ تب تنظیمات پلتفرم ============

interface PlatformSettingsData {
 maintenance: { enabled: boolean; message: string };
 registration: { open: boolean };
 trial: { defaultDays: number; defaultPlan: string };
 featureFlags: Record<string, boolean>;
 email: {
 from: string;
 fromName: string;
 provider: string;
 smtpHost: string;
 smtpPort: string;
 smtpUser: string;
 };
}

const PLATFORM_MODULE_LABELS: Record<string, string> = {
 core: "هسته حسابداری",
 invoices: "فاکتورها",
 inventory: "انبار و کالا",
 treasury: "خزانه‌داری",
 payroll: "حقوق و دستمزد",
 tax: "مالیات",
 modian: "سامانه مودیان",
 ecommerce: "تجارت الکترونیک",
 crm: "CRM",
 ai: "هوش مصنوعی",
 mobile: "اپ موبایل",
 multi_currency: "چندارزی",
 loyalty: "باشگاه مشتریان",
 reports_builder: "سازنده گزارش",
 smart_dashboard: "داشبورد هوشمند",
};

function PlatformSettingsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(true);
 const [savingSection, setSavingSection] = React.useState<string | null>(null);
 const [settings, setSettings] = React.useState<PlatformSettingsData | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/settings/platform", token);
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setSettings(data.data);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت تنظیمات",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const saveSection = async (section: string, body: Record<string, unknown>) => {
 setSavingSection(section);
 try {
 const res = await apiFetch("/api/platform/settings/platform", token, {
 method: "PATCH",
 body: JSON.stringify(body),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "ذخیره شد", description: data.message });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 variant: "destructive",
 });
 } finally {
 setSavingSection(null);
 }
 };

 if (loading ||!settings) {
 return (
 <div className="flex items-center justify-center py-20 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin me-2" />
 در حال بارگذاری تنظیمات پلتفرم...
 </div>
 );
 }

 return (
 <div className="space-y-5">
 <div className="flex items-center justify-between gap-2">
 <div>
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <Cog className="h-4 w-4 text-primary" />
 تنظیمات پلتفرم
 </h2>
 <p className="text-[11px] text-muted-foreground">
 پیکربندی حالت نگه‌داری، ثبت‌نام، تریال، فلگ‌های ماژول و ایمیل
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={load} disabled={loading}>
 <RefreshCw className="h-4 w-4" />
 به‌روزرسانی
 </Button>
 </div>

 {/* حالت نگه‌داری (Maintenance Mode) */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Wrench className="h-4 w-4 text-warning" />
 حالت نگه‌داری (Maintenance Mode)
 </CardTitle>
 <CardDescription className="text-xs">
 فعال‌سازی این حالت، دسترسی کاربران به سامانه را موقتاً قطع می‌کند.
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between rounded-md border p-3">
 <div>
 <p className="text-sm">حالت نگه‌داری</p>
 <p className="text-[11px] text-muted-foreground">
 {settings.maintenance.enabled? "[فعال] سامانه برای کاربران غیرفعال است": "[غیرفعال] سامانه در حالت عادی"}
 </p>
 </div>
 <Switch
 checked={settings.maintenance.enabled}
 onCheckedChange={(v) => setSettings({
...settings,
 maintenance: {...settings.maintenance, enabled: v },
 })}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="maintenance-msg" className="text-xs">پیام نمایش‌داده‌شده به کاربران</Label>
 <Textarea
 id="maintenance-msg"
 value={settings.maintenance.message}
 onChange={(e) => setSettings({
...settings,
 maintenance: {...settings.maintenance, message: e.target.value },
 })}
 rows={2}
 className="text-xs resize-none"
 />
 </div>
 <Button
 size="sm"
 onClick={() => saveSection("maintenance", { maintenance: settings.maintenance })}
 disabled={savingSection === "maintenance"}
 >
 {savingSection === "maintenance"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره حالت نگه‌داری
 </Button>
 </CardContent>
 </Card>

 {/* ثبت‌نام */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <UserCheck className="h-4 w-4 text-primary" />
 ثبت‌نام کاربران جدید
 </CardTitle>
 <CardDescription className="text-xs">
 باز یا بسته بودن ثبت‌نام در سامانه
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between rounded-md border p-3">
 <div>
 <p className="text-sm">ثبت‌نام باز است</p>
 <p className="text-[11px] text-muted-foreground">
 {settings.registration.open? "[باز] کاربران جدید می‌توانند ثبت‌نام کنند": "[بسته] ثبت‌نام بسته است"}
 </p>
 </div>
 <Switch
 checked={settings.registration.open}
 onCheckedChange={(v) => setSettings({
...settings,
 registration: { open: v },
 })}
 />
 </div>
 <Button
 size="sm"
 onClick={() => saveSection("registration", { registration: settings.registration })}
 disabled={savingSection === "registration"}
 >
 {savingSection === "registration"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره
 </Button>
 </CardContent>
 </Card>

 {/* تنظیمات تریال */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <CalendarClock className="h-4 w-4 text-primary" />
 تنظیمات دوره آزمایشی (Trial)
 </CardTitle>
 <CardDescription className="text-xs">
 پیکربندی پیش‌فرض دوره تریال برای کاربران جدید
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label htmlFor="trial-days" className="text-xs">تعداد روزهای تریال پیش‌فرض</Label>
 <Input
 id="trial-days"
 type="number"
 min={1}
 max={365}
 value={settings.trial.defaultDays}
 onChange={(e) => setSettings({
...settings,
 trial: {...settings.trial, defaultDays: parseInt(e.target.value, 10) || 14 },
 })}
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="default-plan" className="text-xs">پلن پیش‌فرض تریال</Label>
 <Select
 value={settings.trial.defaultPlan}
 onValueChange={(v) => setSettings({
...settings,
 trial: {...settings.trial, defaultPlan: v },
 })}
 >
 <SelectTrigger id="default-plan" className="h-9 w-full text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="free">رایگان</SelectItem>
 <SelectItem value="basic">پایه</SelectItem>
 <SelectItem value="pro">حرفه‌ای</SelectItem>
 <SelectItem value="enterprise">سازمانی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <Button
 size="sm"
 onClick={() => saveSection("trial", { trial: settings.trial })}
 disabled={savingSection === "trial"}
 >
 {savingSection === "trial"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره تنظیمات تریال
 </Button>
 </CardContent>
 </Card>

 {/* فلگ‌های ماژول (Feature Flags) */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Flag className="h-4 w-4 text-primary" />
 ماژول‌های فعال پلتفرم
 </CardTitle>
 <CardDescription className="text-xs">
 فعال/غیرفعال کردن ماژول‌ها در سطح کل پلتفرم (تأثیر روی همه‌ی tenantها)
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
 {Object.entries(settings.featureFlags).map(([key, enabled]) => {
 const label = PLATFORM_MODULE_LABELS[key] || key;
 return (
 <div key={key} className="flex items-center justify-between rounded-md border p-2.5">
 <div className="min-w-0">
 <p className="text-xs font-medium truncate">{label}</p>
 <p className="text-[10px] text-muted-foreground font-mono truncate" dir="ltr">{key}</p>
 </div>
 <Switch
 checked={enabled}
 onCheckedChange={(v) => setSettings({
...settings,
 featureFlags: {...settings.featureFlags, [key]: v },
 })}
 />
 </div>
 );
 })}
 </div>
 <Button
 size="sm"
 onClick={() => saveSection("featureFlags", { featureFlags: settings.featureFlags })}
 disabled={savingSection === "featureFlags"}
 >
 {savingSection === "featureFlags"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره فلگ‌های ماژول
 </Button>
 </CardContent>
 </Card>

 {/* تنظیمات ایمیل */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <MailCheck className="h-4 w-4 text-primary" />
 تنظیمات ایمیل
 </CardTitle>
 <CardDescription className="text-xs">
 پیکربندی فرستنده و روش ارسال ایمیل (formsubmit.co / SMTP)
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label htmlFor="email-from" className="text-xs">آدرس ایمیل فرستنده</Label>
 <Input
 id="email-from"
 value={settings.email.from}
 onChange={(e) => setSettings({
...settings,
 email: {...settings.email, from: e.target.value },
 })}
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="email-from-name" className="text-xs">نام فرستنده</Label>
 <Input
 id="email-from-name"
 value={settings.email.fromName}
 onChange={(e) => setSettings({
...settings,
 email: {...settings.email, fromName: e.target.value },
 })}
 className="h-9"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="email-provider" className="text-xs">روش ارسال</Label>
 <Select
 value={settings.email.provider}
 onValueChange={(v) => setSettings({
...settings,
 email: {...settings.email, provider: v },
 })}
 >
 <SelectTrigger id="email-provider" className="h-9 w-full text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="formsubmit">formsubmit.co (رایگان)</SelectItem>
 <SelectItem value="smtp">SMTP اختصاصی</SelectItem>
 <SelectItem value="none">غیرفعال</SelectItem>
 </SelectContent>
 </Select>
 </div>
 {settings.email.provider === "smtp" && (
 <>
 <div className="space-y-1.5">
 <Label htmlFor="smtp-host" className="text-xs">SMTP Host</Label>
 <Input
 id="smtp-host"
 value={settings.email.smtpHost}
 onChange={(e) => setSettings({
...settings,
 email: {...settings.email, smtpHost: e.target.value },
 })}
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="smtp-port" className="text-xs">SMTP Port</Label>
 <Input
 id="smtp-port"
 value={settings.email.smtpPort}
 onChange={(e) => setSettings({
...settings,
 email: {...settings.email, smtpPort: e.target.value },
 })}
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="smtp-user" className="text-xs">SMTP Username</Label>
 <Input
 id="smtp-user"
 value={settings.email.smtpUser}
 onChange={(e) => setSettings({
...settings,
 email: {...settings.email, smtpUser: e.target.value },
 })}
 className="h-9"
 dir="ltr"
 />
 </div>
 </>
 )}
 </div>
 <Button
 size="sm"
 onClick={() => saveSection("email", { email: settings.email })}
 disabled={savingSection === "email"}
 >
 {savingSection === "email"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره تنظیمات ایمیل
 </Button>
 </CardContent>
 </Card>
 </div>
 );
}

// ============ تب گزارش‌ها و تحلیل‌ها ============

interface ReportsData {
 revenue: { mrr: number; arr: number; total: number; growth: number; lastMonthMrr: number };
 users: {
 total: number;
 active: number;
 active7d: number;
 active30d: number;
 trial: number;
 newThisMonth: number;
 churn: number;
 churnedThisMonth: number;
 };
 tenants: { total: number; active: number };
 invoices: { thisMonth: number; lastMonth: number };
 errors: { today: number; thisWeek: number };
 userGrowth: { month: string; newUsers: number }[];
 usageHeatmap: { module: string; label: string; count: number; intensity: number }[];
 topTenants: {
 id: string;
 name: string;
 plan: string;
 status: string;
 monthlyRevenue: number;
 totalRevenue: number;
 users: number;
 invoices: number;
 products: number;
 }[];
 planDistribution: { plan: string; count: number; revenue: number }[];
 auditLogsTotal: number;
 licensesTotal: number;
 activeLicensesCount: number;
}

const MONTH_LABELS_FA = [
 "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
 "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function formatMonthShort(key: string): string {
 const [, m] = key.split("-").map(Number);
 if (!m) return key;
 return MONTH_LABELS_FA[m - 1] || key;
}

function ReportsAnalyticsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [data, setData] = React.useState<ReportsData | null>(null);
 const [loading, setLoading] = React.useState(true);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/reports", token);
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 setData(json.data);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت گزارش‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 if (loading) {
 return (
 <div className="flex items-center justify-center py-20 text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin me-2" />
 در حال بارگذاری گزارش‌ها...
 </div>
 );
 }

 if (!data) {
 return (
 <div className="flex flex-col items-center justify-center py-20 gap-3">
 <AlertTriangle className="h-8 w-8 text-warning" />
 <p className="text-sm text-muted-foreground">داده‌ای یافت نشد</p>
 <Button variant="outline" size="sm" onClick={load}>
 <RefreshCw className="h-4 w-4" />
 تلاش مجدد
 </Button>
 </div>
 );
 }

 const growthPositive = data.revenue.growth >= 0;
 const churnHigh = data.users.churn > 5;
 const heatmapMax = Math.max(1,...data.usageHeatmap.map((h) => h.count));

 // داده‌های چارت رشد کاربران
 const userGrowthChartData = data.userGrowth.map((g) => ({
 month: formatMonthShort(g.month),
 newUsers: g.newUsers,
 }));

 // داده‌های چارت توزیع پلن (Pie)
 const planColors: Record<string, string> = {
 free: "#94a3b8",
 starter: "#94a3b8",
 basic: "#10b981",
 business: "#8b5cf6",
 pro: "#8b5cf6",
 accountant: "#f59e0b",
 enterprise: "#f59e0b",
 };
 const planChartData = data.planDistribution.map((p) => ({
 name: PLAN_LABELS[p.plan] || p.plan,
 value: p.count,
 color: planColors[p.plan] || "#94a3b8",
 }));

 return (
 <div className="space-y-5">
 <div className="flex items-center justify-between gap-2">
 <div>
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <PieChart className="h-4 w-4 text-primary" />
 گزارش‌ها و تحلیل‌های پلتفرم
 </h2>
 <p className="text-[11px] text-muted-foreground">
 درآمد، رشد کاربران، نرخ ریزش، نقشه حرارتی ماژول‌ها و برترین tenantها
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={load} disabled={loading}>
 <RefreshCw className="h-4 w-4" />
 به‌روزرسانی
 </Button>
 </div>

 {/* کارت‌های درآمد */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <StatCard
 icon={DollarSign}
 label="MRR (درآمد ماهانه)"
 value={formatCompactToman(data.revenue.mrr)}
 sub="ماه جاری"
 accent="primary"
 />
 <StatCard
 icon={TrendingUp}
 label="ARR (درآمد سالانه)"
 value={formatCompactToman(data.revenue.arr)}
 sub="پیش‌بینی ۱۲ ماه"
 accent="success"
 />
 <StatCard
 icon={growthPositive? TrendingUp: AlertCircle}
 label="رشد ماهانه"
 value={`${toPersianDigits(Math.abs(data.revenue.growth))}٪`}
 sub={growthPositive? "نسبت به ماه قبل": "کاهش نسبت به ماه قبل"}
 accent={growthPositive? "success": "warning"}
 />
 <StatCard
 icon={ArrowDownCircle}
 label="نرخ ریزش (Churn)"
 value={`${toPersianDigits(data.users.churn)}٪`}
 sub={`${toPersianDigits(data.users.churnedThisMonth)} لغو این ماه`}
 accent={churnHigh? "warning": "primary"}
 />
 </div>

 {/* کارت‌های کاربران */}
 <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
 <StatCard icon={UsersIcon} label="کل کاربران" value={toPersianDigits(data.users.total)} accent="primary" />
 <StatCard icon={UserCheck} label="فعال (۳۰ روز)" value={toPersianDigits(data.users.active30d)} accent="success" />
 <StatCard icon={Activity} label="فعال (۷ روز)" value={toPersianDigits(data.users.active7d)} accent="success" />
 <StatCard icon={CalendarClock} label="کاربران تریال" value={toPersianDigits(data.users.trial)} accent="warning" />
 <StatCard icon={Plus} label="جدید این ماه" value={toPersianDigits(data.users.newThisMonth)} accent="chart5" />
 </div>

 {/* چارت رشد کاربران */}
 <Card>
 <CardHeader>
 <CardTitle className="text-base">رشد کاربران (۱۲ ماه اخیر)</CardTitle>
 <CardDescription className="text-xs">تعداد کاربران جدید در هر ماه</CardDescription>
 </CardHeader>
 <CardContent>
 <ResponsiveContainer width="100%" height={240}>
 <AreaChart data={userGrowthChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
 <defs>
 <linearGradient id="userGrowthGradient" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
 <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: "inherit" }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip
 contentStyle={{ fontSize: 12, borderRadius: 8 }}
 formatter={(v: number) => [toPersianDigits(v) + " کاربر", "کاربران جدید"]}
 />
 <Area
 type="monotone"
 dataKey="newUsers"
 stroke="#8b5cf6"
 strokeWidth={2}
 fill="url(#userGrowthGradient)"
 />
 </AreaChart>
 </ResponsiveContainer>
 </CardContent>
 </Card>

 {/* نقشه حرارتی استفاده از ماژول‌ها */}
 <Card>
 <CardHeader>
 <CardTitle className="text-base">نقشه حرارتی استفاده از ماژول‌ها (۳۰ روز اخیر)</CardTitle>
 <CardDescription className="text-xs">
 شدت فعالیت کاربران در هر ماژول بر اساس AuditLog
 </CardDescription>
 </CardHeader>
 <CardContent>
 {data.usageHeatmap.length === 0? (
 <p className="text-xs text-muted-foreground text-center py-6">داده‌ای موجود نیست</p>
 ): (
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
 {data.usageHeatmap.map((h) => {
 const ratio = h.count / heatmapMax;
 const bg = ratio > 0.75
? "bg-primary/80 text-primary-foreground"
: ratio > 0.5
? "bg-primary/60 text-primary-foreground"
: ratio > 0.25
? "bg-primary/40 text-primary"
: ratio > 0.1
? "bg-primary/20 text-primary"
: "bg-muted text-muted-foreground";
 return (
 <div
 key={h.module}
 className={`rounded-lg p-3 border transition-all ${bg}`}
 title={`${h.label}: ${toPersianDigits(h.count)} رویداد`}
 >
 <p className="text-xs font-semibold truncate">{h.label}</p>
 <p className="text-base font-bold tnum mt-1">{toPersianDigits(h.count)}</p>
 <p className="text-[10px] opacity-75">رویداد</p>
 </div>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {/* توزیع پلن‌ها */}
 <Card>
 <CardHeader>
 <CardTitle className="text-base">توزیع پلن‌ها</CardTitle>
 <CardDescription className="text-xs">تعداد tenantها بر اساس پلن</CardDescription>
 </CardHeader>
 <CardContent>
 {planChartData.length === 0? (
 <p className="text-xs text-muted-foreground text-center py-6">داده‌ای موجود نیست</p>
 ): (
 <ResponsiveContainer width="100%" height={260}>
 <RPieChart>
 <Pie
 data={planChartData}
 dataKey="value"
 nameKey="name"
 cx="50%"
 cy="50%"
 outerRadius={80}
 label={(entry) => `${entry.name}: ${toPersianDigits(entry.value)}`}
 >
 {planChartData.map((entry, i) => (
 <Cell key={i} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip
 contentStyle={{ fontSize: 12, borderRadius: 8 }}
 formatter={(v: number) => toPersianDigits(v) + " سازمان"}
 />
 </RPieChart>
 </ResponsiveContainer>
 )}
 </CardContent>
 </Card>

 {/* برترین tenantها */}
 <Card>
 <CardHeader>
 <CardTitle className="text-base">برترین tenantها بر اساس درآمد</CardTitle>
 <CardDescription className="text-xs">سودآورترین سازمان‌ها</CardDescription>
 </CardHeader>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px]">سازمان</TableHead>
 <TableHead className="text-start text-[11px]">پلن</TableHead>
 <TableHead className="text-end text-[11px]">درآمد ماهانه</TableHead>
 <TableHead className="text-end text-[11px]">کاربران</TableHead>
 <TableHead className="text-end text-[11px]">فاکتورها</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {data.topTenants.length === 0? (
 <TableRow>
 <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
 داده‌ای موجود نیست
 </TableCell>
 </TableRow>
 ): (
 data.topTenants.map((t, idx) => (
 <TableRow key={t.id}>
 <TableCell>
 <div className="flex items-center gap-2">
 <span className="text-[10px] text-muted-foreground tnum">{toPersianDigits(idx + 1)}.</span>
 <span className="text-xs font-medium truncate max-w-[120px]">{t.name}</span>
 </div>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${planBadge(t.plan)}`}>
 {PLAN_LABELS[t.plan] || t.plan}
 </Badge>
 </TableCell>
 <TableCell className="text-end text-xs tnum font-semibold">
 {formatCompactToman(t.monthlyRevenue)}
 </TableCell>
 <TableCell className="text-end text-xs tnum">{toPersianDigits(t.users)}</TableCell>
 <TableCell className="text-end text-xs tnum">{toPersianDigits(t.invoices)}</TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* کارت‌های تکمیلی */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <StatCard icon={Building2} label="کل سازمان‌ها" value={toPersianDigits(data.tenants.total)} sub={`${toPersianDigits(data.tenants.active)} فعال`} accent="primary" />
 <StatCard icon={FileText} label="فاکتور این ماه" value={toPersianDigits(data.invoices.thisMonth)} sub={`${toPersianDigits(data.invoices.lastMonth)} ماه قبل`} accent="success" />
 <StatCard icon={KeyRound} label="لایسنس فعال" value={toPersianDigits(data.activeLicensesCount)} sub={`از ${toPersianDigits(data.licensesTotal)} کل`} accent="warning" />
 <StatCard icon={AlertCircle} label="خطاهای امروز" value={toPersianDigits(data.errors.today)} sub={`${toPersianDigits(data.errors.thisWeek)} این هفته`} accent="chart5" />
 </div>
 </div>
 );
}

// (آیکون ArrowDownCircle به‌صورت local برای جلوگیری از import اضافی)
function ArrowDownCircle({ className }: { className?: string }) {
 return (
 <svg
 className={className}
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 >
 <circle cx="12" cy="12" r="10" />
 <polyline points="8 12 12 16 16 12" />
 <line x1="12" y1="8" x2="12" y2="16" />
 </svg>
 );
}

// ============ تب مدیریت محتوا و سئو ============

interface ContentSEOData {
 seo: {
 metaTitle: string;
 metaDescription: string;
 metaKeywords: string;
 gaId: string;
 searchConsole: string;
 ogTitle: string;
 ogDescription: string;
 ogImage: string;
 twitterCard: string;
 robotsTxt: string;
 sitemapEnabled: boolean;
 social: {
 twitter: string;
 linkedin: string;
 instagram: string;
 telegram: string;
 };
 };
 blog: {
 total: number;
 published: number;
 draft: number;
 recent: {
 id: string;
 title: string;
 slug: string;
 status: string;
 category: string;
 publishedAt: string | null;
 createdAt: string;
 updatedAt: string;
 hasCustomMeta: boolean;
 }[];
 };
}

const BLOG_CATEGORY_LABELS: Record<string, string> = {
 ACCOUNTING: "حسابداری",
 TAX: "مالیاتی",
 PAYROLL: "حقوق و دستمزد",
 TUTORIAL: "آموزشی",
 NEWS: "اخبار",
 MODIAN: "مودیان",
};

function ContentSEOTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(true);
 const [savingSection, setSavingSection] = React.useState<string | null>(null);
 const [data, setData] = React.useState<ContentSEOData | null>(null);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/content-seo", token);
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 setData(json.data);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت داده‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const saveSeo = async (section: string, body: Record<string, unknown>) => {
 setSavingSection(section);
 try {
 const res = await apiFetch("/api/platform/content-seo", token, {
 method: "PATCH",
 body: JSON.stringify(body),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 toast({ title: "ذخیره شد", description: json.message });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 variant: "destructive",
 });
 } finally {
 setSavingSection(null);
 }
 };

 if (loading ||!data) {
 return (
 <div className="flex items-center justify-center py-20 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin me-2" />
 در حال بارگذاری...
 </div>
 );
 }

 const { seo, blog } = data;

 return (
 <div className="space-y-5">
 <div className="flex items-center justify-between gap-2">
 <div>
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <Globe className="h-4 w-4 text-primary" />
 مدیریت محتوا و سئو
 </h2>
 <p className="text-[11px] text-muted-foreground">
 تنظیمات متا، OG، robots.txt، sitemap، شبکه‌های اجتماعی و وضعیت بلاگ
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={load} disabled={loading}>
 <RefreshCw className="h-4 w-4" />
 به‌روزرسانی
 </Button>
 </div>

 {/* کارت‌های وضعیت بلاگ */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <StatCard icon={FileText} label="کل پست‌ها" value={toPersianDigits(blog.total)} accent="primary" />
 <StatCard icon={CheckCircle2} label="منتشرشده" value={toPersianDigits(blog.published)} accent="success" />
 <StatCard icon={PenSquare} label="پیش‌نویس" value={toPersianDigits(blog.draft)} accent="warning" />
 <StatCard icon={Hash} label="با متا سفارشی" value={toPersianDigits(blog.recent.filter((p) => p.hasCustomMeta).length)} accent="chart5" />
 </div>

 {/* پست‌های اخیر بلاگ */}
 <Card>
 <CardHeader>
 <CardTitle className="text-base">پست‌های اخیر بلاگ</CardTitle>
 <CardDescription className="text-xs">آخرین ۱۰ پست به‌روزرسانی‌شده</CardDescription>
 </CardHeader>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px]">عنوان</TableHead>
 <TableHead className="text-start text-[11px]">دسته</TableHead>
 <TableHead className="text-start text-[11px]">وضعیت</TableHead>
 <TableHead className="text-start text-[11px]">متا سفارشی</TableHead>
 <TableHead className="text-start text-[11px]">به‌روزرسانی</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {blog.recent.length === 0? (
 <TableRow>
 <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
 پستی موجود نیست
 </TableCell>
 </TableRow>
 ): (
 blog.recent.map((p) => (
 <TableRow key={p.id}>
 <TableCell>
 <p className="text-xs font-medium line-clamp-1 max-w-[250px]">{p.title}</p>
 <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[250px]" dir="ltr">
 /blog/{p.slug}
 </p>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
 {BLOG_CATEGORY_LABELS[p.category] || p.category}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${
 p.status === "PUBLISHED"? "bg-success/10 text-success"
: p.status === "DRAFT"? "bg-warning/10 text-warning"
: "bg-muted text-muted-foreground"
 }`}>
 {p.status === "PUBLISHED"? "منتشرشده": p.status === "DRAFT"? "پیش‌نویس": p.status}
 </Badge>
 </TableCell>
 <TableCell>
 {p.hasCustomMeta? (
 <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">دارد</Badge>
 ): (
 <span className="text-[10px] text-muted-foreground">—</span>
 )}
 </TableCell>
 <TableCell className="text-[10px] tnum text-muted-foreground whitespace-nowrap">
 {toJalali(new Date(p.updatedAt))}
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* تنظیمات متا — SEO اصلی */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Search className="h-4 w-4 text-primary" />
 متا تگ‌های اصلی
 </CardTitle>
 <CardDescription className="text-xs">عنوان، توضیحات و کلمات کلیدی پیش‌فرض</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-1.5">
 <Label htmlFor="meta-title" className="text-xs">عنوان متا (Meta Title)</Label>
 <Input
 id="meta-title"
 value={seo.metaTitle}
 onChange={(e) => setData({
...data,
 seo: {...seo, metaTitle: e.target.value },
 })}
 className="h-9"
 maxLength={200}
 />
 <p className="text-[10px] text-muted-foreground tnum">{toPersianDigits(seo.metaTitle.length)}/۲۰۰ کاراکتر</p>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="meta-desc" className="text-xs">توضیحات متا (Meta Description)</Label>
 <Textarea
 id="meta-desc"
 value={seo.metaDescription}
 onChange={(e) => setData({
...data,
 seo: {...seo, metaDescription: e.target.value },
 })}
 rows={2}
 className="text-xs resize-none"
 maxLength={500}
 />
 <p className="text-[10px] text-muted-foreground tnum">{toPersianDigits(seo.metaDescription.length)}/۵۰۰ کاراکتر</p>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="meta-keywords" className="text-xs">کلمات کلیدی (Meta Keywords)</Label>
 <Input
 id="meta-keywords"
 value={seo.metaKeywords}
 onChange={(e) => setData({
...data,
 seo: {...seo, metaKeywords: e.target.value },
 })}
 className="h-9"
 placeholder="حسابداری, نرم افزار حسابداری,..."
 />
 </div>
 <Button
 size="sm"
 onClick={() => saveSeo("meta", {
 metaTitle: seo.metaTitle,
 metaDescription: seo.metaDescription,
 metaKeywords: seo.metaKeywords,
 })}
 disabled={savingSection === "meta"}
 >
 {savingSection === "meta"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره متا تگ‌ها
 </Button>
 </CardContent>
 </Card>

 {/* تنظیمات OG و شبکه‌های اجتماعی */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Share2 className="h-4 w-4 text-primary" />
 Open Graph و شبکه‌های اجتماعی
 </CardTitle>
 <CardDescription className="text-xs">تنظیمات پیش‌فرض اشتراک‌گذاری در شبکه‌های اجتماعی</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label htmlFor="og-title" className="text-xs">OG Title</Label>
 <Input
 id="og-title"
 value={seo.ogTitle}
 onChange={(e) => setData({...data, seo: {...seo, ogTitle: e.target.value } })}
 className="h-9"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="og-image" className="text-xs">OG Image URL</Label>
 <Input
 id="og-image"
 value={seo.ogImage}
 onChange={(e) => setData({...data, seo: {...seo, ogImage: e.target.value } })}
 className="h-9"
 dir="ltr"
 placeholder="https://..."
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="og-desc" className="text-xs">OG Description</Label>
 <Textarea
 id="og-desc"
 value={seo.ogDescription}
 onChange={(e) => setData({...data, seo: {...seo, ogDescription: e.target.value } })}
 rows={2}
 className="text-xs resize-none"
 />
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label htmlFor="social-twitter" className="text-xs">توییتر / X</Label>
 <Input
 id="social-twitter"
 value={seo.social.twitter}
 onChange={(e) => setData({...data, seo: {...seo, social: {...seo.social, twitter: e.target.value } } })}
 className="h-9"
 dir="ltr"
 placeholder="@hoshhesab"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="social-linkedin" className="text-xs">لینکدین</Label>
 <Input
 id="social-linkedin"
 value={seo.social.linkedin}
 onChange={(e) => setData({...data, seo: {...seo, social: {...seo.social, linkedin: e.target.value } } })}
 className="h-9"
 dir="ltr"
 placeholder="https://linkedin.com/..."
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="social-instagram" className="text-xs">اینستاگرام</Label>
 <Input
 id="social-instagram"
 value={seo.social.instagram}
 onChange={(e) => setData({...data, seo: {...seo, social: {...seo.social, instagram: e.target.value } } })}
 className="h-9"
 dir="ltr"
 placeholder="@hoshhesab"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="social-telegram" className="text-xs">تلگرام</Label>
 <Input
 id="social-telegram"
 value={seo.social.telegram}
 onChange={(e) => setData({...data, seo: {...seo, social: {...seo.social, telegram: e.target.value } } })}
 className="h-9"
 dir="ltr"
 placeholder="@hoshhesab"
 />
 </div>
 </div>
 <Button
 size="sm"
 onClick={() => saveSeo("og", {
 ogTitle: seo.ogTitle,
 ogDescription: seo.ogDescription,
 ogImage: seo.ogImage,
 social: seo.social,
 })}
 disabled={savingSection === "og"}
 >
 {savingSection === "og"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره OG و شبکه‌های اجتماعی
 </Button>
 </CardContent>
 </Card>

 {/* Google Analytics و Search Console */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <BarChart3 className="h-4 w-4 text-primary" />
 Google Analytics و Search Console
 </CardTitle>
 <CardDescription className="text-xs">کدهای رهگیری و تأیید مالکیت</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label htmlFor="ga-id" className="text-xs">Google Analytics ID</Label>
 <Input
 id="ga-id"
 value={seo.gaId}
 onChange={(e) => setData({...data, seo: {...seo, gaId: e.target.value } })}
 className="h-9 font-mono"
 dir="ltr"
 placeholder="G-XXXXXXXXXX"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="search-console" className="text-xs">Search Console Verification</Label>
 <Input
 id="search-console"
 value={seo.searchConsole}
 onChange={(e) => setData({...data, seo: {...seo, searchConsole: e.target.value } })}
 className="h-9 font-mono"
 dir="ltr"
 placeholder="google-site-verification=..."
 />
 </div>
 </div>
 <Button
 size="sm"
 onClick={() => saveSeo("ga", { gaId: seo.gaId, searchConsole: seo.searchConsole })}
 disabled={savingSection === "ga"}
 >
 {savingSection === "ga"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره GA و Search Console
 </Button>
 </CardContent>
 </Card>

 {/* robots.txt و sitemap */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <FileText className="h-4 w-4 text-primary" />
 robots.txt و Sitemap
 </CardTitle>
 <CardDescription className="text-xs">کنترل دسترسی ربات‌های موتور جستجو</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between rounded-md border p-3">
 <div>
 <p className="text-sm">Sitemap فعال</p>
 <p className="text-[11px] text-muted-foreground">
 {seo.sitemapEnabled? "[فعال] فایل sitemap.xml تولید می‌شود": "[غیرفعال] sitemap غیرفعال است"}
 </p>
 </div>
 <Switch
 checked={seo.sitemapEnabled}
 onCheckedChange={(v) => setData({...data, seo: {...seo, sitemapEnabled: v } })}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="robots-txt" className="text-xs">محتوای robots.txt</Label>
 <Textarea
 id="robots-txt"
 value={seo.robotsTxt}
 onChange={(e) => setData({...data, seo: {...seo, robotsTxt: e.target.value } })}
 rows={8}
 className="text-xs font-mono resize-none"
 dir="ltr"
 />
 </div>
 <Button
 size="sm"
 onClick={() => saveSeo("robots", {
 robotsTxt: seo.robotsTxt,
 sitemapEnabled: seo.sitemapEnabled,
 })}
 disabled={savingSection === "robots"}
 >
 {savingSection === "robots"? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />}
 ذخیره robots.txt و sitemap
 </Button>
 </CardContent>
 </Card>
 </div>
 );
}

// (آیکون محلی Share2 برای جلوگیری از import اضافی)
function Share2({ className }: { className?: string }) {
 return (
 <svg
 className={className}
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 >
 <circle cx="18" cy="5" r="3" />
 <circle cx="6" cy="12" r="3" />
 <circle cx="18" cy="19" r="3" />
 <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
 <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
 </svg>
 );
}

// ============ تب سامانه مودیان — مدیریت اتصال مودیان برای سازمان‌ها ============
function ModianManagementTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [tenants, setTenants] = React.useState<any[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [actingId, setActingId] = React.useState<string | null>(null);
 const MODIAN_COST = "۱,۹۷۵,۰۰۰";
 // FIX(SA-2): درآمد مودیان از منبع واقعی (API) — نه فرمول تخمینی فرانت‌اند
 const [revenue, setRevenue] = React.useState<any>(null);

 React.useEffect(() => {
 (async () => {
 try {
 const [res, resRev] = await Promise.all([
 apiFetch("/api/platform/tenants", token),
 // FIX(SA-2): KPI درآمد از دیتای واقعی — لایسنس‌های فعال + پرداخت‌های ثبت‌شده
 apiFetch("/api/platform/modian-revenue", token).catch(() => null),
 ]);
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) {
 throw new Error(data.error || "خطا در دریافت سازمان‌ها");
 }
 if (resRev && resRev.ok) {
 const rev = await resRev.json().catch(() => ({}));
 if (rev?.success && rev?.data) setRevenue(rev.data);
 }
 // data شامل modianEnabled و modianLastSync واقعی از دیتابیس است
 setTenants(data.tenants || data.data || []);
 } catch (e) {
 toast({
 title: "خطا در بارگذاری",
 description: e instanceof Error? e.message: "خطا در دریافت سازمان‌ها",
 variant: "destructive",
 });
 } finally { setLoading(false); }
 })();
 }, [token, toast]);

 const toggleModian = async (t: any) => {
 setActingId(t.id);
 try {
 const res = await apiFetch(`/api/platform/tenants/${t.id}`, token, {
 method: "PATCH",
 body: JSON.stringify({ action: "updateModian", modianEnabled:!t.modianEnabled }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا در تغییر وضعیت مودیان");
 setTenants((prev) => prev.map((item: any) => item.id === t.id? {...item, modianEnabled:!item.modianEnabled }: item));
 toast({ title: json.message || "وضعیت مودیان به‌روزرسانی شد", description: `${t.name}: ${!t.modianEnabled? "فعال": "غیرفعال"}` });
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در تغییر وضعیت مودیان",
 variant: "destructive",
 });
 } finally {
 setActingId(null);
 }
 };

 return (
 <div className="space-y-5">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <StatCard icon={FileCheck} label="سازمان‌های متصل" value={tenants.filter((t: any) => t.modianEnabled).length} accent="success" />
 <StatCard icon={Building2} label="کل سازمان‌ها" value={tenants.length} accent="primary" />
 {/* FIX(SA-2): درآمد واقعی از API — قبلاً فرمول تخمینی «تعداد × ۱٬۹۷۵٬۰۰۰» بود */}
<StatCard
 icon={DollarSign}
 label="درآمد ماهانه مودیان (واقعی)"
 value={revenue ? `${revenue.mrrToman.toLocaleString("fa-IR")} ت` : "…"}
 accent="chart5"
/>

{/* FIX(SA-2): تفکیک شفاف منابع درآمد — واقعی vs اسمی (سلول تمام‌عرض گرید) */}
<Card className="md:col-span-3">
 <CardHeader>
  <CardTitle className="text-sm">جزئیات درآمد سازمان‌های متصل به مودیان</CardTitle>
  <CardDescription>محاسبه از منابع واقعی — نه فرمول تخمینی</CardDescription>
 </CardHeader>
 <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
  <div className="rounded-lg border p-3">
   <p className="text-[11px] text-muted-foreground">درآمد ماهانه (لایسنس‌های فعال پولی)</p>
   <p className="text-lg font-bold tnum">{revenue ? revenue.mrrToman.toLocaleString("fa-IR") + " ت" : "—"}</p>
   <p className="text-[10px] text-muted-foreground">{revenue ? `${revenue.activePaidLicenses.toLocaleString("fa-IR")} لایسنس فعال` : ""}</p>
  </div>
  <div className="rounded-lg border p-3">
   <p className="text-[11px] text-muted-foreground">پرداخت‌های ثبت‌شده درگاه</p>
   <p className="text-lg font-bold tnum">{revenue ? revenue.paidToman.toLocaleString("fa-IR") + " ت" : "—"}</p>
   <p className="text-[10px] text-muted-foreground">{revenue ? `${revenue.paidCount.toLocaleString("fa-IR")} تراکنش` : ""}</p>
  </div>
  <div className="rounded-lg border border-dashed p-3">
   <p className="text-[11px] text-muted-foreground">حق اتصال اسمی (مرجع)</p>
   <p className="text-lg font-bold tnum text-muted-foreground">{((revenue ? revenue.modianTenants : tenants.filter((t: any) => t.modianEnabled).length) * 1975000).toLocaleString("fa-IR") + " ت"}</p>
   <p className="text-[10px] text-muted-foreground">تعداد × ۱٬۹۷۵٬۰۰۰ — مرجع تعرفه؛ درآمد واقعی نیست</p>
  </div>
 </CardContent>
</Card>
 </div>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <FileCheck className="h-5 w-5 text-primary" />
 مدیریت اتصال سامانه مودیان
 </CardTitle>
 <CardDescription>
 هزینه اتصال مودیان برای هر سازمان: <span className="font-bold text-foreground">{MODIAN_COST} تومان</span>
 </CardDescription>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
 ): tenants.length === 0? (
 <p className="text-muted-foreground text-sm py-6 text-center">سازمانی یافت نشد</p>
 ): (
 <div className="space-y-3">
 {tenants.map((t: any) => (
 <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
 <div className="min-w-0">
 <p className="font-medium text-sm truncate">{t.name || t.id}</p>
 <p className="text-xs text-muted-foreground">پلن: {getPlanName(t.plan || "free")}</p>
 {t.modianEnabled && t.modianLastSync && (
 <p className="text-[11px] text-muted-foreground tnum">آخرین همگام‌سازی: {new Date(t.modianLastSync).toLocaleString("fa-IR")}</p>
 )}
 </div>
 <div className="flex items-center gap-2">
 <Badge variant={t.modianEnabled? "default": "secondary"} className="text-[10px]">
 {t.modianEnabled? "مودیان فعال": "غیرفعال"}
 </Badge>
 <Button
 size="sm"
 variant={t.modianEnabled? "destructive": "default"}
 disabled={actingId === t.id}
 onClick={() => toggleModian(t)}
 >
 {actingId === t.id? <Loader2 className="h-3.5 w-3.5 animate-spin" />: t.modianEnabled? "غیرفعال": "فعال‌سازی"}
 </Button>
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="text-base">اطلاعات مالی اتصال مودیان</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 text-sm">
 <div className="flex justify-between"><span className="text-muted-foreground">هزینه هر اتصال:</span><span className="font-bold">{MODIAN_COST} تومان</span></div>
 <div className="flex justify-between"><span className="text-muted-foreground">تعداد اتصال فعال:</span><span className="font-bold tnum">{tenants.filter((t: any) => t.modianEnabled).length}</span></div>
 <div className="flex justify-between"><span className="text-muted-foreground">حق اتصال اسمی (مرجع — درآمد واقعی نیست):</span><span className="font-bold tnum text-muted-foreground">{(tenants.filter((t: any) => t.modianEnabled).length * 1975000).toLocaleString("fa-IR")} تومان</span></div>
 </CardContent>
 </Card>
 </div>
 );
}

// ============ تب صورتحساب و پرداخت — مدیریت مالی پلتفرم ============
function BillingPaymentsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [tab, setTab] = React.useState("subscriptions");

 // Payments state — درآمد اشتراک از لایسنس‌ها (data.billing از /api/platform/stats)
 const [payments, setPayments] = React.useState<Array<{ id: string; amount: number; status: string; plan: string; planName?: string; tenantName: string | null; createdAt: string }>>([]);
 const [paymentsLoading, setPaymentsLoading] = React.useState(true);
 const [billingStats, setBillingStats] = React.useState<{ activeSubscriptions: number; subscriptionRevenueToman: number } | null>(null);

 // Gateway state — مطابق شکل واقعی API: {zarinpal:{merchantId,enabled}, idpay:{...}}
 const [zarinpalMerchant, setZarinpalMerchant] = React.useState("");
 const [zarinpalEnabled, setZarinpalEnabled] = React.useState(false);
 // FIX(PAY-2): کال‌بک و sandbox — قابل ویرایش از پنل سوپرادمین
 const [zarinpalSandbox, setZarinpalSandbox] = React.useState(false);
 const [callbackBaseUrl, setCallbackBaseUrl] = React.useState("");
 const [effectiveCallbackUrl, setEffectiveCallbackUrl] = React.useState("");
 const [idpayMerchant, setIdpayMerchant] = React.useState("");
 const [idpayEnabled, setIdpayEnabled] = React.useState(false);
 const [gatewaySaving, setGatewaySaving] = React.useState(false);

 // ===== تست پرداخت (v10) — اتصال درگاه + پرداخت تستی End-to-End =====
 const [testTenants, setTestTenants] = React.useState<Array<{ id: string; name: string; plan: string; status: string }>>([]);
 const [testTenantId, setTestTenantId] = React.useState("");
 const [testPlanId, setTestPlanId] = React.useState("none");
 const [testAmount, setTestAmount] = React.useState("1000");
 const [connectionTesting, setConnectionTesting] = React.useState(false);
 const [paymentTesting, setPaymentTesting] = React.useState(false);
 const [paymentTestResult, setPaymentTestResult] = React.useState<{
 ok: boolean; type: "connection" | "payment"; message: string; paymentUrl?: string; amountToman?: number;
 } | null>(null);

 // بارگذاری پرداخت‌ها (از stats) + تنظیمات فعلی درگاه‌ها
 React.useEffect(() => {
 const load = async () => {
 setPaymentsLoading(true);
 try {
 const [statsRes, payRes] = await Promise.all([
 apiFetch("/api/platform/stats", token).catch(() => null),
 apiFetch("/api/platform/settings/payment", token).catch(() => null),
 ]);
 if (statsRes && statsRes.ok) {
 const data = await statsRes.json();
 if (data.success && data.data?.billing) {
 setPayments(Array.isArray(data.data.billing.payments)? data.data.billing.payments: []);
 setBillingStats({
 activeSubscriptions: data.data.billing.activeSubscriptions?? 0,
 subscriptionRevenueToman: data.data.billing.subscriptionRevenueToman?? 0,
 });
 } else {
 setPayments([]);
 }
 }
 if (payRes && payRes.ok) {
 const pdata = await payRes.json();
 if (pdata.success && pdata.data) {
 setZarinpalMerchant(pdata.data.zarinpal?.merchantId || "");
 setZarinpalEnabled(!!pdata.data.zarinpal?.enabled);
 setZarinpalSandbox(!!pdata.data.zarinpal?.sandbox);
 setCallbackBaseUrl(pdata.data.callbackBaseUrl || "");
 setEffectiveCallbackUrl(pdata.data.effectiveCallbackUrl || "");
 setIdpayMerchant(pdata.data.idpay?.merchantId || "");
 setIdpayEnabled(!!pdata.data.idpay?.enabled);
 }
 }
 // بارگذاری سازمان‌ها برای پرداخت تستی
 const tenantsRes = await apiFetch("/api/platform/tenants", token).catch(() => null);
 if (tenantsRes && tenantsRes.ok) {
 const tdata = await tenantsRes.json();
 if (tdata.success && Array.isArray(tdata.data)) {
 const active = tdata.data
 .filter((t: { status?: string }) => t.status === "active")
 .map((t: { id: string; name: string; plan?: string; status?: string }) => ({
 id: t.id,
 name: t.name,
 plan: t.plan || "free",
 status: t.status || "active",
 }));
 setTestTenants(active);
 if (active.length > 0) setTestTenantId((prev) => prev || active[0].id);
 }
 }
 } catch {
 setPayments([]);
 } finally {
 setPaymentsLoading(false);
 }
 };
 void load();
 }, [token]);

 // ذخیره تنظیمات درگاه — هماهنگ با SettingsTab و شکل واقعی API
 const saveGateway = async () => {
 setGatewaySaving(true);
 try {
 const res = await apiFetch("/api/platform/settings/payment", token, {
 method: "POST",
 body: JSON.stringify({
 zarinpal: { merchantId: zarinpalMerchant.trim(), enabled: zarinpalEnabled, sandbox: zarinpalSandbox },
 idpay: { merchantId: idpayMerchant.trim(), enabled: idpayEnabled },
 callbackBaseUrl: callbackBaseUrl.trim(),
 }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 toast({ title: "ذخیره شد", description: "تنظیمات درگاه پرداخت با موفقیت ذخیره شد" });
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره تنظیمات درگاه",
 });
 } finally {
 setGatewaySaving(false);
 }
 };

 // ===== تست اتصال درگاه (v10) =====
 const runConnectionTest = async () => {
 setConnectionTesting(true);
 setPaymentTestResult(null);
 try {
 const res = await apiFetch("/api/platform/payment-test", token, {
 method: "POST",
 body: JSON.stringify({ action: "test-connection" }),
 });
 const json = await res.json().catch(() => null);
 if (json?.test || json?.message) {
 setPaymentTestResult({
 ok: !!json.ok,
 type: "connection",
 message: json.message || (json.ok? "اتصال برقرار است" : "اتصال ناموفق"),
 });
 } else {
 throw new Error(json?.error || "پاسخ نامعتبر از سرور");
 }
 } catch (e) {
 setPaymentTestResult({
 ok: false,
 type: "connection",
 message: e instanceof Error? e.message: "خطا در تست اتصال",
 });
 } finally {
 setConnectionTesting(false);
 }
 };

 // ===== پرداخت تستی کامل End-to-End (v10) =====
 const runTestPayment = async () => {
 if (!testTenantId) {
 toast({ variant: "destructive", title: "خطا", description: "ابتدا یک سازمان انتخاب کنید" });
 return;
 }
 setPaymentTesting(true);
 setPaymentTestResult(null);
 try {
 const amountNum = parseInt(testAmount.replace(/[^0-9]/g, ""), 10) || 1000;
 const res = await apiFetch("/api/platform/payment-test", token, {
 method: "POST",
 body: JSON.stringify({
 action: "create-test-payment",
 tenantId: testTenantId,
 planId: testPlanId,
 amountToman: amountNum,
 }),
 });
 const json = await res.json().catch(() => null);
 if (json?.ok && json?.paymentUrl) {
 setPaymentTestResult({
 ok: true,
 type: "payment",
 message: json.message || "لینک پرداخت تستی ساخته شد",
 paymentUrl: json.paymentUrl,
 amountToman: json.amountToman,
 });
 // باز کردن خودکار درگاه در تب جدید
 try {
 window.open(json.paymentUrl, "_blank", "noopener");
 } catch { /* popup blocked — لینک نمایش داده می‌شود */ }
 } else {
 throw new Error(json?.message || json?.error || "ایجاد پرداخت تستی ناموفق بود");
 }
 } catch (e) {
 setPaymentTestResult({
 ok: false,
 type: "payment",
 message: e instanceof Error? e.message: "خطا در ایجاد پرداخت تستی",
 });
 } finally {
 setPaymentTesting(false);
 }
 };

 const statusLabels: Record<string, { label: string; className: string }> = {
 successful: { label: "موفق", className: "bg-success/10 text-success" },
 pending: { label: "در انتظار", className: "bg-warning/10 text-warning" },
 failed: { label: "ناموفق", className: "bg-destructive/10 text-destructive" },
 // v33-c: تریال = رایگان — هرگز «خرید موفق» نمایش داده نمی‌شود
 trial: { label: "تریال (بدون پرداخت)", className: "bg-muted text-muted-foreground" },
 };

 return (
 <div className="space-y-5">
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 <StatCard icon={CreditCard} label="اشتراک‌های خریداری‌شدهٔ فعال" value={billingStats? toPersianDigits(String(billingStats.activeSubscriptions)): "—"} sub="لایسنس خریداری‌شده (بدون تریال)" accent="success" />
 <StatCard icon={DollarSign} label="درآمد واقعی اشتراک‌ها" value={billingStats? formatCompactToman(billingStats.subscriptionRevenueToman): "—"} sub={billingStats && billingStats.subscriptionRevenueToman > 0? "مجموع سالانه (تومان)": "هنوز فروشی ثبت نشده است"} accent="primary" />
 <StatCard icon={TrendingUp} label="خریدهای ثبت‌شده" value={paymentsLoading? "—": toPersianDigits(String(payments.filter(p => p.status === "successful").length))} sub="فقط لایسنس خریداری‌شده" accent="chart5" />
 <StatCard icon={FileCheck} label="تعرفه مودیان (مرجع)" value="۱,۹۷۵,۰۰۰ ت" accent="warning" />
 </div>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Wallet className="h-5 w-5 text-primary" />
 صورتحساب و پرداخت
 </CardTitle>
 <CardDescription>مدیریت اشتراک‌ها، پرداخت‌ها و درآمد پلتفرم</CardDescription>
 </CardHeader>
 <CardContent>
 <Tabs value={tab} onValueChange={setTab}>
 <TabsList className="mb-4">
 <TabsTrigger value="subscriptions">اشتراک‌ها</TabsTrigger>
 <TabsTrigger value="payments">پرداخت‌ها</TabsTrigger>
 <TabsTrigger value="modian-billing">صورتحساب مودیان</TabsTrigger>
 <TabsTrigger value="gateway">درگاه پرداخت</TabsTrigger>
 <TabsTrigger value="payment-test">تست پرداخت</TabsTrigger>
 </TabsList>
 <TabsContent value="subscriptions">
 <div className="text-sm text-muted-foreground py-6 text-center">
 لیست اشتراک‌های فعال و منقضی‌شده سازمان‌ها
 <div className="mt-3 space-y-2">
 {PLANS.filter(p =>!p.hidden).map(p => (
 <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
 <span className="font-medium">{p.name}</span>
 <span className="tnum">{p.priceToman.toLocaleString("fa-IR")} تومان/سال</span>
 </div>
 ))}
 </div>
 </div>
 </TabsContent>
 <TabsContent value="payments">
 {paymentsLoading? (
 <div className="flex items-center justify-center py-8">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 <span className="mr-2 text-sm text-muted-foreground">در حال بارگذاری...</span>
 </div>
 ): payments.length === 0? (
 <p className="text-sm text-muted-foreground py-6 text-center">تاکنون هیچ پرداخت واقعی ثبت نشده است — ردیف‌های تریال، فروش نیستند</p>
 ): (
 <div className="max-h-96 overflow-y-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="text-xs">سازمان</TableHead>
 <TableHead className="text-xs">پلن</TableHead>
 <TableHead className="text-xs">مبلغ (تومان)</TableHead>
 <TableHead className="text-xs">وضعیت</TableHead>
 <TableHead className="text-xs">تاریخ</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {payments.map((p) => {
 const st = statusLabels[p.status] || { label: p.status, className: "bg-muted text-muted-foreground" };
 return (
 <TableRow key={p.id}>
 <TableCell className="text-xs font-medium">{p.tenantName || "—"}</TableCell>
 <TableCell className="text-xs">{p.planName || PLAN_LABELS[p.plan] || p.plan || "—"}</TableCell>
 <TableCell className="text-xs tnum">
 {p.status === "trial"
 ? <span className="text-muted-foreground">رایگان</span>
 : p.amount
 ? p.amount.toLocaleString("fa-IR")
 : "—"}
 </TableCell>
 <TableCell className="text-xs">
 <Badge variant="outline" className={`text-[10px] ${st.className}`}>{st.label}</Badge>
 </TableCell>
 <TableCell className="text-xs tnum">{p.createdAt? toJalali(new Date(p.createdAt)): "—"}</TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 )}
 </TabsContent>
 <TabsContent value="modian-billing">
 <div className="space-y-3 text-sm">
 <div className="flex justify-between border-b border-border pb-2"><span>هزینه اتصال مودیان:</span><span className="font-bold">۱,۹۷۵,۰۰۰ تومان</span></div>
 <p className="text-muted-foreground">سامانه مودیان برای هر سازمان جداگانه فعال می‌شود و هزینه آن بلافاصله پس از فعال‌سازی دریافت می‌گردد.</p>
 </div>
 </TabsContent>
 <TabsContent value="gateway">
 {/* مطابق SettingsTab — شکل واقعی API: هر درگاه merchantId + enabled */}
 <div className="space-y-4 max-w-lg">
 <div className="space-y-2 rounded-lg border border-border p-3">
 <div className="flex items-center justify-between">
 <Label className="text-xs font-medium">زرین‌پال</Label>
 <div className="flex items-center gap-3">
 <label className="flex items-center gap-1.5 text-xs cursor-pointer">
 <input type="checkbox" checked={zarinpalSandbox} onChange={(e) => setZarinpalSandbox(e.target.checked)} className="h-4 w-4" />
 Sandbox
 </label>
 <label className="flex items-center gap-2 text-xs cursor-pointer">
 <input type="checkbox" checked={zarinpalEnabled} onChange={(e) => setZarinpalEnabled(e.target.checked)} className="h-4 w-4" />
 فعال
 </label>
 </div>
 </div>
 <Input
 value={zarinpalMerchant}
 onChange={(e) => setZarinpalMerchant(e.target.value)}
 placeholder="کد پذیرنده زرین‌پال (حداقل ۶ کاراکتر)"
 className="h-8 text-sm font-mono"
 dir="ltr"
 />
 </div>
 {/* FIX(PAY-2): آدرس پایه کال‌بک — ریشه‌ی خطاهای -10/-14 زرین‌پال پشت پروکسی */}
 <div className="space-y-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-3">
 <div className="flex items-center gap-2">
 <Link2 className="h-3.5 w-3.5 text-amber-600" />
 <Label className="text-xs font-medium">آدرس پایه کال‌بک پرداخت (Callback Base URL)</Label>
 </div>
 <Input
 value={callbackBaseUrl}
 onChange={(e) => setCallbackBaseUrl(e.target.value)}
 placeholder="مثلاً https://hoosh.nobatime.ir"
 className="h-8 text-sm font-mono"
 dir="ltr"
 />
 <p className="text-[11px] text-muted-foreground leading-5">
 زرین‌پال دامنه کال‌بک را با دامنه ثبت‌شده پنل پذیرنده تطبیق می‌دهد؛ پشت پروکسی/CDN اگر
 آدرس غلط ساخته شود خطای <span className="font-mono" dir="ltr">-10/-14</span> می‌گیرید. این
 مقدار را روی دامنه اصلی (با https) تنظیم کنید تا همه پرداخت‌ها از آن پیروی کنند. خالی
 بگذارید تا خودکار تشخیص داده شود.
 </p>
 {effectiveCallbackUrl && (
 <div className="rounded-md bg-background border border-border px-2.5 py-1.5 text-[11px] flex items-center gap-2" dir="ltr">
 <span className="text-muted-foreground shrink-0">کال‌بک مؤثر:</span>
 <span className="font-mono truncate">{effectiveCallbackUrl}</span>
 </div>
 )}
 </div>
 <div className="space-y-2 rounded-lg border border-border p-3">
 <div className="flex items-center justify-between">
 <Label className="text-xs font-medium">آیدی‌پی</Label>
 <label className="flex items-center gap-2 text-xs cursor-pointer">
 <input type="checkbox" checked={idpayEnabled} onChange={(e) => setIdpayEnabled(e.target.checked)} className="h-4 w-4" />
 فعال
 </label>
 </div>
 <Input
 value={idpayMerchant}
 onChange={(e) => setIdpayMerchant(e.target.value)}
 placeholder="کد پذیرنده آیدی‌پی (حداقل ۶ کاراکتر)"
 className="h-8 text-sm font-mono"
 dir="ltr"
 />
 </div>
 <p className="text-[11px] text-muted-foreground">کد پذیرنده فقط برای سوپرادمین کامل نمایش داده می‌شود. (نکست‌پی پشتیبانی نمی‌شود)</p>
 <Button size="sm" className="gap-2" onClick={saveGateway} disabled={gatewaySaving}>
 {gatewaySaving? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Save className="h-3.5 w-3.5" />}
 ذخیره تنظیمات درگاه
 </Button>
 </div>
 </TabsContent>
 <TabsContent value="payment-test">
 {/* ===== تست پرداخت (v10) — اتصال درگاه + پرداخت تستی End-to-End ===== */}
 <div className="space-y-4">
 {/* تست اتصال */}
 <div className="rounded-lg border border-border p-4 space-y-3">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-sm font-semibold flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 تست اتصال به درگاه زرین‌پال
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 بررسی می‌کند که کد پذیرنده معتبر است و API درگاه پاسخ می‌دهد — بدون نیاز به پرداخت
 </p>
 </div>
 <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={runConnectionTest} disabled={connectionTesting}>
 {connectionTesting? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Activity className="h-3.5 w-3.5" />}
 تست اتصال
 </Button>
 </div>
 </div>

 {/* پرداخت تستی کامل */}
 <div className="rounded-lg border border-border p-4 space-y-3">
 <div>
 <p className="text-sm font-semibold flex items-center gap-2">
 <CreditCard className="h-4 w-4 text-primary" />
 پرداخت تستی کامل (End-to-End)
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 یک پرداخت واقعی با مبلغ دلخواه (پیش‌فرض ۱٬۰۰۰ تومان) روی درگاه ساخته می‌شود؛ با پرداخت آن، فلو کامل «تأیید پرداخت + فعال‌سازی لایسنس پلن» دقیقاً مثل کاربر واقعی اجرا می‌شود.
 </p>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">سازمان هدف</Label>
 <Select value={testTenantId} onValueChange={setTestTenantId}>
 <SelectTrigger className="h-9 text-sm">
 <SelectValue placeholder="انتخاب سازمان" />
 </SelectTrigger>
 <SelectContent>
 {testTenants.length === 0? (
 <div className="p-2 text-xs text-muted-foreground text-center">سازمان فعالی یافت نشد</div>
 ): (
 testTenants.map((t) => (
 <SelectItem key={t.id} value={t.id}>
 {t.name} — پلن فعلی: {getPlanName(t.plan)}
 </SelectItem>
 ))
 )}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">پلن برای فعال‌سازی (اختیاری)</Label>
 <Select value={testPlanId} onValueChange={setTestPlanId}>
 <SelectTrigger className="h-9 text-sm">
 <SelectValue placeholder="بدون تغییر پلن" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">بدون تغییر پلن (فقط تست درگاه)</SelectItem>
 {PLANS.filter((p) =>!p.hidden).map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.name} — {p.priceToman.toLocaleString("fa-IR")} تومان
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="space-y-1.5 max-w-56">
 <Label className="text-xs">مبلغ تست (تومان)</Label>
 <Input
 value={testAmount}
 onChange={(e) => setTestAmount(e.target.value.replace(/[^0-9]/g, ""))}
 dir="ltr"
 className="h-9 text-sm tnum"
 inputMode="numeric"
 placeholder="1000"
 />
 </div>
 <Button size="sm" className="gap-2" onClick={runTestPayment} disabled={paymentTesting || testTenants.length === 0}>
 {paymentTesting? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <ExternalLink className="h-3.5 w-3.5" />}
 ساخت لینک پرداخت تستی
 </Button>
 </div>

 {/* نتیجه تست */}
 {paymentTestResult && (
 <div
 className={`rounded-lg border p-4 space-y-2 ${
 paymentTestResult.ok
? "border-success/40 bg-success/5"
 : "border-destructive/40 bg-destructive/5"
 }`}
 >
 <div className="flex items-start gap-2">
 {paymentTestResult.ok? (
 <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
 ): (
 <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
 )}
 <div className="space-y-1.5 min-w-0">
 <p className={`text-sm font-medium ${paymentTestResult.ok? "text-success": "text-destructive"}`}>
 {paymentTestResult.type === "connection"? "نتیجه تست اتصال": "نتیجه پرداخت تستی"}
 </p>
 <p className="text-xs text-muted-foreground leading-relaxed">{paymentTestResult.message}</p>
 {paymentTestResult.paymentUrl && (
 <a
 href={paymentTestResult.paymentUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-4 break-all"
 dir="ltr"
 >
 <ExternalLink className="h-3 w-3 shrink-0" />
 {paymentTestResult.paymentUrl}
 </a>
 )}
 {paymentTestResult.type === "payment" && paymentTestResult.ok && (
 <p className="text-[11px] text-muted-foreground">
 پس از پرداخت، به صفحه تأیید هوش برمی‌گردید و لایسنس فعال می‌شود؛ سپس در تب «پرداخت‌ها» تراکنش دیده می‌شود.
 </p>
 )}
 </div>
 </div>
 </div>
 )}
 </div>
 </TabsContent>
 </Tabs>
 </CardContent>
 </Card>
 </div>
 );
}

// ============ تب پیامک و ایمیل — تنظیمات ارتباطی ============
function NotificationsConfigTab({ token }: { token: string }) {
 const { toast } = useToast();

 // SMTP state
 const [smtpHost, setSmtpHost] = React.useState("");
 const [smtpPort, setSmtpPort] = React.useState("587");
 const [smtpUser, setSmtpUser] = React.useState("");
 const [smtpPass, setSmtpPass] = React.useState("");
 const [smtpFrom, setSmtpFrom] = React.useState("");
 const [savingSmtp, setSavingSmtp] = React.useState(false);

 // SMS state
 const [smsProvider, setSmsProvider] = React.useState("");
 const [smsApiKey, setSmsApiKey] = React.useState("");
 const [smsFromNumber, setSmsFromNumber] = React.useState("");
 const [savingSms, setSavingSms] = React.useState(false);

 // formsubmit.co state
 const [fsEmail, setFsEmail] = React.useState("");
 const [savingFs, setSavingFs] = React.useState(false);

 // مقداردهی اولیه از GET /api/platform/settings (smtp/sms/formsubmit)
 React.useEffect(() => {
 const load = async () => {
 try {
 const res = await apiFetch("/api/platform/settings", token);
 const data = await res.json();
 if (res.ok && data.success && data.data) {
 if (data.data.smtp) {
 setSmtpHost(data.data.smtp.host || "");
 setSmtpPort(data.data.smtp.port || "587");
 setSmtpUser(data.data.smtp.user || "");
 // رمز عبور برای امنیت از سرور خوانده نمی‌شود — فقط در صورت ذخیره‌ی جدید ارسال می‌شود
 }
 if (data.data.sms) {
 setSmsProvider(data.data.sms.provider || "");
 setSmsFromNumber(data.data.sms.sender || "");
 }
 if (data.data.formsubmit) {
 setFsEmail(data.data.formsubmit.email || "");
 }
 }
 } catch {
 /* تنظیمات قبلی بارگذاری نشد — مقادیر خالی می‌مانند */
 }
 };
 void load();
 }, [token]);

 const saveSmtp = async () => {
 setSavingSmtp(true);
 try {
 const res = await apiFetch("/api/platform/settings", token, {
 method: "PATCH",
 body: JSON.stringify({
 smtp: {
 host: smtpHost,
 port: smtpPort,
 user: smtpUser,
 // رمز خالی = حفظ رمز قبلی ذخیره‌شده در سرور
...(smtpPass? { pass: smtpPass }: {}),
 from: smtpFrom,
 },
 }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 toast({ title: "ذخیره شد", description: "تنظیمات ایمیل با موفقیت ذخیره شد" });
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره تنظیمات ایمیل",
 });
 } finally {
 setSavingSmtp(false);
 }
 };

 const saveSms = async () => {
 setSavingSms(true);
 try {
 const res = await apiFetch("/api/platform/settings", token, {
 method: "PATCH",
 body: JSON.stringify({
 sms: {
 provider: smsProvider,
 // کلید خالی = حفظ کلید قبلی ذخیره‌شده در سرور
...(smsApiKey? { apiKey: smsApiKey }: {}),
 sender: smsFromNumber,
 },
 }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 toast({ title: "ذخیره شد", description: "تنظیمات پیامک با موفقیت ذخیره شد" });
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره تنظیمات پیامک",
 });
 } finally {
 setSavingSms(false);
 }
 };

 const saveFormsubmit = async () => {
 if (!fsEmail.trim()) {
 toast({ variant: "destructive", title: "خطا", description: "ایمیل مقصد الزامی است" });
 return;
 }
 setSavingFs(true);
 try {
 const res = await apiFetch("/api/platform/settings", token, {
 method: "PATCH",
 body: JSON.stringify({
 formsubmit: { email: fsEmail },
 }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا");
 toast({ title: "ذخیره شد", description: "تنظیمات formsubmit.co با موفقیت ذخیره شد" });
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره تنظیمات formsubmit.co",
 });
 } finally {
 setSavingFs(false);
 }
 };

 return (
 <div className="space-y-5">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Mail className="h-5 w-5 text-primary" />
 تنظیمات ایمیل
 </CardTitle>
 <CardDescription>پیکربندی SMTP و الگوهای ایمیل</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label className="text-xs">سرور SMTP</Label>
 <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className="h-8 text-sm" />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">پورت</Label>
 <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className="h-8 text-sm" />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">نام کاربری</Label>
 <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@example.com" className="h-8 text-sm" />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">رمز عبور</Label>
 <Input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••" className="h-8 text-sm" />
 </div>
 <div className="space-y-2 md:col-span-2">
 <Label className="text-xs">ایمیل فرستنده (From)</Label>
 <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@example.com" className="h-8 text-sm" />
 </div>
 </div>
 <Button size="sm" className="gap-2" onClick={saveSmtp} disabled={savingSmtp}>
 {savingSmtp? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Save className="h-3.5 w-3.5" />}
 ذخیره تنظیمات ایمیل
 </Button>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Smartphone className="h-5 w-5 text-primary" />
 تنظیمات پیامک (SMS)
 </CardTitle>
 <CardDescription>پیکربندی سرویس پیامک و الگوها</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label className="text-xs">سرویس‌دهنده</Label>
 <Input value={smsProvider} onChange={(e) => setSmsProvider(e.target.value)} placeholder="کاوهنگ، ملی پیامک،..." className="h-8 text-sm" />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">API Key</Label>
 <Input type="password" value={smsApiKey} onChange={(e) => setSmsApiKey(e.target.value)} placeholder="••••••" className="h-8 text-sm" />
 </div>
 <div className="space-y-2 md:col-span-2">
 <Label className="text-xs">شماره فرستنده</Label>
 <Input value={smsFromNumber} onChange={(e) => setSmsFromNumber(e.target.value)} placeholder="3000123456" className="h-8 text-sm" />
 </div>
 </div>
 <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground space-y-1">
 <p>الگوهای پیامک:</p>
 <p>• ثبت‌نام: خوش آمدید به هوش</p>
 <p>• فاکتور: فاکتور جدید ثبت شد</p>
 <p>• مودیان: صورتحساب ارسال شد</p>
 <p>• تیکت: پاسخ جدید به تیکت شما</p>
 </div>
 <Button size="sm" className="gap-2" onClick={saveSms} disabled={savingSms}>
 {savingSms? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Save className="h-3.5 w-3.5" />}
 ذخیره تنظیمات پیامک
 </Button>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <MessageSquare className="h-5 w-5 text-primary" />
 اتصال formsubmit.co
 </CardTitle>
 <CardDescription>ارسال خودکار ایمیلی برای تیکت‌ها و رویدادها</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3 text-sm">
 <div className="space-y-2">
 <Label className="text-xs">ایمیل مقصد</Label>
 <Input value={fsEmail} onChange={(e) => setFsEmail(e.target.value)} className="h-8 text-sm" />
 </div>
 <Button size="sm" className="gap-2" onClick={saveFormsubmit} disabled={savingFs}>
 {savingFs? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Save className="h-3.5 w-3.5" />}
 ذخیره
 </Button>
 </CardContent>
 </Card>
 </div>
 );
}

// ════════════════════════════════════════════════════════════════
// GOD-LEVEL TABS — قدرتمندترین ابزارهای مدیریت پلتفرم
// ════════════════════════════════════════════════════════════════

/** مانیتور سیستم — Real-time server metrics, memory, CPU, processes */
function SystemMonitorTab({ token }: { token: string }) {
 const [metrics, setMetrics] = React.useState<any>(null);
 const [loading, setLoading] = React.useState(true);
 const [autoRefresh, setAutoRefresh] = React.useState(true);

 const fetchMetrics = React.useCallback(async () => {
 try {
 const [healthRes, perfRes] = await Promise.all([
 fetch("/api/health/detailed", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
 fetch("/api/platform/performance", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
 ]);
 const health = healthRes? await healthRes.json().catch(() => ({})): {};
 const perf = perfRes? await perfRes.json().catch(() => ({})): {};
 setMetrics({ health, perf, fetchedAt: new Date().toISOString() });
 } catch { /* ignore */ }
 setLoading(false);
 }, [token]);

 React.useEffect(() => {
 fetchMetrics();
 if (!autoRefresh) return;
 const iv = setInterval(fetchMetrics, 10000);
 return () => clearInterval(iv);
 }, [fetchMetrics, autoRefresh]);

 if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

 const h = metrics?.health || {};
 const p = metrics?.perf?.data || {};
 const svcs = h.services || {};

 return (
 <div className="space-y-5">
 <div className="flex items-center justify-between">
 <h3 className="text-lg font-bold flex items-center gap-2"><Monitor className="h-5 w-5 text-emerald-500" /> مانیتور سیستم زنده</h3>
 <div className="flex items-center gap-2">
 <Badge variant={autoRefresh? "default": "outline"} className="cursor-pointer" onClick={() => setAutoRefresh(!autoRefresh)}>
 {autoRefresh? " خودکار (10s)": " توقف"}
 </Badge>
 <Button size="sm" variant="outline" onClick={fetchMetrics} className="gap-1"><RefreshCw className="h-3.5 w-3.5" /> بروزرسانی</Button>
 </div>
 </div>

 {/* Status Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <StatCard icon={Database} label="دیتابیس" value={svcs.database?.status === "up"? "سالم": "ناموجود"} sub={`تاخیر: ${svcs.database?.latency?? "?"}ms`} accent={svcs.database?.status === "up"? "primary": "destructive"} />
 <StatCard icon={Bot} label="سرویس AI" value={svcs.ai?.status === "up"? "فعال": "آفلاین"} accent={svcs.ai?.status === "up"? "primary": "destructive"} />
 <StatCard icon={Network} label="Realtime" value={svcs.realtime?.status === "up"? "فعال": "آفلاین"} sub={svcs.realtime?.port? `پورت ${svcs.realtime.port}`: ""} accent={svcs.realtime?.status === "up"? "primary": "destructive"} />
 <StatCard icon={Gauge} label="آپتایم" value={`${Math.floor((h.uptime?? 0) / 60)}m`} sub={`وضعیت: ${h.status?? "?"}`} accent="primary" />
 </div>

 {/* Memory & Process Info */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <Card>
 <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4" /> مصرف حافظه و پردازنده</CardTitle></CardHeader>
 <CardContent className="space-y-3 text-sm">
 <div className="space-y-2">
 <div className="flex justify-between"><span>حافظه استفاده‌شده</span><span className="font-mono">{p.memory?.used?? "N/A"}</span></div>
 <div className="w-full h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(p.memory?.usedPercent?? 0, 100)}%` }} /></div>
 </div>
 <div className="space-y-2">
 <div className="flex justify-between"><span>حافظه آزاد</span><span className="font-mono">{p.memory?.free?? "N/A"}</span></div>
 <div className="w-full h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100 - (p.memory?.usedPercent?? 0), 100)}%` }} /></div>
 </div>
 <div className="flex justify-between"><span>کل حافظه</span><span className="font-mono">{p.memory?.total?? "N/A"}</span></div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> عملکرد سرور</CardTitle></CardHeader>
 <CardContent className="space-y-3 text-sm">
 <div className="flex justify-between"><span>درخواست‌ها/دقیقه</span><span className="font-mono tnum">{p.requestsPerMin?? "N/A"}</span></div>
 <div className="flex justify-between"><span>میانگین زمان پاسخ</span><span className="font-mono tnum">{p.avgResponseTime?? "N/A"}ms</span></div>
 <div className="flex justify-between"><span>خطای 5xx (ساعته)</span><span className="font-mono tnum text-destructive">{p.errors5xx?? 0}</span></div>
 <div className="flex justify-between"><span>خطای 4xx (ساعته)</span><span className="font-mono tnum text-amber-500">{p.errors4xx?? 0}</span></div>
 <div className="flex justify-between"><span>کنشفعال کاربران</span><span className="font-mono tnum">{p.activeUsers?? 0}</span></div>
 </CardContent>
 </Card>
 </div>

 <p className="text-xs text-muted-foreground text-center">آخرین بروزرسانی: {metrics?.fetchedAt? new Date(metrics.fetchedAt).toLocaleTimeString("fa-IR"): "—"}</p>
 </div>
 );
}

/** مدیریت دیتابیس — Backup, restore, schema info, table stats */
function DatabaseManagerTab({ token }: { token: string }) {
 const [action, setAction] = React.useState<string | null>(null);
 const [msg, setMsg] = React.useState("");
 const [backupFile, setBackupFile] = React.useState<string | null>(null);
 const [stats, setStats] = React.useState<any>(null);

 React.useEffect(() => {
 fetch("/api/platform/stats", { headers: { Authorization: `Bearer ${token}` } })
.then(r => r.json()).then(d => setStats(d.data?.counts)).catch(() => {});
 }, [token]);

 const runAction = async (type: string) => {
 setAction(type); setMsg("");
 try {
 if (type === "backup") {
 // خروجی کامل جداول کلیدی به JSON — job واقعی export_full در lib/etl-pipeline.ts
 const res = await fetch("/api/platform/etl", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobName: "export_full" }) });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success || data.data?.status!== "success") {
 throw new Error(data.data?.error || data.error || "خطا در پشتیبان‌گیری");
 }
 setBackupFile(data.data?.output?.file || null);
 setMsg(` پشتیبان‌گیری انجام شد — ${toPersianDigits(String(data.data.recordsWritten))} رکورد در ${data.data?.output?.file || "فایل پشتیبان"}`);
 } else if (type === "vacuum" || type === "integrity") {
 // نگهداشت واقعی SQLite — PRAGMA از طریق /api/platform/db/maintenance
 const res = await fetch("/api/platform/db/maintenance", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: type === "vacuum"? "vacuum": "integrity_check" }) });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) {
 throw new Error(data.error || "خطا در عملیات دیتابیس");
 }
 if (type === "integrity") {
 const rows = Array.isArray(data.data?.result)? data.data.result: [];
 const ok = rows.length > 0 && rows.every((r: any) => (r?.integrity_check?? "ok") === "ok");
 setMsg(ok? " بررسی یکپارچگی — همه جداول سالم هستند": ` نتیجه بررسی: ${JSON.stringify(rows).slice(0, 200)}`);
 } else {
 setMsg(" عملیات VACUUM با موفقیت اجرا شد — دیتابیس فشرده شد");
 }
 }
 } catch (e) {
 setMsg(` ${e instanceof Error? e.message: "خطا در اجرای عملیات"}`);
 }
 setAction(null);
 };

 return (
 <div className="space-y-5">
 <h3 className="text-lg font-bold flex items-center gap-2"><DbIcon className="h-5 w-5 text-emerald-500" /> مدیریت دیتابیس (GOD)</h3>

 {/* Table Stats */}
 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
 {[
 { label: "سازمان‌ها", val: stats?.tenants?? 0, icon: Building2 },
 { label: "کاربران", val: stats?.users?? 0, icon: UsersIcon },
 { label: "لایسنس‌ها", val: stats?.licenses?? 0, icon: KeyRound },
 { label: "فاکتورها", val: stats?.invoices?? 0, icon: FileText },
 { label: "محصولات", val: stats?.products?? 0, icon: Package },
 { label: "لاگ ممیزی", val: stats?.auditLogs?? 0, icon: History },
 ].map(t => (
 <Card key={t.label}><CardContent className="p-3 text-center">
 <t.icon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
 <p className="text-xl font-bold tnum">{toPersianDigits(String(t.val))}</p>
 <p className="text-xs text-muted-foreground">{t.label}</p>
 </CardContent></Card>
 ))}
 </div>

 {/* Actions */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Download className="h-4 w-4" /> پشتیبان‌گیری</CardTitle></CardHeader>
 <CardContent><p className="text-xs text-muted-foreground mb-3">اسنپ‌شات JSON جداول کلیدی (سازمان‌ها، کاربران، لایسنس‌ها، فاکتورها و...)</p>
 <div className="space-y-2">
 <Button size="sm" className="gap-2 w-full" onClick={() => runAction("backup")} disabled={action === "backup"}>
 {action === "backup"? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Download className="h-3.5 w-3.5" />} پشتیبان‌گیری
 </Button>
 {backupFile && (
 <Button
 size="sm"
 variant="link"
 className="gap-1 text-xs h-auto p-0"
 onClick={() => {
 // FIX(B3): دانلود با هدر Authorization — لینک مستقیم 401 می‌گرفت
 downloadProtectedFile(`/api/platform/etl?file=${encodeURIComponent(backupFile)}`, token)
 .catch((e) => console.error("Backup download failed:", e));
 }}
 >
 <Download className="h-3 w-3" /> دانلود فایل پشتیبان
 </Button>
 )}
 </div>
 </CardContent>
 </Card>
 <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><RefreshCcw className="h-4 w-4" /> VACUUM</CardTitle></CardHeader>
 <CardContent><p className="text-xs text-muted-foreground mb-3">فشرده‌سازی و بهینه‌سازی دیتابیس</p>
 <Button size="sm" variant="outline" className="gap-2 w-full" onClick={() => runAction("vacuum")} disabled={action === "vacuum"}>
 {action === "vacuum"? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RefreshCcw className="h-3.5 w-3.5" />} اجرای VACUUM
 </Button>
 </CardContent>
 </Card>
 <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> بررسی یکپارچگی</CardTitle></CardHeader>
 <CardContent><p className="text-xs text-muted-foreground mb-3">INTegrity check روی همه جداول</p>
 <Button size="sm" variant="outline" className="gap-2 w-full" onClick={() => runAction("integrity")} disabled={action === "integrity"}>
 {action === "integrity"? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <ShieldCheck className="h-3.5 w-3.5" />} بررسی
 </Button>
 </CardContent>
 </Card>
 </div>

 {msg && <p className="text-sm text-center p-3 rounded-lg bg-muted">{msg}</p>}
 </div>
 );
}

/** دیپلوی و سرور — Restart, clear cache, env vars, build info */
function DeploymentControlTab({ token }: { token: string }) {
 const [restarting, setRestarting] = React.useState(false);
 const [clearingCache, setClearingCache] = React.useState(false);
 const [msg, setMsg] = React.useState("");

 const restartServer = async () => {
 setRestarting(true); setMsg("");
 try {
 // ریستارت واقعی سرور — endpoint مخصوص /api/platform/restart (process.exit بعد از پاسخ)
 const res = await fetch("/api/platform/restart", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) {
 throw new Error(data.error || `کد ${res.status}`);
 }
 setMsg(" دستور ریستارت سرور ارسال شد — سرور چند لحظه بعد دوباره بالا می‌آید (watchdog)");
 } catch (e) {
 setMsg(` خطا در ریستارت سرور: ${e instanceof Error? e.message: "نامشخص"}`);
 }
 setRestarting(false);
 };

 const clearCache = async () => {
 setClearingCache(true); setMsg("");
 try {
 const res = await fetch("/api/seo/revalidate", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ tag: "all" }) });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) {
 throw new Error(data.error || `کد ${res.status}`);
 }
 const cnt = (data.data?.revalidatedPaths?.length?? 0) + (data.data?.revalidatedTags?.length?? 0);
 setMsg(` کش ISR با موفقیت پاک شد — ${toPersianDigits(String(cnt))} مسیر/تگ revalidate شد`);
 } catch (e) {
 setMsg(` خطا در پاک‌سازی کش: ${e instanceof Error? e.message: "نامشخص"}`);
 }
 setClearingCache(false);
 };

 return (
 <div className="space-y-5">
 <h3 className="text-lg font-bold flex items-center gap-2"><Rocket className="h-5 w-5 text-emerald-500" /> دیپلوی و کنترل سرور (GOD)</h3>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><RefreshCw className="h-4 w-4 text-destructive" /> ریستارت سرور</CardTitle></CardHeader>
 <CardContent className="space-y-3">
 <p className="text-xs text-muted-foreground">ریستارت کامل سرور Next.js — همه سشن‌ها قطع می‌شوند</p>
 <Button variant="destructive" size="sm" className="gap-2 w-full" onClick={restartServer} disabled={restarting}>
 {restarting? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RefreshCw className="h-3.5 w-3.5" />} ریستارت
 </Button>
 </CardContent>
 </Card>

 <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Trash2 className="h-4 w-4 text-amber-500" /> پاک‌سازی کش</CardTitle></CardHeader>
 <CardContent className="space-y-3">
 <p className="text-xs text-muted-foreground">پاک‌سازی کش ISR و فایل‌های موقت — بدون ریستارت</p>
 <Button variant="outline" size="sm" className="gap-2 w-full" onClick={clearCache} disabled={clearingCache}>
 {clearingCache? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Trash2 className="h-3.5 w-3.5" />} پاک‌سازی کش
 </Button>
 </CardContent>
 </Card>
 </div>

 {/* Build Info — مشتق از NODE_ENV و package.json (بدون داده جعلی) */}
 <Card>
 <CardHeader><CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4" /> اطلاعات بیلد و سرور</CardTitle></CardHeader>
 <CardContent className="text-sm space-y-2">
 <div className="flex justify-between"><span>فریمورک</span><span className="font-mono">Next.js {String(pkg.dependencies?.next || "").replace(/[^\d.]/g, "")}</span></div>
 <div className="flex justify-between"><span>رانتایم</span><span className="font-mono">Node.js (Bun package manager)</span></div>
 <div className="flex justify-between"><span>دیتابیس</span><span className="font-mono">SQLite (Prisma ORM)</span></div>
 <div className="flex justify-between"><span>حالت</span><span className="font-mono">{process.env.NODE_ENV === "production"? "تولید (Production)": "توسعه (Development)"}</span></div>
 <div className="flex justify-between"><span>پورت</span><span className="font-mono">3000</span></div>
 <div className="flex justify-between"><span>نسخه پلتفرم</span><span className="font-mono">{pkg.version || "—"}</span></div>
 </CardContent>
 </Card>

 {msg && <p className="text-sm text-center p-3 rounded-lg bg-muted">{msg}</p>}
 </div>
 );
}

/** کارهای زمان‌بندی — نمایش صادقانه: وضعیت واقعی ETL jobs از /api/platform/etl
 * نکته: کرون‌های HTTP این پروژه غیرفعال‌اند (410) — زمان‌بندی واقعی روی VPS از طریق
 * system crontab انجام می‌شود (ر.ک. VPS_SETUP_GUIDE.md — بخش cron). */
function CronManagerTab({ token }: { token: string }) {
 const [jobs, setJobs] = React.useState<Array<{ name: string; source: string; destination: string; schedule: string; lastRun: string | null; status: string }>>([]);
 const [loading, setLoading] = React.useState(true);
 const [runningJob, setRunningJob] = React.useState<string | null>(null);
 const { toast } = useToast();

 const load = React.useCallback(async () => {
 try {
 const res = await fetch("/api/platform/etl", { headers: { Authorization: `Bearer ${token}` } });
 const data = await res.json();
 if (res.ok && data.success && Array.isArray(data.data?.jobs)) {
 setJobs(data.data.jobs);
 }
 } catch { /* ignore */ }
 setLoading(false);
 }, [token]);

 React.useEffect(() => { void load(); }, [load]);

 const jobNameFa: Record<string, string> = {
 "warehouse-incremental": "ETL افزایشی انبار داده",
 "warehouse-full": "ETL کامل انبار داده",
 "audit-cleanup": "پاک‌سازی لاگ ممیزی قدیمی",
 "error-log-cleanup": "پاک‌سازی لاگ خطاها",
 "session-cleanup": "پاک‌سازی نشست‌های منقضی",
 "churn-signal-compute": "محاسبه سیگنال ریزش مشتری",
 "health-score-compute": "محاسبه امتیاز سلامت سازمان‌ها",
 "export_full": "پشتیبان‌گیری کامل (JSON)",
 "import_full": "بازگردانی از پشتیبان (دستی)",
 };

 const statusLabels: Record<string, { label: string; cls: string }> = {
 success: { label: "موفق", cls: "bg-success/10 text-success" },
 failed: { label: "ناموفق", cls: "bg-destructive/10 text-destructive" },
 running: { label: "در اجرا", cls: "bg-warning/10 text-warning" },
 idle: { label: "اجراشده", cls: "bg-muted text-muted-foreground" },
 };

 // اجرای دستی یک job واقعی (از طریق POST /api/platform/etl)
 const runJob = async (name: string) => {
 if (name === "import_full") {
 toast({ title: "این job دستی است", description: "برای بازگردانی از تب «مدیریت داده» فایل پشتیبان را انتخاب کنید" });
 return;
 }
 setRunningJob(name);
 try {
 const res = await fetch("/api/platform/etl", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobName: name }) });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) throw new Error(data.data?.error || data.error || "خطا");
 toast({ title: "اجرا شد", description: `${toPersianDigits(String(data.data?.recordsWritten?? 0))} رکورد در ${toPersianDigits(String(Math.round((data.data?.durationMs?? 0) / 100) / 10))} ثانیه` });
 await load();
 } catch (e) {
 toast({ variant: "destructive", title: "خطا در اجرای job", description: e instanceof Error? e.message: "نامشخص" });
 } finally {
 setRunningJob(null);
 }
 };

 return (
 <div className="space-y-5">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-lg font-bold flex items-center gap-2"><Timer className="h-5 w-5 text-emerald-500" /> مدیریت زمان‌بندی</h3>
 <Badge className="bg-warning/15 text-warning border border-warning/30">به‌زودی</Badge>
 </div>
 <p className="text-xs text-muted-foreground">
 زمان‌بندیِ خودِ پنل هنوز پیاده‌سازی نشده — کرون‌های واقعی روی سرور از طریق <span className="font-mono">crontab</span> سیستم اجرا می‌شوند
 (راهنمای کامل در <span className="font-mono">VPS_SETUP_GUIDE.md</span>). جدول زیر وضعیت واقعی job های ETL و آخرین اجرای آن‌هاست و می‌توانید هرکدام را دستی اجرا کنید.
 </p>

 {loading? (
 <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
 ): (
 <div className="grid gap-3">
 {jobs.map(job => {
 const st = statusLabels[job.status] || { label: job.status, cls: "bg-muted text-muted-foreground" };
 return (
 <Card key={job.name}>
 <CardContent className="p-3 flex items-center justify-between gap-3">
 <div className="flex items-center gap-3 min-w-0">
 <Database className="h-5 w-5 shrink-0 text-muted-foreground" />
 <div className="min-w-0">
 <p className="text-sm font-medium truncate">{jobNameFa[job.name] || job.name}</p>
 <p className="text-xs text-muted-foreground font-mono" dir="ltr">{job.schedule} · {job.source} {job.destination}</p>
 </div>
 </div>
 <div className="flex items-center gap-3 shrink-0">
 {job.lastRun && (
 <span className="text-[11px] text-muted-foreground tnum hidden sm:inline">
 آخرین اجرا: {new Date(job.lastRun).toLocaleString("fa-IR")}
 </span>
 )}
 <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.label}</Badge>
 <Button size="sm" variant="outline" onClick={() => runJob(job.name)} disabled={runningJob === job.name} title="اجرای دستی">
 {runningJob === job.name? <Loader2 className="h-3.5 w-3.5 animate-spin" />: ""}
 </Button>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}
 </div>
 );
}

/** v14 — تم و ظاهر پیش‌فرض پلتفرم (GOD): انتخاب یکی از ۱۵ تم یا رنگ‌های دلخواه
 *  که به‌عنوان تم پیش‌فرض «همهٔ کاربران» (بدون انتخاب شخصی) ثبت و ذخیره می‌شود.
 *  انتشار: ظرف ~۴۵ ثانیه برای همهٔ کاربران فعال؛ انتخاب شخصی کاربران محفوظ است. */
function ThemeDefaultTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [mode, setMode] = React.useState<"preset" | "custom">("preset");
 const [themeId, setThemeId] = React.useState<string>("navy-mint");
 const [customPrimary, setCustomPrimary] = React.useState("#12304A");
 const [customAccent, setCustomAccent] = React.useState("#19B394");
 const [saving, setSaving] = React.useState(false);
 const [loading, setLoading] = React.useState(true);

 React.useEffect(() => {
 const load = async () => {
 try {
 const res = await fetch("/api/platform/theme-default", { headers: { Authorization: `Bearer ${token}` } });
 const data = await res.json();
 if (res.ok && data.success && data.data) {
 if (data.data.mode === "custom" && data.data.custom) {
 setMode("custom");
 setCustomPrimary(data.data.custom.primary);
 setCustomAccent(data.data.custom.accent);
 } else if (data.data.themeId) {
 setMode("preset");
 setThemeId(data.data.themeId);
 }
 }
 } catch { /* پیش‌فرض‌ها */ }
 setLoading(false);
 };
 void load();
 }, [token]);

 const save = async () => {
 setSaving(true);
 try {
 const body =
 mode === "custom"
 ? { mode: "custom", custom: { primary: customPrimary, accent: customAccent } }
 : { mode: "preset", themeId };
 const res = await fetch("/api/platform/theme-default", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
 body: JSON.stringify(body),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok || !json.success) throw new Error(json.error || `کد ${res.status}`);
 toast({
 title: "تم پیش‌فرض ذخیره شد",
 description: mode === "preset"
 ? `تم «${THEMES.find((t) => t.id === themeId)?.nameFa ?? themeId}» برای همهٔ کاربران ثبت شد — کاربرانی که خودشان تمی انتخاب نکرده‌اند، ظرف حداکثر ~۴۵ ثانیه آن را می‌بینند.`
 : "رنگ‌های سفارشی برای همهٔ کاربران ثبت شد — ظرف حداکثر ~۴۵ ثانیه اعمال می‌شود.",
 });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا در ذخیره تم پیش‌فرض", description: e instanceof Error ? e.message : "نامشخص" });
 } finally {
 setSaving(false);
 }
 };

 if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

 return (
 <div className="space-y-5">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-lg font-bold flex items-center gap-2"><SwatchBook className="h-5 w-5 text-primary" /> تم و ظاهر پیش‌فرض (GOD)</h3>
 <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">۱۵ تم حرفه‌ای</Badge>
 </div>
 <p className="text-xs leading-relaxed text-muted-foreground max-w-2xl">
 تمی که اینجا انتخاب می‌کنید به‌عنوان <b>تم پیش‌فرض سایت و پنل همهٔ کاربران</b> ثبت می‌شود — لندینگ، صفحهٔ ورود و پنل کاربران. کاربرانی که خودشان از انتخابگر تم، تم شخصی برگزیده باشند، انتخابشان محفوظ می‌ماند.
 </p>

 {/* انتخاب حالت */}
 <div className="flex items-center gap-2">
 <button type="button" onClick={() => setMode("preset")} aria-pressed={mode === "preset"} className={`h-8 rounded-full border px-4 text-xs font-medium transition-all ${mode === "preset" ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border text-muted-foreground hover:bg-muted/60"}`}>از ۱۵ تم آماده</button>
 <button type="button" onClick={() => setMode("custom")} aria-pressed={mode === "custom"} className={`h-8 rounded-full border px-4 text-xs font-medium transition-all ${mode === "custom" ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border text-muted-foreground hover:bg-muted/60"}`}>رنگ‌های دلخواه (Custom)</button>
 </div>

 {mode === "preset" ? (
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5" role="radiogroup" aria-label="انتخاب تم پیش‌فرض">
 {THEMES.map((t) => {
 const selected = t.id === themeId;
 return (
 <button
 key={t.id}
 type="button"
 role="radio"
 aria-checked={selected}
 onClick={() => setThemeId(t.id)}
 className={`group relative flex flex-col overflow-hidden rounded-xl border text-right transition-all ${selected ? "border-primary shadow-md ring-1 ring-primary/30" : "border-border hover:border-primary/40 hover:shadow-sm"}`}
 >
 {/* پیش‌نمایش زندهٔ رنگ تم (ایزوله با data-theme) */}
 <span
 data-theme={t.id}
 className="flex h-16 items-center justify-center gap-1.5 border-b border-border/40"
 style={{ background: "var(--background)" }}
 >
 <span className="h-7 w-7 rounded-lg" style={{ background: "var(--primary)" }} />
 <span className="h-5 w-5 rounded-md" style={{ background: "var(--teal)" }} />
 <span className="h-3 w-3 rounded-full" style={{ background: "var(--swatch-3)" }} />
 </span>
 <span className="flex flex-col gap-0.5 p-2">
 <span className="flex items-center gap-1">
 <span className={`text-xs font-bold ${selected ? "text-primary" : "text-foreground"}`}>{t.nameFa}</span>
 {t.id ==="navy-mint"&& <Badge variant="secondary"className="h-4 px-1 text-[8px]">پیشنهاد </Badge>}
 {selected && <Check className="ms-auto h-3.5 w-3.5 text-primary" />}
 </span>
 <span className="text-[10px] leading-relaxed text-muted-foreground line-clamp-2">{t.tagline}</span>
 </span>
 </button>
 );
 })}
 </div>
 ) : (
 <Card>
 <CardHeader><CardTitle className="text-sm">رنگ‌های دلخواه برای تم پیش‌فرض همه</CardTitle></CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">رنگ اصلی (Primary)</Label>
 <div className="flex items-center gap-2">
 <input type="color" value={customPrimary} onChange={(e) => setCustomPrimary(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-border" aria-label="رنگ اصلی" />
 <Input value={customPrimary} onChange={(e) => setCustomPrimary(e.target.value)} className="h-9 font-mono" dir="ltr" />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">رنگ اکسنت (Accent)</Label>
 <div className="flex items-center gap-2">
 <input type="color" value={customAccent} onChange={(e) => setCustomAccent(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-border" aria-label="رنگ اکسنت" />
 <Input value={customAccent} onChange={(e) => setCustomAccent(e.target.value)} className="h-9 font-mono" dir="ltr" />
 </div>
 </div>
 </div>
 {/* پیش‌نمایش زنده */}
 <div className="rounded-xl border border-border p-3" style={{ background: "#F7F9FB" }}>
 <p className="mb-2 text-[10px] font-semibold text-muted-foreground">پیش‌نمایش زنده:</p>
 <div className="flex items-center gap-2">
 <span className="rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ background: customPrimary }}>دکمهٔ اصلی</span>
 <span className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: customAccent + "22", color: customAccent }}>اکسنت</span>
 <span className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "#E2E8F0", color: "#17212B", background: "#FFFFFF" }}>کارت سفید</span>
 </div>
 </div>
 <p className="text-[11px] leading-relaxed text-muted-foreground">
 خنثی‌ها (پس‌زمینهٔ ملایم، کارت سفید، حاشیهٔ سبک) از سیستم طراحی v14 حفظ می‌شوند؛ فقط رنگ اصلی و اکسنت دلخواه شما اعمال می‌شود.
 </p>
 </CardContent>
 </Card>
 )}

 <div className="flex items-center gap-2">
 <Button onClick={save} disabled={saving} className="gap-2">
 {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
 ذخیره به‌عنوان تم پیش‌فرض همهٔ کاربران
 </Button>
 <span className="text-[10px] text-muted-foreground">انتخاب شخصی کاربران همیشه مقدم است.</span>
 </div>
 </div>
 );
}

/** برندینگ و وایت‌لیبل — ذخیره/بارگذاری واقعی از /api/platform/settings/branding */
function BrandingTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [appName, setAppName] = React.useState("هوش");
 const [siteName, setSiteName] = React.useState("هوش | نرم‌افزار حسابداری هوشمند");
 const [primaryColor, setPrimaryColor] = React.useState("#10b981");
 const [domain, setDomain] = React.useState("hoosh.nobatime.ir");
 const [logoUrl, setLogoUrl] = React.useState("");
 const [footerText, setFooterText] = React.useState("");
 const [saving, setSaving] = React.useState(false);
 const [loading, setLoading] = React.useState(true);
 const [uploadingLogo, setUploadingLogo] = React.useState(false);

 // مقداردهی اولیه از GET
 React.useEffect(() => {
 const load = async () => {
 try {
 const res = await fetch("/api/platform/settings/branding", { headers: { Authorization: `Bearer ${token}` } });
 const data = await res.json();
 if (res.ok && data.success && data.data) {
 setAppName(data.data.appName || "هوش");
 setSiteName(data.data.siteName || "");
 setPrimaryColor(data.data.primaryColor || "#10b981");
 setDomain(data.data.domain || "hoosh.nobatime.ir");
 setLogoUrl(data.data.logoUrl || "");
 setFooterText(data.data.footerText || "");
 }
 } catch { /* مقادیر پیش‌فرض */ }
 setLoading(false);
 };
 void load();
 }, [token]);

 const save = async () => {
 setSaving(true);
 try {
 const res = await fetch("/api/platform/settings/branding", {
 method: "PATCH",
 headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
 body: JSON.stringify({ branding: { appName, siteName, primaryColor, domain, logoUrl, footerText } }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || `کد ${res.status}`);
 // به‌روزرسانی زنده‌ی برند در کل اپ (هدر/فوتر/مانیفست) بدون نیاز به reload
 setBrandingCache({ appName, siteName, primaryColor, domain, logoUrl, footerText });
 toast({ title: "ذخیره شد", description: "تنظیمات برندینگ ذخیره شد و برند در همه‌جا به‌روز شد" });
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا در ذخیره برندینگ",
 description: e instanceof Error? e.message: "نامشخص",
 });
 } finally {
 setSaving(false);
 }
 };

 if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

 const isDefault = appName.trim() === "هوش" && domain.trim() === "hoosh.nobatime.ir";
 const previewName = appName.trim() || "هوش";
 const previewDomain = domain.trim() || "hoosh.nobatime.ir";

 return (
 <div className="space-y-5">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-lg font-bold flex items-center gap-2"><Palette className="h-5 w-5 text-emerald-500" /> برندینگ و وایت‌لیبل (GOD)</h3>
 <Badge variant="outline" className={isDefault? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30": "bg-violet-500/10 text-violet-600 border-violet-500/30"}>
 {isDefault? "برند پیش‌فرض فعال": "برند سفارشی"}
 </Badge>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Card>
 <CardHeader><CardTitle className="text-sm">نام اپلیکیشن</CardTitle></CardHeader>
 <CardContent className="space-y-1.5">
 <Input value={appName} onChange={e => setAppName(e.target.value)} className="h-8" placeholder="هوش" />
 <p className="text-[11px] leading-relaxed text-muted-foreground">
 نام برند در هدر، فوتر، مانیفست PWA و ایمیل‌ها به‌روز می‌شود.
 </p>
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle className="text-sm">عنوان سایت (SEO)</CardTitle></CardHeader>
 <CardContent className="space-y-1.5">
 <Input value={siteName} onChange={e => setSiteName(e.target.value)} className="h-8" placeholder="هوش | نرم‌افزار حسابداری هوشمند" />
 <p className="text-[11px] leading-relaxed text-muted-foreground">
 عنوان کامل سایت؛ اگر خالی باشد الگوی «نام برند | نرم‌افزار حسابداری هوشمند» استفاده می‌شود.
 </p>
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle className="text-sm">رنگ اصلی</CardTitle></CardHeader>
 <CardContent className="space-y-1.5">
 <div className="flex items-center gap-2">
 <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-8 w-12 cursor-pointer" />
 <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-8 font-mono" dir="ltr" />
 </div>
 <p className="text-[11px] leading-relaxed text-muted-foreground">
 رنگ برند در دکمه‌های پیش‌نمایش و ایمیل‌ها اعمال می‌شود.
 </p>
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle className="text-sm">دامنه اصلی</CardTitle></CardHeader>
 <CardContent className="space-y-1.5">
 <Input value={domain} onChange={e => setDomain(e.target.value)} className="h-8" dir="ltr" placeholder="hoosh.nobatime.ir" />
 <p className="text-[11px] leading-relaxed text-muted-foreground">
 دامنه فعلی: <span className="font-mono" dir="ltr">hoosh.nobatime.ir</span> — پس از تغییر، لینک‌های ایمیل و برند در همه‌جا به‌روز می‌شوند.
 </p>
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle className="text-sm">لوگو — آپلود سریع یا آدرس (URL)</CardTitle></CardHeader>
 <CardContent className="space-y-2">
 {/* v14 — آپلود مستقیم فایل لوگو: ذخیره فوری برای همهٔ کاربران (درخواست مالک) */}
 <div className="flex items-center gap-2">
 <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[11px] font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
 <UploadIcon className="h-3.5 w-3.5" />
 آپلود فایل لوگو (PNG/JPG/WebP)
 <input
 type="file"
 accept="image/png,image/jpeg,image/webp,image/gif"
 className="sr-only"
 aria-label="انتخاب فایل لوگو"
 onChange={async (e) => {
 const file = e.target.files?.[0];
 if (!file) return;
 if (file.size > 2 * 1024 * 1024) {
 toast({ variant: "destructive", title: "حجم لوگو بیش از حد است", description: "حداکثر ۲ مگابایت." });
 return;
 }
 setUploadingLogo(true);
 try {
 const fd = new FormData();
 fd.append("logo", file);
 const res = await fetch("/api/platform/branding/logo", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}` },
 body: fd,
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok || !json.success) throw new Error(json.error || `کد ${res.status}`);
 // آپلود موفق → نسخهٔ versioned برای شکستن کش مرورگر همهٔ کاربران
 setLogoUrl(json.data.logoUrl);
 toast({
 title: "لوگو آپلود شد",
 description: "با زدن «ذخیره» برای همهٔ کاربران در همهٔ صفحه‌ها اعمال می‌شود.",
 });
 } catch (err) {
 toast({ variant: "destructive", title: "خطا در آپلود لوگو", description: err instanceof Error ? err.message : "نامشخص" });
 } finally {
 setUploadingLogo(false);
 e.target.value = "";
 }
 }}
 disabled={uploadingLogo}
 />
 {uploadingLogo && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
 </label>
 </div>
 <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} className="h-8" dir="ltr" placeholder="/uploads/logo.png" />
 <div className="flex items-center gap-2">
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-7 gap-1 text-[11px]"
 onClick={() => setLogoUrl("")}
 disabled={!logoUrl}
 >
 <RotateCcw className="h-3 w-3" />
 بازنشانی به لوگوی پیش‌فرض
 </Button>
 {logoUrl && (
 <a
 href={logoUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
 dir="ltr"
 >
 مشاهده تصویر فعلی
 </a>
 )}
 </div>
 <p className="text-[11px] leading-relaxed text-muted-foreground">
 اگر خالی باشد نشان گرادیانی «ه» نمایش داده می‌شود — اگر تصویر آدرس‌داده‌شده خراب باشد هم خودکار به همین نشان برمی‌گردیم. آپلود با نسخه‌بندی انجام می‌شود تا <b>همهٔ کاربران</b> لوگوی جدید را سریع ببینند (کش مرورگر شکسته می‌شود).
 </p>
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle className="text-sm">متن فوتر</CardTitle></CardHeader>
 <CardContent className="space-y-1.5">
 <Input value={footerText} onChange={e =>setFooterText(e.target.value)} className="h-8"placeholder="هوش — تمام حقوق محفوظ است"/>
 <p className="text-[11px] leading-relaxed text-muted-foreground">
 در صورت خالی بودن، کپی‌رایت پیش‌فرض با نام برند ساخته می‌شود.
 </p>
 </CardContent>
 </Card>
 </div>

 {/* پیش‌نمایش زنده — برند همان‌طور که در هدر صفحه فرود دیده می‌شود */}
 <Card className="overflow-hidden">
 <CardHeader>
 <CardTitle className="text-sm flex items-center gap-2">
 <Monitor className="h-4 w-4 text-violet-500" />
 پیش‌نمایش زنده
 <span className="text-[10px] font-normal text-muted-foreground">— نمایش برند در هدر صفحه فرود</span>
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="rounded-2xl border border-border bg-gradient-to-l from-emerald-500/5 via-background to-violet-500/5 p-4">
 <div className="flex items-center justify-between gap-3">
 <div className="flex items-center gap-2.5">
 <div className="relative">
 <BrandMark className="h-9 w-9 shadow-lg shadow-emerald-500/20" logoUrl={logoUrl || undefined} appName={previewName} />
 <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
 </div>
 <div className="flex flex-col">
 <span className="text-base font-bold tracking-tight leading-tight">{previewName}</span>
 <span className="text-[11px] text-muted-foreground font-mono" dir="ltr">{previewDomain}</span>
 </div>
 </div>
 <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
 <span className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-muted-foreground">ورود کاربران</span>
 <span className="inline-flex items-center rounded-md px-2.5 py-1 text-primary-foreground" style={{ backgroundColor: primaryColor }}>شروع رایگان</span>
 </div>
 </div>
 <p className="mt-3 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
 {footerText ||`${previewName} ${toPersianDigits(String(getCurrentJalaliYear()))} — تمامی حقوق محفوظ است.`}
 </p>
 </div>
 </CardContent>
 </Card>

 <Button className="gap-2" onClick={save} disabled={saving}>
 {saving? <Loader2 className="h-4 w-4 animate-spin" />: <Save className="h-4 w-4" />} ذخیره تنظیمات برندینگ
 </Button>
 </div>
 );
}

/** مدیریت داده — Export/import واقعی، نکته GDPR */
function DataManagerTab({ token }: { token: string }) {
 const [exporting, setExporting] = React.useState(false);
 const [importing, setImporting] = React.useState(false);
 const [msg, setMsg] = React.useState("");
 const [backupFile, setBackupFile] = React.useState<string | null>(null);
 const fileInputRef = React.useRef<HTMLInputElement>(null);

 const exportAll = async () => {
 setExporting(true); setMsg("");
 try {
 const res = await fetch("/api/platform/etl", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobName: "export_full" }) });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success || data.data?.status!== "success") {
 throw new Error(data.data?.error || data.error || "خطا در خروجی‌گیری");
 }
 setBackupFile(data.data?.output?.file || null);
 setMsg(` خروجی کامل تولید شد — ${toPersianDigits(String(data.data.recordsWritten))} رکورد (${data.data?.output?.file || "فایل پشتیبان"})`);
 } catch (e) {
 setMsg(` ${e instanceof Error? e.message: "خطا در خروجی‌گیری"}`);
 }
 setExporting(false);
 };

 // ورود داده از فایل JSON خروجی export_full — job واقعی import_full (idempotent)
 const importFile = async (file: File) => {
 setImporting(true); setMsg("");
 try {
 const text = await file.text();
 let data: unknown;
 try {
 data = JSON.parse(text);
 } catch {
 throw new Error("فایل JSON معتبر نیست");
 }
 const res = await fetch("/api/platform/etl", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobName: "import_full", data }) });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) {
 throw new Error(json.data?.error || json.error || "خطا در بازگردانی");
 }
 const warnings = json.data?.output?.warnings as string[] | undefined;
 setMsg(
 ` بازگردانی انجام شد — ${toPersianDigits(String(json.data.recordsWritten))} رکورد از ${toPersianDigits(String(json.data.recordsRead))} رکورد` +
 (warnings?.length? ` · ${toPersianDigits(String(warnings.length))} ردیف با هشدار رد شد`: "")
 );
 } catch (e) {
 setMsg(` ${e instanceof Error? e.message: "خطا در بازگردانی"}`);
 } finally {
 setImporting(false);
 if (fileInputRef.current) fileInputRef.current.value = "";
 }
 };

 return (
 <div className="space-y-5">
 <h3 className="text-lg font-bold flex items-center gap-2"><HardDrive className="h-5 w-5 text-emerald-500" /> مدیریت داده (GOD)</h3>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileDown className="h-4 w-4" /> خروجی کامل</CardTitle></CardHeader>
 <CardContent className="space-y-2">
 <p className="text-xs text-muted-foreground">اسنپ‌شات JSON جداول کلیدی (سازمان/کاربر/لایسنس/فاکتور/طرف حساب/کالا)</p>
 <Button size="sm" className="gap-2 w-full" onClick={exportAll} disabled={exporting}>
 {exporting? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <FileDown className="h-3.5 w-3.5" />} خروجی
 </Button>
 {backupFile && (
 <Button
 size="sm"
 variant="link"
 className="gap-1 text-xs h-auto p-0"
 onClick={() => {
 // FIX(B3): دانلود با هدر Authorization — لینک مستقیم 401 می‌گرفت
 downloadProtectedFile(`/api/platform/etl?file=${encodeURIComponent(backupFile)}`, token)
 .catch((e) => console.error("Backup download failed:", e));
 }}
 >
 <Download className="h-3 w-3" /> دانلود فایل
 </Button>
 )}
 </CardContent>
 </Card>
 <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileUp className="h-4 w-4" /> ورود داده</CardTitle></CardHeader>
 <CardContent className="space-y-2">
 <p className="text-xs text-muted-foreground">بازگردانی سازمان‌ها، کاربران و لایسنس‌ها از فایل JSON خروجی بالا (idempotent)</p>
 <input
 ref={fileInputRef}
 type="file"
 accept="application/json,.json"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) void importFile(f);
 }}
 />
 <Button size="sm" variant="outline" className="gap-2 w-full" onClick={() => fileInputRef.current?.click()} disabled={importing}>
 {importing? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <FileUp className="h-3.5 w-3.5" />} انتخاب فایل
 </Button>
 </CardContent>
 </Card>
 <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> GDPR</CardTitle></CardHeader>
 <CardContent className="space-y-2">
 <p className="text-xs text-muted-foreground">حذف کامل داده‌ی یک سازمان هنوز API ندارد — برای حذف نرم از تب «سازمان‌ها» اقدام تعلیق (Suspend) انجام می‌شود</p>
 <Button size="sm" variant="outline" className="gap-2 w-full" disabled title="API حذف داده در نسخه‌ی بعدی">
 <Trash2 className="h-3.5 w-3.5" /> حذف داده — به‌زودی
 </Button>
 </CardContent>
 </Card>
 </div>
 {msg && <p className="text-sm text-center p-3 rounded-lg bg-muted">{msg}</p>}
 </div>
 );
}

/** جعل هویت (Impersonate) — Login as any tenant/user */
function ImpersonateTab({ token, onQuickLogin }: { token: string; onQuickLogin?: (t: string, tenantName?: string) => void }) {
 const { toast } = useToast();
 const [tenants, setTenants] = React.useState<any[]>([]);
 const [users, setUsers] = React.useState<any[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [impersonating, setImpersonating] = React.useState(false);

 React.useEffect(() => {
 let cancelled = false;
 // FIX(B13): .catch اضافه شد — خطای شبکه قبلاً unhandled rejection می‌داد و تب خالی می‌ماند
 Promise.all([
 fetch("/api/platform/tenants", { headers: { Authorization: `Bearer ${token}` } })
 .then(r => r.json()).then(d => { if (!cancelled) setTenants(d.data?? []); })
 .catch(() => { if (!cancelled) setTenants([]); }),
 fetch("/api/platform/users", { headers: { Authorization: `Bearer ${token}` } })
 .then(r => r.json()).then(d => { if (!cancelled) setUsers(d.data?? []); })
 .catch(() => { if (!cancelled) setUsers([]); }),
 ]).finally(() => { if (!cancelled) setLoading(false); });
 return () => { cancelled = true; };
 }, [token]);

 // ورود به‌عنوان کاربرِ مشخص — PATCH /api/platform/users {userId, action:"impersonate"}
 // (نشست واقعی همان کاربر ساخته می‌شود؛ برخلاف quick-login که کاربر جدید می‌ساخت)
 const impersonate = async (userId: string) => {
 setImpersonating(true);
 try {
 const res = await fetch("/api/platform/users", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: "impersonate" }) });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success ||!data.token) {
 throw new Error(data.error || "ورود به‌عنوان این کاربر ممکن نیست");
 }
 if (onQuickLogin) {
 onQuickLogin(data.token, data.tenant?.name);
 }
 toast({ title: "ورود موفق", description: data.message || `به‌عنوان ${data.user?.name || data.user?.username || "کاربر"} وارد شدید` });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا در جعل هویت", description: e instanceof Error? e.message: "نامشخص" });
 } finally {
 setImpersonating(false);
 }
 };

 if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

 return (
 <div className="space-y-5">
 <h3 className="text-lg font-bold flex items-center gap-2"><UserSearch className="h-5 w-5 text-emerald-500" /> جعل هویت — ورود به حساب هر کاربر (GOD)</h3>
 <p className="text-sm text-muted-foreground">به‌عنوان سوپرادمین، می‌توانید به حساب هر کاربر یا سازمان ورود کنید بدون نیاز به رمز عبور.</p>

 <Card>
 <CardHeader><CardTitle className="text-sm">سازمان‌ها و کاربران</CardTitle></CardHeader>
 <CardContent>
 <div className="space-y-3">
 {tenants.map((t: any) => (
 <div key={t.id} className="p-3 rounded-lg border border-border">
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-2">
 <Building2 className="h-4 w-4 text-muted-foreground" />
 <span className="font-medium text-sm">{t.name}</span>
 <Badge variant="outline" className="text-xs">{t.plan}</Badge>
 </div>
 <Badge variant={t.status === "active"? "default": "destructive"} className="text-xs">{t.status === "active"? "فعال": "غیرفعال"}</Badge>
 </div>
 <div className="flex flex-wrap gap-2">
 {users.filter((u: any) => u.tenantId === t.id).map((u: any) => (
 <Button key={u.id} size="sm" variant="outline" className="gap-1 text-xs" onClick={() => impersonate(u.id)} disabled={impersonating}>
 <UserPlus className="h-3 w-3" /> {u.name || u.username || u.email}
 </Button>
 ))}
 {users.filter((u: any) => u.tenantId === t.id).length === 0 && <span className="text-xs text-muted-foreground">کاربری یافت نشد</span>}
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

/** تلفیق مالی — Multi-tenant financial consolidation (داده واقعی از /api/platform/consolidation) */
function ConsolidationTab({ token }: { token: string }) {
 const [data, setData] = React.useState<{
 totals: { totalRevenueToman: number; totalExpensesToman: number; netProfitToman: number; outstandingReceivablesToman: number; paidInvoiceCount: number; expenseCount: number; tenantCount: number };
 tenants: Array<{ tenantId: string; name: string; plan: string | null; revenueToman: number; expensesToman: number; profitToman: number; paidInvoiceCount: number }>;
 generatedAt: string;
 } | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);

 React.useEffect(() => {
 fetch("/api/platform/consolidation", { headers: { Authorization: `Bearer ${token}` } })
.then(r => r.json())
.then(d => {
 if (d.success) setData(d.data);
 else setError(d.error || "خطا در دریافت داده");
 })
.catch(() => setError("خطا در دریافت داده"))
.finally(() => setLoading(false));
 }, [token]);

 if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
 if (error ||!data) {
 return <div className="flex flex-col items-center justify-center py-16 gap-2">
 <AlertTriangle className="h-7 w-7 text-warning" />
 <p className="text-sm text-muted-foreground">{error || "داده‌ای یافت نشد"}</p>
 </div>;
 }

 const t = data.totals;

 return (
 <div className="space-y-5">
 <h3 className="text-lg font-bold flex items-center gap-2"><Crown className="h-5 w-5 text-emerald-500" /> تلفیق مالی چندسازمانی (GOD)</h3>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <StatCard icon={TrendingUp} label="کل درآمد (فاکتور پرداخت‌شده)" value={formatCompactToman(t.totalRevenueToman)} sub={`${toPersianDigits(String(t.paidInvoiceCount))} فاکتور`} accent="primary" />
 <StatCard icon={TrendingDown} label="کل هزینه" value={formatCompactToman(t.totalExpensesToman)} sub={`${toPersianDigits(String(t.expenseCount))} ثبت هزینه`} accent="destructive" />
 <StatCard icon={Activity} label="سود خالص" value={formatCompactToman(t.netProfitToman)} sub="درآمد − هزینه" accent={t.netProfitToman >= 0? "success": "warning"} />
 <StatCard icon={FileText} label="مطالبات معوق" value={formatCompactToman(t.outstandingReceivablesToman)} sub="فاکتورهای صادرشده پرداخت‌نشده" accent="warning" />
 </div>

 <Card>
 <CardHeader className="flex flex-row items-center justify-between">
 <CardTitle className="text-sm">۱۰ سازمان برتر (بر اساس درآمد)</CardTitle>
 <span className="text-[11px] text-muted-foreground">محاسبه: {data.generatedAt? new Date(data.generatedAt).toLocaleString("fa-IR"): "—"}</span>
 </CardHeader>
 <CardContent>
 {data.tenants.length === 0? (
 <p className="text-sm text-muted-foreground text-center py-8">هنوز فاکتور پرداخت‌شده‌ای ثبت نشده است</p>
 ): (
 <div className="space-y-2">
 {data.tenants.map((t2) => (
 <div key={t2.tenantId} className="flex items-center justify-between gap-2 p-2 rounded border border-border text-sm">
 <span className="flex items-center gap-2 min-w-0"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate">{t2.name}</span>
 {t2.plan && <Badge variant="outline" className="text-[10px] shrink-0">{PLAN_LABELS[t2.plan] || t2.plan}</Badge>}
 </span>
 <span className="font-mono tnum shrink-0" dir="ltr">
 <span className="text-success">{t2.revenueToman.toLocaleString("fa-IR")}</span>
 <span className="text-muted-foreground"> / </span>
 <span className="text-destructive">{t2.expensesToman.toLocaleString("fa-IR")}</span>
 <span className="text-muted-foreground"> تومان</span>
 </span>
 </div>
 ))}
 <p className="text-[10px] text-muted-foreground text-start">اعداد: درآمد / هزینه — مبالغ فاکتور به ریال ذخیره می‌شوند و اینجا به تومان نمایش داده می‌شوند.</p>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
}

/** مرکز تهدیدات — SOC با داده واقعی از threat-hunt/siem/security-audit + فید LOGIN_BLOCKED_IP */
function ThreatCenterTab({ token }: { token: string }) {
 const [blockedEvents, setBlockedEvents] = React.useState<any[]>([]);
 const [threatReports, setThreatReports] = React.useState<any[]>([]);
 const [siemStats, setSiemStats] = React.useState<{ totalEvents: number; criticalCount: number; warningCount: number; last24hCount: number } | null>(null);
 const [siemEvents, setSiemEvents] = React.useState<any[]>([]);
 const [auditReport, setAuditReport] = React.useState<{ criticalCount: number; warningCount: number; passCount: number; lastRunAt: string | null } | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [scanning, setScanning] = React.useState(false);
 const { toast } = useToast();

 const load = React.useCallback(async () => {
 const safeFetch = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json().catch(() => ({}))).catch(() => ({}));
 const [audit, hunt, siemStats, siemEvents, secAudit] = await Promise.all([
 safeFetch("/api/platform/audit?limit=20&action=LOGIN_BLOCKED_IP"),
 safeFetch("/api/platform/threat-hunt"),
 safeFetch("/api/platform/siem?mode=stats"),
 safeFetch("/api/platform/siem?limit=10"),
 safeFetch("/api/platform/security-audit"),
 ]);
 if (audit.success) setBlockedEvents(Array.isArray(audit.data)? audit.data: []);
 if (hunt.success && Array.isArray(hunt.data)) setThreatReports(hunt.data);
 if (siemStats.success) setSiemStats(siemStats.data);
 if (siemEvents.success && Array.isArray(siemEvents.data)) setSiemEvents(siemEvents.data);
 if (secAudit.success) {
 setAuditReport({
 criticalCount: secAudit.data?.report?.criticalCount?? 0,
 warningCount: secAudit.data?.report?.warningCount?? 0,
 passCount: secAudit.data?.report?.passCount?? 0,
 lastRunAt: secAudit.data?.lastRunAt?? null,
 });
 }
 setLoading(false);
 }, [token]);

 React.useEffect(() => { void load(); }, [load]);

 // اسکن امنیتی واقعی — POST /api/platform/threat-hunt
 const runScan = async () => {
 setScanning(true);
 try {
 const res = await fetch("/api/platform/threat-hunt", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) throw new Error(data.error || "خطا در اسکن");
 const s = data.data?.summary;
 toast({
 title: "اسکن کامل شد",
 description: s? `${toPersianDigits(String(s.totalThreats))} تهدید (${toPersianDigits(String(s.critical))} بحرانی) در ${toPersianDigits(String(Math.round(s.durationMs / 100) / 10))} ثانیه`: "اسکن انجام شد",
 });
 await load();
 } catch (e) {
 toast({ variant: "destructive", title: "خطا در اسکن", description: e instanceof Error? e.message: "نامشخص" });
 } finally {
 setScanning(false);
 }
 };

 // سطح حفاظتی از نتایج واقعی ممیزی امنیتی
 const protectionLevel = auditReport
? auditReport.criticalCount === 0 && auditReport.warningCount <= 2
? "بالا"
: auditReport.criticalCount === 0
? "متوسط"
: "نیازمند توجه"
: "—";

 return (
 <div className="space-y-5">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <h3 className="text-lg font-bold flex items-center gap-2"><Swords className="h-5 w-5 text-red-500" /> مرکز تهدیدات — SOC (GOD)</h3>
 <Button size="sm" variant="outline" className="gap-1" onClick={runScan} disabled={scanning}>
 {scanning? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Swords className="h-3.5 w-3.5" />} اسکن امنیتی
 </Button>
 </div>

 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <Card className="border-red-200"><CardContent className="p-4 text-center">
 <Siren className="h-7 w-7 mx-auto mb-2 text-red-500" />
 <p className="text-2xl font-bold tnum">{toPersianDigits(String(blockedEvents.length))}</p>
 <p className="text-xs text-muted-foreground">IP مسدودشده (ورود مسدود)</p>
 </CardContent></Card>
 <Card className="border-amber-200"><CardContent className="p-4 text-center">
 <AlertTriangle className="h-7 w-7 mx-auto mb-2 text-amber-500" />
 <p className="text-2xl font-bold tnum">{toPersianDigits(String(threatReports.length))}</p>
 <p className="text-xs text-muted-foreground">گزارش تهدید (threat-hunt)</p>
 </CardContent></Card>
 <Card className="border-amber-200"><CardContent className="p-4 text-center">
 <Activity className="h-7 w-7 mx-auto mb-2 text-amber-500" />
 <p className="text-2xl font-bold tnum">{siemStats? toPersianDigits(String(siemStats.totalEvents)): "—"}</p>
 <p className="text-xs text-muted-foreground">رویداد SIEM {siemStats? `(${toPersianDigits(String(siemStats.criticalCount))} بحرانی)`: ""}</p>
 </CardContent></Card>
 <Card className="border-emerald-200"><CardContent className="p-4 text-center">
 <ShieldCheck className="h-7 w-7 mx-auto mb-2 text-emerald-500" />
 <p className="text-2xl font-bold">{protectionLevel}</p>
 <p className="text-xs text-muted-foreground">
 ممیزی: {auditReport? `${toPersianDigits(String(auditReport.criticalCount))} بحرانی / ${toPersianDigits(String(auditReport.warningCount))} هشدار`: "—"}
 </p>
 </CardContent></Card>
 </div>

 <Card>
 <CardHeader><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> تلاش‌های ورود مسدودشده (LOGIN_BLOCKED_IP)</CardTitle></CardHeader>
 <CardContent>
 {blockedEvents.length === 0? (
 <p className="text-sm text-muted-foreground text-center py-6">هیچ تلاش ورود مسدودشده‌ای ثبت نشده است </p>
 ): (
 <div className="space-y-2">
 {blockedEvents.map((e: any, i: number) => (
 <div key={e.id?? i} className="flex items-center justify-between p-2 rounded border border-border text-xs">
 <span className="text-muted-foreground">{e.action}</span>
 <span className="font-mono">{e.ipAddress?? "—"}</span>
 <span className="text-muted-foreground">{e.createdAt? new Date(e.createdAt).toLocaleDateString("fa-IR"): ""}</span>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <Card>
 <CardHeader><CardTitle className="text-sm">گزارش‌های تهدید اخیر</CardTitle></CardHeader>
 <CardContent>
 {threatReports.length === 0? (
 <p className="text-xs text-muted-foreground text-center py-4">هیچ تهدید فعالی یافت نشد — با دکمه «اسکن امنیتی» اسکن جدید اجرا کنید</p>
 ): (
 <div className="space-y-2">
 {threatReports.slice(0, 8).map((r: any, i: number) => (
 <div key={r.id?? i} className="flex items-center justify-between p-2 rounded border border-border text-xs">
 <span className="truncate">{r.title || r.name || r.type || "تهدید"}</span>
 <Badge variant="outline" className={`text-[10px] ${r.severity === "critical"? "bg-destructive/10 text-destructive": r.severity === "high"? "bg-warning/10 text-warning": "bg-muted text-muted-foreground"}`}>{r.severity || "—"}</Badge>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle className="text-sm">رویدادهای SIEM</CardTitle></CardHeader>
 <CardContent>
 {siemEvents.length === 0? (
 <p className="text-xs text-muted-foreground text-center py-4">رویداد امنیتی ثبت نشده است</p>
 ): (
 <div className="space-y-2">
 {siemEvents.slice(0, 8).map((e: any, i: number) => (
 <div key={e.id?? i} className="flex items-center justify-between p-2 rounded border border-border text-xs">
 <span className="truncate">{e.type || e.eventType || "رویداد"}</span>
 <span className="font-mono text-muted-foreground">{e.createdAt? new Date(e.createdAt).toLocaleString("fa-IR"): ""}</span>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 </div>
 );
}

// ══════════════════════════════════════════════════════════
// کنترل سراسری (GOD) — قدرتمندترین ابزار مدیریت
// ══════════════════════════════════════════════════════════
function GlobalControlTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [maintenanceMode, setMaintenanceMode] = React.useState(false);
 const [readOnlyMode, setReadOnlyMode] = React.useState(false);
 const [debugMode, setDebugMode] = React.useState(false);
 const [toggling, setToggling] = React.useState<string | null>(null);
 const [forceLogoutAll, setForceLogoutAll] = React.useState(false);
 const [exporting, setExporting] = React.useState(false);
 const [generatingReport, setGeneratingReport] = React.useState(false);
 const [stats, setStats] = React.useState<any>(null);
 const [loading, setLoading] = React.useState(true);

 // مقداردهی اولیه: آمار + وضعیت واقعی maintenance/readOnly/debugMode از settings/platform
 React.useEffect(() => {
 Promise.all([
 apiFetch("/api/platform/stats", token).then(r => r.json()).catch(() => ({})),
 apiFetch("/api/platform/settings/platform", token).then(r => r.json()).catch(() => ({})),
 ]).then(([statsData, platformData]) => {
 if (statsData.success) setStats(statsData.data);
 if (platformData.success && platformData.data) {
 setMaintenanceMode(!!platformData.data.maintenance?.enabled);
 setReadOnlyMode(!!platformData.data.readOnly?.enabled);
 setDebugMode(!!platformData.data.debugMode?.enabled);
 }
 }).finally(() => setLoading(false));
 }, [token]);

 // حالت تعمیرات — PATCH واقعی /api/platform/settings/platform {maintenance:{enabled}}
 const handleMaintenanceToggle = async () => {
 setToggling("maintenance");
 try {
 const res = await apiFetch("/api/platform/settings/platform", token, {
 method: "PATCH",
 body: JSON.stringify({ maintenance: { enabled:!maintenanceMode } }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || `کد ${res.status}`);
 setMaintenanceMode(!maintenanceMode);
 toast({ title:!maintenanceMode? "حالت تعمیرات فعال شد": "حالت تعمیرات غیرفعال شد", description:!maintenanceMode? "کاربران عادی پیام تعمیرات می‌بینند": undefined });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا", description: e instanceof Error? e.message: "عملیات ناموفق" });
 } finally {
 setToggling(null);
 }
 };

 // حالت فقط‌خواندنی — ذخیره‌شده در سرور (readOnly.enabled)
 const handleReadOnlyToggle = async () => {
 setToggling("readonly");
 try {
 const res = await apiFetch("/api/platform/settings/platform", token, {
 method: "PATCH",
 body: JSON.stringify({ readOnly: { enabled:!readOnlyMode } }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || `کد ${res.status}`);
 setReadOnlyMode(!readOnlyMode);
 toast({ title: readOnlyMode? "حالت فقط‌خواندنی غیرفعال شد": "حالت فقط‌خواندنی فعال شد" });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا", description: e instanceof Error? e.message: "عملیات ناموفق" });
 } finally {
 setToggling(null);
 }
 };

 // حالت دیباگ — ذخیره‌شده در سرور (debugMode.enabled)
 const handleDebugToggle = async () => {
 setToggling("debug");
 try {
 const res = await apiFetch("/api/platform/settings/platform", token, {
 method: "PATCH",
 body: JSON.stringify({ debugMode: { enabled:!debugMode } }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || `کد ${res.status}`);
 setDebugMode(!debugMode);
 toast({ title: debugMode? "حالت دیباگ غیرفعال شد": "حالت دیباگ فعال شد" });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا", description: e instanceof Error? e.message: "عملیات ناموفق" });
 } finally {
 setToggling(null);
 }
 };

 // باطل‌کردن همه نشست‌ها — DELETE واقعی /api/platform/sessions
 const handleForceLogoutAllUsers = async () => {
 if (!confirm("آیا مطمئن هستید؟ همه نشست‌های کاربران باطل می‌شود.")) return;
 setForceLogoutAll(true);
 try {
 const res = await apiFetch("/api/platform/sessions", token, { method: "DELETE" });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || "خطا در باطل‌کردن نشست‌ها");
 toast({
 title: "تمام نشست‌ها باطل شد",
 description: `${toPersianDigits(String(json.data?.revoked?? 0))} نشست فعال باطل و ${toPersianDigits(String(json.data?.purged?? 0))} نشست منقضی پاک شد`,
 });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا", description: e instanceof Error? e.message: "عملیات ناموفق" });
 } finally {
 setForceLogoutAll(false);
 }
 };

 // خروجی کامل دیتابیس — job واقعی export_full با بررسی پاسخ
 const handleExportAll = async () => {
 setExporting(true);
 try {
 const res = await apiFetch("/api/platform/etl", token, {
 method: "POST",
 body: JSON.stringify({ jobName: "export_full" }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success || json.data?.status!== "success") {
 throw new Error(json.data?.error || json.error || "خطا در خروجی‌گیری");
 }
 toast({
 title: "خروجی کامل ساخته شد",
 description: `${toPersianDigits(String(json.data.recordsWritten))} رکورد ${json.data?.output?.file || "backups/"} (قابل دانلود از تب مدیریت دیتابیس)`,
 });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا در خروجی‌گیری", description: e instanceof Error? e.message: "نامشخص" });
 } finally {
 setExporting(false);
 }
 };

 // پاک‌سازی کش سئو — با بررسی res.ok && json.success
 const handleClearSeoCache = async () => {
 try {
 const res = await apiFetch("/api/seo/revalidate", token, {
 method: "POST",
 body: JSON.stringify({ tag: "all" }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || `کد ${res.status}`);
 const cnt = (json.data?.revalidatedPaths?.length?? 0) + (json.data?.revalidatedTags?.length?? 0);
 toast({ title: "کش سئو پاک شد", description: `${toPersianDigits(String(cnt))} مسیر/تگ revalidate شد` });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا در پاک‌سازی کش", description: e instanceof Error? e.message: "نامشخص" });
 }
 };

 // گزارش سلامت سیستم — GET /api/health/detailed + دانلود فایل JSON سمت کلاینت
 const handleHealthReport = async () => {
 setGeneratingReport(true);
 try {
 const res = await apiFetch("/api/health/detailed", token);
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || `کد ${res.status}`);

 // خلاصه‌ی خوانا + فایل کامل
 const svcs = json.services || {};
 const summary = {
 generatedAt: new Date().toISOString(),
 status: json.status,
 uptimeSeconds: json.uptime,
 database: svcs.database?.status,
 databaseLatencyMs: svcs.database?.latencyMs,
 ai: svcs.ai?.status,
 realtime: svcs.realtime?.status,
 diskPercent: json.disk?.percentUsed,
 warnings: json.warnings || [],
 };
 const report = { summary, full: json };
 const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `hoshhesab-health-report-${new Date().toISOString().slice(0, 10)}.json`;
 document.body.appendChild(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(url);

 toast({
 title: "گزارش سلامت تولید و دانلود شد",
 description: `وضعیت: ${json.status === "healthy"? "سالم ": json.status === "degraded"? "کم‌کار ": "قطع "} — دیتابیس: ${svcs.database?.status === "up"? "سالم": "خطا"}`,
 });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا در تولید گزارش", description: e instanceof Error? e.message: "نامشخص" });
 } finally {
 setGeneratingReport(false);
 }
 };

 return (
 <div className="space-y-5">
 <h3 className="text-lg font-bold flex items-center gap-2"><Zap className="h-5 w-5 text-amber-500" /> کنترل سراسری پلتفرم (GOD)</h3>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <Card className="border-amber-200">
 <CardContent className="p-4">
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm font-medium">حالت تعمیرات</span>
 <Button variant={maintenanceMode? "destructive": "outline"} size="sm" onClick={handleMaintenanceToggle} disabled={toggling === "maintenance"}>
 {toggling === "maintenance"? <Loader2 className="h-3 w-3 animate-spin" />: maintenanceMode? "فعال": "غیرفعال"}
 </Button>
 </div>
 <p className="text-xs text-muted-foreground">فعال‌سازی حالت تعمیرات — فقط سوپرادمین دسترسی دارد</p>
 </CardContent>
 </Card>
 <Card className="border-amber-200">
 <CardContent className="p-4">
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm font-medium">حالت فقط‌خواندنی</span>
 <Button variant={readOnlyMode? "destructive": "outline"} size="sm" onClick={handleReadOnlyToggle} disabled={toggling === "readonly"}>
 {toggling === "readonly"? <Loader2 className="h-3 w-3 animate-spin" />: readOnlyMode? "فعال": "غیرفعال"}
 </Button>
 </div>
 <p className="text-xs text-muted-foreground">جلوگیری از هرگونه نوشتن در دیتابیس</p>
 </CardContent>
 </Card>
 <Card className="border-amber-200">
 <CardContent className="p-4">
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm font-medium">حالت دیباگ</span>
 <Button variant={debugMode? "destructive": "outline"} size="sm" onClick={handleDebugToggle} disabled={toggling === "debug"}>
 {toggling === "debug"? <Loader2 className="h-3 w-3 animate-spin" />: debugMode? "فعال": "غیرفعال"}
 </Button>
 </div>
 <p className="text-xs text-muted-foreground">لاگ‌های تفصیلی و اطلاعات حساس نمایش داده می‌شود</p>
 </CardContent>
 </Card>
 <Card className="border-red-200">
 <CardContent className="p-4">
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm font-medium">بطلال همه نشست‌ها</span>
 <Button variant="destructive" size="sm" onClick={handleForceLogoutAllUsers} disabled={forceLogoutAll}>
 {forceLogoutAll? <Loader2 className="h-3 w-3 animate-spin" />: <LogOut className="h-3 w-3" />}
 اخراج همه
 </Button>
 </div>
 <p className="text-xs text-muted-foreground">بطلال نشست تمام کاربران — عملیات مخرب</p>
 </CardContent>
 </Card>
 </div>

 <Card>
 <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> آمار لحظه‌ای پلتفرم</CardTitle></CardHeader>
 <CardContent>
 {loading? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>: stats? (
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <div className="text-center"><p className="text-2xl font-bold tnum">{toPersianDigits(String(stats.counts?.tenants?? 0))}</p><p className="text-xs text-muted-foreground">سازمان</p></div>
 <div className="text-center"><p className="text-2xl font-bold tnum">{toPersianDigits(String(stats.counts?.users?? 0))}</p><p className="text-xs text-muted-foreground">کاربر</p></div>
 <div className="text-center"><p className="text-2xl font-bold tnum">{toPersianDigits(String(stats.counts?.licenses?? 0))}</p><p className="text-xs text-muted-foreground">لایسنس</p></div>
 <div className="text-center"><p className="text-2xl font-bold tnum">{toPersianDigits(String(stats.counts?.invoices?? 0))}</p><p className="text-xs text-muted-foreground">فاکتور</p></div>
 </div>
 ): <p className="text-sm text-muted-foreground text-center">داده‌ای موجود نیست</p>}
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Card>
 <CardHeader><CardTitle className="text-sm"> اقدامات سریع GOD</CardTitle></CardHeader>
 <CardContent className="space-y-2">
 <Button className="w-full justify-start" variant="outline" size="sm" onClick={handleExportAll} disabled={exporting}>
 {exporting? <Loader2 className="h-4 w-4 me-2 animate-spin" />: <Download className="h-4 w-4 me-2" />} خروجی کامل دیتابیس
 </Button>
 <Button className="w-full justify-start" variant="outline" size="sm" onClick={handleClearSeoCache}>
 <RefreshCw className="h-4 w-4 me-2" /> پاک‌سازی کش سئو
 </Button>
 <Button className="w-full justify-start" variant="outline" size="sm" onClick={handleHealthReport} disabled={generatingReport}>
 {generatingReport? <Loader2 className="h-4 w-4 me-2 animate-spin" />: <Activity className="h-4 w-4 me-2" />} گزارش سلامت سیستم (دانلود)
 </Button>
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle className="text-sm"> قدرت‌های GOD</CardTitle></CardHeader>
 <CardContent className="space-y-2 text-xs text-muted-foreground">
 <p> مشاهده و تغییر تمام سازمان‌ها و کاربران</p>
 <p> ورود فوری به هر حساب (Impersonate)</p>
 <p> بطلال نشست‌ها و مسدودسازی IP</p>
 <p> مدیریت لایسنس‌ها و فعال‌سازی دستی</p>
 <p> تغییر تنظیمات پلتفرم و درگاه پرداخت</p>
 <p> خروجی/ورودی داده و پاک‌سازی کش</p>
 <p> فعال‌سازی حالت تعمیرات و فقط‌خواندنی</p>
 <p> دیپلوی، ریستارت سرور و مدیریت کارهای زمان‌بندی</p>
 <p> مانیتور سیستم و مدیریت دیتابیس</p>
 <p> برندینگ و وایت‌لیبل پلتفرم</p>
 </CardContent>
 </Card>
 </div>
 </div>
 );
}

// ══════════════════════════════════════════════════════════
// API گیت‌وی (GOD) — نقشه روت‌ها (توصیفی) + آمار واقعی از ip-blocks/analytics
// نکته: مدیریت عملیاتی API Key (ساخت/حذف) هنوز پیاده‌سازی نشده — کنترل‌ها غیرفعال و صادقانه «به‌زودی» هستند.
// ══════════════════════════════════════════════════════════
function APIGatewayTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [blockedIpCount, setBlockedIpCount] = React.useState<number | null>(null);
 const [activeUsers, setActiveUsers] = React.useState<number | null>(null);
 const [loading, setLoading] = React.useState(true);

 React.useEffect(() => {
 // آمار واقعی: IPهای مسدود + کاربران فعال — بدون فراخوانی بی‌هدف /users
 Promise.all([
 apiFetch("/api/platform/ip-blocks", token).then(r => r.json()).catch(() => ({})),
 apiFetch("/api/platform/analytics/realtime", token).then(r => r.json()).catch(() => ({})),
 ]).then(([blocks, realtime]) => {
 if (blocks.success && Array.isArray(blocks.data)) setBlockedIpCount(blocks.data.length);
 if (realtime.success) setActiveUsers(realtime.data?.activeUsers?? 0);
 }).finally(() => setLoading(false));
 }, [token]);

 const routes = [
 { path: "/api/auth/*", method: "POST", rateLimit: "10/min", auth: "لاگین", status: "فعال" },
 { path: "/api/platform/*", method: "ALL", rateLimit: "5/min", auth: "سوپرادمین", status: "نمونه — فعال‌سازی نیازمند middleware" },
 { path: "/api/ai/*", method: "POST", rateLimit: "20/min", auth: "کاربر", status: "فعال" },
 { path: "/api/accounting/*", method: "ALL", rateLimit: "60/min", auth: "کاربر", status: "فعال" },
 { path: "/api/dashboard", method: "GET", rateLimit: "30/min", auth: "کاربر", status: "فعال" },
 { path: "/api/integrations/*", method: "ALL", rateLimit: "10/min", auth: "کاربر", status: "فعال" },
 { path: "/api/health", method: "GET", rateLimit: "100/min", auth: "بدون", status: "فعال" },
 { path: "/api/og", method: "GET", rateLimit: "100/min", auth: "بدون", status: "فعال" },
 ];

 return (
 <div className="space-y-5">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-lg font-bold flex items-center gap-2"><Network className="h-5 w-5 text-amber-500" /> API گیت‌وی و مدیریت دسترسی</h3>
 <Badge className="bg-warning/15 text-warning border border-warning/30">به‌زودی</Badge>
 </div>

 <Card>
 <CardHeader>
 <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> نقشه روت‌ها و Rate Limits</CardTitle>
 <CardDescription className="text-xs">توصیف امنیتی مسیرهای اصلی — مدیریت پویا در نسخه‌ی بعدی</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b border-border">
 <th className="text-start p-2">مسیر</th>
 <th className="text-start p-2">متد</th>
 <th className="text-start p-2">Rate Limit</th>
 <th className="text-start p-2">احراز هویت</th>
 <th className="text-start p-2">وضعیت</th>
 </tr>
 </thead>
 <tbody>
 {routes.map((r, i) => (
 <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
 <td className="p-2 font-mono text-primary">{r.path}</td>
 <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.method}</Badge></td>
 <td className="p-2">{r.rateLimit}</td>
 <td className="p-2"><Badge variant="secondary" className="text-[10px]">{r.auth}</Badge></td>
 <td className="p-2"><Badge variant="default" className="text-[10px] bg-emerald-600">{r.status}</Badge></td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Card>
 <CardHeader><CardTitle className="text-sm flex items-center gap-2"> ساخت API Key جدید
 <Badge variant="outline" className="text-[10px] text-warning border-warning/40">به‌زودی</Badge>
 </CardTitle></CardHeader>
 <CardContent className="space-y-3">
 <Input placeholder="نام کلید (مثلاً: integration-woocommerce)" disabled value="" dir="ltr" />
 <Button size="sm" disabled onClick={() => toast({ title: "به‌زودی", description: "ساخت API Key در نسخه‌ی بعدی فعال می‌شود" })}>
 <Plus className="h-3 w-3 me-1" /> ساخت
 </Button>
 <p className="text-[11px] text-muted-foreground">ساخت و مدیریت کلید API هنوز در دسترس نیست.</p>
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle className="text-sm"> آمار API (زنده)</CardTitle></CardHeader>
 <CardContent>
 {loading? (
 <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
 ): (
 <div className="grid grid-cols-2 gap-3 text-center">
 <div><p className="text-lg font-bold tnum">{toPersianDigits(String(routes.length))}</p><p className="text-xs text-muted-foreground">گروه روت</p></div>
 <div><p className="text-lg font-bold tnum">{activeUsers!== null? toPersianDigits(String(activeUsers)): "—"}</p><p className="text-xs text-muted-foreground">کاربر فعال (realtime)</p></div>
 <div><p className="text-lg font-bold tnum">{toPersianDigits("۳")}</p><p className="text-xs text-muted-foreground">سطح احراز</p></div>
 <div><p className="text-lg font-bold tnum">{blockedIpCount!== null? toPersianDigits(String(blockedIpCount)): "—"}</p><p className="text-xs text-muted-foreground">IP مسدود</p></div>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 </div>
 );
}

// ══════════════════════════════════════════════════════════
// کش و پردفرمانس (GOD) — مدیریت کش، حافظه و عملکرد
// ══════════════════════════════════════════════════════════
function CachePerformanceTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [perfData, setPerfData] = React.useState<any>(null);
 const [loading, setLoading] = React.useState(true);

 React.useEffect(() => {
 // FIX(B13): .catch اضافه شد — خطای شبکه قبلاً unhandled rejection می‌داد
 apiFetch("/api/platform/performance", token)
.then(r => r.json())
.then(d => { if (d.success) setPerfData(d.data); })
.catch(() => {
 /* خطا — داده خالی می‌ماند و loading تمام می‌شود */
 })
.finally(() => setLoading(false));
 }, [token]);

 const handleClearCache = async (type: string) => {
 try {
 const res = await apiFetch("/api/seo/revalidate", token, {
 method: "POST",
 body: JSON.stringify({ tag: type }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) {
 throw new Error(json.error || `کد ${res.status}`);
 }
 const cnt = (json.data?.revalidatedPaths?.length?? 0) + (json.data?.revalidatedTags?.length?? 0);
 toast({ title: "کش پاک شد", description: `${type} — ${toPersianDigits(String(cnt))} مسیر/تگ revalidate شد` });
 } catch (e) {
 toast({ variant: "destructive", title: "خطا در پاک‌سازی کش", description: e instanceof Error? e.message: "نامشخص" });
 }
 };

 return (
 <div className="space-y-5">
 <h3 className="text-lg font-bold flex items-center gap-2"><Gauge className="h-5 w-5 text-amber-500" /> کش و پردفرمانس (GOD)</h3>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Card className="border-emerald-200">
 <CardContent className="p-4 text-center">
 <Cpu className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
 <p className="text-2xl font-bold tnum">{perfData? toPersianDigits(String(Math.round(perfData.cpu?.usage?? 0))) + "%": "—"}</p>
 <p className="text-xs text-muted-foreground">CPU</p>
 </CardContent>
 </Card>
 <Card className="border-blue-200">
 <CardContent className="p-4 text-center">
 <MemoryStick className="h-8 w-8 mx-auto mb-2 text-blue-500" />
 <p className="text-2xl font-bold tnum">{perfData? toPersianDigits(String(Math.round(perfData.memory?.usedPercent?? 0))) + "%": "—"}</p>
 <p className="text-xs text-muted-foreground">حافظه</p>
 </CardContent>
 </Card>
 <Card className="border-amber-200">
 <CardContent className="p-4 text-center">
 <Timer className="h-8 w-8 mx-auto mb-2 text-amber-500" />
 <p className="text-2xl font-bold tnum">{perfData? toPersianDigits(String(Math.round(perfData.uptime?.seconds? perfData.uptime.seconds / 3600: 0))) + "h": "—"}</p>
 <p className="text-xs text-muted-foreground">آپتایم</p>
 </CardContent>
 </Card>
 </div>

 <Card>
 <CardHeader><CardTitle className="text-sm flex items-center gap-2"><RefreshCw className="h-4 w-4" /> مدیریت کش</CardTitle></CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <Button variant="outline" size="sm" onClick={() => handleClearCache("all")} className="w-full">
 <RefreshCw className="h-3 w-3 me-1" /> پاک‌سازی کش کامل
 </Button>
 <Button variant="outline" size="sm" onClick={() => handleClearCache("seo")} className="w-full">
 <RefreshCw className="h-3 w-3 me-1" /> پاک‌سازی کش سئو
 </Button>
 <Button variant="outline" size="sm" onClick={() => handleClearCache("api")} className="w-full">
 <RefreshCw className="h-3 w-3 me-1" /> پاک‌سازی کش API
 </Button>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <Button variant="outline" size="sm" onClick={() => handleClearCache("pages")} className="w-full">
 <RefreshCw className="h-3 w-3 me-1" /> پاک‌سازی صفحات پررندر
 </Button>
 <Button variant="outline" size="sm" onClick={() => handleClearCache("invoices")} className="w-full">
 <RefreshCw className="h-3 w-3 me-1" /> پاک‌سازی فاکتورها
 </Button>
 <Button variant="outline" size="sm" onClick={() => handleClearCache("dashboard")} className="w-full">
 <RefreshCw className="h-3 w-3 me-1" /> پاک‌سازی داشبورد
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> عملکرد سرور</CardTitle></CardHeader>
 <CardContent>
 {loading? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>: perfData? (
 <div className="space-y-3 text-sm">
 <div className="flex justify-between"><span className="text-muted-foreground">آپتایم</span><span className="font-mono">{perfData.uptime?.formatted?? "—"}</span></div>
 <div className="flex justify-between"><span className="text-muted-foreground">RSS</span><span className="font-mono">{Math.round((perfData.memory?.rss?? 0) / 1024 / 1024)} MB</span></div>
 <div className="flex justify-between"><span className="text-muted-foreground">Heap Used</span><span className="font-mono">{Math.round((perfData.memory?.heapUsed?? 0) / 1024 / 1024)} MB</span></div>
 <div className="flex justify-between"><span className="text-muted-foreground">CPU Usage</span><span className="font-mono">{Math.round(perfData.cpu?.usage?? 0)}%</span></div>
 </div>
 ): <p className="text-sm text-muted-foreground text-center">داده‌ای موجود نیست</p>}
 </CardContent>
 </Card>
 </div>
 );
}
