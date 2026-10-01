// ============ Real-time Data Pipeline — هوش ============
// پایپ‌لاین بلادرنگ برای ETL و stream processing داده‌های مالی.
// این ماژول سرور-تنهاست و در API routes یا mini-services استفاده می‌شود.

import { db } from "@/lib/db";

// ============ Types ============

interface PipelineStage {
 name: string;
 fn: (data: any) => any;
}

interface PipelineSink {
 destination: string;
 data: any;
 timestamp: Date;
}

interface PipelineSource {
 source: string;
 data: any;
 timestamp: Date;
}

type PipelineStatus = "idle" | "running" | "completed" | "failed";

// ============ DataPipeline Class ============

export class DataPipeline {
 private sources: PipelineSource[] = [];
 private stages: PipelineStage[] = [];
 private sinks: PipelineSink[] = [];
 private status: PipelineStatus = "idle";
 private lastError: Error | null = null;
 private stats = {
 ingested: 0,
 transformed: 0,
 sinked: 0,
 durationMs: 0,
 };

 /**
 * اضافه کردن داده‌ی ورودی به پایپ‌لاین.
 * @param source نام منبع (مثلاً "invoices"، "bank-api")
 * @param data داده‌ی ورودی (هر شیء یا آرایه)
 */
 ingest(source: string, data: any): this {
 if (this.status === "running") {
 throw new Error("نمی‌توان در حین اجرای پایپ‌لاین داده جدید ingested کرد");
 }
 this.sources.push({ source, data, timestamp: new Date() });
 this.stats.ingested += Array.isArray(data)? data.length: 1;
 return this;
 }

 /**
 * اضافه کردن یک مرحله‌ی transform به پایپ‌لاین.
 * مراحل به ترتیب اضافه شدن اجرا می‌شوند.
 * @param stage نام مرحله (مثلاً "normalize-currency"، "aggregate-by-month")
 * @param fn تابع تبدیل — ورودی و خروجی هر
 */
 transform(stage: string, fn: (data: any) => any): this {
 if (this.status === "running") {
 throw new Error("نمی‌توان در حین اجرا stage جدید اضافه کرد");
 }
 this.stages.push({ name: stage, fn });
 return this;
 }

 /**
 * اضافه کردن یک مقصد برای نوشتن داده‌ی نهایی.
 * @param destination نام مقصد (مثلاً "fact_invoice"، "data-warehouse")
 * @param data داده‌ای که باید نوشته شود
 */
 async sink(destination: string, data: any): Promise<void> {
 this.sinks.push({ destination, data, timestamp: new Date() });
 this.stats.sinked += Array.isArray(data)? data.length: 1;
 // در implement واقعی، نوشتن به DB یا external API
 }

 /**
 * اجرای کامل پایپ‌لاین.
 * ترتیب: ingest transform stages (به ترتیب) sink
 */
 async run(): Promise<void> {
 if (this.status === "running") {
 throw new Error("پایپ‌لاین در حال اجراست");
 }

 const start = Date.now();
 this.status = "running";
 this.lastError = null;

 try {
 // ۱. merge همه‌ی منابع به یک جریان واحد
 let stream: any[] = [];
 for (const src of this.sources) {
 const items = Array.isArray(src.data)? src.data: [src.data];
 stream = stream.concat(items.map((item) => ({...item, __source: src.source })));
 }

 // ۲. اعمال stages به ترتیب
 for (const stage of this.stages) {
 const stageStart = Date.now();
 try {
 stream = stage.fn(stream);
 if (!Array.isArray(stream)) stream = [stream];
 this.stats.transformed += stream.length;
 console.log(
 `[pipeline] stage="${stage.name}" duration=${Date.now() - stageStart}ms count=${stream.length}`
 );
 } catch (err) {
 throw new Error(`خطا در stage "${stage.name}": ${err instanceof Error? err.message: String(err)}`);
 }
 }

 // ۳. نوشتن به همه‌ی sinkها
 for (const sink of this.sinks) {
 await this.writeToDestination(sink.destination, sink.data?? stream);
 }

 this.stats.durationMs = Date.now() - start;
 this.status = "completed";
 } catch (err) {
 this.lastError = err instanceof Error? err: new Error(String(err));
 this.status = "failed";
 throw err;
 }
 }

 /**
 * نوشتن داده به یک مقصد واقعی (DB، API، file).
 */
 private async writeToDestination(destination: string, data: any): Promise<void> {
 const items = Array.isArray(data)? data: [data];

 switch (destination) {
 case "fact_invoice":
 await db.factInvoice.createMany({
 data: items.slice(0, 1000).map((i: any) => ({
 tenantKey: String(i.tenantKey?? i.tenantId?? ""),
 partyKey: String(i.partyKey?? i.partyId?? ""),
 dateKey: String(i.dateKey?? new Date().toISOString().slice(0, 10)),
 invoiceId: String(i.invoiceId?? i.id?? ""),
 invoiceNumber: String(i.invoiceNumber?? ""),
 type: String(i.type?? "SALE"),
 status: String(i.status?? "DRAFT"),
 subtotal: BigInt(Number(i.subtotal?? 0)),
 tax: BigInt(Number(i.tax?? 0)),
 total: BigInt(Number(i.total?? i.amount?? 0)),
 itemCount: Number(i.itemCount?? 1),
 currency: String(i.currency?? "IRR"),
 })),
 // NOTE: SQLite در Prisma از skipDuplicates پشتیبانی نمی‌کند.
 });
 break;
 case "audit-log":
 await db.auditLog.createMany({
 data: items.slice(0, 500).map((i: any) => ({
 tenantId: String(i.tenantId?? "system"),
 action: String(i.action?? "PIPELINE_RECORD"),
 entity: String(i.entity?? "Pipeline"),
 entityId: String(i.id?? ""),
 changes: JSON.stringify(i),
 })),
 });
 break;
 default:
 // مقصد ناشناخته — فقط لاگ
 console.log(
 `[pipeline] sink="${destination}" — نوشته شد ${items.length} آیتم (شبیه‌سازی)`
 );
 }
 }

 // ============ Getters ============

 getStatus(): PipelineStatus {
 return this.status;
 }

 getStats() {
 return {...this.stats, status: this.status, sources: this.sources.length, stages: this.stages.length, sinks: this.sinks.length };
 }

 getLastError(): Error | null {
 return this.lastError;
 }

 /**
 * ریست پایپ‌لاین برای اجرای مجدد.
 */
 reset(): this {
 this.sources = [];
 this.stages = [];
 this.sinks = [];
 this.status = "idle";
 this.lastError = null;
 this.stats = { ingested: 0, transformed: 0, sinked: 0, durationMs: 0 };
 return this;
 }
}

// ============ Pre-built Pipelines ============

/**
 * پایپ‌لاین آماده برای پردازش فاکتورهای روزانه و نوشتن به FactInvoice.
 */
export async function runDailyInvoicePipeline(tenantId: string, date: Date): Promise<void> {
 const pipeline = new DataPipeline();

 // ingest: فاکتورهای امروز
 const invoices = await db.invoice.findMany({
 where: { tenantId, date: { gte: new Date(date.setHours(0, 0, 0, 0)) } },
 include: { items: true },
 take: 5000,
 });
 pipeline.ingest("invoices", invoices);

 // transform: نرمال‌سازی و تجمیع
 pipeline.transform("flatten-items", (data: any) => {
 return data.flatMap((inv: any) =>
 inv.items.map((item: any) => ({
 tenantId: inv.tenantId,
 invoiceId: inv.id,
 partyId: inv.partyId,
 dateId: Number(new Date(inv.date).getTime()),
 amount: Number(item.total?? 0),
 quantity: Number(item.quantity?? 1),
 }))
 );
 });

 pipeline.transform("aggregate-by-date", (data: any) => {
 const map = new Map<string, any>();
 for (const r of data) {
 const key = `${r.invoiceId}_${r.partyId}`;
 const existing = map.get(key)?? {...r, amount: 0, quantity: 0 };
 existing.amount += r.amount;
 existing.quantity += r.quantity;
 map.set(key, existing);
 }
 return Array.from(map.values());
 });

 // sink: نوشتن به fact_invoice
 await pipeline.sink("fact_invoice", null);
 await pipeline.run();

 console.log(`[pipeline] daily-invoice tenant=${tenantId} stats=`, pipeline.getStats());
}
