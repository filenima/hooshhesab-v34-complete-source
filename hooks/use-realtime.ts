"use client";

/**
 * use-realtime — حضور زندهٔ کاربران اپ (N نفر آنلاین)
 * ============================================================================
 * API:
 *   const { onlineUsers, connected } = useRealtime(token, activeModule);
 *   onlineUsers — Array<{ userId: string; name: string; module: string | null }>
 *                (خودِ کاربر فعلی از لیست حذف شده)
 *   connected  — اتصال socket.io برقرار است؟
 *
 * اتصال از طریق gateway سندباکس: io("/?XTransformPort=3032") — هرگز پورت
 * مستقیم. join با presence:join (userId + نام از /api/auth/me استخراج می‌شود
 * یا از توکن JWT decode می‌شود — فقط نام نمایشی، بدون دادهٔ حساس).
 * تغییر activeModule → emit presence:module.
 *
 * اگر سرویس در دسترس نباشد، بی‌صدا غیرفعال می‌ماند (قابلیت نمایشی است).
 */

import * as React from "react";
import { io, type Socket } from "socket.io-client";

export interface PresenceUser {
  userId: string;
  name: string;
  module: string | null;
}

function decodeNameFromToken(token: string): { userId: string; name: string } {
  try {
    const part = token.split(".")[1] || "";
    const json = decodeURIComponent(
      atob(part.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(json) as { id?: string; userId?: string; name?: string; email?: string };
    return {
      userId: String(payload.id || payload.userId || "me"),
      name: String(payload.name || payload.email || "کاربر"),
    };
  } catch {
    return { userId: "me", name: "کاربر" };
  }
}

export function useRealtime(token: string | null, activeModule?: string) {
  const [onlineUsers, setOnlineUsers] = React.useState<PresenceUser[]>([]);
  const [connected, setConnected] = React.useState(false);

  const identity = React.useMemo(() => {
    if (!token) return null;
    return decodeNameFromToken(token);
  }, [token]);

  const moduleRef = React.useRef(activeModule);
  React.useEffect(() => {
    moduleRef.current = activeModule;
  }, [activeModule]);

  React.useEffect(() => {
    if (!token || !identity) return;

    let socket: Socket | null = null;
    let cancelled = false;

    try {
      socket = io("/?XTransformPort=3032", {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 10_000,
        timeout: 8_000,
      });
    } catch {
      return;
    }

    const mySocket = socket;

    mySocket.on("connect", () => {
      setConnected(true);
      // ثبت socket برای به‌روزرسانی ماژول بعدی
      (window as unknown as { __hooshPresenceSocket?: Socket }).__hooshPresenceSocket = mySocket;
      mySocket.emit("presence:join", {
        userId: identity.userId,
        name: identity.name,
        module: moduleRef.current || null,
      });
    });

    mySocket.on("disconnect", () => setConnected(false));
    mySocket.on("connect_error", () => setConnected(false));

    mySocket.on("presence:update", (payload: { users?: Array<{ userId: string; name: string; module: string | null }> }) => {
      if (cancelled || !Array.isArray(payload?.users)) return;
      // خودِ کاربر از لیست حذف می‌شود (نمایش «دیگران»)
      setOnlineUsers(
        payload.users
          .filter((u) => u && typeof u.userId === "string")
          .filter((u) => u.userId !== identity.userId)
          .slice(0, 50)
      );
    });

    return () => {
      cancelled = true;
      try {
        mySocket.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [token, identity]);

  // تغییر ماژول فعال → اطلاع به سرور
  React.useEffect(() => {
    if (!connected) return;
    // رویداد سراسری — فقط در صورت نیاز به broadcast دقیق
    try {
      const anyWin = window as unknown as { __hooshPresenceSocket?: Socket };
      if (anyWin.__hooshPresenceSocket) {
        anyWin.__hooshPresenceSocket.emit("presence:module", { module: activeModule || null });
      }
    } catch {
      /* ignore */
    }
  }, [connected, activeModule]);

  return { onlineUsers, connected };
}

export default useRealtime;
