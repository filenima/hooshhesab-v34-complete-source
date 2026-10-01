import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

const LOCK_DURATION_MS = 5 * 60 * 1000; // ۵ دقیقه

/**
 * GET /api/collaboration/lock?entityType=INVOICE&entityId=...
 * — بررسی وضعیت قفل یک سند
 * پاسخ: { locked: boolean, lockedBy?: { userId, name }, expiresAt?, lockedAt? }
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const { searchParams } = new URL(req.url);
 const entityType = (searchParams.get("entityType") || "").toUpperCase();
 const entityId = searchParams.get("entityId") || "";

 if (!entityType ||!entityId) {
 return NextResponse.json(
 { success: false, error: "entityType و entityId الزامی است" },
 { status: 400 }
 );
 }

 const lock = await db.documentLock.findUnique({
 where: { entityType_entityId: { entityType, entityId } },
 });

 if (!lock) {
 return NextResponse.json({
 success: true,
 data: { locked: false },
 });
 }

 // اگر قفل منقضی شده، آن را حذف کن و not locked برگردان
 if (lock.expiresAt < new Date()) {
 await db.documentLock.delete({ where: { id: lock.id } }).catch(() => {});
 return NextResponse.json({
 success: true,
 data: { locked: false, expired: true },
 });
 }

 // دریافت نام کاربر قفل‌کننده
 const lockUser = await db.user
.findUnique({
 where: { id: lock.userId },
 select: { id: true, name: true, email: true },
 })
.catch(() => null);

 return NextResponse.json({
 success: true,
 data: {
 locked: true,
 lockId: lock.id,
 lockedBy: {
 userId: lock.userId,
 name: lockUser?.name || "کاربر",
 email: lockUser?.email,
 },
 lockedAt: lock.lockedAt,
 expiresAt: lock.expiresAt,
 remainingMs: Math.max(0, lock.expiresAt.getTime() - Date.now()),
 },
 });
 } catch (error) {
 console.error("Document lock GET error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در بررسی وضعیت قفل" },
 { status: 500 }
 );
 }
}

/**
 * POST /api/collaboration/lock — قفل کردن سند
 * body: { entityType, entityId }
 * — قفل قبلی اگر منقضی شده باشد جایگزین می‌شود
 * — اگر قفل فعالی توسط کاربر دیگری وجود دارد، 409 برمی‌گرداند
 */
export async function POST(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const tenantId = payload.tenantId as string;
 const body = await req.json().catch(() => ({}));
 const entityType = String(body?.entityType || "").toUpperCase();
 const entityId = String(body?.entityId || "");

 if (!entityType ||!entityId) {
 return NextResponse.json(
 { success: false, error: "entityType و entityId الزامی است" },
 { status: 400 }
 );
 }

 // بررسی قفل فعلی
 const existing = await db.documentLock.findUnique({
 where: { entityType_entityId: { entityType, entityId } },
 });

 if (existing) {
 // اگر قفل متعلق به خود کاربر است، تمدید کن
 if (existing.userId === userId) {
 const updated = await db.documentLock.update({
 where: { id: existing.id },
 data: {
 lockedAt: new Date(),
 expiresAt: new Date(Date.now() + LOCK_DURATION_MS),
 },
 });
 return NextResponse.json({
 success: true,
 data: {
 lockId: updated.id,
 lockedBy: { userId, name: "شما" },
 lockedAt: updated.lockedAt,
 expiresAt: updated.expiresAt,
 renewed: true,
 },
 });
 }

 // اگر قفل منقضی شده، آن را حذف و قفل جدید بساز
 if (existing.expiresAt < new Date()) {
 await db.documentLock.delete({ where: { id: existing.id } });
 } else {
 // قفل توسط کاربر دیگری فعال است
 const lockUser = await db.user
.findUnique({
 where: { id: existing.userId },
 select: { name: true, email: true },
 })
.catch(() => null);
 return NextResponse.json(
 {
 success: false,
 error: "این سند توسط کاربر دیگری در حال ویرایش است",
 lockedBy: {
 userId: existing.userId,
 name: lockUser?.name || "کاربر",
 email: lockUser?.email,
 },
 expiresAt: existing.expiresAt,
 },
 { status: 409 }
 );
 }
 }

 // ایجاد قفل جدید
 const lock = await db.documentLock.create({
 data: {
 tenantId,
 entityType,
 entityId,
 userId,
 lockedAt: new Date(),
 expiresAt: new Date(Date.now() + LOCK_DURATION_MS),
 },
 });

 return NextResponse.json({
 success: true,
 data: {
 lockId: lock.id,
 lockedBy: { userId, name: "شما" },
 lockedAt: lock.lockedAt,
 expiresAt: lock.expiresAt,
 },
 });
 } catch (error) {
 console.error("Document lock POST error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در قفل کردن سند" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/collaboration/lock?entityType=INVOICE&entityId=...
 * — رها کردن قفل (فقط توسط صاحب قفل یا admin)
 */
export async function DELETE(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type!== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const role = payload.role as string;
 const { searchParams } = new URL(req.url);
 const entityType = (searchParams.get("entityType") || "").toUpperCase();
 const entityId = searchParams.get("entityId") || "";

 if (!entityType ||!entityId) {
 return NextResponse.json(
 { success: false, error: "entityType و entityId الزامی است" },
 { status: 400 }
 );
 }

 const lock = await db.documentLock.findUnique({
 where: { entityType_entityId: { entityType, entityId } },
 });

 if (!lock) {
 return NextResponse.json({
 success: true,
 message: "قفلی وجود نداشت",
 });
 }

 // فقط صاحب قفل یا ADMIN می‌تواند آن را رها کند
 if (lock.userId!== userId && role!== "ADMIN") {
 return NextResponse.json(
 { success: false, error: "شما مجاز به رها کردن این قفل نیستید" },
 { status: 403 }
 );
 }

 await db.documentLock.delete({ where: { id: lock.id } });

 return NextResponse.json({ success: true, message: "قفل رها شد" });
 } catch (error) {
 console.error("Document lock DELETE error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در رها کردن قفل" },
 { status: 500 }
 );
 }
}
