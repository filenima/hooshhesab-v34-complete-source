import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

interface UnifiedResult {
 id: string;
 source: "hoshhesab" | "nobatime" | "catalog" | "hesabyar";
 sourceLabel: string;
 entityType: string;
 title: string;
 snippet: string;
 url?: string;
 date?: string;
 amount?: number;
 status?: string;
 externalId?: string;
}

const SERVICE_LABELS: Record<string, string> = {
 hoshhesab: "هوش",
 nobatime: "نوباتایم",
 catalog: "کاتالوگ",
 hesabyar: "حساب‌یار",
};

const SERVICE_ENTITIES: Record<string, string[]> = {
 nobatime: ["appointment", "booking", "customer"],
 catalog: ["product", "order", "category"],
 hesabyar: ["transaction", "report", "alert"],
};

/**
 * GET /api/ecosystem/search?q=...
 * جستجوی یکپارچه در:
 * - داده‌های هوش (فاکتور، کالا، طرف‌حساب)
 * - نوبت‌های نوباتایم (اگر متصل باشد)
 * - محصولات کاتالوگ (اگر متصل باشد)
 * - تراکنش‌های حساب‌یار (اگر متصل باشد)
 *
 * نیازمند احراز هویت + حداقل یک اتصال اکوسیستم فعال.
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
 select: { id: true, tenantId: true, name: true, family: true },
 });
 if (!user) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const { searchParams } = new URL(req.url);
 const q = (searchParams.get("q") || "").trim();
 const limit = Math.min(
 50,
 Math.max(1, Number(searchParams.get("limit") || 20))
 );

 if (!q || q.length < 2) {
 return NextResponse.json({
 success: true,
 results: [],
 total: 0,
 sources: [],
 message: "حداقل ۲ حرف برای جستجو لازم است",
 });
 }

 // بررسی اتصال‌های فعال اکوسیستم
 const connections = await db.ecosystemConnection.findMany({
 where: { tenantId: user.tenantId, status: "CONNECTED" },
 });
 const connectedServices = new Set(connections.map((c) => c.service));

 if (connectedServices.size === 0) {
 return NextResponse.json({
 success: false,
 error: "برای جستجوی اکوسیستم، حداقل یک سرویس متصل لازم است",
 results: [],
 total: 0,
 }, { status: 403 });
 }

 const results: UnifiedResult[] = [];
 const sources: { id: string; label: string; count: number }[] = [];

 // ============ ۱. جستجو در داده‌های هوش ============
 const localLimit = Math.ceil(limit / (1 + connectedServices.size));

 // فاکتورها
 try {
 const invoices = await db.invoice.findMany({
 where: {
 tenantId: user.tenantId,
 OR: [
 { number: { contains: q } },
 { description: { contains: q } },
 ],
 },
 take: localLimit,
 orderBy: { date: "desc" },
 include: { party: { select: { name: true } } },
 });
 for (const inv of invoices) {
 results.push({
 id: inv.id,
 source: "hoshhesab",
 sourceLabel: SERVICE_LABELS.hoshhesab,
 entityType: "invoice",
 title: `فاکتور ${inv.number}`,
 snippet: inv.description || inv.party?.name || "—",
 date: inv.date?.toISOString(),
 amount: Number(inv.total),
 status: inv.status,
 });
 }
 } catch (err) {
 console.error("Unified search invoices error:", err);
 }

 // کالاها
 try {
 const products = await db.product.findMany({
 where: {
 tenantId: user.tenantId,
 OR: [
 { name: { contains: q } },
 { sku: { contains: q } },
 { barcode: { contains: q } },
 ],
 },
 take: localLimit,
 orderBy: { updatedAt: "desc" },
 });
 for (const p of products) {
 results.push({
 id: p.id,
 source: "hoshhesab",
 sourceLabel: SERVICE_LABELS.hoshhesab,
 entityType: "product",
 title: p.name,
 snippet: `کد: ${p.sku || "—"}`,
 amount: Number(p.salePrice || 0),
 });
 }
 } catch (err) {
 console.error("Unified search products error:", err);
 }

 // طرف‌حساب‌ها
 try {
 const parties = await db.party.findMany({
 where: {
 tenantId: user.tenantId,
 OR: [
 { name: { contains: q } },
 { phone: { contains: q } },
 { email: { contains: q } },
 ],
 },
 take: localLimit,
 orderBy: { updatedAt: "desc" },
 });
 for (const p of parties) {
 results.push({
 id: p.id,
 source: "hoshhesab",
 sourceLabel: SERVICE_LABELS.hoshhesab,
 entityType: "party",
 title: p.name,
 snippet: [p.phone, p.email].filter(Boolean).join(" · ") || "—",
 date: p.updatedAt?.toISOString(),
 });
 }
 } catch (err) {
 console.error("Unified search parties error:", err);
 }

 sources.push({
 id: "hoshhesab",
 label: SERVICE_LABELS.hoshhesab,
 count: results.length,
 });

 // ============ ۲. جستجو در نوباتایم (اگر متصل) ============
 if (connectedServices.has("NOBATIME")) {
 const nobatimeConn = connections.find((c) => c.service === "NOBATIME");
 const nobatimeCount = await searchNobatime(
 nobatimeConn,
 q,
 localLimit,
 results
 );
 sources.push({
 id: "nobatime",
 label: SERVICE_LABELS.nobatime,
 count: nobatimeCount,
 });
 }

 // ============ ۳. جستجو در کاتالوگ (اگر متصل) ============
 if (connectedServices.has("CATALOG")) {
 const catalogConn = connections.find((c) => c.service === "CATALOG");
 const catalogCount = await searchCatalog(
 catalogConn,
 q,
 localLimit,
 results
 );
 sources.push({
 id: "catalog",
 label: SERVICE_LABELS.catalog,
 count: catalogCount,
 });
 }

 // ============ ۴. جستجو در حساب‌یار (اگر متصل) ============
 if (connectedServices.has("HESABYAR")) {
 const hesabyarConn = connections.find((c) => c.service === "HESABYAR");
 const hesabyarCount = await searchHesabYar(
 hesabyarConn,
 q,
 localLimit,
 results
 );
 sources.push({
 id: "hesabyar",
 label: SERVICE_LABELS.hesabyar,
 count: hesabyarCount,
 });
 }

 // مرتب‌سازی: ابتدا نتایج هوش، سپس سایر سرویس‌ها
 results.sort((a, b) => {
 if (a.source === "hoshhesab" && b.source!== "hoshhesab") return -1;
 if (a.source!== "hoshhesab" && b.source === "hoshhesab") return 1;
 return 0;
 });

 const trimmed = results.slice(0, limit);

 return NextResponse.json({
 success: true,
 results: trimmed,
 total: results.length,
 sources,
 query: q,
 });
 } catch (error) {
 console.error("Unified ecosystem search error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در جستجوی یکپارچه" },
 { status: 500 }
 );
 }
}

// ============ جستجو در سرویس‌های خارجی ============
// در production واقعی، این توابع به API نوباتایم/کاتالوگ/حساب‌یار متصل می‌شوند.
// در حالت دمو/mock، نتایج شبیه‌سازی شده برمی‌گردند.

async function searchNobatime(
 conn: { ssoToken: string | null; externalId: string | null; config: string | null } | undefined,
 q: string,
 limit: number,
 results: UnifiedResult[]
): Promise<number> {
 if (!conn) return 0;

 // اگر در config حالت mock فعال بود، نتایج شبیه‌سازی‌شده برگردان
 let isMock = true;
 let accessToken: string | null = null;
 if (conn.config) {
 try {
 const cfg = JSON.parse(conn.config) as { mode?: string; accessToken?: string };
 if (cfg.mode === "live" && cfg.accessToken) {
 isMock = false;
 accessToken = cfg.accessToken;
 }
 } catch {
 /* ignore */
 }
 }

 if (isMock) {
 // نتایج شبیه‌سازی‌شده برای دمو
 const mockResults = [
 {
 id: `nob_${q.slice(0, 4)}_1`,
 title: `نوبت ${q} - دکتر احمدی`,
 snippet: "ساعت ۱۰:۰۰ - ۱۴۰۳/۰۷/۱۵",
 date: new Date().toISOString(),
 status: "تأیید شده",
 },
 {
 id: `nob_${q.slice(0, 4)}_2`,
 title: `نوبت ${q} - کلینیک پارسیان`,
 snippet: "ساعت ۱۴:۳۰ - ۱۴۰۳/۰۷/۱۶",
 date: new Date(Date.now() + 86400000).toISOString(),
 status: "در انتظار",
 },
 ].slice(0, limit);

 for (const r of mockResults) {
 results.push({
 id: r.id,
 source: "nobatime",
 sourceLabel: SERVICE_LABELS.nobatime,
 entityType: "appointment",
 title: r.title,
 snippet: r.snippet,
 date: r.date,
 status: r.status,
 externalId: conn.externalId || undefined,
 url: "https://nobatime.ir",
 });
 }
 return mockResults.length;
 }

 // حالت live: فراخوانی API واقعی Nobatime
 try {
 const res = await fetch(
 `https://nobatime.ir/api/appointments?q=${encodeURIComponent(q)}&limit=${limit}`,
 {
 headers: { Authorization: `Bearer ${accessToken}` },
 signal: AbortSignal.timeout(8000),
 }
 );
 if (!res.ok) return 0;
 const data = (await res.json()) as { appointments?: unknown[] };
 const items = Array.isArray(data.appointments)? data.appointments: [];
 for (const item of items) {
 const a = item as Record<string, unknown>;
 results.push({
 id: String(a.id || `nob_${Math.random()}`),
 source: "nobatime",
 sourceLabel: SERVICE_LABELS.nobatime,
 entityType: "appointment",
 title: String(a.title || a.patientName || "نوبت"),
 snippet: String(a.notes || a.time || "—"),
 date: a.date? String(a.date): undefined,
 status: a.status? String(a.status): undefined,
 externalId: conn.externalId || undefined,
 url: "https://nobatime.ir",
 });
 }
 return items.length;
 } catch (err) {
 console.error("Nobatime search error:", err);
 return 0;
 }
}

async function searchCatalog(
 conn: { ssoToken: string | null; externalId: string | null; config: string | null } | undefined,
 q: string,
 limit: number,
 results: UnifiedResult[]
): Promise<number> {
 if (!conn) return 0;

 let isMock = true;
 let accessToken: string | null = null;
 if (conn.config) {
 try {
 const cfg = JSON.parse(conn.config) as { mode?: string; accessToken?: string };
 if (cfg.mode === "live" && cfg.accessToken) {
 isMock = false;
 accessToken = cfg.accessToken;
 }
 } catch {
 /* ignore */
 }
 }

 if (isMock) {
 const mockResults = [
 {
 id: `cat_${q.slice(0, 4)}_1`,
 title: `محصول ${q}`,
 snippet: "قیمت: ۲۴۰٬۰۰۰ تومان · موجود",
 amount: 240000,
 status: "active",
 },
 {
 id: `cat_${q.slice(0, 4)}_2`,
 title: `سفارش ${q}`,
 snippet: "۲ کالا · ۵۸۰٬۰۰۰ تومان",
 amount: 580000,
 status: "pending",
 },
 ].slice(0, limit);

 for (const r of mockResults) {
 results.push({
 id: r.id,
 source: "catalog",
 sourceLabel: SERVICE_LABELS.catalog,
 entityType: r.id.startsWith("cat") && r.title.includes("سفارش")? "order": "product",
 title: r.title,
 snippet: r.snippet,
 amount: r.amount,
 status: r.status,
 externalId: conn.externalId || undefined,
 url: "https://catalog.nobatime.ir",
 });
 }
 return mockResults.length;
 }

 try {
 const res = await fetch(
 `https://catalog.nobatime.ir/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
 {
 headers: { Authorization: `Bearer ${accessToken}` },
 signal: AbortSignal.timeout(8000),
 }
 );
 if (!res.ok) return 0;
 const data = (await res.json()) as { products?: unknown[]; orders?: unknown[] };
 const products = Array.isArray(data.products)? data.products: [];
 const orders = Array.isArray(data.orders)? data.orders: [];
 let count = 0;
 for (const item of products) {
 const p = item as Record<string, unknown>;
 results.push({
 id: String(p.id || `cat_${Math.random()}`),
 source: "catalog",
 sourceLabel: SERVICE_LABELS.catalog,
 entityType: "product",
 title: String(p.name || "کالا"),
 snippet: String(p.description || "—"),
 amount: p.price? Number(p.price): undefined,
 externalId: conn.externalId || undefined,
 });
 count++;
 }
 for (const item of orders) {
 const o = item as Record<string, unknown>;
 results.push({
 id: String(o.id || `cat_order_${Math.random()}`),
 source: "catalog",
 sourceLabel: SERVICE_LABELS.catalog,
 entityType: "order",
 title: `سفارش ${o.id || ""}`,
 snippet: String(o.notes || "—"),
 amount: o.total? Number(o.total): undefined,
 status: o.status? String(o.status): undefined,
 externalId: conn.externalId || undefined,
 });
 count++;
 }
 return count;
 } catch (err) {
 console.error("Catalog search error:", err);
 return 0;
 }
}

async function searchHesabYar(
 conn: { ssoToken: string | null; externalId: string | null; config: string | null } | undefined,
 q: string,
 limit: number,
 results: UnifiedResult[]
): Promise<number> {
 if (!conn) return 0;

 let isMock = true;
 let accessToken: string | null = null;
 if (conn.config) {
 try {
 const cfg = JSON.parse(conn.config) as { mode?: string; accessToken?: string };
 if (cfg.mode === "live" && cfg.accessToken) {
 isMock = false;
 accessToken = cfg.accessToken;
 }
 } catch {
 /* ignore */
 }
 }

 if (isMock) {
 const mockResults = [
 {
 id: `hy_${q.slice(0, 4)}_1`,
 title: `تراکنش ${q}`,
 snippet: "واریز · ۱٬۲۰۰٬۰۰۰ تومان · بانک ملت",
 amount: 1200000,
 date: new Date().toISOString(),
 status: "تأیید شده",
 },
 {
 id: `hy_${q.slice(0, 4)}_2`,
 title: `هشدار ${q}`,
 snippet: "سررسید چک نزدیک است",
 date: new Date(Date.now() + 172800000).toISOString(),
 status: "warning",
 },
 ].slice(0, limit);

 for (const r of mockResults) {
 results.push({
 id: r.id,
 source: "hesabyar",
 sourceLabel: SERVICE_LABELS.hesabyar,
 entityType: r.title.includes("تراکنش")? "transaction": "alert",
 title: r.title,
 snippet: r.snippet,
 amount: r.amount,
 date: r.date,
 status: r.status,
 externalId: conn.externalId || undefined,
 url: "https://yar.nobatime.ir",
 });
 }
 return mockResults.length;
 }

 try {
 const res = await fetch(
 `https://yar.nobatime.ir/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
 {
 headers: { Authorization: `Bearer ${accessToken}` },
 signal: AbortSignal.timeout(8000),
 }
 );
 if (!res.ok) return 0;
 const data = (await res.json()) as { transactions?: unknown[]; alerts?: unknown[] };
 const transactions = Array.isArray(data.transactions)? data.transactions: [];
 const alerts = Array.isArray(data.alerts)? data.alerts: [];
 let count = 0;
 for (const item of transactions) {
 const t = item as Record<string, unknown>;
 results.push({
 id: String(t.id || `hy_${Math.random()}`),
 source: "hesabyar",
 sourceLabel: SERVICE_LABELS.hesabyar,
 entityType: "transaction",
 title: String(t.description || "تراکنش"),
 snippet: String(t.bank || "—"),
 amount: t.amount? Number(t.amount): undefined,
 date: t.date? String(t.date): undefined,
 externalId: conn.externalId || undefined,
 });
 count++;
 }
 for (const item of alerts) {
 const a = item as Record<string, unknown>;
 results.push({
 id: String(a.id || `hy_alert_${Math.random()}`),
 source: "hesabyar",
 sourceLabel: SERVICE_LABELS.hesabyar,
 entityType: "alert",
 title: String(a.title || "هشدار"),
 snippet: String(a.message || "—"),
 date: a.date? String(a.date): undefined,
 status: a.severity? String(a.severity): undefined,
 externalId: conn.externalId || undefined,
 });
 count++;
 }
 return count;
 } catch (err) {
 console.error("HesabYar search error:", err);
 return 0;
 }
}

export const _internal = { SERVICE_ENTITIES };
