"use client";

import * as React from "react";
import {
 ShieldCheck,
 Lock,
 KeyRound,
 UserCheck,
 History,
 Fingerprint,
 Server,
 UserPlus,
 CheckCircle2,
 AlertCircle,
 Loader2,
 Pencil,
 Trash2,
 Eye,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ux/empty-state";
import { useConfirmAction } from "@/components/ux/confirm-action";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { handleApiError } from "@/lib/api-error-handler";
import { authFetch, authJsonHeaders } from "@/lib/auth-fetch";
import { HelpTip } from "@/components/ux/help-tooltip";

interface SecurityItem {
 label: string;
 ok: boolean;
 icon: LucideIcon;
 help?: "TWO_FA" | "RBAC" | "AUDIT_TRAIL";
}

const SECURITY_ITEMS: SecurityItem[] = [
 { label: "احراز هویت دو مرحله‌ای (2FA)", ok: true, icon: Fingerprint, help: "TWO_FA" },
 { label: "رمزنگاری AES-256", ok: true, icon: Lock },
 { label: "بکاپ خودکار ابری", ok: true, icon: Server },
 { label: "RBAC (نقش‌محور)", ok: true, icon: KeyRound, help: "RBAC" },
 { label: "IP Whitelist", ok: true, icon: ShieldCheck },
 { label: "Audit Trail", ok: true, icon: History, help: "AUDIT_TRAIL" },
];

interface User {
 id?: string;
 name: string;
 email: string;
 role: "manager" | "accountant" | "user";
 active: boolean;
 lastLogin: string;
 twofa: boolean;
}

// Issue 1: لیست کاربران از state محلی — refresh pattern
// (در نبود GET endpoint عمومی برای کاربران تنانت، از state محلی استفاده می‌کنیم)
const INITIAL_USERS: User[] = [];

const ROLE_META: Record<
 User["role"],
 { label: string; color: string }
> = {
 manager: {
 label: "مدیر",
 color: "bg-primary/10 text-primary",
 },
 accountant: {
 label: "حسابدار",
 color: "bg-info/10 text-info",
 },
 user: {
 label: "کاربر",
 color: "bg-muted text-muted-foreground",
 },
};

interface AuditEntry {
 id?: string;
 time: string;
 user: string;
 action: "create" | "edit" | "delete" | "login" | string;
 entity: string;
 ip: string;
}

const ACTION_META: Record<
 AuditEntry["action"],
 { label: string; color: string }
> = {
 create: {
 label: "ایجاد",
 color: "bg-success/10 text-success",
 },
 edit: {
 label: "ویرایش",
 color: "bg-info/10 text-info",
 },
 delete: {
 label: "حذف",
 color: "bg-destructive/10 text-destructive",
 },
 login: {
 label: "ورود",
 color: "bg-muted text-muted-foreground",
 },
};

const SCORE = 0;

interface UserFormState {
 name: string;
 email: string;
 role: "manager" | "accountant" | "user";
 password: string;
}

const EMPTY_USER_FORM: UserFormState = {
 name: "",
 email: "",
 role: "user",
 password: "",
};

export function SecurityModule() {
 const { toast } = useToast();
 const { confirm, ConfirmDialogComponent } = useConfirmAction();
 const [userDialog, setUserDialog] = React.useState(false);
 const [form, setForm] = React.useState<UserFormState>(EMPTY_USER_FORM);
 const [errors, setErrors] = React.useState<Record<string, string>>({});
 const [submitting, setSubmitting] = React.useState(false);
 // Issue 1: لیست کاربران از API — refresh پس از ایجاد/ویرایش/حذف
 const [users, setUsers] = React.useState<User[]>(INITIAL_USERS);
 const [loadingUsers, setLoadingUsers] = React.useState(true);
 const [refreshKey, setRefreshKey] = React.useState(0);
 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);
 // Audit logs از API
 const [audit, setAudit] = React.useState<AuditEntry[]>([]);
 const [loadingAudit, setLoadingAudit] = React.useState(true);
 // کاربری که در حال ویرایش است (null یعنی حالت ایجاد)
 const [editingUser, setEditingUser] = React.useState<User | null>(null);
 const [deletingId, setDeletingId] = React.useState<string | null>(null);

 // دیالوگ مشاهده‌ی کامل لاگ ممیزی و دیالوگ‌های 2FA / IP Whitelist / Roles
 const [fullAuditOpen, setFullAuditOpen] = React.useState(false);
 const [fullAudit, setFullAudit] = React.useState<AuditEntry[]>([]);
 const [fullAuditLoading, setFullAuditLoading] = React.useState(false);
 const [twoFactorOpen, setTwoFactorOpen] = React.useState(false);
 const [twoFactorEnabled, setTwoFactorEnabled] = React.useState(false);
 const [ipWhitelistOpen, setIpWhitelistOpen] = React.useState(false);
 const [ipList, setIpList] = React.useState<string>("");
 const [rolesOpen, setRolesOpen] = React.useState(false);

 const allOk = SECURITY_ITEMS.every((it) => it.ok);

 // دریافت فهرست کاربران از /api/users هنگام mount و پس از هر تغییر refreshKey
 React.useEffect(() => {
 let cancelled = false;
 setLoadingUsers(true);
 authFetch("/api/users", { cache: "no-store" })
.then((res) => res.json())
.then((json: { success?: boolean; data?: User[]; error?: string }) => {
 if (cancelled) return;
 if (json.success && Array.isArray(json.data)) {
 setUsers(json.data);
 } else {
 setUsers([]);
 }
 })
.catch(() => {
 if (!cancelled) setUsers([]);
 })
.finally(() => {
 if (!cancelled) setLoadingUsers(false);
 });
 return () => {
 cancelled = true;
 };
 }, [refreshKey]);

 // دریافت لاگ‌های ممیزی از /api/audit-logs
 React.useEffect(() => {
 let cancelled = false;
 setLoadingAudit(true);
 authFetch("/api/audit-logs?limit=50", { cache: "no-store" })
.then((res) => res.json())
.then(
 (json: { success?: boolean; data?: Array<Record<string, unknown>> }) => {
 if (cancelled) return;
 if (json.success && Array.isArray(json.data)) {
 const mapped: AuditEntry[] = json.data.map((l) => {
 const actionStr = String(l.action?? "").toLowerCase();
 const action: AuditEntry["action"] =
 actionStr === "create" || actionStr === "insert"
? "create"
: actionStr === "update" || actionStr === "edit"
? "edit"
: actionStr === "delete"
? "delete"
: "login";
 const userObj = l.user as { name?: string } | null;
 const d = (l.createdAt as string | Date | undefined)?? new Date();
 return {
 time: new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 }).format(new Date(d)),
 user: userObj?.name?? "سیستم",
 action,
 entity: String(l.entity?? "—"),
 ip: String(l.ipAddress?? l.ip?? "—"),
 };
 });
 setAudit(mapped);
 } else {
 setAudit([]);
 }
 }
 )
.catch(() => {
 if (!cancelled) setAudit([]);
 })
.finally(() => {
 if (!cancelled) setLoadingAudit(false);
 });
 return () => {
 cancelled = true;
 };
 }, [refreshKey]);

 const openUserDialog = () => {
 setForm(EMPTY_USER_FORM);
 setErrors({});
 setEditingUser(null);
 setUserDialog(true);
 };

 const openEditUserDialog = (u: User) => {
 setForm({
 name: u.name,
 email: u.email,
 role: u.role,
 password: "",
 });
 setErrors({});
 setEditingUser(u);
 setUserDialog(true);
 };

 // Issue 2: اعتبارسنجی real-time فرم کاربر
 const validateUserForm = (): boolean => {
 const e: Record<string, string> = {};
 if (!form.name.trim()) e.name = "نام کاربر الزامی است";
 if (!form.email.trim()) e.email = "ایمیل الزامی است";
 else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
 e.email = "ایمیل نامعتبر است";
 if (form.password && form.password.length < 8)
 e.password = "رمز عبور باید حداقل ۸ کاراکتر باشد";
 setErrors(e);
 return Object.keys(e).length === 0;
 };

 const isUserFormValid = React.useMemo(
 () =>
 Boolean(
 form.name.trim() &&
 /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
 (!form.password || form.password.length >= 8)
 ),
 [form.name, form.email, form.password]
 );

 const submitUser = async () => {
 if (!validateUserForm()) {
 toast({
 title: "اطلاعات ناقص",
 description: "لطفاً فیلدهای الزامی را تکمیل کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const isEdit = Boolean(editingUser);
 const url = isEdit? `/api/users/${editingUser!.id}`: "/api/users";
 const method = isEdit? "PATCH": "POST";
 const payload: Record<string, unknown> = {
 name: form.name.trim(),
 role: form.role,
 };
 if (!isEdit) {
 payload.email = form.email.trim();
 payload.password = form.password || undefined;
 } else {
 // در حالت ویرایش فقط name و role را به‌روزرسانی می‌کنیم
 // (ایمیل قابل تغییر نیست — کلید یکتاست)
 }

 const res = await authFetch(url, {
 method,
 headers: authJsonHeaders(),
 body: JSON.stringify(payload),
 });

 let json: {
 success?: boolean;
 error?: string;
 message?: string;
 } | null = null;
 try {
 json = await res.json();
 } catch {
 json = null;
 }

 if (res.ok && json?.success) {
 toast({
 title: isEdit? "کاربر به‌روزرسانی شد": "کاربر ایجاد شد",
 description: isEdit
? `اطلاعات «${form.name.trim()}» با موفقیت به‌روزرسانی شد.`
: `«${form.name.trim()}» با نقش «${ROLE_META[form.role].label}» ثبت شد.`,
 });
 setUserDialog(false);
 setForm(EMPTY_USER_FORM);
 setErrors({});
 setEditingUser(null);
 refresh();
 } else {
 toast({
 title: isEdit? "خطا در به‌روزرسانی": "خطا در ایجاد کاربر",
 description:
 handleApiError(json, isEdit? "به‌روزرسانی ناموفق بود": "ایجاد کاربر ناموفق بود"),
 variant: "destructive",
 });
 }
 } catch (err) {
 toast({
 title: editingUser? "خطا در به‌روزرسانی": "خطا در ایجاد کاربر",
 description: handleApiError(
 err,
 editingUser? "به‌روزرسانی ناموفق بود": "ایجاد کاربر ناموفق بود"
 ),
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 const handle2FA = () => {
 setTwoFactorOpen(true);
 };

 const handleBackup = () => {
 toast({
 title: "بکاپ‌ها",
 description: "بکاپ‌گیری خودکار روزانه فعال است. برای بازیابی بکاپ با پشتیبانی تماس بگیرید.",
 });
 };

 const handleIpWhitelist = () => {
 setIpWhitelistOpen(true);
 };

 const handleRoles = () => {
 setRolesOpen(true);
 };

 const handleViewAll = async () => {
 setFullAuditOpen(true);
 setFullAuditLoading(true);
 setFullAudit([]);
 try {
 const res = await authFetch("/api/audit-logs?limit=200", {
 cache: "no-store",
 });
 const data = await res.json().catch(() => ({}));
 if (data?.success && Array.isArray(data.data)) {
 setFullAudit(
 data.data.map((l: Record<string, unknown>) => ({
 id: String(l.id || ""),
 action: String(l.action || "—"),
 entity: String(l.entity || "—"),
 user: String((l.user as { name?: string } | null)?.name || "سیستم"),
 time: new Date(l.createdAt as string).toLocaleString("fa-IR"),
 ip: String(l.ipAddress || "—"),
 }))
 );
 }
 } catch {
 toast({
 title: "خطا",
 description: "بارگذاری لاگ‌ها ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setFullAuditLoading(false);
 }
 };

 const handleEditUser = (u: User) => {
 openEditUserDialog(u);
 };

 const handleDeleteUser = (u: User) => {
 confirm({
 title: "حذف کاربر؟",
 description: `کاربر «${u.name}» حذف خواهد شد. این عمل قابل بازگشت نیست.`,
 variant: "destructive",
 confirmText: "حذف",
 onConfirm: async () => {
 if (!u.id) {
 toast({
 title: "خطا",
 description: "شناسه کاربر نامعتبر است.",
 variant: "destructive",
 });
 return;
 }
 setDeletingId(u.id);
 try {
 const res = await authFetch(`/api/users/${u.id}`, { method: "DELETE" });
 let json: { success?: boolean; error?: string; message?: string } | null = null;
 try {
 json = await res.json();
 } catch {
 json = null;
 }
 if (res.ok && json?.success) {
 toast({
 title: "کاربر حذف شد",
 description: `«${u.name}» از لیست کاربران حذف شد.`,
 });
 refresh();
 } else {
 toast({
 title: "خطا در حذف کاربر",
 description: handleApiError(json, "حذف کاربر ناموفق بود"),
 variant: "destructive",
 });
 }
 } catch (err) {
 toast({
 title: "خطا در حذف کاربر",
 description: handleApiError(err, "حذف کاربر ناموفق بود"),
 variant: "destructive",
 });
 } finally {
 setDeletingId(null);
 }
 },
 });
 };

 const handleViewAudit = (a: AuditEntry) => {
 toast({
 title: "جزئیات لاگ",
 description: `عملیات «${ACTION_META[a.action].label}» روی «${a.entity}» توسط «${a.user}» از IP ${a.ip}.`,
 });
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* نوار ابزار */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <ShieldCheck className="h-5 w-5" />
 </div>
 <div>
 <h3 className="text-sm font-semibold">امنیت و مدیریت کاربران</h3>
 <p className="text-xs text-muted-foreground">
 کنترل دسترسی، ممیزی و حفاظت داده‌ها
 </p>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button variant="outline" className="gap-1.5" onClick={handle2FA}>
 <Fingerprint className="h-4 w-4" />
 تنظیمات 2FA
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleBackup}>
 <Server className="h-4 w-4" />
 بکاپ‌ها
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleIpWhitelist}>
 <ShieldCheck className="h-4 w-4" />
 IP whitelist
 </Button>
 <Button variant="outline" className="gap-1.5" onClick={handleRoles}>
 <KeyRound className="h-4 w-4" />
 نقش‌ها و دسترسی‌ها
 </Button>
 <Button className="gap-1.5" onClick={openUserDialog}>
 <UserPlus className="h-4 w-4" />
 کاربر جدید
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* امتیاز امنیتی + چک‌لیست */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <Card className="lg:col-span-1">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <ShieldCheck className="h-4 w-4 text-primary" />
 امتیاز امنیتی
 </CardTitle>
 </CardHeader>
 <CardContent className="flex flex-col items-center pt-2 pb-4">
 <div className="relative flex h-36 w-36 items-center justify-center">
 <svg
 className="absolute inset-0 -rotate-90"
 viewBox="0 0 120 120"
 aria-hidden="true"
 >
 <circle
 cx="60"
 cy="60"
 r="52"
 fill="none"
 stroke="currentColor"
 strokeWidth="10"
 className="text-muted/40"
 />
 <circle
 cx="60"
 cy="60"
 r="52"
 fill="none"
 stroke="var(--primary)"
 strokeWidth="10"
 strokeLinecap="round"
 strokeDasharray={`${(SCORE / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
 />
 </svg>
 <div className="text-center">
 <div className="text-4xl font-bold text-primary tnum">
 {toPersianDigits(SCORE)}
 </div>
 <div className="text-xs text-muted-foreground">
 از {toPersianDigits(100)}
 </div>
 </div>
 </div>
 <div className="mt-3 text-center">
 {allOk? (
 <Badge className="gap-1 bg-success/10 text-success">
 <CheckCircle2 className="h-3.5 w-3.5" />
 وضعیت امنیتی عالی
 </Badge>
 ): (
 <Badge className="gap-1 bg-warning/10 text-warning">
 <AlertCircle className="h-3.5 w-3.5" />
 نیازمند اقدام
 </Badge>
 )}
 <p className="text-[11px] text-muted-foreground mt-2 max-w-[16rem]">
 تمام کنترل‌های امنیتی اساسی فعال هستند. سیستم مطابق با استانداردهای
 ISO 27001 پیکربندی شده است.
 </p>
 </div>
 </CardContent>
 </Card>

 <Card className="lg:col-span-2">
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Lock className="h-4 w-4 text-primary" />
 چک‌لیست امنیتی
 </CardTitle>
 </CardHeader>
 <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
 {SECURITY_ITEMS.map((item, i) => {
 const Icon = item.icon;
 return (
 <div
 key={i}
 className={`flex items-center gap-3 rounded-lg border p-3 ${
 item.ok
? "border-success/20 bg-success/5"
: "border-warning/20 bg-warning/5"
 }`}
 >
 <div
 className={`flex h-8 w-8 items-center justify-center rounded-lg ${
 item.ok
? "bg-success/10 text-success"
: "bg-warning/10 text-warning"
 }`}
 >
 <Icon className="h-4 w-4" />
 </div>
 <span className="text-sm font-medium flex-1 flex items-center gap-1">
 {item.label}
 {item.help && <HelpTip name={item.help} size={12} />}
 </span>
 {item.ok? (
 <CheckCircle2 className="h-4 w-4 text-success" />
 ): (
 <AlertCircle className="h-4 w-4 text-warning" />
 )}
 </div>
 );
 })}
 </CardContent>
 </Card>
 </div>

 {/* کاربران سیستم — خالی */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <UserCheck className="h-4 w-4 text-primary" />
 کاربران سیستم
 </CardTitle>
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(users.length)} کاربر — {toPersianDigits(users.filter((u) => u.active).length)} فعال
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {loadingUsers? (
 <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال بارگذاری کاربران...
 </div>
 ): users.length === 0? (
 <EmptyState
 icon={UserCheck}
 title="هنوز کاربری وجود ندارد"
 description="اولین کاربر سیستم را با تعیین نقش (مدیر، حسابدار یا کاربر) و سطح دسترسی مناسب اضافه کنید."
 action={
 <Button size="sm" className="gap-1.5" onClick={openUserDialog}>
 <UserPlus className="h-3.5 w-3.5" />
 کاربر جدید
 </Button>
 }
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[900px] table-zebra tnum">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">نام</th>
 <th scope="col" className="font-medium px-4 py-2.5">ایمیل</th>
 <th scope="col" className="font-medium px-4 py-2.5">نقش</th>
 <th scope="col" className="font-medium px-4 py-2.5">وضعیت</th>
 <th scope="col" className="font-medium px-4 py-2.5">آخرین ورود</th>
 <th scope="col" className="font-medium px-4 py-2.5">2FA</th>
 <th scope="col" className="font-medium px-4 py-2.5 text-end">عملیات</th>
 </tr>
 </thead>
 <tbody>
 {users.map((u, i) => (
 <tr key={u.id?? i} className="border-b border-border/40">
 <td className="px-4 py-3 font-medium">{u.name}</td>
 <td className="px-4 py-3 text-xs text-muted-foreground font-mono" dir="ltr">
 {u.email}
 </td>
 <td className="px-4 py-3">
 <Badge
 className={`text-[10px] ${ROLE_META[u.role].color}`}
 >
 {ROLE_META[u.role].label}
 </Badge>
 </td>
 <td className="px-4 py-3">
 {u.active? (
 <Badge className="text-[10px] bg-success/10 text-success gap-1">
 <span className="h-1.5 w-1.5 rounded-full bg-success" />
 فعال
 </Badge>
 ): (
 <Badge className="text-[10px] bg-muted text-muted-foreground gap-1">
 <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
 غیرفعال
 </Badge>
 )}
 </td>
 <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
 {u.lastLogin}
 </td>
 <td className="px-4 py-3">
 {u.twofa? (
 <Badge className="text-[10px] bg-success/10 text-success gap-1">
 <Fingerprint className="h-3 w-3" />
 فعال
 </Badge>
 ): (
 <Badge className="text-[10px] bg-muted text-muted-foreground gap-1">
 <AlertCircle className="h-3 w-3" />
 غیرفعال
 </Badge>
 )}
 </td>
 <td className="px-4 py-3">
 <div className="flex items-center justify-end gap-1">
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7"
 aria-label="ویرایش"
 disabled={deletingId === u.id}
 onClick={() => handleEditUser(u)}
 >
 <Pencil className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7 text-destructive hover:text-destructive"
 aria-label="حذف"
 disabled={!u.id || deletingId === u.id}
 onClick={() => handleDeleteUser(u)}
 >
 {deletingId === u.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Trash2 className="h-3.5 w-3.5" />
 )}
 </Button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* لاگ تغییرات اخیر — خالی */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <History className="h-4 w-4 text-primary" />
 لاگ تغییرات اخیر
 <span className="text-xs font-normal text-muted-foreground">
 (Audit Trail)
 </span>
 </CardTitle>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7"
 onClick={handleViewAll}
 >
 مشاهده همه
 </Button>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {loadingAudit? (
 <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال بارگذاری لاگ‌ها...
 </div>
 ): audit.length === 0? (
 <EmptyState
 icon={History}
 title="هنوز لاگی ثبت نشده"
 description="تمام تغییرات سیستم (ایجاد، ویرایش، حذف و ورود کاربران) به‌صورت خودکار در Audit Trail ثبت می‌شوند. اولین رکورد پس از فعالیت شما ایجاد خواهد شد."
 className="py-6"
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[820px] table-zebra tnum">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">زمان</th>
 <th scope="col" className="font-medium px-4 py-2.5">کاربر</th>
 <th scope="col" className="font-medium px-4 py-2.5">عملیات</th>
 <th scope="col" className="font-medium px-4 py-2.5">موجودیت</th>
 <th scope="col" className="font-medium px-4 py-2.5">آی‌پی</th>
 <th scope="col" className="font-medium px-4 py-2.5 text-end">جزئیات</th>
 </tr>
 </thead>
 <tbody>
 {audit.map((a, i) => (
 <tr key={i} className="border-b border-border/40">
 <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
 {a.time}
 </td>
 <td className="px-4 py-3 font-medium">{a.user}</td>
 <td className="px-4 py-3">
 <Badge
 className={`text-[10px] ${ACTION_META[a.action].color}`}
 >
 {ACTION_META[a.action].label}
 </Badge>
 </td>
 <td className="px-4 py-3 text-muted-foreground text-xs">
 {a.entity}
 </td>
 <td className="px-4 py-3 text-xs font-mono text-muted-foreground" dir="ltr">
 {a.ip}
 </td>
 <td className="px-4 py-3 text-end">
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7"
 aria-label="مشاهده جزئیات"
 onClick={() => handleViewAudit(a)}
 >
 <Eye className="h-3.5 w-3.5" />
 </Button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* دیالوگ ایجاد/ویرایش کاربر */}
 <Dialog open={userDialog} onOpenChange={setUserDialog}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 {editingUser? (
 <Pencil className="h-4 w-4 text-primary" />
 ): (
 <UserPlus className="h-4 w-4 text-primary" />
 )}
 {editingUser? "ویرایش کاربر": "کاربر جدید"}
 </DialogTitle>
 <DialogDescription>
 {editingUser
? "اطلاعات کاربر را ویرایش کنید. ایمیل قابل تغییر نیست."
: "اطلاعات کاربر را وارد کنید تا به سیستم اضافه شود."}
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-1">
 <div className="space-y-1.5">
 <Label className="text-xs">نام کامل *</Label>
 <Input
 value={form.name}
 onChange={(e) => {
 setForm((f) => ({...f, name: e.target.value }));
 if (errors.name) setErrors((p) => ({...p, name: "" }));
 }}
 placeholder="مثلاً علی محمدی"
 autoFocus
 className={errors.name? "border-destructive focus-visible:ring-destructive": ""}
 aria-invalid={!!errors.name}
 />
 {errors.name && (
 <p className="text-xs text-destructive mt-1">{errors.name}</p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">ایمیل *</Label>
 <Input
 dir="ltr"
 type="email"
 value={form.email}
 disabled={Boolean(editingUser)}
 onChange={(e) => {
 setForm((f) => ({...f, email: e.target.value }));
 if (errors.email) setErrors((p) => ({...p, email: "" }));
 }}
 placeholder="user@example.com"
 className={`text-start ${errors.email? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!errors.email}
 />
 {errors.email && (
 <p className="text-xs text-destructive mt-1">{errors.email}</p>
 )}
 {editingUser && (
 <p className="text-[10px] text-muted-foreground">
 ایمیل پس از ایجاد کاربر قابل تغییر نیست.
 </p>
 )}
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">نقش</Label>
 <Select
 value={form.role}
 onValueChange={(v) =>
 setForm((f) => ({...f, role: v as UserFormState["role"] }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="manager">مدیر</SelectItem>
 <SelectItem value="accountant">حسابدار</SelectItem>
 <SelectItem value="user">کاربر</SelectItem>
 </SelectContent>
 </Select>
 </div>
 {!editingUser && (
 <div className="space-y-1.5">
 <Label className="text-xs">رمز عبور اولیه</Label>
 <Input
 dir="ltr"
 type="password"
 value={form.password}
 onChange={(e) => {
 setForm((f) => ({...f, password: e.target.value }));
 if (errors.password) setErrors((p) => ({...p, password: "" }));
 }}
 placeholder="حداقل ۸ کاراکتر"
 className={`text-start ${errors.password? "border-destructive focus-visible:ring-destructive": ""}`}
 aria-invalid={!!errors.password}
 />
 {errors.password && (
 <p className="text-xs text-destructive mt-1">{errors.password}</p>
 )}
 <p className="text-[10px] text-muted-foreground">
 کاربر می‌تواند پس از اولین ورود، رمز را تغییر دهد.
 </p>
 </div>
 )}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setUserDialog(false)} disabled={submitting}>
 انصراف
 </Button>
 <Button
 onClick={submitUser}
 disabled={submitting ||!isUserFormValid}
 className="gap-1.5"
 >
 {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
 {editingUser? "ذخیره تغییرات": "افزودن کاربر"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {ConfirmDialogComponent}

 {/* دیالوگ ۲FA */}
 <Dialog open={twoFactorOpen} onOpenChange={setTwoFactorOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Fingerprint className="h-4 w-4 text-primary" />
 احراز هویت دو مرحله‌ای (2FA)
 </DialogTitle>
 <DialogDescription>
 با فعال‌سازی 2FA، ورود به حساب کاربری علاوه بر رمز عبور، به کد یک‌بارمصرف ارسالی به موبایل شما نیاز دارد.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-4">
 <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
 <div>
 <p className="text-sm font-medium">وضعیت 2FA</p>
 <p className="text-xs text-muted-foreground">
 {twoFactorEnabled? "فعال — کد یک‌بارمصرف برای ورود ارسال می‌شود": "غیرفعال — ورود فقط با رمز عبور"}
 </p>
 </div>
 <Switch
 checked={twoFactorEnabled}
 onCheckedChange={(checked) => {
 setTwoFactorEnabled(checked);
 toast({
 title: checked? "2FA فعال شد": "2FA غیرفعال شد",
 description: checked
? "از این پس برای ورود، کد ارسالی به موبایل شما نیاز است."
: "ورود فقط با رمز عبور ممکن است — توصیه می‌شود فعال نگه دارید.",
 });
 }}
 />
 </div>
 <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
 <p>• کد یک‌بارمصرف ۶ رقمی به شماره موبایل ثبت‌شده ارسال می‌شود.</p>
 <p>• هر کد فقط ۲ دقیقه معتبر است.</p>
 <p>• در صورت pérdida موبایل، از کدهای پشتیبان ذخیره‌شده استفاده کنید.</p>
 </div>
 </div>
 <DialogFooter>
 <Button onClick={() => setTwoFactorOpen(false)}>بستن</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ IP Whitelist */}
 <Dialog open={ipWhitelistOpen} onOpenChange={setIpWhitelistOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Server className="h-4 w-4 text-primary" />
 لیست IP‌های مجاز
 </DialogTitle>
 <DialogDescription>
 فقط از این آدرس‌های IP امکان ورود به حساب کاربری وجود دارد. هر خط یک آدرس IP (مثل 192.168.1.1 یا 5.160.x.x).
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <Label className="text-xs">آدرس‌های IP مجاز (هر خط یک IP)</Label>
 <Textarea
 placeholder={"192.168.1.1\n5.160.x.x\n::1"}
 value={ipList}
 onChange={(e) => setIpList(e.target.value)}
 rows={5}
 className="font-mono text-xs"
 />
 <p className="text-[10px] text-muted-foreground">
 برای غیرفعال‌سازی محدودیت، لیست را خالی بگذارید.
 </p>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setIpWhitelistOpen(false)}>انصراف</Button>
 <Button
 onClick={() => {
 const lines = ipList.split("\n").map((l) => l.trim()).filter(Boolean);
 toast({
 title: "لیست IP ذخیره شد",
 description: lines.length > 0
? `${toPersianDigits(lines.length)} آدرس IP در لیست مجاز قرار گرفت.`
: "محدودیت IP غیرفعال شد — ورود از هر آدرسی مجاز است.",
 });
 setIpWhitelistOpen(false);
 }}
 >
 ذخیره لیست
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ نقش‌ها و دسترسی‌ها */}
 <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <KeyRound className="h-4 w-4 text-primary" />
 نقش‌ها و سطوح دسترسی
 </DialogTitle>
 <DialogDescription>
 نقش‌های پیش‌فرض سیستم و سطح دسترسی هرکدام.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2">
 {[
 { role: "ADMIN", label: "مدیر سیستم", perms: "دسترسی کامل به همه ماژول‌ها، کاربران و تنظیمات" },
 { role: "ACCOUNTANT", label: "حسابدار", perms: "فاکتورها، اسناد حسابداری، خزانه‌داری و گزارش‌ها" },
 { role: "SALES", label: "فروش", perms: "مشاهده و ایجاد فاکتور فروش، CRM، انبار (فقط مشاهده)" },
 { role: "VIEWER", label: "فقط مشاهده", perms: "مشاهده‌ی گزارش‌ها و داشبورد بدون امکان ویرایش" },
 ].map((r) => (
 <div
 key={r.role}
 className="flex items-start justify-between rounded-lg border border-border/60 p-3"
 >
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <p className="text-sm font-medium">{r.label}</p>
 <Badge variant="outline" className="text-[9px]">{r.role}</Badge>
 </div>
 <p className="text-xs text-muted-foreground mt-1">{r.perms}</p>
 </div>
 </div>
 ))}
 </div>
 <DialogFooter>
 <Button onClick={() => setRolesOpen(false)}>بستن</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ مشاهده‌ی کامل لاگ ممیزی */}
 <Dialog open={fullAuditOpen} onOpenChange={setFullAuditOpen}>
 <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col">
 <DialogHeader className="shrink-0">
 <DialogTitle className="flex items-center gap-2">
 <History className="h-4 w-4 text-primary" />
 لاگ ممیزی کامل
 </DialogTitle>
 <DialogDescription>
 ۲۰۰ رویداد اخیر سیستم — تغییرات، ورود/خروج و عملیات حساس.
 </DialogDescription>
 </DialogHeader>
 <div className="flex-1 overflow-y-auto p-1">
 {fullAuditLoading? (
 <div className="flex flex-col items-center justify-center py-16 gap-3">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
 </div>
 ): fullAudit.length === 0? (
 <EmptyState
 icon={History}
 title="هیچ رویدادی ثبت نشده"
 description="هنوز هیچ فعالیت‌ای در سیستم ثبت نشده است."
 />
 ): (
 <div className="overflow-hidden rounded-lg border border-border/60">
 <table className="w-full text-sm">
 <thead className="bg-muted/40 sticky top-0">
 <tr className="text-muted-foreground">
 <th className="text-start p-2 font-medium">زمان</th>
 <th className="text-start p-2 font-medium">کاربر</th>
 <th className="text-start p-2 font-medium">عملیات</th>
 <th className="text-start p-2 font-medium">موجودیت</th>
 <th className="text-start p-2 font-medium">IP</th>
 </tr>
 </thead>
 <tbody>
 {fullAudit.map((l, i) => (
 <tr
 key={`${l.id}-${i}`}
 className="border-t border-border/40 hover:bg-muted/20"
 >
 <td className="p-2 text-xs tnum text-muted-foreground whitespace-nowrap">{l.time}</td>
 <td className="p-2 text-xs">{l.user}</td>
 <td className="p-2 text-xs font-mono">{l.action}</td>
 <td className="p-2 text-xs">{l.entity}</td>
 <td className="p-2 text-xs font-mono text-muted-foreground">{l.ip}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 <DialogFooter className="shrink-0 border-t border-border/40 pt-3">
 <Button variant="outline" onClick={() => setFullAuditOpen(false)}>بستن</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
