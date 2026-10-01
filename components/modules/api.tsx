"use client";

import * as React from "react";
import {
 Activity,
 AlertCircle,
 BookOpen,
 Check,
 Code2,
 Copy,
 Eye,
 EyeOff,
 Key,
 Loader2,
 Plus,
 RefreshCw,
 Send,
 Trash2,
 Webhook,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
 Tabs,
 TabsContent,
 TabsList,
 TabsTrigger,
} from "@/components/ui/tabs";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { toJalali, toPersianDigits } from "@/lib/persian";

// ===== Auth helper =====
// توکن نشست کاربر در localStorage ذخیره می‌شود و برای هر درخواست به API
// به‌عنوان هدر Authorization: Bearer ارسال می‌گردد.
const TOKEN_KEY = "hoshhesab_user_token";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
 const token =
 typeof window!== "undefined"? localStorage.getItem(TOKEN_KEY) || "": "";
 const headers: Record<string, string> = {
 "Content-Type": "application/json",
...(extra || {}),
 };
 if (token) headers["Authorization"] = `Bearer ${token}`;
 return headers;
}

// ===== Types =====
interface ApiKeyInfo {
 id: string;
 name: string;
 keyPrefix: string; // شکل ماسک‌شده از سرور (hh_live_xxxx****)
 fullKey?: string; // فقط پس از ساخت/بازسازی در دسترس است
 scopes: string[];
 isActive: boolean;
 createdAt: string;
 lastUsedAt: string | null;
 expiresAt: string | null;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

// ===== Webhook types (۲۱-e) =====
interface WebhookRow {
 id: string;
 url: string;
 event: string;
 secret?: string | null;
 isActive: boolean;
 lastFired?: string | null;
 createdAt: string;
}

interface WebhookDeliveryRow {
 id: string;
 event: string;
 endpointUrl: string;
 statusCode: number | null;
 responseMs: number | null;
 success: boolean;
 error?: string | null;
 createdAt: string;
}

// رویدادهای قابل انتخاب — «تغییر قیمت» برای فروشگاه‌ها (price.updated)
const WEBHOOK_EVENTS: Array<{ value: string; label: string }> = [
 { value: "invoice.created", label: "فاکتور ایجاد شد (invoice.created)" },
 { value: "invoice.paid", label: "فاکتور پرداخت شد (invoice.paid)" },
 { value: "price.updated", label: "تغییر قیمت (price.updated)" },
 { value: "payment.received", label: "پرداخت دریافت شد (payment.received)" },
 { value: "inventory.updated", label: "موجودی تغییر کرد (inventory.updated)" },
 { value: "customer.created", label: "مشتری ایجاد شد (customer.created)" },
];

interface ApiEndpoint {
 method: HttpMethod;
 path: string;
 description: string;
 request: string;
 response: string;
}

// ===== Static data =====
const ENDPOINTS: ApiEndpoint[] = [
 {
 method: "GET",
 path: "/api/v1/invoices",
 description: "دریافت فهرست فاکتورها",
 request:
 "GET /api/v1/invoices?type=SALE&limit=50\nAuthorization: Bearer <YOUR_API_KEY>",
 response: `{
 "success": true,
 "data": [
 {
 "id": "inv_01",
 "number": "1001",
 "type": "SALE",
 "status": "PAID",
 "total": 1500000
 }
 ],
 "meta": { "version": "v1", "count": 1 }
}`,
 },
 {
 method: "GET",
 path: "/api/v1/products",
 description: "دریافت فهرست کالاها",
 request:
 "GET /api/v1/products?search=لپ‌تاپ&limit=50\nAuthorization: Bearer <YOUR_API_KEY>",
 response: `{
 "success": true,
 "data": [
 { "id": "pr_01", "name": "لپ‌تاپ X", "sku": "LP-X-01", "price": 25000000 }
 ],
 "meta": { "version": "v1", "count": 1 }
}`,
 },
 {
 method: "GET",
 path: "/api/v1/parties",
 description: "دریافت فهرست طرف‌حساب‌ها",
 request:
 "GET /api/v1/parties?type=CUSTOMER&limit=50\nAuthorization: Bearer <YOUR_API_KEY>",
 response: `{
 "success": true,
 "data": [
 { "id": "pty_01", "name": "شرکت آلفا", "type": "CUSTOMER" }
 ],
 "meta": { "version": "v1", "count": 1 }
}`,
 },
 {
 method: "GET",
 path: "/api/v1/docs",
 description: "دریافت مستندات OpenAPI (JSON)",
 request: "GET /api/v1/docs",
 response: `{
 "openapi": "3.0.3",
 "info": { "title": "هوش API v1", "version": "1.0.0" },
 "paths": { "/invoices": { "get": {... } } }
}`,
 },
 {
 method: "GET",
 path: "/api/dashboard",
 description: "دریافت داده‌های داشبورد",
 request:
 "GET /api/dashboard\nAuthorization: Bearer <YOUR_API_KEY>",
 response: `{
 "success": true,
 "data": {
 "totalSales": 125000000,
 "totalPurchases": 48000000,
 "invoiceCount": 312
 }
}`,
 },
 {
 method: "GET",
 path: "/api/health",
 description: "بررسی سلامت سرویس API",
 request: "GET /api/health",
 response: `{
 "status": "ok",
 "uptime": 86420,
 "version": "1.0.0"
}`,
 },
 {
 method: "POST",
 path: "/api/products",
 description: "ایجاد کالای جدید",
 request: `POST /api/products
Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json

{
 "name": "لپ‌تاپ X",
 "sku": "LP-X-01",
 "price": 25000000
}`,
 response: `{
 "success": true,
 "data": { "id": "pr_02", "name": "لپ‌تاپ X" }
}`,
 },
 {
 method: "POST",
 path: "/api/parties",
 description: "ایجاد طرف‌حساب جدید",
 request: `POST /api/parties
Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json

{
 "name": "شرکت آلفا",
 "type": "CUSTOMER"
}`,
 response: `{
 "success": true,
 "data": { "id": "pty_02", "name": "شرکت آلفا" }
}`,
 },
 {
 method: "GET",
 path: "/api/search",
 description: "جستجوی سراسری در داده‌ها",
 request:
 "GET /api/search?q=invoice&limit=20\nAuthorization: Bearer <YOUR_API_KEY>",
 response: `{
 "success": true,
 "data": [
 { "type": "invoice", "id": "inv_01", "title": "فاکتور 1001" }
 ]
}`,
 },
 {
 method: "GET",
 path: "/api/reports/vat",
 description: "گزارش مالیات بر ارزش افزوده",
 request:
 "GET /api/reports/vat?from=1403-01-01&to=1403-03-31\nAuthorization: Bearer <YOUR_API_KEY>",
 response: `{
 "success": true,
 "data": {
 "totalSales": 80000000,
 "totalVat": 12000000,
 "period": "1403-Q1"
 }
}`,
 },
 {
 method: "GET",
 path: "/api/notifications",
 description: "دریافت فهرست اعلان‌ها",
 request:
 "GET /api/notifications?limit=20\nAuthorization: Bearer <YOUR_API_KEY>",
 response: `{
 "success": true,
 "data": [
 { "id": "n_01", "type": "info", "message": "فاکتور جدید ثبت شد" }
 ]
}`,
 },
 {
 method: "GET",
 path: "/api/api-keys",
 description: "دریافت فهرست کلیدهای API",
 request: "GET /api/api-keys\nAuthorization: Bearer <YOUR_SESSION_TOKEN>",
 response: `{
 "success": true,
 "data": [
 {
 "id": "key_01",
 "name": "اپلیکیشن موبایل",
 "keyPrefix": "hh_live_ab12****",
 "createdAt": "2024-12-01T10:00:00.000Z"
 }
 ]
}`,
 },
 {
 method: "POST",
 path: "/api/api-keys",
 description: "ایجاد کلید API جدید",
 request: `POST /api/api-keys
Authorization: Bearer <YOUR_SESSION_TOKEN>
Content-Type: application/json

{
 "name": "اپلیکیشن موبایل",
 "scopes": ["read:invoices", "write:invoices"]
}`,
 response: `{
 "success": true,
 "data": {
 "id": "key_02",
 "name": "اپلیکیشن موبایل",
 "fullKey": "hh_live_xxxxxxxxxxxxxxxxxxxxxxxx"
 }
}`,
 },
 {
 method: "DELETE",
 path: "/api/api-keys/:id",
 description: "حذف کلید API",
 request:
 "DELETE /api/api-keys/key_01\nAuthorization: Bearer <YOUR_SESSION_TOKEN>",
 response: `{ "success": true }`,
 },
];

// ===== Helpers =====
function buildCodeSamples(
 apiKey: string | null
): Record<"javascript" | "python" | "curl", string> {
 const key = apiKey && apiKey.length > 0? apiKey: "<YOUR_API_KEY>";
 return {
 javascript: [
 "// دریافت فهرست فاکتورها از API هوش",
 "const res = await fetch('/api/v1/invoices', {",
 " headers: {",
 " 'Authorization': 'Bearer " + key + "'",
 " }",
 "});",
 "",
 "const data = await res.json();",
 "console.log(data);",
 ].join("\n"),
 python: [
 "# دریافت فهرست فاکتورها از API هوش",
 "import requests",
 "",
 "res = requests.get(",
 " 'https://your-domain/api/v1/invoices',",
 " headers={'Authorization': 'Bearer " + key + "'}",
 ")",
 "",
 "print(res.json())",
 ].join("\n"),
 curl: [
 "# دریافت فهرست فاکتورها از API هوش",
 "curl -X GET 'https://your-domain/api/v1/invoices' \\",
 " -H 'Authorization: Bearer " + key + "'",
 ].join("\n"),
 };
}

async function copyToClipboard(
 text: string,
 toast: (t: { title: string; description?: string; variant?: "default" | "destructive" }) => void,
 label: string
) {
 try {
 await navigator.clipboard.writeText(text);
 toast({ title: "کپی شد", description: label });
 } catch {
 toast({
 title: "کپی ناموفق بود",
 description: "لطفاً دستی کپی کنید.",
 variant: "destructive",
 });
 }
}

function methodBadgeClass(method: HttpMethod): string {
 switch (method) {
 case "GET":
 return "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300";
 case "POST":
 return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
 case "PATCH":
 return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
 case "DELETE":
 return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
 }
}

function formatJalaliDate(iso: string | null): string {
 if (!iso) return "—";
 try {
 return toJalali(new Date(iso));
 } catch {
 return "—";
 }
}

// ===== Main component =====
export function ApiModule() {
 const { toast } = useToast();

 const [loading, setLoading] = React.useState(true);
 const [apiKey, setApiKey] = React.useState<ApiKeyInfo | null>(null);
 const [revealedKey, setRevealedKey] = React.useState(false);

 // دیالوگ‌ها
 const [createDialog, setCreateDialog] = React.useState(false);
 const [regenDialog, setRegenDialog] = React.useState(false);
 const [revokeDialog, setRevokeDialog] = React.useState(false);
 const [sampleEndpoint, setSampleEndpoint] = React.useState<ApiEndpoint | null>(null);

 // وضعیت‌های فرم
 const [keyName, setKeyName] = React.useState("");
 const [submitting, setSubmitting] = React.useState(false);

 // ----- Initial fetch -----
 const fetchApiKey = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/api-keys", { headers: authHeaders() });
 const json = await res.json();
 if (!json.success) {
 throw new Error(json.error || "دریافت کلید ناموفق بود");
 }
 const list = (json.data || []) as Array<Omit<ApiKeyInfo, "fullKey">>;
 // اولین کلید فعال را برمی‌داریم
 const active = list.find((k) => k.isActive) || list[0] || null;
 setApiKey(active? {...active, fullKey: undefined }: null);
 } catch (err) {
 // در حالت بدون نشست، خطا را به‌صورت بی‌صدا نمایش می‌دهیم
 setApiKey(null);
 console.warn("API keys fetch failed:", err);
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchApiKey();
 }, [fetchApiKey]);

 // ===== مدیریت Webhookها (۲۱-e) =====
 const [hooks, setHooks] = React.useState<WebhookRow[]>([]);
 const [hooksLoading, setHooksLoading] = React.useState(true);
 const [hookUrl, setHookUrl] = React.useState("");
 const [hookEvent, setHookEvent] = React.useState("price.updated");
 const [hookSecret, setHookSecret] = React.useState("");
 const [hookSaving, setHookSaving] = React.useState(false);
 const [testingHookId, setTestingHookId] = React.useState<string | null>(null);
 const [deliveries, setDeliveries] = React.useState<WebhookDeliveryRow[]>([]);
 const [deliveriesLoading, setDeliveriesLoading] = React.useState(false);

 const fetchHooks = React.useCallback(async () => {
 setHooksLoading(true);
 try {
 const res = await fetch("/api/webhooks", { headers: authHeaders() });
 if (res.ok) {
 const json = await res.json();
 setHooks(Array.isArray(json.data) ? json.data : []);
 } else {
 setHooks([]);
 }
 } catch {
 setHooks([]);
 } finally {
 setHooksLoading(false);
 }
 }, []);

 const fetchDeliveries = React.useCallback(async () => {
 setDeliveriesLoading(true);
 try {
 const res = await fetch("/api/webhooks/deliveries?limit=10", {
 headers: authHeaders(),
 });
 if (res.ok) {
 const json = await res.json();
 setDeliveries(Array.isArray(json.data) ? json.data : []);
 } else {
 setDeliveries([]);
 }
 } catch {
 setDeliveries([]);
 } finally {
 setDeliveriesLoading(false);
 }
 }, []);

 React.useEffect(() => {
 void fetchHooks();
 void fetchDeliveries();
 }, [fetchHooks, fetchDeliveries]);

 // تولید secret امن ۳۲ کاراکتری (hex)
 const generateSecret = () => {
 const bytes = new Uint8Array(16);
 crypto.getRandomValues(bytes);
 const hex = Array.from(bytes)
 .map((b) => b.toString(16).padStart(2, "0"))
 .join("");
 setHookSecret(hex);
 };

 // افزودن وب‌هوک جدید
 const handleAddHook = async () => {
 const url = hookUrl.trim();
 if (!url || !/^https?:\/\//.test(url)) {
 toast({
 title: "خطا",
 description: "آدرس endpoint معتبر وارد کنید (با http یا https شروع شود).",
 variant: "destructive",
 });
 return;
 }
 setHookSaving(true);
 try {
 const res = await fetch("/api/webhooks", {
 method: "POST",
 headers: authHeaders(),
 body: JSON.stringify({
 url,
 event: hookEvent,
 secret: hookSecret.trim() || undefined,
 isActive: true,
 }),
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json.error || "خطا");
 toast({
 title: "وب‌هوک اضافه شد",
 description: `رویداد ${hookEvent} به ${url} ارسال می‌شود.`,
 });
 setHookUrl("");
 setHookSecret("");
 await fetchHooks();
 } catch (e) {
 toast({
 title: "خطا در افزودن وب‌هوک",
 description: e instanceof Error ? e.message : "خطای نامشخص",
 variant: "destructive",
 });
 } finally {
 setHookSaving(false);
 }
 };

 // فعال/غیرفعال کردن
 const handleToggleHook = async (id: string, active: boolean) => {
 setHooks((prev) => prev.map((h) => (h.id === id ? { ...h, isActive: active } : h)));
 try {
 await fetch("/api/webhooks", {
 method: "PUT",
 headers: authHeaders(),
 body: JSON.stringify({ id, isActive: active }),
 });
 } catch {
 // در صورت خطا، دوباره لیست را می‌خوانیم
 void fetchHooks();
 }
 };

 // حذف
 const handleDeleteHook = async (id: string) => {
 try {
 const res = await fetch(`/api/webhooks?id=${encodeURIComponent(id)}`, {
 method: "DELETE",
 headers: authHeaders(),
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json.error || "خطا");
 toast({ title: "حذف شد", description: "وب‌هوک حذف شد." });
 await fetchHooks();
 } catch (e) {
 toast({
 title: "خطا در حذف",
 description: e instanceof Error ? e.message : "خطای نامشخص",
 variant: "destructive",
 });
 }
 };

 // ارسال تست
 const handleTestHook = async (id: string) => {
 setTestingHookId(id);
 try {
 const res = await fetch("/api/webhooks/test", {
 method: "POST",
 headers: authHeaders(),
 body: JSON.stringify({ id }),
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json.error || "خطا در تست");
 toast({
 variant: json.data?.success ? "default" : "destructive",
 title: json.data?.success ? "تحویل موفق" : "تحویل ناموفق",
 description:
 json.message ||
 (json.data?.success
 ? `کد ${json.data.statusCode}`
 : json.data?.error || "خطای نامشخص"),
 });
 await fetchDeliveries();
 await fetchHooks();
 } catch (e) {
 toast({
 title: "خطا در تست",
 description: e instanceof Error ? e.message : "خطای نامشخص",
 variant: "destructive",
 });
 } finally {
 setTestingHookId(null);
 }
 };

 // ----- Create key -----
 const openCreateDialog = () => {
 setKeyName("");
 setCreateDialog(true);
 };

 const handleCreate = async () => {
 const name = keyName.trim();
 if (name.length < 2) {
 toast({
 title: "نام کلید الزامی است",
 description: "حداقل ۲ کاراکتر وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setSubmitting(true);
 try {
 const res = await fetch("/api/api-keys", {
 method: "POST",
 headers: authHeaders(),
 body: JSON.stringify({ name, scopes: [] }),
 });
 const json = await res.json();
 if (!json.success) {
 throw new Error(json.error || "ایجاد کلید ناموفق بود");
 }
 const created = json.data;
 const newKey: ApiKeyInfo = {
 id: created.id,
 name: created.name,
 keyPrefix: `${(created.keyPrefix || "").slice(0, 12)}****`,
 fullKey: created.fullKey,
 scopes: created.scopes || [],
 isActive: true,
 createdAt: created.createdAt || new Date().toISOString(),
 lastUsedAt: null,
 expiresAt: created.expiresAt || null,
 };
 setApiKey(newKey);
 setRevealedKey(true);
 setCreateDialog(false);
 toast({
 title: "کلید API ایجاد شد",
 description: "کلید فقط یک‌بار نمایش داده می‌شود — آن را ذخیره کنید.",
 });
 } catch (err) {
 toast({
 title: "خطا در ایجاد کلید",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 }
 };

 // ----- Regenerate (DELETE old + POST new with same name) -----
 const handleRegenerate = async () => {
 if (!apiKey) return;
 setSubmitting(true);
 try {
 // اول حذف کلید قدیمی
 await fetch(`/api/api-keys/${apiKey.id}`, {
 method: "DELETE",
 headers: authHeaders(),
 });
 // سپس ساخت کلید جدید با همان نام
 const res = await fetch("/api/api-keys", {
 method: "POST",
 headers: authHeaders(),
 body: JSON.stringify({ name: apiKey.name, scopes: apiKey.scopes || [] }),
 });
 const json = await res.json();
 if (!json.success) {
 throw new Error(json.error || "بازسازی کلید ناموفق بود");
 }
 const created = json.data;
 const newKey: ApiKeyInfo = {
 id: created.id,
 name: created.name,
 keyPrefix: `${(created.keyPrefix || "").slice(0, 12)}****`,
 fullKey: created.fullKey,
 scopes: created.scopes || [],
 isActive: true,
 createdAt: created.createdAt || new Date().toISOString(),
 lastUsedAt: null,
 expiresAt: created.expiresAt || null,
 };
 setApiKey(newKey);
 setRevealedKey(true);
 setRegenDialog(false);
 toast({
 title: "کلید بازسازی شد",
 description: "کلید قدیمی غیرفعال شد و کلید جدید ایجاد گردید.",
 });
 } catch (err) {
 toast({
 title: "خطا در بازسازی کلید",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 // در صورت خطا دیالوگ را هم ببند
 setRegenDialog(false);
 }
 };

 // ----- Revoke (DELETE) -----
 const handleRevoke = async () => {
 if (!apiKey) return;
 setSubmitting(true);
 try {
 const res = await fetch(`/api/api-keys/${apiKey.id}`, {
 method: "DELETE",
 headers: authHeaders(),
 });
 const json = await res.json().catch(() => ({}));
 if (!json.success && res.status >= 400) {
 throw new Error(json.error || "حذف کلید ناموفق بود");
 }
 setApiKey(null);
 setRevealedKey(false);
 setRevokeDialog(false);
 toast({
 title: "کلید حذف شد",
 description: "کلید API مورد نظر با موفقیت حذف گردید.",
 });
 } catch (err) {
 toast({
 title: "خطا در حذف کلید",
 description: err instanceof Error? err.message: "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSubmitting(false);
 setRevokeDialog(false);
 }
 };

 // ----- Copy key -----
 const handleCopyKey = () => {
 if (!apiKey) return;
 if (apiKey.fullKey) {
 void copyToClipboard(apiKey.fullKey, toast, "کلید کامل API کپی شد.");
 } else {
 toast({
 title: "کلید کامل در دسترس نیست",
 description: "برای دریافت کلید جدید، گزینه‌ی «بازسازی کلید» را بزنید.",
 variant: "destructive",
 });
 }
 };

 // ----- Code samples -----
 const codeSamples = React.useMemo(
 () => buildCodeSamples(apiKey?.fullKey || null),
 [apiKey?.fullKey]
 );

 const handleCopyCode = (lang: "javascript" | "python" | "curl") => {
 void copyToClipboard(codeSamples[lang], toast, `کد ${lang} کپی شد.`);
 };

 // ===== Render =====
 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* هدر */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Code2 className="h-5 w-5" />
 </div>
 <div>
 <h3 className="text-sm font-semibold">API و توسعه‌دهندگان</h3>
 <p className="text-xs text-muted-foreground">
 کلید API، نمونه کد و فهرست Endpoint ها
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-1.5">
 <span className="relative flex h-2 w-2">
 <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60 opacity-75" />
 <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
 </span>
 <span className="text-xs font-medium text-success">وضعیت سرویس: سالم</span>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* بخش ۱: کلید API شما */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Key className="h-4 w-4 text-primary" />
 بخش ۱: کلید API شما
 </CardTitle>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="flex items-center justify-center py-10 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin me-2" />
 <span className="text-sm">در حال بارگذاری…</span>
 </div>
 ):!apiKey? (
 <div className="flex flex-col items-center text-center py-8 px-4">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
 <Key className="h-7 w-7" strokeWidth={1.5} />
 </div>
 <h4 className="text-sm font-semibold mb-1">هنوز کلید API ندارید</h4>
 <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-4">
 برای اتصال برنامه‌های خارجی به هوش، یک کلید API بسازید.
 این کلید به‌عنوان رمز عبور در هر درخواست استفاده می‌شود.
 </p>
 <Button className="gap-1.5" onClick={openCreateDialog}>
 <Key className="h-4 w-4" />
 ساخت کلید API
 </Button>
 </div>
 ): (
 <div className="space-y-4">
 {/* نمایش کلید */}
 <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
 <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 mb-1">
 <p className="text-sm font-medium truncate">{apiKey.name}</p>
 {apiKey.isActive? (
 <Badge className="text-[10px] h-5 bg-success/10 text-success gap-1">
 <span className="h-1.5 w-1.5 rounded-full bg-success" />
 فعال
 </Badge>
 ): (
 <Badge className="text-[10px] h-5 bg-muted text-muted-foreground gap-1">
 غیرفعال
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-2 mt-2">
 <code
 dir="ltr"
 className="font-mono text-xs bg-background border border-border/60 rounded-md px-2.5 py-1.5 text-foreground break-all"
 >
 {revealedKey && apiKey.fullKey
? apiKey.fullKey
: apiKey.keyPrefix}
 </code>
 {apiKey.fullKey && (
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
 aria-label={revealedKey? "پنهان‌سازی کلید": "نمایش کلید"}
 onClick={() => setRevealedKey((v) =>!v)}
 >
 {revealedKey? (
 <EyeOff className="h-3.5 w-3.5" />
 ): (
 <Eye className="h-3.5 w-3.5" />
 )}
 </Button>
 )}
 </div>
 {apiKey.fullKey && revealedKey && (
 <p className="text-[10px] text-destructive mt-2">
 هشدار: کلید کامل فقط این‌بار نمایش داده می‌شود. آن را در جای
 امن ذخیره کنید.
 </p>
 )}
 {!apiKey.fullKey && (
 <p className="text-[10px] text-muted-foreground mt-2">
 کلید کامل فقط هنگام ساخت یا بازسازی در دسترس است.
 </p>
 )}
 </div>
 <div className="flex flex-row md:flex-col gap-2 shrink-0">
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5"
 onClick={handleCopyKey}
 disabled={!apiKey.fullKey}
 >
 <Copy className="h-3.5 w-3.5" />
 کپی کلید
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5"
 onClick={() => setRegenDialog(true)}
 >
 <RefreshCw className="h-3.5 w-3.5" />
 بازسازی کلید
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
 onClick={() => setRevokeDialog(true)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 حذف کلید
 </Button>
 </div>
 </div>
 </div>

 {/* اطلاعات متادیتا */}
 <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
 <MetaItem
 icon={Key}
 label="نام کلید"
 value={apiKey.name}
 />
 <MetaItem
 icon={Activity}
 label="تاریخ ساخت"
 value={toPersianDigits(formatJalaliDate(apiKey.createdAt))}
 />
 <MetaItem
 icon={Check}
 label="آخرین استفاده"
 value={
 apiKey.lastUsedAt
? toPersianDigits(formatJalaliDate(apiKey.lastUsedAt))
: "هرگز"
 }
 />
 </div>
 </div>
 )}
 </CardContent>
 </Card>

 {/* بخش ۲: نمونه کد */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <Code2 className="h-4 w-4 text-primary" />
 بخش ۲: نمونه کد
 </CardTitle>
 </CardHeader>
 <CardContent>
 <Tabs defaultValue="javascript" className="w-full">
 <div className="flex items-center justify-between gap-2 mb-3">
 <TabsList className="h-9">
 <TabsTrigger value="javascript" className="gap-1.5 text-xs">
 <Code2 className="h-3.5 w-3.5" />
 JavaScript
 </TabsTrigger>
 <TabsTrigger value="python" className="gap-1.5 text-xs">
 <Code2 className="h-3.5 w-3.5" />
 Python
 </TabsTrigger>
 <TabsTrigger value="curl" className="gap-1.5 text-xs">
 <Code2 className="h-3.5 w-3.5" />
 cURL
 </TabsTrigger>
 </TabsList>
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5 h-9"
 onClick={() => handleCopyCode("javascript")}
 >
 <Copy className="h-3.5 w-3.5" />
 کپی کد
 </Button>
 </div>

 <TabsContent value="javascript">
 <CodeBlock
 code={codeSamples.javascript}
 onCopy={() => handleCopyCode("javascript")}
 />
 </TabsContent>
 <TabsContent value="python">
 <CodeBlock
 code={codeSamples.python}
 onCopy={() => handleCopyCode("python")}
 />
 </TabsContent>
 <TabsContent value="curl">
 <CodeBlock
 code={codeSamples.curl}
 onCopy={() => handleCopyCode("curl")}
 />
 </TabsContent>
 </Tabs>

 {!apiKey?.fullKey && (
 <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1.5">
 <AlertCircle className="h-3.5 w-3.5" />
 در نمونه کد از کلید واقعی شما استفاده می‌شود. چون کلید کامل فقط هنگام
 ساخت نمایش داده می‌شود، در صورت نیاز کلید را بازسازی کنید.
 </p>
 )}
 </CardContent>
 </Card>

 {/* بخش ۳: مستندات */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base flex items-center gap-2">
 <BookOpen className="h-4 w-4 text-primary" />
 بخش ۳: مستندات
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="rounded-lg border border-border/60 divide-y divide-border/60 overflow-hidden">
 {ENDPOINTS.map((ep, i) => (
 <div
 key={i}
 className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
 >
 <div className="flex items-center gap-2.5 min-w-0">
 <Badge
 className={`shrink-0 font-mono text-[10px] h-5 w-14 justify-center ${methodBadgeClass(
 ep.method
 )}`}
 >
 {ep.method}
 </Badge>
 <code
 dir="ltr"
 className="font-mono text-xs text-foreground truncate"
 title={ep.path}
 >
 {ep.path}
 </code>
 </div>
 <div className="flex items-center gap-3 sm:justify-end">
 <span className="text-xs text-muted-foreground truncate">
 {ep.description}
 </span>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 px-2 text-xs gap-1 shrink-0 text-primary hover:text-primary"
 onClick={() => setSampleEndpoint(ep)}
 >
 <Code2 className="h-3 w-3" />
 نمونه
 </Button>
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* مدیریت Webhook — کامل (CRUD + تست + تاریخچه تحویل) */}
 <Card className="border-border bg-card/50">
 <CardContent className="p-4 space-y-4">
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success shrink-0">
 <Webhook className="h-5 w-5" />
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 mb-0.5">
 <p className="text-sm font-medium">مدیریت Webhook</p>
 <Badge className="text-[10px] h-5 bg-success/10 text-success">
 فعال
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground">
 رویدادهای بلادرنگ (فاکتور صادر شد، پرداخت دریافت شد، <b>تغییر قیمت با نرخ بازار</b>) به endpoint شما ارسال می‌شود.
 </p>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 text-xs gap-1.5 shrink-0"
 onClick={() => {
 void fetchHooks();
 void fetchDeliveries();
 }}
 >
 <RefreshCw className="h-3.5 w-3.5" />
 بروزرسانی
 </Button>
 </div>

 {/* فرم افزودن */}
 <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
 <p className="text-xs font-medium flex items-center gap-1.5">
 <Plus className="h-3.5 w-3.5 text-primary" />
 افزودن وب‌هوک جدید
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 <div className="space-y-1">
 <Label className="text-[11px]">آدرس endpoint (POST)</Label>
 <Input
 value={hookUrl}
 onChange={(e) => setHookUrl(e.target.value)}
 placeholder="https://example.com/webhook"
 dir="ltr"
 className="h-8 text-xs font-mono"
 disabled={hookSaving}
 />
 </div>
 <div className="space-y-1">
 <Label className="text-[11px]">رویداد</Label>
 <Select value={hookEvent} onValueChange={setHookEvent} disabled={hookSaving}>
 <SelectTrigger className="h-8 text-xs">
 <SelectValue placeholder="رویداد را انتخاب کنید" />
 </SelectTrigger>
 <SelectContent>
 {WEBHOOK_EVENTS.map((ev) => (
 <SelectItem key={ev.value} value={ev.value} className="text-xs">
 {ev.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
 <div className="space-y-1">
 <Label className="text-[11px]">کلید امضا (اختیاری — HMAC-SHA256)</Label>
 <Input
 value={hookSecret}
 onChange={(e) => setHookSecret(e.target.value)}
 placeholder="خالی = بدون امضا"
 dir="ltr"
 className="h-8 text-xs font-mono"
 disabled={hookSaving}
 />
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={generateSecret}
 disabled={hookSaving}
 >
 <Key className="h-3.5 w-3.5" />
 تولید خودکار
 </Button>
 <Button
 size="sm"
 className="h-8 text-xs gap-1"
 onClick={() => void handleAddHook()}
 disabled={hookSaving || !hookUrl.trim()}
 >
 {hookSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
 افزودن
 </Button>
 </div>
 </div>

 {/* لیست وب‌هوک‌ها */}
 {hooksLoading ? (
 <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
 <Loader2 className="h-4 w-4 animate-spin ml-2" />
 در حال بارگذاری وب‌هوک‌ها...
 </div>
 ) : hooks.length === 0 ? (
 <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
 هنوز وب‌هوکی ثبت نشده است — با فرم بالا اولین رویداد را متصل کنید.
 </div>
 ) : (
 <div className="space-y-2 max-h-72 overflow-y-auto">
 {hooks.map((h) => (
 <div
 key={h.id}
 className="rounded-lg border border-border bg-background/60 p-2.5 flex flex-col sm:flex-row sm:items-center gap-2"
 >
 <div className="min-w-0 flex-1 space-y-1">
 <div className="flex items-center gap-1.5 flex-wrap">
 <code className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono" dir="ltr">
 {h.event}
 </code>
 <code className="text-[10px] font-mono text-muted-foreground truncate" dir="ltr" title={h.url}>
 {h.url}
 </code>
 {h.secret && (
 <Badge variant="outline" className="text-[9px] h-4">امضاشده</Badge>
 )}
 </div>
 <p className="text-[10px] text-muted-foreground">
 آخرین ارسال: {formatJalaliDate(h.lastFired ?? null)}
 </p>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <div className="flex items-center gap-1.5">
 <span className="text-[10px] text-muted-foreground">
 {h.isActive ? "فعال" : "غیرفعال"}
 </span>
 <Switch
 checked={h.isActive}
 onCheckedChange={(c) => void handleToggleHook(h.id, c)}
 />
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-[11px] gap-1"
 onClick={() => void handleTestHook(h.id)}
 disabled={testingHookId === h.id}
 >
 {testingHookId === h.id ? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ) : (
 <Send className="h-3 w-3" />
 )}
 ارسال تست
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-destructive hover:text-destructive"
 onClick={() => void handleDeleteHook(h.id)}
 aria-label="حذف وب‌هوک"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* تاریخچه تحویل‌های اخیر */}
 <div className="rounded-lg border border-border bg-muted/40 p-3">
 <div className="flex items-center justify-between mb-2">
 <p className="text-xs font-medium flex items-center gap-1.5">
 <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
 تحویل‌های اخیر
 </p>
 <Button
 variant="ghost"
 size="sm"
 className="h-6 text-[10px] gap-1"
 onClick={() => void fetchDeliveries()}
 disabled={deliveriesLoading}
 >
 {deliveriesLoading ? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ) : (
 <RefreshCw className="h-3 w-3" />
 )}
 بروزرسانی
 </Button>
 </div>
 {deliveries.length === 0 ? (
 <p className="text-[11px] text-muted-foreground py-2">
 هنوز تحویلی ثبت نشده است — با «ارسال تست» یا وقوع رویداد، تاریخچه اینجا نمایش داده می‌شود.
 </p>
 ) : (
 <div className="space-y-1.5 max-h-52 overflow-y-auto">
 {deliveries.map((d) => (
 <div
 key={d.id}
 className="flex items-center gap-2 rounded-md bg-background/70 border border-border/60 px-2 py-1.5 text-[10px]"
 >
 <Badge
 className={`text-[9px] h-4 shrink-0 font-mono ${
 d.success
? "bg-success/10 text-success"
 : "bg-destructive/10 text-destructive"
 }`}
 dir="ltr"
 >
 {d.statusCode ?? "—"}
 </Badge>
 <code className="font-mono text-muted-foreground truncate flex-1" dir="ltr" title={d.endpointUrl}>
 {d.endpointUrl}
 </code>
 <span className="text-muted-foreground shrink-0" dir="ltr">
 {d.responseMs != null ? `${d.responseMs}ms` : "—"}
 </span>
 <span className="text-muted-foreground shrink-0">
 {formatJalaliDate(d.createdAt)}
 </span>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* رویدادهای پشتیبانی‌شده */}
 <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
 <p className="font-medium mb-1.5 flex items-center gap-1.5">
 <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
 رویدادهای پشتیبانی‌شده
 </p>
 <div className="flex flex-wrap gap-1.5">
 {WEBHOOK_EVENTS.map((ev) => (
 <code key={ev.value} className="px-1.5 py-0.5 rounded bg-background text-[10px] font-mono text-muted-foreground" dir="ltr">
 {ev.value}
 </code>
 ))}
 </div>
 <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
 رویداد «تغییر قیمت» بعد از هر همگام‌سازی قیمت کالاها با نرخ بازار (دستی یا خودکار) ارسال می‌شود —
 مناسب فروشگاه‌هایی که قیمت‌هایشان را با دلار/طلا شاخص می‌کنند.
 </p>
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ ساخت کلید */}
 <Dialog open={createDialog} onOpenChange={setCreateDialog}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Key className="h-4 w-4 text-primary" />
 ساخت کلید API
 </DialogTitle>
 <DialogDescription>
 یک نام برای کلید جدید وارد کنید. این نام صرفاً برای تشخیص شماست.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-2 py-1">
 <Label className="text-xs">نام کلید *</Label>
 <Input
 value={keyName}
 onChange={(e) => setKeyName(e.target.value)}
 placeholder="مثلاً اپلیکیشن موبایل"
 autoFocus
 onKeyDown={(e) => {
 if (e.key === "Enter") void handleCreate();
 }}
 />
 </div>
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setCreateDialog(false)}
 disabled={submitting}
 >
 انصراف
 </Button>
 <Button onClick={handleCreate} disabled={submitting} className="gap-1.5">
 {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
 {submitting? "در حال ساخت…": "ساخت کلید"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ تایید بازسازی کلید */}
 <AlertDialog open={regenDialog} onOpenChange={setRegenDialog}>
 <AlertDialogContent className="sm:max-w-md">
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2">
 <RefreshCw className="h-4 w-4 text-primary" />
 بازسازی کلید API؟
 </AlertDialogTitle>
 <AlertDialogDescription>
 کلید فعلی بلافاصله حذف شده و یک کلید جدید با همان نام جایگزین می‌شود.
 برنامه‌هایی که از کلید قدیمی استفاده می‌کردند باید به‌روزرسانی شوند.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={submitting}>انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={(e) => {
 e.preventDefault();
 void handleRegenerate();
 }}
 disabled={submitting}
 className="gap-1.5"
 >
 {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
 {submitting? "در حال بازسازی…": "بازسازی کلید"}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* دیالوگ تایید حذف کلید */}
 <AlertDialog open={revokeDialog} onOpenChange={setRevokeDialog}>
 <AlertDialogContent className="sm:max-w-md">
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2 text-destructive">
 <Trash2 className="h-4 w-4" />
 حذف کلید API؟
 </AlertDialogTitle>
 <AlertDialogDescription>
 این عمل قابل بازگشت نیست. کلید بلافاصله غیرفعال و حذف می‌شود و
 برنامه‌های متصل دسترسی خود را از دست می‌دهند.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={submitting}>انصراف</AlertDialogCancel>
 <AlertDialogAction
 onClick={(e) => {
 e.preventDefault();
 void handleRevoke();
 }}
 disabled={submitting}
 className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
 {submitting? "در حال حذف…": "حذف کلید"}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* دیالوگ نمونه Endpoint */}
 <Dialog
 open={sampleEndpoint!== null}
 onOpenChange={(o) =>!o && setSampleEndpoint(null)}
 >
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-sm">
 <Badge
 className={`font-mono text-[10px] h-5 w-14 justify-center ${methodBadgeClass(
 sampleEndpoint?.method || "GET"
 )}`}
 >
 {sampleEndpoint?.method}
 </Badge>
 <code dir="ltr" className="font-mono text-xs">
 {sampleEndpoint?.path}
 </code>
 </DialogTitle>
 <DialogDescription>{sampleEndpoint?.description}</DialogDescription>
 </DialogHeader>

 <div className="space-y-3 py-1 max-h-[60vh] overflow-y-auto">
 <div>
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[11px] font-medium text-muted-foreground">
 درخواست (Request)
 </span>
 <Button
 size="sm"
 variant="ghost"
 className="h-6 px-2 text-xs gap-1"
 onClick={() =>
 sampleEndpoint &&
 void copyToClipboard(
 sampleEndpoint.request,
 toast,
 "نمونه درخواست کپی شد."
 )
 }
 >
 <Copy className="h-3 w-3" />
 کپی
 </Button>
 </div>
 <pre
 dir="ltr"
 className="bg-muted rounded-md p-3 text-[11px] font-mono leading-relaxed overflow-x-auto border border-border/60"
 >
 <code>{sampleEndpoint?.request}</code>
 </pre>
 </div>
 <div>
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[11px] font-medium text-muted-foreground">
 پاسخ (Response)
 </span>
 <Button
 size="sm"
 variant="ghost"
 className="h-6 px-2 text-xs gap-1"
 onClick={() =>
 sampleEndpoint &&
 void copyToClipboard(
 sampleEndpoint.response,
 toast,
 "نمونه پاسخ کپی شد."
 )
 }
 >
 <Copy className="h-3 w-3" />
 کپی
 </Button>
 </div>
 <pre
 dir="ltr"
 className="bg-muted rounded-md p-3 text-[11px] font-mono leading-relaxed overflow-x-auto border border-border/60"
 >
 <code>{sampleEndpoint?.response}</code>
 </pre>
 </div>
 </div>

 <DialogFooter>
 <Button
 onClick={() => setSampleEndpoint(null)}
 className="gap-1.5"
 >
 <Check className="h-4 w-4" />
 بستن
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ===== Sub-components =====
function MetaItem({
 icon: Icon,
 label,
 value,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
}) {
 return (
 <div className="rounded-lg border border-border/60 p-2.5">
 <div className="flex items-center gap-1.5 mb-1">
 <Icon className="h-3 w-3 text-muted-foreground" />
 <span className="text-[10px] text-muted-foreground">{label}</span>
 </div>
 <p className="text-xs font-medium text-foreground truncate tnum">{value}</p>
 </div>
 );
}

function CodeBlock({ code, onCopy }: { code: string; onCopy: () => void }) {
 return (
 <div className="relative rounded-lg border border-border/60 bg-muted/40 overflow-hidden">
 <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/60">
 <div className="flex items-center gap-1.5">
 <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
 <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
 <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
 </div>
 <Button
 variant="ghost"
 size="icon"
 className="h-6 w-6 text-muted-foreground hover:text-foreground"
 aria-label="کپی کد"
 onClick={onCopy}
 >
 <Copy className="h-3 w-3" />
 </Button>
 </div>
 <pre
 dir="ltr"
 className="font-mono text-xs leading-relaxed text-foreground overflow-x-auto p-3"
 >
 <code>{code}</code>
 </pre>
 </div>
 );
}
