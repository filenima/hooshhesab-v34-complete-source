// ============ صورت‌حساب طرف‌حساب (JSON) — هوش (راند ۲۵) ============
// GET /api/parties/[id]/statement?from=ISO&to=ISO
// منطق مشترک در lib/party-statement.ts (با مسیر چاپ یکسان).

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, rateLimit } from "@/lib/auth";
import { buildPartyStatement } from "@/lib/party-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`party-statement:${ip}`, 30, 60_000)) {
      return NextResponse.json(
        { success: false, error: "سقف درخواست پر شده است" },
        { status: 429 }
      );
    }

    const auth = await getAuthContext(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const from = fromParam ? new Date(fromParam) : null;
    const to = toParam ? new Date(toParam) : null;
    if (
      (fromParam && isNaN(from?.getTime() as number)) ||
      (toParam && isNaN(to?.getTime() as number))
    ) {
      return NextResponse.json(
        { success: false, error: "بازه تاریخ نامعتبر است" },
        { status: 400 }
      );
    }

    const data = await buildPartyStatement(auth.tenantId, id, from, to);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    if (msg.includes("یافت نشد")) {
      return NextResponse.json({ success: false, error: msg }, { status: 404 });
    }
    console.error("Party statement error:", msg);
    return NextResponse.json(
      { success: false, error: "خطا در تولید صورت‌حساب طرف‌حساب" },
      { status: 500 }
    );
  }
}
