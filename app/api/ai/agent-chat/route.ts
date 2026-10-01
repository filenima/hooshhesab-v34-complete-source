// /api/ai/agent-chat — ایجنت اجرایی هوش‌یار (حلقه ابزار)
// هوش — Agentic AI Loop (Tool-Calling Protocol)
// ----------------------------------------------------------------------------
// این اندپوینت یک ایجنت واقعی است: مدل می‌تواند علاوه بر پاسخ متنی،
// «ابزار» صدا بزند (کوئری داده / ثبت سند). چون SDK function-calling بومی
// ندارد، پروتکل متنی TOOL_CALL / TOOL_RESULT در system prompt تعبیه شده و
// حلقه سمت سرور تا ۸ تکرار ابزار را اجرا می‌کند.
//
// ابزارها (۴۵ ابزار — Task 25-C «دستیار حرفه‌ای هوش» ۱۰×):
//  خواندنی: query_kpis, query_profit_report, query_profit_trend, query_cashflow,
//   query_receivables_payables, query_party_balance, query_invoice_stats,
//   query_expense_breakdown, query_slow_stock, query_vat_summary,
//   query_employee_count, query_payroll_total, query_invoices, query_parties,
//   query_products, query_top_customers, query_top_vendors, query_top_products,
//   query_top_debtors, query_expenses, query_treasury, query_inventory_value,
//   query_budget, query_wallet, query_modian, query_warehouse, query_currency,
//   query_credit_receivables, search_help, create_opening_balance_hint,
//   check_duplicate_invoice, navigate
//  ثبتی: create_invoice, reserve_invoice, create_credit_invoice, edit_invoice,
//   record_payment, record_party_payment, create_expense, add_customer,
//   add_product, update_product_price, adjust_stock, set_product_discount,
//   create_reminder, void_invoice_draft
//   (سقف ۵ عمل ثبت در هر درخواست + بررسی فاکتور تکراری)
//
// مبالغ: ورودی/خروجی ابزار به تومان — دیتابیس ریال (×۱۰)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildUserContext, formatContextForPrompt, currentJalaliDisplay } from "@/lib/ai-context";
// FIX(v10-ai): موتور یکپارچه — کلید/مدل دلخواه سوپرادمین + دانش‌نامه (RAG)
import { chatComplete, buildKnowledgeContext, getAiProviderSettings } from "@/lib/ai-provider";
import { offlineParseIntent, formatOfflineReply, type OfflineIntent } from "@/lib/offline-agent";
// v33-d: موتور آفلاین v2 — رجیستری ابزار/دانش‌نامه/ماشین‌حساب روی دادهٔ واقعی
import { runOfflineAssistantV2, type AssistantAppAction } from "@/lib/offline-agent-v2";
import {
  createInvoiceAction,
  createExpenseAction,
  addCustomerAction,
  addProductAction,
  recordPaymentAction,
  lookupInvoiceByNumber,
  toNum,
  toStr,
  // Task 21-D: سوییت کامل فاکتور + قیمت کالا
  editInvoiceAction,
  reserveInvoiceAction,
  createCreditInvoiceAction,
  updateProductPriceAction,
  // Task 24-ASSISTANT: دریافت/پرداخت طرف‌حساب + تعدیل موجودی
  recordPartyPaymentAction,
  adjustStockAction,
  // Task 25-C: تخفیف کالا + یادآور + ابطال پیش‌نویس
  setProductDiscountAction,
  createReminderAction,
  voidInvoiceDraftAction,
} from "@/lib/ai-actions";
import {
  toJalali,
  toEnglishDigits,
  getCurrentJalaliYear,
  getCurrentJalaliMonth,
  jalaliToGregorian,
  JALALI_MONTHS,
  INVOICE_STATUS_FA,
  toPersianDigits,
} from "@/lib/persian";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 4000;
const MAX_MESSAGES = 30;
// Task 21-D: حلقه ابزار بزرگ‌تر (سوییت فاکتور چند مرحله‌ای) + سقف جهش ۵
const MAX_TOOL_ITERATIONS = 8;
const MAX_MUTATIONS_PER_REQUEST = 5;

const MUTATION_TOOLS = new Set([
  "create_invoice",
  "create_expense",
  "add_customer",
  "add_product",
  "record_payment",
  // Task 21-D: سوییت کامل فاکتور + قیمت کالا
  "edit_invoice",
  "reserve_invoice",
  "create_credit_invoice",
  "update_product_price",
  // Task 24-ASSISTANT: دریافت/پرداخت + تعدیل موجودی
  "record_party_payment",
  "adjust_stock",
  // Task 25-C: تخفیف کالا + یادآور + ابطال پیش‌نویس
  "set_product_discount",
  "create_reminder",
  "void_invoice_draft",
]);

const KNOWN_TOOLS = [
  "query_kpis",
  "query_invoices",
  "query_parties",
  "query_products",
  "query_expenses",
  "query_treasury",
  "query_modian",
  "query_top_customers",
  "query_warehouse",
  "query_currency",
  "query_credit_receivables",
  "search_help",
  "create_invoice",
  "create_expense",
  "add_customer",
  "add_product",
  "record_payment",
  "edit_invoice",
  "reserve_invoice",
  "create_credit_invoice",
  "update_product_price",
  "check_duplicate_invoice",
  "navigate",
  // Task 24-ASSISTANT — ابزارهای داده‌ای جدید
  "query_top_products",
  "query_top_debtors",
  "query_profit_report",
  "query_inventory_value",
  "query_budget",
  "query_wallet",
  // Task 24-ASSISTANT — ابزارهای اجرایی جدید
  "record_party_payment",
  "adjust_stock",
  // Task 25-C — ابزارهای داده‌ای جدید (۱۰×)
  "query_receivables_payables",
  "query_cashflow",
  "query_top_vendors",
  "query_party_balance",
  "query_invoice_stats",
  "query_expense_breakdown",
  "query_slow_stock",
  "query_vat_summary",
  "query_profit_trend",
  "query_employee_count",
  "query_payroll_total",
  "create_opening_balance_hint",
  // Task 25-C — ابزارهای اجرایی جدید
  "set_product_discount",
  "create_reminder",
  "void_invoice_draft",
];

// ============ Types ============
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ExecutedAction {
  tool: string;
  label: string;
  success: boolean;
  summary: string;
  module?: string;
  url?: string;
}

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  invalid: boolean;
}

// ============ System prompt ============
/** فراخوانی LLM با retry برای خطای 429 (شارژ شدن سقف درخواست SDK) */
async function callLLM(
  zai: Awaited<ReturnType<typeof ZAI.create>> | null,
  messages: Array<{ role: "assistant" | "user" | "system"; content: string }>,
  retries = 3
): Promise<string> {
  let lastErr: unknown = null;
  const backoffs = [3000, 8000, 15000];
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // FIX(v10-ai): مسیر سفارشی — از chatComplete یکپارچه (کلید سوپرادمین)
      if (!zai) {
        const result = await chatComplete(messages, { stream: false });
        return result.text;
      }
      const completion = await zai.chat.completions.create({
        messages: messages as Array<{ role: "assistant" | "user"; content: string }>,
        thinking: { type: "disabled" },
      });
      return completion?.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = msg.includes("429") || msg.toLowerCase().includes("too many requests");
      if (!retryable || attempt === retries) throw err;
      // backoff افزایشی: ۳s سپس ۸s سپس ۱۵s
      await new Promise((r) => setTimeout(r, backoffs[attempt] ?? 15000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("خطای ناشناخته LLM");
}

function buildAgentSystemPrompt(contextText: string): string {
  const base = `تو «هوش‌یار» هستی، ایجنت حسابداری هوشمند و اجرایی نرم‌افزار ایرانی «هوش».

## نقش تو — دستیار حرفه‌ای هوش
تو یک چت‌بات ساده نیستی؛ یک ایجنت اجرایی کامل هستی که داده واقعی کسب‌وکار کاربر را می‌خواند و دستورات او را «همان‌جا و به‌صورت نهایی» در نرم‌افزار اجرا می‌کند. کاربر صاحب یک کسب‌وکار کوچک/متوسط ایرانی است و با فارسی صحبت می‌کند؛ او وقت ندارد به ماژول‌های مختلف برود — کار را خودت انجام بده.

در یک نگاه، آنچه می‌توانی انجام دهی:
- **خواندن (۳۰ ابزار داده‌ای):** شاخص‌ها و سود و روند ۶ماههٔ سود، جریان نقدی، مطالبات/بدهی با سن بدهی، مانده هر طرف‌حساب با سقف اعتباری، آمار فاکتور این ماه در برابر ماه قبل، تحلیل/تفکیک هزینه و ردیف‌های بالای آستانه، ارزش انبار و کالاهای کم‌حرکت، مالیات ارزش افزوده، برترین مشتری/تأمین‌کننده/کالا/بدهکار، بودجه، کیف پول، حقوق و پرسنل، نرخ ارز/طلا، وضعیت مودیان.
- **ثبت (۱۴ ابزار اجرایی):** فاکتور نقدی/قرضی/رزرو و ویرایش آن، دریافت/پرداخت طرف‌حساب، هزینه، مشتری، کالا، تغییر قیمت، تعدیل موجودی، تخفیف درصدی کالا، یادآور سررسید، ابطال پیش‌نویس.
- **راهنما و ناوبری (۲۸+ ماژول):** مسیر دقیق هر ماژول، راهنمای گام‌به‌گام، راهنمای موجودی اولیه، هدایت به هر بخش.

## ممنوعیت مطلق «انداختن کار به گردن دیگران» (بحرانی‌ترین قانون)
- هرگز نگوی و هرگز به کاربر تلقین نکن که «باید از پلن مدیریت درست بشه»، «این کار از پنل مدیریت انجام می‌شود»، «باید خودت از تنظیمات عوضش کنی» یا مشابه آن.
- هر مطلب قابل‌انجامی که ابزارش را داری را خودت با ابزار انجام بده. هیچ کار قابل‌انجامی را به کاربر نسپار.
- فقط اگر کاری «واقعاً و ذاتاً» از دست تو خارج است (مثلاً تغییر داده شرکت دیگر، افزودن درگاه پرداخت جدید، تغییر رمز)، دقیقاً و صادقانه بگو چرا ممکن نیست و «نزدیک‌ترین جایگزین» را پیشنهاد و در صورت امکان اجرا کن.
- سهمیه‌ها/محدودیت‌ها: اگر به سقف پلن خوردی، ابزار خطای مربوطه برمی‌گرداند؛ آن‌وقت مختصر توضیح بده — نه قبل از تلاش.

## پروتکل ابزار (بسیار مهم — دقیقاً رعایت کن)
- اگر برای پاسخ به داده واقعی یا اجرای عملی نیاز داری، کل خروجی تو باید «دقیقاً یک خط» باشد:
TOOL_CALL: {"tool":"نام_ابزار","args":{...}}
- بعد از آن هیچ متن دیگری ننویس (نه توضیح، نه مارک‌داون، نه کدبلاک).
- نتیجه ابزار در پیامی با پیشوند TOOL_RESULT: به تو می‌رسد؛ بر اساس آن ادامه بده.
- در هر نوبت فقط «یک» ابزار صدا بزن. اگر چند ابزار لازم است، پشت‌سرهم یکی‌یکی.
- وقتی اطلاعات کافی داری، پاسخ نهایی را به‌صورت متن فارسی مارک‌داون معمولی بنویس (بدون TOOL_CALL).

## ابزارهای موجود (۴۵ ابزار)
### خواندن داده
1. query_kpis — شاخص‌های مالی. args: {"period":"this_month"|"last_month"|"this_year"|"all"}
2. query_profit_report — گزارش سود تفصیلی (فروش/خرید/هزینه، سود ناخالص/خالص، VAT، حاشیه). args: {"period":"..."}
3. query_profit_trend — روند سود ماهانهٔ ۶ ماه اخیر با نمودار متنی. args: {}
4. query_cashflow — جریان نقدی دوره (دریافت‌ها/پرداخت‌ها/خالص؛ از سند صندوق یا تقریب فاکتورهای نقدی+هزینه). args: {"period":"this_month"}
5. query_receivables_payables — جمع مطالبات و بدهی‌ها با بازه‌های سن بدهی (جاری/۳۰/۶۰/۹۰+ روزه) + طرف‌حساب‌های پرریسک. args: {"limit":10}
6. query_party_balance — ماندهٔ کامل یک طرف‌حساب مشخص (مطالبات/بدهی/سقف اعتباری/قدیمی‌ترین فاکتور باز). args: {"partyName":"علی رضایی"}
7. query_invoice_stats — تعداد و مبلغ فاکتورهای این ماه در برابر ماه قبل + درصد رشد (فروش و خرید). args: {}
8. query_expense_breakdown — تفکیک هزینه‌ها بر اساس دسته + ردیف‌های بزرگ‌تر از آستانه. args: {"period":"this_month","minAmount":2000000,"limit":10}
9. query_slow_stock — کالاهای کم‌حرکت انبار (بدون حرکت اخیر، با ارزش خوابیده). args: {"days":45,"limit":15}
10. query_vat_summary — مالیات ارزش افزودهٔ دوره (فروش/خرید + ماندهٔ قابل پرداخت). args: {"period":"this_month"}
11. query_employee_count — تعداد کارکنان + ترکیب نوع قرارداد. args: {}
12. query_payroll_total — جمع حقوق و اجزایش در آخرین دورهٔ ثبت‌شده. args: {}
13. query_invoices — فاکتورها. args: {"type":"SALE"|"PURCHASE","status":"DRAFT|SENT|PAID|PARTIAL|PARTIALLY_PAID|OVERDUE|RESERVED","partyName":"...","limit":10,"fromDate":"YYYY-MM-DD","toDate":"YYYY-MM-DD"}
14. query_parties — طرف‌حساب‌ها با مانده. args: {"search":"...","type":"CUSTOMER"|"SUPPLIER"}
15. query_products — کالاها با موجودی و قیمت. args: {"search":"...","lowStock":true}
16. query_top_customers — برترین مشتریان بر اساس مبلغ خرید. args: {"limit":5}
17. query_top_vendors — برترین تأمین‌کننده‌ها بر اساس مبلغ خرید شما. args: {"limit":10}
18. query_top_products — پرفروش‌ترین کالاها (تجمیع اقلام فروش). args: {"period":"this_month","limit":10}
19. query_top_debtors — بیشترین بدهکاران (مانده فاکتورهای باز). args: {"limit":10}
20. query_expenses — هزینه‌ها (period + sort amount برای بزرگ‌ترین‌ها). args: {"category":"...","search":"...","period":"this_month","sort":"amount","limit":10}
21. query_treasury — حساب‌های بانکی و موجودی. args: {}
22. query_inventory_value — ارزش موجودی انبار (موجودی × قیمت خرید/فروش + باارزش‌ترین اقلام). args: {}
23. query_budget — وضعیت بودجه‌ها (برنامه/عملکرد/انحراف). args: {"period":"this_year"}
24. query_wallet — کیف پول پاداش نقدی (مانده + تراکنش‌ها + قوانین برداشت). args: {}
25. query_modian — وضعیت صورتحساب‌های مودیان. args: {}
26. query_warehouse — موجودی انبار به تفکیک کالا/انبار + هشدار کم‌موجودی. args: {"search":"...","warehouse":"نام انبار","lowStockOnly":true,"limit":20}
27. query_currency — نرخ لحظه‌ای دلار/یورو/درهم/پوند/لیر/یوآن و طلا به تومان. args: {"items":"USD,EUR,GOLD_GERAM18"}
28. query_credit_receivables — مطالبات قرضی/نسیه با سن بدهی (aging). args: {"partyName":"...","limit":15}
29. search_help — راهنمای نرم‌افزار: «چطور X را انجام دهم؟». args: {"question":"چطور فاکتور قرضی ثبت کنم؟"}
30. create_opening_balance_hint — راهنمای گام‌به‌گام ثبت موجودی اولیه (شروع دوره). args: {}
### ثبت و اجرا (مبالغ همیشه «تومان»)
31. create_invoice — ثبت فاکتور فروش/خرید نقدی (سند حسابداری + خروج/ورود انبار خودکار). args: {"type":"SALE"|"PURCHASE","partyName":"...","items":[{"name":"...","quantity":2,"unitPrice":1000000}],"description":"..."}
32. reserve_invoice — رزرو فاکتور: فاکتور می‌سازد بدون خروج انبار و بدون سند تا «نهایی‌سازی». args: مثل create_invoice
33. create_credit_invoice — فاکتور قرضی/نسیه با سررسید (paymentType=CREDIT). args: مثل create_invoice + "dueDate":"YYYY-MM-DD" (الزامی)
34. edit_invoice — ویرایش فاکتور ثبت‌شده با شماره؛ سند و انبار خودکار تعدیل می‌شوند. args: {"invoiceNumber":"1405-000001","items":[...],"itemPatches":[{"name":"...","quantity":3}],"partyName":"...","date":"...","dueDate":"...","paymentType":"CREDIT"}
35. record_payment — ثبت پرداخت/دریافت روی فاکتور مشخص. args: {"invoiceNumber":"1405-000001","amount":1000000}
36. record_party_payment — دریافت از مشتری / پرداخت به تأمین‌کننده بدون شماره فاکتور: قدیمی‌ترین فاکتور باز همان طرف‌حساب پیدا و تسویه می‌شود. args: {"direction":"RECEIVE"|"PAY","partyName":"...","amount":500000}
37. create_expense — ثبت هزینه. args: {"amount":350000,"category":"FUEL|MEALS|TRAVEL|OFFICE|SOFTWARE|CLIENT_MEETING|OTHER","description":"...","vendor":"..."}
38. add_customer — افزودن طرف‌حساب. args: {"name":"...","type":"CUSTOMER|SUPPLIER|BOTH","mobile":"09...","phone":"...","email":"...","address":"...","nationalId":"...","economicCode":"..."}
39. add_product — افزودن کالا/خدمت. args: {"name":"...","salePrice":120000,"purchasePrice":90000,"unit":"عدد","sku":"...","minStock":5}
40. update_product_price — تغییر قیمت فروش/خرید کالای موجود. args: {"name":"نام یا SKU کالا","salePrice":150000,"purchasePrice":110000}
41. adjust_stock — تعدیل موجودی کالا روی انبار پیش‌فرض (کاردکس + بهای میانگین خودکار). args: {"name":"نام یا SKU","mode":"SET"|"ADD"|"SUBTRACT","quantity":10}
42. set_product_discount — درصد تخفیف روی کالا؛ قیمت فروش جدید = فعلی × (۱−درصد/۱۰۰) و ثبت واقعی می‌شود. args: {"name":"نام یا SKU","percent":20}
43. create_reminder — یادآور سررسید برای فاکتور باز (سررسیدِ همان فاکتور) یا یادآور دلخواه. args: {"invoiceNumber":"1405-000001"} یا {"partyName":"...","daysAhead":3,"title":"..."}
44. void_invoice_draft — ابطال پیش‌نویس (فقط DRAFT → CANCELLED؛ بدون اثر سند/انبار). args: {"invoiceNumber":"1405-000012"}
45. check_duplicate_invoice + navigate — بررسی فاکتور مشابه / هدایت به ماژول. args: {"partyName":"...","amount":5000000,"withinDays":7} / {"module":"dashboard|invoices|quick-invoice|expense-tracker|crm|inventory|reports-builder|tax|treasury|payroll|modian|multi-currency|ecommerce|referral|wallet|bug-report|data-import-export|marketplace|pos|budget|end-of-day|reminders|help|account"}

## قابلیت‌های ویژه راند ۲۴/۲۵ (برای راهنمایی کاربر)
- کیف پول (سایدبار → سیستم → کیف پول): پاداش نقدی — دعوت دوست پس از خرید اشتراک او = ۱٬۰۰۰٬۰۰۰ تومان؛ باگ تأییدشده = ۲۵۰ تا ۱٬۰۰۰ هزار تومان؛ برداشت کارت/شبا از ۵۰۰٬۰۰۰ تومان تا ۷۲ ساعت کاری؛ تراکنش‌ها مانده‌ی پس از تراکنش را نشان می‌دهند. مانده را query_wallet بخوان.
- دعوت دوستان (سیستم → دعوت دوستان): کد اختصاصی، پاداش دوطرفه (۱M تومانی + ۳ روز رایگان برای دوست)، لیدربورد ماهانه ۳۰/۲۰/۱۰ روز حرفه‌ای.
- پل کارتخوان (hoosh-pos-bridge.js): فایل آماده در بسته هوش — Node نصب، USERNAME/PASSWORD یا توکن بالای فایل، حالت simulation برای تست و gateway برای کارت‌کشیدن واقعی؛ فاکتور نقدی = شارژ خودکار = تسویه خودکار؛ ضد شارژ دوباره و ادامه در قطع اینترنت.
- راهنمای کارتخوان داخل صندوق: ماژول صندوق فروش → بنر «راهنمای اتصال کارتخوان» بالای صفحه — راهنمای ۹ بخشی (۵ گام نصب، سه حالت، عیب‌یابی ۸ ردیفه، FAQ).
- ایمپورت هوشمند (ابزارهای پیشرفته → واردات و صادرکرد): CSV/Excel/TXT با پارسر cp1256 (فایل فارسی ویندوزی)، تا ۱۰۰ هزار ردیف، هدر فارسی خودکار، حذف سطر جمع کل، نگاشت موجودی/گروه.
- گزارش باگ (راهنما → گزارش باگ): با اسکرین‌شات ثبت شود؛ «تأیید پشتیبانی» پاداش را به کیف پول می‌فرستد.
- تم ظاهری: تنظیمات (چرخ‌دنده بالای صفحه یا Ctrl+,) → تب «قالب» → «تم ظاهری» → دکمه «انتخاب تم».
- مدیریت منوها (نمایش/مخفی/نام/بج/ترتیب per-plan): پنل مدیریت سوپرادمین → تب «مدیریت منوها» — تغییرات حداکثر ۳۰ ثانیه بعد برای کاربران اعمال می‌شود.

## قواعد رفتار
۱) سوال داده‌ای («چقدر فروش داشتم؟»، «موجودی انبارم؟»، «دلار چند؟»، «چی رو باید وصول کنم؟»...) → حتماً ابزار query مناسب را صدا بزن و با عدد واقعی جواب بده. هرگز عدد از خودت نساز.
۲) دستور اجرایی («فاکتور ثبت کن»، «فاکتور رزرو کن»، «قرضی ثبت کن»، «قیمت کالای X رو عوض کن»، «فاکتور ۱۴۰۵-۳ رو ویرایش کن»...) → ابزار مربوطه را صدا بزن. کاربر صریحاً دستور داده؛ دوباره تأیید نگیر، مگر اطلاعات حیاتی (مبلغ/نام/شماره فاکتور/سررسید قرضی) کاملاً غایب باشد — فقط در آن صورت بپرس.
۳) «رزرو» یعنی status=RESERVED (بدون اثر انبار/سند) — از reserve_invoice استفاده کن. «قرضی/نسیه/الحساب/اعتباری» یعنی create_credit_invoice با dueDate. اگر کاربر فقط گفت «فاکتور» بدون قید، create_invoice نقدی بزن.
۴) ویرایش فاکتور: اول اگر شماره را ندادی، با query_invoices پیدایش کن؛ بعد edit_invoice. برای تغییر تعداد/قیمت یک قلم فقط itemPatches بفرست (مثلاً {"name":"...","quantity":2}) — بقیهٔ اقلام و قیمت‌ها دست‌نخورده می‌مانند. items کامل فقط برای بازنویسی کل فاکتور است.
۵) عملیات «خراب‌کننده/پرجنبه» (ویرایش فاکتور بزرگ، تغییر قیمت‌های گروهی، حذف) → قبل از اجرا یک جمله تأیید واضح از کاربر بگیر («مبلغ از X به Y تغییر کند؟»). ثبت‌های ساده و کوچک بدون تأیید اضافه اجرا شوند (UI خودش کارت تأیید دارد).
۶) ثبت فاکتور: سیستم خودش فاکتورهای مشابه را بررسی می‌کند و نتیجه در TOOL_RESULT می‌آید. اگر duplicates غیرخالی بود، در پاسخ نهایی حتماً هشدار بده (ثبت دوباره = مالیات و فروش دوباره!).
۷) حداکثر ۵ عمل ثبت در هر درخواست مجاز است.
۸) پاسخ نهایی: فارسی روان با bullet و **bold** و در صورت مفید بودن جدول مارک‌داون. اعداد با ارقام فارسی. مبالغ «تومان» با جداکننده هزارگان. آخر هر پاسخ یک «قدم بعدی» پیشنهادی کوتاه بده (مثل: «می‌خواهی مانده قرضی‌ها را هم ببینم؟»).
۹) اگر سندی ثبت/ویرایش شد، شماره سند و مبلغ را در پاسخ نهایی ذکر کن.
۱۰) **صداقت اجرا (بحرانی):** فقط زمانی بگو عملی «انجام/ثبت شد» که TOOL_RESULT موفق آن ابزار را دیده باشی. اگر ابزاری صدا نزدی، هرگز ادعا نکن — دستور را دقیق تکرار کن و آماده اجرا باش.
۱۱) **لینک ممنوع:** هرگز لینک/URL از خودت نساز؛ فقط شماره سند را بنویس، دکمه «مشاهده» را UI می‌سازد.
۱۲) تاریخ‌ها شمسی‌اند. تاریخ امروز: ${currentJalaliDisplay()}. تاریخ ورودی ابزارها را «شمسی» بفرست (YYYY/MM/DD مثل 1405/09/30) — خودمم تبدیل می‌شود؛ هرگز تبدیل میلادی دستی نکن. خروجی برای کاربر همیشه شمسی.
۱۳) سوالات عمومی حسابداری/مالیاتی (نرخ‌ها، مودیان، حقوق و دستمزد، چک صیادی) → مستقیم و تخصصی جواب بده. تو حسابدار ارشد ایرانی هستی.
۱۴) «چطور در خود نرم‌افزار X را انجام دهم؟» → اول search_help را امتحان کن؛ اگر پاسخ نداد، خودت راهنمایی دقیق ماژول‌به‌ماژول بده و در صورت امکان همان کار را با ابزار انجام بده.
۱۵) سوال خارج از حوزه → مودبانه هدایت کن.

نکته: «متن زمینه» پایین خلاصه لحظه‌ای است (KPI ماه، انبار، نرخ بازار، پلن...)؛ برای اعداد دقیق یا بازه‌های دیگر از ابزارهای query استفاده کن.`;

  return contextText ? `${base}\n\n${contextText}` : base;
}

// ============ TOOL_CALL parser ============
function parseToolCall(reply: string): ToolCall | null {
  if (!reply) return null;
  const tryParse = (raw: string): ToolCall | null => {
    const jsonPart = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const start = jsonPart.indexOf("{");
    if (start === -1) return { tool: "", args: {}, invalid: true };
    const end = jsonPart.lastIndexOf("}");
    if (end <= start) return { tool: "", args: {}, invalid: true };
    try {
      const parsed = JSON.parse(jsonPart.slice(start, end + 1)) as {
        tool?: unknown;
        args?: unknown;
      };
      if (parsed && typeof parsed.tool === "string" && parsed.tool) {
        return {
          tool: parsed.tool,
          args:
            parsed.args && typeof parsed.args === "object"
              ? (parsed.args as Record<string, unknown>)
              : {},
          invalid: false,
        };
      }
      return { tool: "", args: {}, invalid: true };
    } catch {
      return { tool: "", args: {}, invalid: true };
    }
  };

  const lines = reply.split("\n").map((l) => l.trim());
  // ۱) کل پاسخ با TOOL_CALL شروع شود
  if (lines[0].startsWith("TOOL_CALL:")) {
    return tryParse(lines[0].slice("TOOL_CALL:".length));
  }
  // ۲) خطی در وسط پاسخ با TOOL_CALL شروع شود (code fences تحمل می‌شود)
  for (const line of lines) {
    const cleaned = line.replace(/^```(?:json)?\s*/i, "").trim();
    if (cleaned.startsWith("TOOL_CALL:")) {
      return tryParse(cleaned.slice("TOOL_CALL:".length));
    }
  }
  // FIX(v11-multiline): ۳) TOOL_CALL با JSON چندخطی (pretty-printed) —
  // قبلاً فقط خط‌به‌خط جستجو می‌شد و «TOOL_CALL: {» + ادامه در خطوط بعد
  // پارس نمی‌شد → ابزار اجرا نمی‌شد ولی مدل در پاسخ نهایی «انجام شد»
  // می‌گفت (توهم اجرا). حالا کل متن بعد از اولین TOOL_CALL: گرفته می‌شود.
  const idx = reply.indexOf("TOOL_CALL:");
  if (idx !== -1) {
    const rest = reply
      .slice(idx + "TOOL_CALL:".length)
      .replace(/```(?:json)?/gi, "")
      .trim();
    const start = rest.indexOf("{");
    const end = rest.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return tryParse(rest.slice(start, end + 1));
    }
  }
  return null;
}

// ============ Helpers ============
function toToman(v: bigint | number | null | undefined): number {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  return Math.floor(n / 10);
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** بازه شمسی → میلادی {start, end} — end انحصاری است */
function jalaliPeriodRange(period: string): { start?: Date; end?: Date; label: string } {
  const now = new Date();
  const jy = getCurrentJalaliYear(now);
  const jm = getCurrentJalaliMonth(now);
  const mk = (y: number, m: number, d: number): Date => {
    const [gy, gm, gd] = jalaliToGregorian(y, m, d);
    return new Date(gy, gm - 1, gd);
  };
  switch (period) {
    case "last_month": {
      const py = jm === 1 ? jy - 1 : jy;
      const pm = jm === 1 ? 12 : jm - 1;
      const nm = pm === 12 ? 1 : pm + 1;
      const ny = pm === 12 ? py + 1 : py;
      return { start: mk(py, pm, 1), end: mk(ny, nm, 1), label: `ماه ${JALALI_MONTHS[pm - 1]} ${py}` };
    }
    case "this_year":
      return { start: mk(jy, 1, 1), end: mk(jy + 1, 1, 1), label: `سال ${jy}` };
    case "all":
      return { label: "کل دوره" };
    case "this_month":
    default:
      return {
        start: mk(jy, jm, 1),
        end: mk(jm === 12 ? jy + 1 : jy, jm === 12 ? 1 : jm + 1, 1),
        label: `ماه ${JALALI_MONTHS[jm - 1]} ${jy}`,
      };
  }
}

/** پارس تاریخ آرگومان ابزار — ISO یا شمسی ۱۴۰۴/۰۷/۱۵ (با ارقام فارسی) */
function parseDateArg(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const s = toStr(v);
  if (!s) return null;
  const normalized = toEnglishDigits(s).trim();
  const jalali = normalized.replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (jalali) {
    const jy = Number(jalali[1]);
    const jm = Number(jalali[2]);
    const jd = Number(jalali[3]);
    if (jy >= 1300 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
      const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
      return new Date(gy, gm - 1, gd);
    }
    // تاریخ میلادی (مثل 2025-10-01)
    const d = new Date(normalized.replace(/\//g, "-"));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(normalized.replace(/\//g, "-"));
  return isNaN(d.getTime()) ? null : d;
}

const invoiceTypeFa = (t: string): string =>
  t === "SALE"
    ? "فروش"
    : t === "PURCHASE"
      ? "خرید"
      : t === "RETURN"
        ? "برگشتی"
        : t === "PRE_INVOICE"
          ? "پیش‌فاکتور"
          : t;

// ============ Task 25-C: پوشش ایمن ابزارهای کوئری ============
/** اجرای کوئری با گارد — خطای دیتابیس به پیام صادقانه فارسی تبدیل می‌شود (نه 500 خاموش) */
async function safeQueryTool<T extends Record<string, unknown>>(
  fn: () => Promise<T>,
  faWhat: string
): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[agent-chat] safeQueryTool (${faWhat}) error:`, err);
    return {
      error: `دادهای برای محاسبه ${faWhat} در دسترس نیست — لطفاً دوباره تلاش کنید یا از ماژول مربوطه گزارش بگیرید`,
    };
  }
}

// ============ فاکتورهای مشابه (ضدفروش) ============
interface DuplicateMatch {
  number: string;
  type: string;
  partyName: string;
  subtotalToman: number;
  totalToman: number;
  date: string;
  daysAgo: number;
}

async function findDuplicateInvoices(
  tenantId: string,
  partyName: string,
  amountToman: number,
  withinDays: number
): Promise<DuplicateMatch[]> {
  if (!partyName || amountToman <= 0) return [];
  const parties = await db.party.findMany({
    where: { tenantId, deletedAt: null, name: { contains: partyName } },
    select: { id: true },
    take: 5,
  });
  if (parties.length === 0) return [];
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const invoices = await db.invoice.findMany({
    where: {
      tenantId,
      deletedAt: null,
      partyId: { in: parties.map((p) => p.id) },
      date: { gte: since },
    },
    include: { party: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 50,
  });
  const matches: DuplicateMatch[] = [];
  for (const inv of invoices) {
    const total = toToman(inv.total);
    const subtotal = toToman(inv.subtotal);
    // تطبیق با مبلغ خالص (بدون مالیات) یا مبلغ کل (با مالیات ۹٪) — پنجره ±۵٪
    const diff = Math.min(Math.abs(total - amountToman), Math.abs(subtotal - amountToman));
    if (diff <= amountToman * 0.05) {
      const daysAgo = Math.floor((Date.now() - inv.date.getTime()) / (24 * 60 * 60 * 1000));
      matches.push({
        number: inv.number,
        type: invoiceTypeFa(inv.type),
        partyName: inv.party?.name || "—",
        subtotalToman: subtotal,
        totalToman: total,
        date: toJalali(inv.date),
        daysAgo,
      });
    }
  }
  return matches;
}

// ============ Tool: query_kpis ============
async function toolQueryKpis(tenantId: string, args: Record<string, unknown>) {
  const period = toStr(args.period, "this_month");
  const range = jalaliPeriodRange(period);
  const dateFilter: { gte?: Date; lt?: Date } = {};
  if (range.start) dateFilter.gte = range.start;
  if (range.end) dateFilter.lt = range.end;
  const hasRange = Boolean(range.start);

  const [sales, purchases, expenses, cashSum, recSum, paySum] = await Promise.all([
    db.invoice.aggregate({
      where: {
        tenantId,
        type: "SALE",
        deletedAt: null,
        ...(hasRange ? { date: dateFilter } : {}),
      },
      _sum: { total: true },
    }),
    db.invoice.aggregate({
      where: {
        tenantId,
        type: "PURCHASE",
        deletedAt: null,
        ...(hasRange ? { date: dateFilter } : {}),
      },
      _sum: { total: true },
    }),
    db.expenseEntry.aggregate({
      where: { tenantId, type: "EXPENSE", ...(hasRange ? { date: dateFilter } : {}) },
      _sum: { amount: true },
    }),
    db.bankAccount.aggregate({ where: { tenantId, deletedAt: null }, _sum: { balance: true } }),
    db.invoice.aggregate({
      where: {
        tenantId,
        type: "SALE",
        deletedAt: null,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
      _sum: { total: true, paidAmount: true },
    }),
    db.invoice.aggregate({
      where: {
        tenantId,
        type: "PURCHASE",
        deletedAt: null,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
      _sum: { total: true, paidAmount: true },
    }),
  ]);

  const salesT = toToman(sales._sum?.total ?? null);
  const purchT = toToman(purchases._sum?.total ?? null);
  const expT = toToman(expenses._sum?.amount ?? null);
  const recT = Math.max(
    0,
    toToman(recSum._sum?.total ?? null) - toToman(recSum._sum?.paidAmount ?? null)
  );
  const payT = Math.max(
    0,
    toToman(paySum._sum?.total ?? null) - toToman(paySum._sum?.paidAmount ?? null)
  );

  return {
    period,
    periodLabel: range.label,
    currency: "toman",
    sales: fmt(salesT),
    purchases: fmt(purchT),
    expenses: fmt(expT),
    profit: fmt(salesT - purchT - expT),
    cashBalance: fmt(toToman(cashSum._sum?.balance ?? null)),
    receivables: fmt(recT),
    payables: fmt(payT),
    note: "همه مبالغ به تومان. سود = فروش − خرید − هزینه‌ها. cashBalance/receivables/payables مانده لحظه‌ای کل دوره‌هاست.",
  };
}

// ============ Tool: query_invoices ============
async function toolQueryInvoices(tenantId: string, args: Record<string, unknown>) {
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 10)), 50);
  const type = toStr(args.type).toUpperCase();
  const status = toStr(args.status).toUpperCase();
  const partyName = toStr(args.partyName);
  const from = parseDateArg(args.fromDate);
  const to = parseDateArg(args.toDate);

  const where: Record<string, unknown> = { tenantId, deletedAt: null };
  if (["SALE", "PURCHASE", "RETURN", "PRE_INVOICE"].includes(type)) where.type = type;
  if (
    [
      "DRAFT",
      "SENT",
      "PAID",
      "PARTIAL",
      "PARTIALLY_PAID",
      "OVERDUE",
      "RESERVED",
      "CANCELLED",
    ].includes(status)
  )
    where.status = status;
  // Task 21-D: فیلتر نوع پرداخت (نسیه) و اقلام قرضی
  const paymentType = toStr(args.paymentType).toUpperCase();
  if (paymentType === "CREDIT" || paymentType === "CASH") where.paymentType = paymentType;
  if (partyName) where.party = { name: { contains: partyName } };
  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.gte = from;
  if (to) {
    // شامل کل روز مقصد
    to.setHours(23, 59, 59, 999);
    dateFilter.lte = to;
  }
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { date: "desc" },
      take: limit,
      include: { party: { select: { name: true } } },
    }),
    db.invoice.count({ where }),
  ]);

  return {
    total,
    count: invoices.length,
    currency: "toman",
    invoices: invoices.map((inv) => ({
      number: inv.number,
      type: invoiceTypeFa(inv.type),
      party: inv.party?.name || "—",
      totalToman: fmt(toToman(inv.total)),
      paidToman: fmt(toToman(inv.paidAmount)),
      status: INVOICE_STATUS_FA[inv.status] || (inv.status === "RESERVED" ? "رزرو" : inv.status),
      paymentType: inv.paymentType === "CREDIT" ? "قرضی/نسیه" : "نقدی",
      dueDate: inv.dueDate ? toJalali(inv.dueDate) : null,
      date: toJalali(inv.date),
    })),
  };
}

// ============ Tool: query_parties ============
async function toolQueryParties(tenantId: string, args: Record<string, unknown>) {
  const search = toStr(args.search);
  const type = toStr(args.type).toUpperCase();
  const where: Record<string, unknown> = { tenantId, deletedAt: null };
  if (["CUSTOMER", "SUPPLIER", "BOTH"].includes(type)) where.type = type;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
      { mobile: { contains: search } },
    ];
  }
  const parties = await db.party.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, code: true, name: true, type: true, mobile: true, phone: true, email: true },
  });
  if (parties.length === 0) return { count: 0, parties: [] };

  const ids = parties.map((p) => p.id);
  const [salesAgg, purchAgg] = await Promise.all([
    db.invoice.groupBy({
      by: ["partyId"],
      where: {
        tenantId,
        partyId: { in: ids },
        type: "SALE",
        deletedAt: null,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
      _sum: { total: true, paidAmount: true },
    }),
    db.invoice.groupBy({
      by: ["partyId"],
      where: {
        tenantId,
        partyId: { in: ids },
        type: "PURCHASE",
        deletedAt: null,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
      _sum: { total: true, paidAmount: true },
    }),
  ]);
  const recMap = new Map(
    salesAgg.map((g) => [
      g.partyId,
      Math.max(0, toToman(g._sum.total ?? null) - toToman(g._sum.paidAmount ?? null)),
    ])
  );
  const payMap = new Map(
    purchAgg.map((g) => [
      g.partyId,
      Math.max(0, toToman(g._sum.total ?? null) - toToman(g._sum.paidAmount ?? null)),
    ])
  );

  return {
    count: parties.length,
    currency: "toman",
    parties: parties.map((p) => ({
      name: p.name,
      code: p.code,
      type: p.type === "CUSTOMER" ? "مشتری" : p.type === "SUPPLIER" ? "تأمین‌کننده" : p.type,
      mobile: p.mobile || p.phone || "",
      email: p.email || "",
      // بدهی مشتری به ما (مطالبات)
      receivableToman: fmt(recMap.get(p.id) ?? 0),
      // بدهی ما به تأمین‌کننده
      payableToman: fmt(payMap.get(p.id) ?? 0),
    })),
  };
}

// ============ Tool: query_products ============
async function toolQueryProducts(tenantId: string, args: Record<string, unknown>) {
  const search = toStr(args.search);
  const lowStockOnly = args.lowStock === true;
  const where: Record<string, unknown> = { tenantId, deletedAt: null };
 // Task 24-ASSISTANT:جستجوی واریانتی — «آب رنگ» «آب‌رنگ» «آبرنگ»
  let products: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    minStock: number;
    salePrice: bigint;
    purchasePrice: bigint;
  }> = [];
  if (search) {
    for (const v of productSearchVariants(search)) {
      const found = await db.product.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { name: { contains: v } },
            { sku: { contains: v } },
            { barcode: { contains: v } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          minStock: true,
          salePrice: true,
          purchasePrice: true,
        },
      });
      if (found.length > 0) {
        products = found;
        break;
      }
    }
  } else {
    products = await db.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        minStock: true,
        salePrice: true,
        purchasePrice: true,
      },
    });
  }
  if (products.length === 0) return { count: 0, products: [] };

  const stockAgg = await db.stockItem.groupBy({
    by: ["productId"],
    where: { tenantId, productId: { in: products.map((p) => p.id) } },
    _sum: { quantity: true },
  });
  const stockMap = new Map(stockAgg.map((s) => [s.productId, s._sum.quantity ?? 0]));

  let mapped = products.map((p) => {
    const stock = stockMap.get(p.id) ?? 0;
    return {
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      stock: Math.round(stock * 100) / 100,
      minStock: p.minStock,
      lowStock: stock <= p.minStock,
      salePriceToman: fmt(toToman(p.salePrice)),
      purchasePriceToman: fmt(toToman(p.purchasePrice)),
    };
  });
  if (lowStockOnly) mapped = mapped.filter((p) => p.lowStock);
  return { count: mapped.length, currency: "toman", products: mapped.slice(0, 30) };
}

// ============ Tool: query_top_customers ============
async function toolQueryTopCustomers(tenantId: string, args: Record<string, unknown>) {
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 5)), 20);
  const grouped = await db.invoice.groupBy({
    by: ["partyId"],
    where: { tenantId, type: "SALE", deletedAt: null },
    _sum: { total: true },
    _count: { id: true },
    orderBy: { _sum: { total: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return { count: 0, customers: [] };
  const parties = await db.party.findMany({
    where: { id: { in: grouped.map((g) => g.partyId) } },
    select: { id: true, name: true, code: true, mobile: true },
  });
  const partyMap = new Map(parties.map((p) => [p.id, p]));
  return {
    count: grouped.length,
    currency: "toman",
    customers: grouped.map((g, i) => {
      const p = partyMap.get(g.partyId);
      return {
        rank: i + 1,
        name: p?.name || "—",
        code: p?.code || "",
        mobile: p?.mobile || "",
        totalSalesToman: fmt(toToman(g._sum.total ?? null)),
        invoiceCount: g._count.id,
      };
    }),
  };
}

// ============ Tool: query_expenses (جدید) ============
async function toolQueryExpenses(tenantId: string, args: Record<string, unknown>) {
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 10)), 50);
  const category = typeof args.category === "string" ? args.category.toUpperCase() : undefined;
  const search = typeof args.search === "string" ? args.search.trim() : "";
  // Task 24-ASSISTANT: فیلتر بازه + مرتب‌سازی مبلغ (بزرگ‌ترین هزینه‌ها)
  const period = toStr(args.period);
  const sort = toStr(args.sort).toLowerCase() === "amount" ? "amount" : "date";

  const where: Record<string, unknown> = { tenantId, type: "EXPENSE" };
  if (category && category !== "ALL") {
    where.category = category;
  }
  if (search) {
    where.OR = [
      { description: { contains: search } },
      { vendor: { contains: search } },
    ];
  }
  if (period) {
    const range = jalaliPeriodRange(period);
    const dateFilter: Record<string, Date> = {};
    if (range.start) dateFilter.gte = range.start;
    if (range.end) dateFilter.lt = range.end;
    if (Object.keys(dateFilter).length > 0) where.date = dateFilter;
  }

  const entries = await db.expenseEntry.findMany({
    where,
    orderBy: sort === "amount" ? { amount: "desc" } : { date: "desc" },
    take: limit,
    select: {
      amount: true,
      date: true,
      category: true,
      vendor: true,
      description: true,
      status: true,
    },
  });

  const totalToman = entries.reduce((s, e) => s + toToman(e.amount), 0);
  // گروه‌بندی بر اساس دسته
  const byCat = new Map<string, number>();
  for (const e of entries) {
    byCat.set(e.category, (byCat.get(e.category) || 0) + toToman(e.amount));
  }
  return {
    count: entries.length,
    currency: "toman",
    totalToman: fmt(totalToman),
    byCategory: Array.from(byCat.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, sum]) => ({ category: cat, totalToman: fmt(sum) })),
    expenses: entries.map((e) => ({
      date: toJalali(e.date),
      category: e.category,
      vendor: e.vendor || "",
      description: e.description || "",
      status: e.status,
      amountToman: fmt(toToman(e.amount)),
    })),
  };
}

// ============ Tool: query_treasury (جدید) ============
async function toolQueryTreasury(tenantId: string) {
  const accounts = await db.bankAccount.findMany({
    where: { tenantId, deletedAt: null },
    select: { bankName: true, branch: true, type: true, balance: true, currency: true },
    orderBy: { balance: "desc" },
  });
  const totalRial = accounts.reduce((s, a) => s + Number(a.balance), 0);
  return {
    currency: "toman",
    totalBalanceToman: fmt(Math.floor(totalRial / 10)),
    accountCount: accounts.length,
    accounts: accounts.map((a) => ({
      bank: a.bankName,
      branch: a.branch || "",
      type: a.type, // CURRENT | SAVING | LOAN
      balanceToman: fmt(toToman(a.balance)),
    })),
  };
}

// ============ Tool: query_modian (جدید) ============
async function toolQueryModian(tenantId: string) {
  const grouped = await db.invoice.groupBy({
    by: ["modianStatus"],
    where: { tenantId, type: "SALE", deletedAt: null },
    _count: { id: true },
  });
  const statusMap = new Map(grouped.map((g) => [g.modianStatus ?? "NULL", g._count.id]));

  // فاکتورهای واجد شرایط ولی ارسال‌نشده (صف مودیان)
  const pending = await db.invoice.findMany({
    where: {
      tenantId,
      type: "SALE",
      deletedAt: null,
      // FIX: Prisma فیلتر in برای فیلد nullable آرایه‌ی null قبول نمی‌کند —
      // nullها با OR جداگانه پوشش داده می‌شوند (معادل in: [null, "PENDING", "REJECTED"])
      OR: [{ modianStatus: null }, { modianStatus: { in: ["PENDING", "REJECTED"] } }],
      status: { in: ["SENT", "PAID", "PARTIAL", "OVERDUE"] },
      total: { gt: 0 },
    },
    orderBy: { date: "desc" },
    take: 10,
    select: { number: true, date: true, total: true, modianStatus: true, partyId: true },
  });
  const parties = pending.length
    ? await db.party.findMany({
        where: { id: { in: pending.map((p) => p.partyId) } },
        select: { id: true, name: true },
      })
    : [];
  const partyMap = new Map(parties.map((p) => [p.id, p.name]));

  return {
    statusCounts: {
      unsent: (statusMap.get("NULL") ?? 0) + (statusMap.get("PENDING") ?? 0),
      sent: statusMap.get("SENT") ?? 0,
      accepted: statusMap.get("ACCEPTED") ?? 0,
      rejected: statusMap.get("REJECTED") ?? 0,
    },
    pendingQueue: pending.map((p) => ({
      number: p.number,
      party: partyMap.get(p.partyId) || "—",
      date: toJalali(p.date),
      totalToman: fmt(toToman(p.total)),
      status: p.modianStatus || "در صف",
    })),
    note: "فاکتورهای ارسال‌نشده باید طبق مهلت قانونی (حداکثر ۱۲ روز از صدور) به سامانه مودیان ارسال شوند.",
  };
}

// ============ Tool: query_warehouse (Task 21-D) ============
/** موجودی انبار به تفکیک کالا/انبار + هشدار کم‌موجودی (StockItem + Product.minStock) */
async function toolQueryWarehouse(tenantId: string, args: Record<string, unknown>) {
  const search = toStr(args.search);
  const warehouseName = toStr(args.warehouse);
  const lowStockOnly = args.lowStockOnly === true || args.lowStock === true;
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 20)), 60);

  const productWhere: Record<string, unknown> = { tenantId, deletedAt: null };
  if (search) {
    productWhere.OR = [
      { name: { contains: search } },
      { sku: { contains: search } },
      { barcode: { contains: search } },
    ];
  }
  const [products, warehouses] = await Promise.all([
    db.product.findMany({
      where: productWhere,
      orderBy: { name: "asc" },
      take: limit,
      select: { id: true, name: true, sku: true, unit: true, minStock: true, salePrice: true },
    }),
    db.warehouse.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);
  if (products.length === 0) return { count: 0, items: [], note: "کالایی یافت نشد" };
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));

  const stockItems = await db.stockItem.findMany({
    where: { tenantId, productId: { in: products.map((p) => p.id) } },
    include: { warehouse: { select: { name: true } } },
  });

  // انبار فیلترشده؟
  const filteredStock = warehouseName
    ? stockItems.filter(
        (si) =>
          si.warehouse?.name?.includes(warehouseName) ||
          warehouseMap.get(si.warehouseId)?.includes(warehouseName)
      )
    : stockItems;

  // تجمیع: کل موجودی هر کالا + ردیف‌های تفکیکی انبار
  type Row = {
    product: string;
    sku: string;
    unit: string;
    stock: number;
    minStock: number;
    lowStock: boolean;
    warehouse: string;
    salePriceToman: string;
  };
  const totalByProduct = new Map<string, number>();
  for (const si of filteredStock) {
    totalByProduct.set(si.productId, (totalByProduct.get(si.productId) ?? 0) + si.quantity);
  }
  const rows: Row[] = [];
  for (const p of products) {
    const total = totalByProduct.get(p.id) ?? 0;
    const lowStock = total <= p.minStock;
    if (lowStockOnly && !lowStock) continue;
    const perWarehouse = filteredStock.filter((si) => si.productId === p.id && si.quantity !== 0);
    if (perWarehouse.length === 0) {
      rows.push({
        product: p.name,
        sku: p.sku,
        unit: p.unit,
        stock: Math.round(total * 100) / 100,
        minStock: p.minStock,
        lowStock,
        warehouse: "—",
        salePriceToman: fmt(toToman(p.salePrice)),
      });
    } else {
      for (const si of perWarehouse) {
        rows.push({
          product: p.name,
          sku: p.sku,
          unit: p.unit,
          stock: Math.round(si.quantity * 100) / 100,
          minStock: p.minStock,
          lowStock,
          warehouse: si.warehouse?.name || warehouseMap.get(si.warehouseId) || "—",
          salePriceToman: fmt(toToman(p.salePrice)),
        });
      }
    }
  }
  const lowCount = products.filter((p) => (totalByProduct.get(p.id) ?? 0) <= p.minStock).length;
  return {
    currency: "toman",
    productCount: products.length,
    warehouseCount: warehouses.length,
    lowStockCount: lowCount,
    rows: rows.slice(0, limit),
    note:
      lowCount > 0
        ? `${lowCount} کالا رو‌به‌اتمام است (موجودی ≤ حداقل) — در پاسخ نهایی هشدار بده.`
        : "هیچ کالایی زیر حداقل موجودی نیست.",
  };
}

// ============ Tool: query_currency (Task 21-D) ============
/** نرخ‌های ارز و طلا از ExchangeRate (واحد ریال) — خروجی تومان */
async function toolQueryCurrency(tenantId: string, args: Record<string, unknown>) {
  void tenantId; // نرخ‌ها سراسری‌اند
  const labels: Record<string, string> = {
    USD: "دلار آمریکا",
    EUR: "یورو",
    AED: "درهم امارات",
    GBP: "پوند انگلیس",
    TRY: "لیر ترکیه",
    CNY: "یوآن چین",
    GOLD_GERAM18: "گرم طلای ۱۸ عیار",
    GOLD_SEKEE: "سکه امامی",
    GOLD_ONSE: "انس جهانی طلا",
    GOLD_MESGHAL: "مثقال طلا",
  };
  const itemsFilter = toStr(args.items);
  const where: Record<string, unknown> = { toCurrency: "IRR" };
  if (itemsFilter) {
    const codes = itemsFilter
      .split(/[,،\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (codes.length > 0) where.fromCurrency = { in: codes };
  }
  const rates = await db.exchangeRate.findMany({
    where,
    orderBy: { fetchedAt: "desc" },
    take: 40,
  });
  const latest = new Map<string, { rate: number; fetchedAt: Date; source: string }>();
  for (const r of rates) {
    if (!latest.has(r.fromCurrency)) {
      latest.set(r.fromCurrency, { rate: r.rate, fetchedAt: r.fetchedAt, source: r.source });
    }
  }
  if (latest.size === 0) {
    return {
      items: [],
      note: "هنوز هیچ نرخ ارز/طلا در سیستم ثبت نشده — کاربر می‌تواند از ماژول انبار «همگام‌سازی با نرخ بازار» یا بخش ارز نرخ‌ها را دریافت کند.",
    };
  }
  return {
    currency: "toman",
    items: Array.from(latest.entries()).map(([code, v]) => ({
      code,
      label: labels[code] || code,
      rateToman: fmt(Math.floor(v.rate / 10)),
      source: v.source,
      fetchedAt: toJalali(v.fetchedAt),
    })),
    note: "نرخ‌ها از آخرین به‌روزرسانی ثبت‌شده در سیستم‌اند (منبع: tgju/دستی). نوسان لحظه‌ای ممکن است.",
  };
}

// ============ Tool: query_credit_receivables (Task 21-D) ============
/** مطالبات قرضی/نسیه — فاکتورهای فروش تسویه‌نشده با سن بدهی (aging) */
async function toolQueryCreditReceivables(tenantId: string, args: Record<string, unknown>) {
  const partyName = toStr(args.partyName);
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 15)), 50);
  // فقط قرضی‌ها؟ (پیش‌فرض: همهٔ تسویه‌نشده‌ها — نقدی هم اگر تسویه نشده باشد مطالبه است)
  const creditOnly = args.creditOnly === true;

  const where: Record<string, unknown> = {
    tenantId,
    type: "SALE",
    deletedAt: null,
    status: { in: ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] },
  };
  if (creditOnly) where.paymentType = "CREDIT";
  if (partyName) where.party = { name: { contains: partyName } };

  const invoices = await db.invoice.findMany({
    where,
    orderBy: { date: "asc" }, // قدیمی‌ترین بدهی اول (aging)
    take: limit,
    include: { party: { select: { name: true } } },
  });

  const now = Date.now();
  const rows = invoices
    .map((inv) => {
      const total = toToman(inv.total);
      const paid = toToman(inv.paidAmount);
      const remaining = Math.max(0, total - paid);
      const ageDays = Math.floor((now - inv.date.getTime()) / (24 * 60 * 60 * 1000));
      const bucket =
        ageDays <= 30 ? "۰-۳۰ روز" : ageDays <= 60 ? "۳۱-۶۰ روز" : ageDays <= 90 ? "۶۱-۹۰ روز" : "بیش از ۹۰ روز";
      return {
        number: inv.number,
        party: inv.party?.name || "—",
        totalToman: fmt(total),
        paidToman: fmt(paid),
        remainingToman: fmt(remaining),
        paymentType: inv.paymentType === "CREDIT" ? "قرضی" : "نقدی (تسویه‌نشده)",
        dueDate: inv.dueDate ? toJalali(inv.dueDate) : null,
        invoiceDate: toJalali(inv.date),
        ageDays,
        agingBucket: bucket,
        overdue: inv.dueDate ? inv.dueDate.getTime() < now && remaining > 0 : ageDays > 90,
      };
    })
    .filter((r) => Number(r.remainingToman.replace(/,/g, "")) > 0);

  const totalRemaining = rows.reduce((sum, r) => sum + Number(r.remainingToman.replace(/,/g, "")), 0);
  const byBucket = new Map<string, number>();
  for (const r of rows) {
    byBucket.set(r.agingBucket, (byBucket.get(r.agingBucket) ?? 0) + Number(r.remainingToman.replace(/,/g, "")));
  }
  return {
    currency: "toman",
    count: rows.length,
    totalRemainingToman: fmt(totalRemaining),
    aging: Array.from(byBucket.entries()).map(([bucket, sum]) => ({
      bucket,
      remainingToman: fmt(sum),
    })),
    invoices: rows,
    note: "ترتیب از قدیمی‌ترین بدهی. مطالبات بالای ۹۰ روز را برای پیگیری/مراجعه حقوقی جدا کن.",
  };
}

// ============ Task 24-ASSISTANT: ابزارهای داده‌ای جدید ============

/** واریانت‌های جستجوی نام کالا — فاصله/نیم‌فاصله (موجودی «آب رنگ» «آب‌رنگ») */
function productSearchVariants(search: string): string[] {
  const s = toEnglishDigits(search).trim();
  if (!s) return [];
  return Array.from(
    new Set([s, s.replace(/\s+/g, "\u200c"), s.replace(/[\u200c\s]+/g, "")])
  ).filter(Boolean);
}

// ============ Tool: query_top_products (پرفروش‌ترین کالاها) ============
async function toolQueryTopProducts(tenantId: string, args: Record<string, unknown>) {
  const period = toStr(args.period, "this_month");
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 10)), 20);
  const range = jalaliPeriodRange(period);
  const dateFilter: Record<string, Date> = {};
  if (range.start) dateFilter.gte = range.start;
  if (range.end) dateFilter.lt = range.end;
  const items = await db.invoiceItem.findMany({
    where: {
      productId: { not: null },
      invoice: {
        tenantId,
        type: "SALE",
        deletedAt: null,
        status: { notIn: ["DRAFT", "CANCELLED", "RESERVED"] },
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
    },
    select: { productId: true, quantity: true, total: true },
    take: 5000,
  });
  if (items.length === 0) {
    return {
      count: 0,
      currency: "toman",
      periodLabel: range.label,
      products: [],
      note: "در این بازه فروشی ثبت نشده است.",
    };
  }
  const agg = new Map<string, { qty: number; revenueRial: bigint }>();
  for (const it of items) {
    const pid = it.productId ?? "";
    const cur = agg.get(pid) ?? { qty: 0, revenueRial: 0n };
    cur.qty += it.quantity;
    cur.revenueRial += BigInt(it.total ?? 0n);
    agg.set(pid, cur);
  }
  const top = Array.from(agg.entries())
    .sort((a, b) => Number(b[1].revenueRial - a[1].revenueRial))
    .slice(0, limit);
  const products = await db.product.findMany({
    where: { id: { in: top.map(([pid]) => pid) }, tenantId, deletedAt: null },
    select: { id: true, name: true, sku: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p]));
  return {
    count: top.length,
    currency: "toman",
    periodLabel: range.label,
    products: top.map(([pid, v], i) => ({
      rank: i + 1,
      product: pMap.get(pid)?.name ?? "—",
      sku: pMap.get(pid)?.sku ?? "",
      soldQty: Math.round(v.qty * 100) / 100,
      revenueToman: fmt(Math.floor(Number(v.revenueRial) / 10)),
    })),
    note: "ترتیب بر اساس مبلغ فروش (تومان). اقلام فاکتورهای پیش‌نویس/باطل/رزرو لحاظ نمی‌شوند.",
  };
}

// ============ Tool: query_top_debtors (بیشترین بدهکاران) ============
async function toolQueryTopDebtors(tenantId: string, args: Record<string, unknown>) {
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 10)), 20);
  const grouped = await db.invoice.groupBy({
    by: ["partyId"],
    where: {
      tenantId,
      type: "SALE",
      deletedAt: null,
      status: { in: ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] },
    },
    _sum: { total: true, paidAmount: true },
    _count: { id: true },
  });
  if (grouped.length === 0) {
    return { count: 0, currency: "toman", debtors: [], note: "هیچ بدهی بازی نیست." };
  }
  const rows = grouped
    .map((g) => ({
      partyId: g.partyId,
      remainingRial: BigInt(g._sum.total ?? 0n) - BigInt(g._sum.paidAmount ?? 0n),
      invoiceCount: g._count.id,
    }))
    .filter((r) => r.remainingRial > 0n)
    .sort((a, b) => Number(b.remainingRial - a.remainingRial))
    .slice(0, limit);
  if (rows.length === 0) {
    return { count: 0, currency: "toman", debtors: [], note: "همه فاکتورهای باز تسویه شده‌اند." };
  }
  const parties = await db.party.findMany({
    where: { id: { in: rows.map((r) => r.partyId) } },
    select: { id: true, name: true, mobile: true },
  });
  const pMap = new Map(parties.map((p) => [p.id, p]));
  const totalRemainingToman = rows.reduce((s, r) => s + Number(r.remainingRial) / 10, 0);
  return {
    count: rows.length,
    currency: "toman",
    totalRemainingToman: fmt(Math.floor(totalRemainingToman)),
    debtors: rows.map((r, i) => ({
      rank: i + 1,
      party: pMap.get(r.partyId)?.name ?? "—",
      mobile: pMap.get(r.partyId)?.mobile ?? "",
      remainingToman: fmt(Math.floor(Number(r.remainingRial) / 10)),
      invoiceCount: r.invoiceCount,
    })),
    note: "بدهکاران بر اساس مانده فاکتورهای تسویه‌نشده فروش. برای پیگیری سریع‌تر از گزارش سن فاکتور استفاده کنید.",
  };
}

// ============ Tool: query_profit_report (گزارش سود تفصیلی) ============
async function toolQueryProfitReport(tenantId: string, args: Record<string, unknown>) {
  const period = toStr(args.period, "this_month");
  const range = jalaliPeriodRange(period);
  const dateFilter: { gte?: Date; lt?: Date } = {};
  if (range.start) dateFilter.gte = range.start;
  if (range.end) dateFilter.lt = range.end;
  const hasRange = Boolean(range.start);
  const finalOnly = { notIn: ["DRAFT", "CANCELLED", "RESERVED"] };

  const [salesAgg, purchAgg, expAgg] = await Promise.all([
    db.invoice.aggregate({
      where: { tenantId, type: "SALE", deletedAt: null, status: finalOnly, ...(hasRange ? { date: dateFilter } : {}) },
      _sum: { subtotal: true, tax: true, total: true },
      _count: { id: true },
    }),
    db.invoice.aggregate({
      where: { tenantId, type: "PURCHASE", deletedAt: null, status: finalOnly, ...(hasRange ? { date: dateFilter } : {}) },
      _sum: { subtotal: true, tax: true, total: true },
      _count: { id: true },
    }),
    db.expenseEntry.aggregate({
      where: { tenantId, type: "EXPENSE", ...(hasRange ? { date: dateFilter } : {}) },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const salesNetT = toToman(salesAgg._sum?.subtotal ?? null);
  const vatSalesT = toToman(salesAgg._sum?.tax ?? null);
  const salesCount = salesAgg._count?.id ?? 0;
  const purchNetT = toToman(purchAgg._sum?.subtotal ?? null);
  const vatPurchT = toToman(purchAgg._sum?.tax ?? null);
  const expT = toToman(expAgg._sum?.amount ?? null);
  const grossT = salesNetT - purchNetT;
  const netT = grossT - expT;
  const marginPct = salesNetT > 0 ? Math.round((netT / salesNetT) * 100) : 0;

  return {
    period,
    periodLabel: range.label,
    currency: "toman",
    sales: fmt(salesNetT),
    salesCount,
    purchases: fmt(purchNetT),
    expenses: fmt(expT),
    grossProfitToman: fmt(grossT),
    netProfitToman: fmt(netT),
    vatCollectedToman: fmt(vatSalesT),
    vatPaidToman: fmt(vatPurchT),
    margin: `${toPersianDigits(String(marginPct))}٪`,
    note: "سود ناخالص = فروش خالص − خرید خالص. سود خالص = ناخالص − هزینه‌ها. مالیات ارزش افزوده دار شماست و در سود لحاظ نشده.",
  };
}

// ============ Tool: query_inventory_value (ارزش موجودی انبار) ============
async function toolQueryInventoryValue(tenantId: string) {
  const stockAgg = await db.stockItem.groupBy({
    by: ["productId"],
    where: { tenantId },
    _sum: { quantity: true },
  });
  const qtyByProduct = new Map<string, number>();
  for (const s of stockAgg) {
    const q = s._sum.quantity ?? 0;
    if (q > 0) qtyByProduct.set(s.productId, q);
  }
  if (qtyByProduct.size === 0) {
    return {
      currency: "toman",
      productCount: 0,
      totalItems: 0,
      purchaseValueToman: fmt(0),
      saleValueToman: fmt(0),
      potentialProfitToman: fmt(0),
      topItems: [],
      note: "هنوز موجودی انباری ثبت نشده است — اولین رسید ورود را ثبت کنیم؟",
    };
  }
  const products = await db.product.findMany({
    where: { id: { in: Array.from(qtyByProduct.keys()) }, tenantId, deletedAt: null },
    select: { id: true, name: true, sku: true, unit: true, purchasePrice: true, salePrice: true },
  });
  let purchaseRial = 0;
  let saleRial = 0;
  const rows: Array<{
    product: string;
    sku: string;
    stock: number;
    purchaseValueToman: string;
    saleValueToman: string;
    _pv: number;
  }> = [];
  for (const p of products) {
    const qty = qtyByProduct.get(p.id) ?? 0;
    const pv = qty * Number(p.purchasePrice);
    const sv = qty * Number(p.salePrice);
    purchaseRial += pv;
    saleRial += sv;
    rows.push({
      product: p.name,
      sku: p.sku,
      stock: Math.round(qty * 100) / 100,
      purchaseValueToman: fmt(Math.floor(pv / 10)),
      saleValueToman: fmt(Math.floor(sv / 10)),
      _pv: pv,
    });
  }
  rows.sort((a, b) => b._pv - a._pv);
  const topItems = rows.slice(0, 5).map(({ _pv, ...r }) => {
    void _pv;
    return r;
  });
  const totalItems = Array.from(qtyByProduct.values()).reduce((s, v) => s + v, 0);
  return {
    currency: "toman",
    productCount: products.length,
    totalItems: Math.round(totalItems * 100) / 100,
    purchaseValueToman: fmt(Math.floor(purchaseRial / 10)),
    saleValueToman: fmt(Math.floor(saleRial / 10)),
    potentialProfitToman: fmt(Math.floor((saleRial - purchaseRial) / 10)),
    topItems,
    note: "ارزش به خرید = مجموع موجودی × قیمت خرید (بهای تمام‌شده). ارزش به فروش = موجودی × قیمت فروش (پتانسیل درآمد).",
  };
}

// ============ Tool: query_budget (وضعیت بودجه) ============
async function toolQueryBudget(tenantId: string) {
  const budgets = await db.budget.findMany({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { items: true },
  });
  if (budgets.length === 0) {
    return {
      currency: "toman",
      budgets: [],
      note: "هنوز بودجه‌ای تعریف نشده — از ماژول بودجه‌ریزی (گروه انبار و کالا) بسازید.",
    };
  }
  return {
    currency: "toman",
    budgets: budgets.map((b) => {
      const plannedRial = b.items.reduce((s, it) => s + Number(it.budgetAmount), 0);
      const actualRial = b.items.reduce((s, it) => s + Number(it.actualAmount), 0);
      return {
        title: b.title,
        fiscalYear: toPersianDigits(b.fiscalYear),
        planned: fmt(Math.floor(plannedRial / 10)),
        actual: fmt(Math.floor(actualRial / 10)),
        variance: fmt(Math.floor((plannedRial - actualRial) / 10)),
        itemCount: toPersianDigits(String(b.items.length)),
      };
    }),
    note: "انحراف مثبت یعنی زیر بودجه مانده (صرفه‌جویی)؛ منفی یعنی عبور از بودجه.",
  };
}

// ============ Tool: query_wallet (کیف پول پاداش) ============
async function toolQueryWallet(tenantId: string) {
  const TX_FA: Record<string, string> = {
    REFERRAL_BONUS: "پاداش دعوت دوست",
    BUG_REWARD: "پاداش گزارش باگ",
    WITHDRAWAL: "برداشت وجه",
    ADMIN_ADJUSTMENT: "تعدیل پشتیبانی",
    SIGNUP_GIFT: "هدیه ثبت‌نام",
  };
  const [agg, txs, pendingWithdrawals] = await Promise.all([
    db.walletTransaction.aggregate({
      where: { tenantId, status: { not: "CANCELED" } },
      _sum: { amountToman: true },
    }),
    db.walletTransaction.findMany({
      where: { tenantId, status: { not: "CANCELED" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { type: true, amountToman: true, balanceAfter: true, description: true, createdAt: true },
    }),
    db.withdrawalRequest.count({ where: { tenantId, status: "PENDING" } }),
  ]);
  const all = await db.walletTransaction.findMany({
    where: { tenantId, status: { not: "CANCELED" } },
    select: { amountToman: true },
    take: 2000,
  });
  const balance = agg._sum.amountToman ?? 0;
  const earned = all.filter((t) => t.amountToman > 0).reduce((s, t) => s + t.amountToman, 0);
  const withdrawn = all.filter((t) => t.amountToman < 0).reduce((s, t) => s - t.amountToman, 0);
  return {
    currency: "toman",
    balance: fmt(balance),
    totalEarned: fmt(earned),
    totalWithdrawn: fmt(withdrawn),
    pendingWithdrawals: toPersianDigits(String(pendingWithdrawals)),
    transactions: txs.map((t) => ({
      date: toJalali(t.createdAt),
      type: TX_FA[t.type] ?? t.type,
      amountToman: fmt(t.amountToman),
      balanceAfter: fmt(t.balanceAfter),
      description: t.description ?? "",
    })),
    note: "پاداش دعوت هر دوست (پس از خرید اشتراک او) = ۱٬۰۰۰٬۰۰۰ تومان · باگ تأییدشده = ۲۵۰ تا ۱٬۰۰۰ هزار تومان · حداقل برداشت ۵۰۰٬۰۰۰ تومان (کارت/شبا تا ۷۲ ساعت کاری).",
  };
}

/* ============================================================
 * Task 25-C — ابزارهای داده‌ای جدید (۱۰× دستیار حرفه‌ای)
 * ============================================================ */

const OPEN_INVOICE_STATUSES = ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"];

// ============ Tool: query_receivables_payables (مطالبات و بدهی با aging) ============
async function toolQueryReceivablesPayables(tenantId: string, args: Record<string, unknown>) {
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 10)), 20);
  const [sales, purchases] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId, type: "SALE", deletedAt: null, status: { in: OPEN_INVOICE_STATUSES } },
      include: { party: { select: { name: true } } },
      orderBy: { date: "asc" },
      take: 2000,
    }),
    db.invoice.findMany({
      where: { tenantId, type: "PURCHASE", deletedAt: null, status: { in: OPEN_INVOICE_STATUSES } },
      include: { party: { select: { name: true } } },
      orderBy: { date: "asc" },
      take: 2000,
    }),
  ]);

  const now = Date.now();
  const bucketOf = (date: Date): string => {
    const age = Math.floor((now - date.getTime()) / (24 * 60 * 60 * 1000));
    if (age <= 30) return "جاری (۰-۳۰ روز)";
    if (age <= 60) return "۳۱-۶۰ روزه";
    if (age <= 90) return "۶۱-۹۰ روزه";
    return "بیش از ۹۰ روز";
  };

  const agingMap = new Map<string, { receivable: number; payable: number }>();
  const partyMap = new Map<string, { receivable: number; payable: number }>();
  let receivableTotal = 0;
  let payableTotal = 0;

  for (const inv of sales) {
    const remaining = Number(inv.total) - Number(inv.paidAmount);
    if (remaining <= 0) continue;
    const toman = Math.floor(remaining / 10);
    receivableTotal += toman;
    const bucket = bucketOf(inv.date);
    const b = agingMap.get(bucket) ?? { receivable: 0, payable: 0 };
    b.receivable += toman;
    agingMap.set(bucket, b);
    const name = inv.party?.name || "—";
    const p = partyMap.get(name) ?? { receivable: 0, payable: 0 };
    p.receivable += toman;
    partyMap.set(name, p);
  }
  for (const inv of purchases) {
    const remaining = Number(inv.total) - Number(inv.paidAmount);
    if (remaining <= 0) continue;
    const toman = Math.floor(remaining / 10);
    payableTotal += toman;
    const bucket = bucketOf(inv.date);
    const b = agingMap.get(bucket) ?? { receivable: 0, payable: 0 };
    b.payable += toman;
    agingMap.set(bucket, b);
    const name = inv.party?.name || "—";
    const p = partyMap.get(name) ?? { receivable: 0, payable: 0 };
    p.payable += toman;
    partyMap.set(name, p);
  }

  const bucketOrder = ["جاری (۰-۳۰ روز)", "۳۱-۶۰ روزه", "۶۱-۹۰ روزه", "بیش از ۹۰ روز"];
  const aging = bucketOrder
    .filter((b) => agingMap.has(b))
    .map((b) => {
      const v = agingMap.get(b)!;
      return { bucket: b, receivableToman: fmt(v.receivable), payableToman: fmt(v.payable) };
    });

  const topParties = Array.from(partyMap.entries())
    .map(([name, v]) => ({
      party: name,
      receivableToman: fmt(v.receivable),
      payableToman: fmt(v.payable),
      netToman: fmt(v.receivable - v.payable),
    }))
    .sort((a, b) => Math.abs(Number(b.netToman.replace(/,/g, ""))) - Math.abs(Number(a.netToman.replace(/,/g, ""))))
    .slice(0, limit);

  if (receivableTotal === 0 && payableTotal === 0) {
    return {
      currency: "toman",
      receivableTotalToman: fmt(0),
      payableTotalToman: fmt(0),
      netToman: fmt(0),
      aging: [],
      topParties: [],
      note: "هیچ فاکتور تسویه‌نشده‌ای نیست — نه مطالبات باز دارید و نه بدهی باز.",
    };
  }

  return {
    currency: "toman",
    receivableTotalToman: fmt(receivableTotal),
    payableTotalToman: fmt(payableTotal),
    netToman: fmt(receivableTotal - payableTotal),
    aging,
    topParties,
    note: "مطالبات = فاکتورهای فروش تسویه‌نشده (پول مردم دست شما)؛ بدهی = فاکتورهای خرید تسویه‌نشده (پول شما دست دیگران). سن بدهی از تاریخ فاکتور محاسبه می‌شود؛ بازه‌های بالای ۹۰ روز را برای پیگیری/اقدام حقوقی جدا کنید.",
  };
}

// ============ Tool: query_cashflow (جریان نقدی دوره) ============
async function toolQueryCashflow(tenantId: string, args: Record<string, unknown>) {
  const period = toStr(args.period, "this_month");
  const range = jalaliPeriodRange(period);
  const dateFilter: Record<string, Date> = {};
  if (range.start) dateFilter.gte = range.start;
  if (range.end) dateFilter.lt = range.end;

  // ۱) مبنای سند حسابداری: گردش حساب صندوق (کد استاندارد 1101)
  const cashAccount = await db.account.findFirst({
    where: { tenantId, code: "1101", deletedAt: null },
    select: { id: true, name: true },
  });
  let inflows = 0;
  let outflows = 0;
  let basis = "";
  if (cashAccount) {
    const lines = await db.journalLine.findMany({
      where: {
        tenantId,
        accountId: cashAccount.id,
        journalEntry: {
          tenantId,
          deletedAt: null,
          status: { not: "REVERSED" },
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        },
      },
      select: { debit: true, credit: true },
      take: 5000,
    });
    for (const l of lines) {
      inflows += Number(l.debit) / 10;
      outflows += Number(l.credit) / 10;
    }
    basis = `سندهای حسابداری حساب «${cashAccount.name}» (صندوق) — بدهکار = دریافت نقدی، بستانکار = پرداخت نقدی`;
  }

  // ۲) اگر سندی نبود (auto-post خاموش) → تقریب از فاکتورهای نقدی و هزینه‌ها
  if (inflows === 0 && outflows === 0) {
    const [cashSales, cashPurchases, expenses] = await Promise.all([
      db.invoice.aggregate({
        where: {
          tenantId,
          type: "SALE",
          paymentType: "CASH",
          deletedAt: null,
          status: { notIn: ["DRAFT", "CANCELLED", "RESERVED"] },
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        },
        _sum: { total: true },
      }),
      db.invoice.aggregate({
        where: {
          tenantId,
          type: "PURCHASE",
          paymentType: "CASH",
          deletedAt: null,
          status: { notIn: ["DRAFT", "CANCELLED", "RESERVED"] },
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        },
        _sum: { total: true },
      }),
      db.expenseEntry.aggregate({
        where: { tenantId, type: "EXPENSE", ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}) },
        _sum: { amount: true },
      }),
    ]);
    inflows = toToman(cashSales._sum?.total ?? null);
    outflows = toToman(cashPurchases._sum?.total ?? null) + toToman(expenses._sum?.amount ?? null);
    basis = "تقریبی از فاکتورهای نقدی و هزینه‌های دوره (سند صندوقی در این بازه ثبت نشده — ثبت خودکار سند خاموش است)";
  }

  return {
    period: period === "this_month" ? undefined : period,
    periodLabel: range.label,
    currency: "toman",
    inflowsToman: fmt(Math.floor(inflows)),
    outflowsToman: fmt(Math.floor(outflows)),
    netCashToman: fmt(Math.floor(inflows - outflows)),
    basis,
    note: "خالص مثبت یعنی نقد در دوره اضافه شده. مالیات ارزش افزوده جزو گردش صندوق است چون واقعاً وصول/پرداخت می‌شود.",
  };
}

// ============ Tool: query_top_vendors (برترین تأمین‌کننده‌ها) ============
async function toolQueryTopVendors(tenantId: string, args: Record<string, unknown>) {
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 10)), 20);
  const grouped = await db.invoice.groupBy({
    by: ["partyId"],
    where: { tenantId, type: "PURCHASE", deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED", "RESERVED"] } },
    _sum: { total: true },
    _count: { id: true },
    orderBy: { _sum: { total: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return { count: 0, currency: "toman", vendors: [], note: "هنوز خریدی ثبت نشده است." };
  const parties = await db.party.findMany({
    where: { id: { in: grouped.map((g) => g.partyId) } },
    select: { id: true, name: true, code: true, mobile: true },
  });
  const partyMap = new Map(parties.map((p) => [p.id, p]));
  return {
    count: grouped.length,
    currency: "toman",
    vendors: grouped.map((g, i) => ({
      rank: i + 1,
      name: partyMap.get(g.partyId)?.name || "—",
      code: partyMap.get(g.partyId)?.code || "",
      mobile: partyMap.get(g.partyId)?.mobile || "",
      totalPurchasesToman: fmt(toToman(g._sum.total ?? null)),
      invoiceCount: g._count.id,
    })),
    note: "ترتیب بر اساس مبلغ کل خرید (فاکتورهای نهایی). برای مذاکره قیمت/تخفیف حجم خرید از همین لیست استفاده کنید.",
  };
}

// ============ Tool: query_party_balance (مانده طرف‌حساب مشخص) ============
async function toolQueryPartyBalance(tenantId: string, args: Record<string, unknown>) {
  const partyName = toStr(args.partyName ?? args.name ?? args.party ?? args.search);
  if (!partyName) {
    return { error: "نام طرف‌حساب (partyName) الزامی است — از کاربر بپرسید مانده چه کسی؟" };
  }
  const candidates = await db.party.findMany({
    where: { tenantId, deletedAt: null, name: { contains: partyName } },
    select: { id: true, name: true, code: true, type: true, mobile: true, creditLimit: true },
    take: 5,
  });
  if (candidates.length === 0) {
    return { error: `طرف‌حسابی با نام «${partyName}» پیدا نشد — بخشی از نام را امتحان کنید یا اول اضافه‌اش کنیم؟` };
  }
  const party =
    candidates.find((c) => c.name === partyName) ?? candidates.find((c) => c.name.includes(partyName)) ?? candidates[0];

  const [salesAgg, purchAgg, oldest] = await Promise.all([
    db.invoice.aggregate({
      where: { tenantId, partyId: party.id, type: "SALE", deletedAt: null, status: { in: OPEN_INVOICE_STATUSES } },
      _sum: { total: true, paidAmount: true },
      _count: { id: true },
    }),
    db.invoice.aggregate({
      where: { tenantId, partyId: party.id, type: "PURCHASE", deletedAt: null, status: { in: OPEN_INVOICE_STATUSES } },
      _sum: { total: true, paidAmount: true },
      _count: { id: true },
    }),
    db.invoice.findFirst({
      where: { tenantId, partyId: party.id, type: "SALE", deletedAt: null, status: { in: OPEN_INVOICE_STATUSES } },
      orderBy: { date: "asc" },
      select: { number: true, date: true, dueDate: true, total: true, paidAmount: true },
    }),
  ]);

  const receivable = Math.max(0, toToman(salesAgg._sum.total ?? null) - toToman(salesAgg._sum.paidAmount ?? null));
  const payable = Math.max(0, toToman(purchAgg._sum.total ?? null) - toToman(purchAgg._sum.paidAmount ?? null));
  const creditLimit = toToman(party.creditLimit);
  const remainingCredit = creditLimit > 0 ? creditLimit - receivable : null;

  return {
    currency: "toman",
    party: {
      name: party.name,
      code: party.code,
      type: party.type === "CUSTOMER" ? "مشتری" : party.type === "SUPPLIER" ? "تأمین‌کننده" : party.type,
      mobile: party.mobile || "",
    },
    receivableToman: fmt(receivable),
    payableToman: fmt(payable),
    netToman: fmt(receivable - payable),
    openSalesInvoiceCount: salesAgg._count.id,
    openPurchaseInvoiceCount: purchAgg._count.id,
    ...(creditLimit > 0 ? { creditLimitToman: fmt(creditLimit) } : {}),
    ...(remainingCredit !== null ? { remainingCreditToman: fmt(remainingCredit) } : {}),
    oldestOpenInvoice: oldest
      ? {
          number: oldest.number,
          date: toJalali(oldest.date),
          dueDate: oldest.dueDate ? toJalali(oldest.dueDate) : null,
          remainingToman: fmt(Math.max(0, toToman(oldest.total) - toToman(oldest.paidAmount))),
        }
      : null,
    note:
      receivable === 0 && payable === 0
        ? "این طرف‌حساب فاکتور تسویه‌نشده ندارد — مانده صفر است."
        : "مانده مثبت فروش = طلب شما از او (مطالبات)؛ مانده خرید = بدهی شما به او. سقف اعتباری از پرونده طرف‌حساب خوانده شد.",
  };
}

// ============ Tool: query_invoice_stats (آمار فاکتور این ماه vs ماه قبل) ============
async function toolQueryInvoiceStats(tenantId: string) {
  const thisRange = jalaliPeriodRange("this_month");
  const lastRange = jalaliPeriodRange("last_month");
  const mk = (r: { start?: Date; end?: Date }) => ({
    ...(r.start ? { gte: r.start } : {}),
    ...(r.end ? { lt: r.end } : {}),
  });
  const finalOnly = { notIn: ["DRAFT", "CANCELLED", "RESERVED"] };

  const [thisSale, lastSale, thisPurch, lastPurch] = await Promise.all([
    db.invoice.aggregate({
      where: { tenantId, type: "SALE", deletedAt: null, status: finalOnly, date: mk(thisRange) },
      _count: { id: true },
      _sum: { total: true },
    }),
    db.invoice.aggregate({
      where: { tenantId, type: "SALE", deletedAt: null, status: finalOnly, date: mk(lastRange) },
      _count: { id: true },
      _sum: { total: true },
    }),
    db.invoice.aggregate({
      where: { tenantId, type: "PURCHASE", deletedAt: null, status: finalOnly, date: mk(thisRange) },
      _count: { id: true },
      _sum: { total: true },
    }),
    db.invoice.aggregate({
      where: { tenantId, type: "PURCHASE", deletedAt: null, status: finalOnly, date: mk(lastRange) },
      _count: { id: true },
      _sum: { total: true },
    }),
  ]);

  const growth = (thisT: number, lastT: number): string => {
    if (lastT <= 0) return thisT > 0 ? "جدید (ماه قبل صفر)" : "—";
    const pct = Math.round(((thisT - lastT) / lastT) * 100);
    return `${pct >= 0 ? "+" : ""}${toPersianDigits(String(pct))}٪`;
  };

  const thisSaleT = toToman(thisSale._sum.total ?? null);
  const lastSaleT = toToman(lastSale._sum.total ?? null);
  const thisPurchT = toToman(thisPurch._sum.total ?? null);
  const lastPurchT = toToman(lastPurch._sum.total ?? null);

  return {
    currency: "toman",
    thisMonthLabel: thisRange.label,
    lastMonthLabel: lastRange.label,
    sales: {
      thisMonthCount: thisSale._count.id,
      lastMonthCount: lastSale._count.id,
      thisMonthToman: fmt(thisSaleT),
      lastMonthToman: fmt(lastSaleT),
      growthPercent: growth(thisSaleT, lastSaleT),
    },
    purchases: {
      thisMonthCount: thisPurch._count.id,
      lastMonthCount: lastPurch._count.id,
      thisMonthToman: fmt(thisPurchT),
      lastMonthToman: fmt(lastPurchT),
      growthPercent: growth(thisPurchT, lastPurchT),
    },
    note: "رشد = (این ماه − ماه قبل) ÷ ماه قبل. فاکتورهای پیش‌نویس/باطل/رزرو شمرده نمی‌شوند.",
  };
}

// ============ Tool: query_expense_breakdown (تفکیک هزینه‌ها + آستانه) ============
async function toolQueryExpenseBreakdown(tenantId: string, args: Record<string, unknown>) {
  const period = toStr(args.period, "this_month");
  const range = jalaliPeriodRange(period);
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 10)), 20);
  const minAmountToman = toNum(args.minAmount) > 0 ? Math.round(toNum(args.minAmount)) : null;
  const dateFilter: Record<string, Date> = {};
  if (range.start) dateFilter.gte = range.start;
  if (range.end) dateFilter.lt = range.end;

  const entries = await db.expenseEntry.findMany({
    where: { tenantId, type: "EXPENSE", ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}) },
    orderBy: { amount: "desc" },
    take: 500,
    select: { amount: true, date: true, category: true, vendor: true, description: true, status: true },
  });
  if (entries.length === 0) {
    return {
      period: period === "this_month" ? undefined : period,
      periodLabel: range.label,
      currency: "toman",
      count: 0,
      totalToman: fmt(0),
      ...(minAmountToman ? { minAmountToman: fmt(minAmountToman) } : {}),
      aboveCount: 0,
      byCategory: [],
      expenses: [],
      note: "در این بازه هزینه‌ای ثبت نشده است.",
    };
  }

  const CAT_FA: Record<string, string> = {
    MEALS: "غذا و رستوران",
    TRAVEL: "سفر",
    FUEL: "سوخت و کارت سوخت",
    OFFICE: "اداری و لوازم",
    CLIENT_MEETING: "جلسه با مشتری",
    SOFTWARE: "نرم‌افزار و اشتراک",
    OTHER: "سایر",
  };

  const totalToman = entries.reduce((s, e) => s + toToman(e.amount), 0);
  const byCat = new Map<string, number>();
  for (const e of entries) byCat.set(e.category, (byCat.get(e.category) ?? 0) + toToman(e.amount));

  const filtered = minAmountToman ? entries.filter((e) => toToman(e.amount) >= minAmountToman) : entries;

  return {
    period: period === "this_month" ? undefined : period,
    periodLabel: range.label,
    currency: "toman",
    count: entries.length,
    totalToman: fmt(totalToman),
    ...(minAmountToman ? { minAmountToman: fmt(minAmountToman), aboveCount: filtered.length } : {}),
    byCategory: Array.from(byCat.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, sum]) => ({
        category: CAT_FA[cat] ?? cat,
        totalToman: fmt(sum),
        sharePercent: `${toPersianDigits(String(Math.round((sum / totalToman) * 100)))}٪`,
      })),
    expenses: filtered.slice(0, limit).map((e) => ({
      date: toJalali(e.date),
      category: CAT_FA[e.category] ?? e.category,
      vendor: e.vendor || "",
      description: e.description || "",
      amountToman: fmt(toToman(e.amount)),
    })),
    note: "ترتیب ردیف‌ها بر اساس مبلغ (نزولی). سهم هر دسته از جمع هزینه‌های دوره محاسبه شده است.",
  };
}

// ============ Tool: query_slow_stock (کالاهای کم‌حرکت) ============
async function toolQuerySlowStock(tenantId: string, args: Record<string, unknown>) {
  const daysThreshold = Math.min(Math.max(7, Math.round(toNum(args.days) || 45)), 365);
  const limit = Math.min(Math.max(1, Math.round(toNum(args.limit) || 15)), 30);

  const [stockAgg, movements] = await Promise.all([
    db.stockItem.groupBy({
      by: ["productId"],
      where: { tenantId },
      _sum: { quantity: true },
    }),
    db.stockMovement.groupBy({
      by: ["productId"],
      where: { tenantId },
      _max: { date: true },
    }),
  ]);

  const qtyMap = new Map<string, number>();
  for (const s of stockAgg) {
    const q = s._sum.quantity ?? 0;
    if (q > 0) qtyMap.set(s.productId, q);
  }
  if (qtyMap.size === 0) {
    return {
      currency: "toman",
      daysThreshold,
      slowCount: 0,
      items: [],
      note: "هیچ کالایی موجودی مثبت ندارد — کالاهای کم‌حرکت معنا ندارد.",
    };
  }
  const lastMoveMap = new Map(movements.map((m) => [m.productId, m._max.date ?? null]));

  const products = await db.product.findMany({
    where: { id: { in: Array.from(qtyMap.keys()) }, tenantId, deletedAt: null },
    select: { id: true, name: true, sku: true, unit: true, purchasePrice: true, salePrice: true },
  });

  const now = Date.now();
  const rows = products
    .map((p) => {
      const last = lastMoveMap.get(p.id) ?? null;
      const daysIdle = last ? Math.floor((now - last.getTime()) / (24 * 60 * 60 * 1000)) : null; // null = هیچ حرکتی
      return {
        product: p.name,
        sku: p.sku,
        stock: Math.round((qtyMap.get(p.id) ?? 0) * 100) / 100,
        lastMovement: last ? toJalali(last) : "هیچ وقت (بدون حرکت)",
        daysIdle: daysIdle === null ? "بدون حرکت" : toPersianDigits(String(daysIdle)),
        stockValueToman: fmt(Math.floor(((qtyMap.get(p.id) ?? 0) * Number(p.purchasePrice)) / 10)),
        _sort: daysIdle === null ? Number.MAX_SAFE_INTEGER : daysIdle,
      };
    })
    .filter((r) => r._sort >= daysThreshold || r._sort === Number.MAX_SAFE_INTEGER)
    .sort((a, b) => b._sort - a._sort)
    .slice(0, limit)
    .map(({ _sort, ...r }) => {
      void _sort;
      return r;
    });

  return {
    currency: "toman",
    daysThreshold,
    slowCount: rows.length,
    items: rows,
    note:
      rows.length === 0
        ? `هیچ کالایی با موجودی مثبت که بیش از ${daysThreshold} روز حرکت نداشته باشد پیدا نشد — انبار پویاست.`
        : "کالاهای بدون حرکت اخیر = سرمایه خوابیده. برای تخفیف/بسته‌ای‌فروشی/توقف خرید مجدد اقدام کنید (می‌توانید بگویید «۲۰ درصد تخفیف روی کالای X بذار» تا من قیمت را کم کنم).",
  };
}

// ============ Tool: query_vat_summary (ارزش افزوده دوره) ============
async function toolQueryVatSummary(tenantId: string, args: Record<string, unknown>) {
  const period = toStr(args.period, "this_month");
  const range = jalaliPeriodRange(period);
  const dateFilter: Record<string, Date> = {};
  if (range.start) dateFilter.gte = range.start;
  if (range.end) dateFilter.lt = range.end;
  const finalOnly = { notIn: ["DRAFT", "CANCELLED", "RESERVED"] };

  const [salesAgg, purchAgg] = await Promise.all([
    db.invoice.aggregate({
      where: { tenantId, type: "SALE", deletedAt: null, status: finalOnly, ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}) },
      _sum: { subtotal: true, tax: true },
    }),
    db.invoice.aggregate({
      where: { tenantId, type: "PURCHASE", deletedAt: null, status: finalOnly, ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}) },
      _sum: { subtotal: true, tax: true },
    }),
  ]);

  const salesBase = toToman(salesAgg._sum.subtotal ?? null);
  const vatOutput = toToman(salesAgg._sum.tax ?? null);
  const purchBase = toToman(purchAgg._sum.subtotal ?? null);
  const vatInput = toToman(purchAgg._sum.tax ?? null);
  const vatDue = vatOutput - vatInput;

  return {
    period: period === "this_month" ? undefined : period,
    periodLabel: range.label,
    currency: "toman",
    salesBaseToman: fmt(salesBase),
    vatOutputToman: fmt(vatOutput),
    purchasesBaseToman: fmt(purchBase),
    vatInputToman: fmt(vatInput),
    vatDueToman: fmt(Math.max(0, vatDue)),
    ...(vatDue < 0 ? { creditToman: fmt(-vatDue) } : {}),
    note:
      "مانده قابل پرداخت = مالیات فروش (خروجی) − مالیات خرید (ورودی/اعتبار). اگر اعتبار شد، مازاد به دوره‌های بعد منتقل می‌شود. نرخ رسمی ۱۰٪ (از ۱۴۰۴). اظهارنامه فصلی تا ۱۵ روز بعد از پایان فصل.",
  };
}

// ============ Tool: query_profit_trend (روند سود ۶ ماه اخیر) ============
async function toolQueryProfitTrend(tenantId: string) {
  // پنجرهٔ ۶ ماه شمسی اخیر
  const now = new Date();
  const jy = getCurrentJalaliYear(now);
  const jm = getCurrentJalaliMonth(now);
  const months: Array<{ label: string; start: Date; end: Date }> = [];
  for (let i = 5; i >= 0; i--) {
    let y = jy;
    let m = jm - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const [sgy, sgm, sgd] = jalaliToGregorian(y, m, 1);
    const [egy, egm, egd] = jalaliToGregorian(nextY, nextM, 1);
    months.push({
      label: `${JALALI_MONTHS[m - 1]} ${toPersianDigits(String(y))}`,
      start: new Date(sgy, sgm - 1, sgd),
      end: new Date(egy, egm - 1, egd),
    });
  }

  const windowStart = months[0].start;
  const finalOnly = { notIn: ["DRAFT", "CANCELLED", "RESERVED"] };
  const [invoices, expenses] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId, deletedAt: null, status: finalOnly, date: { gte: windowStart } },
      select: { type: true, date: true, subtotal: true },
      take: 5000,
    }),
    db.expenseEntry.findMany({
      where: { tenantId, type: "EXPENSE", date: { gte: windowStart } },
      select: { date: true, amount: true },
      take: 5000,
    }),
  ]);

  const rows = months.map((m) => {
    let sales = 0;
    let purchases = 0;
    for (const inv of invoices) {
      if (inv.date >= m.start && inv.date < m.end) {
        const net = toToman(inv.subtotal);
        if (inv.type === "SALE") sales += net;
        else if (inv.type === "PURCHASE") purchases += net;
      }
    }
    let exp = 0;
    for (const e of expenses) {
      if (e.date >= m.start && e.date < m.end) exp += toToman(e.amount);
    }
    return { label: m.label, salesToman: fmt(sales), expensesToman: fmt(purchases + exp), profitToman: fmt(sales - purchases - exp), _p: sales - purchases - exp };
  });

  // نمودار متنی فشرده (کاراکترهای بلوکی متن — مجاز)
  const profits = rows.map((r) => r._p);
  const min = Math.min(...profits, 0);
  const max = Math.max(...profits, 0);
  const span = max - min || 1;
  const BLOCKS = "▁▂▃▄▅▆▇█";
  const trendLine = profits
    .map((p) => {
      const idx = Math.round(((p - min) / span) * (BLOCKS.length - 1));
      return BLOCKS[Math.max(0, Math.min(BLOCKS.length - 1, idx))];
    })
    .join("");

  return {
    currency: "toman",
    months: rows.map(({ _p, ...r }) => {
      void _p;
      return r;
    }),
    trendLine,
    note: "سود خالص هر ماه = فروش خالص − خرید خالص − هزینه‌ها (بدون مالیات ارزش افزوده که امانی است). نمودار متنی از قدیم‌ترین (چپ) به جدیدترین ماه (راست).",
  };
}

// ============ Tool: query_employee_count (تعداد کارکنان) ============
async function toolQueryEmployeeCount(tenantId: string) {
  const [total, active, byType] = await Promise.all([
    db.employee.count({ where: { tenantId, deletedAt: null } }),
    db.employee.count({ where: { tenantId, deletedAt: null, status: "ACTIVE" } }),
    db.employee.groupBy({
      by: ["contractType"],
      where: { tenantId, deletedAt: null },
      _count: { id: true },
    }),
  ]);
  const CONTRACT_FA: Record<string, string> = {
    PERMANENT: "دائم",
    PROBATION: "آزمایشی",
    TEMPORARY: "موقت",
  };
  return {
    currency: "toman",
    employeeCount: total,
    activeCount: active,
    byContractType: byType.map((g) => ({
      type: CONTRACT_FA[g.contractType] ?? g.contractType,
      count: toPersianDigits(String(g._count.id)),
    })),
    note:
      total === 0
        ? "هنوز کارمندی ثبت نشده — از ماژول حقوق و دستمزد (گروه مالی و بانک) اولین پرسنل را اضافه کنید."
        : "شمارش فقط پرسنل زنده (حذف‌نشده). فیش‌ها و بیمه در همان ماژول حقوق و دستمزد.",
  };
}

// ============ Tool: query_payroll_total (جمع حقوق آخرین دوره) ============
async function toolQueryPayrollTotal(tenantId: string) {
  const latest = await db.payroll.findFirst({
    where: { tenantId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true },
  });
  if (!latest) {
    return {
      currency: "toman",
      empty: true,
      payslipCount: 0,
      note: "هنوز هیچ فیش حقوقی ثبت نشده — دوره جدید را از ماژول حقوق و دستمزد بسازید.",
    };
  }
  const rows = await db.payroll.findMany({
    where: { tenantId, year: latest.year, month: latest.month },
    select: { baseSalary: true, insurance: true, tax: true, total: true, status: true },
  });
  const sum = (f: "baseSalary" | "insurance" | "tax" | "total") =>
    Math.floor(rows.reduce((s, r) => s + Number(r[f] ?? 0n), 0) / 10);
  const total = sum("total");
  return {
    currency: "toman",
    periodLabel: `${JALALI_MONTHS[latest.month - 1] ?? latest.month} ${toPersianDigits(String(latest.year))}`,
    payslipCount: rows.length,
    payrollTotalToman: fmt(total),
    baseSalaryToman: fmt(sum("baseSalary")),
    insuranceToman: fmt(sum("insurance")),
    taxToman: fmt(sum("tax")),
    ...(rows.length > 0 ? { averageToman: fmt(Math.floor(total / rows.length)) } : {}),
    note: "جمع خالص پرداختی آخرین دوره حقوق (پس از کسر بیمه و مالیات). فیش نهایی سند حسابداری «حقوق و دستمزد» می‌گیرد.",
  };
}

// ============ Tool: create_opening_balance_hint (راهنمای موجودی اولیه) ============
function toolOpeningBalanceHint() {
  return {
    title: "راهنمای ثبت موجودی اولیه (شروع دوره در هوش)",
    desc: "برای شروع صحیح دفاتر، موجودی اولیه را یک‌بار در ابتدای سال مالی ثبت می‌کنیم — بعدش همه‌چیز خودکار از فاکتورها جمع می‌شود.",
    steps: [
      "سال مالی را باز کنید: سایدبار → مالی و بانک → هسته حسابداری → مدیریت سال مالی (دوره جاری باید «جاری» باشد).",
      "موجودی اولیه کالاها: انبار و کالا → تعدیل موجودی هر کالا (یا رسید ورود) — از من هم می‌توانید بگویید «موجودی کالای X را ۵۰ کن» تا ثبت شود (کاردکس + بهای میانگین خودکار).",
      "مانده اولیه مشتری‌ها/تأمین‌کننده‌ها: مشتریان (CRM) → پرونده طرف‌حساب → «مانده اولیه» (openingBalance) — بدهی قبلی مشتری و طلب از تأمین‌کننده.",
      "موجودی بانک/صندوق: خزانه‌داری و چک → حساب بانکی جدید با موجودی افتتاحیه؛ تنخواه هم همان‌جاست.",
      "دارایی ثابت/روش‌های دیگر: اگر فایل اکسل دارید، ایمپورت هوشمند (ابزارهای پیشرفته → واردات و صادرکرد) کالا و طرف‌حساب‌ها را یک‌جا می‌آورد (تا ۱۰۰ هزار ردیف، cp1256).",
      "بعد از ثبت اولیه، یکبار بگویید «ارزش انبارم چقدره؟» و «مطالبات و بدهی‌هام چقدره؟» تا کنترل کنیم درست نشسته.",
    ],
    note: "موجودی اولیه فقط یک‌بار در شروع دوره ثبت می‌شود؛ ثبت‌های بعدی از فاکتورها/رسیدها خودکار به کاردکس و دفاتر می‌نشینند.",
  };
}

// ============ Tool: search_help (Task 21-D) ============
/** راهنمای نرم‌افزار — «چطور X را انجام دهم؟» از دانش‌نامه/راهنمای داخلی */
async function toolSearchHelp(question: string) {
  const q = question.trim();
  if (!q) return { error: "سوال راهنما (question) الزامی است" };
  // دانش‌نامه (RAG) — همان منبعی که سوپرادمین تغذیه می‌کند
  const knowledge = await buildKnowledgeContext(q);
  if (knowledge.contextText) {
    return {
      source: "knowledge-base",
      matchedTitles: knowledge.matchedTitles,
      excerpt: knowledge.contextText.slice(0, 4000),
      note: "این متن از اسناد راهنمای رسمی پلتفرم است — بر اساس آن پاسخ گام‌به‌گام بده.",
    };
  }
  // راهنمای داخلی ماژول‌ها — نگاشت کلیدواژه → ماژول (فال‌بک)
  const guide: Array<{ keys: string[]; module: string; how: string }> = [
    {
      keys: ["فاکتور قرضی", "نسیه", "الحساب", "اعتباری"],
      module: "invoices",
      how: "در فرم فاکتور (ثبت فاکتور یا فاکتور سریع) «نوع پرداخت» را روی «قرضی (نسیه)» بگذار و «تاریخ سررسید» شمسی را انتخاب کن؛ یا همین‌جا بگو تا من ثبتش کنم (create_credit_invoice).",
    },
    {
      keys: ["رزرو فاکتور", "پیش‌فاکتور سفارشی", "سفارش"],
      module: "invoices",
      how: "در فرم فاکتور دکمه «رزرو فاکتور» را بزن — فاکتور بدون خروج انبار و سند می‌ماند تا «ثبت نهایی»؛ یا از من بخواه (reserve_invoice).",
    },
    {
      keys: ["ویرایش فاکتور", "اصلاح فاکتور"],
      module: "invoices",
      how: "در لیست فاکتورها دکمه «ویرایش» هر ردیف، یا از من بگو شماره و تغییرات را تا edit_invoice اجرا کنم (سند و انبار خودکار تعدیل می‌شوند).",
    },
    {
      keys: ["کارتخوان", "پوز", "pos", "وصل کارتخوان", "اتصال کارتخوان", "پل کارتخوان"],
      module: "settings",
      how: "پل آماده هوش ۵ مرحله دارد: ۱) فایل hoosh-pos-bridge.js را از بسته هوش بردارید؛ ۲) Node LTS را از nodejs.org نصب کنید؛ ۳) بالای فایل USERNAME/PASSWORD (یا توکن از F12 → Console → localStorage.getItem(\"hoshhesab_user_token\")) و TERMINAL_ID را پر کنید؛ ۴) اجرا کنید و با حالت پیش‌فرض simulation تست بگیرید (فاکتور نقدی بزنید)؛ ۵) برای کارت‌کشیدن واقعی MODE=gateway و آدرس درایور کارتخوان را بدهید. فاکتور نقدی = شارژ خودکار = تسویه خودکار؛ ضد شارژ دوباره و ادامه در قطع اینترنت. مستندات کامل: docs/POS-INTEGRATION.md",
    },
    {
      keys: ["کیف پول", "wallet", "برداشت وجه", "برداشت پول", "پاداش نقدی", "برداشت"],
      module: "wallet",
      how: "کیف پول (سایدبار → گروه سیستم → کیف پول) پاداش‌های نقدی شماست: دعوت دوست پس از خرید اشتراک او = ۱٬۰۰۰٬۰۰۰ تومان، باگ تأییدشده = ۲۵۰ تا ۱٬۰۰۰ هزار تومان. برداشت ۴ مرحله دارد: ۱) ماژول کیف پول را باز کنید؛ ۲) دکمه «درخواست برداشت» را بزنید؛ ۳) شماره کارت ۱۶ رقمی یا شبا (IR + ۲۴ رقم) و نام صاحب حساب را وارد کنید (حداقل ۵۰۰٬۰۰۰ تومان)؛ ۴) پشتیبانی تا ۷۲ ساعت کاری کارت‌به‌کارت/شبا واریز می‌کند — شماره‌ها تا قبل از تأیید ماسک‌اند و پول بدون انقضاست.",
    },
    {
      keys: ["ایمپورت هوشمند", "ایمپورت", "افزودن گروهی کالا", "مهاجرت از هلو"],
      module: "data-import-export",
      how: "ایمپورت هوشمند (سایدبار → ابزارهای پیشرفته → واردات و صادرکرد): ۱) فایل CSV/Excel/TSV/TXT فارسی (حتی cp1256 ویندوزی) را بارگذاری کنید — کدگذاری خودکار؛ ۲) ستون‌ها را نگاشت دهید (نام/کد/قیمت خرید/فروش/موجودی/گروه اصلی و فرعی/توضیحات)؛ ۳) سطر «جمع کل» خودکار حذف می‌شود؛ ۴) تا ۱۰۰ هزار ردیف در یک فایل. ویزارد مهاجرت هلو/سپیدار/Excel هم همین‌جاست.",
    },
    {
      keys: ["دلار", "نرخ ارز", "طلا", "تگجو", "tgju", "همگامسازی قیمت", "همگام‌سازی قیمت"],
      module: "inventory",
      how: "ماژول انبار → «همگام‌سازی قیمت با نرخ بازار» (لنگر دلار/طلا) یا بخش ارز → دریافت نرخ‌ها؛ نرخ‌های جدید را query_currency به من نشان می‌دهد.",
    },
    {
      keys: ["مودیان", "سامانه مودیان", "ارسال صورتحساب"],
      module: "tax",
      how: "ماژول مالیات/مودیان → ارسال صورتحساب‌های الکترونیکی؛ وضعیت صف ارسال را query_modian به من نشان می‌دهد.",
    },
    {
      keys: ["درون‌ریزی", "ایمپورت فایل", "بارگذاری فایل", "اکسل", "excel", "csv", "هلو", "سپیدار"],
      module: "data-import",
      how: "ماژول درون‌ریزی/برون‌بری → بارگذاری CSV/Excel (پشتیبانی cp1256 و هدر فارسی) با نگاشت خودکار ستون‌ها و سقف ۱۰۰ هزار ردیف؛ سطر «جمع کل» خودکار حذف می‌شود.",
    },
    {
      keys: ["چک", "صیادی", "خزانه"],
      module: "treasury",
      how: "ماژول خزانه → چک‌های دریافتی/پرداختی با تاریخ سررسید و وضعیت صیادی.",
    },
    // ─── Task 23-E: نقشه کامل ماژول‌ها — «X کجاست / کاراییش چیه» ───
    {
      keys: ["کجاست", "کجا میتونم", "کجا میتوانم", "برو به", "باز کن"],
      module: "navigate",
      how: "برای رفتن به هر بخش فقط نامش را بگو (مثلاً «برو به انبار») — خودم همان‌جا هدایت می‌شوی.",
    },
    {
      keys: ["انبار کجاست", "موجودی کجاست", "کاردکس کجاست", "ماژول انبار"],
      module: "inventory",
      how: "ماژول «انبار» در منوی اصلی: موجودی لحظه‌ای هر کالا در هر انبار، رسید ورود/خروج/انتقال، هشدار کم‌موجودی، قیمت دلاری کالا و همگام‌سازی با نرخ بازار.",
    },
    {
      keys: ["crm کجاست", "مشتری ها کجاست", "طرف حساب کجا", "باشگاه مشتری"],
      module: "crm",
      how: "ماژول «طرف‌حساب‌ها/CRM»: پرونده هر مشتری با مانده، سقف اعتباری، سابقه خرید، امتیاز وفاداری و قیف فروش.",
    },
    {
      keys: ["گزارش کجاست", "داشبورد کجاست", "تراز کجاست", "سود کجاست"],
      module: "reports-builder",
      how: "ماژول «گزارش‌ها»: داشبورد مدیریتی، تراز آزمایشی، دفاتر قانونی و گزارش‌ساز کشیدن‌ورهاکردن با خروجی اکسل/PDF.",
    },
    {
      keys: ["حقوق کجاست", "فیش کجاست", "پرسنل کجا", "بیمه کجاست"],
      module: "payroll",
      how: "ماژول «حقوق و دستمزد»: فیش حقوقی با مالیات پلکانی و بیمه، عیدی، سنوات، مرخصی و پرتال کارکنان.",
    },
    {
      keys: ["دستیار کجاست", "هوش یار کجاست", "صوتی کجاست", "چطور صوتی"],
      module: "ai",
      how: "همین پنجره! دکمه میکروفون برای حالت صوتی فارسی، آپلود عکس/فایل برای تحلیل، و من در هر ماژولی هم کنار دسترس هستم (دکمه دستیار).",
    },
    {
      keys: ["دعوت کجاست", "رفرال کجاست", "پاداش کجاست", "امتیاز کجاست", "وفاداری کجا", "دعوت دوستان", "کد دعوت", "لیدربورد", "مسابقه ماهانه"],
      module: "referral",
      how: "دعوت دوستان (سایدبار → گروه سیستم → دعوت دوستان): ۱) کد دعوت اختصاصی یا لینک ?ref=CODE خود را کپی کنید؛ ۲) برای دوستان بفرستید تا با همان لینک ثبت‌نام کنند؛ ۳) وقتی دوست اشتراک خرید، ۱٬۰۰۰٬۰۰۰ تومان خودکار به کیف پول شما می‌نشیند و دوستتان ۳ روز رایگان اضافه می‌گیرد (تریال ۲۸ روزه)؛ ۴) لیدربورد ماهانه: نفرات ۱/۲/۳ ماهِ هر ماه ۳۰/۲۰/۱۰ روز پلن حرفه‌ای رایگان می‌گیرند.",
    },
    {
      keys: ["باگ کجاست", "گزارش باگ", "شکار باگ", "باگ بفرستم", "باگ"],
      module: "bug-report",
      how: "گزارش باگ (سایدبار → گروه راهنما → گزارش باگ): ۱) باگ را با مرحله‌های دقیق بازتولید و توضیح ثبت کنید؛ ۲) اسکرین‌شات پیوست کنید — پاداش را بالا می‌برد؛ ۳) شدت را درست انتخاب کنید؛ ۴) بعد از «تأیید پشتیبانی» پاداش نقدی ۲۵۰ تا ۱٬۰۰۰ هزار تومان خودکار به کیف پول می‌نشیند.",
    },
    {
      keys: ["ووکامرس کجاست", "دیجی کالا کجاست", "فروشگاه آنلاین کجا", "باسلام"],
      module: "integrations",
      how: "ماژول «اتصالات/فروشگاه آنلاین»: ووکامرس، دیجی‌کالا و باسلام — همگام‌سازی محصولات و سفارش‌ها با انبار و فاکتور.",
    },
    {
      keys: ["کاراییش چیه", "کاراییش چیست", "چیکار میکنه", "چه کاری میکند", "چی کار میکنه"],
      module: "navigate",
      how: "نام بخش را بگو تا هم کارایی‌اش را توضیح بدهم و هم مستقیم همان‌جا ببرمت — مثلاً «انبار کاراییش چیه؟»",
    },
  ];
  const norm = toEnglishDigits(q).replace(/[\u200c\s]+/g, " ").toLowerCase();
  const hits = guide.filter((g) => g.keys.some((k) => norm.includes(k)));
  if (hits.length > 0) {
    return {
      source: "builtin-guide",
      topics: hits.map((h) => ({ module: h.module, how: h.how })),
      note: "راهنمای داخلی — گام‌ها را برای کاربر بازگو کن و پیشنهاد بده خودت همان کار را انجام دهی.",
    };
  }
  return {
    source: "none",
    note: "موضوع در راهنما پیدا نشد — از دانش حسابداری خودت راهنمایی کلی بده و نزدیک‌ترین ابزارت را پیشنهاد کن.",
  };
}

// ============ Module ============
const MODULE_BY_TOOL: Record<string, string> = {
  create_invoice: "invoices",
  create_expense: "expense-tracker",
  add_customer: "crm",
  add_product: "inventory",
  record_payment: "invoices",
  // Task 21-D
  edit_invoice: "invoices",
  reserve_invoice: "invoices",
  create_credit_invoice: "invoices",
  update_product_price: "inventory",
  // Task 24-ASSISTANT
  record_party_payment: "invoices",
  adjust_stock: "inventory",
  // Task 25-C
  set_product_discount: "inventory",
  create_reminder: "reminders",
  void_invoice_draft: "invoices",
};

// ============ Endpoint ============
export async function POST(req: NextRequest) {
  try {
    const authCtx = await getAuthContext(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    if (!authCtx) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    // Rate limit: 10 requests/minute per user
    const rateKey = `agent-chat:${authCtx.tenantId}:${authCtx.userId ?? ip}`;
    if (!rateLimit(rateKey, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: "سقف درخواست ایجنت پر شده است. یک دقیقه بعد تلاش کنید." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { messages } = body as { messages?: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "پیام الزامی است" }, { status: 400 });
    }
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }
    for (const m of messages) {
      if (m && typeof m.content === "string" && m.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { success: false, error: `حداکثر طول هر پیام ${MAX_MESSAGE_LENGTH} کاراکتر است` },
          { status: 400 }
        );
      }
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");

    // ─── ساخت پیام‌های API (system prompt به‌صورت role assistant — محدودیت SDK) ───
    const userCtx = await buildUserContext(req, authCtx.tenantId);
    const contextText = userCtx ? formatContextForPrompt(userCtx) : "";
    // FIX(v10-ai): دانش‌نامه — اسناد سوپرادمین به پرامپت ایجنت تزریق می‌شود
    const knowledge = await buildKnowledgeContext(lastUser?.content || "");
    const systemPrompt = buildAgentSystemPrompt(
      knowledge.contextText ? `${contextText}${knowledge.contextText}` : contextText
    );

    // FIX(v10-ai): انتخاب مسیر موتور — zai (SDK) یا custom (کلید سوپرادمین با role system)
    const providerSettings = await getAiProviderSettings();
    const useCustom =
      providerSettings.provider === "custom" &&
      providerSettings.baseUrl &&
      providerSettings.apiKey;

    const apiMessages: Array<{ role: "assistant" | "user" | "system"; content: string }> = useCustom
      ? [{ role: "system", content: systemPrompt }]
      : [{ role: "assistant", content: systemPrompt }];
    for (const m of messages) {
      if (m.role === "user" || m.role === "assistant") {
        if (typeof m.content === "string" && m.content.trim()) {
          apiMessages.push({ role: m.role, content: m.content });
        }
      }
    }

    // مسیر zai فقط وقتی لازم است ساخته می‌شود (مسیر سفارشی بدون SDK)
    const zai = useCustom ? null : await ZAI.create();

    const executedActions: ExecutedAction[] = [];
    const toolTrace: string[] = [];
    let mutationCount = 0;
    let navigate: { module: string; action?: string } | undefined;
    let finalReply = "";

    // ─── Task 23-E: موتور آفلاین — بدون API هم ایجنت اجرایی کار می‌کند ───
    // اگر LLM (zai SDK یا کلید سفارشی) در دسترس نباشد/خطا بدهد، پیام کاربر با
    // تشخیص‌گر نیت محلی parse می‌شود؛ همان TOOL_CALL سنتزی وارد همان حلقه/dispatch
    // واقعی می‌شود و نتیجه با قالب‌بند فارسی غنی برگردد — روی داده واقعی tenant.
    let offlineMode = false;
    let offlineAttempts = 0;
    let offlineIntent: OfflineIntent | null = null;
    const offlineResults: Array<{ tool: string; result: Record<string, unknown> }> = [];
    // v33-d: خروجی‌های موتور آفلاین v2 (اکشن UI + پیشنهادهای پیگیری)
    let offlineV2Action: AssistantAppAction | null = null;
    let offlineV2FollowUps: string[] | null = null;

    // ─── حلقه ایجنت ───
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const isLastIteration = iteration === MAX_TOOL_ITERATIONS - 1;
      const promptMessages = [...apiMessages];
      if (isLastIteration && iteration > 0) {
        promptMessages.push({
          role: "user",
          content:
            "SYSTEM_NOTE: سقف فراخوانی ابزار پر شده — دیگر هیچ TOOL_CALL ننویس و همین حالا پاسخ نهایی فارسی را با اطلاعات موجود بده.",
        });
      }

      let reply: string;
      try {
        reply = await callLLM(zai, promptMessages);
      } catch (llmErr) {
        // Task 23-E: موتور آفلاین — به‌جای خطای خالی، همان حلقه واقعی ابزار ادامه می‌یابد
        if (!offlineMode) {
          offlineMode = true;
          // v33-d: موتور آفلاین v2 — رجیستری ابزار/دانش/ریاضی روی دادهٔ واقعی tenant؛
          // اگر تطبیق مطمئن داشت، پاسخ نهایی همان‌جا ساخته می‌شود (+ اکشن UI و پیگیری‌ها)
          try {
            const v2 = await runOfflineAssistantV2(authCtx.tenantId, lastUser?.content || "");
            if (v2) {
              offlineV2Action = v2.action ?? null;
              offlineV2FollowUps = v2.followUps ?? null;
              finalReply = v2.text;
              break;
            }
          } catch (v2Err) {
            console.error("[agent-chat] offline v2 error:", v2Err);
          }
          offlineIntent = offlineParseIntent(lastUser?.content || "");
          const firstCall = offlineIntent.primary;
          if (firstCall && KNOWN_TOOLS.includes(firstCall.tool)) {
            offlineAttempts = 1;
            reply = `TOOL_CALL: ${JSON.stringify(firstCall)}`;
          } else {
            finalReply = formatOfflineReply(offlineIntent, [], {
              tenantName: userCtx?.tenantName,
            });
            break;
          }
        } else if (
          offlineAttempts === 1 &&
          offlineIntent?.secondary &&
          KNOWN_TOOLS.includes(offlineIntent.secondary.tool)
        ) {
          offlineAttempts = 2;
          reply = `TOOL_CALL: ${JSON.stringify(offlineIntent.secondary)}`;
        } else {
          finalReply = formatOfflineReply(offlineIntent!, offlineResults, {
            tenantName: userCtx?.tenantName,
          });
          break;
        }
      }

      const toolCall = parseToolCall(reply);
      if (!toolCall) {
        finalReply = reply.trim();
        break;
      }

      // ─── اجرای ابزار ───
      if (toolCall.invalid || !toolCall.tool) {
        apiMessages.push({ role: "assistant", content: "TOOL_CALL: (نامعتبر)" });
        apiMessages.push({
          role: "user",
          content:
            'TOOL_RESULT: {"error":"فرمت TOOL_CALL نامعتبر است. دقیقاً این شکل را رعایت کن: TOOL_CALL: {\\"tool\\":\\"query_kpis\\",\\"args\\":{}}"}',
        });
        continue;
      }

      const { tool, args } = toolCall;
      toolTrace.push(tool);
      apiMessages.push({
        role: "assistant",
        content: `TOOL_CALL: ${JSON.stringify({ tool, args })}`,
      });

      let result: Record<string, unknown>;

      try {
        // ── navigate: اجرا در فرانت‌اند ──
        if (tool === "navigate") {
          const moduleName = toStr(args.module, "dashboard");
          const action = toStr(args.action) || undefined;
          navigate = { module: moduleName, action };
          result = { navigated: true, module: moduleName, action: action ?? null };
        }
        // ── check_duplicate_invoice ──
        else if (tool === "check_duplicate_invoice") {
          const partyName = toStr(args.partyName);
          const amount = toNum(args.amount);
          const withinDays = Math.min(Math.max(1, Math.round(toNum(args.withinDays) || 7)), 90);
          const duplicates = await findDuplicateInvoices(
            authCtx.tenantId,
            partyName,
            amount,
            withinDays
          );
          result = {
            checked: true,
            withinDays,
            duplicatesFound: duplicates.length,
            duplicates,
            note:
              duplicates.length > 0
                ? "فاکتور مشابه پیدا شد — احتمال ثبت دوباره. حتماً به کاربر هشدار بده."
                : "فاکتور مشابهی در این بازه یافت نشد.",
          };
        }
        // ── ابزارهای کوئری ──
        else if (tool === "query_kpis") {
          result = await toolQueryKpis(authCtx.tenantId, args);
        } else if (tool === "query_invoices") {
          result = await toolQueryInvoices(authCtx.tenantId, args);
        } else if (tool === "query_parties") {
          result = await toolQueryParties(authCtx.tenantId, args);
        } else if (tool === "query_products") {
          result = await toolQueryProducts(authCtx.tenantId, args);
        } else if (tool === "query_expenses") {
          result = await toolQueryExpenses(authCtx.tenantId, args);
          executedActions.push({ tool, label: "جستجوی هزینه‌ها", success: true, summary: "هزینه‌ها بر اساس فیلتر بازیابی شد" });
        } else if (tool === "query_treasury") {
          result = await toolQueryTreasury(authCtx.tenantId);
          executedActions.push({ tool, label: "موجودی خزانه", success: true, summary: "موجودی حساب‌های بانکی خوانده شد" });
        } else if (tool === "query_modian") {
          result = await toolQueryModian(authCtx.tenantId);
          executedActions.push({ tool, label: "وضعیت مودیان", success: true, summary: "وضعیت صورتحساب‌های مودیان بررسی شد" });
        } else if (tool === "query_top_customers") {
          result = await toolQueryTopCustomers(authCtx.tenantId, args);
        } else if (tool === "query_warehouse") {
          result = await toolQueryWarehouse(authCtx.tenantId, args);
          executedActions.push({
            tool,
            label: "موجودی انبار",
            success: true,
            summary: "موجودی انبار به تفکیک کالا/انبار خوانده شد",
          });
        } else if (tool === "query_currency") {
          result = await toolQueryCurrency(authCtx.tenantId, args);
          executedActions.push({
            tool,
            label: "نرخ ارز و طلا",
            success: true,
            summary: "آخرین نرخ‌های ثبت‌شده بازار خوانده شد",
          });
        } else if (tool === "query_credit_receivables") {
          result = await toolQueryCreditReceivables(authCtx.tenantId, args);
          executedActions.push({
            tool,
            label: "مطالبات و بدهی قرضی",
            success: true,
            summary: "فاکتورهای تسویه‌نشده با سن بدهی محاسبه شد",
          });
        } else if (tool === "query_top_products") {
          result = await toolQueryTopProducts(authCtx.tenantId, args);
          executedActions.push({
            tool,
            label: "پرفروش‌ترین کالاها",
            success: true,
            summary: "پرفروش‌ترین کالاها در بازه محاسبه شد",
          });
        } else if (tool === "query_top_debtors") {
          result = await toolQueryTopDebtors(authCtx.tenantId, args);
          executedActions.push({
            tool,
            label: "بیشترین بدهکاران",
            success: true,
            summary: "بدهکاران بر اساس مانده فاکتورهای باز رتبه‌بندی شد",
          });
        } else if (tool === "query_profit_report") {
          result = await toolQueryProfitReport(authCtx.tenantId, args);
          executedActions.push({
            tool,
            label: "گزارش سود",
            success: true,
            summary: "سود ناخالص/خالص و اجزایش در بازه محاسبه شد",
          });
        } else if (tool === "query_inventory_value") {
          result = await toolQueryInventoryValue(authCtx.tenantId);
          executedActions.push({
            tool,
            label: "ارزش موجودی انبار",
            success: true,
            summary: "ارزش انبار به خرید/فروش محاسبه شد",
          });
        } else if (tool === "query_budget") {
          result = await toolQueryBudget(authCtx.tenantId);
          executedActions.push({
            tool,
            label: "وضعیت بودجه",
            success: true,
            summary: "برنامه/عملکرد/انحراف بودجه‌های فعال خوانده شد",
          });
        } else if (tool === "query_wallet") {
          result = await toolQueryWallet(authCtx.tenantId);
          executedActions.push({
            tool,
            label: "کیف پول",
            success: true,
            summary: "مانده کیف پول و تراکنش‌ها خوانده شد",
          });
        }
        // ── Task 25-C: ابزارهای کوئری جدید (با گارد safeQueryTool) ──
        else if (tool === "query_receivables_payables") {
          result = await safeQueryTool(() => toolQueryReceivablesPayables(authCtx.tenantId, args), "مطالبات و بدهی‌ها");
          executedActions.push({
            tool,
            label: "مطالبات و بدهی‌ها",
            success: !result.error,
            summary: "جمع مطالبات/بدهی با بازه‌های سن بدهی محاسبه شد",
          });
        } else if (tool === "query_cashflow") {
          result = await safeQueryTool(() => toolQueryCashflow(authCtx.tenantId, args), "جریان نقدی");
          executedActions.push({
            tool,
            label: "جریان نقدی",
            success: !result.error,
            summary: "دریافت‌ها، پرداخت‌ها و خالص جریان نقدی دوره محاسبه شد",
          });
        } else if (tool === "query_top_vendors") {
          result = await safeQueryTool(() => toolQueryTopVendors(authCtx.tenantId, args), "برترین تأمین‌کننده‌ها");
          executedActions.push({
            tool,
            label: "برترین تأمین‌کننده‌ها",
            success: !result.error,
            summary: "تأمین‌کننده‌ها بر اساس مبلغ خرید رتبه‌بندی شد",
          });
        } else if (tool === "query_party_balance") {
          result = await safeQueryTool(() => toolQueryPartyBalance(authCtx.tenantId, args), "مانده طرف‌حساب");
          executedActions.push({
            tool,
            label: "مانده طرف‌حساب",
            success: !result.error,
            summary: "مانده مطالبات/بدهی طرف‌حساب با سقف اعتباری خوانده شد",
          });
        } else if (tool === "query_invoice_stats") {
          result = await safeQueryTool(() => toolQueryInvoiceStats(authCtx.tenantId), "آمار فاکتورها");
          executedActions.push({
            tool,
            label: "آمار فاکتورها",
            success: !result.error,
            summary: "تعداد و مبلغ فاکتورهای این ماه در برابر ماه قبل مقایسه شد",
          });
        } else if (tool === "query_expense_breakdown") {
          result = await safeQueryTool(() => toolQueryExpenseBreakdown(authCtx.tenantId, args), "تفکیک هزینه‌ها");
          executedActions.push({
            tool,
            label: "تفکیک هزینه‌ها",
            success: !result.error,
            summary: "هزینه‌های دوره به تفکیک دسته و ردیف‌های بزرگ تحلیل شد",
          });
        } else if (tool === "query_slow_stock") {
          result = await safeQueryTool(() => toolQuerySlowStock(authCtx.tenantId, args), "کالاهای کم‌حرکت");
          executedActions.push({
            tool,
            label: "کالاهای کم‌حرکت",
            success: !result.error,
            summary: "کالاهای بدون حرکت اخیر انبار شناسایی شد",
          });
        } else if (tool === "query_vat_summary") {
          result = await safeQueryTool(() => toolQueryVatSummary(authCtx.tenantId, args), "مالیات ارزش افزوده");
          executedActions.push({
            tool,
            label: "مالیات ارزش افزوده",
            success: !result.error,
            summary: "مالیات فروش/خرید و مانده قابل پرداخت محاسبه شد",
          });
        } else if (tool === "query_profit_trend") {
          result = await safeQueryTool(() => toolQueryProfitTrend(authCtx.tenantId), "روند سود");
          executedActions.push({
            tool,
            label: "روند سود",
            success: !result.error,
            summary: "سود ماهانه ۶ ماه اخیر با نمودار متنی محاسبه شد",
          });
        } else if (tool === "query_employee_count") {
          result = await safeQueryTool(() => toolQueryEmployeeCount(authCtx.tenantId), "تعداد کارکنان");
          executedActions.push({
            tool,
            label: "کارکنان",
            success: !result.error,
            summary: "تعداد و ترکیب قرارداد کارکنان خوانده شد",
          });
        } else if (tool === "query_payroll_total") {
          result = await safeQueryTool(() => toolQueryPayrollTotal(authCtx.tenantId), "حقوق و دستمزد");
          executedActions.push({
            tool,
            label: "حقوق آخرین دوره",
            success: !result.error,
            summary: "جمع حقوق و اجزایش در آخرین دوره محاسبه شد",
          });
        } else if (tool === "create_opening_balance_hint") {
          result = toolOpeningBalanceHint();
        } else if (tool === "search_help") {
          result = await toolSearchHelp(toStr(args.question ?? args.query ?? args.search));
        }
        // ── ابزارهای ثبت (جهش‌دار) ──
        else if (MUTATION_TOOLS.has(tool)) {
          if (mutationCount >= MAX_MUTATIONS_PER_REQUEST) {
            result = {
              error: `سقف مجاز ${MAX_MUTATIONS_PER_REQUEST} عمل ثبت در هر درخواست پر شده است. بقیه را در پیام بعدی انجام بده.`,
            };
          } else {
            let outcome;
            let label = "";
            let summary = "";

            if (tool === "create_invoice") {
              // ── ضدروش: بررسی فاکتور تکراری قبل از ثبت ──
              const partyName = toStr(args.partyName);
              const itemsEstimate = Array.isArray(args.items)
                ? (args.items as Array<Record<string, unknown>>).reduce(
                    (s, it) => s + toNum(it.quantity ?? 1) * toNum(it.unitPrice ?? it.amount ?? 0),
                    0
                  )
                : 0;
              const amountEstimate = toNum(args.amount) || itemsEstimate;
              const duplicates =
                partyName && amountEstimate > 0
                  ? await findDuplicateInvoices(authCtx.tenantId, partyName, amountEstimate, 7)
                  : [];

              outcome = await createInvoiceAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              const totalToman = toNum(d.totalToman);
              const number = toStr(d.number);
              const invoiceType = toStr(d.type, "SALE") === "PURCHASE" ? "خرید" : "فروش";
              if (outcome.ok) {
                label = `فاکتور ${invoiceType} ${number} برای ${partyName || "طرف‌حساب"} به مبلغ ${toPersianDigits(
                  totalToman.toLocaleString("en-US")
                )} تومان ثبت شد`;
                summary = `شماره ${number} · مبلغ کل ${toPersianDigits(
                  totalToman.toLocaleString("en-US")
                )} تومان (شامل مالیات ${toPersianDigits(
                  toNum(d.taxToman).toLocaleString("en-US")
                )} تومان)`;
              } else {
                label = `ثبت فاکتور ${invoiceType} برای ${partyName || "طرف‌حساب"}`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              // نتیجه تکراری‌ها به مدل هم می‌رسد تا در پاسخ هشدار دهد
              result = {
                ...(outcome.ok
                  ? { created: true, invoice: outcome.data }
                  : { created: false, error: outcome.error }),
                duplicates,
                duplicateWarning:
                  duplicates.length > 0
                    ? "توجه: فاکتور(های) مشابهی برای همین طرف‌حساب با مبلغ نزدیک در ۷ روز اخیر ثبت شده — در پاسخ نهایی به کاربر هشدار بده."
                    : null,
              };
            } else if (tool === "create_expense") {
              outcome = await createExpenseAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              const amountToman = toNum(d.amountToman);
              const desc = toStr(d.description);
              if (outcome.ok) {
                label = `هزینه ${toPersianDigits(amountToman.toLocaleString("en-US"))} تومانی${
                  desc ? ` (${desc})` : ""
                } ثبت شد`;
                summary = `مبلغ ${toPersianDigits(
                  amountToman.toLocaleString("en-US")
                )} تومان · دسته ${toStr(d.category)}`;
              } else {
                label = "ثبت هزینه";
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { created: true, expense: outcome.data }
                : { created: false, error: outcome.error };
            } else if (tool === "add_customer") {
              outcome = await addCustomerAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              const name = toStr(d.name) || toStr(args.name);
              if (outcome.ok) {
                label = d.existing
                  ? `طرف‌حساب «${name}» از قبل موجود بود`
                  : `مشتری «${name}» با کد ${toStr(d.code)} اضافه شد`;
                summary = d.existing
                  ? "طرف‌حساب تکراری — از موجود استفاده شد"
                  : `کد ${toStr(d.code)} · نوع ${
                      toStr(d.type) === "SUPPLIER" ? "تأمین‌کننده" : "مشتری"
                    }`;
              } else {
                label = `افزودن طرف‌حساب «${name}»`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { created: !d.existing, existing: Boolean(d.existing), party: outcome.data }
                : { created: false, error: outcome.error };
            } else if (tool === "add_product") {
              outcome = await addProductAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              const name = toStr(d.name) || toStr(args.name);
              if (outcome.ok) {
                label = d.existing
                  ? `کالای «${name}» از قبل موجود بود`
                  : `کالای «${name}» با کد ${toStr(d.sku)} اضافه شد`;
                summary = d.existing
                  ? "کد SKU تکراری — از موجود استفاده شد"
                  : `کد ${toStr(d.sku)} · قیمت فروش ${toPersianDigits(
                      toNum(d.salePriceToman).toLocaleString("en-US")
                    )} تومان`;
              } else {
                label = `افزودن کالای «${name}»`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { created: !d.existing, existing: Boolean(d.existing), product: outcome.data }
                : { created: false, error: outcome.error };
            } else if (tool === "edit_invoice") {
              outcome = await editInvoiceAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              if (outcome.ok) {
                label = `فاکتور ${toStr(d.number)} ویرایش شد`;
                summary = `مبلغ ${toPersianDigits(
                  toNum(d.oldTotalToman).toLocaleString("en-US")
                )} ← ${toPersianDigits(
                  toNum(d.newTotalToman).toLocaleString("en-US")
                )} تومان · وضعیت ${toStr(d.status)}`;
              } else {
                label = `ویرایش فاکتور ${toStr(args.invoiceNumber) || toStr(args.number)}`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { updated: true, invoice: outcome.data }
                : { updated: false, error: outcome.error };
            } else if (tool === "reserve_invoice") {
              outcome = await reserveInvoiceAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              const totalToman = toNum(d.totalToman);
              if (outcome.ok) {
                label = `فاکتور رزرو ${toStr(d.number)} برای ${
                  toStr(args.partyName) || "طرف‌حساب"
                } ثبت شد`;
                summary = `رزرو (بدون اثر انبار/سند) · مبلغ ${toPersianDigits(
                  totalToman.toLocaleString("en-US")
                )} تومان — با «ثبت نهایی» از لیست فاکتورها فعال می‌شود`;
              } else {
                label = `رزرو فاکتور برای ${toStr(args.partyName) || "طرف‌حساب"}`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { created: true, reserved: true, invoice: outcome.data }
                : { created: false, error: outcome.error };
            } else if (tool === "create_credit_invoice") {
              outcome = await createCreditInvoiceAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              const totalToman = toNum(d.totalToman);
              if (outcome.ok) {
                label = `فاکتور قرضی ${toStr(d.number)} برای ${
                  toStr(args.partyName) || "طرف‌حساب"
                } ثبت شد`;
                summary = `نسیه با سررسید ${toStr(args.dueDate) || "—"} · مبلغ ${toPersianDigits(
                  totalToman.toLocaleString("en-US")
                )} تومان`;
              } else {
                label = `ثبت فاکتور قرضی برای ${toStr(args.partyName) || "طرف‌حساب"}`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { created: true, credit: true, invoice: outcome.data }
                : { created: false, error: outcome.error };
            } else if (tool === "update_product_price") {
              outcome = await updateProductPriceAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              if (outcome.ok) {
                label = `قیمت کالای «${toStr(d.name)}» به‌روزرسانی شد`;
                summary = `قیمت فروش ${toPersianDigits(
                  toNum(d.salePriceToman).toLocaleString("en-US")
                )} تومان · خرید ${toPersianDigits(
                  toNum(d.purchasePriceToman).toLocaleString("en-US")
                )} تومان`;
              } else {
                label = `به‌روزرسانی قیمت کالای «${toStr(args.name) || toStr(args.sku)}»`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { updated: true, product: outcome.data }
                : { updated: false, error: outcome.error };
            } else if (tool === "record_party_payment") {
              // Task 24-ASSISTANT: دریافت از مشتری / پرداخت به تأمین‌کننده بدون شماره فاکتور
              outcome = await recordPartyPaymentAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              const isPay = toStr(args.direction).toUpperCase() === "PAY";
              const amountToman = toNum(args.amount);
              if (outcome.ok) {
                label = `${isPay ? "پرداخت" : "دریافت"} ${toPersianDigits(
                  toNum(d.paymentToman || amountToman).toLocaleString("en-US")
                )} تومانی از/به «${toStr(d.partyName) || toStr(args.partyName)}» روی فاکتور ${toStr(
                  d.number
                )} ثبت شد`;
                summary = `وضعیت فاکتور: ${toStr(d.status)} · مانده ${toPersianDigits(
                  toNum(d.remainingToman).toLocaleString("en-US")
                )} تومان`;
              } else {
                label = `${isPay ? "پرداخت به" : "دریافت از"} «${toStr(args.partyName)}»`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { created: true, payment: outcome.data }
                : { created: false, error: outcome.error };
            } else if (tool === "adjust_stock") {
              // Task 24-ASSISTANT: تعدیل موجودی کالا (SET/ADD/SUBTRACT)
              outcome = await adjustStockAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              const modeFa =
                toStr(args.mode).toUpperCase() === "ADD"
                  ? "افزودن به موجودی"
                  : toStr(args.mode).toUpperCase() === "SUBTRACT"
                    ? "کاهش موجودی"
                    : "قرار دادن موجودی";
              if (outcome.ok) {
                label = `موجودی «${toStr(d.name)}» تغییر کرد (${modeFa}: ${toPersianDigits(
                  toNum(args.quantity).toLocaleString("en-US")
                )})`;
                summary = `موجودی ${toPersianDigits(
                  toNum(d.oldStock).toLocaleString("en-US")
                )} → ${toPersianDigits(
                  toNum(d.newStock).toLocaleString("en-US")
                )} در انبار پیش‌فرض · کاردکس ثبت شد`;
              } else {
                label = `تعدیل موجودی «${toStr(args.name) || toStr(args.sku)}»`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? {
                    updated: true,
                    stockAdjusted: true,
                    stockMoved: d.changed === true,
                    product: outcome.data,
                  }
                : { updated: false, error: outcome.error };
            } else if (tool === "set_product_discount") {
              // Task 25-C: تخفیف درصدی روی کالا (قیمت فروش جدید محاسبه و ثبت می‌شود)
              outcome = await setProductDiscountAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              if (outcome.ok) {
                label = `تخفیف ${toPersianDigits(String(toNum(args.percent)))}٪ روی «${toStr(d.name)}» اعمال شد`;
                summary = `قیمت فروش ${toPersianDigits(
                  toNum(d.oldSalePriceToman).toLocaleString("en-US")
                )} → ${toPersianDigits(
                  toNum(d.newSalePriceToman).toLocaleString("en-US")
                )} تومان`;
              } else {
                label = `اعمال تخفیف روی «${toStr(args.name) || toStr(args.sku)}»`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { updated: true, product: outcome.data }
                : { updated: false, error: outcome.error };
            } else if (tool === "create_reminder") {
              // Task 25-C: یادآور سررسید فاکتور باز / یادآور دلخواه
              outcome = await createReminderAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              if (outcome.ok) {
                label = `یادآور «${toStr(d.reminderTitle)}» ثبت شد`;
                summary = `نوع: ${toStr(d.typeLabel)} · سررسید ${
                  toStr(d.dueDate) ? toJalali(new Date(toStr(d.dueDate))) : "—"
                }${toStr(d.invoiceNumber) ? ` · فاکتور ${toStr(d.invoiceNumber)}` : ""}`;
              } else {
                label = "ثبت یادآور";
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { created: true, reminder: outcome.data }
                : { created: false, error: outcome.error };
            } else if (tool === "void_invoice_draft") {
              // Task 25-C: ابطال پیش‌نویس (فقط DRAFT)
              outcome = await voidInvoiceDraftAction(authCtx.tenantId, authCtx.userId, args, req);
              const d = outcome.data ?? {};
              if (outcome.ok) {
                label = `پیش‌نویس ${toStr(d.number)} ابطال شد`;
                summary = `طرف‌حساب ${toStr(d.partyName)} · مبلغ ${toPersianDigits(
                  toNum(d.totalToman).toLocaleString("en-US")
                )} تومان · وضعیت CANCELLED (بدون اثر سند/انبار)`;
              } else {
                label = `ابطال پیش‌نویس ${toStr(args.invoiceNumber) || toStr(args.number)}`;
                summary = outcome.error ?? "خطای ناشناخته";
              }
              result = outcome.ok
                ? { updated: true, voided: true, invoice: outcome.data }
                : { updated: false, error: outcome.error };
            } else {
              // record_payment
              const invoiceNumber = toStr(args.invoiceNumber);
              const amount = toNum(args.amount);
              const invoice = invoiceNumber
                ? await lookupInvoiceByNumber(authCtx.tenantId, invoiceNumber)
                : null;
              if (!invoice) {
                outcome = {
                  ok: false,
                  status: 404,
                  error: `فاکتوری با شماره ${invoiceNumber || "—"} یافت نشد`,
                };
                label = `ثبت پرداخت روی فاکتور ${invoiceNumber}`;
                summary = outcome.error ?? "خطای ناشناخته";
                result = { created: false, error: outcome.error };
              } else {
                outcome = await recordPaymentAction(
                  authCtx.tenantId,
                  authCtx.userId,
                  { invoiceId: invoice.id, amount },
                  req
                );
                const d = outcome.data ?? {};
                if (outcome.ok) {
                  label = `پرداخت ${toPersianDigits(
                    amount.toLocaleString("en-US")
                  )} تومانی روی فاکتور ${toStr(d.number)} ثبت شد`;
                  summary = `وضعیت جدید: ${toStr(d.status)} · مانده ${toPersianDigits(
                    toNum(d.remainingToman).toLocaleString("en-US")
                  )} تومان`;
                } else {
                  label = `ثبت پرداخت روی فاکتور ${toStr(d.number) || invoiceNumber}`;
                  summary = outcome.error ?? "خطای ناشناخته";
                }
                result = outcome.ok
                  ? { created: true, payment: outcome.data }
                  : { created: false, error: outcome.error };
              }
            }

            executedActions.push({
              tool,
              label,
              success: outcome.ok,
              summary,
              module: MODULE_BY_TOOL[tool],
              url: outcome.ok ? (outcome.data?.url as string | undefined) : undefined,
            });
            // FIX(v11): فقط عملیات «موفق» سقف و محافظ صداقت را مصرف می‌کند —
            // قبلاً تلاش ناموفق هم mutationCount را بالا می‌برد
            if (outcome.ok) mutationCount++;
          }
        } else {
          result = {
            error: `ابزار «${tool}» شناخته نشد. ابزارهای معتبر: ${KNOWN_TOOLS.join(", ")}`,
          };
        }
      } catch (err) {
        console.error(`[agent-chat] tool '${tool}' error:`, err);
        result = { error: `خطا در اجرای ابزار ${tool}` };
      }

      apiMessages.push({
        role: "user",
        content: `TOOL_RESULT: ${JSON.stringify(result)}`,
      });

      // Task 23-E: جمع‌آوری نتایج برای قالب‌بندی آفلاین
      if (offlineMode) {
        offlineResults.push({ tool, result });
      }
    }

    // اگر پس از حلقه هنوز پاسخ نهایی نهایی نیستیم (همه تکرارها ابزار بود)
    if (!finalReply) {
      if (offlineMode && offlineIntent) {
        // Task 23-E: در حالت آفلاین پاسخ نهایی را موتور محلی می‌سازد — بدون LLM
        finalReply = formatOfflineReply(offlineIntent, offlineResults, {
          tenantName: userCtx?.tenantName,
        });
      } else {
        finalReply = (
          await callLLM(zai, [
            ...apiMessages,
            {
              role: "user",
              content:
                "SYSTEM_NOTE: حلقه ابزار تمام شد — الان پاسخ نهایی فارسی مارک‌داون را بنویس و هیچ TOOL_CALL ننویس.",
            },
          ])
        ).trim();
      }
    }

    if (!finalReply) {
      finalReply = "متأسفم، در پردازش درخواست شما مشکلی پیش آمد. لطفاً دوباره تلاش کنید.";
    }

    // FIX(v11-honesty): محافظ صداقت — اگر پاسخ نهایی ادعای «ثبت شد» دارد ولی
    // هیچ عمل ثبت واقعی در این درخواست انجام نشده (mutationCount=0)، هشدار
    // صادقانه به پاسخ اضافه می‌شود تا کاربر فریب ادعای کاذب مدل را نخورد.
    if (mutationCount === 0) {
      const claimsDone = /(ثبت\s*شد|ایجاد\s*شد|انجام\s*شد|ساخته\s*شد|اضافه\s*شد|پرداخت\s*شد)/.test(
        finalReply
      );
      const lastUserContent = lastUser?.content ?? "";
      const wasCommand =
        /(فاکتور|هزینه|مشتری|کالا|پرداخت|دریافت)/.test(lastUserContent) &&
        /(ثبت|بزن|بساز|ایجاد|اضافه|انجام|پرداخت)/.test(lastUserContent);
      if (claimsDone && wasCommand) {
        finalReply +=
          "\n\n---\n**نکته مهم:** در این گفتگو هیچ سندی واقعاً در سیستم ثبت نشده است. لطفاً دوباره دستور خود را بفرستید (مثلاً: «فاکتور فروش ۲ میلیون تومانی برای مشتری X ثبت کن») تا ابزار ثبت اجرا شود، یا از ماژول مربوطه به‌صورت دستی ثبت کنید.";
      }
    }

    // ─── Audit log ───
    await auditLog({
      tenantId: authCtx.tenantId,
      userId: authCtx.userId,
      action: "AI_AGENT_CHAT",
      entity: "ai.agent",
      changes: {
        messageCount: messages.length,
        preview: lastUser?.content?.slice(0, 200) ?? "",
        toolTrace,
        mutationCount,
        executedActions: executedActions.length,
        contextLoaded: Boolean(userCtx),
      },
      req,
    });

    return NextResponse.json({
      success: true,
      reply: finalReply,
      executedActions,
      // Task 23-E: موتور پاسخ‌دهنده — local (آفلاین/بدون API) یا llm (ابری)
      engine: offlineMode ? "local" : "llm",
      // FIX(v10-ai): منابع دانش‌نامه استفاده‌شده — برای بج «دانش اختصاصی» در UI
      knowledgeSources: knowledge.matchedTitles,
      ...(navigate ? { navigate } : {}),
      // v33-d: اکشن اجرایی UI + پیشنهادهای پیگیری موتور آفلاین v2
      // (هم‌شکل فیلدهای اختیاری /api/ai/chat — UI همان را رندر می‌کند)
      ...(offlineV2Action ? { action: offlineV2Action } : {}),
      ...(offlineV2FollowUps ? { followUps: offlineV2FollowUps } : {}),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    console.error("AI agent-chat error:", msg);
    const isConfigError =
      msg.includes("missing X-Token header") || msg.includes("Configuration file not found");
    // خطای 429 سرویس بالادستی (سقف درخواست SDK) → همان 429 با پیام فارسی
    const isUpstreamRateLimit =
      msg.includes("429") || msg.toLowerCase().includes("too many requests");
    return NextResponse.json(
      {
        success: false,
        error: isConfigError
          ? "سرویس هوش مصنوعی در حال حاضر در دسترس نیست (خطای پیکربندی سرور). لطفاً بعداً تلاش کنید."
          : isUpstreamRateLimit
            ? "سقف درخواست سرویس هوش مصنوعی پر شده است. چند لحظه بعد دوباره تلاش کنید."
            : "خطا در ارتباط با ایجنت هوش مصنوعی. لطفاً دوباره تلاش کنید.",
      },
      { status: isConfigError ? 503 : isUpstreamRateLimit ? 429 : 500 }
    );
  }
}

// GET — health + ابزارهای موجود
export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: "/api/ai/agent-chat",
    tools: KNOWN_TOOLS,
    features: [
      "agentic-loop-max-8-iterations",
      "max-5-mutations-per-request",
      "duplicate-invoice-guard",
      "invoice-suite-edit-reserve-credit",
      "warehouse-currency-receivables-queries",
      "task24-assistant-suite-top-products-debtors-profit-inventory-value-budget-wallet",
      "task24-assistant-actions-party-payment-stock-adjust",
      "task25-assistant-10x-suite-receivables-payables-cashflow-party-balance-invoice-stats-expense-breakdown-slow-stock-vat-profit-trend-employees-payroll",
      "task25-assistant-10x-actions-set-product-discount-create-reminder-void-draft",
      "task25-assistant-opening-balance-hint-and-4-new-module-kb-entries",
      "task25-persian-word-amount-and-percent-parsing",
      "safe-query-tool-persian-error-guard",
      "offline-engine-local-fallback",
      "audit-logged",
      "auth-required",
      "rate-limit-10-per-minute",
    ],
  });
}
