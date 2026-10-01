"use client";

/**
 * VoiceCommander — فرمان صوتی شناور برای ناوبری و اقدامات سریع
 *
 * دکمه‌ی شناور میکروفون در گوشه‌ی پایین (جدا از voice-invoice-input).
 * FIX(voice): قبلاً از Web Speech API مرورگر استفاده می‌شد که در اکثر
 * مرورگرها (بدون پشتیبانی فارسی یا بدون دسترسی به سرویس گوگل) بی‌صدا
 * شکست می‌خورد و «هیچ اتفاقی نمی‌افتاد». حالا ضبط با MediaRecorder انجام
 * می‌شود و تبدیل گفتار به متن با ASR سمت سرور (/api/ai/transcribe) —
 * پس در همه‌ی مرورگرهای مدرن کار می‌کند.
 *
 * فرمان‌های پشتیبانی‌شده:
 * - «برو به فاکتورها» navigate to invoices
 * - «ثبت فاکتور جدید» باز کردن فرم فاکتور
 * - «نمایش داشبورد» رفتن به داشبورد
 * - «باز کردن دستیار» باز کردن دستیار AI
 * - «جستجوی [کلیدواژه]» باز کردن جستجو با کلیدواژه
 * - «برو به انبار» inventory
 * - «برو به خزانه‌داری» treasury
 * - «گزارش‌ها» reports-builder
 *
 * فعال/غیرفعال‌شدن از طریق localStorage (key: hoshhesab_voice_commander_enabled).
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { toEnglishDigits } from "@/lib/persian";
import { useVoiceAsr } from "@/hooks/use-voice-asr";

/* ============ نگاشت فرمان اقدام ============ */
interface VoiceCommand {
 id: string;
 label: string;
 patterns: RegExp[];
 action: "navigate" | "new-invoice" | "open-assistant" | "search";
 target?: string;
 description: string;
}

const COMMANDS: VoiceCommand[] = [
 {
  id: "goto-invoices",
  label: "برو به فاکتورها",
  patterns: [/برو\s*به\s*فاکتور/, /فاکتورها/, /باز\s*کن\s*فاکتور/],
  action: "navigate",
  target: "invoices",
  description: "هدایت به ماژول خرید و فروش",
 },
 {
  id: "new-invoice",
  label: "ثبت فاکتور جدید",
  patterns: [/ثبت\s*فاکتور/, /فاکتور\s*جدید/, /فاکتور\s*تازه/, /باز\s*کن\s*فاکتور\s*جدید/],
  action: "new-invoice",
  description: "باز کردن فرم ثبت فاکتور جدید",
 },
 {
  id: "goto-dashboard",
  label: "نمایش داشبورد",
  patterns: [/نمایش\s*داشبورد/, /داشبورد/, /برو\s*به\s*داشبورد/, /خانه/],
  action: "navigate",
  target: "dashboard",
  description: "هدایت به داشبورد اصلی",
 },
 {
  id: "open-assistant",
  label: "باز کردن دستیار",
  patterns: [/باز\s*کن\s*دستیار/, /دستیار/, /هوش‌یار/, /هوشیار/, /چت/],
  action: "open-assistant",
  description: "باز کردن دستیار مالی هوشمند",
 },
 {
  id: "goto-inventory",
  label: "برو به انبار",
  patterns: [/برو\s*به\s*انبار/, /انبار/, /کالاها/],
  action: "navigate",
  target: "inventory",
  description: "هدایت به ماژول انبار و کالا",
 },
 {
  id: "goto-treasury",
  label: "برو به خزانه‌داری",
  patterns: [/برو\s*به\s*خزانه/, /خزانه/, /چک‌ها/, /بانک/],
  action: "navigate",
  target: "treasury",
  description: "هدایت به ماژول خزانه‌داری",
 },
 {
  id: "goto-reports",
  label: "گزارش‌ها",
  patterns: [/گزارش/, /گزارش‌ها/, /باز\s*کن\s*گزارش/],
  action: "navigate",
  target: "reports-builder",
  description: "هدایت به گزارش‌ساز",
 },
 {
  id: "goto-crm",
  label: "برو به CRM",
  patterns: [/برو\s*به\s*CRM/, /سی\s*آر\s*ام/, /مشتریان/],
  action: "navigate",
  target: "crm",
  description: "هدایت به ماژول CRM",
 },
];

const SEARCH_PATTERN = /جستجو(?:ی)?\s+(?:برای\s+)?(.+)/i;

/* ============ کامپوننت ============ */
interface VoiceCommanderProps {
 onNavigate?: (moduleId: string) => void;
 onNewInvoice?: () => void;
 onOpenAssistant?: () => void;
 onSearch?: (query: string) => void;
}

const STORAGE_KEY = "hoshhesab_voice_commander_enabled";

export function VoiceCommander({
 onNavigate,
 onNewInvoice,
 onOpenAssistant,
 onSearch,
}: VoiceCommanderProps) {
 const { toast } = useToast();
 const [enabled, setEnabled] = React.useState(false);
 const [transcript, setTranscript] = React.useState("");
 const [lastCommand, setLastCommand] = React.useState<string | null>(null);
 const [panelOpen, setPanelOpen] = React.useState(false);
 // FIX(B11): وقتی پنل دستیار باز است، ویجت صوتی پنهان می‌شود (تداخل موبایل)
 const [assistantOpen, setAssistantOpen] = React.useState(false);

 // ─── ضبط + تبدیل به متن با ASR سرور (FIX(voice)) ───
 const voice = useVoiceAsr({
  maxDurationMs: 10_000,
  silenceMs: 1_400,
  initialSilenceMs: 4_000,
  onError: (msgFa) => {
   toast({ title: "خطای صوتی", description: msgFa, variant: "destructive" });
  },
  onTranscript: (text) => {
   if (!text) {
    // FIX(v13-sound): بدون toast خطا — فقط یادداشت داخلی بی‌صدا
    setLastCommand(null);
    return;
   }
   setTranscript(text);
   const matched = handleCommandRef.current(text);
   if (!matched) {
    setLastCommand("فرمان شناسایی نشد");
    toast({
     title: "فرمان صوتی شناسایی نشد",
     description: `متن شنیده‌شده: «${text.slice(0, 60)}»`,
     variant: "destructive",
    });
   }
  },
 });

 // handleCommand باید از داخل callback هوک با آخرین props فراخوانی شود
 const handleCommand = React.useCallback(
  (text: string): boolean => {
   const normalized = toEnglishDigits(text).trim();
   // ۱) بررسی الگوی جستجو
   const searchMatch = normalized.match(SEARCH_PATTERN);
   if (searchMatch && searchMatch[1] && onSearch) {
    const query = searchMatch[1].trim();
    setLastCommand(`جستجو برای: «${query}»`);
    onSearch(query);
    toast({
     title: "فرمان صوتی اجرا شد",
     description: `جستجوی «${query}»`,
    });
    return true;
   }
   // ۲) تطبیق با الگوهای ناوبری
   for (const cmd of COMMANDS) {
    for (const re of cmd.patterns) {
     if (re.test(normalized)) {
      setLastCommand(cmd.label);
      switch (cmd.action) {
       case "navigate":
        if (cmd.target) onNavigate?.(cmd.target);
        break;
       case "new-invoice":
        onNewInvoice?.();
        break;
       case "open-assistant":
        onOpenAssistant?.();
        break;
      }
      toast({
       title: "فرمان صوتی اجرا شد",
       description: cmd.description,
      });
      return true;
     }
    }
   }
   return false;
  },
  [onNavigate, onNewInvoice, onOpenAssistant, onSearch, toast]
 );
 const handleCommandRef = React.useRef(handleCommand);
 // به‌روزرسانی ref در effect (نه حین render — قاعدهٔ react-hooks/refs):
 // callback ضبط صدا باید همیشه آخرین handleCommand را با تازه‌ترین props صدا بزند
 React.useEffect(() => {
  handleCommandRef.current = handleCommand;
 });

 React.useEffect(() => {
  const onOpen = () => setAssistantOpen(true);
  const onClose = () => setAssistantOpen(false);
  window.addEventListener("hoshhesab:assistant-open", onOpen);
  window.addEventListener("hoshhesab:assistant-close", onClose);
  return () => {
   window.removeEventListener("hoshhesab:assistant-open", onOpen);
   window.removeEventListener("hoshhesab:assistant-close", onClose);
  };
 }, []);

 // بارگذاری تنظیمات از localStorage
 React.useEffect(() => {
  try {
   const stored = localStorage.getItem(STORAGE_KEY);
   if (stored === "true") setEnabled(true);
  } catch {
   // ignore
  }
 }, []);

 // ذخیره‌ی تنظیمات
 const persistEnabled = React.useCallback((value: boolean) => {
  try {
   localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
   // ignore
  }
 }, []);

 const startListening = React.useCallback(() => {
  setTranscript("");
  setLastCommand(null);
  void voice.start();
 }, [voice]);

 const stopListening = React.useCallback(() => {
  voice.stop();
 }, [voice]);

 // توقف ضبط هنگام غیرفعال‌شدن یا unmount
 React.useEffect(() => {
  if (!enabled) {
   voice.cancel();
  }
 }, [enabled]);

 // اگر کاربر فعال کرده باشد، کلید میانبر (Ctrl+Shift+V) برای شروع
 React.useEffect(() => {
  if (!enabled) return;
  const onKey = (e: KeyboardEvent) => {
   if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
    e.preventDefault();
    if (voice.recording || voice.transcribing) {
     stopListening();
    } else {
     startListening();
    }
   }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
 }, [enabled, voice.recording, voice.transcribing, startListening, stopListening]);

 const listening = voice.recording || voice.transcribing;

 // اگر غیرفعال است، چیزی نمایش نده
 // FIX(B11): هنگام باز بودن پنل دستیار، ویجت صوتی کاملاً پنهان می‌شود
 if (assistantOpen) {
  return null;
 }
 if (!enabled &&!panelOpen) {
  return (
   <button
    type="button"
    onClick={() => setPanelOpen(true)}
    className="fixed bottom-24 lg:bottom-28 left-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-md hover:bg-muted transition-colors"
    aria-label="تنظیمات فرمان صوتی"
    title="فرمان صوتی"
   >
    <MicOff className="h-4 w-4 text-muted-foreground" />
   </button>
  );
 }

 return (
  <>
   {/* پنل تنظیمات */}
   <AnimatePresence>
    {panelOpen && (
     <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-24 lg:bottom-28 left-6 z-50 w-80 rounded-xl border border-border bg-card shadow-xl p-4 space-y-3"
     >
      <div className="flex items-center justify-between">
       <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
         <Volume2 className="h-4 w-4" />
        </div>
        <div>
         <p className="text-sm font-bold text-foreground">فرمان صوتی</p>
         <p className="text-xs text-muted-foreground">کنترل با صدای خودتان</p>
        </div>
       </div>
       <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setPanelOpen(false)}
        aria-label="بستن"
       >
        <X className="h-4 w-4" />
       </Button>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
       <div className="space-y-0.5">
        <Label htmlFor="voice-cmd-toggle" className="text-sm font-medium cursor-pointer">
         فعال‌سازی فرمان صوتی
        </Label>
        <p className="text-xs text-muted-foreground">
         میانبر: Ctrl+Shift+V — ضبط با مکث شما متوقف می‌شود
        </p>
       </div>
       <Switch
        id="voice-cmd-toggle"
        checked={enabled}
        onCheckedChange={(v) => {
         setEnabled(v);
         persistEnabled(v);
         if (!v) voice.cancel();
        }}
       />
      </div>
      {enabled && (
       <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">فرمان‌های پشتیبانی‌شده:</p>
        <div className="flex flex-wrap gap-1.5">
         {COMMANDS.map((cmd) => (
          <Badge
           key={cmd.id}
           variant="secondary"
           className="text-[10px] font-normal"
          >
           {cmd.label}
          </Badge>
         ))}
         <Badge variant="outline" className="text-[10px] font-normal">
          جستجوی [کلیدواژه]
         </Badge>
        </div>
       </div>
      )}
     </motion.div>
    )}
   </AnimatePresence>

   {/* دکمه‌ی شناور میکروفون */}
   {enabled && (
    <div className="fixed bottom-24 lg:bottom-28 right-6 z-40 flex flex-col items-start gap-2">
     {/* نمایش وضعیت ضبط و متن شنیده‌شده */}
     <AnimatePresence>
      {(listening || transcript || lastCommand) && (
       <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="max-w-[280px] rounded-lg border border-border bg-card shadow-lg p-3 space-y-1"
       >
        {voice.recording && (
         <div className="flex items-center gap-2 text-xs text-destructive">
          <span className="relative flex h-2.5 w-2.5">
           <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
           <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
          </span>
          <span>در حال ضبط... بعد از مکث، خودکار متوقف می‌شود</span>
         </div>
        )}
        {voice.transcribing && (
         <div className="flex items-center gap-2 text-xs text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>در حال تبدیل صدا به متن...</span>
         </div>
        )}
        {transcript && (
         <p className="text-xs text-foreground leading-relaxed" dir="auto">
          شنیده شد: {transcript}
         </p>
        )}
        {lastCommand && (
         <p className="text-[11px] font-medium text-primary border-t border-border pt-1 mt-1">
          {lastCommand}
         </p>
        )}
       </motion.div>
      )}
     </AnimatePresence>

     {/* دکمه میکروفون */}
     <motion.button
      type="button"
      onClick={listening? stopListening: startListening}
      whileTap={{ scale: 0.92 }}
      className={`relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors ${
       listening
        ? "bg-destructive text-destructive-foreground"
        : "bg-primary text-primary-foreground hover:bg-primary/90"
      }`}
      aria-label={listening? "توقف ضبط": "شروع فرمان صوتی"}
      title={listening? "توقف": "فرمان صوتی (Ctrl+Shift+V)"}
     >
      {listening? (
       <MicOff className="h-5 w-5" />
      ) : (
       <Mic className="h-5 w-5" />
      )}
      {voice.recording && (
       <span className="absolute inline-flex h-14 w-14 animate-ping rounded-full bg-destructive/40" />
      )}
     </motion.button>
    </div>
   )}
  </>
 );
}
