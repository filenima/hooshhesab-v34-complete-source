import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

interface SearchResult {
 id: string;
 entityType: "invoice" | "product" | "party" | "journal";
 title: string;
 snippet: string;
 date?: string;
 amount?: number;
 status?: string;
 url?: string;
}

interface SearchFilters {
 dateFrom?: string;
 dateTo?: string;
 amountMin?: number;
 amountMax?: number;
 status?: string[];
 category?: string;
 partyId?: string;
}

function parseFilters(raw: string | null): SearchFilters {
 if (!raw) return {};
 try {
 return JSON.parse(raw) as SearchFilters;
 } catch {
 return {};
 }
}

/**
 * GET /api/search?q=...&entity=invoices&filters=...&page=1&limit=20
 * جستجوی full-text در فاکتورها، کالاها، طرف‌حساب‌ها و اسناد حسابداری.
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: { id: true, tenantId: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const q = (searchParams.get("q") || "").trim();
 const entity = (searchParams.get("entity") || "all").toLowerCase();
 const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
 const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
 const filters = parseFilters(searchParams.get("filters"));
 const sortBy = (searchParams.get("sort") || "date").toLowerCase();

 if (!q && entity === "all") {
 return NextResponse.json({
 success: true,
 results: [],
 total: 0,
 page,
 limit,
 });
 }

 const results: SearchResult[] = [];
 const entities =
 entity === "all"
? ["invoices", "products", "parties", "journal"]
: [entity];

 const baseWhere = { tenantId: user.tenantId, deletedAt: null };

 for (const ent of entities) {
 if (ent === "invoices" || ent === "invoice") {
 const where: Record<string, unknown> = {...baseWhere };
 if (q) {
 where.OR = [
 { number: { contains: q } },
 { description: { contains: q } },
 ];
 }
 if (filters.status?.length) {
 where.status = { in: filters.status };
 }
 if (filters.partyId) where.partyId = filters.partyId;
 if (filters.dateFrom || filters.dateTo) {
 where.date = {};
 if (filters.dateFrom)
 (where.date as Record<string, unknown>).gte = new Date(filters.dateFrom);
 if (filters.dateTo)
 (where.date as Record<string, unknown>).lte = new Date(filters.dateTo);
 }

 const orderBy: Record<string, "asc" | "desc"> =
 sortBy === "amount"? { total: "desc" }: { date: "desc" };

 const invoices = await db.invoice.findMany({
 where,
 include: { party: true },
 orderBy,
 take: limit,
 skip: (page - 1) * limit,
 });

 for (const inv of invoices) {
 const total = Number(inv.total);
 if (filters.amountMin!== undefined && total < filters.amountMin) continue;
 if (filters.amountMax!== undefined && total > filters.amountMax) continue;
 results.push({
 id: inv.id,
 entityType: "invoice",
 title: `فاکتور ${inv.number}`,
 snippet: `${inv.party?.name?? "—"} — ${inv.description?? "بدون توضیحات"}`,
 date: inv.date.toISOString(),
 amount: total,
 status: inv.status,
 url: "/invoices",
 });
 }
 }

 if (ent === "products" || ent === "product") {
 const where: Record<string, unknown> = {...baseWhere };
 if (q) {
 where.OR = [
 { name: { contains: q } },
 { sku: { contains: q } },
 { barcode: { contains: q } },
 ];
 }
 if (filters.category) where.categoryId = filters.category;

 const orderBy: Record<string, "asc" | "desc"> =
 sortBy === "name"? { name: "asc" }: { createdAt: "desc" };

 const products = await db.product.findMany({
 where,
 orderBy,
 take: limit,
 skip: (page - 1) * limit,
 });

 for (const p of products) {
 const sale = Number(p.salePrice);
 if (filters.amountMin!== undefined && sale < filters.amountMin) continue;
 if (filters.amountMax!== undefined && sale > filters.amountMax) continue;
 results.push({
 id: p.id,
 entityType: "product",
 title: p.name,
 snippet: `کد ${p.sku} — واحد ${p.unit} — قیمت فروش`,
 date: p.createdAt.toISOString(),
 amount: sale,
 status: p.type,
 url: "/inventory",
 });
 }
 }

 if (ent === "parties" || ent === "party") {
 const where: Record<string, unknown> = {...baseWhere };
 if (q) {
 where.OR = [
 { name: { contains: q } },
 { code: { contains: q } },
 { mobile: { contains: q } },
 // NOTE: nationalId is encrypted in the database, so a plaintext
 // `contains` search will never match. It has been intentionally
 // removed from the search filters.
 { economicCode: { contains: q } },
 ];
 }

 const orderBy: Record<string, "asc" | "desc"> =
 sortBy === "name"? { name: "asc" }: { createdAt: "desc" };

 const parties = await db.party.findMany({
 where,
 orderBy,
 take: limit,
 skip: (page - 1) * limit,
 });

 for (const p of parties) {
 results.push({
 id: p.id,
 entityType: "party",
 title: p.name,
 snippet: `کد ${p.code} — ${p.type === "CUSTOMER"? "مشتری": p.type === "SUPPLIER"? "تأمین‌کننده": "مشتری/تأمین‌کننده"}${p.mobile? " — " + p.mobile: ""}`,
 date: p.createdAt.toISOString(),
 status: p.type,
 url: "/crm",
 });
 }
 }

 if (ent === "journal" || ent === "journal_entries") {
 const where: Record<string, unknown> = {...baseWhere };
 if (q) {
 where.OR = [
 { description: { contains: q } },
...(isNaN(Number(q))? []: [{ number: Number(q) }]),
 ];
 }
 if (filters.status?.length) {
 where.status = { in: filters.status };
 }
 if (filters.dateFrom || filters.dateTo) {
 where.date = {};
 if (filters.dateFrom)
 (where.date as Record<string, unknown>).gte = new Date(filters.dateFrom);
 if (filters.dateTo)
 (where.date as Record<string, unknown>).lte = new Date(filters.dateTo);
 }

 const entries = await db.journalEntry.findMany({
 where,
 orderBy: { date: "desc" },
 take: limit,
 skip: (page - 1) * limit,
 include: { lines: true },
 });

 for (const e of entries) {
 const totalDebit = e.lines.reduce(
 (sum, l) => sum + Number(l.debit),
 0
 );
 if (filters.amountMin!== undefined && totalDebit < filters.amountMin) continue;
 if (filters.amountMax!== undefined && totalDebit > filters.amountMax) continue;
 results.push({
 id: e.id,
 entityType: "journal",
 title: `سند ${e.number}`,
 snippet: e.description,
 date: e.date.toISOString(),
 amount: totalDebit,
 status: e.status,
 url: "/core",
 });
 }
 }
 }

 if (entity === "all") {
 results.sort((a, b) => {
 if (sortBy === "amount") return (b.amount?? 0) - (a.amount?? 0);
 if (sortBy === "name") return (a.title || "").localeCompare(b.title || "");
 return (b.date || "").localeCompare(a.date || "");
 });
 }

 const total = results.length;
 const pagedResults = results.slice(0, limit);

 return NextResponse.json({
 success: true,
 results: pagedResults,
 total,
 page,
 limit,
 });
 } catch (error) {
 console.error("Search error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای جستجو" },
 { status: 500 }
 );
 }
}
