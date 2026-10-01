"use client";

import * as React from "react";
import {
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  getCustomTypeMeta,
  getCustomSectionTitle,
} from "@/components/site-editor/section-registry";
import type { SectionFieldDef } from "@/components/site-editor/section-registry";

/**
 * section-edit-sheet — شیت ویرایش سکشن انتخاب‌شده
 * فیلدهای متنی/لینک + نمایش/مخفی + جابه‌جایی (+ حذف برای سکشن‌های سفارشی)
 * ویرایش‌ها زنده در پیش‌نویس اعمال می‌شوند؛ انتشار با «ذخیره» در نوار بالا.
 */

function FieldControl({
  def,
  value,
  onChange,
  onReset,
}: {
  def: SectionFieldDef;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{def.label}</Label>
        {def.default ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="بازگشت به متن پیش‌فرض"
          >
            <RotateCcw className="h-3 w-3" />
            پیش‌فرض
          </button>
        ) : null}
      </div>
      {def.multiline ? (
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.default || def.label}
        />
      ) : (
        <Input
          dir={def.isLink ? "ltr" : "auto"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.default || def.label}
          inputMode={def.isNumber ? "numeric" : undefined}
        />
      )}
      <span className="text-[10px] text-muted-foreground">
        {value === def.default ? "متن پیش‌فرض" : "شخصی‌سازی‌شده"}
      </span>
    </div>
  );
}

export function SectionEditSheet() {
  const {
    content,
    selectedSection,
    selectSection,
    setField,
    resetField,
    isHidden,
    toggleHidden,
    moveSection,
    removeCustom,
    updateCustom,
  } = useSiteEditor();

  const id = selectedSection;
  const custom = id ? content.custom.find((c) => c.id === id) : undefined;
  const meta = id ? SECTION_META.find((s) => s.id === id) : undefined;
  const hidden = id ? isHidden(id) : false;

  const title = custom
    ? getCustomSectionTitle(custom)
    : meta?.title ?? "بخش";

  const open = id !== null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && selectSection(null)}>
      <SheetContent
        side="right"
        className="w-[92vw] max-w-md overflow-y-auto p-0"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            ویرایش بخش
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {title}
            </Badge>
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            تغییرات زنده در صفحه اعمال می‌شوند؛ با «ذخیره» در نوار بالا برای
            همه‌ی بازدیدکنندگان منتشر می‌شوند.
          </SheetDescription>
        </SheetHeader>

        {id ? (
          <div className="flex flex-col gap-5 px-4 py-4">
            {/* نمایش/مخفی + جابه‌جایی */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <Switch
                  id={`section-visible-${id}`}
                  checked={!hidden}
                  onCheckedChange={() => toggleHidden(id)}
                />
                <Label
                  htmlFor={`section-visible-${id}`}
                  className="text-xs cursor-pointer"
                >
                  {hidden ? "این بخش مخفی است" : "نمایش این بخش"}
                </Label>
              </div>
              {!custom ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveSection(id, -1)}
                    title="جابه‌جایی به بالا"
                    aria-label="جابه‌جایی به بالا"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveSection(id, 1)}
                    title="جابه‌جایی به پایین"
                    aria-label="جابه‌جایی به پایین"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            {/* حالت مخفی — راهنما */}
            {hidden ? (
              <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                <EyeOff className="h-3.5 w-3.5 shrink-0" />
                این بخش برای بازدیدکنندگان نمایش داده نمی‌شود (کد حذف نمی‌شود).
              </div>
            ) : null}

            {/* فیلدهای سکشن built-in */}
            {meta ? (
              <div className="flex flex-col gap-4">
                {meta.fields.map((def) => (
                  <FieldControl
                    key={def.path}
                    def={def}
                    value={content.fields[def.path] ?? def.default}
                    onChange={(v) => setField(def.path, v)}
                    onReset={() => resetField(def.path)}
                  />
                ))}
              </div>
            ) : null}

            {/* فیلدهای سکشن سفارشی */}
            {custom ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">جایگاه (بعد از کدام بخش)</Label>
                  <Select
                    value={custom.after ?? "__end__"}
                    onValueChange={(v) =>
                      updateCustom(custom.id, {
                        after: v === "__end__" ? undefined : v,
                      })
                    }
                  >
                    <SelectTrigger dir="rtl">
                      <SelectValue placeholder="انتخاب جایگاه" />
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

                <Separator />

                {(getCustomTypeMeta(custom.type)?.fields ?? []).map((def) => (
                  <FieldControl
                    key={def.path}
                    def={def}
                    value={custom.props[def.path] ?? ""}
                    onChange={(v) =>
                      updateCustom(custom.id, {
                        props: { ...custom.props, [def.path]: v },
                      })
                    }
                    onReset={() => {
                      const props = { ...custom.props };
                      delete props[def.path];
                      updateCustom(custom.id, { props });
                    }}
                  />
                ))}

                <Separator />

                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive hover:bg-destructive/5"
                  onClick={() => {
                    removeCustom(custom.id);
                    selectSection(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  حذف این سکشن سفارشی
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <SheetFooter className="border-t border-border px-4 py-3">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" />
              پیش‌نمایش زنده است
            </span>
            <Button variant="outline" size="sm" onClick={() => selectSection(null)}>
              بستن
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
