#!/usr/bin/env node
/* ============================================================================
 * هوش — پل کارتخوان (Hoosh POS Bridge) — نسخهٔ ۲.۰
 * ============================================================================
 *
 * این فایل را روی «همان کامپیتری که نرم‌افزار هوش در مرورگرش باز است» اجرا کنید.
 * بدون هیچ نصب و اینترنتی کار می‌کند (فقط Node.js لازم است).
 *
 * ─── راه‌اندازی در ۳ قدم ───
 * ۱) Node.js را از nodejs.org نصب کنید (نسخهٔ ۱۸ یا بالاتر — LTS)
 * ۲) این فایل را ذخیره کنید و در CMD/PowerShell همین پوشه بزنید:
 *      node hoosh-pos-bridge.js
 * ۳) در هوش: تنظیمات کارتخوان → آدرس پل = http://127.0.0.1:9090 → «تست اتصال»
 *
 * ─── حالت‌ها (MODE) ───
 *   simulation (پیش‌فرض) — تست بدون کارتخوان واقعی: هر درخواست پرداخت
 *                          بعد از ~۴ ثانیه «پرداخت شد» برمی‌گرداند. برای
 *                          آموزش کارمند و تست گردش‌کار عالی است.
 *   manual               — مبلغ روی صفحهٔ همان کامپیوتر بزرگ نمایش داده
 *                          می‌شود؛ صندوقدار بعد از کشیدن کارت روی کارتخوانِ
 *                          عادی (سمت بانک) دکمهٔ تأیید را می‌زند.
 *   gateway              — اتصال به درگاه درون‌ساز PSP شما (به‌پرداخت ملت،
 *                          سامان‌کیش، آسان‌پرداخت، پاسارگاد و...). آدرس و
 *                          توکن را از پشتیبانی PSP بگیرید و متغیرهای
 *                          GATEWAY_URL و GATEWAY_TOKEN را ست کنید.
 *
 * ─── تغییر حالت ───
 *   ویندوز CMD:        set HOOSH_POS_MODE=manual   سپس node hoosh-pos-bridge.js
 *   ویندوز PowerShell: $env:HOOSH_POS_MODE="manual"
 *   لینوکس/مک:         HOOSH_POS_MODE=manual node hoosh-pos-bridge.js
 *
 * ─── اتصال کارتخوان به کامپیوتر (خلاصهٔ راهنما) ───
 *  ▸ کارتخوان‌های معمولی سم‌کارت: کابل USB/RS232 → درایور PSP → حالت manual
 *  ▸ کارتخوان هوشمند اندرویدی (تراستر/هایپر و...): اپ PSP + آی‌پی همان شبکه
 *    → HOOSH_BRIDGE_HOST=0.0.0.0 و از مرورگر: http://IP-کامپیوتر:9090
 *  ▸ درگاه درون‌ساز (POS API): برای فروشگاه‌های بزرگ — حالت gateway
 *    مستقیم با سرور PSP صحبت می‌کند و رسید دیجیتال برمی‌گرداند.
 * ============================================================================ */

"use strict";

const http = require("http");
const os = require("os");

/* ─── تنظیمات (با متغیر محیطی قابل تغییر) ─── */
const MODE = (process.env.HOOSH_POS_MODE || "simulation").toLowerCase(); // simulation | manual | gateway
const PORT = Number(process.env.HOOSH_POS_PORT || 9090);
const HOST = process.env.HOOSH_BRIDGE_HOST || "127.0.0.1"; // برای دسترسی از LAN: 0.0.0.0
const GATEWAY_URL = process.env.GATEWAY_URL || "";
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || "";
const ALLOWED_ORIGINS = (process.env.HOOSH_ALLOWED_ORIGINS || "*").split(",");

const VERSION = "hoosh-pos-bridge/2.0";

/* ─── ابزارها ─── */
function log(...args) {
  const t = new Date().toLocaleTimeString("fa-IR");
  console.log("[" + t + "]", ...args);
}

/** نمایش بزرگ مبلغ روی کنسول (حالت manual) */
function printBigAmount(rial) {
  const toman = Math.round(rial / 10);
  console.log("");
  console.log("  +========================================+");
  console.log("  |      مبلغ قابل پرداخت (تومان)          |");
  console.log("  |                                        |");
  console.log("  |      " + toman.toLocaleString("fa-IR").padStart(24) + "      |");
  console.log("  |                                        |");
  console.log("  +========================================+");
  console.log("  کارت را بکشید، رمز را بزنید، سپس یکی از کلیدها:");
  console.log("     y = پرداخت شد        n = پرداخت ناموفق        t = انصراف مشتری");
  console.log("");
}

/** پاسخ CORS + JSON */
function jsonResponse(res, status, obj, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}

/** خواندن بدنهٔ درخواست */
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy(); // > 1MB -> قطع
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/* ─── حالت manual: انتظار برای y/n/t روی کیبورد ─── */
function waitForManualDecision(timeoutMs) {
  return new Promise((resolve) => {
    const keys = {
      y: { ok: true, status: "paid" },
      n: { ok: false, status: "failed", message: "پرداخت ناموفق بود" },
      t: { ok: false, status: "failed", message: "مشتری انصراف داد" },
    };
    const onKey = (ch) => {
      const key = String(ch.key || ch).toLowerCase();
      if (keys[key]) {
        cleanup();
        resolve(keys[key]);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, status: "timeout", message: "مهلت پاسخ صندوقدار تمام شد" });
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      process.stdin.removeListener("data", onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    }
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onKey);
  });
}

/* ─── حالت simulation: شبیه‌سازی کارتخوان ─── */
function simulateCharge(amountRial, invoiceNumber) {
  return new Promise((resolve) => {
 log("حالت آزمایشی:مبلغ"+ (amountRial / 10).toLocaleString("fa-IR") +"تومان — فاکتور"+ invoiceNumber);
    log("   (شبیه‌سازی کشیدن کارت... ۴ ثانیه صبر کنید)");
    setTimeout(() => {
      resolve({
        ok: true,
        status: "paid",
        reference: "SIM-" + Date.now().toString(36).toUpperCase(),
        message: "پرداخت آزمایشی موفق (حالت simulation)",
      });
    }, 4000);
  });
}

/* ─── حالت gateway: فرستادن به درگاه درون‌ساز PSP ─── */
async function gatewayCharge(amountRial, invoiceNumber, terminalId) {
  if (!GATEWAY_URL || !GATEWAY_TOKEN) {
    return {
      ok: false,
      status: "failed",
      message:
        "GATEWAY_URL / GATEWAY_TOKEN تنظیم نشده — از پشتیبانی PSP خود (به‌پرداخت/سامان/آسان‌پرداخت/پاسارگاد) آدرس و توکن درگاه درون‌ساز را بگیرید",
    };
  }
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + GATEWAY_TOKEN },
      body: JSON.stringify({ amount: amountRial, invoiceNumber: invoiceNumber, terminalId: terminalId }),
      signal: AbortSignal.timeout(60000),
    });
    const json = await res.json().catch(() => ({}));
    return {
      ok: res.ok && json.ok !== false,
      status: String(json.status || (res.ok ? "paid" : "failed")),
      reference: json.reference || json.rrn || undefined,
      message: json.message,
    };
  } catch (err) {
    return { ok: false, status: "failed", message: "خطای ارتباط با درگاه درون‌ساز: " + err.message };
  }
}

/* ─── سرور ─── */
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || ALLOWED_ORIGINS[0];
  const allowed =
    ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin) ? origin || "*" : null;

  // OPTIONS (preflight CORS)
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": allowed || ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }
  if (!allowed) {
    return jsonResponse(res, 403, { ok: false, message: "origin مجاز نیست" }, origin);
  }

  // GET /health
  if (req.method === "GET" && req.url.startsWith("/health")) {
    return jsonResponse(
      res,
      200,
      { ok: true, version: VERSION, mode: MODE, host: HOST, port: PORT },
      origin
    );
  }

  // POST /charge
  if (req.method === "POST" && req.url.startsWith("/charge")) {
    const body = await readBody(req);
    const amountRial = Number(body.amountRial || 0);
    const invoiceNumber = String(body.invoiceNumber || "");
    const terminalId = String(body.terminalId || "");
    const timeoutMs = Math.min(Number(body.timeoutMs || 45000), 120000);

    if (!Number.isFinite(amountRial) || amountRial < 1000) {
      return jsonResponse(res, 400, { ok: false, status: "failed", message: "مبلغ نامعتبر است" }, origin);
    }

 log("درخواست شارژ:"+ (amountRial / 10).toLocaleString("fa-IR") +"تومان — فاکتور"+ invoiceNumber +"— حالت"+ MODE);

    let result;
    try {
      if (MODE === "simulation") result = await simulateCharge(amountRial, invoiceNumber);
      else if (MODE === "manual") {
        printBigAmount(amountRial);
        result = await waitForManualDecision(timeoutMs);
      } else if (MODE === "gateway") {
        result = await gatewayCharge(amountRial, invoiceNumber, terminalId);
      } else {
        result = { ok: false, status: "failed", message: "حالت ناشناخته: " + MODE };
      }
    } catch (err) {
      result = { ok: false, status: "failed", message: "خطای پل: " + err.message };
    }

 log(result.ok ?"✓ نتیجه:پرداخت شد":"✗ نتیجه:"+ result.status +"—"+ (result.message ||""));
    return jsonResponse(res, 200, result, origin);
  }

  // POST /cancel — لغو درخواست در حال انتظار (حالت manual)
  if (req.method === "POST" && req.url.startsWith("/cancel")) {
    return jsonResponse(res, 200, { ok: true, message: "درخواست لغو ثبت شد" }, origin);
  }

  jsonResponse(res, 404, { ok: false, message: "مسیر یافت نشد" }, origin);
});

server.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) lanIps.push(net.address);
    }
  }
  console.log("============================================================");
  console.log("   پل کارتخوان هوش — Hoosh POS Bridge v2.0");
  console.log("============================================================");
  console.log("   حالت اجرا:      " + MODE);
  console.log("   آدرس محلی:      http://127.0.0.1:" + PORT);
  if (lanIps.length) {
    console.log("   آدرس شبکه:      http://" + lanIps[0] + ":" + PORT + "  (برای کارتخوان/دستگاه دیگر در همان شبکه)");
  }
  console.log("   سلامت:          http://127.0.0.1:" + PORT + "/health");
  console.log("");
  console.log("   ▸ در نرم‌افزار هوش: تنظیمات کارتخوان → آدرس پل را");
  console.log("     http://127.0.0.1:" + PORT + " وارد کنید و «تست اتصال» بزنید.");
  if (MODE === "simulation") {
    console.log("   ▸ حالت آزمایشی فعال است — پرداخت‌ها واقعی نیستند.");
    console.log("     برای اتصال واقعی، مستندات داخل فایل را بخوانید (MODE).");
  }
  console.log("   ▸ برای توقف: Ctrl+C");
  console.log("============================================================");
  console.log("   در انتظار درخواست‌های هوش...");
});

process.on("SIGINT", () => {
  console.log("\nپل کارتخوان متوقف شد.");
  process.exit(0);
});
