// ============ App Install API — هوش ============
// نصب یک اپ از marketplace برای tenant

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/marketplace/apps/install?appId=... (یا در body: { appId })
export async function POST(req: NextRequest) {
 try {
 if (!rateLimit("marketplace-install", 20, 60_000)) {
 return NextResponse.json({ error: "نرخ درخواست زیاد است" }, { status: 429 });
 }

 const tenant = await requireTenant(req);

 const url = new URL(req.url);
 let appId = url.searchParams.get("appId");

 if (!appId) {
 const body = await req.json().catch(() => ({}));
 appId = body.appId;
 }

 if (!appId) {
 return NextResponse.json({ error: "appId الزامی است" }, { status: 400 });
 }

 // بررسی نصب قبلی
 const existing = await db.auditLog.findFirst({
 where: {
 tenantId: tenant.id,
 action: "APP_INSTALLED",
 entityId: appId,
 },
 });

 if (existing) {
 return NextResponse.json({ error: "این اپ قبلاً نصب شده است" }, { status: 409 });
 }

 // ثبت نصب
 await db.auditLog.create({
 data: {
 tenantId: tenant.id,
 action: "APP_INSTALLED",
 entity: "MarketplaceApp",
 entityId: appId,
 changes: JSON.stringify({
 installedAt: new Date().toISOString(),
 status: "active",
 }),
 },
 });

 return NextResponse.json({
 success: true,
 appId,
 message: "اپ با موفقیت نصب شد",
 });
 } catch (err) {
 const message = err instanceof Error? err.message: String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}

// DELETE /api/marketplace/apps/install?appId=... — حذف نصب
export async function DELETE(req: NextRequest) {
 try {
 const tenant = await requireTenant(req);
 const url = new URL(req.url);
 const appId = url.searchParams.get("appId");

 if (!appId) {
 return NextResponse.json({ error: "appId الزامی است" }, { status: 400 });
 }

 // ثبت حذف
 await db.auditLog.create({
 data: {
 tenantId: tenant.id,
 action: "APP_UNINSTALLED",
 entity: "MarketplaceApp",
 entityId: appId,
 changes: JSON.stringify({ uninstalledAt: new Date().toISOString() }),
 },
 });

 return NextResponse.json({ success: true, message: "اپ حذف شد" });
 } catch (err) {
 const message = err instanceof Error? err.message: String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}
