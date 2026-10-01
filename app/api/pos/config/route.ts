import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { cacheDeleteByPrefix } from "@/lib/cache";
import {
  DEFAULT_POS_TERMINAL_CONFIG,
  sanitizePosTerminalConfig,
  type PosTerminalConfig,
} from "@/lib/pos-terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Task 21-B — تنظیمات اتصال کارتخوان (POS)
 *
 * GET  /api/pos/config  → { enabled, bridgeUrl, terminalId, timeoutMs }
 * PUT  /api/pos/config  → ذخیره (body: همان JSON بالا)
 *
 * ذخیره‌سازی: الگوی lib/system-settings.ts — جدول SystemSettings با کلید
 * `pos_terminal_config:{tenantId}` (JSON رشته‌ای) + باطل‌سازی کش با پیشوند
 * system_settings:. کلید per-tenant است تا تنظیمات کارتخوان دو کسب‌وکار روی
 * یک استقرار روی هم نیفتد. احراز هویت کاربر (JWT) اجباری است.
 */

function configKey(tenantId: string): string {
  return `pos_terminal_config:${tenantId}`;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت لازم است" },
        { status: 401 }
      );
    }
    const row = await db.systemSettings.findUnique({
      where: { key: configKey(ctx.tenantId) },
    });
    let config = DEFAULT_POS_TERMINAL_CONFIG;
    if (row?.value) {
      try {
        config = sanitizePosTerminalConfig(JSON.parse(row.value));
      } catch {
        // JSON خراب — پیش‌فرض برمی‌گردد
      }
    }
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("[GET /api/pos/config]", msg);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت تنظیمات کارتخوان" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت لازم است" },
        { status: 401 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const config: PosTerminalConfig = sanitizePosTerminalConfig(
      (body ?? {}) as Record<string, unknown>
    );
    const json = JSON.stringify(config);
    await db.systemSettings.upsert({
      where: { key: configKey(ctx.tenantId) },
      update: { value: json },
      create: { key: configKey(ctx.tenantId), value: json },
    });
    // باطل‌سازی کش تنظیمات (همان الگوی lib/system-settings.ts)
    cacheDeleteByPrefix("system_settings:");
    return NextResponse.json({
      success: true,
      data: config,
      message: "تنظیمات کارتخوان ذخیره شد",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("[PUT /api/pos/config]", msg);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره تنظیمات کارتخوان" },
      { status: 500 }
    );
  }
}
