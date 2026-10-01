"use client";

import * as React from "react";
import { Calculator, TrendingUp, Trophy, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toPersianDigits } from "@/lib/persian";
import {
 calculateSampleSize,
 calculateSignificance,
} from "@/lib/ab-test-calculator";

// ============ A/B Test Calculator UI ============
// ابزار محاسبه‌ی sample size و معناداری نتایج A/B test.

export function ABTestCalculator() {
 const [baselineRate, setBaselineRate] = React.useState("5");
 const [mde, setMde] = React.useState("1");
 const [significance, setSignificance] = React.useState("5");
 const [power, setPower] = React.useState("80");

 const [controlVisitors, setControlVisitors] = React.useState("1000");
 const [controlConversions, setControlConversions] = React.useState("50");
 const [variantVisitors, setVariantVisitors] = React.useState("1000");
 const [variantConversions, setVariantConversions] = React.useState("65");

 const sampleSize = React.useMemo(() => {
 const base = parseFloat(baselineRate) / 100;
 const effect = parseFloat(mde) / 100;
 const sig = parseFloat(significance) / 100;
 const pwr = parseFloat(power) / 100;
 if (!base ||!effect || base <= 0 || effect <= 0) return 0;
 return calculateSampleSize(base, effect, sig, pwr);
 }, [baselineRate, mde, significance, power]);

 const result = React.useMemo(() => {
 const cv = parseInt(controlVisitors, 10);
 const cc = parseInt(controlConversions, 10);
 const vv = parseInt(variantVisitors, 10);
 const vc = parseInt(variantConversions, 10);
 if (!cv ||!vv || cv < 0 || vv < 0) return null;
 return calculateSignificance(
 { visitors: cv, conversions: cc },
 { visitors: vv, conversions: vc }
 );
 }, [controlVisitors, controlConversions, variantVisitors, variantConversions]);

 const controlRate =
 parseInt(controlVisitors, 10) > 0
? (parseInt(controlConversions, 10) / parseInt(controlVisitors, 10)) * 100
: 0;
 const variantRate =
 parseInt(variantVisitors, 10) > 0
? (parseInt(variantConversions, 10) / parseInt(variantVisitors, 10)) * 100
: 0;

 return (
 <div className="space-y-5 animate-fade-in-up">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Calculator className="w-5 h-5 text-primary" />
 محاسبه‌گر تست A/B
 </CardTitle>
 <p className="text-sm text-muted-foreground">
 محاسبه‌ی حجم نمونه لازم و معناداری آماری نتایج — مبتنی بر two-proportion z-test.
 </p>
 </CardHeader>
 <CardContent className="space-y-6">
 {/* ============ Sample Size ============ */}
 <div className="space-y-3">
 <h3 className="font-semibold flex items-center gap-2">
 <TrendingUp className="w-4 h-4 text-primary" />
 محاسبه‌ی حجم نمونه لازم
 </h3>
 <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
 <div className="space-y-1">
 <Label className="text-xs">نرخ پایه (٪)</Label>
 <Input
 type="number"
 value={baselineRate}
 onChange={(e) => setBaselineRate(e.target.value)}
 dir="ltr"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">حداقل اثر قابل تشخیص (٪)</Label>
 <Input
 type="number"
 value={mde}
 onChange={(e) => setMde(e.target.value)}
 dir="ltr"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">سطح معناداری (٪)</Label>
 <Input
 type="number"
 value={significance}
 onChange={(e) => setSignificance(e.target.value)}
 dir="ltr"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">قدرت آماری (٪)</Label>
 <Input
 type="number"
 value={power}
 onChange={(e) => setPower(e.target.value)}
 dir="ltr"
 />
 </div>
 </div>

 <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-muted-foreground">حجم نمونه لازم برای هر گروه:</p>
 <p className="text-2xl font-bold text-primary mt-1">
 {sampleSize > 0 && sampleSize < Number.MAX_SAFE_INTEGER
? toPersianDigits(sampleSize.toLocaleString("fa-IR"))
: "نامعتبر"}
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 کل بازدیدکننده لازم: {sampleSize > 0 && sampleSize < Number.MAX_SAFE_INTEGER
? toPersianDigits((sampleSize * 2).toLocaleString("fa-IR"))
: "—"}
 </p>
 </div>
 <Info className="w-8 h-8 text-primary/40" />
 </div>
 </div>
 </div>

 {/* ============ Significance ============ */}
 <div className="space-y-3">
 <h3 className="font-semibold flex items-center gap-2">
 <Trophy className="w-4 h-4 text-primary" />
 ارزیابی نتایج
 </h3>
 <div className="grid sm:grid-cols-2 gap-4">
 <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
 <div className="flex items-center justify-between">
 <span className="font-medium">گروه کنترل (A)</span>
 <Badge variant="outline">baseline</Badge>
 </div>
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1">
 <Label className="text-xs">بازدیدکننده</Label>
 <Input
 type="number"
 value={controlVisitors}
 onChange={(e) => setControlVisitors(e.target.value)}
 dir="ltr"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">تبدیل</Label>
 <Input
 type="number"
 value={controlConversions}
 onChange={(e) => setControlConversions(e.target.value)}
 dir="ltr"
 />
 </div>
 </div>
 <p className="text-sm">
 نرخ تبدیل: <span className="font-bold text-primary">{toPersianDigits(controlRate.toFixed(2))}٪</span>
 </p>
 </div>

 <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
 <div className="flex items-center justify-between">
 <span className="font-medium">گروه آزمایش (B)</span>
 <Badge variant="outline">variant</Badge>
 </div>
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1">
 <Label className="text-xs">بازدیدکننده</Label>
 <Input
 type="number"
 value={variantVisitors}
 onChange={(e) => setVariantVisitors(e.target.value)}
 dir="ltr"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">تبدیل</Label>
 <Input
 type="number"
 value={variantConversions}
 onChange={(e) => setVariantConversions(e.target.value)}
 dir="ltr"
 />
 </div>
 </div>
 <p className="text-sm">
 نرخ تبدیل: <span className="font-bold text-primary">{toPersianDigits(variantRate.toFixed(2))}٪</span>
 </p>
 </div>
 </div>

 {result && (
 <div className="p-4 rounded-lg border border-border space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-sm text-muted-foreground">نتیجه‌ی آماری:</span>
 {result.winner === "variant" && result.isSignificant? (
 <Badge className="bg-emerald-600 text-white">
 <CheckCircle2 className="w-3 h-3 ml-1" />
 نسخه‌ی B برنده است
 </Badge>
 ): result.winner === "control" && result.isSignificant? (
 <Badge className="bg-rose-600 text-white">
 <AlertTriangle className="w-3 h-3 ml-1" />
 نسخه‌ی A بهتر است
 </Badge>
 ): (
 <Badge variant="secondary">
 <Info className="w-3 h-3 ml-1" />
 نتیجه قطعی نیست
 </Badge>
 )}
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
 <div className="p-2 rounded bg-muted/50">
 <p className="text-xs text-muted-foreground">p-value</p>
 <p className="font-mono font-bold" dir="ltr">
 {result.pValue < 0.001? "<0.001": result.pValue.toFixed(4)}
 </p>
 </div>
 <div className="p-2 rounded bg-muted/50">
 <p className="text-xs text-muted-foreground">سطح اطمینان</p>
 <p className="font-bold">
 {toPersianDigits((result.confidenceLevel * 100).toFixed(1))}٪
 </p>
 </div>
 <div className="p-2 rounded bg-muted/50">
 <p className="text-xs text-muted-foreground">اختلاف (uplift)</p>
 <p className={`font-bold ${result.uplift >= 0? "text-emerald-600": "text-rose-600"}`}>
 {result.uplift >= 0? "+": ""}
 {toPersianDigits((result.uplift * 100).toFixed(2))}٪
 </p>
 </div>
 <div className="p-2 rounded bg-muted/50">
 <p className="text-xs text-muted-foreground">معنادار؟</p>
 <p className={`font-bold ${result.isSignificant? "text-emerald-600": "text-muted-foreground"}`}>
 {result.isSignificant? "بله": "خیر"}
 </p>
 </div>
 </div>

 {!result.isSignificant && (
 <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700">
 <AlertTriangle className="w-4 h-4 inline ml-1" />
 نتیجه از نظر آماری معنادار نیست. برای نتیجه‌ی قطعی به {sampleSize > 0? toPersianDigits(sampleSize.toLocaleString("fa-IR")): "—"} بازدیدکننده در هر گروه نیاز دارید.
 </div>
 )}
 </div>
 )}
 </div>

 <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
 <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
 <div>
 <p className="font-medium mb-1">راهنما:</p>
 <ul className="space-y-1 list-disc list-inside">
 <li>نرخ پایه: نرخ تبدیل فعلی شما (مثلاً ۵٪).</li>
 <li>حداقل اثر قابل تشخیص: کوچکترین اختلافی که می‌خواهید شناسایی کنید.</li>
 <li>سطح معناداری ۹۵٪ و قدرت ۸۰٪ استانداردهای صنعتی هستند.</li>
 <li>p-value کمتر از ۰.۰۵ نشان‌دهنده‌ی معناداری آماری است.</li>
 </ul>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}
