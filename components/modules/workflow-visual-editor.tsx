"use client";

/**
 * WorkflowVisualEditorModule — ویرایشگر بصری اتوماسیون
 *
 * - پنل چپ: انواع گره (Trigger, Condition, Action) — قابل drag به canvas
 * - مرکز: canvas که گره‌ها در آن قرار می‌گیرند و با SVG به هم متصل می‌شوند
 * - راست: پنل خصوصیات گره انتخاب‌شده
 * - گره‌های Trigger: INVOICE_CREATED, CHECK_DUE, LOW_STOCK, PAYMENT_RECEIVED, DAILY
 * - گره‌های Condition: if field [operator] value
 * - گره‌های Action: Send Email, Send SMS, Create Notification, Update Record
 * - دکمه «ذخیره» تبدیل گراف بصری به Workflow JSON و POST به /api/workflows
 * - دکمه «آزمایش» POST به /api/workflows/test
 * - تم indigo
 */

import * as React from "react";
import {
 DndContext,
 PointerSensor,
 useDraggable,
 useDroppable,
 useSensor,
 useSensors,
 type DragEndEvent,
} from "@dnd-kit/core";
import {
 Workflow,
 Zap,
 Mail,
 MessageSquare,
 Bell,
 Database,
 Plus,
 Save,
 Play,
 Trash2,
 Loader2,
 GitBranch,
 Circle,
 Square,
 Diamond,
 X,
 Settings2,
 RefreshCw,
 type LucideIcon,
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";

// ============ Types ============

type NodeKind = "trigger" | "condition" | "action";

interface VisualNode {
 id: string;
 kind: NodeKind;
 type: string; // trigger type / action type / "condition"
 x: number;
 y: number;
 // props for trigger
 trigger?: string;
 // props for condition
 field?: string;
 operator?: string;
 value?: string;
 // props for action
 actionType?: string;
 template?: string;
 recipient?: string;
 message?: string;
 // meta
 title?: string;
}

interface Edge {
 id: string;
 from: string;
 to: string;
}

// ============ Catalog ============

const TRIGGER_OPTIONS = [
 { value: "INVOICE_CREATED", label: "فاکتور جدید", icon: Plus },
 { value: "CHECK_DUE", label: "سررسید چک", icon: Bell },
 { value: "LOW_STOCK", label: "کسری موجودی", icon: Database },
 { value: "PAYMENT_RECEIVED", label: "دریافت پرداخت", icon: Circle },
 { value: "DAILY", label: "اجرای روزانه", icon: RefreshCw },
];

const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(
 TRIGGER_OPTIONS.map((t) => [t.value, t.label])
);

const FIELD_OPTIONS = [
 { value: "daysUntilDue", label: "روز تا سررسید" },
 { value: "daysOverdue", label: "روز گذشته از سررسید" },
 { value: "stockLevel", label: "موجودی" },
 { value: "amount", label: "مبلغ" },
 { value: "partyName", label: "نام طرف حساب" },
 { value: "invoiceNumber", label: "شماره فاکتور" },
];

const OPERATOR_OPTIONS = [
 { value: "equals", label: "مساوی" },
 { value: "not_equals", label: "نامساوی" },
 { value: "gt", label: "بزرگتر" },
 { value: "lt", label: "کوچکتر" },
 { value: "gte", label: "بزرگتر مساوی" },
 { value: "lte", label: "کوچکتر مساوی" },
 { value: "contains", label: "شامل" },
];

const ACTION_TYPES = [
 { value: "email", label: "ارسال ایمیل", icon: Mail },
 { value: "sms", label: "ارسال پیامک", icon: MessageSquare },
 { value: "notification", label: "اعلان درون‌سیستمی", icon: Bell },
 { value: "update_record", label: "به‌روزرسانی رکورد", icon: Database },
];

const ACTION_LABEL: Record<string, string> = Object.fromEntries(
 ACTION_TYPES.map((a) => [a.value, a.label])
);

const TEMPLATE_OPTIONS = [
 "INVOICE_CREATED",
 "PAYMENT_RECEIVED",
 "CHECK_DUE",
 "WELCOME",
 "TRIAL_ENDING",
 "LOW_STOCK",
];

// ============ Node visuals ============

const NODE_SIZE = { w: 200, h: 88 };
const NODE_COLORS: Record<NodeKind, { bg: string; border: string; icon: string }> = {
 trigger: {
 bg: "bg-emerald-50 dark:bg-emerald-950/30",
 border: "border-emerald-300 dark:border-emerald-800",
 icon: "text-emerald-600 dark:text-emerald-400",
 },
 condition: {
 bg: "bg-amber-50 dark:bg-amber-950/30",
 border: "border-amber-300 dark:border-amber-800",
 icon: "text-amber-600 dark:text-amber-400",
 },
 action: {
 bg: "bg-primary/5 dark:bg-primary/10",
 border: "border-primary/40",
 icon: "text-primary",
 },
};

function getNodeIcon(kind: NodeKind, type?: string): LucideIcon {
 if (kind === "trigger") {
 return TRIGGER_OPTIONS.find((t) => t.value === type)?.icon || Circle;
 }
 if (kind === "condition") return GitBranch;
 if (kind === "action") {
 return ACTION_TYPES.find((a) => a.value === type)?.icon || Zap;
 }
 return Circle;
}

function getNodeTitle(node: VisualNode): string {
 if (node.kind === "trigger") {
 return TRIGGER_LABEL[node.trigger || ""] || "تریگر";
 }
 if (node.kind === "condition") {
 const f = FIELD_OPTIONS.find((x) => x.value === node.field)?.label || node.field;
 const op = OPERATOR_OPTIONS.find((x) => x.value === node.operator)?.label || node.operator;
 return `اگر ${f} ${op} ${node.value || "?"}`;
 }
 if (node.kind === "action") {
 return ACTION_LABEL[node.actionType || ""] || "اکشن";
 }
 return "گره";
}

// ============ Draggable palette item ============

function PaletteItem({
 kind,
 type,
 label,
 Icon,
}: {
 kind: NodeKind;
 type: string;
 label: string;
 Icon: LucideIcon;
}) {
 const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
 id: `palette-${kind}-${type}`,
 data: { kind, type },
 });

 const shape = kind === "trigger"? "rounded-full": kind === "condition"? "rotate-45": "rounded-md";

 return (
 <button
 ref={setNodeRef}
 {...listeners}
 {...attributes}
 className={cn(
 "flex items-center gap-2 w-full p-2 text-right text-sm rounded-md border border-border bg-background hover:bg-muted/50 hover:border-primary/40 transition-colors cursor-grab active:cursor-grabbing",
 isDragging && "opacity-50"
 )}
 >
 <div
 className={cn(
 "h-7 w-7 flex items-center justify-center shrink-0",
 shape,
 NODE_COLORS[kind].icon,
 NODE_COLORS[kind].bg,
 "border",
 NODE_COLORS[kind].border
 )}
 >
 <Icon className="h-3.5 w-3.5" />
 </div>
 <span className="truncate">{label}</span>
 </button>
 );
}

// ============ Canvas node ============

function CanvasNode({
 node,
 selected,
 onSelect,
 onStartConnect,
 onCompleteConnect,
 onDelete,
}: {
 node: VisualNode;
 selected: boolean;
 onSelect: () => void;
 onStartConnect: () => void;
 onCompleteConnect: () => void;
 onDelete: () => void;
}) {
 const colors = NODE_COLORS[node.kind];
 const IconComp = getNodeIcon(node.kind, node.type);

 return (
 <div
 className={cn(
 "absolute select-none cursor-pointer transition-shadow",
 selected && "z-10"
 )}
 style={{
 left: node.x,
 top: node.y,
 width: NODE_SIZE.w,
 height: NODE_SIZE.h,
 }}
 onMouseDown={(e) => {
 e.stopPropagation();
 onSelect();
 }}
 >
 <div
 className={cn(
 "w-full h-full flex flex-col justify-between p-3 border-2 rounded-lg shadow-sm bg-card",
 colors.bg,
 selected? colors.border + " ring-2 ring-primary/30": colors.border
 )}
 >
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-1.5 min-w-0">
 {React.createElement(IconComp, {
 className: cn("h-3.5 w-3.5 shrink-0", colors.icon),
 })}
 <span className="text-xs font-medium truncate text-foreground">
 {getNodeTitle(node)}
 </span>
 </div>
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 onDelete();
 }}
 className="opacity-50 hover:opacity-100 hover:text-red-600 transition-opacity"
 aria-label="حذف گره"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 <div className="flex items-center justify-between">
 <Badge variant="outline" className="text-[10px] font-normal">
 {node.kind === "trigger"? "تریگر": node.kind === "condition"? "شرط": "اکشن"}
 </Badge>
 {/* connection handles */}
 {node.kind!== "action" && (
 <button
 type="button"
 onMouseDown={(e) => {
 e.stopPropagation();
 onStartConnect();
 }}
 className="h-3 w-3 rounded-full bg-primary border border-background hover:scale-125 transition-transform"
 aria-label="اتصال از این گره"
 title="برای اتصال، از اینجا شروع و روی گره مقصد رها کنید"
 />
 )}
 {node.kind!== "trigger" && (
 <button
 type="button"
 onMouseUp={(e) => {
 e.stopPropagation();
 onCompleteConnect();
 }}
 className="h-3 w-3 rounded-full bg-muted-foreground/40 border border-background hover:bg-primary transition-colors"
 style={{ marginRight: "auto", marginLeft: "0.25rem" }}
 aria-label="اتصال به این گره"
 />
 )}
 </div>
 </div>
 </div>
 );
}

// ============ Connection (SVG) ============

function ConnectionLine({
 from,
 to,
 onDelete,
}: {
 from: { x: number; y: number };
 to: { x: number; y: number };
 onDelete?: () => void;
}) {
 // منحنی Bezier از وسط پایین گره from به وسط بالای گره to
 const startX = from.x + NODE_SIZE.w / 2;
 const startY = from.y + NODE_SIZE.h;
 const endX = to.x + NODE_SIZE.w / 2;
 const endY = to.y;
 const dx = Math.abs(endX - startX);
 const cp1x = startX;
 const cp1y = startY + Math.max(20, dx / 2);
 const cp2x = endX;
 const cp2y = endY - Math.max(20, dx / 2);
 const path = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

 return (
 <g className="group">
 <path
 d={path}
 fill="none"
 stroke="currentColor"
 strokeWidth={2}
 className="text-primary/60 group-hover:text-primary transition-colors"
 />
 <circle
 cx={startX}
 cy={startY}
 r={3}
 className="fill-primary"
 />
 <circle
 cx={endX}
 cy={endY}
 r={3}
 className="fill-primary"
 />
 {onDelete && (
 <g
 onClick={onDelete}
 className="cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
 >
 <circle
 cx={(startX + endX) / 2}
 cy={(startY + endY) / 2}
 r={10}
 className="fill-red-500"
 />
 <text
 x={(startX + endX) / 2}
 y={(startY + endY) / 2 + 4}
 textAnchor="middle"
 className="fill-white text-[10px]"
 >
 ×
 </text>
 </g>
 )}
 </g>
 );
}

// ============ Main module ============

let nodeCounter = 0;
function makeId(prefix: string): string {
 nodeCounter += 1;
 return `${prefix}-${Date.now()}-${nodeCounter}`;
}

export function WorkflowVisualEditorModule() {
 const { toast } = useToast();
 const [nodes, setNodes] = React.useState<VisualNode[]>([]);
 const [edges, setEdges] = React.useState<Edge[]>([]);
 const [selectedId, setSelectedId] = React.useState<string | null>(null);
 const [connectingFrom, setConnectingFrom] = React.useState<string | null>(null);
 const [canvasRef, setCanvasRef] = React.useState<HTMLDivElement | null>(null);
 const [draggingNode, setDraggingNode] = React.useState<{
 id: string;
 offsetX: number;
 offsetY: number;
 } | null>(null);
 const [workflowName, setWorkflowName] = React.useState("گردش کار جدید");
 const [saving, setSaving] = React.useState(false);
 const [testing, setTesting] = React.useState(false);

 const sensors = useSensors(
 useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
 );

 const selectedNode = nodes.find((n) => n.id === selectedId) || null;

 // ============ Drag from palette ============

 const handleDragEnd = (event: DragEndEvent) => {
 const { active, over, delta } = event;
 if (!over ||!canvasRef) return;

 const data = active.data.current as { kind: NodeKind; type: string } | undefined;
 if (!data) return;

 // مختصات نسبی به canvas
 const rect = canvasRef.getBoundingClientRect();
 const x = (event.activatorEvent as MouseEvent).clientX - rect.left - NODE_SIZE.w / 2;
 const y = (event.activatorEvent as MouseEvent).clientY - rect.top - NODE_SIZE.h / 2;

 const id = makeId("n");
 const newNode: VisualNode = {
 id,
 kind: data.kind,
 type: data.type,
 x: Math.max(0, x),
 y: Math.max(0, y),
...(data.kind === "trigger"
? { trigger: data.type }
: data.kind === "condition"
? { field: "daysUntilDue", operator: "lte", value: "3" }
: { actionType: data.type, template: "", recipient: "", message: "" }),
 };

 setNodes((prev) => [...prev, newNode]);
 setSelectedId(id);
 void delta;
 };

 // ============ Drag canvas node ============

 const handleCanvasMouseDown = (e: React.MouseEvent) => {
 if (!canvasRef) return;
 const target = e.target as HTMLElement;
 // اگر روی background کلیک شد deselect
 if (target === canvasRef || target.classList.contains("canvas-bg")) {
 setSelectedId(null);
 setConnectingFrom(null);
 return;
 }
 // پیدا کردن نزدیک‌ترین ancestor که نقش node دارد
 const nodeEl = target.closest("[data-node-id]") as HTMLElement | null;
 if (!nodeEl) return;
 const id = nodeEl.getAttribute("data-node-id");
 if (!id) return;
 const node = nodes.find((n) => n.id === id);
 if (!node) return;

 const rect = canvasRef.getBoundingClientRect();
 setDraggingNode({
 id,
 offsetX: e.clientX - rect.left - node.x,
 offsetY: e.clientY - rect.top - node.y,
 });
 };

 const handleCanvasMouseMove = (e: React.MouseEvent) => {
 if (!draggingNode ||!canvasRef) return;
 const rect = canvasRef.getBoundingClientRect();
 const x = Math.max(0, e.clientX - rect.left - draggingNode.offsetX);
 const y = Math.max(0, e.clientY - rect.top - draggingNode.offsetY);
 setNodes((prev) =>
 prev.map((n) => (n.id === draggingNode.id? {...n, x, y }: n))
 );
 };

 const handleCanvasMouseUp = () => {
 setDraggingNode(null);
 };

 // ============ Connections ============

 const handleStartConnect = (nodeId: string) => {
 setConnectingFrom(nodeId);
 };

 const handleCompleteConnect = (nodeId: string) => {
 if (!connectingFrom) return;
 if (connectingFrom === nodeId) {
 setConnectingFrom(null);
 return;
 }
 // جلوگیری از اتصال تکراری
 const exists = edges.some(
 (e) => e.from === connectingFrom && e.to === nodeId
 );
 if (!exists) {
 setEdges((prev) => [
...prev,
 { id: makeId("e"), from: connectingFrom, to: nodeId },
 ]);
 }
 setConnectingFrom(null);
 };

 const handleDeleteEdge = (edgeId: string) => {
 setEdges((prev) => prev.filter((e) => e.id!== edgeId));
 };

 const handleDeleteNode = (id: string) => {
 setNodes((prev) => prev.filter((n) => n.id!== id));
 setEdges((prev) => prev.filter((e) => e.from!== id && e.to!== id));
 if (selectedId === id) setSelectedId(null);
 };

 const handleUpdateNode = (id: string, patch: Partial<VisualNode>) => {
 setNodes((prev) =>
 prev.map((n) => (n.id === id? {...n,...patch }: n))
 );
 };

 // ============ Save / Test ============

 const buildWorkflowPayload = () => {
 // گره تریگر را پیدا کن (اولین trigger node)
 const triggerNode = nodes.find((n) => n.kind === "trigger");
 const conditionNodes = nodes.filter((n) => n.kind === "condition");
 const actionNodes = nodes.filter((n) => n.kind === "action");

 // در حالت ساده: همه conditions و actions را به workflow وصل می‌کنیم
 const conditions = conditionNodes.map((n) => ({
 field: n.field,
 operator: n.operator,
 value: isNaN(Number(n.value))? n.value: Number(n.value),
 }));

 const actions = actionNodes.map((n) => ({
 type: n.actionType,
 template: n.template || undefined,
 recipient: n.recipient || undefined,
 message: n.message || undefined,
 }));

 return {
 name: workflowName,
 trigger: triggerNode?.trigger || "DAILY",
 conditions,
 actions,
 };
 };

 const handleSave = async () => {
 if (nodes.length === 0) {
 toast({
 title: "گردش کار خالی",
 description: "حداقل یک گره اضافه کنید",
 variant: "destructive",
 });
 return;
 }
 setSaving(true);
 try {
 const payload = buildWorkflowPayload();
 const res = await authFetch("/api/workflows", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: "ذخیره شد",
 description: `${toPersianDigits(nodes.length)} گره و ${toPersianDigits(
 edges.length
 )} اتصال در گردش کار ثبت شد`,
 });
 } else {
 toast({
 title: "خطا در ذخیره",
 description: json.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } finally {
 setSaving(false);
 }
 };

 const handleTest = async () => {
 if (nodes.length === 0) return;
 setTesting(true);
 try {
 const payload = buildWorkflowPayload();
 const res = await authFetch("/api/workflows/test", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 trigger: payload.trigger,
 conditions: payload.conditions,
 actions: payload.actions,
 context: {
 daysUntilDue: 2,
 daysOverdue: 0,
 stockLevel: 3,
 amount: 1500000,
 partyName: "مشتری نمونه",
 invoiceNumber: "۱۴۰۳-۱۰۲۴",
 partyMobile: "09123456789",
 customerEmail: "customer@example.com",
 },
 }),
 });
 const json = await res.json();
 if (json.success) {
 toast({
 title: json.data?.shouldFire? "گردش کار فعال شد": "گردش کار فعال نشد",
 description: json.data?.message || "نتیجه آزمایش دریافت شد",
 variant: json.data?.shouldFire? "default": "destructive",
 });
 } else {
 toast({
 title: "خطا در آزمایش",
 description: json.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } finally {
 setTesting(false);
 }
 };

 const handleClear = () => {
 setNodes([]);
 setEdges([]);
 setSelectedId(null);
 setConnectingFrom(null);
 };

 const handleAddSample = () => {
 // نمونه سریع: trigger + condition + action
 const t: VisualNode = {
 id: makeId("n"),
 kind: "trigger",
 type: "CHECK_DUE",
 x: 80,
 y: 80,
 trigger: "CHECK_DUE",
 };
 const c: VisualNode = {
 id: makeId("n"),
 kind: "condition",
 type: "condition",
 x: 360,
 y: 80,
 field: "daysUntilDue",
 operator: "lte",
 value: "3",
 };
 const a: VisualNode = {
 id: makeId("n"),
 kind: "action",
 type: "sms",
 x: 640,
 y: 80,
 actionType: "sms",
 template: "CHECK_DUE",
 recipient: "{{partyMobile}}",
 message: "",
 };
 setNodes([t, c, a]);
 setEdges([
 { id: makeId("e"), from: t.id, to: c.id },
 { id: makeId("e"), from: c.id, to: a.id },
 ]);
 setWorkflowName("هشدار سررسید چک - نمونه");
 };

 return (
 <div className="space-y-4 animate-fade-in-up">
 {/* هدر */}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
 <Workflow className="h-5 w-5 text-primary" />
 ویرایشگر بصری اتوماسیون
 </h2>
 <p className="text-sm text-muted-foreground">
 با drag-and-drop گره‌ها را روی canvas قرار دهید و با SVG متصل کنید
 </p>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Input
 value={workflowName}
 onChange={(e) => setWorkflowName(e.target.value)}
 placeholder="نام گردش کار"
 className="w-48"
 />
 <Button variant="outline" size="sm" onClick={handleAddSample}>
 <Plus className="h-4 w-4 ml-1" />
 نمونه
 </Button>
 <Button variant="outline" size="sm" onClick={handleClear} disabled={nodes.length === 0}>
 <Trash2 className="h-4 w-4 ml-1" />
 پاک‌سازی
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={handleTest}
 disabled={testing || nodes.length === 0}
 >
 {testing? (
 <Loader2 className="h-4 w-4 ml-1 animate-spin" />
 ): (
 <Play className="h-4 w-4 ml-1" />
 )}
 آزمایش
 </Button>
 <Button size="sm" onClick={handleSave} disabled={saving || nodes.length === 0}>
 {saving? (
 <Loader2 className="h-4 w-4 ml-1 animate-spin" />
 ): (
 <Save className="h-4 w-4 ml-1" />
 )}
 ذخیره
 </Button>
 </div>
 </div>

 {/* آمار گره‌ها */}
 <div className="flex flex-wrap gap-2">
 <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
 <Circle className="h-3 w-3" />
 {toPersianDigits(nodes.filter((n) => n.kind === "trigger").length)} تریگر
 </Badge>
 <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
 <GitBranch className="h-3 w-3" />
 {toPersianDigits(nodes.filter((n) => n.kind === "condition").length)} شرط
 </Badge>
 <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
 <Zap className="h-3 w-3" />
 {toPersianDigits(nodes.filter((n) => n.kind === "action").length)} اکشن
 </Badge>
 <Badge variant="outline" className="gap-1">
 {toPersianDigits(edges.length)} اتصال
 </Badge>
 {connectingFrom && (
 <Badge className="bg-primary animate-pulse">
 در حال اتصال... روی گره مقصد کلیک کنید
 </Badge>
 )}
 </div>

 <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
 <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_240px] gap-3">
 {/* پنل چپ: pallet */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm">انواع گره</CardTitle>
 <CardDescription className="text-xs">
 به canvas بکشید
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div>
 <Label className="text-xs text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
 <Circle className="h-3 w-3" /> تریگرها
 </Label>
 <div className="space-y-1.5">
 {TRIGGER_OPTIONS.map((t) => (
 <PaletteItem
 key={t.value}
 kind="trigger"
 type={t.value}
 label={t.label}
 Icon={t.icon}
 />
 ))}
 </div>
 </div>
 <div>
 <Label className="text-xs text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1">
 <Diamond className="h-3 w-3" /> شرط
 </Label>
 <div className="space-y-1.5">
 <PaletteItem
 kind="condition"
 type="condition"
 label="شرط منطقی"
 Icon={GitBranch}
 />
 </div>
 </div>
 <div>
 <Label className="text-xs text-primary mb-1.5 flex items-center gap-1">
 <Square className="h-3 w-3" /> اکشن‌ها
 </Label>
 <div className="space-y-1.5">
 {ACTION_TYPES.map((a) => (
 <PaletteItem
 key={a.value}
 kind="action"
 type={a.value}
 label={a.label}
 Icon={a.icon}
 />
 ))}
 </div>
 </div>
 </CardContent>
 </Card>

 {/* canvas مرکزی */}
 <Card className="overflow-hidden">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Workflow className="h-4 w-4 text-primary" />
 Canvas
 </CardTitle>
 </CardHeader>
 <CardContent className="p-0">
 <DroppableCanvas
 canvasRef={canvasRef}
 setCanvasRef={setCanvasRef}
 nodes={nodes}
 edges={edges}
 selectedId={selectedId}
 connectingFrom={connectingFrom}
 onMouseDown={handleCanvasMouseDown}
 onMouseMove={handleCanvasMouseMove}
 onMouseUp={handleCanvasMouseUp}
 onSelectNode={(id) => setSelectedId(id)}
 onStartConnect={handleStartConnect}
 onCompleteConnect={handleCompleteConnect}
 onDeleteNode={handleDeleteNode}
 onDeleteEdge={handleDeleteEdge}
 />
 </CardContent>
 </Card>

 {/* پنل راست: خصوصیات */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Settings2 className="h-4 w-4 text-primary" />
 خصوصیات گره
 </CardTitle>
 <CardDescription className="text-xs">
 {selectedNode? "ویرایش گره انتخاب‌شده": "گره‌ای انتخاب نشده"}
 </CardDescription>
 </CardHeader>
 <CardContent>
 {selectedNode? (
 <PropertiesPanel
 node={selectedNode}
 onUpdate={(patch) => handleUpdateNode(selectedNode.id, patch)}
 onDelete={() => handleDeleteNode(selectedNode.id)}
 />
 ): (
 <div className="text-center text-xs text-muted-foreground py-8">
 یک گره روی canvas انتخاب کنید
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 </DndContext>
 </div>
 );
}

// ============ Canvas (droppable) ============

function DroppableCanvas({
 canvasRef,
 setCanvasRef,
 nodes,
 edges,
 selectedId,
 connectingFrom,
 onMouseDown,
 onMouseMove,
 onMouseUp,
 onSelectNode,
 onStartConnect,
 onCompleteConnect,
 onDeleteNode,
 onDeleteEdge,
}: {
 canvasRef: HTMLDivElement | null;
 setCanvasRef: (el: HTMLDivElement | null) => void;
 nodes: VisualNode[];
 edges: Edge[];
 selectedId: string | null;
 connectingFrom: string | null;
 onMouseDown: (e: React.MouseEvent) => void;
 onMouseMove: (e: React.MouseEvent) => void;
 onMouseUp: () => void;
 onSelectNode: (id: string) => void;
 onStartConnect: (id: string) => void;
 onCompleteConnect: (id: string) => void;
 onDeleteNode: (id: string) => void;
 onDeleteEdge: (edgeId: string) => void;
}) {
 const { setNodeRef, isOver } = useDroppable({ id: "workflow-canvas" });

 const handleRef = (el: HTMLDivElement | null) => {
 setNodeRef(el);
 setCanvasRef(el);
 };

 // viewBox برای SVG که کل canvas را پوشش دهد
 const canvasWidth = 1400;
 const canvasHeight = 600;

 return (
 <div
 ref={handleRef}
 onMouseDown={onMouseDown}
 onMouseMove={onMouseMove}
 onMouseUp={onMouseUp}
 onMouseLeave={onMouseUp}
 className={cn(
 "relative canvas-bg overflow-auto",
 isOver && "ring-2 ring-primary/40 ring-inset"
 )}
 style={{ height: "60vh", minWidth: "100%" }}
 >
 <div
 className="relative canvas-bg"
 style={{
 width: canvasWidth,
 height: canvasHeight,
 backgroundImage:
 "radial-gradient(circle, rgba(99,102,241,0.12) 1px, transparent 1px)",
 backgroundSize: "20px 20px",
 }}
 >
 {/* SVG لایه اتصال‌ها */}
 <svg
 className="absolute inset-0 pointer-events-none"
 width={canvasWidth}
 height={canvasHeight}
 style={{ pointerEvents: "auto" }}
 >
 {edges.map((edge) => {
 const from = nodes.find((n) => n.id === edge.from);
 const to = nodes.find((n) => n.id === edge.to);
 if (!from ||!to) return null;
 return (
 <ConnectionLine
 key={edge.id}
 from={{ x: from.x, y: from.y }}
 to={{ x: to.x, y: to.y }}
 onDelete={() => onDeleteEdge(edge.id)}
 />
 );
 })}
 </svg>

 {/* لایه گره‌ها */}
 {nodes.map((node) => (
 <div
 key={node.id}
 data-node-id={node.id}
 className={cn(
 "absolute",
 connectingFrom === node.id && "ring-2 ring-primary rounded-lg"
 )}
 >
 <CanvasNode
 node={node}
 selected={selectedId === node.id}
 onSelect={() => onSelectNode(node.id)}
 onStartConnect={() => onStartConnect(node.id)}
 onCompleteConnect={() => onCompleteConnect(node.id)}
 onDelete={() => onDeleteNode(node.id)}
 />
 </div>
 ))}

 {/* empty state */}
 {nodes.length === 0 && (
 <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
 <div className="text-center">
 <Workflow className="h-10 w-10 mx-auto mb-2 opacity-40" />
 <p className="text-sm">
 گره‌ها را از پنل چپ به اینجا بکشید
 </p>
 <p className="text-xs mt-1">
 یا روی «نمونه» کلیک کنید
 </p>
 </div>
 </div>
 )}
 </div>
 </div>
 );
}

// ============ Properties Panel ============

function PropertiesPanel({
 node,
 onUpdate,
 onDelete,
}: {
 node: VisualNode;
 onUpdate: (patch: Partial<VisualNode>) => void;
 onDelete: () => void;
}) {
 return (
 <div className="space-y-3">
 {/* Trigger */}
 {node.kind === "trigger" && (
 <>
 <div>
 <Label className="text-xs">نوع تریگر</Label>
 <Select
 value={node.trigger}
 onValueChange={(v) => onUpdate({ trigger: v, type: v })}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {TRIGGER_OPTIONS.map((t) => (
 <SelectItem key={t.value} value={t.value}>
 {t.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </>
 )}

 {/* Condition */}
 {node.kind === "condition" && (
 <>
 <div>
 <Label className="text-xs">فیلد</Label>
 <Select
 value={node.field}
 onValueChange={(v) => onUpdate({ field: v })}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {FIELD_OPTIONS.map((f) => (
 <SelectItem key={f.value} value={f.value}>
 {f.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label className="text-xs">عملگر</Label>
 <Select
 value={node.operator}
 onValueChange={(v) => onUpdate({ operator: v })}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {OPERATOR_OPTIONS.map((o) => (
 <SelectItem key={o.value} value={o.value}>
 {o.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label className="text-xs">مقدار</Label>
 <Input
 value={node.value || ""}
 onChange={(e) => onUpdate({ value: e.target.value })}
 placeholder="مثلاً ۳"
 />
 </div>
 </>
 )}

 {/* Action */}
 {node.kind === "action" && (
 <>
 <div>
 <Label className="text-xs">نوع اکشن</Label>
 <Select
 value={node.actionType}
 onValueChange={(v) => onUpdate({ actionType: v, type: v })}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {ACTION_TYPES.map((a) => (
 <SelectItem key={a.value} value={a.value}>
 {a.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 {(node.actionType === "email" || node.actionType === "sms") && (
 <>
 <div>
 <Label className="text-xs">قالب</Label>
 <Select
 value={node.template || ""}
 onValueChange={(v) => onUpdate({ template: v })}
 >
 <SelectTrigger>
 <SelectValue placeholder="انتخاب قالب" />
 </SelectTrigger>
 <SelectContent>
 {TEMPLATE_OPTIONS.map((t) => (
 <SelectItem key={t} value={t}>
 {t}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label className="text-xs">گیرنده (متغیر یا مقدار)</Label>
 <Input
 dir="ltr"
 value={node.recipient || ""}
 onChange={(e) => onUpdate({ recipient: e.target.value })}
 placeholder="{{customerEmail}}"
 className="font-mono text-xs"
 />
 </div>
 </>
 )}
 {(node.actionType === "notification" || node.actionType === "update_record") && (
 <div>
 <Label className="text-xs">پیام / توضیح</Label>
 <Input
 value={node.message || ""}
 onChange={(e) => onUpdate({ message: e.target.value })}
 placeholder="متن پیام"
 />
 </div>
 )}
 </>
 )}

 <div className="pt-2 border-t border-border">
 <Button
 variant="outline"
 size="sm"
 className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
 onClick={onDelete}
 >
 <Trash2 className="h-3.5 w-3.5 ml-1" />
 حذف گره
 </Button>
 </div>
 </div>
 );
}
