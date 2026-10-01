"use client";

/**
 * GlossaryExplorer — واژه‌نامهٔ تعاملی اصطلاحات حسابداری و مالیات (v21)
 * ----------------------------------------------------------------------------
 * جست‌وجوی زنده + فیلتر دسته + نمایش کارت به کارت با انیمیشن باز/بسته.
 * SSR-friendly: کل مدخل‌ها از props می‌آیند (server render برای سئو) و
 * فقط تعامل (جست‌وجو/فیلتر/بازکردن) سمت کلاینت است.
 */

import * as React from "react";
import {
  Search,
  BookOpen,
  Receipt,
  Users,
  FileText,
  Package,
  TrendingUp,
  ScrollText,
  ChevronDown,
  ArrowLeft,
  X,
  BookMarked,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GlossaryCategory, GlossaryTerm } from "@/lib/glossary-data";
import { toPersianDigits } from "@/lib/persian";

const ICONS: Record<string, React.ElementType> = {
  BookOpen,
  Receipt,
  Users,
  FileText,
  Package,
  TrendingUp,
  ScrollText,
};

interface CategoryMeta {
  id: GlossaryCategory | "all";
  label: string;
  icon: string;
}

export function GlossaryExplorer({
  terms,
  categories,
}: {
  terms: GlossaryTerm[];
  categories: { id: GlossaryCategory; label: string; icon: string }[];
}) {
  const [query, setQuery] = React.useState("");
  const [cat, setCat] = React.useState<GlossaryCategory | "all">("all");
  const [open, setOpen] = React.useState<string | null>(null);

  const allCats: CategoryMeta[] = [
    { id: "all", label: "همه", icon: "BookMarked" },
    ...categories,
  ];

  // نرمال‌سازی برای جست‌وجو: حذف نیم‌فاصله، یکسان‌سازی ی/ک عربی
  const norm = React.useCallback((s: string) => {
    return s
      .toLowerCase()
      .replace(/[\u200c\u200f\u200e]/g, " ")
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const filtered = React.useMemo(() => {
    const q = norm(query);
    return terms.filter((t) => {
      if (cat !== "all" && t.category !== cat) return false;
      if (!q) return true;
      return (
        norm(t.term).includes(q) ||
        norm(t.en).toLowerCase().includes(q) ||
        norm(t.short).includes(q) ||
        norm(t.long).includes(q)
      );
    });
  }, [terms, query, cat, norm]);

  const catCount = React.useMemo(() => {
    const m = new Map<string, number>();
    terms.forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + 1));
    return m;
  }, [terms]);

  const catLabel = (id: string) =>
    categories.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="space-y-6">
      {/* جست‌وجو */}
      <div className="relative">
        <Search className="absolute right-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی اصطلاح… مثلاً: ترازنامه، صیاد، ارزش افزوده، CCC"
          className="h-13 rounded-xl border-border bg-card/80 pr-12 pl-10 text-sm shadow-sm transition-all placeholder:text-muted-foreground/90 focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="جست‌وجوی اصطلاحات"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="پاک‌کردن جست‌وجو"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* فیلتر دسته‌ها */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="دسته‌بندی اصطلاحات">
        {allCats.map((c) => {
          const Icon = ICONS[c.icon] ?? BookOpen;
          const active = cat === c.id;
          const count = c.id === "all" ? terms.length : (catCount.get(c.id) ?? 0);
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCat(c.id as GlossaryCategory | "all")}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {c.label}
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  active ? "bg-primary-foreground/20" : "bg-muted"
                }`}
              >
                {toPersianDigits(count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* شمارندهٔ نتیجه */}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length === terms.length
          ? `${toPersianDigits(terms.length)} اصطلاح تخصصی — برای جزئیات روی هر کارت بزنید`
          : `${toPersianDigits(filtered.length)} نتیجه برای «${query || catLabel(cat)}»`}
      </p>

      {/* شبکهٔ اصطلاحات */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">اصطلاحی یافت نشد</p>
          <p className="mt-1 text-xs text-muted-foreground">
            املای دیگری را امتحان کنید یا دستهٔ «همه» را ببینید
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setQuery("");
              setCat("all");
            }}
          >
            پاک‌کردن فیلترها
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t, i) => {
            const isOpen = open === t.slug;
            const catMeta = categories.find((c) => c.id === t.category);
            const Icon = ICONS[catMeta?.icon ?? ""] ?? BookOpen;
            return (
              <article
                key={t.slug}
                id={`term-${t.slug}`}
                className="group scroll-mt-24"
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : t.slug)}
                  aria-expanded={isOpen}
                  aria-controls={`def-${t.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border bg-card p-4 text-right transition-all duration-200 ${
                    isOpen
                      ? "border-primary/40 shadow-lg shadow-primary/5"
                      : "border-border/70 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                        isOpen ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${
                        isOpen ? "rotate-180 text-primary" : ""
                      }`}
                    />
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-foreground">{t.term}</h3>
                  <p className="mt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground/80" dir="ltr">
                    {t.en}
                  </p>
                  <p
                    id={`def-${t.slug}`}
                    className={`mt-2 text-xs leading-relaxed text-muted-foreground transition-all duration-300 ${
                      isOpen ? "line-clamp-none" : "line-clamp-2"
                    }`}
                  >
                    {isOpen ? t.long : t.short}
                  </p>
                  {isOpen && t.related ? (
                    <Link
                      href={t.related}
                      prefetch={false}
                      className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary transition-all duration-150 hover:border-primary/40 hover:bg-primary/10 active:scale-95"
                    >
                      مطالعهٔ راهنمای کامل این موضوع
                      <ArrowLeft className="h-3 w-3" />
                    </Link>
                  ) : null}
                  {!isOpen && (
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors group-hover:text-primary/80">
                      <ChevronDown className="h-3 w-3" />
                      تعریف کامل + مثال
                    </span>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
