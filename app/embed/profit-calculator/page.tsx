// ============================================================
// /embed/profit-calculator — ویجت قابل embed سود و حاشیه سود (v34)
// ============================================================
// ویجت ششم کانال شرکا — ماشین‌حساب سود/حاشیه سود و نقطهٔ سربه‌سر برای
// سایت‌های کسب‌وکار، استارتاپ و مشاوران مالی:
//   <iframe src="https://SITE/embed/profit-calculator" style="width:100%;height:760px;border:0" loading="lazy" title="ماشین‌حساب سود و حاشیه سود"></iframe>
//
// - بدون chrome سایت — هدر مینیمال برند + برندینگ وایت‌لبل
// - noindex — ابزار است نه صفحهٔ محتوایی مستقل
// - postMessage ارتفاع خودکار (hoosh:profit:height)

import type { Metadata } from "next";
import { getBrandingSettings } from "@/lib/system-settings";
import { getAppBaseUrl } from "@/lib/app-url";
import { ProfitCalculatorWidget } from "@/components/embed/profit-calculator-widget";
import { parseAccentColor } from "@/lib/embed-theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ماشین‌حساب سود و حاشیه سود — ویجت",
  robots: { index: false, follow: false },
};

export default async function ProfitCalculatorEmbedPage({
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
      <ProfitCalculatorWidget
        appBaseUrl={baseUrl || "https://hoosh.nobatime.ir"}
        brandName={branding?.appName || "هوش"}
        logoUrl={branding?.logoUrl || undefined}
        accentColor={parseAccentColor(params?.color)}
      />
    </main>
  );
}
