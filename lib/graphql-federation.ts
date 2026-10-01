/**
 * graphql-federation.ts — GraphQL Federation برای هوش
 * ترکیب چندین subgraph به یک API یکپارچه با Apollo Federation
 */

interface SubgraphConfig {
 name: string;
 url: string;
 sdl: string; // schema definition language
 healthCheckUrl?: string;
}

interface EntityResolver {
 typeName: string;
 resolver: (representation: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
}

const subgraphs: Map<string, SubgraphConfig> = new Map();
const entityResolvers: Map<string, EntityResolver> = new Map();

export function registerSubgraph(config: SubgraphConfig) {
 subgraphs.set(config.name, config);
}

export function unregisterSubgraph(name: string) {
 subgraphs.delete(name);
}

export function registerEntityResolver(typeName: string, resolver: EntityResolver['resolver']) {
 entityResolvers.set(typeName, { typeName, resolver });
}

// ---------- Supergraph SDL تولید ----------
export function composeSupergraph(): string {
 const subgraphSDLs = Array.from(subgraphs.values()).map(s => `
# ================== ${s.name} ==================
extend type Query {
 _${s.name}Service: ${s.name.charAt(0).toUpperCase() + s.name.slice(1)}Service
}

type ${s.name.charAt(0).toUpperCase() + s.name.slice(1)}Service @join__graph(name: "${s.name}") {
 version: String
}

${s.sdl}
`).join('\n');

 return `# Supergraph schema برای هوش — تولید شده در ${new Date().toISOString()}
# شامل ${subgraphs.size} subgraph

schema {
 query: Query
 mutation: Mutation
}

scalar _Any
scalar _FieldSet
scalar _Service

type _Service {
 sdl: String
}

type Query {
 _entities(representations: [_Any!]!): [_Entity]!
 _service: _Service!
}

union _Entity = ${Array.from(entityResolvers.keys()).join(' | ') || 'Tenant | User | Invoice | Party'}

directive @join__graph(name: String!) on OBJECT
directive @key(fields: _FieldSet!) on OBJECT | INTERFACE
directive @extends on OBJECT | INTERFACE
directive @external on FIELD_DEFINITION | OBJECT

${subgraphSDLs}
`;
}

// ---------- Entity Resolution ----------
export async function resolveEntity(
 typeName: string,
 representation: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
 const resolver = entityResolvers.get(typeName);
 if (!resolver) return null;
 try {
 return await resolver.resolver(representation);
 } catch (e) {
 console.error(`[graphql-federation] entity resolution failed for ${typeName}:`, e);
 return null;
 }
}

export async function resolveEntities(
 representations: Array<{ __typename: string } & Record<string, unknown>>
): Promise<Array<Record<string, unknown> | null>> {
 return Promise.all(
 representations.map(rep => {
 const { __typename,...rest } = rep;
 return resolveEntity(__typename, rest);
 })
 );
}

// ---------- Query planner (ساده) ----------
export interface QueryPlanStep {
 type: 'Fetch' | 'Flatten' | 'Serialize';
 subgraphName?: string;
 operation?: string;
 path?: string[];
}

export function planQuery(query: string): QueryPlanStep[] {
 // در یک پیاده‌سازی واقعی، این یک query planner کامل مانند Apollo's است
 // اینجا یک نمونه‌ی ساده بر اساس نام فیلد برمی‌گردانیم
 const steps: QueryPlanStep[] = [];
 const matches = query.match(/\{(\w+)/g) || [];
 for (const m of matches) {
 const field = m.slice(1);
 // یافتن subgraph مالک این فیلد
 for (const [name, subgraph] of subgraphs) {
 if (subgraph.sdl.includes(field)) {
 steps.push({
 type: 'Fetch',
 subgraphName: name,
 operation: `{ ${field} }`,
 path: [field],
 });
 break;
 }
 }
 }
 steps.push({ type: 'Serialize' });
 return steps;
}

// ---------- اجرای query ----------
export async function executeQuery(
 query: string,
 variables: Record<string, unknown> = {},
 context: { tenantId?: string; userId?: string } = {}
): Promise<{ data?: unknown; errors?: Array<{ message: string }> }> {
 const plan = planQuery(query);
 const results: Record<string, unknown> = {};

 for (const step of plan) {
 if (step.type === 'Fetch' && step.subgraphName && step.operation) {
 const subgraph = subgraphs.get(step.subgraphName);
 if (!subgraph) {
 return { errors: [{ message: `Subgraph ${step.subgraphName} not found` }] };
 }
 try {
 const resp = await fetch(subgraph.url, {
 method: 'POST',
 headers: {
 'content-type': 'application/json',
 'x-tenant-id': context.tenantId || '',
 'x-user-id': context.userId || '',
 },
 body: JSON.stringify({ query: step.operation, variables }),
 });
 if (resp.ok) {
 const data = await resp.json() as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };
 if (data.errors) {
 return { errors: data.errors };
 }
 Object.assign(results, data.data);
 }
 } catch (e) {
 return { errors: [{ message: `Subgraph fetch failed: ${(e as Error).message}` }] };
 }
 }
 }

 return { data: results };
}

// ---------- مانیتورینگ ----------
export function getSubgraphHealth(): Promise<Array<{ name: string; healthy: boolean; sdl?: string }>> {
 return Promise.all(
 Array.from(subgraphs.values()).map(async (s) => {
 if (!s.healthCheckUrl) return { name: s.name, healthy: true };
 try {
 const resp = await fetch(s.healthCheckUrl, { signal: AbortSignal.timeout(2000) });
 return { name: s.name, healthy: resp.ok };
 } catch {
 return { name: s.name, healthy: false };
 }
 })
 );
}

export function getRegisteredSubgraphs(): SubgraphConfig[] {
 return Array.from(subgraphs.values());
}

// ---------- ثبت subgraphهای پیش‌فرض هوش ----------
export function registerDefaultSubgraphs() {
 registerSubgraph({
 name: 'accounting',
 url: 'http://localhost:3001/graphql',
 sdl: `
type Tenant @key(fields: "id") {
 id: ID!
 name: String!
 plan: String!
 status: String!
}

type Account @key(fields: "code") {
 code: String!
 name: String!
 type: String!
 balance: Int!
}

type JournalEntry {
 id: ID!
 date: String!
 description: String
 lines: [JournalLine!]!
}

type JournalLine {
 accountCode: String!
 debit: Int!
 credit: Int!
}

extend type Query {
 tenants: [Tenant!]!
 accounts: [Account!]!
 journalEntries(limit: Int = 50): [JournalEntry!]!
}
`,
 healthCheckUrl: 'http://localhost:3001/health',
 });

 registerSubgraph({
 name: 'invoices',
 url: 'http://localhost:3002/graphql',
 sdl: `
type Invoice @key(fields: "id") {
 id: ID!
 number: String!
 partyId: ID!
 date: String!
 totalAmount: Int!
 status: String!
 lineItems: [InvoiceLine!]!
}

type InvoiceLine {
 description: String!
 quantity: Float!
 unitPrice: Int!
 taxRate: Float
}

extend type Query {
 invoices(status: String, limit: Int = 50): [Invoice!]!
 invoice(id: ID!): Invoice
}

extend type Mutation {
 createInvoice(input: CreateInvoiceInput!): Invoice!
}

input CreateInvoiceInput {
 partyId: ID!
 date: String!
 lineItems: [InvoiceLineInput!]!
}

input InvoiceLineInput {
 description: String!
 quantity: Float!
 unitPrice: Int!
}
`,
 healthCheckUrl: 'http://localhost:3002/health',
 });

 registerSubgraph({
 name: 'parties',
 url: 'http://localhost:3003/graphql',
 sdl: `
type Party @key(fields: "id") {
 id: ID!
 name: String!
 nationalId: String
 type: String!
 phone: String
 email: String
 balance: Int!
 invoices: [Invoice!]! @external
}

extend type Invoice @key(fields: "id") {
 id: ID! @external
 party: Party
}

extend type Query {
 parties(type: String): [Party!]!
 party(id: ID!): Party
}
`,
 healthCheckUrl: 'http://localhost:3003/health',
 });

 // Entity resolvers
 registerEntityResolver('Invoice', async (rep) => {
 // در عمل: fetch از invoices subgraph
 return { id: rep.id, __typename: 'Invoice' };
 });
 registerEntityResolver('Party', async (rep) => {
 return { id: rep.id, __typename: 'Party' };
 });
 registerEntityResolver('Tenant', async (rep) => {
 return { id: rep.id, __typename: 'Tenant' };
 });
}
