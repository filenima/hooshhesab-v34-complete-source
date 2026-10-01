import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ChevronLeft,
  Sparkles,
  Play,
  Clock,
  Youtube,
  MonitorPlay,
  ExternalLink,
  Podcast,
  BadgeCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { SITE_URL } from "@/lib/seo";
import { toPersianDigits } from "@/lib/persian";
import { getMediaChannels } from "@/lib/system-settings";
import { getPodcastEpisodes, PODCAST_PUBLISH_STEPS } from "@/lib/hub-content/podcasts";
import { hubNavLinks } from "@/lib/hub-content/shared";

// /podcasts — هاب پادکست و ویدیوهای کوتاه هوش (#15، v34-5)
// صفحهٔ عمومی و ایندکس‌پذیر: قسمت‌ها از مقالات بلاگ مشتق می‌شوند و اسلات‌های
// انتشار (یوتیوب/آپارات) از تنظیمات سوپرادمین خوانده می‌شوند.

const title = "پادکست و ویدیوهای کوتاه هوش | حسابداری برای مدیران";
const description =
  "پادکست و ویدیوهای کوتاه هوش — هر قسمت از یک مقالهٔ کامل حسابداری، مالیات و سامانه مودیان مشتق شده است؛ ۵ تا ۱۸ دقیقه برای مدیران و حسابداران کسب‌وکارهای ایرانی. انتشار در یوتیوب و آپارات.";
const url = `${SITE_URL}/podcasts`;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("پادکست و ویدیوهای هوش", brand))}&type=listing`;
  return {
    title: interpolateBrand(title, brand),
    description: interpolateBrand(description, brand),
    keywords: [
      "پادکست حسابداری",
      "پادکست مالیات",
      "ویدیو آموزش حسابداری",
      "پادکست سامانه مودیان",
      "پادکست کسب و کار",
      "هوش",
    ].map((k) => interpolateBrand(k, brand)),
    alternates: { canonical: url },
    openGraph: {
      title: interpolateBrand(title, brand),
      description: interpolateBrand(description, brand),
      url,
      type: "website",
      locale: "fa_IR",
      siteName: interpolateBrand("هوش", brand),
      images: [{ url: ogImage, width: 1200, height: 630, alt: interpolateBrand(title, brand) }],
    },
    twitter: {
      card: "summary_large_image",
      title: interpolateBrand(title, brand),
      description: interpolateBrand(description, brand),
      images: [ogImage],
    },
    robots: { index: true, follow: true },
  };
}

export default async function PodcastsPage() {
  const brand = await getBrandName();
  const [episodes, channels] = await Promise.all([
    getPodcastEpisodes(),
    getMediaChannels(),
  ]);
  const publishedEpisodes = episodes.filter((e) => e.status === "published");
  const upcomingEpisodes = episodes.filter((e) => e.status === "upcoming");

  // اسلات یوتیوب — پخش‌کنندهٔ «آخرین ویدیوهای کانال» از شناسهٔ UC
  const ytChannelId = channels.youtubeChannelId;
  const ytEmbedUrl =
    ytChannelId.startsWith("UC") && ytChannelId.length > 2
      ? `https://www.youtube.com/embed/videoseries?list=UU${ytChannelId.slice(2)}`
      : null;
  const aparatProfileUrl = channels.aparatUsername
    ? `https://www.aparat.com/${channels.aparatUsername}`
    : null;
  // راهنمای انتشار وقتی نمایش داده می‌شود که دست‌کم یک اسلات خالی باشد
  const showPublishGuide = !ytEmbedUrl || !aparatProfileUrl;

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
            <ArrowRight className="h-4 w-4" />
            صفحه اصلی
          </Link>
          <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">پادکست و ویدیو</span>
          </nav>

          {/* هیرو */}
          <section className="mb-10">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Podcast className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">
                  پادکست و ویدیوهای کوتاه {interpolateBrand("هوش", brand)}
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  هر قسمت از یک مقالهٔ کامل حسابداری مشتق شده است — از مالیات و سامانه مودیان تا
                  قیمت‌گذاری و گردش کالا؛ برای شنیدن در مسیر یا تماشا در ۵ تا ۱۸ دقیقه
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {toPersianDigits(publishedEpisodes.length)} قسمت منتشرشده
              </Badge>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">
                {toPersianDigits(upcomingEpisodes.length)} قسمت به‌زودی
              </Badge>
            </div>
          </section>

          {/* قسمت‌ها */}
          {episodes.length === 0 ? (
            <Card className="mb-10">
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  هنوز قسمتی ثبت نشده است — قسمت‌های اول به‌زودی از همین صفحه منتشر می‌شوند.
                </p>
              </CardContent>
            </Card>
          ) : (
            <section aria-label="قسمت‌های پادکست" className="mb-12 grid gap-4 sm:grid-cols-2">
              {episodes.map((ep) => {
                const inner = (
                  <>
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                      {ep.coverImage ? (
                        <Image
                          src={ep.coverImage}
                          alt={ep.title}
                          fill
                          sizes="(max-width: 640px) 100vw, 400px"
                          className="object-cover"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" aria-hidden="true" />
                      {/* دکمهٔ پخش — نماد بصری (پخش در صفحهٔ مقاله/کانال) */}
                      <span
                        className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                        aria-hidden="true"
                      >
                        <Play className="h-5 w-5" />
                      </span>
                      {ep.status === "upcoming" && (
                        <span className="absolute top-2 left-2">
                          <Badge className="bg-amber-500 text-white text-[10px]">به‌زودی</Badge>
                        </span>
                      )}
                    </div>
                    <CardHeader className="p-4 pb-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{ep.categoryLabel}</Badge>
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          حدود {toPersianDigits(ep.durationMin)} دقیقه
                        </span>
                      </div>
                      <CardTitle className="mt-2 line-clamp-2 text-sm font-bold leading-relaxed">
                        {ep.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0">
                      {ep.description ? (
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {ep.description}
                        </p>
                      ) : null}
                    </CardContent>
                  </>
                );
                return ep.status === "published" ? (
                  <Link
                    key={ep.slug}
                    href={`/blog/${ep.slug}`}
                    prefetch={false}
                    className="group"
                    aria-label={`شنیدن قسمت: ${ep.title}`}
                  >
                    <Card className="h-full overflow-hidden transition-all group-hover:border-primary/30 group-hover:shadow-md">
                      {inner}
                    </Card>
                  </Link>
                ) : (
                  <Card key={ep.slug} className="h-full overflow-hidden opacity-80" aria-label={`قسمت به‌زودی: ${ep.title}`}>
                    {inner}
                  </Card>
                );
              })}
            </section>
          )}

          {/* اسلات‌های انتشار: یوتیوب و آپارات */}
          <section aria-label="انتشار در یوتیوب و آپارات" className="mb-12">
            <h2 className="mb-4 text-lg font-bold text-foreground">انتشار در یوتیوب و آپارات</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* یوتیوب */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Youtube className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                    <CardTitle className="text-base">کانال یوتیوب</CardTitle>
                  </div>
                  <CardDescription className="text-xs leading-relaxed">
                    قسمت‌های ویدیویی با تصویر و جدول‌های هر مقاله
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {ytEmbedUrl ? (
                    <div className="aspect-video w-full overflow-hidden rounded-lg border border-border">
                      <iframe
                        src={ytEmbedUrl}
                        title="آخرین قسمت‌های یوتیوب هوش"
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 text-center">
                      <MonitorPlay className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                      <p className="text-xs font-medium text-muted-foreground">به‌زودی</p>
                      <p className="text-[10px] text-muted-foreground">
                        کانال یوتیوب در حال راه‌اندازی است
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* آپارات */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <MonitorPlay className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    <CardTitle className="text-base">صفحهٔ آپارات</CardTitle>
                  </div>
                  <CardDescription className="text-xs leading-relaxed">
                    همان قسمت‌ها برای پخش بدون فیلترشکن — در آپارات
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {aparatProfileUrl ? (
                    <a
                      href={aparatProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 transition-colors hover:bg-emerald-100/60 dark:border-emerald-900 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
                    >
                      <BadgeCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <p className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        مشاهدهٔ قسمت‌ها در آپارات
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </p>
                      <p className="text-[10px] text-muted-foreground" dir="ltr">
                        aparat.com/{channels.aparatUsername}
                      </p>
                    </a>
                  ) : (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 text-center">
                      <MonitorPlay className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                      <p className="text-xs font-medium text-muted-foreground">به‌زودی</p>
                      <p className="text-[10px] text-muted-foreground">
                        صفحهٔ آپارات در حال راه‌اندازی است
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* راهنمای صادقانهٔ انتشار — وقتی دست‌کم یک اسلات خالی است */}
            {showPublishGuide && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    چگونه قسمت‌ها را در یوتیوب و آپارات منتشر کنیم؟
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    چهار گام عملی — محتوای هر قسمت همین حالا در مقاله‌های بلاگ آماده است
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3">
                    {PODCAST_PUBLISH_STEPS.map((step, i) => (
                      <li key={step.title} className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {toPersianDigits(i + 1)}
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{step.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}
          </section>

          {/* Hub nav */}
          <div className="mt-10 border-t border-border pt-8">
            <h2 className="text-lg font-bold text-foreground">
              {interpolateBrand("ادامهٔ مسیر شما در هوش", brand)}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {hubNavLinks("/podcasts").map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  prefetch={false}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5"
                >
                  {interpolateBrand(l.title, brand)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
          <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">
            صفحه اصلی
          </Link>
        </div>
      </footer>
    </div>
  );
}
