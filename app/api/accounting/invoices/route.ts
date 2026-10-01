import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { convertToIrr, getLatestRate } from "@/lib/currency";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { getAuthContext } from "@/lib/auth";
import { invalidateDashboardCache } from "@/lib/cache";
import { nextDocumentNumber } from "@/lib/document-sequence";
import {
  getVatRateFraction,
  isAutoPostJournalsEnabled,
  isFinalInvoiceStatus,
  postInvoiceToLedger,
  postInvoiceSettlementToLedger,
  reverseInvoiceLedger,
  invoiceHasPostedLedger,
} from "@/lib/accounting";
import { moveStockForInvoice, reverseInvoiceStock, NegativeStockError } from "@/lib/products";
import { sanitizePagination } from "@/lib/validators";

export const runtime = "nodejs";

/** خطای ورودی نامعتبر — برای تفکیک 400 از 500 */
class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

// نرمال‌سازی نرخ مالیات به کسر اعشاری [0, 1]
// FIX (MONEY BUG): قبلاً taxRate خام مصرف می‌شد — ارسال ۹ (به‌جای ۰٫۰۹) مالیات ۹۰۰٪
// تولید می‌کرد. حالا: مقدار > ۱ درصد فرض شده و ÷۱۰۰ می‌شود، سپس در بازه [0,1] قفل می‌شود.
// FIX(3b-بیگ‌۶): پیش‌فرض ۱۰٪ (قبلاً ۹٪) — نرخ قانونی مالیات ارزش افزوده از ۱۴۰۴.
function normalizeTaxRate(raw: unknown, fallback: number): number {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = fallback;
  if (n < 0) n = 0;
  if (n > 1) n = n / 100; // درصد کسر (مثلاً 10 → 0.1)
  return Math.min(n, 1);
}

// وضعیت‌های مجاز فاکتور — PARTIAL (قدیمی) به PARTIALLY_PAID نگاشت می‌شود (3b-بیگ‌۱۲)
const ALLOWED_INVOICE_STATUSES = [
  "DRAFT",
  "PENDING",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
] as const;

const ALLOWED_INVOICE_TYPES = ["SALE", "PURCHASE", "PRE_INVOICE", "RETURN"] as const;

/** نرمال‌سازی وضعیت ارسالی + نگاشت PARTIAL → PARTIALLY_PAID */
function normalizeInvoiceStatus(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "PARTIAL") return "PARTIALLY_PAID"; // FIX(3b-بیگ‌۱۲): هم‌ساز با settlements
  return (ALLOWED_INVOICE_STATUSES as readonly string[]).includes(s) ? s : null;
}

// POST /api/accounting/invoices — ایجاد فاکتور جدید
// FIX(3b-بیگ‌۲) CRITICAL: ایجاد فاکتور در یک $transaction واحد انجام می‌شود:
//  ۱) ذخیرهٔ فاکتور + اقلام
//  ۲) حرکت انبار (فروش=خروج با گارد منفی / خرید=ورود با میانگین موزون / برگشت=ورود)
//  ۳) سند حسابداری خودکار (فروش/خرید/برگشت) — فقط برای وضعیت نهایی غیر DRAFT
// اگر هر مرحله fail شود، کل فاکتور rollback می‌شود (فاکتور بدون سند/انبار نمی‌ماند).
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`invoice-create:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const body = await req.json();
    // FIX(zero-stock): تأیید صریح کاربر برای فاکتور با موجودی صفر/منفی (از دیالوگ کلاینت)
    const allowNegStock: boolean = body?.allowNegativeStock === true;
    const {
      type = "SALE",
      partyId,
      // فاکتور سریع: نام طرف‌حساب به‌جای id — اگر id نبود، با نام پیدا/ساخته می‌شود
      partyName,
      date,
      dueDate,
      warehouseId,
      items = [],
      description,
      currency = "IRR",
      exchangeRate,
      // FIX(3b-بیگ‌۲): وضعیت اولیه — DRAFT هیچ سند/حرکت انباری نمی‌سازد؛
      // وضعیت نهایی (SENT/PAID/...) در همان تراکنش سند + انبار را اعمال می‌کند.
      status = "DRAFT",
    } = body;

    // SECURITY (C1/C2/M12): احراز هویت اجباری + tenantId از auth (نه از party)
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;
    const userId = ctx.userId;

    // FIX(v18-سهمیه): اعمال maxInvoices پلن سمت سرور — قبلاً فقط نمایشی بود.
    // کاربر دمو محدود نیست؛ خطا ۴۰۳ + upgrade:true برای نمایش مودال ارتقا در UI.
    const { checkInvoiceQuota, quotaResponse } = await import("@/lib/license-quota");
    const quota = await checkInvoiceQuota(tenantId, userId);
    if (!quota.ok) {
      return quotaResponse(quota);
    }

    // اعتبارسنجی نوع فاکتور
    const invoiceType = String(type || "SALE").toUpperCase();
    if (!(ALLOWED_INVOICE_TYPES as readonly string[]).includes(invoiceType)) {
      return NextResponse.json(
        { success: false, error: "نوع فاکتور نامعتبر است" },
        { status: 400 }
      );
    }

    // اعتبارسنجی وضعیت (PARTIAL قدیمی → PARTIALLY_PAID)
    const invoiceStatus = normalizeInvoiceStatus(status);
    if (!invoiceStatus) {
      return NextResponse.json(
        { success: false, error: "وضعیت فاکتور نامعتبر است" },
        { status: 400 }
      );
    }

    if (!partyId && !partyName) {
      return NextResponse.json(
        { success: false, error: "طرف‌حساب الزامی است" },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "حداقل یک قلم فاکتور الزامی است" },
        { status: 400 }
      );
    }

    // FIX(3b — ممیزی ۱.۴/۲.۱): اعتبارسنجی تاریخ‌ها — رشتهٔ نامعتبر قبلاً خطای
    // Prisma و 500 نامفهوم می‌داد؛ حالا 400 فارسی برمی‌گردد.
    const invoiceDate = date ? new Date(date) : new Date();
    if (Number.isNaN(invoiceDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "تاریخ فاکتور نامعتبر است" },
        { status: 400 }
      );
    }
    let invoiceDueDate: Date | null = null;
    if (dueDate) {
      invoiceDueDate = new Date(dueDate);
      if (Number.isNaN(invoiceDueDate.getTime())) {
        return NextResponse.json(
          { success: false, error: "تاریخ سررسید نامعتبر است" },
          { status: 400 }
        );
      }
    }

    // SECURITY (M12): طرف‌حساب باید متعلق به tenant کاربر باشد
    let resolvedPartyId = partyId as string | undefined;

    if (!resolvedPartyId && partyName) {
      // فاکتور سریع: پیدا کردن طرف‌حساب با نام دقیق یا ساخت خودکار
      const cleanName = String(partyName).trim().slice(0, 100);
      if (cleanName) {
        const existing = await db.party.findFirst({
          where: { tenantId, name: cleanName, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
          resolvedPartyId = existing.id;
        } else {
          // ساخت طرف‌حساب جدید فقط با نام — کد یکتا بر اساس شمارنده
          const count = await db.party.count({ where: { tenantId } });
          let seq = count + 1;
          let code = `P-${String(seq).padStart(4, "0")}`;
          // اطمینان از یکتایی کد (در صورت وجود کد دستی قبلی)
          while (
            await db.party.findFirst({ where: { tenantId, code }, select: { id: true } })
          ) {
            seq += 1;
            code = `P-${String(seq).padStart(4, "0")}`;
          }
          const created = await db.party.create({
            data: {
              tenantId,
              code,
              name: cleanName,
              type: "CUSTOMER",
            },
            select: { id: true },
          });
          resolvedPartyId = created.id;
        }
      }
    }

    if (!resolvedPartyId) {
      return NextResponse.json(
        { success: false, error: "طرف‌حساب یافت نشد" },
        { status: 404 }
      );
    }

    if (partyId) {
      // وقتی id صریح ارسال شده، تعلقش به tenant را بررسی کن
      const party = await db.party.findFirst({
        where: { id: partyId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!party) {
        return NextResponse.json(
          { success: false, error: "طرف‌حساب یافت نشد" },
          { status: 404 }
        );
      }
    }

    // تعیین نرخ تبدیل ارز به ریال — اگر ارز غیرریالی و نرخ ارسال نشده، از آخرین نرخ ثبت‌شده استفاده می‌کنیم
    const normCurrency = String(currency || "IRR").toUpperCase();
    let finalRate = 1;
    if (normCurrency === "TOMAN") {
      // تومان = ریال ÷ ۱۰ — نرخ ثابت
      finalRate = 10;
    } else if (normCurrency !== "IRR") {
      if (typeof exchangeRate === "number" && exchangeRate > 0) {
        finalRate = exchangeRate;
      } else {
        const latest = await getLatestRate(normCurrency, "IRR");
        finalRate = latest ?? 1;
      }
    }

    // FIX(3b-بیگ‌۵/۶): نرخ پیش‌فرض مالیات از SystemSettings (tax.vatRate) —
    // fallback ۱۰٪ (نرخ قانونی ۱۴۰۴+). قبلاً ۹٪ hardcode بود.
    const defaultVatRate = await getVatRateFraction();

    // محاسبه مبالغ به ارز فاکتور (foreignAmount) سپس تبدیل به ریال برای ذخیره‌سازی
    // FIX(3b — ممیزی ۲.۱): مقادیر منفی/NaN اقلام رد می‌شوند (قبلاً `-5` truthy بود!)
    let subtotalForeign = 0;
    let taxForeign = 0;
    const productIds: string[] = [];
    const processedItems = items.map((item: Record<string, unknown>) => {
      const quantity = Number(item.quantity ?? 1);
      const unitPrice = Number(item.unitPrice ?? 0); // به ارز فاکتور
      const discount = Number(item.discount ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new InvalidInputError("تعداد اقلام باید عددی مثبت باشد");
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new InvalidInputError("قیمت واحد نمی‌تواند منفی باشد");
      }
      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        throw new InvalidInputError("درصد تخفیف باید بین ۰ تا ۱۰۰ باشد");
      }
      // FIX: نرمال‌سازی/اعتبارسنجی — ورودی درصدی (10) یا کسری (0.1) هر دو درست
      const taxRate =
        item.taxRate === undefined || item.taxRate === null
          ? defaultVatRate
          : normalizeTaxRate(item.taxRate, defaultVatRate);
      const lineTotalForeign = quantity * unitPrice * (1 - discount / 100);
      const lineTaxForeign = lineTotalForeign * taxRate;
      subtotalForeign += lineTotalForeign;
      taxForeign += lineTaxForeign;
      const productId = (item.productId as string) || null;
      if (productId) productIds.push(productId);
      return {
        description: (item.description as string) || "",
        quantity,
        // مبالغ BigInt-safe به ریال (با ضرب در نرخ تبدیل)
        unitPrice: BigInt(Math.round(unitPrice * finalRate)),
        discount,
        taxRate,
        taxAmount: BigInt(Math.round(lineTaxForeign * finalRate)),
        total: BigInt(Math.round((lineTotalForeign + lineTaxForeign) * finalRate)),
        productId,
      };
    });

    // SECURITY (M12 — ممیزی ۲.۱): مالکیت productId ها — ردیف فاکتور نباید به
    // کالای tenant دیگری وصل شود.
    const ownedProducts =
      productIds.length > 0
        ? await db.product.findMany({
            where: { id: { in: productIds }, tenantId, deletedAt: null },
            select: { id: true, name: true, type: true },
          })
        : [];
    const ownedProductIds = new Set(ownedProducts.map((p) => p.id));
    for (const pid of productIds) {
      if (!ownedProductIds.has(pid)) {
        return NextResponse.json(
          { success: false, error: "کالای مورد نظر یافت نشد" },
          { status: 400 }
        );
      }
    }
    const productNames = new Map(ownedProducts.map((p) => [p.id, p.name]));

    const subtotal = subtotalForeign * finalRate;
    const tax = taxForeign * finalRate;
    const total = subtotal + tax;

    // تولید شماره فاکتور — اتمیک با DocumentSequence (پادزهرِ M2 — شرط مسابقه)
    const { number } = await nextDocumentNumber("INVOICE", tenantId);

    // آیا فاکتور در وضعیت نهایی ثبت می‌شود؟ → سند + انبار در همان تراکنش
    const willFinalize = isFinalInvoiceStatus(invoiceStatus);
    const autoPost = willFinalize ? await isAutoPostJournalsEnabled() : false;

    // شمارهٔ سند حسابداری باید «قبل از tx» تخصیص یابد (SQLite تک‌نویسنده —
    // upsert بیرون از tx امن است؛ اگر tx rollback شود فقط یک gap می‌ماند).
    let journalNumber = 0;
    if (willFinalize && autoPost) {
      journalNumber = (await nextDocumentNumber("JOURNAL", tenantId)).seq;
    }

    const stockContextItems = processedItems
      .filter((it) => it.productId)
      .map((it) => ({
        productId: it.productId as string,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      }));

    const invoice = await db.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId,
          number,
          type: invoiceType,
          partyId: resolvedPartyId,
          date: invoiceDate,
          dueDate: invoiceDueDate,
          warehouseId: warehouseId || null,
          subtotal: BigInt(Math.round(subtotal)),
          tax: BigInt(Math.round(tax)),
          total: BigInt(Math.round(total)),
          status: invoiceStatus,
          modianStatus: "PENDING",
          createdBy: userId ?? null,
          description: description || null,
          currency: normCurrency,
          exchangeRate: normCurrency === "IRR" ? 1 : finalRate,
          items: { create: processedItems },
        },
        include: { items: true, party: true },
      });

      // FIX(3b-بیگ‌۲) — حرکت انبار در همان تراکنش:
      // SALE=خروج (با گارد منفی) / PURCHASE=ورود / RETURN=ورود مجدد
      if (willFinalize && stockContextItems.length > 0) {
        await moveStockForInvoice(
          tx,
          tenantId,
          {
            invoiceId: created.id,
            type: invoiceType,
            date: invoiceDate,
            warehouseId: warehouseId || null,
            allowNegativeStock: allowNegStock === true,
          },
          stockContextItems,
          productNames
        );
      }

      // FIX(3b-بیگ‌۲) — سند حسابداری خودکار در همان تراکنش (فقط غیر DRAFT)
      if (willFinalize && autoPost) {
        await postInvoiceToLedger(
          tx,
          tenantId,
          userId,
          {
            invoiceId: created.id,
            number,
            type: invoiceType,
            date: invoiceDate,
            description: description || null,
            subtotal: created.subtotal,
            tax: created.tax,
            discount: created.discount,
            total: created.total,
          },
          { journalNumber }
        );
      }

      return created;
    });

    // FIX(هم‌خوانی پاسخ): مبالغ به‌صورت Number برمی‌گردند تا با GET /api/accounting/invoices
    // هم‌شکل باشند — قبلاً POST رشته ("327000") و GET عدد (327000) می‌داد و
    // محاسبات سمت کلاینت روی پاسخ POST خراب می‌شد.
    const safeInvoice = {
      ...invoice,
      subtotal: Number(invoice.subtotal),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      discount: Number(invoice.discount),
      otherCosts: Number(invoice.otherCosts),
      paidAmount: Number(invoice.paidAmount),
      // نمایش مبلغ به ارز مبدأ برای کاربر
      foreignTotal:
        normCurrency !== "IRR"
          ? Number(invoice.total) / (invoice.exchangeRate ?? 1)
          : 0,
      items: invoice.items.map((it) => ({
        ...it,
        unitPrice: Number(it.unitPrice),
        taxAmount: Number(it.taxAmount),
        total: Number(it.total),
      })),
      party: invoice.party
        ? {
            ...invoice.party,
            creditLimit: Number(invoice.party.creditLimit),
            openingBalance: Number(invoice.party.openingBalance),
          }
        : null,
    };

    // باطل‌سازی کش داشبورد — فاکتور جدید باید بلافاصله در KPIها دیده شود
    invalidateDashboardCache(tenantId);

    return NextResponse.json({
      success: true,
      data: safeInvoice,
      message: `فاکتور ${number} با موفقیت ایجاد شد${
        normCurrency !== "IRR"
          ? ` (به ${normCurrency} با نرخ ${finalRate.toLocaleString("en-US")})`
          : ""
      }`,
    });
  } catch (error) {
    // FIX(3b-بیگ‌۲): گارد موجودی منفی → 400 فارسی (نه 500)
    if (error instanceof NegativeStockError) {
      return NextResponse.json(
        { success: false, error: `موجودی منفی مجاز نیست — ${error.productName}` },
        { status: 400 }
      );
    }
    if (error instanceof InvalidInputError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    console.error("Create invoice error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد فاکتور" },
      { status: 500 }
    );
  }
}

// GET /api/accounting/invoices — لیست فاکتورها با فیلتر، مرتب‌سازی و صفحه‌بندی
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    // FIX(v11-OVERDUE): وضعیت «سررسید گذشته» قبلاً هیچ‌جا نوشته نمی‌شد — تب
    // معوق، یادآورها و تحلیل ریسک همیشه خالی بودند. اینجا idempotent marks
    // می‌کنیم (فقط وضعیت‌های بازِ دارای سررسید گذشته → OVERDUE).
    try {
      await db.invoice.updateMany({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          status: { in: ["SENT", "PENDING", "PARTIALLY_PAID"] },
          dueDate: { lt: new Date() },
        },
        data: { status: "OVERDUE" },
      });
    } catch {
      /* نباید لیست را قطع کند */
    }
    const tenantId = ctx.tenantId;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const currency = searchParams.get("currency");
    const partyId = searchParams.get("partyId");
    const search = searchParams.get("search");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");
    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    // FIX(3b): sanitizePagination (lib/validators) — limit=abc قبلاً NaN → خطای Prisma
    const { limit, offset } = sanitizePagination(
      searchParams.get("limit"),
      searchParams.get("offset"),
      500,
      50
    );

    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (type) where.type = type;
    if (status) where.status = status;
    if (currency) where.currency = currency;
    if (partyId) where.partyId = partyId;

    // جستجو در شماره و توضیحات
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // فیلتر بازه تاریخ
    // FIX(3b — ممیزی ۱.۴): مرز روزِ پایان — `new Date("2026-06-30")` نیمه‌شب UTC
    // است و رکوردهای همان روز را از فیلتر خارج می‌کرد؛ الگوی صحیح
    // inventory/movements (T23:59:59.999) اعمال شد.
    if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {};
      if (fromDate) dateFilter.gte = new Date(`${fromDate}T00:00:00`);
      if (toDate) dateFilter.lte = new Date(`${toDate}T23:59:59.999`);
      if (
        (dateFilter.gte && Number.isNaN(dateFilter.gte.getTime())) ||
        (dateFilter.lte && Number.isNaN(dateFilter.lte.getTime()))
      ) {
        return NextResponse.json(
          { success: false, error: "بازه تاریخ نامعتبر است" },
          { status: 400 }
        );
      }
      where.date = dateFilter;
    }

    // فیلتر بازه مبلغ
    if (minAmount || maxAmount) {
      const totalFilter: Record<string, bigint> = {};
      if (minAmount) totalFilter.gte = BigInt(Math.round(Number(minAmount)));
      if (maxAmount) totalFilter.lte = BigInt(Math.round(Number(maxAmount)));
      where.total = totalFilter;
    }

    // مرتب‌سازی — فقط فیلدهای مجاز
    const validSortFields = ["date", "createdAt", "total", "status", "number"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "date";
    const orderBy = { [sortField]: sortOrder };

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: { party: true, items: true },
        orderBy,
        take: limit,
        skip: offset,
      }),
      db.invoice.count({ where }),
    ]);

    // سریالایز BigInt و افزودن foreignTotal برای فاکتورهای چندارزی
    const safe = invoices.map((inv) => ({
      ...inv,
      subtotal: Number(inv.subtotal),
      tax: Number(inv.tax),
      total: Number(inv.total),
      discount: Number(inv.discount),
      otherCosts: Number(inv.otherCosts),
      paidAmount: Number(inv.paidAmount),
      foreignTotal:
        inv.currency !== "IRR" && inv.exchangeRate
          ? Number(inv.total) / inv.exchangeRate
          : 0,
      items: inv.items.map((it) => ({
        ...it,
        unitPrice: Number(it.unitPrice),
        taxAmount: Number(it.taxAmount),
        total: Number(it.total),
      })),
      party: inv.party
        ? {
            ...inv.party,
            creditLimit: Number(inv.party.creditLimit),
            openingBalance: Number(inv.party.openingBalance),
          }
        : null,
    }));

    return NextResponse.json({ success: true, data: safe, total, limit, offset });
  } catch (error) {
    console.error("List invoices error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت فاکتورها" },
      { status: 500 }
    );
  }
}

// PATCH /api/accounting/invoices — عملیات دسته‌ای روی فاکتورها
// Body: { ids: string[], action: "markPaid" | "cancel" | "delete", amount?: number }
// SECURITY (C1/C2): احراز هویت اجباری + فیلتر tenant
//
// FIX(3b-بیگ‌۳) CRITICAL: markPaid قبلاً فقط status="PAID" می‌گذاشت و paidAmount
// را صفر رها می‌کرد (گزارش‌های _sum.paidAmount همه غلط). حالا:
//  - amount (ریال) ارسال شود → paidAmount += amount (تا سقف total)
//  - amount ارسال نشود → پرداخت کامل (paidAmount = total)
//  - وضعیت: PAID اگر کامل واریز شد، وگرنه PARTIALLY_PAID (هم‌ساز با settlements)
//
// FIX(3b-بیگ‌۲): cancel/delete سند حسابداری و حرکت انبار را «معکوس» می‌کنند
// (سند قرینه + حرکت برگشتی انبار) — قبلاً اثر مالی/انباری فاکتور می‌ماند.
export async function PATCH(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ctx0 = await getAuthContext(req).catch(() => null);
    // FIX(v11-POS): سقف ۵/دقیقه برای صندوق POS کشنده بود (هر فروش یک markPaid
    // می‌زند → فروش ششم 429). سقف بر اساس tenant و کاربر لاگین‌شده بالاتر؛
    // برای مهمان همان ۵ قبلی می‌ماند.
    const rl = ctx0
      ? rateLimitCheck(`invoice-bulk:${ctx0.tenantId}:${ctx0.userId ?? ip}`, 60, 60_000)
      : rateLimitCheck(`invoice-bulk:${ip}`, 5, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد" },
        { status: 429 }
      );
    }

    const ctx = ctx0;
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;
    const userId = ctx.userId;

    const body = await req.json();
    const { ids, action, amount } = body as {
      ids?: string[];
      action?: string;
      amount?: number;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "لیست شناسه‌ها الزامی است" },
        { status: 400 }
      );
    }
    if (!action) {
      return NextResponse.json(
        { success: false, error: "نوع عملیات الزامی است" },
        { status: 400 }
      );
    }
    if (ids.length > 100) {
      return NextResponse.json(
        { success: false, error: "حداکثر ۱۰۰ فاکتور در هر درخواست" },
        { status: 400 }
      );
    }

    const validActions = ["markPaid", "cancel", "delete"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `عملیات نامعتبر. مقادیر مجاز: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    // FIX(3b-بیگ‌۳): مبلغ پرداخت اختیاری — ریال؛ نامعتبر/منفی → 400
    let paymentAmount: bigint | undefined;
    if (amount !== undefined && amount !== null) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { success: false, error: "مبلغ پرداخت نامعتبر است (باید عددی مثبت به ریال باشد)" },
          { status: 400 }
        );
      }
      paymentAmount = BigInt(Math.round(n));
    }

    // فاکتورهای هدف (با اقلام — برای نهایی‌سازی سند/انبار)
    const statusFilter =
      action === "markPaid"
        ? { status: { notIn: ["CANCELLED"] } }
        : action === "cancel"
          ? { status: { notIn: ["PAID", "CANCELLED"] } }
          : {};
    const targets = await db.invoice.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null, ...statusFilter },
      include: { items: true },
      orderBy: { date: "asc" },
    });

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        action,
        message: "فاکتور واجد شرایطی برای این عملیات یافت نشد",
      });
    }

    const autoPost = await isAutoPostJournalsEnabled();

    // تخصیص شماره‌های سند «قبل از tx» (SQLite تک‌نویسنده):
    //  - markPaid: برای فاکتورهایی که هنوز سند ندارند و نهایی می‌شوند
    //  - cancel/delete: سند قرینه برای فاکتورهایی که سندِ POSTED دارند
    const journalNumbers = new Map<string, number>();
    const reversalNumbers = new Map<string, number>();
    // FIX(سند تسویه): شمارهٔ سند دریافت/پرداخت — برای فاکتورهای SALE/PURCHASE
    // که در این markPaid مبلغی به paidAmount اضافه می‌کنند
    const settlementNumbers = new Map<string, number>();
    for (const inv of targets) {
      const hasPosted = await invoiceHasPostedLedger(tenantId, inv.id);
      if (action === "markPaid") {
        const willBeFinal =
          isFinalInvoiceStatus(inv.status) ||
          (paymentAmount !== undefined ? paymentAmount > 0n : inv.total > inv.paidAmount);
        if (!hasPosted && willBeFinal) {
          journalNumbers.set(inv.id, (await nextDocumentNumber("JOURNAL", tenantId)).seq);
        }
        // سند تسویه — فقط SALE/PURCHASE با افزایش واقعی paidAmount
        const remaining = inv.total - inv.paidAmount;
        const willIncrement =
          (paymentAmount !== undefined ? paymentAmount > 0n : remaining > 0n) &&
          remaining > 0n &&
          (inv.type === "SALE" || inv.type === "PURCHASE");
        if (willIncrement) {
          settlementNumbers.set(inv.id, (await nextDocumentNumber("JOURNAL", tenantId)).seq);
        }
      } else if ((action === "cancel" || action === "delete") && hasPosted) {
        reversalNumbers.set(inv.id, (await nextDocumentNumber("JOURNAL", tenantId)).seq);
      }
    }

    let updatedCount = 0;

    await db.$transaction(async (tx) => {
      for (const inv of targets) {
        if (action === "markPaid") {
          // FIX(3b-بیگ‌۳): paidAmount += amount و وضعیت PARTIALLY_PAID/PAID
          const remaining = inv.total - inv.paidAmount;
          const increment =
            paymentAmount !== undefined
              ? paymentAmount < remaining
                ? paymentAmount
                : remaining
              : remaining;
          const newPaid = inv.paidAmount + (increment > 0n ? increment : 0n);
          const newStatus = newPaid >= inv.total ? "PAID" : "PARTIALLY_PAID";

          // نهایی‌سازی فاکتور DRAFT/PENDING که برای اولین بار واریز می‌شود:
          // سند + حرکت انبار در همین تراکنش (idempotent — دوباره‌اعمال نمی‌شود)
          const wasFinal = isFinalInvoiceStatus(inv.status);
          if (!wasFinal && increment > 0n) {
            await finalizeInvoiceInTx(
              tx,
              tenantId,
              userId,
              inv,
              journalNumbers.get(inv.id) ?? 0,
              autoPost
            );
          }
          // فاکتورهای نهاییِ بدون سند (legacy) هم با اولین markPaid سند می‌گیرند
          if (wasFinal && autoPost && journalNumbers.has(inv.id)) {
            await postInvoiceToLedger(
              tx,
              tenantId,
              userId,
              {
                invoiceId: inv.id,
                number: inv.number,
                type: inv.type,
                date: inv.date,
                description: inv.description,
                subtotal: inv.subtotal,
                tax: inv.tax,
                discount: inv.discount,
                total: inv.total,
              },
              { journalNumber: journalNumbers.get(inv.id) ?? 0 }
            );
          }

          await tx.invoice.update({
            where: { id: inv.id },
            data: { paidAmount: newPaid, status: newStatus },
          });
          // FIX(سند تسویه): ثبت سند دریافت/پرداخت در دفاتر —
          // صندوق بدهکار / دریافتنی بستانکار (فروش) یا قرینهٔ آن (خرید)
          if (increment > 0n && settlementNumbers.has(inv.id)) {
            try {
              await postInvoiceSettlementToLedger(
                tx,
                tenantId,
                userId,
                {
                  invoiceId: inv.id,
                  number: inv.number,
                  type: inv.type,
                  date: inv.date,
                  description: inv.description,
                },
                increment,
                { journalNumber: settlementNumbers.get(inv.id) ?? 0 }
              );
            } catch {
              // خطای سند تسویه نباید کل تراکنش را قطع کند — paidAmount مهم‌تر است
            }
          }
          updatedCount++;
        } else if (action === "cancel") {
          // FIX(3b-بیگ‌۲): معکوس‌سازی سند + انبار قبل از ابطال
          if (reversalNumbers.has(inv.id)) {
            await reverseInvoiceLedger(
              tx,
              tenantId,
              userId,
              inv.id,
              "ابطال فاکتور",
              { reversalNumber: reversalNumbers.get(inv.id) ?? 0 }
            );
          }
          await reverseInvoiceStock(tx, tenantId, inv.id);
          await tx.invoice.update({
            where: { id: inv.id },
            data: { status: "CANCELLED" },
          });
          updatedCount++;
        } else if (action === "delete") {
          // حذف نرم — با معکوس‌سازی کامل اثر مالی/انباری
          if (reversalNumbers.has(inv.id)) {
            await reverseInvoiceLedger(
              tx,
              tenantId,
              userId,
              inv.id,
              "حذف فاکتور",
              { reversalNumber: reversalNumbers.get(inv.id) ?? 0 }
            );
          }
          await reverseInvoiceStock(tx, tenantId, inv.id);
          await tx.invoice.update({
            where: { id: inv.id },
            data: { deletedAt: new Date() },
          });
          updatedCount++;
        }
      }
    });

    const actionLabels: Record<string, string> = {
      markPaid: "تسویه",
      cancel: "ابطال",
      delete: "حذف",
    };

    // باطل‌سازی کش داشبورد — تغییر وضعیت دسته‌ای فاکتورها
    invalidateDashboardCache(tenantId);

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      action,
      message: `${updatedCount} فاکتور ${actionLabels[action]} شد`,
    });
  } catch (error) {
    if (error instanceof NegativeStockError) {
      return NextResponse.json(
        { success: false, error: `موجودی منفی مجاز نیست — ${error.productName}` },
        { status: 400 }
      );
    }
    console.error("Bulk invoice operation error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در عملیات دسته‌ای فاکتورها" },
      { status: 500 }
    );
  }
}

/**
 * نهایی‌سازی فاکتور داخل تراکنش: حرکت انبار + سند حسابداری — idempotent.
 * (برای فاکتور DRAFT که اولین پرداخت/وضعیت نهایی را می‌گیرد)
 */
async function finalizeInvoiceInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string | null | undefined,
  inv: {
    id: string;
    number: string;
    type: string;
    date: Date;
    description: string | null;
    subtotal: bigint;
    tax: bigint;
    discount: bigint;
    total: bigint;
    warehouseId: string | null;
    items: Array<{ productId: string | null; quantity: number; unitPrice: bigint }>;
  },
  journalNumber: number,
  autoPost: boolean
): Promise<void> {
  // حرکت انبار — فقط اقلام دارای productId
  const stockItems = inv.items
    .filter((it) => it.productId)
    .map((it) => ({
      productId: it.productId as string,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }));
  if (stockItems.length > 0) {
    const productNames = new Map<string, string>();
    const products = await tx.product.findMany({
      where: { id: { in: stockItems.map((s) => s.productId) }, tenantId },
      select: { id: true, name: true },
    });
    for (const p of products) productNames.set(p.id, p.name);
    await moveStockForInvoice(
      tx,
      tenantId,
      {
        invoiceId: inv.id,
        type: inv.type,
        date: inv.date,
        warehouseId: inv.warehouseId,
        allowNegativeStock: true, // نهایی‌سازی فاکتور از قبل ثبت‌شده — موجودی هنگام ایجاد چک شده
      },
      stockItems,
      productNames
    );
  }

  // سند حسابداری
  if (autoPost && journalNumber > 0) {
    await postInvoiceToLedger(
      tx,
      tenantId,
      userId,
      {
        invoiceId: inv.id,
        number: inv.number,
        type: inv.type,
        date: inv.date,
        description: inv.description,
        subtotal: inv.subtotal,
        tax: inv.tax,
        discount: inv.discount,
        total: inv.total,
      },
      { journalNumber }
    );
  }
}

// تابع کمکی برای محاسبه معادل ریالی (در صورت نیاز در ماژول‌های دیگر)
export async function toIrr(amount: number, currency: string): Promise<number> {
  return convertToIrr(amount, currency);
}
