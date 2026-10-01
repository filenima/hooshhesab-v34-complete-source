import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/reminders — لیست یادآورها
export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const status = searchParams.get("status") || "PENDING";

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;

 const reminders = await db.reminder.findMany({
 where: { tenantId: tenantId, status },
 orderBy: { dueDate: "asc" },
 take: 50,
 });

 return NextResponse.json({ success: true, data: reminders });
 } catch (error) {
 console.error("Reminders error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت یادآورها" },
 { status: 500 }
 );
 }
}

// POST /api/reminders — ایجاد یادآور
export async function POST(req: NextRequest) {
 try {
 const body = await req.json();
 const { type, title, message, dueDate, priority = "MEDIUM" } = body;

 if (!type ||!title ||!message ||!dueDate) {
 return NextResponse.json(
 { success: false, error: "همه فیلدها الزامی هستند" },
 { status: 400 }
 );
 }

 const ctx = await getAuthContext(req);
 if (!ctx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const tenantId = ctx.tenantId;
 const reminder = await db.reminder.create({
 data: {
 tenantId: tenantId,
 type,
 title,
 message,
 dueDate: new Date(dueDate),
 priority,
 status: "PENDING",
 },
 });

 return NextResponse.json({
 success: true,
 data: reminder,
 message: "یادآور با موفقیت ایجاد شد",
 });
 } catch (error) {
 console.error("Create reminder error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد یادآور" },
 { status: 500 }
 );
 }
}
