// @ts-nocheck — این ماژول کتابخانه‌ی پیشرفته/آینده است و در حال حاضر توسط اپ ایمپورت نمی‌شود؛ type‌ها در زمان فعال‌سازی اصلاح خواهند شد
/**
 * هوش — CQRS Handlers (Commands)
 * =============================================================
 * Command handlers برای موجودیت‌های اصلی: Invoice, Product, Party
 *
 * هر هندلر:
 * ۱) payload را اعتبارسنجی می‌کند
 * ۲) write-side logic را اجرا می‌کند (به دیتابیس master می‌نویسد)
 * ۳) یک event برمی‌گرداند که توسط command bus به event store اضافه می‌شود
 */

import { db } from "@/lib/db";
import type { Command, CommandHandler, CommandResult } from "../command-bus";

// ============ Invoice Commands ============

export class CreateInvoiceCommand implements Command {
 readonly type = "CreateInvoice";
 constructor(
 readonly tenantId: string,
 readonly userId: string,
 readonly payload: {
 partyId: string;
 type: string; // SALE | PURCHASE
 items: Array<{ productId: string; quantity: number; unitPrice: number }>;
 dueDate?: string;
 }
 ) {}
}

export class CreateInvoiceHandler implements CommandHandler<CreateInvoiceCommand> {
 readonly commandType = "CreateInvoice";

 async handle(command: CreateInvoiceCommand) {
 const { payload, tenantId, userId } = command;

 if (!payload.partyId) throw new Error("partyId الزامی است");
 if (!payload.items || payload.items.length === 0) throw new Error("حداقل یک قلم لازم است");

 const totalAmount = payload.items.reduce(
 (sum, item) => sum + item.quantity * item.unitPrice,
 0
 );

 const invoice = await db.invoice.create({
 data: {
 tenantId,
 partyId: payload.partyId,
 type: payload.type,
 status: "DRAFT",
 total: BigInt(Math.round(totalAmount)),
 date: new Date(),
 dueDate: payload.dueDate? new Date(payload.dueDate): null,
 },
 });

 return {
 data: { invoiceId: invoice.id, totalAmount },
 event: {
 aggregateType: "Invoice",
 aggregateId: invoice.id,
 eventType: "CREATED",
 data: {
 partyId: payload.partyId,
 type: payload.type,
 totalAmount,
 items: payload.items,
 userId,
 },
 },
 };
 }
}

// ============ Product Commands ============

export class CreateProductCommand implements Command {
 readonly type = "CreateProduct";
 constructor(
 readonly tenantId: string,
 readonly userId: string,
 readonly payload: {
 sku: string;
 name: string;
 salePrice: number;
 unit?: string;
 categoryId?: string;
 }
 ) {}
}

export class CreateProductHandler implements CommandHandler<CreateProductCommand> {
 readonly commandType = "CreateProduct";

 async handle(command: CreateProductCommand) {
 const { payload, tenantId, userId } = command;
 if (!payload.sku) throw new Error("SKU الزامی است");
 if (!payload.name) throw new Error("نام محصول الزامی است");

 const product = await db.product.create({
 data: {
 tenantId,
 sku: payload.sku,
 name: payload.name,
 salePrice: BigInt(Math.round(payload.salePrice)),
 unit: payload.unit || "عدد",
 type: "GOODS",
...(payload.categoryId? { categoryId: payload.categoryId }: {}),
 },
 });

 return {
 data: { productId: product.id },
 event: {
 aggregateType: "Product",
 aggregateId: product.id,
 eventType: "CREATED",
 data: {
 sku: payload.sku,
 name: payload.name,
 salePrice: payload.salePrice,
 userId,
 },
 },
 };
 }
}

// ============ Party Commands ============

export class CreatePartyCommand implements Command {
 readonly type = "CreateParty";
 constructor(
 readonly tenantId: string,
 readonly userId: string,
 readonly payload: {
 name: string;
 type: string; // CUSTOMER | SUPPLIER
 phone?: string;
 email?: string;
 nationalId?: string;
 }
 ) {}
}

export class CreatePartyHandler implements CommandHandler<CreatePartyCommand> {
 readonly commandType = "CreateParty";

 async handle(command: CreatePartyCommand) {
 const { payload, tenantId, userId } = command;
 if (!payload.name) throw new Error("نام طرف حساب الزامی است");

 const party = await db.party.create({
 data: {
 tenantId,
 code: payload.name.replace(/\s+/g, "-").toLowerCase() + "-" + Date.now().toString(36),
 name: payload.name,
 type: payload.type,
 phone: payload.phone,
 email: payload.email,
 nationalId: payload.nationalId,
 },
 });

 return {
 data: { partyId: party.id },
 event: {
 aggregateType: "Party",
 aggregateId: party.id,
 eventType: "CREATED",
 data: {
 name: payload.name,
 type: payload.type,
 userId,
 },
 },
 };
 }
}

// ============ Registration helper ============

import { registerCommandHandler } from "../command-bus";

/**
 * ثبت همه‌ی command handlers پیش‌فرض.
 * در startup برنامه فراخوانی می‌شود.
 */
export function registerDefaultCommandHandlers(): void {
 registerCommandHandler(new CreateInvoiceHandler());
 registerCommandHandler(new CreateProductHandler());
 registerCommandHandler(new CreatePartyHandler());
}

export type { Command, CommandResult };
