"use client";

// ============================================================================
// هوش‌یار حرفه‌ای — دستیار هوشمند حسابداری هوش (نسخه‌ی ارتقایافته)
// ----------------------------------------------------------------------------
// Features:
// - Floating action button (bottom-left RTL) expandable chat panel
// - Streaming responses (SSE) with typing indicator + meta event parsing
// - Markdown rendering (bold, italic, lists, code blocks, tables, headings)
// - Copy message + Clear chat
// - Suggested prompts when chat is empty
// - Context-aware: fetches /api/dashboard + /api/v1/invoices?limit=5
// - Voice input (MediaRecorder + ASR سمت سرور /api/ai/transcribe) + Voice output (speechSynthesis)
// - Voice Command Mode — parse Persian command action card confirm execute
// - Image upload /api/ai/vision (VLM)
// - File upload (CSV/Excel/JSON/TXT) /api/ai/file-analyze
// - Quick action buttons + action chips below each AI response
// - اکشن‌های هوشمند section — pending action cards from voice/AI
// - گردش کار هوشمند button — opens WorkflowBuilder modal
// - تشخیص ناهنجاری button — runs anomaly detection
// - تحلیل داده‌ها button — RAG-based data analysis with sources
// - inline اجرا کند button on AI responses — directly executes actions via /api/ai/execute
// - localStorage conversation history (last 50 messages per session)
// - Multi-conversation: list, switch, new
// - Fully Persian + RTL + responsive
// ============================================================================

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Sparkles,
 X,
 Send,
 Loader2,
 Copy,
 Check,
 Mic,
 MicOff,
 Volume2,
 VolumeX,
 Image as ImageIcon,
 FileText,
 Plus,
 MessageSquare,
 History,
 Trash2,
 Bot,
 User,
 FileEdit,
 TrendingUp,
 Receipt,
 UserPlus,
 Calculator,
 BarChart3,
 Paperclip,
 XCircle,
 Square,
 ChevronLeft,
 Workflow as WorkflowIcon,
 AlertTriangle,
 Zap,
 CheckCircle2,
 ArrowRight,
 Database,
 PlayCircle,
 BookOpen,
 BookMarked,
 WifiOff,
 Link as LinkIcon,
 Package,
 Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
// FIX: از کش مشترک داشبورد استفاده می‌کنیم تا فراخوانی تکراری /api/dashboard حذف شود
import { fetchDashboardSharedExport } from "@/components/dashboard/customizable-dashboard";
import { toPersianDigits } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";
// FIX(voice): ضبط صدا با MediaRecorder + تبدیل به متن با ASR سمت سرور
import { useVoiceAsr } from "@/hooks/use-voice-asr";
import { WorkflowBuilder } from "@/components/ai/workflow-builder";

// ============ Constants ============

const STORAGE_KEY = "hoshhesab_ai_conversations_v2";
const MAX_CONVERSATIONS = 10;
const MAX_MESSAGES_PER_CONV = 50;

const QUICK_ACTIONS = [
 {
 id: "invoice-sale",
 label: "ثبت فاکتور فروش",
 icon: FileEdit,
 color: "text-primary",
 navigate: "invoices",
 prompt: "می‌خوام یه فاکتور فروش ثبت کنم. راهنماییم کن.",
 },
 {
 id: "invoice-purchase",
 label: "ثبت فاکتور خرید",
 icon: FileEdit,
 color: "text-chart-2",
 navigate: "invoices",
 prompt: "می‌خوام یه فاکتور خرید ثبت کنم. راهنماییم کن.",
 },
 {
 id: "expense",
 label: "ثبت هزینه",
 icon: Receipt,
 color: "text-warning",
 navigate: "expense-tracker",
 prompt: "می‌خوام یه هزینه ثبت کنم. چه اطلاعات لازم است؟",
 },
 {
 id: "add-customer",
 label: "افزودن مشتری",
 icon: UserPlus,
 color: "text-chart-4",
 navigate: "crm",
 prompt: "می‌خوام یه مشتری جدید اضافه کنم. راهنماییم کن.",
 },
 {
 id: "financial-report",
 label: "گزارش مالی",
 icon: BarChart3,
 color: "text-chart-3",
 navigate: "reports-builder",
 prompt: "گزارش مالی ماه جاری من رو برام تحلیل کن.",
 },
 {
 id: "tax-calc",
 label: "محاسبه مالیات",
 icon: Calculator,
 color: "text-destructive",
 navigate: "tax",
 prompt: "مالیات ارزش افزوده چطور محاسبه می‌شه؟ نرخ ۱۴۰۳ چقدره؟",
 },
] as const;

// ============ v33-d: کاتالوگ دستورات — صفحهٔ خوش‌آمد + دیالوگ راهنما ============
// هر چیپ یک «فرمان واقعی» است — کلیک = ارسال همان دستور به موتور
// (رجیستری ابزار آفلاین v2 یا ایجنت؛ هر دو روی دادهٔ واقعی کار می‌کنند)

const WELCOME_CATEGORIES: Array<{
 id: string;
 title: string;
 icon: React.ElementType;
 commands: string[];
}> = [
 {
  id: "reports",
  title: "گزارش‌ها",
  icon: BarChart3,
  commands: [
   "فروش این ماه چقدره؟",
   "گزارش سود این ماه",
   "ارزش افزوده این ماه چقدر شد؟",
   "بهترین مشتری کیه؟",
  ],
 },
 {
  id: "accounting",
  title: "حسابداری و مالیات",
  icon: BookOpen,
  commands: [
   "نقطه سربه سر یعنی چی؟",
   "نرخ ارزش افزوده چنده؟",
   "حقوق چطور محاسبه می‌شه؟",
   "استهلاک چیه و چطور محاسبه می‌شه؟",
  ],
 },
 {
  id: "inventory",
  title: "کالا و انبار",
  icon: Package,
  commands: ["چند کالا دارم؟", "ارزش انبارم چقدره؟", "موجودی اولین کالا چنده؟", "کالای جدید بساز"],
 },
 {
  id: "parties",
  title: "مشتری‌ها و طلب",
  icon: UserPlus,
  commands: [
   "بدهی مشتری نمونه چقدره؟",
   "مطالبات و بدهی‌هایم چقدره؟",
   "پرفروش‌ترین کالاها کجان؟",
   "مشتری جدید بساز",
  ],
 },
 {
  id: "tools",
  title: "ابزارها",
  icon: Calculator,
  commands: ["۱۲ درصد ۴۵۰۰۰۰ چنده؟", "سود ۳۰ درصد روی ۲ میلیون", "قیمت دلار چنده؟", "فاکتور جدید بساز"],
 },
];

const COMMAND_CATALOG: Array<{
 id: string;
 title: string;
 icon: React.ElementType;
 items: Array<{ label: string; examples: string[] }>;
}> = [
 {
  id: "catalog-data",
  title: "خواندن دادهٔ واقعی کسب‌وکار",
  icon: BarChart3,
  items: [
   { label: "فروش و درآمد دوره", examples: ["فروش این ماه چقدره؟", "فروش ماه قبل چطور بود؟"] },
   { label: "گزارش سود", examples: ["گزارش سود این ماه", "سود امسال چقدر بود؟"] },
   { label: "ارزش افزودهٔ دوره", examples: ["ارزش افزوده این ماه چقدر شد؟"] },
   { label: "بهترین مشتری‌ها", examples: ["بهترین مشتری کیه؟", "بیشترین خرید از کی بوده؟"] },
   { label: "مانده و بدهی طرف‌حساب", examples: ["بدهی علی چقدره؟", "مانده رستوران بهار چنده؟"] },
   { label: "نرخ ارز و طلا", examples: ["قیمت دلار چنده؟", "طلا چند؟", "نرخ سکه چنده؟"] },
  ],
 },
 {
  id: "catalog-knowledge",
  title: "دانش حسابداری و مالیات (پاسخ تخصصی آفلاین)",
  icon: BookOpen,
  items: [
   { label: "نقطهٔ سربه‌سر", examples: ["نقطه سربه سر یعنی چی؟"] },
   {
    label: "ارزش افزوده",
    examples: ["نرخ ارزش افزوده چنده؟", "مهلت اظهارنامه ارزش افزوده چی؟", "معاف از ارزش افزوده چیان؟", "اعتبار مالیاتی خرید چیه؟"],
   },
   {
    label: "حقوق و دستمزد",
    examples: ["حقوق چطور محاسبه می‌شه؟", "مالیات حقوق ۱۴۰۴ چطوره؟", "حداقل حقوق ۱۴۰۴ چنده؟", "سنوات چطور محاسبه می‌شه؟", "عیدی چقدر می‌شنوم؟", "نرخ بیمه چند درصده؟"],
   },
   { label: "سود و حاشیه", examples: ["سود ناخالص یعنی چی؟", "سود خالص با ناخالص چه فرقی داره؟", "حاشیه سود چطور حساب می‌شه؟"] },
   { label: "استهلاک", examples: ["استهلاک چیه؟", "فرمول استهلاک چیه؟", "روش های استهلاک چیان؟"] },
   { label: "چک و سفته", examples: ["قوانین چک چیان؟", "تفاوت چک و سفته چی؟"] },
   { label: "سامانه مودیان", examples: ["مهلت ارسال فاکتور به مودیان چنده؟", "صورتحساب الکترونیکی چیه؟"] },
   { label: "مالیات اشخاص", examples: ["مالیات شرکت چنده؟", "نرخ مالیات مشاغل چطوره؟", "ماده ۱۶۹ چیه؟", "معافیت های مالیاتی چیان؟", "اقساط مالیاتی چی؟"] },
   { label: "صورت‌های مالی", examples: ["ترازنامه چیه؟", "صورت سود و زیان چیه؟", "نسبت جاری چیه؟"] },
   { label: "مفاهیم کاربردی", examples: ["جریان نقدی با سود چه فرقی داره؟", "حسابداری تعهدی یعنی چی؟", "بهای تمام شده چیه؟", "میانگین متحرک چیه؟", "تسعیر ارز چیه؟", "مغایرت گیری بانکی چیه؟", "موجودی اولیه چطور ثبت کنم؟"] },
  ],
 },
 {
  id: "catalog-inventory",
  title: "کالا و انبار",
  icon: Package,
  items: [
   { label: "شمارش کالا", examples: ["چند کالا دارم؟", "چند محصول دارم؟"] },
   { label: "موجودی و قیمت کالا", examples: ["موجودی شیر چنده؟", "قیمت کالای آب معدنی چند؟"] },
   { label: "ارزش انبار", examples: ["ارزش انبارم چقدره؟"] },
  ],
 },
 {
  id: "catalog-actions",
  title: "اجرای دستور و ناوبری",
  icon: Zap,
  items: [
   { label: "فاکتور جدید (فرم آماده با پیش‌پر شدن طرف‌حساب)", examples: ["فاکتور جدید بساز", "فاکتور جدید برای علی بساز", "فاکتور خرید جدید بساز"] },
   { label: "ثبت واقعی با اقلام و مبالغ", examples: ["فاکتور ۲ تا شیر ۵۰ هزار برای علی بزن", "هزینه ۲ میلیون اجاره ثبت کن", "مشتری کوییک مارکت با موبایل ۰۹۱۲۳۴۵۶۷۸۹ اضافه کن"] },
   { label: "کالا و مشتری جدید", examples: ["کالای جدید بساز", "مشتری جدید بساز"] },
   { label: "ناوبری ماژول‌ها", examples: ["برو به انبار", "برو به مشتری ها", "گزارش ساز رو باز کن"] },
  ],
 },
 {
  id: "catalog-tools",
  title: "ابزارها و ماشین‌حساب",
  icon: Calculator,
  items: [
   { label: "درصد از مبلغ", examples: ["۱۲ درصد ۴۵۰۰۰۰ چنده؟", "۵ درصد ۲۰۰۰۰۰"] },
   { label: "سود/تخفیف درصدی", examples: ["سود ۳۰ درصد روی ۲ میلیون", "تخفیف ۲۰ درصد روی ۵ میلیون"] },
   { label: "عبارت ریاضی", examples: ["۴۵۰۰۰۰ بعلاوه ۱۲۰۰۰", "۲ میلیون منهای ۵۰۰ هزار"] },
  ],
 },
];

// ============ Agent mode (ایجنت اجراکننده دستورات) ============
const AGENT_MODE_KEY = "hoshhesab_ai_agent_mode";

const AGENT_PHASES = [
 "در حال تحلیل و اجرا...",
 "در حال بررسی داده‌های شما...",
 "در حال اجرای دستور...",
 "در حال جمع‌بندی نتیجه...",
] as const;

const MODULE_FA: Record<string, string> = {
 dashboard: "داشبورد",
 invoices: "فاکتورها",
 "expense-tracker": "رهگیری هزینه‌ها",
 crm: "مدیریت مشتریان",
 inventory: "انبار",
 "reports-builder": "سازنده گزارش‌ها",
 tax: "مالیات",
};

// آیکون هر ابزار ایجنت
const AGENT_TOOL_ICONS: Record<string, React.ElementType> = {
 create_invoice: FileEdit,
 create_expense: Receipt,
 add_customer: UserPlus,
 add_product: Package,
 record_payment: Wallet,
};

interface AgentExecutedAction {
 tool: string;
 label: string;
 success: boolean;
 summary: string;
 module?: string;
 url?: string;
}

interface ChatAttachment {
 type: "image" | "file";
 name: string;
 preview?: string; // data URL for images
 content?: string; // text content for files
 mime: string;
 size: number;
}

// ============ v33-d: اکشن اجرایی موتور آفلاین (هم‌شکل سرور — بدون ایمپورت سروری) ============
// ساختار همان AssistantAppAction در lib/offline-agent-v2 است؛ برای اینکه
// باندل کلاینت Prisma را نکشد، اینجا ساختار معادل تعریف می‌شود.
interface AssistantAppActionU {
 type: "navigate" | "open-module" | "open-report" | "new-invoice" | "new-product" | "new-party";
 module: string;
 eventAction?: string;
 label: string;
 partyName?: string;
 invoiceType?: "SALE" | "PURCHASE";
}

interface ChatMessage {
 id: string;
 role: "user" | "assistant";
 content: string;
 createdAt: number;
 attachments?: ChatAttachment[];
 pending?: boolean; // assistant placeholder while streaming
 contextLoaded?: boolean;
 // کارت‌های اکشن ایجنت (نتیجه اجرای ابزارها)
 agentActions?: AgentExecutedAction[];
 // FIX(v10-ai): منابع دانش‌نامه استفاده‌شده در این پاسخ
 knowledgeSources?: string[];
 // v32-F: پاسخ توسط موتور آفلاین محلی ساخته شده (بدون LLM/اینترنت)
 offlineEngine?: boolean;
 // v33-d: اکشن اجرایی موتور آفلاین (دکمهٔ زیر پاسخ) + پیشنهادهای پیگیری
 assistantAction?: AssistantAppActionU;
 followUps?: string[];
}

interface Conversation {
 id: string;
 title: string;
 messages: ChatMessage[];
 createdAt: number;
 updatedAt: number;
}

interface DashboardKpis {
 revenue: number;
 expenses: number;
 profit: number;
 cash: number;
 receivable: number;
 payable: number;
}

interface DashboardData {
 kpis?: DashboardKpis;
 counts?: {
 invoices: number;
 parties: number;
 products: number;
 checks: number;
 employees: number;
 };
}

// ============ Action card (smart action) ============
type ActionType =
 | "create_invoice"
 | "create_expense"
 | "add_customer"
 | "add_product"
 | "record_payment";

interface PendingAction {
 id: string;
 type: ActionType;
 label: string;
 icon: React.ElementType;
 data: Record<string, unknown>;
 source: "voice" | "chat" | "manual";
 confidence: number;
 status: "pending" | "executing" | "success" | "error";
 result?: { url?: string; message?: string; [k: string]: unknown };
 createdAt: number;
}

// ============ Anomaly ============
interface Anomaly {
 type: string;
 severity: "low" | "medium" | "high" | "critical";
 title: string;
 description: string;
 entityId?: string;
 entityNumber?: string;
 amountToman?: number;
 detectedAt: string;
}

// ============ Helpers ============

function genId(): string {
 return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatJalaliNow(): string {
 // Server provides jalali date in context; for display we use a simple local formatter
 const now = new Date();
 try {
 const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
 year: "numeric",
 month: "long",
 day: "numeric",
 });
 return fmt.format(now);
 } catch {
 return now.toLocaleDateString("fa-IR");
 }
}

// ============ Voice-to-Action parser (client-side) ============
// تشخیص نوع اکشن از دستور صوتی فارسی و استخراج پارامترها

function normalizeDigits(s: string): string {
 return s
.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
.replace(/[٬،]/g, ",");
}

function parseAmountFromText(text: string): number | null {
 const normalized = normalizeDigits(text);
 const match = normalized.match(/(\d[\d,]*)\s*(میلیون|میلیارد|هزار|میلیونم)?/);
 if (!match) return null;
 const raw = Number(match[1].replace(/,/g, ""));
 const unit = (match[2] || "").trim();
 if (unit.startsWith("میلیارد")) return raw * 1_000_000_000;
 if (unit.startsWith("میلیون")) return raw * 1_000_000;
 if (unit.startsWith("هزار")) return raw * 1_000;
 return raw;
}

interface ParsedVoiceCommand {
 type: ActionType;
 label: string;
 icon: React.ElementType;
 data: Record<string, unknown>;
 confidence: number;
}

function parseVoiceCommand(text: string): ParsedVoiceCommand | null {
 const normalized = normalizeDigits(text).toLowerCase();
 const has = (kw: string) => normalized.includes(kw);

 // ثبت فاکتور فروش/خرید به X [مبلغ Y]
 if (has("ثبت فاکتور") || has("فاکتور ثبت") || has("فاکتور فروش") || has("فاکتور خرید")) {
 const isPurchase = has("خرید");
 const partyMatch = text.match(/(?:به|از|برای)\s+([^\s،,]+(?:\s+[^\s،,]+){0,3})/);
 const partyName = partyMatch? partyMatch[1].trim(): "";
 const amount = parseAmountFromText(text);
 return {
 type: "create_invoice",
 label: isPurchase? "ثبت فاکتور خرید": "ثبت فاکتور فروش",
 icon: FileEdit,
 data: {
 type: isPurchase? "PURCHASE": "SALE",
 partyName,
 amount: amount || 0,
 },
 confidence: partyName || amount? 0.85: 0.5,
 };
 }

 // ثبت هزینه [مبلغ X]
 if (has("ثبت هزینه") || has("هزینه ثبت") || has("ثبت کردم هزینه")) {
 const amount = parseAmountFromText(text);
 let category = "OTHER";
 if (has("بنزین") || has("سوخت")) category = "FUEL";
 else if (has("غذا") || has("ناهار") || has("شام")) category = "MEALS";
 else if (has("سفر")) category = "TRAVEL";
 else if (has("نرم") || has("لایسانس")) category = "SOFTWARE";
 const descMatch = text.match(/(?:برای|به دلیل)\s+(.+)/);
 return {
 type: "create_expense",
 label: "ثبت هزینه",
 icon: Receipt,
 data: {
 amount: amount || 0,
 category,
 description: descMatch? descMatch[1].trim(): "",
 },
 confidence: amount? 0.85: 0.5,
 };
 }

 // افزودن مشتری/طرف‌حساب
 if (
 (has("افزودن") || has("اضافه") || has("ثبت")) &&
 (has("مشتری") || has("طرف حساب") || has("طرف‌حساب") || has("خریدار") || has("فروشنده") || has("تامین"))
 ) {
 const isSupplier = has("تامین") || has("تأمین") || has("فروشنده");
 const nameMatch = text.match(/(?:به نام|بنام|نام)\s*:?\s*([^\n،,]+)/);
 const mobileMatch = text.match(/(?:موبایل|تلفن|تماس)\s*:?\s*(\+?[\d\s-]+)/);
 return {
 type: "add_customer",
 label: isSupplier? "افزودن تأمین‌کننده": "افزودن مشتری",
 icon: UserPlus,
 data: {
 name: nameMatch? nameMatch[1].trim(): "",
 mobile: mobileMatch? mobileMatch[1].trim(): "",
 type: isSupplier? "SUPPLIER": "CUSTOMER",
 },
 confidence: nameMatch? 0.85: 0.4,
 };
 }

 // افزودن محصول
 if (
 (has("افزودن") || has("اضافه") || has("ثبت")) &&
 (has("محصول") || has("کالا") || has("خدمت"))
 ) {
 const nameMatch = text.match(/(?:به نام|نام|محصول)\s*:?\s*([^\n،,]+)/);
 const priceMatch = text.match(/(?:قیمت|بهای|مبلغ)\s*(?:فروش)?\s*:?\s*(\d[\d٬,]*)/);
 const price = priceMatch? Number(normalizeDigits(priceMatch[1]).replace(/,/g, "")): 0;
 return {
 type: "add_product",
 label: "افزودن محصول",
 icon: BarChart3,
 data: {
 name: nameMatch? nameMatch[1].trim(): "",
 salePrice: price,
 unit: "عدد",
 },
 confidence: nameMatch? 0.8: 0.4,
 };
 }

 // ثبت پرداخت/دریافت
 if (has("ثبت پرداخت") || has("پرداخت فاکتور") || has("ثبت دریافت")) {
 const amount = parseAmountFromText(text);
 return {
 type: "record_payment",
 label: "ثبت پرداخت",
 icon: Calculator,
 data: {
 amount: amount || 0,
 },
 confidence: amount? 0.7: 0.3,
 };
 }

 return null;
}

// ============ Action icon helper ============
function getActionIcon(type: ActionType): React.ElementType {
 switch (type) {
 case "create_invoice": return FileEdit;
 case "create_expense": return Receipt;
 case "add_customer": return UserPlus;
 case "add_product": return BarChart3;
 case "record_payment": return Calculator;
 default: return Zap;
 }
}

function getActionLabel(type: ActionType): string {
 switch (type) {
 case "create_invoice": return "ثبت فاکتور";
 case "create_expense": return "ثبت هزینه";
 case "add_customer": return "افزودن مشتری";
 case "add_product": return "افزودن محصول";
 case "record_payment": return "ثبت پرداخت";
 default: return "اکشن";
 }
}

// ============ Storage ============

function loadConversations(): Conversation[] {
 if (typeof window === "undefined") return [];
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 if (!raw) return [];
 const parsed = JSON.parse(raw) as Conversation[];
 if (!Array.isArray(parsed)) return [];
 return parsed;
 } catch {
 return [];
 }
}

function saveConversations(convs: Conversation[]): void {
 if (typeof window === "undefined") return;
 try {
 const trimmed = convs.slice(0, MAX_CONVERSATIONS);
 localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
 } catch {
 // quota exceeded — ignore
 }
}

function makeGreeting(): ChatMessage {
 return {
 id: "greeting",
 role: "assistant",
 content:
  "سلام! من **هوش‌یار حرفه‌ای** هستم، دستیار حسابداری شما در هوش — **بدون اینترنت هم کامل کار می‌کنم** و روی دادهٔ واقعی خودتان اجرا می‌شوم.\n\n" +
  "- **دستور اجرایی:** «فاکتور جدید بساز»، «هزینه ۲ میلیون اجاره ثبت کن»، «برو به انبار»\n" +
  "- **گزارش از دادهٔ واقعی:** «فروش این ماه؟»، «چند کالا دارم؟»، «بدهی علی چقدره؟»، «قیمت دلار؟»\n" +
  "- **دانش حسابداری و مالیات:** «نقطهٔ سربه‌سر یعنی چی؟»، «نرخ ارزش افزوده؟»، «حقوق چطور محاسبه می‌شه؟»\n" +
  "- **ماشین‌حساب:** «۱۲ درصد ۴۵۰۰۰۰ چنده؟»\n\n" +
  "از دستورهای آمادهٔ زیر شروع کنید یا هرچه می‌خواهید بنویسید.",
 createdAt: Date.now(),
 };
}

function newConversation(): Conversation {
 return {
 id: genId(),
 title: "گفتگوی جدید",
 messages: [makeGreeting()],
 createdAt: Date.now(),
 updatedAt: Date.now(),
 };
}

// ============ Markdown renderer ============
// Lightweight markdown: bold (**), italic (*), inline code (`), code blocks (```),
// bullet lists (- or *), numbered lists, headings (# ## ###),
// tables (| col | col |), and paragraphs.

function renderMarkdown(text: string): React.ReactNode {
 if (!text) return null;
 const lines = text.split("\n");
 const blocks: React.ReactNode[] = [];
 let i = 0;
 let key = 0;

 while (i < lines.length) {
 const line = lines[i];

 // Code block ```
 if (line.trim().startsWith("```")) {
 const lang = line.trim().slice(3).trim();
 const codeLines: string[] = [];
 i++;
 while (i < lines.length &&!lines[i].trim().startsWith("```")) {
 codeLines.push(lines[i]);
 i++;
 }
 i++; // skip closing ```
 blocks.push(
 <pre
 key={`code-${key++}`}
 dir="ltr"
 className="my-2 rounded-lg bg-muted/80 border border-border p-3 overflow-x-auto text-[11px] font-mono leading-relaxed text-foreground"
 >
 {lang && <div className="text-[9px] text-muted-foreground mb-1">{lang}</div>}
 <code>{codeLines.join("\n")}</code>
 </pre>
 );
 continue;
 }

 // Table (|... |)
 if (
 line.trim().startsWith("|") &&
 i + 1 < lines.length &&
 /^\s*\|[-:\s|]+\|?\s*$/.test(lines[i + 1])
 ) {
 const tableLines: string[] = [];
 while (i < lines.length && lines[i].trim().startsWith("|")) {
 tableLines.push(lines[i]);
 i++;
 }
 // parse
 const rows = tableLines.map((l) =>
 l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
 );
 const header = rows[0];
 const body = rows.slice(2); // skip separator
 blocks.push(
 <div key={`tbl-${key++}`} className="my-2 overflow-x-auto rounded-lg border border-border">
 <table className="w-full text-[11px] border-collapse">
 <thead className="bg-muted/60">
 <tr>
 {header.map((h, hi) => (
 <th key={hi} className="border border-border px-2 py-1 text-start font-medium">
 {renderInline(h)}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {body.map((row, ri) => (
 <tr key={ri} className="odd:bg-background/40">
 {row.map((c, ci) => (
 <td key={ci} className="border border-border px-2 py-1">
 {renderInline(c)}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 );
 continue;
 }

 // Heading
 const hMatch = line.match(/^(#{1,4})\s+(.*)$/);
 if (hMatch) {
 const level = hMatch[1].length;
 const content = hMatch[2];
 const cls =
 level === 1? "text-sm font-bold my-1.5":
 level === 2? "text-[13px] font-bold my-1.5":
 level === 3? "text-[12px] font-semibold my-1":
 "text-[11px] font-semibold my-1";
 blocks.push(
 <div key={`h-${key++}`} className={cls}>{renderInline(content)}</div>
 );
 i++;
 continue;
 }

 // Bullet list group
 if (/^\s*[-*]\s+/.test(line)) {
 const items: string[] = [];
 while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
 items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
 i++;
 }
 blocks.push(
 <ul key={`ul-${key++}`} className="my-1 space-y-0.5 list-none">
 {items.map((it, ii) => (
 <li key={ii} className="flex gap-1.5 text-[12px] leading-relaxed">
 <span className="text-primary mt-0.5 shrink-0">•</span>
 <span className="flex-1">{renderInline(it)}</span>
 </li>
 ))}
 </ul>
 );
 continue;
 }

 // Numbered list group
 if (/^\s*\d+[.)]\s+/.test(line)) {
 const items: string[] = [];
 while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
 items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
 i++;
 }
 blocks.push(
 <ol key={`ol-${key++}`} className="my-1 space-y-0.5 list-none">
 {items.map((it, ii) => (
 <li key={ii} className="flex gap-1.5 text-[12px] leading-relaxed">
 <span className="text-primary mt-0.5 shrink-0 font-medium">{toPersianDigits(ii + 1)}.</span>
 <span className="flex-1">{renderInline(it)}</span>
 </li>
 ))}
 </ol>
 );
 continue;
 }

 // Empty line spacer
 if (line.trim() === "") {
 blocks.push(<div key={`sp-${key++}`} className="h-1.5" />);
 i++;
 continue;
 }

 // Paragraph
 blocks.push(
 <p key={`p-${key++}`} className="my-0.5 text-[12px] leading-relaxed">
 {renderInline(line)}
 </p>
 );
 i++;
 }

 return <>{blocks}</>;
}

// Inline: **bold**, *italic*, `code`, [link](url)
function renderInline(text: string): React.ReactNode {
 const parts: React.ReactNode[] = [];
 let remaining = text;
 let k = 0;
 const push = (node: React.ReactNode) => parts.push(<React.Fragment key={k++}>{node}</React.Fragment>);

 // Pattern matches code first (highest priority), then bold, then italic, then link
 const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
 let lastIndex = 0;
 let match: RegExpExecArray | null;

 while ((match = pattern.exec(remaining))!== null) {
 if (match.index > lastIndex) {
 push(remaining.slice(lastIndex, match.index));
 }
 const token = match[0];
 if (token.startsWith("`")) {
 push(
 <code
 dir="ltr"
 className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]"
 >
 {token.slice(1, -1)}
 </code>
 );
 } else if (token.startsWith("**")) {
 push(<strong className="font-semibold">{token.slice(2, -2)}</strong>);
 } else if (token.startsWith("*")) {
 push(<em className="italic">{token.slice(1, -1)}</em>);
 } else if (token.startsWith("[")) {
 const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
 if (m) {
 push(
 <a
 href={m[2]}
 target="_blank"
 rel="noopener noreferrer"
 className="text-primary underline hover:opacity-80"
 dir="ltr"
 >
 {m[1]}
 </a>
 );
 } else {
 push(token);
 }
 } else {
 push(token);
 }
 lastIndex = match.index + token.length;
 }
 if (lastIndex < remaining.length) {
 push(remaining.slice(lastIndex));
 }
 return <>{parts}</>;
}

// ============ Action detector ============
interface DetectedAction {
 id: string;
 label: string;
 icon: React.ElementType;
 navigate: string;
 // اگر موجود باشد، دکمه‌ی «اجرا کن» نشان داده می‌شود
 execute?: {
 type: ActionType;
 data: Record<string, unknown>;
 };
}

// ============ RAG Result ============
interface RagSource {
 type: string;
 id: string;
 title: string;
 detail: string;
 url?: string;
}
interface RagResult {
 reply: string;
 intent: string;
 sources: RagSource[];
 sourcesCount: number;
 usedFallback: boolean;
}

function detectActions(content: string): DetectedAction[] {
 const actions: DetectedAction[] = [];
 const text = content.toLowerCase();
 const has = (kw: string) => text.includes(kw);

 // استخراج مبالغ و اسامی از محتوای AI برای اجرای مستقیم اکشن‌ها
 const amountMatch = content.match(/(\d[\d٬,]*)\s*(میلیون|میلیارد|هزار|میلیونم)?/);
 const extractedAmount = amountMatch? parseAmountFromText(content): null;
 const partyMatch = content.match(/(?:به نام|بنام|نام|برای)\s+:?\s*([^\n،,.]+?)(?=[.،\n]|$)/);
 const extractedPartyName = partyMatch? partyMatch[1].trim(): null;

 if (has("فاکتور فروش") || has("ثبت فروش")) {
 actions.push({
 id: "act-invoice-sale",
 label: "ثبت فاکتور فروش",
 icon: FileEdit,
 navigate: "invoices",
 execute: {
 type: "create_invoice",
 data: {
 type: "SALE",
 partyName: extractedPartyName || "",
 amount: extractedAmount || 0,
 description: "فاکتور از پیشنهاد هوش‌یار",
 },
 },
 });
 }
 if (has("فاکتور خرید") || has("ثبت خرید")) {
 actions.push({
 id: "act-invoice-purchase",
 label: "ثبت فاکتور خرید",
 icon: FileEdit,
 navigate: "invoices",
 execute: {
 type: "create_invoice",
 data: {
 type: "PURCHASE",
 partyName: extractedPartyName || "",
 amount: extractedAmount || 0,
 description: "فاکتور از پیشنهاد هوش‌یار",
 },
 },
 });
 }
 if ((has("هزینه") && (has("ثبت") || has("افزودن") || has(" register"))) || has("expense")) {
 actions.push({
 id: "act-expense",
 label: "ثبت هزینه",
 icon: Receipt,
 navigate: "expense-tracker",
 execute: {
 type: "create_expense",
 data: {
 amount: extractedAmount || 0,
 category: "OTHER",
 description: "هزینه از پیشنهاد هوش‌یار",
 },
 },
 });
 }
 if (has("مشتری") && (has("افزودن") || has("ثبت") || has("جدید") || has("create"))) {
 actions.push({
 id: "act-add-customer",
 label: "افزودن مشتری",
 icon: UserPlus,
 navigate: "crm",
 execute: {
 type: "add_customer",
 data: {
 name: extractedPartyName || "",
 type: "CUSTOMER",
 },
 },
 });
 }
 if (has("گزارش") || has("تحلیل مالی") || has("report")) {
 actions.push({
 id: "act-report",
 label: "گزارش مالی",
 icon: BarChart3,
 navigate: "reports-builder",
 });
 }
 if (has("مالیات") || has("ارزش افزوده") || has("tax")) {
 actions.push({
 id: "act-tax",
 label: "محاسبه مالیات",
 icon: Calculator,
 navigate: "tax",
 });
 }
 // dedupe by navigate
 const seen = new Set<string>();
 return actions.filter((a) => {
 if (seen.has(a.id)) return false;
 seen.add(a.id);
 return true;
 }).slice(0, 4);
}

// ============ Props ============

export interface AIAssistantProProps {
 onNavigate?: (viewId: string) => void;
}

// ============ Main component ============

export function AIAssistantPro({ onNavigate }: AIAssistantProProps) {
 const [open, setOpen] = React.useState(false);
 const [conversations, setConversations] = React.useState<Conversation[]>([]);
 const [activeConvId, setActiveConvId] = React.useState<string | null>(null);
 const [showHistory, setShowHistory] = React.useState(false);
 const [input, setInput] = React.useState("");
 const [loading, setLoading] = React.useState(false);
 const [attachment, setAttachment] = React.useState<ChatAttachment | null>(null);
 const [speakingId, setSpeakingId] = React.useState<string | null>(null);
 const [dashboardData, setDashboardData] = React.useState<DashboardData | null>(null);
 const [contextReady, setContextReady] = React.useState(false);
 const [copiedId, setCopiedId] = React.useState<string | null>(null);

 // Agent mode (ایجنت اجراکننده دستورات) — پیش‌فرض روشن
 const [agentMode, setAgentMode] = React.useState(true);
 const [agentPhase, setAgentPhase] = React.useState(0);

 // Voice-to-Action + Smart Actions state
 const [voiceCommandMode, setVoiceCommandMode] = React.useState(false);
 const [pendingActions, setPendingActions] = React.useState<PendingAction[]>([]);

 // Workflow Builder modal
 const [workflowOpen, setWorkflowOpen] = React.useState(false);
 // v33-d: دستورالعمل کامل (خوش‌آمد) + دیالوگ کاتالوگ دستورات
 const [showFullCommands, setShowFullCommands] = React.useState(false);
 const [catalogOpen, setCatalogOpen] = React.useState(false);

 // Anomaly detection
 const [anomalyOpen, setAnomalyOpen] = React.useState(false);
 const [anomalyLoading, setAnomalyLoading] = React.useState(false);
 const [anomalies, setAnomalies] = React.useState<Anomaly[]>([]);
 const [anomalySummary, setAnomalySummary] = React.useState<{ total: number; critical: number; high: number; medium: number; low: number } | null>(null);

 // RAG analysis (تحلیل داده‌ها)
 const [ragOpen, setRagOpen] = React.useState(false);
 const [ragLoading, setRagLoading] = React.useState(false);
 const [ragResult, setRagResult] = React.useState<RagResult | null>(null);
 const [ragQuestion, setRagQuestion] = React.useState("");

 // Inline action execution from AI responses
 const [executingActionId, setExecutingActionId] = React.useState<string | null>(null);
 const [executedActions, setExecutedActions] = React.useState<Record<string, { success: boolean; message?: string; url?: string }>>({});

 const scrollRef = React.useRef<HTMLDivElement>(null);
 const fileImageRef = React.useRef<HTMLInputElement>(null);
 const fileDocRef = React.useRef<HTMLInputElement>(null);
 const abortRef = React.useRef<AbortController | null>(null);
 const { toast } = useToast();

 // ─── FIX(voice): ضبط صدا با MediaRecorder + ASR سمت سرور ───
 // (جایگزین Web Speech API مرورگر که بی‌صدا شکست می‌خورد)
 const [voicePreview, setVoicePreview] = React.useState("");
 const voiceInput = useVoiceAsr({
  maxDurationMs: 12_000,
  silenceMs: 1_600,
  initialSilenceMs: 4_500,
  onError: (msgFa) => {
   toast({ title: "خطای ورودی صوتی", description: msgFa, variant: "destructive" });
  },
  onTranscript: (text) => {
   setVoicePreview(text? `شنیده شد: ${text}`: "");
   if (text) {
    setInput((prev) => (prev? prev + " " + text: text));
   }
   // FIX(v13-sound): متن خالی (سکوت/لغو) بدون toast خطا — بی‌صدا رد می‌شود
  },
 });
 const voiceCommand = useVoiceAsr({
  maxDurationMs: 10_000,
  silenceMs: 1_500,
  initialSilenceMs: 4_500,
  onError: (msgFa) => {
   toast({ title: "خطای دستور صوتی", description: msgFa, variant: "destructive" });
  },
  onTranscript: (text) => {
   setVoicePreview(text? `شنیده شد: ${text}`: "");
   if (!text) {
    // FIX(v13-sound): بدون toast خطا
    return;
   }
   // همان pipeline قبلی: پارس دستور → کارت اکشن در انتظار تأیید
   const parsed = parseVoiceCommand(text.trim());
   if (parsed) {
    const newAction: PendingAction = {
     id: genId(),
     type: parsed.type,
     label: parsed.label,
     icon: parsed.icon,
     data: parsed.data,
     source: "voice",
     confidence: parsed.confidence,
     status: "pending",
     createdAt: Date.now(),
    };
    setPendingActions((prev) => [...prev, newAction]);
    toast({
     title: "دستور صوتی شناسایی شد",
     description: `${parsed.label} — برای تأیید روی کارت اکشن کلیک کنید.`,
    });
   } else {
    toast({
     title: "دستور نامشخص",
     description: "نتوانستم دستور شما را تشخیص بدهم. مثال: «ثبت فاکتور فروش به آلفا ۵ میلیون»",
     variant: "destructive",
    });
    // متن شنیده‌شده در چت می‌افتد تا ایجنت خودش پردازش کند
    setInput(text.trim());
   }
  },
 });
 // حالت‌های مشتق‌شده از ضبط‌کننده‌ها
 const isListening = voiceInput.recording || voiceInput.transcribing;
 const isListeningCommand = voiceCommand.recording || voiceCommand.transcribing;

 // ---- Hydrate conversations from localStorage ----
 React.useEffect(() => {
 const loaded = loadConversations();
 if (loaded.length === 0) {
 const conv = newConversation();
 setConversations([conv]);
 setActiveConvId(conv.id);
 } else {
 setConversations(loaded);
 setActiveConvId(loaded[0].id);
 }
 }, []);

 // ---- FIX(mobile): گوش دادن به رویداد باز شدن از منابع خارجی ----
 // (دکمه AI در نوار پایین موبایل + دکمه‌های داشبورد + فرمان صوتی)
 // قبلاً فقط FinancialAssistant به این رویداد گوش می‌داد که mount نشده بود.
 React.useEffect(() => {
 const handler = () => setOpen(true);
 window.addEventListener("hoshhesab:open-assistant", handler);
 return () => window.removeEventListener("hoshhesab:open-assistant", handler);
 }, []);

 // ---- FIX(B11): اعلام وضعیت باز/بسته به ویجت‌های شناور ----
 // QuickActions/VoiceCommander در موبایل روی پنل چت می‌افتادند؛ حالا با این
 // رویدادها هنگام باز بودن پنل، خودشان را پنهان می‌کنند.
 React.useEffect(() => {
 if (open) {
 window.dispatchEvent(new CustomEvent("hoshhesab:assistant-open"));
 } else {
 window.dispatchEvent(new CustomEvent("hoshhesab:assistant-close"));
 // FIX(voice): با بستن پنل، ضبط‌های جاری صوتی لغو می‌شوند
 voiceInput.cancel();
 voiceCommand.cancel();
 setVoicePreview("");
 }
 }, [open]);

 // ---- Save conversations on change ----
 // FIX(v11): حین استریم ذخیره نمی‌کنیم — قبلاً با هر توکن یک JSON.stringify
 // کامل از ۱۰ مکالمه می‌شد (کندی روی موبایل)؛ پایان استریم هم ذخیره می‌شود
 React.useEffect(() => {
 if (conversations.length === 0 || loading) return;
 const t = setTimeout(() => saveConversations(conversations), 400);
 return () => clearTimeout(t);
 }, [conversations, loading]);

 // ---- Agent mode: بازیابی از localStorage ----
 React.useEffect(() => {
 try {
 const stored = localStorage.getItem(AGENT_MODE_KEY);
 if (stored !== null) setAgentMode(stored === "1");
 } catch {
 /* ignore */
 }
 }, []);

 // ---- Agent mode: فازهای پیش‌رونده هنگام اجرای دستور ----
 React.useEffect(() => {
 if (!loading || !agentMode) {
 setAgentPhase(0);
 return;
 }
 const t1 = setTimeout(() => setAgentPhase(1), 1200);
 const t2 = setTimeout(() => setAgentPhase(2), 3000);
 const t3 = setTimeout(() => setAgentPhase(3), 6500);
 return () => {
 clearTimeout(t1);
 clearTimeout(t2);
 clearTimeout(t3);
 };
 }, [loading, agentMode]);

 // ---- Fetch context (dashboard + invoices) on mount ----
 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 // FIX(v6): روی لندینگ (بدون توکن) اصلاً داشبورد نخواه — قبلاً پاسخ
 // بی‌احراز/خالی کش مشترک را مسموم می‌کرد و بعد از ورود، ویجت‌های
 // داشبورد تا ۳۰ ثانیه خالی نشان داده می‌شدند.
 if (!getAuthToken()) {
 if (!cancelled) setContextReady(true);
 return;
 }
 try {
 // FIX: کش مشترک ۳۰ ثانیه‌ای — دیگر یک درخواست جداگانه به /api/dashboard نمی‌زنیم
 const data = await fetchDashboardSharedExport();
 if (!cancelled) {
 setDashboardData(data as unknown as DashboardData);
 }
 } catch {
 // ignore — context is best-effort
 } finally {
 if (!cancelled) setContextReady(true);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, []);

 // ---- Auto-scroll on messages change ----
 const activeConv = conversations.find((c) => c.id === activeConvId);
 const messages = activeConv?.messages?? [];

 React.useEffect(() => {
 if (scrollRef.current) {
 scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
 }
 }, [messages, loading]);

 // ---- Update conversation messages helper ----
 const updateMessages = React.useCallback(
 (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
 setConversations((prev) =>
 prev.map((c) => {
 if (c.id!== activeConvId) return c;
 const newMessages = updater(c.messages).slice(-MAX_MESSAGES_PER_CONV);
 // auto-title from first user message
 const firstUser = newMessages.find((m) => m.role === "user");
 const title =
 c.title === "گفتگوی جدید" && firstUser
? firstUser.content.slice(0, 40) + (firstUser.content.length > 40? "…": "")
: c.title;
 return {...c, messages: newMessages, title, updatedAt: Date.now() };
 })
 );
 },
 [activeConvId]
 );

 // ---- Start new conversation ----
 const startNewConversation = React.useCallback(() => {
 const conv = newConversation();
 setConversations((prev) => [conv,...prev].slice(0, MAX_CONVERSATIONS));
 setActiveConvId(conv.id);
 setShowHistory(false);
 setInput("");
 setAttachment(null);
 }, []);

 // ---- Delete conversation ----
 const deleteConversation = React.useCallback(
 (id: string) => {
 setConversations((prev) => {
 const filtered = prev.filter((c) => c.id!== id);
 if (filtered.length === 0) {
 const conv = newConversation();
 setActiveConvId(conv.id);
 return [conv];
 }
 if (id === activeConvId) {
 setActiveConvId(filtered[0].id);
 }
 return filtered;
 });
 },
 [activeConvId]
 );

 // ---- Clear current chat ----
 const clearChat = React.useCallback(() => {
 if (!activeConvId) return;
 setConversations((prev) =>
 prev.map((c) =>
 c.id === activeConvId
? {...c, messages: [makeGreeting()], title: "گفتگوی جدید", updatedAt: Date.now() }
: c
 )
 );
 toast({ title: "چت پاک شد", description: "گفتگوی جدید شروع شد." });
 }, [activeConvId, toast]);

 // ---- Stop speaking ----
 const stopSpeaking = React.useCallback(() => {
 if (typeof window!== "undefined" && "speechSynthesis" in window) {
 window.speechSynthesis.cancel();
 }
 setSpeakingId(null);
 }, []);

 // ---- Speak text aloud (Persian) ----
 const speak = React.useCallback(
 (id: string, text: string) => {
 if (typeof window === "undefined" ||!("speechSynthesis" in window)) {
 toast({ title: "پشتیبانی نمی‌شود", description: "مرورگر شما قابلیت speech را ندارد.", variant: "destructive" });
 return;
 }
 // toggle off if same id
 if (speakingId === id) {
 stopSpeaking();
 return;
 }
 window.speechSynthesis.cancel();
 const clean = text.replace(/[*#`|>_~-]/g, " ").replace(/\s+/g, " ").trim();
 const utter = new SpeechSynthesisUtterance(clean);
 utter.lang = "fa-IR";
 utter.rate = 1;
 utter.pitch = 1;
 const voices = window.speechSynthesis.getVoices();
 const faVoice = voices.find((v) => v.lang?.startsWith("fa"));
 if (faVoice) utter.voice = faVoice;
 utter.onend = () => setSpeakingId(null);
 utter.onerror = () => setSpeakingId(null);
 window.speechSynthesis.speak(utter);
 setSpeakingId(id);
 },
 [speakingId, stopSpeaking, toast]
 );

 // ---- Voice input (FIX(voice): MediaRecorder + ASR سمت سرور) ----
 const toggleListening = React.useCallback(() => {
 if (isListening) {
 voiceInput.stop();
 return;
 }
 setVoicePreview("");
 void voiceInput.start();
 }, [isListening, voiceInput]);

 // ---- Voice Command Mode (پارس دستور → کارت اکشن) ----
 const toggleVoiceCommand = React.useCallback(() => {
 if (isListeningCommand) {
 voiceCommand.stop();
 return;
 }
 setVoiceCommandMode(true);
 setVoicePreview("");
 void voiceCommand.start();
 }, [isListeningCommand, voiceCommand]);

 // ---- Confirm action (execute via /api/ai/execute) ----
 // FIX(v11): پس از هر عمل ثبت‌شده توسط هوش‌یار، رویداد سراسری مناسب پخش شود
 // تا ماژول‌های باز (فاکتورها/داشبورد) بدون رفرش صفحه به‌روز شوند
 const dispatchMutationEvents = React.useCallback((actionType: string) => {
 if (typeof window === "undefined") return;
 const map: Record<string, string> = {
 create_invoice: "hoshhesab:invoices-changed",
 record_payment: "hoshhesab:invoices-changed",
 create_expense: "hoshhesab:expenses-changed",
 add_customer: "hoshhesab:parties-changed",
 add_product: "hoshhesab:products-changed",
 };
 const ev = map[actionType];
 if (ev) window.dispatchEvent(new CustomEvent(ev));
 }, []);

 const confirmAction = React.useCallback(
 async (actionId: string) => {
 const action = pendingActions.find((a) => a.id === actionId);
 if (!action) return;
 // Mark executing
 setPendingActions((prev) =>
 prev.map((a) => (a.id === actionId? {...a, status: "executing" }: a))
 );
 try {
 const res = await authFetch("/api/ai/execute", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 action: action.type,
 data: action.data,
 source: action.source,
 confirmed: true,
 }),
 });
 const data = await res.json();
 if (data.success) {
 setPendingActions((prev) =>
 prev.map((a) =>
 a.id === actionId? {...a, status: "success", result: data.data }: a
 )
 );
 toast({
 title: "اکشن اجرا شد ",
 description: `${action.label} با موفقیت ثبت شد.`,
 });
 dispatchMutationEvents(action.type);
 // Remove from pending after 3 seconds (keep success state briefly)
 setTimeout(() => {
 setPendingActions((prev) => prev.filter((a) => a.id!== actionId));
 }, 5000);
 } else {
 setPendingActions((prev) =>
 prev.map((a) => (a.id === actionId? {...a, status: "error", result: { message: data.error } }: a))
 );
 toast({
 title: "خطا در اجرای اکشن",
 description: data.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } catch (e) {
 setPendingActions((prev) =>
 prev.map((a) => (a.id === actionId? {...a, status: "error", result: { message: (e as Error).message } }: a))
 );
 toast({
 title: "خطا در اجرای اکشن",
 description: e instanceof Error? e.message: "خطای شبکه",
 variant: "destructive",
 });
 }
 },
 [pendingActions, toast]
 );

 // ---- Dismiss action ----
 const dismissAction = React.useCallback((actionId: string) => {
 setPendingActions((prev) => prev.filter((a) => a.id!== actionId));
 }, []);

 // ---- Edit action data (before confirm) ----
 const updateActionData = React.useCallback(
 (actionId: string, field: string, value: unknown) => {
 setPendingActions((prev) =>
 prev.map((a) =>
 a.id === actionId? {...a, data: {...a.data, [field]: value } }: a
 )
 );
 },
 []
 );

 // ---- Agent mode: روشن/خاموش کردن + ذخیره در localStorage ----
 const toggleAgentMode = React.useCallback(() => {
 setAgentMode((prev) => {
 const next = !prev;
 try {
 localStorage.setItem(AGENT_MODE_KEY, next ? "1" : "0");
 } catch {
 /* ignore */
 }
 toast({
 title: next ? "حالت ایجنت فعال شد" : "حالت ایجنت خاموش شد",
 description: next
 ? "دستورات شما (ثبت فاکتور، هزینه، مشتری و...) مستقیماً اجرا می‌شوند."
 : "پاسخ‌ها به‌صورت گفتگوی معمولی و استریم نمایش داده می‌شوند.",
 });
 return next;
 });
 }, [toast]);

 // ---- Agent mode: هدایت به ماژول (onNavigate + رویداد سراسری برای دیالوگ‌های داخلی) ----
 const handleAgentGoToModule = React.useCallback(
 (module: string, action?: string) => {
 if (!module) return;
 onNavigate?.(module);
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", {
 detail: { module, action },
 })
 );
 },
 [onNavigate]
 );

 // ---- v33-d: اجرای اکشن موتور آفلاین (دکمهٔ زیر پاسخ) ----
 // new-invoice → app-shell فرم فاکتور را باز می‌کند؛ سپس رویداد پیش‌پر شدن
 // با نام طرف‌حساب فرستاده می‌شود (hoshhesab:invoice-form-prefill).
 const executeAssistantAction = React.useCallback(
 (a: AssistantAppActionU) => {
 if (!a || !a.module) return;
 handleAgentGoToModule(a.module, a.eventAction);
 if (a.type === "new-invoice" && (a.partyName || a.invoiceType)) {
 setTimeout(() => {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:invoice-form-prefill", {
 detail: { partyName: a.partyName, type: a.invoiceType },
 })
 );
 }, 400);
 }
 toast({
 title: "اجرای دستور",
 description: a.label || "در حال انتقال...",
 });
 },
 [handleAgentGoToModule, toast]
 );

 // ---- Run anomaly detection ----
 const runAnomalyDetection = React.useCallback(async () => {
 setAnomalyOpen(true);
 setAnomalyLoading(true);
 setAnomalies([]);
 setAnomalySummary(null);
 try {
 const res = await authFetch("/api/ai/anomaly-detect", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ createNotifications: true }),
 });
 const data = await res.json();
 if (data.success) {
 setAnomalies(data.anomalies || []);
 setAnomalySummary(data.summary || null);
 if ((data.anomalies || []).length === 0) {
 toast({ title: "ناهنجاری یافت نشد", description: "داده‌های شما سالم به نظر می‌رسد." });
 } else {
 toast({
 title: `${toPersianDigits((data.anomalies || []).length)} ناهنجاری شناسایی شد`,
 description: `${toPersianDigits(data.summary.critical)} بحرانی · ${toPersianDigits(data.summary.high)} با اهمیت`,
 });
 }
 } else {
 toast({ title: "خطا", description: data.error, variant: "destructive" });
 }
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطای شبکه",
 variant: "destructive",
 });
 } finally {
 setAnomalyLoading(false);
 }
 }, [toast]);

 // ---- Run RAG analysis (تحلیل داده‌ها) ----
 const runRagAnalysis = React.useCallback(
 async (question?: string) => {
 const q = (question?? ragQuestion).trim();
 if (!q) {
 toast({
 title: "سوال الزامی است",
 description: "یک سوال درباره‌ی داده‌های خود بنویسید.",
 variant: "destructive",
 });
 return;
 }
 setRagOpen(true);
 setRagLoading(true);
 setRagResult(null);
 try {
 const res = await authFetch("/api/ai/rag", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ question: q }),
 });
 const data = await res.json();
 if (data.success) {
 setRagResult({
 reply: data.reply || "",
 intent: data.intent || "general",
 sources: data.sources || [],
 sourcesCount: data.sourcesCount || 0,
 usedFallback:!!data.usedFallback,
 });
 // همچنین پاسخ را به‌عنوان پیام دستیار به چت اضافه می‌کنیم
 const ragMessage: ChatMessage = {
 id: `rag-${Date.now()}`,
 role: "assistant",
 content: ` **تحلیل داده‌ها** — سوال: «${q}»\n\n${data.reply || ""}\n\n${
 (data.sources || []).length > 0
? `**منابع:** ${data.sources.length} منبع از پایگاه داده شما`
: "**منبعی یافت نشد.**"
 }`,
 createdAt: Date.now(),
 };
 updateMessages((prev) => [...prev, ragMessage]);
 toast({
 title: "تحلیل کامل شد",
 description: `${toPersianDigits(data.sourcesCount || 0)} منبع استخراج شد.`,
 });
 } else {
 toast({ title: "خطا", description: data.error, variant: "destructive" });
 }
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطای شبکه",
 variant: "destructive",
 });
 } finally {
 setRagLoading(false);
 }
 },
 [ragQuestion, toast, updateMessages]
 );

 // ---- Execute detected action inline (from AI response chips) ----
 const executeActionInline = React.useCallback(
 async (action: DetectedAction, messageId: string) => {
 if (!action.execute) return;
 const execKey = `${messageId}:${action.id}`;
 setExecutingActionId(execKey);
 try {
 const res = await authFetch("/api/ai/execute", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 action: action.execute!.type,
 data: action.execute!.data,
 source: "chat",
 confirmed: true,
 }),
 });
 const data = await res.json();
 if (data.success) {
 setExecutedActions((prev) => ({
...prev,
 [execKey]: {
 success: true,
 message: data.data?.number
? `شماره: ${data.data.number}`
: "با موفقیت ثبت شد",
 url: data.data?.url,
 },
 }));
 toast({
 title: "اکشن اجرا شد ",
 description: `${action.label} با موفقیت ثبت شد.`,
 });
 dispatchMutationEvents(action.execute!.type);
 } else {
 setExecutedActions((prev) => ({
...prev,
 [execKey]: { success: false, message: data.error || "خطای ناشناخته" },
 }));
 toast({
 title: "خطا در اجرای اکشن",
 description: data.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } catch (e) {
 setExecutedActions((prev) => ({
...prev,
 [execKey]: { success: false, message: (e as Error).message },
 }));
 toast({
 title: "خطا در اجرای اکشن",
 description: e instanceof Error? e.message: "خطای شبکه",
 variant: "destructive",
 });
 } finally {
 setExecutingActionId(null);
 }
 },
 [toast]
 );

 // ---- File handling ----
 const handleImageFile = React.useCallback(
 (file: File) => {
 if (!file.type.startsWith("image/")) {
 toast({ title: "نوع فایل نامعتبر", description: "تصویر انتخاب کنید.", variant: "destructive" });
 return;
 }
 if (file.size > 5 * 1024 * 1024) {
 toast({ title: "حجم زیاد", description: "حداکثر ۵ مگابایت.", variant: "destructive" });
 return;
 }
 const reader = new FileReader();
 reader.onload = () => {
 const dataUrl = reader.result as string;
 setAttachment({
 type: "image",
 name: file.name,
 preview: dataUrl,
 mime: file.type,
 size: file.size,
 });
 };
 reader.readAsDataURL(file);
 },
 [toast]
 );

 const handleDocFile = React.useCallback(
 (file: File) => {
 const allowed = [".csv", ".tsv", ".txt", ".json", ".xml"];
 const ok = allowed.some((ext) => file.name.toLowerCase().endsWith(ext));
 if (!ok &&!file.type.startsWith("text/") && file.type!== "application/json") {
 toast({
 title: "نوع فایل پشتیبانی نمی‌شود",
 description: "فقط CSV/TSV/TXT/JSON/XML.",
 variant: "destructive",
 });
 return;
 }
 if (file.size > 2 * 1024 * 1024) {
 toast({ title: "حجم زیاد", description: "حداکثر ۲ مگابایت.", variant: "destructive" });
 return;
 }
 const reader = new FileReader();
 reader.onload = () => {
 const text = reader.result as string;
 setAttachment({
 type: "file",
 name: file.name,
 content: text,
 mime: file.type || "text/plain",
 size: file.size,
 });
 };
 reader.readAsText(file);
 },
 [toast]
 );

 // ---- Send message (main flow) ----
 const send = React.useCallback(
 async (overrideText?: string) => {
 const content = (overrideText?? input).trim();
 if ((!content &&!attachment) || loading) return;

 const userMsg: ChatMessage = {
 id: genId(),
 role: "user",
 content: content || (attachment? "(فایل پیوست)": ""),
 createdAt: Date.now(),
 attachments: attachment? [attachment]: undefined,
 };
 const assistantId = `a-${Date.now()}`;
 const assistantPlaceholder: ChatMessage = {
 id: assistantId,
 role: "assistant",
 content: "",
 createdAt: Date.now(),
 pending: true,
 };

 // --- If image attachment call vision API and then continue chat ---
 updateMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
 setInput("");
 setAttachment(null);
 setLoading(true);

 abortRef.current?.abort();
 const controller = new AbortController();
 abortRef.current = controller;

 try {
 // Build payload
 let visionResult: string | null = null;
 if (attachment?.type === "image" && attachment.preview) {
 // Call vision API first — FIX(v10-ai): authFetch (قبلاً بدون توکن 401 می‌شد)
 const vRes = await authFetch("/api/ai/vision", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 image: attachment.preview,
 prompt: content || "این تصویر را تحلیل کن.",
 }),
 signal: controller.signal,
 });
 if (vRes.ok) {
 const vData = await vRes.json();
 if (vData.success && vData.reply) {
 visionResult = vData.reply;
 } else {
 // FIX(v11): خطای تحلیل تصویر بی‌صدا حذف نمی‌شود — به کاربر اعلام می‌شود
 throw new Error(vData?.error || "تحلیل تصویر ناموفق بود — لطفاً عکس واضح‌تری بفرستید.");
 }
 } else {
 const errData = await vRes.json().catch(() => ({}));
 throw new Error(errData?.error || `خطای ${vRes.status}`);
 }
 } else if (attachment?.type === "file" && attachment.content) {
 // Call file-analyze API first
 const fRes = await authFetch("/api/ai/file-analyze", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 content: attachment.content,
 fileName: attachment.name,
 prompt: content || "این داده را تحلیل کن.",
 }),
 signal: controller.signal,
 });
 if (fRes.ok) {
 const fData = await fRes.json();
 if (fData.success && fData.reply) {
 visionResult = fData.reply;
 } else {
 // FIX(v11): خطای تحلیل فایل بی‌صدا حذف نمی‌شود
 throw new Error(fData?.error || "تحلیل فایل ناموفق بود.");
 }
 } else {
 const errData = await fRes.json().catch(() => ({}));
 throw new Error(errData?.error || `خطای ${fRes.status}`);
 }
 }

 // Now stream chat (with vision/file result as extra context)
 const chatMessages: Array<{ role: string; content: string }> = [];
 // include prior messages (skip greeting? keep it)
 for (const m of messages) {
 if (m.role === "assistant" &&!m.content) continue;
 chatMessages.push({ role: m.role, content: m.content });
 }
 chatMessages.push({
 role: "user",
 content: visionResult
? `${content || "(فایل پیوست)"}\n\n[نتیجه تحلیل فایل/تصویر به‌عنوان زمینه]:\n${visionResult}`
: content,
 });

 // ─── حالت ایجنت: حلقه ابزار سمت سرور (غیراستریم) ───
 // اگر پیوست تصویر/فایل هست، جریان قدیمی (vision + استریم چت) حفظ می‌شود.
 if (agentMode && !visionResult) {
 const res = await authFetch("/api/ai/agent-chat", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ messages: chatMessages }),
 signal: controller.signal,
 });
 const data = await res.json().catch(() => ({ success: false, error: "پاسخ نامعتبر" }));
 if (!res.ok || !data.success) {
 throw new Error(data.error || `خطای ${res.status}`);
 }
 const actions: AgentExecutedAction[] = Array.isArray(data.executedActions)
 ? (data.executedActions as AgentExecutedAction[])
 : [];
 // FIX(v10-ai): منابع دانش‌نامه از مسیر ایجنت — بج «دانش اختصاصی»
 const agentKnowledge: string[] = Array.isArray(data.knowledgeSources)
 ? (data.knowledgeSources as string[])
 : [];
 updateMessages((prev) =>
 prev.map((m) =>
 m.id === assistantId
 ? {
 ...m,
 content: data.reply || "پاسخی دریافت نشد.",
 pending: false,
 agentActions: actions.length > 0? actions: undefined,
 knowledgeSources: agentKnowledge.length > 0? agentKnowledge: undefined,
 offlineEngine: data.engine === "local",
 // v33-d: اکشن اجرایی + پیشنهادهای پیگیری موتور آفلاین v2
 assistantAction: data.action ?? undefined,
 followUps: Array.isArray(data.followUps) && data.followUps.length > 0? data.followUps: undefined,
 }
 : m
 )
 );
 // هدایت به ماژول اگر ایجنت درخواست کرده باشد
 if (data.navigate?.module) {
 handleAgentGoToModule(
 String(data.navigate.module),
 data.navigate.action? String(data.navigate.action): undefined
 );
 toast({
 title: "هدایت شد",
 description: `انتقال به ${MODULE_FA[String(data.navigate.module)] || data.navigate.module}`,
 });
 }
 // FIX(v11): رویداد به‌روزرسانی ماژول‌ها برای عملیات ثبت‌شده ایجنت
 const MUTATION_TOOLS = new Set([
 "create_invoice",
 "create_expense",
 "add_customer",
 "add_product",
 "record_payment",
 // Task 21-D
 "edit_invoice",
 "reserve_invoice",
 "create_credit_invoice",
 "update_product_price",
 ]);
 for (const a of actions) {
 if (a.success && MUTATION_TOOLS.has(a.tool)) dispatchMutationEvents(a.tool);
 }
 // توست موفقیت فقط برای عملیات «ثبت» (نه query)
 if (actions.length > 0) {
 const okMutations = actions.filter((a) => a.success && MUTATION_TOOLS.has(a.tool)).length;
 const failed = actions.filter((a) => !a.success).length;
 if (okMutations > 0 || failed > 0) {
 toast({
 title: "ایجنت دستور را اجرا کرد",
 description: `${toPersianDigits(okMutations)} عملیات ثبت شد${
 failed > 0? ` · ${toPersianDigits(failed)} ناموفق`: ""
 }`,
 });
 }
 }
 return;
 }

 const res = await authFetch("/api/ai/chat", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ messages: chatMessages, stream: true }),
 signal: controller.signal,
 });

 if (!res.ok) {
 const errData = await res.json().catch(() => ({}));
 throw new Error(errData?.error || `خطای ${res.status}`);
 }
 if (!res.body) throw new Error("پاسخی دریافت نشد");

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer = "";
 let acc = "";

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split("\n\n");
 buffer = lines.pop() || "";
 for (const line of lines) {
 const trimmed = line.trim();
 if (!trimmed.startsWith("data:")) continue;
 const payload = trimmed.slice(5).trim();
 if (payload === "[DONE]") continue;
 try {
 const data = JSON.parse(payload);
 // Handle meta event (detectedAction + knowledgeSources from server)
 if (data.meta) {
 if (data.meta.detectedAction) {
 const da = data.meta.detectedAction;
 if (da.action && da.confidence >= 0.5) {
 // Add to pending actions list (smart action card)
 const newAction: PendingAction = {
 id: genId(),
 type: da.action as ActionType,
 label: getActionLabel(da.action as ActionType),
 icon: getActionIcon(da.action as ActionType),
 data: da.data || {},
 source: "chat",
 confidence: da.confidence,
 status: "pending",
 createdAt: Date.now(),
 };
 setPendingActions((prev) => [...prev, newAction]);
 }
 }
 // v33-d: اکشن اجرایی + پیشنهادهای پیگیری از meta استریم موتور آفلاین v2
 const metaAction = (data.meta as { assistantAction?: AssistantAppActionU }).assistantAction;
 const metaFollowUps = (data.meta as { followUps?: string[] }).followUps;
 if (metaAction || (metaFollowUps && metaFollowUps.length > 0)) {
 updateMessages((prev) =>
 prev.map((m) =>
 m.id === assistantId
 ? {
 ...m,
 ...(metaAction ? { assistantAction: metaAction } : {}),
 ...(metaFollowUps && metaFollowUps.length > 0 ? { followUps: metaFollowUps } : {}),
 }
 : m
 )
 );
 }
 // FIX(v10-ai): منابع دانش‌نامه — بج «دانش اختصاصی» روی پاسخ
 const ksources: string[] = Array.isArray(data.meta.knowledgeSources)
? data.meta.knowledgeSources
 : [];
 if (ksources.length > 0) {
 updateMessages((prev) =>
 prev.map((m) =>
 m.id === assistantId
? {...m, knowledgeSources: ksources }
 : m
 )
 );
 }
 continue;
 }
 if (data.delta) {
 acc += data.delta;
 updateMessages((prev) =>
 prev.map((m) =>
 m.id === assistantId
? {...m, content: acc, pending: false, contextLoaded:!!data.contextLoaded }
: m
 )
 );
 }
 } catch {
 // ignore parse errors
 }
 }
 }

 if (!acc) {
 // If we had a vision result but no chat reply, use the vision result directly
 if (visionResult) {
 updateMessages((prev) =>
 prev.map((m) =>
 m.id === assistantId
? {...m, content: visionResult, pending: false }
: m
 )
 );
 } else {
 updateMessages((prev) =>
 prev.map((m) =>
 m.id === assistantId
? {...m, content: "پاسخی دریافت نشد. دوباره تلاش کنید.", pending: false }
: m
 )
 );
 }
 }
 } catch (e) {
 if ((e as Error).name === "AbortError") return;
 const errorMsg = e instanceof Error? e.message: "خطای ناشناخته";
 updateMessages((prev) =>
 prev.map((m) =>
 m.id === assistantId
? {
...m,
 content: ` خطا: ${errorMsg}\n\nلطفاً دوباره تلاش کنید.`,
 pending: false,
 }
: m
 )
 );
 } finally {
 setLoading(false);
 abortRef.current = null;
 }
 },
 [input, attachment, loading, messages, updateMessages, agentMode, handleAgentGoToModule, toast]
 );

 // ---- Stop streaming ----
 const stop = React.useCallback(() => {
 abortRef.current?.abort();
 setLoading(false);
 updateMessages((prev) =>
 prev.map((m) =>
 m.pending? {...m, content: m.content || "(متوقف شد)", pending: false }: m
 )
 );
 }, [updateMessages]);

 // ---- Copy message ----
 const copyMsg = React.useCallback(async (id: string, content: string) => {
 try {
 await navigator.clipboard.writeText(content);
 setCopiedId(id);
 setTimeout(() => setCopiedId(null), 1500);
 } catch {
 /* ignore */
 }
 }, []);

 // ---- Quick action click ----
 const onQuickAction = React.useCallback(
 (actionId: string) => {
 const action = QUICK_ACTIONS.find((a) => a.id === actionId);
 if (!action) return;
 if (action.navigate === "invoices" && action.id === "invoice-sale") {
 // navigate + send prompt
 onNavigate?.("invoices");
 void send(action.prompt);
 } else if (action.navigate === "invoices" && action.id === "invoice-purchase") {
 onNavigate?.("invoices");
 void send(action.prompt);
 } else {
 onNavigate?.(action.navigate);
 void send(action.prompt);
 }
 },
 [onNavigate, send]
 );

 // ---- Action chip click (from AI response) ----
 const onActionChip = React.useCallback(
 (action: DetectedAction) => {
 onNavigate?.(action.navigate);
 toast({ title: "هدایت شد", description: action.label });
 },
 [onNavigate, toast]
 );

 // ---- Render ----
 return (
 <>
 {/* Floating Action Button */}
 <AnimatePresence>
 {!open && (
 <motion.button
 initial={{ scale: 0, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0, opacity: 0 }}
 transition={{ duration: 0.2, ease: "easeOut" }}
 onClick={() => setOpen(true)}
 className="hidden lg:flex fixed bottom-5 left-5 z-40 h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform"
 aria-label="دستیار هوشمند"
 data-tour="ai-assistant"
 >
 <Sparkles className="h-6 w-6" />
 <span className="absolute -top-1 -start-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background">
 AI
 </span>
 <span className="absolute -end-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-background" />
 {/* Pulse ring */}
 <motion.span
 className="absolute inset-0 rounded-full border-2 border-primary"
 animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
 transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
 />
 </motion.button>
 )}
 </AnimatePresence>

 {/* Chat Panel */}
 <AnimatePresence>
 {open && (
 <motion.div
 initial={{ opacity: 0, y: 20, scale: 0.96 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 20, scale: 0.96 }}
 transition={{ duration: 0.22, ease: "easeOut" }}
 dir="rtl"
 className="fixed z-50 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-5 left-3 lg:left-5 flex h-[min(640px,calc(100dvh-8.5rem))] lg:h-[640px] lg:max-h-[calc(100vh-2.5rem)] w-[calc(100vw-1.5rem)] lg:w-[calc(100vw-2.5rem)] sm:w-[460px] flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
 >
 {/* Header */}
 <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-l from-primary/5 via-card to-card px-3.5 py-2.5 backdrop-blur-xl">
 <div className="flex items-center gap-2.5 min-w-0">
 <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
 <Bot className="h-4.5 w-4.5" />
 <span className="absolute -end-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
 </div>
 <div className="min-w-0">
 <div className="flex items-center gap-1.5">
 <p className="font-bold text-sm leading-tight">هوش‌یار حرفه‌ای</p>
 <Badge variant="secondary" className="text-[9px] bg-primary/10 text-primary px-1 py-0 h-4">
 Pro
 </Badge>
 </div>
 <p className="text-[10px] text-muted-foreground flex items-center gap-1 leading-tight flex-wrap">
 <button
 onClick={toggleAgentMode}
 className={`inline-flex items-center gap-0.5 rounded-full px-1.5 h-4 text-[9px] font-medium transition-colors shrink-0 ${
 agentMode
 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
 : "bg-muted text-muted-foreground hover:bg-accent"
 }`}
 title={
 agentMode
 ? "حالت ایجنت روشن است — دستورات مستقیم اجرا می‌شوند (کلیک: خاموش)"
 : "حالت ایجنت خاموش است — کلیک برای روشن کردن اجرای مستقیم دستورات"
 }
 aria-pressed={agentMode}
 >
 <Zap className="h-2.5 w-2.5" />
 {agentMode? "ایجنت فعال": "ایجنت خاموش"}
 </button>
 {contextReady? (
 <>
 <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
 آنلاین · {dashboardData?.kpis? "آگاه از وضعیت شما": "در دسترس"}
 </>
 ): (
 <>
 <Loader2 className="h-2.5 w-2.5 animate-spin" />
 در حال بارگذاری...
 </>
 )}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-1 shrink-0">
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground hover:text-primary"
 onClick={() => setCatalogOpen(true)}
 aria-label="دستیار چه کارهایی می‌تونه بکنه؟"
 title="دستیار چه کارهایی می‌تونه بکنه؟ (کاتالوگ دستورها)"
 >
 <BookOpen className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground hover:text-primary"
 onClick={() => setWorkflowOpen(true)}
 aria-label="گردش کار هوشمند"
 title="گردش کار هوشمند"
 >
 <WorkflowIcon className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground hover:text-primary relative"
 onClick={() => {
 setRagOpen(true);
 if (!ragResult) {
 // preset a default question
 setRagQuestion("بهترین مشتری من چه کسی است و چقدر خرید کرده؟");
 }
 }}
 aria-label="تحلیل داده‌ها"
 title="تحلیل داده‌ها (RAG)"
 >
 <Database className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground hover:text-amber-500 relative"
 onClick={() => void runAnomalyDetection()}
 aria-label="تشخیص ناهنجاری"
 title="تشخیص ناهنجاری"
 >
 <AlertTriangle className="h-4 w-4" />
 {anomalySummary && anomalySummary.total > 0 && (
 <span className="absolute -top-0.5 -end-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-bold text-destructive-foreground">
 {toPersianDigits(anomalySummary.total)}
 </span>
 )}
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground"
 onClick={() => setShowHistory(true)}
 aria-label="تاریخچه چت‌ها"
 >
 <History className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground"
 onClick={clearChat}
 aria-label="چت جدید"
 >
 <Plus className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground"
 onClick={() => setOpen(false)}
 aria-label="بستن"
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 </div>

 {/* Context Bar (shows user's KPIs) */}
 {dashboardData?.kpis && (
 <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50 text-[10px] text-muted-foreground flex items-center gap-2 overflow-x-auto">
 <TrendingUp className="h-3 w-3 text-primary shrink-0" />
 <span className="shrink-0">فروش ماه:</span>
 <span className="font-medium tnum text-foreground shrink-0">
 {toPersianDigits(Math.round(dashboardData.kpis.revenue / 1_000_000).toLocaleString("en-US"))} م.ت
 </span>
 <span className="text-muted-foreground/40">·</span>
 <span className="shrink-0">نقدینگی:</span>
 <span className="font-medium tnum text-foreground shrink-0">
 {toPersianDigits(Math.round(dashboardData.kpis.cash / 1_000_000).toLocaleString("en-US"))} م.ت
 </span>
 <span className="text-muted-foreground/40">·</span>
 <span className="shrink-0">{formatJalaliNow()}</span>
 </div>
 )}

 {/* Messages */}
 <div
 ref={scrollRef}
 role="log"
 aria-live="polite"
 aria-label="تاریخچه گفتگو"
 className="flex-1 overflow-y-auto p-3 space-y-3 bg-background/40"
 style={{ scrollbarGutter: "stable" }}
 >
 {messages.map((msg) => {
 const isUser = msg.role === "user";
 // FIX(v11): پیام خوش‌آمد (نمونه‌ها) هرگز chip اجرایی نمی‌سازد —
 // قبلاً «فاکتور ۲ میلیونی رستوران بهار» از متن خود دستیار chip می‌شد و
 // با یک کلیک سند واقعی ثبت می‌شد
 const actions =
 !isUser && msg.content && msg.id !== "greeting" ? detectActions(msg.content) : [];
 return (
 <div key={msg.id} className={`group flex ${isUser? "justify-start": "justify-end"}`}>
 <div className={`max-w-[92%] relative ${isUser? "": "ms-7"}`}>
 {/* Avatar */}
 <div
 className={`absolute -start-7 top-0 flex h-6 w-6 items-center justify-center rounded-lg shrink-0 ${
 isUser
? "bg-muted text-muted-foreground"
: "bg-primary/10 text-primary"
 }`}
 >
 {isUser? <User className="h-3 w-3" />: <Bot className="h-3 w-3" />}
 </div>

 {/* Attachments preview */}
 {msg.attachments && msg.attachments.length > 0 && (
 <div className="mb-1.5 flex gap-1.5 flex-wrap">
 {msg.attachments.map((att, ai) => (
 <div
 key={ai}
 className="relative rounded-lg border border-border bg-card overflow-hidden max-w-[140px]"
 >
 {att.type === "image" && att.preview? (
 <img
 src={att.preview}
 alt={att.name}
 className="w-full max-h-28 object-cover"
 />
 ): (
 <div className="flex items-center gap-1.5 px-2 py-1.5">
 <FileText className="h-4 w-4 text-primary shrink-0" />
 <div className="min-w-0">
 <p className="text-[10px] truncate">{att.name}</p>
 <p className="text-[9px] text-muted-foreground tnum">
 {toPersianDigits(Math.round(att.size / 1024))} KB
 </p>
 </div>
 </div>
 )}
 </div>
 ))}
 </div>
 )}

 {/* Bubble */}
 <div
 className={`rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
 isUser
? "bg-primary text-primary-foreground rounded-be-sm"
: "bg-card border border-border rounded-bs-sm"
 }`}
 >
 {/* Typing indicator */}
 {msg.pending &&!msg.content? (
 <div className="flex items-center gap-1.5 py-0.5">
 {agentMode? (
 <>
 <motion.span
 animate={{ rotate: 360 }}
 transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
 className="flex shrink-0"
 >
 <Zap className="h-3 w-3" />
 </motion.span>
 <span className="text-[11px] opacity-70">{AGENT_PHASES[agentPhase]}</span>
 </>
 ): (
 <>
 <span className="flex gap-1">
 <motion.span
 className="h-1.5 w-1.5 rounded-full bg-current"
 animate={{ opacity: [0.3, 1, 0.3] }}
 transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
 />
 <motion.span
 className="h-1.5 w-1.5 rounded-full bg-current"
 animate={{ opacity: [0.3, 1, 0.3] }}
 transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
 />
 <motion.span
 className="h-1.5 w-1.5 rounded-full bg-current"
 animate={{ opacity: [0.3, 1, 0.3] }}
 transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
 />
 </span>
 <span className="text-[11px] opacity-70">در حال تفکر...</span>
 </>
 )}
 </div>
 ): isUser? (
 <span className="whitespace-pre-wrap break-words">{msg.content}</span>
 ): (
 <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
 )}
 </div>

 {/* v33-d: دکمهٔ اجرای اکشن موتور آفلاین — فرم فاکتور/کالا/مشتری/ناوبری */}
 {!isUser && msg.assistantAction &&!msg.pending && (
 <div className="mt-1.5">
 <button
 onClick={() => executeAssistantAction(msg.assistantAction!)}
 className="group/act inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-500/60 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 transition-colors"
 title={msg.assistantAction.label || "اجرای دستور"}
 >
 <PlayCircle className="h-3.5 w-3.5" />
 {msg.assistantAction.label || "اجرای دستور"}
 <ChevronLeft className="h-3 w-3 opacity-60 group-hover/act:-translate-x-0.5 transition-transform" />
 </button>
 </div>
 )}

 {/* v33-d: پیشنهادهای پیگیری بعد از پاسخ (۲-۳ دستور مرتبط) */}
 {!isUser && msg.followUps && msg.followUps.length > 0 &&!msg.pending && (
 <div className="mt-1.5 flex flex-wrap gap-1.5">
 {msg.followUps.map((f, fi) => (
 <button
 key={`${msg.id}-fu-${fi}`}
 onClick={() => void send(f)}
 disabled={loading}
 className="text-[10px] rounded-full border border-border bg-card hover:bg-accent hover:border-primary/30 px-2 py-0.5 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
 title="ارسال این پیگیری"
 >
 {f}
 </button>
 ))}
 </div>
 )}

 {/* Agent Action Cards — نتیجه اجرای ابزارهای ایجنت */}
 {!isUser && msg.agentActions && msg.agentActions.length > 0 &&!msg.pending && (
 <div className="mt-1.5 space-y-1.5 w-full">
 <p className="text-[9px] text-muted-foreground flex items-center gap-1">
 <Zap className="h-2.5 w-2.5 text-emerald-500" />
 عملیات اجرا شده توسط ایجنت:
 </p>
 {msg.agentActions.map((a, ai) => (
 <AgentActionCard
 key={`${msg.id}-agent-act-${ai}`}
 action={a}
 onGoTo={() => handleAgentGoToModule(a.module || "", undefined)}
 />
 ))}
 </div>
 )}

 {/* FIX(v10-ai): بج منابع دانش‌نامه — «این پاسخ با دانش اختصاصی شما داده شد» */}
 {!isUser && msg.knowledgeSources && msg.knowledgeSources.length > 0 &&!msg.pending && (
 <div className="mt-1.5 flex items-start gap-1.5 w-full">
 <Badge variant="outline" className="text-[9px] gap-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
 <BookMarked className="h-2.5 w-2.5" />
 دانش اختصاصی: {msg.knowledgeSources.slice(0, 2).join("، ")}
 {msg.knowledgeSources.length > 2? ` +${toPersianDigits(String(msg.knowledgeSources.length - 2))}`: ""}
 </Badge>
 </div>
 )}

 {/* v32-F: بج موتور آفلاین — «این پاسخ ۱۰۰٪ آفلاین و روی داده واقعی شما ساخته شد» */}
 {!isUser && msg.offlineEngine && !msg.pending && (
 <div className="mt-1.5 flex items-start gap-1.5 w-full">
 <Badge variant="outline" className="text-[9px] gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
 <WifiOff className="h-2.5 w-2.5" />
 موتور آفلاین هوش — بدون اینترنت، روی داده واقعی شما
 </Badge>
 </div>
 )}

 {/* Action chips below AI response */}
 {!isUser && msg.content &&!msg.pending && actions.length > 0 && (
 <div className="mt-1.5 flex gap-1.5 flex-wrap">
 {actions.map((a) => {
 const Icon = a.icon;
 const execKey = `${msg.id}:${a.id}`;
 const execResult = executedActions[execKey];
 const isExecuting = executingActionId === execKey;
 return (
 <div key={a.id} className="flex items-center gap-1">
 <button
 onClick={() => onActionChip(a)}
 className="group/chip inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 px-2.5 py-1 text-[10px] text-primary transition-colors"
 >
 <Icon className="h-3 w-3" />
 {a.label}
 <ChevronLeft className="h-2.5 w-2.5 opacity-60 group-hover/chip:-translate-x-0.5 transition-transform" />
 </button>
 {a.execute &&!execResult && (
 <button
 onClick={() => void executeActionInline(a, msg.id)}
 disabled={isExecuting}
 className="group/exec inline-flex items-center gap-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-500/60 px-2 py-1 text-[9px] text-emerald-600 dark:text-emerald-400 transition-colors disabled:opacity-50"
 title={`اجرا کن: ${a.label}`}
 >
 {isExecuting? (
 <Loader2 className="h-2.5 w-2.5 animate-spin" />
 ): (
 <PlayCircle className="h-2.5 w-2.5" />
 )}
 اجرا کن
 </button>
 )}
 {execResult?.success && (
 <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-1.5 py-0 h-4">
 <CheckCircle2 className="h-2.5 w-2.5 ml-0.5" />
 {execResult.message || "اجراشد"}
 {execResult.url && (
 <a
 href={execResult.url}
 target="_blank"
 rel="noopener noreferrer"
 className="ml-0.5 hover:underline"
 >
 <ArrowRight className="h-2 w-2" />
 </a>
 )}
 </Badge>
 )}
 {execResult &&!execResult.success && (
 <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30 px-1.5 py-0 h-4">
 {execResult.message || "خطا"}
 </Badge>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Action bar (copy + speak) */}
 {!isUser && msg.content &&!msg.pending && (
 <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button
 onClick={() => copyMsg(msg.id, msg.content)}
 className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
 aria-label="کپی"
 >
 {copiedId === msg.id? (
 <Check className="h-3 w-3 text-emerald-500" />
 ): (
 <Copy className="h-3 w-3" />
 )}
 </button>
 <button
 onClick={() => speak(msg.id, msg.content)}
 className={`flex h-5 w-5 items-center justify-center rounded hover:bg-accent ${
 speakingId === msg.id? "text-primary": "text-muted-foreground hover:text-foreground"
 }`}
 aria-label="خواندن"
 >
 {speakingId === msg.id? (
 <Square className="h-3 w-3" />
 ): (
 <Volume2 className="h-3 w-3" />
 )}
 </button>
 </div>
 )}
 </div>
 </div>
 );
 })}

 {/* v33-d: صفحهٔ خوش‌آمد — دستورهای آمادهٔ دسته‌بندی‌شده + دستورالعمل کامل */}
 {messages.length <= 1 &&!loading && (
 <div className="pt-2 space-y-2">
 <div className="flex items-center justify-between gap-2 px-1">
 <p className="text-[10px] text-muted-foreground flex items-center gap-1">
 <Sparkles className="h-3 w-3" />
 دستورهای آماده — کلیک کنید و همین حالا جواب بگیرید:
 </p>
 <button
 onClick={() => setShowFullCommands((v) => !v)}
 className="text-[9px] rounded-full border border-border bg-card hover:bg-accent hover:border-primary/30 px-2 py-0.5 transition-colors text-muted-foreground hover:text-foreground shrink-0"
 aria-expanded={showFullCommands}
 >
 {showFullCommands? "بستن دستورالعمل": "دستورالعمل کامل"}
 </button>
 </div>
 {WELCOME_CATEGORIES.map((cat) => {
 const CatIcon = cat.icon;
 return (
 <div key={cat.id} className="space-y-1">
 <p className="text-[9px] font-medium text-muted-foreground flex items-center gap-1 px-1">
 <CatIcon className="h-2.5 w-2.5 text-primary" />
 {cat.title}
 </p>
 <div className="flex flex-wrap gap-1.5">
 {cat.commands.map((c) => (
 <button
 key={c}
 onClick={() => void send(c)}
 className="text-[11px] rounded-full border border-border bg-card hover:bg-accent hover:border-primary/30 px-2.5 py-1 transition-colors text-muted-foreground hover:text-foreground"
 >
 {c}
 </button>
 ))}
 </div>
 </div>
 );
 })}
 {showFullCommands && (
 <div className="rounded-lg border border-border bg-card p-2.5 space-y-2 max-h-64 overflow-y-auto compact-scroll">
 <p className="text-[10px] font-semibold flex items-center gap-1 sticky top-0">
 <BookOpen className="h-3 w-3 text-primary" />
 دستورالعمل کامل — همهٔ دستورهای پشتیبانی‌شده
 </p>
 {COMMAND_CATALOG.map((g) => {
 const GIcon = g.icon;
 return (
 <div key={g.id} className="space-y-1">
 <p className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
 <GIcon className="h-2.5 w-2.5 text-primary" />
 {g.title}
 </p>
 <div className="space-y-0.5">
 {g.items.map((item) => (
 <div key={item.label} className="text-[10px] leading-relaxed">
 <span className="font-medium">{item.label}:</span>{" "}
 <span className="text-muted-foreground">{item.examples.join(" · ")}</span>
 </div>
 ))}
 </div>
 </div>
 );
 })}
 <button
 onClick={() => {
 setCatalogOpen(true);
 setShowFullCommands(false);
 }}
 className="text-[10px] rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 text-primary transition-colors"
 >
 مشاهدهٔ کاتالوگ تعاملی (کلیک = اجرا)
 </button>
 </div>
 )}
 </div>
 )}

 {loading && (
 <div className="flex justify-end">
 <Button
 variant="ghost"
 size="sm"
 className="h-6 text-[10px] text-destructive"
 onClick={stop}
 >
 <Square className="h-3 w-3" />
 توقف
 </Button>
 </div>
 )}
 </div>

 {/* Attachment preview (before send) */}
 {attachment && (
 <div className="px-3 py-1.5 border-t border-border bg-muted/30 flex items-center gap-2">
 {attachment.type === "image" && attachment.preview? (
 <img
 src={attachment.preview}
 alt={attachment.name}
 className="h-10 w-10 rounded object-cover border border-border"
 />
 ): (
 <div className="flex h-10 w-10 items-center justify-center rounded border border-border bg-card">
 <FileText className="h-4 w-4 text-primary" />
 </div>
 )}
 <div className="flex-1 min-w-0">
 <p className="text-[11px] truncate">{attachment.name}</p>
 <p className="text-[9px] text-muted-foreground tnum">
 {toPersianDigits(Math.round(attachment.size / 1024))} KB
 </p>
 </div>
 <button
 onClick={() => setAttachment(null)}
 className="text-muted-foreground hover:text-destructive"
 aria-label="حذف پیوست"
 >
 <XCircle className="h-4 w-4" />
 </button>
 </div>
 )}

 {/* Smart Action Cards (from voice command or AI detection) */}
 <AnimatePresence>
 {pendingActions.length > 0 && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: "auto", opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="border-t border-primary/30 bg-primary/5 overflow-hidden"
 >
 <div className="p-2 space-y-2">
 <div className="flex items-center justify-between">
 <p className="text-[10px] font-medium flex items-center gap-1 text-primary">
 <Zap className="h-3 w-3" />
 اکشن‌های هوشمند ({toPersianDigits(pendingActions.length)})
 </p>
 <button
 onClick={() => setPendingActions([])}
 className="text-[9px] text-muted-foreground hover:text-destructive"
 >
 پاک کردن همه
 </button>
 </div>
 <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
 {pendingActions.map((action) => (
 <SmartActionCard
 key={action.id}
 action={action}
 onConfirm={() => void confirmAction(action.id)}
 onDismiss={() => dismissAction(action.id)}
 onUpdate={(field, value) => updateActionData(action.id, field, value)}
 />
 ))}
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Quick Actions */}
 <div className="border-t border-border px-2 py-1.5 bg-card/50 flex gap-1 overflow-x-auto">
 <button
 onClick={toggleVoiceCommand}
 disabled={loading || isListening}
 className={`group shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] transition-colors disabled:opacity-50 ${
 isListeningCommand
? "border-primary bg-primary text-primary-foreground"
: "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
 }`}
 title="دستور صوتی — ثبت فاکتور، هزینه و... با صدا (بعد از مکث، خودکار ضبط می‌شود)"
 >
 {voiceCommand.recording? (
 <motion.span
 animate={{ scale: [1, 1.2, 1] }}
 transition={{ duration: 0.8, repeat: Infinity }}
 >
 <Mic className="h-3 w-3" />
 </motion.span>
 ): voiceCommand.transcribing? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): (
 <Mic className="h-3 w-3" />
 )}
 <span>
 {voiceCommand.recording
? "در حال ضبط..."
: voiceCommand.transcribing
? "در حال تبدیل..."
: "دستور صوتی"}
 </span>
 </button>
 {QUICK_ACTIONS.map((a) => {
 const Icon = a.icon;
 return (
 <button
 key={a.id}
 onClick={() => onQuickAction(a.id)}
 disabled={loading}
 className="group shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-card hover:bg-accent hover:border-primary/30 px-2.5 py-1 text-[10px] transition-colors disabled:opacity-50"
 >
 <Icon className={`h-3 w-3 ${a.color}`} />
 <span className="text-muted-foreground group-hover:text-foreground">{a.label}</span>
 </button>
 );
 })}
 </div>

 {/* Input area */}
 <div className="border-t border-border p-2.5 bg-card">
 {/* Hidden file inputs */}
 <input
 ref={fileImageRef}
 type="file"
 accept="image/*"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) handleImageFile(f);
 e.target.value = "";
 }}
 />
 <input
 ref={fileDocRef}
 type="file"
 accept=".csv,.tsv,.txt,.json,.xml"
 className="hidden"
 onChange={(e) => {
 const f = e.target.files?.[0];
 if (f) handleDocFile(f);
 e.target.value = "";
 }}
 />

 <div className="flex items-end gap-1.5">
 {/* Attachment buttons */}
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 shrink-0 text-muted-foreground"
 onClick={() => fileImageRef.current?.click()}
 disabled={loading}
 aria-label="آپلود تصویر"
 title="آپلود تصویر (فاکتور/رسید)"
 >
 <ImageIcon className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 shrink-0 text-muted-foreground"
 onClick={() => fileDocRef.current?.click()}
 disabled={loading}
 aria-label="آپلود فایل"
 title="آپلود فایل (CSV/Excel)"
 >
 <Paperclip className="h-4 w-4" />
 </Button>
 {/* Voice input — FIX(voice): MediaRecorder + ASR سرور */}
 <Button
 variant="ghost"
 size="icon"
 className={`h-9 w-9 shrink-0 ${isListening? "text-destructive bg-destructive/10": "text-muted-foreground"}`}
 onClick={toggleListening}
 disabled={loading || isListeningCommand}
 aria-label="ورودی صوتی"
 title="ورودی صوتی (فارسی) — بعد از مکث، خودکار ضبط می‌شود"
 >
 {voiceInput.transcribing? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): isListening? (
 <motion.span
 animate={{ scale: [1, 1.2, 1] }}
 transition={{ duration: 0.8, repeat: Infinity }}
 >
 <MicOff className="h-4 w-4" />
 </motion.span>
 ): (
 <Mic className="h-4 w-4" />
 )}
 </Button>

 <Textarea
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter" &&!e.shiftKey) {
 e.preventDefault();
 void send();
 }
 }}
 placeholder={
 isListening
 ? voiceInput.recording
 ? "در حال ضبط... بعد از مکث خودکار متوقف می‌شود"
 : "در حال تبدیل صدا به متن..."
 : agentMode
 ? "دستور بدید تا همین‌جا اجرا کنم..."
 : "سوال خود را بنویسید..."
 }
 aria-label="ورودی چت"
 className="flex-1 min-h-[40px] max-h-[100px] text-[13px] bg-background resize-none"
 disabled={loading || isListening}
 rows={1}
 />

 <Button
 size="icon"
 className="h-9 w-9 shrink-0"
 onClick={() => void send()}
 disabled={loading || (!input.trim() &&!attachment)}
 aria-label="ارسال"
 >
 {loading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Send className="h-4 w-4" />
 )}
 </Button>
 </div>
 {/* پیش‌نمایش متن شنیده‌شده از میکروفون (FIX(voice)) */}
 {(isListening || isListeningCommand || voicePreview) && (
 <div
 className="mt-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] text-primary flex items-center gap-1.5"
 dir="auto"
 >
 {voiceInput.recording || voiceCommand.recording? (
 <>
 <span className="relative flex h-2 w-2 shrink-0">
 <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
 <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
 </span>
 <span className="shrink-0">در حال ضبط... بعد از مکث، خودکار متوقف می‌شود</span>
 </>
 ) : (
 <Loader2 className="h-3 w-3 animate-spin shrink-0" />
 )}
 {voicePreview && (
 <span className="truncate font-medium">{voicePreview}</span>
 )}
 </div>
 )}
 <p className="text-[9px] text-muted-foreground text-center mt-1.5 flex items-center justify-center gap-1">
 <Sparkles className="h-2.5 w-2.5" />
 {agentMode
 ? "هوش‌یار ایجنت · دستور شما را همین‌جا اجرا می‌کنم"
 : "هوش‌یار حرفه‌ای · GLM-4.6 · آگاه از وضعیت مالی شما"}
 </p>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* History Drawer */}
 <AnimatePresence>
 {showHistory && (
 <>
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => setShowHistory(false)}
 className="fixed inset-0 z-[55] bg-background/40 backdrop-blur-sm"
 />
 <motion.div
 initial={{ x: "-100%" }}
 animate={{ x: 0 }}
 exit={{ x: "-100%" }}
 transition={{ type: "tween", duration: 0.25 }}
 dir="rtl"
 className="fixed z-[56] top-3 lg:top-5 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-5 left-3 lg:left-5 w-[300px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col"
 >
 <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
 <div className="flex items-center gap-2">
 <History className="h-4 w-4 text-primary" />
 <p className="font-bold text-sm">تاریخچه چت‌ها</p>
 </div>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => setShowHistory(false)}
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 <div className="p-2 border-b border-border">
 <Button
 size="sm"
 className="w-full"
 onClick={() => {
 startNewConversation();
 }}
 >
 <Plus className="h-4 w-4" />
 گفتگوی جدید
 </Button>
 </div>
 <ScrollArea className="flex-1">
 <div className="p-2 space-y-1.5">
 {conversations.length === 0? (
 <div className="text-center text-[11px] text-muted-foreground py-8">
 <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
 هنوز گفتگویی ثبت نشده
 </div>
 ): (
 conversations.map((conv) => (
 <div
 key={conv.id}
 className={`group rounded-lg border p-2.5 cursor-pointer transition-colors ${
 conv.id === activeConvId
? "border-primary/40 bg-primary/5"
: "border-border hover:bg-accent"
 }`}
 onClick={() => {
 setActiveConvId(conv.id);
 setShowHistory(false);
 }}
 >
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1 min-w-0">
 <p className="text-[11px] font-medium truncate">{conv.title}</p>
 <p className="text-[9px] text-muted-foreground mt-0.5 tnum">
 {toPersianDigits(conv.messages.length)} پیام ·{" "}
 {new Date(conv.updatedAt).toLocaleDateString("fa-IR")}
 </p>
 </div>
 <button
 onClick={(e) => {
 e.stopPropagation();
 deleteConversation(conv.id);
 }}
 className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
 aria-label="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </button>
 </div>
 </div>
 ))
 )}
 </div>
 </ScrollArea>
 </motion.div>
 </>
 )}
 </AnimatePresence>

 {/* Stop speaking on unmount */}
 <button
 ref={(_) => {
 // cleanup function via ref callback
 }}
 onClick={() => {}}
 className="hidden"
 aria-hidden
 />

 {/* Workflow Builder modal */}
 <WorkflowBuilder open={workflowOpen} onClose={() => setWorkflowOpen(false)} />

 {/* Anomaly Detection Modal */}
 <AnimatePresence>
 {anomalyOpen && (
 <>
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => setAnomalyOpen(false)}
 className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
 />
 <motion.div
 initial={{ opacity: 0, y: 30, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 30, scale: 0.95 }}
 transition={{ duration: 0.2 }}
 dir="rtl"
 className="fixed inset-0 z-[61] flex items-center justify-center p-3 pointer-events-none"
 >
 <div className="pointer-events-auto bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85dvh] flex flex-col overflow-hidden">
 <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-l from-amber-500/5 to-card">
 <div className="flex items-center gap-2">
 <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
 <AlertTriangle className="h-4.5 w-4.5" />
 </div>
 <div>
 <h2 className="font-bold text-sm">تشخیص ناهنجاری</h2>
 <p className="text-[10px] text-muted-foreground">
 بررسی خودکار داده‌های مالی
 </p>
 </div>
 </div>
 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnomalyOpen(false)}>
 <X className="h-4 w-4" />
 </Button>
 </div>

 <ScrollArea className="flex-1">
 <div className="p-4 space-y-3">
 {anomalyLoading? (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
 <p className="text-xs text-muted-foreground mt-3">در حال تحلیل داده‌ها...</p>
 </div>
 ): anomalies.length === 0? (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <CheckCircle2 className="h-12 w-12 text-emerald-500" />
 <p className="text-sm font-medium mt-3">ناهنجاری یافت نشد</p>
 <p className="text-[10px] text-muted-foreground mt-1">داده‌های شما سالم به نظر می‌رسد.</p>
 </div>
 ): (
 <>
 {anomalySummary && (
 <div className="grid grid-cols-4 gap-2 mb-2">
 <SeverityChip label="بحرانی" count={anomalySummary.critical} color="bg-red-500" />
 <SeverityChip label="با اهمیت" count={anomalySummary.high} color="bg-orange-500" />
 <SeverityChip label="متوسط" count={anomalySummary.medium} color="bg-yellow-500" />
 <SeverityChip label="کم" count={anomalySummary.low} color="bg-blue-500" />
 </div>
 )}
 {anomalies.map((a, i) => (
 <AnomalyCard key={i} anomaly={a} />
 ))}
 </>
 )}
 </div>
 </ScrollArea>

 <div className="border-t border-border px-4 py-2.5 bg-card flex items-center justify-between">
 <p className="text-[10px] text-muted-foreground">
 {anomalySummary? `${toPersianDigits(anomalySummary.total)} ناهنجاری`: "آماده"}
 </p>
 <div className="flex gap-2">
 {!anomalyLoading && (
 <Button variant="outline" size="sm" onClick={() => void runAnomalyDetection()}>
 اجرای دوباره
 </Button>
 )}
 <Button variant="ghost" size="sm" onClick={() => setAnomalyOpen(false)}>
 بستن
 </Button>
 </div>
 </div>
 </div>
 </motion.div>
 </>
 )}
 </AnimatePresence>

 {/* RAG Analysis Modal (تحلیل داده‌ها) */}
 <AnimatePresence>
 {ragOpen && (
 <>
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => setRagOpen(false)}
 className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
 />
 <motion.div
 initial={{ opacity: 0, y: 30, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 30, scale: 0.95 }}
 transition={{ duration: 0.2 }}
 dir="rtl"
 className="fixed inset-0 z-[61] flex items-center justify-center p-3 pointer-events-none"
 >
 <div className="pointer-events-auto bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85dvh] flex flex-col overflow-hidden">
 <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-l from-primary/5 to-card">
 <div className="flex items-center gap-2">
 <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
 <Database className="h-4.5 w-4.5" />
 </div>
 <div>
 <h2 className="font-bold text-sm">تحلیل داده‌ها (RAG)</h2>
 <p className="text-[10px] text-muted-foreground">
 پرسش از داده‌های واقعی شما
 </p>
 </div>
 </div>
 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRagOpen(false)}>
 <X className="h-4 w-4" />
 </Button>
 </div>

 {/* Question input */}
 <div className="px-4 py-3 border-b border-border bg-card">
 <div className="flex gap-2">
 <input
 type="text"
 value={ragQuestion}
 onChange={(e) => setRagQuestion(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter" &&!ragLoading) {
 void runRagAnalysis();
 }
 }}
 placeholder="سوال خود را بنویسید... مثلاً: بهترین مشتری من کیست؟"
 className="flex-1 text-[12px] bg-background border border-border rounded-md px-2.5 py-1.5 min-w-0 focus:outline-none focus:border-primary"
 disabled={ragLoading}
 />
 <Button
 size="sm"
 onClick={() => void runRagAnalysis()}
 disabled={ragLoading ||!ragQuestion.trim()}
 className="h-8 text-[11px]"
 >
 {ragLoading? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): (
 <Sparkles className="h-3 w-3" />
 )}
 تحلیل کن
 </Button>
 </div>
 <div className="mt-2 flex gap-1 flex-wrap">
 {[
 "بهترین مشتری من چه کسی است؟",
 "چقدر فروش داشتم این ماه؟",
 "چند فاکتور سررسید گذشته دارم؟",
 "بهترین محصولاتم از نظر فروش چیست؟",
 ].map((q) => (
 <button
 key={q}
 onClick={() => {
 setRagQuestion(q);
 void runRagAnalysis(q);
 }}
 disabled={ragLoading}
 className="text-[10px] rounded-full border border-border bg-card hover:bg-accent hover:border-primary/30 px-2 py-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
 >
 {q}
 </button>
 ))}
 </div>
 </div>

 {/* Result */}
 <ScrollArea className="flex-1">
 <div className="p-4 space-y-3">
 {ragLoading? (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <Loader2 className="h-10 w-10 animate-spin text-primary" />
 <p className="text-xs text-muted-foreground mt-3">در حال جستجو و تحلیل داده‌ها...</p>
 </div>
 ):!ragResult? (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <BookOpen className="h-12 w-12 text-muted-foreground" />
 <p className="text-sm font-medium mt-3">سوال خود را بنویسید</p>
 <p className="text-[10px] text-muted-foreground mt-1">
 پاسخ‌ها بر اساس داده‌های واقعی شما از پایگاه داده استخراج می‌شوند.
 </p>
 </div>
 ): (
 <>
 {/* Intent badge */}
 <div className="flex items-center gap-2">
 <Badge variant="secondary" className="text-[9px] bg-primary/10 text-primary px-1.5 py-0 h-4">
 intent: {ragResult.intent}
 </Badge>
 <span className="text-[10px] text-muted-foreground">
 {toPersianDigits(ragResult.sourcesCount)} منبع
 </span>
 {ragResult.usedFallback && (
 <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-500/30 px-1.5 py-0 h-4">
 fallback
 </Badge>
 )}
 </div>

 {/* Reply */}
 <div className="text-[12px] leading-relaxed text-foreground whitespace-pre-wrap">
 {ragResult.reply}
 </div>

 {/* Sources */}
 {ragResult.sources.length > 0 && (
 <div className="border-t border-border pt-2 mt-2">
 <p className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
 <LinkIcon className="h-2.5 w-2.5" />
 منابع استخراج‌شده:
 </p>
 <div className="space-y-1">
 {ragResult.sources.map((src, i) => (
 <div key={i} className="text-[10px] bg-muted/30 rounded px-2 py-1.5">
 <div className="flex items-center gap-1">
 <span className="font-medium text-primary">[{toPersianDigits(i + 1)}]</span>
 <span className="font-medium text-foreground truncate">{src.title}</span>
 {src.url && (
 <a
 href={src.url}
 target="_blank"
 rel="noopener noreferrer"
 className="text-primary hover:underline mr-auto"
 >
 <ArrowRight className="h-2.5 w-2.5" />
 </a>
 )}
 </div>
 <p className="text-muted-foreground mt-0.5">{src.detail}</p>
 </div>
 ))}
 </div>
 </div>
 )}
 </>
 )}
 </div>
 </ScrollArea>

 <div className="border-t border-border px-4 py-2.5 bg-card flex items-center justify-between">
 <p className="text-[10px] text-muted-foreground">
 {ragResult? `${toPersianDigits(ragResult.sourcesCount)} منبع`: "آماده"}
 </p>
 <div className="flex gap-2">
 {!ragLoading && ragResult && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => void runRagAnalysis()}
 >
 تحلیل دوباره
 </Button>
 )}
 <Button variant="ghost" size="sm" onClick={() => setRagOpen(false)}>
 بستن
 </Button>
 </div>
 </div>
 </div>
 </motion.div>
 </>
 )}
 </AnimatePresence>
 {/* v33-d: کاتالوگ دستورات — «دستیار چه کارهایی می‌تونه بکنه؟» (همیشه در دسترس) */}
 <AnimatePresence>
 {catalogOpen && (
 <>
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => setCatalogOpen(false)}
 className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
 />
 <motion.div
 initial={{ opacity: 0, y: 30, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 30, scale: 0.95 }}
 transition={{ duration: 0.2 }}
 dir="rtl"
 className="fixed inset-0 z-[61] flex items-center justify-center p-3 pointer-events-none"
 >
 <div className="pointer-events-auto bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85dvh] flex flex-col overflow-hidden">
 <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-l from-primary/5 to-card">
 <div className="flex items-center gap-2">
 <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
 <BookOpen className="h-4.5 w-4.5" />
 </div>
 <div>
 <h2 className="font-bold text-sm">دستیار چه کارهایی می‌تونه بکنه؟</h2>
 <p className="text-[10px] text-muted-foreground">
 روی هر دستور کلیک کنید تا همین حالا اجرا شود — حتی بدون اینترنت
 </p>
 </div>
 </div>
 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCatalogOpen(false)}>
 <X className="h-4 w-4" />
 </Button>
 </div>

 <ScrollArea className="flex-1">
 <div className="p-4 space-y-4">
 {COMMAND_CATALOG.map((g) => {
 const GIcon = g.icon;
 return (
 <div key={g.id} className="space-y-1.5">
 <p className="text-[11px] font-bold flex items-center gap-1.5">
 <GIcon className="h-3.5 w-3.5 text-primary" />
 {g.title}
 </p>
 <div className="space-y-1.5">
 {g.items.map((item) => (
 <div key={item.label} className="rounded-lg border border-border bg-background/50 p-2 space-y-1">
 <p className="text-[10px] font-medium">{item.label}</p>
 <div className="flex flex-wrap gap-1">
 {item.examples.map((ex) => (
 <button
 key={ex}
 onClick={() => {
 setCatalogOpen(false);
 void send(ex);
 }}
 disabled={loading}
 className="text-[10px] rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2 py-0.5 text-primary transition-colors disabled:opacity-50"
 >
 {ex}
 </button>
 ))}
 </div>
 </div>
 ))}
 </div>
 </div>
 );
 })}
 <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[10px] text-muted-foreground leading-relaxed">
 <p className="font-medium text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1">
 <WifiOff className="h-3 w-3" />
 موتور آفلاین هوش
 </p>
 همهٔ دستورهای داده‌ای و دانشی، بدون اینترنت و بدون هیچ پیکربندی روی دادهٔ واقعی شما اجرا می‌شوند؛ دستورهای ثبت با اقلام و مبالغ هم در دفاتر ثبت واقعی می‌گیرند.
 </div>
 </div>
 </ScrollArea>

 <div className="border-t border-border px-4 py-2.5 bg-card flex items-center justify-between">
 <p className="text-[10px] text-muted-foreground">
 {toPersianDigits(COMMAND_CATALOG.reduce((s, g) => s + g.items.length, 0))} دستور در {toPersianDigits(COMMAND_CATALOG.length)} گروه
 </p>
 <Button variant="ghost" size="sm" onClick={() => setCatalogOpen(false)}>
 بستن
 </Button>
 </div>
 </div>
 </motion.div>
 </>
 )}
 </AnimatePresence>
 </>
 );
}

// ============ Smart Action Card (sub-component) ============
function SmartActionCard({
 action,
 onConfirm,
 onDismiss,
 onUpdate,
}: {
 action: PendingAction;
 onConfirm: () => void;
 onDismiss: () => void;
 onUpdate: (field: string, value: unknown) => void;
}) {
 const Icon = action.icon;
 const isExecuting = action.status === "executing";
 const isSuccess = action.status === "success";
 const isError = action.status === "error";

 return (
 <motion.div
 initial={{ opacity: 0, x: -20 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: 20 }}
 className={`rounded-lg border p-2 bg-card ${
 isSuccess? "border-emerald-500/40 bg-emerald-500/5":
 isError? "border-destructive/40 bg-destructive/5":
 "border-border"
 }`}
 >
 <div className="flex items-start gap-2">
 <div className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
 isSuccess? "bg-emerald-500 text-white":
 isError? "bg-destructive text-white":
 "bg-primary/10 text-primary"
 }`}>
 {isExecuting? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): isSuccess? (
 <CheckCircle2 className="h-3.5 w-3.5" />
 ): (
 <Icon className="h-3.5 w-3.5" />
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-1">
 <p className="text-[11px] font-medium truncate">{action.label}</p>
 <button
 onClick={onDismiss}
 className="text-muted-foreground hover:text-destructive shrink-0"
 aria-label="حذف"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 <p className="text-[9px] text-muted-foreground mt-0.5">
 {action.source === "voice"? "از دستور صوتی": action.source === "chat"? "از هوش مصنوعی": "دستی"}
 {action.confidence > 0 && ` · اطمینان ${toPersianDigits(Math.round(action.confidence * 100))}٪`}
 </p>

 {/* Data fields (editable when pending) */}
 {action.status === "pending" && (
 <div className="mt-1.5 space-y-1">
 {Object.entries(action.data).slice(0, 4).map(([key, value]) => (
 <div key={key} className="flex items-center gap-1">
 <span className="text-[9px] text-muted-foreground shrink-0 w-16 truncate">{key}:</span>
 <input
 type="text"
 value={typeof value === "object"? JSON.stringify(value): String(value?? "")}
 onChange={(e) => onUpdate(key, e.target.value)}
 className="flex-1 text-[10px] bg-background border border-border rounded px-1.5 py-0.5 min-w-0"
 />
 </div>
 ))}
 </div>
 )}

 {/* Success result */}
 {isSuccess && action.result && (
 <div className="mt-1.5 text-[10px] text-emerald-700 bg-emerald-500/10 rounded px-1.5 py-1">
 {action.result.number!= null && (
 <span className="block">شماره: <span dir="ltr">{String(action.result.number)}</span></span>
 )}
 {action.result.url!= null && (
 <a href={String(action.result.url)} target="_blank" rel="noopener noreferrer" className="text-primary underline text-[10px] flex items-center gap-0.5 mt-0.5">
 مشاهده <ArrowRight className="h-2.5 w-2.5" />
 </a>
 )}
 {action.result.message!= null && <span className="block">{String(action.result.message)}</span>}
 </div>
 )}

 {/* Error result */}
 {isError && action.result?.message && (
 <div className="mt-1.5 text-[10px] text-destructive bg-destructive/10 rounded px-1.5 py-1">
 {action.result.message}
 </div>
 )}

 {/* Action buttons */}
 {action.status === "pending" && (
 <div className="flex gap-1 mt-1.5">
 <Button
 size="sm"
 onClick={onConfirm}
 disabled={isExecuting}
 className="h-7 text-[10px] flex-1"
 >
 <CheckCircle2 className="h-3 w-3" />
 تأیید و اجرا
 </Button>
 <Button
 size="sm"
 variant="outline"
 onClick={onDismiss}
 disabled={isExecuting}
 className="h-7 text-[10px]"
 >
 لغو
 </Button>
 </div>
 )}
 </div>
 </div>
 </motion.div>
 );
}

// ============ Agent Action Card (sub-component) ============
// کارت نتیجه ابزار ایجنت — ثبت فاکتور/هزینه/مشتری/کالا/پرداخت
function AgentActionCard({
  action,
  onGoTo,
}: {
  action: AgentExecutedAction;
  onGoTo: () => void;
}) {
  const Icon = AGENT_TOOL_ICONS[action.tool] || Zap;
  const hasModule = Boolean(action.module);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border p-2 flex items-start gap-2 break-words ${
        action.success
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-destructive/40 bg-destructive/5"
      }`}
    >
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${
          action.success
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-destructive/15 text-destructive"
        }`}
      >
        <Icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1">
          <p className="text-[11px] font-medium leading-snug break-words flex-1">{action.label}</p>
          {action.success ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
          )}
        </div>
        {action.summary && (
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug break-words">
            {action.summary}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {hasModule && (
            <button
              onClick={onGoTo}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 px-2 py-0.5 text-[10px] text-primary transition-colors"
            >
              برو به ماژول
              <ArrowRight className="h-2.5 w-2.5" />
            </button>
          )}
          {action.url && (
            <a
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              مشاهده سند
              <ArrowRight className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============ Anomaly card (sub-component) ============
function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
 const sevConfig = {
 critical: { bg: "bg-red-500", text: "text-red-700", border: "border-red-500/40", label: "بحرانی" },
 high: { bg: "bg-orange-500", text: "text-orange-700", border: "border-orange-500/40", label: "با اهمیت" },
 medium: { bg: "bg-yellow-500", text: "text-yellow-700", border: "border-yellow-500/40", label: "متوسط" },
 low: { bg: "bg-blue-500", text: "text-blue-700", border: "border-blue-500/40", label: "کم" },
 };
 const cfg = sevConfig[anomaly.severity];
 return (
 <div className={`rounded-lg border ${cfg.border} p-2.5 bg-card`}>
 <div className="flex items-start gap-2">
 <div className={`h-2 w-2 rounded-full ${cfg.bg} mt-1.5 shrink-0`} />
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-1">
 <p className="text-[12px] font-medium leading-tight">{anomaly.title}</p>
 <Badge variant="outline" className={`text-[9px] ${cfg.text} ${cfg.border} shrink-0`}>
 {cfg.label}
 </Badge>
 </div>
 <p className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap">{anomaly.description}</p>
 {anomaly.amountToman && (
 <p className="text-[10px] tnum mt-1 font-medium">
 {toPersianDigits(anomaly.amountToman.toLocaleString("en-US"))} تومان
 </p>
 )}
 </div>
 </div>
 </div>
 );
}

// ============ Severity chip ============
function SeverityChip({ label, count, color }: { label: string; count: number; color: string }) {
 return (
 <div className="border border-border rounded-lg p-1.5 text-center">
 <div className={`h-1.5 w-1.5 rounded-full ${color} mx-auto mb-1`} />
 <p className={`text-[11px] font-bold tnum ${count > 0? "text-foreground": "text-muted-foreground"}`}>
 {toPersianDigits(count)}
 </p>
 <p className="text-[9px] text-muted-foreground">{label}</p>
 </div>
 );
}

export default AIAssistantPro;
