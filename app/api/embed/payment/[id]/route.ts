import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/embed/payment/[id]?amount=... — دریافت JSON پرداخت برای embed widget
// FIX: مدل Payment وجود ندارد — قبلاً همیشه 404 می‌داد.
// حالا: id می‌تواند شناسه فاکتور باشد (مبلغ باقیمانده فاکتور) یا "demo".
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const amountParam = url.searchParams.get("amount");

    const ip = getClientIp(req);
    const rl = rateLimitCheck(`embed-payment:${ip}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    // حالت دمو
    if (id === "demo" || id === "test") {
      return NextResponse.json({
        success: true,
        id: "demo",
        amount: parseInt(amountParam || "0", 10) || 100000,
        status: "PENDING",
        description: "پرداخت نمونه",
        gateway: "zarinpal",
        payment: {
          id: "demo",
          amount: parseInt(amountParam || "0", 10) || 100000,
          status: "PENDING",
          description: "پرداخت نمونه",
          gateway: "zarinpal",
        },
      });
    }

    // شناسه فاکتور → مبلغ باقیمانده (ریال)
    if (id.length >= 10) {
      const invoice = await db.invoice
        .findUnique({
          where: { id },
          select: {
            id: true,
            number: true,
            total: true,
            paidAmount: true,
            status: true,
          },
        })
        .catch(() => null);

      if (invoice && invoice.status !== "CANCELLED") {
        const total = Number(invoice.total ?? 0n);
        const paid = Number(invoice.paidAmount ?? 0n);
        const remaining = Math.max(total - paid, 0);
        return NextResponse.json({
          success: true,
          id: invoice.id,
          invoiceNumber: invoice.number,
          amount: remaining,
          status: "PENDING",
          description: `پرداخت فاکتور ${invoice.number}`,
          gateway: "zarinpal",
          payment: {
            id: invoice.id,
            invoiceNumber: invoice.number,
            amount: remaining,
            status: "PENDING",
            description: `پرداخت فاکتور ${invoice.number}`,
            gateway: "zarinpal",
          },
        });
      }
    }

    return NextResponse.json(
      { success: false, error: "پرداخت یافت نشد" },
      { status: 404 }
    );
  } catch (error) {
    console.error("[embed/payment GET]", error);
    return NextResponse.json({ success: false, error: "خطای سرور" }, { status: 500 });
  }
}
