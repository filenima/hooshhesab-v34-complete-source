// ============ modian-mock v2 — شبیه‌ساز محیط آزمایشی سامانه مودیان (نسخه ۲) ============
//
// FIX(v4-مودیان/C3): نسخه‌ی قبلی این سرویس API «نسخه ۱» (OAuth2 + /api/v1/invoices)
// بود و کلاینت نسخه‌۲ هوش (nonce + JWS + JWE روی /requestsmanager/api/v2) با آن
// 404 می‌گرفت. این نسخه «هم‌شکل» API رسمی نسخه ۲ است:
//
//   GET  /nonce?timeToLive=10..200        → { nonce, expDate }
//   GET  /server-information              → { serverTime, publicKeys: [{key,id,algorithm,purpose}] }
//   POST /invoice                         → [{ header:{requestTraceId,fiscalId}, payload:<JWE> }]
//                                           پاسخ: { result: [{ uid, referenceNumber }] }
//                                           خطاها: 4144 (بدنه خالی)، 4143 (>1000)، 401/4102 (nonce)، 4131 (امضا)
//   GET  /inquiry-by-uid?uidList=..&fiscalId=.. → { result: [{ uid, referenceNumber, status, data }] }
//   GET  /inquiry?start=..&end=..&pageNumber=&pageSize=&status= → صفحه‌بندی
//   GET  /taxpayer?economicCode=..        → اطلاعات مودیان (شبیه‌سازی)
//   GET  /fiscal-information?memoryId=..  → اطلاعات حافظه (شبیه‌سازی)
//
// رفتار شبیه‌سازی:
//  - احراز هویت واقعی: Bearer = JWS امضاشده با گواهی کارپوشه — امضای RS256 با
//    کلید عمومی داخل x5c اعتبارسنجی می‌شود + nonce باید یکی از nonceهای صادرشده
//    و «منقضی‌نشده» باشد. خطا دقیقاً مثل سازمان: 401 + errorCode.
//  - پکت JWE واقعاً «رمزگشایی» می‌شود (کلید خصوصی سرور همان‌جاست) — خطای JWE = 400/04152.
//  - پردازش async: پکت ابتدا PENDING؛ استعلام تا ۵ ثانیه IN_PROGRESS و بعد
//    SUCCESS با confirmationReferenceId (مثل سازمان که نتیجه را با تأخیر می‌دهد).
//  - ۵٪ پکتها شبیه‌سازی خطا (خطای واقعی سازمان در سندبکس) تا مسیر REJECTED هم تست شود.
//
// استفاده: در تنظیمات مودیان هوش محیط را «آزمایشی (TEST)» بگذارید و آدرس
// محیط آزمایشی را «http://localhost:3031» (یا آدرس سرور این سرویس) بدهید.
// هیچ چیزی به سازمان امور مالیاتی نمی‌رود — کاملاً محلی است.
//
// توجه: این سرویس «شبیه‌سازی سمت سامانه مودیان» است، نه شبیه‌سازی ارسال!
// خود هوش همچنان فقط با confirm واقعی ارسال می‌کند.

import crypto from "node:crypto";

const PORT = 3031;

// ============ کلید سرور (برای JWE پکت‌ها) ============
// در هر راه‌اندازی یک RSA-2048 تازه — کلاینت از /server-information می‌گیرد
const SERVER_KEY = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const SERVER_KEY_ID = crypto.randomUUID();
const SERVER_PUBLIC_PEM = SERVER_KEY.publicKey.export({ type: "spki", format: "pem" }).toString();

// ============ state ============
interface StoredPacket {
  uid: string; // requestTraceId
  referenceNumber: string;
  fiscalId: string;
  invoiceNumber: string | null; // از داخل JWE (اگر قابل رمزگشایی بود)
  receivedAt: number;
  errorSimulated: boolean;
  confirmationReferenceId: string | null;
}

const packets = new Map<string, StoredPacket>();
const nonces = new Map<string, number>(); // nonce → expiry ms
const PROCESS_DELAY_MS = 5_000; // تأخیر شبیه‌سازی «پردازش async» سازمان
const ERROR_RATE = 0.05; // ۵٪ خطا

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

// ---------- خطاهای رسمی‌شکل ----------
const err = (status: number, errorCode: string, message: string) =>
  json({ errorCode, message }, status);

// ---------- اعتبارسنجی Bearer (JWS + nonce + x5c) ----------
function verifyBearer(authHeader: string | null): { ok: true; clientId: string } | { ok: false; status: number; errorCode: string; message: string } {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, errorCode: "4130", message: "missing bearer token" };
  }
  const jws = authHeader.slice("Bearer ".length).trim();
  const parts = jws.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: 401, errorCode: "4130", message: "invalid token structure" };
  }
  let header: { alg?: string; x5c?: string[]; typ?: string };
  let payload: { nonce?: string; clientId?: string };
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, status: 401, errorCode: "4130", message: "undecodable token" };
  }
  if (header.alg !== "RS256") {
    return { ok: false, status: 401, errorCode: "4131", message: "unexpected algorithm" };
  }
  const derB64 = header.x5c?.[0];
  if (!derB64) {
    return { ok: false, status: 401, errorCode: "4131", message: "certificate (x5c) missing" };
  }
  // اعتبارسنجی امضا با کلید عمومی گواهی
  try {
    const cert = new crypto.X509Certificate(Buffer.from(derB64, "base64"));
    const sig = Buffer.from(parts[2], "base64url");
    const ok = crypto.verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), cert.publicKey, sig);
    if (!ok) {
      return { ok: false, status: 401, errorCode: "4131", message: "signature verification failed" };
    }
  } catch {
    return { ok: false, status: 401, errorCode: "4131", message: "invalid certificate" };
  }
  // nonce باید از ما باشد و منقضی نشده
  const nonce = payload.nonce;
  if (!nonce) {
    return { ok: false, status: 400, errorCode: "4101", message: "nonce missing in token" };
  }
  const expiry = nonces.get(nonce);
  if (expiry === undefined) {
    return { ok: false, status: 400, errorCode: "4102", message: "unknown/used nonce" };
  }
  if (Date.now() > expiry) {
    nonces.delete(nonce);
    return { ok: false, status: 400, errorCode: "4102", message: "nonce expired" };
  }
  nonces.delete(nonce); // یک‌بارمصرف
  return { ok: true, clientId: payload.clientId ?? "" };
}

// ---------- رمزگشایی JWE پکت (RSA-OAEP-256 + A256GCM) ----------
function decryptJwe(jwe: string): { ok: true; plaintext: string } | { ok: false; reason: string } {
  try {
    const parts = jwe.split(".");
    if (parts.length !== 5) return { ok: false, reason: "structure" };
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (header.alg !== "RSA-OAEP-256" || header.enc !== "A256GCM") {
      return { ok: false, reason: "alg/enc mismatch (expected RSA-OAEP-256 + A256GCM)" };
    }
    const cek = crypto.privateDecrypt(
      {
        key: SERVER_KEY.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(parts[1], "base64url")
    );
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[4], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", cek, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(parts[0], "ascii"));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return { ok: true, plaintext: plain.toString("utf8") };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "decrypt error" };
  }
}

// ---------- وضعیت پکت در زمان استعلام ----------
function packetStatus(p: StoredPacket): {
  status: "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED";
  data?: {
    confirmationReferenceId: string | null;
    success: boolean | null;
    error?: { code: number | string; message: string; errorType?: string }[];
  };
} {
  const elapsed = Date.now() - p.receivedAt;
  if (elapsed < PROCESS_DELAY_MS) {
    return { status: elapsed < 1500 ? "PENDING" : "IN_PROGRESS" };
  }
  if (p.errorSimulated) {
    return {
      status: "FAILED",
      data: {
        confirmationReferenceId: null,
        success: false,
        error: [
          {
            code: "3001",
            message: "خطای شبیه‌سازی‌شده سندباکس — ساختار صورتحساب توسط سازمان رد شد (برای تست مسیر REJECTED)",
            errorType: "BUSINESS",
          },
        ],
      },
    };
  }
  return {
    status: "SUCCESS",
    data: {
      confirmationReferenceId: p.confirmationReferenceId,
      success: true,
      error: [],
      warning: [{ code: "0", message: "محیط آزمایشی شبیه‌ساز — بدون اثر حقوقی" }],
    } as never,
  };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, ""); // trailing slash

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    try {
      // ============ GET /nonce ============
      if (path === "/nonce" && req.method === "GET") {
        const ttl = Math.min(Math.max(Number(url.searchParams.get("timeToLive")) || 30, 10), 200);
        const nonce = crypto.randomUUID();
        nonces.set(nonce, Date.now() + ttl * 1000);
        // پاکسازی nonceهای منقضی (بدون نشت حافظه)
        if (nonces.size > 500) {
          const now = Date.now();
          for (const [n, exp] of nonces) if (exp < now) nonces.delete(n);
        }
        return json({
          nonce,
          expDate: new Date(Date.now() + ttl * 1000).toISOString(),
        });
      }

      // ============ GET /server-information ============
      if (path === "/server-information" && req.method === "GET") {
        return json({
          serverTime: Date.now(),
          publicKeys: [
            {
              key: SERVER_PUBLIC_PEM.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, ""),
              id: SERVER_KEY_ID,
              algorithm: "RSA",
              purpose: 1, // 1 = encryption
            },
            {
              key: SERVER_PUBLIC_PEM.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, ""),
              id: `${SERVER_KEY_ID}-verify`,
              algorithm: "RSA",
              purpose: 2, // 2 = signature (برای استعلام‌های امضاشده در آینده)
            },
          ],
        });
      }

      // ============ POST /invoice-demo (ابزار عمومی لندینگ — بدون Bearer/JWE) ============
      // برای «آزمایشگاه صورتحساب مودیان» در سایت عمومی: nonce واقعی می‌گیرد،
      // پکت JSON ساده (نه JWE) می‌فرستد و پاسخ رسمی‌شکل برمی‌گرداند.
      if (path === "/invoice-demo" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        const pkt = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
        if (!pkt) return err(400, "4144", "empty/invalid request body");

        const header = (pkt.header ?? {}) as { requestTraceId?: string; fiscalId?: string; nonce?: string };
        const payload = (pkt.payload ?? {}) as {
          header?: { inno?: number | string; intyp?: number | string; indati2m?: string };
          seller?: { id?: string; name?: string };
          buyer?: { id?: string; name?: string };
          goods?: { description?: string; quantity?: number; unitAmount?: number; vat?: number }[];
        };

        // ۱) nonce باید از GET /nonce گرفته شده و منقضی نشده باشد
        const nonce = typeof header.nonce === "string" ? header.nonce : "";
        if (!nonce) return err(400, "4101", "nonce missing — first call GET /nonce");
        const nonceExp = nonces.get(nonce);
        if (!nonceExp || nonceExp < Date.now()) {
          nonces.delete(nonce);
          return err(401, "4102", "nonce invalid or expired — request a fresh nonce");
        }

        // ۲) اعتبارسنجی آموزشی فیلدهای اصلی (هم‌شکل خطاهای سازمان)
        const fiscalId = String(header.fiscalId ?? "");
        if (!/^\d{11}$/.test(fiscalId)) return err(400, "4145", "fiscalId must be exactly 11 digits (شناسه ملی فروشنده)");
        const sellerId = String(payload.seller?.id ?? "");
        if (!/^\d{11}$/.test(sellerId)) return err(400, "4145", "seller.id must be exactly 11 digits");
        const goods = Array.isArray(payload.goods) ? payload.goods : [];
        if (goods.length === 0) return err(400, "4145", "goods array must not be empty");
        for (const g of goods) {
          if (!g.description || String(g.description).trim().length < 2) {
            return err(400, "4145", `goods[${goods.indexOf(g)}].description too short`);
          }
          const amt = Number(g.unitAmount ?? 0) * Number(g.quantity ?? 0);
          if (!(amt > 0)) return err(400, "4145", `goods[${goods.indexOf(g)}].unitAmount*quantity must be > 0`);
        }
        const intyp = Number(payload.header?.intyp ?? 1);
        if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(intyp)) {
          return err(400, "4145", "header.intyp must be 1..13 (نوع صورتحساب)");
        }

        // ۳) ثبت پکت (همان فرآیند async: PENDING → IN_PROGRESS → SUCCESS/FAILED)
        const uid = typeof header.requestTraceId === "string" && header.requestTraceId ? header.requestTraceId : crypto.randomUUID();
        const referenceNumber = crypto.randomUUID();
        packets.set(uid, {
          uid,
          referenceNumber,
          fiscalId,
          invoiceNumber: payload.header?.inno != null ? String(payload.header.inno) : null,
          receivedAt: Date.now(),
          errorSimulated: false, // پکت دمو عمداً بدون خطا — مسیر خطا از ابزار جداگانه تست می‌شود
          confirmationReferenceId: crypto.randomUUID(),
        });
        // nonce مصرف‌شدنی است — مثل سازمان یک‌بار استفاده می‌شود
        nonces.delete(nonce);
        return json({ result: [{ uid, referenceNumber }] });
      }

      // ============ GET /inquiry-demo (استعلام وضعیت پکت دمو — بدون Bearer) ============
      if (path === "/inquiry-demo" && req.method === "GET") {
        const uidList = url.searchParams.getAll("uidList");
        if (uidList.length === 0) return err(400, "4145", "uidList empty");
        if (uidList.length > 100) return err(400, "4141", "more than 100 uids in inquiry");
        const result = uidList.map((uid) => {
          const p = packets.get(uid);
          if (!p) {
            return { uid, referenceNumber: null, status: "FAILED", data: { confirmationReferenceId: null, success: false, error: [{ code: "404", message: "packet not found", errorType: "NOT_FOUND" }] } };
          }
          const st = packetStatus(p);
          return { uid: p.uid, referenceNumber: p.referenceNumber, status: st.status, data: st.data ?? null, packetType: "INVOICE.V1", fiscalId: p.fiscalId };
        });
        return json({ result });
      }

      // ============ POST /invoice (نیازمند احراز هویت) ============
      if (path === "/invoice" && req.method === "POST") {
        const auth = verifyBearer(req.headers.get("authorization"));
        if (!auth.ok) {
          return err(auth.status, auth.errorCode, auth.message);
        }
        const body = await req.json().catch(() => null);
        const packetsIn = Array.isArray(body) ? body : null;
        if (!packetsIn || packetsIn.length === 0) {
          return err(400, "4144", "empty/invalid request body");
        }
        if (packetsIn.length > 1000) {
          return err(400, "4143", "more than 1000 invoices in one request");
        }
        const result: { uid: string | null; referenceNumber: string | null; errorCode?: string; errorDetail?: string }[] = [];
        for (const pkt of packetsIn) {
          const header = pkt?.header ?? {};
          const payload = pkt?.payload;
          const uid = typeof header.requestTraceId === "string" && header.requestTraceId ? header.requestTraceId : null;
          const fiscalId = typeof header.fiscalId === "string" ? header.fiscalId : "";
          if (!payload || typeof payload !== "string") {
            result.push({ uid, referenceNumber: null, errorCode: "4145", errorDetail: "payload empty" });
            continue;
          }
          // رمزگشایی واقعی JWE — خطای ساختار = 04152 مثل سازمان
          const dec = decryptJwe(payload);
          let invoiceNumber: string | null = null;
          if (!dec.ok) {
            result.push({ uid, referenceNumber: null, errorCode: "04152", errorDetail: `JWE decrypt: ${dec.reason}` });
            continue;
          }
          // JWS داخلی را parse می‌کنیم فقط برای نمایش شماره فاکتور در استعلام
          try {
            const inner = dec.plaintext.split(".");
            const innerPayload = JSON.parse(Buffer.from(inner[1], "base64url").toString("utf8"));
            invoiceNumber = innerPayload?.header?.inno ?? null;
          } catch { /* غیربحرانی */ }
          const referenceNumber = crypto.randomUUID();
          packets.set(uid ?? crypto.randomUUID(), {
            uid: uid ?? crypto.randomUUID(),
            referenceNumber,
            fiscalId,
            invoiceNumber,
            receivedAt: Date.now(),
            errorSimulated: Math.random() < ERROR_RATE,
            confirmationReferenceId: crypto.randomUUID(),
          });
          result.push({ uid, referenceNumber });
        }
        return json({ result });
      }

      // ============ GET /inquiry-by-uid ============
      if (path === "/inquiry-by-uid" && req.method === "GET") {
        const auth = verifyBearer(req.headers.get("authorization"));
        if (!auth.ok) return err(auth.status, auth.errorCode, auth.message);
        const uidList = url.searchParams.getAll("uidList");
        if (uidList.length === 0) return err(400, "4145", "uidList empty");
        if (uidList.length > 100) return err(400, "4141", "more than 100 uids in inquiry");
        const result = uidList.map((uid) => {
          const p = packets.get(uid);
          if (!p) {
            return { uid, referenceNumber: null, status: "FAILED", data: { confirmationReferenceId: null, success: false, error: [{ code: "404", message: "packet not found", errorType: "NOT_FOUND" }] } };
          }
          const st = packetStatus(p);
          return { uid: p.uid, referenceNumber: p.referenceNumber, status: st.status, data: st.data ?? null, packetType: "INVOICE.V1", fiscalId: p.fiscalId };
        });
        return json({ result });
      }

      // ============ GET /inquiry (بازه زمانی) ============
      if (path === "/inquiry" && req.method === "GET") {
        const auth = verifyBearer(req.headers.get("authorization"));
        if (!auth.ok) return err(auth.status, auth.errorCode, auth.message);
        const start = url.searchParams.get("start");
        const end = url.searchParams.get("end");
        if (!start || !end) return err(400, "4140", "start/end required");
        const startMs = Date.parse(start);
        const endMs = Date.parse(end);
        if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
          return err(400, "4140", "invalid time range");
        }
        if (endMs - startMs > 7 * 24 * 3600 * 1000) return err(400, "4164", "range more than a week");
        const statusFilter = url.searchParams.get("status");
        const pageNumber = Math.max(1, Number(url.searchParams.get("pageNumber")) || 1);
        const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize")) || 50, 1), 100);
        const all = [...packets.values()]
          .filter((p) => p.receivedAt >= startMs && p.receivedAt <= endMs)
          .map((p) => {
            const st = packetStatus(p);
            return { uid: p.uid, referenceNumber: p.referenceNumber, status: st.status, data: st.data ?? null, packetType: "INVOICE.V1", fiscalId: p.fiscalId };
          })
          .filter((e) => !statusFilter || e.status === statusFilter);
        const page = all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
        return json({ result: page, totalCount: all.length, pageNumber, pageSize });
      }

      // ============ GET /taxpayer (استعلام مودیان با کد اقتصادی) ============
      if (path === "/taxpayer" && req.method === "GET") {
        const auth = verifyBearer(req.headers.get("authorization"));
        if (!auth.ok) return err(auth.status, auth.errorCode, auth.message);
        const economicCode = url.searchParams.get("economicCode") || "";
        if (!/^\d{11}$/.test(economicCode)) {
          return err(400, "4140", "economicCode must be 11 digits");
        }
        // شبیه‌سازی داده مودیان — الگوی پاسخ مطابق TaxPayer.php
        return json({
          economicCode,
          type: "LEGAL",
          status: "REGISTERED",
          name: `شبیه‌ساز — مودی ${economicCode}`,
          nationalId: economicCode,
          address: "تهران — خیابان شبیه‌سازی ۱",
          postalCode: "1234567890",
          city: "تهران",
          province: "تهران",
          phone: "02100000000",
          fax: null,
          email: null,
          registerDate: "14000101",
          ceaseDate: null,
          legalType: "COMPANY",
          activities: [{ activityCode: "10101", activityTitle: "فروش عمده" }],
          branch: null,
        });
      }

      // ============ GET /fiscal-information (اطلاعات حافظه) ============
      if (path === "/fiscal-information" && req.method === "GET") {
        const auth = verifyBearer(req.headers.get("authorization"));
        if (!auth.ok) return err(auth.status, auth.errorCode, auth.message);
        const memoryId = url.searchParams.get("memoryId") || "";
        if (!/^[A-Za-z0-9]{6}$/.test(memoryId)) {
          return err(400, "4140", "memoryId must be 6 alphanumeric chars");
        }
        return json({
          memoryId: memoryId.toUpperCase(),
          fiscalId: memoryId.toUpperCase(),
          status: "ACTIVE",
          taxpayer: { name: `حافظه ${memoryId.toUpperCase()}`, economicCode: "12345678901" },
          address: "تهران",
          city: "تهران",
          issuedInvoices: packets.size,
          totalAmount: [...packets.values()].length * 1000000,
          lastInvoiceDate: null,
        });
      }

      // ============ GET / — معرفی سرویس ============
      if (path === "" || path === "/") {
        return json({
          service: "modian-mock v2",
          port: PORT,
          endpoints: [
            "GET /nonce?timeToLive=10..200",
            "GET /server-information",
            "POST /invoice",
            "GET /inquiry-by-uid?uidList=&fiscalId=",
            "GET /inquiry?start=&end=&pageNumber=&pageSize=&status=",
            "GET /taxpayer?economicCode=",
            "GET /fiscal-information?memoryId=",
          ],
          packetsStored: packets.size,
          serverKeyId: SERVER_KEY_ID,
        });
      }

      return err(404, "404", `not found: ${req.method} ${path}`);
    } catch (e) {
      console.error("[modian-mock] error:", e);
      return err(500, "500", "internal mock error");
    }
  },
});

console.log(`[modian-mock v2] listening on :${PORT} — ready (nonce/JWS/JWE, inquiry, taxpayer, fiscal-info)`);
