"use client";

import * as React from "react";
import {
 ShieldCheck,
 Plus,
 RefreshCw,
 Trash2,
 Eye,
 Code2,
 ShieldAlert,
 ExternalLink,
 Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

/* ============ تایپ‌ها ============ */
interface TrustBadge {
 id: string;
 title: string;
 html: string;
 placement: "footer";
 enabled: boolean;
}

/* ============ نمونه‌ی آماده‌ی اینماد (کد کاربر) ============ */
const SAMPLE_ENAMAD = `<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=742712&Code=0H2FJwLlJ05wlmBZKpxzIjqp2Xc8oiQk'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=742712&Code=0H2FJwLlJ05wlmBZKpxzIjqp2Xc8oiQk' alt='' style='cursor:pointer' code='0H2FJwLlJ05wlmBZKpxzIjqp2Xc8oiQk'></a>`;

function apiFetch(path: string, token: string, options: RequestInit = {}) {
 return fetch(path, {
 ...options,
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 ...(options.headers || {}),
 },
 });
}

/* ============ تب نمادهای اعتماد ============ */
export function TrustBadgesTab({ token }: { token: string }) {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(true);
 const [saving, setSaving] = React.useState(false);
 const [badges, setBadges] = React.useState<TrustBadge[]>([]);
 const [previewId, setPreviewId] = React.useState<string | null>(null);

 // فرم افزودن/ویرایش
 const [editIdx, setEditIdx] = React.useState<number | null>(null);
 const [formTitle, setFormTitle] = React.useState("");
 const [formHtml, setFormHtml] = React.useState("");

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/settings/trust-badges", token);
 const json = (await res.json()) as { success?: boolean; data?: TrustBadge[] };
 setBadges(Array.isArray(json?.data) ? json.data : []);
 } catch {
 toast({ title: "خطا در دریافت نمادها", variant: "destructive" });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const startAdd = () => {
 setEditIdx(badges.length);
 setFormTitle("");
 setFormHtml("");
 };

 const startEdit = (i: number) => {
 setEditIdx(i);
 setFormTitle(badges[i]?.title || "");
 setFormHtml(badges[i]?.html || "");
 };

 const cancelForm = () => {
 setEditIdx(null);
 setFormTitle("");
 setFormHtml("");
 };

 const applyForm = () => {
 if (!formHtml.trim()) {
 toast({ title: "کد HTML نماد الزامی است", variant: "destructive" });
 return;
 }
 const badge: TrustBadge = {
 id: editIdx !== null && badges[editIdx]?.id ? badges[editIdx].id : `badge-${Date.now().toString(36)}`,
 title: formTitle.trim(),
 html: formHtml.trim(),
 placement: "footer",
 enabled: true,
 };
 setBadges((prev) => {
 const next = [...prev];
 if (editIdx !== null && editIdx < next.length) next[editIdx] = badge;
 else next.push(badge);
 return next;
 });
 cancelForm();
 toast({ title: "نماد به لیست اضافه شد (برای اعمال، ذخیره کنید)" });
 };

 const insertSampleEnamad = () => {
 setFormTitle("اینماد");
 setFormHtml(SAMPLE_ENAMAD);
 toast({ title: "کد نمونه‌ی اینماد درج شد — ذخیره کنید" });
 };

 const save = async () => {
 setSaving(true);
 try {
 const res = await apiFetch("/api/platform/settings/trust-badges", token, {
 method: "POST",
 body: JSON.stringify({ badges }),
 });
 const json = (await res.json()) as { success?: boolean; error?: string; data?: TrustBadge[] };
 if (!res.ok || !json.success) {
 toast({ title: json.error || "خطا در ذخیره", variant: "destructive" });
 return;
 }
 setBadges(Array.isArray(json.data) ? json.data : badges);
 toast({ title: "نمادها ذخیره شدند", description: "در فوتر لندینگ برای همه‌ی بازدیدکنندگان نمایش داده می‌شود" });
 } catch {
 toast({ title: "خطای شبکه", variant: "destructive" });
 } finally {
 setSaving(false);
 }
 };

 return (
 <div className="space-y-6">
 {/* هدر */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold flex items-center gap-2">
 <ShieldCheck className="h-5 w-5 text-primary" />
 نمادهای اعتماد
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 نماد اینماد، ساماندهی و... — کد HTML را وارد کنید تا در فوتر لندینگ نمایش داده شود
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
 <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
 بروزرسانی
 </Button>
 <Button size="sm" onClick={startAdd}>
 <Plus className="h-4 w-4" />
 افزودن نماد
 </Button>
 <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
 {saving ? "در حال ذخیره..." : "ذخیره همه"}
 </Button>
 </div>
 </div>

 {/* راهنما */}
 <Alert>
 <Info className="h-4 w-4" />
 <AlertTitle>راهنمای سریع</AlertTitle>
 <AlertDescription>
 کد HTML نماد (مثل کد اینماد از پنل enamad.ir) را در بخش «افزودن نماد» بچسبانید. تگ‌های مجاز:
 <span className="font-mono text-xs" dir="ltr"> a, img, div, span </span>
 — script و iframe به دلایل امنیتی حذف می‌شوند. حداکثر ۱۲ نماد.
 </AlertDescription>
 </Alert>

 {/* لیست */}
 {loading ? (
 <div className="space-y-3">
 <Skeleton className="h-24 w-full" />
 <Skeleton className="h-24 w-full" />
 </div>
 ) : badges.length === 0 && editIdx === null ? (
 <Card>
 <CardContent className="py-12 text-center text-muted-foreground">
 <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-40" />
 هیچ نمادی ثبت نشده — با «افزودن نماد» یا درج کد اینماد شروع کنید
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-3">
 {badges.map((b, i) => (
 <Card key={b.id}>
 <CardContent className="p-4">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-3 min-w-0">
 <div className="h-12 w-12 shrink-0 rounded-lg border bg-card flex items-center justify-center overflow-hidden">
 {/* پیش‌نمایش زنده */}
 <div
 className="scale-90 origin-center"
 dangerouslySetInnerHTML={{ __html: b.html }}
 />
 </div>
 <div className="min-w-0">
 <p className="font-semibold truncate">{b.title || "بدون عنوان"}</p>
 <p className="text-xs text-muted-foreground truncate" dir="ltr">
 {b.html.replace(/<[^>]+>/g, "").trim().slice(0, 60) || "—"}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant={b.enabled ? "default" : "secondary"}>
 {b.enabled ? "فعال" : "غیرفعال"}
 </Badge>
 <Switch
 checked={b.enabled}
 onCheckedChange={(v) =>
 setBadges((prev) => prev.map((x, j) => (j === i ? { ...x, enabled: v } : x)))
 }
 aria-label="فعال/غیرفعال"
 />
 <Button
 variant="ghost"
 size="icon"
 onClick={() => setPreviewId(previewId === b.id ? null : b.id)}
 aria-label="پیش‌نمایش کامل"
 >
 <Eye className="h-4 w-4" />
 </Button>
 <Button variant="ghost" size="icon" onClick={() => startEdit(i)} aria-label="ویرایش">
 <Code2 className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => setBadges((prev) => prev.filter((_, j) => j !== i))}
 aria-label="حذف"
 className="text-destructive hover:text-destructive"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </div>
 {/* پیش‌نمایش بزرگ */}
 {previewId === b.id && (
 <div className="mt-4 rounded-lg border bg-muted/40 p-4 flex items-center justify-center">
 <div dangerouslySetInnerHTML={{ __html: b.html }} />
 </div>
 )}
 </CardContent>
 </Card>
 ))}
 </div>
 )}

 {/* فرم افزودن/ویرایش */}
 {editIdx !== null && (
 <Card className="border-primary/40">
 <CardHeader className="pb-3">
 <CardTitle className="text-base">
 {editIdx < badges.length ? "ویرایش نماد" : "افزودن نماد جدید"}
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="badge-title">عنوان (اختیاری — فقط برای مدیریت)</Label>
 <Input
 id="badge-title"
 value={formTitle}
 onChange={(e) => setFormTitle(e.target.value)}
 placeholder="مثلاً: اینماد، ساماندهی، نماد اعتماد الکترونیکی"
 />
 </div>
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <Label htmlFor="badge-html">کد HTML نماد</Label>
 <Button variant="outline" size="sm" onClick={insertSampleEnamad}>
 <ExternalLink className="h-3.5 w-3.5" />
 درج کد اینماد (نمونه)
 </Button>
 </div>
 <Textarea
 id="badge-html"
 value={formHtml}
 onChange={(e) => setFormHtml(e.target.value)}
 dir="ltr"
 rows={6}
 className="font-mono text-xs"
 placeholder="<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?...'><img ... /></a>"
 />
 <p className="text-xs text-muted-foreground">
 فقط تگ‌های a و img و div/span مجازند؛ onclick و javascript: بلاک می‌شوند.
 </p>
 </div>
 {/* پیش‌نمایش */}
 {formHtml.trim() && (
 <div className="rounded-lg border bg-muted/40 p-4 flex items-center justify-center min-h-16">
 <div dangerouslySetInnerHTML={{ __html: formHtml }} />
 </div>
 )}
 <div className="flex gap-2">
 <Button onClick={applyForm}>
 <Plus className="h-4 w-4" />
 {editIdx < badges.length ? "اعمال ویرایش" : "افزودن به لیست"}
 </Button>
 <Button variant="ghost" onClick={cancelForm}>
 انصراف
 </Button>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 );
}
