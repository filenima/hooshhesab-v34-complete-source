import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import {
 generateApiKey,
 hashApiKey,
 getApiKeyPrefix,
 API_SCOPES,
} from "@/lib/api-key-auth";

export const runtime = "nodejs";

// GET /api/api-keys — لیست کلیدهای API tenant
export async function GET(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { tenantId } = auth.user;

 const keys = await db.apiKey.findMany({
 where: { tenantId },
 orderBy: { createdAt: "desc" },
 select: {
 id: true,
 name: true,
 keyPrefix: true,
 scopes: true,
 lastUsedAt: true,
 expiresAt: true,
 isActive: true,
 createdAt: true,
 createdBy: true,
 },
 });

 const formatted = keys.map((k) => ({
...k,
 scopes: safeParse(k.scopes, []),
 keyPrefix: `${k.keyPrefix.slice(0, 8)}****`,
 }));

 return NextResponse.json({ success: true, data: formatted });
}

// POST /api/api-keys — ایجاد کلید جدید
// FIX(H8): ساخت کلید فقط برای ADMIN — قبلاً هیچ چک نقشی نبود و کاربر USER/VIEWER
// می‌توانست کلید با scopeهای write بسازد و محدودیت نقش خود را دور بزند.
export async function POST(req: NextRequest) {
 const auth = await requireUser(req);
 if ("error" in auth) return auth.error;
 const { tenantId, userId, role } = auth.user;

 if (role!== "ADMIN") {
 return NextResponse.json(
 {
 success: false,
 error: "دسترسی غیرمجاز — فقط مدیر می‌تواند کلید API بسازد",
 },
 { status: 403 }
 );
 }

 const body = await req.json().catch(() => ({}));
 const name = (body.name as string)?.trim();
 const scopes: string[] = Array.isArray(body.scopes)? body.scopes: [];
 const expiresAt: string | null = body.expiresAt || null;

 if (!name || name.length < 2 || name.length > 100) {
 return NextResponse.json(
 {
 success: false,
 error: "نام کلید الزامی است (بین ۲ تا ۱۰۰ کاراکتر)",
 },
 { status: 400 }
 );
 }

 // FIX(H8): اعتبارسنجی اسکوپ‌ها در برابر whitelist — قبلاً scopeهای نامعتبر
 // فقط silent حذف می‌شدند؛ حالا کل درخواست رد می‌شود تا خطای کاربر واضح باشد
 const invalidScopes = scopes.filter(
 (s) =>!(API_SCOPES as readonly string[]).includes(s)
 );
 if (scopes.length > 0 && invalidScopes.length > 0) {
 return NextResponse.json(
 {
 success: false,
 error: `اسکوپ‌های نامعتبر: ${invalidScopes.join(", ")}`,
 },
 { status: 400 }
 );
 }
 const validScopes = scopes.filter((s) =>
 (API_SCOPES as readonly string[]).includes(s)
 );

 // تولید کلید واقعی
 const fullKey = generateApiKey();
 const keyHash = hashApiKey(fullKey);
 const keyPrefix = getApiKeyPrefix(fullKey);

 // FIX(L5): رشته خراب → Invalid Date → قبلاً از چک «گذشته بودن» رد می‌شد و
 // Prisma بعداً throw می‌کرد (500). حالا اعتبار تاریخ هم چک می‌شود.
 const expiresAtDate = expiresAt? new Date(expiresAt): null;
 if (expiresAtDate && (isNaN(expiresAtDate.getTime()) || expiresAtDate < new Date())) {
 return NextResponse.json(
 { success: false, error: "تاریخ انقضا نامعتبر است یا در گذشته است" },
 { status: 400 }
 );
 }

 const apiKey = await db.apiKey.create({
 data: {
 tenantId,
 name,
 keyPrefix,
 keyHash,
 scopes: JSON.stringify(validScopes),
 expiresAt: expiresAtDate,
 isActive: true,
 createdBy: userId,
 },
 });

 await db.auditLog.create({
 data: {
 tenantId,
 userId,
 action: "CREATE",
 entity: "ApiKey",
 entityId: apiKey.id,
 changes: JSON.stringify({ name, scopes: validScopes }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // کلید کامل فقط یک‌بار برگردانده می‌شود
 return NextResponse.json({
 success: true,
 data: {
 id: apiKey.id,
 name,
 keyPrefix,
 fullKey, // فقط این بار نمایش داده می‌شود
 scopes: validScopes,
 expiresAt: expiresAtDate,
 createdAt: apiKey.createdAt,
 },
 });
}

function safeParse<T>(value: string, fallback: T): T {
 try {
 return JSON.parse(value) as T;
 } catch {
 return fallback;
 }
}
