"use client";

import * as React from "react";
import {
 KeyRound,
 Plus,
 Trash2,
 Ban,
 Copy,
 Check,
 Loader2,
 AlertTriangle,
 Clock,
 CheckCircle2,
 XCircle,
 Terminal,
 Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

interface ApiKeyItem {
 id: string;
 name: string;
 keyPrefix: string;
 scopes: string[];
 lastUsedAt: string | null;
 expiresAt: string | null;
 isActive: boolean;
 createdAt: string;
}

interface UsageSummary {
 total: number;
 active: number;
 inactive: number;
 usedIn24h: number;
 usedIn7d: number;
 usedIn30d: number;
 neverUsed: number;
}

const SCOPE_LABELS: Record<string, string> = {
 "read:invoices": "خواندن فاکتورها",
 "write:invoices": "نوشتن فاکتورها",
 "read:products": "خواندن محصولات",
 "write:products": "نوشتن محصولات",
 "read:parties": "خواندن طرف‌حساب‌ها",
 "write:parties": "نوشتن طرف‌حساب‌ها",
 "read:inventory": "خواندن انبار",
 "write:inventory": "نوشتن انبار",
 "read:reports": "خواندن گزارش‌ها",
 "read:dashboard": "خواندن داشبورد",
};

const ALL_SCOPES = Object.keys(SCOPE_LABELS);

function formatDate(iso: string | null): string {
 if (!iso) return "هرگز";
 try {
 const d = new Date(iso);
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 }).format(d);
 } catch {
 return "نامعتبر";
 }
}

function timeAgo(iso: string | null): string {
 if (!iso) return "هرگز";
 const diff = Date.now() - new Date(iso).getTime();
 const min = Math.floor(diff / 60000);
 if (min < 1) return "همین حالا";
 if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
 const hr = Math.floor(min / 60);
 if (hr < 24) return `${toPersianDigits(hr)} ساعت پیش`;
 const day = Math.floor(hr / 24);
 return `${toPersianDigits(day)} روز پیش`;
}

export function ApiKeysView({ token }: { token: string }) {
 const { toast } = useToast();
 const [keys, setKeys] = React.useState<ApiKeyItem[]>([]);
 const [usage, setUsage] = React.useState<UsageSummary | null>(null);
 const [loading, setLoading] = React.useState(true);

 // state دیالوگ ایجاد
 const [createOpen, setCreateOpen] = React.useState(false);
 const [creating, setCreating] = React.useState(false);
 const [newName, setNewName] = React.useState("");
 const [newScopes, setNewScopes] = React.useState<string[]>([]);
 const [newExpiry, setNewExpiry] = React.useState("");

 // state نمایش کلید کامل پس از ایجاد
 const [createdKey, setCreatedKey] = React.useState<string | null>(null);
 const [copied, setCopied] = React.useState(false);

 const fetchData = React.useCallback(async () => {
 setLoading(true);
 try {
 const [keysRes, usageRes] = await Promise.all([
 fetch("/api/api-keys", {
 headers: { Authorization: `Bearer ${token}` },
 }),
 fetch("/api/api-keys/usage", {
 headers: { Authorization: `Bearer ${token}` },
 }),
 ]);
 if (keysRes.ok) {
 const json = await keysRes.json();
 setKeys(json.data || []);
 }
 if (usageRes.ok) {
 const json = await usageRes.json();
 setUsage(json.data?.summary || null);
 }
 } catch {
 toast({
 variant: "destructive",
 title: "خطا",
 description: "دریافت لیست کلیدها ناموفق بود",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void fetchData();
 }, [fetchData]);

 const handleCreate = async () => {
 if (!newName.trim()) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: "نام کلید الزامی است",
 });
 return;
 }
 setCreating(true);
 try {
 const res = await fetch("/api/api-keys", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({
 name: newName.trim(),
 scopes: newScopes,
 expiresAt: newExpiry || null,
 }),
 });
 const json = await res.json();
 if (!res.ok ||!json.success) {
 throw new Error(json.error || "خطا در ایجاد کلید");
 }
 setCreatedKey(json.data.fullKey);
 toast({
 title: "کلید ساخته شد",
 description: "کلید را همین حالا ذخیره کنید — دوباره نمایش داده نمی‌شود",
 });
 void fetchData();
 // reset form
 setNewName("");
 setNewScopes([]);
 setNewExpiry("");
 } catch (e) {
 toast({
 variant: "destructive",
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ایجاد کلید",
 });
 } finally {
 setCreating(false);
 }
 };

 const handleDeactivate = async (id: string, name: string) => {
 try {
 const res = await fetch(`/api/api-keys/${id}`, {
 method: "PATCH",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ isActive: false }),
 });
 if (!res.ok) throw new Error("خطا در ابطال کلید");
 toast({
 title: "کلید ابطال شد",
 description: `کلید «${name}» غیرفعال شد`,
 });
 void fetchData();
 } catch {
 toast({
 variant: "destructive",
 title: "خطا",
 description: "ابطال کلید ناموفق بود",
 });
 }
 };

 const handleDelete = async (id: string, name: string) => {
 if (
!confirm(`کلید «${name}» به‌طور کامل حذف شود؟ این کار قابل بازگشت نیست.`)
 ) {
 return;
 }
 try {
 const res = await fetch(`/api/api-keys/${id}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error("خطا در حذف کلید");
 toast({
 title: "حذف شد",
 description: `کلید «${name}» حذف شد`,
 });
 void fetchData();
 } catch {
 toast({
 variant: "destructive",
 title: "خطا",
 description: "حذف کلید ناموفق بود",
 });
 }
 };

 const copyKey = async () => {
 if (!createdKey) return;
 try {
 await navigator.clipboard.writeText(createdKey);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 } catch {
 toast({
 variant: "destructive",
 title: "خطا",
 description: "کپی ناموفق بود",
 });
 }
 };

 const closeCreatedDialog = () => {
 setCreatedKey(null);
 setCreateOpen(false);
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر + آمار */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h2 className="text-2xl font-bold flex items-center gap-2">
 <KeyRound className="size-6 text-primary" />
 کلیدهای API
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 مدیریت دسترسی برنامه‌نویسی به حساب هوش
 </p>
 </div>
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogTrigger asChild>
 <Button>
 <Plus className="size-4" />
 ایجاد کلید جدید
 </Button>
 </DialogTrigger>
 <DialogContent className="sm:max-w-[520px]">
 <DialogHeader>
 <DialogTitle>کلید API جدید</DialogTitle>
 <DialogDescription>
 کلید پس از ساخت فقط یک‌بار نمایش داده می‌شود. آن را در جای امن
 ذخیره کنید.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="api-key-name">نام کلید</Label>
 <Input
 id="api-key-name"
 placeholder="مثلاً: اتصال فروشگاه ووکامرس"
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 />
 </div>

 <div className="space-y-2">
 <Label>دسترسی‌ها (اسکوپ‌ها)</Label>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
 {ALL_SCOPES.map((scope) => (
 <label
 key={scope}
 className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent"
 >
 <Checkbox
 checked={newScopes.includes(scope)}
 onCheckedChange={(checked) => {
 if (checked) setNewScopes([...newScopes, scope]);
 else
 setNewScopes(newScopes.filter((s) => s!== scope));
 }}
 />
 <span className="text-sm">
 {SCOPE_LABELS[scope]}
 </span>
 </label>
 ))}
 </div>
 {newScopes.length === 0 && (
 <p className="text-xs text-muted-foreground">
 بدون انتخاب اسکوپ، فقط دسترسی خواندن داده می‌شود.
 </p>
 )}
 </div>

 <div className="space-y-2">
 <Label htmlFor="api-key-expiry">تاریخ انقضا (اختیاری)</Label>
 <JalaliDatePicker
 id="api-key-expiry"
 value={newExpiry}
 onChange={(v) => setNewExpiry(v)}
 placeholder="انتخاب تاریخ انقضا"
 />
 </div>
 </div>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setCreateOpen(false)}
 disabled={creating}
 >
 انصراف
 </Button>
 <Button onClick={handleCreate} disabled={creating}>
 {creating? (
 <Loader2 className="size-4 animate-spin" />
 ): (
 <KeyRound className="size-4" />
 )}
 ایجاد کلید
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>

 {/* کارت‌های آماری */}
 {usage && (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <StatCard
 icon={<KeyRound className="size-4" />}
 label="کل کلیدها"
 value={toPersianDigits(usage.total)}
 tone="default"
 />
 <StatCard
 icon={<CheckCircle2 className="size-4" />}
 label="فعال"
 value={toPersianDigits(usage.active)}
 tone="success"
 />
 <StatCard
 icon={<Activity className="size-4" />}
 label="استفاده در ۲۴ ساعت"
 value={toPersianDigits(usage.usedIn24h)}
 tone="info"
 />
 <StatCard
 icon={<XCircle className="size-4" />}
 label="هرگز استفاده نشده"
 value={toPersianDigits(usage.neverUsed)}
 tone="warning"
 />
 </div>
 )}

 {/* لیست کلیدها */}
 <Card>
 <CardHeader>
 <CardTitle>کلیدهای فعال و ابطال‌شده</CardTitle>
 <CardDescription>
 برای امنیت بیشتر، کلیدهای استفاده‌نشده را ابطال کنید
 </CardDescription>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-10 text-muted-foreground">
 <Loader2 className="size-5 animate-spin ml-2" />
 در حال بارگذاری...
 </div>
 ): keys.length === 0? (
 <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
 <KeyRound className="size-10 opacity-30 mb-3" />
 <p className="text-sm">هنوز کلید API نساخته‌اید</p>
 </div>
 ): (
 <div className="space-y-3 max-h-[28rem] overflow-y-auto pl-1">
 {keys.map((k) => (
 <div
 key={k.id}
 className="rounded-lg border p-4 hover:border-primary/40 transition-colors"
 >
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
 <div className="space-y-1 min-w-0 flex-1">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-semibold">{k.name}</span>
 {k.isActive? (
 <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
 فعال
 </Badge>
 ): (
 <Badge
 variant="secondary"
 className="bg-muted text-muted-foreground"
 >
 ابطال‌شده
 </Badge>
 )}
 {k.expiresAt &&
 new Date(k.expiresAt) < new Date() && (
 <Badge
 variant="destructive"
 className="bg-red-100 text-red-700 hover:bg-red-100"
 >
 منقضی
 </Badge>
 )}
 </div>
 <div
 className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded inline-block"
 dir="ltr"
 >
 {k.keyPrefix}
 </div>
 <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
 <span className="flex items-center gap-1">
 <Clock className="size-3" />
 آخرین استفاده: {timeAgo(k.lastUsedAt)}
 </span>
 <span className="flex items-center gap-1">
 <KeyRound className="size-3" />
 ساخته‌شده: {formatDate(k.createdAt)}
 </span>
 {k.expiresAt && (
 <span className="flex items-center gap-1">
 <AlertTriangle className="size-3" />
 انقضا: {formatDate(k.expiresAt)}
 </span>
 )}
 </div>
 {k.scopes.length > 0 && (
 <div className="flex flex-wrap gap-1 mt-2">
 {k.scopes.map((s) => (
 <Badge
 key={s}
 variant="outline"
 className="text-[10px] py-0 h-5"
 >
 {SCOPE_LABELS[s] || s}
 </Badge>
 ))}
 </div>
 )}
 </div>
 <div className="flex gap-2 shrink-0">
 {k.isActive && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => handleDeactivate(k.id, k.name)}
 >
 <Ban className="size-3.5" />
 ابطال
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleDelete(k.id, k.name)}
 className="text-destructive hover:text-destructive"
 >
 <Trash2 className="size-3.5" />
 حذف
 </Button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 {/* مستندات استفاده */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Terminal className="size-5 text-primary" />
 راهنمای استفاده
 </CardTitle>
 <CardDescription>
 برای فراخوانی API هوش، کلید را در هدر <code>x-api-key</code>{" "}
 ارسال کنید
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div
 dir="ltr"
 className="bg-muted rounded-lg p-4 font-mono text-xs overflow-x-auto"
 >
 <pre className="text-muted-foreground">{`# نمونه درخواست GET فاکتورها
curl -H "x-api-key: YOUR_API_KEY" \\
 https://api.hoosh.nobatime.ir/api/v1/invoices

# نمونه درخواست POST برای ساخت فاکتور
curl -X POST \\
 -H "x-api-key: YOUR_API_KEY" \\
 -H "Content-Type: application/json" \\
 -d '{"partyId":"...","items":[...]}' \\
 https://api.hoosh.nobatime.ir/api/v1/invoices`}</pre>
 </div>
 <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
 <div className="flex items-start gap-2">
 <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" />
 <span className="text-muted-foreground">
 کلید فقط هنگام ساخت نمایش داده می‌شود
 </span>
 </div>
 <div className="flex items-start gap-2">
 <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" />
 <span className="text-muted-foreground">
 اسکوپ‌ها دسترسی را محدود می‌کنند
 </span>
 </div>
 <div className="flex items-start gap-2">
 <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" />
 <span className="text-muted-foreground">
 در صورت نشت کلید، آن را ابطال کنید
 </span>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ نمایش کلید کامل پس از ایجاد */}
 <Dialog open={!!createdKey} onOpenChange={(o) =>!o && closeCreatedDialog()}>
 <DialogContent className="sm:max-w-[560px]">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <AlertTriangle className="size-5 text-amber-600" />
 کلید API شما ساخته شد
 </DialogTitle>
 <DialogDescription>
 این کلید فقط یک‌بار نمایش داده می‌شود. آن را کپی و در جای امن ذخیره
 کنید. در صورت گم‌شدن، باید کلید جدید بسازید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <div
 dir="ltr"
 className="bg-muted rounded-lg p-3 font-mono text-xs break-all border border-primary/30"
 >
 {createdKey}
 </div>
 <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 p-3 rounded-md">
 <AlertTriangle className="size-4 shrink-0" />
 <span>
 هوش کلید خام را ذخیره نمی‌کند — فقط هش SHA-256 آن نگهداری
 می‌شود. در صورت بستن این پنجره، دیگر قابل بازیابی نیست.
 </span>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={closeCreatedDialog}>
 بستن
 </Button>
 <Button onClick={copyKey}>
 {copied? (
 <>
 <Check className="size-4" />
 کپی شد
 </>
 ): (
 <>
 <Copy className="size-4" />
 کپی کلید
 </>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function StatCard({
 icon,
 label,
 value,
 tone,
}: {
 icon: React.ReactNode;
 label: string;
 value: string;
 tone: "default" | "success" | "info" | "warning";
}) {
 const toneClass =
 tone === "success"
? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
: tone === "info"
? "text-primary bg-primary/10"
: tone === "warning"
? "text-amber-600 bg-amber-50 dark:bg-amber-950/30"
: "text-muted-foreground bg-muted";
 return (
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <span className="text-xs text-muted-foreground">{label}</span>
 <div
 className={`size-8 rounded-md flex items-center justify-center ${toneClass}`}
 >
 {icon}
 </div>
 </div>
 <div className="text-2xl font-bold mt-2">{value}</div>
 </CardContent>
 </Card>
 );
}
