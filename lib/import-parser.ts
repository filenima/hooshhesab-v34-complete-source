/* ============================================================
 * پارسر ایمپورت هوش — lib/import-parser.ts
 * ============================================================
 * ماژول «بدون وابستگی سروری» (client-safe) برای خواندن فایل‌های
 * درون‌ریزی از نرم‌افزارهای حسابداری ایرانی (هلو / سپیدار / محک):
 *
 *  ۱) تشخیص انکودینگ واقعی فایل:
 *     - BOM (UTF-8 / UTF-16LE / UTF-16BE) → دیکد مطابق BOM
 *     - تلاش UTF-8 سخت‌گیر (fatal) + heuristic ضد-موجیبک
 *     - fallback: Windows-1256 (جدول دستی — خروجی واقعی هلو/سپیدار)
 *     (فایل واقعی مالک: ۱۲۹۸ خط، Windows-1256، بایت اول d1 cf ed dd)
 *
 *  ۲) تشخیص خودکار جداکننده (, ; \t |) از خطوط اول فایل
 *
 *  ۳) پارسر RFC4180 کامل (کوتیشن، کوتیشن داخل کوتیشن، چندخطی)
 *
 *  ۴) «بازچینش قیمت‌های شکسته» (CRITICAL):
 *     هلو/سپیدار قیمت‌ها را با جداکننده هزارگانِ بی‌کوتیشن خروجی
 *     می‌گیرد؛ یعنی ۲,۳۹۰,۰۰۰ در سه سلول «2»,«390»,«000» می‌نشیند و
 *     split ساده همه ستون‌های بعدی را جابه‌جا می‌کند. الگوریتم:
 *     قدم‌زدن روی ستون‌های هدر با «نوع» هر ستون (قیمتی/تعدادی/درصدی/متنی)؛
 *     ستون قیمتی سلول‌های بعدیِ دقیقاً ۳رقمی (^\d{3}$) را جذب و الحاق
 *     می‌کند. چون ممکن است چند ستون قیمتیِ «مجاور» هرکدام شکسته باشند
 *     (مثل «في فروش» و «آخرين في خريد»)، تخصیص گروه‌ها با backtracking
 *     حل می‌شود با این قیودها:
 *       - هر ستون دقیقاً ≥۱ سلول مصرف می‌کند (جمع سلول‌ها دقیقاً تراز)
 *       - سلول اولِ قیمت نباید صفرِ پیشرو داشته باشد («0» تنها مجاز است؛
 *         «000» فقط می‌تواند ادامهٔ گروه باشد)
 *       - ترجیح: بیشترین جذب در ستون قیمتیِ زودتر (قیمت‌های ایرانی
 *         معمولاً هزارگانِ گرد هستند: 2,390,000 نه 2 + 390,000,900)
 *     اگر هیچ تخصیص معتبری پیدا نشد → fallback جذب حریصانه با سقف
 *     budget (سلول اضافه) و رهاکردن سلول‌های انتهایی اضافه.
 *
 * این فایل نباید هیچ import سروری داشته باشد (در /tmp/test-import-parse.mjs
 * با bun مستقیم import می‌شود و در کلاینت Next.js هم استفاده می‌شود).
 * ============================================================ */

/* ---------- ۱) جدول Windows-1256 (بایت 0x80..0xFF → یونیکد) ----------
 * جدول رسمی WHATWG/Unicode برای windows-1256 — به‌صورت رشتهٔ ۱۲۸کاراکتری.
 * جدول دستی لازم است چون TextDecoder('windows-1256') در همهٔ runtimeها
 * موجود نیست (مثلاً Bun آن را ندارد). */
const CP1256_HIGH =
  "\u20AC\u067E\u201A\u0192\u201E\u2026\u2020\u2021" +
  "\u02C6\u2030\u0679\u2039\u0152\u0686\u0698\u0688" +
  "\u06AF\u2018\u2019\u201C\u201D\u2022\u2013\u2014" +
  "\u06A9\u2122\u0691\u203A\u0153\u200C\u200D\u06BA" +
  "\u00A0\u060C\u00A2\u00A3\u00A4\u00A5\u00A6\u00A7" +
  "\u00A8\u00A9\u06BE\u00AB\u00AC\u00AD\u00AE\u00AF" +
  "\u00B0\u00B1\u00B2\u00B3\u00B4\u00B5\u00B6\u00B7" +
  "\u00B8\u00B9\u061B\u00BB\u00BC\u00BD\u00BE\u061F" +
  "\u06C1\u0621\u0622\u0623\u0624\u0625\u0626\u0627" +
  "\u0628\u0629\u062A\u062B\u062C\u062D\u062E\u062F" +
  "\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u00D7" +
  "\u0637\u0638\u0639\u063A\u0640\u0641\u0642\u0643" +
  "\u00E0\u0644\u00E2\u0645\u0646\u0647\u0648\u00E7" +
  "\u00E8\u00E9\u00EA\u00EB\u0649\u064A\u00EE\u00EF" +
  "\u064B\u064C\u064D\u064E\u00F4\u064F\u0650\u00F7" +
  "\u0651\u00F9\u0652\u00FB\u00FC\u200E\u200F\u06D2";

/** دیکد دستی بایت‌های Windows-1256 (سرعت: جدول از پیش ساخته می‌شود) */
const CP1256_MAP: string[] = (() => {
  const arr: string[] = new Array(256);
  for (let b = 0; b < 0x80; b++) arr[b] = String.fromCharCode(b);
  for (let b = 0x80; b <= 0xff; b++) arr[b] = CP1256_HIGH.charAt(b - 0x80);
  return arr;
})();

export function decodeWindows1256(bytes: Uint8Array): string {
  let out = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    let part = "";
    for (let j = 0; j < slice.length; j++) part += CP1256_MAP[slice[j]];
    out += part;
  }
  return out;
}

/** دیکد دستی UTF-16LE/BE (بدون وابستگی به TextDecoder) */
export function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = littleEndian
      ? bytes[i] | (bytes[i + 1] << 8)
      : (bytes[i] << 8) | bytes[i + 1];
    out += String.fromCharCode(code);
  }
  return out;
}

/** UTF-8 سخت‌گیر — اگر بایت نامعتبر بود throw می‌کند (بدون جایگزینی خاموش) */
export function decodeUtf8Strict(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i++;
      continue;
    }
    let len = 0;
    let cp = 0;
    if (b >= 0xc2 && b <= 0xdf) {
      len = 2;
      cp = b & 0x1f;
    } else if (b >= 0xe0 && b <= 0xef) {
      len = 3;
      cp = b & 0x0f;
    } else if (b >= 0xf0 && b <= 0xf4) {
      len = 4;
      cp = b & 0x07;
    } else {
      throw new Error(`invalid-utf8:${b.toString(16)}`);
    }
    if (i + len > n) throw new Error("invalid-utf8:truncated");
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k];
      if ((c & 0xc0) !== 0x80) throw new Error("invalid-utf8:continuation");
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      throw new Error("invalid-utf8:codepoint");
    }
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

/**
 * heuristic ضد-موجیبک: متن cp1256 که به‌زور با UTF-8 دیکد شود،
 * کاراکترهای «سریانی/عربی گسترش‌یافته» (U+0700–U+077F) تولید می‌کند که
 * در متن فارسی واقعی هرگز حضور ندارند. اگر یافت شد → UTF-8 رد می‌شود.
 */
function looksLikeUtf8Mojibake(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x0700 && c <= 0x077f) return true;
  }
  return false;
}

export interface DecodedText {
  text: string;
  /** نام انکودینگ تشخیص‌داده‌شده (برای نمایش در UI) */
  encoding: "utf-8" | "utf-8bom" | "utf-16le" | "utf-16be" | "windows-1256";
}

/**
 * تشخیص انکودینگ و دیکد نهایی یک بافر فایل:
 * ۱) BOM → utf-8 / utf-16le / utf-16be
 * ۲) UTF-8 سخت‌گیر (+ heuristic) — فایل‌های سالم UTF-8 اینجا برمی‌گردند
 * ۳) Windows-1256 — خروجی واقعی هلو/سپیدار/اکسل فارسی (بدون BOM)
 */
export function decodeBuffer(buf: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // --- BOM ها ---
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decodeUtf8Strict(bytes.subarray(3)), encoding: "utf-8bom" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decodeUtf16(bytes.subarray(2), true), encoding: "utf-16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeUtf16(bytes.subarray(2), false), encoding: "utf-16be" };
  }
  // --- UTF-8 سخت‌گیر ---
  try {
    const text = decodeUtf8Strict(bytes);
    if (!looksLikeUtf8Mojibake(text)) return { text, encoding: "utf-8" };
  } catch {
    /* UTF-8 نبود — ادامه به cp1256 */
  }
  // --- Windows-1256 ---
  return { text: decodeWindows1256(bytes), encoding: "windows-1256" };
}

/* ---------- ۲) تشخیص جداکننده ---------- */

const DELIMITER_CANDIDATES = [",", ";", "\t", "|"] as const;

/** شمارش جداکننده‌های کاندید در ۱۵ خط اول و انتخاب پرتکرارترین */
export function detectDelimiter(text: string): string {
  const sampleLines = text.split(/\r?\n/).slice(0, 15);
  let best = ",";
  let bestCount = -1;
  for (const d of DELIMITER_CANDIDATES) {
    let count = 0;
    for (const line of sampleLines) {
      for (const ch of line) if (ch === d) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return bestCount <= 0 ? "," : best;
}

/* ---------- ۳) پارسر RFC4180 ---------- */

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** پارسر CSV با پشتیبانی کامل کوتیشن، کوتیشن داخل کوتیشن، فیلدهای چندخطی */
export function parseCsvMatrix(text: string, delimiter?: string): string[][] {
  const clean = stripBom(text);
  const delim = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < clean.length) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // حذف ردیف‌های کاملاً خالی
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* ---------- ۴) نرمال‌سازی هدر (ي/ك عربی → فارسی) ---------- */

/**
 * نرمال‌سازی هدر برای مقایسه — همان منطق سرور (app/api/import):
 * حذف ZWNJ/RLE-PDF/کشیده/فاصله/زیرخط/خط تیره + ي→ی + ك→ک + أإآ→ا + lowercase.
 * خروجی نرم‌افزارهای ایرانی اغلب «ي/ك» عربی دارند («رديف,نام كالا,في فروش»).
 */
export function normalizeHeaderKey(key: string): string {
  return key
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/[\s_\-.\u0640]/g, "")
    .replace(/\u064a/g, "\u06cc") // ي عربی → ی فارسی
    .replace(/\u0643/g, "\u06a9") // ك عربی → ک فارسی
    .replace(/[\u0623\u0625\u0622]/g, "\u0627") // أ إ آ → ا
    .toLowerCase()
    .trim();
}

/* ---------- ۵) معناشناسی ستون‌های خروجی هلو/سپیدار ---------- */

export type ColumnKind = "price" | "qty" | "percent" | "text" | "ignore";

export interface HeaderSemantic {
  /** فیلد هدف (برای مستندسازی/تست) */
  field: string;
  kind: ColumnKind;
}

/**
 * هدرهای خام (همان‌طور که در فایل ظاهر می‌شوند — با ي/ك عربی یا فارسی،
 * فرقی نمی‌کند) → معناشناسی. کلیدها در زمان لود با normalizeHeaderKey
 * نرمال می‌شوند تا خطای دستیِ نسخهٔ نرمال‌شده ممکن نباشد.
 */
const RAW_HEADER_SEMANTICS: Array<[string, HeaderSemantic]> = [
  // --- ردیف و گروه‌ها ---
  ["رديف", { field: "rowNo", kind: "ignore" }],
  ["گروه اصلي", { field: "categoryMain", kind: "text" }],
  ["گروه فرعي", { field: "categorySub", kind: "text" }],
  ["گروه اصلی", { field: "categoryMain", kind: "text" }],
  ["گروه فرعی", { field: "categorySub", kind: "text" }],
  ["زیرگروه", { field: "categorySub", kind: "text" }],
  ["گروه کالا", { field: "category", kind: "text" }],
  ["گروه جنس", { field: "category", kind: "text" }],
  // --- نام/شرح (هلو/سپیدار/محک/محکابک/پارسیان) ---
  ["نام كالا", { field: "name", kind: "text" }],
  ["نام کالا", { field: "name", kind: "text" }],
  ["شرح کالا", { field: "name", kind: "text" }],
  ["شرح", { field: "name", kind: "text" }],
  ["نام جنس", { field: "name", kind: "text" }],
  ["شرح جنس", { field: "name", kind: "text" }],
  ["نام كالا/خدمت", { field: "name", kind: "text" }],
  ["نام کالا/خدمت", { field: "name", kind: "text" }],
  ["نام محصول", { field: "name", kind: "text" }],
  ["عنوان", { field: "name", kind: "text" }],
  ["name", { field: "name", kind: "text" }],
  ["title", { field: "name", kind: "text" }],
  // --- کد/شناسه (تک‌سلولی — هرگز جذب نمی‌شود) ---
  ["كد كالا", { field: "sku", kind: "text" }],
  ["کد کالا", { field: "sku", kind: "text" }],
  ["کد جنس", { field: "sku", kind: "text" }],
  ["کد کالا/خدمت", { field: "sku", kind: "text" }],
  ["شناسه کالا", { field: "sku", kind: "text" }],
  ["شناسه", { field: "sku", kind: "text" }],
  ["کد", { field: "sku", kind: "text" }],
  ["شماره کالا", { field: "sku", kind: "text" }],
  ["sku", { field: "sku", kind: "text" }],
  ["code", { field: "sku", kind: "text" }],
  // --- بارکد (تک‌سلولی — رقم‌های طولانی نباید جذب قیمت شوند) ---
  ["باركد", { field: "barcode", kind: "text" }],
  ["بارکد", { field: "barcode", kind: "text" }],
  ["کد بارکد", { field: "barcode", kind: "text" }],
  ["barcode", { field: "barcode", kind: "text" }],
  // --- موجودی/تعداد (تک‌مقداری — هرگز جذب نمی‌شود) ---
  ["موجودي", { field: "stock", kind: "qty" }],
  ["موجودی", { field: "stock", kind: "qty" }],
  ["تعداد", { field: "stock", kind: "qty" }],
  ["كميت", { field: "stock", kind: "qty" }],
  ["مقدار", { field: "stock", kind: "qty" }],
  ["موجودی انبار", { field: "stock", kind: "qty" }],
  ["موجودی کل", { field: "stock", kind: "qty" }],
  ["موجودی فعلی", { field: "stock", kind: "qty" }],
  ["باقیمانده", { field: "stock", kind: "qty" }],
  ["قابل فروش", { field: "stock", kind: "qty" }],
  ["stock", { field: "stock", kind: "qty" }],
  ["quantity", { field: "stock", kind: "qty" }],
  ["qty", { field: "stock", kind: "qty" }],
  // --- قیمت‌ها (جذب گروه‌های ۳رقمی) ---
  ["ميانگين خريد", { field: "purchasePriceAvg", kind: "price" }],
  ["میانگین خرید", { field: "purchasePriceAvg", kind: "price" }],
  ["بهای میانگین", { field: "purchasePriceAvg", kind: "price" }],
  ["آخرين في خريد", { field: "purchasePriceLast", kind: "price" }],
  ["آخرین فی خرید", { field: "purchasePriceLast", kind: "price" }],
  ["آخرين نرخ خريد", { field: "purchasePriceLast", kind: "price" }],
  ["آخرین قیمت خرید", { field: "purchasePriceLast", kind: "price" }],
  ["قیمت خرید", { field: "purchasePrice", kind: "price" }],
  ["نرخ خرید", { field: "purchasePrice", kind: "price" }],
  ["بهای خرید", { field: "purchasePrice", kind: "price" }],
  ["فی خرید", { field: "purchasePrice", kind: "price" }],
  ["بهای تمام‌شده", { field: "purchasePrice", kind: "price" }],
  ["في فروش", { field: "salePrice", kind: "price" }],
  ["فی فروش", { field: "salePrice", kind: "price" }],
  ["فی", { field: "salePrice", kind: "price" }],
  ["نرخ فروش", { field: "salePrice", kind: "price" }],
  ["قیمت فروش", { field: "salePrice", kind: "price" }],
  ["قیمت", { field: "salePrice", kind: "price" }],
  ["مبلغ واحد", { field: "salePrice", kind: "price" }],
  ["مبلغ واحد فروش", { field: "salePrice", kind: "price" }],
  ["مبلغ فروش", { field: "salePrice", kind: "price" }],
  ["قیمت واحد فروش", { field: "salePrice", kind: "price" }],
  ["قیمت نهایی", { field: "salePrice", kind: "price" }],
  ["قیمت عمده", { field: "wholesalePrice", kind: "price" }],
  ["نرخ عمده", { field: "wholesalePrice", kind: "price" }],
  ["قیمت همکار", { field: "wholesalePrice", kind: "price" }],
  ["price", { field: "salePrice", kind: "price" }],
  ["saleprice", { field: "salePrice", kind: "price" }],
  ["unitprice", { field: "salePrice", kind: "price" }],
  ["cost", { field: "purchasePrice", kind: "price" }],
  ["purchaseprice", { field: "purchasePrice", kind: "price" }],
  // --- متن ---
  ["توضيحات", { field: "description", kind: "text" }],
  ["توضیحات", { field: "description", kind: "text" }],
  ["ملاحظات", { field: "description", kind: "text" }],
  ["description", { field: "description", kind: "text" }],
  // --- درصد (تک‌مقداری) ---
  ["درصد تخفيف", { field: "ignore", kind: "percent" }],
  ["درصد تخفیف", { field: "ignore", kind: "percent" }],
  // --- واحد ---
  ["واحد هاي کالا", { field: "unit", kind: "text" }],
  ["واحد های کالا", { field: "unit", kind: "text" }],
  ["واحد شمارش", { field: "unit", kind: "text" }],
  ["واحد كالا", { field: "unit", kind: "text" }],
  ["واحد کالا", { field: "unit", kind: "text" }],
  ["واحد اصلی", { field: "unit", kind: "text" }],
  ["واحد", { field: "unit", kind: "text" }],
  ["unit", { field: "unit", kind: "text" }],
  // --- ستون‌های بی‌اثر (نادیده گرفته می‌شوند) ---
  ["موجودي با احتساب پيش فاکتور", { field: "ignore", kind: "ignore" }],
  ["موجودی با احتساب پیش فاکتور", { field: "ignore", kind: "ignore" }],
  ["آخرين تاريخ تغيير قيمت فروش", { field: "ignore", kind: "ignore" }],
  ["آخرین تاریخ تغییر قیمت فروش", { field: "ignore", kind: "ignore" }],
  ["واریانس", { field: "ignore", kind: "ignore" }],
  ["نقطه سفارش", { field: "ignore", kind: "ignore" }],
  ["حداقل موجودی", { field: "ignore", kind: "ignore" }],
  ["ساخت", { field: "ignore", kind: "ignore" }],
  ["کشور سازنده", { field: "ignore", kind: "ignore" }],
  ["برند", { field: "ignore", kind: "ignore" }],
  // --- مشتریان (برای تشخیص هدر/جانک در فایل‌های طرف‌حساب) ---
  ["نام مشتری", { field: "name", kind: "text" }],
  ["نام طرف‌حساب", { field: "name", kind: "text" }],
  ["حساب", { field: "name", kind: "text" }],
  ["کد مشتری", { field: "sku", kind: "text" }],
  ["کد حساب", { field: "sku", kind: "text" }],
  ["کد ملی", { field: "ignore", kind: "text" }],
  ["شناسه ملی", { field: "ignore", kind: "text" }],
  ["موبایل", { field: "ignore", kind: "text" }],
  ["همراه", { field: "ignore", kind: "text" }],
  ["تلفن", { field: "ignore", kind: "text" }],
  ["ایمیل", { field: "ignore", kind: "text" }],
  ["آدرس", { field: "ignore", kind: "text" }],
  // --- فاکتورها ---
  ["شماره فاکتور", { field: "sku", kind: "text" }],
  ["شماره سند", { field: "sku", kind: "text" }],
  ["شماره", { field: "sku", kind: "text" }],
  ["تاریخ فاکتور", { field: "ignore", kind: "text" }],
  ["تاریخ سند", { field: "ignore", kind: "text" }],
  ["تاریخ", { field: "ignore", kind: "text" }],
  ["مبلغ کل", { field: "salePrice", kind: "price" }],
  ["جمع کل", { field: "salePrice", kind: "price" }],
  ["مبلغ", { field: "salePrice", kind: "price" }],
  ["اقلام", { field: "ignore", kind: "text" }],
];

/** نقشهٔ نرمال‌شده — یک‌بار در زمان لود ساخته می‌شود */
export const HEADER_SEMANTICS: Record<string, HeaderSemantic> = (() => {
  const map: Record<string, HeaderSemantic> = {};
  for (const [raw, sem] of RAW_HEADER_SEMANTICS) {
    const nk = normalizeHeaderKey(raw);
    if (nk && !(nk in map)) map[nk] = sem;
  }
  return map;
})();

/** نوع یک هدر فایل — پیش‌فرض: text (بدون جذب سلول) */
export function headerKind(header: string): ColumnKind {
  return HEADER_SEMANTICS[normalizeHeaderKey(header)]?.kind ?? "text";
}

/** فیلد معنایی یک هدر (برای تست‌ها/دیباگ) */
export function headerField(header: string): string | undefined {
  return HEADER_SEMANTICS[normalizeHeaderKey(header)]?.field;
}

/* ---------- ۵-الف) دیکشنری گستردهٔ فیلدها (Task 2-a) ----------
 * فیلدهای قابل نگاشت هر موجودیت + نام‌های مترادف (alias) در فایل‌های
 * خروجی هلو/سپیدار/محک/محکابک/پارسیان/لیوا/اکسل فارسی + انگلیسی.
 * از این دیکشنری هم autoDetectMapping (تطبیق هدر) و هم ساخت قالب
 * دانلود استفاده می‌شود — منبع یگانهٔ حقیقت برای کلاینت و تست‌ها.
 * (قبلاً در components/modules/data-import-export.tsx بود؛ منتقل شد تا
 * در /tmp با bun مستقیم قابل تست باشد و bulk-import هم از آن استفاده کند.) */

export type ImportEntityKind = "products" | "customers" | "invoices";

export interface FieldDef {
  /** کلید فیلد API */
  key: string;
  /** نام فارسی برای نمایش */
  label: string;
  required?: boolean;
  /** فیلد مخفی: خودکار نگاشت می‌شود ولی در گرید نگاشت نمایش داده نمی‌شود */
  hidden?: boolean;
  /** هدرهایی که در فایل‌های خروجی نرم‌افزارهای حسابداری با این فیلد مطابقت دارند — به ترتیب اولویت */
  aliases: string[];
}

const PRODUCT_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "نام کالا",
    required: true,
    aliases: [
      "نام کالا", "نام کل", "شرح کالا", "شرح", "عنوان", "کالنامه", "نام جنس", "شرح جنس",
      "نام کالا/خدمت", "شرح کالا/خدمت", "نام محصول", "کالا", "جنس",
      "کالا/خدمت", "کالا و خدمات", "نام کالا و خدمات", "شرح کالا و خدمات",
      "نام کالا (فارسی)", "مشخصات کالا", "شرح کلی",
      "name", "title", "product name", "product", "item name", "item", "itemname",
      "description", "particulars", "product title", "goods name",
    ],
  },
  {
    key: "sku",
    label: "کد کالا",
    aliases: [
      "کد کالا", "کد", "شناسه کالا", "کد شناسایی", "کد یکتا", "کد جنس", "شماره کالا",
      "کد کالا/خدمت", "کد محصول", "کد فنی", "شناسه", "شماره شناسایی",
      "شناسه کالا/خدمت", "کد کالا و خدمات", "شماره کالای کد",
      "sku", "code", "id", "product code", "item code", "part number", "partnumber",
      "part no", "partno", "item no", "itemno", "item number", "itemnumber", "product id",
      "productid", "کد ترازنامه‌ای",
    ],
  },
  {
    key: "stock",
    label: "موجودی",
    aliases: [
      "موجودی", "موجودي", "تعداد", "کمیت", "مقدار", "موجودی انبار", "موجودی موجود",
      "موجودی کل", "تعداد موجود", "موجودی فعلی", "باقیمانده", "قابل فروش",
      "موجودی کلی", "تعداد موجودی", "موجودی انبارها", "موجودی کل انبار", "موجودی قابل فروش",
      "موجودی انبار اصلی", "تعداد در انبار", "مانده کالا", "موجودي فعلي",
      "stock", "quantity", "qty", "on hand", "onhand", "on-hand", "inventory", "instock",
      "in stock", "balance", "qty on hand", "qtyonhand", "qoh", "available", "available qty",
    ],
  },
  {
    key: "unit",
    label: "واحد",
    aliases: [
      "واحد شمارش", "واحد", "واحد کالا", "واحد های کالا", "واحد اصلی", "واحد کالا/خدمت",
      "آیتم", "واحدهای اندازه‌گیری", "نوع واحد", "واحد اندازه‌گیری", "واحد اندازه گیری",
      "واحد سنجش", "واحد شمارش کالا", "واحد اندازه‌گیری کالا", "واحد کالای فروش",
      "unit", "uom", "u.o.m", "unit of measure", "measure", "measurement", "measurement unit",
    ],
  },
  // ترتیب alias ها اولویت است: فی فروش > قیمت فروش > قیمت واحد
  {
    key: "salePrice",
    label: "قیمت فروش",
    aliases: [
      "فی فروش", "في فروش", "فی", "قیمت فروش", "قیمت", "نرخ فروش", "فروش",
      "قیمت واحد فروش", "مبلغ واحد فروش", "مبلغ واحد", "فی فروش (ریال)", "قیمت مصرف‌کننده",
      "قیمت پخش", "نرخ", "مبلغ فروش", "قیمت نهایی", "قیمت روز",
      "قیمت خرده‌فروشی", "قیمت خرده فروشی", "نرخ خرده فروشی", "قیمت واحد", "فی واحد",
      "قیمت فروش ریال", "قیمت مصرف کننده", "قیمت مصرف‌کننده نهایی", "متر فروش",
      "saleprice", "price", "sale price", "sale", "unit price", "unitprice", "retail price",
      "selling price", "sales price", "sell price", "list price", "sprice", "price1",
    ],
  },
  {
    key: "purchasePrice",
    label: "قیمت خرید",
    aliases: [
      "قیمت خرید", "نرخ خرید", "بهای خرید", "قیمت واحد خرید", "فی خرید", "مبلغ خرید",
      "آخرین فی خرید", "آخرین نرخ خرید", "بهای تمام‌شده", "بهای تمام شده",
      "قیمت تمام‌شده", "قیمت تمام شده", "قیمت خرید ریال", "بهای واقعی", "فی خرید (ریال)",
      "purchaseprice", "cost", "buy price", "purchase price", "last cost", "costprice",
      "cost price", "buying price", "purchase rate",
    ],
  },
  {
    key: "category",
    label: "دسته‌بندی",
    aliases: [
      "دسته‌بندی", "گروه کالا", "گروه", "دسته", "گروه جنس", "مجموعه", "دسته کالا",
      "گروه‌بندی", "گروه بندی", "طبقه‌بندی", "طبقه", "سرفصل", "گروه کالایی", "دسته‌بندی کالا",
      "category", "group", "product group", "department", "product category",
    ],
  },
  {
    key: "barcode",
    label: "بارکد",
    aliases: [
      "بارکد", "کد بارکد", "باركد", "بارکد کالا", "شماره بارکد",
      "barcode", "gtin", "ean", "ean13", "upc", "کد جهانی کالا", "شماره بین‌المللی کالا",
    ],
  },
  {
    key: "description",
    label: "توضیحات",
    aliases: [
      "توضیحات", "ملاحظات", "یادداشت", "شرح توضیحات", "توضیحات کالا", "توضیح", "ملاحظه",
      "description", "notes", "note", "remark", "remarks", "comment", "comments",
    ],
  },
  // --- فیلدهای مخفی (خودکار نگاشت می‌شوند؛ در گرید نمایش داده نمی‌شوند) ---
  {
    key: "purchasePriceAvg",
    label: "میانگین خرید",
    hidden: true,
    aliases: [
      "میانگین خرید", "ميانگين خريد", "میانگین خرید کالا", "بهای میانگین", "متوسط خرید",
      "میانگین قیمت خرید", "میانگین قیمت", "متوسط بهای تمام‌شده",
      "average purchase", "avg cost", "average cost", "avgcost", "averageprice",
    ],
  },
  {
    key: "purchasePriceLast",
    label: "آخرین فی خرید",
    hidden: true,
    aliases: [
      "آخرین فی خرید", "آخرين في خريد", "آخرین نرخ خرید", "آخرین قیمت خرید",
      "آخرین قیمت خرید کالا", "قیمت آخرین خرید", "آخرین بهای خرید",
      "last purchase price", "lastpurchaseprice", "last cost",
    ],
  },
  {
    key: "wholesalePrice",
    label: "قیمت عمده",
    hidden: true,
    aliases: [
      "قیمت عمده", "نرخ عمده", "فی عمده", "قیمت همکار", "قیمت همکارها", "نرخ همکار",
      "قیمت عمده‌فروشی", "قیمت عمده فروشی",
      "wholesale price", "wholesaleprice", "wholesale", "trade price",
    ],
  },
  {
    key: "categoryMain",
    label: "گروه اصلی",
    hidden: true,
    aliases: [
      "گروه اصلی", "گروه اصلي", "گروه اصلی کالا", "گروه اصلی جنس", "گروه اصلی/فرعی",
      "گروه سطح یک", "گروه مرجع", "main group", "maincategory", "maingroup",
    ],
  },
  {
    key: "categorySub",
    label: "گروه فرعی",
    hidden: true,
    aliases: [
      "گروه فرعی", "گروه فرعي", "زیرگروه", "گروه فرعی کالا", "گروه دوم",
      "گروه سطح دو", "زیر گروه", "sub group", "subcategory", "subgroup",
    ],
  },
];

const CUSTOMER_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "نام",
    required: true,
    aliases: [
      "نام طرف‌حساب", "نام مشتری", "نام شخص", "نام و نام خانوادگی", "نام", "حساب",
      "نام حساب", "نام مشتری/فروشنده", "نام کامل", "نام فروشنده", "نام خریدار",
      "شرح حساب", "عنوان حساب", "طرف حساب", "شرح",
      "نام و نام‌خانوادگی", "نام ونام خانوادگی", "نام شرکت/شخص", "عنوان طرف‌حساب", "نام حساب‌ها",
      "name", "title", "full name", "account name", "customer name",
      "customer", "client", "client name", "accountname", "account title",
      "person", "person name", "party name", "partyname",
    ],
  },
  {
    key: "code",
    label: "کد",
    aliases: [
      "کد مشتری", "کد حساب", "کد طرف‌حساب", "کد", "شماره حساب", "شماره مشتری",
      "کد شخص", "کد یکتا", "شناسه حساب", "کد مشتری/طرف‌حساب", "کد طرف حساب",
      "شماره کد", "کد حساب مشتری", "کد شرکت",
      "code", "customer code", "account code", "id", "accountno", "account no",
      "customerno", "customer no", "custcode", "cust code", "partycode", "party code",
    ],
  },
  {
    key: "type",
    label: "نوع",
    aliases: ["نوع", "نوع طرف‌حساب", "نوع حساب", "گروه حساب", "نوع شخص", "نوع مشتری", "مشتری/فروشنده", "type", "customer/supplier", "party type", "partytype"],
  },
  {
    key: "phone",
    label: "تلفن",
    aliases: ["تلفن", "شماره تلفن", "تلفن ثابت", "شماره تماس", "تلفن تماس", "phone", "tel", "telephone", "phone1", "phone 1", "phone number", "phonenumber"],
  },
  {
    key: "mobile",
    label: "موبایل",
    aliases: ["موبایل", "همراه", "تلفن همراه", "شماره موبایل", "تلفن سلولی", "شماره همراه", "mobile", "cell", "cellphone", "mobile phone", "mobile1", "mobile 1", "mobileno", "mobile no", "gsm", "cell phone"],
  },
  {
    key: "nationalId",
    label: "کد ملی",
    aliases: ["کد ملی", "شناسه ملی", "کد ملی/شناسه ملی", "کد ملی شخص", "کدملی", "شماره ملی", "nationalid", "national code", "national id", "nationalno", "national no", "ssn"],
  },
  {
    key: "economicCode",
    label: "کد اقتصادی",
    aliases: ["کد اقتصادی", "شناسه اقتصادی", "شماره اقتصادی", "کد اقتصادی شرکت", "کد اقتصادی/شناسه ملی", "economiccode", "economic id", "economic code", "economiccodeid"],
  },
  {
    key: "taxId",
    label: "کد مالیاتی",
    aliases: ["کد مالیاتی", "شناسه مالیاتی", "شماره مالیاتی", "شناسه یکتای مالیاتی", "شناسه یکتا مالیاتی", "کد مالیاتی شرکت", "taxid", "tax id", "tax code", "taxno"],
  },
  { key: "email", label: "ایمیل", aliases: ["ایمیل", "پست الکترونیکی", "رایانامه", "email", "mail", "e-mail", "email1", "email 1"] },
  {
    key: "address",
    label: "آدرس",
    aliases: ["آدرس", "نشانی", "آدرس کامل", "محل سکونت", "نشانی کامل", "آدرس محل", "آدرس محل کار", "آدرس پستی", "نشانی محل", "address", "addr", "address1", "address 1", "full address"],
  },
  {
    key: "postalCode",
    label: "کد پستی",
    hidden: true,
    aliases: ["کد پستی", "کدپستی", "شماره پستی", "کد پستی ۱۰ رقمی", "zipcode", "postal code", "postalcode", "zip"],
  },
  {
    key: "city",
    label: "شهر",
    hidden: true,
    aliases: ["شهر", "شهرستان", "استان", "city", "town", "province"],
  },
];

const INVOICE_FIELDS: FieldDef[] = [
  {
    key: "number",
    label: "شماره",
    required: true,
    aliases: [
      "شماره فاکتور", "شماره", "شماره سند", "شماره سند فروش", "شماره فاکتور فروش",
      "نوبت فاکتور", "شماره قبض", "شماره صورت‌حساب", "شماره صورت حساب", "فاکتور شماره",
      "شماره سند مالی", "شماره فاکتور خرید", "شماره برگه",
      "number", "no", "invoice no", "invoice number", "doc no", "invno", "inv no",
      "bill no", "billno", "invoice #", "voucher no",
    ],
  },
  {
    key: "partyCode",
    label: "کد مشتری",
    required: true,
    aliases: ["کد مشتری", "کد طرف‌حساب", "کد حساب", "کد حساب طرف‌حساب", "کد مشتری/طرف‌حساب", "کد طرف حساب", "کد حساب مشتری", "کد مشتری/فروشنده", "کد خریدار", "کد فروشنده", "partycode", "customer code", "custcode", "cust code"],
  },
  {
    key: "date",
    label: "تاریخ",
    aliases: ["تاریخ فاکتور", "تاریخ", "تاریخ سند", "تاریخ صدور", "تاریخ ثبت", "تاریخ صدور فاکتور", "تاریخ ثبت سند", "تاریخ فاکتور فروش", "تاریخ فاکتور خرید", "تاریخ میلادی", "تاریخ برگه", "date", "invoice date", "docdate", "doc date", "issue date", "document date", "invdate", "inv date"],
  },
  {
    key: "total",
    label: "مبلغ کل",
    aliases: ["مبلغ کل", "جمع کل", "مبلغ فاکتور", "مبلغ", "جمع فاکتور", "مبلغ کل فاکتور", "جمع نهایی", "مبلغ قابل پرداخت", "مبلغ نهایی", "جمع کل فاکتور", "قیمت کل", "جمع مبلغ", "مانده فاکتور", "total", "amount", "grand total", "total amount", "totalamount", "net total", "nettotal", "amount due", "invoice amount", "invoice total", "invoicetotal", "sum"],
  },
  {
    key: "items",
    label: "اقلام",
    required: true,
    aliases: ["اقلام", "ردیف‌ها", "کالاهای فاکتور", "شرح اقلام", "جزئیات اقلام", "کالاها", "items", "lines", "line items", "invoice lines", "rows", "invoice items"],
  },
  {
    key: "description",
    label: "توضیحات",
    aliases: ["توضیحات", "شرح", "شرح سند", "description", "توضیحات فاکتور", "توضیحات سند", "شرح تراکنش"],
  },
];

/** دیکشنری فیلدهای هر موجودیت (منبع یگانه — کلاینت/سرور/تست) */
export const IMPORT_FIELD_DEFS: Record<ImportEntityKind, FieldDef[]> = {
  products: PRODUCT_FIELDS,
  customers: CUSTOMER_FIELDS,
  invoices: INVOICE_FIELDS,
};

/* ---------- ۵-ب) تشخیص خودکار نگاشت از روی هدر (Task 2-a) ---------- */

/** تشخیص خودکار نگاشت ستون‌ها: برای هر فیلد، هدر منطبق را پیدا کن.
 * تطبیق با normalizeHeaderKey (ي→ی، ك→ک، حذف فاصله/ZWNJ) تا هدرهای عربیِ
 * خروجی هلو («نام كالا», «في فروش») هم شناسایی شوند.
 * پاس ۱: تطبیق دقیق (alias ها به ترتیب اولویت)؛
 * پاس ۲: تطبیق شامل (هدر شامل alias یا برعکس) برای هدرهای ترکیبی
 * مثل «قیمت فروش (ریال)» یا «تاریخ تغییر قیمت فروش». */
export function autoDetectMapping(
  headers: string[],
  entity: ImportEntityKind
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const normHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeaderKey(h) }));

  // پاس ۱: تطبیق دقیق (با اولویت alias)
  for (const field of IMPORT_FIELD_DEFS[entity]) {
    for (const alias of field.aliases) {
      const na = normalizeHeaderKey(alias);
      if (!na) continue;
      const found = normHeaders.find((h) => !used.has(h.raw) && h.norm === na);
      if (found) {
        mapping[field.key] = found.raw;
        used.add(found.raw);
        break;
      }
    }
  }
  // پاس ۲: تطبیق شامل (هدر شامل alias یا برعکس) برای هدرهای ترکیبی
  for (const field of IMPORT_FIELD_DEFS[entity]) {
    if (mapping[field.key]) continue;
    const aliases = field.aliases.map((a) => normalizeHeaderKey(a));
    const found = normHeaders.find(
      (h) =>
        !used.has(h.raw) &&
        aliases.some(
          (a) =>
            (a.length > 2 && h.norm.includes(a)) ||
            (h.norm.length > 2 && a.includes(h.norm))
        )
    );
    if (found) {
      mapping[field.key] = found.raw;
      used.add(found.raw);
    }
  }
  return mapping;
}

/* ---------- ۵-پ) حدس موجودیت از روی هدرها (Task 2-a / 3d) ---------- */

/**
 * حدس نوع موجودیت فایل از روی هدرها — برای «انتخاب خودکار تب»:
 * اگر کاربر روی تب «مشتریان» است ولی فایلش هدر «نام كالا / في فروش» دارد،
 * خودکار به تب «محصولات» سوئیچ می‌شود (با توست اطلاع‌رسانی).
 * خروجی: موجودیت برنده + امتیاز هر موجودیت (برای نمایش اطمینان).
 */
export function guessEntityFromHeaders(headers: string[]): {
  entity: ImportEntityKind | null;
  scores: Record<ImportEntityKind, number>;
} {
  const scores: Record<ImportEntityKind, number> = { products: 0, customers: 0, invoices: 0 };
  const normHeaders = headers.map((h) => normalizeHeaderKey(h));
  for (const entity of Object.keys(scores) as ImportEntityKind[]) {
    for (const field of IMPORT_FIELD_DEFS[entity]) {
      // فیلدهای hidden امتیاز معمولی می‌گیرند؛ required وزنهٔ مضاعف
      const weight = field.required ? 3 : 1;
      for (const alias of field.aliases) {
        const na = normalizeHeaderKey(alias);
        if (!na) continue;
        if (normHeaders.some((h) => h === na)) {
          scores[entity] += weight * 2; // تطابق دقیق
          break;
        }
      }
    }
    // تطابق شامل — وزنهٔ کمتر (هدر ترکیبی مثل «فی فروش (ریال)»)
    for (const field of IMPORT_FIELD_DEFS[entity]) {
      if (field.hidden) continue;
      const weight = field.required ? 2 : 1;
      for (const alias of field.aliases) {
        const na = normalizeHeaderKey(alias);
        if (na.length <= 2) continue;
        if (normHeaders.some((h) => h.includes(na))) {
          scores[entity] += weight;
          break;
        }
      }
    }
  }
  let best: ImportEntityKind | null = null;
  let bestScore = 0;
  let runnerUp = 0;
  for (const entity of Object.keys(scores) as ImportEntityKind[]) {
    if (scores[entity] > bestScore) {
      runnerUp = bestScore;
      best = entity;
      bestScore = scores[entity];
    } else if (scores[entity] > runnerUp) {
      runnerUp = scores[entity];
    }
  }
  // فقط وقتی برنده «قاطع» است سوئیچ کن (دو برابر نفر دوم و حداقل ۴ امتیاز)
  if (best && bestScore >= 4 && bestScore >= runnerUp * 2) return { entity: best, scores };
  return { entity: null, scores };
}

/* ---------- ۱۰) تشخیص وجود سطر هدر (Task 2-a / 2d) ---------- */

/**
 * آیا سطر اول ماتریس «هدر» است یا داده؟
 *  - اگر ≥۱ سلولش با هدر شناخته‌شدهٔ نرم‌افزارهای حسابداری مطابق شود → هدر
 *  - اگر بیشترِ سلول‌هایش عددی باشد در حالی که همان ستون‌ها در ردیف‌های
 *    بعدی متن هستند → داده است (فایلِ بدون هدر)
 *  - اگر سلول‌هایش متن کوتاهِ «تکرارشونده در هیچ ردیفی» نباشند و ردیف‌های
 *    بعدی الگوی مشابه داشته باشند → محتمل داده (مثل فایل تک‌ستونی)
 * پیش‌فرض: هدر (رفتار فعلی — سازگار با همهٔ فایل‌های موجود)
 */
export function looksLikeHeaderRow(firstRow: string[], dataRows: string[][]): boolean {
  const clean = firstRow.map((c) => (c ?? "").trim());
  // ۱) تطابق با دیکشنری هدرها — قوی‌ترین نشانه
  const knownHits = clean.filter((c) => c !== "" && normalizeHeaderKey(c) in HEADER_SEMANTICS).length;
  if (knownHits >= 1) return true;
  // ۲) نشانه‌های متنی هدر: سلول متنی کوتاه بدون رقم که در هیچ ردیف داده‌ای
  //    در همان ستون تکرار نشده است
  const sample = dataRows.slice(0, 50);
  if (sample.length === 0) return true; // فقط یک سطر — هدر فرض کن (بی‌ضرر)
  const cellIsText = (v: string) => {
    const t = (v ?? "").trim();
    if (t === "") return false;
    return /[۰-۹٠-٩a-zA-Z\u0600-\u06FF]/.test(t);
  };
  const firstTexts = clean.filter(cellIsText).length;
  if (firstTexts === 0) return false; // سطر اول کاملاً عددی/خالی → هدر نیست
  // ۳) مقایسهٔ «عددی بودن» سطر اول با ردیف‌های بعد در همان ستون‌ها:
  //    هدر واقعی معمولاً متنی است در حالی که داده همان ستون عددی/متن طولانی است
  const numericCell = (v: string) => {
    const t = (v ?? "").trim();
    if (t === "") return false;
    return /^-?[۰-۹٠-٩\d.,،٬\s]+$/.test(t);
  };
  let firstNumeric = 0;
  for (const c of clean) if (numericCell(c)) firstNumeric++;
  // نسبت عددی هر ستون در ردیف‌های بعدی
  const cols = clean.length;
  let dataNumeric = 0;
  let dataFilled = 0;
  for (const row of sample) {
    for (let c = 0; c < cols; c++) {
      const v = (row[c] ?? "").trim();
      if (v === "") continue;
      dataFilled++;
      if (numericCell(v)) dataNumeric++;
    }
  }
  // سطر اول عمدتاً عددی ولی بدنهٔ داده عمدتاً متنی → سطر اول «داده» است
  if (firstNumeric >= Math.ceil(clean.filter((c) => c !== "").length * 0.6) && dataFilled > 0) {
    if (dataNumeric / dataFilled < 0.4) return false;
  }
  // ۳-ب) مقایسهٔ ستونی (Task 2-a/4): ستون‌هایی که سلول سطر اولشان عددی است
  // ولی همان ستون در بدنه «متن» است → سطر اول داده است (فایل بی‌هدر)؛
  // مقایسهٔ تجمعی بالا حالت مخلوط (متن+عدد در هر سطر) را نمی‌گیرد
  if (firstNumeric >= Math.ceil(clean.filter((c) => c !== "").length * 0.6) && sample.length >= 3) {
    const numericCols: number[] = [];
    for (let c = 0; c < cols; c++) if (numericCell(clean[c])) numericCols.push(c);
    let textInNumericCols = 0;
    let filledInNumericCols = 0;
    for (const col of numericCols) {
      for (const row of sample) {
        const v = (row[col] ?? "").trim();
        if (v === "") continue;
        filledInNumericCols++;
        if (!numericCell(v) && /[A-Za-z\u0600-\u06FF]/.test(v)) textInNumericCols++;
      }
    }
    if (filledInNumericCols > 0 && textInNumericCols / filledInNumericCols >= 0.5) return false;
  }
  // ۴) سطر اول متنیِ کوتاه و «یکتا» (مقادیرش در بدنه تکرار نمی‌شوند) → هدر
  const maxLen = Math.max(...clean.map((c) => c.length), 0);
  if (firstTexts >= Math.max(1, Math.ceil(cols / 2)) && maxLen <= 40) {
    // بررسی تکرار: اگر مقادیر سلول‌های سطر اول در ستون متناظرِ ردیف‌های بعدی
    // با فراوانی بالا تکرار شوند → سطر اول شبیه داده است (مثل لیست شهرها)
    let repeats = 0;
    let comparisons = 0;
    for (let c = 0; c < cols; c++) {
      const hv = normalizeHeaderKey(clean[c]);
      if (!hv) continue;
      for (const row of sample.slice(0, 20)) {
        const dv = normalizeHeaderKey((row[c] ?? "").trim());
        if (dv === "") continue;
        comparisons++;
        if (dv === hv) repeats++;
      }
    }
    if (comparisons > 0 && repeats / comparisons > 0.5) return false;
    return true;
  }
  return true;
}

/* ---------- ۱۱) ردیف‌های مزاحم (Task 2-a / 2c) ---------- */

const SEPARATOR_ROW_RE = /^[-=_*·.‾—ـ~+\s]+$/;
/** حروف معنی‌دار (کاندید نام): ≥۲ حرف متوالی لاتین/فارسی — بازهٔ حروف واقعی
 * (بدون علائم نگارشی عربی مثل ، ؛ ؟ که در بازهٔ گستردهٔ ۰۶xx می‌افتند) */
const MEANINGFUL_LETTERS_RE = /[A-Za-z\u0621-\u063A\u0641-\u064A\u066E-\u06D5]{2,}/;
/** رقم (کاندید قیمت/تعداد/کد) — انگلیسی/فارسی/عربی */
const ANY_DIGIT_RE = /[0-9۰-۹٠-٩]/;

/** آیا این ردیف «مزاحم» است؟ (جداکنندهٔ بخش‌ها / تکرار هدر / کاملاً خالی /
 *  بدون نام و بدون عدد — مثل ردیف‌های تک‌کاراکتری/نقطه‌ای/ساختگی وسط فایل) */
export function isJunkRow(cells: string[]): boolean {
  const clean = cells.map((c) => (c ?? "").trim());
  // کاملاً خالی
  if (!clean.some((c) => c !== "")) return true;
  // جداکنندهٔ بخش‌ها: «-----» یا «=====» یا «ـــــ»
  if (clean.every((c) => c === "" || SEPARATOR_ROW_RE.test(c))) {
    // حداقل یک سلول غیرخالیِ جداکننده باید باشد (خالیِ محض بالا گرفته شد)
    if (clean.some((c) => c !== "")) return true;
  }
  const nonEmpty = clean.filter((c) => c !== "");
  // تکرار هدر: همهٔ سلول‌های غیرخالی با دیکشنری هدر مطابق‌اند و بیش از یکی هستند
  if (nonEmpty.length >= 2) {
    const hits = nonEmpty.filter((c) => normalizeHeaderKey(c) in HEADER_SEMANTICS).length;
    if (hits === nonEmpty.length) return true;
  }
  // سطر «بدون نام و بدون عدد»: نه حروف معنی‌دار (کاندید نام) دارد نه رقمی
  // (کاندید قیمت/تعداد) — چنین سطری هیچ فیلد قابل ایمپورتی ندارد → مزاحم
  if (!nonEmpty.some((c) => MEANINGFUL_LETTERS_RE.test(c)) && !nonEmpty.some((c) => ANY_DIGIT_RE.test(c))) {
    return true;
  }
  return false;
}

/* ---------- ۱۲) هدرهای عمومی برای فایل بدون هدر (Task 2d) ---------- */

/** «ستون ۱»، «ستون ۲»، ... با ارقام فارسی */
export function genericHeaders(count: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) out.push(`ستون ${toFaDigits(i)}`);
  return out;
}
function toFaDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/* ---------- ۱۳) خط لولهٔ هوشمند ماتریس → جدول (Task 2a) ---------- */

export interface SmartTable {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
  encoding: string;
  /** هدر عمومی تزریق شد (فایل بدون هدر بود) */
  headerInjected: boolean;
  /** ردیف‌های مزاحم حذف‌شده (جداکننده/تکرار هدر/خالی) */
  junkRemoved: number;
  /** سطرهای جمع کل حذف‌شده (فوتر خروجی هلو/سپیدار) */
  totalsRemoved: number;
}

/**
 * ماتریس خام → جدول پاکِ آمادهٔ نگاشت:
 *  ۱) تشخیص هدر (نبود → هدر عمومی «ستون ۱..N» + سطر اول به داده برمی‌گردد)
 *  ۲) حذف ردیف‌های مزاحم (جداکننده/تکرار هدر)
 *  ۳) بازچینش قیمت‌های شکسته (همان matrixToTable)
 *  ۴) حذف «سطر جمع کل» فوتر (نام خالی + مقادیر عددی)
 * این همان خط لوله‌ای است که UI هم استفاده می‌کند (منبع یگانه).
 */
export function parseMatrixSmart(
  matrix: string[][],
  opts?: { delimiter?: string; encoding?: string; reassemble?: boolean }
): SmartTable {
  const reassemble = opts?.reassemble ?? true;
  const empty: SmartTable = {
    headers: [],
    rows: [],
    delimiter: opts?.delimiter ?? ",",
    encoding: opts?.encoding ?? "",
    headerInjected: false,
    junkRemoved: 0,
    totalsRemoved: 0,
  };
  if (!matrix || matrix.length === 0) return empty;

  // ۱) حذف ردیف‌های کاملاً خالی ابتدایی (پیش از تشخیص هدر)
  let start = 0;
  while (start < matrix.length && !matrix[start].some((c) => (c ?? "").trim() !== "")) start++;
  const body = matrix.slice(start);
  if (body.length === 0) return empty;

  // ۲) تشخیص هدر
  const hasHeader = looksLikeHeaderRow(body[0], body.slice(1));
  let headerRow: string[];
  let dataRows: string[][];
  if (hasHeader) {
    headerRow = body[0];
    dataRows = body.slice(1);
  } else {
    headerRow = genericHeaders(Math.max(...body.map((r) => r.length), 1));
    dataRows = body;
  }

  // ۳) حذف ردیف‌های مزاحم از داده‌ها
  let junkRemoved = 0;
  const keptRows: string[][] = [];
  for (const row of dataRows) {
    if (isJunkRow(row)) {
      junkRemoved++;
      continue;
    }
    keptRows.push(row);
  }

  // ۴) بازچینش قیمت‌های شکسته + تبدیل به آبجکت
  const table = matrixToTable([headerRow, ...keptRows], {
    delimiter: opts?.delimiter,
    encoding: opts?.encoding,
    reassemble,
  });

  // ۵) حذف «سطر جمع کل» فوتر — فقط وقتی ستون نام مشخص است
  let totalsRemoved = 0;
  const nameKeys = nameHeaderKeys(table.headers);
  if (nameKeys.length > 0) {
    const before = table.rows.length;
    table.rows = table.rows.filter((r) => !isTotalsRow(r, nameKeys));
    totalsRemoved = before - table.rows.length;
  }

  return {
    headers: table.headers,
    rows: table.rows,
    delimiter: table.delimiter,
    encoding: table.encoding,
    headerInjected: !hasHeader,
    junkRemoved,
    totalsRemoved,
  };
}

/* ---------- ۱۴) استنتاج نگاشت از روی «داده‌ها» (Task 2b) ----------
 * وقتی تطبیق هدر شکست خورد (هدرهای ناشناخته/تغییریافته/بی‌هدر)،
 * الگوی «مقادیر» ستون‌ها معنا را لو می‌دهد:
 *  - ستون پر از متن فارسیِ طولانی → نام
 *  - عددی با ۴-۹ رقم → قیمت
 *  - عددی کوچک/اعشاری → موجودی
 *  - الگوی تاریخ شمسی ۱۴۰۵.۰۶.۲۳ → تاریخ
 *  - ۰۹xxxxxxxxx → موبایل؛ ۱۰رقم → کد ملی؛ @ → ایمیل
 *  - متنِ کم‌کاردینالیتی (چند مقدار تکرارشونده) → دسته‌بندی/واحد
 * خروجی فقط فیلدهایی را پر می‌کند که نگاشت هدر نپرده بود (fallback). */

/** الگوی تاریخ شمسی/میلادی: 1405.06.23، 1403/5/12، 2024-07-15، ۱۴۰۵-۰۶-۲۳ */
const DATE_LIKE_RE = /^[۱۲][۰-۹]{3}[-/.][۰-۹]{1,2}[-/.][۰-۹]{1,2}$/;
const DATE_LIKE_EN_RE = /^(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/;
const MOBILE_LIKE_RE = /^(\+98|0098|98|0)?9[۰-۹\d]{9}$/;
const EMAIL_LIKE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ColumnProfile {
  header: string;
  filled: number;
  filledRatio: number;
  numericRatio: number;
  persianRatio: number;
  dateRatio: number;
  mobileRatio: number;
  emailRatio: number;
  avgLen: number;
  maxLen: number;
  avgNumeric: number;
  bigNumericRatio: number;
  smallNumericRatio: number;
  distinct: number;
  distinctRatio: number;
}

/** پروفایل هر ستون از روی حداکثر ۲۰۰ ردیف نمونه (سبک و سریع) */
export function profileColumns(
  headers: string[],
  rows: Record<string, string>[],
  sampleSize = 200
): ColumnProfile[] {
  const sample = rows.slice(0, sampleSize);
  return headers.map((header) => {
    let filled = 0;
    let numeric = 0;
    let persian = 0;
    let dates = 0;
    let mobiles = 0;
    let emails = 0;
    let lenSum = 0;
    let maxLen = 0;
    let numericSum = 0;
    let bigNum = 0;
    let smallNum = 0;
    const distinct = new Set<string>();
    for (const row of sample) {
      const v = (row[header] ?? "").trim();
      if (v === "") continue;
      filled++;
      distinct.add(v);
      lenSum += v.length;
      if (v.length > maxLen) maxLen = v.length;
      if (/[\u0600-\u06FF]/.test(v)) persian++;
      if (DATE_LIKE_RE.test(v) || DATE_LIKE_EN_RE.test(v)) dates++;
      if (MOBILE_LIKE_RE.test(v.replace(/[\s\-()]/g, ""))) mobiles++;
      if (EMAIL_LIKE_RE.test(v)) emails++;
      const n = normalizeDigits(v);
      if (n !== "" && /^-?\d+(\.\d+)?$/.test(n)) {
        numeric++;
        const num = Number(n);
        numericSum += Math.abs(num);
        if (Math.abs(num) >= 1000 && Math.abs(num) < 1e10) bigNum++;
        if (Math.abs(num) < 10000) smallNum++;
      }
    }
    const n = sample.length || 1;
    const f = filled || 1;
    return {
      header,
      filled,
      filledRatio: filled / n,
      numericRatio: filled > 0 ? numeric / filled : 0,
      persianRatio: filled > 0 ? persian / filled : 0,
      dateRatio: filled > 0 ? dates / filled : 0,
      mobileRatio: filled > 0 ? mobiles / filled : 0,
      emailRatio: filled > 0 ? emails / filled : 0,
      avgLen: Math.round(lenSum / f),
      maxLen,
      avgNumeric: numeric > 0 ? numericSum / numeric : 0,
      bigNumericRatio: filled > 0 ? bigNum / filled : 0,
      smallNumericRatio: filled > 0 ? smallNum / filled : 0,
      distinct: distinct.size,
      distinctRatio: filled > 0 ? distinct.size / filled : 1,
    };
  });
}

export interface InferredMapping {
  /** فیلد API → هدر (فقط مواردی که از داده استنتاج شد) */
  mapping: Record<string, string>;
  /** دلیل فارسی هر استنتاج — برای نمایش بج «تشخیص هوشمند» در پیش‌نمایش */
  reasons: Record<string, string>;
}

/**
 * استنتاج نگاشت از روی الگوی داده‌ها — فقط فیلدهایی که در
 * headerMapping موجود نیستند را پر می‌کند (fallback هوشمند).
 * usedHeaders ستون‌هایی است که نگاشت هدر/پروفایل قبلاً مصرف کرده‌اند.
 */
export function inferMappingFromData(
  headers: string[],
  rows: Record<string, string>[],
  entity: ImportEntityKind,
  existingMapping: Record<string, string> = {}
): InferredMapping {
  const mapping: Record<string, string> = {};
  const reasons: Record<string, string> = {};
  if (headers.length === 0 || rows.length < 3) return { mapping, reasons };

  const used = new Set<string>(Object.values(existingMapping).filter(Boolean));
  const profiles = profileColumns(headers, rows);
  const free = profiles.filter((p) => !used.has(p.header) && p.filledRatio > 0.15);
  const take = (fieldKey: string, header: string, reason: string) => {
    mapping[fieldKey] = header;
    reasons[fieldKey] = reason;
    used.add(header);
    const idx = free.findIndex((p) => p.header === header);
    if (idx >= 0) free.splice(idx, 1);
  };
  const has = (k: string) => Boolean(existingMapping[k] || mapping[k]);

  // ---------- نام: ستون با متن فارسی طولانی و کاردینالیتی بالا ----------
  const nameCandidates = free
    .filter((p) => p.persianRatio >= 0.5 && p.avgLen >= 3 && p.numericRatio < 0.5)
    .sort((a, b) => b.avgLen * b.persianRatio - a.avgLen * a.persianRatio);
  if (nameCandidates.length > 0 && !has("name")) {
    take("name", nameCandidates[0].header, "ستون با متن فارسیِ طولانی");
  }

  if (entity === "products") {
    // ---------- قیمت فروش: عددی ۴-۹رقمی با بیشترین میانگین ----------
    const priceCandidates = free
      .filter((p) => p.numericRatio >= 0.7 && p.bigNumericRatio >= 0.5 && p.avgNumeric >= 1000)
      .sort((a, b) => b.avgNumeric - a.avgNumeric);
    if (priceCandidates.length > 0 && !has("salePrice")) {
      take("salePrice", priceCandidates[0].header, "اعداد بزرگ ۴ تا ۹ رقمی");
    }
    // ---------- قیمت خرید: دومین ستون قیمتی ----------
    if (priceCandidates.length > 1 && !has("purchasePrice")) {
      take("purchasePrice", priceCandidates[1].header, "دومین ستون اعداد بزرگ");
    }
    // ---------- موجودی: عددیِ کوچک/اعشاری با پرکردنِ بالا ----------
    const stockCandidates = free
      .filter((p) => p.numericRatio >= 0.8 && p.bigNumericRatio < 0.5 && p.filledRatio >= 0.3)
      .sort((a, b) => a.avgNumeric - b.avgNumeric);
    if (stockCandidates.length > 0 && !has("stock")) {
      take("stock", stockCandidates[0].header, "اعداد کوچک (کمتر از ۱۰هزار)");
    }
    // ---------- دسته‌بندی: متنِ کم‌کاردینالیتی ----------
    const catCandidates = free
      .filter((p) => p.persianRatio >= 0.6 && p.distinct >= 2 && p.distinctRatio <= 0.5 && p.avgLen <= 30)
      .sort((a, b) => a.distinctRatio - b.distinctRatio);
    if (catCandidates.length > 0 && !has("category")) {
      take("category", catCandidates[0].header, "مقادیر تکرارشوندهٔ محدود (گروه‌ها)");
    }
    // ---------- واحد: خیلی کم‌کاردینالیتی و کوتاه ----------
    const unitCandidates = free
      .filter((p) => p.distinct >= 1 && p.distinct <= 8 && p.avgLen <= 12 && p.filledRatio >= 0.3)
      .filter((p) => p.persianRatio >= 0.4 || p.numericRatio >= 0.9)
      .sort((a, b) => a.distinct - b.distinct);
    if (unitCandidates.length > 0 && !has("unit")) {
      take("unit", unitCandidates[0].header, "چند مقدار محدودِ کوتاه (واحد)");
    }
  }

  if (entity === "customers") {
    // ---------- موبایل / تلفن / کد ملی / ایمیل / آدرس ----------
    if (!has("mobile")) {
      const mobile = free.find((p) => p.mobileRatio >= 0.6);
      if (mobile) take("mobile", mobile.header, "الگوی ۰۹xxxxxxxxx");
    }
    if (!has("email")) {
      const email = free.find((p) => p.emailRatio >= 0.5);
      if (email) take("email", email.header, "شامل @ و دامنه");
    }
    if (!has("nationalId")) {
      const nid = free.find((p) => p.numericRatio >= 0.9 && p.avgLen >= 9 && p.avgLen <= 11 && p.distinctRatio > 0.8);
      if (nid) take("nationalId", nid.header, "اعداد ۱۰رقمی یکتا");
    }
    if (!has("phone")) {
      const phone = free.find((p) => p.numericRatio >= 0.8 && p.avgLen >= 7 && p.avgLen <= 12 && p.mobileRatio < 0.5);
      if (phone) take("phone", phone.header, "ارقام تلفن ثابت");
    }
    if (!has("address")) {
      // آدرس فقط وقتی معنا دارد که «نام» از جای دیگر تأمین شده باشد —
      // وگرنه طولانی‌ترین متن همان نام است
      const nameCol = existingMapping.name ?? mapping.name;
      if (nameCol) {
        const addr = free
          .filter((p) => p.persianRatio >= 0.6 && p.avgLen >= 15 && p.header !== nameCol)
          .sort((a, b) => b.avgLen - a.avgLen)[0];
        if (addr) take("address", addr.header, "متن فارسی بسیار طولانی");
      }
    }
    // ---------- کد: عددی/الفبایی کوتاه یکتا ----------
    if (!has("code")) {
      const code = free
        .filter((p) => p.avgLen <= 15 && p.distinctRatio > 0.7 && p.filledRatio >= 0.3)
        .filter((p) => p.numericRatio >= 0.7 || /^[A-Za-z0-9\-]+$/.test(p.header))
        .sort((a, b) => a.avgLen - b.avgLen)[0];
      if (code) take("code", code.header, "کدهای کوتاه یکتا");
    }
  }

  if (entity === "invoices") {
    // ---------- تاریخ ----------
    if (!has("date")) {
      const date = free.find((p) => p.dateRatio >= 0.5);
      if (date) take("date", date.header, "الگوی تاریخ (۱۴۰۵.۰۶.۲۳)");
    }
    // ---------- مبلغ کل: بزرگ‌ترین ستون عددی ----------
    if (!has("total")) {
      const totals = free
        .filter((p) => p.numericRatio >= 0.7 && p.bigNumericRatio >= 0.4)
        .sort((a, b) => b.avgNumeric - a.avgNumeric);
      if (totals.length > 0) take("total", totals[0].header, "اعداد بزرگ (مبلغ)");
    }
    // ---------- شماره: عدد/متن کوتاه یکتا ----------
    if (!has("number")) {
      const num = free
        .filter((p) => p.avgLen <= 15 && p.distinctRatio > 0.8 && p.filledRatio >= 0.3)
        .sort((a, b) => a.avgLen - b.avgLen)[0];
      if (num) take("number", num.header, "شناسه‌های کوتاه یکتا");
    }
  }

  return { mapping, reasons };
}

/**
 * آیا این ردیف «سطر جمع/فوتر» خروجی نرم‌افزارهای حسابداری است؟
 * الگو: نام خالی + حداقل یک مقدار عددی + معمولاً ردیف/شناسه خالی —
 * مثل سطر آخر فایل هلو: «,,,,4,699,465,680,000,,,439,790,000,,,,,»
 * چنین سطرهایی نباید خطای «نام کالا الزامی» بگیرند — باید «رد شده (سطر جمع)» شوند.
 */
export function isTotalsRow(row: Record<string, string>, nameKeys: string[]): boolean {
  // همهٔ کلیدهای نام خالی باشند
  const hasName = nameKeys.some((k) => (row[k] ?? "").trim() !== "");
  if (hasName) return false;
  // حداقل یک مقدار عددی غیرصفر داشته باشد (وگرنه ردیف خالی معمولی است)
  const values = Object.values(row);
  const hasNumeric = values.some((v) => {
    const n = normalizeDigits(String(v ?? ""));
    return n !== "" && /^-?\d+(\.\d+)?$/.test(n) && Number(n) !== 0;
  });
  return hasNumeric;
}

/** کلیدهای هدر که «نام/شرح» هستند — از HEADER_SEMANTICS استخراج می‌شود */
export function nameHeaderKeys(headers: string[]): string[] {
  return headers.filter((h) => headerField(h) === "name");
}

/* ---------- ۶) بازچینش قیمت‌های شکسته ---------- */

const THREE_DIGIT_RE = /^\d{3}$/;
const ALL_DIGITS_RE = /^\d+$/;
/** حداکثر گروه‌های هزارگی که به یک قیمت الحاق می‌شود (تا ۱۰^۱۸) */
const MAX_PRICE_GROUPS = 6;
/** بالاترین تعداد ستون برای backtracking (محافظ پیچیدگی) */
const MAX_BACKTRACK_HEADERS = 64;

function padRow(cells: string[], length: number): string[] {
  if (cells.length >= length) return cells.slice(0, length);
  return [...cells, ...new Array(length - cells.length).fill("")];
}

/**
 * تخصیص سلول‌ها به ستون‌ها با backtracking:
 * - هر ستون ≥۱ سلول مصرف می‌کند و همهٔ سلول‌ها دقیقاً مصرف می‌شوند
 * - ستون قیمتی: سلول اول + گروه‌های ۳رقمی بعدی؛ سلول اول نباید صفرِ
 *   پیشرو داشته باشد («0» تنها مجاز است — «000» فقط ادامهٔ گروه است)
 * - ترتیب تلاش: بیشترین جذب اول (قیمت‌های گرد هزارگان)
 * خروجی null یعنی هیچ تخصیص معتبری وجود ندارد.
 */
function reassembleRowBacktrack(
  kinds: ColumnKind[],
  cells: string[]
): string[] | null {
  const n = kinds.length;
  if (n === 0 || n > MAX_BACKTRACK_HEADERS || cells.length < n) return null;
  const out: string[] = new Array(n).fill("");

  const walk = (h: number, ci: number): boolean => {
    if (h === n) return ci === cells.length;
    if (ci >= cells.length) return false; // هر ستون ≥۱ سلول
    const cell = (cells[ci] ?? "").trim();
    if (kinds[h] !== "price") {
      out[h] = cells[ci] ?? "";
      return walk(h + 1, ci + 1);
    }
    if (cell === "" || !ALL_DIGITS_RE.test(cell)) {
      // قیمت خالی/غیرعددی → تک‌سلولی
      out[h] = cells[ci] ?? "";
      return walk(h + 1, ci + 1);
    }
    if (cell.length > 1 && cell.startsWith("0")) {
      // «000» یا «0450» به‌عنوان سلول اول قیمت نامعتبر است
      return false;
    }
    // حداکثر گروه‌های قابل جذب
    let maxK = 0;
    if (cell !== "0") {
      while (
        maxK < MAX_PRICE_GROUPS &&
        ci + 1 + maxK < cells.length &&
        THREE_DIGIT_RE.test((cells[ci + 1 + maxK] ?? "").trim())
      ) {
        maxK++;
      }
    }
    for (let k = maxK; k >= 0; k--) {
      let value = cell;
      for (let j = 1; j <= k; j++) value += (cells[ci + j] ?? "").trim();
      out[h] = value;
      if (walk(h + 1, ci + 1 + k)) return true;
    }
    return false;
  };

  return walk(0, 0) ? out : null;
}

/**
 * جذب حریصانه با سقف budget = سلول‌های اضافه (fallback مطمئن):
 * سلول‌های ۳رقمی بعد از ستون‌های قیمتی الحاق می‌شوند تا budget تمام شود؛
 * سلول‌های انتهاییِ باقی‌مانده رها می‌شوند.
 */
function reassembleRowGreedy(
  kinds: ColumnKind[],
  cells: string[]
): string[] {
  const nHeaders = kinds.length;
  let budget = cells.length - nHeaders;
  const out: string[] = [];
  let ci = 0;
  for (let h = 0; h < nHeaders; h++) {
    if (ci >= cells.length) {
      out.push("");
      continue;
    }
    const cell = (cells[ci++] ?? "").trim();
    if (
      kinds[h] === "price" &&
      cell !== "" &&
      ALL_DIGITS_RE.test(cell) &&
      !(cell.length > 1 && cell.startsWith("0"))
    ) {
      let value = cell;
      while (
        budget > 0 &&
        ci < cells.length &&
        THREE_DIGIT_RE.test((cells[ci] ?? "").trim())
      ) {
        value += (cells[ci++] ?? "").trim();
        budget--;
      }
      out.push(value);
    } else {
      out.push(cell);
    }
  }
  return out;
}

/**
 * بازچینش یک ردیف CSV با هدرهای «نوع‌دار»:
 * - ردیف با تعداد سلول ≤ هدر → فقط pad (بدون تغییر — سازگار با CSV سالم)
 * - ردیف با سلول بیشتر → backtracking؛ در نبود تخصیص معتبر → greedy fallback
 */
export function reassembleRow(kinds: ColumnKind[], cells: string[]): string[] {
  const nHeaders = kinds.length;
  if (cells.length <= nHeaders) {
    return padRow(cells, nHeaders);
  }
  return reassembleRowBacktrack(kinds, cells) ?? reassembleRowGreedy(kinds, cells);
}

/* ---------- ۷) ارقام/اعداد فارسی ---------- */

/** ارقام فارسی/عربی → انگلیسی + حذف جداکننده هزارگان همه‌جانبه */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫/]/g, ".")
    .replace(/[,،٬\s\u00A0\u200C\u200E\u200F]/g, "");
}

/** مقدار عددی از سلول (با پشتیبانی ارقام فارسی) — fallback 0 */
export function toNumberLoose(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value !== "string") return fallback;
  const n = Number(normalizeDigits(value));
  return Number.isFinite(n) ? n : fallback;
}

/** سلول خالی/عددی است؟ (برای واحد: «واحد هاي کالا»=0 → «عدد») */
export function isBlankOrNumeric(value: string): boolean {
  const v = value.trim();
  return v === "" || /^[\d.,،٬\s۰-۹٠-٩]+$/.test(v);
}

/* ---------- ۸) ترکیب دسته‌بندی «اصلی / فرعی» ---------- */

/**
 * گروه اصلی + فرعی → نام دسته‌بندی:
 * هر دو پر و متفاوت → «اصلی / فرعی»؛ فقط یکی پر → همان؛ هیچ‌کدام → ""
 */
export function combineCategory(main: string, sub: string): string {
  const m = (main ?? "").trim();
  const s = (sub ?? "").trim();
  if (m && s && m !== s) return `${m} / ${s}`;
  return m || s || "";
}

/* ---------- ۹) ماتریس → ردیف‌های آبجکتی ---------- */

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
  encoding: string;
}

function uniqueHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((h, i) => {
    const base = (h ?? "").trim() || `ستون ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

/**
 * تبدیل ماتریس خام (هدر + ردیف‌ها) به آبجکت‌ها با بازچینش قیمت‌های شکسته.
 * reassemble=false برای Excel (قیمت‌ها تک‌سلولی هستند).
 */
export function matrixToTable(
  matrix: string[][],
  opts?: { delimiter?: string; encoding?: string; reassemble?: boolean }
): ParsedTable {
  const reassemble = opts?.reassemble ?? true;
  if (!matrix || matrix.length === 0) {
    return {
      headers: [],
      rows: [],
      delimiter: opts?.delimiter ?? ",",
      encoding: opts?.encoding ?? "",
    };
  }
  const headers = uniqueHeaders(matrix[0]);
  const kinds = matrix[0].map((h) => headerKind(h));
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    if (!cells.some((c) => (c ?? "").trim() !== "")) continue; // ردیف کاملاً خالی
    const fixed = reassemble
      ? reassembleRow(kinds, cells)
      : padRow(cells, headers.length);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (fixed[i] ?? "").trim();
    }
    rows.push(row);
  }
  return {
    headers,
    rows,
    delimiter: opts?.delimiter ?? ",",
    encoding: opts?.encoding ?? "",
  };
}

/** دیکد + تشخیص جداکننده + پارس + بازچینش — کل خط لولهٔ فایل‌های متنی */
export function parseDelimitedBuffer(
  buf: ArrayBuffer | Uint8Array
): ParsedTable {
  const { text, encoding } = decodeBuffer(buf);
  const delimiter = detectDelimiter(text);
  const matrix = parseCsvMatrix(text, delimiter);
  return matrixToTable(matrix, { delimiter, encoding, reassemble: true });
}
