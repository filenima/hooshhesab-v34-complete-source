import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";
import { saveSettings, invalidateSettingsCache, SETTING_KEYS } from "@/lib/system-settings";

export const runtime = "nodejs";

// GET /api/platform/settings/branding — دریافت تنظیمات برندینگ
// ذخیره‌سازی با کلیدهای prefixed در SystemSettings (مدل ستون category ندارد)
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const keys = [
 SETTING_KEYS.BRANDING_APP_NAME,
 SETTING_KEYS.BRANDING_SITE_NAME,
 SETTING_KEYS.BRANDING_PRIMARY_COLOR,
 SETTING_KEYS.BRANDING_LOGO_URL,
 SETTING_KEYS.BRANDING_FOOTER_TEXT,
 SETTING_KEYS.BRANDING_DOMAIN,
 ];
 const rows = await db.systemSettings.findMany({ where: { key: { in: keys } } });
 const map: Record<string, string> = {};
 for (const r of rows) map[r.key] = r.value;

 return NextResponse.json({
 success: true,
 data: {
 appName: map[SETTING_KEYS.BRANDING_APP_NAME] || "هوش",
 siteName: map[SETTING_KEYS.BRANDING_SITE_NAME] || "",
 primaryColor: map[SETTING_KEYS.BRANDING_PRIMARY_COLOR] || "#10b981",
 logoUrl: map[SETTING_KEYS.BRANDING_LOGO_URL] || "",
 footerText: map[SETTING_KEYS.BRANDING_FOOTER_TEXT] || "",
 domain: map[SETTING_KEYS.BRANDING_DOMAIN] || "hoosh.nobatime.ir",
 },
 });
 } catch (error) {
 console.error("Branding settings GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت تنظیمات برندینگ" },
 { status: 500 }
 );
 }
}

// PATCH /api/platform/settings/branding — ذخیره تنظیمات برندینگ
// body: { branding: { appName?, siteName?, primaryColor?, logoUrl?, footerText?, domain? } }
// فیلدهای اختیاری (siteName/logoUrl/footerText) با رشته‌ی خالی پاک می‌شوند
// تا مقدار پیش‌فرض برند اعمال شود (مثلاً حذف لوگوی سفارشی).
export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const body = await req.json().catch(() => ({}));
 const branding = (body.branding && typeof body.branding === "object"? body.branding: body) as Record<string, unknown>;

 const fieldMap: Array<{ key: string; max: number; clearable?: boolean }> = [
 { key: SETTING_KEYS.BRANDING_APP_NAME, max: 100 },
 { key: SETTING_KEYS.BRANDING_SITE_NAME, max: 100, clearable: true },
 { key: SETTING_KEYS.BRANDING_PRIMARY_COLOR, max: 32 },
 { key: SETTING_KEYS.BRANDING_LOGO_URL, max: 500, clearable: true },
 { key: SETTING_KEYS.BRANDING_FOOTER_TEXT, max: 300, clearable: true },
 { key: SETTING_KEYS.BRANDING_DOMAIN, max: 255 },
 ];

 const updates: Array<{ key: string; value: string }> = [];
 const clears: string[] = [];
 for (const f of fieldMap) {
 const shortKey = f.key.replace("branding_", "");
 const camel = shortKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
 const raw = branding[camel]?? branding[shortKey];
 if (typeof raw!== "string") continue;
 const val = raw.trim().slice(0, f.max);
 if (val) {
 // نرمال‌سازی دامنه — پروتکل/اسلش اضافه حذف شود
 updates.push({
 key: f.key,
 value: f.key === SETTING_KEYS.BRANDING_DOMAIN
? val.replace(/^[a-zA-Z]+:\/\//, "").replace(/\/+$/, "")
: val,
 });
 } else if (f.clearable) {
 // مقدار خالی برای فیلد اختیاری → حذف تنظیم و بازگشت به پیش‌فرض
 clears.push(f.key);
 }
 }

 if (updates.length === 0 && clears.length === 0) {
 return NextResponse.json(
 { success: false, error: "تغییری برای اعمال نیست" },
 { status: 400 }
 );
 }

 if (updates.length > 0) {
 await saveSettings(updates);
 } else {
 invalidateSettingsCache();
 }
 if (clears.length > 0) {
 await db.systemSettings.deleteMany({ where: { key: { in: clears } } });
 invalidateSettingsCache();
 }

 await db.platformAuditLog.create({
 data: {
 superAdminId: admin.id,
 action: "UPDATE_BRANDING_SETTINGS",
 entity: "SystemSettings",
 details: JSON.stringify([
 ...updates.map((u) => ({ key: u.key })),
 ...clears.map((k) => ({ key: k, cleared: true })),
 ]),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 }).catch(() => {
 // ignore audit log failure
 });

 return NextResponse.json({
 success: true,
 message: "تنظیمات برندینگ با موفقیت ذخیره شد",
 });
 } catch (error) {
 console.error("Branding settings PATCH error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ذخیره تنظیمات برندینگ" },
 { status: 500 }
 );
 }
}
