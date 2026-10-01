import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;
 setTimeout(() => process.exit(0), 1000);
 return NextResponse.json({ success: true, message: "سرور در حال راه‌اندازی مجدد..." });
}
