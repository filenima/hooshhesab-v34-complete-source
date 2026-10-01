import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { auditLog } from "@/lib/auth";

// /api/ai/transcribe — تبدیل گفتار به متن (ASR) سمت سرور
// ----------------------------------------------------------------------------
// FIX(voice): تشخیص صدا قبلاً با Web Speech API مرورگر انجام می‌شد که در
// مرورگرهای بدون پشتیبانی فارسی / بدون دسترسی به سرویس گوگل بی‌صدا شکست
// می‌خورد («هیچ اتفاقی نمی‌افتاد»). حالا کلاینت با MediaRecorder صدا را ضبط
// می‌کند، به base64 تبدیل کرده و اینجا با z-ai-web-dev-sdk (ASR سمت سرور)
// به متن فارسی تبدیل می‌شود. SDK فقط همین‌جا (بک‌اند) استفاده می‌شود.
//
// ورودی: POST { audio: string (base64 خالص یا data URL), mimeType?: string }
// خروجی موفق: { success: true, text: string }
// خروجی سکوت/بدون گفتار: { success: true, text: "", empty: true } — هرگز خطا نیست.
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

// سقف حجم صوت پس از decode: ~۸ مگابایت (~۱۱M کاراکتر base64)
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

// فرمت‌های صوتی مجاز — هر mimeType ای که با audio/ شروع شود پذیرفته می‌شود؛
// این لیست فقط برای پیام خطای دقیق‌تر است.
const KNOWN_AUDIO_PREFIX = "audio/";

// الگوی base64 معتبر (با padding اختیاری)
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export async function POST(req: NextRequest) {
 try {
 // ─── احراز هویت کاربر (بدون توکن معتبر → 401) ───
 const auth = await requireUser(req);
 if ("error" in auth) {
 return auth.error;
 }
 const { userId, tenantId } = auth.user;

 // ─── محدودیت نرخ: ۲۰ تبدیل در دقیقه برای هر کاربر ───
 const ip = getClientIp(req);
 const rl = rateLimitCheck(`asr:${userId}:${ip}`, 20, 60_000);
 if (!rl.ok) {
 return NextResponse.json(
 {
 success: false,
 error: "درخواست‌های صوتی بیش از حد مجاز است. یک دقیقه دیگر تلاش کنید.",
 },
 {
 status: 429,
 headers: {
 "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
 },
 }
 );
 }

 // ─── بدنه‌ی درخواست ───
 let body: { audio?: unknown; mimeType?: unknown };
 try {
 body = await req.json();
 } catch {
 return NextResponse.json(
 { success: false, error: "بدنه‌ی درخواست JSON معتبر نیست" },
 { status: 400 }
 );
 }

 const { audio, mimeType } = body as { audio?: string; mimeType?: string };

 if (typeof audio!== "string" ||!audio) {
 return NextResponse.json(
 { success: false, error: "فایل صوتی (base64) ارسال نشده است" },
 { status: 400 }
 );
 }

 // اگر data URL ارسال شد («data:audio/webm;base64,....») بخش base64 جدا شود
 let b64 = audio;
 let inferredMime = typeof mimeType === "string"? mimeType: "";
 const dataUrlMatch = audio.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
 if (dataUrlMatch) {
 if (!inferredMime && dataUrlMatch[1]) inferredMime = dataUrlMatch[1];
 b64 = dataUrlMatch[2]?? "";
 }

 if (!b64 ||!BASE64_RE.test(b64)) {
 return NextResponse.json(
 { success: false, error: "رشته‌ی base64 صوتی نامعتبر است" },
 { status: 400 }
 );
 }

 // بررسی mimeType — audio/* (خالی را هم مجاز می‌گذاریم؛ سرویس ASR خودش تشخیص می‌دهد)
 if (inferredMime &&!inferredMime.startsWith(KNOWN_AUDIO_PREFIX)) {
 return NextResponse.json(
 { success: false, error: `فرمت ${inferredMime} صوتی نیست — فقط audio/* پذیرفته می‌شود` },
 { status: 415 }
 );
 }

 // حجم تقریبی decode شده
 const approxBytes = Math.floor((b64.length * 3) / 4);
 if (approxBytes > MAX_AUDIO_BYTES) {
 return NextResponse.json(
 { success: false, error: "حجم فایل صوتی بیش از حد مجاز (۸ مگابایت) است" },
 { status: 413 }
 );
 }

 // ─── تبدیل گفتار به متن با SDK (فقط سمت سرور) ───
 let text = "";
 let emptyReason = "";
 const startedAt = Date.now();
 // همان الگوی callLLM در agent-chat: خطای ۴۲۹ بالادست (سقف درخواست SDK)
 // با retry و backoff افزایشی جبران می‌شود؛ اگر باز هم ۴۲۹ بود به کلاینت ۴۲۹
 // برمی‌گردد (هوک use-voice-asr پیام فارسی مناسبش را دارد).
 // تفاوت با چت: backoffها کوتاه‌ترند (۱/۳/۶ ثانیه) چون UX صوتی باید سریع
 // جواب بدهد — کاربر پشت «در حال تبدیل...» ۲۶ ثانیه معطل نمی‌ماند؛ خطای
 // فارسی سریع می‌آید و با یک لمس دوباره تلاش می‌کند (هر تلاش فرصت تازهٔ سهمیه است).
 const ASR_BACKOFFS = [1000, 3000, 6000];
 const asrCall = async (): Promise<string> => {
 const zai = await ZAI.create();
 const result = (await zai.audio.asr.create({ file_base64: b64 })) as
 | { text?: unknown; transcript?: unknown }
 | null
 | undefined;
 if (result && typeof result.text === "string") {
 return result.text.trim();
 }
 if (result && typeof result.transcript === "string") {
 // برخی پاسخ‌ها فیلد transcript دارند
 return result.transcript.trim();
 }
 return "";
 };
 try {
 let lastErr: unknown = null;
 for (let attempt = 0; attempt <= ASR_BACKOFFS.length; attempt++) {
 try {
 text = await asrCall();
 lastErr = null;
 break;
 } catch (err) {
 lastErr = err;
 const errMsg = err instanceof Error? err.message: String(err);
 const retryable = errMsg.includes("429") || errMsg.toLowerCase().includes("too many requests");
 if (!retryable || attempt === ASR_BACKOFFS.length) throw err;
 // backoff افزایشی: ۱s سپس ۳s سپس ۶s (سریع — مناسب UX صوتی)
 await new Promise((r) => setTimeout(r, ASR_BACKOFFS[attempt]));
 }
 }
 if (lastErr) throw lastErr;
 } catch (asrErr) {
 const msg = asrErr instanceof Error? asrErr.message: String(asrErr);
 // خطای ۴۲۹ بالادست حتی بعد از retry → ۴۲۹ به کلاینت (پیام فارسی)
 const isUpstreamRateLimit =
 msg.includes("429") || msg.toLowerCase().includes("too many requests");
 // خطاهای «بی‌خطر»: صوت کوتاه/سکوت/بدون گفتار → نتیجهٔ خالی مهربان (۲۰۰)
 // بقیه‌ی خطاها خطای واقعی سرویس‌اند → ۵۰۲
 const isBenign =
 /empty|no\s*speech|silence|silent|too\s*short|duration|decode|invalid\s*audio|unsupported/i.test(
 msg
 );
 if (isUpstreamRateLimit) {
 return NextResponse.json(
 {
 success: false,
 error: "سرویس تشخیص صدا موقتاً پرترافیک است. چند لحظه بعد دوباره تلاش کنید.",
 },
 { status: 429 }
 );
 }
 if (isBenign) {
 emptyReason = "no-speech";
 } else {
 console.error("[asr] transcription failed:", msg);
 await auditLog({
 tenantId,
 action: "VOICE_TRANSCRIBE_FAIL",
 entity: "ai.transcribe",
 changes: { msg: msg.slice(0, 300), bytes: approxBytes },
 req,
 }).catch(() => undefined);
 return NextResponse.json(
 {
 success: false,
 error: "سرویس تشخیص صدا در دسترس نیست. لطفاً چند لحظه بعد دوباره تلاش کنید.",
 },
 { status: 502 }
 );
 }
 }

 // ─── ثبت حسابرسی (فقط شناسه‌ها؛ محتوای گفتار کاربر هرگز ذخیره نمی‌شود) ───
 await auditLog({
 tenantId,
 action: "VOICE_TRANSCRIBE",
 entity: "ai.transcribe",
 changes: {
 userId,
 bytes: approxBytes,
 chars: text.length,
 tookMs: Date.now() - startedAt,
 },
 req,
 }).catch(() => undefined);

 return NextResponse.json({
 success: true,
 text,
 empty: text.length === 0,
 ...(emptyReason? { reason: emptyReason }: {}),
 });
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("Transcribe API error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در پردازش صدا. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}
