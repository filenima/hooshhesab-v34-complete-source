"use client";

/**
 * FixedAssetsModule — دارایی‌های ثابت و استهلاک
 *
 * - فهرست دارایی‌ها با ارزش دفتری و استهلاک انباشته
 * - افزودن/ویرایش/حذف دارایی
 * - اجرای استهلاک ماهانه (روش خط مستقیم)
 * - نمایش تاریخچه استهلاک هر دارایی
 * - جدول زمان‌بندی استهلاک آینده
 *
 * فرمول خط مستقیم: (بهای خرید - ارزش اسقاط) / (طول عمر مفید به سال × 12)
 */

import * as React from "react";
import { motion } from "framer-motion";
import {
 Building2,
 Car,
 Cpu,
 Sofa,
 Package,
 Boxes,
 Plus,
 Pencil,
 Trash2,
 Calculator,
 Loader2,
 RefreshCw,
 TrendingDown,
 Eye,
 CalendarClock,
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
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ux/empty-state";
import { formatNumber, toPersianDigits, toJalali } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

type AssetCategory = "EQUIPMENT" | "VEHICLE" | "BUILDING" | "FURNITURE" | "IT" | "OTHER";

interface FixedAsset {
 id: string;
 code: string;
 name: string;
 category: AssetCategory;
 purchaseDate: string;
 purchaseCost: number;
 salvageValue: number;
 usefulLifeYears: number;
 depreciationMethod: string;
 accumulatedDepreciation: number;
 currentValue: number;
 status: string;
 location: string | null;
 custodian: string | null;
 description: string | null;
 lastDepreciationDate: string | null;
 depreciationCount: number;
}

interface DepreciationEntry {
 id: string;
 period: string;
 amount: number;
 accumulatedAfter: number;
 postedAt: string;
}

const CATEGORY_FA: Record<AssetCategory, string> = {
 EQUIPMENT: "تجهیزات",
 VEHICLE: "وسایل نقلیه",
 BUILDING: "ساختمان",
 FURNITURE: "تجهیزات اداری",
 IT: "فناوری اطلاعات",
 OTHER: "سایر",
};

const CATEGORY_ICON: Record<AssetCategory, React.ComponentType<{ className?: string }>> = {
 EQUIPMENT: Boxes,
 VEHICLE: Car,
 BUILDING: Building2,
 FURNITURE: Sofa,
 IT: Cpu,
 OTHER: Package,
};

const STATUS_FA: Record<string, string> = {
 ACTIVE: "فعال",
 DEPRECIATING: "در حال استهلاک",
 DISPOSED: "از رده خارج",
 SOLD: "فروخته شده",
};

const STATUS_COLOR: Record<string, string> = {
 ACTIVE: "bg-success/10 text-success",
 DEPRECIATING: "bg-info/10 text-info",
 DISPOSED: "bg-muted text-muted-foreground",
 SOLD: "bg-warning/10 text-warning",
};

export function FixedAssetsModule() {
 const { toast } = useToast();
 const [assets, setAssets] = React.useState<FixedAsset[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [editorOpen, setEditorOpen] = React.useState(false);
 const [editingId, setEditingId] = React.useState<string | null>(null);
 const [detailAsset, setDetailAsset] = React.useState<FixedAsset | null>(null);
 const [depreciationEntries, setDepreciationEntries] = React.useState<DepreciationEntry[]>([]);
 const [detailLoading, setDetailLoading] = React.useState(false);
 const [runningId, setRunningId] = React.useState<string | null>(null);

 const [form, setForm] = React.useState({
 code: "",
 name: "",
 category: "EQUIPMENT" as AssetCategory,
 purchaseDate: new Date().toISOString().slice(0, 10),
 purchaseCost: 0,
 salvageValue: 0,
 usefulLifeYears: 5,
 depreciationMethod: "STRAIGHT_LINE",
 location: "",
 custodian: "",
 description: "",
 });

 const load = React.useCallback(async () => {
 try {
 setLoading(true);
 const res = await authFetch("/api/accounting/fixed-assets", { cache: "no-store" });
 const json = await res.json();
 if (json.success) setAssets(json.data);
 } catch {
 toast({ title: "خطا", description: "بارگذاری دارایی‌ها ناموفق بود", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [toast]);

 React.useEffect(() => {
 load();
 }, [load]);

 const openNew = () => {
 setEditingId(null);
 const nextCode = `A-${String(assets.length + 1).padStart(3, "0")}`;
 setForm({
 code: nextCode,
 name: "",
 category: "EQUIPMENT",
 purchaseDate: new Date().toISOString().slice(0, 10),
 purchaseCost: 0,
 salvageValue: 0,
 usefulLifeYears: 5,
 depreciationMethod: "STRAIGHT_LINE",
 location: "",
 custodian: "",
 description: "",
 });
 setEditorOpen(true);
 };

 const openEdit = (a: FixedAsset) => {
 setEditingId(a.id);
 setForm({
 code: a.code,
 name: a.name,
 category: a.category,
 purchaseDate: new Date(a.purchaseDate).toISOString().slice(0, 10),
 purchaseCost: a.purchaseCost,
 salvageValue: a.salvageValue,
 usefulLifeYears: a.usefulLifeYears,
 depreciationMethod: a.depreciationMethod,
 location: a.location?? "",
 custodian: a.custodian?? "",
 description: a.description?? "",
 });
 setEditorOpen(true);
 };

 const handleSave = async () => {
 if (!form.code ||!form.name) {
 toast({ title: "خطا", description: "کد و نام دارایی الزامی است", variant: "destructive" });
 return;
 }
 try {
 const url = editingId
? `/api/accounting/fixed-assets/${editingId}`
: "/api/accounting/fixed-assets";
 const method = editingId? "PUT": "POST";
 const res = await authFetch(url, {
 method,
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
...form,
 location: form.location || undefined,
 custodian: form.custodian || undefined,
 description: form.description || undefined,
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: editingId? "دارایی ویرایش شد": "دارایی ثبت شد" });
 setEditorOpen(false);
 await load();
 } else {
 toast({ title: "خطا", description: json.error?? "ذخیره ناموفق", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 }
 };

 const handleDelete = async (id: string) => {
 if (!confirm("این دارایی حذف شود؟")) return;
 try {
 const res = await authFetch(`/api/accounting/fixed-assets/${id}`, { method: "DELETE" });
 const json = await res.json();
 if (json.success) {
 toast({ title: "دارایی حذف شد" });
 await load();
 } else {
 toast({ title: "خطا", description: json.error?? "حذف ناموفق بود", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 }
 };

 const openDetail = async (a: FixedAsset) => {
 setDetailAsset(a);
 setDetailLoading(true);
 try {
 const res = await authFetch(`/api/accounting/fixed-assets/${a.id}`, { cache: "no-store" });
 const json = await res.json();
 if (json.success) {
 setDepreciationEntries(json.data.depreciationEntries?? []);
 } else {
 toast({ title: "خطا", description: json.error?? "دریافت جزئیات ناموفق بود", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setDetailLoading(false);
 }
 };

 const handleRunDepreciation = async (id: string) => {
 if (!confirm("استهلاک ماه جاری برای این دارایی ثبت شود؟")) return;
 try {
 setRunningId(id);
 const res = await authFetch(`/api/accounting/fixed-assets/${id}/depreciate`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({}),
 });
 const json = await res.json();
 if (json.success) {
 toast({ title: "استهلاک ثبت شد", description: json.message });
 await load();
 if (detailAsset?.id === id) {
 // refresh detail
 const dres = await authFetch(`/api/accounting/fixed-assets/${id}`, { cache: "no-store" });
 const djson = await dres.json();
 if (djson.success) {
 setDetailAsset(djson.data);
 setDepreciationEntries(djson.data.depreciationEntries?? []);
 }
 }
 } else {
 toast({ title: "خطا", description: json.error?? "اجرای استهلاک ناموفق", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setRunningId(null);
 }
 };

 const handleRunAllDepreciation = async () => {
 if (!confirm(`استهلاک ماه جاری برای همه‌ی ${assets.length} دارایی ثبت شود؟`)) return;
 let success = 0;
 let skipped = 0;
 let failed = 0;
 for (const a of assets) {
 if (a.status === "DISPOSED" || a.status === "SOLD") {
 skipped++;
 continue;
 }
 try {
 setRunningId(a.id);
 const res = await authFetch(`/api/accounting/fixed-assets/${a.id}/depreciate`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({}),
 });
 const json = await res.json();
 if (json.success) success++;
 else skipped++;
 } catch {
 failed++;
 }
 }
 setRunningId(null);
 await load();
 toast({
 title: "اجرای استهلاک دسته‌ای تمام شد",
 description: `موفق: ${toPersianDigits(success)} — رد شده: ${toPersianDigits(skipped)} — ناموفق: ${toPersianDigits(failed)}`,
 });
 };

 const stats = React.useMemo(() => {
 const totalCost = assets.reduce((s, a) => s + a.purchaseCost, 0);
 const totalDep = assets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
 const totalBookValue = assets.reduce((s, a) => s + a.currentValue, 0);
 const active = assets.filter((a) => a.status === "ACTIVE" || a.status === "DEPRECIATING").length;
 return { totalCost, totalDep, totalBookValue, active };
 }, [assets]);

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <Building2 className="h-5 w-5 text-primary" />
 دارایی‌های ثابت و استهلاک
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 ثبت دارایی‌ها، محاسبه‌ی استهلاک خط مستقیم و مدیریت ارزش دفتری
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" onClick={handleRunAllDepreciation} disabled={assets.length === 0} className="gap-1.5">
 <Calculator className="h-4 w-4" />
 استهلاک ماهانه همه
 </Button>
 <Button onClick={openNew} className="gap-1.5">
 <Plus className="h-4 w-4" />
 دارایی جدید
 </Button>
 </div>
 </div>

 {/* آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard icon={Boxes} label="تعداد دارایی" value={toPersianDigits(stats.active)} color="text-primary" />
 <StatCard icon={Package} label="بهای خرید کل" value={`${formatNumber(stats.totalCost)} ریال`} color="text-info" />
 <StatCard icon={TrendingDown} label="استهلاک انباشته" value={`${formatNumber(stats.totalDep)} ریال`} color="text-warning" />
 <StatCard icon={Building2} label="ارزش دفتری کل" value={`${formatNumber(stats.totalBookValue)} ریال`} color="text-success" />
 </div>

 {/* جدول دارایی‌ها */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">فهرست دارایی‌ها</CardTitle>
 <Button variant="ghost" size="sm" onClick={load} className="gap-1">
 <RefreshCw className="h-3.5 w-3.5" />
 به‌روزرسانی
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex justify-center py-10">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
 </div>
 ): assets.length === 0? (
 <EmptyState
 icon={Building2}
 title="هنوز دارایی‌ای ثبت نشده"
 description="دارایی‌های ثابت (تجهیزات، خودرو، ساختمان و...) را برای محاسبه‌ی استهلاک ثبت کنید."
 action={
 <Button onClick={openNew} className="gap-1.5">
 <Plus className="h-4 w-4" />
 ثبت دارایی
 </Button>
 }
 />
 ): (
 <div className="max-h-[480px] overflow-y-auto -mx-2">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>کد / نام</TableHead>
 <TableHead>دسته</TableHead>
 <TableHead className="text-end">بهای خرید</TableHead>
 <TableHead className="text-end">استهلاک انباشته</TableHead>
 <TableHead className="text-end">ارزش دفتری</TableHead>
 <TableHead>وضعیت</TableHead>
 <TableHead className="text-end">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {assets.map((a) => {
 const Icon = CATEGORY_ICON[a.category]?? Package;
 const depPercent =
 a.purchaseCost > 0
? Math.min(100, (a.accumulatedDepreciation / a.purchaseCost) * 100)
: 0;
 return (
 <TableRow key={a.id}>
 <TableCell>
 <div className="flex items-center gap-2">
 <Icon className="h-4 w-4 text-muted-foreground" />
 <div>
 <div className="font-medium">{a.name}</div>
 <div className="text-xs text-muted-foreground">{toPersianDigits(a.code)}</div>
 </div>
 </div>
 </TableCell>
 <TableCell className="text-xs">{CATEGORY_FA[a.category]}</TableCell>
 <TableCell className="text-end text-xs">{formatNumber(a.purchaseCost)}</TableCell>
 <TableCell className="text-end">
 <div className="text-xs">{formatNumber(a.accumulatedDepreciation)}</div>
 <Progress value={depPercent} className="h-1 mt-1 w-20" />
 </TableCell>
 <TableCell className="text-end font-medium">{formatNumber(a.currentValue)}</TableCell>
 <TableCell>
 <Badge className={STATUS_COLOR[a.status]?? "bg-muted"}>
 {STATUS_FA[a.status]?? a.status}
 </Badge>
 </TableCell>
 <TableCell className="text-end">
 <div className="flex justify-end gap-1">
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => openDetail(a)}
 title="جزئیات و تاریخچه استهلاک"
 >
 <Eye className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => handleRunDepreciation(a.id)}
 disabled={runningId === a.id || a.status === "DISPOSED" || a.status === "SOLD"}
 title="اجرای استهلاک ماه جاری"
 >
 {runningId === a.id? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Calculator className="h-4 w-4" />
 )}
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => openEdit(a)}
 title="ویرایش"
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-destructive hover:text-destructive"
 onClick={() => handleDelete(a.id)}
 title="حذف"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* دیالوگ افزودن/ویرایش */}
 <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>{editingId? "ویرایش دارایی": "ثبت دارایی ثابت"}</DialogTitle>
 <DialogDescription>
 اطلاعات دارایی را وارد کنید. استهلاک به روش خط مستقیم محاسبه می‌شود.
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
 <div className="space-y-2">
 <Label>کد دارایی</Label>
 <Input value={form.code} onChange={(e) => setForm({...form, code: e.target.value })} />
 </div>
 <div className="space-y-2">
 <Label>نام دارایی</Label>
 <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value })} />
 </div>
 <div className="space-y-2">
 <Label>دسته</Label>
 <Select value={form.category} onValueChange={(v) => setForm({...form, category: v as AssetCategory })}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(CATEGORY_FA).map(([k, v]) => (
 <SelectItem key={k} value={k}>
 {v}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>تاریخ خرید</Label>
 <Input
 type="date"
 value={form.purchaseDate}
 onChange={(e) => setForm({...form, purchaseDate: e.target.value })}
 />
 </div>
 <div className="space-y-2">
 <Label>بهای خرید (ریال)</Label>
 <Input
 type="number"
 value={form.purchaseCost || ""}
 onChange={(e) => setForm({...form, purchaseCost: Number(e.target.value) })}
 />
 </div>
 <div className="space-y-2">
 <Label>ارزش اسقاط (ریال)</Label>
 <Input
 type="number"
 value={form.salvageValue || ""}
 onChange={(e) => setForm({...form, salvageValue: Number(e.target.value) })}
 />
 </div>
 <div className="space-y-2">
 <Label>طول عمر مفید (سال)</Label>
 <Input
 type="number"
 min={1}
 value={form.usefulLifeYears}
 onChange={(e) => setForm({...form, usefulLifeYears: Number(e.target.value) })}
 />
 </div>
 <div className="space-y-2">
 <Label>محل استقرار</Label>
 <Input value={form.location} onChange={(e) => setForm({...form, location: e.target.value })} />
 </div>
 <div className="space-y-2">
 <Label>مسئول نگهداری</Label>
 <Input value={form.custodian} onChange={(e) => setForm({...form, custodian: e.target.value })} />
 </div>
 <div className="space-y-2 md:col-span-2">
 <Label>توضیحات</Label>
 <Input value={form.description} onChange={(e) => setForm({...form, description: e.target.value })} />
 </div>
 <div className="md:col-span-2 bg-muted/50 rounded-lg p-3 text-xs">
 <div className="flex items-center gap-1.5 mb-1">
 <CalendarClock className="h-3.5 w-3.5 text-info" />
 <span className="font-medium">استهلاک ماهانه (خط مستقیم):</span>
 </div>
 <span className="font-mono">
 {toPersianDigits(
 formatNumber(
 Math.max(0, form.purchaseCost - form.salvageValue) /
 Math.max(1, form.usefulLifeYears * 12)
 )
 )}{" "}
 ریال در ماه
 </span>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setEditorOpen(false)}>انصراف</Button>
 <Button onClick={handleSave}>{editingId? "ذخیره تغییرات": "ثبت دارایی"}</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ جزئیات و تاریخچه */}
 <Dialog open={!!detailAsset} onOpenChange={(o) =>!o && setDetailAsset(null)}>
 <DialogContent className="max-w-3xl">
 <DialogHeader>
 <DialogTitle>جزئیات دارایی: {detailAsset?.name}</DialogTitle>
 <DialogDescription>
 کد {toPersianDigits(detailAsset?.code?? "")} — {CATEGORY_FA[detailAsset?.category?? "OTHER"]}
 </DialogDescription>
 </DialogHeader>
 {detailAsset && (
 <>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
 <DetailStat label="بهای خرید" value={`${formatNumber(detailAsset.purchaseCost)} ریال`} />
 <DetailStat label="ارزش اسقاط" value={`${formatNumber(detailAsset.salvageValue)} ریال`} />
 <DetailStat label="استهلاک انباشته" value={`${formatNumber(detailAsset.accumulatedDepreciation)} ریال`} />
 <DetailStat label="ارزش دفتری" value={`${formatNumber(detailAsset.currentValue)} ریال`} />
 </div>
 <div className="text-xs text-muted-foreground mb-2">
 طول عمر مفید: {toPersianDigits(detailAsset.usefulLifeYears)} سال — آخرین استهلاک:{" "}
 {detailAsset.lastDepreciationDate? toJalali(new Date(detailAsset.lastDepreciationDate)): "هنوز ثبت نشده"}
 </div>
 <div className="border-t pt-3">
 <div className="text-sm font-medium mb-2">تاریخچه استهلاک</div>
 {detailLoading? (
 <div className="flex justify-center py-6">
 <Loader2 className="h-5 w-5 animate-spin" />
 </div>
 ): depreciationEntries.length === 0? (
 <div className="text-center text-sm text-muted-foreground py-6">
 هنوز استهلاکی ثبت نشده. با کلیک روی «اجرای استهلاک ماه جاری» شروع کنید.
 </div>
 ): (
 <div className="max-h-64 overflow-y-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>دوره</TableHead>
 <TableHead className="text-end">مبلغ استهلاک</TableHead>
 <TableHead className="text-end">انباشته</TableHead>
 <TableHead>تاریخ ثبت</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {depreciationEntries.map((e) => (
 <TableRow key={e.id}>
 <TableCell className="font-mono">{toPersianDigits(e.period)}</TableCell>
 <TableCell className="text-end">{formatNumber(e.amount)}</TableCell>
 <TableCell className="text-end">{formatNumber(e.accumulatedAfter)}</TableCell>
 <TableCell className="text-xs">{toJalali(new Date(e.postedAt))}</TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </div>
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => detailAsset && handleRunDepreciation(detailAsset.id)}
 disabled={
 runningId === detailAsset?.id ||
 detailAsset?.status === "DISPOSED" ||
 detailAsset?.status === "SOLD"
 }
 className="gap-1.5"
 >
 {runningId === detailAsset?.id? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Calculator className="h-4 w-4" />
 )}
 اجرای استهلاک ماه جاری
 </Button>
 <Button variant="outline" onClick={() => setDetailAsset(null)}>بستن</Button>
 </DialogFooter>
 </>
 )}
 </DialogContent>
 </Dialog>
 </div>
 );
}

/* ============ اجزای داخلی ============ */
function StatCard({
 icon: Icon,
 label,
 value,
 color = "text-foreground",
}: {
 icon: React.ComponentType<{ className?: string }>;
 label: string;
 value: string;
 color?: string;
}) {
 return (
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-xs text-muted-foreground mb-1">{label}</p>
 <p className="text-base lg:text-lg font-bold truncate">{value}</p>
 </div>
 <Icon className={`h-8 w-8 ${color} opacity-80 shrink-0`} />
 </div>
 </CardContent>
 </Card>
 );
}

function DetailStat({ label, value }: { label: string; value: string }) {
 return (
 <div className="bg-muted rounded-lg p-3">
 <div className="text-xs text-muted-foreground mb-1">{label}</div>
 <div className="font-bold text-sm">{value}</div>
 </div>
 );
}
