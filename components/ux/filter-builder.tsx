"use client";

import * as React from "react";
import {
 Filter,
 Plus,
 Trash2,
 ChevronDown,
 ChevronRight,
 Layers,
 Check,
 X,
 Braces,
} from "lucide-react";
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
 Collapsible,
 CollapsibleContent,
 CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

// ============ تایپ‌های فیلتر ============

export type FilterOperator =
 | "equals"
 | "not_equals"
 | "contains"
 | "starts_with"
 | "greater_than"
 | "less_than"
 | "between"
 | "in";

export interface FilterRule {
 id: string;
 field: string;
 operator: FilterOperator;
 value: string;
 value2?: string; // برای between
}

export interface FilterGroup {
 id: string;
 type: "AND" | "OR";
 rules: FilterRule[];
 groups: FilterGroup[];
}

export interface FilterField {
 name: string;
 label: string;
 type: "string" | "number" | "date" | "select";
 options?: { value: string; label: string }[];
}

interface FilterBuilderProps {
 /** فیلدهای قابل انتخاب — به نوع موجودیت بستگی دارد */
 fields: FilterField[];
 /** صدا زده می‌شود هنگام اعمال فیلتر */
 onChange?: (filters: FilterGroup) => void;
 /** گروه اولیه */
 initialGroup?: FilterGroup;
 /** عنوان بخش */
 title?: string;
 className?: string;
}

// ============ ثابت‌ها ============

const OPERATORS: { value: FilterOperator; label: string; needsValue2?: boolean }[] = [
 { value: "equals", label: "برابر" },
 { value: "not_equals", label: "مخالف" },
 { value: "contains", label: "شامل" },
 { value: "starts_with", label: "شروع با" },
 { value: "greater_than", label: "بزرگتر از" },
 { value: "less_than", label: "کوچکتر از" },
 { value: "between", label: "بین", needsValue2: true },
 { value: "in", label: "در لیست" },
];

const OPERATOR_LABEL: Record<FilterOperator, string> = {
 equals: "برابر",
 not_equals: "مخالف",
 contains: "شامل",
 starts_with: "شروع با",
 greater_than: "بزرگتر از",
 less_than: "کوچکتر از",
 between: "بین",
 in: "در لیست",
};

function genId(): string {
 return `f_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function createRule(field?: string): FilterRule {
 return {
 id: genId(),
 field: field || "",
 operator: "equals",
 value: "",
 value2: "",
 };
}

function createGroup(): FilterGroup {
 return {
 id: genId(),
 type: "AND",
 rules: [createRule()],
 groups: [],
 };
}

// ============ کامپوننت اصلی ============

export function FilterBuilder({
 fields,
 onChange,
 initialGroup,
 title = "سازنده فیلتر",
 className,
}: FilterBuilderProps) {
 const [rootGroup, setRootGroup] = React.useState<FilterGroup>(
 initialGroup || createGroup()
 );
 const [open, setOpen] = React.useState(true);
 const [showJson, setShowJson] = React.useState(false);

 // --- helpers ---
 const updateGroup = React.useCallback(
 (groupId: string, updater: (g: FilterGroup) => FilterGroup): FilterGroup => {
 const recurse = (g: FilterGroup): FilterGroup => {
 if (g.id === groupId) return updater(g);
 return {
...g,
 groups: g.groups.map(recurse),
 };
 };
 return recurse(rootGroup);
 },
 [rootGroup]
 );

 const addRule = (groupId: string) => {
 const next = updateGroup(groupId, (g) => ({
...g,
 rules: [...g.rules, createRule()],
 }));
 setRootGroup(next);
 };

 const addGroup = (groupId: string) => {
 const next = updateGroup(groupId, (g) => ({
...g,
 groups: [...g.groups, createGroup()],
 }));
 setRootGroup(next);
 };

 const removeRule = (groupId: string, ruleId: string) => {
 const next = updateGroup(groupId, (g) => ({
...g,
 rules: g.rules.filter((r) => r.id!== ruleId),
 }));
 setRootGroup(next);
 };

 const removeGroup = (groupId: string) => {
 if (groupId === rootGroup.id) {
 // ریشه را نمی‌توان حذف کرد — فقط reset
 setRootGroup(createGroup());
 return;
 }
 const removeRecursive = (g: FilterGroup): FilterGroup => ({
...g,
 groups: g.groups
.filter((sub) => sub.id!== groupId)
.map(removeRecursive),
 });
 setRootGroup(removeRecursive(rootGroup));
 };

 const updateRule = (
 groupId: string,
 ruleId: string,
 patch: Partial<FilterRule>
 ) => {
 const next = updateGroup(groupId, (g) => ({
...g,
 rules: g.rules.map((r) => (r.id === ruleId? {...r,...patch }: r)),
 }));
 setRootGroup(next);
 };

 const toggleGroupType = (groupId: string) => {
 const next = updateGroup(groupId, (g) => ({
...g,
 type: g.type === "AND"? "OR": "AND",
 }));
 setRootGroup(next);
 };

 // --- شمارش قوانین فعال ---
 const stats = React.useMemo(() => {
 let ruleCount = 0;
 let groupCount = 0;
 const walk = (g: FilterGroup) => {
 groupCount++;
 ruleCount += g.rules.filter((r) => r.field && r.value).length;
 g.groups.forEach(walk);
 };
 walk(rootGroup);
 return { ruleCount, groupCount: Math.max(0, groupCount - 1) };
 }, [rootGroup]);

 const handleApply = () => {
 onChange?.(rootGroup);
 };

 const handleReset = () => {
 const fresh = createGroup();
 setRootGroup(fresh);
 onChange?.(fresh);
 };

 return (
 <Card className={cn("border-border p-0 overflow-hidden", className)}>
 {/* هدر */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
 <div className="flex items-center gap-2">
 <Filter className="h-4 w-4 text-primary" />
 <span className="text-sm font-medium text-foreground">{title}</span>
 <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] h-5">
 {toPersianDigits(String(stats.ruleCount))} شرط
 </Badge>
 {stats.groupCount > 0 && (
 <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
 <Layers className="h-2.5 w-2.5" />
 {toPersianDigits(String(stats.groupCount))} گروه
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
 onClick={() => setShowJson((s) =>!s)}
 >
 <Braces className="h-3 w-3" />
 JSON
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
 onClick={handleReset}
 >
 <X className="h-3 w-3" />
 پاک
 </Button>
 <CollapsibleTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => setOpen((o) =>!o)}
 >
 {open? (
 <ChevronDown className="h-3.5 w-3.5" />
 ): (
 <ChevronRight className="h-3.5 w-3.5" />
 )}
 </Button>
 </CollapsibleTrigger>
 </div>
 </div>

 {/* نمایش JSON */}
 {showJson && (
 <div className="px-4 py-2 border-b border-border bg-muted/20">
 <pre
 dir="ltr"
 className="text-[10px] text-muted-foreground overflow-x-auto font-mono"
 >
 {JSON.stringify(rootGroup, null, 2)}
 </pre>
 </div>
 )}

 <Collapsible open={open} onOpenChange={setOpen}>
 <CollapsibleContent>
 <div className="p-4 space-y-3">
 {/* گروه ریشه */}
 <GroupRenderer
 group={rootGroup}
 isRoot
 fields={fields}
 onAddRule={() => addRule(rootGroup.id)}
 onAddGroup={() => addGroup(rootGroup.id)}
 onRemoveGroup={() => removeGroup(rootGroup.id)}
 onToggleType={() => toggleGroupType(rootGroup.id)}
 onRemoveRule={(rid) => removeRule(rootGroup.id, rid)}
 onUpdateRule={(rid, patch) => updateRule(rootGroup.id, rid, patch)}
 onAddRuleToGroup={(gid) => addRule(gid)}
 onAddGroupToGroup={(gid) => addGroup(gid)}
 onRemoveSubGroup={(gid) => removeGroup(gid)}
 onToggleSubGroupType={(gid) => toggleGroupType(gid)}
 onRemoveSubRule={(gid, rid) => removeRule(gid, rid)}
 onUpdateSubRule={(gid, rid, patch) => updateRule(gid, rid, patch)}
 depth={0}
 />

 {/* دکمه اعمال */}
 <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
 <Button
 size="sm"
 className="gap-1.5"
 onClick={handleApply}
 disabled={stats.ruleCount === 0}
 >
 <Check className="h-3.5 w-3.5" />
 اعمال فیلتر
 </Button>
 </div>
 </div>
 </CollapsibleContent>
 </Collapsible>
 </Card>
 );
}

// ============ Group Renderer ============

interface GroupRendererProps {
 group: FilterGroup;
 isRoot?: boolean;
 fields: FilterField[];
 depth: number;
 onAddRule: () => void;
 onAddGroup: () => void;
 onRemoveGroup: () => void;
 onToggleType: () => void;
 onRemoveRule: (ruleId: string) => void;
 onUpdateRule: (ruleId: string, patch: Partial<FilterRule>) => void;
 // برای گروه‌های تو در تو
 onAddRuleToGroup: (groupId: string) => void;
 onAddGroupToGroup: (groupId: string) => void;
 onRemoveSubGroup: (groupId: string) => void;
 onToggleSubGroupType: (groupId: string) => void;
 onRemoveSubRule: (groupId: string, ruleId: string) => void;
 onUpdateSubRule: (groupId: string, ruleId: string, patch: Partial<FilterRule>) => void;
}

function GroupRenderer(props: GroupRendererProps) {
 const {
 group,
 isRoot,
 fields,
 depth,
 onAddRule,
 onAddGroup,
 onRemoveGroup,
 onToggleType,
 onRemoveRule,
 onUpdateRule,
 onAddRuleToGroup,
 onAddGroupToGroup,
 onRemoveSubGroup,
 onToggleSubGroupType,
 onRemoveSubRule,
 onUpdateSubRule,
 } = props;

 return (
 <div
 className={cn(
 "rounded-lg border bg-card",
 isRoot
? "border-primary/30 bg-primary/5 p-3"
: "border-border bg-muted/20 p-2.5 ms-3",
 depth > 0 && "border-dashed"
 )}
 >
 {/* هدر گروه */}
 <div className="flex items-center gap-2 mb-2.5">
 <button
 type="button"
 onClick={onToggleType}
 className={cn(
 "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors",
 group.type === "AND"
? "bg-primary text-primary-foreground hover:bg-primary/90"
: "bg-warning text-warning-foreground hover:bg-warning/90"
 )}
 title="کلیک برای تغییر AND/OR"
 >
 {group.type === "AND"? "و": "یا"}
 </button>
 {!isRoot && (
 <span className="text-[10px] text-muted-foreground">
 گروه تو در تو
 </span>
 )}
 <div className="ms-auto flex items-center gap-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-6 px-1.5 text-[10px] gap-1"
 onClick={onAddRule}
 >
 <Plus className="h-3 w-3" />
 افزودن شرط
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-6 px-1.5 text-[10px] gap-1"
 onClick={onAddGroup}
 >
 <Layers className="h-3 w-3" />
 افزودن گروه
 </Button>
 {!isRoot && (
 <Button
 variant="ghost"
 size="icon"
 className="h-6 w-6 text-muted-foreground hover:text-destructive"
 onClick={onRemoveGroup}
 >
 <Trash2 className="h-3 w-3" />
 </Button>
 )}
 </div>
 </div>

 {/* قوانین */}
 <div className="space-y-1.5">
 {group.rules.length === 0 && group.groups.length === 0 && (
 <p className="text-[11px] text-muted-foreground text-center py-3">
 هنوز شرطی اضافه نشده — «افزودن شرط» را بزنید
 </p>
 )}

 {group.rules.map((rule) => (
 <RuleRow
 key={rule.id}
 rule={rule}
 fields={fields}
 onRemove={() => onRemoveRule(rule.id)}
 onUpdate={(patch) => onUpdateRule(rule.id, patch)}
 />
 ))}

 {/* گروه‌های فرعی */}
 {group.groups.map((sub) => (
 <GroupRenderer
 key={sub.id}
 group={sub}
 fields={fields}
 depth={depth + 1}
 onAddRule={() => onAddRuleToGroup(sub.id)}
 onAddGroup={() => onAddGroupToGroup(sub.id)}
 onRemoveGroup={() => onRemoveSubGroup(sub.id)}
 onToggleType={() => onToggleSubGroupType(sub.id)}
 onRemoveRule={(rid) => onRemoveSubRule(sub.id, rid)}
 onUpdateRule={(rid, patch) => onUpdateSubRule(sub.id, rid, patch)}
 onAddRuleToGroup={onAddRuleToGroup}
 onAddGroupToGroup={onAddGroupToGroup}
 onRemoveSubGroup={onRemoveSubGroup}
 onToggleSubGroupType={onToggleSubGroupType}
 onRemoveSubRule={onRemoveSubRule}
 onUpdateSubRule={onUpdateSubRule}
 />
 ))}
 </div>
 </div>
 );
}

// ============ Rule Row ============

interface RuleRowProps {
 rule: FilterRule;
 fields: FilterField[];
 onRemove: () => void;
 onUpdate: (patch: Partial<FilterRule>) => void;
}

function RuleRow({ rule, fields, onRemove, onUpdate }: RuleRowProps) {
 const selectedField = fields.find((f) => f.name === rule.field);

 return (
 <div className="flex items-center gap-1.5 rounded-md border border-border bg-background p-1.5">
 {/* انتخاب فیلد */}
 <Select
 value={rule.field}
 onValueChange={(v) => onUpdate({ field: v, value: "" })}
 >
 <SelectTrigger className="h-7 w-32 text-[11px] shrink-0">
 <SelectValue placeholder="فیلد" />
 </SelectTrigger>
 <SelectContent>
 {fields.map((f) => (
 <SelectItem key={f.name} value={f.name} className="text-xs">
 {f.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>

 {/* انتخاب عملگر */}
 <Select
 value={rule.operator}
 onValueChange={(v) =>
 onUpdate({ operator: v as FilterOperator, value2: "" })
 }
 disabled={!rule.field}
 >
 <SelectTrigger className="h-7 w-28 text-[11px] shrink-0">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {OPERATORS.map((op) => (
 <SelectItem key={op.value} value={op.value} className="text-xs">
 {op.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>

 {/* مقدار */}
 {selectedField?.type === "select" && selectedField.options? (
 <Select
 value={rule.value}
 onValueChange={(v) => onUpdate({ value: v })}
 disabled={!rule.field}
 >
 <SelectTrigger className="h-7 flex-1 text-[11px] min-w-0">
 <SelectValue placeholder="مقدار" />
 </SelectTrigger>
 <SelectContent>
 {selectedField.options.map((o) => (
 <SelectItem key={o.value} value={o.value} className="text-xs">
 {o.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 ): (
 <Input
 type={
 selectedField?.type === "number"
? "number"
: selectedField?.type === "date"
? "date"
: "text"
 }
 value={rule.value}
 onChange={(e) => onUpdate({ value: e.target.value })}
 placeholder="مقدار"
 disabled={!rule.field}
 className="h-7 flex-1 text-[11px] min-w-0"
 />
 )}

 {/* مقدار دوم برای between */}
 {rule.operator === "between" && (
 <Input
 type={
 selectedField?.type === "number"
? "number"
: selectedField?.type === "date"
? "date"
: "text"
 }
 value={rule.value2 || ""}
 onChange={(e) => onUpdate({ value2: e.target.value })}
 placeholder="مقدار دوم"
 disabled={!rule.field}
 className="h-7 w-28 text-[11px] shrink-0"
 />
 )}

 {/* حذف شرط */}
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
 onClick={onRemove}
 >
 <Trash2 className="h-3 w-3" />
 </Button>
 </div>
 );
}

// ============ پیش‌تنظیم فیلدها ============

export const INVOICE_FIELDS: FilterField[] = [
 { name: "number", label: "شماره فاکتور", type: "string" },
 { name: "date", label: "تاریخ", type: "date" },
 { name: "dueDate", label: "سررسید", type: "date" },
 { name: "total", label: "مبلغ کل", type: "number" },
 { name: "status", label: "وضعیت", type: "select", options: [
 { value: "DRAFT", label: "پیش‌نویس" },
 { value: "SENT", label: "ارسال شده" },
 { value: "PAID", label: "تسویه شده" },
 { value: "PARTIAL", label: "تسویه جزئی" },
 { value: "OVERDUE", label: "سررسید گذشته" },
 ] },
 { name: "type", label: "نوع", type: "select", options: [
 { value: "SALE", label: "فروش" },
 { value: "PURCHASE", label: "خرید" },
 ] },
 { name: "partyName", label: "نام طرف‌حساب", type: "string" },
];

export const PRODUCT_FIELDS: FilterField[] = [
 { name: "name", label: "نام کالا", type: "string" },
 { name: "code", label: "کد", type: "string" },
 { name: "price", label: "قیمت", type: "number" },
 { name: "stock", label: "موجودی", type: "number" },
 { name: "category", label: "دسته", type: "string" },
];

export const PARTY_FIELDS: FilterField[] = [
 { name: "name", label: "نام", type: "string" },
 { name: "type", label: "نوع", type: "select", options: [
 { value: "CUSTOMER", label: "مشتری" },
 { value: "SUPPLIER", label: "تأمین‌کننده" },
 { value: "BOTH", label: "هر دو" },
 ] },
 { name: "phone", label: "تلفن", type: "string" },
 { name: "email", label: "ایمیل", type: "string" },
 { name: "totalBalance", label: "مانده کل", type: "number" },
];

export default FilterBuilder;
