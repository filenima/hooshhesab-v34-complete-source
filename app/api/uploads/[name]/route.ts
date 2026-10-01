import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { privateUploadsDir, mimeForExt, verifyUploadSignature } from "@/lib/secure-uploads";

export const runtime = "nodejs";

// GET /api/uploads/[name]?exp=...&sig=... — سرو فایل خصوصی با URL امضاشده
// FIX(SECURITY-H3): قبلاً فایل‌های حساس (رسیدها) در public/uploads بدون
// احراز هویت در دسترس بودند. حالا از پوشه خصوصی با امضای HMAC سرو می‌شوند.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const url = new URL(req.url);
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");

  // دفاع path traversal — نام فایل نباید مسیر داشته باشد
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
  const mime = mimeForExt(ext);
  if (!mime) return new NextResponse("Not found", { status: 404 });

  // اعتبارسنجی امضا + انقضا
  if (!verifyUploadSignature(name, exp, sig)) {
    return new NextResponse("Forbidden — لینک نامعتبر یا منقضی شده", {
      status: 403,
    });
  }

  const filePath = path.join(privateUploadsDir(), name);
  const resolvedRoot = path.resolve(privateUploadsDir());
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        // هیچ اسکریپتی اجرا نمی‌شود (SVG ممنوع است اما عملاً هم)
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
