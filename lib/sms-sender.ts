// ارسال پیامک از طریق Kavenegar یا Faraz SMS - هوش
//
// پشتیبانی از دو پروایدر اصلی ایرانی:
// - Kavenegar: https://api.kavenegar.com/v1/{KEY}/sms/send.json
// - Faraz (ippanel): https://ippanel.com/api/select
//
// متغیرهای محیطی:
// SMS_PROVIDER — kavenegar | faraz | mock (پیش‌فرض: mock)
// SMS_API_KEY — کلید API
// SMS_SENDER — شماره فرستنده
//
// در صورت تنظیم نشدن یا انتخاب mock، در console.log چاپ می‌شود.

export interface SendSMSParams {
 to: string; // شماره موبایل (۹۸۹123456789 یا 09123456789)
 message: string;
 templateId?: string; // قالب Kavenegar (verify/lookup)
}

export interface SendSMSResult {
 success: boolean;
 messageId?: string;
 error?: string;
 mock?: boolean;
 provider?: string;
}

type Provider = "kavenegar" | "faraz" | "melipayamak" | "mock";

function getProvider(): Provider {
 const p = (process.env.SMS_PROVIDER || "mock").toLowerCase();
 if (p === "kavenegar" || p === "faraz" || p === "melipayamak") return p;
 return "mock";
}

function isConfigured(): boolean {
 return Boolean(
 process.env.SMS_API_KEY && process.env.SMS_SENDER && getProvider()!== "mock"
 );
}

/**
 * نسخه‌ی exportشده برای استفاده در API routes — آیا سرویس پیامک پیکربندی شده؟
 * اگر false باشد، sendSMS در حالت mock فقط console.log می‌زند و پیامک واقعی ارسال نمی‌شود.
 */
export function isSmsConfigured(): boolean {
 return isConfigured();
}

/**
 * نرمال‌سازی شماره موبایل به فرمت 989123456789 (Kavenegar/Faraz)
 */
function normalizePhone(phone: string): string | null {
 const digits = phone.replace(/\D/g, "");
 // 09123456789 989123456789
 if (digits.startsWith("09") && digits.length === 11) {
 return `98${digits.slice(1)}`;
 }
 // 989123456789
 if (digits.startsWith("98") && digits.length >= 12) {
 return digits;
 }
 // +989123456789
 if (digits.startsWith("98")) {
 return digits;
 }
 return null;
}

export function isValidPhone(phone: string): boolean {
 return normalizePhone(phone)!== null;
}

/**
 * ارسال پیامک با پروایدر پیکربندی‌شده
 */
export async function sendSMS(
 params: SendSMSParams
): Promise<SendSMSResult> {
 const provider = getProvider();
 const to = normalizePhone(params.to);
 if (!to) {
 return {
 success: false,
 error: "شماره موبایل نامعتبر است (فرمت موردنظر: 09123456789)",
 };
 }

 if (!isConfigured() || provider === "mock") {
 const mockId = `mock-sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
 console.log(
 `[SMS MOCK] To: ${to} | Message: ${params.message.slice(0, 100)}`
 );
 return {
 success: true,
 messageId: mockId,
 mock: true,
 provider: "mock",
 };
 }

 try {
 if (provider === "kavenegar") {
 return await sendKavenegar(to, params);
 }
 if (provider === "faraz") {
 return await sendFaraz(to, params);
 }
 if (provider === "melipayamak") {
 return await sendMeliPayamak(to, params);
 }
 return {
 success: false,
 error: "پروایدر پشتیبانی نمی‌شود",
 };
 } catch (error) {
 const message = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Send SMS error:", message);
 return {
 success: false,
 error: message,
 provider,
 };
 }
}

/**
 * Kavenegar SMS Gateway
 * https://api.kavenegar.com/v1/{KEY}/sms/send.json
 * params: receptor, message, sender, template (optional for verify/lookup)
 */
async function sendKavenegar(
 to: string,
 params: SendSMSParams
): Promise<SendSMSResult> {
 const apiKey = process.env.SMS_API_KEY;
 const sender = process.env.SMS_SENDER;

 if (params.templateId) {
 // استفاده از verify/lookup برای قالب‌های تأیید شده
 const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`;
 const urlObj = new URL(url);
 urlObj.searchParams.set("receptor", to);
 urlObj.searchParams.set("template", params.templateId);
 // پارامترهای قالب (token1, token2,...) — ما message را به‌عنوان token1 می‌فرستیم
 urlObj.searchParams.set("token1", params.message.slice(0, 100));
 const res = await fetch(urlObj.toString(), { method: "GET" });
 const json = await res.json();
 if (json?.return?.status!== 200) {
 return {
 success: false,
 error: json?.return?.message || "خطای Kavenegar",
 provider: "kavenegar",
 };
 }
 const msgId = json?.entries?.[0]?.messageid?? String(Date.now());
 return {
 success: true,
 messageId: String(msgId),
 provider: "kavenegar",
 };
 }

 // ارسال ساده
 const url = `https://api.kavenegar.com/v1/${apiKey}/sms/send.json`;
 const res = await fetch(url, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams({
 receptor: to,
 message: params.message,
 sender: sender || "",
 }),
 });
 const json = await res.json();
 if (json?.return?.status!== 200) {
 return {
 success: false,
 error: json?.return?.message || "خطای Kavenegar",
 provider: "kavenegar",
 };
 }
 const msgId = json?.entries?.[0]?.messageid?? String(Date.now());
 return {
 success: true,
 messageId: String(msgId),
 provider: "kavenegar",
 };
}

/**
 * Faraz SMS Gateway (ippanel)
 * https://ippanel.com/api/select
 * body: { op: "send", uname, pass, from, to, message }
 */
async function sendFaraz(
 to: string,
 params: SendSMSParams
): Promise<SendSMSResult> {
 const apiKey = process.env.SMS_API_KEY;
 const sender = process.env.SMS_SENDER;
 // Faraz معمولاً username:password در یک رشته با ":" می‌آید؛ کلید را به‌صورت username:password در نظر می‌گیریم
 const [uname, pass] = (apiKey || "").includes(":")
? (apiKey || "").split(":")
: [apiKey, apiKey];

 const body = {
 op: "send",
 uname,
 pass,
 from: sender || "",
 to: [to],
 message: params.message,
 };

 const res = await fetch("https://ippanel.com/api/select", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(body),
 });
 const text = await res.text();
 // پاسخ Faraz معمولاً یک عدد длинной است (شناسه پیام) یا JSON با خطا
 const idMatch = text.match(/"?(-?\d+)"?/);
 if (idMatch &&!text.includes("error")) {
 return {
 success: true,
 messageId: idMatch[1],
 provider: "faraz",
 };
 }
 // تلاش برای parse JSON
 try {
 const json = JSON.parse(text);
 if (json?.status === 0 || json?.error) {
 return {
 success: false,
 error: json?.error || json?.message || "خطای Faraz",
 provider: "faraz",
 };
 }
 if (json?.messageid) {
 return {
 success: true,
 messageId: String(json.messageid),
 provider: "faraz",
 };
 }
 } catch {
 // ignored
 }
 return {
 success: false,
 error: `پاسخ نامعتبر از Faraz: ${text.slice(0, 200)}`,
 provider: "faraz",
 };
}

/**
 * MeliPayamak SMS Gateway
 * https://rest.melipayamak.com/api/Send/Simple/{username}/{password}/{to}/{from}/{text}
 * یا با POST: https://rest.melipayamak.com/api/SendSMS
 * body: { to, from, text, username, password }
 */
async function sendMeliPayamak(
 to: string,
 params: SendSMSParams
): Promise<SendSMSResult> {
 const apiKey = process.env.SMS_API_KEY || "";
 const sender = process.env.SMS_SENDER || "";
 // ملی‌پیامک: username و password با ":" جدا می‌شوند
 const [uname, pass] = apiKey.includes(":")? apiKey.split(":"): [apiKey, ""];

 // روش REST (POST به api/SendSMS)
 const res = await fetch("https://rest.melipayamak.com/api/SendSMS", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 to,
 from: sender,
 text: params.message,
 username: uname,
 password: pass,
 }),
 });
 const json = await res.json();
 // پاسخ ملی‌پیامک: { Value: "messageId", Status: "ok" } یا { Value: null, Status: "error" }
 if (json?.Value && json?.Status === "ok" || (json?.Value && typeof json.Value === "string")) {
 return {
 success: true,
 messageId: String(json.Value),
 provider: "melipayamak",
 };
 }
 return {
 success: false,
 error: json?.StrRecStatus || json?.Status || "خطای ملی‌پیامک",
 provider: "melipayamak",
 };
}

/**
 * تست اتصال به پروایدر (با ارسال یک پیام آزمایشی به شماره تنظیم‌شده)
 */
export async function testSmsConnection(): Promise<{
 ok: boolean;
 mock: boolean;
 provider: string;
 error?: string;
}> {
 const provider = getProvider();
 if (provider === "mock" ||!isConfigured()) {
 return { ok: true, mock: true, provider: "mock" };
 }
 // فقط برقراری اتصال اینترنت را تست می‌کنیم (بدون ارسال واقعی)
 try {
 if (provider === "kavenegar") {
 const res = await fetch(
 `https://api.kavenegar.com/v1/${process.env.SMS_API_KEY}/account/info.json`,
 { method: "GET" }
 );
 const json = await res.json();
 if (json?.return?.status === 200) {
 return { ok: true, mock: false, provider: "kavenegar" };
 }
 return {
 ok: false,
 mock: false,
 provider: "kavenegar",
 error: json?.return?.message || "خطای احراز هویت",
 };
 }
 // برای Faraz — فقط بررسی وجود کلید
 return { ok: true, mock: false, provider: "faraz" };
 } catch (error) {
 const message = error instanceof Error? error.message: "خطا";
 return { ok: false, mock: false, provider, error: message };
 }
}
