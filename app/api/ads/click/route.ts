import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ POST /api/ads/click — ثبت کلیک روی تبلیغ ============
// body: { id } یا query ?id= — کلیک را برای تبلیغ فعال ثبت می‌کند.
export async function POST(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;

 try {
 // id از بدنه یا query (sendBeacon با query راحت‌تر است)
 let id = "";
 try {
 const body = await req.json().catch(() => null);
 if (body?.id) id = String(body.id);
 } catch {
 // بدنه خالی — sendBeacon گاهی body نمی‌فرستد
 }
 if (!id) {
 const { searchParams } = new URL(req.url);
 id = searchParams.get("id") || "";
 }

 if (!id || id.length > 100) {
 return NextResponse.json({ success: false, error: "شناسه تبلیغ نامعتبر است" }, { status: 400 });
 }

 // فقط اگر تبلیغ فعال باشد بشمار (جلوگیری از تقلب با آی‌دی خاموش/حذف‌شده)
 const result = await db.advertisement.updateMany({
 where: { id, active: true },
 data: { clicks: { increment: 1 } },
 });

 if (result.count === 0) {
 return NextResponse.json({ success: false, error: "تبلیغ یافت نشد یا غیرفعال است" }, { status: 404 });
 }

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("[ads/click POST]", error);
 return NextResponse.json({ success: false, error: "خطا در ثبت کلیک" }, { status: 500 });
 }
}
