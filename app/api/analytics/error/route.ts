import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

// POST /api/analytics/error — ثبت خطای سمت کلاینت در ErrorLog
// بدون نیاز به احراز هویت اجباری (اگر توکن معتبر باشد userId ثبت می‌شود)
export async function POST(req: NextRequest) {
 try {
 const body = await req.json().catch(() => ({}));
 const {
 message,
 stack,
 url,
 method,
 statusCode,
 userAgent,
 context,
 } = body as {
 message?: string;
 stack?: string;
 url?: string;
 method?: string;
 statusCode?: number;
 userAgent?: string;
 context?: Record<string, unknown>;
 };

 if (!message || typeof message!== "string") {
 return NextResponse.json(
 { success: false, error: "پیام خطا الزامی است" },
 { status: 400 }
 );
 }

 // تلاش برای استخراج userId از توکن (در صورت وجود)
 let userId: string | null = null;
 let tenantId: string | null = null;
 const authHeader = req.headers.get("authorization");
 if (authHeader?.startsWith("Bearer ")) {
 const token = authHeader.substring(7);
 const payload = verifyToken(token);
 if (payload && payload.type === "user") {
 userId = (payload.id as string) || null;
 tenantId = (payload.tenantId as string) || null;
 }
 }

 await db.errorLog.create({
 data: {
 level: "ERROR",
 message: message.slice(0, 1000), // جلوگیری از پیام خیلی طولانی
 stack: stack? stack.slice(0, 4000): null,
 url: url? url.slice(0, 500): null,
 method: method || null,
 statusCode: typeof statusCode === "number"? statusCode: null,
 userId,
 tenantId,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 userAgent: userAgent || req.headers.get("user-agent") || null,
 metadata: context? JSON.stringify(context).slice(0, 4000): null,
 },
 });

 return NextResponse.json({ success: true });
 } catch (error) {
 console.error("Error logging failed:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ثبت خطا" },
 { status: 500 }
 );
 }
}
