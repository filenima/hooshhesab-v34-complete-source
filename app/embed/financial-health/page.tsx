// ============================================================
// /embed/financial-health — ویجت قابل embed سنجش سریع سلامت مالی (v28)
// ============================================================
// برای سایت‌های شرکا، حسابداران و پرتال‌های صنفی:
//   <iframe src="https://SITE/embed/financial-health" style="width:100%;height:640px;border:0" loading="lazy" title="سنجش سلامت مالی هوش"></iframe>
//
// - نسخهٔ ۵ پرسشی فشردهٔ ابزار کامل /financial-health
// - بدون chrome سایت (هدر/فوتر اصلی) — فقط هدر مینیمال برند
// - برندینگ وایت‌لبل از SystemSettings (نام/لوگو/دامنه)
// - noindex — صفحهٔ ابزار است نه صفحهٔ محتوایی مستقل
// - beacon آمار بازدید → تب «آمار ویجت‌ها» در پنل سوپرادمین

import type { Metadata } from "next";
import { getBrandingSettings } from "@/lib/system-settings";
import { getAppBaseUrl } from "@/lib/app-url";
import { FinancialHealthWidget } from "@/components/embed/financial-health-widget";
import { parseAccentColor } from "@/lib/embed-theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "سنجش سریع سلامت مالی — ویجت",
  robots: { index: false, follow: false },
};

export default async function FinancialHealthEmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [branding, baseUrl, params] = await Promise.all([
    getBrandingSettings().catch(() => null),
    getAppBaseUrl().catch(() => ""),
    searchParams,
  ]);

  return (
    <main className="min-h-screen bg-background">
      <FinancialHealthWidget
        appBaseUrl={baseUrl || "https://hoosh.nobatime.ir"}
        brandName={branding?.appName || "هوش"}
        logoUrl={branding?.logoUrl || undefined}
        accentColor={parseAccentColor(params?.color)}
      />
    </main>
  );
}
