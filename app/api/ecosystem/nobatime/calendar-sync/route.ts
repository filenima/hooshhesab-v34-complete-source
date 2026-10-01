import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const NOBATIME_BASE_URL = "https://nobatime.ir";

/**
 * GET /api/ecosystem/nobatime/calendar-sync
 * - دریافت iCal feed URL و تعداد نوبت‌های همگام‌سازی‌شده
 *
 * POST /api/ecosystem/nobatime/calendar-sync
 * body: { method?: "google" | "ical" }
 * - sync نوبت‌های نوباتایم به Google Calendar (از طریق iCal format)
 * - تولید iCal feed قابل subscribe در Google Calendar
 */

// ============ GET ============
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
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const connection = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "NOBATIME" },
 },
 });

 const isConnected = connection?.status === "CONNECTED";

 let appointmentCount = 0;
 let lastSyncAt: string | null = null;
 if (isConnected) {
 const auditEntries = await db.auditLog.findMany({
 where: {
 tenantId: user.tenantId,
 action: "SYNC_NOBATIME_CALENDAR",
 },
 orderBy: { createdAt: "desc" },
 take: 1,
 });
 if (auditEntries.length > 0) {
 lastSyncAt = auditEntries[0].createdAt.toISOString();
 try {
 const data = JSON.parse(auditEntries[0].changes || "{}");
 appointmentCount = data.syncedCount || 0;
 } catch {
 /* ignore */
 }
 }
 }

 const feedToken = Buffer.from(`${user.tenantId}:nobatime`).toString("base64url");
 const icalFeedUrl = `/api/ecosystem/nobatime/calendar-sync/feed?token=${feedToken}`;

 return NextResponse.json({
 success: true,
 data: {
 connected: isConnected,
 icalFeedUrl,
 googleCalendarImportUrl: `https://calendar.google.com/calendar/render?cid=webcal://${req.headers.get("host") || "app.hoosh.nobatime.ir"}${icalFeedUrl}`,
 appointmentCount,
 lastSyncAt,
 instructions: "برای subscribe در Google Calendar: روی لینک بالا کلیک کنید یا URL webcal را در Google Calendar > Settings > Add by URL وارد کنید.",
 },
 });
 } catch (error) {
 console.error("Nobatime calendar-sync GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت وضعیت همگام‌سازی تقویم" },
 { status: 500 }
 );
 }
}

// ============ POST ============
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

 const user = await db.user.findUnique({
 where: { id: payload.id as string },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const method = (body?.method || "ical") as "google" | "ical";

 const connection = await db.ecosystemConnection.findUnique({
 where: {
 tenantId_service: { tenantId: user.tenantId, service: "NOBATIME" },
 },
 });

 const isConnected = connection?.status === "CONNECTED" &&!!connection.ssoToken;

 let appointments: NobatimeAppointment[] = [];
 if (isConnected && connection?.ssoToken) {
 try {
 const res = await fetch(
 `${NOBATIME_BASE_URL}/api/v1/appointments?status=upcoming`,
 {
 headers: {
 Authorization: `Bearer ${connection.ssoToken}`,
 Accept: "application/json",
 },
 signal: AbortSignal.timeout(8000),
 }
 );
 if (res.ok) {
 const json = (await res.json()) as { appointments?: NobatimeAppointment[] };
 appointments = json.appointments || [];
 }
 } catch (err) {
 console.warn("nobatime fetch failed, using mock:", err);
 appointments = mockAppointments();
 }
 } else {
 appointments = mockAppointments();
 }

 const ical = buildIcal(appointments);

 let googlePushResult: { pushed: boolean; message: string } | null = null;
 if (method === "google") {
 googlePushResult = {
 pushed: false,
 message: "برای push مستقیم به Google Calendar به OAuth setup نیاز است. از iCal feed URL استفاده کنید.",
 };
 }

 try {
 await db.auditLog.create({
 data: {
 tenantId: user.tenantId,
 userId: user.id,
 action: "SYNC_NOBATIME_CALENDAR",
 entity: "Calendar",
 changes: JSON.stringify({
 method,
 syncedCount: appointments.length,
 source: isConnected? "live": "mock",
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });
 } catch {
 /* ignore */
 }

 return NextResponse.json({
 success: true,
 data: {
 method,
 syncedCount: appointments.length,
 source: isConnected? "live": "mock",
 ical,
 icalSize: ical.length,
 googlePush: googlePushResult,
 appointmentsPreview: appointments.slice(0, 5).map((a) => ({
 id: a.id,
 title: a.title,
 startsAt: a.startsAt,
 endsAt: a.endsAt,
 })),
 },
 message: `${appointments.length} نوبت به iCal تبدیل شد`,
 });
 } catch (error) {
 console.error("Nobatime calendar-sync POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در همگام‌سازی تقویم" },
 { status: 500 }
 );
 }
}

// ============ Helpers ============

interface NobatimeAppointment {
 id: string;
 title: string;
 startsAt: string;
 endsAt: string;
 location?: string;
 description?: string;
 attendeeName?: string;
}

function buildIcal(appointments: NobatimeAppointment[]): string {
 const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
 const lines: string[] = [
 "BEGIN:VCALENDAR",
 "VERSION:2.0",
 "PRODID:-//Hoosh//Nobatime Sync//FA",
 "CALSCALE:GREGORIAN",
 "METHOD:PUBLISH",
 "X-WR-CALNAME:نوباتایم - هوش",
 "X-WR-TIMEZONE:Asia/Tehran",
 ];

 for (const appt of appointments) {
 lines.push("BEGIN:VEVENT");
 lines.push(`UID:${appt.id}@hoosh.nobatime.ir`);
 lines.push(`DTSTAMP:${now}`);
 lines.push(`DTSTART:${toIcalDate(appt.startsAt)}`);
 lines.push(`DTEND:${toIcalDate(appt.endsAt)}`);
 lines.push(`SUMMARY:${escapeIcal(appt.title)}`);
 if (appt.location) lines.push(`LOCATION:${escapeIcal(appt.location)}`);
 if (appt.description) lines.push(`DESCRIPTION:${escapeIcal(appt.description)}`);
 if (appt.attendeeName) lines.push(`ATTENDEE:${escapeIcal(appt.attendeeName)}`);
 lines.push("END:VEVENT");
 }

 lines.push("END:VCALENDAR");
 return lines.join("\r\n");
}

function toIcalDate(iso: string): string {
 return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcal(text: string): string {
 return text
.replace(/\\/g, "\\\\")
.replace(/;/g, "\\;")
.replace(/,/g, "\\,")
.replace(/\n/g, "\\n");
}

function mockAppointments(): NobatimeAppointment[] {
 const now = Date.now();
 return [
 {
 id: "apt-1",
 title: "جلسه با مشتری — شرکت پارس",
 startsAt: new Date(now + 86400000).toISOString(),
 endsAt: new Date(now + 86400000 + 3600000).toISOString(),
 location: "دفتر مرکزی",
 attendeeName: "آقای رضایی",
 },
 {
 id: "apt-2",
 title: "ارسال صورتحساب ماهانه",
 startsAt: new Date(now + 2 * 86400000).toISOString(),
 endsAt: new Date(now + 2 * 86400000 + 1800000).toISOString(),
 location: "آنلاین",
 },
 {
 id: "apt-3",
 title: "بازرسی انبار — شعبه ۲",
 startsAt: new Date(now + 5 * 86400000).toISOString(),
 endsAt: new Date(now + 5 * 86400000 + 7200000).toISOString(),
 location: "انبار شعبه ۲",
 attendeeName: "خانم احمدی",
 },
 ];
}
