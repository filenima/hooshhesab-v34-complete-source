"use client";

/**
 * OfflineBanner — بنر هشدار وضعیت آفلاین
 *
 * - وقتی navigator.onLine === false، بنر آمبر نمایش داده می‌شود:
 *   «شما آفلاین هستید — داده‌های ذخیره‌شده نمایش داده می‌شود» + «همگام‌سازی خودکار پس از اتصال»
 * - FIX(v8/H4): حالت جدید «سرور در دسترس نیست» — مرورگر آنلاین است اما SW
 *   پاسخ کش‌شده (هدر X-Hoosh-Offline) سرو می‌کند؛ بنر متمایز نمایش داده می‌شود
 *   (رویداد hoosh:offline-cache در lib/auth-fetch.ts dispatch می‌شود)
 * - برگشت آنلاین: بنر سبز موقت «آنلاین شد — در حال همگام‌سازی...» (۴ ثانیه)
 * - شمارش اکشن‌های در صف (از صف واقعی SW — FIX v8/H2) + دکمه همگام‌سازی دستی
 * - انیمیشن slide با framer-motion
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw, CheckCircle2, Loader2, CloudUpload, Wifi, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

// FIX: «none» حالت واقعی است (آنلاین، بدون تغییر در صف) — در union نوع اضافه شد
// تا mode/visible/styles هم‌راستا با منطق اجرا تایپ‌شوند.
// FIX(v8/H4): حالت server-down — مرورگر آنلاین، سرور در دسترس نیست (داده کش‌شده)
type BannerMode = "offline" | "just-online" | "pending" | "server-down" | "none";

export function OfflineBanner({ token }: { token: string | null }) {
  const { isOnline, serverOffline, pendingCount, syncing, lastSyncResult, syncNow } =
    useOfflineSync(token);
  const { toast } = useToast();

  // حالت «تازه آنلاین شد» — بنر سبک سبک برای چند ثانیه
  const [justOnline, setJustOnline] = React.useState(false);
  const prevOnlineRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (prev === false && isOnline) {
      setJustOnline(true);
      const t = setTimeout(() => setJustOnline(false), 4000);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  const mode: BannerMode = !isOnline
    ? "offline"
    : serverOffline
    ? "server-down"
    : justOnline
    ? "just-online"
    : pendingCount > 0
    ? "pending"
    : "none";

  const visible = mode !== "none";

  const handleSync = async () => {
    await syncNow();
    if (lastSyncResult) {
      if (lastSyncResult.failed === 0) {
        toast({
          title: "همگام‌سازی کامل شد",
          description: `${toPersianDigits(lastSyncResult.sent)} اکشن با موفقیت اجرا شد.`,
        });
      } else {
        toast({
          title: "همگام‌سازی با خطا",
          description: `${toPersianDigits(lastSyncResult.sent)} موفق، ${toPersianDigits(lastSyncResult.failed)} ناموفق.`,
          variant: "destructive",
        });
      }
    }
  };

  const modeStyles: Record<Exclude<BannerMode, "none">, { box: string; icon: string; iconEl: React.ReactNode; title: string; sub: string }> = {
    offline: {
      box: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/60",
      icon: "text-amber-600 dark:text-amber-400",
      iconEl: <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />,
      title: "شما آفلاین هستید — داده‌های ذخیره‌شده نمایش داده می‌شود",
      sub: "همگام‌سازی خودکار پس از اتصال انجام می‌شود",
    },
    "just-online": {
      box: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/60",
      icon: "text-emerald-600 dark:text-emerald-400",
      iconEl: <Wifi className="h-4 w-4 shrink-0" aria-hidden="true" />,
      title: "آنلاین شد — در حال همگام‌سازی...",
      sub: "تغییرات آفلاین به سرور ارسال می‌شوند",
    },
    pending: {
      box: "bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-900/60",
      icon: "text-sky-600 dark:text-sky-400",
      iconEl: syncing ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" />
      ),
      title: syncing
        ? "در حال همگام‌سازی تغییرات..."
        : `${toPersianDigits(pendingCount)} تغییر در انتظار همگام‌سازی`,
      sub: "تغییرات آفلاین شما ذخیره شده و آماده ارسال به سرور هستند",
    },
    // FIX(v8/H4): مرورگر آنلاین است اما سرور پاسخ نمی‌دهد — SW داده کش‌شده سرو کرده
    "server-down": {
      box: "bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/60",
      icon: "text-orange-600 dark:text-orange-400",
      iconEl: <ServerCrash className="h-4 w-4 shrink-0" aria-hidden="true" />,
      title: "سرور در دسترس نیست — داده‌های ذخیره‌شده نمایش داده می‌شود",
      sub: "درخواست‌های شما پس از بازگشت سرور خودکار ارسال می‌شوند",
    },
  };
  const none = {
    box: "",
    icon: "",
    iconEl: null,
    title: "",
    sub: "",
  };
  const styles = mode === "none" ? none : modeStyles[mode];
  const isOffline = mode === "offline";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`sticky top-0 z-40 border-b ${styles.box}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={styles.icon}>{styles.iconEl}</span>
              <div className="min-w-0">
                <p
                  className={`text-xs font-medium truncate ${
                    isOffline
                      ? "text-amber-800 dark:text-amber-200"
                      : mode === "just-online"
                      ? "text-emerald-800 dark:text-emerald-200"
                      : mode === "server-down"
                      ? "text-orange-800 dark:text-orange-200"
                      : "text-sky-800 dark:text-sky-200"
                  }`}
                >
                  {styles.title}
                </p>
                <p
                  className={`text-[10px] truncate hidden sm:block ${
                    isOffline
                      ? "text-amber-700/80 dark:text-amber-300/80"
                      : mode === "just-online"
                      ? "text-emerald-700/80 dark:text-emerald-300/80"
                      : mode === "server-down"
                      ? "text-orange-700/80 dark:text-orange-300/80"
                      : "text-sky-700/80 dark:text-sky-300/80"
                  }`}
                >
                  {styles.sub}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {pendingCount > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isOffline
                      ? "bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                      : "bg-sky-200 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200"
                  }`}
                >
                  {toPersianDigits(pendingCount)}
                </span>
              )}
              {!isOffline && mode !== "just-online" && pendingCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing}
                  className="h-7 gap-1.5 text-[11px] border-sky-300 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-900/40"
                >
                  {syncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  همگام‌سازی
                </Button>
              )}
              {isOffline && pendingCount > 0 && (
                <div className="hidden sm:flex items-center gap-1 text-[10px] text-amber-700/80 dark:text-amber-300/80">
                  <CheckCircle2 className="h-3 w-3" />
                  ذخیره محلی شد
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OfflineBanner;
