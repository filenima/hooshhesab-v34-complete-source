import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

/**
 * GET /api/platform/ip-allowlist
 * لیست IPهای مجاز برای ورود سوپرادمین.
 *
 * پاسخ: { items: IpWhitelist[], allowlistEnabled: boolean }
 * allowlistEnabled = true اگر حداقل یک رکورد فعال وجود داشته باشد.
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const items = await db.ipWhitelist.findMany({
 where: { isActive: true },
 orderBy: { createdAt: "desc" },
 });

 return NextResponse.json({
 success: true,
 data: {
 items: items.map((i) => ({
 id: i.id,
 ipAddress: i.ipAddress,
 label: i.label || "",
 isActive: i.isActive,
 addedBy: i.addedBy || null,
 createdAt: i.createdAt.toISOString(),
 })),
 allowlistEnabled: items.length > 0,
 },
 });
 } catch (error) {
 console.error("Get IP allowlist error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت لیست IP" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/platform/ip-allowlist
 * body: { ipAddress, label? }
 * افزودن یک IP به لیست سفید سوپرادمین.
 */
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const ipAddress = String(body?.ipAddress || "").trim();
 const label = String(body?.label || "").trim() || null;

 if (!ipAddress) {
 return NextResponse.json(
 { success: false, error: "آدرس IP الزامی است" },
 { status: 400 }
 );
 }

 // اعتبارسنجی ساده‌ی فرمت IP (IPv4 یا IPv6)
 const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
 const ipv6Regex = /^([0-9a-fA-F:]+)$/;
 if (!ipv4Regex.test(ipAddress) &&!ipv6Regex.test(ipAddress)) {
 return NextResponse.json(
 { success: false, error: "فرمت IP نامعتبر است" },
 { status: 400 }
 );
 }

 // برای IPv4، اعتبارسنجی محدوده‌ی هر octet
 if (ipv4Regex.test(ipAddress)) {
 const parts = ipAddress.split(".").map(Number);
 if (parts.some((p) => p < 0 || p > 255)) {
 return NextResponse.json(
 { success: false, error: "محدوده‌ی IP نامعتبر است" },
 { status: 400 }
 );
 }
 }

 const item = await db.ipWhitelist.upsert({
 where: { ipAddress },
 update: { label, isActive: true, addedBy: auth.admin.id },
 create: {
 ipAddress,
 label,
 isActive: true,
 addedBy: auth.admin.id,
 },
 });

 try {
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "ADD_IP_ALLOWLIST",
 entity: "IpWhitelist",
 entityId: item.id,
 details: JSON.stringify({ ipAddress, label }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: {
 id: item.id,
 ipAddress: item.ipAddress,
 label: item.label || "",
 isActive: item.isActive,
 createdAt: item.createdAt.toISOString(),
 },
 message: `IP ${ipAddress} به لیست سفید اضافه شد.`,
 });
 } catch (error) {
 console.error("Add IP allowlist error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در افزودن IP" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/platform/ip-allowlist?id=...
 * حذف یک IP از لیست سفید.
 */
export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه الزامی است" },
 { status: 400 }
 );
 }

 const existing = await db.ipWhitelist.findUnique({ where: { id } });
 if (!existing) {
 return NextResponse.json(
 { success: false, error: "رکورد یافت نشد" },
 { status: 404 }
 );
 }

 await db.ipWhitelist.delete({ where: { id } });

 try {
 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "REMOVE_IP_ALLOWLIST",
 entity: "IpWhitelist",
 entityId: id,
 details: JSON.stringify({ ipAddress: existing.ipAddress }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 message: `IP ${existing.ipAddress} از لیست سفید حذف شد.`,
 });
 } catch (error) {
 console.error("Delete IP allowlist error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف IP" },
 { status: 500 }
 );
 }
}
