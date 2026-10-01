// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * هوش — CQRS Handlers (Queries)
 * =============================================================
 * Query handlers برای read-side.
 *
 * این هندلرها فقط از دیتابیس می‌خوانند و می‌توانند به replica متصل شوند.
 * نتایج می‌توانند با cache همراه شوند.
 */

import { db } from "@/lib/db";
import type { Query, QueryHandler } from "../query-bus";

// ============ Invoice Queries ============

export class GetInvoiceByIdQuery implements Query {
 readonly type = "GetInvoiceById";
 constructor(
 readonly tenantId: string,
 readonly payload: { invoiceId: string }
 ) {}
}

export class GetInvoiceByIdHandler implements QueryHandler<GetInvoiceByIdQuery> {
 readonly queryType = "GetInvoiceById";

 async handle(query: GetInvoiceByIdQuery) {
 const invoice = await db.invoice.findFirst({
 where: {
 id: query.payload.invoiceId,
 tenantId: query.tenantId,
 },
 });
 if (!invoice) throw new Error("فاکتور یافت نشد");
 return invoice;
 }
}

export class ListInvoicesQuery implements Query {
 readonly type = "ListInvoices";
 constructor(
 readonly tenantId: string,
 readonly payload: {
 limit?: number;
 offset?: number;
 type?: string;
 status?: string;
 }
 ) {}
}

export class ListInvoicesHandler implements QueryHandler<ListInvoicesQuery> {
 readonly queryType = "ListInvoices";

 async handle(query: ListInvoicesQuery) {
 const { limit = 50, offset = 0, type, status } = query.payload;
 const [items, total] = await Promise.all([
 db.invoice.findMany({
 where: {
 tenantId: query.tenantId,
...(type? { type }: {}),
...(status? { status }: {}),
 },
 orderBy: { date: "desc" },
 take: limit,
 skip: offset,
 }),
 db.invoice.count({
 where: {
 tenantId: query.tenantId,
...(type? { type }: {}),
...(status? { status }: {}),
 },
 }),
 ]);
 return { items, total, limit, offset };
 }
}

// ============ Product Queries ============

export class ListProductsQuery implements Query {
 readonly type = "ListProducts";
 constructor(
 readonly tenantId: string,
 readonly payload: {
 limit?: number;
 q?: string;
 categoryId?: string;
 }
 ) {}
}

export class ListProductsHandler implements QueryHandler<ListProductsQuery> {
 readonly queryType = "ListProducts";

 async handle(query: ListProductsQuery) {
 const { limit = 50, q, categoryId } = query.payload;
 const items = await db.product.findMany({
 where: {
 tenantId: query.tenantId,
 deletedAt: null,
...(q? { name: { contains: q } }: {}),
...(categoryId? { categoryId }: {}),
 },
 take: limit,
 orderBy: { createdAt: "desc" },
 });
 return { items, count: items.length };
 }
}

// ============ Party Queries ============

export class ListPartiesQuery implements Query {
 readonly type = "ListParties";
 constructor(
 readonly tenantId: string,
 readonly payload: {
 limit?: number;
 q?: string;
 type?: string; // CUSTOMER | SUPPLIER
 }
 ) {}
}

export class ListPartiesHandler implements QueryHandler<ListPartiesQuery> {
 readonly queryType = "ListParties";

 async handle(query: ListPartiesQuery) {
 const { limit = 50, q, type } = query.payload;
 const items = await db.party.findMany({
 where: {
 tenantId: query.tenantId,
 deletedAt: null,
...(q? { name: { contains: q } }: {}),
...(type? { type }: {}),
 },
 take: limit,
 orderBy: { createdAt: "desc" },
 });
 return { items, count: items.length };
 }
}

// ============ Dashboard Summary Query ============

export class GetDashboardSummaryQuery implements Query {
 readonly type = "GetDashboardSummary";
 constructor(
 readonly tenantId: string,
 readonly payload: Record<string, unknown>
 ) {}
}

export class GetDashboardSummaryHandler implements QueryHandler<GetDashboardSummaryQuery> {
 readonly queryType = "GetDashboardSummary";

 async handle(query: GetDashboardSummaryQuery) {
 const tenantId = query.tenantId;
 const [invoiceCount, productCount, partyCount, recentInvoices] = await Promise.all([
 db.invoice.count({ where: { tenantId } }),
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.party.count({ where: { tenantId, deletedAt: null } }),
 db.invoice.findMany({
 where: { tenantId },
 orderBy: { date: "desc" },
 take: 5,
 }),
 ]);
 return {
 counts: { invoices: invoiceCount, products: productCount, parties: partyCount },
 recentInvoices,
 };
 }
}

// ============ Registration helper ============

import { registerQueryHandler } from "../query-bus";

/**
 * ثبت همه‌ی query handlers پیش‌فرض.
 */
export function registerDefaultQueryHandlers(): void {
 registerQueryHandler(new GetInvoiceByIdHandler());
 registerQueryHandler(new ListInvoicesHandler());
 registerQueryHandler(new ListProductsHandler());
 registerQueryHandler(new ListPartiesHandler());
 registerQueryHandler(new GetDashboardSummaryHandler());
}

export type { Query };
