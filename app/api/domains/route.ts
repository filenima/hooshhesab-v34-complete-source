import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { promises as dnsPromises } from "node:dns";
import { db } from "@/lib/db";
import { getAuthContext, auditLog, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ ثبت دامنه اختصاصی (۲۱-e — Feature ③) ============
// tenant-scoped: هر tenant حداکثر ۵ دامنه؛ تأیید مالکیت با رکورد TXT DNS.
//
// GET    → لیست دامنه‌های tenant (با رکورد TXT و وضعیت)
// POST   {domain} → ثبت دامنه جدید (status=PENDING) + دستورالعمل DNS فارسی
// POST   {id, action:"verify"} → بررسی DNS (resolveTxt روی _hoosh-verify.{domain})
// DELETE ?id= → حذف دامنه

/** حداکثر دامنه برای هر tenant */
const MAX_DOMAINS_PER_TENANT = 5;

/** دامنه‌های زیردامنه پلتفرم — قابل ثبت نیستند */
const BLOCKED_SUFFIXES = [
  ".space-z.ai",
  ".nobatime.ir",
  ".vercel.app",
];

/** پیشوند رکورد TXT تأیید مالکیت */
const TXT_PREFIX = "_hoosh-verify.";

/** اعتبارسنجی فرمت دامنه — حروف کوچک، حداقل یک نقطه، کاراکترهای مجاز */
function validateDomain(raw: string): { ok: true; domain: string } | { ok: false; error: string } {
 const domain = raw.trim().toLowerCase();

 if (!domain) return { ok: false, error: "آدرس دامنه الزامی است" };
 if (domain.length > 253) {
 return { ok: false, error: "آدرس دامنه بیش از حد طولانی است (حداکثر ۲۵۳ کاراکتر)" };
 }
 if (domain.includes(" ")) {
 return { ok: false, error: "آدرس دامنه نباید فاصله داشته باشد" };
 }
 if (!/^[a-z0-9.-]+$/.test(domain)) {
 return { ok: false, error: "فرمت دامنه معتبر نیست — فقط حروف انگلیسی کوچک، عدد، نقطه و خط تیره مجاز است" };
 }
 if (!domain.includes(".")) {
 return { ok: false, error: "دامنه باید حداقل یک نقطه داشته باشد (مثلاً app.example.ir)" };
 }
 if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
 return { ok: false, error: "فرمت دامنه معتبر نیست — نقطه در ابتدا/انتها یا پشت‌سرهم مجاز نیست" };
 }
 // رد زیردامنه‌های خود پلتفرم
 for (const suffix of BLOCKED_SUFFIXES) {
 if (domain.endsWith(suffix)) {
 return {
 ok: false,
 error: "ثبت زیردامنه‌های پلتفرم هوش مجاز نیست — دامنه اختصاصی خودتان را وارد کنید",
 };
 }
 }
 // هر برچسب (بخش بین نقطه‌ها) ۱ تا ۶۳ کاراکتر و فقط a-z0-9 و خط تیره
 const labels = domain.split(".");
 for (const label of labels) {
 if (label.length < 1 || label.length > 63) {
 return { ok: false, error: "فرمت دامنه معتبر نیست — طول هر بخش بین ۱ تا ۶۳ کاراکتر باشد" };
 }
 if (label.startsWith("-") || label.endsWith("-")) {
 return { ok: false, error: "فرمت دامنه معتبر نیست — بخش‌ها نباید با خط تیره شروع یا تمام شوند" };
 }
 }
 return { ok: true, domain };
}

/** ساخت رکورد دامنه برای پاسخ API (تاریخ جلالی از فرانت نمایش داده می‌شود) */
function serializeDomain(d: {
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
}) {
 return {
 id: d.id,
 domain: d.domain,
 status: d.status,
 isPrimary: d.isPrimary,
 dnsTxtRecord: d.dnsTxtRecord,
 verificationToken: d.verificationToken,
 // دستورالعمل DNS — نام رکورد و مقدار
 dnsInstructions: {
 txtName: `${TXT_PREFIX}${d.domain}`,
 txtValue: d.dnsTxtRecord || "",
 ttl: 3600,
 },
 verifiedAt: d.verifiedAt,
 lastCheckedAt: d.lastCheckedAt,
 notes: d.notes,
 createdAt: d.createdAt,
 };
}

// GET /api/domains — لیست دامنه‌های tenant
export async function GET(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const domains = await db.tenantDomain.findMany({
 where: { tenantId: ctx.tenantId },
 orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
 });

 return NextResponse.json({
 success: true,
 data: domains.map(serializeDomain),
 maxDomains: MAX_DOMAINS_PER_TENANT,
 });
 } catch (error) {
 console.error("Domains GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت دامنه‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/domains — ثبت دامنه جدید یا بررسی DNS
export async function POST(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 if (!rateLimit(`domains:${ctx.tenantId}`, 20, 60_000)) {
 return NextResponse.json(
 { success: false, error: "درخواست‌های بیش از حد — کمی بعد تلاش کنید" },
 { status: 429 }
 );
 }

 const body = (await req.json().catch(() => ({}))) as {
 domain?: string;
 id?: string;
 action?: string;
 };

 // ============ اکشن verify: بررسی DNS ============
 if (body.action === "verify") {
 const record = await db.tenantDomain.findFirst({
 where: { id: body.id, tenantId: ctx.tenantId },
 });
 if (!record) {
 return NextResponse.json(
 { success: false, error: "دامنه یافت نشد" },
 { status: 404 }
 );
 }
 if (record.status === "VERIFIED") {
 return NextResponse.json({
 success: true,
 data: serializeDomain(record),
 message: "این دامنه قبلاً تأیید شده است",
 });
 }

 // وضعیت موقت VERIFYING → جستجوی TXT
 await db.tenantDomain.update({
 where: { id: record.id },
 data: { status: "VERIFYING" },
 });

 let txtRecords: string[][] = [];
 try {
 txtRecords = await dnsPromises.resolveTxt(`${TXT_PREFIX}${record.domain}`);
 } catch (dnsErr) {
 // ENODATA / ENOTFOUND → رکورد هنوز منتشر نشده
 const code = (dnsErr as { code?: string }).code || "UNKNOWN";
 console.log("Domain DNS check miss:", record.domain, code);

 // شمارش شکست‌ها از notes — بعد از ۳ شکست FAILED
 const match = /failed_checks=(\d+)/.exec(record.notes || "");
 const failedChecks = match ? parseInt(match[1], 10) : 0;
 const newCount = failedChecks + 1;

 if (newCount >= 3) {
 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: {
 status: "FAILED",
 lastCheckedAt: new Date(),
 notes: `failed_checks=${newCount}; last_error=${code}`,
 },
 });
 return NextResponse.json({
 success: true,
 data: serializeDomain(updated),
 message:
 "رکورد DNS هنوز منتشر نشده — چند دقیقه بعد دوباره بررسی کنید. پس از ۳ بررسی ناموفق، دامنه «ردشده» علامت می‌خورد و می‌توانید دوباره بررسی کنید یا با پشتیبانی تماس بگیرید.",
 verified: false,
 });
 }

 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: {
 status: "PENDING",
 lastCheckedAt: new Date(),
 notes: `failed_checks=${newCount}; last_error=${code}`,
 },
 });
 return NextResponse.json({
 success: true,
 data: serializeDomain(updated),
 message:
 "رکورد DNS هنوز منتشر نشده — چند دقیقه بعد دوباره بررسی کنید (انتشار DNS ممکن است تا چند ساعت طول بکشد)",
 verified: false,
 });
 }

 // رکورد TXT پیدا شد — آیا مقدار مورد انتظار داخلش هست؟
 const expected = record.dnsTxtRecord || "";
 const flat = txtRecords.map((chunks) => chunks.join(""));
 const matched = flat.some((v) => v.includes(expected) || v === expected);

 if (matched) {
 // اولین دامنه تأییدشده tenant → isPrimary
 const hasVerifiedPrimary = await db.tenantDomain.findFirst({
 where: { tenantId: ctx.tenantId, isPrimary: true, status: "VERIFIED" },
 select: { id: true },
 });

 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: {
 status: "VERIFIED",
 verifiedAt: new Date(),
 lastCheckedAt: new Date(),
 notes: null,
 ...(hasVerifiedPrimary ? {} : { isPrimary: true }),
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "DOMAIN_VERIFIED",
 entity: "TenantDomain",
 entityId: record.id,
 changes: { domain: record.domain },
 req,
 });

 return NextResponse.json({
 success: true,
 data: serializeDomain(updated),
 message: "دامنه با موفقیت تأیید شد",
 verified: true,
 });
 }

 // مقدار TXT متفاوت بود
 const match = /failed_checks=(\d+)/.exec(record.notes || "");
 const failedChecks = match ? parseInt(match[1], 10) : 0;
 const newCount = failedChecks + 1;
 const updated = await db.tenantDomain.update({
 where: { id: record.id },
 data: {
 status: newCount >= 3 ? "FAILED" : "PENDING",
 lastCheckedAt: new Date(),
 notes: `failed_checks=${newCount}; txt_mismatch`,
 },
 });
 return NextResponse.json({
 success: true,
 data: serializeDomain(updated),
 message:
 "رکورد TXT پیدا شد اما مقدار آن با کد تأیید ما مطابقت ندارد — مقدار دقیق را از کارت دامنه کپی کنید",
 verified: false,
 });
 }

 // ============ ثبت دامنه جدید ============
 const validation = validateDomain(String(body.domain || ""));
 if (!validation.ok) {
 return NextResponse.json(
 { success: false, error: validation.error },
 { status: 400 }
 );
 }
 const domain = validation.domain;

 // سهمیه ۵ دامنه
 const count = await db.tenantDomain.count({ where: { tenantId: ctx.tenantId } });
 if (count >= MAX_DOMAINS_PER_TENANT) {
 return NextResponse.json(
 {
 success: false,
 error: `حداکثر ${MAX_DOMAINS_PER_TENANT} دامنه برای هر کسب‌وکار مجاز است — برای افزودن بیشتر، یکی را حذف کنید`,
 },
 { status: 403 }
 );
 }

 // یکتایی دامنه (سراسری)
 const existing = await db.tenantDomain.findUnique({ where: { domain } });
 if (existing) {
 if (existing.tenantId === ctx.tenantId) {
 return NextResponse.json(
 { success: false, error: "این دامنه قبلاً ثبت شده است" },
 { status: 400 }
 );
 }
 return NextResponse.json(
 { success: false, error: "این دامنه توسط کسب‌وکار دیگری ثبت شده است" },
 { status: 403 }
 );
 }

 const verificationToken = randomBytes(16).toString("hex"); // ۳۲ کاراکتر hex
 const dnsTxtRecord = `hoosh-verify=${verificationToken}`;
 const isPrimary = count === 0; // اولین دامنه tenant

 const created = await db.tenantDomain.create({
 data: {
 tenantId: ctx.tenantId,
 domain,
 status: "PENDING",
 verificationToken,
 dnsTxtRecord,
 isPrimary,
 },
 });

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "DOMAIN_CREATE",
 entity: "TenantDomain",
 entityId: created.id,
 changes: { domain },
 req,
 });

 return NextResponse.json({
 success: true,
 data: serializeDomain(created),
 message: "دامنه ثبت شد — رکورد TXT را در DNS دامنه‌تان اضافه کنید و سپس بررسی کنید",
 });
 } catch (error) {
 console.error("Domains POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت دامنه" },
 { status: 500 }
 );
 }
}

// DELETE /api/domains?id= — حذف دامنه
export async function DELETE(req: NextRequest) {
 try {
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) {
 return NextResponse.json(
 { success: false, error: "شناسه دامنه الزامی است" },
 { status: 400 }
 );
 }

 // فقط دامنه خود tenant — اگر primary حذف شد، اولین دامنه تأییدشده بعدی primary می‌شود
 const record = await db.tenantDomain.findFirst({
 where: { id, tenantId: ctx.tenantId },
 });
 if (!record) {
 return NextResponse.json(
 { success: false, error: "دامنه یافت نشد" },
 { status: 404 }
 );
 }

 await db.tenantDomain.delete({ where: { id: record.id } });

 // انتقال primary اگر لازم بود
 if (record.isPrimary) {
 const next = await db.tenantDomain.findFirst({
 where: { tenantId: ctx.tenantId, status: "VERIFIED" },
 orderBy: { createdAt: "asc" },
 });
 if (next) {
 await db.tenantDomain.update({
 where: { id: next.id },
 data: { isPrimary: true },
 });
 }
 }

 await auditLog({
 tenantId: ctx.tenantId,
 userId: ctx.userId,
 action: "DOMAIN_DELETE",
 entity: "TenantDomain",
 entityId: record.id,
 changes: { domain: record.domain },
 req,
 });

 return NextResponse.json({
 success: true,
 message: "دامنه حذف شد",
 });
 } catch (error) {
 console.error("Domains DELETE error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در حذف دامنه" },
 { status: 500 }
 );
 }
}
