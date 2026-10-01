"use client";

// ============ Embeddable Booking Widget — هوش ============
// فرم رزرو نوبت قابل embed — برای متخصصان و کسب‌وکارهای خدماتی.
// استفاده: <iframe src="https://hoosh.nobatime.ir/embed/booking/PROVIDER_ID" />

import * as React from "react";
import {
 Calendar,
 Clock,
 User,
 Phone,
 Loader2,
 CheckCircle2,
 AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toPersianDigits } from "@/lib/persian";

interface BookingWidgetProps {
 providerId: string;
 /** خدمات قابل رزرو — اگر undefined باشد از API دریافت می‌شود */
 services?: Array<{ id: string; name: string; durationMin: number; price: number }>;
}

interface TimeSlot {
 time: string;
 available: boolean;
}

const PERSIAN_DAYS = ["شنبه", "یک‌شنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];

export function BookingWidget({ providerId, services }: BookingWidgetProps) {
 const [availableServices, setAvailableServices] = React.useState(services?? []);
 const [selectedService, setSelectedService] = React.useState<string>("");
 const [selectedDate, setSelectedDate] = React.useState<string>("");
 const [selectedTime, setSelectedTime] = React.useState<string>("");
 const [slots, setSlots] = React.useState<TimeSlot[]>([]);
 const [customerName, setCustomerName] = React.useState("");
 const [customerPhone, setCustomerPhone] = React.useState("");
 const [loading, setLoading] = React.useState(!services);
 const [submitting, setSubmitting] = React.useState(false);
 const [result, setResult] = React.useState<string | null>(null);
 const [error, setError] = React.useState<string | null>(null);

 React.useEffect(() => {
 if (services) return;
 fetch(`/api/embed/booking/${providerId}`)
.then((r) => r.json())
.then((data) => {
 setAvailableServices(data.services?? []);
 setLoading(false);
 })
.catch(() => setLoading(false));
 }, [providerId, services]);

 React.useEffect(() => {
 if (!selectedDate ||!selectedService) return;
 // شبیه‌سازی دریافت slot‌های خالی
 const daySlots: TimeSlot[] = [];
 for (let h = 9; h < 18; h++) {
 daySlots.push({
 time: `${String(h).padStart(2, "0")}:00`,
 available: Math.random() > 0.3,
 });
 daySlots.push({
 time: `${String(h).padStart(2, "0")}:30`,
 available: Math.random() > 0.3,
 });
 }
 setSlots(daySlots);
 }, [selectedDate, selectedService]);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setSubmitting(true);
 setError(null);
 setResult(null);
 try {
 const res = await fetch("/api/embed/booking", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 providerId,
 serviceId: selectedService,
 date: selectedDate,
 time: selectedTime,
 customerName,
 customerPhone,
 }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error?? "خطا در ثبت نوبت");
 setResult(`نوبت شما با موفقیت ثبت شد. کد پیگیری: ${data.trackingCode}`);
 } catch (err) {
 setError(err instanceof Error? err.message: "خطا");
 } finally {
 setSubmitting(false);
 }
 };

 if (loading) {
 return (
 <div className="flex h-40 items-center justify-center text-muted-foreground">
 <Loader2 className="h-6 w-6 animate-spin" />
 </div>
 );
 }

 // تولید ۷ روز آینده
 const next7Days = Array.from({ length: 7 }, (_, i) => {
 const d = new Date();
 d.setDate(d.getDate() + i);
 return {
 iso: d.toISOString().slice(0, 10),
 label: `${PERSIAN_DAYS[(d.getDay() + 1) % 7]} ${toPersianDigits(d.getDate())}`,
 };
 });

 return (
 <Card className="w-full max-w-md mx-auto">
 <CardContent className="space-y-4 p-6">
 <div className="flex items-center gap-2 border-b pb-3">
 <Calendar className="h-5 w-5 text-primary" />
 <span className="font-bold">رزرو نوبت</span>
 </div>

 {result? (
 <div className="space-y-3">
 <div className="flex items-center gap-2 rounded-md border border-primary/50 bg-primary/5 p-3 text-primary">
 <CheckCircle2 className="h-5 w-5" />
 <span className="text-sm">{result}</span>
 </div>
 <Button variant="outline" className="w-full" onClick={() => setResult(null)}>
 رزرو نوبت دیگر
 </Button>
 </div>
 ): (
 <form onSubmit={handleSubmit} className="space-y-4">
 {/* Service */}
 <div className="space-y-2">
 <Label>خدمت موردنظر</Label>
 <select
 value={selectedService}
 onChange={(e) => setSelectedService(e.target.value)}
 className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
 required
 >
 <option value="">انتخاب کنید...</option>
 {availableServices.map((s) => (
 <option key={s.id} value={s.id}>
 {s.name} ({toPersianDigits(s.durationMin)} دقیقه)
 </option>
 ))}
 </select>
 </div>

 {/* Date */}
 <div className="space-y-2">
 <Label>روز</Label>
 <div className="grid grid-cols-4 gap-1">
 {next7Days.map((d) => (
 <Button
 key={d.iso}
 type="button"
 size="sm"
 variant={selectedDate === d.iso? "default": "outline"}
 onClick={() => setSelectedDate(d.iso)}
 className="flex-col h-auto py-2"
 >
 <span className="text-xs">{d.label.split(" ")[0]}</span>
 <span className="text-sm font-bold">{d.label.split(" ")[1]}</span>
 </Button>
 ))}
 </div>
 </div>

 {/* Time slots */}
 {selectedDate && (
 <div className="space-y-2">
 <Label className="flex items-center gap-1">
 <Clock className="h-3 w-3" />
 ساعت
 </Label>
 <div className="grid grid-cols-4 gap-1">
 {slots.map((s) => (
 <Button
 key={s.time}
 type="button"
 size="sm"
 variant={selectedTime === s.time? "default": "outline"}
 disabled={!s.available}
 onClick={() => setSelectedTime(s.time)}
 className="text-xs"
 >
 {toPersianDigits(s.time)}
 </Button>
 ))}
 </div>
 </div>
 )}

 {/* Customer info */}
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-2">
 <Label htmlFor="name" className="flex items-center gap-1">
 <User className="h-3 w-3" />
 نام
 </Label>
 <Input
 id="name"
 value={customerName}
 onChange={(e) => setCustomerName(e.target.value)}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="phone" className="flex items-center gap-1">
 <Phone className="h-3 w-3" />
 تلفن
 </Label>
 <Input
 id="phone"
 type="tel"
 value={customerPhone}
 onChange={(e) => setCustomerPhone(e.target.value)}
 required
 dir="ltr"
 />
 </div>
 </div>

 {error && (
 <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-sm text-destructive">
 <AlertCircle className="h-4 w-4" />
 {error}
 </div>
 )}

 <Button type="submit" className="w-full" disabled={submitting}>
 {submitting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Calendar className="h-4 w-4" />
 )}
 <span className="mr-2">ثبت نوبت</span>
 </Button>
 </form>
 )}
 </CardContent>
 </Card>
 );
}
