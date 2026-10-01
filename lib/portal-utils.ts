import { createHash, randomBytes } from "crypto";

/**
 * تولید توکن امن برای پورتال مشتریان — ۳۲ بایت تصادفی (hex ۶۴ کاراکتر).
 */
export function generatePortalToken(): string {
 return randomBytes(32).toString("hex");
}

/**
 * هش توکن برای ذخیره در دیتابیس. توکن خام فقط یک‌بار به کاربر نشان داده می‌شود.
 */
export function hashToken(token: string): string {
 return createHash("sha256").update(token).digest("hex");
}

/**
 * تأیید اعتبار توکن خام با مقایسه هش آن.
 */
export function verifyToken(rawToken: string, tokenHash: string): boolean {
 return hashToken(rawToken) === tokenHash;
}

/**
 * FIX(v11): جستجوی مستقیم لینک پورتال با هش — قبلاً تا ۵۰۰ لینک «فعال» سراسری
 * اسکن و هش‌مقایسه می‌شد؛ با بیش از ۵۰۰ لینک، لینک‌های معتبر به‌طور خودکار ۴۰۴
 * می‌شدند و هر درخواست عمومی ۵۰۰ بار SHA-256 می‌زد.
 * tokenHash ایندکس unique است → findUnique امن و O(1).
 */
export async function findAccessByToken(
	rawToken: string
): Promise<{ id: string; tenantId: string; partyId: string; expiresAt: Date | null; isActive: boolean } | null> {
	const { db } = await import("@/lib/db");
	const access = await db.customerPortalAccess.findUnique({
		where: { tokenHash: hashToken(rawToken) },
		select: { id: true, tenantId: true, partyId: true, expiresAt: true, isActive: true },
	});
	return access;
}
