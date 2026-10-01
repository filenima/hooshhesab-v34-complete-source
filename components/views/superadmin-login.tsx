"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 ShieldCheck,
 Lock,
 User,
 ArrowLeft,
 Loader2,
 KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface SuperAdminLoginProps {
 onBack: () => void;
 onLoggedIn: (token: string, admin: { id: string; username: string; role: string }) => void;
}

const STORAGE_KEY = "hoshhesab_admin_token";
const ADMIN_KEY = "hoshhesab_admin_user";

export function SuperAdminLogin({ onBack, onLoggedIn }: SuperAdminLoginProps) {
 const { toast } = useToast();
 const [username, setUsername] = React.useState("");
 const [password, setPassword] = React.useState("");
 const [loading, setLoading] = React.useState(false);
 const [showPwd, setShowPwd] = React.useState(false);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!username.trim() ||!password) {
 toast({
 title: "اطلاعات ناقص",
 description: "نام کاربری و رمز عبور را وارد کنید.",
 });
 return;
 }
 setLoading(true);
 try {
 const res = await fetch("/api/platform/login", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ username: username.trim(), password }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) {
 toast({
 title: "ورود ناموفق",
 description: data?.error || "اطلاعات نادرست است.",
 variant: "destructive",
 });
 return;
 }
 // ذخیره توکن و اطلاعات ادمین
 if (typeof window!== "undefined") {
 try {
 localStorage.setItem(STORAGE_KEY, data.token);
 localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin));
 } catch {
 /* localStorage not available (private mode) — ignore */
 }
 }
 toast({
 title: "ورود موفق",
 description: "به پنل مدیریت پلتفرم خوش آمدید.",
 });
 onLoggedIn(data.token, data.admin);
 } catch {
 toast({
 title: "خطای ارتباط",
 description: "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-accent/30">
 {/* هدر ساده */}
 <header className="border-b border-border bg-background/70 backdrop-blur-xl">
 <div className="mx-auto max-w-6xl flex h-14 items-center justify-between px-4">
 <button
 onClick={onBack}
 className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
 >
 <ArrowLeft className="h-4 w-4" />
 <span>بازگشت به سایت</span>
 </button>
 <div className="flex items-center gap-2">
 <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <ShieldCheck className="h-3.5 w-3.5" />
 </div>
 <span className="font-bold text-sm">هوش</span>
 </div>
 </div>
 </header>

 <main className="flex-1 flex items-center justify-center px-4 py-10">
 <motion.div
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.3, ease: "easeOut" }}
 className="w-full max-w-md"
 >
 <div className="card-hover rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
 {/* بنر بالا */}
 <div className="relative h-32 bg-gradient-to-br from-primary/10 via-accent to-primary/5 border-b border-border flex items-center justify-center overflow-hidden">
 <div className="absolute inset-0 opacity-30" style={{
 backgroundImage: "radial-gradient(circle at 20% 30%, rgba(79,70,229,0.15), transparent 50%), radial-gradient(circle at 80% 70%, rgba(79,70,229,0.10), transparent 50%)",
 }} />
 <div className="relative flex flex-col items-center gap-2">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
 <ShieldCheck className="h-7 w-7" />
 </div>
 <span className="text-[10px] font-semibold text-primary tracking-wider uppercase">
 Platform Console
 </span>
 </div>
 </div>

 {/* بدنه فرم */}
 <form onSubmit={handleSubmit} className="p-6 space-y-5">
 <div className="text-center space-y-1">
 <h1 className="text-xl font-bold text-foreground">
 ورود به پنل مدیریت پلتفرم
 </h1>
 <p className="text-xs text-muted-foreground leading-relaxed">
 دسترسی محدود به مدیران سامانه. اطلاعات حساب خود را وارد کنید.
 </p>
 </div>

 <div className="space-y-2">
 <Label htmlFor="su-username" className="text-xs font-medium">
 نام کاربری
 </Label>
 <div className="relative">
 <User className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 id="su-username"
 autoComplete="username"
 value={username}
 onChange={(e) => setUsername(e.target.value)}
 placeholder="نام کاربری پلتفرم"
 className="ps-9 h-10"
 disabled={loading}
 dir="ltr"
 />
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="su-password" className="text-xs font-medium">
 رمز عبور
 </Label>
 <div className="relative">
 <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
 <Input
 id="su-password"
 type={showPwd? "text": "password"}
 autoComplete="current-password"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 placeholder="••••••••"
 className="ps-9 pe-9 h-10"
 disabled={loading}
 dir="ltr"
 />
 <button
 type="button"
 onClick={() => setShowPwd((s) =>!s)}
 className="absolute end-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
 aria-label={showPwd? "پنهان کردن رمز": "نمایش رمز"}
 tabIndex={-1}
 >
 <KeyRound className="h-3.5 w-3.5" />
 </button>
 </div>
 </div>

 <Button
 type="submit"
 className="w-full h-10"
 disabled={loading}
 >
 {loading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ورود...
 </>
 ): (
 <>
 <ShieldCheck className="h-4 w-4" />
 ورود به پنل
 </>
 )}
 </Button>

 <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
 تمام تلاش‌ها برای دسترسی غیرمجاز ثبت می‌شود.
 <br />
 این سامانه تحت نظارت سیستم امنیتی هوش است.
 </p>
 </form>
 </div>

 <p className="mt-6 text-center text-[11px] text-muted-foreground">
 هوش {new Date().getFullYear()} — پلتفرم مدیریت
 </p>
 </motion.div>
 </main>
 </div>
 );
}

// helperهای exportشده برای استفاده در app-shell و superadmin-panel
export function getStoredAdminToken(): string | null {
 if (typeof window === "undefined") return null;
 try {
 return localStorage.getItem(STORAGE_KEY);
 } catch {
 /* localStorage not available (private mode) */
 return null;
 }
}

export function getStoredAdminUser(): { id: string; username: string; role: string } | null {
 if (typeof window === "undefined") return null;
 try {
 const raw = localStorage.getItem(ADMIN_KEY);
 return raw? JSON.parse(raw): null;
 } catch {
 return null;
 }
}

export function clearStoredAdmin(): void {
 if (typeof window === "undefined") return;
 try {
 localStorage.removeItem(STORAGE_KEY);
 localStorage.removeItem(ADMIN_KEY);
 } catch {
 /* localStorage not available (private mode) — ignore */
 }
}

export { STORAGE_KEY as ADMIN_TOKEN_KEY, ADMIN_KEY as ADMIN_USER_KEY };
