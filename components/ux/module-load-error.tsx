"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ModuleLoadError — جایگزین «صفحه سفید» هنگام شکست بارگذاری chunk ماژول
 *
 * قبلاً fallbackها `() => null` بودند اگر لود یک ماژول شکست می‌خورد
 * (مثلاً هنگام recompile سرور یا قطعی لحظه‌ای)، صفحه کاملاً سفید می‌شد
 * بدون هیچ توضیحی. این کامپوننت پیام شفاف + دکمه تلاش مجدد می‌دهد.
 *
 * FIX (بازیابی خودکار): شکست chunk تقریباً همیشه نشانه‌ی ری‌استارت/به‌روزرسانی
 * لحظه‌ای سرور است. قبلاً کاربر باید «تلاش مجدد» را دستی می‌زد و اگر سرور
 * هنوز بالا نیامده بود، صفحه خطای مرورگر می‌دید و باید F5 می‌زد — حلقه‌ی
 * خسته‌کننده. حالا:
 *  ۱) خودکار: یک‌بار (سراسری — نه به ازای هر ماژول) منتظر می‌مانیم سرور
 *     پاسخ‌گو شود (بررسی سبک HEAD، حداکثر ~۹۰ ثانیه) و بعد reload می‌کنیم.
 *  ۲) دستی: همان فرایند با بازخورد «در حال اتصال...».
 *  ۳) اگر سرور پاسخ نداد، دکمه‌ی دستی فعال می‌ماند و کاربر هر وقت خواست
 *     دوباره تلاش می‌کند (بدون reload نابهنگام روی صفحه‌ی خطای مرورگر).
 */

/** فلگ سراسری — اگر چند ماژول همزمان شکست بخورند فقط یک recovery فعال شود */
const RECOVERY_FLAG = "__hoshhesab_module_recovery__";
/** سقف reload خودکار در هر نشست — جلوگیری از حلقه‌ی بی‌نهایت (مثلاً HTML کش‌شده قدیمی) */
const RECOVERY_COUNT_KEY = "__hoshhesab_module_recovery_count__";
const MAX_AUTO_RELOADS = 3;

function recoveryCount(): number {
 try {
 return Number(sessionStorage.getItem(RECOVERY_COUNT_KEY) || "0");
 } catch {
 return 0;
 }
}

function bumpRecoveryCount() {
 try {
 sessionStorage.setItem(RECOVERY_COUNT_KEY, String(recoveryCount() + 1));
 } catch {
 /* ignore */
 }
}

/** بررسی سلامت سرور — یک درخواست سبک HEAD به فایل استاتیک */
async function serverHealthy(timeoutMs = 4000): Promise<boolean> {
 try {
 const ctrl = new AbortController();
 const t = setTimeout(() => ctrl.abort(), timeoutMs);
 try {
 const res = await fetch("/manifest.webmanifest", {
 method: "HEAD",
 cache: "no-store",
 signal: ctrl.signal,
 });
 return res.ok;
 } finally {
 clearTimeout(t);
 }
 } catch {
 return false;
 }
}

/** منتظر ماندن برای سلامت سرور — هر ۳ ثانیه یک بررسی، حداکثر maxWaitMs */
async function waitForServer(maxWaitMs = 90_000): Promise<boolean> {
 const start = Date.now();
 while (Date.now() - start < maxWaitMs) {
 if (await serverHealthy()) return true;
 await new Promise((r) => setTimeout(r, 3000));
 }
 return await serverHealthy();
}

export function ModuleLoadError({ moduleName }: { moduleName?: string }) {
 const [retrying, setRetrying] = React.useState(false);
 const [serverDown, setServerDown] = React.useState(false);
 const [autoNotice, setAutoNotice] = React.useState(false);

 const recover = React.useCallback(async () => {
 setRetrying(true);
 setServerDown(false);
 // اگر سرور همین حالا سالم است، مستقیم reload کن
 if (await serverHealthy()) {
 window.location.reload();
 return;
 }
 // سرور در دسترس نیست — منتظر بمان بالا بیاید (مثلاً ری‌استارت/استقرار)
 setServerDown(true);
 const ok = await waitForServer();
 if (ok) {
 window.location.reload();
 } else {
 // سرور بعد از ~۹۰ ثانیه هم پاسخ نداد — دکمه‌ی دستی را فعال بگذار
 setRetrying(false);
 }
 }, []);

 // بازیابی خودکار یک‌بار — سراسری تا چند ماژول همزمان reload تکراری نزنند
 // + سقف نشست‌محور برای جلوگیری از حلقه‌ی reload بی‌نهایت
 React.useEffect(() => {
 try {
 if ((window as unknown as Record<string, unknown>)[RECOVERY_FLAG]) return;
 if (recoveryCount() >= MAX_AUTO_RELOADS) return;
 (window as unknown as Record<string, unknown>)[RECOVERY_FLAG] = true;
 } catch {
 return;
 }
 setAutoNotice(true);
 const t = setTimeout(() => {
 bumpRecoveryCount();
 void recover();
 }, 2500);
 return () => clearTimeout(t);
 }, [recover]);

 return (
 <div
 className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-8 text-center"
 role="alert"
 >
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
 {serverDown? (
 <WifiOff className="h-6 w-6 text-amber-600" />
 ): (
 <AlertTriangle className="h-6 w-6 text-amber-600" />
 )}
 </div>
 <div>
 <p className="text-sm font-bold text-foreground">
 بارگذاری {moduleName? `ماژول «${moduleName}»`: "این بخش"} ناموفق بود
 </p>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
 {serverDown
 ? "سرور در حال راه‌اندازی مجدد است — پس از بازگشت، صفحه به‌صورت خودکار تازه‌سازی می‌شود."
 : "ارتباط با سرور برای لحظه‌ای قطع شد. معمولاً به‌صورت خودکار برطرف می‌شود."}
 {autoNotice && !retrying? " (تلاش خودکار چند ثانیه دیگر...)" : ""}
 </p>
 </div>
 <div className="flex flex-wrap items-center justify-center gap-2">
 <Button size="sm" variant="outline" onClick={() => void recover()} disabled={retrying}>
 <RefreshCw className={`h-3.5 w-3.5 ${retrying? "animate-spin": ""}`} />
 {retrying
 ? serverDown
 ? "در انتظار سرور..."
 : "در حال تلاش..."
 : "تلاش مجدد"}
 </Button>
 {serverDown && !retrying && (
 <Button
 size="sm"
 variant="ghost"
 onClick={() => {
 void (async () => {
 if (await serverHealthy()) window.location.reload();
 })();
 }}
 className="gap-1.5"
 >
 <Wifi className="h-3.5 w-3.5" />
 بررسی اتصال
 </Button>
 )}
 </div>
 </div>
 );
}

/** fallback آماده برای React.lazy / dynamic import ها */
export function moduleLoadFallback(moduleName?: string) {
 return () => <ModuleLoadError moduleName={moduleName} />;
}
