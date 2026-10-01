"use client";

/**
 * components/email-prompt-dialog.tsx
 *
 * پاپ‌آپ «ایمیل‌تان را امن کنید» — بعد از ورود موفق، از کاربری که ایمیل
 * معتبری روی پروفایلش ندارد، یک ایمیل معتبر خواسته می‌شود.
 *
 * چرا؟ اگر روزی نام کاربری یا رمز عبور را فراموش کند، اطلاعات ورود جدید
 * دقیقاً به همین ایمیل ارسال می‌شود (جریان /api/auth/forgot-password).
 *
 * رابط: open/onClose/onSaved(currentEmail برای نمایش).
 * بستن با: دکمه‌ی X جذاب، دکمه‌ی «بعداً»، یا Escape (شادکن دیالوگ).
 */

import * as React from "react";
import { MailPlus, X, Loader2, ShieldCheck, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/auth-fetch";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailPromptDialogProps {
  /** باز/بسته بودن دیالوگ */
  open: boolean;
  /** بستن (X / بعداً / Escape) — والد مسئول ذخیره‌ی «دیگر نشان نده» است */
  onClose: () => void;
  /** ایمیل فعلی (نامعتبر یا خالی) — فقط برای نمایش */
  currentEmail?: string | null;
  /** پس از ثبت موفق ایمیل جدید صدا زده می‌شود */
  onSaved?: (email: string) => void;
}

export function EmailPromptDialog({
  open,
  onClose,
  currentEmail,
  onSaved,
}: EmailPromptDialogProps) {
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // ریست state هنگام باز شدن + فوکوس روی فیلد ایمیل
  React.useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    setLoading(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 350);
    return () => window.clearTimeout(t);
  }, [open]);

  const validate = (value: string): boolean => {
    if (!value.trim() || !EMAIL_RE.test(value.trim())) {
      setError("ایمیل معتبر وارد کنید");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (loading) return;
    if (!validate(value)) {
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!res.ok || !data?.success) {
        toast({
          title: "ثبت ایمیل ناموفق بود",
          description: data?.error || "لطفاً دوباره تلاش کنید.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "ایمیل با موفقیت ثبت شد",
        description:
          "حساب شما ایمن‌تر شد؛ اگر روزی اطلاعات ورود را فراموش کنید، رمز جدید به همین ایمیل ارسال می‌شود.",
      });
      onSaved?.(value);
    } catch {
      toast({
        title: "خطای ارتباط",
        description: "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !loading) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        dir="rtl"
        className="max-w-md w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-2xl"
      >
        {/* ─── دکمه‌ی بستن (X) جذاب ─── */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label="بستن"
          className="absolute top-3 end-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-muted-foreground backdrop-blur-sm transition-all duration-300 hover:rotate-90 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ─── سربرگ گرادیانی با آیکون ─── */}
        <div className="relative overflow-hidden px-6 pb-1 pt-8">
          {/* هاله‌های تزئینی */}
          <div
            className="absolute -top-10 -start-10 h-28 w-28 rounded-full bg-teal-500/10 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-14 -end-8 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, #0d9488 0%, #10b981 60%, #8b5cf6 135%)",
              boxShadow: "0 12px 30px -8px rgba(13,148,136,0.55)",
            }}
          >
            <MailPlus className="h-8 w-8 text-white" strokeWidth={2} />
          </div>

          <DialogTitle className="mt-4 text-center text-lg font-bold tracking-tight text-foreground">
            ایمیل‌تان را امن کنید
          </DialogTitle>
          <DialogDescription className="mt-2 px-1 text-center text-[13px] leading-relaxed text-muted-foreground">
            یک ایمیل معتبر وارد کنید تا حساب‌تان ایمن بماند؛ اگر روزی نام
            کاربری یا رمز عبور را فراموش کنید، اطلاعات ورود جدید دقیقاً به
            همین ایمیل ارسال می‌شود و بدون نگرانی به حساب‌تان برمی‌گردید.
          </DialogDescription>
        </div>

        {/* ─── فرم ایمیل ─── */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="email-prompt-input"
              className="text-xs font-medium text-foreground/80"
            >
              ایمیل
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600/70 dark:text-teal-400/70" />
              <Input
                ref={inputRef}
                id="email-prompt-input"
                type="email"
                autoComplete="email"
                inputMode="email"
                dir="ltr"
                name="email"
                placeholder="name@example.com"
                value={email}
                disabled={loading}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                onBlur={() => email && validate(email)}
                aria-invalid={!!error}
                aria-describedby={error ? "email-prompt-error" : undefined}
                className={`h-11 bg-background/60 ps-10 pe-3 text-sm ${
                  error
                    ? "border-destructive/60 focus-visible:ring-destructive/40"
                    : "border-border/60"
                }`}
              />
            </div>
            {error ? (
              <p
                id="email-prompt-error"
                role="alert"
                className="text-[11px] font-medium text-destructive"
              >
                {error}
              </p>
            ) : currentEmail ? (
              <p className="text-[10px] text-muted-foreground/80" dir="ltr">
                {currentEmail}
              </p>
            ) : null}
          </div>

          {/* دکمه‌ی اصلی — گرادیان */}
          <Button
            type="submit"
            disabled={loading || !email.trim()}
            className="relative h-11 w-full overflow-hidden border-0 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #0d9488 0%, #10b981 100%)",
              boxShadow: "0 10px 25px -8px rgba(13,148,136,0.5)",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                در حال ثبت...
              </>
            ) : (
              <>
                <MailPlus className="h-4 w-4" />
                ثبت ایمیل
              </>
            )}
          </Button>

          {/* دکمه‌ی ثانویه — بعداً */}
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 rounded"
          >
            بعداً در پروفایل وارد می‌کنم
          </button>

          {/* نشانه‌ی اعتماد */}
          <div className="flex items-center justify-center gap-1.5 pt-1 text-[10px] text-muted-foreground/70">
            <ShieldCheck className="h-3 w-3 text-emerald-500/80" />
            <span>ایمیل شما فقط برای بازیابی حساب و اطلاع‌رسانی استفاده می‌شود</span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
