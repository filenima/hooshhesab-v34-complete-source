"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Star, Send, CheckCircle2 } from "lucide-react";
import { toPersianDigits } from "@/lib/persian";

interface NPSSurveyProps {
 token?: string;
 autoShow?: boolean;
 triggerAfterDays?: number;
}

/**
 * Modal نظرسنجی NPS (Net Promoter Score).
 *
 * نمایش پس از ۷ روز فعالیت کاربر (به‌صورت پیش‌فرض).
 * امتیاز ۰ تا ۱۰ با slider.
 * بازخورد اختیاری در textarea.
 *
 * Usage:
 * <NPSSurvey token={userToken} />
 */
export function NPSSurvey({ token, autoShow = true, triggerAfterDays = 7 }: NPSSurveyProps) {
 const [open, setOpen] = React.useState(false);
 const [score, setScore] = React.useState(8);
 const [feedback, setFeedback] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);
 const [submitted, setSubmitted] = React.useState(false);
 const [thankYouMessage, setThankYouMessage] = React.useState("");

 // بررسی اینکه آیا باید نظرسنجی نمایش داده شود
 React.useEffect(() => {
 if (!autoShow ||!token) return;

 // بررسی localStorage — اگر قبلاً پاسخ داده، نمایش نده
 const dismissed = localStorage.getItem("hoshhesab_nps_dismissed");
 if (dismissed === "true") return;

 // بررسی session count — بعد از N روز activity
 const firstVisit = localStorage.getItem("hoshhesab_first_visit");
 if (!firstVisit) {
 localStorage.setItem("hoshhesab_first_visit", Date.now().toString());
 return;
 }

 const daysSinceFirstVisit = (Date.now() - Number(firstVisit)) / (86400000);
 if (daysSinceFirstVisit < triggerAfterDays) return;

 // دریافت وضعیت از سرور
 fetch("/api/marketing/nps", {
 headers: { Authorization: `Bearer ${token}` },
 })
.then((res) => res.json())
.then((data) => {
 if (data.success && data.data?.shouldShowSurvey) {
 // نمایش پس از ۳۰ ثانیه
 setTimeout(() => setOpen(true), 30000);
 }
 })
.catch(() => {
 /* ignore — never block user */
 });
 }, [token, autoShow, triggerAfterDays]);

 const handleSubmit = async () => {
 setSubmitting(true);
 try {
 const res = await fetch("/api/marketing/nps", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ score, feedback: feedback.trim() || undefined }),
 });
 const data = await res.json();
 if (data.success) {
 setSubmitted(true);
 setThankYouMessage(data.data?.thankYouMessage || "ممنون از بازخورد شما");
 localStorage.setItem("hoshhesab_nps_dismissed", "true");
 }
 } catch (err) {
 console.error("NPS submit failed:", err);
 } finally {
 setSubmitting(false);
 }
 };

 const handleDismiss = () => {
 setOpen(false);
 localStorage.setItem("hoshhesab_nps_dismissed", "true");
 };

 const getCategory = (s: number) => {
 if (s >= 9) return { label: "Promoter", color: "bg-emerald-100 text-emerald-700" };
 if (s >= 7) return { label: "Passive", color: "bg-amber-100 text-amber-700" };
 return { label: "Detractor", color: "bg-rose-100 text-rose-700" };
 };

 const category = getCategory(score);

 return (
 <Dialog open={open} onOpenChange={(o) => {
 if (!o) handleDismiss();
 else setOpen(o);
 }}>
 <DialogContent className="max-w-md">
 {!submitted? (
 <>
 <DialogHeader>
 <DialogTitle className="text-center text-xl">
 نظر شما درباره‌ی هوش
 </DialogTitle>
 <DialogDescription className="text-center">
 احتمال توصیه‌ی هوش به دوستان و همکارانتان؟
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-6 py-4">
 {/* Score display */}
 <div className="text-center">
 <div className="inline-flex items-center gap-2 mb-3">
 <span className="text-5xl font-bold text-primary">
 {toPersianDigits(score)}
 </span>
 <span className="text-2xl text-muted-foreground">/</span>
 <span className="text-2xl text-muted-foreground">{toPersianDigits(10)}</span>
 </div>
 <Badge className={category.color} variant="secondary">
 {category.label}
 </Badge>
 </div>

 {/* Slider */}
 <div className="space-y-2">
 <div className="flex justify-between text-xs text-muted-foreground">
 <span>اصلاً احتمال ندارد</span>
 <span>حتماً توصیه می‌کنم</span>
 </div>
 <Slider
 value={[score]}
 onValueChange={(vals) => setScore(vals[0] || 0)}
 min={0}
 max={10}
 step={1}
 className="w-full"
 />
 <div className="flex justify-between text-xs">
 {Array.from({ length: 11 }, (_, i) => (
 <span
 key={i}
 className={i === score? "font-bold text-primary": "text-muted-foreground"}
 >
 {toPersianDigits(i)}
 </span>
 ))}
 </div>
 </div>

 {/* Feedback */}
 <div className="space-y-2">
 <Label htmlFor="nps-feedback" className="text-sm">
 چه چیزی می‌تواند هوش را بهتر کند؟ (اختیاری)
 </Label>
 <Textarea
 id="nps-feedback"
 value={feedback}
 onChange={(e) => setFeedback(e.target.value)}
 placeholder="نظر، پیشنهاد یا انتقاد خود را بنویسید..."
 className="min-h-20 resize-none"
 maxLength={1000}
 />
 <p className="text-xs text-muted-foreground text-left">
 {toPersianDigits(feedback.length)}/{toPersianDigits(1000)}
 </p>
 </div>
 </div>

 <DialogFooter className="flex-row gap-2">
 <Button variant="ghost" onClick={handleDismiss} className="flex-1">
 بعداً
 </Button>
 <Button
 onClick={handleSubmit}
 disabled={submitting}
 className="flex-1"
 >
 <Send className="h-4 w-4 ml-2" />
 {submitting? "در حال ارسال...": "ارسال نظر"}
 </Button>
 </DialogFooter>
 </>
 ): (
 <>
 <DialogHeader>
 <DialogTitle className="text-center flex items-center justify-center gap-2">
 <CheckCircle2 className="h-6 w-6 text-emerald-500" />
 ممنون از شما
 </DialogTitle>
 </DialogHeader>
 <div className="py-6 text-center space-y-4">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100">
 <Star className="h-8 w-8 text-emerald-600 fill-emerald-600" />
 </div>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {thankYouMessage}
 </p>
 <div className="pt-2">
 <Button onClick={() => setOpen(false)} variant="outline">
 بستن
 </Button>
 </div>
 </div>
 </>
 )}
 </DialogContent>
 </Dialog>
 );
}
