import { NextResponse } from "next/server";

export const runtime = "nodejs";

// کرون جاب به‌طور کامل غیرفعال است (به درخواست کاربر).
// این endpoint دیگر کار نمی‌کند و همیشه 410 Gone برمی‌گرداند.
export async function GET() {
 return NextResponse.json(
 { error: "Cron jobs are disabled.", disabled: true },
 { status: 410 }
 );
}

export async function POST() {
 return NextResponse.json(
 { error: "Cron jobs are disabled.", disabled: true },
 { status: 410 }
 );
}
