// ============ Conflict Resolution (3-way merge) ============
// پیاده‌سازی merge سه‌طرفه برای حل تعارض ویرایش‌های همزمان.
//
// سه نسخه دریافت می‌شود:
// - base: نسخه مشترک پایه (آخرین نسخه سرور پیش از ویرایش محلی/ریموت)
// - local: نسخه ویرایش‌شده توسط کاربر فعلی
// - remote: نسخه ویرایش‌شده توسط کاربر دیگر (نسخه جدید سرور)
//
// الگوریتم:
// برای هر فیلد:
// - اگر local و remote یکسان مقدار نهایی همان (تغییری نکرده یا هر دو همان تغییر)
// - اگر local == base و remote!= base فقط remote تغییر کرده مقدار remote
// - اگر remote == base و local!= base فقط local تغییر کرده مقدار local
// - اگر local!= base و remote!= base و local!= remote تعارض (conflict)
// مقدار نهایی: آخرین نسخه (آخرین updatedAt)
//
// نتیجه:
// - resolved: object نهایی ادغام‌شده
// - conflicts: آرایه‌ای از نام فیلدهایی که تعارض داشته‌اند (برای رفع دستی)

export interface ConflictResolutionResult {
 resolved: Record<string, unknown>;
 conflicts: string[];
}

export function resolveConflict(
 local: Record<string, unknown> & { updatedAt?: string | number | Date },
 remote: Record<string, unknown> & { updatedAt?: string | number | Date },
 base: Record<string, unknown>
): ConflictResolutionResult {
 const resolved: Record<string, unknown> = {};
 const conflicts: string[] = [];

 // کلیدهای ممکن از همه سه نسخه
 const allKeys = new Set<string>([
...Object.keys(base || {}),
...Object.keys(local || {}),
...Object.keys(remote || {}),
 ]);

 // تابع کمکی برای دریافت timestamp
 const getTime = (obj: { updatedAt?: string | number | Date }): number => {
 if (!obj.updatedAt) return 0;
 if (obj.updatedAt instanceof Date) return obj.updatedAt.getTime();
 if (typeof obj.updatedAt === "number") return obj.updatedAt;
 return new Date(obj.updatedAt).getTime() || 0;
 };

 const localTime = getTime(local);
 const remoteTime = getTime(remote);

 for (const key of allKeys) {
 if (key === "updatedAt") continue; // این فیلد خودکار مدیریت می‌شود

 const baseVal = base?.[key];
 const localVal = local?.[key];
 const remoteVal = remote?.[key];

 // اگر هر دو تغییر نکرده‌اند
 if (deepEqual(localVal, remoteVal)) {
 resolved[key] = localVal;
 continue;
 }

 // اگر فقط local تغییر کرده (remote == base)
 if (deepEqual(remoteVal, baseVal)) {
 resolved[key] = localVal;
 continue;
 }

 // اگر فقط remote تغییر کرده (local == base)
 if (deepEqual(localVal, baseVal)) {
 resolved[key] = remoteVal;
 continue;
 }

 // تعارض: هر دو تغییر کرده‌اند و مقادیر متفاوت دارند
 // راهکار: آخرین نسخه برنده است
 conflicts.push(key);
 resolved[key] = localTime >= remoteTime? localVal: remoteVal;
 }

 // updatedAt نهایی = max(local, remote)
 resolved.updatedAt = localTime >= remoteTime? local.updatedAt: remote.updatedAt;

 return { resolved, conflicts };
}

/**
 * مقایسه عمیق دو مقدار (deep equality)
 * برای اشیاء و آرایه‌ها به‌صورت بازگشتی مقایسه می‌کند.
 */
function deepEqual(a: unknown, b: unknown): boolean {
 if (a === b) return true;
 if (a == null || b == null) return a == null && b == null;
 if (typeof a!== typeof b) return false;

 if (typeof a === "object") {
 const aIsArr = Array.isArray(a);
 const bIsArr = Array.isArray(b);
 if (aIsArr!== bIsArr) return false;

 if (aIsArr) {
 const arrA = a as unknown[];
 const arrB = b as unknown[];
 if (arrA.length!== arrB.length) return false;
 for (let i = 0; i < arrA.length; i++) {
 if (!deepEqual(arrA[i], arrB[i])) return false;
 }
 return true;
 }

 const objA = a as Record<string, unknown>;
 const objB = b as Record<string, unknown>;
 const keysA = Object.keys(objA);
 const keysB = Object.keys(objB);
 if (keysA.length!== keysB.length) return false;
 for (const k of keysA) {
 if (!deepEqual(objA[k], objB[k])) return false;
 }
 return true;
 }

 return false;
}

/**
 * اعمال کادر تعارض روی فیلد خاص — انتخاب دستی مقدار
 */
export function applyManualChoice(
 resolved: Record<string, unknown>,
 field: string,
 choice: "local" | "remote" | "custom",
 local: Record<string, unknown>,
 remote: Record<string, unknown>,
 custom?: unknown
): Record<string, unknown> {
 const next = {...resolved };
 if (choice === "local") {
 next[field] = local[field];
 } else if (choice === "remote") {
 next[field] = remote[field];
 } else if (choice === "custom" && custom!== undefined) {
 next[field] = custom;
 }
 return next;
}
