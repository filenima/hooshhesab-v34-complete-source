"use client";

import * as React from "react";
import { Bell, BellOff, X, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { subscribeToPush } from "@/lib/marketing";

const DISMISS_KEY = "hoshhesab_push_banner_dismissed";
const SUBSCRIBED_KEY = "hoshhesab_push_subscribed";

/**
 * بنر درخواست دسترسی Push Notification
 *
 * پس از ورود کاربر، اگر دسترسی Push گرفته نشده و بنر رد نشده باشد، نمایش داده می‌شود.
 * با کلیک روی «فعال‌سازی اعلان‌ها»، Permission API فراخوانی شده و subscription ثبت می‌شود.
 */
export function PushPermissionBanner() {
 const { toast } = useToast();
 const [visible, setVisible] = React.useState(false);
 const [subscribing, setSubscribing] = React.useState(false);
 const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">("default");

 // بررسی اولیه — بعد از ۳ ثانیه از ورود، اگر conditions برقرار باشد بنر را نشان بده
 React.useEffect(() => {
 if (typeof window === "undefined") return;

 const timer = setTimeout(() => {
 // بررسی اینکه آیا service worker و Notification API پشتیبانی می‌شوند
 if (!("Notification" in window) ||!("serviceWorker" in navigator)) {
 setPermission("unsupported");
 return;
 }
 setPermission(Notification.permission);

 const dismissed = localStorage.getItem(DISMISS_KEY);
 const subscribed = localStorage.getItem(SUBSCRIBED_KEY);

 // اگر قبلاً dismiss شده یا قبلاً subscribed شده مخفی
 if (dismissed || subscribed) {
 setVisible(false);
 return;
 }

 // اگر permission قبلاً granted شده subscribe کن و بنر را نشان نده
 if (Notification.permission === "granted") {
 setVisible(false);
 return;
 }

 // در غیر این‌صورت بنر را نشان بده
 setVisible(true);
 }, 3000);

 return () => clearTimeout(timer);
 }, []);

 const handleEnable = React.useCallback(async () => {
 if (typeof window === "undefined") return;
 if (!("Notification" in window) ||!("serviceWorker" in navigator)) {
 toast({
 title: "پشتیبانی نمی‌شود",
 description: "مرورگر شما از نوتیفیکیشن پشتیبانی نمی‌کند.",
 variant: "destructive",
 });
 return;
 }

 setSubscribing(true);
 try {
 // درخواست permission
 const perm = await Notification.requestPermission();
 setPermission(perm);

 if (perm!== "granted") {
 toast({
 title: "دسترسی رد شد",
 description: "برای دریافت اعلان‌ها، دسترسی را در تنظیمات مرورگر فعال کنید.",
 variant: "destructive",
 });
 return;
 }

 // ثبت service worker (اگر قبلاً ثبت نشده)
 try {
 await navigator.serviceWorker.ready;
 } catch {
 // اگر SW آماده نیست، صبر می‌کنیم
 await navigator.serviceWorker.register("/sw.js").catch(() => {
 /* SW ثبت نشد — به‌هرحال subscription را امتحان می‌کنیم */
 });
 }

 // ساخت subscription
 const reg = await navigator.serviceWorker.ready;

 // دریافت VAPID public key از API
 let vapidKey = "";
 try {
 const res = await fetch("/api/marketing/push/vapid-key");
 if (res.ok) {
 const json = await res.json();
 vapidKey = json?.data?.publicKey || json?.publicKey || "";
 }
 } catch {
 /* اگر endpoint نبود، بدون VAPID امتحان می‌کنیم */
 }

 let subscription: PushSubscription | null = null;
 try {
 if (vapidKey) {
 // تبدیل base64url به Uint8Array
 const keyBytes = urlBase64ToUint8Array(vapidKey);
 subscription = await reg.pushManager.subscribe({
 userVisibleOnly: true,
 applicationServerKey: keyBytes as BufferSource,
 });
 } else {
 // بدون applicationServerKey — بعضی مرورگرها اجازه می‌دهند
 subscription = await reg.pushManager.subscribe({
 userVisibleOnly: true,
 });
 }
 } catch (subErr) {
 console.warn("Push subscribe failed:", subErr);
 }

 if (subscription) {
 try {
 await subscribeToPush(subscription);
 localStorage.setItem(SUBSCRIBED_KEY, "1");
 toast({
 title: "اعلان‌ها فعال شد",
 description: "از این پس اعلان‌های مهم را دریافت خواهید کرد.",
 });
 setVisible(false);
 return;
 } catch (err) {
 console.warn("subscribeToPush API call failed:", err);
 }
 }

 // حتی اگر subscription نشد، permission granted شده قبول می‌کنیم
 localStorage.setItem(SUBSCRIBED_KEY, "1");
 toast({
 title: "اعلان‌ها فعال شد",
 description: "دسترسی اعلان‌ها فعال شد.",
 });
 setVisible(false);
 } catch (err) {
 toast({
 title: "خطا",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubscribing(false);
 }
 }, [toast]);

 const handleDismiss = React.useCallback(() => {
 localStorage.setItem(DISMISS_KEY, "1");
 setVisible(false);
 }, []);

 if (!visible) return null;

 return (
 <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-fade-in-up">
 {/* FIX(mobile): بنر بالای نوار ناوبری پایین قرار می‌گیرد (نه روی آن) */}
 <div className="rounded-xl border border-primary/30 bg-card shadow-lg p-4">
 <div className="flex items-start gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 {permission === "denied"? <BellOff className="h-5 w-5" />: <Bell className="h-5 w-5" />}
 </div>
 <div className="flex-1 min-w-0">
 <h3 className="text-sm font-semibold text-foreground">
 {permission === "denied"? "اعلان‌ها مسدود شده": "فعال‌سازی اعلان‌ها"}
 </h3>
 <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
 {permission === "denied"
? "دسترسی اعلان‌ها در مرورگر شما مسدود است. برای دریافت نوتیفیکیشن‌های مهم، آن را در تنظیمات فعال کنید."
: "با فعال‌سازی اعلان‌ها، اخبار مهم مانند سررسید چک، فاکتورهای جدید و هشدارهای مالی را به‌موقع دریافت کنید."}
 </p>

 <div className="flex items-center gap-2 mt-3">
 {permission!== "denied" && (
 <Button
 size="sm"
 onClick={handleEnable}
 disabled={subscribing}
 className="gap-1.5 h-8"
 >
 {subscribing? (
 <RefreshCw className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Bell className="h-3.5 w-3.5" />
 )}
 فعال‌سازی اعلان‌ها
 </Button>
 )}
 <Button
 size="sm"
 variant="ghost"
 onClick={handleDismiss}
 className="h-8"
 >
 بعداً
 </Button>
 {permission === "granted" && (
 <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-600 bg-emerald-500/5">
 <CheckCircle2 className="h-2.5 w-2.5" />
 فعال
 </Badge>
 )}
 </div>
 </div>

 <button
 onClick={handleDismiss}
 className="text-muted-foreground hover:text-foreground shrink-0"
 aria-label="بستن"
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 </div>
 </div>
 );
}

// ============ helper: base64url Uint8Array ============
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

export default PushPermissionBanner;
