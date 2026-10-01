"use client";

import * as React from "react";
import {
 Plus,
 Search,
 Wallet,
 Banknote,
 Landmark,
 PiggyBank,
 FileCheck2,
 CheckCircle2,
 RotateCcw,
 Clock,
 CreditCard,
 HandCoins,
 Receipt,
 ArrowLeftRight,
 Eye,
 LandPlot,
 Loader2,
 Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ux/empty-state";
import { useConfirmAction } from "@/components/ux/confirm-action";
import { useToast } from "@/hooks/use-toast";
import {
 formatCompactToman,
 formatToman,
 toJalali,
 toPersianDigits,
} from "@/lib/persian";
import { handleApiError, parseApiResponse } from "@/lib/api-error-handler";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { useCachedData, scopedKey } from "@/lib/client-cache";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

interface DueCheck {
 id?: string;
 sayadi: string;
 type: "received" | "paid";
 amount: number;
 dueDate: string;
 dueDateISO?: string; // تاریخ ISO خام برای محاسبه «نزدیک سررسید»
 bank: string;
 status: "registered" | "collected" | "bounced";
}

/** چک‌های سررسید نمونه — از API بارگذاری می‌شود */
const CHECK_TYPE_FA: Record<string, string> = {
 received: "دریافتی",
 paid: "پرداختی",
};

const CHECK_STATUS_FA: Record<string, string> = {
 registered: "ثبت شده",
 collected: "وصول شده",
 bounced: "برگشت خورده",
};

const CHECK_STATUS_COLOR: Record<string, string> = {
 registered: "bg-muted text-muted-foreground",
 collected: "bg-success/10 text-success",
 bounced: "bg-destructive/10 text-destructive",
};

/** حساب‌های بانکی — از GET /api/bank-accounts بارگذاری می‌شود (قبلاً آرایه‌ی خالی hardcoded بود و لیست همیشه خالی دیده می‌شد) */
interface BankAccountRow {
 id: string;
 bankName: string;
 branch: string | null;
 accountNumber: string;
 cardNumber: string | null;
 shaba: string | null;
 balance: number; // تومان (API ریال DB را ÷۱۰ برمی‌گرداند)
 type: string;
}

const BANK_LOGO: Record<string, typeof Banknote> = {
 Banknote,
 Landmark,
 LandPlot,
};

const BANK_LOGO_KEYS = ["Banknote", "Landmark", "LandPlot"] as const;

/** لوگوی پایدار برای هر حساب بر اساس نام بانک */
function bankLogoFor(bankName: string): typeof Banknote {
 const key = BANK_LOGO_KEYS[bankName.length % BANK_LOGO_KEYS.length];
 return BANK_LOGO[key] || Banknote;
}

const ACCENT_MAP: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 warning: "bg-warning/10 text-warning",
 info: "bg-info/10 text-info",
 success: "bg-success/10 text-success",
};

// تشخیص چک‌های «نزدیک سررسید» — ۷ روز آینده
function isDueSoon(iso?: string): boolean {
 if (!iso) return false;
 const due = localMidnight(iso);
 if (!due) return false;
 const now = Date.now();
 const diff = due.getTime() - now;
 return diff >= -24 * 60 * 60 * 1000 && diff <= 7 * 24 * 60 * 60 * 1000;
}

// FIX (LOW): نمایش سررسید مستقل از TZ کلاینت — قبلاً toLocaleDateString("fa-IR")
// روی کلاینتی با آفست منفی، UTC-midnight را یک روز عقب می‌برد. حالا از قسمت
// تاریخِ ISO (YYYY-MM-DD) تاریخ محلی ساخته و با toJalali قالب‌بندی می‌شود.
function localMidnight(iso?: string): Date | null {
 if (!iso) return null;
 const datePart = String(iso).slice(0, 10);
 const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
 if (!m) return null;
 const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
 return Number.isNaN(d.getTime())? null: d;
}

function formatDueDate(iso?: string): string {
 const d = localMidnight(iso);
 if (!d) return "—";
 return toJalali(d);
}

export function Treasury() {
 const { toast } = useToast();
 const { confirm, ConfirmDialogComponent } = useConfirmAction();
 const [search, setSearch] = React.useState("");
 const [checkDialogOpen, setCheckDialogOpen] = React.useState(false);
 const [pettyDialogOpen, setPettyDialogOpen] = React.useState(false);
 const [submitting, setSubmitting] = React.useState(false);
 const [viewCheck, setViewCheck] = React.useState<DueCheck | null>(null);

 // Issue 1: لیست چک‌ها از API — FIX(21-C — کش SWR): الگوی stale-while-revalidate
 // (تعمیم WH-6 روی همه نماها): بازگشت به خزانه‌داری داده‌ها را «همان لحظه» از
 // کش نشان می‌دهد و در پس‌زمینه بی‌صدا تازه می‌کند؛ اسپینر فقط اولین بازدید است.
 const [refreshKey, setRefreshKey] = React.useState(0);
 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 // حساب‌های بانکی — بارگذاری عمومی در mount/refresh (CRITICAL: قبلاً فقط
 // دیالوگ انتقال وجه حساب‌ها را می‌خواند و کارت اصلی همیشه خالی بود)
 const bankAccountsCache = useCachedData<BankAccountRow[]>(
  scopedKey("treasury_accounts", getAuthToken()),
  async () => {
   try {
    const res = await authFetch("/api/bank-accounts", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (json?.success && Array.isArray(json.data)) {
     return json.data.map((a: Record<string, unknown>) => ({
      id: String(a.id?? ""),
      bankName: String(a.bankName?? "—"),
      branch: a.branch? String(a.branch): null,
      accountNumber: String(a.accountNumber?? ""),
      cardNumber: a.cardNumber? String(a.cardNumber): null,
      shaba: a.shaba? String(a.shaba): null,
      balance: Number(String(a.balance?? "0")) || 0,
      type: String(a.type?? "CURRENT"),
     }) satisfies BankAccountRow);
    }
    return [];
   } catch {
    return [];
   }
  }
 );
 const bankAccounts = bankAccountsCache.data ?? [];
 const loadingBankAccounts = bankAccountsCache.loading; // فقط اولین بارِ بدون کش
 const refreshBankAccounts = bankAccountsCache.refresh;

 // چک‌ها — همان الگو: نمایش فوری از کش + به‌روزرسانی خاموش پس‌زمینه
 const checksCache = useCachedData<DueCheck[]>(
  scopedKey("treasury_checks", getAuthToken()),
  async () => {
   try {
    const res = await authFetch("/api/checks?limit=200", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!json?.success || !Array.isArray(json.data)) return [];
    return json.data.map(
     (c: Record<string, unknown>) => {
      const typeStr = String((c as { type?: string }).type?? "RECEIVED").toUpperCase();
      const statusStr = String((c as { status?: string }).status?? "REGISTERED").toUpperCase();
      const due = (c as { dueDate?: string | Date }).dueDate;
      const dueISO = due? new Date(due).toISOString(): undefined;
      const dueStr = formatDueDate(dueISO);
      return {
       id: String((c as { id?: string }).id?? ""),
       sayadi: String((c as { sayadId?: string }).sayadId?? (c as { number?: string }).number?? ""),
       type: typeStr === "ISSUED"? "paid": "received",
       amount: Math.round(Number((c as { amount?: number }).amount?? 0)),
       dueDate: dueStr,
       dueDateISO: dueISO,
       bank: String((c as { bankName?: string }).bankName?? "—"),
       status: statusStr === "COLLECTED"? "collected": statusStr === "BOUNCED"? "bounced": "registered",
      } satisfies DueCheck;
     }
    );
   } catch {
    return [];
   }
  }
 );
 const checks = checksCache.data ?? [];
 const loadingChecks = checksCache.loading; // فقط اولین بارِ بدون کش
 const refreshChecks = checksCache.refresh;

 // تازه‌سازی پس از CRUD داخل همین ماژول (refreshKey برای سازگاری کدهای موجود)
 React.useEffect(() => {
  if (refreshKey === 0) return;
  refreshChecks();
  refreshBankAccounts();
 }, [refreshKey, refreshChecks, refreshBankAccounts]);

 // فرم چک جدید
 const [formNumber, setFormNumber] = React.useState("");
 const [formSayadId, setFormSayadId] = React.useState("");
 const [formType, setFormType] = React.useState<"received" | "paid">("received");
 const [formAmount, setFormAmount] = React.useState("");
 const [formBank, setFormBank] = React.useState("");
 const [formDueDate, setFormDueDate] = React.useState("");
 const [formPartyId, setFormPartyId] = React.useState("none");
 const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});

 // فرم تنخواه
 const [pettyName, setPettyName] = React.useState("");
 const [pettyCustodian, setPettyCustodian] = React.useState("");
 const [pettyAmount, setPettyAmount] = React.useState("");
 const [pettyErrors, setPettyErrors] = React.useState<Record<string, string>>({});

 // فرم وام
 const [loanDialogOpen, setLoanDialogOpen] = React.useState(false);
 const [loanTitle, setLoanTitle] = React.useState("");
 const [loanPrincipal, setLoanPrincipal] = React.useState("");
 const [loanInterestRate, setLoanInterestRate] = React.useState("");
 const [loanInstallments, setLoanInstallments] = React.useState("");
 const [loanStartDate, setLoanStartDate] = React.useState("");
 const [loanErrors, setLoanErrors] = React.useState<Record<string, string>>({});

 // فرم تسویه حساب
 const [settlementDialogOpen, setSettlementDialogOpen] = React.useState(false);
 const [settlementPartyId, setSettlementPartyId] = React.useState("");
 const [settlementPartyName, setSettlementPartyName] = React.useState("");
 const [settlementAmount, setSettlementAmount] = React.useState("");
 const [settlementDirection, setSettlementDirection] = React.useState<"PAY" | "RECEIVE">("PAY");
 const [settlementDescription, setSettlementDescription] = React.useState("");
 const [settlementErrors, setSettlementErrors] = React.useState<Record<string, string>>({});

 // فرم انتقال وجه — از همان state عمومی bankAccounts استفاده می‌کند
 const [transferDialogOpen, setTransferDialogOpen] = React.useState(false);
 const [transferFromId, setTransferFromId] = React.useState("");
 const [transferToId, setTransferToId] = React.useState("");
 const [transferAmount, setTransferAmount] = React.useState("");
 const [transferDescription, setTransferDescription] = React.useState("");
 const [transferErrors, setTransferErrors] = React.useState<Record<string, string>>({});

 // فرم ثبت حساب بانکی
 const [bankAcctDialogOpen, setBankAcctDialogOpen] = React.useState(false);
 const [baBankName, setBaBankName] = React.useState("");
 const [baBranch, setBaBranch] = React.useState("");
 const [baAccountNumber, setBaAccountNumber] = React.useState("");
 const [baCardNumber, setBaCardNumber] = React.useState("");
 const [baShaba, setBaShaba] = React.useState("");
 const [baType, setBaType] = React.useState<"CURRENT" | "SAVING" | "LOAN">("CURRENT");
 const [baBalance, setBaBalance] = React.useState("");
 const [baErrors, setBaErrors] = React.useState<Record<string, string>>({});

 // دیالوگ ویرایش چک
 const [editCheckDialogOpen, setEditCheckDialogOpen] = React.useState(false);
 const [editCheckRow, setEditCheckRow] = React.useState<DueCheck | null>(null);
 const [editCheckStatus, setEditCheckStatus] = React.useState<"COLLECTED" | "BOUNCED">("COLLECTED");

 const filteredChecks = React.useMemo(() => {
 if (!search.trim()) return checks;
 const q = search.trim();
 return checks.filter(
 (c) =>
 c.sayadi.includes(q) ||
 c.bank.includes(q) ||
 c.dueDate.includes(q)
 );
 }, [checks, search]);

 // FIX (HIGH): KPIها فقط چک‌های «در جریان» (registered) را می‌شمارند — چک
 // وصول‌شده تبدیل به نقد شده و برگشتی مطالبه نیست؛ قبلاً همه‌ی وضعیت‌ها جمع
 // می‌شد و ارقام دائماً بیش از واقعیت بود.
 const outstandingChecks = React.useMemo(
 () => filteredChecks.filter((c) => c.status === "registered"),
 [filteredChecks]
 );
 const totalDue = outstandingChecks
.filter((c) => c.type === "received")
.reduce((s, c) => s + c.amount, 0);
 const totalPay = outstandingChecks
.filter((c) => c.type === "paid")
.reduce((s, c) => s + c.amount, 0);
 const totalCollected = React.useMemo(
 () =>
 filteredChecks
 .filter((c) => c.status === "collected")
 .reduce((s, c) => s + c.amount, 0),
 [filteredChecks]
 );
 const totalBounced = React.useMemo(
 () =>
 filteredChecks
 .filter((c) => c.status === "bounced")
 .reduce((s, c) => s + c.amount, 0),
 [filteredChecks]
 );

 const openNewCheck = () => {
 setFormNumber("");
 setFormSayadId("");
 setFormType("received");
 setFormAmount("");
 setFormBank("");
 setFormDueDate("");
 setFormPartyId("none");
 setFormErrors({});
 setCheckDialogOpen(true);
 };

 // گوش دادن به رویداد hoshhesab:module-action برای باز کردن دیالوگ چک جدید
 // از Quick Access در داشبورد (detail.action = "new-check")
 React.useEffect(() => {
 const onAction = (e: Event) => {
 const detail = (e as CustomEvent<{ module: string; action: string }>).detail;
 if (detail?.module === "treasury" && detail.action === "new-check") {
 openNewCheck();
 }
 };
 window.addEventListener("hoshhesab:module-action", onAction as EventListener);
 return () =>
 window.removeEventListener("hoshhesab:module-action", onAction as EventListener);
 }, []);

 // Issue 2: اعتبارسنجی real-time فرم چک
 const validateCheckForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!formNumber.trim()) e.number = "شماره چک الزامی است";
 if (!formBank.trim()) e.bank = "نام بانک الزامی است";
 if (!formDueDate) e.dueDate = "تاریخ سررسید الزامی است";
 if (!formAmount.trim()) e.amount = "مبلغ چک الزامی است";
 setFormErrors(e);
 return Object.keys(e).length === 0;
 };

 const isCheckFormValid = React.useMemo(
 () => Boolean(formNumber.trim() && formBank.trim() && formDueDate && formAmount.trim()),
 [formNumber, formBank, formDueDate, formAmount]
 );

 const handleSubmitCheck = async () => {
 const amountNum = Number(
 formAmount.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 )
 );
 if (!validateCheckForm() ||!amountNum) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/checks", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 number: formNumber.trim(),
 sayadId: formSayadId.trim() || undefined,
 type: formType === "paid"? "ISSUED": "RECEIVED",
 amount: amountNum,
 bankName: formBank.trim(),
 dueDate: new Date(formDueDate).toISOString(),
 partyId: formPartyId!== "none"? formPartyId: undefined,
 }),
 });
 let data: { success?: boolean; message?: string; error?: string } | null = null;
 try {
 data = await res.json();
 } catch {
 data = null;
 }
 parseApiResponse(res, data);
 toast({
 title: "چک ثبت شد",
 description:
 data?.message?? `چک ${formType === "received"? "دریافتی": "پرداختی"} با موفقیت ثبت شد.`,
 });
 setCheckDialogOpen(false);
 refresh(); // Issue 1: refresh list after create
 } catch (err) {
 toast({
 title: "خطا در ثبت چک",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const handlePetty = () => {
 setPettyName("");
 setPettyCustodian("");
 setPettyAmount("");
 setPettyErrors({});
 setPettyDialogOpen(true);
 };

 // Issue 2: اعتبارسنجی فرم تنخواه
 const validatePettyForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!pettyName.trim()) e.name = "نام تنخواه الزامی است";
 if (!pettyAmount.trim()) e.amount = "مبلغ اولیه الزامی است";
 setPettyErrors(e);
 return Object.keys(e).length === 0;
 };

 const isPettyFormValid = React.useMemo(
 () => Boolean(pettyName.trim() && pettyAmount.trim()),
 [pettyName, pettyAmount]
 );

 const handlePettySubmit = async () => {
 const amountNum = Number(
 pettyAmount.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 )
 );
 if (!validatePettyForm() ||!amountNum) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/petty-cash", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 name: pettyName.trim(),
 custodian: pettyCustodian.trim() || undefined,
 balance: amountNum,
 }),
 });
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در ثبت تنخواه",
 description: data?.error || "خطا در ارتباط با سرور",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "تنخواه ثبت شد",
 description: data?.message?? `تنخواه «${pettyName}» با مبلغ ${formatCompactToman(amountNum)} برای ${pettyCustodian || "—"} ثبت شد.`,
 });
 setPettyDialogOpen(false);
 setPettyErrors({});
 } catch (err) {
 toast({
 title: "خطا در ثبت تنخواه",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // H5: فرم ثبت وام — فرم کامل با اعتبارسنجی و فراخوانی API
 const openLoanDialog = () => {
 setLoanTitle("");
 setLoanPrincipal("");
 setLoanInterestRate("");
 setLoanInstallments("1");
 setLoanStartDate("");
 setLoanErrors({});
 setLoanDialogOpen(true);
 };

 const handleLoan = () => {
 openLoanDialog();
 };

 const validateLoanForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!loanTitle.trim()) e.title = "عنوان وام الزامی است";
 if (!loanPrincipal.trim()) e.principal = "مبلغ وام الزامی است";
 if (!loanInstallments.trim()) e.installments = "تعداد اقساط الزامی است";
 setLoanErrors(e);
 return Object.keys(e).length === 0;
 };

 const handleLoanSubmit = async () => {
 const principalNum = Number(
 loanPrincipal.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 )
 );
 const installmentsNum = Number(
 loanInstallments.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 )
 );
 if (!validateLoanForm() ||!principalNum ||!installmentsNum) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/loans", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 title: loanTitle.trim(),
 principal: principalNum,
 interestRate: loanInterestRate? Number(loanInterestRate): 0,
 installments: installmentsNum,
 startDate: loanStartDate? new Date(loanStartDate).toISOString(): undefined,
 }),
 });
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در ثبت وام",
 description: data?.error || "خطا در ارتباط با سرور",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "وام ثبت شد",
 description: data?.message?? `وام «${loanTitle}» با موفقیت ثبت شد.`,
 });
 setLoanDialogOpen(false);
 setLoanErrors({});
 } catch (err) {
 toast({
 title: "خطا در ثبت وام",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // H5: فرم تسویه حساب — POST /api/settlements
 const openSettlementDialog = () => {
 setSettlementPartyId("");
 setSettlementPartyName("");
 setSettlementAmount("");
 setSettlementDirection("PAY");
 setSettlementDescription("");
 setSettlementErrors({});
 setSettlementDialogOpen(true);
 };

 const handleSettlement = () => {
 openSettlementDialog();
 };

 const validateSettlementForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!settlementPartyId.trim()) e.partyId = "شناسه طرف‌حساب الزامی است";
 if (!settlementAmount.trim()) e.amount = "مبلغ تسویه الزامی است";
 setSettlementErrors(e);
 return Object.keys(e).length === 0;
 };

 const handleSettlementSubmit = async () => {
 const amountNum = Number(
 settlementAmount.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 )
 );
 if (!validateSettlementForm() ||!amountNum) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/settlements", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 partyId: settlementPartyId.trim(),
 amount: amountNum,
 direction: settlementDirection,
 description: settlementDescription.trim() || undefined,
 }),
 });
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در تسویه حساب",
 description: data?.error || "خطا در ارتباط با سرور",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "تسویه ثبت شد",
 description: data?.message?? `تسویه ${formatCompactToman(amountNum)} با موفقیت ثبت شد.`,
 });
 setSettlementDialogOpen(false);
 setSettlementErrors({});
 } catch (err) {
 toast({
 title: "خطا در تسویه حساب",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // H5: فرم انتقال وجه — POST /api/transfers
 const openTransferDialog = () => {
 setTransferFromId("");
 setTransferToId("");
 setTransferAmount("");
 setTransferDescription("");
 setTransferErrors({});
 setTransferDialogOpen(true);
 refreshBankAccounts(); // تازه‌سازی موجودی‌ها هنگام باز شدن دیالوگ
 };

 const handleTransfer = () => {
 openTransferDialog();
 };

 const validateTransferForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!transferFromId) e.fromAccountId = "حساب مبدأ الزامی است";
 if (!transferToId) e.toAccountId = "حساب مقصد الزامی است";
 if (transferFromId && transferToId && transferFromId === transferToId) {
 e.toAccountId = "حساب مبدأ و مقصد نمی‌توانند یکسان باشند";
 }
 if (!transferAmount.trim()) e.amount = "مبلغ انتقال الزامی است";
 setTransferErrors(e);
 return Object.keys(e).length === 0;
 };

 const handleTransferSubmit = async () => {
 const amountNum = Number(
 transferAmount.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 )
 );
 if (!validateTransferForm() ||!amountNum) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/transfers", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 fromAccountId: transferFromId,
 toAccountId: transferToId,
 amount: amountNum,
 description: transferDescription.trim() || undefined,
 }),
 });
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در انتقال وجه",
 description: data?.error || "خطا در ارتباط با سرور",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "انتقال وجه ثبت شد",
 description: data?.message?? `مبلغ ${formatCompactToman(amountNum)} با موفقیت منتقل شد.`,
 });
 setTransferDialogOpen(false);
 setTransferErrors({});
 } catch (err) {
 toast({
 title: "خطا در انتقال وجه",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // H5: فرم ثبت حساب بانکی — POST /api/bank-accounts
 const openBankAccountDialog = () => {
 setBaBankName("");
 setBaBranch("");
 setBaAccountNumber("");
 setBaCardNumber("");
 setBaShaba("");
 setBaType("CURRENT");
 setBaBalance("");
 setBaErrors({});
 setBankAcctDialogOpen(true);
 };

 const handleAddBankAccount = () => {
 openBankAccountDialog();
 };

 const validateBankAcctForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!baBankName.trim()) e.bankName = "نام بانک الزامی است";
 if (!baAccountNumber.trim()) e.accountNumber = "شماره حساب الزامی است";
 setBaErrors(e);
 return Object.keys(e).length === 0;
 };

 const handleBankAcctSubmit = async () => {
 const balanceNum = Number(
 baBalance.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 )
 );
 if (!validateBankAcctForm()) {
 toast({
 title: "اطلاعات ناقص است",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch("/api/bank-accounts", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 bankName: baBankName.trim(),
 branch: baBranch.trim() || undefined,
 accountNumber: baAccountNumber.trim(),
 cardNumber: baCardNumber.trim() || undefined,
 shaba: baShaba.trim() || undefined,
 type: baType,
 balance: balanceNum || 0,
 currency: "IRR",
 }),
 });
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در ثبت حساب بانکی",
 description: data?.error || "خطا در ارتباط با سرور",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "حساب بانکی ثبت شد",
 description: data?.message?? `حساب بانکی ${baBankName} با موفقیت ثبت شد.`,
 });
 setBankAcctDialogOpen(false);
 setBaErrors({});
 refresh(); // FIX: حساب جدید بلافاصله در کارت «حساب‌های بانکی» ظاهر شود
 } catch (err) {
 toast({
 title: "خطا در ثبت حساب بانکی",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const handleViewCheck = (chk: DueCheck) => {
 setViewCheck(chk);
 toast({
 title: `چک ${CHECK_TYPE_FA[chk.type]}`,
 description: `شماره صیادی: ${chk.sayadi} — مبلغ: ${formatCompactToman(chk.amount)}`,
 });
 };

 const handleEditCheck = (chk: DueCheck) => {
 setEditCheckRow(chk);
 // ماشین حالت: فقط چک‌های «در جریان» قابل وصول/برگشت‌اند — وضعیت‌های
 // COLLECTED/BOUNCED نهایی‌اند (API نیز همین را اعمال می‌کند)
 setEditCheckStatus(
 chk.status === "collected"
? "COLLECTED"
: chk.status === "bounced"
? "BOUNCED"
: "COLLECTED"
 );
 setEditCheckDialogOpen(true);
 };

 // H5: ثبت تغییر وضعیت چک (تنها فیلد قابل به‌روزرسانی در API فعلی)
 const handleEditCheckSubmit = async () => {
 if (!editCheckRow?.id) {
 toast({
 title: "خطا",
 description: "شناسه چک نامعتبر است.",
 variant: "destructive",
 });
 return;
 }
 if (editCheckRow.status !== "registered") {
 toast({
 title: "امکان تغییر وضعیت نیست",
 description: "این چک وصول/برگشت شده و وضعیت آن نهایی است.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await authFetch(`/api/checks?id=${encodeURIComponent(editCheckRow.id)}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: editCheckStatus }),
 });
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در به‌روزرسانی چک",
 description: data?.error || "عملیات ناموفق بود.",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "چک به‌روزرسانی شد",
 description: data?.message?? `وضعیت چک ${editCheckRow.sayadi} به‌روزرسانی شد.`,
 });
 setEditCheckDialogOpen(false);
 refresh();
 } catch (err) {
 toast({
 title: "خطا در به‌روزرسانی چک",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const handleCollectCheck = (chk: DueCheck) => {
 confirm({
 title: `وصول چک ${chk.sayadi}؟`,
 description: `این چک ${CHECK_TYPE_FA[chk.type]} به مبلغ ${formatCompactToman(chk.amount)} به وضعیت «وصول شده» تغییر می‌یابد.`,
 confirmText: "وصول چک",
 onConfirm: async () => {
 if (!chk.id) {
 toast({
 title: "خطا",
 description: "شناسه چک نامعتبر است.",
 variant: "destructive",
 });
 return;
 }
 try {
 const res = await authFetch(`/api/checks?id=${encodeURIComponent(chk.id)}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: "COLLECTED" }),
 });
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در وصول چک",
 description: data?.error || "عملیات ناموفق بود.",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "چک وصول شد",
 description: data?.message?? `چک ${chk.sayadi} با موفقیت وصول شد.`,
 });
 refresh();
 } catch (err) {
 toast({
 title: "خطا در وصول چک",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 }
 },
 });
 };

 const handleBounceCheck = (chk: DueCheck) => {
 confirm({
 title: `برگشت چک ${chk.sayadi}؟`,
 description: `این عمل به وضعیت «برگشت خورده» تغییر می‌یابد و در گزارش‌های مغایرت‌گیری منعکس می‌شود.`,
 variant: "destructive",
 confirmText: "ثبت برگشت",
 onConfirm: async () => {
 if (!chk.id) {
 toast({
 title: "خطا",
 description: "شناسه چک نامعتبر است.",
 variant: "destructive",
 });
 return;
 }
 try {
 const res = await authFetch(`/api/checks?id=${encodeURIComponent(chk.id)}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ status: "BOUNCED" }),
 });
 const data: { success?: boolean; message?: string; error?: string } =
 await res.json().catch(() => ({}));
 if (!res.ok ||!data?.success) {
 toast({
 title: "خطا در ثبت برگشت",
 description: data?.error || "عملیات ناموفق بود.",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "چک برگشت خورد",
 description: data?.message?? `چک ${chk.sayadi} به وضعیت برگشت خورده تغییر یافت.`,
 variant: "destructive",
 });
 refresh();
 } catch (err) {
 toast({
 title: "خطا در ثبت برگشت",
 description: handleApiError(err, "خطا در ارتباط با سرور"),
 variant: "destructive",
 });
 }
 },
 });
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* کارت‌های آماری — فقط چک‌های در جریان (وصول/برگشت حساب نمی‌شوند) */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={Wallet}
 label="خالص چک‌های در جریان"
 value={checks.length > 0? formatCompactToman(totalDue - totalPay): "—"}
 sub={checks.length > 0? "دریافتی منهای پرداختی (در جریان)": "هنوز چکی ثبت نشده"}
 accent="primary"
 />
 <StatCard
 icon={FileCheck2}
 label="چک‌های دریافتی (در جریان)"
 value={checks.length > 0? formatCompactToman(totalDue): "—"}
 sub={`${toPersianDigits(outstandingChecks.filter((c) => c.type === "received").length)} چک در جریان`}
 accent="success"
 />
 <StatCard
 icon={HandCoins}
 label="چک‌های پرداختی (در جریان)"
 value={checks.length > 0? formatCompactToman(totalPay): "—"}
 sub={`${toPersianDigits(outstandingChecks.filter((c) => c.type === "paid").length)} چک در جریان`}
 accent="warning"
 />
 <StatCard
 icon={PiggyBank}
 label="تعداد کل چک‌ها"
 value={toPersianDigits(checks.length)}
 sub={checks.length > 0? "ثبت شده": "بدون چک"}
 accent="primary"
 />
 </div>

 {/* نوار ابزار */}
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row gap-3">
 <div className="relative flex-1">
 <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="جستجوی شماره صیادی، بانک یا سررسید..."
 className="ps-9"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
 </div>
 <Button variant="outline" className="gap-1.5" onClick={openNewCheck}>
 <Plus className="h-4 w-4" />
 ثبت چک جدید
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handlePetty}>
 <PiggyBank className="h-4 w-4" />
 تنخواه
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleLoan}>
 <CreditCard className="h-4 w-4" />
 وام
 </Button>
 <Button className="gap-1.5" onClick={handleSettlement}>
 <Receipt className="h-4 w-4" />
 تسویه حساب
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* چک‌های سررسید — خالی */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base flex items-center gap-2">
 <Clock className="h-4 w-4 text-muted-foreground" />
 چک‌های سررسید
 {/* FIX(21-C): نشانگر کوچک «به‌روزرسانی…» — داده‌ها فوری از کش آمده‌اند
 و تازگی در پس‌زمینه می‌رسد؛ کاربر منتظر نمی‌ماند */}
 {(checksCache.refreshing || bankAccountsCache.refreshing) && (
 <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
 <Loader2 className="h-3 w-3 animate-spin" />
 به‌روزرسانی…
 </span>
 )}
 </CardTitle>
 <div className="flex items-center gap-2 text-xs flex-wrap">
 <Badge
 variant="outline"
 className="border-success/30 text-success"
 >
 دریافتی در جریان: {formatCompactToman(totalDue)}
 </Badge>
 <Badge
 variant="outline"
 className="border-warning/30 text-warning"
 >
 پرداختی در جریان: {formatCompactToman(totalPay)}
 </Badge>
 {totalCollected > 0 && (
 <Badge
 variant="outline"
 className="border-success/30 text-success"
 >
 وصول‌شده: {formatCompactToman(totalCollected)}
 </Badge>
 )}
 {totalBounced > 0 && (
 <Badge
 variant="outline"
 className="border-destructive/30 text-destructive"
 >
 برگشت‌خورده: {formatCompactToman(totalBounced)}
 </Badge>
 )}
 </div>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {loadingChecks? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): filteredChecks.length === 0? (
 <EmptyState
 icon={Clock}
 title={search.trim()? "نتیجه‌ای یافت نشد": "چکی برای نمایش وجود ندارد"}
 description={
 search.trim()
? "با تغییر عبارت جستجو، چک‌های بیشتری را پیدا کنید."
: "با ثبت اولین چک دریافتی یا پرداختی، لیست سررسیدها در این جدول نمایش داده می‌شود."
 }
 action={
 search.trim()? undefined: (
 <Button size="sm" className="gap-1.5" onClick={openNewCheck}>
 <Plus className="h-3.5 w-3.5" />
 ثبت چک جدید
 </Button>
 )
 }
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[900px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">شماره صیادی</th>
 <th scope="col" className="font-medium px-4 py-2.5">نوع</th>
 <th scope="col" className="font-medium px-4 py-2.5">مبلغ</th>
 <th scope="col" className="font-medium px-4 py-2.5">تاریخ سررسید</th>
 <th scope="col" className="font-medium px-4 py-2.5">بانک</th>
 <th scope="col" className="font-medium px-4 py-2.5">وضعیت</th>
 <th scope="col" className="font-medium px-4 py-2.5">عملیات</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {filteredChecks.map((chk, i) => {
 const dueSoon = chk.status === "registered" && isDueSoon(chk.dueDateISO);
 return (
 <tr
 key={i}
 className={`border-b border-border/40 transition-colors row-hover-highlight ${dueSoon? "bg-warning/5": ""}`}
 >
 <td className="px-4 py-3 font-mono text-xs">
 {chk.sayadi}
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="outline"
 className={
 chk.type === "received"
? "border-success/30 text-success"
: "border-warning/30 text-warning"
 }
 >
 {CHECK_TYPE_FA[chk.type]}
 </Badge>
 </td>
 <td className="px-4 py-3 font-medium">
 {formatCompactToman(chk.amount)}
 </td>
 <td className="px-4 py-3 text-muted-foreground text-xs">
 <span className={`inline-flex items-center gap-1 ${dueSoon? "text-warning font-medium": ""}`}>
 {dueSoon && <Clock className="h-3 w-3 animate-due-soon rounded-full" />}
 {chk.dueDate}
 </span>
 </td>
 <td className="px-4 py-3">{chk.bank}</td>
 <td className="px-4 py-3">
 <Badge
 className={`text-[10px] ${
 CHECK_STATUS_COLOR[chk.status]
 } ${dueSoon? "border border-warning/40": ""}`}
 >
 {CHECK_STATUS_FA[chk.status] === "وصول شده" && (
 <CheckCircle2 className="h-3 w-3 me-1" />
 )}
 {CHECK_STATUS_FA[chk.status] === "برگشت خورده" && (
 <RotateCcw className="h-3 w-3 me-1" />
 )}
 {CHECK_STATUS_FA[chk.status] === "ثبت شده" && (
 <Clock className={`h-3 w-3 me-1 ${dueSoon? "animate-due-soon": ""}`} />
 )}
 {CHECK_STATUS_FA[chk.status]}
 </Badge>
 </td>
 <td className="px-4 py-3">
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="مشاهده چک"
 onClick={() => handleViewCheck(chk)}
 >
 <Eye className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 aria-label="ویرایش چک"
 onClick={() => handleEditCheck(chk)}
 >
 <Pencil className="h-3.5 w-3.5" />
 </Button>
 {chk.status === "registered" && (
 <>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-success hover:text-success"
 aria-label="وصول چک"
 onClick={() => handleCollectCheck(chk)}
 >
 <CheckCircle2 className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-destructive hover:text-destructive"
 aria-label="برگشت چک"
 onClick={() => handleBounceCheck(chk)}
 >
 <RotateCcw className="h-3.5 w-3.5" />
 </Button>
 </>
 )}
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* حساب‌های بانکی — داده واقعی از /api/bank-accounts (CRITICAL: قبلاً آرایه‌ی خالی hardcoded بود) */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <CardTitle className="text-base flex items-center gap-2">
 <Landmark className="h-4 w-4 text-primary" />
 حساب‌های بانکی
 {bankAccounts.length > 0 && (
 <Badge variant="outline" className="text-[10px] font-normal">
 {toPersianDigits(bankAccounts.length)} حساب
 </Badge>
 )}
 </CardTitle>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 h-8"
 onClick={handleAddBankAccount}
 >
 <Plus className="h-3.5 w-3.5" />
 ثبت حساب بانکی
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 h-8"
 onClick={handleTransfer}
 >
 <ArrowLeftRight className="h-3.5 w-3.5" />
 انتقال وجه بین حساب‌ها
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {loadingBankAccounts? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): bankAccounts.length === 0? (
 <EmptyState
 icon={Landmark}
 title="هنوز حساب بانکی ثبت نشده"
 description="برای مدیریت موجودی و تسویه حساب‌ها، اولین حساب بانکی خود را با شماره کارت و شبا ثبت کنید."
 action={
 <Button size="sm" className="gap-1.5" onClick={handleAddBankAccount}>
 <Plus className="h-3.5 w-3.5" />
 ثبت حساب بانکی
 </Button>
 }
 />
 ): (
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
 {bankAccounts.map((acc) => {
 const Logo = bankLogoFor(acc.bankName);
 return (
 <div
 key={acc.id}
 className="rounded-xl bg-card border border-border relative overflow-hidden card-hover group"
 >
 {/* gradient accent header — نوار گرادیان نازک بالای کارت */}
 <div
 aria-hidden
 className="absolute inset-x-0 top-0 h-1.5 opacity-90"
 style={{
 background:
 "linear-gradient(90deg, var(--primary) 0%, var(--teal) 50%, var(--warning) 100%)",
 }}
 />
 <div className="p-4 relative">
 <div className="flex items-start justify-between mb-3 gradient-card-header -mx-4 -mt-4 px-4 py-3 rounded-t-xl border-b border-border/40">
 <div>
 <p className="font-bold text-sm">{acc.bankName}</p>
 <p className="text-xs text-muted-foreground mt-0.5">
 {acc.branch || "—"}
 </p>
 </div>
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-110">
 <Logo className="h-4 w-4" />
 </div>
 </div>
 <div className="mb-3 mt-3">
 <p className="text-[10px] text-muted-foreground mb-1">
 شماره حساب
 </p>
 <p className="font-mono text-sm tracking-wider tnum">
 {acc.accountNumber || "—"}
 </p>
 </div>
 <div className="mb-3">
 <p className="text-[10px] text-muted-foreground mb-1">
 {acc.cardNumber? "شماره کارت": "شبا"}
 </p>
 <p className="font-mono text-[10px] tracking-wide break-all" dir="ltr">
 {acc.cardNumber || acc.shaba || "—"}
 </p>
 </div>
 <div className="pt-3 border-t border-border">
 <p className="text-[10px] text-muted-foreground">موجودی</p>
 <p className="font-bold text-base tnum gradient-text">
 {formatToman(acc.balance)}
 </p>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>

 {/* دیالوگ ثبت چک جدید */}
 <Dialog open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <FileCheck2 className="h-4 w-4 text-primary" />
 ثبت چک جدید
 </DialogTitle>
 <DialogDescription>
 چک دریافتی یا پرداختی را با شماره صیادی و سررسید ثبت کنید.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="chk-number">شماره چک *</Label>
 <Input
 id="chk-number"
 dir="ltr"
 placeholder="123456"
 value={formNumber}
 onChange={(e) => {
 setFormNumber(e.target.value);
 if (formErrors.number) setFormErrors((p) => ({...p, number: "" }));
 }}
 className={formErrors.number? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!formErrors.number}
 />
 {formErrors.number && (
 <p className="text-xs text-destructive mt-1">{formErrors.number}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="chk-sayad">شماره صیادی</Label>
 <Input
 id="chk-sayad"
 dir="ltr"
 placeholder="۱۴..."
 value={formSayadId}
 onChange={(e) => setFormSayadId(e.target.value)}
 />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="chk-type">نوع چک</Label>
 <Select
 value={formType}
 onValueChange={(v) => setFormType(v as "received" | "paid")}
 >
 <SelectTrigger id="chk-type">
 <SelectValue placeholder="نوع چک" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="received">دریافتی</SelectItem>
 <SelectItem value="paid">پرداختی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="chk-party">طرف‌حساب (اختیاری)</Label>
 <Select value={formPartyId} onValueChange={setFormPartyId}>
 <SelectTrigger id="chk-party">
 <SelectValue placeholder="بدون طرف‌حساب" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">بدون طرف‌حساب</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="chk-bank">نام بانک *</Label>
 <Input
 id="chk-bank"
 placeholder="مثلاً: بانک ملت"
 value={formBank}
 onChange={(e) => {
 setFormBank(e.target.value);
 if (formErrors.bank) setFormErrors((p) => ({...p, bank: "" }));
 }}
 className={formErrors.bank? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!formErrors.bank}
 />
 {formErrors.bank && (
 <p className="text-xs text-destructive mt-1">{formErrors.bank}</p>
 )}
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="chk-due">تاریخ سررسید *</Label>
 <JalaliDatePicker
 id="chk-due"
 value={formDueDate}
 onChange={(v) => {
 setFormDueDate(v);
 if (formErrors.dueDate) setFormErrors((p) => ({...p, dueDate: "" }));
 }}
 placeholder="انتخاب تاریخ سررسید"
 className={formErrors.dueDate? "border-destructive focus-visible:ring-destructive": ""}
 />
 {formErrors.dueDate && (
 <p className="text-xs text-destructive mt-1">{formErrors.dueDate}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="chk-amount">مبلغ (تومان) *</Label>
 <Input
 id="chk-amount"
 inputMode="numeric"
 dir="ltr"
 placeholder="50000000"
 value={formAmount? toPersianDigits(formAmount): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setFormAmount(eng);
 if (formErrors.amount) setFormErrors((p) => ({...p, amount: "" }));
 }}
 className={`text-end font-mono ${formErrors.amount? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!formErrors.amount}
 />
 {formErrors.amount && (
 <p className="text-xs text-destructive mt-1">{formErrors.amount}</p>
 )}
 {formAmount && (
 <p className="text-[10px] text-muted-foreground tnum">
 معادل: {formatCompactToman(Number(formAmount))}
 </p>
 )}
 </div>
 </div>
 </div>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setCheckDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleSubmitCheck}
 disabled={submitting ||!isCheckFormValid}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ثبت چک
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ مشاهده چک */}
 <Dialog
 open={viewCheck!== null}
 onOpenChange={(open) =>!open && setViewCheck(null)}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Eye className="h-4 w-4 text-primary" />
 مشاهده چک
 </DialogTitle>
 <DialogDescription>
 جزئیات چک انتخاب‌شده.
 </DialogDescription>
 </DialogHeader>
 {viewCheck && (
 <div className="space-y-3 text-sm">
 <Row label="شماره صیادی" value={viewCheck.sayadi} />
 <Row label="نوع" value={CHECK_TYPE_FA[viewCheck.type]} />
 <Row label="مبلغ" value={formatToman(viewCheck.amount)} />
 <Row label="سررسید" value={viewCheck.dueDate} />
 <Row label="بانک" value={viewCheck.bank} />
 <Row label="وضعیت" value={CHECK_STATUS_FA[viewCheck.status]} />
 </div>
 )}
 <DialogFooter>
 <Button onClick={() => setViewCheck(null)}>بستن</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ تنخواه‌گردان */}
 <Dialog open={pettyDialogOpen} onOpenChange={setPettyDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <PiggyBank className="h-4 w-4 text-primary" />
 ثبت تنخواه‌گردان
 </DialogTitle>
 <DialogDescription>
 برای ثبت تنخواه، نام تنخواه، نگهدارنده و مبلغ اولیه را وارد کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="petty-name">نام تنخواه *</Label>
 <Input
 id="petty-name"
 placeholder="مثلاً: تنخواه اداری"
 value={pettyName}
 onChange={(e) => {
 setPettyName(e.target.value);
 if (pettyErrors.name) setPettyErrors((p) => ({...p, name: "" }));
 }}
 className={pettyErrors.name? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!pettyErrors.name}
 />
 {pettyErrors.name && (
 <p className="text-xs text-destructive mt-1">{pettyErrors.name}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="petty-custodian">نگهدارنده</Label>
 <Input
 id="petty-custodian"
 placeholder="نام شخص"
 value={pettyCustodian}
 onChange={(e) => setPettyCustodian(e.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="petty-amount">مبلغ اولیه (تومان) *</Label>
 <Input
 id="petty-amount"
 inputMode="numeric"
 dir="ltr"
 placeholder="2000000"
 value={pettyAmount? toPersianDigits(pettyAmount): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setPettyAmount(eng);
 if (pettyErrors.amount) setPettyErrors((p) => ({...p, amount: "" }));
 }}
 className={`text-end font-mono ${pettyErrors.amount? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!pettyErrors.amount}
 />
 {pettyErrors.amount && (
 <p className="text-xs text-destructive mt-1">{pettyErrors.amount}</p>
 )}
 </div>
 </div>
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setPettyDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handlePettySubmit}
 disabled={submitting ||!isPettyFormValid}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ثبت تنخواه
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* H5: دیالوگ ثبت وام */}
 <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <CreditCard className="h-4 w-4 text-primary" />
 ثبت وام جدید
 </DialogTitle>
 <DialogDescription>
 اطلاعات وام را وارد کنید. قسط ماهانه به‌صورت خودکار محاسبه می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="loan-title">عنوان وام *</Label>
 <Input
 id="loan-title"
 placeholder="مثلاً: وام توسعه‌ی کسب‌وکار"
 value={loanTitle}
 onChange={(e) => {
 setLoanTitle(e.target.value);
 if (loanErrors.title) setLoanErrors((p) => ({...p, title: "" }));
 }}
 className={loanErrors.title? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!loanErrors.title}
 />
 {loanErrors.title && (
 <p className="text-xs text-destructive mt-1">{loanErrors.title}</p>
 )}
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="loan-principal">مبلغ وام (تومان) *</Label>
 <Input
 id="loan-principal"
 inputMode="numeric"
 dir="ltr"
 placeholder="500000000"
 value={loanPrincipal? toPersianDigits(loanPrincipal): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setLoanPrincipal(eng);
 if (loanErrors.principal) setLoanErrors((p) => ({...p, principal: "" }));
 }}
 className={`text-end font-mono ${loanErrors.principal? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!loanErrors.principal}
 />
 {loanErrors.principal && (
 <p className="text-xs text-destructive mt-1">{loanErrors.principal}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="loan-rate">نرخ سود سالانه (٪)</Label>
 <Input
 id="loan-rate"
 inputMode="numeric"
 dir="ltr"
 placeholder="23"
 value={loanInterestRate? toPersianDigits(loanInterestRate): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹.]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setLoanInterestRate(eng);
 }}
 className="text-end font-mono"
 />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="loan-installments">تعداد اقساط *</Label>
 <Input
 id="loan-installments"
 inputMode="numeric"
 dir="ltr"
 placeholder="12"
 value={loanInstallments? toPersianDigits(loanInstallments): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setLoanInstallments(eng);
 if (loanErrors.installments) setLoanErrors((p) => ({...p, installments: "" }));
 }}
 className={`text-end font-mono ${loanErrors.installments? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!loanErrors.installments}
 />
 {loanErrors.installments && (
 <p className="text-xs text-destructive mt-1">{loanErrors.installments}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="loan-start">تاریخ شروع</Label>
 <JalaliDatePicker
 id="loan-start"
 value={loanStartDate}
 onChange={setLoanStartDate}
 placeholder="انتخاب تاریخ شروع"
 />
 </div>
 </div>
 </div>
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setLoanDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleLoanSubmit}
 disabled={submitting}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ثبت وام
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* H5: دیالوگ تسویه حساب */}
 <Dialog open={settlementDialogOpen} onOpenChange={setSettlementDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Receipt className="h-4 w-4 text-primary" />
 تسویه حساب با طرف‌حساب
 </DialogTitle>
 <DialogDescription>
 مبلغ تسویه را وارد کنید. این مبلغ به ترتیب تاریخ به فاکتورهای معوق اختصاص می‌یابد.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="settle-party-id">شناسه طرف‌حساب *</Label>
 <Input
 id="settle-party-id"
 dir="ltr"
 placeholder="cmp_..."
 value={settlementPartyId}
 onChange={(e) => {
 setSettlementPartyId(e.target.value);
 if (settlementErrors.partyId) setSettlementErrors((p) => ({...p, partyId: "" }));
 }}
 className={`font-mono text-xs ${settlementErrors.partyId? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!settlementErrors.partyId}
 />
 {settlementErrors.partyId && (
 <p className="text-xs text-destructive mt-1">{settlementErrors.partyId}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="settle-party-name">نام طرف‌حساب (اختیاری)</Label>
 <Input
 id="settle-party-name"
 placeholder="مثلاً: شرکت نمونه"
 value={settlementPartyName}
 onChange={(e) => setSettlementPartyName(e.target.value)}
 />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="settle-direction">نوع تسویه</Label>
 <Select
 value={settlementDirection}
 onValueChange={(v) => setSettlementDirection(v as "PAY" | "RECEIVE")}
 >
 <SelectTrigger id="settle-direction">
 <SelectValue placeholder="نوع تسویه" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="PAY">پرداخت به تأمین‌کننده</SelectItem>
 <SelectItem value="RECEIVE">دریافت از مشتری</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="settle-amount">مبلغ (تومان) *</Label>
 <Input
 id="settle-amount"
 inputMode="numeric"
 dir="ltr"
 placeholder="50000000"
 value={settlementAmount? toPersianDigits(settlementAmount): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setSettlementAmount(eng);
 if (settlementErrors.amount) setSettlementErrors((p) => ({...p, amount: "" }));
 }}
 className={`text-end font-mono ${settlementErrors.amount? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!settlementErrors.amount}
 />
 {settlementErrors.amount && (
 <p className="text-xs text-destructive mt-1">{settlementErrors.amount}</p>
 )}
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="settle-desc">توضیحات (اختیاری)</Label>
 <Input
 id="settle-desc"
 placeholder="مثلاً: تسویه فاکتورهای مهر"
 value={settlementDescription}
 onChange={(e) => setSettlementDescription(e.target.value)}
 />
 </div>
 </div>
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setSettlementDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleSettlementSubmit}
 disabled={submitting}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ثبت تسویه
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* H5: دیالوگ انتقال وجه */}
 <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <ArrowLeftRight className="h-4 w-4 text-primary" />
 انتقال وجه بین حساب‌ها
 </DialogTitle>
 <DialogDescription>
 موجودی حساب مبدأ به‌صورت اتمیک کسر و به حساب مقصد افزوده می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 {bankAccounts.length === 0? (
 <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
 هنوز حساب بانکی ثبت نشده. ابتدا با دکمه‌ی «ثبت حساب بانکی» یک حساب ایجاد کنید.
 </p>
 ): (
 <>
 <div className="space-y-1.5">
 <Label htmlFor="transfer-from">حساب مبدأ *</Label>
 <Select value={transferFromId} onValueChange={setTransferFromId}>
 <SelectTrigger id="transfer-from">
 <SelectValue placeholder="انتخاب حساب مبدأ" />
 </SelectTrigger>
 <SelectContent>
 {bankAccounts.map((a) => (
 <SelectItem key={a.id} value={a.id}>
 {a.bankName} — {a.accountNumber} (موجودی: {formatCompactToman(a.balance)})
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 {transferErrors.fromAccountId && (
 <p className="text-xs text-destructive mt-1">{transferErrors.fromAccountId}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="transfer-to">حساب مقصد *</Label>
 <Select value={transferToId} onValueChange={setTransferToId}>
 <SelectTrigger id="transfer-to">
 <SelectValue placeholder="انتخاب حساب مقصد" />
 </SelectTrigger>
 <SelectContent>
 {bankAccounts.map((a) => (
 <SelectItem key={a.id} value={a.id}>
 {a.bankName} — {a.accountNumber} (موجودی: {formatCompactToman(a.balance)})
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 {transferErrors.toAccountId && (
 <p className="text-xs text-destructive mt-1">{transferErrors.toAccountId}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="transfer-amount">مبلغ انتقال (تومان) *</Label>
 <Input
 id="transfer-amount"
 inputMode="numeric"
 dir="ltr"
 placeholder="10000000"
 value={transferAmount? toPersianDigits(transferAmount): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setTransferAmount(eng);
 if (transferErrors.amount) setTransferErrors((p) => ({...p, amount: "" }));
 }}
 className={`text-end font-mono ${transferErrors.amount? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!transferErrors.amount}
 />
 {transferErrors.amount && (
 <p className="text-xs text-destructive mt-1">{transferErrors.amount}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="transfer-desc">توضیحات (اختیاری)</Label>
 <Input
 id="transfer-desc"
 placeholder="مثلاً: جابجایی سرمایه"
 value={transferDescription}
 onChange={(e) => setTransferDescription(e.target.value)}
 />
 </div>
 </>
 )}
 </div>
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setTransferDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleTransferSubmit}
 disabled={submitting || bankAccounts.length === 0}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <ArrowLeftRight className="h-4 w-4" />
 )}
 ثبت انتقال
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* H5: دیالوگ ثبت حساب بانکی */}
 <Dialog open={bankAcctDialogOpen} onOpenChange={setBankAcctDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Landmark className="h-4 w-4 text-primary" />
 ثبت حساب بانکی جدید
 </DialogTitle>
 <DialogDescription>
 اطلاعات حساب را وارد کنید. موجودی اولیه به ریال در دیتابیس ذخیره می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="ba-bank">نام بانک *</Label>
 <Input
 id="ba-bank"
 placeholder="مثلاً: بانک ملت"
 value={baBankName}
 onChange={(e) => {
 setBaBankName(e.target.value);
 if (baErrors.bankName) setBaErrors((p) => ({...p, bankName: "" }));
 }}
 className={baErrors.bankName? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!baErrors.bankName}
 />
 {baErrors.bankName && (
 <p className="text-xs text-destructive mt-1">{baErrors.bankName}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="ba-branch">شعبه</Label>
 <Input
 id="ba-branch"
 placeholder="مثلاً: مرکزی"
 value={baBranch}
 onChange={(e) => setBaBranch(e.target.value)}
 />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="ba-account">شماره حساب *</Label>
 <Input
 id="ba-account"
 dir="ltr"
 placeholder="1234567890"
 value={baAccountNumber}
 onChange={(e) => {
 setBaAccountNumber(e.target.value);
 if (baErrors.accountNumber) setBaErrors((p) => ({...p, accountNumber: "" }));
 }}
 className={`font-mono text-xs ${baErrors.accountNumber? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!baErrors.accountNumber}
 />
 {baErrors.accountNumber && (
 <p className="text-xs text-destructive mt-1">{baErrors.accountNumber}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="ba-card">شماره کارت</Label>
 <Input
 id="ba-card"
 dir="ltr"
 placeholder="6219-8601-..."
 value={baCardNumber}
 onChange={(e) => setBaCardNumber(e.target.value)}
 className="font-mono text-xs"
 />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="ba-shaba">شماره شبا</Label>
 <Input
 id="ba-shaba"
 dir="ltr"
 placeholder="IR00 0170..."
 value={baShaba}
 onChange={(e) => setBaShaba(e.target.value)}
 className="font-mono text-xs"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="ba-type">نوع حساب</Label>
 <Select
 value={baType}
 onValueChange={(v) => setBaType(v as "CURRENT" | "SAVING" | "LOAN")}
 >
 <SelectTrigger id="ba-type">
 <SelectValue placeholder="نوع حساب" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="CURRENT">جاری</SelectItem>
 <SelectItem value="SAVING">پس‌انداز</SelectItem>
 <SelectItem value="LOAN">قرض‌الحسنه</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="ba-balance">موجودی اولیه (تومان)</Label>
 <Input
 id="ba-balance"
 inputMode="numeric"
 dir="ltr"
 placeholder="0"
 value={baBalance? toPersianDigits(baBalance): ""}
 onChange={(e) => {
 const raw = e.target.value.replace(/[^\d۰-۹]/g, "");
 const eng = raw.replace(/[۰-۹]/g, (d) =>
 String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 );
 setBaBalance(eng);
 }}
 className="text-end font-mono"
 />
 {baBalance && (
 <p className="text-[10px] text-muted-foreground tnum">
 معادل: {formatCompactToman(Number(baBalance) * 10)} ریال
 </p>
 )}
 </div>
 </div>
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setBankAcctDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleBankAcctSubmit}
 disabled={submitting}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ثبت حساب
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* H5: دیالوگ ویرایش چک — به‌روزرسانی وضعیت */}
 <Dialog open={editCheckDialogOpen} onOpenChange={setEditCheckDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Pencil className="h-4 w-4 text-primary" />
 ویرایش چک
 </DialogTitle>
 <DialogDescription>
 وضعیت چک را به‌روزرسانی کنید. سایر فیلدها در نسخه‌های بعدی قابل ویرایش خواهند بود.
 </DialogDescription>
 </DialogHeader>
 {editCheckRow && (
 <div className="space-y-3 text-sm">
 <Row label="شماره صیادی" value={editCheckRow.sayadi} />
 <Row label="نوع" value={CHECK_TYPE_FA[editCheckRow.type]} />
 <Row label="مبلغ" value={formatToman(editCheckRow.amount)} />
 <Row label="سررسید" value={editCheckRow.dueDate} />
 <Row label="بانک" value={editCheckRow.bank} />
 {editCheckRow.status === "registered"? (
 <div className="space-y-1.5 pt-2">
 <Label htmlFor="edit-status">وضعیت جدید</Label>
 <Select
 value={editCheckStatus}
 onValueChange={(v) => setEditCheckStatus(v as "COLLECTED" | "BOUNCED")}
 >
 <SelectTrigger id="edit-status">
 <SelectValue placeholder="انتخاب وضعیت" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="COLLECTED">وصول شده</SelectItem>
 <SelectItem value="BOUNCED">برگشت خورده</SelectItem>
 </SelectContent>
 </Select>
 <p className="text-[10px] text-muted-foreground">
 وصول چک، موجودی حساب بانکی و سند حسابداری را به‌روزرسانی می‌کند.
 </p>
 </div>
 ): (
 <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
 وضعیت این چک «{CHECK_STATUS_FA[editCheckRow.status]}» و نهایی است —
 تغییر وضعیت مجاز نیست.
 </p>
 )}
 </div>
 )}
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setEditCheckDialogOpen(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleEditCheckSubmit}
 disabled={submitting ||!editCheckRow?.id || editCheckRow?.status !== "registered"}
 >
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CheckCircle2 className="h-4 w-4" />
 )}
 ذخیره تغییرات
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {ConfirmDialogComponent}
 </div>
 );
}

function Row({ label, value }: { label: string; value: string }) {
 return (
 <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
 <span className="text-muted-foreground text-xs">{label}</span>
 <span className="font-medium text-end">{value}</span>
 </div>
 );
}

function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent,
}: {
 icon: typeof Wallet;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "warning" | "info" | "success";
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <div
 className={`flex h-10 w-10 items-center justify-center rounded-lg ${
 ACCENT_MAP[accent] || ACCENT_MAP.primary
 }`}
 >
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="font-bold text-base truncate">{value}</p>
 <p className="text-[10px] text-muted-foreground">{sub}</p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
}
