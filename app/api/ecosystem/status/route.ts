import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

// GET /api/ecosystem/status — وضعیت اتصال‌های اکوسیستم
export async function GET(req: NextRequest) {
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

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const connections = await db.ecosystemConnection.findMany({
 where: { tenantId: user.tenantId },
 });

 const services = [
 {
 id: "NOBATIME",
 name: "نوباتایم",
 nameEn: "Nobatime",
 url: "https://nobatime.ir",
 description: "سامانه مدیریت نوبت‌دهی آنلاین",
 icon: "Calendar",
 },
 {
 id: "CATALOG",
 name: "کاتالوگ",
 nameEn: "Catalog",
 url: "https://catalog.nobatime.ir",
 description: "کاتالوگ دیجیتال محصولات و خدمات",
 icon: "BookOpen",
 },
 {
 id: "HESABYAR",
 name: "حساب‌یار",
 nameEn: "HesabYar",
 url: "https://yar.nobatime.ir",
 description: "دستیار مالی هوشمند کسب‌وکار",
 icon: "Wallet",
 },
 ];

 const data = services.map((s) => {
 const conn = connections.find((c) => c.service === s.id);
 return {
...s,
 connected: conn?.status === "CONNECTED",
 connectedAt: conn?.connectedAt,
 loginUrl: conn?.ssoToken
? `${s.url}/sso?token=${conn.ssoToken}`
: null,
 };
 });

 return NextResponse.json({ success: true, data });
 } catch (error) {
 console.error("Ecosystem status error:", error);
 return NextResponse.json(
 { success: false, error: "خطا" },
 { status: 500 }
 );
 }
}
