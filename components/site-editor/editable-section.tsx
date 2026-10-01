"use client";

import * as React from "react";
import { MousePointerClick } from "lucide-react";
import { useSiteEditor } from "@/components/site-editor/site-editor-context";

/**
 * editable-section — پوشش سکشن در حالت ویرایش
 * هاور: کادر دور سکشن + برچسب عنوان؛ کلیک: باز شدن شیت ویرایش.
 * فقط در حالت ویرایش رندر می‌شود — در حالت عادی هیچ wrapper ای وجود ندارد
 * (خروجی ۱:۱ با کد فعلی).
 */
export function EditableSection({
  id,
  title,
  hidden,
  children,
}: {
  id: string;
  title: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  const { selectSection } = useSiteEditor();

  return (
    <div
      data-site-editor-section={id}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        selectSection(id);
      }}
      className="group relative cursor-pointer transition-shadow hover:shadow-[0_0_0_2px_hsl(var(--primary)/0.55)] focus-visible:shadow-[0_0_0_2px_hsl(var(--primary))] outline-none"
      tabIndex={0}
      role="button"
      aria-label={`ویرایش بخش: ${title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectSection(id);
        }
      }}
    >
      {/* برچسب شناور روی هاور */}
      <span
        className="pointer-events-none absolute right-2 top-2 z-20 hidden items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow-lg group-hover:flex"
        aria-hidden="true"
      >
        <MousePointerClick className="h-3 w-3" />
        {title}
        {hidden ? " (مخفی)" : ""}
      </span>
      {/* لایه‌ی کم‌رنگ برای سکشن مخفی‌شده */}
      {hidden ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-background/55"
        />
      ) : null}
      {children}
    </div>
  );
}
