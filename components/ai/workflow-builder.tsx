"use client";

// ============================================================================
// گردش کار هوشمند — UI ساخت و مدیریت گردش کار با هوش مصنوعی
// هوش — Workflow Builder UI
// ----------------------------------------------------------------------------
// Features:
// - نمایش لیست گردش کارهای ذخیره‌شده
// - ساخت گردش کار جدید با توصیف زبان طبیعی فارسی
// - ویرایش trigger، conditions و actions
// - فعال/غیرفعال کردن گردش کار (toggle)
// - حذف گردش کار
// - نمایش تعداد دفعات اجرا و آخرین اجرا
// ============================================================================

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Sparkles,
 X,
 Loader2,
 Plus,
 Trash2,
 Play,
 Pause,
 Edit3,
 Save,
 Clock,
 Zap,
 AlertCircle,
 CheckCircle2,
 Workflow as WorkflowIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";

// ============ Types ============
interface WorkflowCondition {
 field: string;
 operator: string;
 value: string | number | boolean;
}

interface WorkflowAction {
 type: "notification" | "email" | "sms" | "webhook" | "create_task" | "tag";
 template?: string;
 recipient?: string;
 message?: string;
 url?: string;
}

interface SavedWorkflow {
 id: string;
 name: string;
 trigger: string;
 conditions: WorkflowCondition[];
 actions: WorkflowAction[];
 isActive: boolean;
 lastFired: string | null;
 firedCount: number;
 createdAt: string;
 updatedAt: string;
}

interface GeneratedWorkflow {
 name: string;
 description: string;
 trigger: string;
 triggerDescription?: string;
 conditions: WorkflowCondition[];
 actions: WorkflowAction[];
 isActive: boolean;
}

// ============ Trigger labels (Persian) ============
const TRIGGER_LABELS: Record<string, string> = {
 INVOICE_CREATED: "هنگام ثبت فاکتور",
 INVOICE_OVERDUE: "سررسید فاکتور",
 INVOICE_PAID: "پرداخت فاکتور",
 CHECK_DUE: "سررسید چک",
 LOW_STOCK: "موجودی کم",
 PAYMENT_RECEIVED: "دریافت پرداخت",
 EXPENSE_CREATED: "ثبت هزینه",
 PARTY_CREATED: "افزودن طرف‌حساب",
 DAILY: "روزانه",
 WEEKLY: "هفتگی",
 MONTHLY: "ماهانه",
 MANUAL: "دستی",
};

const ACTION_LABELS: Record<string, string> = {
 notification: "اعلان",
 email: "ایمیل",
 sms: "پیامک",
 webhook: "وب‌هوک",
 create_task: "ایجاد وظیفه",
 tag: "برچسب",
};

const EXAMPLES = [
 "هر زمان فاکتور فروش ثبت شد و مبلغش بالای ۱۰۰ میلیون بود، به مدیر اطلاع بده",
 "هر روز ساعت ۹ صبح گزارش فروش دیروز را ایمیل کن",
 "وقتی موجودی محصول به زیر ۵ عدد رسید، هشدار بده",
 "وقتی فاکتور سررسید شد و باقی‌مانده‌اش بالای ۱۰ میلیون است، اعلان بفرست",
];

// ============ Component ============
export interface WorkflowBuilderProps {
 open: boolean;
 onClose: () => void;
}

export function WorkflowBuilder({ open, onClose }: WorkflowBuilderProps) {
 const [description, setDescription] = React.useState("");
 const [workflows, setWorkflows] = React.useState<SavedWorkflow[]>([]);
 const [loadingList, setLoadingList] = React.useState(false);
 const [generating, setGenerating] = React.useState(false);
 const [preview, setPreview] = React.useState<GeneratedWorkflow | null>(null);
 const [editing, setEditing] = React.useState<SavedWorkflow | null>(null);
 const [usedFallback, setUsedFallback] = React.useState(false);
 const { toast } = useToast();

 // ---- Load saved workflows ----
 const loadWorkflows = React.useCallback(async () => {
 setLoadingList(true);
 try {
 const res = await authFetch("/api/ai/workflow-builder", { cache: "no-store" });
 if (res.ok) {
 const data = await res.json();
 if (data.success) {
 setWorkflows(data.workflows || []);
 }
 }
 } catch {
 /* ignore */
 } finally {
 setLoadingList(false);
 }
 }, []);

 React.useEffect(() => {
 if (open) {
 void loadWorkflows();
 }
 }, [open, loadWorkflows]);

 // ---- Generate workflow from description ----
 const generate = React.useCallback(async () => {
 if (!description.trim()) {
 toast({ title: "توضیح الزامی است", variant: "destructive" });
 return;
 }
 setGenerating(true);
 setPreview(null);
 try {
 const res = await authFetch("/api/ai/workflow-builder", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ description, save: false }),
 });
 const data = await res.json();
 if (data.success && data.workflow) {
 setPreview(data.workflow);
 setUsedFallback(!!data.usedFallback);
 if (data.usedFallback) {
 toast({
 title: "گردش کار پیش‌فرض ساخته شد",
 description: "سرویس هوش مصنوعی در دسترس نبود. لطفاً گردش کار را بررسی و اصلاح کنید.",
 });
 } else {
 toast({ title: "گردش کار ساخته شد", description: "برای ذخیره روی «ذخیره» کلیک کنید." });
 }
 } else {
 toast({ title: "خطا", description: data.error || "خطای ناشناخته", variant: "destructive" });
 }
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطای شبکه",
 variant: "destructive",
 });
 } finally {
 setGenerating(false);
 }
 }, [description, toast]);

 // ---- Save workflow (preview DB) ----
 const savePreview = React.useCallback(async () => {
 if (!preview) return;
 setGenerating(true);
 try {
 const res = await authFetch("/api/ai/workflow-builder", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ description, save: true }),
 });
 const data = await res.json();
 if (data.success) {
 toast({ title: "ذخیره شد", description: "گردش کار با موفقیت ذخیره شد." });
 setPreview(null);
 setDescription("");
 await loadWorkflows();
 } else {
 toast({ title: "خطا", description: data.error, variant: "destructive" });
 }
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطای شبکه",
 variant: "destructive",
 });
 } finally {
 setGenerating(false);
 }
 }, [preview, description, loadWorkflows, toast]);

 // ---- Toggle active ----
 const toggleActive = React.useCallback(
 async (id: string, isActive: boolean) => {
 // Optimistic update
 setWorkflows((prev) =>
 prev.map((w) => (w.id === id? {...w, isActive }: w))
 );
 try {
 const res = await authFetch("/api/ai/workflow-builder", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id, isActive }),
 });
 if (!res.ok) {
 // Revert
 setWorkflows((prev) =>
 prev.map((w) => (w.id === id? {...w, isActive:!isActive }: w))
 );
 toast({ title: "خطا", description: "به‌روزرسانی ناموفق بود", variant: "destructive" });
 } else {
 toast({
 title: isActive? "فعال شد": "غیرفعال شد",
 description: isActive? "گردش کار فعال شد.": "گردش کار غیرفعال شد.",
 });
 }
 } catch {
 setWorkflows((prev) =>
 prev.map((w) => (w.id === id? {...w, isActive:!isActive }: w))
 );
 }
 },
 [toast]
 );

 // ---- Delete ----
 const remove = React.useCallback(
 async (id: string) => {
 if (!confirm("آیا از حذف این گردش کار مطمئن هستید؟")) return;
 try {
 const res = await authFetch(`/api/ai/workflow-builder?id=${id}`, {
 method: "DELETE",
 });
 if (res.ok) {
 toast({ title: "حذف شد", description: "گردش کار حذف شد." });
 setWorkflows((prev) => prev.filter((w) => w.id!== id));
 } else {
 toast({ title: "خطا", description: "حذف ناموفق بود", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "خطای شبکه", variant: "destructive" });
 }
 },
 [toast]
 );

 // ---- Update preview field ----
 const updatePreview = React.useCallback(
 (field: keyof GeneratedWorkflow, value: unknown) => {
 setPreview((prev) => (prev? {...prev, [field]: value }: prev));
 },
 []
 );

 return (
 <AnimatePresence>
 {open && (
 <>
 {/* Backdrop */}
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={onClose}
 className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
 />

 {/* Modal */}
 <motion.div
 initial={{ opacity: 0, y: 30, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 30, scale: 0.95 }}
 transition={{ duration: 0.2 }}
 dir="rtl"
 className="fixed inset-0 z-[61] flex items-center justify-center p-3 pointer-events-none"
 >
 <div className="pointer-events-auto bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-l from-primary/5 to-card">
 <div className="flex items-center gap-2">
 <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
 <WorkflowIcon className="h-4.5 w-4.5" />
 </div>
 <div>
 <h2 className="font-bold text-sm">گردش کار هوشمند</h2>
 <p className="text-[10px] text-muted-foreground">
 ساخت و مدیریت گردش کار با هوش مصنوعی
 </p>
 </div>
 </div>
 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
 <X className="h-4 w-4" />
 </Button>
 </div>

 {/* Body */}
 <ScrollArea className="flex-1">
 <div className="p-4 space-y-4">
 {/* Description input */}
 <div className="space-y-2">
 <label className="text-xs font-medium flex items-center gap-1.5">
 <Sparkles className="h-3.5 w-3.5 text-primary" />
 توصیف گردش کار به زبان فارسی
 </label>
 <Textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="مثلاً: هر زمان فاکتور فروش ثبت شد و مبلغش بالای ۱۰۰ میلیون بود، به مدیر اطلاع بده"
 className="min-h-[70px] text-[12px] resize-none"
 disabled={generating}
 />
 <div className="flex flex-wrap gap-1">
 {EXAMPLES.map((ex, i) => (
 <button
 key={i}
 onClick={() => setDescription(ex)}
 disabled={generating}
 className="text-[10px] rounded-full border border-border bg-card hover:bg-accent px-2 py-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
 >
 {ex.length > 35? ex.slice(0, 35) + "...": ex}
 </button>
 ))}
 </div>
 <Button
 onClick={generate}
 disabled={generating ||!description.trim()}
 size="sm"
 className="w-full"
 >
 {generating? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ساخت...
 </>
 ): (
 <>
 <Sparkles className="h-4 w-4" />
 ساخت گردش کار با هوش مصنوعی
 </>
 )}
 </Button>
 </div>

 {/* Preview */}
 {preview && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: "auto" }}
 className="border border-primary/30 rounded-xl bg-primary/5 p-3 space-y-3"
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5">
 <CheckCircle2 className="h-4 w-4 text-emerald-500" />
 <p className="text-xs font-medium">گردش کار پیش‌نهاد شده</p>
 {usedFallback && (
 <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-600/40">
 پیش‌فرض
 </Badge>
 )}
 </div>
 <Button onClick={savePreview} size="sm" disabled={generating} className="h-7">
 <Save className="h-3.5 w-3.5" />
 ذخیره
 </Button>
 </div>

 <div className="space-y-2">
 <div>
 <label className="text-[10px] text-muted-foreground">نام</label>
 <Input
 value={preview.name}
 onChange={(e) => updatePreview("name", e.target.value)}
 className="h-8 text-[12px]"
 />
 </div>
 <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2">
 {preview.description}
 </div>
 <div className="flex items-center gap-2">
 <span className="text-[10px] text-muted-foreground shrink-0">Trigger:</span>
 <Badge variant="secondary" className="text-[10px]">
 {TRIGGER_LABELS[preview.trigger] || preview.trigger}
 </Badge>
 {preview.triggerDescription && (
 <span className="text-[10px] text-muted-foreground">
 ({preview.triggerDescription})
 </span>
 )}
 </div>

 {preview.conditions.length > 0 && (
 <div>
 <p className="text-[10px] text-muted-foreground mb-1">شرط‌ها:</p>
 <div className="space-y-1">
 {preview.conditions.map((c, i) => (
 <div
 key={i}
 className="text-[11px] bg-muted/40 rounded px-2 py-1 flex items-center gap-1.5"
 >
 <span className="font-mono text-primary">{c.field}</span>
 <span className="text-muted-foreground">{c.operator}</span>
 <span className="font-mono">{String(c.value)}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 <div>
 <p className="text-[10px] text-muted-foreground mb-1">اکشن‌ها:</p>
 <div className="space-y-1">
 {preview.actions.map((a, i) => (
 <div
 key={i}
 className="text-[11px] bg-muted/40 rounded px-2 py-1.5"
 >
 <Badge variant="outline" className="text-[9px] me-1.5">
 {ACTION_LABELS[a.type] || a.type}
 </Badge>
 {a.template && (
 <span className="text-muted-foreground">{a.template}</span>
 )}
 {a.message &&!a.template && (
 <span className="text-muted-foreground">{a.message}</span>
 )}
 </div>
 ))}
 </div>
 </div>

 <div className="flex items-center gap-2 pt-1">
 <Switch
 checked={preview.isActive}
 onCheckedChange={(v) => updatePreview("isActive", v)}
 />
 <span className="text-[11px]">
 {preview.isActive? "فعال": "غیرفعال"}
 </span>
 </div>
 </div>
 </motion.div>
 )}

 {/* Saved workflows */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <p className="text-xs font-medium flex items-center gap-1.5">
 <Clock className="h-3.5 w-3.5" />
 گردش کارهای ذخیره‌شده
 {workflows.length > 0 && (
 <Badge variant="secondary" className="text-[9px]">
 {toPersianDigits(workflows.length)}
 </Badge>
 )}
 </p>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => void loadWorkflows()}
 disabled={loadingList}
 className="h-7 text-[11px]"
 >
 {loadingList? <Loader2 className="h-3 w-3 animate-spin" />: "به‌روزرسانی"}
 </Button>
 </div>

 {workflows.length === 0? (
 <div className="text-center py-8 text-[11px] text-muted-foreground border border-dashed border-border rounded-lg">
 <WorkflowIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
 هنوز گردش کاری ذخیره نشده
 </div>
 ): (
 <div className="space-y-2">
 {workflows.map((w) => (
 <WorkflowCard
 key={w.id}
 workflow={w}
 onToggle={(v) => void toggleActive(w.id, v)}
 onDelete={() => void remove(w.id)}
 />
 ))}
 </div>
 )}
 </div>
 </div>
 </ScrollArea>

 {/* Footer */}
 <div className="border-t border-border px-4 py-2.5 bg-card flex items-center justify-between text-[10px] text-muted-foreground">
 <div className="flex items-center gap-1">
 <Zap className="h-3 w-3 text-primary" />
 ساخته‌شده با هوش مصنوعی
 </div>
 <Button variant="ghost" size="sm" onClick={onClose} className="h-7">
 بستن
 </Button>
 </div>
 </div>
 </motion.div>
 </>
 )}
 </AnimatePresence>
 );
}

// ============ Workflow card ============
function WorkflowCard({
 workflow,
 onToggle,
 onDelete,
}: {
 workflow: SavedWorkflow;
 onToggle: (v: boolean) => void;
 onDelete: () => void;
}) {
 const lastFired = workflow.lastFired
? new Date(workflow.lastFired).toLocaleDateString("fa-IR")
: null;

 return (
 <div className="border border-border rounded-lg p-3 bg-card hover:bg-accent/30 transition-colors">
 <div className="flex items-start justify-between gap-2 mb-2">
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium truncate">{workflow.name}</p>
 <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
 <Badge variant="secondary" className="text-[9px] h-4">
 {TRIGGER_LABELS[workflow.trigger] || workflow.trigger}
 </Badge>
 <span className="text-[9px] text-muted-foreground">
 {workflow.actions.length} اکشن
 {workflow.conditions.length > 0 && ` · ${workflow.conditions.length} شرط`}
 </span>
 </div>
 </div>
 <Switch checked={workflow.isActive} onCheckedChange={onToggle} />
 </div>

 <div className="flex items-center justify-between text-[9px] text-muted-foreground">
 <div className="flex items-center gap-2">
 {lastFired && (
 <span className="flex items-center gap-0.5">
 <Play className="h-2.5 w-2.5" />
 آخرین اجرا: {lastFired}
 </span>
 )}
 {workflow.firedCount > 0 && (
 <span>{toPersianDigits(workflow.firedCount)} بار اجرا</span>
 )}
 {!lastFired && workflow.firedCount === 0 && (
 <span className="flex items-center gap-0.5">
 <AlertCircle className="h-2.5 w-2.5" />
 اجرا نشده
 </span>
 )}
 </div>
 <button
 onClick={onDelete}
 className="text-muted-foreground hover:text-destructive transition-colors"
 aria-label="حذف"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </button>
 </div>
 </div>
 );
}

export default WorkflowBuilder;
