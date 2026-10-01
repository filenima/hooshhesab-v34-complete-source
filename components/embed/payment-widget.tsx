"use client";

// ============ Embeddable Payment Widget — هوش ============
// دکمه‌ی پرداخت قابل embed — برای فاکتورها یا لینک‌های پرداخت.
// استفاده: <iframe src="https://hoosh.nobatime.ir/embed/payment/INVOICE_ID" />

import * as React from "react";
import { CreditCard, Loader2, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toPersianDigits, formatToman } from "@/lib/persian";

interface PaymentWidgetProps {
 invoiceId: string;
 amount?: number;
 description?: string;
}

type PaymentStatus = "idle" | "processing" | "success" | "error";

export function PaymentWidget({ invoiceId, amount, description }: PaymentWidgetProps) {
 const [status, setStatus] = React.useState<PaymentStatus>("idle");
 const [payableAmount, setPayableAmount] = React.useState(amount?? 0);
 const [gatewayUrl, setGatewayUrl] = React.useState<string | null>(null);
 const [error, setError] = React.useState<string | null>(null);
 const [loading, setLoading] = React.useState(!amount);

 React.useEffect(() => {
 if (amount) return;
 fetch(`/api/embed/payment/${invoiceId}?amount=1`)
.then((r) => r.json())
.then((data) => {
 setPayableAmount(data.amount?? 0);
 setLoading(false);
 })
.catch(() => setLoading(false));
 }, [invoiceId, amount]);

 const handlePay = async () => {
 setStatus("processing");
 setError(null);
 try {
 const res = await fetch("/api/payments/create", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 invoiceId,
 amount: payableAmount,
 gateway: "zarinpal",
 callbackUrl: window.location.href,
 }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error?? "خطا در ایجاد تراکنش");

 if (data.gatewayUrl) {
 setGatewayUrl(data.gatewayUrl);
 // در محیط واقعی: redirect به درگاه
 setStatus("success");
 } else {
 throw new Error("آدرس درگاه دریافت نشد");
 }
 } catch (err) {
 setStatus("error");
 setError(err instanceof Error? err.message: "خطای ناشناخته");
 }
 };

 if (loading) {
 return (
 <div className="flex h-32 items-center justify-center text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin" />
 </div>
 );
 }

 return (
 <Card className="w-full max-w-sm mx-auto">
 <CardContent className="space-y-4 p-6">
 <div className="flex items-center justify-center">
 <div className="rounded-full bg-primary/10 p-3 text-primary">
 <CreditCard className="h-8 w-8" />
 </div>
 </div>

 <div className="text-center">
 <div className="text-2xl font-bold text-primary">
 {formatToman(payableAmount)}
 </div>
 {description && (
 <div className="mt-1 text-sm text-muted-foreground">{description}</div>
 )}
 <div className="mt-1 text-xs text-muted-foreground">
 شماره فاکتور: {toPersianDigits(invoiceId.slice(-8))}
 </div>
 </div>

 {status === "success" && gatewayUrl? (
 <div className="space-y-3">
 <div className="flex items-center justify-center gap-2 rounded-md bg-primary/5 p-3 text-primary">
 <CheckCircle2 className="h-5 w-5" />
 <span className="text-sm">تراکنش ایجاد شد</span>
 </div>
 <Button asChild className="w-full">
 <a href={gatewayUrl}>ورود به درگاه پرداخت</a>
 </Button>
 </div>
 ): (
 <Button
 className="w-full"
 onClick={handlePay}
 disabled={status === "processing"}
 >
 {status === "processing"? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <CreditCard className="h-4 w-4" />
 )}
 <span className="mr-2">پرداخت آنلاین</span>
 </Button>
 )}

 {status === "error" && error && (
 <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-sm text-destructive">
 <AlertCircle className="h-4 w-4" />
 {error}
 </div>
 )}

 <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
 <ShieldCheck className="h-3 w-3 text-primary" />
 پرداخت امن با درگاه‌های معتبر ایرانی
 </div>
 </CardContent>
 </Card>
 );
}
