"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Sparkles,
 X,
 ArrowUp,
 ArrowUpLeft,
 Copy,
 Check,
 RefreshCw,
 Square,
 Wifi,
 AlertTriangle,
 Lock,
 Wrench,
 Wallet,
 Landmark,
 Package,
 ShoppingCart,
 Trash2,
 FileText,
 Calculator,
 Globe,
 Activity,
 Users,
 Boxes,
 Loader2,
} from "lucide-react";

// مپ آیکون‌ها برای suggestion categories
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
 Wallet,
 Landmark,
 Package,
 ShoppingCart,
 Sparkles,
 FileText,
 Calculator,
 Globe,
 Activity,
 Users,
 Boxes,
};
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toPersianDigits } from "@/lib/persian";
import type { LucideIcon } from "lucide-react";

// ============ Types ============
interface ChatMessage {
 id: string;
 role: "user" | "assistant";
 content: string;
 toolsUsed?: string[];
 createdAt?: number;
}

interface PersistedHistory {
 messages: ChatMessage[];
 savedAt: number;
}

// ============ Constants ============
const TOKEN_KEY = "hoshhesab_user_token";
const HISTORY_KEY = "hoshhesab_chat_history";

const TOOL_LABELS: Record<string, string> = {
 checks: "چک‌ها",
 invoices: "فاکتورها",
 financial_summary: "خلاصه مالی",
 parties: "طرف‌حساب‌ها",
 products: "کالاها",
 reminders: "یادآورها",
 bank: "بانک",
 payroll: "حقوق و دستمزد",
 tax: "مالیات",
 budget: "بودجه",
 employees: "کارمندان",
 warehouses: "انبارها",
 currency_rates: "نرخ ارز",
 recent_activity: "فعالیت اخیر",
};

// آیکون متناظر با هر ابزار برای badge
const TOOL_ICONS: Record<string, LucideIcon> = {
 checks: Landmark,
 invoices: FileText,
 financial_summary: Wallet,
 parties: Users,
 products: Package,
 reminders: AlertTriangle,
 bank: Landmark,
 payroll: Users,
 tax: Calculator,
 budget: FileText,
 employees: Users,
 warehouses: Boxes,
 currency_rates: Globe,
 recent_activity: Activity,
};

// ۵ پیشنهاد سریع اصلی (همیشه بالای input نمایش داده می‌شوند)
const QUICK_ACTIONS: { label: string; icon: LucideIcon }[] = [
 { label: "وضعیت مالی امروز", icon: Wallet },
 { label: "چک‌های سررسید این هفته", icon: Landmark },
 { label: "کالاهای با موجودی کم", icon: Package },
 { label: "پیشنهاد کاهش هزینه", icon: Sparkles },
 { label: "گزارش مالی این ماه", icon: FileText },
 { label: "نرخ ارز امروز", icon: Globe },
 { label: "وضعیت مالیات", icon: Calculator },
 { label: "حقوق و دستمزد این ماه", icon: Users },
];

const SUGGESTED_PROMPTS = [
 "وضعیت مالی امروز",
 "چک‌های سررسید این هفته",
 "کالاهای با موجودی کم",
 "پیشنهاد کاهش هزینه",
 "گزارش مالی این ماه",
 "نرخ ارز امروز",
 "وضعیت مالیات",
 "حقوق و دستمزد این ماه",
 "فعالیت‌های اخیر سیستم",
];

// suggestion chips دسته‌بندی‌شده با آیکون
const SUGGESTION_CATEGORIES = [
 {
 title: "مالی",
 icon: "Wallet",
 items: [
 "وضعیت مالی امروز",
 "گزارش مالی این ماه",
 "موجودی بانکی کل چقدر است؟",
 ],
 },
 {
 title: "چک و بانک",
 icon: "Landmark",
 items: [
 "چک‌های سررسید این هفته",
 "چک‌های برگشت‌خورده را لیست کن",
 ],
 },
 {
 title: "فروش",
 icon: "ShoppingCart",
 items: [
 "کدام مشتریان بیشترین خرید داشته‌اند؟",
 "فاکتورهای معوق را نشان بده",
 ],
 },
 {
 title: "انبار",
 icon: "Package",
 items: ["کالاهای با موجودی کم"],
 },
 {
 title: "مالیات و ارز",
 icon: "Calculator",
 items: ["وضعیت مالیات", "نرخ ارز امروز"],
 },
 {
 title: "هوشمند",
 icon: "Sparkles",
 items: ["پیشنهاد کاهش هزینه", "فعالیت‌های اخیر سیستم"],
 },
];

const INITIAL_GREETING: ChatMessage = {
 id: "greeting",
 role: "assistant",
 content:
 "سلام. من **دستیار مالی هوش** هستم — یک دستیار هوشمند حسابداری فارسی که به داده‌های واقعی حسابداری شما متصل است.\n\nمی‌توانم در این موضوعات کمک کنم:\n\n- **وضعیت مالی**: درآمد، هزینه، سود، نقدینگی\n- **چک‌ها**: سررسیدها، برگشتی‌ها، صیادی\n- **فاکتورها**: فروش، خرید، معوقات\n- **انبار**: کالاها، موجودی کم، ارزش انبار\n- **بانک**: حساب‌ها، موجودی، تنخواه\n- **حقوق و دستمزد**: فیش حقوق، مالیات حقوق\n- **مالیات**: ارزش افزوده، تعهدات\n- **بودجه**: انحراف از بودجه\n- **نرخ ارز**: دلار، طلا، یورو\n\nسوال خود را بپرسید یا یکی از پیشنهادهای سریع را انتخاب کنید.",
 toolsUsed: [],
};

// ============ Markdown Renderer ============
function renderMarkdown(text: string): React.ReactNode {
 const lines = text.split("\n");
 const blocks: React.ReactNode[] = [];
 let i = 0;
 let key = 0;

 while (i < lines.length) {
 const line = lines[i];

 // Code block ```lang... ```
 if (line.trim().startsWith("```")) {
 const codeLines: string[] = [];
 i++;
 while (i < lines.length &&!lines[i].trim().startsWith("```")) {
 codeLines.push(lines[i]);
 i++;
 }
 i++; // skip closing ```
 blocks.push(
 <pre
 key={key++}
 dir="ltr"
 className="my-2 overflow-x-auto rounded-lg bg-zinc-900 text-zinc-100 p-3 text-xs font-mono leading-relaxed"
 >
 <code>{codeLines.join("\n")}</code>
 </pre>
 );
 continue;
 }

 // Heading
 const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
 if (headingMatch) {
 const level = headingMatch[1].length;
 const content = renderInline(headingMatch[2], key++);
 const sizes = [
 "text-base font-bold mt-3 mb-1",
 "text-sm font-bold mt-3 mb-1",
 "text-sm font-semibold mt-2 mb-1",
 "text-xs font-semibold mt-2 mb-1",
 "text-xs font-semibold mt-2 mb-1",
 "text-xs font-medium mt-2 mb-1",
 ];
 blocks.push(
 <p key={key++} className={sizes[level - 1] || sizes[5]}>
 {content}
 </p>
 );
 i++;
 continue;
 }

 // Numbered list
 if (/^\d+\.\s+/.test(line.trim())) {
 const items: string[] = [];
 while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
 items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
 i++;
 }
 blocks.push(
 <ol
 key={key++}
 className="my-1 space-y-1 list-decimal list-inside text-[13px] leading-relaxed"
 >
 {items.map((it, idx) => (
 <li key={idx}>{renderInline(it, key++)}</li>
 ))}
 </ol>
 );
 continue;
 }

 // Bullet list (- or *)
 if (/^[-*]\s+/.test(line.trim())) {
 const items: string[] = [];
 while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
 items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
 i++;
 }
 blocks.push(
 <ul
 key={key++}
 className="my-1 space-y-1 list-disc list-inside ps-1 text-[13px] leading-relaxed"
 >
 {items.map((it, idx) => (
 <li key={idx}>{renderInline(it, key++)}</li>
 ))}
 </ul>
 );
 continue;
 }

 // Empty line
 if (line.trim() === "") {
 blocks.push(<div key={key++} className="h-2" />);
 i++;
 continue;
 }

 // Regular paragraph
 blocks.push(
 <p key={key++} className="text-[13px] leading-relaxed">
 {renderInline(line, key++)}
 </p>
 );
 i++;
 }

 return <div className="space-y-0.5">{blocks}</div>;
}

// Render inline markdown: **bold**, *italic*, `code`
function renderInline(text: string, baseKey: number): React.ReactNode[] {
 const parts: React.ReactNode[] = [];
 let remaining = text;
 let key = baseKey * 1000;

 while (remaining.length > 0) {
 // bold
 const boldStart = remaining.indexOf("**");
 if (boldStart!== -1) {
 const boldEnd = remaining.indexOf("**", boldStart + 2);
 if (boldEnd!== -1) {
 if (boldStart > 0) {
 parts.push(
 <React.Fragment key={key++}>
 {remaining.slice(0, boldStart)}
 </React.Fragment>
 );
 }
 parts.push(
 <strong key={key++} className="font-bold text-foreground">
 {remaining.slice(boldStart + 2, boldEnd)}
 </strong>
 );
 remaining = remaining.slice(boldEnd + 2);
 continue;
 }
 }

 // inline code
 const codeStart = remaining.indexOf("`");
 if (codeStart!== -1) {
 const codeEnd = remaining.indexOf("`", codeStart + 1);
 if (codeEnd!== -1) {
 if (codeStart > 0) {
 parts.push(
 <React.Fragment key={key++}>
 {remaining.slice(0, codeStart)}
 </React.Fragment>
 );
 }
 parts.push(
 <code
 key={key++}
 dir="ltr"
 className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-foreground"
 >
 {remaining.slice(codeStart + 1, codeEnd)}
 </code>
 );
 remaining = remaining.slice(codeEnd + 1);
 continue;
 }
 }

 parts.push(<React.Fragment key={key++}>{remaining}</React.Fragment>);
 break;
 }

 return parts;
}

// ============ Persian Number Helper ============
function uid(): string {
 return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============ Typing Indicator ============
function TypingDots() {
 return (
 <div className="flex items-center gap-1 py-1">
 {[0, 1, 2].map((i) => (
 <motion.span
 key={i}
 className="h-1.5 w-1.5 rounded-full bg-primary/70"
 animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
 transition={{
 duration: 1,
 repeat: Infinity,
 delay: i * 0.15,
 ease: "easeInOut",
 }}
 />
 ))}
 </div>
 );
}

// ============ Main Component ============
export function FinancialAssistant() {
 const [open, setOpen] = React.useState(false);
 const [messages, setMessages] = React.useState<ChatMessage[]>([
 INITIAL_GREETING,
 ]);
 const [input, setInput] = React.useState("");
 const [loading, setLoading] = React.useState(false);
 const [streaming, setStreaming] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 const [hasToken, setHasToken] = React.useState(true);
 const [copiedId, setCopiedId] = React.useState<string | null>(null);

 const abortRef = React.useRef<AbortController | null>(null);
 const scrollRef = React.useRef<HTMLDivElement | null>(null);
 const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
 const autoScrollRef = React.useRef(true);

 // ============ Load history on mount ============
 React.useEffect(() => {
 try {
 const token = localStorage.getItem(TOKEN_KEY);
 setHasToken(Boolean(token));

 const saved = localStorage.getItem(HISTORY_KEY);
 if (saved) {
 const parsed: PersistedHistory = JSON.parse(saved);
 if (parsed.messages && parsed.messages.length > 0) {
 setMessages(parsed.messages);
 }
 }
 } catch {
 // ignore parse errors
 }
 }, []);

 // ============ گوش دادن به رویداد باز شدن از منابع خارجی (مثل دکمه AI در نوار پایین موبایل) ============
 React.useEffect(() => {
 const handler = () => setOpen(true);
 window.addEventListener("hoshhesab:open-assistant", handler);
 return () => window.removeEventListener("hoshhesab:open-assistant", handler);
 }, []);

 // ============ Save history on message change ============
 React.useEffect(() => {
 try {
 const data: PersistedHistory = {
 messages,
 savedAt: Date.now(),
 };
 localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
 } catch {
 // ignore quota errors
 }
 }, [messages]);

 // ============ Auto-resize textarea ============
 React.useEffect(() => {
 const ta = textareaRef.current;
 if (!ta) return;
 ta.style.height = "auto";
 ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
 }, [input]);

 // ============ Auto-scroll (smart) ============
 const handleScroll = React.useCallback(() => {
 const el = scrollRef.current;
 if (!el) return;
 const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
 autoScrollRef.current = distFromBottom < 80;
 }, []);

 React.useEffect(() => {
 if (autoScrollRef.current && scrollRef.current) {
 scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
 }
 }, [messages]);

 // ============ New chat ============
 const startNewChat = React.useCallback(() => {
 if (loading) {
 abortRef.current?.abort();
 setLoading(false);
 setStreaming(false);
 }
 setMessages([{...INITIAL_GREETING, id: uid() }]);
 setError(null);
 setInput("");
 autoScrollRef.current = true;
 }, [loading]);

 // ============ Send message ============
 const sendMessage = React.useCallback(
 async (text?: string) => {
 const content = (text?? input).trim();
 if (!content || loading) return;

 const token = localStorage.getItem(TOKEN_KEY);
 if (!token) {
 setHasToken(false);
 setError("برای استفاده از دستیار مالی، وارد شوید");
 return;
 }

 setError(null);
 autoScrollRef.current = true;

 const userMsg: ChatMessage = {
 id: uid(),
 role: "user",
 content,
 createdAt: Date.now(),
 };
 const assistantPlaceholder: ChatMessage = {
 id: uid(),
 role: "assistant",
 content: "",
 toolsUsed: [],
 createdAt: Date.now(),
 };

 // Snapshot history for API (without empty placeholder)
 const apiMessages = [...messages, userMsg].map((m) => ({
 role: m.role,
 content: m.content,
 }));

 setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
 setInput("");
 setLoading(true);
 setStreaming(true);

 const controller = new AbortController();
 abortRef.current = controller;

 try {
 const res = await fetch("/api/ai/financial-query", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ messages: apiMessages, stream: true }),
 signal: controller.signal,
 });

 if (!res.ok) {
 let msg = "خطای سرور. در صورت تکرار با پشتیبانی تماس بگیرید.";
 if (res.status === 401)
 msg = "نشست شما منقضی شده. دوباره وارد شوید.";
 else if (res.status === 429)
 msg = "درخواست‌های زیادی ارسال کرده‌اید. کمی صبر کنید.";
 else if (res.status >= 500)
 msg = "خطای سرور. در صورت تکرار با پشتیبانی تماس بگیرید.";
 throw new Error(msg);
 }

 if (!res.body) throw new Error("ارتباط برقرار نشد. دوباره تلاش کنید.");

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer = "";
 let acc = "";
 let toolsUsed: string[] = [];

 // Try to extract toolsUsed from headers if present
 const toolsHeader = res.headers.get("x-tools-used");
 if (toolsHeader) {
 try {
 toolsUsed = JSON.parse(toolsHeader);
 } catch {
 // ignore
 }
 }

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split("\n\n");
 buffer = lines.pop() || "";
 for (const line of lines) {
 const trimmed = line.trim();
 if (!trimmed.startsWith("data:")) continue;
 const data = trimmed.slice(5).trim();
 if (data === "[DONE]") {
 // finalize
 continue;
 }
 try {
 const parsed = JSON.parse(data);
 if (parsed.delta) {
 acc += parsed.delta;
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {
...last,
 content: acc,
 toolsUsed: toolsUsed.length? toolsUsed: last.toolsUsed,
 };
 }
 return next;
 });
 }
 if (parsed.toolsUsed && Array.isArray(parsed.toolsUsed)) {
 toolsUsed = parsed.toolsUsed;
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {...last, toolsUsed };
 }
 return next;
 });
 }
 if (parsed.error) {
 throw new Error(parsed.error);
 }
 } catch (parseErr) {
 // ignore single-chunk parse errors
 }
 }
 }

 // If we got no content, fall back to non-streaming request
 if (!acc) {
 // Replace placeholder with a friendly note via non-stream retry
 try {
 const fallback = await fetch("/api/ai/financial-query", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ messages: apiMessages, stream: false }),
 });
 if (fallback.ok) {
 const json = await fallback.json();
 const reply = json.reply || "پاسخی دریافت نشد.";
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {
...last,
 content: reply,
 toolsUsed: json.toolsUsed || [],
 };
 }
 return next;
 });
 } else {
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {
...last,
 content: "پاسخی دریافت نشد. دوباره تلاش کنید.",
 };
 }
 return next;
 });
 }
 } catch {
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {
...last,
 content: "پاسخی دریافت نشد. دوباره تلاش کنید.",
 };
 }
 return next;
 });
 }
 }
 } catch (err) {
 const e = err as Error;
 if (e.name === "AbortError") {
 // keep partial response — just remove empty placeholder if needed
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (
 last &&
 last.role === "assistant" &&
 last.content.trim() === ""
 ) {
 next[next.length - 1] = {
...last,
 content: "(متوقف شد)",
 };
 }
 return next;
 });
 } else {
 const msg = e.message || "ارتباط برقرار نشد. دوباره تلاش کنید.";
 setError(msg);
 // Replace empty placeholder with error note
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant" &&!last.content) {
 next[next.length - 1] = {...last, content: msg };
 }
 return next;
 });
 }
 } finally {
 setLoading(false);
 setStreaming(false);
 abortRef.current = null;
 }
 },
 [input, loading, messages]
 );

 // ============ Stop streaming ============
 const stop = React.useCallback(() => {
 abortRef.current?.abort();
 setLoading(false);
 setStreaming(false);
 }, []);

 // ============ Copy message ============
 const copyMessage = React.useCallback(async (msg: ChatMessage) => {
 try {
 await navigator.clipboard.writeText(msg.content);
 setCopiedId(msg.id);
 setTimeout(() => setCopiedId(null), 1500);
 } catch {
 // ignore
 }
 }, []);

 // ============ Keyboard ============
 const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
 if (e.key === "Enter" &&!e.shiftKey) {
 e.preventDefault();
 sendMessage();
 }
 };

 // ============ Render ============
 return (
 <>
 {/* Floating trigger button — bottom-left corner */}
 <AnimatePresence>
 {!open && (
 <motion.button
 key="fab"
 onClick={() => setOpen(true)}
 initial={{ scale: 0, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0, opacity: 0 }}
 transition={{ type: "spring", stiffness: 300, damping: 22 }}
 whileHover={{ scale: 1.05 }}
 whileTap={{ scale: 0.95 }}
 aria-label="باز کردن دستیار مالی"
 data-tour="ai-assistant"
 // در موبایل دکمه AI در نوار پایین (MobileBottomNav) قرار دارد؛ این FAB فقط روی lg+ نمایش داده می‌شود
 className="hidden lg:flex fixed bottom-6 left-6 z-50 h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 ring-4 ring-primary/10 hover:ring-primary/20 transition-all"
 >
 {/* pulse ring */}
 <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
 <Sparkles className="relative h-6 w-6" />
 {/* online dot */}
 <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-background" />
 </motion.button>
 )}
 </AnimatePresence>

 {/* Slide-out panel from right (RTL start) */}
 <AnimatePresence>
 {open && (
 <>
 {/* Backdrop — only on mobile */}
 <motion.div
 key="backdrop"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => setOpen(false)}
 className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm sm:hidden"
 />

 <motion.aside
 key="panel"
 initial={{ x: "100%" }}
 animate={{ x: 0 }}
 exit={{ x: "100%" }}
 transition={{ type: "spring", stiffness: 320, damping: 34 }}
 dir="rtl"
 className="fixed inset-y-0 left-0 z-50 flex h-full w-full flex-col bg-background border-l border-border shadow-2xl sm:w-[480px] sm:left-auto sm:right-0"
 >
 {/* Header (glassmorphism) */}
 <header className="sticky top-0 z-10 border-b border-border/60 bg-background/70 backdrop-blur-xl">
 <div className="flex items-center justify-between px-4 py-3">
 <div className="flex items-center gap-3">
 <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Sparkles className="h-4.5 w-4.5" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-sm font-bold">دستیار مالی</h2>
 <Badge
 variant="secondary"
 className="h-4.5 px-1.5 py-0 text-[10px] font-mono bg-primary/10 text-primary"
 >
 GLM-4.6
 </Badge>
 </div>
 <div className="flex items-center gap-1.5 mt-0.5">
 <span className="relative flex h-2 w-2">
 <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
 </span>
 <span className="text-[10px] text-muted-foreground">
 آنلاین
 </span>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="sm"
 onClick={startNewChat}
 className="h-8 gap-1.5 text-xs"
 aria-label="چت جدید"
 >
 <RefreshCw className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">چت جدید</span>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => {
 if (loading) abortRef.current?.abort();
 setMessages([{...INITIAL_GREETING, id: uid() }]);
 setError(null);
 setInput("");
 try {
 localStorage.removeItem(HISTORY_KEY);
 } catch {}
 }}
 className="h-8 w-8 text-muted-foreground hover:text-destructive"
 aria-label="پاک کردن تاریخچه چت"
 title="پاک کردن تاریخچه"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => setOpen(false)}
 className="h-8 w-8"
 aria-label="بستن"
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 </div>
 </header>

 {/* Body — chat area */}
 <div
 ref={scrollRef}
 onScroll={handleScroll}
 className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth"
 style={{
 scrollbarWidth: "thin",
 scrollbarColor: "hsl(var(--border)) transparent",
 }}
 >
 {!hasToken? (
 <div className="flex h-full items-center justify-center">
 <div className="text-center max-w-xs space-y-3">
 <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
 <Lock className="h-5 w-5" />
 </div>
 <p className="text-sm font-medium">ورود لازم است</p>
 <p className="text-xs text-muted-foreground">
 برای استفاده از دستیار مالی، وارد شوید
 </p>
 </div>
 </div>
 ): (
 <>
 {messages.map((msg) => (
 <MessageBubble
 key={msg.id}
 message={msg}
 onCopy={() => copyMessage(msg)}
 copied={copiedId === msg.id}
 streaming={
 streaming &&
 msg.role === "assistant" &&
 msg.id === messages[messages.length - 1]?.id
 }
 />
 ))}

 {/* Suggested prompts — only show when only greeting is present */}
 {messages.length <= 1 &&!loading && (
 <div className="space-y-3 pt-2">
 <p className="text-[11px] font-medium text-muted-foreground px-1 flex items-center gap-1.5">
 <Sparkles className="h-3 w-3 text-primary" />
 پیشنهادهای پرکاربرد:
 </p>
 <div className="space-y-2.5">
 {SUGGESTION_CATEGORIES.map((cat) => {
 const Icon = iconMap[cat.icon] || Sparkles;
 return (
 <div key={cat.title} className="space-y-1.5">
 <p className="text-[10px] font-medium text-muted-foreground/70 px-1 flex items-center gap-1">
 <Icon className="h-3 w-3 text-primary/60" />
 {cat.title}
 </p>
 <div className="flex flex-wrap gap-1.5">
 {cat.items.map((p) => (
 <button
 key={p}
 onClick={() => sendMessage(p)}
 className="group rounded-full border border-border bg-card hover:bg-accent hover:border-primary/40 px-3 py-1.5 text-[11px] transition-all hover:shadow-sm"
 >
 <span className="flex items-center gap-1">
 {p}
 <ArrowUpLeft className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
 </span>
 </button>
 ))}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Error banner */}
 {error && (
 <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
 <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
 <span>{error}</span>
 </div>
 )}
 </>
 )}
 </div>

 {/* Footer — input area */}
 <footer className="border-t border-border/60 bg-background/80 backdrop-blur-sm p-3 space-y-2">
 {/* Quick action chips — همیشه قابل دسترسی */}
 {!streaming && (
 <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
 {QUICK_ACTIONS.map((action) => {
 const Icon = action.icon;
 return (
 <button
 key={action.label}
 onClick={() => sendMessage(action.label)}
 disabled={!hasToken || loading}
 className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-card hover:bg-accent hover:border-primary/40 px-2.5 py-1 text-[11px] transition-all hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
 >
 <Icon className="h-3 w-3 text-primary/70" />
 {action.label}
 </button>
 );
 })}
 </div>
 )}
 <div className="relative rounded-2xl border border-border bg-card focus-within:border-primary/40 transition-colors">
 <Textarea
 ref={textareaRef}
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={onKeyDown}
 placeholder="سوال مالی خود را بنویسید..."
 rows={1}
 disabled={!hasToken}
 className="min-h-[44px] max-h-40 resize-none border-0 bg-transparent px-4 py-3 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
 />
 <div className="flex items-center justify-between px-2 pb-2">
 <span className="text-[10px] text-muted-foreground px-2">
 Enter برای ارسال • Shift+Enter خط جدید
 </span>
 {streaming? (
 <Button
 size="sm"
 variant="destructive"
 onClick={stop}
 className="h-8 gap-1.5 rounded-lg text-xs"
 >
 <Square className="h-3.5 w-3.5 fill-current" />
 توقف
 </Button>
 ): (
 <Button
 size="sm"
 onClick={() => sendMessage()}
 disabled={!input.trim() || loading ||!hasToken}
 className="h-8 w-8 rounded-lg p-0"
 aria-label="ارسال"
 >
 <ArrowUp className="h-4 w-4" />
 </Button>
 )}
 </div>
 </div>
 </footer>
 </motion.aside>
 </>
 )}
 </AnimatePresence>
 </>
 );
}

// ============ Message Bubble ============
interface MessageBubbleProps {
 message: ChatMessage;
 onCopy: () => void;
 copied: boolean;
 streaming: boolean;
}

function MessageBubble({
 message,
 onCopy,
 copied,
 streaming,
}: MessageBubbleProps) {
 const isUser = message.role === "user";
 const isEmpty =!message.content && streaming;

 if (isUser) {
 return (
 <motion.div
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 className="flex justify-end"
 >
 <div className="max-w-[85%] rounded-2xl rounded-be-sm bg-gradient-to-br from-primary to-primary/90 px-4 py-2.5 text-sm text-primary-foreground shadow-md shadow-primary/20">
 <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
 </div>
 </motion.div>
 );
 }

 return (
 <motion.div
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 className="flex justify-start"
 >
 <div className="w-full max-w-[92%]">
 <div className="rounded-2xl rounded-bs-sm border border-border bg-card px-4 py-3 shadow-sm">
 {/* avatar row */}
 <div className="flex items-center gap-2 mb-1.5">
 <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary">
 <Sparkles className="h-3 w-3" />
 </div>
 <span className="text-[10px] font-medium text-muted-foreground">
 دستیار مالی
 </span>
 </div>

 {isEmpty? (
 <TypingDots />
 ): (
 <div className="text-foreground">
 {renderMarkdown(message.content)}
 {streaming && (
 <span className="inline-block w-1.5 h-3.5 bg-primary ms-0.5 align-middle animate-pulse" />
 )}
 </div>
 )}

 {/* Tools used badges — هم در حین streaming و هم پس از آن نمایش داده می‌شود */}
 {message.toolsUsed && message.toolsUsed.length > 0 && (
 <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center gap-1.5 flex-wrap">
 <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
 {streaming? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): (
 <Wrench className="h-3 w-3" />
 )}
 {streaming? "در حال بررسی داده‌ها...": "ابزارهای استفاده‌شده:"}
 </span>
 {message.toolsUsed.map((t) => {
 const ToolIcon = TOOL_ICONS[t];
 return (
 <Badge
 key={t}
 variant="secondary"
 className={`h-5 gap-1 px-2 text-[10px] font-medium ${streaming? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300": "bg-primary/10 text-primary"}`}
 >
 {ToolIcon && <ToolIcon className="h-2.5 w-2.5" />}
 {TOOL_LABELS[t] || t}
 </Badge>
 );
 })}
 </div>
 )}
 </div>

 {/* Action row */}
 {!streaming && message.content && (
 <div className="flex items-center gap-2 mt-1.5 px-1">
 <button
 onClick={onCopy}
 className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
 aria-label="کپی پاسخ"
 >
 {copied? (
 <>
 <Check className="h-3 w-3 text-emerald-500" />
 کپی شد
 </>
 ): (
 <>
 <Copy className="h-3 w-3" />
 کپی
 </>
 )}
 </button>
 {message.createdAt && (
 <span className="text-[10px] text-muted-foreground/70">
 {toPersianDigits(
 new Date(message.createdAt).toLocaleTimeString("fa-IR", {
 hour: "2-digit",
 minute: "2-digit",
 })
 )}
 </span>
 )}
 </div>
 )}
 </div>
 </motion.div>
 );
}
