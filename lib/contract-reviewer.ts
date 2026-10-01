// بازبین هوشمند قراردادها — هوش
// تحلیل متن قرارداد با LLM و شناسایی بندهای پرخطر، شرایط نامساعد و کاستی‌ها
// خروجی فارسی، ساختاریافته و قابل‌اقدام

import ZAI from "z-ai-web-dev-sdk";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface Risk {
 clause: string;
 level: RiskLevel;
 description: string;
 suggestion: string;
}

export interface Clause {
 title: string;
 summary: string;
 fair: "favorable" | "neutral" | "unfavorable";
}

export interface ContractReviewResult {
 risks: Risk[];
 clauses: Clause[];
 summary: string;
 overallRisk: RiskLevel;
 reviewedAt: string;
}

const CONTRACT_REVIEW_SYSTEM = `تو وکیل و کارشناس حقوقی نرم‌افزار حسابداری «هوش» هستی.
وظیفه: تحلیل قراردادهای تجاری فارسی و شناسایی بندهای پرخطر.

قوانین:
۱. خروجی فقط JSON خالص، بدون markdown و بدون توضیح اضافه
۲. فقط فارسی، اعداد فارسی
۳. بدون emoji
۴. مختصر و دقیق

ساختار خروجی:
{
 "risks": [{ "clause": "عنوان بند پرخطر", "level": "high|medium|low|critical", "description": "توضیح خطر", "suggestion": "توصیه‌ی اصلاحی" }],
 "clauses": [{ "title": "عنوان بند", "summary": "خلاصه بند", "fair": "favorable|neutral|unfavorable" }],
 "summary": "خلاصه‌ی کلی قرارداد در ۲ جمله",
 "overallRisk": "low|medium|high|critical"
}

نکات تحلیلی:
- بندهای مربوط به فورس‌ماژور، حل اختلاف، ضمانت اجرا، تمدید خودکار، حق فسخ یک‌طرفه پرخطر هستند.
- شرط تحویل کالا/پرداخت نامساعد را علامت‌گذاری کن.
- نبود بند محرمانگی، حل‌وفصل اختلاف، یا ضمانت اجرا را به‌عنوان کاستی ذکر کن.`;

/** تحلیل قرارداد با LLM */
export async function reviewContract(
 contractText: string
): Promise<ContractReviewResult> {
 if (!contractText || contractText.trim().length < 20) {
 return {
 risks: [],
 clauses: [],
 summary: "متن قرارداد برای تحلیل کافی نیست.",
 overallRisk: "low",
 reviewedAt: new Date().toISOString(),
 };
 }

 // اگر متن خیلی بلند است، کوتاه می‌کنیم (LLM محدودیت توکن دارد)
 const truncated =
 contractText.length > 8000? contractText.slice(0, 8000) + "\n[باقی متن حذف شد]": contractText;

 const zai = await ZAI.create();
 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: CONTRACT_REVIEW_SYSTEM },
 { role: "user", content: `این متن قرارداد را تحلیل کن:\n\n${truncated}` },
 ],
 thinking: { type: "disabled" },
 });

 const raw: string = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
 const start = cleaned.indexOf("{");
 const end = cleaned.lastIndexOf("}");
 if (start === -1 || end === -1) {
 return {
 risks: [],
 clauses: [],
 summary: "خطا در تحلیل قرارداد — خروجی هوش مصنوعی نامعتبر بود.",
 overallRisk: "low",
 reviewedAt: new Date().toISOString(),
 };
 }

 try {
 const parsed = JSON.parse(cleaned.slice(start, end + 1));
 const risks: Risk[] = Array.isArray(parsed?.risks)
? parsed.risks.map((r: Record<string, unknown>) => ({
 clause: String(r?.clause?? ""),
 level: normalizeLevel(r?.level),
 description: String(r?.description?? ""),
 suggestion: String(r?.suggestion?? ""),
 }))
: [];
 const clauses: Clause[] = Array.isArray(parsed?.clauses)
? parsed.clauses.map((c: Record<string, unknown>) => ({
 title: String(c?.title?? ""),
 summary: String(c?.summary?? ""),
 fair: normalizeFair(c?.fair),
 }))
: [];
 const overallRisk = normalizeLevel(parsed?.overallRisk);

 return {
 risks,
 clauses,
 summary: String(parsed?.summary?? ""),
 overallRisk,
 reviewedAt: new Date().toISOString(),
 };
 } catch {
 return {
 risks: [],
 clauses: [],
 summary: "خطا در پردازش خروجی هوش مصنوعی.",
 overallRisk: "low",
 reviewedAt: new Date().toISOString(),
 };
 }
}

function normalizeLevel(v: unknown): RiskLevel {
 const s = String(v?? "").toLowerCase();
 if (s === "critical") return "critical";
 if (s === "high") return "high";
 if (s === "medium") return "medium";
 return "low";
}
function normalizeFair(v: unknown): Clause["fair"] {
 const s = String(v?? "").toLowerCase();
 if (s === "favorable") return "favorable";
 if (s === "unfavorable") return "unfavorable";
 return "neutral";
}
