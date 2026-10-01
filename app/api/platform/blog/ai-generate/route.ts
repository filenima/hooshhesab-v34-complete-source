import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/platform/blog/ai-generate
 * Body: { topic: string, tone?: "formal"|"friendly"|"professional"|"casual"|"persuasive",
 * length?: "short"|"medium"|"long", keywords?: string[], category?: string }
 *
 * با استفاده از z-ai-web-dev-sdk یک پیش‌نویس کامل مقاله بلاگ فارسی تولید می‌کند.
 * خروجی شامل: title، excerpt، content (HTML با سرفصل‌ها)، metaDescription پیشنهادی،
 * suggestedTags، و در صورت خطای LLM یک قالب fallback ارائه می‌شود تا سوپرادمین
 * هرگز با پاسخ خالی مواجه نشود.
 */
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json().catch(() => ({}));
 const {
 topic,
 tone = "professional",
 length = "medium",
 keywords = [],
 category = "ACCOUNTING",
 } = body as {
 topic?: string;
 tone?: "formal" | "friendly" | "professional" | "casual" | "persuasive";
 length?: "short" | "medium" | "long";
 keywords?: string[];
 category?: string;
 };

 if (!topic ||!topic.trim()) {
 return NextResponse.json(
 { success: false, error: "موضوع (topic) الزامی است" },
 { status: 400 }
 );
 }

 const TONE_LABELS: Record<string, string> = {
 formal: "رسمی",
 friendly: "صمیمی",
 professional: "حرفه‌ای",
 casual: "غیررسمی",
 persuasive: "ترغیبی",
 };
 const LENGTH_MAP: Record<string, string> = {
 short: "کوتاه (حدود ۳۰۰ کلمه)",
 medium: "متوسط (حدود ۶۰۰ کلمه)",
 long: "بلند (حدود ۱۲۰۰ کلمه)",
 };

 const prompt = buildPrompt({
 topic: topic.trim(),
 tone: TONE_LABELS[tone] || tone,
 length: LENGTH_MAP[length] || length,
 keywords,
 category,
 });

 let content = "";
 let warning: string | undefined;

 try {
 const zai = await ZAI.create();
 const completion = await zai.chat.completions.create({
 messages: [
 {
 role: "assistant",
 content:
 "تو یک متخصص تولید محتوای فارسی برای نرم‌افزار حسابداری «هوش» هستی. محتوای باکیفیت، سئو-محور و فارسی روان تولید می‌کنی. خروجی همیشه به زبان فارسی است.",
 },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });
 content = completion?.choices?.[0]?.message?.content?? "";
 if (!content) {
 warning = "LLM پاسخ خالی برگرداند — از قالب آماده استفاده شد";
 content = generateFallback(topic.trim(), category);
 }
 } catch (err) {
 console.error("[ai-blog-generate] LLM error:", err);
 warning = "LLM در دسترس نبود — از قالب آماده استفاده شد";
 content = generateFallback(topic.trim(), category);
 }

 // استخراج عنوان، خلاصه، متا و تگ‌ها از محتوای تولیدشده
 const { title, excerpt, metaDescription, htmlContent, suggestedTags } =
 parseAIContent(content, topic.trim());

 return NextResponse.json({
 success: true,
 data: {
 title,
 excerpt,
 content: htmlContent,
 metaTitle: title.slice(0, 60),
 metaDescription,
 focusKeyword: keywords[0] || topic.trim(),
 tags: suggestedTags,
 readingTime: Math.max(
 1,
 Math.ceil(
 htmlContent.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length / 200
 )
 ),
 },
 warning,
 generatedAt: new Date().toISOString(),
 });
 } catch (error) {
 console.error("[ai-blog-generate] error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در تولید محتوای AI" },
 { status: 500 }
 );
 }
}

function buildPrompt(args: {
 topic: string;
 tone: string;
 length: string;
 keywords: string[];
 category: string;
}): string {
 const kw =
 args.keywords.length > 0
? `\nکلمات کلیدی که باید در محتوا به‌کار بروند: ${args.keywords.join("، ")}`
: "";
 return `یک مقاله‌ی وبلاگ فارسی با موضوع «${args.topic}» برای پلتفرم حسابداری هوش تولید کن.

لحن: ${args.tone}
طول: ${args.length}
دسته‌بندی: ${args.category}${kw}

ساختار مورد نظر:
- خط اول: عنوان جذاب (بدون #) — حداکثر ۸۰ کاراکتر
- خط دوم خالی
- یک پاراگراف مقدمه (۲-۳ جمله) به‌عنوان excerpt
- ۳ تا ۵ بخش اصلی، هر کدام با تیتر شروع‌شونده با ## (مانند: ## چرا ${args.topic} مهم است؟)
- زیر هر بخش ۱ تا ۳ پاراگراف
- در پایان یک بخش ## نتیجه‌گیری و دعوت به اقدام (CTA) برای ثبت‌نام در هوش

قواعد:
- فقط فارسی بنویس
- کلمات کلیدی را در سرفصل‌ها و محتوا به‌کار ببر
- پاراگراف‌ها کوتاه باشند (۳-۵ جمله)
- در پایان، یک خط جداگانه با عنوان «META:» شامل توضیحات متا ۱۲۰ تا ۱۵۰ کاراکتری، و یک خط «TAGS:» با ۳ تا ۵ برچسب فارسی با کاما جدا شده، اضافه کن.`;
}

function generateFallback(topic: string, _category: string): string {
 return `${topic} — راهنمای کامل

در دنیای پرشتاب کسب‌وکار امروز، ${topic} یکی از چالش‌های اساسی برای سازمان‌های ایرانی است. در این مقاله به بررسی جامع آن می‌پردازیم.

## چرا ${topic} مهم است؟

مدیریت صحیح ${topic} می‌تواند بهره‌وری سازمان را افزایش دهد و هزینه‌ها را کاهش دهد. بسیاری از کسب‌وکارها به‌دلیل عدم آشنایی با ابزارهای مناسب، در این حوزه با مشکل مواجه می‌شوند.

## راهکار هوش برای ${topic}

پلتفرم هوش با ارائه‌ی ابزارهای هوشمند، ${topic} را به‌صورت خودکار مدیریت می‌کند. این راهکار شامل گزارش‌گیری لحظه‌ای، هشدارهای هوشمند و اتصال به سامانه‌ی مودیان است.

## نکات کلیدی پیاده‌سازی

- شناخت نیاز کسب‌وکار
- انتخاب ابزار مناسب
- آموزش تیم
- پایش مداوم

## نتیجه‌گیری

برای بهره‌مند شدن از قابلیت‌های هوش در حوزه‌ی ${topic}، همین امروز ثبت‌نام کنید و ۳ روز رایگان استفاده کنید.

META: در این مقاله درباره‌ی ${topic} و راهکار هوش برای مدیریت هوشمند آن توضیح می‌دهیم. برای کسب‌وکارهای ایرانی مناسب است.
TAGS: ${topic}, هوش, حسابداری, مدیریت هوشمند`;
}

function parseAIContent(raw: string, topic: string) {
 const lines = raw.split("\n");

 // جدا کردن بخش META و TAGS
 let metaDescription = "";
 let suggestedTags: string[] = [];
 let bodyLines: string[] = [];
 for (const line of lines) {
 const trimmed = line.trim();
 if (trimmed.startsWith("META:")) {
 metaDescription = trimmed.slice(5).trim().slice(0, 160);
 } else if (trimmed.startsWith("TAGS:")) {
 const tagsStr = trimmed.slice(5).trim();
 suggestedTags = tagsStr
.split(/[,،]/)
.map((t) => t.trim())
.filter(Boolean)
.slice(0, 8);
 } else {
 bodyLines.push(line);
 }
 }
 if (bodyLines.length === 0) bodyLines = lines;

 // عنوان = اولین خط غیرخالی
 let title = topic;
 let startIdx = 0;
 for (let i = 0; i < bodyLines.length; i++) {
 const t = bodyLines[i].trim();
 if (t) {
 title = t.replace(/^#+\s*/, "").replace(/^\*\*/, "").replace(/\*\*$/, "").slice(0, 100);
 startIdx = i + 1;
 break;
 }
 }

 // تبدیل Markdown به HTML ساده
 const htmlLines: string[] = [];
 let inList = false;
 for (let i = startIdx; i < bodyLines.length; i++) {
 const line = bodyLines[i];
 const t = line.trim();
 if (!t) {
 if (inList) {
 htmlLines.push("</ul>");
 inList = false;
 }
 continue;
 }
 if (t.startsWith("## ")) {
 if (inList) {
 htmlLines.push("</ul>");
 inList = false;
 }
 htmlLines.push(`<h2>${escapeHtml(t.slice(3))}</h2>`);
 } else if (t.startsWith("### ")) {
 if (inList) {
 htmlLines.push("</ul>");
 inList = false;
 }
 htmlLines.push(`<h3>${escapeHtml(t.slice(4))}</h3>`);
 } else if (t.startsWith("- ") || t.startsWith("* ")) {
 if (!inList) {
 htmlLines.push("<ul>");
 inList = true;
 }
 htmlLines.push(`<li>${escapeHtml(t.slice(2))}</li>`);
 } else {
 if (inList) {
 htmlLines.push("</ul>");
 inList = false;
 }
 // پاراگراف
 const safe = escapeHtml(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
 htmlLines.push(`<p>${safe}</p>`);
 }
 }
 if (inList) htmlLines.push("</ul>");
 const htmlContent = htmlLines.join("\n");

 // excerpt: اولین پاراگراف
 const firstParaMatch = htmlContent.match(/<p>(.+?)<\/p>/);
 const excerpt = firstParaMatch
? firstParaMatch[1].replace(/<[^>]+>/g, "").slice(0, 200)
: "";

 if (!metaDescription) {
 metaDescription = excerpt.slice(0, 160);
 }
 if (suggestedTags.length === 0) {
 suggestedTags = [topic.slice(0, 30), "هوش", "حسابداری"].slice(0, 5);
 }

 return { title, excerpt, metaDescription, htmlContent, suggestedTags };
}

function escapeHtml(s: string): string {
 return s
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;");
}
