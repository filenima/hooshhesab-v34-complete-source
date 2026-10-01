// ============ هوش — سرویس چت زنده پشتیبانی (port 3032) ============
// رله real-time سبک بین ویجت کاربران و پنل سوپرادمین.
// اصول:
// - همه‌ی ذخیره‌سازی/احراز هویت در اپ اصلی (Next.js :3000) انجام می‌شود.
// - این سرویس فقط رویدادها را بین اتاق‌ها (rooms) پخش می‌کند:
//   • room "agents" → همه‌ی سوپرادمین‌های متصل
//   • room "session:{id}" → ویجت بازدیدکننده‌ی همان نشست
// - الگوی «notification bus»: کلاینت پیام را با REST به اپ اصلی می‌فرستد؛
//   پس از موفقیت رویداد chat:new-message را اینجا emit می‌کند تا طرف مقابل
//   بلافاصله رفرش کند. typing هم مستقیم رله می‌شود (بدون ذخیره).

import { createServer } from "http";
import crypto from "crypto";
import { Server, type Socket } from "socket.io";

const PORT = 3032; // ثابت — از طریق gateway: ?XTransformPort=3032

// FIX(SECURITY-H1): JWT_SECRET همان راز امضای توکن‌های اپ اصلی است —
// fail-closed در production (بدون آن راز تصادفی غیرقابل عبور تولید می‌شود).
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? crypto.randomBytes(32).toString("hex")
    : "dev-only-ephemeral-secret-change-me");

// FIX(SECURITY-H1): توکن سوپرادمین با همان JWT_SECRET اپ اصلی اعتبارسنجی می‌شود
// (هم‌ساختار verifyToken در lib/platform-auth.ts) و payload باید type="superadmin"
// باشد. قبلاً هر توکنی با ۳ نقطه (هر JWT شکلی) نقش agent می‌گرفت!
function verifySuperAdminToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [h, p, s] = parts;
    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${h}.${p}`)
      .digest("base64url");
    const a = Buffer.from(s);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (payload?.type !== "superadmin") return false;
    // سقف عمر ۹۰ روز (هم‌راستا با MAX_TTL اپ اصلی)
    if (payload?.iat && Date.now() - payload.iat > 90 * 24 * 60 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

const httpServer = createServer((req, res) => {
 if (req.url === "/healthz") {
 res.writeHead(200, { "Content-Type": "application/json" });
 res.end(JSON.stringify({ ok: true, service: "hoosh-chat", port: PORT }));
 return;
 }
 res.writeHead(400, { "Content-Type": "application/json" });
 res.end(JSON.stringify({ error: "socket.io endpoint — use websocket client" }));
});

// ==================== presence registry ====================
// FIX(v13-presence): نگهداری کاربران آنلایِ اپ برای «N نفر آنلاین».
// حضور‌ها سمت سرور نگه داشته می‌شوند (ایمن از جعل سمت کلاینت) و فقط
// خلاصهٔ نمایشی (userId/name/module) به اتاق presence پخش می‌شود.
interface PresenceEntry {
 userId: string;
 name: string;
 module: string | null;
 at: number;
}
const presence = new Map<string, PresenceEntry>();
let presenceBroadcastTimer: ReturnType<typeof setTimeout> | null = null;

function broadcastPresence() {
 // حداکثر ۲۰۰ نفر — برای اپ‌های بزرگ، بیشینهٔ اخیر
 const list = Array.from(presence.entries())
 .slice(0, 200)
 .map(([socketId, p]) => ({
 socketId,
 userId: p.userId,
 name: p.name,
 module: p.module,
 }));
 io.to("presence").emit("presence:update", { users: list, at: Date.now() });
}

function broadcastPresenceThrottled() {
 if (presenceBroadcastTimer) return;
 presenceBroadcastTimer = setTimeout(() => {
 presenceBroadcastTimer = null;
 broadcastPresence();
 }, 1500);
}

const io = new Server(httpServer, {
 // DO NOT change the path — gateway بر اساس آن فوروارد می‌کند
 path: "/",
 cors: { origin: "*", methods: ["GET", "POST"] },
 pingTimeout: 60_000,
 pingInterval: 25_000,
 maxHttpBufferSize: 64 * 1024,
});

interface JoinPayload {
 sessionId?: string;
 sessionToken?: string;
 role?: "visitor" | "agent";
 superAdminToken?: string;
}

interface RelayPayload {
 sessionId?: string;
 role?: string;
 from?: string;
 message?: string;
 preview?: string;
}

io.on("connection", (socket: Socket) => {
 let joinedSession: string | null = null;
 let isAgent = false;

 // --- visitor:join — ویجت کاربر به اتاق نشست خودش می‌پیوندد ---
 socket.on("visitor:join", (payload: JoinPayload, ack?: (r: unknown) => void) => {
 if (!payload?.sessionId) {
 ack?.({ ok: false, error: "sessionId لازم است" });
 return;
 }
 joinedSession = String(payload.sessionId).slice(0, 64);
 // اعتبار sessionToken سطحی (طول و فرمت hex) — اعتبار کامل در REST اپ اصلی
 const token = String(payload.sessionToken || "");
 if (!/^[a-f0-9]{64}$/.test(token)) {
 ack?.({ ok: false, error: "sessionToken نامعتبر" });
 return;
 }
 socket.join(`session:${joinedSession}`);
 // خبر به سوپرادمین‌ها: بازدیدکننده آنلاین شد
 io.to("agents").emit("chat:visitor-online", {
 sessionId: joinedSession,
 at: new Date().toISOString(),
 });
 ack?.({ ok: true });
 });

 // --- agent:join — سوپرادمین به اتاق agents می‌پیوندد ---
 socket.on("agent:join", (payload: JoinPayload, ack?: (r: unknown) => void) => {
 // FIX(SECURITY-H1): توکن سوپرادمین با HMAC راز مشترک اعتبارسنجی می‌شود.
 // قبلاً فقط «۳ بخش با نقطه» چک می‌شد → هرکسی می‌توانست agent جعل شود.
 const t = String(payload?.superAdminToken || "");
 if (!t || !verifySuperAdminToken(t)) {
 ack?.({ ok: false, error: "توکن نامعتبر" });
 return;
 }
 isAgent = true;
 socket.join("agents");
 ack?.({ ok: true });
 });

 // --- agent:watch — سوپرادمین گفت‌وگوی خاصی را باز می‌کند ---
 socket.on("agent:watch", (payload: { sessionId?: string }) => {
 if (!isAgent || !payload?.sessionId) return;
 socket.join(`session:${String(payload.sessionId).slice(0, 64)}`);
 });

 // --- chat:new-message — اعلان پیام جدید (پس از ثبت موفق REST) ---
 socket.on("chat:new-message", (payload: RelayPayload) => {
 if (!payload?.sessionId) return;
 const sid = String(payload.sessionId).slice(0, 64);
 const event = {
 sessionId: sid,
 role: payload.role === "agent" ? "agent" : "visitor",
 at: new Date().toISOString(),
 };
 // به اتاق نشست (ویجت) و به همه‌ی سوپرادمین‌ها
 io.to(`session:${sid}`).emit("chat:message", event);
 io.to("agents").emit("chat:message", event);
 // نشست جدید/تغییر لیست
 if (payload.preview!== undefined) {
 io.to("agents").emit("chat:session-updated", {
 sessionId: sid,
 preview: String(payload.preview).slice(0, 80),
 at: event.at,
 });
 }
 });

 // --- typing — در حال نوشتن (هر دو جهت) ---
 socket.on("visitor:typing", (payload: { sessionId?: string }) => {
 if (!payload?.sessionId) return;
 io.to("agents").emit("chat:typing", {
 sessionId: String(payload.sessionId).slice(0, 64),
 who: "visitor",
 });
 });
 socket.on("agent:typing", (payload: { sessionId?: string }) => {
 if (!payload?.sessionId ||!isAgent) return;
 io.to(`session:${String(payload.sessionId).slice(0, 64)}`).emit("chat:typing", {
 sessionId: String(payload.sessionId).slice(0, 64),
 who: "agent",
 });
 });

 // --- chat:session-closed ---
 socket.on("chat:session-closed", (payload: { sessionId?: string }) => {
 if (!payload?.sessionId) return;
 const sid = String(payload.sessionId).slice(0, 64);
 io.to(`session:${sid}`).emit("chat:closed", { sessionId: sid });
 io.to("agents").emit("chat:closed", { sessionId: sid });
 });

 // ==================== presence (کاربران آنلاین اپ) ====================
 // FIX(v13-presence): کاربران اپ برای نمایش «N نفر آنلاین» به اتاق presence
 // می‌پیوندند. نیازی به احراز هویت نیست — فقط داده‌های نمایشی (نام + ماژول
 // فعال) پخش می‌شود؛ هیچ داده‌ی حساسی رد و بدل نمی‌شود. هر socket حداکثر
 // یک حضور دارد و پاک‌سازی خودکار در disconnect.
 socket.on(
 "presence:join",
 (payload: { userId?: string; name?: string; module?: string }, ack?: (r: unknown) => void) => {
 const uid = String(payload?.userId || "").slice(0, 64) || `anon-${socket.id.slice(0, 8)}`;
 const name = String(payload?.name || "کاربر").slice(0, 40);
 const moduleName = String(payload?.module || "").slice(0, 40) || null;
 presence.set(socket.id, { userId: uid, name, module: moduleName, at: Date.now() });
 socket.join("presence");
 broadcastPresence();
 ack?.({ ok: true });
 }
 );

 // تغییر ماژول فعال (بدون ترک اتصال)
 socket.on("presence:module", (payload: { module?: string }) => {
 const p = presence.get(socket.id);
 if (!p) return;
 p.module = String(payload?.module || "").slice(0, 40) || null;
 p.at = Date.now();
 broadcastPresenceThrottled();
 });

 socket.on("disconnect", () => {
 presence.delete(socket.id);
 broadcastPresenceThrottled();
 if (joinedSession) {
 io.to("agents").emit("chat:visitor-offline", {
 sessionId: joinedSession,
 at: new Date().toISOString(),
 });
 }
 });
});

httpServer.listen(PORT, () => {
 console.log(`[hoosh-chat] live-chat relay listening on :${PORT}`);
});

process.on("SIGTERM", () => {
 io.close();
 httpServer.close();
 process.exit(0);
});
process.on("SIGINT", () => {
 io.close();
 httpServer.close();
 process.exit(0);
});
