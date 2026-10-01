import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getFeatureFlagAsync, getUserContextFromRequest } from "@/lib/feature-flags";

export const runtime = "nodejs";

// GET /api/platform/feature-flags/evaluate?name=FLAG_NAME
// ارزیابی فلگ برای کاربر فعلی (با Authorization header)
// این endpoint برای client-side استفاده می‌شود (مثلاً برای فعال/غیرفعال کردن UI)
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const name = searchParams.get("name");

 if (!name) {
 return NextResponse.json(
 { success: false, error: "پارامتر name الزامی است" },
 { status: 400 }
 );
 }

 // برای کاربران معمولی — احراز هویت user
 const authHeader = req.headers.get("authorization");
 const userContext = await getUserContextFromRequest(authHeader);

 // اگر کاربر احراز نشده باشد — برای فلگ‌های عمومی (بدون conditions) هم ارزیابی می‌کنیم
 // اما برای امنیت بیشتر، نیاز به توکن داریم
 if (!userContext) {
 // سوپرادمین هم می‌تواند بدون user context ارزیابی کند
 const adminAuth = await requireSuperAdmin(req);
 if ("error" in adminAuth) {
 return adminAuth.error;
 }
 // admin sees flag as-is (without rollout)
 const result = await getFeatureFlagAsync(name);
 return NextResponse.json({
 success: true,
 data: { name, enabled: result, evaluatedAs: "admin" },
 });
 }

 // ارزیابی فلگ برای این کاربر
 const enabled = await getFeatureFlagAsync(name, userContext.userId, {
 plan: userContext.plan,
 role: userContext.role,
 tenantId: userContext.tenantId,
 });

 return NextResponse.json({
 success: true,
 data: {
 name,
 enabled,
 evaluatedAs: "user",
 userId: userContext.userId,
 },
 });
 } catch (error) {
 console.error("Feature flag evaluate error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ارزیابی فلگ" },
 { status: 500 }
 );
 }
}
