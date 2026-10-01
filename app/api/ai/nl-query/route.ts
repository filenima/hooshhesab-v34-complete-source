import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { requireAuth } from "@/lib/license-security";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { rateLimit, auditLog } from "@/lib/auth";
import { toPersianDigits } from "@/lib/persian";

// ============ Natural Language Query API ============
// POST /api/ai/nl-query
// body: { question: string }
// خروجی: { sql, results, interpretation, warnings }
//
// کاربر سوال فارسی می‌پرسد LLM آن را به SQL امن تبدیل می‌کند 
// SQL اجرا می‌شود نتایج + تفسیر فارسی برمی‌گردد.
//
// محدودیت‌های امنیتی:
// - فقط SELECT مجاز است
// - فقط جداول مجاز (whitelist)
// - محدود به tenantId کاربر
// - LIMIT حداکثر ۱۰۰۰ رکورد

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUESTION_LENGTH = 500;
const MAX_RESULTS = 1000;
// FIX(C3): سقف LIMIT — اگر LLM فراموش کرد یا مقدار بزرگ‌تر داد، در کد اعمال می‌شود
const DEFAULT_SQL_LIMIT = 200;
const MAX_SQL_LIMIT = 1000;

// جداول مجاز برای query
const ALLOWED_TABLES = [
 "Invoice",
 "InvoiceItem",
 "Party",
 "Product",
 "StockItem",
 "Check",
 "BankAccount",
 "PettyCash",
 "JournalEntry",
 "Account",
 "Budget",
 "Reminder",
 "Employee",
];
// FIX(H-1): همهٔ نام مدل‌های دیتابیس (کوچک‌شده) — برای وایت‌لیست سراسری توکن‌ها.
// منبع: enum تولیدشدهٔ Prisma — با افزودن مدل جدید در schema، این مجموعه خودکار به‌روز می‌ماند.
const ALL_DB_MODEL_NAMES = new Set<string>(
 (Object.values(Prisma.ModelName) as string[]).map((m) => m.toLowerCase())
);

const SYSTEM_PROMPT = `تو یک مترجم زبان طبیعی فارسی به SQL هستی برای نرم‌افزار حسابداری "هوش".

قوانین:
1. فقط دستور SELECT تولید کن. هیچ‌گاه INSERT، UPDATE، DELETE، DROP، ALTER یا TRUNCATE تولید نکن.
2. فقط از جداول زیر استفاده کن:
 - Invoice (فاکتورها — فیلدها: id, tenantId, number, type, partyId, date, dueDate, subtotal, discount, tax, total, paidAmount, currency, status)
 - InvoiceItem (اقلام فاکتور — فیلدها: id, invoiceId, productId, description, quantity, unitPrice, discount, taxRate, total)
 - Party (طرف‌حساب — فیلدها: id, tenantId, code, name, type, nationalId, phone, mobile, email, creditLimit)
 - Product (محصول — فیلدها: id, tenantId, name, sku, unit, salePrice, purchasePrice)
 - StockItem (موجودی انبار — فیلدها: id, tenantId, productId, warehouseId, quantity, minStock, maxStock)
 - Check (چک — فیلدها: id, tenantId, number, type, status, amount, issueDate, dueDate, bankName, partyId)
 - BankAccount (حساب بانکی — فیلدها: id, tenantId, bankName, accountNumber, balance, currency)
 - Budget (بودجه — فیلدها: id, tenantId, name, period, amount, spent)
 - Employee (کارمند — فیلدها: id, tenantId, name, position, baseSalary)
3. همیشه شرط tenantId = 'TENANT_ID' را اضافه کن (با عبارت دقیق TENANT_ID).
4. مبالغ به ریال ذخیره می‌شوند — برای تبدیل به تومان، تقسیم بر ۱۰ کن.
5. اعداد فارسی را به انگلیسی تبدیل کن.
6. تاریخ‌ها میلادی ذخیره می‌شوند — برای دوره‌ی شمسی، از بازه‌ی میلادی معادل استفاده کن.
7. همیشه LIMIT اضافه کن (حداکثر ۱۰۰۰).
8. خروجی را فقط به‌صورت JSON با ساختار زیر بده:
 { "sql": "...", "interpretation": "توضیح فارسی کوتاه" }

نکات:
- type در Invoice: SALE (فروش)، PURCHASE (خرید)، PRE_INVOICE (پیش‌فاکتور)، RETURN (مرجوعی)
- type در Party: CUSTOMER (مشتری)، SUPPLIER (تأمین‌کننده)، BOTH (هر دو)
- status در Check: REGISTERED، DEPOSITED، CLEARED، BOUNCED، CANCELLED
- status در Invoice: DRAFT، SENT، PAID، OVERDUE، CANCELLED

مثال:
سوال: "فروش این ماه چقدر بود؟"
پاسخ: { "sql": "SELECT SUM(total) as total FROM Invoice WHERE tenantId = 'TENANT_ID' AND type = 'SALE' AND date >= date('now', 'start of month') LIMIT 1", "interpretation": "مجموع مبلغ فاکتورهای فروش در ماه جاری" }

سوال: "کدام مشتری بیشترین خرید داشته؟"
پاسخ: { "sql": "SELECT p.name, SUM(i.total) as total FROM Invoice i JOIN Party p ON i.partyId = p.id WHERE i.tenantId = 'TENANT_ID' AND i.type = 'SALE' GROUP BY i.partyId ORDER BY total DESC LIMIT 10", "interpretation": "۱۰ مشتری برتر بر اساس مجموع خرید" }`;

interface NLQueryResult {
 sql: string;
 results: unknown[];
 interpretation: string;
 warnings?: string[];
 rowCount: number;
}

export async function POST(req: NextRequest) {
 try {
 const auth = await requireAuth(req);
 if ("error" in auth) return auth.error;
 const authCtx = auth.ctx;

 // Rate limit: 10 NL queries per minute per user
 const rateKey = `nl-query:${authCtx.userId}`;
 if (!rateLimit(rateKey, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست‌های پرس‌وجوی طبیعی پر شده است" },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { question } = body as { question?: string };

 if (!question || typeof question!== "string") {
 return NextResponse.json(
 { success: false, error: "سوال الزامی است" },
 { status: 400 }
 );
 }

 if (question.length > MAX_QUESTION_LENGTH) {
 return NextResponse.json(
 {
 success: false,
 error: `حداکثر طول سوال ${toPersianDigits(MAX_QUESTION_LENGTH)} کاراکتر است`,
 },
 { status: 400 }
 );
 }

 // دریافت SQL از LLM
 const zai = await ZAI.create();
 const completion = await zai.chat.completions.create({
 messages: [
 { role: "system", content: SYSTEM_PROMPT },
 {
 role: "user",
 content: `سوال کاربر: ${question}`,
 },
 ],
 thinking: { type: "disabled" },
 });

 const reply: string = completion?.choices?.[0]?.message?.content?? "";

 // استخراج JSON از پاسخ LLM
 const parsed = extractJsonFromReply(reply);
 if (!parsed ||!parsed.sql) {
 return NextResponse.json({
 success: true,
 result: {
 sql: "",
 results: [],
 interpretation:
 parsed?.interpretation ||
 "نتوانستم سوال را به SQL تبدیل کنم. لطفاً واضح‌تر بپرسید.",
 warnings: ["LLM response could not be parsed"],
 rowCount: 0,
 } satisfies NLQueryResult,
 });
 }

 // جایگزینی placeholder tenantId با مقدار واقعی
 // TENANT_ID 'actual-tenant-id' (با quote)
 const tenantIdEscaped = authCtx.tenantId.replace(/'/g, "''");
 let sql = parsed.sql.replace(/TENANT_ID/g, tenantIdEscaped);

 const interpretation = parsed.interpretation || "";

 // FIX(C3): سقف LIMIT در سطح کد اعمال می‌شود — نه به امید پرامپت
 sql = enforceRowLimit(sql);

 // اعتبارسنجی امنیتی SQL — با گارد سخت tenant (literal اجباری در WHERE)
 const validation = validateSql(sql, tenantIdEscaped);
 if (!validation.valid) {
 await auditLog({
 tenantId: authCtx.tenantId,
 userId: authCtx.userId,
 action: "NL_QUERY_BLOCKED",
 entity: "ai.nl-query",
 changes: {
 question: question.slice(0, 200),
 sql: sql.slice(0, 500),
 reason: validation.reason,
 },
 req,
 });
 // SECURITY: rawSql دیگر در پاسخ خطا برگردانده نمی‌شود (نشت SQL داخلی)
 return NextResponse.json(
 {
 success: false,
 error: `SQL تولیدشده امن نیست و اجرا نشد: ${validation.reason}`,
 },
 { status: 400 }
 );
 }

 // اجرای SQL
 let results: unknown[] = [];
 const warnings: string[] = [];

 try {
 const rows = await db.$queryRawUnsafe(sql);
 results = serializeRows(rows as Record<string, unknown>[]);

 if (results.length > MAX_RESULTS) {
 warnings.push(`نتایج به ${toPersianDigits(MAX_RESULTS)} ردیف محدود شد`);
 results = results.slice(0, MAX_RESULTS);
 }
 } catch (execErr) {
 // FIX(4-a): پیام خام SQLite (نشت نام جدول/ستون داخلی) فقط سمت سرور لاگ
 // می‌شود — به کاربر پیام فارسی عمومی برمی‌گردد
 console.error("[NL-Query] exec error:", execErr instanceof Error? execErr.message: execErr);
 warnings.push("خطا در اجرای پرس‌وجو — ساختار سوال را ساده‌تر کنید");
 results = [];
 }

 // ثبت در audit log
 await auditLog({
 tenantId: authCtx.tenantId,
 userId: authCtx.userId,
 action: "NL_QUERY",
 entity: "ai.nl-query",
 changes: {
 question: question.slice(0, 200),
 sql: sql.slice(0, 500),
 rowCount: results.length,
 },
 req,
 });

 const result: NLQueryResult = {
 sql,
 results,
 interpretation,
 warnings: warnings.length > 0? warnings: undefined,
 rowCount: results.length,
 };

 return NextResponse.json({ success: true, result });
 } catch (error) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("[NL-Query] Error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش پرس‌وجوی طبیعی" },
 { status: 500 }
 );
 }
}

// استخراج JSON از پاسخ LLM
function extractJsonFromReply(
 reply: string
): { sql?: string; interpretation?: string } | null {
 const jsonMatch = reply.match(/\{[\s\S]*\}/);
 if (!jsonMatch) return null;
 try {
 return JSON.parse(jsonMatch[0]) as { sql?: string; interpretation?: string };
 } catch {
 return null;
 }
}

// FIX(C3): اعمال/محدودکردن LIMIT در سطح کد (نه پرامپت)
// - اگر LIMIT ندارد → LIMIT پیش‌فرض اضافه می‌شود
// - اگر LIMIT بزرگ‌تر از سقف دارد → به سقف کاهش می‌یابد
function enforceRowLimit(sql: string): string {
 const limitMatch = sql.match(/\blimit\s+(\d+)\b/i);
 if (!limitMatch) {
 return `${sql.trim()} LIMIT ${DEFAULT_SQL_LIMIT}`;
 }
 const n = parseInt(limitMatch[1], 10);
 if (Number.isFinite(n) && n > MAX_SQL_LIMIT) {
 return sql.replace(/\blimit\s+\d+\b/i, `LIMIT ${MAX_SQL_LIMIT}`);
 }
 return sql;
}

// اعتبارسنجی امنیتی SQL
// FIX(C3): tenantId دیگر به LLM واگذار نشده — گارد سخت:
// (a) فقط یک statement (بدون ';')
// (b) رد UNION/ATTACH/PRAGMA و کلمات خطرناک
// (c) باید WHERE با literal دقیق tenantId = '<tenant کاربر> وجود داشته باشد و
// هیچ ارجاع tenantId دیگری (OR/IN/مقدار دیگر) در SQL نباشد
function validateSql(
 sql: string,
 tenantIdEscaped: string
): { valid: boolean; reason?: string } {
 const normalized = sql.trim().toLowerCase();

 if (!normalized.startsWith("select")) {
 return { valid: false, reason: "فقط SELECT مجاز است" };
 }

 // FIX(C3-Union): UNION صریحاً رد می‌شود (قبلاً فقط با blacklist جداول بسته می‌شد
 // ولی UNION SELECT می‌توانست از جدول whitelist هم برای cross-tenant بخواند)
 const forbidden = [
 "insert",
 "update",
 "delete",
 "drop",
 "alter",
 "truncate",
 "create",
 "replace",
 "exec",
 "execute",
 "merge",
 "grant",
 "revoke",
 "pragma",
 "attach",
 "detach",
 "union",
 // FIX(SEC-4a): تابع بارگذاری افزونهٔ SQLite — حتی اگر موتور Prisma آن را
 // غیرفعال داشته باشد، در لایهٔ اعتبارسنجی هم مسدود می‌ماند (دفاع لایه‌ای)
 "load_extension",
 ];
 for (const word of forbidden) {
 const regex = new RegExp(`\\b${word}\\b`, "i");
 if (regex.test(sql)) {
 return { valid: false, reason: `کلمه‌ی ممنوعه: ${word}` };
 }
 }

 if (sql.includes(";")) {
 return { valid: false, reason: "استفاده از ; مجاز نیست (فقط یک دستور)" };
 }

 // FIX(H-1): کاما-جویین در FROM ممنوع — «FROM Invoice i, Tenant t» قبلاً جدول دوم
 // را از پارس رد می‌کرد و عبور جدول غیرمجاز ممکن بود. حالا کل بند FROM استخراج
 // و هر کامای آن رد می‌شود (کاما در SELECT-list بی‌تأثیر است — فقط متن بعد از FROM).
 const fromClauseMatch = sql.match(/\bfrom\b([\s\S]*?)(?=\b(where|group|order|limit|having|join)\b|$)/i);
 if (fromClauseMatch && fromClauseMatch[1].includes(",")) {
 return {
 valid: false,
 reason: "کاما (جدول چندتایی) در FROM مجاز نیست — فقط یک جدول با JOIN",
 };
 }

 // FIX(H-1 — وایت‌لیست سراسری): هر توکن شناسه در SQL که نام مدل دیتابیس است
 // ولی در ALLOWED_TABLES نیست → رد. این دفاع مستقل از پارس FROM/JOIN است و
 // ارجاع به جدول غیرمجاز را در «هر» جای SQL (SELECT/subquery/alias) می‌بندد.
 // نام مدل‌ها از enum تولیدشدهٔ Prisma خوانده می‌شود (fail-closed برای جداول آینده).
 const identifierTokens = sql.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
 const allowedTokenSet = new Set(ALLOWED_TABLES.map((t) => t.toLowerCase()));
 for (const tok of identifierTokens) {
 const t = tok.toLowerCase();
 if (ALL_DB_MODEL_NAMES.has(t) && !allowedTokenSet.has(t)) {
 return { valid: false, reason: `دسترسی به این داده مجاز نیست: ${t}` };
 }
 }

 // بررسی جداول مجاز
 // FIX(SECURITY-M1): شناسه‌های quoted (مثل FROM "User") هم پارس می‌شوند —
 // قبلاً regex فقط bare identifier می‌دید و جدول حساس quoted از گارد رد می‌شد
 // FIX(SEC-4a): بک‌تیک (`Table`) هم مثل دابل‌کوت در SQLite شناسهٔ quoted است —
 // در کلاس کاراکتر پارس اضافه شد تا جدول غیرمجازِ backtick-quoted دور زده نشود
 const tablePattern = /from\s+(["`]?)([a-zA-Z_][a-zA-Z0-9_]*)\1/gi;
 const joinPattern = /join\s+(["`]?)([a-zA-Z_][a-zA-Z0-9_]*)\1/gi;
 const tables = new Set<string>();
 let match: RegExpExecArray | null;
 while ((match = tablePattern.exec(sql))!== null) {
 tables.add(match[2].toLowerCase());
 }
 while ((match = joinPattern.exec(sql))!== null) {
 tables.add(match[2].toLowerCase());
 }

 // FIX(SECURITY-M1): جداول حساس به‌هر شکلی (quoted یا نه، حتی داخل
 // subquery در SELECT) کاملاً ممنوع — دفاع لایه‌دومی مستقل از پارس FROM/JOIN
 const sensitiveTables = [
 "user",
 "superadmin",
 "usersession",
 "license",
 "integration",
 "auditlog",
 "platformauditlog",
 "ipwhitelist",
 "blockedip",
 "publicapikey",
 "apikey",
 "referral",
 "bugreport",
 ];
 for (const t of sensitiveTables) {
 const re = new RegExp(`("?\\b${t}\\b"?)`, "i");
 if (re.test(sql)) {
 return { valid: false, reason: `دسترسی به این داده مجاز نیست: ${t}` };
 }
 }

 // FIX(SECURITY-M1): subquery داخل پرانتز در SELECT ممنوع — primary
 // bypass vector (SELECT (SELECT password FROM "User" ...) AS p FROM Invoice)
 if (/select\s*\(/i.test(sql)) {
 return { valid: false, reason: "subquery در SELECT مجاز نیست" };
 }

 const allowedLower = ALLOWED_TABLES.map((t) => t.toLowerCase());
 for (const t of tables) {
 if (!allowedLower.includes(t)) {
 return { valid: false, reason: `جدول مجاز نیست: ${t}` };
 }
 }

 // ===== گارد سخت tenant (C3) =====
 // باید WHERE وجود داشته باشد
 if (!/\bwhere\b/i.test(sql)) {
 return {
 valid: false,
 reason: "SQL باید شرط WHERE با فیلتر tenantId داشته باشد",
 };
 }

 // الگوی امن: tenantId = '<tenant کاربر> با فاصله‌های آزاد
 const safePattern = new RegExp(
 `tenantid\\s*=\\s*'${tenantIdEscaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`,
 "gi"
 );
 const safeMatches = sql.match(safePattern) || [];
 if (safeMatches.length === 0) {
 return {
 valid: false,
 reason:
 "شرط tenantId = '<شناسه سازمان شما>' در WHERE اجباری است و یافت نشد",
 };
 }

 // هر ارجاع tenantId در SQL باید همان مقایسه امن باشد — اگر LLM مثلاً
 // tenantId = 'other-tenant' یا tenantId IN (...) یا OR tenantId = ... نوشته باشد رد می‌شود
 const totalTenantRefs = (sql.match(/\btenantid\b/gi) || []).length;
 if (totalTenantRefs!== safeMatches.length) {
 return {
 valid: false,
 reason:
 "ارجاع tenantId خارج از الگوی امن (مقدار دیگر/IN/مقایسه غیرمساوی) مجاز نیست",
 };
 }

 return { valid: true };
}

// تبدیل BigInt به Number برای JSON serialization
function serializeRows(rows: Record<string, unknown>[]): unknown[] {
 return rows.map((row) => {
 const serialized: Record<string, unknown> = {};
 for (const [key, value] of Object.entries(row)) {
 if (typeof value === "bigint") {
 serialized[key] = Number(value);
 } else if (value instanceof Date) {
 serialized[key] = value.toISOString();
 } else {
 serialized[key] = value;
 }
 }
 return serialized;
 });
}
