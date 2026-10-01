import { NextRequest, NextResponse } from "next/server";
import { graphql, GraphQLObjectType, GraphQLSchema, GraphQLString, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLBoolean, GraphQLFieldConfig, GraphQLError } from "graphql";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * GET /api/graphql
 * - ارائه‌ی ساده‌ی endpoint info (GraphiQL پیشنهاد می‌شود)
 */
export async function GET() {
 return NextResponse.json({
 success: true,
 message: "GraphQL endpoint — POST your query to /api/graphql",
 methods: ["POST"],
 schema: ["me", "invoices", "products", "parties", "dashboardStats"],
 });
}

/* ============================================================
 تایپ‌های GraphQL
 ============================================================ */

const UserType = new GraphQLObjectType({
 name: "User",
 fields: () => ({
 id: { type: GraphQLString },
 username: { type: GraphQLString },
 email: { type: GraphQLString },
 name: { type: GraphQLString },
 family: { type: GraphQLString },
 phone: { type: GraphQLString },
 role: { type: GraphQLString },
 company: { type: GraphQLString },
 isDemo: { type: GraphQLBoolean },
 isTrial: { type: GraphQLBoolean },
 trialEndsAt: { type: GraphQLString },
 createdAt: { type: GraphQLString },
 }),
});

const TenantType = new GraphQLObjectType({
 name: "Tenant",
 fields: () => ({
 id: { type: GraphQLString },
 name: { type: GraphQLString },
 plan: { type: GraphQLString },
 status: { type: GraphQLString },
 }),
});

const InvoiceItemType = new GraphQLObjectType({
 name: "InvoiceItem",
 fields: () => ({
 id: { type: GraphQLString },
 description: { type: GraphQLString },
 quantity: { type: GraphQLInt },
 unitPrice: { type: GraphQLString },
 taxAmount: { type: GraphQLString },
 total: { type: GraphQLString },
 }),
});

const InvoiceType = new GraphQLObjectType({
 name: "Invoice",
 fields: () => ({
 id: { type: GraphQLString },
 number: { type: GraphQLString },
 type: { type: GraphQLString },
 date: { type: GraphQLString },
 dueDate: { type: GraphQLString },
 status: { type: GraphQLString },
 modianStatus: { type: GraphQLString },
 subtotal: { type: GraphQLString },
 tax: { type: GraphQLString },
 total: { type: GraphQLString },
 description: { type: GraphQLString },
 partyName: {
 type: GraphQLString,
 resolve: (root: Record<string, unknown>) => {
 const party = root.party as { name?: string } | null;
 return party?.name?? null;
 },
 },
 items: {
 type: new GraphQLList(InvoiceItemType),
 resolve: (root: Record<string, unknown>) =>
 (root.items as Record<string, unknown>[])?? [],
 },
 }),
});

const ProductType = new GraphQLObjectType({
 name: "Product",
 fields: () => ({
 id: { type: GraphQLString },
 name: { type: GraphQLString },
 sku: { type: GraphQLString },
 barcode: { type: GraphQLString },
 unit: { type: GraphQLString },
 purchasePrice: { type: GraphQLString },
 salePrice: { type: GraphQLString },
 wholesalePrice: { type: GraphQLString },
 taxRate: { type: GraphQLInt },
 createdAt: { type: GraphQLString },
 }),
});

const PartyType = new GraphQLObjectType({
 name: "Party",
 fields: () => ({
 id: { type: GraphQLString },
 name: { type: GraphQLString },
 code: { type: GraphQLString },
 type: { type: GraphQLString },
 mobile: { type: GraphQLString },
 nationalId: { type: GraphQLString },
 creditLimit: { type: GraphQLString },
 openingBalance: { type: GraphQLString },
 createdAt: { type: GraphQLString },
 }),
});

const DashboardStatsType = new GraphQLObjectType({
 name: "DashboardStats",
 fields: () => ({
 invoices: { type: GraphQLInt },
 parties: { type: GraphQLInt },
 products: { type: GraphQLInt },
 checks: { type: GraphQLInt },
 employees: { type: GraphQLInt },
 pendingReminders: { type: GraphQLInt },
 lowStockProducts: { type: GraphQLInt },
 revenue: { type: GraphQLString },
 expenses: { type: GraphQLString },
 profit: { type: GraphQLString },
 }),
});

/* ============================================================
 Resolver context
 ============================================================ */

interface GraphQLContext {
 user: { id: string; tenantId: string } | null;
}

/* ============================================================
 Helper: convert BigInt fields to strings for serialization
 ============================================================ */

function serializeInvoice(inv: Record<string, unknown>) {
 return {
...inv,
 subtotal: String(inv.subtotal?? "0"),
 tax: String(inv.tax?? "0"),
 total: String(inv.total?? "0"),
 discount: String(inv.discount?? "0"),
 paidAmount: String(inv.paidAmount?? "0"),
 otherCosts: String(inv.otherCosts?? "0"),
 items: ((inv.items as Record<string, unknown>[])?? []).map((it) => ({
...it,
 unitPrice: String(it.unitPrice?? "0"),
 taxAmount: String(it.taxAmount?? "0"),
 total: String(it.total?? "0"),
 })),
 };
}

/* ============================================================
 Query fields
 ============================================================ */

const meField: GraphQLFieldConfig<unknown, GraphQLContext> = {
 type: UserType,
 resolve: async (_root, _args, ctx) => {
 if (!ctx.user) throw new GraphQLError("احراز هویت الزامی است");
 const user = await db.user.findUnique({
 where: { id: ctx.user.id },
 });
 if (!user) throw new GraphQLError("کاربر یافت نشد");
 return {
...user,
 trialEndsAt: user.trialEndsAt?.toISOString()?? null,
 createdAt: user.createdAt.toISOString(),
 };
 },
};

const invoicesField: GraphQLFieldConfig<unknown, GraphQLContext> = {
 type: new GraphQLList(InvoiceType),
 args: {
 limit: { type: GraphQLInt, defaultValue: 50 },
 offset: { type: GraphQLInt, defaultValue: 0 },
 type: { type: GraphQLString },
 },
 resolve: async (_root, args, ctx) => {
 if (!ctx.user) throw new GraphQLError("احراز هویت الزامی است");
 const where: Record<string, unknown> = {
 tenantId: ctx.user.tenantId,
 deletedAt: null,
 };
 if (typeof args.type === "string" && args.type) {
 where.type = args.type;
 }
 const invoices = await db.invoice.findMany({
 where,
 include: { party: true, items: true },
 orderBy: { date: "desc" },
 take: Number(args.limit) || 50,
 skip: Number(args.offset) || 0,
 });
 return invoices.map(serializeInvoice);
 },
};

const productsField: GraphQLFieldConfig<unknown, GraphQLContext> = {
 type: new GraphQLList(ProductType),
 args: {
 limit: { type: GraphQLInt, defaultValue: 50 },
 },
 resolve: async (_root, args, ctx) => {
 if (!ctx.user) throw new GraphQLError("احراز هویت الزامی است");
 const products = await db.product.findMany({
 where: { tenantId: ctx.user.tenantId, deletedAt: null },
 orderBy: { createdAt: "desc" },
 take: Number(args.limit) || 50,
 });
 return products.map((p) => ({
...p,
 purchasePrice: String(p.purchasePrice),
 salePrice: String(p.salePrice),
 wholesalePrice: String(p.wholesalePrice),
 }));
 },
};

const partiesField: GraphQLFieldConfig<unknown, GraphQLContext> = {
 type: new GraphQLList(PartyType),
 args: {
 limit: { type: GraphQLInt, defaultValue: 50 },
 },
 resolve: async (_root, args, ctx) => {
 if (!ctx.user) throw new GraphQLError("احراز هویت الزامی است");
 const parties = await db.party.findMany({
 where: { tenantId: ctx.user.tenantId, deletedAt: null },
 orderBy: { createdAt: "desc" },
 take: Number(args.limit) || 50,
 });
 return parties.map((p) => ({
...p,
 creditLimit: String(p.creditLimit),
 openingBalance: String(p.openingBalance),
 }));
 },
};

const dashboardStatsField: GraphQLFieldConfig<unknown, GraphQLContext> = {
 type: DashboardStatsType,
 resolve: async (_root, _args, ctx) => {
 if (!ctx.user) throw new GraphQLError("احراز هویت الزامی است");
 const tenantId = ctx.user.tenantId;
 const [
 invoicesCount,
 partiesCount,
 productsCount,
 checksCount,
 employeesCount,
 pendingReminders,
 lowStockProducts,
 ] = await Promise.all([
 db.invoice.count({ where: { tenantId, deletedAt: null } }),
 db.party.count({ where: { tenantId, deletedAt: null } }),
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.check.count({ where: { tenantId, deletedAt: null } }),
 db.employee.count({ where: { tenantId, deletedAt: null } }),
 db.reminder.count({ where: { tenantId, status: "PENDING" } }),
 db.stockItem.count({ where: { tenantId, quantity: { lte: 5 } } }),
 ]);

 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
 const salesInvoices = await db.invoice.findMany({
 where: { tenantId, type: "SALE", date: { gte: monthStart }, deletedAt: null },
 select: { total: true },
 });
 const purchaseInvoices = await db.invoice.findMany({
 where: { tenantId, type: "PURCHASE", date: { gte: monthStart }, deletedAt: null },
 select: { total: true },
 });
 const revenue = salesInvoices.reduce((s, i) => s + Number(i.total), 0);
 const expenses = purchaseInvoices.reduce((s, i) => s + Number(i.total), 0);
 const profit = revenue - expenses;

 return {
 invoices: invoicesCount,
 parties: partiesCount,
 products: productsCount,
 checks: checksCount,
 employees: employeesCount,
 pendingReminders,
 lowStockProducts,
 revenue: String(revenue),
 expenses: String(expenses),
 profit: String(profit),
 };
 },
};

const tenantField: GraphQLFieldConfig<unknown, GraphQLContext> = {
 type: TenantType,
 resolve: async (_root, _args, ctx) => {
 if (!ctx.user) throw new GraphQLError("احراز هویت الزامی است");
 const tenant = await db.tenant.findUnique({ where: { id: ctx.user.tenantId } });
 if (!tenant) throw new GraphQLError("Tenant یافت نشد");
 return tenant;
 },
};

/* ============================================================
 Schema
 ============================================================ */

const QueryType = new GraphQLObjectType({
 name: "Query",
 fields: () => ({
 me: meField,
 tenant: tenantField,
 invoices: invoicesField,
 products: productsField,
 parties: partiesField,
 dashboardStats: dashboardStatsField,
 }),
});

const schema = new GraphQLSchema({
 query: QueryType,
});

/* ============================================================
 POST handler
 ============================================================ */

export async function POST(req: NextRequest) {
 try {
 // احراز هویت
 const authHeader = req.headers.get("authorization");
 const ctx: GraphQLContext = { user: null };
 if (authHeader?.startsWith("Bearer ")) {
 const payload = verifyToken(authHeader.substring(7));
 if (payload?.type === "user" && typeof payload.id === "string") {
 ctx.user = {
 id: payload.id,
 tenantId: (payload.tenantId as string)?? "",
 };
 // اگر tenantId در توکن نبود، از DB بگیر
 if (!ctx.user.tenantId) {
 const u = await db.user.findUnique({
 where: { id: ctx.user.id },
 select: { tenantId: true },
 });
 if (u) ctx.user.tenantId = u.tenantId;
 }
 }
 }

 // پارس بدنه
 const body = await req.json().catch(() => ({}));
 const query = typeof body?.query === "string"? body.query: null;
 const variables =
 body?.variables && typeof body.variables === "object"
? body.variables
: undefined;
 const operationName =
 typeof body?.operationName === "string"? body.operationName: undefined;

 if (!query) {
 return NextResponse.json(
 { errors: [{ message: "پارامتر query الزامی است" }] },
 { status: 400 }
 );
 }

 // اجرای GraphQL
 const result = await graphql({
 schema,
 source: query,
 variableValues: variables,
 operationName,
 contextValue: ctx,
 });

 // خروجی JSON استاندارد GraphQL
 return NextResponse.json(result, {
 status: result.errors? 200: 200,
 headers: {
 "Cache-Control": "no-store",
 },
 });
 } catch (error) {
 console.error("GraphQL error:", error);
 return NextResponse.json(
 {
 errors: [
 {
 message:
 error instanceof Error? error.message: "خطای داخلی GraphQL",
 },
 ],
 },
 { status: 500 }
 );
 }
}

// اطمینان از بارگذاری type‌های غیرضروری (جلوگیری از tree-shake زودهنگام)
void GraphQLNonNull;
