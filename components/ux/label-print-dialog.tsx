"use client";

// ============ هوش — چاپ لیبل قیمت/بارکد کالاها (v13.2) ============
// برای خرده‌فروشی‌ها: انتخاب کالاها در انبار → چاپ لیبل قیمت یا بارکد برای
// قفسه‌ها. سه سایز استاندارد + بارکد Code128 (انکودر خالص SVG — بدون
// کتابخانهٔ خارجی) + QR اختیاری + چاپ از طریق iframe ایزوله (همیشه کار
// می‌کند، حتی با popup-blocker).

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Tag, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ---------- داده ورودی ----------
export interface LabelProduct {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price?: number | null;
  unit?: string | null;
}

type LabelSizeId = "small" | "medium" | "large";

const LABEL_SIZES: Record<
  LabelSizeId,
  { w: number; h: number; label: string; nameSize: number; priceSize: number; bcH: number; qr: number }
> = {
  small: { w: 38, h: 19, label: "کوچک — ۳۸×۱۹", nameSize: 7, priceSize: 8.5, bcH: 8, qr: 12 },
  medium: { w: 50, h: 25, label: "متوسط — ۵۰×۲۵", nameSize: 8, priceSize: 10.5, bcH: 10, qr: 15 },
  large: { w: 100, h: 50, label: "بزرگ — ۱۰۰×۵۰", nameSize: 13, priceSize: 18, bcH: 20, qr: 30 },
};

// ============ Code128-B Encoder (SVG) — خالص، بدون وابستگی ============
// الگوهای استاندارد Code128 (عرض‌های متناوب bar/space). value 104=StartB, 106=Stop
const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

/**
 * کدگذاری متن ASCII به SVG بارکد Code128-B.
 * فقط کاراکترهای ASCII 32..126 پشتیبانی می‌شود (استاندارد Code-B)؛
 * کاراکترهای غیرمجاز با «-» جایگزین می‌شوند تا بارکد همیشه معتبر بماند.
 */
export function BarcodeSvg({
  text,
  height = 40,
  moduleWidth = 1.6,
  showText = true,
  className,
}: {
  text: string;
  height?: number;
  moduleWidth?: number;
  showText?: boolean;
  className?: string;
}) {
  const clean = (text || "")
    .split("")
    .map((ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126 ? ch : "-"))
    .join("")
    .slice(0, 24) // سقف طول برای خوانایی اسکنر
    .trim();
  if (!clean) return null;

  // start-B(104) + کاراکترها + checksum + stop(106)
  const values: number[] = [104];
  for (const ch of clean) values.push(ch.charCodeAt(0) - 32);
  let sum = 104; // مقدار start-B
  values.slice(1).forEach((v, i) => {
    sum += v * (i + 1);
  });
  values.push(sum % 103, 106);

  // ساخت مسیر barها
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const v of values) {
    const pat = CODE128_PATTERNS[v];
    if (!pat) continue;
    for (let i = 0; i < pat.length; i++) {
      const w = parseInt(pat[i], 10);
      if (i % 2 === 0) bars.push({ x, w }); // زوج = bar، فرد = space
      x += w;
    }
  }
  const totalModules = x;
  const textH = showText ? Math.max(9, height * 0.22) : 0;
  const svgW = totalModules * moduleWidth;
  const svgH = height + textH;

  return (
    <svg
      className={className}
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      role="img"
      aria-label={`بارکد ${clean}`}
      style={{ direction: "ltr" }}
    >
      <rect x={0} y={0} width={svgW} height={svgH} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x * moduleWidth} y={0} width={b.w * moduleWidth} height={height} fill="#000" />
      ))}
      {showText && (
        <text
          x={svgW / 2}
          y={height + textH - 1}
          textAnchor="middle"
          fontSize={textH * 0.72}
          fontFamily="monospace"
          fill="#000"
        >
          {clean}
        </text>
      )}
    </svg>
  );
}

// ---------- قالب‌بندی قیمت ----------
function fmtPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fa-IR").format(Math.round(n)) + " ت";
}

// ============ دیالوگ اصلی ============
export function LabelPrintDialog({
  open,
  onOpenChange,
  products,
  storeName = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: LabelProduct[];
  storeName?: string;
}) {
  const [size, setSize] = React.useState<LabelSizeId>("medium");
  const [copies, setCopies] = React.useState(1);
  const [showPrice, setShowPrice] = React.useState(true);
  const [showBarcode, setShowBarcode] = React.useState(true);
  const [showQr, setShowQr] = React.useState(false);
  const [showStore, setShowStore] = React.useState(true);
  const [store, setStore] = React.useState(storeName);

  const cfg = LABEL_SIZES[size];
  const totalLabels = products.length * Math.max(1, Math.min(copies, 50));

  // شناسهٔ بارکد: ترجیحاً barcode، بعد SKU، آخر ID عددی
  const bcText = (p: LabelProduct) =>
    (p.barcode?.trim() || p.sku?.trim() || p.id.replace(/\D/g, "").slice(-12) || "0");

  // ---------- چاپ از طریق iframe ایزوله ----------
  const handlePrint = () => {
    if (products.length === 0) return;
    // outerHTML پیش‌نمایش (SVGهای واقعی بارکد/QR) را برمی‌داریم
    const gridEl = document.getElementById("labels-print-grid");
    if (!gridEl) {
      toast({ title: "خطا در آماده‌سازی چاپ", variant: "destructive" });
      return;
    }
    const cells = Array.from(gridEl.querySelectorAll<HTMLElement>(".label-cell")).map(
      (c) => c.outerHTML
    );

    const html = `<!doctype html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8">
<title>چاپ لیبل — هوش</title>
<style>
  @page { margin: 4mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 0; font-family: Tahoma, "Segoe UI", sans-serif; background: #fff; }
  .grid {
    display: flex; flex-wrap: wrap; gap: 2mm;
    width: 100%;
  }
  .label-cell {
    width: ${cfg.w}mm; height: ${cfg.h}mm;
    border: 0.3mm dashed #bbb;
    border-radius: 1mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    overflow: hidden; padding: 1mm;
    text-align: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  @media print {
    .label-cell { border-color: #000; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="grid">${cells.join("\n")}</div>
</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;";
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        toast({
          title: "ارسال به چاپگر",
          description: `${totalLabels} لیبل آماده چاپ شد.`,
        });
      } catch {
        toast({ title: "خطا در چاپ — مرورگر شما اجازهٔ چاپ نداد", variant: "destructive" });
      }
      // پاک‌سازی iframe بعد از فرصت چاپ
      setTimeout(() => iframe.remove(), 60_000);
    };
  };

  // ---------- رندر یک لیبل (پیش‌نمایش = همان چیزی که چاپ می‌شود) ----------
  const renderCell = (p: LabelProduct, key: React.Key) => {
    const qrValue = `${p.name}|${bcText(p)}|${p.price ?? ""}`;
    return (
      <div
        key={key}
        className="label-cell bg-white text-black flex flex-col items-center justify-center overflow-hidden"
        style={{
          width: `${cfg.w}mm`,
          height: `${cfg.h}mm`,
          borderRadius: "1mm",
          border: "0.3mm dashed #bbb",
          padding: "1mm",
          textAlign: "center",
        }}
      >
        {showStore && store.trim() && (
          <div style={{ fontSize: `${cfg.nameSize * 0.78}pt`, fontWeight: 700, lineHeight: 1.15 }}>
            {store.trim().slice(0, 30)}
          </div>
        )}
        <div
          style={{
            fontSize: `${cfg.nameSize}pt`,
            fontWeight: 600,
            lineHeight: 1.2,
            maxWidth: "92%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={p.name}
        >
          {p.name}
        </div>
        {showPrice && (
          <div style={{ fontSize: `${cfg.priceSize}pt`, fontWeight: 800, lineHeight: 1.25 }}>
            {fmtPrice(p.price)}
          </div>
        )}
        {showBarcode && (
          <div className="flex items-center justify-center" style={{ marginTop: "0.4mm" }}>
            <BarcodeSvg text={bcText(p)} height={cfg.bcH} moduleWidth={size === "large" ? 1.5 : 1.1} />
          </div>
        )}
        {showQr && (
          <div style={{ marginTop: "0.4mm", lineHeight: 0 }}>
            <QRCodeSVG value={qrValue.slice(0, 300)} size={cfg.qr} level="L" />
          </div>
        )}
      </div>
    );
  };

  const cells: React.ReactNode[] = [];
  for (const p of products.slice(0, 120)) {
    for (let i = 0; i < Math.max(1, Math.min(copies, 50)); i++) {
      cells.push(renderCell(p, `${p.id}-${i}`));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-3.5 gap-2.5">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-primary" />
            چاپ لیبل قیمت و بارکد
          </DialogTitle>
          <DialogDescription className="text-xs">
            {products.length > 0
              ? `برای ${new Intl.NumberFormat("fa-IR").format(products.length)} کالا — پیش‌نمایش زیر دقیقاً همان است که چاپ می‌شود.`
              : "کالایی انتخاب نشده است."}
          </DialogDescription>
        </DialogHeader>

        {products.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            ابتدا از جدول انبار کالاهای موردنظر را انتخاب کنید (یا بدون انتخاب، همهٔ کالاهای فیلترشده چاپ می‌شوند).
          </div>
        ) : (
          <>
            {/* تنظیمات */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">اندازهٔ لیبل</Label>
                <RadioGroup
                  value={size}
                  onValueChange={(v) => setSize(v as LabelSizeId)}
                  className="flex flex-wrap gap-x-3 gap-y-1"
                >
                  {(Object.keys(LABEL_SIZES) as LabelSizeId[]).map((k) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <RadioGroupItem value={k} id={`ls-${k}`} className="h-3.5 w-3.5" />
                      <Label htmlFor={`ls-${k}`} className="text-[11px] font-normal cursor-pointer">
                        {LABEL_SIZES[k].label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-1">
                <Label htmlFor="lp-copies" className="text-[11px]">
                  تعداد از هر کالا
                </Label>
                <Select
                  value={String(copies)}
                  onValueChange={(v) => setCopies(parseInt(v, 10))}
                >
                  <SelectTrigger id="lp-copies" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5, 10, 20].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {new Intl.NumberFormat("fa-IR").format(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="lp-store" className="text-[11px]">
                  نام فروشگاه روی لیبل
                </Label>
                <Input
                  id="lp-store"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  placeholder="مثلاً: سوپرمارکت تهران"
                  className="h-8 text-xs"
                  maxLength={40}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border bg-muted/40 px-3 py-2">
              {[
                { v: showPrice, set: setShowPrice, l: "قیمت" },
                { v: showBarcode, set: setShowBarcode, l: "بارکد خطی (SKU)" },
                { v: showQr, set: setShowQr, l: "کد QR" },
                { v: showStore, set: setShowStore, l: "نام فروشگاه" },
              ].map((f) => (
                <label key={f.l} className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox checked={f.v} onCheckedChange={(v) => f.set(v === true)} className="h-3.5 w-3.5" />
                  {f.l}
                </label>
              ))}
            </div>

            {/* پیش‌نمایش */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  پیش‌نمایش ({new Intl.NumberFormat("fa-IR").format(Math.min(totalLabels, 600))} لیبل)
                </span>
                {totalLabels > 600 && (
                  <span className="text-[10px] text-amber-600">
                    نمایش ۶۰۰ لیبل اول — همه در چاپ می‌آیند
                  </span>
                )}
              </div>
              <div
                id="labels-print-grid"
                className="flex max-h-56 flex-wrap content-start gap-1.5 overflow-y-auto rounded-md border bg-neutral-100 p-2"
              >
                {cells.slice(0, 600)}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-2.5">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                کاغذ A4 را در تنظیمات چاپگر انتخاب کنید؛ حاشیه‌ها را «پیش‌فرض» بگذارید.
              </p>
              <Button onClick={handlePrint} className="gap-1.5" size="sm">
                <Printer className="h-4 w-4" />
                چاپ {new Intl.NumberFormat("fa-IR").format(totalLabels)} لیبل
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
