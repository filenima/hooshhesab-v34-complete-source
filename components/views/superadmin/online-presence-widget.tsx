"use client";

import * as React from "react";
import {
 Activity,
 Users as UsersIcon,
 Building2,
 RefreshCw,
 Loader2,
 Circle,
 Smartphone,
 Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

interface PresenceUser {
 sessionId: string;
 userId: string;
 name: string;
 email: string;
 role: string;
 tenantId: string;
 tenantName: string | null;
 tenantPlan: string | null;
 tenantStatus: string | null;
 device: string | null;
 ipAddress: string | null;
 lastSeen: string;
 sessionAge: number;
}

interface PresenceData {
 onlineUsers: number;
 onlineTenants: number;
 todaySignups: number;
 users: PresenceUser[];
}

function apiFetch(path: string, token: string) {
 return fetch(path, {
 headers: { Authorization: `Bearer ${token}` },
 });
}

function timeAgo(iso: string): string {
 const diff = Date.now() - new Date(iso).getTime();
 const sec = Math.floor(diff / 1000);
 if (sec < 60) return `${toPersianDigits(sec)} ثانیه پیش`;
 const min = Math.floor(sec / 60);
 if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
 return toJalali(new Date(iso));
}

function deviceIcon(device: string | null) {
 if (!device) return <Monitor className="h-3 w-3" />;
 const d = device.toLowerCase();
 if (d.includes("mobile") || d.includes("android") || d.includes("iphone")) {
 return <Smartphone className="h-3 w-3" />;
 }
 return <Monitor className="h-3 w-3" />;
}

export function OnlinePresenceWidget({ token }: { token: string }) {
 const { toast } = useToast();
 const [data, setData] = React.useState<PresenceData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [expanded, setExpanded] = React.useState(false);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await apiFetch("/api/platform/presence", token);
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 setData(json.data);
 } catch (e) {
 // خاموش — فقط نمایش خطا در toast
 toast({
 title: "خطا در دریافت کاربران آنلاین",
 description: e instanceof Error? e.message: "خطا",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 // Polling هر ۶۰ ثانیه
 const interval = setInterval(() => void load(), 60_000);
 return () => clearInterval(interval);
 }, [load]);

 return (
 <div className="rounded-xl border border-emerald-300/40 bg-gradient-to-br from-emerald-50/50 to-background dark:border-emerald-700/30 dark:from-emerald-900/10 dark:to-background p-4">
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-2">
 <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
 <Activity className="h-4 w-4" />
 <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
 </span>
 </div>
 <div>
 <p className="text-sm font-bold">کاربران آنلاین</p>
 <p className="text-[10px] text-muted-foreground">آخرین فعالیت در ۵ دقیقه‌ی اخیر</p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs"
 onClick={load}
 disabled={loading}
 >
 {loading? <Loader2 className="h-3 w-3 animate-spin" />: <RefreshCw className="h-3 w-3" />}
 </Button>
 </div>

 <div className="grid grid-cols-3 gap-2 mb-3">
 <div className="text-center rounded-lg bg-background border border-border p-2">
 <p className="text-lg font-bold tnum text-emerald-600 dark:text-emerald-400">
 {data? toPersianDigits(data.onlineUsers): "—"}
 </p>
 <p className="text-[9px] text-muted-foreground">کاربر آنلاین</p>
 </div>
 <div className="text-center rounded-lg bg-background border border-border p-2">
 <p className="text-lg font-bold tnum text-primary">
 {data? toPersianDigits(data.onlineTenants): "—"}
 </p>
 <p className="text-[9px] text-muted-foreground">سازمان فعال</p>
 </div>
 <div className="text-center rounded-lg bg-background border border-border p-2">
 <p className="text-lg font-bold tnum text-amber-600 dark:text-amber-400">
 {data? toPersianDigits(data.todaySignups): "—"}
 </p>
 <p className="text-[9px] text-muted-foreground">ثبت‌نام امروز</p>
 </div>
 </div>

 {data && data.users.length > 0? (
 <div className={expanded? "": "max-h-[180px] overflow-hidden"}>
 <ScrollArea className={expanded? "h-[280px]": "h-[180px]"}>
 <div className="space-y-1.5">
 {data.users.map((u) => (
 <div
 key={u.sessionId}
 className="flex items-center gap-2 p-1.5 rounded-md hover:bg-background/60 transition-colors"
 >
 <Avatar className="h-7 w-7 shrink-0">
 <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[9px] font-bold dark:bg-emerald-900/30 dark:text-emerald-300">
 {u.name?.slice(0, 2) || "؟"}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1">
 <p className="text-[11px] font-medium truncate">{u.name}</p>
 <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500 shrink-0" />
 </div>
 <p className="text-[9px] text-muted-foreground truncate" dir="ltr">
 {u.email}
 </p>
 </div>
 <div className="text-end shrink-0">
 {u.tenantName && (
 <Badge variant="outline" className="text-[8px] py-0 px-1">
 {u.tenantName.length > 16? u.tenantName.slice(0, 14) + "…": u.tenantName}
 </Badge>
 )}
 <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-0.5 justify-end">
 {deviceIcon(u.device)}
 {timeAgo(u.lastSeen)}
 </p>
 </div>
 </div>
 ))}
 </div>
 </ScrollArea>
 {data.users.length > 5 && (
 <button
 type="button"
 onClick={() => setExpanded(!expanded)}
 className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground mt-2 py-1 border-t border-border"
 >
 {expanded? "▲ نمایش کمتر": `▼ نمایش همه (${toPersianDigits(data.users.length)} کاربر)`}
 </button>
 )}
 </div>
 ): (
 <div className="text-center py-4">
 <UsersIcon className="h-6 w-6 text-muted-foreground mx-auto mb-1 opacity-50" />
 <p className="text-[11px] text-muted-foreground">
 {loading? "در حال بارگذاری...": "هیچ کاربر آنلاینی نیست"}
 </p>
 </div>
 )}
 </div>
 );
}

// هِلپر که فقط تعداد آنلاین را نشان می‌دهد (برای قراردادن در dashboard)
export function OnlineCountStat({ token }: { token: string }) {
 const [count, setCount] = React.useState<number | null>(null);
 React.useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const res = await fetch("/api/platform/presence", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = await res.json();
 if (!cancelled && json.success) setCount(json.data.onlineUsers);
 } catch { /* ignore */ }
 })();
 return () => { cancelled = true; };
 }, [token]);
 return <span>{count === null? "—": toPersianDigits(count)}</span>;
}
