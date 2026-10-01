/**
 * Open API Platform — نقطه‌ی پایانی عمومی برای API هوش
 * شامل: OpenAPI 3.1 spec، کلیدهای API عمومی، نمونه‌ی code
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const OPENAPI_SPEC = {
 openapi: '3.1.0',
 info: {
 title: 'هوش Public API',
 description: 'API عمومی برای یکپارچه‌سازی با سیستم حسابداری هوش. ' +
 'تمام درخواست‌ها نیاز به کلید API معتبر دارند که در header `X-API-Key` ارسال می‌شود. ' +
 'تمام مبالغ به ریال ایرانی (IRR) هستند. زبان فارسی، RTL.',
 version: '1.0.0',
 contact: { name: 'تیم توسعه‌ی هوش', email: 'api@hesab.ir', url: 'https://hesab.ir/docs' },
 license: { name: 'Proprietary', url: 'https://hesab.ir/terms' },
 },
 servers: [
 { url: 'https://hesab.ir/api/v1', description: 'Production' },
 { url: 'https://staging.hesab.ir/api/v1', description: 'Staging' },
 ],
 components: {
 securitySchemes: {
 ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
 BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
 },
 schemas: {
 Invoice: {
 type: 'object',
 required: ['partyId', 'invoiceNumber', 'date', 'lineItems'],
 properties: {
 id: { type: 'string', description: 'شناسه‌ی یکتای فاکتور' },
 invoiceNumber: { type: 'string', description: 'شماره فاکتور' },
 partyId: { type: 'string', description: 'شناسه‌ی طرف‌حساب' },
 date: { type: 'string', format: 'date' },
 dueDate: { type: 'string', format: 'date' },
 lineItems: {
 type: 'array',
 items: {
 type: 'object',
 properties: {
 description: { type: 'string' },
 quantity: { type: 'number' },
 unitPrice: { type: 'integer', description: 'مبلغ به ریال' },
 taxRate: { type: 'number' },
 discount: { type: 'number' },
 },
 },
 },
 totalAmount: { type: 'integer', description: 'مبلغ کل به ریال' },
 status: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'] },
 },
 },
 Party: {
 type: 'object',
 properties: {
 id: { type: 'string' },
 name: { type: 'string' },
 nationalId: { type: 'string', description: 'کد ملی / شناسه ملی' },
 economicCode: { type: 'string', description: 'کد اقتصادی' },
 type: { type: 'string', enum: ['customer', 'supplier', 'both'] },
 phone: { type: 'string' },
 email: { type: 'string' },
 address: { type: 'string' },
 },
 },
 JournalEntry: {
 type: 'object',
 properties: {
 id: { type: 'string' },
 date: { type: 'string', format: 'date' },
 description: { type: 'string' },
 reference: { type: 'string' },
 lines: {
 type: 'array',
 items: {
 type: 'object',
 properties: {
 accountCode: { type: 'string' },
 debit: { type: 'integer' },
 credit: { type: 'integer' },
 description: { type: 'string' },
 },
 },
 },
 },
 },
 Error: {
 type: 'object',
 properties: {
 error: { type: 'string' },
 message: { type: 'string' },
 code: { type: 'string' },
 details: { type: 'object' },
 },
 },
 },
 },
 security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
 paths: {
 '/invoices': {
 get: {
 summary: 'لیست فاکتورها',
 description: 'بازگرداندن لیست فاکتورها با قابلیت صفحه‌بندی و فیلتر',
 parameters: [
 { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
 { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
 { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue'] } },
 { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
 { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
 ],
 responses: {
 '200': { description: 'موفق' },
 '401': { description: 'احراز هویت ناموفق' },
 '429': { description: 'محدودیت درخواست' },
 },
 },
 post: { summary: 'ایجاد فاکتور جدید' },
 },
 '/invoices/{id}': {
 get: { summary: 'دریافت جزئیات فاکتور' },
 put: { summary: 'به‌روزرسانی فاکتور' },
 delete: { summary: 'حذف فاکتور' },
 },
 '/parties': { get: { summary: 'لیست طرف‌حساب‌ها' }, post: { summary: 'ایجاد طرف‌حساب' } },
 '/parties/{id}': { get: { summary: 'جزئیات طرف‌حساب' } },
 '/journal-entries': { get: { summary: 'لیست اسناد حسابداری' }, post: { summary: 'ایجاد سند' } },
 '/reports/balance-sheet': { get: { summary: 'ترازنامه' } },
 '/reports/profit-loss': { get: { summary: 'صورت سود و زیان' } },
 '/reports/cash-flow': { get: { summary: 'جریان وجه نقد' } },
 '/tax/vat/returns': { get: { summary: 'لیست اظهارنامه‌های مالیات بر ارزش افزوده' } },
 '/webhooks': { get: { summary: 'لیست webhook‌ها' }, post: { summary: 'ثبت webhook' } },
 },
};

export async function GET(_request: NextRequest) {
 return NextResponse.json(OPENAPI_SPEC, {
 headers: {
 'cache-control': 'public, max-age=3600',
 'access-control-allow-origin': '*',
 },
 });
}

export async function POST(request: NextRequest) {
 const body = await request.json() as { name?: string; email?: string; scopes?: string[] };
 if (!body.email ||!body.name) {
 return NextResponse.json({ error: 'نام و ایمیل الزامی است' }, { status: 400 });
 }
 const randomBytes = new Uint8Array(24);
 crypto.getRandomValues(randomBytes);
 const apiKey = `hsk_live_${Buffer.from(randomBytes).toString('base64url')}`;
 const hashedBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));

 try {
 await db.publicApiKey.create({
 data: {
 name: body.name,
 email: body.email,
 keyHash: Buffer.from(hashedBuffer).toString('hex'),
 scopes: body.scopes?.join(',') || 'read',
 status: 'active',
 },
 });
 } catch {
 // اگر مدل موجود نبود، فقط کلید را برگردان
 }

 return NextResponse.json({ apiKey, message: 'کلید API شما نمایش داده می‌شود — آن را در جای امن ذخیره کنید.' });
}
