// ============================================================
// /embed/plan-quiz — ویجت قابل embed کیویز انتخاب پلن
// ============================================================
// برای سایت‌های شرکا، وبلاگ‌نویسان و بازاریاب‌های همکار (رفرال):
//   <iframe src="https://SITE/embed/plan-quiz" style="width:100%;height:560px;border:0" loading="lazy" title="کیویز انتخاب پلن هوش"></iframe>
//
// - بدون chrome سایت (هدر/فوتر اصلی) — فقط هدر مینیمال برند
// - برندینگ وایت‌لبل از SystemSettings (نام/لوگو/دامنه)
// - noindex — صفحهٔ ابزار است نه صفحهٔ محتوایی مستقل
// - پارامتر ?quiz=XXXX همان رفتار صفحهٔ اصلی را دارد (بازیابی نتیجهٔ اشتراکی)

import type { Metadata } from "next";
import { getBrandingSettings } from "@/lib/system-settings";
import { getAppBaseUrl } from "@/lib/app-url";
import { PlanQuizWidget } from "@/components/embed/plan-quiz-widget";
import { parseAccentColor } from "@/lib/embed-theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "کیویز انتخاب پلن — ویجت",
  robots: { index: false, follow: false },
};

export default async function PlanQuizEmbedPage({
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
      <PlanQuizWidget
        appBaseUrl={baseUrl || "https://hoosh.nobatime.ir"}
        brandName={branding?.appName || "هوش"}
        logoUrl={branding?.logoUrl || undefined}
        accentColor={parseAccentColor(params?.color)}
      />
    </main>
  );
}
