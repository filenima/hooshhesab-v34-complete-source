import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 getGlobalAuditChain,
 AuditBlockchain,
 logAuditEvent,
 type AuditBlock,
} from "@/lib/blockchain-audit";
import { db } from "@/lib/db";

// ============ Blockchain Audit Trail API ============
// GET /api/platform/blockchain-audit — دریافت کل زنجیره یا آمار
// GET /api/platform/blockchain-audit?block=N — دریافت یک بلوک خاص
// GET /api/platform/blockchain-audit?export=1 — خروجی JSON برای تأیید خارجی
// GET /api/platform/blockchain-audit?search=X — جستجو در داده‌ی بلوک‌ها
// POST /api/platform/blockchain-audit — افزودن بلوک جدید (داخلی)
//
// SECURITY (FIX-HIGH-ISSUES): زنجیره‌ی audit سراسری (GLOBAL) است و شامل
// رویدادهای همه‌ی tenant ها می‌شود. دسترسی فقط محدود به سوپرادمین است.
// قبلاً از requireAuth سطح tenant استفاده می‌شد که به ADMIN های tenant اجازه
// می‌داد رویدادهای tenant های دیگر را بخوانند — اصلاح شد به requireSuperAdmin.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 const url = new URL(req.url);
 const blockIndex = url.searchParams.get("block");
 const exportFlag = url.searchParams.get("export");
 const searchQuery = url.searchParams.get("search");
 const statsOnly = url.searchParams.get("stats");
 const limit = parseInt(url.searchParams.get("limit") || "50", 10);

 const chain = getGlobalAuditChain();

 // آمار فقط
 if (statsOnly === "1") {
 return NextResponse.json({
 success: true,
 stats: chain.getStats(),
 });
 }

 // خروجی برای تأیید خارجی
 if (exportFlag === "1") {
 return NextResponse.json({
 success: true,
 export: chain.exportChain(),
 });
 }

 // دریافت یک بلوک خاص
 if (blockIndex!== null) {
 const idx = parseInt(blockIndex, 10);
 const block = chain.getBlock(idx);
 if (!block) {
 return NextResponse.json(
 { success: false, error: "بلوک یافت نشد" },
 { status: 404 }
 );
 }
 return NextResponse.json({ success: true, block });
 }

 // جستجو
 if (searchQuery) {
 const results = chain.search(searchQuery).slice(-limit);
 return NextResponse.json({
 success: true,
 results,
 count: results.length,
 });
 }

 // پیش‌فرض: آخرین بلوک‌ها
 const recent = chain.getRecentBlocks(limit);
 const stats = chain.getStats();

 return NextResponse.json({
 success: true,
 blocks: recent,
 stats,
 totalBlocks: chain.getLength(),
 });
}

export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const { action, entity, entityId, metadata, data } = body as {
 action?: string;
 entity?: string;
 entityId?: string;
 metadata?: unknown;
 data?: string;
 };

 let block: AuditBlock;

 if (data) {
 // افزودن داده‌ی raw
 block = getGlobalAuditChain().addBlock(data);
 } else if (action) {
 // افزودن رویداد ساختاریافته
 block = await logAuditEvent({
 action,
 entity,
 entityId,
 metadata,
 });
 } else {
 return NextResponse.json(
 { success: false, error: "action یا data الزامی است" },
 { status: 400 }
 );
 }

 // ثبت در PlatformAuditLog (لاگ سطح پلتفرم — دارای superAdminId)
 // AuditLog معمولی tenant-scoped است و سوپرادمین tenantId ندارد.
 await db.platformAuditLog
.create({
 data: {
 superAdminId: auth.admin.id,
 action: `BLOCKCHAIN_${action || "ADD_BLOCK"}`,
 entity: entity || "blockchain",
 entityId,
 details: JSON.stringify({
 blockIndex: block.index,
 blockHash: block.hash.slice(0, 16),
 }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 })
.catch(() => {
 // non-fatal
 });

 return NextResponse.json({
 success: true,
 block,
 chainStats: getGlobalAuditChain().getStats(),
 });
 } catch (error) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 return NextResponse.json(
 { success: false, error: msg },
 { status: 500 }
 );
 }
}
