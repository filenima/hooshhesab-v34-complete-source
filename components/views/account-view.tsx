"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
 ArrowRight,
 User as UserIcon,
 Lock,
 ShieldCheck,
 Building2,
 KeyRound,
 Loader2,
 Check,
 Save,
 Power,
 Smartphone,
 Monitor,
 LogOut,
 CalendarClock,
 AlertTriangle,
 Eye,
 EyeOff,
 Copy,
 Trash2,
 Plus,
 UserCog,
 ShieldAlert,
 X,
 Crown,
 QrCode,
 Image as ImageIcon,
 Globe,
 RefreshCw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";
import { useCachedData, scopedKey } from "@/lib/client-cache";
import { ApiKeysView } from "@/components/views/api-keys-view";
import { FileManagerDialog } from "@/components/file-manager-dialog";
import { PLAN_PRICES_TOMAN as PLAN_PRICES, getPlanName } from "@/lib/plans";
import { ReceiptDesignCard } from "@/components/ux/receipt-design-studio";

interface AccountViewProps {
 token: string;
 onBack: () => void;
}

interface ActiveSession {
 id: string;
 deviceName: string;
 ipAddress: string;
 deviceFingerprint: string;
 createdAt: string;
 lastUsedAt: string;
 expiresAt: string;
 isCurrent: boolean;
}

interface LicenseInfo {
 plan: string;
 status: string;
 maxUsers: number;
 maxInvoices: number;
 maxWarehouses?: number;
 features: string[];
 endDate: string | null;
 activatedAt: string | null;
}

interface Profile {
 id: string;
 username: string | null;
 email: string;
 name: string;
 family?: string | null;
 phone?: string | null;
 role: string;
 isDemo: boolean;
 isTrial: boolean;
 trialEndsAt: string | null;
 logoUrl: string | null;
 company?: string | null;
 nationalId?: string | null;
 address?: string | null;
 twoFactorEnabled: boolean;
 lastLogin: string | null;
 lastLoginIp?: string | null;
 createdAt: string;
 tenant: {
 id: string;
 name: string;
 plan: string;
 status: string;
 };
 license: LicenseInfo | null;
 session?: {
 ip: string;
 deviceFingerprint: string;
 };
}

const ROLE_LABELS: Record<string, string> = {
 ADMIN: "مدیر سیستم",
 MANAGER: "مدیر",
 ACCOUNTANT: "حسابدار",
 USER: "کاربر",
};

const PLAN_LABELS: Record<string, string> = {
 starter: "استارتر",
 business: "کسب‌وکار",
 enterprise: "سازمانی",
 accountant: "حسابدار",
};

const PLAN_FEATURES: Record<string, string> = {
 starter: "هسته حسابداری، فاکتورها، انبار، سامانه مودیان",
 business: "تمام ماژول‌ها به‌جز سازمانی، شامل CRM، فروشگاه، حقوق و AI",
 enterprise: "دسترسی کامل به تمام ماژول‌ها و امکانات سازمانی",
 accountant: "هسته، فاکتورها، مالیات، مودیان، حقوق و هوش مصنوعی",
};

// قیمت‌ها از lib/plans.ts خوانده می‌شوند — منبع واحد (PLAN_PRICES_TOMAN)

function statusBadge(status: string) {
 const map: Record<string, string> = {
 active: "bg-success/10 text-success",
 suspended: "bg-warning/10 text-warning",
 ACTIVE: "bg-success/10 text-success",
 SUSPENDED: "bg-warning/10 text-warning",
 EXPIRED: "bg-destructive/10 text-destructive",
 REVOKED: "bg-destructive/10 text-destructive",
 };
 return map[status] || "bg-muted text-muted-foreground";
}

function getInitials(name: string): string {
 if (!name) return "؟";
 const parts = name.trim().split(/\s+/);
 if (parts.length === 1) return parts[0].slice(0, 2);
 return (parts[0][0] || "") + (parts[1][0] || "");
}

// ============ شاخص قدرت رمز ============
function calcPasswordStrength(pwd: string): { score: number; label: string; color: string } {
 if (!pwd) return { score: 0, label: "—", color: "bg-muted" };
 let score = 0;
 if (pwd.length >= 8) score++;
 if (pwd.length >= 12) score++;
 if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
 if (/[0-9]/.test(pwd)) score++;
 if (/[^a-zA-Z0-9]/.test(pwd)) score++;

 if (score <= 1) return { score: 25, label: "ضعیف", color: "bg-destructive" };
 if (score <= 3) return { score: 60, label: "متوسط", color: "bg-warning" };
 return { score: 100, label: "قوی", color: "bg-success" };
}

export function AccountView({ token, onBack }: AccountViewProps) {
 const { toast } = useToast();
 // FIX(21-C — کش SWR): پروفایل از کش «همان لحظه» رندر می‌شود (بازگشت آنی به
 // این تب) و در پس‌زمینه بی‌صدا تازه می‌شود؛ اسپینر فقط اولین بازدید است.
 const profileCache = useCachedData<Profile>(
 scopedKey("account_profile", token),
 async () => {
 const res = await fetch("/api/auth/me", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در دریافت پروفایل");
 return data.data as Profile;
 }
 );
 const profile = profileCache.data;
 const loading = profileCache.loading; // فقط اولین بازدیدِ بدون کش
 // refresh «عمدی» (پس از ذخیره پروفایل/۲FA/رمز) → فرم‌ها هم دوباره sync شوند؛
 // به‌روزرسانی خاموشِ پس‌زمینه فرم را دست نمی‌زند تا ویرایش نیمه‌کاره کاربر نپرد.
 const syncFormsRef = React.useRef(true);
 const profileRefresh = profileCache.refresh; // پایدار (useCallback داخلی)
 const refreshProfile = React.useCallback(() => {
 syncFormsRef.current = true;
 profileRefresh();
 }, [profileRefresh]);

 // فرم پروفایل
 const [name, setName] = React.useState("");
 const [family, setFamily] = React.useState("");
 const [email, setEmail] = React.useState("");
 const [company, setCompany] = React.useState("");
 const [nationalId, setNationalId] = React.useState("");
 const [address, setAddress] = React.useState("");
 const [phone, setPhone] = React.useState("");
 const [savingProfile, setSavingProfile] = React.useState(false);

 // آپلود لوگو
 const [uploadingLogo, setUploadingLogo] = React.useState(false);
 const fileInputRef = React.useRef<HTMLInputElement>(null);
 const [fileManagerOpen, setFileManagerOpen] = React.useState(false);

 // اطلاعات ورود — showPwd جای خود را به revealedPwd (FIX 22-B) داده
 const [copiedUser, setCopiedUser] = React.useState(false);
 // دیالوگ‌های تغییر نام کاربری و رمز عبور
 const [usernameDialogOpen, setUsernameDialogOpen] = React.useState(false);
 const [pwdDialogOpen, setPwdDialogOpen] = React.useState(false);

 // تغییر نام کاربری
 const [usernamePwd, setUsernamePwd] = React.useState("");
 const [newUsername, setNewUsername] = React.useState("");
 const [usernameCheck, setUsernameCheck] = React.useState<"idle" | "valid" | "invalid" | "taken">("idle");
 const [savingUsername, setSavingUsername] = React.useState(false);

 // تغییر رمز عبور
 const [curPwd, setCurPwd] = React.useState("");
 const [newPwd, setNewPwd] = React.useState("");
 const [confirmPwd, setConfirmPwd] = React.useState("");
 const [showCur, setShowCur] = React.useState(false);
 const [showNew, setShowNew] = React.useState(false);
 const [savingCreds, setSavingCreds] = React.useState(false);

 // 2FA
 const [twoFA, setTwoFA] = React.useState(false);
 // مراحل 2FA: idle | setup | verifying | enabled | disabled
 const [twoFAStep, setTwoFAStep] = React.useState<"idle" | "setup" | "verifying" | "backupCodes">("idle");
 const [twoFASecret, setTwoFASecret] = React.useState("");
 const [twoFAQrUrl, setTwoFAQrUrl] = React.useState("");
 const [twoFAToken, setTwoFAToken] = React.useState("");
 const [twoFABackupCodes, setTwoFABackupCodes] = React.useState<string[]>([]);
 const [twoFALoading, setTwoFALoading] = React.useState(false);
 // برای غیرفعال‌سازی
 const [disablePwd, setDisablePwd] = React.useState("");
 const [disabling2FA, setDisabling2FA] = React.useState(false);

 // نشست‌های فعال
 const [sessions, setSessions] = React.useState<ActiveSession[]>([]);
 const [sessionsLoading, setSessionsLoading] = React.useState(false);
 const [revokingAll, setRevokingAll] = React.useState(false);

 // حذف حساب
 const [deleteOpen, setDeleteOpen] = React.useState(false);
 const [deleteConfirm, setDeleteConfirm] = React.useState("");
 const [deletingAccount, setDeletingAccount] = React.useState(false);

 // هدایت به صفحه‌ی قیمت‌گذاری — از طریق رویداد سفارشی که در app-shell.tsx شنود می‌شود.
 // توجه: این useCallback باید قبل از هرگونه early return باشد (Rules of Hooks).
 const goToPricing = React.useCallback(() => {
 if (typeof window === "undefined") return;
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate-link", {
 detail: { view: "pricing" },
 })
 );
 toast({
 title: "انتقال به قیمت‌گذاری",
 description: "برای ارتقای حساب، یکی از پلن‌ها را انتخاب کنید.",
 });
 }, [toast]);

 // همگام‌سازی فرم‌ها با داده‌ی پروفایل — فقط اولین داده و refreshهای عمدی
 React.useEffect(() => {
 if (!profile) return;
 if (!syncFormsRef.current) return;
 syncFormsRef.current = false;
 setName(profile.name || "");
 setFamily(profile.family || "");
 setEmail(profile.email || "");
 setCompany(profile.company || "");
 setNationalId(profile.nationalId || "");
 setAddress(profile.address || "");
 setPhone(profile.phone || "");
 setTwoFA(profile.twoFactorEnabled || false);
 }, [profile]);

 // بارگذاری نشست‌های فعال
 const loadSessions = React.useCallback(async () => {
 setSessionsLoading(true);
 try {
 const res = await fetch("/api/auth/sessions", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setSessions(data.data || []);
 } catch {
 // خطای silent — نشست‌ها گزینه‌ای است
 } finally {
 setSessionsLoading(false);
 }
 }, [token]);

 React.useEffect(() => {
 void loadSessions();
 }, [loadSessions]);

 // ============ 2FA Setup ============
 const startTwoFASetup = async () => {
 setTwoFALoading(true);
 try {
 const res = await fetch("/api/auth/2fa/setup", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setTwoFASecret(data.data.secret);
 setTwoFAQrUrl(data.data.qrCodeUrl);
 setTwoFABackupCodes(data.data.backupCodes || []);
 setTwoFAStep("setup");
 toast({
 title: "تنظیمات 2FA آغاز شد",
 description: "کد QR را با اپ Authenticator اسکن کنید.",
 });
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در تنظیم 2FA",
 variant: "destructive",
 });
 } finally {
 setTwoFALoading(false);
 }
 };

 // نمایش فرم تأیید کد TOTP
 const proceedToVerify = () => {
 setTwoFAStep("verifying");
 setTwoFAToken("");
 };

 // فعال‌سازی نهایی 2FA با تأیید کد
 const enableTwoFA = async () => {
 if (!twoFAToken || twoFAToken.length < 6) {
 toast({
 title: "کد ناقص",
 description: "کد ۶ رقمی را از اپ Authenticator وارد کنید.",
 variant: "destructive",
 });
 return;
 }
 setTwoFALoading(true);
 try {
 const res = await fetch("/api/auth/2fa/enable", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ token: twoFAToken }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setTwoFA(true);
 setTwoFABackupCodes(data.data.backupCodes || []);
 setTwoFAStep("backupCodes");
 toast({
 title: "2FA فعال شد",
 description: "کدهای پشتیبان را در جای امن ذخیره کنید.",
 });
 refreshProfile(); // FIX(21-C): refresh پس‌زمینه با کش
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "کد نادرست است",
 variant: "destructive",
 });
 } finally {
 setTwoFALoading(false);
 }
 };

 // غیرفعال‌سازی 2FA
 const disableTwoFA = async () => {
 if (!disablePwd) {
 toast({
 title: "رمز عبور الزامی است",
 variant: "destructive",
 });
 return;
 }
 setDisabling2FA(true);
 try {
 const res = await fetch("/api/auth/2fa/disable", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ password: disablePwd }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 setTwoFA(false);
 setDisablePwd("");
 setTwoFAStep("idle");
 setTwoFASecret("");
 setTwoFAQrUrl("");
 setTwoFABackupCodes([]);
 toast({
 title: "2FA غیرفعال شد",
 description: "احراز هویت دو مرحله‌ای غیرفعال شد.",
 });
 refreshProfile(); // FIX(21-C): refresh پس‌زمینه با کش
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در غیرفعال‌سازی",
 variant: "destructive",
 });
 } finally {
 setDisabling2FA(false);
 }
 };

 const cancelTwoFASetup = () => {
 setTwoFAStep("idle");
 setTwoFASecret("");
 setTwoFAQrUrl("");
 setTwoFAToken("");
 setTwoFABackupCodes([]);
 };

 // ============ مدیریت نشست‌ها ============
 const revokeSession = async (sessionId: string) => {
 try {
 const res = await fetch("/api/auth/sessions", {
 method: "DELETE",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ sessionId }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "نشست ابطال شد",
 description: data.message || "نشست با موفقیت پایان یافت.",
 });
 await loadSessions();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ابطال نشست",
 variant: "destructive",
 });
 }
 };

 const revokeAllSessions = async () => {
 setRevokingAll(true);
 try {
 const res = await fetch("/api/auth/sessions/revoke-all", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "تمام نشست‌ها ابطال شدند",
 description: data.message,
 });
 await loadSessions();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ابطال نشست‌ها",
 variant: "destructive",
 });
 } finally {
 setRevokingAll(false);
 }
 };

 // ============ آپلود لوگو ============
 const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 if (!file.type.startsWith("image/")) {
 toast({ title: "فایل نامعتبر", description: "فقط تصویر مجاز است.", variant: "destructive" });
 return;
 }
 if (file.size > 2 * 1024 * 1024) {
 toast({ title: "حجم زیاد", description: "حداکثر حجم ۲ مگابایت.", variant: "destructive" });
 return;
 }

 setUploadingLogo(true);
 const uploadController = new AbortController();
 const uploadTimeoutId = window.setTimeout(() => uploadController.abort(), 60_000);
 try {
 const formData = new FormData();
 formData.append("logo", file);
 const res = await fetch("/api/user/upload-logo", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}` },
 body: formData,
 signal: uploadController.signal,
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error || "خطا در آپلود");
 toast({ title: "لوگو آپلود شد", description: "تصویر پروفایل به‌روزرسانی شد." });
 refreshProfile(); // FIX(21-C): refresh پس‌زمینه با کش
 } catch (e) {
 if (e instanceof DOMException && e.name === "AbortError") {
 toast({
 title: "خطا",
 description: "آپلود بیش از حد طول کشید. دوباره تلاش کنید.",
 variant: "destructive",
 });
 } else {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در آپلود",
 variant: "destructive",
 });
 }
 } finally {
 window.clearTimeout(uploadTimeoutId);
 setUploadingLogo(false);
 if (fileInputRef.current) fileInputRef.current.value = "";
 }
 };

 // ============ انتخاب آواتار از FileManager ============
 const handleAvatarSelect = async (url: string) => {
 setUploadingLogo(true);
 try {
 const res = await fetch("/api/user/profile", {
 method: "PATCH",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify({ logoUrl: url }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "آواتار به‌روزرسانی شد", description: "تصویر پروفایل شما تغییر کرد." });
 refreshProfile(); // FIX(21-C): refresh پس‌زمینه با کش
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در به‌روزرسانی آواتار",
 variant: "destructive",
 });
 } finally {
 setUploadingLogo(false);
 }
 };

 // ============ ذخیره پروفایل ============
 const saveProfile = async () => {
 setSavingProfile(true);
 try {
 const body: Record<string, string> = {};
 if (name!== (profile?.name || "")) body.name = name;
 if (family!== (profile?.family || "")) body.family = family;
 if (email!== (profile?.email || "")) body.email = email;
 if (company!== (profile?.company || "")) body.company = company;
 if (nationalId!== (profile?.nationalId || "")) body.nationalId = nationalId;
 if (address!== (profile?.address || "")) body.address = address;
 if (phone!== (profile?.phone || "")) body.phone = phone;
 if (Object.keys(body).length === 0) {
 toast({ title: "تغییری نیست", description: "هیچ فیلدی تغییر نکرده است." });
 return;
 }
 const res = await fetch("/api/user/profile", {
 method: "PATCH",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify(body),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({ title: "ذخیره شد", description: "پروفایل به‌روزرسانی شد." });
 refreshProfile(); // FIX(21-C): refresh پس‌زمینه با کش
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در ذخیره",
 variant: "destructive",
 });
 } finally {
 setSavingProfile(false);
 }
 };

 // ============ اعتبارسنجی نام کاربری ============
 React.useEffect(() => {
 if (!newUsername) {
 setUsernameCheck("idle");
 return;
 }
 const regex = /^[a-zA-Z0-9_]{3,30}$/;
 if (!regex.test(newUsername)) {
 setUsernameCheck("invalid");
 return;
 }
 if (newUsername === profile?.username) {
 setUsernameCheck("valid");
 return;
 }
 // شبیه‌سازی بررسی یکتایی (در سمت سرور انجام می‌شود)
 setUsernameCheck("valid");
 }, [newUsername, profile?.username]);

 // ============ تغییر نام کاربری ============
 const changeUsername = async () => {
 if (!usernamePwd) {
 toast({ title: "رمز فعلی الزامی است", variant: "destructive" });
 return;
 }
 if (usernameCheck!== "valid") {
 toast({ title: "نام کاربری نامعتبر", description: "۳ تا ۳۰ کاراکتر، حروف انگلیسی/عدد/زیرخط.", variant: "destructive" });
 return;
 }
 if (newUsername === profile?.username) {
 toast({ title: "تغییری نیست", description: "نام کاربری جدید با مقدار فعلی یکی است." });
 return;
 }
 setSavingUsername(true);
 try {
 const res = await fetch("/api/user/change-username", {
 method: "POST",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify({ currentPassword: usernamePwd, newUsername }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "نام کاربری تغییر کرد",
 description: "از این پس با نام کاربری جدید می‌توانید وارد شوید.",
 });
 setUsernamePwd("");
 setNewUsername("");
 refreshProfile(); // FIX(21-C): refresh پس‌زمینه با کش
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در تغییر نام کاربری",
 variant: "destructive",
 });
 } finally {
 setSavingUsername(false);
 }
 };

 // ============ تغییر رمز عبور ============
 const changeCredentials = async () => {
 if (!curPwd) {
 toast({ title: "رمز فعلی الزامی است", variant: "destructive" });
 return;
 }
 if (newPwd.length < 8) {
 toast({ title: "رمز کوتاه", description: "رمز جدید حداقل ۸ کاراکتر باشد.", variant: "destructive" });
 return;
 }
 if (newPwd!== confirmPwd) {
 toast({ title: "عدم تطابق", description: "رمز جدید و تکرار آن یکی نیستند.", variant: "destructive" });
 return;
 }
 setSavingCreds(true);
 try {
 const res = await fetch("/api/user/change-credentials", {
 method: "POST",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
 });
 const data = await res.json();
 if (!res.ok ||!data.success) throw new Error(data?.error);
 toast({
 title: "اطلاعات حساب به‌روزرسانی شد",
 description: "رمز عبور با موفقیت تغییر کرد.",
 });
 setCurPwd("");
 setNewPwd("");
 setConfirmPwd("");
 refreshProfile(); // FIX(21-C): refresh پس‌زمینه با کش
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در تغییر اطلاعات",
 variant: "destructive",
 });
 } finally {
 setSavingCreds(false);
 }
 };

 const copyUsername = async () => {
 if (!profile?.username) return;
 try {
 await navigator.clipboard.writeText(profile.username);
 setCopiedUser(true);
 toast({ title: "کپی شد", description: "نام کاربری کپی شد." });
 setTimeout(() => setCopiedUser(false), 2000);
 } catch {
 toast({ title: "خطا در کپی", variant: "destructive" });
 }
 };

 // ===== FIX(22-B): نمایش/کپی رمز عبور واقعی =====
 // رمز به‌صورت AES-256-GCM رمزنگاری‌شده در سرور ذخیره می‌شود و با این درخواست
 // (rate-limit + AuditLog) برای مالک حساب آشکار می‌شود.
 const [revealedPwd, setRevealedPwd] = React.useState<string | null>(null);
 const [revealingPwd, setRevealingPwd] = React.useState(false);
 const [copiedPwd, setCopiedPwd] = React.useState(false);

 const handleRevealPassword = async () => {
 if (revealedPwd) {
 // توقف نمایش — دکمه بعدی مخفی می‌کند
 setRevealedPwd(null);
 return;
 }
 if (!token) {
 toast({ title: "ابتدا وارد شوید", variant: "destructive" });
 return;
 }
 setRevealingPwd(true);
 try {
 const res = await fetch("/api/account/reveal-password", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 });
 const json = await res.json();
 if (res.ok && json.success) {
 setRevealedPwd(json.data.password);
 toast({
 title: "رمز عبور نمایش داده شد",
 description: "برای امنیت، بعد از کپی دوباره پنهانش کنید.",
 });
 } else {
 toast({
 title: "نمایش رمز ممکن نیست",
 description: json.error || "خطا در دریافت رمز",
 variant: "destructive",
 });
 }
 } catch {
 toast({ title: "خطای شبکه", variant: "destructive" });
 } finally {
 setRevealingPwd(false);
 }
 };

 const copyPassword = async () => {
 if (!revealedPwd) return;
 try {
 await navigator.clipboard.writeText(revealedPwd);
 setCopiedPwd(true);
 toast({ title: "کپی شد", description: "رمز عبور کپی شد." });
 setTimeout(() => setCopiedPwd(false), 2000);
 } catch {
 // Fallback موبایل
 try {
 const ta = document.createElement("textarea");
 ta.value = revealedPwd;
 ta.style.position = "fixed";
 ta.style.opacity = "0";
 document.body.appendChild(ta);
 ta.select();
 document.execCommand("copy");
 document.body.removeChild(ta);
 setCopiedPwd(true);
 toast({ title: "کپی شد", description: "رمز عبور کپی شد." });
 setTimeout(() => setCopiedPwd(false), 2000);
 } catch {
 toast({ title: "خطا در کپی — متن قابل انتخاب است", variant: "destructive" });
 }
 }
 };

 const pwdStrength = calcPasswordStrength(newPwd);

 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center bg-background">
 <div className="flex items-center gap-2 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin" />
 در حال بارگذاری...
 </div>
 </div>
 );
 }

 if (!profile) {
 return (
 <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
 <AlertTriangle className="h-8 w-8 text-warning" />
 <p className="text-sm text-muted-foreground">پروفایل یافت نشد</p>
 <Button variant="outline" size="sm" onClick={onBack}>
 بازگشت
 </Button>
 </div>
 );
 }

 const trialDaysLeft = profile.trialEndsAt
? Math.max(0, Math.ceil((new Date(profile.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
: 0;

 return (
 <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
 {/* هدر */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto max-w-5xl flex h-14 items-center gap-3 px-4">
 <Button variant="ghost" size="sm" className="h-9" onClick={onBack}>
 <ArrowRight className="h-4 w-4" />
 بازگشت به اپ
 </Button>
 <div className="ms-auto flex items-center gap-2">
 <Button
 size="sm"
 className="h-9 gap-1.5"
 onClick={goToPricing}
 data-tour="account-upgrade"
 >
 <Crown className="h-4 w-4" />
 <span className="hidden sm:inline">ارتقای حساب</span>
 <span className="sm:hidden">ارتقا</span>
 </Button>
 <Badge variant="outline" className="text-[10px]">
 {ROLE_LABELS[profile.role] || profile.role}
 </Badge>
 </div>
 </div>
 </header>

 <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 space-y-5">
 {/* کارت هویت + آپلود لوگو */}
 <motion.div
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.25 }}
 >
 <Card className="card-hover overflow-hidden">
 <div className="relative h-24 bg-gradient-to-br from-primary/10 via-accent to-primary/5 border-b border-border">
 <div className="absolute inset-0 opacity-40" style={{
 backgroundImage: "radial-gradient(circle at 80% 50%, rgba(79,70,229,0.15), transparent 50%)",
 }} />
 </div>
 <CardContent className="p-5 -mt-10 relative">
 <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
 <div className="relative">
 <Avatar className="h-20 w-20 ring-4 ring-card shadow-md">
 {profile.logoUrl? (
 <AvatarImage src={profile.logoUrl} alt="logo" />
 ): null}
 <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
 {getInitials(profile.name)}
 </AvatarFallback>
 </Avatar>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/*"
 onChange={handleLogoUpload}
 className="hidden"
 />
 <Button
 size="sm"
 variant="secondary"
 className="absolute -bottom-1 -end-1 h-7 w-7 rounded-full p-0 shadow-md"
 onClick={() => setFileManagerOpen(true)}
 disabled={uploadingLogo}
 aria-label="تغییر تصویر پروفایل"
 data-tour="avatar-change"
 >
 {uploadingLogo? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <ImageIcon className="h-3.5 w-3.5" />
 )}
 </Button>
 </div>
 <div className="flex-1 min-w-0 pb-1">
 <h1 className="text-lg font-bold text-foreground">
 {profile.name} {profile.family || ""}
 </h1>
 <p className="text-xs text-muted-foreground truncate" dir="ltr">{profile.email}</p>
 <div className="flex flex-wrap items-center gap-2 mt-2">
 <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
 {ROLE_LABELS[profile.role] || profile.role}
 </Badge>
 <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
 <Building2 className="h-3 w-3" />
 {profile.tenant.name}
 </Badge>
 <Badge variant="secondary" className={`text-[10px] ${statusBadge(profile.tenant.status)}`}>
 {profile.tenant.status === "active"? "فعال": "معلق"}
 </Badge>
 {profile.isTrial && (
 <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">
 <CalendarClock className="h-3 w-3" />
 تریال
 </Badge>
 )}
 </div>
 </div>
 <div className="text-end space-y-1">
 <p className="text-[10px] text-muted-foreground">عضو از</p>
 <p className="text-xs font-medium tnum">
 {toJalali(new Date(profile.createdAt))}
 </p>
 {profile.lastLogin && (
 <>
 <p className="text-[10px] text-muted-foreground mt-2">آخرین ورود</p>
 <p className="text-xs tnum">{toJalali(new Date(profile.lastLogin))}</p>
 </>
 )}
 </div>
 </div>
 {profile.logoUrl && (
 <p className="text-[10px] text-muted-foreground mt-2">
 برای تغییر تصویر پروفایل، روی دکمه تصویر کلیک کنید تا گالری فایل‌ها باز شود.
 </p>
 )}
 </CardContent>
 </Card>
 </motion.div>

 {/* گرید اصلی: پروفایل + اطلاعات ورود */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* ویرایش پروفایل */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <UserIcon className="h-4 w-4 text-primary" />
 ویرایش پروفایل
 </CardTitle>
 <CardDescription className="text-xs">اطلاعات شخصی و شرکت خود را به‌روز کنید</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1.5">
 <Label htmlFor="acc-name" className="text-xs">نام</Label>
 <Input
 id="acc-name"
 value={name}
 onChange={(e) => setName(e.target.value)}
 className="h-9"
 placeholder="نام"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="acc-family" className="text-xs">نام خانوادگی</Label>
 <Input
 id="acc-family"
 value={family}
 onChange={(e) => setFamily(e.target.value)}
 className="h-9"
 placeholder="نام خانوادگی"
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="acc-email" className="text-xs">ایمیل</Label>
 <Input
 id="acc-email"
 type="email"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 className="h-9"
 dir="ltr"
 placeholder="example@domain.com"
 />
 <p className="text-[10px] text-muted-foreground">
 ایمیل برای ورود، بازیابی رمز و دریافت اعلان‌ها استفاده می‌شود.
 </p>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="acc-company" className="text-xs">نام شرکت</Label>
 <Input
 id="acc-company"
 value={company}
 onChange={(e) => setCompany(e.target.value)}
 className="h-9"
 placeholder="نام شرکت / کسب‌وکار"
 />
 </div>
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1.5">
 <Label htmlFor="acc-nid" className="text-xs">شناسه ملی</Label>
 <Input
 id="acc-nid"
 value={nationalId}
 onChange={(e) => setNationalId(e.target.value)}
 className="h-9"
 dir="ltr"
 placeholder="شناسه ملی شرکت"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="acc-phone" className="text-xs">شماره تماس</Label>
 <Input
 id="acc-phone"
 value={phone}
 onChange={(e) => setPhone(e.target.value)}
 className="h-9"
 dir="ltr"
 placeholder="۰۹۱۲۳۴۵۶۷۸۹"
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="acc-address" className="text-xs">آدرس</Label>
 <Input
 id="acc-address"
 value={address}
 onChange={(e) => setAddress(e.target.value)}
 className="h-9"
 placeholder="آدرس کامل"
 />
 </div>
 {/* اشاره به آواتار از طریق گالری فایل‌ها */}
 <div className="rounded-md bg-muted/40 border border-border p-2.5 flex items-center gap-2">
 <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="text-[11px] font-medium">تصویر پروفایل</p>
 <p className="text-[10px] text-muted-foreground">
 برای تغییر تصویر، از دکمه تصویر در کارت بالا استفاده کنید.
 </p>
 </div>
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-7 text-[11px] shrink-0"
 onClick={() => setFileManagerOpen(true)}
 >
 <ImageIcon className="h-3 w-3" />
 انتخاب از گالری
 </Button>
 </div>
 <Button size="sm" onClick={saveProfile} disabled={savingProfile} className="w-full">
 {savingProfile? (
 <><Loader2 className="h-4 w-4 animate-spin" /> در حال ذخیره...</>
 ): (
 <><Save className="h-4 w-4" /> ذخیره تغییرات</>
 )}
 </Button>
 </CardContent>
 </Card>

 {/* اطلاعات ورود — نمایش برجسته نام کاربری و رمز عبور */}
 <Card className="border-primary/20">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <KeyRound className="h-4 w-4 text-primary" />
 اطلاعات ورود
 </CardTitle>
 <CardDescription className="text-xs">
 نام کاربری و رمز عبور حساب کاربری شما — برای تغییر، روی دکمه‌های مربوطه کلیک کنید.
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 {/* نمایش نام کاربری */}
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center justify-between">
 <span>نام کاربری</span>
 {profile.username? (
 <Badge variant="outline" className="text-[9px] text-success border-success/30 bg-success/5">
 <Check className="h-2.5 w-2.5" />
 تنظیم‌شده
 </Badge>
 ): (
 <Badge variant="outline" className="text-[9px] text-warning border-warning/30 bg-warning/5">
 تنظیم نشده
 </Badge>
 )}
 </Label>
 <div className="flex items-center gap-2">
 <div className="flex-1 relative">
 <UserCog className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 value={profile.username || "— بدون نام کاربری —"}
 readOnly
 className="ps-9 pe-9 h-10 font-mono bg-muted/40 text-sm"
 dir="ltr"
 />
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-10 w-10 p-0"
 onClick={copyUsername}
 disabled={!profile.username}
 aria-label="کپی نام کاربری"
 >
 {copiedUser? (
 <Check className="h-4 w-4 text-success" />
 ): (
 <Copy className="h-4 w-4" />
 )}
 </Button>
 </div>
 {!profile.username && (
 <p className="text-[10px] text-muted-foreground">
 می‌توانید برای ورود راحت‌تر، یک نام کاربری تنظیم کنید.
 </p>
 )}
 </div>

 {/* نمایش رمز عبور — FIX(22-B): نمایش/کپی واقعی با رمزنگاری AES سرور */}
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center justify-between">
 <span>رمز عبور</span>
 <Badge variant="outline" className="text-[9px] text-success border-success/30 bg-success/5">
 <Lock className="h-2.5 w-2.5" />
 رمزنگاری‌شده
 </Badge>
 </Label>
 <div className="flex items-center gap-2">
 <div className="relative flex-1 min-w-0">
 <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 type={revealedPwd? "text": "password"}
 value={revealedPwd?? "••••••••"}
 readOnly
 className="ps-9 pe-9 h-10 bg-muted/40 text-sm font-mono select-all"
 dir="ltr"
 />
 <button
 type="button"
 onClick={handleRevealPassword}
 disabled={revealingPwd}
 className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded disabled:opacity-50"
 aria-label={revealedPwd? "پنهان کردن رمز": "نمایش رمز"}
 title={revealedPwd? "پنهان کردن رمز": "نمایش رمز"}
 >
 {revealingPwd? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): revealedPwd? (
 <EyeOff className="h-3.5 w-3.5" />
 ): (
 <Eye className="h-3.5 w-3.5" />
 )}
 </button>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="h-10 w-10 p-0 shrink-0"
 onClick={copyPassword}
 disabled={!revealedPwd}
 aria-label="کپی رمز عبور"
 title="کپی رمز عبور"
 >
 {copiedPwd? (
 <Check className="h-4 w-4 text-success" />
 ): (
 <Copy className="h-4 w-4" />
 )}
 </Button>
 </div>
 {revealedPwd? (
 <div className="rounded-md bg-success/5 border border-success/25 p-2 mt-1 space-y-1">
 <p className="text-[10px] text-success leading-relaxed flex items-center gap-1">
 <Eye className="h-3 w-3" />
 رمز شما نمایش داده شده — بعد از کپی، با همان دکمه پنهانش کنید.
 </p>
 </div>
 ): (
 <p className="text-[10px] text-muted-foreground">
 روی آیکون چشم بزنید تا رمز عبور واقعی نمایش داده شود و قابل کپی باشد.
 </p>
 )}
 </div>

 <Separator />

 {/* دکمه‌های تغییر نام کاربری و رمز عبور */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 <Button
 variant="outline"
 size="sm"
 className="h-10"
 onClick={() => {
 setUsernamePwd("");
 setNewUsername("");
 setUsernameCheck("idle");
 setUsernameDialogOpen(true);
 }}
 >
 <UserCog className="h-4 w-4" />
 تغییر نام کاربری
 </Button>
 <Button
 size="sm"
 className="h-10"
 onClick={() => {
 setCurPwd("");
 setNewPwd("");
 setConfirmPwd("");
 setPwdDialogOpen(true);
 }}
 >
 <ShieldCheck className="h-4 w-4" />
 تغییر رمز عبور
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* دیالوگ تغییر نام کاربری */}
 <Dialog
 open={usernameDialogOpen}
 onOpenChange={(o) => {
 setUsernameDialogOpen(o);
 if (!o) {
 setUsernamePwd("");
 setNewUsername("");
 setUsernameCheck("idle");
 }
 }}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <UserCog className="h-4 w-4 text-primary" />
 تغییر نام کاربری
 </DialogTitle>
 <DialogDescription className="text-xs">
 برای تغییر نام کاربری، رمز فعلی خود را وارد کنید.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="space-y-1.5">
 <Label className="text-[11px] text-muted-foreground">نام کاربری فعلی</Label>
 <Input
 value={profile.username || "—"}
 readOnly
 className="h-9 font-mono bg-muted/40"
 dir="ltr"
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="username-pwd" className="text-[11px] text-muted-foreground">
 رمز فعلی (برای امنیت)
 </Label>
 <div className="relative">
 <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 id="username-pwd"
 type={showCur? "text": "password"}
 value={usernamePwd}
 onChange={(e) => setUsernamePwd(e.target.value)}
 className="ps-9 pe-9 h-9"
 dir="ltr"
 placeholder="رمز فعلی"
 autoFocus
 />
 <button
 type="button"
 onClick={() => setShowCur((s) =>!s)}
 className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
 aria-label="نمایش/پنهان"
 >
 {showCur? <EyeOff className="h-3.5 w-3.5" />: <Eye className="h-3.5 w-3.5" />}
 </button>
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="new-username" className="text-[11px] text-muted-foreground">
 نام کاربری جدید (۳ تا ۳۰ کاراکتر، حروف انگلیسی/عدد/زیرخط)
 </Label>
 <Input
 id="new-username"
 value={newUsername}
 onChange={(e) => setNewUsername(e.target.value)}
 className="h-9 font-mono"
 dir="ltr"
 placeholder="new_username"
 />
 {usernameCheck === "invalid" && (
 <p className="text-[10px] text-destructive">قالب نامعتبر است</p>
 )}
 {usernameCheck === "valid" && newUsername!== profile.username && (
 <p className="text-[10px] text-success">نام کاربری معتبر به نظر می‌رسد</p>
 )}
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setUsernameDialogOpen(false)}
 disabled={savingUsername}
 >
 <X className="h-4 w-4" />
 انصراف
 </Button>
 <Button
 size="sm"
 onClick={changeUsername}
 disabled={
 savingUsername ||
 usernameCheck!== "valid" ||
!usernamePwd ||
 newUsername === profile.username
 }
 >
 {savingUsername? (
 <><Loader2 className="h-4 w-4 animate-spin" /> در حال تغییر...</>
 ): (
 <><Check className="h-4 w-4" /> ثبت تغییر</>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* دیالوگ تغییر رمز عبور */}
 <Dialog
 open={pwdDialogOpen}
 onOpenChange={(o) => {
 setPwdDialogOpen(o);
 if (!o) {
 setCurPwd("");
 setNewPwd("");
 setConfirmPwd("");
 }
 }}
 >
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <ShieldCheck className="h-4 w-4 text-primary" />
 تغییر رمز عبور
 </DialogTitle>
 <DialogDescription className="text-xs">
 رمز قوی حداقل ۸ کاراکتر و شامل حروف بزرگ/کوچک، عدد و نماد باشد.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div className="space-y-1.5">
 <Label htmlFor="cur-pwd" className="text-xs">رمز فعلی</Label>
 <div className="relative">
 <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 id="cur-pwd"
 type={showCur? "text": "password"}
 value={curPwd}
 onChange={(e) => setCurPwd(e.target.value)}
 className="ps-9 pe-9 h-9"
 dir="ltr"
 placeholder="رمز فعلی"
 autoFocus
 />
 <button
 type="button"
 onClick={() => setShowCur((s) =>!s)}
 className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
 aria-label="نمایش/پنهان"
 >
 {showCur? <EyeOff className="h-3.5 w-3.5" />: <Eye className="h-3.5 w-3.5" />}
 </button>
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="new-pwd" className="text-xs">رمز جدید</Label>
 <div className="relative">
 <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 id="new-pwd"
 type={showNew? "text": "password"}
 value={newPwd}
 onChange={(e) => setNewPwd(e.target.value)}
 className="ps-9 pe-9 h-9"
 dir="ltr"
 placeholder="حداقل ۸ کاراکتر"
 />
 <button
 type="button"
 onClick={() => setShowNew((s) =>!s)}
 className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
 aria-label="نمایش/پنهان"
 >
 {showNew? <EyeOff className="h-3.5 w-3.5" />: <Eye className="h-3.5 w-3.5" />}
 </button>
 </div>
 {/* شاخص قدرت رمز */}
 <div className="space-y-1">
 <div className="h-1.5 rounded-full bg-muted overflow-hidden">
 <div
 className={`h-full rounded-full transition-all ${pwdStrength.color}`}
 style={{ width: `${pwdStrength.score}%` }}
 />
 </div>
 <div className="flex items-center justify-between">
 <p className="text-[10px] text-muted-foreground">قدرت رمز</p>
 <Badge
 variant="secondary"
 className={`text-[10px] ${
 pwdStrength.label === "قوی"
? "bg-success/10 text-success"
: pwdStrength.label === "متوسط"
? "bg-warning/10 text-warning"
: pwdStrength.label === "ضعیف"
? "bg-destructive/10 text-destructive"
: "bg-muted text-muted-foreground"
 }`}
 >
 {pwdStrength.label}
 </Badge>
 </div>
 </div>
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="conf-pwd" className="text-xs">تکرار رمز جدید</Label>
 <Input
 id="conf-pwd"
 type="password"
 value={confirmPwd}
 onChange={(e) => setConfirmPwd(e.target.value)}
 className="h-9"
 dir="ltr"
 placeholder="تکرار رمز جدید"
 />
 {confirmPwd && confirmPwd!== newPwd && (
 <p className="text-[10px] text-destructive">رمزها مطابقت ندارند</p>
 )}
 {confirmPwd && confirmPwd === newPwd && newPwd.length >= 8 && (
 <p className="text-[10px] text-success">رمزها مطابقت دارند</p>
 )}
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setPwdDialogOpen(false)}
 disabled={savingCreds}
 >
 <X className="h-4 w-4" />
 انصراف
 </Button>
 <Button
 size="sm"
 onClick={changeCredentials}
 disabled={savingCreds ||!curPwd ||!newPwd ||!confirmPwd}
 >
 {savingCreds? (
 <><Loader2 className="h-4 w-4 animate-spin" /> در حال به‌روزرسانی...</>
 ): (
 <><ShieldCheck className="h-4 w-4" /> به‌روزرسانی رمز عبور</>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* v33-b: استودیوی «طرح رسید فاکتور» — قالب/اندازه/رنگ رسید + اطلاعات کسب‌وکار
 (جایگزین کارت برندینگ قبلی — همان فیلدها + تنظیمات طرح رسید، بدون تکرار) */}
 <ReceiptDesignCard />

 {/* دامنه اختصاصی (۲۱-e) — ثبت و تأیید مالکیت با DNS */}
 <CustomDomainCard token={token} />

 {/* امنیت و نشست‌ها */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <ShieldCheck className="h-4 w-4 text-primary" />
 امنیت حساب
 </CardTitle>
 <CardDescription className="text-xs">احراز هویت دو مرحله‌ای و نشست‌های فعال</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div>
 <div className="flex items-center justify-between gap-2 mb-3">
 <div className="min-w-0">
 <p className="text-xs font-medium">احراز هویت دو مرحله‌ای (2FA)</p>
 <p className="text-[10px] text-muted-foreground">افزایش امنیت با کد یک‌بار مصرف هنگام ورود</p>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <Badge
 variant="secondary"
 className={`text-[10px] ${twoFA? "bg-success/10 text-success": "bg-muted text-muted-foreground"}`}
 >
 {twoFA? "فعال": "غیرفعال"}
 </Badge>
 </div>
 </div>

 {/* حالت idle: دکمه فعال‌سازی یا غیرفعال‌سازی */}
 {twoFAStep === "idle" &&!twoFA && (
 <Button
 size="sm"
 variant="outline"
 className="w-full"
 onClick={startTwoFASetup}
 disabled={twoFALoading}
 >
 {twoFALoading? (
 <><Loader2 className="h-4 w-4 animate-spin" /> در حال آماده‌سازی...</>
 ): (
 <><QrCode className="h-4 w-4" /> فعال‌سازی احراز هویت دو مرحله‌ای</>
 )}
 </Button>
 )}

 {/* حالت idle با 2FA فعال: فرم غیرفعال‌سازی */}
 {twoFAStep === "idle" && twoFA && (
 <div className="space-y-2">
 <div className="rounded-lg bg-success/5 border border-success/20 p-3 flex items-center gap-2">
 <Check className="h-4 w-4 text-success shrink-0" />
 <p className="text-[11px] text-success leading-relaxed">
 احراز هویت دو مرحله‌ای فعال است. هنگام ورود، علاوه بر رمز عبور، کد یک‌بار مصرف از اپ Authenticator نیاز است.
 </p>
 </div>
 <div className="flex gap-2">
 <Input
 type="password"
 value={disablePwd}
 onChange={(e) => setDisablePwd(e.target.value)}
 placeholder="رمز عبور فعلی"
 className="h-9 flex-1"
 dir="ltr"
 />
 <Button
 size="sm"
 variant="outline"
 className="text-destructive border-destructive/30 hover:bg-destructive/5 shrink-0"
 onClick={disableTwoFA}
 disabled={disabling2FA ||!disablePwd}
 >
 {disabling2FA? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <><Power className="h-4 w-4" /> غیرفعال‌سازی</>
 )}
 </Button>
 </div>
 </div>
 )}

 {/* مرحله setup: نمایش QR code + secret */}
 {twoFAStep === "setup" && (
 <div className="space-y-3">
 <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-col items-center gap-3">
 <p className="text-xs font-medium text-center">کد QR را با اپ Authenticator اسکن کنید</p>
 <div className="bg-white p-3 rounded-lg">
 <QRCodeSVG
 value={twoFAQrUrl}
 size={180}
 level="M"
 includeMargin={false}
 />
 </div>
 <div className="w-full">
 <p className="text-[10px] text-muted-foreground text-center mb-1">
 یا کلید زیر را به‌صورت دستی وارد کنید:
 </p>
 <div className="flex items-center gap-2">
 <code
 className="flex-1 text-[10px] font-mono bg-muted px-2 py-1.5 rounded text-center break-all"
 dir="ltr"
 >
 {twoFASecret}
 </code>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0 shrink-0"
 onClick={() => {
 navigator.clipboard.writeText(twoFASecret);
 toast({ title: "کپی شد", description: "کلید مخفی کپی شد." });
 }}
 >
 <Copy className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>
 </div>
 <div className="flex gap-2">
 <Button
 size="sm"
 variant="outline"
 className="flex-1"
 onClick={cancelTwoFASetup}
 >
 <X className="h-4 w-4" /> انصراف
 </Button>
 <Button
 size="sm"
 className="flex-1"
 onClick={proceedToVerify}
 >
 <Check className="h-4 w-4" /> اسکن کردم
 </Button>
 </div>
 </div>
 )}

 {/* مرحله verifying: ورود کد TOTP */}
 {twoFAStep === "verifying" && (
 <div className="space-y-3">
 <div className="rounded-lg bg-muted/40 border border-border p-3">
 <p className="text-xs mb-2">کد ۶ رقمی نمایش‌داده‌شده در اپ Authenticator را وارد کنید:</p>
 <Input
 value={twoFAToken}
 onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
 placeholder="000000"
 className="h-11 text-center text-lg font-mono tracking-[0.5em] tnum"
 dir="ltr"
 inputMode="numeric"
 autoFocus
 />
 </div>
 <div className="flex gap-2">
 <Button
 size="sm"
 variant="outline"
 className="flex-1"
 onClick={() => setTwoFAStep("setup")}
 >
 <ArrowRight className="h-4 w-4" /> بازگشت
 </Button>
 <Button
 size="sm"
 className="flex-1"
 onClick={enableTwoFA}
 disabled={twoFALoading || twoFAToken.length < 6}
 >
 {twoFALoading? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <><ShieldCheck className="h-4 w-4" /> فعال‌سازی</>
 )}
 </Button>
 </div>
 </div>
 )}

 {/* مرحله backupCodes: نمایش کدهای پشتیبان */}
 {twoFAStep === "backupCodes" && (
 <div className="space-y-3">
 <div className="rounded-lg bg-warning/5 border border-warning/30 p-3">
 <p className="text-xs font-medium text-warning mb-1">کدهای پشتیبان</p>
 <p className="text-[10px] text-muted-foreground leading-relaxed">
 این کدها را در جای امن ذخیره کنید. در صورت از دست دادن دسترسی به اپ Authenticator،
 می‌توانید هنگام ورود از آن‌ها استفاده کنید. هر کد فقط یک‌بار قابل استفاده است.
 </p>
 </div>
 <div className="grid grid-cols-2 gap-2">
 {twoFABackupCodes.map((code, i) => (
 <div
 key={i}
 className="font-mono text-xs bg-muted/40 border border-border rounded px-2 py-1.5 text-center tnum"
 dir="ltr"
 >
 {code}
 </div>
 ))}
 </div>
 <div className="flex gap-2">
 <Button
 size="sm"
 variant="outline"
 className="flex-1"
 onClick={() => {
 navigator.clipboard.writeText(twoFABackupCodes.join("\n"));
 toast({ title: "کپی شد", description: "کدها در حافظه کپی شدند." });
 }}
 >
 <Copy className="h-4 w-4" /> کپی همه
 </Button>
 <Button
 size="sm"
 className="flex-1"
 onClick={() => {
 setTwoFAStep("idle");
 setTwoFABackupCodes([]);
 }}
 >
 <Check className="h-4 w-4" /> ذخیره کردم
 </Button>
 </div>
 </div>
 )}
 </div>

 <Separator />

 <div>
 <div className="flex items-center justify-between mb-2">
 <p className="text-xs font-medium">نشست‌های فعال</p>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-[11px] text-destructive hover:bg-destructive/5"
 onClick={revokeAllSessions}
 disabled={revokingAll || sessions.filter(s =>!s.isCurrent).length === 0}
 >
 {revokingAll? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <LogOut className="h-3.5 w-3.5" />
 )}
 خروج از همه دستگاه‌ها
 </Button>
 </div>

 {sessionsLoading? (
 <div className="flex items-center justify-center py-4">
 <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
 </div>
 ): sessions.length === 0? (
 <div className="text-center py-4 text-[11px] text-muted-foreground">
 نشست فعالی یافت نشد.
 </div>
 ): (
 <div className="space-y-2 max-h-96 overflow-y-auto ps-1">
 {sessions.map((s) => {
 const isMobile = /Android|iPhone|iPad/i.test(s.deviceName);
 return (
 <div
 key={s.id}
 className={`flex items-center gap-3 p-2.5 rounded-lg border ${
 s.isCurrent
? "border-primary/30 bg-primary/5"
: "border-border bg-muted/30"
 }`}
 >
 <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
 s.isCurrent
? "bg-primary/10 text-primary"
: "bg-muted text-muted-foreground"
 }`}>
 {isMobile? <Smartphone className="h-4 w-4" />: <Monitor className="h-4 w-4" />}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium truncate">
 {s.deviceName}
 {s.isCurrent && <span className="text-primary me-1"> (جاری)</span>}
 </p>
 <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
 <span className="font-mono" dir="ltr">{s.ipAddress}</span>
 <span>•</span>
 <span>آخرین استفاده: {toJalali(new Date(s.lastUsedAt))}</span>
 </div>
 </div>
 <div className="shrink-0">
 {s.isCurrent? (
 <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">
 جاری
 </Badge>
 ): (
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-[11px] text-destructive hover:bg-destructive/5"
 onClick={() => revokeSession(s.id)}
 >
 <LogOut className="h-3.5 w-3.5" />
 خروج
 </Button>
 )}
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </CardContent>
 </Card>

 {/* سازمان و لایسنس */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 سازمان و لایسنس
 </CardTitle>
 <CardDescription className="text-xs">اطلاعات فضای کاری فعلی و اشتراک</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">نام سازمان</p>
 <p className="text-sm font-medium truncate">{profile.tenant.name}</p>
 </div>
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">پلن</p>
 <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
 {PLAN_LABELS[profile.tenant.plan] || profile.tenant.plan}
 </Badge>
 </div>
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1">وضعیت</p>
 <Badge variant="secondary" className={`text-[10px] ${statusBadge(profile.tenant.status)}`}>
 {profile.tenant.status === "active"? "فعال": "معلق"}
 </Badge>
 </div>
 <div className="rounded-lg border border-border bg-muted/30 p-3">
 <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
 <CalendarClock className="h-3 w-3" />
 عضو از
 </p>
 <p className="text-sm font-medium tnum">{toJalali(new Date(profile.createdAt))}</p>
 </div>
 </div>

 {/* جزئیات لایسنس */}
 {profile.license && (
 <>
 <Separator />
 <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 text-primary">
 <KeyRound className="h-3.5 w-3.5" />
 <span className="text-xs font-medium">جزئیات لایسنس</span>
 </div>
 <Badge variant="secondary" className={`text-[10px] ${statusBadge(profile.license.status)}`}>
 {profile.license.status === "ACTIVE"? "فعال": profile.license.status === "SUSPENDED"? "معلق": profile.license.status === "EXPIRED"? "منقضی": profile.license.status}
 </Badge>
 </div>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
 <div>
 <p className="text-[10px] text-muted-foreground">حداکثر کاربران</p>
 <p className="font-medium tnum">{toPersianDigits(profile.license.maxUsers)}</p>
 </div>
 <div>
 <p className="text-[10px] text-muted-foreground">فاکتور/ماه</p>
 <p className="font-medium tnum">{toPersianDigits(profile.license.maxInvoices)}</p>
 </div>
 <div>
 <p className="text-[10px] text-muted-foreground">تاریخ فعال‌سازی</p>
 <p className="font-medium tnum">
 {profile.license.activatedAt? toJalali(new Date(profile.license.activatedAt)): "—"}
 </p>
 </div>
 <div>
 <p className="text-[10px] text-muted-foreground">تاریخ انقضا</p>
 <p className="font-medium tnum">
 {profile.license.endDate? toJalali(new Date(profile.license.endDate)): "نامحدود"}
 </p>
 </div>
 </div>
 {Array.isArray(profile.license.features) && profile.license.features.length > 0 && (
 <div className="flex flex-wrap gap-1.5 pt-1">
 {profile.license.features.map((f) => (
 <Badge key={f} variant="outline" className="text-[10px]">
 <Check className="h-2.5 w-2.5 text-success" />
 {f}
 </Badge>
 ))}
 </div>
 )}
 </div>
 </>
 )}

 {/* تریال فعال — شمارش معکوس */}
 {profile.isTrial && profile.trialEndsAt && (
 <div className="rounded-lg bg-warning/5 border border-warning/30 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
 <CalendarClock className="h-4 w-4" />
 </div>
 <div>
 <p className="text-xs font-medium text-warning">
 دوره تریال شما {trialDaysLeft > 0? `${toPersianDigits(trialDaysLeft)} روز دیگر`: "به پایان رسیده"} اعتبار دارد
 </p>
 <p className="text-[10px] text-muted-foreground">
 پایان تریال: {toJalali(new Date(profile.trialEndsAt))}
 </p>
 </div>
 </div>
 <Button size="sm" variant="default" className="shrink-0" onClick={goToPricing}>
 <Crown className="h-4 w-4" />
 ارتقا به پلن پولی
 </Button>
 </div>
 )}

 <div className="rounded-lg bg-muted/30 border border-border p-3">
 <div className="flex items-center gap-2 text-foreground mb-1">
 <Check className="h-3.5 w-3.5 text-primary" />
 <span className="text-xs font-medium">دسترسی‌های فعال پلن</span>
 </div>
 <p className="text-[10px] text-muted-foreground leading-relaxed">
 {PLAN_FEATURES[profile.tenant.plan] || "—"}
 </p>
 </div>
 </CardContent>
 </Card>

 {/* منطقه خطر */}
 <Card className="border-destructive/30">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2 text-destructive">
 <ShieldAlert className="h-4 w-4" />
 منطقه خطر
 </CardTitle>
 <CardDescription className="text-xs">عملیات حساس و غیرقابل بازگشت</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-border">
 <div>
 <p className="text-xs font-medium">خروج از همه دستگاه‌ها</p>
 <p className="text-[10px] text-muted-foreground">تمام نشست‌های فعال پایان می‌یابد و باید دوباره وارد شوید.</p>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="text-destructive border-destructive/30 hover:bg-destructive/5 shrink-0"
 onClick={revokeAllSessions}
 disabled={revokingAll || sessions.length === 0}
 >
 {revokingAll? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ): (
 <LogOut className="h-4 w-4" />
 )}
 خروج از همه
 </Button>
 </div>

 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
 <div>
 <p className="text-xs font-medium text-destructive">حذف حساب کاربری</p>
 <p className="text-[10px] text-muted-foreground">
 حذف دائمی حساب، سازمان و تمام داده‌ها. این عمل غیرقابل بازگشت است.
 </p>
 </div>
 <Button
 variant="destructive"
 size="sm"
 className="shrink-0"
 onClick={() => {
 setDeleteOpen(true);
 setDeleteConfirm("");
 }}
 >
 <Trash2 className="h-4 w-4" />
 حذف حساب
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* دیالوگ تأیید حذف حساب */}
 <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
 <AlertDialogContent className="max-w-md">
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2 text-base text-destructive">
 <AlertTriangle className="h-5 w-5" />
 تأیید حذف حساب
 </AlertDialogTitle>
 <AlertDialogDescription className="text-xs space-y-2">
 <span className="block">
 این عمل تمام داده‌های شما (فاکتورها، تماس‌ها، گزارش‌ها و تنظیمات) را به‌طور دائمی حذف می‌کند و غیرقابل بازگشت است.
 </span>
 <span className="block">
 برای تأیید، عبارت <code className="font-mono bg-muted px-1.5 py-0.5 rounded">حذف</code> را در کادر زیر وارد کنید:
 </span>
 </AlertDialogDescription>
 </AlertDialogHeader>
 <Input
 value={deleteConfirm}
 onChange={(e) => setDeleteConfirm(e.target.value)}
 placeholder="حذف"
 className="h-9"
 />
 <AlertDialogFooter className="gap-2">
 <AlertDialogCancel className="h-9 text-xs">لغو</AlertDialogCancel>
 <AlertDialogAction
 className="h-9 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
 disabled={deleteConfirm!== "حذف" || deletingAccount}
 onClick={async () => {
 setDeleteOpen(false);
 setDeleteConfirm("");
 setDeletingAccount(true);
 try {
 const res = await fetch("/api/account/delete", {
 method: "DELETE",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify({ confirm: "حذف" }),
 });
 const data = await res.json().catch(() => ({}));
 if (res.ok) {
 toast({
 title: "حذف حساب ثبت شد",
 description: "حساب شما برای حذف علامت‌گذاری شد. پس از ۳۰ روز به‌طور کامل پاک خواهد شد. در این مدت می‌توانید با تماس با پشتیبانی آن را لغو کنید.",
 });
 try {
 localStorage.removeItem("hoshhesab_user_token");
 localStorage.removeItem("hoshhesab_admin_token");
 localStorage.removeItem("hoshhesab_admin_user");
 } catch {
 /* ignore */
 }
 setTimeout(() => {
 if (typeof window!== "undefined") window.location.href = "/";
 }, 2500);
 } else {
 toast({
 title: "خطا در حذف حساب",
 description: data?.error || "لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.",
 variant: "destructive",
 });
 }
 } catch {
 toast({
 title: "خطای ارتباط",
 description: "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
 variant: "destructive",
 });
 } finally {
 setDeletingAccount(false);
 }
 }}
 >
 {deletingAccount? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ): (
 <Trash2 className="h-3.5 w-3.5" />
 )}
 حذف نهایی حساب
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* مدیریت فایل‌ها / گالری تصاویر — برای انتخاب آواتار */}
 <FileManagerDialog
 open={fileManagerOpen}
 onOpenChange={setFileManagerOpen}
 token={token}
 onSelect={handleAvatarSelect}
 title="انتخاب تصویر پروفایل"
 description="از بین تصاویر آپلودشده انتخاب کنید یا تصویر جدیدی آپلود کنید (حداکثر ۵ مگابایت)"
 currentUrl={profile.logoUrl}
 />

 {/* کلیدهای API — SEC-2 */}
 <div className="pt-2">
 <ApiKeysView token={token} />
 </div>
 </main>
 </div>
 );
}

// ============ دامنه اختصاصی (۲۱-e — Feature ③) ============
// کارت ثبت دامنه اختصاصی در حساب کاربری:
// - افزودن دامنه (حداکثر ۵) با اعتبارسنجی فارسی
// - نمایش رکورد TXT تأیید مالکیت با دکمه کپی
// - «بررسی DNS» برای تأیید خودکار مالکیت
// - حذف دامنه
interface DomainRow {
 id: string;
 domain: string;
 status: string;
 isPrimary: boolean;
 dnsTxtRecord: string | null;
 verificationToken: string;
 dnsInstructions?: { txtName: string; txtValue: string; ttl?: number };
 verifiedAt: string | null;
 lastCheckedAt: string | null;
 notes: string | null;
 createdAt: string;
}

const DOMAIN_STATUS_FA: Record<string, { label: string; className: string }> = {
 PENDING: { label: "در انتظار تأیید", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
 VERIFYING: { label: "در حال بررسی", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
 VERIFIED: { label: "تأییدشده", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
 FAILED: { label: "ردشده", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function CustomDomainCard({ token }: { token: string }) {
 const { toast } = useToast();
 const [domains, setDomains] = React.useState<DomainRow[]>([]);
 const [maxDomains, setMaxDomains] = React.useState(5);
 const [loading, setLoading] = React.useState(true);
 const [newDomain, setNewDomain] = React.useState("");
 const [adding, setAdding] = React.useState(false);
 const [busyId, setBusyId] = React.useState<string | null>(null);
 const [copiedId, setCopiedId] = React.useState<string | null>(null);

 const authHeaders = (extra?: Record<string, string>): Record<string, string> => ({
 "Content-Type": "application/json",
 ...(extra || {}),
 ...(token ? { Authorization: `Bearer ${token}` } : {}),
 });

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/domains", { headers: authHeaders() });
 const json = await res.json();
 if (res.ok && json.success) {
 setDomains(Array.isArray(json.data) ? json.data : []);
 if (typeof json.maxDomains === "number") setMaxDomains(json.maxDomains);
 } else {
 setDomains([]);
 }
 } catch {
 setDomains([]);
 } finally {
 setLoading(false);
 }
  
 }, [token]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const addDomain = async () => {
 const domain = newDomain.trim().toLowerCase();
 if (!domain) {
 toast({ title: "خطا", description: "آدرس دامنه را وارد کنید.", variant: "destructive" });
 return;
 }
 setAdding(true);
 try {
 const res = await fetch("/api/domains", {
 method: "POST",
 headers: authHeaders(),
 body: JSON.stringify({ domain }),
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json.error || "خطا در ثبت دامنه");
 toast({
 title: "دامنه ثبت شد",
 description: "حالا رکورد TXT را در DNS دامنه‌تان اضافه کنید و سپس «بررسی DNS» را بزنید.",
 });
 setNewDomain("");
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error ? e.message : "خطا در ثبت دامنه",
 variant: "destructive",
 });
 } finally {
 setAdding(false);
 }
 };

 const verifyDomain = async (id: string) => {
 setBusyId(id);
 try {
 const res = await fetch("/api/domains", {
 method: "POST",
 headers: authHeaders(),
 body: JSON.stringify({ id, action: "verify" }),
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json.error || "خطا در بررسی");
 toast({
 variant: json.verified ? "default" : "destructive",
 title: json.verified ? "دامنه تأیید شد" : "تأیید نشد",
 description: json.message || "نتیجه بررسی DNS",
 });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error ? e.message : "خطا در بررسی DNS",
 variant: "destructive",
 });
 } finally {
 setBusyId(null);
 }
 };

 const deleteDomain = async (id: string, domain: string) => {
 if (!confirm(`دامنه ${domain} حذف شود؟`)) return;
 setBusyId(id);
 try {
 const res = await fetch(`/api/domains?id=${encodeURIComponent(id)}`, {
 method: "DELETE",
 headers: authHeaders(),
 });
 const json = await res.json();
 if (!res.ok || !json.success) throw new Error(json.error || "خطا در حذف");
 toast({ title: "حذف شد", description: json.message || "دامنه حذف شد" });
 await load();
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error ? e.message : "خطا در حذف دامنه",
 variant: "destructive",
 });
 } finally {
 setBusyId(null);
 }
 };

 const copyTxt = async (id: string, value: string) => {
 try {
 await navigator.clipboard.writeText(value);
 setCopiedId(id);
 setTimeout(() => setCopiedId(null), 2000);
 toast({ title: "کپی شد", description: "مقدار رکورد TXT کپی شد" });
 } catch {
 toast({ title: "خطا در کپی", variant: "destructive" });
 }
 };

 return (
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Globe className="h-4 w-4 text-primary" />
 دامنه اختصاصی
 </CardTitle>
 <CardDescription className="text-xs">
 دامنه خودتان (مثل app.example.ir) را ثبت و با یک رکورد DNS مالکیتش را تأیید کنید — حداکثر{" "}
 {toPersianDigits(String(maxDomains))} دامنه
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* فرم افزودن */}
 <div className="flex gap-2">
 <Input
 value={newDomain}
 onChange={(e) => setNewDomain(e.target.value)}
 placeholder="app.example.ir"
 dir="ltr"
 className="h-9 flex-1 font-mono text-xs"
 disabled={adding || domains.length >= maxDomains}
 onKeyDown={(e) => {
 if (e.key === "Enter") void addDomain();
 }}
 />
 <Button
 size="sm"
 className="h-9 shrink-0"
 onClick={() => void addDomain()}
 disabled={adding || !newDomain.trim() || domains.length >= maxDomains}
 >
 {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
 افزودن دامنه
 </Button>
 </div>

 {/* لیست دامنه‌ها */}
 {loading ? (
 <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
 <Loader2 className="h-4 w-4 animate-spin ml-2" />
 در حال بارگذاری دامنه‌ها...
 </div>
 ) : domains.length === 0 ? (
 <div className="rounded-lg border border-dashed border-border p-6 text-center">
 <Globe className="h-6 w-6 text-muted-foreground mx-auto mb-1.5" />
 <p className="text-xs text-muted-foreground">
 هنوز دامنه‌ای ثبت نشده — دامنه کسب‌وکار خود را اضافه کنید تا با برند خودتان به هوش دسترسی داشته باشید
 </p>
 </div>
 ) : (
 <div className="space-y-3">
 {domains.map((d) => {
 const badge = DOMAIN_STATUS_FA[d.status] || {
 label: d.status,
 className: "bg-muted text-muted-foreground",
 };
 const txtName = d.dnsInstructions?.txtName || `_hoosh-verify.${d.domain}`;
 const txtValue = d.dnsTxtRecord || `hoosh-verify=${d.verificationToken}`;
 return (
 <div key={d.id} className="rounded-lg border border-border p-3 space-y-2.5">
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div className="flex items-center gap-1.5 min-w-0">
 {d.isPrimary && (
 <Badge className="text-[9px] h-4 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
 دامنه اصلی
 </Badge>
 )}
 <code className="font-mono text-xs truncate" dir="ltr">
 {d.domain}
 </code>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 <Badge className={`text-[10px] h-5 ${badge.className}`}>{badge.label}</Badge>
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-[10px] gap-1"
 onClick={() => void verifyDomain(d.id)}
 disabled={busyId === d.id || d.status === "VERIFIED"}
 >
 {busyId === d.id ? (
 <Loader2 className="h-3 w-3 animate-spin" />
 ) : (
 <RefreshCw className="h-3 w-3" />
 )}
 بررسی DNS
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-destructive hover:text-destructive"
 onClick={() => void deleteDomain(d.id, d.domain)}
 disabled={busyId === d.id}
 aria-label="حذف دامنه"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>

 {/* دستورالعمل DNS — فقط برای دامنه‌های تأییدنشده */}
 {d.status !== "VERIFIED" && (
 <div className="rounded-md bg-muted/50 border border-border/60 p-2.5 space-y-1.5">
 <p className="text-[10px] text-muted-foreground leading-relaxed">
 این رکورد TXT را در DNS دامنه‌تان اضافه کنید (پنل مدیریت دامنه‌ی ثبت‌کننده):
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
 <div className="flex items-center gap-1.5 min-w-0">
 <span className="text-[10px] text-muted-foreground shrink-0">نام:</span>
 <code className="text-[10px] font-mono text-foreground truncate" dir="ltr">
 {txtName}
 </code>
 </div>
 <div className="flex items-center gap-1.5 min-w-0">
 <span className="text-[10px] text-muted-foreground shrink-0">کد تأیید:</span>
 <code className="text-[10px] font-mono text-foreground truncate" dir="ltr">
 {txtValue}
 </code>
 <Button
 variant="ghost"
 size="sm"
 className="h-5 w-5 p-0 shrink-0"
 onClick={() => void copyTxt(d.id, txtValue)}
 aria-label="کپی کد تأیید"
 >
 {copiedId === d.id ? (
 <Check className="h-3 w-3 text-success" />
 ) : (
 <Copy className="h-3 w-3" />
 )}
 </Button>
 </div>
 </div>
 <p className="text-[10px] text-muted-foreground">
 پس از افزودن رکورد، دکمه «بررسی DNS» را بزنید — انتشار DNS ممکن است تا چند دقیقه (یا ساعت) طول بکشد.
 </p>
 </div>
 )}

 {d.verifiedAt && (
 <p className="text-[10px] text-success">
 تأیید شده در: {toJalali(new Date(d.verifiedAt))}
 </p>
 )}
 {d.status === "FAILED" && d.notes && (
 <p className="text-[10px] text-destructive/80">
 وضعیت: {d.notes.includes("txt_mismatch") ? "مقدار TXT مطابقت ندارد" : "بررسی DNS ناموفق"}
 </p>
 )}
 </div>
 );
 })}
 </div>
 )}
 </CardContent>
 </Card>
 );
}
