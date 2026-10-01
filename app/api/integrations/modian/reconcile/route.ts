// ============ Modian Reconcile API — هوش ============
// مغایرت‌گیری فاکتورهای محلی با سامانه مودیان — اتصال واقعی نسخه ۲.
//
// CRITICAL: Never simulate modian sends — this is a legal/tax filing system.
// شبیه‌سازی مغایرت‌گیری به همان اندازه خطرناک است چون کاربر فکر می‌کند
// فاکتورهایش درست در مودیان ثبت شده‌اند در حالی که ممکن است نباشند.
//
// چرخهٔ واقعی (نسخه ۲): فاکتورهای محلی SENT/ACCEPTED/REJECTED (با modianUid)
// → استعلام رسمی inquiry-by-uid (حداکثر ۱۰۰ شناسه در هر درخواست)
// → تطبیق + به‌روزرسانی وضعیت از وضعیت رسمی سازمان (SUCCESS/FAILED/...)
//
// بدون اتصال واقعی (حافظه/گواهی/کلید) → 503 — هرگز آمار جعلی نه.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenant, auditLog } from "@/lib/auth";
import {
  applyEnvToConnection,
  getModianConnection,
  modianConnectionReasonFa,
  getModianEnv,
  inquiryByUid,
  type InquiryResultEntry,
} from "@/lib/modian";

export const runtime = "nodejs";

/** ترجمهٔ وضعیت استعلام مودیان → وضعیت داخلی ما */
function inquiryStatusToLocal(entry: InquiryResultEntry): {
  local: "ACCEPTED" | "REJECTED" | "SENT" | "PENDING";
  fa: string;
} {
  const status = entry.status ?? "";
  const success = entry.data?.success;
  const errors = entry.data?.error ?? [];

  if (status === "SUCCESS" || success === true) {
    return { local: "ACCEPTED", fa: "تأیید شده توسط سازمان" };
  }
  if (status === "FAILED" || success === false || errors.length > 0) {
    return { local: "REJECTED", fa: "رد شده توسط سازمان" };
  }
  if (status === "TIMEOUT") {
    return { local: "REJECTED", fa: "مهلت پردازش در سازمان تمام شد (TIMEOUT)" };
  }
  // PENDING | IN_PROGRESS | نامشخص — هنوز در صف سازمان
  return { local: "SENT", fa: "در صف پردازش سازمان" };
}

// POST /api/integrations/modian/reconcile — مغایرت‌گیری فاکتورها با کارپوشه مودیان
export async function POST(req: NextRequest) {
 try {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "تنانت یافت نشد" },
 { status: 401 }
 );
 }

 // ===== CRITICAL: بررسی اتصال واقعی مودیان =====
 const connResult = await getModianConnection(tenant.id);
 if (!connResult.ok) {
 return NextResponse.json(
 {
 success: false,
 error: `اتصال به سامانه مودیان پیکربندی نشده است: ${modianConnectionReasonFa(connResult.reason)}`,
 errorCode: "MODIAN_NOT_CONFIGURED",
 },
 { status: 503 }
 );
 }

 const envCfg = await getModianEnv(tenant.id);
 const connection = applyEnvToConnection(connResult.connection, envCfg);

 const body = (await req.json().catch(() => ({}))) as {
 page?: number;
 };
 const page = Math.max(1, Number(body.page) || 1);
 // حداکثر ۱۰۰ شناسه در هر استعلام رسمی (خطای ۴۱۴۱)
 const pageSize = 100;
 const skip = (page - 1) * pageSize;

 // دریافت فاکتورهای ارسال‌شده به مودیان (با UID)
 const invoices = await db.invoice.findMany({
 where: {
 tenantId: tenant.id,
 modianUid: { not: null },
 modianStatus: { in: ["SENT", "ACCEPTED", "REJECTED"] },
 },
 include: { party: true },
 take: pageSize,
 skip,
 orderBy: { date: "desc" },
 });

 if (invoices.length === 0) {
 return NextResponse.json({
 success: true,
 matched: 0,
 unmatched: 0,
 total: 0,
 details: [],
 message: "هیچ فاکتور ارسال‌شده‌ای برای مغایرت‌گیری وجود ندارد.",
 });
 }

 // ===== استعلام رسمی: inquiry-by-uid (batch تا ۱۰۰ شناسه) =====
 // در محیط TEST، UID محلی پیشوند TEST- دارد — سمت مودیان خام است
 const uidMap = new Map<string, typeof invoices[number]>(); // uid خام → فاکتور
 for (const inv of invoices) {
   if (inv.modianUid) {
     uidMap.set(inv.modianUid.replace(/^TEST-/, ""), inv);
   }
 }

 const inquiryResult = await inquiryByUid(
   connection,
   Array.from(uidMap.keys())
 );

 if (!inquiryResult.ok) {
 return NextResponse.json(
 {
 success: false,
 error: `استعلام از سامانه مودیان ناموفق بود: ${inquiryResult.errorFa}`,
 errorCode: "MODIAN_INQUIRY_FAILED",
 },
 { status: 502 }
 );
 }

 // ===== تطبیق فاکتورهای محلی با نتیجه رسمی =====
 let matched = 0;
 let unmatched = 0;
 const details: Array<{
 invoiceId: string;
 invoiceNumber: string;
 party: string;
 localStatus: string | null;
 modianStatus: "MATCHED" | "UNMATCHED";
 modianFinalStatus?: string;
 modianFinalStatusFa?: string;
 confirmationReferenceId?: string | null;
 errors?: Array<{ code?: string | number; message?: string }>;
 reason?: string;
 }> = [];

 // نتیجه استعلام بر اساس uid — هر entry یک uid سمت کلاینت
 const resultByUid = new Map<string, InquiryResultEntry>();
 for (const entry of inquiryResult.data) {
   if (entry.uid) resultByUid.set(entry.uid, entry);
 }

 for (const inv of invoices) {
   const rawUid = inv.modianUid ? inv.modianUid.replace(/^TEST-/, "") : null;
   const entry = rawUid ? resultByUid.get(rawUid) : undefined;

   if (entry) {
     matched++;
     const statusInfo = inquiryStatusToLocal(entry);
     const confirmationReferenceId = entry.data?.confirmationReferenceId ?? null;
     const errors = (entry.data?.error ?? []).map((e) => ({
       code: e.code,
       message: e.message,
     }));

     // به‌روزرسانی وضعیت محلی از وضعیت رسمی سازمان
     if (
       (statusInfo.local === "ACCEPTED" || statusInfo.local === "REJECTED") &&
       inv.modianStatus !== statusInfo.local
     ) {
       await db.invoice
         .update({
           where: { id: inv.id },
           data: { modianStatus: statusInfo.local },
         })
         .catch(() => null);
     }

     details.push({
       invoiceId: inv.id,
       invoiceNumber: inv.number,
       party: inv.party?.name ?? "—",
       localStatus: inv.modianStatus,
       modianStatus: "MATCHED",
       modianFinalStatus: entry.status ?? undefined,
       modianFinalStatusFa: statusInfo.fa,
       confirmationReferenceId,
       ...(errors.length > 0 ? { errors } : {}),
     });
   } else {
     unmatched++;
     const reason = inv.modianUid
       ? "UID در استعلام سازمان یافت نشد (هنوز در صف یا نتیجه آماده نیست — چند دقیقه بعد دوباره)"
       : "فاکتور فاقد UID مودیان است (احتمالاً ارسال نشده)";
     details.push({
       invoiceId: inv.id,
       invoiceNumber: inv.number,
       party: inv.party?.name ?? "—",
       localStatus: inv.modianStatus,
       modianStatus: "UNMATCHED",
       reason,
     });
   }
 }

 await auditLog({
 tenantId: tenant.id,
 action: "MODIAN_RECONCILE",
 entity: "Invoice",
 changes: { matched, unmatched, total: invoices.length, env: envCfg.env },
 req,
 });

 return NextResponse.json({
 success: true,
 matched,
 unmatched,
 total: invoices.length,
 page,
 details,
 });
 } catch (error) {
 console.error("Modian reconcile error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در مغایرت‌گیری با سامانه مودیان" },
 { status: 500 }
 );
 }
}
