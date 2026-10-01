import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

// احراز سوپرادمین — از Authorization header توکن را می‌گیرد
export async function requireSuperAdmin(req: NextRequest) {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return {
 error: NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 ),
 };
 }

 const token = authHeader.substring(7);
 const payload = verifyToken(token);

 if (!payload || payload.type!== "superadmin") {
 return {
 error: NextResponse.json(
 { success: false, error: "توکن نامعتبر یا منقضی" },
 { status: 401 }
 ),
 };
 }

 const admin = await db.superAdmin.findUnique({
 where: { id: payload.id as string },
 });

 if (!admin ||!admin.isActive) {
 return {
 error: NextResponse.json(
 { success: false, error: "حساب غیرفعال" },
 { status: 403 }
 ),
 };
 }

 return { admin };
}

// helper برای tenant از توکن کاربر نهایی
export async function getUserFromToken(req: NextRequest) {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) return null;
 const token = authHeader.substring(7);
 const payload = verifyToken(token);
 if (!payload || payload.type!== "user") return null;
 return payload;
}
