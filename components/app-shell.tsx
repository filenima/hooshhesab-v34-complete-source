"use client";

import * as React from "react";
// NOTE: framer-motion (heavy ~30KB) — بارگذاری تنبل امکان‌پذیر نیست چون
// AnimatePresence باید فرزندان را ردیابی کند. در عوض، optimizePackageImports
// در next.config.ts tree-shaking را فعال کرده و فقط motion/AnimatePresence وارد می‌شود.
import { motion, AnimatePresence } from "framer-motion";
import {
 Sparkles,
 LayoutDashboard,
 BookOpen,
 Package,
 ShoppingCart,
 Landmark,
 Users,
 Receipt,
 FileCheck,
 Coins,
 Wallet,
 TrendingUp,
 Mail,
 Zap,
 MessageSquare,
 Hash,
 Workflow,
 Store,
 CreditCard,
 MonitorSmartphone,
 BarChart3,
 FileBarChart,
 Heart,
 Factory,
 HardHat,
 ShieldCheck,
 Smartphone,
 Code2,
 Calculator,
 KeyRound,
 Search,
 Bell,
 ChevronRight,
 PanelRightClose,
 PanelRightOpen,
 Command,
 Settings,
 LogOut,
 ShoppingBag,
 Crown,
 Compass,
 Keyboard,
 FileText,
 ChevronDown,
 UserCircle,
 Globe,
 GitCompare,
 Layers,
 AlertTriangle,
 Truck,
 Briefcase,
 Handshake,
 Webhook,
 Menu,
 X,
 Building2,
 Boxes,
 Link2,
 Scale,
 Clock,
 Calendar,
 CalendarClock,
 CalendarRange,
 Headphones,
 ScrollText,
 Gift,
 Sun,
 Banknote,
 type LucideIcon,
 Bug,
 Upload,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SafeBoundary } from "@/components/safe-boundary";
import { LicenseGuard } from "@/hooks/use-license-check";

// تور قدیمی OnboardingTour حذف شد — فقط تور Joyride باقی می‌ماند (یک تور جذاب و حرفه‌ای)
import { ModuleErrorFallback } from "@/components/ux/module-error-fallback";
import { ModuleSkeleton } from "@/components/ux/module-skeleton";
// PERF: پیش‌بارگذاری چانک ماژول‌ها در idle → سوئیچ آنی بین قسمت‌ها (مخصوصاً موبایل)
import { prewarmCoreMobile, prewarmSecondaryModules, prewarmModule } from "@/lib/module-prewarm";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

import {
 isJoyrideTourDone,
 resetJoyrideTour,
} from "@/components/onboarding-joyride";

const OfflineBanner = dynamic(() => import("@/components/offline-banner").then(m => ({ default: m.OfflineBanner })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false });
// تبلیغات داشبورد — بارگذاری تنبل (فقط برای کاربر لاگین‌شده و در داشبورد رندر می‌شود)
const AdBanner = dynamic(() => import("@/components/ads/ad-banner").then(m => ({ default: m.AdBanner })).catch(() => ({ default: () => null })), { ssr: false });
import { toPersianDigits, getCurrentJalaliYear } from "@/lib/persian";
import { trackPageView, trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { HelpCircle, Lock } from "lucide-react";
import { getModuleHelp, MODULE_HELP_CONTENT } from "@/lib/module-help-content";
import { ModuleHelpPopup } from "@/components/ux/module-help-popup";
import { hasModuleAccess } from "@/lib/plan-features";
import { authFetch } from "@/lib/auth-fetch";
import { navIconByName } from "@/lib/nav-icons";
// THEME(25-B): آیکون‌های سایدبار مطابق تم انتخابی کاربر تغییر می‌کنند
import { useAppTheme, getThemeIcon } from "@/lib/theme-registry";
// USER-CONTENT(3-d): متن‌های قابل‌ویرایش سوپرادمین برای پنل کاربر
// (خوش‌آمد داشبورد، عنوان گروه‌های سایدبار، سرصفحهٔ ماژول‌ها)
import {
 setUserContentOverrides,
 getUserContent,
 getNavGroupTitle,
 useUserContentOverrides,
} from "@/lib/user-content";
import { LockedModuleDialog } from "@/components/ux/locked-module-dialog";
import { EmailPromptDialog } from "@/components/email-prompt-dialog";
import { ModuleLoadError } from "@/components/ux/module-load-error";

/* ============ PERF(21-C — موبایل): اسپرینگ‌های framer-motion روی گوشی میان‌رده
 * لگ دارند — روی ≤768px (یا prefers-reduced-motion) به tween کوتاه 0.15s
 * تبدیل می‌شوند (گزارش مالک: «کم شدن انیمیشن در موبایل، لگ کمتر»). ============ */
const LOW_MOTION =
 typeof window !== "undefined" &&
 typeof window.matchMedia === "function" &&
 (window.matchMedia("(max-width: 768px)").matches ||
 window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ============ retryLazy: wrapper برای React.lazy با تلاش مجدد روی ChunkLoadError ============
 * Task 2-a: بعد از تلاش‌های سریع (۵۰۰ms)، یک تلاش نهایی با وقفهٔ بلند ۳s
 * برای «هر» خطایی انجام می‌شود — در سندباکس، OOM/ری‌استارت سرور گاهی خطای
 * غیر-chunk می‌دهد (timeout/abort) و کاربر «در حال بارگذاری ماژول» گیر می‌کرد. */
function retryLazy<T extends React.ComponentType<any>>(
 lazyFn: () => Promise<{ default: T }>,
 retries = 3,
 delay = 500
): React.LazyExoticComponent<T> {
 return React.lazy(() => {
 return new Promise<{ default: T }>((resolve, reject) => {
 let attempt = 0;
 // Task 2-a — پرچم تلاش نهایی بلند: فقط یک‌بار برای هر خطایی
 let longRetryUsed = false;
 const tryImport = () => {
 attempt++;
 lazyFn()
.then(resolve)
.catch((err) => {
 const isChunkError =
 err?.name === "ChunkLoadError" ||
 /loading chunk/i.test(err?.message || "") ||
 /failed to fetch/i.test(err?.message || "");
 if (isChunkError && attempt < retries) {
 console.warn(`[retryLazy] Chunk load failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`);
 setTimeout(tryImport, delay);
 } else if (!longRetryUsed) {
 // Task 2-a — تلاش نهایی با وقفهٔ بلند: خطای غیر-chunk (OOM/timeout)
 // معمولاً گذرا است؛ ۳ ثانیه بعد یک بار دیگر امتحان می‌کنیم
 longRetryUsed = true;
 console.warn(`[retryLazy] Module load failed (attempt ${attempt}), final retry in 3000ms:`, err?.message);
 setTimeout(tryImport, 3000);
 } else {
 // Return a no-op fallback component instead of crashing
 console.error(`[retryLazy] All ${retries} attempts failed for module:`, err?.message);
 resolve({ default: (() => <ModuleLoadError />) as unknown as T });
 }
 });
 };
 tryImport();
 });
 });
}

/* ============ next/dynamic: بارگذاری تنبل کامپوننت‌های سنگین با ssr:false ============ */
// این کامپوننت‌ها فقط در سمت کلاینت لازم‌اند و حجم زیادی دارند.
const AIAssistantAgent = dynamic(
 () => import("@/components/ai/ai-assistant-pro").then((m) => ({ default: m.AIAssistantPro })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const AdvancedSearch = dynamic(
 () => import("@/components/ux/advanced-search").then((m) => ({ default: m.AdvancedSearch })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const SettingsDialog = dynamic(
 () => import("@/components/ux/settings-dialog").then((m) => ({ default: m.SettingsDialog })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const InvoiceForm = dynamic(
 () => import("@/components/ux/invoice-form").then((m) => ({ default: m.InvoiceForm })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const OnboardingJoyride = dynamic(
 () => import("@/components/onboarding-joyride").then((m) => ({ default: m.OnboardingJoyride })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
// FIX(B10): دیالوگ هشدار انقضای نشست — تنبل بارگذاری می‌شود (فقط برای کاربران وارد‌شده)
const LazySessionTimeoutDialog = dynamic(
 () => import("@/components/session-timeout-dialog").then((m) => ({ default: m.SessionTimeoutDialog })).catch(() => ({ default: () => null })),
 { ssr: false }
);
const NotificationCenter = dynamic(
 () => import("@/components/notification-center").then((m) => ({ default: m.NotificationCenter })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const PriceTicker = dynamic(
 () => import("@/components/price-ticker").then((m) => ({ default: m.PriceTicker })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const ThemeToggle = dynamic(
 () => import("@/components/theme-toggle").then((m) => ({ default: m.ThemeToggle })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const CommandPalette = dynamic(
 () => import("@/components/command-palette").then((m) => ({ default: m.CommandPalette })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const KeyboardShortcuts = dynamic(
 () => import("@/components/ux/keyboard-shortcuts").then((m) => ({ default: m.KeyboardShortcuts })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
// v32-C: اورلی سراسری بارکد (کارت «کالا یافت شد» وقتی هیچ ماژولی اسکن را مصرف نکرد)
const BarcodeFallbackOverlayLazy = dynamic(
 () => import("@/components/ux/barcode-fallback-overlay").then((m) => ({ default: m.BarcodeFallbackOverlay })).catch(() => ({ default: () => null })),
 { ssr: false }
);
const TrialBanner = dynamic(
 () => import("@/components/trial-banner").then((m) => ({ default: m.TrialBanner })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const UpgradeModal = dynamic(
 () => import("@/components/upgrade-modal").then((m) => ({ default: m.UpgradeModal })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const MobileBottomNav = dynamic(
 () => import("@/components/mobile-bottom-nav").then((m) => ({ default: m.MobileBottomNav })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const CustomizableDashboard = dynamic(
 () => import("@/components/dashboard/customizable-dashboard").then((m) => ({ default: m.CustomizableDashboard })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const CompanySwitcher = dynamic(
 () => import("@/components/company-switcher").then((m) => ({ default: m.CompanySwitcher })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const RealtimePresence = dynamic(
 () => import("@/components/realtime-presence").then((m) => ({ default: m.RealtimePresence })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
const TrialSuccessModal = dynamic(
 () => import("@/components/views/trial-success-modal").then((m) => ({ default: m.TrialSuccessModal })).catch(() => ({ default: () => <ModuleLoadError /> })),
 { ssr: false, loading: () => <ModuleSkeleton /> }
);
import type { TrialCredentials } from "@/components/views/trial-success-modal";
import {
 getStoredAdminToken,
 getStoredAdminUser,
} from "@/components/views/superadmin-login";
import { DemoProvider, useDemo } from "@/components/demo-provider";
import type { ViewType } from "@/components/views/_marketing-shell";

/* ============ Dynamic imports: views (code-split for reduced initial bundle) ============ */
const PricingView = dynamic(() => import("@/components/views/pricing-view").then((m) => ({ default: m.PricingView })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
const LandingDynamic = dynamic(() => import("@/components/views/landing-dynamic").then((m) => ({ default: m.LandingDynamic })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
const BlogView = dynamic(() => import("@/components/views/blog-view").then((m) => ({ default: m.BlogView })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
const SupportView = dynamic(() => import("@/components/views/support-view").then((m) => ({ default: m.SupportView })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
const LegalView = dynamic(() => import("@/components/views/legal-view").then((m) => ({ default: m.LegalView })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
const AuthView = dynamic(() => import("@/components/views/auth-view").then((m) => ({ default: m.AuthView })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
const SuperAdminPanel = dynamic(() => import("@/components/views/superadmin-panel").then((m) => ({ default: m.SuperAdminPanel })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
const AccountView = dynamic(() => import("@/components/views/account-view").then((m) => ({ default: m.AccountView })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
// FIX(v12.1 — سیستم رفرال): ویجت دعوت دوستان — قبلاً هیچ‌جا رندر نمی‌شد
const ReferralWidgetModule = dynamic(() => import("@/components/ux/referral-widget").then((m) => ({ default: m.ReferralWidget })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
// v12.1: ماژول گزارش باگ با اسکرین‌شات (پاداش: اشتراک یک‌ماهه حرفه‌ای)
const BugReportModule = dynamic(() => import("@/components/modules/bug-report").then((m) => ({ default: m.BugReportModule })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
// Task 24 — کیف پول: پاداش‌های نقدی دعوت/باگ + برداشت کارت/شبا
const WalletModule = dynamic(() => import("@/components/modules/wallet").then((m) => ({ default: m.WalletModule })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });
const LicenseManagement = dynamic(() => import("@/components/modules/license-management").then((m) => ({ default: m.LicenseManagement })).catch(() => ({ default: () => <ModuleLoadError /> })), { ssr: false, loading: () => <ModuleSkeleton /> });

/* ============ retryLazy: بارگذاری تنبل ماژول‌ها برای code-splitting با تلاش مجدد ============ */
const CoreAccounting = retryLazy(() =>
 import("@/components/modules/core-accounting").then((m) => ({ default: m.CoreAccounting }))
);
const FiscalYearManager = retryLazy(() =>
 import("@/components/modules/fiscal-year-manager").then((m) => ({ default: m.FiscalYearManager }))
);
const Inventory = retryLazy(() =>
 import("@/components/modules/inventory").then((m) => ({ default: m.Inventory }))
);
const Invoices = retryLazy(() =>
 import("@/components/modules/invoices").then((m) => ({ default: m.Invoices }))
);
const QuickInvoice = retryLazy(() =>
 import("@/components/modules/quick-invoice").then((m) => ({ default: m.QuickInvoice }))
);
// مدیریت فاکتورها (زیر فاکتور سریع — درخواست مالک)
const QuickInvoiceListLazy = retryLazy(() =>
 import("@/components/modules/quick-invoice-list").then((m) => ({ default: m.QuickInvoiceList }))
);
// PROD-v6: صندوق فروش (POS) — رستوران/هایپرمارکت
const PosTerminal = retryLazy(() =>
 import("@/components/modules/pos-terminal").then((m) => ({ default: m.PosTerminal }))
);
const QuickExpense = retryLazy(() =>
 import("@/components/modules/quick-expense").then((m) => ({ default: m.QuickExpense }))
);
const EndOfDayReport = retryLazy(() =>
 import("@/components/modules/end-of-day").then((m) => ({ default: m.EndOfDayReport }))
);
const Treasury = retryLazy(() =>
 import("@/components/modules/treasury").then((m) => ({ default: m.Treasury }))
);
const Payroll = retryLazy(() =>
 import("@/components/modules/payroll").then((m) => ({ default: m.Payroll }))
);
const TimeAttendanceModule = retryLazy(() =>
 import("@/components/modules/time-attendance").then((m) => ({ default: m.TimeAttendance }))
);
const LeaveManagementModule = retryLazy(() =>
 import("@/components/modules/leave-management").then((m) => ({ default: m.LeaveManagement }))
);
const AnnualBonusModule = retryLazy(() =>
 import("@/components/modules/annual-bonus").then((m) => ({ default: m.AnnualBonus }))
);
const EmployeePortalModule = retryLazy(() =>
 import("@/components/modules/employee-portal").then((m) => ({ default: m.EmployeePortal }))
);
const TaxModule = retryLazy(() =>
 import("@/components/modules/tax").then((m) => ({ default: m.TaxModule }))
);
// FIX: ماژول اظهارنامه مالیاتی (۷۳۴ خط، API /api/tax/filing سالم) قبلاً هیچ‌جا
// import نمی‌شد («یتیم» بود) — با dynamic import + آیتم NAV + case رندر ثبت شد.
const TaxFilingModule = retryLazy(() =>
 import("@/components/modules/tax-filing").then((m) => ({ default: m.TaxFilingModule }))
);
const ModianModule = retryLazy(() =>
 import("@/components/modules/modian").then((m) => ({ default: m.ModianModule }))
);
const PaymentGatewayModule = retryLazy(() =>
 import("@/components/modules/payment-gateway").then((m) => ({ default: m.PaymentGatewayModule }))
);
const EcommerceModule = retryLazy(() =>
 import("@/components/modules/ecommerce").then((m) => ({ default: m.EcommerceModule }))
);
const AIModule = retryLazy(() =>
 import("@/components/modules/ai-module").then((m) => ({ default: m.AIModule }))
);
const CRMModule = retryLazy(() =>
 import("@/components/modules/crm").then((m) => ({ default: m.CRMModule }))
);
const SecurityModule = retryLazy(() =>
 import("@/components/modules/security").then((m) => ({ default: m.SecurityModule }))
);
const ApiModule = retryLazy(() =>
 import("@/components/modules/api").then((m) => ({ default: m.ApiModule }))
);
const ManufacturingModule = retryLazy(() =>
 import("@/components/modules/manufacturing").then((m) => ({ default: m.ManufacturingModule }))
);
const Insurance = retryLazy(() =>
 import("@/components/modules/insurance").then((m) => ({ default: m.Insurance }))
);
const ContractingModule = retryLazy(() =>
 import("@/components/modules/contracting").then((m) => ({ default: m.ContractingModule }))
);
const MarketplaceModule = retryLazy(() =>
 import("@/components/modules/marketplace").then((m) => ({ default: m.MarketplaceModule }))
);
const RemindersModule = retryLazy(() =>
 import("@/components/modules/reminders").then((m) => ({ default: m.RemindersModule }))
);
const LoyaltyModule = retryLazy(() =>
 import("@/components/modules/loyalty").then((m) => ({ default: m.LoyaltyModule }))
);
const MobileAppModule = retryLazy(() =>
 import("@/components/modules/mobile-app").then((m) => ({ default: m.MobileAppModule }))
);
const EcosystemModule = retryLazy(() =>
 import("@/components/modules/ecosystem").then((m) => ({ default: m.EcosystemModule }))
);
const ReportsBuilder = retryLazy(() =>
 import("@/components/modules/reports-builder").then((m) => ({ default: m.ReportsBuilder }))
);
const MultiCurrencyModule = retryLazy(() =>
 import("@/components/modules/multi-currency").then((m) => ({ default: m.MultiCurrencyModule }))
);
const MultiCurrencyReportModule = retryLazy(() =>
 import("@/components/modules/multi-currency-report").then((m) => ({ default: m.MultiCurrencyReportModule }))
);
const BudgetPlanningModule = retryLazy(() =>
 import("@/components/modules/budget-planning").then((m) => ({ default: m.BudgetPlanningModule }))
);
const ForecastingModule = retryLazy(() =>
 import("@/components/modules/forecasting").then((m) => ({ default: m.ForecastingModule }))
);
const ForecastDashboard = retryLazy(() =>
 import("@/components/modules/forecast-dashboard").then((m) => ({ default: m.ForecastDashboard }))
);
const EmailTemplatesModule = retryLazy(() =>
 import("@/components/modules/email-templates").then((m) => ({ default: m.EmailTemplatesModule }))
);
const WorkflowAutomationModule = retryLazy(() =>
 import("@/components/modules/workflow-automation").then((m) => ({ default: m.WorkflowAutomationModule }))
);
const DocumentTemplatesModule = retryLazy(() =>
 import("@/components/modules/document-templates").then((m) => ({ default: m.DocumentTemplates }))
);
const EmailQueueModule = retryLazy(() =>
 import("@/components/modules/email-queue").then((m) => ({ default: m.EmailQueueModule }))
);
const SmsTemplatesModule = retryLazy(() =>
 import("@/components/modules/sms-templates").then((m) => ({ default: m.SmsTemplatesModule }))
);
const WorkflowVisualEditorModule = retryLazy(() =>
 import("@/components/modules/workflow-visual-editor").then((m) => ({ default: m.WorkflowVisualEditorModule }))
);
const TagsAnalyticsModule = retryLazy(() =>
 import("@/components/modules/tags-analytics").then((m) => ({ default: m.TagsAnalyticsModule }))
);
const ForecastComparisonModule = retryLazy(() =>
 import("@/components/modules/forecast-comparison").then((m) => ({ default: m.ForecastComparisonModule }))
);
const DocumentMergeModule = retryLazy(() =>
 import("@/components/ux/document-merge").then((m) => ({ default: m.DocumentMerge }))
);
const SecurityTrainingModule = retryLazy(() =>
 import("@/components/modules/security-training").then((m) => ({ default: m.SecurityTrainingModule }))
);
const CustomReportBuilder = retryLazy(() =>
 import("@/components/modules/custom-report-builder").then((m) => ({ default: m.CustomReportBuilder }))
);
const ABTestCalculator = retryLazy(() =>
 import("@/components/ux/ab-test-calculator").then((m) => ({ default: m.ABTestCalculator }))
);
const CrossServiceDashboard = retryLazy(() =>
 import("@/components/modules/cross-service-dashboard").then((m) => ({ default: m.CrossServiceDashboard }))
);
const LoyaltyBadge = retryLazy(() =>
 import("@/components/ux/loyalty-badge").then((m) => ({ default: m.LoyaltyBadge }))
);
const InAppMessageBanner = retryLazy(() =>
 import("@/components/ux/in-app-message-banner").then((m) => ({ default: m.InAppMessageBanner }))
);
const PushPermissionBanner = retryLazy(() =>
 import("@/components/push-permission-banner").then((m) => ({ default: m.PushPermissionBanner }))
);
const AnalyticsScripts = retryLazy(() =>
 import("@/components/analytics-scripts").then((m) => ({ default: m.AnalyticsScripts }))
);
const AnomalyDashboard = retryLazy(() =>
 import("@/components/modules/anomaly-dashboard").then((m) => ({ default: m.AnomalyDashboard }))
);
const SupplierAnalyticsModule = retryLazy(() =>
 import("@/components/modules/supplier-analytics").then((m) => ({ default: m.SupplierAnalytics }))
);
const OCRBatchUpload = retryLazy(() =>
 import("@/components/ux/ocr-batch-upload").then((m) => ({ default: m.OCRBatchUpload }))
);
const VoiceCommander = retryLazy(() =>
 import("@/components/ux/voice-commander").then((m) => ({ default: m.VoiceCommander }))
);
const AppMarketplaceModule = retryLazy(() =>
 import("@/components/modules/app-marketplace").then((m) => ({ default: m.AppMarketplace }))
);
const ScheduledReportsModule = retryLazy(() =>
 import("@/components/modules/scheduled-reports").then((m) => ({ default: m.ScheduledReports }))
);
const PartnerProgramModule = retryLazy(() =>
 import("@/components/modules/partner-program").then((m) => ({ default: m.PartnerProgram }))
);
const SmartDashboard = retryLazy(() =>
 import("@/components/dashboard/smart-dashboard").then((m) => ({ default: m.SmartDashboard }))
);
const BiometricLogin = retryLazy(() =>
 import("@/components/ux/biometric-login").then((m) => ({ default: m.BiometricLoginPage }))
);
const NLQueryBar = retryLazy(() =>
 import("@/components/ux/nl-query-bar").then((m) => ({ default: m.NLQueryBar }))
);
const AIFinancialSuite = retryLazy(() =>
 import("@/components/modules/ai-financial-suite").then((m) => ({ default: m.AIFinancialSuite }))
);
const WebhookManager = retryLazy(() =>
 import("@/components/modules/webhook-manager").then((m) => ({ default: m.default }))
);
const DataNotebook = retryLazy(() =>
 import("@/components/modules/data-notebook").then((m) => ({ default: m.default }))
);
const LTVDashboard = retryLazy(() =>
 import("@/components/views/ltv-dashboard").then((m) => ({ default: m.default }))
);
const HelpSection = retryLazy(() =>
 import("@/components/views/help-view").then((m) => ({ default: m.HelpView }))
);
const DataImportExportModule = retryLazy(() =>
 import("@/components/modules/data-import-export").then((m) => ({ default: m.DataImportExport }))
);
const PrintTemplatesModule = retryLazy(() =>
 import("@/components/ux/print-templates").then((m) => ({ default: m.PrintTemplates }))
);
const QuickActionsWidget = retryLazy(() =>
 import("@/components/ux/quick-actions").then((m) => ({ default: m.QuickActions }))
);
const ActivityFeedWidget = retryLazy(() =>
 import("@/components/ux/activity-feed").then((m) => ({ default: m.ActivityFeed }))
);
const FinancialCalculatorWidget = retryLazy(() =>
 import("@/components/ux/financial-calculator").then((m) => ({ default: m.FinancialCalculator }))
);
const AccountingCalculator = retryLazy(() =>
 import("@/components/ux/accounting-calculator").then((m) => ({ default: m.AccountingCalculator }))
);
// ============ PROD-V5: ماژول‌های رقبا (پورتال، دارایی ثابت، مغایرت‌گیری) ============
const CustomerPortalModule = retryLazy(() =>
 import("@/components/modules/customer-portal").then((m) => ({ default: m.CustomerPortalModule }))
);
const FixedAssetsModule = retryLazy(() =>
 import("@/components/modules/fixed-assets").then((m) => ({ default: m.FixedAssetsModule }))
);
const BankReconciliationModule = retryLazy(() =>
 import("@/components/modules/bank-reconciliation").then((m) => ({ default: m.BankReconciliationModule }))
);
const InvoiceAgingModule = retryLazy(() =>
 import("@/components/modules/invoice-aging").then((m) => ({ default: m.InvoiceAgingModule }))
);
// ============ PROD-V6: قابلیت‌های جدید راند ۲۲ ============
const VendorPortalModule = retryLazy(() =>
 import("@/components/modules/vendor-portal").then((m) => ({ default: m.VendorPortalModule }))
);
const ProjectProfitabilityModule = retryLazy(() =>
 import("@/components/modules/project-profitability").then((m) => ({ default: m.ProjectProfitabilityModule }))
);
const ExpenseTrackerModule = retryLazy(() =>
 import("@/components/modules/expense-tracker").then((m) => ({ default: m.ExpenseTrackerModule }))
);
const FinancialRatiosModule = retryLazy(() =>
 import("@/components/modules/financial-ratios").then((m) => ({ default: m.FinancialRatiosModule }))
);
// ============ PROD-V7: تیکت پشتیبانی (ماژول کاربر) ============
const SupportTicketModule = retryLazy(() =>
 import("@/components/modules/support-tickets").then((m) => ({ default: m.SupportTicketModule }))
);
const TenantLogsViewer = retryLazy(() =>
 import("@/components/modules/tenant-logs").then((m) => ({ default: m.TenantLogsViewer }))
);

const USER_TOKEN_KEY = "hoshhesab_user_token";

interface NavItem {
 id: string;
 label: string;
 icon: LucideIcon;
 group: string;
 badge?: string;
 // MODULE-MANAGER(25-A): فقط برای آیتم‌های دلخواهِ «لینک» — در تب جدید باز می‌شود
 url?: string;
}

// ============ NAV_ITEMS (تجمیع‌شده) ============
// ۲۱ آیتم در ۶ گروه — نسخه‌ی تمیزتر از ۵۴ آیتم قبلی.
// ماژول‌های دیگر (manufacturing, contracting, loyalty, reminders, workflow,
// email-templates, sms-templates, ocr-batch, anomaly-dashboard, document-merge,
// document-templates, security-training, ab-test-calculator, smart-dashboard,
// nl-query, biometric-login, webhook-manager, data-notebook, ltv-dashboard,
// tags-analytics, workflow-editor, cross-service, marketplace, app-marketplace,
// partner-program, mobile, multi-currency-report, forecast-dashboard,
// forecast-comparison, custom-report-builder, bi)
// همچنان از طریق Command Palette (Cmd+K)، جستجوی پیشرفته، و رویدادهای
// navigate-link قابل دسترسی هستند و در renderModule باقی مانده‌اند.
const NAV_ITEMS: NavItem[] = [
 // ۱. داشبورد
 { id: "dashboard", label: "داشبورد", icon: LayoutDashboard, group: "داشبورد" },
 // ۱.۵ کیف پول و پاداش — برجسته در بالای سایدبار (درخواست مالک: دیده‌شدن کیف پول)
 { id: "wallet", label: "کیف پول", icon: Wallet, group: "کیف پول و پاداش", badge: "پاداش" },
 { id: "referral", label: "دعوت دوستان", icon: Users, group: "کیف پول و پاداش", badge: "۱ میلیون تومان" },
 // ۲. فروش و خرید
 { id: "pos", label: "صندوق فروش (POS)", icon: MonitorSmartphone, group: "فروش و خرید", badge: "POS" },
 { id: "quick-invoice", label: "فاکتور سریع", icon: Zap, group: "فروش و خرید", badge: "سریع" },
 { id: "quick-invoice-list", label: "فاکتورها", icon: FileText, group: "فروش و خرید" },
 { id: "quick-expense", label: "هزینه سریع", icon: Banknote, group: "فروش و خرید", badge: "سریع" },
 { id: "end-of-day", label: "گزارش پایان روز", icon: Sun, group: "فروش و خرید", badge: "جدید" },
 { id: "invoices", label: "خرید و فروش", icon: ShoppingCart, group: "فروش و خرید" },
 { id: "ecommerce", label: "فروشگاه و بازارها", icon: Store, group: "فروش و خرید" },
 { id: "crm", label: "مشتریان (CRM)", icon: Heart, group: "فروش و خرید" },
 { id: "customer-portal", label: "پورتال مشتریان", icon: Link2, group: "فروش و خرید", badge: "جدید" },
 { id: "vendor-portal", label: "پورتال تأمین‌کنندگان", icon: Truck, group: "فروش و خرید", badge: "جدید" },
 // ۳. انبار و کالا
 { id: "inventory", label: "انبار و کالا", icon: Package, group: "انبار و کالا" },
 { id: "data-import-export", label: "واردات و صادرکرد داده", icon: Upload, group: "انبار و کالا", badge: "هلو" },
 { id: "project-profitability", label: "سودآوری پروژه‌ها", icon: Briefcase, group: "انبار و کالا", badge: "جدید" },
 { id: "expense-tracker", label: "هزینه و مسافت", icon: Receipt, group: "انبار و کالا", badge: "جدید" },
 { id: "multi-currency", label: "ارز و چندارزی", icon: Coins, group: "انبار و کالا" },
 { id: "budget", label: "بودجه‌ریزی", icon: Wallet, group: "انبار و کالا" },
 // ۴. مالی و بانک
 { id: "core", label: "هسته حسابداری", icon: BookOpen, group: "مالی و بانک" },
 { id: "fiscal-year", label: "مدیریت سال مالی", icon: CalendarRange, group: "مالی و بانک", badge: "جدید" },
 { id: "fixed-assets", label: "دارایی‌های ثابت", icon: Building2, group: "مالی و بانک", badge: "جدید" },
 { id: "treasury", label: "خزانه‌داری و چک", icon: Landmark, group: "مالی و بانک" },
 { id: "bank-reconciliation", label: "مغایرت‌گیری بانکی", icon: Scale, group: "مالی و بانک", badge: "جدید" },
 { id: "invoice-aging", label: "سن فاکتور و ریسک", icon: Clock, group: "مالی و بانک", badge: "جدید" },
 { id: "financial-ratios", label: "نسبت‌های مالی", icon: BarChart3, group: "مالی و بانک", badge: "جدید" },
 { id: "tax", label: "ارزش افزوده و مالیات", icon: Receipt, group: "مالی و بانک" },
 { id: "tax-filing", label: "اظهارنامه مالیاتی", icon: FileText, group: "مالی و بانک", badge: "جدید" },
 { id: "modian", label: "سامانه مودیان", icon: FileCheck, group: "مالی و بانک" },
 { id: "payroll", label: "حقوق و دستمزد", icon: Users, group: "مالی و بانک" },
 { id: "insurance", label: "بیمه", icon: ShieldCheck, group: "مالی و بانک", badge: "جدید" },
 { id: "time-attendance", label: "زمان و حضور", icon: Clock, group: "مالی و بانک", badge: "جدید" },
 { id: "leave-management", label: "مدیریت مرخصی", icon: Calendar, group: "مالی و بانک", badge: "جدید" },
 { id: "annual-bonus", label: "عیدی و سنوات", icon: Gift, group: "مالی و بانک", badge: "جدید" },
 { id: "employee-portal", label: "پورتال کارکنان", icon: UserCircle, group: "مالی و بانک", badge: "جدید" },
 { id: "payment", label: "درگاه پرداخت", icon: CreditCard, group: "مالی و بانک" },
 // ۵. گزارش‌ها و هوشمند
 { id: "forecast", label: "پیش‌بینی هوشمند", icon: TrendingUp, group: "گزارش‌ها و هوشمند" },
 { id: "scheduled-reports", label: "گزارش‌های دوره‌ای", icon: CalendarClock, group: "گزارش‌ها و هوشمند", badge: "جدید" },
 { id: "reports-builder", label: "گزارش‌ساز", icon: FileBarChart, group: "گزارش‌ها و هوشمند" },
 { id: "ai", label: "هوش مصنوعی", icon: Sparkles, group: "گزارش‌ها و هوشمند" },
 { id: "ai-financial-suite", label: "سوپرماژول هوش مالی", icon: Sparkles, group: "گزارش‌ها و هوشمند", badge: "جدید" },
 // ۶. سیستم
 { id: "api", label: "API و توسعه", icon: Code2, group: "سیستم" },
 { id: "security", label: "امنیت و کاربران", icon: ShieldCheck, group: "سیستم" },
 { id: "tenant-logs", label: "لاگ‌های سازمان", icon: ScrollText, group: "سیستم" },
 { id: "account", label: "حساب کاربری", icon: UserCircle, group: "سیستم" },
 { id: "license", label: "مدیریت لایسنس", icon: KeyRound, group: "سیستم" },
 // (کیف پول و دعوت دوستان به گروه اختصاصی «کیف پول و پاداش» در بالای سایدبار منتقل شدند)
 // ۷. ابزارهای پیشرفته ما
 { id: "calculator", label: "ماشین حساب", icon: Calculator, group: "ابزارهای پیشرفته ما", badge: "جدید" },
 { id: "ecosystem", label: "اکوسیستم نوباتایم", icon: Globe, group: "ابزارهای پیشرفته ما" },
 { id: "mobile", label: "اپلیکیشن موبایل", icon: Smartphone, group: "ابزارهای پیشرفته ما" },
 // ۸. راهنما
 { id: "support", label: "تیکت پشتیبانی", icon: Headphones, group: "راهنما" },
 { id: "bug-report", label: "گزارش باگ", icon: Bug, group: "راهنما", badge: "پاداش" },
 { id: "help", label: "راهنما و پشتیبانی", icon: Compass, group: "راهنما" },
];

const MODULE_TITLES: Record<string, { title: string; subtitle: string }> = {
 dashboard: { title: "داشبورد", subtitle: "نمای کلی وضعیت مالی کسب‌وکار" },
 core: { title: "هسته حسابداری", subtitle: "دفتر کل، معین، اسناد و تراز آزمایشی" },
 "fiscal-year": { title: "مدیریت سال مالی", subtitle: "تعریف، بستن و شمارنده‌های اتمیک اسناد" },
 invoices: { title: "خرید و فروش", subtitle: "فاکتورها، سفارشات و طرف‌حساب‌ها" },
 pos: { title: "صندوق فروش (POS)", subtitle: "فروش سریع رستوران و هایپرمارکت — فیش و فاکتور با یک لمس، ثبت خودکار در دفاتر و انبار" },
 "quick-invoice": { title: "فاکتور سریع", subtitle: "ثبت فاکتور در چند ثانیه — مناسب خرده‌فروشی و رستوران" },
 "quick-invoice-list": { title: "فاکتورها", subtitle: "مدیریت فاکتورها — جستجو، ویرایش، حذف و چاپ" },
 "quick-expense": { title: "هزینه سریع", subtitle: "ثبت هزینه روزمره در چند ثانیه — اجاره، قبض، خرید، حقوق" },
 "end-of-day": { title: "گزارش پایان روز", subtitle: "فروش، هزینه و سود امروز + بدهی‌های باز مشتریان" },
 treasury: { title: "خزانه‌داری و چک", subtitle: "بانک، چک صیادی، تنخواه و وام" },
 tax: { title: "ارزش افزوده و مالیات", subtitle: "محاسبه و گزارش‌های مالیاتی" },
 "tax-filing": { title: "اظهارنامه مالیاتی", subtitle: "اظهارنامه ارزش افزوده و مالیات بر درآمد با پر شدن خودکار از داده‌ها" },
 modian: { title: "سامانه مودیان", subtitle: "صورتحساب الکترونیکی و اتصال به دارایی" },
 payment: { title: "درگاه پرداخت آنلاین", subtitle: "زرین‌پال، آیدی‌پی، نکست‌پی و پی‌پینگ" },
 inventory: { title: "انبار و کالا", subtitle: "مدیریت موجودی، کاردکس و انبارگردانی" },
 ecommerce: { title: "فروشگاه و بازارها", subtitle: "اتصال به ووکامرس، دیجی‌کالا و باسلام" },
 payroll: { title: "حقوق و دستمزد", subtitle: "محاسبه حقوق، بیمه و مالیات" },
 insurance: { title: "بیمه (سپید/سپاه)", subtitle: "لیست بیمه سپید و سپاه، سررسیدها و بدهی معوقه" },
 "time-attendance": { title: "زمان و حضور", subtitle: "ثبت ورود/خروج، تایم‌شیت و محاسبه اضافه‌کار" },
 "leave-management": { title: "مدیریت مرخصی", subtitle: "درخواست، تأیید و گزارش مرخصی‌ها" },
 "annual-bonus": { title: "عیدی و سنوات", subtitle: "محاسبه عیدی، سنوات و لیست بیمه تأمین اجتماعی" },
 "employee-portal": { title: "پورتال کارکنان", subtitle: "دسترسی کارکنان به فیش حقوقی، حضور و مرخصی" },
 crm: { title: "مدیریت ارتباط با مشتری", subtitle: "پیگیری، باشگاه مشتریان و Pipeline" },
 ai: { title: "هوش مصنوعی", subtitle: "OCR، چت‌بات، پیش‌بینی و تشخیص تقلب" },
 "reports-builder": { title: "گزارش‌ساز سفارشی", subtitle: "ساخت گزارش‌های دلخواه با drag-and-drop" },
 manufacturing: { title: "مدیریت تولیدی", subtitle: "BOM، حکم تولید و بهای تمام شده" },
 contracting: { title: "مدیریت پیمانکاری", subtitle: "صورت‌وضعیت و کسورات قانونی" },
 loyalty: { title: "باشگاه مشتریان", subtitle: "امتیاز، تخفیف و سطوح وفاداری" },
 reminders: { title: "یادآورهای هوشمند", subtitle: "هشدار سررسید، کسری موجودی و تولد" },
 workflow: { title: "اتوماسیون گردش کار", subtitle: "قانون‌های خودکار برای رویدادهای سیستم" },
 "multi-currency": { title: "ارز و چندارزی", subtitle: "مدیریت نرخ ارز و تبدیل" },
 budget: { title: "بودجه‌ریزی", subtitle: "تعریف و مقایسه بودجه با تحقق" },
 forecast: { title: "پیش‌بینی هوشمند", subtitle: "تحلیل روند و پیش‌بینی آینده" },
 "multi-currency-report": { title: "گزارش چندارزی", subtitle: "تبدیل گزارش‌های مالی به ارز دلخواه" },
 "forecast-dashboard": { title: "داشبورد پیش‌بینی", subtitle: "پیش‌بینی خودکار درآمد، هزینه، جریان نقدی و سود" },
 "forecast-comparison": { title: "مقایسه پیش‌بینی‌ها", subtitle: "مقایسه‌ی ۴ روش آماری با محاسبه‌ی MAPE" },
 "anomaly-dashboard": { title: "داشبورد ناهنجاری", subtitle: "شناسایی خودکار تراکنش‌های مشکوک و جهش‌های غیرعادی" },
 "ocr-batch": { title: "استخراج دسته‌ای فاکتور", subtitle: "پردازش همزمان چندین تصویر فاکتور با هوش مصنوعی" },
 "supplier-analytics": { title: "تحلیل تأمین‌کنندگان", subtitle: "ارزیابی کیفیت، تحویل و قیمت تأمین‌کنندگان" },
 "email-templates": { title: "قالب‌های ایمیل و پیامک", subtitle: "مدیریت قالب‌های پیام‌رسانی" },
 marketplace: { title: "بازار اپلیکیشن", subtitle: "نصب اپ‌های تخصصی حسابداری" },
 "app-marketplace": { title: "بازار اپلیکیشن", subtitle: "نصب اپ‌های third-party و پورتال توسعه‌دهنده" },
 "partner-program": { title: "برنامه‌ی همکاران", subtitle: "همکاری در فروش، درآمد و یکپارچه‌سازی" },
 security: { title: "امنیت و کاربران", subtitle: "احراز هویت، نقش‌ها و لاگ تغییرات" },
 "tenant-logs": { title: "لاگ‌های سازمان", subtitle: "تاریخچه کامل رویدادهای سیستم" },
 calculator: { title: "ماشین حساب", subtitle: "محاسبات مالی و бухгалтерی سریع" },
 account: { title: "حساب کاربری", subtitle: "مدیریت پروفایل، امنیت و اشتراک" },
 referral: { title: "دعوت دوستان", subtitle: "کد دعوت اختصاصی — ۱,۰۰۰,۰۰۰ تومان پاداش نقدی بعد از خرید اشتراک هر دوست" },
 wallet: { title: "کیف پول", subtitle: "پاداش‌های نقدی دعوت دوستان و گزارش باگ — برداشت با کارت/شبا" },
 "bug-report": { title: "گزارش باگ", subtitle: "باگ را با اسکرین‌شات بفرستید — با تأیید، یک ماه پلن حرفه‌ای رایگان" },
 license: { title: "مدیریت لایسنس", subtitle: "فعال‌سازی و مدیریت لایسنس نرم‌افزار" },
 mobile: { title: "اپلیکیشن موبایل", subtitle: "iOS و Android با قابلیت آفلاین" },
 api: { title: "API و توسعه", subtitle: "REST، GraphQL، Webhook و SDK" },
 // FIX: کلید «workflow-automation» مرده بود — id واقعی رندر «workflow» است که
 // بالاتر (line ~572) ثبت شده و «workflow-editor» هم جداگانه موجود است.
 help: { title: "راهنما و پشتیبانی", subtitle: "مستندات، آموزش و پشتیبانی فنی" },
 "document-templates": {
 title: "قالب‌های سند",
 subtitle: "قالب‌های قابل چاپ فاکتور، رسید و پیش‌فاکتور",
 },
 "document-merge": {
 title: "ادغام اسناد",
 subtitle: "ادغام چند فاکتور یا سند در یک خلاصه",
 },
 "security-training": {
 title: "آموزش امنیتی",
 subtitle: "دوره‌ی تعاملی امنیت سایبری با کویز و گواهی",
 },
 "custom-report-builder": {
 title: "سازنده گزارش پیشرفته",
 subtitle: "ساخت گزارش سفارشی با فیلد، تجمیع، فیلتر و نمودار",
 },
 "ab-test-calculator": {
 title: "محاسبه‌گر تست A/B",
 subtitle: "محاسبه‌ی حجم نمونه و معناداری آماری نتایج",
 },
 "smart-dashboard": {
 title: "داشبورد هوشمند",
 subtitle: "تولید خودکار ویجت‌ها بر اساس نقش، زمان و اولویت‌ها",
 },
 "nl-query": {
 title: "پرس‌وجوی زبان طبیعی",
 subtitle: "سوال فارسی بپرسید، سیستم به SQL تبدیل و اجرا می‌کند",
 },
 "biometric-login": {
 title: "ورود بیومتریک",
 subtitle: "اثر انگشت، چهره و WebAuthn / FIDO2",
 },
 "ai-financial-suite": {
 title: "سوپرماژول هوش مالی",
 subtitle: "۱۰ قابلیت هوشمند: حسابرسی، نسبت‌ها، نقدینگی، سرمایه‌گذاری",
 },
 "webhook-manager": {
 title: "مدیریت Webhook",
 subtitle: "ثبت و مدیریت webhook‌ها برای رویدادهای سیستم",
 },
 "data-notebook": {
 title: "دفترچه‌ی تحلیل داده",
 subtitle: "اجرای JavaScript و Python-like در مرورگر",
 },
 "ltv-dashboard": {
 title: "داشبورد LTV",
 subtitle: "تحلیل ارزش طول عمر مشتری با چند مدل",
 },
 "email-queue": {
 title: "صف ایمیل",
 subtitle: "مدیریت ارسال ایمیل با بازتلاش خودکار",
 },
 "sms-templates": {
 title: "قالب‌های پیامک",
 subtitle: "مدیریت قالب‌های پیامک با متغیرها",
 },
 "tags-analytics": {
 title: "تحلیل برچسب‌ها",
 subtitle: "الگوهای استفاده و ارزش مالی برچسب‌ها",
 },
 "workflow-editor": {
 title: "ویرایشگر بصری اتوماسیون",
 subtitle: "ساخت گردش کار با drag-and-drop گره‌ها",
 },
 "cross-service": {
 title: "داشبورد یکپارچه اکوسیستم",
 subtitle: "نمای کلی از همه‌ی سرویس‌های متصل",
 },
 "vendor-portal": {
 title: "پورتال تأمین‌کنندگان",
 subtitle: "دسترسی امن تأمین‌کنندگان به فاکتورهای خرید و وضعیت پرداخت",
 },
 "project-profitability": {
 title: "سودآوری پروژه‌ها",
 subtitle: "تحلیل هزینه، درآمد و حاشیه‌ی سود پروژه‌ها",
 },
 "expense-tracker": {
 title: "ثبت هزینه و مسافت",
 subtitle: "ثبت سریع هزینه‌ها و مسافت با گردش کار تأیید",
 },
 "customer-portal": {
 title: "پورتال مشتریان",
 subtitle: "لینک امن برای مشاهده فاکتور، صورت‌حساب و پرداخت آنلاین",
 },
 "fixed-assets": {
 title: "دارایی‌های ثابت و استهلاک",
 subtitle: "ثبت دارایی، محاسبه استهلاک خط مستقیم و ارزش دفتری",
 },
 "bank-reconciliation": {
 title: "مغایرت‌گیری بانکی",
 subtitle: "تطبیق صورت‌حساب بانک با تراکنش‌های ثبت‌شده",
 },
 "invoice-aging": {
 title: "سن فاکتور و ریسک اعتباری",
 subtitle: "تحلیل مطالبات معوق و رتبه‌بندی اعتباری طرف‌حساب‌ها",
 },
 "financial-ratios": {
 title: "نسبت‌های مالی",
 subtitle: "تحلیل جامع نسبت‌های نقدینگی، سودآوری، کارایی و اهرمی",
 },
 support: { title: "تیکت پشتیبانی", subtitle: "ارسال تیکت و پیگیری وضعیت" },
 ecosystem: { title: "اکوسیستم نوباتایم", subtitle: "نوباتایم، سایت‌ساز، AI Agent و هوش" },
};

export function AppShell() {
 return (
 <DemoProvider>
 <AppShellImpl />
 </DemoProvider>
 );
}

function AppShellImpl() {
 const [activeModule, setActiveModule] = React.useState("dashboard");
 // KEEP-ALIVE(21-C): ماژول‌های بازدیدشده مونت می‌مانند (حداکثر ۵ تای اخیر) و
 // با attribute «hidden» جابه‌جا می‌شوند — بازگشت آنی بدون remount/refetch/اسپینر.
 // گزارش مالک: «یبار کامل لود شده باید دیگه لازم نباشه هربار لود بشه».
 // سقپ ۵ ماژول برای کنترل حافظه؛ تغییر توکن (سوییچ شرکت/ورود) همه را نو می‌کند (key).
 const KEEP_ALIVE_MAX = 5;
 const [keptModules, setKeptModules] = React.useState<string[]>(["dashboard"]);
 React.useEffect(() => {
 setKeptModules((prev) =>
 prev.includes(activeModule)
 ? prev
 : [...prev, activeModule].slice(-KEEP_ALIVE_MAX)
 );
 }, [activeModule]);
 // FIX(v12.1 — UX): ذخیره‌ی آخرین ماژول فعال برای بازیابی در ورود بعدی
 React.useEffect(() => {
 try {
 sessionStorage.setItem("hoshhesab_last_module", activeModule);
 } catch { /* ignore */ }
 }, [activeModule]);
 const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
 const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
 const [cmdOpen, setCmdOpen] = React.useState(false);
 const [settingsOpen, setSettingsOpen] = React.useState(false);
 const [invoiceFormOpen, setInvoiceFormOpen] = React.useState(false);
 // نمایش تور joyride برای کاربران جدید (اولین بازدید) — تنها تور فعال
 const [upgradeModalOpen, setUpgradeModalOpen] = React.useState(false);
 const [tourRun, setTourRun] = React.useState(false);
 const [view, setView] = React.useState<ViewType>("landing");
 // FIX(v10-checkout): پلن خرید مستقیم از لینک ?buy= (صفحه سئو) برای چک‌اوت
 const [presetBuyPlan, setPresetBuyPlan] = React.useState<"basic" | "pro" | null>(null);
 const [viewInitialized, setViewInitialized] = React.useState(false);
 const [authOpen, setAuthOpen] = React.useState(false);
 // superadmin state
 const [adminToken, setAdminToken] = React.useState<string | null>(null);
 const [adminUser, setAdminUser] = React.useState<{
 id: string;
 username: string;
 role: string;
 } | null>(null);
 // user token (از ورود فوری superadmin یا احراز هویت)
 const [userToken, setUserToken] = React.useState<string | null>(null);
 // نقش کاربر فعلی (از توکن) — برای داشبورد مبتنی بر نقش
 const [userRole, setUserRole] = React.useState<string | undefined>(undefined);
 // شناسه‌ی کاربر فعلی (از توکن) — برای کلیدهای per-user مثل «دیگر نشان نده»
 const [authUserId, setAuthUserId] = React.useState<string | null>(null);
 // اطلاعات پروفایل کاربر (نام/ایمیل واقعی) — برای آواتار هدر و دارک نمایش‌ها
 const [userInfo, setUserInfo] = React.useState<{
 name?: string;
 email?: string;
 family?: string | null;
 company?: string | null;
 plan?: string;
 isDemo?: boolean;
 } | null>(null);
 // state برای پاپ‌آپ راهنما و قفل ماژول
 const [helpModule, setHelpModule] = React.useState<string | null>(null);
 const [lockedModule, setLockedModule] = React.useState<{ key: string; name: string } | null>(null);

 // ===== پاپ‌آپ «ایمیل‌تان را امن کنید» (Task 2-a) =====
 // بعد از ورود، اگر ایمیل پروفایل خالی/نامعتبر باشد از کاربر ایمیل معتبر می‌خواهیم —
 // چون جریان فراموشی رمز، اطلاعات ورود جدید را به همین ایمیل ارسال می‌کند.
 const [emailPromptOpen, setEmailPromptOpen] = React.useState(false);
 const EMAIL_PROMPT_INVALID_RE = /@(test|example|localhost|fake|placeholder)\./i;
 const emailPromptFlagKey = `hoshhesab_email_prompt_dismissed_${authUserId ?? "anon"}`;

 React.useEffect(() => {
 if (view!== "app" ||!userToken ||!authUserId ||!userInfo) return;
 // اگر تور معرفی (joyride) هنوز اجرا نشده/تمام نشده، پاپ‌آپ را عقب می‌اندازیم
 // تا دو لایه‌ی مودال روی هم (تور + پاپ‌آپ) کاربر را گیج نکنند — تور اول، ایمیل بعد.
 if (!isJoyrideTourDone()) return;
 const email = (userInfo?.email ?? "").trim();
 const needsValidEmail =!email || EMAIL_PROMPT_INVALID_RE.test(email);
 if (!needsValidEmail) return;
 let dismissed = false;
 try {
 dismissed = localStorage.getItem(emailPromptFlagKey) === "1";
 } catch {
 /* localStorage not available — پاپ‌آپ را نشان بده */
 }
 if (dismissed) return;
 // تأخیر ۸۰۰ms تا ورود «خوش‌آمدگویی» حس شود نه مزاحم
 const t = window.setTimeout(() => setEmailPromptOpen(true), 800);
 return () => window.clearTimeout(t);
 }, [view, userToken, authUserId, userInfo, emailPromptFlagKey, tourRun]);

 const handleEmailPromptClose = React.useCallback(() => {
 setEmailPromptOpen(false);
 try {
 localStorage.setItem(emailPromptFlagKey, "1");
 } catch {
 /* ignore */
 }
 }, [emailPromptFlagKey]);

 const handleEmailPromptSaved = React.useCallback((email: string) => {
 setEmailPromptOpen(false);
 setUserInfo((prev) => (prev? {...prev, email }: prev));
 }, []);

 // ===== FIX(v18-گیت مرکزی): ناوبری یکدست با قفل پلن =====
 // قبلاً فقط کلیک سایدبار گیت می‌شد؛ MobileBottomNav و رویدادهای navigate-link /
 // navigate مستقیم ماژول ست می‌کردند و ماژول‌های قفل‌شده (حقوق/بودجه/فروشگاه...)
 // بدون پلن باز می‌شدند. حالا همه‌ی مسیرها از goToModule می‌گذرند.
 const userPlanRef = React.useRef<string | undefined>(undefined);
 React.useEffect(() => {
 userPlanRef.current = userInfo?.plan;
 }, [userInfo]);

 const goToModule = React.useCallback((moduleId: string) => {
 if (!hasModuleAccess(userPlanRef.current, moduleId)) {
 const label =
 MODULE_TITLES[moduleId]?.title??
 NAV_ITEMS.find((n) => n.id === moduleId)?.label??
 moduleId;
 setLockedModule({ key: moduleId, name: label });
 return;
 }
 setActiveModule(moduleId);
 setView("app");
 },
 []);
 // تریال و دمو
 const [trialCredentials, setTrialCredentials] =
 React.useState<TrialCredentials | null>(null);
 const [trialModalOpen, setTrialModalOpen] = React.useState(false);
 const [loadingTrial, setLoadingTrial] = React.useState(false);
 const [loadingDemo, setLoadingDemo] = React.useState(false);
 const { toast } = useToast();
 const { setIsDemoMode, isDemoMode: demoActive } = useDemo();

 // استخراج نقش کاربر از توکن — برای داشبورد مبتنی بر نقش
 React.useEffect(() => {
 if (!userToken || typeof window === "undefined") {
 setUserRole(undefined);
 setAuthUserId(null);
 return;
 }
 try {
 const parts = userToken.split(".");
 if (parts.length < 2) return;
 // base64url base64
 const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
 const decoded = window.atob(b64);
 const payload = JSON.parse(decoded);
 setUserRole(payload?.role as string | undefined);
 setAuthUserId(
 (payload?.userId as string | undefined) ||
 (payload?.id as string | undefined) ||
 null
 );
 } catch {
 setUserRole(undefined);
 setAuthUserId(null);
 }
 }, [userToken]);

 // FIX(B10): دریافت تنظیم «مدت نشست» از سرور برای دیالوگ هشدار انقضا
 const [sessionTimeoutMs, setSessionTimeoutMs] = React.useState(7 * 24 * 60 * 60 * 1000); // پیش‌فرض ۷ روز
 React.useEffect(() => {
 if (!userToken) return;
 let cancelled = false;
 (async () => {
 try {
 const res = await fetch("/api/platform/settings/session");
 const data = await res.json();
 if (cancelled) return;
 if (data?.success && data?.data?.sessionTimeoutMs) {
 setSessionTimeoutMs(Number(data.data.sessionTimeoutMs));
 }
 } catch {
 /* ignore — مقدار پیش‌فرض باقی می‌ماند */
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [userToken]);

 // دریافت اطلاعات پروفایل کاربر هنگام وجود توکن — برای آواتار هدر و نام کاربری
 // FIX(v18-لایسنس): با رویداد «hoshhesab:license-changed» (پس از فعال‌سازی/ارتقای
 // لایسنس) پروفایل دوباره واکشی می‌شود تا قفل‌های ماژول‌های پلن بلافاصله باز شوند
 // (قبلاً کاربر بعد از ثبت لایسنس باید logout/login می‌کرد تا پلن جدید اعمال شود).
 React.useEffect(() => {
 if (!userToken) {
 setUserInfo(null);
 return;
 }
 let cancelled = false;
 const fetchProfile = async () => {
 try {
 const res = await fetch("/api/user/profile", {
 headers: { Authorization: `Bearer ${userToken}` },
 cache: "no-store",
 });
 const data = await res.json();
 if (cancelled) return;
 if (data?.success && data?.data) {
 setUserInfo({
 name: data.data.name,
 email: data.data.email,
 family: data.data.family?? null,
 company: data.data.company?? null,
 plan: data.data.tenant?.plan?? data.data.plan,
 isDemo: data.data.isDemo,
 });
 }
 } catch {
 /* ignore — شبکه یا توکن نامعتبر است؛ اطلاعات هدر هاردکدشده باقی می‌ماند */
 }
 };
 fetchProfile();
 window.addEventListener("hoshhesab:license-changed", fetchProfile as EventListener);
 return () => {
 cancelled = true;
 window.removeEventListener("hoshhesab:license-changed", fetchProfile as EventListener);
 };
 }, [userToken]);

 // ردیابی بازدید صفحه (analytics) — در تغییر view یا activeModule
 React.useEffect(() => {
 if (typeof window === "undefined") return;
 // FIX: ذخیره آخرین نما — تا در reload بعدی، سوپرادمین دوباره پنل خودش را ببیند
 if (view === "superadmin" || view === "app") {
 try {
 sessionStorage.setItem("hoshhesab_last_view", view);
 } catch { /* ignore */ }
 }
 const path =
 view === "app"
? `/app/${activeModule}`
: view === "superadmin"
? "/superadmin"
: view === "account"
? "/account"
: `/${view}`;
 trackPageView(path);
 }, [view, activeModule]);

 // گوش دادن به رویداد سفارشی navigate-link از NotificationCenter
 // (اعلان‌ها می‌توانند به ماژولی هدایت کنند — پشتیبانی از /invoices, /dashboard و...)
 // این رویداد دو نوع detail را پشتیبانی می‌کند:
 // ۱) رشته‌ی path (مثل "/invoices") هدایت به ماژول + view=app
 // ۲) شیء { view: ViewType } هدایت به یک صفحه‌ی بازاریابی (مثل pricing / landing / blog)
 React.useEffect(() => {
 const onNavigateLink = (e: Event) => {
 const detail = (e as CustomEvent<string | { view: string }>).detail;
 if (!detail) return;
 // حالت ۲: شیء با view — هدایت به صفحه‌ی بازاریابی
 if (typeof detail === "object" && detail!== null && typeof (detail as { view?: string }).view === "string") {
 const v = (detail as { view: string }).view;
 setView(v as ViewType);
 return;
 }
 if (typeof detail!== "string" ||!detail) return;
 // حالت ۱: رشته‌ی path — هدایت به ماژول
 // نگاشت path به activeModule
 const map: Record<string, string> = {
 "/dashboard": "dashboard",
 "/invoices": "invoices",
 "/treasury": "treasury",
 "/tax": "tax",
 "/modian": "modian",
 "/inventory": "inventory",
 "/ecommerce": "ecommerce",
 "/payroll": "payroll",
 "/time-attendance": "time-attendance",
 "/leave-management": "leave-management",
 "/annual-bonus": "annual-bonus",
 "/employee-portal": "employee-portal",
 "/crm": "crm",
 "/ai": "ai",
 "/security": "security",
 "/api": "api",
 "/core": "core",
 "/payment": "payment",
 "/manufacturing": "manufacturing",
 "/contracting": "contracting",
 "/marketplace": "marketplace",
 "/reminders": "reminders",
 "/loyalty": "loyalty",
 "/mobile": "mobile",
 "/ecosystem": "ecosystem",
 "/reports-builder": "reports-builder",
 "/document-templates": "document-templates",
 "/multi-currency-report": "multi-currency-report",
 "/email-queue": "email-queue",
 "/sms-templates": "sms-templates",
 "/tags-analytics": "tags-analytics",
 "/workflow-editor": "workflow-editor",
 "/forecast-comparison": "forecast-comparison",
 "/document-merge": "document-merge",
 };
 const mod = map[detail]?? detail.replace(/^\//, "");
 // FIX(v18-گیت مرکزی): مسیر navigate-link هم از قفل پلن عبور می‌کند
 goToModule(mod);
 };
 window.addEventListener("hoshhesab:navigate-link", onNavigateLink as EventListener);
 return () =>
 window.removeEventListener("hoshhesab:navigate-link", onNavigateLink as EventListener);
 }, [goToModule]);

 // گوش دادن به رویداد سفارشی hoshhesab:navigate از Quick Access در داشبورد
 // detail: { module: string, action?: string }
 // ابتدا به ماژول هدف هدایت می‌کند، سپس رویداد باز کردن دیالوگ مخصوص آن ماژول را emit می‌کند.
 React.useEffect(() => {
 const onQuickNavigate = (e: Event) => {
 const detail = (e as CustomEvent<{ module: string; action?: string }>).detail;
 if (!detail || typeof detail!== "object" ||!detail.module) return;
 const mod = String(detail.module);
 // FIX(v18-گیت مرکزی): ناوبری Quick Access هم از قفل پلن عبور می‌کند
 goToModule(mod);
 if (!hasModuleAccess(userPlanRef.current, mod)) return;
 // اعمال اکشن در تیک بعدی تا ماژول لود شود
 const action = detail.action;
 if (action) {
 setTimeout(() => {
 // دیالوگ ایجاد فاکتور (همان فرم اصلی)
 if (action === "new-invoice") {
 setInvoiceFormOpen(true);
 return;
 }
 // سایر اکشن‌ها — ماژول‌ها خودشان به این رویدادها گوش می‌دهند
 window.dispatchEvent(
 new CustomEvent("hoshhesab:module-action", {
 detail: { module: mod, action },
 })
 );
 }, 80);
 }
 };
 window.addEventListener("hoshhesab:navigate", onQuickNavigate as EventListener);
 return () =>
 window.removeEventListener("hoshhesab:navigate", onQuickNavigate as EventListener);
 }, [goToModule]);

 // FIX(H8): هدایت‌های render-time به effect منتقل شد — setState حین render ممنوع
 React.useEffect(() => {
 if (view === "superadmin" &&!adminToken) {
 setView("landing");
 }
 if (view === "account" &&!userToken) {
 toast({
 title: "ورود لازم است",
 description: "برای مشاهده حساب کاربری ابتدا وارد شوید.",
 });
 setView("app");
 }
 }, [view, adminToken, userToken, toast]);

 // بارگذاری توکن‌های ذخیره‌شده
 // نکته: پنل سوپرادمین فقط از طریق ورود با احراز هویت در دسترس است،
 // نه از طریق URL hash یا query string.
 React.useEffect(() => {
 if (typeof window === "undefined") return;

 // توکن‌های ذخیره‌شده
 const storedAdmin = getStoredAdminToken();
 const storedAdminUser = getStoredAdminUser();
 let storedUserToken: string | null = null;
 try {
 storedUserToken = localStorage.getItem(USER_TOKEN_KEY);
 } catch {
 /* localStorage not available (private mode) — ignore */
 }

 if (storedUserToken) setUserToken(storedUserToken);

 // اولویت انتخاب پنل:
 // ۱) آخرین نمای فعال در sessionStorage همان باز شود (سوپرادمین می‌تواند بین دو پنل سوئیچ کند)
 // ۲) توکن کاربر پنل کاربر
 // ۳) فقط توکن ادمین پنل سوپرادمین
 // نکته: ورود به پنل سوپرادمین فقط از طریق روش مخفی (تایپ superadmin در دیالوگ ورود کاربر) انجام می‌شود.
 let lastView: string | null = null;
 try {
 lastView = sessionStorage.getItem("hoshhesab_last_view");
 } catch { /* ignore */ }

 if (storedAdmin && storedAdminUser && lastView === "superadmin") {
 setAdminToken(storedAdmin);
 setAdminUser(storedAdminUser);
 setView("superadmin");
 } else if (storedUserToken) {
 // اگر توکن کاربر داریم مستقیم وارد اپ می‌شویم
 setView("app");
 // FIX(v12.1 — UX): بازیابی آخرین ماژول فعال کاربر (بازگشت به همان‌جایی که
 // بود) — قبلاً همیشه به داشبورد برمی‌گشت. برای کاربرانی که روزانه با یک
 // ماژول خاص (مثلاً فاکتورها) کار می‌کنند صرفه‌جویی واقعی در کلیک‌هاست.
 try {
 const lastModule = sessionStorage.getItem("hoshhesab_last_module");
 if (lastModule && /^[a-z0-9-]{2,40}$/.test(lastModule)) {
 setActiveModule(lastModule);
 }
 } catch { /* sessionStorage unavailable */ }
 } else if (storedAdmin && storedAdminUser) {
 setAdminToken(storedAdmin);
 setAdminUser(storedAdminUser);
 setView("superadmin");
 } else {
 // اولین بازدید بدون توکن نمایش لندینگ
 setView("landing");
 }
 }, []);

 // FIX(v12.1 — سیستم رفرال): گرفتن ?ref= از لینک دعوت → ذخیره در localStorage
 // تا در فرم ثبت‌نام/چک‌اوت به‌صورت خودکار prefill شود. پارامتر از URL پاک
 // می‌شود (لینک تمیز). این حلقهٔ گمشدهٔ اصلی قیف رفرال بود.
 React.useEffect(() => {
 if (typeof window === "undefined") return;
 try {
 const params = new URLSearchParams(window.location.search);
 const ref = params.get("ref");
 if (ref && /^[A-Za-z0-9-]{4,24}$/.test(ref)) {
 localStorage.setItem("hoshhesab_referral_code", ref.toUpperCase());
 params.delete("ref");
 const qs = params.toString();
 window.history.replaceState(
 null,
 "",
 window.location.pathname + (qs ? `?${qs}` : "")
 );
 }
 } catch {
 /* ignore */
 }
 }, []);

 // تشخیص توکن کاربر در query (برای ورود از طریق لینک)
 // پشتیبانی از دو فلو:
 // FIX(v4-PWA): ?module=<id> — shortcutهای PWA (داشبورد/فاکتور جدید) و لینک‌های
 // عمیق؛ اگر کاربر لاگین است مستقیم به ماژول خواسته‌شده می‌رود
 React.useEffect(() => {
 if (typeof window === "undefined") return;
 const params = new URLSearchParams(window.location.search);
 const m = params.get("module");
 if (!m) return;
 const known =
 NAV_ITEMS.some((n) => n.id === m) ||
 [
 "products",
 "parties",
 "warehouse",
 "reports",
 "settings",
 "modian",
 "tax",
 "mobile",
 ].includes(m);
 if (known) {
 // FIX(v11-gate): مسیر عمیق هم از گیت پلن عبور می‌کند (مثل بقیه ناوبری)
 goToModule(m);
 // FIX(v11-deeplink): ?module=X&invoice|expense|party|product=<id> —
 // باز کردن مستقیم سند/موجودیت در ماژول مقصد (لینک‌های هوش‌یار و اشتراک‌ها).
 // pending در sessionStorage می‌ماند تا اگر کاربر هنوز لاگین نبود، ماژول
 // بعد از mount آن را بخواند (رویداد زنده هم برای حالت مونت‌شده ارسال می‌شود).
 const entityId =
 params.get("invoice") ||
 params.get("expense") ||
 params.get("party") ||
 params.get("product");
 if (entityId) {
 const entityType = params.get("invoice")
 ? "invoice"
 : params.get("expense")
 ? "expense"
 : params.get("party")
 ? "party"
 : "product";
 const payload = { module: m, type: entityType, id: entityId };
 try {
 sessionStorage.setItem(
 "hoshhesab_pending_open",
 JSON.stringify(payload)
 );
 } catch {
 /* ignore */
 }
 // رویداد زنده — اگر ماژول همین حالا مونت است
 window.dispatchEvent(
 new CustomEvent("hoshhesab:open-entity", { detail: payload })
 );
 }
 // پاکسازی پارامتر از history (bookmark تمیز)
 try {
 window.history.replaceState(
 null,
 "",
 window.location.pathname + (params.get("source") ? `?source=${params.get("source")}` : "")
 );
 } catch {
 /* ignore */
 }
 }
 }, []);

 // FIX(v10-checkout): ?buy=<planId> — خرید مستقیم از صفحه قیمت‌گذاری سئو؛
 // به ویو قیمت‌گذاری اپ می‌رود و چک‌اوت همان پلن باز می‌شود
 React.useEffect(() => {
 if (typeof window === "undefined") return;
 const params = new URLSearchParams(window.location.search);
 const buy = params.get("buy");
 if (!buy) return;
 if (["basic", "pro"].includes(buy)) {
 setPresetBuyPlan(buy as "basic" | "pro");
 setView("pricing");
 } else if (buy === "enterprise") {
 setView("pricing");
 }
 try {
 window.history.replaceState(null, "", window.location.pathname);
 } catch {
 /* ignore */
 }
 }, []);

 // 1)?token=... — ورود از لینک ساده
 // 2)?paid=1&token=... — ورود پس از پرداخت موفق (register-and-pay)
 // FIX(B18): توکن قبل از پذیرش با /api/auth/me اعتبارسنجی می‌شود — قبلاً
 // هر ?token=garbage به‌عنوان «ورود موفق» پذیرفته و یک پوسته خراب می‌ساخت.
 React.useEffect(() => {
 if (typeof window === "undefined") return;
 const params = new URLSearchParams(window.location.search);
 const t = params.get("token");
 const isPaid = params.get("paid") === "1";
 if (t) {
 let cancelled = false;
 (async () => {
 let valid = false;
 try {
 const res = await fetch("/api/auth/me", {
 headers: { Authorization: `Bearer ${t}` },
 });
 valid = res.ok;
 } catch {
 valid = false;
 }
 if (cancelled) return;
 if (!valid) {
 toast({
 title: "لینک ورود نامعتبر است",
 description: "لینک منقضی شده؛ لطفاً دوباره وارد شوید.",
 variant: "destructive",
 });
 setView("auth");
 return;
 }
 try {
 localStorage.setItem(USER_TOKEN_KEY, t);
 } catch {
 /* ignore */
 }
 setUserToken(t);
 setView("app");
 setActiveModule("dashboard");
 // پاکسازی query string (توکن از history پاک شود)
 try {
 window.history.replaceState(null, "", window.location.pathname);
 } catch {
 /* ignore */
 }
 if (isPaid) {
 toast({
 title: "پرداخت موفق!",
 description: "حساب شما با موفقیت فعال شد. به پنل هوش خوش آمدید.",
 });
 } else {
 toast({
 title: "ورود موفق",
 description: "حساب کاربری شما فعال شد.",
 });
 }
 })();
 return () => {
 cancelled = true;
 };
 }
 }, [toast]);

 // اجرای تور joyride برای کاربران جدید (اگر قبلاً تکمیل نشده باشد)
 // این تنها تور فعال است — جذاب، حرفه‌ای و کوتاه
 React.useEffect(() => {
 if (view === "app" && userToken &&!isJoyrideTourDone()) {
 const t = setTimeout(() => setTourRun(true), 1500);
 return () => clearTimeout(t);
 }
 }, [view, userToken]);

 // PERF+STABILITY: پیش‌بارگذاری چانک ماژول‌های پرکاربرد — اما «پلکانی»
 // (یکی هر ۴ ثانیه، نه همه با هم).
 // WHY: در سرور توسعهٔ سندباکس (RAM ۴GB)، درخواست همزمان ۶ ماژول → کامپایل
 // همزمان ۶ چانک → جهش حافظهٔ Turbopack تا ~۳GB → OOM-kill سرور → «در حال
 // بارگذاری ماژول...» بی‌پایان برای کاربر (شکایت مالک: گیرکردن ۹۰٪).
 // با پلکانی‌کردن، پیک کامپایل نصف می‌شود و سرور زنده می‌ماند.
 React.useEffect(() => {
 if (view!== "app" ||!userToken) return;
 // ترتیب اولویت: پرکاربردترین اول
 const modules = [
 () => import("@/components/modules/quick-invoice"),
 () => import("@/components/modules/pos-terminal"),
 () => import("@/components/modules/quick-expense"),
 () => import("@/components/modules/end-of-day"),
 () => import("@/components/modules/invoices"),
 () => import("@/components/modules/inventory"),
 // Task 2-a — گرم‌کردن چانک درون‌ریزی: شکایت #۱ مالک «ایمپورت کالا نخوند»
 // ریشهٔ OOM گاه‌گاهی بود؛ با پیش‌کامپایل آرام در پس‌زمینه، باز شدن ماژول
 // «واردات و صادرکرد» سریع و بدون فشار لحظه‌ای حافظه انجام می‌شود
 () => import("@/components/modules/data-import-export"),
 ];
 let idx = 0;
 let alive = true;
 const timers: ReturnType<typeof setTimeout>[] = [];
 const step = () => {
 if (!alive || idx >= modules.length) return;
 const fn = modules[idx++];
 fn().catch(() => {});
 // ماژول بعدی ۴ ثانیه بعد — کامپایل قبلی تمام شده باشد
 timers.push(setTimeout(step, 4000));
 };
 const start = () => {
 if (!alive) return;
 step();
 };
 if ("requestIdleCallback" in window) {
 const id = window.requestIdleCallback(start, { timeout: 3000 });
 timers.push(setTimeout(() => window.cancelIdleCallback(id), 5000));
 } else {
 timers.push(setTimeout(start, 1500));
 }
 return () => {
 alive = false;
 for (const t of timers) clearTimeout(t);
 };
 }, [view, userToken]);

 // شروع مجدد تور از منوی کاربری
 const handleStartTour = React.useCallback(() => {
 resetJoyrideTour();
 // ابتدا مطمئن می‌شویم فرم فاکتور بسته است تا تداخل با مرحله‌ی سایدبار نداشته باشیم
 setInvoiceFormOpen(false);
 // اجرای تور در تیک بعدی تا resetJoyrideTour اعمال شود
 setTourRun(false);
 setTimeout(() => setTourRun(true), 50);
 }, []);

 // مدیریت باز/بستن فرم فاکتور بر اساس مرحله‌ی تور joyride
 // تور فعلی ۵ مرحله دارد: sidebar, quick-create, ai-assistant, cmd-k, settings
 // هیچ مرحله‌ای نیاز به باز کردن فرم فاکتور ندارد. فقط در پایان تور،
 // اگر کاربر قبلاً فرم را باز کرده بود، آن را نمی‌بندیم.
 const handleTourStep = React.useCallback(
 (index: number, type: string) => {
 if (type === "tour:end") {
 // پس از پایان تور، فرم فاکتوری که خود تور باز کرده بود را می‌بندیم
 // (در نسخه‌ی فعلی تور، فرمی باز نمی‌کنیم — اما برای اطمینان)
 setInvoiceFormOpen(false);
 return;
 }
 // index در تور فعلی به مراحل زیر اشاره می‌کند:
 // 0=sidebar, 1=quick-create, 2=ai-assistant, 3=cmd-k, 4=settings
 // هیچ اقدام خاصی نیاز نیست.
 void index;
 },
 []
 );

 // باز کردن دستیار مالی از طریق رویداد سفارشی (برای MobileBottomNav)
 const handleOpenAssistant = React.useCallback(() => {
 window.dispatchEvent(new CustomEvent("hoshhesab:open-assistant"));
 }, []);

 // ارتقای حساب — هدایت به صفحه تعرفه‌ها برای انتخاب پلن و پرداخت
 const handleOpenUpgrade = React.useCallback(() => {
 trackEvent(AnalyticsEvents.UPGRADE_MODAL_OPEN);
 // به‌جای باز کردن مودال لایسنس، به صفحه تعرفه‌ها می‌رویم
 setView("pricing");
 }, []);

 // پس از ارتقا موفق، صفحه را reload می‌کنیم تا وضعیت لایسنس به‌روزرسانی شود
 const handleUpgraded = React.useCallback(() => {
 toast({
 title: "ارتقا حساب موفق بود",
 description: "حساب شما به Premium ارتقا یافت. در حال به‌روزرسانی...",
 });
 // پاک‌سازی بنر تریال از session
 try {
 sessionStorage.removeItem("hoshhesab_trial_banner_dismissed_session");
 } catch {
 /* ignore */
 }
 // reload پس از 600ms برای نمایش toast
 setTimeout(() => {
 if (typeof window!== "undefined") window.location.reload();
 }, 600);
 }, [toast]);

 // گوش دادن به رویداد سفارشی «new-invoice» از ماژول‌ها
 React.useEffect(() => {
 const onNewInvoice = () => setInvoiceFormOpen(true);
 const onExportReq = () => {
 toast({
 title: "خروجی",
 description: "از دکمه «خروجی» در ماژول فاکتورها استفاده کنید.",
 });
 };
 window.addEventListener("hoshhesab:new-invoice", onNewInvoice as EventListener);
 window.addEventListener("hoshhesab:export", onExportReq as EventListener);
 // ─── Session expired listener ───
 // وقتی authFetch توکن 401 دریافت کند، این رویداد دیسپچ می‌شود
 const onSessionExpired = () => {
 setUserToken(null);
 setUserInfo(null);
 setView("landing");
 toast({
 title: "نشست منقضی شد",
 description: "لطفاً دوباره وارد شوید.",
 variant: "destructive",
 });
 };
 window.addEventListener("hoshhesab:session-expired", onSessionExpired);
 return () => {
 window.removeEventListener("hoshhesab:new-invoice", onNewInvoice as EventListener);
 window.removeEventListener("hoshhesab:export", onExportReq as EventListener);
 window.removeEventListener("hoshhesab:session-expired", onSessionExpired);
 };
 }, [toast]);

 // میانبر Cmd+K / Ctrl+K
 React.useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
 e.preventDefault();
 trackEvent(AnalyticsEvents.COMMAND_PALETTE_OPEN, { source: "keyboard" });
 setCmdOpen((o) =>!o);
 }
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, []);

 // PERF(speed): پیش‌بارگذاری چانک ماژول‌های پرکاربرد در زمان بیکاری مرورگر
 // → سوئیچ بین قسمت‌ها (سایدبار/ناوبری پایین موبایل) آنی می‌شود.
 // اول core (۵ ماژول نوار پایین + فاکتور سریع) بعد از ورود به پنل،
 // سپس ماژول‌های ثانویه با اولویت پایین‌تر.
 React.useEffect(() => {
 if (view!== "app") return;
 const t1 = setTimeout(() => prewarmCoreMobile(), 600);
 const t2 = setTimeout(() => prewarmSecondaryModules(), 6000);
 return () => {
 clearTimeout(t1);
 clearTimeout(t2);
 };
 }, [view]);

 // PERF(speed): ماژول فعلی همیشه پیش‌گرم شود (مثلاً بعد از refresh مستقیم)
 React.useEffect(() => {
 if (view === "app") prewarmModule(activeModule);
 }, [view, activeModule]);

 // MODULE-MANAGER(25-A): منوی مؤثر این tenant — تنظیم‌شده توسط سوپرادمین
 // (ترتیب/نام/بج/مخفی/آیتم دلخواه + override پلن فعال از /api/module-config).
 // اگر fetch شکست بخورد یا خروجی نامعتبر باشد، همان NAV_ITEMS پیش‌فرض
 // می‌ماند — اپ هرگز نمی‌شکند. آیکون‌ها با نام رشته‌ای می‌آیند و با
 // navIconByName به کامپوننت resolve می‌شوند (fallback: Circle).
 const [effectiveNav, setEffectiveNav] = React.useState<NavItem[] | null>(null);
 React.useEffect(() => {
 if (!userToken) {
 setEffectiveNav(null);
 return;
 }
 if (view !== "app") return;
 let cancelled = false;
 (async () => {
 try {
 const res = await authFetch("/api/module-config");
 if (!res.ok) return;
 const json = await res.json().catch(() => null);
 const rawList: unknown[] = Array.isArray(json?.data?.nav) ? json.data.nav : [];
 if (cancelled || rawList.length === 0) return;
 const nav: NavItem[] = [];
 for (const raw of rawList) {
 if (!raw || typeof raw !== "object") continue;
 const r = raw as Record<string, unknown>;
 const id = typeof r.id === "string" ? r.id : "";
 if (!id) continue;
 nav.push({
 id,
 label: typeof r.label === "string" && r.label.trim() ? r.label : id,
 icon: navIconByName(typeof r.icon === "string" ? r.icon : undefined),
 group: typeof r.group === "string" && r.group.trim() ? r.group : "سایر",
 badge: typeof r.badge === "string" && r.badge ? r.badge : undefined,
 url: typeof r.url === "string" && r.url ? r.url : undefined,
 });
 }
 if (!cancelled && nav.length > 0) setEffectiveNav(nav);
 } catch {
 /* fallback به NAV_ITEMS پیش‌فرض */
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [view, userToken]);

 // THEME(25-B): تم فعال — آیکون ماژول‌های کلیدی سایدبار براساس شخصیت تم عوض می‌شود
 const { themeId: activeThemeId } = useAppTheme();

 // USER-CONTENT(3-d): متن‌های بازنویسی‌شدهٔ سوپرادمین — یک‌بار با بوت پنل
 // کاربر واکشی و در فروش مشترک ذخیره می‌شود؛ اجزا با getUserContent
 // می‌خوانند (fallback امن به متن پیش‌فرض کد). تغییرات سوپرادمین پس از
 // بارگذاری مجدد صفحه در «همهٔ» پنل‌های کاربر اعمال می‌شود.
 const userContentOverrides = useUserContentOverrides();
 React.useEffect(() => {
 if (!userToken) {
 setUserContentOverrides(null);
 return;
 }
 if (view !== "app") return;
 let cancelled = false;
 (async () => {
 try {
 const res = await authFetch("/api/platform/user-content");
 if (!res.ok) return;
 const json = await res.json().catch(() => null);
 const content = json?.data?.content;
 if (!cancelled && content && typeof content === "object") {
 setUserContentOverrides(content);
 }
 } catch {
 /* fallback به متن‌های پیش‌فرض کد */
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [view, userToken]);

 const grouped = React.useMemo(() => {
 const groups: Record<string, NavItem[]> = {};
 for (const item of effectiveNav ?? NAV_ITEMS) {
 const themed = { ...item, icon: getThemeIcon(activeThemeId, item.id, item.icon) };
 if (!groups[themed.group]) groups[themed.group] = [];
 groups[themed.group].push(themed);
 }
 return groups;
 }, [effectiveNav, activeThemeId]);

 // عنوان نمایشی هر گروه از سایدبار با override سوپرادمین (USER-CONTENT(3-d))
 // — کلید گروه همان نام منطقی می‌ماند (چینش/بازوبسته) و فقط متن نمایش عوض می‌شود
 const groupTitles = React.useMemo(() => {
 const titles: Record<string, string> = {};
 for (const group of Object.keys(grouped)) {
 titles[group] = getNavGroupTitle(group);
 }
 return titles;
 }, [grouped, userContentOverrides]);

 // USER-CONTENT(3-d): عنوان/زیرعنوان سرصفحهٔ ماژول از متن‌های قابل‌ویرایش سوپرادمین
 const meta = React.useMemo(() => {
 const base = MODULE_TITLES[activeModule] || { title: "هوش", subtitle: "" };
 return {
 title: getUserContent(`module_title.${activeModule}`, base.title),
 subtitle: getUserContent(`module_subtitle.${activeModule}`, base.subtitle),
 };
 }, [activeModule, userContentOverrides]);

 const handlePrint = React.useCallback(() => {
 window.print();
 }, []);

 const handleExport = React.useCallback(() => {
 toast({
 title: "خروجی",
 description: "از دکمه «خروجی» در ماژول فاکتورها استفاده کنید.",
 });
 }, [toast]);

 const handleSearchFocus = React.useCallback(() => {
 trackEvent(AnalyticsEvents.COMMAND_PALETTE_OPEN, { source: "shortcut" });
 setCmdOpen(true);
 }, []);

 // کلید برای ریست کردن SafeBoundary هنگام فشردن «تلاش مجدد»
 const [moduleRetryKey, setModuleRetryKey] = React.useState(0);

 const handleModuleRetry = React.useCallback(() => {
 setModuleRetryKey((k) => k + 1);
 }, []);

 const handleBackToDashboard = React.useCallback(() => {
 setActiveModule("dashboard");
 }, []);

 // Esc — بستن هر دیالوگ باز
 const handleCloseDialog = React.useCallback(() => {
 setCmdOpen(false);
 setSettingsOpen(false);
 setInvoiceFormOpen(false);
 setUpgradeModalOpen(false);
 setAuthOpen(false);
 setTrialModalOpen(false);
 setTourRun(false);
 setMobileNavOpen(false);
 }, []);

 // Ctrl+S — ارسال فرم فعال (InvoiceForm یا هر فرم داخل main)
 const handleSubmitForm = React.useCallback(() => {
 if (typeof document === "undefined") return;
 // اول دکمه ثبت داخل InvoiceForm را امتحان کن (اگر دیالوگ باز است)
 const invoiceSubmitBtn = document.querySelector<HTMLButtonElement>(
 '[data-tour="invoice-form"] button[data-action="submit"]'
 );
 if (invoiceSubmitBtn &&!invoiceSubmitBtn.disabled) {
 invoiceSubmitBtn.click();
 return;
 }
 // fallback: اول فرم داخل <main> را امتحان کن
 const mainForm = document.querySelector<HTMLFormElement>("main form");
 if (mainForm) {
 mainForm.requestSubmit?.();
 return;
 }
 // هیچ فرمی نبود
 toast({
 title: "ذخیره",
 description: "هیچ فرم فعالی برای ذخیره‌سازی یافت نشد.",
 });
 }, [toast]);

 const marketingProps = {
 onBack: () => setView("app"),
 onNavigate: (v: ViewType) => setView(v),
 onOpenAuth: () => setAuthOpen(true),
 };

 // handler ورود فوری از پنل superadmin به حساب کاربر
 const handleQuickLogin = React.useCallback(
 (token: string, tenantName?: string) => {
 try {
 localStorage.setItem(USER_TOKEN_KEY, token);
 } catch {
 /* ignore */
 }
 setUserToken(token);
 setView("app");
 setActiveModule("dashboard");
 toast({
 title: "ورود فوری انجام شد",
 description: `به‌عنوان کاربر «${tenantName}» وارد شدید.`,
 });
 },
 [toast]
 );

 // ============ handler سوییچ شرکت (Tenant) ============
 // پس از دریافت توکن جدید از CompanySwitcher، آن را ذخیره و state را به‌روز می‌کنیم.
 // با تغییر userToken، motion.div محتوای ماژول با key جدید رندر می‌شود و داده‌ها refresh می‌شوند.
 const handleSwitchCompany = React.useCallback(
 (newToken: string) => {
 try {
 localStorage.setItem(USER_TOKEN_KEY, newToken);
 } catch {
 /* ignore */
 }
 setUserToken(newToken);
 // بازگشت به داشبورد برای دیدن داده‌های شرکت جدید
 setActiveModule("dashboard");
 },
 []
 );

 // ============ handler های تریال، دمو و ورود ============

 // ساخت حساب تریال ۳ روزه — از /api/trial/create
 // FIX(بازخورد کاربر «خطا در ساخت حساب»): تلاش خودکار مجدد برای خطاهای
 // گذرا (قطعی لحظه‌ای سرور/OOM سندباکس/تایم‌اوت) — خطاهای منطقی (۴۰۰/۴۰۹/۴۲۹)
 // بلافاصله به کاربر نشان داده می‌شوند و retry نمی‌خورند.
 const trialCreateRef = React.useRef<(() => Promise<void>) | null>(null);
 const handleTrialCreate = React.useCallback(async (): Promise<void> => {
 // FIX(بازخورد کاربر): اگر کاربر قبلاً در حالت دمو بوده، اول از دمو خارج شو
 // تا interceptor دمو POST ساخت حساب را بلاک نکند (پیام «خطا در ساخت حساب»)
 setIsDemoMode(false);
 setLoadingTrial(true);
 try {
 // FIX(v12.1 — سیستم رفرال): کد دعوت ذخیره‌شده (از لینک ?ref=) همراه
 // ساخت حساب تریال ارسال می‌شود تا دعوت‌کننده امتیاز بگیرد
 let referralCode: string | null = null;
 try {
 referralCode = localStorage.getItem("hoshhesab_referral_code");
 } catch {
 /* ignore */
 }
 // ANTI-FRAUD (v19): اثر انگشت دستگاه برای سد ضدتقلب (حداکثر ۲ ثبت‌نام/دستگاه)
 let deviceFingerprint: string | undefined;
 try {
 const { getDeviceFingerprint } = await import("@/lib/device-fingerprint");
 deviceFingerprint = await getDeviceFingerprint();
 } catch {
 /* بدون fp — سرور از IP+UA می‌سازد */
 }
 const body = JSON.stringify({
 companyName: undefined,
 referralCode: referralCode || undefined,
 deviceFingerprint: deviceFingerprint || undefined,
 });

 // ——— تلاش تا ۳ بار با فاصلهٔ فزاینده برای خطاهای گذرا ———
 const MAX_ATTEMPTS = 3;
 const BACKOFF_MS = [1500, 4000];
 let res: Response | null = null;
 let lastNetErr: unknown = null;
 for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
 try {
 res = await fetch("/api/trial/create", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body,
 });
 // فقط ۵xx گذرا retry می‌شود؛ ۴xx خطای منطقی است و فوراً برمی‌گردد
 if (res.status >= 500) {
 lastNetErr = new Error(`سرور موقتاً در دسترس نیست (${res.status})`);
 res = null;
 } else {
 break;
 }
 } catch (netErr) {
 // fetch خودش شکست خورد (سرور خاموش/OOM/قطعی لحظه‌ای)
 lastNetErr = netErr;
 res = null;
 }
 if (attempt < MAX_ATTEMPTS - 1) {
 await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt] ?? 4000));
 }
 }
 if (!res) {
 throw lastNetErr instanceof Error
 ? lastNetErr
 : new Error("سرور در دسترس نیست — لطفاً چند لحظه بعد دوباره تلاش کنید.");
 }
 const data = await res.json();
 if (!data.success ||!data.token) {
 throw new Error(data.error || "خطا در ساخت حساب تریال");
 }
 // ذخیره توکن
 try {
 localStorage.setItem(USER_TOKEN_KEY, data.token);
 } catch {
 /* ignore */
 }
 setUserToken(data.token);
 // نمایش مودال با اطلاعات کاربری
 setTrialCredentials({
 username: data.user.username,
 password: data.user.password,
 trialEndsAt: data.trialEndsAt,
 companyName: data.tenant?.name,
 });
 setTrialModalOpen(true);
 trackEvent(AnalyticsEvents.TRIAL_CREATE, {
 tenantId: data.tenant?.id,
 plan: data.tenant?.plan,
 });
 toast({
 title: "حساب تریال ساخته شد",
 description: "۳ روز رایگان فعال است — اطلاعات ورود را ذخیره کنید.",
 });
 } catch (err) {
 // FIX(بازخورد کاربر «خطا در ساخت حساب»): پیام خطا شفاف‌تر + در حالت
 // rate-limit (429) پیشنهاد مستقیم ورود به دمو به‌جای خطای خشک.
 // FIX(v13.5 — دکمهٔ «تلاش دوباره» در خود toast): خطاهای گذرا دیگر
 // بن‌بست نیستند — کاربر با یک کلیک همان فل را دوباره اجرا می‌کند.
 const msg = err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.";
 const isRateLimited = /حد مجاز|رسیده‌اید|بیش از حد/i.test(msg);
 toast({
 title: isRateLimited? "محدودیت موقت ساخت حساب": "خطا در ساخت حساب",
 description: isRateLimited
 ? `${msg} برای مشاهده بی‌درنگ همه امکانات، از دکمه «ورود به دمو» استفاده کنید.`
 : msg,
 variant: "destructive",
 duration: isRateLimited? 9000: 10000,
 action: (
 <ToastAction
 altText="تلاش دوباره ساخت حساب"
 onClick={() => {
 void trialCreateRef.current?.();
 }}
 >
 تلاش دوباره
 </ToastAction>
 ),
 });
 } finally {
 setLoadingTrial(false);
 }
 }, [toast, setIsDemoMode]);

 // اتصال ref بعد از تعریف callback — برای دکمهٔ «تلاش دوباره» در toast
 React.useEffect(() => {
 trialCreateRef.current = handleTrialCreate;
 }, [handleTrialCreate]);

 // ورود به حالت دمو — از /api/demo/access
 // FIX(v13.5): همان الگوی retry ساخت حساب — خطای گذرای سرور نباید ورود دمو را بلاک کند
 const demoAccessRef = React.useRef<(() => Promise<void>) | null>(null);
 const handleDemoAccess = React.useCallback(async (): Promise<void> => {
 setLoadingDemo(true);
 try {
 const MAX_ATTEMPTS = 3;
 const BACKOFF_MS = [1500, 4000];
 let res: Response | null = null;
 let lastNetErr: unknown = null;
 for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
 try {
 res = await fetch("/api/demo/access", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 });
 if (res.status >= 500) {
 lastNetErr = new Error(`سرور موقتاً در دسترس نیست (${res.status})`);
 res = null;
 } else {
 break;
 }
 } catch (netErr) {
 lastNetErr = netErr;
 res = null;
 }
 if (attempt < MAX_ATTEMPTS - 1) {
 await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt] ?? 4000));
 }
 }
 if (!res) {
 throw lastNetErr instanceof Error
 ? lastNetErr
 : new Error("سرور در دسترس نیست — لطفاً چند لحظه بعد دوباره تلاش کنید.");
 }
 const data = await res.json();
 if (!data.success ||!data.token) {
 throw new Error(data.error || "خطا در ورود دمو");
 }
 // ذخیره توکن و فعال‌سازی حالت دمو
 try {
 localStorage.setItem(USER_TOKEN_KEY, data.token);
 } catch {
 /* ignore */
 }
 setUserToken(data.token);
 setIsDemoMode(true);
 setView("app");
 setActiveModule("dashboard");
 trackEvent(AnalyticsEvents.DEMO_ACCESS, { tenantId: data.tenant?.id });
 toast({
 title: "ورود به حالت دمو",
 description:
 "محیط دمو با داده‌های نمونه — صندوق فروش POS را می‌توانید کامل تست کنید. برای استفاده واقعی، حساب خود را بسازید.",
 });
 } catch (err) {
 toast({
 title: "خطا در ورود دمو",
 description:
 err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 duration: 10000,
 action: (
 <ToastAction
 altText="تلاش دوباره ورود دمو"
 onClick={() => {
 void demoAccessRef.current?.();
 }}
 >
 تلاش دوباره
 </ToastAction>
 ),
 });
 } finally {
 setLoadingDemo(false);
 }
 }, [toast, setIsDemoMode]);

 // اتصال ref بعد از تعریف callback — برای دکمهٔ «تلاش دوباره» در toast دمو
 React.useEffect(() => {
 demoAccessRef.current = handleDemoAccess;
 }, [handleDemoAccess]);

 // ورود معمولی — باز کردن مودال احراز هویت
 const handleLogin = React.useCallback(() => {
 setAuthOpen(true);
 }, []);

 // ورود موفق کاربر از فرم AuthView (یوزر/پسورد)
 const handleUserLoginSuccess = React.useCallback(
 (token: string) => {
 // ورود واقعی همیشه از حالت دمو خارج می‌کند
 setIsDemoMode(false);
 try {
 localStorage.setItem(USER_TOKEN_KEY, token);
 } catch {
 /* ignore */
 }
 setIsDemoMode(false);
 setUserToken(token);
 setView("app");
 setActiveModule("dashboard");
 toast({
 title: "ورود موفق",
 description: "به پنل هوش خوش آمدید.",
 });
 },
 [toast, setIsDemoMode]
 );

 // ورود موفق سوپرادمین از فرم AuthView
 const handleSuperAdminLoginSuccess = React.useCallback(
 (
 token: string,
 admin: { id: string; username: string; role: string }
 ) => {
 setAdminToken(token);
 setAdminUser(admin);
 setView("superadmin");
 toast({
 title: "ورود موفق",
 description: "به هوش خوش آمدید.",
 });
 },
 [toast]
 );

 // پس از کلیک روی «ورود به پنل» در مودال تریال
 const handleEnterPanelFromTrial = React.useCallback(() => {
 setView("app");
 setActiveModule("dashboard");
 }, []);

 // ============ prefetch ماژول‌های حیاتی برای لود سریع‌تر ============
 // پس از ورود، chunkهای ماژول‌های پرکاربرد را پیش‌بارگذاری می‌کنیم
 React.useEffect(() => {
 if (view!== "app" ||!userToken) return;
 // import واقعی برای گرم کردن chunk cache — سرعت لود اولین کلیک را افزایش می‌دهد
 import("@/components/modules/dashboard").catch(() => {});
 setTimeout(() => {
 import("@/components/modules/invoices").catch(() => {});
 }, 500);
 setTimeout(() => {
 import("@/components/modules/core-accounting").catch(() => {});
 }, 1000);
 setTimeout(() => {
 import("@/components/modules/inventory").catch(() => {});
 }, 1500);
 }, [view, userToken]);

 // خروج از حساب + پاک‌سازی توکن + خروج از سرویس‌های اکوسیستم
 const handleLogout = React.useCallback(async () => {
 // باطل‌کردن نشست در سرور (FIX B1/B10) — قبل از پاک‌کردن توکن محلی
 try {
 const token = localStorage.getItem(USER_TOKEN_KEY);
 if (token) {
 void fetch("/api/auth/me", {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 }).catch(() => {
 /* network error — ignore */
 });
 }
 } catch {
 /* ignore */
 }
 // خروج از سرویس‌های اکوسیستم متصل (best-effort، بدون مسدود کردن UI)
 try {
 const token = localStorage.getItem(USER_TOKEN_KEY);
 if (token) {
 // fire-and-forget — اگر خطا داد، باز هم از سیستم محلی خارج می‌شویم
 void fetch("/api/ecosystem/signout-all", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}` },
 }).catch(() => {
 /* network error — ignore */
 });
 }
 } catch {
 /* ignore */
 }

 try {
 localStorage.removeItem(USER_TOKEN_KEY);
 localStorage.removeItem("hoshhesab_is_demo");
 } catch {
 /* ignore */
 }
 // FIX(v6 — ریشهٔ «خطا در ساخت حساب»): خروج باید حالت دمو را هم خاموش کند.
 // قبلاً کلید غلط (hoshhesab_is_demo) پاک می‌شد ولی DemoProvider از
 // «hoshhesab_demo_mode» استفاده می‌کند — یعنی بعد از خروج از دمو،
 // interceptor دمو فعال می‌ماند و همهٔ POSTهای بعدی (از جمله «شروع رایگان»)
 // بلاک می‌شدند و پیام «خطا در ساخت حساب» ظاهر می‌شد.
 setIsDemoMode(false);
 setUserToken(null);
 setView("landing");
 toast({
 title: "خروج موفق",
 description: "از حساب کاربری و همه‌ی سرویس‌های متصل خارج شدید.",
 });
 }, [toast, setIsDemoMode]);

 // تمدید لایسنس (فعلاً هدایت به صفحه قیمت‌گذاری)
 const handleRenewLicense = React.useCallback(() => {
 setView("landing");
 toast({
 title: "تمدید لایسنس",
 description: "برای تمدید، یکی از پلن‌ها را انتخاب کنید.",
 });
 }, [toast]);

 // ============ نمای پنل مدیریت (مخفی) ============
 if (view === "superadmin") {
 if (adminToken && adminUser) {
 return (
 <SafeBoundary
 key={`superadmin-${moduleRetryKey}`}
 resetKey={moduleRetryKey}
 fallback={
 <ModuleErrorFallback
 name="بخش مدیریت"
 onRetry={handleModuleRetry}
 onBackToDashboard={handleBackToDashboard}
 />
 }
 >
 <SuperAdminPanel
 token={adminToken}
 admin={adminUser}
 onLogout={() => {
 setAdminToken(null);
 setAdminUser(null);
 setView("app");
 }}
 onQuickLogin={handleQuickLogin}
 onBackToSite={() => {
 // اگر حالت «ویرایشگر سایت» فعال است → به صفحه فرود می‌رویم
 // (ویرایشگر کلیک-به-ویرایش روی لندینگ فعال می‌شود)
 try {
 if (window.sessionStorage.getItem("hoosh_site_editor") === "1") {
 setView("landing");
 return;
 }
 } catch {
 /* sessionStorage در دسترس نیست */
 }
 setView("app");
 }}
 />
 </SafeBoundary>
 );
 }
 // بدون توکن ادمین — هدایت در useEffect انجام می‌شود (FIX H8)
 // قبلاً setView در حین render صدا زده می‌شد → خطای React
 return null;
 }

 // ============ نمای حساب کاربری ============
 if (view === "account") {
 const token = userToken || "";
 // FIX H8: هدایت در useEffect (قبلاً toast + setView حین render → خطای React)
 if (!token) {
 return null;
 }
 return <AccountView token={token} onBack={() => setView("app")} />;
 }

 // صفحات بازاریابی — تمام عرض، بدون سایدبار
 if (view!== "app") {
 return (
 <>
 {view === "pricing" && <PricingView {...marketingProps} presetPlanId={presetBuyPlan} onPresetConsumed={() => setPresetBuyPlan(null)} />}
 {view === "landing" && (
 <LandingDynamic
 onTrialCreate={handleTrialCreate}
 onDemoAccess={handleDemoAccess}
 onLogin={handleLogin}
 onNavigate={setView}
 loadingTrial={loadingTrial}
 loadingDemo={loadingDemo}
 isLoggedIn={!!userToken}
 />
 )}
 {view === "blog" && <BlogView {...marketingProps} />}
 {view === "support" && <SupportView {...marketingProps} />}
 {view === "legal" && <LegalView {...marketingProps} />}
 <AuthView
 open={authOpen}
 onOpenChange={setAuthOpen}
 onTrialCreate={handleTrialCreate}
 onUserLoginSuccess={handleUserLoginSuccess}
 onSuperAdminLoginSuccess={handleSuperAdminLoginSuccess}
 onDemoAccess={handleDemoAccess}
 />
 <TrialSuccessModal
 open={trialModalOpen}
 onOpenChange={setTrialModalOpen}
 credentials={trialCredentials}
 onEnterPanel={handleEnterPanelFromTrial}
 />
 <AIAssistantAgent onNavigate={goToModule} />
 </>
 );
 }

 const renderModule = (moduleId: string) => {
 // هِلپر برای پوشش دادن هر ماژول در SafeBoundary مخصوص خودش.
 // اگر یک ماژول کرش کند، فقط همان ماژول fallback می‌گیرد و بقیه‌ی اپ کار می‌کند.
 // PERF(speed): انیمیشن ورود کوتاه (۱۵۰ms) — سوئیچ بین قسمت‌ها «آنی» حس می‌شود
 // (در بازگشت به ماژول keep-alive شده انیمیشنی نیست — فقط اولین mount)
 const wrap = (name: string, node: React.ReactNode) => (
 <div key={`${moduleId}-anim`} className="module-enter">
 <SafeBoundary
 resetKey={moduleRetryKey}
 fallback={
 <ModuleErrorFallback
 name={name}
 onRetry={handleModuleRetry}
 onBackToDashboard={handleBackToDashboard}
 />
 }
 >
 {node}
 </SafeBoundary>
 </div>
 );

 switch (moduleId) {
 case "dashboard":
 return (
 <>
 {/* تبلیغات — بالاترین نقطه داشبورد، در جریان عادی سند (بدون تداخل با محتوا) */}
 <AdBanner />
 {wrap("داشبورد", <CustomizableDashboard role={userRole} />)}
 </>
 );
 case "core": return wrap("هسته حسابداری", <CoreAccounting />);
 case "fiscal-year": return wrap("مدیریت سال مالی", <FiscalYearManager />);
 case "pos": return wrap("صندوق فروش (POS)", <PosTerminal />);
case "quick-invoice": return wrap("فاکتور سریع", <QuickInvoice />);
 case "quick-invoice-list": return wrap("فاکتورها", <QuickInvoiceListLazy />);
 case "quick-expense": return wrap("هزینه سریع", <QuickExpense />);
 case "end-of-day": return wrap("گزارش پایان روز", <EndOfDayReport />);
 case "invoices": return wrap("خرید و فروش", <Invoices />);
 case "treasury": return wrap("خزانه‌داری و چک", <Treasury />);
 case "tax": return wrap("ارزش افزوده و مالیات", <TaxModule />);
 case "tax-filing": return wrap("اظهارنامه مالیاتی", <TaxFilingModule token={userToken || ""} />);
 case "modian": return wrap("سامانه مودیان", <ModianModule />);
 case "payment": return wrap("درگاه پرداخت", <PaymentGatewayModule />);
 case "inventory": return wrap("انبار و کالا", <Inventory />);
 case "ecommerce": return wrap("فروشگاه و بازارها", <EcommerceModule />);
 case "payroll": return wrap("حقوق و دستمزد", <Payroll />);
 case "time-attendance": return wrap("زمان و حضور", <TimeAttendanceModule />);
 case "leave-management": return wrap("مدیریت مرخصی", <LeaveManagementModule />);
 case "annual-bonus": return wrap("عیدی و سنوات", <AnnualBonusModule />);
 case "employee-portal": return wrap("پورتال کارکنان", <EmployeePortalModule />);
 case "crm": return wrap("CRM", <CRMModule />);
 case "ai": return wrap("هوش مصنوعی", <AIModule />);
 case "security": return wrap("امنیت و کاربران", <SecurityModule />);
 case "account": return wrap("حساب کاربری", <AccountView token={userToken || ""} onBack={() => setActiveModule("dashboard")} />);
 case "referral": return wrap("دعوت دوستان", <ReferralWidgetModule />);
 case "wallet": return wrap("کیف پول", <WalletModule />);
 case "bug-report": return wrap("گزارش باگ", <BugReportModule />);
 case "license": return wrap("مدیریت لایسنس", <LicenseManagement token={userToken || ""} />);
 case "api": return wrap("API و توسعه", <ApiModule />);
 case "manufacturing": return wrap("تولیدی", <ManufacturingModule />);
 case "insurance": return wrap("بیمه (سپید/سپاه)", <Insurance />);
 case "contracting": return wrap("پیمانکاری", <ContractingModule />);
 case "marketplace": return wrap("بازار اپلیکیشن", <MarketplaceModule />);
 case "app-marketplace": return wrap("بازار اپلیکیشن", <AppMarketplaceModule token={userToken || ""} />);
 case "scheduled-reports": return wrap("گزارش‌های دوره‌ای", <ScheduledReportsModule token={userToken || ""} />);
 case "partner-program": return wrap("برنامه همکاران", <PartnerProgramModule token={userToken || ""} />);
 case "reminders": return wrap("یادآورها", <RemindersModule />);
 case "loyalty": return wrap("باشگاه مشتریان", <LoyaltyModule />);
 case "mobile": return wrap("اپلیکیشن موبایل", <MobileAppModule />);
 case "help": return wrap("راهنما", <HelpSection />);
 case "reports-builder": return wrap("گزارش‌ساز", <ReportsBuilder />);
 case "multi-currency": return wrap("ارز و چندارزی", <MultiCurrencyModule />);
 case "multi-currency-report": return wrap("گزارش چندارزی", <MultiCurrencyReportModule />);
 case "budget": return wrap("بودجه‌ریزی", <BudgetPlanningModule />);
 case "forecast": return wrap("پیش‌بینی", <ForecastingModule />);
 case "forecast-dashboard": return wrap("داشبورد پیش‌بینی", <ForecastDashboard />);
 case "forecast-comparison": return wrap("مقایسه پیش‌بینی‌ها", <ForecastComparisonModule />);
 case "anomaly-dashboard": return wrap("داشبورد ناهنجاری", <AnomalyDashboard />);
 case "ocr-batch": return wrap("استخراج دسته‌ای فاکتور", <OCRBatchUpload />);
 case "supplier-analytics": return wrap("تحلیل تأمین‌کنندگان", <SupplierAnalyticsModule />);
 case "email-templates": return wrap("قالب‌های ایمیل", <EmailTemplatesModule />);
 case "workflow": return wrap("اتوماسیون", <WorkflowAutomationModule />);
 case "document-templates": return wrap("قالب‌های سند", <DocumentTemplatesModule token={userToken || ""} />);
 case "document-merge": return wrap("ادغام اسناد", <DocumentMergeModule />);
 case "security-training": return wrap("آموزش امنیتی", <SecurityTrainingModule />);
 case "custom-report-builder": return wrap("سازنده گزارش", <CustomReportBuilder token={userToken || ""} />);
 case "ab-test-calculator": return wrap("محاسبه‌گر A/B", <ABTestCalculator />);
 case "calculator": return wrap("ماشین حساب", <AccountingCalculator />);
 case "email-queue": return wrap("صف ایمیل", <EmailQueueModule token={userToken || ""} />);
 case "sms-templates": return wrap("قالب‌های پیامک", <SmsTemplatesModule token={userToken || ""} />);
 case "tags-analytics": return wrap("تحلیل برچسب‌ها", <TagsAnalyticsModule token={userToken || ""} />);
 case "workflow-editor": return wrap("ویرایشگر اتوماسیون", <WorkflowVisualEditorModule />);
 case "cross-service": return wrap("داشبورد یکپارچه", <CrossServiceDashboard />);
 case "smart-dashboard": return wrap("داشبورد هوشمند", <SmartDashboard token={userToken || ""} onSwitchToManual={() => setActiveModule("dashboard")} />);
 case "nl-query": return wrap("پرس‌وجوی زبان طبیعی", <NLQueryBar token={userToken || ""} />);
 case "biometric-login": return wrap("ورود بیومتریک", <BiometricLogin token={userToken || ""} />);
 case "webhook-manager": return wrap("مدیریت Webhook", <WebhookManager />);
 case "data-notebook": return wrap("دفترچه تحلیل داده", <DataNotebook />);
 case "ltv-dashboard": return wrap("داشبورد LTV", <LTVDashboard />);
 case "ai-financial-suite": return wrap("سوپرماژول هوش مالی", <AIFinancialSuite token={userToken || ""} />);
 case "data-import-export": return wrap("واردات و صادرکرد", <DataImportExportModule />);
 case "print-templates": return wrap("قالب‌های چاپ", <PrintTemplatesModule />);
 case "customer-portal": return wrap("پورتال مشتریان", <CustomerPortalModule />);
 case "vendor-portal": return wrap("پورتال تأمین‌کنندگان", <VendorPortalModule />);
 case "project-profitability": return wrap("سودآوری پروژه‌ها", <ProjectProfitabilityModule />);
 case "expense-tracker": return wrap("هزینه و مسافت", <ExpenseTrackerModule />);
 case "fixed-assets": return wrap("دارایی‌های ثابت", <FixedAssetsModule />);
 case "bank-reconciliation": return wrap("مغایرت‌گیری بانکی", <BankReconciliationModule />);
 case "invoice-aging": return wrap("سن فاکتور و ریسک اعتباری", <InvoiceAgingModule />);
 case "financial-ratios": return wrap("نسبت‌های مالی", <FinancialRatiosModule />);
 case "support": return wrap("پشتیبانی", <SupportTicketModule />);
 case "ecosystem": return wrap("اکوسیستم", <EcosystemModule />);
 case "tenant-logs": return wrap("لاگ‌های سازمان", <TenantLogsViewer />);
 default: return wrap("داشبورد", <CustomizableDashboard role={userRole} />);
 }
 };

 return (
 <KeyboardShortcuts
 onNewInvoice={() => setInvoiceFormOpen(true)}
 onPrint={handlePrint}
 onExport={handleExport}
 onSettings={() => setSettingsOpen(true)}
 onSearchFocus={handleSearchFocus}
 onNavigate={setActiveModule}
 onCloseDialog={handleCloseDialog}
 onSubmitForm={handleSubmitForm}
 >
 <LicenseGuard
 token={userToken}
 onRenew={handleRenewLicense}
 onLogout={handleLogout}
 >
 <div className="flex min-h-screen bg-background">
 {/* سایدبار راست (RTL: اولین فرزند flex) */}
 <aside
 data-tour="sidebar"
 className={`hidden lg:flex shrink-0 flex-col border-e border-sidebar-border bg-sidebar sticky top-0 h-screen transition-all duration-200 ${
 sidebarCollapsed? "w-16": "w-60"
 }`}
 >
 <SidebarHeader collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) =>!c)} />
 <SidebarNav
 grouped={grouped}
 groupTitles={groupTitles}
 activeModule={activeModule}
 onSelect={setActiveModule}
 collapsed={sidebarCollapsed}
 onToggle={() => setSidebarCollapsed((c) =>!c)}
 userPlan={userInfo?.plan}
 onHelpClick={(key) => setHelpModule(key)}
 onLockedClick={(item) => setLockedModule({ key: item.id, name: item.label })}
 />
 <SidebarFooter
 collapsed={sidebarCollapsed}
 userInfo={userInfo}
 onSelectAccount={() => setView("account")}
 token={userToken}
 />
 </aside>

 {/* سایدبار موبایل — Drawer با انیمیشن روان (framer-motion) */}
 <AnimatePresence>
 {mobileNavOpen && (
 <>
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 transition={{ duration: LOW_MOTION? 0.15: 0.2 }}
 className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
 onClick={() => setMobileNavOpen(false)}
 aria-hidden="true"
 />
 <motion.aside
 initial={{ x: "100%" }}
 animate={{ x: 0 }}
 exit={{ x: "100%" }}
 transition={
 LOW_MOTION
 ? { duration: 0.15, ease: "easeOut" }
 : { type: "spring", damping: 30, stiffness: 320, mass: 0.8 }
 }
 className="lg:hidden fixed start-0 top-0 z-50 h-full w-[85vw] max-w-xs bg-sidebar border-e border-sidebar-border flex flex-col shadow-2xl"
 role="dialog"
 aria-label="منوی موبایل"
 >
 <SidebarHeader collapsed={false} onToggle={() => setMobileNavOpen(false)} onClose={() => setMobileNavOpen(false)} />
 <SidebarNav
 grouped={grouped}
 groupTitles={groupTitles}
 activeModule={activeModule}
 onSelect={(id) => {
 setActiveModule(id);
 setMobileNavOpen(false);
 }}
 collapsed={false}
 onToggle={() => setMobileNavOpen(false)}
 userPlan={userInfo?.plan}
 onHelpClick={(key) => setHelpModule(key)}
 onLockedClick={(item) => setLockedModule({ key: item.id, name: item.label })}
 />
 <SidebarFooter
 collapsed={false}
 userInfo={userInfo}
 onSelectAccount={() => {
 setMobileNavOpen(false);
 setView("account");
 }}
 token={userToken}
 />
 </motion.aside>
 </>
 )}
 </AnimatePresence>

 {/* بخش اصلی */}
 <div className="flex-1 flex flex-col min-w-0">
 {/* FIX(بازخورد کاربر): بنر دائمی حالت دمو — کاربر همیشه بداند در محیط
 دمو است، داده‌ها نمونه‌اند و چطور وارد حساب واقعی شود */}
 {demoActive && (
 <div
 role="status"
 aria-live="polite"
 className="w-full bg-gradient-to-l from-amber-500/15 via-purple-500/15 to-teal-500/15 border-b border-purple-500/30 px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center"
 >
 <span className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
 <Sparkles className="h-3.5 w-3.5" />
 شما در حالت دمو هستید
 </span>
 <span className="hidden sm:inline text-[11px] text-muted-foreground">
 داده‌های نمونه (رستوران + هایپرمارکت) — فروش صندوق POS قابل تست است
 </span>
 <Button
 size="sm"
 variant="outline"
 className="h-7 px-3 text-[11px] border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20"
 onClick={() => {
 setIsDemoMode(false);
 try {
 localStorage.removeItem(USER_TOKEN_KEY);
 } catch {
 /* ignore */
 }
 setUserToken(null);
 toast({
 title: "خروج از حالت دمو",
 description: "برای استفاده واقعی، حساب رایگان بسازید یا وارد شوید.",
 });
 }}
 >
 ساخت حساب رایگان
 </Button>
 </div>
 )}
 {/* تاپ‌بار — max-md:bg-background: بدون backdrop-blur (خاموش در موبایل) کدر می‌ماند */}
 <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-xl px-4 lg:px-6 max-md:bg-background">
 <Button
 variant="ghost"
 size="icon"
 className="lg:hidden h-9 w-9 shrink-0"
 onClick={() => setMobileNavOpen(true)}
 aria-label="باز کردن منو"
 >
 <Menu className="h-5 w-5" />
 </Button>

 {/* عنوان ماژول */}
 <div className="min-w-0 flex-1 lg:flex-none flex items-center gap-1.5">
 <div className="min-w-0">
 <h1 className="font-bold text-base lg:text-lg text-foreground truncate leading-tight">
 {meta.title}
 </h1>
 <p className="text-[11px] text-muted-foreground truncate hidden sm:block leading-tight">
 {meta.subtitle}
 </p>
 </div>
 {/* FIX(v11-help): دکمه «؟» کنار عنوان ماژول — برای هر ماژول دارای راهنما */}
 {getModuleHelp(activeModule) && (
 <button
 onClick={() => setHelpModule(activeModule)}
 aria-label={`راهنمای ${meta.title}`}
 title={`راهنمای ${meta.title}`}
 className="shrink-0 p-1 rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-all hover:scale-110"
 >
 <HelpCircle className="h-4 w-4" />
 </button>
 )}
 </div>

 {/* نمایش تاریخ جاری */}
 <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground">
 <Calendar className="h-3 w-3" />
 {toPersianDigits(new Date().toLocaleDateString('fa-IR'))}
 </span>

 {/* جستجوی پیشرفته — باز کردن با کلیک یا Ctrl+/ */}
 <button
 onClick={() =>
 window.dispatchEvent(
 new CustomEvent("hoshhesab:open-advanced-search")
 )
 }
 data-tour="cmd-k"
 data-tour-search="true"
 className="hidden md:flex items-center gap-2 h-9 w-full max-w-xs rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
 >
 <Search className="h-4 w-4" />
 <span className="flex-1 text-start">جستجوی پیشرفته...</span>
 <kbd className="flex items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 text-[10px]">
 Ctrl+/
 </kbd>
 </button>

 <div className="flex items-center gap-1 ms-auto lg:ms-0">
 {/* دکمه «فاکتور جدید» — هدف تور data-tour="quick-create" */}
 <Button
 size="sm"
 className="h-9 gap-1.5 px-2.5 hidden sm:inline-flex"
 onClick={() => setInvoiceFormOpen(true)}
 data-tour="quick-create"
 >
 <ShoppingCart className="h-4 w-4" />
 <span className="text-sm">فاکتور جدید</span>
 </Button>
 {/* نسخه‌ی آیکونی برای موبایل */}
 <Button
 size="icon"
 className="h-9 w-9 sm:hidden"
 onClick={() => setInvoiceFormOpen(true)}
 data-tour="quick-create"
 aria-label="فاکتور جدید"
 >
 <ShoppingCart className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 hidden sm:inline-flex md:hidden"
 onClick={() =>
 window.dispatchEvent(
 new CustomEvent("hoshhesab:open-advanced-search")
 )
 }
 aria-label="جستجو"
 >
 <Search className="h-4 w-4" />
 </Button>
 <SafeBoundary>
 <NotificationCenter token={userToken} />
 </SafeBoundary>
 <SafeBoundary>
 <PriceTicker />
 </SafeBoundary>
 {userToken && (
 <SafeBoundary>
 <React.Suspense fallback={null}>
 <LoyaltyBadge token={userToken} />
 </React.Suspense>
 </SafeBoundary>
 )}
 <SafeBoundary>
 <ThemeToggle className="h-9 w-9" />
 </SafeBoundary>


 {/* سوییچر چند شرکتی — کنار آواتار کاربر */}
 {userToken && (
 <SafeBoundary>
 <CompanySwitcher
 token={userToken}
 onSwitch={handleSwitchCompany}
 />
 </SafeBoundary>
 )}

 {/* حضور بلادرنگ: آواتار کاربران آنلاین */}
 {userToken && (
 <SafeBoundary>
 <RealtimePresence token={userToken} activeModule={activeModule} />
 </SafeBoundary>
 )}

 {/* منوی صفحات (لندینگ / قیمت‌گذاری / بلاگ / پشتیبانی / قوانین) */}
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="sm" className="hidden md:inline-flex h-9 gap-1.5 px-2.5">
 <FileText className="h-4 w-4" />
 <span className="hidden sm:inline text-sm">صفحات</span>
 <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-[min(92vw,16rem)]">
 <DropdownMenuLabel>صفحات عمومی</DropdownMenuLabel>
 <DropdownMenuSeparator />
 <DropdownMenuItem onClick={() => setView("landing")}>
 <Sparkles className="h-4 w-4 me-2" />
 صفحه اصلی
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => setView("pricing")}>
 <Receipt className="h-4 w-4 me-2" />
 قیمت‌گذاری
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => setView("blog")}>
 <BookOpen className="h-4 w-4 me-2" />
 بلاگ
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => setView("support")}>
 <Compass className="h-4 w-4 me-2" />
 پشتیبانی
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => setView("legal")}>
 <ShieldCheck className="h-4 w-4 me-2" />
 قوانین و مقررات
 </DropdownMenuItem>
 {!userToken && (
 <>
 <DropdownMenuSeparator />
 <DropdownMenuItem onClick={() => setAuthOpen(true)}>
 <LogOut className="h-4 w-4 me-2 rotate-180" />
 ورود / ثبت‌نام
 </DropdownMenuItem>
 </>
 )}
 </DropdownMenuContent>
 </DropdownMenu>

 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button className="flex items-center gap-2 rounded-full hover:bg-muted p-1 ps-1 transition-colors ms-1">
 <Avatar className="h-8 w-8">
 <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
 {userToken
? (userInfo?.name?.trim()?.charAt(0) || "ه") +
 (userInfo?.family?.trim()?.charAt(0) ||
 userInfo?.name?.trim()?.split(/\s+/)?.[1]?.charAt(0) ||
 "ح")
: "م"}
 </AvatarFallback>
 </Avatar>
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-[min(92vw,16rem)]">
 <DropdownMenuLabel>
 <div className="flex flex-col">
 <span className="text-sm font-medium">
 {userToken
? [userInfo?.name, userInfo?.family].filter(Boolean).join(" ").trim() ||
 userInfo?.name ||
 "کاربر هوش"
: "مهمان هوش"}
 </span>
 <span className="text-xs font-normal text-muted-foreground" dir="ltr">
 {userToken? userInfo?.email || "—": "guest@hoosh.nobatime.ir"}
 </span>
 </div>
 </DropdownMenuLabel>
 <DropdownMenuSeparator />
 <DropdownMenuItem
 onClick={() => setSettingsOpen(true)}
 data-tour="settings"
 >
 <Settings className="h-4 w-4 me-2" />
 تنظیمات حساب
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={() => setView("account")}
 disabled={!userToken}
 className={!userToken? "opacity-50": ""}
 >
 <UserCircle className="h-4 w-4 me-2" />
 حساب کاربری
 </DropdownMenuItem>
 <DropdownMenuItem onClick={handleStartTour}>
 <Compass className="h-4 w-4 me-2" />
 تور محصول
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => setInvoiceFormOpen(true)}>
 <ShoppingCart className="h-4 w-4 me-2" />
 فاکتور جدید
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={() =>
 window.dispatchEvent(
 new CustomEvent("hoshhesab:show-shortcuts-help")
 )
 }
 >
 <Keyboard className="h-4 w-4 me-2" />
 میانبرهای صفحه‌کلید
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={() => setActiveModule("security")}
 >
 <ShieldCheck className="h-4 w-4 me-2" />
 امنیت و احراز هویت
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuItem
 onClick={() => setView("landing")}
 >
 <Sparkles className="h-4 w-4 me-2" />
 بازگشت به صفحه اصلی
 </DropdownMenuItem>
 {userToken? (
 <DropdownMenuItem
 className="text-destructive"
 onClick={handleLogout}
 >
 <LogOut className="h-4 w-4 me-2" />
 خروج از حساب
 </DropdownMenuItem>
 ): (
 <DropdownMenuItem
 className="text-primary"
 onClick={() => setAuthOpen(true)}
 >
 <LogOut className="h-4 w-4 me-2 rotate-180" />
 ورود / ثبت‌نام
 </DropdownMenuItem>
 )}
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </header>

 {/* بنر آفلاین — در صورت قطع اتصال یا وجود اکشن در صف */}
 {userToken && (
 <SafeBoundary>
 <OfflineBanner token={userToken} />
 </SafeBoundary>
 )}

 {/* بنر تریال — در صورت وجود توکن کاربر و حالت تریال */}
 {userToken && (
 <TrialBanner token={userToken} onUpgrade={handleOpenUpgrade} />
 )}

 {/* محتوای ماژول */}
 <main
 className="flex-1 content-padding pb-20 lg:pb-6"
 data-tour="dashboard"
 >
 {/* KEEP-ALIVE(21-C): همه‌ی ماژول‌های بازدیدشده (max ۵) رندر می‌مانند؛
 فقط ماژول فعال visible است. بازگشت = بدون remount/اسپینر/رفچ اجباری —
 داده‌ها با lib/client-cache در پس‌زمینه خاموش تازه می‌شوند.
 فریم انیمیشن cross-fade حذف شد (PERF: سوئیچ آنی، مخصوصاً موبایل). */}
 {keptModules.map((m) => (
 <div key={`${m}:${userToken || ""}`} hidden={m !== activeModule}>
 <React.Suspense fallback={<ModuleSkeleton />}>
 {renderModule(m)}
 </React.Suspense>
 </div>
 ))}
 </main>

 {/* ویجت فعالیت‌های اخیر — فقط در داشبورد */}
 {activeModule === "dashboard" && userToken && (
 <div className="px-4 lg:px-6 pb-4">
 <SafeBoundary>
 <React.Suspense fallback={null}>
 <ActivityFeedWidget />
 </React.Suspense>
 </SafeBoundary>
 </div>
 )}

 {/* فوتر چسبان */}
 <footer className="mt-auto border-t border-border bg-card/50 pb-16 lg:pb-0">
 <div className="flex flex-col md:flex-row items-center justify-between gap-2 px-6 py-4 text-xs text-muted-foreground">
 <div className="flex items-center gap-2">
 <Sparkles className="h-3.5 w-3.5 text-primary" />
 <span>
 هوش {toPersianDigits(getCurrentJalaliYear())} — قدرت گرفته از{""}
 <a
 href="https://webzlux.com"
 target="_blank"
 rel="noopener noreferrer"
 className="text-primary hover:underline font-medium"
 >
 وبزلوکس
 </a>
 </span>
 </div>
 <div className="flex items-center gap-4">
 <button
 onClick={() => setView("legal")}
 className="hover:text-foreground transition-colors"
 >
 قوانین
 </button>
 <button
 onClick={() => setView("support")}
 className="hover:text-foreground transition-colors"
 >
 پشتیبانی
 </button>
 <button
 onClick={() => setView("blog")}
 className="hover:text-foreground transition-colors"
 >
 مستندات
 </button>
 </div>
 </div>
 </footer>
 </div>

 {/* Command Palette */}
 <CommandPalette
 open={cmdOpen}
 onOpenChange={setCmdOpen}
 onNavigate={setActiveModule}
 token={userToken}
 />

 {/* جستجوی پیشرفته — با Ctrl+/ یا دکمه سرچ باز می‌شود */}
 <SafeBoundary>
 <AdvancedSearch
 token={userToken || ""}
 onNavigate={(entity, _id) => {
 // نگاشت نوع موجودیت به ماژول مناسب
 const moduleMap: Record<string, string> = {
 invoice: "invoices",
 product: "inventory",
 party: "crm",
 journal: "core",
 };
 const mod = moduleMap[entity] || "dashboard";
 setActiveModule(mod);
 setView("app");
 }}
 />
 </SafeBoundary>

 {/* حذف بنر رضایت کوکی (درخواست مالک) — کنترل کوکی به بخش «حریم خصوصی»
 قوانین/تنظیمات منتقل شد؛ بدون consent ذخیره‌شده، تحلیل‌ها خاموش می‌مانند */}

 {/* اسکریپت‌های تحلیلی و ریتارگتینگ — فقط با consent کاربر */}
 <SafeBoundary>
 <React.Suspense fallback={null}>
 <AnalyticsScripts />
 </React.Suspense>
 </SafeBoundary>

 {/* بنر درخواست دسترسی Push Notification */}
 {userToken && (
 <SafeBoundary>
 <React.Suspense fallback={null}>
 <PushPermissionBanner />
 </React.Suspense>
 </SafeBoundary>
 )}

 {/* بنر پیام‌های درون‌برنامه‌ای */}
 {userToken && (
 <SafeBoundary>
 <React.Suspense fallback={null}>
 <InAppMessageBanner />
 </React.Suspense>
 </SafeBoundary>
 )}

 {/* دستیار مالی هوشمند */}
 <AIAssistantAgent onNavigate={goToModule} />

 {/* دکمه شناور اقدامات سریع — فقط در نمای اپلیکیشن */}
 {view === "app" && userToken && (
 <SafeBoundary>
 <React.Suspense fallback={null}>
 <QuickActionsWidget />
 </React.Suspense>
 </SafeBoundary>
 )}

 {/* فرمان صوتی شناور — فقط در نمای اپلیکیشن */}
 {view === "app" && (
 <SafeBoundary>
 <React.Suspense fallback={null}>
 <VoiceCommander
 onNavigate={(id) => {
 setActiveModule(id);
 setView("app");
 }}
 onNewInvoice={() => setInvoiceFormOpen(true)}
 onOpenAssistant={handleOpenAssistant}
 onSearch={() => {
 setCmdOpen(true);
 // ارسال رویداد برای فوکوس روی جستجوی پیشرفته
 try {
 window.dispatchEvent(new CustomEvent("hoshhesab:open-advanced-search"));
 } catch {
 /* ignore */
 }
 }}
 />
 </React.Suspense>
 </SafeBoundary>
 )}

 {/* مودال احراز هویت */}
 <AuthView
 open={authOpen}
 onOpenChange={setAuthOpen}
 onTrialCreate={handleTrialCreate}
 onUserLoginSuccess={handleUserLoginSuccess}
 onSuperAdminLoginSuccess={handleSuperAdminLoginSuccess}
 onDemoAccess={handleDemoAccess}
 />

 {/* دیالوگ‌های UX */}
 <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
 <InvoiceForm
 open={invoiceFormOpen}
 onOpenChange={setInvoiceFormOpen}
 onCreated={() => {
 trackEvent(AnalyticsEvents.INVOICE_CREATE, { source: "form" });
 toast({
 title: "فاکتور ثبت شد",
 description: "فاکتور جدید با موفقیت ایجاد شد.",
 });
 // اعلام به ماژول فاکتورها برای به‌روزرسانی خودکار لیست
 if (typeof window!== "undefined") {
 window.dispatchEvent(new CustomEvent("hoshhesab:invoices-changed"));
 }
 }}
 />
 {/* دیالوگ‌های UX */}
 <TrialSuccessModal
 open={trialModalOpen}
 onOpenChange={setTrialModalOpen}
 credentials={trialCredentials}
 onEnterPanel={handleEnterPanelFromTrial}
 />

 {/* پاپ‌آپ «ایمیل‌تان را امن کنید» — کاربرِ بدون ایمیل معتبر، بعد از ورود */}
 <EmailPromptDialog
 open={emailPromptOpen}
 onClose={handleEmailPromptClose}
 currentEmail={userInfo?.email || null}
 onSaved={handleEmailPromptSaved}
 />

 {/* پاپ‌آپ راهنمای ماژول */}
 <ModuleHelpPopup
 moduleKey={helpModule}
 open={!!helpModule}
 onOpenChange={(open) => { if (!open) setHelpModule(null); }}
 />

 {/* دیالوگ قفل ماژول */}
 <LockedModuleDialog
 module={lockedModule}
 open={!!lockedModule}
 onOpenChange={(open) => { if (!open) setLockedModule(null); }}
 onUpgrade={() => { setLockedModule(null); setView("pricing"); }}
 />
 {/* مودال ارتقا حساب به Premium */}
 {userToken && (
 <UpgradeModal
 open={upgradeModalOpen}
 onOpenChange={setUpgradeModalOpen}
 token={userToken}
 onUpgraded={handleUpgraded}
 />
 )}

 {/* دیالوگ هشدار انقضای نشست (FIX B10) — تنظیم «مدت نشست» سوپرادمین حالا واقعاً اعمال می‌شود */}
 {userToken && (
 <React.Suspense fallback={null}>
 <LazySessionTimeoutDialog
 token={userToken}
 sessionTimeoutMs={sessionTimeoutMs}
 onTimeout={handleLogout}
 />
 </React.Suspense>
 )}

 {/* نوار ناوبری پایین موبایل */}
 {/* FIX(v18-گیت مرکزی): ناوبری موبایل هم مثل سایدبار از قفل پلن عبور می‌کند */}
 <MobileBottomNav
 activeModule={activeModule}
 onNavigate={(id) => goToModule(id)}
 onOpenAssistant={handleOpenAssistant}
 />

 {/* v32-C: اورلی سراسری بارکد — وقتی هیچ ماژول فعالی اسکن را مصرف نکرد */}
 {view === "app" && (
 <BarcodeFallbackOverlayLazy
 onNewInvoice={() => setInvoiceFormOpen(true)}
 onOpenInventory={() => {
 setActiveModule("inventory");
 }}
 />
 )}

 {/* تور معرفی محصول (react-joyride) */}
 <OnboardingJoyride
 run={tourRun}
 onComplete={() => setTourRun(false)}
 onStep={handleTourStep}
 />
 </div>
 </LicenseGuard>
 </KeyboardShortcuts>
 );
}

/* ============ اجزای سایدبار ============ */

function SidebarHeader({
 collapsed,
 onToggle,
 onClose,
}: {
 collapsed: boolean;
 onToggle: () => void;
 onClose?: () => void;
}) {
 return (
 <div className={`flex items-center gap-2 border-b border-sidebar-border ${collapsed? "p-3 justify-center": "p-4"}`}>
 {!collapsed && (
 <div className="flex items-center gap-2.5 flex-1 min-w-0">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
 <Sparkles className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="font-bold text-sm leading-tight truncate">هوش</p>
 <p className="text-[10px] text-muted-foreground leading-tight">حسابداری هوشمند</p>
 </div>
 </div>
 )}
 {collapsed && (
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-4 w-4" />
 </div>
 )}
 {!collapsed && (
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 shrink-0 hidden lg:flex"
 onClick={onToggle}
 aria-label="جمع کردن سایدبار"
 >
 <PanelRightClose className="h-4 w-4" />
 </Button>
 )}
 {onClose && (
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 shrink-0 lg:hidden text-muted-foreground hover:text-foreground"
 onClick={onClose}
 aria-label="بستن منو"
 >
 <X className="h-4 w-4" />
 </Button>
 )}
 </div>
 );
}

function SidebarNav({
 grouped,
 groupTitles,
 activeModule,
 onSelect,
 collapsed,
 onToggle,
 userPlan,
 onHelpClick,
 onLockedClick,
}: {
 grouped: Record<string, NavItem[]>;
 groupTitles?: Record<string, string>; // USER-CONTENT(3-d): عنوان نمایشی گروه‌ها از سوپرادمین
 activeModule: string;
 onSelect: (id: string) => void;
 collapsed: boolean;
 onToggle: () => void;
 userPlan?: string;
 onHelpClick?: (moduleKey: string) => void;
 onLockedClick?: (item: { id: string; label: string }) => void;
}) {
 const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
 const toggleGroup = (g: string) => {
 setCollapsedGroups((prev) => {
 const next = new Set(prev);
 if (next.has(g)) next.delete(g); else next.add(g);
 return next;
 });
 };

 // prefetch ماژول‌ها هنگام hover — chunk را پیش از کلیک دانلود می‌کند
 // (از lib مشترک استفاده می‌کند تا با prewarm موبایل dedupe شود)
 const prefetchModule = React.useCallback((moduleId: string) => {
 prewarmModule(moduleId);
 }, []);

 return (
 <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1" style={{ scrollbarWidth: "thin" }}>
 {collapsed && (
 <Button variant="ghost" size="icon" className="hidden lg:flex h-8 w-8 mx-auto mb-2" onClick={onToggle} aria-label="باز کردن سایدبار">
 <PanelRightOpen className="h-4 w-4" />
 </Button>
 )}
 {Object.entries(grouped).map(([group, items], groupIdx) => (
 <div key={group}>
 {groupIdx > 0 && <div className="mx-2 my-2 h-px bg-gradient-to-l from-transparent via-border to-transparent" />}
 {!collapsed && (
 <button onClick={() => toggleGroup(group)} className="flex w-full items-center gap-1.5 px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-muted-foreground transition-colors duration-150">
 <span className="flex-1 text-start">{groupTitles?.[group] || group}</span>
 <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-200 ${collapsedGroups.has(group)? "-rotate-90": ""}`} />
 </button>
 )}
 <div className={`space-y-0.5 overflow-hidden transition-all duration-200 ${collapsedGroups.has(group) &&!collapsed? "max-h-0": "max-h-[800px]"}`}>
 {items.map((item) => {
 const Icon = item.icon;
 const active = activeModule === item.id;
 const locked =!hasModuleAccess(userPlan, item.id);
 const moduleHelp = getModuleHelp(item.id);
 return (
 <div key={item.id} className="group/sidebar-item flex items-center">
 <button
 onClick={() => {
 // MODULE-MANAGER(25-A): آیتم دلخواهِ «لینک» — در تب جدید باز می‌شود
 if (item.url) {
 window.open(item.url, "_blank", "noopener,noreferrer");
 return;
 }
 if (locked && onLockedClick) {
 onLockedClick({ id: item.id, label: item.label });
 } else {
 onSelect(item.id);
 }
 }}
 onMouseEnter={() => {
 // prefetch ماژول هنگام hover — سرعت لود کلیک را افزایش می‌دهد
 if (!locked) prefetchModule(item.id);
 }}
 title={collapsed? item.label: locked? "نیازمند پلن بالاتر": undefined}
 data-tour={item.id === "reports-builder"? "reports": undefined}
 className={`group relative flex flex-1 min-w-0 items-center gap-2.5 rounded-lg text-sm transition-all duration-150 ${
 collapsed? "justify-center p-2.5": "px-2.5 py-2"
 } ${
 active? "bg-accent text-accent-foreground font-medium": "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
 } ${locked? "opacity-60": ""}`}
 >
 {active &&!collapsed && (
 <span className="absolute start-0 top-1/2 -translate-y-1/2 h-5/6 w-1 rounded-full bg-primary transition-all duration-200" />
 )}
 <Icon className={`h-4 w-4 shrink-0 transition-all duration-150 ${active? "text-primary": "text-muted-foreground group-hover:text-foreground group-hover:scale-110"}`} />
 {!collapsed && <span className="flex-1 text-start truncate">{item.label}</span>}
 {!collapsed && item.badge && (
 // FIX(v32-E — باگ لپ‌تاپ قدیمی): ارتفاع ثابت h-4 + overflow-hidden باعث می‌شد
 // متن بج با فونت جایگزین (Tahoma) کیلیپ شود و فقط «قرمز خالی» دیده شود.
 // ارتفاع حداقلی + leading + فونت ۱۰px = همیشه خوانا.
 <Badge variant="secondary" className={`min-h-[20px] h-auto leading-[1.2] text-[10px] px-1.5 py-0.5 ${item.badge === "جدید"? "bg-primary/10 text-primary": "bg-destructive/10 text-destructive"}`}>
 {item.badge}
 </Badge>
 )}
 {!collapsed && locked && <Lock className="h-3 w-3 text-amber-500 shrink-0" />}
 {collapsed && item.badge && <span className="absolute top-1.5 end-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
 </button>
 {!collapsed && moduleHelp && onHelpClick && (
 <button
 onClick={(e) => { e.stopPropagation(); onHelpClick(item.id); }}
 aria-label={`راهنمای ${item.label}`}
 title={moduleHelp.shortDescription}
 className="p-0.5 rounded-md hover:bg-primary/15 text-muted-foreground/60 hover:text-primary shrink-0 transition-all hover:scale-110"
 >
 <HelpCircle className="h-3.5 w-3.5" />
 </button>
 )}
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </nav>
 );
}
function SidebarFooter({
 collapsed,
 userInfo,
 onSelectAccount,
 token,
}: {
 collapsed: boolean;
 userInfo?: { name?: string; email?: string; family?: string | null; company?: string | null } | null;
 onSelectAccount?: () => void;
 token?: string | null;
}) {
 // FIX: وضعیت اتصال مودیان — قبلاً همیشه «متصل — فعال» با نقطه سبز فیک هاردکد
 // می‌شد. حالا وضعیت واقعی از GET /api/integrations/modian/status خوانده می‌شود
 // و صادقانه نمایش داده می‌شود (فعال/غیرفعال/در حال بررسی).
 const [modianStatus, setModianStatus] = React.useState<
 "loading" | "connected" | "disconnected" | "error"
 >("loading");

 React.useEffect(() => {
 let cancelled = false;
 if (!token) {
 setModianStatus("disconnected");
 return;
 }
 (async () => {
 try {
 const res = await authFetch("/api/integrations/modian/status", {
 cache: "no-store",
 });
 if (cancelled) return;
 const json = await res.json().catch(() => null);
 if (res.ok && json?.success && json?.data?.connectionStatus === "connected") {
 setModianStatus("connected");
 } else if (res.ok) {
 setModianStatus("disconnected");
 } else {
 setModianStatus("error");
 }
 } catch {
 if (!cancelled) setModianStatus("error");
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [token]);

 const statusMeta = {
 loading: {
 label: "در حال بررسی اتصال مودیان...",
 sub: "سامانه دارایی",
 dot: "bg-muted-foreground/60",
 text: "text-muted-foreground",
 ping: false,
 },
 connected: {
 label: "متصل به سامانه مودیان",
 sub: "سامانه دارایی — فعال",
 dot: "bg-success",
 text: "text-success",
 ping: true,
 },
 disconnected: {
 label: "عدم اتصال به سامانه مودیان",
 sub: "سامانه دارایی — غیرفعال",
 dot: "bg-muted-foreground/60",
 text: "text-muted-foreground",
 ping: false,
 },
 error: {
 label: "خطا در اتصال به مودیان",
 sub: "سامانه دارایی — غیرفعال",
 dot: "bg-destructive",
 text: "text-destructive",
 ping: false,
 },
 }[modianStatus];

 const displayName = userInfo
? [userInfo.name, userInfo.family].filter(Boolean).join(" ").trim() ||
 userInfo.email ||
 "کاربر هوش"
: "کاربر مهمان";
 const initials = userInfo?.name?.trim()?.charAt(0) ||
 (userInfo?.email?.charAt(0) || "ه");
 const company = userInfo?.company;

 return (
 <div className={`border-t border-sidebar-border ${collapsed? "p-2": "p-3"} space-y-2`}>
 {/* پروفایل کاربر — دسترسی سریع */}
 <button
 onClick={onSelectAccount}
 className={`group w-full flex items-center gap-2.5 rounded-lg border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all ${
 collapsed? "justify-center p-2": "p-2"
 }`}
 title={collapsed? displayName: undefined}
 >
 <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
 {initials}
 </div>
 {!collapsed && (
 <div className="flex-1 min-w-0 text-start">
 <p className="text-xs font-medium text-foreground truncate leading-tight">
 {displayName}
 </p>
 <p className="text-[10px] text-muted-foreground truncate leading-tight">
 {company || "حساب کاربری"}
 </p>
 </div>
 )}
 {!collapsed && (
 <UserCircle className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
 )}
 </button>

 {/* وضعیت اتصال — واقعی، از API مودیان */}
 <div
 className={`rounded-lg bg-muted/60 ${collapsed? "p-2": "p-2.5"}`}
 title={collapsed? statusMeta.label: undefined}
 >
 {collapsed? (
 <div className="flex justify-center">
 <span className="relative flex h-2 w-2">
 {statusMeta.ping && (
 <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusMeta.dot} opacity-75`} />
 )}
 <span className={`relative inline-flex rounded-full h-2 w-2 ${statusMeta.dot}`} />
 </span>
 </div>
 ): (
 <>
 <div className="flex items-center gap-1.5 mb-0.5">
 <span className="relative flex h-1.5 w-1.5">
 {statusMeta.ping && (
 <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusMeta.dot} opacity-75`} />
 )}
 <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${statusMeta.dot}`} />
 </span>
 <span className={`text-[10px] font-medium ${statusMeta.text}`}>{statusMeta.label}</span>
 </div>
 <p className="text-[9px] text-muted-foreground">{statusMeta.sub}</p>
 </>
 )}
 </div>
 </div>
 );
}
