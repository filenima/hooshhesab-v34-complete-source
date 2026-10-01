// ============================================================
// /embed/depreciation-calculator — ویجت قابل embed استهلاک (v34)
// ============================================================
// ویجت هفتم کانال شرکا — ماشین‌حساب استهلاک دارایی (مستقیم و نزولی)
// برای حسابداران، مشاوران مالی و سایت‌های صنعتی:
//   <iframe src="https://SITE/embed/depreciation-calculator" style="width:100%;height:820px;border:0" loading="lazy" title="ماشین‌حساب استهلاک"></iframe>
//
// - بدون chrome سایت — هدر مینیمال برند + برندینگ وایت‌لبل
// - noindex — ابزار است نه صفحهٔ محتوایی مستقل
// - postMessage ارتفاع خودکار (hoosh:depreciation:height)

import type { Metadata } from "next";
import { getBrandingSettings } from "@/lib/system-settings";
import { getAppBaseUrl } from "@/lib/app-url";
import { DepreciationCalculatorWidget } from "@/components/embed/depreciation-calculator-widget";
import { parseAccentColor } from "@/lib/embed-theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ماشین‌حساب استهلاک — ویجت",
  robots: { index: false, follow: false },
};

export default async function DepreciationCalculatorEmbedPage({
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
      <DepreciationCalculatorWidget
        appBaseUrl={baseUrl || "https://hoosh.nobatime.ir"}
        brandName={branding?.appName || "هوش"}
        logoUrl={branding?.logoUrl || undefined}
        accentColor={parseAccentColor(params?.color)}
      />
    </main>
  );
}
