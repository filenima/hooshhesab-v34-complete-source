import { NextResponse } from "next/server";
import { v1Headers, API_V1_VERSION, V1_ENDPOINT_MAP } from "../_shared";

export const runtime = "nodejs";

// GET /api/v1/docs — OpenAPI-style spec for v1 API
// این یک OpenAPI 3.0 ساده (JSON) است که همه‌ی endpoint های v1 را فهرست می‌کند.
// ابزارهای Swagger UI / Redoc می‌توانند این را مصرف کنند.
export async function GET() {
 const spec = {
 openapi: "3.0.3",
 info: {
 title: "هوش API v1",
 version: API_V1_VERSION,
 description:
 "API نسخه‌ی ۱ نرم‌افزار حسابداری هوش. این نسخه پایدار است و endpoint های قدیمی (مثل /api/products) به نسخه‌ی v1 منتقل می‌شوند. Endpoint های قدیمی تا تاریخ Sunset پشتیبانی می‌شوند ولی deprecated هستند.",
 contact: {
 name: "هوش Support",
 email: "support@hoosh.nobatime.ir",
 },
 },
 servers: [
 { url: "/api/v1", description: "Current deployment" },
 ],
 tags: [
 { name: "invoices", description: "مدیریت فاکتورها" },
 { name: "products", description: "مدیریت کالاها" },
 { name: "parties", description: "مدیریت طرف‌حساب‌ها" },
 ],
 paths: {
 "/invoices": {
 get: {
 tags: ["invoices"],
 summary: "فهرست فاکتورها",
 parameters: [
 { name: "type", in: "query", schema: { type: "string", enum: ["SALE", "PURCHASE", "RETURN"] } },
 { name: "status", in: "query", schema: { type: "string", enum: ["DRAFT", "SENT", "PAID", "CANCELLED"] } },
 { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
 ],
 responses: {
 "200": {
 description: "فهرست فاکتورها",
 content: { "application/json": {} },
 },
 },
 },
 },
 "/products": {
 get: {
 tags: ["products"],
 summary: "فهرست کالاها",
 parameters: [
 { name: "search", in: "query", schema: { type: "string" } },
 { name: "category", in: "query", schema: { type: "string" } },
 { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
 ],
 responses: {
 "200": { description: "فهرست کالاها" },
 },
 },
 },
 "/parties": {
 get: {
 tags: ["parties"],
 summary: "فهرست طرف‌حساب‌ها",
 parameters: [
 { name: "type", in: "query", schema: { type: "string", enum: ["CUSTOMER", "SUPPLIER", "EMPLOYEE", "OTHER"] } },
 { name: "search", in: "query", schema: { type: "string" } },
 { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
 ],
 responses: {
 "200": { description: "فهرست طرف‌حساب‌ها" },
 },
 },
 },
 },
 components: {
 securitySchemes: {
 bearerAuth: {
 type: "http",
 scheme: "bearer",
 bearerFormat: "JWT",
 },
 },
 },
 security: [{ bearerAuth: [] }],
 "x-deprecated-endpoints": V1_ENDPOINT_MAP,
 "x-sunset-date": "2025-12-31",
 };

 return NextResponse.json(spec, { headers: v1Headers() });
}
