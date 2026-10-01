import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
 png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
 webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
 const { name } = await params;

 // FIX(B19): دفاع در برابر path traversal — نام فایل نباید مسیر داشته باشد.
 // قبلاً ..%2f..%2f اجازه خواندن فایل‌های مجاز-extension در کل دیسک را می‌داد.
 if (
 !name ||
 name.includes("/") ||
 name.includes("\\") ||
 name.includes("..") ||
 name.includes("\0") ||
 name !== name.trim()
 ) {
 return new NextResponse("Not found", { status: 404 });
 }

 const ext = name.split(".").pop()?.toLowerCase() || "";
 if (!MIME[ext]) return new NextResponse("Not found", { status: 404 });

 const filePath = path.join(process.cwd(), "public", "uploads", name);
 // اطمینان نهایی: مسیر حل‌شده باید داخل پوشه uploads باشد
 const resolvedRoot = path.resolve(process.cwd(), "public", "uploads");
 const resolvedFile = path.resolve(filePath);
 if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
 return new NextResponse("Not found", { status: 404 });
 }

 try {
 const data = await readFile(filePath);
 return new NextResponse(data, {
 headers: {
 "Content-Type": MIME[ext],
 // SVG می‌تواند حاوی اسکریپت باشد — اجرای آن در origin سایت خطرناک است
 ...(ext === "svg"? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" }: {}),
 "Cache-Control": "public, max-age=604800, immutable",
 },
 });
 } catch {
 return new NextResponse("Not found", { status: 404 });
 }
}
