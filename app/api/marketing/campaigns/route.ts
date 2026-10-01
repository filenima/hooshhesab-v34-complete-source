/**
 * Campaign Management API — هوش
 * CRUD برای کمپین‌های بازاریابی
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cacheGetOrSet, cacheDeleteByPrefix, CACHE_TTL } from '@/lib/cache';
import { getAuthContext } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPAIGNS_CACHE_PREFIX = 'marketing:campaigns:';

// GET /api/marketing/campaigns — فهرست کمپین‌ها
// SECURITY (C1): احراز هویت اجباری + فیلتر tenant — قبلاً tenantId از query string
// گرفته می‌شد و اگر نبود، تمام کمپین‌های تمام tenantها برگردانده می‌شد.
export async function GET(request: NextRequest) {
 try {
 const ctx = await getAuthContext(request);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: 'احراز هویت الزامی است' },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const { searchParams } = new URL(request.url);
 const status = searchParams.get('status');
 const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

 const where: { status?: string; tenantId: string } = { tenantId };
 if (status) where.status = status;

 // کش کوتاه (۶۰ ثانیه) — لیست کمپین‌ها در طول روز تغییر می‌کند ولی
 // خواندن مکرر آن از دیتابیس برای ۱۰۰+ کاربر بی‌مورد است.
 const cacheKey = `${CAMPAIGNS_CACHE_PREFIX}${tenantId}:${status || 'all'}:${limit}`;
 const campaigns = await cacheGetOrSet(
 cacheKey,
 () =>
 db.campaign.findMany({
 where,
 orderBy: { createdAt: 'desc' },
 take: limit,
 }),
 CACHE_TTL.STANDARD
 );

 return NextResponse.json({
 campaigns: campaigns.map(c => ({
...c,
 triggerConfig: JSON.parse(c.triggerConfig),
 actionsJson: JSON.parse(c.actionsJson),
 goalsJson: JSON.parse(c.goalsJson),
 abTestJson: c.abTestJson? JSON.parse(c.abTestJson): null,
 budget: c.budget? Number(c.budget): null,
 spent: Number(c.spent),
 })),
 total: campaigns.length,
 });
 } catch (e) {
 return NextResponse.json({ error: 'db_error', message: (e as Error).message }, { status: 500 });
 }
}

// POST /api/marketing/campaigns — ایجاد کمپین جدید
// SECURITY (C1): tenantId از auth context گرفته می‌شود، نه از body — قبلاً هر
// کاربری می‌توانست با ارسال tenantId دلخواه، کمپین برای tenant دیگری بسازد.
export async function POST(request: NextRequest) {
 try {
 const ctx = await getAuthContext(request);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: 'احراز هویت الزامی است' },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const body = await request.json() as {
 name: string;
 description?: string;
 triggerType: string;
 triggerConfig?: Record<string, unknown>;
 actions?: unknown[];
 goals?: unknown[];
 abTest?: unknown;
 startAt?: string;
 endAt?: string;
 budget?: number;
 };

 if (!body.name ||!body.triggerType) {
 return NextResponse.json({ error: 'missing_required', message: 'name, triggerType الزامی هستند' }, { status: 400 });
 }

 const campaign = await db.campaign.create({
 data: {
 tenantId,
 name: body.name,
 description: body.description,
 status: 'draft',
 triggerType: body.triggerType,
 triggerConfig: JSON.stringify(body.triggerConfig || {}),
 actionsJson: JSON.stringify(body.actions || []),
 goalsJson: JSON.stringify(body.goals || []),
 abTestJson: body.abTest? JSON.stringify(body.abTest): null,
 startAt: body.startAt? new Date(body.startAt): null,
 endAt: body.endAt? new Date(body.endAt): null,
 budget: body.budget? BigInt(body.budget): null,
 },
 });
 // کش لیست کمپین‌ها را باطل کن
 cacheDeleteByPrefix(CAMPAIGNS_CACHE_PREFIX);
 return NextResponse.json(campaign, { status: 201 });
 } catch (e) {
 return NextResponse.json({ error: 'db_error', message: (e as Error).message }, { status: 500 });
 }
}
