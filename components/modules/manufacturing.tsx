"use client";

import * as React from "react";
import {
 Factory,
 Boxes,
 GitBranch,
 ClipboardList,
 Wrench,
 Plus,
 FileBarChart,
 CheckCircle2,
 CircleDot,
 Clock,
 XCircle,
 ChevronLeft,
 Package,
 Layers,
 Loader2,
 RefreshCw,
 AlertCircle,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ux/empty-state";
import { formatCompactToman, toJalali, toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";

/* ============ نوع‌های داده ============ */
type OrderStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELLED";

interface BomItemData {
 id: string;
 productId: string;
 quantity: number;
 unit: string;
 product: {
 id: string;
 name: string;
 sku: string;
 unit: string;
 type: string;
 purchasePrice: number;
 salePrice: number;
 } | null;
}

interface BomData {
 id: string;
 name: string;
 productId: string | null;
 version: number;
 status: string;
 items: BomItemData[];
 estimatedCost: number;
 materialsCount: number;
 createdAt: string;
}

interface ProductionOrderData {
 id: string;
 number: string;
 bomId: string;
 quantity: number;
 status: string;
 startDate: string;
 endDate: string | null;
 costPerUnit: number;
 totalCost: number;
 createdAt: string;
 bom: { id: string; name: string; version: number; status: string } | null;
}

const ORDER_STATUS_FA: Record<OrderStatus, string> = {
 PLANNED: "برنامه‌ریزی",
 IN_PROGRESS: "در حال تولید",
 DONE: "تکمیل",
 CANCELLED: "لغو",
};

const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
 PLANNED: "bg-muted text-muted-foreground",
 IN_PROGRESS: "bg-info/10 text-info",
 DONE: "bg-success/10 text-success",
 CANCELLED: "bg-destructive/10 text-destructive",
};

const ORDER_STATUS_ICON: Record<OrderStatus, LucideIcon> = {
 PLANNED: CircleDot,
 IN_PROGRESS: Clock,
 DONE: CheckCircle2,
 CANCELLED: XCircle,
};

/** نگاشت وضعیت دیتابیس (COMPLETED) به وضعیت UI (DONE) */
function mapOrderStatus(status: string): OrderStatus {
 if (status === "COMPLETED") return "DONE";
 if (
 status === "PLANNED" ||
 status === "IN_PROGRESS" ||
 status === "DONE" ||
 status === "CANCELLED"
 ) {
 return status;
 }
 return "PLANNED";
}

/** درخت محصول برای کارت درخت BOM */
interface BomNode {
 name: string;
 code: string;
 qty: string;
 type: "product" | "assembly" | "material";
 children?: BomNode[];
}

/**
 * ساخت درخت سلسله‌مراتبی BOM از روی داده‌های دریافت‌شده.
 * ریشه: خود BOM (محصول نهایی). فرزندان: اقلام BOM.
 * اگر قلم از نوع ASSEMBLY باشد و BOM دیگری با productId === آن قلم وجود داشته باشد،
 * زیرمجموعه‌های آن نیز به‌صورت بازگشتی (تا عمق ۲) اضافه می‌شوند.
 */
function buildBomTree(bom: BomData, allBoms: BomData[]): BomNode {
 const finalProductName =
 bom.items.find((it) => it.productId === bom.productId)?.product?.name??
 bom.name;

 const buildItemNode = (item: BomItemData, depth: number): BomNode => {
 const product = item.product;
 const isAssembly = product?.type === "ASSEMBLY";
 const nodeType: BomNode["type"] = isAssembly? "assembly": "material";
 const node: BomNode = {
 name: product?.name?? "—",
 code: product?.sku?? item.productId.slice(-6),
 qty: `${toPersianDigits(item.quantity)} ${item.unit}`,
 type: nodeType,
 };

 // بازگشت برای زیرمجموعه‌ها (حداکثر عمق ۲)
 if (isAssembly && depth < 2 && product) {
 const subBom = allBoms.find((b) => b.productId === product.id && b.id!== bom.id);
 if (subBom) {
 node.children = subBom.items.map((sub) => buildItemNode(sub, depth + 1));
 }
 }
 return node;
 };

 return {
 name: finalProductName,
 code: `v${toPersianDigits(bom.version)}`,
 qty: toPersianDigits("۱"),
 type: "product",
 children: bom.items.map((it) => buildItemNode(it, 1)),
 };
}

/* ============ کامپوننت اصلی ============ */
export function ManufacturingModule() {
 const [boms, setBoms] = React.useState<BomData[]>([]);
 const [orders, setOrders] = React.useState<ProductionOrderData[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);
 const [selectedBomId, setSelectedBomId] = React.useState<string | null>(null);
 const [refreshKey, setRefreshKey] = React.useState(0);

 const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

 // دریافت همزمان BOMها و احکام تولید
 const fetchAll = React.useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const [bomRes, orderRes] = await Promise.all([
 authFetch("/api/manufacturing/bom", { cache: "no-store" }),
 authFetch("/api/manufacturing/production", { cache: "no-store" }),
 ]);

 if (!bomRes.ok ||!orderRes.ok) {
 throw new Error("دریافت داده‌های ماژول تولیدی ناموفق بود");
 }

 const bomJson = (await bomRes.json().catch(() => null)) as
 | { success?: boolean; data?: BomData[] }
 | null;
 const orderJson = (await orderRes.json().catch(() => null)) as
 | { success?: boolean; data?: ProductionOrderData[] }
 | null;

 if (bomJson?.success === false || orderJson?.success === false) {
 throw new Error(
 (bomJson?.success === false && "خطا در دریافت BOMها") ||
 (orderJson?.success === false && "خطا در دریافت احکام تولید") ||
 "دریافت داده‌ها ناموفق بود"
 );
 }

 setBoms(Array.isArray(bomJson?.data)? bomJson!.data!: []);
 setOrders(Array.isArray(orderJson?.data)? orderJson!.data!: []);
 } catch (e) {
 const msg =
 e instanceof Error
? e.message
: "خطای ناشناخته در دریافت داده‌های تولیدی رخ داد.";
 setError(msg);
 setBoms([]);
 setOrders([]);
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchAll();
 }, [fetchAll, refreshKey]);

 // انتخاب خودکار اولین BOM در صورت نبود انتخاب
 React.useEffect(() => {
 if (!loading && boms.length > 0 &&!selectedBomId) {
 setSelectedBomId(boms[0].id);
 }
 if (!loading && boms.length === 0) {
 setSelectedBomId(null);
 }
 }, [boms, loading, selectedBomId]);

 // محاسبه آمار پویا
 const activeBomCount = boms.filter((b) => b.status === "ACTIVE").length;
 const activeOrderCount = orders.filter(
 (o) => o.status === "PLANNED" || o.status === "IN_PROGRESS"
 ).length;

 const now = new Date();
 const currentMonth = now.getMonth();
 const currentYear = now.getFullYear();
 const totalCostThisMonth = orders
.filter((o) => {
 const d = new Date(o.createdAt);
 return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
 })
.reduce((sum, o) => sum + (o.totalCost?? 0), 0);

 const completedOrders = orders.filter((o) => o.status === "DONE");
 const avgCost =
 completedOrders.length > 0
? completedOrders.reduce((s, o) => s + (o.costPerUnit?? 0), 0) /
 completedOrders.length
: 0;

 const STATS: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "info" | "success" | "warning";
 }[] = [
 {
 icon: Boxes,
 label: "BOM فعال",
 value: toPersianDigits(activeBomCount),
 sub: activeBomCount > 0? "تعریف شده": "هنوز تعریف نشده",
 accent: "primary",
 },
 {
 icon: ClipboardList,
 label: "حکم تولید در جریان",
 value: toPersianDigits(activeOrderCount),
 sub: activeOrderCount > 0? "در حال اجرا": "بدون حکم فعال",
 accent: "info",
 },
 {
 icon: Factory,
 label: "هزینه تولید این ماه",
 value:
 totalCostThisMonth > 0? formatCompactToman(totalCostThisMonth): "—",
 sub: totalCostThisMonth > 0? "جاری ماه": "بدون داده",
 accent: "warning",
 },
 {
 icon: Wrench,
 label: "بهای تمام شده میانگین",
 value: avgCost > 0? formatCompactToman(avgCost): "—",
 sub: avgCost > 0? "بر اساس احکام تکمیل‌شده": "بدون داده",
 accent: "success",
 },
 ];

 // ساخت درخت BOM انتخاب‌شده
 const selectedBom = boms.find((b) => b.id === selectedBomId)?? null;
 const bomTree: BomNode | null = selectedBom
? buildBomTree(selectedBom, boms)
: null;

 // نگاشت سفارشی برای نمایش BOMها در جدول
 const bomRows = boms.map((b) => ({
 id: b.id,
 name: b.name,
 product:
 b.items.find((it) => it.productId === b.productId)?.product?.name??
 "—",
 materials: b.materialsCount,
 version: `v${toPersianDigits(b.version)}`,
 cost: b.estimatedCost,
 status: (b.status === "ACTIVE"? "ACTIVE": "INACTIVE") as
 | "ACTIVE"
 | "INACTIVE",
 }));

 // نگاشت سفارشی برای نمایش احکام تولید در جدول
 const orderRows = orders.map((o) => ({
 id: o.id,
 number: o.number,
 bom: o.bom?.name?? "—",
 qty: o.quantity,
 status: mapOrderStatus(o.status),
 startDate: toJalali(new Date(o.startDate)),
 cost: o.totalCost,
 }));

 /* ============ حالت بارگذاری ============ */
 if (loading && boms.length === 0 && orders.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-20 gap-3 animate-fade-in-up">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">
 در حال دریافت داده‌های ماژول تولیدی…
 </p>
 </div>
 );
 }

 /* ============ حالت خطا ============ */
 if (error && boms.length === 0 && orders.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in-up">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
 <AlertCircle className="h-7 w-7" strokeWidth={1.5} />
 </div>
 <div className="text-center max-w-sm">
 <h3 className="text-sm font-semibold text-foreground mb-1">
 خطا در دریافت داده‌ها
 </h3>
 <p className="text-xs text-muted-foreground leading-relaxed">
 {error}
 </p>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5"
 onClick={() => void refresh()}
 >
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 );
 }

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر + اقدامات */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <p className="text-xs text-muted-foreground mb-0.5">مدیریت تولید</p>
 <h2 className="text-xl font-bold text-foreground">ماژول تولیدی</h2>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="gap-1.5 h-9"
 onClick={() => void refresh()}
 disabled={loading}
 >
 <RefreshCw
 className={`h-3.5 w-3.5 ${loading? "animate-spin": ""}`}
 />
 به‌روزرسانی
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <FileBarChart className="h-3.5 w-3.5" />
 گزارش هزینه
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <CheckCircle2 className="h-3.5 w-3.5" />
 کنترل کیفیت
 </Button>
 <Button variant="outline" size="sm" className="gap-1.5 h-9">
 <GitBranch className="h-3.5 w-3.5" />
 تعریف BOM
 </Button>
 <Button size="sm" className="gap-1.5 h-9">
 <Plus className="h-3.5 w-3.5" />
 حکم تولید جدید
 </Button>
 </div>
 </div>

 {/* ردیف آمار */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {STATS.map((s, i) => (
 <StatCard key={s.label} {...s} delay={i * 60} />
 ))}
 </div>

 {/* لیست BOM ها */}
 <Card className="card-hover">
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <GitBranch className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">فهرست مواد تولید (BOM)</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(activeBomCount)} BOM فعال
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 gap-1 text-muted-foreground"
 disabled
 >
 همه
 <ChevronLeft className="h-3 w-3" />
 </Button>
 </CardHeader>
 <CardContent className="p-0">
 {bomRows.length === 0? (
 <EmptyState
 icon={GitBranch}
 title="هنوز BOM ای تعریف نشده"
 description="برای محاسبه بهای تمام شده و صدور حکم تولید، اولین فهرست مواد (BOM) محصول خود را تعریف کنید."
 action={
 <Button size="sm" className="gap-1.5">
 <GitBranch className="h-3.5 w-3.5" />
 تعریف اولین BOM
 </Button>
 }
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[760px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">نام BOM</th>
 <th scope="col" className="font-medium px-4 py-2.5">محصول نهایی</th>
 <th scope="col" className="font-medium px-4 py-2.5">تعداد مواد اولیه</th>
 <th scope="col" className="font-medium px-4 py-2.5">نسخه</th>
 <th scope="col" className="font-medium px-4 py-2.5">هزینه برآوردی</th>
 <th scope="col" className="font-medium px-4 py-2.5">وضعیت</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {bomRows.map((bom, i) => {
 const isSelected = bom.id === selectedBomId;
 return (
 <tr
 key={bom.id}
 onClick={() => setSelectedBomId(bom.id)}
 className={`border-b border-border/40 transition-colors animate-stagger cursor-pointer hover:bg-muted/40 ${
 isSelected? "bg-primary/5": ""
 }`}
 style={{ animationDelay: `${i * 40}ms` }}
 >
 <td className="px-4 py-3 font-medium">{bom.name}</td>
 <td className="px-4 py-3 text-muted-foreground">{bom.product}</td>
 <td className="px-4 py-3">
 <Badge variant="outline" className="font-mono text-[10px]">
 {toPersianDigits(bom.materials)} قلم
 </Badge>
 </td>
 <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
 {bom.version}
 </td>
 <td className="px-4 py-3 font-medium">
 {bom.cost > 0? formatCompactToman(bom.cost): "—"}
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="secondary"
 className={`text-[10px] ${
 bom.status === "ACTIVE"
? "bg-success/10 text-success"
: "bg-muted text-muted-foreground"
 }`}
 >
 {bom.status === "ACTIVE"? "فعال": "غیرفعال"}
 </Badge>
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

 {/* احکام تولید + درخت BOM */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 {/* احکام تولید */}
 <Card className="lg:col-span-2 card-hover">
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
 <ClipboardList className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">احکام تولید</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(activeOrderCount)} در جریان ·{" "}
 {toPersianDigits(orders.length)} کل
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 gap-1 text-muted-foreground"
 disabled
 >
 مشاهده همه
 <ChevronLeft className="h-3 w-3" />
 </Button>
 </CardHeader>
 <CardContent className="p-0">
 {orderRows.length === 0? (
 <EmptyState
 icon={ClipboardList}
 title="هنوز حکم تولیدی ثبت نشده"
 description="پس از تعریف BOM، اولین حکم تولید را با مشخص کردن تعداد و تاریخ شروع صادر کنید."
 action={
 <Button size="sm" className="gap-1.5">
 <Plus className="h-3.5 w-3.5" />
 حکم تولید جدید
 </Button>
 }
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[700px] table-zebra">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">شماره حکم</th>
 <th scope="col" className="font-medium px-4 py-2.5">BOM</th>
 <th scope="col" className="font-medium px-4 py-2.5">تعداد</th>
 <th scope="col" className="font-medium px-4 py-2.5">وضعیت</th>
 <th scope="col" className="font-medium px-4 py-2.5">تاریخ شروع</th>
 <th scope="col" className="font-medium px-4 py-2.5">هزینه کل</th>
 </tr>
 </thead>
 <tbody className="tnum">
 {orderRows.map((o, i) => {
 const SIcon = ORDER_STATUS_ICON[o.status];
 return (
 <tr
 key={o.id}
 className="border-b border-border/40 transition-colors animate-stagger"
 style={{ animationDelay: `${i * 40}ms` }}
 >
 <td className="px-4 py-3 font-mono text-xs">{o.number}</td>
 <td className="px-4 py-3 font-medium">{o.bom}</td>
 <td className="px-4 py-3">
 <span className="font-medium">{toPersianDigits(o.qty)}</span>
 <span className="text-[10px] text-muted-foreground ms-1">واحد</span>
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="secondary"
 className={`text-[10px] gap-1 ${ORDER_STATUS_BADGE[o.status]}`}
 >
 <SIcon className="h-2.5 w-2.5" />
 {ORDER_STATUS_FA[o.status]}
 </Badge>
 </td>
 <td className="px-4 py-3 text-muted-foreground text-xs">
 {o.startDate}
 </td>
 <td className="px-4 py-3 font-medium">
 {o.cost > 0? formatCompactToman(o.cost): "—"}
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

 {/* درخت محصول (BOM) */}
 <Card className="card-hover">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <GitBranch className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">درخت محصول (BOM)</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {selectedBom
? selectedBom.name
: boms.length > 0
? "یک BOM را انتخاب کنید"
: "نمونه‌ای موجود نیست"}
 </p>
 </div>
 </div>
 </CardHeader>
 <CardContent className="pt-0">
 {bomTree? (
 <div className="space-y-0.5 py-1">
 <BomTreeNode node={bomTree} depth={0} />
 </div>
 ): (
 <EmptyState
 icon={Layers}
 title="هنوز BOM ای برای نمایش وجود ندارد"
 description="پس از تعریف اولین BOM، درخت سلسله‌مراتبی محصول نهایی، زیرمجموعه‌ها و مواد اولیه در این بخش نمایش داده می‌شود."
 className="py-4"
 />
 )}
 </CardContent>
 </Card>
 </div>
 </div>
 );
}

/* ============ کارت درخت BOM ============ */
function BomTreeNode({ node, depth }: { node: BomNode; depth: number }) {
 const ICON: Record<BomNode["type"], LucideIcon> = {
 product: Package,
 assembly: Layers,
 material: CircleDot,
 };
 const ACCENT: Record<BomNode["type"], string> = {
 product: "bg-primary/10 text-primary",
 assembly: "bg-info/10 text-info",
 material: "bg-muted text-muted-foreground",
 };
 const Icon = ICON[node.type];
 return (
 <>
 <div
 className="flex items-center gap-2 rounded-md hover:bg-muted/40 px-2 py-1.5 transition-colors"
 style={{ marginRight: `${depth * 14}px` }}
 >
 {depth > 0 && (
 <span className="text-muted-foreground/40 text-xs select-none">└</span>
 )}
 <div
 className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${ACCENT[node.type]}`}
 >
 <Icon className="h-3 w-3" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium truncate">{node.name}</p>
 <p className="text-[10px] text-muted-foreground font-mono">
 {node.code} · {node.qty}
 </p>
 </div>
 {node.type === "product" && (
 <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">
 محصول نهایی
 </Badge>
 )}
 {node.type === "assembly" && (
 <Badge variant="outline" className="text-[9px] border-info/30 text-info">
 زیرمجموعه
 </Badge>
 )}
 </div>
 {node.children?.map((child, i) => (
 <BomTreeNode key={i} node={child} depth={depth + 1} />
 ))}
 </>
 );
}

/* ============ StatCard ============ */
function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 accent,
 delay,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 accent: "primary" | "info" | "success" | "warning";
 delay: number;
}) {
 const accentMap: Record<string, string> = {
 primary: "bg-primary/10 text-primary",
 info: "bg-info/10 text-info",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
 };
 return (
 <Card
 className="card-hover animate-stagger"
 style={{ animationDelay: `${delay}ms` }}
 >
 <CardContent className="p-4">
 <div className="flex items-start justify-between mb-2">
 <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[accent]}`}>
 <Icon className="h-4.5 w-4.5" />
 </div>
 </div>
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="text-lg font-bold text-foreground tnum leading-tight mt-0.5">{value}</p>
 <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
 </CardContent>
 </Card>
 );
}
