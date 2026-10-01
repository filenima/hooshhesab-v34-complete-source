import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findAccessByToken } from "@/lib/portal-utils";

export const runtime = "nodejs";

interface RouteContext {
 params: Promise<{ token: string }>;
}

// GET /api/portal/[token] — تأیید اعتبار توکن و بازگرداندن اطلاعات پایه‌ی مشتری
export async function GET(_req: NextRequest, ctx: RouteContext) {
 try {
 const { token } = await ctx.params;
 if (!token || token.length < 32) {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 400 }
 );
 }
 // FIX(v11): جستجوی مستقیم با هش یکتا — قبلاً اسکن ۵۰۰تایی سراسری بود
 const access = await findAccessByToken(token);
 if (!access || !access.isActive) {
 return NextResponse.json(
 { success: false, error: "لینک نامعتبر یا منقضی است" },
 { status: 404 }
 );
 }
 if (access.expiresAt && access.expiresAt < new Date()) {
 return NextResponse.json(
 { success: false, error: "لینک منقضی شده است" },
 { status: 410 }
 );
 }

 // ثبت یک نشست (session) برای رصدابیلیتی
 await db.portalSession.create({
 data: {
 tenantId: access.tenantId,
 accessId: access.id,
 },
 });
 await db.customerPortalAccess.update({
 where: { id: access.id },
 data: { lastAccessAt: new Date() },
 });

 // FIX(v11): طرف‌حساب + نام کسب‌وکار برای هدر پورتال
 const accessFull = await db.customerPortalAccess.findUnique({
 where: { id: access.id },
 include: {
 party: { select: { id: true, name: true, code: true, mobile: true, email: true } },
 tenant: { select: { name: true } },
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 partyId: access.partyId,
 partyName: accessFull?.party?.name?? "—",
 partyCode: accessFull?.party?.code?? "—",
 mobile: accessFull?.party?.mobile?? null,
 email: accessFull?.party?.email?? null,
 tenantName: accessFull?.tenant?.name?? "هوش",
 expiresAt: access.expiresAt,
 },
 });
 } catch (error) {
 console.error("Portal verify error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تأیید توکن" },
 { status: 500 }
 );
 }
}
