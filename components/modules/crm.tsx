"use client";

import * as React from "react";
import {
 Heart,
 Users,
 Phone,
 Mail,
 Calendar,
 Trophy,
 Star,
 UserPlus,
 Bell,
 MessageSquare,
 BarChart3,
 CheckCircle2,
 Clock,
 Loader2,
 TrendingUp,
 MapPin,
 Briefcase,
 Flame,
 Snowflake,
 Thermometer,
 Activity,
 Target,
 Filter,
 GripVertical,
 Trash2,
 Pencil,
 Plus,
 Eye,
 Download,
 Search,
 ArrowUpDown,
 Send,
 Coins,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ux/empty-state";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 Tabs,
 TabsList,
 TabsTrigger,
 TabsContent,
} from "@/components/ui/tabs";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV } from "@/lib/export-utils";
import { formatPriceCompact, toPersianDigits, toEnglishDigits } from "@/lib/persian";
import { handleApiError, parseApiResponse } from "@/lib/api-error-handler";
import { authFetch } from "@/lib/auth-fetch";

// ============ types ============
interface StageSample {
 name: string;
 value: string;
}

interface DealCard {
 id: string;
 title: string;
 partyId: string | null;
 partyName: string | null;
 partyMobile: string | null;
 partyCity: string | null;
 lifecycleStage: string | null;
 leadScore: number;
 value: number;
 currency: string;
 probability: number;
 expectedCloseDate: string | null;
 description: string | null;
 assignedTo: string | null;
 createdAt: string;
 updatedAt: string;
}

interface PipelineStage {
 id: string;
 label: string;
 color: string;
 accent: string;
 border: string;
 count: number;
 totalValue: number;
 deals: DealCard[];
}

interface PipelineSummary {
 totalDeals: number;
 totalValue: number;
 wonCount: number;
 lostCount: number;
 activeCount: number;
 conversionRate: number;
}

interface CustomerRow {
 id: string;
 name: string;
 code?: string;
 type?: string;
 phone?: string;
 mobile?: string;
 email?: string;
 city?: string;
 province?: string;
 industry?: string;
 lifecycleStage?: string | null;
 leadScore?: number | null;
 category?: string;
 totalPurchase?: number;
}

interface ActivityRow {
 id: string;
 type: string;
 subject: string;
 description: string | null;
 partyId: string | null;
 dealId: string | null;
 duration: number | null;
 outcome: string | null;
 createdBy: string | null;
 createdAt: string;
}

interface CustomerDetail {
 id: string;
 name: string;
 code: string;
 type: string;
 mobile: string | null;
 phone: string | null;
 email: string | null;
 city: string | null;
 province: string | null;
 industry: string | null;
 address: string | null;
 lifecycleStage: string;
 lifecycleLabel: string;
 leadScore: number;
 metrics: {
 totalRevenue: number;
 paidRevenue: number;
 invoiceCount: number;
 dealCount: number;
 openDealCount: number;
 lastInvoiceDate: string | null;
 lastActivityDate: string | null;
 };
 invoices: Array<{ id: string; number: string; total: number; status: string; date: string; type: string }>;
 deals: Array<{ id: string; title: string; stage: string; value: number; probability: number; expectedCloseDate: string | null; createdAt: string }>;
 activities: ActivityRow[];
}

interface Segment {
 key: string;
 label: string;
 count: number;
 totalRevenue: number;
 avgScore: number;
}

interface FollowUp {
 customer: string;
 type: "call" | "email" | "meeting";
 subject: string;
 time: string;
 done: boolean;
}

const FOLLOWUPS: FollowUp[] = [];

const FOLLOWUP_META: Record<
 FollowUp["type"],
 { label: string; icon: LucideIcon; color: string }
> = {
 call: { label: "تماس", icon: Phone, color: "bg-muted text-muted-foreground" },
 email: { label: "ایمیل", icon: Mail, color: "bg-muted text-muted-foreground" },
 meeting: { label: "جلسه", icon: Calendar, color: "bg-muted text-muted-foreground" },
};

interface TopCustomer {
 name: string;
 points: number;
 tier: "gold" | "silver" | "bronze";
 totalPurchase: number;
}

const TOP_CUSTOMERS: TopCustomer[] = [];

const TIER_META: Record<
 TopCustomer["tier"],
 { label: string; color: string; ring: string }
> = {
 gold: { label: "طلایی", color: "bg-warning/10 text-warning", ring: "bg-warning/10 text-warning" },
 silver: { label: "نقره‌ای", color: "bg-muted text-muted-foreground", ring: "bg-muted text-muted-foreground" },
 bronze: { label: "برنزی", color: "bg-primary/10 text-primary", ring: "bg-primary/10 text-primary" },
};

interface CustomerFormState {
 name: string;
 phone: string;
 email: string;
 city: string;
 industry: string;
}

const EMPTY_CUSTOMER_FORM: CustomerFormState = {
 name: "",
 phone: "",
 email: "",
 city: "",
 industry: "",
};

interface FollowUpFormState {
 customer: string;
 type: "call" | "email" | "meeting";
 subject: string;
 time: string;
}

const EMPTY_FOLLOWUP_FORM: FollowUpFormState = {
 customer: "",
 type: "call",
 subject: "",
 time: "",
};

interface DealFormState {
 title: string;
 stage: string;
 partyId: string;
 value: string;
 probability: number;
 expectedCloseDate: string;
 description: string;
}

const EMPTY_DEAL_FORM: DealFormState = {
 title: "",
 stage: "PROSPECT",
 partyId: "",
 value: "",
 probability: 10,
 expectedCloseDate: "",
 description: "",
};

interface ActivityFormState {
 type: string;
 subject: string;
 description: string;
 partyId: string;
 duration: string;
 outcome: string;
}

const EMPTY_ACTIVITY_FORM: ActivityFormState = {
 type: "NOTE",
 subject: "",
 description: "",
 partyId: "",
 duration: "",
 outcome: "",
};

// ============ constants ============
const PIPELINE_STAGES = [
 { id: "PROSPECT", label: "پیش‌بینی", color: "bg-muted/40", accent: "text-muted-foreground", border: "border-muted" },
 { id: "CONTACTED", label: "تماس گرفته‌شده", color: "bg-teal-500/5", accent: "text-teal-600 dark:text-teal-400", border: "border-teal-500/30" },
 { id: "NEGOTIATION", label: "مذاکره", color: "bg-amber-500/5", accent: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30" },
 { id: "PROPOSAL", label: "پیشنهاد", color: "bg-purple-500/5", accent: "text-purple-600 dark:text-purple-400", border: "border-purple-500/30" },
 { id: "CLOSED", label: "بسته‌شده", color: "bg-emerald-500/5", accent: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30" },
 { id: "LOST", label: "باخته", color: "bg-rose-500/5", accent: "text-rose-600 dark:text-rose-400", border: "border-rose-500/30" },
] as const;

const ACTIVITY_TYPES = [
 { id: "CALL", label: "تماس", icon: Phone, color: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
 { id: "EMAIL", label: "ایمیل", icon: Mail, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
 { id: "MEETING", label: "جلسه", icon: Users, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
 { id: "NOTE", label: "یادداشت", icon: MessageSquare, color: "bg-muted text-muted-foreground" },
 { id: "TASK", label: "تسک", icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
 { id: "VISIT", label: "بازدید", icon: MapPin, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
] as const;

const LIFECYCLE_STAGES = [
 { id: "LEAD", label: "سرنخ", color: "bg-muted text-muted-foreground", icon: UserPlus },
 { id: "CUSTOMER", label: "مشتری", color: "bg-primary/10 text-primary", icon: Users },
 { id: "LOYAL", label: "وفادار", color: "bg-warning/10 text-warning", icon: Trophy },
 { id: "CHURNED", label: "از دست رفته", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400", icon: Heart },
] as const;

const SEGMENT_DIMENSIONS = [
 { id: "revenue", label: "درآمد", icon: TrendingUp },
 { id: "industry", label: "صنعت", icon: Briefcase },
 { id: "location", label: "موقعیت", icon: MapPin },
 { id: "lifecycle", label: "چرخه حیات", icon: Activity },
] as const;

// ============ helpers ============
function leadScoreTier(score: number): { label: string; color: string; icon: LucideIcon } {
 if (score >= 70) return { label: "داغ", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400", icon: Flame };
 if (score >= 40) return { label: "گرم", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Thermometer };
 return { label: "سرد", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400", icon: Snowflake };
}

// دسته‌بندی فرصت‌ها بر اساس ارزش — badge رنگی متمایز برای هر رده قیمتی
// FIX(H1): مقدار ذخیره‌شده در DB «ریال» است — آستانه‌ها به تومان تعریف شده‌اند
// (قبلاً مقدار ریالی مستقیم با آستانه تومانی مقایسه می‌شد = یک رده اشتباه)
function dealValueTier(valueRial: number): { label: string; color: string; icon?: LucideIcon } {
 const valueToman = valueRial / 10; // ریال → تومان
 if (valueToman >= 100_000_000)
 return { label: "استراتژیک", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30", icon: Trophy };
 if (valueToman >= 10_000_000)
 return { label: "بزرگ", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30", icon: TrendingUp };
 if (valueToman >= 1_000_000)
 return { label: "متوسط", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30", icon: Coins };
 if (valueToman > 0)
 return { label: "کوچک", color: "bg-muted text-muted-foreground border border-border" };
 return { label: "بدون ارزش", color: "bg-muted text-muted-foreground border border-border" };
}

function formatJalali(dateStr: string | null): string {
 if (!dateStr) return "—";
 try {
 return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(
 new Date(dateStr)
 );
 } catch {
 return "—";
 }
}

function formatJalaliShort(dateStr: string | null): string {
 if (!dateStr) return "—";
 try {
 return new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric" }).format(new Date(dateStr));
 } catch {
 return "—";
 }
}

// ============ main component ============
export function CRMModule() {
 const { toast } = useToast();
 const [activeTab, setActiveTab] = React.useState<"pipeline" | "customers" | "segments" | "activities">("pipeline");

 const [customerDialog, setCustomerDialog] = React.useState(false);
 const [followUpDialog, setFollowUpDialog] = React.useState(false);
 const [dealDialog, setDealDialog] = React.useState(false);
 const [activityDialog, setActivityDialog] = React.useState(false);
 const [customerDetailDialog, setCustomerDetailDialog] = React.useState(false);
 const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
 const [submitting, setSubmitting] = React.useState(false);

 // پیامک گروهی و گزارش فروش
 const [smsDialogOpen, setSmsDialogOpen] = React.useState(false);
 const [smsMessage, setSmsMessage] = React.useState("");
 const [smsSegment, setSmsSegment] = React.useState<"all" | "customers" | "suppliers">("customers");
 const [smsSending, setSmsSending] = React.useState(false);

 const [salesReportOpen, setSalesReportOpen] = React.useState(false);
 const [salesReportData, setSalesReportData] = React.useState<unknown>(null);
 const [salesReportLoading, setSalesReportLoading] = React.useState(false);
 const [salesReportGroupBy, setSalesReportGroupBy] = React.useState<"customer" | "product" | "month">("customer");

 const [customerForm, setCustomerForm] = React.useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);
 const [customerErrors, setCustomerErrors] = React.useState<Record<string, string>>({});
 const [followUpForm, setFollowUpForm] = React.useState<FollowUpFormState>(EMPTY_FOLLOWUP_FORM);
 const [followUpErrors, setFollowUpErrors] = React.useState<Record<string, string>>({});
 const [dealForm, setDealForm] = React.useState<DealFormState>(EMPTY_DEAL_FORM);
 const [activityForm, setActivityForm] = React.useState<ActivityFormState>(EMPTY_ACTIVITY_FORM);

 // داده‌ها
 const [customers, setCustomers] = React.useState<CustomerRow[]>([]);
 // FIX(M7): تعداد کل مشتریان از پاسخ API — برای بج «نمایش N از M»
 const [customersTotal, setCustomersTotal] = React.useState<number | null>(null);
 const [pipeline, setPipeline] = React.useState<PipelineStage[]>([]);
 const [pipelineSummary, setPipelineSummary] = React.useState<PipelineSummary | null>(null);
 const [activities, setActivities] = React.useState<ActivityRow[]>([]);
 const [segments, setSegments] = React.useState<Segment[]>([]);
 const [segmentDimension, setSegmentDimension] = React.useState<string>("revenue");
 const [customerDetail, setCustomerDetail] = React.useState<CustomerDetail | null>(null);
 const [refreshKey, setRefreshKey] = React.useState(0);
 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 // وضعیت بارگذاری
 const [loadingCustomers, setLoadingCustomers] = React.useState(true);
 const [loadingPipeline, setLoadingPipeline] = React.useState(true);
 const [loadingActivities, setLoadingActivities] = React.useState(true);

 // جستجو و مرتب‌سازی مشتریان
 const [customerSearch, setCustomerSearch] = React.useState("");
 const [customerSort, setCustomerSort] = React.useState<"name" | "city" | "leadScore">("name");
 const [customerSortDir, setCustomerSortDir] = React.useState<"asc" | "desc">("asc");

 // ============ fetchers ============
 const fetchCustomers = React.useCallback(async () => {
 setLoadingCustomers(true);
 try {
 // FIX(M7): سقف ۱۰۰ → ۵۰۰ (سقف مجاز API) — قبلاً مشتری ۱۰۱+ دیده نمی‌شد
 const res = await authFetch("/api/parties?type=CUSTOMER&limit=500", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 setCustomers(
 json.data.map((p: Record<string, unknown>) => ({
 id: String(p.id?? ""),
 name: String(p.name?? ""),
 code: (p.code as string) || undefined,
 type: (p.type as string) || undefined,
 phone: (p.phone as string) || undefined,
 mobile: (p.mobile as string) || undefined,
 email: (p.email as string) || undefined,
 city: (p.city as string) || undefined,
 province: (p.province as string) || undefined,
 industry: (p.industry as string) || undefined,
 lifecycleStage: (p.lifecycleStage as string) || null,
 leadScore: (p.leadScore as number) || 0,
 }))
 );
 // FIX(M7): تعداد کل از API — برای نمایش «نمایش N از M»
 setCustomersTotal(
 typeof json.total === "number" ? json.total : (json.data as unknown[]).length
 );
 } else {
 setCustomers([]);
 setCustomersTotal(null);
 }
 } catch {
 setCustomers([]);
 setCustomersTotal(null);
 } finally {
 setLoadingCustomers(false);
 }
 }, []);

 const fetchPipeline = React.useCallback(async () => {
 setLoadingPipeline(true);
 try {
 const res = await authFetch("/api/crm/pipeline", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && json.data) {
 setPipeline(json.data.stages || []);
 setPipelineSummary(json.data.summary || null);
 } else {
 setPipeline([]);
 setPipelineSummary(null);
 }
 } catch {
 setPipeline([]);
 setPipelineSummary(null);
 } finally {
 setLoadingPipeline(false);
 }
 }, []);

 const fetchActivities = React.useCallback(async () => {
 setLoadingActivities(true);
 try {
 const res = await authFetch("/api/crm/activities?limit=50", { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && Array.isArray(json.data)) {
 setActivities(json.data);
 } else {
 setActivities([]);
 }
 } catch {
 setActivities([]);
 } finally {
 setLoadingActivities(false);
 }
 }, []);

 const fetchSegments = React.useCallback(async () => {
 try {
 const res = await authFetch(`/api/crm/segments?by=${segmentDimension}`, { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && json.data) {
 setSegments(json.data.segments || []);
 } else {
 setSegments([]);
 }
 } catch {
 setSegments([]);
 }
 }, [segmentDimension]);

 const fetchCustomerDetail = React.useCallback(async (id: string) => {
 try {
 const res = await authFetch(`/api/crm/customers/${id}`, { cache: "no-store" });
 const json = await res.json().catch(() => ({}));
 if (json?.success && json.data) {
 setCustomerDetail(json.data);
 setCustomerDetailDialog(true);
 } else {
 toast({ title: "خطا", description: "اطلاعات مشتری بارگذاری نشد", variant: "destructive" });
 }
 } catch (err) {
 toast({
 title: "خطا در دریافت مشتری",
 description: handleApiError(err, "دریافت جزئیات مشتری ناموفق بود"),
 variant: "destructive",
 });
 }
 }, [toast]);

 React.useEffect(() => {
 void fetchCustomers();
 void fetchPipeline();
 void fetchActivities();
 }, [fetchCustomers, fetchPipeline, fetchActivities, refreshKey]);

 React.useEffect(() => {
 if (activeTab === "segments") void fetchSegments();
 }, [activeTab, fetchSegments, refreshKey]);

 // فیلتر و مرتب‌سازی مشتریان
 const filteredCustomers = React.useMemo(() => {
 let list = customers;
 if (customerSearch.trim()) {
 const q = customerSearch.trim().toLowerCase();
 list = list.filter(
 (c) =>
 c.name.toLowerCase().includes(q) ||
 (c.city || "").toLowerCase().includes(q) ||
 (c.industry || "").toLowerCase().includes(q) ||
 (c.mobile || c.phone || c.email || "").toLowerCase().includes(q)
 );
 }
 return [...list].sort((a, b) => {
 let cmp = 0;
 if (customerSort === "name") cmp = a.name.localeCompare(b.name, "fa");
 else if (customerSort === "city") cmp = (a.city || "").localeCompare(b.city || "", "fa");
 else if (customerSort === "leadScore") cmp = (a.leadScore || 0) - (b.leadScore || 0);
 return customerSortDir === "desc"? -cmp: cmp;
 });
 }, [customers, customerSearch, customerSort, customerSortDir]);

 // ============ stats (top bar) ============
 const totalLeads = pipelineSummary?.totalDeals || 0;
 const wonCount = pipelineSummary?.wonCount || 0;
 const conversionRate = pipelineSummary?.conversionRate || 0;
 const totalPipelineValue = pipelineSummary?.totalValue || 0;

 // ============ dialog openers ============
 const openCustomerDialog = () => {
 setCustomerForm(EMPTY_CUSTOMER_FORM);
 setCustomerErrors({});
 setCustomerDialog(true);
 };

 // گوش دادن به رویداد hoshhesab:module-action برای باز کردن دیالوگ مشتری جدید
 React.useEffect(() => {
 const onAction = (e: Event) => {
 const detail = (e as CustomEvent<{ module: string; action: string }>).detail;
 if (detail?.module === "crm" && detail.action === "new-party") {
 openCustomerDialog();
 }
 };
 window.addEventListener("hoshhesab:module-action", onAction as EventListener);
 return () => window.removeEventListener("hoshhesab:module-action", onAction as EventListener);
 }, []);

 // FIX(v11-deeplink): باز کردن مستقیم پروفایل طرف‌حساب از لینک هوش‌یار
 // (رویداد زنده + pending در sessionStorage برای حالت لود از لینک خارجی)
 React.useEffect(() => {
 const tryOpen = (id: string) => {
 setSelectedCustomerId(id);
 setCustomerDetailDialog(true);
 };
 const onOpenEntity = (e: Event) => {
 const detail = (e as CustomEvent<{ module?: string; type?: string; id?: string }>).detail;
 if (detail?.module === "crm" && detail.type === "party" && detail.id) {
 tryOpen(detail.id);
 }
 };
 window.addEventListener("hoshhesab:open-entity", onOpenEntity as EventListener);
 try {
 const raw = sessionStorage.getItem("hoshhesab_pending_open");
 if (raw) {
 const p = JSON.parse(raw) as { module?: string; type?: string; id?: string };
 if (p.module === "crm" && p.type === "party" && p.id) {
 tryOpen(p.id);
 sessionStorage.removeItem("hoshhesab_pending_open");
 }
 }
 } catch {
 /* ignore */
 }
 return () => window.removeEventListener("hoshhesab:open-entity", onOpenEntity as EventListener);
 }, []);

 const openFollowUpDialog = () => {
 setFollowUpForm(EMPTY_FOLLOWUP_FORM);
 setFollowUpErrors({});
 setFollowUpDialog(true);
 };

 const openDealDialog = (stageId?: string) => {
 setDealForm({...EMPTY_DEAL_FORM, stage: stageId || "PROSPECT" });
 setDealDialog(true);
 };

 const openActivityDialog = (partyId?: string) => {
 setActivityForm({...EMPTY_ACTIVITY_FORM, partyId: partyId || "" });
 setActivityDialog(true);
 };

 // ============ form validators ============
 const validateCustomerForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!customerForm.name.trim()) e.name = "نام مشتری الزامی است";
 if (customerForm.email &&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email.trim()))
 e.email = "ایمیل نامعتبر است";
 if (customerForm.phone &&!/^[\d\s+]{6,}$/.test(customerForm.phone.trim()))
 e.phone = "شماره تلفن نامعتبر است";
 setCustomerErrors(e);
 return Object.keys(e).length === 0;
 };

 const isCustomerFormValid = React.useMemo(
 () => Boolean(customerForm.name.trim()),
 [customerForm.name]
 );

 const submitCustomer = async () => {
 if (!validateCustomerForm()) {
 toast({ title: "اطلاعات ناقص", description: "لطفاً فیلدهای الزامی را تکمیل کنید.", variant: "destructive" });
 return;
 }
 setSubmitting(true);
 try {
 const payload = {
 code: `C${Date.now().toString().slice(-8)}`,
 name: customerForm.name.trim(),
 type: "CUSTOMER" as const,
 phone: customerForm.phone.trim() || undefined,
 mobile: customerForm.phone.trim() || undefined,
 email: customerForm.email.trim() || undefined,
 city: customerForm.city.trim() || undefined,
 industry: customerForm.industry.trim() || undefined,
 creditLimit: 0,
 };
 const res = await authFetch("/api/parties", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 });
 let json: { success?: boolean; error?: string } | null = null;
 try {
 json = await res.json();
 } catch {
 json = null;
 }
 parseApiResponse(res, json);
 toast({
 title: "مشتری ایجاد شد",
 description: `«${customerForm.name}» به‌عنوان مشتری جدید ثبت شد.`,
 });
 setCustomerDialog(false);
 setCustomerForm(EMPTY_CUSTOMER_FORM);
 setCustomerErrors({});
 refresh();
 } catch (err) {
 toast({
 title: "خطا در ایجاد مشتری",
 description: handleApiError(err, "ایجاد مشتری ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const validateFollowUpForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!followUpForm.customer.trim()) e.customer = "نام مشتری الزامی است";
 if (!followUpForm.subject.trim()) e.subject = "موضوع الزامی است";
 setFollowUpErrors(e);
 return Object.keys(e).length === 0;
 };

 const isFollowUpFormValid = React.useMemo(
 () => Boolean(followUpForm.customer.trim() && followUpForm.subject.trim()),
 [followUpForm.customer, followUpForm.subject]
 );

 const submitFollowUp = async () => {
 if (!validateFollowUpForm()) {
 toast({ title: "اطلاعات ناقص", description: "لطفاً فیلدهای الزامی را تکمیل کنید.", variant: "destructive" });
 return;
 }
 setSubmitting(true);
 try {
 // H7: ارسال پیگیری به‌عنوان فعالیت TASK — POST /api/crm/activities
 // نگاشت نوع پیگیری به نوع فعالیت CRM
 const activityType =
 followUpForm.type === "call"? "CALL"
: followUpForm.type === "email"? "EMAIL"
: "MEETING";
 // تلاش برای یافتن partyId بر اساس نام مشتری (در صورت تطابق)
 let partyId: string | undefined;
 const match = customers.find(
 (c) => c.name.trim() === followUpForm.customer.trim()
 );
 if (match) partyId = match.id;

 const res = await authFetch("/api/crm/activities", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 type: "TASK",
 subject: `پیگیری: ${followUpForm.subject.trim()}`,
 description: `مشتری: ${followUpForm.customer.trim()} | نوع: ${activityType}${followUpForm.time? ` | زمان: ${followUpForm.time}`: ""}`,
 partyId,
 }),
 });
 const json: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({
 title: "پیگیری ثبت شد",
 description: json?.message?? `پیگیری «${followUpForm.subject}» برای «${followUpForm.customer}» ثبت شد.`,
 });
 setFollowUpDialog(false);
 setFollowUpForm(EMPTY_FOLLOWUP_FORM);
 setFollowUpErrors({});
 refresh();
 } catch (err) {
 toast({
 title: "خطا در ثبت پیگیری",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // ============ deal submit ============
 const submitDeal = async () => {
 if (!dealForm.title.trim()) {
 toast({ title: "عنوان الزامی است", variant: "destructive" });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/crm/pipeline", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 title: dealForm.title.trim(),
 stage: dealForm.stage,
 partyId: dealForm.partyId || undefined,
 // FIX(H1 + M3): فرم به «تومان» است — برای ذخیره ریالی ×۱۰ می‌شود؛
 // ارقام فارسی/عربی و جداکننده‌های هزارگان قبل از پارس نرمال می‌شوند
 value:
 (Number(toEnglishDigits(dealForm.value).replace(/[^\d]/g, "")) || 0) * 10,
 probability: dealForm.probability,
 expectedCloseDate: dealForm.expectedCloseDate || undefined,
 description: dealForm.description.trim() || undefined,
 }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({ title: "فرصت ایجاد شد", description: `«${dealForm.title}» به pipeline اضافه شد.` });
 setDealDialog(false);
 setDealForm(EMPTY_DEAL_FORM);
 refresh();
 } catch (err) {
 toast({
 title: "خطا در ایجاد فرصت",
 description: handleApiError(err, "ایجاد فرصت ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // ============ activity submit ============
 const submitActivity = async () => {
 if (!activityForm.subject.trim()) {
 toast({ title: "موضوع الزامی است", variant: "destructive" });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/crm/activities", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 type: activityForm.type,
 subject: activityForm.subject.trim(),
 description: activityForm.description.trim() || undefined,
 partyId: activityForm.partyId || undefined,
 duration: activityForm.duration? Number(activityForm.duration): undefined,
 outcome: activityForm.outcome.trim() || undefined,
 }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({ title: "فعالیت ثبت شد", description: `«${activityForm.subject}» در timeline ثبت شد.` });
 setActivityDialog(false);
 setActivityForm(EMPTY_ACTIVITY_FORM);
 refresh();
 // اگر پنجره‌ی جزئیات مشتری باز است، آن را به‌روز کن
 if (selectedCustomerId) {
 void fetchCustomerDetail(selectedCustomerId);
 }
 } catch (err) {
 toast({
 title: "خطا در ثبت فعالیت",
 description: handleApiError(err, "ثبت فعالیت ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // ============ move deal (drag & drop) ============
 const moveDeal = async (dealId: string, newStage: string) => {
 // Find the deal in current pipeline first
 let dealToMove: DealCard | null = null;
 for (const stage of pipeline) {
 const found = stage.deals.find((d) => d.id === dealId);
 if (found) { dealToMove = found; break; }
 }
 if (!dealToMove) return;

 // optimistic UI
 setPipeline((prev) => {
 const next = prev.map((stage) => {
 const idx = stage.deals.findIndex((d) => d.id === dealId);
 if (idx >= 0) {
 return {...stage, deals: stage.deals.filter((d) => d.id!== dealId), count: stage.count - 1, totalValue: stage.totalValue - dealToMove!.value };
 }
 return stage;
 });
 const target = next.find((s) => s.id === newStage);
 if (target) {
 target.deals = [dealToMove!,...target.deals];
 target.count = target.count + 1;
 target.totalValue = target.totalValue + dealToMove!.value;
 }
 return next.map((s) => ({...s }));
 });

 try {
 const res = await authFetch("/api/crm/pipeline", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: dealId, stage: newStage }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({ title: "فرصت جابجا شد", description: `به مرحله‌ی جدید منتقل شد.` });
 // به‌روزرسانی دقیق از سرور
 void fetchPipeline();
 } catch (err) {
 toast({
 title: "خطا در جابجایی",
 description: handleApiError(err, "جابجایی فرصت ناموفق بود"),
 variant: "destructive",
 });
 void fetchPipeline();
 }
 };

 // ============ recompute scores ============
 const recomputeScores = async () => {
 setSubmitting(true);
 try {
 const res = await authFetch("/api/crm/score", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({}),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 const s = json?.data?.summary;
 toast({
 title: "امتیاز سرنخ‌ها محاسبه شد",
 description: s? `داغ: ${toPersianDigits(s.hot)} • گرم: ${toPersianDigits(s.warm)} • سرد: ${toPersianDigits(s.cold)}`: undefined,
 });
 refresh();
 } catch (err) {
 toast({
 title: "خطا در محاسبه امتیاز",
 description: handleApiError(err, "محاسبه امتیاز ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // ============ update lifecycle (manual) ============
 const updateLifecycle = async (customerId: string, stage: string) => {
 try {
 const res = await authFetch(`/api/crm/customers/${customerId}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ lifecycleStage: stage }),
 });
 const json = await res.json().catch(() => ({}));
 parseApiResponse(res, json);
 toast({ title: "چرخه حیات به‌روزرسانی شد" });
 refresh();
 if (selectedCustomerId) void fetchCustomerDetail(selectedCustomerId);
 } catch (err) {
 toast({
 title: "خطا",
 description: handleApiError(err, "به‌روزرسانی ناموفق بود"),
 variant: "destructive",
 });
 }
 };

 // ============ misc actions ============
 const handleSmsCampaign = () => {
 setSmsMessage("");
 setSmsSegment("customers");
 setSmsDialogOpen(true);
 };

 const handleSendBulkSms = async () => {
 if (!smsMessage.trim()) {
 toast({ title: "متن پیامک الزامی است", variant: "destructive" });
 return;
 }
 setSmsSending(true);
 try {
 const res = await authFetch("/api/crm/bulk-sms", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 },
 body: JSON.stringify({
 message: smsMessage.trim(),
 segment: smsSegment,
 }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 throw new Error(data?.error || "ارسال ناموفق بود");
 }
 toast({
 title: "پیامک ارسال شد",
 description: data.message || `پیامک به ${data.data?.recipientCount || 0} گیرنده ارسال شد.`,
 });
 setSmsDialogOpen(false);
 } catch (err) {
 toast({
 title: "خطا در ارسال پیامک",
 description: err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setSmsSending(false);
 }
 };

 const handleSalesReport = async () => {
 setSalesReportOpen(true);
 setSalesReportLoading(true);
 setSalesReportData(null);
 try {
 const res = await authFetch(`/api/crm/sales-report?groupBy=${salesReportGroupBy}`, {
 cache: "no-store",
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 throw new Error(data?.error || "خطا در دریافت گزارش");
 }
 setSalesReportData(data.data);
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error? err.message: "گزارش بارگذاری نشد",
 variant: "destructive",
 });
 } finally {
 setSalesReportLoading(false);
 }
 };

 const handleViewCalendar = () => {
 toast({
 title: "مشاهده تقویم",
 description: "نمای تقویمی پیگیری‌ها — برای مشاهده‌ی پیگیری‌های امروز، به بخش «پیگیری‌های امروز» مراجعه کنید.",
 });
 };
 const handleLoyalty = () => {
 toast({
 title: "باشگاه وفاداری مشتریان",
 description: "بر اساس امتیاز سرنخ (Lead Score) مشتریان به‌صورت خودکار دسته‌بندی می‌شوند. برای مدیریت تفصیلی، از بخش «تقسیم‌بندی» استفاده کنید.",
 });
 setActiveTab("segments");
 };

 // ============ render ============
 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={Users}
 label="مشتریان فعال"
 value={toPersianDigits(customers.length)}
 sub={
 customersTotal !== null && customersTotal > customers.length
? `نمایش ${toPersianDigits(customers.length)} از ${toPersianDigits(customersTotal)}`
: customers.length > 0? "ثبت شده": "بدون داده"
 }
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={Target}
 label="فرصت‌های باز"
 value={toPersianDigits(pipelineSummary?.activeCount || 0)}
 sub={`از ${toPersianDigits(totalLeads)} فرصت`}
 color="bg-amber-500/10 text-amber-600 dark:text-amber-400"
 />
 <StatCard
 icon={Trophy}
 label="نرخ تبدیل"
 value={`${toPersianDigits(conversionRate)}٪`}
 sub={`${toPersianDigits(wonCount)} موفق`}
 color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
 />
 <StatCard
 icon={BarChart3}
 label="ارزش Pipeline"
 value={totalPipelineValue > 0? formatPriceCompact(totalPipelineValue, "toman"): "—"}
 sub={totalPipelineValue > 0? "مجموع فرصت‌های باز": "بدون فرصت باز"}
 color="bg-primary/10 text-primary"
 />
 </div>

 {/* نوار ابزار */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Heart className="h-5 w-5" />
 </div>
 <div>
 <h3 className="text-sm font-semibold">CRM قدرتمند و مدیریت مشتریان</h3>
 <p className="text-xs text-muted-foreground">
 مدیریت چرخه کامل ارتباط با مشتری — Pipeline کانبان، فعالیت‌ها، تقسیم‌بندی و امتیاز سرنخ
 </p>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button variant="outline" className="gap-1.5" onClick={handleSmsCampaign}>
 <MessageSquare className="h-4 w-4" />
 پیامک گروهی
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleSalesReport}>
 <BarChart3 className="h-4 w-4" />
 گزارش فروش
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={recomputeScores} disabled={submitting}>
 {submitting? <Loader2 className="h-4 w-4 animate-spin" />: <Activity className="h-4 w-4" />}
 محاسبه امتیاز سرنخ
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={openFollowUpDialog}>
 <Bell className="h-4 w-4" />
 پیگیری جدید
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={() => {
 if (customers.length === 0) {
 toast({ title: "مشتری برای خروجی وجود ندارد", variant: "destructive" });
 return;
 }
 const rows = customers.map((c) => ({
 name: c.name,
 phone: c.phone,
 email: c.email,
 category: c.category,
 city: c.city,
 totalPurchase: c.totalPurchase,
 }));
 exportToCSV(rows, `مشتریان-${new Date().toISOString().slice(0, 10)}`);
 toast({ title: "خروجی گرفته شد", description: `${toPersianDigits(rows.length)} مشتری ذخیره شد.` });
 }}>
 <Download className="h-4 w-4" />
 خروجی
 </Button>
 <Button className="gap-1.5" onClick={openCustomerDialog}>
 <UserPlus className="h-4 w-4" />
 مشتری جدید
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* تب‌های اصلی */}
 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
 <TabsList className="flex-wrap h-auto p-1">
 <TabsTrigger value="pipeline" className="gap-1.5">
 <BarChart3 className="h-3.5 w-3.5" />
 Pipeline فروش (کانبان)
 </TabsTrigger>
 <TabsTrigger value="customers" className="gap-1.5">
 <Users className="h-3.5 w-3.5" />
 مشتریان و چرخه حیات
 </TabsTrigger>
 <TabsTrigger value="segments" className="gap-1.5">
 <Filter className="h-3.5 w-3.5" />
 تقسیم‌بندی
 </TabsTrigger>
 <TabsTrigger value="activities" className="gap-1.5">
 <Activity className="h-3.5 w-3.5" />
 فعالیت‌ها
 </TabsTrigger>
 </TabsList>

 {/* ============ Pipeline Kanban ============ */}
 <TabsContent value="pipeline" className="mt-4 space-y-4">
 <div className="flex items-center justify-between">
 <p className="text-xs text-muted-foreground">
 فرصت‌ها را با درگ بین ستون‌ها جابجا کنید. هر ستون یک مرحله از فرآیند فروش است.
 </p>
 <Button size="sm" className="gap-1.5" onClick={() => openDealDialog()}>
 <Plus className="h-3.5 w-3.5" />
 فرصت جدید
 </Button>
 </div>

 {loadingPipeline? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): pipeline.length === 0? (
 <Card>
 <CardContent className="p-6">
 <EmptyState
 icon={BarChart3}
 title="هنوز فرصتی در pipeline ثبت نشده"
 description="با افزودن اولین فرصت فروش، نمای کانبان مراحل پیش‌بینی، تماس، مذاکره، پیشنهاد، بسته‌شده و باخته را مشاهده کنید."
 action={
 <Button size="sm" className="gap-1.5" onClick={() => openDealDialog()}>
 <Plus className="h-3.5 w-3.5" />
 ایجاد اولین فرصت
 </Button>
 }
 />
 </CardContent>
 </Card>
 ): (
 <div className="overflow-x-auto pb-2">
 <div className="flex gap-3 min-w-max">
 {pipeline.map((stage) => (
 <PipelineColumn
 key={stage.id}
 stage={stage}
 onMove={moveDeal}
 onAddDeal={(stageId) => openDealDialog(stageId)}
 onViewCustomer={(id) => {
 setSelectedCustomerId(id);
 void fetchCustomerDetail(id);
 }}
 />
 ))}
 </div>
 </div>
 )}
 </TabsContent>

 {/* ============ Customers + Lifecycle ============ */}
 <TabsContent value="customers" className="mt-4 space-y-4">
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 {LIFECYCLE_STAGES.map((s) => {
 const count = filteredCustomers.filter((c) => (c.lifecycleStage || "LEAD") === s.id).length;
 const Icon = s.icon;
 return (
 <Card key={s.id}>
 <CardContent className="p-4 flex items-center gap-3">
 <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.color}`}>
 <Icon className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">{s.label}</p>
 <p className="font-bold text-lg tnum">{toPersianDigits(count)}</p>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>

 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <Users className="h-4 w-4 text-primary" />
 لیست مشتریان و چرخه حیات
 </CardTitle>
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(filteredCustomers.length)} مشتری
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 {loadingCustomers? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): customers.length === 0? (
 <EmptyState
 icon={Users}
 title="هنوز مشتری‌ای ثبت نشده"
 description="با افزودن اولین مشتری، چرخه حیات و امتیاز سرنخ آن به‌صورت خودکار محاسبه می‌شود."
 action={
 <Button size="sm" className="gap-1.5" onClick={openCustomerDialog}>
 <UserPlus className="h-3.5 w-3.5" />
 افزودن اولین مشتری
 </Button>
 }
 />
 ): (
 <div className="space-y-3">
 {/* جستجو و مرتب‌سازی */}
 <div className="flex flex-col sm:flex-row gap-2">
 <div className="relative flex-1">
 <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="جستجو در مشتریان..."
 className="pr-9"
 value={customerSearch}
 onChange={(e) => setCustomerSearch(e.target.value)}
 />
 </div>
 <Select value={customerSort} onValueChange={(v) => setCustomerSort(v as typeof customerSort)}>
 <SelectTrigger className="w-[140px] h-9 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="name">نام</SelectItem>
 <SelectItem value="city">شهر</SelectItem>
 <SelectItem value="leadScore">امتیاز سرنخ</SelectItem>
 </SelectContent>
 </Select>
 <Button
 variant="outline"
 size="sm"
 className="h-9 gap-1 text-xs"
 onClick={() => setCustomerSortDir((d) => d === "asc"? "desc": "asc")}
 >
 {customerSortDir === "asc"? "▲": "▼"}
 {customerSortDir === "asc"? "صعودی": "نزولی"}
 </Button>
 </div>
 {filteredCustomers.length === 0? (
 <p className="text-center text-sm text-muted-foreground py-8">
 مشتری‌ای با این فیلتر یافت نشد
 </p>
 ): (
 <div className="space-y-2">
 {filteredCustomers.map((c) => {
 const stage = c.lifecycleStage || "LEAD";
 const stageMeta = LIFECYCLE_STAGES.find((s) => s.id === stage) || LIFECYCLE_STAGES[0];
 const score = c.leadScore || 0;
 const tier = leadScoreTier(score);
 const TierIcon = tier.icon;
 return (
 <div
 key={c.id}
 className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30 transition-colors"
 >
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stageMeta.color}`}>
 <stageMeta.icon className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-sm font-medium truncate">{c.name}</span>
 <Badge variant="secondary" className={`text-[10px] h-5 ${stageMeta.color}`}>
 {stageMeta.label}
 </Badge>
 {c.city && (
 <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
 <MapPin className="h-2.5 w-2.5" />
 {c.city}
 </span>
 )}
 {c.industry && (
 <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
 <Briefcase className="h-2.5 w-2.5" />
 {c.industry}
 </span>
 )}
 </div>
 <p className="text-xs text-muted-foreground mt-0.5 truncate" dir="ltr">
 {c.mobile || c.phone || c.email || "—"}
 </p>
 </div>
 <Badge className={`text-[10px] h-5 gap-1 ${tier.color}`}>
 <TierIcon className="h-3 w-3" />
 {toPersianDigits(score)}
 </Badge>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0"
 onClick={() => {
 setSelectedCustomerId(c.id);
 void fetchCustomerDetail(c.id);
 }}
 title="مشاهده جزئیات"
 >
 <Eye className="h-3.5 w-3.5" />
 </Button>
 </div>
 );
 })}
 </div>
 )}
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {/* ============ Segments ============ */}
 <TabsContent value="segments" className="mt-4 space-y-4">
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <CardTitle className="text-base flex items-center gap-2">
 <Filter className="h-4 w-4 text-primary" />
 تقسیم‌بندی مشتریان
 </CardTitle>
 <Select value={segmentDimension} onValueChange={setSegmentDimension}>
 <SelectTrigger className="w-[180px] h-8 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {SEGMENT_DIMENSIONS.map((d) => (
 <SelectItem key={d.id} value={d.id} className="text-xs">
 {d.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </CardHeader>
 <CardContent>
 {segments.length === 0? (
 <EmptyState
 icon={Filter}
 title="داده‌ای برای تقسیم‌بندی موجود نیست"
 description="پس از ثبت مشتری و فاکتور، تقسیم‌بندی بر اساس درآمد، صنعت، موقعیت و چرخه حیات نمایش داده می‌شود."
 className="py-8"
 />
 ): (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {segments.map((seg) => (
 <div key={seg.key} className="rounded-lg border border-border/60 p-4 card-hover">
 <div className="flex items-center justify-between mb-2">
 <p className="text-sm font-medium truncate">{seg.label}</p>
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(seg.count)} مشتری
 </Badge>
 </div>
 <p className="text-lg font-bold text-foreground tnum">
 {seg.totalRevenue > 0? formatPriceCompact(seg.totalRevenue, "toman"): "—"}
 </p>
 <p className="text-[10px] text-muted-foreground mb-2">درآمد کل</p>
 <div className="flex items-center justify-between text-[10px] text-muted-foreground">
 <span>میانگین امتیاز سرنخ</span>
 <span className="font-medium text-foreground tnum">{toPersianDigits(seg.avgScore)}</span>
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {/* ============ Activities ============ */}
 <TabsContent value="activities" className="mt-4 space-y-4">
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 فعالیت‌های اخیر (Timeline)
 </CardTitle>
 <Button size="sm" className="gap-1.5" onClick={() => openActivityDialog()}>
 <Plus className="h-3.5 w-3.5" />
 ثبت فعالیت
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {loadingActivities? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): activities.length === 0? (
 <EmptyState
 icon={Activity}
 title="هنوز فعالیتی ثبت نشده"
 description="فعالیت‌های تماس، ایمیل، جلسه و یادداشت برای هر مشتری را ثبت کنید تا در timeline نمایش داده شوند."
 action={
 <Button size="sm" className="gap-1.5" onClick={() => openActivityDialog()}>
 <Plus className="h-3.5 w-3.5" />
 ثبت اولین فعالیت
 </Button>
 }
 className="py-6"
 />
 ): (
 <div className="relative space-y-3 pr-3">
 <div className="absolute right-1.5 top-1 bottom-1 w-px bg-border" />
 {activities.map((a) => {
 const meta = ACTIVITY_TYPES.find((t) => t.id === a.type) || ACTIVITY_TYPES[3];
 const Icon = meta.icon;
 return (
 <div key={a.id} className="relative flex items-start gap-3">
 <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full ${meta.color} ring-2 ring-background`}>
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div className="flex-1 min-w-0 rounded-lg border border-border/60 p-3">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-sm font-medium truncate">{a.subject}</span>
 <Badge variant="secondary" className={`text-[10px] h-5 ${meta.color}`}>
 {meta.label}
 </Badge>
 <span className="text-[10px] text-muted-foreground mr-auto">
 {formatJalaliShort(a.createdAt)} • {toPersianDigits(new Date(a.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }))}
 </span>
 </div>
 {a.description && (
 <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
 )}
 {a.duration && (
 <span className="text-[10px] text-muted-foreground mt-1 inline-flex items-center gap-1">
 <Clock className="h-2.5 w-2.5" />
 {toPersianDigits(a.duration)} دقیقه
 </span>
 )}
 </div>
 </div>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>

 {/* ============ follow-ups today (existing feature) ============ */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <Calendar className="h-4 w-4 text-primary" />
 پیگیری‌های امروز
 </CardTitle>
 <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleViewCalendar}>
 مشاهده تقویم
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {FOLLOWUPS.length === 0? (
 <EmptyState
 icon={Calendar}
 title="پیگیری‌ای برای امروز ثبت نشده"
 description="برای پیگیری به‌موقع سرنخ‌ها و مشتریان، اولین یادآور پیگیری (تماس، ایمیل یا جلسه) را ثبت کنید."
 action={
 <Button size="sm" className="gap-1.5" onClick={openFollowUpDialog}>
 <Bell className="h-3.5 w-3.5" />
 پیگیری جدید
 </Button>
 }
 />
 ): (
 <div className="space-y-2">
 {FOLLOWUPS.map((f, i) => {
 const meta = FOLLOWUP_META[f.type];
 const Icon = meta.icon;
 return (
 <div
 key={i}
 className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30 transition-colors"
 >
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.color}`}>
 <Icon className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-sm font-medium truncate">{f.customer}</span>
 <Badge variant="secondary" className={`text-[10px] h-5 ${meta.color}`}>
 {meta.label}
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground mt-0.5 truncate">{f.subject}</p>
 </div>
 <div className="flex flex-col items-end gap-1 shrink-0">
 <span className="text-xs font-mono text-muted-foreground tnum">
 {toPersianDigits(f.time)}
 </span>
 {f.done? (
 <Badge className="text-[10px] h-5 bg-success/10 text-success gap-1">
 <CheckCircle2 className="h-3 w-3" />
 انجام شد
 </Badge>
 ): (
 <Badge className="text-[10px] h-5 bg-warning/10 text-warning gap-1">
 <Clock className="h-3 w-3" />
 در انتظار
 </Badge>
 )}
 </div>
 </div>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>

 {/* باشگاه مشتریان (existing) */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Trophy className="h-4 w-4 text-primary" />
 باشگاه مشتریان
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 {TOP_CUSTOMERS.length === 0? (
 <EmptyState
 icon={Trophy}
 title="هنوز مشتری وفاداری ثبت نشده"
 description="با ثبت اولین فروشها، مشتریان برتر بر اساس امتیاز وفاداری در این بخش نمایش داده می‌شوند."
 className="py-4"
 />
 ): (
 TOP_CUSTOMERS.map((c, i) => {
 const tier = TIER_META[c.tier];
 const maxPoints = TOP_CUSTOMERS[0].points;
 const pct = (c.points / maxPoints) * 100;
 return (
 <div key={i} className="rounded-lg border border-border/60 p-3 card-hover">
 <div className="flex items-center gap-3 mb-2">
 <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tier.ring}`}>
 <Star className="h-4 w-4" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium truncate">{c.name}</p>
 <p className="text-[10px] text-muted-foreground">
 {formatPriceCompact(c.totalPurchase || 0, "toman")} خرید
 </p>
 </div>
 <Badge className={`text-[10px] h-5 ${tier.color}`}>{tier.label}</Badge>
 </div>
 <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
 <span>امتیاز</span>
 <span className="font-medium text-foreground tnum">
 {toPersianDigits(c.points.toLocaleString("en-US"))}
 </span>
 </div>
 <Progress value={pct} className="h-1.5" />
 </div>
 );
 })
 )}
 <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" onClick={handleLoyalty}>
 <Trophy className="h-3.5 w-3.5" />
 مدیریت باشگاه مشتریان
 </Button>
 </CardContent>
 </Card>

 {/* ============ Dialogs ============ */}
 {/* دیالوگ ایجاد مشتری */}
 <Dialog open={customerDialog} onOpenChange={setCustomerDialog}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <UserPlus className="h-4 w-4 text-primary" />
 مشتری جدید
 </DialogTitle>
 <DialogDescription>
 اطلاعات مشتری را وارد کنید تا در پایگاه‌داده طرف‌حساب‌ها ثبت شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-1">
 <div className="space-y-1.5">
 <Label className="text-xs">نام کامل *</Label>
 <Input
 value={customerForm.name}
 onChange={(e) => {
 setCustomerForm((f) => ({...f, name: e.target.value }));
 if (customerErrors.name) setCustomerErrors((p) => ({...p, name: "" }));
 }}
 onBlur={() => {
 if (!customerForm.name.trim())
 setCustomerErrors((p) => ({...p, name: "نام مشتری الزامی است" }));
 }}
 placeholder="نام مشتری یا شرکت"
 autoFocus
 className={customerErrors.name? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!customerErrors.name}
 />
 {customerErrors.name && (
 <p className="text-xs text-destructive mt-1">{customerErrors.name}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">شماره تماس</Label>
 <Input
 dir="ltr"
 inputMode="tel"
 value={customerForm.phone}
 onChange={(e) => {
 setCustomerForm((f) => ({...f, phone: e.target.value }));
 if (customerErrors.phone) setCustomerErrors((p) => ({...p, phone: "" }));
 }}
 placeholder="0912xxxxxxx"
 className={`text-start ${customerErrors.phone? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!customerErrors.phone}
 />
 {customerErrors.phone && (
 <p className="text-xs text-destructive mt-1">{customerErrors.phone}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">ایمیل</Label>
 <Input
 dir="ltr"
 type="email"
 value={customerForm.email}
 onChange={(e) => {
 setCustomerForm((f) => ({...f, email: e.target.value }));
 if (customerErrors.email) setCustomerErrors((p) => ({...p, email: "" }));
 }}
 placeholder="customer@example.com"
 className={`text-start ${customerErrors.email? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!customerErrors.email}
 />
 {customerErrors.email && (
 <p className="text-xs text-destructive mt-1">{customerErrors.email}</p>
 )}
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">شهر</Label>
 <Input
 value={customerForm.city}
 onChange={(e) => setCustomerForm((f) => ({...f, city: e.target.value }))}
 placeholder="تهران"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">صنعت</Label>
 <Input
 value={customerForm.industry}
 onChange={(e) => setCustomerForm((f) => ({...f, industry: e.target.value }))}
 placeholder="فروشگاهی"
 />
 </div>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setCustomerDialog(false)} disabled={submitting}>
 انصراف
 </Button>
 <Button
 onClick={submitCustomer}
 disabled={submitting ||!isCustomerFormValid}
 className="gap-1.5"
 >
 {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
 ثبت مشتری
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ فرصت جدید */}
 <Dialog open={dealDialog} onOpenChange={setDealDialog}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Target className="h-4 w-4 text-primary" />
 فرصت فروش جدید
 </DialogTitle>
 <DialogDescription>
 یک فرصت فروش در pipeline ایجاد کنید و آن را در مراحل مختلف پیگیری کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-1">
 <div className="space-y-1.5">
 <Label className="text-xs">عنوان فرصت *</Label>
 <Input
 value={dealForm.title}
 onChange={(e) => setDealForm((f) => ({...f, title: e.target.value }))}
 placeholder="مثلاً فروش پلن Business"
 autoFocus
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">مرحله</Label>
 <Select value={dealForm.stage} onValueChange={(v) => setDealForm((f) => ({...f, stage: v }))}>
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {PIPELINE_STAGES.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">مشتری (اختیاری)</Label>
 <Select value={dealForm.partyId} onValueChange={(v) => setDealForm((f) => ({...f, partyId: v }))}>
 <SelectTrigger className="h-9">
 <SelectValue placeholder="انتخاب مشتری" />
 </SelectTrigger>
 <SelectContent>
 {customers.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">ارزش (تومان)</Label>
 <Input
 dir="ltr"
 inputMode="numeric"
 value={dealForm.value}
 onChange={(e) =>
 // FIX(M3): ارقام فارسی/عربی قبل از حذف نویسه‌های غیرعددی به لاتین تبدیل می‌شوند
 setDealForm((f) => ({
 ...f,
 value: toEnglishDigits(e.target.value).replace(/[^\d]/g, ""),
 }))
 }
 placeholder="10000000"
 className="tnum"
 />
 <p className="text-[10px] text-muted-foreground">
 مبلغ به تومان — در پایگاه داده به ریال (×۱۰) ذخیره می‌شود.
 </p>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">احتمال موفقیت: {toPersianDigits(dealForm.probability)}٪</Label>
 <input
 type="range"
 min={0}
 max={100}
 step={5}
 value={dealForm.probability}
 onChange={(e) => setDealForm((f) => ({...f, probability: Number(e.target.value) }))}
 className="w-full h-9 accent-primary"
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">تاریخ بستن پیش‌بینی‌شده</Label>
 <Input
 dir="ltr"
 type="date"
 value={dealForm.expectedCloseDate}
 onChange={(e) => setDealForm((f) => ({...f, expectedCloseDate: e.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">توضیحات</Label>
 <Textarea
 value={dealForm.description}
 onChange={(e) => setDealForm((f) => ({...f, description: e.target.value }))}
 placeholder="توضیحات اختیاری..."
 rows={2}
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setDealDialog(false)} disabled={submitting}>
 انصراف
 </Button>
 <Button onClick={submitDeal} disabled={submitting} className="gap-1.5">
 {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
 ایجاد فرصت
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ فعالیت جدید */}
 <Dialog open={activityDialog} onOpenChange={setActivityDialog}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 ثبت فعالیت
 </DialogTitle>
 <DialogDescription>
 یک تماس، ایمیل، جلسه یا یادداشت برای مشتری ثبت کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-1">
 <div className="space-y-1.5">
 <Label className="text-xs">نوع فعالیت</Label>
 <div className="grid grid-cols-3 gap-1.5">
 {ACTIVITY_TYPES.map((t) => {
 const Icon = t.icon;
 return (
 <button
 key={t.id}
 type="button"
 onClick={() => setActivityForm((f) => ({...f, type: t.id }))}
 className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] transition-colors ${
 activityForm.type === t.id
? "border-primary bg-primary/5 text-primary"
: "border-border hover:bg-muted"
 }`}
 >
 <Icon className="h-3.5 w-3.5" />
 {t.label}
 </button>
 );
 })}
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">موضوع *</Label>
 <Input
 value={activityForm.subject}
 onChange={(e) => setActivityForm((f) => ({...f, subject: e.target.value }))}
 placeholder="موضوع فعالیت"
 autoFocus
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">مشتری (اختیاری)</Label>
 <Select value={activityForm.partyId} onValueChange={(v) => setActivityForm((f) => ({...f, partyId: v }))}>
 <SelectTrigger className="h-9">
 <SelectValue placeholder="انتخاب مشتری" />
 </SelectTrigger>
 <SelectContent>
 {customers.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">مدت زمان (دقیقه)</Label>
 <Input
 dir="ltr"
 inputMode="numeric"
 value={activityForm.duration}
 onChange={(e) => setActivityForm((f) => ({...f, duration: e.target.value }))}
 placeholder="15"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">نتیجه</Label>
 <Input
 value={activityForm.outcome}
 onChange={(e) => setActivityForm((f) => ({...f, outcome: e.target.value }))}
 placeholder="مثلاً پاسخ مثبت"
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">توضیحات</Label>
 <Textarea
 value={activityForm.description}
 onChange={(e) => setActivityForm((f) => ({...f, description: e.target.value }))}
 placeholder="جزئیات فعالیت..."
 rows={2}
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setActivityDialog(false)} disabled={submitting}>
 انصراف
 </Button>
 <Button onClick={submitActivity} disabled={submitting} className="gap-1.5">
 {submitting? <Loader2 className="h-4 w-4 animate-spin" />: <Plus className="h-4 w-4" />}
 ثبت فعالیت
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ پیگیری جدید (existing) */}
 <Dialog open={followUpDialog} onOpenChange={setFollowUpDialog}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Bell className="h-4 w-4 text-primary" />
 پیگیری جدید
 </DialogTitle>
 <DialogDescription>یک یادآور پیگیری برای مشتری یا سرنخ ثبت کنید.</DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-1">
 <div className="space-y-1.5">
 <Label className="text-xs">نام مشتری *</Label>
 <Input
 value={followUpForm.customer}
 onChange={(e) => {
 setFollowUpForm((f) => ({...f, customer: e.target.value }));
 if (followUpErrors.customer) setFollowUpErrors((p) => ({...p, customer: "" }));
 }}
 placeholder="نام مشتری"
 autoFocus
 className={followUpErrors.customer? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!followUpErrors.customer}
 />
 {followUpErrors.customer && (
 <p className="text-xs text-destructive mt-1">{followUpErrors.customer}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">نوع پیگیری</Label>
 <div className="flex rounded-lg border overflow-hidden">
 {(
 [
 { id: "call", label: "تماس" },
 { id: "email", label: "ایمیل" },
 { id: "meeting", label: "جلسه" },
 ] as const
 ).map((opt) => (
 <button
 key={opt.id}
 type="button"
 onClick={() => setFollowUpForm((f) => ({...f, type: opt.id }))}
 className={`flex-1 text-xs py-2 transition-colors ${
 followUpForm.type === opt.id? "bg-primary text-primary-foreground": "bg-background hover:bg-muted"
 }`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">موضوع *</Label>
 <Input
 value={followUpForm.subject}
 onChange={(e) => {
 setFollowUpForm((f) => ({...f, subject: e.target.value }));
 if (followUpErrors.subject) setFollowUpErrors((p) => ({...p, subject: "" }));
 }}
 placeholder="موضوع پیگیری"
 className={followUpErrors.subject? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!followUpErrors.subject}
 />
 {followUpErrors.subject && (
 <p className="text-xs text-destructive mt-1">{followUpErrors.subject}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">زمان</Label>
 <Input
 value={followUpForm.time}
 onChange={(e) => setFollowUpForm((f) => ({...f, time: e.target.value }))}
 placeholder="مثلاً ۱۴:۰۰"
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setFollowUpDialog(false)} disabled={submitting}>
 انصراف
 </Button>
 <Button onClick={submitFollowUp} disabled={submitting ||!isFollowUpFormValid} className="gap-1.5">
 {submitting? <Loader2 className="h-4 w-4 animate-spin" />: <Bell className="h-4 w-4" />}
 ثبت پیگیری
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ جزئیات مشتری */}
 <Dialog open={customerDetailDialog} onOpenChange={setCustomerDetailDialog}>
 <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Eye className="h-4 w-4 text-primary" />
 جزئیات مشتری
 </DialogTitle>
 <DialogDescription>
 نمای ۳۶۰ درجه از مشتری، فعالیت‌ها، فرصت‌ها و فاکتورها
 </DialogDescription>
 </DialogHeader>
 {customerDetail? (
 <div className="space-y-4 py-1">
 {/* header info */}
 <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Users className="h-5 w-5" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-bold">{customerDetail.name}</p>
 <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-muted-foreground">
 {customerDetail.mobile && <span dir="ltr">{customerDetail.mobile}</span>}
 {customerDetail.email && <span dir="ltr">{customerDetail.email}</span>}
 {customerDetail.city && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{customerDetail.city}</span>}
 {customerDetail.industry && <span className="flex items-center gap-0.5"><Briefcase className="h-2.5 w-2.5" />{customerDetail.industry}</span>}
 </div>
 </div>
 </div>

 {/* lifecycle + score */}
 <div className="grid grid-cols-2 gap-3">
 <div className="rounded-lg border border-border/60 p-3">
 <p className="text-xs text-muted-foreground mb-2">چرخه حیات</p>
 <Select
 value={customerDetail.lifecycleStage}
 onValueChange={(v) => {
 updateLifecycle(customerDetail.id, v);
 setCustomerDetail((d) => d? {...d, lifecycleStage: v }: d);
 }}
 >
 <SelectTrigger className="h-8 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {LIFECYCLE_STAGES.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="rounded-lg border border-border/60 p-3">
 <p className="text-xs text-muted-foreground mb-2">امتیاز سرنخ</p>
 <div className="flex items-center gap-2">
 <Progress value={customerDetail.leadScore} className="h-2 flex-1" />
 <span className="text-sm font-bold tnum">{toPersianDigits(customerDetail.leadScore)}</span>
 </div>
 </div>
 </div>

 {/* metrics */}
 <div className="grid grid-cols-4 gap-2">
 <MetricBox label="درآمد کل" value={formatPriceCompact(customerDetail.metrics.totalRevenue || 0, "toman")} />
 <MetricBox label="فاکتورها" value={toPersianDigits(customerDetail.metrics.invoiceCount)} />
 <MetricBox label="فرصت‌ها" value={toPersianDigits(customerDetail.metrics.dealCount)} />
 <MetricBox label="باز" value={toPersianDigits(customerDetail.metrics.openDealCount)} />
 </div>

 {/* activities timeline */}
 <div className="rounded-lg border border-border/60 p-3">
 <div className="flex items-center justify-between mb-2">
 <p className="text-xs font-semibold flex items-center gap-1">
 <Activity className="h-3.5 w-3.5 text-primary" />
 فعالیت‌ها ({toPersianDigits(customerDetail.activities.length)})
 </p>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 text-[11px] gap-1"
 onClick={() => openActivityDialog(customerDetail.id)}
 >
 <Plus className="h-3 w-3" />
 افزودن
 </Button>
 </div>
 {customerDetail.activities.length === 0? (
 <p className="text-[11px] text-muted-foreground py-3 text-center">فعالیتی ثبت نشده</p>
 ): (
 <div className="relative space-y-2 pr-2 max-h-48 overflow-y-auto">
 <div className="absolute right-1 top-1 bottom-1 w-px bg-border" />
 {customerDetail.activities.slice(0, 8).map((a) => {
 const meta = ACTIVITY_TYPES.find((t) => t.id === a.type) || ACTIVITY_TYPES[3];
 const Icon = meta.icon;
 return (
 <div key={a.id} className="relative flex items-start gap-2">
 <div className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full ${meta.color} ring-2 ring-background`}>
 <Icon className="h-2.5 w-2.5" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-[11px] font-medium truncate">{a.subject}</p>
 <p className="text-[10px] text-muted-foreground">
 {formatJalaliShort(a.createdAt)}
 </p>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>

 {/* deals */}
 {customerDetail.deals.length > 0 && (
 <div className="rounded-lg border border-border/60 p-3">
 <p className="text-xs font-semibold flex items-center gap-1 mb-2">
 <Target className="h-3.5 w-3.5 text-primary" />
 فرصت‌های فروش
 </p>
 <div className="space-y-1.5 max-h-32 overflow-y-auto">
 {customerDetail.deals.map((d) => {
 const stage = PIPELINE_STAGES.find((s) => s.id === d.stage);
 return (
 <div key={d.id} className="flex items-center gap-2 text-[11px]">
 <span className="flex-1 truncate font-medium">{d.title}</span>
 <Badge variant="secondary" className={`text-[9px] h-4 ${stage?.accent || ""}`}>
 {stage?.label || d.stage}
 </Badge>
 <span className="text-muted-foreground tnum">{formatPriceCompact(d.value, "toman")}</span>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* recent invoices */}
 {customerDetail.invoices.length > 0 && (
 <div className="rounded-lg border border-border/60 p-3">
 <p className="text-xs font-semibold flex items-center gap-1 mb-2">
 <BarChart3 className="h-3.5 w-3.5 text-primary" />
 فاکتورهای اخیر
 </p>
 <div className="space-y-1.5 max-h-32 overflow-y-auto">
 {customerDetail.invoices.slice(0, 6).map((inv) => (
 <div key={inv.id} className="flex items-center gap-2 text-[11px]">
 <span className="font-mono text-muted-foreground">{inv.number}</span>
 <span className="flex-1 text-muted-foreground">{formatJalaliShort(inv.date)}</span>
 <span className="font-medium tnum">{formatPriceCompact(inv.total, "toman")}</span>
 <Badge variant="secondary" className="text-[9px] h-4">{inv.status}</Badge>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 ): (
 <div className="flex items-center justify-center py-8">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 </div>
 )}
 <DialogFooter>
 <Button variant="outline" onClick={() => setCustomerDetailDialog(false)}>بستن</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ پیامک گروهی */}
 <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Send className="h-4 w-4 text-primary" />
 پیامک گروهی به مشتریان
 </DialogTitle>
 <DialogDescription>
 ارسال پیامک به همه مشتریان یا تأمین‌کنندگان دارای شماره موبایل.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs">گروه گیرندگان</Label>
 <Select
 value={smsSegment}
 onValueChange={(v) => setSmsSegment(v as "all" | "customers" | "suppliers")}
 >
 <SelectTrigger className="h-9">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="customers">همه مشتریان</SelectItem>
 <SelectItem value="suppliers">همه تأمین‌کنندگان</SelectItem>
 <SelectItem value="all">همه طرف‌حساب‌ها</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">متن پیامک *</Label>
 <Textarea
 placeholder="متن پیامک خود را وارد کنید..."
 value={smsMessage}
 onChange={(e) => setSmsMessage(e.target.value)}
 rows={4}
 maxLength={480}
 className="resize-none"
 />
 <p className="text-[10px] text-muted-foreground text-end">
 {toPersianDigits(smsMessage.length)} / {toPersianDigits(480)}
 </p>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setSmsDialogOpen(false)}>
 انصراف
 </Button>
 <Button onClick={handleSendBulkSms} disabled={smsSending ||!smsMessage.trim()}>
 {smsSending? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ارسال...
 </>
 ): (
 <>
 <Send className="h-4 w-4" />
 ارسال پیامک
 </>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ گزارش فروش */}
 <Dialog open={salesReportOpen} onOpenChange={setSalesReportOpen}>
 <DialogContent className="max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col">
 <DialogHeader className="shrink-0">
 <DialogTitle className="flex items-center gap-2">
 <BarChart3 className="h-4 w-4 text-primary" />
 گزارش فروش
 </DialogTitle>
 <DialogDescription>
 گزارش جامع فروش بر اساس معیار انتخاب‌شده — از ابتدای سال تا امروز.
 </DialogDescription>
 </DialogHeader>

 <div className="shrink-0 flex items-center gap-2 pb-2 border-b border-border/40">
 <span className="text-xs text-muted-foreground">دسته‌بندی بر اساس:</span>
 {(["customer", "product", "month"] as const).map((g) => (
 <Button
 key={g}
 size="sm"
 variant={salesReportGroupBy === g? "default": "outline"}
 className="h-7 text-xs"
 onClick={() => {
 setSalesReportGroupBy(g);
 setTimeout(handleSalesReport, 0);
 }}
 >
 {g === "customer"? "مشتری": g === "product"? "محصول": "ماه"}
 </Button>
 ))}
 </div>

 <div className="flex-1 overflow-y-auto p-1">
 {salesReportLoading? (
 <div className="flex flex-col items-center justify-center py-16 gap-3">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">در حال محاسبه‌ی گزارش...</p>
 </div>
 ): salesReportData? (
 <SalesReportView data={salesReportData} groupBy={salesReportGroupBy} />
 ): null}
 </div>

 <DialogFooter className="shrink-0 border-t border-border/40 pt-3">
 <Button variant="outline" onClick={() => setSalesReportOpen(false)}>بستن</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

/**
 * SalesReportView — نمایش گزارش فروش CRM
 */
function SalesReportView({
 data,
 groupBy,
}: {
 data: unknown;
 groupBy: "customer" | "product" | "month";
}) {
 
 const d = data as Record<string, any>;
 const summary = d.summary || {};
 const groups = (d.groups || []) as Array<{
 key: string;
 label: string;
 invoiceCount: number;
 totalRevenue: number;
 totalPaid: number;
 outstanding: number;
 }>;

 return (
 <div className="space-y-4">
 {/* کارت‌های خلاصه */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <Card className="p-3">
 <p className="text-xs text-muted-foreground">تعداد فاکتورها</p>
 <p className="text-lg font-bold tnum">{toPersianDigits(summary.totalInvoices || 0)}</p>
 </Card>
 <Card className="p-3">
 <p className="text-xs text-muted-foreground">درآمد کل</p>
 <p className="text-lg font-bold tnum text-success">{formatPriceCompact(summary.totalRevenue || 0, "toman")}</p>
 </Card>
 <Card className="p-3">
 <p className="text-xs text-muted-foreground">وصول شده</p>
 <p className="text-lg font-bold tnum">{formatPriceCompact(summary.totalPaid || 0, "toman")}</p>
 </Card>
 <Card className="p-3">
 <p className="text-xs text-muted-foreground">نرخ وصول</p>
 <p className="text-lg font-bold tnum text-primary">
 {toPersianDigits(summary.collectionRate || 0)}٪
 </p>
 </Card>
 </div>

 {/* جدول تفصیلی */}
 {groups.length === 0? (
 <EmptyState
 icon={BarChart3}
 title="داده‌ای برای نمایش وجود ندارد"
 description="هنوز فاکتور فروشی در این بازه ثبت نشده است."
 />
 ): (
 <div className="overflow-hidden rounded-lg border border-border/60">
 <table className="w-full text-sm">
 <thead className="bg-muted/40 sticky top-0">
 <tr className="text-muted-foreground">
 <th className="text-start p-2 font-medium">
 {groupBy === "customer"? "نام مشتری": groupBy === "product"? "نام محصول": "ماه"}
 </th>
 <th className="text-end p-2 font-medium">تعداد فاکتور</th>
 <th className="text-end p-2 font-medium">درآمد</th>
 <th className="text-end p-2 font-medium">وصول شده</th>
 <th className="text-end p-2 font-medium">معوق</th>
 </tr>
 </thead>
 <tbody>
 {groups.map((g, i) => (
 <tr
 key={`${g.key}-${i}`}
 className="border-t border-border/40 hover:bg-muted/20"
 >
 <td className="p-2 font-medium">{g.label}</td>
 <td className="p-2 text-end tnum">{toPersianDigits(g.invoiceCount)}</td>
 <td className="p-2 text-end tnum text-success">{formatPriceCompact(g.totalRevenue, "toman")}</td>
 <td className="p-2 text-end tnum">{formatPriceCompact(g.totalPaid, "toman")}</td>
 <td className={`p-2 text-end tnum ${g.outstanding > 0? "text-warning": "text-muted-foreground"}`}>
 {formatPriceCompact(g.outstanding, "toman")}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 );
}
function PipelineColumn({
 stage,
 onMove,
 onAddDeal,
 onViewCustomer,
}: {
 stage: PipelineStage;
 onMove: (dealId: string, stage: string) => void;
 onAddDeal: (stageId: string) => void;
 onViewCustomer: (partyId: string) => void;
}) {
 const [dragOver, setDragOver] = React.useState(false);
 const [draggingId, setDraggingId] = React.useState<string | null>(null);

 return (
 <div
 className={`flex w-72 shrink-0 flex-col rounded-lg border ${stage.border} ${stage.color} ${dragOver? "ring-2 ring-primary/40": ""}`}
 onDragOver={(e) => {
 e.preventDefault();
 if (!dragOver) setDragOver(true);
 }}
 onDragLeave={() => setDragOver(false)}
 onDrop={(e) => {
 e.preventDefault();
 setDragOver(false);
 const dealId = e.dataTransfer.getData("text/dealId");
 if (dealId) onMove(dealId, stage.id);
 }}
 >
 {/* header */}
 <div className="flex items-center justify-between p-2.5 border-b border-border/40 gradient-card-header">
 <div className="flex items-center gap-1.5 min-w-0">
 <span className={`h-2 w-2 rounded-full shrink-0 ${stage.accent.startsWith("text-")? stage.accent.replace("text-", "bg-"): "bg-muted-foreground"}`} />
 <span className="text-xs font-semibold truncate">{stage.label}</span>
 </div>
 <Badge variant="secondary" className={`text-[10px] h-5 ${stage.accent}`}>
 {toPersianDigits(stage.count)}
 </Badge>
 </div>

 {/* total value */}
 <div className="px-2.5 py-1.5 border-b border-border/40">
 <p className="text-[10px] text-muted-foreground">ارزش کل</p>
 <p className="text-xs font-bold tnum">
 {stage.totalValue > 0? formatPriceCompact(stage.totalValue, "toman"): "—"}
 </p>
 </div>

 {/* cards */}
 <div className="flex-1 p-1.5 space-y-1.5 min-h-[120px] max-h-[500px] overflow-y-auto">
 {stage.deals.length === 0? (
 <div className="text-center py-4 text-[10px] text-muted-foreground">خالی</div>
 ): (
 stage.deals.map((deal) => {
 const tier = leadScoreTier(deal.leadScore);
 const TierIcon = tier.icon;
 const valueTier = dealValueTier(deal.value);
 return (
 <div
 key={deal.id}
 draggable
 onDragStart={(e) => {
 setDraggingId(deal.id);
 e.dataTransfer.setData("text/dealId", deal.id);
 e.dataTransfer.effectAllowed = "move";
 }}
 onDragEnd={() => setDraggingId(null)}
 onClick={() => deal.partyId && onViewCustomer(deal.partyId)}
 className={`kanban-card group rounded-md bg-card border border-border/60 p-2 cursor-grab active:cursor-grabbing hover:border-primary/40 ${draggingId === deal.id? "opacity-50": ""}`}
 title="برای جابجایی درگ کنید"
 >
 <div className="flex items-start gap-1">
 <GripVertical className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0 group-hover:text-muted-foreground" />
 <div className="flex-1 min-w-0">
 <p className="text-[11px] font-medium leading-snug line-clamp-2">{deal.title}</p>
 {deal.partyName && (
 <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{deal.partyName}</p>
 )}
 <div className="flex items-center gap-1 mt-1.5 flex-wrap">
 <span className="text-[10px] font-bold tnum text-foreground">
 {formatPriceCompact(deal.value, "toman")}
 </span>
 <Badge className={`text-[9px] h-4 gap-0.5 px-1 ${valueTier.color}`} title={valueTier.label}>
 {valueTier.icon && <valueTier.icon className="h-2 w-2" />}
 {valueTier.label}
 </Badge>
 {deal.leadScore > 0 && (
 <Badge className={`text-[9px] h-4 gap-0.5 px-1 ${tier.color}`}>
 <TierIcon className="h-2 w-2" />
 {toPersianDigits(deal.leadScore)}
 </Badge>
 )}
 {deal.expectedCloseDate && (
 <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
 <Calendar className="h-2 w-2" />
 {formatJalaliShort(deal.expectedCloseDate)}
 </span>
 )}
 </div>
 {deal.probability > 0 && (
 <div className="mt-1">
 <Progress value={deal.probability} className="h-0.5" />
 </div>
 )}
 </div>
 </div>
 </div>
 );
 })
 )}
 </div>

 {/* add button */}
 <button
 type="button"
 onClick={() => onAddDeal(stage.id)}
 className="flex items-center justify-center gap-1 p-1.5 text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/5 border-t border-border/40 transition-colors"
 >
 <Plus className="h-3 w-3" />
 افزودن فرصت
 </button>
 </div>
 );
}

// ============ MetricBox ============
function MetricBox({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-lg border border-border/60 p-2 text-center">
 <p className="text-[10px] text-muted-foreground">{label}</p>
 <p className="text-sm font-bold tnum mt-0.5">{value}</p>
 </div>
 );
}

// ============ StatCard ============
function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 color,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 color: string;
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-4 flex items-center gap-3">
 <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="font-bold text-base truncate tnum">{value}</p>
 <p className="text-[10px] text-muted-foreground">{sub}</p>
 </div>
 </CardContent>
 </Card>
 );
}
