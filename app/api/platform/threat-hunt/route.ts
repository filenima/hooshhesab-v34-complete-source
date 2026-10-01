import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { huntThreats, getRecentThreatReports } from "@/lib/threat-hunting";

export const runtime = "nodejs";

// GET /api/platform/threat-hunt — آخرین گزارش‌های ذخیره‌شده
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const reports = await getRecentThreatReports(50);
 return NextResponse.json({ success: true, data: reports });
 } catch (error) {
 console.error("Threat hunt GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت گزارش‌ها" },
 { status: 500 }
 );
 }
}

// POST /api/platform/threat-hunt — اجرای اسکن کامل (superadmin)
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const startedAt = Date.now();
 const reports = await huntThreats();
 const durationMs = Date.now() - startedAt;

 return NextResponse.json({
 success: true,
 data: {
 reports,
 summary: {
 totalThreats: reports.length,
 critical: reports.filter((r) => r.severity === "critical").length,
 high: reports.filter((r) => r.severity === "high").length,
 medium: reports.filter((r) => r.severity === "medium").length,
 low: reports.filter((r) => r.severity === "low").length,
 durationMs,
 },
 },
 });
 } catch (error) {
 console.error("Threat hunt POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای اسکن" },
 { status: 500 }
 );
 }
}
