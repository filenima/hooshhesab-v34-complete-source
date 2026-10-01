"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
 KeyRound,
 Lock,
 Eye,
 EyeOff,
 Loader2,
 CheckCircle2,
 AlertCircle,
 ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Card,
 CardHeader,
 CardTitle,
 CardDescription,
 CardContent,
 CardFooter,
} from "@/components/ui/card";

// صفحه‌ی تنظیم رمز عبور جدید پس از کلیک روی لینک بازیابی ایمیل‌شده.
// توکن از query string خوانده می‌شود و به /api/auth/reset-password ارسال می‌گردد.
export default function ResetPasswordPage() {
 const router = useRouter();
 const searchParams = useSearchParams();
 const token = searchParams.get("token") || "";

 const [newPassword, setNewPassword] = React.useState("");
 const [confirmPassword, setConfirmPassword] = React.useState("");
 const [showPassword, setShowPassword] = React.useState(false);
 const [showConfirm, setShowConfirm] = React.useState(false);
 const [loading, setLoading] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);
 const [fieldErrors, setFieldErrors] = React.useState<string[] | null>(null);
 const [success, setSuccess] = React.useState(false);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setError(null);
 setFieldErrors(null);

 if (!token) {
 setError("توکن بازیابی در آدرس وجود ندارد. لطفاً از لینک ایمیل‌شده استفاده کنید.");
 return;
 }
 if (newPassword.length < 8) {
 setError("رمز عبور باید حداقل ۸ کاراکتر باشد.");
 return;
 }
 if (newPassword!== confirmPassword) {
 setError("رمز عبور و تکرار آن یکسان نیستند.");
 return;
 }

 setLoading(true);
 try {
 const res = await fetch("/api/auth/reset-password", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ token, newPassword }),
 });
 const data = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 error?: string;
 details?: string[];
 message?: string;
 };

 if (res.ok && data.success) {
 setSuccess(true);
 // هدایت به صفحه اصلی پس از ۴ ثانیه
 setTimeout(() => {
 router.push("/");
 }, 4000);
 } else {
 setError(data.error || "خطا در تنظیم رمز عبور جدید.");
 if (Array.isArray(data.details) && data.details.length > 0) {
 setFieldErrors(data.details);
 }
 }
 } catch (err) {
 console.error("Reset password fetch error:", err);
 setError("خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.");
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className="flex min-h-screen flex-col bg-gradient-to-b from-primary/5 to-background">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between gap-3 px-4">
 <Link
 href="/"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 <ArrowRight className="h-4 w-4" />
 بازگشت به خانه
 </Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <KeyRound className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">هوش</span>
 </Link>
 </div>
 </header>

 <main className="flex flex-1 items-center justify-center px-4 py-10">
 <Card className="w-full max-w-md shadow-lg">
 <CardHeader className="text-center">
 <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
 <Lock className="h-6 w-6" />
 </div>
 <CardTitle className="text-xl">بازیابی رمز عبور</CardTitle>
 <CardDescription>
 رمز عبور جدید خود را وارد کنید. این رمز برای ورود بعدی استفاده خواهد شد.
 </CardDescription>
 </CardHeader>

 <CardContent>
 {success? (
 <div className="space-y-4 text-center">
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
 <CheckCircle2 className="h-7 w-7" />
 </div>
 <div>
 <p className="font-medium text-foreground">رمز عبور با موفقیت تغییر کرد</p>
 <p className="mt-1 text-sm text-muted-foreground">
 اکنون می‌توانید با رمز جدید وارد شوید. در حال انتقال به صفحه‌ی ورود...
 </p>
 </div>
 <Button asChild className="w-full">
 <Link href="/">رفتن به صفحه‌ی ورود</Link>
 </Button>
 </div>
 ):!token? (
 <div className="space-y-4 text-center">
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
 <AlertCircle className="h-7 w-7" />
 </div>
 <div>
 <p className="font-medium text-foreground">لینک نامعتبر است</p>
 <p className="mt-1 text-sm text-muted-foreground">
 توکن بازیابی در آدرس یافت نشد. لطفاً از لینک موجود در ایمیل بازیابی استفاده کنید.
 </p>
 </div>
 <Button asChild variant="outline" className="w-full">
 <Link href="/">بازگشت به خانه</Link>
 </Button>
 </div>
 ): (
 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="space-y-1.5">
 <Label htmlFor="new-password">رمز عبور جدید</Label>
 <div className="relative">
 <Input
 id="new-password"
 type={showPassword? "text": "password"}
 autoComplete="new-password"
 placeholder="••••••••"
 value={newPassword}
 onChange={(e) => setNewPassword(e.target.value)}
 disabled={loading}
 required
 minLength={8}
 className="pe-10"
 />
 <button
 type="button"
 onClick={() => setShowPassword((s) =>!s)}
 className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
 tabIndex={-1}
 aria-label={showPassword? "پنهان کردن رمز": "نمایش رمز"}
 >
 {showPassword? <EyeOff className="h-4 w-4" />: <Eye className="h-4 w-4" />}
 </button>
 </div>
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="confirm-password">تکرار رمز عبور</Label>
 <div className="relative">
 <Input
 id="confirm-password"
 type={showConfirm? "text": "password"}
 autoComplete="new-password"
 placeholder="••••••••"
 value={confirmPassword}
 onChange={(e) => setConfirmPassword(e.target.value)}
 disabled={loading}
 required
 minLength={8}
 className="pe-10"
 />
 <button
 type="button"
 onClick={() => setShowConfirm((s) =>!s)}
 className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
 tabIndex={-1}
 aria-label={showConfirm? "پنهان کردن رمز": "نمایش رمز"}
 >
 {showConfirm? <EyeOff className="h-4 w-4" />: <Eye className="h-4 w-4" />}
 </button>
 </div>
 {confirmPassword.length > 0 && newPassword!== confirmPassword && (
 <p className="text-xs text-destructive">رمز عبور و تکرار آن یکسان نیستند.</p>
 )}
 </div>

 {error && (
 <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
 <div className="flex items-start gap-2">
 <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
 <div>
 <p>{error}</p>
 {fieldErrors && fieldErrors.length > 0 && (
 <ul className="mt-1.5 list-disc ps-4 text-xs">
 {fieldErrors.map((fe, i) => (
 <li key={i}>{fe}</li>
 ))}
 </ul>
 )}
 </div>
 </div>
 </div>
 )}

 <Button type="submit" className="w-full" disabled={loading ||!newPassword ||!confirmPassword}>
 {loading? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 در حال ذخیره...
 </>
 ): (
 "تغییر رمز عبور"
 )}
 </Button>
 </form>
 )}
 </CardContent>

 <CardFooter className="justify-center">
 <p className="text-xs text-muted-foreground">
 رمز عبور باید حداقل ۸ کاراکتر شامل حروف بزرگ، کوچک و عدد باشد.
 </p>
 </CardFooter>
 </Card>
 </main>

 <footer className="border-t border-border bg-background/85 py-4">
 <div className="mx-auto w-full max-w-md px-4 text-center text-xs text-muted-foreground">
 {new Date().getFullYear()} هوش — نرم‌افزار حسابداری هوشمند ایرانی
 </div>
 </footer>
 </div>
 );
}
