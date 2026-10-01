"use client";

import * as React from "react";
import {
 FileCheck,
 Send,
 CheckCircle2,
 XCircle,
 Clock,
 RefreshCw,
 Settings,
 Search,
 AlertTriangle,
 Plug,
 Layers,
 Loader2,
 Wifi,
 WifiOff,
 Shield,
 BookOpen,
 FileSearch,
 Building2,
 UserSearch,
 Key,
 Link2,
 Lightbulb,
 Webhook as WebhookIcon,
 Zap,
 BarChart3,
 CalendarDays,
 AlertCircle,
 FlaskConical,
 ListChecks,
 CreditCard,
 Scale,
 Info,
 Upload,
 FileKey,
 BadgeCheck,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatCompactToman, toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { HelpTip } from "@/components/ux/help-tooltip";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogTrigger,
 DialogFooter,
 DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type ModianStatus = "ACCEPTED" | "REJECTED" | "PENDING" | "SENT" | "NOT_ELIGIBLE" | "QUEUED";
type ConnectionMethod = "direct" | "tsp" | "middleware";
type ConnectionStatus = "connected" | "disconnected" | "error";
type ModianEnv = "TEST" | "LIVE";

interface ModianRow {
 uid: string;
 invoiceId: string;
 invoiceNo: string;
 party: string;
 amount: number; // تومان
 date: string;
 status: ModianStatus;
 test: boolean;
}

interface StatusSummary {
 totalEligible: number;
 pending: number;
 queued: number;
 sent: number;
 accepted: number;
 rejected: number;
 testSent: number;
 todayCount: number;
 monthCount: number;
}

interface StatusDashboard {
 connectionStatus: ConnectionStatus;
 lastSyncTime: string | null;
 invoicesSentToday: number;
 invoicesSentMonth: number;
 successRate: number;
 failedCount: number;
 sendsLast7Days: number[];
 env?: ModianEnv;
 summary?: StatusSummary;
}

interface DuplicateCandidate {
 id: string;
 number: string;
 partyName: string | null;
 total: number;
 date: string;
 daysAgo: number;
 modianStatus: string | null;
 modianUid: string | null;
}

const INITIAL_ROWS: ModianRow[] = [];

const STATUS_FA: Record<ModianStatus, string> = {
 ACCEPTED: "تایید شده",
 REJECTED: "رد شده",
 PENDING: "در صف ارسال",
 SENT: "ارسال شده",
 QUEUED: "در صف ارسال",
 NOT_ELIGIBLE: "غیرواجد شرایط",
};

const STATUS_STYLE: Record<ModianStatus, string> = {
 ACCEPTED: "bg-success/10 text-success border-success/20",
 REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
 PENDING: "bg-warning/10 text-warning border-warning/20",
 SENT: "bg-primary/10 text-primary border-primary/20",
 QUEUED: "bg-warning/10 text-warning border-warning/20",
 NOT_ELIGIBLE: "bg-muted text-muted-foreground border-border",
};

const CONNECTION_STATUS_FA: Record<ConnectionStatus, string> = {
 connected: "متصل",
 disconnected: "قطع",
 error: "خطا",
};

const CONNECTION_STATUS_STYLE: Record<ConnectionStatus, string> = {
 connected: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 disconnected: "bg-amber-500/10 text-amber-600 border-amber-500/30",
 error: "bg-destructive/10 text-destructive border-destructive/20",
};

const TEMPLATES = [
 { name: "صادرات", desc: "صورتحساب صادرات با نرخ صفر" },
 { name: "پیمانکار", desc: "صورتحساب پیمانکاری با کسورات" },
 { name: "طلا", desc: "صورتحساب طلا و جواهر" },
 { name: "متفرقه", desc: "صورتحساب عمومی فروش" },
];

const TSP_PROVIDERS = [
 { value: "malitor", label: "مالیتور" },
 { value: "abrestan", label: "ابرستان" },
 { value: "other", label: "دیگر" },
];

const MIDDLEWARE_TYPES = [
 { value: "dotnet", label: "NET." },
 { value: "java", label: "Java" },
 { value: "python", label: "Python" },
 { value: "nodejs", label: "Node.js" },
 { value: "custom", label: "سفارشی" },
];

const BATCH_SCHEDULES = [
 { value: "15min", label: "هر ۱۵ دقیقه" },
 { value: "30min", label: "هر ۳۰ دقیقه" },
 { value: "1h", label: "هر ۱ ساعت" },
 { value: "daily", label: "روزانه" },
];

const WEBHOOK_EVENTS = [
 { value: "invoice.accepted", label: "تایید صورتحساب" },
 { value: "invoice.rejected", label: "رد صورتحساب" },
 { value: "token.expired", label: "انقضای توکن" },
];

const DAYS_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

// وضعیت‌های نهایی فاکتور — همان قواعد lib/modian.ts (تنها منبع حقیقت)
const MODIAN_FINAL_STATUSES = ["SENT", "PARTIAL", "PAID", "OVERDUE"];

interface ReconcileResult {
 matched: number;
 unmatched: number;
 total: number;
}

export function ModianModule() {
 const { toast } = useToast();
 const [rows, setRows] = React.useState<ModianRow[]>(INITIAL_ROWS);
 const [loadingRows, setLoadingRows] = React.useState(true);
 const [sendingAll, setSendingAll] = React.useState(false);
 const [sendProgress, setSendProgress] = React.useState(0);
 const [sendingId, setSendingId] = React.useState<string | null>(null);
 const [reconciling, setReconciling] = React.useState(false);
 const [reconcileResult, setReconcileResult] =
 React.useState<ReconcileResult | null>(null);
 const [search, setSearch] = React.useState("");
 const [activeTab, setActiveTab] = React.useState<string>("dashboard");

 // ===== FIX(v4-مودیان/H5): تب استعلام و اطلاعات مودیان =====
 // قبلاً پیام ارسال به کاربر می‌گفت «نتیجه را از بخش استعلام ببینید» ولی
 // چنین بخشی در UI وجود نداشت؛ inquiry/fiscal-info/taxpayer-info بدون caller بودند.
 const [inquiryLoading, setInquiryLoading] = React.useState(false);
 const [inquiryEntries, setInquiryEntries] = React.useState<
 Array<{
 uid: string;
 invoiceNumber: string | null;
 status: string | null;
 statusFa: string | null;
 localStatus: string | null;
 confirmationReferenceId: string | null;
 errors?: Array<{ code: string | number | undefined; message: string | undefined }>;
 }>
 >([]);
 const [inquirySummary, setInquirySummary] = React.useState<{
 total?: number;
 updated?: number;
 } | null>(null);

 const [fiscalLoading, setFiscalLoading] = React.useState(false);
 const [fiscalInfo, setFiscalInfo] = React.useState<Record<string, unknown> | null>(null);

 const [taxpayerLoading, setTaxpayerLoading] = React.useState(false);
 const [taxpayerCode, setTaxpayerCode] = React.useState("");
 const [taxpayerInfo, setTaxpayerInfo] = React.useState<Record<string, unknown> | null>(null);

 // استعلام نتیجه همهٔ ارسال‌شده‌ها ( تا ۱۰۰ فاکتور اخیر)
 const handleInquiryAll = async () => {
 setInquiryLoading(true);
 try {
 const res = await authFetch("/api/integrations/modian/inquiry", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ all: true }),
 });
 const data = await res.json().catch(() => ({} as Record<string, unknown>));
 if (!res.ok || !data.success) {
 toast({
 title: "استعلام ناموفق",
 description: String(data.error ?? "خطا در استعلام از سامانه مودیان"),
 variant: "destructive",
 });
 return;
 }
 setInquiryEntries((data.entries ?? []) as typeof inquiryEntries);
 setInquirySummary({ total: data.total, updated: data.updated });
 toast({
 title: "استعلام انجام شد",
 description: data.updated
 ? `وضعیت ${toPersianDigits(Number(data.updated))} فاکتور بروز شد.`
 : "وضعیت همهٔ فاکتورها همان بود.",
 });
 } catch {
 toast({ title: "خطای شبکه", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setInquiryLoading(false);
 }
 };

 // اطلاعات حافظه مالیاتی خودِ مودی (از سازمان)
 const handleFetchFiscal = async () => {
 setFiscalLoading(true);
 try {
 const res = await authFetch("/api/integrations/modian/fiscal-info", { cache: "no-store" });
 const data = await res.json().catch(() => ({} as Record<string, unknown>));
 if (!res.ok || !data.success) {
 toast({
 title: "دریافت اطلاعات حافظه ناموفق",
 description: String(data.error ?? "اتصال مودیان پیکربندی نشده یا سازمان پاسخ نداد"),
 variant: "destructive",
 });
 return;
 }
 setFiscalInfo((data.data ?? data) as Record<string, unknown>);
 toast({ title: "اطلاعات حافظه مالیاتی دریافت شد" });
 } catch {
 toast({ title: "خطای شبکه", variant: "destructive" });
 } finally {
 setFiscalLoading(false);
 }
 };

 // استعلام مودی با کد اقتصادی (اعتبارسنجی طرف‌حساب)
 const handleFetchTaxpayer = async () => {
 const code = taxpayerCode.trim();
 if (!/^\d{10,11}$/.test(code)) {
 toast({
 title: "کد اقتصادی نامعتبر",
 description: "کد اقتصادی/شناسه ملی باید ۱۰ یا ۱۱ رقم باشد.",
 variant: "destructive",
 });
 return;
 }
 setTaxpayerLoading(true);
 try {
 const res = await authFetch(
 `/api/integrations/modian/taxpayer-info?economicCode=${encodeURIComponent(code)}`,
 { cache: "no-store" }
 );
 const data = await res.json().catch(() => ({} as Record<string, unknown>));
 if (!res.ok || !data.success) {
 toast({
 title: "استعلام مودی ناموفق",
 description: String(data.error ?? "این کد در مودیان یافت نشد یا سازمان پاسخ نداد"),
 variant: "destructive",
 });
 return;
 }
 setTaxpayerInfo((data.data ?? data) as Record<string, unknown>);
 toast({ title: "اطلاعات مودی دریافت شد" });
 } catch {
 toast({ title: "خطای شبکه", variant: "destructive" });
 } finally {
 setTaxpayerLoading(false);
 }
 };

 // وضعیت اتصال به مودیان
 const [modianConfigured, setModianConfigured] = React.useState<boolean | null>(null);
 const [configLoading, setConfigLoading] = React.useState(false);
 const [configOpen, setConfigOpen] = React.useState(false);

 // محیط ارسال (TEST/LIVE)
 const [modianEnv, setModianEnv] = React.useState<ModianEnv>("LIVE");
 const [modianTestUrl, setModianTestUrl] = React.useState("");

 // دیالوگ هشدار فاکتور مشابه (محافظت مالیات دوبرابر)
 const [dupDialog, setDupDialog] = React.useState<{
 invoiceId: string;
 invoiceNo: string;
 duplicates: DuplicateCandidate[];
 } | null>(null);

 // روش اتصال
 const [connectionMethod, setConnectionMethod] = React.useState<ConnectionMethod>("direct");

 // فرم روش مستقیم — نسخه ۲ رسمی: شناسه حافظه + گواهی + کلید
 const [directForm, setDirectForm] = React.useState({
 username: "",
 password: "",
 apiToken: "",
 serverUrl: "",
 bookletId: "",
 sellerTaxId: "", // کد اقتصادی/شناسه ملی فروشنده — فیلد tins صورتحساب
 // v2 — اتصال رسمی مودیان
 memoryId: "", // شناسه یکتای حافظه مالیاتی (۶ کاراکتر)
 certificatePem: "", // محتوای فایل گواهی (PEM)
 privateKeyPem: "", // محتوای فایل کلید خصوصی (PKCS#8 PEM)
 });

 // وضعیت ذخیره‌شدهٔ گواهی/کلید (از سرور — ماسک‌شده)
 const [storedCert, setStoredCert] = React.useState<{
 hasCertificate: boolean;
 hasPrivateKey: boolean;
 certInfo: { serialNumber?: string; subject?: string; validTo?: string } | null;
 } | null>(null);

 // تست اتصال واقعی مودیان
 const [testingConnection, setTestingConnection] = React.useState(false);
 const [testResult, setTestResult] = React.useState<
 { ok: boolean; message: string } | null
 >(null);

 // فرم شرکت معتمد
 const [tspForm, setTspForm] = React.useState({
 provider: "malitor",
 apiKey: "",
 callbackUrl: "",
 bookletId: "",
 });

 // فرم نرم‌افزار واسط
 const [middlewareForm, setMiddlewareForm] = React.useState({
 type: "dotnet",
 connectionString: "",
 apiEndpoint: "",
 bookletId: "",
 });

 // v2 — OAuth 2.0
 const [oauthForm, setOauthForm] = React.useState({
 clientId: "",
 clientSecret: "",
 redirectUri: "",
 tokenEndpoint: "",
 });

 // v2 — Batch
 const [batchEnabled, setBatchEnabled] = React.useState(false);
 const [batchSize, setBatchSize] = React.useState("50");
 const [batchSchedule, setBatchSchedule] = React.useState("30min");

 // v2 — Webhook
 const [webhookEnabled, setWebhookEnabled] = React.useState(false);
 const [webhookUrl, setWebhookUrl] = React.useState("");
 const [webhookEvents, setWebhookEvents] = React.useState<string[]>([
 "invoice.accepted",
 "invoice.rejected",
 ]);

 // داشبورد وضعیت
 const [statusDashboard, setStatusDashboard] = React.useState<StatusDashboard>({
 connectionStatus: "disconnected",
 lastSyncTime: null,
 invoicesSentToday: 0,
 invoicesSentMonth: 0,
 successRate: 0,
 failedCount: 0,
 sendsLast7Days: [0, 0, 0, 0, 0, 0, 0],
 });

 // الگوی انتخاب‌شده
 const [selectedTemplate, setSelectedTemplate] = React.useState<string | null>(null);

 // بررسی وضعیت اتصال مودیان و داشبورد
 const refreshStatus = React.useCallback(async () => {
 try {
 const [configRes, statusRes] = await Promise.all([
 authFetch("/api/integrations/modian/config", { cache: "no-store" }),
 authFetch("/api/integrations/modian/status", { cache: "no-store" }),
 ]);
 const configData = (await configRes.json().catch(() => ({}))) as {
 success?: boolean;
 config?: {
 hasApiKey?: boolean;
 method?: string;
 env?: ModianEnv;
 testUrl?: string;
 bookletId?: string;
 sellerTaxId?: string;
 direct?: {
 username?: string;
 serverUrl?: string;
 apiToken?: string;
 bookletId?: string;
 memoryId?: string;
 hasCertificate?: boolean;
 hasPrivateKey?: boolean;
 certInfo?: { serialNumber?: string; subject?: string; validTo?: string } | null;
 };
 batch?: { enabled?: boolean; size?: number; schedule?: string } | null;
 };
 };
 setModianConfigured(configData?.success === true && Boolean(configData?.config?.hasApiKey));
 if (configData?.config?.method) {
 setConnectionMethod(configData.config.method as ConnectionMethod);
 }
 if (configData?.config?.env) {
 setModianEnv(configData.config.env);
 }
 if (configData?.config?.testUrl) {
 setModianTestUrl(configData.config.testUrl);
 }
 // v2: وضعیت گواهی/کلید ذخیره‌شده (ماسک‌شده)
 if (configData?.config?.direct) {
 const d = configData.config.direct;
 setStoredCert({
 hasCertificate: Boolean(d.hasCertificate),
 hasPrivateKey: Boolean(d.hasPrivateKey),
 certInfo: d.certInfo ?? null,
 });
 }
 // پیش‌پر کردن فرم روش اتصال از تنظیمات ذخیره‌شده
 setDirectForm((p) => ({
 ...p,
 username: p.username || configData?.config?.direct?.username || "",
 serverUrl: p.serverUrl || configData?.config?.direct?.serverUrl || "",
 apiToken: "",
 // v2: شناسه حافظه — ولی فایل‌های گواهی/کلید هرگز برنمی‌گردند (باید دوباره آپلود شوند)
 memoryId: p.memoryId || configData?.config?.direct?.memoryId || "",
 certificatePem: "",
 privateKeyPem: "",
 }));
 // FIX(bookletId/sellerTaxId): پیش‌پر کردن دفترچه و شناسه ملی از تنظیمات ذخیره‌شده
 if (configData?.config?.bookletId || configData?.config?.sellerTaxId) {
 setDirectForm((p) => ({
 ...p,
 bookletId: p.bookletId || configData.config!.bookletId || "",
 sellerTaxId: p.sellerTaxId || configData.config!.sellerTaxId || "",
 }));
 }

 const statusData = (await statusRes.json().catch(() => ({}))) as {
 success?: boolean;
 data?: Partial<StatusDashboard>;
 };
 if (statusData?.success && statusData.data) {
 setStatusDashboard((prev) => ({ ...prev, ...statusData.data! }));
 if (statusData.data.connectionStatus === "connected") {
 setModianConfigured(true);
 } else if (statusData.data.connectionStatus === "error") {
 setModianConfigured(false);
 }
 }
 } catch {
 setModianConfigured(false);
 }
 }, []);

 React.useEffect(() => {
 void refreshStatus();
 }, [refreshStatus]);

 // ===== v2: خواندن فایل گواهی/کلید (PEM) از input file =====
 const handleCertFile = React.useCallback(
 async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 const text = await file.text().catch(() => "");
 if (!text.includes("BEGIN CERTIFICATE")) {
 toast({
 title: "فایل گواهی نامعتبر",
 description: "فایل باید PEM با عبارت -----BEGIN CERTIFICATE----- باشد (پسوند .pem یا .cer)",
 variant: "destructive",
 });
 e.target.value = "";
 return;
 }
 setDirectForm((p) => ({ ...p, certificatePem: text }));
 toast({ title: "گواهی بارگذاری شد", description: `${file.name} — آماده ذخیره` });
 },
 [toast]
 );

 const handleKeyFile = React.useCallback(
 async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 const text = await file.text().catch(() => "");
 if (!text.includes("BEGIN PRIVATE KEY") && !text.includes("BEGIN RSA PRIVATE KEY")) {
 toast({
 title: "فایل کلید نامعتبر",
 description: "فایل باید PEM با عبارت -----BEGIN PRIVATE KEY----- باشد (فرمت PKCS#8 — پسوند .pem یا .key)",
 variant: "destructive",
 });
 e.target.value = "";
 return;
 }
 setDirectForm((p) => ({ ...p, privateKeyPem: text }));
 toast({ title: "کلید خصوصی بارگذاری شد", description: `${file.name} — آماده ذخیره` });
 },
 [toast]
 );

 // ===== v2: تست اتصال واقعی (nonce + JWS + server-information) =====
 const handleTestConnection = React.useCallback(async () => {
 setTestingConnection(true);
 setTestResult(null);
 try {
 const res = await authFetch("/api/integrations/modian/test-connection", {
 cache: "no-store",
 });
 const data = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 message?: string;
 error?: string;
 failedStepFa?: string;
 env?: ModianEnv;
 };
 if (data.success) {
 setTestResult({
 ok: true,
 message:
 data.message ||
 "اتصال به سامانه مودیان با موفقیت برقرار شد — گواهی و کلید معتبرند",
 });
 toast({
 title: "اتصال موفق",
 description: data.message || "اتصال به مودیان برقرار شد",
 });
 } else {
 setTestResult({
 ok: false,
 message: data.error || "تست اتصال ناموفق بود",
 });
 toast({
 title: "اتصال ناموفق",
 description: data.error || "اتصال ناموفق بود",
 variant: "destructive",
 });
 }
 } catch {
 setTestResult({ ok: false, message: "خطا در تست اتصال — شبکه را بررسی کنید" });
 } finally {
 setTestingConnection(false);
 }
 }, []);

 // FIX: payload قبلی فیلد apiKey می‌فرستاد در حالی که API انتظار
 // direct/tsp/middleware دارد — ذخیره تنظیمات از UI همیشه ۴۰۰ می‌گرفت.
 const handleSaveConfig = async () => {
 setConfigLoading(true);
 try {
 const payload: Record<string, unknown> = {
 method: connectionMethod,
 env: modianEnv,
 testUrl: modianEnv === "TEST" ? modianTestUrl : undefined,
 };

 if (connectionMethod === "direct") {
 payload.direct = {
 username: directForm.username || undefined,
 // v2 رسمی: شناسه حافظه + گواهی + کلید — فقط اگر کاربر وارد/آپلود کرده
 memoryId: directForm.memoryId?.trim() || undefined,
 certificatePem: directForm.certificatePem?.trim() || undefined,
 privateKeyPem: directForm.privateKeyPem?.trim() || undefined,
 apiToken: directForm.apiToken || undefined,
 serverUrl: directForm.serverUrl?.trim() || undefined,
 };
 payload.bookletId = directForm.bookletId || undefined;
 payload.sellerTaxId = directForm.sellerTaxId || undefined;
 } else if (connectionMethod === "tsp") {
 payload.tsp = {
 provider: tspForm.provider,
 apiKey: tspForm.apiKey,
 callbackUrl: tspForm.callbackUrl,
 };
 payload.bookletId = tspForm.bookletId || undefined;
 } else {
 payload.middleware = {
 middlewareType: middlewareForm.type,
 connectionString: middlewareForm.connectionString,
 apiEndpoint: middlewareForm.apiEndpoint,
 };
 payload.bookletId = middlewareForm.bookletId || undefined;
 }

 // افزودن تنظیمات v2
 payload.oauth = oauthForm;
 payload.batch = { enabled: batchEnabled, size: Number(batchSize), schedule: batchSchedule };
 payload.webhook = { enabled: webhookEnabled, url: webhookUrl, events: webhookEvents };

 const res = await authFetch("/api/integrations/modian/config", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 });
 const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
 if (data.success) {
 setModianConfigured(true);
 setStatusDashboard((prev) => ({ ...prev, connectionStatus: "connected" }));
 setConfigOpen(false);
 toast({
 title: "تنظیمات ذخیره شد",
 description:
 modianEnv === "TEST"
 ? "ارسال‌ها به محیط آزمایشی می‌روند — بدون اثر حقوقی. اول چند فاکتور تستی بفرستید!"
 : "اتصال به سامانه مودیان پیکربندی شد.",
 });
 void refreshStatus();
 } else {
 toast({
 title: "خطا در ذخیره تنظیمات",
 description: data.error || "لطفاً اطلاعات را بررسی کنید.",
 variant: "destructive",
 });
 }
 } catch (err) {
 console.error("Config save error:", err);
 toast({ title: "خطا در ذخیره تنظیمات", variant: "destructive" });
 } finally {
 setConfigLoading(false);
 }
 };


 const handleDisconnect = async () => {
 try {
 const res = await authFetch("/api/integrations/modian/config", { method: "DELETE" });
 const data = (await res.json().catch(() => ({}))) as { success?: boolean };
 if (data.success) {
 setModianConfigured(false);
 setModianEnv("LIVE");
 setStatusDashboard((prev) => ({ ...prev, connectionStatus: "disconnected" }));
 toast({ title: "اتصال قطع شد", description: "اتصال به سامانه مودیان قطع شد." });
 }
 } catch {
 toast({ title: "خطا در قطع اتصال", variant: "destructive" });
 }
 };

 // بارگذاری فاکتورهای فروش واقعی از API
 const fetchRows = React.useCallback(async () => {
 try {
 setLoadingRows(true);
 const res = await authFetch("/api/accounting/invoices?limit=200&type=SALE", {
 cache: "no-store",
 });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 const mapped: ModianRow[] = json.data
 .filter((inv: Record<string, unknown>) => (inv as { type?: string }).type === "SALE")
 .map((inv: Record<string, unknown>) => {
 const modianStatusStr = (inv as { modianStatus?: string }).modianStatus ?? null;
 const invoiceStatus = String((inv as { status?: string }).status ?? "DRAFT");
 const isFinal = MODIAN_FINAL_STATUSES.includes(invoiceStatus);
 const party = (inv as { party?: { name?: string } | null }).party;
 const d = (inv as { date?: string | Date }).date;
 const dateStr = d
 ? new Date(d).toLocaleDateString("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 })
 : "—";
 const totalRial = Number((inv as { total?: number }).total ?? 0);
 // وضعیت نمایشی: ارسال‌شده‌ها واقعی؛ نهاییِ ارسال‌نشده = در صف؛ غیرنهایی = غیرواجد شرایط
 let status: ModianStatus;
 if (modianStatusStr === "SENT" || modianStatusStr === "ACCEPTED" || modianStatusStr === "REJECTED") {
 status = modianStatusStr as ModianStatus;
 } else if (isFinal) {
 status = "QUEUED";
 } else {
 status = "NOT_ELIGIBLE";
 }
 return {
 uid: String((inv as { modianUid?: string }).modianUid ?? ""),
 invoiceId: String((inv as { id?: string }).id ?? ""),
 invoiceNo: String((inv as { number?: string }).number ?? ""),
 party: party?.name ?? "—",
 amount: Math.round(totalRial / 10),
 date: dateStr,
 status,
 test: Boolean((inv as { modianTest?: boolean }).modianTest),
 } satisfies ModianRow;
 });
 setRows(mapped);
 } else {
 setRows([]);
 }
 } catch {
 setRows([]);
 } finally {
 setLoadingRows(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchRows();
 }, [fetchRows]);

 const pendingInvoices = rows.filter((r) => r.status === "QUEUED" || r.status === "PENDING" || r.status === "REJECTED");

 const filteredRows = React.useMemo(() => {
 if (!search.trim()) return rows;
 const q = search.trim();
 return rows.filter(
 (r) =>
 r.invoiceNo.includes(q) ||
 r.uid.includes(q) ||
 r.party.includes(q)
 );
 }, [rows, search]);

 // آمار پویا — اولویت با آمار واقعی سرور (summary از status API)، fallback: محاسبه از ردیف‌ها
 const summary = statusDashboard.summary;
 const sentCount = summary?.sent ?? rows.filter((r) => r.status === "SENT").length;
 const acceptedCount = summary?.accepted ?? rows.filter((r) => r.status === "ACCEPTED").length;
 const rejectedCount = summary?.rejected ?? rows.filter((r) => r.status === "REJECTED").length;
 const pendingCount = summary?.pending ?? pendingInvoices.length;
 const testSentCount = summary?.testSent ?? rows.filter((r) => r.test).length;

 const STAT_CARDS: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 }[] = [
 {
 icon: Send,
 label: "فاکتورهای ارسال‌شده",
 value: toPersianDigits(sentCount),
 sub: sentCount > 0 ? "ارسال به مودیان" : "هنوز ارسالی وجود ندارد",
 },
 {
 icon: CheckCircle2,
 label: "تایید شده",
 value: toPersianDigits(acceptedCount),
 sub: acceptedCount > 0 ? "تایید سامانه" : "بدون داده",
 },
 {
 icon: XCircle,
 label: "رد شده",
 value: toPersianDigits(rejectedCount),
 sub: rejectedCount > 0 ? "نیازمند بررسی" : "بدون داده",
 },
 {
 icon: Clock,
 label: "در صف ارسال",
 value: toPersianDigits(pendingCount),
 sub: pendingCount > 0 ? "آماده ارسال" : "بدون داده",
 },
 {
 icon: FlaskConical,
 label: "ارسال آزمایشی",
 value: toPersianDigits(testSentCount),
 sub: testSentCount > 0 ? "محیط تست — بدون اثر حقوقی" : "محیط تست فعال نیست",
 },
 ];

 const handleManualSync = async () => {
 toast({ title: "همگام‌سازی دستی", description: "وضعیت و لیست فاکتورها به‌روزرسانی می‌شود..." });
 await Promise.all([refreshStatus(), fetchRows()]);
 toast({ title: "به‌روزرسانی شد", description: "آخرین وضعیت از سرور دریافت شد." });
 };

 const handleSettings = () => {
 setConfigOpen(true);
 };

 // گزارش وضعیت ارسال — واقعی: متن گزارش ساخته و کپی می‌شود
 const handleSendReport = async () => {
 const lines = [
 "گزارش وضعیت سامانه مودیان — هوش",
 `محیط ارسال: ${modianEnv === "TEST" ? "آزمایشی (بدون اثر حقوقی)" : "واقعی"}`,
 `وضعیت اتصال: ${CONNECTION_STATUS_FA[statusDashboard.connectionStatus]}`,
 `ارسال امروز: ${statusDashboard.invoicesSentToday}`,
 `ارسال این ماه: ${statusDashboard.invoicesSentMonth}`,
 `نرخ موفقیت: ${statusDashboard.successRate}٪`,
 `در صف ارسال: ${pendingCount}`,
 `تاییدشده: ${acceptedCount} | ردشده: ${rejectedCount} | آزمایشی: ${testSentCount}`,
 ];
 try {
 await navigator.clipboard.writeText(lines.join("\n"));
 toast({ title: "گزارش وضعیت ارسال", description: "متن گزارش کپی شد — می‌توانید جای دیگری پیست کنید." });
 } catch {
 toast({ title: "گزارش وضعیت ارسال", description: lines.join(" — ") });
 }
 };

 const handleTemplate = (tpl: { name: string; desc: string }) => {
 setSelectedTemplate(tpl.name);
 toast({
 title: `الگوی «${tpl.name}» انتخاب شد`,
 description: `${tpl.desc}. این الگو در فاکتورهای بعدی به‌صورت پیش‌فرض اعمال می‌شود.`,
 });
 };

 // ارسال یک فاکتور — با پشتیبانی از هشدار فاکتور مشابه (409)
 const sendSingleInternal = async (
 row: ModianRow,
 opts?: { confirm?: boolean }
 ): Promise<
 | { kind: "success"; message: string }
 | { kind: "duplicates"; duplicates: DuplicateCandidate[] }
 | { kind: "error"; message: string }
 > => {
 try {
 const res = await authFetch("/api/integrations/modian/send", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 invoiceId: row.invoiceId,
 template: selectedTemplate,
 confirm: opts?.confirm ?? false,
 }),
 });
 const data = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 uid?: string;
 message?: string;
 error?: string;
 errorCode?: string;
 test?: boolean;
 duplicates?: DuplicateCandidate[];
 };

 if (data.success && data.uid) {
 return {
 kind: "success",
 message: data.message || `فاکتور ${row.invoiceNo} ارسال شد`,
 };
 }
 if (data.errorCode === "MODIAN_DUPLICATE_SUSPECTED" && Array.isArray(data.duplicates)) {
 return { kind: "duplicates", duplicates: data.duplicates };
 }
 return {
 kind: "error",
 message: data.error || data.message || `ارسال فاکتور ${row.invoiceNo} ناموفق بود`,
 };
 } catch (err) {
 console.error("Modian sendSingle error:", err);
 return { kind: "error", message: `ارسال فاکتور ${row.invoiceNo} ناموفق بود` };
 }
 };

 // اعمال نتیجه ارسال موفق روی ردیف
 const applySendSuccess = (invoiceId: string, uid: string) => {
 setRows((prev) =>
 prev.map((r) =>
 r.invoiceId === invoiceId
 ? { ...r, status: "SENT" as ModianStatus, uid, test: modianEnv === "TEST" }
 : r
 )
 );
 };

 const sendSingle = async (row: ModianRow): Promise<void> => {
 setSendingId(row.invoiceId);
 try {
 const result = await sendSingleInternal(row);
 if (result.kind === "success") {
 // uid از پیام جداگانه خوانده نمی‌شود؛ رفرش کامل وضعیت
 void refreshStatus();
 void fetchRows();
 toast({ title: "فاکتور ارسال شد", description: result.message });
 } else if (result.kind === "duplicates") {
 setDupDialog({ invoiceId: row.invoiceId, invoiceNo: row.invoiceNo, duplicates: result.duplicates });
 } else {
 // FIX: وضعیت ردیف را محلی «رد شده» نمی‌کنیم — سرور منبع حقیقت است
 // (خطای شبکه = فاکتور در صف می‌ماند؛ رد واقعی فقط توسط خود مودیان)
 void fetchRows();
 toast({ title: "خطا در ارسال فاکتور", description: result.message, variant: "destructive" });
 }
 } finally {
 setSendingId(null);
 }
 };

 // ادامه ارسال پس از تأیید هشدار فاکتور مشابه (محافظت مالیات دوبرابر)
 const handleConfirmDuplicate = async () => {
 if (!dupDialog) return;
 const row: ModianRow | undefined = rows.find((r) => r.invoiceId === dupDialog.invoiceId);
 setDupDialog(null);
 if (!row) return;
 setSendingId(row.invoiceId);
 try {
 const result = await sendSingleInternal(row, { confirm: true });
 if (result.kind === "success") {
 void refreshStatus();
 void fetchRows();
 toast({ title: "فاکتور با تأیید شما ارسال شد", description: result.message });
 } else if (result.kind === "duplicates") {
 toast({
 title: "هنوز فاکتور مشابه شناسایی می‌شود",
 description: "برای اطمینان، ابتدا وضعیت فاکتورها را بررسی کنید.",
 variant: "destructive",
 });
 } else {
 toast({ title: "خطا در ارسال فاکتور", description: result.message, variant: "destructive" });
 }
 } finally {
 setSendingId(null);
 }
 };

 const handleSendAll = async () => {
 if (pendingInvoices.length === 0) {
 toast({ title: "فاکتور معوق وجود ندارد", description: "همه‌ی فاکتورهای واجد شرایط قبلاً ارسال شده‌اند." });
 return;
 }

 setSendingAll(true);
 setSendProgress(0);
 let successCount = 0;
 let failCount = 0;
 let blockedCount = 0;

 for (let i = 0; i < pendingInvoices.length; i++) {
 const row = pendingInvoices[i];
 setSendingId(row.invoiceId);
 const result = await sendSingleInternal(row);
 if (result.kind === "success") {
 successCount++;
 applySendSuccess(row.invoiceId, "");
 } else if (result.kind === "duplicates") {
 // محافظت مالیات دوبرابر: بدون تأیید صریح ارسال نمی‌شود
 // (وضعیت ردیف عوض نمی‌شود — سرور فاکتور را «رد‌شده» نکرده، فقط متوقف شده)
 blockedCount++;
 } else {
 failCount++;
 }
 setSendProgress(Math.round(((i + 1) / pendingInvoices.length) * 100));
 }

 setSendingAll(false);
 setSendingId(null);
 void refreshStatus();
 void fetchRows();

 const parts = [
 `${toPersianDigits(successCount)} ارسال شد`,
 `${toPersianDigits(failCount)} ناموفق`,
 ];
 if (blockedCount > 0) {
 parts.push(`${toPersianDigits(blockedCount)} به‌دلیل فاکتور مشابه متوقف شد (برای جلوگیری از مالیات دوبرابر — ارسال تکی با تأیید انجام شود)`);
 }
 toast({
 title: "ارسال گروهی کامل شد",
 description: parts.join("، ") + ".",
 });
 };

 const handleReconcile = async () => {
 setReconciling(true);
 try {
 const res = await authFetch("/api/integrations/modian/reconcile", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 });
 const data = (await res.json()) as {
 success: boolean;
 matched: number;
 unmatched: number;
 total: number;
 message?: string;
 };

 if (data.success) {
 setReconcileResult({
 matched: data.matched,
 unmatched: data.unmatched,
 total: data.total,
 });
 toast({
 title: "مغایرت‌گیری کامل شد",
 description: `${toPersianDigits(data.matched)} تطبیق، ${toPersianDigits(data.unmatched)} مغایر`,
 });
 } else {
 toast({
 title: "مغایرت‌گیری انجام نشد",
 description: data.message || "اتصال به مودیان پیکربندی نشده است.",
 variant: "destructive",
 });
 }
 } catch (err) {
 console.error(err);
 toast({
 title: "خطا در مغایرت‌گیری",
 description: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setReconciling(false);
 }
 };

 const reconcileMatched = reconcileResult?.matched ?? 0;
 const reconcileUnmatched = reconcileResult?.unmatched ?? 0;
 const reconcileTotal = reconcileResult?.total ?? 0;
 const matchRate =
 reconcileTotal > 0
 ? Math.round((reconcileMatched / reconcileTotal) * 100)
 : 0;

 // داده‌های نمودار ۷ روز اخیر
 const maxSend = Math.max(...statusDashboard.sendsLast7Days, 1);

 const toggleWebhookEvent = (eventValue: string) => {
 setWebhookEvents((prev) =>
 prev.includes(eventValue)
 ? prev.filter((e) => e !== eventValue)
 : [...prev, eventValue]
 );
 };

 const isTestEnv = modianEnv === "TEST";

 return (
 <div className="space-y-5 animate-fade-in-up" dir="rtl">

 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <TabsList className="grid grid-cols-2 sm:grid-cols-3 w-full max-w-2xl mb-4">
 <TabsTrigger value="dashboard" className="text-xs sm:text-sm gap-1.5">
 <Plug className="h-3.5 w-3.5" />
 وضعیت و ارسال
 </TabsTrigger>
 <TabsTrigger value="inquiry" className="text-xs sm:text-sm gap-1.5">
 <FileSearch className="h-3.5 w-3.5" />
 استعلام و اطلاعات مودیان
 </TabsTrigger>
 <TabsTrigger value="guide" className="text-xs sm:text-sm gap-1.5">
 <BookOpen className="h-3.5 w-3.5" />
 راهنمای کامل مودیان
 </TabsTrigger>
 </TabsList>

 {/* ================= تب ۱: وضعیت و ارسال ================= */}
 <TabsContent value="dashboard" className="space-y-5 mt-0">

 {/* ===== بخش ۱: داشبورد وضعیت ===== */}
 <Card className="bg-muted/30 border-border relative overflow-hidden">
 <CardContent className="relative p-4 sm:p-5">
 <div className="flex flex-col gap-4">
 {/* ردیف اول: عنوان و وضعیت اتصال */}
 <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
 <div className="flex items-start sm:items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
 <Plug className="h-6 w-6" />
 </div>
 <div className="min-w-0">
 <h2 className="font-bold text-sm sm:text-base flex flex-wrap items-center gap-1.5">
 اتصال به سامانه مودیان سازمان امور مالیاتی
 {modianConfigured === null ? (
 <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
 <Loader2 className="h-3 w-3 animate-spin" />
 بررسی...
 </Badge>
 ) : (
 <Badge variant="outline" className={`gap-1 ${CONNECTION_STATUS_STYLE[statusDashboard.connectionStatus]}`}>
 {statusDashboard.connectionStatus === "connected" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
 {CONNECTION_STATUS_FA[statusDashboard.connectionStatus]}
 </Badge>
 )}
 {isTestEnv && (
 <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/40">
 <FlaskConical className="h-3 w-3" />
 محیط آزمایشی
 </Badge>
 )}
 </h2>
 <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
 {isTestEnv
 ? "در حال حاضر ارسال‌ها به «محیط آزمایشی» می‌روند و هیچ اثر حقوقی ندارند — برای تمرین و تست پیکربندی."
 : modianConfigured
 ? "اتصال برقرار است. صورتحساب‌های فروش به سازمان امور مالیاتی ارسال می‌شوند."
 : "برای ارسال صورتحساب الکترونیکی، ابتدا اتصال به سامانه مودیان را برقرار کنید."}
 </p>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleManualSync()}>
 <RefreshCw className="h-3.5 w-3.5" />
 همگام‌سازی دستی
 </Button>
 <Dialog open={configOpen} onOpenChange={setConfigOpen}>
 <DialogTrigger asChild>
 <Button variant="outline" size="sm" className="gap-1.5">
 <Settings className="h-3.5 w-3.5" />
 تنظیمات اتصال
 </Button>
 </DialogTrigger>
 <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle>تنظیمات اتصال به سامانه مودیان</DialogTitle>
 <DialogDescription className="sr-only">توضیحات دیالوگ</DialogDescription>
 </DialogHeader>

 {/* ===== روش‌های اتصال ===== */}
 <div className="space-y-5 py-4">
 {/* محیط ارسال — جدید */}
 <div>
 <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
 <FlaskConical className="h-4 w-4 text-primary" />
 محیط ارسال
 <HelpTip name="MODIAN_TEST" size={13} />
 </h3>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label>محیط</Label>
 <Select value={modianEnv} onValueChange={(v) => setModianEnv(v as ModianEnv)}>
 <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
 <SelectContent>
 <SelectItem value="TEST">آزمایشی (تست — بدون اثر حقوقی)</SelectItem>
 <SelectItem value="LIVE">واقعی (سازمان امور مالیاتی)</SelectItem>
 </SelectContent>
 </Select>
 </div>
 {modianEnv === "TEST" && (
 <div className="space-y-1.5">
 <Label htmlFor="modian-test-url">آدرس محیط آزمایشی</Label>
 <Input
 id="modian-test-url"
 placeholder="https://sandbox-api.tax.gov.ir"
 value={modianTestUrl}
 onChange={(e) => setModianTestUrl(e.target.value)}
 />
 <p className="text-[10px] text-muted-foreground leading-relaxed">
 آدرس API محیط آزمایشی (کارپوشه تست یا TSP). در محیط آزمایشی، UID فاکتورها با پیشوند TEST- مشخص می‌شود و هیچ چیزی به سازمان واقعی نمی‌رود.
 </p>
 </div>
 )}
 </div>
 {modianEnv === "TEST" && (
 <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mt-3">
 <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
 <AlertTriangle className="h-3.5 w-3.5 inline-block me-1" />
 پیشنهاد: قبل از فعال‌سازی ارسال واقعی، چند فاکتور را در محیط آزمایشی بفرستید و نتیجه را در جدول زیر ببینید. بعد از اطمینان، محیط را به «واقعی» تغییر دهید.
 </p>
 </div>
 )}
 </div>

 <Separator />

 <div>
 <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
 <Link2 className="h-4 w-4 text-primary" />
 روش اتصال
 </h3>
 <Tabs value={connectionMethod} onValueChange={(v) => setConnectionMethod(v as ConnectionMethod)}>
 <TabsList className="w-full">
 <TabsTrigger value="direct" className="flex-1 text-xs">روش مستقیم</TabsTrigger>
 <TabsTrigger value="tsp" className="flex-1 text-xs">شرکت معتمد</TabsTrigger>
 <TabsTrigger value="middleware" className="flex-1 text-xs">نرم‌افزار واسط</TabsTrigger>
 </TabsList>

 <TabsContent value="direct" className="space-y-3 mt-3">
 <p className="text-xs text-muted-foreground">
 اتصال رسمی نسخه ۲ مودیان — با شناسه حافظه مالیاتی + گواهی دیجیتال کارپوشه (رمزنگاری‌شده ذخیره می‌شود)
 </p>

 {/* راهنمای گرفتن شناسه/گواهی */}
 <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5">
 <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
 <BookOpen className="h-3.5 w-3.5" />
 این اطلاعات را از کجا بگیرم؟
 </div>
 <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pr-4">
 <li>ورود به <span dir="ltr">my.tax.gov.ir</span> (کارپوشه مودیان) → بخش «عضویت» → «شناسه‌های یکتای حافظه مالیاتی»</li>
 <li>در همان بخش CSR/کلید عمومی بارگذاری می‌کنید و <b>شناسه ۶ کاراکتری</b> (مثل A278W6) تحویل می‌گیرید</li>
 <li>گواهی X.509 (فایل <span dir="ltr">.pem/.cer</span>) و کلید خصوصی (<span dir="ltr">.pem/.key</span> فرمت PKCS#8) از مرکز صادرکننده گواهی می‌گیرید</li>
 <li>گواهی و کلید در سرور با AES-256-GCM رمزنگاری می‌شوند و هرگز به مرورگر برنمی‌گردند</li>
 </ul>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="direct-memoryid">شناسه حافظه مالیاتی (۶ کاراکتر)</Label>
 <Input
 id="direct-memoryid"
 placeholder="مثلاً A278W6"
 dir="ltr"
 className="text-center font-mono tracking-widest"
 maxLength={6}
 value={directForm.memoryId}
 onChange={(e) => setDirectForm((p) => ({ ...p, memoryId: e.target.value.toUpperCase().trim() }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="direct-taxid">کد اقتصادی / شناسه ملی فروشنده (tins)</Label>
 <Input
 id="direct-taxid"
 placeholder="مثلاً 10861234567"
 dir="ltr"
 value={directForm.sellerTaxId}
 onChange={(e) => setDirectForm((p) => ({ ...p, sellerTaxId: e.target.value }))}
 />
 <p className="text-[10px] text-muted-foreground">شماره اقتصادی/شناسه ملی شرکت شما — در فیلد tins صورتحساب</p>
 </div>
 </div>

 {/* آپلود گواهی */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="direct-cert">گواهی دیجیتال (X.509 — PEM)</Label>
 <label
 htmlFor="direct-cert"
 className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-3 py-3 text-xs cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
 >
 {directForm.certificatePem ? (
 <>
 <BadgeCheck className="h-4 w-4 text-success" />
 <span className="text-success font-medium">گواهی جدید بارگذاری شد</span>
 </>
 ) : storedCert?.hasCertificate ? (
 <>
 <FileCheck className="h-4 w-4 text-success" />
 <span className="text-success">گواهی ذخیره‌شده موجود است (برای تعویض کلیک کنید)</span>
 </>
 ) : (
 <>
 <Upload className="h-4 w-4" />
 <span>انتخاب فایل گواهی (.pem / .cer)</span>
 </>
 )}
 </label>
 <input
 id="direct-cert"
 type="file"
 accept=".pem,.cer,.crt,.txt"
 className="sr-only"
 onChange={(handleCertFile as unknown) as React.ChangeEventHandler<HTMLInputElement>}
 />
 {storedCert?.certInfo && (
 <div className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2 space-y-0.5">
 <div>سریال: <span dir="ltr" className="font-mono">{storedCert.certInfo.serialNumber}</span></div>
 {storedCert.certInfo.validTo && (
 <div>اعتبار تا: {new Date(storedCert.certInfo.validTo).toLocaleDateString("fa-IR")}</div>
 )}
 </div>
 )}
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="direct-key">کلید خصوصی (PKCS#8 — PEM)</Label>
 <label
 htmlFor="direct-key"
 className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-3 py-3 text-xs cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
 >
 {directForm.privateKeyPem ? (
 <>
 <BadgeCheck className="h-4 w-4 text-success" />
 <span className="text-success font-medium">کلید جدید بارگذاری شد</span>
 </>
 ) : storedCert?.hasPrivateKey ? (
 <>
 <FileKey className="h-4 w-4 text-success" />
 <span className="text-success">کلید ذخیره‌شده موجود است (برای تعویض کلیک کنید)</span>
 </>
 ) : (
 <>
 <Upload className="h-4 w-4" />
 <span>انتخاب فایل کلید (.pem / .key)</span>
 </>
 )}
 </label>
 <input
 id="direct-key"
 type="file"
 accept=".pem,.key,.txt"
 className="sr-only"
 onChange={(handleKeyFile as unknown) as React.ChangeEventHandler<HTMLInputElement>}
 />
 <p className="text-[10px] text-muted-foreground">کلید فقط در سرور رمزنگاری‌شده ذخیره می‌شود و جایی نمایش داده نمی‌شود</p>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="direct-booklet">شناسه دفترچه مالیاتی</Label>
 <Input id="direct-booklet" type="number" placeholder="مثلاً ۱" value={directForm.bookletId} onChange={(e) => setDirectForm((p) => ({ ...p, bookletId: e.target.value }))} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="direct-url">آدرس سرور (اختیاری — پیش‌فرض رسمی)</Label>
 <Input id="direct-url" placeholder="https://tp.tax.gov.ir/requestsmanager/api/v2" dir="ltr" value={directForm.serverUrl} onChange={(e) => setDirectForm((p) => ({ ...p, serverUrl: e.target.value }))} />
 <p className="text-[10px] text-muted-foreground">خالی بگذارید تا آدرس رسمی سازمان استفاده شود</p>
 </div>
 </div>

 {/* تست اتصال */}
 <div className="flex flex-wrap items-center gap-2 pt-1">
 <Button
 type="button"
 variant="outline"
 size="sm"
 disabled={testingConnection}
 onClick={() => void handleTestConnection()}
 >
 {testingConnection ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Plug className="h-4 w-4" />
 )}
 تست اتصال واقعی مودیان
 </Button>
 <span className="text-[10px] text-muted-foreground">
 تست بدون ارسال صورتحساب: nonce → امضای گواهی → احراز هویت سازمان
 </span>
 </div>
 {testResult && (
 <div
 className={`rounded-lg p-2.5 text-xs flex items-start gap-2 ${
 testResult.ok
 ? "bg-success/10 text-success border border-success/20"
 : "bg-destructive/10 text-destructive border border-destructive/20"
 }`}
 >
 {testResult.ok ? (
 <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
 ) : (
 <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
 )}
 <span>{testResult.message}</span>
 </div>
 )}
 </TabsContent>

 <TabsContent value="tsp" className="space-y-3 mt-3">
 <p className="text-xs text-muted-foreground">اتصال از طریق شرکت معتمد مالیاتی (TSP) — مناسب کسب‌وکارهای بزرگ</p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label>شرکت معتمد</Label>
 <Select value={tspForm.provider} onValueChange={(v) => setTspForm((p) => ({ ...p, provider: v }))}>
 <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
 <SelectContent>
 {TSP_PROVIDERS.map((p) => (
 <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="tsp-key">کلید API</Label>
 <Input id="tsp-key" placeholder="کلید API شرکت معتمد" value={tspForm.apiKey} onChange={(e) => setTspForm((p) => ({ ...p, apiKey: e.target.value }))} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="tsp-callback">آدرس Callback</Label>
 <Input id="tsp-callback" placeholder="https://yourapp.com/api/integrations/modian/webhook" value={tspForm.callbackUrl} onChange={(e) => setTspForm((p) => ({ ...p, callbackUrl: e.target.value }))} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="tsp-booklet">شناسه دفترچه مالیاتی</Label>
 <Input id="tsp-booklet" type="number" placeholder="مثلاً ۱" value={tspForm.bookletId} onChange={(e) => setTspForm((p) => ({ ...p, bookletId: e.target.value }))} />
 </div>
 </div>
 </TabsContent>

 <TabsContent value="middleware" className="space-y-3 mt-3">
 <p className="text-xs text-muted-foreground">اتصال از طریق نرم‌افزار واسط — مناسب سازمان‌هایی که دارای سرور واسط هستند</p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label>نوع نرم‌افزار واسط</Label>
 <Select value={middlewareForm.type} onValueChange={(v) => setMiddlewareForm((p) => ({ ...p, type: v }))}>
 <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
 <SelectContent>
 {MIDDLEWARE_TYPES.map((m) => (
 <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="mw-connstr">رشته اتصال</Label>
 <Input id="mw-connstr" placeholder="Server=...;Database=...;User=...;Pass=..." value={middlewareForm.connectionString} onChange={(e) => setMiddlewareForm((p) => ({ ...p, connectionString: e.target.value }))} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="mw-endpoint">نقطه پایانی API</Label>
 <Input id="mw-endpoint" placeholder="https://middleware.local/api/modian" value={middlewareForm.apiEndpoint} onChange={(e) => setMiddlewareForm((p) => ({ ...p, apiEndpoint: e.target.value }))} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="mw-booklet">شناسه دفترچه مالیاتی</Label>
 <Input id="mw-booklet" type="number" placeholder="مثلاً ۱" value={middlewareForm.bookletId} onChange={(e) => setMiddlewareForm((p) => ({ ...p, bookletId: e.target.value }))} />
 </div>
 </div>
 </TabsContent>
 </Tabs>
 </div>

 <Separator />

 {/* ===== ویژگی‌های نسخه ۲ ===== */}
 <div>
 <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
 <Zap className="h-4 w-4 text-primary" />
 ویژگی‌های نسخه ۲ مودیان
 </h3>

 {/* OAuth 2.0 */}
 <div className="space-y-3 mb-4">
 <div className="flex items-center gap-2">
 <Key className="h-4 w-4 text-muted-foreground" />
 <span className="text-sm font-medium">OAuth 2.0</span>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="oauth-client-id">Client ID</Label>
 <Input id="oauth-client-id" placeholder="شناسه کلاینت OAuth" value={oauthForm.clientId} onChange={(e) => setOauthForm((p) => ({ ...p, clientId: e.target.value }))} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="oauth-client-secret">Client Secret</Label>
 <Input id="oauth-client-secret" type="password" placeholder="رمز کلاینت OAuth" value={oauthForm.clientSecret} onChange={(e) => setOauthForm((p) => ({ ...p, clientSecret: e.target.value }))} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="oauth-redirect">Redirect URI</Label>
 <Input id="oauth-redirect" placeholder="https://yourapp.com/api/integrations/modian/oauth" value={oauthForm.redirectUri} onChange={(e) => setOauthForm((p) => ({ ...p, redirectUri: e.target.value }))} />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="oauth-token-endpoint">Token Endpoint</Label>
 <Input id="oauth-token-endpoint" placeholder="https://api.tax.gov.ir/oauth2/token" value={oauthForm.tokenEndpoint} onChange={(e) => setOauthForm((p) => ({ ...p, tokenEndpoint: e.target.value }))} />
 </div>
 </div>
 </div>

 {/* ارسال گروهی */}
 <div className="space-y-3 mb-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Layers className="h-4 w-4 text-muted-foreground" />
 <span className="text-sm font-medium">ارسال گروهی (Batch)</span>
 </div>
 <Switch checked={batchEnabled} onCheckedChange={setBatchEnabled} />
 </div>
 {batchEnabled && (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label>اندازه دسته</Label>
 <Input type="number" min="1" max="200" value={batchSize} onChange={(e) => setBatchSize(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>زمان‌بندی</Label>
 <Select value={batchSchedule} onValueChange={setBatchSchedule}>
 <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
 <SelectContent>
 {BATCH_SCHEDULES.map((s) => (
 <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 )}
 </div>

 {/* Webhook */}
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <WebhookIcon className="h-4 w-4 text-muted-foreground" />
 <span className="text-sm font-medium">Webhook</span>
 </div>
 <Switch checked={webhookEnabled} onCheckedChange={setWebhookEnabled} />
 </div>
 {webhookEnabled && (
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="webhook-url">آدرس Webhook</Label>
 <Input id="webhook-url" placeholder="https://yourapp.com/api/integrations/modian/webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
 </div>
 <div className="space-y-1.5">
 <Label>رویدادها</Label>
 <div className="flex flex-wrap gap-2">
 {WEBHOOK_EVENTS.map((evt) => (
 <Button
 key={evt.value}
 type="button"
 variant={webhookEvents.includes(evt.value) ? "default" : "outline"}
 size="sm"
 className="text-xs h-7"
 onClick={() => toggleWebhookEvent(evt.value)}
 >
 {evt.label}
 </Button>
 ))}
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 <DialogFooter className="flex-row gap-2 justify-end">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 disabled={testingConnection}
 onClick={() => void handleTestConnection()}
 >
 {testingConnection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
 تست اتصال
 </Button>
 {modianConfigured && (
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 text-destructive hover:text-destructive"
 onClick={() => void handleDisconnect()}
 >
 <WifiOff className="h-3.5 w-3.5" />
 قطع اتصال
 </Button>
 )}
 <DialogClose asChild>
 <Button variant="ghost" size="sm">انصراف</Button>
 </DialogClose>
 <Button
 size="sm"
 className="gap-1.5"
 disabled={configLoading}
 onClick={() => void handleSaveConfig()}
 >
 {configLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
 ذخیره
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 {!modianConfigured && modianConfigured !== null && (
 <Button variant="outline" size="sm" className="gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10" onClick={() => setConfigOpen(true)}>
 <Settings className="h-3.5 w-3.5" />
 تنظیمات اتصال
 </Button>
 )}
 </div>
 </div>

 {/* ردیف دوم: آمار داشبورد */}
 <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
 <div className="rounded-lg bg-background/60 border border-border/50 p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[10px] text-muted-foreground">آخرین همگام‌سازی</span>
 </div>
 <p className="text-sm font-bold tnum">
 {statusDashboard.lastSyncTime
 ? new Date(statusDashboard.lastSyncTime).toLocaleDateString("fa-IR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
 : "—"}
 </p>
 </div>
 <div className="rounded-lg bg-background/60 border border-border/50 p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <Send className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[10px] text-muted-foreground">ارسال امروز</span>
 </div>
 <p className="text-sm font-bold tnum">{toPersianDigits(statusDashboard.invoicesSentToday)}</p>
 </div>
 <div className="rounded-lg bg-background/60 border border-border/50 p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[10px] text-muted-foreground">ارسال این ماه</span>
 </div>
 <p className="text-sm font-bold tnum">{toPersianDigits(statusDashboard.invoicesSentMonth)}</p>
 </div>
 <div className="rounded-lg bg-background/60 border border-border/50 p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
 <span className="text-[10px] text-muted-foreground">نرخ موفقیت</span>
 </div>
 <p className="text-sm font-bold tnum">{toPersianDigits(statusDashboard.successRate)}٪</p>
 </div>
 <div className="rounded-lg bg-background/60 border border-border/50 p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <XCircle className="h-3.5 w-3.5 text-destructive" />
 <span className="text-[10px] text-muted-foreground">رد‌شده</span>
 </div>
 <p className="text-sm font-bold tnum text-destructive">{toPersianDigits(statusDashboard.failedCount)}</p>
 </div>
 {/* نمودار کوچک ۷ روز */}
 <div className="rounded-lg bg-background/60 border border-border/50 p-3 col-span-2 sm:col-span-1">
 <div className="flex items-center gap-1.5 mb-1">
 <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
 <span className="text-[10px] text-muted-foreground">۷ روز اخیر</span>
 </div>
 <div className="flex items-end gap-0.5 h-6">
 {statusDashboard.sendsLast7Days.map((count, i) => (
 <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
 <div
 className="w-full rounded-t-sm bg-primary/60 transition-all"
 style={{ height: `${Math.max((count / maxSend) * 100, 4)}%`, minHeight: "2px" }}
 title={`${DAYS_FA[i]}: ${toPersianDigits(count)} ارسال`}
 />
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* کارت‌های آماری */}
 <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
 {STAT_CARDS.map((stat) => {
 const Icon = stat.icon;
 return (
 <Card key={stat.label} className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{stat.label}</p>
 <p className="font-bold text-lg truncate tnum text-primary">
 {stat.value}
 </p>
 <p className="text-[10px] text-muted-foreground">{stat.sub}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>

 {/* نوار ابزار + جدول ارسال‌ها */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
 <CardTitle className="text-base flex flex-wrap items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <FileCheck className="h-4 w-4" />
 </span>
 وضعیت فاکتورهای فروش
 {pendingInvoices.length > 0 && (
 <Badge className="text-[10px] bg-warning/10 text-warning gap-1">
 {toPersianDigits(pendingInvoices.length)} فاکتور معوق
 </Badge>
 )}
 {isTestEnv && (
 <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/10 text-amber-600 border-amber-500/40">
 <FlaskConical className="h-3 w-3" />
 محیط آزمایشی
 </Badge>
 )}
 </CardTitle>
 <div className="flex flex-1 md:flex-initial gap-2 md:max-w-md w-full">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="جستجو UID یا شماره صورتحساب..."
 className="ps-9 h-9"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
 </div>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => {
 void fetchRows();
 toast({ title: "لیست به‌روزرسانی شد" });
 }}
 >
 <RefreshCw className="h-3.5 w-3.5" />
 به‌روزرسانی
 </Button>
 </div>
 </div>

 {sendingAll && (
 <div className="mt-3 space-y-1.5">
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">
 در حال ارسال گروهی فاکتورها...
 </span>
 <span className="font-medium tnum">
 {toPersianDigits(sendProgress)}٪
 </span>
 </div>
 <Progress value={sendProgress} className="h-2" />
 </div>
 )}
 </CardHeader>
 <CardContent>
 {loadingRows ? (
 <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin" />
 در حال بارگذاری فاکتورها...
 </div>
 ) : rows.length === 0 ? (
 <EmptyState
 icon={FileCheck}
 title="هنوز فاکتور فروشی ثبت نشده"
 description="پس از ثبت فاکتور فروش در هوش، وضعیت ارسال آن به سامانه مودیان در این جدول دنبال می‌شود."
 action={
 <Button size="sm" className="gap-1.5" onClick={handleSettings}>
 <Settings className="h-3.5 w-3.5" />
 تنظیمات اتصال
 </Button>
 }
 />
 ) : (
 <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
 <table className="w-full text-sm min-w-[760px] sm:min-w-[860px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-3 py-2.5">شماره صورتحساب</th>
 <th scope="col" className="font-medium px-3 py-2.5">طرف‌حساب</th>
 <th scope="col" className="font-medium px-3 py-2.5">مبلغ</th>
 <th scope="col" className="font-medium px-3 py-2.5">تاریخ فاکتور</th>
 <th scope="col" className="font-medium px-3 py-2.5">وضعیت</th>
 <th scope="col" className="font-medium px-3 py-2.5 hidden md:table-cell">
 <span className="inline-flex items-center gap-1">UID مودیان <HelpTip name="MODIAN_UID" size={11} /></span>
 </th>
 <th scope="col" className="font-medium px-3 py-2.5">عملیات</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {filteredRows.map((row) => {
 const isThisSending =
 sendingId === row.invoiceId || sendingAll;
 const canSend =
 (row.status === "QUEUED" || row.status === "PENDING" || row.status === "REJECTED") &&
 !isThisSending;
 return (
 <tr key={row.invoiceId} className="border-b border-border/40">
 <td className="px-3 py-3 font-mono text-xs">
 {row.invoiceNo}
 </td>
 <td className="px-3 py-3 font-medium">{row.party}</td>
 <td className="px-3 py-3 font-medium">
 {formatCompactToman(row.amount)}
 </td>
 <td className="px-3 py-3 text-muted-foreground text-xs">
 {row.date}
 </td>
 <td className="px-3 py-3">
 <div className="flex flex-wrap items-center gap-1">
 <Badge
 variant="outline"
 className={`text-[10px] ${STATUS_STYLE[row.status]}`}
 >
 {STATUS_FA[row.status]}
 </Badge>
 {row.test && (
 <Badge variant="outline" className="text-[10px] gap-0.5 bg-amber-500/10 text-amber-600 border-amber-500/40">
 <FlaskConical className="h-2.5 w-2.5" />
 تستی
 </Badge>
 )}
 </div>
 </td>
 <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground hidden md:table-cell">
 {row.uid || "—"}
 </td>
 <td className="px-3 py-3">
 <Button
 size="sm"
 variant="ghost"
 className="h-7 text-xs gap-1"
 disabled={!canSend}
 onClick={() => sendSingle(row)}
 >
 {isThisSending && sendingId === row.invoiceId ? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ) : (
 <Send className="h-3 w-3" />
 )}
 ارسال
 </Button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
 قواعد ارسال: فقط فاکتورهای «فروش» با وضعیت نهایی (ارسال‌شده/تسویه/سررسید گذشته)، طرف‌حساب و مبلغ مثبت به مودیان می‌روند. پیش‌نویس‌ها و فاکتورهای باطل‌شده ارسال نمی‌شوند. ارسال مجدد فاکتور ارسال‌شده به‌دلیل جلوگیری از صورتحساب تکراری مسدود است.
 </p>
 </CardContent>
 </Card>

 {/* مغایرت‌گیری هوشمند + الگوها */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <Card className="lg:col-span-2 card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Layers className="h-4 w-4" />
 </span>
 مغایرت‌گیری هوشمند با سامانه مودیان
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-5">
 <div className="grid grid-cols-3 gap-3">
 <div className="rounded-lg bg-muted/40 p-3 text-center">
 <p className="text-xs text-muted-foreground mb-1">تطبیق‌شده</p>
 <p className="text-xl font-bold text-muted-foreground tnum">
 {toPersianDigits(reconcileMatched)}
 </p>
 </div>
 <div className="rounded-lg bg-muted/40 p-3 text-center">
 <p className="text-xs text-muted-foreground mb-1">مغایر</p>
 <p className="text-xl font-bold text-muted-foreground tnum">
 {toPersianDigits(reconcileUnmatched)}
 </p>
 </div>
 <div className="rounded-lg bg-muted/40 p-3 text-center">
 <p className="text-xs text-muted-foreground mb-1">کل فاکتورها</p>
 <p className="text-xl font-bold text-muted-foreground tnum">
 {toPersianDigits(reconcileTotal)}
 </p>
 </div>
 </div>
 <div>
 <div className="flex justify-between text-xs mb-1.5">
 <span className="text-muted-foreground">نرخ تطبیق</span>
 <span className="font-semibold text-muted-foreground tnum">
 {toPersianDigits(matchRate)}٪
 </span>
 </div>
 <Progress value={matchRate} className="h-2.5" />
 <p className="text-[10px] text-muted-foreground mt-2">
 پس از ارسال اولین فاکتورها، نتایج مغایرت‌گیری اینجا نمایش داده می‌شود.
 </p>
 </div>
 </CardContent>
 </Card>

 {/* الگوهای فروش */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-1">
 الگوهای فروش
 <HelpTip name="MODIAN_PATTERN" size={12} />
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 {TEMPLATES.map((tpl) => (
 <div
 key={tpl.name}
 className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer ${selectedTemplate === tpl.name ? "border-primary bg-primary/5" : ""}`}
 >
 <div className="min-w-0">
 <p className="text-sm font-medium text-primary">{tpl.name}</p>
 <p className="text-[10px] text-muted-foreground">{tpl.desc}</p>
 </div>
 <Button
 variant={selectedTemplate === tpl.name ? "default" : "ghost"}
 size="sm"
 className="h-7 text-xs shrink-0"
 onClick={() => handleTemplate(tpl)}
 >
 {selectedTemplate === tpl.name ? "انتخاب شده" : "انتخاب"}
 </Button>
 </div>
 ))}
 </CardContent>
 </Card>
 </div>

 {/* دکمه‌های عملیاتی */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row gap-2 flex-wrap">
 <Button
 className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
 onClick={handleSendAll}
 disabled={sendingAll || pendingInvoices.length === 0}
 >
 {sendingAll ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Send className="h-4 w-4" />
 )}
 ارسال گروهی فاکتورها
 {pendingInvoices.length > 0 && (
 <Badge
 variant="secondary"
 className="bg-primary-foreground/15 text-primary-foreground me-1"
 >
 {toPersianDigits(pendingInvoices.length)}
 </Badge>
 )}
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={handleReconcile}
 disabled={reconciling}
 >
 {reconciling ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <RefreshCw className="h-4 w-4" />
 )}
 مغایرت‌گیری
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleSettings}>
 <Settings className="h-4 w-4" />
 تنظیمات اتصال
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={() => void handleSendReport()}>
 <FileCheck className="h-4 w-4" />
 گزارش وضعیت ارسال
 </Button>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* ================= تب ۲: راهنمای کامل ================= */}
 <TabsContent value="inquiry" className="space-y-5 mt-0">

 {/* ===== کارت ۱: استعلام نتیجه ارسال ===== */}
 <Card className="bg-muted/30 border-border">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm sm:text-base flex items-center gap-2">
 <FileSearch className="h-4 w-4 text-primary" />
 استعلام نتیجه ارسال صورتحساب‌ها
 <HelpTip name="MODIAN_INQUIRY" size={12} />
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="flex flex-wrap items-center gap-2">
 <Button size="sm" className="gap-1.5" onClick={() => void handleInquiryAll()} disabled={inquiryLoading}>
 {inquiryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
 استعلام همه (۱۰۰ مورد اخیر)
 </Button>
 {inquirySummary?.updated ? (
 <Badge variant="secondary" className="gap-1">
 <CheckCircle2 className="h-3 w-3" />
 {toPersianDigits(inquirySummary.updated)} وضعیت بروز شد
 </Badge>
 ) : null}
 </div>

 {inquiryEntries.length === 0 ? (
 <EmptyState
 title="هنوز استعلامی انجام نشده"
 description="برای دیدن نتیجهٔ ارسال‌ها، دکمهٔ استعلام را بزنید. وضعیت رسمی سازمان (PENDING / IN_PROGRESS / SUCCESS / FAILED) نمایش داده می‌شود."
 />
 ) : (
 <div className="rounded-lg border border-border overflow-hidden max-h-96 overflow-y-auto">
 <table className="w-full text-xs sm:text-sm">
 <thead className="bg-muted/60 sticky top-0">
 <tr>
 <th className="text-right p-2 font-medium">فاکتور</th>
 <th className="text-right p-2 font-medium">وضعیت سازمان</th>
 <th className="text-right p-2 font-medium">شناسه تأیید</th>
 <th className="text-right p-2 font-medium">خطا</th>
 </tr>
 </thead>
 <tbody>
 {inquiryEntries.map((e) => (
 <tr key={e.uid} className="border-t border-border/60">
 <td className="p-2 font-medium">{e.invoiceNumber ?? "—"}</td>
 <td className="p-2">
 <Badge
 variant={
 e.status === "SUCCESS" ? "default" : e.status === "FAILED" ? "destructive" : "secondary"
 }
 >
 {e.statusFa ?? e.status ?? "—"}
 </Badge>
 </td>
 <td className="p-2 text-muted-foreground text-[11px] truncate max-w-[220px]" dir="ltr">
 {e.confirmationReferenceId ?? "—"}
 </td>
 <td className="p-2 text-destructive text-[11px] max-w-[240px]">
 {e.errors && e.errors.length > 0
 ? e.errors.map((er) => `${er.code ?? ""} ${er.message ?? ""}`).join("؛ ").slice(0, 120)
 : "—"}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* ===== کارت ۲: اطلاعات حافظه مالیاتی خودِ مودی ===== */}
 <Card className="bg-muted/30 border-border">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm sm:text-base flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 اطلاعات حافظه مالیاتی شما (رسمی سازمان)
 <HelpTip name="MODIAN_FISCAL_INFO" size={12} />
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <Button size="sm" className="gap-1.5" onClick={() => void handleFetchFiscal()} disabled={fiscalLoading}>
 {fiscalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
 دریافت اطلاعات حافظه
 </Button>
 {fiscalInfo ? (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-border p-3">
 {[
 ["نام تجاری", (fiscalInfo.nameTrade as string) ?? (fiscalInfo.name as string) ?? "—"],
 ["کد اقتصادی", (fiscalInfo.economicCode as string) ?? "—"],
 ["شناسه ملی", (fiscalInfo.nationalId as string) ?? "—"],
 ["وضعیت حافظه", (fiscalInfo.fiscalStatus as string) ?? "—"],
 ["آدرس", (fiscalInfo.address as string) ?? "—"],
 ["شهر", (fiscalInfo.city as string) ?? "—"],
 ].map(([k, v]) => (
 <div key={String(k)} className="flex items-center justify-between gap-2 text-xs">
 <span className="text-muted-foreground">{k}:</span>
 <span className="font-medium truncate">{String(v)}</span>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-xs text-muted-foreground">
 برای «وارد کردن اطلاعات مودیان» — دادهٔ رسمی سازمان بدون تایپ دستی.
 </p>
 )}
 </CardContent>
 </Card>

 {/* ===== کارت ۳: استعلام مودی با کد اقتصادی (اعتبارسنجی طرف‌حساب) ===== */}
 <Card className="bg-muted/30 border-border">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm sm:text-base flex items-center gap-2">
 <UserSearch className="h-4 w-4 text-primary" />
 استعلام مودی با کد اقتصادی
 <HelpTip name="MODIAN_TAXPAYER" size={12} />
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="flex flex-col sm:flex-row gap-2">
 <Input
 dir="ltr"
 inputMode="numeric"
 placeholder="کد اقتصادی یا شناسه ملی (۱۰/۱۱ رقم)"
 value={taxpayerCode}
 onChange={(e) => setTaxpayerCode(e.target.value)}
 className="sm:max-w-xs"
 />
 <Button size="sm" className="gap-1.5" onClick={() => void handleFetchTaxpayer()} disabled={taxpayerLoading}>
 {taxpayerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserSearch className="h-3.5 w-3.5" />}
 استعلام
 </Button>
 </div>
 {taxpayerInfo ? (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-border p-3">
 {[
 ["نام/نام تجاری", (taxpayerInfo.nameTrade as string) ?? (taxpayerInfo.name as string) ?? "—"],
 ["وضعیت", (taxpayerInfo.taxpayerStatus as string) ?? "—"],
 ["نوع", (taxpayerInfo.taxpayerType as string) ?? "—"],
 ["شناسه ملی", (taxpayerInfo.nationalId as string) ?? "—"],
 ["کد پستی", (taxpayerInfo.postalcodeTaxpayer as string) ?? "—"],
 ["آدرس", (taxpayerInfo.addressTaxpayer as string) ?? (taxpayerInfo.address as string) ?? "—"],
 ].map(([k, v]) => (
 <div key={String(k)} className="flex items-center justify-between gap-2 text-xs">
 <span className="text-muted-foreground">{k}:</span>
 <span className="font-medium truncate">{String(v)}</span>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-xs text-muted-foreground">
 نام تجاری، وضعیت و شناسهٔ رسمی مودی را از سازمان بگیرید.
 </p>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="guide" className="space-y-4 mt-0">
 <Card>
 <CardContent className="space-y-6 p-4 sm:p-6">

 {/* مودیان چیست */}
 <section>
 <h3 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2">
 <Shield className="h-4 w-4 text-primary" />
 سامانه مودیان چیست و چه کسانی مشمول‌اند؟
 </h3>
 <div className="space-y-2 text-[13px] sm:text-sm leading-7 text-muted-foreground">
 <p>
 «سامانه مودیان» سامانه‌ی سازمان امور مالیاتی کشور (tax.gov.ir) است که بر اساس ماده ۱۶۹ مکرر قانون مالیات‌های مستقیم، مودیان مالیاتی را ملزم می‌کند صورتحساب‌های الکترونیکی خود را هنگام فروش صادر و از طریق همین سامانه برای سازمان ارسال کنند. فاکتورهایی که از این سامانه عبور نکنند، در رسیدگی‌های مالیاتی مبنای کسر مالیات قرار نمی‌گیرند.
 </p>
 <p>
 <strong className="text-foreground">مشمولان:</strong> به‌صورت مرحله‌ای از سال ۱۴۰۳ اعمال شده — ابتدا اشخاص حقوقی مشمول مالیات بر ارزش افزوده، سپس اشخاص حقیقی دارای گردش بالاتر از سقف تعیین‌شده. کسب‌وکارهای خردِ معاف (مانند مشمولان ماده ۱۰۰ با درآمد زیر سقف قانونی و برخی مشاغل) فعلاً مشمول الزام نیستند؛ سقف‌ها و زمان‌بندی هر مرحله در ابلاغیه‌های سازمان اعلام می‌شود — وضعیت خود را در کارپوشه (my.tax.gov.ir) چک کنید.
 </p>
 <p className="text-xs">
 <AlertTriangle className="me-1 inline h-3.5 w-3.5 align-middle text-warning" aria-hidden="true" />
 قواعد و مهلت‌ها به‌صورت دوره‌ای توسط سازمان دارایی تغییر می‌کنند؛ مبنای نهایی، آخرین ابلاغیه‌ی رسمی و کارپوشه‌ی شماست.
 </p>
 </div>
 </section>

 <Separator />

 {/* چه فاکتورهایی ارسال می‌شوند */}
 <section>
 <h3 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2">
 <ListChecks className="h-4 w-4 text-primary" />
 چه فاکتورهایی به مودیان ارسال می‌شوند؟ (قواعد همین ابزار)
 </h3>
 <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
 <table className="w-full text-xs sm:text-sm min-w-[560px]">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th className="font-medium px-3 py-2 text-start">نوع فاکتور</th>
 <th className="font-medium px-3 py-2 text-start">ارسال به مودیان؟</th>
 <th className="font-medium px-3 py-2 text-start">توضیح</th>
 </tr>
 </thead>
 <tbody>
 {[
 { type: "فروش — وضعیت نهایی (ارسال‌شده / تسویه / سررسید گذشته)", send: "بله", desc: "نوع RECIPT — اصلی‌ترین صورتحساب قابل ارسال" },
 { type: "فروش — پیش‌نویس (DRAFT)", send: "خیر", desc: "تا نهایی شدن ارسال نمی‌شود" },
 { type: "فروش — باطل‌شده (CANCELLED)", send: "خیر", desc: "فاکتور باطل قانوناً صورتحساب نیست" },
 { type: "فروش با مبلغ صفر یا بدون طرف‌حساب", send: "خیر", desc: "مبلغ مثبت و طرف‌حساب الزامی است" },
 { type: "خرید (PURCHASE)", send: "فعلاً خیر", desc: "در پیاده‌سازی کامل به‌صورت «برگشت از خرید» ارسال می‌شود — فاز بعدی" },
 { type: "فاکتور ارسال‌شده (SENT/ACCEPTED)", send: "ارسال مجدد ممنوع", desc: "هوش ارسال مجدد را برای جلوگیری از صورتحساب تکراری مسدود می‌کند" },
 { type: "فاکتور ردشده (REJECTED)", send: "قابل ارسال مجدد", desc: "بعد از اصلاح علت رد، دوباره ارسال کنید" },
 ].map((r) => (
 <tr key={r.type} className="border-b border-border/40">
 <td className="px-3 py-2.5 font-medium">{r.type}</td>
 <td className="px-3 py-2.5 whitespace-nowrap">{r.send}</td>
 <td className="px-3 py-2.5 text-muted-foreground">{r.desc}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
 این قواعد دقیقاً همان منطق <span className="font-mono text-[10px]">lib/modian.ts</span> در سرور است — چیزی که می‌بینید همان چیزی است که اجرا می‌شود.
 </p>
 </section>

 <Separator />

 {/* ارسال تکی/گروهی + محیط تست */}
 <section>
 <h3 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2">
 <Send className="h-4 w-4 text-primary" />
 ارسال تکی و گروهی + محیط آزمایشی (اول تست، بعد واقعی)
 </h3>
 <div className="space-y-2 text-[13px] sm:text-sm leading-7 text-muted-foreground">
 <p>
 <strong className="text-foreground">ارسال تکی:</strong> در جدول «وضعیت فاکتورهای فروش»، دکمه‌ی «ارسال» هر فاکتور واجد شرایط را بزنید. اگر هوش فاکتور مشابهی برای همان فروش شناسایی کند، قبل از ارسال از شما تأیید می‌گیرد (پیشگیری از مالیات دوبرابر).
 </p>
 <p>
 <strong className="text-foreground">ارسال گروهی:</strong> دکمه‌ی «ارسال گروهی فاکتورها» همه‌ی فاکتورهای واجد شرایطِ ارسال‌نشده را یکجا می‌فرستد؛ فاکتورهای با «مشابه مشکوک» متوقف می‌شوند تا تک‌به‌تک با تأیید ارسال شوند.
 </p>
 <p>
 <strong className="text-foreground">محیط آزمایشی:</strong> در «تنظیمات اتصال ← محیط ارسال» حالت را روی «آزمایشی» بگذارید. در این حالت فاکتورها به آدرس محیط تست (کارپوشه آزمایشی یا TSP شما) می‌روند، UID آن‌ها با پیشوند <span className="font-mono text-xs">TEST-</span> مشخص می‌شود و در جدول برچسب «تستی» می‌گیرند — <strong className="text-foreground">هیچ اثر حقوقی ندارند</strong>. بعد از اطمینان از درستی پیکربندی، محیط را به «واقعی» تغییر دهید.
 </p>
 <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
 <Lightbulb className="me-1 inline h-3.5 w-3.5 align-middle text-primary" aria-hidden="true" />
 هوش هیچ‌وقت ارسال واقعی را «شبیه‌سازی» نمی‌کند: در محیط واقعی بدون اعتبارنامه‌ی صحیح، به‌جای موفقیت قلابی خطای واضح می‌گیرید. این تصمیم عمدی است — فکر کردن به ارسالِ‌نشده بهتر از فکر کردن به ارسالِ‌شده است.
 </p>
 </div>
 </section>

 <Separator />

 {/* کارتخوان و مالیات دوبرابر */}
 <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
 <h3 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2 text-amber-600">
 <CreditCard className="h-4 w-4" />
 کارتخوان، فاکتور مودیان و ترسِ «مالیات دوبرابر» — توضیح کامل
 <HelpTip name="MODIAN_DOUBLE_TAX" size={14} />
 </h3>
 <div className="space-y-2 text-[13px] sm:text-sm leading-7 text-amber-900/80 dark:text-amber-100/80">
 <p>
 <strong className="text-foreground dark:text-amber-200">سوال:</strong> «اگر مشتری با کارتخوان کارت بکشد، مالیاتش ثبت می‌شود؛ اگر همزمان از هوش فاکتور مودیان صادر کنم، مالیات دوبرابر نمی‌شود؟»
 </p>
 <p>
 <strong className="text-foreground dark:text-amber-200">پاسخ کوتاه: نه — مالیات دوبرابر نیست.</strong> فاکتور مودیان برای فروشِ کارتخوانی «اعلام همان فروش» است، نه یک فروش جدید.
 </p>
 <p>
 <strong className="text-foreground dark:text-amber-200">مکانیزم واقعی (تطبیق، نه دوبرابر):</strong> در «طرح نظارت یکسان»، گردش کارتخوان‌ها از طریق بانک‌ها/شاپرک به‌صورت خودکار به سازمان امور مالیاتی گزارش می‌شود. سازمان این گردش را با فروش اعلامی شما (جمع صورتحساب‌های مودیان) <strong className="text-foreground dark:text-amber-200">تطبیق</strong> می‌دهد. پس فاکتور مودیان + کارتخوان برای یک فروش = یک اعلام فروش که با گردش پذیرندگی تطبیق می‌خورد — این دقیقاً همان چیزی است که باید اتفاق بیفتد.
 </p>
 <p>
 <strong className="text-foreground dark:text-amber-200">پس خطر واقعی کجاست؟</strong> مالیات دوبرابر (و جریمه صورتحساب تکراری) فقط وقتی رخ می‌دهد که برای <strong className="text-foreground dark:text-amber-200">یک فروش، دو صورتحساب</strong> صادر/ارسال شود؛ مثلاً:
 </p>
 <ul className="list-disc list-inside space-y-1 pr-2">
 <li>هم فاکتور دستی/قبض کاغذی بدهید هم همان فروش را در نرم‌افزار فاکتور بزنید و به مودیان بفرستید؛</li>
 <li>یک فروش را دوبار در نرم‌افزار ثبت کنید (مثلاً یک‌بار برای پرداخت کارتخوانی و یک‌بار جداگانه)؛</li>
 <li>فاکتور ارسال‌شده را دوباره ارسال کنید.</li>
 </ul>
 <p>
 <strong className="text-foreground dark:text-amber-200">هوش چطور جلوگیری می‌کند؟</strong>
 </p>
 <ul className="list-disc list-inside space-y-1 pr-2">
 <li><strong className="text-foreground dark:text-amber-200">هشدار فاکتور مشابه:</strong> قبل از ارسال، اگر در ۳ روز اخیر فاکتوری با همان طرف‌حساب و مبلغ مشابه (±۵٪) وجود داشته باشد، ارسال متوقف و لیست فاکتورهای مشابه نمایش داده می‌شود — فقط با انتخاب آگاهانه‌ی شما («ادامه ارسال») ارسال می‌شود.</li>
 <li><strong className="text-foreground dark:text-amber-200">مسدودی ارسال مجدد:</strong> فاکتور SENT/ACCEPTED دوباره ارسال نمی‌شود.</li>
 <li><strong className="text-foreground dark:text-amber-200">پرداخت هرگز فاکتور نمی‌سازد:</strong> ثبت پرداخت/تراکنش کارتخوانی در هوش فقط «پرداختِ یک فاکتور موجود» را ثبت می‌کند و هرگز خودش فاکتور جدید نمی‌سازد — پس از این مسیر فاکتور تکراری متولد نمی‌شود.</li>
 </ul>
 <p className="text-xs">
 خلاصه: کارت کشیدن مشتری = گردش پذیرندگی؛ فاکتور مودیان = اعلام فروش. این دو با هم تطبیق می‌شوند. دوتایی که خطر دارد «دو فاکتور برای یک فروش» است — و هوش دقیقاً همان را می‌گیرد.
 </p>
 </div>
 </section>

 <Separator />

 {/* چک‌لیست راه‌اندازی */}
 <section>
 <h3 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2">
 <Settings className="h-4 w-4 text-primary" />
 چک‌لیست راه‌اندازی (گام‌به‌گام)
 </h3>
 <ol className="text-[13px] sm:text-sm leading-7 text-muted-foreground space-y-1.5 list-decimal list-inside">
 <li>در <span className="font-mono text-xs">tax.gov.ir</span> ثبت‌نام کنید و وارد <strong className="text-foreground">کارپوشه</strong> (my.tax.gov.ir) شوید.</li>
 <li>در کارپوشه، کلیدهای مالیاتی (نام کاربری/رمز یا کلید اختصاصی) و شناسه دفترچه صورتحساب خود را دریافت کنید.</li>
 <li>در هوش: «تنظیمات اتصال ← محیط ارسال» را روی <strong className="text-foreground">آزمایشی</strong> بگذارید و اعتبارنامه‌ها را وارد کنید؛ ذخیره و «تست اتصال».</li>
 <li>۲-۳ فاکتور واقعی خود را در محیط آزمایشی ارسال کنید؛ UID با پیشوند TEST- و برچسب «تستی» باید در جدول ببینید.</li>
 <li>در صورت موفقیت، محیط را به <strong className="text-foreground">واقعی</strong> تغییر دهید و از آن به بعد فاکتورهای فروش را همان لحظه یا به‌صورت گروهی (مثلاً پایان روز) ارسال کنید.</li>
 <li>هر چند وقت یک‌بار «مغایرت‌گیری» را اجرا کنید تا مطمئن شوید همه‌ی فاکتورهای محلی در کارپوشه تایید شده‌اند.</li>
 <li>مهلت قانونی ارسال را رعایت کنید: صدور هنگام فروش الزامی است و طبق ابلاغ جاری (از ۱۵ آبان ۱۴۰۳) حداکثر مهلت ثبت/ارسال بیشتر فاکتورها <strong className="text-foreground">۱۲ روز</strong> از تاریخ صدور است (با TSP ممکن است متفاوت باشد — آخرین ابلاغ کارپوشه مبناست).</li>
 </ol>
 <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mt-3">
 <p className="text-xs leading-relaxed text-foreground/80">
 <Info className="h-3.5 w-3.5 inline-block me-1 text-primary" />
 <strong>وضعیت اتصال رسمی (شفاف‌بودن با مشتری):</strong> پاکت صورتحساب هوش بر اساس ساختار رسمی نسخه ۲ سامانه مودیان ساخته می‌شود (شناسه ملی فروشنده/خریدار، نوع ۱ و ۲، سریال، ردیف کالا/خدمت و پرداخت‌ها). برای اتصال «رسمی» به api.tax.gov.ir علاوه بر اعتبارنامه‌ها، <strong>کلید اختصاصی کارپوشه</strong> برای امضای دیجیتال درخواست‌ها لازم است که هنگام فعال‌سازی نهایی توسط تیم فنی شما ثبت می‌شود. تا آن زمان، ارسال‌ها در «محیط آزمایشی» کاملاً کار می‌کنند و گردش‌کار (صف، وضعیت، هشدار تکراری، مغایرت‌گیری) عیناً همان تجربه‌ی محیط واقعی است.
 </p>
 </div>
 </section>

 <Separator />

 {/* مقایسه رقبا */}
 <section>
 <h3 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2">
 <Scale className="h-4 w-4 text-primary" />
 مقایسه: هوش و نرم‌افزارهای مشابه در مودیان
 </h3>
 <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
 <table className="w-full text-xs sm:text-sm min-w-[620px]">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th className="font-medium px-3 py-2 text-start">قابلیت</th>
 <th className="font-medium px-3 py-2 text-start">هوش</th>
 <th className="font-medium px-3 py-2 text-start">سپیدار</th>
 <th className="font-medium px-3 py-2 text-start">هلو</th>
 <th className="font-medium px-3 py-2 text-start">پارمیس</th>
 </tr>
 </thead>
 <tbody>
 {[
 { f: "صورتحساب نوع ۲ برای فروش خرده‌فروشی (خریدار عمومی)", hoosh: "دارد (خودکار: خریدار بدون شناسه ملی → نوع ۲ با شناسه ۱۱۱۱۱۱۱۱۱۱۱۱)", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "اعتبارسنجی شماره اقتصادی خریدار قبل از صدور", hoosh: "در نقشه راه", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "ارسال خودکار در لحظه ثبت فاکتور", hoosh: "ارسال تکی/گروهی دستی", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "صف ارسال + تلاش مجدد خودکار (retry)", hoosh: "صف + ارسال مجدد ردشده‌ها", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "محیط آزمایشی (تست قبل از ارسال واقعی)", hoosh: "دارد (TEST با UID جدا)", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "هشدار فاکتور مشابه (پیشگیری مالیات دوبرابر)", hoosh: "دارد (±۵٪ / ۳ روز)", sepidar: "ندارد", hollo: "ندارد", parmis: "ندارد" },
 { f: "مسدودی ارسال مجدد فاکتور ارسال‌شده", hoosh: "دارد", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "پیگیری وضعیت (ارسال/تایید/رد) در نرم‌افزار", hoosh: "دارد + Webhook", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "ابطال صورتحساب ارسال‌شده", hoosh: "در نقشه راه", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "گزارش مغایرت با کارپوشه", hoosh: "دارد", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "اتصال از طریق شرکت معتمد (TSP)", hoosh: "دارد (مالیتور/ابرستان)", sepidar: "دارد", hollo: "دارد", parmis: "دارد" },
 { f: "هزینه برای کاربر خرد", hoosh: "رایگان در همه پلن‌ها", sepidar: "ماژول پولی", hollo: "ابزار وب رایگان؛ ادغام در نرم‌افزار پولی", parmis: "ماژول پولی" },
 ].map((r) => (
 <tr key={r.f} className="border-b border-border/40">
 <td className="px-3 py-2.5 font-medium">{r.f}</td>
 <td className="px-3 py-2.5 text-primary font-medium">{r.hoosh}</td>
 <td className="px-3 py-2.5 text-muted-foreground">{r.sepidar}</td>
 <td className="px-3 py-2.5 text-muted-foreground">{r.hollo}</td>
 <td className="px-3 py-2.5 text-muted-foreground">{r.parmis}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
 مقایسه بر اساس مستندات عمومی و تبلیغاتی محصولات در زمان تهیه است و ممکن است تغییر کرده باشد. صداقت‌محور: جاهایی که هوش کامل نیست، صریح «در نقشه راه» نوشته شده.
 </p>
 </section>

 <Separator />

 {/* الزامات قانونی و جریمه‌ها */}
 <section>
 <h3 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2">
 <AlertTriangle className="h-4 w-4 text-amber-500" />
 الزامات قانونی و جریمه‌ها
 </h3>
 <ul className="text-[13px] sm:text-sm leading-7 text-muted-foreground space-y-1.5 list-disc list-inside">
 <li>صورتحساب الکترونیکی باید <strong className="text-foreground">هنگام فروش</strong> صادر و در مهلت مقرر به سامانه ارسال شود — این مهلت چند بار تغییر کرده (۷ روز ← ۳۰ روز ← و از ۱۵ آبان ۱۴۰۳ برای بیشتر مودیان <strong className="text-foreground">۱۲ روز</strong> از تاریخ صدور؛ ارسال از طریق شرکت معتمد می‌تواند مهلت متفاوتی داشته باشد). مبنای نهایی، آخرین ابلاغیه‌ی کارپوشه است.</li>
 <li>صورتحساب باید اطلاعات کامل طرف‌حساب (شناسه ملی/کد اقتصادی)، نوع کالا/خدمت و مالیات بر ارزش افزوده را داشته باشد.</li>
 <li>عدم صدور صورتحساب الکترونیکی: جریمه‌ی درصدی از مبلغ معامله (طبق ماده ۲۰۷ و ابلاغ‌های مربوطه).</li>
 <li>صدور صورتحساب جعلی/خلاف واقع: جریمه‌های سنگین چندبرابری — دقیقاً همان دلیلی که هوش ارسال تکراری را مسدود می‌کند.</li>
 <li>صورتحساب‌های خارج از سامانه به‌تدریج اعتبار خود را از دست می‌دهند — آخرین مهلت اعلام‌شده را از کارپوشه دنبال کنید.</li>
 </ul>
 </section>

 <Separator />

 {/* سوالات متداول */}
 <section>
 <h3 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2">
 <Info className="h-4 w-4 text-primary" />
 سوالات متداول
 <HelpTip name="MODIAN_FAQ" size={14} />
 </h3>
 <div className="space-y-3">
 {[
 { q: "فاکتورهای تستی چه فرقی با واقعی دارند؟", a: "فاکتورهای ارسالی در محیط آزمایشی با پیشوند TEST- در UID و برچسب «تستی» در جدول مشخص می‌شوند و به سازمان امور مالیاتی واقعی نمی‌روند — صرفاً برای تمرین و اطمینان از پیکربندی‌اند." },
 { q: "اتصال به مودیان چقدر طول می‌کشد؟", a: "با داشتن کلیدهای کارپوشه، حدود ۱۰-۱۵ دقیقه: تنظیم اعتبارنامه، تست در محیط آزمایشی، سپس فعال‌سازی محیط واقعی." },
 { q: "آیا برای اتصال به مودیان هزینه جداگانه دارد؟", a: "خیر، در تمام پلن‌های هوش رایگان است. فقط اگر از شرکت معتمد (TSP) استفاده کنید، هزینه‌ی خدمات آن شرکت جداگانه است." },
 { q: "مهلت ارسال صورتحساب به مودیان چقدر است؟", a: "صدور هنگام فروش الزامی است. مهلت ارسال چند بار تغییر کرده است: ابتدا ۷ روز، سپس ۳۰ روز، و طبق ابلاغ از ۱۵ آبان ۱۴۰۳ حداکثر ۱۲ روز از تاریخ صدور برای بیشتر مودیان (با شرکت معتمد/TSP ممکن است متفاوت باشد). برای اطمینان، آخرین ابلاغ کارپوشه را چک کنید." },
 { q: "اگر مشتری با کارتخوان پرداخت کند و من فاکتور مودیان بزنم، مالیات دوبرابر نمی‌شود؟", a: "خیر. گردش کارتخوان در طرح نظارت یکسان با فروش اعلامی شما تطبیق داده می‌شود — فاکتور مودیان همان اعلام فروش است. مالیات دوبرابر فقط وقتی است که برای یک فروش دو صورتحساب صادر شود؛ هوش با هشدار فاکتور مشابه و مسدودی ارسال مجدد جلوی آن را می‌گیرد." },
 { q: "در صورت قطعی سامانه مودیان چه باید کرد؟", a: "فاکتورها در صف ارسال هوش می‌مانند (وضعیت «در صف ارسال») و هر زمان دوباره دکمه ارسال را بزنید ارسال می‌شوند. هیچ فاکتوری از دست نمی‌رود." },
 ].map((faq, i) => (
 <div key={i} className="rounded-lg border border-border/50 p-3">
 <p className="text-sm font-medium text-foreground mb-1">{faq.q}</p>
 <p className="text-xs leading-relaxed text-muted-foreground">{faq.a}</p>
 </div>
 ))}
 </div>
 </section>
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>

 {/* ===== دیالوگ هشدار فاکتور مشابه (محافظت مالیات دوبرابر) ===== */}
 <Dialog open={dupDialog !== null} onOpenChange={(open) => { if (!open) setDupDialog(null); }}>
 <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-destructive">
 <AlertTriangle className="h-5 w-5" />
 هشدار: فاکتور مشابه شناسایی شد
 </DialogTitle>
 <DialogDescription>
 فاکتور {dupDialog?.invoiceNo} برای طرف‌حسابی است که در ۳ روز اخیر فاکتور مشابه (±۵٪ مبلغ) دارد. اگر این <strong>همان فروش قبلی</strong> است، ارسال آن یعنی صدور دو صورتحساب برای یک فروش = <strong>مالیات دوبرابر</strong>. فقط اگر این یک <strong>فروش جدید و جداگانه</strong> است ادامه دهید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2 py-2">
 {dupDialog?.duplicates.map((dup) => (
 <div key={dup.id} className="rounded-lg border border-border/60 p-3 text-xs space-y-1">
 <div className="flex items-center justify-between gap-2">
 <span className="font-mono font-semibold">{dup.number}</span>
 <span className="text-muted-foreground tnum">{toPersianDigits(dup.daysAgo)} روز پیش</span>
 </div>
 <div className="text-muted-foreground">
 {dup.partyName ?? "—"} — {formatCompactToman(Math.round(dup.total / 10))}
 </div>
 <div className="text-[10px] text-muted-foreground">
 وضعیت مودیان: {dup.modianStatus ?? "ارسال‌نشده"}
 {dup.modianUid ? ` | UID: ${dup.modianUid}` : ""}
 </div>
 </div>
 ))}
 </div>
 <DialogFooter className="flex-row gap-2 justify-end">
 <Button variant="ghost" size="sm" onClick={() => setDupDialog(null)}>
 انصراف
 </Button>
 <Button
 variant="destructive"
 size="sm"
 className="gap-1.5"
 onClick={() => void handleConfirmDuplicate()}
 >
 <Send className="h-3.5 w-3.5" />
 ادامه ارسال (فروش جدید است)
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
