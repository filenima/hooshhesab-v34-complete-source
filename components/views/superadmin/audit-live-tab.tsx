"use client";

// ============ هوش — تب «گزارش زندهٔ رخدادها» پنل سوپرادمین (Task 10) ============
// پخش زندهٔ audit log ها از طریق mini-service پخش (audit-stream-service :3034).
// ---------------------------------------------------------------------------
// اتصال از طریق گیت‌وی سندباکس: io("/?XTransformPort=3034") — هرگز پورت مستقیم.
// جریان: اپ اصلی پس از db.auditLog.create → POST /emit (توکن داخلی) →
// سرویس به اتاق "superadmins" پخش می‌کند → این تب audit:event را نمایش می‌دهد.
// عضویت در اتاق فقط با توکن معتبر سوپرادمین (audit:join) ممکن است.
// ---------------------------------------------------------------------------

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import {
  Activity,
  ChevronDown,
  Eraser,
  Loader2,
  Pause,
  Play,
  Search,
  ShieldAlert,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toJalali, toPersianDigits } from "@/lib/persian";

// باید با STORAGE_KEY در components/views/superadmin-login.tsx یکی باشد
const ADMIN_TOKEN_KEY = "hoshhesab_admin_token";

/** حداکثر رخداد نگهداری‌شده در حافظه — قدیمی‌ها حذف می‌شوند */
const MAX_ITEMS = 200;

/** شکل رویداد پخش‌شده از سرویس (هم‌ساختار AuditLog) */
export interface AuditEvent {
  id: string;
  tenantId: string;
  userId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  changes?: string | null;
  ipAddress?: string | null;
  createdAt?: string;
}

type ConnState = "connecting" | "live" | "offline" | "denied";

/** دسته‌بندی رخداد برای رنگ‌بندی بج */
type EventCategory = "AUTH" | "PAYMENT" | "SECURITY" | "OTHER";

const CATEGORY_LABELS: Record<EventCategory, string> = {
  AUTH: "ورود/احراز",
  PAYMENT: "پرداخت",
  SECURITY: "امنیتی",
  OTHER: "سایر",
};

const CATEGORY_BADGE: Record<EventCategory, string> = {
  // AUTH = آبی‌فیروزه
  AUTH: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  // PAYMENT = سبز
  PAYMENT: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  // SECURITY = قرمز
  SECURITY: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  // سایر = خنثی
  OTHER: "bg-muted text-muted-foreground border-border",
};

function categorize(action: string): EventCategory {
  const a = action.toUpperCase();
  if (/(LOGIN|LOGOUT|REGISTER|SIGNUP|PASSWORD|SESSION|TOKEN|OTP|2FA|AUTH)/.test(a)) return "AUTH";
  if (/(PAY|INVOICE|SUBSCRIPTION|WALLET|BILLING|PLAN|LICENSE|RENEW|CHARGE|WITHDRAW|REFUND|TRIAL)/.test(a)) {
    return "PAYMENT";
  }
  if (/(SECURITY|PERMISSION|ROLE|API_?KEY|ROTATE|REVOKE|SUSPEND|BLOCK|BAN|IMPERSONATE|EXPORT|DELETE|GRANT)/.test(a)) {
    return "SECURITY";
  }
  return "OTHER";
}

/** تاریخ شمسی + ساعت با ارقام فارسی */
function formatJalaliTime(iso?: string): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return "—";
    const hh = toPersianDigits(String(d.getHours()).padStart(2, "0"));
    const mm = toPersianDigits(String(d.getMinutes()).padStart(2, "0"));
    const ss = toPersianDigits(String(d.getSeconds()).padStart(2, "0"));
    return `${toJalali(d)} · ${hh}:${mm}:${ss}`;
  } catch {
    return "—";
  }
}

/** JSON خوانا برای نمایش changes — اگر parse نشود همان خام */
function prettyChanges(changes?: string | null): string | null {
  if (!changes) return null;
  try {
    return JSON.stringify(JSON.parse(changes), null, 2);
  } catch {
    return changes;
  }
}

// ─────────────────────────── ردیف رخداد ───────────────────────────

function AuditEventRow({ event }: { event: AuditEvent }) {
  const category = categorize(event.action);
  const changes = prettyChanges(event.changes);
  const hasChanges = Boolean(changes);

  return (
    <Collapsible>
      <div className="rounded-lg border bg-card transition-colors hover:border-primary/30">
        <CollapsibleTrigger
          className={cn(
            "group/col w-full text-right px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5",
            hasChanges ? "cursor-pointer" : "cursor-default"
          )}
        >
          <Badge
            variant="outline"
            className={cn("shrink-0 font-mono text-[11px] tnum", CATEGORY_BADGE[category])}
            title={`${CATEGORY_LABELS[category]} — ${event.action}`}
          >
            {event.action}
          </Badge>

          <span className="text-xs text-foreground/90 min-w-0">
            <span className="text-muted-foreground">سازمان: </span>
            <span className="font-medium tnum" dir="ltr">
              {event.tenantId || "—"}
            </span>
          </span>

          <span className="text-xs text-foreground/90 min-w-0">
            <span className="text-muted-foreground">کاربر: </span>
            <span className="font-medium tnum" dir="ltr">
              {event.userId || "—"}
            </span>
          </span>

          <span className="text-xs text-muted-foreground min-w-0">
            <span>IP: </span>
            <span className="font-mono tnum" dir="ltr">
              {event.ipAddress || "—"}
            </span>
          </span>

          <span className="ms-auto text-[11px] text-muted-foreground tnum whitespace-nowrap">
            {formatJalaliTime(event.createdAt)}
          </span>

          {hasChanges ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/col:rotate-180" />
          ) : (
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </CollapsibleTrigger>

        {hasChanges && (
          <CollapsibleContent>
            <div className="px-3 pb-3 pt-2 border-t border-border/70 space-y-2">
              {event.entity && (
                <p className="text-[11px] text-muted-foreground">
                  موجودی: <span className="font-mono tnum">{event.entity}</span>
                  {event.entityId ? (
                    <span className="font-mono tnum" dir="ltr">
                      {" "}
                      · {event.entityId}
                    </span>
                  ) : null}
                </p>
              )}
              <pre
                dir="ltr"
                className="text-left text-[11px] leading-relaxed font-mono bg-muted/60 rounded-md border border-border/60 p-3 max-h-64 overflow-auto compact-scroll"
              >
                {changes}
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

// ─────────────────────────── تب اصلی ───────────────────────────

export function AuditLiveTab({ token: tokenProp }: { token?: string }) {
  const { toast } = useToast();

  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [conn, setConn] = React.useState<ConnState>("connecting");
  const [paused, setPaused] = React.useState(false);
  const [missedWhilePaused, setMissedWhilePaused] = React.useState(0);
  const [totalReceived, setTotalReceived] = React.useState(0);
  const [query, setQuery] = React.useState("");

  // paused داخل هندلر socket با ref خوانده می‌شود (هندلر یک‌بار ساخته می‌شود)
  const pausedRef = React.useRef(false);
  React.useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  React.useEffect(() => {
    // توکن سوپرادمین: پراپ یا localStorage (کلید لاگین پنل سوپرادمین)
    let token = tokenProp || null;
    if (!token) {
      try {
        token = localStorage.getItem(ADMIN_TOKEN_KEY);
      } catch {
        token = null;
      }
    }
    if (!token) {
      setConn("denied");
      return;
    }

    let socket: Socket;
    try {
      // قانون گیت‌وی: مسیر نسبی + ?XTransformPort — هرگز پورت مستقیم
      socket = io("/?XTransformPort=3034", {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 4_000,
        reconnectionDelayMax: 15_000,
        timeout: 10_000,
      });
    } catch {
      setConn("offline");
      return;
    }

    socket.on("connect", () => {
      setConn((prev) => (prev === "denied" ? prev : "connecting"));
      socket.emit(
        "audit:join",
        { token },
        (res: unknown) => {
          const r = res as { ok?: boolean } | null;
          if (r && r.ok) {
            setConn("live");
          } else {
            setConn("denied");
          }
        }
      );
    });

    socket.on("disconnect", () => {
      setConn((prev) => (prev === "denied" ? prev : "offline"));
    });

    socket.on("connect_error", () => {
      setConn((prev) => (prev === "denied" ? prev : "offline"));
    });

    // توکن رد شد یا منقضی شده — سرویس اتصال را قطع می‌کند
    socket.on("audit:error", () => {
      setConn("denied");
    });

    socket.on("audit:event", (event: AuditEvent) => {
      if (!event || typeof event.action !== "string" || !event.tenantId) return;
      if (pausedRef.current) {
        // جریان متوقف است — فقط بشمار، رخداد نادیده گرفته می‌شود
        setMissedWhilePaused((n) => n + 1);
        return;
      }
      setTotalReceived((n) => n + 1);
      // جدید‌ها اول لیست؛ حداکثر MAX_ITEMS در حافظه
      setEvents((prev) => [event, ...prev].slice(0, MAX_ITEMS));
    });

    return () => {
      try {
        socket.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [tokenProp]);

  // اطلاع کوتاه هنگام برقراری/قطع اتصال (فقط تغییر وضعیت واقعی)
  const prevConnRef = React.useRef<ConnState>("connecting");
  React.useEffect(() => {
    if (prevConnRef.current !== conn) {
      if (conn === "live") {
        toast({ title: "جریان زنده متصل شد", description: "رخدادهای ممیزی به‌صورت زنده دریافت می‌شوند." });
      } else if (conn === "offline" && prevConnRef.current === "live") {
        toast({ title: "جریان زنده قطع شد", description: "در حال تلاش برای اتصال مجدد…", variant: "destructive" });
      }
      prevConnRef.current = conn;
    }
  }, [conn, toast]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.action, e.tenantId, e.entity, e.entityId, e.ipAddress, e.userId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [events, query]);

  const statusMeta: Record<ConnState, { label: string; dot: string; ping: boolean }> = {
    connecting: { label: "در حال اتصال…", dot: "bg-amber-500", ping: false },
    live: { label: "متصل — زنده", dot: "bg-green-500", ping: true },
    offline: { label: "قطع — اتصال مجدد…", dot: "bg-red-500", ping: false },
    denied: { label: "توکن نامعتبر", dot: "bg-red-500", ping: false },
  };
  const sm = statusMeta[conn];

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-full">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Radio className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">گزارش زندهٔ رخدادها</CardTitle>
                <CardDescription className="text-xs mt-1">
                  پخش لحظه‌ای لاگ ممیزی پلتفرم برای سوپرادمین‌ها — بدون نیاز به رفرش
                </CardDescription>
              </div>
            </div>

            {/* نشانگر وضعیت اتصال — پینگ سبز/قرمز */}
            <div
              className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5"
              role="status"
              aria-live="polite"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {sm.ping && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                )}
                <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", sm.dot)} />
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  conn === "live" ? "text-green-600 dark:text-green-400" : conn === "denied" || conn === "offline" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                )}
              >
                {sm.label}
              </span>
            </div>
          </div>

          {/* کنترل‌ها: توقف/ادامه، فیلتر، پاک‌کردن */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant={paused ? "default" : "outline"}
              onClick={() => {
                setPaused((p) => !p);
                setMissedWhilePaused(0);
              }}
              aria-pressed={paused}
              className="h-10"
              title={paused ? "ادامهٔ دریافت رخدادها" : "توقف موقت دریافت رخدادها"}
            >
              {paused ? <Play className="h-4 w-4 ml-1" /> : <Pause className="h-4 w-4 ml-1" />}
              {paused ? "ادامهٔ جریان" : "توقف جریان"}
            </Button>

            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="فیلتر: اکشن، سازمان، IP…"
                className="pr-9 h-10 text-xs"
                aria-label="فیلتر رخدادها بر اساس اکشن یا سازمان"
              />
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEvents([]);
                setMissedWhilePaused(0);
              }}
              disabled={events.length === 0}
              className="h-10"
              title="پاک‌کردن فهرست رخدادها"
            >
              <Eraser className="h-4 w-4 ml-1" />
              پاک‌کردن
            </Button>
          </div>

          {/* آمار */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
            <span>
              نمایش <span className="tnum font-medium text-foreground">{toPersianDigits(filtered.length)}</span> از{" "}
              <span className="tnum font-medium text-foreground">{toPersianDigits(events.length)}</span> رخداد
            </span>
            <span>
              کل دریافتی: <span className="tnum font-medium text-foreground">{toPersianDigits(totalReceived)}</span>
            </span>
            {paused && (
              <span className="text-amber-600 dark:text-amber-400">
                {missedWhilePaused > 0
                  ? `${toPersianDigits(missedWhilePaused)} رخداد در حالت توقف دریافت شد (نادیده گرفته شد)`
                  : "جریان متوقف است"}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {conn === "denied" ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <ShieldAlert className="h-10 w-10 text-red-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">دسترسی به جریان زنده ممکن نیست</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  توکن سوپرادمین یافت نشد یا نامعتبر است. لطفاً از پنل خارج شوید و دوباره وارد شوید.
                </p>
              </div>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              {conn === "connecting" ? (
                <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : (
                <Activity className="h-9 w-9 text-muted-foreground animate-pulse" aria-hidden="true" />
              )}
              <p className="text-sm text-muted-foreground">
                {conn === "connecting"
                  ? "در حال اتصال به سرویس پخش زنده…"
                  : conn === "offline"
                    ? "اتصال قطع است — در حال تلاش برای اتصال مجدد…"
                    : "در انتظار رخدادهای جدید…"}
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                هر عملیات ثبت‌شده در ممیزی پلتفرم، بلافاصله همین‌جا نمایش داده می‌شود.
              </p>
            </div>
          ) : (
            <div
              className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto compact-scroll pl-1"
              role="feed"
              aria-label="فهرست زندهٔ رخدادهای ممیزی"
            >
              {filtered.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">
                  هیچ رخدادی با این فیلتر پیدا نشد.
                </p>
              ) : (
                filtered.map((e) => <AuditEventRow key={e.id} event={e} />)
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AuditLiveTab;
