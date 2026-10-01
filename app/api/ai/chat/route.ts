import { NextRequest, NextResponse } from "next/server";
import { rateLimit, auditLog, getTenant, getAuthContext } from "@/lib/auth";
import { buildUserContext, formatContextForPrompt } from "@/lib/ai-context";
// FIX(v10-ai): موتور یکپارچه — کلید/مدل دلخواه سوپرادمین + دانش‌نامه (RAG)
import { chatComplete, buildKnowledgeContext, getAiProviderSettings } from "@/lib/ai-provider";
// v33-d: موتور آفلاین v2 — رجیستری ابزار + دانش‌نامه + ماشین‌حساب (قبل از LLM)
import { runOfflineAssistantV2, buildOfflineFallbackReply } from "@/lib/offline-agent-v2";

/**
 * تقسیم متن به تکه‌های ~۴۰ نویسه‌ای برای استریم SSE شبیه‌سازی‌شده —
 * فقط روی مرز واژه (فاصله) تا هیچ واژه/نیم‌فاصله‌ای وسط نشکند.
 */
function chunkForOfflineStream(text: string, size = 40): string[] {
 const words = String(text || "").split(/(?<= )/); // حفظ فاصلهٔ انتهای هر واژه
 const chunks: string[] = [];
 let cur = "";
 for (const w of words) {
 if (cur && cur.length + w.length > size) {
 chunks.push(cur);
 cur = "";
 }
 cur += w;
 }
 if (cur) chunks.push(cur);
 return chunks.length > 0 ? chunks : [String(text || "")];
}

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 4000;
const MAX_MESSAGES = 30; // keep prompt size reasonable

// ============ Action intent detection ============
// تشخیص این که آیا پیام کاربر درخواست انجام یک اکشن است یا خیر
// و استخراج پارامترهای لازم برای ساخت action descriptor

interface DetectedActionIntent {
 type: "create_invoice" | "create_expense" | "add_customer" | "add_product" | "record_payment" | null;
 data: Record<string, unknown>;
 confidence: number;
}

// Persian/Arabic digit normalizer
function normalizeDigits(s: string): string {
 return s
.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
.replace(/[٬،]/g, ",");
}

// Parse amount from Persian text — supports million/billion/thousand
function parseAmount(text: string): number | null {
 const normalized = normalizeDigits(text);
 // Pattern: number followed by optional million/billion/thousand
 const match = normalized.match(/(\d[\d,]*)\s*(میلیون|میلیارد|هزار|میلیونم|میلیون‌م)?/);
 if (!match) return null;
 const raw = Number(match[1].replace(/,/g, ""));
 const unit = (match[2] || "").trim();
 let amount = raw;
 if (unit.startsWith("میلیارد")) amount = raw * 1_000_000_000;
 else if (unit.startsWith("میلیون")) amount = raw * 1_000_000;
 else if (unit.startsWith("هزار")) amount = raw * 1_000;
 return amount;
}

function detectActionIntent(message: string): DetectedActionIntent {
 const normalized = normalizeDigits(message).toLowerCase();
 const has = (kw: string) => normalized.includes(kw);

 // create_invoice: ثبت فاکتور فروش/خرید به [party] [amount]
 if (has("ثبت فاکتور") || has("فاکتور ثبت")) {
 const isPurchase = has("خرید");
 // Extract party name — pattern: "به X" or "از X" or "برای X"
 const partyMatch = message.match(/(?:به|از|برای)\s+([^\s،,]+(?:\s+[^\s،,]+){0,3})/);
 const partyName = partyMatch? partyMatch[1].trim(): "";
 const amount = parseAmount(message);

 // Items extraction — pattern: "X تا محصول" or "X عدد Y"
 // FIX(v11): regex روی متن نرمال‌شده (رقم فارسی→لاتین) — قبلاً «۲ تا» پارس نمی‌شد
 const items: Array<{ name: string; quantity: number; unitPrice?: number }> = [];
 const itemMatch = normalizeDigits(message).matchAll(/(\d+)\s*(?:تا|عدد|کیلو|متر)?\s*([^\s،,،]+(?:\s+[^\s،,،]+){0,2})/g);
 for (const m of itemMatch) {
 const qty = Number(m[1]);
 const name = m[2].trim();
 if (qty > 0 && name &&!["تومان", "ریال", "میلیون", "میلیارد", "هزار"].includes(name)) {
 items.push({ name, quantity: qty });
 }
 }

 return {
 type: "create_invoice",
 data: {
 type: isPurchase? "PURCHASE": "SALE",
 partyName,
 amount: amount || 0,
 items: items.slice(0, 5),
 },
 confidence: partyName || amount? 0.8: 0.5,
 };
 }

 // create_expense: ثبت هزینه... مبلغ X
 if ((has("ثبت هزینه") || has("هزینه ثبت")) &&!has("فاکتور")) {
 const amount = parseAmount(message);
 let category = "OTHER";
 if (has("بنزین") || has("سوخت")) category = "FUEL";
 else if (has("غذا") || has("ناهار") || has("شام")) category = "MEALS";
 else if (has("سفر") || has("مسافرت")) category = "TRAVEL";
 else if (has("نرم‌افزار") || has("لایسانس")) category = "SOFTWARE";
 else if (has("دفتر") || has("لوازم")) category = "OFFICE";

 // Extract description — text after "برای" or "به دلیل"
 const descMatch = message.match(/(?:برای|به دلیل)\s+(.+)/);
 const description = descMatch? descMatch[1].trim(): "";

 return {
 type: "create_expense",
 data: {
 amount: amount || 0,
 category,
 description,
 },
 confidence: amount? 0.85: 0.5,
 };
 }

 // add_customer: افزودن/ثبت مشتری/طرف‌حساب
 if (
 (has("افزودن") || has("اضافه") || has("ثبت")) &&
 (has("مشتری") || has("طرف حساب") || has("طرف‌حساب") || has("خریدار") || has("فروشنده") || has("تامین‌کننده"))
 ) {
 const isSupplier = has("تامین‌کننده") || has("تأمین‌کننده") || has("فروشنده") || has("خرید") === false && has("فروش");
 const nameMatch = message.match(/(?:به نام|بنام|نام)\s*:?\s*([^\n،,]+)/);
 const name = nameMatch? nameMatch[1].trim(): "";
 const mobileMatch = message.match(/(?:موبایل|تلفن|تماس)\s*:?\s*(\+?[\d\s-]+)/);
 const mobile = mobileMatch? mobileMatch[1].trim(): "";
 return {
 type: "add_customer",
 data: {
 name,
 mobile,
 type: isSupplier? "SUPPLIER": "CUSTOMER",
 },
 confidence: name? 0.85: 0.5,
 };
 }

 // add_product: افزودن محصول
 if (
 (has("افزودن") || has("اضافه") || has("ثبت")) &&
 (has("محصول") || has("کالا") || has("خدمت"))
 ) {
 const nameMatch = message.match(/(?:به نام|نام|محصول)\s*:?\s*([^\n،,]+)/);
 const name = nameMatch? nameMatch[1].trim(): "";
 const priceMatch = message.match(/(?:قیمت|بهای|مبلغ)\s*(?:فروش)?\s*:?\s*(\d[\d٬,]*)/);
 const salePrice = priceMatch? Number(normalizeDigits(priceMatch[1]).replace(/,/g, "")): 0;
 return {
 type: "add_product",
 data: {
 name,
 salePrice,
 unit: "عدد",
 },
 confidence: name? 0.8: 0.4,
 };
 }

 // record_payment: ثبت پرداخت/دریافت روی فاکتور
 if (has("ثبت پرداخت") || has("پرداخت فاکتور") || has("ثبت دریافت")) {
 const amount = parseAmount(message);
 const invoiceMatch = message.match(/(?:فاکتور|سند)\s*:?\s*(INV-[A-Z0-9-]+)/i);
 const invoiceNumber = invoiceMatch? invoiceMatch[1]: "";
 return {
 type: "record_payment",
 data: {
 amount: amount || 0,
 invoiceNumber,
 },
 confidence: amount && invoiceNumber? 0.85: 0.4,
 };
 }

 return { type: null, data: {}, confidence: 0 };
}

// ============ System Prompt base ============
const BASE_SYSTEM_PROMPT = `تو «هوش‌یار» هستی، دستیار هوشمند حسابداری نرم‌افزار ایرانی «هوش».

نقش شما:
- حسابدار ارشد و مشاور مالی شرکت کوچک و متوسط ایرانی
- متخصص حسابداری دوطرفه فارسی (کدینگ گروه/کل/معین/تفصیلی)
- آشنا به قوانین مالیاتی ایران (ارزش افزوده ۹/۱۵/۲۰٪، مالیات بر درآمد اشخاص حقیقی و حقوقی، ماده ۱۶۹)
- مسلط به سامانه مودیان و صورتحساب الکترونیکی
- آشنا به حقوق و دستمزد ایرانی (بیمه ۳۰٪، مالیات حقوق، سنوات، عیدی، حق مسکن)
- متخصص انبار و بهای تمام شده
- آشنا به چک‌های صیادی و خزانه‌داری
- آشنا به اتصال به ووکامرس، دیجی‌کالا، باسلام و سامانه مودیان

قواعد پاسخ‌گویی:
۰) **ممنوعیت فرافکنی (قانون اول):** هرگز نگو «باید از پلن مدیریت درست بشه» / «این کار از پنل مدیریت انجام می‌شود» — اگر کاری در دسترس هست، خودت انجامش بده یا دقیق و گام‌به‌گام راهنمایی کن. فقط کارهای ذاتاً ناممکن را با دلیل رد کن و نزدیک‌ترین جایگزین پیشنهاد بده.
۱) همیشه به فارسی روان و محترمانه پاسخ بده.
۲) اعداد را با ارقام فارسی بنویس (۱۲۳۴۵۶۷۸۹۰).
۳) مبالغ را به تومان نمایش بده (اگر ریال بود، تقسیم بر ۱۰).
۴) نرخ‌های ۱۴۰۳ و ۱۴۰۴ را ملاک قرار بده.
۵) مختصر، کاربردی و دقیق باش. از bullet و هدینگ (**) استفاده کن.
۶) در صورت نیاز، مثال عددی بزن.
۷) اگر سوال خارج از حوزه حسابداری بود، مودبانه هدایت کن.
۸) در پاسخ از مارک‌داون استفاده کن:
 - **bold** برای تاکید
 - - bullet برای لیست
 - | ستون | ستون | برای جدول (با خط جداکننده)
 - \`code\` برای کد یا شناسه
 - \`\`\`برای بلاک کد\`\`\`
۹) اگر کاربر خواست کاری انجام بدهی (مثلاً «فاکتور ثبت کن»، «مشتری اضافه کن»، «هزینه ثبت کن»)، پاسخ بده که این کار از کدام منو قابل انجام است و یک گزینهٔ «اجرای سریع» در UI ظاهر می‌شود.
۱۰) اگر کاربر دستور انجام کاری داد (ثبت/ساخت/اضافه کن/پرداخت کن...)، کوتاه بگو که این دستور قابل اجرای مستقیم است و اگر «حالت ایجنت» در هدر دستیار فعال است، فعالش کند تا هوش‌یار خودش ابزارها را صدا بزند و عمل را همان‌جا ثبت کند. سپس اگر اطلاعات ناقص بود بپرس.
۱۱) **صداقت اجرا (بحرانی):** در این حالت گفتگو، تو هیچ ابزاری برای ثبت واقعی نداری. هرگز ادعا نکن که سندی «ثبت شد/انجام شد» — به‌جایش بگو «برای ثبت واقعی، دکمه اجرای سریع را بزن یا حالت ایجنت را فعال کن». 
۱۲) **لینک ممنوع:** هرگز لینک/URL از خودت نساز (مثل /invoices/123) — چنین لینک‌هایی 404 می‌دهند. برای ارجاع به سند فقط شماره سند را بنویس؛ دکمه «مشاهده» را خود UI می‌سازد.

قابلیت‌های شما (به کاربر اطلاع بده اگر پرسید):
- پاسخ به سوالات حسابداری، مالیاتی، حقوقی
- تحلیل سلامت مالی و گزارش کسب‌وکار
- پیشنهاد کاهش هزینه و بهبود جریان نقدی
- محاسبه مالیات ارزش افزوده و بر درآمد
- محاسبه حقوق و دستمزد
- راهنمایی ثبت فاکتور خرید/فروش، هزینه، مشتری
- تحلیل تصویر فاکتور/رسید (VLM)
- تحلیل فایل CSV/Excel
- پیش‌بینی جریان نقدی
- دسته‌بندی هوشمند تراکنش‌ها
- تشخیص بانک از شماره کارت
- بررسی تقلب تراکنش
- اسکن OCR فاکتور

اگر داده‌های مالی واقعی کاربر را در «متن زمینه» دیدی، از آن استفاده کن تا پاسخ شخصی‌سازی‌شده بدهی (مثلاً «فروش این ماه شما X تومان بوده»).

متن زمینه (در صورت موجود بودن) در ابتدای conversation به‌صورت system message قرار می‌گیرد.`;

interface ChatMessage {
 role: "system" | "user" | "assistant";
 content: string;
}

/**
 * تبدیل ReadableStream خام از SDK به SSE استاندارد با فرمت `data: {...}\n\n`.
 */
function toSSEStream(
 upstream: ReadableStream<Uint8Array> | NodeJS.ReadableStream | unknown,
 controller: ReadableStreamDefaultController
) {
 const encoder = new TextEncoder();
 const decoder = new TextDecoder();

 const push = (text: string) => {
 if (!text) return;
 const payload = `data: ${JSON.stringify({ delta: text })}\n\n`;
 controller.enqueue(encoder.encode(payload));
 };

 if (upstream && typeof (upstream as ReadableStream<Uint8Array>).getReader === "function") {
 const reader = (upstream as ReadableStream<Uint8Array>).getReader();
 let buffer = "";
 const pump = async () => {
 try {
 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split("\n");
 buffer = lines.pop()?? "";
 for (const line of lines) {
 const trimmed = line.trim();
 if (!trimmed) continue;
 if (trimmed.startsWith("data:")) {
 const inner = trimmed.slice(5).trim();
 if (inner === "[DONE]") continue;
 try {
 const json = JSON.parse(inner);
 const piece =
 json?.choices?.[0]?.delta?.content??
 json?.choices?.[0]?.message?.content??
 json?.delta??
 "";
 if (typeof piece === "string") push(piece);
 } catch {
 push(inner);
 }
 } else if (!trimmed.startsWith(":") &&!trimmed.startsWith("event:")) {
 push(trimmed);
 }
 }
 }
 if (buffer.trim()) push(buffer.trim());
 controller.enqueue(encoder.encode("data: [DONE]\n\n"));
 controller.close();
 } catch (err) {
 controller.error(err);
 }
 };
 void pump();
 return;
 }

 if (upstream && typeof (upstream as NodeJS.ReadableStream).on === "function") {
 const stream = upstream as NodeJS.ReadableStream;
 let buffer = "";
 stream.on("data", (chunk: Buffer | string) => {
 buffer += typeof chunk === "string"? chunk: chunk.toString("utf-8");
 const lines = buffer.split("\n");
 buffer = lines.pop()?? "";
 for (const line of lines) {
 const trimmed = line.trim();
 if (!trimmed) continue;
 if (trimmed.startsWith("data:")) {
 const inner = trimmed.slice(5).trim();
 if (inner === "[DONE]") continue;
 try {
 const json = JSON.parse(inner);
 const piece =
 json?.choices?.[0]?.delta?.content??
 json?.choices?.[0]?.message?.content??
 "";
 if (typeof piece === "string") push(piece);
 } catch {
 push(inner);
 }
 } else if (!trimmed.startsWith(":")) {
 push(trimmed);
 }
 }
 });
 stream.on("end", () => {
 if (buffer.trim()) push(buffer.trim());
 controller.enqueue(encoder.encode("data: [DONE]\n\n"));
 controller.close();
 });
 stream.on("error", (err: unknown) => controller.error(err));
 return;
 }

 controller.enqueue(encoder.encode("data: [DONE]\n\n"));
 controller.close();
}

export async function POST(req: NextRequest) {
 try {
 const authCtx = await getAuthContext(req);
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 // Auth required
 if (!authCtx) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 // Rate limit: 10 requests/minute per user (tenantId)
 const rateKey = `chat:${authCtx.tenantId}:${authCtx.userId?? ip}`;
 if (!rateLimit(rateKey, 10, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست چت پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { messages, stream } = body as {
 messages?: ChatMessage[];
 stream?: boolean;
 };

 if (!Array.isArray(messages) || messages.length === 0) {
 return NextResponse.json(
 { success: false, error: "پیام الزامی است" },
 { status: 400 }
 );
 }

 // اعتبارسنجی طول و تعداد پیام
 if (messages.length > MAX_MESSAGES) {
 // فقط N پیام اخیر را نگه دار
 messages.splice(0, messages.length - MAX_MESSAGES);
 }
 for (const m of messages) {
 if (
 m &&
 typeof m.content === "string" &&
 m.content.length > MAX_MESSAGE_LENGTH
 ) {
 return NextResponse.json(
 {
 success: false,
 error: `حداکثر طول هر پیام ${MAX_MESSAGE_LENGTH} کاراکتر است`,
 },
 { status: 400 }
 );
 }
 }

 const lastUser = [...messages].reverse().find((m) => m.role === "user");
 const tenant = await getTenant(req);

 // ─── Build context-aware system prompt ───
 const userCtx = await buildUserContext(req, authCtx.tenantId);
 const contextText = userCtx? formatContextForPrompt(userCtx): "";

 // FIX(v10-ai): دانش‌نامه — اسناد تغذیه‌شده توسط سوپرادمین به‌عنوان زمینه تزریق می‌شوند
 const knowledge = await buildKnowledgeContext(lastUser?.content || "");

 // ─── v33-d: موتور آفلاین v2 — خط لولهٔ ابزار/ریاضی/داده/دانش قبل از LLM ───
 // دستورات قطعی (شمارش کالا، موجودی/قیمت کالا، فروش دوره، مانده طرف‌حساب،
 // نرخ ارز/طلا، گزارش سود، ارزش افزوده، ماشین‌حساب، دانش مالیاتی و اکشن‌های
 // UI) همیشه محلی اجرا می‌شوند: فوری، دقیق، بدون پیکربندی و بدون اینترنت.
 let v2Result: Awaited<ReturnType<typeof runOfflineAssistantV2>> = null;
 try {
 v2Result = await runOfflineAssistantV2(authCtx.tenantId, lastUser?.content || "");
 } catch (v2Err) {
 console.error("[ai/chat] offline v2 error:", v2Err);
 }
 if (v2Result) {
 if (stream === true) {
 // استریم SSE شبیه‌سازی‌شده + meta (اکشن/پیشنهادها) + برچسب engine:local
 const enc = new TextEncoder();
 const metaPayload: Record<string, unknown> = {};
 if (v2Result.action) metaPayload.assistantAction = v2Result.action;
 if (v2Result.followUps && v2Result.followUps.length > 0) metaPayload.followUps = v2Result.followUps;
 const offlineStreamV2 = new ReadableStream<Uint8Array>({
 start(controller) {
 if (Object.keys(metaPayload).length > 0) {
 controller.enqueue(enc.encode(`data: ${JSON.stringify({ meta: metaPayload })}\n\n`));
 }
 const chunks = chunkForOfflineStream(v2Result!.text);
 for (const chunk of chunks) {
 controller.enqueue(enc.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
 }
 controller.enqueue(enc.encode("data: [DONE]\n\n"));
 controller.close();
 },
 });
 return new Response(offlineStreamV2, {
 headers: {
 "Content-Type": "text/event-stream; charset=utf-8",
 "Cache-Control": "no-cache, no-transform",
 Connection: "keep-alive",
 "X-Accel-Buffering": "no",
 "X-Hoosh-Engine": "local",
 },
 });
 }
 return NextResponse.json({
 success: true,
 reply: v2Result.text,
 engine: "local",
 contextLoaded: !!userCtx,
 knowledgeSources: [],
 detectedAction: null,
 // v33-d: اکشن اجرایی UI (دکمهٔ زیر پاسخ) + پیشنهادهای پیگیری
 action: v2Result.action ?? null,
 followUps: v2Result.followUps ?? null,
 });
 }

 let fullSystemPrompt = contextText
? `${BASE_SYSTEM_PROMPT}\n\n${contextText}`
: BASE_SYSTEM_PROMPT;
 if (knowledge.contextText) {
 fullSystemPrompt += knowledge.contextText;
 }

 // FIX(v10-ai): انتخاب مسیر موتور — zai (SDK داخلی) یا custom (کلید سوپرادمین)
 const providerSettings = await getAiProviderSettings();
 const useCustom = providerSettings.provider === "custom" && providerSettings.baseUrl && providerSettings.apiKey;

 const apiMessages = useCustom
? ([
 { role: "system" as const, content: fullSystemPrompt },
 ...messages,
 ] as typeof messages)
: ([
 { role: "assistant" as const, content: fullSystemPrompt },
 ...messages,
 ] as typeof messages);

 // ===== Streaming mode =====
 if (stream === true) {
 // FIX(v10-ai): فراخوانی یکپارچه — مسیر سفارشی استریم وب، مسیر zai استریم SDK
 let completionResult;
 let offlineText: string | null = null;
 try {
 completionResult = await chatComplete(apiMessages, { stream: true });
 } catch {
 // v33-d: ۱۰۰٪ آفلاین — fallback هوشمند (کارت راهنما + ۶ پیشنهاد data-aware)
 offlineText = await buildOfflineFallbackReply(
 authCtx.tenantId,
 lastUser?.content || "",
 userCtx?.tenantName
 );
 completionResult = null;
 }
 if (offlineText !== null) {
 // استریم SSE شبیه‌سازی‌شده از متن آفلاین + برچسب engine:local
 const encoder0 = new TextEncoder();
 const offlineStream = new ReadableStream<Uint8Array>({
 start(controller) {
 const chunks = chunkForOfflineStream(offlineText!);
 for (const chunk of chunks) {
 controller.enqueue(encoder0.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
 }
 controller.enqueue(encoder0.encode("data: [DONE]\n\n"));
 controller.close();
 },
 });
 return new Response(offlineStream, {
 headers: {
 "Content-Type": "text/event-stream; charset=utf-8",
 "Cache-Control": "no-cache, no-transform",
 Connection: "keep-alive",
 "X-Accel-Buffering": "no",
 "X-Hoosh-Engine": "local",
 },
 });
 }
 const upstream = completionResult.stream;

 // تشخیص action intent از آخرین پیام کاربر برای ارسال به UI
 let streamDetectedAction: DetectedActionIntent | null = null;
 if (lastUser?.content) {
 const intent = detectActionIntent(lastUser.content);
 if (intent.type && intent.confidence >= 0.5) {
 streamDetectedAction = intent;
 }
 }

 void auditLog({
 tenantId: tenant?.id?? authCtx.tenantId,
 action: "AI_CHAT_STREAM",
 entity: "ai.chat",
 changes: {
 messageCount: messages.length,
 preview: lastUser?.content?.slice(0, 200)?? "",
 contextLoaded:!!userCtx,
 detectedAction: streamDetectedAction? streamDetectedAction.type: null,
 actionConfidence: streamDetectedAction?.confidence?? 0,
 },
 req,
 });

 const encoder = new TextEncoder();
 const readable = new ReadableStream<Uint8Array>({
 start(controller) {
 // ابتدا یک رویداد meta با detectedAction + منابع دانش‌نامه ارسال می‌کنیم
 const hasMeta = (streamDetectedAction && streamDetectedAction.type) || knowledge.matchedTitles.length > 0;
 if (hasMeta) {
 const metaPayload = `data: ${JSON.stringify({
 meta: {
 detectedAction: streamDetectedAction && streamDetectedAction.type
? {
 action: streamDetectedAction.type,
 data: streamDetectedAction.data,
 confidence: streamDetectedAction.confidence,
 }
: null,
 knowledgeSources: knowledge.matchedTitles,
 },
 })}\n\n`;
 controller.enqueue(encoder.encode(metaPayload));
 }
 toSSEStream(upstream, controller);
 },
 });

 return new Response(readable, {
 headers: {
 "Content-Type": "text/event-stream; charset=utf-8",
 "Cache-Control": "no-cache, no-transform",
 Connection: "keep-alive",
 "X-Accel-Buffering": "no",
 },
 });
 }

 // ===== Non-streaming mode =====
 let reply: string;
 let engine: "cloud" | "local" = "cloud";
 try {
 const completionResult = await chatComplete(apiMessages, { stream: false });
 reply = completionResult.text;
 } catch {
 // v33-d: ۱۰۰٪ آفلاین — fallback هوشمند (کارت راهنما + ۶ پیشنهاد data-aware)
 engine = "local";
 reply = await buildOfflineFallbackReply(
 authCtx.tenantId,
 lastUser?.content || "",
 userCtx?.tenantName
 );
 }

 // تشخیص این که آیا کاربر درخواست انجام یک اکشن کرده است یا خیر
 // (این اطلاعات به UI ارسال می‌شود تا action card نمایش دهد)
 let detectedAction: DetectedActionIntent | null = null;
 if (lastUser?.content) {
 const intent = detectActionIntent(lastUser.content);
 if (intent.type && intent.confidence >= 0.5) {
 detectedAction = intent;
 }
 }

 await auditLog({
 tenantId: tenant?.id?? authCtx.tenantId,
 action: "AI_CHAT",
 entity: "ai.chat",
 changes: {
 messageCount: messages.length,
 preview: lastUser?.content?.slice(0, 200)?? "",
 replyLength: reply.length,
 contextLoaded:!!userCtx,
 detectedAction: detectedAction? detectedAction.type: null,
 actionConfidence: detectedAction?.confidence?? 0,
 },
 req,
 });

 return NextResponse.json({
 success: true,
 reply,
 engine,
 contextLoaded:!!userCtx,
 knowledgeSources: knowledge.matchedTitles,
 detectedAction: detectedAction && detectedAction.type
? {
 action: detectedAction.type,
 data: detectedAction.data,
 confidence: detectedAction.confidence,
 }
: null,
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("AI Chat error:", msg);
 // تشخیص خطای پیکربندی SDK
 const isConfigError = msg.includes("missing X-Token header") || msg.includes("Configuration file not found");
 return NextResponse.json(
 {
 success: false,
 error: isConfigError
? "سرویس هوش مصنوعی در حال حاضر در دسترس نیست (خطای پیکربندی سرور). لطفاً بعداً تلاش کنید."
: "خطا در ارتباط با هوش مصنوعی. لطفاً دوباره تلاش کنید.",
 },
 { status: isConfigError? 503: 500 }
 );
 }
}

// GET — saúde-check + اطلاعات قابلیت‌ها
export async function GET() {
 return NextResponse.json({
 success: true,
 endpoint: "/api/ai/chat",
 features: [
 "streaming",
 "context-aware",
 "persian",
 "jalali-date",
 "rate-limit-10-per-minute",
 ],
 });
}
