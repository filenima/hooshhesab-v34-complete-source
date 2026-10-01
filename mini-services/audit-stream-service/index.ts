// ============ هوش — سرویس پخش زندهٔ لاگ ممیزی (port 3034) ============
// گزارش زندهٔ رخدادها (audit live stream) برای پنل سوپرادمین.
// اصول (الگو کاملاً مطابق mini-services/chat-service):
// - همه‌ی ذخیره‌سازی/احراز هویت در اپ اصلی (Next.js :3000) انجام می‌شود.
// - این سرویس فقط رویدادهای ممیزی را به اتاق «superadmins» پخش می‌کند:
//   • room "superadmins" → همه‌ی سوپرادمین‌های متصل (تب «گزارش زندهٔ رخدادها»)
// - اپ اصلی پس از هر `db.auditLog.create` موفق، رویداد را با POST /emit
//   (هدر x-internal-token) به این سرویس می‌فرستد → broadcast audit:event.
// - مسیر socket.io پیش‌فرض «/socket.io» است (client با io("/?XTransformPort=3034")
//   از طریق گیت‌وی به همین مسیر وصل می‌شود — قانون گیت‌وی: هرگز پورت مستقیم).

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";
import { Server, type Socket } from "socket.io";

const PORT = 3034; // ثابت — هرگز از env PORT استفاده نشود

// ---------- خواندن رازها: env → فایل .env اپ اصلی → fallback ----------
// اپ اصلی (Next.js) .env ریشه را خودکار می‌خواند؛ این سرویس نه. برای اینکه
// توکن‌های امضاشدهٔ اپ اصلی در اینجا هم validate شوند (و در dev واقعی کار کند)،
// JWT_SECRET/AUDIT_STREAM_TOKEN ابتدا از process.env و بعد از
// /home/z/my-project/.env (دو سطح بالاتر) خوانده می‌شود.
function readMainEnv(key: string): string | null {
  if (process.env[key]) return process.env[key];
  try {
    // mini-services/audit-stream-service → دوسطح بالاتر = ریشهٔ پروژه
    const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
    const content = fs.readFileSync(envPath, "utf8");
    const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, "");
      if (v) return v;
    }
  } catch {
    /* فایل .env در دسترس نیست — ادامه با fallback */
  }
  return null;
}

// JWT_SECRET همان راز امضای توکن‌های اپ اصلی است — fail-closed در production
// (بدون آن راز تصادفی غیرقابل عبور تولید می‌شود). الگو: chat-service.
const JWT_SECRET =
  readMainEnv("JWT_SECRET") ||
  (process.env.NODE_ENV === "production"
    ? crypto.randomBytes(32).toString("hex")
    : "dev-only-ephemeral-secret-change-me");

// توکن داخلی برای POST /emit — در production حتماً AUDIT_STREAM_TOKEN
// باید ست شود؛ مقدار fallback فقط برای توسعه است و هر کسی که آن را بداند
// می‌تواند رویداد جعلی پخش کند.
const INTERNAL_TOKEN = readMainEnv("AUDIT_STREAM_TOKEN") || "dev-internal-audit-token";

// اعتبارسنجی توکن سوپرادمین با همان JWT_SECRET اپ اصلی
// (هم‌ساختار verifyToken در lib/platform-auth.ts و chat-service) —
// payload باید type="superadmin" باشد.
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

// مقایسه‌ی زمان-ثابت توکن داخلی (ضد timing attack)
function isInternalTokenValid(provided: string): boolean {
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(INTERNAL_TOKEN);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// شکل رویداد پخش‌شده — هم‌ساختار رکورد AuditLog در Prisma
interface AuditStreamEvent {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  changes: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// نرمال‌سازی + سقف طول فیلدها (ضبط payload بزرگ/خطرناک از سوی emitter)
function normalizeEvent(body: Record<string, unknown>): AuditStreamEvent | null {
  const action = String(body?.action ?? "").trim();
  const tenantId = String(body?.tenantId ?? "").trim();
  // حداقل فیلدهای لازم برای پخش
  if (!action || !tenantId) return null;
  let createdAt = new Date().toISOString();
  if (typeof body?.createdAt === "string" && body.createdAt) {
    const d = new Date(body.createdAt);
    if (!isNaN(d.getTime())) createdAt = d.toISOString();
  } else if (typeof body?.createdAt === "number" && !isNaN(body.createdAt)) {
    createdAt = new Date(body.createdAt).toISOString();
  }
  let changes: string | null = null;
  if (typeof body?.changes === "string") {
    changes = (body.changes as string).slice(0, 8192);
  } else if (body?.changes != null) {
    try {
      changes = JSON.stringify(body.changes).slice(0, 8192);
    } catch {
      changes = null;
    }
  }
  return {
    id: String(body?.id ?? `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`).slice(0, 64),
    tenantId: tenantId.slice(0, 64),
    userId: body?.userId != null ? String(body.userId).slice(0, 64) : null,
    action: action.slice(0, 64),
    entity: String(body?.entity ?? "").slice(0, 64),
    entityId: body?.entityId != null ? String(body.entityId).slice(0, 128) : null,
    changes,
    ipAddress: body?.ipAddress != null ? String(body.ipAddress).slice(0, 64) : null,
    createdAt,
  };
}

function readBody(req: IncomingMessage, limitBytes = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

const httpServer = createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (url === "/healthz") {
    sendJson(res, 200, {
      ok: true,
      service: "hoosh-audit-stream",
      port: PORT,
      superadmins: io.sockets.adapter.rooms.get("superadmins")?.size ?? 0,
    });
    return;
  }

  // --- POST /emit — نقطهٔ ورود اپ اصلی (internal) ---
  if (url === "/emit" && req.method === "POST") {
    if (!isInternalTokenValid(String(req.headers["x-internal-token"] || ""))) {
      sendJson(res, 401, { ok: false, error: "invalid internal token" });
      return;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as Record<string, unknown>;
      const event = normalizeEvent(body);
      if (!event) {
        sendJson(res, 400, { ok: false, error: "missing required fields: action, tenantId" });
        return;
      }
      io.to("superadmins").emit("audit:event", event);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : "bad request" });
    }
    return;
  }

  sendJson(res, 404, { error: "not found — socket.io endpoint: use io('/?XTransformPort=3034')" });
});

const io = new Server(httpServer, {
  // مسیر پیش‌فرض "/socket.io" — کلاینت با io("/?XTransformPort=3034") به همین
  // مسیر درخواست می‌فرستد (socket.io-client به‌طور پیش‌فرض path="/socket.io").
 // اگر این مسیر"/"شود،engine.io «همه‌ی» درخواست‌های HTTP از جمله
  // POST /emit و /healthz را می‌بلعد (رفتار check در engine.io) — پس "/" ممنوع.
  path: "/socket.io",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
  maxHttpBufferSize: 64 * 1024,
});

io.on("connection", (socket: Socket) => {
  // --- audit:join — سوپرادمین با ارائهٔ JWT به اتاق superadmins می‌پیوندد ---
  socket.on("audit:join", (payload: { token?: string; superAdminToken?: string }, ack?: (r: unknown) => void) => {
    const t = String(payload?.token || payload?.superAdminToken || "");
    if (!t || !verifySuperAdminToken(t)) {
      // توکن نامعتبر → بدون پیوستن به اتاق، خطا و قطع اتصال
      ack?.({ ok: false, error: "توکن نامعتبر" });
      socket.emit("audit:error", { error: "توکن سوپرادمین نامعتبر — اتصال قطع شد" });
      socket.disconnect(true);
      return;
    }
    socket.join("superadmins");
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    // اتاق‌ها به‌صورت خودکار توسط socket.io پاک می‌شوند
  });
});

httpServer.listen(PORT, () => {
  console.log(`[hoosh-audit-stream] live audit stream listening on :${PORT}`);
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
