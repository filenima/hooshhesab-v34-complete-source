"use client";

/**
 * InvoiceAgingModule — سن فاکتور و مدیریت ریسک اعتباری
 *
 * قابلیت‌ها:
 * - تحلیل سن مطالبات و بدهی‌ها در بازه‌های ۰-۳۰، ۳۱-۶۰، ۶۱-۹۰، +۹۰ روز
 * - رتبه‌بندی اعتباری طرف‌حساب‌ها بر اساس سابقه پرداخت
 * - شناسایی طرف‌حساب‌های پرریسک و مطالبات معوق
 * - نمودار توزیع سن مطالبات
 * - اقدامات وصول: یادآور، تماس، ارسال اخطار
 * - گزارش کامل قابل چاپ
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 AlertTriangle,
 Clock,
 TrendingDown,
 Users,
 Phone,
 Mail,
 FileText,
 Filter,
 Download,
 RefreshCw,
 Loader2,
 ArrowLeft,
 CheckCircle2,
 XCircle,
 AlertCircle,
 ShieldAlert,
 type LucideIcon,
} from "lucide-react";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from "@/components/ui/tooltip";
import {
 Tabs,
 TabsContent,
 TabsList,
 TabsTrigger,
} from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ux/empty-state";
import { formatNumber, toPersianDigits, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

// ─── Types ────────────────────────────────────────────────────────────────

interface AgingBucket {
 range: string;
 rangeKey: "current" | "d30" | "d60" | "d90";
 count: number;
 amount: number;
 color: string;
 bgClass: string;
 textClass: string;
}

interface PartyAging {
 partyId: string;
 partyName: string;
 partyType: "CUSTOMER" | "VENDOR";
 totalReceivable: number;
 totalPayable: number;
 buckets: {
 current: number;
 d30: number;
 d60: number;
 d90: number;
 };
 overdueDays: number;
 creditScore: number; // 0-100
 creditRating: "A" | "B" | "C" | "D";
 lastPaymentDate: string | null;
 contactPhone: string | null;
 contactEmail: string | null;
 riskLevel: "low" | "medium" | "high" | "critical";
}

interface ActionLog {
 id: string;
 partyId: string;
 partyName: string;
 action: "REMINDER" | "CALL" | "NOTICE" | "ESCALATE";
 date: string;
 note: string;
 by: string;
}

// ─── Aging bucket config ──────────────────────────────────────────────────

const AGING_BUCKETS: AgingBucket[] = [
 {
 range: "۰ تا ۳۰ روز",
 rangeKey: "current",
 count: 0,
 amount: 0,
 color: "#10b981",
 bgClass: "bg-emerald-500",
 textClass: "text-emerald-700 dark:text-emerald-300",
 },
 {
 range: "۳۱ تا ۶۰ روز",
 rangeKey: "d30",
 count: 0,
 amount: 0,
 color: "#f59e0b",
 bgClass: "bg-amber-500",
 textClass: "text-amber-700 dark:text-amber-300",
 },
 {
 range: "۶۱ تا ۹۰ روز",
 rangeKey: "d60",
 count: 0,
 amount: 0,
 color: "#f97316",
 bgClass: "bg-orange-500",
 textClass: "text-orange-700 dark:text-orange-300",
 },
 {
 range: "بیش از ۹۰ روز",
 rangeKey: "d90",
 count: 0,
 amount: 0,
 color: "#ef4444",
 bgClass: "bg-rose-500",
 textClass: "text-rose-700 dark:text-rose-300",
 },
];

// ─── Credit rating config ─────────────────────────────────────────────────

const CREDIT_RATING_CONFIG = {
 A: {
 label: "عالی",
 color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
 description: "پرداخت به‌موقع، ریسک بسیار پایین",
 },
 B: {
 label: "خوب",
 color: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
 description: "تأخیر کم، ریسک پایین",
 },
 C: {
 label: "متوسط",
 color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
 description: "تأخیر گاه‌گاهی، ریسک متوسط",
 },
 D: {
 label: "ضعیف",
 color: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
 description: "تأخیر مکرر، ریسک بالا",
 },
} as const;

const RISK_CONFIG = {
 low: { label: "کم", color: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
 medium: { label: "متوسط", color: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
 high: { label: "بالا", color: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" },
 critical: { label: "بحرانی", color: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────

const TOMAN = (n: number) => `${toPersianDigits(formatNumber(Math.round(n)))} تومان`;

const computeCreditScore = (
 buckets: PartyAging["buckets"],
 overdueDays: number
): { score: number; rating: PartyAging["creditRating"]; risk: PartyAging["riskLevel"] } => {
 const total = buckets.current + buckets.d30 + buckets.d60 + buckets.d90;
 if (total === 0) return { score: 100, rating: "A", risk: "low" };

 // وزن‌دهی: overdue بیشتر = امتیاز کمتر
 const weighted =
 (buckets.current * 1 + buckets.d30 * 0.7 + buckets.d60 * 0.4 + buckets.d90 * 0.1) / total;
 let score = Math.round(weighted * 100);

 // جریمه تأخیر
 if (overdueDays > 90) score -= 30;
 else if (overdueDays > 60) score -= 20;
 else if (overdueDays > 30) score -= 10;

 score = Math.max(0, Math.min(100, score));

 let rating: PartyAging["creditRating"] = "A";
 let risk: PartyAging["riskLevel"] = "low";

 if (score >= 85) {
 rating = "A";
 risk = "low";
 } else if (score >= 70) {
 rating = "B";
 risk = "low";
 } else if (score >= 50) {
 rating = "C";
 risk = "medium";
 } else if (score >= 30) {
 rating = "C";
 risk = "high";
 } else {
 rating = "D";
 risk = "critical";
 }

 return { score, rating, risk };
};

const buildMockParties = (): PartyAging[] => {
 // در محیط واقعی این از API /api/accounting/aging دریافت می‌شود
 const now = Date.now();
 const day = 86400000;
 const seed: Array<Partial<PartyAging> & { partyName: string }> = [
 { partyName: "فروشگاه آرمان", partyType: "CUSTOMER", buckets: { current: 45_000_000, d30: 12_000_000, d60: 0, d90: 0 }, overdueDays: 18, contactPhone: "021-88123456", contactEmail: "arman@example.com", lastPaymentDate: new Date(now - 5 * day).toISOString() },
 { partyName: "تولیدی پارس پلاستیک", partyType: "CUSTOMER", buckets: { current: 8_000_000, d30: 22_000_000, d60: 15_000_000, d90: 0 }, overdueDays: 52, contactPhone: "021-44556677", contactEmail: "pars@example.com", lastPaymentDate: new Date(now - 45 * day).toISOString() },
 { partyName: "بازرگانی کارین", partyType: "CUSTOMER", buckets: { current: 0, d30: 0, d60: 18_000_000, d90: 30_000_000 }, overdueDays: 105, contactPhone: "026-3334455", contactEmail: "karin@example.com", lastPaymentDate: new Date(now - 110 * day).toISOString() },
 { partyName: "شرکت فناوریان نوین", partyType: "CUSTOMER", buckets: { current: 32_000_000, d30: 5_000_000, d60: 0, d90: 0 }, overdueDays: 22, contactPhone: "021-22334455", contactEmail: "novin@example.com", lastPaymentDate: new Date(now - 8 * day).toISOString() },
 { partyName: "پخش هیراد", partyType: "CUSTOMER", buckets: { current: 60_000_000, d30: 0, d60: 0, d90: 0 }, overdueDays: 0, contactPhone: "051-3889911", contactEmail: "hirad@example.com", lastPaymentDate: new Date(now - 2 * day).toISOString() },
 { partyName: "صنعتی آریا", partyType: "CUSTOMER", buckets: { current: 0, d30: 14_000_000, d60: 8_000_000, d90: 6_000_000 }, overdueDays: 78, contactPhone: "031-44225566", contactEmail: "aria@example.com", lastPaymentDate: new Date(now - 80 * day).toISOString() },
 { partyName: "تأمین‌کننده مواد جنوبی", partyType: "VENDOR", buckets: { current: 0, d30: 0, d60: 0, d90: 0 }, overdueDays: 0, contactPhone: null, contactEmail: null, lastPaymentDate: new Date(now - 1 * day).toISOString() },
 { partyName: "شرکت پخش ایران", partyType: "VENDOR", buckets: { current: 25_000_000, d30: 0, d60: 0, d90: 0 }, overdueDays: 0, contactPhone: "021-66778899", contactEmail: "pakhsh@example.com", lastPaymentDate: new Date(now - 3 * day).toISOString() },
 ];

 return seed.map((p, i) => {
 const totalReceivable =
 (p.buckets?.current || 0) + (p.buckets?.d30 || 0) + (p.buckets?.d60 || 0) + (p.buckets?.d90 || 0);
 const totalPayable = p.partyType === "VENDOR"? p.buckets?.current || 0: 0;
 const { score, rating, risk } = computeCreditScore(
 p.buckets as PartyAging["buckets"],
 p.overdueDays || 0
 );
 return {
 partyId: `party-${i + 1}`,
 partyName: p.partyName,
 partyType: p.partyType as "CUSTOMER" | "VENDOR",
 totalReceivable: p.partyType === "CUSTOMER"? totalReceivable: 0,
 totalPayable,
 buckets: p.buckets as PartyAging["buckets"],
 overdueDays: p.overdueDays || 0,
 creditScore: score,
 creditRating: rating,
 lastPaymentDate: p.lastPaymentDate || null,
 contactPhone: p.contactPhone || null,
 contactEmail: p.contactEmail || null,
 riskLevel: risk,
 };
 });
};

// ─── StatCard component ────────────────────────────────────────────────────

function StatCard({
 icon: Icon,
 label,
 value,
 sublabel,
 color,
 delay = 0,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sublabel?: string;
 color: string;
 delay?: number;
}) {
 return (
 <motion.div
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.4, delay }}
 >
 <Card className="relative overflow-hidden border-border/60 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
 <div className={`absolute inset-y-0 right-0 w-1 ${color}`} />
 <CardContent className="p-4 sm:p-5">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
 <p className="mt-1 text-lg sm:text-xl font-bold text-foreground tracking-tight">
 {value}
 </p>
 {sublabel && (
 <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{sublabel}</p>
 )}
 </div>
 <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color.replace("bg-", "bg-").replace("-500", "-500/10")} shrink-0`}>
 <Icon className={`h-5 w-5 ${color.replace("bg-", "text-").replace("-500", "-600 dark:-300")}`} />
 </div>
 </div>
 </CardContent>
 </Card>
 </motion.div>
 );
}

// ─── AgingBarChart (custom SVG) ────────────────────────────────────────────

function AgingBarChart({ parties }: { parties: PartyAging[] }) {
 const totals = React.useMemo(() => {
 return AGING_BUCKETS.map((bucket) => {
 const sum = parties.reduce(
 (acc, p) => acc + (p.buckets[bucket.rangeKey] || 0),
 0
 );
 const count = parties.filter((p) => p.buckets[bucket.rangeKey] > 0).length;
 return {...bucket, amount: sum, count };
 });
 }, [parties]);

 const maxAmount = Math.max(...totals.map((t) => t.amount), 1);
 const grandTotal = totals.reduce((acc, t) => acc + t.amount, 0);

 return (
 <Card className="border-border/60">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between gap-2">
 <div>
 <CardTitle className="text-base flex items-center gap-2">
 <TrendingDown className="h-4 w-4 text-primary" />
 توزیع سن مطالبات
 </CardTitle>
 <CardDescription className="mt-1 text-xs">
 مجموع: {TOMAN(grandTotal)}
 </CardDescription>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 {totals.map((bucket, i) => {
 const pct = grandTotal > 0? (bucket.amount / grandTotal) * 100: 0;
 const barPct = (bucket.amount / maxAmount) * 100;
 return (
 <motion.div
 key={bucket.rangeKey}
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: 0.1 * i, duration: 0.4 }}
 className="space-y-1.5"
 >
 <div className="flex items-center justify-between text-xs">
 <div className="flex items-center gap-2">
 <span className={`inline-block h-2.5 w-2.5 rounded-sm ${bucket.bgClass}`} />
 <span className="font-medium text-foreground">{bucket.range}</span>
 <Badge variant="outline" className="h-5 text-[10px] px-1.5">
 {toPersianDigits(bucket.count)} طرف‌حساب
 </Badge>
 </div>
 <div className="flex items-center gap-2">
 <span className={`font-semibold ${bucket.textClass}`}>{TOMAN(bucket.amount)}</span>
 <span className="text-muted-foreground text-[10px]">
 ({toPersianDigits(pct.toFixed(1))}٪)
 </span>
 </div>
 </div>
 <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
 <motion.div
 className={`h-full ${bucket.bgClass} rounded-full`}
 initial={{ width: 0 }}
 animate={{ width: `${barPct}%` }}
 transition={{ delay: 0.2 + 0.1 * i, duration: 0.6, ease: "easeOut" }}
 />
 </div>
 </motion.div>
 );
 })}
 </CardContent>
 </Card>
 );
}

// ─── ActionDialog ──────────────────────────────────────────────────────────

interface ActionDialogProps {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 party: PartyAging | null;
 onSubmit: (action: ActionLog["action"], note: string) => void;
}

function ActionDialog({ open, onOpenChange, party, onSubmit }: ActionDialogProps) {
 const [action, setAction] = React.useState<ActionLog["action"]>("REMINDER");
 const [note, setNote] = React.useState("");

 React.useEffect(() => {
 if (open) {
 setAction("REMINDER");
 setNote("");
 }
 }, [open, party]);

 if (!party) return null;

 const handleSubmit = () => {
 if (!note.trim()) return;
 onSubmit(action, note.trim());
 onOpenChange(false);
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <AlertCircle className=" h-5 w-5 text-primary" />
 ثبت اقدام وصول
 </DialogTitle>
 <DialogDescription>
 برای طرف‌حساب «{party.partyName}» اقدام ثبت کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-4 py-2">
 <div className="space-y-1.5">
 <Label className="text-xs">نوع اقدام</Label>
 <Select value={action} onValueChange={(v) => setAction(v as ActionLog["action"])}>
 <SelectTrigger className="h-10">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="REMINDER">یادآور پرداخت</SelectItem>
 <SelectItem value="CALL">تماس تلفنی</SelectItem>
 <SelectItem value="NOTICE">ارسال اخطار رسمی</SelectItem>
 <SelectItem value="ESCALATE">ارجاع به مراجع قانونی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">توضیحات</Label>
 <Textarea
 value={note}
 onChange={(e) => setNote(e.target.value)}
 placeholder="مثال: با آقای رضایی تماس گرفته شد، قول پرداخت ظرف ۷ روز..."
 className="min-h-20 resize-none text-sm"
 />
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)}>
 انصراف
 </Button>
 <Button onClick={handleSubmit} disabled={!note.trim()}>
 ثبت اقدام
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

// ─── Main module ───────────────────────────────────────────────────────────

export function InvoiceAgingModule() {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(true);
 const [parties, setParties] = React.useState<PartyAging[]>([]);
 const [actionLogs, setActionLogs] = React.useState<ActionLog[]>([]);
 const [isMockData, setIsMockData] = React.useState(false);
 const [search, setSearch] = React.useState("");
 const [partyTypeFilter, setPartyTypeFilter] = React.useState<"ALL" | "CUSTOMER" | "VENDOR">("ALL");
 const [riskFilter, setRiskFilter] = React.useState<"ALL" | PartyAging["riskLevel"]>("ALL");
 const [actionDialogOpen, setActionDialogOpen] = React.useState(false);
 const [selectedParty, setSelectedParty] = React.useState<PartyAging | null>(null);
 const [logsDialogOpen, setLogsDialogOpen] = React.useState(false);
 const [logsForParty, setLogsForParty] = React.useState<PartyAging | null>(null);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 // تلاش برای دریافت از API
 const token = typeof window!== "undefined"
? localStorage.getItem("hoshhesab_user_token")
: null;

 let data: PartyAging[] = [];
 let logs: ActionLog[] = [];

 try {
 const res = await authFetch("/api/accounting/aging");
 if (res.ok) {
 const json = await res.json();
 data = (json.parties || []) as PartyAging[];
 logs = (json.actionLogs || []) as ActionLog[];
 setIsMockData(false);
 } else {
 // Fallback به داده نمونه
 data = buildMockParties();
 setIsMockData(true);
 }
 } catch {
 // Fallback به داده نمونه
 data = buildMockParties();
 setIsMockData(true);
 }

 setParties(data);
 setActionLogs(logs);
 if (data.length > 0 && (data[0].partyId || "").startsWith("party-")) {
 toast({
 title: "نمایش داده‌ی نمونه",
 description: "داده‌های واقعی در دسترس نیست — اطلاعات نمایش‌داده‌شده نمونه است.",
 variant: "default",
 });
 }
 } catch (err) {
 toast({
 title: "خطا در بارگذاری",
 description: "دریافت داده‌های سن مطالبات ناموفق بود.",
 variant: "destructive",
 });
 setParties(buildMockParties());
 setIsMockData(true);
 } finally {
 setLoading(false);
 }
 }, [toast]);

 React.useEffect(() => {
 fetchData();
 }, [fetchData]);

 const filteredParties = React.useMemo(() => {
 return parties.filter((p) => {
 if (search &&!p.partyName.toLowerCase().includes(search.toLowerCase())) return false;
 if (partyTypeFilter!== "ALL" && p.partyType!== partyTypeFilter) return false;
 if (riskFilter!== "ALL" && p.riskLevel!== riskFilter) return false;
 return true;
 });
 }, [parties, search, partyTypeFilter, riskFilter]);

 const stats = React.useMemo(() => {
 const totalReceivable = parties
.filter((p) => p.partyType === "CUSTOMER")
.reduce((acc, p) => acc + p.totalReceivable, 0);
 const overdue30 = parties.reduce((acc, p) => acc + p.buckets.d30, 0);
 const overdue60 = parties.reduce((acc, p) => acc + p.buckets.d60 + p.buckets.d90, 0);
 const criticalParties = parties.filter((p) => p.riskLevel === "critical").length;
 return { totalReceivable, overdue30, overdue60, criticalParties };
 }, [parties]);

 const handleOpenAction = (party: PartyAging) => {
 setSelectedParty(party);
 setActionDialogOpen(true);
 };

 const handleSubmitAction = (action: ActionLog["action"], note: string) => {
 if (!selectedParty) return;
 const newLog: ActionLog = {
 id: `log-${Date.now()}`,
 partyId: selectedParty.partyId,
 partyName: selectedParty.partyName,
 action,
 date: new Date().toISOString(),
 note,
 by: "کاربر فعلی",
 };
 setActionLogs((prev) => [newLog,...prev]);
 toast({
 title: "اقدام ثبت شد",
 description: `اقدام «${actionLabel(action)}» برای ${selectedParty.partyName} ثبت شد.`,
 });
 };

 const handleViewLogs = (party: PartyAging) => {
 setLogsForParty(party);
 setLogsDialogOpen(true);
 };

 const handleExport = () => {
 const csv = [
 ["نام طرف‌حساب", "نوع", "جاری", "۳۰-۳۱", "۶۰-۶۱", "+۹۰", "کل مطالبات", "روز تأخیر", "امتیاز", "رتبه", "ریسک"].join(","),
...filteredParties.map((p) =>
 [
 p.partyName,
 p.partyType === "CUSTOMER"? "مشتری": "تأمین‌کننده",
 p.buckets.current,
 p.buckets.d30,
 p.buckets.d60,
 p.buckets.d90,
 p.totalReceivable,
 p.overdueDays,
 p.creditScore,
 p.creditRating,
 RISK_CONFIG[p.riskLevel].label,
 ].join(",")
 ),
 ].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `aging-report-${new Date().toISOString().slice(0, 10)}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast({ title: "گزارش صادر شد", description: "فایل CSV دانلود شد." });
 };

 const partyLogs = logsForParty
? actionLogs.filter((l) => l.partyId === logsForParty.partyId)
: [];

 return (
 <div className="space-y-5">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
 <Clock className="h-5 w-5 text-primary" />
 سن فاکتور و مدیریت ریسک اعتباری
 {isMockData && (
 <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700">
 داده نمونه
 </Badge>
 )}
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 تحلیل مطالبات معوق، رتبه‌بندی اعتباری طرف‌حساب‌ها و مدیریت وصول
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" onClick={handleExport} disabled={!filteredParties.length}>
 <Download className="h-4 w-4 ml-1.5" />
 خروجی CSV
 </Button>
 <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
 <RefreshCw className={`h-4 w-4 ml-1.5 ${loading? "animate-spin": ""}`} />
 به‌روزرسانی
 </Button>
 </div>
 </div>

 {/* Stats */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
 <StatCard
 icon={TrendingDown}
 label="کل مطالبات"
 value={TOMAN(stats.totalReceivable)}
 sublabel={`${toPersianDigits(parties.filter(p => p.partyType === "CUSTOMER").length)} مشتری`}
 color="bg-primary"
 delay={0}
 />
 <StatCard
 icon={Clock}
 label="سررسید ۳۰-۳۱ روز"
 value={TOMAN(stats.overdue30)}
 sublabel="نیازمند پیگیری"
 color="bg-amber-500"
 delay={0.05}
 />
 <StatCard
 icon={AlertTriangle}
 label="سررسید +۶۰ روز"
 value={TOMAN(stats.overdue60)}
 sublabel="معوق بحرانی"
 color="bg-rose-500"
 delay={0.1}
 />
 <StatCard
 icon={ShieldAlert}
 label="طرف‌حساب پرریسک"
 value={toPersianDigits(stats.criticalParties)}
 sublabel="نیازمند اقدام فوری"
 color="bg-orange-500"
 delay={0.15}
 />
 </div>

 <Tabs defaultValue="list" className="w-full">
 <TabsList className="grid w-full sm:w-auto grid-cols-2 sm:inline-grid h-9">
 <TabsTrigger value="list" className="text-xs sm:text-sm">
 <Users className="h-4 w-4 ml-1.5" />
 لیست طرف‌حساب‌ها
 </TabsTrigger>
 <TabsTrigger value="chart" className="text-xs sm:text-sm">
 <TrendingDown className="h-4 w-4 ml-1.5" />
 تحلیل توزیع
 </TabsTrigger>
 </TabsList>

 <TabsContent value="chart" className="mt-4">
 <AgingBarChart parties={parties} />
 </TabsContent>

 <TabsContent value="list" className="mt-4 space-y-4">
 {/* Filters */}
 <Card className="border-border/60">
 <CardContent className="p-3 sm:p-4">
 <div className="flex flex-col sm:flex-row gap-3">
 <div className="flex-1 relative">
 <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 placeholder="جستجوی نام طرف‌حساب..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="pr-9 h-9"
 />
 </div>
 <Select value={partyTypeFilter} onValueChange={(v) => setPartyTypeFilter(v as any)}>
 <SelectTrigger className="h-9 sm:w-40">
 <SelectValue placeholder="نوع" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه انواع</SelectItem>
 <SelectItem value="CUSTOMER">مشتری</SelectItem>
 <SelectItem value="VENDOR">تأمین‌کننده</SelectItem>
 </SelectContent>
 </Select>
 <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as any)}>
 <SelectTrigger className="h-9 sm:w-40">
 <SelectValue placeholder="ریسک" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">همه ریسک‌ها</SelectItem>
 <SelectItem value="low">کم</SelectItem>
 <SelectItem value="medium">متوسط</SelectItem>
 <SelectItem value="high">بالا</SelectItem>
 <SelectItem value="critical">بحرانی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </CardContent>
 </Card>

 {/* Table */}
 {loading? (
 <Card>
 <CardContent className="py-16 flex flex-col items-center gap-3">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
 </CardContent>
 </Card>
 ): filteredParties.length === 0? (
 <EmptyState
 icon={CheckCircle2}
 title="موردی یافت نشد"
 description={search || partyTypeFilter!== "ALL" || riskFilter!== "ALL"? "با فیلترهای انتخابی مطالبی نیست.": "هنوز داده‌ای ثبت نشده است."}
 />
 ): (
 <Card className="border-border/60 overflow-hidden">
 <div className="overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow className="bg-muted/40 hover:bg-muted/40">
 <TableHead className="text-xs">طرف‌حساب</TableHead>
 <TableHead className="text-xs text-center">جاری</TableHead>
 <TableHead className="text-xs text-center">۳۰-</TableHead>
 <TableHead className="text-xs text-center">۶۰-</TableHead>
 <TableHead className="text-xs text-center">+۹۰</TableHead>
 <TableHead className="text-xs text-center">کل</TableHead>
 <TableHead className="text-xs text-center">تأخیر</TableHead>
 <TableHead className="text-xs text-center">رتبه</TableHead>
 <TableHead className="text-xs text-center">اقدامات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filteredParties.map((p, idx) => (
 <motion.tr
 key={p.partyId}
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 transition={{ delay: idx * 0.03 }}
 className="group hover:bg-muted/30 transition-colors"
 >
 <TableCell className="py-3">
 <div className="flex flex-col gap-0.5">
 <span className="font-medium text-sm text-foreground">{p.partyName}</span>
 <div className="flex items-center gap-1.5">
 <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-normal">
 {p.partyType === "CUSTOMER"? "مشتری": "تأمین‌کننده"}
 </Badge>
 <Badge
 className={`h-4 text-[9px] px-1.5 ${RISK_CONFIG[p.riskLevel].color} text-white border-0`}
 >
 ریسک {RISK_CONFIG[p.riskLevel].label}
 </Badge>
 </div>
 </div>
 </TableCell>
 <TableCell className="text-center text-xs font-mono text-emerald-700 dark:text-emerald-300">
 {p.buckets.current > 0? TOMAN(p.buckets.current): "—"}
 </TableCell>
 <TableCell className="text-center text-xs font-mono text-amber-700 dark:text-amber-300">
 {p.buckets.d30 > 0? TOMAN(p.buckets.d30): "—"}
 </TableCell>
 <TableCell className="text-center text-xs font-mono text-orange-700 dark:text-orange-300">
 {p.buckets.d60 > 0? TOMAN(p.buckets.d60): "—"}
 </TableCell>
 <TableCell className="text-center text-xs font-mono text-rose-700 dark:text-rose-300 font-semibold">
 {p.buckets.d90 > 0? TOMAN(p.buckets.d90): "—"}
 </TableCell>
 <TableCell className="text-center text-xs font-mono font-bold text-foreground">
 {TOMAN(p.totalReceivable || p.totalPayable)}
 </TableCell>
 <TableCell className="text-center">
 {p.overdueDays > 0? (
 <Badge
 variant="outline"
 className={`h-5 text-[10px] ${
 p.overdueDays > 90
? "border-rose-500 text-rose-700 dark:text-rose-300"
: p.overdueDays > 60
? "border-orange-500 text-orange-700 dark:text-orange-300"
: "border-amber-500 text-amber-700 dark:text-amber-300"
 }`}
 >
 {toPersianDigits(p.overdueDays)} روز
 </Badge>
 ): (
 <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
 )}
 </TableCell>
 <TableCell className="text-center">
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="inline-flex flex-col items-center gap-1">
 <span
 className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${CREDIT_RATING_CONFIG[p.creditRating].color}`}
 >
 {p.creditRating}
 </span>
 </div>
 </TooltipTrigger>
 <TooltipContent side="top" className="text-xs">
 <div className="space-y-0.5">
 <div>امتیاز: {toPersianDigits(p.creditScore)}/۱۰۰</div>
 <div className="text-muted-foreground">{CREDIT_RATING_CONFIG[p.creditRating].description}</div>
 </div>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-center gap-1">
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => handleOpenAction(p)}
 disabled={p.totalReceivable === 0 && p.totalPayable === 0}
 >
 <AlertCircle className="h-3.5 w-3.5" />
 </Button>
 </TooltipTrigger>
 <TooltipContent side="top">ثبت اقدام وصول</TooltipContent>
 </Tooltip>
 </TooltipProvider>
 {p.contactPhone && (
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 asChild
 >
 <a href={`tel:${p.contactPhone}`}>
 <Phone className="h-3.5 w-3.5" />
 </a>
 </Button>
 </TooltipTrigger>
 <TooltipContent side="top">{p.contactPhone}</TooltipContent>
 </Tooltip>
 </TooltipProvider>
 )}
 {p.contactEmail && (
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 asChild
 >
 <a href={`mailto:${p.contactEmail}`}>
 <Mail className="h-3.5 w-3.5" />
 </a>
 </Button>
 </TooltipTrigger>
 <TooltipContent side="top">{p.contactEmail}</TooltipContent>
 </Tooltip>
 </TooltipProvider>
 )}
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => handleViewLogs(p)}
 >
 <FileText className="h-3.5 w-3.5" />
 </Button>
 </div>
 </TableCell>
 </motion.tr>
 ))}
 </TableBody>
 </Table>
 </div>
 </Card>
 )}
 </TabsContent>
 </Tabs>

 <ActionDialog
 open={actionDialogOpen}
 onOpenChange={setActionDialogOpen}
 party={selectedParty}
 onSubmit={handleSubmitAction}
 />

 {/* Logs dialog */}
 <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <FileText className="h-5 w-5 text-primary" />
 تاریخچه اقدامات
 </DialogTitle>
 <DialogDescription>
 {logsForParty?.partyName}
 </DialogDescription>
 </DialogHeader>
 <div className="max-h-80 overflow-y-auto -mx-2 px-2">
 {partyLogs.length === 0? (
 <div className="py-8 text-center text-sm text-muted-foreground">
 هنوز اقدامی ثبت نشده است.
 </div>
 ): (
 <ol className="space-y-2">
 {partyLogs.map((log) => (
 <li
 key={log.id}
 className="rounded-lg border border-border/60 p-3 bg-muted/30"
 >
 <div className="flex items-center justify-between gap-2 mb-1">
 <Badge variant="outline" className="h-5 text-[10px]">
 {actionLabel(log.action)}
 </Badge>
 <span className="text-[10px] text-muted-foreground">
 {toJalali(new Date(log.date))} {toPersianDigits(new Date(log.date).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }))}
 </span>
 </div>
 <p className="text-xs text-foreground leading-relaxed">{log.note}</p>
 <p className="mt-1 text-[10px] text-muted-foreground">توسط: {log.by}</p>
 </li>
 ))}
 </ol>
 )}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setLogsDialogOpen(false)}>
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function actionLabel(action: ActionLog["action"]): string {
 return {
 REMINDER: "یادآور",
 CALL: "تماس",
 NOTICE: "اخطار",
 ESCALATE: "ارجاع قانونی",
 }[action];
}
