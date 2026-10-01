import { NextRequest, NextResponse } from "next/server";
import { promises as dnsPromises } from "node:dns";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت دامنه‌ها از پنل سوپرادمین (۲۱-e — Feature ③) ============
// GET  → همه‌ی دامنه‌های همه tenantها (با نام tenant، فیلتر ?status=)
// POST → {id, action:"verify"|"approve"|"reject"|"primary"}
//   verify  = بررسی واقعی DNS (مثل سمت کاربر)
//   approve = تأیید دستی (وقتی DNS قابل بررسی نیست — تحریم/فایروال)
//   reject  = رد با یادداشت
//   primary = دامنه اصلی tenant کردن
// DELETE ?id= → حذف دامنه از پلتفرم

const TXT_PREFIX = "_hoosh-verify.";

function serialize(
 d: {
 id: string;
 domain: string;
 status: string;
 isPrimary: boolean;
 dnsTxtRecord: string | null;
 verificationToken: string;
 verifiedAt: Date | null;
 lastCheckedAt: Date | null;
 notes: string | null;
 createdAt: Date;
 tenantId: string;
 },
 tenantName?: string | null
) {
 return {
 id: d.id,
 domain: d.domain,
 status: d.status,
 isPrimary: d.isPrimary,
 dnsTxtRecord: d.dnsTxtRecord,
 verificationToken: d.verificationToken,
 txtName: `${TXT_PREFIX}${d.domain}`,
 verifiedAt: d.verifiedAt,
 lastCheckedAt: d.lastCheckedAt,
 notes: d.notes,
 createdAt: d.createdAt,
 tenantId: d.tenantId,
 tenantName: tenantName || null,
 };
}

// GET /api/platform/domains — همه دامنه‌ها
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const statusFilter = searchParams.get("status") || undefined;
 const q = (searchParams.get("q") || "").trim().toLowerCase();

 const domains = await db.tenantDomain.findMany({
 where: {
 ...(statusFilter && ["PENDING", "VERIFYING", "VERIFIED", "FAILED"].includes(statusFilter)
 ? { status: statusFilter }
 : {}),
 ...(q ? { domain: { contains: q } } : {}),
 },
 orderBy: [{ createdAt: "desc" }],
 include: { tenant: { select: { name: true } } },
 take: 500,
 });

 return NextResponse.json({
 success: true,
 data: domains.map((d) => serialize(d, d.tenant?.name)),
 });
 } catch (error) {
 console.error("Platform domains GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت دامنه‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/platform/domains — اکشن‌های سوپرادمین
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const body = (await req.json().catch(() => ({}))) as {
 id?: string;
 action?: string;
 notes?: string;
 };
 const id = String(body.id || "");
 const action = String(body.action || "");

 if (!id || !action) {
 return NextResponse.json(
 { success: false, error: "شناسه دامنه و اکشن الزامی است" },
 { status: 400 }
 );
 }

 const record = await db.tenantDomain.findUnique({ where: { id } });
 if (!record) {
 return NextResponse.json(
 { success: false, error: "دامنه یافت نشد" },
 { status: 404 }
 );
 }

 // ─── approve: تأیید دستی (force VERIFIED) ───
 if (action === "approve") {
 // اولین دامنه تأییدشده tenant → primary
 const hasPrimary = await db.tenantDomain.findFirst({
 where: { tenantId: record.tenantId, isPrimary: true, status: "VERIFIED", NOT: { id: record.id } },
 select: { id: true },
 });
 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: {
 status: "VERIFIED",
 verifiedAt: record.verifiedAt ?? new Date(),
 lastCheckedAt: new Date(),
 notes: `تأیید دستی توسط سوپرادمین (${admin.username})`,
 ...(hasPrimary ? {} : { isPrimary: true }),
 },
 include: { tenant: { select: { name: true } } },
 });

 await db.platformAuditLog
 .create({
 data: {
 superAdminId: admin.id,
 action: "DOMAIN_APPROVE",
 entity: "TenantDomain",
 entityId: record.id,
 details: JSON.stringify({ domain: record.domain, tenantId: record.tenantId }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 })
 .catch(() => {});

 return NextResponse.json({
 success: true,
 data: serialize(updated, updated.tenant?.name),
 message: `دامنه ${record.domain} به‌صورت دستی تأیید شد`,
 });
 }

 // ─── reject: رد دامنه ───
 if (action === "reject") {
 const note = String(body.notes || `رد شده توسط سوپرادمین (${admin.username})`).slice(0, 200);
 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: { status: "FAILED", notes: note },
 include: { tenant: { select: { name: true } } },
 });

 await db.platformAuditLog
 .create({
 data: {
 superAdminId: admin.id,
 action: "DOMAIN_REJECT",
 entity: "TenantDomain",
 entityId: record.id,
 details: JSON.stringify({ domain: record.domain, note }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 })
 .catch(() => {});

 return NextResponse.json({
 success: true,
 data: serialize(updated, updated.tenant?.name),
 message: `دامنه ${record.domain} رد شد`,
 });
 }

 // ─── primary: دامنه اصلی کردن ───
 if (action === "primary") {
 // بقیه primary های tenant خاموش می‌شوند
 await db.tenantDomain.updateMany({
 where: { tenantId: record.tenantId, isPrimary: true, NOT: { id: record.id } },
 data: { isPrimary: false },
 });
 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: { isPrimary: true },
 include: { tenant: { select: { name: true } } },
 });

 await db.platformAuditLog
 .create({
 data: {
 superAdminId: admin.id,
 action: "DOMAIN_PRIMARY",
 entity: "TenantDomain",
 entityId: record.id,
 details: JSON.stringify({ domain: record.domain }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 })
 .catch(() => {});

 return NextResponse.json({
 success: true,
 data: serialize(updated, updated.tenant?.name),
 message: `دامنه ${record.domain} دامنه اصلی سازمان شد`,
 });
 }

 // ─── verify: بررسی واقعی DNS (همان منطق کاربر، با دید سوپرادمین) ───
 if (action === "verify") {
 let txtRecords: string[][] = [];
 try {
 txtRecords = await dnsPromises.resolveTxt(`${TXT_PREFIX}${record.domain}`);
 } catch (dnsErr) {
 const code = (dnsErr as { code?: string }).code || "UNKNOWN";
 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: { lastCheckedAt: new Date(), notes: `dns_check_miss=${code}` },
 include: { tenant: { select: { name: true } } },
 });
 return NextResponse.json({
 success: true,
 data: serialize(updated, updated.tenant?.name),
 verified: false,
 message: `رکورد DNS هنوز منتشر نشده (کد ${code}) — چند دقیقه بعد دوباره بررسی کنید`,
 });
 }

 const expected = record.dnsTxtRecord || "";
 const flat = txtRecords.map((chunks) => chunks.join(""));
 if (flat.some((v) => v.includes(expected) || v === expected)) {
 const hasPrimary = await db.tenantDomain.findFirst({
 where: { tenantId: record.tenantId, isPrimary: true, status: "VERIFIED", NOT: { id: record.id } },
 select: { id: true },
 });
 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: {
 status: "VERIFIED",
 verifiedAt: new Date(),
 lastCheckedAt: new Date(),
 notes: null,
 ...(hasPrimary ? {} : { isPrimary: true }),
 },
 include: { tenant: { select: { name: true } } },
 });
 return NextResponse.json({
 success: true,
 data: serialize(updated, updated.tenant?.name),
 verified: true,
 message: `دامنه ${record.domain} از طریق DNS تأیید شد`,
 });
 }

 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: { lastCheckedAt: new Date(), notes: "txt_mismatch" },
 include: { tenant: { select: { name: true } } },
 });
 return NextResponse.json({
 success: true,
 data: serialize(updated, updated.tenant?.name),
 verified: false,
 message: "رکورد TXT پیدا شد اما مقدار آن مطابقت ندارد",
 });
 }

 return NextResponse.json(
 { success: false, error: "اکشن نامعتبر — از verify | approve | reject | primary استفاده کنید" },
 { status: 400 }
 );
 } catch (error) {
 console.error("Platform domains POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش درخواست دامنه" },
 { status: 500 }
 );
 }
}

// DELETE /api/platform/domains?id= — حذف دامنه توسط سوپرادمین
export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 const { admin } = auth;

 try {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه دامنه الزامی است" },
 { status: 400 }
 );
 }

 const record = await db.tenantDomain.findUnique({ where: { id } });
 if (!record) {
 return NextResponse.json(
 { success: false, error: "دامنه یافت نشد" },
 { status: 404 }
 );
 }

 await db.tenantDomain.delete({ where: { id: record.id } });

 // اگر primary حذف شد، جایگزین کن
 if (record.isPrimary) {
 const next = await db.tenantDomain.findFirst({
 where: { tenantId: record.tenantId, status: "VERIFIED" },
 orderBy: { createdAt: "asc" },
 });
 if (next) {
 await db.tenantDomain.update({ where: { id: next.id }, data: { isPrimary: true } });
 }
 }

 await db.platformAuditLog
 .create({
 data: {
 superAdminId: admin.id,
 action: "DOMAIN_DELETE",
 entity: "TenantDomain",
 entityId: record.id,
 details: JSON.stringify({ domain: record.domain, tenantId: record.tenantId }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 })
 .catch(() => {});

 return NextResponse.json({
 success: true,
 message: `دامنه ${record.domain} حذف شد`,
 });
 } catch (error) {
 console.error("Platform domains DELETE error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف دامنه" },
 { status: 500 }
 );
 }
}
