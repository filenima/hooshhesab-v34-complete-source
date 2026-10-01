"use client";

import * as React from "react";
import {
 BookOpen,
 Calculator,
 Receipt,
 Users,
 GraduationCap,
 Newspaper,
 Clock,
 ArrowLeft,
 Mail,
 TrendingUp,
 Search,
 Loader2,
 Calendar,
 type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
 Tabs,
 TabsList,
 TabsTrigger,
 TabsContent,
} from "@/components/ui/tabs";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { MarketingHeader, MarketingFooter, type ViewType } from "./_marketing-shell";

interface BlogViewProps {
 onBack: () => void;
 onNavigate: (v: ViewType) => void;
 onOpenAuth: () => void;
}

type Category = "all" | "ACCOUNTING" | "TAX" | "PAYROLL" | "TUTORIAL" | "EDUCATION" | "NEWS" | "MODIAN";

const CATEGORY_META: Record<Exclude<Category, "all">, { label: string; icon: LucideIcon; color: string }> = {
 ACCOUNTING: { label: "حسابداری", icon: Calculator, color: "bg-primary/10 text-primary" },
 TAX: { label: "مالیات", icon: Receipt, color: "bg-primary/10 text-primary" },
 PAYROLL: { label: "حقوق", icon: Users, color: "bg-primary/10 text-primary" },
 TUTORIAL: { label: "آموزش", icon: GraduationCap, color: "bg-primary/10 text-primary" },
 EDUCATION: { label: "آموزش", icon: GraduationCap, color: "bg-primary/10 text-primary" },
 NEWS: { label: "اخبار", icon: Newspaper, color: "bg-primary/10 text-primary" },
 MODIAN: { label: "سامانه مودیان", icon: Receipt, color: "bg-primary/10 text-primary" },
};

interface Post {
 id: string;
 slug: string;
 title: string;
 excerpt: string | null;
 coverImage: string | null;
 category: string;
 publishedAt: string | null;
 readingTime: number;
 focusKeyword: string | null;
}

// تبدیل تاریخ میلادی به شمسی خوانا
function formatJalali(date: string | Date | null): string {
 if (!date) return "—";
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 }).format(new Date(date));
 } catch {
 return "—";
 }
}

// داده‌های fallback برای زمانی که API در دسترس نیست یا مقاله‌ای منتشر نشده
const FALLBACK_POSTS: Post[] = [
 {
 id: "fallback-1",
 slug: "samaneh-modian-guide",
 title: "راهنمای کامل سامانه مودیان ۱۴۰۳",
 excerpt:
 "هر آنچه باید درباره سامانه مودیان، صورتحساب الکترونیکی، نحوه ارسال و کدهای وضعیت بدانید — همراه با چک‌لیست عملیاتی برای کسب‌وکارها.",
 coverImage: null,
 category: "TAX",
 publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
 readingTime: 12,
 focusKeyword: "سامانه مودیان",
 },
 {
 id: "fallback-2",
 slug: "arzesh-afzoode-rates",
 title: "محاسبه ارزش افزوده: ۹٪، ۱۵٪، ۲۰٪ — کدام برای شما؟",
 excerpt:
 "نرخ‌های مختلف مالیات بر ارزش افزوده در ایران و راهنمای تشخیص نرخ صحیح برای کسب‌وکار شما بر اساس نوع فعالیت.",
 coverImage: null,
 category: "TAX",
 publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
 readingTime: 8,
 focusKeyword: "ارزش افزوده",
 },
 {
 id: "fallback-3",
 slug: "payments-1403-tips",
 title: "نکات حقوق و دستمزد ۱۴۰۳",
 excerpt:
 "تغییرات مهم قانون کار در سال ۱۴۰۳ و تأثیر آن بر محاسبه حقوق و دستمزد کارکنان — راهنمای کاربردی برای کارفرمایان.",
 coverImage: null,
 category: "PAYROLL",
 publishedAt: new Date(Date.now() - 86400000 * 8).toISOString(),
 readingTime: 6,
 focusKeyword: "حقوق و دستمزد",
 },
];

export function BlogView({ onBack, onNavigate, onOpenAuth }: BlogViewProps) {
 const [activeCat, setActiveCat] = React.useState<Category>("all");
 const [searchQuery, setSearchQuery] = React.useState("");
 const [subscribed, setSubscribed] = React.useState(false);
 const [posts, setPosts] = React.useState<Post[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [usingFallback, setUsingFallback] = React.useState(false);

 // دریافت مقالات منتشرشده از API
 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const res = await authFetch("/api/blog/list?limit=50", { cache: "no-store" });
 const json = await res.json();
 if (!cancelled && json.success && Array.isArray(json.data) && json.data.length > 0) {
 setPosts(json.data);
 setUsingFallback(false);
 } else if (!cancelled) {
 // API در دسترس است ولی مقاله‌ای منتشر نشده — fallback استفاده کن
 setPosts(FALLBACK_POSTS);
 setUsingFallback(true);
 }
 } catch {
 if (!cancelled) {
 // خطای شبکه — fallback
 setPosts(FALLBACK_POSTS);
 setUsingFallback(true);
 }
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, []);

 const filteredPosts = React.useMemo(() => {
 return posts.filter((p) => {
 const matchCat = activeCat === "all" || p.category === activeCat;
 const matchSearch =
!searchQuery ||
 p.title.includes(searchQuery) ||
 (p.excerpt || "").includes(searchQuery);
 return matchCat && matchSearch;
 });
 }, [posts, activeCat, searchQuery]);

 const featured = filteredPosts[0] || null;
 const rest = featured? filteredPosts.slice(1): [];

 // دسته‌بندی‌های موجود
 const availableCategories = React.useMemo(() => {
 const cats = new Set(posts.map((p) => p.category));
 return Array.from(cats).filter(Boolean);
 }, [posts]);

 // تعداد مقالات هر دسته
 const categoryCounts = React.useMemo(() => {
 const counts: Record<string, number> = {};
 for (const p of posts) {
 counts[p.category] = (counts[p.category] || 0) + 1;
 }
 return counts;
 }, [posts]);

 return (
 <div className="flex min-h-screen flex-col bg-background">
 <MarketingHeader active="blog" onBack={onBack} onNavigate={onNavigate} onOpenAuth={onOpenAuth} />

 {/* Hero */}
 <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
 <Badge variant="secondary" className="bg-primary/10 text-primary mb-4">
 <BookOpen className="h-3 w-3 ml-1" />
 بلاگ هوش
 </Badge>
 <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
 بلاگ هوش
 </h1>
 <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
 آموزش حسابداری، مالیات و نکات کسب‌وکار — نوشته‌ی تیم متخصصان ما
 </p>
 <div className="mt-6 max-w-md mx-auto relative">
 <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="جستجو در مقالات..."
 className="pr-9 h-11"
 />
 </div>
 </div>
 </section>

 <main className="flex-1">
 <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
 {loading? (
 <div className="flex flex-col items-center justify-center py-20">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="mt-3 text-sm text-muted-foreground">در حال بارگذاری مقالات...</p>
 </div>
 ): (
 <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
 {/* محتوای اصلی */}
 <div className="lg:col-span-3 min-w-0">
 {/* Category tabs */}
 <Tabs value={activeCat} onValueChange={(v) => setActiveCat(v as Category)}>
 <TabsList className="flex-wrap h-auto p-1">
 <TabsTrigger value="all">همه</TabsTrigger>
 {Object.entries(CATEGORY_META).map(([key, meta]) => (
 <TabsTrigger key={key} value={key}>
 {meta.label}
 </TabsTrigger>
 ))}
 </TabsList>

 {/* Featured post */}
 {activeCat === "all" &&!searchQuery && featured && (
 <div className="mt-8">
 <FeaturedPost post={featured} />
 </div>
 )}

 <TabsContent value={activeCat} className="mt-6">
 {/* Post grid */}
 {rest.length > 0 || (featured && activeCat!== "all") || (featured && searchQuery)? (
 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
 {(activeCat === "all" &&!searchQuery? rest: filteredPosts).map((post) => (
 <PostCard key={post.id} post={post} />
 ))}
 </div>
 ): null}
 {filteredPosts.length === 0 && (
 <Card className="p-12 text-center">
 <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
 <p className="text-sm text-muted-foreground">
 هیچ مقاله‌ای یافت نشد. عبارت دیگری را امتحان کنید.
 </p>
 </Card>
 )}
 </TabsContent>
 </Tabs>
 </div>

 {/* Sidebar */}
 <aside className="lg:col-span-1 space-y-6">
 {/* دسته‌بندی‌ها */}
 <Card className="p-5">
 <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
 <BookOpen className="h-4 w-4 text-primary" />
 دسته‌بندی‌ها
 </h3>
 <ul className="space-y-1.5">
 <li>
 <button
 onClick={() => setActiveCat("all")}
 className={`flex w-full items-center justify-between text-sm py-2 px-2 rounded-md transition-colors ${
 activeCat === "all"
? "bg-primary/10 text-primary font-medium"
: "hover:bg-muted text-muted-foreground hover:text-foreground"
 }`}
 >
 <span>همه</span>
 <Badge variant="secondary" className="text-[10px] h-5">
 {toPersianDigits(posts.length)}
 </Badge>
 </button>
 </li>
 {availableCategories.map((cat) => {
 const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
 if (!meta) return null;
 return (
 <li key={cat}>
 <button
 onClick={() => setActiveCat(cat as Category)}
 className={`flex w-full items-center justify-between text-sm py-2 px-2 rounded-md transition-colors ${
 activeCat === cat
? "bg-primary/10 text-primary font-medium"
: "hover:bg-muted text-muted-foreground hover:text-foreground"
 }`}
 >
 <span className="flex items-center gap-1.5">
 <meta.icon className="h-3.5 w-3.5" />
 {meta.label}
 </span>
 <Badge variant="secondary" className="text-[10px] h-5">
 {toPersianDigits(categoryCounts[cat] || 0)}
 </Badge>
 </button>
 </li>
 );
 })}
 </ul>
 </Card>

 {/* پربازدیدترین */}
 <Card className="p-5">
 <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
 <TrendingUp className="h-4 w-4 text-primary" />
 جدیدترین مقالات
 </h3>
 <ul className="space-y-3">
 {posts.slice(0, 5).map((p, i) => (
 <li key={p.id}>
 <a
 href={`/blog/${p.slug}`}
 className="flex items-start gap-3 group"
 >
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold">
 {toPersianDigits(i + 1)}
 </span>
 <div className="min-w-0">
 <p className="text-sm font-medium text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
 {p.title}
 </p>
 <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
 <Calendar className="h-2.5 w-2.5" />
 {formatJalali(p.publishedAt)}
 </p>
 </div>
 </a>
 </li>
 ))}
 </ul>
 </Card>

 {/* خبرنامه */}
 <Card className="p-5 bg-primary text-primary-foreground">
 <div className="flex items-center gap-2 mb-3">
 <Mail className="h-4 w-4" />
 <h3 className="font-semibold">خبرنامه</h3>
 </div>
 <p className="text-xs text-primary-foreground/80 mb-4 leading-relaxed">
 هفتگی جدیدترین مقالات حسابداری و مالیات را در ایمیل خود دریافت کنید.
 </p>
 {subscribed? (
 <div className="rounded-md bg-primary-foreground/15 p-3 text-xs text-center">
 ثبت شد! ایمیل خود را بررسی کنید.
 </div>
 ): (
 <form
 onSubmit={(e) => {
 e.preventDefault();
 setSubscribed(true);
 }}
 className="space-y-2"
 >
 <Input
 type="email"
 required
 placeholder="ایمیل شما"
 className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/60"
 />
 <Button
 type="submit"
 className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90"
 >
 عضویت
 </Button>
 </form>
 )}
 </Card>
 </aside>
 </div>
 )}
 </div>
 </main>

 <MarketingFooter onNavigate={onNavigate} />
 </div>
 );
}

function FeaturedPost({ post }: { post: Post }) {
 const meta = CATEGORY_META[post.category as keyof typeof CATEGORY_META] || {
 label: "مقاله",
 icon: BookOpen,
 color: "bg-primary/10 text-primary",
 };
 const Icon = meta.icon;
 return (
 <Card className="overflow-hidden card-hover">
 <a href={`/blog/${post.slug}`} className="block">
 <div className="grid md:grid-cols-2">
 {/* تصویر */}
 <div className="relative h-48 md:h-auto bg-gradient-to-br from-primary/15 via-primary/5 to-background flex items-center justify-center">
 {post.coverImage? (
 <img
 src={post.coverImage}
 alt={post.title}
 className="absolute inset-0 h-full w-full object-cover"
 />
 ): (
 <>
 <div className="absolute inset-0 opacity-20 grid grid-cols-8 grid-rows-8 gap-1 p-4">
 {Array.from({ length: 64 }).map((_, i) => (
 <div
 key={i}
 className={`rounded-sm ${[5, 6, 13, 14, 21, 22, 28, 29, 36, 37].includes(i)? "bg-primary": "bg-transparent"}`}
 />
 ))}
 </div>
 <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
 <Icon className="h-8 w-8" />
 </div>
 </>
 )}
 <Badge className={`absolute top-4 right-4 ${meta.color}`}>ویژه</Badge>
 </div>
 <div className="p-6 flex flex-col">
 <div className="flex items-center gap-2 mb-3">
 <Badge variant="secondary" className={meta.color}>
 <Icon className="h-3 w-3 ml-1" />
 {meta.label}
 </Badge>
 <span className="text-xs text-muted-foreground flex items-center gap-1">
 <Clock className="h-3 w-3" />
 {toPersianDigits(post.readingTime)} دقیقه مطالعه
 </span>
 <span className="text-xs text-muted-foreground flex items-center gap-1">
 <Calendar className="h-3 w-3" />
 {formatJalali(post.publishedAt)}
 </span>
 </div>
 <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 leading-tight">
 {post.title}
 </h2>
 <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-4 line-clamp-3">
 {post.excerpt || ""}
 </p>
 <div className="flex items-center justify-between pt-4 border-t border-border">
 <div className="flex items-center gap-2">
 <Avatar className="h-8 w-8">
 <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
 ه‌ح
 </AvatarFallback>
 </Avatar>
 <div>
 <p className="text-xs font-medium text-foreground leading-tight">تیم هوش</p>
 <p className="text-[10px] text-muted-foreground leading-tight">{formatJalali(post.publishedAt)}</p>
 </div>
 </div>
 <Button size="sm">
 ادامه مطلب
 <ArrowLeft className="h-3.5 w-3.5 mr-1" />
 </Button>
 </div>
 </div>
 </div>
 </a>
 </Card>
 );
}

function PostCard({ post }: { post: Post }) {
 const meta = CATEGORY_META[post.category as keyof typeof CATEGORY_META] || {
 label: "مقاله",
 icon: BookOpen,
 color: "bg-primary/10 text-primary",
 };
 const Icon = meta.icon;
 return (
 <Card className="overflow-hidden card-hover flex flex-col">
 <a href={`/blog/${post.slug}`} className="flex flex-col flex-1">
 {/* تصویر */}
 <div className="relative h-36 bg-gradient-to-br from-primary/12 via-primary/4 to-background flex items-center justify-center">
 {post.coverImage? (
 <img
 src={post.coverImage}
 alt={post.title}
 className="absolute inset-0 h-full w-full object-cover"
 />
 ): (
 <>
 <div className="absolute inset-0 opacity-15 grid grid-cols-6 grid-rows-4 gap-1 p-2">
 {Array.from({ length: 24 }).map((_, i) => (
 <div
 key={i}
 className={`rounded-sm ${[2, 3, 8, 9, 14, 15].includes(i)? "bg-primary": "bg-transparent"}`}
 />
 ))}
 </div>
 <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 </>
 )}
 <Badge className={`absolute top-3 right-3 ${meta.color}`}>
 {meta.label}
 </Badge>
 </div>
 <div className="p-5 flex flex-col flex-1">
 <h3 className="text-base font-semibold text-foreground leading-tight mb-2 line-clamp-2">
 {post.title}
 </h3>
 <p className="text-xs text-muted-foreground leading-relaxed mb-4 line-clamp-3 flex-1">
 {post.excerpt || ""}
 </p>
 <div className="flex items-center justify-between pt-3 border-t border-border">
 <div className="flex items-center gap-2 min-w-0">
 <Avatar className="h-7 w-7 shrink-0">
 <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
 ه‌ح
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-foreground leading-tight truncate">تیم هوش</p>
 <p className="text-[10px] text-muted-foreground leading-tight">{formatJalali(post.publishedAt)}</p>
 </div>
 </div>
 <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
 <Clock className="h-3 w-3" />
 {toPersianDigits(post.readingTime)} دقیقه
 </span>
 </div>
 </div>
 </a>
 </Card>
 );
}
