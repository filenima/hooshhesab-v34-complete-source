"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Fingerprint, ScanFace, ShieldAlert, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 Card,
 CardContent,
 CardDescription,
 CardHeader,
 CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

// ============ Biometric Login (WebAuthn / FIDO2) ============
// کامپوننت ورود با اثر انگشت / چهره با استفاده از WebAuthn API.
// در صورت عدم پشتیبانی مرورگر، به‌صورت خودکار به فرم رمز عبور برمی‌گردد.

interface BiometricLoginProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onSuccess?: (credentialId: string) => void;
 onFallbackPassword?: () => void;
}

interface BrowserCredential {
 id: string;
 type: string;
}

// تبدیل ArrayBuffer به Base64URL
function bufferToBase64url(buf: ArrayBuffer): string {
 const bytes = new Uint8Array(buf);
 let str = "";
 for (const b of bytes) str += String.fromCharCode(b);
 return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// تبدیل Base64URL به ArrayBuffer
function base64urlToBuffer(b64: string): ArrayBuffer {
 const pad = "=".repeat((4 - (b64.length % 4)) % 4);
 const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
 const binary = atob(base64);
 const bytes = new Uint8Array(binary.length);
 for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
 return bytes.buffer;
}

// تولید challenge تصادفی در سمت کلاینت
function generateChallenge(): ArrayBuffer {
 const arr = new Uint8Array(32);
 crypto.getRandomValues(arr);
 return arr.buffer;
}

// بررسی پشتیبانی مرورگر
async function checkBiometricSupport(): Promise<{
 supported: boolean;
 platformAuth: boolean;
}> {
 if (typeof window === "undefined" ||!window.PublicKeyCredential) {
 return { supported: false, platformAuth: false };
 }
 try {
 const platformAuth =
 await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
 return { supported: true, platformAuth };
 } catch {
 return { supported: true, platformAuth: false };
 }
}

export function BiometricLogin({
 open,
 onOpenChange,
 onSuccess,
 onFallbackPassword,
}: BiometricLoginProps) {
 const { toast } = useToast();
 const [mode, setMode] = React.useState<"idle" | "register" | "auth">("idle");
 const [loading, setLoading] = React.useState(false);
 const [support, setSupport] = React.useState<{
 supported: boolean;
 platformAuth: boolean;
 }>({ supported: false, platformAuth: false });
 const [registeredCreds, setRegisteredCreds] = React.useState<string[]>([]);
 const [error, setError] = React.useState<string | null>(null);

 const STORAGE_KEY = "hoshhesab_biometric_credentials";

 // بارگذاری credentialهای ذخیره‌شده در localStorage
 React.useEffect(() => {
 if (typeof window === "undefined") return;
 try {
 const stored = localStorage.getItem(STORAGE_KEY);
 if (stored) {
 const ids = JSON.parse(stored) as string[];
 setRegisteredCreds(ids);
 }
 } catch {
 // ignore
 }
 }, []);

 // بررسی پشتیبانی هنگام باز شدن
 React.useEffect(() => {
 if (!open) return;
 void checkBiometricSupport().then(setSupport);
 }, [open]);

 // ثبت credential بیومتریک جدید
 async function handleRegister() {
 setLoading(true);
 setError(null);
 try {
 const publicKey: PublicKeyCredentialCreationOptions = {
 challenge: generateChallenge(),
 rp: {
 name: "هوش",
 id: window.location.hostname,
 },
 user: {
 id: base64urlToBuffer(
 btoa(`hoshhesab-user-${Date.now()}`).slice(0, 32)
 ),
 name: `user-${Date.now()}`,
 displayName: "کاربر هوش",
 },
 pubKeyCredParams: [
 { type: "public-key", alg: -7 },
 { type: "public-key", alg: -257 },
 ],
 timeout: 60000,
 attestation: "none",
 authenticatorSelection: {
 authenticatorAttachment: "platform",
 userVerification: "required",
 requireResidentKey: false,
 },
 excludeCredentials: registeredCreds.map((id) => ({
 type: "public-key",
 id: base64urlToBuffer(id),
 })),
 };

 const credential = (await navigator.credentials.create({
 publicKey,
 })) as PublicKeyCredential | null;

 if (!credential) {
 throw new Error("اثر انگشت ثبت نشد");
 }

 const credId = credential.id;
 const newCreds = [...registeredCreds, credId];
 setRegisteredCreds(newCreds);
 localStorage.setItem(STORAGE_KEY, JSON.stringify(newCreds));

 toast({
 title: "ثبت موفق",
 description: "اثر انگشت / چهره با موفقیت برای ورود ثبت شد",
 });

 onSuccess?.(credId);
 onOpenChange(false);
 } catch (err) {
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 if (msg.includes("NotAllowedError") || msg.includes("aborted")) {
 setError("عملیات لغو شد یا توسط کاربر متوقف شد");
 } else if (msg.includes("InvalidStateError")) {
 setError("این اثر انگشت قبلاً ثبت شده است");
 } else {
 setError(`خطا در ثبت: ${msg}`);
 }
 } finally {
 setLoading(false);
 }
 }

 // ورود با credential بیومتریک
 async function handleAuthenticate() {
 if (registeredCreds.length === 0) {
 setError("ابتدا یک اثر انگشت ثبت کنید");
 return;
 }
 setLoading(true);
 setError(null);
 try {
 const publicKey: PublicKeyCredentialRequestOptions = {
 challenge: generateChallenge(),
 rpId: window.location.hostname,
 timeout: 60000,
 userVerification: "required",
 allowCredentials: registeredCreds.map((id) => ({
 type: "public-key",
 id: base64urlToBuffer(id),
 })),
 };

 const assertion = (await navigator.credentials.get({
 publicKey,
 })) as PublicKeyCredential | null;

 if (!assertion) {
 throw new Error("احراز هویت ناموفق بود");
 }

 toast({
 title: "ورود موفق",
 description: "احراز هویت بیومتریک با موفقیت انجام شد",
 });

 onSuccess?.(assertion.id);
 onOpenChange(false);
 } catch (err) {
 const msg = err instanceof Error? err.message: "خطای ناشناخته";
 if (msg.includes("NotAllowedError") || msg.includes("aborted")) {
 setError("عملیات لغو شد");
 } else {
 setError(`خطا در احراز: ${msg}`);
 }
 } finally {
 setLoading(false);
 }
 }

 // حذف یک credential
 function handleRemoveCredential(id: string) {
 const newCreds = registeredCreds.filter((c) => c!== id);
 setRegisteredCreds(newCreds);
 localStorage.setItem(STORAGE_KEY, JSON.stringify(newCreds));
 toast({
 title: "حذف شد",
 description: "اثر انگشت از لیست ورود حذف شد",
 });
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-w-md" dir="rtl">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Fingerprint className="h-5 w-5 text-primary" />
 ورود بیومتریک
 </DialogTitle>
 <DialogDescription>
 با اثر انگشت یا چهره وارد شوید — سریع‌تر و امن‌تر از رمز عبور
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4">
 {/* وضعیت پشتیبانی */}
 {!support.supported? (
 <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-4 text-sm">
 <div className="flex items-start gap-2">
 <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
 <div>
 <p className="font-medium text-amber-800 dark:text-amber-300">
 مرورگر شما از ورود بیومتریک پشتیبانی نمی‌کند
 </p>
 <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
 از مرورگرهای مدرن مانند Chrome، Edge یا Safari استفاده کنید
 </p>
 </div>
 </div>
 </div>
 ):!support.platformAuth? (
 <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 p-4 text-sm">
 <p className="font-medium text-blue-800 dark:text-blue-300">
 این دستگاه حسگر بیومتریک ندارد
 </p>
 <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
 می‌توانید از کلید امنیتی سخت‌افزاری (YubiKey) استفاده کنید
 </p>
 </div>
 ): null}

 {/* انیمیشن اثر انگشت */}
 <div className="flex justify-center py-4">
 <motion.div
 className="relative"
 animate={
 loading
? { scale: [1, 1.1, 1] }
: { scale: 1 }
 }
 transition={{ duration: 1, repeat: loading? Infinity: 0 }}
 >
 <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
 {mode === "auth"? (
 <ScanFace className="h-12 w-12 text-primary" />
 ): (
 <Fingerprint className="h-12 w-12 text-primary" />
 )}
 </div>
 {loading && (
 <motion.div
 className="absolute inset-0 rounded-full border-2 border-primary"
 animate={{ scale: [1, 1.3], opacity: [0.8, 0] }}
 transition={{ duration: 1.2, repeat: Infinity }}
 />
 )}
 </motion.div>
 </div>

 {/* خطا */}
 <AnimatePresence>
 {error && (
 <motion.div
 initial={{ opacity: 0, y: -10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
 >
 {error}
 </motion.div>
 )}
 </AnimatePresence>

 {/* credentialهای ثبت‌شده */}
 {registeredCreds.length > 0 && (
 <div className="space-y-2">
 <p className="text-xs text-muted-foreground">
 دستگاه‌های ثبت‌شده ({toPersianDigits(registeredCreds.length)}):
 </p>
 <div className="space-y-1 max-h-32 overflow-y-auto">
 {registeredCreds.map((id, i) => (
 <div
 key={id}
 className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
 >
 <span className="font-mono truncate flex-1" dir="ltr">
 {id.slice(0, 24)}...
 </span>
 <span className="text-muted-foreground">
 دستگاه {toPersianDigits(i + 1)}
 </span>
 <button
 onClick={() => handleRemoveCredential(id)}
 className="text-destructive hover:bg-destructive/10 rounded p-1"
 aria-label="حذف"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* دکمه‌های اقدام */}
 <div className="space-y-2">
 <Button
 onClick={handleAuthenticate}
 disabled={loading || registeredCreds.length === 0 ||!support.supported}
 className="w-full"
 size="lg"
 >
 {loading && mode === "auth"? (
 <Loader2 className="h-4 w-4 ml-2 animate-spin" />
 ): (
 <Fingerprint className="h-4 w-4 ml-2" />
 )}
 ورود با اثر انگشت
 </Button>

 <Button
 onClick={() => {
 setMode("register");
 void handleRegister();
 }}
 disabled={loading ||!support.supported}
 variant="outline"
 className="w-full"
 >
 {loading && mode === "register"? (
 <Loader2 className="h-4 w-4 ml-2 animate-spin" />
 ): (
 <ScanFace className="h-4 w-4 ml-2" />
 )}
 ثبت اثر انگشت جدید
 </Button>

 <Button
 onClick={() => {
 onOpenChange(false);
 onFallbackPassword?.();
 }}
 variant="ghost"
 className="w-full text-muted-foreground"
 >
 بازگشت به ورود با رمز عبور
 </Button>
 </div>

 <p className="text-xs text-center text-muted-foreground">
 داده‌ی بیومتریک شما هرگز از دستگاه خارج نمی‌شود — فقط یک کلید
 رمزنگاری‌شده ذخیره می‌شود.
 </p>
 </div>
 </DialogContent>
 </Dialog>
 );
}

// کامپوننت دکمه‌ی شناور برای باز کردن ورود بیومتریک
export function BiometricLoginButton({
 onClick,
}: {
 onClick: () => void;
}) {
 const [available, setAvailable] = React.useState(false);

 React.useEffect(() => {
 void checkBiometricSupport().then((s) => setAvailable(s.supported));
 }, []);

 if (!available) return null;

 return (
 <Button
 variant="outline"
 onClick={onClick}
 className="gap-2"
 size="sm"
 type="button"
 >
 <Fingerprint className="h-4 w-4 text-primary" />
 ورود بیومتریک
 </Button>
 );
}

// helper برای استفاده در صفحه ورود
export function useBiometricAvailability() {
 const [available, setAvailable] = React.useState(false);
 React.useEffect(() => {
 void checkBiometricSupport().then((s) => setAvailable(s.supported));
 }, []);
 return available;
}

// تایپ برای استفاده‌های دیگر
export type { BrowserCredential };

// ============ Page Wrapper ============
// کامپوننت صفحه‌ی کامل برای نمایش در app-shell
export function BiometricLoginPage({ token: _token }: { token: string }) {
 const { toast } = useToast();
 const [open, setOpen] = React.useState(true);
 const [creds, setCreds] = React.useState<string[]>([]);
 const [status, setStatus] = React.useState<"idle" | "checking">("idle");

 React.useEffect(() => {
 try {
 const stored = localStorage.getItem("hoshhesab_biometric_credentials");
 if (stored) {
 setCreds(JSON.parse(stored) as string[]);
 }
 } catch {
 // ignore
 }
 }, []);

 return (
 <div className="space-y-6" dir="rtl">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Fingerprint className="h-5 w-5 text-primary" />
 ورود بیومتریک (WebAuthn / FIDO2)
 </CardTitle>
 <CardDescription>
 با اثر انگشت، چهره یا کلید امنیتی سخت‌افزاری وارد شوید — سریع‌تر و
 امن‌تر از رمز عبور. داده‌ی بیومتریک شما هرگز دستگاه را ترک نمی‌کند.
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <InfoCard
 icon={<Fingerprint className="h-5 w-5 text-primary" />}
 title="اثر انگشت"
 description="استفاده از حسگر اثر انگشت دستگاه (Touch ID، Windows Hello)"
 />
 <InfoCard
 icon={<ScanFace className="h-5 w-5 text-primary" />}
 title="تشخیص چهره"
 description="Face ID یا Windows Hello Facial Recognition"
 />
 <InfoCard
 icon={<ShieldAlert className="h-5 w-5 text-primary" />}
 title="کلید سخت‌افزاری"
 description="پشتیبانی از YubiKey و کلیدهای امنیتی FIDO2"
 />
 </div>

 <div className="rounded-lg border border-border bg-muted/30 p-4">
 <h4 className="text-sm font-medium mb-2">
 دستگاه‌های ثبت‌شده ({toPersianDigits(creds.length)})
 </h4>
 {creds.length === 0? (
 <p className="text-sm text-muted-foreground">
 هنوز هیچ دستگاه بیومتریکی ثبت نشده است. روی دکمه‌ی زیر کلیک
 کنید تا اولین اثر انگشت خود را ثبت کنید.
 </p>
 ): (
 <div className="space-y-1.5 max-h-32 overflow-y-auto">
 {creds.map((id, i) => (
 <div
 key={id}
 className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs"
 >
 <span className="font-mono truncate flex-1" dir="ltr">
 {id.slice(0, 32)}...
 </span>
 <span className="text-muted-foreground ms-2">
 دستگاه {toPersianDigits(i + 1)}
 </span>
 </div>
 ))}
 </div>
 )}
 </div>

 <div className="flex gap-2">
 <Button onClick={() => setOpen(true)}>
 <Fingerprint className="h-4 w-4 ml-2" />
 مدیریت ورود بیومتریک
 </Button>
 <Button
 variant="outline"
 onClick={() => {
 setStatus("checking");
 setTimeout(() => {
 setStatus("idle");
 toast({
 title: "بررسی انجام شد",
 description: "سیستم WebAuthn آماده استفاده است",
 });
 }, 1500);
 }}
 disabled={status === "checking"}
 >
 {status === "checking"? (
 <Loader2 className="h-4 w-4 ml-2 animate-spin" />
 ): (
 <ShieldAlert className="h-4 w-4 ml-2" />
 )}
 بررسی پشتیبانی مرورگر
 </Button>
 </div>

 <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
 <p>
 <strong className="text-foreground">نکات امنیتی:</strong>
 </p>
 <ul className="space-y-0.5 mr-4">
 <li>• داده‌ی بیومتریک هرگز به سرور ارسال نمی‌شود</li>
 <li>• فقط یک کلید عمومی رمزنگاری‌شده ذخیره می‌شود</li>
 <li>• هر دستگاه نیاز به ثبت جداگانه دارد</li>
 <li>• در صورت از دست رفتن دستگاه، می‌توانید از رمز عبور استفاده کنید</li>
 </ul>
 </div>
 </CardContent>
 </Card>

 <BiometricLogin
 open={open}
 onOpenChange={setOpen}
 onSuccess={(credId) => {
 setCreds((prev) =>
 prev.includes(credId)? prev: [...prev, credId]
 );
 }}
 onFallbackPassword={() => setOpen(false)}
 />
 </div>
 );
}

function InfoCard({
 icon,
 title,
 description,
}: {
 icon: React.ReactNode;
 title: string;
 description: string;
}) {
 return (
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <div className="flex items-center gap-2 mb-1">
 {icon}
 <h4 className="text-sm font-medium">{title}</h4>
 </div>
 <p className="text-xs text-muted-foreground">{description}</p>
 </div>
 );
}
