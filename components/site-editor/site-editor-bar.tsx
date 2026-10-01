"use client";

import * as React from "react";
import {
  Save,
  RotateCcw,
  LogOut,
  LayoutList,
  PencilRuler,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSiteEditor } from "@/components/site-editor/site-editor-context";

/**
 * site-editor-bar — نوار باریک بالای صفحه در حالت ویرایش
 * «حالت ویرایش فعال» + مدیریت بخش‌ها + ذخیره / بازنشانی / خروج
 */
export function SiteEditorBar() {
  const { dirty, saving, draftReady, save, reset, exit, setManagerOpen } =
    useSiteEditor();
  const [confirmReset, setConfirmReset] = React.useState(false);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] h-11 border-b border-primary/30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      role="toolbar"
      aria-label="نوار ابزار ویرایشگر سایت"
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-3 sm:px-4">
        <PencilRuler className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-bold text-foreground sm:text-sm">
          حالت ویرایش فعال
        </span>
        {dirty ? (
          <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/15">
            پیش‌نویس
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
            {draftReady ? "بدون تغییر" : "در حال بارگذاری…"}
          </Badge>
        )}

        <div className="mr-auto flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            onClick={() => setManagerOpen(true)}
          >
            <LayoutList className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">بخش‌ها</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-destructive hover:text-destructive hover:bg-destructive/5"
            onClick={() => setConfirmReset(true)}
            disabled={saving || !draftReady}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">بازنشانی</span>
          </Button>
          <Button
            size="sm"
            className="h-8 px-2.5"
            onClick={() => void save()}
            disabled={saving || !draftReady}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">در حال ذخیره…</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ذخیره</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-muted-foreground"
            onClick={exit}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">خروج</span>
          </Button>
        </div>
      </div>

      {/* تأیید بازنشانی */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>بازنشانی محتوای سایت؟</AlertDialogTitle>
            <AlertDialogDescription>
              همه‌ی تغییرات متنی، ترتیب بخش‌ها و سکشن‌های سفارشی حذف می‌شوند و
              صفحه به حالت پیش‌فرض برمی‌گردد. این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void reset()}
            >
              بله، بازنشانی کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
