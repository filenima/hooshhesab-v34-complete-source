"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 Plus,
 Search,
 Filter,
 RefreshCw,
 Loader2,
 Pencil,
 Trash2,
 ExternalLink,
 FileText,
 Clock,
 Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
 Card,
 CardContent,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

// ============ Types ============
interface CMSListProps {
 onEdit: (postId: string) => void;
 onNew: () => void;
}

interface BlogPostRow {
 id: string;
 slug: string;
 title: string;
 excerpt: string | null;
 category: string;
 status: string;
 publishedAt: string | null;
 readingTime: number;
 coverImage: string | null;
 createdAt: string;
 updatedAt: string;
}

const CATEGORY_OPTIONS = [
 { value: "ACCOUNTING", label: "حسابداری", color: "bg-primary/10 text-primary" },
 { value: "TAX", label: "مالیات", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
 { value: "PAYROLL", label: "حقوق و دستمزد", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
 { value: "TUTORIAL", label: "آموزشی", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
 { value: "NEWS", label: "اخبار", color: "bg-chart-5/10 text-chart-5" },
 { value: "MODIAN", label: "مودیان", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
];

const STATUS_OPTIONS = [
 { value: "DRAFT", label: "پیش‌نویس", color: "bg-muted text-muted-foreground" },
 { value: "PUBLISHED", label: "منتشر شده", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
 { value: "ARCHIVED", label: "آرشیو", color: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
 CATEGORY_OPTIONS.map((c) => [c.value, c.label])
);
const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
 CATEGORY_OPTIONS.map((c) => [c.value, c.color])
);
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
 STATUS_OPTIONS.map((s) => [s.value, s.label])
);
const STATUS_COLOR: Record<string, string> = Object.fromEntries(
 STATUS_OPTIONS.map((s) => [s.value, s.color])
);

// ============ Main Component ============
export function CMSList({ onEdit, onNew }: CMSListProps) {
 const { toast } = useToast();
 const [posts, setPosts] = React.useState<BlogPostRow[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [search, setSearch] = React.useState("");
 const [categoryFilter, setCategoryFilter] = React.useState("all");
 const [statusFilter, setStatusFilter] = React.useState("all");
 const [deleteTarget, setDeleteTarget] = React.useState<BlogPostRow | null>(null);
 const [deleting, setDeleting] = React.useState(false);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const res = await fetch("/api/platform/cms/posts", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 setPosts(data.data || []);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت پست‌ها",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const confirmDelete = async () => {
 if (!deleteTarget) return;
 setDeleting(true);
 try {
 const token = localStorage.getItem("hoshhesab_admin_token") || "";
 const res = await fetch(`/api/platform/cms/posts/${deleteTarget.id}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا");
 toast({ title: "پست حذف شد", description: deleteTarget.title });
 setDeleteTarget(null);
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در حذف پست",
 variant: "destructive",
 });
 } finally {
 setDeleting(false);
 }
 };

 // ============ Filtering ============
 const filtered = React.useMemo(() => {
 let list = posts;
 if (categoryFilter!== "all") {
 list = list.filter((p) => p.category === categoryFilter);
 }
 if (statusFilter!== "all") {
 list = list.filter((p) => p.status === statusFilter);
 }
 if (search.trim()) {
 const q = search.trim().toLowerCase();
 list = list.filter(
 (p) =>
 p.title.toLowerCase().includes(q) ||
 p.slug.toLowerCase().includes(q) ||
 (p.excerpt || "").toLowerCase().includes(q)
 );
 }
 return list;
 }, [posts, search, categoryFilter, statusFilter]);

 const stats = React.useMemo(() => {
 return {
 total: posts.length,
 published: posts.filter((p) => p.status === "PUBLISHED").length,
 draft: posts.filter((p) => p.status === "DRAFT").length,
 archived: posts.filter((p) => p.status === "ARCHIVED").length,
 };
 }, [posts]);

 return (
 <div className="space-y-4">
 {/* Header row */}
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div>
 <h2 className="text-base font-bold flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary" />
 مدیریت محتوا (CMS)
 </h2>
 <p className="text-[11px] text-muted-foreground">
 مدیریت پست‌های بلاگ، آموزش‌ها و مقالات
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 text-xs">
 {loading? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RefreshCw className="h-3.5 w-3.5" />}
 به‌روزرسانی
 </Button>
 <Button
 size="sm"
 onClick={onNew}
 className="h-8 text-xs relative bg-primary hover:bg-primary/90"
 >
 <span className="absolute inset-0 rounded-md bg-primary/40 animate-ping opacity-50" />
 <Plus className="h-3.5 w-3.5 relative" />
 <span className="relative">پست جدید</span>
 </Button>
 </div>
 </div>

 {/* Mini stats */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <MiniStat label="کل پست‌ها" value={stats.total} accent="text-foreground" />
 <MiniStat label="منتشر شده" value={stats.published} accent="text-emerald-600 dark:text-emerald-400" />
 <MiniStat label="پیش‌نویس" value={stats.draft} accent="text-muted-foreground" />
 <MiniStat label="آرشیو" value={stats.archived} accent="text-zinc-500" />
 </div>

 {/* Filters */}
 <Card className="card-hover">
 <CardContent className="p-3">
 <div className="flex flex-wrap gap-2">
 <div className="relative flex-1 min-w-[200px]">
 <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجو در عنوان، slug یا خلاصه..."
 className="ps-8 h-9 text-xs"
 />
 </div>
 <Select value={categoryFilter} onValueChange={setCategoryFilter}>
 <SelectTrigger className="w-[140px] h-9 text-xs">
 <Filter className="h-3.5 w-3.5 text-muted-foreground me-1.5" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه دسته‌ها</SelectItem>
 {CATEGORY_OPTIONS.map((c) => (
 <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select value={statusFilter} onValueChange={setStatusFilter}>
 <SelectTrigger className="w-[130px] h-9 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه وضعیت‌ها</SelectItem>
 {STATUS_OPTIONS.map((s) => (
 <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 {(search || categoryFilter!== "all" || statusFilter!== "all") && (
 <Button
 variant="ghost"
 size="sm"
 className="h-9 text-xs"
 onClick={() => {
 setSearch("");
 setCategoryFilter("all");
 setStatusFilter("all");
 }}
 >
 پاک کردن فیلترها
 </Button>
 )}
 </div>
 </CardContent>
 </Card>

 {/* Table */}
 <Card>
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table className="table-zebra">
 <TableHeader>
 <TableRow>
 <TableHead className="text-start text-[11px] min-w-[220px]">عنوان پست</TableHead>
 <TableHead className="text-start text-[11px]">دسته‌بندی</TableHead>
 <TableHead className="text-start text-[11px]">وضعیت</TableHead>
 <TableHead className="text-start text-[11px]">تاریخ انتشار</TableHead>
 <TableHead className="text-end text-[11px]">مدت مطالعه</TableHead>
 <TableHead className="text-end text-[11px]">عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {loading? (
 Array.from({ length: 5 }).map((_, i) => (
 <TableRow key={`sk-${i}`}>
 <TableCell><Skeleton className="h-5 w-[220px]" /></TableCell>
 <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
 <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
 <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
 <TableCell><Skeleton className="h-5 w-[40px]" /></TableCell>
 <TableCell><Skeleton className="h-5 w-[120px]" /></TableCell>
 </TableRow>
 ))
 ): filtered.length === 0? (
 <TableRow>
 <TableCell colSpan={6} className="py-12">
 <EmptyState onNew={onNew} hasAnyPost={posts.length > 0} />
 </TableCell>
 </TableRow>
 ): (
 filtered.map((p) => (
 <TableRow key={p.id} className="group">
 <TableCell>
 <div className="flex items-start gap-2.5">
 {p.coverImage? (
 <div className="h-10 w-10 rounded-md overflow-hidden border border-border shrink-0 bg-muted">
 <img
 src={p.coverImage}
 alt=""
 className="h-full w-full object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).style.display = "none";
 }}
 />
 </div>
 ): (
 <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
 <FileText className="h-4 w-4" />
 </div>
 )}
 <div className="min-w-0">
 <p className="text-[13px] font-medium truncate max-w-[260px]">
 {p.title}
 </p>
 <code className="text-[10px] font-mono text-muted-foreground" dir="ltr">
 /{p.slug}
 </code>
 </div>
 </div>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${CATEGORY_COLOR[p.category] || ""}`}>
 {CATEGORY_LABEL[p.category] || p.category}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="secondary" className={`text-[10px] ${STATUS_COLOR[p.status] || ""}`}>
 {STATUS_LABEL[p.status] || p.status}
 </Badge>
 </TableCell>
 <TableCell className="text-[11px] tnum text-muted-foreground">
 {p.publishedAt? (
 <span className="flex items-center gap-1">
 <Calendar className="h-3 w-3" />
 {toJalali(new Date(p.publishedAt))}
 </span>
 ): (
 <span className="text-muted-foreground/60">—</span>
 )}
 </TableCell>
 <TableCell className="text-end text-[11px] tnum text-muted-foreground">
 <span className="inline-flex items-center gap-1">
 <Clock className="h-3 w-3" />
 {toPersianDigits(p.readingTime || 5)}
 </span>
 </TableCell>
 <TableCell>
 <div className="flex items-center justify-end gap-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px]"
 onClick={() => onEdit(p.id)}
 title="ویرایش"
 >
 <Pencil className="h-3 w-3" />
 <span className="hidden sm:inline">ویرایش</span>
 </Button>
 {p.status === "PUBLISHED" && (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-[11px]"
 onClick={() => window.open(`/blog/${p.slug}`, "_blank")}
 title="مشاهده"
 >
 <ExternalLink className="h-3 w-3" />
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-[11px] text-destructive hover:text-destructive"
 onClick={() => setDeleteTarget(p)}
 title="حذف"
 >
 <Trash2 className="h-3 w-3" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 {/* Delete confirm */}
 <AlertDialog open={!!deleteTarget} onOpenChange={(o) =>!o && setDeleteTarget(null)}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="text-base">حذف پست</AlertDialogTitle>
 <AlertDialogDescription className="text-xs">
 آیا از حذف «{deleteTarget?.title}» مطمئن هستید؟ این عمل قابل بازگشت نیست.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter className="gap-2">
 <AlertDialogCancel className="h-9 text-xs">انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={confirmDelete}
 disabled={deleting}
 className="h-9 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 {deleting? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Trash2 className="h-3.5 w-3.5" />}
 حذف پست
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}

// ============ Mini Stat Card ============
function MiniStat({
 label,
 value,
 accent,
}: {
 label: string;
 value: number;
 accent?: string;
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-3">
 <p className="text-[10px] text-muted-foreground truncate">{label}</p>
 <p className={`text-lg font-bold tnum mt-0.5 ${accent || ""}`}>
 {toPersianDigits(value)}
 </p>
 </CardContent>
 </Card>
 );
}

// ============ Empty State ============
function EmptyState({
 onNew,
 hasAnyPost,
}: {
 onNew: () => void;
 hasAnyPost: boolean;
}) {
 return (
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className="flex flex-col items-center justify-center gap-3 text-center py-6"
 >
 <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
 <FileText className="h-6 w-6" />
 </div>
 <div>
 <p className="text-sm font-medium">
 {hasAnyPost? "موردی یافت نشد": "هنوز پستی ایجاد نشده"}
 </p>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {hasAnyPost
? "فیلترها را تغییر دهید یا پست جدیدی بسازید."
: "اولین پست بلاگ را برای هوش بنویسید."}
 </p>
 </div>
 {!hasAnyPost && (
 <Button
 size="sm"
 onClick={onNew}
 className="h-8 text-xs bg-primary hover:bg-primary/90 relative"
 >
 <span className="absolute inset-0 rounded-md bg-primary/40 animate-ping opacity-50" />
 <Plus className="h-3.5 w-3.5 relative" />
 <span className="relative">ایجاد اولین پست</span>
 </Button>
 )}
 </motion.div>
 );
}

export default CMSList;
