"use client";

import * as React from "react";
import {
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  Plus,
  Layers,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSiteEditor } from "@/components/site-editor/site-editor-context";
import {
  SECTION_META,
  CUSTOM_SECTION_TYPES,
  getCustomSectionTitle,
} from "@/components/site-editor/section-registry";
import type { CustomSectionType, SiteCustomSection } from "@/lib/site-content";

/**
 * sections-manager-dialog — مدیریت همه‌ی سکشن‌های صفحه فرود
 * لیست کامل (ترتیب فعلی) + جابه‌جایی + نمایش/مخفی + ویرایش + افزودن
 * سکشن سفارشی (HTML / شورت‌کد / متن / تصویر+متن / CTA) با انتخاب جایگاه.
 */

function generateCustomId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cs_${Date.now().toString(36)}${rand}`.toLowerCase();
}

export function SectionsManagerDialog() {
  const {
    content,
    managerOpen,
    setManagerOpen,
    selectedSection,
    selectSection,
    toggleHidden,
    moveSection,
    removeCustom,
    addCustom,
    saving,
  } = useSiteEditor();

  // توالی فعلی برای نمایش
  const sequence = React.useMemo(() => {
    // بازتولید توالی از context (همان منطق computeSectionSequence)
    const order = content.order.filter((id) => !id.startsWith("cs_"));
    const pos = new Map(order.map((id, i) => [id, i]));
    const defaultOrder = SECTION_META.map((s) => s.id);
    const builtins = defaultOrder
      .slice()
      .sort((a, b) => {
        const pa = pos.has(a) ? pos.get(a)! : 1_000 + defaultOrder.indexOf(a);
        const pb = pos.has(b) ? pos.get(b)! : 1_000 + defaultOrder.indexOf(b);
        return pa - pb;
      });
    const seq: Array<{ id: string; custom?: SiteCustomSection }> = builtins.map(
      (id) => ({ id })
    );
    const atEnd: SiteCustomSection[] = [];
    for (const c of content.custom) {
      if (c.after && builtins.includes(c.after)) {
        const idx = seq.findIndex((s) => s.id === c.after);
        if (idx >= 0) {
          seq.splice(idx + 1, 0, { id: c.id, custom: c });
          continue;
        }
      }
      atEnd.push(c);
    }
    for (const c of atEnd) seq.push({ id: c.id, custom: c });
    return seq;
  }, [content]);

  // ---- افزودن سکشن سفارشی ----
  const [addOpen, setAddOpen] = React.useState(false);
  const [addType, setAddType] = React.useState<CustomSectionType>("richtext");
  const [addAfter, setAddAfter] = React.useState<string>("__end__");
  const [addProps, setAddProps] = React.useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);

  const typeMeta = CUSTOM_SECTION_TYPES.find((t) => t.type === addType);

  const openAdd = (type: CustomSectionType) => {
    setAddType(type);
    setAddProps({});
    setAddAfter("__end__");
    setAddOpen(true);
  };

  const submitAdd = () => {
    const section: SiteCustomSection = {
      id: generateCustomId(),
      type: addType,
      after: addAfter === "__end__" ? undefined : addAfter,
      props: addProps,
    };
    addCustom(section);
    setAddOpen(false);
    // باز کردن شیت ویرایش همین سکشن جدید
    selectSection(section.id);
  };

  return (
    <>
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent dir="rtl" className="sm:max-w-2xl p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-primary" />
              مدیریت بخش‌های صفحه
            </DialogTitle>
            <DialogDescription className="text-xs">
              ترتیب، نمایش و محتوای همه‌ی بخش‌ها — تغییرات با «ذخیره» در نوار بالا
              منتشر می‌شوند.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] px-2 py-2">
            <div className="flex flex-col gap-1.5 p-1">
              {sequence.map((slot, idx) => {
                const meta = SECTION_META.find((s) => s.id === slot.id);
                const title = slot.custom
                  ? getCustomSectionTitle(slot.custom)
                  : meta?.title ?? slot.id;
                const hidden = content.hidden.includes(slot.id);
                return (
                  <div
                    key={slot.id}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 transition-colors ${
                      hidden
                        ? "border-dashed border-border bg-muted/30 opacity-70"
                        : "border-border bg-card hover:border-primary/30"
                    } ${
                      selectedSection === slot.id ? "ring-1 ring-primary/40" : ""
                    }`}
                  >
                    <span className="w-6 text-center text-[10px] text-muted-foreground tnum">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p
                          className={`truncate text-sm font-medium ${
                            hidden ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {title}
                        </p>
                        {slot.custom ? (
                          <Badge
                            variant="secondary"
                            className="bg-violet-500/10 text-violet-600 shrink-0"
                          >
                            سفارشی
                          </Badge>
                        ) : null}
                        {hidden ? (
                          <Badge
                            variant="secondary"
                            className="bg-muted text-muted-foreground shrink-0"
                          >
                            مخفی
                          </Badge>
                        ) : null}
                      </div>
                      {meta?.description ? (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {meta.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {!slot.custom ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === 0}
                            onClick={() => moveSection(slot.id, -1)}
                            title="بالا"
                            aria-label={`جابه‌جایی ${title} به بالا`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === sequence.length - 1}
                            onClick={() => moveSection(slot.id, 1)}
                            title="پایین"
                            aria-label={`جابه‌جایی ${title} به پایین`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => toggleHidden(slot.id)}
                        title={hidden ? "نمایش" : "مخفی‌کردن"}
                        aria-label={hidden ? `نمایش ${title}` : `مخفی‌کردن ${title}`}
                      >
                        {hidden ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setManagerOpen(false);
                          selectSection(slot.id);
                        }}
                        title="ویرایش"
                        aria-label={`ویرایش ${title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {slot.custom ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setConfirmRemove(slot.id)}
                          title="حذف"
                          aria-label={`حذف ${title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive"
                          onClick={() => setConfirmRemove(slot.id)}
                          title="حذف (= مخفی‌کردن)"
                          aria-label={`حذف ${title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="px-4 py-3 border-t border-border">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_SECTION_TYPES.map((t) => (
                  <Button
                    key={t.type}
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => openAdd(t.type)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t.label}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManagerOpen(false)}
              >
                بستن
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ افزودن سکشن سفارشی */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              افزودن سکشن {typeMeta?.label ?? ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {typeMeta?.hint}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">نوع سکشن</Label>
              <Select
                value={addType}
                onValueChange={(v) => setAddType(v as CustomSectionType)}
              >
                <SelectTrigger dir="rtl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_SECTION_TYPES.map((t) => (
                    <SelectItem key={t.type} value={t.type}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(typeMeta?.fields ?? []).map((f) => (
              <div key={f.path} className="flex flex-col gap-1.5">
                <Label className="text-xs">{f.label}</Label>
                {f.multiline ? (
                  <Textarea
                    rows={f.path === "html" || f.path === "code" ? 6 : 3}
                    value={addProps[f.path] ?? ""}
                    onChange={(e) =>
                      setAddProps((p) => ({ ...p, [f.path]: e.target.value }))
                    }
                    placeholder={f.default}
                    dir={f.isLink ? "ltr" : "auto"}
                  />
                ) : (
                  <Input
                    value={addProps[f.path] ?? ""}
                    onChange={(e) =>
                      setAddProps((p) => ({ ...p, [f.path]: e.target.value }))
                    }
                    placeholder={f.default}
                    dir={f.isLink ? "ltr" : "auto"}
                  />
                )}
              </div>
            ))}

            <Separator />

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">جایگاه (بعد از کدام بخش)</Label>
              <Select value={addAfter} onValueChange={setAddAfter}>
                <SelectTrigger dir="rtl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__end__">انتهای صفحه</SelectItem>
                  {SECTION_META.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              انصراف
            </Button>
            <Button onClick={submitAdd} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              افزودن و ویرایش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف */}
      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRemove?.startsWith("cs_")
                ? "حذف سکشن سفارشی؟"
                : "مخفی‌کردن این بخش؟"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.startsWith("cs_")
                ? "این سکشن سفارشی به‌کلی حذف می‌شود."
                : "بخش‌های اصلی سایت حذف نمی‌شوند — فقط مخفی می‌شوند و هر زمان می‌توانید دوباره نمایششان دهید."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmRemove) {
                  if (confirmRemove.startsWith("cs_")) {
                    removeCustom(confirmRemove);
                  } else {
                    toggleHidden(confirmRemove);
                  }
                }
                setConfirmRemove(null);
              }}
            >
              تأیید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
