"use client";

/**
 * CollaborationIndicator — نشانگر ویرایش همزمان
 *
 * - نمایش کاربری که در حال ویرایش سند است
 * - badge «در حال ویرایش توسط [name]» با آواتار
 * - شمارش معکوس تا انقضای قفل
 * - دکمه «درخواست دسترسی» اگر قفل توسط کاربر دیگری باشد
 * - polling خودکار هر ۱۵ ثانیه برای به‌روزرسانی وضعیت
 */

import * as React from "react";
import {
 Lock,
 Unlock,
 Clock,
 User,
 AlertCircle,
 Loader2,
 KeyRound,
 X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

interface LockInfo {
 locked: boolean;
 lockId?: string;
 lockedBy?: {
 userId: string;
 name: string;
 email?: string | null;
 };
 lockedAt?: string;
 expiresAt?: string;
 remainingMs?: number;
 renewed?: boolean;
 expired?: boolean;
}

interface CollaborationIndicatorProps {
 entityType: string;
 entityId: string;
 token: string;
 currentUserId?: string;
 /** وقتی کاربر قفل می‌گیرد، این callback فراخوانی می‌شود */
 onLockAcquired?: () => void;
 /** وقتی قفل توسط کاربر دیگری گرفته می‌شود */
 onLockDenied?: (info: LockInfo) => void;
 /** فاصله polling بر حسب میلی‌ثانیه (پیش‌فرض ۱۵ ثانیه) */
 pollInterval?: number;
 className?: string;
}

function formatRemaining(ms: number): string {
 const totalSec = Math.max(0, Math.floor(ms / 1000));
 const minutes = Math.floor(totalSec / 60);
 const seconds = totalSec % 60;
 return `${toPersianDigits(minutes)}:${toPersianDigits(String(seconds).padStart(2, "0"))}`;
}

function getInitials(name: string): string {
 if (!name) return "؟";
 const parts = name.trim().split(/\s+/);
 if (parts.length >= 2) {
 return (parts[0][0] + parts[1][0]).toUpperCase();
 }
 return name.slice(0, 2).toUpperCase();
}

export function CollaborationIndicator({
 entityType,
 entityId,
 token,
 currentUserId,
 onLockAcquired,
 onLockDenied,
 pollInterval = 15000,
 className,
}: CollaborationIndicatorProps) {
 const { toast } = useToast();
 const [lockInfo, setLockInfo] = React.useState<LockInfo | null>(null);
 const [loading, setLoading] = React.useState(false);
 const [actionLoading, setActionLoading] = React.useState(false);
 const [remainingMs, setRemainingMs] = React.useState<number>(0);

 const fetchLock = React.useCallback(async () => {
 if (!entityType ||!entityId ||!token) return;
 setLoading(true);
 try {
 const res = await fetch(
 `/api/collaboration/lock?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`,
 { headers: { Authorization: `Bearer ${token}` } }
 );
 const json = await res.json();
 if (json.success) {
 const next: LockInfo = json.data;
 setLockInfo(next);
 if (next.locked && next.remainingMs) {
 setRemainingMs(next.remainingMs);
 }
 }
 } catch {
 // silent
 } finally {
 setLoading(false);
 }
 }, [entityType, entityId, token]);

 // polling اولیه و دوره‌ای
 React.useEffect(() => {
 void fetchLock();
 const interval = setInterval(fetchLock, pollInterval);
 return () => clearInterval(interval);
 }, [fetchLock, pollInterval]);

 // شمارش معکوس
 React.useEffect(() => {
 if (!lockInfo?.locked ||!lockInfo.expiresAt) {
 setRemainingMs(0);
 return;
 }
 const update = () => {
 const remaining = new Date(lockInfo.expiresAt!).getTime() - Date.now();
 setRemainingMs(Math.max(0, remaining));
 if (remaining <= 0) {
 // قفل منقضی شده — دوباره fetch کن
 void fetchLock();
 }
 };
 update();
 const id = setInterval(update, 1000);
 return () => clearInterval(id);
 }, [lockInfo, fetchLock]);

 const handleAcquireLock = async () => {
 setActionLoading(true);
 try {
 const res = await fetch("/api/collaboration/lock", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ entityType, entityId }),
 });
 const json = await res.json();
 if (json.success) {
 setLockInfo({ locked: true,...json.data, remainingMs: 5 * 60 * 1000 });
 onLockAcquired?.();
 toast({ title: "قفل acquisition شد", description: "شما اکنون در حال ویرایش این سند هستید" });
 } else if (res.status === 409) {
 // قفل توسط کاربر دیگری
 setLockInfo({
 locked: true,
 lockedBy: json.lockedBy,
 expiresAt: json.expiresAt,
 });
 onLockDenied?.({ locked: true, lockedBy: json.lockedBy, expiresAt: json.expiresAt });
 toast({
 title: "سند قفل است",
 description: `${json.lockedBy?.name || "کاربر دیگر"} در حال ویرایش است`,
 variant: "destructive",
 });
 } else {
 toast({
 title: "خطا",
 description: json.error || "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } finally {
 setActionLoading(false);
 }
 };

 const handleReleaseLock = async () => {
 setActionLoading(true);
 try {
 await fetch(
 `/api/collaboration/lock?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`,
 {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 }
 );
 setLockInfo({ locked: false });
 toast({ title: "قفل رها شد" });
 } finally {
 setActionLoading(false);
 }
 };

 // در حالت بدون قفل
 if (!lockInfo || (!lockInfo.locked &&!loading)) {
 return (
 <div className={cn("flex items-center gap-2", className)}>
 <Button
 variant="outline"
 size="sm"
 onClick={handleAcquireLock}
 disabled={actionLoading || loading}
 >
 {actionLoading? (
 <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin" />
 ): (
 <Unlock className="h-3.5 w-3.5 ml-1" />
 )}
 شروع ویرایش
 </Button>
 {loading && (
 <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
 )}
 </div>
 );
 }

 // قفل توسط خود کاربر فعلی
 if (lockInfo.lockedBy?.userId === currentUserId) {
 return (
 <Card className={cn("bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", className)}>
 <CardContent className="p-3 flex items-center gap-3 flex-wrap">
 <div className="flex items-center gap-2">
 <div className="h-7 w-7 rounded-full bg-emerald-500 text-white flex items-center justify-center">
 <Lock className="h-3.5 w-3.5" />
 </div>
 <div>
 <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
 در حال ویرایش توسط شما
 </p>
 <p className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
 <Clock className="h-3 w-3" />
 زمان باقی‌مانده: {formatRemaining(remainingMs)}
 </p>
 </div>
 </div>
 <Badge
 variant="secondary"
 className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 mr-auto font-mono"
 >
 {toPersianDigits(Math.ceil(remainingMs / 1000))} ثانیه
 </Badge>
 <Button
 variant="outline"
 size="sm"
 onClick={handleReleaseLock}
 disabled={actionLoading}
 className="h-7 text-xs"
 >
 {actionLoading? (
 <Loader2 className="h-3 w-3 ml-1 animate-spin" />
 ): (
 <X className="h-3 w-3 ml-1" />
 )}
 رها کردن
 </Button>
 </CardContent>
 </Card>
 );
 }

 // قفل توسط کاربر دیگری
 return (
 <Card className={cn("bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", className)}>
 <CardContent className="p-3 flex items-center gap-3 flex-wrap">
 <Avatar className="h-7 w-7 border border-amber-300 dark:border-amber-700">
 <AvatarFallback className="bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
 {getInitials(lockInfo.lockedBy?.name || "")}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1">
 <User className="h-3 w-3" />
 در حال ویرایش توسط {lockInfo.lockedBy?.name || "کاربر دیگر"}
 </p>
 {lockInfo.expiresAt && (
 <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
 <Clock className="h-3 w-3" />
 انقضای قفل: {formatRemaining(remainingMs)}
 </p>
 )}
 </div>
 <Badge
 variant="secondary"
 className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
 >
 <AlertCircle className="h-3 w-3 ml-1" />
 فقط‌خواندنی
 </Badge>
 <Button
 variant="outline"
 size="sm"
 onClick={handleAcquireLock}
 disabled={actionLoading || remainingMs > 0}
 className="h-7 text-xs"
 title={
 remainingMs > 0
? `تا انقضای قفل ${formatRemaining(remainingMs)} باقی مانده`
: "درخواست قفل"
 }
 >
 {actionLoading? (
 <Loader2 className="h-3 w-3 ml-1 animate-spin" />
 ): (
 <KeyRound className="h-3 w-3 ml-1" />
 )}
 درخواست دسترسی
 </Button>
 </CardContent>
 </Card>
 );
}
