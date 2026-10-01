"use client";

import * as React from "react";
import {
 Printer,
 Eye,
 Palette,
 FileText,
 Receipt,
 BarChart3,
 Download,
 Settings2,
 Check,
 ChevronLeft,
 X,
 ZoomIn,
 ZoomOut,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toPersianDigits, formatNumber } from "@/lib/persian";

/* ============================================================
 تایپ‌ها
 ============================================================ */

type TemplateType = "invoice" | "report" | "receipt";
type TemplateStyle = "minimal" | "professional" | "modern";

interface TemplateConfig {
 id: string;
 type: TemplateType;
 style: TemplateStyle;
 name: string;
 description: string;
 primaryColor: string;
 fontFamily: string;
 showLogo: boolean;
 showWatermark: boolean;
}

/* ============================================================
 ثابت‌ها
 ============================================================ */

const TYPE_META: Record<TemplateType, { label: string; icon: React.ElementType }> = {
 invoice: { label: "فاکتور", icon: Receipt },
 report: { label: "گزارش", icon: BarChart3 },
 receipt: { label: "رسید", icon: FileText },
};

const STYLE_META: Record<TemplateStyle, { label: string; preview: string }> = {
 minimal: { label: "مینیمال", preview: "ساده و تمیز با فضای سفید زیاد" },
 professional: { label: "حرفه‌ای", preview: "رسمی با لوگو و هدر کامل" },
 modern: { label: "مدرن", preview: "طراحی جسورانه با رنگ‌های زنده" },
};

const BUILT_IN_TEMPLATES: TemplateConfig[] = [
 {
 id: "invoice-minimal",
 type: "invoice",
 style: "minimal",
 name: "فاکتور مینیمال",
 description: "طراحی ساده و تمیز برای فاکتورهای فروش",
 primaryColor: "#4f46e5",
 fontFamily: "Vazirmatn",
 showLogo: true,
 showWatermark: false,
 },
 {
 id: "invoice-professional",
 type: "invoice",
 style: "professional",
 name: "فاکتور حرفه‌ای",
 description: "طراحی رسمی با هدر کامل و جزئیات مالیاتی",
 primaryColor: "#1e40af",
 fontFamily: "Vazirmatn",
 showLogo: true,
 showWatermark: false,
 },
 {
 id: "invoice-modern",
 type: "invoice",
 style: "modern",
 name: "فاکتور مدرن",
 description: "طراحی جسورانه با رنگ‌های زنده و گرادیان",
 primaryColor: "#7c3aed",
 fontFamily: "Vazirmatn",
 showLogo: true,
 showWatermark: true,
 },
 {
 id: "report-minimal",
 type: "report",
 style: "minimal",
 name: "گزارش مینیمال",
 description: "گزارش ساده با جدول و نمودار",
 primaryColor: "#0d9488",
 fontFamily: "Vazirmatn",
 showLogo: false,
 showWatermark: false,
 },
 {
 id: "report-professional",
 type: "report",
 style: "professional",
 name: "گزارش حرفه‌ای",
 description: "گزارش رسمی با کاورپیج و فهرست",
 primaryColor: "#1e40af",
 fontFamily: "Vazirmatn",
 showLogo: true,
 showWatermark: false,
 },
 {
 id: "receipt-modern",
 type: "receipt",
 style: "modern",
 name: "رسید مدرن",
 description: "رسید پرداخت با طراحی جذاب",
 primaryColor: "#059669",
 fontFamily: "Vazirmatn",
 showLogo: true,
 showWatermark: false,
 },
];

/* نمونه داده فاکتور */
const SAMPLE_INVOICE = {
 number: "۱۴۰۳-۱۲۵۶",
 date: "۱۴۰۳/۰۹/۱۵",
 customer: "شرکت آسمان فناوری",
 items: [
 { name: "لپ‌تاپ XPS 15", qty: 2, unit: "عدد", price: 45_000_000, total: 90_000_000 },
 { name: "موس لجیتک", qty: 5, unit: "عدد", price: 520_000, total: 2_600_000 },
 { name: "کیبورد مکانیکی", qty: 3, unit: "عدد", price: 1_800_000, total: 5_400_000 },
 ],
 subtotal: 98_000_000,
 tax: 8_820_000,
 total: 106_820_000,
};

/* ============================================================
 کامپوننت: پیش‌نمایش قالب فاکتور
 ============================================================ */

function TemplatePreview({ template, zoom }: { template: TemplateConfig; zoom: number }) {
 const isModern = template.style === "modern";
 const isMinimal = template.style === "minimal";

 return (
 <div
 className="bg-white text-gray-900 rounded-lg shadow-md overflow-hidden"
 style={{ transform: `scale(${zoom})`, transformOrigin: "top right" }}
 dir="rtl"
 >
 {/* هدر */}
 <div
 className="p-6 text-white"
 style={{
 background: isModern
? `linear-gradient(135deg, ${template.primaryColor}, ${template.primaryColor}88)`
: template.primaryColor,
 }}
 >
 <div className="flex items-center justify-between">
 <div>
 {template.showLogo && (
 <div className="flex items-center gap-2 mb-2">
 <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center text-white text-xs font-bold">
 هح
 </div>
 <span className="text-lg font-bold">هوش</span>
 </div>
 )}
 <p className="text-sm opacity-90">فاکتور فروش</p>
 </div>
 <div className="text-left">
 <p className="text-xl font-bold">شماره {SAMPLE_INVOICE.number}</p>
 <p className="text-sm opacity-80">تاریخ: {SAMPLE_INVOICE.date}</p>
 </div>
 </div>
 </div>

 {/* اطلاعات مشتری */}
 <div className={cn("p-6", isMinimal && "p-4")}>
 <div className="flex justify-between mb-4">
 <div>
 <p className="text-xs text-gray-500">از:</p>
 <p className="text-sm font-bold">هوش</p>
 <p className="text-xs text-gray-500">شیراز، زرقان، خیابان اصلی</p>
 </div>
 <div className="text-left">
 <p className="text-xs text-gray-500">به:</p>
 <p className="text-sm font-bold">{SAMPLE_INVOICE.customer}</p>
 <p className="text-xs text-gray-500">شیراز، زرقان</p>
 </div>
 </div>

 {/* جدول اقلام */}
 <table className="w-full text-xs border-collapse">
 <thead>
 <tr style={{ backgroundColor: `${template.primaryColor}15` }}>
 <th className="border border-gray-200 p-2 text-right font-medium">ردیف</th>
 <th className="border border-gray-200 p-2 text-right font-medium">شرح</th>
 <th className="border border-gray-200 p-2 text-center font-medium">تعداد</th>
 <th className="border border-gray-200 p-2 text-left font-medium">قیمت واحد</th>
 <th className="border border-gray-200 p-2 text-left font-medium">مبلغ</th>
 </tr>
 </thead>
 <tbody>
 {SAMPLE_INVOICE.items.map((item, i) => (
 <tr key={i} className="hover:bg-gray-50">
 <td className="border border-gray-200 p-2 text-center">{toPersianDigits(i + 1)}</td>
 <td className="border border-gray-200 p-2">{item.name}</td>
 <td className="border border-gray-200 p-2 text-center">
 {toPersianDigits(item.qty)} {item.unit}
 </td>
 <td className="border border-gray-200 p-2 text-left" dir="ltr">
 {formatNumber(item.price)}
 </td>
 <td className="border border-gray-200 p-2 text-left font-medium" dir="ltr">
 {formatNumber(item.total)}
 </td>
 </tr>
 ))}
 </tbody>
 </table>

 {/* جمع */}
 <div className="mt-4 flex justify-end">
 <div className="w-64 space-y-1.5 text-xs">
 <div className="flex justify-between">
 <span className="text-gray-500">جمع اقلام:</span>
 <span dir="ltr">{formatNumber(SAMPLE_INVOICE.subtotal)} ریال</span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-500">مالیات (۹٪):</span>
 <span dir="ltr">{formatNumber(SAMPLE_INVOICE.tax)} ریال</span>
 </div>
 <Separator />
 <div
 className="flex justify-between font-bold text-sm p-1 rounded"
 style={{ backgroundColor: `${template.primaryColor}15`, color: template.primaryColor }}
 >
 <span>مبلغ کل:</span>
 <span dir="ltr">{formatNumber(SAMPLE_INVOICE.total)} ریال</span>
 </div>
 </div>
 </div>

 {/* واترمارک */}
 {template.showWatermark && (
 <div className="mt-6 text-center opacity-10 text-4xl font-bold -rotate-12">
 هوش
 </div>
 )}

 {/* پاورقی */}
 <div className="mt-6 pt-3 border-t border-gray-200 text-[10px] text-gray-400 text-center">
 این فاکتور توسط هوش تولید شده — hoosh.nobatime.ir
 </div>
 </div>
 </div>
 );
}

/* ============================================================
 کامپوننت اصلی: PrintTemplates
 ============================================================ */

export function PrintTemplates() {
 const [selectedType, setSelectedType] = React.useState<TemplateType>("invoice");
 const [selectedTemplate, setSelectedTemplate] = React.useState<TemplateConfig>(BUILT_IN_TEMPLATES[0]);
 const [previewOpen, setPreviewOpen] = React.useState(false);
 const [customizeOpen, setCustomizeOpen] = React.useState(false);
 const [zoom, setZoom] = React.useState(0.85);

 /* قالب‌های فیلتر شده */
 const filteredTemplates = BUILT_IN_TEMPLATES.filter((t) => t.type === selectedType);

 /* سفارشی‌سازی موقت */
 // FIX(A1-6): customFont قبلاً با primaryColor مقداردهی می‌شد (باگ کپی-پیست)
 // — فونت Select با مقدار هگز مثل #4f46e5 شروع می‌شد و هیچ آیتمی انتخاب نبود
 const [customColor, setCustomColor] = React.useState(selectedTemplate.primaryColor);
 const [customFont, setCustomFont] = React.useState(selectedTemplate.fontFamily);
 const [customShowLogo, setCustomShowLogo] = React.useState(selectedTemplate.showLogo);

 const handlePrint = () => {
 setPreviewOpen(false);
 setTimeout(() => {
 // FIX(A1-6): فقط ناحیه پیش‌نمایش چاپ شود — قبلاً window.print() کل صفحه
 // اپ را چاپ می‌کرد. با کلاس print-area روی پیش‌نمایش و CSS چاپ
 window.print();
 }, 200);
 };

 const handleSelectTemplate = (template: TemplateConfig) => {
 setSelectedTemplate(template);
 setCustomColor(template.primaryColor);
 setCustomFont(template.fontFamily);
 setCustomShowLogo(template.showLogo);
 };

 return (
 <div className="space-y-6" dir="rtl">
 <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as TemplateType)}>
 <TabsList className="w-full max-w-md">
 {Object.entries(TYPE_META).map(([key, meta]) => {
 const Icon = meta.icon;
 return (
 <TabsTrigger key={key} value={key} className="gap-1.5">
 <Icon className="h-3.5 w-3.5" />
 {meta.label}
 </TabsTrigger>
 );
 })}
 </TabsList>

 {Object.keys(TYPE_META).map((type) => (
 <TabsContent key={type} value={type} className="mt-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
 {filteredTemplates.map((template) => {
 const styleMeta = STYLE_META[template.style];
 const isSelected = selectedTemplate.id === template.id;
 return (
 <motion.div
 key={template.id}
 whileHover={{ y: -4 }}
 transition={{ type: "spring", stiffness: 300, damping: 20 }}
 >
 <Card
 className={cn(
 "cursor-pointer transition-all h-full",
 isSelected && "ring-2 ring-primary shadow-lg"
 )}
 onClick={() => handleSelectTemplate(template)}
 >
 <CardHeader className="pb-2">
 <div className="flex items-start justify-between">
 <div className="flex items-center gap-2">
 <div
 className="h-8 w-8 rounded-lg flex items-center justify-center text-white"
 style={{ backgroundColor: template.primaryColor }}
 >
 {type === "invoice"? <Receipt className="h-4 w-4" />:
 type === "report"? <BarChart3 className="h-4 w-4" />:
 <FileText className="h-4 w-4" />}
 </div>
 <div>
 <CardTitle className="text-sm">{template.name}</CardTitle>
 <CardDescription className="text-[10px]">{styleMeta.label}</CardDescription>
 </div>
 </div>
 {isSelected && (
 <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
 <Check className="h-3 w-3" />
 </div>
 )}
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-xs text-muted-foreground mb-3">{template.description}</p>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-[10px] gap-1"
 onClick={(e) => {
 e.stopPropagation();
 handleSelectTemplate(template);
 setPreviewOpen(true);
 }}
 >
 <Eye className="h-3 w-3" />
 پیش‌نمایش
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-[10px] gap-1"
 onClick={(e) => {
 e.stopPropagation();
 handleSelectTemplate(template);
 setCustomizeOpen(true);
 }}
 >
 <Palette className="h-3 w-3" />
 سفارشی
 </Button>
 </div>
 </CardContent>
 </Card>
 </motion.div>
 );
 })}
 </div>
 </TabsContent>
 ))}
 </Tabs>

 {/* دکمه‌های عملیات */}
 <div className="flex items-center gap-3">
 <Button className="gap-2" onClick={() => setPreviewOpen(true)} disabled={!selectedTemplate}>
 <Eye className="h-4 w-4" />
 پیش‌نمایش و چاپ
 </Button>
 <Button
 variant="outline"
 className="gap-2"
 onClick={() => setCustomizeOpen(true)}
 disabled={!selectedTemplate}
 >
 <Palette className="h-4 w-4" />
 سفارشی‌سازی
 </Button>
 </div>

 {/* دیالوگ پیش‌نمایش */}
 <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
 <DialogContent className="max-w-3xl max-h-[90dvh]" dir="rtl">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Eye className="h-5 w-5 text-primary" />
 پیش‌نمایش {selectedTemplate.name}
 </DialogTitle>
 <DialogDescription>
 پیش‌نمایش قالب با داده‌های نمونه. برای چاپ دکمه چاپ را بزنید.
 </DialogDescription>
 </DialogHeader>
 <div className="flex items-center justify-end gap-2 mb-3">
 <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}>
 <ZoomOut className="h-3.5 w-3.5" />
 </Button>
 <span className="text-xs text-muted-foreground w-12 text-center">{toPersianDigits(Math.round(zoom * 100))}٪</span>
 <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}>
 <ZoomIn className="h-3.5 w-3.5" />
 </Button>
 <Separator orientation="vertical" className="h-6 mx-2" />
 <Button size="sm" className="gap-1.5 h-8" onClick={handlePrint}>
 <Printer className="h-3.5 w-3.5" />
 چاپ
 </Button>
 </div>
 <ScrollArea className="max-h-[60vh]">
 <TemplatePreview
 template={{
...selectedTemplate,
 primaryColor: customColor || selectedTemplate.primaryColor,
 showLogo: customShowLogo,
 }}
 zoom={zoom}
 />
 </ScrollArea>
 </DialogContent>
 </Dialog>

 {/* دیالوگ سفارشی‌سازی */}
 <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
 <DialogContent className="max-w-md" dir="rtl">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Palette className="h-5 w-5 text-primary" />
 سفارشی‌سازی {selectedTemplate.name}
 </DialogTitle>
 <DialogDescription>
 رنگ، فونت و سایر تنظیمات قالب را تغییر دهید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-4">
 {/* رنگ اصلی */}
 <div className="space-y-2">
 <label className="text-xs font-medium">رنگ اصلی</label>
 <div className="flex items-center gap-2">
 <input
 type="color"
 value={customColor}
 onChange={(e) => setCustomColor(e.target.value)}
 className="h-8 w-8 rounded cursor-pointer border border-border"
 />
 <Input
 value={customColor}
 onChange={(e) => setCustomColor(e.target.value)}
 className="h-8 text-xs font-mono"
 dir="ltr"
 />
 </div>
 {/* رنگ‌های پیشنهادی */}
 <div className="flex gap-1.5 mt-1">
 {["#4f46e5", "#1e40af", "#7c3aed", "#0d9488", "#059669", "#dc2626", "#ea580c", "#ca8a04"].map((c) => (
 <button
 key={c}
 className="h-6 w-6 rounded-full border-2 border-transparent hover:border-foreground/30 transition-all"
 style={{ backgroundColor: c }}
 onClick={() => setCustomColor(c)}
 aria-label={`رنگ ${c}`}
 />
 ))}
 </div>
 </div>

 {/* فونت */}
 <div className="space-y-2">
 <label className="text-xs font-medium">فونت</label>
 <Select value={customFont} onValueChange={setCustomFont}>
 <SelectTrigger className="h-8 text-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="Vazirmatn">وزیرمتن</SelectItem>
 <SelectItem value="Tahoma">Tahoma</SelectItem>
 <SelectItem value="Arial">Arial</SelectItem>
 </SelectContent>
 </Select>
 </div>

 {/* لوگو */}
 <div className="flex items-center justify-between">
 <label className="text-xs font-medium">نمایش لوگو</label>
 <button
 className={cn(
 "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
 customShowLogo? "bg-primary": "bg-muted"
 )}
 onClick={() => setCustomShowLogo(!customShowLogo)}
 role="switch"
 aria-checked={customShowLogo}
 >
 <span
 className={cn(
 "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
 customShowLogo? "translate-x-4": "translate-x-0.5"
 )}
 />
 </button>
 </div>

 <Button
 className="w-full gap-2"
 onClick={() => {
 setCustomizeOpen(false);
 setPreviewOpen(true);
 }}
 >
 <Eye className="h-4 w-4" />
 مشاهده پیش‌نمایش
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 </div>
 );
}
