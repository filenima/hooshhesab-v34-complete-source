import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  getAiProviderSettings,
  saveAiProviderSettings,
  testAiProvider,
  maskApiKey,
  type AiProviderSettings,
} from "@/lib/ai-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ مدیریت موتور هوش مصنوعی (پنل سوپرادمین) ============
// GET  — خواندن تنظیمات (کلید ماسک‌شده)
// POST — ذخیره تنظیمات
// PUT  — تست اتصال موتور

// GET /api/platform/ai/settings
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const settings = await getAiProviderSettings();
  return NextResponse.json({
    success: true,
    settings: {
      ...settings,
      // کلید واقعی هرگز به کلاینت برنمی‌گردد — فقط نسخه ماسک‌شده
      apiKey: maskApiKey(settings.apiKey),
      hasApiKey: !!settings.apiKey,
    },
  });
}

// POST /api/platform/ai/settings — ذخیره
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json().catch(() => null)) as
      | (Partial<AiProviderSettings> & { clearApiKey?: boolean })
      | null;
    if (!body) {
      return NextResponse.json(
        { success: false, error: "بدنه درخواست نامعتبر" },
        { status: 400 }
      );
    }

    // اگر کلید خالی ارسال شد یعنی کاربر همان قبلی را می‌خواهد — تغییرش نمی‌دهیم
    const patch: Partial<AiProviderSettings> = {};
    if (typeof body.provider === "string") {
      patch.provider = body.provider === "custom" ? "custom" : "zai";
    }
    if (typeof body.baseUrl === "string") patch.baseUrl = body.baseUrl.trim().slice(0, 300);
    if (typeof body.apiKey === "string" && body.apiKey.trim() !== "" && !body.apiKey.includes("•")) {
      patch.apiKey = body.apiKey.trim().slice(0, 300);
    }
    if (body.clearApiKey === true) patch.apiKey = "";
    if (typeof body.model === "string") patch.model = body.model.trim().slice(0, 100);
    if (typeof body.temperature === "number") patch.temperature = body.temperature;
    if (typeof body.maxTokens === "number") patch.maxTokens = Math.round(body.maxTokens);
    if (typeof body.knowledgeEnabled === "boolean") patch.knowledgeEnabled = body.knowledgeEnabled;
    if (typeof body.knowledgeMaxChars === "number") {
      patch.knowledgeMaxChars = Math.round(body.knowledgeMaxChars);
    }

    // اعتبارسنجی: provider=custom بدون baseUrl/apiKey نپذیر
    const next = await saveAiProviderSettings(patch);
    if (next.provider === "custom" && (!next.baseUrl || !next.apiKey)) {
      return NextResponse.json(
        {
          success: false,
          error: "برای سرویس سفارشی، آدرس پایه و کلید API الزامی است",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: {
        ...next,
        apiKey: maskApiKey(next.apiKey),
        hasApiKey: !!next.apiKey,
      },
      message: "تنظیمات موتور هوش مصنوعی ذخیره شد",
    });
  } catch (error) {
    console.error("[platform/ai/settings] POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره تنظیمات" },
      { status: 500 }
    );
  }
}

// PUT /api/platform/ai/settings — تست اتصال
export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  const result = await testAiProvider();
  return NextResponse.json({ success: true, test: result });
}
