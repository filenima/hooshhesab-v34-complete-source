import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

// سرویس‌های اکوسیستم
const SERVICE_BASE_URLS: Record<string, string> = {
 NOBATIME: "https://nobatime.ir",
 CATALOG: "https://catalog.nobatime.ir",
 HESABYAR: "https://yar.nobatime.ir",
};

/**
 * GET /api/ecosystem/nobatime/appointments
 *?date=YYYY-MM-DD (optional — default: today)
 *
 * نوبت‌های روز جاری (یا روز مشخص‌شده) را از Nobatime واکشی می‌کند.
 * اگر اتصال به Nobatime برقرار نباشد یا سرویس در دسترس نباشد،
 * داده‌های نمونه (mock) برمی‌گرداند تا UI بتواند بدون خطا رندر شود.
 */
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
 select: { id: true, tenantId: true, name: true, family: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const dateParam = searchParams.get("date"); // YYYY-MM-DD
 const targetDate = dateParam || new Date().toISOString().slice(0, 10);

 // بررسی اتصال به Nobatime
 const connection = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "NOBATIME" },
 },
 });

 const isConnected = connection?.status === "CONNECTED" &&!!connection.ssoToken;
 const source: "live" | "mock" = isConnected? "live": "mock";

 let appointments: AppointmentDTO[] = [];
 if (isConnected && connection?.ssoToken) {
 // تلاش برای واکشی از Nobatime API
 try {
 const base = SERVICE_BASE_URLS.NOBATIME;
 const upstream = await fetch(
 `${base}/api/v1/appointments?date=${encodeURIComponent(targetDate)}`,
 {
 method: "GET",
 headers: {
 Authorization: `Bearer ${connection.ssoToken}`,
 Accept: "application/json",
 "User-Agent": "Hoosh/1.0",
 },
 signal: AbortSignal.timeout(5000),
 }
 );
 if (upstream.ok) {
 const json = (await upstream.json()) as { appointments?: unknown[] };
 appointments = (json.appointments || []).map((raw) =>
 mapUpstreamAppointment(raw as UpstreamAppointment)
 );
 } else {
 // upstream returned error fall back to mock
 appointments = mockAppointments(targetDate, user.name);
 }
 } catch {
 // network/timeout error fall back to mock
 appointments = mockAppointments(targetDate, user.name);
 }
 } else {
 // not connected mock
 appointments = mockAppointments(targetDate, user.name);
 }

 return NextResponse.json({
 success: true,
 data: {
 date: targetDate,
 source,
 connected: isConnected,
 count: appointments.length,
 appointments,
 },
 });
 } catch (error) {
 console.error("Nobatime appointments error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نوبت‌ها" },
 { status: 500 }
 );
 }
}

// ============ types ============

interface UpstreamAppointment {
 id?: string;
 start_time?: string;
 end_time?: string;
 customer_name?: string;
 customer?: { name?: string; phone?: string };
 service?: string;
 status?: string;
 notes?: string;
}

interface AppointmentDTO {
 id: string;
 startTime: string;
 endTime: string;
 customerName: string;
 customerPhone?: string;
 serviceName?: string;
 status: "CONFIRMED" | "PENDING" | "CANCELLED" | "COMPLETED";
 notes?: string;
}

function mapUpstreamAppointment(raw: UpstreamAppointment): AppointmentDTO {
 const status = (raw.status || "PENDING").toUpperCase();
 const validStatuses = ["CONFIRMED", "PENDING", "CANCELLED", "COMPLETED"];
 return {
 id: String(raw.id || Math.random().toString(36).slice(2)),
 startTime: raw.start_time || "",
 endTime: raw.end_time || "",
 customerName: raw.customer_name || raw.customer?.name || "نامشخص",
 customerPhone: raw.customer?.phone,
 serviceName: raw.service,
 status: (validStatuses.includes(status)? status: "PENDING") as AppointmentDTO["status"],
 notes: raw.notes,
 };
}

// ============ mock data ============
function mockAppointments(dateStr: string, userName: string): AppointmentDTO[] {
 void userName;
 return [
 {
 id: "mock-1",
 startTime: `${dateStr}T09:00:00`,
 endTime: `${dateStr}T09:30:00`,
 customerName: "آقای محمدی",
 customerPhone: "0912***3456",
 serviceName: "مشاوره مالیاتی",
 status: "CONFIRMED",
 notes: "مراجعه حضوری",
 },
 {
 id: "mock-2",
 startTime: `${dateStr}T11:00:00`,
 endTime: `${dateStr}T11:45:00`,
 customerName: "خانم رضایی",
 customerPhone: "0935***7890",
 serviceName: "تنظیم قرارداد",
 status: "PENDING",
 },
 {
 id: "mock-3",
 startTime: `${dateStr}T14:00:00`,
 endTime: `${dateStr}T14:30:00`,
 customerName: "شرکت آلفا",
 customerPhone: "021-88**12**",
 serviceName: "حسابداری دوره‌ای",
 status: "CONFIRMED",
 },
 {
 id: "mock-4",
 startTime: `${dateStr}T16:30:00`,
 endTime: `${dateStr}T17:00:00`,
 customerName: "آقای کریمی",
 serviceName: "پیگیری مالیات",
 status: "PENDING",
 },
 ];
}
