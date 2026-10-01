// ============================================================
// /embed/tax-calculator — ویجت قابل embed ماشین‌حساب مالیات (v27)
// ============================================================
// برای سایت‌های شرکا: حسابداران، مشاوران مالی، پرتال‌های استخدام و صنفی:
//   <iframe src="https://SITE/embed/tax-calculator" style="width:100%;height:620px;border:0" loading="lazy" title="ماشین‌حساب مالیات ۱۴۰۴"></iframe>
//
// - بدون chrome سایت — فقط هدر مینیمال برند
// - برندینگ وایت‌لبل از SystemSettings
// - noindex — ابزار است نه صفحهٔ محتوایی مستقل
// - postMessage ارتفاع خودکار (hoosh:tax-calc:height)

import type { Metadata } from "next";
import { getBrandingSettings } from "@/lib/system-settings";
import { getAppBaseUrl } from "@/lib/app-url";
import { TaxCalculatorWidget } from "@/components/embed/tax-calculator-widget";
import { parseAccentColor } from "@/lib/embed-theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ماشین‌حساب مالیات ۱۴۰۴ — ویجت",
  robots: { index: false, follow: false },
};

export default async function TaxCalculatorEmbedPage({
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
      <TaxCalculatorWidget
        appBaseUrl={baseUrl || "https://hoosh.nobatime.ir"}
        brandName={branding?.appName || "هوش"}
        logoUrl={branding?.logoUrl || undefined}
        accentColor={parseAccentColor(params?.color)}
      />
    </main>
  );
}
