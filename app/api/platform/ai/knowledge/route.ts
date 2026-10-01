import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============ دانش‌نامه‌ی دستیار هوش مصنوعی (سوپرادمین) ============
// GET    — لیست اسناد
// POST   — افزودن سند (JSON: text | url) یا (multipart/form-data: file)
// PATCH  — فعال/غیرفعال‌کردن سند
// DELETE — حذف سند

const MAX_CONTENT_CHARS = 400_000; // ~۴۰۰ هزار کاراکتر متن به‌ازای هر سند
const MAX_FILE_SIZE = 10 * 1024 * 1024; // ۱۰MB
const MAX_DOCS = 200;

// ---------- ابزارها ----------

/** حذف تگ‌های HTML و استخراج متن خوانا از صفحه‌ی وب */
function htmlToText(html: string): string {
  return html
    // حذف script/style/noscript/svg/comment
    .replace(/<(script|style|noscript|svg|head|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // بلوک‌های رایج متن
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // حذف همه‌ی تگ‌های باقی‌مانده
    .replace(/<[^>]+>/g, " ")
    // انتیتی‌های HTML
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    // فشرده‌سازی فضای خالی
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** استخراج متن از PDF با pdf-parse (dynamic import — فقط سمت سرور) */
async function pdfToText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default as (
    b: Buffer
  ) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return (result.text || "").trim();
}

// ---------- GET: لیست اسناد ----------
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const docs = await db.aiKnowledgeDoc.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      sourceType: true,
      sourceUrl: true,
      fileName: true,
      mimeType: true,
      charCount: true,
      status: true,
      useCount: true,
      lastUsedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    docs,
    total: docs.length,
    totalChars: docs.reduce((s, d) => s + d.charCount, 0),
  });
}

// ---------- POST: افزودن سند ----------
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const contentType = req.headers.get("content-type") || "";

    // ===== مسیر ۱: آپلود فایل (multipart/form-data) =====
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      const title = String(form.get("title") || "").trim();

      if (!file || typeof file === "string") {
        return NextResponse.json(
          { success: false, error: "فایلی ارسال نشده است" },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: "حجم فایل بیش از حد مجاز است (حداکثر ۱۰ مگابایت)" },
          { status: 400 }
        );
      }

      const name = file.name || "document";
      const mime = file.type || "";
      const buffer = Buffer.from(await file.arrayBuffer());

      let text = "";
      const isPdf =
        mime.includes("pdf") || name.toLowerCase().endsWith(".pdf");
      const isTxt =
        mime.startsWith("text/") ||
        /\.(txt|csv|md|json|html?)$/i.test(name);

      if (isPdf) {
        try {
          text = await pdfToText(buffer);
        } catch (e) {
          console.error("[ai/knowledge] pdf-parse error:", e);
          return NextResponse.json(
            {
              success: false,
              error: "استخراج متن از این PDF ممکن نشد — فایل ممکن است اسکن/تصویری باشد یا خراب باشد",
            },
            { status: 422 }
          );
        }
      } else if (isTxt) {
        text = buffer.toString("utf-8");
        // اگر HTML بود تگ‌ها را پاک کن
        if (/\.html?$/i.test(name) || mime.includes("html")) {
          text = htmlToText(text);
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "فرمت فایل پشتیبانی نمی‌شود — PDF، TXT، CSV، MD و JSON مجاز است",
          },
          { status: 415 }
        );
      }

      text = text.trim();
      if (text.length < 10) {
        return NextResponse.json(
          { success: false, error: "متنی از این فایل استخراج نشد (فایل خالی یا تصویری است)" },
          { status: 422 }
        );
      }
      if (text.length > MAX_CONTENT_CHARS) text = text.slice(0, MAX_CONTENT_CHARS);

      const count = await db.aiKnowledgeDoc.count();
      if (count >= MAX_DOCS) {
        return NextResponse.json(
          { success: false, error: `سقف اسناد دانش‌نامه پر است (حداکثر ${MAX_DOCS} سند)` },
          { status: 400 }
        );
      }

      const doc = await db.aiKnowledgeDoc.create({
        data: {
          title: (title || name).slice(0, 150),
          sourceType: "file",
          fileName: name.slice(0, 200),
          mimeType: mime.slice(0, 100),
          content: text,
          charCount: text.length,
        },
      });

      return NextResponse.json({
        success: true,
        doc: { ...doc, content: undefined },
        message: `سند «${doc.title}» با ${doc.charCount.toLocaleString("fa-IR")} کاراکتر به دانش‌نامه اضافه شد`,
      });
    }

    // ===== مسیر ۲: JSON (متن خام یا آدرس سایت) =====
    const body = (await req.json().catch(() => null)) as {
      sourceType?: string;
      title?: string;
      content?: string;
      url?: string;
    } | null;

    if (!body?.sourceType) {
      return NextResponse.json(
        { success: false, error: "نوع سند (sourceType) الزامی است" },
        { status: 400 }
      );
    }

    const count = await db.aiKnowledgeDoc.count();
    if (count >= MAX_DOCS) {
      return NextResponse.json(
        { success: false, error: `سقف اسناد دانش‌نامه پر است (حداکثر ${MAX_DOCS} سند)` },
        { status: 400 }
      );
    }

    // --- سند متنی ---
    if (body.sourceType === "text") {
      const content = (body.content || "").trim();
      if (content.length < 10) {
        return NextResponse.json(
          { success: false, error: "متن سند خیلی کوتاه است (حداقل ۱۰ کاراکتر)" },
          { status: 400 }
        );
      }
      const safeContent = content.slice(0, MAX_CONTENT_CHARS);
      const doc = await db.aiKnowledgeDoc.create({
        data: {
          title: (body.title?.trim() || "سند متنی").slice(0, 150),
          sourceType: "text",
          content: safeContent,
          charCount: safeContent.length,
        },
      });
      return NextResponse.json({
        success: true,
        doc: { ...doc, content: undefined },
        message: `سند «${doc.title}» به دانش‌نامه اضافه شد`,
      });
    }

    // --- سند از آدرس سایت ---
    if (body.sourceType === "url") {
      const rawUrl = (body.url || "").trim();
      // http/https الزامی + دامنه معتبر یا localhost (برای تست محلی)
      if (
        !/^https?:\/\/.+\..+/i.test(rawUrl) &&
        !/^https?:\/\/localhost(:\d+)?(\/|$)/i.test(rawUrl)
      ) {
        return NextResponse.json(
          { success: false, error: "آدرس URL معتبر نیست (باید با http/https شروع شود)" },
          { status: 400 }
        );
      }

      let html = "";
      try {
        const res = await fetch(rawUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HooshBot/1.0",
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(20_000),
          redirect: "follow",
        });
        if (!res.ok) {
          return NextResponse.json(
            { success: false, error: `دریافت صفحه ناموفق بود (HTTP ${res.status})` },
            { status: 422 }
          );
        }
        html = await res.text();
      } catch {
        return NextResponse.json(
          { success: false, error: "خطا در دریافت صفحه — آدرس را بررسی کنید" },
          { status: 422 }
        );
      }

      const text = htmlToText(html).slice(0, MAX_CONTENT_CHARS);
      if (text.length < 30) {
        return NextResponse.json(
          { success: false, error: "متن قابل استفادهای از این صفحه استخراج نشد" },
          { status: 422 }
        );
      }

      const doc = await db.aiKnowledgeDoc.create({
        data: {
          title: (body.title?.trim() || rawUrl).slice(0, 150),
          sourceType: "url",
          sourceUrl: rawUrl.slice(0, 500),
          content: text,
          charCount: text.length,
        },
      });
      return NextResponse.json({
        success: true,
        doc: { ...doc, content: undefined },
        message: `صفحه «${doc.title}» با ${doc.charCount.toLocaleString("fa-IR")} کاراکتر به دانش‌نامه اضافه شد`,
      });
    }

    return NextResponse.json(
      { success: false, error: "نوع سند نامعتبر است (text | url | file)" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[platform/ai/knowledge] POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در افزودن سند به دانش‌نامه" },
      { status: 500 }
    );
  }
}

// ---------- PATCH: فعال/غیرفعال ----------
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    status?: string;
  } | null;

  if (!body?.id || !body.status || !["ACTIVE", "INACTIVE"].includes(body.status)) {
    return NextResponse.json(
      { success: false, error: "شناسه سند و وضعیت معتبر الزامی است" },
      { status: 400 }
    );
  }

  const doc = await db.aiKnowledgeDoc.update({
    where: { id: body.id },
    data: { status: body.status },
  }).catch(() => null);

  if (!doc) {
    return NextResponse.json(
      { success: false, error: "سند یافت نشد" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: body.status === "ACTIVE" ? "سند فعال شد" : "سند غیرفعال شد",
  });
}

// ---------- DELETE: حذف ----------
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { success: false, error: "شناسه سند الزامی است" },
      { status: 400 }
    );
  }

  const doc = await db.aiKnowledgeDoc
    .delete({ where: { id } })
    .catch(() => null);

  if (!doc) {
    return NextResponse.json(
      { success: false, error: "سند یافت نشد" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, message: "سند حذف شد" });
}
