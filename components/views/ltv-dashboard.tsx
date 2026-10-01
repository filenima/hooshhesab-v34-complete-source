"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { authFetch } from '@/lib/auth-fetch';
import { TrendingUp, Users, Coins, Activity, Loader2, Crown } from 'lucide-react';
import {
 ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Legend,
} from 'recharts';

interface LTVResponse {
 summary: {
 totalCustomers: number;
 totalLTV: number;
 avgLTV: number;
 medianLTV: number;
 predictedLTVNext12: number;
 avgMonthlyRevenue: number;
 models: { historical: number; simple_predictive: number; cohort_based: number };
 };
 segments?: { vip: number; high_value: number; low_value: number };
 distribution: Array<{ label: string; min: number; count: number; total: number }>;
 cohorts: Array<{ month: string; count: number; totalRevenue: number; avgLTV: number }>;
 segment: string;
 topCustomers: Array<{ partyId: string; ltv: number; invoices: number; avgMonthly: number; tenureMonths: number }>;
 isEmpty?: boolean;
 message?: string;
}

const persianDigits = (s: string | number): string =>
 String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const formatRial = (n: number): string => {
 if (n >= 1_000_000_000) return persianDigits((n / 1_000_000_000).toFixed(1)) + ' میلیارد';
 if (n >= 1_000_000) return persianDigits((n / 1_000_000).toFixed(0)) + ' میلیون';
 return persianDigits(n.toLocaleString('en-US'));
};

export default function LTVDashboard() {
 const [data, setData] = React.useState<LTVResponse | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [segment, setSegment] = React.useState('all');

 React.useEffect(() => {
 setLoading(true);
 authFetch(`/api/platform/analytics/ltv?segment=${segment}`)
.then(r => r.json())
.then(raw => {
 // پشتیبانی از هر دو شکل پاسخ: قدیمی (top-level) و جدید (data wrapper)
 const payload: LTVResponse | null =
 raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object'
? (raw.data as LTVResponse)
: (raw as LTVResponse);
 setData(payload);
 })
.catch(() => setData(null))
.finally(() => setLoading(false));
 }, [segment]);

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
 <Loader2 className="size-8 animate-spin text-primary" />
 </div>
 );
 }

 if (!data) {
 return (
 <div className="flex items-center justify-center min-h-[400px] text-muted-foreground" dir="rtl">
 داده‌ای برای نمایش موجود نیست.
 </div>
 );
 }

 // حالت خالی — وقتی هنوز فاکتوری ثبت نشده است
 if (data.isEmpty) {
 return (
 <div className="flex items-center justify-center min-h-[400px] px-4" dir="rtl">
 <div className="text-center max-w-md">
 <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
 <Crown className="size-8 opacity-50" />
 </div>
 <h2 className="text-lg font-bold mb-2">گزارش LTV خالی است</h2>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {data.message ||
 'هنوز داده‌ای برای محاسبه LTV ثبت نشده است. پس از صدور اولین فاکتورها، این گزارش به‌صورت خودکار به‌روزرسانی می‌شود.'}
 </p>
 </div>
 </div>
 );
 }

 return (
 <div className="space-y-4 p-4 md:p-6" dir="rtl">
 <div className="flex items-center justify-between">
 <h1 className="text-2xl font-bold flex items-center gap-2">
 <Crown className="size-6 text-primary" />
 داشبورد LTV (ارزش طول عمر مشتری)
 </h1>
 <Select value={segment} onValueChange={setSegment}>
 <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
 <SelectContent>
 <SelectItem value="all">همه</SelectItem>
 <SelectItem value="vip">VIP</SelectItem>
 <SelectItem value="high_value">با ارزش</SelectItem>
 <SelectItem value="low_value">کم‌ارزش</SelectItem>
 </SelectContent>
 </Select>
 </div>

 {/* خلاصه */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-xs text-muted-foreground">LTV میانگین</div>
 <div className="text-xl font-bold text-primary">{formatRial(data.summary.avgLTV)}</div>
 </div>
 <TrendingUp className="size-6 text-primary opacity-50" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-xs text-muted-foreground">LTV پیش‌بینی ۱۲ ماه</div>
 <div className="text-xl font-bold text-emerald-600">{formatRial(data.summary.predictedLTVNext12)}</div>
 </div>
 <Coins className="size-6 text-emerald-600 opacity-50" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-xs text-muted-foreground">تعداد مشتریان</div>
 <div className="text-xl font-bold">{persianDigits(data.summary.totalCustomers)}</div>
 </div>
 <Users className="size-6 opacity-50" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-xs text-muted-foreground">درآمد ماهانه میانگین</div>
 <div className="text-xl font-bold">{formatRial(data.summary.avgMonthlyRevenue)}</div>
 </div>
 <Activity className="size-6 opacity-50" />
 </div>
 </CardContent>
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* توزیع LTV */}
 <Card>
 <CardHeader><CardTitle>توزیع LTV</CardTitle></CardHeader>
 <CardContent>
 <ResponsiveContainer width="100%" height={250}>
 <BarChart data={data.distribution}>
 <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
 <XAxis dataKey="label" tick={{ fontSize: 10 }} />
 <YAxis tick={{ fontSize: 10 }} />
 <Tooltip />
 <Bar dataKey="count" name="تعداد" fill="#6366f1" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </CardContent>
 </Card>

 {/* Cohort analysis */}
 <Card>
 <CardHeader><CardTitle>روند LTV بر اساس Cohort</CardTitle></CardHeader>
 <CardContent>
 <ResponsiveContainer width="100%" height={250}>
 <AreaChart data={data.cohorts}>
 <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
 <XAxis dataKey="month" tick={{ fontSize: 10 }} />
 <YAxis tick={{ fontSize: 10 }} />
 <Tooltip />
 <Legend />
 <Area type="monotone" dataKey="avgLTV" name="LTV میانگین" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
 <Area type="monotone" dataKey="totalRevenue" name="درآمد کل" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
 </AreaChart>
 </ResponsiveContainer>
 </CardContent>
 </Card>
 </div>

 {/* مقایسه‌ی مدل‌ها */}
 <Card>
 <CardHeader><CardTitle>مقایسه‌ی مدل‌های محاسبه‌ی LTV</CardTitle></CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="p-4 rounded-lg bg-muted">
 <div className="text-xs text-muted-foreground mb-1">تاریخی (Historical)</div>
 <div className="text-lg font-bold">{formatRial(data.summary.models.historical)}</div>
 <div className="text-xs text-muted-foreground mt-1">میانگین درآمد گذشته</div>
 </div>
 <div className="p-4 rounded-lg bg-muted">
 <div className="text-xs text-muted-foreground mb-1">پیش‌بینی ساده</div>
 <div className="text-lg font-bold text-primary">{formatRial(data.summary.models.simple_predictive)}</div>
 <div className="text-xs text-muted-foreground mt-1">با فرض رشد ۵٪</div>
 </div>
 <div className="p-4 rounded-lg bg-muted">
 <div className="text-xs text-muted-foreground mb-1">بر اساس Cohort</div>
 <div className="text-lg font-bold text-emerald-600">{formatRial(data.summary.models.cohort_based)}</div>
 <div className="text-xs text-muted-foreground mt-1">آخرین cohort</div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* برترین مشتریان */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Crown className="size-5 text-amber-500" />
 برترین مشتریان بر اساس LTV
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="max-h-96 overflow-y-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>رتبه</TableHead>
 <TableHead>شناسه</TableHead>
 <TableHead>LTV</TableHead>
 <TableHead>تعداد فاکتور</TableHead>
 <TableHead>میانگین ماهانه</TableHead>
 <TableHead>طول عمر (ماه)</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {data.topCustomers.map((c, i) => (
 <TableRow key={c.partyId}>
 <TableCell><Badge variant={i < 3? 'default': 'outline'}>{persianDigits(i + 1)}</Badge></TableCell>
 <TableCell className="font-mono text-xs">{c.partyId}</TableCell>
 <TableCell className="font-bold text-primary">{formatRial(c.ltv)}</TableCell>
 <TableCell>{persianDigits(c.invoices)}</TableCell>
 <TableCell>{formatRial(c.avgMonthly)}</TableCell>
 <TableCell>{persianDigits(c.tenureMonths)}</TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}
