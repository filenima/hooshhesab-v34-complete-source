// RAG — پاسخ به سوالات کاربر با جستجوی داده‌های واقعی
// هوش — AI Retrieval-Augmented Generation
// ----------------------------------------------------------------------------
// این اندپوینت سوال کاربر را می‌گیرد، داده‌های مربوطه (فاکتورها، طرف‌حساب‌ها،
// محصولات، تراکنش‌ها) را با استفاده از جستجوی کلیدواژه‌ای استخراج می‌کند،
// آن‌ها را به‌عنوان زمینه به LLM می‌دهد و پاسخ نهایی را همراه با منابع برمی‌گرداند.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { toJalali, JALALI_MONTHS, getCurrentJalaliYear, getCurrentJalaliMonth } from "@/lib/persian";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUESTION_LENGTH = 1000;
const MAX_SOURCES = 10;

// ============ Jalali helper ============
function currentJalaliDisplay(): string {
 const now = new Date();
 const jy = getCurrentJalaliYear(now);
 const jm = getCurrentJalaliMonth(now);
 const jd = Number(toJalali(now).split("/")[2]);
 const monthName = JALALI_MONTHS[jm - 1] || "";
 return `${toJalali(now)} (${jd} ${monthName} ${jy})`;
}

// ============ Persian text normalizer & keyword extractor ============
const PERSIAN_STOPWORDS = new Set([
 "و", "در", "به", "از", "که", "این", "را", "با", "یا", "برای", "تا", "است", "بود", "شد",
 "شود", "هست", "نیست", "هم", "می", "ای", "آن", "هر", "کل", "ما", "شما", "او", "من", "چه",
 "چطور", "چگونه", "کدام", "کی", "کجا", "چقدر", "چند", "بیشترین", "کمترین", "آیا", "بله",
 "خیر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده", "صد", "هزار",
 "میلیون", "میلیارد", "تومان", "ریال", "قرار", "می‌کنم", "کنم", "کن", "می‌خوام", "می‌خواهم",
 "بودن", "کرد", "کرده", "داشت", "داشته", "بده", "شدند", "شده", "باشم", "باشی", "باشه",
 "هستم", "هستی", "هستند", "داشتند", "کنند", "می‌کنند", "هیچ", "همه", "تنها", "الان",
 "حالا", "امروز", "دیروز", "فردا", "ماه", "سال", "روزی", "روز", "هفته", "هفتگی",
 "ماهانه", "سالانه",
]);

function normalizeText(s: string): string {
 return s
.replace(/[ي]/g, "ی")
.replace(/[ك]/g, "ک")
.replace(/[ة]/g, "ه")
.replace(/‌/g, " ")
.replace(/\s+/g, " ")
.trim();
}

function extractKeywords(question: string): string[] {
 const normalized = normalizeText(question);
 const tokens = normalized
.replace(/[?.!,;:()\[\]{}""''«»\-_=+*&^%$#@~]/g, " ")
.split(/\s+/)
.filter(Boolean);
 const keywords = tokens.filter(
 (t) =>!PERSIAN_STOPWORDS.has(t) && t.length >= 2
 );
 return Array.from(new Set(keywords)).slice(0, 20);
}

// ============ Intent detection ============
type RagIntent =
 | "top_customer"
 | "monthly_sales"
 | "overdue_invoices"
 | "top_products"
 | "supplier_balance"
 | "general";

function detectIntent(question: string): RagIntent {
 const q = normalizeText(question).toLowerCase();
 if (
 (q.includes("مشتری") && (q.includes("بیشترین") || q.includes("بیشتر"))) ||
 q.includes("بهترین مشتری") || q.includes("خریدار برتر")
 ) {
 return "top_customer";
 }
 if (
 (q.includes("فروش") && (q.includes("ماه") || q.includes("چقدر"))) ||
 q.includes("چقدر فروش") || q.includes("درآمد")
 ) {
 return "monthly_sales";
 }
 if (
 q.includes("سررسید") || q.includes("معوق") ||
 q.includes("پرداخت نشده") || q.includes("باقی‌مانده")
 ) {
 return "overdue_invoices";
 }
 if (
 q.includes("محصول") && (q.includes("بیشترین") || q.includes("پرفروش") || q.includes("پر"))
 ) {
 return "top_products";
 }
 if (
 q.includes("تامین") || q.includes("تأمین") || q.includes("بدهی به") || q.includes("بدهکار")
 ) {
 return "supplier_balance";
 }
 return "general";
}

// ============ Source fetchers ============
interface RagSource {
 type: "invoice" | "party" | "product" | "check" | "expense";
 id: string;
 title: string;
 detail: string;
 url?: string;
}

async function fetchInvoices(
 tenantId: string,
 keywords: string[],
 intent: RagIntent
): Promise<RagSource[]> {
 try {
 if (intent === "overdue_invoices") {
 const overdue = await db.invoice.findMany({
 where: {
 tenantId,
 deletedAt: null,
 dueDate: { lt: new Date() },
 status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
 },
 orderBy: { dueDate: "asc" },
 take: 15,
 include: { party: { select: { name: true } } },
 });
 return overdue.map((inv) => ({
 type: "invoice" as const,
 id: inv.id,
 title: `فاکتور ${inv.number} — ${inv.party?.name || "—"}`,
 detail: `مبلغ: ${Math.floor(Number(inv.total) / 10).toLocaleString("en-US")} تومان | پرداخت‌شده: ${Math.floor(Number(inv.paidAmount) / 10).toLocaleString("en-US")} تومان | سررسید: ${inv.dueDate? toJalali(inv.dueDate): "—"}`,
 url: `/?module=invoices&invoice=${inv.id}`,
 }));
 }

 if (intent === "monthly_sales") {
 const monthStart = new Date();
 monthStart.setDate(1);
 monthStart.setHours(0, 0, 0, 0);
 const sales = await db.invoice.findMany({
 where: {
 tenantId,
 deletedAt: null,
 type: "SALE",
 date: { gte: monthStart },
 },
 orderBy: { date: "desc" as const },
 take: 10,
 include: { party: { select: { name: true } } },
 });
 return sales.map((inv) => ({
 type: "invoice" as const,
 id: inv.id,
 title: `فاکتور فروش ${inv.number} — ${inv.party?.name || "—"}`,
 detail: `مبلغ: ${Math.floor(Number(inv.total) / 10).toLocaleString("en-US")} تومان | تاریخ: ${toJalali(inv.date)} | وضعیت: ${inv.status}`,
 url: `/?module=invoices&invoice=${inv.id}`,
 }));
 }

 if (intent === "top_customer") {
 const topInvoices = await db.invoice.findMany({
 where: { tenantId, deletedAt: null, type: "SALE" },
 orderBy: { total: "desc" as const },
 take: 20,
 include: { party: { select: { name: true, id: true } } },
 });
 const partyMap = new Map<string, { name: string; sum: number; count: number }>();
 for (const inv of topInvoices) {
 const pid = inv.party?.id;
 if (!pid) continue;
 const existing = partyMap.get(pid) || { name: inv.party?.name || "—", sum: 0, count: 0 };
 existing.sum += Math.floor(Number(inv.total) / 10);
 existing.count += 1;
 partyMap.set(pid, existing);
 }
 return Array.from(partyMap.entries())
.map(([pid, v]) => ({
 type: "party" as const,
 id: pid,
 title: `مشتری: ${v.name}`,
 detail: `مجموع خرید: ${v.sum.toLocaleString("en-US")} تومان | تعداد فاکتور: ${v.count}`,
 url: `/?module=crm&party=${pid}`,
 }))
.sort((a, b) => {
 const av = Number(a.detail.match(/مجموع خرید: ([\d,]+)/)?.[1]?.replace(/,/g, "") || 0);
 const bv = Number(b.detail.match(/مجموع خرید: ([\d,]+)/)?.[1]?.replace(/,/g, "") || 0);
 return bv - av;
 })
.slice(0, 5);
 }

 if (intent === "top_products") {
 const items = await db.invoiceItem.findMany({
 where: {
 invoice: { tenantId, deletedAt: null, type: "SALE" },
 },
 select: {
 description: true,
 quantity: true,
 total: true,
 productId: true,
 },
 take: 100,
 });
 const prodMap = new Map<string, { name: string; sum: number; qty: number }>();
 for (const it of items) {
 const key = it.productId || it.description;
 const existing = prodMap.get(key) || { name: it.description, sum: 0, qty: 0 };
 existing.sum += Math.floor(Number(it.total) / 10);
 existing.qty += it.quantity;
 prodMap.set(key, existing);
 }
 return Array.from(prodMap.entries())
.map(([pid, v]) => ({
 type: "product" as const,
 id: pid,
 title: `محصول: ${v.name}`,
 detail: `مجموع فروش: ${v.sum.toLocaleString("en-US")} تومان | تعداد: ${v.qty}`,
 url: `/?module=inventory&product=${pid}`,
 }))
.sort((a, b) => {
 const av = Number(a.detail.match(/مجموع فروش: ([\d,]+)/)?.[1]?.replace(/,/g, "") || 0);
 const bv = Number(b.detail.match(/مجموع فروش: ([\d,]+)/)?.[1]?.replace(/,/g, "") || 0);
 return bv - av;
 })
.slice(0, 5);
 }

 if (intent === "supplier_balance") {
 const purchases = await db.invoice.aggregate({
 where: { tenantId, deletedAt: null, type: "PURCHASE", status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
 _sum: { total: true, paidAmount: true },
 }).catch(() => ({ _sum: { total: null as bigint | null, paidAmount: null as bigint | null } }));
 const tot = Number(purchases._sum?.total?? 0);
 const paid = Number(purchases._sum?.paidAmount?? 0);
 return [
 {
 type: "invoice" as const,
 id: "summary-payable",
 title: "بدهی کل به تأمین‌کنندگان",
 detail: `کل خرید: ${Math.floor(tot / 10).toLocaleString("en-US")} تومان | پرداخت‌شده: ${Math.floor(paid / 10).toLocaleString("en-US")} تومان | باقی‌مانده: ${Math.floor((tot - paid) / 10).toLocaleString("en-US")} تومان`,
 },
 ];
 }

 // general — fetch latest invoices matching keywords
 const where = {
 tenantId,
 deletedAt: null,
...(keywords.length > 0
? {
 OR: [
 { number: { contains: keywords[0] } },
 { description: { contains: keywords[0] } },
 { party: { name: { contains: keywords[0] } } },
 ],
 }
: {}),
 };
 const invoices = await db.invoice.findMany({
 where,
 orderBy: { date: "desc" as const },
 take: 10,
 include: { party: { select: { name: true } } },
 });
 return invoices.map((inv) => ({
 type: "invoice" as const,
 id: inv.id,
 title: `فاکتور ${inv.number} — ${inv.party?.name || "—"}`,
 detail: `نوع: ${inv.type === "SALE"? "فروش": inv.type === "PURCHASE"? "خرید": inv.type} | مبلغ: ${Math.floor(Number(inv.total) / 10).toLocaleString("en-US")} تومان | تاریخ: ${toJalali(inv.date)} | وضعیت: ${inv.status}`,
 url: `/?module=invoices&invoice=${inv.id}`,
 }));
 } catch (err) {
 console.error("RAG fetchInvoices error:", err);
 return [];
 }
}

async function fetchParties(
 tenantId: string,
 keywords: string[]
): Promise<RagSource[]> {
 if (keywords.length === 0) return [];
 try {
 const parties = await db.party.findMany({
 where: {
 tenantId,
 deletedAt: null,
 OR: keywords.slice(0, 5).map((kw) => ({
 OR: [
 { name: { contains: kw } },
 { code: { contains: kw } },
 { mobile: { contains: kw } },
 { nationalId: { contains: kw } },
 ],
 })),
 },
 take: 5,
 select: { id: true, name: true, code: true, type: true, mobile: true, city: true },
 });
 return parties.map((p) => ({
 type: "party" as const,
 id: p.id,
 title: `${p.type === "CUSTOMER"? "مشتری": p.type === "SUPPLIER"? "تأمین‌کننده": "طرف‌حساب"}: ${p.name}`,
 detail: `کد: ${p.code} | موبایل: ${p.mobile || "—"} | شهر: ${p.city || "—"}`,
 url: `/?module=crm&party=${p.id}`,
 }));
 } catch {
 return [];
 }
}

async function fetchProducts(
 tenantId: string,
 keywords: string[]
): Promise<RagSource[]> {
 if (keywords.length === 0) return [];
 try {
 const products = await db.product.findMany({
 where: {
 tenantId,
 deletedAt: null,
 OR: keywords.slice(0, 5).map((kw) => ({
 OR: [
 { name: { contains: kw } },
 { sku: { contains: kw } },
 { barcode: { contains: kw } },
 ],
 })),
 },
 take: 5,
 select: { id: true, name: true, sku: true, salePrice: true, unit: true },
 });
 return products.map((p) => ({
 type: "product" as const,
 id: p.id,
 title: `محصول: ${p.name}`,
 detail: `SKU: ${p.sku} | قیمت فروش: ${Math.floor(Number(p.salePrice) / 10).toLocaleString("en-US")} تومان | واحد: ${p.unit}`,
 url: `/?module=inventory&product=${p.id}`,
 }));
 } catch {
 return [];
 }
}

// ============ Format sources for prompt ============
function formatSourcesForPrompt(sources: RagSource[]): string {
 if (sources.length === 0) return "";
 const lines: string[] = [];
 lines.push("=== داده‌های استخراج‌شده از پایگاه داده کاربر ===");
 for (let i = 0; i < sources.length; i++) {
 const s = sources[i];
 lines.push(`[${i + 1}] (${s.type}) ${s.title}`);
 lines.push(` ${s.detail}`);
 }
 lines.push("=== پایان داده‌ها ===");
 lines.push("");
 lines.push("از این داده‌ها برای پاسخ به سوال کاربر استفاده کن. در پاسخ به منابع ارجاع بده (مثلاً «بر اساس فاکتور INV-XYZ...»). اگر داده‌ای برای پاسخ موجود نیست، صادقانه بگو.");
 return lines.join("\n");
}

// ============ Endpoint ============
export async function POST(req: NextRequest) {
 try {
 const authCtx = await getAuthContext(req);
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 const rateKey = `rag:${authCtx.tenantId}:${authCtx.userId?? ip}`;
 if (!rateLimit(rateKey, 8, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست RAG پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { question } = body as { question?: string };

 if (!question || typeof question!== "string" || question.trim().length === 0) {
 return NextResponse.json(
 { success: false, error: "سوال الزامی است" },
 { status: 400 }
 );
 }

 if (question.length > MAX_QUESTION_LENGTH) {
 return NextResponse.json(
 { success: false, error: `حداکثر طول سوال ${MAX_QUESTION_LENGTH} کاراکتر است` },
 { status: 400 }
 );
 }

 // 1) Extract keywords + detect intent
 const keywords = extractKeywords(question);
 const intent = detectIntent(question);

 // 2) Fetch sources in parallel
 const [invoiceSources, partySources, productSources] = await Promise.all([
 fetchInvoices(authCtx.tenantId, keywords, intent),
 fetchParties(authCtx.tenantId, keywords),
 fetchProducts(authCtx.tenantId, keywords),
 ]);

 const allSources: RagSource[] = [
...invoiceSources,
...partySources,
...productSources,
 ].slice(0, MAX_SOURCES);

 // 3) Build prompt with context
 const contextText = formatSourcesForPrompt(allSources);

 const systemPrompt = `تو «هوش‌یار» هستی، دستیار هوشمند حسابداری هوش.
کاربر سوال پرسیده و تو باید با استفاده از داده‌های واقعی او (که در متن زمینه آمده) پاسخ بدهی.

قواعد:
- فارسی روان، با ارقام فارسی (۱۲۳۴۵۶۷۸۹۰).
- مبالغ را به تومان نمایش بده.
- به منابع داده ارجاع بده (مثلاً «بر اساس ۵ فاکتور اخیر...»).
- اگر داده‌ای موجود نیست، صادقانه بگو و راهنمایی کن چه داده‌ای ثبت شود.
- مختصر و کاربردی.
- در پاسخ از مارک‌داون استفاده کن (bold، bullet، table).

تاریخ امروز (شمسی): ${currentJalaliDisplay()}
نوع سوال تشخیص‌داده‌شده: ${intent}`;

 // 4) Call LLM
 let reply: string;
 let usedFallback = false;
 try {
 const zai = await ZAI.create();
 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: systemPrompt },
 { role: "user", content: contextText? `${contextText}\n\nسوال کاربر: ${question}`: question },
 ],
 thinking: { type: "disabled" },
 });
 reply = completion?.choices?.[0]?.message?.content?? "";
 if (!reply) {
 reply = "پاسخی از مدل دریافت نشد. لطفاً دوباره تلاش کنید.";
 }
 } catch (err) {
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 console.error("RAG LLM error:", msg);
 const isConfigError = msg.includes("missing X-Token header") || msg.includes("Configuration file not found");
 usedFallback = true;
 if (isConfigError) {
 const lines: string[] = [];
 lines.push(" سرویس مدل زبانی در حال حاضر در دسترس نیست (خطای پیکربندی سرور).");
 lines.push("");
 lines.push("اما داده‌های استخراج‌شده از پایگاه داده شما به‌صورت خام:");
 lines.push("");
 for (let i = 0; i < allSources.length; i++) {
 const s = allSources[i];
 lines.push(`**${i + 1}. ${s.title}**`);
 lines.push(` ${s.detail}`);
 }
 if (allSources.length === 0) {
 lines.push("هیچ داده‌ی منطبقی پیدا نشد.");
 }
 reply = lines.join("\n");
 } else {
 // For non-config errors (like API request format issues), provide raw data fallback
 const lines: string[] = [];
 lines.push(" درخواست به مدل زبانی با خطا مواجه شد. داده‌های خام شما:");
 lines.push("");
 for (let i = 0; i < allSources.length; i++) {
 const s = allSources[i];
 lines.push(`**${i + 1}. ${s.title}**`);
 lines.push(` ${s.detail}`);
 }
 if (allSources.length === 0) {
 lines.push("هیچ داده‌ی منطبقی پیدا نشد.");
 } else {
 lines.push("");
 lines.push(`نوع سوال تشخیص‌داده‌شده: **${intent}**`);
 }
 reply = lines.join("\n");
 }
 }

 // 5) Audit log
 await auditLog({
 tenantId: authCtx.tenantId,
 userId: authCtx.userId,
 action: "AI_RAG_QUERY",
 entity: "ai.rag",
 changes: {
 question: question.slice(0, 200),
 intent,
 keywords: keywords.slice(0, 5),
 sourcesCount: allSources.length,
 usedFallback,
 },
 req,
 });

 // 6) Return
 return NextResponse.json({
 success: true,
 reply,
 intent,
 sources: allSources,
 sourcesCount: allSources.length,
 keywords,
 usedFallback,
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("RAG endpoint error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش RAG. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}

// GET — health + info
export async function GET() {
 return NextResponse.json({
 success: true,
 endpoint: "/api/ai/rag",
 features: [
 "keyword-search",
 "intent-detection",
 "persian-normalization",
 "source-citation",
 "rate-limit-8-per-minute",
 ],
 intents: [
 "top_customer",
 "monthly_sales",
 "overdue_invoices",
 "top_products",
 "supplier_balance",
 "general",
 ],
 });
}
