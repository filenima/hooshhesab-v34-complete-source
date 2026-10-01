import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { toPersianDigits } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Task 6-a — چیدمان سایدبار پنل کاربر (سوپرادمین) ============
// GET   /api/platform/sidebar-config           → کانفیگ ذخیره‌شده scope="user-panel"
//                                                 (در صورت نبود، ردیف پیش‌فرض ساخته می‌شود)
// PUT   /api/platform/sidebar-config           → { items: [{id, visible, group?}] }
//                                                 ترتیب + نمایش/مخفی‌کاری آیتم‌ها
// POST  /api/platform/sidebar-config {action:"reset"} → حذف ردیف (بازگشت به ترتیب پیش‌فرض)
//
// ذخیره‌سازی: مدل Prisma «SidebarConfig» (scope یکتا، tenantId=null یعنی
// همهٔ tenantها). itemsJson شامل [{id, label, group, visible}] است — label
// همیشه از فهرست مرجع بازنویسی می‌شود تا با کد هم‌گام بماند.
//
// هم‌گام‌سازی با آیتم‌های جدید: اگر NAV_ITEMS در app-shell بعداً آیتم تازه‌ای
// بگیرد، GET آیتم‌های غایب را «خود-ترمیم» به لیست برمی‌گرداند (بعد از آخرین
// آیتمِ هم‌گروه خودشان درج می‌شوند و visible=true دارند).

/** فهرست مرجع آیتم‌های سایدبار — قرینهٔ NAV_ITEMS در components/app-shell.tsx (۵۱ آیتم) */
const DEFAULT_NAV_ITEMS: ReadonlyArray<{ id: string; label: string; group: string }> = [
  // ۱. داشبورد
  { id: "dashboard", label: "داشبورد", group: "داشبورد" },
  // کیف پول و پاداش — بالای سایدبار
  { id: "wallet", label: "کیف پول", group: "کیف پول و پاداش" },
  { id: "referral", label: "دعوت دوستان", group: "کیف پول و پاداش" },
  // ۲. فروش و خرید
  { id: "pos", label: "صندوق فروش (POS)", group: "فروش و خرید" },
  { id: "quick-invoice", label: "فاکتور سریع", group: "فروش و خرید" },
  { id: "quick-expense", label: "هزینه سریع", group: "فروش و خرید" },
  { id: "end-of-day", label: "گزارش پایان روز", group: "فروش و خرید" },
  { id: "invoices", label: "خرید و فروش", group: "فروش و خرید" },
  { id: "ecommerce", label: "فروشگاه و بازارها", group: "فروش و خرید" },
  { id: "crm", label: "مشتریان (CRM)", group: "فروش و خرید" },
  { id: "customer-portal", label: "پورتال مشتریان", group: "فروش و خرید" },
  { id: "vendor-portal", label: "پورتال تأمین‌کنندگان", group: "فروش و خرید" },
  // ۳. انبار و کالا
  { id: "inventory", label: "انبار و کالا", group: "انبار و کالا" },
  { id: "data-import-export", label: "واردات و صادرکرد داده", group: "انبار و کالا" },
  { id: "project-profitability", label: "سودآوری پروژه‌ها", group: "انبار و کالا" },
  { id: "expense-tracker", label: "هزینه و مسافت", group: "انبار و کالا" },
  { id: "multi-currency", label: "ارز و چندارزی", group: "انبار و کالا" },
  { id: "budget", label: "بودجه‌ریزی", group: "انبار و کالا" },
  // ۴. مالی و بانک
  { id: "core", label: "هسته حسابداری", group: "مالی و بانک" },
  { id: "fiscal-year", label: "مدیریت سال مالی", group: "مالی و بانک" },
  { id: "fixed-assets", label: "دارایی‌های ثابت", group: "مالی و بانک" },
  { id: "treasury", label: "خزانه‌داری و چک", group: "مالی و بانک" },
  { id: "bank-reconciliation", label: "مغایرت‌گیری بانکی", group: "مالی و بانک" },
  { id: "invoice-aging", label: "سن فاکتور و ریسک", group: "مالی و بانک" },
  { id: "financial-ratios", label: "نسبت‌های مالی", group: "مالی و بانک" },
  { id: "tax", label: "ارزش افزوده و مالیات", group: "مالی و بانک" },
  { id: "tax-filing", label: "اظهارنامه مالیاتی", group: "مالی و بانک" },
  { id: "modian", label: "سامانه مودیان", group: "مالی و بانک" },
  { id: "payroll", label: "حقوق و دستمزد", group: "مالی و بانک" },
  { id: "insurance", label: "بیمه", group: "مالی و بانک" },
  { id: "time-attendance", label: "زمان و حضور", group: "مالی و بانک" },
  { id: "leave-management", label: "مدیریت مرخصی", group: "مالی و بانک" },
  { id: "annual-bonus", label: "عیدی و سنوات", group: "مالی و بانک" },
  { id: "employee-portal", label: "پورتال کارکنان", group: "مالی و بانک" },
  { id: "payment", label: "درگاه پرداخت", group: "مالی و بانک" },
  // ۵. گزارش‌ها و هوشمند
  { id: "forecast", label: "پیش‌بینی هوشمند", group: "گزارش‌ها و هوشمند" },
  { id: "scheduled-reports", label: "گزارش‌های دوره‌ای", group: "گزارش‌ها و هوشمند" },
  { id: "reports-builder", label: "گزارش‌ساز", group: "گزارش‌ها و هوشمند" },
  { id: "ai", label: "هوش مصنوعی", group: "گزارش‌ها و هوشمند" },
  { id: "ai-financial-suite", label: "سوپرماژول هوش مالی", group: "گزارش‌ها و هوشمند" },
  // ۶. سیستم
  { id: "api", label: "API و توسعه", group: "سیستم" },
  { id: "security", label: "امنیت و کاربران", group: "سیستم" },
  { id: "tenant-logs", label: "لاگ‌های سازمان", group: "سیستم" },
  { id: "account", label: "حساب کاربری", group: "سیستم" },
  { id: "license", label: "مدیریت لایسنس", group: "سیستم" },
  // ۷. ابزارهای پیشرفته ما
  { id: "calculator", label: "ماشین حساب", group: "ابزارهای پیشرفته ما" },
  { id: "ecosystem", label: "اکوسیستم نوباتایم", group: "ابزارهای پیشرفته ما" },
  { id: "mobile", label: "اپلیکیشن موبایل", group: "ابزارهای پیشرفته ما" },
  // ۸. راهنما
  { id: "support", label: "تیکت پشتیبانی", group: "راهنما" },
  { id: "bug-report", label: "گزارش باگ", group: "راهنما" },
  { id: "help", label: "راهنما و پشتیبانی", group: "راهنما" },
];

const SCOPE = "user-panel";
/** حداقل آیتم نمایان — سایدبار خالی/شبه‌خالی منطقی نیست */
const MIN_VISIBLE = 3;

interface StoredItem {
  id: string;
  label: string;
  group: string;
  visible: boolean;
}

const DEFAULT_BY_ID = new Map<string, { id: string; label: string; group: string }>(
  DEFAULT_NAV_ITEMS.map((item) => [item.id, item])
);

/** پیش‌فرض کامل با visible=true — برای GET در نبود ردیف و برای کلید defaults پاسخ */
function defaultItems(): StoredItem[] {
  return DEFAULT_NAV_ITEMS.map((item) => ({ ...item, visible: true }));
}

/** پارس امن itemsJson — ورودی خراب هرگز نباید مسیر را بشکند */
function parseItemsJson(raw: string): StoredItem[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: StoredItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.id !== "string" || !DEFAULT_BY_ID.has(e.id)) continue; // آیتم ناشناس → دور ریخته می‌شود
      const canonical = DEFAULT_BY_ID.get(e.id)!;
      out.push({
        id: e.id,
        label: canonical.label, // label همیشه از فهرست مرجع
        group: typeof e.group === "string" && e.group.trim() ? e.group.trim() : canonical.group,
        visible: e.visible !== false, // فقط false صریح یعنی مخفی
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * خود-ترمیم: آیتم‌های غایب (مثلاً NAV_ITEM تازه‌اضافه‌شده بعد از آخرین ذخیره)
 * به لیست برمی‌گردند — هر کدام بعد از آخرین آیتمِ هم‌گروهِ موجود درج می‌شود؛
 * اگر گروهش در لیست نیست، انتهای لیست.
 */
function mergeWithDefaults(stored: StoredItem[]): StoredItem[] {
  const result: StoredItem[] = stored.filter((item) => DEFAULT_BY_ID.has(item.id));
  const present = new Set(result.map((item) => item.id));
  for (const def of DEFAULT_NAV_ITEMS) {
    if (present.has(def.id)) continue;
    let insertAt = result.length;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].group === def.group) {
        insertAt = i + 1;
        break;
      }
    }
    result.splice(insertAt, 0, { ...def, visible: true });
    present.add(def.id);
  }
  return result;
}

/** ردیف کانفیگ را بگیر؛ اگر نبود با پیش‌فرض کامل بساز (upsert سمت خواندن) */
async function ensureRow() {
  const existing = await db.sidebarConfig.findUnique({ where: { scope: SCOPE } });
  if (existing) return existing;
  return db.sidebarConfig.create({
    data: {
      scope: SCOPE,
      tenantId: null,
      itemsJson: JSON.stringify(defaultItems()),
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const row = await ensureRow();
    const items = mergeWithDefaults(parseItemsJson(row.itemsJson));

    // اگر خود-ترمیم چیزی تغییر داد، همان موقع ذخیره می‌کنیم تا دفعات بعد تمیز باشد
    if (JSON.stringify(items) !== row.itemsJson) {
      await db.sidebarConfig.update({
        where: { scope: SCOPE },
        data: { itemsJson: JSON.stringify(items) },
      });
    }

    return NextResponse.json({
      success: true,
      config: { items, updatedAt: row.updatedAt },
      // فهرست پیش‌فرض پلتفرم — برای مقایسه/بازنشانی سمت UI
      defaults: defaultItems(),
    });
  } catch (error) {
    console.error("Sidebar config GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت چیدمان سایدبار" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const rawItems: unknown = body?.items;

    // ---- اعتبارسنجی ساختار ----
    if (!Array.isArray(rawItems)) {
      return NextResponse.json(
        { success: false, error: "فیلد items باید آرایه‌ای از آیتم‌های سایدبار باشد" },
        { status: 400 }
      );
    }
    if (rawItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "فهرست آیتم‌ها نمی‌تواند خالی باشد" },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    const cleaned: StoredItem[] = [];
    for (const entry of rawItems) {
      if (!entry || typeof entry !== "object") {
        return NextResponse.json(
          { success: false, error: "هر آیتم باید شیئی با فیلدهای id و visible باشد" },
          { status: 400 }
        );
      }
      const e = entry as Record<string, unknown>;
      const id = typeof e.id === "string" ? e.id : "";
      const canonical = DEFAULT_BY_ID.get(id);
      if (!canonical) {
        return NextResponse.json(
          {
            success: false,
            error: `شناسهٔ آیتم نامعتبر یا ناشناس: «${id || "(خالی)"}» — فقط آیتم‌های سایدبار پنل کاربر مجازند`,
          },
          { status: 400 }
        );
      }
      if (seen.has(id)) {
        return NextResponse.json(
          { success: false, error: `آیتم «${canonical.label}» تکراری است` },
          { status: 400 }
        );
      }
      if (typeof e.visible !== "boolean") {
        return NextResponse.json(
          { success: false, error: `مقدار visible برای «${canonical.label}» باید true/false باشد` },
          { status: 400 }
        );
      }
      // group اختیاری است — اگر آمد باید متن غیرخالی کوتاه باشد؛ وگرنه گروه مرجع
      let group = canonical.group;
      if (e.group !== undefined) {
        if (typeof e.group !== "string" || !e.group.trim() || e.group.trim().length > 80) {
          return NextResponse.json(
            { success: false, error: `گروه آیتم «${canonical.label}» نامعتبر است (متن غیرخالی، حداکثر ۸۰ کاراکتر)` },
            { status: 400 }
          );
        }
        group = e.group.trim();
      }
      seen.add(id);
      cleaned.push({ id, label: canonical.label, group, visible: e.visible });
    }

    // ---- حداقل آیتم نمایان ----
    const visibleCount = cleaned.filter((item) => item.visible).length;
    if (visibleCount < MIN_VISIBLE) {
      return NextResponse.json(
        {
          success: false,
          error: `حداقل ${toPersianDigits(MIN_VISIBLE)} آیتم باید نمایان باشد — الان ${toPersianDigits(visibleCount)} آیتم نمایان است`,
        },
        { status: 400 }
      );
    }

    const itemsJson = JSON.stringify(cleaned);
    const row = await db.sidebarConfig.upsert({
      where: { scope: SCOPE },
      update: { itemsJson, tenantId: null },
      create: { scope: SCOPE, tenantId: null, itemsJson },
    });

    // ثبت در لاگ ممیزی پلتفرم (مثل سایر مسیرهای سوپرادمین) — شکست نباید ذخیره را بپوشاند
    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "SIDEBAR_CONFIG_UPDATED",
          entity: "SidebarConfig",
          entityId: row.id,
          details: itemsJson.slice(0, 4000),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      config: { items: cleaned, updatedAt: row.updatedAt },
    });
  } catch (error) {
    console.error("Sidebar config PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیره چیدمان سایدبار" },
      { status: 500 }
    );
  }
}

// ============ بازنشانی — حذف ردیف → GET بعدی ترتیب پیش‌فرض پلتفرم می‌سازد ============
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    if (body?.action !== "reset") {
      return NextResponse.json(
        { success: false, error: "عملیات نامعتبر — فقط { action: \"reset\" } پشتیبانی می‌شود" },
        { status: 400 }
      );
    }

    await db.sidebarConfig.deleteMany({ where: { scope: SCOPE } });

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "SIDEBAR_CONFIG_RESET",
          entity: "SidebarConfig",
          entityId: SCOPE,
          details: "بازنشانی چیدمان سایدبار به پیش‌فرض پلتفرم",
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: true,
      config: { items: defaultItems(), updatedAt: new Date() },
      message: "چیدمان سایدبار به پیش‌فرض پلتفرم بازنشانی شد",
    });
  } catch (error) {
    console.error("Sidebar config POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در بازنشانی چیدمان سایدبار" },
      { status: 500 }
    );
  }
}
