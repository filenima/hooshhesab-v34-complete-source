"use client";

/**
 * EmbedNotice — کارت «این ابزار را در سایت خودتان بگذارید» (v26 → عمومی‌سازی v27)
 *
 * قبلاً فقط برای ویجت کیویز پلن در /compare-plans بود؛ حالا با props
 * برای هر ویجت قابل استفاده است:
 *   - /compare-plans → /embed/plan-quiz
 *   - /calculators   → /embed/tax-calculator (v27)
 * کد iframe با یک کلیک کپی می‌شود تا حسابدارها/وبلاگ‌نویسان/مشاوران مالی
 * آن را در سایت خودشان قرار دهند (لینک‌سازی + برندینگ رایگان).
 */

import * as React from "react";
import { Code2, Check, Copy, ExternalLink, Puzzle } from "lucide-react";

interface EmbedNoticeProps {
  /** مسیر نسبی ویجت — مثل /embed/plan-quiz */
  embedPath: string;
  /** عنوان کارت */
  title?: string;
  /** توضیح کارت */
  description?: string;
  /** ارتفاع پیشنهادی iframe در کد کپی‌شونده */
  height?: number;
  /** title ویژگی iframe (دسترس‌پذیری) */
  iframeTitle?: string;
}

export function EmbedNotice({
  embedPath,
  title = "حسابدار یا مشاور مالی هستید؟ این ابزار را در سایت خودتان بگذارید",
  description = "این ابزار به‌صورت ویجت مستقل قابل نمایش در سایت شماست — بدون وابستگی فنی، فقط یک خط کد. ارتفاع ویجت به‌صورت خودکار با محتوای هماهنگ می‌شود.",
  height = 620,
  iframeTitle = "ابزار هوش",
}: EmbedNoticeProps) {
  const [copied, setCopied] = React.useState(false);

  const iframeCode = React.useMemo(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "https://hoosh.nobatime.ir";
    return `<iframe src="${base}${embedPath}" style="width:100%;height:${height}px;border:0;border-radius:12px" loading="lazy" title="${iframeTitle}"></iframe>`;
  }, [embedPath, height, iframeTitle]);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(iframeCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("این کد را کپی کنید:", iframeCode);
    }
  }, [iframeCode]);

  return (
    <section
      aria-label="قرار دادن ابزار در سایت شما"
      className="mt-12 overflow-hidden rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04]"
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Code2 className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          <pre
            dir="ltr"
            className="mt-3 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/50 px-3 py-2 text-left text-[10px] leading-5 text-muted-foreground"
          >
            <code>{iframeCode}</code>
          </pre>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            onClick={copy}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
              copied
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                : "border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                کپی شد!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                کپی کد embed
              </>
            )}
          </button>
          <a
            href={embedPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            پیش‌نمایش ویجت
          </a>
          <a
            href="/widgets"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Puzzle className="h-3.5 w-3.5" aria-hidden />
            همهٔ ویجت‌ها
          </a>
        </div>
      </div>
    </section>
  );
}
