"use client";

/**
 * VoiceInvoiceInput — ورودی صوتی فاکتور
 *
 * FIX(voice): قبلاً از Web Speech API مرورگر استفاده می‌شد که در اکثر
 * مرورگرها (بدون پشتیبانی فارسی یا بدون دسترسی به سرویس گوگل) بی‌صدا شکست
 * می‌خورد و «هیچ اتفاقی نمی‌افتاد». حالا ضبط با MediaRecorder انجام می‌شود و
 * تبدیل گفتار به متن با ASR سمت سرور (/api/ai/transcribe) — در همه‌ی مرورگرهای
 * مدرن (Chrome/Edge/Firefox/Safari) کار می‌کند.
 *
 * کارهایی که انجام می‌دهد:
 * - ضبط گفتار با MediaRecorder + توقف خودکار روی مکث کاربر
 * - تبدیل گفتار به متن فارسی با سرویس ASR سرور
 * - پارس متن فارسی به فیلدهای فاکتور با regex (همان پارسر قبلی)
 * - نمایش نتیجه پارس‌شده و دکمه «تأیید و ثبت»
 * - مدیریت خطا با پیام‌های فارسی
 *
 * مثال جملاتی که پارس می‌شود:
 * - "فاکتور فروش برای شرکت پارس به مبلغ ۴۵۰ هزار تومان"
 * { type: "SALE", party: "شرکت پارس", amount: 450000 }
 * - "خرید از تأمین‌کننده آریا ۲ عدد کالا"
 * { type: "PURCHASE", party: "تأمین‌کننده آریا", quantity: 2 }
 * - "فروش به مشتری رضایی مبلغ ۱.۲ میلیون تومان ۳ عدد"
 * { type: "SALE", party: "مشتری رضایی", amount: 1200000, quantity: 3 }
 */

import * as React from "react";
import {
 Mic,
 Loader2,
 CheckCircle2,
 AlertCircle,
 RotateCcw,
 Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, toPersianDigits, toEnglishDigits } from "@/lib/persian";
// FIX(voice): ضبط با MediaRecorder + تبدیل به متن با ASR سمت سرور
import { useVoiceAsr } from "@/hooks/use-voice-asr";

/* ============ انواع ============ */

export interface ParsedInvoice {
 type: "SALE" | "PURCHASE";
 party?: string;
 amount?: number;
 quantity?: number;
 description?: string;
 rawText?: string;
}

/* ============ پارسر متن فارسی ============ */

// الگوی شناسایی نوع فاکتور
const SALE_KEYWORDS =
 /(فاکتور\s*فروش|فروش\s*به|فروش\s*برای|صورتحساب\s*فروش|ب\s*فروش)/i;
const PURCHASE_KEYWORDS =
 /(خرید\s*از|فاکتور\s*خرید|صورتحساب\s*خرید|ب\s*خرید|تأمین|تامین)/i;

// الگوی شناسایی طرف‌حساب: «برای/به/از [عبارت] به مبلغ» یا «[عبارت] مبلغ»
function extractParty(text: string): string | undefined {
 // «برای شرکت پارس به مبلغ»
 let m = text.match(
 /(?:برای|به|از)\s+([\u0600-\u06FF\sآابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءؤئيك]+?)(?=\s+(?:به\s+مبلغ|به\s+مبلغ\s+مبلغ|مبلغ|به\s+مبلغ\s+تومان|مبلغ\s+مبلغ|به\s+مبلغ|تعداد|عدد|تومان|ریال|$))/i
 );
 if (m && m[1]) {
 const name = m[1].trim().replace(/\s+/g, " ");
 if (name.length >= 2 && name.length <= 80) return name;
 }
 // «خرید از تأمین‌کننده آریا ۲ عدد»
 m = text.match(
 /(?:خرید\s+از|خرید\s*برای|از)\s+([\u0600-\u06FF\sآابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءؤئيك]+?)(?=\s+(?:مبلغ|به\s+مبلغ|تعداد|عدد|تومان|ریال|$))/i
 );
 if (m && m[1]) {
 const name = m[1].trim().replace(/\s+/g, " ");
 if (name.length >= 2 && name.length <= 80) return name;
 }
 return undefined;
}

// الگوی شناسایی مبلغ: «۴۵۰ هزار تومان»، «۱.۲ میلیون»، «۳۰۰۰۰۰ تومان»، «دویست هزار»
const FA_TO_EN_DIGIT_RE = /[۰-۹٠-٩]/g;

function faDigitsToNumber(s: string): number | null {
 const en = toEnglishDigits(s).replace(/[،,]/g, "");
 const n = Number(en);
 if (!Number.isFinite(n)) return null;
 return n;
}

function extractAmount(text: string): number | undefined {
 // «مبلغ ۱.۲ میلیون تومان» یا «۴۵۰ هزار تومان» یا «۳۰۰۰۰۰ تومان»
 const patterns: RegExp[] = [
 // میلیارد تومان / میلیون تومان / هزار تومان
 /(?:مبلغ\s*)?([\d۰-۹٠-٩.,]+)\s*( میلیارد| میلیون| هزار)?\s*(?:تومان|ت|ریال|ر)?/i,
 // «به مبلغ X»
 /به\s+مبلغ\s+([\d۰-۹٠-٩.,]+)\s*( میلیارد| میلیون| هزار)?/i,
 ];
 for (const re of patterns) {
 const m = text.match(re);
 if (!m) continue;
 const n = faDigitsToNumber(m[1]);
 if (n === null) continue;
 const unit = (m[2]?? "").trim();
 let multiplier = 1;
 if (/میلیارد/.test(unit)) multiplier = 1_000_000_000;
 else if (/میلیون/.test(unit)) multiplier = 1_000_000;
 else if (/هزار/.test(unit)) multiplier = 1_000;
 // اگر ریال گفت، تقسیم بر ۱۰
 const isRial = /ریال/.test(text);
 const amount = n * multiplier;
 return isRial? Math.round(amount / 10): amount;
 }
 return undefined;
}

// الگوی شناسایی تعداد: «۲ عدد»، «۵ جعبه»، «۳ بسته»
function extractQuantity(text: string): number | undefined {
 const m = text.match(
 /([\d۰-۹٠-٩]+)\s*(?:عدد|جعبه|بسته|کارتن|کارتون|جفت|عدد\s+کالا|عدد\s+از)/i
 );
 if (m && m[1]) {
 const n = faDigitsToNumber(m[1]);
 if (n!== null && n > 0) return n;
 }
 return undefined;
}

// کلمات فارسی برای اعداد کوچک
const FA_WORD_NUMBERS: Record<string, number> = {
 یک: 1,
 یکی: 1,
 دو: 2,
 سه: 3,
 چهار: 4,
 پنج: 5,
 شش: 6,
 شیش: 6,
 هفت: 7,
 هشت: 8,
 نه: 9,
 ده: 10,
 یازده: 11,
 دوازده: 12,
 پانزده: 15,
 بیست: 20,
 سی: 30,
 چهل: 40,
 پنجاه: 50,
 صد: 100,
 دویست: 200,
 سیصد: 300,
 پانصد: 500,
 هزار: 1000,
};

function parsePersianInvoice(text: string): ParsedInvoice {
 const cleaned = text.trim().replace(/\s+/g, " ");
 if (!cleaned) return { type: "SALE", rawText: text };

 let type: "SALE" | "PURCHASE" = "SALE";
 if (SALE_KEYWORDS.test(cleaned)) type = "SALE";
 else if (PURCHASE_KEYWORDS.test(cleaned)) type = "PURCHASE";
 // fallback: اگر «خرید» بود
 else if (/^خرید/.test(cleaned)) type = "PURCHASE";

 const party = extractParty(cleaned);
 const amount = extractAmount(cleaned);
 let quantity = extractQuantity(cleaned);

 // اگر مقدار با کلمه فارسی داده شده
 if (quantity === undefined) {
 for (const [word, num] of Object.entries(FA_WORD_NUMBERS)) {
 const re = new RegExp(`\\b${word}\\b(?:\\s+(?:عدد|جعبه|بسته|کالا))?`, "i");
 if (re.test(cleaned)) {
 quantity = num;
 break;
 }
 }
 }

 // شرح: اگر «کالا» یا «محصول» + عبارت بعدی بود
 let description: string | undefined;
 const descMatch = cleaned.match(
 /(?:کالا|محصول|کالای)\s+([\u0600-\u06FF\s]+?)(?=\s+(?:مبلغ|به\s+مبلغ|تعداد|عدد|تومان|ریال|$))/i
 );
 if (descMatch && descMatch[1]) {
 description = descMatch[1].trim().replace(/\s+/g, " ");
 if (description.length < 2 || description.length > 120) description = undefined;
 }

 return {
 type,
 party,
 amount,
 quantity,
 description,
 rawText: text,
 };
}

/* ============ کامپوننت ============ */

export function VoiceInvoiceInput({
 onParsed,
}: {
 onParsed: (data: ParsedInvoice) => void;
}) {
 const { toast } = useToast();
 const [parsed, setParsed] = React.useState<ParsedInvoice | null>(null);
 const [error, setError] = React.useState<string | null>(null);

 // ─── FIX(voice): ضبط با MediaRecorder + تبدیل به متن با ASR سمت سرور ───
 const [transcript, setTranscript] = React.useState("");
 const voice = useVoiceAsr({
  maxDurationMs: 12_000,
  silenceMs: 2_000,
  initialSilenceMs: 4_500,
  onError: (msgFa) => {
   setError(msgFa);
   toast({ title: "خطای صوتی", description: msgFa, variant: "destructive" });
  },
  onTranscript: (text) => {
   setTranscript(text);
   if (!text) {
   // FIX(v13-sound): بدون toast خطا — سکوت/لغو فقط UI را بی‌صدا ریست می‌کند
   return;
   }
   // همان pipeline قبلی: پارس متن فارسی → کارت نتیجه قابل ویرایش
   try {
   const result = parsePersianInvoice(text);
   setParsed(result);
   } catch {
   /* ignore parse errors */
   }
  },
 });

 const listening = voice.recording || voice.transcribing;

 const startListening = React.useCallback(() => {
  setError(null);
  setTranscript("");
  setParsed(null);
  void voice.start();
 }, [voice]);

 const stopListening = React.useCallback(() => {
  voice.stop();
 }, [voice]);

 const reset = React.useCallback(() => {
  voice.cancel();
  setTranscript("");
  setParsed(null);
  setError(null);
 }, [voice]);

 const handleConfirm = React.useCallback(() => {
  if (!parsed) return;
  onParsed(parsed);
  toast({
  title: "تأیید شد",
  description: "اطلاعات فاکتور وارد فرم شد.",
  });
  reset();
 }, [parsed, onParsed, toast, reset]);

 // اگر مرورگر پشتیبانی نمی‌کند (mediaDevices/MediaRecorder وجود ندارد)
 if (voice.supported === false) {
  return (
  <Card className="p-6 border-dashed border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20">
   <div className="flex flex-col items-center text-center gap-3">
   <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
    <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
   </div>
   <div className="space-y-1">
    <h3 className="font-semibold text-sm">پشتیبانی نمی‌شود</h3>
    <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
    مرورگر شما از ضبط صدا پشتیبانی نمی‌کند. برای استفاده از ورودی صوتی
    از Chrome، Edge یا Safari به‌روز استفاده کنید و مطمئن شوید صفحه روی
    اتصال امن (HTTPS) باز شده است.
    </p>
   </div>
   </div>
  </Card>
  );
 }
 const displayText = transcript;

 return (
 <div className="space-y-4">
 {/* دکمه میکروفون */}
 <div className="flex flex-col items-center gap-3 py-2">
 <button
 type="button"
 onClick={listening? stopListening: startListening}
 disabled={voice.supported === null || voice.transcribing}
 aria-label={listening? "توقف ضبط": "شروع ضبط صوتی"}
 className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-all ${
 listening
? "bg-red-500 text-white shadow-lg shadow-red-500/30"
: "bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:scale-105"
 }`}
 >
 {listening && (
 <>
 <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />
 <span className="absolute inset-2 rounded-full bg-red-500/30 animate-pulse" />
 </>
 )}
 {voice.recording? (
 <Mic className="h-8 w-8 relative z-10 animate-pulse" />
 ): voice.transcribing? (
 <Loader2 className="h-8 w-8 relative z-10 animate-spin" />
 ): (
 <Mic className="h-8 w-8 relative z-10" />
 )}
 </button>
 <div className="text-center space-y-0.5">
 <p className="text-sm font-medium">
 {voice.recording
? "در حال ضبط..."
: voice.transcribing
? "در حال تبدیل صدا به متن..."
: "برای شروع صحبت کنید کلیک کنید"}
 </p>
 <p className="text-[11px] text-muted-foreground">
 {voice.recording
? "صحبت کنید — بعد از مکث، خودکار متوقف و تبدیل می‌شود"
: voice.transcribing
? "لطفاً منتظر بمانید"
: "مثال: «فاکتور فروش برای شرکت پارس به مبلغ ۴۵۰ هزار تومان»"}
 </p>
 </div>
 </div>

 {/* خطا */}
 {error && (
 <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
 <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
 <span className="leading-relaxed">{error}</span>
 </div>
 )}

 {/* Live transcript */}
 {(displayText || listening) && (
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1.5">
 <Sparkles className="h-3 w-3 text-primary" />
 متن شنیده‌شده
 </Label>
 <div
 dir="rtl"
 className="min-h-[60px] max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed"
 >
 {displayText? (
 <span>شنیده شد: {transcript}</span>
 ): (
 <span className="text-muted-foreground/60 text-xs">
 {voice.recording? "در انتظار صحبت...": "—"}
 </span>
 )}
 </div>
 </div>
 )}

 {/* نتیجه پارس‌شده */}
 {parsed && (
 <Card className="p-4 border-primary/30 bg-primary/5 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
 <CheckCircle2 className="h-4 w-4" />
 نتیجه تشخیص
 </div>
 <Badge
 variant="outline"
 className={
 parsed.type === "SALE"
? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
 }
 >
 {parsed.type === "SALE"? "فاکتور فروش": "فاکتور خرید"}
 </Badge>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">طرف‌حساب</Label>
 <Input
 value={parsed.party?? ""}
 onChange={(e) =>
 setParsed((p) => (p? {...p, party: e.target.value }: p))
 }
 placeholder="نام طرف‌حساب..."
 className="h-9 text-sm"
 />
 </div>

 <div className="space-y-1.5">
 <Label className="text-xs">نوع فاکتور</Label>
 <Select
 value={parsed.type}
 onValueChange={(v) =>
 setParsed((p) =>
 p? {...p, type: v as "SALE" | "PURCHASE" }: p
 )
 }
 >
 <SelectTrigger className="h-9 text-sm">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="SALE">فروش</SelectItem>
 <SelectItem value="PURCHASE">خرید</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-1.5">
 <Label className="text-xs">مبلغ (تومان)</Label>
 <Input
 type="number"
 value={parsed.amount?? 0}
 onChange={(e) =>
 setParsed((p) =>
 p? {...p, amount: Number(e.target.value) || 0 }: p
 )
 }
 className="h-9 text-sm tnum"
 dir="ltr"
 />
 {parsed.amount!== undefined && parsed.amount > 0 && (
 <p className="text-[10px] text-muted-foreground">
 {formatNumber(parsed.amount)} تومان
 </p>
 )}
 </div>

 <div className="space-y-1.5">
 <Label className="text-xs">تعداد</Label>
 <Input
 type="number"
 min={1}
 value={parsed.quantity?? 1}
 onChange={(e) =>
 setParsed((p) =>
 p? {...p, quantity: Number(e.target.value) || 1 }: p
 )
 }
 className="h-9 text-sm tnum"
 dir="ltr"
 />
 </div>

 {parsed.description && (
 <div className="space-y-1.5 sm:col-span-2">
 <Label className="text-xs">شرح کالا</Label>
 <Input
 value={parsed.description}
 onChange={(e) =>
 setParsed((p) =>
 p? {...p, description: e.target.value }: p
 )
 }
 className="h-9 text-sm"
 />
 </div>
 )}
 </div>

 <div className="flex flex-col sm:flex-row gap-2 pt-1">
 <Button
 onClick={handleConfirm}
 className="gap-1.5 flex-1"
 disabled={!parsed.party && parsed.amount === undefined}
 >
 <CheckCircle2 className="h-4 w-4" />
 تأیید و ثبت در فرم
 </Button>
 <Button
 variant="outline"
 onClick={reset}
 className="gap-1.5"
 >
 <RotateCcw className="h-4 w-4" />
 شروع مجدد
 </Button>
 </div>
 </Card>
 )}

 {/* حالت اولیه — راهنما */}
 {!parsed &&!listening &&!transcript && (
 <Card className="p-4 bg-muted/30 border-dashed">
 <p className="text-xs text-muted-foreground mb-2 font-medium">
 جملات نمونه:
 </p>
 <ul className="space-y-1.5 text-xs text-muted-foreground">
 <li className="flex items-start gap-2">
 <span className="text-primary mt-0.5">•</span>
 <span>«فاکتور فروش برای شرکت پارس به مبلغ {toPersianDigits("۴۵۰")} هزار تومان»</span>
 </li>
 <li className="flex items-start gap-2">
 <span className="text-primary mt-0.5">•</span>
 <span>«خرید از تأمین‌کننده آریا {toPersianDigits("۲")} عدد کالا»</span>
 </li>
 <li className="flex items-start gap-2">
 <span className="text-primary mt-0.5">•</span>
 <span>«فروش به مشتری رضایی مبلغ {toPersianDigits("۱.۲")} میلیون تومان {toPersianDigits("۳")} عدد»</span>
 </li>
 </ul>
 </Card>
 )}

 {voice.supported === null && (
 <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 در حال بررسی پشتیبانی مرورگر...
 </div>
 )}
 </div>
 );
}

export default VoiceInvoiceInput;
