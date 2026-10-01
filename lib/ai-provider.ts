/**
 * ============ lib/ai-provider.ts ============
 *
 * لایه‌ی یکپارچه‌ی «موتور هوش مصنوعی» هوش:
 *
 * ۱) تنظیمات Provider (قابل مدیریت از پنل سوپرادمین — تب «هوش مصنوعی»):
 *    - provider: "zai" (پیش‌فرض SDK داخلی) یا "custom" (هر سرویس سازگار با OpenAI)
 *    - baseUrl / apiKey / model / temperature / maxTokens
 *    - ذخیره در SystemSettings با کلید ai_provider_config (JSON)
 *
 * ۲) دانش‌نامه (Knowledge Base — RAG):
 *    - سوپرادمین اسناد (متن / آدرس سایت / فایل PDF/TXT/CSV) را تغذیه می‌کند
 *    - هنگام چت، سوال کاربر با جستجوی کلیدواژه‌ای تطبیق داده شده و بهترین
 *      قطعات اسناد به system prompt تزریق می‌شود
 *
 * همه‌ی اندپوینت‌های /api/ai/* به‌جای ساخت مستقیم ZAI باید از همین لایه
 * استفاده کنند تا کلید/مدل دلخواه سوپرادمین همه‌جا اعمال شود.
 */

import { db } from "@/lib/db";
import { cacheGetOrSet, cacheDeleteByPrefix, CACHE_TTL } from "@/lib/cache";

// ============ تنظیمات Provider ============

export interface AiProviderSettings {
  /** zai = SDK داخلی؛ custom = سرویس سازگار OpenAI با کلید خود سوپرادمین */
  provider: "zai" | "custom";
  /** آدرس پایه سرویس سفارشی — مثلاً https://api.openaiai.com/v1 */
  baseUrl: string;
  /** کلید API سرویس سفارشی */
  apiKey: string;
  /** نام مدل — مثلاً gpt-4o-mini */
  model: string;
  /** دما (۰ تا ۲) */
  temperature: number;
  /** سقف توکن پاسخ */
  maxTokens: number;
  /** آیا دانش‌نامه در پاسخ‌ها استفاده شود */
  knowledgeEnabled: boolean;
  /** حداکثر کاراکتر زمینه‌ی دانش‌نامه که به پرامپت تزریق می‌شود */
  knowledgeMaxChars: number;
}

const AI_SETTINGS_KEY = "ai_provider_config";

const DEFAULT_SETTINGS: AiProviderSettings = {
  provider: "zai",
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.7,
  maxTokens: 4000,
  knowledgeEnabled: true,
  knowledgeMaxChars: 6000,
};

/** خواندن تنظیمات موتور هوش مصنوعی (کش ۵ دقیقه‌ای) */
export async function getAiProviderSettings(): Promise<AiProviderSettings> {
  return cacheGetOrSet(
    "system_settings:ai_provider",
    async () => {
      try {
        const row = await db.systemSettings.findUnique({
          where: { key: AI_SETTINGS_KEY },
        });
        if (row?.value) {
          const parsed = JSON.parse(row.value) as Partial<AiProviderSettings>;
          return { ...DEFAULT_SETTINGS, ...parsed };
        }
      } catch {
        // ignore — fallback به پیش‌فرض
      }
      return DEFAULT_SETTINGS;
    },
    CACHE_TTL.MEDIUM
  );
}

/** ذخیره‌ی تنظیمات موتور (سوپرادمین) + باطل‌کردن کش */
export async function saveAiProviderSettings(
  partial: Partial<AiProviderSettings>
): Promise<AiProviderSettings> {
  const current = await getAiProviderSettings();
  const next: AiProviderSettings = { ...current, ...partial };
  // اعتبارسنجی‌های سبک
  if (next.provider !== "custom") next.provider = "zai";
  next.temperature = Math.max(0, Math.min(2, Number(next.temperature) || 0.7));
  next.maxTokens = Math.max(256, Math.min(32000, Number(next.maxTokens) || 4000));
  next.knowledgeMaxChars = Math.max(
    500,
    Math.min(40000, Number(next.knowledgeMaxChars) || 6000)
  );
  await db.systemSettings.upsert({
    where: { key: AI_SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: AI_SETTINGS_KEY, value: JSON.stringify(next) },
  });
  cacheDeleteByPrefix("system_settings:");
  return next;
}

/** ماسک کلید API برای نمایش امن در پنل سوپرادمین */
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "••••";
  return `${key.slice(0, 5)}${"•".repeat(Math.min(18, key.length - 9))}${key.slice(-4)}`;
}

// ============ فراخوانی یکپارچه Chat Completion ============

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  stream?: boolean;
}

export interface ChatCompletionResult {
  /** حالت غیراستریم: متن کامل پاسخ */
  text: string;
  /** حالت استریم: استریم خام (SSE/ReadableStream) برای تحويل به کلاینت */
  stream?: ReadableStream<Uint8Array> | NodeJS.ReadableStream | unknown;
}

/**
 * فراخوانی یکپارچه chat completion — بر اساس تنظیمات سوپرادمین:
 * - provider=zai → z-ai-web-dev-sdk
 * - provider=custom → POST {baseUrl}/chat/completions با Bearer apiKey
 */
export async function chatComplete(
  messages: ChatMessageInput[],
  opts: ChatOptions = {}
): Promise<ChatCompletionResult> {
  const settings = await getAiProviderSettings();

  // ---- مسیر ۱: سرویس سفارشی (سازگار OpenAI) ----
  if (
    settings.provider === "custom" &&
    settings.baseUrl &&
    settings.apiKey
  ) {
    // نرمال‌سازی baseUrl (بدون اسلش انتهایی؛ /chat/completions اضافه می‌شود)
    const base = settings.baseUrl.trim().replace(/\/+$/, "");
    // اگر کاربر خودش /chat/completions نوشته بود، دوباره اضافه نکن
    const endpoint = base.endsWith("/chat/completions")
      ? base
      : `${base}/chat/completions`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model || "gpt-4o-mini",
        messages,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        ...(opts.stream ? { stream: true } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `AI_PROVIDER_HTTP_${res.status}: ${errText.slice(0, 300)}`
      );
    }

    if (opts.stream && res.body) {
      return { text: "", stream: res.body };
    }

    const data = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    const text = data?.choices?.[0]?.message?.content ?? "";
    return { text };
  }

  // ---- مسیر ۲: SDK داخلی z-ai (پیش‌فرض) ----
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();

  if (opts.stream) {
    const upstream = await zai.chat.completions.create({
      messages,
      stream: true,
      thinking: { type: "disabled" },
    });
    return { text: "", stream: upstream };
  }

  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
  });
  return { text: completion?.choices?.[0]?.message?.content ?? "" };
}

/**
 * تست اتصال موتور هوش مصنوعی — پیام کوتاه «ping» می‌فرستد و پاسخ را چک می‌کند.
 * برای دکمه‌ی «تست اتصال» در پنل سوپرادمین.
 */
export async function testAiProvider(): Promise<{
  ok: boolean;
  latencyMs: number;
  replyPreview: string;
  provider: string;
  model: string;
  error?: string;
}> {
  const settings = await getAiProviderSettings();
  const started = Date.now();
  try {
    const result = await chatComplete(
      [
        {
          role: "user",
          content:
            "سلام — فقط بنویس: «اتصال برقرار است». هیچ متن دیگری ننویس.",
        },
      ],
      { stream: false }
    );
    return {
      ok: !!result.text,
      latencyMs: Date.now() - started,
      replyPreview: result.text.slice(0, 120),
      provider: settings.provider,
      model: settings.provider === "custom" ? settings.model || "gpt-4o-mini" : "zai-default",
    };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      replyPreview: "",
      provider: settings.provider,
      model: settings.model,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e),
    };
  }
}

// ============ دانش‌نامه (Knowledge Base / RAG) ============

/** نرمال‌سازی متن فارسی برای جستجو */
function normalizeFa(s: string): string {
  return s
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[ة]/g, "ه")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** ایست‌واژه‌های فارسی — از نتایج جستجو حذف می‌شوند */
const FA_STOPWORDS = new Set([
  "و", "در", "به", "از", "که", "این", "را", "با", "یا", "برای", "تا", "است", "بود", "شد",
  "شود", "هست", "نیست", "هم", "می", "ای", "آن", "هر", "کل", "ما", "شما", "او", "من", "چه",
  "چطور", "چگونه", "کدام", "کی", "کجا", "چقدر", "چند", "آیا", "بله", "خیر", "یک", "دو",
  "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده", "صد", "هزار", "میلیون", "میلیارد",
  "تومان", "ریال", "کنم", "کن", "می‌خوام", "می‌خواهم", "کنید", "شود", "باید", "تواند",
]);

/** استخراج کلیدواژه‌های جستجو از سوال کاربر */
export function extractSearchKeywords(query: string): string[] {
  const tokens = normalizeFa(query)
    .replace(/[?.!,;:()\[\]{}""''«»\-_=+*&^%$#@~«»]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !FA_STOPWORDS.has(t) && t.length >= 2);
  return Array.from(new Set(tokens)).slice(0, 24);
}

export interface KnowledgeMatch {
  docId: string;
  title: string;
  sourceType: string;
  /** قطعه‌ی برش‌خورده از سند که به پرامپت تزریق می‌شود */
  excerpt: string;
  score: number;
}

/**
 * جستجو در دانش‌نامه — امتیازدهی کلیدواژه‌ای:
 * هر کلیدواژه که در سند باشد امتیاز +۱؛ سند با امتیاز بالاتر و جدیدتر اولویت دارد.
 * حداکثر ۳ سند برتر (تا سقف کاراکتر تنظیم‌شده) برگردانده می‌شود.
 */
export async function searchKnowledgeBase(
  query: string,
  maxChars = 6000
): Promise<KnowledgeMatch[]> {
  const settings = await getAiProviderSettings();
  if (!settings.knowledgeEnabled) return [];

  const keywords = extractSearchKeywords(query);
  if (keywords.length === 0) return [];

  const docs = await db.aiKnowledgeDoc
    .findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        sourceType: true,
        content: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200, // سقف پیمایش
    })
    .catch(() => []);

  const scored: KnowledgeMatch[] = [];
  for (const doc of docs) {
    const normalizedContent = normalizeFa(doc.content);
    const normalizedTitle = normalizeFa(doc.title);
    let score = 0;
    let firstHitIndex = -1;
    for (const kw of keywords) {
      const inTitle = normalizedTitle.includes(kw);
      const idx = normalizedContent.indexOf(kw);
      if (inTitle) score += 3;
      if (idx >= 0) {
        score += 1;
        if (firstHitIndex < 0) firstHitIndex = idx;
      }
    }
    if (score <= 0) continue;

    // برش پنجره‌ی ۲۴۰۰ کاراکتری حول اولین تطبیق (متن اصلی، نه نرمال‌شده)
    const safeIndex = Math.max(0, Math.min(firstHitIndex, Math.max(0, doc.content.length - 400)));
    const windowStart = Math.max(0, safeIndex - 600);
    const windowEnd = Math.min(doc.content.length, safeIndex + 1800);
    const excerpt =
      (windowStart > 0 ? "…" : "") +
      doc.content.slice(windowStart, windowEnd).trim() +
      (windowEnd < doc.content.length ? "…" : "");

    scored.push({
      docId: doc.id,
      title: doc.title,
      sourceType: doc.sourceType,
      excerpt,
      score,
    });
  }

  // مرتب‌سازی: امتیاز نزولی
  scored.sort((a, b) => b.score - a.score);

  // سقف کاراکتر کل
  const selected: KnowledgeMatch[] = [];
  let total = 0;
  for (const m of scored) {
    if (total + m.excerpt.length > maxChars || selected.length >= 3) break;
    selected.push(m);
    total += m.excerpt.length;
  }

  // به‌روزرسانی آمار استفاده (fire-and-forget)
  if (selected.length > 0) {
    void Promise.allSettled(
      selected.map((m) =>
        db.aiKnowledgeDoc
          .update({
            where: { id: m.docId },
            data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
          })
          .catch(() => undefined)
      )
    );
  }

  return selected;
}

/**
 * ساخت بلوک زمینه‌ی دانش‌نامه برای تزریق به system prompt.
 * اگر سندی تطبیق بخورد، متن شکل‌یافته برمی‌گردد؛ در غیر این‌صورت رشته‌ی خالی.
 */
export async function buildKnowledgeContext(query: string): Promise<{
  contextText: string;
  matchedTitles: string[];
}> {
  const settings = await getAiProviderSettings();
  if (!settings.knowledgeEnabled) return { contextText: "", matchedTitles: [] };

  const matches = await searchKnowledgeBase(query, settings.knowledgeMaxChars);
  if (matches.length === 0) return { contextText: "", matchedTitles: [] };

  const parts = matches.map(
    (m, i) =>
      `【سند ${i + 1} — ${m.title}】\n${m.excerpt}`
  );
  const contextText =
    `\n\n===== دانش‌نامه‌ی اختصاصی هوش (اسناد تأییدشده‌ی مدیر پلتفرم) =====\n` +
    `پاسخ‌هایت را هر جا مرتبط است با این اسناد هم‌راستا کن و در صورت استناد، عنوان سند را ذکر کن. ` +
    `اگر اطلاعات اسناد با دانش عمومی‌ات تعارض داشت، اطلاعات این اسناد را ملاک قرار بده.\n\n` +
    parts.join("\n\n———\n\n") +
    `\n===== پایان دانش‌نامه =====`;

  return { contextText, matchedTitles: matches.map((m) => m.title) };
}
