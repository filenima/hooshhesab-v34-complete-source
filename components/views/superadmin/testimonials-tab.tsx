"use client";

import * as React from "react";
import {
 Star,
 CheckCircle2,
 XCircle,
 Trash2,
 Star as StarIcon,
 RefreshCw,
 MessageSquareQuote,
 Clock,
 BadgeCheck,
 Eye,
 EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

interface Testimonial {
 id: string;
 name: string;
 role: string | null;
 company: string | null;
 rating: number;
 content: string;
 status: "PENDING" | "APPROVED" | "REJECTED";
 featured: boolean;
 reply: string | null;
 userEmail: string | null;
 createdAt: string;
}

type FilterStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

/**
 * TestimonialsTab — مدیریت نظرات لندینگ (تایید/رد/حذف/پاسخ)
 *
 * نظرات ثبت‌شده در لندینگ اینجا بررسی و تایید می‌شوند؛
 * پس از تایید در لندینگ و Google rich snippet (ستاره‌ها) نمایش داده می‌شوند.
 */
export function TestimonialsTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [items, setItems] = React.useState<Testimonial[]>([]);
 const [stats, setStats] = React.useState<Record<string, number>>({ PENDING: 0, APPROVED: 0, REJECTED: 0 });
 const [loading, setLoading] = React.useState(true);
 const [filter, setFilter] = React.useState<FilterStatus>("ALL");
 // دیالوگ پاسخ
 const [replyFor, setReplyFor] = React.useState<Testimonial | null>(null);
 const [replyText, setReplyText] = React.useState("");

 const api = React.useCallback(
 async (path: string, init?: RequestInit) => {
 const res = await fetch(`/api/platform/testimonials${path}`, {
...init,
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
...(init?.headers || {}),
 },
 });
 const j = await res.json().catch(() => ({}));
 if (!res.ok ||!j.success) throw new Error(j.error || `HTTP ${res.status}`);
 return j;
 },
 [token]
 );

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const q = filter === "ALL"? "": `?status=${filter}`;
 const j = await api(q);
 setItems(j.data || []);
 setStats(j.stats || {});
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "بارگذاری نظرات ناموفق بود",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [api, filter, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const setStatus = async (t: Testimonial, status: Testimonial["status"]) => {
 try {
 await api("", { method: "PATCH", body: JSON.stringify({ id: t.id, status }) });
 toast({
 title: status === "APPROVED"? "نظر تایید شد": "نظر رد شد",
 description:
 status === "APPROVED"
? "از این لحظه در لندینگ و نتایج گوگل نمایش داده می‌شود."
: "نظر دیگر در لندینگ نمایش داده نمی‌شود.",
 });
 void load();
 } catch (e) {
 toast({ title: "خطا", description: e instanceof Error? e.message: "", variant: "destructive" });
 }
 };

 const toggleFeatured = async (t: Testimonial) => {
 try {
 await api("", { method: "PATCH", body: JSON.stringify({ id: t.id, featured:!t.featured }) });
 void load();
 } catch {
 toast({ title: "خطا", description: "تغییر وضعیت شاخص ناموفق بود", variant: "destructive" });
 }
 };

 const remove = async (t: Testimonial) => {
 if (!confirm(`حذف نظر «${t.name}»؟ این عمل بازگشت‌پذیر نیست.`)) return;
 try {
 await api(`?id=${t.id}`, { method: "DELETE" });
 toast({ title: "حذف شد", description: "نظر برای همیشه حذف شد." });
 void load();
 } catch {
 toast({ title: "خطا", description: "حذف ناموفق بود", variant: "destructive" });
 }
 };

 const saveReply = async () => {
 if (!replyFor) return;
 try {
 await api("", { method: "PATCH", body: JSON.stringify({ id: replyFor.id, reply: replyText }) });
 toast({ title: "پاسخ ذخیره شد" });
 setReplyFor(null);
 setReplyText("");
 void load();
 } catch {
 toast({ title: "خطا", description: "ذخیره پاسخ ناموفق بود", variant: "destructive" });
 }
 };

 const statusBadge = (s: Testimonial["status"]) => {
 switch (s) {
 case "APPROVED":
 return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"><CheckCircle2 className="h-3 w-3 ml-1" />تاییدشده</Badge>;
 case "REJECTED":
 return <Badge className="bg-rose-500/15 text-rose-600 hover:bg-rose-500/15"><XCircle className="h-3 w-3 ml-1" />ردشده</Badge>;
 default:
 return <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15"><Clock className="h-3 w-3 ml-1" />در انتظار</Badge>;
 }
 };

 return (
 <div className="space-y-4" dir="rtl">
 {/* هدر + آمار */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold flex items-center gap-2">
 <MessageSquareQuote className="h-5 w-5 text-primary" />
 نظرات مشتریان (لندینگ)
 </h2>
 <p className="text-xs text-muted-foreground mt-1">
 نظرات ثبت‌شده در صفحه اصلی — پس از تایید در لندینگ و ستاره‌های گوگل نمایش داده می‌شوند.
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
 <RefreshCw className={`h-3.5 w-3.5 ${loading? "animate-spin": ""}`} />
 بروزرسانی
 </Button>
 </div>

 {/* کارت‌های آماری */}
 <div className="grid grid-cols-3 gap-3">
 {(
 [
 { key: "PENDING", label: "در انتظار بررسی", cls: "border-amber-500/30 bg-amber-500/5", icon: Clock },
 { key: "APPROVED", label: "تاییدشده (نمایش)", cls: "border-emerald-500/30 bg-emerald-500/5", icon: CheckCircle2 },
 { key: "REJECTED", label: "ردشده", cls: "border-rose-500/30 bg-rose-500/5", icon: XCircle },
 ] as const
 ).map((s) => (
 <button
 key={s.key}
 onClick={() => setFilter(filter === s.key? "ALL": s.key as FilterStatus)}
 className={`rounded-xl border p-3 text-right transition-all hover:-translate-y-0.5 hover:shadow-sm ${s.cls} ${
 filter === s.key? "ring-2 ring-primary/40": ""
 }`}
 >
 <div className="flex items-center justify-between">
 <s.icon className="h-4 w-4 text-muted-foreground" />
 <span className="text-xl font-bold tnum">{toPersianDigits(stats[s.key] || 0)}</span>
 </div>
 <p className="text-[11px] text-muted-foreground mt-1">{s.label}</p>
 </button>
 ))}
 </div>

 {/* فیلتر */}
 <div className="flex gap-2">
 {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => (
 <Button
 key={f}
 variant={filter === f? "default": "outline"}
 size="sm"
 onClick={() => setFilter(f)}
 >
 {f === "ALL"? "همه": f === "PENDING"? "در انتظار": f === "APPROVED"? "تاییدشده": "ردشده"}
 </Button>
 ))}
 </div>

 {/* لیست نظرات */}
 {loading? (
 <div className="space-y-3">
 {Array.from({ length: 3 }).map((_, i) => (
 <Skeleton key={i} className="h-32 w-full rounded-xl" />
 ))}
 </div>
 ): items.length === 0? (
 <Card className="p-8 text-center">
 <MessageSquareQuote className="h-10 w-10 text-muted-foreground/40 mx-auto" />
 <p className="text-sm font-semibold mt-3">نظری یافت نشد</p>
 <p className="text-xs text-muted-foreground mt-1">
 وقتی کاربران از صفحه اصلی نظر ثبت کنند، اینجا نمایش داده می‌شود.
 </p>
 </Card>
 ): (
 <div className="space-y-3">
 {items.map((t) => (
 <Card key={t.id} className="p-4">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div className="flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-sm font-bold text-primary-foreground">
 {t.name.charAt(0)}
 </div>
 <div>
 <div className="flex items-center gap-1.5">
 <p className="text-sm font-semibold">{t.name}</p>
 {statusBadge(t.status)}
 {t.featured && (
 <Badge variant="secondary" className="text-[10px]">
 <StarIcon className="h-3 w-3 ml-0.5 fill-amber-400 text-amber-400" />
 شاخص
 </Badge>
 )}
 </div>
 <p className="text-[11px] text-muted-foreground">
 {t.role || "—"}{t.company? ` — ${t.company}`: ""}
 {" · "}
 {new Date(t.createdAt).toLocaleDateString("fa-IR")}
 </p>
 </div>
 </div>
 {/* ستاره‌ها */}
 <div className="flex gap-0.5">
 {Array.from({ length: 5 }).map((_, i) => (
 <Star
 key={i}
 className={
 i < t.rating
? "h-4 w-4 fill-amber-400 text-amber-400"
: "h-4 w-4 text-muted-foreground/30"
 }
 />
 ))}
 </div>
 </div>

 <p className="mt-3 text-sm leading-relaxed text-foreground/90 rounded-lg bg-muted/40 p-3">
 {t.content}
 </p>

 {t.reply && (
 <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
 <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
 <BadgeCheck className="h-3 w-3" />
 پاسخ هوش:
 </p>
 <p className="text-xs text-foreground/80 mt-1">{t.reply}</p>
 </div>
 )}

 {/* اکشن‌ها */}
 <div className="mt-3 flex flex-wrap gap-2">
 {t.status!== "APPROVED" && (
 <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10" onClick={() => void setStatus(t, "APPROVED")}>
 <CheckCircle2 className="h-3.5 w-3.5" />
 تایید و نمایش
 </Button>
 )}
 {t.status!== "REJECTED" && (
 <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-600 hover:bg-amber-500/10" onClick={() => void setStatus(t, "REJECTED")}>
 <XCircle className="h-3.5 w-3.5" />
 رد
 </Button>
 )}
 <Button size="sm" variant="outline" onClick={() => { setReplyFor(t); setReplyText(t.reply || ""); }}>
 <MessageSquareQuote className="h-3.5 w-3.5" />
 {t.reply? "ویرایش پاسخ": "پاسخ"}
 </Button>
 <Button
 size="sm"
 variant="outline"
 title={t.featured? "حذف از شاخص‌ها": "نمایش در صدر لندینگ"}
 onClick={() => void toggleFeatured(t)}
 >
 {t.featured? <EyeOff className="h-3.5 w-3.5" />: <Eye className="h-3.5 w-3.5" />}
 {t.featured? "غیرشاخص": "شاخص"}
 </Button>
 <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => void remove(t)}>
 <Trash2 className="h-3.5 w-3.5" />
 حذف
 </Button>
 </div>
 </Card>
 ))}
 </div>
 )}

 {/* دیالوگ پاسخ */}
 <Dialog open={!!replyFor} onOpenChange={(o) =>!o && setReplyFor(null)}>
 <DialogContent className="sm:max-w-md" dir="rtl">
 <DialogHeader>
 <DialogTitle>پاسخ به نظر «{replyFor?.name}»</DialogTitle>
 <DialogDescription>
 پاسخ شما همراه نظر در لندینگ نمایش داده می‌شود.
 </DialogDescription>
 </DialogHeader>
 <Textarea
 rows={4}
 value={replyText}
 onChange={(e) => setReplyText(e.target.value)}
 placeholder="مثلاً: سپاس از بازخورد شما!..."
 maxLength={400}
 />
 <DialogFooter>
 <Button variant="outline" onClick={() => setReplyFor(null)}>انصراف</Button>
 <Button onClick={() => void saveReply()} disabled={!replyText.trim()}>ذخیره پاسخ</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
