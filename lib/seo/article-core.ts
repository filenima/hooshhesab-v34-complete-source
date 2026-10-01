// ============================================================
// seo/article-core.ts — هستهٔ مشترک موتور تولید مقالهٔ سئو (v31)
// ============================================================
// منطق «خالص» تولید مقاله (پرامپت، LLM، مونتاژ، اعتبارسنجی) — بدون هیچ
// وابستگی به Next.js (بدون db، بدون cache). این ماژول به‌طور همزمان توسط:
//   ۱) mini-services/seo-worker (پروسهٔ مستقل bun — مصون از ری‌استارت‌های
//      سرور Next.js در سندباکس کم‌حافظه) — اجرای واقعی تولید
//   ۲) lib/seo/article-generator.ts (سمت Next.js — فقط پروکسی/وضعیت)
// استفاده می‌شود. فقط import نسبی — تا در هر دو محیط resolve شود.
//
// z-ai-web-dev-sdk فقط سمت سرور/پروسهٔ backend استفاده می‌شود.
// ============================================================

import {
  PILLAR_SLUGS,
  EXISTING_INTERNAL_LINKS,
  type TopicBrief,
} from "./topic-bank";

export const ARTICLES_PER_RUN = 19;
export const MIN_WORDS = 2900; // الزام سخت ۳۰۰۰+ با تلورانس شمارش
const LLM_TIMEOUT_MS = 8 * 60 * 1000;

// ============ پرامپت‌سازی ============

const PRODUCT_FACTS = `فکت‌های واقعی محصول «هوش» (هوش‌حساب) — فقط از این‌ها استفاده کن و چیزی از خودت اضافه نکن:
- نرم‌افزار حسابداری ابری ایرانی با ۱۶ ماژول یکپارچه
- پلن‌ها: پایه ۹,۷۵۰,۰۰۰ تومان/سال — حرفه‌ای ۱۳,۹۰۰,۰۰۰ تومان/سال — سازمانی ۳۴,۹۰۰,۰۰۰ تومان/سال
- تریال ۳ روزه رایگان بدون نیاز به کارت بانکی
- اتصال یکپارچه به سامانه مودیان (صورتحساب الف/ب/ج + کارپوشه)
- OCR فاکتور با دقت ۹۸٪
- هوش مصنوعی: دستیار مالی، پیش‌بینی جریان نقدی، تشخیص ناهنجاری و تقلب
- انبار چندگانه با کاردکس، حقوق و دستمزد با قوانین ۱۴۰۴ (پایه ۷۱,۶۶۶,۶۷۰ + بن ۱۳,۲۰۰,۰۰۰ + مسکن ۹۰۰,۰۰۰)
- اتصال فروشگاه آنلاین: ووکامرس، دیجی‌کالا، باسلام
- CRM و باشگاه مشتریان، چندشرکتی، PWA موبایل، REST و GraphQL API
- تلفن پشتیبانی: ۰۷۱-۳۲۶۲۲۴۹۳`;

function buildPrompt(topic: TopicBrief): { system: string; user: string } {
  const pillarSlug = PILLAR_SLUGS[topic.cluster];
  const sisterLinks = EXISTING_INTERNAL_LINKS.filter(
    (l) => l.cluster === topic.cluster && l.slug !== pillarSlug && l.slug !== topic.slug
  ).slice(0, 5);
  const otherLinks = EXISTING_INTERNAL_LINKS.filter(
    (l) => l.cluster !== topic.cluster
  ).slice(0, 6);
  const allowed = [
    { slug: pillarSlug, title: "صفحهٔ ستون این خوشه" },
    ...sisterLinks,
    ...otherLinks,
    { slug: "pricing", title: "صفحهٔ قیمت‌گذاری و تریال" },
  ];

  const system = `تو نویسندهٔ ارشد محتوای تخصصی حسابداری و مالیات ایران برای وبلاگ «هوش‌حساب» هستی. مقاله‌های تو در گوگل فارسی رتبهٔ اول می‌گیرند و در پاسخ‌های هوش مصنوعی (ChatGPT/Perplexity/AI Overviews) نقل می‌شوند. فارسی روان و دقیق می‌نویسی و مثال‌های عددی تو همیشه سازگار درونی هستند.`;

  const user = `محتوای مقاله‌ای با این مشخصات تولید می‌شود:

عنوان مقاله: «${topic.title}»
کلیدواژهٔ کانونی سئو: «${topic.focusKeyword}» (در چند جای طبیعی متن + حداقل یک انکرتکست)

بریف زاویه و محتوای این مقاله:
${topic.brief}

فهرست کامل لینک‌های مجاز (هیچ لینک دیگری نساز — فقط این‌ها):
${allowed.map((l) => `- /blog/${l.slug} → ${l.title}`).join("\n")}
- /pricing → صفحهٔ قیمت و شروع رایگان

${PRODUCT_FACTS}

الزامات محتوایی:
۱. جدول‌های <table> کامل با <thead> و <tbody> دادهٔ واقعی و قابل‌استناد داشته باشند نه حرف کلی.
۲. مثال‌های عددی ایرانی با تومان واقعی و سازگاری ریاضی درونی (جمع ستون‌ها را خودت چک کن).
۳. حداقل ۲ آمار نقل‌کردنی با عبارت «طبق بررسی هوش از ۴۰۰ کسب‌وکار ایرانی» (مثلاً: مغایرت انبار متوسط ۱۲٪ | ۶۸٪ مالکان از سود ماهانه بی‌خبرند | ۲۳٪ ماهانه ترازنامه می‌بینند | ۴۱٪ کاهش زمان بستن ماه با ابر | ۵۷٪ صرفاً بر اساس قیمت انتخاب می‌کنند و ۳۹٪ ظرف دو سال پشیمان می‌شوند).
۴. اعداد فارسی (۰۱۲۳۴۵۶۷۸۹) در کل متن — هیچ رقم لاتین در متن قابل‌مشاهده ممنوع.
۵. لینک‌سازی داخلی با انکرتکست فارسی توصیفی (فقط از فهرست مجاز بالا).
۶. لحن: حرفه‌ای اما گرم و قابل‌فهم برای صاحب کسب‌وکار غیرحسابدار؛ اصطلاح تخصصی = توضیح کوتاه.
۷. خروجی فقط HTML خام — بدون بلوک کد markdown (سه‌علامت گرَو)، بدون markdown، بدون تگ‌های html/head/body، بدون هیچ علامت گرَو.`;

  return { system, user };
}

// ============ اعتبارسنجی ============

export function countWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function validateArticle(html: string): {
  ok: boolean;
  words: number;
  tables: number;
  images: number;
  ctas: number;
  hasFaq: boolean;
  latinDigitsInText: number;
  problems: string[];
} {
  const words = countWords(html);
  const tables = (html.match(/<table[\s>]/g) || []).length;
  const images = (html.match(/<img\s/g) || []).length;
  const ctas = (html.match(/href="\/pricing"/g) || []).length;
  const hasFaq = html.includes("سوالات متداول") || html.includes("سؤالات متداول");
  const textOnly = html.replace(/<[^>]+>/g, " ").replace(/\/[a-z0-9\-\/\.]+/gi, " ");
  const latinDigitsInText = (textOnly.match(/[0-9]/g) || []).length;

  const problems: string[] = [];
  if (words < MIN_WORDS) problems.push(`کلمات ${words} < ${MIN_WORDS}`);
  if (tables < 3) problems.push(`جدول‌ها ${tables} < 3`);
  if (images < 1) problems.push("تصویر ندارد");
  if (ctas < 2) problems.push(`CTA ${ctas} < 2`);
  if (!hasFaq) problems.push("FAQ ندارد");
  if (latinDigitsInText > 5) problems.push(`ارقام لاتین در متن: ${latinDigitsInText}`);

  return {
    ok: problems.length === 0,
    words,
    tables,
    images,
    ctas,
    hasFaq,
    latinDigitsInText,
    problems,
  };
}

// ============ فراخوانی LLM ============

async function callLLM(
  system: string,
  user: string,
  timeoutMs = LLM_TIMEOUT_MS
): Promise<string> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();

  // LLM rate-limited است (429) — retry با backoff تصاعدی
  // FIX(v31): پنجرهٔ rate-limit گاهی چند دقیقه طول می‌کشد (تداخل با
  // قابلیت‌های AI خودِ اپ + کرون‌ها)؛ صبرِ ۱۰۰ثانیه‌ای قبلی باعث می‌شد
  // کل اجرای ۱۹تایی بی‌فایده بسوزد. حالا ~۸ دقیقه صبر می‌کنیم.
  const backoffs = [10_000, 30_000, 60_000, 120_000, 240_000];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, backoffs[attempt - 1]));
    }
    try {
      const completion = await Promise.race([
        zai.chat.completions.create({
          messages: [
            { role: "assistant", content: system },
            { role: "user", content: user },
          ],
          thinking: { type: "disabled" },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("LLM timeout")), timeoutMs)
        ),
      ]);
      const content: string | undefined = completion.choices?.[0]?.message?.content;
      if (!content || content.trim().length === 0) throw new Error("empty LLM response");
      return content
        .replace(/^\s*```(?:html|json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const is429 = msg.includes("429") || msg.toLowerCase().includes("too many");
      const isTimeout = msg.includes("timeout");
      // فقط 429 و خطاهای گذرا retry می‌شوند — خطای منطقی نه
      if (!is429 && !isTimeout && attempt >= 1) throw lastError;
      if (!is429 && !isTimeout) throw lastError;
    }
  }
  throw lastError ?? new Error("LLM failed");
}

// ============ تولید chunked ============

interface OutlineSection {
  h2: string;
  brief: string;
  table?: boolean;
}

function fallbackOutline(topic: TopicBrief): OutlineSection[] {
  return Array.from({ length: 13 }, (_, i) => ({
    h2: `نکتهٔ ${i + 1}`,
    brief: topic.brief,
    table: i % 4 === 3,
  }));
}

async function generateOutline(topic: TopicBrief): Promise<OutlineSection[]> {
  try {
    const raw = await callLLM(
      "تو برنامه‌ریز محتوای سئو هستی. فقط JSON خروجی بده — هیچ متن دیگری نه.",
      `برای مقالهٔ «${topic.title}» با کلیدواژهٔ «${topic.focusKeyword}» یک ساختار ۱۳ بخشی بساز.

بریف مقاله:
${topic.brief}

خروجی فقط این JSON:
{"sections": [{"h2": "عنوان h2 فارسی کوتاه", "brief": "۲-۳ جمله: دقیقاً چه چیزهایی در این بخش بیاید (اشاره به مثال عددی/جدول)", "table": true}]}

قواعد:
- دقیقاً ۱۳ بخش؛ ترتیب منطقی از ساده به پیشرفته
- حداقل ۴ بخش table=true (محتوای عددی قابل‌جدول)
- بخش‌ها کاملاً متمایز — بدون هم‌پوشانی
- عنوان‌ها حاوی کلیدواژه یا واژه‌های مرتبط باشند (سئو)`,
      3 * 60 * 1000
    );
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json");
    const parsed = JSON.parse(m[0]) as { sections?: OutlineSection[] };
    if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length < 8) {
      throw new Error("bad sections");
    }
    return parsed.sections.slice(0, 14);
  } catch {
    return fallbackOutline(topic);
  }
}

function sectionListText(sections: OutlineSection[], from: number, to: number): string {
  return sections
    .slice(from, to)
    .map(
      (sec, i) =>
        `${from + i + 1}. «${sec.h2}» — ${sec.brief}${
          sec.table ? " (این بخش حتماً یک جدول <table> کامل با thead/tbody و ۵+ ردیف داشته باشد)" : ""
        }`
    )
    .join("\n");
}

async function generateHalf(
  topic: TopicBrief,
  sections: OutlineSection[],
  half: "first" | "second"
): Promise<string> {
  const { system, user } = buildPrompt(topic);
  const isSecond = half === "second";
  const halfCount = Math.floor(sections.length / 2);

  const instructions = isSecond
    ? [
        `این فراخوانی فقط «نیمهٔ دوم» مقاله را می‌سازد: بخش‌های ${halfCount + 1} تا ${sections.length}.`,
        `- شروع با <h2>${halfCount + 1}. …</h2> (شماره‌گذاری h2 از همین عدد شروع شود)`,
        "- بدون مقدمهٔ دوباره — نیمهٔ اول جداگانه تولید شده است.",
        "- بدون بخش سوالات متداول — FAQ جداگانه تولید می‌شود.",
      ].join("\n")
    : [
        `این فراخوانی فقط «نیمهٔ اول» مقاله را می‌سازد: مقدمه + پاسخ سریع + تعریف + بخش‌های ۱ تا ${halfCount}.`,
        "- شروع با پاراگراف مقدمهٔ همدلانه ~۱۵۰ کلمه (صحنهٔ واقعی کسب‌وکار ایرانی: ساعت، مکان، درد واقعی).",
        "- سپس پاراگراف «پاسخ سریع» ۴۰-۵۰ کلمه‌ای — پاسخ مستقیم سوال اصلی (برای پاسخ ویژهٔ گوگل).",
        "- سپس پاراگراف تعریف استاندارد ۴۰-۵۰ کلمه‌ای از مفهوم اصلی (برای موتورهای هوش مصنوعی).",
        "- سپس بخش‌های h2 شماره‌دار از ۱.",
        "- بدون جمع‌بندی/نتیجه‌گیری — با آخرین بخش تخصیص‌یافته تموم کن.",
      ].join("\n");

  const halfUser = `${user}

 ${instructions}

ساختار بخش‌های این نیمه (دقیقاً همین ترتیب و همین عنوان‌ها — فقط شماره‌گذاری h2 را رعایت کن):
${isSecond ? sectionListText(sections, halfCount, sections.length) : sectionListText(sections, 0, halfCount)}

 طول:هر h2 حداقل ۲۷۰ کلمه محتوای واقعی (مثال عددی تومانی،سناریو،داستان کوتاه) داشته باشد — نه حرف کلی. این نیمه باید ~۱,۷۰۰+ کلمه باشد. اگر بخشی کوتاه شد،با مثال و سناریو بیشترش کن — هرگز خلاصه‌گویی نکن.

همین حالا فقط HTML این نیمه را بنویس.`;

  return callLLM(system, halfUser);
}

/** تولید بخش سوالات متداول (فراخوانی مستقل — تضمین حضور FAQ برای AI-SEO) */
async function generateFaq(topic: TopicBrief, sections: OutlineSection[]): Promise<string> {
  const { system } = buildPrompt(topic);
  const outlineText = sections.map((sec, i) => `${i + 1}. ${sec.h2}`).join("\n");
  const faqUser = `برای مقالهٔ «${topic.title}» (کلیدواژه: ${topic.focusKeyword}) فقط بخش «سوالات متداول» را بنویس.

سرفصل‌های مقاله (برای هم‌راستایی سوال‌ها):
${outlineText}

الزامات:
- شروع با: <h2>سوالات متداول</h2>
- دقیقاً ۸ سوال، هرکدام <h3>سوال…؟</h3> + یک پاراگراف <p>پاسخ…</p>
- هر پاسخ ۴۰ تا ۶۰ کلمه و «کاملاً مستقل» — بدون ارجاع به بخش‌های دیگر مقاله (این پاسخ‌ها باید به‌تنهایی در نتایج گوگل و پاسخ‌های هوش مصنوعی نقل‌پذیر باشند)
- سوال‌ها همان چیزهایی باشند که صاحب کسب‌وکار ایرانی واقعاً می‌پرسد (قیمت، قانون، مهلت، تفاوت با گزینهٔ دیگر)
- در ۲ پاسخ، آمار «طبق بررسی هوش از ۴۰۰ کسب‌وکار ایرانی» بیاید
- در ۱-۲ پاسخ، لینک طبیعی به /pricing با انکرتکست «شروع رایگان ۳ روزه هوش»
- اعداد فارسی؛ بدون markdown؛ فقط HTML همین بخش`;

  return callLLM(system, faqUser, 5 * 60 * 1000);
}

/** بلوک CTA استاندارد (تزریق برنامه‌ای) */
function ctaBlock(): string {
 return `\n<div class="cta-box">\n<p><strong>می‌خواهید همین حالا امتحان کنید؟</strong>هوش را <strong>۳ روز رایگان و بدون کارت بانکی</strong>تست کنید؛همهٔ ۱۶ ماژول باز است. <a href="/pricing">شروع رایگان ۳ روزه هوش</a></p>\n</div>\n`;
}

/** پاراگراف لینک به ستون خوشه + خواهرها (تضمینی) */
function pillarLinksBlock(topic: TopicBrief): string {
  const pillarSlug = PILLAR_SLUGS[topic.cluster];
  const pillar = EXISTING_INTERNAL_LINKS.find((l) => l.slug === pillarSlug);
  const sisters = EXISTING_INTERNAL_LINKS.filter(
    (l) => l.cluster === topic.cluster && l.slug !== pillarSlug
  ).slice(0, 2);
  const links = [pillar, ...sisters]
    .filter(Boolean)
    .map((l) => `<a href="/blog/${l!.slug}">${l!.title}</a>`);
  return `<p><strong>مطالب مرتبط:</strong> ${links.join(" • ")}</p>\n`;
}

/** تزریق برنامه‌ای عناصر تضمینی: تصویر، CTA، لینک ستون */
function assembleWithGuarantees(topic: TopicBrief, html: string): string {
  let out = html;

  // تصویر — بعد از اولین جدول یا ۳۵٪ متن
  if (!/<img\s/.test(out)) {
    const imgTag = `<img src="${topic.coverImage}" alt="${topic.title}" loading="lazy" />`;
    const tableIdx = out.indexOf("</table>");
    if (tableIdx > -1) {
      out = out.slice(0, tableIdx + 8) + "\n" + imgTag + out.slice(tableIdx + 8);
    } else {
      const mid = Math.floor(out.length * 0.35);
      const pIdx = out.indexOf("</p>", mid);
      out =
        pIdx > -1
          ? out.slice(0, pIdx + 4) + "\n" + imgTag + out.slice(pIdx + 4)
          : imgTag + out;
    }
  }

  // CTA — کمتر از ۳ → در نقاط یک‌سوم/دوسوم تزریق
  let ctaCount = (out.match(/href="\/pricing"/g) || []).length;
  if (ctaCount < 3) {
    const oneThird = out.indexOf("</h2>", Math.floor(out.length / 3));
    if (ctaCount < 1 && oneThird > -1) {
      out = out.slice(0, oneThird + 5) + "\n" + ctaBlock() + out.slice(oneThird + 5);
      ctaCount++;
    }
    const twoThird = out.indexOf("</h2>", Math.floor(out.length * 2 * 0.5));
    if (ctaCount < 2 && twoThird > -1) {
      out = out.slice(0, twoThird + 5) + "\n" + ctaBlock() + out.slice(twoThird + 5);
      ctaCount++;
    }
    if (ctaCount < 3) {
      const faqIdx = out.search(/<h2[^>]*>[^<]*سوالات متداول/);
      const pos = faqIdx > -1 ? faqIdx : out.length;
      out = out.slice(0, pos) + ctaBlock() + out.slice(pos);
    }
  }

  // لینک ستون خوشه — تضمینی (اگر LLM نگذاشته باشد)
  const pillarSlug = PILLAR_SLUGS[topic.cluster];
  if (!out.includes(pillarSlug)) {
    const faqIdx = out.search(/<h2[^>]*>[^<]*سوالات متداول/);
    const pos = faqIdx > -1 ? faqIdx : out.length;
    out = out.slice(0, pos) + pillarLinksBlock(topic) + out.slice(pos);
  }

  return out;
}

export async function generateArticle(
  topic: TopicBrief
): Promise<{
  html: string;
  validation: ReturnType<typeof validateArticle>;
  rounds: number;
  saved: boolean;
}> {
  // دور ۱: outline سبک
  const sections = await generateOutline(topic);

  // دور ۲: تولید ترتیبی (outline → نیمهٔ اول → نیمهٔ دوم → FAQ) —
  // فراخوانی موازی rate-limit (429) می‌خورد؛ ترتیبی با فاصلهٔ کوتاه پایدار است
  const partA = await generateHalf(topic, sections, "first");
  await new Promise((r) => setTimeout(r, 3000));
  const partB = await generateHalf(topic, sections, "second");
  await new Promise((r) => setTimeout(r, 3000));
  const faqPart = await generateFaq(topic, sections);
  // اگر نیمهٔ دوم خودش FAQ گذاشته بود، تکراری نشود
  const partBHasFaq = /<h2[^>]*>[^<]*سوالات متداول/.test(partB);
  const faqBlock = partBHasFaq ? "" : "\n" + faqPart;
  let html = assembleWithGuarantees(topic, partA + "\n" + partB + faqBlock);
  let validation = validateArticle(html);
  let rounds = 2;

  // دورهای تکمیلی (کوتاهی یا کمبود جدول): بخش‌های جدول‌دار + درج قبل از FAQ
  while ((validation.words < 3000 || validation.tables < 3) && rounds < 5) {
    rounds++;
    const need = Math.max(1, Math.ceil((3250 - validation.words) / 280));
    let extra = "";
    try {
      extra = await callLLM(
        "تو نویسندهٔ ارشد محتوای حسابداری و مالیات ایران هستی. فقط HTML خام بنویس.",
        `برای مقالهٔ «${topic.title}» (کلیدواژه: ${topic.focusKeyword}) ${need} بخش h2 تکمیلی بنویس.

بریف مقاله (هم‌راستایی موضوعی):
${topic.brief}

الزامات هر بخش:
- h2 شماره‌دار (شماره‌ها از ${sections.length + rounds - 2} شروع شوند)
- هر بخش ۲۸۰+ کلمه محتوای داده‌محور (مثال عددی تومانی، سناریو، مقایسه)
- حداقل نیمی از بخش‌ها جدول <table> کامل با <thead>+<tbody> و ۵+ ردیف داشته باشند
- اعداد فارسی و ریاضی سازگار
- بدون مقدمه/جمع‌بندی — فقط بخش‌ها پشت‌سرهم
- بدون هیچ علامت گرَو یا markdown

فقط HTML بخش‌ها.`,
        6 * 60 * 1000
      );
    } catch {
      break;
    }
    const extraVal = validateArticle(extra);
    if (extraVal.words < 150) break; // پاسخ بی‌کیفیت — قطع
    const faqIdx = html.search(/<h2[^>]*>[^<]*سوالات متداول/);
    html =
      faqIdx > -1
        ? html.slice(0, faqIdx) + extra + "\n" + html.slice(faqIdx)
        : html + "\n" + extra;
    validation = validateArticle(html);
  }

  const saved = validation.words >= MIN_WORDS;
  return { html, validation, rounds, saved };
}

export function extractExcerpt(html: string): string {
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/g) || [];
  const firstTwo = paragraphs
    .slice(0, 2)
    .map((p) => p.replace(/<[^>]+>/g, "").trim())
    .join(" ")
    .slice(0, 300);
  return firstTwo || "مقالهٔ تخصصی حسابداری و مالیات از تیم هوش.";
}

