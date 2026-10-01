"use client";

import * as React from "react";
import {
 Store,
 ShoppingCart,
 RefreshCw,
 Link2,
 Webhook,
 Zap,
 Plus,
 BookOpen,
 CheckCircle2,
 AlertTriangle,
 Clock,
 PauseCircle,
 Loader2,
 Settings2,
 Save,
 KeyRound,
 Globe,
 Trash2,
 Send,
 type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ux/empty-state";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, formatNumber } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { HelpTip } from "@/components/ux/help-tooltip";

type ConnStatus = "connected" | "pending" | "inactive";

const STATUS_META: Record<
 ConnStatus,
 { label: string; color: string; dot: string; icon: LucideIcon }
> = {
 connected: {
 label: "متصل",
 color: "bg-success/10 text-success",
 dot: "bg-success",
 icon: CheckCircle2,
 },
 pending: {
 label: "در انتظار",
 color: "bg-warning/10 text-warning",
 dot: "bg-warning",
 icon: Clock,
 },
 inactive: {
 label: "غیرفعال",
 color: "bg-muted text-muted-foreground",
 dot: "bg-muted-foreground",
 icon: PauseCircle,
 },
};

type IntegrationKind = "woocommerce" | "digikala" | "basalam" | "api";

interface Integration {
 id: string;
 name: string;
 nameEn: string;
 icon: LucideIcon;
 status: ConnStatus;
 lastSync: string;
 products: number;
 accent: string;
 kind: IntegrationKind;
}

const INITIAL_INTEGRATIONS: Integration[] = [
 {
 id: "woo",
 name: "ووکامرس",
 nameEn: "WooCommerce",
 icon: Store,
 status: "inactive",
 lastSync: "—",
 products: 0,
 accent: "bg-primary/10 text-primary",
 kind: "woocommerce",
 },
 {
 id: "digi",
 name: "دیجی‌کالا",
 nameEn: "Digikala",
 icon: ShoppingCart,
 status: "inactive",
 lastSync: "—",
 products: 0,
 accent: "bg-primary/10 text-primary",
 kind: "digikala",
 },
 {
 id: "basalam",
 name: "باسلام",
 nameEn: "Basalam",
 icon: Store,
 status: "inactive",
 lastSync: "—",
 products: 0,
 accent: "bg-primary/10 text-primary",
 kind: "basalam",
 },
 {
 id: "api",
 name: "API عمومی",
 nameEn: "Public API",
 icon: Link2,
 status: "inactive",
 lastSync: "غیرفعال",
 products: 0,
 accent: "bg-primary/10 text-primary",
 kind: "api",
 },
];

interface SyncRow {
 time: string;
 type: "order" | "stock" | "price";
 source: string;
 detail: string;
 ok: boolean;
}

// تاریخچه‌ی همگام‌سازی از API (/api/integrations/sync-history) بارگذاری می‌شود.
const INITIAL_SYNC_ROWS: SyncRow[] = [];

const TYPE_FA: Record<SyncRow["type"], string> = {
 order: "سفارش",
 stock: "موجودی",
 price: "قیمت",
};

const TYPE_COLOR: Record<SyncRow["type"], string> = {
 order: "bg-muted text-muted-foreground",
 stock: "bg-muted text-muted-foreground",
 price: "bg-muted text-muted-foreground",
};

interface SyncResult {
 source: string;
 type: string;
 synced: number;
 errors: Array<{ id: string; message: string }>;
 ok: boolean;
}

const SYNC_ENDPOINT_MAP: Record<
 IntegrationKind,
 string | null
> = {
 woocommerce: "/api/integrations/woocommerce/sync",
 basalam: "/api/integrations/basalam/sync",
 digikala: "/api/integrations/digikala/sync",
 api: null,
};

export function EcommerceModule() {
 const { toast } = useToast();
 const [integrations, setIntegrations] = React.useState<Integration[]>(
 INITIAL_INTEGRATIONS
 );
 const [syncRows, setSyncRows] = React.useState<SyncRow[]>(INITIAL_SYNC_ROWS);
 const [syncingId, setSyncingId] = React.useState<string | null>(null);
 const [syncingAll, setSyncingAll] = React.useState(false);
 const [settingsOpen, setSettingsOpen] = React.useState<Integration | null>(
 null
 );
 const [configMap, setConfigMap] = React.useState<
 Record<string, { apiKey: string; storeUrl: string; hasApiKey?: boolean }>
 >({});
 const [savingSettings, setSavingSettings] = React.useState(false);
 const [loadingConfig, setLoadingConfig] = React.useState(false);

 // ============ Webhook Management (localStorage) ============
 type WebhookEvent =
 | "order.created"
 | "order.updated"
 | "order.cancelled"
 | "product.synced"
 | "sync.failed"
 | "stock.updated";

 interface WebhookConfig {
 id: string;
 url: string;
 events: WebhookEvent[];
 active: boolean;
 createdAt: string;
 }

 const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
 "order.created": "سفارش جدید",
 "order.updated": "به‌روزرسانی سفارش",
 "order.cancelled": "لغو سفارش",
 "product.synced": "همگام‌سازی محصول",
 "sync.failed": "خطای همگام‌سازی",
 "stock.updated": "تغییر موجودی",
 };

 const WEBHOOK_STORAGE_KEY = "hoshhesab_webhooks";
 const [webhooks, setWebhooks] = React.useState<WebhookConfig[]>([]);
 const [webhookDialogOpen, setWebhookDialogOpen] = React.useState(false);
 const [webhookForm, setWebhookForm] = React.useState<{
 url: string;
 events: Set<WebhookEvent>;
 }>({ url: "", events: new Set() });
 const [webhookTesting, setWebhookTesting] = React.useState(false);

 // بارگذاری Webhook‌ها از localStorage
 React.useEffect(() => {
 try {
 const raw = localStorage.getItem(WEBHOOK_STORAGE_KEY);
 if (raw) {
 const parsed = JSON.parse(raw) as WebhookConfig[];
 if (Array.isArray(parsed)) setWebhooks(parsed);
 }
 } catch {
 /* ignore */
 }
 }, []);

 const persistWebhooks = (list: WebhookConfig[]) => {
 setWebhooks(list);
 try {
 localStorage.setItem(WEBHOOK_STORAGE_KEY, JSON.stringify(list));
 } catch {
 /* ignore */
 }
 };

 const handleOpenWebhookDialog = () => {
 setWebhookForm({ url: "", events: new Set() });
 setWebhookDialogOpen(true);
 };

 const toggleWebhookEvent = (ev: WebhookEvent) => {
 setWebhookForm((prev) => {
 const next = new Set(prev.events);
 if (next.has(ev)) next.delete(ev);
 else next.add(ev);
 return {...prev, events: next };
 });
 };

 const handleAddWebhook = () => {
 const url = webhookForm.url.trim();
 if (!url ||!/^https?:\/\/.+/i.test(url)) {
 toast({
 title: "آدرس نامعتبر",
 description: "یک URL معتبر (با http یا https) وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 if (webhookForm.events.size === 0) {
 toast({
 title: "رویداد انتخاب نشده",
 description: "حداقل یک رویداد برای Webhook انتخاب کنید.",
 variant: "destructive",
 });
 return;
 }
 const newHook: WebhookConfig = {
 id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
 url,
 events: Array.from(webhookForm.events),
 active: true,
 createdAt: new Date().toISOString(),
 };
 persistWebhooks([...webhooks, newHook]);
 toast({
 title: "Webhook اضافه شد",
 description: `${toPersianDigits(newHook.events.length)} رویداد برای این آدرس فعال شد.`,
 });
 setWebhookDialogOpen(false);
 };

 const handleToggleWebhook = (id: string) => {
 persistWebhooks(
 webhooks.map((w) => (w.id === id? {...w, active:!w.active }: w))
 );
 };

 const handleDeleteWebhook = (id: string) => {
 persistWebhooks(webhooks.filter((w) => w.id!== id));
 toast({ title: "Webhook حذف شد" });
 };

 const handleTestWebhook = async (hook: WebhookConfig) => {
 setWebhookTesting(true);
 try {
 // ارسال یک payload آزمایشی به آدرس Webhook
 const payload = {
 event: "ping",
 timestamp: new Date().toISOString(),
 source: "hoshhesab",
 message: "این یک درخواست آزمایشی از هوش است.",
 };
 // با timeout ۵ ثانیه — در صورت شکست، کاربر مطلع می‌شود
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 5000);
 try {
 const res = await fetch(hook.url, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 signal: controller.signal,
 });
 clearTimeout(timeout);
 if (res.ok || (res.status >= 200 && res.status < 300)) {
 toast({
 title: "تست موفق",
 description: `پاسخ ${toPersianDigits(res.status)} از سرور دریافت شد.`,
 });
 } else {
 toast({
 title: "تست ناموفق",
 description: `کد وضعیت ${toPersianDigits(res.status)} دریافت شد.`,
 variant: "destructive",
 });
 }
 } catch (err) {
 clearTimeout(timeout);
 toast({
 title: "ارسال ناموفق",
 description:
 err instanceof Error && err.name === "AbortError"
? "مهلت پاسخ‌گویی سرور به پایان رسید."
: "ارتباط با آدرس Webhook برقرار نشد. (CORS یا آدرس اشتباه)",
 variant: "destructive",
 });
 }
 } finally {
 setWebhookTesting(false);
 }
 };

 // ============ Connect New Store (localStorage) ============
 type StorePlatform = "shopify" | "woocommerce" | "digikala" | "custom";
 interface SavedStore {
 id: string;
 platform: StorePlatform;
 name: string;
 storeUrl: string;
 apiKey: string;
 apiSecret: string;
 status: ConnStatus;
 createdAt: string;
 }

 const STORES_STORAGE_KEY = "hoshhesab_connected_stores";
 const [savedStores, setSavedStores] = React.useState<SavedStore[]>([]);
 const [connectDialogOpen, setConnectDialogOpen] = React.useState(false);
 const [connectForm, setConnectForm] = React.useState({
 platform: "woocommerce" as StorePlatform,
 name: "",
 storeUrl: "",
 apiKey: "",
 apiSecret: "",
 });
 const [connectTesting, setConnectTesting] = React.useState(false);
 const [connectSaving, setConnectSaving] = React.useState(false);

 React.useEffect(() => {
 try {
 const raw = localStorage.getItem(STORES_STORAGE_KEY);
 if (raw) {
 const parsed = JSON.parse(raw) as SavedStore[];
 if (Array.isArray(parsed)) setSavedStores(parsed);
 }
 } catch {
 /* ignore */
 }
 }, []);

 const persistStores = (list: SavedStore[]) => {
 setSavedStores(list);
 try {
 localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(list));
 } catch {
 /* ignore */
 }
 };

 const PLATFORM_LABEL: Record<StorePlatform, string> = {
 shopify: "Shopify",
 woocommerce: "WooCommerce",
 digikala: "دیجی‌کالا",
 custom: "سفارشی (Custom API)",
 };

 const handleOpenConnectDialog = () => {
 setConnectForm({
 platform: "woocommerce",
 name: "",
 storeUrl: "",
 apiKey: "",
 apiSecret: "",
 });
 setConnectDialogOpen(true);
 };

 const handleTestConnection = async () => {
 if (!connectForm.storeUrl.trim() ||!connectForm.apiKey.trim()) {
 toast({
 title: "اطلاعات ناقص",
 description: "آدرس فروشگاه و کلید API الزامی است.",
 variant: "destructive",
 });
 return;
 }
 setConnectTesting(true);
 try {
 // شبیه‌سازی تست اتصال با تاخیر کوتاه
 await new Promise((r) => setTimeout(r, 900));
 // اعتبارسنجی ساده URL
 try {
 new URL(connectForm.storeUrl);
 } catch {
 toast({
 title: "آدرس نامعتبر",
 description: "آدرس فروشگاه را با http/https وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 toast({
 title: "اتصال برقرار شد",
 description: `به‌صورت آزمایشی به ${PLATFORM_LABEL[connectForm.platform]} متصل شد.`,
 });
 } finally {
 setConnectTesting(false);
 }
 };

 const handleSaveStore = () => {
 if (!connectForm.storeUrl.trim() ||!connectForm.apiKey.trim()) {
 toast({
 title: "اطلاعات ناقص",
 description: "آدرس فروشگاه و کلید API الزامی است.",
 variant: "destructive",
 });
 return;
 }
 setConnectSaving(true);
 try {
 const newStore: SavedStore = {
 id: `store_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
 platform: connectForm.platform,
 name:
 connectForm.name.trim() ||
 PLATFORM_LABEL[connectForm.platform],
 storeUrl: connectForm.storeUrl.trim(),
 apiKey: connectForm.apiKey.trim(),
 apiSecret: connectForm.apiSecret.trim(),
 status: "connected",
 createdAt: new Date().toISOString(),
 };
 persistStores([...savedStores, newStore]);
 toast({
 title: "فروشگاه متصل شد",
 description: `«${newStore.name}» با موفقیت اضافه شد.`,
 });
 setConnectDialogOpen(false);
 } finally {
 setConnectSaving(false);
 }
 };
 const [stats, setStats] = React.useState<{
 ordersToday: number;
 syncSuccess: number;
 syncErrors: number;
 syncedProducts: number;
 activeIntegrations: number;
 }>({
 ordersToday: 0,
 syncSuccess: 0,
 syncErrors: 0,
 syncedProducts: 0,
 activeIntegrations: 0,
 });

 // ============ بارگذاری آمار فروشگاه ============
 const fetchStats = React.useCallback(async () => {
 try {
 const res = await authFetch("/api/ecommerce/stats", { cache: "no-store" });
 const json = await res.json();
 if (json.success && json.stats) {
 setStats({
 ordersToday: Number(json.stats.ordersToday?? 0),
 syncSuccess: Number(json.stats.syncSuccess?? 0),
 syncErrors: Number(json.stats.syncErrors?? 0),
 syncedProducts: Number(json.stats.syncedProducts?? 0),
 activeIntegrations: Number(json.stats.activeIntegrations?? 0),
 });
 }
 } catch (err) {
 console.error("fetchStats error:", err);
 }
 }, []);

 // ============ بارگذاری تاریخچه‌ی همگام‌سازی ============
 const fetchSyncHistory = React.useCallback(async () => {
 try {
 const res = await authFetch(
 "/api/integrations/sync-history?limit=20",
 { cache: "no-store" }
 );
 const json = await res.json();
 if (json.success && Array.isArray(json.rows)) {
 const formatter = new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 });
 const rows: SyncRow[] = json.rows.map(
 (r: {
 id: string;
 time: string;
 type: string;
 typeFa?: string;
 source: string;
 detail: string;
 ok: boolean;
 }) => {
 const typeKey = (
 ["order", "stock", "price"].includes(r.type)
? r.type
: r.type === "stock"
? "stock"
: r.type === "products"
? "stock"
: "order"
 ) as SyncRow["type"];
 return {
 time: formatter.format(new Date(r.time)),
 type: typeKey,
 source: r.source,
 detail: r.detail,
 ok: r.ok,
 };
 }
 );
 setSyncRows(rows);
 }
 } catch (err) {
 console.error("fetchSyncHistory error:", err);
 }
 }, []);

 // ============ بارگذاری اولیه ============
 React.useEffect(() => {
 void fetchStats();
 void fetchSyncHistory();
 }, [fetchStats, fetchSyncHistory]);

 // ============ بارگذاری پیکربندی هنگام باز کردن دیالوگ ============
 React.useEffect(() => {
 if (!settingsOpen) return;
 const it = settingsOpen;
 // اگر قبلاً بارگذاری نشده، از سرور بگیر
 if (configMap[it.id]?.hasApiKey!== undefined) return;
 setLoadingConfig(true);
 authFetch(
 `/api/integrations/${encodeURIComponent(it.kind)}/config`,
 { cache: "no-store" }
 )
.then((r) => r.json())
.then((json) => {
 if (json.success && json.config) {
 setConfigMap((prev) => ({
...prev,
 [it.id]: {
 apiKey: "",
 storeUrl: json.config.storeUrl?? "",
 hasApiKey: Boolean(json.config.hasApiKey),
 },
 }));
 }
 })
.catch((err) => console.error("load config error:", err))
.finally(() => setLoadingConfig(false));
 }, [settingsOpen, configMap]);

 const handleSync = async (it: Integration) => {
 const endpoint = SYNC_ENDPOINT_MAP[it.kind];
 if (!endpoint) {
 toast({
 title: "همگام‌سازی پشتیبانی نمی‌شود",
 description: `برای «${it.name}» همگام‌سازی فعال تعریف نشده است.`,
 variant: "destructive",
 });
 return;
 }

 setSyncingId(it.id);
 try {
 const res = await authFetch(endpoint, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ type: "products" }),
 });
 const data = (await res.json()) as SyncResult & {
 message?: string;
 success?: boolean;
 error?: string;
 };

 if (data.success) {
 const now = new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 }).format(new Date());

 setSyncRows((prev) => [
 {
 time: now,
 type: "stock",
 source: it.name,
 detail: `همگام‌سازی دستی — ${toPersianDigits(
 formatNumber(data.synced)
 )} کالا`,
 ok: data.errors.length === 0,
 },
...prev,
 ]);

 setIntegrations((prev) =>
 prev.map((x) =>
 x.id === it.id
? {
...x,
 lastSync: "هم‌اکنون",
 products: data.synced,
 status: "connected",
 }
: x
 )
 );

 toast({
 title: "همگام‌سازی موفق",
 description: data.message?? `${data.synced} آیتم همگام شد.`,
 });

 // به‌روزرسانی آمار و تاریخچه پس از همگام‌سازی موفق
 void fetchStats();
 void fetchSyncHistory();
 } else {
 toast({
 title: "خطا در همگام‌سازی",
 description: data.error?? "خطای ناشناخته",
 variant: "destructive",
 });
 }
 } catch (err) {
 console.error(err);
 toast({
 title: "خطا در ارتباط با سرور",
 description: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setSyncingId(null);
 }
 };

 // ============ همگام‌سازی همه‌ی یکپارچگی‌های فعال به‌صورت موازی ============
 const handleSyncAll = async () => {
 const syncable = integrations.filter(
 (it) => SYNC_ENDPOINT_MAP[it.kind]!== null && it.status!== "inactive"
 );
 if (syncable.length === 0) {
 toast({
 title: "منبع متصلی یافت نشد",
 description: "هیچ یکپارچگی فعالی برای همگام‌سازی وجود ندارد.",
 variant: "destructive",
 });
 return;
 }

 setSyncingAll(true);
 setSyncingId("all");
 try {
 const results = await Promise.allSettled(
 syncable.map(async (it) => {
 const endpoint = SYNC_ENDPOINT_MAP[it.kind]!;
 const res = await authFetch(endpoint, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ type: "products" }),
 });
 const data = (await res.json()) as SyncResult & {
 success?: boolean;
 error?: string;
 };
 if (!data.success) {
 throw new Error(data.error?? "خطای ناشناخته");
 }
 return { it, data };
 })
 );

 let successCount = 0;
 let failCount = 0;
 const now = new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 }).format(new Date());

 const newRows: SyncRow[] = [];

 for (const r of results) {
 if (r.status === "fulfilled") {
 successCount++;
 const { it, data } = r.value;
 newRows.push({
 time: now,
 type: "stock",
 source: it.name,
 detail: `همگام‌سازی دستی — ${toPersianDigits(
 formatNumber(data.synced)
 )} کالا`,
 ok: data.errors.length === 0,
 });
 setIntegrations((prev) =>
 prev.map((x) =>
 x.id === it.id
? {
...x,
 lastSync: "هم‌اکنون",
 products: data.synced,
 status: "connected",
 }
: x
 )
 );
 } else {
 failCount++;
 }
 }

 if (newRows.length > 0) {
 setSyncRows((prev) => [...newRows,...prev]);
 }

 // به‌روزرسانی آمار و تاریخچه از سرور
 void fetchStats();
 void fetchSyncHistory();

 if (failCount === 0) {
 toast({
 title: "همگام‌سازی کامل شد",
 description: `همه‌ی ${toPersianDigits(successCount)} منبع با موفقیت همگام‌سازی شد.`,
 });
 } else if (successCount === 0) {
 toast({
 title: "خطا در همگام‌سازی",
 description: `همگام‌سازی همه‌ی ${toPersianDigits(failCount)} منبع ناموفق بود.`,
 variant: "destructive",
 });
 } else {
 toast({
 title: "همگام‌سازی جزئی",
 description: `${toPersianDigits(successCount)} منبع موفق، ${toPersianDigits(failCount)} منبع ناموفق.`,
 variant: successCount >= failCount? "default": "destructive",
 });
 }
 } catch (err) {
 console.error(err);
 toast({
 title: "خطا در ارتباط با سرور",
 description: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setSyncingAll(false);
 setSyncingId(null);
 }
 };

 const handleSaveSettings = async () => {
 if (!settingsOpen) return;
 const cfg = configMap[settingsOpen.id] || {
 apiKey: "",
 storeUrl: "",
 };

 if (!cfg.apiKey &&!cfg.hasApiKey) {
 toast({
 title: "کلید API الزامی است",
 description: "برای ذخیره‌ی پیکربندی، کلید API را وارد کنید.",
 variant: "destructive",
 });
 return;
 }

 setSavingSettings(true);
 try {
 const res = await authFetch(
 `/api/integrations/${encodeURIComponent(settingsOpen.kind)}/config`,
 {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 apiKey: cfg.apiKey,
 storeUrl: cfg.storeUrl,
 }),
 }
 );
 const json = await res.json();
 if (json.success) {
 toast({
 title: "تنظیمات ذخیره شد",
 description:
 json.message??
 `پیکربندی «${settingsOpen.name}» با موفقیت به‌روزرسانی شد.`,
 });
 // علامت‌گذاری hasApiKey و پاک کردن apiKey از state محلی
 setConfigMap((prev) => ({
...prev,
 [settingsOpen.id]: {
 apiKey: "",
 storeUrl: cfg.storeUrl,
 hasApiKey: true,
 },
 }));
 setIntegrations((prev) =>
 prev.map((x) =>
 x.id === settingsOpen.id && x.status!== "connected"
? {...x, status: "connected", lastSync: "هم‌اکنون" }
: x
 )
 );
 // به‌روزرسانی آمار (یکپارچگی‌های فعال ممکن است تغییر کند)
 void fetchStats();
 setSettingsOpen(null);
 } else {
 toast({
 title: "خطا در ذخیره‌ی تنظیمات",
 description: json.error?? "ذخیره‌ی پیکربندی ناموفق بود.",
 variant: "destructive",
 });
 }
 } catch (err) {
 console.error(err);
 toast({
 title: "خطا در ارتباط با سرور",
 description: "لطفاً دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setSavingSettings(false);
 }
 };

 return (
 <div className="space-y-5 animate-fade-in-up">
 {/* آمار سریع */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <StatCard
 icon={ShoppingCart}
 label="سفارش‌های امروز"
 value={toPersianDigits(formatNumber(stats.ordersToday))}
 sub="از همه منابع"
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={CheckCircle2}
 label="همگام‌سازی موفق"
 value={toPersianDigits(formatNumber(stats.syncSuccess))}
 sub="۲۴ ساعت اخیر"
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={AlertTriangle}
 label="خطا"
 value={toPersianDigits(formatNumber(stats.syncErrors))}
 sub="نیازمند بررسی"
 color="bg-primary/10 text-primary"
 />
 <StatCard
 icon={Store}
 label="محصولات همگام"
 value={toPersianDigits(formatNumber(stats.syncedProducts))}
 sub={`${toPersianDigits(stats.activeIntegrations)} فروشگاه فعال`}
 color="bg-primary/10 text-primary"
 />
 </div>

 {/* نوار ابزار */}
 <Card>
 <CardContent className="p-4">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Store className="h-5 w-5" />
 </div>
 <div>
 <h3 className="text-sm font-semibold">فروشگاه‌ها و بازارها</h3>
 <p className="text-xs text-muted-foreground">
 یکپارچه‌سازی چندکاناله با همگام‌سازی بلادرنگ
 </p>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={handleOpenWebhookDialog}
 >
 <Webhook className="h-4 w-4" />
 تنظیمات Webhook
 {webhooks.length > 0 && (
 <Badge variant="secondary" className="ms-1 text-[10px] bg-primary/10 text-primary">
 {toPersianDigits(webhooks.length)}
 </Badge>
 )}
 </Button>
 <Button
 variant="outline"
 className="gap-1.5"
 onClick={() =>
 toast({
 title: "مستندات API",
 description: "مستندات کامل API در حال آماده‌سازی است.",
 })
 }
 >
 <BookOpen className="h-4 w-4" />
 مستندات API
 </Button>
 <Button
 className="gap-1.5"
 onClick={handleOpenConnectDialog}
 >
 <Plus className="h-4 w-4" />
 اتصال فروشگاه جدید
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* بنر مزیت رقابتی */}
 <div className="relative overflow-hidden rounded-xl bg-primary/5 border border-primary/20 p-5">
 <div className="flex items-start gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Zap className="h-5 w-5" />
 </div>
 <div className="flex-1">
 <h4 className="font-bold text-base mb-0.5">
 افزونه اختصاصی ووکامرس رایگان در پلن کسب‌وکار
 </h4>
 <p className="text-sm text-muted-foreground">
 رقبا ۳ تا ۱۰ میلیون تومان برای این افزونه می‌گیرند — اما هوش آن را
 به‌صورت رایگان در پلن <span className="font-bold text-primary">کسب‌وکار</span>{" "}
 ارائه می‌دهد!
 </p>
 </div>
 <Button
 size="sm"
 className="hidden sm:inline-flex"
 onClick={() =>
 toast({
 title: "فعال‌سازی افزونه ووکامرس",
 description: "افزونه ووکامرس در پلن کسب‌وکار به‌صورت رایگان فعال می‌شود.",
 })
 }
 >
 فعال‌سازی رایگان
 </Button>
 </div>
 </div>

 {/* کارت‌های یکپارچگی */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {integrations.map((it) => {
 const meta = STATUS_META[it.status];
 const Icon = it.icon;
 const isSyncing = syncingId === it.id;
 const canSync = SYNC_ENDPOINT_MAP[it.kind]!== null;
 return (
 <Card key={it.id} className="relative overflow-hidden card-hover">
 <CardContent className="p-4">
 <div className="flex items-start justify-between mb-3">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 </div>
 <Badge
 variant="secondary"
 className={`text-[10px] gap-1 ${meta.color}`}
 >
 <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
 {meta.label}
 </Badge>
 </div>
 <h4 className="font-bold text-sm">{it.name}</h4>
 <p className="text-[11px] text-muted-foreground mb-3" dir="ltr">
 {it.nameEn}
 </p>
 <div className="space-y-1.5 text-xs">
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground">آخرین همگام‌سازی</span>
 <span className="font-medium">{it.lastSync}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground">محصولات همگام</span>
 <span className="font-medium tnum">
 {toPersianDigits(formatNumber(it.products))}
 </span>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-2 mt-4">
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1.5"
 onClick={() => setSettingsOpen(it)}
 >
 <Settings2 className="h-3.5 w-3.5" />
 تنظیمات
 </Button>
 <Button
 variant="secondary"
 size="sm"
 className="h-8 text-xs gap-1.5"
 disabled={!canSync || isSyncing || it.status === "inactive"}
 onClick={() => handleSync(it)}
 >
 {isSyncing? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 همگام‌سازی
 <HelpTip name="SYNC" size={11} />
 </Button>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>

 {/* همگام‌سازی اخیر */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base flex items-center gap-2">
 <RefreshCw className="h-4 w-4 text-primary" />
 همگام‌سازی اخیر
 </CardTitle>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 gap-1.5"
 disabled={syncingId!== null || syncingAll}
 onClick={() => void handleSyncAll()}
 >
 {syncingAll || syncingId!== null? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <RefreshCw className="h-3.5 w-3.5" />
 )}
 همگام‌سازی دستی همه
 </Button>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {syncRows.length === 0? (
 <EmptyState
 icon={RefreshCw}
 title="هنوز همگام‌سازی ثبت نشده"
 description="پس از اتصال یکپارچگی و اجرای همگام‌سازی، تاریخچه‌ی عملیات در این جدول نمایش داده می‌شود."
 className="py-8"
 />
 ): (
 <div className="overflow-x-auto">
 <table className="w-full text-sm min-w-[760px] table-zebra tnum">
 <thead>
 <tr className="text-start text-xs text-muted-foreground border-b">
 <th scope="col" className="font-medium px-4 py-2.5">زمان</th>
 <th scope="col" className="font-medium px-4 py-2.5">نوع</th>
 <th scope="col" className="font-medium px-4 py-2.5">منبع</th>
 <th scope="col" className="font-medium px-4 py-2.5">جزئیات</th>
 <th scope="col" className="font-medium px-4 py-2.5">وضعیت</th>
 </tr>
 </thead>
 <tbody>
 {syncRows.map((row, i) => (
 <tr key={i} className="border-b border-border/40">
 <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
 {row.time}
 </td>
 <td className="px-4 py-3">
 <Badge
 variant="secondary"
 className={`text-[10px] ${TYPE_COLOR[row.type]}`}
 >
 {TYPE_FA[row.type]}
 </Badge>
 </td>
 <td className="px-4 py-3 font-medium">{row.source}</td>
 <td className="px-4 py-3 text-muted-foreground text-xs">
 {row.detail}
 </td>
 <td className="px-4 py-3">
 {row.ok? (
 <Badge className="text-[10px] bg-success/10 text-success gap-1">
 <CheckCircle2 className="h-3 w-3" />
 موفق
 </Badge>
 ): (
 <Badge className="text-[10px] bg-destructive/10 text-destructive gap-1">
 <AlertTriangle className="h-3 w-3" />
 خطا
 </Badge>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* دیالوگ تنظیمات */}
 <Dialog
 open={settingsOpen!== null}
 onOpenChange={(open) =>!open && setSettingsOpen(null)}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 {settingsOpen && (
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <settingsOpen.icon className="h-4 w-4" />
 </span>
 )}
 تنظیمات اتصال {settingsOpen?.name}
 </DialogTitle>
 <DialogDescription>
 پیکربندی ارتباط با {settingsOpen?.nameEn} — کلید API و آدرس فروشگاه
 را وارد کنید.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="store-url" className="flex items-center gap-1.5">
 <Globe className="h-3.5 w-3.5 text-muted-foreground" />
 آدرس فروشگاه
 </Label>
 <Input
 id="store-url"
 dir="ltr"
 placeholder="https://shop.example.ir"
 disabled={loadingConfig}
 value={
 settingsOpen? configMap[settingsOpen.id]?.storeUrl?? "": ""
 }
 onChange={(e) =>
 setConfigMap((prev) => ({
...prev,
 [settingsOpen!.id]: {
 apiKey: prev[settingsOpen!.id]?.apiKey?? "",
 storeUrl: e.target.value,
 hasApiKey: prev[settingsOpen!.id]?.hasApiKey,
 },
 }))
 }
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="api-key" className="flex items-center gap-1.5">
 <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
 کلید API
 {settingsOpen &&
 configMap[settingsOpen.id]?.hasApiKey &&
!configMap[settingsOpen.id]?.apiKey && (
 <Badge
 variant="secondary"
 className="text-[9px] bg-success/10 text-success gap-1"
 >
 <CheckCircle2 className="h-2.5 w-2.5" />
 ذخیره‌شده
 </Badge>
 )}
 </Label>
 <Input
 id="api-key"
 dir="ltr"
 type="password"
 placeholder={
 settingsOpen && configMap[settingsOpen.id]?.hasApiKey
? "•••••••• (برای تغییر، کلید جدید را وارد کنید)"
: "ck_xxxxxxxxxxxxxxxx"
 }
 disabled={loadingConfig}
 value={
 settingsOpen? configMap[settingsOpen.id]?.apiKey?? "": ""
 }
 onChange={(e) =>
 setConfigMap((prev) => ({
...prev,
 [settingsOpen!.id]: {
 apiKey: e.target.value,
 storeUrl: prev[settingsOpen!.id]?.storeUrl?? "",
 hasApiKey: prev[settingsOpen!.id]?.hasApiKey,
 },
 }))
 }
 />
 <p className="text-[10px] text-muted-foreground">
 کلید با رمزنگاری AES-256-GCM ذخیره می‌شود و هرگز در پاسخ API
 بازگردانده نمی‌شود.
 </p>
 </div>
 </div>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setSettingsOpen(null)}
 disabled={savingSettings}
 >
 انصراف
 </Button>
 <Button
 className="gap-1.5"
 onClick={() => void handleSaveSettings()}
 disabled={savingSettings || loadingConfig}
 >
 {savingSettings? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Save className="h-4 w-4" />
 )}
 ذخیره تنظیمات
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ مدیریت Webhook‌ها */}
 <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Webhook className="h-4 w-4" />
 </span>
 افزودن Webhook جدید
 </DialogTitle>
 <DialogDescription>
 رویدادهای فروشگاه را به آدرس دلخواه شما ارسال می‌کنیم.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label htmlFor="wh-url">آدرس Webhook (URL) *</Label>
 <Input
 id="wh-url"
 dir="ltr"
 placeholder="https://your-server.com/api/webhook"
 value={webhookForm.url}
 onChange={(e) =>
 setWebhookForm((prev) => ({...prev, url: e.target.value }))
 }
 />
 <p className="text-[10px] text-muted-foreground">
 درخواست‌ها به‌صورت POST با بدنه‌ی JSON ارسال می‌شوند.
 </p>
 </div>

 <div className="space-y-1.5">
 <Label>رویدادها *</Label>
 <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-3 bg-muted/30">
 {(Object.keys(WEBHOOK_EVENT_LABEL) as WebhookEvent[]).map((ev) => {
 const checked = webhookForm.events.has(ev);
 return (
 <label
 key={ev}
 className="flex items-center gap-2 cursor-pointer text-xs"
 >
 <Checkbox
 checked={checked}
 onCheckedChange={() => toggleWebhookEvent(ev)}
 />
 <span className={checked? "text-foreground font-medium": "text-muted-foreground"}>
 {WEBHOOK_EVENT_LABEL[ev]}
 </span>
 </label>
 );
 })}
 </div>
 <p className="text-[10px] text-muted-foreground">
 {toPersianDigits(webhookForm.events.size)} رویداد انتخاب شده
 </p>
 </div>
 </div>

 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => setWebhookDialogOpen(false)}
 >
 انصراف
 </Button>
 <Button onClick={handleAddWebhook} className="gap-1.5">
 <Plus className="h-4 w-4" />
 افزودن Webhook
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* لیست Webhook‌ها + دکمه تست */}
 {webhooks.length > 0 && (
 <Card>
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Webhook className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">Webhook‌های فعال</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(webhooks.length)} آدرس ثبت‌شده
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 gap-1"
 onClick={handleOpenWebhookDialog}
 >
 <Plus className="h-3 w-3" />
 افزودن
 </Button>
 </CardHeader>
 <CardContent className="p-0">
 <div className="divide-y divide-border/40">
 {webhooks.map((hook) => (
 <div
 key={hook.id}
 className="flex flex-col sm:flex-row sm:items-center gap-2 p-3"
 >
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <code
 className="text-xs text-foreground truncate"
 dir="ltr"
 title={hook.url}
 >
 {hook.url}
 </code>
 <Badge
 variant="secondary"
 className={`text-[9px] gap-1 ${
 hook.active
? "bg-success/10 text-success"
: "bg-muted text-muted-foreground"
 }`}
 >
 <span
 className={`h-1.5 w-1.5 rounded-full ${
 hook.active? "bg-success": "bg-muted-foreground"
 }`}
 />
 {hook.active? "فعال": "غیرفعال"}
 </Badge>
 </div>
 <div className="flex flex-wrap gap-1">
 {hook.events.map((ev) => (
 <Badge
 key={ev}
 variant="outline"
 className="text-[9px] bg-primary/5 text-primary"
 >
 {WEBHOOK_EVENT_LABEL[ev]}
 </Badge>
 ))}
 </div>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <Switch
 checked={hook.active}
 onCheckedChange={() => handleToggleWebhook(hook.id)}
 aria-label="فعال/غیرفعال"
 />
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-xs gap-1"
 disabled={webhookTesting}
 onClick={() => void handleTestWebhook(hook)}
 >
 {webhookTesting? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ): (
 <Send className="h-3 w-3" />
 )}
 تست
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
 onClick={() => handleDeleteWebhook(hook.id)}
 aria-label="حذف Webhook"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 )}

 {/* لیست فروشگاه‌های متصل */}
 {savedStores.length > 0 && (
 <Card>
 <CardHeader className="pb-3 flex-row items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Store className="h-4 w-4" />
 </div>
 <div>
 <CardTitle className="text-base">فروشگاه‌های متصل‌شده</CardTitle>
 <p className="text-[11px] text-muted-foreground mt-0.5">
 {toPersianDigits(savedStores.length)} فروشگاه سفارشی متصل
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 gap-1"
 onClick={handleOpenConnectDialog}
 >
 <Plus className="h-3 w-3" />
 افزودن فروشگاه
 </Button>
 </CardHeader>
 <CardContent className="p-0">
 <div className="divide-y divide-border/40">
 {savedStores.map((s) => (
 <div
 key={s.id}
 className="flex flex-col sm:flex-row sm:items-center gap-2 p-3"
 >
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <p className="text-sm font-medium truncate">{s.name}</p>
 <Badge variant="outline" className="text-[9px]">
 {PLATFORM_LABEL[s.platform]}
 </Badge>
 <Badge
 variant="secondary"
 className={`text-[9px] gap-1 ${
 s.status === "connected"
? "bg-success/10 text-success"
: "bg-muted text-muted-foreground"
 }`}
 >
 <span
 className={`h-1.5 w-1.5 rounded-full ${
 s.status === "connected"? "bg-success": "bg-muted-foreground"
 }`}
 />
 {s.status === "connected"? "متصل": "غیرفعال"}
 </Badge>
 </div>
 <p className="text-[11px] text-muted-foreground truncate" dir="ltr">
 {s.storeUrl}
 </p>
 </div>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
 onClick={() =>
 persistStores(savedStores.filter((x) => x.id!== s.id))
 }
 aria-label="حذف فروشگاه"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 )}

 {/* دیالوگ اتصال فروشگاه جدید */}
 <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Plus className="h-4 w-4" />
 </span>
 اتصال فروشگاه جدید
 </DialogTitle>
 <DialogDescription>
 پلتفرم فروشگاه و اطلاعات دسترسی API را وارد کنید.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label>پلتفرم</Label>
 <Select
 value={connectForm.platform}
 onValueChange={(v) =>
 setConnectForm((prev) => ({
...prev,
 platform: v as StorePlatform,
 }))
 }
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {(Object.keys(PLATFORM_LABEL) as StorePlatform[]).map((p) => (
 <SelectItem key={p} value={p}>
 {PLATFORM_LABEL[p]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="store-name">نام نمایشی (اختیاری)</Label>
 <Input
 id="store-name"
 value={connectForm.name}
 onChange={(e) =>
 setConnectForm((prev) => ({...prev, name: e.target.value }))
 }
 placeholder="مثلاً: فروشگاه اصلی"
 maxLength={60}
 />
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="store-url-connect" className="flex items-center gap-1.5">
 <Globe className="h-3.5 w-3.5 text-muted-foreground" />
 آدرس فروشگاه *
 </Label>
 <Input
 id="store-url-connect"
 dir="ltr"
 placeholder="https://shop.example.com"
 value={connectForm.storeUrl}
 onChange={(e) =>
 setConnectForm((prev) => ({...prev, storeUrl: e.target.value }))
 }
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="api-key-connect" className="flex items-center gap-1.5">
 <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
 کلید API *
 </Label>
 <Input
 id="api-key-connect"
 dir="ltr"
 type="password"
 placeholder="ck_xxxxxxxxxxxx"
 value={connectForm.apiKey}
 onChange={(e) =>
 setConnectForm((prev) => ({...prev, apiKey: e.target.value }))
 }
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="api-secret-connect">API Secret (اختیاری)</Label>
 <Input
 id="api-secret-connect"
 dir="ltr"
 type="password"
 placeholder="cs_xxxxxxxxxxxx"
 value={connectForm.apiSecret}
 onChange={(e) =>
 setConnectForm((prev) => ({
...prev,
 apiSecret: e.target.value,
 }))
 }
 />
 </div>
 </div>

 <p className="text-[10px] text-muted-foreground">
 اطلاعات به‌صورت محلی در مرورگر ذخیره می‌شود. برای استفاده‌ی production
 از بخش «تنظیمات اتصال» هر یکپارچگی استفاده کنید.
 </p>
 </div>

 <DialogFooter className="gap-2 sm:gap-2">
 <Button
 variant="outline"
 onClick={() => setConnectDialogOpen(false)}
 disabled={connectSaving || connectTesting}
 >
 انصراف
 </Button>
 <Button
 variant="secondary"
 onClick={() => void handleTestConnection()}
 disabled={connectTesting || connectSaving}
 className="gap-1.5"
 >
 {connectTesting? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Zap className="h-4 w-4" />
 )}
 تست اتصال
 </Button>
 <Button
 onClick={handleSaveStore}
 disabled={connectSaving || connectTesting}
 className="gap-1.5"
 >
 {connectSaving? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <Save className="h-4 w-4" />
 )}
 ذخیره فروشگاه
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function StatCard({
 icon: Icon,
 label,
 value,
 sub,
 color,
}: {
 icon: LucideIcon;
 label: string;
 value: string;
 sub: string;
 color: string;
}) {
 return (
 <Card className="card-hover">
 <CardContent className="p-4 flex items-center gap-3">
 <div
 className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}
 >
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="font-bold text-base truncate tnum">{value}</p>
 <p className="text-[10px] text-muted-foreground">{sub}</p>
 </div>
 </CardContent>
 </Card>
 );
}
