"use client";

import * as React from "react";
import {
 AlertTriangle,
 Clock,
 Loader2,
 LogOut,
} from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import { toPersianDigits } from "@/lib/persian";

// ============ SessionTimeoutDialog ============
// کامپوننت هشدار timeout نشست
// در صورت فعال بودن، یک Dialog نمایش می‌دهد ۵ دقیقه قبل از انقضا
// "ادامه فعالیت" برای refresh، "خروج" برای logout

interface SessionTimeoutDialogProps {
 /** توکن کاربر */
 token: string;
 /** مدت نشست (میلی‌ثانیه) — از /api/platform/settings/session خوانده می‌شود */
 sessionTimeoutMs: number;
 /** callback هنگام timeout */
 onTimeout?: () => void;
}

export function SessionTimeoutDialog({
 token,
 sessionTimeoutMs,
 onTimeout,
}: SessionTimeoutDialogProps) {
 const {
 showWarning,
 remainingMinutes,
 dismissWarning,
 forceLogout,
 } = useSessionTimeout({
 token,
 sessionTimeoutMs,
 warningMinutesBefore: 5,
 onTimeout,
 });

 const [refreshing, setRefreshing] = React.useState(false);

 const handleRefresh = async () => {
 setRefreshing(true);
 try {
 await dismissWarning();
 } finally {
 setRefreshing(false);
 }
 };

 return (
 <Dialog open={showWarning} onOpenChange={() => {}}>
 <DialogContent
 className="sm:max-w-[440px]"
 onPointerDownOutside={(e) => e.preventDefault()}
 onEscapeKeyDown={(e) => e.preventDefault()}
 >
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <AlertTriangle className="size-5 text-amber-600" />
 نشست شما به‌زودی منقضی می‌شود
 </DialogTitle>
 <DialogDescription>
 به‌دلیل عدم فعالیت، نشست شما به‌زودی منقضی خواهد شد. برای ادامه کار،
 روی «ادامه فعالیت» کلیک کنید.
 </DialogDescription>
 </DialogHeader>

 <div className="flex items-center justify-center py-4">
 <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 rounded-lg">
 <Clock className="size-6 text-amber-600" />
 <div className="text-center">
 <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
 {toPersianDigits(remainingMinutes)} دقیقه
 </div>
 <div className="text-xs text-muted-foreground">
 تا پایان نشست
 </div>
 </div>
 </div>
 </div>

 <DialogFooter className="gap-2">
 <Button
 variant="outline"
 onClick={forceLogout}
 disabled={refreshing}
 >
 <LogOut className="size-4" />
 خروج
 </Button>
 <Button onClick={handleRefresh} disabled={refreshing}>
 {refreshing? (
 <Loader2 className="size-4 animate-spin" />
 ): (
 <Clock className="size-4" />
 )}
 ادامه فعالیت
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
