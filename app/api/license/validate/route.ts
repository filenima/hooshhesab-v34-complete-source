import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
 getAuthContext,
} from "@/lib/auth";
import {
 rateLimitCheck,
 buildRateLimitResponse,
 getClientIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/license/validate — اعتبارسنجی کلید لایسنس
// SECURITY (C7): احراز هویت اجباری است. لایسنس فقط می‌تواند به tenant خودِ caller متصل شود.
// SECURITY (M10): rate limit — ۵ درخواست در دقیقه برای هر IP.
export async function POST(req: NextRequest) {
 try {
 // ===== Rate limit: ۵ درخواست در دقیقه برای هر IP =====
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`license:validate:${ip}`, 5, 60_000);
 if (!rl.ok) {
 return await buildRateLimitResponse(
 rl,
 "تلاش‌های اعتبارسنجی لایسنس بیش از حد. لطفاً بعداً تلاش کنید."
 );
 }

 // ===== احراز هویت اجباری =====
 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const { key, tenantId } = await req.json();

 if (!key) {
 return NextResponse.json(
 { success: false, error: "کلید لایسنس الزامی است" },
 { status: 400 }
 );
 }

 const license = await db.license.findUnique({
 where: { key: key.trim().toUpperCase() },
 include: { tenant: true },
 });

 if (!license) {
 return NextResponse.json(
 { success: false, error: "کلید لایسنس نامعتبر است" },
 { status: 404 }
 );
 }

 if (license.status!== "ACTIVE") {
 return NextResponse.json(
 {
 success: false,
 error: `لایسنس ${license.status === "SUSPENDED"? "تعلیق شده": license.status === "EXPIRED"? "منقضی": "ابطال شده"}`,
 },
 { status: 403 }
 );
 }

 if (license.endDate && license.endDate < new Date()) {
 await db.license.update({
 where: { id: license.id },
 data: { status: "EXPIRED" },
 });
 return NextResponse.json(
 { success: false, error: "لایسنس منقضی شده است" },
 { status: 403 }
 );
 }

 // اگر لایسنس از قبل به tenant دیگری متصل است، فقط owner می‌تواند آن را ببیند
 if (license.tenantId && license.tenantId!== ctx.tenantId) {
 return NextResponse.json(
 {
 success: false,
 valid: true,
 bound: true,
 error: "این لایسنس متعلق به tenant دیگری است",
 },
 { status: 403 }
 );
 }

 // اگر tenantId در بدنه ارسال شده، فقط به tenant خودِ caller اجازه اتصال می‌دهیم
 if (tenantId &&!license.tenantId) {
 if (tenantId!== ctx.tenantId) {
 return NextResponse.json(
 {
 success: false,
 error: "شما فقط می‌توانید لایسنس را به tenant خودتان متصل کنید",
 },
 { status: 403 }
 );
 }
 await db.license.update({
 where: { id: license.id },
 data: {
 tenantId: ctx.tenantId,
 activatedAt: new Date(),
 activationIp: ip,
 },
 });
 }

 return NextResponse.json({
 success: true,
 valid: true,
 license: {
 plan: license.plan,
 maxUsers: license.maxUsers,
 maxInvoices: license.maxInvoices,
 maxWarehouses: license.maxWarehouses,
 features: JSON.parse(license.features),
 endDate: license.endDate,
 },
 });
 } catch (error) {
 console.error("License validate error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اعتبارسنجی" },
 { status: 500 }
 );
 }
}
