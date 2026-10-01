"use client";

import * as React from "react";
import { ArrowLeft, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SiteCustomSection } from "@/lib/site-content";

/**
 * custom-section-renderer — رندر سکشن‌های سفارشی ویرایشگر سایت
 * نوع‌ها: html (پاک‌سازی‌شده) / shortcode / richtext / image-text / cta
 * مینیمال، ریسپانسیو، هم‌راستا با طراحی موجود (بدون رنگ آبی/ایندیگو).
 */

// ============ پاک‌سازی HTML در کلاینت (دفاع عمقی) ============

function sanitizeClientHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(
      /<\s*(script|iframe|object|embed|form|input|link|meta|base)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ""
    )
    .replace(
      /<\s*(script|iframe|object|embed|form|input|link|meta|base)\b[^>]*\/?>/gi,
      ""
    )
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

// ============ پارسر شورت‌کد ============

interface ShortcodeToken {
  kind: "cta" | "alert" | "badge" | "button";
  href?: string;
  label: string;
}

const ATTR_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"/g;
const PAIRED_PATTERN =
  /\[(cta|alert|badge|button)((?:\s+[\w-]+="[^"]*")*)\]([^\[]*?)\[\/\1\]/gi;
const SELF_CTA_PATTERN = /\[cta((?:\s+[\w-]+="[^"]*")*)\]/gi;

function parseAttrs(attrSrc: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_PATTERN.lastIndex = 0;
  while ((m = ATTR_PATTERN.exec(attrSrc)) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  return attrs;
}

function parseShortcodes(src: string): ShortcodeToken[] {
  const tokens: ShortcodeToken[] = [];
  const consumed = src;

  // توکن‌های جفتی: [button href="…"]برچسب[/button] و [alert]متن[/alert] و [badge]…[/badge]
  let m: RegExpExecArray | null;
  PAIRED_PATTERN.lastIndex = 0;
  while ((m = PAIRED_PATTERN.exec(consumed)) !== null) {
    const kind = m[1].toLowerCase() as ShortcodeToken["kind"];
    const attrs = parseAttrs(m[2] || "");
    const label = (m[3] || "").trim();
    tokens.push({ kind, href: attrs.href, label });
  }

  // cta خودبسته: [cta] یا [cta href="…"]
  SELF_CTA_PATTERN.lastIndex = 0;
  while ((m = SELF_CTA_PATTERN.exec(consumed)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    tokens.push({ kind: "cta", href: attrs.href, label: attrs.label || "" });
  }

  return tokens;
}

// ============ رندر شورت‌کدها ============

function ShortcodeRenderer({ code }: { code: string }) {
  const tokens = React.useMemo(() => parseShortcodes(code), [code]);
  if (tokens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        شورت‌کدی شناسایی نشد — مثال: <span dir="ltr">[button href=&quot;/pricing&quot;]مشاهده تعرفه‌ها[/button]</span>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {tokens.map((t, i) => {
        switch (t.kind) {
          case "button":
            return t.href ? (
              <Button key={i} asChild size="sm">
                <a href={t.href} target={t.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                  {t.label || "دکمه"}
                </a>
              </Button>
            ) : (
              <Button key={i} size="sm">
                {t.label || "دکمه"}
              </Button>
            );
          case "cta":
            return t.href ? (
              <Button key={i} asChild className="bg-gradient-to-l from-emerald-500 to-violet-600 hover:opacity-90">
                <a href={t.href} target={t.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                  {t.label || "شروع کنید"}
                </a>
              </Button>
            ) : (
              <Button key={i} className="bg-gradient-to-l from-emerald-500 to-violet-600 hover:opacity-90">
                {t.label || "شروع کنید"}
              </Button>
            );
          case "badge":
            return (
              <Badge key={i} variant="secondary">
                {t.label || "برچسب"}
              </Badge>
            );
          case "alert":
            return (
              <Alert key={i} className="w-full">
                <AlertTitle>{t.label || "توجه"}</AlertTitle>
              </Alert>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// ============ رندر نوع‌ها ============

function HtmlSection({ html }: { html: string }) {
  const safe = React.useMemo(() => sanitizeClientHtml(html), [html]);
  if (!safe.trim()) return null;
  return (
    <div
      className="max-w-none text-foreground [&_a]:text-primary [&_a:hover]:underline [&_img]:max-w-full [&_img]:rounded-xl"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

function RichTextSection({ title, text }: { title: string; text: string }) {
  const paragraphs = React.useMemo(
    () =>
      text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean),
    [text]
  );
  if (!title && paragraphs.length === 0) return null;
  return (
    <div className="mx-auto max-w-3xl text-center">
      {title && (
        <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h3>
      )}
      <div className="mt-4 space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-base leading-relaxed text-muted-foreground">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

function ImageTextSection({
  title,
  text,
  image,
  imageAlt,
  imageSide,
  link,
  linkLabel,
}: {
  title: string;
  text: string;
  image: string;
  imageAlt: string;
  imageSide: string;
  link: string;
  linkLabel: string;
}) {
  const imageFirst = imageSide.toLowerCase() !== "left"; // پیش‌فرض: تصویر سمت راست
  const imageNode = (
    <div className="relative min-h-56 overflow-hidden rounded-2xl border border-border bg-muted">
      {image ? (
        <img
          src={image}
          alt={imageAlt || title || "تصویر"}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/60">
          <ImageOff className="h-8 w-8" />
          <span className="text-xs">آدرس تصویر وارد نشده است</span>
        </div>
      )}
    </div>
  );
  const textNode = (
    <div className="flex flex-col justify-center gap-4">
      {title && (
        <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h3>
      )}
      {text && (
        <p className="text-base leading-relaxed text-muted-foreground whitespace-pre-line">
          {text}
        </p>
      )}
      {link && linkLabel && (
        <div>
          <Button asChild variant="outline">
            <a
              href={link}
              target={link.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
            >
              {linkLabel}
              <ArrowLeft className="h-4 w-4" />
            </a>
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      {imageFirst ? (
        <>
          {imageNode}
          {textNode}
        </>
      ) : (
        <>
          {textNode}
          {imageNode}
        </>
      )}
    </div>
  );
}

function CtaSection({
  title,
  text,
  buttonLabel,
  href,
}: {
  title: string;
  text: string;
  buttonLabel: string;
  href: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-6 py-12 text-center shadow-xl shadow-primary/20 sm:px-12 sm:py-16">
      {/* اورب تزئینی */}
      <div
        aria-hidden="true"
        className="orb-float pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative">
        {title && (
          <h3 className="text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl">
            {title}
          </h3>
        )}
        {text && (
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
            {text}
          </p>
        )}
        {buttonLabel && href && (
          <div className="mt-7">
            <Button
              asChild
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            >
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
              >
                {buttonLabel}
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ رندرر اصلی ============

export function CustomSectionRenderer({ section }: { section: SiteCustomSection }) {
  const props = section.props || {};

  let inner: React.ReactNode = null;
  switch (section.type) {
    case "html":
      inner = <HtmlSection html={props.html || ""} />;
      break;
    case "shortcode":
      inner = <ShortcodeRenderer code={props.code || ""} />;
      break;
    case "richtext":
      inner = <RichTextSection title={props.title || ""} text={props.text || ""} />;
      break;
    case "image-text":
      inner = (
        <ImageTextSection
          title={props.title || ""}
          text={props.text || ""}
          image={props.image || ""}
          imageAlt={props.imageAlt || ""}
          imageSide={props.imageSide || "right"}
          link={props.link || ""}
          linkLabel={props.linkLabel || ""}
        />
      );
      break;
    case "cta":
      inner = (
        <CtaSection
          title={props.title || ""}
          text={props.text || ""}
          buttonLabel={props.buttonLabel || ""}
          href={props.href || ""}
        />
      );
      break;
  }

  if (inner === null) return null;

  return (
    <section className="py-16 sm:py-20 scroll-mt-16" aria-label="سکشن سفارشی">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <Card className="border-border/60 bg-card/60">
          <CardContent className="p-6 sm:p-8">{inner}</CardContent>
        </Card>
      </div>
    </section>
  );
}
