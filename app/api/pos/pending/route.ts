import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Task 24-POS-BRIDGE — GET /api/pos/pending ============
//
// «صف پرداخت‌های منتظر کارتخوان» — پل محلی هوش (pos-bridge/hoosh-pos-bridge.js)
// هر چند ثانیه این مسیر را صدا می‌زند تا بفهمد فاکتور تازه‌ای برای شارژ POS
// منتظر است (معماری polling — چون مغازه پشت NAT است و سرور نمی‌تواند مستقیم
// به پل وصل شود؛ همان روش نرم‌افزارهای حسابداری داخلی).
//
// منطق: آخرین فاکتور «فروشِ نقدیِ صادرشدهٔ تسویه‌نشده» در ۱۰ دقیقهٔ اخیر —
// فقط ۱ درخواست در هر پاسخ (صف تک‌به‌تک؛ پل بعد از گزارش نتیجه، فاکتور PAID
// می‌شود و از صف خارج می‌شود).
//
// احراز هویت: requireUser (همان بقیه APIها) — توکن پل همان توکن کاربر است.
// query: ?terminalId=... (اختیاری — برای ثبت در AuditLog/عیب‌یابی چندترمیناله)

/** پنجرهٔ اعتبار درخواست — ۱۰ دقیقه */
const PENDING_WINDOW_MS = 10 * 60_000;

/** وضعیت‌هایی که یعنی «فاکتور صادر شده ولی هنوز تسویه نشده» */
const PENDING_STATUSES = ["SENT", "PARTIALLY_PAID", "PARTIAL", "OVERDUE"];

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { userId, tenantId } = auth.user;

    // محدودیت نرخ مناسبی برای polling پل (پیش‌فرض ۳ ثانیه = ۲۰/دقیقه)
    const rl = rateLimitCheck(`pos-pending:${tenantId}:${userId}`, 120, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست‌های بیش از حد — فاصلهٔ polling را افزایش دهید" },
        { status: 429 }
      );
    }

    const terminalId = (req.nextUrl.searchParams.get("terminalId") || "").trim().slice(0, 50);

    const invoice = await db.invoice.findFirst({
      where: {
        tenantId,
        type: "SALE",
        paymentType: "CASH",
        status: { in: PENDING_STATUSES },
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - PENDING_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        total: true,
        paidAmount: true,
        currency: true,
        exchangeRate: true,
        createdAt: true,
        party: { select: { name: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({
        success: true,
        data: { pending: null, terminalId: terminalId || null, serverTime: new Date().toISOString() },
      });
    }

    const remaining = invoice.total - invoice.paidAmount;
    return NextResponse.json({
      success: true,
      data: {
        pending: {
          requestId: invoice.id,
          invoiceNumber: invoice.number,
          amountRial: Number(invoice.total),
          remainingRial: Number(remaining > 0n ? remaining : invoice.total),
          currency: invoice.currency || "IRR",
          partyName: invoice.party?.name ?? null,
          issuedAt: invoice.createdAt.toISOString(),
        },
        terminalId: terminalId || null,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("[GET /api/pos/pending]", msg);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت درخواست‌های منتظر کارتخوان" },
      { status: 500 }
    );
  }
}
