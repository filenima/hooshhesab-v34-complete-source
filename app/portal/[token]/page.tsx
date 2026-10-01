import type { Metadata } from "next";
import { PortalClient } from "@/components/portal/portal-client";

// هوش — صفحه‌ی عمومی پورتال مشتری/تأمین‌کننده
// مشتری با لینک اختصاصی وارد می‌شود و فاکتورها/صورت‌حساب خود را می‌بیند.
// این صفحه Server Component است و فقط توکن را به کلاینت می‌دهد.
export const dynamic = "force-dynamic";

// نکته سئو: لینک‌های حاوی توکن نباید ایندکس شوند — محتوای اختصاصی هر مشتری
// است و برای موتور جستجو ارزشی ندارد (خطای Duplicate/Thin content).
export const metadata: Metadata = {
 title: "پورتال مشتریان هوش",
 robots: { index: false, follow: false },
};

interface PageProps {
 params: Promise<{ token: string }>;
}

export default async function PortalPage({ params }: PageProps) {
 const { token } = await params;
 return <PortalClient token={token} />;
}
