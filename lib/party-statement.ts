// ============ موتور صورت‌حساب طرف‌حساب — هوش (راند ۲۵) ============
// محاسبهٔ مشترک JSON و چاپ — تا منطق دو مسیر هم‌یشه یکسان بماند.
//
// قرارداد حساب‌ها (استاندارد ایرانی):
//   SALE     → بدهکار (مشتری به ما بدهکار می‌شود)      total → debit
//   RETURN   → بستانکار (برگشت از مشتری)               total → credit
//   PURCHASE → بستانکار (ما به تأمین‌کننده بدهکاریم)    total → credit
//   تسویه SALE → بستانکار / تسویه PURCHASE → بدهکار به مبلغ paidAmount
//   مانده = مانده قبلی + بدهکار − بستانکار (مثبت = بدهکارِ طرف)
// تاریخ ردیف تسویه از updatedAt فاکتور (تقریب — مدل پرداختِ جداگانه ندارد).

import { db } from "@/lib/db";

export interface StatementRow {
  date: string;
  kind: "INVOICE" | "PAYMENT" | "RETURN";
  docNumber: string;
  description: string;
  debit: string; // ریال — BigInt به رشته
  credit: string;
  balance: string;
  status?: string;
  dueDate?: string | null;
  invoiceId?: string;
}

export interface PendingCheckRow {
  id: string;
  number: string;
  direction: string; // RECEIVED | ISSUED
  amount: string;
  bankName: string;
  dueDate: string;
  sayadId: string | null;
}

export interface PartyStatement {
  party: {
    id: string;
    name: string;
    code: string;
    type: string;
    mobile: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    economicCode: string | null;
  };
  period: { from: string | null; to: string | null };
  openingBalance: string;
  rows: StatementRow[];
  totals: { debit: string; credit: string; rowCount: number };
  closingBalance: string;
  balanceSide: "DEBIT" | "CREDIT";
  overdueRemaining: string;
  pendingChecks: PendingCheckRow[];
  paymentDateApprox: true;
  generatedAt: string;
}

/**
 * ساخت صورت‌حساب کامل طرف‌حساب.
 * @throws Error «طرف‌حساب یافت نشد» اگر party در این tenant نباشد
 */
export async function buildPartyStatement(
  tenantId: string,
  partyId: string,
  from?: Date | null,
  to?: Date | null
): Promise<PartyStatement> {
  const party = await db.party.findFirst({
    where: { id: partyId, tenantId, deletedAt: null },
  });
  if (!party) throw new Error("طرف‌حساب یافت نشد");

  // ── همه فاکتورهای مؤثر این طرف‌حساب (شامل قبل از بازه برای مانده اول دوره) ──
  const invoices = await db.invoice.findMany({
    where: {
      tenantId,
      partyId,
      deletedAt: null,
      type: { in: ["SALE", "PURCHASE", "RETURN"] },
      status: { notIn: ["DRAFT", "RESERVED", "CANCELLED"] },
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      number: true,
      type: true,
      date: true,
      dueDate: true,
      total: true,
      paidAmount: true,
      status: true,
      description: true,
      currency: true,
      updatedAt: true,
    },
  });

  // ── مانده اول دوره = مانده افتتاحیه + اثر فاکتورهای قبل از from ──
  let opening = BigInt(party.openingBalance ?? 0);
  const inRange: typeof invoices = [];
  for (const inv of invoices) {
    const inFrom = !from || inv.date >= from;
    const inTo = !to || inv.date <= to;
    if (inFrom && inTo) {
      inRange.push(inv);
    } else if (!inFrom) {
      // قبل از بازه — فقط اثرش در مانده اول دوره می‌ماند
      if (inv.type === "SALE") opening += BigInt(inv.total);
      else opening -= BigInt(inv.total); // PURCHASE و RETURN → بستانکار
      if (inv.paidAmount > 0n) {
        if (inv.type === "SALE") opening -= BigInt(inv.paidAmount);
        else if (inv.type === "PURCHASE") opening += BigInt(inv.paidAmount);
      }
    }
  }

  // ── ساخت ردیف‌ها ──
  const rows: StatementRow[] = [];
  let balance = opening;
  let sumDebit = 0n;
  let sumCredit = 0n;

  const pushRow = (
    date: Date,
    kind: StatementRow["kind"],
    docNumber: string,
    description: string,
    debit: bigint,
    credit: bigint,
    extra?: Partial<StatementRow>
  ) => {
    balance += debit - credit;
    sumDebit += debit;
    sumCredit += credit;
    rows.push({
      date: date.toISOString(),
      kind,
      docNumber,
      description,
      debit: debit.toString(),
      credit: credit.toString(),
      balance: balance.toString(),
      ...extra,
    });
  };

  for (const inv of inRange) {
    const total = BigInt(inv.total);
    const paid = BigInt(inv.paidAmount);
    const isForeign = (inv.currency || "IRR") !== "IRR";
    const curNote = isForeign ? ` (${inv.currency})` : "";

    if (inv.type === "SALE") {
      pushRow(inv.date, "INVOICE", inv.number, `فاکتور فروش${curNote}`, total, 0n, {
        status: inv.status,
        dueDate: inv.dueDate?.toISOString() ?? null,
        invoiceId: inv.id,
      });
    } else if (inv.type === "PURCHASE") {
      pushRow(inv.date, "INVOICE", inv.number, `فاکتور خرید${curNote}`, 0n, total, {
        status: inv.status,
        dueDate: inv.dueDate?.toISOString() ?? null,
        invoiceId: inv.id,
      });
    } else {
      pushRow(inv.date, "RETURN", inv.number, `برگشت از فروش${curNote}`, 0n, total, {
        status: inv.status,
        invoiceId: inv.id,
      });
    }

    if (paid > 0n && inv.type !== "RETURN") {
      const label =
        inv.type === "SALE"
          ? `دریافت بابت فاکتور ${inv.number}`
          : `پرداخت بابت فاکتور ${inv.number}`;
      pushRow(
        inv.updatedAt,
        "PAYMENT",
        inv.number,
        label,
        inv.type === "SALE" ? 0n : paid,
        inv.type === "SALE" ? paid : 0n,
        { status: inv.status === "PAID" ? "PAID" : "PARTIALLY_PAID" }
      );
    }
  }

  // ── چک‌های در جریان (REGISTERED — نه وصول‌شده/خرج‌شده) ──
  const pendingChecks = await db.check.findMany({
    where: { tenantId, partyId, deletedAt: null, status: "REGISTERED" },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      number: true,
      type: true,
      amount: true,
      bankName: true,
      dueDate: true,
      sayadId: true,
    },
  });

  // ── جمع وصول معوق ──
  const now = new Date();
  let overdueRemaining = 0n;
  for (const inv of inRange) {
    if (inv.type !== "SALE") continue;
    const remaining = BigInt(inv.total) - BigInt(inv.paidAmount);
    if (remaining > 0n && inv.dueDate && inv.dueDate < now) {
      overdueRemaining += remaining;
    }
  }

  return {
    party: {
      id: party.id,
      name: party.name,
      code: party.code,
      type: party.type,
      mobile: party.mobile,
      phone: party.phone,
      email: party.email,
      address: party.address,
      city: party.city,
      economicCode: party.economicCode,
    },
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    openingBalance: opening.toString(),
    rows,
    totals: { debit: sumDebit.toString(), credit: sumCredit.toString(), rowCount: rows.length },
    closingBalance: balance.toString(),
    balanceSide: balance >= 0n ? "DEBIT" : "CREDIT",
    overdueRemaining: overdueRemaining.toString(),
    pendingChecks: pendingChecks.map((c) => ({
      id: c.id,
      number: c.number,
      direction: c.type,
      amount: c.amount.toString(),
      bankName: c.bankName,
      dueDate: c.dueDate.toISOString(),
      sayadId: c.sayadId,
    })),
    paymentDateApprox: true,
    generatedAt: new Date().toISOString(),
  };
}
