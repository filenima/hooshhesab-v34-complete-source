"use client";

// ============ هوش‌یار — عامل هوشمند حسابداری ============
// عامل AI که می‌تواند اکشن‌ها را اجرا کند، گام‌به‌گام پیشرفت نشان دهد،
// و به صورت آفلاین هم کار کند.

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Sparkles,
 X,
 Send,
 Loader2,
 ArrowUpLeft,
 CheckCircle2,
 Circle,
 CircleDot,
 AlertCircle,
 Wifi,
 WifiOff,
 Zap,
 MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toPersianDigits, formatNumber, formatToman } from "@/lib/persian";
import {
 parseAgentIntent,
 generateSteps,
 findOfflineResponse,
 type AgentAction,
 type AgentStep,
} from "@/lib/ai-agent-parser";

// ============ Props ============

export interface AIAssistantProps {
 /** فراخوان ناوبری — app-shell آن را پاس می‌دهد */
 onNavigate?: (viewId: string) => void;
}

// ============ انواع داخلی ============

interface ChatMessage {
 id: string;
 role: "user" | "assistant" | "system";
 content: string;
 /** مراحل اجرای عامل (فقط برای پیام‌های assistant با اکشن) */
 steps?: AgentStep[];
 /** نتیجه‌ی نهایی اکشن */
 actionResult?: unknown;
 /** آیا آفلاین پاسخ داده شده */
 offline?: boolean;
 createdAt: number;
}

interface PersistedHistory {
 messages: ChatMessage[];
 savedAt: number;
}

// ============ ثابت‌ها ============

const HISTORY_KEY = "hoshhesab_agent_history";
const MAX_HISTORY = 50;
const MAX_MESSAGES = 100;

const SUGGESTIONS = [
 { text: "برای من یه فاکتور بنویس به اسم نیما امیدوار، محصولات: کفش ۱,۷۰۰,۰۰۰ تومان و شلوار ۲,۳۰۰,۰۰۰ تومان", icon: Zap },
 { text: "یه مشتری جدید ثبت کن به نام رضا احمدی", icon: MessageSquare },
 { text: "نرخ ارزش افزوده چقدر است؟", icon: Sparkles },
 { text: "محاسبه مالیات برای مبلغ ۵۰ میلیون تومان", icon: Sparkles },
];

// ============ کش آفلاین ============

function loadHistory(): ChatMessage[] {
 try {
 const raw = localStorage.getItem(HISTORY_KEY);
 if (!raw) return [];
 const parsed: PersistedHistory = JSON.parse(raw);
 return parsed.messages || [];
 } catch {
 return [];
 }
}

function saveHistory(messages: ChatMessage[]) {
 try {
 const toSave = messages.slice(-MAX_HISTORY);
 localStorage.setItem(HISTORY_KEY, JSON.stringify({ messages: toSave, savedAt: Date.now() }));
 } catch {
 // localStorage پر شده — نادیده بگیر
 }
}

function genId(): string {
 return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============ کامپوننت اصلی ============

export function AIAssistant({ onNavigate }: AIAssistantProps) {
 const [open, setOpen] = React.useState(false);
 const [messages, setMessages] = React.useState<ChatMessage[]>(() => {
 const saved = loadHistory();
 if (saved.length > 0) return saved;
 return [
 {
 id: "greeting",
 role: "assistant",
 content:
 "سلام. من هوش‌یار هستم، عامل هوشمند حسابداری شما. من می‌توانم فاکتور بنویسم، مشتری ثبت کنم، هزینه ثبت کنم، مالیات محاسبه کنم و سوالات حسابداری شما را پاسخ دهم. کافیه بگید چه کاری براتون انجام بدم.",
 createdAt: Date.now(),
 },
 ];
 });
 const [input, setInput] = React.useState("");
 const [loading, setLoading] = React.useState(false);
 const [isOnline, setIsOnline] = React.useState(true);
 const [activeSteps, setActiveSteps] = React.useState<AgentStep[]>([]);
 const scrollRef = React.useRef<HTMLDivElement>(null);
 const inputRef = React.useRef<HTMLInputElement>(null);

 // بررسی وضعیت آنلاین
 React.useEffect(() => {
 const update = () => setIsOnline(navigator.onLine);
 update();
 window.addEventListener("online", update);
 window.addEventListener("offline", update);
 return () => {
 window.removeEventListener("online", update);
 window.removeEventListener("offline", update);
 };
 }, []);

 // اسکرول خودکار
 React.useEffect(() => {
 if (scrollRef.current) {
 scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
 }
 }, [messages, activeSteps, loading]);

 // ذخیره تاریخچه
 React.useEffect(() => {
 saveHistory(messages);
 }, [messages]);

 // فوکوس ورودی هنگام باز شدن
 React.useEffect(() => {
 if (open) {
 setTimeout(() => inputRef.current?.focus(), 300);
 }
 }, [open]);

 // ============ ارسال پیام ============

 const send = async (text?: string) => {
 const content = (text?? input).trim();
 if (!content || loading) return;

 const userMsg: ChatMessage = {
 id: genId(),
 role: "user",
 content,
 createdAt: Date.now(),
 };

 const newMessages = [...messages, userMsg];
 setMessages(newMessages);
 setInput("");
 setLoading(true);

 try {
 // تجزیه‌ی نیت کاربر
 const action = parseAgentIntent(content);

 if (!action || action.type === "ANSWER_QUESTION") {
 // سوال حسابداری — استفاده از API چت موجود
 await handleQuestion(newMessages, action?.type === "ANSWER_QUESTION"? action.question: content);
 } else {
 // اکشن اجرایی — نمایش مراحل و اجرا
 await handleAction(newMessages, action);
 }
 } catch {
 // خطای غیرمنتظره
 setMessages((prev) => [
...prev,
 {
 id: genId(),
 role: "assistant",
 content: "خطایی رخ داد. لطفاً دوباره تلاش کنید.",
 createdAt: Date.now(),
 },
 ]);
 } finally {
 setLoading(false);
 setActiveSteps([]);
 }
 };

 // ============ پردازش سوال ============

 const handleQuestion = async (currentMessages: ChatMessage[], question: string) => {
 // ابتدا بررسی پاسخ آفلاین
 if (!navigator.onLine) {
 const offlineAnswer = findOfflineResponse(question);
 if (offlineAnswer) {
 setMessages((prev) => [
...prev,
 {
 id: genId(),
 role: "assistant",
 content: offlineAnswer,
 offline: true,
 createdAt: Date.now(),
 },
 ]);
 return;
 }

 // آفلاین و پاسخ کش‌شده نداریم
 setMessages((prev) => [
...prev,
 {
 id: genId(),
 role: "assistant",
 content: "در حال حاضر اتصال اینترنت برقرار نیست و پاسخ این سوال در حافظه‌ی کش نیست. لطفاً پس از برقراری اتصال دوباره تلاش کنید.",
 offline: true,
 createdAt: Date.now(),
 },
 ]);
 return;
 }

 // فراخوان API چت
 try {
 const chatMessages = currentMessages
.filter((m) => m.role!== "system")
.map((m) => ({ role: m.role, content: m.content }));

 const res = await fetch("/api/ai/chat", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ messages: chatMessages }),
 });

 if (!res.ok) throw new Error("API error");

 const data = await res.json();
 setMessages((prev) => [
...prev,
 {
 id: genId(),
 role: "assistant",
 content: data.reply || "پاسخی دریافت نشد. دوباره تلاش کنید.",
 createdAt: Date.now(),
 },
 ]);
 } catch {
 // fallback به پاسخ آفلاین
 const offlineAnswer = findOfflineResponse(question);
 setMessages((prev) => [
...prev,
 {
 id: genId(),
 role: "assistant",
 content: offlineAnswer || "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.",
 offline:!offlineAnswer,
 createdAt: Date.now(),
 },
 ]);
 }
 };

 // ============ اجرای اکشن ============

 const handleAction = async (currentMessages: ChatMessage[], action: AgentAction) => {
 const steps = generateSteps(action);
 setActiveSteps(steps);

 // نتیجه‌ی نهایی
 let actionResult: unknown = null;
 let finalContent = "";

 // اجرای گام‌به‌گام
 for (let i = 0; i < steps.length; i++) {
 const step = steps[i];

 // به‌روزرسانی وضعیت مرحله فعلی
 setActiveSteps((prev) =>
 prev.map((s, idx) =>
 idx === i? {...s, status: "running" as const }: s
 )
 );

 // تأخیر کوچک برای نمایش پیشرفت
 await sleep(400);

 try {
 // اجرای اکشن در API (فقط در آخرین مرحله‌ی اجرایی)
 if (i === steps.length - 2 && action.type!== "NAVIGATE" && action.type!== "ANSWER_QUESTION") {
 // مرحله‌ی اجرای واقعی (ماقبل آخرین مرحله که نتیجه است)
 if (navigator.onLine) {
 const res = await fetch("/api/ai/agent", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action }),
 });

 const data = await res.json();
 if (data.success) {
 actionResult = data.data;
 } else {
 throw new Error(data.error || "خطا در اجرای اکشن");
 }
 } else {
 // حالت آفلاین — نتیجه‌ی تقریبی
 actionResult = { offline: true };
 }
 }

 // ناوبری
 if (action.type === "NAVIGATE" && i === 0) {
 onNavigate?.(action.path);
 // حذف اسلش ابتدا برای viewId
 const viewId = action.path.replace(/^\//, "");
 onNavigate?.(viewId);
 }

 // مرحله با موفقیت تمام شد
 setActiveSteps((prev) =>
 prev.map((s, idx) =>
 idx === i? {...s, status: "done" as const, result: actionResult }: s
 )
 );
 } catch (err) {
 const errorMsg = err instanceof Error? err.message: "خطای ناشناخته";
 setActiveSteps((prev) =>
 prev.map((s, idx) =>
 idx === i? {...s, status: "error" as const, result: errorMsg }: s
 )
 );

 // ادامه نده اگر خطا رخ داد
 finalContent = `خطا در اجرا: ${errorMsg}`;
 break;
 }
 }

 // تولید پیام نتیجه
 if (!finalContent) {
 finalContent = generateResultMessage(action, actionResult);
 }

 // افزودن پیام نتیجه
 setMessages((prev) => [
...prev,
 {
 id: genId(),
 role: "assistant",
 content: finalContent,
 steps: steps.map((s, idx) => ({
...s,
 status: activeSteps[idx]?.status || s.status,
 })),
 actionResult,
 createdAt: Date.now(),
 },
 ]);
 };

 // ============ تولید پیام نتیجه ============

 const generateResultMessage = (action: AgentAction, result: unknown): string => {
 const data = result as Record<string, unknown> | null;

 switch (action.type) {
 case "CREATE_INVOICE": {
 if (data?.offline) {
 return "فاکتور در حالت آفلاین آماده شد. پس از برقراری اتصال، فاکتور در سیستم ثبت خواهد شد.";
 }
 const items = action.items || [];
 const total = items.reduce((sum, i) => sum + i.amount, 0);
 const vat = Math.round(total * 0.09);
 return (
 `فاکتور با موفقیت ثبت شد!\n\n` +
 `طرف‌حساب: ${action.partyName || "نامشخص"}\n` +
 items.map((i) => `${i.name}: ${formatToman(i.amount)}`).join("\n") +
 `\n\nجمع: ${formatToman(total)}\n` +
 `مالیات ارزش افزوده (۹٪): ${formatToman(vat)}\n` +
 `جمع کل: ${formatToman(total + vat)}`
 );
 }

 case "CREATE_PARTY": {
 if (data?.existing) {
 return `طرف‌حساب "${action.name}" قبلاً ثبت شده است.`;
 }
 if (data?.offline) {
 return "ثبت طرف‌حساب در حالت آفلاین انجام شد. پس از اتصال، ثبت نهایی خواهد شد.";
 }
 return (
 `طرف‌حساب با موفقیت ثبت شد!\n\n` +
 `نام: ${action.name}\n` +
 `نوع: ${action.partyType === "customer"? "مشتری": action.partyType === "supplier"? "فروشنده": "مشتری/فروشنده"}`
 );
 }

 case "CREATE_EXPENSE": {
 if (data?.offline) {
 return "ثبت هزینه در حالت آفلاین انجام شد. پس از اتصال، ثبت نهایی خواهد شد.";
 }
 return (
 `هزینه با موفقیت ثبت شد!\n\n` +
 (action.description? `شرح: ${action.description}\n`: "") +
 `مبلغ: ${formatToman(action.amount)}`
 );
 }

 case "SEARCH_PARTY": {
 const results = (data?.results as Array<Record<string, string>> | undefined) || [];
 if (results.length === 0) {
 return `نتیجه‌ای برای "${action.query}" یافت نشد.`;
 }
 return (
 `نتایج جستجو برای "${action.query}":\n\n` +
 results
.map((r, i) => `${toPersianDigits(String(i + 1))}. ${r.name} (${r.type === "CUSTOMER"? "مشتری": r.type === "SUPPLIER"? "فروشنده": "مشتری/فروشنده"})`)
.join("\n")
 );
 }

 case "CALCULATE_TAX": {
 if (action.taxType === "VAT") {
 const vat = Math.round(action.amount * 0.09);
 return (
 `محاسبه مالیات ارزش افزوده:\n\n` +
 `مبلغ: ${formatToman(action.amount)}\n` +
 `نرخ: ۹٪\n` +
 `مالیات: ${formatToman(vat)}\n` +
 `جمع با مالیات: ${formatToman(action.amount + vat)}`
 );
 }
 // مالیات بر درآمد
 const tax = (data?.incomeTax as number) || 0;
 return (
 `محاسبه مالیات بر درآمد:\n\n` +
 `درآمد: ${formatToman(action.amount)}\n` +
 `مالیات: ${formatToman(tax)}\n` +
 `نرخ موثر: ${data?.effectiveRate || "—"}`
 );
 }

 case "CALCULATE_PAYROLL": {
 const d = data as Record<string, number> | null;
 if (!d) return "محاسبه حقوق انجام شد.";
 return (
 `محاسبه حقوق و دستمزد:\n\n` +
 `حقوق پایه: ${formatToman(d.baseSalary)}\n` +
 `بیمه سهم کارمند (۷٪): ${formatToman(d.insuranceEmployee)}\n` +
 `بیمه سهم کارفرما (۲۳٪): ${formatToman(d.insuranceEmployer)}\n` +
 `مالیات بر درآمد: ${formatToman(d.incomeTax)}\n` +
 `سایر کسورات: ${formatToman(d.otherDeductions)}\n` +
 `حقوق خالص: ${formatToman(d.netSalary)}`
 );
 }

 case "NAVIGATE": {
 return `رفتن به صفحه ${action.label}...`;
 }

 default:
 return "اکشن اجرا شد.";
 }
 };

 // ============ رندر ============

 const StepIcon: React.FC<{ status: AgentStep["status"] }> = ({ status }) => {
 switch (status) {
 case "pending":
 return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />;
 case "running":
 return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
 case "done":
 return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
 case "error":
 return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
 }
 };

 return (
 <>
 {/* دکمه شناور */}
 <AnimatePresence>
 {!open && (
 <motion.button
 initial={{ scale: 0, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0, opacity: 0 }}
 transition={{ duration: 0.2, ease: "easeOut" }}
 onClick={() => setOpen(true)}
 className="fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:scale-105 active:scale-95 transition-transform"
 aria-label="عامل هوش‌یار"
 data-tour="ai-assistant"
 >
 <Sparkles className="h-5 w-5" />
 <span className="absolute -top-1 -start-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background">
 AI
 </span>
 {!isOnline && (
 <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-background" />
 )}
 </motion.button>
 )}
 </AnimatePresence>

 {/* پنجره عامل */}
 <AnimatePresence>
 {open && (
 <motion.div
 initial={{ opacity: 0, y: 16, scale: 0.97 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 16, scale: 0.97 }}
 transition={{ duration: 0.2, ease: "easeOut" }}
 className="fixed bottom-5 left-5 z-40 flex h-[580px] max-h-[calc(100vh-2.5rem)] w-[calc(100vw-2.5rem)] sm:w-[420px] flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
 dir="rtl"
 >
 {/* هدر */}
 <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3.5 py-3">
 <div className="flex items-center gap-2.5">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Sparkles className="h-4 w-4" />
 </div>
 <div>
 <p className="font-semibold text-sm leading-tight">هوش‌یار</p>
 <p className="text-[10px] text-muted-foreground flex items-center gap-1 leading-tight">
 {isOnline? (
 <>
 <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
 آنلاین — عامل حسابداری
 </>
 ): (
 <>
 <WifiOff className="h-3 w-3 text-amber-500" />
 آفلاین — حالت کش
 </>
 )}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-1">
 {loading && (
 <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-5 gap-1">
 <Loader2 className="h-2.5 w-2.5 animate-spin" />
 اجرا
 </Badge>
 )}
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground"
 onClick={() => setOpen(false)}
 aria-label="بستن"
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 </div>

 {/* پیام‌ها */}
 <div
 ref={scrollRef}
 role="log"
 aria-live="polite"
 aria-label="تاریخچه گفتگو"
 className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-background/40"
 style={{ scrollbarGutter: "stable" }}
 >
 {messages.map((msg) => (
 <div key={msg.id}>
 {/* پیام عادی */}
 <div
 className={`flex ${msg.role === "user"? "justify-start": "justify-end"}`}
 >
 <div
 className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
 msg.role === "user"
? "bg-primary text-primary-foreground rounded-be-sm"
: "bg-card border border-border rounded-bs-sm"
 }`}
 >
 {/* نشانگر آفلاین */}
 {msg.offline && (
 <div className="flex items-center gap-1 mb-1.5 text-[10px] text-amber-600">
 <WifiOff className="h-3 w-3" />
 پاسخ آفلاین
 </div>
 )}

 {/* محتوای پیام — پشتیبانی از خطوط جدید */}
 {msg.content.split("\n").map((line, i) => (
 <React.Fragment key={i}>
 {line || <br />}
 {i < msg.content.split("\n").length - 1 && <br />}
 </React.Fragment>
 ))}
 </div>
 </div>

 {/* مراحل اجرا (زیر پیام assistant) */}
 {msg.steps && msg.steps.length > 0 && msg.role === "assistant" && (
 <div className="mt-2 mr-auto max-w-[90%]">
 <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1.5">
 <p className="text-[10px] text-muted-foreground font-medium">مراحل اجرا:</p>
 {msg.steps.map((step, idx) => (
 <div key={step.id || idx} className="flex items-center gap-2 text-xs">
 <StepIcon status={step.status} />
 <span
 className={
 step.status === "done"
? "text-emerald-600 dark:text-emerald-400"
: step.status === "error"
? "text-destructive"
: step.status === "running"
? "text-foreground font-medium"
: "text-muted-foreground"
 }
 >
 {step.description}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 ))}

 {/* مراحل فعلی (در حال اجرا) */}
 {activeSteps.length > 0 && (
 <div className="mr-auto max-w-[90%]">
 <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 space-y-1.5">
 <p className="text-[10px] text-primary font-medium">در حال اجرا:</p>
 {activeSteps.map((step, idx) => (
 <div key={step.id || idx} className="flex items-center gap-2 text-xs">
 <StepIcon status={step.status} />
 <span
 className={
 step.status === "done"
? "text-emerald-600 dark:text-emerald-400"
: step.status === "running"
? "text-foreground font-medium"
: "text-muted-foreground"
 }
 >
 {step.description}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* نشانگر بارگذاری سوال عادی */}
 {loading && activeSteps.length === 0 && (
 <div className="flex justify-end">
 <div className="flex items-center gap-2 rounded-xl rounded-bs-sm bg-card border border-border px-3.5 py-2.5 text-sm text-muted-foreground">
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 در حال پردازش...
 </div>
 </div>
 )}

 {/* پیشنهادات — فقط در ابتدا */}
 {messages.length <= 1 &&!loading && (
 <div className="pt-1.5 space-y-1.5">
 <p className="text-[10px] text-muted-foreground px-1">پیشنهادات:</p>
 {SUGGESTIONS.map((s, i) => {
 const IconComp = s.icon;
 return (
 <button
 key={i}
 onClick={() => send(s.text)}
 className="group w-full text-start text-xs rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 px-3 py-2 transition-colors flex items-center justify-between gap-2"
 >
 <span className="flex items-center gap-2 text-muted-foreground group-hover:text-foreground">
 <IconComp className="h-3 w-3 shrink-0" />
 {s.text.length > 60? s.text.slice(0, 57) + "...": s.text}
 </span>
 <ArrowUpLeft className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
 </button>
 );
 })}
 </div>
 )}
 </div>

 {/* ورودی */}
 <div className="border-t border-border p-2.5 bg-card">
 <div className="flex items-center gap-2">
 <Input
 ref={inputRef}
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter" &&!e.shiftKey) {
 e.preventDefault();
 send();
 }
 }}
 placeholder={
 isOnline
? "دستور یا سوال خود را بنویسید..."
: "حالت آفلاین — سوالات کش‌شده..."
 }
 aria-label="ورودی عامل هوش‌یار"
 className="flex-1 h-10 text-sm bg-background"
 disabled={loading}
 />
 <Button
 size="icon"
 className="h-10 w-10 shrink-0"
 onClick={() => send()}
 disabled={loading ||!input.trim()}
 aria-label="ارسال"
 >
 <Send className="h-4 w-4" />
 </Button>
 </div>
 <div className="flex items-center justify-between mt-1.5">
 <p className="text-[9px] text-muted-foreground">
 هوش‌یار — عامل هوشمند هوش
 </p>
 {!isOnline && (
 <div className="flex items-center gap-1 text-[9px] text-amber-600">
 <WifiOff className="h-2.5 w-2.5" />
 آفلاین
 </div>
 )}
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </>
 );
}

// ============ کمکی ============

function sleep(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}
