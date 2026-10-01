"use client";

/**
 * ============ ticket-image-attachments.tsx ============
 *
 * اجزای مشترک پیوست تصویری تیکت پشتیبانی:
 * - TicketImagePicker: انتخاب/آپلود فوری تصاویر (حداکثر ۵ فایل، هر کدام ۵MB)
 * - TicketAttachmentThumbnails: نمایش پیوست‌های پیام به‌صورت بندانگشتی
 *
 * آپلود بلافاصله پس از انتخاب به /api/tickets/upload انجام می‌شود و
 * نتیجه ({url,name,size,type}) در state فرم نگه داشته می‌شود.
 */

import * as React from "react";
import { ImagePlus, Loader2, X, FileImage } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";

export interface TicketAttachment {
  url: string;
  name: string;
  size: number;
  type: string;
}

const MAX_FILES = 5;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // ۵ مگابایت

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
  }
  return `${toPersianDigits(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

/* ============ انتخابگر / آپلودر تصاویر ============ */

interface TicketImagePickerProps {
  value: TicketAttachment[];
  onChange: (next: TicketAttachment[]) => void;
  max?: number;
  compact?: boolean;
  disabled?: boolean;
}

export function TicketImagePicker({
  value,
  onChange,
  max = MAX_FILES,
  compact = false,
  disabled = false,
}: TicketImagePickerProps) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);

  const uploadOne = async (file: File): Promise<TicketAttachment | null> => {
    // اعتبارسنجی سمت کلاینت — پیام فارسی هماهنگ با سرور
    if (!file.type.startsWith("image/")) {
      toast({
        title: "فایل نامعتبر",
        description: "فقط فایل تصویری (PNG، JPG، WebP، GIF، SVG) مجاز است.",
        variant: "destructive",
      });
      return null;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast({
        title: "حجم فایل زیاد است",
        description: "حجم فایل نباید بیشتر از ۵ مگابایت باشد.",
        variant: "destructive",
      });
      return null;
    }

    setUploadingCount((c) => c + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch("/api/tickets/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.data?.url) {
        throw new Error(data?.error || "خطا در آپلود تصویر");
      }
      return data.data as TicketAttachment;
    } catch (e) {
      toast({
        title: "خطا در آپلود",
        description: e instanceof Error? e.message: "آپلود تصویر ناموفق بود.",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingCount((c) => Math.max(0, c - 1));
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = max - value.length;
    if (remaining <= 0) {
      toast({
        title: "سقف پیوست",
        description: `حداکثر ${toPersianDigits(max)} تصویر می‌توانید پیوست کنید.`,
        variant: "destructive",
      });
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    const uploaded: TicketAttachment[] = [];
    for (const file of list) {
      const result = await uploadOne(file);
      if (result) uploaded.push(result);
    }
    if (uploaded.length > 0) {
      onChange([...value, ...uploaded].slice(0, max));
    }
    // ریست input تا انتخاب مجدد همان فایل هم کار کند
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i!== index));
  };

  const busy = uploadingCount > 0;
  const full = value.length >= max;

  return (
    <div className="space-y-2">
      {/* ناحیه انتخاب / رها کردن فایل */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled &&!full) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled &&!full) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled &&!full &&!busy) inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled &&!full &&!busy) inputRef.current?.click();
          }
        }}
        aria-label="افزودن تصویر پیوست"
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
          compact? "h-11 px-3 text-xs": "h-20 px-4 text-sm",
          dragOver
? "border-primary bg-primary/5"
: "border-border hover:border-primary/50 hover:bg-accent/30",
          (disabled || full || busy) && "cursor-not-allowed opacity-60"
        )}
      >
        {busy? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-muted-foreground">
              در حال آپلود {toPersianDigits(uploadingCount)} تصویر...
            </span>
          </>
        ) : full? (
          <span className="text-muted-foreground">
            سقف پیوست ({toPersianDigits(max)} تصویر) پر شده است
          </span>
        ): (
          <>
            <ImagePlus className={cn("text-primary shrink-0", compact? "h-4 w-4": "h-5 w-5")} />
            <span className="text-muted-foreground text-center">
              افزودن تصویر (حداکثر ۵ مگابایت)
            </span>
            {!compact && (
              <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
                PNG، JPG، WebP، GIF، SVG — تا {toPersianDigits(max)} فایل
              </span>
            )}
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {/* بندانگشتی‌های پیوست‌شده */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((att, i) => (
            <div
              key={`${att.url}-${i}`}
              className="group relative h-16 w-16 rounded-lg overflow-hidden border border-border bg-muted"
            >
              <img
                src={att.url}
                alt={att.name}
                className="h-full w-full object-cover"
                title={`${att.name} — ${formatSize(att.size)}`}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                aria-label={`حذف ${att.name}`}
                className="absolute top-1 end-1 rounded-full bg-background/90 text-foreground shadow-sm p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ نمایش پیوست‌های یک پیام ============ */

interface TicketAttachmentThumbnailsProps {
  attachments?: TicketAttachment[] | null;
  compact?: boolean;
}

export function TicketAttachmentThumbnails({
  attachments,
  compact = false,
}: TicketAttachmentThumbnailsProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2 mt-2", compact && "mt-1")}>
      {attachments.map((att, i) => (
        <a
          key={`${att.url}-${i}`}
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${att.name} — برای مشاهده‌ی اندازه کامل کلیک کنید`}
          className={cn(
            "relative block rounded-lg overflow-hidden border border-border/60 bg-background/40 hover:border-primary/50 transition-colors",
            compact? "h-12 w-12": "h-16 w-16"
          )}
        >
          <img
            src={att.url}
            alt={att.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/45 text-white text-[9px] py-0.5 opacity-0 hover:opacity-100 transition-opacity">
            <FileImage className="h-2.5 w-2.5" />
            {formatSize(att.size)}
          </span>
        </a>
      ))}
    </div>
  );
}
