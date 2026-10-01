"use client";

import * as React from "react";
import {
 BehavioralTracker,
 type BehavioralProfile,
 type ComparisonResult,
 getGlobalTracker,
} from "@/lib/behavioral-biometrics";

// ============ use-behavioral-tracking ============
// Hook برای ردیابی رفتار کاربر در پس‌زمینه و تشخیص ناهنجاری.
//
// ویژگی‌ها:
// - ثبت خودکار keystroke، mouse movement و scroll
// - مقایسه‌ی مداوم با پروفایل پایه (baseline)
// - گزارش ناهنجاری از طریق callback
// - throttle برای جلوگیری از مصرف بیش از حد CPU
// - throttle نمونه‌گیری ماوس برای کاهش حجم داده

interface UseBehavioralTrackingOptions {
 enabled?: boolean;
 // پروفایل پایه برای مقایسه (اگر null، در حال جمع‌آوری است)
 baselineProfile?: BehavioralProfile | null;
 // فاصله‌ی زمانی بررسی ناهنجاری (ms) — پیش‌فرض ۳۰ ثانیه
 checkIntervalMs?: number;
 // throttle نمونه‌گیری ماوس (ms) — پیش‌فرض ۱۰۰ms
 mouseThrottleMs?: number;
 // فراخوانی هنگام تشخیص ناهنجاری
 onAnomaly?: (result: ComparisonResult, profile: BehavioralProfile) => void;
 // فراخوانی هنگام جمع‌آوری داده‌ی کافی برای ساخت baseline
 onBaselineReady?: (profile: BehavioralProfile) => void;
}

interface UseBehavioralTrackingReturn {
 tracker: BehavioralTracker;
 currentProfile: BehavioralProfile | null;
 lastComparison: ComparisonResult | null;
 isCollectingBaseline: boolean;
 forceCheck: () => ComparisonResult | null;
 resetBaseline: () => void;
}

const BASELINE_STORAGE_KEY = "hoshhesab_behavioral_baseline";
const BASELINE_MIN_EVENTS = 50;

export function useBehavioralTracking(
 options: UseBehavioralTrackingOptions = {}
): UseBehavioralTrackingReturn {
 const {
 enabled = true,
 baselineProfile: providedBaseline,
 checkIntervalMs = 30_000,
 mouseThrottleMs = 100,
 onAnomaly,
 onBaselineReady,
 } = options;

 const tracker = React.useMemo(() => getGlobalTracker(), []);
 const [currentProfile, setCurrentProfile] =
 React.useState<BehavioralProfile | null>(null);
 const [lastComparison, setLastComparison] =
 React.useState<ComparisonResult | null>(null);
 const [isCollectingBaseline, setIsCollectingBaseline] = React.useState(false);

 // بارگذاری baseline از localStorage یا استفاده از baseline ارائه‌شده
 const baselineRef = React.useRef<BehavioralProfile | null>(
 providedBaseline?? null
 );

 React.useEffect(() => {
 if (providedBaseline) {
 baselineRef.current = providedBaseline;
 return;
 }
 // تلاش برای بارگذاری از localStorage
 try {
 const stored = localStorage.getItem(BASELINE_STORAGE_KEY);
 if (stored) {
 const parsed = BehavioralTracker.deserializeProfile(stored);
 if (parsed) {
 baselineRef.current = parsed;
 }
 }
 } catch {
 // ignore
 }
 }, [providedBaseline]);

 // ذخیره‌ی baseline در localStorage
 const saveBaseline = React.useCallback((profile: BehavioralProfile) => {
 baselineRef.current = profile;
 try {
 localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(profile));
 } catch {
 // ignore
 }
 }, []);

 // ذخیره‌ی baseline فعلی (به‌روزرسانی مداوم با profile جدید)
 const resetBaseline = React.useCallback(() => {
 const profile = tracker.getProfile();
 if (profile.totalEvents >= BASELINE_MIN_EVENTS) {
 saveBaseline(profile);
 setIsCollectingBaseline(false);
 } else {
 setIsCollectingBaseline(true);
 }
 }, [tracker, saveBaseline]);

 // ثبت رویدادهای keystroke
 React.useEffect(() => {
 if (!enabled) return;

 const handleKeyDown = (e: KeyboardEvent) => {
 // نادیده گرفتن کلیدهای اصلاحی
 if (e.ctrlKey || e.metaKey || e.altKey) return;
 tracker.trackKeystrokeDown(e.key, Date.now());
 };

 const handleKeyUp = (e: KeyboardEvent) => {
 if (e.ctrlKey || e.metaKey || e.altKey) return;
 tracker.trackKeystroke(e.key, Date.now());
 };

 window.addEventListener("keydown", handleKeyDown, { passive: true });
 window.addEventListener("keyup", handleKeyUp, { passive: true });

 return () => {
 window.removeEventListener("keydown", handleKeyDown);
 window.removeEventListener("keyup", handleKeyUp);
 };
 }, [enabled, tracker]);

 // ثبت رویدادهای ماوس (با throttle)
 React.useEffect(() => {
 if (!enabled) return;

 let lastMouseTime = 0;
 const handleMouseMove = (e: MouseEvent) => {
 const now = Date.now();
 if (now - lastMouseTime < mouseThrottleMs) return;
 lastMouseTime = now;
 tracker.trackMouseMovement(e.clientX, e.clientY, now);
 };

 window.addEventListener("mousemove", handleMouseMove, { passive: true });
 return () => window.removeEventListener("mousemove", handleMouseMove);
 }, [enabled, tracker, mouseThrottleMs]);

 // ثبت رویدادهای اسکرول (با throttle)
 React.useEffect(() => {
 if (!enabled) return;

 let lastScrollTime = 0;
 const handleScroll = () => {
 const now = Date.now();
 if (now - lastScrollTime < 150) return;
 lastScrollTime = now;
 tracker.trackScroll(window.scrollY, now);
 };

 window.addEventListener("scroll", handleScroll, { passive: true });
 return () => window.removeEventListener("scroll", handleScroll);
 }, [enabled, tracker]);

 // بررسی دوره‌ای ناهنجاری
 const forceCheck = React.useCallback((): ComparisonResult | null => {
 const profile = tracker.getProfile();
 setCurrentProfile(profile);

 // اگر baseline نداریم و داده‌ی کافی جمع شده، آن را بساز
 if (!baselineRef.current) {
 if (profile.totalEvents >= BASELINE_MIN_EVENTS) {
 saveBaseline(profile);
 setIsCollectingBaseline(false);
 onBaselineReady?.(profile);
 } else {
 setIsCollectingBaseline(true);
 }
 return null;
 }

 // مقایسه با baseline
 const result = tracker.compareProfile(profile, baselineRef.current);
 setLastComparison(result);

 // در صورت ناهنجاری، callback را فراخوانی کن
 if (!result.match && result.recommendation!== "allow") {
 onAnomaly?.(result, profile);
 }

 // به‌روزرسانی تدریجی baseline (در صورت تطابق)
 if (result.match && result.confidence > 0.85) {
 const blended = blendProfiles(baselineRef.current, profile, 0.05);
 saveBaseline(blended);
 }

 return result;
 }, [tracker, saveBaseline, onAnomaly, onBaselineReady]);

 React.useEffect(() => {
 if (!enabled) return;

 // بررسی اولیه پس از ۱۰ ثانیه
 const initialTimer = setTimeout(() => {
 forceCheck();
 }, 10_000);

 // بررسی دوره‌ای
 const interval = setInterval(() => {
 forceCheck();
 }, checkIntervalMs);

 return () => {
 clearTimeout(initialTimer);
 clearInterval(interval);
 };
 }, [enabled, checkIntervalMs, forceCheck]);

 return {
 tracker,
 currentProfile,
 lastComparison,
 isCollectingBaseline,
 forceCheck,
 resetBaseline,
 };
}

// ترکیب پروفایل قدیم و جدید با وزن (برای به‌روزرسانی تدریجی baseline)
function blendProfiles(
 old: BehavioralProfile,
 current: BehavioralProfile,
 weight: number // 0..1 — سهم profile جدید
): BehavioralProfile {
 const blend = (a: number, b: number) => a * (1 - weight) + b * weight;
 return {
 avgDwellTime: blend(old.avgDwellTime, current.avgDwellTime),
 stdDwellTime: blend(old.stdDwellTime, current.stdDwellTime),
 avgFlightTime: blend(old.avgFlightTime, current.avgFlightTime),
 stdFlightTime: blend(old.stdFlightTime, current.stdFlightTime),
 typingSpeedWPM: blend(old.typingSpeedWPM, current.typingSpeedWPM),
 avgMouseDistance: blend(old.avgMouseDistance, current.avgMouseDistance),
 avgMouseSpeed: blend(old.avgMouseSpeed, current.avgMouseSpeed),
 avgMouseAngle: blend(old.avgMouseAngle, current.avgMouseAngle),
 avgScrollDistance: blend(old.avgScrollDistance, current.avgScrollDistance),
 totalActivityMs: Math.max(old.totalActivityMs, current.totalActivityMs),
 totalEvents: old.totalEvents + current.totalEvents,
 capturedAt: Date.now(),
 };
}
