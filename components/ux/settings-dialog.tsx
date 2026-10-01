"use client";

import * as React from "react";
import {
 Settings as SettingsIcon,
 User,
 Shield,
 Bell,
 Palette,
 Keyboard,
 Monitor,
 Moon,
 Sun,
 Smartphone,
 Tablet,
 Mail,
 Loader2,
 CheckCircle2,
 Globe,
 Clock,
 Type,
 Layout,
 Rocket,
 AlertTriangle,
 RefreshCw,
 LogOut,
 SwatchBook,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { ThemePicker } from "@/components/theme-picker";
import { useAppTheme, THEMES } from "@/lib/theme-registry";
import {
 Tabs,
 TabsContent,
 TabsList,
 TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/ux/help-tooltip";
import { MigrationWizard } from "@/components/ux/migration-wizard";

/* ============================================================
 ابزار اعمال تنظیمات قالب روی <html> و localStorage
 ============================================================ */

export type FontSize = "sm" | "md" | "lg";
export type Density = "comfortable" | "compact";

const FONT_SIZE_KEY = "hoshhesab.font-size";
const DENSITY_KEY = "hoshhesab.density";

export function applyAppearance(opts: { fontSize?: FontSize; density?: Density }) {
 if (typeof window === "undefined") return;
 const root = document.documentElement;
 if (opts.fontSize) {
 root.classList.remove("font-size-sm", "font-size-md", "font-size-lg");
 root.classList.add(`font-size-${opts.fontSize}`);
 try {
 localStorage.setItem(FONT_SIZE_KEY, opts.fontSize);
 } catch {
 /* ignore */
 }
 }
 if (opts.density) {
 if (opts.density === "compact") {
 root.classList.add("compact");
 } else {
 root.classList.remove("compact");
 }
 try {
 localStorage.setItem(DENSITY_KEY, opts.density);
 } catch {
 /* ignore */
 }
 }
}

export function loadAppearance(): { fontSize: FontSize; density: Density } {
 if (typeof window === "undefined") {
 return { fontSize: "md", density: "comfortable" };
 }
 let fontSize: FontSize = "md";
 let density: Density = "comfortable";
 try {
 const fs = localStorage.getItem(FONT_SIZE_KEY) as FontSize | null;
 if (fs === "sm" || fs === "md" || fs === "lg") fontSize = fs;
 const d = localStorage.getItem(DENSITY_KEY) as Density | null;
 if (d === "comfortable" || d === "compact") density = d;
 } catch {
 /* ignore */
 }
 return { fontSize, density };
}

// اعمال اولیه هنگام import (در browser)
if (typeof window!== "undefined") {
 const { fontSize, density } = loadAppearance();
 const root = document.documentElement;
 root.classList.add(`font-size-${fontSize}`);
 if (density === "compact") root.classList.add("compact");
}


interface SettingsDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
 { keys: "Alt + N", desc: "ایجاد فاکتور جدید" },
 { keys: "Alt + P", desc: "چاپ" },
 { keys: "Alt + E", desc: "خروجی گرفتن" },
 { keys: "/", desc: "تمرکز روی جستجو" },
 { keys: "?", desc: "نمایش راهنمای میانبرها" },
 { keys: "G سپس D", desc: "رفتن به داشبورد" },
 { keys: "G سپس I", desc: "رفتن به فاکتورها" },
 { keys: "Cmd + K", desc: "باز کردن پنل فرمان" },
 { keys: "Cmd + ,", desc: "باز کردن تنظیمات" },
];

interface UserProfileData {
 name: string | null;
 email: string | null;
 phone: string | null;
 username: string | null;
 role: string | null;
 twoFactorEnabled?: boolean;
 lastLogin: string | null;
 lastLoginIp: string | null;
 tenantName?: string | null;
 plan?: string | null;
}

interface SessionRow {
 id: string;
 deviceName: string;
 ipAddress: string | null;
 createdAt: string;
 lastUsedAt: string;
 expiresAt: string;
 isCurrent: boolean;
}

const EMPTY_PROFILE: UserProfileData = {
 name: "",
 email: "",
 phone: "",
 username: "",
 role: "",
 lastLogin: null,
 lastLoginIp: null,
};

/** نمایش شمسی تاریخ ISO (مثل آخرین فعالیت نشست) */
function formatJalaliDateTime(iso: string | null): string {
 if (!iso) return "—";
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "short",
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 }).format(new Date(iso));
 } catch {
 return "—";
 }
}

const ROLE_FA: Record<string, string> = {
 ADMIN: "مدیر سیستم",
 SUPER_ADMIN: "مدیر کل",
 USER: "کاربر",
 ACCOUNTANT: "حسابدار",
 VIEWER: "بیننده",
};

const NOTIFICATIONS_KEY = "hoshhesab.notification-settings";

const DEFAULT_NOTIFICATIONS = {
 emailNotif: true,
 pushNotif: true,
 smsNotif: false,
 invoiceCreated: true,
 invoicePaid: true,
 invoiceOverdue: true,
 stockLow: true,
 checkDue: true,
 monthlyReport: false,
};

function loadNotificationSettings(): typeof DEFAULT_NOTIFICATIONS {
 if (typeof window === "undefined") return DEFAULT_NOTIFICATIONS;
 try {
 const raw = localStorage.getItem(NOTIFICATIONS_KEY);
 if (!raw) return DEFAULT_NOTIFICATIONS;
 const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_NOTIFICATIONS>;
 return {...DEFAULT_NOTIFICATIONS,...parsed };
 } catch {
 return DEFAULT_NOTIFICATIONS;
 }
}

/**
 * SettingsDialog — مرکز تنظیمات با ۶ تب
 *
 * FIX(C2): این دیالوگ کاملاً قلابی بود (داده هاردکد «رضا محمدی»، فرم رمز بی‌اثر،
 * لیست نشست‌های فیک، toast با setTimeout). حالا:
 * - پروفایل از GET /api/user/profile (با skeleton و حالت خطا)
 * - ذخیره پروفایل → PATCH /api/user/profile
 * - تغییر رمز → POST /api/user/change-credentials (شکل دقیق route)
 * - نشست‌ها از GET /api/auth/sessions + ابطال تک‌نشست (DELETE /api/auth/sessions)
 * - «خروج از همه دستگاه‌ها» → POST /api/auth/sessions/revoke-all + خروج محلی
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
 const { toast } = useToast();
 const { theme, resolvedTheme, setTheme } = useTheme();
 const { theme: appTheme, setAppTheme } = useAppTheme();
 const isDarkPreview = resolvedTheme === "dark";
 const [activeTab, setActiveTab] = React.useState("profile");
 const [themePickerOpen, setThemePickerOpen] = React.useState(false);

 // ===== پروفایل (واقعی — C2) =====
 const [profile, setProfile] = React.useState<UserProfileData>(EMPTY_PROFILE);
 const [profileLoading, setProfileLoading] = React.useState(false);
 const [profileError, setProfileError] = React.useState<string | null>(null);
 const [savingProfile, setSavingProfile] = React.useState(false);

 // ===== امنیت =====
 const [security, setSecurity] = React.useState({
 currentPassword: "",
 newPassword: "",
 confirmPassword: "",
 });
 const [changingPassword, setChangingPassword] = React.useState(false);

 // ===== نشست‌های فعال (واقعی — C2) =====
 const [sessions, setSessions] = React.useState<SessionRow[]>([]);
 const [sessionsLoading, setSessionsLoading] = React.useState(false);
 const [sessionsError, setSessionsError] = React.useState<string | null>(null);
 const [revokingSessionId, setRevokingSessionId] = React.useState<string | null>(null);
 const [revokingAll, setRevokingAll] = React.useState(false);

 // ===== اعلان‌ها (ذخیره محلی واقعی) =====
 const [notifications, setNotifications] = React.useState(DEFAULT_NOTIFICATIONS);
 React.useEffect(() => {
 setNotifications(loadNotificationSettings());
 }, []);

 // ===== قالب =====
 const initial = React.useMemo(() => {
 if (typeof window === "undefined") {
 return { fontSize: "md" as FontSize, density: "comfortable" as Density };
 }
 return loadAppearance();
 }, []);
 const [fontSize, setFontSize] = React.useState<FontSize>(initial.fontSize);
 const [density, setDensity] = React.useState<Density>(initial.density);

 // اعمال فوری هنگام تغییر تنظیمات قالب
 const applyFontSize = (size: FontSize) => {
 setFontSize(size);
 applyAppearance({ fontSize: size });
 };
 const applyDensity = (d: Density) => {
 setDensity(d);
 applyAppearance({ density: d });
 };

 // ===== بارگذاری داده‌های واقعی هنگام باز شدن دیالوگ (C2) =====
 const fetchProfile = React.useCallback(async () => {
 setProfileLoading(true);
 setProfileError(null);
 try {
 const res = await authFetch("/api/user/profile", { cache: "no-store" });
 const json = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 error?: string;
 data?: {
 name?: string | null;
 email?: string | null;
 phone?: string | null;
 username?: string | null;
 role?: string | null;
 twoFactorEnabled?: boolean;
 lastLogin?: string | null;
 lastLoginIp?: string | null;
 tenant?: { name?: string | null; plan?: string | null };
 };
 };
 if (!res.ok || !json?.success || !json.data) {
 throw new Error(json?.error || "خطا در دریافت پروفایل");
 }
 setProfile({
 name: json.data.name || "",
 email: json.data.email || "",
 phone: json.data.phone || "",
 username: json.data.username || "",
 role: json.data.role || "",
 twoFactorEnabled: Boolean(json.data.twoFactorEnabled),
 lastLogin: json.data.lastLogin || null,
 lastLoginIp: json.data.lastLoginIp || null,
 tenantName: json.data.tenant?.name || null,
 plan: json.data.tenant?.plan || null,
 });
 } catch (err) {
 setProfileError(err instanceof Error ? err.message : "خطا در دریافت پروفایل");
 } finally {
 setProfileLoading(false);
 }
 }, []);

 const fetchSessions = React.useCallback(async () => {
 setSessionsLoading(true);
 setSessionsError(null);
 try {
 const res = await authFetch("/api/auth/sessions", { cache: "no-store" });
 const json = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 error?: string;
 data?: SessionRow[];
 };
 if (!res.ok || !json?.success || !Array.isArray(json.data)) {
 throw new Error(json?.error || "خطا در دریافت نشست‌ها");
 }
 setSessions(json.data);
 } catch (err) {
 setSessionsError(err instanceof Error ? err.message : "خطا در دریافت نشست‌ها");
 setSessions([]);
 } finally {
 setSessionsLoading(false);
 }
 }, []);

 React.useEffect(() => {
 if (open) {
 void fetchProfile();
 void fetchSessions();
 }
 }, [open, fetchProfile, fetchSessions]);

 // ===== ذخیره پروفایل — PATCH /api/user/profile =====
 const handleSaveProfile = async () => {
 const name = (profile.name || "").trim();
 const email = (profile.email || "").trim();
 const phone = (profile.phone || "").trim();
 if (!name) {
 toast({ title: "نام را وارد کنید", variant: "destructive" });
 return;
 }
 if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 toast({ title: "ایمیل معتبر وارد کنید", variant: "destructive" });
 return;
 }
 setSavingProfile(true);
 try {
 const res = await authFetch("/api/user/profile", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined }),
 });
 const json = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 error?: string;
 message?: string;
 };
 if (!res.ok || !json?.success) {
 throw new Error(json?.error || "ذخیره پروفایل ناموفق بود");
 }
 toast({
 title: "پروفایل ذخیره شد",
 description: json?.message || "اطلاعات حساب شما به‌روزرسانی شد.",
 });
 } catch (err) {
 toast({
 title: "خطا در ذخیره پروفایل",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setSavingProfile(false);
 }
 };

 // ===== تغییر رمز — POST /api/user/change-credentials =====
 // شکل دقیق route: { currentPassword, newEmail?, newPassword? }
 const handleChangePassword = async () => {
 const { currentPassword, newPassword, confirmPassword } = security;
 if (!currentPassword) {
 toast({ title: "گذرواژه فعلی الزامی است", variant: "destructive" });
 return;
 }
 if (!newPassword) {
 toast({ title: "گذرواژه جدید را وارد کنید", variant: "destructive" });
 return;
 }
 if (newPassword !== confirmPassword) {
 toast({ title: "گذرواژه جدید و تکرار آن یکسان نیست", variant: "destructive" });
 return;
 }
 if (newPassword.length < 8) {
 toast({
 title: "گذرواژه جدید ضعیف است",
 description: "حداقل ۸ نویسه، شامل حروف و عدد.",
 variant: "destructive",
 });
 return;
 }
 setChangingPassword(true);
 try {
 const res = await authFetch("/api/user/change-credentials", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ currentPassword, newPassword }),
 });
 const json = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 error?: string;
 message?: string;
 details?: string[];
 };
 if (!res.ok || !json?.success) {
 throw new Error(
 json?.details?.[0] || json?.error || "تغییر گذرواژه ناموفق بود"
 );
 }
 toast({
 title: "گذرواژه تغییر کرد",
 description: json?.message || "از این پس با گذرواژه جدید وارد شوید.",
 });
 setSecurity({ currentPassword: "", newPassword: "", confirmPassword: "" });
 } catch (err) {
 toast({
 title: "خطا در تغییر گذرواژه",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setChangingPassword(false);
 }
 };

 // ===== ابطال یک نشست — DELETE /api/auth/sessions (body: {sessionId}) =====
 const handleRevokeSession = async (sessionId: string) => {
 setRevokingSessionId(sessionId);
 try {
 const res = await authFetch("/api/auth/sessions", {
 method: "DELETE",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ sessionId }),
 });
 const json = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 error?: string;
 message?: string;
 };
 if (!res.ok || !json?.success) {
 throw new Error(json?.error || "ابطال نشست ناموفق بود");
 }
 toast({ title: "نشست ابطال شد", description: json?.message || "دسترسی آن دستگاه قطع شد." });
 setSessions((prev) => prev.filter((s) => s.id !== sessionId));
 } catch (err) {
 toast({
 title: "خطا در ابطال نشست",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setRevokingSessionId(null);
 }
 };

 // ===== خروج از همه دستگاه‌ها — POST /api/auth/sessions/revoke-all =====
 // (route با POST پیاده شده — نه DELETE) + خروج محلی از این مرورگر
 const handleRevokeAllSessions = async () => {
 setRevokingAll(true);
 try {
 const res = await authFetch("/api/auth/sessions/revoke-all", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 });
 const json = (await res.json().catch(() => ({}))) as {
 success?: boolean;
 error?: string;
 count?: number;
 message?: string;
 };
 if (!res.ok || !json?.success) {
 throw new Error(json?.error || "ابطال نشست‌ها ناموفق بود");
 }
 toast({
 title: "از همه دستگاه‌ها خارج شدید",
 description:
 json?.message ||
 `${toPersianDigits(json?.count ?? 0)} نشست دیگر ابطال شد و از اینجا هم خارج می‌شوید.`,
 });
 // خروج محلی: پاک‌کردن توکن + رویداد session-expired (app-shell به صفحه ورود برمی‌گردد)
 try {
 localStorage.removeItem("hoshhesab_user_token");
 } catch {
 /* ignore */
 }
 onOpenChange(false);
 window.dispatchEvent(
 new CustomEvent("hoshhesab:session-expired", {
 detail: { reason: "revoke_all" },
 })
 );
 } catch (err) {
 toast({
 title: "خطا در ابطال نشست‌ها",
 description: err instanceof Error ? err.message : "خطای ناشناخته",
 variant: "destructive",
 });
 } finally {
 setRevokingAll(false);
 }
 };

 // ===== ذخیره اعلان‌ها (localStorage — واقعی، نه toast قلابی) =====
 const handleSaveNotifications = () => {
 try {
 localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
 toast({
 title: "تنظیمات اعلان ذخیره شد",
 description: "ترجیحات اعلان‌های شما در این مرورگر ذخیره شد.",
 });
 } catch {
 toast({
 title: "ذخیره ناموفق",
 description: "ذخیره‌سازی تنظیمات در این مرورگر ممکن نشد.",
 variant: "destructive",
 });
 }
 };

 // دکمه «ذخیره تغییرات» فوتر — عمل واقعیِ هر تب
 const handleTabSave = () => {
 if (activeTab === "profile") {
 void handleSaveProfile();
 } else if (activeTab === "security") {
 void handleChangePassword();
 } else if (activeTab === "notifications") {
 handleSaveNotifications();
 } else if (activeTab === "appearance") {
 // تنظیمات قالب هم‌زمان با انتخاب اعمال و در localStorage ذخیره می‌شود
 toast({
 title: "تنظیمات قالب ذخیره شد",
 description: "اندازه قلم، تراکم و تم شما ذخیره شد.",
 });
 }
 };

 const isSaving =
 savingProfile || changingPassword || revokingAll;

 const toggleNotif = (key: keyof typeof notifications) => {
 setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-w-3xl max-h-[86dvh] p-0 overflow-hidden gap-0">
 <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2.5 border-b border-border">
 <DialogTitle className="flex items-center gap-2 text-base">
 <SettingsIcon className="h-4 w-4 text-primary" />
 تنظیمات
 </DialogTitle>
 <DialogDescription className="text-xs">
 مدیریت پروفایل، امنیت، اعلان‌ها و قالب برنامه
 </DialogDescription>
 </DialogHeader>

 <Tabs
 value={activeTab}
 onValueChange={setActiveTab}
 className="flex flex-1 min-h-0"
 >
 {/* لیست تب‌ها — عمودی روی دسکتاپ، افقی روی موبایل */}
 <div className="border-b sm:border-b-0 sm:border-l border-border bg-muted/30">
 <TabsList className="flex sm:flex-col h-auto sm:h-auto bg-transparent p-2 gap-1 rounded-none w-full sm:w-44">
 <TabsTrigger
 value="profile"
 className="justify-start gap-2 w-full px-3"
 >
 <User className="h-3.5 w-3.5" />
 <span className="text-xs">پروفایل</span>
 </TabsTrigger>
 <TabsTrigger
 value="security"
 className="justify-start gap-2 w-full px-3"
 >
 <Shield className="h-3.5 w-3.5" />
 <span className="text-xs">امنیت</span>
 </TabsTrigger>
 <TabsTrigger
 value="notifications"
 className="justify-start gap-2 w-full px-3"
 >
 <Bell className="h-3.5 w-3.5" />
 <span className="text-xs">اعلان‌ها</span>
 </TabsTrigger>
 <TabsTrigger
 value="appearance"
 className="justify-start gap-2 w-full px-3"
 >
 <Palette className="h-3.5 w-3.5" />
 <span className="text-xs">قالب</span>
 </TabsTrigger>
 <TabsTrigger
 value="shortcuts"
 className="justify-start gap-2 w-full px-3"
 >
 <Keyboard className="h-3.5 w-3.5" />
 <span className="text-xs">میانبرها</span>
 </TabsTrigger>
 <TabsTrigger
 value="migration"
 className="justify-start gap-2 w-full px-3"
 >
 <Rocket className="h-3.5 w-3.5" />
 <span className="text-xs">انتقال داده</span>
 </TabsTrigger>
 </TabsList>
 </div>

 {/* محتوای تب‌ها — فشرده (گزارش مالک: فضای کمتر) + اسکرول نازک */}
 <div className="flex-1 overflow-y-auto max-h-[62vh] p-4 sm:p-5 compact-scroll">
 {/* ===== پروفایل ===== */}
 <TabsContent value="profile" className="space-y-4 mt-0">
 {profileLoading? (
 <div className="space-y-4">
 <div className="flex items-center gap-4 pb-4 border-b">
 <Skeleton className="h-16 w-16 rounded-full" />
 <div className="space-y-2">
 <Skeleton className="h-4 w-32" />
 <Skeleton className="h-3 w-24" />
 <Skeleton className="h-7 w-24 mt-1" />
 </div>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {[0, 1, 2, 3].map((i) => (
 <div key={i} className="space-y-1.5">
 <Skeleton className="h-3 w-20" />
 <Skeleton className="h-9 w-full" />
 </div>
 ))}
 </div>
 </div>
 ): profileError? (
 <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
 <div className="flex items-start gap-2">
 <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
 <div>
 <p className="text-sm font-medium text-foreground">خطا در دریافت پروفایل</p>
 <p className="text-xs text-muted-foreground mt-0.5">{profileError}</p>
 </div>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-8 text-xs gap-1.5"
 onClick={() => void fetchProfile()}
 >
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 ) : (
 <>
 <div className="flex items-center gap-4 pb-4 border-b">
 <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-bold">
 {(profile.name || profile.username || "؟")
 .trim()
 .split(/\s+/)
 .slice(0, 2)
 .map((w) => w[0])
 .join("‌")}
 </div>
 <div>
 <h3 className="text-sm font-semibold">{profile.name || profile.username || "کاربر"}</h3>
 <p className="text-xs text-muted-foreground">
 {ROLE_FA[profile.role || ""] || profile.role || "کاربر"}
 {profile.tenantName? ` — ${profile.tenantName}`: ""}
 </p>
 <p className="text-[10px] text-muted-foreground mt-0.5 tnum">
 ورود آخر: {formatJalaliDateTime(profile.lastLogin)}
 {profile.lastLoginIp? ` — ${toPersianDigits(profile.lastLoginIp)}`: ""}
 </p>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">نام و نام خانوادگی</Label>
 <Input
 value={profile.name?? ""}
 onChange={(e) =>
 setProfile({...profile, name: e.target.value })
 }
 className="h-9"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">ایمیل</Label>
 <Input
 type="email"
 value={profile.email?? ""}
 onChange={(e) =>
 setProfile({...profile, email: e.target.value })
 }
 className="h-9"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">تلفن همراه</Label>
 <Input
 value={profile.phone?? ""}
 onChange={(e) =>
 setProfile({...profile, phone: e.target.value })
 }
 className="h-9"
 dir="ltr"
 placeholder={profile.phone? undefined: "— ثبت نشده —"}
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">نقش</Label>
 <Input
 value={ROLE_FA[profile.role || ""] || profile.username || "کاربر"}
 disabled
 className="h-9 bg-muted/40"
 />
 </div>
 </div>

 <SaveButton
 onSave={() => void handleSaveProfile()}
 saving={savingProfile}
 />
 </>
 )}
 </TabsContent>

 {/* ===== امنیت ===== */}
 <TabsContent value="security" className="space-y-5 mt-0">
 {/* تغییر رمز */}
 <div className="space-y-3">
 <div>
 <h3 className="text-sm font-semibold">تغییر گذرواژه</h3>
 <p className="text-xs text-muted-foreground">
 حداقل ۸ نویسه، شامل حروف و عدد
 </p>
 </div>
 <div className="grid grid-cols-1 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">گذرواژه فعلی *</Label>
 <Input
 type="password"
 value={security.currentPassword}
 onChange={(e) =>
 setSecurity({...security, currentPassword: e.target.value })
 }
 className="h-9"
 dir="ltr"
 autoComplete="current-password"
 />
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs">گذرواژه جدید *</Label>
 <Input
 type="password"
 value={security.newPassword}
 onChange={(e) =>
 setSecurity({...security, newPassword: e.target.value })
 }
 className="h-9"
 dir="ltr"
 autoComplete="new-password"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs">تکرار گذرواژه جدید *</Label>
 <Input
 type="password"
 value={security.confirmPassword}
 onChange={(e) =>
 setSecurity({...security, confirmPassword: e.target.value })
 }
 className="h-9"
 dir="ltr"
 autoComplete="new-password"
 />
 </div>
 </div>
 </div>
 </div>

 {/* 2FA — وضعیت واقعی از پروفایل (فعلاً فقط نمایشی) */}
 <div className="rounded-lg border p-3 space-y-2">
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-start gap-2">
 <Shield className="h-4 w-4 text-primary mt-0.5" />
 <div>
 <p className="text-sm font-medium">احراز هویت دو مرحله‌ای</p>
 <p className="text-xs text-muted-foreground">
 با فعال‌سازی، هنگام ورود کد یکبارمصرف نیاز است
 </p>
 </div>
 </div>
 {/* FIX(C2): وضعیت واقعی دو مرحله‌ای از سرور — سوئیچ قلابی حذف شد */}
 <Badge
 className={
 profile.twoFactorEnabled
? "bg-success/15 text-success"
: "bg-muted text-muted-foreground"
 }
 >
 {profile.twoFactorEnabled? "فعال": "غیرفعال"}
 </Badge>
 </div>
 {profile.twoFactorEnabled && (
 <div className="flex items-center gap-1.5 text-xs text-success pt-1 border-t">
 <CheckCircle2 className="h-3.5 w-3.5" />
 <span>۲FA از طریق اپلیکیشن احراز هویت فعال است</span>
 </div>
 )}
 </div>

 {/* نشست‌های فعال — واقعی از GET /api/auth/sessions */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-semibold">
 نشست‌های فعال
 {sessions.length > 0 && (
 <Badge variant="secondary" className="ms-1.5 text-[9px] h-4 tnum">
 {toPersianDigits(sessions.length)}
 </Badge>
 )}
 </h3>
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs"
 onClick={() => void fetchSessions()}
 aria-label="به‌روزرسانی لیست نشست‌ها"
 >
 <RefreshCw className={cn("h-3.5 w-3.5", sessionsLoading && "animate-spin")} />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs text-destructive gap-1"
 onClick={() => void handleRevokeAllSessions()}
 disabled={revokingAll || sessions.filter((s) => !s.isCurrent).length === 0}
 title="همه‌ی نشست‌های دیگر (به‌جز این دستگاه) ابطال می‌شوند و از اینجا هم خارج می‌شوید"
 >
 {revokingAll? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <LogOut className="h-3.5 w-3.5" />}
 خروج از همه دستگاه‌ها
 </Button>
 </div>
 </div>
 {sessionsError? (
 <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
 <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
 <div className="flex-1">
 <p className="text-xs font-medium">خطا در دریافت نشست‌ها</p>
 <p className="text-[11px] text-muted-foreground mt-0.5">{sessionsError}</p>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-xs"
 onClick={() => void fetchSessions()}
 >
 تلاش مجدد
 </Button>
 </div>
 ): sessionsLoading? (
 <div className="space-y-2">
 {[0, 1].map((i) => (
 <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5">
 <Skeleton className="h-9 w-9 rounded-md" />
 <div className="flex-1 space-y-1.5">
 <Skeleton className="h-3.5 w-40" />
 <Skeleton className="h-3 w-56" />
 </div>
 </div>
 ))}
 </div>
 ): sessions.length === 0? (
 <p className="text-xs text-muted-foreground text-center py-4">
 نشست فعالی یافت نشد.
 </p>
 ): (
 <div className="space-y-2">
 {sessions.map((s) => (
 <div
 key={s.id}
 className="flex items-center gap-3 rounded-lg border p-2.5"
 >
 <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
 {/iOS|iPhone|iPad|Android|Mobile/i.test(s.deviceName)? (
 <Smartphone className="h-4 w-4" />
 ): /Tablet/i.test(s.deviceName)? (
 <Tablet className="h-4 w-4" />
 ): (
 <Monitor className="h-4 w-4" />
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <p className="text-xs font-medium truncate" title={s.deviceName}>
 {s.deviceName}
 </p>
 {s.isCurrent && (
 <Badge className="text-[9px] h-4 bg-success/15 text-success">
 این دستگاه
 </Badge>
 )}
 </div>
 <p className="text-[11px] text-muted-foreground tnum">
 آخرین فعالیت: {formatJalaliDateTime(s.lastUsedAt)} — ایجاد: {formatJalaliDateTime(s.createdAt)}
 {s.ipAddress? ` — ${toPersianDigits(s.ipAddress)}`: ""}
 </p>
 </div>
 {!s.isCurrent && (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs text-destructive"
 disabled={revokingSessionId === s.id}
 onClick={() => void handleRevokeSession(s.id)}
 >
 {revokingSessionId === s.id? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 "خروج"
 )}
 </Button>
 )}
 </div>
 ))}
 </div>
 )}
 </div>

 <SaveButton
 onSave={() => void handleChangePassword()}
 saving={changingPassword}
 />
 </TabsContent>

 {/* ===== اعلان‌ها ===== */}
 <TabsContent value="notifications" className="space-y-4 mt-0">
 <div className="space-y-3">
 <div>
 <h3 className="text-sm font-semibold">کانال‌های اعلان</h3>
 <p className="text-xs text-muted-foreground">
 از چه طریقی اعلان‌ها را دریافت کنید
 </p>
 </div>
 <NotifRow
 icon={Mail}
 label="اعلان ایمیلی"
 desc="دریافت اعلان‌ها از طریق ایمیل"
 checked={notifications.emailNotif}
 onChange={() => toggleNotif("emailNotif")}
 />
 <NotifRow
 icon={Bell}
 label="اعلان درون‌برنامه‌ای (Push)"
 desc="نمایش نوتیفیکیشن در مرورگر"
 checked={notifications.pushNotif}
 onChange={() => toggleNotif("pushNotif")}
 />
 <NotifRow
 icon={Smartphone}
 label="پیامک"
 desc="دریافت پیامک برای رویدادهای مهم"
 checked={notifications.smsNotif}
 onChange={() => toggleNotif("smsNotif")}
 />
 </div>

 <div className="space-y-3 pt-3 border-t">
 <div>
 <h3 className="text-sm font-semibold">انواع اعلان</h3>
 <p className="text-xs text-muted-foreground">
 کدام رویدادها به شما اطلاع داده شوند
 </p>
 </div>
 <NotifRow
 icon={CheckCircle2}
 label="ثبت فاکتور جدید"
 checked={notifications.invoiceCreated}
 onChange={() => toggleNotif("invoiceCreated")}
 />
 <NotifRow
 icon={CheckCircle2}
 label="تسویه فاکتور"
 checked={notifications.invoicePaid}
 onChange={() => toggleNotif("invoicePaid")}
 />
 <NotifRow
 icon={Clock}
 label="فاکتور سررسید گذشته"
 checked={notifications.invoiceOverdue}
 onChange={() => toggleNotif("invoiceOverdue")}
 />
 <NotifRow
 icon={Clock}
 label="هشدار کمبود موجودی"
 checked={notifications.stockLow}
 onChange={() => toggleNotif("stockLow")}
 />
 <NotifRow
 icon={Clock}
 label="یادآوری سررسید چک"
 checked={notifications.checkDue}
 onChange={() => toggleNotif("checkDue")}
 />
 <NotifRow
 icon={Globe}
 label="گزارش ماهانه"
 checked={notifications.monthlyReport}
 onChange={() => toggleNotif("monthlyReport")}
 />
 </div>

 <SaveButton onSave={handleSaveNotifications} saving={false} />
 </TabsContent>

 {/* ===== قالب ===== */}
 <TabsContent value="appearance" className="space-y-5 mt-0">
 {/* ----- تم ظاهری (رنگی) ----- */}
 <div className="space-y-2">
 <div className="flex items-center gap-1.5">
 <SwatchBook className="h-3.5 w-3.5 text-primary" />
 <h3 className="text-sm font-semibold">تم ظاهری</h3>
 </div>
 <p className="text-xs text-muted-foreground">
 رنگ‌بندی و آیکون‌های برنامه — {THEMES.length} تم خیره‌کننده با روان‌شناسی رنگ
 </p>
 <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
 <div className="flex items-center gap-2.5 min-w-0">
 <span
 data-theme={appTheme.id}
 className={`block h-5 w-5 rounded-full shrink-0 border border-border/60 ${isDarkPreview ? "dark" : ""}`}
 style={{
 background:
 "linear-gradient(135deg, var(--swatch-1) 0%, var(--swatch-2) 55%, var(--swatch-3) 100%)",
 }}
 aria-hidden="true"
 />
 <div className="min-w-0">
 <p className="text-xs font-semibold text-foreground">{appTheme.nameFa}</p>
 <p className="text-[10px] text-muted-foreground truncate">{appTheme.tagline}</p>
 </div>
 </div>
 <Button
 size="sm"
 variant="outline"
 className="h-8 text-xs gap-1.5 shrink-0"
 onClick={() => setThemePickerOpen(true)}
 >
 <Palette className="h-3.5 w-3.5" />
 انتخاب تم
 </Button>
 </div>
 {/* نوار سریع {THEMES.length} تم — کلیک مستقیم = اعمال همان لحظه (شکایت مالک:
 «روی تم‌ها کلیک می‌کنم اتفاقی نمی‌افتد») بدون باز کردن دیالوگ */}
 <div className="flex flex-wrap items-center gap-1.5 pt-1" role="radiogroup" aria-label="انتخاب سریع تم">
 {THEMES.map((t) => {
 const active = appTheme.id === t.id;
 return (
 <button
 key={t.id}
 type="button"
 role="radio"
 aria-checked={active}
 aria-label={`تم ${t.nameFa}`}
 title={`${t.nameFa} — ${t.tagline}`}
 onClick={() => setAppTheme(t.id)}
 className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
 active ? "border-primary scale-110" : "border-border/60"
 }`}
 >
 <span
 data-theme={t.id}
 className={`block h-full w-full rounded-full ${isDarkPreview ? "dark" : ""}`}
 style={{
 background:
 "linear-gradient(135deg, var(--swatch-1) 0%, var(--swatch-2) 55%, var(--swatch-3) 100%)",
 }}
 aria-hidden="true"
 />
 {active && <span className="sr-only">انتخاب‌شده</span>}
 </button>
 );
 })}
 </div>
 </div>

 {/* ----- انتخاب تم ----- */}
 <div className="space-y-2">
 <div className="flex items-center gap-1.5">
 <Palette className="h-3.5 w-3.5 text-primary" />
 <h3 className="text-sm font-semibold">تم برنامه</h3>
 </div>
 <p className="text-xs text-muted-foreground">
 حالت نمایش را انتخاب کنید
 </p>
 <div className="grid grid-cols-3 gap-2 pt-1">
 <ThemeRadioCard
 active={theme === "light"}
 onClick={() => setTheme("light")}
 icon={Sun}
 label="روشن"
 preview="light"
 />
 <ThemeRadioCard
 active={theme === "dark"}
 onClick={() => setTheme("dark")}
 icon={Moon}
 label="تاریک"
 preview="dark"
 />
 <ThemeRadioCard
 active={theme === "system"}
 onClick={() => setTheme("system")}
 icon={Monitor}
 label="سیستم"
 preview="system"
 />
 </div>
 </div>

 {/* ----- اندازه قلم ----- */}
 <div className="space-y-2">
 <div className="flex items-center gap-1.5">
 <Type className="h-3.5 w-3.5 text-primary" />
 <h3 className="text-sm font-semibold">اندازه قلم</h3>
 <HelpTip name="FONT_SIZE" />
 </div>
 <p className="text-xs text-muted-foreground">
 اندازه فونت رابط کاربری — بلافاصله اعمال می‌شود
 </p>
 <div className="grid grid-cols-3 gap-2 pt-1">
 <FontRadioCard
 active={fontSize === "sm"}
 onClick={() => applyFontSize("sm")}
 label="کوچک"
 sampleSize="text-xs"
 />
 <FontRadioCard
 active={fontSize === "md"}
 onClick={() => applyFontSize("md")}
 label="متوسط"
 sampleSize="text-sm"
 badge="پیش‌فرض"
 />
 <FontRadioCard
 active={fontSize === "lg"}
 onClick={() => applyFontSize("lg")}
 label="بزرگ"
 sampleSize="text-base"
 />
 </div>
 </div>

 {/* ----- تراکم نمایش ----- */}
 <div className="space-y-2">
 <div className="flex items-center gap-1.5">
 <Layout className="h-3.5 w-3.5 text-primary" />
 <h3 className="text-sm font-semibold">تراکم نمایش</h3>
 <HelpTip name="DENSITY" />
 </div>
 <p className="text-xs text-muted-foreground">
 فاصله بین ردیف‌ها و المان‌ها — بلافاصله اعمال می‌شود
 </p>
 <div className="grid grid-cols-2 gap-2 pt-1">
 <DensityRadioCard
 active={density === "comfortable"}
 onClick={() => applyDensity("comfortable")}
 label="راحت"
 description="فاصله استاندارد"
 badge="پیش‌فرض"
 spacing="comfortable"
 />
 <DensityRadioCard
 active={density === "compact"}
 onClick={() => applyDensity("compact")}
 label="فشرده"
 description="نمایش بیشتر در صفحه"
 spacing="compact"
 />
 </div>
 </div>

 {/* ----- پیش‌نمایش زنده ----- */}
 <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2">
 <p className="font-medium text-foreground text-xs">پیش‌نمایش</p>
 <p className="text-muted-foreground leading-relaxed text-[13px]">
 این متن با اندازه قلم فعلی نمایش داده می‌شود. تنظیمات قالب بلافاصله
 اعمال می‌شوند و در بازدید بعدی شما به‌خاطر سپرده می‌شوند.
 </p>
 <div className="flex gap-2 pt-1">
 <Button size="sm" className="h-7 text-xs">دکمه اصلی</Button>
 <Button size="sm" variant="outline" className="h-7 text-xs">دکمه فرعی</Button>
 <Badge variant="secondary" className="h-7 text-xs">
 نمونه بج
 </Badge>
 </div>
 </div>

 {/* ذخیره‌سازی قالب بلافاصله در localStorage اعمال می‌شود — دکمه فقط بازخورد صادقانه */}
 <SaveButton
 onSave={() =>
 toast({
 title: "تنظیمات قالب ذخیره شد",
 description: "اندازه قلم، تراکم و تم شما ذخیره شد.",
 })
 }
 saving={false}
 />
 </TabsContent>

 {/* ===== میانبرها ===== */}
 <TabsContent value="shortcuts" className="space-y-3 mt-0">
 <div>
 <h3 className="text-sm font-semibold">میانبرهای صفحه‌کلید</h3>
 <p className="text-xs text-muted-foreground">
 برای کارایی بیشتر از میانبرها استفاده کنید
 </p>
 </div>
 <div className="rounded-lg border overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-muted/40 text-xs text-muted-foreground text-right">
 <th className="font-medium px-3 py-2">عملیات</th>
 <th className="font-medium px-3 py-2 text-left">میانبر</th>
 </tr>
 </thead>
 <tbody>
 {SHORTCUTS.map((s, i) => (
 <tr key={i} className="border-t border-border/40">
 <td className="px-3 py-2 text-xs">{s.desc}</td>
 <td className="px-3 py-2 text-left">
 <kbd className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono">
 {s.keys}
 </kbd>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="text-[11px] text-muted-foreground pt-2">
 برای نمایش این راهنما در هر زمان، کلید <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">?</kbd> را فشار دهید.
 </p>
 </TabsContent>

 {/* ===== انتقال داده ===== */}
 <TabsContent value="migration" className="space-y-4 mt-0">
 <div className="flex items-start gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
 <Rocket className="h-5 w-5" />
 </div>
 <div className="flex-1 min-w-0">
 <h3 className="text-sm font-semibold text-foreground">
 انتقال داده از نرم‌افزار دیگر
 </h3>
 <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
 اگر از نرم‌افزارهای هلو، سپیدار، پارسیان، رافع، پارمیس یا فایل
 Excel/CSV استفاده می‌کنید، می‌توانید داده‌های مشتریان، کالا و
 فاکتورهای خود را به‌سادگی به هوش منتقل کنید.
 </p>
 </div>
 </div>
 <MigrationTabContent />
 </TabsContent>
 </div>
 </Tabs>

 {/* فوتر */}
 <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2 bg-muted/20">
 <Button variant="outline" onClick={() => onOpenChange(false)}>
 بستن
 </Button>
 {activeTab!== "shortcuts" && activeTab!== "migration" && (
 <Button onClick={handleTabSave} disabled={isSaving} className="gap-1.5">
 {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
 ذخیره تغییرات
 </Button>
 )}
 </div>
 {/* دیالوگ انتخاب تم ظاهری — از تب قالب باز می‌شود */}
 <ThemePicker open={themePickerOpen} onOpenChange={setThemePickerOpen} />
 </DialogContent>
 </Dialog>
 );
}

function SaveButton({
 onSave,
 saving,
}: {
 onSave: () => void;
 saving: boolean;
}) {
 return (
 <div className="pt-3 border-t flex justify-end">
 <Button onClick={onSave} disabled={saving} size="sm" className="gap-1.5">
 {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
 ذخیره
 </Button>
 </div>
 );
}

function NotifRow({
 icon: Icon,
 label,
 desc,
 checked,
 onChange,
}: {
 icon: typeof Mail;
 label: string;
 desc?: string;
 checked: boolean;
 onChange: () => void;
}) {
 return (
 <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
 <div className="flex items-start gap-2">
 <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
 <div>
 <p className="text-xs font-medium">{label}</p>
 {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
 </div>
 </div>
 <Switch checked={checked} onCheckedChange={onChange} />
 </div>
 );
}

function ThemeButton({
 active,
 onClick,
 icon: Icon,
 label,
}: {
 active: boolean;
 onClick: () => void;
 icon: typeof Sun;
 label: string;
}) {
 // پشتیبانی برای سازگاری با کد قبلی؛ در UI جدید از ThemeRadioCard استفاده می‌شود
 return (
 <button
 onClick={onClick}
 className={cn(
 "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors",
 active
? "border-primary bg-primary/5 text-primary"
: "border-border hover:bg-muted/50 text-muted-foreground"
 )}
 >
 <Icon className="h-4 w-4" />
 <span className="text-[11px] font-medium">{label}</span>
 </button>
 );
}

// اطمینان از استفاده‌نشدن export نشده‌ی ThemeButton در lint — صرفاً برای سازگاری
void ThemeButton;

/**
 * ThemeRadioCard — کارت رادیویی برای انتخاب تم با پیش‌نمایش بصری
 */
function ThemeRadioCard({
 active,
 onClick,
 icon: Icon,
 label,
 preview,
}: {
 active: boolean;
 onClick: () => void;
 icon: typeof Sun;
 label: string;
 preview: "light" | "dark" | "system";
}) {
 return (
 <button
 type="button"
 onClick={onClick}
 aria-pressed={active}
 className={cn(
 "group relative flex flex-col gap-2 rounded-lg border p-2.5 transition-all text-right",
 active
? "border-primary ring-2 ring-primary/20 bg-primary/5"
: "border-border hover:bg-muted/50 hover:border-primary/30"
 )}
 >
 {/* پیش‌نمایش بصری */}
 <div
 className={cn(
 "h-12 w-full rounded-md border overflow-hidden flex",
 preview === "dark"
? "bg-zinc-900 border-zinc-700"
: preview === "system"
? "bg-gradient-to-r from-white to-zinc-900 border-border"
: "bg-white border-zinc-200"
 )}
 aria-hidden="true"
 >
 <div
 className={cn(
 "w-1/3 border-l flex items-center justify-center",
 preview === "dark"
? "border-zinc-700"
: preview === "system"
? "border-zinc-300"
: "border-zinc-200"
 )}
 >
 <Icon
 className={cn(
 "h-3.5 w-3.5",
 preview === "dark"? "text-zinc-300": "text-zinc-500"
 )}
 />
 </div>
 <div className="flex-1 flex flex-col justify-center gap-1 p-1.5">
 <div
 className={cn(
 "h-1 w-3/4 rounded-full",
 preview === "dark"? "bg-zinc-600": "bg-zinc-300"
 )}
 />
 <div
 className={cn(
 "h-1 w-1/2 rounded-full",
 preview === "dark"? "bg-zinc-700": "bg-zinc-200"
 )}
 />
 </div>
 </div>
 <div className="flex items-center justify-between gap-1">
 <span
 className={cn(
 "text-[11px] font-medium",
 active? "text-primary": "text-foreground"
 )}
 >
 {label}
 </span>
 {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
 </div>
 </button>
 );
}

/**
 * FontRadioCard — کارت رادیویی برای انتخاب اندازه قلم با پیش‌نمایش زنده
 */
function FontRadioCard({
 active,
 onClick,
 label,
 sampleSize,
 badge,
}: {
 active: boolean;
 onClick: () => void;
 label: string;
 sampleSize: "text-xs" | "text-sm" | "text-base";
 badge?: string;
}) {
 return (
 <button
 type="button"
 onClick={onClick}
 aria-pressed={active}
 className={cn(
 "group relative flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all text-right",
 active
? "border-primary ring-2 ring-primary/20 bg-primary/5"
: "border-border hover:bg-muted/50 hover:border-primary/30"
 )}
 >
 {badge && (
 <span className="absolute -top-2 left-2 inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-medium text-primary-foreground">
 {badge}
 </span>
 )}
 <div className="flex h-9 items-center justify-center rounded-md bg-muted/40">
 <span className={cn("font-medium text-foreground tnum", sampleSize)}>
 {toPersianDigits("۱۲۳۴")}
 </span>
 </div>
 <div className="flex items-center justify-between gap-1">
 <span
 className={cn(
 "text-[11px] font-medium",
 active? "text-primary": "text-foreground"
 )}
 >
 {label}
 </span>
 {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
 </div>
 </button>
 );
}

/**
 * DensityRadioCard — کارت رادیویی برای انتخاب تراکم نمایش
 */
function DensityRadioCard({
 active,
 onClick,
 label,
 description,
 badge,
 spacing,
}: {
 active: boolean;
 onClick: () => void;
 label: string;
 description: string;
 badge?: string;
 spacing: "comfortable" | "compact";
}) {
 // پیش‌نمایش ردیف‌های فشرده یا راحت
 const rowGap = spacing === "compact"? "gap-0.5": "gap-1.5";
 return (
 <button
 type="button"
 onClick={onClick}
 aria-pressed={active}
 className={cn(
 "group relative flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all text-right",
 active
? "border-primary ring-2 ring-primary/20 bg-primary/5"
: "border-border hover:bg-muted/50 hover:border-primary/30"
 )}
 >
 {badge && (
 <span className="absolute -top-2 left-2 inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-medium text-primary-foreground">
 {badge}
 </span>
 )}
 <div className={cn("flex h-9 flex-col justify-center", rowGap)}>
 {[0, 1, 2].map((i) => (
 <div
 key={i}
 className={cn(
 "rounded-sm",
 spacing === "compact"
? "h-1.5 bg-muted-foreground/40"
: "h-2 bg-muted-foreground/50"
 )}
 style={{ width: `${100 - i * 12}%` }}
 />
 ))}
 </div>
 <div className="flex items-center justify-between gap-1">
 <div>
 <span
 className={cn(
 "text-[11px] font-medium block",
 active? "text-primary": "text-foreground"
 )}
 >
 {label}
 </span>
 <span className="text-[10px] text-muted-foreground block">
 {description}
 </span>
 </div>
 {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
 </div>
 </button>
 );
}

/* ============ Migration Tab Content ============ */
function MigrationTabContent() {
 const [open, setOpen] = React.useState(false);
 return (
 <>
 <div className="space-y-3">
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
 <div className="rounded-lg border border-border p-3 bg-muted/30">
 <p className="text-[10px] text-muted-foreground">نرم‌افزارهای پشتیبانی‌شده</p>
 <p className="text-sm font-semibold text-foreground mt-1">۶ نرم‌افزار + Excel</p>
 </div>
 <div className="rounded-lg border border-border p-3 bg-muted/30">
 <p className="text-[10px] text-muted-foreground">فرمت‌های ورودی</p>
 <p className="text-sm font-semibold text-foreground mt-1">CSV, XLSX, DB, ZIP</p>
 </div>
 <div className="rounded-lg border border-border p-3 bg-muted/30">
 <p className="text-[10px] text-muted-foreground">نگاشت خودکار فیلدها</p>
 <p className="text-sm font-semibold text-foreground mt-1">با قابلیت ویرایش</p>
 </div>
 </div>
 <div className="rounded-lg border border-border p-4 bg-muted/30">
 <p className="text-xs text-muted-foreground mb-2">برای شروع انتقال، روی دکمه زیر کلیک کنید:</p>
 <Button onClick={() => setOpen(true)} className="gap-1.5 w-full sm:w-auto">
 <Rocket className="h-4 w-4" />
 شروع جادوگر انتقال داده
 </Button>
 </div>
 <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
 <p className="font-medium text-foreground mb-1">راهنمای آماده‌سازی فایل:</p>
 <ul className="list-disc list-inside space-y-0.5 leading-relaxed">
 <li>فایل خروجی نرم‌افزار قبلی را آماده کنید.</li>
 <li>در صورت امکان، فایل را به فرمت CSV یا XLSX تبدیل کنید.</li>
 <li>ستون‌ها باید دارای هدر مشخص باشند (نام، تلفن، کد ملی و...).</li>
 <li>پس از آپلود، می‌توانید نگاشت فیلدها را به‌صورت دستی اصلاح کنید.</li>
 </ul>
 </div>
 </div>
 <MigrationWizard open={open} onOpenChange={setOpen} />
 </>
 );
}

export default SettingsDialog;
