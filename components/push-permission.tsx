"use client";

import * as React from "react";
import { Bell, BellOff, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

interface PushPermissionProps {
 variant?: "button" | "card";
 className?: string;
}

/**
 * کامپوننت درخواست دسترسی Push Notification.
 * - دسترسی کاربر را می‌پرسد
 * - subscription را ایجاد می‌کند و به backend می‌فرستد
 * - وضعیت را در localStorage ذخیره می‌کند تا دوباره درخواست نکند
 */
export function PushPermission({ variant = "button", className }: PushPermissionProps) {
 const { toast } = useToast();
 const [state, setState] = React.useState<PermissionState>("default");
 const [loading, setLoading] = React.useState(false);

 // بررسی وضعیت اولیه
 React.useEffect(() => {
 if (typeof window === "undefined") return;
 if (!("Notification" in window) ||!("serviceWorker" in navigator) ||!("PushManager" in window)) {
 setState("unsupported");
 return;
 }
 setState(Notification.permission as PermissionState);
 }, []);

 const requestPermission = React.useCallback(async () => {
 if (state === "unsupported") return;
 setLoading(true);
 try {
 // ۱) درخواست دسترسی از کاربر
 const permission = await Notification.requestPermission();
 if (permission!== "granted") {
 setState(permission as PermissionState);
 toast({
 title: "دسترسی رد شد",
 description: "بدون اجازه‌ی شما، نوتیفیکیشن ارسال نمی‌شود.",
 variant: "destructive",
 });
 return;
 }
 setState("granted");

 // ۲) ثبت Service Worker (اگر قبلاً ثبت نشده)
 const reg = await navigator.serviceWorker.ready.catch(() => null);
 if (!reg) {
 toast({
 title: "خطا",
 description: "Service Worker در دسترس نیست.",
 variant: "destructive",
 });
 return;
 }

 // ۳) ساخت subscription با VAPID public key
 const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
 if (!vapidPublicKey) {
 toast({
 title: "تنظیمات ناقص",
 description: "VAPID public key پیکربندی نشده است. با مدیر تماس بگیرید.",
 variant: "destructive",
 });
 return;
 }

 const sub = await reg.pushManager.subscribe({
 userVisibleOnly: true,
 applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
 });

 // ۴) ارسال subscription به backend
 const token = localStorage.getItem("hoshhesab_user_token") || "";
 if (!token) {
 toast({
 title: "احراز هویت لازم است",
 description: "ابتدا وارد شوید تا نوتیفیکیشن فعال شود.",
 variant: "destructive",
 });
 return;
 }

 const subJson = sub.toJSON();
 const endpoint = subJson.endpoint;
 const p256dhKey = subJson.keys?.p256dh;
 const authKey = subJson.keys?.auth;
 if (!endpoint ||!p256dhKey ||!authKey) {
 throw new Error("subscription incomplete");
 }

 const res = await fetch("/api/marketing/push/subscribe", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({
 endpoint,
 p256dhKey,
 authKey,
 userAgent: navigator.userAgent,
 }),
 });
 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err?.error || "ثبت اشتراک ناموفق بود");
 }

 localStorage.setItem("hoshhesab_push_subscribed", "1");
 toast({
 title: "فعال شد",
 description: "نوتیفیکیشن‌های وب برای این دستگاه فعال شد.",
 });

 // ۵) نمایش یک notification نمونه برای تأیید
 try {
 new Notification("هوش", {
 body: "نوتیفیکیشن با موفقیت فعال شد.",
 icon: "/logo.svg",
 tag: "hoshhesab-welcome",
 });
 } catch {
 /* ignore */
 }
 } catch (err) {
 console.error("Push permission error:", err);
 toast({
 title: "خطا در فعال‌سازی",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [state, toast]);

 // اگر قبلاً اجازه داده شده، چیزی نشان نده
 if (state === "granted") {
 if (variant === "card") {
 return (
 <Card className={`p-4 ${className || ""}`}>
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
 <Check className="h-4 w-4" />
 </div>
 <div className="flex-1">
 <p className="text-sm font-medium text-foreground">نوتیفیکیشن فعال است</p>
 <p className="text-xs text-muted-foreground">
 شما اعلان‌های مهم را دریافت می‌کنید.
 </p>
 </div>
 <Badge variant="outline" className="text-emerald-600 border-emerald-500/30">
 روشن
 </Badge>
 </div>
 </Card>
 );
 }
 return null;
 }

 if (state === "unsupported") {
 if (variant === "card") {
 return (
 <Card className={`p-4 ${className || ""}`}>
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
 <BellOff className="h-4 w-4" />
 </div>
 <div className="flex-1">
 <p className="text-sm font-medium text-foreground">پشتیبانی نمی‌شود</p>
 <p className="text-xs text-muted-foreground">
 مرورگر شما از نوتیفیکیشن پشتیبانی نمی‌کند.
 </p>
 </div>
 </div>
 </Card>
 );
 }
 return null;
 }

 if (state === "denied") {
 if (variant === "card") {
 return (
 <Card className={`p-4 ${className || ""}`}>
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
 <X className="h-4 w-4" />
 </div>
 <div className="flex-1">
 <p className="text-sm font-medium text-foreground">دسترسی مسدود شده</p>
 <p className="text-xs text-muted-foreground">
 برای فعال‌سازی، دسترسی نوتیفیکیشن را در تنظیمات مرورگر باز کنید.
 </p>
 </div>
 </div>
 </Card>
 );
 }
 return null;
 }

 // حالت default — دکمه/کارت درخواست
 if (variant === "card") {
 return (
 <Card className={`p-4 ${className || ""}`}>
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
 <Bell className="h-4 w-4" />
 </div>
 <div className="flex-1">
 <p className="text-sm font-medium text-foreground">فعال‌سازی نوتیفیکیشن</p>
 <p className="text-xs text-muted-foreground">
 اعلان‌های مهم (فاکتور جدید، سررسید چک، هشدارها) را دریافت کنید.
 </p>
 </div>
 <Button onClick={requestPermission} disabled={loading} size="sm" className="gap-1.5">
 {loading? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Bell className="h-3.5 w-3.5" />}
 فعال‌سازی
 </Button>
 </div>
 </Card>
 );
 }

 return (
 <Button
 onClick={requestPermission}
 disabled={loading || state!== "default"}
 variant="outline"
 size="sm"
 className={`gap-1.5 ${className || ""}`}
 >
 {loading? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <Bell className="h-3.5 w-3.5" />}
 فعال‌سازی نوتیفیکیشن
 </Button>
 );
}

// ============ helpers ============

// تبدیل VAPID public key (base64url) به Uint8Array برای PushManager.subscribe
function urlBase64ToUint8Array(base64String: string): Uint8Array {
 const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
 const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
 const rawData = atob(base64);
 const output = new Uint8Array(rawData.length);
 for (let i = 0; i < rawData.length; ++i) {
 output[i] = rawData.charCodeAt(i);
 }
 return output;
}

export default PushPermission;
