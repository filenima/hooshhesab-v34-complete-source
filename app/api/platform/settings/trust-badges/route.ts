import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getTrustBadges, saveTrustBadges, sanitizeTrustBadgeHtml } from "@/lib/system-settings";

export const runtime = "nodejs";

interface BadgeInput {
 id?: string;
 title?: string;
 html?: string;
 enabled?: boolean;
}

// GET /api/platform/settings/trust-badges — دریافت همه نمادها (سوپرادمین)
export async function GET(req: NextRequest) {
 try {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const badges = await getTrustBadges();
 return NextResponse.json({ success: true, data: badges });
 } catch (error) {
 console.error("Trust badges admin GET error:", error);
 return NextResponse.json({ success: false, error: "خطا در دریافت نمادها" }, { status: 500 });
 }
}

// POST /api/platform/settings/trust-badges — ذخیره کل لیست نمادها (سوپرادمین)
// body: { badges: [{ id?, title, html, enabled? }] }
export async function POST(req: NextRequest) {
 try {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const body = (await req.json().catch(() => null)) as { badges?: BadgeInput[] } | null;
 if (!body || !Array.isArray(body.badges)) {
 return NextResponse.json(
 { success: false, error: "ساختار درخواست نامعتبر — آرایه‌ی badges الزامی است" },
 { status: 400 }
 );
 }
 if (body.badges.length > 12) {
 return NextResponse.json(
 { success: false, error: "حداکثر ۱۲ نماد مجاز است" },
 { status: 400 }
 );
 }

 // اعتبارسنجی تک‌تک کدها — هر ردیف نامعتبر → خطای دقیق با شماره ردیف
 const validated = body.badges.map((b, i) => {
 const check = sanitizeTrustBadgeHtml(String(b.html || ""));
 if (!check.ok) {
 throw new Error(`نماد ${i + 1} («${b.title || "بدون عنوان"}»): ${check.reason}`);
 }
 return {
 id: String(b.id || `badge-${i}-${Date.now().toString(36)}`),
 title: String(b.title || "").slice(0, 80),
 html: check.html,
 placement: "footer" as const,
 enabled: b.enabled !== false,
 };
 });

 await saveTrustBadges(validated);
 return NextResponse.json({ success: true, data: validated });
 } catch (error) {
 const message =
 error instanceof Error ? error.message : "خطا در ذخیره نمادها";
 console.error("Trust badges admin POST error:", error);
 return NextResponse.json({ success: false, error: message }, { status: 400 });
 }
}
