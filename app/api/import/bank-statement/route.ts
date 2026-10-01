import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import { toEnglishDigits, toPersianDigits, jalaliToGregorian } from "@/lib/persian";

export const runtime = "nodejs";

/**
 * ============ ایمپورت صورتحساب بانکی CSV ============
 * POST /api/import/bank-statement — { fileName, bankAccountId, csvContent }
 *   پارس CSV (جداکننده کاما/سمی‌کالن/تب — خودکار)، هدرهای فارسی و انگلیسی،
 *   تاریخ شمسی/میلادی، ستون‌های بدهکار/بستانکار/مبلغ/مانده/پیگیری.
 * GET  /api/import/bank-statement — تاریخچه ایمپورت‌های tenant
 *
 * مکانیزم ذخیره تراکنش: مدل اختصاصی BankTransaction در اسکیمای موجود وجود
 * ندارد (بررسی کامل فهرست مدل‌ها). مکانیزم موجودِ «خط صورتحساب بانک» همان
 * BankReconciliationLine است که ماژول مغایرت‌گیری بانکی از آن استفاده می‌کند
 * (برای هر bankAccount + دوره یک BankReconciliation و خطوط آن). این API هم
 * دقیقاً همان مسیر را می‌نویسد:
 *   - هر ردیف CSV → یک BankReconciliationLine (مبلغ مثبت=واریز، منفی=برداشت)
 *   - اگر برای دوره‌ی محاسبه‌شده قبلاً مغایرت‌گیری وجود دارد، خطوط به همان
 *     اضافه می‌شوند (قید unique دوره رعایت می‌شود)؛ در غیر این‌صورت
 *     مغایرت‌گیری جدید (status IN_PROGRESS) ساخته می‌شود.
 *   - شماره پیگیری به انتهای شرح line اضافه می‌شود.
 *   - موجودی صورتحساب: از آخرین مقدار ستون «مانده» (اگر موجود بود) وگرنه
 *     موجودی دفتر حساب بانکی.
 *
 * نتیجه در BankStatementImport ثبت می‌شود: rowsTotal/rowsImported/rowsSkipped/
 * status COMPLETED|PARTIAL|FAILED + errors JSON [{row, reason}].
 */

const MAX_ROWS = 5000;

/* ---------- نگاشت هدرها (فارسی + انگلیسی، بدون حساسیت به بزرگی حرف) ---------- */
const HEADER_MAP: Record<string, string> = {
  "تاریخ": "date",
  "date": "date",
  "تاریخ تراکنش": "date",
  "transaction date": "date",
  "شرح": "description",
  "description": "description",
  "شرح تراکنش": "description",
  "شرح عملیات": "description",
  "particulars": "description",
  "details": "description",
  "بدهکار": "debit",
  "debit": "debit",
  "برداشت": "debit",
  "withdrawal": "debit",
  "withdraw": "debit",
  "بستانکار": "credit",
  "credit": "credit",
  "واریز": "credit",
  "deposit": "credit",
  "مبلغ": "amount",
  "amount": "amount",
  "مبلغ تراکنش": "amount",
  "شماره پیگیری": "reference",
  "پیگیری": "reference",
  "شماره مرجع": "reference",
  "trace": "reference",
  "reference": "reference",
  "ref": "reference",
  "شماره سند": "reference",
  "مانده": "balance",
  "مانده حساب": "balance",
  "balance": "balance",
};

function normalizeHeader(h: string): string {
  return toEnglishDigits(String(h || ""))
    .replace(/\uFEFF/g, "") // BOM
    .replace(/[\u200c\u200f\u200e]/g, "") // نیم‌فاصله و کاراکترهای جهت‌دهی
    .replace(/[_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ---------- تشخیص جداکننده (کاما / سمی‌کالن / تب) از خط هدر ---------- */
function detectDelimiter(headerLine: string): string {
  const counts = [",", ";", "\t"].map((d) => headerLine.split(d).length - 1);
  let best = ",";
  let bestCount = counts[0];
  if (counts[1] > bestCount) {
    best = ";";
    bestCount = counts[1];
  }
  if (counts[2] > bestCount) {
    best = "\t";
  }
  return best;
}

/* ---------- شکستن خط CSV با پشتیبانی از نقل‌قول دوتایی ---------- */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\uFEFF/g, "").trim());
}

/* ---------- پارس مبلغ (اعداد فارسی/جداکننده هزارگان) ---------- */
function parseAmount(raw: string): number | null {
  const s = toEnglishDigits(String(raw ?? "")).replace(/[,\s٬]/g, "").replace(/[^\d.\-]/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------- پارس تاریخ منعطف: 1403/05/12 | 2024-08-01 | 01/08/2024 ---------- */
function parseFlexibleDate(raw: string): Date | null {
  if (!raw) return null;
  const s = toEnglishDigits(String(raw).trim()).replace(/[-.]/g, "/").trim();
  if (!s) return null;
  const datePart = s.split(/\s+|T/)[0] || "";
  const m = datePart.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,4}))?$/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] !== undefined ? Number(m[3]) : null;
  const mk = (y: number, mo: number, d: number): Date | null => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d, 12, 0, 0); // ظهر — جلوگیری از شیفت UTC
    return Number.isNaN(dt.getTime()) ? null : dt;
  };
  if (c === null) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // سال اول (YYYY/MM/DD) — میلادی یا شمسی
  if (a > 1600) return mk(a, b, c);
  if (a >= 1200 && a <= 1600) {
    if (b < 1 || b > 12 || c < 1 || c > 31) return null; // ماه/روز شمسی نامعتبر
    const [gy, gm, gd] = jalaliToGregorian(a, b, c);
    return mk(gy, gm, gd);
  }
  // سال آخر (DD/MM/YYYY) — میلادی یا شمسی
  if (c > 1600) return mk(c, b, a);
  if (c >= 1200 && c <= 1600) {
    if (b < 1 || b > 12 || a < 1 || a > 31) return null; // ماه/روز شمسی نامعتبر
    const [gy, gm, gd] = jalaliToGregorian(c, b, a);
    return mk(gy, gm, gd);
  }
  return null;
}

interface ImportRequestBody {
  fileName?: string;
  bankAccountId?: string;
  csvContent?: string;
}

interface ParsedRow {
  date: Date;
  description: string;
  amount: number; // علامت‌دار: مثبت واریز / منفی برداشت
  reference: string | null;
  balance: number | null;
}

/* ============================================================ POST */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const tenantId = ctx.tenantId;

    if (!rateLimit(`bank-import:${tenantId}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: "تعداد درخواست ایمپورت زیاد است. کمی صبر کنید." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { fileName, bankAccountId, csvContent } = (body || {}) as ImportRequestBody;

    const safeFileName =
      typeof fileName === "string" && fileName.trim() ? fileName.trim().slice(0, 200) : "statement.csv";
    if (!bankAccountId || typeof bankAccountId !== "string") {
      return NextResponse.json(
        { success: false, error: "انتخاب حساب بانکی الزامی است" },
        { status: 400 }
      );
    }
    if (!csvContent || typeof csvContent !== "string" || !csvContent.trim()) {
      return NextResponse.json(
        { success: false, error: "محتوای فایل CSV خالی است" },
        { status: 400 }
      );
    }

    // حساب بانکی باید متعلق به همین tenant باشد
    const bankAccount = await db.bankAccount.findFirst({
      where: { id: bankAccountId, tenantId, deletedAt: null },
    });
    if (!bankAccount) {
      return NextResponse.json(
        { success: false, error: "حساب بانکی یافت نشد یا به این شرکت تعلق ندارد" },
        { status: 404 }
      );
    }

    // ---------- پارس CSV ----------
    const rawLines = csvContent
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (rawLines.length < 2) {
      return NextResponse.json(
        { success: false, error: "فایل CSV باید حداقل یک خط هدر و یک ردیف داده داشته باشد" },
        { status: 400 }
      );
    }

    const delim = detectDelimiter(rawLines[0]);
    const headerCells = splitCsvLine(rawLines[0], delim);
    const colMap: Record<string, number> = {};
    headerCells.forEach((h, idx) => {
      const mapped = HEADER_MAP[normalizeHeader(h)];
      if (mapped && colMap[mapped] === undefined) {
        colMap[mapped] = idx;
      }
    });

    const hasMoneyCol =
      colMap.debit !== undefined || colMap.credit !== undefined || colMap.amount !== undefined;
    if (colMap.date === undefined || !hasMoneyCol) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ستون‌های CSV شناسایی نشدند — حداقل ستون «تاریخ» و یکی از ستون‌های «بدهکار»، «بستانکار» یا «مبلغ» لازم است",
        },
        { status: 400 }
      );
    }

    const dataLines = rawLines.slice(1);
    if (dataLines.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, error: `حداکثر ${MAX_ROWS} ردیف در هر ایمپورت پذیرفته می‌شود` },
        { status: 400 }
      );
    }

    const errors: { row: number; reason: string }[] = [];
    const parsedRows: ParsedRow[] = [];
    let lastBalance: number | null = null;

    dataLines.forEach((line, i) => {
      const rowNo = i + 2; // شماره خط واقعی در فایل (۱=هدر)
      const cells = splitCsvLine(line, delim);
      const get = (key: string): string => {
        const idx = colMap[key];
        return idx !== undefined ? String(cells[idx] ?? "").trim() : "";
      };

      const dateStr = get("date");
      const parsedDate = parseFlexibleDate(dateStr);
      if (!parsedDate) {
        errors.push({ row: rowNo, reason: `تاریخ نامعتبر یا غیرقابل خواندن («${dateStr.slice(0, 30) || "خالی"}»)` });
        return;
      }

      const debit = colMap.debit !== undefined ? parseAmount(get("debit")) : null;
      const credit = colMap.credit !== undefined ? parseAmount(get("credit")) : null;
      const amountCol = colMap.amount !== undefined ? parseAmount(get("amount")) : null;

      let signedAmount: number | null = null;
      if (debit != null && debit !== 0) {
        signedAmount = -Math.abs(debit); // بدهکار = برداشت
      } else if (credit != null && credit !== 0) {
        signedAmount = Math.abs(credit); // بستانکار = واریز
      } else if (amountCol != null && amountCol !== 0) {
        signedAmount = amountCol; // علامت‌دار یا تک‌ستونی
      }
      if (signedAmount == null || signedAmount === 0) {
        errors.push({ row: rowNo, reason: "مبلغ تراکنش نامعتبر یا صفر است" });
        return;
      }

      const reference = get("reference") || null;
      const balanceRaw = colMap.balance !== undefined ? parseAmount(get("balance")) : null;
      if (balanceRaw != null) lastBalance = balanceRaw;

      let description = get("description") || "تراکنش بانکی";
      description = description.slice(0, 300);
      if (reference) {
        description = `${description} — پیگیری: ${reference.slice(0, 60)}`;
      }

      parsedRows.push({
        date: parsedDate,
        description,
        amount: Math.round(signedAmount),
        reference,
        balance: balanceRaw,
      });
    });

    const rowsTotal = dataLines.length;
    const rowsImported = parsedRows.length;
    const rowsSkipped = errors.length;

    // ---------- دوره (YYYY-MM میلادی) از شایع‌ترین ماه تاریخ‌ها ----------
    let period = "";
    if (parsedRows.length > 0) {
      const counter = new Map<string, number>();
      for (const r of parsedRows) {
        const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
        counter.set(key, (counter.get(key) || 0) + 1);
      }
      period = [...counter.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    // ---------- ذخیره: مغایرت‌گیری + خطوط (مکانیزم موجود ماژول) ----------
    let reconciliationId: string | null = null;
    let createdNewRec = false;
    if (parsedRows.length > 0) {
      const existing = period
        ? await db.bankReconciliation.findUnique({
            where: {
              tenantId_bankAccountId_period: { tenantId, bankAccountId, period },
            },
          })
        : null;

      if (existing) {
        // خطوط به مغایرت‌گیری همان دوره اضافه می‌شوند
        // (علامت مبلغ حفظ می‌شود: مثبت=واریز / منفی=برداشت — قرارداد ماژول)
        await db.bankReconciliationLine.createMany({
          data: parsedRows.map((r) => ({
            reconciliationId: existing.id,
            tenantId,
            date: r.date,
            description: r.description,
            amount: BigInt(Math.round(r.amount)),
            status: "UNMATCHED",
          })),
        });
        reconciliationId = existing.id;
      } else {
        const stmtBal =
          lastBalance != null ? BigInt(Math.round(lastBalance)) : bankAccount.balance;
        const rec = await db.bankReconciliation.create({
          data: {
            tenantId,
            bankAccountId,
            period,
            statementBalance: stmtBal,
            bookBalance: bankAccount.balance,
            difference: stmtBal - bankAccount.balance,
            status: "IN_PROGRESS",
            notes: `ایمپورت CSV — ${safeFileName}`,
            lines: {
              create: parsedRows.map((r) => ({
                tenantId,
                date: r.date,
                description: r.description,
                // مثبت=واریز / منفی=برداشت — قرارداد موجود ماژول مغایرت‌گیری
                amount: BigInt(Math.round(r.amount)),
                status: "UNMATCHED",
              })),
            },
          },
        });
        reconciliationId = rec.id;
        createdNewRec = true;
      }
    }

    // ---------- ثبت نتیجه ایمپورت ----------
    const status =
      rowsImported === 0 ? "FAILED" : rowsSkipped > 0 ? "PARTIAL" : "COMPLETED";

    const importRecord = await db.bankStatementImport.create({
      data: {
        tenantId,
        bankAccountId,
        fileName: safeFileName,
        rowsTotal,
        rowsImported,
        rowsSkipped,
        status,
        errors: JSON.stringify(errors.slice(0, 200)),
        importedBy: ctx.userId,
      },
    });

    await auditLog({
      tenantId,
      userId: ctx.userId,
      action: "BANK_STATEMENT_IMPORT",
      entity: "BankStatementImport",
      entityId: importRecord.id,
      changes: {
        fileName: safeFileName,
        bankAccountId,
        rowsTotal,
        rowsImported,
        rowsSkipped,
        status,
        period,
        createdNewRec,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: importRecord.id,
        fileName: safeFileName,
        bankAccountId,
        rowsTotal,
        rowsImported,
        rowsSkipped,
        status,
        errors: errors.slice(0, 200),
        period,
        reconciliationId,
        createdNewRec,
      },
      message:
        rowsImported === 0
          ? "هیچ ردیفی ایمپورت نشد"
          : `${toPersianDigits(rowsImported)} تراکنش ثبت شد${rowsSkipped > 0 ? `، ${toPersianDigits(rowsSkipped)} ردیف رد شد` : ""}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("bank-statement import error:", msg);
    return NextResponse.json(
      { success: false, error: "خطا در ایمپورت صورتحساب بانکی" },
      { status: 500 }
    );
  }
}

/* ============================================================ GET — تاریخچه */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const imports = await db.bankStatementImport.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    // نام حساب‌های بانکی مرتبط (BankStatementImport رابطه ندارد — map جدا)
    const accountIds = [...new Set(imports.map((i) => i.bankAccountId).filter(Boolean))] as string[];
    const accounts = accountIds.length
      ? await db.bankAccount.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, bankName: true, accountNumber: true },
        })
      : [];
    const accMap = new Map(accounts.map((a) => [a.id, a]));

    return NextResponse.json({
      success: true,
      data: imports.map((i) => ({
        id: i.id,
        fileName: i.fileName,
        bankAccountId: i.bankAccountId,
        bankName: i.bankAccountId ? accMap.get(i.bankAccountId)?.bankName ?? null : null,
        accountNumber: i.bankAccountId ? accMap.get(i.bankAccountId)?.accountNumber ?? null : null,
        rowsTotal: i.rowsTotal,
        rowsImported: i.rowsImported,
        rowsSkipped: i.rowsSkipped,
        status: i.status,
        errors: (() => {
          try {
            return i.errors ? JSON.parse(i.errors) : [];
          } catch {
            return [];
          }
        })(),
        createdAt: i.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error("bank-statement import history error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تاریخچه ایمپورت‌ها" },
      { status: 500 }
    );
  }
}
