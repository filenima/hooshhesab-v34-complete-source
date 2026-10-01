import { NextRequest, NextResponse } from "next/server";
import { recordWidgetView, trackingRequestFromNext } from "@/lib/widget-tracking";

// ============================================================
// POST/GET /api/widgets/track — beacon ثبت بازدید ویجت embed
// ============================================================
// سبک و fire-and-forget: ویجت‌های embed در سایت‌های میزبان، هنگام mount
// این endpoint را با ?widget=<type> صدا می‌زنند (ترجیحاً sendBeacon).
// referrer از هدر مرورگر خوانده می‌شود (دامنهٔ میزبان iframe).
//
// دفاع: whitelist ویجت + رد دامنه‌های خودی (بازدید مستقیم صفحهٔ embed
// خودمان آلودگی آمار شرکا نمی‌سازد — با host=direct جدا گزارش می‌شود)
// + سقف طول referrer. بدون احراز هویت (public beacon).
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const { widget, referrer } = trackingRequestFromNext(req);
  if (!widget) {
    return NextResponse.json({ success: false, error: "پارامتر widget الزامی است" }, { status: 400 });
  }
  const ok = await recordWidgetView({ widget, referrer });
  if (!ok) {
    return NextResponse.json({ success: false, error: "ویجت نامعتبر" }, { status: 400 });
  }
  // 204 سبک — beacon بدون انتظار پاسخ
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
