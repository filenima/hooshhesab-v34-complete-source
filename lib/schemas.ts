import { z } from "zod";

// ============ Schemas اعتبارسنجی ============

export const createInvoiceSchema = z.object({
 type: z.enum(["SALE", "PURCHASE", "PRE_INVOICE", "RETURN"]).default("SALE"),
 partyId: z.string().min(1, "طرف‌حساب الزامی است"),
 date: z.string().optional(),
 dueDate: z.string().optional(),
 warehouseId: z.string().optional(),
 description: z.string().max(500).optional(),
 items: z
.array(
 z.object({
 productId: z.string().optional(),
 description: z.string().optional(),
 quantity: z.number().positive("تعداد باید مثبت باشد"),
 unitPrice: z.number().nonnegative("قیمت نمی‌تواند منفی باشد"),
 discount: z.number().min(0).max(100).default(0),
 taxRate: z.number().min(0).max(1).default(0.1), // FIX(3b-بیگ۶): پیش‌فرض ۱۰٪ — نرخ قانونی ۱۴۰۴,
 })
 )
.min(1, "حداقل یک قلم الزامی است"),
});

export const createPartySchema = z.object({
 code: z.string().min(1).max(20),
 name: z.string().min(1).max(100),
 type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]),
 nationalId: z.string().optional(),
 economicCode: z.string().optional(),
 phone: z.string().optional(),
 mobile: z.string().optional(),
 email: z.string().email("ایمیل نامعتبر").optional().or(z.literal("")),
 address: z.string().optional(),
 city: z.string().optional(),
 province: z.string().optional(),
 postalCode: z.string().optional(),
 creditLimit: z.number().nonnegative().default(0),
});

export const createProductSchema = z.object({
 // WH-1: SKU اختیاری شد — اگر خالی/نبود، سرور به‌صورت ترتیبی تولید می‌کند
 // (SKU-1001 style). کلاینت‌های قبلی که sku می‌فرستادند بی‌تغییر کار می‌کنند.
 sku: z.string().max(50).optional().nullable(),
 barcode: z.string().optional(),
 name: z.string().min(1).max(200),
 unit: z.string().min(1),
 type: z.enum(["GOODS", "SERVICE", "ASSEMBLY"]).default("GOODS"),
 purchasePrice: z.number().nonnegative().default(0),
 salePrice: z.number().nonnegative().default(0),
 wholesalePrice: z.number().nonnegative().default(0),
 minStock: z.number().nonnegative().default(0),
 maxStock: z.number().nonnegative().default(0),
 taxRate: z.number().min(0).max(1).default(0.1), // FIX(3b-بیگ۶): پیش‌فرض ۱۰٪ — نرخ قانونی ۱۴۰۴,
 description: z.string().optional(),
 // USD-PRICE: قیمت پایه دلاری هر کالا + پرچم همگام‌سازی با نرخ دلار (درخواست مالک)
 usdPrice: z.number().positive().optional().nullable(),
 usdSynced: z.boolean().optional(),
});

export const createWarehouseSchema = z.object({
 code: z.string().min(1).max(20),
 name: z.string().min(1).max(100),
 address: z.string().max(500).optional(),
 isActive: z.boolean().default(true),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const createJournalEntrySchema = z.object({
 date: z.string(),
 type: z.enum(["JOURNAL", "RECEIPT", "PAYMENT"]),
 description: z.string().min(1).max(500),
 lines: z
.array(
 z.object({
 accountId: z.string().min(1),
 subAccountId: z.string().optional(),
 debit: z.number().nonnegative().default(0),
 credit: z.number().nonnegative().default(0),
 description: z.string().optional(),
 })
 )
.min(2, "حداقل دو ردیف الزامی است"),
});

export const createEmployeeSchema = z.object({
 personnelCode: z.string().min(1),
 firstName: z.string().min(1),
 lastName: z.string().min(1),
 nationalId: z.string().length(10, "کد ملی باید ۱۰ رقم باشد"),
 contractType: z.enum(["PERMANENT", "PROBATION", "TEMPORARY"]),
 baseSalary: z.number().nonnegative(),
 department: z.string().optional(),
 position: z.string().optional(),
 hireDate: z.string(),
});

export const createCheckSchema = z.object({
 number: z.string().min(1),
 type: z.enum(["RECEIVED", "ISSUED"]),
 sayadId: z.string().optional(),
 amount: z.number().positive("مبلغ چک باید مثبت باشد"),
 issueDate: z.string(),
 dueDate: z.string(),
 bankName: z.string().min(1),
 branch: z.string().optional(),
 partyId: z.string().optional(),
 bankAccountId: z.string().optional(),
 description: z.string().optional(),
});

export const createReminderSchema = z.object({
 type: z.enum(["CHECK_DUE", "LOW_STOCK", "BIRTHDAY", "INVOICE_OVERDUE", "CUSTOM"]),
 title: z.string().min(1).max(200),
 message: z.string().min(1).max(500),
 dueDate: z.string(),
 priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
 entityId: z.string().optional(),
 entityType: z.string().optional(),
});

export const createWebhookSchema = z.object({
 event: z.string().min(1),
 url: z.string().url("URL نامعتبر"),
 secret: z.string().optional(),
 isActive: z.boolean().default(true),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
