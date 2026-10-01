"use client";

import * as React from "react";
import {
 motion,
 AnimatePresence,
 useMotionValue,
 useSpring,
 useTransform,
 type MotionValue,
} from "framer-motion";
import {
 Sparkles,
 X,
 Loader2,
 Zap,
 ShieldCheck,
 Gift,
 User,
 Lock,
 Mail,
 LogIn,
 Eye,
 EyeOff,
 Cpu,
 Network,
 Coins,
 Headphones,
 Receipt,
 Calculator,
 Wallet,
 HelpCircle,
 ArrowRight,
 CheckCircle2,
 KeyRound,
 ArrowLeft,
 RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface AuthViewProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onTrialCreate: () => void;
 onUserLoginSuccess?: (token: string) => void;
 onSuperAdminLoginSuccess?: (
 token: string,
 admin: { id: string; username: string; role: string }
 ) => void;
 onDemoAccess?: () => void | Promise<void>;
}

const ADMIN_TOKEN_KEY = "hoshhesab_admin_token";
const ADMIN_USER_KEY = "hoshhesab_admin_user";

/* ============================================================
 * FIX(remember-me): ذخیره و بازیابی اطلاعات ورود روی همین دستگاه
 * ============================================================
 * وقتی کاربر «مرا به خاطر بسپار» را فعال کند، نام کاربری و رمز عبور
 * روی همین دستگاه (localStorage) ذخیره می‌شود تا دفعه بعد بدون تایپ
 * مجدد، به‌صورت خودکار پر شود. رمز به‌صورت ساده‌ی XOR+Base64 «مبهم»
 * می‌شود (نه رمزنگاری امن — فقط برای جلوگیری از خواندن تصادفی).
 * امنیت واقعی: هر کسی به مرورگر/دسترسی دستگاه دسترسی داشته باشد می‌تواند
 * آن را بازیابی کند — بنابراین فقط روی دستگاه شخصی خودتان فعال کنید.
 * ============================================================ */
const REMEMBER_KEY = "hoshhesab_remembered_login";

function obfuscate(text: string): string {
 try {
 const key = "hoosh-login-remember-v1";
 let out = "";
 for (let i = 0; i < text.length; i++) {
 out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
 }
 // Base64 با پشتیبانی یونیکد
 return btoa(unescape(encodeURIComponent(out)));
 } catch {
 return "";
 }
}

function deobfuscate(encoded: string): string {
 try {
 const key = "hoosh-login-remember-v1";
 const raw = decodeURIComponent(escape(atob(encoded)));
 let out = "";
 for (let i = 0; i < raw.length; i++) {
 out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
 }
 return out;
 } catch {
 return "";
 }
}

interface RememberedLogin {
 identifier: string;
 password: string;
 savedAt: number;
}

function loadRememberedLogin(): RememberedLogin | null {
 try {
 const raw = localStorage.getItem(REMEMBER_KEY);
 if (!raw) return null;
 const parsed = JSON.parse(raw) as { i?: string; p?: string; t?: number };
 if (!parsed?.i || !parsed?.p) return null;
 return {
 identifier: deobfuscate(parsed.i),
 password: deobfuscate(parsed.p),
 savedAt: typeof parsed.t === "number" ? parsed.t : 0,
 };
 } catch {
 return null;
 }
}

function saveRememberedLogin(identifier: string, password: string): void {
 try {
 localStorage.setItem(
 REMEMBER_KEY,
 JSON.stringify({ i: obfuscate(identifier), p: obfuscate(password), t: Date.now() })
 );
 } catch {
 /* localStorage not available (private mode) — ignore */
 }
}

function clearRememberedLogin(): void {
 try {
 localStorage.removeItem(REMEMBER_KEY);
 } catch {
 /* ignore */
 }
}

/* ============================================================
 * PERF(21-C — موبایل): انیمیشن‌های سنگین فقط دسکتاپ
 * روی صفحه‌های ≤ 768px (یا prefers-reduced-motion) ترنزیشن‌ها به
 * tween کوتاه 0.15s تبدیل می‌شوند — اسپرینگ‌های framer-motion روی
 * گوشی میان‌رده لگ ایجاد می‌کردند (گزارش مالک: «کم شدن انیمیشن، لگ کمتر»).
 * ============================================================ */
const AUTH_LOW_MOTION: boolean =
 typeof window !== "undefined" &&
 typeof window.matchMedia === "function" &&
 (window.matchMedia("(max-width: 768px)").matches ||
 window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ============================================================
 * Floating background orbs — ۴ orb با عمق و سرعت متفاوت
 * (فقط دسکتاپ — روی موبایل hidden تا blur(60px)×4 GPU را نکشد)
 * ============================================================ */
function FloatingOrbs() {
 return (
 <div
 className="absolute inset-0 overflow-hidden pointer-events-none max-md:hidden"
 aria-hidden="true"
 >
 <div
 className="auth-orb auth-orb-a"
 style={{
 top: "-8%",
 insetInlineStart: "5%",
 width: "32rem",
 height: "32rem",
 background:
 "radial-gradient(circle, rgba(18,48,74,0.5) 0%, rgba(13,148,136,0) 70%)",
 }}
 />
 <div
 className="auth-orb auth-orb-b"
 style={{
 top: "55%",
 insetInlineStart: "60%",
 width: "28rem",
 height: "28rem",
 background:
 "radial-gradient(circle, rgba(245,158,11,0.4) 0%, rgba(245,158,11,0) 70%)",
 }}
 />
 <div
 className="auth-orb auth-orb-c"
 style={{
 top: "70%",
 insetInlineStart: "10%",
 width: "22rem",
 height: "22rem",
 background:
 "radial-gradient(circle, rgba(16,185,129,0.45) 0%, rgba(16,185,129,0) 70%)",
 }}
 />
 <div
 className="auth-orb auth-orb-d"
 style={{
 top: "8%",
 insetInlineStart: "78%",
 width: "20rem",
 height: "20rem",
 background:
 "radial-gradient(circle, rgba(167,139,250,0.4) 0%, rgba(167,139,250,0) 70%)",
 }}
 />
 </div>
 );
}

/* ============================================================
 * Branding panel (left side on desktop) — لوگو، تگ‌لاین، فیچرها
 * ============================================================ */
const FEATURES = [
 {
 icon: Network,
 title: "اتصال به مودیان",
 desc: "ارسال خودکار فاکتورها به اداره مالیات",
 },
 {
 icon: Cpu,
 title: "۱۶ ماژول تخصصی",
 desc: "انبارداری، خزانه‌داری، CRM، مالی و بیشتر",
 },
 {
 icon: Sparkles,
 title: "هوش مصنوعی",
 desc: "دستیار مالی هوشمند با تحلیل خودکار",
 },
];

const FLOATING_ICONS = [
 { Icon: Coins, className: "auth-coin auth-coin-slow", top: "18%", left: "12%", color: "#fbbf24" },
 { Icon: Receipt, className: "auth-coin", top: "30%", right: "18%", color: "#5eead4" },
 { Icon: Calculator, className: "auth-coin auth-coin-fast", top: "62%", left: "8%", color: "#a78bfa" },
 { Icon: Wallet, className: "auth-coin auth-coin-slow", top: "70%", right: "14%", color: "#34d399" },
];

function BrandPanel() {
 return (
 <div className="auth-brand-panel relative hidden lg:flex flex-col justify-between overflow-hidden p-10 xl:p-14">
 {/* Coins/icons شناور با عمق */}
 <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
 {FLOATING_ICONS.map(({ Icon, className, top, left, right, color }, i) => (
 <div
 key={i}
 className={className}
 style={{
 position: "absolute",
 top,
 left,
 right,
 width: "4rem",
 height: "4rem",
 borderRadius: "1rem",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 background: `${color}1f`,
 border: `1px solid ${color}55`,
 boxShadow: `0 8px 30px -8px ${color}77, inset 0 1px 0 rgba(255,255,255,0.2)`,
 backdropFilter: "blur(8px)",
 WebkitBackdropFilter: "blur(8px)",
 }}
 >
 <Icon className="h-7 w-7" style={{ color }} strokeWidth={1.6} />
 </div>
 ))}
 </div>

 {/* میدان ذرات */}
 <div className="auth-particles absolute inset-0 opacity-60 pointer-events-none" aria-hidden="true" />

 {/* لوگو + نام برند */}
 <div className="relative z-10">
 <motion.div
 initial={{ opacity: 0, y: -16 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.6, delay: 0.2 }}
 className="flex items-center gap-3"
 >
 <div
 className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-xl"
 style={{
 background: "linear-gradient(135deg, #12304A 0%, #19B394 100%)",
 boxShadow: "0 10px 30px -8px rgba(18,48,74,0.55)",
 }}
 >
 <Wallet className="h-6 w-6 text-white" strokeWidth={2.2} />
 </div>
 <div>
 <div className="text-2xl font-bold text-white tracking-tight">
 هوش<span className="text-emerald-300">حساب</span>
 </div>
 <div className="text-[11px] text-emerald-200/70 font-medium tracking-wide">
 Hoosh Accounting
 </div>
 </div>
 </motion.div>
 </div>

 {/* عنوان اصلی + تگ‌لاین */}
 <div className="relative z-10 max-w-md">
 <motion.h2
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.7, delay: 0.35 }}
 className="text-3xl xl:text-4xl font-bold text-white leading-tight"
 >
 نرم‌افزار حسابداری
 <br />
 <span className="auth-brand-text">هوشمند ایرانی</span>
 </motion.h2>
 <div className="auth-underline mt-3 h-[3px] w-28 rounded-full" />
 <motion.p
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.7, delay: 0.5 }}
 className="mt-5 text-emerald-50/80 leading-relaxed text-sm xl:text-base"
 >
 مدیریت یکپارچه‌ی مالی، انبار، فروش و گزارش‌های هوشمند — طراحی‌شده
 برای کسب‌وکارهای ایرانی و منطبق با الزامات مالیاتی مودیان.
 </motion.p>

 {/* آمار سریع */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.7, delay: 0.65 }}
 className="mt-6 flex gap-6"
 >
 {[
 { num: "+۵٬۰۰۰", label: "کسب‌وکار فعال" },
 { num: "+۱۲۰٬۰۰۰", label: "فاکتور روزانه" },
 { num: "٪۹۹٫۹", label: "پایداری سرویس" },
 ].map((s) => (
 <div key={s.label}>
 <div className="text-xl font-bold text-white tnum">{s.num}</div>
 <div className="text-[10px] text-emerald-200/70 mt-0.5">{s.label}</div>
 </div>
 ))}
 </motion.div>
 </div>

 {/* ۳ فیچر */}
 <motion.div
 initial={{ opacity: 0, y: 24 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.7, delay: 0.8 }}
 className="relative z-10 space-y-3"
 >
 {FEATURES.map((f) => (
 <div
 key={f.title}
 className="flex items-start gap-3 rounded-xl bg-white/5 p-3 border border-white/10 backdrop-blur-md"
 >
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20 border border-primary/30">
 <f.icon className="h-4 w-4 text-emerald-300" strokeWidth={2} />
 </div>
 <div className="flex-1">
 <div className="text-sm font-semibold text-white">{f.title}</div>
 <div className="text-[11px] text-emerald-100/70 mt-0.5">{f.desc}</div>
 </div>
 </div>
 ))}
 </motion.div>
 </div>
 );
}

/* ============================================================
 * AuthView — کامپوننت اصلی: اورلی تمام‌صفحه با کارت 3D مایل
 * ============================================================ */
export function AuthView({
 open,
 onOpenChange,
 onTrialCreate,
 onUserLoginSuccess,
 onSuperAdminLoginSuccess,
 onDemoAccess,
}: AuthViewProps) {
 const { toast } = useToast();
 const [loading, setLoading] = React.useState(false);
 const [loginLoading, setLoginLoading] = React.useState(false);
 const [identifier, setIdentifier] = React.useState("");
 const [password, setPassword] = React.useState("");
 const [showPwd, setShowPwd] = React.useState(false);
 const [demoLoading, setDemoLoading] = React.useState(false);
 const [loginError, setLoginError] = React.useState("");
 // FIX(remember-me): حالت چک‌باکس + اینکه اطلاعات ذخیره‌شده وجود دارد یا نه
 const [rememberMe, setRememberMe] = React.useState(false);
 const [hasRemembered, setHasRemembered] = React.useState(false);

 // FIX(remember-me): هنگام mount، اگر اطلاعات ورود ذخیره‌شده وجود داشت،
 // فیلدها را خودکار پر کن + چک‌باکس را فعال کن و نشان بده که ذخیره شده است.
 React.useEffect(() => {
 const saved = loadRememberedLogin();
 if (saved && saved.identifier) {
 setIdentifier(saved.identifier);
 setPassword(saved.password);
 setRememberMe(true);
 setHasRemembered(true);
 }
 }, []);

 // FIX(remember-me): اعمال/حذف ذخیره‌سازی هنگام تغییر چک‌باکس —
 // اگر کاربر چک‌باکس را بردارد، اطلاعات ذخیره‌شده هم پاک می‌شود.
 const handleRememberChange = (checked: boolean) => {
 setRememberMe(checked);
 if (!checked) {
 clearRememberedLogin();
 setHasRemembered(false);
 }
 };

 // ------- forgot password sub-view -------
 const [forgotOpen, setForgotOpen] = React.useState(false);
 const [forgotEmail, setForgotEmail] = React.useState("");
 const [forgotLoading, setForgotLoading] = React.useState(false);
 const [forgotSent, setForgotSent] = React.useState(false);
 const forgotEmailRef = React.useRef<HTMLInputElement>(null);

 const containerRef = React.useRef<HTMLDivElement>(null);
 const identifierRef = React.useRef<HTMLInputElement>(null);
 const closeBtnRef = React.useRef<HTMLButtonElement>(null);

 // ------- 2FA (two-factor) sub-view -------
 // وقتی سرور requiresTwoFactor=true برمی‌گرداند، این حالت فعال می‌شود تا
 // کاربر کد ۶ رقمی از اپلیکیشن تأیید هویت یا کد پشتیبان را وارد کند.
 const [twoFactorPending, setTwoFactorPending] = React.useState(false);
 const [twoFactorUserId, setTwoFactorUserId] = React.useState<string | null>(null);
 const [twoFactorCode, setTwoFactorCode] = React.useState("");
 const [twoFactorLoading, setTwoFactorLoading] = React.useState(false);
 const [twoFactorUseBackup, setTwoFactorUseBackup] = React.useState(false);
 const [twoFactorBackupCode, setTwoFactorBackupCode] = React.useState("");
 const [twoFactorRemaining, setTwoFactorRemaining] = React.useState<number | null>(null);
 const twoFactorRef = React.useRef<HTMLInputElement>(null);
 const twoFactorBackupRef = React.useRef<HTMLInputElement>(null);

 // ------- 3D tilt on the login card -------
 const mx = useMotionValue(0.5);
 const my = useMotionValue(0.5);
 const sx = useSpring(mx, { stiffness: 150, damping: 18, mass: 0.4 });
 const sy = useSpring(my, { stiffness: 150, damping: 18, mass: 0.4 });
 const rotateX = useTransform(sy, [0, 1], [7, -7]);
 const rotateY = useTransform(sx, [0, 1], [-7, 7]);
 const glowX = useTransform(sx, [0, 1], ["0%", "100%"]);
 const glowY = useTransform(sy, [0, 1], ["0%", "100%"]);
 const glowBg = useTransform(
 [glowX, glowY] as MotionValue<string>[],
 ([gx, gy]: string[]) =>
 `radial-gradient(circle at ${gx} ${gy}, rgba(45,212,191,0.18) 0%, transparent 55%)`
 );

 const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
 const rect = e.currentTarget.getBoundingClientRect();
 mx.set((e.clientX - rect.left) / rect.width);
 my.set((e.clientY - rect.top) / rect.height);
 };
 const handleCardMouseLeave = () => {
 mx.set(0.5);
 my.set(0.5);
 };

 // ------- Body scroll lock + Esc handler + focus mgmt -------
 React.useEffect(() => {
 if (!open) {
 return;
 }
 const body = document.body;
 body.classList.add("auth-locked");

 // Focus the close button first (then user can Tab to inputs)
 const t = window.setTimeout(() => {
 identifierRef.current?.focus();
 }, 350);

 const handleKey = (e: KeyboardEvent) => {
 if (e.key === "Escape") {
 e.preventDefault();
 onOpenChange(false);
 return;
 }
 if (e.key === "Tab" && containerRef.current) {
 const focusable = containerRef.current.querySelectorAll<HTMLElement>(
 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
 );
 if (focusable.length === 0) return;
 const first = focusable[0];
 const last = focusable[focusable.length - 1];
 if (e.shiftKey && document.activeElement === first) {
 e.preventDefault();
 last.focus();
 } else if (!e.shiftKey && document.activeElement === last) {
 e.preventDefault();
 first.focus();
 }
 }
 };
 document.addEventListener("keydown", handleKey);

 return () => {
 body.classList.remove("auth-locked");
 window.clearTimeout(t);
 document.removeEventListener("keydown", handleKey);
 };
 }, [open, onOpenChange]);

 // وقتی دیالوگ بسته می‌شود، حالت ۲FA را هم ریست کن تا دفعهٔ بعد تمیز شروع شود
 React.useEffect(() => {
 if (!open && twoFactorPending) {
 resetTwoFactor();
 }
 }, [open, twoFactorPending]);

 const handleQuickAccess = async () => {
 setLoading(true);
 setLoginError("");
 try {
 await onTrialCreate();
 // فقط پس از موفقیت، دیالوگ بسته می‌شود تا خطاها قابل نمایش باشند
 onOpenChange(false);
 } catch (err) {
 toast({
 title: "خطا در ساخت حساب فوری",
 description:
 err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 };

 // FIX(درخواست کاربر): اطلاعات حساب دمو برای پر کردن خودکار فرم ورود —
 // کاربر می‌بیند با چه مشخصاتی وارد دمو می‌شود و داده‌های نمونه را بررسی می‌کند.
 // (این حساب توسط /api/demo/access ساخته می‌شود؛ رمز عمومی دمو است)
 const DEMO_LOGIN_CREDENTIALS = {
 identifier: "demo@hoosh.nobatime.ir",
 password: "demo12345",
 } as const;

 const handlePrefillDemoCredentials = () => {
 setLoginError("");
 setIdentifier(DEMO_LOGIN_CREDENTIALS.identifier);
 setPassword(DEMO_LOGIN_CREDENTIALS.password);
 try {
 identifierRef.current?.focus();
 } catch {
 /* ignore */
 }
 toast({
 title: "اطلاعات حساب دمو در فرم پر شد",
 description: "اکنون دکمه «ورود به حساب کاربری» را بزنید.",
 });
 };

 // ورود به حالت دمو — از onDemoAccess callback یا مستقیم /api/demo/access
 const handleDemoAccessClick = async () => {
 setDemoLoading(true);
 setLoginError("");
 try {
 if (onDemoAccess) {
 await onDemoAccess();
 onOpenChange(false);
 } else {
 const res = await fetch("/api/demo/access", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 });
 const data = await res.json();
 if (!data.success ||!data.token) {
 throw new Error(data.error || "خطا در ورود دمو");
 }
 try {
 localStorage.setItem("hoshhesab_user_token", data.token);
 } catch {
 /* ignore */
 }
 toast({
 title: "ورود به حالت دمو",
 description: "محیط دمو با داده‌های نمونه — صندوق فروش POS قابل تست است.",
 });
 onOpenChange(false);
 onUserLoginSuccess?.(data.token);
 }
 } catch (err) {
 toast({
 title: "خطا در ورود دمو",
 description:
 err instanceof Error? err.message: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setDemoLoading(false);
 }
 };

 const resetForm = () => {
 // FIX(remember-me): بعد از ورود موفق، اگر «مرا به خاطر بسپار» فعال بود،
 // اطلاعات ورود ذخیره می‌شود؛ در غیر این‌صورت پاک می‌شود. فیلدها هم پاک
 // می‌شوند اما دفعه بعد که دیالوگ باز شود، ذخیره‌شده‌ها دوباره پر می‌شوند.
 if (rememberMe && identifier.trim() && password) {
 saveRememberedLogin(identifier.trim(), password);
 setHasRemembered(true);
 } else {
 clearRememberedLogin();
 setHasRemembered(false);
 }
 setIdentifier("");
 setPassword("");
 setShowPwd(false);
 setRememberMe(false);
 };

 // FIX(remember-me): بازیابی مجدد اطلاعات ذخیره‌شده وقتی دیالوگ ورود دوباره باز می‌شود
 React.useEffect(() => {
 if (open) {
 const saved = loadRememberedLogin();
 if (saved && saved.identifier) {
 setIdentifier(saved.identifier);
 setPassword(saved.password);
 setRememberMe(true);
 setHasRemembered(true);
 }
 }
 }, [open]);

 const resetTwoFactor = () => {
 setTwoFactorPending(false);
 setTwoFactorUserId(null);
 setTwoFactorCode("");
 setTwoFactorBackupCode("");
 setTwoFactorUseBackup(false);
 setTwoFactorLoading(false);
 setTwoFactorRemaining(null);
 };

 // ارسال کد ۲FA (یا کد پشتیبان) به سرور و تکمیل ورود
 const handleTwoFactorSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!twoFactorUserId) {
 toast({
 title: "خطا",
 description: "نشست نامعتبر است. دوباره وارد شوید.",
 variant: "destructive",
 });
 resetTwoFactor();
 return;
 }
 const code = twoFactorCode.trim();
 const backup = twoFactorBackupCode.trim();
 if (twoFactorUseBackup) {
 if (!backup) {
 toast({
 title: "کد پشتیبان الزامی است",
 description: "یکی از کدهای پشتیبان ۸ رقمی را وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 } else {
 if (!/\d{6}/.test(code)) {
 toast({
 title: "کد نامعتبر",
 description: "کد ۲FA باید ۶ رقم باشد.",
 variant: "destructive",
 });
 return;
 }
 }
 setTwoFactorLoading(true);
 try {
 const res = await fetch("/api/auth/2fa/verify", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(
 twoFactorUseBackup
? { userId: twoFactorUserId, backupCode: backup }
: { userId: twoFactorUserId, code }
 ),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) {
 if (data?.locked) {
 toast({
 title: "حساب قفل شد",
 description: data?.error || "به دلیل تلاش‌های ناموفق، ۲FA قفل شد.",
 variant: "destructive",
 });
 resetTwoFactor();
 return;
 }
 if (typeof data?.remainingAttempts === "number") {
 setTwoFactorRemaining(data.remainingAttempts);
 }
 toast({
 title: "تأیید ناموفق",
 description: data?.error || "کد نادرست است.",
 variant: "destructive",
 });
 return;
 }
 // موفقیت — ذخیره‌ی توکن و ورود به اپ
 try {
 localStorage.setItem("hoshhesab_user_token", data.token);
 } catch {
 /* localStorage not available (private mode) — ignore */
 }
 toast({
 title: "ورود موفق",
 description: "تأیید دو مرحله‌ای انجام شد. به هوش خوش آمدید.",
 });
 onOpenChange(false);
 resetForm();
 resetTwoFactor();
 onUserLoginSuccess?.(data.token);
 } catch {
 toast({
 title: "خطای ارتباط",
 description: "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setTwoFactorLoading(false);
 }
 };

 // «ارسال مجدد کد» — برای ۲FA مبتنی بر TOTP کد از اپلیکیشن تأیید هویت
 // دریافت می‌شود، بنابراین این دکمه صرفاً فیلد را پاک کرده و یادآوری می‌کند
 // که کاربر باید اپلیکیشن Authenticator خود را بررسی کند.
 const handleTwoFactorResend = () => {
 setTwoFactorCode("");
 setTwoFactorRemaining(null);
 toast({
 title: "کد را از اپلیکیشن بررسی کنید",
 description: "کد ۲FA توسط اپلیکیشن تأیید هویت (مثل Google Authenticator) تولید می‌شود.",
 });
 window.setTimeout(() => {
 twoFactorRef.current?.focus();
 }, 100);
 };

 const handleTwoFactorBack = () => {
 resetTwoFactor();
 window.setTimeout(() => {
 identifierRef.current?.focus();
 }, 150);
 };

 const handleLogin = async (e: React.FormEvent) => {
 e.preventDefault();
 setLoginError("");
 if (!identifier.trim() ||!password) {
 toast({
 title: "اطلاعات ناقص",
 description: "نام کاربری (یا ایمیل) و رمز عبور را وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setLoginLoading(true);

 // AbortController با تایم‌اوت ۳۰ ثانیه — از هنگ کردن درخواست جلوگیری می‌کند
 const controller = new AbortController();
 const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

 try {
 // همیشه اول از /api/auth/login تلاش کن
 // FIX(remember-me): فلگ remember ارسال می‌شود تا نشست ۳۰ روزه ساخته شود
 const res = await fetch("/api/auth/login", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 identifier: identifier.trim(),
 password,
 remember: rememberMe,
 }),
 signal: controller.signal,
 });
 // FIX(B15a): res.json() بدون guard — پاس HTML پروکسی (502/504) استثنا می‌انداخت
 const data = await res.json().catch(() => ({} as { success?: boolean; error?: string }));

 if (!res.ok ||!data.success) {
 // بررسی پنهان برای ورود سطح بالا — بدون نشان دادن وجود پنل مدیریت
 // خودکار از /api/platform/login استفاده کن (پنهان)
 // FIX(B15b): fallback فقط وقتی «کاربر یافت نشد» — قبلاً هر 401 برای
 // کاربر عادی به‌نام admin به مسیر پلتفرم می‌رفت و پیام‌های خطای پلتفرم
 // (و rate limit سخت‌گیرانه‌ترش) را می‌دید.
 const _sa = [115,117,112,101,114,97,100,109,105,110].map(c=>String.fromCharCode(c)).join("");
 const _adm = [97,100,109,105,110].map(c=>String.fromCharCode(c)).join("");
 if (
 // FIX(v10): ورود مخفی سوپرادمین خراب بود — پیام عمومی لاگین «یافت نشد» ندارد
 // و fallback هرگز اجرا نمی‌شد. حالا: برای superadmin هر 401 مسیر پلتفرم را
 // امتحان می‌کند (نام superadmin در جدول User نیست)؛ برای admin فقط با
 // «یافت نشد» (کاربر عادی admin با رمز غلط، پیام پلتفرم نبیند — B15b)
 ((identifier.trim().toLowerCase() === _sa && res.status === 401) ||
 ((identifier.trim().toLowerCase() === _sa || identifier.trim().toLowerCase() === _adm) &&
 (data?.error?.includes("یافت نشد") || data?.error?.includes("not found"))))
 ) {
 // AbortController جدید برای درخواست پلتفرم
 const platformController = new AbortController();
 const platformTimeoutId = window.setTimeout(() => platformController.abort(), 30_000);

 try {
 const platformRes = await fetch("/api/platform/login", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 username: identifier.trim(),
 password,
 }),
 signal: platformController.signal,
 });
 const platformData = await platformRes.json().catch(() => ({} as { success?: boolean; error?: string; token?: string; admin?: unknown }));
 if (!platformRes.ok ||!platformData.success) {
 toast({
 title: "ورود ناموفق",
 description: platformData?.error || "اطلاعات نادرست است.",
 variant: "destructive",
 });
 return;
 }
 if (typeof window!== "undefined") {
 try {
 localStorage.setItem(ADMIN_TOKEN_KEY, platformData.token);
 localStorage.setItem(
 ADMIN_USER_KEY,
 JSON.stringify(platformData.admin)
 );
 } catch {
 /* localStorage not available (private mode) — ignore */
 }
 }
 toast({
 title: "ورود موفق",
 description: "به هوش خوش آمدید.",
 });
 onOpenChange(false);
 resetForm();
 onSuperAdminLoginSuccess?.(platformData.token, platformData.admin);
 return;
 } catch (platformErr) {
 // اگر درخواست پلتفرم تایم‌اوت شد یا خطای شبکه داشت
 if (platformErr instanceof DOMException && platformErr.name === "AbortError") {
 toast({
 title: "خطای ارتباط",
 description: "درخواست بیش از حد طول کشید. دوباره تلاش کنید.",
 variant: "destructive",
 });
 } else {
 toast({
 title: "خطای ارتباط",
 description: "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
 variant: "destructive",
 });
 }
 return;
 } finally {
 window.clearTimeout(platformTimeoutId);
 }
 }

 toast({
 title: "ورود ناموفق",
 description: data?.error || "اطلاعات نادرست است.",
 variant: "destructive",
 });
 return;
 }

 if (data.requiresTwoFactor) {
 // ورود مرحلهٔ دوم را درخواست کن — کد ۲FA از کاربر گرفته می‌شود
 setTwoFactorUserId(data.userId || null);
 setTwoFactorPending(true);
 toast({
 title: "تأیید دو مرحله‌ای",
 description: "کد ۶ رقمی از اپلیکیشن تأیید هویت را وارد کنید.",
 });
 window.setTimeout(() => {
 twoFactorRef.current?.focus();
 }, 200);
 return;
 }
 if (data.token) {
 try {
 localStorage.setItem("hoshhesab_user_token", data.token);
 } catch {
 /* localStorage not available (private mode) — ignore */
 }
 toast({
 title: "ورود موفق",
 description: "به هوش خوش آمدید.",
 });
 onOpenChange(false);
 resetForm();
 onUserLoginSuccess?.(data.token);
 }
 } catch (err) {
 // تشخیص نوع خطا: تایم‌اوت یا خطای شبکه
 if (err instanceof DOMException && err.name === "AbortError") {
 toast({
 title: "خطای ارتباط",
 description: "درخواست بیش از حد طول کشید. دوباره تلاش کنید.",
 variant: "destructive",
 });
 } else {
 toast({
 title: "خطای ارتباط",
 description: "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
 variant: "destructive",
 });
 }
 } finally {
 window.clearTimeout(timeoutId);
 setLoginLoading(false);
 }
 };

 const handleForgotPassword = () => {
 setForgotSent(false);
 setForgotEmail(identifier.trim());
 setForgotOpen(true);
 // فوکوس روی فیلد ایمیل پس از باز شدن
 window.setTimeout(() => {
 forgotEmailRef.current?.focus();
 }, 250);
 };

 const handleForgotSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 const email = forgotEmail.trim();
 if (!email ||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 toast({
 title: "ایمیل نامعتبر",
 description: "لطفاً یک ایمیل معتبر وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setForgotLoading(true);
 try {
 const res = await fetch("/api/auth/forgot-password", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok ||!data.success) {
 toast({
 title: "خطا",
 description: data?.error || "درخواست بازیابی ناموفق بود.",
 variant: "destructive",
 });
 return;
 }
 setForgotSent(true);
 toast({
 title: "درخواست ثبت شد",
 description:
 data.message ||
 "اگر این ایمیل در سیستم ثبت شده باشد، نام کاربری و رمز جدید ارسال شد.",
 });
 } catch {
 toast({
 title: "خطای ارتباط",
 description: "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setForgotLoading(false);
 }
 };

 const handleForgotBack = () => {
 setForgotOpen(false);
 setForgotSent(false);
 setForgotEmail("");
 window.setTimeout(() => {
 identifierRef.current?.focus();
 }, 250);
 };

 return (
 <AnimatePresence>
 {open && (
 <motion.div
 ref={containerRef}
 role="dialog"
 aria-modal="true"
 aria-labelledby="auth-view-title"
 aria-describedby="auth-view-desc"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 transition={{ duration: AUTH_LOW_MOTION? 0.15: 0.25, ease: "easeOut" }}
 className="fixed inset-0 z-[200] overflow-y-auto"
 dir="rtl"
 >
 {/* لایه‌ی پس‌زمینه */}
 <div className="absolute inset-0 bg-background" aria-hidden="true" />
 <div
 className="absolute inset-0"
 style={{
 background:
 "linear-gradient(135deg, var(--background) 0%, rgba(13,148,136,0.08) 50%, var(--background) 100%)",
 }}
 aria-hidden="true"
 />
 {/* PERF(21-C): mesh/orb/ذرات فقط دسکتاپ — روی موبایل hidden (GPU) */}
 <div className="absolute inset-0 auth-mesh opacity-90 pointer-events-none max-md:hidden" aria-hidden="true" />
 <FloatingOrbs />
 <div
 className="absolute inset-0 auth-particles opacity-40 pointer-events-none max-md:hidden"
 aria-hidden="true"
 />

 {/* دکمه‌ی بستن */}
 <button
 ref={closeBtnRef}
 type="button"
 onClick={() => onOpenChange(false)}
 aria-label="بستن صفحه ورود"
 className="absolute top-4 inset-inline-end-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-background/60 backdrop-blur-md border border-border/50 text-foreground/80 hover:bg-background/90 hover:text-foreground hover:scale-105 transition-all focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
 >
 <X className="h-5 w-5" />
 </button>

 {/* محتوای اصلی: گرید دو‌ستونه */}
 <div className="relative min-h-full w-full grid lg:grid-cols-[1.05fr_1fr]">
 {/* پنل برندینگ — فقط دسکتاپ */}
 <BrandPanel />

 {/* پنل ورود */}
 {/* dvh به‌جای vh — روی موبایل با نوار آدرس، مرکزچین در viewportِ واقعی */}
 <div className="flex items-center justify-center p-4 sm:p-6 lg:p-8 min-h-dvh lg:min-h-full">
 <motion.div
 initial={AUTH_LOW_MOTION? { opacity: 0 }: { scale: 0.92, opacity: 0, y: 24 }}
 animate={AUTH_LOW_MOTION? { opacity: 1 }: { scale: 1, opacity: 1, y: 0 }}
 exit={AUTH_LOW_MOTION? { opacity: 0 }: { scale: 0.92, opacity: 0, y: 24 }}
 transition={
 AUTH_LOW_MOTION
 ? { duration: 0.15, ease: "easeOut" }
 : { type: "spring", stiffness: 220, damping: 24, mass: 0.7 }
 }
 style={{ rotateX, rotateY, transformPerspective: 1400 }}
 onMouseMove={handleCardMouseMove}
 onMouseLeave={handleCardMouseLeave}
 className="auth-card-3d relative w-full max-w-md rounded-3xl p-6 sm:p-8"
 >
 {/* درخشش متحرک که با موس حرکت می‌کند */}
 <motion.div
 aria-hidden="true"
 className="pointer-events-none absolute inset-0 rounded-3xl opacity-50"
 style={{ background: glowBg }}
 />

 {/* هدر */}
 <div className="relative text-center mb-6">
 <motion.div
 initial={AUTH_LOW_MOTION? { opacity: 0 }: { scale: 0, rotate: -180 }}
 animate={AUTH_LOW_MOTION? { opacity: 1 }: { scale: 1, rotate: 0 }}
 transition={
 AUTH_LOW_MOTION
 ? { duration: 0.15, ease: "easeOut" }
 : { type: "spring", stiffness: 200, damping: 14, delay: 0.15 }
 }
 className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
 style={{
 background: "linear-gradient(135deg, #12304A 0%, #19B394 100%)",
 boxShadow: "0 12px 30px -8px rgba(18,48,74,0.5)",
 }}
 >
 {forgotOpen? (
 <Mail className="h-7 w-7 text-white" strokeWidth={2} />
 ): (
 <Sparkles className="h-7 w-7 text-white" strokeWidth={2} />
 )}
 </motion.div>
 <h2
 id="auth-view-title"
 className="text-2xl font-bold tracking-tight text-foreground"
 >
 {forgotOpen? (
 "بازیابی اطلاعات ورود"
 ): (
 <>
 ورود به <span className="auth-brand-text">هوش</span>
 </>
 )}
 </h2>
 <p
 id="auth-view-desc"
 className="mt-1.5 text-xs text-muted-foreground"
 >
 {forgotOpen
? "ایمیل خود را وارد کنید؛ نام کاربری و رمز عبور جدید برایتان ایمیل می‌شود"
: "با حساب کاربری خود وارد شوید یا دسترسی فوری ۳ روزه بگیرید"}
 </p>
 <div className="auth-underline mx-auto mt-3 h-[2px] w-20 rounded-full" />
 </div>

 <AnimatePresence mode="wait" initial={false}>
 {forgotOpen? (
 <motion.div
 key="forgot"
 initial={{ opacity: 0, x: 30 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: -30 }}
 transition={{ duration: 0.25 }}
 className="space-y-3"
 >
 {!forgotSent? (
 <form onSubmit={handleForgotSubmit} className="space-y-3">
 <div className="space-y-1.5">
 <Label
 htmlFor="auth-forgot-email"
 className="text-xs font-medium text-foreground/80"
 >
 ایمیل ثبت‌شده
 </Label>
 <div className="relative">
 <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none" />
 <Input
 ref={forgotEmailRef}
 id="auth-forgot-email"
 type="email"
 autoComplete="email"
 value={forgotEmail}
 onChange={(e) => setForgotEmail(e.target.value)}
 placeholder="example@hoosh.nobatime.ir"
 className="auth-input ps-10 pe-3 h-11 text-sm bg-background/60 border-border/60"
 disabled={forgotLoading}
 dir="ltr"
 name="email"
 />
 </div>
 <p className="text-[10px] text-muted-foreground/80 leading-relaxed pt-1">
 نام کاربری و رمز عبور جدید به همین ایمیل ارسال می‌شود. در
 صورت وجود حساب، تا ۵ دقیقه ایمیل را دریافت خواهید کرد.
 </p>
 </div>

 <Button
 type="submit"
 className="relative w-full h-12 mt-1 overflow-hidden border-0 text-white font-semibold auth-submit"
 disabled={forgotLoading ||!forgotEmail.trim()}
 >
 <span className="relative z-10 flex items-center justify-center gap-2">
 {forgotLoading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ارسال...
 </>
 ): (
 <>
 <Mail className="h-4 w-4" />
 ارسال اطلاعات ورود جدید
 </>
 )}
 </span>
 </Button>

 <Button
 type="button"
 variant="ghost"
 onClick={handleForgotBack}
 disabled={forgotLoading}
 className="w-full h-10 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
 >
 <ArrowRight className="h-3.5 w-3.5" />
 بازگشت به ورود
 </Button>
 </form>
 ): (
 <div className="space-y-4">
 <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
 <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
 <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
 </div>
 <p className="text-sm font-semibold text-foreground mb-1">
 درخواست شما ثبت شد
 </p>
 <p className="text-xs text-muted-foreground leading-relaxed">
 اگر این ایمیل در سیستم ثبت شده باشد، نام کاربری و
 رمز عبور جدید برایتان ارسال شد. لطفاً صندوق ورودی و
 پوشه‌ی اسپم را هم بررسی کنید.
 </p>
 </div>
 <Button
 type="button"
 onClick={handleForgotBack}
 className="w-full h-11 gap-1.5"
 >
 <ArrowRight className="h-4 w-4" />
 بازگشت به ورود
 </Button>
 </div>
 )}
 </motion.div>
 ): (
 <motion.div
 key="login"
 initial={{ opacity: 0, x: -30 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: 30 }}
 transition={{ duration: 0.25 }}
 >
 {/* حالت ورود: فقط ورود کاربر عادی — سوپرادمین مخفی است */}

 <AnimatePresence mode="wait" initial={false}>
 {twoFactorPending? (
 <motion.div
 key="2fa"
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -8 }}
 transition={{ duration: 0.25, ease: "easeOut" }}
 >
 <form onSubmit={handleTwoFactorSubmit} className="space-y-3">
 {/* بنر بالای فرم ۲FA */}
 <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
 <ShieldCheck className="h-4 w-4 text-primary" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-semibold text-foreground">
 تأیید دو مرحله‌ای
 </p>
 <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
 کد ۶ رقمی از اپلیکیشن تأیید هویت (Google Authenticator /
 Authy) را وارد کنید.
 </p>
 </div>
 </div>

 {!twoFactorUseBackup? (
 <div className="space-y-1.5">
 <Label
 htmlFor="auth-2fa-code"
 className="text-xs font-medium text-foreground/80"
 >
 کد تأیید ۶ رقمی
 </Label>
 <div className="relative">
 <KeyRound className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none" />
 <Input
 ref={twoFactorRef}
 id="auth-2fa-code"
 autoComplete="one-time-code"
 inputMode="numeric"
 pattern="[0-9]*"
 maxLength={6}
 value={twoFactorCode}
 onChange={(e) =>
 setTwoFactorCode(
 e.target.value.replace(/\D/g, "").slice(0, 6)
 )
 }
 placeholder="••••••"
 className="auth-input ps-10 pe-3 h-11 text-sm bg-background/60 border-border/60 tracking-[0.5em] text-center font-mono tnum"
 disabled={twoFactorLoading}
 dir="ltr"
 name="otp"
 />
 </div>
 {twoFactorRemaining!== null && (
 <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed pt-0.5">
 {twoFactorRemaining > 0
? `${twoFactorRemaining} تلاش باقی‌مانده.`
: "تلاش‌های شما به پایان رسیده است."}
 </p>
 )}
 </div>
 ): (
 <div className="space-y-1.5">
 <Label
 htmlFor="auth-2fa-backup"
 className="text-xs font-medium text-foreground/80"
 >
 کد پشتیبان
 </Label>
 <div className="relative">
 <KeyRound className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none" />
 <Input
 ref={twoFactorBackupRef}
 id="auth-2fa-backup"
 autoComplete="off"
 value={twoFactorBackupCode}
 onChange={(e) =>
 setTwoFactorBackupCode(e.target.value.trim())
 }
 placeholder="کد ۸ رقمی پشتیبان"
 className="auth-input ps-10 pe-3 h-11 text-sm bg-background/60 border-border/60 font-mono"
 disabled={twoFactorLoading}
 dir="ltr"
 />
 </div>
 <p className="text-[10px] text-muted-foreground/80 leading-relaxed pt-0.5">
 کد پشتیبان فقط یک‌بار قابل استفاده است.
 </p>
 </div>
 )}

 <Button
 type="submit"
 className="relative w-full h-12 mt-1 overflow-hidden border-0 text-white font-semibold auth-submit"
 disabled={twoFactorLoading}
 >
 <span className="relative z-10 flex items-center justify-center gap-2">
 {twoFactorLoading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال تأیید...
 </>
 ): (
 <>
 <ShieldCheck className="h-4 w-4" />
 تأیید و ورود
 </>
 )}
 </span>
 </Button>

 {/* ردیف دکمه‌های کمکی: بازگشت، ارسال مجدد، کد پشتیبان */}
 <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
 <button
 type="button"
 onClick={handleTwoFactorBack}
 className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
 >
 <ArrowLeft className="h-3.5 w-3.5" />
 بازگشت به ورود
 </button>
 <button
 type="button"
 onClick={handleTwoFactorResend}
 className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
 >
 <RefreshCw className="h-3.5 w-3.5" />
 ارسال مجدد کد
 </button>
 <button
 type="button"
 onClick={() => {
 setTwoFactorUseBackup((v) =>!v);
 setTwoFactorCode("");
 setTwoFactorBackupCode("");
 window.setTimeout(() => {
 if (!twoFactorUseBackup) {
 twoFactorBackupRef.current?.focus();
 } else {
 twoFactorRef.current?.focus();
 }
 }, 100);
 }}
 className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
 >
 <KeyRound className="h-3.5 w-3.5" />
 {twoFactorUseBackup? "ورود با کد ۲FA": "استفاده از کد پشتیبان"}
 </button>
 </div>
 </form>
 </motion.div>
 ): (
 <motion.div
 key="login"
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -8 }}
 transition={{ duration: 0.25, ease: "easeOut" }}
 >
 {/* فرم ورود — انیمیشن ملایم fade+slide برای اطمینان از نمایش همیشه فیلدها */}
 <form onSubmit={handleLogin} className="relative">
 <AnimatePresence mode="wait" initial={false}>
 <motion.div
 key="login"
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -8 }}
 transition={{ duration: 0.25, ease: "easeOut" }}
 className="space-y-3"
 >
 {/* فیلد نام کاربری (یا ایمیل) */}
 <div className="space-y-1.5">
 <Label
 htmlFor="auth-identifier"
 className="text-xs font-medium text-foreground/80"
 >
 نام کاربری
 </Label>
 <div className="relative">
 <User className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none" />
 <Input
 ref={identifierRef}
 id="auth-identifier"
 autoComplete="username"
 value={identifier}
 onChange={(e) => setIdentifier(e.target.value)}
 placeholder="نام کاربری یا ایمیل"
 className="auth-input ps-10 pe-3 h-11 text-sm bg-background/60 border-border/60"
 disabled={loginLoading}
 dir="ltr"
 name="username"
 />
 </div>
 <p className="text-[10px] text-muted-foreground/80 leading-relaxed pt-0.5">
 نام کاربری یا ایمیل ثبت‌شده را وارد کنید.
 </p>
 </div>

 {/* فیلد رمز عبور */}
 <div className="space-y-1.5">
 <div className="flex items-center justify-between">
 <Label
 htmlFor="auth-password"
 className="text-xs font-medium text-foreground/80"
 >
 رمز عبور
 </Label>
 <button
 type="button"
 onClick={handleForgotPassword}
 className="text-[11px] text-primary hover:underline hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
 >
 فراموشی رمز عبور؟
 </button>
 </div>
 <div className="relative">
 <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70 pointer-events-none" />
 <Input
 id="auth-password"
 type={showPwd? "text": "password"}
 autoComplete="current-password"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 placeholder="••••••••"
 className="auth-input ps-10 pe-10 h-11 text-sm bg-background/60 border-border/60"
 disabled={loginLoading}
 dir="ltr"
 name="password"
 />
 <button
 type="button"
 onClick={() => setShowPwd((s) =>!s)}
 className="absolute end-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
 aria-label={showPwd? "پنهان کردن رمز": "نمایش رمز"}
 tabIndex={-1}
 >
 {showPwd? (
 <EyeOff className="h-4 w-4" />
 ): (
 <Eye className="h-4 w-4" />
 )}
 </button>
 </div>
 </div>

 {/* FIX(remember-me): چک‌باکس «مرا به خاطر بسپار» + نمایش وضعیت ذخیره‌شده */}
 <div className="space-y-1">
 <div className="flex items-center gap-2 select-none">
 <Checkbox
 id="auth-remember"
 checked={rememberMe}
 onCheckedChange={(v) => handleRememberChange(v === true)}
 disabled={loginLoading}
 className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
 />
 <Label
 htmlFor="auth-remember"
 className="text-xs font-medium text-foreground/80 cursor-pointer select-none"
 >
 مرا به خاطر بسپار
 </Label>
 {hasRemembered && (
 <span className="inline-flex items-center gap-1 text-[10px] text-primary">
 <CheckCircle2 className="h-3 w-3" />
 اطلاعات ورود شما روی این دستگاه ذخیره شده است
 </span>
 )}
 </div>
 <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
 با فعال‌کردن این گزینه، نام کاربری و رمز عبور روی همین دستگاه ذخیره
 می‌شود و دفعه‌ی بعد به‌صورت خودکار پر می‌شود — نشست شما هم تا ۳۰ روز
 بدون نیاز به ورود مجدد معتبر می‌ماند. روی دستگاه‌های عمومی فعال نکنید.
 </p>
 </div>

 {/* دکمه‌ی submit بزرگ با گرادیان متحرک */}
 <Button
 type="submit"
 className="relative w-full h-12 mt-1 overflow-hidden border-0 text-white font-semibold auth-submit"
 disabled={loginLoading}
 >
 <span className="relative z-10 flex items-center justify-center gap-2">
 {loginLoading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ورود...
 </>
 ): (
 <>
 <LogIn className="h-4 w-4" />
 ورود به حساب کاربری
 </>
 )}
 </span>
 </Button>
 </motion.div>
 </AnimatePresence>
 </form>

 {/* FIX(درخواست کاربر): کارت اطلاعات حساب دمو — پر کردن خودکار فرم ورود */}
 <div className="rounded-xl border border-purple-500/25 bg-purple-500/[0.06] p-3.5 space-y-2.5">
 <div className="flex items-center gap-2">
 <Sparkles className="h-4 w-4 text-purple-500 shrink-0" />
 <span className="text-xs font-semibold text-foreground">
 حساب دمو — تست بدون ثبت‌نام
 </span>
 </div>
 <p className="text-[11px] text-muted-foreground leading-relaxed">
 برای مشاهده محیط کامل برنامه با داده‌های نمونه (فاکتورها، انبار، صندوق
 فروش POS و گزارش‌ها) می‌توانید با حساب دمو وارد شوید:
 </p>
 <div className="grid grid-cols-2 gap-2">
 <div
 dir="ltr"
 className="flex items-center justify-center rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 text-[11px] font-mono text-foreground/90 text-center select-all"
 title="نام کاربری دمو"
 >
 demo@hoosh.nobatime.ir
 </div>
 <div
 dir="ltr"
 className="flex items-center justify-center rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 text-[11px] font-mono text-foreground/90 text-center select-all"
 title="رمز عبور دمو"
 >
 demo12345
 </div>
 </div>
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="w-full h-9 border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/15 hover:border-purple-500/50 text-foreground"
 onClick={handlePrefillDemoCredentials}
 disabled={loginLoading || demoLoading}
 >
 <span className="flex items-center justify-center gap-2">
 <KeyRound className="h-3.5 w-3.5 text-purple-500" />
 پر کردن فرم با اطلاعات دمو
 </span>
 </Button>
 </div>

 {/* جداکننده «یا» */}
 <div className="relative my-5 flex items-center">
 <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
 <span className="px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
 یا
 </span>
 <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
 </div>

 {/* دکمه‌ی ورود فوری ۳ روزه — ثانویه */}
 <Button
 type="button"
 variant="outline"
 className="relative w-full h-11 border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 text-foreground font-medium group"
 onClick={handleQuickAccess}
 disabled={loading}
 >
 <span className="flex items-center justify-center gap-2">
 {loading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ساخت حساب...
 </>
 ): (
 <>
 <Zap className="h-4 w-4 text-amber-500 group-hover:scale-110 transition-transform" />
 ورود فوری (۳ روز رایگان)
 <Gift className="h-3.5 w-3.5 text-rose-500" />
 </>
 )}
 </span>
 </Button>

 {/* دکمه‌ی ورود دمو — آزمایش بدون ثبت‌نام */}
 <Button
 type="button"
 variant="outline"
 className="relative w-full h-11 border-2 border-purple-500/25 bg-purple-500/5 hover:bg-purple-500/10 hover:border-purple-500/40 text-foreground font-medium group"
 onClick={handleDemoAccessClick}
 disabled={demoLoading}
 >
 <span className="flex items-center justify-center gap-2">
 {demoLoading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ورود دمو...
 </>
 ): (
 <>
 <Sparkles className="h-4 w-4 text-purple-500 group-hover:scale-110 transition-transform" />
 مشاهده دمو
 </>
 )}
 </span>
 </Button>
 </motion.div>
 )}
 </AnimatePresence>

 {/* نشان‌های اعتماد */}
 <div className="mt-5 grid grid-cols-3 gap-2">
 <div className="auth-trust flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2 py-2.5 text-center">
 <ShieldCheck className="h-4 w-4 text-primary" />
 <span className="text-[10px] font-medium text-foreground/80">
 امنیت SSL
 </span>
 </div>
 <div className="auth-trust flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2 py-2.5 text-center">
 <Headphones className="h-4 w-4 text-amber-500" />
 <span className="text-[10px] font-medium text-foreground/80">
 پشتیبانی ۲۴/۷
 </span>
 </div>
 <div className="auth-trust flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2 py-2.5 text-center">
 <Gift className="h-4 w-4 text-rose-500" />
 <span className="text-[10px] font-medium text-foreground/80">
 ۳ روز رایگان
 </span>
 </div>
 </div>

 {/* توضیحات پایین */}
 <p className="mt-4 text-center text-[10px] text-muted-foreground/80 leading-relaxed">
 با کلیک روی «ورود فوری»، یک حساب موقت ۳ روزه ساخته می‌شود.
 <br />
 «مشاهده دمو» برای آزمایش بدون ثبت‌نام.
 </p>

 {/* Esc hint */}
 <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/60">
 <kbd className="inline-flex items-center rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-mono">
 Esc
 </kbd>
 <span>برای بستن</span>
 <HelpCircle className="h-3 w-3 mr-1" />
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </motion.div>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 );
}
