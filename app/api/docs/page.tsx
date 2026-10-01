"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Code2, BookOpen, KeyRound, Terminal } from 'lucide-react';

const SPEC_URL = '/api/open-api';

export default function ApiDocsPage() {
 const [spec, setSpec] = React.useState<Record<string, unknown> | null>(null);
 const [name, setName] = React.useState('');
 const [email, setEmail] = React.useState('');
 const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);
 const [loading, setLoading] = React.useState(false);

 React.useEffect(() => {
 fetch(SPEC_URL)
.then(r => r.json())
.then(setSpec)
.catch(() => setSpec(null));
 }, []);

 const handleCreateKey = async () => {
 if (!name ||!email) return;
 setLoading(true);
 try {
 const res = await fetch(SPEC_URL, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({ name, email, scopes: ['read'] }),
 });
 const data = await res.json() as { apiKey?: string; error?: string };
 if (data.apiKey) setGeneratedKey(data.apiKey);
 } finally {
 setLoading(false);
 }
 };

 const copyText = (text: string) => {
 navigator.clipboard.writeText(text).catch(() => null);
 };

 return (
 <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
 <div className="max-w-6xl mx-auto space-y-6">
 <header className="space-y-2">
 <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
 <BookOpen className="size-8" />
 مستندات API هوش
 </h1>
 <p className="text-muted-foreground">
 API عمومی برای یکپارچه‌سازی با سیستم حسابداری هوش. تمام مبالغ به ریال (IRR) و زبان فارسی RTL است.
 </p>
 </header>

 <Tabs defaultValue="overview" className="w-full">
 <TabsList className="grid w-full grid-cols-4">
 <TabsTrigger value="overview"><BookOpen className="size-4 ml-1" /> نمای کلی</TabsTrigger>
 <TabsTrigger value="endpoints"><Code2 className="size-4 ml-1" /> نقاط پایانی</TabsTrigger>
 <TabsTrigger value="auth"><KeyRound className="size-4 ml-1" /> احراز هویت</TabsTrigger>
 <TabsTrigger value="playground"><Terminal className="size-4 ml-1" /> محیط تست</TabsTrigger>
 </TabsList>

 <TabsContent value="overview">
 <Card>
 <CardHeader><CardTitle>معرفی</CardTitle></CardHeader>
 <CardContent className="space-y-4 text-sm leading-7">
 <p>API هوش بر پایه‌ی REST طراحی شده و از JSON برای پاسخ استفاده می‌کند.</p>
 <div className="grid grid-cols-2 gap-4">
 <div className="p-3 rounded-lg bg-muted">
 <div className="text-xs text-muted-foreground">نسخه</div>
 <div className="font-mono">v1.0.0</div>
 </div>
 <div className="p-3 rounded-lg bg-muted">
 <div className="text-xs text-muted-foreground">Base URL</div>
 <div className="font-mono text-xs">https://hesab.ir/api/v1</div>
 </div>
 </div>
 <div>
 <h3 className="font-semibold mb-2">ویژگی‌ها</h3>
 <ul className="list-disc pr-5 space-y-1">
 <li>REST API با پاسخ JSON</li>
 <li>احراز هویت با کلید API یا JWT</li>
 <li>محدودیت درخواست: ۱۰۰ درخواست در دقیقه برای هر کلید</li>
 <li>پشتیبانی از webhook برای رویدادها</li>
 <li>SDK رسمی برای JavaScript و Python</li>
 <li>پشتیبانی از چندارزی با نرخ لحظه‌ای</li>
 </ul>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="endpoints">
 <Card>
 <CardHeader><CardTitle>نقاط پایانی</CardTitle></CardHeader>
 <CardContent className="space-y-3">
 {Object.entries((spec as { paths?: Record<string, Record<string, { summary?: string }>> })?.paths || {}).map(([path, methods]) =>
 Object.entries(methods || {}).map(([method, def]) => (
 <div key={`${method}-${path}`} className="flex items-center gap-3 p-3 rounded-lg border">
 <Badge variant={method === 'get'? 'secondary': method === 'post'? 'default': 'outline'} className="font-mono">
 {method.toUpperCase()}
 </Badge>
 <code className="text-sm flex-1">{path}</code>
 <span className="text-sm text-muted-foreground">{def?.summary}</span>
 </div>
 ))
 )}
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="auth">
 <div className="space-y-4">
 <Card>
 <CardHeader><CardTitle>دریافت کلید API</CardTitle></CardHeader>
 <CardContent className="space-y-4">
 <div className="grid gap-2">
 <Label htmlFor="name">نام برنامه</Label>
 <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="مثلاً: اپلیکیشن فروش من" />
 </div>
 <div className="grid gap-2">
 <Label htmlFor="email">ایمیل</Label>
 <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
 </div>
 <Button onClick={handleCreateKey} disabled={loading ||!name ||!email}>
 {loading? 'در حال ایجاد...': 'ایجاد کلید API'}
 </Button>
 {generatedKey && (
 <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 space-y-2">
 <div className="text-xs text-muted-foreground">کلید API شما (فقط یک بار نمایش داده می‌شود):</div>
 <div className="flex items-center gap-2">
 <code className="text-xs flex-1 break-all">{generatedKey}</code>
 <Button size="sm" variant="outline" onClick={() => copyText(generatedKey)}>
 <Copy className="size-3" />
 </Button>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 <Card>
 <CardHeader><CardTitle>نمونه‌ی استفاده</CardTitle></CardHeader>
 <CardContent>
 <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto" dir="ltr">
{`curl -H "X-API-Key: $API_KEY" \\
 https://hesab.ir/api/v1/invoices`}
 </pre>
 </CardContent>
 </Card>
 </div>
 </TabsContent>

 <TabsContent value="playground">
 <Card>
 <CardHeader><CardTitle>محیط تست تعاملی</CardTitle></CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground mb-4">
 برای تست API، کلید API خود را وارد کرده و یک endpoint را انتخاب کنید.
 </p>
 <p className="text-sm">
 محیط تست کامل در نسخه‌ی بعدی فعال خواهد شد. تا آن زمان از
 <code className="text-xs bg-muted px-1 py-0.5 mx-1">curl</code>
 یا Postman استفاده کنید.
 </p>
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </div>
 </div>
 );
}
