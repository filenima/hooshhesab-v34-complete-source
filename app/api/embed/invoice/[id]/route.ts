import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/embed/invoice/[id]?data=1 — دریافت صورتحساب برای embed و اشتراک‌گذاری
// لینک عمومی فاکتور برای مشتری (ID از نوع cuid است و قابل حدس نیست)
// نکته: مبالغ BigInt به Number تبدیل می‌شوند (NextResponse.json از BigInt پشتیبانی نمی‌کند)

function toNum(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  try {
    return Number(v);
  } catch {
    return 0;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // محدودسازی نرخ برای جلوگیری از enumerate
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`embed-invoice:${ip}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    if (!id || id.length < 10) {
      return NextResponse.json(
        { success: false, error: "شناسه نامعتبر" },
        { status: 400 }
      );
    }

    const invoice = await db.invoice
      .findUnique({
        where: { id },
        include: {
          items: true,
          party: { select: { name: true } },
        },
      })
      .catch(() => null);

    if (!invoice || invoice.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "صورتحساب یافت نشد" },
        { status: 404 }
      );
    }

    // برندینگ کسب‌وکار برای نمایش حرفه‌ای فاکتور اشتراکی
    const tenant = await db.tenant
      .findUnique({
        where: { id: invoice.tenantId },
        select: {
          name: true,
          logoUrl: true,
          invoiceSlogan: true,
          invoiceWebsite: true,
          invoicePhone: true,
          invoiceAddress: true,
        },
      })
      .catch(() => null);

    const subtotal = toNum(invoice.subtotal);
    const tax = toNum(invoice.tax);
    const discount = toNum(invoice.discount);
    const total = toNum(invoice.total);
    const paidAmount = toNum(invoice.paidAmount);

    // شکل flat — مطابق قرارداد invoice-widget و embed HTML
    return NextResponse.json({
      success: true,
      number: invoice.number,
      type: invoice.type,
      status: invoice.status,
      // FIX: فیلد مدل Invoice نامش «date» است نه «issueDate»
      date: invoice.date? new Date(invoice.date).toISOString() : null,
      dueDate: invoice.dueDate? new Date(invoice.dueDate).toISOString() : null,
      partyName: invoice.party?.name ?? "—",
      items: (invoice.items ?? []).map((it) => ({
        description: it.description,
        quantity: Number(it.quantity ?? 0),
        unitPrice: toNum(it.unitPrice),
        total: toNum(it.total),
      })),
      subtotal,
      tax,
      discount,
      total,
      paidAmount,
      currency: invoice.currency ?? "IRR",
      business: tenant
        ? {
            name: tenant.name,
            logoUrl: tenant.logoUrl,
            slogan: tenant.invoiceSlogan,
            website: tenant.invoiceWebsite,
            phone: tenant.invoicePhone,
            address: tenant.invoiceAddress,
          }
        : null,
    });
  } catch (error) {
    console.error("[embed/invoice GET]", error);
    return NextResponse.json({ success: false, error: "خطای سرور" }, { status: 500 });
  }
}
