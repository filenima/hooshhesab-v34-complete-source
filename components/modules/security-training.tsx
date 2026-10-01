"use client";

import * as React from "react";
import {
 ShieldCheck,
 Lock,
 KeyRound,
 Mail,
 Database,
 Award,
 CheckCircle2,
 XCircle,
 BookOpen,
 ChevronLeft,
 RotateCcw,
 Trophy,
 AlertTriangle,
 Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toPersianDigits } from "@/lib/persian";

// ============ Security Awareness Training ============
// ماژول آموزش تعاملی امنیت — ۴ درس با کویز پایان هر درس.
// پیشرفت در SecurityTrainingProgress ذخیره می‌شود.
// پس از تکمیل همه‌ی درس‌ها، گواهی صادر می‌شود.

interface QuizQuestion {
 q: string;
 options: string[];
 answer: number; // index of correct option
 explanation: string;
}

interface Lesson {
 id: string;
 title: string;
 description: string;
 icon: typeof Lock;
 color: string;
 duration: number; // minutes
 content: { heading: string; body: string }[];
 quiz: QuizQuestion[];
}

const LESSONS: Lesson[] = [
 {
 id: "password-security",
 title: "امنیت رمز عبور",
 description: "انتخاب رمز قوی، مدیریت رمزها و جلوگیری از نشت",
 icon: KeyRound,
 color: "primary",
 duration: 8,
 content: [
 {
 heading: "رمز قوی چیست؟",
 body: "رمز قوی حداقل ۱۲ کاراکتر دارد و شامل حروف بزرگ و کوچک، اعداد و نمادها است. از ترکیب کلمات بی‌ربط استفاده کنید تا در برابر حملات فرهنگ لغت مقاوم باشد. هرگز از اطلاعات شخصی مثل تاریخ تولد یا نام همکاران استفاده نکنید.",
 },
 {
 heading: "مدیریت رمزها",
 body: "برای هر سرویس یک رمز یکتا انتخاب کنید. از یک مدیر رمز معتبر (مثل Bitwarden یا 1Password) استفاده کنید تا رمزها را به‌صورت رمزنگاری‌شده ذخیره کند. هرگز رمزها را در فایل متنی یا مرورگر بدون قفل ذخیره نکنید.",
 },
 {
 heading: "شناسایی نشت رمز",
 body: "اگر سرویسی هک شد، رمز شما ممکن است نشت کرده باشد. با ابزار Have I Been Pwned می‌توانید بررسی کنید آیا ایمیل شما در نشتی بوده. در صورت نشت، سریعاً رمز را تغییر دهید.",
 },
 ],
 quiz: [
 {
 q: "حداقل طول رمز قوی چند کاراکتر است؟",
 options: ["۶ کاراکتر", "۸ کاراکتر", "۱۲ کاراکتر", "۴ کاراکتر"],
 answer: 2,
 explanation: "حداقل ۱۲ کاراکتر برای مقاومت در برابر حملات brute-force ضروری است.",
 },
 {
 q: "بهترین روش مدیریت چندین رمز چیست؟",
 options: [
 "نوشتن روی کاغذ",
 "ذخیره در فایل متنی",
 "استفاده از مدیر رمز معتبر",
 "استفاده از یک رمز برای همه",
 ],
 answer: 2,
 explanation: "مدیر رمز معتبر رمزها را رمزنگاری کرده و به‌صورت امن ذخیره می‌کند.",
 },
 {
 q: "اگر متوجه شدید رمز شما در نشتی بوده، اولین اقدام چیست؟",
 options: [
 "صبر کردن تا شرکت اطلاع دهد",
 "تغییر سریع رمز در همه‌ی سرویس‌هایی که از آن استفاده کرده‌اید",
 "حذف حساب کاربری",
 "هیچ اقدامی لازم نیست",
 ],
 answer: 1,
 explanation: "تغییر سریع رمز در همه‌ی سرویس‌ها، جلوگیری می‌کند از سوءاستفاده‌ی مهاجم.",
 },
 ],
 },
 {
 id: "phishing",
 title: "تشخیص فیشینگ",
 description: "شناسایی ایمیل‌ها و پیام‌های فیشینگ",
 icon: Mail,
 color: "rose",
 duration: 10,
 content: [
 {
 heading: "فیشینگ چیست؟",
 body: "فیشینگ حمله‌ای است که در آن مهاجم با جعل هویت یک سازمان معتبر (مثل بانک یا پشتیبانی هوش) سعی می‌کند اطلاعات حساس شما مثل رمز یا کد ملی را بدست آورد. معمولاً از طریق ایمیل، پیامک یا تماس تلفنی انجام می‌شود.",
 },
 {
 heading: "نشانه‌های فیشینگ",
 body: "۱) آدرس فرستنده مشکوک (مثلاً support@hoshhesab-secure.ir به‌جای hoosh.nobatime.ir). ۲) فوریت و ترساندن («حساب شما تا ۲۴ ساعت مسدود می‌شود»). ۳) درخواست اطلاعات حساس (هیچ سازمان معتبری رمز را از شما نمی‌خواهد). ۴) لینک‌های مشکوک — همیشه روی لینک hover کنید قبل از کلیک.",
 },
 {
 heading: "اقدام در صورت شک",
 body: "اگر به هر پیامی مشکوک شدید، روی هیچ لینکی کلیک نکنید و هیچ فایلی را باز نکنید. مستقیماً به سایت رسمی (با تایپ آدرس) بروید یا با پشتیبانی از طریق شماره‌ی رسمی تماس بگیرید. پیام مشکوک را به تیم امنیت گزارش دهید.",
 },
 ],
 quiz: [
 {
 q: "کدام مورد نشانه‌ی فیشینگ نیست؟",
 options: [
 "ایمیل با فوریت و ترساندن",
 "درخواست رمز عبور",
 "ایمیل از آدرس رسمی شرکت با گواهی SSL معتبر",
 "آدرس فرستنده‌ی مشکوک",
 ],
 answer: 2,
 explanation: "ایمیل از دامنه‌ی رسمی با SSL معتبر معمولاً مشروع است. بقیه نشانه‌های فیشینگ هستند.",
 },
 {
 q: "بهترین اقدام هنگام دریافت ایمیل مشکوک چیست؟",
 options: [
 "کلیک روی لینک برای بررسی",
 "حذف ایمیل و گزارش به تیم امنیت",
 "پاسخ دادن و درخواست توضیح",
 "فوروارد به همکاران",
 ],
 answer: 1,
 explanation: "حذف و گزارش، بهترین اقدام است. هرگز روی لینک کلیک نکنید.",
 },
 {
 q: "آیا سازمان‌های معتبر از شما رمز عبور را می‌خواهند؟",
 options: [
 "بله، برای تأیید هویت",
 "خیر، هرگز",
 "فقط در تماس تلفنی",
 "بله، در ایمیل‌های رسمی",
 ],
 answer: 1,
 explanation: "سازمان‌های معتبر هرگز رمز عبور را درخواست نمی‌کنند — این کار همیشه فیشینگ است.",
 },
 ],
 },
 {
 id: "2fa",
 title: "احراز دو مرحله‌ای (2FA)",
 description: "چرا 2FA مهم است و چگونه فعال کنیم",
 icon: ShieldCheck,
 color: "emerald",
 duration: 7,
 content: [
 {
 heading: "چرا 2FA؟",
 body: "رمز عبور به‌تنهایی کافی نیست. اگر رمز شما نشت کند، مهاجم می‌تواند وارد حساب شود. 2FA یک لایه‌ی اضافی اضافه می‌کند: علاوه بر رمز، به چیزی که دارید (مثل گوشی) هم نیاز است. حتی با داشتن رمز، مهاجم نمی‌تواند وارد شود.",
 },
 {
 heading: "انواع 2FA",
 body: "۱) پیامک (ضعیف‌ترین — قابل شنود). ۲) اپلیکیشن احراز مثل Google Authenticator یا Authy (قوی). ۳) کلید سخت‌افزاری مثل YubiKey (قوی‌ترین). 4) کدهای پشتیبان (backup codes) که باید ایمن ذخیره کنید.",
 },
 {
 heading: "فعال‌سازی در هوش",
 body: "مدیران باید 2FA را فعال کنند. به بخش «امنیت و کاربران» بروید، روی «تنظیمات 2FA» کلیک کنید و QR را با اپلیکیشن احراز اسکن کنید. کد ۶ رقمی را وارد کنید تا تأیید شود. کدهای پشتیبان را در جای امن ذخیره کنید.",
 },
 ],
 quiz: [
 {
 q: "قوی‌ترین روش 2FA کدام است؟",
 options: ["پیامک", "ایمیل", "کلید سخت‌افزاری", "تماس تلفنی"],
 answer: 2,
 explanation: "کلید سخت‌افزاری مثل YubiKey در برابر فیشینگ و حملات MITM مقاوم است.",
 },
 {
 q: "کدهای پشتیبان (backup codes) کجا ذخیره شوند؟",
 options: [
 "در حافظه‌ی گوشی به‌صورت عکس",
 "در فایل متنی روی دسکتاپ",
 "در جای امن آفلاین (مثلاً قفل فلش رمزنگاری‌شده)",
 "نیازی به ذخیره نیست",
 ],
 answer: 2,
 explanation: "کدهای پشتیبان باید آفلاین و رمزنگاری‌شده ذخیره شوند تا در صورت گم شدن گوشی قابل استفاده باشند.",
 },
 {
 q: "اگر 2FA را فعال نکرده باشید و رمزتان نشت کند، چه اتفاقی می‌افتد؟",
 options: [
 "هیچ‌چیز، چون هوش امن است",
 "مهاجم می‌تواند وارد حساب شود",
 "فقط یک هشدار دریافت می‌کنید",
 "حساب به‌طور خودکار قفل می‌شود",
 ],
 answer: 1,
 explanation: "بدون 2FA، نشت رمز به معنای دسترسی مهاجم به حساب است. 2FA این لایه‌ی محافظتی را اضافه می‌کند.",
 },
 ],
 },
 {
 id: "data-protection",
 title: "حفاظت از داده",
 description: "طبقه‌بندی داده، رمزنگاری و جلوگیری از نشت",
 icon: Database,
 color: "amber",
 duration: 9,
 content: [
 {
 heading: "طبقه‌بندی داده",
 body: "داده‌ها در ۴ سطح طبقه‌بندی می‌شوند: ۱) عمومی (مثل نام شرکت). ۲) داخلی (مثل گزارش‌های مالی). ۳) محرمانه (مثل اطلاعات مشتریان). ۴) بسیار محرمانه (مثل کد ملی، شماره کارت). هر سطح، کنترل‌های متفاوتی نیاز دارد.",
 },
 {
 heading: "رمزنگاری در حالت استراحت و انتقال",
 body: "داده‌های حساس در دیتابیس با AES-256 رمزنگاری می‌شوند (at rest). در انتقال بین کلاینت و سرور، از HTTPS/TLS 1.3 استفاده می‌شود. هرگز داده‌ی محرمانه را در plain text در ایمیل یا پیامک ارسال نکنید.",
 },
 {
 heading: "جلوگیری از نشت (DLP)",
 body: "سیستم DLP هوش به‌طور خودکار داده‌ی حساس (کد ملی، شماره کارت، شماره شبا) را در خروجی‌ها شناسایی و mask می‌کند. هنگام export داده، حواستان باشد چه اطلاعاتی خارج می‌شود. هرگز فایل‌های محرمانه را در سرویس‌های اشتراک فایل غیرتأییدشده آپلود نکنید.",
 },
 {
 heading: "حذف امن داده",
 body: "هنگام حذف کاربر یا tenant، داده‌ها به‌صورت soft delete علامت‌گذاری می‌شوند (۳۰ روز مهلت بازگشت). پس از آن، حذف قطعی انجام می‌شود. هرگز فایل‌های محرمانه را فقط در سطل بازیافت نیندازید — از ابزارهای secure delete استفاده کنید.",
 },
 ],
 quiz: [
 {
 q: "کدام داده «بسیار محرمانه» است؟",
 options: [
 "نام شرکت",
 "گزارش فروش ماهانه",
 "کد ملی کاربر",
 "آدرس وب‌سایت",
 ],
 answer: 2,
 explanation: "کد ملی اطلاعات PII است و باید در سطح «بسیار محرمانه» طبقه‌بندی شود.",
 },
 {
 q: "AES-256 برای چیست؟",
 options: [
 "رمزنگاری داده در حالت استراحت",
 "فشرده‌سازی داده",
 "ارسال ایمیل امن",
 "پشتیبان‌گیری",
 ],
 answer: 0,
 explanation: "AES-256-GCM برای رمزنگاری داده‌های حساس در دیتابیس استفاده می‌شود.",
 },
 {
 q: "هنگام export داده چه باید کرد؟",
 options: [
 "همه‌ی داده را بدون فیلتر export کنید",
 "بازرسی خروجی برای داده‌ی حساس و mask آن",
 "فقط فایل CSV بسازید",
 "هیچ اقدامی لازم نیست",
 ],
 answer: 1,
 explanation: "سیستم DLP به‌طور خودکار داده‌ی حساس را شناسایی و mask می‌کند، اما بازرسی دستی نیز ضروری است.",
 },
 {
 q: "پس از soft delete کاربر، چه مدت فرصت بازگشت هست؟",
 options: ["۱ روز", "۷ روز", "۳۰ روز", "۹۰ روز"],
 answer: 2,
 explanation: "۳۰ روز مهلت بازگشت قبل از حذف قطعی داده‌ها.",
 },
 ],
 },
];

interface LessonProgress {
 status: "not_started" | "in_progress" | "completed";
 score: number;
 attempts: number;
}

const STORAGE_KEY = "hoshhesab_security_training_progress";

function loadProgress(): Record<string, LessonProgress> {
 if (typeof window === "undefined") return {};
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 return raw? JSON.parse(raw): {};
 } catch {
 return {};
 }
}

function saveProgress(progress: Record<string, LessonProgress>) {
 try {
 localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
 } catch {
 /* ignore */
 }
}

export function SecurityTrainingModule() {
 const [progress, setProgress] = React.useState<Record<string, LessonProgress>>({});
 const [activeLessonId, setActiveLessonId] = React.useState<string | null>(null);
 const [activeView, setActiveView] = React.useState<"list" | "lesson" | "quiz" | "result" | "certificate">("list");
 const [quizAnswers, setQuizAnswers] = React.useState<number[]>([]);
 const [quizScore, setQuizScore] = React.useState(0);
 const [mounted, setMounted] = React.useState(false);

 React.useEffect(() => {
 setProgress(loadProgress());
 setMounted(true);
 }, []);

 const completedCount = Object.values(progress).filter((p) => p.status === "completed").length;
 const overallProgress = Math.round((completedCount / LESSONS.length) * 100);

 const activeLesson = LESSONS.find((l) => l.id === activeLessonId);

 function startLesson(lesson: Lesson) {
 setActiveLessonId(lesson.id);
 setActiveView("lesson");
 }

 function startQuiz() {
 setQuizAnswers(new Array(activeLesson?.quiz.length || 0).fill(-1));
 setActiveView("quiz");
 }

 function submitQuiz() {
 if (!activeLesson) return;
 let correct = 0;
 activeLesson.quiz.forEach((q, i) => {
 if (quizAnswers[i] === q.answer) correct++;
 });
 const score = Math.round((correct / activeLesson.quiz.length) * 100);
 setQuizScore(score);

 const newProgress = {
...progress,
 [activeLesson.id]: {
 status: score >= 70? "completed": "in_progress",
 score,
 attempts: (progress[activeLesson.id]?.attempts || 0) + 1,
 } as LessonProgress,
 };
 setProgress(newProgress);
 saveProgress(newProgress);
 setActiveView("result");
 }

 function resetAll() {
 const cleared: Record<string, LessonProgress> = {};
 setProgress(cleared);
 saveProgress(cleared);
 setActiveView("list");
 setActiveLessonId(null);
 }

 if (!mounted) {
 return <div className="p-4">در حال بارگذاری...</div>;
 }

 // ============ Certificate view ============
 if (activeView === "certificate") {
 const certId = `HOSH-${Date.now().toString(36).toUpperCase()}`;
 return (
 <div className="space-y-5 animate-fade-in-up">
 <Card className="border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
 <CardHeader className="text-center pb-2">
 <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
 <Award className="w-9 h-9 text-primary" />
 </div>
 <CardTitle className="text-2xl">گواهی تکمیل آموزش امنیتی</CardTitle>
 <p className="text-sm text-muted-foreground mt-1">هوش — پلتفرم حسابداری هوشمند</p>
 </CardHeader>
 <CardContent className="space-y-4 text-center">
 <div className="border border-dashed border-primary/30 rounded-lg p-6 bg-background">
 <p className="text-sm text-muted-foreground">این گواهی به اثبات می‌رساند که دارنده‌ی آن با موفقیت دوره‌ی آموزش امنیت سایبری زیر را تکمیل کرده است:</p>
 <p className="font-bold text-lg mt-2">آموزش امنیتی هوش — ۴ درس</p>
 <ul className="text-sm mt-3 text-muted-foreground space-y-1">
 {LESSONS.map((l) => (
 <li key={l.id}>{l.title}</li>
 ))}
 </ul>
 <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
 <div className="text-right">
 <p className="text-muted-foreground">امتیاز کل:</p>
 <p className="font-bold text-primary">{toPersianDigits(overallProgress)}٪</p>
 </div>
 <div className="text-left" dir="ltr">
 <p className="text-muted-foreground">شناسه گواهی:</p>
 <p className="font-mono text-xs">{certId}</p>
 </div>
 </div>
 <p className="text-xs text-muted-foreground mt-3">تاریخ صدور: {new Date().toLocaleDateString("fa-IR")}</p>
 </div>
 <div className="flex gap-2 justify-center">
 <Button onClick={() => window.print()} variant="outline">
 چاپ گواهی
 </Button>
 <Button onClick={() => setActiveView("list")}>
 بازگشت به فهرست
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 );
 }

 // ============ Result view ============
 if (activeView === "result" && activeLesson) {
 const passed = quizScore >= 70;
 return (
 <div className="space-y-5 animate-fade-in-up">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 {passed? (
 <CheckCircle2 className="w-5 h-5 text-emerald-600" />
 ): (
 <XCircle className="w-5 h-5 text-rose-600" />
 )}
 نتیجه‌ی کویز: {activeLesson.title}
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="text-center py-6">
 <div className={`inline-block text-5xl font-bold ${passed? "text-emerald-600": "text-rose-600"}`}>
 {toPersianDigits(quizScore)}٪
 </div>
 <p className="mt-2 text-sm text-muted-foreground">
 {passed? "تبریک! این درس تکمیل شد.": "برای قبولی حداقل ۷۰٪ لازم است. دوباره تلاش کنید."}
 </p>
 </div>

 <div className="space-y-3">
 <p className="font-semibold">پاسخ‌نمای کویز:</p>
 {activeLesson.quiz.map((q, i) => {
 const userAnswer = quizAnswers[i];
 const isCorrect = userAnswer === q.answer;
 return (
 <div key={i} className={`p-3 rounded-lg border ${isCorrect? "border-emerald-500/40 bg-emerald-500/5": "border-rose-500/40 bg-rose-500/5"}`}>
 <p className="text-sm font-medium">{toPersianDigits(i + 1)}. {q.q}</p>
 <p className="text-xs mt-1 text-muted-foreground">
 پاسخ صحیح: <span className="font-semibold text-emerald-700">{q.options[q.answer]}</span>
 </p>
 {!isCorrect && userAnswer!== -1 && (
 <p className="text-xs mt-1 text-rose-700">
 پاسخ شما: {q.options[userAnswer]}
 </p>
 )}
 <p className="text-xs mt-1 text-muted-foreground italic">{q.explanation}</p>
 </div>
 );
 })}
 </div>

 <div className="flex gap-2">
 {!passed && (
 <Button variant="outline" onClick={() => setActiveView("quiz")}>
 <RotateCcw className="w-4 h-4 ml-1" />
 تلاش مجدد
 </Button>
 )}
 <Button variant="outline" onClick={() => setActiveView("lesson")}>
 <BookOpen className="w-4 h-4 ml-1" />
 مرور درس
 </Button>
 <Button onClick={() => setActiveView("list")}>
 بازگشت به فهرست درس‌ها
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 );
 }

 // ============ Quiz view ============
 if (activeView === "quiz" && activeLesson) {
 return (
 <div className="space-y-5 animate-fade-in-up">
 <Card>
 <CardHeader>
 <CardTitle>کویز: {activeLesson.title}</CardTitle>
 <p className="text-sm text-muted-foreground">
 به {toPersianDigits(activeLesson.quiz.length)} سؤال پاسخ دهید. حد نصاب قبولی: ۷۰٪
 </p>
 </CardHeader>
 <CardContent className="space-y-5">
 {activeLesson.quiz.map((q, i) => (
 <div key={i} className="space-y-2">
 <p className="font-medium text-sm">
 {toPersianDigits(i + 1)}. {q.q}
 </p>
 <div className="grid sm:grid-cols-2 gap-2">
 {q.options.map((opt, j) => (
 <button
 key={j}
 type="button"
 onClick={() => {
 const next = [...quizAnswers];
 next[i] = j;
 setQuizAnswers(next);
 }}
 className={`p-3 rounded-lg border text-right text-sm transition-colors ${
 quizAnswers[i] === j
? "border-primary bg-primary/10 text-primary"
: "border-border hover:border-primary/40"
 }`}
 >
 {opt}
 </button>
 ))}
 </div>
 </div>
 ))}
 <div className="flex gap-2 pt-2">
 <Button variant="outline" onClick={() => setActiveView("lesson")}>
 بازگشت به درس
 </Button>
 <Button
 onClick={submitQuiz}
 disabled={quizAnswers.some((a) => a === -1)}
 >
 ثبت پاسخ‌ها
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 );
 }

 // ============ Lesson view ============
 if (activeView === "lesson" && activeLesson) {
 const LessonIcon = activeLesson.icon;
 return (
 <div className="space-y-5 animate-fade-in-up">
 <Card>
 <CardHeader>
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center">
 <LessonIcon className="w-6 h-6 text-primary" />
 </div>
 <div>
 <CardTitle>{activeLesson.title}</CardTitle>
 <p className="text-sm text-muted-foreground">{activeLesson.description}</p>
 </div>
 </div>
 <Badge variant="secondary">
 {toPersianDigits(activeLesson.duration)} دقیقه
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="space-y-5">
 {activeLesson.content.map((section, i) => (
 <div key={i} className="space-y-2">
 <h3 className="font-semibold text-primary flex items-center gap-2">
 <span className="w-6 h-6 rounded-full bg-primary/10 text-xs flex items-center justify-center">
 {toPersianDigits(i + 1)}
 </span>
 {section.heading}
 </h3>
 <p className="text-sm leading-relaxed text-muted-foreground pr-8">
 {section.body}
 </p>
 </div>
 ))}

 <div className="flex gap-2 pt-4 border-t border-border">
 <Button variant="outline" onClick={() => setActiveView("list")}>
 بازگشت به فهرست
 </Button>
 <Button onClick={startQuiz}>
 شروع کویز
 <ChevronLeft className="w-4 h-4" />
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 );
 }

 // ============ List view (default) ============
 return (
 <div className="space-y-5 animate-fade-in-up">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <ShieldCheck className="w-5 h-5 text-primary" />
 آموزش امنیتی تعاملی
 </CardTitle>
 <p className="text-sm text-muted-foreground">
 با تکمیل این دوره، دانش خود را در حوزه‌ی امنیت سایبری ارتقا دهید و گواهی دریافت کنید.
 </p>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-2">
 <div className="flex items-center justify-between text-sm">
 <span>پیشرفت کلی دوره</span>
 <span className="font-medium">
 {toPersianDigits(completedCount)} از {toPersianDigits(LESSONS.length)} درس
 </span>
 </div>
 <Progress value={overallProgress} />
 </div>

 {overallProgress === 100 && (
 <div className="p-4 rounded-lg border border-primary/40 bg-primary/5 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Trophy className="w-6 h-6 text-primary" />
 <div>
 <p className="font-semibold">آموزش تکمیل شد!</p>
 <p className="text-xs text-muted-foreground">گواهی شما آماده‌ی صدور است.</p>
 </div>
 </div>
 <Button onClick={() => setActiveView("certificate")}>
 <Award className="w-4 h-4 ml-1" />
 دریافت گواهی
 </Button>
 </div>
 )}

 <div className="grid gap-3">
 {LESSONS.map((lesson) => {
 const LessonIcon = lesson.icon;
 const p = progress[lesson.id];
 return (
 <button
 key={lesson.id}
 type="button"
 onClick={() => startLesson(lesson)}
 className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border hover:border-primary/40 text-right transition-colors bg-background"
 >
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
 <LessonIcon className="w-6 h-6 text-primary" />
 </div>
 <div className="min-w-0">
 <p className="font-medium truncate">{lesson.title}</p>
 <p className="text-xs text-muted-foreground truncate">{lesson.description}</p>
 </div>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 {p?.status === "completed"? (
 <Badge variant="default" className="bg-emerald-600 text-white">
 <CheckCircle2 className="w-3 h-3 ml-1" />
 {toPersianDigits(p.score)}٪
 </Badge>
 ): p?.status === "in_progress"? (
 <Badge variant="secondary">
 <AlertTriangle className="w-3 h-3 ml-1" />
 در حال انجام
 </Badge>
 ): (
 <Badge variant="outline">
 {toPersianDigits(lesson.duration)} دقیقه
 </Badge>
 )}
 <ChevronLeft className="w-4 h-4 text-muted-foreground" />
 </div>
 </button>
 );
 })}
 </div>

 {completedCount > 0 && (
 <div className="flex justify-end">
 <Button variant="ghost" size="sm" onClick={resetAll}>
 <RotateCcw className="w-4 h-4 ml-1" />
 شروع مجدد دوره
 </Button>
 </div>
 )}

 <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
 <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
 <p>
 این دوره به‌صورت محلی در مرورگر شما ذخیره می‌شود. برای دریافت گواهی رسمی، با پشتیبانی تماس بگیرید.
 آموزش‌ها بر اساس استانداردهای NIST و ISO 27001 طراحی شده‌اند.
 </p>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}
