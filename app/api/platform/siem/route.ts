import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 querySecurityEvents,
 logSecurityEvent,
 detectThreats,
 getSIEMStats,
 type SecurityEventSeverity,
} from "@/lib/siem";

export const runtime = "nodejs";

// GET /api/platform/siem — جستجوی رویدادهای امنیتی + آمار
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const mode = searchParams.get("mode") || "events";

 if (mode === "stats") {
 const stats = await getSIEMStats();
 return NextResponse.json({ success: true, data: stats });
 }

 if (mode === "threats") {
 const threats = await detectThreats();
 return NextResponse.json({ success: true, data: threats });
 }

 // حالت پیش‌فرض: رویدادها
 const filters: {
 type?: string;
 severity?: SecurityEventSeverity;
 userId?: string;
 tenantId?: string;
 ip?: string;
 from?: Date;
 to?: Date;
 limit?: number;
 } = {};
 const type = searchParams.get("type");
 const severity = searchParams.get("severity");
 const userId = searchParams.get("userId");
 const tenantId = searchParams.get("tenantId");
 const ip = searchParams.get("ip");
 const limit = Number(searchParams.get("limit") || 100);
 const from = searchParams.get("from");
 const to = searchParams.get("to");
 if (type) filters.type = type;
 if (severity) filters.severity = severity as SecurityEventSeverity;
 if (userId) filters.userId = userId;
 if (tenantId) filters.tenantId = tenantId;
 if (ip) filters.ip = ip;
 if (from) filters.from = new Date(from);
 if (to) filters.to = new Date(to);
 filters.limit = limit;

 const events = await querySecurityEvents(filters);
 return NextResponse.json({ success: true, data: events });
 } catch (error) {
 console.error("SIEM query error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت رویدادهای امنیتی" },
 { status: 500 }
 );
 }
}

// POST /api/platform/siem — ثبت یک رویداد امنیتی سفارشی (superadmin)
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const { type, severity, details, userId, tenantId, ip } = body as {
 type: string;
 severity?: SecurityEventSeverity;
 details?: unknown;
 userId?: string;
 tenantId?: string;
 ip?: string;
 };

 if (!type) {
 return NextResponse.json(
 { success: false, error: "type الزامی است" },
 { status: 400 }
 );
 }

 await logSecurityEvent({
 timestamp: new Date(),
 type,
 severity: severity || "info",
 userId: userId || undefined,
 tenantId: tenantId || undefined,
 ip: ip || req.headers.get("x-forwarded-for") || "unknown",
 userAgent: req.headers.get("user-agent") || undefined,
 details: details || {},
 });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("SIEM log error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت رویداد" },
 { status: 500 }
 );
 }
}
