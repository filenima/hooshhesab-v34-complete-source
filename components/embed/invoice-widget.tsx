"use client";

// ============ Embeddable Invoice Widget — هوش ============
// کامپوننت نمایش فاکتور برای embed در سایت‌های third-party.
// قابل استفاده به‌صورت <iframe src="https://hoosh.nobatime.ir/embed/invoice/ID" />

import * as React from "react";
import { FileText, Loader2, ShieldCheck, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toPersianDigits, formatToman } from "@/lib/persian";

interface InvoiceWidgetProps {
 invoiceId: string;
 /** اگر به true تنظیم شود، از API عمومی استفاده می‌کند */
 public?: boolean;
}

interface InvoiceData {
 number: string;
 type: string;
 status: string;
 date: string;
 dueDate?: string;
 partyName: string;
 items: Array<{
 description: string;
 quantity: number;
 unitPrice: number;
 total: number;
 }>;
 subtotal: number;
 tax: number;
 total: number;
 paidAmount: number;
}

export function InvoiceWidget({ invoiceId, public: isPublic = true }: InvoiceWidgetProps) {
 const [invoice, setInvoice] = React.useState<InvoiceData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [error, setError] = React.useState<string | null>(null);

 React.useEffect(() => {
 if (!invoiceId) return;
 setLoading(true);
 fetch(`/api/embed/invoice/${invoiceId}${isPublic? "?public=1": ""}`)
.then((r) => {
 if (!r.ok) throw new Error("فاکتور یافت نشد");
 return r.json();
 })
.then((data) => setInvoice(data))
.catch((err) => setError(err instanceof Error? err.message: "خطا"))
.finally(() => setLoading(false));
 }, [invoiceId, isPublic]);

 if (loading) {
 return (
 <div className="flex h-40 items-center justify-center text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin" />
 </div>
 );
 }

 if (error) {
 return (
 <div className="flex h-40 items-center justify-center text-destructive">
 {error}
 </div>
 );
 }

 if (!invoice) return null;

 return (
 <Card className="w-full max-w-2xl mx-auto">
 <CardContent className="space-y-4 p-6">
 {/* Header */}
 <div className="flex items-start justify-between border-b pb-4">
 <div>
 <div className="flex items-center gap-2">
 <FileText className="h-5 w-5 text-primary" />
 <span className="text-lg font-bold">
 {invoice.type === "SALE"? "فاکتور فروش": "فاکتور خرید"}
 </span>
 </div>
 <div className="mt-1 text-sm text-muted-foreground">
 شماره: {toPersianDigits(invoice.number)}
 </div>
 </div>
 <div className="text-left">
 <div className="text-sm text-muted-foreground">
 تاریخ: {toPersianDigits(invoice.date)}
 </div>
 {invoice.dueDate && (
 <div className="text-sm text-muted-foreground">
 سررسید: {toPersianDigits(invoice.dueDate)}
 </div>
 )}
 </div>
 </div>

 {/* Party */}
 <div>
 <div className="text-xs text-muted-foreground">طرف حساب</div>
 <div className="font-medium">{invoice.partyName}</div>
 </div>

 {/* Items */}
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b text-muted-foreground">
 <th className="py-2 text-right">شرح</th>
 <th className="py-2 text-center">تعداد</th>
 <th className="py-2 text-left">قیمت واحد</th>
 <th className="py-2 text-left">مبلغ کل</th>
 </tr>
 </thead>
 <tbody>
 {invoice.items.map((item, i) => (
 <tr key={i} className="border-b">
 <td className="py-2">{item.description}</td>
 <td className="py-2 text-center">{toPersianDigits(item.quantity)}</td>
 <td className="py-2 text-left">{formatToman(item.unitPrice)}</td>
 <td className="py-2 text-left font-medium">{formatToman(item.total)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Summary */}
 <div className="space-y-2 border-t pt-4">
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">جمع کل</span>
 <span>{formatToman(invoice.subtotal)}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">مالیات (۹٪)</span>
 <span>{formatToman(invoice.tax)}</span>
 </div>
 <div className="flex justify-between border-t pt-2 font-bold">
 <span>قابل پرداخت</span>
 <span className="text-primary">{formatToman(invoice.total)}</span>
 </div>
 {invoice.paidAmount > 0 && (
 <div className="flex justify-between text-sm text-primary">
 <span>پرداخت‌شده</span>
 <span>{formatToman(invoice.paidAmount)}</span>
 </div>
 )}
 </div>

 {/* Actions */}
 <div className="flex items-center justify-between border-t pt-4">
 <div className="flex items-center gap-1 text-xs text-muted-foreground">
 <ShieldCheck className="h-3 w-3 text-primary" />
 صادرشده توسط هوش
 </div>
 <div className="flex gap-2">
 <Button size="sm" variant="outline">
 <Printer className="h-3 w-3" />
 <span className="mr-1">چاپ</span>
 </Button>
 <Button size="sm" variant="outline">
 <Download className="h-3 w-3" />
 <span className="mr-1">PDF</span>
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>
 );
}
