// ============================================================
// /embed/payroll-calculator — ویجت قابل embed حقوق و دستمزد (v29)
// ============================================================
// ویجت پنجم کانال شرکا — ماشین‌حساب فیش حقوقی ۱۴۰۴ برای
// سایت‌های جذب نیرو/HR، حسابداران و پرتال‌های صنفی:
//   <iframe src="https://SITE/embed/payroll-calculator" style="width:100%;height:680px;border:0" loading="lazy" title="ماشین‌حساب حقوق و دستمزد ۱۴۰۴"></iframe>
//
// - بدون chrome سایت — هدر مینیمال برند + برندینگ وایت‌لبل
// - noindex — ابزار است نه صفحهٔ محتوایی مستقل
// - postMessage ارتفاع خودکار (hoosh:payroll:height)

import type { Metadata } from "next";
import { getBrandingSettings } from "@/lib/system-settings";
import { getAppBaseUrl } from "@/lib/app-url";
import { PayrollCalculatorWidget } from "@/components/embed/payroll-calculator-widget";
import { parseAccentColor } from "@/lib/embed-theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ماشین‌حساب حقوق و دستمزد ۱۴۰۴ — ویجت",
  robots: { index: false, follow: false },
};

export default async function PayrollCalculatorEmbedPage({
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
      <PayrollCalculatorWidget
        appBaseUrl={baseUrl || "https://hoosh.nobatime.ir"}
        brandName={branding?.appName || "هوش"}
        logoUrl={branding?.logoUrl || undefined}
        accentColor={parseAccentColor(params?.color)}
      />
    </main>
  );
}
