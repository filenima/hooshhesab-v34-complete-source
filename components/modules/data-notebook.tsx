"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Play, Plus, Trash2, Code2, Database, Loader2, Terminal, AlertTriangle } from 'lucide-react';

interface NotebookCell {
 id: string;
 type: 'code' | 'markdown' | 'sql';
 source: string;
 output?: string;
 status: 'idle' | 'running' | 'success' | 'error';
 language: 'javascript' | 'python-like' | 'sql';
}

// ======== امنیت: محدودسازی context اجرای کد ========
// این ماژول از `new Function` + `with(ctx)` استفاده می‌کند که یک sandbox واقعی نیست.
// برای کاهش ریسک، globalهای خطرناک (دسترسی به DOM، storage، شبکه و...) در ctx
// با `undefined` shadow می‌شوند تا کد کاربر نتواند مستقیماً به آن‌ها دسترسی پیدا کند.
// توجه: این یک محافظت اولیه است و با تکنیک‌هایی مثل `({}).constructor.constructor` قابل دور زدن است؛
// به همین دلیل یک دیالوگ تأیید قبل از اجرای هر سلول نیز نمایش داده می‌شود.
const UNSAFE_GLOBALS = [
 'window', 'self', 'globalThis', 'top', 'parent', 'frames', 'opener',
 'document', 'localStorage', 'sessionStorage', 'cookie',
 'fetch', 'XMLHttpRequest', 'navigator', 'location', 'history',
 'alert', 'confirm', 'prompt', 'open', 'postMessage', 'print',
 'indexedDB', 'caches', 'serviceWorker', 'WebSocket', 'EventSource',
 'importScripts', 'Worker', 'SharedWorker',
] as const;

function buildSafeContext(userContext: Record<string, unknown>): Record<string, unknown> {
 const safe: Record<string, unknown> = {
 // فقط ابزارهای محاسباتی امن در دسترس قرار می‌گیرند
 Math,
 Date,
 JSON,
 Array,
 Object,
 String,
 Number,
 Boolean,
 Map,
 Set,
 WeakMap,
 WeakSet,
 Promise,
 RegExp,
 Error,
 console: {
 log: (...args: unknown[]) => console.log('[notebook]',...args),
 warn: (...args: unknown[]) => console.warn('[notebook]',...args),
 error: (...args: unknown[]) => console.error('[notebook]',...args),
 info: (...args: unknown[]) => console.info('[notebook]',...args),
 },
 parseInt,
 parseFloat,
 isNaN,
 isFinite,
 encodeURIComponent,
 decodeURIComponent,
 encodeURI,
 decodeURI,
 };
 // Shadow کردن globalهای خطرناک با undefined تا دسترسی مستقیم مسدود شود
 // ابتدا ابزارهای کاربر با safe merge می‌شوند، سپس globalهای خطرناک دوباره با undefined
 // override می‌شوند تا حتی اگر کاربر هم نام آن‌ها را در context گذاشته باشد، باز هم مسدود بمانند.
 const merged: Record<string, unknown> = {...safe,...userContext };
 for (const g of UNSAFE_GLOBALS) {
 merged[g] = undefined;
 }
 return merged;
}

// اجرای JavaScript در یک sandbox ساده (Function constructor)
function executeCode(code: string, context: Record<string, unknown>): { result: unknown; error?: string } {
 try {
 const safeCtx = buildSafeContext(context);
 const fn = new Function('ctx', 'with(ctx) { ' + code + '\n; return typeof __result!== "undefined"? __result: undefined; }');
 const wrapped = `var __result; ${code.replace(/=\s*[^;]+/g, m => {
 // اگر آخرین expression مقدار بازمی‌گرداند، آن را در __result ذخیره کن
 return m;
 })}`;
 void wrapped;
 const result = fn(safeCtx);
 return { result };
 } catch (e) {
 return { result: undefined, error: (e as Error).message };
 }
}

// اجرای Python-like: ترجمه‌ی ساده به JS
function executePythonLike(code: string, context: Record<string, unknown>): { result: unknown; error?: string; output: string[] } {
 const output: string[] = [];
 const safeBase = buildSafeContext(context);
 const capturedContext = {...safeBase, print: (...args: unknown[]) => output.push(args.map(String).join(' ')) };
 try {
 let js = code
.replace(/^(\s*)def\s+(\w+)\s*\(([^)]*)\):/gm, '$1function $2($3) {')
.replace(/^(\s*)for\s+(\w+)\s+in\s+range\((\d+)\):/gm, '$1for (let $2 = 0; $2 < $3; $2++) {')
.replace(/^(\s*)for\s+(\w+)\s+in\s+(\w+):/gm, '$1for (const $2 of $3) {')
.replace(/^(\s*)if\s+(.+):/gm, '$1if ($2) {')
.replace(/^(\s*)else\s+if\s+(.+):/gm, '$1} else if ($2) {')
.replace(/^(\s*)else:/gm, '$1} else {')
.replace(/^(\s*)while\s+(.+):/gm, '$1while ($2) {')
.replace(/True/g, 'true').replace(/False/g, 'false').replace(/None/g, 'null').replace(/null/g, 'null');
 // افزودن براکتهای بسته (ساده — برای دمو)
 const lines = js.split('\n');
 const indents: number[] = [];
 const result: string[] = [];
 for (const line of lines) {
 const indent = line.match(/^\s*/)?.[0].length || 0;
 while (indents.length > 0 && indent < indents[indents.length - 1]) {
 result.push(' '.repeat(indents[indents.length - 1]) + '}');
 indents.pop();
 }
 result.push(line);
 if (line.trim().endsWith('{')) indents.push(indent);
 }
 while (indents.length > 0) {
 result.push(' '.repeat(indents[indents.length - 1]) + '}');
 indents.pop();
 }
 js = result.join('\n');
 const fn = new Function('ctx', 'with(ctx) { ' + js + ' }');
 fn(capturedContext);
 return { result: output.join('\n'), output };
 } catch (e) {
 return { result: undefined, error: (e as Error).message, output };
 }
}

export default function DataNotebook() {
 const [cells, setCells] = React.useState<NotebookCell[]>([
 {
 id: 'cell_1',
 type: 'markdown',
 source: '# دفترچه‌ی تحلیل داده‌ی هوش\n\nاین دفترچه امکان اجرای کد JavaScript و Python-like را در مرورگر فراهم می‌کند.\nمی‌توانید با داده‌های هوش کار کنید و نتایج را به‌صورت زنده ببینید.',
 status: 'idle',
 language: 'javascript',
 },
 {
 id: 'cell_2',
 type: 'code',
 source: '// محاسبه‌ی میانگین مبالغ فاکتورها\nconst invoices = [\n { amount: 1200000, status: "paid" },\n { amount: 3400000, status: "paid" },\n { amount: 850000, status: "pending" },\n { amount: 2100000, status: "paid" }\n];\nconst paid = invoices.filter(i => i.status === "paid");\nconst total = paid.reduce((s, i) => s + i.amount, 0);\nconst avg = total / paid.length;\n__result = { count: paid.length, total, avg };',
 status: 'idle',
 language: 'javascript',
 },
 ]);
 const [context, setContext] = React.useState<Record<string, unknown>>({});

 const runCell = (id: string) => {
 // تأیید قبل از اجرا: کد ممکن است خطرناک باشد
 const cell = cells.find(c => c.id === id);
 if (cell?.type === 'code') {
 const ok = typeof window!== 'undefined'
? window.confirm('آیا از اجرای این کد مطمئن هستید؟\nکد در مرورگر شما اجرا می‌شود — از اجرای کدهای ناشناس یا غیرقابل اعتماد خودداری کنید.')
: true;
 if (!ok) return;
 }
 setCells(prev => prev.map(c => c.id === id? {...c, status: 'running' }: c));
 setTimeout(() => {
 setCells(prev => prev.map(c => {
 if (c.id!== id) return c;
 try {
 let result: unknown;
 let output = '';
 if (c.language === 'javascript') {
 const r = executeCode(c.source, context);
 if (r.error) throw new Error(r.error);
 result = r.result;
 } else if (c.language === 'python-like') {
 const r = executePythonLike(c.source, context);
 if (r.error) throw new Error(r.error);
 result = r.result;
 output = r.output.join('\n');
 }
 // ذخیره‌ی متغیرهای تعریف شده در context (ساده‌شده)
 const formatted = formatResult(result);
 if (output) {
 return {...c, status: 'success' as const, output: output + (formatted? '\n ' + formatted: '') };
 }
 return {...c, status: 'success' as const, output: formatted };
 } catch (e) {
 return {...c, status: 'error' as const, output: `Error: ${(e as Error).message}` };
 }
 }));
 }, 100);
 };

 const formatResult = (result: unknown): string => {
 if (result === undefined) return 'undefined';
 if (typeof result === 'string') return result;
 try {
 return JSON.stringify(result, null, 2);
 } catch {
 return String(result);
 }
 };

 const addCell = (type: NotebookCell['type']) => {
 const id = `cell_${Date.now()}`;
 setCells(prev => [...prev, {
 id, type, source: '', status: 'idle',
 language: type === 'code'? 'javascript': 'javascript',
 }]);
 };

 const updateCell = (id: string, source: string) => {
 setCells(prev => prev.map(c => c.id === id? {...c, source }: c));
 };

 const deleteCell = (id: string) => {
 setCells(prev => prev.filter(c => c.id!== id));
 };

 const runAll = () => {
 // تأیید یکباره قبل از اجرای همه‌ی سلول‌ها
 const codeCells = cells.filter(c => c.type!== 'markdown');
 if (codeCells.length > 0) {
 const ok = typeof window!== 'undefined'
? window.confirm(`آیا از اجرای ${codeCells.length} سلول کد مطمئن هستید؟\nکد در مرورگر شما اجرا می‌شود — از اجرای کدهای ناشناس یا غیرقابل اعتماد خودداری کنید.`)
: true;
 if (!ok) return;
 }
 codeCells.forEach(c => runCell(c.id));
 };

 return (
 <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto" dir="rtl">
 {/* بنر هشدار امنیتی — ابزار توسعه‌دهندگان */}
 <div
 role="alert"
 className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
 >
 <AlertTriangle className="size-5 shrink-0 mt-0.5" />
 <div className="text-xs leading-6">
 <span className="font-bold"><AlertTriangle className="inline h-4 w-4" /> این ابزار برای توسعه‌دهندگان است. کد را با احتیاط اجرا کنید.</span>
 <br />
 کدی که در این دفترچه می‌نویسید در مرورگر شما اجرا می‌شود. از اجرای کدهای ناشناس یا کپی‌شده از منابع غیرقابل اعتماد خودداری کنید،
 زیرا ممکن است به داده‌های حساب کاربری شما دسترسی پیدا کند. قبل از اجرای هر سلول، تأیید شما خواسته می‌شود.
 </div>
 </div>

 <Card>
 <CardHeader className="flex flex-row items-center justify-between">
 <CardTitle className="flex items-center gap-2">
 <Terminal className="size-5 text-primary" />
 دفترچه‌ی تحلیل داده
 </CardTitle>
 <div className="flex items-center gap-2">
 <Button size="sm" variant="outline" onClick={() => addCell('code')}><Plus className="size-4 ml-1" /> سلول کد</Button>
 <Button size="sm" variant="outline" onClick={() => addCell('markdown')}><Plus className="size-4 ml-1" /> متن</Button>
 <Button size="sm" onClick={runAll}><Play className="size-4 ml-1" /> اجرای همه</Button>
 </div>
 </CardHeader>
 </Card>

 {cells.map((cell, idx) => (
 <Card key={cell.id}>
 <CardHeader className="pb-2">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Badge variant="outline">سلول {idx + 1}</Badge>
 <Badge variant={cell.type === 'code'? 'default': 'secondary'}>
 {cell.type === 'code'? <Code2 className="size-3 ml-1" />: <Database className="size-3 ml-1" />}
 {cell.type}
 </Badge>
 {cell.status === 'running' && <Loader2 className="size-4 animate-spin text-primary" />}
 {cell.status === 'success' && <Badge variant="default" className="bg-emerald-500">موفق</Badge>}
 {cell.status === 'error' && <Badge variant="destructive">خطا</Badge>}
 </div>
 <div className="flex items-center gap-1">
 {cell.type === 'code' && (
 <Button size="sm" variant="ghost" onClick={() => runCell(cell.id)}>
 <Play className="size-4" />
 </Button>
 )}
 <Button size="sm" variant="ghost" onClick={() => deleteCell(cell.id)}>
 <Trash2 className="size-4 text-red-500" />
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-2">
 <textarea
 className="w-full min-h-[100px] p-3 rounded-md border border-border bg-muted font-mono text-sm"
 dir="ltr"
 value={cell.source}
 onChange={e => updateCell(cell.id, e.target.value)}
 placeholder={cell.type === 'markdown'? '# متن Markdown...': '// کد JavaScript...'}
 />
 {cell.output && (
 <pre className={`p-3 rounded-md font-mono text-xs overflow-x-auto ${
 cell.status === 'error'? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300': 'bg-muted'
 }`} dir="ltr">
 {cell.output}
 </pre>
 )}
 </CardContent>
 </Card>
 ))}

 {cells.length === 0 && (
 <Card>
 <CardContent className="text-center py-12 text-muted-foreground">
 هنوز سلولی اضافه نشده است. روی «سلول کد» کلیک کنید.
 </CardContent>
 </Card>
 )}
 </div>
 );
}
