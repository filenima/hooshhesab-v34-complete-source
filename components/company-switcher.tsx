"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Building2,
 ChevronDown,
 Plus,
 Check,
 Loader2,
 Building,
 CircleDot,
 ArrowRight,
 RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

/* ============ انواع ============ */
interface CompanyInfo {
 id: string;
 name: string;
 plan: string;
 status: string;
 role: string;
}

interface CompanySwitcherProps {
 token: string;
 onSwitch: (newToken: string) => void;
}

const PLAN_LABEL: Record<string, string> = {
 starter: "پایه",
 business: "کسب‌وکار",
 enterprise: "سازمانی",
 accountant: "حسابدار",
};

const PLAN_COLOR: Record<string, string> = {
 starter: "bg-muted text-muted-foreground",
 business: "bg-primary/10 text-primary",
 enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
 accountant: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const STATUS_LABEL: Record<string, string> = {
 active: "فعال",
 suspended: "معلق",
 cancelled: "لغو شده",
};

const ROLE_LABEL: Record<string, string> = {
 ADMIN: "مدیر",
 ACCOUNTANT: "حسابدار",
 MANAGER: "کاربر مدیریتی",
 USER: "کاربر",
};

const CURRENT_TENANT_KEY = "hoshhesab_current_tenant_id";

/* ============ کامپوننت اصلی ============ */
export function CompanySwitcher({ token, onSwitch }: CompanySwitcherProps) {
 const { toast } = useToast();
 const [open, setOpen] = React.useState(false);
 const [companies, setCompanies] = React.useState<CompanyInfo[]>([]);
 const [currentTenantId, setCurrentTenantId] = React.useState<string | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [switching, setSwitching] = React.useState<string | null>(null);
 const [createOpen, setCreateOpen] = React.useState(false);
 const [newName, setNewName] = React.useState("");
 const [newPlan, setNewPlan] = React.useState("starter");
 const [creating, setCreating] = React.useState(false);

 const currentCompany = React.useMemo(
 () => companies.find((c) => c.id === currentTenantId) || companies[0] || null,
 [companies, currentTenantId]
 );

 // بارگذاری tenant فعلی از localStorage
 React.useEffect(() => {
 try {
 const stored = localStorage.getItem(CURRENT_TENANT_KEY);
 if (stored) setCurrentTenantId(stored);
 } catch {
 /* ignore */
 }
 }, []);

 const fetchCompanies = React.useCallback(async () => {
 if (!token) return;
 setLoading(true);
 try {
 const res = await fetch("/api/user/companies", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (data.success && Array.isArray(data.data)) {
 setCompanies(data.data);
 if (data.currentTenantId) {
 setCurrentTenantId(data.currentTenantId);
 try {
 localStorage.setItem(CURRENT_TENANT_KEY, data.currentTenantId);
 } catch {
 /* ignore */
 }
 }
 }
 } catch {
 /* ignore */
 } finally {
 setLoading(false);
 }
 }, [token]);

 // هنگام باز شدن دیالوگ، فهرست شرکت‌ها را بارگذاری می‌کنیم
 React.useEffect(() => {
 if (open && token) {
 fetchCompanies();
 }
 }, [open, token, fetchCompanies]);

 const handleSwitch = React.useCallback(
 async (target: CompanyInfo) => {
 if (target.id === currentTenantId) {
 setOpen(false);
 return;
 }
 setSwitching(target.id);
 try {
 const res = await fetch("/api/auth/switch-company", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ tenantId: target.id }),
 });
 const data = await res.json();
 if (!data.success ||!data.token) {
 throw new Error(data.error || "خطا در سوییچ شرکت");
 }
 setCurrentTenantId(target.id);
 try {
 localStorage.setItem(CURRENT_TENANT_KEY, target.id);
 } catch {
 /* ignore */
 }
 onSwitch(data.token);
 setOpen(false);
 toast({
 title: "شرکت سوییچ شد",
 description: `به شرکت «${target.name}» وارد شدید.`,
 });
 } catch (err) {
 toast({
 title: "خطا در سوییچ",
 description:
 err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setSwitching(null);
 }
 },
 [token, currentTenantId, onSwitch, toast]
 );

 const handleCreate = React.useCallback(async () => {
 const name = newName.trim();
 if (name.length < 2) {
 toast({
 title: "نام شرکت الزامی است",
 description: "حداقل ۲ کاراکتر وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setCreating(true);
 try {
 const res = await fetch("/api/user/companies", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ name, plan: newPlan }),
 });
 const data = await res.json();
 if (!data.success ||!data.token) {
 throw new Error(data.error || "خطا در ایجاد شرکت");
 }
 // refresh list
 await fetchCompanies();
 // سوییچ خودکار به شرکت جدید
 if (data.data?.id) {
 const newCompany: CompanyInfo = {
 id: data.data.id,
 name: data.data.name,
 plan: data.data.plan,
 status: data.data.status,
 role: data.data.role || "ADMIN",
 };
 setCompanies((prev) =>
 prev.some((c) => c.id === newCompany.id)? prev: [...prev, newCompany]
 );
 setCurrentTenantId(newCompany.id);
 try {
 localStorage.setItem(CURRENT_TENANT_KEY, newCompany.id);
 } catch {
 /* ignore */
 }
 onSwitch(data.token);
 }
 setCreateOpen(false);
 setNewName("");
 setNewPlan("starter");
 toast({
 title: "شرکت ایجاد شد",
 description: `شرکت «${name}» ایجاد و وارد آن شدید.`,
 });
 } catch (err) {
 toast({
 title: "خطا در ایجاد شرکت",
 description:
 err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setCreating(false);
 }
 }, [newName, newPlan, token, onSwitch, toast, fetchCompanies]);

 return (
 <>
 {/* دکمه نمایش شرکت فعلی */}
 <Button
 variant="outline"
 size="sm"
 className="hidden sm:inline-flex h-9 gap-2 max-w-[180px] sm:max-w-[240px] px-2.5"
 onClick={() => setOpen(true)}
 disabled={!token}
 aria-label="تغییر شرکت"
 >
 <Building2 className="h-4 w-4 text-primary shrink-0" />
 <span className="truncate text-xs sm:text-sm font-medium hidden sm:inline">
 {currentCompany? currentCompany.name: "انتخاب شرکت"}
 </span>
 <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-muted-foreground shrink-0" />
 </Button>

 {/* دیالوگ اصلی — فهرست شرکت‌ها */}
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 انتخاب شرکت
 </DialogTitle>
 <DialogDescription>
 شرکتی که می‌خواهید وارد آن شوید را انتخاب کنید
 </DialogDescription>
 </DialogHeader>

 <div className="flex items-center justify-between">
 <p className="text-xs text-muted-foreground">
 {loading
? "در حال بارگذاری..."
: `${toPersianDigits(companies.length)} شرکت در دسترس`}
 </p>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs gap-1.5 text-muted-foreground"
 onClick={fetchCompanies}
 disabled={loading}
 >
 <RefreshCw
 className={`h-3 w-3 ${loading? "animate-spin": ""}`}
 />
 به‌روزرسانی
 </Button>
 </div>

 {/* لیست شرکت‌ها */}
 <div className="max-h-80 overflow-y-auto space-y-2 pe-1">
 {loading && companies.length === 0? (
 <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin mb-2" />
 <p className="text-xs">در حال بارگذاری شرکت‌ها...</p>
 </div>
 ): companies.length === 0? (
 <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
 <Building className="h-8 w-8 mb-2 opacity-50" />
 <p className="text-sm font-medium text-foreground mb-1">
 هنوز شرکتی وجود ندارد
 </p>
 <p className="text-xs text-muted-foreground text-center max-w-xs">
 اولین شرکت خود را ایجاد کنید تا شروع به کار کنید.
 </p>
 </div>
 ): (
 <AnimatePresence>
 {companies.map((company) => {
 const isCurrent = company.id === currentTenantId;
 const isSwitching = switching === company.id;
 return (
 <motion.div
 key={company.id}
 layout
 initial={{ opacity: 0, y: 4 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -4 }}
 transition={{ duration: 0.15 }}
 className={`relative rounded-lg border p-3 transition-colors ${
 isCurrent
? "border-primary/40 bg-primary/5"
: "border-border hover:border-primary/30 hover:bg-muted/40"
 }`}
 >
 <div className="flex items-start gap-3">
 <div
 className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
 isCurrent
? "bg-primary text-primary-foreground"
: "bg-muted text-muted-foreground"
 }`}
 >
 <Building2 className="h-5 w-5" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <p className="text-sm font-semibold text-foreground truncate">
 {company.name}
 </p>
 {isCurrent && (
 <Badge
 variant="secondary"
 className="bg-primary/10 text-primary text-[10px] gap-0.5 h-5"
 >
 <Check className="h-2.5 w-2.5" />
 فعلی
 </Badge>
 )}
 </div>
 <div className="flex flex-wrap items-center gap-1.5">
 <Badge
 variant="secondary"
 className={`text-[10px] h-5 ${
 PLAN_COLOR[company.plan] ||
 "bg-muted text-muted-foreground"
 }`}
 >
 {PLAN_LABEL[company.plan] || company.plan}
 </Badge>
 <Badge
 variant="secondary"
 className={`text-[10px] h-5 ${
 company.status === "active"
? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
: "bg-muted text-muted-foreground"
 }`}
 >
 <CircleDot className="h-2.5 w-2.5" />
 {STATUS_LABEL[company.status] || company.status}
 </Badge>
 <span className="text-[10px] text-muted-foreground">
 {ROLE_LABEL[company.role] || company.role}
 </span>
 </div>
 </div>
 <Button
 size="sm"
 variant={isCurrent? "outline": "default"}
 className="h-7 gap-1 text-xs shrink-0"
 disabled={isCurrent || isSwitching}
 onClick={() => handleSwitch(company)}
 >
 {isSwitching? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): (
 <ArrowRight className="h-3 w-3" />
 )}
 {isCurrent? "فعلی": "ورود"}
 </Button>
 </div>
 </motion.div>
 );
 })}
 </AnimatePresence>
 )}
 </div>

 {/* دکمه افزودن شرکت جدید */}
 <div className="pt-2 border-t border-border">
 <Button
 variant="outline"
 className="w-full h-10 gap-1.5 border-dashed"
 onClick={() => setCreateOpen(true)}
 >
 <Plus className="h-4 w-4 text-primary" />
 افزودن شرکت جدید
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 {/* دیالوگ ایجاد شرکت جدید */}
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Plus className="h-4 w-4 text-primary" />
 ایجاد شرکت جدید
 </DialogTitle>
 <DialogDescription>
 یک شرکت (Tenant) جدید بسازید و به‌عنوان مدیر آن وارد شوید
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="company-name" className="text-xs">
 نام شرکت
 </Label>
 <Input
 id="company-name"
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 placeholder="مثال: فروشگاه آرمان پخش"
 maxLength={80}
 autoFocus
 />
 </div>
 <div className="space-y-2">
 <Label className="text-xs">پلن انتخابی</Label>
 <Select value={newPlan} onValueChange={setNewPlan}>
 <SelectTrigger className="h-10">
 <SelectValue placeholder="انتخاب پلن" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="starter">پایه — برای کسب‌وکارهای کوچک</SelectItem>
 <SelectItem value="business">کسب‌وکار — امکانات کامل</SelectItem>
 <SelectItem value="enterprise">سازمانی — چند کاربره</SelectItem>
 <SelectItem value="accountant">حسابدار — چند شرکتی</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground leading-relaxed">
 شما به‌عنوان مدیر (ADMIN) شرکت جدید دسترسی کامل خواهید داشت. پس از
 ایجاد، به‌طور خودکار به شرکت جدید سوییچ می‌شوید.
 </div>
 </div>
 <DialogFooter>
 <Button
 variant="ghost"
 onClick={() => setCreateOpen(false)}
 disabled={creating}
 >
 انصراف
 </Button>
 <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
 {creating? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Plus className="h-4 w-4" />
 )}
 ایجاد شرکت
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>
 );
}

export default CompanySwitcher;
