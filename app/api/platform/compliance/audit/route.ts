import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { checkCompliance, type ComplianceStandard } from "@/lib/compliance-checker";

export const runtime = "nodejs";

// GET /api/platform/compliance/audit — گزارش انطباق ISO 27001 / SOC 2 / GDPR
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const standardParam = searchParams.get("standard") || "ISO_27001";
 const validStandards: ComplianceStandard[] = ["ISO_27001", "SOC_2", "GDPR"];
 const standard = validStandards.includes(standardParam as ComplianceStandard)
? (standardParam as ComplianceStandard)
: "ISO_27001";

 const report = await checkCompliance(standard);
 return NextResponse.json({ success: true, data: report });
 } catch (error) {
 console.error("Compliance audit error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید گزارش انطباق" },
 { status: 500 }
 );
 }
}
