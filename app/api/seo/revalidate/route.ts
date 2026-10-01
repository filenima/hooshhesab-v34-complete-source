import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

/**
 * POST /api/seo/revalidate — revalidation کش سئو
 *
 * این endpoint برای revalidate کردن sitemap، rss و صفحات بلاگ
 * استفاده می‌شود (مثلاً پس از انتشار یک مقاله جدید).
 *
 * امنیت: نیاز به secret token از header یا query دارد.
 * - Header: `x-revalidate-token` مطابق با env `REVALIDATE_SECRET`
 * - یا query: `?token=...`
 * - یا Authorization: Bearer <superadmin token> (برای دکمه‌های پنل سوپرادمین)
 *
 * body: { paths?: string[], tags?: string[] }
 * - paths: مسیرهای مشخص برای revalidate (مثلاً ["/blog", "/sitemap.xml"])
 * - tags: تگ‌های کش برای revalidate (مثلاً ["blog", "sitemap"])
 * - اگر چیزی داده نشود، sitemap + rss + صفحه‌ی بلاگ پیش‌فرض revalidate می‌شوند.
 */
export async function POST(req: NextRequest) {
 try {
 const token =
 req.headers.get("x-revalidate-token") ||
 new URL(req.url).searchParams.get("token");

 const expectedToken = process.env.REVALIDATE_SECRET;
 if (!expectedToken) {
 return NextResponse.json(
 { success: false, error: "REVALIDATE_SECRET تنظیم نشده است" },
 { status: 500 }
 );
 }

 let authorized = token === expectedToken;

 // Fallback: توکن سوپرادمین (Bearer) — برای دکمه‌های «پاک‌سازی کش» پنل GOD
 if (!authorized) {
 const authHeader = req.headers.get("authorization");
 if (authHeader?.startsWith("Bearer ")) {
 const auth = await requireSuperAdmin(req);
 authorized =!("error" in auth);
 }
 }

 if (!authorized) {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const { paths, tags } = (body || {}) as {
 paths?: string[];
 tags?: string[];
 };

 const revalidatedPaths: string[] = [];
 const revalidatedTags: string[] = [];
 const errors: string[] = [];

 // مسیرهای پیش‌فرض
 const defaultPaths = ["/blog", "/sitemap.xml", "/rss.xml", "/"];
 const targetPaths = paths && paths.length > 0? paths: defaultPaths;
 const defaultTags = ["blog", "sitemap"];
 const targetTags = tags && tags.length > 0? tags: defaultTags;

 for (const p of targetPaths) {
 try {
 revalidatePath(p);
 revalidatedPaths.push(p);
 } catch (e) {
 errors.push(`path ${p}: ${String(e).slice(0, 100)}`);
 }
 }

 for (const t of targetTags) {
 try {
 revalidateTag(t, "default");
 revalidatedTags.push(t);
 } catch (e) {
 errors.push(`tag ${t}: ${String(e).slice(0, 100)}`);
 }
 }

 return NextResponse.json({
 success: true,
 data: {
 revalidatedPaths,
 revalidatedTags,
 errors: errors.length > 0? errors: undefined,
 revalidatedAt: new Date().toISOString(),
 },
 message: `${revalidatedPaths.length} مسیر و ${revalidatedTags.length} تگ revalidate شد`,
 });
 } catch (error) {
 console.error("Revalidate error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در revalidation" },
 { status: 500 }
 );
 }
}

/**
 * GET /api/seo/revalidate — برای تست ساده (همان منطق POST با توکن از query)
 */
export async function GET(req: NextRequest) {
 return POST(req);
}
