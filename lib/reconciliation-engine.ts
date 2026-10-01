// موتور تطبیق هوشمند تراکنش‌های بانکی با فاکتورها — هوش
// سه مرحله‌ی آبشاری: تطابق دقیق تطابق فازی LLM

import ZAI from "z-ai-web-dev-sdk";

export interface BankTransaction {
 id: string;
 date: string;
 amount: number; // مثبت = واریز، منفی = برداشت
 description: string;
}

export interface InvoiceRef {
 id: string;
 number: string;
 amount: number;
 partyName?: string;
}

export type MatchMethod = "exact" | "fuzzy" | "llm" | "none";

export interface Match {
 transactionId: string;
 invoiceId: string | null;
 confidence: number; // 0..1
 method: MatchMethod;
 note?: string;
}

/** فاصله‌ی Levenshtein بین دو رشته */
export function levenshtein(a: string, b: string): number {
 if (a === b) return 0;
 if (!a.length) return b.length;
 if (!b.length) return a.length;
 const prev = new Array<number>(b.length + 1);
 const cur = new Array<number>(b.length + 1);
 for (let j = 0; j <= b.length; j++) prev[j] = j;
 for (let i = 1; i <= a.length; i++) {
 cur[0] = i;
 for (let j = 1; j <= b.length; j++) {
 const cost = a[i - 1] === b[j - 1]? 0: 1;
 cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
 }
 for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
 }
 return prev[b.length];
}

/** نسبت تشابه ۰..۱ بر اساس Levenshtein */
export function similarity(a: string, b: string): number {
 const maxLen = Math.max(a.length, b.length);
 if (maxLen === 0) return 1;
 return 1 - levenshtein(a, b) / maxLen;
}

/** نرمال‌سازی شرح برای مقایسه */
function normalize(s: string): string {
 return String(s?? "")
.toLowerCase()
.replace(/[\u064B-\u0652]/g, "") // حذف اعراب
.replace(/[\u0660-\u0669]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
.replace(/[-_/.،,|]/g, " ")
.replace(/\s+/g, " ")
.trim();
}

/**
 * تطبیق تراکنش‌ها با فاکتورها.
 * سه مرحله‌ی آبشاری:
 * 1) تطابق دقیق مبلغ (±۲٪ تلورانس)
 * 2) تطابق فازی شرح (Levenshtein ≥ ۰.۷) همراه با نزدیکی مبلغ
 * 3) LLM برای موارد باقی‌مانده
 */
export async function reconcileTransactions(
 transactions: BankTransaction[],
 invoices: InvoiceRef[]
): Promise<Match[]> {
 const matchedTxIds = new Set<string>();
 const matchedInvIds = new Set<string>();
 const matches: Match[] = [];

 // ===== مرحله‌ی ۱: تطابق دقیق مبلغ =====
 for (const tx of transactions) {
 if (matchedTxIds.has(tx.id)) continue;
 const absAmt = Math.abs(tx.amount);
 for (const inv of invoices) {
 if (matchedInvIds.has(inv.id)) continue;
 const tol = Math.max(1000, inv.amount * 0.02); // حداقل ۱۰۰۰ ریال تلورانس
 if (Math.abs(absAmt - inv.amount) <= tol) {
 matches.push({
 transactionId: tx.id,
 invoiceId: inv.id,
 confidence: 0.95,
 method: "exact",
 note: `تطابق دقیق مبلغ (${inv.amount} ریال)`,
 });
 matchedTxIds.add(tx.id);
 matchedInvIds.add(inv.id);
 break;
 }
 }
 }

 // ===== مرحله‌ی ۲: تطابق فازی شرح =====
 for (const tx of transactions) {
 if (matchedTxIds.has(tx.id)) continue;
 const normTx = normalize(tx.description);
 if (!normTx) continue;
 let bestInv: InvoiceRef | null = null;
 let bestScore = 0;
 for (const inv of invoices) {
 if (matchedInvIds.has(inv.id)) continue;
 const candidates = [inv.number, inv.partyName].filter(Boolean).map(String);
 let maxSim = 0;
 for (const c of candidates) {
 const s = similarity(normTx, normalize(c));
 if (s > maxSim) maxSim = s;
 }
 // نزدیکی مبلغ را هم در نظر بگیر (تلورانس ۱۰٪)
 const amtCloseness =
 Math.abs(Math.abs(tx.amount) - inv.amount) <=
 Math.max(10000, inv.amount * 0.1)
? 1
: 0;
 const combined = maxSim * 0.7 + amtCloseness * 0.3;
 if (combined > bestScore) {
 bestScore = combined;
 bestInv = inv;
 }
 }
 if (bestInv && bestScore >= 0.7) {
 matches.push({
 transactionId: tx.id,
 invoiceId: bestInv.id,
 confidence: Math.min(0.92, bestScore),
 method: "fuzzy",
 note: `تطابق فازی شرح (امتیاز ${(bestScore * 100).toFixed(0)}٪)`,
 });
 matchedTxIds.add(tx.id);
 matchedInvIds.add(bestInv.id);
 }
 }

 // ===== مرحله‌ی ۳: LLM برای موارد باقی‌مانده =====
 const remainingTx = transactions.filter((t) =>!matchedTxIds.has(t.id));
 const remainingInv = invoices.filter((i) =>!matchedInvIds.has(i.id));

 if (remainingTx.length > 0 && remainingInv.length > 0) {
 try {
 const llmMatches = await llmReconcile(remainingTx, remainingInv);
 for (const m of llmMatches) {
 if (m.invoiceId) {
 matchedTxIds.add(m.transactionId);
 matchedInvIds.add(m.invoiceId);
 }
 matches.push(m);
 }
 } catch (err) {
 console.error("LLM reconcile error:", err);
 }
 }

 // موارد بدون تطابق
 for (const tx of transactions) {
 if (matchedTxIds.has(tx.id)) continue;
 matches.push({
 transactionId: tx.id,
 invoiceId: null,
 confidence: 0,
 method: "none",
 note: "تطابقی یافت نشد",
 });
 }

 return matches;
}

/** مرحله‌ی LLM — یک درخواست برای همه‌ی موارد باقی‌مانده */
async function llmReconcile(
 txs: BankTransaction[],
 invs: InvoiceRef[]
): Promise<Match[]> {
 const zai = await ZAI.create();
 const txList = txs
.map(
 (t, i) =>
 `T${i + 1}: id=${t.id}, amount=${t.amount}, desc="${t.description.slice(0, 80)}", date=${t.date}`
 )
.join("\n");
 const invList = invs
.map(
 (iv, i) =>
 `I${i + 1}: id=${iv.id}, number=${iv.number}, amount=${iv.amount}, party=${iv.partyName?? "-"}`
 )
.join("\n");

 const prompt = `تو یک موتور تطبیق بانکی-فاکتوری برای نرم‌افزار حسابداری «هوش» هستی.

لیست تراکنش‌های بانکی باقی‌مانده:
${txList}

لیست فاکتورهای باقی‌مانده:
${invList}

وظیفه: برای هر تراکنش، بهترین فاکتور منطبق را مشخص کن. اگر تطابقی معقول نیست، invoiceId را null بگذار.
معیارها: نزدیکی مبلغ، شباهت شرح/شماره فاکتور، منطق زمانی.

خروجی فقط به این شکل (JSON خالص، بدون markdown):
{"matches": [{"transactionId":"...","invoiceId":"..." یا null,"confidence":0..1,"note":"توضیح کوتاه فارسی"}]}

ترتیب خروجی باید با ترتیب تراکنش‌های ورودی یکی باشد.`;

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: "تو یک دستیار تطبیق حسابداری هستی. فقط JSON خروجی بده." },
 { role: "user", content: prompt },
 ],
 thinking: { type: "disabled" },
 });

 const raw: string = completion?.choices?.[0]?.message?.content?? "";
 const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
 const start = cleaned.indexOf("{");
 const end = cleaned.lastIndexOf("}");
 if (start === -1 || end === -1) {
 return txs.map((t) => ({
 transactionId: t.id,
 invoiceId: null,
 confidence: 0,
 method: "llm" as const,
 note: "خروجی LLM نامعتبر",
 }));
 }
 const parsed = JSON.parse(cleaned.slice(start, end + 1));
 const arr: Array<{
 transactionId?: string;
 invoiceId?: string | null;
 confidence?: number;
 note?: string;
 }> = Array.isArray(parsed?.matches)? parsed.matches: [];

 const out: Match[] = [];
 for (const t of txs) {
 const found = arr.find((a) => a?.transactionId === t.id);
 if (found && found.invoiceId && invs.some((i) => i.id === found.invoiceId)) {
 out.push({
 transactionId: t.id,
 invoiceId: found.invoiceId,
 confidence: Math.max(0, Math.min(0.85, Number(found.confidence?? 0.5) || 0.5)),
 method: "llm",
 note: String(found.note?? "تطابق با تشخیص هوش مصنوعی"),
 });
 } else {
 out.push({
 transactionId: t.id,
 invoiceId: null,
 confidence: 0,
 method: "llm",
 note: "بدون تطابق معقول",
 });
 }
 }
 return out;
}
