"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 Sparkles,
 X,
 ArrowUp,
 ArrowUpLeft,
 Copy,
 Check,
 RefreshCw,
 Square,
 AlertTriangle,
 Lock,
 ShieldCheck,
 Activity,
 BarChart3,
 TrendingUp,
 TrendingDown,
 Lightbulb,
 DollarSign,
 Users as UsersIcon,
 Cpu,
 Bug,
 CreditCard,
 Megaphone,
 Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toPersianDigits } from "@/lib/persian";

// ============ Types ============
interface ExecutedActionView {
 tool: string;
 label: string;
 success: boolean;
 summary: string;
}

interface ToolResultView {
 tool: string;
 data: Record<string, unknown>;
}

interface ChatMessage {
 id: string;
 role: "user" | "assistant";
 content: string;
 createdAt?: number;
 /** Task 21-D: نتایج ساخت‌یافتهٔ ابزارهای اجراشده در این پاسخ (جدول‌های کوچک) */
 toolResults?: ToolResultView[];
 executedActions?: ExecutedActionView[];
}

interface PersistedHistory {
 messages: ChatMessage[];
 savedAt: number;
}

// ============ Constants ============
const TOKEN_KEY = "hoshhesab_admin_token";
const HISTORY_KEY = "hoshhesab_root_chat";

const SUGGESTED_PROMPTS: { icon: React.ElementType; label: string }[] = [
 { icon: BarChart3, label: "آمار کلی سیستم چطور است؟" },
 { icon: TrendingDown, label: "خطر ریزش مشتریان؟" },
 { icon: Bug, label: "گزارش‌های باگ باز" },
 { icon: CreditCard, label: "پرداخت‌های ناموفق اخیر" },
 { icon: Megaphone, label: "ارسال اطلاعیه همگانی" },
 { icon: Activity, label: "سلامت زیرساخت (SAAN)" },
 { icon: UsersIcon, label: "فعالیت کاربران اخیر چطور است؟" },
 { icon: DollarSign, label: "توزیع پلن‌ها و درآمد تخمینی" },
 { icon: Lightbulb, label: "پیشنهاد بهبود کسب‌وکار پلتفرم بده" },
];

const INITIAL_GREETING: ChatMessage = {
 id: "greeting",
 role: "assistant",
 content:
 "سلام. من «روت» هستم — ایجنت اجرایی سوپرادمین پلتفرم هوش. علاوه بر **آمار زنده**، خودم کارها را انجام می‌دهم:\n\n- آمار، توزیع پلن‌ها، فعالیت کاربران، سلامت زیرساخت\n- کشف خودکار **ریسک ریزش مشتریان**، باگ‌های باز و خطاهای درگاه پرداخت\n- **ارسال اطلاعیه همگانی** (با تأیید شما) به همه کاربران\n\nسوال مدیریتی بپرسید یا یکی از پیشنهادها را انتخاب کنید — من ابزار اجرا می‌کنم، کار را به پنل‌ها نمی‌اندازم.",
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
 "text-base font-bold mt-3 mb-1 text-primary",
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

 // Task 21-D: Markdown table — | a | b | با خط جداکننده |---|---|
 if (line.trim().startsWith("|")) {
  const tableLines: string[] = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
   tableLines.push(lines[i].trim());
   i++;
  }
  const parseRow = (raw: string): string[] =>
   raw.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  if (tableLines.length >= 2 && /^\|[\s:|-]+\|?$/.test(tableLines[1])) {
   const headers = parseRow(tableLines[0]);
   const rows = tableLines.slice(2).map(parseRow);
   blocks.push(
    <div key={key++} className="my-2 overflow-x-auto">
     <table className="w-full text-[11px] border-collapse">
      <thead>
       <tr className="border-b border-border bg-muted/50">
        {headers.map((h, hi) => (
         <th key={hi} className="px-2 py-1 text-start font-semibold whitespace-nowrap">
          {renderInline(h, key++)}
         </th>
        ))}
       </tr>
      </thead>
      <tbody>
       {rows.map((r, ri) => (
        <tr key={ri} className="border-b border-border/50">
         {headers.map((_, ci) => (
          <td key={ci} className="px-2 py-1 whitespace-nowrap">
           {renderInline(r[ci] ?? "", key++)}
          </td>
         ))}
        </tr>
       ))}
      </tbody>
     </table>
    </div>
   );
   continue;
  }
  // جدول بدون جداکننده — خط عادی رندر شود
  blocks.push(
   <p key={key++} className="text-[13px] leading-relaxed">
    {renderInline(tableLines.join(" "), key++)}
   </p>
  );
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
export function RootAIPanel() {
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
 // Task 21-D: کامپوزر اطلاعیه همگانی
 const [composerOpen, setComposerOpen] = React.useState(false);

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

 const token = (() => {
 try {
 return localStorage.getItem(TOKEN_KEY);
 } catch {
 /* localStorage not available (private mode) */
 return null;
 }
 })();
 if (!token) {
 setHasToken(false);
 setError("برای استفاده از روت، وارد شوید.");
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
 createdAt: Date.now(),
 };

 // Snapshot history for API (without empty placeholder)
 const apiMessages = [...messages, userMsg]
.filter((m) => m.id!== "greeting")
.map((m) => ({ role: m.role, content: m.content }));

 setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
 setInput("");
 setLoading(true);
 setStreaming(true);

 const controller = new AbortController();
 abortRef.current = controller;

 try {
 const res = await fetch("/api/platform/root-ai", {
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
 if (res.status === 401) msg = "نشست شما منقضی شده. دوباره وارد شوید.";
 else if (res.status === 429) msg = "درخواست‌های زیادی ارسال کرده‌اید. کمی صبر کنید.";
 else if (res.status >= 500) msg = "خطای سرور. در صورت تکرار با پشتیبانی تماس بگیرید.";
 throw new Error(msg);
 }

 if (!res.body) throw new Error("ارتباط برقرار نشد. دوباره تلاش کنید.");

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer = "";
 let acc = "";
 // Task 21-D: نتایج ساخت‌یافتهٔ ابزار (رویداد meta قبل از متن)
 let metaResults: ToolResultView[] = [];
 let metaActions: ExecutedActionView[] = [];

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
 if (data === "[DONE]") continue;
 try {
 const parsed = JSON.parse(data);
 if (parsed.meta) {
  if (Array.isArray(parsed.meta.toolResults)) {
  metaResults = parsed.meta.toolResults as ToolResultView[];
  }
  if (Array.isArray(parsed.meta.executedActions)) {
  metaActions = parsed.meta.executedActions as ExecutedActionView[];
  }
 }
 if (parsed.delta) {
 acc += parsed.delta;
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {...last, content: acc };
 }
 return next;
 });
 }
 if (parsed.error) throw new Error(parsed.error);
 } catch {
 // ignore single-chunk parse errors
 }
 }
 }

 // Task 21-D: چسباندن نتایج ابزار به پیام دستیار (جدول‌های کوچک)
 if (metaResults.length > 0 || metaActions.length > 0) {
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
  next[next.length - 1] = {
  ...last,
  toolResults: metaResults.length > 0 ? metaResults : undefined,
  executedActions: metaActions.length > 0 ? metaActions : undefined,
  };
 }
 return next;
 });
 }

 // Fallback to non-streaming if no content
 if (!acc) {
 try {
 const fallback = await fetch("/api/platform/root-ai", {
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
 const fbResults: ToolResultView[] = Array.isArray(json.toolResults)
 ? (json.toolResults as ToolResultView[])
 : [];
 const fbActions: ExecutedActionView[] = Array.isArray(json.executedActions)
 ? (json.executedActions as ExecutedActionView[])
 : [];
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {
 ...last,
 content: reply,
 toolResults: fbResults.length > 0 ? fbResults : undefined,
 executedActions: fbActions.length > 0 ? fbActions : undefined,
 };
 }
 return next;
 });
 } else {
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {...last, content: "پاسخی دریافت نشد. دوباره تلاش کنید." };
 }
 return next;
 });
 }
 } catch {
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant") {
 next[next.length - 1] = {...last, content: "پاسخی دریافت نشد. دوباره تلاش کنید." };
 }
 return next;
 });
 }
 }
 } catch (err) {
 const e = err as Error;
 if (e.name === "AbortError") {
 setMessages((prev) => {
 const next = [...prev];
 const last = next[next.length - 1];
 if (last && last.role === "assistant" && last.content.trim() === "") {
 next[next.length - 1] = {...last, content: "(متوقف شد)" };
 }
 return next;
 });
 } else {
 const msg = e.message || "ارتباط برقرار نشد. دوباره تلاش کنید.";
 setError(msg);
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

 return (
 <motion.div
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 className="space-y-4"
 >
 {/* Header card (glassmorphism) */}
 <div className="rounded-xl border border-border bg-background/70 backdrop-blur-xl shadow-sm overflow-hidden">
 <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-gradient-to-l from-primary/5 to-transparent">
 <div className="flex items-center gap-3">
 <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <span className="absolute inset-0 rounded-xl bg-primary/20 animate-ping opacity-40" />
 <Sparkles className="h-5 w-5 relative" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-sm font-bold">روت — دستیار سوپرادمین</h2>
 <Badge
 variant="secondary"
 className="h-5 px-1.5 text-[10px] font-mono bg-primary/10 text-primary gap-1"
 >
 <ShieldCheck className="h-3 w-3" />
 SYSTEM ACCESS
 </Badge>
 </div>
 <div className="flex items-center gap-1.5 mt-0.5">
 <span className="relative flex h-2 w-2">
 <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
 </span>
 <span className="text-[10px] text-muted-foreground">
 متصل به پایگاه داده پلتفرم • GLM-4.6
 </span>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setComposerOpen(true)}
 className="h-8 gap-1.5 text-xs"
 aria-label="ارسال اطلاعیه همگانی"
 >
 <Megaphone className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">اطلاعیه همگانی</span>
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={startNewChat}
 className="h-8 gap-1.5 text-xs"
 >
 <RefreshCw className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">چت جدید</span>
 </Button>
 </div>
 </div>

 {/* Body — chat area (height-constrained) */}
 <div
 ref={scrollRef}
 onScroll={handleScroll}
 className="h-[calc(100vh-340px)] min-h-[420px] overflow-y-auto px-4 py-4 space-y-4 scroll-smooth bg-muted/10"
 style={{
 scrollbarWidth: "thin",
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
 برای استفاده از دستیار روت، به عنوان سوپرادمین وارد شوید.
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

 {/* Suggested prompts */}
 {messages.length <= 1 &&!loading && (
 <div className="space-y-3 pt-2">
 <p className="text-[11px] font-medium text-muted-foreground px-1 flex items-center gap-1.5">
 <Activity className="h-3 w-3 text-primary" />
 دسترسی‌های روت:
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 {SUGGESTED_PROMPTS.map((p) => {
 const Icon = p.icon;
 return (
 <button
 key={p.label}
 onClick={() => sendMessage(p.label)}
 className="group flex items-center gap-2.5 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 px-3 py-2.5 text-start text-[12px] transition-all hover:shadow-sm"
 >
 <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
 <Icon className="h-3.5 w-3.5" />
 </span>
 <span className="flex-1">{p.label}</span>
 <ArrowUpLeft className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
 </button>
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
 <div className="border-t border-border/60 bg-background/80 backdrop-blur-sm p-3">
 <div className="relative rounded-2xl border border-border bg-card focus-within:border-primary/40 transition-colors">
 <Textarea
 ref={textareaRef}
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={onKeyDown}
 placeholder="سوال مدیریتی خود را از روت بپرسید..."
 rows={1}
 disabled={!hasToken}
 className="min-h-[44px] max-h-40 resize-none border-0 bg-transparent px-4 py-3 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
 />
 <div className="flex items-center justify-between px-2 pb-2">
 <span className="text-[10px] text-muted-foreground px-2 flex items-center gap-1">
 <Cpu className="h-3 w-3" />
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
 className="h-8 w-8 rounded-lg p-0 bg-primary hover:bg-primary/90"
 aria-label="ارسال"
 >
 <ArrowUp className="h-4 w-4" />
 </Button>
 )}
 </div>
 </div>
 </div>
 </div>
  {/* Task 21-D: کامپوزر اطلاعیه همگانی — تأیید دومرحله‌ای */}
 <BroadcastComposer
 open={composerOpen}
 onClose={() => setComposerOpen(false)}
 onSend={(text) => {
 setComposerOpen(false);
 void sendMessage(text);
 }}
 />
 </motion.div>
 );
}

// ============ Task 21-D: جدول‌های کوچک نتایج ابزار ============
interface ToolColumn {
 key: string;
 label: string;
}

const TOOL_TABLE_COLUMNS: Record<string, { listKey: string; columns: ToolColumn[] }> = {
 query_plan_distribution: {
  listKey: "plans",
  columns: [
   { key: "label", label: "پلن" },
   { key: "total", label: "سازمان" },
   { key: "active", label: "فعال" },
   { key: "trial", label: "تریال" },
   { key: "estimatedAnnualRevenueToman", label: "درآمد تخمینی (تومان)" },
  ],
 },
 query_churn_risk: {
  listKey: "tenants",
  columns: [
   { key: "tenant", label: "سازمان" },
   { key: "plan", label: "پلن" },
   { key: "risk", label: "ریسک" },
   { key: "daysSinceActivity", label: "روز بی‌فعالیت" },
   { key: "reason", label: "دلیل" },
  ],
 },
 query_bug_reports: {
  listKey: "reports",
  columns: [
   { key: "title", label: "عنوان باگ" },
   { key: "severity", label: "شدت" },
   { key: "tenant", label: "سازمان" },
   { key: "status", label: "وضعیت" },
   { key: "createdAt", label: "تاریخ" },
  ],
 },
 query_payments_recent: {
  listKey: "events",
  columns: [
   { key: "tenant", label: "سازمان" },
   { key: "name", label: "رویداد" },
   { key: "status", label: "وضعیت" },
   { key: "updatedAt", label: "به‌روزرسانی" },
  ],
 },
 query_active_users: {
  listKey: "sessionsByDay",
  columns: [
   { key: "label", label: "روز" },
   { key: "count", label: "نشست" },
  ],
 },
};

function ToolResultTables({ results }: { results: ToolResultView[] }) {
 if (!results || results.length === 0) return null;
 return (
  <div className="mt-2 space-y-2">
   {results.map((r, idx) => {
    const cfg = TOOL_TABLE_COLUMNS[r.tool];
    const data = r.data ?? {};
    if (cfg) {
     const list = Array.isArray(data[cfg.listKey])
      ? (data[cfg.listKey] as Array<Record<string, unknown>>)
      : [];
     if (list.length === 0) return null;
     return (
      <div
       key={`${r.tool}-${idx}`}
       className="overflow-x-auto rounded-lg border border-border/70 bg-muted/20"
      >
       <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground border-b border-border/50 flex items-center gap-1">
        <Activity className="h-3 w-3 text-primary" />
        {r.tool === "query_plan_distribution"
         ? "توزیع پلن‌ها"
         : r.tool === "query_churn_risk"
          ? "سازمان‌های ریسک ریزش"
          : r.tool === "query_bug_reports"
           ? "باگ‌های باز"
           : r.tool === "query_payments_recent"
            ? "رویدادهای درگاه پرداخت"
            : "فعالیت کاربران"}
        <span className="text-muted-foreground/60">
         ({toPersianDigits(String(list.length))} ردیف)
        </span>
       </div>
       <table className="w-full text-[11px]">
        <tbody>
         {list.slice(0, 8).map((row, ri) => (
          <tr key={ri} className="border-b border-border/40 last:border-0">
           {cfg.columns.map((c) => {
            const v = row[c.key];
            const isRisk = c.key === "risk";
            const riskHigh = isRisk && v === "بالا";
            const riskMed = isRisk && v === "متوسط";
            const isSeverity = c.key === "severity";
            return (
             <td
              key={c.key}
              className={`px-2 py-1 whitespace-nowrap ${
               isRisk || isSeverity
                ? riskHigh
                 ? "text-destructive font-semibold"
                 : riskMed
                  ? "text-amber-600 dark:text-amber-400 font-medium"
                  : "text-foreground"
                : "text-muted-foreground"
              }`}
             >
              {v === null || v === undefined
               ? "—"
               : typeof v === "number"
                ? toPersianDigits(String(v))
                : String(v).length > 28
                 ? `${String(v).slice(0, 28)}…`
                 : String(v)}
             </td>
            );
           })}
          </tr>
         ))}
        </tbody>
       </table>
       {list.length > 8 && (
        <div className="px-2 py-1 text-[10px] text-muted-foreground">
         و {toPersianDigits(String(list.length - 8))} ردیف دیگر…
        </div>
       )}
      </div>
     );
    }
    // broadcast / سلامت — نمایش کلید-مقدار
    const entries = Object.entries(data).filter(
     ([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    );
    if (entries.length === 0) return null;
    return (
     <div
      key={`${r.tool}-${idx}`}
      className="rounded-lg border border-border/70 bg-muted/20 px-2 py-1.5 text-[11px] space-y-0.5"
     >
      {entries.slice(0, 8).map(([k, v]) => (
       <div key={k} className="flex justify-between gap-2">
        <span className="text-muted-foreground">{k}</span>
        <span className="font-medium">{String(v)}</span>
       </div>
      ))}
     </div>
    );
   })}
  </div>
 );
}

// ============ Task 21-D: کامپوزر اطلاعیه همگانی (با مرحلهٔ تأیید) ============
function BroadcastComposer({
 open,
 onClose,
 onSend,
}: {
 open: boolean;
 onClose: () => void;
 onSend: (text: string) => void;
}) {
 const [title, setTitle] = React.useState("");
 const [body, setBody] = React.useState("");
 const [type, setType] = React.useState("INFO");
 const [confirming, setConfirming] = React.useState(false);

 const valid = title.trim().length >= 3 && body.trim().length >= 10;

 const doSend = () => {
  onSend(
   `اطلاعیه همگانی (تأییدشده) — send_broadcast را با confirm=true اجرا کن: عنوان: «${title.trim()}» / متن: «${body.trim()}» / نوع: ${type}`
  );
  setTitle("");
  setBody("");
  setType("INFO");
  setConfirming(false);
  onClose();
 };

 return (
  <>
   {open && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
     <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
       <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Megaphone className="h-4 w-4" />
       </div>
       <div>
       <h3 className="text-sm font-bold">ارسال اطلاعیه همگانی</h3>
       <p className="text-[11px] text-muted-foreground">
        اعلان درون‌برنامه‌ای برای همه کاربران پلتفرم
       </p>
       </div>
      </div>
      <div className="space-y-2">
       <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="عنوان اطلاعیه (مثلاً: به‌روزرسانی مهم سامانه)"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        maxLength={120}
       />
       <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="متن اطلاعیه…"
        rows={4}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
        maxLength={2000}
       />
       <div className="flex gap-1.5">
        {["INFO", "WARNING", "PROMO", "FEATURE"].map((t) => (
         <button
          key={t}
          onClick={() => setType(t)}
          className={`rounded-full px-2.5 py-1 text-[11px] border transition-colors ${
           type === t
            ? "border-primary bg-primary/10 text-primary font-medium"
            : "border-border text-muted-foreground hover:bg-accent"
          }`}
         >
          {t === "INFO" ? "اطلاع‌رسانی" : t === "WARNING" ? "هشدار" : t === "PROMO" ? "تبلیغاتی" : "قابلیت جدید"}
         </button>
        ))}
       </div>
      </div>
      {confirming && (
       <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 space-y-1">
        <div className="flex items-center gap-1 font-semibold">
         <AlertTriangle className="h-3.5 w-3.5" />
         تأیید نهایی ارسال
        </div>
        <p>
         این پیام برای <b>همه کاربران</b> ارسال می‌شود — عنوان «{title.trim()}». مطمئنی؟
        </p>
        <div className="flex gap-2 pt-1">
         <button
          onClick={doSend}
          disabled={!valid}
          className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1"
         >
          <Send className="h-3 w-3" />
          بله، ارسال کن
         </button>
         <button
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs"
         >
          انصراف
         </button>
        </div>
       </div>
      )}
      <div className="flex justify-between items-center pt-1">
       <span className="text-[10px] text-muted-foreground">
        {valid ? "آماده ارسال" : "عنوان (۳+ کاراکتر) و متن (۱۰+ کاراکتر) الزامی است"}
       </span>
       {!confirming ? (
        <div className="flex gap-2">
         <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs">
          بستن
         </button>
         <button
          onClick={() => setConfirming(true)}
          disabled={!valid}
          className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50"
         >
          ادامه و تأیید
         </button>
        </div>
       ) : null}
      </div>
     </div>
    </div>
   )}
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
 <span className="text-[10px] font-medium text-muted-foreground">روت</span>
 <Badge variant="secondary" className="h-4 px-1 text-[9px] font-mono bg-primary/5 text-primary/70">
 SYSTEM
 </Badge>
 </div>

 {isEmpty? (
 <TypingDots />
 ): (
 <div className="text-foreground">
 {renderMarkdown(message.content)}
 {streaming && (
 <span className="inline-block w-1.5 h-3.5 bg-primary ms-0.5 align-middle animate-pulse" />
 )}
 {/* Task 21-D: جدول‌های کوچک نتایج ابزار */}
 {message.toolResults && message.toolResults.length > 0 && (
 <ToolResultTables results={message.toolResults} />
 )}
 {/* کارت‌های اکشن اجراشده */}
 {message.executedActions && message.executedActions.length > 0 && (
 <div className="mt-2 flex flex-wrap gap-1.5">
 {message.executedActions.map((a, ai) => (
 <span
 key={ai}
 className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
 a.success
 ? "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
 : "border-destructive/40 bg-destructive/5 text-destructive"
 }`}
 title={a.summary}
 >
 {a.success? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
 {a.label}
 </span>
 ))}
 </div>
 )}
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

export default RootAIPanel;
