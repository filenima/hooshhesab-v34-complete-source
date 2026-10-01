"use client";

// ============ App Marketplace Module — هوش ============
// مرور، نصب و حذف اپ‌های third-party + پورتال توسعه‌دهنده

import * as React from "react";
import {
 Store,
 Search,
 Star,
 Download,
 Trash2,
 Plus,
 BadgeCheck,
 Tag,
 Code2,
 ExternalLink,
 RefreshCw,
 Loader2,
 CheckCircle2,
 ShoppingCart,
 Sparkles,
 Calendar,
 CreditCard,
 MessageSquare,
 FileBarChart,
 Landmark,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toPersianDigits, formatToman } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

interface AppItem {
 id: string;
 name: string;
 developer: string;
 description: string;
 category: string;
 version: string;
 rating: number;
 installs: number;
 icon: string;
 entryUrl: string;
 publishedAt: string;
 verified: boolean;
 pricing: { type: string; monthlyPrice: number; proPrice?: number };
 installed?: boolean;
 // FIX(SA-3): اپ‌های نمونه — آزمایشی/به‌زودی
 experimental?: boolean;
 status?: string;
}

const CATEGORIES: { value: string; label: string }[] = [
 { value: "all", label: "همه" },
 { value: "accounting", label: "حسابداری" },
 { value: "report", label: "گزارش" },
 { value: "sales", label: "فروش" },
 { value: "integration", label: "اتصال" },
 { value: "tools", label: "ابزار" },
 { value: "ai", label: "هوش مصنوعی" },
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
 FileBarChart,
 CreditCard,
 ShoppingCart,
 Sparkles,
 Store,
 MessageSquare,
 Calendar,
 Landmark,
};

export function AppMarketplace({ token }: { token?: string }) {
 const [apps, setApps] = React.useState<AppItem[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [search, setSearch] = React.useState("");
 const [category, setCategory] = React.useState("all");
 const [tab, setTab] = React.useState("browse");
 const [installing, setInstalling] = React.useState<string | null>(null);
 const [error, setError] = React.useState<string | null>(null);

 const fetchApps = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const params = new URLSearchParams({ category, search, limit: "50" });
 const res = await authFetch(`/api/marketplace/apps?${params}`, {
 headers: token? { "x-tenant-id": token }: undefined,
 });
 if (!res.ok) throw new Error("خطا در دریافت اپ‌ها");
 const data = await res.json();
 setApps(data.apps?? []);
 } catch (err) {
 setError(err instanceof Error? err.message: "خطای ناشناخته");
 } finally {
 setLoading(false);
 }
 }, [category, search, token]);

 React.useEffect(() => {
 fetchApps();
 }, [fetchApps]);

 const handleInstall = async (appId: string) => {
 setInstalling(appId);
 try {
 const res = await authFetch(`/api/marketplace/apps/install?appId=${appId}`, {
 method: "POST",
 headers: token? { "x-tenant-id": token }: undefined,
 });
 if (!res.ok) {
 const data = await res.json().catch(() => ({}));
 throw new Error(data.error?? "خطا در نصب");
 }
 setApps((prev) =>
 prev.map((a) => (a.id === appId? {...a, installed: true }: a))
 );
 } catch (err) {
 setError(err instanceof Error? err.message: "خطا");
 } finally {
 setInstalling(null);
 }
 };

 const handleUninstall = async (appId: string) => {
 setInstalling(appId);
 try {
 const res = await authFetch(`/api/marketplace/apps/install?appId=${appId}`, {
 method: "DELETE",
 headers: token? { "x-tenant-id": token }: undefined,
 });
 if (!res.ok) throw new Error("خطا در حذف");
 setApps((prev) =>
 prev.map((a) => (a.id === appId? {...a, installed: false }: a))
 );
 } catch (err) {
 setError(err instanceof Error? err.message: "خطا");
 } finally {
 setInstalling(null);
 }
 };

 return (
 <div className="space-y-6 p-4">
 <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <h2 className="text-2xl font-bold">بازار اپلیکیشن</h2>
 <p className="text-sm text-muted-foreground">
 نصب اپ‌های تخصصی حسابداری برای توسعه‌ی قابلیت‌های هوش
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={fetchApps} disabled={loading}>
 {loading? <Loader2 className="h-4 w-4 animate-spin" />: <RefreshCw className="h-4 w-4" />}
 <span className="mr-2">به‌روزرسانی</span>
 </Button>
 </div>

 <Tabs value={tab} onValueChange={setTab}>
 <TabsList>
 <TabsTrigger value="browse">مرور اپ‌ها</TabsTrigger>
 <TabsTrigger value="installed">نصب‌شده‌ها</TabsTrigger>
 <TabsTrigger value="developer">پورتال توسعه‌دهنده</TabsTrigger>
 </TabsList>

 <TabsContent value="browse" className="space-y-4">
 {/* Search + Filter */}
 <div className="flex flex-col gap-3 sm:flex-row">
 <div className="relative flex-1">
 <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 placeholder="جستجوی اپ..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="pr-10"
 />
 </div>
 <div className="flex flex-wrap gap-1">
 {CATEGORIES.map((c) => (
 <Button
 key={c.value}
 variant={category === c.value? "default": "outline"}
 size="sm"
 onClick={() => setCategory(c.value)}
 >
 {c.label}
 </Button>
 ))}
 </div>
 </div>

 {error && (
 <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
 {error}
 </div>
 )}

 {/* Apps Grid */}
 {loading? (
 <div className="flex h-40 items-center justify-center text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin" />
 </div>
 ): apps.length === 0? (
 <div className="flex h-40 items-center justify-center text-muted-foreground">
 اپی یافت نشد
 </div>
 ): (
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {apps.map((app) => {
 const Icon = ICON_MAP[app.icon]?? Store;
 return (
 <Card key={app.id} className="flex flex-col">
 <CardHeader className="pb-3">
 <div className="flex items-start gap-3">
 <div className="rounded-md bg-primary/10 p-2 text-primary">
 <Icon className="h-6 w-6" />
 </div>
 <div className="flex-1">
 <div className="flex items-center gap-1">
 <CardTitle className="text-base">{app.name}</CardTitle>
 {app.verified && (
 <BadgeCheck className="h-4 w-4 text-primary" />
 )}
 </div>
 <p className="text-xs text-muted-foreground">{app.developer}</p>
 {/* FIX(SA-3): برچسب صریح آزمایشی — این اپ‌ها واقعی/نصب‌شدنی نیستند */}
 {(app.experimental || app.status === "COMING_SOON") && (
 <Badge variant="outline" className="mt-1.5 w-fit border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
 آزمایشی — به‌زودی
 </Badge>
 )}
 </div>
 </div>
 </CardHeader>
 <CardContent className="flex-1 space-y-3">
 <p className="text-sm text-muted-foreground line-clamp-2">
 {app.description}
 </p>

 <div className="flex items-center gap-3 text-xs text-muted-foreground">
 <span className="flex items-center gap-1">
 <Star className="h-3 w-3 fill-primary text-primary" />
 {toPersianDigits(app.rating.toFixed(1))}
 </span>
 <span className="flex items-center gap-1">
 <Download className="h-3 w-3" />
 {toPersianDigits(app.installs)} نصب
 </span>
 <span className="flex items-center gap-1">
 <Tag className="h-3 w-3" />
 v{toPersianDigits(app.version)}
 </span>
 </div>

 <div>
 {app.pricing.type === "free" && (
 <Badge variant="secondary">رایگان</Badge>
 )}
 {app.pricing.type === "paid" && (
 <Badge variant="default">
 {formatToman(app.pricing.monthlyPrice)}/ماه
 </Badge>
 )}
 {app.pricing.type === "freemium" && (
 <Badge variant="outline">
 رایگان + Pro ({formatToman(app.pricing.proPrice?? 0)})
 </Badge>
 )}
 </div>

 <div className="flex gap-2 pt-1">
 {app.installed? (
 <Button
 size="sm"
 variant="destructive"
 className="flex-1"
 onClick={() => handleUninstall(app.id)}
 disabled={installing === app.id}
 >
 {installing === app.id? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Trash2 className="h-4 w-4" />
 )}
 <span className="mr-1">حذف</span>
 </Button>
 ): (
 <Button
 size="sm"
 className="flex-1"
 onClick={() => handleInstall(app.id)}
 disabled={installing === app.id}
 >
 {installing === app.id? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Download className="h-4 w-4" />
 )}
 <span className="mr-1">نصب</span>
 </Button>
 )}
 <Button size="sm" variant="outline" asChild>
 <a href={app.entryUrl} target="_blank" rel="noopener noreferrer">
 <ExternalLink className="h-4 w-4" />
 </a>
 </Button>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}
 </TabsContent>

 <TabsContent value="installed">
 <InstalledAppsList
 apps={apps.filter((a) => a.installed)}
 onUninstall={handleUninstall}
 installing={installing}
 />
 </TabsContent>

 <TabsContent value="developer">
 <DeveloperPortal token={token} onSubmitted={fetchApps} />
 </TabsContent>
 </Tabs>
 </div>
 );
}

function InstalledAppsList({
 apps,
 onUninstall,
 installing,
}: {
 apps: AppItem[];
 onUninstall: (id: string) => void;
 installing: string | null;
}) {
 if (apps.length === 0) {
 return (
 <Card>
 <CardContent className="flex flex-col items-center justify-center py-12 text-center">
 <CheckCircle2 className="mb-2 h-10 w-10 text-muted-foreground" />
 <p className="text-sm text-muted-foreground">هنوز اپی نصب نشده است</p>
 </CardContent>
 </Card>
 );
 }

 return (
 <div className="space-y-3">
 {apps.map((app) => {
 const Icon = ICON_MAP[app.icon]?? Store;
 return (
 <Card key={app.id}>
 <CardContent className="flex items-center justify-between p-4">
 <div className="flex items-center gap-3">
 <div className="rounded-md bg-primary/10 p-2 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <div>
 <div className="font-medium">{app.name}</div>
 <div className="text-xs text-muted-foreground">
 v{toPersianDigits(app.version)} — {app.developer}
 </div>
 </div>
 </div>
 <Button
 size="sm"
 variant="destructive"
 onClick={() => onUninstall(app.id)}
 disabled={installing === app.id}
 >
 {installing === app.id? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Trash2 className="h-4 w-4" />
 )}
 <span className="mr-1">حذف</span>
 </Button>
 </CardContent>
 </Card>
 );
 })}
 </div>
 );
}

function DeveloperPortal({
 token,
 onSubmitted,
}: {
 token?: string;
 onSubmitted: () => void;
}) {
 const [form, setForm] = React.useState({
 name: "",
 description: "",
 category: "accounting",
 developer: "",
 version: "1.0.0",
 entryUrl: "",
 });
 const [submitting, setSubmitting] = React.useState(false);
 const [result, setResult] = React.useState<string | null>(null);
 const [error, setError] = React.useState<string | null>(null);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setSubmitting(true);
 setError(null);
 setResult(null);
 try {
 const res = await authFetch("/api/marketplace/apps", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
...(token? { "x-tenant-id": token }: {}),
 },
 body: JSON.stringify(form),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error?? "خطا در ثبت");
 setResult(`اپ با شناسه‌ی ${data.appId} ثبت شد. در انتظار بررسی.`);
 setForm({
 name: "",
 description: "",
 category: "accounting",
 developer: "",
 version: "1.0.0",
 entryUrl: "",
 });
 onSubmitted();
 } catch (err) {
 setError(err instanceof Error? err.message: "خطا");
 } finally {
 setSubmitting(false);
 }
 };

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Code2 className="h-5 w-5 text-primary" />
 ثبت اپ جدید
 </CardTitle>
 </CardHeader>
 <CardContent>
 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="grid gap-4 sm:grid-cols-2">
 <div className="space-y-2">
 <Label htmlFor="name">نام اپ</Label>
 <Input
 id="name"
 value={form.name}
 onChange={(e) => setForm({...form, name: e.target.value })}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="developer">توسعه‌دهنده</Label>
 <Input
 id="developer"
 value={form.developer}
 onChange={(e) => setForm({...form, developer: e.target.value })}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="category">دسته‌بندی</Label>
 <select
 id="category"
 value={form.category}
 onChange={(e) => setForm({...form, category: e.target.value })}
 className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
 >
 {CATEGORIES.filter((c) => c.value!== "all").map((c) => (
 <option key={c.value} value={c.value}>
 {c.label}
 </option>
 ))}
 </select>
 </div>
 <div className="space-y-2">
 <Label htmlFor="version">نسخه</Label>
 <Input
 id="version"
 value={form.version}
 onChange={(e) => setForm({...form, version: e.target.value })}
 required
 />
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="entryUrl">آدرس remoteEntry.js (Module Federation)</Label>
 <Input
 id="entryUrl"
 type="url"
 placeholder="https://apps.example.com/my-app/remoteEntry.js"
 value={form.entryUrl}
 onChange={(e) => setForm({...form, entryUrl: e.target.value })}
 required
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="description">توضیحات</Label>
 <Textarea
 id="description"
 rows={3}
 value={form.description}
 onChange={(e) => setForm({...form, description: e.target.value })}
 required
 />
 </div>

 {error && (
 <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
 {error}
 </div>
 )}
 {result && (
 <div className="flex items-center gap-2 rounded-md border border-primary/50 bg-primary/5 p-3 text-sm text-primary">
 <CheckCircle2 className="h-4 w-4" />
 {result}
 </div>
 )}

 <Button type="submit" disabled={submitting}>
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Plus className="h-4 w-4" />
 )}
 <span className="mr-2">ثبت اپ</span>
 </Button>
 </form>
 </CardContent>
 </Card>
 );
}
