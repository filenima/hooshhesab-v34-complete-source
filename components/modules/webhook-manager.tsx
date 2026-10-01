"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
 Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
 Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
 Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Webhook, Trash2, Pencil, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useConfirmAction } from '@/components/ux/confirm-action';
import { authFetch } from '@/lib/auth-fetch';

interface Webhook {
 id: string;
 url: string;
 events: string[];
 secret: string;
 isActive: boolean;
 lastTriggeredAt?: string;
 successCount: number;
 failureCount: number;
}

const AVAILABLE_EVENTS = [
 { value: 'invoice.created', label: 'فاکتور ایجاد شد' },
 { value: 'invoice.paid', label: 'فاکتور پرداخت شد' },
 { value: 'invoice.overdue', label: 'فاکتور سررسید شد' },
 { value: 'party.created', label: 'طرف‌حساب ایجاد شد' },
 { value: 'payment.received', label: 'پرداخت دریافت شد' },
 { value: 'journal.posted', label: 'سند ثبت شد' },
 { value: 'tax.reported', label: 'مالیات گزارش شد' },
 { value: 'inventory.low_stock', label: 'موجودی کم شد' },
 { value: 'user.invited', label: 'کاربر دعوت شد' },
];

export default function WebhookManager() {
 const { toast } = useToast();
 const { confirm, ConfirmDialogComponent } = useConfirmAction();
 const [webhooks, setWebhooks] = React.useState<Webhook[]>([]);
 const [loading, setLoading] = React.useState(true);
 const [dialogOpen, setDialogOpen] = React.useState(false);
 const [editingId, setEditingId] = React.useState<string | null>(null);
 const [form, setForm] = React.useState<{ url: string; events: string[]; isActive: boolean }>({
 url: '', events: [], isActive: true,
 });

 const fetchWebhooks = async () => {
 setLoading(true);
 try {
 const res = await authFetch('/api/webhooks');
 if (res.ok) {
 const data = (await res.json()) as Webhook[] | { data: Webhook[] };
 const list = Array.isArray(data)? data: (data?.data?? []);
 setWebhooks(list);
 } else {
 setWebhooks([]);
 }
 } catch {
 setWebhooks([]);
 } finally {
 setLoading(false);
 }
 };

 React.useEffect(() => { fetchWebhooks(); }, []);

 const handleSave = async () => {
 if (!form.url) {
 toast({ title: 'خطا', description: 'آدرس URL الزامی است', variant: 'destructive' });
 return;
 }
 try {
 const method = editingId? 'PUT': 'POST';
 const res = await authFetch('/api/webhooks', {
 method,
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify(editingId? { id: editingId,...form }: form),
 });
 if (res.ok) {
 toast({ title: 'موفق', description: editingId? 'webhook به‌روزرسانی شد': 'webhook ایجاد شد' });
 setDialogOpen(false);
 setEditingId(null);
 setForm({ url: '', events: [], isActive: true });
 fetchWebhooks();
 } else {
 toast({ title: 'خطا', description: 'ذخیره‌ی webhook ناموفق بود', variant: 'destructive' });
 }
 } catch {
 toast({ title: 'خطا', description: 'اتصال به سرور ممکن نشد', variant: 'destructive' });
 }
 };

 const handleDelete = async (id: string) => {
 confirm({
 title: 'حذف Webhook؟',
 description: 'این عمل قابل بازگشت نیست. آیا مطمئن هستید؟',
 variant: 'destructive',
 confirmText: 'حذف',
 onConfirm: async () => {
 try {
 await authFetch(`/api/webhooks?id=${id}`, { method: 'DELETE' });
 toast({ title: 'حذف شد', description: 'webhook حذف شد' });
 fetchWebhooks();
 } catch {
 toast({ title: 'خطا', description: 'حذف ناموفق بود', variant: 'destructive' });
 }
 },
 });
 };

 const handleToggle = async (id: string, active: boolean) => {
 setWebhooks(prev => prev.map(w => w.id === id? {...w, isActive: active }: w));
 try {
 await authFetch('/api/webhooks', {
 method: 'PATCH',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({ id, isActive: active }),
 });
 } catch { /* ignore */ }
 };

 const openEdit = (wh: Webhook) => {
 setEditingId(wh.id);
 setForm({ url: wh.url, events: wh.events, isActive: wh.isActive });
 setDialogOpen(true);
 };

 return (
 <div className="space-y-4 p-4 md:p-6" dir="rtl">
 <Card>
 <CardHeader className="flex flex-row items-center justify-between space-y-0">
 <CardTitle className="flex items-center gap-2">
 <Webhook className="size-5 text-primary" />
 مدیریت Webhook ها
 </CardTitle>
 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogTrigger asChild>
 <Button onClick={() => { setEditingId(null); setForm({ url: '', events: [], isActive: true }); }}>
 <Plus className="size-4 ml-1" /> افزودن Webhook
 </Button>
 </DialogTrigger>
 <DialogContent className="max-w-lg">
 <DialogHeader>
 <DialogTitle>{editingId? 'ویرایش Webhook': 'افزودن Webhook جدید'}</DialogTitle>
 <DialogDescription className="sr-only">توضیحات دیالوگ</DialogDescription>
 </DialogHeader>
 <div className="space-y-4 py-2">
 <div className="space-y-2">
 <Label htmlFor="wh-url">آدرس URL مقصد</Label>
 <Input id="wh-url" value={form.url} onChange={e => setForm(p => ({...p, url: e.target.value }))} placeholder="https://example.com/webhook" dir="ltr" />
 </div>
 <div className="space-y-2">
 <Label>رویدادها</Label>
 <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
 {AVAILABLE_EVENTS.map(ev => (
 <label key={ev.value} className="flex items-center gap-2 text-sm cursor-pointer">
 <input
 type="checkbox"
 checked={form.events.includes(ev.value)}
 onChange={e => setForm(p => ({
...p,
 events: e.target.checked? [...p.events, ev.value]: p.events.filter(v => v!== ev.value),
 }))}
 className="accent-primary"
 />
 {ev.label}
 </label>
 ))}
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Switch checked={form.isActive} onCheckedChange={c => setForm(p => ({...p, isActive: c }))} />
 <Label>فعال</Label>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
 <Button onClick={handleSave}>ذخیره</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="size-6 animate-spin text-primary" />
 </div>
 ): webhooks.length === 0? (
 <div className="text-center py-12 text-muted-foreground">
 هنوز webhook‌ی ثبت نشده است.
 </div>
 ): (
 <div className="max-h-[28rem] overflow-y-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>URL</TableHead>
 <TableHead>رویدادها</TableHead>
 <TableHead>وضعیت</TableHead>
 <TableHead>آمار</TableHead>
 <TableHead>عملیات</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {webhooks.map(wh => (
 <TableRow key={wh.id}>
 <TableCell className="font-mono text-xs max-w-[12rem] truncate" dir="ltr" title={wh.url}>{wh.url}</TableCell>
 <TableCell>
 <div className="flex flex-wrap gap-1 max-w-[16rem]">
 {wh.events.map(e => <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>)}
 </div>
 </TableCell>
 <TableCell>
 <Switch checked={wh.isActive} onCheckedChange={c => handleToggle(wh.id, c)} />
 </TableCell>
 <TableCell>
 <div className="flex items-center gap-2 text-xs">
 <span className="text-emerald-600">{wh.successCount} موفق</span>
 <span className="text-red-600">{wh.failureCount} ناموفق</span>
 </div>
 </TableCell>
 <TableCell>
 <div className="flex items-center gap-1">
 <Button size="icon" variant="ghost" onClick={() => openEdit(wh)} title="ویرایش">
 <Pencil className="size-4" />
 </Button>
 <Button size="icon" variant="ghost" onClick={() => handleDelete(wh.id)} title="حذف">
 <Trash2 className="size-4 text-red-500" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>
 {ConfirmDialogComponent}
 </div>
 );
}
