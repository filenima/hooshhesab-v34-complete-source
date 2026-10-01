// ============ AI Content Generator API — هوش ============
// تولید محتوای بازاریابی فارسی با LLM.
// POST /api/ai/content-generator
// Body: { type: "blog" | "social" | "email" | "ad", topic, tone }

import { NextRequest, NextResponse } from "next/server";
import { requireTenant, rateLimit } from "@/lib/auth";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ContentRequest {
 type: "blog" | "social" | "email" | "ad";
 topic: string;
 tone?: "formal" | "friendly" | "professional" | "casual" | "persuasive";
 audience?: string;
 length?: "short" | "medium" | "long";
 keywords?: string[];
}

const TONE_LABELS: Record<string, string> = {
 formal: "رسمی",
 friendly: "صمیمی",
 professional: "حرفه‌ای",
 casual: "غیررسمی",
 persuasive: "ترغیبی",
};

const TYPE_LABELS: Record<string, string> = {
 blog: "مقاله وبلاگ",
 social: "پست شبکه‌های اجتماعی",
 email: "ایمیل بازاریابی",
 ad: "متن تبلیغ",
};

export async function POST(req: NextRequest) {
 try {
 if (!rateLimit("ai-content-gen", 10, 60_000)) {
 return NextResponse.json({ error: "نرخ درخواست زیاد است — حداکثر ۱۰ درخواست در دقیقه" }, { status: 429 });
 }

 await requireTenant(req);

 const body = (await req.json()) as ContentRequest;

 if (!body.topic ||!body.type) {
 return NextResponse.json({ error: "topic و type الزامی هستند" }, { status: 400 });
 }

 const validTypes = ["blog", "social", "email", "ad"];
 if (!validTypes.includes(body.type)) {
 return NextResponse.json({ error: "type نامعتبر" }, { status: 400 });
 }

 const prompt = buildPrompt(body);

 let content: string;
 let title: string;
 let excerpt: string;
 let warning: string | undefined;

 try {
 const zai = await ZAI.create();
 const completion = await zai.chat.completions.create({
 messages: [
 {
 role: "assistant",
 content:
 "تو یک متخصص تولید محتوای فارسی برای نرم‌افزار هوش (پلتفرم حسابداری ایرانی) هستی. محتوای باکیفیت، جذاب و فارسی روان تولید کن.",
 },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });

 content = completion?.choices?.[0]?.message?.content?? "";
 if (!content) {
 const fallback = generateFallback(body);
 content = fallback.content;
 title = fallback.title;
 excerpt = fallback.excerpt;
 warning = "محتوا با قالب آماده تولید شد (LLM خالی برگرداند)";
 } else {
 title = extractTitle(content, body.topic);
 excerpt = extractExcerpt(content);
 }
 } catch (err) {
 console.error("[ai-content-gen] خطای LLM:", err);
 const fallback = generateFallback(body);
 content = fallback.content;
 title = fallback.title;
 excerpt = fallback.excerpt;
 warning = "محتوا با قالب آماده تولید شد (LLM در دسترس نبود)";
 }

 return NextResponse.json({
 content,
 title,
 excerpt,
 type: body.type,
 topic: body.topic,
 tone: TONE_LABELS[body.tone?? "professional"],
 length: content.length,
 warning,
 generatedAt: new Date().toISOString(),
 });
 } catch (err) {
 const message = err instanceof Error? err.message: String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}

function buildPrompt(req: ContentRequest): string {
 const tone = TONE_LABELS[req.tone?? "professional"];
 const typeLabel = TYPE_LABELS[req.type];
 const lengthMap = { short: "کوتاه (۱۰۰-۲۰۰ کلمه)", medium: "متوسط (۳۰۰-۵۰۰ کلمه)", long: "بلند (۶۰۰-۱۰۰۰ کلمه)" };
 const length = lengthMap[req.length?? "medium"];

 let prompt = `یک ${typeLabel} با موضوع «${req.topic}» تولید کن.\n\n`;
 prompt += `لحن: ${tone}\n`;
 prompt += `طول: ${length}\n`;
 if (req.audience) prompt += `مخاطب: ${req.audience}\n`;
 if (req.keywords && req.keywords.length > 0) {
 prompt += `کلمات کلیدی: ${req.keywords.join("، ")}\n`;
 }

 switch (req.type) {
 case "blog":
 prompt += `\nساختار:\n- عنوان جذاب\n- مقدمه (معرفی مسئله)\n- ۳ تا ۵ بخش اصلی با عنوان‌های فرعی\n- نتیجه‌گیری و دعوت به اقدام (CTA) برای ثبت‌نام در هوش\n`;
 break;
 case "social":
 prompt += `\nخروجی باید شامل:\n- متن پست (با ایموجی مناسب)\n- ۳ تا ۵ هشتگ فارسی مرتبط\n- دعوت به اقدام (CTA)\n`;
 break;
 case "email":
 prompt += `\nساختار ایمیل:\n- موضوع ایمیل (subject)\n- سلام و نام کاربر\n- بدنه (معرفی محصول/قابلیت + مزایا)\n- دعوت به اقدام (دکمه یا لینک)\n- امضای هوش\n`;
 break;
 case "ad":
 prompt += `\nساختار تبلیغ:\n- تیتر جذاب (حداکثر ۶۰ کاراکتر)\n- متن اصلی (حداکثر ۱۵۰ کاراکتر)\n- دعوت به اقدام\n- مناسب برای تبلیغات گوگل/اینستاگرام/لینکدین\n`;
 break;
 }

 prompt += `\nمحتوا را فقط به زبان فارسی و با کیفیت بالا تولید کن.`;
 return prompt;
}

function extractTitle(content: string, topic: string): string {
 const firstLine = content.split("\n").find((l) => l.trim());
 if (firstLine && (firstLine.startsWith("#") || firstLine.length < 100)) {
 return firstLine.replace(/^#+\s*/, "").trim();
 }
 return topic;
}

function extractExcerpt(content: string): string {
 const clean = content.replace(/^#+\s*.*$/m, "").trim();
 const firstParagraph = clean.split("\n\n")[0]?? clean.slice(0, 200);
 return firstParagraph.slice(0, 200) + (firstParagraph.length > 200? "...": "");
}

function generateFallback(req: ContentRequest): { content: string; title: string; excerpt: string } {
 const tone = TONE_LABELS[req.tone?? "professional"];
 const typeLabel = TYPE_LABELS[req.type];

 const title = `${req.topic} — راهنمای کامل`;
 const excerpt = `در این ${typeLabel} درباره‌ی ${req.topic} با لحن ${tone} توضیح می‌دهیم.`;

 let content = `# ${title}\n\n`;

 switch (req.type) {
 case "blog":
 content += `## مقدمه\n\n${req.topic} یکی از موضوعات مهم برای کسب‌وکارهای ایرانی است. در این مقاله، نگاهی جامع به این موضوع می‌اندازیم.\n\n`;
 content += `## چرا ${req.topic} مهم است؟\n\nمدیریت صحیح ${req.topic} می‌تواند به کسب‌وکار شما کمک کند تا عملکرد بهتری داشته باشد.\n\n`;
 content += `## نحوه‌ی پیاده‌سازی\n\nبا استفاده از هوش، می‌توانید ${req.topic} را به‌صورت هوشمند و خودکار مدیریت کنید.\n\n`;
 content += `## نتیجه‌گیری\n\nبرای بهره‌مند شدن از قابلیت‌های هوش، همین امروز ثبت‌نام کنید.`;
 break;
 case "social":
 content = `${req.topic} را به‌سادگی با هوش مدیریت کنید!\n\nبا هوش، تمام امور مالی کسب‌وکار خود را در یک پلتفرم یکپارچه داشته باشید.\n\n حسابداری هوشمند\n گزارش‌های لحظه‌ای\n اتصال به سامانه مودیان\n\nهمین حالا شروع کنید: hoosh.nobatime.ir\n\n#هوش_حساب #حسابداری #کسب_و_کار #${req.topic.replace(/\s+/g, "_")}`;
 break;
 case "email":
 content = `موضوع: ${req.topic} — راه‌حل هوشمند\n\nسلام،\n\nامروز می‌خواهیم درباره‌ی ${req.topic} و راه‌حل هوش برای آن صحبت کنیم.\n\nبا هوش، می‌توانید ${req.topic} را به‌صورت خودکار مدیریت کنید و در زمان خود صرفه‌جویی کنید.\n\nبرای شروع، روی لینک زیر کلیک کنید:\nhttps://hoosh.nobatime.ir/register\n\nبا احترام،\nتیم هوش`;
 break;
 case "ad":
 content = `تیتر: ${req.topic} را هوشمند مدیریت کنید\n\nمتن: با هوش، ${req.topic} را به‌صورت خودکار و هوشمند مدیریت کنید. ثبت‌نام کنید و ۳ روز رایگان استفاده کنید.\n\nCTA: شروع رایگان`;
 break;
 }

 return { content, title, excerpt };
}
