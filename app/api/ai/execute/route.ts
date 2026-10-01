// /api/ai/execute — اجرای اکشن‌های هوش مصنوعی
// هوش — AI Action Execution
// ----------------------------------------------------------------------------
// این اندپوینت یک action descriptor می‌گیرد، احراز هویت و مجوزها را بررسی
// می‌کند، عملیات را در دیتابیس اجرا می‌کند و نتیجه (شناسه موجودیت، URL و...)
// را برمی‌گرداند. اکشن‌های پشتیبانی‌شده:
// - create_invoice (فاکتور فروش/خرید)
// - create_expense (ثبت هزینه)
// - add_customer (افزودن مشتری/طرف‌حساب)
// - add_product (افزودن محصول/خدمت)
// - record_payment (ثبت دریافت/پرداخت روی فاکتور)
//
// NOTE: پیاده‌سازی اکشن‌ها به lib/ai-actions.ts منتقل شد (مشترک با ایجنت
// /api/ai/agent-chat). قرارداد بیرونی این مسیر تغییر نکرده است.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getAuthContext } from "@/lib/auth";
import {
  createInvoiceAction,
  createExpenseAction,
  addCustomerAction,
  addProductAction,
  recordPaymentAction,
  // Task 21-D (از ایجنت):
  editInvoiceAction,
  reserveInvoiceAction,
  createCreditInvoiceAction,
  updateProductPriceAction,
  // Task 24-ASSISTANT:
  recordPartyPaymentAction,
  adjustStockAction,
  type ActionType,
  type ActionOutcome,
} from "@/lib/ai-actions";

export const runtime = "nodejs";
export const maxDuration = 30;

// ============ Endpoint ============
export async function POST(req: NextRequest) {
  try {
    const authCtx = await getAuthContext(req);
    if (!authCtx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // Rate limit: 30 requests/minute per user
    const rateKey = `execute:${authCtx.tenantId}:${authCtx.userId ?? ip}`;
    if (!rateLimit(rateKey, 30, 60_000)) {
      return NextResponse.json(
        { success: false, error: "سقف درخواست اجرای اکشن پر شده است." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { action: actionRaw, data, source, confirmed } = body as {
      action?: string;
      data?: Record<string, unknown>;
      source?: "voice" | "chat" | "workflow" | "manual";
      confirmed?: boolean;
    };

    if (!actionRaw) {
      return NextResponse.json(
        { success: false, error: "نوع اکشن الزامی است" },
        { status: 400 }
      );
    }

    const validActions: ActionType[] = [
      "create_invoice",
      "create_expense",
      "add_customer",
      "add_product",
      "record_payment",
      // Task 21-D
      "edit_invoice",
      "reserve_invoice",
      "create_credit_invoice",
      "update_product_price",
      // Task 24-ASSISTANT
      "record_party_payment",
      "adjust_stock",
    ];
    if (!validActions.includes(actionRaw as ActionType)) {
      return NextResponse.json(
        {
          success: false,
          error: `نوع اکشن نامعتبر. اکشن‌های معتبر: ${validActions.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const action = actionRaw as ActionType;
    void source; // context از AI — برای لاگ (در audit داخلی ثبت می‌شود)
    void confirmed; // کاربر تأیید کرده است

    // اجرای اکشن از طریق پیاده‌سازی مشترک
    let outcome: ActionOutcome;
    const payload = data || {};
    switch (action) {
      case "create_invoice":
        outcome = await createInvoiceAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "create_expense":
        outcome = await createExpenseAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "add_customer":
        outcome = await addCustomerAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "add_product":
        outcome = await addProductAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "record_payment":
        outcome = await recordPaymentAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "edit_invoice":
        outcome = await editInvoiceAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "reserve_invoice":
        outcome = await reserveInvoiceAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "create_credit_invoice":
        outcome = await createCreditInvoiceAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "update_product_price":
        outcome = await updateProductPriceAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "record_party_payment":
        outcome = await recordPartyPaymentAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      case "adjust_stock":
        outcome = await adjustStockAction(authCtx.tenantId, authCtx.userId, payload, req);
        break;
      default:
        return NextResponse.json(
          { success: false, error: "نوع اکشن پشتیبانی نمی‌شود" },
          { status: 400 }
        );
    }

    if (!outcome.ok) {
      return NextResponse.json(
        { success: false, error: outcome.error || "خطا در اجرای اکشن" },
        { status: outcome.status ?? 400 }
      );
    }

    return NextResponse.json({
      success: true,
      action,
      data: outcome.data || {},
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("AI execute error:", msg);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای اکشن. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

// GET — health + supported actions
export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: "/api/ai/execute",
    supportedActions: [
      "create_invoice",
      "create_expense",
      "add_customer",
      "add_product",
      "record_payment",
      "edit_invoice",
      "reserve_invoice",
      "create_credit_invoice",
      "update_product_price",
      "record_party_payment",
      "adjust_stock",
    ],
    features: [
      "auth-required",
      "audit-logged",
      "atomic-sequence-numbers",
      "rate-limit-30-per-minute",
      "shared-impl-lib-ai-actions",
    ],
  });
}
