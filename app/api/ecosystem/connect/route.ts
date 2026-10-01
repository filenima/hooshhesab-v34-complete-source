import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";
import crypto from "crypto";

export const runtime = "nodejs";

// POST /api/ecosystem/connect — اتصال به سرویس اکوسیستم (SSO)
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const { service } = await req.json();
 const validServices = ["NOBATIME", "CATALOG", "HESABYAR"];
 if (!validServices.includes(service)) {
 return NextResponse.json(
 { success: false, error: "سرویس نامعتبر" },
 { status: 400 }
 );
 }

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 include: { tenant: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 // بررسی اتصال موجود
 const existingConn = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: {
 tenantId: user.tenantId,
 service,
 },
 },
 });

 if (existingConn?.status === "CONNECTED") {
 return NextResponse.json({
 success: false,
 error: "این سرویس قبلاً متصل شده است",
 }, { status: 409 });
 }

 // تولید SSO token (در production واقعی: redirect به سرویس مقصد با callback)
 const ssoToken = crypto.randomBytes(32).toString("hex");
 const externalId = `ext_${Date.now()}_${Math.random().toString(36).substring(7)}`;

 // URL سرویس مقصد
 const serviceUrls: Record<string, string> = {
 NOBATIME: "https://nobatime.ir",
 CATALOG: "https://catalog.nobatime.ir",
 HESABYAR: "https://yar.nobatime.ir",
 };

 const connection = await db.ecosystemConnection.upsert({
 where: {
 tenantId_service: {
 tenantId: user.tenantId,
 service,
 },
 },
 update: {
 status: "CONNECTED",
 ssoToken,
 externalId,
 connectedAt: new Date(),
 config: JSON.stringify({
 tenantName: user.tenant.name,
 userEmail: user.email,
 connectedAt: new Date().toISOString(),
 }),
 },
 create: {
 tenantId: user.tenantId,
 service,
 status: "CONNECTED",
 ssoToken,
 externalId,
 connectedAt: new Date(),
 config: JSON.stringify({
 tenantName: user.tenant.name,
 userEmail: user.email,
 connectedAt: new Date().toISOString(),
 }),
 },
 });

 // audit log
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "ECOSYSTEM_CONNECT",
 entity: "EcosystemConnection",
 entityId: connection.id,
 changes: JSON.stringify({ service }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // URL ورود خودکار (SSO)
 const loginUrl = `${serviceUrls[service]}/sso?token=${ssoToken}&return=${encodeURIComponent(serviceUrls[service])}`;

 return NextResponse.json({
 success: true,
 data: {
 connection,
 loginUrl,
 serviceName:
 service === "NOBATIME"? "نوباتایم":
 service === "CATALOG"? "کاتالوگ":
 "حساب‌یار",
 },
 message: `اتصال به ${
 service === "NOBATIME"? "نوباتایم":
 service === "CATALOG"? "کاتالوگ":
 "حساب‌یار"
 } با موفقیت برقرار شد`,
 });
 } catch (error) {
 console.error("Ecosystem connect error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اتصال" },
 { status: 500 }
 );
 }
}
